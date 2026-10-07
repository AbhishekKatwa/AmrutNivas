/**
 * The bill — the outlet's documents, the money booked on them, and settlement
 * (Prompt #04 §32-§46, migration 017).
 *
 * The screen never chooses its own scope: `organizationId` + `propertyId` + `outletId` come
 * from the context store, and an outlet IS the restaurant (contract §12). With no outlet
 * selected it renders the deliberate "choose an outlet first" state.
 *
 * Seven schema facts decide what this screen can show, and each one is visible rather than
 * hidden:
 *
 *   - It computes NOTHING. `app.calculate_restaurant_totals` is the only function in the
 *     product that may write an order's money, and a bill is that answer frozen at the moment
 *     `open_bill` ran (§2, §9). Every figure below arrives as text and is printed as text; a
 *     `subtotal + tax` in TypeScript would be a second engine, and the two would eventually
 *     disagree on a guest's bill. The one comparison this file makes — does the typed amount
 *     fit the balance — is a convenience, and `record_payment` re-answers it against the
 *     locked row.
 *   - Money is TEXT everywhere (contract §1). PostgREST serialises an unconstrained `numeric`
 *     as a JSON number, and a float that has been through IEEE-754 is how ₹280 prints as
 *     279.99999999999994. `bill-service` retypes at the boundary; a typed amount is sent as
 *     the text the cashier entered, so a payment never becomes a float on the way in either.
 *   - A bill is FROZEN. Repricing a dish, adding a line to the ticket, or voiding one after
 *     the fact cannot restate a document that already exists — which is why the panel reloads
 *     from the door instead of reconciling against the live ticket.
 *   - TAX READS ZERO BY CONSTRUCTION. There is no tax rate anywhere in this schema: 014 makes
 *     `menu_items.tax_category_id` a deliberately unresolved placeholder and 017 gives
 *     `order_items.tax_rate` a default of 0 that no door can fill. So a bill here is untaxed
 *     until the GST module lands, and the screen says so rather than letting a ₹0.00 line look
 *     like a mistake.
 *   - Only a READY ticket can be billed. `open_bill` gates the order at READY or SERVED and
 *     moves it to SERVED through 016's own state machine, so a ticket still cooking is refused
 *     rather than half-billed (§7).
 *   - A bill's status is not a button. `record_payment` derives OPEN → PARTIALLY_PAID → PAID
 *     from the money it has actually seen; `close_bill` only confirms a document that is
 *     already settled, and `cancel_bill` refuses the instant any money is against it.
 *   - A double tap cannot charge twice. The payment sheet mints ONE idempotency key when it
 *     opens and reuses it for every retry of that intended payment, so a retry of a submit
 *     that already landed replays the first PAY row (§6).
 *
 * Everything worth asserting (scope, the billable-order rule, the amount field's refusal,
 * which verbs a given document still allows) is an exported pure function beside the component.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  Check,
  CreditCard,
  LogIn,
  Plus,
  Receipt,
  RefreshCw,
  Store,
  Wallet,
  X,
} from "lucide-react";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { LoadingBlock } from "@/components/ui/Spinner";
import { SelectInput, type SelectOption } from "@/components/ui/SelectInput";
import { StatusPill } from "@/components/ui/StatusPill";
import { TextInput } from "@/components/ui/TextInput";
import { Textarea } from "@/components/ui/Textarea";
import { can, type ActiveContext, type EntityId } from "@/domain/identity/types";
import {
  formatMoneyText,
  parseMoneyInput,
  type MoneyInputReject,
} from "@/domain/money/money";
import {
  billAcceptsPayment,
  billIsCancellable,
  billIsSettled,
  findBillForOrder,
  listOpenBills,
  loadBillDetail,
  newBillIdempotencyKey,
  openBill,
  paymentWithinBalance,
  closeBill,
  cancelBill,
  recordBillPayment,
  type OpenBill,
  type RecordBillPayment,
} from "@/domain/restaurant/bill-service";
import { listOpenOrders, newIdempotencyKey } from "@/domain/restaurant/order-service";
import {
  PAYMENT_METHODS,
  type Bill,
  type BillDetail,
  type BillLine,
  type BillPayment,
  type OpenOrder,
  type OrderStatus,
  type PaymentMethod,
} from "@/domain/restaurant/types";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

const NO_BACKEND_COPY =
  "This build has no backend configured, so it cannot read or save data.";

/* ------------------------------------------------------------------ pure rules */

/** Which surface the screen shows for the session state — never a permanent spinner. */
export type BillPageView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_outlet"
  | "scoped";

export function pageStatusFor(status: ContextStatus, context: ActiveContext): BillPageView {
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

export type BillScope = {
  organizationId: EntityId;
  propertyId: EntityId;
  outletId: EntityId;
};

export function billScopeFor(context: ActiveContext): BillScope | null {
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
 * The tickets the bill screen may take.
 *
 * READY or SERVED, and nothing else: 017's `open_bill` gates the order on exactly those two
 * and refuses the rest with `NIVAAS_INVALID_ORDER_STATUS`, because billing a ticket that is
 * still cooking would print a document for plates the kitchen has not made. A CANCELLED or
 * VOID order is not in `open_orders` at all — a terminal ticket's history is its bill and the
 * audit trail, not a counter.
 */
export const BILLABLE_ORDER_STATUSES: readonly OrderStatus[] = ["READY", "SERVED"];

export function billableOrders(orders: OpenOrder[]): OpenOrder[] {
  return orders.filter((order) => BILLABLE_ORDER_STATUSES.includes(order.status));
}

/**
 * A bill that already exists for the selected ticket wins over the offer to open one.
 *
 * `open_bill` refuses a second live document (`NIVAAS_BILL_ALREADY_OPEN`); a cashier who is
 * shown "already billed" and a link to that document is being told the same fact the door
 * holds, one keystroke earlier.
 */
export function billForOrder(bills: Bill[], orderId: EntityId): Bill | null {
  return bills.find((bill) => bill.orderId === orderId) ?? null;
}

/** The money identity of a ticket is the currency frozen on its lines (016 has none on the order). */
export function orderCurrency(order: OpenOrder): string {
  return order.lines[0]?.currency ?? "INR";
}

/** The printed figure, or the sentence that explains its absence — never a silent zero. */
export function moneyOrDash(amount: string | null, currency: string): string {
  return amount === null ? "—" : formatMoneyText(amount, currency);
}

/**
 * A bill's rows, in the order a printed document states them.
 *
 * Discount, service charge and rounding are listed even when zero, because a guest reading a
 * bill is reading which lines the restaurant chose NOT to charge for. Tax carries the note
 * that no tax engine exists in this build yet.
 */
export function billMoneyRows(
  bill: Bill,
): { label: string; amount: string; note?: string }[] {
  return [
    { label: "Subtotal", amount: bill.subtotal },
    { label: "Discount", amount: bill.discountAmount },
    {
      label: "Tax",
      amount: bill.taxAmount,
      note: "No tax engine in this build yet — the GST module owns rates.",
    },
    { label: "Service charge", amount: bill.serviceChargeAmount },
    { label: "Rounding", amount: bill.roundingAmount },
    { label: "Grand total", amount: bill.grandTotal },
    { label: "Received", amount: bill.amountPaid },
    { label: "Balance due", amount: bill.amountDue },
  ];
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  CARD: "Card",
  UPI: "UPI",
  BANK_TRANSFER: "Bank transfer",
  WALLET: "Wallet",
  OTHER: "Other",
};

export function paymentMethodOptions(): SelectOption<PaymentMethod>[] {
  return PAYMENT_METHODS.map((method) => ({
    value: method,
    label: PAYMENT_METHOD_LABELS[method],
  }));
}

/** Why a typed amount was refused, in the field's own words. */
export const MONEY_REJECT_COPY: Record<MoneyInputReject, string> = {
  BLANK: "Enter the amount received.",
  NOT_A_NUMBER: "Enter an amount like 280 or 280.50.",
  TOO_PRECISE: "An amount goes to two decimal places.",
  NEGATIVE: "A payment cannot be negative.",
};

/**
 * The payment sheet's own gate: the amount must parse AND fit the balance.
 *
 * `record_payment` checks both again against the locked bill (`NIVAAS_INVALID_MONEY`), so this
 * is a keystroke-saving mirror rather than a rule — and a mirror that refuses too eagerly is
 * always the safer direction on money.
 */
export function paymentFieldError(
  bill: Bill,
  text: string,
): { fatal: boolean; message: string } | null {
  const parsed = parseMoneyInput(text, bill.currency);
  if (!parsed.ok) {
    return { fatal: true, message: MONEY_REJECT_COPY[parsed.reason] };
  }
  if (parsed.amount.minor === 0n) {
    return { fatal: true, message: MONEY_REJECT_COPY.BLANK };
  }
  if (!paymentWithinBalance(bill, text)) {
    return {
      fatal: false,
      message: `More than the ${formatMoneyText(bill.amountDue, bill.currency)} balance. One bill is settled by one set of payments today; splitting a bill across documents is a later phase.`,
    };
  }
  return null;
}

/**
 * A line on the printed document.
 *
 * A VOIDED line is listed and struck through with zero effect on the totals: the engine sums
 * only ACTIVE lines (017), so the bill has to say out loud what was taken off it — otherwise a
 * guest reads a missing plate as a quiet overcharge.
 */
export function lineIsVoided(line: BillLine): boolean {
  return line.status !== "ACTIVE";
}

/** What the cashier is being asked to confirm, per verb — the three reason sheets in one place. */
export type BillAction = "close" | "cancel";

export function actionCopy(action: BillAction, bill: Bill): {
  title: string;
  intro: string;
  confirm: string;
  destructive: boolean;
} {
  return action === "close"
    ? {
        title: `Close ${bill.billNumber}`,
        intro: "Closing hands the document over. The balance is already nil — the door re-checks it and refuses if another payment has landed since this screen read the bill.",
        confirm: "Close bill",
        destructive: false,
      }
    : {
        title: `Cancel ${bill.billNumber}`,
        intro: "Cancelling retires a bill that has taken no money. It is the privileged reversal on the permission ladder, it is audited with this reason, and the ticket underneath is left where it stands.",
        confirm: "Cancel bill",
        destructive: true,
      };
}

export function submitFailureMessage(error: unknown): string {
  return toPublicError(error).message;
}

/* ---------------------------------------------------------------------- screen */

export default function BillPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const storeError = useContextStore((s) => s.error);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const scope = useMemo(
    () => billScopeFor(context),
    // Keyed on the ids: a context object rebuilt without moving the scope must not refetch.
    [context.organizationId, context.propertyId, context.outletId],
  );

  // Four verbs, four keys: `bill.view` reads a document, `bill.create` opens AND closes one,
  // `payment.create` books money, and `bill.void` is the reversal that retires an unpaid bill.
  const canView = can("bill.view", permissions);
  const canBill = can("bill.create", permissions);
  const canPay = can("payment.create", permissions);
  const canCancel = can("bill.void", permissions);

  const [bills, setBills] = useState<Bill[] | null>(null);
  const [orders, setOrders] = useState<OpenOrder[] | null>(null);
  const [billId, setBillId] = useState<EntityId | null>(null);
  const [detail, setDetail] = useState<BillDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);

  const [selectedOrderId, setSelectedOrderId] = useState<EntityId | null>(null);
  const [openingKey, setOpeningKey] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [paying, setPaying] = useState(false);
  const [paymentKey, setPaymentKey] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [action, setAction] = useState<BillAction | null>(null);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  // The unsettled documents and the tickets waiting to become one are two independent reads of
  // the same outlet, so they are taken together and a failure reports once.
  useEffect(() => {
    if (view !== "scoped" || scope === null || !canView) return;
    let ignore = false;
    setListError(null);
    Promise.all([
      listOpenBills(scope),
      listOpenOrders(scope.outletId).then(billableOrders),
    ])
      .then(([documents, billable]) => {
        if (ignore) return;
        setBills(documents);
        setOrders(billable);
      })
      .catch((error) => {
        if (!ignore) setListError(submitFailureMessage(error));
      });
    return () => {
      ignore = true;
    };
  }, [view, scope, canView, reloadTick]);

  // A bill is a door read, never a slice of the list: `bill_detail` resolves the payments and
  // the lines and gates on `bill.view`, and its version is what the next write states.
  useEffect(() => {
    if (billId === null || !canView) {
      setDetail(null);
      return;
    }
    let ignore = false;
    setDetailBusy(true);
    loadBillDetail(billId)
      .then((loaded) => {
        if (!ignore) setDetail(loaded);
      })
      .catch((error) => {
        if (!ignore) setListError(submitFailureMessage(error));
      })
      .finally(() => {
        if (!ignore) setDetailBusy(false);
      });
    return () => {
      ignore = true;
    };
  }, [billId, canView, reloadTick]);

  // The selected ticket needs one more read to be honest: a PAID bill is not in `bills` (that
  // list is the unsettled ones), so "has this ticket already been billed?" is answered by the
  // door's own scope rather than by guessing from a filtered list.
  const [orderBill, setOrderBill] = useState<Bill | null>(null);
  useEffect(() => {
    if (selectedOrderId === null) {
      setOrderBill(null);
      return;
    }
    let ignore = false;
    findBillForOrder(selectedOrderId)
      .then((found) => {
        if (!ignore) setOrderBill(found);
      })
      .catch((error) => {
        if (!ignore) setActionError(submitFailureMessage(error));
      });
    return () => {
      ignore = true;
    };
  }, [selectedOrderId, reloadTick]);

  const reload = useCallback(() => setReloadTick((tick) => tick + 1), []);
  const report = useCallback((error: unknown) => setActionError(submitFailureMessage(error)), []);

  const selectedOrder = useMemo(
    () => (orders ?? []).find((order) => order.id === selectedOrderId) ?? null,
    [orders, selectedOrderId],
  );

  /** Every accepted write refreshes the documents, the billable list, and the open document. */
  const afterWrite = useCallback(() => {
    setActionError(null);
    reload();
  }, [reload]);

  const openPaymentSheet = () => {
    if (detail === null) return;
    setPaying(true);
    setActionError(null);
    // One key for one intended payment: the sheet may be re-submitted after a refusal, and a
    // retry of a payment that actually landed must replay it rather than charge a second time.
    setPaymentKey(newBillIdempotencyKey());
    setAmount(detail.bill.amountDue);
    setMethod("CASH");
    setReference("");
    setNotes("");
  };

  const submitPayment = async () => {
    if (detail === null || paymentKey === null) return;
    const error = paymentFieldError(detail.bill, amount);
    if (error !== null) {
      setActionError(error.message);
      return;
    }
    const input: RecordBillPayment = {
      billId: detail.bill.id,
      // The text the cashier typed, sent as text. A numeric door parameter reached through a
      // float is the one way ₹280.50 becomes 280.49999999999997 before the door ever sees it.
      amount: amount.trim(),
      method,
      referenceId: reference.trim(),
      notes: notes.trim(),
      idempotencyKey: paymentKey,
      expectedVersion: detail.bill.version,
    };
    try {
      await recordBillPayment(input);
      setPaying(false);
      afterWrite();
    } catch (caught) {
      // The sheet and its key survive the refusal, so the same payment can be corrected and
      // re-sent without a second PAY row appearing if the first one landed.
      report(caught);
    }
  };

  const startBilling = (orderId: EntityId) => {
    setBillId(null);
    setDetail(null);
    setSelectedOrderId(orderId);
    setActionError(null);
    // One key per intended bill, minted here and reused across retries of this same ticket.
    setOpeningKey(newIdempotencyKey("bill"));
  };

  const openTheBill = async () => {
    if (selectedOrder === null || openingKey === null || !canBill) return;
    const input: OpenBill = { orderId: selectedOrder.id, idempotencyKey: openingKey };
    try {
      const bill = await openBill(input);
      setSelectedOrderId(null);
      setOrderBill(null);
      setBillId(bill.id);
      setActionError(null);
      reload();
    } catch (error) {
      report(error);
    }
  };

  const applyBillAction = async (reason: string) => {
    if (detail === null || action === null) return;
    const bill = detail.bill;
    try {
      if (action === "close") {
        await closeBill({ billId: bill.id, reason, expectedVersion: bill.version });
      } else {
        await cancelBill({ billId: bill.id, reason, expectedVersion: bill.version });
      }
      setAction(null);
      afterWrite();
    } catch (error) {
      setAction(null);
      report(error);
    }
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:gap-6">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          <Receipt className="size-5 shrink-0 text-brand-600" aria-hidden />
          Billing
        </h2>
        <p className="mt-1 text-sm text-muted">
          Bills and payments of the active restaurant. Every figure is the server&rsquo;s
          calculation engine, frozen onto the document the moment it was opened — this screen
          reads and books money, and never works any out.
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
          title="Sign in to take payment"
          description="There is no active session for this build to read a tenant from. Sign in again to open the bills for your restaurant."
        />
      )}

      {view === "no_outlet" && (
        <EmptyState
          icon={<Store className="size-6" aria-hidden />}
          title="Choose an outlet first"
          description="A bill belongs to one restaurant, and no outlet is selected in your active context yet. This is nothing being wrong — pick an outlet and the counter opens for it."
        />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied capability="read bills and take payment" permission="bill.view" />
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

          <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start">
            <div className="flex flex-col gap-4">
              <BillRail
                bills={bills}
                selectedId={billId}
                canView={canView}
                onSelect={(id) => {
                  setSelectedOrderId(null);
                  setBillId(id);
                  setActionError(null);
                }}
                onReload={reload}
              />

              <TicketRail
                orders={orders}
                selectedId={selectedOrderId}
                bills={bills ?? []}
                canBill={canBill}
                onSelect={startBilling}
                onReload={reload}
              />
            </div>

            {detail !== null ? (
              <BillPanel
                detail={detail}
                busy={detailBusy}
                canPay={canPay}
                canClose={canBill}
                canCancel={canCancel}
                onPay={openPaymentSheet}
                onClose={() => setAction("close")}
                onCancel={() => setAction("cancel")}
              />
            ) : selectedOrder !== null ? (
              <Card
                title={`Bill ${selectedOrder.orderNumber}`}
                description={
                  selectedOrder.tableCode === null
                    ? "A takeaway ticket — no cover to print on the document."
                    : `Cover ${selectedOrder.tableCode}.`
                }
                actions={
                  canBill ? (
                    <Button
                      size="sm"
                      icon={<Plus className="size-4" aria-hidden />}
                      onClick={() => void openTheBill()}
                      disabled={orderBill !== null}
                    >
                      Open bill
                    </Button>
                  ) : (
                    <span className="text-xs text-muted">Needs bill.create</span>
                  )
                }
              >
                {orderBill !== null ? (
                  <p className="text-sm leading-relaxed text-muted">
                    This ticket is already billed as {orderBill.billNumber}, which is{" "}
                    {orderBill.status === "PAID"
                      ? "settled"
                      : `outstanding by ${formatMoneyText(orderBill.amountDue, orderBill.currency)}`}
                    . Open that document from the rail instead of opening a second one — the
                    door would refuse it.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {selectedOrder.lines.map((line, index) => (
                      <li
                        key={`${selectedOrder.id}-${index}`}
                        className="flex items-baseline justify-between gap-3 text-sm"
                      >
                        <span className="text-ink">
                          {line.quantity} × {line.name}
                        </span>
                        <span className="tabular-nums text-muted">
                          {formatMoneyText(line.unitPrice, orderCurrency(selectedOrder))}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-xs leading-relaxed text-muted">
                  Totals are not listed here because the ticket has no totals yet: the engine
                  computes them and the bill freezes them the instant this document is opened.
                  A ticket still cooking cannot be billed — the door takes READY or SERVED only.
                </p>
              </Card>
            ) : (
              <Card title="No document open">
                <p className="text-sm leading-relaxed text-muted">
                  Pick a bill from the rail to take payment against it, or pick a ready ticket
                  to open one. Until something is selected both lists are read-only, because a
                  payment needs a bill the database has already calculated and frozen.
                </p>
              </Card>
            )}
          </div>
        </>
      )}

      {paying && detail !== null && (
        <PaymentSheet
          bill={detail.bill}
          amount={amount}
          method={method}
          reference={reference}
          notes={notes}
          onAmount={setAmount}
          onMethod={setMethod}
          onReference={setReference}
          onNotes={setNotes}
          onClose={() => setPaying(false)}
          onSubmit={() => void submitPayment()}
        />
      )}

      {action !== null && detail !== null && (
        <ReasonSheet
          copy={actionCopy(action, detail.bill)}
          onClose={() => setAction(null)}
          onSubmit={applyBillAction}
        />
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------- pieces */

type BillRailProps = {
  bills: Bill[] | null;
  selectedId: EntityId | null;
  canView: boolean;
  onSelect: (billId: EntityId) => void;
  onReload: () => void;
};

/**
 * The outlet's unsettled documents.
 *
 * A PAID-but-unclosed bill is on this list and a cancelled one is not: the rail is the work
 * still at the counter, and a retired bill is history the audit trail holds.
 */
function BillRail({ bills, selectedId, canView, onSelect, onReload }: BillRailProps) {
  if (bills === null) return <LoadingBlock label="Loading bills…" rows={3} />;
  if (bills.length === 0) {
    return (
      <EmptyState
        icon={<Receipt className="size-6" aria-hidden />}
        title="Nothing outstanding"
        description="No bill at this outlet is waiting for money. Tickets that have not become documents yet are listed below; a settled bill that has been closed leaves this list."
      />
    );
  }
  return (
    <Card
      title="Outstanding bills"
      description={`${bills.length} document${bills.length === 1 ? "" : "s"} at this outlet`}
      actions={
        <Button
          size="sm"
          variant="ghost"
          icon={<RefreshCw className="size-4" aria-hidden />}
          onClick={onReload}
        >
          Refresh
        </Button>
      }
    >
      <ul className="flex flex-col divide-y divide-border">
        {bills.map((bill) => (
          <li key={bill.id}>
            <button
              type="button"
              onClick={() => onSelect(bill.id)}
              aria-current={selectedId === bill.id ? "true" : undefined}
              className={`flex w-full items-center justify-between gap-3 py-3 text-left transition ${
                selectedId === bill.id ? "text-brand-700" : "hover:text-brand-700"
              }`}
            >
              <span className="flex flex-col gap-1">
                <span className="text-sm font-medium tabular-nums">{bill.billNumber}</span>
                <span className="text-xs text-muted tabular-nums">
                  {formatMoneyText(bill.amountDue, bill.currency)} due ·{" "}
                  {formatMoneyText(bill.grandTotal, bill.currency)} total
                </span>
              </span>
              {canView && <StatusPill status={bill.status} />}
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

type TicketRailProps = {
  orders: OpenOrder[] | null;
  selectedId: EntityId | null;
  bills: Bill[];
  canBill: boolean;
  onSelect: (orderId: EntityId) => void;
  onReload: () => void;
};

/**
 * The tickets this restaurant can bill: READY or SERVED, which is 017&rsquo;s own gate.
 *
 * A ticket already holding a live document is still listed — with its bill number, not a
 * "create" affordance — because a cashier working the room needs to see that it has been
 * billed, and the door would refuse a second one anyway.
 */
function TicketRail({
  orders,
  selectedId,
  bills,
  canBill,
  onSelect,
  onReload,
}: TicketRailProps) {
  if (orders === null) return <LoadingBlock label="Loading ready tickets…" rows={2} />;
  if (orders.length === 0) {
    return (
      <Card
        title="Ready to bill"
        actions={
          <Button
            size="sm"
            variant="ghost"
            icon={<RefreshCw className="size-4" aria-hidden />}
            onClick={onReload}
          >
            Refresh
          </Button>
        }
      >
        <p className="text-sm leading-relaxed text-muted">
          No ticket at this outlet is at READY or SERVED yet. A bill cannot be opened before
          then, because a document printed for plates the kitchen has not finished is a bill
          that has to be cancelled.
        </p>
      </Card>
    );
  }
  return (
    <Card
      title="Ready to bill"
      description={canBill ? undefined : "Bill viewing only — opening a bill needs bill.create"}
      actions={
        <Button
          size="sm"
          variant="ghost"
          icon={<RefreshCw className="size-4" aria-hidden />}
          onClick={onReload}
        >
          Refresh
        </Button>
      }
    >
      <ul className="flex flex-col divide-y divide-border">
        {orders.map((order) => {
          const existing = billForOrder(bills, order.id);
          return (
            <li key={order.id}>
              <button
                type="button"
                onClick={() => onSelect(order.id)}
                aria-current={selectedId === order.id ? "true" : undefined}
                className="flex w-full flex-col gap-1 py-3 text-left transition hover:text-brand-700"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium tabular-nums">{order.orderNumber}</span>
                  <StatusPill status={order.status} />
                </span>
                <span className="text-xs text-muted">
                  {order.itemCount} line{order.itemCount === 1 ? "" : "s"}
                  {order.tableCode !== null ? ` · cover ${order.tableCode}` : " · takeaway"}
                  {existing !== null ? ` · billed as ${existing.billNumber}` : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

type BillPanelProps = {
  detail: BillDetail;
  busy: boolean;
  canPay: boolean;
  canClose: boolean;
  canCancel: boolean;
  onPay: () => void;
  onClose: () => void;
  onCancel: () => void;
};

/**
 * One document, as the door answered it: the frozen figures, the money booked against them,
 * and the lines it was calculated from.
 *
 * The three verbs are enabled by the bill's own state rather than by a wish — a settled
 * document can be closed, one that has taken nothing can be cancelled, and only an unsettled
 * one takes money. The doors re-check all three, so these affordances are an early, honest
 * answer rather than a guard.
 */
function BillPanel({
  detail,
  busy,
  canPay,
  canClose,
  canCancel,
  onPay,
  onClose,
  onCancel,
}: BillPanelProps) {
  const { bill, payments, lines } = detail;
  const takesMoney = canPay && billAcceptsPayment(bill.status);
  const settles = canClose && billIsSettled(bill);
  const retires = canCancel && billIsCancellable(bill);

  return (
    <div className="flex flex-col gap-4">
      <Card
        title={bill.billNumber}
        description={`Business date ${bill.businessDate} · opened ${bill.openedAt}`}
        actions={
          <span className="flex items-center gap-2">
            <StatusPill status={bill.status} />
            {busy && <span className="text-xs text-muted">Reloading…</span>}
          </span>
        }
      >
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {billMoneyRows(bill).map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-4">
              <dt className="text-sm text-muted">
                {row.label}
                {row.note !== undefined && (
                  <span className="mt-0.5 block text-xs text-muted/80">{row.note}</span>
                )}
              </dt>
              <dd className="text-sm tabular-nums text-ink">
                {formatMoneyText(row.amount, bill.currency)}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 flex flex-wrap gap-2">
          {takesMoney && (
            <Button size="sm" icon={<Wallet className="size-4" aria-hidden />} onClick={onPay}>
              Take payment
            </Button>
          )}
          {settles && (
            <Button
              size="sm"
              variant="secondary"
              icon={<Check className="size-4" aria-hidden />}
              onClick={onClose}
            >
              Close bill
            </Button>
          )}
          {retires && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Ban className="size-4" aria-hidden />}
              onClick={onCancel}
            >
              Cancel bill
            </Button>
          )}
          {!billAcceptsPayment(bill.status) && (
            <p className="text-xs text-muted">
              {bill.status === "PAID"
                ? "Nothing left to take — this document is settled."
                : "A cancelled bill takes no money and cannot be reopened."}
            </p>
          )}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <Card title={`Lines (${lines.length})`}>
          <ul className="flex flex-col divide-y divide-border">
            {lines.map((line) => (
              <li key={line.id} className="flex items-baseline justify-between gap-3 py-2">
                <span className="flex flex-col gap-0.5">
                  <span
                    className={`text-sm ${
                      lineIsVoided(line) ? "text-muted line-through" : "text-ink"
                    }`}
                  >
                    {line.quantity} × {line.itemName}
                  </span>
                  {line.specialInstructions !== null && (
                    <span className="text-xs text-muted">{line.specialInstructions}</span>
                  )}
                  {lineIsVoided(line) && (
                    <span className="text-xs text-muted">
                      Voided — counted out of the totals on this bill.
                    </span>
                  )}
                </span>
                <span className="text-sm tabular-nums text-muted">
                  {formatMoneyText(line.unitPrice, line.currency)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            The frozen name and price of each line as it was sold. These are not re-priced by a
            later menu change, and they are not the sum of the figures above — the engine added
            them, at open time, on the server.
          </p>
        </Card>

        <Card title={`Payments (${payments.length})`}>
          {payments.length === 0 ? (
            <p className="text-sm leading-relaxed text-muted">
              No money booked against this document yet. The balance is the whole grand total,
              and it stays so until a payment lands.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {payments.map((payment) => (
                <PaymentRow key={payment.id} payment={payment} />
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs leading-relaxed text-muted">
            A recorded payment is immutable. A mistake is answered by a new REFUNDED row that
            names the one it reverses, which is a manager&rsquo;s verb and a later build — so
            there is no edit affordance here, and that is deliberate.
          </p>
        </Card>
      </div>
    </div>
  );
}

function PaymentRow({ payment }: { payment: BillPayment }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-2">
      <span className="flex flex-col gap-0.5">
        <span className="text-sm text-ink">
          {PAYMENT_METHOD_LABELS[payment.method]}
          <span className="ml-2 text-xs tabular-nums text-muted">
            {payment.paymentNumber}
          </span>
        </span>
        {payment.referenceId !== null && (
          <span className="text-xs text-muted">Ref {payment.referenceId}</span>
        )}
        {payment.notes !== null && (
          <span className="text-xs text-muted">{payment.notes}</span>
        )}
        {payment.refundReason !== null && (
          <span className="text-xs text-muted">Refunded: {payment.refundReason}</span>
        )}
      </span>
      <span className="flex items-center gap-2">
        <span className="text-sm tabular-nums text-ink">
          {formatMoneyText(payment.amount, payment.currency)}
        </span>
        <StatusPill status={payment.status} />
      </span>
    </li>
  );
}

type PaymentSheetProps = {
  bill: Bill;
  amount: string;
  method: PaymentMethod;
  reference: string;
  notes: string;
  onAmount: (value: string) => void;
  onMethod: (value: PaymentMethod) => void;
  onReference: (value: string) => void;
  onNotes: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
};

/**
 * Taking money: the balance the door stated, prefilled, and nothing recomputed here.
 *
 * The amount field keeps the text the cashier typed all the way to the door — a payment that
 * passes through a JavaScript number on the way can arrive as a different amount than the one
 * that was entered (contract §1), and this is the one input on the screen where that matters.
 */
function PaymentSheet({
  bill,
  amount,
  method,
  reference,
  notes,
  onAmount,
  onMethod,
  onReference,
  onNotes,
  onClose,
  onSubmit,
}: PaymentSheetProps) {
  const error = paymentFieldError(bill, amount);
  const fatal = error !== null && error.fatal;
  const options = paymentMethodOptions();

  return (
    <Dialog
      open
      onClose={onClose}
      side="right"
      title={`Payment on ${bill.billNumber}`}
      description={`Balance due ${formatMoneyText(bill.amountDue, bill.currency)}. The door re-checks the amount and the balance against the locked bill, so a payment another counter booked a second ago cannot be lost.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={fatal}>
            Record payment
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <Field
          id="payment-amount"
          label="Amount received"
          required
          hint={`Rupees, up to two decimals. ${formatMoneyText(bill.amountDue, bill.currency)} is the whole balance.`}
          error={fatal ? error.message : undefined}
        >
          <TextInput
            id="payment-amount"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            invalid={fatal}
            suffix={bill.currency}
            onChange={(event) => onAmount(event.target.value)}
          />
        </Field>

        {error !== null && !fatal && (
          <p className="rounded-lg border border-warning-soft bg-warning-soft px-3 py-2 text-xs text-warning">
            {error.message}
          </p>
        )}

        <Field id="payment-method" label="Method" required>
          <SelectInput<PaymentMethod>
            id="payment-method"
            options={options}
            value={method}
            onChange={onMethod}
          />
        </Field>

        <Field
          id="payment-reference"
          label="Reference"
          hint="The terminal or gateway trace the customer was handed. Stored verbatim; nothing resolves it."
        >
          <TextInput
            id="payment-reference"
            autoComplete="off"
            value={reference}
            onChange={(event) => onReference(event.target.value)}
          />
        </Field>

        <Field id="payment-notes" label="Notes">
          <Textarea
            id="payment-notes"
            rows={3}
            value={notes}
            onChange={(event) => onNotes(event.target.value)}
          />
        </Field>

        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
          <CreditCard className="mt-0.5 size-4 shrink-0" aria-hidden />
          Cash, card, UPI, transfer and wallet are all one thing to the database: a row on this
          bill. The method is a fact about how the money arrived, not a second ledger.
        </p>
      </form>
    </Dialog>
  );
}

type ReasonSheetProps = {
  copy: { title: string; intro: string; confirm: string; destructive: boolean };
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
};

/**
 * The one reason-bearing sheet on this screen, shared by close and cancel.
 *
 * 017 refuses an empty reason (`NIVAAS_REASON_REQUIRED`) for both verbs, so the button stays
 * off until a sentence exists — a reversal recorded without the words why is a reversal nobody
 * can explain in the audit trail later.
 */
function ReasonSheet({ copy, onClose, onSubmit }: ReasonSheetProps) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = reason.trim();
    if (trimmed === "" || busy) return;
    setBusy(true);
    try {
      await onSubmit(trimmed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      side="right"
      size="sm"
      title={copy.title}
      description={copy.intro}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Back
          </Button>
          <Button
            variant={copy.destructive ? "danger" : "primary"}
            onClick={() => void submit()}
            disabled={reason.trim() === "" || busy}
          >
            {copy.confirm}
          </Button>
        </>
      }
    >
      <Field
        id="bill-action-reason"
        label="Reason"
        required
        hint="Written to the audit trail with this document and its figures."
      >
        <Textarea
          id="bill-action-reason"
          rows={4}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
    </Dialog>
  );
}
