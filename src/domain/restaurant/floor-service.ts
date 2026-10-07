/**
 * The restaurant floor: the sections of the active outlet and the covers inside them
 * (Prompt #04 §18-§22, migration 015; the derived read is 016's view).
 *
 * Four schema facts decide the shape of every function here:
 *
 *   - There is NO read door. 015 says so out loud: the floor map is a plain SELECT on
 *     `dining_areas` and `restaurant_tables` under their outlet policies, and wrapping it in a
 *     SECURITY DEFINER function would grant more reach than the policy does and buy nothing.
 *     The one resolved read is `public.restaurant_table_status` (016), which is
 *     `security_invoker` for the same reason — it reads under the caller's own RLS.
 *   - Two statuses, two doors. `status` is lifecycle (ACTIVE/ARCHIVED) and `service_status` is
 *     the operational fact a person holds. The latter is CHECKed to three values: OCCUPIED and
 *     RESERVED are structurally absent, so nothing in this file can put a cover into them.
 *     They come back from `listTableStatuses` derived from live orders.
 *   - Retirement is one-way. 015 ships `archive_dining_area` and `archive_restaurant_table`
 *     with no restore twin, so a retired section or cover is retired; the screens say so
 *     instead of offering a button that has no door behind it.
 *   - Placement is not unlimited. `update_restaurant_table` coalesces `shape`, `position_x`
 *     and `position_y`, so an omitted key leaves the column alone and there is no value that
 *     clears it back to NULL. A screen must never present "unset the shape" as an option.
 *
 * Writes all go through a door — `authenticated` holds no DML grant on these two tables — and
 * each door returns the row it wrote, so no caller re-selects it.
 */

import { requireSupabase } from "@/db/client";
import { asRead, callDoor, callDoorRow, camelRows } from "@/db/rpc";
import type { EntityId } from "@/domain/identity/types";
import type {
  DiningArea,
  RestaurantTable,
  TableServiceStatus,
  TableShape,
  TableStatus,
} from "./types";

const AREAS = "dining_areas";
const TABLES = "restaurant_tables";
const TABLE_STATUS = "restaurant_table_status";

const AREA_COLUMNS =
  "id, organization_id, property_id, outlet_id, name, description, display_order, " +
  "status, archived_at, version, created_at, updated_at, created_by";

const TABLE_COLUMNS =
  "id, organization_id, property_id, outlet_id, area_id, name, code, capacity, status, " +
  "service_status, display_order, position_x, position_y, shape, archived_at, version, " +
  "created_at, updated_at, created_by";

const STATUS_COLUMNS =
  "table_id, organization_id, property_id, outlet_id, area_id, area_name, table_name, " +
  "table_code, capacity, service_status, live_orders, derived_status";

/* --------------------------------------------------------------------- scope */

/** The three ancestors the floor reads are scoped by; none of them is inferred here. */
export type FloorScope = {
  organizationId: EntityId;
  propertyId: EntityId;
  outletId: EntityId;
};

/** `{ includeArchived: true }` opts retired rows back into a read. */
export type ArchivedRead = {
  includeArchived?: boolean;
};

/** One entry of a reorder answer: the row and the rank the door finally gave it. */
export type FloorOrder = {
  id: EntityId;
  displayOrder: number;
};

/* --------------------------------------------------------------------- reads */

/** Every section of the active outlet, in the operator's own floor-map order. */
export async function listDiningAreas(
  scope: FloorScope,
  options: ArchivedRead = {},
): Promise<DiningArea[]> {
  const chain = requireSupabase()
    .from(AREAS)
    .select(AREA_COLUMNS)
    .eq("organization_id", scope.organizationId)
    .eq("property_id", scope.propertyId)
    .eq("outlet_id", scope.outletId);
  // A filter mutates the chain and returns it, so an optional predicate is an `if` rather
  // than a ternary whose two builder types would no longer unify.
  if (options.includeArchived !== true) chain.neq("status", "ARCHIVED");
  return camelRows<DiningArea>(asRead(chain.order("display_order").order("name")));
}

/** Every cover of the active outlet, ordered by area then rank within it. */
export async function listTables(
  scope: FloorScope,
  options: ArchivedRead = {},
): Promise<RestaurantTable[]> {
  const chain = requireSupabase()
    .from(TABLES)
    .select(TABLE_COLUMNS)
    .eq("organization_id", scope.organizationId)
    .eq("property_id", scope.propertyId)
    .eq("outlet_id", scope.outletId);
  if (options.includeArchived !== true) chain.neq("status", "ARCHIVED");
  return camelRows<RestaurantTable>(
    asRead(chain.order("area_id").order("display_order").order("code")),
  );
}

/**
 * The operational truth of every live cover, resolved by 016's view.
 *
 * The floor map draws THIS, not `service_status`: §54's contradiction — a cover marked
 * AVAILABLE with an unpaid order sitting on it — is refused by the precedence the view
 * implements (OUT_OF_SERVICE > CLEANING > OCCUPIED > RESERVED > AVAILABLE), and a client that
 * reimplemented that ordering would be a second, drift-prone copy of it.
 */
export async function listTableStatuses(scope: FloorScope): Promise<TableStatus[]> {
  return camelRows<TableStatus>(
    asRead(
      requireSupabase()
        .from(TABLE_STATUS)
        .select(STATUS_COLUMNS)
        .eq("organization_id", scope.organizationId)
        .eq("property_id", scope.propertyId)
        .eq("outlet_id", scope.outletId)
        .order("area_id")
        .order("table_code"),
    ),
  );
}

/* ------------------------------------------------------------------ dining areas */

/**
 * Update convention for this domain: an omitted key sends nothing and the door leaves the
 * column alone; `""` on a blankable column (`description`) is the operator clearing it and the
 * door stores NULL — never send `null`, which these doors read as "not edited".
 */
export type NewDiningArea = {
  /** The only scope a section takes: its organization and property are read off the outlet. */
  outletId: EntityId;
  name: string;
  description?: string;
  /** Left unset, the door puts the section at the end of the floor map. */
  displayOrder?: number;
};

export type DiningAreaUpdate = {
  areaId: EntityId;
  name?: string;
  /** `""` clears the stored description; omit the key to leave it alone. */
  description?: string;
  displayOrder?: number;
  /** The loaded row's version — 005's lost-update guard. */
  expectedVersion: number;
};

/** Retiring a section: `table.archive` plus a mandatory reason, and no live table inside it. */
export type AreaRetire = {
  areaId: EntityId;
  reason: string;
};

export async function createDiningArea(input: NewDiningArea): Promise<DiningArea> {
  return callDoorRow<DiningArea>("create_dining_area", {
    outlet: input.outletId,
    name: input.name,
    description: input.description,
    displayOrder: input.displayOrder,
  });
}

export async function updateDiningArea(input: DiningAreaUpdate): Promise<DiningArea> {
  return callDoorRow<DiningArea>("update_dining_area", {
    area: input.areaId,
    name: input.name,
    description: input.description,
    displayOrder: input.displayOrder,
    expectedVersion: input.expectedVersion,
  });
}

export async function archiveDiningArea(input: AreaRetire): Promise<DiningArea> {
  return callDoorRow<DiningArea>("archive_dining_area", {
    area: input.areaId,
    reason: input.reason,
  });
}

/**
 * Resequence the outlet's sections. `areaIds` must be EXACTLY the live set — same members, no
 * duplicates, none missing — or 015 refuses the whole call (`NIVAAS_INVALID_PERMUTATION`), so
 * the caller sends the visible order rather than a diff of two rows.
 */
export async function reorderDiningAreas(
  outletId: EntityId,
  areaIds: readonly EntityId[],
): Promise<{ outletId: EntityId; order: FloorOrder[] }> {
  return callDoor("reorder_dining_areas", { outlet: outletId, areaIds });
}

/* ---------------------------------------------------------------------- tables */

export type NewRestaurantTable = {
  /** The only scope a cover takes: its area is live, and the outlet above it is read off it. */
  areaId: EntityId;
  name: string;
  /** Outlet-unique among live rows: the handle an order, a KOT and a bill print. */
  code: string;
  capacity: number;
  shape?: TableShape;
  /**
   * Canvas coordinates for §21's map (0-10000). Numbers, not money text: 015 says geometry is
   * drawn, not billed, and deliberately gives these columns no scale rule.
   */
  positionX?: number;
  positionY?: number;
  displayOrder?: number;
};

export type RestaurantTableUpdate = {
  tableId: EntityId;
  /** A move into a live area of the SAME outlet; the door re-proves the chain afterwards. */
  areaId?: EntityId;
  name?: string;
  /** Editable here (unlike an outlet's code): a cover's handle can be restated. */
  code?: string;
  capacity?: number;
  shape?: TableShape;
  positionX?: number;
  positionY?: number;
  displayOrder?: number;
  expectedVersion: number;
};

export type TableRetire = {
  tableId: EntityId;
  reason: string;
};

/**
 * The one operational write a person gets (§20): cleaning, out of service, back to available.
 * A reason is mandatory in every direction, because "why did this cover leave the floor" is the
 * question a later shift asks. OCCUPIED is not reachable from here and no door sends it.
 */
export type TableServiceStatusChange = {
  tableId: EntityId;
  serviceStatus: TableServiceStatus;
  reason: string;
  expectedVersion?: number;
};

export async function createRestaurantTable(
  input: NewRestaurantTable,
): Promise<RestaurantTable> {
  return callDoorRow<RestaurantTable>("create_restaurant_table", {
    area: input.areaId,
    name: input.name,
    code: input.code,
    capacity: input.capacity,
    shape: input.shape,
    positionX: input.positionX,
    positionY: input.positionY,
    displayOrder: input.displayOrder,
  });
}

export async function updateRestaurantTable(
  input: RestaurantTableUpdate,
): Promise<RestaurantTable> {
  return callDoorRow<RestaurantTable>("update_restaurant_table", {
    table: input.tableId,
    area: input.areaId,
    name: input.name,
    code: input.code,
    capacity: input.capacity,
    shape: input.shape,
    positionX: input.positionX,
    positionY: input.positionY,
    displayOrder: input.displayOrder,
    expectedVersion: input.expectedVersion,
  });
}

/** The same full-permutation rule one level down, scoped to one area. */
export async function reorderTables(
  areaId: EntityId,
  tableIds: readonly EntityId[],
): Promise<{ areaId: EntityId; order: FloorOrder[] }> {
  return callDoor("reorder_restaurant_tables", { area: areaId, tableIds });
}

/** Refused while the cover is not AVAILABLE (015) or has a live order on it (016). */
export async function archiveRestaurantTable(input: TableRetire): Promise<RestaurantTable> {
  return callDoorRow<RestaurantTable>("archive_restaurant_table", {
    table: input.tableId,
    reason: input.reason,
  });
}

export async function setTableServiceStatus(
  input: TableServiceStatusChange,
): Promise<RestaurantTable> {
  return callDoorRow<RestaurantTable>("set_table_service_status", {
    table: input.tableId,
    serviceStatus: input.serviceStatus,
    reason: input.reason,
    expectedVersion: input.expectedVersion,
  });
}
