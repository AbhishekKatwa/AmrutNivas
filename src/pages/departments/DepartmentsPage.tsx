/**
 * Departments — the cost/ownership centres inside the ACTIVE PROPERTY.
 *
 * A department hangs off the property and, optionally, off one outlet inside it:
 * `outletId === null` is a real, first-class state (a property-wide Front Office,
 * an Estate Maintenance team — §14), and the screen says so literally with the
 * words "Property-wide". Rendering that null as a blank cell is how a cost centre
 * starts looking like broken data.
 *
 * Two door facts shape this screen:
 *   - `set_department_status` requires the `department.archive` capability on
 *     EVERY transition, so RESTORE is gated by `department.archive`, not by
 *     `department.edit` — retiring is its own permission, never a side effect of
 *     renaming;
 *   - `update_department` takes the name only. `code`/`slug` are immutable once
 *     issued and the outlet parent is NOT movable from here, because moving a cost
 *     centre would restate which outlet's reports its people appear in.
 *
 * Like the outlets screen, every rule worth asserting is an exported pure
 * function: this suite renders to a static string and nothing can be clicked.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  CircleSlash,
  Landmark,
  LogIn,
  Plus,
} from "lucide-react";
import { ArchiveDialog, archiveActionState } from "@/components/ui/ArchiveDialog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { LoadingBlock } from "@/components/ui/Spinner";
import { SelectInput, type SelectOption } from "@/components/ui/SelectInput";
import { StatusPill } from "@/components/ui/StatusPill";
import { Switch } from "@/components/ui/Switch";
import { TextInput } from "@/components/ui/TextInput";
import { Textarea } from "@/components/ui/Textarea";
import {
  can,
  type ActiveContext,
  type Department,
  type Outlet,
} from "@/domain/identity/types";
import {
  createDepartment,
  listDepartments,
  setDepartmentStatus,
  updateDepartment,
  type ArchivedRead,
  type DepartmentScope,
  type DepartmentUpdate,
  type NewDepartment,
} from "@/domain/hierarchy/department-service";
import { listOutlets } from "@/domain/hierarchy/outlet-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";
import { OUTLET_SLUG_PATTERN } from "@/pages/outlets/OutletsPage";

/* ------------------------------------------------------------------ pure rules */

export type DepartmentsPageView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_property"
  | "scoped";

/** Same honest surfaces as the outlets screen: a missing scope is shown, not spun on. */
export function pageStatusFor(
  status: ContextStatus,
  context: ActiveContext,
): DepartmentsPageView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null && context.propertyId !== null
      ? "scoped"
      : "no_property";
  }
  return "bootstrapping";
}

/** The property is the boundary; the outlet is only ever a client-side narrowing. */
export function departmentScopeFor(context: ActiveContext): DepartmentScope | null {
  if (context.organizationId === null || context.propertyId === null) return null;
  return { organizationId: context.organizationId, propertyId: context.propertyId };
}

export function departmentReadOptions(showArchived: boolean): ArchivedRead {
  return showArchived ? { includeArchived: true } : {};
}

/** The sentinel for "belongs to the property, not to any outlet" (§14). */
export const PROPERTY_WIDE = "PROPERTY_WIDE";

export type DepartmentDraft = {
  name: string;
  code: string;
  slug: string;
  /** An outlet id, or PROPERTY_WIDE for a property-level cost centre. */
  outletChoice: string;
};

export function newDepartmentDraft(): DepartmentDraft {
  return { name: "", code: "", slug: "", outletChoice: PROPERTY_WIDE };
}

export function departmentDraftFrom(department: Department): DepartmentDraft {
  return {
    name: department.name,
    code: department.code,
    slug: department.slug,
    outletChoice: department.outletId ?? PROPERTY_WIDE,
  };
}

/** Filter picker: every outlet plus the two whole-list views. */
export function departmentFilterOptions(outlets: readonly Outlet[]): SelectOption<string>[] {
  return [
    { value: "ALL", label: "All departments" },
    { value: PROPERTY_WIDE, label: "Property-wide only" },
    ...outlets.map((outlet) => ({ value: outlet.id, label: outlet.name })),
  ];
}

/** The create-form outlet choice: an archived outlet is not a valid new parent. */
export function outletChoiceOptions(outlets: readonly Outlet[]): SelectOption<string>[] {
  return [
    { value: PROPERTY_WIDE, label: "Property-wide (no outlet)" },
    ...outlets
      .filter((outlet) => outlet.status !== "ARCHIVED")
      .map((outlet) => ({ value: outlet.id, label: outlet.name })),
  ];
}

export function filterDepartments(
  departments: readonly Department[],
  filterValue: string,
): Department[] {
  if (filterValue === "ALL") return [...departments];
  if (filterValue === PROPERTY_WIDE) return departments.filter((d) => d.outletId === null);
  return departments.filter((d) => d.outletId === filterValue);
}

/**
 * The outlet cell, in words. `null` is explicitly "Property-wide"; a link whose
 * outlet is not in the loaded list (e.g. a retired one) says so instead of
 * guessing a name.
 */
export function departmentOutletLabel(
  department: Department,
  outlets: readonly Outlet[],
): string {
  if (department.outletId === null) return "Property-wide";
  const outlet = outlets.find((candidate) => candidate.id === department.outletId);
  return outlet !== undefined ? outlet.name : "Outlet outside this list";
}

export function validateDepartmentForm(
  draft: DepartmentDraft,
  editing: boolean,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (draft.name.trim() === "") errors.name = "A name is required.";
  if (!editing) {
    if (draft.code.trim() === "") errors.code = "A code is required.";
    if (draft.slug.trim() === "") errors.slug = "A slug is required.";
    else if (!OUTLET_SLUG_PATTERN.test(draft.slug.trim())) {
      errors.slug = "Use lowercase letters, numbers and single hyphens.";
    }
  }
  return errors;
}

/** The create door takes the property; `outlet` null (or omitted) means property-wide. */
export function departmentCreateInput(
  draft: DepartmentDraft,
  propertyId: string,
): NewDepartment {
  const input: NewDepartment = {
    propertyId,
    name: draft.name.trim(),
    code: draft.code.trim(),
    slug: draft.slug.trim(),
    outletId: draft.outletChoice === PROPERTY_WIDE ? null : draft.outletChoice,
  };
  return input;
}

/**
 * Rename-only (§ the service header): an unchanged name OMITS the key entirely,
 * and the loaded row's `version` rides along as `expectedVersion` (§82) so a
 * concurrent change is refused instead of overwritten.
 */
export function departmentUpdateInput(
  department: Department,
  draft: DepartmentDraft,
): DepartmentUpdate {
  const input: DepartmentUpdate = {
    departmentId: department.id,
    expectedVersion: department.version,
  };
  const name = draft.name.trim();
  if (name !== "" && name !== department.name) input.name = name;
  return input;
}

export type DepartmentCapabilities = { canEdit: boolean; canArchive: boolean };
export type DepartmentRowAction = "edit" | "archive" | "restore";

/**
 * GATE TO ASSERT: both status transitions hide behind `department.archive` —
 * including restore — because the door demands that capability on every
 * transition. `department.edit` buys a rename, never a disappearance.
 */
export function departmentRowActions(
  department: Department,
  caps: DepartmentCapabilities,
): DepartmentRowAction[] {
  const actions: DepartmentRowAction[] = [];
  if (caps.canEdit) actions.push("edit");
  if (caps.canArchive) {
    actions.push(department.status === "ARCHIVED" ? "restore" : "archive");
  }
  return actions;
}

/** CONFLICT says the row moved; anything else says what the door said. Input is kept. */
export function submitFailureMessage(error: unknown): string {
  const publicError = toPublicError(error);
  if (publicError.code === "CONFLICT") {
    return "This cost centre was changed by someone else since it was loaded, so nothing was overwritten. Your input is kept — reload the list and try again.";
  }
  return publicError.message;
}

/* --------------------------------------------------------------------- screen */

const NO_BACKEND_COPY =
  "This build has no backend configured, so it cannot read or save data.";

type SheetMode = { kind: "new" } | { kind: "edit"; department: Department };

export default function DepartmentsPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const storeError = useContextStore((s) => s.error);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const scope = useMemo(
    () => departmentScopeFor(context),
    [context.organizationId, context.propertyId],
  );

  const [showArchived, setShowArchived] = useState(false);
  const [filter, setFilter] = useState("ALL");
  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [sheetMode, setSheetMode] = useState<SheetMode | null>(null);
  const [archiving, setArchiving] = useState<Department | null>(null);
  const [archivingBusy, setArchivingBusy] = useState(false);
  const [restoring, setRestoring] = useState<Department | null>(null);

  const canCreate = can("department.create", permissions);
  const canEdit = can("department.edit", permissions);
  const canArchive = can("department.archive", permissions);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || scope === null) return;
    let ignore = false;
    setDepartments(null);
    setListError(null);
    // Outlets are loaded WITH archived rows so every department's outlet link can be
    // named even when the outlet itself is retired; departments honour the toggle.
    Promise.all([
      listDepartments(scope, departmentReadOptions(showArchived)),
      listOutlets(
        { organizationId: scope.organizationId, propertyId: scope.propertyId },
        { includeArchived: true },
      ),
    ])
      .then(([rows, outletRows]) => {
        if (ignore) return;
        setDepartments(rows);
        setOutlets(outletRows);
      })
      .catch((error) => {
        if (!ignore) setListError(submitFailureMessage(error));
      });
    return () => {
      ignore = true;
    };
  }, [view, scope, showArchived, reloadTick]);

  const reload = () => setReloadTick((tick) => tick + 1);

  const confirmArchive = async (reason: string) => {
    if (archiving === null) return;
    setArchivingBusy(true);
    try {
      await setDepartmentStatus({ departmentId: archiving.id, status: "ARCHIVED", reason });
      setArchiving(null);
      setActionError(null);
      reload();
    } catch (error) {
      setArchiving(null);
      setActionError(submitFailureMessage(error));
    } finally {
      setArchivingBusy(false);
    }
  };

  const confirmRestore = async (reason: string): Promise<void> => {
    if (restoring === null) return;
    await setDepartmentStatus({ departmentId: restoring.id, status: "ACTIVE", reason });
    setRestoring(null);
    setActionError(null);
    reload();
  };

  const visibleDepartments =
    departments === null ? [] : filterDepartments(departments, filter);

  const columns: DataColumn<Department>[] = [
    {
      key: "department",
      header: "Department",
      render: (department) => (
        <p className="min-w-0 truncate font-medium text-ink">{department.name}</p>
      ),
    },
    {
      key: "identity",
      header: "Code / Slug",
      render: (department) => (
        <div className="min-w-0 text-xs">
          <p className="money-figure truncate font-medium text-ink">{department.code}</p>
          <p className="truncate text-muted">{department.slug}</p>
        </div>
      ),
    },
    {
      key: "outlet",
      header: "Outlet",
      render: (department) =>
        department.outletId === null ? (
          <Badge tone="brand">Property-wide</Badge>
        ) : (
          <span className="text-sm text-ink">{departmentOutletLabel(department, outlets)}</span>
        ),
    },
    { key: "status", header: "Status", render: (department) => <StatusPill status={department.status} /> },
    {
      key: "actions",
      header: "Actions",
      width: "10rem",
      render: (department) => (
        <div className="flex flex-wrap items-center gap-1.5">
          {departmentRowActions(department, { canEdit, canArchive }).map((action) => {
            if (action === "edit") {
              return (
                <Button
                  key={action}
                  size="sm"
                  variant="secondary"
                  onClick={() => setSheetMode({ kind: "edit", department })}
                >
                  Edit
                </Button>
              );
            }
            if (action === "archive") {
              return (
                <Button
                  key={action}
                  size="sm"
                  variant="secondary"
                  icon={<Archive className="size-4" aria-hidden />}
                  onClick={() => setArchiving(department)}
                >
                  Retire
                </Button>
              );
            }
            return (
              <Button
                key={action}
                size="sm"
                variant="secondary"
                icon={<ArchiveRestore className="size-4" aria-hidden />}
                onClick={() => setRestoring(department)}
              >
                Restore
              </Button>
            );
          })}
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          <Landmark className="size-5 shrink-0 text-brand-600" aria-hidden />
          Departments
        </h2>
        <p className="mt-1 text-sm text-muted">
          Cost and ownership centres inside the active property. A department may belong to one
          outlet or to the property itself — a property-wide centre carries no outlet link.
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
          title="Sign in to manage departments"
          description="There is no active session for this build to read a tenant from. Sign in again to see the cost centres of your property."
        />
      )}

      {view === "no_property" && (
        <EmptyState
          icon={<Landmark aria-hidden />}
          title="Choose a property first"
          description="Departments are listed inside one property, and no property is selected in your
            active context yet. This is nothing being wrong — pick a property and this screen will
            show the cost centres under it."
        />
      )}

      {view === "scoped" && scope !== null && (
        <Card
          padded={false}
          actions={
            canCreate ? (
              <Button
                size="sm"
                variant="primary"
                icon={<Plus className="size-4" aria-hidden />}
                onClick={() => setSheetMode({ kind: "new" })}
              >
                Add department
              </Button>
            ) : undefined
          }
        >
          <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-end sm:justify-between sm:px-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Field label="Filter by outlet" className="sm:w-64">
                <SelectInput
                  options={departmentFilterOptions(outlets)}
                  value={filter}
                  onChange={setFilter}
                />
              </Field>
              <Switch
                checked={showArchived}
                onChange={setShowArchived}
                label="Show retired"
                description="Retired cost centres are excluded from the read by default; switching this on re-reads with the archived opt-in."
                className="sm:pb-1.5"
              />
            </div>
            {(listError !== null || actionError !== null) && (
              <p role="status" className="text-xs leading-relaxed text-danger">
                {listError ?? actionError}
              </p>
            )}
          </div>

          <div className="px-0 sm:px-1">
            <DataTable
              columns={columns}
              rows={visibleDepartments}
              rowKey={(department) => department.id}
              loading={departments === null && listError === null}
              caption={`Departments of the active property${showArchived ? ", including retired" : ""}`}
              empty={
                <EmptyState
                  title={
                    filter === "ALL"
                      ? showArchived
                        ? "No departments in this property yet"
                        : "No active departments"
                      : "No departments in this view"
                  }
                  description={
                    filter === "ALL"
                      ? "This property has no cost centres behind it yet. Create one, or switch on “Show retired” if you are looking for a retired centre."
                      : "Departments exist in this property, but none match the selected outlet view. Switch the filter back to “All departments”."
                  }
                  action={
                    canCreate && filter === "ALL" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Plus className="size-4" aria-hidden />}
                        onClick={() => setSheetMode({ kind: "new" })}
                      >
                        Add department
                      </Button>
                    ) : undefined
                  }
                />
              }
            />
          </div>
        </Card>
      )}

      {sheetMode !== null && scope !== null && (
        <DepartmentSheet
          mode={sheetMode}
          propertyId={scope.propertyId}
          outlets={outlets}
          canSubmit={sheetMode.kind === "new" ? canCreate : canEdit}
          onClose={() => setSheetMode(null)}
          onSaved={() => {
            setSheetMode(null);
            reload();
          }}
        />
      )}

      {archiving !== null && (
        <ArchiveDialog
          open
          onClose={() => setArchiving(null)}
          onConfirm={(reason) => void confirmArchive(reason)}
          entityName={archiving.name}
          entityLabel="department"
          loading={archivingBusy}
          consequences={[
            "It will no longer appear in active lists, selectors or reporting pickers.",
            "Its staff links and history are preserved and remain auditable.",
            "It can be restored later from the retired view — this is not a delete.",
          ]}
        />
      )}

      {restoring !== null && (
        <RestoreDialog
          entityName={restoring.name}
          entityLabel="department"
          onCancel={() => setRestoring(null)}
          onConfirm={confirmRestore}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- sub-pieces */

/**
 * The create/edit sheet, opened in place. Create takes name, code, slug and the
 * optional outlet parent; EDIT takes the name alone — code/slug are immutable and
 * the outlet link is deliberately not editable from this screen.
 */
function DepartmentSheet({
  mode,
  propertyId,
  outlets,
  canSubmit,
  onClose,
  onSaved,
}: {
  mode: SheetMode;
  propertyId: string;
  outlets: readonly Outlet[];
  canSubmit: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = mode.kind === "edit";
  const department = mode.kind === "edit" ? mode.department : null;
  const [draft, setDraft] = useState<DepartmentDraft>(
    department !== null ? departmentDraftFrom(department) : newDepartmentDraft(),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (patch: Partial<DepartmentDraft>) => setDraft((prev) => ({ ...prev, ...patch }));

  const submit = async () => {
    const found = validateDepartmentForm(draft, editing);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      if (department === null) {
        await createDepartment(departmentCreateInput(draft, propertyId));
      } else {
        await updateDepartment(departmentUpdateInput(department, draft));
      }
      onSaved();
    } catch (error) {
      // Keep every typed value; show the door's own message inline.
      setFailure(submitFailureMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      side="right"
      title={editing ? `Edit ${department?.name ?? "department"}` : "Add department"}
      description={
        editing
          ? "Only the name is editable. Code and slug are fixed once issued, and the outlet link cannot be moved from this screen."
          : "The cost centre is created inside the active property, optionally under one of its outlets."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={saving || !canSubmit}>
            {saving ? "Saving…" : editing ? "Save changes" : "Create department"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {failure !== null && (
          <p role="status" className="rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-xs leading-relaxed text-danger">
            {failure}
          </p>
        )}

        <Field label="Name" id="department-name" required error={errors.name}>
          <TextInput
            value={draft.name}
            onChange={(event) => set({ name: event.target.value })}
            placeholder="e.g. Front Office"
            disabled={saving}
          />
        </Field>

        {editing ? (
          <Field
            label="Code / Slug"
            id="department-code"
            hint="Issued identifiers are immutable — reports and imports already refer to them."
          >
            <TextInput value={`${department!.code} · ${department!.slug}`} disabled />
          </Field>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Code" id="department-code" required error={errors.code}>
              <TextInput
                value={draft.code}
                onChange={(event) => set({ code: event.target.value })}
                placeholder="e.g. FO"
                disabled={saving}
              />
            </Field>
            <Field label="Slug" id="department-slug" required error={errors.slug}>
              <TextInput
                value={draft.slug}
                onChange={(event) => set({ slug: event.target.value })}
                placeholder="e.g. front-office"
                disabled={saving}
              />
            </Field>
          </div>
        )}

        {editing ? (
          <Field
            label="Outlet"
            id="department-outlet"
            hint="Moving a cost centre to another outlet would restate which outlet’s reports its people appear in; it is deliberately not editable here."
          >
            <TextInput
              value={
                department !== null ? departmentOutletLabel(department, outlets) : ""
              }
              disabled
            />
          </Field>
        ) : (
          <Field
            label="Outlet"
            id="department-outlet"
            hint="Choose “Property-wide” for a centre that belongs to the property itself — a Front Office or Estate Maintenance team — rather than to one outlet."
          >
            <SelectInput
              options={outletChoiceOptions(outlets)}
              value={draft.outletChoice}
              onChange={(outletChoice) => set({ outletChoice })}
            />
          </Field>
        )}
      </div>
    </Dialog>
  );
}

/**
 * The restore path — same mandatory-reason audit as archiving (the shared
 * `archiveActionState` rule), without the archive wording. On a refusal it stays
 * open with the typed reason; the row did not move and neither does the form.
 */
function RestoreDialog({
  entityName,
  entityLabel,
  onCancel,
  onConfirm,
}: {
  entityName: string;
  entityLabel: string;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { canConfirm, normalizedReason } = archiveActionState(reason, entityName);

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm(normalizedReason);
    } catch (error) {
      setFailure(submitFailureMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onCancel}
      title={`Restore ${entityName || `this ${entityLabel}`}?`}
      description="This brings the cost centre back into active lists via the status door; the reason is audited."
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={<ArchiveRestore className="size-4" aria-hidden />}
            disabled={!canConfirm || busy}
            onClick={() => void confirm()}
          >
            {busy ? "Restoring…" : `Restore ${entityLabel}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {failure !== null && (
          <p role="status" className="text-xs leading-relaxed text-danger">
            {failure}
          </p>
        )}
        <Field
          label="Reason for restoring"
          required
          hint="Recorded in the audit trail and required before you can continue."
        >
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Housekeeping rejoined as its own cost centre."
            disabled={busy}
          />
        </Field>
      </div>
    </Dialog>
  );
}
