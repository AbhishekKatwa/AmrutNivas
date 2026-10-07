/**
 * The menu domain: menus, their ordered sections, the items on them, the modifier
 * groups and options behind an item, and the price history behind each dish.
 *
 * Three rules from 014 decide the shape of every function here:
 *
 *   - Price is never a field of an item. `create_menu_item` takes an INITIAL price because
 *     an unpriced dish cannot be ordered, and every later reprice is `set_menu_item_price`,
 *     which closes the open row and opens a new one. Nothing in this file writes a price
 *     onto `menu_items`, because a mutable price would let a repricing restate yesterday's
 *     bill (§13).
 *   - Availability is not lifecycle. `setMenuAvailability` flips tonight's sellable flag;
 *     `archiveMenuItem` retires the dish. Two doors, two permissions, two facts (§10).
 *   - Order is a full permutation. `reorderCategories` refuses a list that is not exactly
 *     the live set (§8), so the client sends the whole visible order rather than a diff.
 *
 * Reads are plain SELECTs under the outlet policies, scoped on the parent id plus the
 * outlet — the outlet being the column RLS and the tenancy rule are written against. The
 * two money-carrying reads (`modifiers`, `menu_item_prices`) are the exception to
 * `camelRows`: PostgREST serialises `numeric` as a JSON number, and contract §1 will not
 * accept a float reaching a screen, so those rows pass through `moneyRow` at the boundary.
 *
 * Writes all go through a door. `authenticated` holds no DML grant on these tables, so
 * there is nothing to bypass and no read-your-write race: the door returns the row it
 * wrote.
 */

import { requireSupabase } from "@/db/client";
import { toCamelCase } from "@/db/case";
import { asRead, camelRows, callDoor, callDoorRow, rows } from "@/db/rpc";
import type { EntityId } from "@/domain/identity/types";
import type {
  CurrentPrice,
  Menu,
  MenuCategory,
  MenuItem,
  MenuItemPrice,
  MenuItemSnapshot,
  MenuStatus,
  Modifier,
  ModifierGroup,
  SelectionType,
} from "./types";

const MENUS = "menus";
const CATEGORIES = "menu_categories";
const ITEMS = "menu_items";
const GROUPS = "modifier_groups";
const MODIFIERS = "modifiers";
const PRICES = "menu_item_prices";

const MENU_COLUMNS =
  "id, organization_id, property_id, outlet_id, name, description, status, currency, " +
  "effective_from, effective_to, archived_at, version, created_at, updated_at, created_by";

const CATEGORY_COLUMNS =
  "id, organization_id, property_id, outlet_id, menu_id, name, description, image_url, " +
  "display_order, status, version, created_at, updated_at, created_by";

const ITEM_COLUMNS =
  "id, organization_id, property_id, outlet_id, menu_id, category_id, name, short_name, " +
  "item_code, description, image_url, type, status, is_available, availability_status, " +
  "is_vegetarian, is_non_vegetarian, is_egg, is_vegan, attributes, tax_category_id, " +
  "display_order, version, created_at, updated_at, created_by";

const GROUP_COLUMNS =
  "id, organization_id, property_id, outlet_id, menu_id, menu_item_id, name, selection_type, " +
  "min_selections, max_selections, display_order, status, version, created_at, updated_at, created_by";

const MODIFIER_COLUMNS =
  "id, organization_id, property_id, outlet_id, menu_id, menu_item_id, group_id, name, " +
  "price_adjustment, display_order, status, version, created_at, updated_at, created_by";

const PRICE_COLUMNS =
  "id, organization_id, property_id, outlet_id, menu_id, menu_item_id, unit_price, currency, " +
  "effective_from, effective_to, source, created_at, created_by";

/* --------------------------------------------------------------------- scope */

/** The three ancestors a menu list is scoped by; none of them is inferred here. */
export type MenuScope = {
  organizationId: EntityId;
  propertyId: EntityId;
  outletId: EntityId;
};

/** One menu and the outlet it lives in — the pair every child read filters on. */
export type MenuRef = {
  menuId: EntityId;
  outletId: EntityId;
};

/** One item and its outlet, for groups, modifiers and price history. */
export type ItemRef = {
  menuItemId: EntityId;
  outletId: EntityId;
};

/** `{ includeArchived: true }` opts retired rows back into a read. */
export type ArchivedRead = {
  includeArchived?: boolean;
};

/** Extra filters on the item list, which is the one the POS and the menu screen both read. */
export type ItemRead = ArchivedRead & {
  categoryId?: EntityId | null;
  /** Sellable-only: `status = ACTIVE and is_available` — the list a till should offer. */
  sellableOnly?: boolean;
};

/* --------------------------------------------------------------------- money */

/** A raw row's money cell, kept as text instead of being allowed to become a float. */
function moneyText(value: unknown): string {
  return typeof value === "string" ? value : String(value);
}

/**
 * A row that carries money, mapped for the domain.
 *
 * The order of the two steps is the whole function: the cell is re-typed while it is still
 * named `price_adjustment`, because after the camel funnel the key the float sits under is
 * not a column name any more.
 */
function moneyRow<TRow extends object>(
  raw: Record<string, unknown>,
  columns: readonly string[],
): TRow {
  const mapped: Record<string, unknown> = { ...raw };
  for (const column of columns) mapped[column] = moneyText(raw[column]);
  return toCamelCase<TRow>(mapped);
}

const MODIFIER_MONEY = ["price_adjustment"] as const;
const PRICE_MONEY = ["unit_price"] as const;

/* --------------------------------------------------------------------- reads */

/** Every menu of the active outlet. */
export async function listMenus(
  scope: MenuScope,
  options: ArchivedRead = {},
): Promise<Menu[]> {
  const chain = requireSupabase()
    .from(MENUS)
    .select(MENU_COLUMNS)
    .eq("organization_id", scope.organizationId)
    .eq("property_id", scope.propertyId)
    .eq("outlet_id", scope.outletId);
  // A filter mutates the chain and returns it, so an optional predicate is an `if`
  // rather than a ternary whose two builder types would no longer unify.
  if (options.includeArchived !== true) chain.neq("status", "ARCHIVED");
  return camelRows<Menu>(asRead(chain.order("name")));
}

/** The sections of one menu, in the operator's own order. */
export async function listCategories(
  menu: MenuRef,
  options: ArchivedRead = {},
): Promise<MenuCategory[]> {
  const chain = requireSupabase()
    .from(CATEGORIES)
    .select(CATEGORY_COLUMNS)
    .eq("menu_id", menu.menuId)
    .eq("outlet_id", menu.outletId);
  if (options.includeArchived !== true) chain.neq("status", "ARCHIVED");
  return camelRows<MenuCategory>(asRead(chain.order("display_order").order("name")));
}

/** The dishes of one menu. */
export async function listItems(
  menu: MenuRef,
  options: ItemRead = {},
): Promise<MenuItem[]> {
  const chain = requireSupabase()
    .from(ITEMS)
    .select(ITEM_COLUMNS)
    .eq("menu_id", menu.menuId)
    .eq("outlet_id", menu.outletId);
  if (options.includeArchived !== true) chain.neq("status", "ARCHIVED");
  if (options.categoryId !== undefined && options.categoryId !== null) {
    chain.eq("category_id", options.categoryId);
  }
  if (options.sellableOnly === true) {
    chain.eq("status", "ACTIVE").eq("is_available", true);
  }
  return camelRows<MenuItem>(asRead(chain.order("display_order").order("name")));
}

/** The option groups behind one dish. */
export async function listModifierGroups(
  item: ItemRef,
  options: ArchivedRead = {},
): Promise<ModifierGroup[]> {
  const chain = requireSupabase()
    .from(GROUPS)
    .select(GROUP_COLUMNS)
    .eq("menu_item_id", item.menuItemId)
    .eq("outlet_id", item.outletId);
  if (options.includeArchived !== true) chain.neq("status", "ARCHIVED");
  return camelRows<ModifierGroup>(asRead(chain.order("display_order").order("name")));
}

/** The options behind one dish, across all of its groups, in group then option order. */
export async function listModifiers(
  item: ItemRef,
  options: ArchivedRead = {},
): Promise<Modifier[]> {
  const chain = requireSupabase()
    .from(MODIFIERS)
    .select(MODIFIER_COLUMNS)
    .eq("menu_item_id", item.menuItemId)
    .eq("outlet_id", item.outletId);
  if (options.includeArchived !== true) chain.neq("status", "ARCHIVED");
  const query = asRead(
    chain.order("display_order").order("name"),
  );
  const raw = await rows(query);
  return raw.map((row) => moneyRow<Modifier>(row, MODIFIER_MONEY));
}

/**
 * The open price row of every item in one menu, in a single read.
 *
 * A menu screen shows forty prices; forty `currentPrice` door calls would be forty round
 * trips for a fact the outlet may already read. The door stays the authority for the one
 * price an order is about to be booked at (see `currentPrice`), which is a different
 * question from "what does this list say".
 */
export async function listOpenPrices(menu: MenuRef): Promise<MenuItemPrice[]> {
  const raw = await rows(asRead(
    requireSupabase()
      .from(PRICES)
      .select(PRICE_COLUMNS)
      .eq("menu_id", menu.menuId)
      .eq("outlet_id", menu.outletId)
      .is("effective_to", null),
  ));
  return raw.map((row) => moneyRow<MenuItemPrice>(row, PRICE_MONEY));
}

/** The whole price history of one dish, newest first — the open row is the current price. */
export async function listPriceHistory(item: ItemRef): Promise<MenuItemPrice[]> {
  const raw = await rows(asRead(
    requireSupabase()
      .from(PRICES)
      .select(PRICE_COLUMNS)
      .eq("menu_item_id", item.menuItemId)
      .eq("outlet_id", item.outletId)
      .order("effective_from", { ascending: false }),
  ));
  return raw.map((row) => moneyRow<MenuItemPrice>(row, PRICE_MONEY));
}

/**
 * The current price of one dish through its door rather than the table.
 *
 * Not because the row is secret — it is readable under RLS — but because the price an
 * order must be booked at is the one this function resolves, and a screen that guessed it
 * from a local list would be a second implementation of the same fact (§13). A null price
 * means "no price row", which is the state where the item cannot be sold.
 */
export async function currentPrice(itemId: EntityId): Promise<CurrentPrice> {
  return callDoor<CurrentPrice>("menu_item_current_price", { item: itemId });
}

/** The item, its live price and its live modifier groups in one resolution. */
export async function itemSnapshot(itemId: EntityId): Promise<MenuItemSnapshot> {
  return callDoor<MenuItemSnapshot>("menu_snapshot", { item: itemId });
}

/* ---------------------------------------------------------------- menus */

/** Step 4 of onboarding's restaurant shape: one menu per outlet, in one currency. */
export type NewMenu = {
  outletId: EntityId;
  name: string;
  /** Fixed for the whole menu; every price row on every item of this menu must agree. */
  currency: string;
  description?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
};

/**
 * Update convention for this domain: an omitted key sends nothing and the door leaves the
 * column alone; `""` on a blankable column is the operator clearing it and the door stores
 * NULL (`app.blankable`) — never send `null`, which these doors read as "not edited".
 * `status` is not editable from an update door; only `setMenuStatus` moves it.
 */
export type MenuStatusChange = {
  menuId: EntityId;
  status: MenuStatus;
  /** Mandatory for ARCHIVED (the door asks `menu.archive` + a reason), optional otherwise. */
  reason?: string;
};

export async function createMenu(input: NewMenu): Promise<Menu> {
  return callDoorRow<Menu>("create_menu", {
    outlet: input.outletId,
    name: input.name,
    currency: input.currency,
    description: input.description,
    effectiveFrom: input.effectiveFrom,
    effectiveTo: input.effectiveTo,
  });
}

/** Publish (ACTIVE), unpublish (DRAFT) or retire (ARCHIVED) — one operator decision, one door. */
export async function setMenuStatus(input: MenuStatusChange): Promise<Menu> {
  return callDoorRow<Menu>("set_menu_status", {
    menu: input.menuId,
    status: input.status,
    reason: input.reason,
  });
}

/* ---------------------------------------------------------------- categories */

export type NewMenuCategory = {
  menuId: EntityId;
  name: string;
  description?: string;
  imageUrl?: string;
  /** Left unset, the door puts the section last. */
  displayOrder?: number;
};

export type MenuCategoryUpdate = {
  categoryId: EntityId;
  name?: string;
  description?: string;
  imageUrl?: string;
  displayOrder?: number;
  expectedVersion?: number;
};

export async function createMenuCategory(input: NewMenuCategory): Promise<MenuCategory> {
  return callDoorRow<MenuCategory>("create_menu_category", {
    menu: input.menuId,
    name: input.name,
    description: input.description,
    imageUrl: input.imageUrl,
    displayOrder: input.displayOrder,
  });
}

export async function updateMenuCategory(input: MenuCategoryUpdate): Promise<MenuCategory> {
  return callDoorRow<MenuCategory>("update_menu_category", {
    category: input.categoryId,
    name: input.name,
    description: input.description,
    imageUrl: input.imageUrl,
    displayOrder: input.displayOrder,
    expectedVersion: input.expectedVersion,
  });
}

/** Retirement, not deletion: the items that were in it survive and become uncategorised. */
export async function archiveMenuCategory(
  categoryId: EntityId,
  reason: string,
): Promise<MenuCategory> {
  return callDoorRow<MenuCategory>("archive_menu_category", { category: categoryId, reason });
}

/** One resequenced category — the door's own minimal shape, not a whole row. */
export type CategoryOrder = {
  id: EntityId;
  displayOrder: number;
};

/**
 * The full visible order, in rank order. A list missing a live section, repeating one or
 * naming a foreign id is refused (`NIVAAS_INVALID_REORDER`) rather than partially applied,
 * so a drag gesture that lost a row cannot silently renumber the rest.
 */
export async function reorderCategories(
  menuId: EntityId,
  categoryIds: readonly EntityId[],
): Promise<{ menuId: EntityId; order: CategoryOrder[] }> {
  return callDoor("reorder_menu_categories", { menu: menuId, categoryIds });
}

/* ---------------------------------------------------------------- items */

/**
 * A new dish arrives with its price: an unpriced item is unsellable, so the door takes the
 * amount and writes the first `menu_item_prices` row itself, in the MENU's currency.
 */
export type NewMenuItem = {
  menuId: EntityId;
  name: string;
  /** Decimal TEXT, never a number — the amount a price row will store (§1). */
  unitPrice: string;
  categoryId?: EntityId;
  shortName?: string;
  itemCode?: string;
  description?: string;
  imageUrl?: string;
  /** Lowercase slug; nullable and extensible, deliberately not an enum (§9). */
  type?: string;
  displayOrder?: number;
  isAvailable?: boolean;
  isVegetarian?: boolean;
  isNonVegetarian?: boolean;
  isEgg?: boolean;
  isVegan?: boolean;
  taxCategoryId?: EntityId;
  /** The outlet's own bag; keys are the operator's and are never rewritten. */
  attributes?: Record<string, unknown>;
};

export type MenuItemUpdate = {
  itemId: EntityId;
  name?: string;
  shortName?: string;
  itemCode?: string;
  description?: string;
  imageUrl?: string;
  type?: string;
  categoryId?: EntityId;
  displayOrder?: number;
  isVegetarian?: boolean;
  isNonVegetarian?: boolean;
  isEgg?: boolean;
  isVegan?: boolean;
  taxCategoryId?: EntityId;
  attributes?: Record<string, unknown>;
  expectedVersion?: number;
};

/**
 * A repricing, not an edit. The open price row is closed at `effectiveFrom` and a new one
 * opens; history is never overwritten, which is what lets an old bill still say what it
 * charged. The reason is mandatory and audited.
 */
export type MenuItemPriceChange = {
  itemId: EntityId;
  unitPrice: string;
  effectiveFrom?: string;
  reason: string;
};

/** Sold out tonight. `status` is untouched, so the dish stays on the menu (§10). */
export type MenuItemAvailabilityChange = {
  itemId: EntityId;
  available: boolean;
  expectedVersion?: number;
};

export async function createMenuItem(input: NewMenuItem): Promise<MenuItem> {
  return callDoorRow<MenuItem>("create_menu_item", {
    menu: input.menuId,
    name: input.name,
    unitPrice: input.unitPrice,
    category: input.categoryId,
    shortName: input.shortName,
    itemCode: input.itemCode,
    description: input.description,
    imageUrl: input.imageUrl,
    type: input.type,
    displayOrder: input.displayOrder,
    isAvailable: input.isAvailable,
    isVegetarian: input.isVegetarian,
    isNonVegetarian: input.isNonVegetarian,
    isEgg: input.isEgg,
    isVegan: input.isVegan,
    taxCategoryId: input.taxCategoryId,
    attributes: input.attributes,
  });
}

export async function updateMenuItem(input: MenuItemUpdate): Promise<MenuItem> {
  return callDoorRow<MenuItem>("update_menu_item", {
    item: input.itemId,
    name: input.name,
    shortName: input.shortName,
    itemCode: input.itemCode,
    description: input.description,
    imageUrl: input.imageUrl,
    type: input.type,
    category: input.categoryId,
    displayOrder: input.displayOrder,
    isVegetarian: input.isVegetarian,
    isNonVegetarian: input.isNonVegetarian,
    isEgg: input.isEgg,
    isVegan: input.isVegan,
    taxCategoryId: input.taxCategoryId,
    attributes: input.attributes,
    expectedVersion: input.expectedVersion,
  });
}

export async function setMenuItemAvailability(
  input: MenuItemAvailabilityChange,
): Promise<MenuItem> {
  return callDoorRow<MenuItem>("set_menu_item_availability", {
    item: input.itemId,
    available: input.available,
    expectedVersion: input.expectedVersion,
  });
}

export async function setMenuItemPrice(input: MenuItemPriceChange): Promise<MenuItemPrice> {
  const raw = await callDoor<Record<string, unknown>>("set_menu_item_price", {
    item: input.itemId,
    unitPrice: input.unitPrice,
    effectiveFrom: input.effectiveFrom,
    reason: input.reason,
  });
  return moneyRow<MenuItemPrice>(raw, PRICE_MONEY);
}

export async function archiveMenuItem(itemId: EntityId, reason: string): Promise<MenuItem> {
  return callDoorRow<MenuItem>("archive_menu_item", { item: itemId, reason });
}

/* ---------------------------------------------------------------- modifiers */

export type NewModifierGroup = {
  itemId: EntityId;
  name: string;
  selectionType: SelectionType;
  /** Static shape only: `min <= max`, and SINGLE caps at one. The per-order count is an
   *  ORDER-time rule and lives in 016's resolver, not here. */
  minSelections?: number;
  maxSelections?: number;
  displayOrder?: number;
};

export type ModifierGroupUpdate = {
  groupId: EntityId;
  name?: string;
  selectionType?: SelectionType;
  minSelections?: number;
  maxSelections?: number;
  displayOrder?: number;
  expectedVersion?: number;
};

export type NewModifier = {
  groupId: EntityId;
  name: string;
  /** Decimal TEXT; may be negative (a cheaper swap). */
  priceAdjustment?: string;
  displayOrder?: number;
};

export type ModifierUpdate = {
  modifierId: EntityId;
  name?: string;
  priceAdjustment?: string;
  displayOrder?: number;
  expectedVersion?: number;
};

export async function createModifierGroup(input: NewModifierGroup): Promise<ModifierGroup> {
  return callDoorRow<ModifierGroup>("create_modifier_group", {
    item: input.itemId,
    name: input.name,
    selectionType: input.selectionType,
    minSelections: input.minSelections,
    maxSelections: input.maxSelections,
    displayOrder: input.displayOrder,
  });
}

export async function updateModifierGroup(input: ModifierGroupUpdate): Promise<ModifierGroup> {
  return callDoorRow<ModifierGroup>("update_modifier_group", {
    group: input.groupId,
    name: input.name,
    selectionType: input.selectionType,
    minSelections: input.minSelections,
    maxSelections: input.maxSelections,
    displayOrder: input.displayOrder,
    expectedVersion: input.expectedVersion,
  });
}

export async function archiveModifierGroup(
  groupId: EntityId,
  reason: string,
): Promise<ModifierGroup> {
  return callDoorRow<ModifierGroup>("archive_modifier_group", { group: groupId, reason });
}

export async function createModifier(input: NewModifier): Promise<Modifier> {
  const raw = await callDoor<Record<string, unknown>>("create_modifier", {
    group: input.groupId,
    name: input.name,
    priceAdjustment: input.priceAdjustment,
    displayOrder: input.displayOrder,
  });
  return moneyRow<Modifier>(raw, MODIFIER_MONEY);
}

export async function updateModifier(input: ModifierUpdate): Promise<Modifier> {
  const raw = await callDoor<Record<string, unknown>>("update_modifier", {
    modifier: input.modifierId,
    name: input.name,
    priceAdjustment: input.priceAdjustment,
    displayOrder: input.displayOrder,
    expectedVersion: input.expectedVersion,
  });
  return moneyRow<Modifier>(raw, MODIFIER_MONEY);
}

export async function archiveModifier(
  modifierId: EntityId,
  reason: string,
): Promise<Modifier> {
  const raw = await callDoor<Record<string, unknown>>("archive_modifier", {
    modifier: modifierId,
    reason,
  });
  return moneyRow<Modifier>(raw, MODIFIER_MONEY);
}

/** The one condition a till checks before it offers a dish: on the menu AND trading. */
export function isSellable(item: MenuItem): boolean {
  return item.status === "ACTIVE" && item.isAvailable;
}
