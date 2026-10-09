/**
 * Shift management — open and close cash shifts per operator per business date (020).
 *
 * A shift tracks the cash drawer for one person on one day: opening cash, closing cash,
 * and the window between. The screen shows the current open shift (if any) and allows
 * opening a new one or closing the active one.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock, LogIn, Store, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { LoadingBlock } from "@/components/ui/Spinner";
import { TextInput } from "@/components/ui/TextInput";
import { Textarea } from "@/components/ui/Textarea";
import { can, type ActiveContext } from "@/domain/identity/types";
import { formatMoneyText } from "@/domain/money/money";
import { closeShift, openShift } from "@/domain/restaurant/operations-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";
import { requireSupabase } from "@/db/client";
import { rows, asRead } from "@/db/rpc";
import { toCamelRows } from "@/db/case";
import type { RestaurantShift } from "@/domain/restaurant/types";

const NO_BACKEND_COPY = "This build has no backend configured.";

export type ShiftPageView = "bootstrapping" | "unconfigured" | "unauthenticated" | "no_outlet" | "scoped";

export function pageStatusFor(status: ContextStatus, context: ActiveContext): ShiftPageView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.outletId !== null ? "scoped" : "no_outlet";
  }
  return "bootstrapping";
}

export default function ShiftPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const storeError = useContextStore((s) => s.error);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const outletId = useMemo(() => context.outletId, [context.outletId]);
  const canManage = can("shift.manage", permissions);

  const [shift, setShift] = useState<RestaurantShift | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [openingCash, setOpeningCash] = useState("0");
  const [closingCash, setClosingCash] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  const loadOpenShift = useCallback(async () => {
    if (outletId === null) return;
    setLoading(true);
    setError(null);
    try {
      const openShifts = await rows(asRead(
        requireSupabase()
          .from("restaurant_shifts")
          .select("*")
          .eq("outlet_id", outletId)
          .eq("status", "OPEN")
          .order("opened_at", { ascending: false })
          .limit(1)
      ));
      const mapped = toCamelRows<RestaurantShift>(openShifts);
      setShift(mapped[0] ?? null);
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setLoading(false);
    }
  }, [outletId]);

  useEffect(() => {
    if (view === "scoped" && outletId !== null) {
      void loadOpenShift();
    }
  }, [view, outletId, loadOpenShift]);

  const handleOpen = async () => {
    if (outletId === null || !canManage) return;
    const trimmed = openingCash.trim();
    const cash = trimmed === "" ? 0 : Number(trimmed);
    if (!Number.isFinite(cash) || cash < 0) return;
    setBusy(true);
    setActionError(null);
    try {
      await openShift({ outletId, openingCash: cash });
      await loadOpenShift();
      setOpeningCash("0");
    } catch (err) {
      setActionError(toPublicError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const handleClose = async () => {
    if (shift === null || !canManage) return;
    const trimmed = closingCash.trim();
    if (trimmed === "") return;
    const cash = Number(trimmed);
    if (!Number.isFinite(cash) || cash < 0) return;
    setBusy(true);
    setActionError(null);
    try {
      await closeShift({
        shiftId: shift.id,
        closingCash: cash,
        notes: notes.trim() || undefined,
        expectedVersion: shift.version,
      });
      await loadOpenShift();
      setClosingCash("");
      setNotes("");
    } catch (err) {
      setActionError(toPublicError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 sm:gap-6">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          <Clock className="size-5 shrink-0 text-brand-600" aria-hidden />
          Shifts
        </h2>
        <p className="mt-1 text-sm text-muted">
          Open and close cash shifts for the active outlet. Each shift tracks the drawer for one operator on one business date.
        </p>
      </header>

      {view === "bootstrapping" && <LoadingBlock label="Loading your workspace…" />}

      {view === "unconfigured" && (
        <EmptyState icon={<X className="size-6" aria-hidden />} title="Backend not configured" description={storeError ?? NO_BACKEND_COPY} />
      )}

      {view === "unauthenticated" && (
        <EmptyState icon={<LogIn className="size-6" aria-hidden />} title="Sign in to manage shifts" description="There is no active session." />
      )}

      {view === "no_outlet" && (
        <EmptyState icon={<Store className="size-6" aria-hidden />} title="Choose an outlet first" description="Select an outlet to manage its shifts." />
      )}

      {view === "scoped" && outletId !== null && (
        <>
          {error !== null && (
            <p role="alert" className="rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}
          {actionError !== null && (
            <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger">
              <span>{actionError}</span>
              <Button size="sm" variant="ghost" onClick={() => setActionError(null)}>Dismiss</Button>
            </div>
          )}

          {loading ? (
            <LoadingBlock label="Loading shift…" rows={3} />
          ) : shift === null ? (
            <Card title="No open shift" description="Open a shift to start tracking cash for this outlet.">
              {canManage ? (
                <div className="flex flex-col gap-3">
                  <Field id="opening-cash" label="Opening cash" hint="The cash in the drawer at shift start.">
                    <TextInput id="opening-cash" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} placeholder="0.00" />
                  </Field>
                  <Button variant="primary" onClick={() => void handleOpen()} disabled={busy}>
                    {busy ? "Opening…" : "Open shift"}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted">Needs shift.manage permission to open a shift.</p>
              )}
            </Card>
          ) : (
            <Card
              title="Open shift"
              description={`Opened ${new Date(shift.openedAt).toLocaleString()} · ${formatMoneyText(String(shift.openingCash), "INR")}`}
            >
              {canManage ? (
                <div className="flex flex-col gap-3">
                  <Field id="closing-cash" label="Closing cash" required hint="The cash in the drawer at shift end.">
                    <TextInput id="closing-cash" value={closingCash} onChange={(e) => setClosingCash(e.target.value)} placeholder="0.00" />
                  </Field>
                  <Field id="shift-notes" label="Notes" hint="Optional notes for this shift (variance, incidents, etc.).">
                    <Textarea id="shift-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. ₹50 short — gave change from personal cash" />
                  </Field>
                  <Button variant="primary" onClick={() => void handleClose()} disabled={busy || closingCash === ""}>
                    {busy ? "Closing…" : "Close shift"}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted">Needs shift.manage permission to close this shift.</p>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
