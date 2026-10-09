/**
 * The kitchen — firing lines onto a slip and ringing them up (Prompt #04 §25-§26, §52, §69;
 * migration 018).
 *
 * Five schema facts decide the shape of every function here:
 *
 *   - A slip is a PRINT UNIT, not a bill. `kitchen_order_tickets` carries no money of its own;
 *     its lines keep pointing at it through `order_items.kot_id`, and a reprint re-emits the
 *     same row rather than minting a new one. `reprint_count` is therefore the ticket's own
 *     footprint of how often it reached the pass (§69: a second slip can double a plate, so a
 *     reprint is permission-gated, reason-bearing and audited — never a no-op).
 *   - Two statuses, two truths. `order_items.status` is the SALES fact (ACTIVE/VOIDED) and
 *     `fire_status` is the KITCHEN fact (NOT_FIRED/FIRED/READY). They are independent columns,
 *     so a voided line can be NOT_FIRED and a fired line can still be ACTIVE — and no code
 *     here may treat one as a synonym for the other.
 *   - The ladders live in `app`. 018 defines exactly two edges for fire state
 *     (NOT_FIRED→FIRED, FIRED→READY) and two for a ticket (OPEN→CLOSED, OPEN→CANCELLED), and
 *     the only door that can write a fire state is `set_order_item_fire_status`, which accepts
 *     READY alone. So a cook cannot un-ring a plate, and a closed slip cannot be reopened; the
 *     `KOT_FIRE`/`KOT_ADVANCE` maps below exist only to offer the right button.
 *   - Which capability gates which verb is not uniform, and it is deliberate: `send_kot` needs
 *     `kot.create`, the kitchen's own queue reads and rings up on `kot.view` (the capability a
 *     KITCHEN_MANAGER actually holds), a mis-send needs `kot.cancel`, and a reprint
 *     `kot.reprint`. A screen that assumed one verb for the whole pass would offer the cook a
 *     button the database refuses.
 *   - SEND means the UNFIRED REMAINDER. `send_kot` takes the list of line ids the cashier
 *     names; without `p_include_fired` every one of them must still be NOT_FIRED, and a line
 *     already fired only travels onto the new slip when the caller says so. Silently dropping
 *     half an array a cashier named is how a plate goes missing, so this file states which
 *     lines it is about to send rather than inferring it.
 *
 * A double-tapped SEND cannot fire twice: the key below is 018's replay wall (a unique partial
 * index, and the door answers with the first slip).
 */

import { callDoor } from "@/db/rpc";
import { toCamelCase } from "@/db/case";
import { moneyRow } from "@/db/money-read";
import type { EntityId } from "@/domain/identity/types";
import { newIdempotencyKey } from "./order-service";
import type {
  KitchenTicket,
  KitchenTicketDetail,
  KitchenTicketLine,
  KitchenTicketLineModifier,
  KotStatus,
  OrderLine,
  OrderLineDetail,
  OrderItemFireStatus,
  OrderStatus,
  OpenKotSummary,
} from "./types";

/* --------------------------------------------------------------------- mapping */

/** The two money cells on an `order_items` row, same list `order-service` maps. */
const LINE_MONEY = ["unitPrice", "taxRate"] as const;

const KOT_LINE_MONEY = ["unitPrice"] as const;

const KOT_MODIFIER_MONEY = ["priceAdjustment"] as const;

function ticketFromWire(raw: Record<string, unknown>): KitchenTicket {
  // A slip holds no money, so there is nothing to retype — `to_jsonb` of the row is the whole
  // answer and the camel funnel reaches every one of its keys.
  return toCamelCase<KitchenTicket>(raw);
}

function kotModifierFromWire(raw: Record<string, unknown>): KitchenTicketLineModifier {
  return moneyRow<KitchenTicketLineModifier>(raw, KOT_MODIFIER_MONEY);
}

/**
 * One line of `kot_detail`'s answer.
 *
 * The door builds these objects itself and already casts `unit_price` to text, so the money
 * retype is a no-op kept for the day a door answers with `to_jsonb` instead. The `modifiers`
 * array is nested inside the line, which the top-level funnel never reaches — hence the
 * explicit mapping, the same reason `order-service` maps its own items by hand.
 */
function kotLineFromWire(raw: Record<string, unknown>): KitchenTicketLine {
  const { modifiers, ...line } = raw;
  const mapped = moneyRow<KitchenTicketLine>(line, KOT_LINE_MONEY);
  const chosen = Array.isArray(modifiers)
    ? modifiers.map((row) => kotModifierFromWire(row as Record<string, unknown>))
    : [];
  return { ...mapped, modifiers: chosen };
}

/** `kot_detail`: the slip as the printer received it, in 016's own line order. */
function kotDetailFromWire(raw: Record<string, unknown>): KitchenTicketDetail {
  const ticket = ticketFromWire(raw);
  const lines = Array.isArray(raw.lines)
    ? raw.lines.map((row) => kotLineFromWire(row as Record<string, unknown>))
    : [];
  return { ...ticket, lines };
}

/**
 * `open_kots`' queue row.
 *
 * The door emits both counts as text — the same §1 habit it uses for money — and they are
 * counts, not amounts, so they become numbers here once instead of every tile comparing
 * `"3"` with `3`.
 */
function openKotFromWire(raw: Record<string, unknown>): OpenKotSummary {
  return {
    id: raw.id as EntityId,
    kotNumber: raw.kotNumber as string,
    orderId: raw.orderId as EntityId,
    orderNumber: raw.orderNumber as string,
    businessDate: raw.businessDate as string,
    status: raw.status as KotStatus,
    firedAt: raw.firedAt as string,
    reprintCount: Number(raw.reprintCount),
    stationId: (raw.stationId as EntityId) ?? null,
    stationName: (raw.stationName as string) ?? null,
    firedCount: Number(raw.lineCount),
    readyCount: Number(raw.readyCount),
  };
}

/* ------------------------------------------------------------------ pure rules */

/**
 * The fire edges 018 declares (018's `app.require_kot_fire_transition`). A display aid: the
 * door re-asks the question on every call and its refusal is the authority (§7).
 */
export const KOT_FIRE_ADVANCE: Readonly<
  Record<OrderItemFireStatus, readonly OrderItemFireStatus[]>
> = {
  NOT_FIRED: ["FIRED"],
  FIRED: ["READY"],
  READY: [],
};

/** A ticket is workable while OPEN; CLOSED and CANCELLED are both terminal (018). */
export function kotIsLive(status: KotStatus): boolean {
  return status === "OPEN";
}

/**
 * The lines a SEND would take tonight.
 *
 * ACTIVE and NOT_FIRED, exactly: a voided line has no plate to cook, and a FIRED line only
 * moves to the new slip when the caller deliberately asks to consolidate it (§26). This is the
 * list the screen shows the cashier BEFORE calling `send_kot`, so what is named is what fires.
 */
export function firableLines(ticket: { lines: OrderLineDetail[] }): OrderLineDetail[] {
  return ticket.lines.filter(
    (line) => line.status === "ACTIVE" && line.fireStatus === "NOT_FIRED",
  );
}

/** Lines already on a slip that a consolidation SEND would carry over. */
export function firedLines(ticket: { lines: OrderLineDetail[] }): OrderLineDetail[] {
  return ticket.lines.filter(
    (line) => line.status === "ACTIVE" && line.fireStatus === "FIRED",
  );
}

/**
 * The order statuses a SEND may start from (018's own gate): a DRAFT is not yet a ticket, and
 * anything at READY or beyond has been cooked and served — the kitchen has no work left to be
 * given. A refusal is `NIVAAS_INVALID_TRANSITION`, and the door's word is final.
 */
export const KOT_SENDABLE_ORDER_STATUSES: readonly OrderStatus[] = [
  "PLACED",
  "CONFIRMED",
  "PREPARING",
];

export function orderCanSendKot(status: OrderStatus): boolean {
  return KOT_SENDABLE_ORDER_STATUSES.includes(status);
}

/* ----------------------------------------------------------------------- reads */

/**
 * The kitchen's queue for one outlet: every OPEN slip, oldest send first.
 *
 * Door-read rather than a table read because it is a resolved view (it joins the order for its
 * number and counts the lines by fire state) and it gates on `kot.view`.
 */
export async function listOpenKots(outletId: EntityId): Promise<OpenKotSummary[]> {
  const result = await callDoor<{ outletId: EntityId; kots: unknown[] }>("open_kots", {
    outlet: outletId,
  });
  return result.kots.map((row) => openKotFromWire(row as Record<string, unknown>));
}

/** One slip whole, exactly as the printer was handed it. */
export async function loadKot(kotId: EntityId): Promise<KitchenTicketDetail> {
  return kotDetailFromWire(await callDoor<Record<string, unknown>>("kot_detail", { kot: kotId }));
}

/* ---------------------------------------------------------------------- writes */

export type SendKot = {
  /** The ticket whose lines are firing. Org, property, outlet and business date come off it. */
  orderId: EntityId;
  /** The line ids to fire. An empty array is refused (`NIVAAS_KOT_EMPTY`), never ignored. */
  itemIds: EntityId[];
  note?: string;
  /** Carry lines already fired onto this new slip — a consolidation, and a deliberate one. */
  includeFired?: boolean;
  /** §5: the order's version the cashier's screen read. */
  expectedVersion?: number;
  idempotencyKey?: string;
};

export type RingUpLine = {
  itemId: EntityId;
  /**
   * The only value 018 accepts today. Typed as the whole fire union so a caller cannot invent
   * a status; the door refuses anything but READY with `NIVAAS_INVALID_STATUS`.
   */
  fireStatus: OrderItemFireStatus;
  reason?: string;
};

export type CancelKot = {
  kotId: EntityId;
  /** Mandatory: a retired slip is §52's shape — permission, valid state, recorded reason. */
  reason: string;
};

export type ReprintKot = {
  kotId: EntityId;
  reason: string;
};

/**
 * Fire the named lines onto a new slip. The door mints the KOT number from 016's counter,
 * moves each line to FIRED through the fire machine, and drives the ORDER to PREPARING through
 * 016's own ladder — so one SEND is what tells the kitchen the room has work.
 */
export async function sendKot(input: SendKot): Promise<KitchenTicket> {
  const raw = await callDoor<Record<string, unknown>>("send_kot", {
    order: input.orderId,
    itemIds: input.itemIds,
    note: input.note,
    includeFired: input.includeFired,
    expectedVersion: input.expectedVersion,
    idempotencyKey: input.idempotencyKey,
  });
  return ticketFromWire(raw);
}

/**
 * The cook rings a line up at the pass. When the last FIRED line of a slip rings up, 018
 * auto-CLOSES that slip and audits the closure — so a screen never calls a close verb, and a
 * ticket's life ends when its work does rather than when someone remembers to press a button.
 */
export async function ringUpLine(input: RingUpLine): Promise<OrderLine> {
  const raw = await callDoor<Record<string, unknown>>("set_order_item_fire_status", {
    item: input.itemId,
    fireStatus: input.fireStatus,
    reason: input.reason,
  });
  return moneyRow<OrderLine>(raw, LINE_MONEY);
}

/**
 * Retire a mis-send. OPEN only, and the line rule is the point: FIRED lines go back to
 * NOT_FIRED and detach from the retired slip so a corrected SEND can pick them up, while a
 * READY line keeps its state and its ticket — the cook made that plate, and the kitchen's
 * record must not be restated (§26's honesty).
 */
export async function cancelKot(input: CancelKot): Promise<KitchenTicket> {
  const raw = await callDoor<Record<string, unknown>>("cancel_kot", {
    kot: input.kotId,
    reason: input.reason,
  });
  return ticketFromWire(raw);
}

/** Re-emit the same slip. Counted on the ticket, reason-bearing, and audited (§69). */
export async function reprintKot(input: ReprintKot): Promise<KitchenTicket> {
  const raw = await callDoor<Record<string, unknown>>("reprint_kot", {
    kot: input.kotId,
    reason: input.reason,
  });
  return ticketFromWire(raw);
}

/** A fresh key for one intended SEND (§6), shared with the till's own generator. */
export function newKotIdempotencyKey(): string {
  return newIdempotencyKey("kot");
}
