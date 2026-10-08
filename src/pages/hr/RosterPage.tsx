/**
 * Roster — employee shift schedule (who works which shift on which date).
 *
 * Shows the roster grid with assign/cancel capability and swap requests.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CircleSlash,
  Clock,
  LogIn,
  Plus,
  ArrowRightLeft,
} from "lucide-react";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { LoadingBlock } from "@/components/ui/Spinner";
import { SelectInput } from "@/components/ui/SelectInput";
import { TextInput } from "@/components/ui/TextInput";
import { Textarea } from "@/components/ui/Textarea";
import { can, type ActiveContext } from "@/domain/identity/types";
import {
  listEmployeeShifts,
  assignShift,
  cancelShiftAssignment,
  listShiftSwaps,
  requestShiftSwap,
  approveShiftSwap,
  rejectShiftSwap,
  listShifts,
} from "@/domain/hr/shift-service";
import { listEmployees } from "@/domain/hr/employee-service";
import type {
  HRScope,
  EmployeeShift,
  Shift,
  Employee,
  ShiftSwap,
} from "@/domain/hr/types";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

export type RosterView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_organization"
  | "scoped";

export function pageStatusFor(status: ContextStatus, context: ActiveContext): RosterView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null && context.propertyId !== null
      ? "scoped"
      : "no_organization";
  }
  return "bootstrapping";
}

const NO_BACKEND_COPY = "This build has no backend configured, so it cannot read the roster.";

export default function RosterPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const storeError = useContextStore((s) => s.error);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const scope = useMemo<HRScope | null>(
    () =>
      context.organizationId !== null && context.propertyId !== null
        ? { organizationId: context.organizationId, propertyId: context.propertyId }
        : null,
    [context.organizationId, context.propertyId],
  );

  const canView = can("hr.roster.view", permissions);
  const canManage = can("hr.roster.manage", permissions);

  const today = new Date().toISOString().split("T")[0];
  const weekFromNow = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];

  const [roster, setRoster] = useState<EmployeeShift[] | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [swaps, setSwaps] = useState<ShiftSwap[]>([]);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(weekFromNow);
  const [listError, setListError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showSwapDialog, setShowSwapDialog] = useState(false);

  const reload = useCallback(() => setReloadTick((tick) => tick + 1), []);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || scope === null || !canView) return;
    let ignore = false;
    setRoster(null);
    setListError(null);

    Promise.all([
      listEmployeeShifts(scope, { dateFrom, dateTo }),
      listShifts(scope),
      listEmployees(scope),
      listShiftSwaps(scope),
    ])
      .then(([rows, sh, emps, sw]) => {
        if (ignore) return;
        setRoster(rows);
        setShifts(sh);
        setEmployees(emps);
        setSwaps(sw.filter((s) => s.status === "PENDING"));
      })
      .catch((error) => {
        if (!ignore) setListError(toPublicError(error).message);
      });
    return () => {
      ignore = true;
    };
  }, [view, scope, canView, dateFrom, dateTo, reloadTick]);

  const shiftById = useMemo(() => {
    const map = new Map<string, Shift>();
    for (const s of shifts) map.set(s.id, s);
    return map;
  }, [shifts]);

  const employeeById = useMemo(() => {
    const map = new Map<string, Employee>();
    for (const e of employees) map.set(e.id, e);
    return map;
  }, [employees]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          <Clock className="size-5 shrink-0 text-brand-600" aria-hidden />
          Roster
        </h2>
        <p className="mt-1 text-sm text-muted">
          Employee shift schedule. Assign shifts, manage swap requests and view the roster.
        </p>
      </header>

      {view === "bootstrapping" && <LoadingBlock label="Loading your workspace…" />}

      {view === "unconfigured" && (
        <EmptyState
          icon={<CircleSlash aria-hidden />}
          title="Backend not configured"
          description={storeError ?? NO_BACKEND_COPY}
        />
      )}

      {view === "unauthenticated" && (
        <EmptyState
          icon={<LogIn aria-hidden />}
          title="Sign in to view the roster"
          description="There is no active session for this build to read a tenant from."
        />
      )}

      {view === "no_organization" && (
        <EmptyState
          icon={<Clock aria-hidden />}
          title="Choose an organization and property first"
          description="The roster belongs to a property. Pick one and this screen will show its schedule."
        />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied capability="view the roster" permission="hr.roster.view" />
      )}

      {view === "scoped" && scope !== null && canView && (
        <>
          {listError !== null && (
            <p role="alert" className="rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger">
              {listError}
            </p>
          )}

          <Card
            actions={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={reload}>
                  Reload
                </Button>
                {canManage && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<ArrowRightLeft className="size-4" aria-hidden />}
                      onClick={() => setShowSwapDialog(true)}
                    >
                      Request swap
                    </Button>
                    <Button
                      size="sm"
                      icon={<Plus className="size-4" aria-hidden />}
                      onClick={() => setShowAssignDialog(true)}
                    >
                      Assign shift
                    </Button>
                  </>
                )}
              </div>
            }
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="From date">
                <TextInput type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </Field>
              <Field label="To date">
                <TextInput type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </Field>
            </div>
          </Card>

          {swaps.length > 0 && (
            <Card title="Pending swap requests">
              <div className="flex flex-col gap-2">
                {swaps.map((swap) => {
                  const requester = employeeById.get(swap.requesterId);
                  const responder = employeeById.get(swap.responderId);
                  return (
                    <div key={swap.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-3 text-sm">
                      <div>
                        <p className="text-ink">
                          {requester?.firstName ?? "???"} ↔ {responder?.firstName ?? "???"}
                        </p>
                        <p className="text-xs text-muted">
                          Swap date: {swap.swapDate}
                          {swap.reason && ` · ${swap.reason}`}
                        </p>
                      </div>
                      {canManage && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => { approveShiftSwap(swap.id).then(reload); }}>
                            Approve
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { rejectShiftSwap(swap.id).then(reload); }}>
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {roster === null ? (
            <LoadingBlock label="Reading roster…" />
          ) : roster.length === 0 ? (
            <EmptyState
              icon={<Clock aria-hidden />}
              title="No roster entries"
              description="No shifts have been assigned for this date range."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {roster.map((entry) => {
                const emp = employeeById.get(entry.employeeId);
                const shift = shiftById.get(entry.shiftId);
                return (
                  <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4 shadow-soft">
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {emp ? (emp.fullName || emp.firstName) : entry.employeeId.slice(0, 8) + "…"}
                      </p>
                      <p className="text-xs text-muted">
                        {entry.shiftDate} · {shift ? shift.name : "Unknown shift"}
                        {shift && ` (${shift.startTime}–${shift.endTime})`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={entry.status === "SCHEDULED" ? "brand" : entry.status === "CANCELLED" ? "muted" : "warning"}>
                        {entry.status.replace(/_/g, " ")}
                      </Badge>
                      {canManage && entry.status === "SCHEDULED" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            cancelShiftAssignment(entry.id).then(reload);
                          }}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {showAssignDialog && scope !== null && (
        <AssignShiftDialog
          scope={scope}
          employees={employees}
          shifts={shifts}
          onClose={() => setShowAssignDialog(false)}
          onDone={() => {
            setShowAssignDialog(false);
            reload();
          }}
        />
      )}

      {showSwapDialog && scope !== null && (
        <SwapRequestDialog
          employees={employees}
          onClose={() => setShowSwapDialog(false)}
          onDone={() => {
            setShowSwapDialog(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

function AssignShiftDialog({
  scope,
  employees,
  shifts,
  onClose,
  onDone,
}: {
  scope: HRScope;
  employees: Employee[];
  shifts: Shift[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [employeeId, setEmployeeId] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [shiftDate, setShiftDate] = useState(new Date().toISOString().split("T")[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId || !shiftId) {
      setError("Employee and shift are required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await assignShift(scope, { employeeId, shiftId, shiftDate });
      onDone();
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title="Assign shift">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Employee" required>
          <SelectInput
            options={[
              { value: "", label: "Select employee…" },
              ...employees.map((e) => ({ value: e.id, label: e.fullName || e.firstName })),
            ]}
            value={employeeId}
            onChange={(v) => setEmployeeId(v)}
          />
        </Field>
        <Field label="Shift" required>
          <SelectInput
            options={[
              { value: "", label: "Select shift…" },
              ...shifts.filter((s) => s.isActive).map((s) => ({
                value: s.id,
                label: `${s.name} (${s.startTime}–${s.endTime})`,
              })),
            ]}
            value={shiftId}
            onChange={(v) => setShiftId(v)}
          />
        </Field>
        <Field label="Date" required>
          <TextInput type="date" value={shiftDate} onChange={(e) => setShiftDate(e.target.value)} required />
        </Field>
        {error && (
          <p role="alert" className="rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Assigning…" : "Assign shift"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function SwapRequestDialog({
  employees,
  onClose,
  onDone,
}: {
  employees: Employee[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [requesterId, setRequesterId] = useState("");
  const [responderId, setResponderId] = useState("");
  const [swapDate, setSwapDate] = useState(new Date().toISOString().split("T")[0]);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requesterId || !responderId) {
      setError("Both employees are required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await requestShiftSwap({
        requesterId,
        responderId,
        swapDate,
        reason: reason.trim() || null,
      });
      onDone();
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title="Request shift swap">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Requester" required>
          <SelectInput
            options={[
              { value: "", label: "Select employee…" },
              ...employees.map((e) => ({ value: e.id, label: e.fullName || e.firstName })),
            ]}
            value={requesterId}
            onChange={(v) => setRequesterId(v)}
          />
        </Field>
        <Field label="Responder" required>
          <SelectInput
            options={[
              { value: "", label: "Select employee…" },
              ...employees.map((e) => ({ value: e.id, label: e.fullName || e.firstName })),
            ]}
            value={responderId}
            onChange={(v) => setResponderId(v)}
          />
        </Field>
        <Field label="Swap date" required>
          <TextInput type="date" value={swapDate} onChange={(e) => setSwapDate(e.target.value)} required />
        </Field>
        <Field label="Reason">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
        </Field>
        {error && (
          <p role="alert" className="rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Submitting…" : "Request swap"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
