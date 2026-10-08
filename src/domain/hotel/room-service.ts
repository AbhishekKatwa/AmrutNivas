/**
 * Room types and rooms service (Prompt #08 §15-§18, migration 034).
 *
 * Room types are categories (Deluxe, Suite). Rooms are physical rooms with numbers.
 * Each room has two orthogonal statuses: operational_status and housekeeping_status.
 */

import { requireSupabase } from "@/db/client";
import { asRead, callDoor, callDoorRow, camelRows, firstCamelRow } from "@/db/rpc";
import type { EntityId } from "@/domain/identity/types";
import type {
  RoomType,
  Room,
  Amenity,
  RoomBlock,
  OperationalStatus,
  HousekeepingStatus,
  BlockType,
} from "./types";

const ROOM_TYPES = "room_types";
const ROOMS = "rooms";
const AMENITIES = "amenities";
const ROOM_BLOCKS = "room_blocks";

const ROOM_TYPE_COLUMNS =
  "id, organization_id, property_id, code, name, description, max_occupancy, base_occupancy, " +
  "bed_configuration, room_size_sqft, status, archived_at, version, created_at, updated_at";

const ROOM_COLUMNS =
  "id, organization_id, property_id, room_type_id, room_number, floor, building, " +
  "operational_status, housekeeping_status, notes, status, archived_at, version, " +
  "created_at, updated_at";

const AMENITY_COLUMNS =
  "id, organization_id, code, name, category, icon, description, created_at, updated_at";

const ROOM_BLOCK_COLUMNS =
  "id, organization_id, property_id, room_id, block_type, start_date, end_date, reason, " +
  "status, cancelled_at, cancelled_by, cancellation_reason, version, created_at, updated_at, created_by";

/* --------------------------------------------------------------------- scope */

export type RoomScope = {
  organizationId: EntityId;
  propertyId: EntityId;
};

export type ArchivedRead = {
  includeArchived?: boolean;
};

/* --------------------------------------------------------------------- room types */

/** List room types for the property. */
export async function listRoomTypes(
  scope: RoomScope,
  options: ArchivedRead = {},
): Promise<RoomType[]> {
  const sb = requireSupabase();
  let chain = sb
    .from(ROOM_TYPES)
    .select(ROOM_TYPE_COLUMNS)
    .eq("organization_id", scope.organizationId)
    .eq("property_id", scope.propertyId);

  if (!options.includeArchived) {
    chain = chain.eq("status", "ACTIVE");
  }

  chain = chain.order("code", { ascending: true });

  return camelRows<RoomType>(asRead(chain));
}

/** Get a single room type by ID. */
export async function getRoomType(
  scope: RoomScope,
  roomTypeId: EntityId,
): Promise<RoomType | null> {
  const sb = requireSupabase();
  return firstCamelRow<RoomType>(
    asRead(
      sb
        .from(ROOM_TYPES)
        .select(ROOM_TYPE_COLUMNS)
        .eq("id", roomTypeId)
        .eq("organization_id", scope.organizationId)
        .eq("property_id", scope.propertyId),
    ),
  );
}

/** Create a new room type. */
export async function createRoomType(
  scope: RoomScope,
  params: {
    code: string;
    name: string;
    description?: string | null;
    maxOccupancy: number;
    baseOccupancy: number;
    bedConfiguration?: Record<string, unknown> | null;
    roomSizeSqft?: number | null;
  },
): Promise<RoomType> {
  return callDoorRow<RoomType>("create_room_type", {
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_code: params.code,
    p_name: params.name,
    p_description: params.description ?? null,
    p_max_occupancy: params.maxOccupancy,
    p_base_occupancy: params.baseOccupancy,
    p_bed_configuration: params.bedConfiguration ?? null,
    p_room_size_sqft: params.roomSizeSqft ?? null,
  });
}

/** Update a room type. */
export async function updateRoomType(
  scope: RoomScope,
  roomTypeId: EntityId,
  params: {
    code?: string;
    name?: string;
    description?: string | null;
    maxOccupancy?: number;
    baseOccupancy?: number;
    bedConfiguration?: Record<string, unknown> | null;
    roomSizeSqft?: number | null;
    expectedVersion: number;
  },
): Promise<RoomType> {
  return callDoorRow<RoomType>("update_room_type", {
    p_room_type: roomTypeId,
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_expected_version: params.expectedVersion,
    p_code: params.code,
    p_name: params.name,
    p_description: params.description,
    p_max_occupancy: params.maxOccupancy,
    p_base_occupancy: params.baseOccupancy,
    p_bed_configuration: params.bedConfiguration,
    p_room_size_sqft: params.roomSizeSqft,
  });
}

/** Archive a room type (one-way). */
export async function archiveRoomType(
  scope: RoomScope,
  roomTypeId: EntityId,
  expectedVersion: number,
): Promise<void> {
  await callDoor("archive_room_type", {
    p_room_type: roomTypeId,
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_expected_version: expectedVersion,
  });
}

/* --------------------------------------------------------------------- amenities */

/** List amenities for the organization. */
export async function listAmenities(scope: RoomScope): Promise<Amenity[]> {
  const sb = requireSupabase();
  return camelRows<Amenity>(
    asRead(
      sb
        .from(AMENITIES)
        .select(AMENITY_COLUMNS)
        .eq("organization_id", scope.organizationId)
        .order("code", { ascending: true }),
    ),
  );
}

/** Create a new amenity. */
export async function createAmenity(
  scope: RoomScope,
  params: {
    code: string;
    name: string;
    category?: string | null;
    icon?: string | null;
    description?: string | null;
  },
): Promise<Amenity> {
  return callDoorRow<Amenity>("create_amenity", {
    p_organization: scope.organizationId,
    p_code: params.code,
    p_name: params.name,
    p_category: params.category ?? null,
    p_icon: params.icon ?? null,
    p_description: params.description ?? null,
  });
}

/** Update an amenity. */
export async function updateAmenity(
  scope: RoomScope,
  amenityId: EntityId,
  params: {
    code?: string;
    name?: string;
    category?: string | null;
    icon?: string | null;
    description?: string | null;
  },
): Promise<Amenity> {
  return callDoorRow<Amenity>("update_amenity", {
    p_amenity: amenityId,
    p_organization: scope.organizationId,
    p_code: params.code,
    p_name: params.name,
    p_category: params.category,
    p_icon: params.icon,
    p_description: params.description,
  });
}

/* --------------------------------------------------------------------- rooms */

/** List rooms for the property. */
export async function listRooms(
  scope: RoomScope,
  options: ArchivedRead = {},
): Promise<Room[]> {
  const sb = requireSupabase();
  let chain = sb
    .from(ROOMS)
    .select(ROOM_COLUMNS)
    .eq("organization_id", scope.organizationId)
    .eq("property_id", scope.propertyId);

  if (!options.includeArchived) {
    chain = chain.eq("status", "ACTIVE");
  }

  chain = chain.order("room_number", { ascending: true });

  return camelRows<Room>(asRead(chain));
}

/** Get a single room by ID. */
export async function getRoom(
  scope: RoomScope,
  roomId: EntityId,
): Promise<Room | null> {
  const sb = requireSupabase();
  return firstCamelRow<Room>(
    asRead(
      sb
        .from(ROOMS)
        .select(ROOM_COLUMNS)
        .eq("id", roomId)
        .eq("organization_id", scope.organizationId)
        .eq("property_id", scope.propertyId),
    ),
  );
}

/** Create a new room. */
export async function createRoom(
  scope: RoomScope,
  params: {
    roomTypeId: EntityId;
    roomNumber: string;
    floor?: string | null;
    building?: string | null;
    notes?: string | null;
  },
): Promise<Room> {
  return callDoorRow<Room>("create_room", {
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_room_type: params.roomTypeId,
    p_room_number: params.roomNumber,
    p_floor: params.floor ?? null,
    p_building: params.building ?? null,
    p_notes: params.notes ?? null,
  });
}

/** Update a room. */
export async function updateRoom(
  scope: RoomScope,
  roomId: EntityId,
  params: {
    roomTypeId?: EntityId;
    roomNumber?: string;
    floor?: string | null;
    building?: string | null;
    notes?: string | null;
    expectedVersion: number;
  },
): Promise<Room> {
  return callDoorRow<Room>("update_room", {
    p_room: roomId,
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_expected_version: params.expectedVersion,
    p_room_type: params.roomTypeId,
    p_room_number: params.roomNumber,
    p_floor: params.floor,
    p_building: params.building,
    p_notes: params.notes,
  });
}

/** Set a room's operational status. */
export async function setRoomOperationalStatus(
  scope: RoomScope,
  roomId: EntityId,
  status: OperationalStatus,
  expectedVersion: number,
): Promise<Room> {
  return callDoorRow<Room>("set_room_operational_status", {
    p_room: roomId,
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_expected_version: expectedVersion,
    p_status: status,
  });
}

/** Set a room's housekeeping status. */
export async function setRoomHousekeepingStatus(
  scope: RoomScope,
  roomId: EntityId,
  status: HousekeepingStatus,
  expectedVersion: number,
): Promise<Room> {
  return callDoorRow<Room>("set_room_housekeeping_status", {
    p_room: roomId,
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_expected_version: expectedVersion,
    p_status: status,
  });
}

/** Archive a room (one-way). */
export async function archiveRoom(
  scope: RoomScope,
  roomId: EntityId,
  expectedVersion: number,
): Promise<void> {
  await callDoor("archive_room", {
    p_room: roomId,
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_expected_version: expectedVersion,
  });
}

/* --------------------------------------------------------------------- room blocks */

/** List active room blocks. */
export async function listRoomBlocks(scope: RoomScope): Promise<RoomBlock[]> {
  const sb = requireSupabase();
  return camelRows<RoomBlock>(
    asRead(
      sb
        .from(ROOM_BLOCKS)
        .select(ROOM_BLOCK_COLUMNS)
        .eq("organization_id", scope.organizationId)
        .eq("property_id", scope.propertyId)
        .eq("status", "ACTIVE")
        .order("start_date", { ascending: true }),
    ),
  );
}

/** Create a room block. */
export async function createRoomBlock(
  scope: RoomScope,
  params: {
    roomId: EntityId;
    blockType: BlockType;
    startDate: string;
    endDate: string;
    reason?: string | null;
  },
): Promise<RoomBlock> {
  return callDoorRow<RoomBlock>("create_room_block", {
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_room: params.roomId,
    p_block_type: params.blockType,
    p_start_date: params.startDate,
    p_end_date: params.endDate,
    p_reason: params.reason ?? null,
  });
}

/** Update a room block. */
export async function updateRoomBlock(
  scope: RoomScope,
  blockId: EntityId,
  params: {
    blockType?: BlockType;
    startDate?: string;
    endDate?: string;
    reason?: string | null;
    expectedVersion: number;
  },
): Promise<RoomBlock> {
  return callDoorRow<RoomBlock>("update_room_block", {
    p_block: blockId,
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_expected_version: params.expectedVersion,
    p_block_type: params.blockType,
    p_start_date: params.startDate,
    p_end_date: params.endDate,
    p_reason: params.reason,
  });
}

/** Remove (cancel) a room block. */
export async function removeRoomBlock(
  scope: RoomScope,
  blockId: EntityId,
  reason?: string,
): Promise<void> {
  await callDoor("remove_room_block", {
    p_block: blockId,
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_reason: reason ?? null,
  });
}
