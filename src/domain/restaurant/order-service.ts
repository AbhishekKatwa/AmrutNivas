/**
 * Orders at the till (Prompt #04 §23-§31, migration 016): the ticket, its frozen lines,
 * and the state machine that moves it through the service.
 *
 * Five schema facts decide the shape of every function here:
 *
 *   - The whole scope comes from ONE argument. `create_order` takes the outlet and reads the
 *     organization, the property, the business date and the document number off it. Nothing
 *     in this file accepts a `businessDate` or a total, because the door derives them (§24,
 *     contract §4) and a client that guessed either would be a second, drift-prone copy.
 *   - Money is TEXT and mostly NULL. 016 gives `orders` no money column at all; 017's ALTERs
 *     add the totals and leave them NULL until the engine runs. So every order row crossing
 *     this boundary is normalised by `moneyRow`, not by `callDoorRow`: a jsonb `numeric`
 *     reaches JavaScript as a float, and that is how ₹280 becomes 279.99999999999994 on a
 *     bill (contract §1). Nothing here adds two amounts — the POS shows the frozen line
 *     prices and the bill's total comes from the engine (§2).
 *   - Lines are a jsonb payload. `toDoorArgs` deliberately does not recurse, so a line's
 *     inner keys stay camelCase, which is exactly what `app.resolve_restaurant_order_line`
 *     reads (`itemId`, `quantity`, `specialInstructions`, `modifiers[{groupId, modifierIds}]`).
 *     Those keys are a wire contract, not a style choice.
 *   - The state machine lives in `app`, where no client can call it (§7). `ORDER_ADVANCE`
 *     below is a DISPLAY AID so the till offers the next step rather than nine buttons; the
 *     door re-asks the question every time and its refusal is the authority.
 *   - `open_orders` carries no version. The list is abbreviated field by field, so a screen
 *     that means to edit loads `order_detail` and states that row's version — 005's lost-
 *     update guard is optional to send and not optional to honour once sent.
 *
 * Every write goes through a door (`authenticated` has no DML grant on these three tables),
 * and every door answers with the row it wrote rather than making the caller re-select it.
 */

import { callDoor } from "@/db/rpc";
import { moneyRow } from "@/db/money-read";
import type { EntityId } from "@/domain/identity/types";
import type {
  Order,
  OrderLine,
  OrderLineDetail,
  OrderLineModifier,
  OrderStatus,
  OrderTicket,
  OrderType,
  OpenOrder,
} from "./types";

/* --------------------------------------------------------------------- mapping */

/** 017's totals on `orders`: nullable money, TEXT in the domain. */
const ORDER_MONEY = [
  "subtotal",
  "discountAmount",
  "taxAmount",
  "serviceChargeAmount",
  "roundingAmount",
  "grandTotal",
  "amountDue",
] as const;

/** `order_items`' money, plus 017's tax-rate snapshot. */
const LINE_MONEY = ["unitPrice", "taxRate"] as const;

const MODIFIER_MONEY = ["priceAdjustment"] as const;

/**
 * A money cell read off the wire: the door's text stays text, a PostgREST number becomes
 * text, and SQL NULL stays NULL.
 *
 * The third case is why this domain does not reuse `callDoorRow` — on a price row every
 * column is NOT NULL, but an order's totals are NULL for the whole of the order's working
 * life, and `String(null)` would put the word "null" into a money field.
 */
function orderFromWire(raw: Record<string, unknown>): Order {
  return moneyRow<Order>(raw, ORDER_MONEY);
}

function lineFromWire(raw: Record<string, unknown>): OrderLine {
  return moneyRow<OrderLine>(raw, LINE_MONEY);
}

function modifierFromWire(raw: Record<string, unknown>): OrderLineModifier {
  return moneyRow<OrderLineModifier>(raw, MODIFIER_MONEY);
}

/**
 * `order_detail`'s answer mapped for the domain.
 *
 * The door returns the order row with `items` hanging off it and each item carrying its own
 * `modifiers` array — nested rows, so the camel funnel never reaches them and each level is
 * mapped here on purpose. The door coalesces both arrays to `[]`, so a ticket with nothing on
 * it is an empty list rather than a missing key.
 */
function ticketFromWire(raw: Record<string, unknown>): OrderTicket {
  const items = raw.items;
  if (!Array.isArray(items)) {
    return { order: orderFromWire(raw), lines: [] };
  }
  const lines = items.map((item) => {
    const { modifiers, ...line } = item as Record<string, unknown>;
    const detail = moneyRow<OrderLine>(line, LINE_MONEY);
    const chosen = Array.isArray(modifiers)
      ? modifiers.map((modifier) => modifierFromWire(modifier as Record<string, unknown>))
      : [];
    return { ...detail, modifiers: chosen } satisfies OrderLineDetail;
  });
  return { order: orderFromWire(raw), lines };
}

/**
 * The next steps the till may offer, per §27's vocabulary.
 *
 * This mirrors 016's thirteen legal edges so a cashier sees one advance button rather than
 * eight refusals — and nothing more than that. The machine itself is
 * `app.rest_order_transition_allowed()`, deliberately in `app` and off the client surface
 * (§7): if this list and the door ever disagree, the door wins, and the refusal it raises is
 * shown verbatim. Cancel and void are not here; they are separate verbs with their own
 * capabilities (`order.cancel`, `order.void`) and their own mandatory reasons.
 */
export const ORDER_ADVANCE: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  DRAFT: ["PLACED"],
  PLACED: ["CONFIRMED"],
  CONFIRMED: ["PREPARING"],
  PREPARING: ["READY"],
  READY: ["SERVED"],
  SERVED: ["COMPLETED"],
  // §27's three terminal states have no outgoing edge: "immutable" and "no legal transition"
  // are the same fact, so there is no advance to offer from any of them.
  COMPLETED: [],
  CANCELLED: [],
  VOID: [],
};

/** The statuses at which a ticket still accepts lines or line edits (§51's window). */
export const ORDER_EDITABLE_STATUSES: readonly OrderStatus[] = ["DRAFT", "PLACED"];

/** The statuses a line can still be voided in: anything the order has not finished. */
export const ORDER_TERMINAL_STATUSES: readonly OrderStatus[] = [
  "COMPLETED",
  "CANCELLED",
  "VOID",
];

export function orderAdvanceOptions(status: OrderStatus): readonly OrderStatus[] {
  return ORDER_ADVANCE[status];
}

export function orderAcceptsLines(status: OrderStatus): boolean {
  return ORDER_EDITABLE_STATUSES.includes(status);
}

export function orderIsTerminal(status: OrderStatus): boolean {
  return ORDER_TERMINAL_STATUSES.includes(status);
}

/**
 * One idempotency key per intended booking (§6), so a double tap replays the first order
 * instead of minting a second ticket.
 *
 * The `prefix` only ever reaches a human through the stored column or the audit row, and it
 * is there so a replayed PAYMENT does not read as if a till did it: the same generator is
 * shared by the bill and KOT services rather than three copies of a nonce drifting apart.
 *
 * Deliberately not `crypto.randomUUID()`: that API exists only in a secure context, and a
 * counter running plain http on a property LAN is exactly the till this product is built
 * for. This is a uniqueness nonce, not a secret, so a timestamp plus a random suffix is the
 * honest tool for the job.
 */
export function newIdempotencyKey(prefix = "pos"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/* ----------------------------------------------------------------------- reads */

/**
 * The outlet's live tickets, abbreviated — the POS rail.
 *
 * No totals appear here and none can: 017 owns the calculation engine, and this door hands
 * over the frozen line prices as strings for exactly that reason. Terminal orders are
 * excluded by the door, so an empty list means the room is clear, not that the read failed.
 */
export async function listOpenOrders(outletId: EntityId): Promise<OpenOrder[]> {
  const result = await callDoor<{ outletId: EntityId; orders: OpenOrder[] }>("open_orders", {
    outlet: outletId,
  });
  return result.orders;
}

/** One ticket whole: the order, every line including the voided ones, and the options on each. */
export async function loadOrderTicket(orderId: EntityId): Promise<OrderTicket> {
  return ticketFromWire(
    await callDoor<Record<string, unknown>>("order_detail", { order: orderId }),
  );
}

/* ------------------------------------------------------------------ line payload */

/**
 * The chosen options for one line, in the shape `p_items` carries.
 *
 * `modifierIds` is the answer to `groupId` counted against that group's min/max — the rule
 * 014 deferred to order time. An empty array against a min-0 group is a legal DECLINE; a
 * group with `minSelections > 0` that is never mentioned at all is refused
 * (`NIVAAS_INVALID_SELECTION_COUNT`), which is why a dish with a mandatory option must be
 * customised before it is added rather than edited afterwards.
 */
export type OrderLineModifierChoice = {
  groupId: EntityId;
  modifierIds: EntityId[];
};

/** One dish as the POS states it: the item, how many, and what the guest asked for on it. */
export type OrderLineInput = {
  itemId: EntityId;
  /** Unstated means one — "one of these" is what tapping a dish means. */
  quantity?: number;
  specialInstructions?: string;
  modifiers?: OrderLineModifierChoice[];
};

/* ----------------------------------------------------------------------- writes */

export type NewOrder = {
  /** The only scope an order takes: everything above it is read off this outlet. */
  outletId: EntityId;
  orderType: OrderType;
  lines: OrderLineInput[];
  /** Mandatory for DINE_IN, forbidden for TAKEAWAY — one sentence, one refusal token. */
  tableId?: EntityId;
  /** Stored verbatim and resolved by nothing: §57 keeps CRM out of this build. */
  customerId?: EntityId;
  notes?: string;
  /** §6: send the same key for the same intended booking; the door replays the first order. */
  idempotencyKey?: string;
};

export type AddOrderItems = {
  orderId: EntityId;
  lines: OrderLineInput[];
  expectedVersion?: number;
};

/**
 * Update convention for this domain: an omitted key sends nothing and the door leaves the
 * column alone; `""` on `specialInstructions` is the operator clearing it and the door stores
 * NULL — never send `null`, which this door reads as "not edited". Stating neither field is
 * refused (`NIVAAS_INVALID_ORDER_LINE`), so a sheet with no changes must not submit.
 */
export type OrderItemEdit = {
  itemId: EntityId;
  quantity?: number;
  specialInstructions?: string;
  expectedVersion?: number;
};

export type OrderItemVoid = {
  itemId: EntityId;
  /** Mandatory: a line the kitchen may have already cooked needs the sentence that says why. */
  reason: string;
  expectedVersion?: number;
};

/**
 * The state machine's one door (§27). `reason` is mandatory for CANCELLED and VOID — those
 * two destinations carry their own capabilities too (`order.cancel`, `order.void`) — and
 * optional for every advance, which needs only `order.edit`.
 */
export type OrderStatusChange = {
  orderId: EntityId;
  status: OrderStatus;
  reason?: string;
  expectedVersion?: number;
};

/** §55: the audited move of a live DINE_IN ticket to another cover of the same outlet. */
export type OrderTableMove = {
  orderId: EntityId;
  tableId: EntityId;
  reason: string;
  expectedVersion?: number;
};

export async function createOrder(input: NewOrder): Promise<Order> {
  const raw = await callDoor<Record<string, unknown>>("create_order", {
    outlet: input.outletId,
    orderType: input.orderType,
    items: input.lines,
    table: input.tableId,
    customerId: input.customerId,
    notes: input.notes,
    idempotencyKey: input.idempotencyKey,
  });
  return orderFromWire(raw);
}

/**
 * Lines onto a ticket still open for them (§51: DRAFT or PLACED only).
 *
 * The door answers with the ORDER row, not the lines it wrote — so a caller that needs the
 * new line ids (to edit or void one) reloads the ticket. That is the door's design, not a
 * missed optimisation: the print order and the frozen prices are the database's answer.
 */
export async function addOrderItems(input: AddOrderItems): Promise<Order> {
  const raw = await callDoor<Record<string, unknown>>("add_order_items", {
    order: input.orderId,
    items: input.lines,
    expectedVersion: input.expectedVersion,
  });
  return orderFromWire(raw);
}

export async function updateOrderItem(input: OrderItemEdit): Promise<OrderLine> {
  const raw = await callDoor<Record<string, unknown>>("update_order_item", {
    item: input.itemId,
    quantity: input.quantity,
    specialInstructions: input.specialInstructions,
    expectedVersion: input.expectedVersion,
  });
  return lineFromWire(raw);
}

/** VOID, never DELETE: the line stays in history and 017's totals simply exclude it. */
export async function voidOrderItem(input: OrderItemVoid): Promise<OrderLine> {
  const raw = await callDoor<Record<string, unknown>>("void_order_item", {
    item: input.itemId,
    reason: input.reason,
    expectedVersion: input.expectedVersion,
  });
  return lineFromWire(raw);
}

export async function setOrderStatus(input: OrderStatusChange): Promise<Order> {
  const raw = await callDoor<Record<string, unknown>>("set_order_status", {
    order: input.orderId,
    status: input.status,
    reason: input.reason,
    expectedVersion: input.expectedVersion,
  });
  return orderFromWire(raw);
}

export async function moveOrderTable(input: OrderTableMove): Promise<Order> {
  const raw = await callDoor<Record<string, unknown>>("move_order_table", {
    order: input.orderId,
    table: input.tableId,
    reason: input.reason,
    expectedVersion: input.expectedVersion,
  });
  return orderFromWire(raw);
}
