/**
 * HR attendance service — attendance records, punch marking, corrections.
 * Reads are plain SELECTs under RLS; writes go through security-definer doors.
 */

import { requireSupabase } from "@/db/client";
import { asRead, callDoor, camelRows, firstCamelRow } from "@/db/rpc";
import type { EntityId } from "@/domain/identity/types";
import type {
  HRScope,
  AttendanceRecord,
  AttendanceStatus,
  AttendanceSource,
} from "./types";

const ATTENDANCE_RECORDS = "attendance_records";

const ATTENDANCE_COLUMNS =
  "id, organization_id, employee_id, property_id, attendance_date, status, source, " +
  "check_in, check_out, work_hours, overtime_hours, " +
  "is_late, is_half_day, late_minutes, " +
  "leave_type_id, notes, corrected_by, correction_reason, corrected_at, " +
  "created_at, updated_at";

// =================================================================== filters

export type AttendanceFilters = {
  status?: AttendanceStatus;
  dateFrom?: string;
  dateTo?: string;
  employeeId?: EntityId | null;
};

// =================================================================== queries

export async function listAttendanceRecords(
  scope: HRScope,
  filters: AttendanceFilters = {},
): Promise<AttendanceRecord[]> {
  const sb = requireSupabase();
  let chain = sb
    .from(ATTENDANCE_RECORDS)
    .select(ATTENDANCE_COLUMNS)
    .eq("organization_id", scope.organizationId)
    .eq("property_id", scope.propertyId);

  if (filters.status) chain = chain.eq("status", filters.status);
  if (filters.employeeId !== undefined) {
    if (filters.employeeId === null) {
      chain = chain.is("employee_id", null);
    } else {
      chain = chain.eq("employee_id", filters.employeeId);
    }
  }
  if (filters.dateFrom) chain = chain.gte("attendance_date", filters.dateFrom);
  if (filters.dateTo) chain = chain.lte("attendance_date", filters.dateTo);

  chain = chain.order("attendance_date", { ascending: false });
  return camelRows<AttendanceRecord>(asRead(chain));
}

export async function getAttendanceRecord(
  scope: HRScope,
  recordId: EntityId,
): Promise<AttendanceRecord | null> {
  const sb = requireSupabase();
  return firstCamelRow<AttendanceRecord>(
    asRead(
      sb
        .from(ATTENDANCE_RECORDS)
        .select(ATTENDANCE_COLUMNS)
        .eq("id", recordId)
        .eq("organization_id", scope.organizationId),
    ),
  );
}

export async function getAttendanceForDate(
  scope: HRScope,
  date: string,
): Promise<AttendanceRecord[]> {
  const sb = requireSupabase();
  const chain = sb
    .from(ATTENDANCE_RECORDS)
    .select(ATTENDANCE_COLUMNS)
    .eq("organization_id", scope.organizationId)
    .eq("property_id", scope.propertyId)
    .eq("attendance_date", date)
    .order("status");

  return camelRows<AttendanceRecord>(asRead(chain));
}

export async function getEmployeeAttendance(
  scope: HRScope,
  employeeId: EntityId,
  dateFrom: string,
  dateTo: string,
): Promise<AttendanceRecord[]> {
  const sb = requireSupabase();
  const chain = sb
    .from(ATTENDANCE_RECORDS)
    .select(ATTENDANCE_COLUMNS)
    .eq("organization_id", scope.organizationId)
    .eq("property_id", scope.propertyId)
    .eq("employee_id", employeeId)
    .gte("attendance_date", dateFrom)
    .lte("attendance_date", dateTo)
    .order("attendance_date", { ascending: true });

  return camelRows<AttendanceRecord>(asRead(chain));
}

// =================================================================== writes

export async function markAttendance(
  scope: HRScope,
  params: {
    employeeId: EntityId;
    attendanceDate: string;
    status?: AttendanceStatus;
    source?: AttendanceSource;
    checkIn?: string | null;
    checkOut?: string | null;
    isLate?: boolean;
    lateMinutes?: number;
    notes?: string | null;
  },
): Promise<EntityId> {
  return callDoor<EntityId>("mark_attendance", {
    employeeId: params.employeeId,
    propertyId: scope.propertyId,
    attendanceDate: params.attendanceDate,
    status: params.status ?? "PRESENT",
    source: params.source ?? "MANUAL",
    checkIn: params.checkIn ?? null,
    checkOut: params.checkOut ?? null,
    isLate: params.isLate ?? false,
    lateMinutes: params.lateMinutes ?? 0,
    notes: params.notes ?? null,
  });
}

export async function correctAttendance(
  recordId: EntityId,
  params: {
    status?: AttendanceStatus;
    checkIn?: string | null;
    checkOut?: string | null;
    isLate?: boolean;
    lateMinutes?: number;
    notes?: string;
    reason?: string;
  },
): Promise<void> {
  await callDoor("correct_attendance", {
    recordId,
    ...params,
  });
}
