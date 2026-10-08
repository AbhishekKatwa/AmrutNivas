/**
 * Employees — list all employees with filters for status, type and designation.
 *
 * Supports creating new employees and clicking through to the employee profile.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CircleSlash,
  LogIn,
  Plus,
  Users,
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
  listEmployees,
  createEmployee,
  listDesignations,
} from "@/domain/hr/employee-service";
import type {
  HRScope,
  Employee,
  EmploymentStatus,
  EmploymentType,
  Designation,
} from "@/domain/hr/types";
import { EMPLOYMENT_STATUSES, EMPLOYMENT_TYPES } from "@/domain/hr/types";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

export type EmployeesView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_organization"
  | "scoped";

export function pageStatusFor(status: ContextStatus, context: ActiveContext): EmployeesView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null && context.propertyId !== null
      ? "scoped"
      : "no_organization";
  }
  return "bootstrapping";
}

const NO_BACKEND_COPY = "This build has no backend configured, so it cannot read employees.";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  ...EMPLOYMENT_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, " ") })),
];

const TYPE_OPTIONS = [
  { value: "", label: "All types" },
  ...EMPLOYMENT_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, " ") })),
];

export default function EmployeesPage() {
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
  const canCreate = can("hr.employee.create", permissions);

  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [statusFilter, setStatusFilter] = useState<EmploymentStatus | "">("");
  const [typeFilter, setTypeFilter] = useState<EmploymentType | "">("");
  const [listError, setListError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const reload = useCallback(() => setReloadTick((tick) => tick + 1), []);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || scope === null || !canView) return;
    let ignore = false;
    setEmployees(null);
    setListError(null);

    Promise.all([
      listEmployees(scope, {
        status: statusFilter || undefined,
        employmentType: typeFilter || undefined,
      }),
      listDesignations(scope),
    ])
      .then(([rows, desigs]) => {
        if (ignore) return;
        setEmployees(rows);
        setDesignations(desigs);
      })
      .catch((error) => {
        if (!ignore) setListError(toPublicError(error).message);
      });
    return () => {
      ignore = true;
    };
  }, [view, scope, canView, statusFilter, typeFilter, reloadTick]);

  const designationById = useMemo(() => {
    const map = new Map<string, Designation>();
    for (const d of designations) map.set(d.id, d);
    return map;
  }, [designations]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          <Users className="size-5 shrink-0 text-brand-600" aria-hidden />
          Employees
        </h2>
        <p className="mt-1 text-sm text-muted">
          All employee records. Click an employee to open their profile.
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
                {canCreate && (
                  <Button
                    size="sm"
                    icon={<Plus className="size-4" aria-hidden />}
                    onClick={() => setShowCreateDialog(true)}
                  >
                    New employee
                  </Button>
                )}
              </div>
            }
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Status">
                <SelectInput
                  options={STATUS_OPTIONS}
                  value={statusFilter}
                  onChange={(v) => setStatusFilter(v as EmploymentStatus | "")}
                />
              </Field>
              <Field label="Employment type">
                <SelectInput
                  options={TYPE_OPTIONS}
                  value={typeFilter}
                  onChange={(v) => setTypeFilter(v as EmploymentType | "")}
                />
              </Field>
            </div>
          </Card>

          {employees === null ? (
            <LoadingBlock label="Reading employees…" />
          ) : employees.length === 0 ? (
            <EmptyState
              icon={<Users aria-hidden />}
              title="No employees yet"
              description="This organization has no employee records. Create one to start managing your workforce."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {employees.map((emp) => (
                <EmployeeCard key={emp.id} employee={emp} designation={emp.designationId ? designationById.get(emp.designationId) : undefined} />
              ))}
            </div>
          )}
        </>
      )}

      {showCreateDialog && scope !== null && (
        <CreateEmployeeDialog
          scope={scope}
          onClose={() => setShowCreateDialog(false)}
          onCreated={() => {
            setShowCreateDialog(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

function EmployeeCard({ employee, designation }: { employee: Employee; designation?: Designation }) {
  return (
    <a
      href={`/hr/employees/${employee.id}`}
      className="block rounded-lg border border-line bg-surface shadow-soft transition-colors hover:border-brand-200"
    >
      <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
              {employee.fullName || `${employee.firstName}${employee.lastName ? ` ${employee.lastName}` : ""}`}
              <Badge tone={statusTone(employee.employmentStatus)}>
                {employee.employmentStatus.replace(/_/g, " ")}
              </Badge>
            </h3>
            <p className="mt-0.5 text-xs text-muted">
              {employee.employeeCode}
              {designation ? ` · ${designation.name}` : ""}
              {employee.email ? ` · ${employee.email}` : ""}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>{employee.employmentType.replace(/_/g, " ")}</span>
          <span>· Joined {employee.dateOfJoining}</span>
          {employee.mobile && <span>· {employee.mobile}</span>}
        </div>
      </div>
    </a>
  );
}

function statusTone(status: EmploymentStatus): "brand" | "neutral" | "warning" | "muted" {
  switch (status) {
    case "ACTIVE":
      return "brand";
    case "ON_LEAVE":
      return "warning";
    case "SUSPENDED":
    case "TERMINATED":
    case "RESIGNED":
    case "RETIRED":
      return "muted";
    default:
      return "neutral";
  }
}

function CreateEmployeeDialog({
  scope,
  onClose,
  onCreated,
}: {
  scope: HRScope;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [employmentType, setEmploymentType] = useState<EmploymentType>("FULL_TIME");
  const [dateOfJoining, setDateOfJoining] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim()) {
      setError("First name is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createEmployee(scope, {
        firstName: firstName.trim(),
        lastName: lastName.trim() || null,
        email: email.trim() || null,
        mobile: mobile.trim() || null,
        employmentType,
        dateOfJoining: dateOfJoining || null,
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
    <Dialog open onClose={onClose} title="New employee">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="First name" required>
            <TextInput
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
          </Field>
          <Field label="Last name">
            <TextInput
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Email">
            <TextInput
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Mobile">
            <TextInput
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Employment type">
            <SelectInput
              options={EMPLOYMENT_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, " ") }))}
              value={employmentType}
              onChange={(v) => setEmploymentType(v as EmploymentType)}
            />
          </Field>
          <Field label="Date of joining">
            <TextInput
              type="date"
              value={dateOfJoining}
              onChange={(e) => setDateOfJoining(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
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
            {submitting ? "Creating…" : "Create employee"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
