/**
 * Leave — leave types, requests and holiday calendar.
 *
 * Three sections: leave type management, leave request workflow (request/approve/reject),
 * and the property holiday calendar.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CircleSlash,
  ClipboardList,
  LogIn,
  Plus,
  Palmtree,
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
  listLeaveTypes,
  createLeaveType,
  listLeaveRequests,
  requestLeave,
  approveLeave,
  rejectLeave,
  listHolidays,
  createHoliday,
} from "@/domain/hr/leave-service";
import { listEmployees } from "@/domain/hr/employee-service";
import type {
  HRScope,
  LeaveType,
  LeaveRequest,
  Holiday,
  Employee,
  LeaveTypeCategory,
  LeaveRequestStatus,
  HolidayType,
} from "@/domain/hr/types";
import { LEAVE_TYPE_CATEGORIES, LEAVE_REQUEST_STATUSES, HOLIDAY_TYPES } from "@/domain/hr/types";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

export type LeaveView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_organization"
  | "scoped";

export function pageStatusFor(status: ContextStatus, context: ActiveContext): LeaveView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null && context.propertyId !== null
      ? "scoped"
      : "no_organization";
  }
  return "bootstrapping";
}

const NO_BACKEND_COPY = "This build has no backend configured, so it cannot read leave data.";

export default function LeavePage() {
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

  const canView = can("hr.leave.view", permissions);
  const canRequest = can("hr.leave.request", permissions);
  const canApprove = can("hr.leave.approve", permissions);
  const canManageHolidays = can("hr.holiday.manage", permissions);
  const canViewHolidays = can("hr.holiday.view", permissions);

  const [leaveTypes, setLeaveTypes] = useState<LeaveType[] | null>(null);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[] | null>(null);
  const [holidays, setHolidays] = useState<Holiday[] | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [statusFilter, setStatusFilter] = useState<LeaveRequestStatus | "">("");
  const [listError, setListError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [showLeaveTypeDialog, setShowLeaveTypeDialog] = useState(false);
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [showHolidayDialog, setShowHolidayDialog] = useState(false);

  const reload = useCallback(() => setReloadTick((tick) => tick + 1), []);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || scope === null || !canView) return;
    let ignore = false;
    setLeaveTypes(null);
    setLeaveRequests(null);
    setHolidays(null);
    setListError(null);

    Promise.all([
      listLeaveTypes(scope),
      listLeaveRequests(scope, { status: statusFilter || undefined }),
      listHolidays(scope),
      listEmployees(scope),
    ])
      .then(([types, requests, hols, emps]) => {
        if (ignore) return;
        setLeaveTypes(types);
        setLeaveRequests(requests);
        setHolidays(hols);
        setEmployees(emps);
      })
      .catch((error) => {
        if (!ignore) setListError(toPublicError(error).message);
      });
    return () => {
      ignore = true;
    };
  }, [view, scope, canView, statusFilter, reloadTick]);

  const employeeById = useMemo(() => {
    const map = new Map<string, Employee>();
    for (const e of employees) map.set(e.id, e);
    return map;
  }, [employees]);

  const leaveTypeById = useMemo(() => {
    const map = new Map<string, LeaveType>();
    for (const lt of leaveTypes ?? []) map.set(lt.id, lt);
    return map;
  }, [leaveTypes]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          <ClipboardList className="size-5 shrink-0 text-brand-600" aria-hidden />
          Leave & Holidays
        </h2>
        <p className="mt-1 text-sm text-muted">
          Leave types, requests with approval workflow, and the property holiday calendar.
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
          title="Sign in to view leave"
          description="There is no active session for this build to read a tenant from."
        />
      )}

      {view === "no_organization" && (
        <EmptyState
          icon={<ClipboardList aria-hidden />}
          title="Choose an organization and property first"
          description="Leave records belong to a property. Pick one and this screen will show its data."
        />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied capability="view leave" permission="hr.leave.view" />
      )}

      {view === "scoped" && scope !== null && canView && (
        <>
          {listError !== null && (
            <p role="alert" className="rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger">
              {listError}
            </p>
          )}

          {/* Leave types */}
          <Card
            title="Leave types"
            actions={
              can("hr.leave.request", permissions) ? (
                <Button size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => setShowLeaveTypeDialog(true)}>
                  New type
                </Button>
              ) : undefined
            }
          >
            {leaveTypes === null ? (
              <LoadingBlock label="Reading leave types…" />
            ) : leaveTypes.length === 0 ? (
              <p className="text-sm text-muted">No leave types configured.</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {leaveTypes.map((lt) => (
                  <div key={lt.id} className="rounded-lg border border-line p-3 text-sm">
                    <p className="font-semibold text-ink">{lt.name}</p>
                    <p className="text-xs text-muted">
                      {lt.category.replace(/_/g, " ")}
                      {lt.maxDaysPerYear ? ` · Max ${lt.maxDaysPerYear} days/yr` : ""}
                      {lt.isPaid ? " · Paid" : " · Unpaid"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Leave requests */}
          <Card
            title="Leave requests"
            actions={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={reload}>
                  Reload
                </Button>
                {canRequest && (
                  <Button
                    size="sm"
                    icon={<Plus className="size-4" aria-hidden />}
                    onClick={() => setShowRequestDialog(true)}
                  >
                    New request
                  </Button>
                )}
              </div>
            }
          >
            <div className="mb-3 max-w-xs">
              <Field label="Filter by status">
                <SelectInput
                  options={[
                    { value: "", label: "All statuses" },
                    ...LEAVE_REQUEST_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, " ") })),
                  ]}
                  value={statusFilter}
                  onChange={(v) => setStatusFilter(v as LeaveRequestStatus | "")}
                />
              </Field>
            </div>

            {leaveRequests === null ? (
              <LoadingBlock label="Reading leave requests…" />
            ) : leaveRequests.length === 0 ? (
              <p className="text-sm text-muted">No leave requests found.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {leaveRequests.map((lr) => {
                  const emp = employeeById.get(lr.employeeId);
                  const lt = leaveTypeById.get(lr.leaveTypeId);
                  return (
                    <div key={lr.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-4">
                      <div>
                        <p className="text-sm font-semibold text-ink">
                          {emp ? (emp.fullName || emp.firstName) : lr.employeeId.slice(0, 8) + "…"}
                        </p>
                        <p className="text-xs text-muted">
                          {lt?.name ?? "Unknown type"} · {lr.fromDate} → {lr.toDate} ({lr.days} day{lr.days !== 1 ? "s" : ""})
                        </p>
                        {lr.reason && <p className="mt-1 text-xs text-muted">{lr.reason}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={lr.status === "APPROVED" ? "brand" : lr.status === "REJECTED" ? "muted" : "warning"}>
                          {lr.status.replace(/_/g, " ")}
                        </Badge>
                        {canApprove && lr.status === "PENDING" && (
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => approveLeave(lr.id).then(reload)}>
                              Approve
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => rejectLeave(lr.id, "Rejected by manager").then(reload)}>
                              Reject
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Holidays */}
          {canViewHolidays && (
            <Card
              title="Holiday calendar"
              actions={
                canManageHolidays ? (
                  <Button size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => setShowHolidayDialog(true)}>
                    Add holiday
                  </Button>
                ) : undefined
              }
            >
              {holidays === null ? (
                <LoadingBlock label="Reading holidays…" />
              ) : holidays.length === 0 ? (
                <p className="text-sm text-muted">No holidays configured for this property.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {holidays.sort((a, b) => a.holidayDate.localeCompare(b.holidayDate)).map((h) => (
                    <div key={h.id} className="flex items-center justify-between rounded-lg border border-line p-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Palmtree className="size-4 text-muted" aria-hidden />
                        <span className="font-medium text-ink">{h.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted">{h.holidayDate}</span>
                        <Badge tone="neutral">{h.holidayType.replace(/_/g, " ")}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </>
      )}

      {showLeaveTypeDialog && scope !== null && (
        <LeaveTypeDialog
          scope={scope}
          onClose={() => setShowLeaveTypeDialog(false)}
          onDone={() => {
            setShowLeaveTypeDialog(false);
            reload();
          }}
        />
      )}

      {showRequestDialog && scope !== null && (
        <LeaveRequestDialog
          scope={scope}
          employees={employees}
          leaveTypes={leaveTypes ?? []}
          onClose={() => setShowRequestDialog(false)}
          onDone={() => {
            setShowRequestDialog(false);
            reload();
          }}
        />
      )}

      {showHolidayDialog && scope !== null && (
        <HolidayDialog
          scope={scope}
          onClose={() => setShowHolidayDialog(false)}
          onDone={() => {
            setShowHolidayDialog(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

function LeaveTypeDialog({
  scope,
  onClose,
  onDone,
}: {
  scope: HRScope;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [category, setCategory] = useState<LeaveTypeCategory>("EARNED");
  const [maxDays, setMaxDays] = useState("");
  const [isPaid, setIsPaid] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Leave type name is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createLeaveType(scope, {
        name: name.trim(),
        code: code.trim() || null,
        category,
        maxDaysPerYear: maxDays ? parseInt(maxDays) : null,
        isPaid,
      });
      onDone();
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title="New leave type">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Name" required>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Code">
          <TextInput value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
        <Field label="Category">
          <SelectInput
            options={LEAVE_TYPE_CATEGORIES.map((c) => ({ value: c, label: c.replace(/_/g, " ") }))}
            value={category}
            onChange={(v) => setCategory(v as LeaveTypeCategory)}
          />
        </Field>
        <Field label="Max days per year">
          <TextInput type="number" value={maxDays} onChange={(e) => setMaxDays(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isPaid} onChange={(e) => setIsPaid(e.target.checked)} />
          Paid leave
        </label>
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
            {submitting ? "Creating…" : "Create leave type"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function LeaveRequestDialog({
  scope,
  employees,
  leaveTypes,
  onClose,
  onDone,
}: {
  scope: HRScope;
  employees: Employee[];
  leaveTypes: LeaveType[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [employeeId, setEmployeeId] = useState("");
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [days, setDays] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId || !leaveTypeId || !fromDate || !toDate || !days) {
      setError("All fields except reason are required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await requestLeave(scope, {
        employeeId,
        leaveTypeId,
        fromDate,
        toDate,
        days: parseFloat(days),
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
    <Dialog open onClose={onClose} title="New leave request">
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
        <Field label="Leave type" required>
          <SelectInput
            options={[
              { value: "", label: "Select type…" },
              ...leaveTypes.filter((lt) => lt.isActive).map((lt) => ({ value: lt.id, label: lt.name })),
            ]}
            value={leaveTypeId}
            onChange={(v) => setLeaveTypeId(v)}
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="From date" required>
            <TextInput type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} required />
          </Field>
          <Field label="To date" required>
            <TextInput type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} required />
          </Field>
        </div>
        <Field label="Number of days" required>
          <TextInput type="number" step="0.5" value={days} onChange={(e) => setDays(e.target.value)} required />
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
            {submitting ? "Submitting…" : "Submit request"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function HolidayDialog({
  scope,
  onClose,
  onDone,
}: {
  scope: HRScope;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayType, setHolidayType] = useState<HolidayType>("MANDATORY");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !holidayDate) {
      setError("Name and date are required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createHoliday(scope, {
        name: name.trim(),
        holidayDate,
        holidayType,
        description: description.trim() || null,
      });
      onDone();
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title="Add holiday">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Holiday name" required>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Date" required>
          <TextInput type="date" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} required />
        </Field>
        <Field label="Type">
          <SelectInput
            options={HOLIDAY_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, " ") }))}
            value={holidayType}
            onChange={(v) => setHolidayType(v as HolidayType)}
          />
        </Field>
        <Field label="Description">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
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
            {submitting ? "Adding…" : "Add holiday"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
