/**
 * HR leave service — leave types, leave requests, holidays.
 * Reads are plain SELECTs under RLS; writes go through security-definer doors.
 */

import { requireSupabase } from "@/db/client";
import { asRead, callDoor, camelRows, firstCamelRow } from "@/db/rpc";
import type { EntityId } from "@/domain/identity/types";
import type {
  HRScope,
  Holiday,
  LeaveType,
  LeaveRequest,
  HolidayType,
  LeaveTypeCategory,
  LeaveRequestStatus,
} from "./types";

const HOLIDAYS = "holidays";
const LEAVE_TYPES = "leave_types";
const LEAVE_REQUESTS = "leave_requests";

const HOLIDAY_COLUMNS =
  "id, organization_id, property_id, name, holiday_date, holiday_type, " +
  "description, is_recurring, created_at, updated_at";

const LEAVE_TYPE_COLUMNS =
  "id, organization_id, name, code, category, max_days_per_year, " +
  "is_paid, requires_approval, description, is_active, created_at, updated_at";

const LEAVE_REQUEST_COLUMNS =
  "id, organization_id, employee_id, leave_type_id, from_date, to_date, " +
  "days, reason, status, applied_on, approved_by, approved_at, approval_notes, " +
  "created_at, updated_at";

// =================================================================== filters

export type HolidayFilters = {
  dateFrom?: string;
  dateTo?: string;
  holidayType?: HolidayType;
};

export type LeaveRequestFilters = {
  status?: LeaveRequestStatus;
  employeeId?: EntityId | null;
};

// =================================================================== holidays

export async function listHolidays(
  scope: HRScope,
  filters: HolidayFilters = {},
): Promise<Holiday[]> {
  const sb = requireSupabase();
  let chain = sb
    .from(HOLIDAYS)
    .select(HOLIDAY_COLUMNS)
    .eq("organization_id", scope.organizationId)
    .eq("property_id", scope.propertyId);

  if (filters.holidayType) chain = chain.eq("holiday_type", filters.holidayType);
  if (filters.dateFrom) chain = chain.gte("holiday_date", filters.dateFrom);
  if (filters.dateTo) chain = chain.lte("holiday_date", filters.dateTo);

  chain = chain.order("holiday_date", { ascending: true });
  return camelRows<Holiday>(asRead(chain));
}

export async function createHoliday(
  scope: HRScope,
  params: {
    name: string;
    holidayDate: string;
    holidayType?: HolidayType;
    description?: string | null;
    isRecurring?: boolean;
  },
): Promise<EntityId> {
  return callDoor<EntityId>("create_holiday", {
    propertyId: scope.propertyId,
    name: params.name,
    holidayDate: params.holidayDate,
    holidayType: params.holidayType ?? "MANDATORY",
    description: params.description ?? null,
    isRecurring: params.isRecurring ?? false,
  });
}

// =================================================================== leave types

export async function listLeaveTypes(
  scope: HRScope,
): Promise<LeaveType[]> {
  const sb = requireSupabase();
  const chain = sb
    .from(LEAVE_TYPES)
    .select(LEAVE_TYPE_COLUMNS)
    .eq("organization_id", scope.organizationId)
    .order("name");

  return camelRows<LeaveType>(asRead(chain));
}

export async function getLeaveType(
  scope: HRScope,
  leaveTypeId: EntityId,
): Promise<LeaveType | null> {
  const sb = requireSupabase();
  return firstCamelRow<LeaveType>(
    asRead(
      sb
        .from(LEAVE_TYPES)
        .select(LEAVE_TYPE_COLUMNS)
        .eq("id", leaveTypeId)
        .eq("organization_id", scope.organizationId),
    ),
  );
}

export async function createLeaveType(
  _scope: HRScope,
  params: {
    name: string;
    code?: string | null;
    category?: LeaveTypeCategory;
    maxDaysPerYear?: number | null;
    isPaid?: boolean;
    requiresApproval?: boolean;
    description?: string | null;
  },
): Promise<EntityId> {
  return callDoor<EntityId>("create_leave_type", {
    name: params.name,
    code: params.code ?? null,
    category: params.category ?? "OTHER",
    maxDaysPerYear: params.maxDaysPerYear ?? null,
    isPaid: params.isPaid ?? true,
    requiresApproval: params.requiresApproval ?? true,
    description: params.description ?? null,
  });
}

// =================================================================== leave requests

export async function listLeaveRequests(
  scope: HRScope,
  filters: LeaveRequestFilters = {},
): Promise<LeaveRequest[]> {
  const sb = requireSupabase();
  let chain = sb
    .from(LEAVE_REQUESTS)
    .select(LEAVE_REQUEST_COLUMNS)
    .eq("organization_id", scope.organizationId);

  if (filters.status) chain = chain.eq("status", filters.status);
  if (filters.employeeId !== undefined) {
    if (filters.employeeId === null) {
      chain = chain.is("employee_id", null);
    } else {
      chain = chain.eq("employee_id", filters.employeeId);
    }
  }

  chain = chain.order("created_at", { ascending: false });
  return camelRows<LeaveRequest>(asRead(chain));
}

export async function getLeaveRequest(
  scope: HRScope,
  leaveId: EntityId,
): Promise<LeaveRequest | null> {
  const sb = requireSupabase();
  return firstCamelRow<LeaveRequest>(
    asRead(
      sb
        .from(LEAVE_REQUESTS)
        .select(LEAVE_REQUEST_COLUMNS)
        .eq("id", leaveId)
        .eq("organization_id", scope.organizationId),
    ),
  );
}

export async function requestLeave(
  _scope: HRScope,
  params: {
    employeeId: EntityId;
    leaveTypeId: EntityId;
    fromDate: string;
    toDate: string;
    days: number;
    reason?: string | null;
  },
): Promise<EntityId> {
  return callDoor<EntityId>("request_leave", {
    employeeId: params.employeeId,
    leaveTypeId: params.leaveTypeId,
    fromDate: params.fromDate,
    toDate: params.toDate,
    days: params.days,
    reason: params.reason ?? null,
  });
}

export async function approveLeave(
  leaveId: EntityId,
  notes?: string | null,
): Promise<void> {
  await callDoor("approve_leave", {
    leaveId,
    notes: notes ?? null,
  });
}

export async function rejectLeave(
  leaveId: EntityId,
  notes?: string | null,
): Promise<void> {
  await callDoor("reject_leave", {
    leaveId,
    notes: notes ?? null,
  });
}
