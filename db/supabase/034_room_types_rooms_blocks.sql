-- AMRUT NIVAAS · 034 — room types, rooms & room blocks (Prompt #08 §5-§10, §23)
--
-- Room inventory: room types, individual rooms, bed configurations, amenities,
-- and room blocks. All property-scoped within an organization.
--
-- Key invariants:
--   - Room types and rooms belong to a property (and organization for RLS).
--   - Room number is unique within a property.
--   - Operational status (can we sell it?) is separate from housekeeping status (is it clean?).
--   - Room blocks affect availability and must be tracked.
--   - Archive-never-delete for room types with reservation history.

set local search_path = '';

-- =================================================================== amenities

-- Reusable amenity definitions. Organization-scoped so each org can customize.
create table if not exists public.amenities (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  code                 text not null,
  name                 text not null,
  description          text,
  icon                 text,
  category             text not null default 'ROOM',
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint amenities_code_not_blank check (btrim(code) <> ''),
  constraint amenities_name_not_blank check (btrim(name) <> ''),
  constraint amenities_category_ok check (category in ('ROOM', 'BATHROOM', 'TECH', 'FOOD', 'SERVICE', 'OTHER'))
);

comment on table public.amenities is
  'Reusable amenity definitions. Organization-scoped.';

drop index if exists public.amenities_code_org_idx;
create unique index amenities_code_org_idx
  on public.amenities (organization_id, lower(code));

create index if not exists amenities_org_idx
  on public.amenities (organization_id);

drop trigger if exists amenities_touch on public.amenities;
create trigger amenities_touch before update on public.amenities
  for each row execute function app.touch_updated_at();

drop policy if exists amenities_read on public.amenities;
create policy amenities_read on public.amenities
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists amenities_no_write on public.amenities;
create policy amenities_no_write on public.amenities
  for all to authenticated
  using (false);

-- =================================================================== room types

create table if not exists public.room_types (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  property_id          uuid not null references public.properties(id) on delete restrict,
  code                 text not null,
  name                 text not null,
  description          text,
  status               text not null default 'ACTIVE',
  max_occupancy        integer not null default 2,
  base_occupancy       integer not null default 2,
  bed_configuration    jsonb not null default '[]'::jsonb,
  room_size_sqft       numeric,
  default_rate_plan_id uuid,
  sort_order           integer not null default 0,
  notes                text,
  version              integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  archived_at          timestamptz,
  created_by           uuid,

  constraint room_types_code_not_blank check (btrim(code) <> ''),
  constraint room_types_name_not_blank check (btrim(name) <> ''),
  constraint room_types_status_ok check (status in ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  constraint room_types_max_occupancy_positive check (max_occupancy > 0),
  constraint room_types_base_occupancy_positive check (base_occupancy > 0),
  constraint room_types_base_lte_max check (base_occupancy <= max_occupancy),
  constraint room_types_size_positive check (room_size_sqft is null or room_size_sqft > 0)
);

comment on table public.room_types is
  'Room type master. Property-scoped. Archive-never-delete.';

-- bed_configuration JSONB structure:
-- [{"bed_type": "KING", "count": 1}, {"bed_type": "SOFA_BED", "count": 1}]
-- bed_type values: KING, QUEEN, DOUBLE, SINGLE, TWIN, BUNK, SOFA_BED, OTHER

drop index if exists public.room_types_code_property_idx;
create unique index room_types_code_property_idx
  on public.room_types (property_id, lower(code))
  where archived_at is null;

create index if not exists room_types_property_idx
  on public.room_types (property_id);

create index if not exists room_types_org_idx
  on public.room_types (organization_id);

drop trigger if exists room_types_touch on public.room_types;
create trigger room_types_touch before update on public.room_types
  for each row execute function app.touch_updated_at();

drop policy if exists room_types_read on public.room_types;
create policy room_types_read on public.room_types
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists room_types_no_write on public.room_types;
create policy room_types_no_write on public.room_types
  for all to authenticated
  using (false);

-- =================================================================== room type amenities

-- Many-to-many: room type ↔ amenity.
create table if not exists public.room_type_amenities (
  room_type_id         uuid not null references public.room_types(id) on delete cascade,
  amenity_id           uuid not null references public.amenities(id) on delete cascade,
  primary key (room_type_id, amenity_id)
);

comment on table public.room_type_amenities is
  'Many-to-many: room type ↔ amenity.';

create index if not exists room_type_amenities_amenity_idx
  on public.room_type_amenities (amenity_id);

drop policy if exists room_type_amenities_read on public.room_type_amenities;
create policy room_type_amenities_read on public.room_type_amenities
  for select to authenticated
  using (room_type_id in (
    select rt.id from public.room_types rt
    where rt.organization_id in (
      select m.organization_id from public.organization_memberships m
      where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
    )
  ));

drop policy if exists room_type_amenities_no_write on public.room_type_amenities;
create policy room_type_amenities_no_write on public.room_type_amenities
  for all to authenticated
  using (false);

-- =================================================================== rooms

create table if not exists public.rooms (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  property_id          uuid not null references public.properties(id) on delete restrict,
  room_type_id         uuid not null references public.room_types(id) on delete restrict,
  room_number          text not null,
  floor                text,
  wing                 text,
  building             text,
  operational_status   text not null default 'ACTIVE',
  housekeeping_status  text not null default 'VACANT_CLEAN',
  notes                text,
  version              integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  archived_at          timestamptz,
  created_by           uuid,

  constraint rooms_number_not_blank check (btrim(room_number) <> ''),
  constraint rooms_operational_status_ok check (operational_status in (
    'ACTIVE', 'OUT_OF_ORDER', 'OUT_OF_SERVICE', 'BLOCKED'
  )),
  constraint rooms_housekeeping_status_ok check (housekeeping_status in (
    'VACANT_CLEAN', 'VACANT_DIRTY', 'OCCUPIED_CLEAN', 'OCCUPIED_DIRTY', 'INSPECTED'
  ))
);

comment on table public.rooms is
  'Individual physical rooms. Property-scoped. Room number unique within property.';

-- Room number unique within property (active rooms only).
drop index if exists public.rooms_number_property_idx;
create unique index rooms_number_property_idx
  on public.rooms (property_id, room_number)
  where archived_at is null;

create index if not exists rooms_property_idx
  on public.rooms (property_id);

create index if not exists rooms_room_type_idx
  on public.rooms (room_type_id);

create index if not exists rooms_org_idx
  on public.rooms (organization_id);

create index if not exists rooms_operational_status_idx
  on public.rooms (property_id, operational_status);

create index if not exists rooms_housekeeping_status_idx
  on public.rooms (property_id, housekeeping_status);

drop trigger if exists rooms_touch on public.rooms;
create trigger rooms_touch before update on public.rooms
  for each row execute function app.touch_updated_at();

drop policy if exists rooms_read on public.rooms;
create policy rooms_read on public.rooms
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists rooms_no_write on public.rooms;
create policy rooms_no_write on public.rooms
  for all to authenticated
  using (false);

-- =================================================================== room blocks

-- Room blocks prevent a room from being sold for a date range.
-- Examples: MAINTENANCE, VIP_HOLD, GROUP_HOLD, OWNER_USE, RENOVATION.
create table if not exists public.room_blocks (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  property_id          uuid not null references public.properties(id) on delete restrict,
  room_id              uuid not null references public.rooms(id) on delete restrict,
  block_type           text not null,
  start_date           date not null,
  end_date             date not null,
  reason               text,
  status               text not null default 'ACTIVE',
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid,

  constraint room_blocks_reason_not_blank check (block_type <> 'OTHER' or btrim(reason) <> ''),
  constraint room_blocks_end_after_start check (end_date >= start_date),
  constraint room_blocks_block_type_ok check (block_type in (
    'MAINTENANCE', 'VIP_HOLD', 'GROUP_HOLD', 'OWNER_USE', 'RENOVATION', 'OTHER'
  )),
  constraint room_blocks_status_ok check (status in ('ACTIVE', 'CANCELLED', 'COMPLETED'))
);

comment on table public.room_blocks is
  'Room blocks prevent a room from being sold. Affects availability.';

create index if not exists room_blocks_room_idx
  on public.room_blocks (room_id);

create index if not exists room_blocks_property_idx
  on public.room_blocks (property_id);

create index if not exists room_blocks_org_idx
  on public.room_blocks (organization_id);

create index if not exists room_blocks_date_range_idx
  on public.room_blocks (property_id, start_date, end_date)
  where status = 'ACTIVE';

drop trigger if exists room_blocks_touch on public.room_blocks;
create trigger room_blocks_touch before update on public.room_blocks
  for each row execute function app.touch_updated_at();

drop policy if exists room_blocks_read on public.room_blocks;
create policy room_blocks_read on public.room_blocks
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists room_blocks_no_write on public.room_blocks;
create policy room_blocks_no_write on public.room_blocks
  for all to authenticated
  using (false);

-- =================================================================== doors

-- create_amenity
create or replace function public.create_amenity(
  p_organization       uuid,
  p_code               text,
  p_name               text,
  p_description        text default null,
  p_icon               text default null,
  p_category           text default 'ROOM'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_row public.amenities%rowtype;
begin
  perform app.require_session(v_user_id, null);
  perform app.evaluate_access(v_user_id, p_organization, null, null, 'room_type.create');

  insert into public.amenities (
    organization_id, code, name, description, icon, category
  ) values (
    p_organization, p_code, p_name, p_description, p_icon, p_category
  ) returning * into v_row;

  perform app.audit(
    'AMENITY_CREATED', 'amenity', v_row.id,
    null, to_jsonb(v_row),
    null, jsonb_build_object('code', v_row.code)
  );

  return to_jsonb(v_row);
end;
$$;

-- update_amenity
create or replace function public.update_amenity(
  p_amenity            uuid,
  p_organization       uuid,
  p_name               text default null,
  p_description        text default null,
  p_icon               text default null,
  p_category           text default null,
  p_is_active          boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_row public.amenities%rowtype;
begin
  perform app.require_session(v_user_id, null);
  perform app.evaluate_access(v_user_id, p_organization, null, null, 'room_type.edit');

  update public.amenities set
    name = coalesce(p_name, name),
    description = coalesce(p_description, description),
    icon = coalesce(p_icon, icon),
    category = coalesce(p_category, category),
    is_active = coalesce(p_is_active, is_active)
  where id = p_amenity and organization_id = p_organization
  returning * into v_row;

  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;

  perform app.audit(
    'AMENITY_UPDATED', 'amenity', v_row.id,
    null, to_jsonb(v_row),
    null, jsonb_build_object('code', v_row.code)
  );

  return to_jsonb(v_row);
end;
$$;

-- create_room_type
create or replace function public.create_room_type(
  p_organization       uuid,
  p_property           uuid,
  p_code               text,
  p_name               text,
  p_description        text default null,
  p_max_occupancy      integer default 2,
  p_base_occupancy     integer default 2,
  p_bed_configuration  jsonb default '[]'::jsonb,
  p_room_size_sqft     numeric default null,
  p_sort_order         integer default 0,
  p_notes              text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_row public.room_types%rowtype;
begin
  perform app.require_session(v_user_id, null);
  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'room_type.create');

  insert into public.room_types (
    organization_id, property_id, code, name, description,
    max_occupancy, base_occupancy, bed_configuration, room_size_sqft,
    sort_order, notes, created_by
  ) values (
    p_organization, p_property, p_code, p_name, p_description,
    p_max_occupancy, p_base_occupancy, p_bed_configuration, p_room_size_sqft,
    p_sort_order, p_notes, v_user_id
  ) returning * into v_row;

  perform app.audit(
    'ROOM_TYPE_CREATED', 'room_type', v_row.id,
    null, to_jsonb(v_row),
    p_property, jsonb_build_object('code', v_row.code, 'name', v_row.name)
  );

  return to_jsonb(v_row);
end;
$$;

-- update_room_type
create or replace function public.update_room_type(
  p_room_type          uuid,
  p_organization       uuid,
  p_property           uuid,
  p_expected_version   integer,
  p_name               text default null,
  p_description        text default null,
  p_max_occupancy      integer default null,
  p_base_occupancy     integer default null,
  p_bed_configuration  jsonb default null,
  p_room_size_sqft     numeric default null,
  p_sort_order         integer default null,
  p_notes              text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.room_types%rowtype;
  v_row public.room_types%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.room_types
  where id = p_room_type and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'room_type.edit');

  update public.room_types set
    name = coalesce(p_name, v_old.name),
    description = coalesce(p_description, v_old.description),
    max_occupancy = coalesce(p_max_occupancy, v_old.max_occupancy),
    base_occupancy = coalesce(p_base_occupancy, v_old.base_occupancy),
    bed_configuration = coalesce(p_bed_configuration, v_old.bed_configuration),
    room_size_sqft = coalesce(p_room_size_sqft, v_old.room_size_sqft),
    sort_order = coalesce(p_sort_order, v_old.sort_order),
    notes = coalesce(p_notes, v_old.notes),
    version = version + 1
  where id = p_room_type returning * into v_row;

  perform app.audit(
    'ROOM_TYPE_UPDATED', 'room_type', v_row.id,
    to_jsonb(v_old), to_jsonb(v_row),
    p_property, jsonb_build_object('version', v_row.version)
  );

  return to_jsonb(v_row);
end;
$$;

-- archive_room_type
create or replace function public.archive_room_type(
  p_room_type          uuid,
  p_organization       uuid,
  p_property           uuid,
  p_expected_version   integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.room_types%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.room_types
  where id = p_room_type and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'room_type.archive');

  update public.room_types set
    status = 'ARCHIVED',
    archived_at = now(),
    version = version + 1
  where id = p_room_type;

  perform app.audit(
    'ROOM_TYPE_ARCHIVED', 'room_type', p_room_type,
    to_jsonb(v_old), null,
    p_property, jsonb_build_object('version', v_old.version + 1)
  );
end;
$$;

-- create_room
create or replace function public.create_room(
  p_organization       uuid,
  p_property           uuid,
  p_room_type          uuid,
  p_room_number        text,
  p_floor              text default null,
  p_wing               text default null,
  p_building           text default null,
  p_notes              text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_row public.rooms%rowtype;
begin
  perform app.require_session(v_user_id, null);
  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'room.create');

  insert into public.rooms (
    organization_id, property_id, room_type_id, room_number,
    floor, wing, building, notes, created_by
  ) values (
    p_organization, p_property, p_room_type, p_room_number,
    p_floor, p_wing, p_building, p_notes, v_user_id
  ) returning * into v_row;

  perform app.audit(
    'ROOM_CREATED', 'room', v_row.id,
    null, to_jsonb(v_row),
    p_property, jsonb_build_object('room_number', v_row.room_number)
  );

  return to_jsonb(v_row);
end;
$$;

-- update_room
create or replace function public.update_room(
  p_room               uuid,
  p_organization       uuid,
  p_property           uuid,
  p_expected_version   integer,
  p_room_type          uuid default null,
  p_floor              text default null,
  p_wing               text default null,
  p_building           text default null,
  p_notes              text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.rooms%rowtype;
  v_row public.rooms%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.rooms
  where id = p_room and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'room.edit');

  update public.rooms set
    room_type_id = coalesce(p_room_type, v_old.room_type_id),
    floor = coalesce(p_floor, v_old.floor),
    wing = coalesce(p_wing, v_old.wing),
    building = coalesce(p_building, v_old.building),
    notes = coalesce(p_notes, v_old.notes),
    version = version + 1
  where id = p_room returning * into v_row;

  perform app.audit(
    'ROOM_UPDATED', 'room', v_row.id,
    to_jsonb(v_old), to_jsonb(v_row),
    p_property, jsonb_build_object('version', v_row.version)
  );

  return to_jsonb(v_row);
end;
$$;

-- set_room_operational_status
create or replace function public.set_room_operational_status(
  p_room               uuid,
  p_organization       uuid,
  p_property           uuid,
  p_status             text,
  p_expected_version   integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.rooms%rowtype;
  v_row public.rooms%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.rooms
  where id = p_room and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'room.edit');

  update public.rooms set
    operational_status = p_status,
    version = version + 1
  where id = p_room returning * into v_row;

  perform app.audit(
    'ROOM_OPERATIONAL_STATUS_CHANGED', 'room', v_row.id,
    to_jsonb(v_old), to_jsonb(v_row),
    p_property, jsonb_build_object('old_status', v_old.operational_status, 'new_status', v_row.operational_status)
  );

  return to_jsonb(v_row);
end;
$$;

-- set_room_housekeeping_status
create or replace function public.set_room_housekeeping_status(
  p_room               uuid,
  p_organization       uuid,
  p_property           uuid,
  p_status             text,
  p_expected_version   integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.rooms%rowtype;
  v_row public.rooms%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.rooms
  where id = p_room and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'housekeeping_status.update');

  update public.rooms set
    housekeeping_status = p_status,
    version = version + 1
  where id = p_room returning * into v_row;

  perform app.audit(
    'ROOM_HOUSEKEEPING_STATUS_CHANGED', 'room', v_row.id,
    to_jsonb(v_old), to_jsonb(v_row),
    p_property, jsonb_build_object('old_status', v_old.housekeeping_status, 'new_status', v_row.housekeeping_status)
  );

  return to_jsonb(v_row);
end;
$$;

-- archive_room
create or replace function public.archive_room(
  p_room               uuid,
  p_organization       uuid,
  p_property           uuid,
  p_expected_version   integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.rooms%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.rooms
  where id = p_room and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'room.archive');

  update public.rooms set
    archived_at = now(),
    version = version + 1
  where id = p_room;

  perform app.audit(
    'ROOM_ARCHIVED', 'room', p_room,
    to_jsonb(v_old), null,
    p_property, jsonb_build_object('version', v_old.version + 1)
  );
end;
$$;

-- create_room_block
create or replace function public.create_room_block(
  p_organization       uuid,
  p_property           uuid,
  p_room               uuid,
  p_block_type         text,
  p_start_date         date,
  p_end_date           date,
  p_reason             text default null,
  p_notes              text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_row public.room_blocks%rowtype;
begin
  perform app.require_session(v_user_id, null);
  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'room.block');

  insert into public.room_blocks (
    organization_id, property_id, room_id, block_type,
    start_date, end_date, reason, notes, created_by
  ) values (
    p_organization, p_property, p_room, p_block_type,
    p_start_date, p_end_date, p_reason, p_notes, v_user_id
  ) returning * into v_row;

  perform app.audit(
    'ROOM_BLOCKED', 'room_block', v_row.id,
    null, to_jsonb(v_row),
    p_property, jsonb_build_object('room_id', v_row.room_id, 'block_type', v_row.block_type)
  );

  return to_jsonb(v_row);
end;
$$;

-- update_room_block
create or replace function public.update_room_block(
  p_block              uuid,
  p_organization       uuid,
  p_property           uuid,
  p_end_date           date default null,
  p_reason             text default null,
  p_status             text default null,
  p_notes              text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_row public.room_blocks%rowtype;
begin
  perform app.require_session(v_user_id, null);
  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'room.block');

  update public.room_blocks set
    end_date = coalesce(p_end_date, end_date),
    reason = coalesce(p_reason, reason),
    status = coalesce(p_status, status),
    notes = coalesce(p_notes, notes)
  where id = p_block and organization_id = p_organization and property_id = p_property
  returning * into v_row;

  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;

  perform app.audit(
    'ROOM_BLOCK_UPDATED', 'room_block', v_row.id,
    null, to_jsonb(v_row),
    p_property, jsonb_build_object('status', v_row.status)
  );

  return to_jsonb(v_row);
end;
$$;

-- remove_room_block (cancel)
create or replace function public.remove_room_block(
  p_block              uuid,
  p_organization       uuid,
  p_property           uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.room_blocks%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.room_blocks
  where id = p_block and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'room.block');

  update public.room_blocks set
    status = 'CANCELLED'
  where id = p_block;

  perform app.audit(
    'ROOM_BLOCK_CANCELLED', 'room_block', p_block,
    to_jsonb(v_old), null,
    p_property, jsonb_build_object('room_id', v_old.room_id)
  );
end;
$$;

-- =================================================================== grants

grant execute on function public.create_amenity to authenticated;
grant execute on function public.update_amenity to authenticated;
grant execute on function public.create_room_type to authenticated;
grant execute on function public.update_room_type to authenticated;
grant execute on function public.archive_room_type to authenticated;
grant execute on function public.create_room to authenticated;
grant execute on function public.update_room to authenticated;
grant execute on function public.set_room_operational_status to authenticated;
grant execute on function public.set_room_housekeeping_status to authenticated;
grant execute on function public.archive_room to authenticated;
grant execute on function public.create_room_block to authenticated;
grant execute on function public.update_room_block to authenticated;
grant execute on function public.remove_room_block to authenticated;
