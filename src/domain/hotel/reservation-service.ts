/**
 * Reservations service (Prompt #08 §25-§28, migration 036).
 *
 * Reservations are bookings (future stays). They follow a state machine:
 * INQUIRY → TENTATIVE → CONFIRMED → CHECKED_IN → CHECKED_OUT
 * with CANCELLED and NO_SHOW branches.
 */

import { requireSupabase } from "@/db/client";
import { asRead, callDoorRow, camelRows, firstCamelRow } from "@/db/rpc";
import type { EntityId } from "@/domain/identity/types";
import type {
  Reservation,
  ReservationRateSnapshot,
  ReservationRoomAssignment,
  ReservationStatus,
  ReservationSource,
} from "./types";

const RESERVATIONS = "reservations";
const RESERVATION_RATE_SNAPSHOTS = "reservation_rate_snapshots";
const RESERVATION_ROOM_ASSIGNMENTS = "reservation_room_assignments";

const RESERVATION_COLUMNS =
  "id, organization_id, property_id, reservation_number, source, status, primary_guest_id, " +
  "arrival_date, departure_date, adults, children, infants, room_type_id, room_id, rate_plan_id, " +
  "currency, total_amount, deposit_amount, deposit_status, special_requests, notes, " +
  "cancelled_at, cancelled_by, cancellation_reason, no_show_at, version, created_at, updated_at, created_by";

const RATE_SNAPSHOT_COLUMNS =
  "id, organization_id, reservation_id, rate_date, room_type_id, rate_plan_id, " +
  "room_rate, tax_amount, discount_amount, total_amount, created_at";

const ROOM_ASSIGNMENT_COLUMNS =
  "id, organization_id, reservation_id, room_id, assigned_at, unassigned_at, reason, assigned_by";

/* --------------------------------------------------------------------- scope */

export type ReservationScope = {
  organizationId: EntityId;
  propertyId: EntityId;
};

/* --------------------------------------------------------------------- reads */

/** List reservations for the property. */
export async function listReservations(
  scope: ReservationScope,
  options?: {
    status?: ReservationStatus | ReservationStatus[];
    arrivalDateFrom?: string;
    arrivalDateTo?: string;
  },
): Promise<Reservation[]> {
  const sb = requireSupabase();
  let chain = sb
    .from(RESERVATIONS)
    .select(RESERVATION_COLUMNS)
    .eq("organization_id", scope.organizationId)
    .eq("property_id", scope.propertyId);

  if (options?.status) {
    if (Array.isArray(options.status)) {
      chain = chain.in("status", options.status);
    } else {
      chain = chain.eq("status", options.status);
    }
  }

  if (options?.arrivalDateFrom) {
    chain = chain.gte("arrival_date", options.arrivalDateFrom);
  }

  if (options?.arrivalDateTo) {
    chain = chain.lte("arrival_date", options.arrivalDateTo);
  }

  chain = chain.order("arrival_date", { ascending: true });

  return camelRows<Reservation>(asRead(chain));
}

/** Get a single reservation by ID. */
export async function getReservation(
  scope: ReservationScope,
  reservationId: EntityId,
): Promise<Reservation | null> {
  const sb = requireSupabase();
  return firstCamelRow<Reservation>(
    asRead(
      sb
        .from(RESERVATIONS)
        .select(RESERVATION_COLUMNS)
        .eq("id", reservationId)
        .eq("organization_id", scope.organizationId)
        .eq("property_id", scope.propertyId),
    ),
  );
}

/** Get rate snapshots for a reservation. */
export async function getReservationRateSnapshots(
  scope: ReservationScope,
  reservationId: EntityId,
): Promise<ReservationRateSnapshot[]> {
  const sb = requireSupabase();
  return camelRows<ReservationRateSnapshot>(
    asRead(
      sb
        .from(RESERVATION_RATE_SNAPSHOTS)
        .select(RATE_SNAPSHOT_COLUMNS)
        .eq("reservation_id", reservationId)
        .eq("organization_id", scope.organizationId)
        .order("rate_date", { ascending: true }),
    ),
  );
}

/** Get room assignments for a reservation. */
export async function getReservationRoomAssignments(
  scope: ReservationScope,
  reservationId: EntityId,
): Promise<ReservationRoomAssignment[]> {
  const sb = requireSupabase();
  return camelRows<ReservationRoomAssignment>(
    asRead(
      sb
        .from(RESERVATION_ROOM_ASSIGNMENTS)
        .select(ROOM_ASSIGNMENT_COLUMNS)
        .eq("reservation_id", reservationId)
        .eq("organization_id", scope.organizationId)
        .order("assigned_at", { ascending: true }),
    ),
  );
}

/* --------------------------------------------------------------------- writes */

/** Create a new reservation. */
export async function createReservation(
  scope: ReservationScope,
  params: {
    source: ReservationSource;
    primaryGuestId: EntityId;
    arrivalDate: string;
    departureDate: string;
    adults: number;
    children?: number;
    infants?: number;
    roomTypeId?: EntityId | null;
    ratePlanId?: EntityId | null;
    currency?: string;
    specialRequests?: string | null;
    notes?: string | null;
  },
): Promise<Reservation> {
  return callDoorRow<Reservation>("create_reservation", {
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_source: params.source,
    p_primary_guest: params.primaryGuestId,
    p_arrival_date: params.arrivalDate,
    p_departure_date: params.departureDate,
    p_adults: params.adults,
    p_children: params.children ?? 0,
    p_infants: params.infants ?? 0,
    p_room_type: params.roomTypeId ?? null,
    p_rate_plan: params.ratePlanId ?? null,
    p_currency: params.currency ?? "INR",
    p_special_requests: params.specialRequests ?? null,
    p_notes: params.notes ?? null,
  });
}

/** Update a reservation. */
export async function updateReservation(
  scope: ReservationScope,
  reservationId: EntityId,
  params: {
    source?: ReservationSource;
    primaryGuestId?: EntityId;
    arrivalDate?: string;
    departureDate?: string;
    adults?: number;
    children?: number;
    infants?: number;
    roomTypeId?: EntityId | null;
    ratePlanId?: EntityId | null;
    specialRequests?: string | null;
    notes?: string | null;
    expectedVersion: number;
  },
): Promise<Reservation> {
  return callDoorRow<Reservation>("update_reservation", {
    p_reservation: reservationId,
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_expected_version: params.expectedVersion,
    p_source: params.source,
    p_primary_guest: params.primaryGuestId,
    p_arrival_date: params.arrivalDate,
    p_departure_date: params.departureDate,
    p_adults: params.adults,
    p_children: params.children,
    p_infants: params.infants,
    p_room_type: params.roomTypeId,
    p_rate_plan: params.ratePlanId,
    p_special_requests: params.specialRequests,
    p_notes: params.notes,
  });
}

/** Confirm a reservation. */
export async function confirmReservation(
  scope: ReservationScope,
  reservationId: EntityId,
  expectedVersion: number,
): Promise<Reservation> {
  return callDoorRow<Reservation>("confirm_reservation", {
    p_reservation: reservationId,
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_expected_version: expectedVersion,
  });
}

/** Cancel a reservation. */
export async function cancelReservation(
  scope: ReservationScope,
  reservationId: EntityId,
  reason: string,
  expectedVersion: number,
): Promise<Reservation> {
  return callDoorRow<Reservation>("cancel_reservation", {
    p_reservation: reservationId,
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_expected_version: expectedVersion,
    p_reason: reason,
  });
}

/** Mark a reservation as no-show. */
export async function markNoShow(
  scope: ReservationScope,
  reservationId: EntityId,
  expectedVersion: number,
): Promise<Reservation> {
  return callDoorRow<Reservation>("mark_no_show", {
    p_reservation: reservationId,
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_expected_version: expectedVersion,
  });
}

/** Assign a room to a reservation. */
export async function assignRoom(
  scope: ReservationScope,
  reservationId: EntityId,
  roomId: EntityId,
  reason?: string,
): Promise<ReservationRoomAssignment> {
  return callDoorRow<ReservationRoomAssignment>("assign_room", {
    p_reservation: reservationId,
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_room: roomId,
    p_reason: reason ?? null,
  });
}
