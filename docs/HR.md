# HR / Workforce foundation build contract

Binding conventions for Prompt #13 — the workforce layer that gives every property an employee roster with attendance, shifts, swap requests, leave and document tracking. Every migration, service and screen in this domain follows these rules. Where this file and an existing migration disagree, the migration wins and this file is corrected.

## 1. Scope

All HR tables are org-scoped (`organization_id`) under RLS. The client passes an `HRScope` (`{ organizationId, propertyId }`) to every service call; the service funnels writes through security-definer doors and reads through plain SELECT under RLS.

No direct INSERT/UPDATE/DELETE from the client.

## 2. Sub-domains

| Sub-domain | Table(s) | Purpose |
|---|---|---|
| Designations | `designations` | Job titles with level ordering |
| Employees | `employees` | Master employee record, optionally linked to a profile (login) |
| Assignments | `employee_assignments` | Multi-property / multi-outlet assignment with date range |
| Shifts | `shifts` | Shift master (start/end time, break minutes) |
| Roster | `employee_shifts` | Which employee works which shift on which date |
| Swap requests | `shift_swaps` | Swap request between two employees with approval workflow |
| Attendance | `attendance_records` | Daily attendance with check-in/out, correction trail |
| Holidays | `holidays` | Property-level holiday calendar |
| Leave types | `leave_types` | Leave policy (earned, sick, casual, etc.) |
| Leave requests | `leave_requests` | Leave application with approval workflow |
| Documents | `employee_documents` | Document metadata with expiry tracking |

## 3. Employment lifecycle

Employment types: `FULL_TIME`, `PART_TIME`, `CONTRACT`, `INTERN`, `TEMPORARY`, `CASUAL`.

Employment statuses:

```
ACTIVE → ON_LEAVE → ACTIVE
ACTIVE → SUSPENDED → ACTIVE
ACTIVE → RESIGNED
ACTIVE → TERMINATED
ACTIVE → RETIRED
```

`set_employee_status` door transitions the status. The door records the change; there is no separate audit table — `updated_at` and the status itself are the trail.

## 4. Attendance

Daily record per employee per property. Statuses: `PRESENT`, `ABSENT`, `LATE`, `HALF_DAY`, `ON_LEAVE`, `HOLIDAY`, `WEEKLY_OFF`.

Sources: `MANUAL`, `BIOMETRIC`, `RFID`, `MOBILE`, `SWIPE`.

`mark_attendance` creates or overwrites the day's record. `correct_attendance` stamps `corrected_by`, `correction_reason` and `corrected_at` — the original row is updated in place, with the correction trail visible on the record.

Check-in/out are stored as time strings. `work_hours` and `overtime_hours` are computed at write time.

## 5. Shift and roster

A `Shift` is a property-level master: name, code, start/end time, break minutes, active flag.

An `EmployeeShift` is a roster entry: one employee, one shift, one date, with status `SCHEDULED → CONFIRMED → COMPLETED` (or `SWAPPED` / `CANCELLED`).

`assign_shift` creates a roster entry. `cancel_shift_assignment` cancels it.

## 6. Shift swap workflow

```
PENDING → APPROVED
PENDING → REJECTED
PENDING → CANCELLED
```

A swap request names a requester, a responder, and optionally the specific shifts being swapped. `approve_shift_swap` transitions both the swap status and the underlying roster entries. `reject_shift_swap` transitions the swap to REJECTED.

## 7. Leave workflow

Leave types have categories: `EARNED`, `SICK`, `CASUAL`, `PRIVILEGE`, `COMP_OFF`, `UNPAID`, `OTHER`. Each type has `max_days_per_year`, `is_paid`, `requires_approval`.

Leave request state machine:

```
PENDING → APPROVED
PENDING → REJECTED
PENDING → CANCELLED
```

`request_leave` creates a request. `approve_leave` stamps `approved_by`, `approved_at`. `reject_leave` records rejection notes.

A leave request spans `from_date` to `to_date` with a computed `days` count.

## 8. Holidays

Property-level calendar. Types: `MANDATORY`, `OPTIONAL`, `RESTRICTED`. Each holiday has a date, name and optional `is_recurring` flag for annual repetition.

## 9. Employee documents

Document types: `AADHAAR`, `PAN`, `PASSPORT`, `DRIVING_LICENSE`, `EXPERIENCE_LETTER`, `OFFER_LETTER`, `APPOINTMENT_LETTER`, `EDUCATION_CERTIFICATE`, `POLICE_VERIFICATION`, `MEDICAL_CERTIFICATE`, `OTHER`.

Each document stores `document_number`, optional `file_url`, `issued_on`, `expires_on`. The overview page surfaces expiring documents (expiry within 30 days).

`add_employee_document` and `remove_employee_document` doors manage the lifecycle.

## 10. Permissions

23 HR permission tokens in the catalogue:

| Token | Scope |
|---|---|
| `hr.view` | Module-level access |
| `hr.employee.view` | Read employee list and profiles |
| `hr.employee.create` | Create employees |
| `hr.employee.edit` | Edit employee details |
| `hr.employee.archive` | Archive / set status |
| `hr.designation.view` | Read designations |
| `hr.designation.manage` | Create/edit designations |
| `hr.attendance.view` | Read attendance records |
| `hr.attendance.mark` | Mark daily attendance |
| `hr.attendance.correct` | Correct attendance records |
| `hr.shift.view` | Read shift masters |
| `hr.shift.manage` | Create/edit shifts |
| `hr.roster.view` | Read roster entries |
| `hr.roster.manage` | Assign/cancel shifts |
| `hr.leave.view` | Read leave requests |
| `hr.leave.request` | Apply for leave |
| `hr.leave.approve` | Approve leave |
| `hr.leave.reject` | Reject leave |
| `hr.holiday.view` | Read holidays |
| `hr.holiday.manage` | Create holidays |
| `hr.document.view` | Read documents |
| `hr.document.manage` | Upload/remove documents |
| `hr.report.view` | View HR reports |

## 11. Doors (write path)

24 security-definer RPCs in `CLIENT_DOORS`:

| Door | Purpose |
|---|---|
| `next_employee_code` | Generate next employee code for org |
| `create_employee` | Create employee record |
| `update_employee` | Update employee details |
| `set_employee_status` | Transition employment status |
| `create_designation` | Create job title |
| `update_designation` | Update job title |
| `create_employee_assignment` | Assign employee to property/outlet |
| `update_employee_assignment` | Update assignment |
| `mark_attendance` | Create/update daily attendance |
| `correct_attendance` | Correct attendance with trail |
| `create_shift` | Create shift master |
| `update_shift` | Update shift |
| `assign_shift` | Create roster entry |
| `cancel_shift_assignment` | Cancel roster entry |
| `request_shift_swap` | Create swap request |
| `approve_shift_swap` | Approve swap |
| `reject_shift_swap` | Reject swap |
| `create_holiday` | Create holiday |
| `create_leave_type` | Create leave type |
| `request_leave` | Apply for leave |
| `approve_leave` | Approve leave |
| `reject_leave` | Reject leave |
| `add_employee_document` | Upload document metadata |
| `remove_employee_document` | Remove document |

All reads go through standard Supabase SELECT under RLS. No read doors.

## 12. Service layer

Four service files in `src/domain/hr/`:

| File | Exports |
|---|---|
| `employee-service.ts` | `listEmployees`, `getEmployee`, `createEmployee`, `updateEmployee`, `listDesignations`, `createDesignation`, `listEmployeeAssignments`, `listEmployeeDocuments` |
| `attendance-service.ts` | `listAttendanceRecords`, `markAttendance`, `correctAttendance` |
| `shift-service.ts` | `listShifts`, `createShift`, `updateShift`, `listEmployeeShifts`, `assignShift`, `cancelShiftAssignment`, `listShiftSwaps`, `requestShiftSwap`, `approveShiftSwap`, `rejectShiftSwap` |
| `leave-service.ts` | `listLeaveTypes`, `createLeaveType`, `listLeaveRequests`, `requestLeave`, `approveLeave`, `rejectLeave`, `listHolidays`, `createHoliday` |

All functions take `HRScope` as the first argument (except where noted). Writes call `callDoor`; reads use `asRead` + `camelRows`.

## 13. Screens

| Route | Screen | Purpose |
|---|---|---|
| `/hr` | HROverviewPage | KPI cards: headcount, today's attendance, pending leaves, shift assignments, expiring documents, upcoming holidays |
| `/hr/employees` | EmployeesPage | Employee list with search, status filter, designation filter; create dialog |
| `/hr/employees/:employeeId` | EmployeeProfilePage | Full profile: identity, assignment, documents, attendance history, shift schedule |
| `/hr/attendance` | AttendancePage | Daily attendance grid with mark/correct dialogs |
| `/hr/shifts` | ShiftsPage | Shift master list with create/edit dialog |
| `/hr/roster` | RosterPage | Roster calendar with assign/cancel, swap request dialog |
| `/hr/leave` | LeavePage | Leave requests with status filter, approve/reject, apply dialog |

All screens follow the standard view-state pattern: bootstrapping → unconfigured → unauthenticated → no_organization → scoped.

## 14. Navigation

"People" navigation group in the sidebar with six items: Overview, Employees, Attendance, Shifts, Roster, Leave. All items are `phase: 7, available: true`.

## 15. Migration 043

`db/supabase/043_hr_foundation.sql` creates:

- 10 enums (employment_type, employment_status, attendance_status, attendance_source, shift_schedule_status, shift_swap_status, holiday_type, leave_type_category, leave_request_status, document_type)
- 11 new tables (designations, employees, employee_assignments, shifts, employee_shifts, shift_swaps, attendance_records, holidays, leave_types, leave_requests, employee_documents)
- RLS policies for all tables (org-scoped)
- 24 security-definer RPC doors
- 23 permission catalogue entries (via `app.insert_permission`)
- Indexes on employee_id, property_id, organization_id, date columns, status columns

## 16. Design constraints

- **All writes through doors.** No direct INSERT/UPDATE from the client.
- **Org-scoped.** All HR data is isolated by `organization_id` under RLS.
- **Employee ≠ profile.** An employee may exist without a login. The `profile_id` FK is nullable.
- **Multi-property.** An employee can be assigned to multiple properties via `employee_assignments`.
- **Attendance correction has a trail.** `correct_attendance` stamps who corrected, why, and when.
- **Leave days are computed.** The `days` field on a leave request is the span, not manually entered.
- **No payroll.** This module covers workforce operations only. Payroll, salary processing and compliance reporting are out of scope.
- **No biometric integration.** Attendance sources include BIOMETRIC as a label, but no device integration exists. Data is entered manually or via future integration.
