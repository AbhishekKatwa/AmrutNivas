/**
 * The restaurant floor: dining areas and tables (Prompt #04 §18-§22, migration 015).
 *
 * Types only in this section — the services live beside it. This module is the client's mirror
 * of the schema's restaurant tables, and it exists for one reason: every list below is a
 * picker's contents, and a picker that offers a value the database's CHECK refuses is a 500 at
 * the door. So each array is compared by `domain/identity/taxonomy.test.ts` against the CHECK
 * constraint in the matching `db/supabase/NNN_*.sql`, in both directions, exactly as the
 * identity vocabularies are compared against 001/002.
 *
 * Hierarchy: Outlet → DiningArea → RestaurantTable.
 *
 *   DiningArea       = one section of one restaurant (Main Hall, Outdoor, Rooftop). §19 asks
 *                      for this single concept explicitly, so there is no `Floor` above it
 *                      and nothing generic about the tree: two levels, then covers.
 *   RestaurantTable  = a cover inside a section, with a capacity, an outlet-unique code and a
 *                      place on §21's floor map.
 *
 * Tenancy rule, unchanged from 001: every row carries the ids of ALL its ancestors, and 015's
 * `app.assert_dining_chain()` trigger refuses a write whose copied ancestors disagree with the
 * parent's — including a table whose own outlet does not match its area's outlet.
 */

import type { EntityId } from "@/domain/identity/types";

/**
 * An area's whole lifecycle. There is no "busy" or "closed tonight" here: those are facts
 * about the tables inside an area, and 015 keeps lifecycle and operation apart for the same
 * reason 014 keeps a menu item's `status` apart from its `is_available`.
 */
export type DiningAreaStatus = "ACTIVE" | "ARCHIVED";

/** A table's archival lifecycle — the same two values, and the same deliberate absence. */
export type RestaurantTableStatus = "ACTIVE" | "ARCHIVED";

/**
 * The ONLY operational states a person may set (§20).
 *
 * `OCCUPIED` and `RESERVED` are missing on purpose, and this array is the client half of that
 * wall: the schema's CHECK excludes them, `set_table_service_status` refuses them, and a UI
 * that offered one would be a bug in three places at once. They are DERIVED — OCCUPIED from a
 * live order (016), RESERVED from a live reservation (Prompt #08) — and the resolution is
 * added by the migration that can see those rows, never by a screen writing a guess.
 */
export type TableServiceStatus = "AVAILABLE" | "CLEANING" | "OUT_OF_SERVICE";

/**
 * Silhouettes §21's floor map can draw. Nullable on the row: a table with no shape is simply
 * drawn as a card. `OTHER` exists so an unusual cover does not force a new migration, and it
 * is the whole extension story — 014 gave menu items a `jsonb attributes` bag because items
 * genuinely vary; a table's remaining facts are its capacity and its name.
 */
export type TableShape = "ROUND" | "SQUARE" | "RECTANGLE" | "OVAL" | "BOOTH" | "OTHER";

export const DINING_AREA_STATUSES: readonly DiningAreaStatus[] = ["ACTIVE", "ARCHIVED"];

export const RESTAURANT_TABLE_STATUSES: readonly RestaurantTableStatus[] = [
  "ACTIVE",
  "ARCHIVED",
];

export const TABLE_SERVICE_STATUSES: readonly TableServiceStatus[] = [
  "AVAILABLE",
  "CLEANING",
  "OUT_OF_SERVICE",
];

export const TABLE_SHAPES: readonly TableShape[] = [
  "ROUND",
  "SQUARE",
  "RECTANGLE",
  "OVAL",
  "BOOTH",
  "OTHER",
];

/**
 * A dining section, mapped from the `dining_areas` SELECT by `floor-service`.
 *
 * 015 ships no read door — the floor map is a plain SELECT under the outlet policy — so the
 * service maps the row's top level to camelCase and this is the shape the screens consume.
 * JSON-free row, so the mapping is the whole transform.
 */
export type DiningArea = {
  id: string;
  organizationId: string;
  propertyId: string;
  outletId: string;
  name: string;
  /** NULL when the operator left it blank; an empty string never reaches the row. */
  description: string | null;
  /** Unique per outlet among live areas. Deterministic order, not "whatever the DB returns". */
  displayOrder: number;
  status: DiningAreaStatus;
  archivedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
};

/** A cover inside a section, as the management screen edits it. */
export type RestaurantTable = {
  id: string;
  organizationId: string;
  propertyId: string;
  outletId: string;
  areaId: string;
  name: string;
  /** Unique across the OUTLET among live rows — the handle an order, KOT and bill print. */
  code: string;
  capacity: number;
  status: RestaurantTableStatus;
  serviceStatus: TableServiceStatus;
  /** Unique per AREA among live rows. */
  displayOrder: number;
  /**
   * Floor-map canvas coordinates (0-10000), NOT money: 015 bounds them with a plain sanity
   * CHECK and deliberately applies no scale rule, because a scale rule is an accounting
   * statement. NULL means the map places the cover itself.
   */
  positionX: number | null;
  positionY: number | null;
  shape: TableShape | null;
  archivedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
};

/**
 * The five operational states §20 names, and the only place all five exist together.
 *
 * Three are writable (`TableServiceStatus`); OCCUPIED and RESERVED are read out of
 * `public.restaurant_table_status` (016) and no door accepts them. A screen that needs to
 * DRAW a cover shows this value; a screen that needs to CHANGE one offers only the other three.
 */
export type TableDerivedStatus =
  | "AVAILABLE"
  | "OCCUPIED"
  | "RESERVED"
  | "CLEANING"
  | "OUT_OF_SERVICE";

export const TABLE_DERIVED_STATUSES: readonly TableDerivedStatus[] = [
  "OUT_OF_SERVICE",
  "CLEANING",
  "OCCUPIED",
  "RESERVED",
  "AVAILABLE",
];

/**
 * One row of 016's `restaurant_table_status` view: a cover with its derived truth beside the
 * manual fact, so a screen never re-implements the precedence (it is `security_invoker`, so
 * the reading role's own outlet RLS applies and no door is needed).
 */
export type TableStatus = {
  tableId: string;
  organizationId: string;
  propertyId: string;
  outletId: string;
  areaId: string;
  /** Denormalized by the view so a floor map groups by name without a second read. */
  areaName: string;
  tableName: string;
  tableCode: string;
  capacity: number;
  serviceStatus: TableServiceStatus;
  /** Live (non-terminal) orders on the cover — the number that makes it OCCUPIED. */
  liveOrders: number;
  derivedStatus: TableDerivedStatus;
};

/**
 * The two ways an order can be served (Prompt #04 §23).
 *
 * DINE_IN requires a table_id; TAKEAWAY does not. This array is compared by
 * `domain/identity/taxonomy.test.ts` against 016's CHECK constraint on orders.order_type.
 */
export type OrderType = "DINE_IN" | "TAKEAWAY";

/**
 * An order's full nine-state lifecycle (Prompt #04 §27).
 *
 * Terminal states (COMPLETED, CANCELLED, VOID) have no outgoing edges in the state machine.
 * This array is compared against 016's CHECK constraint on orders.status.
 */
export type OrderStatus =
  | "DRAFT"
  | "PLACED"
  | "CONFIRMED"
  | "PREPARING"
  | "READY"
  | "SERVED"
  | "COMPLETED"
  | "CANCELLED"
  | "VOID";

/**
 * An order line's lifecycle (Prompt #04 §18).
 *
 * ACTIVE lines are part of the current ticket; VOIDED lines stay in history for audit and
 * printed tickets but are excluded from calculation totals.
 */
export type OrderItemStatus = "ACTIVE" | "VOIDED";

export const ORDER_TYPES: readonly OrderType[] = ["DINE_IN", "TAKEAWAY"];

export const ORDER_STATUSES: readonly OrderStatus[] = [
  "DRAFT",
  "PLACED",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "SERVED",
  "COMPLETED",
  "CANCELLED",
  "VOID",
];

export const ORDER_ITEM_STATUSES: readonly OrderItemStatus[] = ["ACTIVE", "VOIDED"];

/**
 * A line's KITCHEN state (§26, migration 018) — deliberately a different fact from
 * OrderItemStatus, which is the SALES state. A line can be VOIDED and still NOT_FIRED (it
 * was cancelled before the pass saw it), and FIRED and still ACTIVE (it is being cooked).
 * There is no SERVED here: the order moves to SERVED on 016's ladder, and a line has no
 * moment of leaving the pass that the order does not already own.
 */
export type OrderItemFireStatus = "NOT_FIRED" | "FIRED" | "READY";

/** A kitchen ticket's lifecycle (018). CLOSED and CANCELLED are both terminal. */
export type KotStatus = "OPEN" | "CLOSED" | "CANCELLED";

export const ORDER_ITEM_FIRE_STATUSES: readonly OrderItemFireStatus[] = [
  "NOT_FIRED",
  "FIRED",
  "READY",
];

export const KOT_STATUSES: readonly KotStatus[] = ["OPEN", "CLOSED", "CANCELLED"];

/**
 * A bill's lifecycle (Prompt #04 §41).
 *
 * OPEN → PARTIALLY_PAID → PAID, or CANCELLED before any payment. This array is compared
 * against 017's CHECK constraint on bills.status.
 */
export type BillStatus = "OPEN" | "PARTIALLY_PAID" | "PAID" | "CANCELLED";

/**
 * Payment methods (Prompt #04 §43).
 *
 * The ways money can be received. This array is compared against 017's CHECK constraint
 * on payments.method.
 */
export type PaymentMethod = "CASH" | "CARD" | "UPI" | "BANK_TRANSFER" | "WALLET" | "OTHER";

/**
 * A payment's status (Prompt #04 §43).
 *
 * SUCCESSFUL payments are immutable; corrections are new REFUNDED rows. FAILED payments
 * are reversed. This array is compared against 017's CHECK constraint on payments.status.
 */
export type PaymentStatus = "SUCCESSFUL" | "FAILED" | "REFUNDED";

export const BILL_STATUSES: readonly BillStatus[] = [
  "OPEN",
  "PARTIALLY_PAID",
  "PAID",
  "CANCELLED",
];

export const PAYMENT_METHODS: readonly PaymentMethod[] = [
  "CASH",
  "CARD",
  "UPI",
  "BANK_TRANSFER",
  "WALLET",
  "OTHER",
];

export const PAYMENT_STATUSES: readonly PaymentStatus[] = [
  "SUCCESSFUL",
  "FAILED",
  "REFUNDED",
];

/**
 * An `orders` row exactly as stored.
 *
 * Snake_case on purpose: 016 ships read doors (`order_detail`, `open_orders`) that resolve
 * snapshots and derived status, so this is the raw shape before any mapping.
 */
export type OrderRow = {
  id: string;
  organization_id: string;
  property_id: string;
  outlet_id: string;
  order_type: OrderType;
  table_id: string | null;
  customer_id: string | null;
  order_number: string;
  business_date: string;
  status: OrderStatus;
  currency: string;
  /**
   * Every money column below is NULL until 017's engine writes it, and is money as TEXT:
   * a jsonb numeric crossing into JavaScript becomes a float, and that is how ₹280 turns
   * into 279.99999999999994 on a bill (contract §1). No screen adds these — the client
   * displays the engine's answer or displays nothing.
   */
  subtotal: string | null;
  discount_amount: string | null;
  tax_amount: string | null;
  service_charge_amount: string | null;
  rounding_amount: string | null;
  grand_total: string | null;
  amount_due: string | null;
  notes: string | null;
  cancel_reason: string | null;
  void_reason: string | null;
  cancelled_at: string | null;
  voided_at: string | null;
  closed_at: string | null;
  idempotency_key: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

/**
 * An `order_items` row exactly as stored.
 *
 * Snapshot columns (item_name_snapshot, item_code_snapshot, unit_price, currency) are frozen
 * at sale time per Prompt #04 §9 — menu repricing never rewrites historical lines.
 */
export type OrderItemRow = {
  id: string;
  organization_id: string;
  property_id: string;
  outlet_id: string;
  order_id: string;
  menu_item_id: string;
  item_name_snapshot: string;
  item_code_snapshot: string | null;
  currency: string;
  unit_price: string;
  quantity: number;
  special_instructions: string | null;
  status: OrderItemStatus;
  voided_at: string | null;
  /** 018's kitchen fact, alongside 016's sales fact in `status` — two columns, two truths. */
  fire_status: OrderItemFireStatus;
  /** NULL until the line is fired. A cancelled KOT keeps its READY lines pointing at it. */
  kot_id: string | null;
  /** Tax percentage snapshot at sale time; 017's engine reads it, never recomputes it. */
  tax_rate: string;
  line_sequence: number;
  version: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

/**
 * An `order_item_modifiers` row exactly as stored.
 *
 * modifier_id is nullable so a retired modifier does not erase the sold fact that the guest
 * asked for it (Prompt #04 §31). price_adjustment can be negative (a cheaper swap).
 */
export type OrderItemModifierRow = {
  id: string;
  organization_id: string;
  property_id: string;
  outlet_id: string;
  order_item_id: string;
  modifier_id: string | null;
  modifier_group_id: string;
  modifier_name_snapshot: string;
  price_adjustment: string;
  currency: string;
  quantity: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

/**
 * An order as the POS holds it: camelCase, because every order door answers with
 * `to_jsonb(orders)` and the funnel rewrites that row's top level.
 *
 * `currency` is deliberately ABSENT. 016 gives `orders` no currency column — the money
 * identity of a ticket is the currency frozen on each of its lines, and one outlet's menu
 * is fixed to one currency by 014 — so a screen that read `order.currency` would be
 * reading a field no door ever writes.
 *
 * Every money column is TEXT and NULL until 017's engine has written it (contract §1): the
 * client displays the engine's answer or displays nothing, and never sums a ticket itself.
 */
export type Order = {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  outletId: EntityId;
  orderNumber: string;
  orderType: OrderType;
  /** The cover, for a DINE_IN order only; NULL on a takeaway (CHECK-enforced pairing). */
  tableId: EntityId | null;
  /** Opaque and unresolved until CRM exists (§57): stored verbatim, never looked up. */
  customerId: EntityId | null;
  status: OrderStatus;
  /** Derived by the door from the outlet's own timezone and business-day start. */
  businessDate: string;
  subtotal: string | null;
  discountAmount: string | null;
  taxAmount: string | null;
  serviceChargeAmount: string | null;
  roundingAmount: string | null;
  grandTotal: string | null;
  amountDue: string | null;
  notes: string | null;
  cancelReason: string | null;
  voidReason: string | null;
  cancelledAt: string | null;
  voidedAt: string | null;
  closedAt: string | null;
  idempotencyKey: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: EntityId | null;
};

/** One order line as the line doors return it (frozen name, price as TEXT). */
export type OrderLine = {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  outletId: EntityId;
  orderId: EntityId;
  menuItemId: EntityId;
  itemNameSnapshot: string;
  itemCodeSnapshot: string | null;
  currency: string;
  unitPrice: string;
  quantity: number;
  specialInstructions: string | null;
  status: OrderItemStatus;
  voidedAt: string | null;
  /** 018's kitchen fact, alongside 016's sales fact in `status`. */
  fireStatus: OrderItemFireStatus;
  /** NULL until the line is fired on a slip. */
  kotId: EntityId | null;
  /** 017's tax snapshot; a nullable column, so a row older than 017 reads null. */
  taxRate: string | null;
  lineSequence: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: EntityId | null;
};

/** The chosen options of one line, snapshotted at sale time. */
export type OrderLineModifier = {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  outletId: EntityId;
  orderItemId: EntityId;
  /** Nullable so a retired modifier never erases the sold fact that the guest asked for it. */
  modifierId: EntityId | null;
  modifierGroupId: EntityId;
  modifierNameSnapshot: string;
  /** TEXT, and may be negative — a cheaper swap is a real thing on a menu. */
  priceAdjustment: string;
  currency: string;
  quantity: number;
  createdAt: string;
  updatedAt: string;
  createdBy: EntityId | null;
};

/**
 * A line as `order_detail` returns it: the row plus the options chosen on it.
 *
 * The door nests the modifier rows inside each line, which is why this is a type of its own
 * rather than a field on `OrderLine` — the line doors (`update_order_item`, `void_order_item`)
 * return the line alone and have no options array to hand back.
 */
export type OrderLineDetail = OrderLine & {
  modifiers: OrderLineModifier[];
};

/** `order_detail`'s whole answer: one consistent read of a ticket and everything on it. */
export type OrderTicket = {
  order: Order;
  /** Every line including VOIDED ones, in ticket print order — a reprint shows what was cancelled. */
  lines: OrderLineDetail[];
};

/** One ACTIVE line as `open_orders` abbreviates it for the POS rail. */
export type OpenOrderLine = {
  name: string;
  quantity: number;
  unitPrice: string;
  currency: string;
};

/**
 * A live ticket in `open_orders`' own camel shape.
 *
 * There is no `version` here and none can be: the door builds this object field by field for
 * the list, so a screen that wants to edit a ticket loads `order_detail` for the row the
 * optimistic lock is stated against.
 */
export type OpenOrder = {
  id: EntityId;
  orderNumber: string;
  orderType: OrderType;
  status: OrderStatus;
  businessDate: string;
  tableId: EntityId | null;
  /** The cover's handle, resolved by the door's own join — NULL on a takeaway. */
  tableCode: string | null;
  itemCount: number;
  lines: OpenOrderLine[];
};

/**
 * A `bills` row exactly as stored.
 *
 * Snapshots totals at bill-open time from the calculation engine. One order typically has
 * one bill, but splits are possible in future.
 */
export type BillRow = {
  id: string;
  organization_id: string;
  property_id: string;
  outlet_id: string;
  order_id: string;
  bill_number: string;
  business_date: string;
  currency: string;
  subtotal: string;
  discount_amount: string;
  tax_amount: string;
  service_charge_amount: string;
  rounding_amount: string;
  grand_total: string;
  amount_paid: string;
  amount_due: string;
  status: BillStatus;
  opened_at: string;
  paid_at: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

/**
 * A `payments` row exactly as stored.
 *
 * Immutable once SUCCESSFUL: corrections are new REFUNDED rows with their own audit trail.
 */
export type PaymentRow = {
  id: string;
  organization_id: string;
  property_id: string;
  outlet_id: string;
  bill_id: string;
  order_id: string;
  payment_number: string;
  business_date: string;
  amount: string;
  currency: string;
  method: PaymentMethod;
  reference_id: string | null;
  status: PaymentStatus;
  refunded_at: string | null;
  refund_reason: string | null;
  notes: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

/**
 * A `kitchen_order_tickets` row exactly as stored (018).
 *
 * The slip is the PRINT UNIT: lines reference it through `order_items.kot_id`, and a
 * reprint re-emits the same row rather than minting a new one — `reprint_count` is the
 * ticket's own footprint of how many times it reached the kitchen.
 */
export type KotRow = {
  id: string;
  organization_id: string;
  property_id: string;
  outlet_id: string;
  order_id: string;
  kot_number: string;
  business_date: string;
  status: KotStatus;
  note: string | null;
  idempotency_key: string | null;
  fired_at: string;
  closed_at: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  reprint_count: number;
  last_reprinted_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

/* ====================================================== bill & KOT door shapes
 *
 * The camelCase, money-as-TEXT views of 017's bills/payments and 018's kitchen tickets —
 * what the doors answer with, after `bill-service` / `kot-service` have retyped every money
 * cell. Three rules decide these shapes, and all three are schema facts rather than taste:
 *
 *   - Money is `string`, never `number` (contract §1). PostgREST serialises an unconstrained
 *     `numeric` as a JSON number, so a raw read of `bills.grand_total` would put a float into
 *     a printed bill. The services retype at the boundary; no screen ever sees a number here.
 *   - Amounts are FROZEN on the bill. 017 snapshots the engine's answer at `open_bill` time,
 *     so a bill says what was sold even after the menu is repriced or a later line is added
 *     to another bill of the same order (§9's "history snapshots what it sold").
 *   - `payments` are append-only. A SUCCESSFUL row is immutable (017's guard trigger), so
 *     there is no update verb for a payment in `bill-service` and no `version` bump to reason
 *     against — a correction is a new REFUNDED row, which is why `refundReason` is a column
 *     on the row rather than an edit of the one it reverses.
 */

/** A `bills` row as its doors return it. Every money column is TEXT and NOT NULL. */
export type Bill = {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  outletId: EntityId;
  /** The ticket this bill was opened from; one order has at most one live bill (017). */
  orderId: EntityId;
  billNumber: string;
  businessDate: string;
  /** Derived from the order's own lines by `open_bill` — `orders` carries no currency. */
  currency: string;
  subtotal: string;
  discountAmount: string;
  /** 0 until the tax module lands: no rate exists anywhere in this schema (D-07). */
  taxAmount: string;
  serviceChargeAmount: string;
  roundingAmount: string;
  grandTotal: string;
  amountPaid: string;
  amountDue: string;
  status: BillStatus;
  openedAt: string;
  paidAt: string | null;
  cancelledAt: string | null;
  cancelledBy: EntityId | null;
  cancelReason: string | null;
  /** The §6 replay key. A retried OPEN BILL returns the first bill, not a second one. */
  idempotencyKey: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: EntityId | null;
};

/** A `payments` row as `record_payment` and `bill_detail` return it. */
export type BillPayment = {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  outletId: EntityId;
  billId: EntityId;
  orderId: EntityId;
  paymentNumber: string;
  businessDate: string;
  /** TEXT, and always positive: `payments_money_ok` refuses a zero or negative amount. */
  amount: string;
  currency: string;
  method: PaymentMethod;
  /** The gateway/card/UPI trace the counter was given. Free text, resolved by nothing. */
  referenceId: string | null;
  status: PaymentStatus;
  refundedAt: string | null;
  refundReason: string | null;
  notes: string | null;
  idempotencyKey: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: EntityId | null;
};

/**
 * One line as `bill_detail` abbreviates it.
 *
 * This is NOT `OrderLine`: the door builds the object field by field for the printed bill,
 * so it carries the frozen name and price the guest is charged for and nothing else — no
 * version, no fire state, no modifier rows. A screen that needs the kitchen state of a line
 * reads the ticket (`order-service`) or the slip (`kot-service`), not the bill.
 */
export type BillLine = {
  id: EntityId;
  itemName: string;
  itemCode: string | null;
  quantity: number;
  unitPrice: string;
  currency: string;
  specialInstructions: string | null;
  /** VOIDED lines are listed too: a bill shows what was cancelled on it, at zero effect. */
  status: OrderItemStatus;
};

/** `bill_detail`'s whole answer: the document, the money booked against it, its lines. */
export type BillDetail = {
  bill: Bill;
  payments: BillPayment[];
  lines: BillLine[];
};

/** A `kitchen_order_tickets` row as 018's doors return it. No money on a slip. */
export type KitchenTicket = {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  outletId: EntityId;
  orderId: EntityId;
  kotNumber: string;
  businessDate: string;
  status: KotStatus;
  note: string | null;
  idempotencyKey: string | null;
  firedAt: string;
  closedAt: string | null;
  cancelledAt: string | null;
  cancelledBy: EntityId | null;
  cancelReason: string | null;
  /** §69: a reprint is an audited act, and this is the slip's own count of them. */
  reprintCount: number;
  lastReprintedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: EntityId | null;
};

/** The options chosen on a slip line, as `kot_detail` prints them. */
export type KitchenTicketLineModifier = {
  name: string;
  /** TEXT and possibly negative — the same rule as a line option anywhere else. */
  priceAdjustment: string;
  quantity: number;
};

/** One line of a slip, in the ticket's own print order. */
export type KitchenTicketLine = {
  id: EntityId;
  itemName: string;
  itemCode: string | null;
  quantity: number;
  /** Printed on the slip for the counter's reference; the kitchen never reads money. */
  unitPrice: string;
  currency: string;
  specialInstructions: string | null;
  lineSequence: number;
  /** The kitchen's own state (§26) — a different fact from `status`, which is the sales one. */
  fireStatus: OrderItemFireStatus;
  status: OrderItemStatus;
  modifiers: KitchenTicketLineModifier[];
};

/** `kot_detail`'s answer: the slip, printed as the kitchen received it. */
export type KitchenTicketDetail = KitchenTicket & {
  lines: KitchenTicketLine[];
};

/**
 * One OPEN slip in `open_kots`' queue row.
 *
 * The counts are numbers here and strings on the wire: the door emits them as `::text` for
 * the same reason it emits money that way, but they are counts, so the service converts them
 * once rather than making every tile compare `"3"` with `3`.
 */
export type OpenKotSummary = {
  id: EntityId;
  kotNumber: string;
  orderId: EntityId;
  orderNumber: string;
  businessDate: string;
  status: KotStatus;
  firedAt: string;
  reprintCount: number;
  /** Lines still cooking on this slip. */
  firedCount: number;
  /** Lines the pass has rung up. */
  readyCount: number;
};

/* =================================================================== trading day
 *
 * The outlet's business date, in one read (019's `restaurant_day_overview`).
 *
 * Three schema facts decide the shape below:
 *
 *   - Every money figure arrives already summed, by Postgres, in `numeric`. Contract §2 allows
 *     exactly one engine for money, and a day's revenue is the figure the Phase 1 exit gate
 *     checks against the printed bill — a `reduce` in TypeScript would be a second engine
 *     disagreeing with the first. So the client adds nothing: it reads per-currency rows.
 *   - Money is grouped BY CURRENCY, never across one. 014 pins an outlet's menu to a single
 *     currency, so today there is one row; the array shape is what keeps a hypothetical second
 *     currency from silently corrupting the total instead of showing up as its own row.
 *   - `tickets.live` and `tickets.byStatus` are different questions. A ticket from yesterday is
 *     live and is not today's; the day is the outlet's business date (016's resolver), not the
 *     clock's, which is what keeps a 00:40 service in one night's figures.
 *
 * No tax figure appears anywhere in these types, because none exists: 014 leaves the tax
 * category unresolved and 017 freezes the rate at zero, and a GST day roll-up would be an
 * invention rather than a read (Phase 4 owns it).
 */

/** The floor's derived counts (016's `restaurant_table_status`, never re-derived here). */
export type DayCovers = {
  total: number;
  available: number;
  occupied: number;
  /** Always zero today: RESERVED has no source until Prompt #08's reservations land. */
  reserved: number;
  cleaning: number;
  outOfService: number;
};

/** Tickets on the pass and in the room. */
export type DayTickets = {
  /** Open RIGHT NOW at this outlet, on any business date. */
  live: number;
  /** Booked on the outlet's business date. */
  today: number;
  /**
   * Status -> count for that same date. Deliberately SPARSE: a status with no tickets today has
   * no key, so an absent entry and a zero mean the same thing and the screen orders the ladder
   * itself rather than trusting jsonb key order.
   */
  byStatus: Partial<Record<OrderStatus, number>>;
};

/** The kitchen's present tense, plus the day's two retired figures. */
export type DayKitchen = {
  openSlips: number;
  linesCooking: number;
  linesRungUp: number;
  /** Sum of `reprint_count` over today's slips (§69's audited act, counted). */
  reprintsToday: number;
  cancelledSlipsToday: number;
};

/** One currency's day. Every amount is TEXT, per §1. */
export type DayMoney = {
  currency: string;
  /** Documents opened today, cancelled ones excluded. */
  documents: number;
  payments: number;
  billed: string;
  collected: string;
  outstanding: string;
};

/** How the money arrived — 017's own method vocabulary. */
export type DayTender = {
  currency: string;
  method: PaymentMethod;
  amount: string;
  payments: number;
};

export type DayOverview = {
  outletId: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  /** The outlet's business date at read time, derived from its own timezone and day start. */
  businessDate: string;
  generatedAt: string;
  covers: DayCovers;
  tickets: DayTickets;
  kitchen: DayKitchen;
  money: DayMoney[];
  tender: DayTender[];
};

/* ====================================================================== menu
 *
 * The menu domain (Prompt #04 §6-§17, migration 014): menus, their ordered categories,
 * the items on them, the modifier groups and options behind an item, and the price
 * HISTORY behind each item.
 *
 * Two facts shape every type below, and both come from the schema rather than taste:
 *
 *   - A menu item has NO price column. Price is a row in `menu_item_prices` — exactly one
 *     open row (`effective_to is null`) plus closed history — so repricing a dish can never
 *     restate an order that already sold it (§13). Anything that shows a price therefore
 *     shows it as a separate read, never as a field of the item.
 *   - Availability is not lifecycle. `status` (DRAFT/ACTIVE/ARCHIVED) says whether the dish
 *     is on the menu at all; `is_available` says whether it can be sold tonight (§10). The
 *     database mirrors the boolean into a STORED generated `availability_status` so the two
 *     spellings of one fact cannot drift, which is why both appear on the type.
 *
 * Money leaves these types as `string`, and the service is what makes that true: a plain
 * SELECT serialises `numeric` as a JSON number, so `menu-service` normalises every money
 * cell at the boundary instead of letting a float walk into a screen (contract §1).
 */

/** A menu's lifecycle: unpublished, published, or retired. */
export type MenuStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

/** A category or modifier has no draft state — it is either on the menu or archived. */
export type MenuCategoryStatus = "ACTIVE" | "ARCHIVED";

/** An item's lifecycle, the same three values as a menu's, and deliberately NOT availability. */
export type MenuItemStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

/** The generated mirror of `is_available`. */
export type AvailabilityStatus = "AVAILABLE" | "UNAVAILABLE";

/** How many options a guest may take from one group (§15). */
export type SelectionType = "SINGLE" | "MULTIPLE";

/** How a price row came to exist; only MANUAL is ever written by a door. */
export type PriceSource = "MANUAL" | "IMPORT" | "MIGRATION";

export const MENU_STATUSES: readonly MenuStatus[] = ["DRAFT", "ACTIVE", "ARCHIVED"];

export const MENU_CATEGORY_STATUSES: readonly MenuCategoryStatus[] = ["ACTIVE", "ARCHIVED"];

export const MENU_ITEM_STATUSES: readonly MenuItemStatus[] = ["DRAFT", "ACTIVE", "ARCHIVED"];

export const AVAILABILITY_STATUSES: readonly AvailabilityStatus[] = [
  "AVAILABLE",
  "UNAVAILABLE",
];

export const SELECTION_TYPES: readonly SelectionType[] = ["SINGLE", "MULTIPLE"];

export const PRICE_SOURCES: readonly PriceSource[] = ["MANUAL", "IMPORT", "MIGRATION"];

/** A `menus` row, camel-cased by the read funnel. Currency is fixed here for the whole menu. */
export type Menu = {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  outletId: EntityId;
  name: string;
  description: string | null;
  status: MenuStatus;
  currency: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  archivedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: EntityId | null;
};

/** A `menu_categories` row. `displayOrder` is unique per menu among live rows. */
export type MenuCategory = {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  outletId: EntityId;
  menuId: EntityId;
  name: string;
  description: string | null;
  imageUrl: string | null;
  displayOrder: number;
  status: MenuCategoryStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: EntityId | null;
};

/**
 * A `menu_items` row.
 *
 * No price, by design (see the section header). `attributes` is the outlet's own JSON bag —
 * the funnel maps the row's top level only, so its keys are never rewritten.
 */
export type MenuItem = {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  outletId: EntityId;
  menuId: EntityId;
  categoryId: EntityId | null;
  name: string;
  shortName: string | null;
  itemCode: string | null;
  description: string | null;
  imageUrl: string | null;
  /** Lowercase slug, extensible on purpose: no cuisine taxonomy is invented here (§9). */
  type: string | null;
  status: MenuItemStatus;
  isAvailable: boolean;
  availabilityStatus: AvailabilityStatus;
  /** Nullable classification flags: present only when the outlet declares them. */
  isVegetarian: boolean | null;
  isNonVegetarian: boolean | null;
  isEgg: boolean | null;
  isVegan: boolean | null;
  attributes: Record<string, unknown>;
  /** An opaque placeholder for the later tax module — deliberately not a foreign key. */
  taxCategoryId: EntityId | null;
  displayOrder: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: EntityId | null;
};

/** A `modifier_groups` row: one question an item asks ("size", "cook level"). */
export type ModifierGroup = {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  outletId: EntityId;
  menuId: EntityId;
  menuItemId: EntityId;
  name: string;
  selectionType: SelectionType;
  minSelections: number;
  maxSelections: number;
  displayOrder: number;
  status: MenuCategoryStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: EntityId | null;
};

/** A `modifiers` row: one answer. `priceAdjustment` is a delta over the item's price. */
export type Modifier = {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  outletId: EntityId;
  menuId: EntityId;
  menuItemId: EntityId;
  groupId: EntityId;
  name: string;
  /** Text, and may be negative (a cheaper swap). */
  priceAdjustment: string;
  displayOrder: number;
  status: MenuCategoryStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: EntityId | null;
};

/** One `menu_item_prices` row: the open row is the current price, the rest is history. */
export type MenuItemPrice = {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  outletId: EntityId;
  menuId: EntityId;
  menuItemId: EntityId;
  unitPrice: string;
  currency: string;
  effectiveFrom: string;
  /** NULL marks the single open (current) row. */
  effectiveTo: string | null;
  source: PriceSource;
  createdAt: string;
  createdBy: EntityId | null;
};

/**
 * `menu_item_current_price`'s own jsonb — keys already camel, money already text.
 *
 * All-null is the honest shape of "this item has no price row yet": the door answers rather
 * than throwing, and a screen that substitutes ₹0 would be inventing money.
 */
export type CurrentPrice = {
  itemId: EntityId;
  unitPrice: string | null;
  currency: string | null;
  effectiveFrom: string | null;
  source: string | null;
};

/** One group inside a snapshot, with the options that were live when it was taken. */
export type SnapshotModifierGroup = {
  groupId: EntityId;
  name: string;
  selectionType: SelectionType;
  minSelections: number;
  maxSelections: number;
  modifiers: { modifierId: EntityId; name: string; priceAdjustment: string }[];
};

/**
 * `menu_snapshot`'s jsonb: the item, its current price and its live modifier groups in one
 * door call, which is exactly what an order line must be priced from (§17).
 *
 * The door exists because a bill line cannot be priced from "whatever the price row is
 * today" — the snapshot is the fact the kitchen served.
 */
export type MenuItemSnapshot = {
  itemId: EntityId;
  itemName: string;
  shortName: string | null;
  itemCode: string | null;
  type: string | null;
  unitPrice: string | null;
  currency: string | null;
  taxCategoryId: EntityId | null;
  isAvailable: boolean;
  availabilityStatus: AvailabilityStatus;
  itemStatus: MenuItemStatus;
  flags: {
    vegetarian: boolean | null;
    nonVegetarian: boolean | null;
    egg: boolean | null;
    vegan: boolean | null;
  };
  attributes: Record<string, unknown>;
  modifierGroups: SnapshotModifierGroup[];
};
