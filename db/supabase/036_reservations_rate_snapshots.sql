-- AMRUT NIVAAS · 036 — reservations & rate snapshots (Prompt #08 §14-§22, §26-§27)
--
-- Reservations: the core booking entity with a proper state machine.
-- Rate snapshots: preserve the agreed rate at booking time (never recalculate).
-- Room assignments: track assignment history separately from the reservation.
--
-- Key invariants:
--   - Reservation status follows a strict state machine.
--   - Rate snapshots are immutable once created.
--   - Room assignments are tracked historically (a reservation may change rooms).
--   - Hotel-night semantics: check-in 10 Oct, check-out 13 Oct = 3 nights.

set local search_path = '';

-- =================================================================== reservations

create table if not exists public.reservations (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  property_id          uuid not null references public.properties(id) on delete restrict,
  reservation_number   text not null,
  source               text not null default 'DIRECT',
  status               text not null default 'INQUIRY',
  primary_guest_id     uuid not null references public.guests(id) on delete restrict,
  arrival_date         date not null,
  departure_date       date not null,
  adults               integer not null default 1,
  children             integer not null default 0,
  infants              integer not null default 0,
  room_type_id         uuid references public.room_types(id) on delete restrict,
  room_id              uuid references public.rooms(id) on delete restrict,
  rate_plan_id         uuid references public.rate_plans(id) on delete restrict,
  currency             text not null default 'INR',
  special_requests     text,
  notes                text,
  total_amount         numeric not null default 0,
  deposit_amount       numeric not null default 0,
  deposit_status       text not null default 'NONE',
  cancelled_at         timestamptz,
  cancelled_by         uuid,
  cancellation_reason  text,
  no_show_at           timestamptz,
  version              integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid,

  constraint reservations_departure_after_arrival check (departure_date > arrival_date),
  constraint reservations_adults_positive check (adults > 0),
  constraint reservations_children_non_negative check (children >= 0),
  constraint reservations_infants_non_negative check (infants >= 0),
  constraint reservations_total_amount_non_negative check (total_amount >= 0),
  constraint reservations_deposit_amount_non_negative check (deposit_amount >= 0),
  constraint reservations_source_ok check (source in (
    'DIRECT', 'WALK_IN', 'PHONE', 'EMAIL', 'WEBSITE', 'OTA',
    'TRAVEL_AGENT', 'CORPORATE', 'WHATSAPP', 'REFERRAL', 'OTHER'
  )),
  constraint reservations_status_ok check (status in (
    'INQUIRY', 'TENTATIVE', 'CONFIRMED', 'WAITLISTED',
    'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW'
  )),
  constraint reservations_deposit_status_ok check (deposit_status in (
    'NONE', 'REQUIRED', 'RECEIVED', 'PENDING'
  ))
);

comment on table public.reservations is
  'Reservation master. Property-scoped. State machine enforced.';

-- Reservation number unique per property.
drop index if exists public.reservations_number_property_idx;
create unique index reservations_number_property_idx
  on public.reservations (property_id, reservation_number);

create index if not exists reservations_property_idx
  on public.reservations (property_id);

create index if not exists reservations_guest_idx
  on public.reservations (primary_guest_id);

create index if not exists reservations_org_idx
  on public.reservations (organization_id);

create index if not exists reservations_arrival_idx
  on public.reservations (property_id, arrival_date);

create index if not exists reservations_status_idx
  on public.reservations (property_id, status);

create index if not exists reservations_room_idx
  on public.reservations (room_id)
  where room_id is not null and status not in ('CANCELLED', 'CHECKED_OUT', 'NO_SHOW');

drop trigger if exists reservations_touch on public.reservations;
create trigger reservations_touch before update on public.reservations
  for each row execute function app.touch_updated_at();

drop policy if exists reservations_read on public.reservations;
create policy reservations_read on public.reservations
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists reservations_no_write on public.reservations;
create policy reservations_no_write on public.reservations
  for all to authenticated
  using (false);

-- =================================================================== reservation rate snapshots

-- Immutable rate snapshots: preserve the agreed rate at booking time.
-- One row per night of the stay. Never recalculate historical reservations.
create table if not exists public.reservation_rate_snapshots (
  id                   uuid primary key default gen_random_uuid(),
  reservation_id       uuid not null references public.reservations(id) on delete cascade,
  rate_date            date not null,
  room_type_id         uuid not null references public.room_types(id) on delete restrict,
  rate_plan_id         uuid references public.rate_plans(id) on delete restrict,
  room_rate            numeric not null,
  tax_amount           numeric not null default 0,
  discount_amount      numeric not null default 0,
  total_amount         numeric not null,
  created_at           timestamptz not null default now(),

  constraint reservation_rate_snapshots_rate_positive check (room_rate >= 0),
  constraint reservation_rate_snapshots_tax_non_negative check (tax_amount >= 0),
  constraint reservation_rate_snapshots_discount_non_negative check (discount_amount >= 0),
  constraint reservation_rate_snapshots_total_positive check (total_amount >= 0)
);

comment on table public.reservation_rate_snapshots is
  'Immutable rate snapshots. One row per night. Never recalculate historical reservations.';

-- Unique snapshot per (reservation, date).
drop index if exists public.reservation_rate_snapshots_unique_idx;
create unique index reservation_rate_snapshots_unique_idx
  on public.reservation_rate_snapshots (reservation_id, rate_date);

create index if not exists reservation_rate_snapshots_reservation_idx
  on public.reservation_rate_snapshots (reservation_id);

drop policy if exists reservation_rate_snapshots_read on public.reservation_rate_snapshots;
create policy reservation_rate_snapshots_read on public.reservation_rate_snapshots
  for select to authenticated
  using (reservation_id in (
    select r.id from public.reservations r
    where r.organization_id in (
      select m.organization_id from public.organization_memberships m
      where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
    )
  ));

drop policy if exists reservation_rate_snapshots_no_write on public.reservation_rate_snapshots;
create policy reservation_rate_snapshots_no_write on public.reservation_rate_snapshots
  for all to authenticated
  using (false);

-- =================================================================== reservation room assignments

-- Track room assignment history. A reservation may change rooms multiple times.
create table if not exists public.reservation_room_assignments (
  id                   uuid primary key default gen_random_uuid(),
  reservation_id       uuid not null references public.reservations(id) on delete cascade,
  room_id              uuid not null references public.rooms(id) on delete restrict,
  assigned_at          timestamptz not null default now(),
  unassigned_at        timestamptz,
  reason               text,
  assigned_by          uuid,
  created_at           timestamptz not null default now(),

  constraint reservation_room_assignments_unassigned_after_assigned check (
    unassigned_at is null or unassigned_at >= assigned_at
  )
);

comment on table public.reservation_room_assignments is
  'Room assignment history. Track all room changes for a reservation.';

create index if not exists reservation_room_assignments_reservation_idx
  on public.reservation_room_assignments (reservation_id);

create index if not exists reservation_room_assignments_room_idx
  on public.reservation_room_assignments (room_id);

drop policy if exists reservation_room_assignments_read on public.reservation_room_assignments;
create policy reservation_room_assignments_read on public.reservation_room_assignments
  for select to authenticated
  using (reservation_id in (
    select r.id from public.reservations r
    where r.organization_id in (
      select m.organization_id from public.organization_memberships m
      where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
    )
  ));

drop policy if exists reservation_room_assignments_no_write on public.reservation_room_assignments;
create policy reservation_room_assignments_no_write on public.reservation_room_assignments
  for all to authenticated
  using (false);

-- =================================================================== doors

-- Helper: generate reservation number (RES-YYYY-NNNNN)
create or replace function public.generate_reservation_number(
  p_property uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year integer := extract(year from now());
  v_count integer;
  v_number text;
begin
  select count(*) into v_count
  from public.reservations
  where property_id = p_property
    and extract(year from created_at) = v_year;

  v_number := 'RES-' || v_year || '-' || lpad((v_count + 1)::text, 5, '0');
  return v_number;
end;
$$;

-- create_reservation
create or replace function public.create_reservation(
  p_organization       uuid,
  p_property           uuid,
  p_primary_guest      uuid,
  p_arrival_date       date,
  p_departure_date     date,
  p_adults             integer default 1,
  p_children           integer default 0,
  p_infants            integer default 0,
  p_room_type          uuid default null,
  p_room               uuid default null,
  p_rate_plan          uuid default null,
  p_source             text default 'DIRECT',
  p_status             text default 'INQUIRY',
  p_currency           text default 'INR',
  p_special_requests   text default null,
  p_notes              text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_reservation_number text;
  v_row public.reservations%rowtype;
begin
  perform app.require_session(v_user_id, null);
  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'reservation.create');

  v_reservation_number := public.generate_reservation_number(p_property);

  insert into public.reservations (
    organization_id, property_id, reservation_number, source, status,
    primary_guest_id, arrival_date, departure_date, adults, children, infants,
    room_type_id, room_id, rate_plan_id, currency, special_requests, notes,
    created_by
  ) values (
    p_organization, p_property, v_reservation_number, p_source, p_status,
    p_primary_guest, p_arrival_date, p_departure_date, p_adults, p_children, p_infants,
    p_room_type, p_room, p_rate_plan, p_currency, p_special_requests, p_notes,
    v_user_id
  ) returning * into v_row;

  -- If a room was assigned, create the assignment record.
  if p_room is not null then
    insert into public.reservation_room_assignments (
      reservation_id, room_id, assigned_by
    ) values (
      v_row.id, p_room, v_user_id
    );
  end if;

  perform app.audit(
    'RESERVATION_CREATED', 'reservation', v_row.id,
    null, to_jsonb(v_row),
    p_property, jsonb_build_object('reservation_number', v_row.reservation_number)
  );

  return to_jsonb(v_row);
end;
$$;

-- update_reservation
create or replace function public.update_reservation(
  p_reservation        uuid,
  p_organization       uuid,
  p_property           uuid,
  p_expected_version   integer,
  p_arrival_date       date default null,
  p_departure_date     date default null,
  p_adults             integer default null,
  p_children           integer default null,
  p_infants            integer default null,
  p_room_type          uuid default null,
  p_rate_plan          uuid default null,
  p_special_requests   text default null,
  p_notes              text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.reservations%rowtype;
  v_row public.reservations%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.reservations
  where id = p_reservation and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'reservation.edit');

  update public.reservations set
    arrival_date = coalesce(p_arrival_date, v_old.arrival_date),
    departure_date = coalesce(p_departure_date, v_old.departure_date),
    adults = coalesce(p_adults, v_old.adults),
    children = coalesce(p_children, v_old.children),
    infants = coalesce(p_infants, v_old.infants),
    room_type_id = coalesce(p_room_type, v_old.room_type_id),
    rate_plan_id = coalesce(p_rate_plan, v_old.rate_plan_id),
    special_requests = coalesce(p_special_requests, v_old.special_requests),
    notes = coalesce(p_notes, v_old.notes),
    version = version + 1
  where id = p_reservation returning * into v_row;

  perform app.audit(
    'RESERVATION_UPDATED', 'reservation', v_row.id,
    to_jsonb(v_old), to_jsonb(v_row),
    p_property, jsonb_build_object('version', v_row.version)
  );

  return to_jsonb(v_row);
end;
$$;

-- confirm_reservation
create or replace function public.confirm_reservation(
  p_reservation        uuid,
  p_organization       uuid,
  p_property           uuid,
  p_expected_version   integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.reservations%rowtype;
  v_row public.reservations%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.reservations
  where id = p_reservation and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;

  -- State machine: only INQUIRY, TENTATIVE, WAITLISTED can be confirmed.
  if v_old.status not in ('INQUIRY', 'TENTATIVE', 'WAITLISTED') then
    raise exception 'NIVAAS_INVALID_STATE_TRANSITION';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'reservation.confirm');

  update public.reservations set
    status = 'CONFIRMED',
    version = version + 1
  where id = p_reservation returning * into v_row;

  perform app.audit(
    'RESERVATION_CONFIRMED', 'reservation', v_row.id,
    to_jsonb(v_old), to_jsonb(v_row),
    p_property, jsonb_build_object('old_status', v_old.status, 'new_status', v_row.status)
  );

  return to_jsonb(v_row);
end;
$$;

-- cancel_reservation
create or replace function public.cancel_reservation(
  p_reservation        uuid,
  p_organization       uuid,
  p_property           uuid,
  p_expected_version   integer,
  p_reason             text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.reservations%rowtype;
  v_row public.reservations%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.reservations
  where id = p_reservation and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;

  -- State machine: terminal states cannot be cancelled.
  if v_old.status in ('CHECKED_OUT', 'CANCELLED', 'NO_SHOW') then
    raise exception 'NIVAAS_INVALID_STATE_TRANSITION';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'reservation.cancel');

  update public.reservations set
    status = 'CANCELLED',
    cancelled_at = now(),
    cancelled_by = v_user_id,
    cancellation_reason = p_reason,
    version = version + 1
  where id = p_reservation returning * into v_row;

  perform app.audit(
    'RESERVATION_CANCELLED', 'reservation', v_row.id,
    to_jsonb(v_old), to_jsonb(v_row),
    p_property, jsonb_build_object('reason', p_reason)
  );

  return to_jsonb(v_row);
end;
$$;

-- mark_no_show
create or replace function public.mark_no_show(
  p_reservation        uuid,
  p_organization       uuid,
  p_property           uuid,
  p_expected_version   integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.reservations%rowtype;
  v_row public.reservations%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.reservations
  where id = p_reservation and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;

  -- Only CONFIRMED reservations can be marked as no-show.
  if v_old.status <> 'CONFIRMED' then
    raise exception 'NIVAAS_INVALID_STATE_TRANSITION';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'reservation.no_show');

  update public.reservations set
    status = 'NO_SHOW',
    no_show_at = now(),
    version = version + 1
  where id = p_reservation returning * into v_row;

  perform app.audit(
    'RESERVATION_NO_SHOW', 'reservation', v_row.id,
    to_jsonb(v_old), to_jsonb(v_row),
    p_property, null
  );

  return to_jsonb(v_row);
end;
$$;

-- assign_room
create or replace function public.assign_room(
  p_reservation        uuid,
  p_organization       uuid,
  p_property           uuid,
  p_room               uuid,
  p_reason             text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_reservation public.reservations%rowtype;
  v_old_room_id uuid;
begin
  perform app.require_session(v_user_id, null);

  select * into v_reservation from public.reservations
  where id = p_reservation and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'reservation.edit');

  v_old_room_id := v_reservation.room_id;

  -- Unassign the previous room if any.
  if v_old_room_id is not null then
    update public.reservation_room_assignments
    set unassigned_at = now()
    where reservation_id = p_reservation
      and room_id = v_old_room_id
      and unassigned_at is null;
  end if;

  -- Assign the new room.
  update public.reservations
  set room_id = p_room
  where id = p_reservation;

  insert into public.reservation_room_assignments (
    reservation_id, room_id, reason, assigned_by
  ) values (
    p_reservation, p_room, p_reason, v_user_id
  );

  perform app.audit(
    'RESERVATION_ROOM_ASSIGNED', 'reservation', p_reservation,
    null, null,
    p_property, jsonb_build_object('old_room_id', v_old_room_id, 'new_room_id', p_room, 'reason', p_reason)
  );

  return to_jsonb(v_reservation);
end;
$$;

-- create_reservation_rate_snapshot
-- Called when a reservation is confirmed to preserve the agreed rate.
create or replace function public.create_reservation_rate_snapshot(
  p_reservation        uuid,
  p_organization       uuid,
  p_property           uuid,
  p_rate_date          date,
  p_room_type          uuid,
  p_room_rate          numeric,
  p_rate_plan          uuid default null,
  p_tax_amount         numeric default 0,
  p_discount_amount    numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_row public.reservation_rate_snapshots%rowtype;
begin
  perform app.require_session(v_user_id, null);
  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'reservation.create');

  insert into public.reservation_rate_snapshots (
    reservation_id, rate_date, room_type_id, rate_plan_id,
    room_rate, tax_amount, discount_amount, total_amount
  ) values (
    p_reservation, p_rate_date, p_room_type, p_rate_plan,
    p_room_rate, p_tax_amount, p_discount_amount,
    p_room_rate + p_tax_amount - p_discount_amount
  ) returning * into v_row;

  -- Update reservation total.
  update public.reservations
  set total_amount = (
    select coalesce(sum(total_amount), 0)
    from public.reservation_rate_snapshots
    where reservation_id = p_reservation
  )
  where id = p_reservation;

  return to_jsonb(v_row);
end;
$$;

-- =================================================================== grants

grant execute on function public.generate_reservation_number to authenticated;
grant execute on function public.create_reservation to authenticated;
grant execute on function public.update_reservation to authenticated;
grant execute on function public.confirm_reservation to authenticated;
grant execute on function public.cancel_reservation to authenticated;
grant execute on function public.mark_no_show to authenticated;
grant execute on function public.assign_room to authenticated;
grant execute on function public.create_reservation_rate_snapshot to authenticated;
