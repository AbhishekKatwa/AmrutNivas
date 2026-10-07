/**
 * The cost/ownership centre: Department.
 *
 * A department hangs off a property and, optionally, off one outlet inside it (§14) —
 * a property-wide Front Office has `outlet_id = null`, Kitchen does not. The scope
 * keeps that distinction readable: `organizationId` + `propertyId` are always
 * required, `outletId` narrows the list when the screen is an outlet's.
 *
 * Two things this level does NOT have, and the code must not invent them:
 *   - no `archived_at` column (001): retirement here is the status alone, and
 *   - no editable parent: `update_department` cannot move a cost centre between
 *     outlets, because that would restate which outlet's reports its people are in.
 */

import { requireSupabase } from "@/db/client";
import { asRead, camelRows, callDoorRow, firstCamelRow } from "@/db/rpc";
import type { Department, EntityId, SiteStatus } from "@/domain/identity/types";

const TABLE = "departments";
const ARCHIVED = "ARCHIVED";

const COLUMNS =
  "id, organization_id, property_id, outlet_id, name, code, slug, status, version, " +
  "created_at, updated_at";

/** camelCase all the way down at this level — no `*_type` rename to undo. */
type DepartmentRecord = Department & { createdBy?: EntityId };

function toDepartment(row: DepartmentRecord): Department {
  const { createdBy: _unused, ...department } = row;
  return department;
}

/** `outletId` is a narrowing filter, not an ancestor: the property is the boundary. */
export type DepartmentScope = {
  organizationId: EntityId;
  propertyId: EntityId;
  /** A specific outlet's departments. `null` means the property-level ones only. */
  outletId?: EntityId | null;
};

/** `{ includeArchived: true }` opts a retired centre back into the read. */
export type ArchivedRead = {
  includeArchived?: boolean;
};

export type NewDepartment = {
  /** The parent; `organization_id` is derived from it by the door (§15). */
  propertyId: EntityId;
  name: string;
  code: string;
  slug: string;
  /** Omitted or `null` for a property-level department. The door refuses an outlet
   *  that is not inside this property. */
  outletId?: EntityId | null;
};

/**
 * Update convention: an omitted key sends nothing and the door leaves the column
 * alone; a value renames it. This level has no blankable text column — `name` is
 * NOT NULL and coalesced, so it can be edited but never cleared, and `""` reaches
 * the door's own validation.
 */
export type DepartmentUpdate = {
  departmentId: EntityId;
  name?: string;
  /** §82; absent leaves `p_expected_version` unset, so the door's default applies. */
  expectedVersion?: number;
};

export type DepartmentStatusChange = {
  departmentId: EntityId;
  status: SiteStatus;
  reason: string;
};

/** The departments of one property, optionally narrowed to one outlet. */
export async function listDepartments(
  scope: DepartmentScope,
  options: ArchivedRead = {},
): Promise<Department[]> {
  const chain = requireSupabase()
    .from(TABLE)
    .select(COLUMNS)
    .eq("organization_id", scope.organizationId)
    .eq("property_id", scope.propertyId);
  // A filter mutates the chain and returns it, so the two optional predicates are
  // `if`s rather than ternaries whose builder types would no longer unify.
  if (scope.outletId !== undefined) chain.eq("outlet_id", scope.outletId);
  if (options.includeArchived !== true) chain.neq("status", ARCHIVED);
  const query = asRead(chain.order("name"));
  return (await camelRows<DepartmentRecord>(query)).map(toDepartment);
}

export async function getDepartment(
  id: EntityId,
  scope: DepartmentScope,
  options: ArchivedRead = {},
): Promise<Department | null> {
  const chain = requireSupabase()
    .from(TABLE)
    .select(COLUMNS)
    .eq("id", id)
    .eq("organization_id", scope.organizationId)
    .eq("property_id", scope.propertyId);
  if (scope.outletId !== undefined) chain.eq("outlet_id", scope.outletId);
  if (options.includeArchived !== true) chain.neq("status", ARCHIVED);
  const query = asRead(chain.limit(1));
  const row = await firstCamelRow<DepartmentRecord>(query);
  return row === null ? null : toDepartment(row);
}

/** `p_outlet` is the door's name for the optional parent outlet. */
export async function createDepartment(input: NewDepartment): Promise<Department> {
  const row = await callDoorRow<DepartmentRecord>("create_department", {
    property: input.propertyId,
    name: input.name,
    code: input.code,
    slug: input.slug,
    outlet: input.outletId,
  });
  return toDepartment(row);
}

export async function updateDepartment(input: DepartmentUpdate): Promise<Department> {
  const row = await callDoorRow<DepartmentRecord>("update_department", {
    department: input.departmentId,
    name: input.name,
    expectedVersion: input.expectedVersion,
  });
  return toDepartment(row);
}

/**
 * Pause / retire / reactivate.
 *
 * `set_department_status` asks for the `department.archive` capability on EVERY
 * transition, not only on retirement — that is what separates it from `department.edit`
 * in the door's body, and why a manager who can rename a centre cannot make it
 * disappear from reporting. There is no client-side flag for it.
 */
export async function setDepartmentStatus(
  input: DepartmentStatusChange,
): Promise<Department> {
  const row = await callDoorRow<DepartmentRecord>("set_department_status", {
    department: input.departmentId,
    status: input.status,
    reason: input.reason,
  });
  return toDepartment(row);
}
