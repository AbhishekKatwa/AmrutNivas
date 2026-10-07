/**
 * The restaurant's day — the active outlet, in one read (Prompt #04 §52; contract §1, §2, §12;
 * migration 019).
 *
 * The screen never chooses its own scope: `outletId` comes from the context store, and an outlet
 * IS the restaurant (contract §12). With no outlet selected it renders the deliberate "choose an
 * outlet first" state.
 *
 * Four schema facts decide what this page can say, and each is visible rather than hidden:
 *
 *   - It adds NOTHING. Billed, collected and outstanding are sums 019 does in `numeric` over the
 *     documents 017's engine wrote. Contract §2 permits one engine for money, and Phase 1's exit
 *     gate is the printed bill, the Z-report and the outlet revenue figure AGREEING — a client-side
 *     total would be the second engine that breaks it. Every figure below is printed as the door
 *     returned it, and money is text the whole way in (§1).
 *   - The day is the outlet's BUSINESS DATE, not the clock's. 016's resolver is what `create_order`,
 *     `open_bill` and `record_payment` stamped every row with, so a 00:40 service belongs to one
 *     night's figures. The header names that date because it is the answer's subject.
 *   - Money is per CURRENCY, never blended. 014 pins an outlet's menu to one currency, so today
 *     there is one block; a second is shown as its own figures rather than added into a number
 *     that would mean nothing.
 *   - There is NO TAX on this page, and that is stated rather than left to be noticed: 014 leaves
 *     the tax category an unresolved placeholder and 017 freezes `order_items.tax_rate` at zero, so
 *     a GST roll-up would be an invention. Phase 4 owns it, and the day close — the signed Z-report,
 *     shifts and a cash drawer — is #05's. What is here is a live read, not a settlement.
 *
 * Everything worth asserting (scope, the ladder order the ticket counts render in, whether the
 * currency still has money out, whether the outlet is simply quiet) is an exported pure function,
 * in `day-service.ts` beside this screen.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChefHat,
  CreditCard,
  LogIn,
  Receipt,
  RefreshCw,
  Store,
  Users,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { StatusPill } from "@/components/ui/StatusPill";
import { can, type ActiveContext, type EntityId } from "@/domain/identity/types";
import { formatMoneyText } from "@/domain/money/money";
import {
  currencyStillOutstanding,
  dayIsQuiet,
  loadDayOverview,
  seatableCovers,
  seatedCovers,
  tenderFor,
  ticketRows,
} from "@/domain/restaurant/day-service";
import type { DayMoney, DayOverview } from "@/domain/restaurant/types";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

const NO_BACKEND_COPY =
  "This build has no backend configured, so it cannot read or save data.";

/* ------------------------------------------------------------------ pure rules */

/** Which surface the screen shows for the session state — never a permanent spinner. */
export type RestaurantDayView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_outlet"
  | "scoped";

export function pageStatusFor(status: ContextStatus, context: ActiveContext): RestaurantDayView {
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

/** The one id the day read needs: 019 resolves the tenant off the outlet itself. */
export function outletIdFor(context: ActiveContext): EntityId | null {
  return context.outletId;
}

/**
 * The business date in the header, said once.
 *
 * An empty date would mean the door answered without a date — which 019 cannot do, its business
 * date is NOT NULL by the outlet's own settings — so the fallback is a defect's face, not a zero.
 */
export function dayDateText(businessDate: string): string {
  if (businessDate === "") return "No business date resolved";
  const parsed = new Date(`${businessDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return businessDate;
  return parsed.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" });
}

/** The database's own words, shortened for a banner. Never a raw Postgres string. */
export function submitFailureMessage(error: unknown): string {
  return toPublicError(error).message;
}

/* ---------------------------------------------------------------------- screen */

export default function RestaurantDayPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const storeError = useContextStore((s) => s.error);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const outletId = useMemo(() => outletIdFor(context), [context.outletId]);
  const canViewDay = can("restaurant.view", permissions);

  const [overview, setOverview] = useState<DayOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  // One read for the whole page: 019 exists precisely so a day is not six queries the client
  // then joins — and so the join cannot turn into arithmetic.
  useEffect(() => {
    if (view !== "scoped" || outletId === null || !canViewDay) return;
    let ignore = false;
    setBusy(true);
    setError(null);
    loadDayOverview(outletId)
      .then((loaded) => {
        if (!ignore) setOverview(loaded);
      })
      .catch((caught) => {
        if (!ignore) setError(submitFailureMessage(caught));
      })
      .finally(() => {
        if (!ignore) setBusy(false);
      });
    return () => {
      ignore = true;
    };
  }, [view, outletId, canViewDay, reloadTick]);

  const reload = useCallback(() => setReloadTick((tick) => tick + 1), []);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
            <UtensilsCrossed className="size-5 shrink-0 text-brand-600" aria-hidden />
            Restaurant
          </h2>
          <p className="mt-1 text-sm text-muted">
            {overview === null
              ? "The active restaurant’s trading day, read in one pass."
              : `Business date ${dayDateText(overview.businessDate)} · read ${new Date(overview.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
          </p>
        </div>
        {view === "scoped" && canViewDay && (
          <Button
            size="sm"
            variant="ghost"
            icon={<RefreshCw className="size-4" aria-hidden />}
            onClick={reload}
          >
            Reload
          </Button>
        )}
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
          title="Sign in to see the day"
          description="There is no active session for this build to read a tenant from. Sign in again to open your restaurant’s day."
        />
      )}

      {view === "no_outlet" && (
        <EmptyState
          icon={<Store className="size-6" aria-hidden />}
          title="Choose an outlet first"
          description="A trading day belongs to one restaurant, and no outlet is selected in your active context yet. This is nothing being wrong — pick an outlet and its day opens."
        />
      )}

      {view === "scoped" && outletId !== null && !canViewDay && (
        <AccessDenied capability="read the restaurant day" permission="restaurant.view" />
      )}

      {view === "scoped" && outletId !== null && canViewDay && (
        <>
          {error !== null && (
            <p
              role="alert"
              className="rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger"
            >
              {error}
            </p>
          )}

          {busy && overview === null ? (
            <LoadingBlock label="Reading the day…" rows={4} />
          ) : overview === null ? (
            <EmptyState
              icon={<Receipt className="size-6" aria-hidden />}
              title="Nothing read yet"
              description="The day has not been read by this screen yet, or the last read failed. Reload runs the one read again — no figures are shown until the door answers."
              action={
                <Button size="sm" variant="secondary" onClick={reload}>
                  Read the day
                </Button>
              }
            />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <FloorCard covers={overview.covers} />
                <TicketCard tickets={overview.tickets} />
                <PassCard kitchen={overview.kitchen} />
              </div>

              <MoneyCard money={overview.money} tender={overview.tender} />

              {dayIsQuiet(overview) && (
                <Card title="A quiet moment">
                  <p className="text-sm leading-relaxed text-muted">
                    No live ticket, nothing on the pass, and no document opened on{" "}
                    {dayDateText(overview.businessDate)} yet. That is the day as the database has
                    it, not a read that came back empty: seating starts at the till, firing starts
                    at the pass, and the first figures appear once a bill exists.
                  </p>
                </Card>
              )}

              <p className="text-xs leading-relaxed text-muted">
                Nothing here is worked out by this screen. Each figure is a sum Postgres made over
                the documents the calculation engine wrote, and money travels as text so a rupee
                cannot become a float on the way to a manager&rsquo;s read. No tax figure is
                available in this build — there is no tax engine yet — and the day close that
                signs a Z-report against a shift is a later release, so this is a live read, not a
                settlement.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------- pieces */

type TileProps = { label: string; value: string; hint?: string };

/** One figure, tabular, with the sentence that makes it unambiguous. */
function Tile({ label, value, hint }: TileProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
      <span className="text-2xl font-semibold tabular-nums text-ink">{value}</span>
      {hint !== undefined && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

function FloorCard({ covers }: { covers: DayOverview["covers"] }) {
  return (
    <Card
      title="The floor"
      description="Derived covers, not what a person typed"
      actions={<Users className="size-4 shrink-0 text-brand-600" aria-hidden />}
    >
      <div className="grid grid-cols-2 gap-4">
        <Tile
          label="Seated"
          value={String(seatedCovers(covers))}
          hint={`of ${covers.total} cover${covers.total === 1 ? "" : "s"}`}
        />
        <Tile
          label="Can seat"
          value={String(seatableCovers(covers))}
          hint="Available right now"
        />
        <Tile label="Cleaning" value={String(covers.cleaning)} hint="Waiting on floor staff" />
        <Tile label="Out of service" value={String(covers.outOfService)} hint="Taken out of trade" />
      </div>
      {covers.reserved > 0 ? (
        <p className="mt-3 text-xs text-muted">
          {covers.reserved} reserved — reservations are Prompt #08&rsquo;s, and 016&rsquo;s
          precedence slot is where they land.
        </p>
      ) : (
        <p className="mt-3 text-xs text-muted">
          Nothing reserved: the RESERVED slot in the cover precedence has no source table until
          reservations exist, so zero here is a stated absence rather than a hidden one.
        </p>
      )}
    </Card>
  );
}

function TicketCard({ tickets }: { tickets: DayOverview["tickets"] }) {
  const rows = ticketRows(tickets);
  return (
    <Card
      title="Tickets"
      description="Live now, and booked on this business date"
      actions={<UtensilsCrossed className="size-4 shrink-0 text-brand-600" aria-hidden />}
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-4">
          <Tile label="Live now" value={String(tickets.live)} hint="Open on any date" />
          <Tile label="Booked today" value={String(tickets.today)} hint="This business date" />
        </div>
        {rows.length === 0 ? (
          <p className="text-xs text-muted">Nothing booked on this date yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {rows.map((row) => (
              <li key={row.status} className="flex items-center justify-between gap-3">
                <StatusPill status={row.status} />
                <span className="text-sm tabular-nums text-ink">{row.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function PassCard({ kitchen }: { kitchen: DayOverview["kitchen"] }) {
  return (
    <Card
      title="The pass"
      description="Open slips and today’s retired ones"
      actions={<ChefHat className="size-4 shrink-0 text-brand-600" aria-hidden />}
    >
      <div className="grid grid-cols-2 gap-4">
        <Tile label="Open slips" value={String(kitchen.openSlips)} hint="On the pass now" />
        <Tile label="Cooking" value={String(kitchen.linesCooking)} hint="Fired lines" />
        <Tile label="Rung up" value={String(kitchen.linesRungUp)} hint="Ready on open slips" />
        <Tile
          label="Reprinted today"
          value={String(kitchen.reprintsToday)}
          hint="Every reprint is audited"
        />
      </div>
      {kitchen.cancelledSlipsToday > 0 && (
        <p className="mt-3 text-xs text-muted">
          {kitchen.cancelledSlipsToday} slip
          {kitchen.cancelledSlipsToday === 1 ? "" : "s"} cancelled today, each with its reason on
          record.
        </p>
      )}
    </Card>
  );
}

type MoneyCardProps = {
  money: DayMoney[];
  tender: DayOverview["tender"];
};

/**
 * The day&rsquo;s money, one block per currency.
 *
 * Billed, collected and outstanding are 019&rsquo;s sums and are printed as returned. They are
 * shown side by side rather than reconciled into one number: `collected` is the SUCCESSFUL
 * payments taken today, `outstanding` is what the frozen documents still believe is due, and the
 * day a refund door lands, the two legitimately need not match.
 */
function MoneyCard({ money, tender }: MoneyCardProps) {
  if (money.length === 0) {
    return (
      <Card
        title="The day’s money"
        description="Nothing billed on this business date yet"
        actions={<Receipt className="size-4 shrink-0 text-brand-600" aria-hidden />}
      >
        <p className="text-sm leading-relaxed text-muted">
          A bill is the first place a ticket gets totals, so until one is opened there is no figure
          to show — and a zero here would be a claim about money rather than an absence of it.
        </p>
      </Card>
    );
  }

  return (
    <Card
      title="The day’s money"
      description={
        money.length === 1
          ? "One currency at this outlet, as 014 pins its menu"
          : "One block per currency, never added across one"
      }
      actions={<CreditCard className="size-4 shrink-0 text-brand-600" aria-hidden />}
      padded={false}
    >
      <div className="flex flex-col divide-y divide-line">
        {money.map((row) => (
          <div key={row.currency} className="flex flex-col gap-3 px-4 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-ink">{row.currency}</span>
              <span className="text-xs text-muted">
                {row.documents} document{row.documents === 1 ? "" : "s"} · {row.payments} payment
                {row.payments === 1 ? "" : "s"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Tile label="Billed" value={formatMoneyText(row.billed, row.currency)} />
              <Tile label="Collected" value={formatMoneyText(row.collected, row.currency)} />
              <Tile
                label="Outstanding"
                value={formatMoneyText(row.outstanding, row.currency)}
                hint={
                  currencyStillOutstanding(row)
                    ? "Still due on these documents"
                    : "Every document settled"
                }
              />
            </div>
            {tenderFor(tender, row.currency).length > 0 && (
              <ul className="flex flex-wrap gap-x-6 gap-y-1">
                {tenderFor(tender, row.currency).map((line) => (
                  <li key={`${line.currency}-${line.method}`} className="text-xs text-muted">
                    <span className="text-ink">{line.method.replace("_", " ").toLowerCase()}</span>
                    {" — "}
                    {formatMoneyText(line.amount, line.currency)}
                    {line.payments > 1 ? ` · ${line.payments} payments` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
