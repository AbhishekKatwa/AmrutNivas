/**
 * The tenant level: Organization.
 *
 * This is the only level a caller cannot scope by an ancestor — an organization IS
 * the ancestor, so RLS (003) is what decides which rows come back. Every write here
 * goes through a 005 door because `authenticated` holds SELECT only; a `.update()`
 * on this table would be refused by the grant, not by policy.
 *
 * Archive is a status, never a delete (§40/§41). So the default list excludes
 * `ARCHIVED` rows — they would clutter every picker — while an explicit opt-in keeps
 * them reachable, because a retired tenant's history must still be auditable.
 */

import { requireSupabase } from "@/db/client";
import { asRead, camelRows, callDoorRow, firstCamelRow } from "@/db/rpc";
import type {
  BusinessType,
  EntityId,
  Organization,
  OrganizationStatus,
} from "@/domain/identity/types";

const TABLE = "organizations";
const ARCHIVED = "ARCHIVED";

/** The columns the domain type owns. `created_by` is read but not surfaced. */
const COLUMNS =
  "id, name, legal_name, display_name, code, slug, business_types, status, country, " +
  "currency, timezone, locale, tax_region, phone, email, website, logo_url, is_demo, " +
  "version, created_at, updated_at, archived_at";

/** A row as it arrives from the funnel: camelCase, plus the audit column. */
type OrganizationRecord = Organization & { createdBy?: EntityId };

function toOrganization(row: OrganizationRecord): Organization {
  const { createdBy: _unused, ...organization } = row;
  return organization;
}

/** `{ includeArchived: true }` opts a retired row back into the read. */
export type ArchivedRead = {
  includeArchived?: boolean;
};

/** Step 1 of onboarding (§31/§75): the door also makes the creator the OWNER. */
export type NewOrganization = {
  name: string;
  /** `^[A-Z0-9][A-Z0-9-]{1,11}$` — the door refuses anything else. */
  code: string;
  slug: string;
  country: string;
  currency: string;
  timezone: string;
  locale: string;
  /** Omitted means the door's own default, an empty list — never `null`, which the
   *  NOT NULL column would reject. */
  businessTypes?: BusinessType[];
  legalName?: string | null;
  taxRegion?: string | null;
  phone?: string | null;
  email?: string | null;
  /** §60: demo rows are labelled. A client cannot unlabel a real tenant's row. */
  isDemo?: boolean;
};

/**
 * Update convention for this level (mirrors `app.blankable` in 005):
 *   - an omitted key sends nothing, and the door leaves the column alone;
 *   - `""` on a blankable nullable column (`legalName`, `displayName`, `taxRegion`,
 *     `phone`, `email`, `website`, `logoUrl`) is the operator clearing the field —
 *     the door stores NULL. Never send `null` to clear one: these doors read NULL
 *     as "not edited";
 *   - the NOT NULL columns (`name`, `country`, `currency`, `timezone`, `locale`,
 *     `businessTypes`) keep coalesce behaviour: editable or left alone, never
 *     blanked — `""` there hits the door's own validation.
 * `code` and `slug` are absent by design: they appear in document numbers (§44).
 */
export type OrganizationUpdate = {
  organizationId: EntityId;
  name?: string;
  legalName?: string;
  displayName?: string;
  country?: string;
  currency?: string;
  timezone?: string;
  locale?: string;
  taxRegion?: string;
  phone?: string;
  email?: string;
  website?: string;
  logoUrl?: string;
  businessTypes?: BusinessType[];
  /** §82: the version the row had when the UI read it; a stale copy gets CONFLICT. */
  expectedVersion?: number;
};

export type OrganizationStatusChange = {
  organizationId: EntityId;
  status: OrganizationStatus;
  /** Required by the door (`require_reason`) and written into the audit entry. */
  reason: string;
};

/** The organizations this session may see. Archived ones stay out unless asked. */
export async function listOrganizations(
  options: ArchivedRead = {},
): Promise<Organization[]> {
  const chain = requireSupabase().from(TABLE).select(COLUMNS);
  // A filter mutates the chain and returns it, so an optional predicate is an `if`
  // rather than a ternary whose two builder types would no longer unify.
  if (options.includeArchived !== true) chain.neq("status", ARCHIVED);
  const query = asRead(chain.order("name"));
  return (await camelRows<OrganizationRecord>(query)).map(toOrganization);
}

/** One organization, or null. Not-found is the caller's decision to make. */
export async function getOrganization(
  id: EntityId,
  options: ArchivedRead = {},
): Promise<Organization | null> {
  const chain = requireSupabase().from(TABLE).select(COLUMNS).eq("id", id);
  if (options.includeArchived !== true) chain.neq("status", ARCHIVED);
  const query = asRead(chain.limit(1));
  const row = await firstCamelRow<OrganizationRecord>(query);
  return row === null ? null : toOrganization(row);
}

export async function createOrganization(input: NewOrganization): Promise<Organization> {
  const row = await callDoorRow<OrganizationRecord>("create_organization", {
    name: input.name,
    code: input.code,
    slug: input.slug,
    country: input.country,
    currency: input.currency,
    timezone: input.timezone,
    locale: input.locale,
    businessTypes: input.businessTypes,
    legalName: input.legalName,
    taxRegion: input.taxRegion,
    phone: input.phone,
    email: input.email,
    isDemo: input.isDemo,
  });
  return toOrganization(row);
}

/** The written row is returned, never re-selected (§82's race). */
export async function updateOrganization(input: OrganizationUpdate): Promise<Organization> {
  const row = await callDoorRow<OrganizationRecord>("update_organization", {
    organization: input.organizationId,
    name: input.name,
    legalName: input.legalName,
    displayName: input.displayName,
    country: input.country,
    currency: input.currency,
    timezone: input.timezone,
    locale: input.locale,
    taxRegion: input.taxRegion,
    phone: input.phone,
    email: input.email,
    website: input.website,
    logoUrl: input.logoUrl,
    businessTypes: input.businessTypes,
    expectedVersion: input.expectedVersion,
  });
  return toOrganization(row);
}

/**
 * Suspend / archive / restore — three states of one transition (§41/§73).
 *
 * The door additionally requires the actor to be an ACTIVE owner (or a platform
 * admin), so an admin holding `organization.archive` still cannot retire a tenant.
 */
export async function setOrganizationStatus(
  input: OrganizationStatusChange,
): Promise<Organization> {
  const row = await callDoorRow<OrganizationRecord>("set_organization_status", {
    organization: input.organizationId,
    status: input.status,
    reason: input.reason,
  });
  return toOrganization(row);
}
