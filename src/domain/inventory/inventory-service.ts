/**
 * Inventory master data: units of measure, categories, items, locations.
 *
 * Reads are plain SELECTs under RLS. Writes go through doors (023).
 * All functions require an active session and membership in the organization.
 */

import { requireSupabase } from "@/db/client";
import { asRead, camelRows, callDoor, callDoorRow } from "@/db/rpc";
import type { EntityId } from "@/domain/identity/types";
import type {
  InventoryCategory,
  InventoryItem,
  InventoryLocation,
  UnitConversion,
  UnitOfMeasure,
} from "./types";

const UNITS = "units_of_measure";
const CONVERSIONS = "unit_conversions";
const CATEGORIES = "inventory_categories";
const ITEMS = "inventory_items";
const LOCATIONS = "inventory_locations";

const UNIT_COLUMNS =
  "id, organization_id, name, code, description, status, created_at, updated_at";

const CONVERSION_COLUMNS =
  "id, organization_id, from_unit_id, to_unit_id, factor, status, created_at";

const CATEGORY_COLUMNS =
  "id, organization_id, name, code, description, display_order, status, created_at, updated_at";

const ITEM_COLUMNS =
  "id, organization_id, name, code, category_id, description, item_type, base_unit_id, " +
  "track_batch, track_expiry, reorder_level, reorder_quantity, attributes, status, created_at, updated_at";

const LOCATION_COLUMNS =
  "id, organization_id, property_id, outlet_id, name, code, location_type, description, " +
  "status, created_at, updated_at";

// ============================================================ units of measure

export async function listUnits(organizationId: EntityId): Promise<UnitOfMeasure[]> {
  const sb = requireSupabase();
  const chain = sb
    .from(UNITS)
    .select(UNIT_COLUMNS)
    .eq("organization_id", organizationId);
  return camelRows<UnitOfMeasure>(asRead(chain.order("name")));
}

export async function createUnit(
  organizationId: EntityId,
  name: string,
  code: string,
  description?: string
): Promise<UnitOfMeasure> {
  return callDoorRow<UnitOfMeasure>("create_unit", {
    p_organization: organizationId,
    p_name: name,
    p_code: code,
    p_description: description,
  });
}

export async function updateUnit(
  unitId: EntityId,
  organizationId: EntityId,
  updates: { name?: string; code?: string; description?: string },
  expectedVersion: number
): Promise<UnitOfMeasure> {
  return callDoorRow<UnitOfMeasure>("update_unit", {
    p_unit: unitId,
    p_organization: organizationId,
    p_name: updates.name,
    p_code: updates.code,
    p_description: updates.description,
    p_expected_version: expectedVersion,
  });
}

export async function archiveUnit(
  unitId: EntityId,
  organizationId: EntityId,
  expectedVersion: number
): Promise<void> {
  await callDoor("archive_unit", {
    p_unit: unitId,
    p_organization: organizationId,
    p_expected_version: expectedVersion,
  });
}

// ============================================================ unit conversions

export async function listUnitConversions(
  organizationId: EntityId
): Promise<UnitConversion[]> {
  const sb = requireSupabase();
  const chain = sb
    .from(CONVERSIONS)
    .select(CONVERSION_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("status", "ACTIVE");
  return camelRows<UnitConversion>(asRead(chain.order("from_unit_id")));
}

export async function createUnitConversion(
  organizationId: EntityId,
  fromUnitId: EntityId,
  toUnitId: EntityId,
  factor: number
): Promise<UnitConversion> {
  return callDoorRow<UnitConversion>("create_unit_conversion", {
    p_organization: organizationId,
    p_from_unit: fromUnitId,
    p_to_unit: toUnitId,
    p_factor: factor,
  });
}

// ============================================================ inventory categories

export async function listCategories(
  organizationId: EntityId
): Promise<InventoryCategory[]> {
  const sb = requireSupabase();
  const chain = sb
    .from(CATEGORIES)
    .select(CATEGORY_COLUMNS)
    .eq("organization_id", organizationId);
  return camelRows<InventoryCategory>(asRead(chain.order("display_order")));
}

export async function createCategory(
  organizationId: EntityId,
  name: string,
  code: string,
  description?: string,
  displayOrder?: number
): Promise<InventoryCategory> {
  return callDoorRow<InventoryCategory>("create_inventory_category", {
    p_organization: organizationId,
    p_name: name,
    p_code: code,
    p_description: description,
    p_display_order: displayOrder ?? 0,
  });
}

export async function updateCategory(
  categoryId: EntityId,
  organizationId: EntityId,
  updates: { name?: string; code?: string; description?: string; display_order?: number },
  expectedVersion: number
): Promise<InventoryCategory> {
  return callDoorRow<InventoryCategory>("update_inventory_category", {
    p_category: categoryId,
    p_organization: organizationId,
    p_name: updates.name,
    p_code: updates.code,
    p_description: updates.description,
    p_display_order: updates.display_order,
    p_expected_version: expectedVersion,
  });
}

export async function archiveCategory(
  categoryId: EntityId,
  organizationId: EntityId,
  expectedVersion: number
): Promise<void> {
  await callDoor("archive_inventory_category", {
    p_category: categoryId,
    p_organization: organizationId,
    p_expected_version: expectedVersion,
  });
}

// ============================================================ inventory items

export async function listItems(
  organizationId: EntityId,
  options?: { categoryId?: EntityId; status?: string }
): Promise<InventoryItem[]> {
  const sb = requireSupabase();
  let query = sb
    .from(ITEMS)
    .select(ITEM_COLUMNS)
    .eq("organization_id", organizationId);

  if (options?.categoryId) {
    query = query.eq("category_id", options.categoryId);
  }
  if (options?.status) {
    query = query.eq("status", options.status);
  }

  return camelRows<InventoryItem>(asRead(query.order("name")));
}

export async function createItem(
  organizationId: EntityId,
  item: {
    name: string;
    code: string;
    description?: string;
    category_id?: EntityId;
    item_type: string;
    base_unit_id: EntityId;
    track_batch?: boolean;
    track_expiry?: boolean;
    reorder_level?: number;
    reorder_quantity?: number;
  }
): Promise<InventoryItem> {
  return callDoorRow<InventoryItem>("create_inventory_item", {
    p_organization: organizationId,
    p_name: item.name,
    p_code: item.code,
    p_item_type: item.item_type,
    p_base_unit_id: item.base_unit_id,
    p_category_id: item.category_id,
    p_description: item.description,
    p_track_batch: item.track_batch ?? false,
    p_track_expiry: item.track_expiry ?? false,
    p_reorder_level: item.reorder_level,
    p_reorder_quantity: item.reorder_quantity,
  });
}

export async function updateItem(
  itemId: EntityId,
  updates: {
    name?: string;
    code?: string;
    description?: string;
    categoryId?: EntityId;
    itemType?: string;
    baseUnitId?: EntityId;
    trackBatch?: boolean;
    trackExpiry?: boolean;
    reorderLevel?: number;
    reorderQuantity?: number;
  },
  expectedVersion: number
): Promise<InventoryItem> {
  return callDoorRow<InventoryItem>("update_inventory_item", {
    p_item: itemId,
    p_name: updates.name,
    p_code: updates.code,
    p_category_id: updates.categoryId,
    p_description: updates.description,
    p_item_type: updates.itemType,
    p_base_unit_id: updates.baseUnitId,
    p_track_batch: updates.trackBatch,
    p_track_expiry: updates.trackExpiry,
    p_reorder_level: updates.reorderLevel,
    p_reorder_quantity: updates.reorderQuantity,
    p_expected_version: expectedVersion,
  });
}

export async function setItemStatus(
  itemId: EntityId,
  status: string,
  reason: string
): Promise<InventoryItem> {
  return callDoorRow<InventoryItem>("set_inventory_item_status", {
    p_item: itemId,
    p_status: status,
    p_reason: reason,
  });
}

// ============================================================ inventory locations

export async function listLocations(
  organizationId: EntityId,
  propertyId: EntityId,
  outletId?: EntityId
): Promise<InventoryLocation[]> {
  const sb = requireSupabase();
  let query = sb
    .from(LOCATIONS)
    .select(LOCATION_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("property_id", propertyId);

  if (outletId) {
    query = query.eq("outlet_id", outletId);
  }

  return camelRows<InventoryLocation>(asRead(query.order("name")));
}

export async function createLocation(
  organizationId: EntityId,
  propertyId: EntityId,
  outletId: EntityId | undefined,
  name: string,
  code: string,
  locationType: string,
  description?: string
): Promise<InventoryLocation> {
  return callDoorRow<InventoryLocation>("create_inventory_location", {
    p_organization: organizationId,
    p_property: propertyId,
    p_outlet_id: outletId,
    p_name: name,
    p_code: code,
    p_location_type: locationType,
    p_description: description,
  });
}

export async function updateLocation(
  locationId: EntityId,
  organizationId: EntityId,
  updates: { name?: string; code?: string; location_type?: string; description?: string },
  expectedVersion: number
): Promise<InventoryLocation> {
  return callDoorRow<InventoryLocation>("update_inventory_location", {
    p_location: locationId,
    p_organization: organizationId,
    p_name: updates.name,
    p_code: updates.code,
    p_location_type: updates.location_type,
    p_description: updates.description,
    p_expected_version: expectedVersion,
  });
}

export async function archiveLocation(
  locationId: EntityId,
  organizationId: EntityId,
  expectedVersion: number
): Promise<void> {
  await callDoor("archive_inventory_location", {
    p_location: locationId,
    p_organization: organizationId,
    p_expected_version: expectedVersion,
  });
}
