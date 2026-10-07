-- AMRUT NIVAAS · 001 — business hierarchy tables
-- Organization → Property → Outlet → Department.
--
-- Two rules that are easy to get wrong and expensive to fix later:
--  1. Organization and Property are NOT the same thing (§88): one group owns many sites.
--  2. Outlet and Department are NOT the same thing (§90): a department is an ownership
--     centre inside an outlet, and is never a tenancy boundary.
-- Nothing here is ever hard-deleted (§73/§74): lifecycle status only, and every FK is
-- ON DELETE RESTRICT so an accidental cascade cannot destroy operational history (§74).

-- ------------------------------------------------------------------ shared bits

create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- A tenant table's denormalized organization_id must equal its parent's. This is the
-- invariant that makes the RLS predicate `organization_id = current` sound; without it,
-- a copy of the ancestor id could drift and leak a row into another tenant.
create or replace function app.assert_org_chain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected uuid;
begin
  if TG_TABLE_NAME = 'outlets' then
    select parent_org.organization_id into v_expected
      from public.properties parent_org where parent_org.id = new.property_id;
    if v_expected is null then
      raise exception 'NIVAAS_SCOPE_MISMATCH: property % does not exist', new.property_id;
    end if;
    if new.organization_id <> v_expected then
      raise exception 'NIVAAS_SCOPE_MISMATCH: outlet organization does not match its property';
    end if;
  elsif TG_TABLE_NAME = 'departments' then
    select prop.organization_id into v_expected
      from public.properties prop where prop.id = new.property_id;
    if v_expected is null then
      raise exception 'NIVAAS_SCOPE_MISMATCH: property % does not exist', new.property_id;
    end if;
    if new.organization_id <> v_expected then
      raise exception 'NIVAAS_SCOPE_MISMATCH: department organization does not match its property';
    end if;
    -- §14: a department belongs to a property OR to an outlet of that property.
    if new.outlet_id is not null then
      perform 1 from public.outlets o
        where o.id = new.outlet_id and o.property_id = new.property_id;
      if not found then
        raise exception 'NIVAAS_SCOPE_MISMATCH: outlet is not in this property';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- IANA timezone validation cannot live in a CHECK (it reads a catalog view).
create or replace function app.assert_timezone()
returns trigger
language plpgsql
as $$
begin
  if new.timezone is not null and not app.is_valid_timezone(new.timezone) then
    raise exception 'NIVAAS_INVALID_TIMEZONE: %', new.timezone;
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------------ organizations

create table if not exists public.organizations (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (char_length(name) between 2 and 120),
  legal_name      text,
  display_name    text,
  -- Tenant short code used in document numbers (AMR-, BHK-). Unique globally so a pasted
  -- code is never ambiguous across tenants.
  code            text not null unique check (code ~ '^[A-Z0-9][A-Z0-9-]{1,11}$'),
  slug            text not null unique check (app.is_valid_slug(slug)),
  -- §8: an organization may operate several kinds of business, so this is a list of the
  -- formats it uses. The authoritative type of a *site* is properties.property_type.
  business_types  text[] not null default '{}'::text[]
                  check (business_types <@ array[
                    'RESTAURANT','CAFE','HOTEL','LODGE','RESORT','BOUTIQUE_HOTEL','HOSTEL',
                    'CLOUD_KITCHEN','BANQUET','CONVENTION_CENTER','RESTAURANT_HOTEL','OTHER'
                  ]::text[]),
  status          text not null default 'ACTIVE'
                  check (status in ('ACTIVE','SUSPENDED','ARCHIVED')),
  -- Group-level defaults. Every one of these is overridable per property, and tax is
  -- deliberately NOT modelled as a function of country (§69).
  country         text not null check (country ~ '^[A-Z]{2}$'),
  currency        text not null check (app.is_valid_currency(currency)),
  timezone        text not null,
  locale          text not null,
  tax_region      text,
  phone           text,
  email           text,
  website         text,
  logo_url        text,
  -- Demo data must never be mistaken for a customer's (§60).
  is_demo         boolean not null default false,
  version         integer not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid,
  archived_at     timestamptz
);

comment on table public.organizations is
  'The tenant boundary: one legal operating entity, one billing relationship.';
comment on column public.organizations.business_types is
  'Formats the group operates. Not a behaviour switch — property_type is.';

drop trigger if exists organizations_touch on public.organizations;
create trigger organizations_touch before update on public.organizations
  for each row execute function app.touch_updated_at();

drop trigger if exists organizations_timezone on public.organizations;
create trigger organizations_timezone before insert or update on public.organizations
  for each row execute function app.assert_timezone();

create index if not exists organizations_status_idx on public.organizations (status);

-- ---------------------------------------------------------------------- properties

create table if not exists public.properties (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  name             text not null check (char_length(name) between 2 and 120),
  display_name     text,
  -- §11: a human-readable code unique within the organization. Names change; codes do not.
  code             text not null check (code ~ '^[A-Z0-9][A-Z0-9-]{1,19}$'),
  slug             text not null check (app.is_valid_slug(slug)),
  -- HOSTEL is here too: organizations may declare it in business_types, and a taxonomy
  -- the group can claim but a site cannot be created as is a bug waiting for a customer.
  -- The same list is repeated in app.create_property's guard, so scenario 9 in
  -- db/verify/tenant_isolation.sql creates one HOSTEL property through the door: if the
  -- two lists ever drift, that one assertion fails.
  property_type    text not null check (property_type in (
                     'HOTEL','LODGE','RESORT','HOSTEL','RESTAURANT','CAFE','CLOUD_KITCHEN',
                     'BANQUET','CONVENTION_CENTER','RESTAURANT_HOTEL','OTHER')),
  status           text not null default 'ACTIVE'
                   check (status in ('ACTIVE','INACTIVE','ARCHIVED')),
  -- §72 structured address; no assumption that every country shares one format.
  address_line1    text,
  address_line2    text,
  city             text,
  state            text,
  postal_code      text,
  country          text not null check (country ~ '^[A-Z]{2}$'),
  phone            text,
  email            text,
  -- §10-11 and D-11: the site, not the group, decides what time and money mean.
  timezone         text not null,
  currency         text not null check (app.is_valid_currency(currency)),
  locale           text not null,
  -- A hotel night audit and a restaurant day close are different clock events (§11).
  business_day_start time not null default '04:00'::time,
  tax_profile_id   uuid,  -- populated by the tax module; intentionally not a constant
  version          integer not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  archived_at      timestamptz,
  unique (organization_id, code),
  unique (organization_id, slug)
);

comment on table public.properties is
  'One physical site. Carries timezone/currency/locale/business day because a group can span two of each.';

create index if not exists properties_org_idx on public.properties (organization_id);
create index if not exists properties_org_status_idx on public.properties (organization_id, status);

drop trigger if exists properties_touch on public.properties;
create trigger properties_touch before update on public.properties
  for each row execute function app.touch_updated_at();

drop trigger if exists properties_timezone on public.properties;
create trigger properties_timezone before insert or update on public.properties
  for each row execute function app.assert_timezone();

-- ----------------------------------------------------------------------- outlets

create table if not exists public.outlets (
  id               uuid primary key default gen_random_uuid(),
  -- Copied from the parent on purpose: the RLS predicate is one column, so a forgotten
  -- deeper join cannot widen a tenant's view.
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  property_id      uuid not null references public.properties(id) on delete restrict,
  name             text not null check (char_length(name) between 2 and 120),
  code             text not null check (code ~ '^[A-Z0-9][A-Z0-9-]{1,19}$'),
  slug             text not null check (app.is_valid_slug(slug)),
  outlet_type      text not null check (outlet_type in (
                     'RESTAURANT','CAFE','BAR','ROOM_SERVICE','BANQUET','SPA','RETAIL',
                     'CLOUD_KITCHEN','OTHER')),
  status           text not null default 'ACTIVE'
                   check (status in ('ACTIVE','INACTIVE','ARCHIVED')),
  -- Genuinely flexible metadata: day-part hours differ per outlet and per country.
  business_hours   jsonb not null default '{}'::jsonb,
  phone            text,
  email            text,
  version          integer not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  archived_at      timestamptz,
  unique (property_id, code),
  unique (property_id, slug)
);

comment on column public.outlets.organization_id is
  'Denormalized tenant predicate, enforced equal to the parent by app.assert_org_chain().';

create index if not exists outlets_org_idx on public.outlets (organization_id);
create index if not exists outlets_property_idx on public.outlets (property_id);

drop trigger if exists outlets_touch on public.outlets;
create trigger outlets_touch before update on public.outlets
  for each row execute function app.touch_updated_at();

drop trigger if exists outlets_chain on public.outlets;
create trigger outlets_chain before insert or update on public.outlets
  for each row execute function app.assert_org_chain();

-- ------------------------------------------------------------------- departments

-- §14: belongs to a property OR to one outlet of that property. Never force an outlet.
create table if not exists public.departments (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  property_id      uuid not null references public.properties(id) on delete restrict,
  outlet_id        uuid references public.outlets(id) on delete restrict,
  name             text not null check (char_length(name) between 2 and 120),
  code             text not null check (code ~ '^[A-Z0-9][A-Z0-9-]{1,19}$'),
  slug             text not null check (app.is_valid_slug(slug)),
  status           text not null default 'ACTIVE'
                   check (status in ('ACTIVE','INACTIVE','ARCHIVED')),
  version          integer not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid
);

create index if not exists departments_org_idx on public.departments (organization_id);
create index if not exists departments_property_idx on public.departments (property_id);
create index if not exists departments_outlet_idx on public.departments (outlet_id);
-- Code uniqueness is scoped by the level the department actually sits at.
create unique index if not exists departments_property_code_key
  on public.departments (property_id, code) where outlet_id is null;
create unique index if not exists departments_outlet_code_key
  on public.departments (outlet_id, code) where outlet_id is not null;
create unique index if not exists departments_slug_key
  on public.departments (property_id, slug);

drop trigger if exists departments_touch on public.departments;
create trigger departments_touch before update on public.departments
  for each row execute function app.touch_updated_at();

drop trigger if exists departments_chain on public.departments;
create trigger departments_chain before insert or update on public.departments
  for each row execute function app.assert_org_chain();
