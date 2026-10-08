/**
 * Employee Profile — 360° view of a single employee.
 *
 * Shows personal details, employment info, assignments, attendance summary,
 * leave balance and documents with expiry tracking.
 */

import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  ArrowLeft,
  CircleSlash,
  FileText,
  LogIn,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { can, type ActiveContext } from "@/domain/identity/types";
import {
  getEmployee,
  listEmployeeAssignments,
  listEmployeeDocuments,
  listDesignations,
} from "@/domain/hr/employee-service";
import { listAttendanceRecords } from "@/domain/hr/attendance-service";
import { listLeaveRequests } from "@/domain/hr/leave-service";
import type {
  HRScope,
  Employee,
  EmployeeAssignment,
  EmployeeDocument,
  AttendanceRecord,
  LeaveRequest,
  Designation,
} from "@/domain/hr/types";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

export type EmployeeProfileView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_organization"
  | "scoped";

export function pageStatusFor(status: ContextStatus, context: ActiveContext): EmployeeProfileView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null && context.propertyId !== null
      ? "scoped"
      : "no_organization";
  }
  return "bootstrapping";
}

const NO_BACKEND_COPY = "This build has no backend configured, so it cannot read employee data.";

export default function EmployeeProfilePage() {
  const { employeeId } = useParams<{ employeeId: string }>();
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

  const canView = can("hr.employee.view", permissions);

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [assignments, setAssignments] = useState<EmployeeAssignment[]>([]);
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || scope === null || !canView || !employeeId) return;
    let ignore = false;
    setEmployee(null);
    setError(null);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
    const today = new Date().toISOString().split("T")[0];

    Promise.all([
      getEmployee(scope, employeeId).catch(() => null),
      listEmployeeAssignments(scope, employeeId).catch(() => []),
      listEmployeeDocuments(scope, employeeId).catch(() => []),
      listAttendanceRecords(scope, { employeeId, dateFrom: thirtyDaysAgo, dateTo: today }).catch(() => []),
      listLeaveRequests(scope, { employeeId }).catch(() => []),
      listDesignations(scope).catch(() => []),
    ])
      .then(([emp, assigns, docs, att, leaves, desigs]) => {
        if (ignore) return;
        setEmployee(emp);
        setAssignments(assigns.filter((a) => a.employeeId === employeeId));
        setDocuments(docs.filter((d) => d.employeeId === employeeId));
        setAttendance(att);
        setLeaveRequests(leaves);
        setDesignations(desigs);
      })
      .catch((err) => {
        if (!ignore) setError(toPublicError(err).message);
      });

    return () => {
      ignore = true;
    };
  }, [view, scope, canView, employeeId]);

  const designation = useMemo(() => {
    if (!employee?.designationId) return null;
    return designations.find((d) => d.id === employee.designationId) ?? null;
  }, [employee, designations]);

  const attendanceSummary = useMemo(() => {
    const present = attendance.filter((a) => a.status === "PRESENT").length;
    const absent = attendance.filter((a) => a.status === "ABSENT").length;
    const onLeave = attendance.filter((a) => a.status === "ON_LEAVE").length;
    const late = attendance.filter((a) => a.isLate).length;
    return { present, absent, onLeave, late, total: attendance.length };
  }, [attendance]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <header>
        <a href="/hr/employees" className="mb-2 flex items-center gap-1 text-sm text-muted hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden />
          Back to employees
        </a>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          <Users className="size-5 shrink-0 text-brand-600" aria-hidden />
          Employee Profile
        </h2>
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
          title="Sign in to view employees"
          description="There is no active session for this build to read a tenant from."
        />
      )}

      {view === "no_organization" && (
        <EmptyState
          icon={<Users aria-hidden />}
          title="Choose an organization and property first"
          description="Employees belong to a property. Pick one and this screen will show its workforce."
        />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied capability="view employees" permission="hr.employee.view" />
      )}

      {view === "scoped" && scope !== null && canView && (
        <>
          {error !== null && (
            <p role="alert" className="rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}

          {employee === null ? (
            <LoadingBlock label="Reading employee…" />
          ) : (
            <>
              <Card title="Personal details">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <InfoRow label="Full name" value={employee.fullName || `${employee.firstName}${employee.lastName ? ` ${employee.lastName}` : ""}`} />
                  <InfoRow label="Employee code" value={employee.employeeCode} />
                  <InfoRow label="Email" value={employee.email ?? "—"} />
                  <InfoRow label="Mobile" value={employee.mobile ?? "—"} />
                  <InfoRow label="Gender" value={employee.gender ?? "—"} />
                  <InfoRow label="Date of birth" value={employee.dateOfBirth ?? "—"} />
                  <InfoRow label="Date of joining" value={employee.dateOfJoining} />
                  <InfoRow label="Date of leaving" value={employee.dateOfLeaving ?? "—"} />
                  <InfoRow label="Employment type" value={employee.employmentType.replace(/_/g, " ")} />
                  <InfoRow
                    label="Status"
                    value={
                      <Badge tone={employee.employmentStatus === "ACTIVE" ? "brand" : "muted"}>
                        {employee.employmentStatus.replace(/_/g, " ")}
                      </Badge>
                    }
                  />
                  {designation && <InfoRow label="Designation" value={designation.name} />}
                  <InfoRow label="Address" value={employee.address ?? "—"} />
                </div>
              </Card>

              <Card title="Attendance (last 30 days)">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <MiniStat label="Present" value={attendanceSummary.present} />
                  <MiniStat label="Absent" value={attendanceSummary.absent} />
                  <MiniStat label="On leave" value={attendanceSummary.onLeave} />
                  <MiniStat label="Late" value={attendanceSummary.late} />
                  <MiniStat label="Total days" value={attendanceSummary.total} />
                </div>
              </Card>

              <Card title="Assignments">
                {assignments.length === 0 ? (
                  <p className="text-sm text-muted">No property assignments recorded.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {assignments.map((a) => (
                      <div key={a.id} className="rounded-lg border border-line p-3 text-sm">
                        <p className="font-medium text-ink">
                          Property {a.propertyId.slice(0, 8)}…
                          {a.isPrimary && <Badge tone="brand">Primary</Badge>}
                        </p>
                        <p className="text-xs text-muted">
                          {a.startsOn}{a.endsOn ? ` → ${a.endsOn}` : " → ongoing"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card title="Recent leave requests">
                {leaveRequests.length === 0 ? (
                  <p className="text-sm text-muted">No leave requests.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {leaveRequests.slice(0, 5).map((lr) => (
                      <div key={lr.id} className="flex items-center justify-between rounded-lg border border-line p-3 text-sm">
                        <span className="text-ink">
                          {lr.fromDate} → {lr.toDate} ({lr.days} day{lr.days !== 1 ? "s" : ""})
                        </span>
                        <Badge tone={lr.status === "APPROVED" ? "brand" : lr.status === "REJECTED" ? "muted" : "warning"}>
                          {lr.status.replace(/_/g, " ")}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card title="Documents">
                {documents.length === 0 ? (
                  <p className="text-sm text-muted">No documents uploaded.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {documents.map((doc) => {
                      const isExpiringSoon = doc.expiresOn && doc.expiresOn <= new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
                      return (
                        <div key={doc.id} className="flex items-center justify-between rounded-lg border border-line p-3 text-sm">
                          <div className="flex items-center gap-2">
                            <FileText className="size-4 text-muted" aria-hidden />
                            <span className="text-ink">{doc.documentType.replace(/_/g, " ")}</span>
                            {doc.documentNumber && <span className="text-xs text-muted">#{doc.documentNumber}</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            {doc.expiresOn && (
                              <span className={`text-xs ${isExpiringSoon ? "text-danger" : "text-muted"}`}>
                                Expires {doc.expiresOn}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{value}</dd>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-line p-3 text-center">
      <p className="text-2xl font-semibold tabular-nums text-ink">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
