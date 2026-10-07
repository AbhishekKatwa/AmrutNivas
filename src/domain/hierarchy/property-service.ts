/**
 * The site level: Property.
 *
 * A property sits directly under one organization, and every read is scoped by that
 * `organization_id`. RLS would refuse the cross-tenant row anyway — the explicit
 * filter is there because a person who can see three properties still has to say
 * which one this list belongs to, and a query that cannot say it is a query that will
 * quietly widen later.
 *
 * The column is `property_type`, the domain field is `type`; the funnel can only
 * camel-case a key (`property_type` -> `propertyType`), so the rename happens here,
 * once per direction.
 */

import { requireSupabase } from "@/db/client";
import { asRead, camelRows, callDoorRow, firstCamelRow } from "@/db/rpc";
import type {
  EntityId,
  Property,
  PropertyType,
  SiteStatus,
} from "@/domain/identity/types";

const TABLE = "properties";
const ARCHIVED = "ARCHIVED";

const COLUMNS =
  "id, organization_id, name, display_name, code, slug, property_type, status, " +
  "address_line1, address_line2, city, state, postal_code, country, phone, email, " +
  "timezone, currency, locale, business_day_start, tax_profile_id, version, " +
  "created_at, updated_at, archived_at";

type PropertyRecord = Omit<Property, "type"> & {
  propertyType: PropertyType;
  createdBy?: EntityId;
};

function toProperty(row: PropertyRecord): Property {
  const { propertyType, createdBy: _unused, ...fields } = row;
  return { ...fields, type: propertyType };
}

/** The tenant the caller is already standing in. */
export type PropertyScope = {
  organizationId: EntityId;
};

/** `{ includeArchived: true }` opts a retired site back into the read. */
export type ArchivedRead = {
  includeArchived?: boolean;
};

/**
 * Step 2 of onboarding (§33/§76). Timezone, currency, locale and country are sent
 * per site — the group's values are defaults the client may copy, never schema
 * constants (§11/§69).
 *
 * There is deliberately no `displayName`: `create_property` declares no such
 * parameter and stores `display_name = p_name`. The shown name is changed by an
 * update, which is the door that does declare `p_display_name`.
 */
export type NewProperty = {
  organizationId: EntityId;
  name: string;
  /** `^[A-Z0-9][A-Z0-9-]{1,19}$`, unique inside the organization. */
  code: string;
  slug: string;
  type: PropertyType;
  country: string;
  currency: string;
  timezone: string;
  locale: string;
  /** The trading-day boundary a night audit rolls across. Omitted -> door default `04:00`. */
  businessDayStart?: string;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  phone?: string | null;
  email?: string | null;
};

/**
 * Update convention for this level (mirrors `app.blankable` in 005):
 *   - an omitted key sends nothing, and the door leaves the column alone;
 *   - `""` on a blankable nullable column (`displayName`, `addressLine1`,
 *     `addressLine2`, `city`, `state`, `postalCode`, `phone`, `email`) is the
 *     operator clearing the field — the door stores NULL. Never send `null` to
 *     clear one: these doors read NULL as "not edited";
 *   - the NOT NULL columns (`name`, `country`, `currency`, `timezone`, `locale`,
 *     `businessDayStart`) keep coalesce behaviour: editable or left alone, never
 *     blanked.
 * `code`, `slug` and the property type are immutable once issued (§11/§44).
 */
export type PropertyUpdate = {
  propertyId: EntityId;
  name?: string;
  displayName?: string;
  country?: string;
  currency?: string;
  timezone?: string;
  locale?: string;
  businessDayStart?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  phone?: string;
  email?: string;
  /** §82 optimistic locking; absent means the door's `default null` (no check). */
  expectedVersion?: number;
};

export type PropertyStatusChange = {
  propertyId: EntityId;
  status: SiteStatus;
  reason: string;
};

/** The sites of one organization. */
export async function listProperties(
  scope: PropertyScope,
  options: ArchivedRead = {},
): Promise<Property[]> {
  const chain = requireSupabase()
    .from(TABLE)
    .select(COLUMNS)
    // The ancestor the caller already holds, stated on the wire — RLS is the backstop,
    // not the intent.
    .eq("organization_id", scope.organizationId);
  // A filter mutates the chain and returns it, so an optional predicate is an `if`
  // rather than a ternary whose two builder types would no longer unify.
  if (options.includeArchived !== true) chain.neq("status", ARCHIVED);
  const query = asRead(chain.order("name"));
  return (await camelRows<PropertyRecord>(query)).map(toProperty);
}

export async function getProperty(
  id: EntityId,
  scope: PropertyScope,
  options: ArchivedRead = {},
): Promise<Property | null> {
  const chain = requireSupabase()
    .from(TABLE)
    .select(COLUMNS)
    .eq("id", id)
    .eq("organization_id", scope.organizationId);
  if (options.includeArchived !== true) chain.neq("status", ARCHIVED);
  const query = asRead(chain.limit(1));
  const row = await firstCamelRow<PropertyRecord>(query);
  return row === null ? null : toProperty(row);
}

/** The domain's `type` is the door's `p_property_type`; the names never cross. */
export async function createProperty(input: NewProperty): Promise<Property> {
  const row = await callDoorRow<PropertyRecord>("create_property", {
    organization: input.organizationId,
    name: input.name,
    code: input.code,
    slug: input.slug,
    propertyType: input.type,
    country: input.country,
    currency: input.currency,
    timezone: input.timezone,
    locale: input.locale,
    businessDayStart: input.businessDayStart,
    addressLine1: input.addressLine1,
    addressLine2: input.addressLine2,
    city: input.city,
    state: input.state,
    postalCode: input.postalCode,
    phone: input.phone,
    email: input.email,
  });
  return toProperty(row);
}

export async function updateProperty(input: PropertyUpdate): Promise<Property> {
  const row = await callDoorRow<PropertyRecord>("update_property", {
    property: input.propertyId,
    name: input.name,
    displayName: input.displayName,
    country: input.country,
    currency: input.currency,
    timezone: input.timezone,
    locale: input.locale,
    businessDayStart: input.businessDayStart,
    addressLine1: input.addressLine1,
    addressLine2: input.addressLine2,
    city: input.city,
    state: input.state,
    postalCode: input.postalCode,
    phone: input.phone,
    email: input.email,
    expectedVersion: input.expectedVersion,
  });
  return toProperty(row);
}

/**
 * Pause / retire / reactivate.
 *
 * `set_property_status` requires `property.archive` and a reason; reactivating also
 * requires the organization itself to be trading, which the door checks — the client
 * cannot pass a flag to skip it.
 */
export async function setPropertyStatus(input: PropertyStatusChange): Promise<Property> {
  const row = await callDoorRow<PropertyRecord>("set_property_status", {
    property: input.propertyId,
    status: input.status,
    reason: input.reason,
  });
  return toProperty(row);
}
