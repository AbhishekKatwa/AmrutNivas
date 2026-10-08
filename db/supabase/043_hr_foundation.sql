-- 043: HR / Workforce Foundation
-- Employees, designations, assignments, attendance, shifts, roster,
-- leave, holidays, employee documents.
-- All tables are org-scoped under RLS.
-- Writes through security-definer doors; reads under RLS.

-- =====================================================================
-- 1. ENUMS
-- =====================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'employment_type') THEN
    CREATE TYPE employment_type AS ENUM (
      'FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'TEMPORARY', 'CASUAL'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'employment_status') THEN
    CREATE TYPE employment_status AS ENUM (
      'ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED', 'RESIGNED', 'RETIRED'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attendance_status') THEN
    CREATE TYPE attendance_status AS ENUM (
      'PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'ON_LEAVE', 'HOLIDAY', 'WEEKLY_OFF'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attendance_source') THEN
    CREATE TYPE attendance_source AS ENUM (
      'MANUAL', 'BIOMETRIC', 'RFID', 'MOBILE', 'SWIPE'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'shift_schedule_status') THEN
    CREATE TYPE shift_schedule_status AS ENUM (
      'SCHEDULED', 'CONFIRMED', 'SWAPPED', 'CANCELLED', 'COMPLETED'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'shift_swap_status') THEN
    CREATE TYPE shift_swap_status AS ENUM (
      'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'holiday_type') THEN
    CREATE TYPE holiday_type AS ENUM (
      'MANDATORY', 'OPTIONAL', 'RESTRICTED'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'leave_type_category') THEN
    CREATE TYPE leave_type_category AS ENUM (
      'EARNED', 'SICK', 'CASUAL', 'PRIVILEGE', 'COMP_OFF', 'UNPAID', 'OTHER'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'leave_request_status') THEN
    CREATE TYPE leave_request_status AS ENUM (
      'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_type') THEN
    CREATE TYPE document_type AS ENUM (
      'AADHAAR', 'PAN', 'PASSPORT', 'DRIVING_LICENSE', 'EXPERIENCE_LETTER',
      'OFFER_LETTER', 'APPOINTMENT_LETTER', 'EDUCATION_CERTIFICATE',
      'POLICE_VERIFICATION', 'MEDICAL_CERTIFICATE', 'OTHER'
    );
  END IF;
END $$;

-- =====================================================================
-- 2. TABLES
-- =====================================================================

-- Designations (job titles)
CREATE TABLE IF NOT EXISTS designations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),

  name text NOT NULL,
  code text,
  description text,
  level integer NOT NULL DEFAULT 1,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_designations_org_code UNIQUE (organization_id, code)
);

-- Employees (master record)
CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),

  employee_code text NOT NULL,
  profile_id uuid REFERENCES app.profiles(id),

  first_name text NOT NULL,
  last_name text,
  full_name text GENERATED ALWAYS AS (
    trim(first_name || ' ' || coalesce(last_name, ''))
  ) STORED,

  email text,
  mobile text,
  gender text,
  date_of_birth date,
  date_of_joining date NOT NULL,
  date_of_leaving date,

  designation_id uuid REFERENCES designations(id),
  department_id uuid REFERENCES departments(id),

  employment_type employment_type NOT NULL DEFAULT 'FULL_TIME',
  employment_status employment_status NOT NULL DEFAULT 'ACTIVE',

  base_salary numeric(14,2),
  bank_name text,
  bank_account text,
  ifsc_code text,

  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relation text,

  address text,
  city text,
  state text,
  pincode text,

  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_employees_code UNIQUE (organization_id, employee_code)
);

-- Employee assignments (multi-property / multi-outlet)
CREATE TABLE IF NOT EXISTS employee_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  property_id uuid NOT NULL REFERENCES properties(id),
  outlet_id uuid REFERENCES outlets(id),
  department_id uuid REFERENCES departments(id),

  is_primary boolean NOT NULL DEFAULT false,
  starts_on date NOT NULL,
  ends_on date,

  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Shifts (master definitions)
CREATE TABLE IF NOT EXISTS shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id),

  name text NOT NULL,
  code text,
  start_time time NOT NULL,
  end_time time NOT NULL,
  break_minutes integer NOT NULL DEFAULT 0,
  description text,

  is_active boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_shifts_org_code UNIQUE (organization_id, code)
);

-- Employee shift schedule (roster)
CREATE TABLE IF NOT EXISTS employee_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES shifts(id),
  property_id uuid NOT NULL REFERENCES properties(id),

  shift_date date NOT NULL,
  status shift_schedule_status NOT NULL DEFAULT 'SCHEDULED',

  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_employee_shifts_date UNIQUE (organization_id, employee_id, shift_date)
);

-- Shift swap requests
CREATE TABLE IF NOT EXISTS shift_swaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),

  requester_id uuid NOT NULL REFERENCES employees(id),
  responder_id uuid NOT NULL REFERENCES employees(id),
  requester_shift_id uuid NOT NULL REFERENCES employee_shifts(id),
  responder_shift_id uuid REFERENCES employee_shifts(id),

  swap_date date NOT NULL,
  reason text,
  status shift_swap_status NOT NULL DEFAULT 'PENDING',

  reviewed_by uuid REFERENCES app.profiles(id),
  reviewed_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Attendance records
CREATE TABLE IF NOT EXISTS attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id),

  attendance_date date NOT NULL,
  status attendance_status NOT NULL DEFAULT 'PRESENT',
  source attendance_source NOT NULL DEFAULT 'MANUAL',

  check_in time,
  check_out time,
  work_hours numeric(5,2),
  overtime_hours numeric(5,2),

  is_late boolean NOT NULL DEFAULT false,
  is_half_day boolean NOT NULL DEFAULT false,
  late_minutes integer DEFAULT 0,

  leave_type_id uuid,
  notes text,

  corrected_by uuid REFERENCES app.profiles(id),
  correction_reason text,
  corrected_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_attendance_date UNIQUE (organization_id, employee_id, attendance_date)
);

-- Holidays
CREATE TABLE IF NOT EXISTS holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id),

  name text NOT NULL,
  holiday_date date NOT NULL,
  holiday_type holiday_type NOT NULL DEFAULT 'MANDATORY',
  description text,

  is_recurring boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_holidays_date_property UNIQUE (organization_id, property_id, holiday_date)
);

-- Leave types
CREATE TABLE IF NOT EXISTS leave_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),

  name text NOT NULL,
  code text,
  category leave_type_category NOT NULL DEFAULT 'OTHER',
  max_days_per_year integer,
  is_paid boolean NOT NULL DEFAULT true,
  requires_approval boolean NOT NULL DEFAULT true,
  description text,

  is_active boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_leave_types_code UNIQUE (organization_id, code)
);

-- Leave requests
CREATE TABLE IF NOT EXISTS leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id uuid NOT NULL REFERENCES leave_types(id),

  from_date date NOT NULL,
  to_date date NOT NULL,
  days numeric(5,1) NOT NULL,
  reason text,

  status leave_request_status NOT NULL DEFAULT 'PENDING',

  applied_on date NOT NULL DEFAULT CURRENT_DATE,
  approved_by uuid REFERENCES app.profiles(id),
  approved_at timestamptz,
  approval_notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Employee documents (metadata only — file storage is external)
CREATE TABLE IF NOT EXISTS employee_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  document_type document_type NOT NULL DEFAULT 'OTHER',
  document_number text,
  file_url text,
  file_name text,

  issued_on date,
  expires_on date,

  notes text,
  uploaded_by uuid REFERENCES app.profiles(id),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- 3. INDEXES
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_designations_org ON designations(organization_id);

CREATE INDEX IF NOT EXISTS idx_employees_org ON employees(organization_id);
CREATE INDEX IF NOT EXISTS idx_employees_profile ON employees(profile_id);
CREATE INDEX IF NOT EXISTS idx_employees_designation ON employees(designation_id);
CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department_id);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(employment_status);

CREATE INDEX IF NOT EXISTS idx_employee_assignments_employee ON employee_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_assignments_property ON employee_assignments(property_id);

CREATE INDEX IF NOT EXISTS idx_shifts_org ON shifts(organization_id);
CREATE INDEX IF NOT EXISTS idx_shifts_property ON shifts(property_id);

CREATE INDEX IF NOT EXISTS idx_employee_shifts_employee ON employee_shifts(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_shifts_date ON employee_shifts(shift_date);
CREATE INDEX IF NOT EXISTS idx_employee_shifts_property ON employee_shifts(property_id);

CREATE INDEX IF NOT EXISTS idx_shift_swaps_requester ON shift_swaps(requester_id);
CREATE INDEX IF NOT EXISTS idx_shift_swaps_status ON shift_swaps(status);

CREATE INDEX IF NOT EXISTS idx_attendance_employee ON attendance_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_records(attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_property ON attendance_records(property_id);

CREATE INDEX IF NOT EXISTS idx_holidays_property ON holidays(property_id);
CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(holiday_date);

CREATE INDEX IF NOT EXISTS idx_leave_requests_employee ON leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates ON leave_requests(from_date, to_date);

CREATE INDEX IF NOT EXISTS idx_employee_documents_employee ON employee_documents(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_documents_expires ON employee_documents(expires_on);

-- =====================================================================
-- 4. RLS
-- =====================================================================

ALTER TABLE designations ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_swaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_documents ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'designations', 'employees', 'employee_assignments',
    'shifts', 'employee_shifts', 'shift_swaps',
    'attendance_records', 'holidays', 'leave_types',
    'leave_requests', 'employee_documents'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY "%I_select_org" ON %I FOR SELECT TO authenticated
       USING (organization_id = app.current_organization_id())',
      t, t
    );
  END LOOP;
END $$;

-- =====================================================================
-- 5. DOORS (security-definer write RPCs)
-- =====================================================================

CREATE OR REPLACE FUNCTION app.check_hr_membership()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT app.current_organization_id() IS NOT NULL;
$$;

-- ----- Employee code generator -----

CREATE OR REPLACE FUNCTION app.next_employee_code(p_org uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_seq int;
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count FROM employees WHERE organization_id = p_org;
  v_seq := v_count + 1;
  RETURN 'EMP-' || lpad(v_seq::text, 4, '0');
END;
$$;

-- ----- Employees -----

CREATE OR REPLACE FUNCTION app.create_employee(
  p_first_name text,
  p_last_name text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_mobile text DEFAULT NULL,
  p_gender text DEFAULT NULL,
  p_date_of_birth date DEFAULT NULL,
  p_date_of_joining date DEFAULT NULL,
  p_designation_id uuid DEFAULT NULL,
  p_department_id uuid DEFAULT NULL,
  p_employment_type employment_type DEFAULT 'FULL_TIME',
  p_base_salary numeric DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_state text DEFAULT NULL,
  p_pincode text DEFAULT NULL,
  p_emergency_contact_name text DEFAULT NULL,
  p_emergency_contact_phone text DEFAULT NULL,
  p_emergency_contact_relation text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_profile_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org uuid := app.current_organization_id();
  v_code text;
  v_id uuid;
BEGIN
  IF NOT app.check_hr_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  v_code := app.next_employee_code(v_org);
  INSERT INTO employees (organization_id, employee_code, profile_id, first_name, last_name,
    email, mobile, gender, date_of_birth, date_of_joining, designation_id, department_id,
    employment_type, base_salary, address, city, state, pincode,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relation, notes)
  VALUES (v_org, v_code, p_profile_id, p_first_name, p_last_name,
    p_email, p_mobile, p_gender, p_date_of_birth,
    COALESCE(p_date_of_joining, CURRENT_DATE), p_designation_id, p_department_id,
    p_employment_type, p_base_salary, p_address, p_city, p_state, p_pincode,
    p_emergency_contact_name, p_emergency_contact_phone, p_emergency_contact_relation, p_notes)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.update_employee(
  p_employee_id uuid,
  p_first_name text DEFAULT NULL,
  p_last_name text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_mobile text DEFAULT NULL,
  p_gender text DEFAULT NULL,
  p_date_of_birth date DEFAULT NULL,
  p_designation_id uuid DEFAULT NULL,
  p_department_id uuid DEFAULT NULL,
  p_employment_type employment_type DEFAULT NULL,
  p_base_salary numeric DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_state text DEFAULT NULL,
  p_pincode text DEFAULT NULL,
  p_emergency_contact_name text DEFAULT NULL,
  p_emergency_contact_phone text DEFAULT NULL,
  p_emergency_contact_relation text DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT app.check_hr_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  UPDATE employees SET
    first_name = COALESCE(p_first_name, first_name),
    last_name = COALESCE(p_last_name, last_name),
    email = COALESCE(p_email, email),
    mobile = COALESCE(p_mobile, mobile),
    gender = COALESCE(p_gender, gender),
    date_of_birth = COALESCE(p_date_of_birth, date_of_birth),
    designation_id = COALESCE(p_designation_id, designation_id),
    department_id = COALESCE(p_department_id, department_id),
    employment_type = COALESCE(p_employment_type, employment_type),
    base_salary = COALESCE(p_base_salary, base_salary),
    address = COALESCE(p_address, address),
    city = COALESCE(p_city, city),
    state = COALESCE(p_state, state),
    pincode = COALESCE(p_pincode, pincode),
    emergency_contact_name = COALESCE(p_emergency_contact_name, emergency_contact_name),
    emergency_contact_phone = COALESCE(p_emergency_contact_phone, emergency_contact_phone),
    emergency_contact_relation = COALESCE(p_emergency_contact_relation, emergency_contact_relation),
    notes = COALESCE(p_notes, notes),
    updated_at = now()
  WHERE id = p_employee_id AND organization_id = app.current_organization_id();
END;
$$;

CREATE OR REPLACE FUNCTION app.set_employee_status(
  p_employee_id uuid,
  p_status employment_status,
  p_date_of_leaving date DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT app.check_hr_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  UPDATE employees SET
    employment_status = p_status,
    date_of_leaving = COALESCE(p_date_of_leaving, date_of_leaving),
    updated_at = now()
  WHERE id = p_employee_id AND organization_id = app.current_organization_id();
END;
$$;

-- ----- Designations -----

CREATE OR REPLACE FUNCTION app.create_designation(
  p_name text,
  p_code text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_level integer DEFAULT 1
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org uuid := app.current_organization_id();
  v_id uuid;
BEGIN
  IF NOT app.check_hr_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  INSERT INTO designations (organization_id, name, code, description, level)
  VALUES (v_org, p_name, p_code, p_description, p_level)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.update_designation(
  p_designation_id uuid,
  p_name text DEFAULT NULL,
  p_code text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_level integer DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT app.check_hr_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  UPDATE designations SET
    name = COALESCE(p_name, name),
    code = COALESCE(p_code, code),
    description = COALESCE(p_description, description),
    level = COALESCE(p_level, level),
    updated_at = now()
  WHERE id = p_designation_id AND organization_id = app.current_organization_id();
END;
$$;

-- ----- Employee assignments -----

CREATE OR REPLACE FUNCTION app.create_employee_assignment(
  p_employee_id uuid,
  p_property_id uuid,
  p_outlet_id uuid DEFAULT NULL,
  p_department_id uuid DEFAULT NULL,
  p_is_primary boolean DEFAULT false,
  p_starts_on date DEFAULT NULL,
  p_ends_on date DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org uuid := app.current_organization_id();
  v_id uuid;
BEGIN
  IF NOT app.check_hr_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  INSERT INTO employee_assignments (organization_id, employee_id, property_id, outlet_id,
    department_id, is_primary, starts_on, ends_on, notes)
  VALUES (v_org, p_employee_id, p_property_id, p_outlet_id,
    p_department_id, p_is_primary, COALESCE(p_starts_on, CURRENT_DATE), p_ends_on, p_notes)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.update_employee_assignment(
  p_assignment_id uuid,
  p_outlet_id uuid DEFAULT NULL,
  p_department_id uuid DEFAULT NULL,
  p_is_primary boolean DEFAULT NULL,
  p_ends_on date DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT app.check_hr_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  UPDATE employee_assignments SET
    outlet_id = COALESCE(p_outlet_id, outlet_id),
    department_id = COALESCE(p_department_id, department_id),
    is_primary = COALESCE(p_is_primary, is_primary),
    ends_on = COALESCE(p_ends_on, ends_on),
    notes = COALESCE(p_notes, notes),
    updated_at = now()
  WHERE id = p_assignment_id AND organization_id = app.current_organization_id();
END;
$$;

-- ----- Attendance -----

CREATE OR REPLACE FUNCTION app.mark_attendance(
  p_employee_id uuid,
  p_property_id uuid,
  p_attendance_date date,
  p_status attendance_status DEFAULT 'PRESENT',
  p_source attendance_source DEFAULT 'MANUAL',
  p_check_in time DEFAULT NULL,
  p_check_out time DEFAULT NULL,
  p_is_late boolean DEFAULT false,
  p_late_minutes integer DEFAULT 0,
  p_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org uuid := app.current_organization_id();
  v_work_hours numeric(5,2);
  v_id uuid;
BEGIN
  IF NOT app.check_hr_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  IF p_check_in IS NOT NULL AND p_check_out IS NOT NULL THEN
    v_work_hours := extract(epoch FROM (p_check_out - p_check_in)) / 3600.0;
  END IF;
  INSERT INTO attendance_records (organization_id, employee_id, property_id, attendance_date,
    status, source, check_in, check_out, work_hours, is_late, late_minutes, notes)
  VALUES (v_org, p_employee_id, p_property_id, p_attendance_date,
    p_status, p_source, p_check_in, p_check_out, v_work_hours, p_is_late, p_late_minutes, p_notes)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.correct_attendance(
  p_record_id uuid,
  p_status attendance_status DEFAULT NULL,
  p_check_in time DEFAULT NULL,
  p_check_out time DEFAULT NULL,
  p_is_late boolean DEFAULT NULL,
  p_late_minutes integer DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_work_hours numeric(5,2);
  v_check_in time;
  v_check_out time;
BEGIN
  IF NOT app.check_hr_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  SELECT check_in, check_out INTO v_check_in, v_check_out
  FROM attendance_records WHERE id = p_record_id;
  v_check_in := COALESCE(p_check_in, v_check_in);
  v_check_out := COALESCE(p_check_out, v_check_out);
  IF v_check_in IS NOT NULL AND v_check_out IS NOT NULL THEN
    v_work_hours := extract(epoch FROM (v_check_out - v_check_in)) / 3600.0;
  END IF;
  UPDATE attendance_records SET
    status = COALESCE(p_status, status),
    check_in = COALESCE(p_check_in, check_in),
    check_out = COALESCE(p_check_out, check_out),
    work_hours = COALESCE(v_work_hours, work_hours),
    is_late = COALESCE(p_is_late, is_late),
    late_minutes = COALESCE(p_late_minutes, late_minutes),
    notes = COALESCE(p_notes, notes),
    corrected_by = app.current_profile_id(),
    correction_reason = COALESCE(p_reason, correction_reason),
    corrected_at = now(),
    updated_at = now()
  WHERE id = p_record_id AND organization_id = app.current_organization_id();
END;
$$;

-- ----- Shifts -----

CREATE OR REPLACE FUNCTION app.create_shift(
  p_property_id uuid,
  p_name text,
  p_code text DEFAULT NULL,
  p_start_time time,
  p_end_time time,
  p_break_minutes integer DEFAULT 0,
  p_description text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org uuid := app.current_organization_id();
  v_id uuid;
BEGIN
  IF NOT app.check_hr_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  INSERT INTO shifts (organization_id, property_id, name, code, start_time, end_time,
    break_minutes, description)
  VALUES (v_org, p_property_id, p_name, p_code, p_start_time, p_end_time,
    p_break_minutes, p_description)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.update_shift(
  p_shift_id uuid,
  p_name text DEFAULT NULL,
  p_code text DEFAULT NULL,
  p_start_time time DEFAULT NULL,
  p_end_time time DEFAULT NULL,
  p_break_minutes integer DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_is_active boolean DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT app.check_hr_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  UPDATE shifts SET
    name = COALESCE(p_name, name),
    code = COALESCE(p_code, code),
    start_time = COALESCE(p_start_time, start_time),
    end_time = COALESCE(p_end_time, end_time),
    break_minutes = COALESCE(p_break_minutes, break_minutes),
    description = COALESCE(p_description, description),
    is_active = COALESCE(p_is_active, is_active),
    updated_at = now()
  WHERE id = p_shift_id AND organization_id = app.current_organization_id();
END;
$$;

CREATE OR REPLACE FUNCTION app.assign_shift(
  p_employee_id uuid,
  p_shift_id uuid,
  p_property_id uuid,
  p_shift_date date
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org uuid := app.current_organization_id();
  v_id uuid;
BEGIN
  IF NOT app.check_hr_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  INSERT INTO employee_shifts (organization_id, employee_id, shift_id, property_id, shift_date)
  VALUES (v_org, p_employee_id, p_shift_id, p_property_id, p_shift_date)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.cancel_shift_assignment(
  p_assignment_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT app.check_hr_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  UPDATE employee_shifts SET
    status = 'CANCELLED'::shift_schedule_status,
    updated_at = now()
  WHERE id = p_assignment_id AND organization_id = app.current_organization_id();
END;
$$;

-- ----- Shift swaps -----

CREATE OR REPLACE FUNCTION app.request_shift_swap(
  p_requester_id uuid,
  p_responder_id uuid,
  p_requester_shift_id uuid,
  p_responder_shift_id uuid DEFAULT NULL,
  p_swap_date date,
  p_reason text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org uuid := app.current_organization_id();
  v_id uuid;
BEGIN
  IF NOT app.check_hr_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  INSERT INTO shift_swaps (organization_id, requester_id, responder_id,
    requester_shift_id, responder_shift_id, swap_date, reason)
  VALUES (v_org, p_requester_id, p_responder_id,
    p_requester_shift_id, p_responder_shift_id, p_swap_date, p_reason)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.approve_shift_swap(
  p_swap_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT app.check_hr_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  UPDATE shift_swaps SET
    status = 'APPROVED'::shift_swap_status,
    reviewed_by = app.current_profile_id(),
    reviewed_at = now(),
    updated_at = now()
  WHERE id = p_swap_id AND organization_id = app.current_organization_id();

  UPDATE employee_shifts SET
    status = 'SWAPPED'::shift_schedule_status,
    updated_at = now()
  WHERE id IN (
    SELECT requester_shift_id FROM shift_swaps WHERE id = p_swap_id
    UNION
    SELECT responder_shift_id FROM shift_swaps WHERE id = p_swap_id AND responder_shift_id IS NOT NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION app.reject_shift_swap(
  p_swap_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT app.check_hr_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  UPDATE shift_swaps SET
    status = 'REJECTED'::shift_swap_status,
    reviewed_by = app.current_profile_id(),
    reviewed_at = now(),
    updated_at = now()
  WHERE id = p_swap_id AND organization_id = app.current_organization_id();
END;
$$;

-- ----- Holidays -----

CREATE OR REPLACE FUNCTION app.create_holiday(
  p_property_id uuid,
  p_name text,
  p_holiday_date date,
  p_holiday_type holiday_type DEFAULT 'MANDATORY',
  p_description text DEFAULT NULL,
  p_is_recurring boolean DEFAULT false
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org uuid := app.current_organization_id();
  v_id uuid;
BEGIN
  IF NOT app.check_hr_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  INSERT INTO holidays (organization_id, property_id, name, holiday_date, holiday_type,
    description, is_recurring)
  VALUES (v_org, p_property_id, p_name, p_holiday_date, p_holiday_type,
    p_description, p_is_recurring)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ----- Leave types -----

CREATE OR REPLACE FUNCTION app.create_leave_type(
  p_name text,
  p_code text DEFAULT NULL,
  p_category leave_type_category DEFAULT 'OTHER',
  p_max_days_per_year integer DEFAULT NULL,
  p_is_paid boolean DEFAULT true,
  p_requires_approval boolean DEFAULT true,
  p_description text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org uuid := app.current_organization_id();
  v_id uuid;
BEGIN
  IF NOT app.check_hr_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  INSERT INTO leave_types (organization_id, name, code, category, max_days_per_year,
    is_paid, requires_approval, description)
  VALUES (v_org, p_name, p_code, p_category, p_max_days_per_year,
    p_is_paid, p_requires_approval, p_description)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ----- Leave requests -----

CREATE OR REPLACE FUNCTION app.request_leave(
  p_employee_id uuid,
  p_leave_type_id uuid,
  p_from_date date,
  p_to_date date,
  p_days numeric,
  p_reason text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org uuid := app.current_organization_id();
  v_id uuid;
BEGIN
  IF NOT app.check_hr_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  INSERT INTO leave_requests (organization_id, employee_id, leave_type_id,
    from_date, to_date, days, reason)
  VALUES (v_org, p_employee_id, p_leave_type_id,
    p_from_date, p_to_date, p_days, p_reason)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.approve_leave(
  p_leave_id uuid,
  p_notes text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT app.check_hr_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  UPDATE leave_requests SET
    status = 'APPROVED'::leave_request_status,
    approved_by = app.current_profile_id(),
    approved_at = now(),
    approval_notes = COALESCE(p_notes, approval_notes),
    updated_at = now()
  WHERE id = p_leave_id AND organization_id = app.current_organization_id();
END;
$$;

CREATE OR REPLACE FUNCTION app.reject_leave(
  p_leave_id uuid,
  p_notes text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT app.check_hr_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  UPDATE leave_requests SET
    status = 'REJECTED'::leave_request_status,
    approved_by = app.current_profile_id(),
    approved_at = now(),
    approval_notes = COALESCE(p_notes, approval_notes),
    updated_at = now()
  WHERE id = p_leave_id AND organization_id = app.current_organization_id();
END;
$$;

-- ----- Employee documents -----

CREATE OR REPLACE FUNCTION app.add_employee_document(
  p_employee_id uuid,
  p_document_type document_type DEFAULT 'OTHER',
  p_document_number text DEFAULT NULL,
  p_file_url text DEFAULT NULL,
  p_file_name text DEFAULT NULL,
  p_issued_on date DEFAULT NULL,
  p_expires_on date DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org uuid := app.current_organization_id();
  v_id uuid;
BEGIN
  IF NOT app.check_hr_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  INSERT INTO employee_documents (organization_id, employee_id, document_type,
    document_number, file_url, file_name, issued_on, expires_on, notes,
    uploaded_by)
  VALUES (v_org, p_employee_id, p_document_type,
    p_document_number, p_file_url, p_file_name, p_issued_on, p_expires_on, p_notes,
    app.current_profile_id())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.remove_employee_document(
  p_document_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT app.check_hr_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  DELETE FROM employee_documents
  WHERE id = p_document_id AND organization_id = app.current_organization_id();
END;
$$;

-- =====================================================================
-- 6. PERMISSIONS
-- =====================================================================

DO $$
DECLARE
  perms text[] := ARRAY[
    'hr.view',
    'hr.employee.view', 'hr.employee.create', 'hr.employee.edit', 'hr.employee.archive',
    'hr.designation.view', 'hr.designation.manage',
    'hr.attendance.view', 'hr.attendance.mark', 'hr.attendance.correct',
    'hr.shift.view', 'hr.shift.manage',
    'hr.roster.view', 'hr.roster.manage',
    'hr.leave.view', 'hr.leave.request', 'hr.leave.approve', 'hr.leave.reject',
    'hr.holiday.view', 'hr.holiday.manage',
    'hr.document.view', 'hr.document.manage',
    'hr.report.view'
  ];
  p text;
BEGIN
  FOREACH p IN ARRAY perms LOOP
    INSERT INTO app.permissions (name, description, category)
    VALUES (p, 'HR: ' || p, 'hr')
    ON CONFLICT (name) DO NOTHING;
  END LOOP;
END $$;

-- Grant HR permissions to OWNER and MANAGER roles
DO $$
DECLARE
  perms text[] := ARRAY[
    'hr.view',
    'hr.employee.view', 'hr.employee.create', 'hr.employee.edit', 'hr.employee.archive',
    'hr.designation.view', 'hr.designation.manage',
    'hr.attendance.view', 'hr.attendance.mark', 'hr.attendance.correct',
    'hr.shift.view', 'hr.shift.manage',
    'hr.roster.view', 'hr.roster.manage',
    'hr.leave.view', 'hr.leave.request', 'hr.leave.approve', 'hr.leave.reject',
    'hr.holiday.view', 'hr.holiday.manage',
    'hr.document.view', 'hr.document.manage',
    'hr.report.view'
  ];
  p text;
BEGIN
  FOREACH p IN ARRAY perms LOOP
    INSERT INTO app.role_permissions (role_name, permission_name)
    VALUES ('OWNER', p)
    ON CONFLICT DO NOTHING;
    INSERT INTO app.role_permissions (role_name, permission_name)
    VALUES ('MANAGER', p)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- =====================================================================
-- 7. GRANT DOORS
-- =====================================================================

DO $$
DECLARE
  doors text[] := ARRAY[
    'next_employee_code',
    'create_employee', 'update_employee', 'set_employee_status',
    'create_designation', 'update_designation',
    'create_employee_assignment', 'update_employee_assignment',
    'mark_attendance', 'correct_attendance',
    'create_shift', 'update_shift', 'assign_shift', 'cancel_shift_assignment',
    'request_shift_swap', 'approve_shift_swap', 'reject_shift_swap',
    'create_holiday',
    'create_leave_type',
    'request_leave', 'approve_leave', 'reject_leave',
    'add_employee_document', 'remove_employee_document'
  ];
  d text;
BEGIN
  FOREACH d IN ARRAY doors LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION app.%I TO authenticated', d);
  END LOOP;
END $$;
