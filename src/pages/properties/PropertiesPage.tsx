/**
 * The tenant's sites — `/properties`.
 *
 * What is decided here that is not decided by the layout:
 *
 *   - The add/edit sheet opens IN PLACE. A site's address is a form, not a
 *     destination, and navigating away would drop the context the operator is reading.
 *   - `code`, `slug` and `property_type` are editable only while the site is being
 *     created. They are quoted in reservations, folios and URLs (§11/§44), so the update
 *     door declares no parameter for them and this screen stops offering them.
 *   - The read excludes ARCHIVED unless the caller opts in, so the archived filter is a
 *     second call with `{ includeArchived: true }` — never a client-side hide.
 *   - Retiring a site is a status transition with a reason, and restoring one is offered
 *     on the archived list. Nothing on this screen is called delete.
 *   - Permission only decides what is offered. Every refusal comes back from the door and
 *     is shown inline with the operator's typed values intact; a `CONFLICT` is reported
 *     as "reload this record", never as a save that worked.
 *
 * Reads land in the tenant cache under a key that names the archived opt-in, so an
 * archived view can never be served the non-archived rows fetched a moment earlier.
 */

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Archive,
  ArchiveRestore,
  Building2,
  Database,
  History,
  Info,
  Lock,
  MapPin,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
} from "lucide-react";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { ArchiveDialog, archiveActionState } from "@/components/ui/ArchiveDialog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { LoadingBlock, Spinner } from "@/components/ui/Spinner";
import { SelectInput, type SelectOption } from "@/components/ui/SelectInput";
import { StatusPill } from "@/components/ui/StatusPill";
import { Switch } from "@/components/ui/Switch";
import { TextInput } from "@/components/ui/TextInput";
import { Textarea } from "@/components/ui/Textarea";
import { getOrganization } from "@/domain/hierarchy/organization-service";
import {
  createProperty,
  getProperty,
  listProperties,
  setPropertyStatus,
  updateProperty,
  type ArchivedRead,
  type NewProperty,
  type PropertyUpdate,
} from "@/domain/hierarchy/property-service";
import {
  PROPERTY_TYPES,
  can as holdsPermission,
  type Organization,
  type Property,
  type PropertyType,
  type SiteStatus,
} from "@/domain/identity/types";
import { ERROR_CODES, toPublicError } from "@/lib/errors";
import { useContextStore } from "@/state/context-store";
import { beginFetch, commitFetch, read, scopeFor } from "@/state/tenant-cache";

/* ------------------------------------------------------------------ pure rules */

const NAME_PATTERN = /^.{2,120}$/;
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,19}$/;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,59}$/;
const COUNTRY_PATTERN = /^[A-Z]{2}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const LOCALE_PATTERN = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
/** `is_valid_timezone` consults `pg_timezone_names`, which the client cannot enumerate;
 *  the shape is all this side can honestly insist on, and the door still decides. */
const TIMEZONE_PATTERN = /^(?:UTC|Etc\/[A-Za-z0-9_+-]+|[A-Za-z]+\/[A-Za-z0-9_+/-]+)$/;
const EMAIL_PATTERN = /^[^@\s]+@[^\s@]+\.[A-Za-z]{2,}$/;
/** `time` as the door takes it: a 24-hour hour:minute pair. */
const DAY_START_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Nullable text columns the update door can blank (`app.blankable`). */
const BLANKABLE_FIELDS = [
  "displayName",
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "postalCode",
  "phone",
  "email",
] as const;

type BlankableField = (typeof BLANKABLE_FIELDS)[number];

export type PropertyFormValues = {
  name: string;
  displayName: string;
  code: string;
  slug: string;
  /** `""` is the un-chosen state of the picker; a saved row always holds a real type. */
  type: PropertyType | "";
  country: string;
  currency: string;
  timezone: string;
  locale: string;
  businessDayStart: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  email: string;
};

export type PropertyField = keyof PropertyFormValues;
export type PropertyFieldErrors = Partial<Record<PropertyField, string>>;
export type SheetMode = "create" | "edit";
export type FormFailure = { message: string; reloadRequired: boolean };

/** A NULL column reads as "Not recorded" — never a dash, a zero or a blank cell. */
export const NOT_RECORDED = "Not recorded";

export function displayValue(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? NOT_RECORDED : trimmed;
}

/** `CONVENTION_CENTER` -> `Convention Center`, derived from the constant, never re-typed. */
export function taxonomyLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/(^|\s)\S/g, (character) => character.toUpperCase());
}

/** The group-level values a new site may copy — defaults, never schema constants (§11/§69). */
export type PropertyDefaults = {
  country: string;
  currency: string;
  timezone: string;
  locale: string;
};

/**
 * No organization row means no defaults. Empty strings are returned rather than an
 * invented "IN"/"INR": a country guessed by the client becomes a wrong tenant record.
 */
export function defaultsFromOrganization(organization: Organization | null): PropertyDefaults {
  if (organization === null) return { country: "", currency: "", timezone: "", locale: "" };
  return {
    country: organization.country,
    currency: organization.currency,
    timezone: organization.timezone,
    locale: organization.locale,
  };
}

export function propertyFormValues(
  row: Property | null,
  defaults: PropertyDefaults,
): PropertyFormValues {
  if (row === null) {
    return {
      name: "",
      displayName: "",
      code: "",
      slug: "",
      type: "",
      country: defaults.country,
      currency: defaults.currency,
      timezone: defaults.timezone,
      locale: defaults.locale,
      businessDayStart: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      state: "",
      postalCode: "",
      phone: "",
      email: "",
    };
  }

  const text = (value: string | null): string => value ?? "";
  return {
    name: row.name,
    displayName: text(row.displayName),
    code: row.code,
    slug: row.slug,
    type: row.type,
    country: row.country,
    currency: row.currency,
    timezone: row.timezone,
    locale: row.locale,
    // Postgres `time` reads back as HH:MM:SS; the validator and the time input speak HH:MM.
    businessDayStart: row.businessDayStart.slice(0, 5),
    addressLine1: text(row.addressLine1),
    addressLine2: text(row.addressLine2),
    city: text(row.city),
    state: text(row.state),
    postalCode: text(row.postalCode),
    phone: text(row.phone),
    email: text(row.email),
  };
}

/**
 * Per-field validation against the checks in 001/005. In `edit` the three immutable
 * columns are not validated at all: they are never sent, so a complaint about them would
 * be a lie.
 */
export function validatePropertyForm(
  values: PropertyFormValues,
  mode: SheetMode,
): PropertyFieldErrors {
  const errors: PropertyFieldErrors = {};

  if (!NAME_PATTERN.test(values.name.trim())) {
    errors.name = "Enter a name between 2 and 120 characters.";
  }
  if (mode === "create") {
    if (!CODE_PATTERN.test(values.code.trim())) {
      errors.code = "Use 2 to 20 uppercase letters, digits or hyphens, starting with a letter or digit.";
    }
    if (!SLUG_PATTERN.test(values.slug.trim())) {
      errors.slug = "Use 2 to 60 lowercase letters, digits or hyphens, starting with a letter or digit.";
    }
    if (values.type === "" || !PROPERTY_TYPES.includes(values.type)) {
      errors.type = "Choose the site type. It decides how the site behaves.";
    }
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
  // NOT NULL on the row: a create may leave it to the door's default, an edit cannot.
  if (mode === "edit" && values.businessDayStart.trim() === "") {
    errors.businessDayStart = "The trading day boundary is required once the site exists.";
  }
  if (values.businessDayStart.trim() !== "" && !DAY_START_PATTERN.test(values.businessDayStart.trim())) {
    errors.businessDayStart = "Use a 24-hour time such as 04:00.";
  }
  if (values.email.trim() !== "" && !EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = "Enter a valid email address.";
  }
  if (values.phone.trim().length > 32) {
    errors.phone = "Keep the phone number under 32 characters.";
  }

  return errors;
}

export function formHasErrors(errors: PropertyFieldErrors): boolean {
  return Object.values(errors).some((message) => message !== undefined);
}

/**
 * Form -> `create_property`. An optional field the operator left blank is sent as NULL
 * (the door stores nothing), never as an empty string that would read back as a blank
 * address line. An omitted `businessDayStart` is the door's own default.
 */
export function buildPropertyCreate(
  values: PropertyFormValues,
  organizationId: string,
): NewProperty {
  const optional = (value: string): string | null => {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  };
  const dayStart = values.businessDayStart.trim();

  return {
    organizationId,
    name: values.name.trim(),
    code: values.code.trim().toUpperCase(),
    slug: values.slug.trim().toLowerCase(),
    type: values.type as PropertyType,
    country: values.country.trim().toUpperCase(),
    currency: values.currency.trim().toUpperCase(),
    timezone: values.timezone.trim(),
    locale: values.locale.trim(),
    businessDayStart: dayStart === "" ? undefined : dayStart,
    addressLine1: optional(values.addressLine1),
    addressLine2: optional(values.addressLine2),
    city: optional(values.city),
    state: optional(values.state),
    postalCode: optional(values.postalCode),
    phone: optional(values.phone),
    email: optional(values.email),
  };
}

/**
 * Form -> `update_property`: an untouched blankable column is ABSENT so the door leaves
 * it, an emptied one is `""` so the door stores NULL, and `code`/`slug`/`property_type`
 * are never sent because the update door declares no parameter for them.
 */
export function buildPropertyUpdate(
  values: PropertyFormValues,
  current: Property,
  expectedVersion: number,
): PropertyUpdate {
  const patch: PropertyUpdate = {
    propertyId: current.id,
    expectedVersion,
    name: values.name.trim(),
    country: values.country.trim().toUpperCase(),
    currency: values.currency.trim().toUpperCase(),
    timezone: values.timezone.trim(),
    locale: values.locale.trim(),
    businessDayStart: values.businessDayStart.trim(),
  };

  const blankable = patch as Record<BlankableField, string | undefined>;
  for (const field of BLANKABLE_FIELDS) {
    const proposed = values[field].trim();
    const stored = (current[field] ?? "").trim();
    if (proposed !== stored) blankable[field] = proposed;
  }

  return patch;
}

/**
 * The taxonomy picker, fed from the const array. Nothing here re-types the list, so a
 * value the database CHECK refuses can never appear in the dropdown.
 */
export function propertyTypeOptions(): readonly SelectOption<PropertyType>[] {
  return PROPERTY_TYPES.map((value) => ({ value, label: taxonomyLabel(value) }));
}

/**
 * The display-side rule, asserted directly: ARCHIVED rows stay out of the list until the
 * operator asks for them. The door applies the same rule server-side; this is what makes
 * a stale or over-broad answer visible rather than quietly listed.
 */
export function filterProperties(
  rows: readonly Property[],
  includeArchived: boolean,
): readonly Property[] {
  if (includeArchived) return rows;
  return rows.filter((row) => row.status !== "ARCHIVED");
}

/** The archived read is opt-in only: with the filter off, no `includeArchived` key goes out. */
export function archivedReadRequest(includeArchived: boolean): ArchivedRead {
  return includeArchived ? { includeArchived: true } : {};
}

/** A separate cache entry per archived opt-in, so one view cannot serve the other's rows. */
export function propertiesCacheKey(includeArchived: boolean): string {
  return includeArchived ? "properties.list.including-archived" : "properties.list.active";
}

export type SiteStatusChoice = {
  status: SiteStatus;
  label: string;
  description: string;
  /** Every transition takes `p_reason`, so no path is offered without one. */
  requiresReason: boolean;
};

/** Pause / retire / reactivate — three states of one transition. Never a delete. */
export function siteStatusChoices(status: SiteStatus): readonly SiteStatusChoice[] {
  const pause: SiteStatusChoice = {
    status: "INACTIVE",
    label: "Pause trading",
    description: "The site keeps its records but takes nothing new until it resumes.",
    requiresReason: true,
  };
  const resume: SiteStatusChoice = {
    status: "ACTIVE",
    label: "Resume trading",
    description: "Brings a paused site back without changing anything else.",
    requiresReason: true,
  };
  const archive: SiteStatusChoice = {
    status: "ARCHIVED",
    label: "Archive site",
    description: "Retires the site. Its history stays auditable and restorable.",
    requiresReason: true,
  };
  const restore: SiteStatusChoice = {
    status: "ACTIVE",
    label: "Restore site",
    description: "Reactivates the site. The door also requires the organization to be trading.",
    requiresReason: true,
  };

  if (status === "ACTIVE") return [pause, archive];
  if (status === "INACTIVE") return [resume, archive];
  // The archived list is exactly where a restore belongs.
  return [restore];
}

/** An archived site is not a place to work; the current context needs no switch. */
export function workHereState(
  property: Property,
  currentPropertyId: string | null,
): { enabled: boolean; label: string } {
  if (property.status === "ARCHIVED") return { enabled: false, label: "Archived" };
  if (property.id === currentPropertyId) return { enabled: false, label: "Current site" };
  return { enabled: true, label: "Work here" };
}

/** A door refusal -> the line shown inside the form. Never a wipe of what was typed. */
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

/** Counts of what is on screen — not a claim about rows the read deliberately excluded. */
export function summarizeProperties(rows: readonly Property[]): {
  total: number;
  active: number;
  paused: number;
  archived: number;
} {
  return {
    total: rows.length,
    active: rows.filter((row) => row.status === "ACTIVE").length,
    paused: rows.filter((row) => row.status === "INACTIVE").length,
    archived: rows.filter((row) => row.status === "ARCHIVED").length,
  };
}

/** §60: the demo flag is labelled wherever the tenant's data appears, and only when set. */
export function demoLabel(isDemo: boolean | undefined): string | null {
  return isDemo === true ? "Demo data" : null;
}

/* ---------------------------------------------------------------------- screen */

type Sheet = { mode: "create" } | { mode: "edit"; property: Property };

const SUBTITLE = "Sites, with the timezone, currency and trading day each one answers for.";

export default function PropertiesPage() {
  const status = useContextStore((state) => state.status);
  const context = useContextStore((state) => state.context);
  const permissions = useContextStore((state) => state.permissions);
  const claimed = useContextStore((state) => state.organization);
  const sessionError = useContextStore((state) => state.error);
  const bootstrap = useContextStore((state) => state.bootstrap);
  const claimDemo = useContextStore((state) => state.claimDemo);
  const switchContext = useContextStore((state) => state.switchContext);

  const organizationId = context.organizationId;
  const scope = scopeFor(context);
  const mayView = holdsPermission("property.view", permissions);
  const mayCreate = holdsPermission("property.create", permissions);
  const mayEdit = holdsPermission("property.edit", permissions);
  const mayArchive = holdsPermission("property.archive", permissions);

  const [showArchived, setShowArchived] = useState(false);
  const [cached] = useState<readonly Property[] | undefined>(() =>
    read<Property[]>(scope, propertiesCacheKey(false)),
  );
  const [rows, setRows] = useState<readonly Property[]>(() =>
    filterProperties(cached ?? [], false),
  );
  const [organization, setOrganization] = useState<Organization | null>(
    claimed !== null && claimed.id === organizationId ? claimed : null,
  );
  const [loading, setLoading] = useState<boolean>(
    () => cached === undefined && status !== "unconfigured" && status !== "unauthenticated",
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [draft, setDraft] = useState<PropertyFormValues | null>(null);
  const [fieldErrors, setFieldErrors] = useState<PropertyFieldErrors>({});
  const [formFailure, setFormFailure] = useState<FormFailure | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Property | null>(null);
  const [statusTarget, setStatusTarget] = useState<{
    property: Property;
    choice: SiteStatusChoice;
  } | null>(null);
  const [transitionBusy, setTransitionBusy] = useState(false);
  const [transitionFailure, setTransitionFailure] = useState<FormFailure | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const defaults = defaultsFromOrganization(organization);

  const reload = useCallback(
    async (includeArchived: boolean): Promise<void> => {
      if (organizationId === null) return;
      const token = beginFetch(scope, propertiesCacheKey(includeArchived));
      setLoading(true);
      try {
        const [next, org] = await Promise.all([
          listProperties({ organizationId }, archivedReadRequest(includeArchived)),
          getOrganization(organizationId, { includeArchived: true }),
        ]);
        // A refused commit means the operator switched tenant mid-flight: this answer is
        // dropped rather than applied, and the newer context owns the screen.
        if (commitFetch(token, next)) {
          setRows(filterProperties(next, includeArchived));
          setOrganization(org);
          setLoadError(null);
          setLoading(false);
        }
      } catch (error) {
        setLoading(false);
        setLoadError(submitFailure(error).message);
      }
    },
    [organizationId, scope],
  );

  useEffect(() => {
    if (status === "idle") {
      void bootstrap();
      return;
    }
    if (status === "ready" && organizationId !== null) void reload(showArchived);
  }, [status, organizationId, showArchived, bootstrap, reload]);

  /**
   * Re-read one row after a `CONFLICT`. The sheet keeps what the operator typed; only the
   * row the save is measured against moves.
   */
  async function reloadProperty(propertyId: string): Promise<void> {
    if (organizationId === null) return;
    try {
      const fresh = await getProperty(
        propertyId,
        { organizationId },
        archivedReadRequest(true),
      );
      if (fresh === null) {
        setFormFailure({
          message: "That site is no longer visible to your session. The list was refreshed.",
          reloadRequired: false,
        });
        await reload(showArchived);
        return;
      }
      setRows((current) => current.map((row) => (row.id === fresh.id ? fresh : row)));
      setSheet((current) => (current?.mode === "edit" ? { mode: "edit", property: fresh } : current));
      setFormFailure({
        message: "This site was reloaded. Check the fields against it, then save again.",
        reloadRequired: false,
      });
    } catch (error) {
      setFormFailure(submitFailure(error));
    }
  }

  function openCreate(): void {
    setSheet({ mode: "create" });
    setDraft(propertyFormValues(null, defaults));
    setFieldErrors({});
    setFormFailure(null);
    setSaved(null);
  }

  function openEdit(property: Property): void {
    setSheet({ mode: "edit", property });
    setDraft(propertyFormValues(property, defaults));
    setFieldErrors({});
    setFormFailure(null);
    setSaved(null);
  }

  function closeSheet(): void {
    setSheet(null);
    setDraft(null);
    setFieldErrors({});
    setFormFailure(null);
  }

  function changeField<K extends PropertyField>(key: K, value: PropertyFormValues[K]): void {
    setDraft((current) => (current === null ? current : { ...current, [key]: value }));
  }

  async function saveDraft(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (draft === null || sheet === null || organizationId === null) return;

    const errors = validatePropertyForm(draft, sheet.mode);
    setFieldErrors(errors);
    if (formHasErrors(errors)) {
      setFormFailure({ message: "Check the highlighted fields before saving.", reloadRequired: false });
      return;
    }

    setSaving(true);
    try {
      if (sheet.mode === "create") {
        const created = await createProperty(buildPropertyCreate(draft, organizationId));
        closeSheet();
        setSaved(`${created.name} added.`);
      } else {
        // The version this row had when it was listed — §82's optimistic lock.
        const updated = await updateProperty(
          buildPropertyUpdate(draft, sheet.property, sheet.property.version),
        );
        closeSheet();
        setSaved(`${updated.name} saved (version ${updated.version}).`);
      }
      await reload(showArchived);
    } catch (error) {
      // The draft is left exactly as it was: a failed save never costs typing.
      setFormFailure(submitFailure(error));
    } finally {
      setSaving(false);
    }
  }

  async function applyStatus(
    property: Property,
    choice: SiteStatusChoice,
    reason: string,
  ): Promise<void> {
    setTransitionBusy(true);
    try {
      const updated = await setPropertyStatus({
        propertyId: property.id,
        status: choice.status,
        reason,
      });
      setArchiveTarget(null);
      setStatusTarget(null);
      setTransitionFailure(null);
      setSaved(`${updated.name} — ${choice.label.toLowerCase()}.`);
      await reload(showArchived);
    } catch (error) {
      setTransitionFailure(submitFailure(error));
    } finally {
      setTransitionBusy(false);
    }
  }

  async function workHere(property: Property): Promise<void> {
    if (organizationId === null) return;
    setSwitchingId(property.id);
    try {
      // The server narrows the answer it returns; §27-§30's switcher owns where a
      // person lands afterwards, so this screen only asks for the move.
      await switchContext({ organizationId, propertyId: property.id, outletId: null });
      setSaved(`Now working in ${property.name}.`);
    } catch (error) {
      setTransitionFailure(submitFailure(error));
    } finally {
      setSwitchingId(null);
    }
  }

  function columns(): readonly DataColumn<Property>[] {
    return [
      {
        key: "name",
        header: "Site",
        render: (row) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{row.name}</p>
            <p className="money-figure mt-0.5 truncate text-xs text-muted">
              {row.code} · {row.slug}
            </p>
          </div>
        ),
      },
      {
        key: "type",
        header: "Type",
        render: (row) => <Badge tone="neutral">{taxonomyLabel(row.type)}</Badge>,
      },
      {
        key: "city",
        header: "City",
        render: (row) => <span className="text-ink">{displayValue(row.city)}</span>,
      },
      {
        key: "status",
        header: "Status",
        render: (row) => <StatusPill status={row.status} />,
      },
      {
        key: "clock",
        header: "Time / money",
        render: (row) => (
          <div className="min-w-0 text-xs text-muted">
            <p className="truncate text-ink">{row.timezone}</p>
            <p className="money-figure mt-0.5">
              {row.currency} · day from{" "}
              <span className="font-medium text-ink">{row.businessDayStart}</span>
            </p>
          </div>
        ),
      },
      {
        key: "actions",
        header: "Actions",
        align: "right",
        render: (row) => (
          <PropertyRowActions
            property={row}
            mayEdit={mayEdit}
            mayArchive={mayArchive}
            currentPropertyId={context.propertyId}
            busy={switchingId === row.id}
            onWorkHere={() => void workHere(row)}
            onEdit={() => openEdit(row)}
            onArchive={() => {
              setTransitionFailure(null);
              setArchiveTarget(row);
            }}
            onTransition={(choice) => {
              setTransitionFailure(null);
              setStatusTarget({ property: row, choice });
            }}
          />
        ),
      },
    ];
  }

  if (status === "unconfigured" || status === "unauthenticated") {
    return (
      <Frame>
        <PageHeading subtitle={SUBTITLE} />
        <SessionState unconfigured={status === "unconfigured"} message={sessionError} />
      </Frame>
    );
  }

  // A resolving session has no permission set yet, which is not a denial: §51 is reserved
  // for the answer that actually denies, so the wait shows the loading state.
  if (status !== "ready") {
    return (
      <Frame>
        <PageHeading subtitle={SUBTITLE} />
        <LoadingBlock label="Loading this tenant's properties" rows={6} />
      </Frame>
    );
  }

  // A session with no tenant resolved has no permission set at all (the store only loads
  // permissions once an organization is active), so calling it a refusal would be a lie.
  // The empty state — with the action that fills it — answers this case; §51 follows for a
  // scoped session whose role genuinely lacks the capability.
  if (organizationId === null) {
    return (
      <Frame>
        <PageHeading subtitle={SUBTITLE} />
        <EmptyState
          icon={<Database aria-hidden />}
          title="No organization is active for this session"
          description="A property always belongs to one tenant, and this visit has no tenant resolved. Onboarding
            a tenant is the setup flow's first step; until then the demo estate is the only data available."
          action={
            <Button variant="primary" onClick={() => void claimDemo()}>
              Use the demo estate
            </Button>
          }
        />
      </Frame>
    );
  }

  if (!mayView) {
    return (
      <Frame>
        <PageHeading subtitle={SUBTITLE} />
        <AccessDenied
          capability="view this tenant's properties"
          permission="property.view"
          hint="Sites exist and their data is intact — the grant, not the record, is what is missing."
        />
      </Frame>
    );
  }

  if (loading && rows.length === 0) {
    return (
      <Frame>
        <PageHeading subtitle={SUBTITLE} />
        <LoadingBlock label="Loading this tenant's properties" rows={6} />
      </Frame>
    );
  }

  const summary = summarizeProperties(rows);
  const label = demoLabel(organization?.isDemo);

  return (
    <Frame>
      <PageHeading
        subtitle={SUBTITLE}
        actions={
          mayCreate ? (
            <Button variant="primary" icon={<Plus className="size-4" aria-hidden />} onClick={openCreate}>
              Add property
            </Button>
          ) : null
        }
      />

      {label !== null && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <Badge tone="warning">{label}</Badge>
          These sites belong to a demonstration tenant, not a customer.
        </p>
      )}

      {saved !== null && (
        <p role="status" className="rounded-md border border-line bg-success-soft px-3 py-2 text-xs text-success">
          {saved}
        </p>
      )}

      <Card
        title="Sites"
        description={
          loading
            ? "Reading this tenant's sites."
            : `${summary.total} listed · ${summary.active} trading · ${summary.paused} paused` +
              (showArchived ? ` · ${summary.archived} archived` : "") +
              " — counts cover the rows listed here."
        }
        actions={
          <div className="w-full max-w-[16rem]">
            <Switch
              id="include-archived"
              checked={showArchived}
              onChange={setShowArchived}
              label="Include archived"
              description="Adds retired sites. They are read only when asked for."
            />
          </div>
        }
        padded={false}
      >
        <DataTable<Property>
          caption="Properties of the active organization, ordered by name"
          columns={columns()}
          rows={rows}
          rowKey={(row) => row.id}
          loading={loading}
          empty={
            loadError !== null ? (
              <EmptyState
                icon={<ShieldAlert aria-hidden />}
                title="This list could not be read"
                description={loadError}
                action={
                  <Button icon={<RefreshCw className="size-4" aria-hidden />} onClick={() => void reload(showArchived)}>
                    Try again
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={<MapPin aria-hidden />}
                title={showArchived ? "No sites at all, archived or not" : "No properties yet"}
                description={
                  showArchived
                    ? "Nothing came back even with retired sites included, so this tenant has no site to restore."
                    : "This tenant has no site yet. A property is what reservations, folios and a night audit are all attached to, so it is the first thing to add."
                }
                action={
                  mayCreate ? (
                    <Button variant="primary" icon={<Plus className="size-4" aria-hidden />} onClick={openCreate}>
                      Add the first property
                    </Button>
                  ) : (
                    <p className="text-xs text-muted">
                      Adding a site needs{" "}
                      <span className="font-medium text-ink">property.create</span> — ask an administrator
                      if you need it.
                    </p>
                  )
                }
              />
            )
          }
        />
      </Card>

      {transitionFailure !== null && (
        <p role="status" className="text-xs leading-relaxed text-danger">
          {transitionFailure.message}
          {transitionFailure.reloadRequired && (
            <button
              type="button"
              className="ml-1 font-medium underline"
              onClick={() => void reload(showArchived)}
            >
              Reload this list
            </button>
          )}
        </p>
      )}

      <Card
        title="How a site is identified"
        description="Three columns never change once issued, which is why the sheet stops offering them on an existing site."
      >
        <ul className="flex flex-col gap-2 text-xs leading-relaxed text-muted">
          <li className="flex items-start gap-2">
            <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              <span className="font-medium text-ink">Code and slug</span> are quoted in document numbers,
              imports and URLs. Editing one would silently rewrite what past records mean.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              <span className="font-medium text-ink">Site type</span> is the switch the product branches
              on. A different kind of operation is a new site, not a re-typed one.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <History className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              <span className="font-medium text-ink">Archived sites</span> stay readable and auditable.
              Restoring one is a status transition with a reason, offered on its own row.
            </span>
          </li>
        </ul>
      </Card>

      <Dialog
        open={sheet !== null && draft !== null}
        onClose={closeSheet}
        side="right"
        title={sheet?.mode === "edit" && sheet !== null ? `Edit ${sheet.property.name}` : "Add a property"}
        description={
          sheet?.mode === "edit"
            ? "Timezone, currency and the trading day belong to the site, not the group."
            : "Timezone, currency and locale start from the tenant's values and are the site's own from here on."
        }
        footer={
          <>
            <Button variant="secondary" onClick={closeSheet} disabled={saving}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="property-edit-form"
              icon={saving ? <Spinner size="sm" decorative /> : <Save className="size-4" aria-hidden />}
              disabled={saving}
            >
              {saving ? "Saving…" : sheet?.mode === "edit" ? "Save changes" : "Create property"}
            </Button>
          </>
        }
      >
        {draft !== null && sheet !== null && (
          <form id="property-edit-form" className="flex flex-col gap-4" onSubmit={(event) => void saveDraft(event)}>
            {formFailure !== null && (
              <p role="status" className="rounded-md border border-line bg-danger-soft px-3 py-2 text-xs leading-relaxed text-danger">
                {formFailure.message}
                {formFailure.reloadRequired && sheet.mode === "edit" && (
                  <button
                    type="button"
                    className="ml-1 font-medium underline"
                    onClick={() => void reloadProperty(sheet.property.id)}
                  >
                    Reload this site
                  </button>
                )}
              </p>
            )}

            <Field label="Name" required error={fieldErrors.name} hint="Shown across the product. 2 to 120 characters.">
              <TextInput value={draft.name} onChange={(e) => changeField("name", e.target.value)} invalid={fieldErrors.name !== undefined} />
            </Field>

            {sheet.mode === "edit" ? (
              <Field label="Display name" error={fieldErrors.displayName} hint="Optional shorter name for lists. Clear it to store nothing.">
                <TextInput value={draft.displayName} onChange={(e) => changeField("displayName", e.target.value)} invalid={fieldErrors.displayName !== undefined} />
              </Field>
            ) : (
              <p className="text-xs leading-relaxed text-muted">
                A new site displays the name you give it; a separate display name is set on the site
                afterwards, because the create door takes none.
              </p>
            )}

            {sheet.mode === "create" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Code" required error={fieldErrors.code} hint="Unique inside the tenant, e.g. AMR-DEV. Cannot be changed later.">
                  <TextInput
                    value={draft.code}
                    onChange={(e) => changeField("code", e.target.value.toUpperCase())}
                    maxLength={20}
                    invalid={fieldErrors.code !== undefined}
                  />
                </Field>
                <Field label="URL slug" required error={fieldErrors.slug} hint="Lowercase and hyphenated, unique. Cannot be changed later.">
                  <TextInput
                    value={draft.slug}
                    onChange={(e) => changeField("slug", e.target.value.toLowerCase())}
                    maxLength={60}
                    invalid={fieldErrors.slug !== undefined}
                  />
                </Field>
              </div>
            ) : (
              <div className="rounded-md border border-line bg-surface-sunken px-3 py-2.5">
                <p className="flex items-center gap-2 text-[11px] font-medium tracking-[0.06em] text-muted uppercase">
                  <Lock className="size-3.5" aria-hidden />
                  Issued identifiers
                </p>
                <p className="money-figure mt-1 text-sm font-semibold text-ink">
                  {draft.code} · {draft.slug} · {taxonomyLabel(draft.type)}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Read-only: they appear in document numbers, imports and URLs, and the update door takes
                  no parameter for them.
                </p>
              </div>
            )}

            <Field
              label="Site type"
              required={sheet.mode === "create"}
              error={fieldErrors.type}
              hint="Offered straight from the taxonomy the database accepts. Immutable once issued."
            >
              <SelectInput<PropertyType>
                options={propertyTypeOptions()}
                value={draft.type}
                onChange={(value) => changeField("type", value)}
                placeholder={sheet.mode === "create" ? "Choose a site type" : undefined}
                disabled={sheet.mode === "edit"}
                invalid={fieldErrors.type !== undefined}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Country" required error={fieldErrors.country} hint="Two-letter ISO code.">
                <TextInput
                  value={draft.country}
                  onChange={(e) => changeField("country", e.target.value.toUpperCase())}
                  maxLength={2}
                  invalid={fieldErrors.country !== undefined}
                />
              </Field>
              <Field label="Currency" required error={fieldErrors.currency} hint="Three-letter code. A site may differ from the group.">
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

            <Field
              label="Trading day starts at"
              required={sheet.mode === "edit"}
              error={fieldErrors.businessDayStart}
              hint="The boundary a night audit rolls across, as 24-hour hour:minute."
            >
              <TextInput
                type="time"
                value={draft.businessDayStart}
                onChange={(e) => changeField("businessDayStart", e.target.value)}
                invalid={fieldErrors.businessDayStart !== undefined}
              />
            </Field>

            <div className="border-t border-line pt-4">
              <p className="mb-3 text-[11px] font-semibold tracking-[0.06em] text-muted uppercase">Address</p>
              <div className="flex flex-col gap-4">
                <Field label="Address line 1" error={fieldErrors.addressLine1}>
                  <TextInput value={draft.addressLine1} onChange={(e) => changeField("addressLine1", e.target.value)} invalid={fieldErrors.addressLine1 !== undefined} />
                </Field>
                <Field label="Address line 2" error={fieldErrors.addressLine2}>
                  <TextInput value={draft.addressLine2} onChange={(e) => changeField("addressLine2", e.target.value)} invalid={fieldErrors.addressLine2 !== undefined} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="City" error={fieldErrors.city}>
                    <TextInput value={draft.city} onChange={(e) => changeField("city", e.target.value)} invalid={fieldErrors.city !== undefined} />
                  </Field>
                  <Field label="State" error={fieldErrors.state}>
                    <TextInput value={draft.state} onChange={(e) => changeField("state", e.target.value)} invalid={fieldErrors.state !== undefined} />
                  </Field>
                  <Field label="Postal code" error={fieldErrors.postalCode}>
                    <TextInput value={draft.postalCode} onChange={(e) => changeField("postalCode", e.target.value)} invalid={fieldErrors.postalCode !== undefined} />
                  </Field>
                </div>
              </div>
            </div>

            <div className="border-t border-line pt-4">
              <p className="mb-3 text-[11px] font-semibold tracking-[0.06em] text-muted uppercase">Contact</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Phone" error={fieldErrors.phone}>
                  <TextInput value={draft.phone} onChange={(e) => changeField("phone", e.target.value)} invalid={fieldErrors.phone !== undefined} />
                </Field>
                <Field label="Email" error={fieldErrors.email}>
                  <TextInput type="email" value={draft.email} onChange={(e) => changeField("email", e.target.value)} invalid={fieldErrors.email !== undefined} />
                </Field>
              </div>
            </div>
          </form>
        )}
      </Dialog>

      <ArchiveDialog
        open={archiveTarget !== null}
        onClose={() => setArchiveTarget(null)}
        onConfirm={(reason) => {
          const target = archiveTarget;
          if (target === null) return;
          const choice = siteStatusChoices(target.status).find((item) => item.status === "ARCHIVED");
          if (choice !== undefined) void applyStatus(target, choice, reason);
        }}
        entityName={archiveTarget?.name ?? ""}
        entityLabel="property"
        consequences={[
          "It no longer appears in active lists, pickers or the context switcher.",
          "Its reservations, folios and audit history are preserved.",
          "It can be restored from the archived list with a recorded reason.",
        ]}
        loading={transitionBusy}
      />

      {statusTarget !== null && (
        <StatusReasonDialog
          choice={statusTarget.choice}
          entityName={statusTarget.property.name}
          busy={transitionBusy}
          onClose={() => setStatusTarget(null)}
          onConfirm={(reason) => void applyStatus(statusTarget.property, statusTarget.choice, reason)}
        />
      )}
    </Frame>
  );
}

/* --------------------------------------------------------------- local pieces */

function Frame({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex max-w-6xl flex-col gap-4 pb-8">{children}</div>;
}

/**
 * One row's affordances, extracted so the retired-site rules can be asserted from
 * markup rather than from a click that cannot happen in this suite: an archived row gets
 * a restore and nothing else, an editable row never gets an editor, and the words
 * "delete" or "remove" appear nowhere.
 */
export function PropertyRowActions({
  property,
  mayEdit,
  mayArchive,
  currentPropertyId,
  busy = false,
  onWorkHere,
  onEdit,
  onArchive,
  onTransition,
}: {
  property: Property;
  mayEdit: boolean;
  mayArchive: boolean;
  currentPropertyId: string | null;
  busy?: boolean;
  onWorkHere: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onTransition: (choice: SiteStatusChoice) => void;
}) {
  const work = workHereState(property, currentPropertyId);
  const transitions = siteStatusChoices(property.status);
  const archived = property.status === "ARCHIVED";

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <Button
        size="sm"
        variant="ghost"
        icon={<Building2 className="size-4" aria-hidden />}
        disabled={!work.enabled || busy}
        onClick={onWorkHere}
      >
        {work.label}
      </Button>

      {mayEdit && !archived && (
        <Button size="sm" variant="secondary" icon={<Pencil className="size-4" aria-hidden />} onClick={onEdit}>
          Edit
        </Button>
      )}

      {mayArchive &&
        transitions
          .filter((choice) => choice.status === "ARCHIVED")
          .map((choice) => (
            <Button
              key={`${property.id}-archive`}
              size="sm"
              variant="danger"
              icon={<Archive className="size-4" aria-hidden />}
              onClick={onArchive}
            >
              {choice.label}
            </Button>
          ))}

      {mayArchive &&
        transitions
          .filter((choice) => choice.status !== "ARCHIVED")
          .map((choice) => (
            <Button
              key={`${property.id}-${choice.status}`}
              size="sm"
              variant="secondary"
              icon={
                archived ? (
                  <ArchiveRestore className="size-4" aria-hidden />
                ) : choice.status === "ACTIVE" ? (
                  <Play className="size-4" aria-hidden />
                ) : (
                  <Pause className="size-4" aria-hidden />
                )
              }
              onClick={() => onTransition(choice)}
            >
              {choice.label}
            </Button>
          ))}
    </div>
  );
}

function PageHeading({
  subtitle,
  actions,
}: {
  subtitle: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
          <MapPin className="size-3.5" aria-hidden />
          Administration
        </p>
        <h2 className="mt-1 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          Properties
        </h2>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
      </div>
      {actions !== null && actions !== undefined && <div className="flex shrink-0 gap-2">{actions}</div>}
    </header>
  );
}

/**
 * The honest "no data plane / no session" states — an explanation, not a spinner that
 * will never resolve.
 */
function SessionState({ unconfigured, message }: { unconfigured: boolean; message: string | null }) {
  return (
    <EmptyState
      icon={<Database aria-hidden />}
      title={unconfigured ? "No backend configured" : "Not signed in"}
      description={
        message ??
        (unconfigured
          ? "This build has no Supabase project behind it, so there are no sites to list. Set the project URL and publishable key, then reload."
          : "This visit has no session the server will act on, so no tenant data is available. Sign in again to load the properties you have access to.")
      }
    />
  );
}

/**
 * A reason-bearing status transition that is not an archive. It reuses
 * `archiveActionState`, so the mandatory-reason gate is written once for the product.
 */
function StatusReasonDialog({
  choice,
  entityName,
  busy,
  onClose,
  onConfirm,
}: {
  choice: SiteStatusChoice;
  entityName: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const gate = archiveActionState(reason, entityName);

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
            disabled={!gate.canConfirm || busy}
            onClick={() => onConfirm(gate.normalizedReason)}
          >
            {busy ? "Working…" : choice.label}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Reason" required hint="Written into the audit entry. The door refuses this change without it.">
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Closed for renovation; reactivating in Q3."
            disabled={busy}
          />
        </Field>
        {!gate.canConfirm && (
          <p role="status" className="text-xs text-muted">
            A reason is required before this can be confirmed.
          </p>
        )}
      </div>
    </Dialog>
  );
}
