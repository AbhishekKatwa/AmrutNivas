/**
 * The kitchen — slips of the ACTIVE OUTLET, rung up at the pass (Prompt #04 §25-§26, §52, §69;
 * migration 018).
 *
 * The screen never chooses its own scope: `outletId` comes from the context store, and an outlet
 * IS the restaurant (contract §12). With no outlet selected it renders the deliberate "choose an
 * outlet first" state.
 *
 * Six schema facts decide what this screen can offer, and each is visible rather than hidden:
 *
 *   - It shows NO TOTALS and computes NOTHING. A slip is a print unit, not a bill: 018 gives
 *     `kitchen_order_tickets` no money column, and 017's engine owns every figure a sale ever
 *     gets (§2). The line prices printed here are the ones 016 froze when the dish was booked,
 *     carried for the counter's reference — the kitchen's work is quantities and instructions.
 *   - Two statuses on one line, two different truths. `status` is the SALES fact (ACTIVE/VOIDED)
 *     and `fireStatus` is the KITCHEN fact (NOT_FIRED/FIRED/READY). A voided line is shown struck
 *     through and can still be FIRED in history; a fired line can still be ACTIVE. Nothing here
 *     treats one as a synonym for the other.
 *   - The ladders live in `app`, not in this file. 018 declares exactly two fire edges and the
 *     only door that writes a fire state accepts READY alone — so the pass can ring a plate up
 *     and cannot un-ring it, and the button this screen offers follows `KOT_FIRE_ADVANCE` only
 *     because the door would refuse anything else (§7). Ringing the last FIRED line auto-closes
 *     the slip, so there is no "close ticket" verb for a cook to press.
 *   - Four verbs, four capabilities, and they are not interchangeable. The queue and the pass run
 *     on `kot.view` (018 gates `set_order_item_fire_status` on the same key the read uses, so a
 *     KITCHEN_MANAGER can work the queue with nothing more), firing needs `kot.create`, retiring
 *     a mis-send needs `kot.cancel`, and a reprint needs `kot.reprint` — because a second slip
 *     can double a plate and is therefore counted, reasoned and audited (§69).
 *   - Sending reads tickets through 016, and 016 gates that read on `order.view`. A kitchen role
 *     that fires but cannot see tickets is therefore shown the honest reason in its own card
 *     rather than a list that can only fail.
 *   - A double tap cannot fire twice. The send sheet mints ONE idempotency key when it opens and
 *     reuses it for every retry, so a retry of a SEND that already landed replays the first slip
 *     instead of printing a second one (§6).
 *
 * Everything worth asserting (scope, which tickets may fire, which lines a SEND takes, the queue
 * age, the progress line, the failure copy) is an exported pure function beside the component.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  Check,
  ChefHat,
  Flame,
  LogIn,
  Printer,
  RefreshCw,
  Store,
  Ticket,
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
import { StatusPill } from "@/components/ui/StatusPill";
import { Textarea } from "@/components/ui/Textarea";
import { can, type ActiveContext, type EntityId } from "@/domain/identity/types";
import { formatAdjustmentText } from "@/domain/money/money";
import { listOpenOrders, loadOrderTicket } from "@/domain/restaurant/order-service";
import {
  cancelKot,
  firableLines,
  firedLines,
  listOpenKots,
  loadKot,
  newKotIdempotencyKey,
  orderCanSendKot,
  reprintKot,
  ringUpLine,
  sendKot,
} from "@/domain/restaurant/kot-service";
import type {
  KitchenTicketDetail,
  KitchenTicketLine,
  OpenKotSummary,
  OpenOrder,
  OrderLineDetail,
  OrderTicket,
} from "@/domain/restaurant/types";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

const NO_BACKEND_COPY =
  "This build has no backend configured, so it cannot read or save data.";

/* ------------------------------------------------------------------ pure rules */

/** Which surface the screen shows for the session state — never a permanent spinner. */
export type KitchenPageView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_outlet"
  | "scoped";

export function pageStatusFor(status: ContextStatus, context: ActiveContext): KitchenPageView {
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

/**
 * The whole scope this screen needs.
 *
 * Unlike the till or the bill counter, the kitchen never states an org or a property: the queue
 * door takes the outlet and resolves the tenant off it (018), so a screen that passed a stale
 * triple could only contradict the database.
 */
export function outletIdFor(context: ActiveContext): EntityId | null {
  return context.outletId;
}

/**
 * The tickets the kitchen may be handed work from (018's own gate on `send_kot`).
 *
 * A DRAFT is not yet an order the room is honouring, and READY and beyond means the plates are
 * already made — the kitchen has nothing left to be told.
 */
export function sendableOrders(orders: readonly OpenOrder[]): OpenOrder[] {
  return orders.filter((order) => orderCanSendKot(order.status));
}

/** Minutes a slip has been on the pass, floored at zero for a clock that runs slightly behind. */
export function waitingMinutes(firedAt: string, nowMs: number): number {
  const fired = new Date(firedAt).getTime();
  if (Number.isNaN(fired)) return 0;
  return Math.max(0, Math.floor((nowMs - fired) / 60_000));
}

/** A queue tile's age, said the way a cook reads it — never a bare ISO string. */
export function queueAgeText(summary: OpenKotSummary, nowMs: number): string {
  const minutes = waitingMinutes(summary.firedAt, nowMs);
  if (minutes < 1) return "just fired";
  if (minutes === 1) return "1 min on the pass";
  return `${minutes} min on the pass`;
}

/**
 * What a tile says about its work.
 *
 * `open_kots` returns the FIRED and READY counts separately, so the tile can name both: the
 * plates still cooking and the plates the pass has already rung up. A slip with neither is an
 * empty send, which 018 refuses — so it cannot appear here.
 */
export function slipProgress(summary: OpenKotSummary): string {
  if (summary.firedCount === 0) return `All ${summary.readyCount} rung up`;
  return `${summary.firedCount} cooking · ${summary.readyCount} rung up`;
}

/** The lines the pass can ring up right now: FIRED work that is still on the ticket. */
export function ringableLines(detail: KitchenTicketDetail): KitchenTicketLine[] {
  return detail.lines.filter((line) => line.fireStatus === "FIRED" && line.status === "ACTIVE");
}

/** A VOIDED line is printed for the record and has no plate to cook (§48's honesty). */
export function lineIsVoided(line: KitchenTicketLine): boolean {
  return line.status === "VOIDED";
}

/**
 * The line ids a SEND would take, pre-selected for the cashier.
 *
 * ACTIVE and NOT_FIRED — the same rule `send_kot` applies when it refuses a line that is not
 * firable, so the list shown is the list the door accepts unless the operator deliberately
 * asks to consolidate lines that are already fired.
 */
export function defaultChosenLines(ticket: OrderTicket): EntityId[] {
  return firableLines(ticket).map((line) => line.id);
}

/** A line is either named for this slip or it is not — an order the door must be able to read. */
export function toggleChosen(chosen: readonly EntityId[], id: EntityId): EntityId[] {
  return chosen.includes(id) ? chosen.filter((value) => value !== id) : [...chosen, id];
}

/** One line of a ticket as the send sheet prints it. */
export function lineLabel(line: OrderLineDetail): string {
  return `${line.quantity} × ${line.itemNameSnapshot}`;
}

/** The options on that line, named only — the cook needs the words, not the money. */
export function lineOptionText(line: OrderLineDetail): string {
  return line.modifiers
    .map((modifier) => `${modifier.modifierNameSnapshot} ×${modifier.quantity}`)
    .join(", ");
}

/** The same option line on a printed slip, where the delta is worth showing. */
export function slipOptionText(line: KitchenTicketLine): string {
  return line.modifiers
    .map(
      (modifier) =>
        `${modifier.name} ×${modifier.quantity} ${formatAdjustmentText(modifier.priceAdjustment, line.currency)}`,
    )
    .join(", ");
}

export type KotAction = "cancel" | "reprint";

/**
 * What a slip's two reason-bearing verbs say.
 *
 * Cancel is destructive-looking because it retires work the kitchen was told to do; reprint is
 * not — it re-emits the same slip, and the reason exists so a doubled plate can be explained
 * afterwards rather than argued about.
 */
export function actionCopy(
  action: KotAction,
  ticket: KitchenTicketDetail,
): { title: string; intro: string; confirm: string; destructive: boolean } {
  return action === "cancel"
    ? {
        title: `Cancel ${ticket.kotNumber}`,
        intro:
          "Lines still cooking go back to the floor un-fired, so a corrected send can pick them up. Anything already rung up keeps its state and stays on this slip.",
        confirm: "Cancel slip",
        destructive: true,
      }
    : {
        title: `Reprint ${ticket.kotNumber}`,
        intro: `This slip has been printed ${ticket.reprintCount} time${ticket.reprintCount === 1 ? "" : "s"} already. A second slip can double a plate, so the reprint is counted on the ticket and written to the audit trail.`,
        confirm: "Reprint slip",
        destructive: false,
      };
}

/** The database's own words, shortened for a banner. Never a raw Postgres string. */
export function submitFailureMessage(error: unknown): string {
  return toPublicError(error).message;
}

/** A time the pass can read, or the raw value when the column has none. */
export function clockTime(iso: string | null): string {
  if (iso === null) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * The ticket a slip came from, read off the queue row rather than off the slip.
 *
 * `kot_detail` answers with `orderId` and no order number — the door that prints a slip has no
 * reason to join the ticket — so the human handle comes from `open_kots`, which does. A slip
 * that has already left the queue (closed or cancelled) has no row there, and its panel says
 * nothing rather than printing a uuid as if it were a ticket number.
 */
export function orderNumberForSlip(
  kots: readonly OpenKotSummary[] | null,
  kotId: EntityId | null,
): string | null {
  if (kots === null || kotId === null) return null;
  return kots.find((summary) => summary.id === kotId)?.orderNumber ?? null;
}

/* ---------------------------------------------------------------------- screen */

export default function KitchenPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const storeError = useContextStore((s) => s.error);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  // Keyed on the primitive: a context object rebuilt without moving the outlet must not refetch.
  const outletId = useMemo(() => outletIdFor(context), [context.outletId]);

  // Four verbs, four keys: the queue and the pass are both `kot.view`, firing is `kot.create`,
  // retiring a mis-send is `kot.cancel`, and re-emitting one is `kot.reprint`.
  const canQueue = can("kot.view", permissions);
  const canSend = can("kot.create", permissions);
  const canCancel = can("kot.cancel", permissions);
  const canReprint = can("kot.reprint", permissions);
  // 016 gates `open_orders` and `order_detail` on order.view — the tickets a SEND is built from.
  const canReadTickets = can("order.view", permissions);

  const [kots, setKots] = useState<OpenKotSummary[] | null>(null);
  const [kotId, setKotId] = useState<EntityId | null>(null);
  const [slip, setSlip] = useState<KitchenTicketDetail | null>(null);
  const [slipBusy, setSlipBusy] = useState(false);
  const [ringing, setRinging] = useState<EntityId | null>(null);

  const [orders, setOrders] = useState<OpenOrder[] | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<EntityId | null>(null);
  const [ticket, setTicket] = useState<OrderTicket | null>(null);
  const [ticketBusy, setTicketBusy] = useState(false);
  const [chosen, setChosen] = useState<EntityId[]>([]);
  const [note, setNote] = useState("");
  const [includeFired, setIncludeFired] = useState(false);
  const [sendKey, setSendKey] = useState<string | null>(null);

  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [action, setAction] = useState<KotAction | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  // The queue is the screen's own read; the sendable tickets are a second, independent read of
  // the same outlet, taken only when this role can actually pass 016's gate.
  useEffect(() => {
    if (view !== "scoped" || outletId === null || !canQueue) return;
    let ignore = false;
    setListError(null);
    listOpenKots(outletId)
      .then((rows) => {
        if (!ignore) setKots(rows);
      })
      .catch((error) => {
        if (!ignore) setListError(submitFailureMessage(error));
      });
    return () => {
      ignore = true;
    };
  }, [view, outletId, canQueue, reloadTick]);

  useEffect(() => {
    if (view !== "scoped" || outletId === null || !canQueue || !canReadTickets) return;
    let ignore = false;
    listOpenOrders(outletId)
      .then((rows) => {
        if (!ignore) setOrders(sendableOrders(rows));
      })
      .catch((error) => {
        if (!ignore) setListError(submitFailureMessage(error));
      });
    return () => {
      ignore = true;
    };
  }, [view, outletId, canQueue, canReadTickets, reloadTick]);

  // A slip is a door read, never a slice of the queue: `kot_detail` resolves the lines in the
  // order the printer received them, and the queue's counts are too coarse to ring a line up.
  useEffect(() => {
    if (kotId === null || !canQueue) {
      setSlip(null);
      return;
    }
    let ignore = false;
    setSlipBusy(true);
    loadKot(kotId)
      .then((loaded) => {
        if (!ignore) setSlip(loaded);
      })
      .catch((error) => {
        if (!ignore) setListError(submitFailureMessage(error));
      })
      .finally(() => {
        if (!ignore) setSlipBusy(false);
      });
    return () => {
      ignore = true;
    };
  }, [kotId, canQueue, reloadTick]);

  // The ticket a SEND is built from needs `order_detail`: the list has no line ids, no fire
  // states and no version, and all three are what the door asks for.
  useEffect(() => {
    if (selectedOrderId === null) {
      setTicket(null);
      return;
    }
    let ignore = false;
    setTicketBusy(true);
    loadOrderTicket(selectedOrderId)
      .then((loaded) => {
        if (ignore) return;
        setTicket(loaded);
        setChosen(defaultChosenLines(loaded));
      })
      .catch((error) => {
        if (!ignore) setActionError(submitFailureMessage(error));
      })
      .finally(() => {
        if (!ignore) setTicketBusy(false);
      });
    return () => {
      ignore = true;
    };
  }, [selectedOrderId, reloadTick]);

  const reload = useCallback(() => setReloadTick((tick) => tick + 1), []);
  const report = useCallback((error: unknown) => setActionError(submitFailureMessage(error)), []);

  const afterWrite = useCallback(() => {
    setActionError(null);
    reload();
  }, [reload]);

  const selectedOrder = useMemo(
    () => (orders ?? []).find((order) => order.id === selectedOrderId) ?? null,
    [orders, selectedOrderId],
  );

  const startSend = (orderId: EntityId) => {
    setKotId(null);
    setSlip(null);
    setSelectedOrderId(orderId);
    setActionError(null);
    // One key for one intended slip: a retry of a SEND that already landed replays the first.
    setSendKey(newKotIdempotencyKey());
    setNote("");
    setIncludeFired(false);
  };

  const submitSend = async () => {
    if (ticket === null || sendKey === null || !canSend) return;
    const itemIds = includeFired ? [...chosen, ...firedLines(ticket).map((line) => line.id)] : chosen;
    try {
      const fired = await sendKot({
        orderId: ticket.order.id,
        itemIds,
        // `undefined`, not `""`: the door stores NULL for a slip with no note.
        note: note.trim() === "" ? undefined : note.trim(),
        includeFired,
        expectedVersion: ticket.order.version,
        idempotencyKey: sendKey,
      });
      setSelectedOrderId(null);
      setTicket(null);
      setKotId(fired.id);
      afterWrite();
    } catch (error) {
      report(error);
    }
  };

  const ringUp = async (itemId: EntityId) => {
    setRinging(itemId);
    try {
      await ringUpLine({ itemId, fireStatus: "READY" });
      afterWrite();
    } catch (error) {
      report(error);
    } finally {
      setRinging(null);
    }
  };

  const applyKotAction = async (reason: string) => {
    if (slip === null || action === null) return;
    const cancelled = action === "cancel";
    try {
      if (cancelled) {
        await cancelKot({ kotId: slip.id, reason });
      } else {
        await reprintKot({ kotId: slip.id, reason });
      }
      setAction(null);
      // A retired slip has no pass state left to show, so the panel steps back to the queue;
      // a reprint keeps the slip open and only its own count moves.
      if (cancelled) {
        setKotId(null);
        setSlip(null);
      }
      afterWrite();
    } catch (error) {
      setAction(null);
      report(error);
    }
  };

  // The queue ages itself between reloads rather than on a timer: one snapshot per render, so a
  // tile's "12 min" is the same instant for every tile on the screen.
  const nowMs = useMemo(() => Date.now(), [kots, reloadTick]);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:gap-6">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          <ChefHat className="size-5 shrink-0 text-brand-600" aria-hidden />
          Kitchen
        </h2>
        <p className="mt-1 text-sm text-muted">
          Slips fired to the pass in the active restaurant. A slip carries quantities and
          instructions and no money of its own — totals belong to the bill, which the
          server&rsquo;s calculation engine writes.
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
          title="Sign in to work the pass"
          description="There is no active session for this build to read a tenant from. Sign in again to open the kitchen for your restaurant."
        />
      )}

      {view === "no_outlet" && (
        <EmptyState
          icon={<Store className="size-6" aria-hidden />}
          title="Choose an outlet first"
          description="A slip belongs to one kitchen, and no outlet is selected in your active context yet. This is nothing being wrong — pick an outlet and its pass opens."
        />
      )}

      {view === "scoped" && outletId !== null && !canQueue && (
        <AccessDenied capability="read the kitchen queue" permission="kot.view" />
      )}

      {view === "scoped" && outletId !== null && canQueue && (
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
              <KotQueue
                kots={kots}
                selectedId={kotId}
                nowMs={nowMs}
                onSelect={(id) => {
                  setSelectedOrderId(null);
                  setTicket(null);
                  setKotId(id);
                  setActionError(null);
                }}
                onReload={reload}
              />

              {canReadTickets ? (
                <TicketQueue
                  orders={orders}
                  selectedId={selectedOrderId}
                  canSend={canSend}
                  onSelect={startSend}
                  onReload={reload}
                />
              ) : (
                <Card title="Sending needs tickets">
                  <p className="text-sm leading-relaxed text-muted">
                    Firing a slip reads the ticket it comes from, and 016 gates that read on{" "}
                    <code className="rounded bg-surface-sunken px-1 py-0.5 text-xs">order.view</code>.
                    This role can work the pass — the queue below and every ring-up run on{" "}
                    <code className="rounded bg-surface-sunken px-1 py-0.5 text-xs">kot.view</code>{" "}
                    — and a cashier&rsquo;s screen is where the next slip is sent from.
                  </p>
                </Card>
              )}
            </div>

            {slip !== null ? (
              <SlipPanel
                slip={slip}
                orderNumber={orderNumberForSlip(kots, kotId)}
                busy={slipBusy}
                ringing={ringing}
                canCancel={canCancel}
                canReprint={canReprint}
                onRing={(itemId) => void ringUp(itemId)}
                onCancel={() => setAction("cancel")}
                onReprint={() => setAction("reprint")}
                onReload={reload}
              />
            ) : selectedOrder !== null ? (
              <SendPanel
                order={selectedOrder}
                ticket={ticket}
                busy={ticketBusy}
                canSend={canSend}
                chosen={chosen}
                note={note}
                includeFired={includeFired}
                onToggle={(id) => setChosen((current) => toggleChosen(current, id))}
                onNote={setNote}
                onIncludeFired={setIncludeFired}
                onSend={() => void submitSend()}
                onClose={() => {
                  setSelectedOrderId(null);
                  setTicket(null);
                }}
              />
            ) : (
              <Card title="Nothing on the pass">
                <p className="text-sm leading-relaxed text-muted">
                  Pick a slip to ring its lines up, or a ticket the floor has placed to fire a new
                  one. Until something is selected both rails are read-only, because a line has no
                  kitchen state until a slip carries it.
                </p>
              </Card>
            )}
          </div>
        </>
      )}

      {action !== null && slip !== null && (
        <ReasonSheet
          copy={actionCopy(action, slip)}
          onClose={() => setAction(null)}
          onSubmit={applyKotAction}
        />
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------- pieces */

type KotQueueProps = {
  kots: OpenKotSummary[] | null;
  selectedId: EntityId | null;
  nowMs: number;
  onSelect: (kotId: EntityId) => void;
  onReload: () => void;
};

/**
 * Every OPEN slip at this outlet, oldest send first.
 *
 * CLOSED and CANCELLED slips are deliberately absent: 018 closes a slip by itself the moment its
 * last fired line is rung up, so a finished ticket leaves the queue rather than sitting in it
 * waiting for someone to press a button. Its history is the audit trail and the order.
 */
function KotQueue({ kots, selectedId, nowMs, onSelect, onReload }: KotQueueProps) {
  if (kots === null) return <LoadingBlock label="Loading the pass…" rows={3} />;
  if (kots.length === 0) {
    return (
      <EmptyState
        icon={<ChefHat className="size-6" aria-hidden />}
        title="Nothing cooking"
        description="No open slip at this outlet. When the floor sends a ticket, its slip appears here oldest-send-first."
        action={
          <Button size="sm" variant="ghost" icon={<RefreshCw className="size-4" aria-hidden />} onClick={onReload}>
            Reload
          </Button>
        }
      />
    );
  }
  return (
    <Card
      title="The pass"
      description={`${kots.length} open slip${kots.length === 1 ? "" : "s"}`}
      actions={
        <Button size="sm" variant="ghost" icon={<RefreshCw className="size-4" aria-hidden />} onClick={onReload}>
          Reload
        </Button>
      }
      padded={false}
    >
      <ul className="divide-y divide-line">
        {kots.map((summary) => (
          <li key={summary.id}>
            <button
              type="button"
              onClick={() => onSelect(summary.id)}
              aria-current={selectedId === summary.id ? "true" : undefined}
              className={`flex w-full flex-col gap-1 px-4 py-3 text-left transition hover:bg-surface-sunken ${
                selectedId === summary.id ? "bg-surface-sunken" : ""
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <Ticket className="size-4 shrink-0 text-brand-600" aria-hidden />
                  {summary.kotNumber}
                </span>
                <StatusPill status={summary.status} />
              </span>
              <span className="text-xs text-muted">
                {summary.orderNumber} · {slipProgress(summary)}
              </span>
              <span className="flex items-center gap-1 text-xs text-muted">
                <Flame className="size-3.5 shrink-0 text-warning" aria-hidden />
                {queueAgeText(summary, nowMs)}
                {summary.reprintCount > 0 ? ` · reprinted ${summary.reprintCount}` : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

type TicketQueueProps = {
  orders: OpenOrder[] | null;
  selectedId: EntityId | null;
  canSend: boolean;
  onSelect: (orderId: EntityId) => void;
  onReload: () => void;
};

/**
 * The tickets a slip could be fired from.
 *
 * PLACED, CONFIRMED and PREPARING only — the same three 018 admits, and the reason a DRAFT is
 * absent is that a draft has not been ordered yet. A takeaway sits here too: the kitchen is told
 * what to cook whether or not there is a cover.
 */
function TicketQueue({ orders, selectedId, canSend, onSelect, onReload }: TicketQueueProps) {
  if (orders === null) return <LoadingBlock label="Loading tickets…" rows={2} />;
  if (orders.length === 0) {
    return (
      <Card title="No tickets awaiting the kitchen">
        <p className="text-sm leading-relaxed text-muted">
          Nothing placed is waiting to be fired. A ticket appears here once the floor has placed it
          and until the last of its plates is served.
        </p>
      </Card>
    );
  }
  return (
    <Card
      title="Awaiting the kitchen"
      description={canSend ? "Pick a ticket to fire its unfired lines." : "Needs kot.create to fire."}
      actions={
        <Button size="sm" variant="ghost" icon={<RefreshCw className="size-4" aria-hidden />} onClick={onReload}>
          Reload
        </Button>
      }
      padded={false}
    >
      <ul className="divide-y divide-line">
        {orders.map((order) => (
          <li key={order.id}>
            <button
              type="button"
              onClick={() => onSelect(order.id)}
              aria-current={selectedId === order.id ? "true" : undefined}
              className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-surface-sunken ${
                selectedId === order.id ? "bg-surface-sunken" : ""
              }`}
            >
              <span className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-ink">{order.orderNumber}</span>
                <span className="text-xs text-muted">
                  {order.orderType === "DINE_IN"
                    ? `Cover ${order.tableCode ?? "—"}`
                    : "Takeaway"}{" "}
                  · {order.itemCount} line{order.itemCount === 1 ? "" : "s"}
                </span>
              </span>
              <StatusPill status={order.status} />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

type SlipPanelProps = {
  slip: KitchenTicketDetail;
  /** The ticket this slip fired from, resolved from the queue row — null once it has left it. */
  orderNumber: string | null;
  busy: boolean;
  ringing: EntityId | null;
  canCancel: boolean;
  canReprint: boolean;
  onRing: (itemId: EntityId) => void;
  onCancel: () => void;
  onReprint: () => void;
  onReload: () => void;
};

/**
 * One slip, as the printer received it.
 *
 * The lines are in 018&rsquo;s own print order and nothing is re-sorted here — a cook reads the
 * ticket in the sequence it was written. A rung-up line loses its button because the pass has no
 * verb that un-rings a plate; the door would refuse it, and a disabled control says so.
 */
function SlipPanel({
  slip,
  orderNumber,
  busy,
  ringing,
  canCancel,
  canReprint,
  onRing,
  onCancel,
  onReprint,
  onReload,
}: SlipPanelProps) {
  const live = slip.status === "OPEN";
  const remaining = ringableLines(slip).length;
  const from = orderNumber === null ? slip.businessDate : `${orderNumber} · ${slip.businessDate}`;

  return (
    <Card
      title={`Slip ${slip.kotNumber}`}
      description={`${from} · fired ${clockTime(slip.firedAt)}`}
      actions={<StatusPill status={slip.status} />}
      padded={false}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-muted">
            {live
              ? remaining === 0
                ? "Nothing left to ring. The slip closes itself when its last fired line is rung up."
                : `${remaining} line${remaining === 1 ? "" : "s"} still on the pass.`
              : `This slip is ${slip.status.toLowerCase()}; its record is here for reading, and its lines keep whatever state they reached.`}
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" icon={<RefreshCw className="size-4" aria-hidden />} onClick={onReload}>
              Reload
            </Button>
            {canReprint && live ? (
              <Button size="sm" variant="secondary" icon={<Printer className="size-4" aria-hidden />} onClick={onReprint}>
                Reprint
              </Button>
            ) : (
              <span className="text-xs text-muted">Reprint needs kot.reprint</span>
            )}
            {canCancel && live ? (
              <Button size="sm" variant="danger" icon={<Ban className="size-4" aria-hidden />} onClick={onCancel}>
                Cancel slip
              </Button>
            ) : (
              <span className="text-xs text-muted">Cancel needs kot.cancel</span>
            )}
          </div>
        </div>
      }
    >
      {busy ? (
        <div className="px-4 py-6">
          <LoadingBlock label="Loading the slip…" rows={3} />
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {slip.lines.map((line) => (
            <SlipLineRow
              key={line.id}
              line={line}
              live={live}
              busy={ringing === line.id}
              onRing={() => onRing(line.id)}
            />
          ))}
          {slip.lines.length === 0 && (
            <li className="px-4 py-6 text-sm text-muted">
              This slip lists no lines. A cancelled send detaches the lines that had not been
              cooked, so an empty one is the record of a retired print, not a missing read.
            </li>
          )}
        </ul>
      )}
      {slip.note !== null && slip.note !== "" && (
        <p className="border-t border-line px-4 py-3 text-sm text-ink">
          <span className="font-semibold">Note to the kitchen:</span> {slip.note}
        </p>
      )}
    </Card>
  );
}

type SlipLineRowProps = {
  line: KitchenTicketLine;
  live: boolean;
  busy: boolean;
  onRing: () => void;
};

function SlipLineRow({ line, live, busy, onRing }: SlipLineRowProps) {
  const voided = lineIsVoided(line);
  const ringable = live && !voided && line.fireStatus === "FIRED";

  return (
    <li className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="flex flex-col gap-1">
        <span
          className={`text-sm font-semibold ${voided ? "text-muted line-through" : "text-ink"}`}
        >
          {line.quantity} × {line.itemNameSnapshot}
          {line.itemCode !== null ? (
            <span className="ml-2 text-xs font-normal text-muted">{line.itemCode}</span>
          ) : null}
        </span>
        {line.modifiers.length > 0 && (
          <span className="text-xs text-muted">{slipOptionText(line)}</span>
        )}
        {line.specialInstructions !== null && line.specialInstructions !== "" && (
          <span className="text-xs font-medium text-warning">
            {line.specialInstructions}
          </span>
        )}
        {voided && (
          <span className="text-xs text-muted">
            Voided on the ticket — printed for the record, and there is no plate to cook.
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <StatusPill status={line.fireStatus} />
        {ringable ? (
          <Button
            size="sm"
            variant="primary"
            icon={<Check className="size-4" aria-hidden />}
            onClick={busy ? undefined : onRing}
            disabled={busy}
          >
            {busy ? "Ringing…" : "Rung up"}
          </Button>
        ) : line.fireStatus === "READY" ? (
          <span className="text-xs text-muted">At the pass</span>
        ) : null}
      </div>
    </li>
  );
}

type SendPanelProps = {
  order: OpenOrder;
  ticket: OrderTicket | null;
  busy: boolean;
  canSend: boolean;
  chosen: EntityId[];
  note: string;
  includeFired: boolean;
  onToggle: (lineId: EntityId) => void;
  onNote: (value: string) => void;
  onIncludeFired: (value: boolean) => void;
  onSend: () => void;
  onClose: () => void;
};

/**
 * The send sheet: which lines of this ticket are about to fire.
 *
 * What is named here is what the door receives, which is the whole point of the list — a silent
 * drop of half an array is how a plate goes missing. Lines already on a slip are shown apart,
 * because they only travel onto the new one when the operator asks to consolidate them.
 */
function SendPanel({
  order,
  ticket,
  busy,
  canSend,
  chosen,
  note,
  includeFired,
  onToggle,
  onNote,
  onIncludeFired,
  onSend,
  onClose,
}: SendPanelProps) {
  if (busy || ticket === null) {
    return (
      <Card title={`Fire ${order.orderNumber}`}>
        <LoadingBlock label="Loading the ticket…" rows={3} />
      </Card>
    );
  }

  const firable = firableLines(ticket);
  const alreadyFired = firedLines(ticket);
  const nothingChosen = chosen.length === 0;

  return (
    <Card
      title={`Fire ${order.orderNumber}`}
      description={
        order.tableId === null
          ? "A takeaway — the slip carries no cover."
          : `Cover ${order.tableCode ?? "—"}.`
      }
      actions={
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-muted">
            {firable.length === 0
              ? "Every line on this ticket is already fired or voided, so there is nothing for a new slip to carry."
              : nothingChosen
                ? "Name at least one line — 018 refuses an empty slip rather than printing a blank one."
                : `${chosen.length} line${chosen.length === 1 ? "" : "s"} will print on this slip.`}
          </span>
          <Button
            variant="primary"
            icon={<Flame className="size-4" aria-hidden />}
            onClick={canSend ? onSend : undefined}
            disabled={!canSend || nothingChosen}
          >
            {canSend ? "Send to kitchen" : "Needs kot.create"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {firable.map((line) => (
          <Checkbox
            key={line.id}
            id={`kot-line-${line.id}`}
            checked={chosen.includes(line.id)}
            onChange={() => onToggle(line.id)}
            label={lineLabel(line)}
            description={
              lineOptionText(line) === "" && line.specialInstructions === null
                ? undefined
                : [lineOptionText(line), line.specialInstructions]
                    .filter((part) => part !== null && part !== "")
                    .join(" — ")
            }
          />
        ))}
        {firable.length === 0 && (
          <p className="text-sm text-muted">
            Nothing unfired on this ticket. Send from the pass instead, or add the missing lines on
            the till.
          </p>
        )}

        {alreadyFired.length > 0 && (
          <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-sunken px-3 py-2">
            <p className="text-xs text-muted">
              Already on a slip — these stay where they are unless this send consolidates them:
            </p>
            {alreadyFired.map((line) => (
              <span key={line.id} className="text-sm text-ink">
                {lineLabel(line)}
              </span>
            ))}
            <Checkbox
              id="kot-include-fired"
              checked={includeFired}
              onChange={onIncludeFired}
              label="Carry the fired lines onto this slip too"
              description="A deliberate consolidation: the plates move to this ticket's record, and the old slip keeps the lines already rung up."
            />
          </div>
        )}

        <Field
          id="kot-note"
          label="Note to the kitchen"
          hint="Printed on the slip itself. Empty means no note is stored."
        >
          <Textarea
            id="kot-note"
            rows={2}
            value={note}
            onChange={(event) => onNote(event.target.value)}
            placeholder="e.g. birthday table, no chilli on the second plate"
          />
        </Field>

        <p className="text-xs leading-relaxed text-muted">
          Sending drives the order to PREPARING through 016&rsquo;s own state machine, mints the
          slip number from 016&rsquo;s counter, and is replay-proof: this sheet holds one key, so a
          second tap of Send cannot print a second slip for the same lines.
        </p>
      </div>
    </Card>
  );
}

type ReasonSheetProps = {
  copy: { title: string; intro: string; confirm: string; destructive: boolean };
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
};

/**
 * The one reason-bearing sheet on this screen, shared by cancel and reprint.
 *
 * 018 refuses an empty reason for both (`NIVAAS_REASON_REQUIRED`), so the button stays off until
 * a sentence exists — a retired or doubled slip that cannot be explained in the audit trail is
 * the failure §52 and §69 exist to prevent.
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
        id="kot-action-reason"
        label="Reason"
        required
        hint="Written to the audit trail with this slip and its lines."
      >
        <Textarea
          id="kot-action-reason"
          rows={4}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
    </Dialog>
  );
}
