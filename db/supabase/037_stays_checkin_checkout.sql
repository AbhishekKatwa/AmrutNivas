-- AMRUT NIVAAS · 037 — stays & check-in/out (Prompt #08 §29-§32, §39-§42)
--
-- Stays represent actual occupancy. Separate from reservations (which are bookings).
-- Check-in creates a stay; check-out ends it. Room moves and extensions are tracked.
--
-- Key invariants:
--   - A stay is created only when a guest actually checks in.
--   - Check-in validates: reservation status, room availability, housekeeping status.
--   - Check-out sets room to VACANT_DIRTY (housekeeping needed).
--   - Stay status follows a state machine: EXPECTED → CHECKED_IN → CHECKED_OUT.
--   - Extensions and room moves are tracked historically.

set local search_path = '';

-- =================================================================== stays

create table if not exists public.stays (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  property_id          uuid not null references public.properties(id) on delete restrict,
  reservation_id       uuid not null references public.reservations(id) on delete restrict,
  primary_guest_id     uuid not null references public.guests(id) on delete restrict,
  room_id              uuid not null references public.rooms(id) on delete restrict,
  check_in_at          timestamptz not null default now(),
  expected_check_out_at timestamptz not null,
  actual_check_out_at  timestamptz,
  status               text not null default 'CHECKED_IN',
  notes                text,
  version              integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid,

  constraint stays_status_ok check (status in (
    'EXPECTED', 'CHECKED_IN', 'EXTENDED', 'CHECKED_OUT', 'EARLY_DEPARTURE'
  ))
);

comment on table public.stays is
  'Actual occupancy. Created at check-in, ended at check-out. Separate from reservations.';

create index if not exists stays_property_idx
  on public.stays (property_id);

create index if not exists stays_room_idx
  on public.stays (room_id);

create index if not exists stays_guest_idx
  on public.stays (primary_guest_id);

create index if not exists stays_org_idx
  on public.stays (organization_id);

create index if not exists stays_status_idx
  on public.stays (property_id, status);

create index if not exists stays_check_in_idx
  on public.stays (property_id, check_in_at);

drop trigger if exists stays_touch on public.stays;
create trigger stays_touch before update on public.stays
  for each row execute function app.touch_updated_at();

drop policy if exists stays_read on public.stays;
create policy stays_read on public.stays
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists stays_no_write on public.stays;
create policy stays_no_write on public.stays
  for all to authenticated
  using (false);

-- =================================================================== stay guests

-- Additional guests beyond the primary. Tracks who is in the room.
create table if not exists public.stay_guests (
  id                   uuid primary key default gen_random_uuid(),
  stay_id              uuid not null references public.stays(id) on delete cascade,
  guest_id             uuid not null references public.guests(id) on delete restrict,
  role                 text not null default 'ADDITIONAL',
  checked_in_at        timestamptz not null default now(),
  checked_out_at       timestamptz,
  created_at           timestamptz not null default now(),

  constraint stay_guests_role_ok check (role in ('PRIMARY', 'ADDITIONAL', 'CHILD', 'OTHER'))
);

comment on table public.stay_guests is
  'Additional guests in a stay. Primary guest is on the stay itself.';

create index if not exists stay_guests_stay_idx
  on public.stay_guests (stay_id);

create index if not exists stay_guests_guest_idx
  on public.stay_guests (guest_id);

drop policy if exists stay_guests_read on public.stay_guests;
create policy stay_guests_read on public.stay_guests
  for select to authenticated
  using (stay_id in (
    select s.id from public.stays s
    where s.organization_id in (
      select m.organization_id from public.organization_memberships m
      where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
    )
  ));

drop policy if exists stay_guests_no_write on public.stay_guests;
create policy stay_guests_no_write on public.stay_guests
  for all to authenticated
  using (false);

-- =================================================================== room move history

-- Track room changes during a stay.
create table if not exists public.stay_room_moves (
  id                   uuid primary key default gen_random_uuid(),
  stay_id              uuid not null references public.stays(id) on delete cascade,
  from_room_id         uuid not null references public.rooms(id) on delete restrict,
  to_room_id           uuid not null references public.rooms(id) on delete restrict,
  moved_at             timestamptz not null default now(),
  reason               text,
  moved_by             uuid,
  created_at           timestamptz not null default now(),

  constraint stay_room_moves_different_rooms check (from_room_id <> to_room_id),
  constraint stay_room_moves_reason_ok check (reason in (
    'GUEST_REQUEST', 'MAINTENANCE', 'UPGRADE', 'OPERATIONAL', 'OTHER'
  ))
);

comment on table public.stay_room_moves is
  'Room move history during a stay. Track all room changes.';

create index if not exists stay_room_moves_stay_idx
  on public.stay_room_moves (stay_id);

drop policy if exists stay_room_moves_read on public.stay_room_moves;
create policy stay_room_moves_read on public.stay_room_moves
  for select to authenticated
  using (stay_id in (
    select s.id from public.stays s
    where s.organization_id in (
      select m.organization_id from public.organization_memberships m
      where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
    )
  ));

drop policy if exists stay_room_moves_no_write on public.stay_room_moves;
create policy stay_room_moves_no_write on public.stay_room_moves
  for all to authenticated
  using (false);

-- =================================================================== doors

-- check_in
-- Creates a stay, updates reservation status to CHECKED_IN, updates room housekeeping.
create or replace function public.check_in(
  p_reservation        uuid,
  p_organization       uuid,
  p_property           uuid,
  p_room               uuid,
  p_expected_check_out timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_reservation public.reservations%rowtype;
  v_room public.rooms%rowtype;
  v_stay public.stays%rowtype;
begin
  perform app.require_session(v_user_id, null);

  -- Load and validate reservation.
  select * into v_reservation from public.reservations
  where id = p_reservation and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_reservation.status <> 'CONFIRMED' then
    raise exception 'NIVAAS_INVALID_STATE_TRANSITION';
  end if;

  -- Load and validate room.
  select * into v_room from public.rooms
  where id = p_room and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_room.operational_status <> 'ACTIVE' then
    raise exception 'NIVAAS_ROOM_NOT_AVAILABLE';
  end if;
  if v_room.housekeeping_status not in ('VACANT_CLEAN', 'INSPECTED') then
    raise exception 'NIVAAS_ROOM_NOT_CLEAN';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'frontoffice.checkin');

  -- Create the stay.
  insert into public.stays (
    organization_id, property_id, reservation_id, primary_guest_id,
    room_id, expected_check_out_at, created_by
  ) values (
    p_organization, p_property, p_reservation, v_reservation.primary_guest_id,
    p_room, p_expected_check_out, v_user_id
  ) returning * into v_stay;

  -- Update reservation status.
  update public.reservations
  set status = 'CHECKED_IN', room_id = p_room, version = version + 1
  where id = p_reservation;

  -- Update room housekeeping status.
  update public.rooms
  set housekeeping_status = 'OCCUPIED_CLEAN', version = version + 1
  where id = p_room;

  -- Create room assignment.
  insert into public.reservation_room_assignments (
    reservation_id, room_id, assigned_by
  ) values (
    p_reservation, p_room, v_user_id
  );

  perform app.audit(
    'GUEST_CHECKED_IN', 'stay', v_stay.id,
    null, to_jsonb(v_stay),
    p_property, jsonb_build_object('reservation_id', p_reservation, 'room_id', p_room)
  );

  return to_jsonb(v_stay);
end;
$$;

-- check_out
-- Ends the stay, updates reservation status to CHECKED_OUT, sets room to VACANT_DIRTY.
create or replace function public.check_out(
  p_stay               uuid,
  p_organization       uuid,
  p_property           uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_stay public.stays%rowtype;
  v_reservation public.reservations%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_stay from public.stays
  where id = p_stay and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_stay.status not in ('CHECKED_IN', 'EXTENDED') then
    raise exception 'NIVAAS_INVALID_STATE_TRANSITION';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'frontoffice.checkout');

  -- Load reservation.
  select * into v_reservation from public.reservations
  where id = v_stay.reservation_id;

  -- Update stay.
  update public.stays
  set actual_check_out_at = now(),
      status = case
        when now() < v_stay.expected_check_out_at then 'EARLY_DEPARTURE'
        else 'CHECKED_OUT'
      end,
      version = version + 1
  where id = p_stay
  returning * into v_stay;

  -- Update reservation status.
  update public.reservations
  set status = 'CHECKED_OUT', version = version + 1
  where id = v_stay.reservation_id;

  -- Update room housekeeping status to VACANT_DIRTY.
  update public.rooms
  set housekeeping_status = 'VACANT_DIRTY', version = version + 1
  where id = v_stay.room_id;

  perform app.audit(
    'GUEST_CHECKED_OUT', 'stay', p_stay,
    null, to_jsonb(v_stay),
    p_property, jsonb_build_object('reservation_id', v_stay.reservation_id)
  );

  return to_jsonb(v_stay);
end;
$$;

-- extend_stay
-- Updates the expected check-out date.
create or replace function public.extend_stay(
  p_stay               uuid,
  p_organization       uuid,
  p_property           uuid,
  p_new_check_out      timestamptz,
  p_expected_version   integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.stays%rowtype;
  v_row public.stays%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.stays
  where id = p_stay and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;
  if v_old.status not in ('CHECKED_IN', 'EXTENDED') then
    raise exception 'NIVAAS_INVALID_STATE_TRANSITION';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'stay.modify');

  update public.stays
  set expected_check_out_at = p_new_check_out,
      status = 'EXTENDED',
      version = version + 1
  where id = p_stay
  returning * into v_row;

  perform app.audit(
    'STAY_EXTENDED', 'stay', p_stay,
    to_jsonb(v_old), to_jsonb(v_row),
    p_property, jsonb_build_object('old_check_out', v_old.expected_check_out_at, 'new_check_out', p_new_check_out)
  );

  return to_jsonb(v_row);
end;
$$;

-- move_room
-- Changes the room during a stay. Tracks the move historically.
create or replace function public.move_room(
  p_stay               uuid,
  p_organization       uuid,
  p_property           uuid,
  p_new_room           uuid,
  p_reason             text default 'GUEST_REQUEST'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_stay public.stays%rowtype;
  v_old_room_id uuid;
  v_new_room public.rooms%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_stay from public.stays
  where id = p_stay and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_stay.status not in ('CHECKED_IN', 'EXTENDED') then
    raise exception 'NIVAAS_INVALID_STATE_TRANSITION';
  end if;

  -- Validate new room.
  select * into v_new_room from public.rooms
  where id = p_new_room and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_new_room.operational_status <> 'ACTIVE' then
    raise exception 'NIVAAS_ROOM_NOT_AVAILABLE';
  end if;
  if v_new_room.housekeeping_status not in ('VACANT_CLEAN', 'INSPECTED') then
    raise exception 'NIVAAS_ROOM_NOT_CLEAN';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'frontoffice.room_move');

  v_old_room_id := v_stay.room_id;

  -- Record the move.
  insert into public.stay_room_moves (
    stay_id, from_room_id, to_room_id, reason, moved_by
  ) values (
    p_stay, v_old_room_id, p_new_room, p_reason, v_user_id
  );

  -- Update stay.
  update public.stays
  set room_id = p_new_room, version = version + 1
  where id = p_stay
  returning * into v_stay;

  -- Update old room to VACANT_DIRTY.
  update public.rooms
  set housekeeping_status = 'VACANT_DIRTY', version = version + 1
  where id = v_old_room_id;

  -- Update new room to OCCUPIED_CLEAN.
  update public.rooms
  set housekeeping_status = 'OCCUPIED_CLEAN', version = version + 1
  where id = p_new_room;

  -- Update reservation room.
  update public.reservations
  set room_id = p_new_room, version = version + 1
  where id = v_stay.reservation_id;

  perform app.audit(
    'ROOM_MOVED', 'stay', p_stay,
    null, null,
    p_property, jsonb_build_object('from_room_id', v_old_room_id, 'to_room_id', p_new_room, 'reason', p_reason)
  );

  return to_jsonb(v_stay);
end;
$$;

-- add_stay_guest
-- Adds an additional guest to a stay.
create or replace function public.add_stay_guest(
  p_stay               uuid,
  p_organization       uuid,
  p_property           uuid,
  p_guest              uuid,
  p_role               text default 'ADDITIONAL'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_stay public.stays%rowtype;
  v_row public.stay_guests%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_stay from public.stays
  where id = p_stay and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_stay.status not in ('CHECKED_IN', 'EXTENDED') then
    raise exception 'NIVAAS_INVALID_STATE_TRANSITION';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'stay.modify');

  insert into public.stay_guests (
    stay_id, guest_id, role
  ) values (
    p_stay, p_guest, p_role
  ) returning * into v_row;

  perform app.audit(
    'STAY_GUEST_ADDED', 'stay_guest', v_row.id,
    null, to_jsonb(v_row),
    p_property, jsonb_build_object('stay_id', p_stay, 'guest_id', p_guest, 'role', p_role)
  );

  return to_jsonb(v_row);
end;
$$;

-- =================================================================== grants

grant execute on function public.check_in to authenticated;
grant execute on function public.check_out to authenticated;
grant execute on function public.extend_stay to authenticated;
grant execute on function public.move_room to authenticated;
grant execute on function public.add_stay_guest to authenticated;
