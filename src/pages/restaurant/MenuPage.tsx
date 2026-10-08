/**
 * Menu Management — the restaurant's menu for the ACTIVE OUTLET (Prompt #04 §6-§17).
 *
 * The screen never invents its scope: `organizationId` + `propertyId` + `outletId` come from
 * the context store and every read filters on them. With no outlet selected it renders the
 * deliberate "choose an outlet first" state — that is a routing fact about the session, not a
 * claim that the tenant has no menu.
 *
 * Four schema facts decide the UI, and each is visible here rather than hidden:
 *
 *   - A menu has no update door. Name, currency and description are set when it is created,
 *     because a menu whose currency can move is a menu whose price history stops meaning
 *     anything. The header therefore shows them as facts, not as fields.
 *   - Price is not a field of a dish. The row's price comes from the open `menu_item_prices`
 *     row in one list read, and changing it is its own sheet with a mandatory reason —
 *     repricing is an accounting act, not an edit. It is gated on `menu.create`, the same key
 *     that lets a dish exist at a price; that is 014's choice, not a client quirk.
 *   - Availability is not lifecycle. "Sold out tonight" is the switch in the row (`menu.edit`);
 *     "off the menu" is the archive action (`menu.archive`, reason mandatory).
 *   - Section order is a full permutation. The arrows send the whole visible order to
 *     `reorder_menu_categories`, which refuses a list with a row missing or duplicated.
 *
 * Everything worth asserting (scope derivation, form validation, the door-input mapping, the
 * row-action gating, the failure copy) is an exported pure function beside the component.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  BookOpen,
  CircleSlash,
  ListTree,
  LogIn,
  Pencil,
  Plus,
  Settings2,
  Tag,
  UtensilsCrossed,
} from "lucide-react";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { ArchiveDialog } from "@/components/ui/ArchiveDialog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { LoadingBlock } from "@/components/ui/Spinner";
import { SelectInput, type SelectOption } from "@/components/ui/SelectInput";
import { StatusPill } from "@/components/ui/StatusPill";
import { Switch } from "@/components/ui/Switch";
import { TextInput } from "@/components/ui/TextInput";
import { Textarea } from "@/components/ui/Textarea";
import { can, type ActiveContext } from "@/domain/identity/types";
import { formatAdjustmentText, formatMoneyText } from "@/domain/money/money";
import {
  archiveMenuCategory,
  archiveMenuItem,
  archiveModifier,
  archiveModifierGroup,
  createMenu,
  createMenuCategory,
  createMenuItem,
  createModifier,
  createModifierGroup,
  listCategories,
  listItems,
  listMenus,
  listModifierGroups,
  listModifiers,
  listOpenPrices,
  reorderCategories,
  setMenuStatus,
  setMenuItemAvailability,
  setMenuItemPrice,
  updateMenuCategory,
  updateMenuItem,
  updateModifierGroup,
  type ItemRef,
  type MenuRef,
  type MenuScope,
  type NewMenu,
  type NewMenuItem,
  type MenuItemUpdate,
  type NewMenuCategory,
  type MenuCategoryUpdate,
} from "@/domain/restaurant/menu-service";
import type {
  Menu,
  MenuCategory,
  MenuItem,
  MenuItemPrice,
  Modifier,
  ModifierGroup,
  SelectionType,
} from "@/domain/restaurant/types";
import { SELECTION_TYPES } from "@/domain/restaurant/types";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

/* ------------------------------------------------------------------ pure rules */

/** Which surface the screen shows for the session state. */
export type MenuPageView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_outlet"
  | "scoped";

export function pageStatusFor(status: ContextStatus, context: ActiveContext): MenuPageView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null &&
      context.propertyId !== null &&
      context.outletId !== null
      ? "scoped"
      : "no_outlet";
  }
  return "bootstrapping";
}

/** All three ancestors a menu read filters on; null until the session has them. */
export function menuScopeFor(context: ActiveContext): MenuScope | null {
  if (
    context.organizationId === null ||
    context.propertyId === null ||
    context.outletId === null
  ) {
    return null;
  }
  return {
    organizationId: context.organizationId,
    propertyId: context.propertyId,
    outletId: context.outletId,
  };
}

/**
 * The menu the screen opens on: the one already chosen if it is still in the list, otherwise
 * a published menu before a draft, then by name. One menu per outlet is the normal case, and
 * then it selects itself.
 */
export function preferredMenu(
  menus: readonly Menu[],
  preferredId: string | null,
): Menu | null {
  if (menus.length === 0) return null;
  const kept = menus.find((menu) => menu.id === preferredId);
  if (kept !== undefined) return kept;
  return (
    [...menus].sort(
      (a, b) =>
        Number(b.status === "ACTIVE") - Number(a.status === "ACTIVE") ||
        a.name.localeCompare(b.name),
    )[0] ?? null
  );
}

/** 014's own slug rule for `menu_items.type`, mirrored so the field refuses before the door. */
export const MENU_ITEM_TYPE_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;

/** A positive amount with at most two decimals — what a price row accepts. */
export const PRICE_PATTERN = /^\d+(?:\.\d{1,2})?$/;

/** A price delta, which 014 also allows to be negative (a cheaper swap). */
export const ADJUSTMENT_PATTERN = /^-?\d+(?:\.\d{1,2})?$/;

/** Stored money is text and never becomes a float; display is the only rounding point. */
export function priceDisplay(unitPrice: string | null, currency: string): string {
  if (unitPrice === null || unitPrice === "") return "No price";
  return formatMoneyText(unitPrice, currency);
}

/** A modifier's delta reads as what it does to the bill, not as a bare number. */
export function adjustmentDisplay(adjustment: string, currency: string): string {
  return formatAdjustmentText(adjustment, currency);
}

/** The item plus its open price row, which is the unit the list renders. */
export type MenuItemView = {
  item: MenuItem;
  unitPrice: string | null;
};

export function joinPrices(
  items: readonly MenuItem[],
  prices: readonly MenuItemPrice[],
): MenuItemView[] {
  const byItem = new Map<string, string>();
  for (const price of prices) byItem.set(price.menuItemId, price.unitPrice);
  return items.map((item) => ({ item, unitPrice: byItem.get(item.id) ?? null }));
}

/**
 * The sections in their stored order, each with its dishes, and the uncategorised dishes in a
 * trailing group. A dish whose section was archived has `category_id = null` in the database
 * (014 nulls them on archive), so "Unsorted" is a real state rather than a fallback.
 */
export function groupByCategory(
  views: readonly MenuItemView[],
  categories: readonly MenuCategory[],
): { category: MenuCategory | null; items: MenuItemView[] }[] {
  const groups = categories
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((category) => ({
      category: category as MenuCategory | null,
      items: views.filter((view) => view.item.categoryId === category.id),
    }));
  const known = new Set(categories.map((category) => category.id));
  const loose = views.filter(
    (view) => view.item.categoryId === null || !known.has(view.item.categoryId),
  );
  if (loose.length > 0) groups.push({ category: null, items: loose });
  return groups;
}

/**
 * The full permutation the reorder door demands, after moving one id `delta` places. Sending
 * the whole list is the point: a partial diff would let a row that vanished between two reads
 * silently renumber everything under it.
 */
export function moveInOrder(
  ids: readonly string[],
  id: string,
  delta: number,
): string[] | null {
  const from = ids.indexOf(id);
  if (from === -1) return null;
  const to = from + delta;
  if (to < 0 || to >= ids.length) return null;
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return null;
  next.splice(to, 0, moved);
  return next;
}

export type MenuDraft = { name: string; currency: string; description: string };

export function newMenuDraft(): MenuDraft {
  return { name: "", currency: "INR", description: "" };
}

export function validateMenuForm(draft: MenuDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  // 014: `p_name ~ '^.{2,120}$'` — a one-character menu name is refused by the door.
  if (draft.name.trim().length < 2) errors.name = "A menu name is at least 2 characters.";
  if (!/^[A-Z]{3}$/.test(draft.currency.trim())) errors.currency = "Use the 3-letter code, e.g. INR.";
  return errors;
}

export function menuCreateInput(draft: MenuDraft, outletId: string): NewMenu {
  const input: NewMenu = {
    outletId,
    name: draft.name.trim(),
    currency: draft.currency.trim().toUpperCase(),
  };
  if (draft.description.trim() !== "") input.description = draft.description.trim();
  return input;
}

export type CategoryDraft = { name: string; description: string; imageUrl: string };

export function newCategoryDraft(): CategoryDraft {
  return { name: "", description: "", imageUrl: "" };
}

export function categoryDraftFrom(category: MenuCategory): CategoryDraft {
  return {
    name: category.name,
    description: category.description ?? "",
    imageUrl: category.imageUrl ?? "",
  };
}

export function validateCategoryForm(draft: CategoryDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (draft.name.trim() === "") errors.name = "A section name is required.";
  if (draft.imageUrl.trim() !== "" && !/^https?:\/\/\S+$/.test(draft.imageUrl.trim())) {
    errors.imageUrl = "An image must be a full URL, or left empty.";
  }
  return errors;
}

export function categoryCreateInput(draft: CategoryDraft, menuId: string): NewMenuCategory {
  const input: NewMenuCategory = { menuId, name: draft.name.trim() };
  if (draft.description.trim() !== "") input.description = draft.description.trim();
  if (draft.imageUrl.trim() !== "") input.imageUrl = draft.imageUrl.trim();
  return input;
}

/**
 * Update mapping under the blankable-column convention: unchanged fields are OMITTED (the door
 * leaves the column alone), a field the operator cleared is sent as `""` which 014 stores as
 * NULL, and `null` is never sent because these doors read that as "not edited".
 */
export function categoryUpdateInput(
  category: MenuCategory,
  draft: CategoryDraft,
): MenuCategoryUpdate {
  const input: MenuCategoryUpdate = {
    categoryId: category.id,
    expectedVersion: category.version,
  };
  const name = draft.name.trim();
  if (name !== "" && name !== category.name) input.name = name;
  if (draft.description.trim() !== (category.description ?? "")) {
    input.description = draft.description.trim();
  }
  if (draft.imageUrl.trim() !== (category.imageUrl ?? "")) input.imageUrl = draft.imageUrl.trim();
  return input;
}

export type ItemDraft = {
  name: string;
  shortName: string;
  itemCode: string;
  description: string;
  imageUrl: string;
  type: string;
  categoryId: string;
  /** Decimal text. Required for a new dish; an existing one reprices through its own sheet. */
  priceText: string;
  attributesText: string;
  isVegetarian: boolean;
  isNonVegetarian: boolean;
  isEgg: boolean;
  isVegan: boolean;
};

export function newItemDraft(categoryId: string | null): ItemDraft {
  return {
    name: "",
    shortName: "",
    itemCode: "",
    description: "",
    imageUrl: "",
    type: "",
    categoryId: categoryId ?? "",
    priceText: "",
    attributesText: "",
    isVegetarian: false,
    isNonVegetarian: false,
    isEgg: false,
    isVegan: false,
  };
}

export function itemDraftFrom(item: MenuItem): ItemDraft {
  const keys = Object.keys(item.attributes ?? {});
  return {
    name: item.name,
    shortName: item.shortName ?? "",
    itemCode: item.itemCode ?? "",
    description: item.description ?? "",
    imageUrl: item.imageUrl ?? "",
    type: item.type ?? "",
    categoryId: item.categoryId ?? "",
    priceText: "",
    attributesText: keys.length === 0 ? "" : JSON.stringify(item.attributes, null, 2),
    isVegetarian: item.isVegetarian ?? false,
    isNonVegetarian: item.isNonVegetarian ?? false,
    isEgg: item.isEgg ?? false,
    isVegan: item.isVegan ?? false,
  };
}

export type AttributesParse =
  | { ok: true; value: Record<string, unknown> | undefined }
  | { ok: false; error: string };

/**
 * The attributes editor, validated the way the hours editor is: this bag is the outlet's own
 * (§9), so
 *   - blank -> omitted, the door keeps what it holds;
 *   - non-object JSON -> refused;
 *   - an explicit `{}` over a populated bag -> refused, because erasing an outlet's attributes
 *     must not be a side effect of clearing a text box.
 */
export function parseAttributes(
  text: string,
  existing: Record<string, unknown> | null | undefined,
): AttributesParse {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: true, value: undefined };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "Attributes must be valid JSON — for example {\"spice\": \"medium\"}." };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "Attributes must be a JSON object, not a list or a single value." };
  }
  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).length === 0) {
    if (existing && Object.keys(existing).length > 0) {
      return {
        ok: false,
        error: "Leave the field empty to keep the stored attributes — an empty object would erase them.",
      };
    }
    return { ok: true, value: undefined };
  }
  return { ok: true, value: record };
}

export function validateItemForm(
  draft: ItemDraft,
  options: { editing: boolean; existingAttributes?: Record<string, unknown> | null },
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (draft.name.trim() === "") errors.name = "A dish name is required.";
  if (!options.editing) {
    // A new dish must arrive priced, or nothing can be ordered from it (§12).
    if (draft.priceText.trim() === "") errors.priceText = "A price is required.";
    else if (!PRICE_PATTERN.test(draft.priceText.trim())) {
      errors.priceText = "Use a plain amount up to two decimals, e.g. 280 or 280.50.";
    }
  }
  if (draft.type.trim() !== "" && !MENU_ITEM_TYPE_PATTERN.test(draft.type.trim())) {
    errors.type = "Use a lowercase slug: letters, digits and underscores, starting with a letter.";
  }
  if (draft.imageUrl.trim() !== "" && !/^https?:\/\/\S+$/.test(draft.imageUrl.trim())) {
    errors.imageUrl = "An image must be a full URL, or left empty.";
  }
  const attributes = parseAttributes(draft.attributesText, options.existingAttributes ?? null);
  if (!attributes.ok) errors.attributesText = attributes.error;
  return errors;
}

export function itemCreateInput(draft: ItemDraft, menuId: string): NewMenuItem {
  const input: NewMenuItem = {
    menuId,
    name: draft.name.trim(),
    unitPrice: draft.priceText.trim(),
  };
  if (draft.categoryId !== "") input.categoryId = draft.categoryId;
  if (draft.shortName.trim() !== "") input.shortName = draft.shortName.trim();
  if (draft.itemCode.trim() !== "") input.itemCode = draft.itemCode.trim();
  if (draft.description.trim() !== "") input.description = draft.description.trim();
  if (draft.imageUrl.trim() !== "") input.imageUrl = draft.imageUrl.trim();
  if (draft.type.trim() !== "") input.type = draft.type.trim();
  if (draft.isVegetarian) input.isVegetarian = true;
  if (draft.isNonVegetarian) input.isNonVegetarian = true;
  if (draft.isEgg) input.isEgg = true;
  if (draft.isVegan) input.isVegan = true;
  const attributes = parseAttributes(draft.attributesText, null);
  if (attributes.ok && attributes.value !== undefined) input.attributes = attributes.value;
  return input;
}

export function itemUpdateInput(item: MenuItem, draft: ItemDraft): MenuItemUpdate {
  const input: MenuItemUpdate = { itemId: item.id, expectedVersion: item.version };
  const name = draft.name.trim();
  if (name !== "" && name !== item.name) input.name = name;
  if (draft.shortName.trim() !== (item.shortName ?? "")) input.shortName = draft.shortName.trim();
  if (draft.itemCode.trim() !== (item.itemCode ?? "")) input.itemCode = draft.itemCode.trim();
  if (draft.description.trim() !== (item.description ?? "")) {
    input.description = draft.description.trim();
  }
  if (draft.imageUrl.trim() !== (item.imageUrl ?? "")) input.imageUrl = draft.imageUrl.trim();
  if (draft.type.trim() !== (item.type ?? "")) input.type = draft.type.trim();
  // A dish can join a section here, but 014 cannot move one OUT of it: a null `p_category`
  // means "not edited", so the picker offers sections and never a blank.
  if (draft.categoryId !== "" && draft.categoryId !== (item.categoryId ?? "")) {
    input.categoryId = draft.categoryId;
  }
  if (draft.isVegetarian !== (item.isVegetarian ?? false)) input.isVegetarian = draft.isVegetarian;
  if (draft.isNonVegetarian !== (item.isNonVegetarian ?? false)) {
    input.isNonVegetarian = draft.isNonVegetarian;
  }
  if (draft.isEgg !== (item.isEgg ?? false)) input.isEgg = draft.isEgg;
  if (draft.isVegan !== (item.isVegan ?? false)) input.isVegan = draft.isVegan;
  const attributes = parseAttributes(draft.attributesText, item.attributes);
  if (
    attributes.ok &&
    attributes.value !== undefined &&
    JSON.stringify(attributes.value) !== JSON.stringify(item.attributes ?? {})
  ) {
    input.attributes = attributes.value;
  }
  return input;
}

/** The four classification flags are independent nullable facts, not one enum. */
export function flagSummary(item: MenuItem): string {
  const flags: string[] = [];
  if (item.isVegetarian === true) flags.push("Veg");
  if (item.isNonVegetarian === true) flags.push("Non-veg");
  if (item.isEgg === true) flags.push("Egg");
  if (item.isVegan === true) flags.push("Vegan");
  return flags.length === 0 ? "Not classified" : flags.join(" · ");
}

export type PriceDraft = { unitPrice: string; effectiveFrom: string; reason: string };

export function newPriceDraft(): PriceDraft {
  return { unitPrice: "", effectiveFrom: "", reason: "" };
}

/**
 * A repricing is refused rather than half-accepted: 014 demands a reason on this door because
 * the row it closes is the price a past bill was charged at.
 */
export function validatePriceForm(draft: PriceDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!PRICE_PATTERN.test(draft.unitPrice.trim())) {
    errors.unitPrice = "Enter a plain amount up to two decimals, e.g. 320.";
  }
  if (draft.effectiveFrom.trim() !== "" && Number.isNaN(Date.parse(draft.effectiveFrom))) {
    errors.effectiveFrom = "Use a date-time the browser can read, e.g. 2026-10-08T00:00.";
  }
  if (draft.reason.trim().length < 3) errors.reason = "A reason is required and goes to the audit.";
  return errors;
}

export type ModifierGroupDraft = {
  name: string;
  selectionType: SelectionType;
  minSelections: string;
  maxSelections: string;
};

export function newModifierGroupDraft(): ModifierGroupDraft {
  return { name: "", selectionType: "SINGLE", minSelections: "0", maxSelections: "1" };
}

/**
 * The STATIC shape only, which is what 014's own CHECKs assert: min ≤ max, and a SINGLE group
 * caps at exactly one. "This order picked three under a max of two" is refused by the order
 * door in 016 — a menu row cannot see an order that does not exist yet.
 */
export function validateModifierGroupForm(draft: ModifierGroupDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  const min = Number(draft.minSelections);
  const max = Number(draft.maxSelections);
  if (draft.name.trim() === "") errors.name = "A group name is required.";
  if (!Number.isInteger(min) || min < 0) errors.minSelections = "Use a whole number, 0 or more.";
  if (!Number.isInteger(max) || max < 1) errors.maxSelections = "Use a whole number, 1 or more.";
  if (errors.minSelections === undefined && errors.maxSelections === undefined && min > max) {
    errors.maxSelections = "The maximum cannot be below the minimum.";
  }
  if (draft.selectionType === "SINGLE" && max !== 1) {
    errors.maxSelections = "A single-choice group allows exactly one option.";
  }
  return errors;
}

export function selectionTypeOptions(): SelectOption<SelectionType>[] {
  return SELECTION_TYPES.map((type) => ({
    value: type,
    label: type === "SINGLE" ? "Choose one" : "Choose many",
  }));
}

/** An option row inside the sheet, before it is saved. */
export type OptionDraft = { name: string; adjustment: string };

export function validateOptionDraft(draft: OptionDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (draft.name.trim() === "") errors.name = "A choice needs a name.";
  if (draft.adjustment.trim() !== "" && !ADJUSTMENT_PATTERN.test(draft.adjustment.trim())) {
    errors.adjustment = "Use a plain amount up to two decimals; a minus makes it cheaper.";
  }
  return errors;
}

/**
 * A refusal keeps the operator's input and shows the door's own sentence.
 *
 * No copy is chosen by error CODE here: 014 raises a dozen different CONFLICTs — a name another
 * category already holds, a price window that overlaps, a row that moved under the edit — and
 * `db/door-errors.ts` already names each one. Re-overriding them by code would tell an operator
 * "someone changed this row" when the truth is "this dish already exists".
 */
export function submitFailureMessage(error: unknown): string {
  return toPublicError(error).message;
}

/* --------------------------------------------------------------------- screen */

const NO_BACKEND_COPY = "This build has no backend configured, so it cannot read or save data.";

type CategorySheetMode = { kind: "new" } | { kind: "edit"; category: MenuCategory };
type ItemSheetMode =
  | { kind: "new"; categoryId: string | null }
  | { kind: "edit"; item: MenuItem };

/** The five things on this screen that retire rather than delete, each needing a reason. */
type RetireTarget = { id: string; name: string } & (
  | { kind: "menu" }
  | { kind: "category" }
  | { kind: "item" }
  | { kind: "group" }
  | { kind: "modifier" }
);

export default function MenuPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const storeError = useContextStore((s) => s.error);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const scope = useMemo(
    () => menuScopeFor(context),
    // Keyed on the ids so a context object identity change that does not move the scope
    // cannot re-trigger the read.
    [context.organizationId, context.propertyId, context.outletId],
  );

  const canView = can("menu.view", permissions);
  const canCreate = can("menu.create", permissions);
  const canEdit = can("menu.edit", permissions);
  const canArchive = can("menu.archive", permissions);
  const canPublish = can("menu.publish", permissions);

  const [menus, setMenus] = useState<Menu[] | null>(null);
  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[] | null>(null);
  const [prices, setPrices] = useState<MenuItemPrice[]>([]);
  const [childrenLoading, setChildrenLoading] = useState(false);

  const [menuSheet, setMenuSheet] = useState(false);
  const [categorySheet, setCategorySheet] = useState<CategorySheetMode | null>(null);
  const [itemSheet, setItemSheet] = useState<ItemSheetMode | null>(null);
  const [pricingItem, setPricingItem] = useState<MenuItem | null>(null);
  const [optionsItem, setOptionsItem] = useState<MenuItem | null>(null);
  const [retiring, setRetiring] = useState<RetireTarget | null>(null);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || scope === null || !canView) return;
    let ignore = false;
    setMenus(null);
    setListError(null);
    listMenus(scope, showArchived ? { includeArchived: true } : {})
      .then((rows) => {
        if (!ignore) setMenus(rows);
      })
      .catch((error) => {
        if (!ignore) setListError(submitFailureMessage(error));
      });
    return () => {
      ignore = true;
    };
  }, [view, scope, canView, showArchived, reloadTick]);

  const menu = preferredMenu(menus ?? [], selectedMenuId);
  const menuId = menu?.id ?? null;
  const outletId = scope?.outletId ?? null;

  useEffect(() => {
    if (menuId === null || outletId === null) return;
    let ignore = false;
    const ref: MenuRef = { menuId, outletId };
    setChildrenLoading(true);
    setItems(null);
    setListError(null);
    const read = showArchived ? { includeArchived: true } : {};
    Promise.all([
      listCategories(ref, read),
      listItems(ref, read),
      listOpenPrices(ref),
    ])
      .then(([cats, its, prcs]) => {
        if (ignore) return;
        setCategories(cats);
        setItems(its);
        setPrices(prcs);
      })
      .catch((error) => {
        if (!ignore) setListError(submitFailureMessage(error));
      })
      .finally(() => {
        if (!ignore) setChildrenLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [menuId, outletId, showArchived, reloadTick]);

  const reload = useCallback(() => setReloadTick((tick) => tick + 1), []);

  const views = joinPrices(items ?? [], prices);
  const orderedCategoryIds = useMemo(
    () =>
      [...categories]
        .filter((category) => category.status !== "ARCHIVED")
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((category) => category.id),
    [categories],
  );
  const sections = groupByCategory(views, categories);

  const report = (error: unknown) => setActionError(submitFailureMessage(error));

  const changeMenuStatus = async (target: Menu["status"], reason?: string) => {
    if (menu === null) return;
    try {
      await setMenuStatus({ menuId: menu.id, status: target, reason });
      setActionError(null);
      reload();
    } catch (error) {
      report(error);
    }
  };

  const toggleAvailability = async (item: MenuItem, available: boolean) => {
    try {
      await setMenuItemAvailability({ itemId: item.id, available, expectedVersion: item.version });
      setActionError(null);
      reload();
    } catch (error) {
      report(error);
    }
  };

  const moveCategory = async (category: MenuCategory, delta: number) => {
    const next = moveInOrder(orderedCategoryIds, category.id, delta);
    if (next === null) return;
    try {
      await reorderCategories(category.menuId, next);
      setActionError(null);
      reload();
    } catch (error) {
      report(error);
    }
  };

  /** Every retire on this screen is one dialog, and the typed reason is what the door gets. */
  const confirmRetire = async (reason: string) => {
    if (retiring === null) return;
    try {
      if (retiring.kind === "menu" && menu !== null) {
        await setMenuStatus({ menuId: menu.id, status: "ARCHIVED", reason });
      } else if (retiring.kind === "category") {
        await archiveMenuCategory(retiring.id, reason);
      } else if (retiring.kind === "item") {
        await archiveMenuItem(retiring.id, reason);
      } else if (retiring.kind === "group") {
        await archiveModifierGroup(retiring.id, reason);
      } else {
        await archiveModifier(retiring.id, reason);
      }
      setRetiring(null);
      setActionError(null);
      reload();
    } catch (error) {
      setRetiring(null);
      report(error);
    }
  };

  const itemColumns: DataColumn<MenuItemView>[] = [
    {
      key: "item",
      header: "Dish",
      render: ({ item }) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{item.name}</p>
          <p className="truncate text-xs text-muted">
            {item.itemCode ?? item.shortName ?? "No code"}
            {item.type !== null ? ` · ${item.type}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "classification",
      header: "Classified",
      width: "10rem",
      render: ({ item }) => <span className="text-xs text-ink">{flagSummary(item)}</span>,
    },
    {
      key: "price",
      header: "Price",
      align: "right",
      width: "8rem",
      render: ({ unitPrice }) => (
        <span className="money-figure font-medium text-ink">
          {menu !== null ? priceDisplay(unitPrice, menu.currency) : "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "On menu",
      width: "7rem",
      render: ({ item }) => <StatusPill status={item.status} />,
    },
    {
      key: "available",
      header: "Selling",
      width: "9rem",
      render: ({ item }) => (
        <Switch
          checked={item.isAvailable}
          disabled={!canEdit || item.status === "ARCHIVED"}
          onChange={(available) => void toggleAvailability(item, available)}
          label={item.isAvailable ? "Available" : "Sold out"}
          className="text-xs"
        />
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: "17rem",
      render: ({ item }) => (
        <div className="flex flex-wrap items-center gap-1.5">
          {canEdit && item.status !== "ARCHIVED" ? (
            <Button
              size="sm"
              variant="secondary"
              icon={<Pencil className="size-4" aria-hidden />}
              onClick={() => setItemSheet({ kind: "edit", item })}
            >
              Edit
            </Button>
          ) : null}
          {/* Repricing asks `menu.create` — the same key 014 uses to let a dish exist at a
              price, because a reprice closes one price row and opens another. */}
          {canCreate && item.status !== "ARCHIVED" ? (
            <Button
              size="sm"
              variant="secondary"
              icon={<Tag className="size-4" aria-hidden />}
              onClick={() => setPricingItem(item)}
            >
              Price
            </Button>
          ) : null}
          {canEdit || canCreate ? (
            <Button
              size="sm"
              variant="ghost"
              icon={<Settings2 className="size-4" aria-hidden />}
              onClick={() => setOptionsItem(item)}
            >
              Options
            </Button>
          ) : null}
          {canArchive && item.status !== "ARCHIVED" ? (
            <Button
              size="sm"
              variant="ghost"
              icon={<Archive className="size-4" aria-hidden />}
              onClick={() =>
                setRetiring({ kind: "item", id: item.id, name: item.name })
              }
            >
              Archive
            </Button>
          ) : item.status === "ARCHIVED" ? (
            <Badge tone="muted">Retired</Badge>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          <BookOpen className="size-5 shrink-0 text-brand-600" aria-hidden />
          Menu
        </h2>
        <p className="mt-1 text-sm text-muted">
          Sections, dishes, prices and options for the outlet you are working in. Price history
          is kept per dish, so a reprice never restates a bill that already printed.
        </p>
      </header>

      {view === "bootstrapping" && <LoadingBlock label="Loading your workspace…" />}

      {view === "unconfigured" && (
        <EmptyState
          icon={<CircleSlash aria-hidden />}
          title="Backend not configured"
          description={storeError ?? NO_BACKEND_COPY}
        />
      )}

      {view === "unauthenticated" && (
        <EmptyState
          icon={<LogIn aria-hidden />}
          title="Sign in to manage the menu"
          description="There is no active session for this build to read a tenant from."
        />
      )}

      {view === "no_outlet" && (
        <EmptyState
          icon={<UtensilsCrossed aria-hidden />}
          title="Choose an outlet first"
          description="A menu belongs to one outlet — the restaurant, café or bar that sells from
            it. Pick an outlet in the context switcher and this screen reads its menu."
        />
      )}

      {view === "scoped" && !canView && (
        <AccessDenied capability="view the menu" permission="menu.view" />
      )}

      {view === "scoped" && canView && (
        <>
          {menus === null && listError === null ? (
            <LoadingBlock label="Loading menus…" />
          ) : menus !== null && menus.length === 0 ? (
            <Card>
              <EmptyState
                icon={<BookOpen aria-hidden />}
                title="No menu for this outlet yet"
                description="Every dish hangs off one menu, in one currency. Create it and this
                  screen becomes the section-and-dish editor."
                action={
                  canCreate ? (
                    <Button
                      size="sm"
                      variant="primary"
                      icon={<Plus className="size-4" aria-hidden />}
                      onClick={() => setMenuSheet(true)}
                    >
                      Create menu
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          ) : menu !== null ? (
            <>
              <Card
                actions={
                  <div className="flex flex-wrap items-center gap-1.5">
                    {canCreate ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Plus className="size-4" aria-hidden />}
                        onClick={() => setMenuSheet(true)}
                      >
                        New menu
                      </Button>
                    ) : null}
                    {canPublish && menu.status === "ARCHIVED" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<ArchiveRestore className="size-4" aria-hidden />}
                        onClick={() => void changeMenuStatus("DRAFT")}
                      >
                        Restore as draft
                      </Button>
                    ) : null}
                    {canPublish && menu.status !== "ARCHIVED" ? (
                      <Button
                        size="sm"
                        variant={menu.status === "ACTIVE" ? "secondary" : "primary"}
                        onClick={() =>
                          void changeMenuStatus(menu.status === "ACTIVE" ? "DRAFT" : "ACTIVE")
                        }
                      >
                        {menu.status === "ACTIVE" ? "Unpublish" : "Publish"}
                      </Button>
                    ) : null}
                    {canArchive && menu.status !== "ARCHIVED" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Archive className="size-4" aria-hidden />}
                        onClick={() =>
                          setRetiring({ kind: "menu", id: menu.id, name: menu.name })
                        }
                      >
                        Archive
                      </Button>
                    ) : null}
                  </div>
                }
              >
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-ink">{menu.name}</h3>
                    <StatusPill status={menu.status} />
                    <Badge tone="neutral">{menu.currency}</Badge>
                    {menu.description !== null ? (
                      <span className="text-xs text-muted">{menu.description}</span>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted">
                    A menu&rsquo;s name and currency are fixed when it is created: every price row
                    on this menu is written in {menu.currency}, and a currency that could move
                    would make its own history unreadable.
                  </p>
                  {(menus?.length ?? 0) > 1 ? (
                    <Field label="Menu" id="menu-picker" hideLabel>
                      <SelectInput
                        options={menus!.map((row) => ({
                          value: row.id,
                          label:
                            row.status === "ACTIVE"
                              ? row.name
                              : `${row.name} (${row.status.toLowerCase()})`,
                        }))}
                        value={menu.id}
                        onChange={setSelectedMenuId}
                      />
                    </Field>
                  ) : null}
                </div>
              </Card>

              {(listError !== null || actionError !== null) && (
                <p role="status" className="text-xs leading-relaxed text-danger">
                  {listError ?? actionError}
                </p>
              )}

              <Card
                padded={false}
                actions={
                  canCreate ? (
                    <Button
                      size="sm"
                      variant="primary"
                      icon={<Plus className="size-4" aria-hidden />}
                      onClick={() => setItemSheet({ kind: "new", categoryId: null })}
                    >
                      Add dish
                    </Button>
                  ) : undefined
                }
              >
                <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <Switch
                    checked={showArchived}
                    onChange={setShowArchived}
                    label="Show archived"
                    description="Retired sections and dishes are hidden by default; switching this on re-reads with the opt-in."
                  />
                  {canEdit ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<ListTree className="size-4" aria-hidden />}
                      onClick={() => setCategorySheet({ kind: "new" })}
                    >
                      Add section
                    </Button>
                  ) : null}
                </div>

                {childrenLoading || items === null ? (
                  <div className="px-4 pb-5 sm:px-5">
                    <LoadingBlock label="Loading sections and dishes…" />
                  </div>
                ) : sections.length === 0 ? (
                  <EmptyState
                    title="This menu has no dishes yet"
                    description="Add a section to group the menu, then add dishes with their opening
                      price. A dish without a price cannot be ordered, so the door asks for one."
                    action={
                      canCreate ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<Plus className="size-4" aria-hidden />}
                          onClick={() => setItemSheet({ kind: "new", categoryId: null })}
                        >
                          Add dish
                        </Button>
                      ) : undefined
                    }
                  />
                ) : (
                  <div className="flex flex-col gap-5 px-4 pb-5 sm:px-5">
                    {sections.map((section, index) => (
                      <MenuSection
                        key={section.category?.id ?? "unsorted"}
                        section={section}
                        rank={section.category === null ? null : orderedCategoryIds.indexOf(section.category.id)}
                        ranks={orderedCategoryIds.length}
                        firstVisible={index === 0}
                        columns={itemColumns}
                        canEdit={canEdit}
                        canArchive={canArchive}
                        onMove={(delta) => void moveCategory(section.category!, delta)}
                        onRename={() =>
                          setCategorySheet({ kind: "edit", category: section.category! })
                        }
                        onRetire={() =>
                          setRetiring({
                            kind: "category",
                            id: section.category!.id,
                            name: section.category!.name,
                          })
                        }
                      />
                    ))}
                  </div>
                )}
              </Card>
            </>
          ) : null}
        </>
      )}

      {menuSheet && scope !== null ? (
        <MenuSheet
          outletId={scope.outletId}
          onClose={() => setMenuSheet(false)}
          onSaved={() => {
            setMenuSheet(false);
            setSelectedMenuId(null);
            setActionError(null);
            reload();
          }}
        />
      ) : null}

      {categorySheet !== null && menu !== null ? (
        <CategorySheetDialog
          mode={categorySheet}
          menuId={menu.id}
          onClose={() => setCategorySheet(null)}
          onSaved={() => {
            setCategorySheet(null);
            setActionError(null);
            reload();
          }}
        />
      ) : null}

      {itemSheet !== null && menu !== null ? (
        <ItemSheet
          mode={itemSheet}
          menu={menu}
          categories={categories}
          onClose={() => setItemSheet(null)}
          onSaved={() => {
            setItemSheet(null);
            setActionError(null);
            reload();
          }}
        />
      ) : null}

      {pricingItem !== null && menu !== null ? (
        <PriceSheet
          item={pricingItem}
          currency={menu.currency}
          currentPrice={views.find((row) => row.item.id === pricingItem.id)?.unitPrice ?? null}
          onClose={() => setPricingItem(null)}
          onSaved={() => {
            setPricingItem(null);
            setActionError(null);
            reload();
          }}
        />
      ) : null}

      {optionsItem !== null && outletId !== null ? (
        <OptionsSheet
          item={optionsItem}
          outletId={outletId}
          currency={menu?.currency ?? "INR"}
          canCreate={canCreate}
          canEdit={canEdit}
          canArchive={canArchive}
          onClose={() => setOptionsItem(null)}
          onRetire={(target) => setRetiring(target)}
          onChanged={() => {
            setActionError(null);
            reload();
          }}
        />
      ) : null}

      {retiring !== null ? (
        <ArchiveDialog
          open
          onClose={() => setRetiring(null)}
          onConfirm={(reason) => void confirmRetire(reason)}
          entityName={retiring.name}
          entityLabel={RETIRE_LABEL[retiring.kind]}
          consequences={RETIRE_CONSEQUENCES[retiring.kind]}
        />
      ) : null}
    </div>
  );
}

/** The retire dialog's wording per entity, so six actions do not invent six dialects. */
const RETIRE_LABEL: Record<RetireTarget["kind"], string> = {
  menu: "menu",
  category: "section",
  item: "dish",
  group: "option group",
  modifier: "option",
};

const RETIRE_CONSEQUENCES: Record<RetireTarget["kind"], readonly string[]> = {
  menu: [
    "Its sections and dishes leave the POS but keep their price history.",
    "Bills already printed from this menu are unaffected.",
    "This is a status change, not a delete, and the reason goes to the audit.",
  ],
  category: [
    "The dishes inside it survive and become uncategorised.",
    "Its name is freed for a new section.",
    "Past orders keep the section they were sold under.",
  ],
  item: [
    "It leaves the POS and active lists; the reason is audited.",
    "Its price history and every line already sold on it are preserved.",
    "Sold out tonight is the switch in the row, not this action.",
  ],
  group: [
    "The choices inside it leave the order screen.",
    "Lines already sold keep the option they were sold with.",
    "The group is retired, never deleted.",
  ],
  modifier: [
    "It is no longer offerable on new lines.",
    "Order lines that already carry it keep their snapshot name and price.",
    "The option is retired, never deleted.",
  ],
};

/* ---------------------------------------------------------------- sub-pieces */

function MenuSection({
  section,
  rank,
  ranks,
  firstVisible,
  columns,
  canEdit,
  canArchive,
  onMove,
  onRename,
  onRetire,
}: {
  section: { category: MenuCategory | null; items: MenuItemView[] };
  rank: number | null;
  ranks: number;
  firstVisible: boolean;
  columns: readonly DataColumn<MenuItemView>[];
  canEdit: boolean;
  canArchive: boolean;
  onMove: (delta: number) => void;
  onRename: () => void;
  onRetire: () => void;
}) {
  const category = section.category;
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold text-ink">{category?.name ?? "Unsorted"}</h4>
        {category !== null ? (
          <>
            <StatusPill status={category.status} />
            <span className="text-xs text-muted">{category.description ?? "No description"}</span>
            <div className="ml-auto flex items-center gap-1">
              {canEdit && rank !== null && rank > 0 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<ArrowUp className="size-4" aria-hidden />}
                  onClick={() => onMove(-1)}
                >
                  Up
                </Button>
              ) : null}
              {canEdit && rank !== null && rank < ranks - 1 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<ArrowDown className="size-4" aria-hidden />}
                  onClick={() => onMove(1)}
                >
                  Down
                </Button>
              ) : null}
              {canEdit ? (
                <Button size="sm" variant="ghost" onClick={onRename}>
                  Rename
                </Button>
              ) : null}
              {canArchive && category.status !== "ARCHIVED" ? (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Archive className="size-4" aria-hidden />}
                  onClick={onRetire}
                >
                  Archive
                </Button>
              ) : null}
            </div>
          </>
        ) : (
          <span className="text-xs text-muted">
            Dishes with no section — they still sell, they just have no heading.
          </span>
        )}
      </div>
      <DataTable
        columns={columns}
        rows={section.items}
        rowKey={(row) => row.item.id}
        empty={
          <p className="px-1 py-3 text-xs text-muted">
            {firstVisible && category === null ? "Nothing on this menu yet." : "Nothing in this section yet."}
          </p>
        }
      />
    </section>
  );
}

function MenuSheet({
  outletId,
  onClose,
  onSaved,
}: {
  outletId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<MenuDraft>(newMenuDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (patch: Partial<MenuDraft>) => setDraft((prev) => ({ ...prev, ...patch }));

  const submit = async () => {
    const found = validateMenuForm(draft);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await createMenu(menuCreateInput(draft, outletId));
      onSaved();
    } catch (error) {
      setFailure(submitFailureMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      side="right"
      title="Create menu"
      description="One menu per outlet, in one currency. The currency is fixed here and every dish price on this menu must agree with it."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={saving}>
            {saving ? "Creating…" : "Create menu"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {failure !== null && (
          <p
            role="status"
            className="rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-xs leading-relaxed text-danger"
          >
            {failure}
          </p>
        )}
        <Field label="Name" id="menu-name" required error={errors.name}>
          <TextInput
            value={draft.name}
            onChange={(event) => set({ name: event.target.value })}
            placeholder="e.g. All-Day Dining"
            disabled={saving}
          />
        </Field>
        <Field
          label="Currency"
          id="menu-currency"
          required
          error={errors.currency}
          hint="The 3-letter code. It cannot be changed later — a currency that moves makes this menu's price history unreadable."
        >
          <TextInput
            value={draft.currency}
            onChange={(event) => set({ currency: event.target.value.toUpperCase() })}
            placeholder="INR"
            maxLength={3}
            disabled={saving}
          />
        </Field>
        <Field label="Description" id="menu-description">
          <Textarea
            value={draft.description}
            onChange={(event) => set({ description: event.target.value })}
            rows={3}
            disabled={saving}
          />
        </Field>
      </div>
    </Dialog>
  );
}

function CategorySheetDialog({
  mode,
  menuId,
  onClose,
  onSaved,
}: {
  mode: CategorySheetMode;
  menuId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = mode.kind === "edit";
  const category = mode.kind === "edit" ? mode.category : null;
  const [draft, setDraft] = useState<CategoryDraft>(
    category !== null ? categoryDraftFrom(category) : newCategoryDraft(),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (patch: Partial<CategoryDraft>) => setDraft((prev) => ({ ...prev, ...patch }));

  const submit = async () => {
    const found = validateCategoryForm(draft);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      if (category === null) await createMenuCategory(categoryCreateInput(draft, menuId));
      else await updateMenuCategory(categoryUpdateInput(category, draft));
      onSaved();
    } catch (error) {
      setFailure(submitFailureMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      side="right"
      title={editing ? `Rename ${category?.name ?? "section"}` : "Add section"}
      description="Sections order the menu. Its position changes with the arrows on its row, which send the whole order to the reorder door."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save changes" : "Add section"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {failure !== null && (
          <p
            role="status"
            className="rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-xs leading-relaxed text-danger"
          >
            {failure}
          </p>
        )}
        <Field label="Name" id="category-name" required error={errors.name}>
          <TextInput
            value={draft.name}
            onChange={(event) => set({ name: event.target.value })}
            placeholder="e.g. Starters"
            disabled={saving}
          />
        </Field>
        <Field label="Description" id="category-description" hint="Clear the field to remove the stored line.">
          <Textarea
            value={draft.description}
            onChange={(event) => set({ description: event.target.value })}
            rows={2}
            disabled={saving}
          />
        </Field>
        <Field label="Image URL" id="category-image" error={errors.imageUrl}>
          <TextInput
            value={draft.imageUrl}
            onChange={(event) => set({ imageUrl: event.target.value })}
            placeholder="https://…"
            disabled={saving}
          />
        </Field>
      </div>
    </Dialog>
  );
}

function ItemSheet({
  mode,
  menu,
  categories,
  onClose,
  onSaved,
}: {
  mode: ItemSheetMode;
  menu: Menu;
  categories: readonly MenuCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = mode.kind === "edit";
  const item = mode.kind === "edit" ? mode.item : null;
  const [draft, setDraft] = useState<ItemDraft>(
    mode.kind === "edit" ? itemDraftFrom(mode.item) : newItemDraft(mode.categoryId),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (patch: Partial<ItemDraft>) => setDraft((prev) => ({ ...prev, ...patch }));

  const submit = async () => {
    const found = validateItemForm(draft, { editing, existingAttributes: item?.attributes });
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      if (item === null) await createMenuItem(itemCreateInput(draft, menu.id));
      else await updateMenuItem(itemUpdateInput(item, draft));
      onSaved();
    } catch (error) {
      setFailure(submitFailureMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const categoryOptions: SelectOption<string>[] = categories
    .filter((category) => category.status !== "ARCHIVED")
    .map((category) => ({ value: category.id, label: category.name }));

  return (
    <Dialog
      open
      onClose={onClose}
      side="right"
      title={editing ? `Edit ${item?.name ?? "dish"}` : "Add dish"}
      description={
        editing
          ? "Content edits only. The price has its own sheet, because a reprice closes a price row and opens another; sold-out is the switch in the row."
          : "A new dish arrives with its opening price, in this menu's currency."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save changes" : "Add dish"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {failure !== null && (
          <p
            role="status"
            className="rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-xs leading-relaxed text-danger"
          >
            {failure}
          </p>
        )}
        <Field label="Name" id="item-name" required error={errors.name}>
          <TextInput
            value={draft.name}
            onChange={(event) => set({ name: event.target.value })}
            placeholder="e.g. Tandoori Paneer"
            disabled={saving}
          />
        </Field>

        {editing ? null : (
          <Field
            label={`Opening price (${menu.currency})`}
            id="item-price"
            required
            error={errors.priceText}
            hint="Written as the dish's first price row. Later changes go through the Price sheet with a reason."
          >
            <TextInput
              value={draft.priceText}
              onChange={(event) => set({ priceText: event.target.value })}
              placeholder="280"
              inputMode="decimal"
              disabled={saving}
            />
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Short name" id="item-short" hint="What a KOT line prints when the name is long.">
            <TextInput
              value={draft.shortName}
              onChange={(event) => set({ shortName: event.target.value })}
              disabled={saving}
            />
          </Field>
          <Field label="Item code" id="item-code" hint="Unique within this menu.">
            <TextInput
              value={draft.itemCode}
              onChange={(event) => set({ itemCode: event.target.value })}
              placeholder="e.g. TP-04"
              disabled={saving}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Section" id="item-category">
            <SelectInput
              options={categoryOptions}
              value={draft.categoryId}
              onChange={(categoryId) => set({ categoryId })}
              placeholder={categoryOptions.length === 0 ? "No sections yet" : "Unsorted"}
            />
          </Field>
          <Field
            label="Type"
            id="item-type"
            error={errors.type}
            hint="A lowercase slug, extensible by design — no cuisine list is hardcoded."
          >
            <TextInput
              value={draft.type}
              onChange={(event) => set({ type: event.target.value })}
              placeholder="e.g. main_course"
              disabled={saving}
            />
          </Field>
        </div>

        <Field label="Description" id="item-description">
          <Textarea
            value={draft.description}
            onChange={(event) => set({ description: event.target.value })}
            rows={2}
            disabled={saving}
          />
        </Field>

        <Field label="Image URL" id="item-image" error={errors.imageUrl}>
          <TextInput
            value={draft.imageUrl}
            onChange={(event) => set({ imageUrl: event.target.value })}
            placeholder="https://…"
            disabled={saving}
          />
        </Field>

        <div className="grid gap-2 sm:grid-cols-2">
          <Switch
            checked={draft.isVegetarian}
            onChange={(isVegetarian) => set({ isVegetarian })}
            label="Vegetarian"
          />
          <Switch
            checked={draft.isNonVegetarian}
            onChange={(isNonVegetarian) => set({ isNonVegetarian })}
            label="Non-vegetarian"
          />
          <Switch checked={draft.isEgg} onChange={(isEgg) => set({ isEgg })} label="Contains egg" />
          <Switch checked={draft.isVegan} onChange={(isVegan) => set({ isVegan })} label="Vegan" />
        </div>
        <p className="text-xs text-muted">
          These four are independent facts, so a dish can carry none of them. Leaving a flag off
          records nothing — it does not assert the opposite.
        </p>

        <Field
          label="Attributes (JSON)"
          id="item-attributes"
          error={errors.attributesText}
          hint={
            editing
              ? "The outlet's own keys. Leave the field empty to keep what is stored; an empty object would erase them."
              : "Anything this outlet needs that is not a column, e.g. {\"spice\": \"medium\"}."
          }
        >
          <Textarea
            value={draft.attributesText}
            onChange={(event) => set({ attributesText: event.target.value })}
            rows={4}
            disabled={saving}
            className="font-mono text-xs"
          />
        </Field>
      </div>
    </Dialog>
  );
}

function PriceSheet({
  item,
  currency,
  currentPrice,
  onClose,
  onSaved,
}: {
  item: MenuItem;
  currency: string;
  currentPrice: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<PriceDraft>(newPriceDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (patch: Partial<PriceDraft>) => setDraft((prev) => ({ ...prev, ...patch }));

  const submit = async () => {
    const found = validatePriceForm(draft);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await setMenuItemPrice({
        itemId: item.id,
        unitPrice: draft.unitPrice.trim(),
        effectiveFrom: draft.effectiveFrom.trim() === "" ? undefined : draft.effectiveFrom.trim(),
        reason: draft.reason.trim(),
      });
      onSaved();
    } catch (error) {
      setFailure(submitFailureMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Reprice ${item.name}`}
      description="The current price row closes and a new one opens. Nothing is overwritten, so a bill printed last week still says what it charged."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={saving}>
            {saving ? "Saving…" : "Set price"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {failure !== null && (
          <p
            role="status"
            className="rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-xs leading-relaxed text-danger"
          >
            {failure}
          </p>
        )}
        <p className="text-sm text-ink">
          Current price:{" "}
          <span className="money-figure font-medium">{priceDisplay(currentPrice, currency)}</span>
        </p>
        <Field label={`New price (${currency})`} id="price-new" required error={errors.unitPrice}>
          <TextInput
            value={draft.unitPrice}
            onChange={(event) => set({ unitPrice: event.target.value })}
            inputMode="decimal"
            placeholder="320"
            disabled={saving}
          />
        </Field>
        <Field
          label="Effective from"
          id="price-effective"
          error={errors.effectiveFrom}
          hint="Leave empty to take effect now. A future timestamp lets a price change with the opening of the next season."
        >
          <TextInput
            value={draft.effectiveFrom}
            onChange={(event) => set({ effectiveFrom: event.target.value })}
            placeholder="2026-10-08T00:00"
            disabled={saving}
          />
        </Field>
        <Field
          label="Reason"
          id="price-reason"
          required
          error={errors.reason}
          hint="Mandatory and audited — a repricing is an accounting act."
        >
          <Textarea
            value={draft.reason}
            onChange={(event) => set({ reason: event.target.value })}
            rows={2}
            placeholder="e.g. Feed cost increase passed on for the winter menu."
            disabled={saving}
          />
        </Field>
      </div>
    </Dialog>
  );
}

/**
 * The options behind one dish: its groups and the choices inside each. Loaded on demand —
 * forty dishes do not need four hundred option rows to render a list — and every write here
 * re-reads rather than patching, because the door owns the version counter.
 */
function OptionsSheet({
  item,
  outletId,
  currency,
  canCreate,
  canEdit,
  canArchive,
  onClose,
  onRetire,
  onChanged,
}: {
  item: MenuItem;
  outletId: string;
  currency: string;
  canCreate: boolean;
  canEdit: boolean;
  canArchive: boolean;
  onClose: () => void;
  onRetire: (target: RetireTarget) => void;
  onChanged: () => void;
}) {
  const [groups, setGroups] = useState<ModifierGroup[] | null>(null);
  const [modifiers, setModifiers] = useState<Modifier[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [groupDraft, setGroupDraft] = useState<ModifierGroupDraft>(newModifierGroupDraft);
  const [groupErrors, setGroupErrors] = useState<Record<string, string>>({});
  const [addingGroup, setAddingGroup] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ModifierGroup | null>(null);
  const [optionDrafts, setOptionDrafts] = useState<Record<string, OptionDraft>>({});
  const [optionErrors, setOptionErrors] = useState<Record<string, Record<string, string>>>({});
  const [busy, setBusy] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    const ref: ItemRef = { menuItemId: item.id, outletId };
    let ignore = false;
    setGroups(null);
    Promise.all([
      listModifierGroups(ref, { includeArchived: true }),
      listModifiers(ref, { includeArchived: true }),
    ])
      .then(([gs, ms]) => {
        if (!ignore) {
          setGroups(gs);
          setModifiers(ms);
        }
      })
      .catch((error) => {
        if (!ignore) setFailure(submitFailureMessage(error));
      });
    return () => {
      ignore = true;
    };
  }, [item.id, outletId, reloadTick]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setFailure(null);
    try {
      await action();
      setReloadTick((tick) => tick + 1);
      onChanged();
      return true;
    } catch (error) {
      setFailure(submitFailureMessage(error));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submitGroup = async () => {
    const found = validateModifierGroupForm(groupDraft);
    if (Object.keys(found).length > 0) {
      setGroupErrors(found);
      return;
    }
    setGroupErrors({});
    const saved = await run(() =>
      createModifierGroup({
        itemId: item.id,
        name: groupDraft.name.trim(),
        selectionType: groupDraft.selectionType,
        minSelections: Number(groupDraft.minSelections),
        maxSelections: Number(groupDraft.maxSelections),
      }),
    );
    if (saved) {
      setGroupDraft(newModifierGroupDraft());
      setAddingGroup(false);
    }
  };

  const submitOption = async (group: ModifierGroup) => {
    const draft = optionDrafts[group.id] ?? { name: "", adjustment: "" };
    const found = validateOptionDraft(draft);
    if (Object.keys(found).length > 0) {
      setOptionErrors((prev) => ({ ...prev, [group.id]: found }));
      return;
    }
    setOptionErrors((prev) => ({ ...prev, [group.id]: {} }));
    const adjustment = draft.adjustment.trim();
    const saved = await run(() =>
      createModifier({
        groupId: group.id,
        name: draft.name.trim(),
        priceAdjustment: adjustment === "" ? undefined : adjustment,
      }),
    );
    if (saved) setOptionDrafts((prev) => ({ ...prev, [group.id]: { name: "", adjustment: "" } }));
  };

  const optionValue = (group: ModifierGroup, field: keyof OptionDraft): string =>
    optionDrafts[group.id]?.[field] ?? "";

  return (
    <Dialog
      open
      onClose={onClose}
      side="right"
      title={`Options for ${item.name}`}
      description="A group is one question the guest answers (cook level, size, add-ons); its modifiers are the choices and what each costs over the dish."
      footer={
        <div className="flex items-center gap-2">
          {canCreate && !addingGroup ? (
            <Button
              size="sm"
              variant="secondary"
              icon={<Plus className="size-4" aria-hidden />}
              onClick={() => setAddingGroup(true)}
            >
              Add group
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Close
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {failure !== null && (
          <p
            role="status"
            className="rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-xs leading-relaxed text-danger"
          >
            {failure}
          </p>
        )}

        {groups === null ? (
          <LoadingBlock label="Loading options…" />
        ) : groups.length === 0 && !addingGroup ? (
          <EmptyState
            title="This dish has no options"
            description="Add a group when the guest can choose something about this dish — a size, a cook level, an add-on."
            action={
              canCreate ? (
                <Button size="sm" variant="secondary" onClick={() => setAddingGroup(true)}>
                  Add group
                </Button>
              ) : undefined
            }
          />
        ) : null}

        {groups?.map((group) => {
          const choices = (modifiers ?? []).filter((modifier) => modifier.groupId === group.id);
          return (
            <div key={group.id} className="rounded-lg border border-line bg-surface p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-ink">{group.name}</p>
                <Badge tone={group.status === "ARCHIVED" ? "muted" : "neutral"}>
                  {group.selectionType === "SINGLE"
                    ? "choose one"
                    : `up to ${group.maxSelections}`}
                </Badge>
                {group.minSelections > 0 ? (
                  <Badge tone="warning">{group.minSelections} required</Badge>
                ) : null}
                <div className="ml-auto flex items-center gap-1">
                  {canEdit && group.status !== "ARCHIVED" ? (
                    <Button size="sm" variant="ghost" onClick={() => setEditingGroup(group)}>
                      Edit
                    </Button>
                  ) : null}
                  {canArchive && group.status !== "ARCHIVED" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Archive className="size-4" aria-hidden />}
                      onClick={() =>
                        onRetire({ kind: "group", id: group.id, name: group.name })
                      }
                    >
                      Archive
                    </Button>
                  ) : null}
                </div>
              </div>

              <ul className="mt-2 flex flex-col gap-1">
                {choices.map((modifier) => (
                  <li key={modifier.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="truncate text-ink">{modifier.name}</span>
                    <span className="money-figure text-xs text-muted">
                      {adjustmentDisplay(modifier.priceAdjustment, currency)}
                    </span>
                    {modifier.status === "ARCHIVED" ? <Badge tone="muted">Archived</Badge> : null}
                    {canArchive && modifier.status !== "ARCHIVED" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-auto"
                        onClick={() =>
                          onRetire({ kind: "modifier", id: modifier.id, name: modifier.name })
                        }
                      >
                        Archive
                      </Button>
                    ) : null}
                  </li>
                ))}
                {choices.length === 0 ? (
                  <li className="text-xs text-muted">No choices in this group yet.</li>
                ) : null}
              </ul>

              {canCreate && group.status !== "ARCHIVED" ? (
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <Field label="Choice" id={`option-name-${group.id}`} hideLabel error={optionErrors[group.id]?.name}>
                    <TextInput
                      value={optionValue(group, "name")}
                      onChange={(event) =>
                        setOptionDrafts((prev) => ({
                          ...prev,
                          [group.id]: {
                            name: event.target.value,
                            adjustment: prev[group.id]?.adjustment ?? "",
                          },
                        }))
                      }
                      placeholder="e.g. Extra cheese"
                      disabled={busy}
                    />
                  </Field>
                  <Field
                    label={`Addition (${currency})`}
                    id={`option-price-${group.id}`}
                    hideLabel
                    className="w-32"
                    error={optionErrors[group.id]?.adjustment}
                  >
                    <TextInput
                      value={optionValue(group, "adjustment")}
                      onChange={(event) =>
                        setOptionDrafts((prev) => ({
                          ...prev,
                          [group.id]: {
                            name: prev[group.id]?.name ?? "",
                            adjustment: event.target.value,
                          },
                        }))
                      }
                      placeholder="0"
                      inputMode="decimal"
                      disabled={busy}
                    />
                  </Field>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void submitOption(group)}
                  >
                    Add choice
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}

        {addingGroup ? (
          <div className="rounded-lg border border-dashed border-line p-3">
            <div className="flex flex-col gap-3">
              <Field label="Group name" id="group-name" required error={groupErrors.name}>
                <TextInput
                  value={groupDraft.name}
                  onChange={(event) => setGroupDraft((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="e.g. Cook level"
                  disabled={busy}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Selection" id="group-selection">
                  <SelectInput
                    options={selectionTypeOptions()}
                    value={groupDraft.selectionType}
                    onChange={(selectionType) => setGroupDraft((prev) => ({ ...prev, selectionType }))}
                  />
                </Field>
                <Field label="Minimum" id="group-min" error={groupErrors.minSelections}>
                  <TextInput
                    value={groupDraft.minSelections}
                    onChange={(event) =>
                      setGroupDraft((prev) => ({ ...prev, minSelections: event.target.value }))
                    }
                    inputMode="numeric"
                    disabled={busy}
                  />
                </Field>
                <Field label="Maximum" id="group-max" error={groupErrors.maxSelections}>
                  <TextInput
                    value={groupDraft.maxSelections}
                    onChange={(event) =>
                      setGroupDraft((prev) => ({ ...prev, maxSelections: event.target.value }))
                    }
                    inputMode="numeric"
                    disabled={busy}
                  />
                </Field>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="primary" disabled={busy} onClick={() => void submitGroup()}>
                  Save group
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setAddingGroup(false);
                    setGroupErrors({});
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {editingGroup !== null ? (
          <GroupEditor
            group={editingGroup}
            onCancel={() => setEditingGroup(null)}
            onSaved={() => {
              setEditingGroup(null);
              setReloadTick((tick) => tick + 1);
              onChanged();
            }}
          />
        ) : null}
      </div>
    </Dialog>
  );
}

/** Tightening or widening a group is a `menu.edit` act; its shape rules are 014's CHECKs. */
function GroupEditor({
  group,
  onCancel,
  onSaved,
}: {
  group: ModifierGroup;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<ModifierGroupDraft>({
    name: group.name,
    selectionType: group.selectionType,
    minSelections: String(group.minSelections),
    maxSelections: String(group.maxSelections),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const found = validateModifierGroupForm(draft);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await updateModifierGroup({
        groupId: group.id,
        name: draft.name.trim(),
        selectionType: draft.selectionType,
        minSelections: Number(draft.minSelections),
        maxSelections: Number(draft.maxSelections),
        expectedVersion: group.version,
      });
      onSaved();
    } catch (error) {
      setFailure(submitFailureMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onCancel}
      title={`Edit ${group.name}`}
      description="The shape rules live in the database: the minimum cannot exceed the maximum, and a single-choice group allows exactly one."
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={saving}>
            {saving ? "Saving…" : "Save group"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {failure !== null && <p role="status" className="text-xs text-danger">{failure}</p>}
        <Field label="Group name" id="edit-group-name" required error={errors.name}>
          <TextInput
            value={draft.name}
            onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
            disabled={saving}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Selection" id="edit-group-selection">
            <SelectInput
              options={selectionTypeOptions()}
              value={draft.selectionType}
              onChange={(selectionType) => setDraft((prev) => ({ ...prev, selectionType }))}
            />
          </Field>
          <Field label="Minimum" id="edit-group-min" error={errors.minSelections}>
            <TextInput
              value={draft.minSelections}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, minSelections: event.target.value }))
              }
              inputMode="numeric"
              disabled={saving}
            />
          </Field>
          <Field label="Maximum" id="edit-group-max" error={errors.maxSelections}>
            <TextInput
              value={draft.maxSelections}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, maxSelections: event.target.value }))
              }
              inputMode="numeric"
              disabled={saving}
            />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}
