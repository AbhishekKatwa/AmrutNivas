/**
 * The first-run path after sign-in.
 *
 * Two realities, both inherited from the database rather than chosen here:
 *
 *   - Until Prompt #03 ships real authentication and invitation email, the ONLY way a
 *     session obtains a tenant is `claim_demo_organization()`. That door refuses anyone
 *     who already belongs to an organization (`NIVAAS_ALREADY_HAS_ORGANIZATION`), so it
 *     is a one-shot path, and the estate it hands back is flagged `isDemo` — which this
 *     screen must label visibly (§60/§61: demo data never looks like a customer's).
 *   - Building a real tenant is a sequence of write doors: `create_organization` →
 *     `create_property` → `create_outlet` → optionally `create_department`, then
 *     `inviteMember` for a colleague, ending with `switchContext` so the app lands inside
 *     what was just made.
 *
 * Because every completed step commits real rows immediately through its door, a
 * half-finished wizard leaves a real organization behind and can be resumed — the copy
 * says so rather than pretending the steps are drafts. `Back` never discards entered
 * data or the rows already written.
 *
 * The step machine, the shown-once token rule and the door-error → field mapping are
 * exported pure functions so they are tested directly; the render is a static snapshot
 * and nothing here is clickable in that snapshot.
 */

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  Check,
  Sparkles,
} from "lucide-react";
import { useAccessReason, type AccessReason } from "@/components/ui/AccessDenied";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { SelectInput } from "@/components/ui/SelectInput";
import { TextInput } from "@/components/ui/TextInput";
import { BUSINESS_TYPES, OUTLET_TYPES, PROPERTY_TYPES } from "@/domain/identity/types";
import type {
  BusinessType,
  Department,
  IssuedInvitation,
  Organization,
  Outlet,
  OutletType,
  Permission,
  Property,
  PropertyType,
  Role,
} from "@/domain/identity/types";
import {
  createDepartment,
  type NewDepartment,
} from "@/domain/hierarchy/department-service";
import { createOrganization, type NewOrganization } from "@/domain/hierarchy/organization-service";
import { createOutlet, type NewOutlet } from "@/domain/hierarchy/outlet-service";
import { createProperty, type NewProperty } from "@/domain/hierarchy/property-service";
import { inviteMember, type InviteMemberInput } from "@/domain/access/people-service";
import { listRoles } from "@/domain/access/role-service";
import { claimDemoEstate } from "@/domain/access/session-service";
import { useContextStore } from "@/state/context-store";
import { tokenOf } from "@/db/door-errors";
import { publicErrorMessage } from "@/lib/errors";

/* --------------------------------------------------------------- step machine */

export type WizardPath = "demo" | "create";

export type OnboardingStep =
  | "path"
  | "demo"
  | "organization"
  | "property"
  | "outlet"
  | "department"
  | "invite"
  | "done";

/** The ordered content steps for each path, not including the opening `path` choice. */
export const CREATE_ORDER: readonly OnboardingStep[] = [
  "organization",
  "property",
  "outlet",
  "department",
  "invite",
  "done",
];
export const DEMO_ORDER: readonly OnboardingStep[] = ["demo", "done"];

/**
 * The wizard's machine state. The written rows live here — not in the field drafts — so
 * `Back` cannot lose progress and a refresh mid-way can resume against real records.
 */
export type WizardState = {
  step: OnboardingStep;
  path: WizardPath | null;
  organization: Organization | null;
  property: Property | null;
  outlet: Outlet | null;
  department: Department | null;
  invitation: IssuedInvitation | null;
  blocked: string | null;
};

export function initialWizardState(): WizardState {
  return {
    step: "path",
    path: null,
    organization: null,
    property: null,
    outlet: null,
    department: null,
    invitation: null,
    blocked: null,
  };
}

/** Content steps for the chosen path; none before a path is chosen. */
export function stepsForPath(path: WizardPath | null): readonly OnboardingStep[] {
  if (path === "create") return CREATE_ORDER;
  if (path === "demo") return DEMO_ORDER;
  return [];
}

/** Which steps are reachable: the opening choice plus that path's ordered content steps. */
export function reachableSteps(path: WizardPath | null): readonly OnboardingStep[] {
  return path === null ? ["path"] : ["path", ...stepsForPath(path)];
}

/** Pick a path and land on its first content step. */
export function choosePath(state: WizardState, path: WizardPath): WizardState {
  const first = stepsForPath(path)[0] ?? "done";
  return { ...state, path, step: first, blocked: null };
}

/**
 * Move forward unless the caller reports the step as blocked.
 *
 * A blocked advance does NOT change the step — it only records why — so the operator
 * stays where the input lives; a clear advance walks one step down the path's order and
 * stops at the terminal step.
 */
export function advance(state: WizardState, blocked: boolean, reason?: string): WizardState {
  if (blocked) {
    return { ...state, blocked: reason ?? "Complete this step before continuing." };
  }
  const steps = stepsForPath(state.path);
  const index = steps.indexOf(state.step);
  const next = index >= 0 && index < steps.length - 1 ? steps[index + 1] : state.step;
  return { ...state, step: next, blocked: null };
}

/**
 * Walk back one step, preserving every entered draft and every row already written.
 *
 * From the first content step this returns to the path choice; from the path choice it is
 * a no-op, because there is nothing before it to lose. The written rows are never cleared
 * here — they are committed database records, not scratch data.
 */
export function goBack(state: WizardState): WizardState {
  if (state.step === "path") return state;
  const steps = stepsForPath(state.path);
  const index = steps.indexOf(state.step);
  const prev: OnboardingStep = index <= 0 ? "path" : steps[index - 1];
  return { ...state, step: prev, blocked: null };
}

/* ------------------------------------------------------------- token-shown-once */

/**
 * The invite token, surfaced only on the invite step while that step's result holds it.
 *
 * `invite_member` stores only the token's digest and returns the plaintext once, so this
 * gate is the client half of that promise: navigating away returns null and nothing here
 * writes the token to storage, a cache or a console line.
 */
export function currentInviteToken(state: WizardState): string | null {
  if (state.step !== "invite") return null;
  const token = state.invitation?.token;
  return typeof token === "string" && token.length > 0 ? token : null;
}

/* ------------------------------------------------- door-error → field mapping */

const FIELD_BY_TOKEN: Record<string, string> = {
  NIVAAS_INVALID_CODE: "code",
  NIVAAS_ORGANIZATION_TAKEN: "code",
  NIVAAS_PROPERTY_TAKEN: "code",
  NIVAAS_OUTLET_TAKEN: "code",
  NIVAAS_DEPARTMENT_TAKEN: "code",
  NIVAAS_INVALID_SLUG: "slug",
  NIVAAS_INVALID_NAME: "name",
  NIVAAS_INVALID_EMAIL: "email",
  NIVAAS_EMPTY_SELECTION: "role",
  NIVAAS_INVALID_COUNTRY: "country",
  NIVAAS_INVALID_CURRENCY: "currency",
  NIVAAS_INVALID_TIMEZONE: "timezone",
  NIVAAS_INVALID_LOCALE: "locale",
  NIVAAS_INVALID_PROPERTY_TYPE: "type",
  NIVAAS_INVALID_OUTLET_TYPE: "type",
};

/**
 * Which form field a door refusal points at, when it points at one at all.
 *
 * A `VALIDATION_FAILED`/`CONFLICT` about a code or slug must land the error message on
 * the field that failed rather than a generic banner, so the operator can correct it. The
 * token is read off the normalised `AppError` (see `db/door-errors`), never off the raw
 * database string.
 */
export function fieldForDoorError(error: unknown): string | null {
  const token = tokenOf(error);
  return token === null ? null : FIELD_BY_TOKEN[token] ?? null;
}

/* --------------------------------------------------------------- presentational */

/**
 * The claim/create outcome, labelled honestly.
 *
 * Extracted so the `isDemo` label is directly renderable and assertable: a claimed demo
 * estate must visibly read as demo data (§60/§61), while a real tenant's row must not
 * carry that badge.
 */
export function ClaimedEstateSummary({ organization }: { organization: Organization }) {
  return (
    <Card title="Estate ready" description="This tenant now exists in the database.">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-ink">{organization.name}</p>
        <span className="font-mono text-xs text-muted">{organization.code}</span>
        {organization.isDemo && <Badge tone="warning">Demo data</Badge>}
      </div>
    </Card>
  );
}

function StepIndicator({ state }: { state: WizardState }) {
  const steps = reachableSteps(state.path);
  const currentIndex = steps.indexOf(state.step);
  return (
    <ol className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] uppercase tracking-[0.06em] text-muted">
      {steps.map((step, index) => {
        const reached = index <= currentIndex;
        return (
          <li
            key={step}
            className={reached ? "font-semibold text-brand-700" : undefined}
            aria-current={step === state.step ? "step" : undefined}
          >
            {step.replace(/_/g, " ")}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The three causes of a disabled step that are not a role. Naming `permission` for
 * any of them would report a server refusal that never happened, so only a loaded
 * permission set earns the "ask an administrator" wording.
 */
const NOTE_FOR_REASON: Record<Exclude<AccessReason, "role">, string> = {
  "no-organization":
    "This step needs an organization selected before any role can be checked, so nothing has been refused yet.",
  "no-session":
    "This step needs a signed-in session to save into, and there is none. Nothing has been refused — no role has been read.",
  "no-data-plane":
    "This build has no Supabase project connected, so there is no tenant to save into and no role to check against.",
  resolving:
    "Your session is still loading, so this step cannot say yet whether your role covers it.",
};

export function CapabilityNote({ permission }: { permission: Permission }) {
  const reason = useAccessReason();
  if (reason !== "role") {
    return (
      <p className="mt-2 text-xs leading-relaxed text-warning">{NOTE_FOR_REASON[reason]}</p>
    );
  }
  return (
    <p className="mt-2 text-xs leading-relaxed text-warning">
      Your role is missing <span className="font-mono">{permission}</span>. You can still see this
      step, but saving here will be refused by the server until an administrator grants it.
    </p>
  );
}

/* --------------------------------------------------------------------- fields */

type OrgDraft = {
  name: string;
  code: string;
  slug: string;
  country: string;
  currency: string;
  timezone: string;
  locale: string;
  legalName: string;
  phone: string;
  email: string;
  businessTypes: BusinessType[];
};
type SiteDraft = {
  name: string;
  code: string;
  slug: string;
  type: string;
  country: string;
  currency: string;
  timezone: string;
  locale: string;
  businessDayStart: string;
  addressLine1: string;
  city: string;
};
type InviteDraft = { email: string; fullName: string; role: string; phone: string };

const EMPTY_ORG: OrgDraft = {
  name: "",
  code: "",
  slug: "",
  country: "IN",
  currency: "INR",
  timezone: "Asia/Kolkata",
  locale: "en-IN",
  legalName: "",
  phone: "",
  email: "",
  businessTypes: [],
};

function blankSite(org: OrgDraft): SiteDraft {
  return {
    name: "",
    code: "",
    slug: "",
    type: "",
    country: org.country,
    currency: org.currency,
    timezone: org.timezone,
    locale: org.locale,
    businessDayStart: "04:00",
    addressLine1: "",
    city: "",
  };
}

/* ------------------------------------------------------------------------ page */

/**
 * The capability each step's door asks for, so a step can say so before a write is
 * refused. `organization` is deliberately absent: `create_organization` guards on
 * `app.require_session()` alone and self-assigns ORG_OWNER, because a tenant with no
 * owner is an orphan nothing can administer. Gating that step on a permission would
 * mean inventing a capability the RBAC seed does not hold — and a button no
 * administrator could ever enable.
 */
const STEP_PERMISSION: Partial<Record<OnboardingStep, Permission>> = {
  property: "property.create",
  outlet: "outlet.create",
  department: "department.create",
  invite: "user.invite",
};

/** Null means the step's door is satisfied by a session alone. */
export function stepPermissionFor(step: OnboardingStep): Permission | null {
  return STEP_PERMISSION[step] ?? null;
}

export default function OnboardingWizard() {
  const status = useContextStore((s) => s.status);
  const can = useContextStore((s) => s.can);
  const switchContext = useContextStore((s) => s.switchContext);

  const [state, setState] = useState<WizardState>(initialWizardState);
  const [org, setOrg] = useState<OrgDraft>(EMPTY_ORG);
  const [site, setSite] = useState<SiteDraft>(blankSite(EMPTY_ORG));
  const [outlet, setOutlet] = useState<SiteDraft>(blankSite(EMPTY_ORG));
  const [department, setDepartment] = useState<{ name: string; code: string; slug: string }>({
    name: "",
    code: "",
    slug: "",
  });
  const [invite, setInvite] = useState<InviteDraft>({ email: "", fullName: "", role: "", phone: "" });
  const [roles, setRoles] = useState<Role[]>([]);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tokenVisible, setTokenVisible] = useState(false);

  useEffect(() => {
    const context = useContextStore.getState();
    if (context.status === "idle") void context.bootstrap();
  }, []);

  useEffect(() => {
    if (state.step !== "invite" || status === "unconfigured") return;
    let active = true;
    listRoles()
      .then((found) => {
        if (active) setRoles(found);
      })
      .catch(() => {
        if (active) setRoles([]);
      });
    return () => {
      active = false;
    };
  }, [state.step, status]);

  const permission = stepPermissionFor(state.step);
  const allowed = permission === null ? true : can(permission);

  // Run one door: throw surfaces its message (and the field it names), success advances.
  async function runDoor<T>(call: () => Promise<T>, onOk: (row: T) => void) {
    setBusy(true);
    setError(null);
    setFieldError(null);
    try {
      const row = await call();
      onOk(row);
      setState((previous) => advance(previous, false));
    } catch (err) {
      setError(publicErrorMessage(err));
      const field = fieldForDoorError(err);
      setFieldError(field);
      // Keep the machine honest: a refused step does not advance.
      setState((previous) => advance(previous, true, publicErrorMessage(err)));
    } finally {
      setBusy(false);
    }
  }

  function claimDemo() {
    void runDoor(claimDemoEstate, (organization) => {
      setState((previous) => ({ ...previous, organization }));
    });
  }

  function submitOrganization() {
    const blocked = requiredMissing([
      ["name", org.name],
      ["code", org.code],
      ["slug", org.slug],
      ["country", org.country],
      ["currency", org.currency],
      ["timezone", org.timezone],
      ["locale", org.locale],
    ]);
    if (blocked !== null) {
      setError(`Fill in: ${blocked.join(", ")}.`);
      setFieldError(blocked[0] ?? null);
      setState((previous) => advance(previous, true, "Required fields are missing."));
      return;
    }
    const input: NewOrganization = {
      name: org.name,
      code: org.code,
      slug: org.slug,
      country: org.country,
      currency: org.currency,
      timezone: org.timezone,
      locale: org.locale,
      businessTypes: org.businessTypes.length > 0 ? org.businessTypes : undefined,
      legalName: org.legalName || undefined,
      phone: org.phone || undefined,
      email: org.email || undefined,
      // A real tenant is never demo: only the seed path may carry that label.
      isDemo: false,
    };
    void runDoor(() => createOrganization(input), (organization) => {
      setState((previous) => ({ ...previous, organization }));
      setSite(blankSite(org));
    });
  }

  function submitProperty() {
    if (state.organization === null) return;
    const input: NewProperty = {
      organizationId: state.organization.id,
      name: site.name,
      code: site.code,
      slug: site.slug,
      type: site.type as PropertyType,
      country: site.country,
      currency: site.currency,
      timezone: site.timezone,
      locale: site.locale,
      businessDayStart: site.businessDayStart || undefined,
      addressLine1: site.addressLine1 || undefined,
      city: site.city || undefined,
    };
    void runDoor(() => createProperty(input), (property) =>
      setState((previous) => ({ ...previous, property })),
    );
  }

  function submitOutlet() {
    if (state.property === null) return;
    const input: NewOutlet = {
      propertyId: state.property.id,
      name: outlet.name,
      code: outlet.code,
      slug: outlet.slug,
      type: outlet.type as OutletType,
    };
    void runDoor(() => createOutlet(input), (created) =>
      setState((previous) => ({ ...previous, outlet: created })),
    );
  }

  function submitDepartment(skip: boolean) {
    if (skip) {
      setError(null);
      setFieldError(null);
      setState((previous) => advance(previous, false));
      return;
    }
    if (state.property === null) return;
    const input: NewDepartment = {
      propertyId: state.property.id,
      name: department.name,
      code: department.code,
      slug: department.slug,
      outletId: state.outlet?.id ?? null,
    };
    void runDoor(() => createDepartment(input), (created) =>
      setState((previous) => ({ ...previous, department: created })),
    );
  }

  function submitInvite() {
    if (state.organization === null || invite.role === "") {
      setError(invite.role === "" ? "Choose a role to invite." : "No organization to invite into.");
      setState((previous) => advance(previous, true, "Choose a role to invite."));
      return;
    }
    const role = roles.find((candidate) => candidate.name === invite.role);
    const input: InviteMemberInput = {
      organizationId: state.organization.id,
      email: invite.email,
      role: invite.role,
      fullName: invite.fullName || undefined,
      phone: invite.phone || undefined,
      propertyIds: role?.scopeLevel === "PROPERTY" && state.property ? [state.property.id] : undefined,
      outletIds: role?.scopeLevel === "OUTLET" && state.outlet ? [state.outlet.id] : undefined,
    };
    void runDoor(() => inviteMember(input), (issued) => {
      setState((previous) => ({ ...previous, invitation: issued }));
      setTokenVisible(true);
    });
  }

  function finish() {
    setError(null);
    void switchContext({
      organizationId: state.organization?.id ?? null,
      propertyId: state.property?.id ?? null,
      outletId: state.outlet?.id ?? null,
    });
  }

  const token = useMemo(() => currentInviteToken(state), [state]);

  if (status === "unconfigured") {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <Header />
        <UnconfiguredNotice />
      </div>
    );
  }

  return (
    <div className="mx-auto flex flex-col gap-4 sm:gap-6">
      <Header />
      <Card>
        <StepIndicator state={state} />
      </Card>

      {error !== null && (
        <div role="status" className="rounded-md border border-danger bg-danger-soft px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      {state.step === "path" && <PathStep onChoose={(path) => setState((p) => choosePath(p, path))} />}

      {state.step === "demo" && (
        <Card title="Claim the demo estate" description="A seeded, fully-labelled sample hospitality estate.">
          <p className="text-xs leading-relaxed text-muted">
            This is the only way a session gets a tenant until Prompt #03 ships real authentication and
            invitation email. The door refuses anyone who already belongs to an organization, so it is a
            one-time path — and everything it creates is flagged as demo data.
          </p>
          {busy ? (
            <p className="mt-3 text-xs text-muted">Claiming…</p>
          ) : (
            <Button variant="primary" className="mt-3" onClick={claimDemo} icon={<Sparkles className="size-4" aria-hidden />}>
              Claim demo estate
            </Button>
          )}
          <StepNav onBack={() => setState(goBack)} />
        </Card>
      )}

      {state.step === "organization" && (
        <Card title="Create your organization" description="The legal operator and the tenant boundary.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" required error={fieldError === "name" ? error : undefined}>
              <TextInput value={org.name} onChange={(e) => setOrg({ ...org, name: e.target.value })} />
            </Field>
            <Field label="Code" required error={fieldError === "code" ? error : undefined} hint="Letters, digits and hyphens.">
              <TextInput value={org.code} onChange={(e) => setOrg({ ...org, code: e.target.value })} />
            </Field>
            <Field label="Slug" required error={fieldError === "slug" ? error : undefined}>
              <TextInput value={org.slug} onChange={(e) => setOrg({ ...org, slug: e.target.value })} />
            </Field>
            <Field label="Country" required error={fieldError === "country" ? error : undefined}>
              <TextInput value={org.country} onChange={(e) => setOrg({ ...org, country: e.target.value })} />
            </Field>
            <Field label="Currency" required error={fieldError === "currency" ? error : undefined}>
              <TextInput value={org.currency} onChange={(e) => setOrg({ ...org, currency: e.target.value })} />
            </Field>
            <Field label="Timezone" required error={fieldError === "timezone" ? error : undefined}>
              <TextInput value={org.timezone} onChange={(e) => setOrg({ ...org, timezone: e.target.value })} />
            </Field>
            <Field label="Locale" required error={fieldError === "locale" ? error : undefined}>
              <TextInput value={org.locale} onChange={(e) => setOrg({ ...org, locale: e.target.value })} />
            </Field>
            <Field label="Legal name" hint="Optional — leave blank to keep it unset.">
              <TextInput value={org.legalName} onChange={(e) => setOrg({ ...org, legalName: e.target.value })} />
            </Field>
          </div>

          <p className="mt-4 mb-2 text-[11px] uppercase tracking-[0.06em] text-muted">Business types</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {BUSINESS_TYPES.map((type) => (
              <Checkbox
                key={type}
                label={type.replace(/_/g, " ")}
                checked={org.businessTypes.includes(type)}
                onChange={(checked) =>
                  setOrg({
                    ...org,
                    businessTypes: checked
                      ? [...org.businessTypes, type]
                      : org.businessTypes.filter((t) => t !== type),
                  })
                }
              />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button variant="primary" disabled={busy || !allowed} onClick={submitOrganization}>
              {busy ? "Saving…" : "Create organization"}
            </Button>
            <StepNav onBack={() => setState(goBack)} />
          </div>
        </Card>
      )}

      {state.step === "property" && state.organization !== null && (
        <Card title="Add your first property" description="A physical site a guest can be booked into.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" required error={fieldError === "name" ? error : undefined}>
              <TextInput value={site.name} onChange={(e) => setSite({ ...site, name: e.target.value })} />
            </Field>
            <Field label="Code" required error={fieldError === "code" ? error : undefined}>
              <TextInput value={site.code} onChange={(e) => setSite({ ...site, code: e.target.value })} />
            </Field>
            <Field label="Slug" required error={fieldError === "slug" ? error : undefined}>
              <TextInput value={site.slug} onChange={(e) => setSite({ ...site, slug: e.target.value })} />
            </Field>
            <Field label="Type" required error={fieldError === "type" ? error : undefined}>
              <SelectInput
                value={site.type as PropertyType | ""}
                placeholder="Choose a type"
                options={PROPERTY_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, " ") }))}
                onChange={(value) => setSite({ ...site, type: value })}
              />
            </Field>
            <Field label="Business day start" hint="The boundary a night audit rolls across.">
              <TextInput
                type="time"
                value={site.businessDayStart}
                onChange={(e) => setSite({ ...site, businessDayStart: e.target.value })}
              />
            </Field>
            <Field label="Address">
              <TextInput value={site.addressLine1} onChange={(e) => setSite({ ...site, addressLine1: e.target.value })} />
            </Field>
          </div>
          {!allowed && permission !== null && <CapabilityNote permission={permission} />}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button variant="primary" disabled={busy || !allowed} onClick={submitProperty}>
              {busy ? "Saving…" : "Create property"}
            </Button>
            <StepNav onBack={() => setState(goBack)} />
          </div>
        </Card>
      )}

      {state.step === "outlet" && state.property !== null && (
        <Card title="Add an outlet" description="A separately-run revenue point inside the property.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" required error={fieldError === "name" ? error : undefined}>
              <TextInput value={outlet.name} onChange={(e) => setOutlet({ ...outlet, name: e.target.value })} />
            </Field>
            <Field label="Code" required error={fieldError === "code" ? error : undefined}>
              <TextInput value={outlet.code} onChange={(e) => setOutlet({ ...outlet, code: e.target.value })} />
            </Field>
            <Field label="Slug" required error={fieldError === "slug" ? error : undefined}>
              <TextInput value={outlet.slug} onChange={(e) => setOutlet({ ...outlet, slug: e.target.value })} />
            </Field>
            <Field label="Type" required error={fieldError === "type" ? error : undefined}>
              <SelectInput
                value={outlet.type as OutletType | ""}
                placeholder="Choose a type"
                options={OUTLET_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, " ") }))}
                onChange={(value) => setOutlet({ ...outlet, type: value })}
              />
            </Field>
          </div>
          {!allowed && permission !== null && <CapabilityNote permission={permission} />}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button variant="primary" disabled={busy || !allowed} onClick={submitOutlet}>
              {busy ? "Saving…" : "Create outlet"}
            </Button>
            <StepNav onBack={() => setState(goBack)} />
          </div>
        </Card>
      )}

      {state.step === "department" && (
        <Card title="Add a department (optional)" description="A cost and ownership centre. You can skip this.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <TextInput value={department.name} onChange={(e) => setDepartment({ ...department, name: e.target.value })} />
            </Field>
            <Field label="Code">
              <TextInput value={department.code} onChange={(e) => setDepartment({ ...department, code: e.target.value })} />
            </Field>
            <Field label="Slug">
              <TextInput value={department.slug} onChange={(e) => setDepartment({ ...department, slug: e.target.value })} />
            </Field>
          </div>
          {!allowed && permission !== null && <CapabilityNote permission={permission} />}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button variant="primary" disabled={busy || !allowed} onClick={() => submitDepartment(false)}>
              {busy ? "Saving…" : "Create department"}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => submitDepartment(true)}>
              Skip
            </Button>
            <StepNav onBack={() => setState(goBack)} />
          </div>
        </Card>
      )}

      {state.step === "invite" && (
        <Card title="Invite a colleague" description="One accept link, shown once.">
          {token !== null && tokenVisible ? (
            <div className="flex flex-col gap-2 rounded-md border border-line bg-surface-sunken px-3 py-3">
              <p className="text-xs font-medium text-ink">Copy this invitation link now.</p>
              <code className="break-all font-mono text-[11px] text-brand-700">
                https://app.nivaas/accept?token={token}
              </code>
              <p className="text-[11px] leading-relaxed text-muted">
                This token is shown once and is never stored — the door keeps only its digest. Automated email
                delivery arrives in Prompt #03; for now send the link yourself.
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Email" required error={fieldError === "email" ? error : undefined}>
                  <TextInput value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
                </Field>
                <Field label="Full name">
                  <TextInput value={invite.fullName} onChange={(e) => setInvite({ ...invite, fullName: e.target.value })} />
                </Field>
                <Field label="Role" required error={fieldError === "role" ? error : undefined}>
                  <SelectInput
                    value={invite.role}
                    placeholder={roles.length === 0 ? "Loading roles…" : "Choose a role"}
                    disabled={roles.length === 0}
                    options={roles.map((r) => ({ value: r.name, label: r.displayName }))}
                    onChange={(value) => setInvite({ ...invite, role: value })}
                  />
                </Field>
                <Field label="Phone">
                  <TextInput value={invite.phone} onChange={(e) => setInvite({ ...invite, phone: e.target.value })} />
                </Field>
              </div>
              {!allowed && permission !== null && <CapabilityNote permission={permission} />}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button variant="primary" disabled={busy || !allowed} onClick={submitInvite}>
                  {busy ? "Sending…" : "Send invitation"}
                </Button>
                <StepNav onBack={() => setState(goBack)} />
              </div>
            </>
          )}
        </Card>
      )}

      {state.step === "done" && (
        <Card title="You're set up" description="The app now points at the estate you just created.">
          {state.organization !== null && <ClaimedEstateSummary organization={state.organization} />}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              disabled={busy || state.organization === null}
              onClick={finish}
              icon={<Check className="size-4" aria-hidden />}
            >
              Enter the estate
            </Button>
            <StepNav onBack={() => setState(goBack)} />
          </div>
        </Card>
      )}
    </div>
  );
}

/**
 * The no-backend explanation, worded the way `FoundationStatusPage` words it: a preview
 * build ships without a Supabase project, so this is a deployment state to explain, not a
 * spinner to sit under. Extracted so it is directly renderable and assertable — the store's
 * `unconfigured` status cannot be forced into a static server render, so the notice is
 * proven here while the reactive branch keeps driving it in the live app.
 */
export function UnconfiguredNotice() {
  return (
    <EmptyState
      icon={<Sparkles aria-hidden />}
      title="No backend configured"
      description="This build has no Supabase project, so the onboarding doors cannot run. Nothing here is
        waiting on you — connect a project and the same steps will create real records."
    />
  );
}

function Header() {
  return (
    <header>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">Get started</h2>
      </div>
      <p className="mt-1 text-sm text-muted">
        Every step writes a real record the moment you save it. A part-finished wizard leaves a real
        organization behind, so you can stop and resume where you left off.
      </p>
    </header>
  );
}

function PathStep({ onChoose }: { onChoose: (path: WizardPath) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Card title="Explore the demo estate" description="A seeded hospitality tenant, clearly labelled as demo.">
        <p className="text-xs leading-relaxed text-muted">
          Fastest way to see the product working. Available only if this account does not already belong
          to an organization — the server enforces that.
        </p>
        <Button
          variant="secondary"
          className="mt-3"
          onClick={() => onChoose("demo")}
          icon={<Sparkles className="size-4" aria-hidden />}
        >
          Claim the demo estate to explore
        </Button>
      </Card>

      <Card title="Create your organization" description="Build your real tenant, one door at a time.">
        <p className="text-xs leading-relaxed text-muted">
          Organization, then a property, an outlet, optional departments, and your first colleague.
        </p>
        <Button
          variant="primary"
          className="mt-3"
          onClick={() => onChoose("create")}
          icon={<Building2 className="size-4" aria-hidden />}
        >
          Create your organization
        </Button>
      </Card>
    </div>
  );
}

function StepNav({ onBack }: { onBack: () => void }) {
  return (
    <Button variant="ghost" size="sm" onClick={onBack} icon={<ArrowLeft className="size-4" aria-hidden />}>
      Back
    </Button>
  );
}

/** Returns the labels of required fields that are still empty; null means none are missing. */
function requiredMissing(entries: readonly (readonly [string, string])[]): string[] | null {
  const missing = entries.filter(([, value]) => value.trim() === "").map(([label]) => label);
  return missing.length === 0 ? null : missing;
}
