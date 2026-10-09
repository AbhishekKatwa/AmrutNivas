/**
 * The bill — totals, payments and settlement (Prompt #04 §32-§46, migration 017).
 *
 * Six schema facts decide the shape of every function here:
 *
 *   - This service computes NOTHING. 017's `app.calculate_restaurant_totals` is the only
 *     function in the product that may write an order's money, and a bill snapshots that
 *     answer at the moment `open_bill` runs (contract §2). A `subtotal + tax` in TypeScript
 *     would be a second engine, and the two would disagree on a guest's bill. So the amounts
 *     below arrive already decided, and the only arithmetic this file performs is the check
 *     of whether a typed-in payment exceeds what is due — which the door re-answers anyway.
 *   - Money is TEXT on every type here (contract §1). `open_bill` and `record_payment` answer
 *     with `to_jsonb(row)`, so an unconstrained `numeric` reaches JavaScript as a float and
 *     is retyped by `moneyRow` at the boundary before a screen can print it.
 *   - A bill is FROZEN at open time. Repricing the menu, adding a line to another bill of the
 *     same order, or voiding a line afterwards cannot restate an existing bill (§9); the
 *     screen therefore reloads the document rather than reconciling it against a ticket.
 *   - `orders` has no currency column, and a bill does. 017 derives `bills.currency` from the
 *     order's own ACTIVE lines, because one outlet publishes one menu in one currency (014).
 *     Nothing in this file asks the caller for a currency.
 *   - Payments are append-only. A SUCCESSFUL row is immutable (017's guard trigger), so there
 *     is no update or delete verb here: a wrong payment is answered by a new REFUNDED row with
 *     its own reason, which is a manager's verb (`payment.refund`) and not this release's.
 *   - Status is not a button. `bills.status` is derived by `record_payment` from the money it
 *     has seen (OPEN → PARTIALLY_PAID → PAID), and `close_bill` only confirms a document that
 *     is already settled. `cancel_bill` refuses a bill with any money against it.
 *
 * One read has no door: the list of this outlet's unsettled bills. 017 grants `authenticated`
 * SELECT on `bills` under the outlet policy and ships no list function, so `listOpenBills` is
 * a plain SELECT under RLS — the same reasoning 015 states for the floor map. Every single-bill
 * read goes through `bill_detail`, which resolves lines and payments and gates on `bill.view`.
 */

import { requireSupabase } from "@/db/client";
import { asRead, callDoor, camelRows } from "@/db/rpc";
import { moneyRow } from "@/db/money-read";
import { moneyFromRupees } from "@/domain/money/money";
import type { EntityId } from "@/domain/identity/types";
import { newIdempotencyKey } from "./order-service";
import type {
  Bill,
  BillDetail,
  BillLine,
  BillPayment,
  BillStatus,
  PaymentMethod,
} from "./types";

/* --------------------------------------------------------------------- mapping */

const BILL_TABLE = "bills";

/** 017's bills money, all NOT NULL once the door has written them. */
const BILL_MONEY = [
  "subtotal",
  "discountAmount",
  "taxAmount",
  "serviceChargeAmount",
  "roundingAmount",
  "grandTotal",
  "amountPaid",
  "amountDue",
] as const;

const PAYMENT_MONEY = ["amount"] as const;

/** `bill_detail` builds its line objects itself, and `unit_price` is the only money cell. */
const BILL_LINE_MONEY = ["unitPrice"] as const;

const BILL_COLUMNS =
  "id, organization_id, property_id, outlet_id, order_id, bill_number, business_date, " +
  "currency, subtotal, discount_amount, tax_amount, service_charge_amount, rounding_amount, " +
  "grand_total, amount_paid, amount_due, status, opened_at, paid_at, cancelled_at, " +
  "cancelled_by, cancel_reason, idempotency_key, version, created_at, updated_at, created_by";

function billFromWire(raw: Record<string, unknown>): Bill {
  return moneyRow<Bill>(raw, BILL_MONEY);
}

function paymentFromWire(raw: Record<string, unknown>): BillPayment {
  return moneyRow<BillPayment>(raw, PAYMENT_MONEY);
}

function billLineFromWire(raw: Record<string, unknown>): BillLine {
  return moneyRow<BillLine>(raw, BILL_LINE_MONEY);
}

/**
 * `bill_detail`'s answer, mapped level by level.
 *
 * The door returns `{ bill, payments, lines }` where the bill is a raw `to_jsonb` row and the
 * two arrays are nested inside that same jsonb — and `callDoor`'s camel funnel rewrites the
 * TOP level only, on purpose, so a JSON column keeps its own keys. That means every nested
 * row still speaks snake_case and each level is mapped here rather than assumed.
 */
function detailFromWire(raw: Record<string, unknown>): BillDetail {
  const bill = billFromWire(raw.bill as Record<string, unknown>);
  const payments = Array.isArray(raw.payments)
    ? raw.payments.map((row) => paymentFromWire(row as Record<string, unknown>))
    : [];
  const lines = Array.isArray(raw.lines)
    ? raw.lines.map((row) => billLineFromWire(row as Record<string, unknown>))
    : [];
  return { bill, payments, lines };
}

/* ------------------------------------------------------------------ pure rules */

/**
 * The two states a cashier can still act on.
 *
 * A PAID bill has nothing left to pay and a CANCELLED one is retired money, so 017 refuses
 * both (`NIVAAS_BILL_CANCELLED`, and an overpayment refusal on a settled one); the screen says
 * so instead of offering a sheet that can only fail.
 */
export function billAcceptsPayment(status: BillStatus): boolean {
  return status === "OPEN" || status === "PARTIALLY_PAID";
}

/**
 * Nothing left due AND not yet handed over: `close_bill` stamps `paid_at` and keeps the status
 * PAID, so without the paid_at guard the Close bill button rendered forever on a closed
 * document, each click re-stamping the door and writing another audit row. Read as an integer,
 * never as a float: `amount_due` is TEXT precisely so a comparison like this one cannot be the
 * place where ₹0.01 turns into `1e-18` and a settled bill looks unpaid (contract §1).
 */
export function billIsSettled(bill: Bill): boolean {
  return (
    bill.paidAt === null &&
    (bill.status === "PAID" || moneyFromRupees(bill.amountDue, bill.currency).minor === 0n)
  );
}

/**
 * `cancel_bill`'s one precondition, read off the bill rather than the status: the door
 * refuses the moment any money has been booked against the document. A PAID status with
 * money is therefore uncancelable even though it is not "settled and handed over" yet.
 */
export function billIsCancellable(bill: Bill): boolean {
  return (
    bill.status !== "CANCELLED" && moneyFromRupees(bill.amountPaid, bill.currency).minor === 0n
  );
}

/**
 * Does this typed-in amount fit the balance?
 *
 * A convenience for the counter, not a rule: `record_payment` re-answers the question against
 * the locked bill and refuses anything larger (`NIVAAS_INVALID_MONEY`), because between the
 * keystroke and the door another payment may have landed. A split bill across several
 * documents is #05's work, so today an overpayment is a mistake rather than an intent.
 */
export function paymentWithinBalance(bill: Bill, amount: string): boolean {
  const due = moneyFromRupees(bill.amountDue, bill.currency);
  return moneyFromRupees(amount, due.currency).minor <= due.minor;
}

/* ----------------------------------------------------------------------- reads */

/**
 * The outlet's unsettled bills, newest document first.
 *
 * A plain SELECT, because 017 ships no list door: RLS's outlet policy is the tenant wall, and
 * the same triple the floor scopes by is stated here so a screen never sees a bill it could
 * not read back through `bill_detail`.
 */
export async function listOpenBills(scope: {
  organizationId: EntityId;
  propertyId: EntityId;
  outletId: EntityId;
}): Promise<Bill[]> {
  const chain = requireSupabase()
    .from(BILL_TABLE)
    .select(BILL_COLUMNS)
    .eq("organization_id", scope.organizationId)
    .eq("property_id", scope.propertyId)
    .eq("outlet_id", scope.outletId)
    .in("status", ["OPEN", "PARTIALLY_PAID"]);
  const raw = await camelRows<Record<string, unknown>>(asRead(chain.order("bill_number")));
  return raw.map((row) => billFromWire(row));
}

/**
 * The live bill of one order, if it has been opened yet.
 *
 * This is what lets the till answer "has this ticket been billed?" without a second door: a
 * CANCELLED bill is excluded because 017's `open_bill` refuses only a NON-cancelled existing
 * bill, so a cancelled document is history and a fresh bill is legitimate.
 */
export async function findBillForOrder(orderId: EntityId): Promise<Bill | null> {
  const chain = requireSupabase()
    .from(BILL_TABLE)
    .select(BILL_COLUMNS)
    .eq("order_id", orderId)
    .neq("status", "CANCELLED");
  const [row] = await camelRows<Record<string, unknown>>(asRead(chain.order("bill_number")));
  return row === undefined ? null : billFromWire(row);
}

/** One bill whole: the document, every payment booked on it, and the lines it prints. */
export async function loadBillDetail(billId: EntityId): Promise<BillDetail> {
  return detailFromWire(await callDoor<Record<string, unknown>>("bill_detail", { bill: billId }));
}

/* ---------------------------------------------------------------------- writes */

export type OpenBill = {
  /** The ticket to bill. 017 derives the org, property, outlet, business date and currency off it. */
  orderId: EntityId;
  /** §6: the same key replays the first bill instead of minting a second BILL number. */
  idempotencyKey?: string;
};

export type RecordBillPayment = {
  billId: EntityId;
  /** Rupees as TEXT ("280.00"); a numeric door parameter that arrives through a float does not. */
  amount: string;
  method: PaymentMethod;
  /** The gateway/card/UPI trace the counter was handed. Stored verbatim, resolved by nothing. */
  referenceId?: string;
  notes?: string;
  idempotencyKey?: string;
  /** §5: the version the cashier's screen read, so a concurrent payment cannot be lost. */
  expectedVersion?: number;
};

export type CloseBill = {
  billId: EntityId;
  /** Mandatory in 017 (`app.require_reason`): closing is an act on a printed document. */
  reason: string;
  expectedVersion?: number;
};

export type CancelBill = {
  billId: EntityId;
  reason: string;
  expectedVersion?: number;
};

/**
 * Open the bill for a ticket (§41). The door snapshots the engine's totals, mints the BILL
 * number, and moves the ORDER to SERVED through 016's own state machine — so an order that is
 * still PREPARING is refused here rather than billed half-cooked.
 */
export async function openBill(input: OpenBill): Promise<Bill> {
  const raw = await callDoor<Record<string, unknown>>("open_bill", {
    order: input.orderId,
    idempotencyKey: input.idempotencyKey,
  });
  return billFromWire(raw);
}

/**
 * Book money against a bill. The door recomputes `amount_paid`, `amount_due` and the status,
 * and returns the PAYMENT row it wrote — so a caller that needs the bill's new balance reloads
 * the document rather than subtracting here.
 */
export async function recordBillPayment(input: RecordBillPayment): Promise<BillPayment> {
  const raw = await callDoor<Record<string, unknown>>("record_payment", {
    bill: input.billId,
    amount: input.amount,
    method: input.method,
    referenceId: input.referenceId,
    notes: input.notes,
    idempotencyKey: input.idempotencyKey,
    expectedVersion: input.expectedVersion,
  });
  return paymentFromWire(raw);
}

/** Mark a settled bill closed and hand it over (017's `close_bill`). */
export async function closeBill(input: CloseBill): Promise<Bill> {
  const raw = await callDoor<Record<string, unknown>>("close_bill", {
    bill: input.billId,
    reason: input.reason,
    expectedVersion: input.expectedVersion,
  });
  return billFromWire(raw);
}

/** Retire an unpaid bill with a recorded reason. A bill with money on it cannot be cancelled. */
export async function cancelBill(input: CancelBill): Promise<Bill> {
  const raw = await callDoor<Record<string, unknown>>("cancel_bill", {
    bill: input.billId,
    reason: input.reason,
    expectedVersion: input.expectedVersion,
  });
  return billFromWire(raw);
}

/** A fresh key for one intended bill/payment, shared with the till's own generator (§6). */
export function newBillIdempotencyKey(): string {
  return newIdempotencyKey("bill");
}
