/**
 * Outlets — the revenue points inside the ACTIVE PROPERTY.
 *
 * The screen never chooses its own scope: it reads `organizationId` + `propertyId`
 * from the context store and lists the outlets under exactly that pair. With no
 * property selected it renders the deliberate "choose a property first" state —
 * an empty scope is a routing fact about the session, not a claim that the tenant
 * has no outlets, and showing an empty table would read as lost data.
 *
 * Everything worth asserting (scope derivation, form validation, the door-input
 * mapping, row-action gating, the archived opt-in, the failure copy) is an
 * exported pure function beside the component: this suite renders to a static
 * string with no click, so the rules must be testable without one.
 *
 * Two door facts the form respects:
 *   - `code`/`slug` are immutable once issued, so the editor shows them read-only
 *     when editing, WITH the reason;
 *   - omitted keys leave a column alone and `""` clears a blankable one, so
 *     `outletUpdateInput` only sends fields that actually changed — and the hours
 *     editor can never silently send `{}` over published hours.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Briefcase,
  CircleSlash,
  LogIn,
  Plus,
  Store,
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
  OUTLET_TYPES,
  can,
  type ActiveContext,
  type Outlet,
  type OutletType,
} from "@/domain/identity/types";
import type { ContextSelection } from "@/domain/access/session-service";
import {
  createOutlet,
  listOutlets,
  setOutletStatus,
  updateOutlet,
  type ArchivedRead,
  type NewOutlet,
  type OutletScope,
  type OutletUpdate,
} from "@/domain/hierarchy/outlet-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

/* ------------------------------------------------------------------ pure rules */

/**
 * Which surface the screen shows for the session state. `unconfigured` and
 * `unauthenticated` must read honestly — never a spinner that waits forever,
 * never an empty table that looks like lost data.
 */
export type OutletsPageView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_property"
  | "scoped";

export function pageStatusFor(
  status: ContextStatus,
  context: ActiveContext,
): OutletsPageView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null && context.propertyId !== null
      ? "scoped"
      : "no_property";
  }
  return "bootstrapping";
}

/** Both ancestors the read scopes on; null until the session actually has them. */
export function outletScopeFor(context: ActiveContext): OutletScope | null {
  if (context.organizationId === null || context.propertyId === null) return null;
  return { organizationId: context.organizationId, propertyId: context.propertyId };
}

/** Archived rows are excluded by the door's default read; the toggle opts in. */
export function outletReadOptions(showArchived: boolean): ArchivedRead {
  return showArchived ? { includeArchived: true } : {};
}

export const OUTLET_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type OutletDraft = {
  name: string;
  type: OutletType | "";
  code: string;
  slug: string;
  phone: string;
  email: string;
  /** The raw JSON text of the hours editor; blank means "leave untouched". */
  hoursText: string;
};

export function newOutletDraft(): OutletDraft {
  return { name: "", type: "", code: "", slug: "", phone: "", email: "", hoursText: "" };
}

/** The form is seeded from the loaded row, so what the operator sees is what the row holds. */
export function outletDraftFrom(outlet: Outlet): OutletDraft {
  const keys = Object.keys(outlet.businessHours ?? {});
  return {
    name: outlet.name,
    type: outlet.type,
    code: outlet.code,
    slug: outlet.slug,
    phone: outlet.phone ?? "",
    email: outlet.email ?? "",
    hoursText: keys.length === 0 ? "" : JSON.stringify(outlet.businessHours, null, 2),
  };
}

export type BusinessHoursParse =
  | { ok: true; value: Record<string, unknown> | undefined }
  | { ok: false; error: string };

/**
 * The hours editor is an explicit JSON field, validated here:
 *   - blank -> `value: undefined`, so the update OMITS the key and the door keeps
 *     what it holds — a blank field can never send `{}` over published hours;
 *   - explicit `{}` against existing hours -> refused (erasing hours is not a
 *     side effect of clearing a text box);
 *   - non-object JSON (array/number/string/null) -> refused.
 */
export function parseBusinessHours(
  text: string,
  existing: Record<string, unknown> | null | undefined,
): BusinessHoursParse {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: true, value: undefined };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      ok: false,
      error:
        "Business hours must be valid JSON — for example {\"breakfast\": \"07:00-11:00\"}.",
    };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      error: "Business hours must be a JSON object of day parts, not a list or a single value.",
    };
  }
  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).length === 0) {
    if (existing && Object.keys(existing).length > 0) {
      return {
        ok: false,
        error:
          "Leave the field empty to keep the published hours untouched — an empty object would erase them.",
      };
    }
    return { ok: true, value: undefined };
  }
  return { ok: true, value: record };
}

/**
 * Editing relaxes the required set to what the update door actually takes:
 * `code`, `slug` and the type are immutable, so demanding them again would only
 * block a rename.
 */
export function validateOutletForm(
  draft: OutletDraft,
  options: { editing: boolean; existingHours?: Record<string, unknown> | null },
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (draft.name.trim() === "") errors.name = "A name is required.";
  if (!options.editing) {
    if (draft.code.trim() === "") errors.code = "A code is required.";
    if (draft.slug.trim() === "") errors.slug = "A slug is required.";
    else if (!OUTLET_SLUG_PATTERN.test(draft.slug.trim())) {
      errors.slug = "Use lowercase letters, numbers and single hyphens.";
    }
    if (draft.type === "") errors.type = "Choose the outlet type.";
  }
  if (draft.email.trim() !== "" && !EMAIL_PATTERN.test(draft.email.trim())) {
    errors.email = "That does not look like an email address.";
  }
  const hours = parseBusinessHours(draft.hoursText, options.existingHours ?? null);
  if (!hours.ok) errors.hoursText = hours.error;
  return errors;
}

/** The create door takes the property only — `organization_id` is derived there. */
export function outletCreateInput(
  draft: OutletDraft & { type: OutletType },
  propertyId: string,
): NewOutlet {
  const input: NewOutlet = {
    propertyId,
    name: draft.name.trim(),
    code: draft.code.trim(),
    slug: draft.slug.trim(),
    type: draft.type,
  };
  const hours = parseBusinessHours(draft.hoursText, null);
  if (hours.ok && hours.value !== undefined) input.businessHours = hours.value;
  if (draft.phone.trim() !== "") input.phone = draft.phone.trim();
  if (draft.email.trim() !== "") input.email = draft.email.trim();
  return input;
}

/**
 * Update mapping under the blankable-column convention:
 *   - unchanged fields are OMITTED (the door leaves the column alone);
 *   - phone/email cleared by the operator are sent as `""`, which the door stores
 *     as NULL — never `null`, which it reads as "not edited";
 *   - `expectedVersion` carries the loaded row's version (§82).
 */
export function outletUpdateInput(outlet: Outlet, draft: OutletDraft): OutletUpdate {
  const input: OutletUpdate = { outletId: outlet.id, expectedVersion: outlet.version };
  const name = draft.name.trim();
  if (name !== "" && name !== outlet.name) input.name = name;
  const phone = draft.phone.trim();
  if (phone !== (outlet.phone ?? "")) input.phone = phone;
  const email = draft.email.trim();
  if (email !== (outlet.email ?? "")) input.email = email;
  const hours = parseBusinessHours(draft.hoursText, outlet.businessHours);
  if (
    hours.ok &&
    hours.value !== undefined &&
    JSON.stringify(hours.value) !== JSON.stringify(outlet.businessHours ?? {})
  ) {
    input.businessHours = hours.value;
  }
  return input;
}

export type OutletCapabilities = { canEdit: boolean; canArchive: boolean };
export type OutletRowAction = "work" | "edit" | "archive" | "restore";

/**
 * Display-only gating — the door is the real gate. Status changes (both
 * directions) pass through `set_outlet_status`, which asks for `outlet.archive`,
 * so archive AND restore hide without it. A row never offers both.
 */
export function outletRowActions(
  outlet: Outlet,
  caps: OutletCapabilities,
): OutletRowAction[] {
  const actions: OutletRowAction[] = ["work"];
  if (caps.canEdit) actions.push("edit");
  if (caps.canArchive) {
    actions.push(outlet.status === "ARCHIVED" ? "restore" : "archive");
  }
  return actions;
}

/** "Work here": point the session at this outlet; ancestors travel with it. */
export function workHereSelection(outlet: Outlet): ContextSelection {
  return {
    organizationId: outlet.organizationId,
    propertyId: outlet.propertyId,
    outletId: outlet.id,
  };
}

/**
 * A refusal keeps the operator's input and shows this line. CONFLICT gets its own
 * copy because the truth is "the row moved under you", not "you typed it wrong".
 */
export function submitFailureMessage(error: unknown): string {
  const publicError = toPublicError(error);
  if (publicError.code === "CONFLICT") {
    return "This row was changed by someone else since it was loaded, so nothing was overwritten. Your input is kept — reload the list and try again.";
  }
  return publicError.message;
}

/** The picker is fed the domain array itself, never a hand-copied list. */
export function humanizeOutletType(type: OutletType): string {
  return type
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

export function outletTypeOptions(): SelectOption<OutletType>[] {
  return OUTLET_TYPES.map((type) => ({ value: type, label: humanizeOutletType(type) }));
}

/** Display summary of the JSON hours column — published keys, never a fabricated "—". */
export function businessHoursSummary(hours: Record<string, unknown> | null | undefined): string {
  const keys = Object.keys(hours ?? {});
  if (keys.length === 0) return "Not published";
  const shown = keys.slice(0, 3).join(", ");
  return keys.length > 3 ? `${shown} +${keys.length - 3} more` : shown;
}

/* --------------------------------------------------------------------- screen */

const NO_BACKEND_COPY =
  "This build has no backend configured, so it cannot read or save data.";

type SheetMode = { kind: "new" } | { kind: "edit"; outlet: Outlet };

export default function OutletsPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const storeError = useContextStore((s) => s.error);
  const bootstrap = useContextStore((s) => s.bootstrap);
  const switchContext = useContextStore((s) => s.switchContext);

  const view = pageStatusFor(status, context);
  const scope = useMemo(
    () => outletScopeFor(context),
    // The memo keys on the two ids so a context object identity change that does
    // not move the scope cannot re-trigger the read.
    [context.organizationId, context.propertyId],
  );

  const [showArchived, setShowArchived] = useState(false);
  const [outlets, setOutlets] = useState<Outlet[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [sheetMode, setSheetMode] = useState<SheetMode | null>(null);
  const [archiving, setArchiving] = useState<Outlet | null>(null);
  const [archivingBusy, setArchivingBusy] = useState(false);
  const [restoring, setRestoring] = useState<Outlet | null>(null);
  const canCreate = can("outlet.create", permissions);
  const canEdit = can("outlet.edit", permissions);
  const canArchive = can("outlet.archive", permissions);

  // The page is mountable before the shell's bootstrap lands; "idle" must not sit
  // on a permanent spinner waiting for someone else to act.
  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || scope === null) return;
    let ignore = false;
    setOutlets(null);
    setListError(null);
    listOutlets(scope, outletReadOptions(showArchived))
      .then((rows) => {
        if (!ignore) setOutlets(rows);
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
      await setOutletStatus({ outletId: archiving.id, status: "ARCHIVED", reason });
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
    // A refusal RE-throws into the dialog: it stays open with the typed reason,
    // showing the door's own message — the data did not move and neither does the form.
    await setOutletStatus({ outletId: restoring.id, status: "ACTIVE", reason });
    setRestoring(null);
    setActionError(null);
    reload();
  };

  const workHere = (outlet: Outlet) => {
    void switchContext(workHereSelection(outlet)).catch((error) => {
      setActionError(submitFailureMessage(error));
    });
  };

  const columns: DataColumn<Outlet>[] = [
    {
      key: "outlet",
      header: "Outlet",
      render: (outlet) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{outlet.name}</p>
          <Badge tone="neutral">{humanizeOutletType(outlet.type)}</Badge>
        </div>
      ),
    },
    {
      key: "identity",
      header: "Code / Slug",
      render: (outlet) => (
        <div className="min-w-0 text-xs">
          <p className="money-figure truncate font-medium text-ink">{outlet.code}</p>
          <p className="truncate text-muted">{outlet.slug}</p>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (outlet) => <StatusPill status={outlet.status} /> },
    {
      key: "contact",
      header: "Contact",
      render: (outlet) => (
        <div className="min-w-0 text-xs">
          <p className="truncate">{outlet.phone ?? <span className="text-muted">No phone</span>}</p>
          <p className="truncate text-muted">{outlet.email ?? "No email"}</p>
        </div>
      ),
    },
    {
      key: "hours",
      header: "Business hours",
      render: (outlet) => (
        <span className="text-xs text-ink">{businessHoursSummary(outlet.businessHours)}</span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: "13rem",
      render: (outlet) => (
        <div className="flex flex-wrap items-center gap-1.5">
          {outletRowActions(outlet, { canEdit, canArchive }).map((action) => {
            if (action === "work") {
              return (
                <Button
                  key={action}
                  size="sm"
                  variant="ghost"
                  icon={<Briefcase className="size-4" aria-hidden />}
                  onClick={() => workHere(outlet)}
                >
                  Work here
                </Button>
              );
            }
            if (action === "edit") {
              return (
                <Button
                  key={action}
                  size="sm"
                  variant="secondary"
                  onClick={() => setSheetMode({ kind: "edit", outlet })}
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
                  onClick={() => setArchiving(outlet)}
                >
                  Archive
                </Button>
              );
            }
            return (
              <Button
                key={action}
                size="sm"
                variant="secondary"
                icon={<ArchiveRestore className="size-4" aria-hidden />}
                onClick={() => setRestoring(outlet)}
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
          <Store className="size-5 shrink-0 text-brand-600" aria-hidden />
          Outlets
        </h2>
        <p className="mt-1 text-sm text-muted">
          Revenue points inside the active property. An outlet is created under a property and
          inherits its organization, timezone, currency and tax regime.
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
          title="Sign in to manage outlets"
          description="There is no active session for this build to read a tenant from. Sign in again to see the outlets of your property."
        />
      )}

      {view === "no_property" && (
        <EmptyState
          icon={<Store aria-hidden />}
          title="Choose a property first"
          description="Outlets are listed inside one property, and no property is selected in your
            active context yet. This is nothing being wrong — pick a property and this screen will
            show the revenue points under it."
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
                Add outlet
              </Button>
            ) : undefined
          }
        >
          <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <Switch
              checked={showArchived}
              onChange={setShowArchived}
              label="Show archived"
              description="Retired outlets are excluded from the read by default; switching this on re-reads with the archived opt-in."
            />
            {(listError !== null || actionError !== null) && (
              <p role="status" className="text-xs leading-relaxed text-danger">
                {listError ?? actionError}
              </p>
            )}
          </div>

          <div className="px-0 sm:px-1">
            <DataTable
              columns={columns}
              rows={outlets ?? []}
              rowKey={(outlet) => outlet.id}
              loading={outlets === null && listError === null}
              caption={`Outlets of the active property${showArchived ? ", including archived" : ""}`}
              empty={
                <EmptyState
                  title={showArchived ? "No outlets in this property yet" : "No active outlets"}
                  description={
                    showArchived
                      ? "This property has no outlet rows at all, archived ones included. Create the first revenue point to start routing sales, menus and staff to it."
                      : "There are no active outlets under this property. Switch on “Show archived” if you are looking for a retired one."
                  }
                  action={
                    canCreate ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Plus className="size-4" aria-hidden />}
                        onClick={() => setSheetMode({ kind: "new" })}
                      >
                        Add outlet
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
        <OutletSheet
          mode={sheetMode}
          propertyId={scope.propertyId}
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
          entityLabel="outlet"
          loading={archivingBusy}
          consequences={[
            "It will no longer appear in active lists or selectors.",
            "Its orders, staff and history are preserved and remain auditable.",
            "It can be restored later from the archived view — this is not a delete.",
          ]}
        />
      )}

      {restoring !== null && (
        <RestoreDialog
          entityName={restoring.name}
          entityLabel="outlet"
          onCancel={() => setRestoring(null)}
          onConfirm={confirmRestore}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- sub-pieces */

/**
 * The create/edit sheet, opened in place — no route navigation. On a refusal the
 * dialog stays open and the draft is untouched: the operator sees the door's own
 * message, not a wiped form.
 */
function OutletSheet({
  mode,
  propertyId,
  canSubmit,
  onClose,
  onSaved,
}: {
  mode: SheetMode;
  propertyId: string;
  canSubmit: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = mode.kind === "edit";
  const outlet = mode.kind === "edit" ? mode.outlet : null;
  const [draft, setDraft] = useState<OutletDraft>(
    outlet !== null ? outletDraftFrom(outlet) : newOutletDraft(),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (patch: Partial<OutletDraft>) => setDraft((prev) => ({ ...prev, ...patch }));

  const submit = async () => {
    const found = validateOutletForm(draft, { editing, existingHours: outlet?.businessHours });
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      if (outlet === null) {
        await createOutlet(
          outletCreateInput({ ...draft, type: draft.type } as OutletDraft & { type: OutletType }, propertyId),
        );
      } else {
        await updateOutlet(outletUpdateInput(outlet, draft));
      }
      onSaved();
    } catch (error) {
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
      title={editing ? `Edit ${outlet?.name ?? "outlet"}` : "Add outlet"}
      description={
        editing
          ? "Code, slug and type are fixed once issued; the hours and contact details are editable."
          : "The outlet is created inside the active property and inherits its organization."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={saving || !canSubmit}
          >
            {saving ? "Saving…" : editing ? "Save changes" : "Create outlet"}
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

        <Field label="Name" id="outlet-name" required error={errors.name}>
          <TextInput
            value={draft.name}
            onChange={(event) => set({ name: event.target.value })}
            placeholder="e.g. Lakeside All-Day Café"
            disabled={saving}
          />
        </Field>

        {editing ? (
          <Field
            label="Type"
            id="outlet-type"
            hint="An outlet’s type is fixed once issued — it decides which workflows the row takes part in."
          >
            <TextInput value={humanizeOutletType(outlet!.type)} disabled />
          </Field>
        ) : (
          <Field label="Type" id="outlet-type" required error={errors.type}>
            <SelectInput
              options={outletTypeOptions()}
              value={draft.type}
              onChange={(type) => set({ type })}
              placeholder="Choose the outlet type…"
            />
          </Field>
        )}

        {editing ? (
          <Field
            label="Code / Slug"
            id="outlet-code"
            hint="Issued identifiers are immutable: documents, imports and other tenants’ links already refer to them."
          >
            <TextInput value={`${outlet!.code} · ${outlet!.slug}`} disabled />
          </Field>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Code" id="outlet-code" required error={errors.code}>
              <TextInput
                value={draft.code}
                onChange={(event) => set({ code: event.target.value })}
                placeholder="e.g. LAC"
                disabled={saving}
              />
            </Field>
            <Field label="Slug" id="outlet-slug" required error={errors.slug}>
              <TextInput
                value={draft.slug}
                onChange={(event) => set({ slug: event.target.value })}
                placeholder="e.g. lakeside-cafe"
                disabled={saving}
              />
            </Field>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone" id="outlet-phone" hint="Clear the field to remove the stored number.">
            <TextInput
              value={draft.phone}
              onChange={(event) => set({ phone: event.target.value })}
              placeholder="+91…"
              disabled={saving}
            />
          </Field>
          <Field label="Email" id="outlet-email" error={errors.email} hint="Clear the field to remove the stored address.">
            <TextInput
              type="email"
              value={draft.email}
              onChange={(event) => set({ email: event.target.value })}
              placeholder="cafe@example.com"
              disabled={saving}
            />
          </Field>
        </div>

        <Field
          label="Business hours (JSON)"
          id="outlet-hours"
          error={errors.hoursText}
          hint={
            editing
              ? "Day parts and meal windows as a JSON object. Leave the field empty to keep the published hours untouched — an empty value never overwrites them."
              : "Day parts and meal windows as a JSON object, e.g. {\"breakfast\": \"07:00-11:00\"}. Leave empty to publish no hours yet."
          }
        >
          <Textarea
            value={draft.hoursText}
            onChange={(event) => set({ hoursText: event.target.value })}
            rows={6}
            disabled={saving}
            className="font-mono text-xs"
          />
        </Field>
      </div>
    </Dialog>
  );
}

/**
 * The restore path through the status door. It mirrors `ArchiveDialog`'s rules —
 * a mandatory, audited reason — without the archive wording, and stays open with
 * the typed reason if the door refuses.
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
      description="This brings the record back into active lists via the status door; the reason is audited."
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
            placeholder="e.g. Renovation complete; reopening for the season."
            disabled={busy}
          />
        </Field>
      </div>
    </Dialog>
  );
}
