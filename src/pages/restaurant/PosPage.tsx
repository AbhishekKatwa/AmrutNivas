/**
 * The till — tickets of the ACTIVE OUTLET (Prompt #04 §23-§31, migration 016).
 *
 * The screen never chooses its own scope: `organizationId` + `propertyId` + `outletId` come
 * from the context store, and an outlet IS the restaurant (contract §12). With no outlet
 * selected it renders the deliberate "choose an outlet first" state.
 *
 * Six schema facts decide what this screen can offer, and each is visible rather than hidden:
 *
 *   - It shows NO TOTALS. 016 gives `orders` no money column and 017's engine owns every one
 *     it adds (§2). A ticket here therefore prints the frozen line price and quantity the door
 *     stored, and the money identity of the sale — subtotal, tax, service charge, rounding —
 *     first exists on the bill. A running total keyed in TypeScript would be a second
 *     calculation engine, and the two would eventually disagree on a guest's bill.
 *   - Lines are booked by the database, not assembled here. A tapped dish is resolved through
 *     `menu_snapshot` (the live price and the live option groups) and then frozen by the door;
 *     the ticket a draft becomes has ids, print order and versions handed back by 016.
 *   - The state machine is not this screen's. `ORDER_ADVANCE` in the service is a display aid
 *     that offers the next step; `set_order_status` re-asks the question on every call and its
 *     refusal is shown verbatim (§7). Cancel and void are separate verbs with their own
 *     capabilities and their own mandatory reasons (§53, §48).
 *   - A cover's Occupied state is not a button. Seating happens by booking an order on a cover,
 *     so the till only offers covers the floor can actually take: an OUT_OF_SERVICE cover is
 *     refused by `create_order`, a CLEANING one is not (§20's precedence).
 *   - Editing closes at CONFIRMED. Lines and line edits need DRAFT or PLACED (§51); a line can
 *     still be VOIDED until the order itself ends, and voiding keeps the line in history rather
 *     than deleting it — the ticket must be able to say what was cancelled on it.
 *   - A double tap cannot book twice. The draft carries one idempotency key for its whole life
 *     (§6), so a retry of a submit that already landed replays the first ticket.
 *
 * Everything worth asserting (scope derivation, draft merging, the payload mapping, the
 * bookable-cover rule, the failure copy) is an exported pure function beside the component.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  ArrowRight,
  Ban,
  Check,
  ClipboardList,
  LogIn,
  Minus,
  Plus,
  ShoppingBag,
  Store,
  Tag,
  Trash2,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { LoadingBlock } from "@/components/ui/Spinner";
import { SelectInput } from "@/components/ui/SelectInput";
import { StatusPill } from "@/components/ui/StatusPill";
import { TextInput } from "@/components/ui/TextInput";
import { Textarea } from "@/components/ui/Textarea";
import { can, type ActiveContext, type EntityId } from "@/domain/identity/types";
import { formatAdjustmentText, formatMoneyText } from "@/domain/money/money";
import {
  listCategories,
  listItems,
  listMenus,
  listOpenPrices,
  itemSnapshot,
  type MenuRef,
} from "@/domain/restaurant/menu-service";
import {
  listTables,
  listTableStatuses,
  type FloorScope,
} from "@/domain/restaurant/floor-service";
import {
  addOrderItems,
  createOrder,
  listOpenOrders,
  loadOrderTicket,
  moveOrderTable,
  newIdempotencyKey,
  orderAcceptsLines,
  orderAdvanceOptions,
  orderIsTerminal,
  setOrderStatus,
  updateOrderItem,
  voidOrderItem,
  type NewOrder,
  type OrderLineInput,
} from "@/domain/restaurant/order-service";
import { applyDiscount, type ApplyDiscount } from "@/domain/restaurant/operations-service";
import {
  ORDER_TYPES,
  type DiscountType,
  type Menu,
  type MenuCategory,
  type MenuItem,
  type MenuItemSnapshot,
  type Order,
  type OrderLineDetail,
  type OrderStatus,
  type OrderTicket,
  type OrderType,
  type OpenOrder,
  type SnapshotModifierGroup,
  type TableDerivedStatus,
  type TableStatus,
} from "@/domain/restaurant/types";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

/* ------------------------------------------------------------------ pure rules */

/** Which surface the screen shows for the session state — never a permanent spinner. */
export type PosPageView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_outlet"
  | "scoped";

export function pageStatusFor(status: ContextStatus, context: ActiveContext): PosPageView {
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

/** The triple every read on this screen scopes by. Identical to the floor and menu scopes. */
export type PosScope = FloorScope;

export function posScopeFor(context: ActiveContext): PosScope | null {
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

export const NO_BACKEND_COPY =
  "This build has no Supabase project configured, so there is no till to open.";

/** The picker's unit: a sellable dish plus its open price row, which is what the tile prints. */
export type PosDish = {
  item: MenuItem;
  unitPrice: string | null;
};

export function itemsWithPrices(
  items: readonly MenuItem[],
  prices: readonly { menuItemId: EntityId; unitPrice: string }[],
): PosDish[] {
  const byItem = new Map<string, string>();
  for (const price of prices) byItem.set(price.menuItemId, price.unitPrice);
  return items.map((item) => ({ item, unitPrice: byItem.get(item.id) ?? null }));
}

/** The menu the till sells from: a published one, by name. A DRAFT menu sells nothing. */
export function activeMenu(menus: readonly Menu[]): Menu | null {
  const live = menus.filter((menu) => menu.status === "ACTIVE");
  if (live.length === 0) return null;
  return [...live].sort((a, b) => a.name.localeCompare(b.name))[0] ?? null;
}

/** Sections in their stored order, each with its sellable dishes; unsorted dishes last. */
export type MenuSection = {
  categoryId: EntityId | null;
  name: string;
  items: PosDish[];
};

export function menuSections(
  views: readonly PosDish[],
  categories: readonly MenuCategory[],
): MenuSection[] {
  const sections: MenuSection[] = categories.map((category) => ({
    categoryId: category.id,
    name: category.name,
    items: views.filter((view) => view.item.categoryId === category.id),
  }));
  const placed = new Set(categories.map((category) => category.id));
  const loose = views.filter(
    (view) => view.item.categoryId === null || !placed.has(view.item.categoryId),
  );
  if (loose.length > 0) sections.push({ categoryId: null, name: "Unsorted", items: loose });
  return sections.filter((section) => section.items.length > 0);
}

/** A cover the till can seat on: live, and not the one state a person has ruled out. */
export type BookableCover = {
  tableId: EntityId;
  code: string;
  name: string;
  capacity: number;
  derivedStatus: TableDerivedStatus;
};

export function bookableCovers(
  tables: readonly { id: EntityId; code: string; name: string; capacity: number }[],
  statuses: readonly TableStatus[],
): BookableCover[] {
  const byId = new Map(statuses.map((row) => [row.tableId, row]));
  return tables
    .map((table) => {
      const row = byId.get(table.id);
      return {
        tableId: table.id,
        code: table.code,
        name: table.name,
        capacity: table.capacity,
        // A cover with no row in the view has no live order on it, which is exactly
        // AVAILABLE — the same reading the floor map gives, so the two never disagree.
        derivedStatus: row?.derivedStatus ?? "AVAILABLE",
      };
    })
    .filter((cover) => cover.derivedStatus !== "OUT_OF_SERVICE");
}

export function coverLabel(cover: BookableCover): string {
  return `${cover.code} · seats ${cover.capacity} · ${cover.derivedStatus.toLowerCase()}`;
}

/** §24's pairing in one sentence: a dine-in ticket needs a cover, a takeaway must not have one. */
export function orderTypeNeedsTable(orderType: OrderType): boolean {
  return orderType === "DINE_IN";
}

export function orderTypeLabel(orderType: OrderType): string {
  return orderType === "DINE_IN" ? "Dine-in" : "Takeaway";
}

/** The picker is derived from the domain array, never a list this screen copied. */
export function orderTypeOptions(): { value: OrderType; label: string }[] {
  return ORDER_TYPES.map((orderType) => ({
    value: orderType,
    label: orderTypeLabel(orderType),
  }));
}

/** The verb a status advance reads as on a button, per destination rather than per screen. */
export function advanceLabel(status: OrderStatus): string {
  switch (status) {
    case "PLACED":
      return "Place order";
    case "CONFIRMED":
      return "Confirm order";
    case "PREPARING":
      return "Start preparing";
    case "READY":
      return "Mark ready";
    case "SERVED":
      return "Mark served";
    case "COMPLETED":
      return "Complete";
    default:
      return "Advance";
  }
}

/* ---------------------------------------------------------------------- draft */

/** The options chosen on one group of one line — names kept so the ticket can print them. */
export type DraftChoiceGroup = {
  groupId: EntityId;
  name: string;
  picks: { modifierId: EntityId; name: string; priceAdjustment: string }[];
};

/**
 * A line that has been staged but not booked.
 *
 * `unitPrice` is what the snapshot said when the dish was tapped, and it is only ever printed
 * — the door re-resolves and freezes the price itself, so a reprice landing in between moves
 * the booked line, not this preview.
 */
export type DraftLine = {
  /** Identity within the draft: item + choices + instructions, so an identical tap merges. */
  key: string;
  itemId: EntityId;
  itemName: string;
  unitPrice: string | null;
  currency: string;
  quantity: number;
  specialInstructions: string;
  groups: DraftChoiceGroup[];
};

export type Draft = {
  orderType: OrderType;
  tableId: EntityId | null;
  notes: string;
  lines: DraftLine[];
  /** One key for the whole life of this intended booking (§6), replaced only by a new draft. */
  idempotencyKey: string;
};

export function newDraft(orderType: OrderType = "DINE_IN"): Draft {
  return {
    orderType,
    tableId: null,
    notes: "",
    lines: [],
    idempotencyKey: newIdempotencyKey(),
  };
}

export function draftLineKey(line: Omit<DraftLine, "key" | "quantity">): string {
  const groups = line.groups
    .map((group) => `${group.groupId}:${group.picks.map((pick) => pick.modifierId).sort().join("+")}`)
    .sort()
    .join("|");
  return `${line.itemId}::${groups}::${line.specialInstructions.trim()}`;
}

/**
 * One tap of the same dish with the same choices raises the count of the existing line.
 *
 * §31 caps a line at 999 and refuses a zero, so the ceiling is enforced here rather than
 * sending a 1000th unit to a door that will reject the whole call.
 */
export function appendDraftLine(draft: Draft, line: DraftLine): Draft {
  const existing = draft.lines.find((candidate) => candidate.key === line.key);
  if (existing === undefined) return { ...draft, lines: [...draft.lines, line] };
  if (existing.quantity >= 999) return draft;
  return {
    ...draft,
    lines: draft.lines.map((candidate) =>
      candidate.key === existing.key ? { ...candidate, quantity: candidate.quantity + 1 } : candidate,
    ),
  };
}

export function setDraftLineQuantity(draft: Draft, key: string, quantity: number): Draft {
  const bounded = Math.min(999, Math.max(1, Math.trunc(quantity)));
  return {
    ...draft,
    lines: draft.lines.map((line) => (line.key === key ? { ...line, quantity: bounded } : line)),
  };
}

export function removeDraftLine(draft: Draft, key: string): Draft {
  return { ...draft, lines: draft.lines.filter((line) => line.key !== key) };
}

/** The wire payload one draft line becomes: the keys `resolve_restaurant_order_line` reads. */
export function draftLineInput(line: DraftLine): OrderLineInput {
  return {
    itemId: line.itemId,
    quantity: line.quantity,
    specialInstructions: line.specialInstructions.trim(),
    modifiers: line.groups.map((group) => ({
      groupId: group.groupId,
      modifierIds: group.picks.map((pick) => pick.modifierId),
    })),
  };
}

/** A dish with no option groups needs no sheet: one tap is one line, exactly as meant. */
export function snapshotNeedsChoices(snapshot: MenuItemSnapshot): boolean {
  return snapshot.modifierGroups.length > 0;
}

/**
 * Why a staged line cannot be booked yet, per group — the rule 014 deferred to order time.
 *
 * A group with `minSelections > 0` that the sheet never answered is refused by the door
 * (`NIVAAS_INVALID_SELECTION_COUNT`), so the sheet says so before submitting rather than
 * after. An empty answer to a min-0 group is a legal decline and is never an error.
 */
export function validateGroupSelections(
  groups: readonly SnapshotModifierGroup[],
  chosen: readonly DraftChoiceGroup[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const group of groups) {
    const picks = chosen.find((entry) => entry.groupId === group.groupId)?.picks.length ?? 0;
    if (picks < group.minSelections) {
      errors[group.groupId] =
        group.minSelections === 1
          ? "Choose one option before adding this dish."
          : `Choose at least ${group.minSelections} options before adding this dish.`;
    } else if (picks > group.maxSelections) {
      errors[group.groupId] = `${group.name} allows at most ${group.maxSelections}.`;
    }
  }
  return errors;
}

/** Whether the draft can be booked at all: a line, and a cover if it claims to need one. */
export function draftCanOpen(draft: Draft): boolean {
  if (draft.lines.length === 0) return false;
  if (orderTypeNeedsTable(draft.orderType) && draft.tableId === null) return false;
  return draft.lines.every((line) => line.unitPrice !== null);
}

export function draftCreateInput(draft: Draft, outletId: EntityId): NewOrder {
  return {
    outletId,
    orderType: draft.orderType,
    lines: draft.lines.map(draftLineInput),
    tableId: orderTypeNeedsTable(draft.orderType) ? (draft.tableId ?? undefined) : undefined,
    notes: draft.notes.trim() === "" ? undefined : draft.notes.trim(),
    idempotencyKey: draft.idempotencyKey,
  };
}

/* ---------------------------------------------------------------- ticket rules */

/** The verbs a live ticket offers, derived from 016's own windows. */
export type TicketCapabilities = {
  canEditLines: boolean;
  canVoidLine: boolean;
  canMoveTable: boolean;
  advances: readonly OrderStatus[];
};

export function ticketCapabilities(order: Order): TicketCapabilities {
  const terminal = orderIsTerminal(order.status);
  return {
    canEditLines: orderAcceptsLines(order.status),
    // A line stays correctable until the ORDER finishes; CONFIRMED already closed new lines.
    canVoidLine: !terminal,
    // §55: there is nothing to move on a takeaway, and a finished ticket is history.
    canMoveTable: order.orderType === "DINE_IN" && !terminal,
    advances: orderAdvanceOptions(order.status),
  };
}

/** The line edits the door will accept: it counts the LINE's version, not the order's. */
export function lineEditHasChanges(
  line: OrderLineDetail,
  quantity: number,
  instructions: string,
): boolean {
  return line.quantity !== quantity || (line.specialInstructions ?? "") !== instructions.trim();
}

/**
 * The door's own sentence, verbatim.
 *
 * No copy is chosen by error CODE here: `db/door-errors.ts` already translates each token
 * (a missing price, an item off the menu, a selection-count refusal, a lost update) into the
 * specific line the operator needs, and a screen that overrode a whole class of them would
 * erase exactly the message that explains the refusal.
 */
export function submitFailureMessage(error: unknown): string {
  return toPublicError(error).message;
}

/* ---------------------------------------------------------------------- screen */

export default function PosPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const storeError = useContextStore((s) => s.error);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const scope = useMemo(
    () => posScopeFor(context),
    // Keyed on the ids: a context object rebuilt without moving the scope must not refetch.
    [context.organizationId, context.propertyId, context.outletId],
  );

  const canView = can("order.view", permissions);
  const canCreate = can("order.create", permissions);
  const canEdit = can("order.edit", permissions);
  const canCancel = can("order.cancel", permissions);
  const canVoid = can("order.void", permissions);

  const [openOrders, setOpenOrders] = useState<OpenOrder[] | null>(null);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [views, setViews] = useState<PosDish[]>([]);
  const [covers, setCovers] = useState<BookableCover[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [selectedId, setSelectedId] = useState<EntityId | null>(null);
  const [ticket, setTicket] = useState<OrderTicket | null>(null);
  const [ticketBusy, setTicketBusy] = useState(false);

  const [customising, setCustomising] = useState<PosDish | null>(null);
  const [editingLine, setEditingLine] = useState<OrderLineDetail | null>(null);
  const [voidingLine, setVoidingLine] = useState<OrderLineDetail | null>(null);
  const [orderAction, setOrderAction] = useState<OrderStatus | null>(null);
  const [moving, setMoving] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountType, setDiscountType] = useState<DiscountType>("PERCENTAGE");
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [discountBusy, setDiscountBusy] = useState(false);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  // The rail, the sellable menu and the bookable covers are three independent reads of the
  // same outlet, so they are taken together and one failure reports once.
  useEffect(() => {
    if (view !== "scoped" || scope === null || !canView) return;
    let ignore = false;
    setListError(null);
    const menu = async (): Promise<{ menu: Menu | null; categories: MenuCategory[]; views: PosDish[] }> => {
      const found = await listMenus(scope);
      const chosen = activeMenu(found);
      if (chosen === null) return { menu: null, categories: [], views: [] };
      const ref: MenuRef = { menuId: chosen.id, outletId: scope.outletId };
      const [sections, items, prices] = await Promise.all([
        listCategories(ref),
        listItems(ref, { sellableOnly: true }),
        listOpenPrices(ref),
      ]);
      return { menu: chosen, categories: sections, views: itemsWithPrices(items, prices) };
    };

    Promise.all([
      listOpenOrders(scope.outletId),
      menu(),
      Promise.all([listTables(scope), listTableStatuses(scope)]).then(
        ([tables, statuses]) => bookableCovers(tables, statuses),
      ),
    ])
      .then(([orders, menuState, bookable]) => {
        if (ignore) return;
        setOpenOrders(orders);
        setMenus(menuState.menu === null ? [] : [menuState.menu]);
        setCategories(menuState.categories);
        setViews(menuState.views);
        setCovers(bookable);
      })
      .catch((error) => {
        if (!ignore) setListError(submitFailureMessage(error));
      });
    return () => {
      ignore = true;
    };
  }, [view, scope, canView, reloadTick]);

  // The selected ticket is a second read: `open_orders` abbreviates and carries no version,
  // and every write on this screen states the version `order_detail` returns.
  useEffect(() => {
    if (selectedId === null || !canView) {
      setTicket(null);
      return;
    }
    let ignore = false;
    setTicketBusy(true);
    loadOrderTicket(selectedId)
      .then((loaded) => {
        if (!ignore) setTicket(loaded);
      })
      .catch((error) => {
        if (!ignore) setListError(submitFailureMessage(error));
      })
      .finally(() => {
        if (!ignore) setTicketBusy(false);
      });
    return () => {
      ignore = true;
    };
  }, [selectedId, canView, reloadTick]);

  const reload = useCallback(() => setReloadTick((tick) => tick + 1), []);
  const report = useCallback((error: unknown) => setActionError(submitFailureMessage(error)), []);

  const sections = useMemo(() => menuSections(views, categories), [views, categories]);
  // One menu, one currency (§ onboarding's shape): the menu row owns it, never a dish.
  const currency = menus[0]?.currency ?? "INR";

  /** Every accepted write refreshes both the rail and the ticket the version came from. */
  const afterWrite = useCallback(() => {
    setActionError(null);
    reload();
  }, [reload]);

  const startDraft = () => {
    setSelectedId(null);
    setTicket(null);
    setDraft(newDraft());
    setActionError(null);
  };

  const openTicket = (orderId: EntityId) => {
    setDraft(null);
    setSelectedId(orderId);
    setActionError(null);
  };

  const addViewedItem = async (viewed: PosDish) => {
    if (draft === null && (ticket === null || !orderAcceptsLines(ticket.order.status))) return;
    // One door call per tap, and it is the right one: the snapshot is the live price and the
    // live option groups (§17), so the till never decides sellability from a stale list.
    try {
      const snapshot = await itemSnapshot(viewed.item.id);
      if (snapshot.unitPrice === null) {
        setActionError(
          `${snapshot.itemName} has no price row, so it cannot be sold. Set a price on the menu first.`,
        );
        return;
      }
      if (snapshotNeedsChoices(snapshot)) {
        setCustomising(viewed);
        return;
      }
      const line: DraftLine = {
        key: "",
        itemId: snapshot.itemId,
        itemName: snapshot.itemName,
        unitPrice: snapshot.unitPrice,
        currency: snapshot.currency ?? currency,
        quantity: 1,
        specialInstructions: "",
        groups: [],
      };
      line.key = draftLineKey(line);
      submitLine(line);
    } catch (error) {
      report(error);
    }
  };

  /** A staged line either joins the draft or, on a live ticket, is booked through the door. */
  const submitLine = async (line: DraftLine) => {
    setCustomising(null);
    setActionError(null);
    if (draft !== null) {
      setDraft(appendDraftLine(draft, line));
      return;
    }
    if (ticket === null) return;
    try {
      await addOrderItems({
        orderId: ticket.order.id,
        lines: [draftLineInput(line)],
        expectedVersion: ticket.order.version,
      });
      afterWrite();
    } catch (error) {
      report(error);
    }
  };

  const openDraft = async () => {
    if (draft === null || scope === null || !draftCanOpen(draft)) return;
    setActionError(null);
    try {
      const order = await createOrder(draftCreateInput(draft, scope.outletId));
      setDraft(null);
      setSelectedId(order.id);
      reload();
    } catch (error) {
      // The draft and its idempotency key both survive a refusal, so the same input can be
      // corrected and re-sent without a second ticket appearing if the first one landed.
      report(error);
    }
  };

  const advance = async (next: OrderStatus) => {
    if (ticket === null) return;
    try {
      await setOrderStatus({
        orderId: ticket.order.id,
        status: next,
        expectedVersion: ticket.order.version,
      });
      afterWrite();
    } catch (error) {
      report(error);
    }
  };

  const applyOrderAction = async (reason: string) => {
    if (ticket === null || orderAction === null) return;
    try {
      await setOrderStatus({
        orderId: ticket.order.id,
        status: orderAction,
        reason,
        expectedVersion: ticket.order.version,
      });
      setOrderAction(null);
      afterWrite();
    } catch (error) {
      setOrderAction(null);
      report(error);
    }
  };

  const applyLineVoid = async (reason: string) => {
    if (voidingLine === null) return;
    try {
      await voidOrderItem({
        itemId: voidingLine.id,
        reason,
        expectedVersion: voidingLine.version,
      });
      setVoidingLine(null);
      afterWrite();
    } catch (error) {
      setVoidingLine(null);
      report(error);
    }
  };

  const applyDiscountHandler = async () => {
    if (ticket === null || discountReason.trim() === "") return;
    const value = Number(discountValue);
    if (!Number.isFinite(value) || value <= 0) return;
    if (discountType === "PERCENTAGE" && value > 100) return;
    setDiscountBusy(true);
    try {
      const payload: ApplyDiscount = {
        orderId: ticket.order.id,
        discountType,
        discountValue: value,
        reason: discountReason.trim(),
      };
      await applyDiscount(payload);
      setDiscountOpen(false);
      setDiscountType("PERCENTAGE");
      setDiscountValue("");
      setDiscountReason("");
      afterWrite();
    } catch (error) {
      report(error);
    } finally {
      setDiscountBusy(false);
    }
  };

  const applyLineEdit = async (quantity: number, instructions: string) => {
    if (editingLine === null) return;
    try {
      await updateOrderItem({
        itemId: editingLine.id,
        quantity,
        // `""` is the operator clearing the instruction; the door stores NULL for it.
        specialInstructions: instructions.trim(),
        expectedVersion: editingLine.version,
      });
      setEditingLine(null);
      afterWrite();
    } catch (error) {
      setEditingLine(null);
      report(error);
    }
  };

  const applyMove = async (tableId: EntityId, reason: string) => {
    if (ticket === null) return;
    try {
      await moveOrderTable({
        orderId: ticket.order.id,
        tableId,
        reason,
        expectedVersion: ticket.order.version,
      });
      setMoving(false);
      afterWrite();
    } catch (error) {
      setMoving(false);
      report(error);
    }
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:gap-6">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          <UtensilsCrossed className="size-5 shrink-0 text-brand-600" aria-hidden />
          Point of sale
        </h2>
        <p className="mt-1 text-sm text-muted">
          Tickets of the active restaurant. Lines print the price frozen at the moment they were
          booked; totals belong to the bill, which the server&rsquo;s calculation engine writes.
        </p>
      </header>

      {view === "bootstrapping" && <LoadingBlock label="Loading your workspace…" />}

      {view === "unconfigured" && (
        <EmptyState
          icon={<X className="size-6" aria-hidden />}
          title="Backend not configured"
          description={storeError ?? NO_BACKEND_COPY}
        />
      )}

      {view === "unauthenticated" && (
        <EmptyState
          icon={<LogIn className="size-6" aria-hidden />}
          title="Sign in to take orders"
          description="There is no active session for this build to read a tenant from. Sign in again to open the till for your restaurant."
        />
      )}

      {view === "no_outlet" && (
        <EmptyState
          icon={<Store className="size-6" aria-hidden />}
          title="Choose an outlet first"
          description="An order belongs to one restaurant, and no outlet is selected in your active context yet. This is nothing being wrong — pick an outlet and the till opens for it."
        />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied capability="take orders" permission="order.view" />
      )}

      {view === "scoped" && scope !== null && canView && (
        <>
          {listError !== null && (
            <p
              role="alert"
              className="rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger"
            >
              {listError}
            </p>
          )}
          {actionError !== null && (
            <div
              role="alert"
              className="flex items-start justify-between gap-3 rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger"
            >
              <span>{actionError}</span>
              <Button size="sm" variant="ghost" onClick={() => setActionError(null)}>
                Dismiss
              </Button>
            </div>
          )}

          <TicketRail
            orders={openOrders}
            selectedId={selectedId}
            draftOpen={draft !== null}
            canCreate={canCreate}
            onNew={startDraft}
            onSelect={openTicket}
            onReload={reload}
          />

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start">
            <MenuPicker
              sections={sections}
              menus={menus}
              currency={currency}
              disabled={draft === null && ticket === null}
              canAdd={canEdit || canCreate}
              onPick={(viewed) => void addViewedItem(viewed)}
            />

            {draft !== null ? (
              <DraftPanel
                draft={draft}
                covers={covers}
                canOpen={canCreate}
                busy={ticketBusy}
                onTypeChange={(orderType) =>
                  setDraft({
                    ...draft,
                    orderType,
                    tableId: orderTypeNeedsTable(orderType) ? draft.tableId : null,
                  })
                }
                onCoverChange={(tableId) => setDraft({ ...draft, tableId })}
                onNotesChange={(notes) => setDraft({ ...draft, notes })}
                onQuantity={(key, quantity) =>
                  setDraft(setDraftLineQuantity(draft, key, quantity))
                }
                onRemove={(key) => setDraft(removeDraftLine(draft, key))}
                onOpen={() => void openDraft()}
                onDiscard={() => {
                  setDraft(null);
                  setActionError(null);
                }}
              />
            ) : ticket !== null ? (
              <LiveTicketPanel
                ticket={ticket}
                busy={ticketBusy}
                canEdit={canEdit}
                canCancel={canCancel}
                canVoid={canVoid}
                onAdvance={(next) => void advance(next)}
                onCancel={() => setOrderAction("CANCELLED")}
                onVoidOrder={() => setOrderAction("VOID")}
                onEditLine={setEditingLine}
                onVoidLine={setVoidingLine}
                onMoveTable={() => setMoving(true)}
                onDiscount={() => setDiscountOpen(true)}
              />
            ) : (
              <Card title="No ticket open">
                <p className="text-sm leading-relaxed text-muted">
                  Start a new ticket or pick one from the rail above. Until one is open the dish
                  list is read-only, because a line has to belong to a ticket the database has
                  already created or to the draft you are staging.
                </p>
              </Card>
            )}
          </div>
        </>
      )}

      {customising !== null && (
        <LineCustomiseSheet
          view={customising}
          currency={currency}
          onClose={() => setCustomising(null)}
          onConfirm={submitLine}
        />
      )}

      {editingLine !== null && (
        <LineSheet
          line={editingLine}
          onClose={() => setEditingLine(null)}
          onSubmit={applyLineEdit}
        />
      )}

      {voidingLine !== null && (
        <ReasonSheet
          title={`Void ${voidingLine.itemNameSnapshot}`}
          intro="The line stays on the ticket as a voided one — the kitchen, the reprint and the audit all need to see that it was cancelled, and the bill's totals simply leave it out."
          confirmLabel="Void line"
          onClose={() => setVoidingLine(null)}
          onSubmit={applyLineVoid}
        />
      )}

      {orderAction !== null && ticket !== null && (
        <ReasonSheet
          title={orderAction === "CANCELLED" ? `Cancel ${ticket.order.orderNumber}` : `Void ${ticket.order.orderNumber}`}
          intro={
            orderAction === "CANCELLED"
              ? "Cancelling stops a ticket that has not been cooked into: after it the order is history and no transition out of it exists."
              : "Voiding a ticket that work has already been done on is the more sensitive of the two verbs, and it is written to the audit trail with this reason."
          }
          confirmLabel={orderAction === "CANCELLED" ? "Cancel ticket" : "Void ticket"}
          destructive
          onClose={() => setOrderAction(null)}
          onSubmit={applyOrderAction}
        />
      )}

      {moving && ticket !== null && (
        <MoveTicketSheet
          ticket={ticket}
          covers={covers}
          onClose={() => setMoving(false)}
          onSubmit={applyMove}
        />
      )}

      {discountOpen && ticket !== null && (
        <Dialog
          open={discountOpen}
          onClose={() => !discountBusy && setDiscountOpen(false)}
          title={`Apply discount to ${ticket.order.orderNumber}`}
          description="Discounts are audited rows, not column adjustments. A reason is required."
        >
          <div className="flex flex-col gap-4">
            <Field id="discount-type" label="Type">
              <SelectInput
                id="discount-type"
                value={discountType}
                onChange={(value) => setDiscountType(value as DiscountType)}
                options={[
                  { value: "PERCENTAGE", label: "Percentage (%)" },
                  { value: "FIXED", label: "Fixed amount" },
                ]}
              />
            </Field>
            <Field id="discount-value" label="Value" required>
              <TextInput
                id="discount-value"
                type="number"
                min="0"
                step={discountType === "PERCENTAGE" ? "1" : "0.01"}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder={discountType === "PERCENTAGE" ? "e.g. 10" : "e.g. 50.00"}
              />
            </Field>
            <Field id="discount-reason" label="Reason" required>
              <Textarea
                id="discount-reason"
                rows={2}
                value={discountReason}
                onChange={(e) => setDiscountReason(e.target.value)}
                placeholder="e.g. Customer complaint, staff discount, promo offer"
              />
            </Field>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setDiscountOpen(false)} disabled={discountBusy}>Cancel</Button>
              <Button
                variant="primary"
                onClick={() => void applyDiscountHandler()}
                disabled={discountBusy || discountReason.trim() === "" || discountValue === ""}
              >
                {discountBusy ? "Applying…" : "Apply discount"}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ pieces */

type TicketRailProps = {
  orders: OpenOrder[] | null;
  selectedId: EntityId | null;
  draftOpen: boolean;
  canCreate: boolean;
  onNew: () => void;
  onSelect: (orderId: EntityId) => void;
  onReload: () => void;
};

/**
 * The live tickets of this outlet, as `open_orders` answers them.
 *
 * Terminal orders are not here and cannot be — a completed, cancelled or voided ticket has
 * left the room, and its history is the bill and the audit trail, not the till.
 */
function TicketRail({
  orders,
  selectedId,
  draftOpen,
  canCreate,
  onNew,
  onSelect,
  onReload,
}: TicketRailProps) {
  return (
    <Card
      title="Open tickets"
      description="Every ticket this outlet has not finished, with the lines still active on it."
      actions={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onReload}>
            Reload
          </Button>
          {canCreate && (
            <Button
              size="sm"
              variant="primary"
              icon={<Plus className="size-4" aria-hidden />}
              onClick={onNew}
              disabled={draftOpen}
            >
              New ticket
            </Button>
          )}
        </div>
      }
    >
      {orders === null ? (
        <LoadingBlock label="Reading the room…" />
      ) : orders.length === 0 ? (
        <p className="text-sm text-muted">
          Nothing is open. Start a ticket and it appears here with its number, cover and lines.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {orders.map((order) => {
            const selected = order.id === selectedId;
            return (
              <li key={order.id}>
                <button
                  type="button"
                  onClick={() => onSelect(order.id)}
                  aria-pressed={selected}
                  className={
                    selected
                      ? "flex min-h-[64px] min-w-[13rem] flex-col items-start gap-1 rounded-lg border border-brand-600 bg-brand-50 px-3 py-2 text-left"
                      : "flex min-h-[64px] min-w-[13rem] flex-col items-start gap-1 rounded-lg border border-line bg-surface px-3 py-2 text-left hover:border-brand-100 hover:bg-brand-50"
                  }
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted">{order.orderNumber}</span>
                    <StatusPill status={order.status} />
                  </span>
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                    {order.orderType === "DINE_IN" ? (
                      <>
                        <Store className="size-4 text-brand-600" aria-hidden />
                        {order.tableCode ?? "No cover"}
                      </>
                    ) : (
                      <>
                        <ShoppingBag className="size-4 text-brand-600" aria-hidden />
                        Takeaway
                      </>
                    )}
                  </span>
                  <span className="text-xs text-muted">
                    {order.itemCount} {order.itemCount === 1 ? "line" : "lines"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

type MenuPickerProps = {
  sections: readonly MenuSection[];
  menus: readonly Menu[];
  currency: string;
  disabled: boolean;
  canAdd: boolean;
  onPick: (view: PosDish) => void;
};

/**
 * The sellable dishes of the outlet&rsquo;s published menu, by section.
 *
 * `sellableOnly` is the door&rsquo;s own filter (`status = ACTIVE` and available), so a sold-out
 * or retired dish is never offered here — and the tap re-checks it through `menu_snapshot`
 * anyway, because the price and the option groups are the database&rsquo;s facts, not this list&rsquo;s.
 */
function MenuPicker({
  sections,
  menus,
  currency,
  disabled,
  canAdd,
  onPick,
}: MenuPickerProps) {
  const menu = menus[0];

  if (menu === undefined) {
    return (
      <EmptyState
        icon={<UtensilsCrossed className="size-6" aria-hidden />}
        title="No published menu"
        description="This outlet has no ACTIVE menu, so there is nothing it can sell. Publish one on the menu screen — a draft menu has no prices frozen onto an order."
      />
    );
  }

  return (
    <Card
      title={menu.name}
      description={`${sections.reduce((total, section) => total + section.items.length, 0)} sellable dishes · ${menu.currency}`}
    >
      {disabled && (
        <p className="mb-3 rounded-md border border-line bg-surface-sunken px-3 py-2 text-xs text-muted">
          Open a ticket, or start a new one, and this list becomes the way to add to it.
        </p>
      )}
      {!canAdd && (
        <p className="mb-3 rounded-md border border-warning-soft bg-warning-soft px-3 py-2 text-xs text-warning">
          Your role can see tickets but not change them, so nothing here can be added.
        </p>
      )}
      {sections.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="size-6" aria-hidden />}
          title="Nothing sellable tonight"
          description="Every dish on this menu is either retired or marked unavailable. Switching a dish back to available on the menu screen brings it to the till."
        />
      ) : (
        <div className="flex flex-col gap-5">
          {sections.map((section) => (
            <section key={section.categoryId ?? "unsorted"}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                {section.name}
              </h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                {section.items.map((view) => {
                  const priceless = view.unitPrice === null;
                  const blocked = disabled || !canAdd || priceless;
                  return (
                    <button
                      key={view.item.id}
                      type="button"
                      onClick={() => onPick(view)}
                      disabled={blocked}
                      className={
                        blocked
                          ? "flex min-h-[76px] cursor-not-allowed flex-col items-start justify-between gap-1 rounded-lg border border-line bg-surface-sunken px-3 py-2 text-left opacity-60"
                          : "flex min-h-[76px] flex-col items-start justify-between gap-1 rounded-lg border border-line bg-surface px-3 py-2 text-left hover:border-brand-600 hover:bg-brand-50 active:bg-brand-100"
                      }
                    >
                      <span className="line-clamp-2 text-sm font-medium text-ink">
                        {view.item.name}
                      </span>
                      <span className="flex items-center gap-2 text-xs text-muted">
                        <span className="font-mono">
                          {view.unitPrice === null
                            ? "No price"
                            : formatMoneyText(view.unitPrice, currency)}
                        </span>
                        <FlagSummary item={view.item} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </Card>
  );
}

/** The dietary flags an outlet declares, as one small mark — never colour alone. */
function FlagSummary({ item }: { item: MenuItem }) {
  const marks = [
    item.isVegan === true ? "Vegan" : null,
    item.isVegetarian === true ? "Veg" : null,
    item.isEgg === true ? "Egg" : null,
    item.isNonVegetarian === true ? "Non-veg" : null,
  ].filter((mark): mark is string => mark !== null);
  if (marks.length === 0) return null;
  return <span className="truncate">{marks.join(" · ")}</span>;
}

type DraftPanelProps = {
  draft: Draft;
  covers: readonly BookableCover[];
  canOpen: boolean;
  busy: boolean;
  onTypeChange: (orderType: OrderType) => void;
  onCoverChange: (tableId: EntityId | null) => void;
  onNotesChange: (notes: string) => void;
  onQuantity: (key: string, quantity: number) => void;
  onRemove: (key: string) => void;
  onOpen: () => void;
  onDiscard: () => void;
};

/**
 * The ticket being staged. Nothing here is in the database yet — the lines are booked together
 * by `create_order`, which resolves and freezes every one of them before it writes any of them,
 * so a mistyped dish costs the outlet no document number.
 */
function DraftPanel({
  draft,
  covers,
  canOpen,
  busy,
  onTypeChange,
  onCoverChange,
  onNotesChange,
  onQuantity,
  onRemove,
  onOpen,
  onDiscard,
}: DraftPanelProps) {
  const needsTable = orderTypeNeedsTable(draft.orderType);
  const coverOptions = covers.map((cover) => ({
    value: cover.tableId,
    label: coverLabel(cover),
  }));

  return (
    <Card
      title="New ticket"
      description="Staged on this device until it is opened. The order number comes from the outlet's own counter."
      actions={
        <Button size="sm" variant="ghost" onClick={onDiscard} disabled={busy}>
          Discard
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {orderTypeOptions().map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onTypeChange(option.value)}
              aria-pressed={draft.orderType === option.value}
              className={
                draft.orderType === option.value
                  ? "min-h-[48px] rounded-lg border border-brand-600 bg-brand-50 px-4 text-sm font-semibold text-ink"
                  : "min-h-[48px] rounded-lg border border-line bg-surface px-4 text-sm font-medium text-muted hover:border-brand-100"
              }
            >
              {option.label}
            </button>
          ))}
        </div>

        {needsTable && (
          <Field
            label="Cover"
            required
            hint="A dine-in ticket must sit on a cover; an out-of-service one is not offered. Cleaning covers are, because a table can be wiped and still take a booking."
          >
            <SelectInput
              options={coverOptions}
              value={draft.tableId ?? ""}
              placeholder={covers.length === 0 ? "No bookable cover on the floor" : "Choose a cover"}
              onChange={(value) => onCoverChange(value === "" ? null : value)}
            />
          </Field>
        )}

        <Field label="Notes" hint="Optional. For the whole ticket — a birthday, a service request.">
          <Textarea
            value={draft.notes}
            onChange={(event) => onNotesChange(event.target.value)}
            placeholder="Seat by the window, no ice."
          />
        </Field>

        {draft.lines.length === 0 ? (
          <p className="rounded-md border border-line bg-surface-sunken px-3 py-2 text-xs text-muted">
            No dishes yet. Tap them on the left; the same dish tapped twice raises one line&rsquo;s
            count rather than printing it twice.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
            {draft.lines.map((line) => (
              <li key={line.key} className="flex items-start justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{line.itemName}</p>
                  <DraftLineDetail line={line} />
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label={`One fewer ${line.itemName}`}
                    icon={<Minus className="size-4" aria-hidden />}
                    disabled={busy || line.quantity <= 1}
                    onClick={() => onQuantity(line.key, line.quantity - 1)}
                  />
                  <span className="w-8 text-center font-mono text-sm tabular-nums text-ink">
                    {line.quantity}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label={`One more ${line.itemName}`}
                    icon={<Plus className="size-4" aria-hidden />}
                    disabled={busy || line.quantity >= 999}
                    onClick={() => onQuantity(line.key, line.quantity + 1)}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove ${line.itemName} from the draft`}
                    icon={<Trash2 className="size-4" aria-hidden />}
                    disabled={busy}
                    onClick={() => onRemove(line.key)}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-2">
          <Button
            variant="primary"
            size="lg"
            block
            icon={<ArrowRight className="size-4" aria-hidden />}
            disabled={!canOpen || busy || !draftCanOpen(draft)}
            onClick={onOpen}
          >
            {busy ? "Opening…" : "Open ticket"}
          </Button>
          {!canOpen && (
            <p className="text-xs text-muted">
              Your role cannot create an order, so this draft stays on the device.
            </p>
          )}
          {canOpen && draft.lines.length > 0 && needsTable && draft.tableId === null && (
            <p className="text-xs text-muted">
              A dine-in ticket needs a cover — the door refuses the pairing either way round.
            </p>
          )}
          {canOpen && draft.lines.some((line) => line.unitPrice === null) && (
            <p className="text-xs text-muted">
              One of these dishes has no price row, and an order cannot be booked at a price that
              does not exist.
            </p>
          )}
          <p className="text-xs leading-relaxed text-muted">
            No total is computed here. Opening the ticket freezes each line&rsquo;s name and unit
            price; the subtotal, tax, service charge and rounding are the bill engine&rsquo;s, and
            they first appear on the bill.
          </p>
        </div>
      </div>
    </Card>
  );
}

/** A staged line printed the way the ticket will print it: name, count, options, request. */
function DraftLineDetail({ line }: { line: DraftLine }) {
  return (
    <div className="mt-0.5 flex flex-col gap-0.5">
      <p className="font-mono text-xs text-muted">
        {line.quantity} ×{" "}
        {line.unitPrice === null ? "No price" : formatMoneyText(line.unitPrice, line.currency)}
      </p>
      {line.groups.flatMap((group) =>
        group.picks.map((pick) => (
          <p key={`${group.groupId}-${pick.modifierId}`} className="text-xs text-muted">
            {pick.name} · {formatAdjustmentText(pick.priceAdjustment, line.currency)}
          </p>
        )),
      )}
      {line.specialInstructions.trim() !== "" && (
        <p className="text-xs italic text-muted">{line.specialInstructions.trim()}</p>
      )}
    </div>
  );
}

type LiveTicketPanelProps = {
  ticket: OrderTicket;
  busy: boolean;
  canEdit: boolean;
  canCancel: boolean;
  canVoid: boolean;
  onAdvance: (status: OrderStatus) => void;
  onCancel: () => void;
  onVoidOrder: () => void;
  onEditLine: (line: OrderLineDetail) => void;
  onVoidLine: (line: OrderLineDetail) => void;
  onMoveTable: () => void;
  onDiscount: () => void;
};

function LiveTicketPanel({
  ticket,
  busy,
  canEdit,
  canCancel,
  canVoid,
  onAdvance,
  onCancel,
  onVoidOrder,
  onEditLine,
  onVoidLine,
  onMoveTable,
  onDiscount,
}: LiveTicketPanelProps) {
  const { order, lines } = ticket;
  const capabilities = ticketCapabilities(order);

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <span className="font-mono">{order.orderNumber}</span>
          <StatusPill status={order.status} />
        </span>
      }
      description={`${orderTypeLabel(order.orderType)} · ${
        order.tableId === null ? "no cover" : "cover booked"
      } · business date ${order.businessDate}`}
    >
      <div className="flex flex-col gap-4">
        {lines.length === 0 ? (
          <p className="rounded-md border border-line bg-surface-sunken px-3 py-2 text-xs text-muted">
            This ticket has no lines yet. Tap a dish to add the first one.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
            {lines.map((line) => (
              <li
                key={line.id}
                className={line.status === "VOIDED" ? "px-3 py-2.5 opacity-60" : "px-3 py-2.5"}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p
                      className={
                        line.status === "VOIDED"
                          ? "truncate text-sm font-medium text-muted line-through"
                          : "truncate text-sm font-medium text-ink"
                      }
                    >
                      {line.lineSequence}. {line.itemNameSnapshot}
                    </p>
                    <p className="font-mono text-xs text-muted">
                      {line.quantity} × {formatMoneyText(line.unitPrice, line.currency)}
                    </p>
                    {line.modifiers.map((modifier) => (
                      <p key={modifier.id} className="text-xs text-muted">
                        {modifier.modifierNameSnapshot} ·{" "}
                        {formatAdjustmentText(modifier.priceAdjustment, modifier.currency)}
                      </p>
                    ))}
                    {line.specialInstructions !== null && line.specialInstructions !== "" && (
                      <p className="text-xs italic text-muted">{line.specialInstructions}</p>
                    )}
                    {line.status === "VOIDED" && (
                      <p className="mt-1 text-xs font-medium text-danger">
                        Voided{line.voidedAt === null ? "" : ` at ${line.voidedAt.slice(0, 16)}`} —
                        kept on the ticket, excluded from the bill.
                      </p>
                    )}
                  </div>
                  {line.status === "ACTIVE" && capabilities.canVoidLine && canEdit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Void ${line.itemNameSnapshot}`}
                      icon={<Trash2 className="size-4" aria-hidden />}
                      disabled={busy}
                      onClick={() => onVoidLine(line)}
                    />
                  )}
                </div>
                {line.status === "ACTIVE" && capabilities.canEditLines && canEdit && (
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => onEditLine(line)}
                    >
                      Count or instruction
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {order.notes !== null && order.notes !== "" && (
          <p className="rounded-md border border-line bg-surface-sunken px-3 py-2 text-xs text-muted">
            Ticket note: {order.notes}
          </p>
        )}

        <div className="flex flex-col gap-2">
          {capabilities.advances.map((next) => (
            <Button
              key={next}
              variant="primary"
              size="lg"
              block
              disabled={busy || !canEdit}
              onClick={() => onAdvance(next)}
            >
              {busy ? "Working…" : advanceLabel(next)}
            </Button>
          ))}
          {capabilities.advances.length === 0 && !orderIsTerminal(order.status) && (
            <p className="text-xs text-muted">
              This ticket cannot advance from here. The kitchen&rsquo;s own states move it once a
              slip is fired, and only the database decides which step follows.
            </p>
          )}
          {orderIsTerminal(order.status) && (
            <p className="flex items-center gap-2 text-xs text-muted">
              <Check className="size-4" aria-hidden />
              This ticket is finished. It leaves the till and stays in the bill and audit history.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {capabilities.canMoveTable && canEdit && (
              <Button
                size="sm"
                variant="secondary"
                icon={<ArrowLeftRight className="size-4" aria-hidden />}
                disabled={busy}
                onClick={onMoveTable}
              >
                Move cover
              </Button>
            )}
            {!orderIsTerminal(order.status) && canCancel && (
              <Button
                size="sm"
                variant="secondary"
                icon={<X className="size-4" aria-hidden />}
                disabled={busy}
                onClick={onCancel}
              >
                Cancel ticket
              </Button>
            )}
            {!orderIsTerminal(order.status) && canVoid && (
              <Button
                size="sm"
                variant="danger"
                icon={<Ban className="size-4" aria-hidden />}
                disabled={busy}
                onClick={onVoidOrder}
              >
                Void ticket
              </Button>
            )}
            {!orderIsTerminal(order.status) && canEdit && (
              <Button
                size="sm"
                variant="secondary"
                icon={<Tag className="size-4" aria-hidden />}
                disabled={busy}
                onClick={onDiscount}
              >
                Discount
              </Button>
            )}
          </div>

          {!canEdit && (
            <p className="text-xs text-muted">
              Your role can read tickets but not advance or change them, so these actions are
              disabled rather than hidden.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

type LineCustomiseSheetProps = {
  view: PosDish;
  currency: string;
  onClose: () => void;
  onConfirm: (line: DraftLine) => void;
};

/**
 * The option picker for one dish, built from `menu_snapshot` rather than the list.
 *
 * The snapshot is the door the bill line is priced from (§17), so the same call answers three
 * questions at once: the live price, the groups that exist now, and how many answers each one
 * demands. `SINGLE` groups render as radios — one name per group is what the kitchen reads —
 * and the group&rsquo;s own min/max drives whether a choice is required, not a guess here.
 */
function LineCustomiseSheet({
  view,
  currency,
  onClose,
  onConfirm,
}: LineCustomiseSheetProps) {
  const [snapshot, setSnapshot] = useState<MenuItemSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [instructions, setInstructions] = useState("");
  const [chosen, setChosen] = useState<DraftChoiceGroup[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let ignore = false;
    itemSnapshot(view.item.id)
      .then((loaded) => {
        if (ignore) return;
        setSnapshot(loaded);
        setChosen(
          loaded.modifierGroups.map((group) => ({
            groupId: group.groupId,
            name: group.name,
            // A SINGLE group starts on its first option: an unanswered radio reads as a
            // mistake, where an unanswered checkbox is a deliberate decline.
            picks:
              group.selectionType === "SINGLE" && group.minSelections > 0
                ? group.modifiers.slice(0, 1)
                : [],
          })),
        );
      })
      .catch((cause) => {
        if (!ignore) setError(submitFailureMessage(cause));
      });
    return () => {
      ignore = true;
    };
  }, [view.item.id]);

  const toggle = (group: SnapshotModifierGroup, modifierId: EntityId) => {
    setChosen((current) => {
      const entry = current.find((item) => item.groupId === group.groupId) ?? {
        groupId: group.groupId,
        name: group.name,
        picks: [],
      };
      const picking = entry.picks.some((pick) => pick.modifierId === modifierId);
      const chosenModifier = group.modifiers.find((modifier) => modifier.modifierId === modifierId);
      if (chosenModifier === undefined) return current;
      const picks =
        group.selectionType === "SINGLE"
          ? [chosenModifier]
          : picking
            ? entry.picks.filter((pick) => pick.modifierId !== modifierId)
            : [...entry.picks, chosenModifier];
      const next = { ...entry, picks };
      return current.some((item) => item.groupId === group.groupId)
        ? current.map((item) => (item.groupId === group.groupId ? next : item))
        : [...current, next];
    });
  };

  const run = () => {
    if (snapshot === null || snapshot.unitPrice === null) return;
    const found = validateGroupSelections(snapshot.modifierGroups, chosen);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const line: DraftLine = {
      key: "",
      itemId: snapshot.itemId,
      itemName: snapshot.itemName,
      unitPrice: snapshot.unitPrice,
      currency: snapshot.currency ?? currency,
      quantity,
      specialInstructions: instructions,
      groups: chosen.filter((group) => group.picks.length > 0),
    };
    line.key = draftLineKey(line);
    onConfirm(line);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      side="right"
      title={snapshot?.itemName ?? view.item.name}
      description="The options, the count and the cook's note — then this becomes one line of one ticket."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={run} disabled={snapshot === null}>
            Add to ticket
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error !== null && (
          <p role="alert" className="rounded-md border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        {snapshot === null && error === null && <LoadingBlock label="Reading the dish…" />}

        {snapshot !== null && (
          <>
            <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
              <Field label="Count" hint="Between 1 and 999.">
                <TextInput
                  inputMode="numeric"
                  value={String(quantity)}
                  onChange={(event) => {
                    const parsed = Number.parseInt(event.target.value, 10);
                    setQuantity(
                      Number.isNaN(parsed) ? 1 : Math.min(999, Math.max(1, parsed)),
                    );
                  }}
                />
              </Field>
              <p className="self-end pb-2 font-mono text-sm text-muted">
                {quantity} ×{" "}
                {snapshot.unitPrice === null
                  ? "No price"
                  : formatMoneyText(snapshot.unitPrice, snapshot.currency ?? currency)}
              </p>
            </div>

            {snapshot.unitPrice === null && (
              <p className="rounded-md border border-warning-soft bg-warning-soft px-3 py-2 text-xs text-warning">
                This dish has no open price row, so the door will refuse to book it. Nothing is
                guessed at a till.
              </p>
            )}

            {snapshot.modifierGroups.map((group) => (
              <Field
                key={group.groupId}
                label={group.name}
                required={group.minSelections > 0}
                hint={`${
                  group.selectionType === "SINGLE" ? "Choose one" : `Choose ${group.minSelections}-${group.maxSelections}`
                }${group.minSelections === 0 ? " — none is a valid answer" : ""}.`}
                error={errors[group.groupId]}
              >
                <div className="flex flex-col gap-2">
                  {group.modifiers.map((modifier) => {
                    const picked = chosen
                      .find((entry) => entry.groupId === group.groupId)
                      ?.picks.some((pick) => pick.modifierId === modifier.modifierId);
                    return (
                      <Checkbox
                        key={modifier.modifierId}
                        label={modifier.name}
                        description={formatAdjustmentText(
                          modifier.priceAdjustment,
                          snapshot.currency ?? currency,
                        )}
                        checked={picked === true}
                        onChange={() => toggle(group, modifier.modifierId)}
                      />
                    );
                  })}
                </div>
              </Field>
            ))}

            <Field
              label="Kitchen note"
              hint="Optional, and it belongs to this line only — e.g. no onion, extra crisp, allergy flag."
            >
              <Textarea
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                placeholder="Hold the chilli, plate it separately."
              />
            </Field>
          </>
        )}
      </div>
    </Dialog>
  );
}

type LineSheetProps = {
  line: OrderLineDetail;
  onClose: () => void;
  onSubmit: (quantity: number, instructions: string) => void;
};

/**
 * The two things a live line can still be restated as: how many, and the note.
 *
 * A line&rsquo;s dish and its options are frozen at sale (§9) and cannot be edited into another
 * sale — that is what voiding and adding a fresh line are for. Clearing the note field sends
 * `""`, which is 005&rsquo;s blankable rule for "the operator cleared this".
 */
function LineSheet({ line, onClose, onSubmit }: LineSheetProps) {
  const [quantity, setQuantity] = useState(line.quantity);
  const [instructions, setInstructions] = useState(line.specialInstructions ?? "");
  const [changed, setChanged] = useState(false);

  const dirty = changed && lineEditHasChanges(line, quantity, instructions);

  return (
    <Dialog
      open
      onClose={onClose}
      side="right"
      title={line.itemNameSnapshot}
      description={`Line ${line.lineSequence} · ${formatMoneyText(line.unitPrice, line.currency)} each. The dish and its chosen options are frozen at sale; count and note can still change.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!dirty}
            onClick={() => onSubmit(quantity, instructions)}
          >
            Save line
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Quantity" required hint="Between 1 and 999, whole units only.">
          <TextInput
            inputMode="numeric"
            value={String(quantity)}
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value, 10);
              setQuantity(Number.isNaN(parsed) ? 1 : Math.min(999, Math.max(1, parsed)));
              setChanged(true);
            }}
          />
        </Field>

        <Field
          label="Kitchen note"
          hint="Clearing this field empties the stored note; leaving it as it was keeps it."
        >
          <Textarea
            value={instructions}
            onChange={(event) => {
              setInstructions(event.target.value);
              setChanged(true);
            }}
            placeholder="No onion, extra crisp."
          />
        </Field>

        <ul className="flex flex-col gap-1.5 rounded-md border border-line bg-surface-sunken px-4 py-3">
          {line.modifiers.length === 0 ? (
            <li className="text-xs text-muted">No options were chosen on this line.</li>
          ) : (
            line.modifiers.map((modifier) => (
              <li key={modifier.id} className="text-xs text-muted">
                {modifier.modifierNameSnapshot} ·{" "}
                {formatAdjustmentText(modifier.priceAdjustment, modifier.currency)}
              </li>
            ))
          )}
        </ul>
      </div>
    </Dialog>
  );
}

type ReasonSheetProps = {
  title: string;
  intro: string;
  confirmLabel: string;
  destructive?: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
};

/**
 * The reason-bearing confirmation for the order verbs that are not an edit (§48, §53).
 *
 * Every one of them — cancel, void, void a line — takes a mandatory `p_reason` at the door, so
 * the field is required here rather than advisory, and the button stays disabled until it is
 * filled. This is deliberately not `ArchiveDialog`: that one retires a record, and none of
 * these three does.
 */
function ReasonSheet({
  title,
  intro,
  confirmLabel,
  destructive = false,
  onClose,
  onSubmit,
}: ReasonSheetProps) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const trimmed = reason.trim();

  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      title={title}
      description={intro}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Keep working
          </Button>
          <Button
            variant={destructive ? "danger" : "primary"}
            disabled={trimmed === ""}
            onClick={() => onSubmit(trimmed)}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field
          label="Reason"
          required
          hint="Written to the audit trail with the action. The door refuses the write without it."
          error={touched && trimmed === "" ? "A reason is required." : undefined}
        >
          <Textarea
            value={reason}
            invalid={touched && trimmed === ""}
            onChange={(event) => {
              setReason(event.target.value);
              setTouched(true);
            }}
            placeholder="e.g. Guest left before the dish reached the table."
          />
        </Field>
      </div>
    </Dialog>
  );
}

type MoveTicketSheetProps = {
  ticket: OrderTicket;
  covers: readonly BookableCover[];
  onClose: () => void;
  onSubmit: (tableId: EntityId, reason: string) => void;
};

/**
 * §55&rsquo;s move: one audited UPDATE of the cover, with the old and new handle in the audit
 * row&rsquo;s before/after. There is no table-history table to write to, so this sheet is the
 * ledger&rsquo;s only entry point — which is why the reason is mandatory even for a move nobody
 * would call sensitive.
 */
function MoveTicketSheet({ ticket, covers, onClose, onSubmit }: MoveTicketSheetProps) {
  const [tableId, setTableId] = useState<EntityId | "">("");
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const trimmed = reason.trim();
  const options = covers
    .filter((cover) => cover.tableId !== ticket.order.tableId)
    .map((cover) => ({ value: cover.tableId, label: coverLabel(cover) }));

  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      title={`Move ${ticket.order.orderNumber} to another cover`}
      description="The ticket keeps its lines, prices and history; only the cover changes, and the audit records both handles."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={tableId === "" || trimmed === ""}
            onClick={() => tableId !== "" && onSubmit(tableId, trimmed)}
          >
            Move cover
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="Destination cover"
          required
          hint="Covers of this outlet that are not out of service. The current one is not offered."
        >
          <SelectInput
            options={options}
            value={tableId}
            placeholder={options.length === 0 ? "No other bookable cover" : "Choose a cover"}
            onChange={(value) => setTableId(value)}
          />
        </Field>

        <Field
          label="Reason"
          required
          hint="Recorded with the move, so a later shift can see who moved the table and why."
          error={touched && trimmed === "" ? "A reason is required." : undefined}
        >
          <Textarea
            value={reason}
            invalid={touched && trimmed === ""}
            onChange={(event) => {
              setReason(event.target.value);
              setTouched(true);
            }}
            placeholder="e.g. Guest asked for the quieter corner."
          />
        </Field>
      </div>
    </Dialog>
  );
}
