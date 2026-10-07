/**
 * Roles, grants and access breadth: what a person may be, and how far it reaches.
 *
 * Three separate concepts, because the schema keeps them separate (§19/§20/§21):
 *
 *   - a ROLE (`roles`) is a named bundle of permissions at one scope level;
 *   - a GRANT (`user_roles`) is that role pinned to a tenant and, where the role's
 *     `scope_level` says so, to one site/outlet/department;
 *   - BREADTH (`membership_property_access`, `membership_outlet_access`) is which sites
 *     a person can see at all, independent of what they may do inside them.
 *
 * A screen that conflates breadth with a role produces the classic half-permission bug:
 * the grant exists but the site is invisible, so the person is denied in a way nobody can
 * explain. `assign_role` therefore writes breadth alongside the grant it makes.
 *
 * Reads are plain SELECTs under 003's grants; every write is a door, because
 * `authenticated` cannot update these tables at all. No read here embeds a nested select:
 * the camel mapper is top-level only, so a role would arrive `displayName` while its
 * embedded permissions stayed `created_at`. Two reads and a join in the service instead.
 */

import { requireSupabase } from "@/db/client";
import { callDoorRow, camelRows } from "@/db/rpc";
import type {
  EntityId,
  OutletAccess,
  OutletAccessMode,
  PropertyAccess,
  PropertyAccessMode,
  Role,
  RoleGrant,
  ScopeLevel,
} from "@/domain/identity/types";

/* ------------------------------------------------------------------ door inputs */

/** What `assign_role` takes. The role travels by NAME, like every other role door. */
export type AssignRoleInput = {
  userId: EntityId;
  /** Resolved by the door as `upper(p_role)` among ACTIVE system roles or this tenant's
   *  own; anything else is `NIVAAS_ROLE_NOT_FOUND`. */
  role: string;
  organizationId: EntityId;
  /** Send it when the role's `scope_level` is `PROPERTY`; omitted for wider roles. */
  propertyId?: EntityId | null;
  /** Send it when the role's `scope_level` is `OUTLET`. */
  outletId?: EntityId | null;
  reason?: string;
};

/** `assign_role`'s answer: the grant row's id, and the role/scope the door resolved. */
export type RoleAssignment = {
  grantId: EntityId;
  role: string;
  scope: ScopeLevel;
};

/** `revoke_role`'s answer. */
export type RoleRevocation = {
  grantId: EntityId;
  revoked: boolean;
};

/** Replacing one person's whole property breadth (§19). */
export type SetPropertyAccessInput = {
  userId: EntityId;
  organizationId: EntityId;
  mode: PropertyAccessMode;
  /** Ignored by the door under `ALL_PROPERTIES`; mandatory under `SELECTED_PROPERTIES`. */
  propertyIds?: EntityId[];
  reason?: string;
};

/** `set_property_access`'s answer — the door returns the user and the mode it stored. */
export type PropertyAccessSetting = {
  user: EntityId;
  mode: PropertyAccessMode;
};

/** Replacing one person's outlet breadth inside ONE property (§20). */
export type SetOutletAccessInput = {
  userId: EntityId;
  propertyId: EntityId;
  mode: OutletAccessMode;
  outletIds?: EntityId[];
  reason?: string;
};

/** `set_outlet_access`'s answer; this one does name the property it wrote. */
export type OutletAccessSetting = {
  user: EntityId;
  property: EntityId;
  mode: OutletAccessMode;
};

/** How narrow a grant listing is. `organizationId` is always required — see `listGrants`. */
export type GrantScopeFilter = {
  organizationId: EntityId;
  userId?: EntityId;
  propertyId?: EntityId;
  outletId?: EntityId;
};

/* --------------------------------------------------------------------- reads */

// One literal each, never a concatenation: postgrest-js parses the SELECT list at the type
// level, and a `+`-joined string arrives as plain `string`, which makes the row type an
// error type and the funnel's `camelRows` refuse it.
const ROLE_COLUMNS = "id, name, display_name, description, scope_level, organization_id, is_system, status";

const GRANT_COLUMNS = "id, user_id, role_id, organization_id, property_id, outlet_id, department_id, granted_by, granted_at, revoked_at";

/**
 * The roles a grant picker can offer: ACTIVE system roles, alphabetical.
 *
 * Reference data rather than tenant data, so it is not tenant-filtered — 003's
 * `roles_read` policy makes `is_system` rows visible to everyone signed in and keeps a
 * tenant's custom roles inside that tenant. Tenant-defined roles therefore need their own
 * listing once there is a screen that creates them; today's doors resolve a role by name
 * against either group, so `assign_role` accepts a custom role this list does not show.
 */
export async function listRoles(): Promise<Role[]> {
  return camelRows<Role>(
    requireSupabase()
      .from("roles")
      .select(ROLE_COLUMNS)
      .eq("is_system", true)
      .eq("status", "ACTIVE")
      .order("name", { ascending: true }),
  );
}

/**
 * The grants in effect for one tenant, narrowed by whichever level is being inspected.
 *
 * `organizationId` is mandatory: 003's `user_roles_read` arm that lets an administrator
 * read a grant is `app.member_of(current_user, organization_id)`, and a global platform
 * role has no tenant column to read through, so it is not listable from this client.
 *
 * Active grants only unless `includeRevoked` is set — and even then the revoked rows are
 * data, not debris: revocation stamps `revoked_at`, it never deletes, so "who had what
 * last quarter" stays answerable.
 *
 * The role's name/scope is filled by a second read of `roles`, because a nested select
 * would arrive half-mapped.
 */
export async function listGrants(
  filter: GrantScopeFilter & { includeRevoked?: boolean },
): Promise<RoleGrant[]> {
  let query = requireSupabase()
    .from("user_roles")
    .select(GRANT_COLUMNS)
    .eq("organization_id", filter.organizationId);

  if (filter.userId !== undefined) query = query.eq("user_id", filter.userId);
  if (filter.propertyId !== undefined) query = query.eq("property_id", filter.propertyId);
  if (filter.outletId !== undefined) query = query.eq("outlet_id", filter.outletId);
  if (filter.includeRevoked !== true) query = query.is("revoked_at", null);

  const grants = await camelRows<RoleGrant>(
    query.order("granted_at", { ascending: false }).order("id", { ascending: false }),
  );
  if (grants.length === 0) return [];

  const roleIds = [...new Set(grants.map((grant) => grant.roleId))];
  const roles = await camelRows<
    Pick<Role, "id" | "name" | "displayName" | "scopeLevel">
  >(
    requireSupabase()
      .from("roles")
      .select("id, name, display_name, scope_level")
      .in("id", roleIds),
  );
  const byId = new Map(roles.map((role) => [role.id, role]));

  // `RoleGrant.role` is optional on purpose. A grant whose role row the reader cannot see
  // (another tenant's custom role, reachable through the platform-admin arm of the policy)
  // is reported without a label rather than labelled with an invented name — a screen that
  // shows "Unknown" for it would look like a data bug, and showing the role's own name
  // would leak another tenant's vocabulary.
  return grants.map((grant) => {
    const role = byId.get(grant.roleId);
    if (role === undefined) return grant;
    return {
      ...grant,
      role: { name: role.name, displayName: role.displayName, scopeLevel: role.scopeLevel },
    };
  });
}

/** Every person's property breadth inside one tenant, grouped by person then site. */
export async function listPropertyAccess(organizationId: EntityId): Promise<PropertyAccess[]> {
  return camelRows<PropertyAccess>(
    requireSupabase()
      .from("membership_property_access")
      .select("id, user_id, organization_id, property_id, mode")
      .eq("organization_id", organizationId)
      .order("user_id", { ascending: true })
      .order("property_id", { ascending: true }),
  );
}

/**
 * Outlet breadth inside one property.
 *
 * Keyed by property rather than organization because that is how it is administered (an
 * access dialog opens on a site) and how `set_outlet_access` names its target. 003's
 * `outlet_access_read` still requires membership of the row's own organization, so a
 * forgotten tenant predicate cannot reach another group here.
 */
export async function listOutletAccess(propertyId: EntityId): Promise<OutletAccess[]> {
  return camelRows<OutletAccess>(
    requireSupabase()
      .from("membership_outlet_access")
      .select("id, user_id, organization_id, property_id, outlet_id, mode")
      .eq("property_id", propertyId)
      .order("user_id", { ascending: true })
      .order("outlet_id", { ascending: true }),
  );
}

/* -------------------------------------------------------------------- writes */

/**
 * Grant a role to a person at a level.
 *
 * What the door insists on, and what a form should therefore insist on first:
 * the grantee must already be an ACTIVE member of this organization
 * (`NIVAAS_NOT_A_MEMBER`), the organization must be active
 * (`require_active_organization`), and the caller must hold `role.assign` here.
 * A `PROPERTY` role refuses without `p_property` and an `OUTLET` role without `p_outlet`
 * (`NIVAAS_SCOPE_MISMATCH`) — and only the id that matches the role's own `scope_level`
 * is stored, so passing a property to an OUTLET-scope role does not quietly widen it.
 *
 * DEPARTMENT-SCOPE ROLES CANNOT BE GRANTED: `assign_role` refuses them at the door with
 * `NIVAAS_DEPARTMENT_GRANTS_UNSUPPORTED` (the 005 guard), because `my_permissions` resolves
 * grants at organization, property and outlet level only — a department grant would be
 * stored and silently confer nothing. The client maps that token to a VALIDATION_FAILED
 * message ("Roles can be granted at organization, property or outlet level for now.");
 * whether department scoping ever resolves is Prompt #03's decision, not a gap to work
 * around here.
 *
 * A scoped grant also writes the breadth rows that make its site reachable (narrowed to
 * that one site, never to the whole group), which is why this call is enough on its own to
 * give a person a working manager seat.
 *
 * Returns `{ grantId, role, scope }` — the role NAME the door resolved (upper-cased) and
 * its scope level, not the row it inserted.
 */
export async function assignRole(input: AssignRoleInput): Promise<RoleAssignment> {
  return callDoorRow<RoleAssignment>("assign_role", {
    user: input.userId,
    role: input.role,
    organization: input.organizationId,
    property: input.propertyId ?? null,
    outlet: input.outletId ?? null,
    reason: input.reason,
  });
}

/**
 * Take a grant back. The door stamps `revoked_at` and keeps the row — 002's partial unique
 * index (`user_roles_unique_active_idx`) only covers `revoked_at is null`, so deleting the
 * row would destroy the history AND let the identical grant be inserted twice in anger.
 * A second revocation of the same grant is `NIVAAS_ALREADY_REVOKED`; a reason is mandatory.
 *
 * Note what this does NOT do: it leaves the breadth rows `assign_role` wrote in place.
 * Narrow a person's sites with `setPropertyAccess`/`setOutletAccess`, which is what the
 * operator usually means by "take their access away".
 */
export async function revokeRole(grantId: EntityId, reason: string): Promise<RoleRevocation> {
  return callDoorRow<RoleRevocation>("revoke_role", { grant: grantId, reason });
}

/**
 * Replace one person's property breadth for one tenant.
 *
 * Replacement, not addition: the door deletes the whole set and rewrites it, because a
 * partial diff is how an old grant quietly survives a reassignment. `ALL_PROPERTIES`
 * requires an empty list and covers sites created later; `SELECTED_PROPERTIES` requires a
 * non-empty list (`NIVAAS_EMPTY_SELECTION`) and every id must belong to this organization
 * (`NIVAAS_SCOPE_MISMATCH`). The person must be an ACTIVE member.
 *
 * Returns `{ user, mode }`. It does not return the property list it stored, so re-read
 * `listPropertyAccess` after writing rather than assuming.
 */
export async function setPropertyAccess(
  input: SetPropertyAccessInput,
): Promise<PropertyAccessSetting> {
  return callDoorRow<PropertyAccessSetting>("set_property_access", {
    user: input.userId,
    organization: input.organizationId,
    mode: input.mode,
    propertyIds: input.propertyIds,
    reason: input.reason,
  });
}

/**
 * Replace one person's outlet breadth inside one property.
 *
 * Same replacement semantics as above, at the narrower level: `ALL_OUTLETS` needs no list,
 * `SELECTED_OUTLETS` needs a non-empty list of outlets that live in THIS property
 * (`NIVAAS_SCOPE_MISMATCH`). The organization is derived by the door from the property row,
 * which is why this input names a property and not a tenant. There is no membership check
 * in this door, so a breadth row can precede the invitation that makes the person a member
 * — harmless under RLS (they still have no grants), but the admin screen should expect a
 * name it cannot resolve.
 *
 * Returns `{ user, property, mode }`.
 */
export async function setOutletAccess(input: SetOutletAccessInput): Promise<OutletAccessSetting> {
  return callDoorRow<OutletAccessSetting>("set_outlet_access", {
    user: input.userId,
    property: input.propertyId,
    mode: input.mode,
    outletIds: input.outletIds,
    reason: input.reason,
  });
}
