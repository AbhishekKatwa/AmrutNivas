-- 044: Commerce & Digital Channels Foundation
-- Commerce channels, QR codes, public profiles, commerce sessions,
-- table requests, delivery addresses, commerce settings.
-- Extensions to menu_items (public fields) and orders (source_channel).
-- All tables are org-scoped under RLS.
-- Writes through security-definer doors; reads under RLS.

-- =====================================================================
-- 1. ENUMS
-- =====================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'commerce_channel_type') THEN
    CREATE TYPE commerce_channel_type AS ENUM (
      'QR_MENU', 'TABLE_QR', 'ONLINE_ORDERING', 'DIRECT_BOOKING',
      'WEBSITE', 'MOBILE_WEB', 'OTHER'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'commerce_channel_status') THEN
    CREATE TYPE commerce_channel_status AS ENUM (
      'ACTIVE', 'INACTIVE'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'qr_code_type') THEN
    CREATE TYPE qr_code_type AS ENUM (
      'MENU', 'TABLE_ORDER', 'PROPERTY', 'OUTLET', 'BOOKING', 'EVENT', 'OTHER'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'qr_code_status') THEN
    CREATE TYPE qr_code_status AS ENUM (
      'ACTIVE', 'INACTIVE', 'REVOKED'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'commerce_session_status') THEN
    CREATE TYPE commerce_session_status AS ENUM (
      'ACTIVE', 'EXPIRED', 'COMPLETED', 'CANCELLED'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'table_request_type') THEN
    CREATE TYPE table_request_type AS ENUM (
      'CALL_STAFF', 'REQUEST_BILL', 'REQUEST_WATER', 'REQUEST_CLEANING',
      'REQUEST_ASSISTANCE', 'OTHER'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'table_request_status') THEN
    CREATE TYPE table_request_status AS ENUM (
      'OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delivery_address_label') THEN
    CREATE TYPE delivery_address_label AS ENUM (
      'HOME', 'WORK', 'OTHER'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'public_profile_status') THEN
    CREATE TYPE public_profile_status AS ENUM (
      'ACTIVE', 'INACTIVE'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dietary_type') THEN
    CREATE TYPE dietary_type AS ENUM (
      'VEG', 'NON_VEG', 'VEGAN', 'EGGETARIAN', 'JAIN', 'OTHER'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'source_channel') THEN
    CREATE TYPE source_channel AS ENUM (
      'POS', 'QR', 'WEBSITE', 'DIRECT_BOOKING', 'PHONE', 'WALK_IN',
      'OTA', 'WHATSAPP', 'OTHER'
    );
  END IF;
END $$;

-- =====================================================================
-- 2. EXTENSIONS TO EXISTING TABLES
-- =====================================================================

-- Add public fields to menu_items
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT true;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS public_description text;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS public_image text;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS dietary dietary_type;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS allergen_info jsonb;

-- Add source_channel to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source_channel source_channel;

-- =====================================================================
-- 3. TABLES
-- =====================================================================

-- Commerce channels
CREATE TABLE IF NOT EXISTS commerce_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid REFERENCES properties(id),
  outlet_id uuid REFERENCES outlets(id),

  name text NOT NULL,
  type commerce_channel_type NOT NULL,
  status commerce_channel_status NOT NULL DEFAULT 'ACTIVE',

  configuration jsonb DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_commerce_channel_name CHECK (char_length(name) >= 1)
);

-- Property public profiles
CREATE TABLE IF NOT EXISTS property_public_profiles (
  property_id uuid PRIMARY KEY REFERENCES properties(id),

  public_name text NOT NULL,
  slug text NOT NULL UNIQUE,

  description text,
  short_description text,

  logo text,
  cover_image text,

  phone text,
  email text,
  website text,

  address text,
  city text,
  state text,
  country text,

  latitude numeric(10, 7),
  longitude numeric(10, 7),

  check_in_time time,
  check_out_time time,

  status public_profile_status NOT NULL DEFAULT 'ACTIVE',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_property_public_name CHECK (char_length(public_name) >= 1),
  CONSTRAINT chk_property_slug CHECK (char_length(slug) >= 2)
);

-- Outlet public profiles
CREATE TABLE IF NOT EXISTS outlet_public_profiles (
  outlet_id uuid PRIMARY KEY REFERENCES outlets(id),

  public_name text NOT NULL,
  slug text NOT NULL UNIQUE,

  description text,

  cover_image text,

  phone text,
  email text,

  address text,

  opening_hours jsonb,

  status public_profile_status NOT NULL DEFAULT 'ACTIVE',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_outlet_public_name CHECK (char_length(public_name) >= 1),
  CONSTRAINT chk_outlet_slug CHECK (char_length(slug) >= 2)
);

-- QR codes
CREATE TABLE IF NOT EXISTS qr_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),

  property_id uuid REFERENCES properties(id),
  outlet_id uuid REFERENCES outlets(id),
  table_id uuid REFERENCES restaurant_tables(id),

  type qr_code_type NOT NULL,

  code text NOT NULL UNIQUE,
  short_code text,

  target_type text,
  target_id uuid,

  status qr_code_status NOT NULL DEFAULT 'ACTIVE',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_qr_code CHECK (char_length(code) >= 4)
);

-- Commerce sessions
CREATE TABLE IF NOT EXISTS commerce_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id),
  outlet_id uuid NOT NULL REFERENCES outlets(id),

  channel commerce_channel_type NOT NULL,

  table_id uuid REFERENCES restaurant_tables(id),

  customer_id uuid REFERENCES guests(id),

  session_token text NOT NULL UNIQUE,

  status commerce_session_status NOT NULL DEFAULT 'ACTIVE',

  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,

  metadata jsonb DEFAULT '{}'::jsonb,

  CONSTRAINT chk_session_token CHECK (char_length(session_token) >= 8)
);

-- Table requests
CREATE TABLE IF NOT EXISTS table_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id),
  outlet_id uuid NOT NULL REFERENCES outlets(id),
  table_id uuid NOT NULL REFERENCES restaurant_tables(id),

  commerce_session_id uuid REFERENCES commerce_sessions(id),

  type table_request_type NOT NULL,
  message text,

  status table_request_status NOT NULL DEFAULT 'OPEN',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid
);

-- Delivery addresses
CREATE TABLE IF NOT EXISTS delivery_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),

  customer_id uuid REFERENCES guests(id),

  name text NOT NULL,
  mobile text NOT NULL,

  address_line1 text NOT NULL,
  address_line2 text,
  landmark text,
  city text NOT NULL,
  state text NOT NULL,
  postal_code text NOT NULL,

  latitude numeric(10, 7),
  longitude numeric(10, 7),

  label delivery_address_label NOT NULL DEFAULT 'HOME',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_delivery_name CHECK (char_length(name) >= 1),
  CONSTRAINT chk_delivery_mobile CHECK (char_length(mobile) >= 5)
);

-- Commerce settings (per property)
CREATE TABLE IF NOT EXISTS commerce_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id),

  qr_ordering_enabled boolean NOT NULL DEFAULT true,
  online_ordering_enabled boolean NOT NULL DEFAULT true,
  takeaway_enabled boolean NOT NULL DEFAULT true,
  delivery_enabled boolean NOT NULL DEFAULT false,
  direct_booking_enabled boolean NOT NULL DEFAULT true,

  require_customer_mobile boolean NOT NULL DEFAULT false,
  allow_guest_checkout boolean NOT NULL DEFAULT true,

  minimum_order_amount numeric(12, 2) DEFAULT NULL,
  service_charge_enabled boolean NOT NULL DEFAULT false,

  public_menu_enabled boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (organization_id, property_id)
);

-- =====================================================================
-- 4. INDEXES
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_commerce_channels_org ON commerce_channels(organization_id);
CREATE INDEX IF NOT EXISTS idx_commerce_channels_property ON commerce_channels(property_id);
CREATE INDEX IF NOT EXISTS idx_commerce_channels_outlet ON commerce_channels(outlet_id);
CREATE INDEX IF NOT EXISTS idx_commerce_channels_status ON commerce_channels(status);

CREATE INDEX IF NOT EXISTS idx_property_public_profiles_slug ON property_public_profiles(slug);
CREATE INDEX IF NOT EXISTS idx_outlet_public_profiles_slug ON outlet_public_profiles(slug);

CREATE INDEX IF NOT EXISTS idx_qr_codes_org ON qr_codes(organization_id);
CREATE INDEX IF NOT EXISTS idx_qr_codes_property ON qr_codes(property_id);
CREATE INDEX IF NOT EXISTS idx_qr_codes_outlet ON qr_codes(outlet_id);
CREATE INDEX IF NOT EXISTS idx_qr_codes_table ON qr_codes(table_id);
CREATE INDEX IF NOT EXISTS idx_qr_codes_code ON qr_codes(code);
CREATE INDEX IF NOT EXISTS idx_qr_codes_status ON qr_codes(status);

CREATE INDEX IF NOT EXISTS idx_commerce_sessions_org ON commerce_sessions(organization_id);
CREATE INDEX IF NOT EXISTS idx_commerce_sessions_property ON commerce_sessions(property_id);
CREATE INDEX IF NOT EXISTS idx_commerce_sessions_outlet ON commerce_sessions(outlet_id);
CREATE INDEX IF NOT EXISTS idx_commerce_sessions_token ON commerce_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_commerce_sessions_status ON commerce_sessions(status);

CREATE INDEX IF NOT EXISTS idx_table_requests_org ON table_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_table_requests_property ON table_requests(property_id);
CREATE INDEX IF NOT EXISTS idx_table_requests_outlet ON table_requests(outlet_id);
CREATE INDEX IF NOT EXISTS idx_table_requests_table ON table_requests(table_id);
CREATE INDEX IF NOT EXISTS idx_table_requests_status ON table_requests(status);
CREATE INDEX IF NOT EXISTS idx_table_requests_created ON table_requests(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_delivery_addresses_org ON delivery_addresses(organization_id);
CREATE INDEX IF NOT EXISTS idx_delivery_addresses_customer ON delivery_addresses(customer_id);

CREATE INDEX IF NOT EXISTS idx_commerce_settings_org ON commerce_settings(organization_id);
CREATE INDEX IF NOT EXISTS idx_commerce_settings_property ON commerce_settings(property_id);

-- =====================================================================
-- 5. RLS POLICIES
-- =====================================================================

ALTER TABLE commerce_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_public_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlet_public_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_settings ENABLE ROW LEVEL SECURITY;

-- Commerce channels: org-scoped
DROP POLICY IF EXISTS commerce_channels_select ON commerce_channels;
CREATE POLICY commerce_channels_select ON commerce_channels
  FOR SELECT USING (organization_id = app.current_organization_id());

DROP POLICY IF EXISTS commerce_channels_modify ON commerce_channels;
CREATE POLICY commerce_channels_modify ON commerce_channels
  FOR ALL USING (organization_id = app.current_organization_id());

-- Property public profiles: readable by all authenticated, writable by org
DROP POLICY IF EXISTS property_public_profiles_select ON property_public_profiles;
CREATE POLICY property_public_profiles_select ON property_public_profiles
  FOR SELECT USING (true);

DROP POLICY IF EXISTS property_public_profiles_modify ON property_public_profiles;
CREATE POLICY property_public_profiles_modify ON property_public_profiles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_id
        AND p.organization_id = app.current_organization_id()
    )
  );

-- Outlet public profiles: readable by all authenticated, writable by org
DROP POLICY IF EXISTS outlet_public_profiles_select ON outlet_public_profiles;
CREATE POLICY outlet_public_profiles_select ON outlet_public_profiles
  FOR SELECT USING (true);

DROP POLICY IF EXISTS outlet_public_profiles_modify ON outlet_public_profiles;
CREATE POLICY outlet_public_profiles_modify ON outlet_public_profiles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM outlets o
      WHERE o.id = outlet_id
        AND o.organization_id = app.current_organization_id()
    )
  );

-- QR codes: org-scoped
DROP POLICY IF EXISTS qr_codes_select ON qr_codes;
CREATE POLICY qr_codes_select ON qr_codes
  FOR SELECT USING (organization_id = app.current_organization_id());

DROP POLICY IF EXISTS qr_codes_modify ON qr_codes;
CREATE POLICY qr_codes_modify ON qr_codes
  FOR ALL USING (organization_id = app.current_organization_id());

-- Commerce sessions: org-scoped
DROP POLICY IF EXISTS commerce_sessions_select ON commerce_sessions;
CREATE POLICY commerce_sessions_select ON commerce_sessions
  FOR SELECT USING (organization_id = app.current_organization_id());

DROP POLICY IF EXISTS commerce_sessions_modify ON commerce_sessions;
CREATE POLICY commerce_sessions_modify ON commerce_sessions
  FOR ALL USING (organization_id = app.current_organization_id());

-- Table requests: org-scoped
DROP POLICY IF EXISTS table_requests_select ON table_requests;
CREATE POLICY table_requests_select ON table_requests
  FOR SELECT USING (organization_id = app.current_organization_id());

DROP POLICY IF EXISTS table_requests_modify ON table_requests;
CREATE POLICY table_requests_modify ON table_requests
  FOR ALL USING (organization_id = app.current_organization_id());

-- Delivery addresses: org-scoped
DROP POLICY IF EXISTS delivery_addresses_select ON delivery_addresses;
CREATE POLICY delivery_addresses_select ON delivery_addresses
  FOR SELECT USING (organization_id = app.current_organization_id());

DROP POLICY IF EXISTS delivery_addresses_modify ON delivery_addresses;
CREATE POLICY delivery_addresses_modify ON delivery_addresses
  FOR ALL USING (organization_id = app.current_organization_id());

-- Commerce settings: org-scoped
DROP POLICY IF EXISTS commerce_settings_select ON commerce_settings;
CREATE POLICY commerce_settings_select ON commerce_settings
  FOR SELECT USING (organization_id = app.current_organization_id());

DROP POLICY IF EXISTS commerce_settings_modify ON commerce_settings;
CREATE POLICY commerce_settings_modify ON commerce_settings
  FOR ALL USING (organization_id = app.current_organization_id());

-- =====================================================================
-- 6. DOORS (security-definer RPCs)
-- =====================================================================

-- Create commerce channel
CREATE OR REPLACE FUNCTION app.create_commerce_channel(
  p_property_id uuid DEFAULT NULL,
  p_outlet_id uuid DEFAULT NULL,
  p_name text,
  p_type commerce_channel_type,
  p_configuration jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org uuid := app.current_organization_id();
  v_id uuid;
BEGIN
  INSERT INTO commerce_channels (organization_id, property_id, outlet_id, name, type, configuration)
  VALUES (v_org, p_property_id, p_outlet_id, p_name, p_type, p_configuration)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Update commerce channel
CREATE OR REPLACE FUNCTION app.update_commerce_channel(
  p_channel_id uuid,
  p_name text DEFAULT NULL,
  p_status commerce_channel_status DEFAULT NULL,
  p_configuration jsonb DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org uuid := app.current_organization_id();
  v_id uuid;
BEGIN
  UPDATE commerce_channels
  SET name = COALESCE(p_name, name),
      status = COALESCE(p_status, status),
      configuration = COALESCE(p_configuration, configuration),
      updated_at = now()
  WHERE id = p_channel_id AND organization_id = v_org
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Upsert property public profile
CREATE OR REPLACE FUNCTION app.upsert_property_public_profile(
  p_property_id uuid,
  p_public_name text,
  p_slug text,
  p_description text DEFAULT NULL,
  p_short_description text DEFAULT NULL,
  p_logo text DEFAULT NULL,
  p_cover_image text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_website text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_state text DEFAULT NULL,
  p_country text DEFAULT NULL,
  p_latitude numeric DEFAULT NULL,
  p_longitude numeric DEFAULT NULL,
  p_check_in_time time DEFAULT NULL,
  p_check_out_time time DEFAULT NULL,
  p_status public_profile_status DEFAULT 'ACTIVE'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO property_public_profiles (
    property_id, public_name, slug, description, short_description,
    logo, cover_image, phone, email, website,
    address, city, state, country, latitude, longitude,
    check_in_time, check_out_time, status
  ) VALUES (
    p_property_id, p_public_name, p_slug, p_description, p_short_description,
    p_logo, p_cover_image, p_phone, p_email, p_website,
    p_address, p_city, p_state, p_country, p_latitude, p_longitude,
    p_check_in_time, p_check_out_time, p_status
  )
  ON CONFLICT (property_id) DO UPDATE SET
    public_name = EXCLUDED.public_name,
    slug = EXCLUDED.slug,
    description = EXCLUDED.description,
    short_description = EXCLUDED.short_description,
    logo = EXCLUDED.logo,
    cover_image = EXCLUDED.cover_image,
    phone = EXCLUDED.phone,
    email = EXCLUDED.email,
    website = EXCLUDED.website,
    address = EXCLUDED.address,
    city = EXCLUDED.city,
    state = EXCLUDED.state,
    country = EXCLUDED.country,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    check_in_time = EXCLUDED.check_in_time,
    check_out_time = EXCLUDED.check_out_time,
    status = EXCLUDED.status,
    updated_at = now()
  RETURNING property_id INTO v_id;
  RETURN v_id;
END;
$$;

-- Upsert outlet public profile
CREATE OR REPLACE FUNCTION app.upsert_outlet_public_profile(
  p_outlet_id uuid,
  p_public_name text,
  p_slug text,
  p_description text DEFAULT NULL,
  p_cover_image text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_opening_hours jsonb DEFAULT NULL,
  p_status public_profile_status DEFAULT 'ACTIVE'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO outlet_public_profiles (
    outlet_id, public_name, slug, description, cover_image,
    phone, email, address, opening_hours, status
  ) VALUES (
    p_outlet_id, p_public_name, p_slug, p_description, p_cover_image,
    p_phone, p_email, p_address, p_opening_hours, p_status
  )
  ON CONFLICT (outlet_id) DO UPDATE SET
    public_name = EXCLUDED.public_name,
    slug = EXCLUDED.slug,
    description = EXCLUDED.description,
    cover_image = EXCLUDED.cover_image,
    phone = EXCLUDED.phone,
    email = EXCLUDED.email,
    address = EXCLUDED.address,
    opening_hours = EXCLUDED.opening_hours,
    status = EXCLUDED.status,
    updated_at = now()
  RETURNING outlet_id INTO v_id;
  RETURN v_id;
END;
$$;

-- Create QR code
CREATE OR REPLACE FUNCTION app.create_qr_code(
  p_property_id uuid DEFAULT NULL,
  p_outlet_id uuid DEFAULT NULL,
  p_table_id uuid DEFAULT NULL,
  p_type qr_code_type,
  p_code text,
  p_short_code text DEFAULT NULL,
  p_target_type text DEFAULT NULL,
  p_target_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org uuid := app.current_organization_id();
  v_id uuid;
BEGIN
  INSERT INTO qr_codes (organization_id, property_id, outlet_id, table_id, type, code, short_code, target_type, target_id)
  VALUES (v_org, p_property_id, p_outlet_id, p_table_id, p_type, p_code, p_short_code, p_target_type, p_target_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Update QR code status
CREATE OR REPLACE FUNCTION app.update_qr_code_status(
  p_qr_id uuid,
  p_status qr_code_status
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org uuid := app.current_organization_id();
  v_id uuid;
BEGIN
  UPDATE qr_codes
  SET status = p_status, updated_at = now()
  WHERE id = p_qr_id AND organization_id = v_org
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Create commerce session
CREATE OR REPLACE FUNCTION app.create_commerce_session(
  p_property_id uuid,
  p_outlet_id uuid,
  p_channel commerce_channel_type,
  p_table_id uuid DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_session_token text,
  p_expires_at timestamptz DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org uuid := app.current_organization_id();
  v_id uuid;
BEGIN
  INSERT INTO commerce_sessions (organization_id, property_id, outlet_id, channel, table_id, customer_id, session_token, expires_at, metadata)
  VALUES (v_org, p_property_id, p_outlet_id, p_channel, p_table_id, p_customer_id, p_session_token, p_expires_at, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Update commerce session status
CREATE OR REPLACE FUNCTION app.update_commerce_session_status(
  p_session_id uuid,
  p_status commerce_session_status
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org uuid := app.current_organization_id();
  v_id uuid;
BEGIN
  UPDATE commerce_sessions
  SET status = p_status, updated_at = now()
  WHERE id = p_session_id AND organization_id = v_org
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Create table request
CREATE OR REPLACE FUNCTION app.create_table_request(
  p_property_id uuid,
  p_outlet_id uuid,
  p_table_id uuid,
  p_commerce_session_id uuid DEFAULT NULL,
  p_type table_request_type,
  p_message text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org uuid := app.current_organization_id();
  v_id uuid;
BEGIN
  INSERT INTO table_requests (organization_id, property_id, outlet_id, table_id, commerce_session_id, type, message)
  VALUES (v_org, p_property_id, p_outlet_id, p_table_id, p_commerce_session_id, p_type, p_message)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Update table request status
CREATE OR REPLACE FUNCTION app.update_table_request_status(
  p_request_id uuid,
  p_status table_request_status,
  p_resolved_by uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org uuid := app.current_organization_id();
  v_id uuid;
BEGIN
  UPDATE table_requests
  SET status = p_status,
      resolved_at = CASE WHEN p_status IN ('RESOLVED', 'CANCELLED') THEN now() ELSE NULL END,
      resolved_by = p_resolved_by,
      updated_at = now()
  WHERE id = p_request_id AND organization_id = v_org
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Add delivery address
CREATE OR REPLACE FUNCTION app.add_delivery_address(
  p_customer_id uuid DEFAULT NULL,
  p_name text,
  p_mobile text,
  p_address_line1 text,
  p_address_line2 text DEFAULT NULL,
  p_landmark text DEFAULT NULL,
  p_city text,
  p_state text,
  p_postal_code text,
  p_latitude numeric DEFAULT NULL,
  p_longitude numeric DEFAULT NULL,
  p_label delivery_address_label DEFAULT 'HOME'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org uuid := app.current_organization_id();
  v_id uuid;
BEGIN
  INSERT INTO delivery_addresses (organization_id, customer_id, name, mobile, address_line1, address_line2, landmark, city, state, postal_code, latitude, longitude, label)
  VALUES (v_org, p_customer_id, p_name, p_mobile, p_address_line1, p_address_line2, p_landmark, p_city, p_state, p_postal_code, p_latitude, p_longitude, p_label)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Remove delivery address
CREATE OR REPLACE FUNCTION app.remove_delivery_address(
  p_address_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org uuid := app.current_organization_id();
  v_id uuid;
BEGIN
  DELETE FROM delivery_addresses
  WHERE id = p_address_id AND organization_id = v_org
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Upsert commerce settings
CREATE OR REPLACE FUNCTION app.upsert_commerce_settings(
  p_property_id uuid,
  p_qr_ordering_enabled boolean DEFAULT true,
  p_online_ordering_enabled boolean DEFAULT true,
  p_takeaway_enabled boolean DEFAULT true,
  p_delivery_enabled boolean DEFAULT false,
  p_direct_booking_enabled boolean DEFAULT true,
  p_require_customer_mobile boolean DEFAULT false,
  p_allow_guest_checkout boolean DEFAULT true,
  p_minimum_order_amount numeric DEFAULT NULL,
  p_service_charge_enabled boolean DEFAULT false,
  p_public_menu_enabled boolean DEFAULT true
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org uuid := app.current_organization_id();
  v_id uuid;
BEGIN
  INSERT INTO commerce_settings (
    organization_id, property_id,
    qr_ordering_enabled, online_ordering_enabled, takeaway_enabled,
    delivery_enabled, direct_booking_enabled,
    require_customer_mobile, allow_guest_checkout,
    minimum_order_amount, service_charge_enabled, public_menu_enabled
  ) VALUES (
    v_org, p_property_id,
    p_qr_ordering_enabled, p_online_ordering_enabled, p_takeaway_enabled,
    p_delivery_enabled, p_direct_booking_enabled,
    p_require_customer_mobile, p_allow_guest_checkout,
    p_minimum_order_amount, p_service_charge_enabled, p_public_menu_enabled
  )
  ON CONFLICT (organization_id, property_id) DO UPDATE SET
    qr_ordering_enabled = EXCLUDED.qr_ordering_enabled,
    online_ordering_enabled = EXCLUDED.online_ordering_enabled,
    takeaway_enabled = EXCLUDED.takeaway_enabled,
    delivery_enabled = EXCLUDED.delivery_enabled,
    direct_booking_enabled = EXCLUDED.direct_booking_enabled,
    require_customer_mobile = EXCLUDED.require_customer_mobile,
    allow_guest_checkout = EXCLUDED.allow_guest_checkout,
    minimum_order_amount = EXCLUDED.minimum_order_amount,
    service_charge_enabled = EXCLUDED.service_charge_enabled,
    public_menu_enabled = EXCLUDED.public_menu_enabled,
    updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Update menu item public fields
CREATE OR REPLACE FUNCTION app.update_menu_item_public_fields(
  p_menu_item_id uuid,
  p_is_public boolean DEFAULT NULL,
  p_public_description text DEFAULT NULL,
  p_public_image text DEFAULT NULL,
  p_dietary dietary_type DEFAULT NULL,
  p_allergen_info jsonb DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org uuid := app.current_organization_id();
  v_id uuid;
BEGIN
  UPDATE menu_items
  SET is_public = COALESCE(p_is_public, is_public),
      public_description = COALESCE(p_public_description, public_description),
      public_image = COALESCE(p_public_image, public_image),
      dietary = COALESCE(p_dietary, dietary),
      allergen_info = COALESCE(p_allergen_info, allergen_info)
  WHERE id = p_menu_item_id AND organization_id = v_org
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Update order source channel
CREATE OR REPLACE FUNCTION app.update_order_source_channel(
  p_order_id uuid,
  p_source_channel source_channel
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org uuid := app.current_organization_id();
  v_id uuid;
BEGIN
  UPDATE orders
  SET source_channel = p_source_channel
  WHERE id = p_order_id AND organization_id = v_org
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
