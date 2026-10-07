/**
 * Custom roles: a tenant writing its own authority.
 *
 * 011 is the first migration that lets a customer author a permission bundle, and it is also
 * the migration with the most ways to go wrong, so this file's job is to be a thin, exact
 * mirror of four doors and to leave every decision in the database:
 *
 *   - `create_role` / `update_role` / `set_role_permissions` / `set_role_status`
 *
 * THE ONE RULE THAT MAKES THIS SAFE, stated because every function below depends on it:
 * a tenant role can never contain a permission its creator does not already hold. `011`
 * resolves `app.grant_ceiling()` for the actor and refuses anything above it with
 * `NIVAAS_ROLE_ABOVE_AUTHORITY`, then pins the new role's `seniority` to that ceiling — so a
 * role created by someone with limited authority is permanently limited, and editing a role
 * cannot promote it either. `app.ungrantable_permission()` is the enforcer, and it is the
 * reason a client-side "which permissions may I offer?" list is a UI convenience and never a
 * control: the door re-derives the answer from the session on every call.
 *
 * Consequences a screen must not paper over:
 *   - `seniority` and `owner_class` are NOT read into this layer's `Role` mirror at all. They
 *     are the doors' arithmetic, they are unfilterable from a browser, and showing a ladder
 *     number would invite an operator to reason about a thing they cannot verify.
 *   - System roles are untouchable here (`NIVAAS_SYSTEM_ROLE_PROTECTED`); the platform's
 *     catalogue changes with a migration, not through a screen.
 *   - `set_role_status('INACTIVE')` retires rather than deletes, because `user_roles` rows
 *     reference the role and §53 keeps history readable.
 *
 * EVERY PARAMETER MUST REACH THE WIRE. None of these four doors declares a `default`, and
 * PostgREST resolves a function by its full parameter list: a dropped argument is not a
 * missing value but a "function public.create_role(...) does not exist". So each nullable
 * input below is sent as `?? null` rather than left `undefined`, which `toDoorArgs` would
 * silently drop. That is the whole reason the argument objects look over-careful.
 */

import { callDoorRow } from "@/db/rpc";
import type { EntityId, Permission, Role, ScopeLevel } from "@/domain/identity/types";

/* ------------------------------------------------------------------ door inputs */

/**
 * What `create_role` takes.
 *
 * `name` is the machine key and is upper-cased by the door; 011 checks it against
 * `^[A-Z][A-Z0-9_]{2,39}$` and refuses a name the platform's own catalogue already uses
 * (`NIVAAS_ROLE_NAME_TAKEN`), while per-tenant uniqueness lets two operators each keep a
 * `NIGHT_AUDITOR`. `displayName` is the human label and must be non-blank.
 *
 * `scopeLevel` is confined to `ORGANIZATION | PROPERTY | OUTLET`: `GLOBAL` is the platform's
 * namespace and `DEPARTMENT` has no resolution path, so 011 refuses either with
 * `NIVAAS_ROLE_SCOPE_FORBIDDEN`. A picker must therefore not offer the other two —
 * `ScopeLevel` is wider than this door accepts, and that difference is deliberate.
 *
 * `permissions` must be non-empty (`NIVAAS_EMPTY_SELECTION`) and every entry something the
 * actor holds. `reason` is mandatory: creating authority is a sensitive act and 011 writes
 * the whole permission list into the audit row.
 */
export type CreateRoleInput = {
  organizationId: EntityId;
  name: string;
  displayName: string;
  description?: string | null;
  scopeLevel: Exclude<ScopeLevel, "GLOBAL" | "DEPARTMENT">;
  permissions: readonly Permission[];
  reason: string;
};

/** What `update_role` takes: the label and the blurb only, never the grants. */
export type UpdateRoleInput = {
  roleId: EntityId;
  displayName?: string | null;
  description?: string | null;
  reason: string;
};

/** What `set_role_permissions` takes — a whole replacement set, not a diff. */
export type SetRolePermissionsInput = {
  roleId: EntityId;
  permissions: readonly Permission[];
  reason: string;
};

/**
 * What `set_role_status` takes.
 *
 * This is `Role`'s own two-value status, NOT `AccountStatus`: 011 checks
 * `p_status in ('ACTIVE','INACTIVE')`, and `INACTIVE` here means a retired role, whereas a
 * person's profile has no `INACTIVE` any more (008 replaced it with `DEACTIVATED`). Anything
 * else — including a person-status value — reaches `NIVAAS_INVALID_STATUS`.
 */
export type SetRoleStatusInput = {
  roleId: EntityId;
  status: Role["status"];
  reason: string;
};

/* ------------------------------------------------------------------ door outputs */

/** `create_role` answers `{ roleId, name, scope, permissions }` — the row as it now stands. */
export type CreatedRole = {
  roleId: EntityId;
  /** Upper-cased by the door; print `displayName`, which is not in this payload. */
  name: string;
  scope: CreateRoleInput["scopeLevel"];
  permissions: Permission[];
};

/** `update_role` confirms the write without returning the row. */
export type RoleUpdated = { roleId: EntityId; updated: true };

/**
 * `set_role_permissions` answers `{ roleId, permissions }`.
 *
 * The list is read back OUT OF `role_permissions` rather than echoed from the input, so an
 * empty array here means the replace genuinely left the role with nothing — the one
 * difference between "the door applied my list" and "the door accepted my list and something
 * else removed it" a screen can actually detect.
 */
export type RolePermissionsSet = { roleId: EntityId; permissions: Permission[] };

/** `set_role_status` answers `{ roleId, status }`. */
export type RoleStatusSet = { roleId: EntityId; status: Role["status"] };

/* -------------------------------------------------------------------- the doors */

/**
 * Create a tenant role and grant it a set of permissions in one transaction.
 *
 * The role's `seniority` is pinned to the actor's ceiling by the door; there is no parameter
 * for it and no way to ask for a higher one, which is exactly what makes this safe to expose
 * to an administrator at all.
 */
export async function createRole(input: CreateRoleInput): Promise<CreatedRole> {
  return callDoorRow<CreatedRole>("create_role", {
    organization: input.organizationId,
    name: input.name,
    displayName: input.displayName ?? null,
    description: input.description ?? null,
    scopeLevel: input.scopeLevel,
    permissions: [...input.permissions],
    reason: input.reason,
  });
}

/**
 * Rename a custom role or change its description.
 *
 * Deliberately NOT able to change `name`, `scope_level` or the grants: 011 splits those
 * decisions across the doors that can check them, and a role's identity is what every existing
 * grant points at.
 */
export async function updateRole(input: UpdateRoleInput): Promise<RoleUpdated> {
  return callDoorRow<RoleUpdated>("update_role", {
    role: input.roleId,
    displayName: input.displayName ?? null,
    description: input.description ?? null,
    reason: input.reason,
  });
}

/**
 * Replace a role's whole permission set.
 *
 * Replace-whole-set is the semantics, and it is the safe one: a partial diff sent by a stale
 * client silently re-grants something an administrator withdrew mid-shift. The same subset and
 * ceiling rules as `create_role` apply — editing is how a role is widened, and widening past
 * your own authority is the escalation 011 exists to stop. A role may not be re-seniorised in
 * the process, so an editor cannot promote a role above themselves by adding to it.
 */
export async function setRolePermissions(
  input: SetRolePermissionsInput,
): Promise<RolePermissionsSet> {
  return callDoorRow<RolePermissionsSet>("set_role_permissions", {
    role: input.roleId,
    permissions: [...input.permissions],
    reason: input.reason,
  });
}

/**
 * Retire or restore a custom role.
 *
 * An INACTIVE role is already invisible to `assign_role`, which selects `status = 'ACTIVE'`,
 * so retiring stops future grants without disturbing the ones that exist. System roles refuse
 * this call outright.
 */
export async function setRoleStatus(input: SetRoleStatusInput): Promise<RoleStatusSet> {
  return callDoorRow<RoleStatusSet>("set_role_status", {
    role: input.roleId,
    status: input.status,
    reason: input.reason,
  });
}

/* ------------------------------------------------------------------ pure helpers */

/**
 * The permission keys this door can accept, given what the actor holds.
 *
 * A UI aid ONLY — the door re-derives the truth from the session, and an aid that offered more
 * than the actor holds would simply be refused. It exists because a silent refusal after
 * somebody ticks a box is worse than a box they cannot tick: the operator learns the ceiling
 * exists instead of filing a bug.
 *
 * Order follows `wanted`, not the actor's set, so a list the screen sorted stays sorted.
 */
export function grantablePermissions(
  held: readonly Permission[],
  wanted: readonly Permission[],
): Permission[] {
  const holder = new Set(held);
  return wanted.filter((permission) => holder.has(permission));
}

/**
 * Whether a role row may be edited from this screen at all.
 *
 * `isSystem` is the whole test, and it is the database's own column: a tenant role is one with
 * an `organization_id` and `is_system = false`. Do NOT gate on a name (`=== "ORG_OWNER"` is the
 * version of this that rots the day the catalogue changes) and do not gate on the
 * organization — 011 answers a foreign role id with `NIVAAS_NOT_FOUND` rather than a 003 that
 * confirms the row exists.
 */
export function roleIsEditable(role: Pick<Role, "isSystem">): boolean {
  return role.isSystem === false;
}

/**
 * The scopes a custom role may be created at.
 *
 * `ScopeLevel` is the schema's full vocabulary; 011 accepts three of those values. Derived by
 * exclusion so that adding a fifth scope level to the schema does not quietly add it to a
 * picker here — the picker then offers nothing until this line is looked at.
 */
export const CREATABLE_SCOPE_LEVELS: readonly CreateRoleInput["scopeLevel"][] = [
  "ORGANIZATION",
  "PROPERTY",
  "OUTLET",
];

/**
 * 011's `p_name` pattern, as a client-side check.
 *
 * Duplicated ON PURPOSE: the door's check is the one that counts, but `NIVAAS_INVALID_NAME`
 * covers the pattern AND a blank display name, so a form that only posts and waits cannot tell
 * the operator which of the two they got wrong. `^[A-Z][A-Z0-9_]{2,39}$` is a first character
 * plus two-to-thirty-nine more, i.e. three to forty characters overall, before upper-casing.
 */
export function roleNameIsValid(name: string): boolean {
  return /^[A-Z][A-Z0-9_]{2,39}$/.test(name);
}
