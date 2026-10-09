/**
 * Stays service (Prompt #08 §29-§32, §39-§42, migration 037).
 *
 * Stays represent actual occupancy. Created at check-in, ended at check-out.
 * Separate from reservations (which are bookings).
 */

import { requireSupabase } from "@/db/client";
import { asRead, callDoorRow, camelRows, firstCamelRow } from "@/db/rpc";
import type { EntityId } from "@/domain/identity/types";
import type {
  Stay,
  StayGuest,
  StayRoomMove,
  StayStatus,
  StayGuestRole,
  RoomMoveReason,
} from "./types";

const STAYS = "stays";
const STAY_GUESTS = "stay_guests";
const STAY_ROOM_MOVES = "stay_room_moves";

const STAY_COLUMNS =
  "id, organization_id, property_id, reservation_id, primary_guest_id, room_id, " +
  "check_in_at, expected_check_out_at, actual_check_out_at, status, notes, version, " +
  "created_at, updated_at, created_by";

const STAY_GUEST_COLUMNS =
  "id, stay_id, guest_id, role, checked_in_at, checked_out_at, created_at";

const STAY_ROOM_MOVE_COLUMNS =
  "id, stay_id, from_room_id, to_room_id, moved_at, reason, moved_by";

/* --------------------------------------------------------------------- scope */

export type StayScope = {
  organizationId: EntityId;
  propertyId: EntityId;
};

/* --------------------------------------------------------------------- reads */

/** List stays for the property. */
export async function listStays(
  scope: StayScope,
  options?: {
    status?: StayStatus | StayStatus[];
    checkInDateFrom?: string;
    checkInDateTo?: string;
  },
): Promise<Stay[]> {
  const sb = requireSupabase();
  let chain = sb
    .from(STAYS)
    .select(STAY_COLUMNS)
    .eq("organization_id", scope.organizationId)
    .eq("property_id", scope.propertyId);

  if (options?.status) {
    if (Array.isArray(options.status)) {
      chain = chain.in("status", options.status);
    } else {
      chain = chain.eq("status", options.status);
    }
  }

  if (options?.checkInDateFrom) {
    chain = chain.gte("check_in_at", options.checkInDateFrom);
  }

  if (options?.checkInDateTo) {
    chain = chain.lte("check_in_at", options.checkInDateTo);
  }

  chain = chain.order("check_in_at", { ascending: false });

  return camelRows<Stay>(asRead(chain));
}

/** Get a single stay by ID. */
export async function getStay(
  scope: StayScope,
  stayId: EntityId,
): Promise<Stay | null> {
  const sb = requireSupabase();
  return firstCamelRow<Stay>(
    asRead(
      sb
        .from(STAYS)
        .select(STAY_COLUMNS)
        .eq("id", stayId)
        .eq("organization_id", scope.organizationId)
        .eq("property_id", scope.propertyId),
    ),
  );
}

/** Get guests for a stay. */
export async function getStayGuests(
  stayId: EntityId,
): Promise<StayGuest[]> {
  const sb = requireSupabase();
  return camelRows<StayGuest>(
    asRead(
      sb
        .from(STAY_GUESTS)
        .select(STAY_GUEST_COLUMNS)
        .eq("stay_id", stayId)
        .order("created_at", { ascending: true }),
    ),
  );
}

/** Get room moves for a stay. */
export async function getStayRoomMoves(
  stayId: EntityId,
): Promise<StayRoomMove[]> {
  const sb = requireSupabase();
  return camelRows<StayRoomMove>(
    asRead(
      sb
        .from(STAY_ROOM_MOVES)
        .select(STAY_ROOM_MOVE_COLUMNS)
        .eq("stay_id", stayId)
        .order("moved_at", { ascending: true }),
    ),
  );
}

/* --------------------------------------------------------------------- writes */

/** Check in a guest (creates a stay). */
export async function checkIn(
  scope: StayScope,
  reservationId: EntityId,
  roomId: EntityId,
  expectedCheckOutAt: string,
): Promise<Stay> {
  return callDoorRow<Stay>("check_in", {
    p_reservation: reservationId,
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_room: roomId,
    p_expected_check_out: expectedCheckOutAt,
  });
}

/** Check out a guest. */
export async function checkOut(
  scope: StayScope,
  stayId: EntityId,
): Promise<Stay> {
  return callDoorRow<Stay>("check_out", {
    p_stay: stayId,
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
  });
}

/** Extend a stay. */
export async function extendStay(
  scope: StayScope,
  stayId: EntityId,
  newCheckOutDate: string,
  expectedVersion: number,
): Promise<Stay> {
  return callDoorRow<Stay>("extend_stay", {
    p_stay: stayId,
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_new_check_out: newCheckOutDate,
    p_expected_version: expectedVersion,
  });
}

/** Move a guest to a different room. */
export async function moveRoom(
  scope: StayScope,
  stayId: EntityId,
  toRoomId: EntityId,
  reason: RoomMoveReason,
): Promise<Stay> {
  return callDoorRow<Stay>("move_room", {
    p_stay: stayId,
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_new_room: toRoomId,
    p_reason: reason,
  });
}

/** Add an additional guest to a stay. */
export async function addStayGuest(
  scope: StayScope,
  stayId: EntityId,
  guestId: EntityId,
  role: StayGuestRole,
): Promise<StayGuest> {
  return callDoorRow<StayGuest>("add_stay_guest", {
    p_stay: stayId,
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_guest: guestId,
    p_role: role,
  });
}
