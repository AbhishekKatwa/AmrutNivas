-- 042: Events & Banquet Foundation
-- Event management, leads, venues, quotations, tasks, schedule, vendors
-- All tables are org+property scoped under RLS.
-- Writes through security-definer doors; reads under RLS.

-- =====================================================================
-- 1. ENUMS
-- =====================================================================

DO $$ BEGIN
  -- Event types
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_type') THEN
    CREATE TYPE event_type AS ENUM (
      'WEDDING', 'RECEPTION', 'ENGAGEMENT', 'BIRTHDAY', 'ANNIVERSARY',
      'CORPORATE', 'CONFERENCE', 'MEETING', 'SEMINAR', 'PRODUCT_LAUNCH',
      'FAMILY_FUNCTION', 'RELIGIOUS', 'BANQUET', 'PRIVATE_DINING',
      'CATERING', 'OTHER'
    );
  END IF;

  -- Event statuses (full lifecycle)
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_status') THEN
    CREATE TYPE event_status AS ENUM (
      'ENQUIRY', 'FOLLOW_UP', 'QUOTED', 'NEGOTIATION', 'TENTATIVE',
      'CONFIRMED', 'IN_PLANNING', 'READY', 'IN_PROGRESS', 'COMPLETED',
      'CLOSED', 'CANCELLED', 'LOST'
    );
  END IF;

  -- Event sources
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_source') THEN
    CREATE TYPE event_source AS ENUM (
      'WALK_IN', 'PHONE', 'WEBSITE', 'WHATSAPP', 'REFERRAL',
      'CORPORATE', 'SOCIAL_MEDIA', 'EXISTING_CUSTOMER', 'OTHER'
    );
  END IF;

  -- Lead statuses
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_lead_status') THEN
    CREATE TYPE event_lead_status AS ENUM (
      'NEW', 'CONTACTED', 'FOLLOW_UP', 'QUOTED', 'NEGOTIATION',
      'CONVERTED', 'LOST', 'CANCELLED'
    );
  END IF;

  -- Venue types
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_venue_type') THEN
    CREATE TYPE event_venue_type AS ENUM (
      'BANQUET_HALL', 'LAWN', 'ROOFTOP', 'RESTAURANT', 'PRIVATE_ROOM',
      'CONFERENCE_ROOM', 'MEETING_ROOM', 'POOL_SIDE', 'OUTDOOR', 'OTHER'
    );
  END IF;

  -- Venue statuses
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_venue_status') THEN
    CREATE TYPE event_venue_status AS ENUM (
      'AVAILABLE', 'BLOCKED', 'MAINTENANCE', 'INACTIVE'
    );
  END IF;

  -- Quotation statuses
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_quotation_status') THEN
    CREATE TYPE event_quotation_status AS ENUM (
      'DRAFT', 'SENT', 'VIEWED', 'NEGOTIATION', 'ACCEPTED',
      'REJECTED', 'EXPIRED', 'CANCELLED'
    );
  END IF;

  -- Quotation item types
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_quotation_item_type') THEN
    CREATE TYPE event_quotation_item_type AS ENUM (
      'VENUE', 'FOOD', 'BEVERAGE', 'ROOM', 'DECORATION', 'AV',
      'EQUIPMENT', 'STAFF', 'SERVICE', 'TRANSPORT', 'PACKAGE', 'OTHER'
    );
  END IF;

  -- Package pricing models
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_pricing_model') THEN
    CREATE TYPE event_pricing_model AS ENUM (
      'PER_PERSON', 'FIXED', 'PER_HOUR', 'PER_ROOM', 'CUSTOM'
    );
  END IF;

  -- Task categories
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_task_category') THEN
    CREATE TYPE event_task_category AS ENUM (
      'SALES', 'VENUE', 'FOOD', 'DECORATION', 'AV', 'ROOMS',
      'PROCUREMENT', 'STAFF', 'GUEST', 'FINANCE', 'GENERAL'
    );
  END IF;

  -- Task priorities
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_task_priority') THEN
    CREATE TYPE event_task_priority AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
  END IF;

  -- Task statuses
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_task_status') THEN
    CREATE TYPE event_task_status AS ENUM (
      'TODO', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED'
    );
  END IF;

  -- Schedule departments
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_department') THEN
    CREATE TYPE event_department AS ENUM (
      'SALES', 'FRONT_OFFICE', 'HOUSEKEEPING', 'KITCHEN', 'RESTAURANT',
      'BANQUET', 'MAINTENANCE', 'FINANCE', 'OTHER'
    );
  END IF;

  -- Loss reasons
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_loss_reason') THEN
    CREATE TYPE event_loss_reason AS ENUM (
      'PRICE', 'VENUE_UNAVAILABLE', 'COMPETITOR', 'DATE_CONFLICT',
      'CUSTOMER_CANCELLED', 'BUDGET', 'LOCATION', 'NO_RESPONSE', 'OTHER'
    );
  END IF;

  -- Payment types
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_payment_type') THEN
    CREATE TYPE event_payment_type AS ENUM ('ADVANCE', 'PARTIAL', 'FINAL', 'REFUND');
  END IF;
END $$;

-- =====================================================================
-- 2. TABLES
-- =====================================================================

-- Event venues
CREATE TABLE IF NOT EXISTS event_venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id),

  name text NOT NULL,
  code text,
  venue_type event_venue_type NOT NULL DEFAULT 'BANQUET_HALL',
  capacity integer NOT NULL DEFAULT 0,
  area_sq_ft numeric(10,2),
  status event_venue_status NOT NULL DEFAULT 'AVAILABLE',
  description text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_event_venues_org_code UNIQUE (organization_id, code)
);

-- Events (core entity)
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id),

  event_number text NOT NULL,
  lead_id uuid, -- FK added after event_leads exists

  customer_id uuid REFERENCES guests(id),
  event_type event_type NOT NULL DEFAULT 'OTHER',
  event_name text NOT NULL,

  event_date date NOT NULL,
  start_time time,
  end_time time,

  venue_id uuid REFERENCES event_venues(id),

  expected_guests integer,
  confirmed_guests integer,
  guaranteed_guests integer,
  actual_guests integer,

  status event_status NOT NULL DEFAULT 'ENQUIRY',
  source event_source NOT NULL DEFAULT 'WALK_IN',

  sales_owner_id uuid REFERENCES public.profiles(id),

  confirmed_at timestamptz,
  confirmed_by uuid REFERENCES public.profiles(id),
  confirmation_notes text,

  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES public.profiles(id),
  cancellation_reason text,
  loss_reason event_loss_reason,

  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_events_event_number UNIQUE (organization_id, event_number)
);

-- Event leads / enquiries
CREATE TABLE IF NOT EXISTS event_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id),

  lead_number text NOT NULL,

  customer_id uuid REFERENCES guests(id),
  contact_name text NOT NULL,
  mobile text,
  email text,

  event_type event_type NOT NULL DEFAULT 'OTHER',
  event_date date,
  expected_guests integer,
  budget numeric(14,2),
  venue_preference text,

  source event_source NOT NULL DEFAULT 'WALK_IN',
  assigned_to uuid REFERENCES public.profiles(id),

  status event_lead_status NOT NULL DEFAULT 'NEW',
  next_follow_up_at timestamptz,
  follow_up_notes text,

  converted_event_id uuid REFERENCES events(id),
  loss_reason event_loss_reason,

  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_event_leads_number UNIQUE (organization_id, lead_number)
);

-- Add FK from events to leads now that both exist
ALTER TABLE events
  ADD CONSTRAINT fk_events_lead
  FOREIGN KEY (lead_id) REFERENCES event_leads(id) ON DELETE SET NULL;

-- Event quotations
CREATE TABLE IF NOT EXISTS event_quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id),

  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  quotation_number text NOT NULL,
  version integer NOT NULL DEFAULT 1,

  status event_quotation_status NOT NULL DEFAULT 'DRAFT',
  valid_until date,

  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(14,2) NOT NULL DEFAULT 0,
  tax numeric(14,2) NOT NULL DEFAULT 0,
  grand_total numeric(14,2) NOT NULL DEFAULT 0,

  notes text,
  terms text,

  created_by uuid REFERENCES public.profiles(id),
  sent_at timestamptz,
  accepted_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_event_quotations_number UNIQUE (organization_id, quotation_number)
);

-- Quotation items
CREATE TABLE IF NOT EXISTS event_quotation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id uuid NOT NULL REFERENCES event_quotations(id) ON DELETE CASCADE,

  item_type event_quotation_item_type NOT NULL DEFAULT 'OTHER',
  description text NOT NULL,

  quantity numeric(12,3) NOT NULL DEFAULT 1,
  uom text,
  unit_rate numeric(14,2) NOT NULL DEFAULT 0,

  discount numeric(14,2) NOT NULL DEFAULT 0,
  tax_rate numeric(5,2) NOT NULL DEFAULT 0,
  amount numeric(14,2) NOT NULL DEFAULT 0,

  notes text,
  sort_order integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now()
);

-- Event packages
CREATE TABLE IF NOT EXISTS event_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id),

  name text NOT NULL,
  code text,
  description text,
  pricing_model event_pricing_model NOT NULL DEFAULT 'PER_PERSON',
  base_price numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ACTIVE',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_event_packages_code UNIQUE (organization_id, code)
);

-- Package items
CREATE TABLE IF NOT EXISTS event_package_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES event_packages(id) ON DELETE CASCADE,

  item_type event_quotation_item_type NOT NULL DEFAULT 'OTHER',
  description text NOT NULL,
  quantity numeric(12,3) NOT NULL DEFAULT 1,
  uom text,
  unit_rate numeric(14,2) NOT NULL DEFAULT 0,
  included boolean NOT NULL DEFAULT true,

  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Event tasks
CREATE TABLE IF NOT EXISTS event_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,

  title text NOT NULL,
  description text,
  category event_task_category NOT NULL DEFAULT 'GENERAL',

  assigned_to uuid REFERENCES public.profiles(id),
  due_at timestamptz,
  priority event_task_priority NOT NULL DEFAULT 'NORMAL',
  status event_task_status NOT NULL DEFAULT 'TODO',

  completed_at timestamptz,
  completed_by uuid REFERENCES public.profiles(id),

  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Event schedule items (day run sheet)
CREATE TABLE IF NOT EXISTS event_schedule_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,

  start_time timestamptz NOT NULL,
  end_time timestamptz,
  title text NOT NULL,
  description text,
  department event_department NOT NULL DEFAULT 'OTHER',
  assigned_to uuid REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'SCHEDULED',

  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Event resources (reference-based allocation)
CREATE TABLE IF NOT EXISTS event_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,

  resource_type text NOT NULL, -- VENUE, ROOM, EQUIPMENT, STAFF, MENU, VENDOR
  resource_id uuid, -- polymorphic FK
  quantity numeric(12,3) NOT NULL DEFAULT 1,
  start_at timestamptz,
  end_at timestamptz,
  status text NOT NULL DEFAULT 'PLANNED',
  notes text,

  created_at timestamptz NOT NULL DEFAULT now()
);

-- Event vendors (links to existing suppliers)
CREATE TABLE IF NOT EXISTS event_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,

  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  service_description text NOT NULL,
  quoted_amount numeric(14,2),
  actual_amount numeric(14,2),
  status text NOT NULL DEFAULT 'PLANNED',
  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Event changes (audit trail for significant changes)
CREATE TABLE IF NOT EXISTS event_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,

  change_type text NOT NULL,
  description text NOT NULL,
  old_value text,
  new_value text,
  financial_impact numeric(14,2),

  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Event payments
CREATE TABLE IF NOT EXISTS event_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,

  payment_number text NOT NULL,
  payment_type event_payment_type NOT NULL DEFAULT 'ADVANCE',

  amount numeric(14,2) NOT NULL DEFAULT 0,
  payment_method text,
  payment_date date NOT NULL,
  reference_number text,

  notes text,

  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_event_payments_number UNIQUE (organization_id, payment_number)
);

-- =====================================================================
-- 3. INDEXES
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_event_venues_org ON event_venues(organization_id);
CREATE INDEX IF NOT EXISTS idx_event_venues_property ON event_venues(property_id);
CREATE INDEX IF NOT EXISTS idx_event_venues_status ON event_venues(status);

CREATE INDEX IF NOT EXISTS idx_events_org ON events(organization_id);
CREATE INDEX IF NOT EXISTS idx_events_property ON events(property_id);
CREATE INDEX IF NOT EXISTS idx_events_customer ON events(customer_id);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_venue ON events(venue_id);

CREATE INDEX IF NOT EXISTS idx_event_leads_org ON event_leads(organization_id);
CREATE INDEX IF NOT EXISTS idx_event_leads_status ON event_leads(status);
CREATE INDEX IF NOT EXISTS idx_event_leads_follow_up ON event_leads(next_follow_up_at);

CREATE INDEX IF NOT EXISTS idx_event_quotations_event ON event_quotations(event_id);
CREATE INDEX IF NOT EXISTS idx_event_quotations_status ON event_quotations(status);

CREATE INDEX IF NOT EXISTS idx_event_tasks_event ON event_tasks(event_id);
CREATE INDEX IF NOT EXISTS idx_event_tasks_status ON event_tasks(status);
CREATE INDEX IF NOT EXISTS idx_event_tasks_assigned ON event_tasks(assigned_to);

CREATE INDEX IF NOT EXISTS idx_event_schedule_event ON event_schedule_items(event_id);
CREATE INDEX IF NOT EXISTS idx_event_schedule_time ON event_schedule_items(start_time);

CREATE INDEX IF NOT EXISTS idx_event_payments_event ON event_payments(event_id);

-- =====================================================================
-- 4. RLS
-- =====================================================================

ALTER TABLE event_venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_quotation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_package_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_schedule_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_payments ENABLE ROW LEVEL SECURITY;

-- Org-scoped SELECT for all event tables
DO $$ DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'event_venues', 'events', 'event_leads', 'event_quotations',
    'event_quotation_items', 'event_packages', 'event_package_items',
    'event_tasks', 'event_schedule_items', 'event_resources',
    'event_vendors', 'event_changes', 'event_payments'
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

-- Helper: check org membership
CREATE OR REPLACE FUNCTION app.check_event_membership()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT app.current_organization_id() IS NOT NULL;
$$;

-- ----- Venues -----

CREATE OR REPLACE FUNCTION app.create_event_venue(
  p_property_id uuid,
  p_name text,
  p_code text DEFAULT NULL,
  p_venue_type event_venue_type DEFAULT 'BANQUET_HALL',
  p_capacity integer DEFAULT 0,
  p_area_sq_ft numeric DEFAULT NULL,
  p_description text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org uuid := app.current_organization_id();
  v_id uuid;
BEGIN
  IF NOT app.check_event_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  INSERT INTO event_venues (organization_id, property_id, name, code, venue_type, capacity, area_sq_ft, description)
  VALUES (v_org, p_property_id, p_name, p_code, p_venue_type, p_capacity, p_area_sq_ft, p_description)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.update_event_venue(
  p_venue_id uuid,
  p_name text DEFAULT NULL,
  p_code text DEFAULT NULL,
  p_venue_type event_venue_type DEFAULT NULL,
  p_capacity integer DEFAULT NULL,
  p_area_sq_ft numeric DEFAULT NULL,
  p_status event_venue_status DEFAULT NULL,
  p_description text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT app.check_event_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  UPDATE event_venues SET
    name = COALESCE(p_name, name),
    code = COALESCE(p_code, code),
    venue_type = COALESCE(p_venue_type, venue_type),
    capacity = COALESCE(p_capacity, capacity),
    area_sq_ft = COALESCE(p_area_sq_ft, area_sq_ft),
    status = COALESCE(p_status, status),
    description = COALESCE(p_description, description),
    updated_at = now()
  WHERE id = p_venue_id AND organization_id = app.current_organization_id();
END;
$$;

-- ----- Event number generator -----

CREATE OR REPLACE FUNCTION app.next_event_number(p_org uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_year int := extract(year FROM now());
  v_seq int;
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count FROM events
  WHERE organization_id = p_org AND event_number LIKE 'EVT-' || v_year || '-%';
  v_seq := v_count + 1;
  RETURN 'EVT-' || v_year || '-' || lpad(v_seq::text, 4, '0');
END;
$$;

-- ----- Leads -----

CREATE OR REPLACE FUNCTION app.next_lead_number(p_org uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_year int := extract(year FROM now());
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count FROM event_leads
  WHERE organization_id = p_org AND lead_number LIKE 'EVL-' || v_year || '-%';
  RETURN 'EVL-' || v_year || '-' || lpad((v_count + 1)::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION app.create_event_lead(
  p_property_id uuid,
  p_contact_name text,
  p_mobile text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_event_type event_type DEFAULT 'OTHER',
  p_event_date date DEFAULT NULL,
  p_expected_guests integer DEFAULT NULL,
  p_budget numeric DEFAULT NULL,
  p_venue_preference text DEFAULT NULL,
  p_source event_source DEFAULT 'WALK_IN',
  p_assigned_to uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org uuid := app.current_organization_id();
  v_num text;
  v_id uuid;
BEGIN
  IF NOT app.check_event_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  v_num := app.next_lead_number(v_org);
  INSERT INTO event_leads (organization_id, property_id, lead_number, contact_name, mobile, email,
    customer_id, event_type, event_date, expected_guests, budget, venue_preference,
    source, assigned_to, notes)
  VALUES (v_org, p_property_id, v_num, p_contact_name, p_mobile, p_email,
    p_customer_id, p_event_type, p_event_date, p_expected_guests, p_budget, p_venue_preference,
    p_source, p_assigned_to, p_notes)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.update_event_lead(
  p_lead_id uuid,
  p_contact_name text DEFAULT NULL,
  p_mobile text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_event_type event_type DEFAULT NULL,
  p_event_date date DEFAULT NULL,
  p_expected_guests integer DEFAULT NULL,
  p_budget numeric DEFAULT NULL,
  p_venue_preference text DEFAULT NULL,
  p_source event_source DEFAULT NULL,
  p_assigned_to uuid DEFAULT NULL,
  p_status event_lead_status DEFAULT NULL,
  p_next_follow_up_at timestamptz DEFAULT NULL,
  p_follow_up_notes text DEFAULT NULL,
  p_loss_reason event_loss_reason DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT app.check_event_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  UPDATE event_leads SET
    contact_name = COALESCE(p_contact_name, contact_name),
    mobile = COALESCE(p_mobile, mobile),
    email = COALESCE(p_email, email),
    customer_id = COALESCE(p_customer_id, customer_id),
    event_type = COALESCE(p_event_type, event_type),
    event_date = COALESCE(p_event_date, event_date),
    expected_guests = COALESCE(p_expected_guests, expected_guests),
    budget = COALESCE(p_budget, budget),
    venue_preference = COALESCE(p_venue_preference, venue_preference),
    source = COALESCE(p_source, source),
    assigned_to = COALESCE(p_assigned_to, assigned_to),
    status = COALESCE(p_status, status),
    next_follow_up_at = COALESCE(p_next_follow_up_at, next_follow_up_at),
    follow_up_notes = COALESCE(p_follow_up_notes, follow_up_notes),
    loss_reason = COALESCE(p_loss_reason, loss_reason),
    notes = COALESCE(p_notes, notes),
    updated_at = now()
  WHERE id = p_lead_id AND organization_id = app.current_organization_id();
END;
$$;

-- ----- Lead → Event conversion -----

CREATE OR REPLACE FUNCTION app.convert_lead_to_event(
  p_lead_id uuid,
  p_property_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org uuid := app.current_organization_id();
  v_lead record;
  v_event_num text;
  v_event_id uuid;
BEGIN
  IF NOT app.check_event_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;

  SELECT * INTO v_lead FROM event_leads
  WHERE id = p_lead_id AND organization_id = v_org;

  IF v_lead IS NULL THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;

  v_event_num := app.next_event_number(v_org);

  INSERT INTO events (organization_id, property_id, event_number, lead_id, customer_id,
    event_type, event_name, event_date, expected_guests, status, source,
    sales_owner_id, notes)
  VALUES (v_org, p_property_id, v_event_num, p_lead_id, v_lead.customer_id,
    v_lead.event_type,
    v_lead.contact_name || ' - ' || v_lead.event_type::text,
    v_lead.event_date, v_lead.expected_guests, 'ENQUIRY'::event_status,
    v_lead.source, v_lead.assigned_to, v_lead.notes)
  RETURNING id INTO v_event_id;

  UPDATE event_leads SET
    status = 'CONVERTED'::event_lead_status,
    converted_event_id = v_event_id,
    updated_at = now()
  WHERE id = p_lead_id;

  RETURN v_event_id;
END;
$$;

-- ----- Events -----

CREATE OR REPLACE FUNCTION app.create_event(
  p_property_id uuid,
  p_event_name text,
  p_event_type event_type DEFAULT 'OTHER',
  p_event_date date DEFAULT NULL,
  p_start_time time DEFAULT NULL,
  p_end_time time DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_venue_id uuid DEFAULT NULL,
  p_expected_guests integer DEFAULT NULL,
  p_status event_status DEFAULT 'ENQUIRY',
  p_source event_source DEFAULT 'WALK_IN',
  p_sales_owner_id uuid DEFAULT NULL,
  p_lead_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org uuid := app.current_organization_id();
  v_num text;
  v_id uuid;
BEGIN
  IF NOT app.check_event_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  v_num := app.next_event_number(v_org);
  INSERT INTO events (organization_id, property_id, event_number, lead_id, customer_id,
    event_type, event_name, event_date, start_time, end_time, venue_id,
    expected_guests, status, source, sales_owner_id, notes)
  VALUES (v_org, p_property_id, v_num, p_lead_id, p_customer_id,
    p_event_type, p_event_name, p_event_date, p_start_time, p_end_time, p_venue_id,
    p_expected_guests, p_status, p_source, p_sales_owner_id, p_notes)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.update_event(
  p_event_id uuid,
  p_event_name text DEFAULT NULL,
  p_event_type event_type DEFAULT NULL,
  p_event_date date DEFAULT NULL,
  p_start_time time DEFAULT NULL,
  p_end_time time DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_venue_id uuid DEFAULT NULL,
  p_expected_guests integer DEFAULT NULL,
  p_confirmed_guests integer DEFAULT NULL,
  p_guaranteed_guests integer DEFAULT NULL,
  p_actual_guests integer DEFAULT NULL,
  p_status event_status DEFAULT NULL,
  p_source event_source DEFAULT NULL,
  p_sales_owner_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT app.check_event_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  UPDATE events SET
    event_name = COALESCE(p_event_name, event_name),
    event_type = COALESCE(p_event_type, event_type),
    event_date = COALESCE(p_event_date, event_date),
    start_time = COALESCE(p_start_time, start_time),
    end_time = COALESCE(p_end_time, end_time),
    customer_id = COALESCE(p_customer_id, customer_id),
    venue_id = COALESCE(p_venue_id, venue_id),
    expected_guests = COALESCE(p_expected_guests, expected_guests),
    confirmed_guests = COALESCE(p_confirmed_guests, confirmed_guests),
    guaranteed_guests = COALESCE(p_guaranteed_guests, guaranteed_guests),
    actual_guests = COALESCE(p_actual_guests, actual_guests),
    status = COALESCE(p_status, status),
    source = COALESCE(p_source, source),
    sales_owner_id = COALESCE(p_sales_owner_id, sales_owner_id),
    notes = COALESCE(p_notes, notes),
    updated_at = now()
  WHERE id = p_event_id AND organization_id = app.current_organization_id();
END;
$$;

CREATE OR REPLACE FUNCTION app.confirm_event(
  p_event_id uuid,
  p_notes text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_profile uuid := app.current_profile_id();
BEGIN
  IF NOT app.check_event_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  UPDATE events SET
    status = 'CONFIRMED'::event_status,
    confirmed_at = now(),
    confirmed_by = v_profile,
    confirmation_notes = COALESCE(p_notes, confirmation_notes),
    updated_at = now()
  WHERE id = p_event_id AND organization_id = app.current_organization_id();
END;
$$;

CREATE OR REPLACE FUNCTION app.cancel_event(
  p_event_id uuid,
  p_reason text,
  p_loss_reason event_loss_reason DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_profile uuid := app.current_profile_id();
BEGIN
  IF NOT app.check_event_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  UPDATE events SET
    status = 'CANCELLED'::event_status,
    cancelled_at = now(),
    cancelled_by = v_profile,
    cancellation_reason = p_reason,
    loss_reason = COALESCE(p_loss_reason, loss_reason),
    updated_at = now()
  WHERE id = p_event_id AND organization_id = app.current_organization_id();
END;
$$;

-- ----- Venue conflict check -----

CREATE OR REPLACE FUNCTION app.check_venue_conflict(
  p_venue_id uuid,
  p_event_date date,
  p_start_time time,
  p_end_time time,
  p_exclude_event_id uuid DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org uuid := app.current_organization_id();
  v_conflict boolean;
BEGIN
  IF NOT app.check_event_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM events e
    WHERE e.organization_id = v_org
      AND e.venue_id = p_venue_id
      AND e.event_date = p_event_date
      AND e.status NOT IN ('CANCELLED'::event_status, 'LOST'::event_status)
      AND (p_exclude_event_id IS NULL OR e.id != p_exclude_event_id)
      AND e.start_time < p_end_time
      AND e.end_time > p_start_time
  ) INTO v_conflict;

  RETURN v_conflict;
END;
$$;

-- ----- Quotations -----

CREATE OR REPLACE FUNCTION app.next_quotation_number(p_org uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_year int := extract(year FROM now());
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count FROM event_quotations
  WHERE organization_id = p_org AND quotation_number LIKE 'QT-' || v_year || '-%';
  RETURN 'QT-' || v_year || '-' || lpad((v_count + 1)::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION app.create_event_quotation(
  p_event_id uuid,
  p_valid_until date DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_terms text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org uuid := app.current_organization_id();
  v_property uuid;
  v_num text;
  v_id uuid;
BEGIN
  IF NOT app.check_event_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  SELECT property_id INTO v_property FROM events WHERE id = p_event_id AND organization_id = v_org;
  v_num := app.next_quotation_number(v_org);
  INSERT INTO event_quotations (organization_id, property_id, event_id, quotation_number,
    valid_until, notes, terms, created_by)
  VALUES (v_org, v_property, p_event_id, v_num, p_valid_until, p_notes, p_terms, app.current_profile_id())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.update_event_quotation(
  p_quotation_id uuid,
  p_status event_quotation_status DEFAULT NULL,
  p_valid_until date DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_terms text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT app.check_event_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  UPDATE event_quotations SET
    status = COALESCE(p_status, status),
    valid_until = COALESCE(p_valid_until, valid_until),
    notes = COALESCE(p_notes, notes),
    terms = COALESCE(p_terms, terms),
    sent_at = CASE WHEN p_status = 'SENT'::event_quotation_status THEN now() ELSE sent_at END,
    accepted_at = CASE WHEN p_status = 'ACCEPTED'::event_quotation_status THEN now() ELSE accepted_at END,
    updated_at = now()
  WHERE id = p_quotation_id AND organization_id = app.current_organization_id();
END;
$$;

CREATE OR REPLACE FUNCTION app.add_quotation_item(
  p_quotation_id uuid,
  p_item_type event_quotation_item_type,
  p_description text,
  p_quantity numeric DEFAULT 1,
  p_uom text DEFAULT NULL,
  p_unit_rate numeric DEFAULT 0,
  p_discount numeric DEFAULT 0,
  p_tax_rate numeric DEFAULT 0,
  p_notes text DEFAULT NULL,
  p_sort_order integer DEFAULT 0
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id uuid;
  v_amount numeric;
BEGIN
  IF NOT app.check_event_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  v_amount := (p_quantity * p_unit_rate) - p_discount;
  INSERT INTO event_quotation_items (quotation_id, item_type, description, quantity, uom,
    unit_rate, discount, tax_rate, amount, notes, sort_order)
  VALUES (p_quotation_id, p_item_type, p_description, p_quantity, p_uom,
    p_unit_rate, p_discount, p_tax_rate, v_amount, p_notes, p_sort_order)
  RETURNING id INTO v_id;

  -- Update quotation totals
  UPDATE event_quotations SET
    subtotal = (SELECT COALESCE(SUM(amount), 0) FROM event_quotation_items WHERE quotation_id = p_quotation_id),
    grand_total = (SELECT COALESCE(SUM(amount * (1 + tax_rate/100)), 0) FROM event_quotation_items WHERE quotation_id = p_quotation_id),
    updated_at = now()
  WHERE id = p_quotation_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.remove_quotation_item(
  p_item_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_qid uuid;
BEGIN
  IF NOT app.check_event_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  SELECT quotation_id INTO v_qid FROM event_quotation_items WHERE id = p_item_id;
  DELETE FROM event_quotation_items WHERE id = p_item_id;

  -- Update quotation totals
  UPDATE event_quotations SET
    subtotal = (SELECT COALESCE(SUM(amount), 0) FROM event_quotation_items WHERE quotation_id = v_qid),
    grand_total = (SELECT COALESCE(SUM(amount * (1 + tax_rate/100)), 0) FROM event_quotation_items WHERE quotation_id = v_qid),
    updated_at = now()
  WHERE id = v_qid;
END;
$$;

-- ----- Tasks -----

CREATE OR REPLACE FUNCTION app.create_event_task(
  p_event_id uuid,
  p_title text,
  p_description text DEFAULT NULL,
  p_category event_task_category DEFAULT 'GENERAL',
  p_assigned_to uuid DEFAULT NULL,
  p_due_at timestamptz DEFAULT NULL,
  p_priority event_task_priority DEFAULT 'NORMAL'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org uuid := app.current_organization_id();
  v_property uuid;
  v_id uuid;
BEGIN
  IF NOT app.check_event_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  SELECT property_id INTO v_property FROM events WHERE id = p_event_id AND organization_id = v_org;
  INSERT INTO event_tasks (organization_id, property_id, event_id, title, description,
    category, assigned_to, due_at, priority, created_by)
  VALUES (v_org, v_property, p_event_id, p_title, p_description,
    p_category, p_assigned_to, p_due_at, p_priority, app.current_profile_id())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.update_event_task(
  p_task_id uuid,
  p_title text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_category event_task_category DEFAULT NULL,
  p_assigned_to uuid DEFAULT NULL,
  p_due_at timestamptz DEFAULT NULL,
  p_priority event_task_priority DEFAULT NULL,
  p_status event_task_status DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_profile uuid := app.current_profile_id();
BEGIN
  IF NOT app.check_event_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  UPDATE event_tasks SET
    title = COALESCE(p_title, title),
    description = COALESCE(p_description, description),
    category = COALESCE(p_category, category),
    assigned_to = COALESCE(p_assigned_to, assigned_to),
    due_at = COALESCE(p_due_at, due_at),
    priority = COALESCE(p_priority, priority),
    status = COALESCE(p_status, status),
    completed_at = CASE WHEN p_status = 'COMPLETED'::event_task_status THEN now() ELSE completed_at END,
    completed_by = CASE WHEN p_status = 'COMPLETED'::event_task_status THEN v_profile ELSE completed_by END,
    updated_at = now()
  WHERE id = p_task_id AND organization_id = app.current_organization_id();
END;
$$;

-- ----- Schedule items -----

CREATE OR REPLACE FUNCTION app.create_event_schedule_item(
  p_event_id uuid,
  p_start_time timestamptz,
  p_title text,
  p_end_time timestamptz DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_department event_department DEFAULT 'OTHER',
  p_assigned_to uuid DEFAULT NULL,
  p_sort_order integer DEFAULT 0
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org uuid := app.current_organization_id();
  v_property uuid;
  v_id uuid;
BEGIN
  IF NOT app.check_event_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  SELECT property_id INTO v_property FROM events WHERE id = p_event_id AND organization_id = v_org;
  INSERT INTO event_schedule_items (organization_id, property_id, event_id, start_time, end_time,
    title, description, department, assigned_to, sort_order)
  VALUES (v_org, v_property, p_event_id, p_start_time, p_end_time,
    p_title, p_description, p_department, p_assigned_to, p_sort_order)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.delete_event_schedule_item(
  p_item_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT app.check_event_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  DELETE FROM event_schedule_items WHERE id = p_item_id AND organization_id = app.current_organization_id();
END;
$$;

-- ----- Vendors -----

CREATE OR REPLACE FUNCTION app.create_event_vendor(
  p_event_id uuid,
  p_supplier_id uuid,
  p_service_description text,
  p_quoted_amount numeric DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org uuid := app.current_organization_id();
  v_property uuid;
  v_id uuid;
BEGIN
  IF NOT app.check_event_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  SELECT property_id INTO v_property FROM events WHERE id = p_event_id AND organization_id = v_org;
  INSERT INTO event_vendors (organization_id, property_id, event_id, supplier_id,
    service_description, quoted_amount, notes)
  VALUES (v_org, v_property, p_event_id, p_supplier_id, p_service_description, p_quoted_amount, p_notes)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.update_event_vendor(
  p_vendor_id uuid,
  p_service_description text DEFAULT NULL,
  p_quoted_amount numeric DEFAULT NULL,
  p_actual_amount numeric DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT app.check_event_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  UPDATE event_vendors SET
    service_description = COALESCE(p_service_description, service_description),
    quoted_amount = COALESCE(p_quoted_amount, quoted_amount),
    actual_amount = COALESCE(p_actual_amount, actual_amount),
    status = COALESCE(p_status, status),
    notes = COALESCE(p_notes, notes),
    updated_at = now()
  WHERE id = p_vendor_id AND organization_id = app.current_organization_id();
END;
$$;

CREATE OR REPLACE FUNCTION app.delete_event_vendor(
  p_vendor_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT app.check_event_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  DELETE FROM event_vendors WHERE id = p_vendor_id AND organization_id = app.current_organization_id();
END;
$$;

-- ----- Payments -----

CREATE OR REPLACE FUNCTION app.next_event_payment_number(p_org uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_year int := extract(year FROM now());
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count FROM event_payments
  WHERE organization_id = p_org AND payment_number LIKE 'EVP-' || v_year || '-%';
  RETURN 'EVP-' || v_year || '-' || lpad((v_count + 1)::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION app.create_event_payment(
  p_event_id uuid,
  p_payment_type event_payment_type,
  p_amount numeric,
  p_payment_date date,
  p_payment_method text DEFAULT NULL,
  p_reference_number text DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org uuid := app.current_organization_id();
  v_property uuid;
  v_num text;
  v_id uuid;
BEGIN
  IF NOT app.check_event_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  SELECT property_id INTO v_property FROM events WHERE id = p_event_id AND organization_id = v_org;
  v_num := app.next_event_payment_number(v_org);
  INSERT INTO event_payments (organization_id, property_id, event_id, payment_number,
    payment_type, amount, payment_method, payment_date, reference_number, notes, created_by)
  VALUES (v_org, v_property, p_event_id, v_num, p_payment_type, p_amount,
    p_payment_method, p_payment_date, p_reference_number, p_notes, app.current_profile_id())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ----- Packages -----

CREATE OR REPLACE FUNCTION app.create_event_package(
  p_property_id uuid,
  p_name text,
  p_code text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_pricing_model event_pricing_model DEFAULT 'PER_PERSON',
  p_base_price numeric DEFAULT 0
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org uuid := app.current_organization_id();
  v_id uuid;
BEGIN
  IF NOT app.check_event_membership() THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  INSERT INTO event_packages (organization_id, property_id, name, code, description,
    pricing_model, base_price)
  VALUES (v_org, p_property_id, p_name, p_code, p_description, p_pricing_model, p_base_price)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- =====================================================================
-- 6. PERMISSIONS
-- =====================================================================

DO $$
DECLARE
  perms text[] := ARRAY[
    'events.view',
    'events.lead.view', 'events.lead.create', 'events.lead.edit',
    'events.lead.convert', 'events.lead.assign', 'events.lead.close',
    'events.event.view', 'events.event.create', 'events.event.edit',
    'events.event.confirm', 'events.event.cancel', 'events.event.complete',
    'events.venue.view', 'events.venue.manage',
    'events.quotation.view', 'events.quotation.create', 'events.quotation.edit',
    'events.quotation.send', 'events.quotation.accept', 'events.quotation.cancel',
    'events.payment.view', 'events.payment.create', 'events.payment.refund',
    'events.plan.view', 'events.plan.manage',
    'events.task.view', 'events.task.create', 'events.task.manage',
    'events.vendor.view', 'events.vendor.manage',
    'events.schedule.view', 'events.schedule.manage',
    'events.pnl.view',
    'events.documents.view', 'events.documents.manage'
  ];
  p text;
BEGIN
  FOREACH p IN ARRAY perms LOOP
    INSERT INTO app.permissions (name, description, category)
    VALUES (p, 'Event: ' || p, 'events')
    ON CONFLICT (name) DO NOTHING;
  END LOOP;
END $$;

-- Grant event permissions to OWNER and MANAGER roles
DO $$
DECLARE
  perms text[] := ARRAY[
    'events.view', 'events.lead.view', 'events.lead.create', 'events.lead.edit',
    'events.lead.convert', 'events.lead.assign', 'events.lead.close',
    'events.event.view', 'events.event.create', 'events.event.edit',
    'events.event.confirm', 'events.event.cancel', 'events.event.complete',
    'events.venue.view', 'events.venue.manage',
    'events.quotation.view', 'events.quotation.create', 'events.quotation.edit',
    'events.quotation.send', 'events.quotation.accept', 'events.quotation.cancel',
    'events.payment.view', 'events.payment.create', 'events.payment.refund',
    'events.plan.view', 'events.plan.manage',
    'events.task.view', 'events.task.create', 'events.task.manage',
    'events.vendor.view', 'events.vendor.manage',
    'events.schedule.view', 'events.schedule.manage',
    'events.pnl.view', 'events.documents.view', 'events.documents.manage'
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
    'create_event_venue', 'update_event_venue',
    'create_event_lead', 'update_event_lead', 'convert_lead_to_event',
    'create_event', 'update_event', 'confirm_event', 'cancel_event',
    'check_venue_conflict',
    'create_event_quotation', 'update_event_quotation',
    'add_quotation_item', 'remove_quotation_item',
    'create_event_task', 'update_event_task',
    'create_event_schedule_item', 'delete_event_schedule_item',
    'create_event_vendor', 'update_event_vendor', 'delete_event_vendor',
    'create_event_payment',
    'create_event_package'
  ];
  d text;
BEGIN
  FOREACH d IN ARRAY doors LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION app.%I TO authenticated', d);
  END LOOP;
END $$;
