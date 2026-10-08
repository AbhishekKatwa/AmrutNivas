-- AMRUT NIVAAS · 023 — inventory foundation (Prompt #06 §4-§17)
--
-- The inventory domain's master data: units of measure, categories, inventory items, and
-- inventory locations. Every later migration (stock ledger, recipes, consumption) builds
-- on these tables.
--
-- Design invariants (same as 014-021):
--   - Money is NUMERIC with scale check, never floats.
--   - Every table has RLS, chain guards, property-scoped reads.
--   - Doors are security-definer, in `public`, with `set search_path = ''`.
--   - Optimistic locking via version + p_expected_version on updates.
--   - Audit on every mutation via app.audit().
--   - Archive-never-delete: status transitions to ARCHIVED, rows stay.
--
-- Key distinctions (§155-§156):
--   - Inventory Item = what the business owns/uses (Rice, Oil, Chicken)
--   - Stock = how much exists at a location (derived from ledger)
--   - Stock Ledger = why the quantity changed (immutable movements)
--   - Recipe = how a menu item is produced from ingredients
--   - Consumption = why ingredients left stock (linked to orders)
--   - Cost = what the inventory is worth (weighted average)
--
-- This file creates the ITEM and LOCATION master data. Stock and ledger arrive in 024.

set local search_path = '';

-- =================================================================== units of measure

-- A unit of measure is an organization-level master. KG, LITRE, PIECE, BOX, etc.
-- Each item declares its base unit; conversions between units are explicit rows.
-- The spec (§13-§16) demands that units are not arbitrary strings and that conversions
-- are deterministic. A unit's code is unique per organization.
create table if not exists public.units_of_measure (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  name                 text not null,
  code                 text not null,
  description          text,
  status               text not null default 'ACTIVE'
                       constraint units_of_measure_status_ok check (status in ('ACTIVE','ARCHIVED')),
  version              integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid,
  constraint units_of_measure_name_not_blank check (btrim(name) <> ''),
  constraint units_of_measure_code_not_blank check (btrim(code) <> '')
);

comment on table public.units_of_measure is
  'Units of measure (KG, LITRE, PIECE, etc.). Organization-scoped master data.';

drop index if exists public.units_of_measure_code_org_idx;
create unique index units_of_measure_code_org_idx
  on public.units_of_measure (organization_id, lower(code))
  where status = 'ACTIVE';

create index if not exists units_of_measure_org_idx
  on public.units_of_measure (organization_id);

drop trigger if exists units_of_measure_touch on public.units_of_measure;
create trigger units_of_measure_touch before update on public.units_of_measure
  for each row execute function app.touch_updated_at();

-- RLS: organization-scoped. Members of the org can read; no DML except through doors.
drop policy if exists units_of_measure_read on public.units_of_measure;
create policy units_of_measure_read on public.units_of_measure
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists units_of_measure_no_write on public.units_of_measure;
create policy units_of_measure_no_write on public.units_of_measure
  for all to authenticated
  using (false);

-- =================================================================== unit conversions

-- A conversion says "1 from_unit_id = factor to_unit_id". Example: 1 BAG = 50 KG.
-- Conversions are organization-scoped and deterministic (§14-§16). The system enforces
-- that a conversion's from and to units are different, and that the factor is positive.
-- A reverse conversion (KG → BAG) is a separate row with factor = 1/50.
create table if not exists public.unit_conversions (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  from_unit_id         uuid not null references public.units_of_measure(id) on delete restrict,
  to_unit_id           uuid not null references public.units_of_measure(id) on delete restrict,
  factor               numeric not null,
  status               text not null default 'ACTIVE'
                       constraint unit_conversions_status_ok check (status in ('ACTIVE','ARCHIVED')),
  version              integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid,
  constraint unit_conversions_different_units check (from_unit_id <> to_unit_id),
  constraint unit_conversions_positive_factor check (factor > 0)
);

comment on table public.unit_conversions is
  'Unit conversions: 1 from_unit = factor to_unit. Organization-scoped.';

-- One active conversion per (from, to) pair per org.
drop index if exists public.unit_conversions_pair_org_idx;
create unique index unit_conversions_pair_org_idx
  on public.unit_conversions (organization_id, from_unit_id, to_unit_id)
  where status = 'ACTIVE';

create index if not exists unit_conversions_org_idx
  on public.unit_conversions (organization_id);

drop trigger if exists unit_conversions_touch on public.unit_conversions;
create trigger unit_conversions_touch before update on public.unit_conversions
  for each row execute function app.touch_updated_at();

drop policy if exists unit_conversions_read on public.unit_conversions;
create policy unit_conversions_read on public.unit_conversions
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists unit_conversions_no_write on public.unit_conversions;
create policy unit_conversions_no_write on public.unit_conversions
  for all to authenticated
  using (false);

-- =================================================================== inventory categories

-- Categories organize items (Grains, Dairy, Meat, Vegetables, etc.). They are
-- organizational, not accounting classifications (§11). An item's category is optional.
create table if not exists public.inventory_categories (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  name                 text not null,
  code                 text not null,
  description          text,
  display_order        integer not null default 0,
  status               text not null default 'ACTIVE'
                       constraint inventory_categories_status_ok check (status in ('ACTIVE','ARCHIVED')),
  version              integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid,
  constraint inventory_categories_name_not_blank check (btrim(name) <> ''),
  constraint inventory_categories_code_not_blank check (btrim(code) <> '')
);

comment on table public.inventory_categories is
  'Inventory categories (Grains, Dairy, Meat, etc.). Organization-scoped.';

drop index if exists public.inventory_categories_code_org_idx;
create unique index inventory_categories_code_org_idx
  on public.inventory_categories (organization_id, lower(code))
  where status = 'ACTIVE';

create index if not exists inventory_categories_org_idx
  on public.inventory_categories (organization_id);

drop trigger if exists inventory_categories_touch on public.inventory_categories;
create trigger inventory_categories_touch before update on public.inventory_categories
  for each row execute function app.touch_updated_at();

drop policy if exists inventory_categories_read on public.inventory_categories;
create policy inventory_categories_read on public.inventory_categories
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists inventory_categories_no_write on public.inventory_categories;
create policy inventory_categories_no_write on public.inventory_categories
  for all to authenticated
  using (false);

-- =================================================================== inventory items

-- The item master: what the business owns or uses (§8-§12). An inventory item is NOT
-- necessarily a menu item — Rice, Cooking Oil, Cleaning Chemical, Packaging Box are all
-- inventory items. Each item has a base unit (stock is tracked in base units), an item
-- type (RAW_MATERIAL, INGREDIENT, BEVERAGE, PACKAGING, CONSUMABLE, CLEANING, OTHER),
-- and optional flags for batch tracking and expiry tracking.
--
-- Item code is human-friendly (INV-RICE-001) and unique per organization among active rows.
-- The item's status lifecycle is ACTIVE → INACTIVE → ARCHIVED (§117). An archived item
-- cannot receive new stock, but historical references remain readable (§116).
create table if not exists public.inventory_items (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  name                 text not null,
  code                 text not null,
  category_id          uuid references public.inventory_categories(id) on delete set null,
  description          text,
  item_type            text not null
                       constraint inventory_items_type_ok check (item_type in (
                         'RAW_MATERIAL','INGREDIENT','BEVERAGE','PACKAGING',
                         'CONSUMABLE','CLEANING','OTHER'
                       )),
  base_unit_id         uuid not null references public.units_of_measure(id) on delete restrict,
  status               text not null default 'ACTIVE'
                       constraint inventory_items_status_ok check (status in ('ACTIVE','INACTIVE','ARCHIVED')),
  track_batch          boolean not null default false,
  track_expiry         boolean not null default false,
  reorder_level        numeric,
  reorder_quantity     numeric,
  attributes           jsonb not null default '{}'::jsonb,
  version              integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid,
  constraint inventory_items_name_not_blank check (btrim(name) <> ''),
  constraint inventory_items_code_not_blank check (btrim(code) <> ''),
  constraint inventory_items_reorder_level_positive check (reorder_level is null or reorder_level >= 0),
  constraint inventory_items_reorder_qty_positive check (reorder_quantity is null or reorder_quantity > 0)
);

comment on table public.inventory_items is
  'Inventory item master: what the business owns/uses. Organization-scoped.';

drop index if exists public.inventory_items_code_org_idx;
create unique index inventory_items_code_org_idx
  on public.inventory_items (organization_id, lower(code))
  where status in ('ACTIVE', 'INACTIVE');

create index if not exists inventory_items_org_idx
  on public.inventory_items (organization_id);

create index if not exists inventory_items_category_idx
  on public.inventory_items (category_id);

create index if not exists inventory_items_type_idx
  on public.inventory_items (item_type);

drop trigger if exists inventory_items_touch on public.inventory_items;
create trigger inventory_items_touch before update on public.inventory_items
  for each row execute function app.touch_updated_at();

drop policy if exists inventory_items_read on public.inventory_items;
create policy inventory_items_read on public.inventory_items
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists inventory_items_no_write on public.inventory_items;
create policy inventory_items_no_write on public.inventory_items
  for all to authenticated
  using (false);

-- =================================================================== inventory locations

-- An inventory location is a physical place where stock is held (§6-§7). Examples:
-- MAIN_STORE, KITCHEN_STORE, BAR_STORE, COLD_STORAGE, FREEZER, DRY_STORE. Stock belongs
-- to a specific location — "Maize = 5,000 kg" is incomplete; "Main Store: Maize = 5,000 kg"
-- is the truth (§7).
--
-- Locations are property-scoped (§5): a hospitality group may have Property A with
-- Main Store + Restaurant Store + Bar Store, and Property B with Main Store + Restaurant Store.
-- A location may optionally be linked to an outlet (for restaurant-specific stores).
--
-- Location type is extensible (§6): STORE, KITCHEN, BAR, COLD_STORAGE, FREEZER, OTHER.
-- The status lifecycle is ACTIVE → ARCHIVED. A location cannot be archived if it has
-- unresolved operational stock unless the system explicitly transfers remaining stock (§118).
create table if not exists public.inventory_locations (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  property_id          uuid not null references public.properties(id) on delete restrict,
  outlet_id            uuid references public.outlets(id) on delete set null,
  name                 text not null,
  code                 text not null,
  location_type        text not null
                       constraint inventory_locations_type_ok check (location_type in (
                         'STORE','KITCHEN','BAR','COLD_STORAGE','FREEZER','OTHER'
                       )),
  description          text,
  status               text not null default 'ACTIVE'
                       constraint inventory_locations_status_ok check (status in ('ACTIVE','ARCHIVED')),
  version              integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid,
  constraint inventory_locations_name_not_blank check (btrim(name) <> ''),
  constraint inventory_locations_code_not_blank check (btrim(code) <> '')
);

comment on table public.inventory_locations is
  'Inventory locations: physical places where stock is held. Property-scoped.';

drop index if exists public.inventory_locations_code_prop_idx;
create unique index inventory_locations_code_prop_idx
  on public.inventory_locations (organization_id, property_id, lower(code))
  where status = 'ACTIVE';

create index if not exists inventory_locations_prop_idx
  on public.inventory_locations (property_id);

create index if not exists inventory_locations_outlet_idx
  on public.inventory_locations (outlet_id);

-- Chain guard: a location's tenant scope must match its property's.
create or replace function app.assert_location_chain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org  uuid;
  v_prop uuid;
begin
  select p.organization_id, p.id into v_org, v_prop
    from public.properties p where p.id = new.property_id;

  if v_prop is null then
    raise exception 'NIVAAS_SCOPE_MISMATCH: location % points at no property', new.id;
  end if;

  if new.organization_id <> v_org then
    raise exception 'NIVAAS_SCOPE_MISMATCH: a location cannot sit outside its property''s org';
  end if;

  -- An outlet, when set, must belong to the same property.
  if new.outlet_id is not null then
    perform 1 from public.outlets o
      where o.id = new.outlet_id and o.property_id = new.property_id;
    if not found then
      raise exception 'NIVAAS_SCOPE_MISMATCH: outlet is not in this property';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists inventory_locations_chain on public.inventory_locations;
create trigger inventory_locations_chain before insert or update on public.inventory_locations
  for each row execute function app.assert_location_chain();

drop trigger if exists inventory_locations_touch on public.inventory_locations;
create trigger inventory_locations_touch before update on public.inventory_locations
  for each row execute function app.touch_updated_at();

drop policy if exists inventory_locations_read on public.inventory_locations;
create policy inventory_locations_read on public.inventory_locations
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists inventory_locations_no_write on public.inventory_locations;
create policy inventory_locations_no_write on public.inventory_locations
  for all to authenticated
  using (false);

-- =================================================================== doors

-- Chain guard helper for items: category, when set, must belong to the same org.
create or replace function app.assert_item_chain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.category_id is not null then
    perform 1 from public.inventory_categories c
      where c.id = new.category_id and c.organization_id = new.organization_id;
    if not found then
      raise exception 'NIVAAS_SCOPE_MISMATCH: category is not in this organization';
    end if;
  end if;

  if new.base_unit_id is not null then
    perform 1 from public.units_of_measure u
      where u.id = new.base_unit_id and u.organization_id = new.organization_id;
    if not found then
      raise exception 'NIVAAS_SCOPE_MISMATCH: base unit is not in this organization';
    end if;
  end if;

  return new;
end;
$$;

-- Chain guard helper for conversions: both units must belong to the same org.
create or replace function app.assert_conversion_chain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.units_of_measure u
    where u.id = new.from_unit_id and u.organization_id = new.organization_id;
  if not found then
    raise exception 'NIVAAS_SCOPE_MISMATCH: from_unit is not in this organization';
  end if;

  perform 1 from public.units_of_measure u
    where u.id = new.to_unit_id and u.organization_id = new.organization_id;
  if not found then
    raise exception 'NIVAAS_SCOPE_MISMATCH: to_unit is not in this organization';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------- create_unit
create or replace function public.create_unit(
  p_organization uuid,
  p_name text,
  p_code text,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.current_user_id();
  v_row public.units_of_measure%rowtype;
begin
  if not app.member_of(v_user, p_organization) then
    raise exception 'NIVAAS_NOT_FOUND';
  end if;
  if not app.has_permission(v_user, p_organization, 'item.create') then
    raise exception 'NIVAAS_FORBIDDEN';
  end if;

  insert into public.units_of_measure (organization_id, name, code, description, created_by)
  values (p_organization, p_name, p_code, p_description, v_user)
  returning * into v_row;

  perform app.audit('UNIT_CREATED', v_row.id, v_user, p_organization,
    jsonb_build_object('name', v_row.name, 'code', v_row.code), null);

  return to_jsonb(v_row);
end;
$$;

-- ---------------------------------------------------------------- update_unit
create or replace function public.update_unit(
  p_unit uuid,
  p_name text default null,
  p_code text default null,
  p_description text default null,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.current_user_id();
  v_row public.units_of_measure%rowtype;
  v_before jsonb;
begin
  select * into v_row from public.units_of_measure where id = p_unit;
  if v_row.id is null then
    raise exception 'NIVAAS_NOT_FOUND';
  end if;
  if not app.member_of(v_user, v_row.organization_id) then
    raise exception 'NIVAAS_NOT_FOUND';
  end if;
  if not app.has_permission(v_user, v_row.organization_id, 'item.edit') then
    raise exception 'NIVAAS_FORBIDDEN';
  end if;
  if p_expected_version is not null and v_row.version <> p_expected_version then
    raise exception 'NIVAAS_CONFLICT';
  end if;

  v_before := to_jsonb(v_row);

  update public.units_of_measure
  set name = coalesce(p_name, name),
      code = coalesce(p_code, code),
      description = coalesce(p_description, description),
      version = version + 1
  where id = p_unit
  returning * into v_row;

  perform app.audit('UNIT_UPDATED', v_row.id, v_user, v_row.organization_id,
    to_jsonb(v_row), v_before);

  return to_jsonb(v_row);
end;
$$;

-- ---------------------------------------------------------------- archive_unit
create or replace function public.archive_unit(p_unit uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.current_user_id();
  v_row public.units_of_measure%rowtype;
begin
  select * into v_row from public.units_of_measure where id = p_unit;
  if v_row.id is null then
    raise exception 'NIVAAS_NOT_FOUND';
  end if;
  if not app.member_of(v_user, v_row.organization_id) then
    raise exception 'NIVAAS_NOT_FOUND';
  end if;
  if not app.has_permission(v_user, v_row.organization_id, 'item.edit') then
    raise exception 'NIVAAS_FORBIDDEN';
  end if;

  update public.units_of_measure
  set status = 'ARCHIVED', version = version + 1
  where id = p_unit
  returning * into v_row;

  perform app.audit('UNIT_ARCHIVED', v_row.id, v_user, v_row.organization_id,
    to_jsonb(v_row), null);

  return to_jsonb(v_row);
end;
$$;

-- ---------------------------------------------------------------- create_unit_conversion
create or replace function public.create_unit_conversion(
  p_organization uuid,
  p_from_unit uuid,
  p_to_unit uuid,
  p_factor numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.current_user_id();
  v_row public.unit_conversions%rowtype;
begin
  if not app.member_of(v_user, p_organization) then
    raise exception 'NIVAAS_NOT_FOUND';
  end if;
  if not app.has_permission(v_user, p_organization, 'item.create') then
    raise exception 'NIVAAS_FORBIDDEN';
  end if;

  insert into public.unit_conversions (organization_id, from_unit_id, to_unit_id, factor, created_by)
  values (p_organization, p_from_unit, p_to_unit, p_factor, v_user)
  returning * into v_row;

  perform app.audit('UNIT_CONVERSION_CREATED', v_row.id, v_user, p_organization,
    jsonb_build_object('from_unit_id', v_row.from_unit_id, 'to_unit_id', v_row.to_unit_id, 'factor', v_row.factor), null);

  return to_jsonb(v_row);
end;
$$;

-- ---------------------------------------------------------------- create_inventory_category
create or replace function public.create_inventory_category(
  p_organization uuid,
  p_name text,
  p_code text,
  p_description text default null,
  p_display_order integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.current_user_id();
  v_row public.inventory_categories%rowtype;
begin
  if not app.member_of(v_user, p_organization) then
    raise exception 'NIVAAS_NOT_FOUND';
  end if;
  if not app.has_permission(v_user, p_organization, 'item.create') then
    raise exception 'NIVAAS_FORBIDDEN';
  end if;

  insert into public.inventory_categories (organization_id, name, code, description, display_order, created_by)
  values (p_organization, p_name, p_code, p_description, p_display_order, v_user)
  returning * into v_row;

  perform app.audit('CATEGORY_CREATED', v_row.id, v_user, p_organization,
    jsonb_build_object('name', v_row.name, 'code', v_row.code), null);

  return to_jsonb(v_row);
end;
$$;

-- ---------------------------------------------------------------- update_inventory_category
create or replace function public.update_inventory_category(
  p_category uuid,
  p_name text default null,
  p_code text default null,
  p_description text default null,
  p_display_order integer default null,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.current_user_id();
  v_row public.inventory_categories%rowtype;
  v_before jsonb;
begin
  select * into v_row from public.inventory_categories where id = p_category;
  if v_row.id is null then
    raise exception 'NIVAAS_NOT_FOUND';
  end if;
  if not app.member_of(v_user, v_row.organization_id) then
    raise exception 'NIVAAS_NOT_FOUND';
  end if;
  if not app.has_permission(v_user, v_row.organization_id, 'item.edit') then
    raise exception 'NIVAAS_FORBIDDEN';
  end if;
  if p_expected_version is not null and v_row.version <> p_expected_version then
    raise exception 'NIVAAS_CONFLICT';
  end if;

  v_before := to_jsonb(v_row);

  update public.inventory_categories
  set name = coalesce(p_name, name),
      code = coalesce(p_code, code),
      description = coalesce(p_description, description),
      display_order = coalesce(p_display_order, display_order),
      version = version + 1
  where id = p_category
  returning * into v_row;

  perform app.audit('CATEGORY_UPDATED', v_row.id, v_user, v_row.organization_id,
    to_jsonb(v_row), v_before);

  return to_jsonb(v_row);
end;
$$;

-- ---------------------------------------------------------------- archive_inventory_category
create or replace function public.archive_inventory_category(p_category uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.current_user_id();
  v_row public.inventory_categories%rowtype;
begin
  select * into v_row from public.inventory_categories where id = p_category;
  if v_row.id is null then
    raise exception 'NIVAAS_NOT_FOUND';
  end if;
  if not app.member_of(v_user, v_row.organization_id) then
    raise exception 'NIVAAS_NOT_FOUND';
  end if;
  if not app.has_permission(v_user, v_row.organization_id, 'item.edit') then
    raise exception 'NIVAAS_FORBIDDEN';
  end if;

  update public.inventory_categories
  set status = 'ARCHIVED', version = version + 1
  where id = p_category
  returning * into v_row;

  perform app.audit('CATEGORY_ARCHIVED', v_row.id, v_user, v_row.organization_id,
    to_jsonb(v_row), null);

  return to_jsonb(v_row);
end;
$$;

-- ---------------------------------------------------------------- create_inventory_item
create or replace function public.create_inventory_item(
  p_organization uuid,
  p_name text,
  p_code text,
  p_item_type text,
  p_base_unit_id uuid,
  p_category_id uuid default null,
  p_description text default null,
  p_track_batch boolean default false,
  p_track_expiry boolean default false,
  p_reorder_level numeric default null,
  p_reorder_quantity numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.current_user_id();
  v_row public.inventory_items%rowtype;
begin
  if not app.member_of(v_user, p_organization) then
    raise exception 'NIVAAS_NOT_FOUND';
  end if;
  if not app.has_permission(v_user, p_organization, 'item.create') then
    raise exception 'NIVAAS_FORBIDDEN';
  end if;

  insert into public.inventory_items (
    organization_id, name, code, category_id, description, item_type, base_unit_id,
    track_batch, track_expiry, reorder_level, reorder_quantity, created_by
  )
  values (
    p_organization, p_name, p_code, p_category_id, p_description, p_item_type, p_base_unit_id,
    p_track_batch, p_track_expiry, p_reorder_level, p_reorder_quantity, v_user
  )
  returning * into v_row;

  perform app.audit('INVENTORY_ITEM_CREATED', v_row.id, v_user, p_organization,
    jsonb_build_object('name', v_row.name, 'code', v_row.code, 'item_type', v_row.item_type), null);

  return to_jsonb(v_row);
end;
$$;

-- ---------------------------------------------------------------- update_inventory_item
create or replace function public.update_inventory_item(
  p_item uuid,
  p_name text default null,
  p_code text default null,
  p_category_id uuid default null,
  p_description text default null,
  p_item_type text default null,
  p_base_unit_id uuid default null,
  p_track_batch boolean default null,
  p_track_expiry boolean default null,
  p_reorder_level numeric default null,
  p_reorder_quantity numeric default null,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.current_user_id();
  v_row public.inventory_items%rowtype;
  v_before jsonb;
begin
  select * into v_row from public.inventory_items where id = p_item;
  if v_row.id is null then
    raise exception 'NIVAAS_NOT_FOUND';
  end if;
  if not app.member_of(v_user, v_row.organization_id) then
    raise exception 'NIVAAS_NOT_FOUND';
  end if;
  if not app.has_permission(v_user, v_row.organization_id, 'item.edit') then
    raise exception 'NIVAAS_FORBIDDEN';
  end if;
  if p_expected_version is not null and v_row.version <> p_expected_version then
    raise exception 'NIVAAS_CONFLICT';
  end if;

  v_before := to_jsonb(v_row);

  update public.inventory_items
  set name = coalesce(p_name, name),
      code = coalesce(p_code, code),
      category_id = coalesce(p_category_id, category_id),
      description = coalesce(p_description, description),
      item_type = coalesce(p_item_type, item_type),
      base_unit_id = coalesce(p_base_unit_id, base_unit_id),
      track_batch = coalesce(p_track_batch, track_batch),
      track_expiry = coalesce(p_track_expiry, track_expiry),
      reorder_level = coalesce(p_reorder_level, reorder_level),
      reorder_quantity = coalesce(p_reorder_quantity, reorder_quantity),
      version = version + 1
  where id = p_item
  returning * into v_row;

  perform app.audit('INVENTORY_ITEM_UPDATED', v_row.id, v_user, v_row.organization_id,
    to_jsonb(v_row), v_before);

  return to_jsonb(v_row);
end;
$$;

-- ---------------------------------------------------------------- set_inventory_item_status
create or replace function public.set_inventory_item_status(
  p_item uuid,
  p_status text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.current_user_id();
  v_row public.inventory_items%rowtype;
  v_before jsonb;
begin
  select * into v_row from public.inventory_items where id = p_item;
  if v_row.id is null then
    raise exception 'NIVAAS_NOT_FOUND';
  end if;
  if not app.member_of(v_user, v_row.organization_id) then
    raise exception 'NIVAAS_NOT_FOUND';
  end if;
  if not app.has_permission(v_user, v_row.organization_id, 'item.archive') then
    raise exception 'NIVAAS_FORBIDDEN';
  end if;
  perform app.require_reason(p_reason);

  v_before := to_jsonb(v_row);

  update public.inventory_items
  set status = p_status, version = version + 1
  where id = p_item
  returning * into v_row;

  perform app.audit('INVENTORY_ITEM_STATUS_CHANGED', v_row.id, v_user, v_row.organization_id,
    jsonb_build_object('status', v_row.status, 'reason', p_reason), v_before);

  return to_jsonb(v_row);
end;
$$;

-- ---------------------------------------------------------------- create_inventory_location
create or replace function public.create_inventory_location(
  p_organization uuid,
  p_property uuid,
  p_name text,
  p_code text,
  p_location_type text,
  p_outlet_id uuid default null,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.current_user_id();
  v_row public.inventory_locations%rowtype;
begin
  if not app.member_of(v_user, p_organization) then
    raise exception 'NIVAAS_NOT_FOUND';
  end if;
  if not app.has_permission(v_user, p_organization, 'location.create') then
    raise exception 'NIVAAS_FORBIDDEN';
  end if;
  -- Property membership is proved by the chain guard trigger.

  insert into public.inventory_locations (
    organization_id, property_id, outlet_id, name, code, location_type, description, created_by
  )
  values (p_organization, p_property, p_outlet_id, p_name, p_code, p_location_type, p_description, v_user)
  returning * into v_row;

  perform app.audit('LOCATION_CREATED', v_row.id, v_user, p_organization,
    jsonb_build_object('name', v_row.name, 'code', v_row.code, 'property_id', v_row.property_id), null);

  return to_jsonb(v_row);
end;
$$;

-- ---------------------------------------------------------------- update_inventory_location
create or replace function public.update_inventory_location(
  p_location uuid,
  p_name text default null,
  p_code text default null,
  p_location_type text default null,
  p_description text default null,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.current_user_id();
  v_row public.inventory_locations%rowtype;
  v_before jsonb;
begin
  select * into v_row from public.inventory_locations where id = p_location;
  if v_row.id is null then
    raise exception 'NIVAAS_NOT_FOUND';
  end if;
  if not app.member_of(v_user, v_row.organization_id) then
    raise exception 'NIVAAS_NOT_FOUND';
  end if;
  if not app.has_permission(v_user, v_row.organization_id, 'location.edit') then
    raise exception 'NIVAAS_FORBIDDEN';
  end if;
  if p_expected_version is not null and v_row.version <> p_expected_version then
    raise exception 'NIVAAS_CONFLICT';
  end if;

  v_before := to_jsonb(v_row);

  update public.inventory_locations
  set name = coalesce(p_name, name),
      code = coalesce(p_code, code),
      location_type = coalesce(p_location_type, location_type),
      description = coalesce(p_description, description),
      version = version + 1
  where id = p_location
  returning * into v_row;

  perform app.audit('LOCATION_UPDATED', v_row.id, v_user, v_row.organization_id,
    to_jsonb(v_row), v_before);

  return to_jsonb(v_row);
end;
$$;

-- ---------------------------------------------------------------- archive_inventory_location
create or replace function public.archive_inventory_location(
  p_location uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.current_user_id();
  v_row public.inventory_locations%rowtype;
  v_stock numeric;
begin
  select * into v_row from public.inventory_locations where id = p_location;
  if v_row.id is null then
    raise exception 'NIVAAS_NOT_FOUND';
  end if;
  if not app.member_of(v_user, v_row.organization_id) then
    raise exception 'NIVAAS_NOT_FOUND';
  end if;
  if not app.has_permission(v_user, v_row.organization_id, 'location.archive') then
    raise exception 'NIVAAS_FORBIDDEN';
  end if;
  perform app.require_reason(p_reason);

  -- Refuse to archive if there is operational stock (§118). The stock_ledger table
  -- does not exist yet (024), so this check is a placeholder that will be completed
  -- when the ledger lands. For now, the archive is allowed.
  -- TODO (024): check stock_balance for non-zero quantity at this location.

  update public.inventory_locations
  set status = 'ARCHIVED', version = version + 1
  where id = p_location
  returning * into v_row;

  perform app.audit('LOCATION_ARCHIVED', v_row.id, v_user, v_row.organization_id,
    jsonb_build_object('reason', p_reason), to_jsonb(v_row));

  return to_jsonb(v_row);
end;
$$;

-- =================================================================== convert_unit helper

-- A pure function: given a quantity in from_unit, return the equivalent in to_unit.
-- If from_unit = to_unit, returns the quantity unchanged. If a direct conversion exists,
-- uses it. Otherwise raises NIVAAS_NO_CONVERSION. This is used by recipes and stock
-- movements to ensure unit consistency (§14-§16, §96).
create or replace function app.convert_unit(
  p_organization uuid,
  p_from_unit uuid,
  p_to_unit uuid,
  p_quantity numeric
)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_factor numeric;
begin
  if p_from_unit = p_to_unit then
    return p_quantity;
  end if;

  select factor into v_factor
  from public.unit_conversions
  where organization_id = p_organization
    and from_unit_id = p_from_unit
    and to_unit_id = p_to_unit
    and status = 'ACTIVE';

  if v_factor is null then
    raise exception 'NIVAAS_NO_CONVERSION: no conversion from % to %', p_from_unit, p_to_unit;
  end if;

  return p_quantity * v_factor;
end;
$$;
