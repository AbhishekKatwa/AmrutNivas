/**
 * HR / Workforce domain types (Prompt #13, migration 043).
 *
 * Covers employees, designations, assignments, attendance, shifts, roster,
 * leave, holidays and employee documents. All tables are org-scoped under RLS.
 * Writes go through security-definer doors; reads are plain SELECTs.
 *
 * Key concepts:
 *   - Employee: the master record, optionally linked to a profile (login)
 *   - Designation: job title / role level
 *   - EmployeeAssignment: multi-property / multi-outlet assignment
 *   - Shift: shift master (start/end time, break)
 *   - EmployeeShift: roster entry — which employee works which shift on which date
 *   - ShiftSwap: swap request between two employees
 *   - AttendanceRecord: daily attendance with check-in/out
 *   - Holiday: property-level holiday calendar
 *   - LeaveType: leave policy (earned, sick, casual, etc.)
 *   - LeaveRequest: leave application with approval workflow
 *   - EmployeeDocument: document metadata with expiry tracking
 */

import type { EntityId } from "@/domain/identity/types";

// =================================================================== employment types

export type EmploymentType =
  | "FULL_TIME"
  | "PART_TIME"
  | "CONTRACT"
  | "INTERN"
  | "TEMPORARY"
  | "CASUAL";

export const EMPLOYMENT_TYPES: readonly EmploymentType[] = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "INTERN",
  "TEMPORARY",
  "CASUAL",
];

// =================================================================== employment statuses

export type EmploymentStatus =
  | "ACTIVE"
  | "ON_LEAVE"
  | "SUSPENDED"
  | "TERMINATED"
  | "RESIGNED"
  | "RETIRED";

export const EMPLOYMENT_STATUSES: readonly EmploymentStatus[] = [
  "ACTIVE",
  "ON_LEAVE",
  "SUSPENDED",
  "TERMINATED",
  "RESIGNED",
  "RETIRED",
];

// =================================================================== attendance statuses

export type AttendanceStatus =
  | "PRESENT"
  | "ABSENT"
  | "LATE"
  | "HALF_DAY"
  | "ON_LEAVE"
  | "HOLIDAY"
  | "WEEKLY_OFF";

export const ATTENDANCE_STATUSES: readonly AttendanceStatus[] = [
  "PRESENT",
  "ABSENT",
  "LATE",
  "HALF_DAY",
  "ON_LEAVE",
  "HOLIDAY",
  "WEEKLY_OFF",
];

// =================================================================== attendance sources

export type AttendanceSource =
  | "MANUAL"
  | "BIOMETRIC"
  | "RFID"
  | "MOBILE"
  | "SWIPE";

export const ATTENDANCE_SOURCES: readonly AttendanceSource[] = [
  "MANUAL",
  "BIOMETRIC",
  "RFID",
  "MOBILE",
  "SWIPE",
];

// =================================================================== shift schedule statuses

export type ShiftScheduleStatus =
  | "SCHEDULED"
  | "CONFIRMED"
  | "SWAPPED"
  | "CANCELLED"
  | "COMPLETED";

export const SHIFT_SCHEDULE_STATUSES: readonly ShiftScheduleStatus[] = [
  "SCHEDULED",
  "CONFIRMED",
  "SWAPPED",
  "CANCELLED",
  "COMPLETED",
];

// =================================================================== shift swap statuses

export type ShiftSwapStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED";

export const SHIFT_SWAP_STATUSES: readonly ShiftSwapStatus[] = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
];

// =================================================================== holiday types

export type HolidayType = "MANDATORY" | "OPTIONAL" | "RESTRICTED";

export const HOLIDAY_TYPES: readonly HolidayType[] = [
  "MANDATORY",
  "OPTIONAL",
  "RESTRICTED",
];

// =================================================================== leave type categories

export type LeaveTypeCategory =
  | "EARNED"
  | "SICK"
  | "CASUAL"
  | "PRIVILEGE"
  | "COMP_OFF"
  | "UNPAID"
  | "OTHER";

export const LEAVE_TYPE_CATEGORIES: readonly LeaveTypeCategory[] = [
  "EARNED",
  "SICK",
  "CASUAL",
  "PRIVILEGE",
  "COMP_OFF",
  "UNPAID",
  "OTHER",
];

// =================================================================== leave request statuses

export type LeaveRequestStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED";

export const LEAVE_REQUEST_STATUSES: readonly LeaveRequestStatus[] = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
];

// =================================================================== document types

export type DocumentType =
  | "AADHAAR"
  | "PAN"
  | "PASSPORT"
  | "DRIVING_LICENSE"
  | "EXPERIENCE_LETTER"
  | "OFFER_LETTER"
  | "APPOINTMENT_LETTER"
  | "EDUCATION_CERTIFICATE"
  | "POLICE_VERIFICATION"
  | "MEDICAL_CERTIFICATE"
  | "OTHER";

export const DOCUMENT_TYPES: readonly DocumentType[] = [
  "AADHAAR",
  "PAN",
  "PASSPORT",
  "DRIVING_LICENSE",
  "EXPERIENCE_LETTER",
  "OFFER_LETTER",
  "APPOINTMENT_LETTER",
  "EDUCATION_CERTIFICATE",
  "POLICE_VERIFICATION",
  "MEDICAL_CERTIFICATE",
  "OTHER",
];

// =================================================================== scope

export type HRScope = {
  organizationId: EntityId;
  propertyId: EntityId;
};

// =================================================================== entity types

export type Designation = {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly name: string;
  readonly code: string | null;
  readonly description: string | null;
  readonly level: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type Employee = {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly employeeCode: string;
  readonly profileId: EntityId | null;

  readonly firstName: string;
  readonly lastName: string | null;
  readonly fullName: string | null;

  readonly email: string | null;
  readonly mobile: string | null;
  readonly gender: string | null;
  readonly dateOfBirth: string | null;
  readonly dateOfJoining: string;
  readonly dateOfLeaving: string | null;

  readonly designationId: EntityId | null;
  readonly departmentId: EntityId | null;

  readonly employmentType: EmploymentType;
  readonly employmentStatus: EmploymentStatus;

  readonly baseSalary: number | null;
  readonly bankName: string | null;
  readonly bankAccount: string | null;
  readonly ifscCode: string | null;

  readonly emergencyContactName: string | null;
  readonly emergencyContactPhone: string | null;
  readonly emergencyContactRelation: string | null;

  readonly address: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly pincode: string | null;

  readonly notes: string | null;

  readonly createdAt: string;
  readonly updatedAt: string;
};

export type EmployeeAssignment = {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly employeeId: EntityId;

  readonly propertyId: EntityId;
  readonly outletId: EntityId | null;
  readonly departmentId: EntityId | null;

  readonly isPrimary: boolean;
  readonly startsOn: string;
  readonly endsOn: string | null;

  readonly notes: string | null;

  readonly createdAt: string;
  readonly updatedAt: string;
};

export type Shift = {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly propertyId: EntityId;

  readonly name: string;
  readonly code: string | null;
  readonly startTime: string;
  readonly endTime: string;
  readonly breakMinutes: number;
  readonly description: string | null;

  readonly isActive: boolean;

  readonly createdAt: string;
  readonly updatedAt: string;
};

export type EmployeeShift = {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly employeeId: EntityId;
  readonly shiftId: EntityId;
  readonly propertyId: EntityId;

  readonly shiftDate: string;
  readonly status: ShiftScheduleStatus;

  readonly notes: string | null;

  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ShiftSwap = {
  readonly id: EntityId;
  readonly organizationId: EntityId;

  readonly requesterId: EntityId;
  readonly responderId: EntityId;
  readonly requesterShiftId: EntityId;
  readonly responderShiftId: EntityId | null;

  readonly swapDate: string;
  readonly reason: string | null;
  readonly status: ShiftSwapStatus;

  readonly reviewedBy: EntityId | null;
  readonly reviewedAt: string | null;

  readonly createdAt: string;
  readonly updatedAt: string;
};

export type AttendanceRecord = {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly employeeId: EntityId;
  readonly propertyId: EntityId;

  readonly attendanceDate: string;
  readonly status: AttendanceStatus;
  readonly source: AttendanceSource;

  readonly checkIn: string | null;
  readonly checkOut: string | null;
  readonly workHours: number | null;
  readonly overtimeHours: number | null;

  readonly isLate: boolean;
  readonly isHalfDay: boolean;
  readonly lateMinutes: number | null;

  readonly leaveTypeId: EntityId | null;
  readonly notes: string | null;

  readonly correctedBy: EntityId | null;
  readonly correctionReason: string | null;
  readonly correctedAt: string | null;

  readonly createdAt: string;
  readonly updatedAt: string;
};

export type Holiday = {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly propertyId: EntityId;

  readonly name: string;
  readonly holidayDate: string;
  readonly holidayType: HolidayType;
  readonly description: string | null;

  readonly isRecurring: boolean;

  readonly createdAt: string;
  readonly updatedAt: string;
};

export type LeaveType = {
  readonly id: EntityId;
  readonly organizationId: EntityId;

  readonly name: string;
  readonly code: string | null;
  readonly category: LeaveTypeCategory;
  readonly maxDaysPerYear: number | null;
  readonly isPaid: boolean;
  readonly requiresApproval: boolean;
  readonly description: string | null;

  readonly isActive: boolean;

  readonly createdAt: string;
  readonly updatedAt: string;
};

export type LeaveRequest = {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly employeeId: EntityId;
  readonly leaveTypeId: EntityId;

  readonly fromDate: string;
  readonly toDate: string;
  readonly days: number;
  readonly reason: string | null;

  readonly status: LeaveRequestStatus;

  readonly appliedOn: string;
  readonly approvedBy: EntityId | null;
  readonly approvedAt: string | null;
  readonly approvalNotes: string | null;

  readonly createdAt: string;
  readonly updatedAt: string;
};

export type EmployeeDocument = {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly employeeId: EntityId;

  readonly documentType: DocumentType;
  readonly documentNumber: string | null;
  readonly fileUrl: string | null;
  readonly fileName: string | null;

  readonly issuedOn: string | null;
  readonly expiresOn: string | null;

  readonly notes: string | null;
  readonly uploadedBy: EntityId | null;

  readonly createdAt: string;
  readonly updatedAt: string;
};
