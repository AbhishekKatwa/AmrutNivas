/**
 * HR employee service — employees, designations, assignments, documents.
 * Reads are plain SELECTs under RLS; writes go through security-definer doors.
 */

import { requireSupabase } from "@/db/client";
import { asRead, callDoor, camelRows, firstCamelRow } from "@/db/rpc";
import type { EntityId } from "@/domain/identity/types";
import type {
  HRScope,
  Employee,
  Designation,
  EmployeeAssignment,
  EmployeeDocument,
  EmploymentType,
  EmploymentStatus,
  DocumentType,
} from "./types";

const EMPLOYEES = "employees";
const DESIGNATIONS = "designations";
const EMPLOYEE_ASSIGNMENTS = "employee_assignments";
const EMPLOYEE_DOCUMENTS = "employee_documents";

const EMPLOYEE_COLUMNS =
  "id, organization_id, employee_code, profile_id, first_name, last_name, full_name, " +
  "email, mobile, gender, date_of_birth, date_of_joining, date_of_leaving, " +
  "designation_id, department_id, employment_type, employment_status, " +
  "base_salary, bank_name, bank_account, ifsc_code, " +
  "emergency_contact_name, emergency_contact_phone, emergency_contact_relation, " +
  "address, city, state, pincode, notes, created_at, updated_at";

const DESIGNATION_COLUMNS =
  "id, organization_id, name, code, description, level, created_at, updated_at";

const ASSIGNMENT_COLUMNS =
  "id, organization_id, employee_id, property_id, outlet_id, department_id, " +
  "is_primary, starts_on, ends_on, notes, created_at, updated_at";

const DOCUMENT_COLUMNS =
  "id, organization_id, employee_id, document_type, document_number, " +
  "file_url, file_name, issued_on, expires_on, notes, uploaded_by, created_at, updated_at";

// =================================================================== filters

export type EmployeeFilters = {
  status?: EmploymentStatus;
  employmentType?: EmploymentType;
  designationId?: EntityId | null;
  departmentId?: EntityId | null;
};

// =================================================================== employees

export async function listEmployees(
  scope: HRScope,
  filters: EmployeeFilters = {},
): Promise<Employee[]> {
  const sb = requireSupabase();
  let chain = sb
    .from(EMPLOYEES)
    .select(EMPLOYEE_COLUMNS)
    .eq("organization_id", scope.organizationId);

  if (filters.status) chain = chain.eq("employment_status", filters.status);
  if (filters.employmentType) chain = chain.eq("employment_type", filters.employmentType);
  if (filters.designationId !== undefined) {
    if (filters.designationId === null) {
      chain = chain.is("designation_id", null);
    } else {
      chain = chain.eq("designation_id", filters.designationId);
    }
  }
  if (filters.departmentId !== undefined) {
    if (filters.departmentId === null) {
      chain = chain.is("department_id", null);
    } else {
      chain = chain.eq("department_id", filters.departmentId);
    }
  }

  chain = chain.order("full_name");
  return camelRows<Employee>(asRead(chain));
}

export async function getEmployee(
  scope: HRScope,
  employeeId: EntityId,
): Promise<Employee | null> {
  const sb = requireSupabase();
  return firstCamelRow<Employee>(
    asRead(
      sb
        .from(EMPLOYEES)
        .select(EMPLOYEE_COLUMNS)
        .eq("id", employeeId)
        .eq("organization_id", scope.organizationId),
    ),
  );
}

export async function createEmployee(
  _scope: HRScope,
  params: {
    firstName: string;
    lastName?: string | null;
    email?: string | null;
    mobile?: string | null;
    gender?: string | null;
    dateOfBirth?: string | null;
    dateOfJoining?: string | null;
    designationId?: EntityId | null;
    departmentId?: EntityId | null;
    employmentType?: EmploymentType;
    baseSalary?: number | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    pincode?: string | null;
    emergencyContactName?: string | null;
    emergencyContactPhone?: string | null;
    emergencyContactRelation?: string | null;
    notes?: string | null;
    profileId?: EntityId | null;
  },
): Promise<EntityId> {
  return callDoor<EntityId>("create_employee", {
    firstName: params.firstName,
    lastName: params.lastName ?? null,
    email: params.email ?? null,
    mobile: params.mobile ?? null,
    gender: params.gender ?? null,
    dateOfBirth: params.dateOfBirth ?? null,
    dateOfJoining: params.dateOfJoining ?? null,
    designationId: params.designationId ?? null,
    departmentId: params.departmentId ?? null,
    employmentType: params.employmentType ?? "FULL_TIME",
    baseSalary: params.baseSalary ?? null,
    address: params.address ?? null,
    city: params.city ?? null,
    state: params.state ?? null,
    pincode: params.pincode ?? null,
    emergencyContactName: params.emergencyContactName ?? null,
    emergencyContactPhone: params.emergencyContactPhone ?? null,
    emergencyContactRelation: params.emergencyContactRelation ?? null,
    notes: params.notes ?? null,
    profileId: params.profileId ?? null,
  });
}

export async function updateEmployee(
  employeeId: EntityId,
  params: {
    firstName?: string;
    lastName?: string;
    email?: string;
    mobile?: string;
    gender?: string;
    dateOfBirth?: string | null;
    designationId?: EntityId | null;
    departmentId?: EntityId | null;
    employmentType?: EmploymentType;
    baseSalary?: number | null;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    emergencyContactRelation?: string;
    notes?: string;
  },
): Promise<void> {
  await callDoor("update_employee", {
    employeeId,
    ...params,
  });
}

export async function setEmployeeStatus(
  employeeId: EntityId,
  status: EmploymentStatus,
  dateOfLeaving?: string | null,
): Promise<void> {
  await callDoor("set_employee_status", {
    employeeId,
    status,
    dateOfLeaving: dateOfLeaving ?? null,
  });
}

// =================================================================== designations

export async function listDesignations(
  scope: HRScope,
): Promise<Designation[]> {
  const sb = requireSupabase();
  const chain = sb
    .from(DESIGNATIONS)
    .select(DESIGNATION_COLUMNS)
    .eq("organization_id", scope.organizationId)
    .order("level", { ascending: true })
    .order("name");

  return camelRows<Designation>(asRead(chain));
}

export async function getDesignation(
  scope: HRScope,
  designationId: EntityId,
): Promise<Designation | null> {
  const sb = requireSupabase();
  return firstCamelRow<Designation>(
    asRead(
      sb
        .from(DESIGNATIONS)
        .select(DESIGNATION_COLUMNS)
        .eq("id", designationId)
        .eq("organization_id", scope.organizationId),
    ),
  );
}

export async function createDesignation(
  _scope: HRScope,
  params: {
    name: string;
    code?: string | null;
    description?: string | null;
    level?: number;
  },
): Promise<EntityId> {
  return callDoor<EntityId>("create_designation", {
    name: params.name,
    code: params.code ?? null,
    description: params.description ?? null,
    level: params.level ?? 1,
  });
}

export async function updateDesignation(
  designationId: EntityId,
  params: {
    name?: string;
    code?: string;
    description?: string;
    level?: number;
  },
): Promise<void> {
  await callDoor("update_designation", {
    designationId,
    ...params,
  });
}

// =================================================================== assignments

export async function listEmployeeAssignments(
  scope: HRScope,
  employeeId: EntityId,
): Promise<EmployeeAssignment[]> {
  const sb = requireSupabase();
  const chain = sb
    .from(EMPLOYEE_ASSIGNMENTS)
    .select(ASSIGNMENT_COLUMNS)
    .eq("organization_id", scope.organizationId)
    .eq("employee_id", employeeId)
    .order("is_primary", { ascending: false })
    .order("starts_on", { ascending: false });

  return camelRows<EmployeeAssignment>(asRead(chain));
}

export async function listAssignmentsByProperty(
  scope: HRScope,
): Promise<EmployeeAssignment[]> {
  const sb = requireSupabase();
  const chain = sb
    .from(EMPLOYEE_ASSIGNMENTS)
    .select(ASSIGNMENT_COLUMNS)
    .eq("organization_id", scope.organizationId)
    .eq("property_id", scope.propertyId)
    .order("is_primary", { ascending: false });

  return camelRows<EmployeeAssignment>(asRead(chain));
}

export async function createEmployeeAssignment(
  scope: HRScope,
  params: {
    employeeId: EntityId;
    outletId?: EntityId | null;
    departmentId?: EntityId | null;
    isPrimary?: boolean;
    startsOn?: string | null;
    endsOn?: string | null;
    notes?: string | null;
  },
): Promise<EntityId> {
  return callDoor<EntityId>("create_employee_assignment", {
    employeeId: params.employeeId,
    propertyId: scope.propertyId,
    outletId: params.outletId ?? null,
    departmentId: params.departmentId ?? null,
    isPrimary: params.isPrimary ?? false,
    startsOn: params.startsOn ?? null,
    endsOn: params.endsOn ?? null,
    notes: params.notes ?? null,
  });
}

export async function updateEmployeeAssignment(
  assignmentId: EntityId,
  params: {
    outletId?: EntityId | null;
    departmentId?: EntityId | null;
    isPrimary?: boolean;
    endsOn?: string | null;
    notes?: string;
  },
): Promise<void> {
  await callDoor("update_employee_assignment", {
    assignmentId,
    ...params,
  });
}

// =================================================================== documents

export async function listEmployeeDocuments(
  scope: HRScope,
  employeeId: EntityId,
): Promise<EmployeeDocument[]> {
  const sb = requireSupabase();
  const chain = sb
    .from(EMPLOYEE_DOCUMENTS)
    .select(DOCUMENT_COLUMNS)
    .eq("organization_id", scope.organizationId)
    .eq("employee_id", employeeId)
    .order("document_type");

  return camelRows<EmployeeDocument>(asRead(chain));
}

export async function addEmployeeDocument(
  employeeId: EntityId,
  params: {
    documentType?: DocumentType;
    documentNumber?: string | null;
    fileUrl?: string | null;
    fileName?: string | null;
    issuedOn?: string | null;
    expiresOn?: string | null;
    notes?: string | null;
  },
): Promise<EntityId> {
  return callDoor<EntityId>("add_employee_document", {
    employeeId,
    documentType: params.documentType ?? "OTHER",
    documentNumber: params.documentNumber ?? null,
    fileUrl: params.fileUrl ?? null,
    fileName: params.fileName ?? null,
    issuedOn: params.issuedOn ?? null,
    expiresOn: params.expiresOn ?? null,
    notes: params.notes ?? null,
  });
}

export async function removeEmployeeDocument(
  documentId: EntityId,
): Promise<void> {
  await callDoor("remove_employee_document", { documentId });
}
