/**
 * Attendance — daily attendance records with date range and status filters.
 *
 * Supports marking attendance and correcting entries for employees.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calendar,
  CircleSlash,
  LogIn,
  Plus,
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
  listAttendanceRecords,
  markAttendance,
  correctAttendance,
} from "@/domain/hr/attendance-service";
import { listEmployees } from "@/domain/hr/employee-service";
import type {
  HRScope,
  AttendanceRecord,
  AttendanceStatus,
  Employee,
} from "@/domain/hr/types";
import { ATTENDANCE_STATUSES } from "@/domain/hr/types";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

export type AttendanceView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_organization"
  | "scoped";

export function pageStatusFor(status: ContextStatus, context: ActiveContext): AttendanceView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null && context.propertyId !== null
      ? "scoped"
      : "no_organization";
  }
  return "bootstrapping";
}

const NO_BACKEND_COPY = "This build has no backend configured, so it cannot read attendance.";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  ...ATTENDANCE_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, " ") })),
];

export default function AttendancePage() {
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

  const canView = can("hr.attendance.view", permissions);
  const canMark = can("hr.attendance.mark", permissions);
  const canCorrect = can("hr.attendance.correct", permissions);

  const today = new Date().toISOString().split("T")[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];

  const [records, setRecords] = useState<AttendanceRecord[] | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | "">("");
  const [dateFrom, setDateFrom] = useState(weekAgo);
  const [dateTo, setDateTo] = useState(today);
  const [listError, setListError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [showMarkDialog, setShowMarkDialog] = useState(false);
  const [correctingRecord, setCorrectingRecord] = useState<AttendanceRecord | null>(null);

  const reload = useCallback(() => setReloadTick((tick) => tick + 1), []);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || scope === null || !canView) return;
    let ignore = false;
    setRecords(null);
    setListError(null);

    Promise.all([
      listAttendanceRecords(scope, {
        status: statusFilter || undefined,
        dateFrom,
        dateTo,
      }),
      listEmployees(scope),
    ])
      .then(([rows, emps]) => {
        if (ignore) return;
        setRecords(rows);
        setEmployees(emps);
      })
      .catch((error) => {
        if (!ignore) setListError(toPublicError(error).message);
      });
    return () => {
      ignore = true;
    };
  }, [view, scope, canView, statusFilter, dateFrom, dateTo, reloadTick]);

  const employeeById = useMemo(() => {
    const map = new Map<string, Employee>();
    for (const e of employees) map.set(e.id, e);
    return map;
  }, [employees]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          <Calendar className="size-5 shrink-0 text-brand-600" aria-hidden />
          Attendance
        </h2>
        <p className="mt-1 text-sm text-muted">
          Daily attendance records. Mark attendance and correct entries with audit trail.
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
          title="Sign in to view attendance"
          description="There is no active session for this build to read a tenant from."
        />
      )}

      {view === "no_organization" && (
        <EmptyState
          icon={<Calendar aria-hidden />}
          title="Choose an organization and property first"
          description="Attendance belongs to a property. Pick one and this screen will show its records."
        />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied capability="view attendance" permission="hr.attendance.view" />
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
                {canMark && (
                  <Button
                    size="sm"
                    icon={<Plus className="size-4" aria-hidden />}
                    onClick={() => setShowMarkDialog(true)}
                  >
                    Mark attendance
                  </Button>
                )}
              </div>
            }
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Status">
                <SelectInput
                  options={STATUS_OPTIONS}
                  value={statusFilter}
                  onChange={(v) => setStatusFilter(v as AttendanceStatus | "")}
                />
              </Field>
              <Field label="From date">
                <TextInput type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </Field>
              <Field label="To date">
                <TextInput type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </Field>
            </div>
          </Card>

          {records === null ? (
            <LoadingBlock label="Reading attendance…" />
          ) : records.length === 0 ? (
            <EmptyState
              icon={<Calendar aria-hidden />}
              title="No attendance records"
              description="No attendance has been recorded for this date range and filter."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {records.map((rec) => {
                const emp = employeeById.get(rec.employeeId);
                return (
                  <div key={rec.id} className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4 shadow-soft">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-ink">
                          {emp ? (emp.fullName || emp.firstName) : rec.employeeId.slice(0, 8) + "…"}
                        </p>
                        <p className="text-xs text-muted">{rec.attendanceDate}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={rec.status === "PRESENT" ? "brand" : rec.status === "ABSENT" ? "muted" : "warning"}>
                          {rec.status.replace(/_/g, " ")}
                        </Badge>
                        {canCorrect && (
                          <Button size="sm" variant="ghost" onClick={() => setCorrectingRecord(rec)}>
                            Correct
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-muted">
                      <span>Source: {rec.source.replace(/_/g, " ")}</span>
                      {rec.checkIn && <span>Check-in: {rec.checkIn}</span>}
                      {rec.checkOut && <span>Check-out: {rec.checkOut}</span>}
                      {rec.workHours && <span>Work: {rec.workHours}h</span>}
                      {rec.isLate && <span>Late ({rec.lateMinutes ?? "?"} min)</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {showMarkDialog && scope !== null && (
        <MarkAttendanceDialog
          scope={scope}
          employees={employees}
          onClose={() => setShowMarkDialog(false)}
          onCreated={() => {
            setShowMarkDialog(false);
            reload();
          }}
        />
      )}

      {correctingRecord && scope !== null && (
        <CorrectAttendanceDialog
          record={correctingRecord}
          onClose={() => setCorrectingRecord(null)}
          onCorrected={() => {
            setCorrectingRecord(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function MarkAttendanceDialog({
  scope,
  employees,
  onClose,
  onCreated,
}: {
  scope: HRScope;
  employees: Employee[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [employeeId, setEmployeeId] = useState("");
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split("T")[0]);
  const [attStatus, setAttStatus] = useState<AttendanceStatus>("PRESENT");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId) {
      setError("Employee is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await markAttendance(scope, {
        employeeId,
        attendanceDate,
        status: attStatus,
        checkIn: checkIn || null,
        checkOut: checkOut || null,
        notes: notes.trim() || null,
      });
      onCreated();
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title="Mark attendance">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Employee" required>
          <SelectInput
            options={[
              { value: "", label: "Select employee…" },
              ...employees.map((e) => ({
                value: e.id,
                label: e.fullName || e.firstName,
              })),
            ]}
            value={employeeId}
            onChange={(v) => setEmployeeId(v)}
          />
        </Field>
        <Field label="Date" required>
          <TextInput type="date" value={attendanceDate} onChange={(e) => setAttendanceDate(e.target.value)} required />
        </Field>
        <Field label="Status">
          <SelectInput
            options={ATTENDANCE_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, " ") }))}
            value={attStatus}
            onChange={(v) => setAttStatus(v as AttendanceStatus)}
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Check-in">
            <TextInput type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
          </Field>
          <Field label="Check-out">
            <TextInput type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
          </Field>
        </div>
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
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
            {submitting ? "Saving…" : "Mark attendance"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function CorrectAttendanceDialog({
  record,
  onClose,
  onCorrected,
}: {
  record: AttendanceRecord;
  onClose: () => void;
  onCorrected: () => void;
}) {
  const [newStatus, setNewStatus] = useState<AttendanceStatus>(record.status);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError("Correction reason is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await correctAttendance(record.id, {
        status: newStatus,
        reason: reason.trim(),
      });
      onCorrected();
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title="Correct attendance">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          Correcting attendance for {record.attendanceDate}.
        </p>
        <Field label="New status">
          <SelectInput
            options={ATTENDANCE_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, " ") }))}
            value={newStatus}
            onChange={(v) => setNewStatus(v as AttendanceStatus)}
          />
        </Field>
        <Field label="Reason" required>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} required />
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
            {submitting ? "Correcting…" : "Correct attendance"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
