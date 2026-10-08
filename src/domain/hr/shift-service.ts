/**
 * HR shift service — shift masters, roster, swap requests.
 * Reads are plain SELECTs under RLS; writes go through security-definer doors.
 */

import { requireSupabase } from "@/db/client";
import { asRead, callDoor, camelRows, firstCamelRow } from "@/db/rpc";
import type { EntityId } from "@/domain/identity/types";
import type {
  HRScope,
  Shift,
  EmployeeShift,
  ShiftSwap,
  ShiftScheduleStatus,
  ShiftSwapStatus,
} from "./types";

const SHIFTS = "shifts";
const EMPLOYEE_SHIFTS = "employee_shifts";
const SHIFT_SWAPS = "shift_swaps";

const SHIFT_COLUMNS =
  "id, organization_id, property_id, name, code, start_time, end_time, " +
  "break_minutes, description, is_active, created_at, updated_at";

const EMPLOYEE_SHIFT_COLUMNS =
  "id, organization_id, employee_id, shift_id, property_id, shift_date, " +
  "status, notes, created_at, updated_at";

const SHIFT_SWAP_COLUMNS =
  "id, organization_id, requester_id, responder_id, requester_shift_id, " +
  "responder_shift_id, swap_date, reason, status, reviewed_by, reviewed_at, " +
  "created_at, updated_at";

// =================================================================== filters

export type RosterFilters = {
  dateFrom?: string;
  dateTo?: string;
  employeeId?: EntityId | null;
  status?: ShiftScheduleStatus;
};

export type ShiftSwapFilters = {
  status?: ShiftSwapStatus;
  employeeId?: EntityId | null;
};

// =================================================================== shift masters

export async function listShifts(
  scope: HRScope,
): Promise<Shift[]> {
  const sb = requireSupabase();
  const chain = sb
    .from(SHIFTS)
    .select(SHIFT_COLUMNS)
    .eq("organization_id", scope.organizationId)
    .eq("property_id", scope.propertyId)
    .order("start_time");

  return camelRows<Shift>(asRead(chain));
}

export async function getShift(
  scope: HRScope,
  shiftId: EntityId,
): Promise<Shift | null> {
  const sb = requireSupabase();
  return firstCamelRow<Shift>(
    asRead(
      sb
        .from(SHIFTS)
        .select(SHIFT_COLUMNS)
        .eq("id", shiftId)
        .eq("organization_id", scope.organizationId),
    ),
  );
}

export async function createShift(
  scope: HRScope,
  params: {
    name: string;
    code?: string | null;
    startTime: string;
    endTime: string;
    breakMinutes?: number;
    description?: string | null;
  },
): Promise<EntityId> {
  return callDoor<EntityId>("create_shift", {
    propertyId: scope.propertyId,
    name: params.name,
    code: params.code ?? null,
    startTime: params.startTime,
    endTime: params.endTime,
    breakMinutes: params.breakMinutes ?? 0,
    description: params.description ?? null,
  });
}

export async function updateShift(
  shiftId: EntityId,
  params: {
    name?: string;
    code?: string;
    startTime?: string;
    endTime?: string;
    breakMinutes?: number;
    description?: string;
    isActive?: boolean;
  },
): Promise<void> {
  await callDoor("update_shift", {
    shiftId,
    ...params,
  });
}

// =================================================================== roster

export async function listEmployeeShifts(
  scope: HRScope,
  filters: RosterFilters = {},
): Promise<EmployeeShift[]> {
  const sb = requireSupabase();
  let chain = sb
    .from(EMPLOYEE_SHIFTS)
    .select(EMPLOYEE_SHIFT_COLUMNS)
    .eq("organization_id", scope.organizationId)
    .eq("property_id", scope.propertyId);

  if (filters.employeeId !== undefined) {
    if (filters.employeeId === null) {
      chain = chain.is("employee_id", null);
    } else {
      chain = chain.eq("employee_id", filters.employeeId);
    }
  }
  if (filters.status) chain = chain.eq("status", filters.status);
  if (filters.dateFrom) chain = chain.gte("shift_date", filters.dateFrom);
  if (filters.dateTo) chain = chain.lte("shift_date", filters.dateTo);

  chain = chain.order("shift_date", { ascending: true });
  return camelRows<EmployeeShift>(asRead(chain));
}

export async function assignShift(
  scope: HRScope,
  params: {
    employeeId: EntityId;
    shiftId: EntityId;
    shiftDate: string;
  },
): Promise<EntityId> {
  return callDoor<EntityId>("assign_shift", {
    employeeId: params.employeeId,
    shiftId: params.shiftId,
    propertyId: scope.propertyId,
    shiftDate: params.shiftDate,
  });
}

export async function cancelShiftAssignment(
  assignmentId: EntityId,
): Promise<void> {
  await callDoor("cancel_shift_assignment", { assignmentId });
}

// =================================================================== shift swaps

export async function listShiftSwaps(
  scope: HRScope,
  filters: ShiftSwapFilters = {},
): Promise<ShiftSwap[]> {
  const sb = requireSupabase();
  let chain = sb
    .from(SHIFT_SWAPS)
    .select(SHIFT_SWAP_COLUMNS)
    .eq("organization_id", scope.organizationId);

  if (filters.status) chain = chain.eq("status", filters.status);
  if (filters.employeeId !== undefined) {
    if (filters.employeeId === null) {
      chain = chain.is("requester_id", null);
    } else {
      chain = chain.or(
        `requester_id.eq.${filters.employeeId},responder_id.eq.${filters.employeeId}`,
      );
    }
  }

  chain = chain.order("created_at", { ascending: false });
  return camelRows<ShiftSwap>(asRead(chain));
}

export async function requestShiftSwap(
  params: {
    requesterId: EntityId;
    responderId: EntityId;
    requesterShiftId?: EntityId | null;
    responderShiftId?: EntityId | null;
    swapDate: string;
    reason?: string | null;
  },
): Promise<EntityId> {
  return callDoor<EntityId>("request_shift_swap", {
    requesterId: params.requesterId,
    responderId: params.responderId,
    requesterShiftId: params.requesterShiftId,
    responderShiftId: params.responderShiftId ?? null,
    swapDate: params.swapDate,
    reason: params.reason ?? null,
  });
}

export async function approveShiftSwap(
  swapId: EntityId,
): Promise<void> {
  await callDoor("approve_shift_swap", { swapId });
}

export async function rejectShiftSwap(
  swapId: EntityId,
): Promise<void> {
  await callDoor("reject_shift_swap", { swapId });
}
