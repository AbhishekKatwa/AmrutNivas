/**
 * The revenue-point level: Outlet.
 *
 * An outlet is always inside one property, and `organization_id` is copied down from
 * that property by `create_outlet` — the door does not accept it (§12/§15), which is
 * what makes "an outlet under another tenant's property" impossible rather than
 * merely unlikely. A read therefore scopes on BOTH ancestor ids: the property for the
 * list the screen is showing, the organization because that is the column RLS and the
 * tenancy rule are written against.
 *
 * The column is `outlet_type`, the domain field is `type`.
 */

import { requireSupabase } from "@/db/client";
import { asRead, camelRows, callDoorRow, firstCamelRow } from "@/db/rpc";
import type {
  EntityId,
  Outlet,
  OutletType,
  SiteStatus,
} from "@/domain/identity/types";

const TABLE = "outlets";
const ARCHIVED = "ARCHIVED";

const COLUMNS =
  "id, organization_id, property_id, name, code, slug, outlet_type, status, " +
  "business_hours, phone, email, version, created_at, updated_at, archived_at";

type OutletRecord = Omit<Outlet, "type"> & {
  outletType: OutletType;
  createdBy?: EntityId;
};

function toOutlet(row: OutletRecord): Outlet {
  const { outletType, createdBy: _unused, ...fields } = row;
  return { ...fields, type: outletType };
}

/** Both ancestors the caller already holds; neither is inferred here. */
export type OutletScope = {
  organizationId: EntityId;
  propertyId: EntityId;
};

/** `{ includeArchived: true }` opts a retired outlet back into the read. */
export type ArchivedRead = {
  includeArchived?: boolean;
};

/** Step 3 of onboarding (§77). No timezone/currency/locale of its own — an outlet
 *  trades inside one property's regime. */
export type NewOutlet = {
  /** The parent, and the only ancestor this door takes: `organization_id` is derived. */
  propertyId: EntityId;
  name: string;
  code: string;
  slug: string;
  type: OutletType;
  /** Day parts and meal windows; keys are the operator's own and are never rewritten
   *  by the camel funnel. Omitted -> the door's `{}`. */
  businessHours?: Record<string, unknown>;
  phone?: string | null;
  email?: string | null;
};

/**
 * Update convention for this level (mirrors `app.blankable` in 005): an omitted key
 * sends nothing and the door leaves the column alone; `""` on a blankable nullable
 * column (`phone`, `email`) is the operator clearing the field and the door stores
 * NULL — never send `null`, which these doors read as "not edited". `name` is NOT
 * NULL (coalesce): editable, never blankable. `businessHours` is JSON, not text, so
 * the empty-string rule does not apply to it.
 * `code`/`slug` are immutable (§44); the parent is not movable from this door.
 */
export type OutletUpdate = {
  outletId: EntityId;
  name?: string;
  businessHours?: Record<string, unknown>;
  phone?: string;
  email?: string;
  /** §82; absent leaves `p_expected_version` unset, so the door's default applies. */
  expectedVersion?: number;
};

export type OutletStatusChange = {
  outletId: EntityId;
  status: SiteStatus;
  reason: string;
};

/** The outlets of one property. */
export async function listOutlets(
  scope: OutletScope,
  options: ArchivedRead = {},
): Promise<Outlet[]> {
  const chain = requireSupabase()
    .from(TABLE)
    .select(COLUMNS)
    .eq("organization_id", scope.organizationId)
    .eq("property_id", scope.propertyId);
  // A filter mutates the chain and returns it, so an optional predicate is an `if`
  // rather than a ternary whose two builder types would no longer unify.
  if (options.includeArchived !== true) chain.neq("status", ARCHIVED);
  const query = asRead(chain.order("name"));
  return (await camelRows<OutletRecord>(query)).map(toOutlet);
}

export async function getOutlet(
  id: EntityId,
  scope: OutletScope,
  options: ArchivedRead = {},
): Promise<Outlet | null> {
  const chain = requireSupabase()
    .from(TABLE)
    .select(COLUMNS)
    .eq("id", id)
    .eq("organization_id", scope.organizationId)
    .eq("property_id", scope.propertyId);
  if (options.includeArchived !== true) chain.neq("status", ARCHIVED);
  const query = asRead(chain.limit(1));
  const row = await firstCamelRow<OutletRecord>(query);
  return row === null ? null : toOutlet(row);
}

/** The domain's `type` is the door's `p_outlet_type`. */
export async function createOutlet(input: NewOutlet): Promise<Outlet> {
  const row = await callDoorRow<OutletRecord>("create_outlet", {
    property: input.propertyId,
    name: input.name,
    code: input.code,
    slug: input.slug,
    outletType: input.type,
    businessHours: input.businessHours,
    phone: input.phone,
    email: input.email,
  });
  return toOutlet(row);
}

export async function updateOutlet(input: OutletUpdate): Promise<Outlet> {
  const row = await callDoorRow<OutletRecord>("update_outlet", {
    outlet: input.outletId,
    name: input.name,
    businessHours: input.businessHours,
    phone: input.phone,
    email: input.email,
    expectedVersion: input.expectedVersion,
  });
  return toOutlet(row);
}

/** Pause / retire / reactivate. Archived at is stamped by the door, never by the client. */
export async function setOutletStatus(input: OutletStatusChange): Promise<Outlet> {
  const row = await callDoorRow<OutletRecord>("set_outlet_status", {
    outlet: input.outletId,
    status: input.status,
    reason: input.reason,
  });
  return toOutlet(row);
}
