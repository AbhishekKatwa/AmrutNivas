/**
 * Enterprise service layer (Prompt #15).
 *
 * Reads and writes for property groups, module configuration, and enterprise
 * aggregation queries. All writes go through 045 doors; reads use RLS-scoped
 * Supabase queries. Enterprise views aggregate operational data — they never
 * create duplicate ledgers or replace module-level services.
 */

import { requireSupabase } from "@/db/client";
import { asRead, callDoor, camelRows, firstCamelRow } from "@/db/rpc";
import type { EntityId, SiteStatus } from "@/domain/identity/types";
import type {
  ModuleName,
  PropertyGroup,
  PropertyModuleConfig,
  PropertyWithGroup,
} from "@/domain/enterprise/types";

const GROUPS_TABLE = "property_groups";
const MODULE_CONFIG_TABLE = "property_module_config";
const PROPERTIES_TABLE = "properties";

const GROUP_COLUMNS =
  "id, organization_id, name, code, description, status, version, created_at, updated_at";

type PropertyGroupRecord = PropertyGroup;

// =====================================================================
// Property Groups
// =====================================================================

export type PropertyGroupScope = {
  organizationId: EntityId;
};

export type NewPropertyGroup = {
  organizationId: EntityId;
  name: string;
  code: string;
  description?: string | null;
};

export type PropertyGroupUpdate = {
  groupId: EntityId;
  name?: string;
  description?: string;
  status?: SiteStatus;
};

/** List all property groups for an organization. */
export async function listPropertyGroups(
  scope: PropertyGroupScope,
): Promise<PropertyGroup[]> {
  const chain = requireSupabase()
    .from(GROUPS_TABLE)
    .select(GROUP_COLUMNS)
    .eq("organization_id", scope.organizationId)
    .neq("status", "ARCHIVED")
    .order("name");
  return camelRows<PropertyGroupRecord>(asRead(chain));
}

/** Get a single property group by ID. */
export async function getPropertyGroup(
  id: EntityId,
  scope: PropertyGroupScope,
): Promise<PropertyGroup | null> {
  const chain = requireSupabase()
    .from(GROUPS_TABLE)
    .select(GROUP_COLUMNS)
    .eq("id", id)
    .eq("organization_id", scope.organizationId)
    .limit(1);
  return firstCamelRow<PropertyGroupRecord>(asRead(chain));
}

/** Create a new property group. */
export async function createPropertyGroup(
  input: NewPropertyGroup,
): Promise<EntityId> {
  await callDoor("create_property_group", {
    organization: input.organizationId,
    name: input.name,
    code: input.code,
    description: input.description,
  });
  // The door returns the new ID as a scalar uuid. Re-read to get the full row.
  const chain = requireSupabase()
    .from(GROUPS_TABLE)
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("code", input.code)
    .limit(1);
  const row = await firstCamelRow<{ id: EntityId }>(asRead(chain));
  return row!.id;
}

/** Update a property group's name, description, or status. */
export async function updatePropertyGroup(
  input: PropertyGroupUpdate,
): Promise<void> {
  await callDoor("update_property_group", {
    groupId: input.groupId,
    name: input.name,
    description: input.description,
    status: input.status,
  });
}

/** Assign a property to a group (or remove from group by passing null). */
export async function setPropertyGroup(
  propertyId: EntityId,
  groupId: EntityId | null,
): Promise<void> {
  await callDoor("set_property_group", {
    propertyId,
    groupId,
  });
}

// =====================================================================
// Module Configuration
// =====================================================================

/** List module configuration for a property. Missing modules = enabled by default. */
export async function listPropertyModuleConfig(
  propertyId: EntityId,
  scope: PropertyGroupScope,
): Promise<PropertyModuleConfig[]> {
  const chain = requireSupabase()
    .from(MODULE_CONFIG_TABLE)
    .select("id, organization_id, property_id, module, enabled, created_at, updated_at")
    .eq("property_id", propertyId)
    .eq("organization_id", scope.organizationId);
  return camelRows<PropertyModuleConfig>(asRead(chain));
}

/** Enable or disable a module for a property. */
export async function setPropertyModule(
  propertyId: EntityId,
  module: ModuleName,
  enabled: boolean,
): Promise<void> {
  await callDoor("set_property_module", {
    propertyId,
    module,
    enabled,
  });
}

// =====================================================================
// Enterprise Reads (aggregation)
// =====================================================================

/** List properties with their group association resolved. */
export async function listPropertiesWithGroups(
  scope: PropertyGroupScope,
): Promise<PropertyWithGroup[]> {
  const chain = requireSupabase()
    .from(PROPERTIES_TABLE)
    .select(
      "id, organization_id, name, code, property_type, status, city, state, country, " +
        "property_group_id, property_groups(name, code)",
    )
    .eq("organization_id", scope.organizationId)
    .neq("status", "ARCHIVED")
    .order("name");

  type Row = {
    id: EntityId;
    organization_id: EntityId;
    name: string;
    code: string;
    property_type: string;
    status: string;
    city: string | null;
    state: string | null;
    country: string;
    property_group_id: EntityId | null;
    property_groups: { name: string; code: string } | null;
  };

  const rows = await camelRows<Row>(asRead(chain));
  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    code: row.code,
    type: row.property_type,
    status: row.status,
    city: row.city,
    state: row.state,
    country: row.country,
    propertyGroupId: row.property_group_id,
    propertyGroupName: row.property_groups?.name ?? null,
    propertyGroupCode: row.property_groups?.code ?? null,
  }));
}

/**
 * Check if a module is enabled for a property.
 * Returns true if no config row exists (default enabled).
 */
export function isModuleEnabled(
  config: PropertyModuleConfig[],
  module: ModuleName,
): boolean {
  const row = config.find((c) => c.module === module);
  return row?.enabled ?? true;
}
