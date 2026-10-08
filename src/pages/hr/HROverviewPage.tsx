/**
 * HR Overview — workforce dashboard for the property.
 *
 * Reads employees, attendance, leave requests and shifts to surface headline
 * headcount, today's attendance, pending leaves and open shift assignments.
 * Answers "how is the workforce doing today?" at a glance.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  CircleSlash,
  Clock,
  LogIn,
  Users,
  UserCheck,
  UserX,
  ClipboardList,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { can, type ActiveContext } from "@/domain/identity/types";
import {
  listEmployees,
  listDesignations,
} from "@/domain/hr/employee-service";
import {
  listAttendanceRecords,
} from "@/domain/hr/attendance-service";
import {
  listShifts,
  listEmployeeShifts,
} from "@/domain/hr/shift-service";
import {
  listLeaveRequests,
  listHolidays,
} from "@/domain/hr/leave-service";
import type { HRScope } from "@/domain/hr/types";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

export type HROverviewView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_organization"
  | "scoped";

export function pageStatusFor(status: ContextStatus, context: ActiveContext): HROverviewView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null && context.propertyId !== null
      ? "scoped"
      : "no_organization";
  }
  return "bootstrapping";
}

type Counts = {
  totalEmployees: number;
  activeEmployees: number;
  todayPresent: number;
  todayAbsent: number;
  todayOnLeave: number;
  pendingLeaves: number;
  activeShifts: number;
  upcomingHolidays: number;
  expiringDocuments: number;
};

const NO_BACKEND_COPY = "This build has no backend configured, so it cannot read HR data.";

export default function HROverviewPage() {
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

  const canView = can("hr.view", permissions);

  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || scope === null || !canView) return;
    let ignore = false;
    setCounts(null);
    setError(null);

    const today = new Date().toISOString().split("T")[0];
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];

    Promise.all([
      listEmployees(scope).catch(() => []),
      listDesignations(scope).catch(() => []),
      listAttendanceRecords(scope, { dateFrom: today, dateTo: today }).catch(() => []),
      listEmployeeShifts(scope, { dateFrom: today, dateTo: today }).catch(() => []),
      listLeaveRequests(scope, { status: "PENDING" }).catch(() => []),
      listShifts(scope).catch(() => []),
      listHolidays(scope, { dateFrom: today, dateTo: thirtyDaysFromNow }).catch(() => []),
    ])
      .then(([employees, _designations, todayAttendance, _todayShifts, pendingLeaves, shifts, holidays]) => {
        if (ignore) return;

        const activeEmployees = employees.filter((e) => e.employmentStatus === "ACTIVE").length;
        const todayPresent = todayAttendance.filter((a) => a.status === "PRESENT").length;
        const todayAbsent = todayAttendance.filter((a) => a.status === "ABSENT").length;
        const todayOnLeave = todayAttendance.filter((a) => a.status === "ON_LEAVE").length;
        const activeShifts = shifts.filter((s) => s.isActive).length;
        const upcomingHolidays = holidays.length;

        setCounts({
          totalEmployees: employees.length,
          activeEmployees,
          todayPresent,
          todayAbsent,
          todayOnLeave,
          pendingLeaves: pendingLeaves.length,
          activeShifts,
          upcomingHolidays,
          expiringDocuments: 0,
        });
      })
      .catch((err) => {
        if (!ignore) setError(toPublicError(err).message);
      });

    return () => {
      ignore = true;
    };
  }, [view, scope, canView]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          <Users className="size-5 shrink-0 text-brand-600" aria-hidden />
          HR & Workforce
        </h2>
        <p className="mt-1 text-sm text-muted">
          Employee management, attendance tracking, shift scheduling, leave and document
          compliance. One workspace for the entire workforce lifecycle.
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
          title="Sign in to view HR"
          description="There is no active session for this build to read a tenant from."
        />
      )}

      {view === "no_organization" && (
        <EmptyState
          icon={<Users aria-hidden />}
          title="Choose an organization and property first"
          description="HR records belong to a property. Pick one and this screen will show its workforce."
        />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied capability="view HR" permission="hr.view" />
      )}

      {view === "scoped" && scope !== null && canView && (
        <>
          {error !== null && (
            <p role="alert" className="rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}

          {counts === null ? (
            <LoadingBlock label="Reading workforce data…" />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <KpiCard
                icon={<Users className="size-4" aria-hidden />}
                label="Total employees"
                value={counts.totalEmployees}
                href="/hr/employees"
              />
              <KpiCard
                icon={<UserCheck className="size-4" aria-hidden />}
                label="Present today"
                value={counts.todayPresent}
                href="/hr/attendance"
              />
              <KpiCard
                icon={<UserX className="size-4" aria-hidden />}
                label="Absent today"
                value={counts.todayAbsent}
                href="/hr/attendance"
              />
              <KpiCard
                icon={<ClipboardList className="size-4" aria-hidden />}
                label="Pending leaves"
                value={counts.pendingLeaves}
                href="/hr/leave"
              />
              <KpiCard
                icon={<Clock className="size-4" aria-hidden />}
                label="Active shifts"
                value={counts.activeShifts}
                href="/hr/shifts"
              />
            </div>
          )}

          <Card
            title="HR modules"
            description="Manage employees, attendance, shifts and leave."
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ModuleRow
                icon={<Users className="size-4 text-brand-600" aria-hidden />}
                title="Employees"
                description="Employee records, designations, assignments and documents."
                href="/hr/employees"
              />
              <ModuleRow
                icon={<Calendar className="size-4 text-brand-600" aria-hidden />}
                title="Attendance"
                description="Daily attendance marking, corrections and history."
                href="/hr/attendance"
              />
              <ModuleRow
                icon={<Clock className="size-4 text-brand-600" aria-hidden />}
                title="Shifts & Roster"
                description="Shift definitions, roster assignments and swap requests."
                href="/hr/roster"
              />
              <ModuleRow
                icon={<ClipboardList className="size-4 text-brand-600" aria-hidden />}
                title="Leave"
                description="Leave types, requests, approvals and holiday calendar."
                href="/hr/leave"
              />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  href: string;
}) {
  return (
    <a
      href={href}
      className="group flex flex-col gap-2 rounded-lg border border-line bg-surface p-4 shadow-soft transition-colors hover:border-brand-200 hover:bg-brand-50/30"
    >
      <div className="flex items-center gap-2 text-muted">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <span className="text-2xl font-semibold tabular-nums text-ink">{value}</span>
    </a>
  );
}

function ModuleRow({
  icon,
  title,
  description,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="flex items-start gap-3 rounded-lg border border-line p-3 transition-colors hover:border-brand-200 hover:bg-brand-50/20"
    >
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-xs text-muted">{description}</p>
      </div>
    </a>
  );
}
