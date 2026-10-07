/**
 * The outlet's trading day — one read, no arithmetic (Prompt #04 §52; contract §1, §2; 019).
 *
 * What this file deliberately is not: a place where totals are worked out. A day's billed,
 * collected and outstanding figures are sums over documents the calculation engine (017) wrote,
 * and contract §2 permits exactly one engine for money — the Phase 1 exit gate is the printed
 * bill, the Z-report and the outlet revenue figure AGREEING, which a client-side `reduce` could
 * only ever break. 019 does the summing in `numeric` and hands back text, and the whole of this
 * file is retyping and ordering what it says.
 *
 * Three shapes come from the door rather than from taste:
 *
 *   - Money comes as an ARRAY PER CURRENCY. 014 pins an outlet's menu to one currency, so today
 *     there is one row; a screen that assumed `money[0]` and defaulted the rest to zero would
 *     be silently wrong the day two are in play, so every figure below is printed per row and
 *     never blended.
 *   - `tickets.byStatus` is sparse: 019's `jsonb_object_agg` only emits statuses that occurred,
 *     and jsonb key order is not a sort. `ticketRows` below is therefore what puts the day's
 *     counts in ORDER_STATUSES' own ladder order — the order a manager reads a service in.
 *   - `covers.reserved` is always zero today. 016's derived view has the §20 precedence slot for
 *     reservations and no source table to fill it, so the honest display is a stated absence,
 *     not a hidden one — and Prompt #08's reservations land into the same read unchanged.
 */

import { callDoor } from "@/db/rpc";
import { moneyFromRupees } from "@/domain/money/money";
import type { EntityId } from "@/domain/identity/types";
import {
  ORDER_STATUSES,
  type DayCovers,
  type DayKitchen,
  type DayMoney,
  type DayOverview,
  type DayTender,
  type DayTickets,
  type OrderStatus,
  type PaymentMethod,
} from "./types";

/* --------------------------------------------------------------------- mapping */

/**
 * A count off the wire.
 *
 * 019 casts every aggregate to `int`, so a count is a JSON number here — the one exception to
 * the money rule, because a count is not an amount and nothing rounds it. `Number` is applied
 * rather than asserted because PostgREST has historically serialised a `bigint` sum as a string,
 * and `reprintsToday` is the one figure that could plausibly become one.
 */
function countCell(value: unknown): number {
  if (typeof value === "number") return value;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** A money cell that left the door as `::text`, kept as text (contract §1). */
function amountCell(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "0");
}

function coversFromWire(raw: unknown): DayCovers {
  const cell = (raw ?? {}) as Record<string, unknown>;
  return {
    total: countCell(cell.total),
    available: countCell(cell.available),
    occupied: countCell(cell.occupied),
    reserved: countCell(cell.reserved),
    cleaning: countCell(cell.cleaning),
    outOfService: countCell(cell.outOfService),
  };
}

/**
 * The door's sparse status map, read key by key.
 *
 * Only a key 019 actually emitted is carried over; an absent status stays absent rather than
 * becoming a zero that looks like a fact about a status nobody booked today.
 */
function ticketsFromWire(raw: unknown): DayTickets {
  const cell = (raw ?? {}) as Record<string, unknown>;
  const wire = (cell.byStatus ?? {}) as Record<string, unknown>;
  const byStatus: Partial<Record<OrderStatus, number>> = {};
  for (const status of ORDER_STATUSES) {
    const count = wire[status];
    if (typeof count === "number" || typeof count === "string") byStatus[status] = countCell(count);
  }
  return { live: countCell(cell.live), today: countCell(cell.today), byStatus };
}

function kitchenFromWire(raw: unknown): DayKitchen {
  const cell = (raw ?? {}) as Record<string, unknown>;
  return {
    openSlips: countCell(cell.openSlips),
    linesCooking: countCell(cell.linesCooking),
    linesRungUp: countCell(cell.linesRungUp),
    reprintsToday: countCell(cell.reprintsToday),
    cancelledSlipsToday: countCell(cell.cancelledSlipsToday),
  };
}

function moneyFromWire(raw: unknown): DayMoney[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const cell = row as Record<string, unknown>;
    return {
      currency: String(cell.currency ?? ""),
      documents: countCell(cell.documents),
      payments: countCell(cell.payments),
      billed: amountCell(cell.billed),
      collected: amountCell(cell.collected),
      outstanding: amountCell(cell.outstanding),
    };
  });
}

function tenderFromWire(raw: unknown): DayTender[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const cell = row as Record<string, unknown>;
    return {
      currency: String(cell.currency ?? ""),
      method: String(cell.method ?? "OTHER") as PaymentMethod,
      amount: amountCell(cell.amount),
      payments: countCell(cell.payments),
    };
  });
}

/**
 * 019's whole answer.
 *
 * The door builds its own jsonb with camelCase keys (the 018 precedent), so the funnel's
 * top-level camel pass is a no-op here and each nested block is still mapped by hand — nested
 * objects are the part `callDoor` deliberately never rewrites.
 */
function overviewFromWire(raw: Record<string, unknown>): DayOverview {
  return {
    outletId: raw.outletId as EntityId,
    organizationId: raw.organizationId as EntityId,
    propertyId: raw.propertyId as EntityId,
    businessDate: String(raw.businessDate ?? ""),
    generatedAt: String(raw.generatedAt ?? ""),
    covers: coversFromWire(raw.covers),
    tickets: ticketsFromWire(raw.tickets),
    kitchen: kitchenFromWire(raw.kitchen),
    money: moneyFromWire(raw.money),
    tender: tenderFromWire(raw.tender),
  };
}

/* ------------------------------------------------------------------ pure rules */

/**
 * The day's tickets, in the order the order ladder states them.
 *
 * A sparse map in jsonb order would render DRAFT after COMPLETED for no reason a manager can
 * see; ORDER_STATUSES is the same array 016's CHECK is compared against, so the display order
 * and the state machine cannot drift apart.
 */
export function ticketRows(tickets: DayTickets): { status: OrderStatus; count: number }[] {
  return ORDER_STATUSES.filter((status) => tickets.byStatus[status] !== undefined).map(
    (status) => ({ status, count: tickets.byStatus[status] ?? 0 }),
  );
}

/** The covers seated right now — the figure a floor manager reads first. */
export function seatedCovers(covers: DayCovers): number {
  return covers.occupied;
}

/** How many covers tonight can actually take a guest. */
export function seatableCovers(covers: DayCovers): number {
  return covers.available;
}

/**
 * Is there nothing in play at all?
 *
 * Three independent empties, because a quiet moment and a broken read look identical otherwise:
 * no live ticket, no open slip, and no document opened on this business date. A day with bills
 * but no live work is not quiet — it is a service being settled.
 */
export function dayIsQuiet(overview: DayOverview): boolean {
  return (
    overview.tickets.live === 0 &&
    overview.kitchen.openSlips === 0 &&
    overview.money.length === 0
  );
}

/**
 * Does this currency's day still have money out?
 *
 * An integer comparison on paise, never a float on rupees (§1): the outstanding figure decides
 * whether the screen says "settled" or names what is still due, and a 0.001 error there is a
 * manager told the wrong thing about a guest's bill.
 */
export function currencyStillOutstanding(money: DayMoney): boolean {
  return moneyFromRupees(money.outstanding, money.currency).minor > 0n;
}

/** The work a manager is short of: plates still cooking on the pass. */
export function cookingLines(overview: DayOverview): number {
  return overview.kitchen.linesCooking;
}

/**
 * The tender rows for one currency, in the door's own order.
 *
 * Filtering rather than re-adding: 019 already grouped by method, and a screen that summed the
 * methods again would be a second engine for the same money §2 protects.
 */
export function tenderFor(tender: readonly DayTender[], currency: string): DayTender[] {
  return tender.filter((row) => row.currency === currency);
}

/* ----------------------------------------------------------------------- reads */

/**
 * The active outlet's business day, in one call.
 *
 * Door-read rather than six table reads because it is a resolved, aggregated view across five
 * tables and one view, and because its gate is `restaurant.view` — a plain SELECT could not
 * answer the same question without the client doing the arithmetic the contract forbids.
 */
export async function loadDayOverview(outletId: EntityId): Promise<DayOverview> {
  return overviewFromWire(
    await callDoor<Record<string, unknown>>("restaurant_day_overview", { outlet: outletId }),
  );
}
