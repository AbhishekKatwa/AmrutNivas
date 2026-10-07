/**
 * The tenant's own record — `/organization`.
 *
 * Two rules shape this file more than its layout does:
 *
 *   1. `code` and `slug` are shown but never editable. They are quoted in document
 *      numbers and URLs (§11/§44), so the doors refuse them and the UI must not even
 *      offer a field the server will reject.
 *   2. Permission is a display concern only. The actions are hidden when the session
 *      lacks the capability, and a refusal is still handled inline — the operator's
 *      typed values survive every failure, and a `CONFLICT` is reported as "reload
 *      this record", never as a save that worked.
 *
 * Archive is a status transition with a mandatory reason, never a delete; the same is
 * true of suspend and restore, so all three go through a door that takes `p_reason`.
 */

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArchiveRestore,
  Ban,
  Building2,
  Database,
  Info,
  Lock,
  Pencil,
  RefreshCw,
  Save,
  ShieldAlert,
} from "lucide-react";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { ArchiveDialog, archiveActionState } from "@/components/ui/ArchiveDialog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { LoadingBlock, Spinner } from "@/components/ui/Spinner";
import { StatusPill } from "@/components/ui/StatusPill";
import { TextInput } from "@/components/ui/TextInput";
import { Textarea } from "@/components/ui/Textarea";
import {
  getOrganization,
  setOrganizationStatus,
  updateOrganization,
  type OrganizationUpdate,
} from "@/domain/hierarchy/organization-service";
import {
  BUSINESS_TYPES,
  can as holdsPermission,
  type BusinessType,
  type Organization,
  type OrganizationStatus,
} from "@/domain/identity/types";
import { ERROR_CODES, toPublicError } from "@/lib/errors";
import { useContextStore } from "@/state/context-store";

/* ------------------------------------------------------------------ pure rules */

/** The door's own `^.{2,120}$` / `^[A-Z]{2}$` / `^[A-Z]{3}$` / locale patterns. */
const NAME_PATTERN = /^.{2,120}$/;
const COUNTRY_PATTERN = /^[A-Z]{2}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const LOCALE_PATTERN = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
/** `is_valid_timezone` asks `pg_timezone_names`, which the client cannot enumerate;
 *  the shape is all this side can honestly insist on, and the door still decides. */
const TIMEZONE_PATTERN = /^(?:UTC|Etc\/[A-Za-z0-9_+-]+|[A-Za-z]+\/[A-Za-z0-9_+/-]+)$/;
const EMAIL_PATTERN = /^[^@\s]+@[^\s@]+\.[A-Za-z]{2,}$/;
const URL_PATTERN = /^https?:\/\/\S{3,}$/i;

/** Every optional text column the update door can blank (`app.blankable`). */
const BLANKABLE_FIELDS = [
  "legalName",
  "displayName",
  "taxRegion",
  "phone",
  "email",
  "website",
  "logoUrl",
] as const;

type BlankableField = (typeof BLANKABLE_FIELDS)[number];

/** A form row of strings: an empty string is "the operator cleared this". */
export type OrganizationFormValues = {
  name: string;
  legalName: string;
  displayName: string;
  country: string;
  currency: string;
  timezone: string;
  locale: string;
  taxRegion: string;
  phone: string;
  email: string;
  website: string;
  logoUrl: string;
  businessTypes: BusinessType[];
};

export type OrganizationField = keyof OrganizationFormValues;
export type OrganizationFieldErrors = Partial<Record<OrganizationField, string>>;

/** Row -> form. A NULL column becomes the empty string, never a placeholder value. */
export function organizationFormValues(organization: Organization): OrganizationFormValues {
  const text = (value: string | null): string => value ?? "";
  return {
    name: organization.name,
    legalName: text(organization.legalName),
    displayName: text(organization.displayName),
    country: organization.country,
    currency: organization.currency,
    timezone: organization.timezone,
    locale: organization.locale,
    taxRegion: text(organization.taxRegion),
    phone: text(organization.phone),
    email: text(organization.email),
    website: text(organization.website),
    logoUrl: text(organization.logoUrl),
    businessTypes: [...organization.businessTypes],
  };
}

/**
 * Per-field validation, mirroring the checks in 005 so an obvious mistake is caught
 * before a round trip — and nothing here invents a rule the database does not have.
 * An empty optional field is valid: it is the operator choosing to clear it.
 */
export function validateOrganizationForm(
  values: OrganizationFormValues,
): OrganizationFieldErrors {
  const errors: OrganizationFieldErrors = {};
  const name = values.name.trim();

  if (!NAME_PATTERN.test(name)) {
    errors.name = "Enter a name between 2 and 120 characters.";
  }
  if (!COUNTRY_PATTERN.test(values.country.trim())) {
    errors.country = "Use the two-letter ISO code, e.g. IN.";
  }
  if (!CURRENCY_PATTERN.test(values.currency.trim())) {
    errors.currency = "Use the three-letter currency code, e.g. INR.";
  }
  if (!TIMEZONE_PATTERN.test(values.timezone.trim())) {
    errors.timezone = "Use a zone name such as Asia/Kolkata.";
  }
  if (!LOCALE_PATTERN.test(values.locale.trim())) {
    errors.locale = "Use a locale such as en-IN.";
  }
  if (values.taxRegion.trim().length > 120) {
    errors.taxRegion = "Keep the tax region under 120 characters.";
  }
  if (values.phone.trim().length > 32) {
    errors.phone = "Keep the phone number under 32 characters.";
  }
  if (values.email.trim() !== "" && !EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = "Enter a valid email address.";
  }
  if (values.website.trim() !== "" && !URL_PATTERN.test(values.website.trim())) {
    errors.website = "Enter the full address, starting with https://.";
  }
  if (values.logoUrl.trim() !== "" && !URL_PATTERN.test(values.logoUrl.trim())) {
    errors.logoUrl = "Enter the full image address, starting with https://.";
  }
  // The column is a CHECK over the taxonomy array: an off-list value would be refused
  // at the door, so it is refused here first.
  if (values.businessTypes.some((type) => !BUSINESS_TYPES.includes(type))) {
    errors.businessTypes = "Choose only the formats this product offers.";
  }

  return errors;
}

export function formHasErrors(errors: OrganizationFieldErrors): boolean {
  return Object.values(errors).some((message) => message !== undefined);
}

/**
 * Form -> door input, honouring the update convention:
 *   - a blankable field the operator did not touch is ABSENT, so the door leaves it;
 *   - one they emptied is sent as `""`, which the door stores as NULL;
 *   - the NOT NULL columns are always sent;
 *   - `code` and `slug` are never sent — the door has no parameter for them.
 */
export function buildOrganizationUpdate(
  values: OrganizationFormValues,
  current: Organization,
  expectedVersion: number,
): OrganizationUpdate {
  const patch: OrganizationUpdate = {
    organizationId: current.id,
    expectedVersion,
    name: values.name.trim(),
    country: values.country.trim().toUpperCase(),
    currency: values.currency.trim().toUpperCase(),
    timezone: values.timezone.trim(),
    locale: values.locale.trim(),
    // An empty list is a legitimate answer here, so it is always sent.
    businessTypes: [...values.businessTypes],
  };

  const blankable = patch as Record<BlankableField, string | undefined>;
  for (const field of BLANKABLE_FIELDS) {
    const proposed = values[field].trim();
    const stored = (current[field] ?? "").trim();
    // `""` reaching the door is the stated intent to clear; an absent key is not.
    if (proposed !== stored) blankable[field] = proposed;
  }

  return patch;
}

/** The two columns that outlive any edit because records already quote them. */
export const IMMUTABLE_ORGANIZATION_FIELDS: readonly { key: "code" | "slug"; label: string; reason: string }[] = [
  {
    key: "code",
    label: "Organization code",
    reason: "Printed in document numbers and imports. Issued once, then read-only.",
  },
  {
    key: "slug",
    label: "URL slug",
    reason: "Part of every booking URL and API path. Changing it would rewrite the meaning of past records.",
  },
];

export function isImmutableOrganizationField(key: string): boolean {
  return IMMUTABLE_ORGANIZATION_FIELDS.some((field) => field.key === key);
}

export function immutableOrganizationField(key: "code" | "slug"): { label: string; reason: string } {
  const found = IMMUTABLE_ORGANIZATION_FIELDS.find((field) => field.key === key);
  // The union is closed, so this cannot miss; the fallback keeps the return total.
  return found ?? { label: key, reason: "Issued with the tenant and never edited." };
}

export type OrganizationStatusChoice = {
  status: OrganizationStatus;
  label: string;
  description: string;
  /** Every transition takes `p_reason`, so no path is offered without one. */
  requiresReason: boolean;
};

/**
 * Suspend / archive / restore are the three states of one transition (§41/§73).
 * An archived tenant is only offered the way back — there is no second archive, and
 * there is never a delete.
 */
export function organizationStatusChoices(
  status: OrganizationStatus,
): readonly OrganizationStatusChoice[] {
  const suspend: OrganizationStatusChoice = {
    status: "SUSPENDED",
    label: "Suspend trading",
    description: "The tenant stays intact but nothing new can be added to it.",
    requiresReason: true,
  };
  const archive: OrganizationStatusChoice = {
    status: "ARCHIVED",
    label: "Archive tenant",
    description: "Retires the tenant. Its history stays auditable and can be restored.",
    requiresReason: true,
  };
  const restore: OrganizationStatusChoice = {
    status: "ACTIVE",
    label: "Restore as trading",
    description: "Brings the tenant back so its sites can trade again.",
    requiresReason: true,
  };

  if (status === "ACTIVE") return [suspend, archive];
  if (status === "SUSPENDED") return [restore, archive];
  return [restore];
}

/** §60: a demo tenant is labelled wherever its data appears, and only when it is one. */
export function demoLabel(isDemo: boolean): string | null {
  return isDemo ? "Demo data" : null;
}

/** A NULL column reads as "Not recorded" — never a dash, a zero or an empty cell. */
export const NOT_RECORDED = "Not recorded";

export function displayValue(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? NOT_RECORDED : trimmed;
}

/** `CLOUD_KITCHEN` -> `Cloud Kitchen`, derived from the constant, never re-typed. */
export function taxonomyLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/(^|\s)\S/g, (character) => character.toUpperCase());
}

/** The labels for the taxonomy picker — built from the const array, so it cannot drift. */
export function businessTypeOptions(): readonly { value: BusinessType; label: string }[] {
  return BUSINESS_TYPES.map((value) => ({ value, label: taxonomyLabel(value) }));
}

export type FormFailure = {
  message: string;
  /** A `CONFLICT` means somebody else won the race: the operator reloads the row. */
  reloadRequired: boolean;
};

/**
 * A thrown door error -> the line shown inside the form. `toPublicError` keeps schema
 * detail out of the UI; the values the operator typed are never touched by this path.
 */
export function submitFailure(error: unknown): FormFailure {
  const publicError = toPublicError(error);
  if (publicError.code === ERROR_CODES.CONFLICT) {
    return {
      message: "Someone else changed this record. Reload it before saving again.",
      reloadRequired: true,
    };
  }
  return { message: publicError.message, reloadRequired: false };
}

/* ---------------------------------------------------------------------- screen */

export default function OrganizationPage() {
  const status = useContextStore((state) => state.status);
  const context = useContextStore((state) => state.context);
  const permissions = useContextStore((state) => state.permissions);
  const claimed = useContextStore((state) => state.organization);
  const sessionError = useContextStore((state) => state.error);
  const bootstrap = useContextStore((state) => state.bootstrap);
  const claimDemo = useContextStore((state) => state.claimDemo);

  const organizationId = context.organizationId;
  const mayView = holdsPermission("organization.view", permissions);
  const mayEdit = holdsPermission("organization.edit", permissions);
  const mayArchive = holdsPermission("organization.archive", permissions);

  const [organization, setOrganization] = useState<Organization | null>(
    claimed !== null && claimed.id === organizationId ? claimed : null,
  );
  const [loading, setLoading] = useState<boolean>(
    organization === null && status !== "unconfigured" && status !== "unauthenticated",
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<OrganizationFormValues | null>(null);
  const [fieldErrors, setFieldErrors] = useState<OrganizationFieldErrors>({});
  const [formFailure, setFormFailure] = useState<FormFailure | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusChoice, setStatusChoice] = useState<OrganizationStatusChoice | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [transitionFailure, setTransitionFailure] = useState<FormFailure | null>(null);
  const [transitionBusy, setTransitionBusy] = useState(false);

  const reload = useCallback(async (): Promise<void> => {
    if (organizationId === null) return;
    setLoading(true);
    try {
      // Archived stays opted in: restoring a retired tenant is a job this screen has.
      const row = await getOrganization(organizationId, { includeArchived: true });
      setOrganization(row);
      setLoadError(row === null ? "This organization is no longer visible to your session." : null);
    } catch (error) {
      setLoadError(submitFailure(error).message);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (status === "idle") {
      void bootstrap();
      return;
    }
    if (status === "ready" && organizationId !== null) void reload();
  }, [status, organizationId, bootstrap, reload]);

  function openEditor(): void {
    if (organization === null) return;
    setDraft(organizationFormValues(organization));
    setFieldErrors({});
    setFormFailure(null);
    setSaved(null);
  }

  function closeEditor(): void {
    setDraft(null);
    setFieldErrors({});
    setFormFailure(null);
  }

  function changeField<K extends OrganizationField>(key: K, value: OrganizationFormValues[K]): void {
    setDraft((current) => (current === null ? current : { ...current, [key]: value }));
  }

  function toggleBusinessType(value: BusinessType): void {
    setDraft((current) => {
      if (current === null) return current;
      const chosen = current.businessTypes.includes(value);
      return {
        ...current,
        businessTypes: chosen
          ? current.businessTypes.filter((type) => type !== value)
          : [...current.businessTypes, value],
      };
    });
  }

  async function saveDraft(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (organization === null || draft === null) return;

    const errors = validateOrganizationForm(draft);
    setFieldErrors(errors);
    if (formHasErrors(errors)) {
      setFormFailure({ message: "Check the highlighted fields before saving.", reloadRequired: false });
      return;
    }

    setSaving(true);
    // The version the row had when it was read — §82's optimistic lock.
    const expectedVersion = organization.version;
    try {
      const updated = await updateOrganization(
        buildOrganizationUpdate(draft, organization, expectedVersion),
      );
      setOrganization(updated);
      setDraft(null);
      setFormFailure(null);
      setSaved(`Saved (version ${updated.version}).`);
    } catch (error) {
      // The draft survives: nothing here wipes what the operator typed.
      setFormFailure(submitFailure(error));
    } finally {
      setSaving(false);
    }
  }

  async function applyStatus(target: OrganizationStatus, reason: string): Promise<void> {
    if (organization === null) return;
    setTransitionBusy(true);
    try {
      const updated = await setOrganizationStatus({
        organizationId: organization.id,
        status: target,
        reason,
      });
      setOrganization(updated);
      setStatusChoice(null);
      setArchiveOpen(false);
      setTransitionFailure(null);
      setSaved(`Status is now ${statusLabelFor(updated.status)}.`);
    } catch (error) {
      setTransitionFailure(submitFailure(error));
    } finally {
      setTransitionBusy(false);
    }
  }

  if (status === "unconfigured" || status === "unauthenticated") {
    return <SessionState unconfigured={status === "unconfigured"} message={sessionError} />;
  }

  // A resolving session has no permission set yet, which is not the same thing as a denied
  // one: the wait is shown, and §51 is reserved for the answer that actually denies.
  if (status !== "ready") {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <PageHeading title="Organization" subtitle="The tenant record every other module hangs from." />
        <LoadingBlock label="Loading this organization" rows={5} />
      </div>
    );
  }

  // A session with no tenant resolved has no permission set at all (the store only loads
  // permissions once an organization is active). Showing §51 there would call a missing
  // scope a refusal, so the empty state — with the action that fills it — comes first.
  if (organizationId === null) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <PageHeading title="Organization" subtitle="The tenant record every other module hangs from." />
        <EmptyState
          icon={<Building2 aria-hidden />}
          title="No organization is active for this session"
          description="Nothing was resolved for this visit, so there is no tenant record to show. Onboarding a
            tenant is the first step of the setup flow; until then the demo estate is the only data available."
          action={
            <Button variant="primary" onClick={() => void claimDemo()}>
              Use the demo estate
            </Button>
          }
        />
      </div>
    );
  }

  if (!mayView) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <PageHeading title="Organization" subtitle="The tenant record every other module hangs from." />
        <AccessDenied
          capability="view this organization"
          permission="organization.view"
          hint="Membership in the tenant is what grants it; the record itself is not damaged."
        />
      </div>
    );
  }

  if (organization === null && loading) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <PageHeading title="Organization" subtitle="The tenant record every other module hangs from." />
        <LoadingBlock label="Loading this organization" rows={5} />
      </div>
    );
  }

  if (organization === null) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <PageHeading title="Organization" subtitle="The tenant record every other module hangs from." />
        <EmptyState
          icon={<ShieldAlert aria-hidden />}
          title="This organization could not be read"
          description={loadError ?? "No row was returned for the active tenant."}
          action={
            <Button icon={<RefreshCw className="size-4" aria-hidden />} onClick={() => void reload()}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  const choices = organizationStatusChoices(organization.status);
  const label = demoLabel(organization.isDemo);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 pb-8">
      <PageHeading
        title="Organization"
        subtitle="The tenant record every other module hangs from."
        actions={
          mayEdit ? (
            <Button
              variant="primary"
              icon={<Pencil className="size-4" aria-hidden />}
              onClick={openEditor}
            >
              Edit details
            </Button>
          ) : null
        }
      />

      {saved !== null && (
        <p role="status" className="rounded-md border border-line bg-success-soft px-3 py-2 text-xs text-success">
          {saved}
        </p>
      )}

      {organization.status === "ARCHIVED" && (
        <p className="flex items-start gap-2 rounded-md border border-line bg-surface-sunken px-3 py-2 text-xs leading-relaxed text-muted">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          This tenant is archived. Its record and history are preserved; restoring it is a status
          transition, listed under Tenant status.
        </p>
      )}

      <Card
        title={organization.name}
        description={`${organization.code} · ${organization.slug}`}
        actions={
          <div className="flex items-center gap-2">
            {label !== null && <Badge tone="warning">{label}</Badge>}
            <StatusPill status={organization.status} />
          </div>
        }
      >
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Detail label="Legal name" value={displayValue(organization.legalName)} />
          <Detail label="Display name" value={displayValue(organization.displayName)} />
          <Detail label="Country" value={organization.country} />
          <Detail label="Reporting currency" value={organization.currency} />
          <Detail label="Timezone" value={organization.timezone} />
          <Detail label="Locale" value={organization.locale} />
          <Detail label="Tax region" value={displayValue(organization.taxRegion)} />
          <Detail label="Phone" value={displayValue(organization.phone)} />
          <Detail label="Email" value={displayValue(organization.email)} />
          <Detail label="Website" value={displayValue(organization.website)} />
          <Detail label="Logo URL" value={displayValue(organization.logoUrl)} />
          <Detail label="Version" value={String(organization.version)} />
        </dl>

        <div className="mt-4 border-t border-line pt-4">
          <p className="text-[11px] font-medium tracking-[0.06em] text-muted uppercase">
            Business formats
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {organization.businessTypes.length === 0 ? (
              <Badge tone="muted">None declared</Badge>
            ) : (
              organization.businessTypes.map((type) => (
                <Badge key={type} tone="brand">
                  {taxonomyLabel(type)}
                </Badge>
              ))
            )}
          </div>
        </div>
      </Card>

      <Card
        title="Identifiers"
        description="Shown for reference. They are quoted in existing records, so this screen cannot edit them."
      >
        <div className="flex flex-col gap-3">
          {IMMUTABLE_ORGANIZATION_FIELDS.map((field) => (
            <div key={field.key} className="rounded-md border border-line bg-surface-sunken px-3 py-2.5">
              <p className="flex items-center gap-2 text-[11px] font-medium tracking-[0.06em] text-muted uppercase">
                <Lock className="size-3.5" aria-hidden />
                {field.label}
              </p>
              <p className="money-figure mt-1 text-sm font-semibold text-ink">
                {organization[field.key]}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{field.reason}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card
        title="Tenant status"
        description="Suspend, archive and restore are status transitions with a recorded reason. Nothing here removes data."
      >
        {mayArchive ? (
          <div className="flex flex-wrap gap-2">
            {choices.map((choice) => (
              <Button
                key={choice.status + choice.label}
                variant={choice.status === "ARCHIVED" ? "danger" : "secondary"}
                icon={statusIcon(choice.status)}
                onClick={() => {
                  setTransitionFailure(null);
                  if (choice.status === "ARCHIVED") setArchiveOpen(true);
                  else setStatusChoice(choice);
                }}
              >
                {choice.label}
              </Button>
            ))}
          </div>
        ) : (
          <AccessDenied
            capability="change this tenant's status"
            permission="organization.archive"
            hint="The tenant record above stays readable — only the transition is withheld."
          />
        )}

        {transitionFailure !== null && (
          <p role="status" className="mt-3 text-xs leading-relaxed text-danger">
            {transitionFailure.message}
            {transitionFailure.reloadRequired && (
              <button
                type="button"
                className="ml-1 font-medium underline"
                onClick={() => void reload()}
              >
                Reload this record
              </button>
            )}
          </p>
        )}
      </Card>

      {/* The edit sheet opens in place over the record; navigating away would drop the
          operator's context for a form this wide does not need. */}
      <Dialog
        open={draft !== null}
        onClose={closeEditor}
        side="right"
        title="Edit organization details"
        description="Code and slug are omitted on purpose — the door has no parameter for them."
        footer={
          <>
            <Button variant="secondary" onClick={closeEditor} disabled={saving}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="organization-edit-form"
              icon={<Save className="size-4" aria-hidden />}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </>
        }
      >
        {draft !== null && (
          <form
            id="organization-edit-form"
            className="flex flex-col gap-4"
            onSubmit={(event) => void saveDraft(event)}
          >
            {formFailure !== null && (
              <p role="status" className="rounded-md border border-line bg-danger-soft px-3 py-2 text-xs leading-relaxed text-danger">
                {formFailure.message}
                {formFailure.reloadRequired && (
                  <button
                    type="button"
                    className="ml-1 font-medium underline"
                    onClick={() => {
                      setDraft(null);
                      void reload();
                    }}
                  >
                    Reload the record
                  </button>
                )}
              </p>
            )}

            <Field label="Name" required error={fieldErrors.name} hint="Shown across the product. 2 to 120 characters.">
              <TextInput value={draft.name} onChange={(e) => changeField("name", e.target.value)} invalid={fieldErrors.name !== undefined} />
            </Field>
            <Field label="Legal name" error={fieldErrors.legalName} hint="The registered entity. Clear it to store nothing.">
              <TextInput value={draft.legalName} onChange={(e) => changeField("legalName", e.target.value)} invalid={fieldErrors.legalName !== undefined} />
            </Field>
            <Field label="Display name" error={fieldErrors.displayName} hint="Optional shorter name for lists and documents.">
              <TextInput value={draft.displayName} onChange={(e) => changeField("displayName", e.target.value)} invalid={fieldErrors.displayName !== undefined} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Country" required error={fieldErrors.country} hint="Two-letter ISO code, e.g. IN.">
                <TextInput
                  value={draft.country}
                  onChange={(e) => changeField("country", e.target.value.toUpperCase())}
                  maxLength={2}
                  invalid={fieldErrors.country !== undefined}
                />
              </Field>
              <Field label="Reporting currency" required error={fieldErrors.currency} hint="Three-letter code, e.g. INR. A site may trade in another.">
                <TextInput
                  value={draft.currency}
                  onChange={(e) => changeField("currency", e.target.value.toUpperCase())}
                  maxLength={3}
                  invalid={fieldErrors.currency !== undefined}
                />
              </Field>
              <Field label="Timezone" required error={fieldErrors.timezone} hint="Confirmed against the server's zone list on save.">
                <TextInput value={draft.timezone} onChange={(e) => changeField("timezone", e.target.value)} invalid={fieldErrors.timezone !== undefined} />
              </Field>
              <Field label="Locale" required error={fieldErrors.locale} hint="e.g. en-IN.">
                <TextInput value={draft.locale} onChange={(e) => changeField("locale", e.target.value)} invalid={fieldErrors.locale !== undefined} />
              </Field>
            </div>

            <Field label="Tax region" error={fieldErrors.taxRegion} hint="Tax is filed per legal entity, so the region sits here.">
              <TextInput value={draft.taxRegion} onChange={(e) => changeField("taxRegion", e.target.value)} invalid={fieldErrors.taxRegion !== undefined} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone" error={fieldErrors.phone}>
                <TextInput value={draft.phone} onChange={(e) => changeField("phone", e.target.value)} invalid={fieldErrors.phone !== undefined} />
              </Field>
              <Field label="Email" error={fieldErrors.email}>
                <TextInput type="email" value={draft.email} onChange={(e) => changeField("email", e.target.value)} invalid={fieldErrors.email !== undefined} />
              </Field>
            </div>

            <Field label="Website" error={fieldErrors.website}>
              <TextInput value={draft.website} onChange={(e) => changeField("website", e.target.value)} invalid={fieldErrors.website !== undefined} />
            </Field>
            <Field label="Logo URL" error={fieldErrors.logoUrl} hint="Full https address of the image.">
              <TextInput value={draft.logoUrl} onChange={(e) => changeField("logoUrl", e.target.value)} invalid={fieldErrors.logoUrl !== undefined} />
            </Field>

            <Field label="Business formats" error={fieldErrors.businessTypes} hint="A description of the formats the group operates; a site's own type is what drives behaviour.">
              <div className="grid gap-2 sm:grid-cols-2">
                {businessTypeOptions().map((option) => (
                  <Checkbox
                    key={option.value}
                    id={`business-type-${option.value}`}
                    label={option.label}
                    checked={draft.businessTypes.includes(option.value)}
                    onChange={() => toggleBusinessType(option.value)}
                  />
                ))}
              </div>
            </Field>

            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
              <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {immutableOrganizationField("code").label} ({organization.code}) and{" "}
              {immutableOrganizationField("slug").label} ({organization.slug}) are read-only:{" "}
              {immutableOrganizationField("slug").reason}
            </p>
          </form>
        )}
      </Dialog>

      <ArchiveDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={(reason) => void applyStatus("ARCHIVED", reason)}
        entityName={organization.name}
        entityLabel="organization"
        loading={transitionBusy}
      />

      {statusChoice !== null && (
        <StatusReasonDialog
          choice={statusChoice}
          entityName={organization.name}
          busy={transitionBusy}
          onClose={() => setStatusChoice(null)}
          onConfirm={(reason) => void applyStatus(statusChoice.status, reason)}
        />
      )}
    </div>
  );
}

/* --------------------------------------------------------------- local pieces */

function statusIcon(status: OrganizationStatus): ReactNode {
  if (status === "SUSPENDED") return <Ban className="size-4" aria-hidden />;
  if (status === "ARCHIVED") return <ArchiveRestore className="size-4" aria-hidden />;
  return <RefreshCw className="size-4" aria-hidden />;
}

function statusLabelFor(status: OrganizationStatus): string {
  return status === "ACTIVE" ? "trading" : status === "SUSPENDED" ? "suspended" : "archived";
}

function PageHeading({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
          <Building2 className="size-3.5" aria-hidden />
          Administration
        </p>
        <h2 className="mt-1 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">{title}</h2>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
      </div>
      {actions !== null && actions !== undefined && <div className="flex shrink-0 gap-2">{actions}</div>}
    </header>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium tracking-[0.06em] text-muted uppercase">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-ink">{value}</dd>
    </div>
  );
}

/**
 * The honest "no data plane / no session" states. A spinner here would be a lie: the
 * screen is never going to resolve, so it says what is missing instead.
 */
function SessionState({ unconfigured, message }: { unconfigured: boolean; message: string | null }) {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <PageHeading title="Organization" subtitle="The tenant record every other module hangs from." />
      <EmptyState
        icon={<Database aria-hidden />}
        title={unconfigured ? "No backend configured" : "Not signed in"}
        description={
          message ??
          (unconfigured
            ? "This build has no Supabase project behind it, so there is no tenant record to read. Set the project URL and publishable key, then reload."
            : "This visit has no session the server will act on, so no tenant data is available. Sign in again to load the organization you belong to.")
        }
      />
    </div>
  );
}

/**
 * A reason-bearing status transition that is not an archive. Same mandatory-reason
 * rule as `ArchiveDialog` (it reuses `archiveActionState`), so there is one gate and
 * never a path that reaches a door without a reason.
 */
function StatusReasonDialog({
  choice,
  entityName,
  busy,
  onClose,
  onConfirm,
}: {
  choice: OrganizationStatusChoice;
  entityName: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const gate = archiveActionState(reason, entityName);
  // One enablement rule for every protected transition, shared with ArchiveDialog.
  const canConfirm = gate.canConfirm;

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={choice.label}
      description={`${entityName} — ${choice.description}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={busy ? <Spinner size="sm" decorative /> : <Save className="size-4" aria-hidden />}
            disabled={!canConfirm || busy}
            onClick={() => onConfirm(gate.normalizedReason)}
          >
            {busy ? "Working…" : choice.label}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field
          label="Reason"
          required
          hint="Written into the audit entry. The door refuses this change without it."
        >
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Group placed on hold while the sale is completed."
            disabled={busy}
          />
        </Field>
        {!canConfirm && (
          <p role="status" className="text-xs text-muted">
            A reason is required before this can be confirmed.
          </p>
        )}
      </div>
    </Dialog>
  );
}
