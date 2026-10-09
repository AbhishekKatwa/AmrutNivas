-- 056 — the hotel-domain audit calls, normalized to the canonical funnel.
--
-- 054 installed the row-image app.audit overload (action, entity, id, before,
-- after, reason text, metadata) and documented in its header that callers
-- passing a property uuid in slot six stay unresolved: 034-039's doors do
-- exactly that, so every hotel/HK/MX door died at its audit line (42883) after
-- doing its real work, and the insert went down with the transaction. A
-- sibling uuid-slot-6 overload is not an option — 028-033/041 pass untyped
-- null there and would all become ambiguous (42725) — so this migration
-- re-creates each affected door verbatim with one change per audit call: the
-- property expression in slot six becomes null. Organization and property are
-- not lost: the funnel reads organization_id out of the row image, and the
-- row image carries property_id. Only doors containing a rewritten call are
-- re-created; their grants survive (create or replace never drops grants).

-- ==================================================================
-- add_stay_guest (from 037_stays_checkin_checkout.sql, audit slot 6 normalized)
-- ==================================================================

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

  perform app.audit('STAY_GUEST_ADDED', 'stay_guest', v_row.id, null, to_jsonb(v_row), null, jsonb_build_object('stay_id', p_stay, 'guest_id', p_guest, 'role', p_role));

  return to_jsonb(v_row);
end;
$$;

-- ==================================================================
-- archive_rate_plan (from 035_rate_plans_room_rates.sql, audit slot 6 normalized)
-- ==================================================================

create or replace function public.archive_rate_plan(
  p_rate_plan          uuid,
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
  v_old public.rate_plans%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.rate_plans
  where id = p_rate_plan and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'reservation.edit');

  update public.rate_plans set
    status = 'ARCHIVED',
    archived_at = now(),
    version = version + 1
  where id = p_rate_plan;

  perform app.audit('RATE_PLAN_ARCHIVED', 'rate_plan', p_rate_plan, to_jsonb(v_old), null, null, jsonb_build_object('version', v_old.version + 1));
end;
$$;

-- ==================================================================
-- archive_room (from 034_room_types_rooms_blocks.sql, audit slot 6 normalized)
-- ==================================================================

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

  perform app.audit('ROOM_ARCHIVED', 'room', p_room, to_jsonb(v_old), null, null, jsonb_build_object('version', v_old.version + 1));
end;
$$;

-- ==================================================================
-- archive_room_type (from 034_room_types_rooms_blocks.sql, audit slot 6 normalized)
-- ==================================================================

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

  perform app.audit('ROOM_TYPE_ARCHIVED', 'room_type', p_room_type, to_jsonb(v_old), null, null, jsonb_build_object('version', v_old.version + 1));
end;
$$;

-- ==================================================================
-- assign_housekeeping_task (from 039_housekeeping_maintenance.sql, audit slot 6 normalized)
-- ==================================================================

create or replace function public.assign_housekeeping_task(
  p_task               uuid,
  p_organization       uuid,
  p_property           uuid,
  p_assigned_to        uuid,
  p_expected_version   integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.housekeeping_tasks%rowtype;
  v_row public.housekeeping_tasks%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.housekeeping_tasks
  where id = p_task and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;
  if not app.housekeeping_task_transition_allowed(v_old.status, 'ASSIGNED') then
    raise exception 'NIVAAS_INVALID_STATE_TRANSITION';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'housekeeping.task.assign');

  update public.housekeeping_tasks set
    assigned_to = p_assigned_to,
    status = 'ASSIGNED',
    version = version + 1
  where id = p_task
  returning * into v_row;

  perform app.audit('HOUSEKEEPING_TASK_ASSIGNED', 'housekeeping_task', p_task, to_jsonb(v_old), to_jsonb(v_row), null, jsonb_build_object('assigned_to', p_assigned_to));

  return to_jsonb(v_row);
end;
$$;

-- ==================================================================
-- assign_maintenance_request (from 039_housekeeping_maintenance.sql, audit slot 6 normalized)
-- ==================================================================

create or replace function public.assign_maintenance_request(
  p_request            uuid,
  p_organization       uuid,
  p_property           uuid,
  p_assigned_to        uuid,
  p_expected_version   integer,
  p_assigned_vendor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.maintenance_requests%rowtype;
  v_row public.maintenance_requests%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.maintenance_requests
  where id = p_request and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;
  if not app.maintenance_request_transition_allowed(v_old.status, 'ASSIGNED') then
    raise exception 'NIVAAS_INVALID_STATE_TRANSITION';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'maintenance.assign');

  update public.maintenance_requests set
    assigned_to = p_assigned_to,
    assigned_vendor_id = coalesce(p_assigned_vendor_id, v_old.assigned_vendor_id),
    status = 'ASSIGNED',
    assigned_at = now(),
    version = version + 1
  where id = p_request
  returning * into v_row;

  perform app.audit('MAINTENANCE_REQUEST_ASSIGNED', 'maintenance_request', p_request, to_jsonb(v_old), to_jsonb(v_row), null, jsonb_build_object('assigned_to', p_assigned_to));

  return to_jsonb(v_row);
end;
$$;

-- ==================================================================
-- assign_room (from 036_reservations_rate_snapshots.sql, audit slot 6 normalized)
-- ==================================================================

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

  perform app.audit('RESERVATION_ROOM_ASSIGNED', 'reservation', p_reservation, null, null, null, jsonb_build_object('old_room_id', v_old_room_id, 'new_room_id', p_room, 'reason', p_reason));

  return to_jsonb(v_reservation);
end;
$$;

-- ==================================================================
-- bulk_upsert_room_rates (from 035_rate_plans_room_rates.sql, audit slot 6 normalized)
-- ==================================================================

create or replace function public.bulk_upsert_room_rates(
  p_organization       uuid,
  p_property           uuid,
  p_rate_plan          uuid,
  p_room_type          uuid,
  p_start_date         date,
  p_end_date           date,
  p_base_rate          numeric,
  p_extra_adult_rate   numeric default null,
  p_extra_child_rate   numeric default null,
  p_closed_to_arrival  boolean default false,
  p_closed_to_departure boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_count integer := 0;
  v_date date;
begin
  perform app.require_session(v_user_id, null);
  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'reservation.create');

  v_date := p_start_date;
  while v_date <= p_end_date loop
    insert into public.room_rates (
      organization_id, property_id, rate_plan_id, room_type_id, rate_date,
      base_rate, extra_adult_rate, extra_child_rate,
      closed_to_arrival, closed_to_departure, created_by
    ) values (
      p_organization, p_property, p_rate_plan, p_room_type, v_date,
      p_base_rate, p_extra_adult_rate, p_extra_child_rate,
      p_closed_to_arrival, p_closed_to_departure, v_user_id
    )
    on conflict (rate_plan_id, room_type_id, rate_date)
    do update set
      base_rate = excluded.base_rate,
      extra_adult_rate = excluded.extra_adult_rate,
      extra_child_rate = excluded.extra_child_rate,
      closed_to_arrival = excluded.closed_to_arrival,
      closed_to_departure = excluded.closed_to_departure;

    v_count := v_count + 1;
    v_date := v_date + interval '1 day';
  end loop;

  perform app.audit('ROOM_RATES_BULK_UPSERTED', 'room_rate', null, null, null, null, jsonb_build_object(
      'rate_plan_id', p_rate_plan,
      'room_type_id', p_room_type,
      'start_date', p_start_date,
      'end_date', p_end_date,
      'count', v_count
    ));

  return v_count;
end;
$$;

-- ==================================================================
-- cancel_housekeeping_task (from 039_housekeeping_maintenance.sql, audit slot 6 normalized)
-- ==================================================================

create or replace function public.cancel_housekeeping_task(
  p_task               uuid,
  p_organization       uuid,
  p_property           uuid,
  p_expected_version   integer,
  p_reason             text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.housekeeping_tasks%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.housekeeping_tasks
  where id = p_task and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;
  if not app.housekeeping_task_transition_allowed(v_old.status, 'CANCELLED') then
    raise exception 'NIVAAS_INVALID_STATE_TRANSITION';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'housekeeping.task.cancel');

  update public.housekeeping_tasks set
    status = 'CANCELLED',
    notes = case when p_reason is not null then concat_ws('. ', v_old.notes, p_reason) else v_old.notes end,
    version = version + 1
  where id = p_task;

  perform app.audit('HOUSEKEEPING_TASK_CANCELLED', 'housekeeping_task', p_task, to_jsonb(v_old), null, null, jsonb_build_object('reason', p_reason));
end;
$$;

-- ==================================================================
-- cancel_maintenance_request (from 039_housekeeping_maintenance.sql, audit slot 6 normalized)
-- ==================================================================

create or replace function public.cancel_maintenance_request(
  p_request            uuid,
  p_organization       uuid,
  p_property           uuid,
  p_expected_version   integer,
  p_reason             text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.maintenance_requests%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.maintenance_requests
  where id = p_request and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;
  if not app.maintenance_request_transition_allowed(v_old.status, 'CANCELLED') then
    raise exception 'NIVAAS_INVALID_STATE_TRANSITION';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'maintenance.cancel');

  update public.maintenance_requests set
    status = 'CANCELLED',
    notes = case when p_reason is not null then concat_ws('. ', v_old.notes, p_reason) else v_old.notes end,
    version = version + 1
  where id = p_request;

  perform app.audit('MAINTENANCE_REQUEST_CANCELLED', 'maintenance_request', p_request, to_jsonb(v_old), null, null, jsonb_build_object('reason', p_reason));
end;
$$;

-- ==================================================================
-- cancel_reservation (from 036_reservations_rate_snapshots.sql, audit slot 6 normalized)
-- ==================================================================

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

  perform app.audit('RESERVATION_CANCELLED', 'reservation', v_row.id, to_jsonb(v_old), to_jsonb(v_row), null, jsonb_build_object('reason', p_reason));

  return to_jsonb(v_row);
end;
$$;

-- ==================================================================
-- check_in (from 037_stays_checkin_checkout.sql, audit slot 6 normalized)
-- ==================================================================

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

  perform app.audit('GUEST_CHECKED_IN', 'stay', v_stay.id, null, to_jsonb(v_stay), null, jsonb_build_object('reservation_id', p_reservation, 'room_id', p_room));

  return to_jsonb(v_stay);
end;
$$;

-- ==================================================================
-- check_out (from 039_housekeeping_maintenance.sql, audit slot 6 normalized)
-- ==================================================================

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
  v_task public.housekeeping_tasks%rowtype;
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

  -- Auto-create housekeeping task for checkout cleaning.
  insert into public.housekeeping_tasks (
    organization_id, property_id, room_id, stay_id, task_type, priority, created_by
  ) values (
    p_organization, p_property, v_stay.room_id, p_stay, 'CHECKOUT_CLEAN', 'HIGH', v_user_id
  ) returning * into v_task;

  perform app.audit('GUEST_CHECKED_OUT', 'stay', p_stay, null, to_jsonb(v_stay), null, jsonb_build_object(
      'reservation_id', v_stay.reservation_id,
      'housekeeping_task_id', v_task.id
    ));

  return to_jsonb(v_stay);
end;
$$;

-- ==================================================================
-- close_maintenance_request (from 039_housekeeping_maintenance.sql, audit slot 6 normalized)
-- ==================================================================

create or replace function public.close_maintenance_request(
  p_request            uuid,
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
  v_old public.maintenance_requests%rowtype;
  v_row public.maintenance_requests%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.maintenance_requests
  where id = p_request and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;
  if v_old.status <> 'VERIFIED' then
    raise exception 'NIVAAS_INVALID_STATE_TRANSITION';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'maintenance.close');

  update public.maintenance_requests set
    status = 'CLOSED',
    closed_at = now(),
    closed_by = v_user_id,
    version = version + 1
  where id = p_request
  returning * into v_row;

  -- If room was out of order for this maintenance, return it to ACTIVE.
  if v_row.room_id is not null then
    update public.rooms set
      operational_status = 'ACTIVE',
      version = version + 1
    where id = v_row.room_id and operational_status = 'OUT_OF_ORDER';
  end if;

  perform app.audit('MAINTENANCE_REQUEST_CLOSED', 'maintenance_request', p_request, to_jsonb(v_old), to_jsonb(v_row), null, jsonb_build_object('room_id', v_row.room_id));

  return to_jsonb(v_row);
end;
$$;

-- ==================================================================
-- complete_housekeeping_task (from 039_housekeeping_maintenance.sql, audit slot 6 normalized)
-- ==================================================================

create or replace function public.complete_housekeeping_task(
  p_task               uuid,
  p_organization       uuid,
  p_property           uuid,
  p_expected_version   integer,
  p_notes              text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.housekeeping_tasks%rowtype;
  v_row public.housekeeping_tasks%rowtype;
  v_room public.rooms%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.housekeeping_tasks
  where id = p_task and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;
  if v_old.status <> 'IN_PROGRESS' then
    raise exception 'NIVAAS_INVALID_STATE_TRANSITION';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'housekeeping.task.complete');

  update public.housekeeping_tasks set
    status = 'COMPLETED',
    completed_at = now(),
    notes = coalesce(p_notes, v_old.notes),
    version = version + 1
  where id = p_task
  returning * into v_row;

  -- Update room housekeeping status based on task type.
  select * into v_room from public.rooms where id = v_row.room_id;
  if v_row.task_type = 'CHECKOUT_CLEAN' and v_room.housekeeping_status = 'VACANT_DIRTY' then
    update public.rooms set
      housekeeping_status = 'VACANT_CLEAN',
      version = version + 1
    where id = v_row.room_id;
  elsif v_row.task_type = 'STAYOVER_CLEAN' and v_room.housekeeping_status = 'OCCUPIED_DIRTY' then
    update public.rooms set
      housekeeping_status = 'OCCUPIED_CLEAN',
      version = version + 1
    where id = v_row.room_id;
  end if;

  perform app.audit('HOUSEKEEPING_TASK_COMPLETED', 'housekeeping_task', p_task, to_jsonb(v_old), to_jsonb(v_row), null, jsonb_build_object('room_id', v_row.room_id));

  return to_jsonb(v_row);
end;
$$;

-- ==================================================================
-- complete_room_inspection (from 039_housekeeping_maintenance.sql, audit slot 6 normalized)
-- ==================================================================

create or replace function public.complete_room_inspection(
  p_inspection         uuid,
  p_organization       uuid,
  p_property           uuid,
  p_results            jsonb,  -- [{"checklist_item_id": "...", "result": "PASS|FAIL|NOT_APPLICABLE", "note": "..."}]
  p_notes              text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_inspection public.room_inspections%rowtype;
  v_item record;
  v_has_failure boolean := false;
  v_final_status text;
begin
  perform app.require_session(v_user_id, null);

  select * into v_inspection from public.room_inspections
  where id = p_inspection and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_inspection.status <> 'PENDING' then
    raise exception 'NIVAAS_INVALID_STATE_TRANSITION';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'housekeeping.inspection.complete');

  -- Insert results.
  for v_item in select * from jsonb_to_recordset(p_results) as x(
    checklist_item_id uuid, result text, note text
  ) loop
    insert into public.room_inspection_results (
      inspection_id, checklist_item_id, result, note
    ) values (
      p_inspection, v_item.checklist_item_id, v_item.result, v_item.note
    );
    if v_item.result = 'FAIL' then
      v_has_failure := true;
    end if;
  end loop;

  -- Determine final status.
  v_final_status := case when v_has_failure then 'FAILED' else 'PASSED' end;

  update public.room_inspections set
    status = v_final_status,
    inspector_id = v_user_id,
    notes = coalesce(p_notes, v_inspection.notes),
    passed_at = case when v_final_status = 'PASSED' then now() else null end,
    failed_at = case when v_final_status = 'FAILED' then now() else null end,
    version = version + 1
  where id = p_inspection
  returning * into v_inspection;

  -- If passed and linked to a checkout clean task, update room to INSPECTED.
  if v_final_status = 'PASSED' then
    update public.rooms set
      housekeeping_status = 'INSPECTED',
      version = version + 1
    where id = v_inspection.room_id
      and housekeeping_status in ('VACANT_CLEAN', 'OCCUPIED_CLEAN');
  end if;

  perform app.audit(case when v_final_status = 'PASSED' then 'ROOM_INSPECTION_PASSED' else 'ROOM_INSPECTION_FAILED' end, 'room_inspection', p_inspection, null, to_jsonb(v_inspection), null, jsonb_build_object('room_id', v_inspection.room_id, 'status', v_final_status));

  return to_jsonb(v_inspection);
end;
$$;

-- ==================================================================
-- confirm_reservation (from 036_reservations_rate_snapshots.sql, audit slot 6 normalized)
-- ==================================================================

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

  perform app.audit('RESERVATION_CONFIRMED', 'reservation', v_row.id, to_jsonb(v_old), to_jsonb(v_row), null, jsonb_build_object('old_status', v_old.status, 'new_status', v_row.status));

  return to_jsonb(v_row);
end;
$$;

-- ==================================================================
-- create_asset (from 039_housekeeping_maintenance.sql, audit slot 6 normalized)
-- ==================================================================

create or replace function public.create_asset(
  p_organization       uuid,
  p_property           uuid,
  p_asset_code         text,
  p_name               text,
  p_category           text,
  p_room_id            uuid default null,
  p_outlet_id          uuid default null,
  p_location_description text default null,
  p_serial_number      text default null,
  p_manufacturer       text default null,
  p_model_number       text default null,
  p_purchase_date      date default null,
  p_purchase_cost      numeric default null,
  p_warranty_end_date  date default null,
  p_notes              text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_row public.assets%rowtype;
begin
  perform app.require_session(v_user_id, null);
  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'asset.create');

  insert into public.assets (
    organization_id, property_id, room_id, outlet_id,
    asset_code, name, category, location_description,
    serial_number, manufacturer, model_number,
    purchase_date, purchase_cost, warranty_end_date,
    notes, created_by
  ) values (
    p_organization, p_property, p_room_id, p_outlet_id,
    p_asset_code, p_name, p_category, p_location_description,
    p_serial_number, p_manufacturer, p_model_number,
    p_purchase_date, p_purchase_cost, p_warranty_end_date,
    p_notes, v_user_id
  ) returning * into v_row;

  perform app.audit('ASSET_CREATED', 'asset', v_row.id, null, to_jsonb(v_row), null, jsonb_build_object('asset_code', v_row.asset_code, 'category', v_row.category));

  return to_jsonb(v_row);
end;
$$;

-- ==================================================================
-- create_housekeeping_task (from 039_housekeeping_maintenance.sql, audit slot 6 normalized)
-- ==================================================================

create or replace function public.create_housekeeping_task(
  p_organization       uuid,
  p_property           uuid,
  p_room               uuid,
  p_task_type          text,
  p_priority           text default 'NORMAL',
  p_notes              text default null,
  p_stay_id            uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_row public.housekeeping_tasks%rowtype;
begin
  perform app.require_session(v_user_id, null);
  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'housekeeping.task.create');

  insert into public.housekeeping_tasks (
    organization_id, property_id, room_id, stay_id, task_type, priority, notes, created_by
  ) values (
    p_organization, p_property, p_room, p_stay_id, p_task_type, p_priority, p_notes, v_user_id
  ) returning * into v_row;

  perform app.audit('HOUSEKEEPING_TASK_CREATED', 'housekeeping_task', v_row.id, null, to_jsonb(v_row), null, jsonb_build_object('room_id', p_room, 'task_type', p_task_type));

  return to_jsonb(v_row);
end;
$$;

-- ==================================================================
-- create_lost_found_item (from 039_housekeeping_maintenance.sql, audit slot 6 normalized)
-- ==================================================================

create or replace function public.create_lost_found_item(
  p_organization       uuid,
  p_property           uuid,
  p_description        text,
  p_category           text default 'OTHER',
  p_room_id            uuid default null,
  p_storage_location   text default null,
  p_guest_id           uuid default null,
  p_notes              text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_row public.lost_found_items%rowtype;
begin
  perform app.require_session(v_user_id, null);
  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'lost_found.create');

  insert into public.lost_found_items (
    organization_id, property_id, room_id, description, category,
    storage_location, guest_id, notes, found_by, created_by
  ) values (
    p_organization, p_property, p_room_id, p_description, p_category,
    p_storage_location, p_guest_id, p_notes, v_user_id, v_user_id
  ) returning * into v_row;

  perform app.audit('LOST_FOUND_ITEM_CREATED', 'lost_found_item', v_row.id, null, to_jsonb(v_row), null, jsonb_build_object('category', p_category, 'room_id', p_room_id));

  return to_jsonb(v_row);
end;
$$;

-- ==================================================================
-- create_maintenance_request (from 039_housekeeping_maintenance.sql, audit slot 6 normalized)
-- ==================================================================

create or replace function public.create_maintenance_request(
  p_organization       uuid,
  p_property           uuid,
  p_category           text,
  p_title              text,
  p_description        text default null,
  p_priority           text default 'NORMAL',
  p_source             text default 'OTHER',
  p_room_id            uuid default null,
  p_outlet_id          uuid default null,
  p_asset_id           uuid default null,
  p_notes              text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_row public.maintenance_requests%rowtype;
begin
  perform app.require_session(v_user_id, null);
  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'maintenance.create');

  insert into public.maintenance_requests (
    organization_id, property_id, room_id, outlet_id, asset_id,
    category, title, description, priority, source, notes,
    reported_by, created_by
  ) values (
    p_organization, p_property, p_room_id, p_outlet_id, p_asset_id,
    p_category, p_title, p_description, p_priority, p_source, p_notes,
    v_user_id, v_user_id
  ) returning * into v_row;

  -- If room-bound and high priority, mark room out of order.
  if p_room_id is not null and p_priority in ('HIGH', 'URGENT', 'EMERGENCY') then
    update public.rooms set
      operational_status = 'OUT_OF_ORDER',
      version = version + 1
    where id = p_room_id and operational_status = 'ACTIVE';
  end if;

  perform app.audit('MAINTENANCE_REQUEST_CREATED', 'maintenance_request', v_row.id, null, to_jsonb(v_row), null, jsonb_build_object('category', p_category, 'room_id', p_room_id));

  return to_jsonb(v_row);
end;
$$;

-- ==================================================================
-- create_rate_plan (from 035_rate_plans_room_rates.sql, audit slot 6 normalized)
-- ==================================================================

create or replace function public.create_rate_plan(
  p_organization       uuid,
  p_property           uuid,
  p_code               text,
  p_name               text,
  p_description        text default null,
  p_meal_plan          text default 'ROOM_ONLY',
  p_inclusions         jsonb default '[]'::jsonb,
  p_currency           text default 'INR',
  p_is_default         boolean default false,
  p_notes              text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_row public.rate_plans%rowtype;
begin
  perform app.require_session(v_user_id, null);
  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'reservation.create');

  insert into public.rate_plans (
    organization_id, property_id, code, name, description,
    meal_plan, inclusions, currency, is_default, notes, created_by
  ) values (
    p_organization, p_property, p_code, p_name, p_description,
    p_meal_plan, p_inclusions, p_currency, p_is_default, p_notes, v_user_id
  ) returning * into v_row;

  perform app.audit('RATE_PLAN_CREATED', 'rate_plan', v_row.id, null, to_jsonb(v_row), null, jsonb_build_object('code', v_row.code, 'name', v_row.name));

  return to_jsonb(v_row);
end;
$$;

-- ==================================================================
-- create_reservation (from 036_reservations_rate_snapshots.sql, audit slot 6 normalized)
-- ==================================================================

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

  perform app.audit('RESERVATION_CREATED', 'reservation', v_row.id, null, to_jsonb(v_row), null, jsonb_build_object('reservation_number', v_row.reservation_number));

  return to_jsonb(v_row);
end;
$$;

-- ==================================================================
-- create_room (from 034_room_types_rooms_blocks.sql, audit slot 6 normalized)
-- ==================================================================

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

  perform app.audit('ROOM_CREATED', 'room', v_row.id, null, to_jsonb(v_row), null, jsonb_build_object('room_number', v_row.room_number));

  return to_jsonb(v_row);
end;
$$;

-- ==================================================================
-- create_room_block (from 034_room_types_rooms_blocks.sql, audit slot 6 normalized)
-- ==================================================================

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

  perform app.audit('ROOM_BLOCKED', 'room_block', v_row.id, null, to_jsonb(v_row), null, jsonb_build_object('room_id', v_row.room_id, 'block_type', v_row.block_type));

  return to_jsonb(v_row);
end;
$$;

-- ==================================================================
-- create_room_inspection (from 039_housekeeping_maintenance.sql, audit slot 6 normalized)
-- ==================================================================

create or replace function public.create_room_inspection(
  p_organization       uuid,
  p_property           uuid,
  p_room               uuid,
  p_checklist_id       uuid default null,
  p_housekeeping_task_id uuid default null,
  p_notes              text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_row public.room_inspections%rowtype;
begin
  perform app.require_session(v_user_id, null);
  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'housekeeping.inspection.create');

  insert into public.room_inspections (
    organization_id, property_id, room_id, checklist_id, housekeeping_task_id, notes, created_by
  ) values (
    p_organization, p_property, p_room, p_checklist_id, p_housekeeping_task_id, p_notes, v_user_id
  ) returning * into v_row;

  perform app.audit('ROOM_INSPECTION_CREATED', 'room_inspection', v_row.id, null, to_jsonb(v_row), null, jsonb_build_object('room_id', p_room));

  return to_jsonb(v_row);
end;
$$;

-- ==================================================================
-- create_room_type (from 034_room_types_rooms_blocks.sql, audit slot 6 normalized)
-- ==================================================================

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

  perform app.audit('ROOM_TYPE_CREATED', 'room_type', v_row.id, null, to_jsonb(v_row), null, jsonb_build_object('code', v_row.code, 'name', v_row.name));

  return to_jsonb(v_row);
end;
$$;

-- ==================================================================
-- extend_stay (from 037_stays_checkin_checkout.sql, audit slot 6 normalized)
-- ==================================================================

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

  perform app.audit('STAY_EXTENDED', 'stay', p_stay, to_jsonb(v_old), to_jsonb(v_row), null, jsonb_build_object('old_check_out', v_old.expected_check_out_at, 'new_check_out', p_new_check_out));

  return to_jsonb(v_row);
end;
$$;

-- ==================================================================
-- mark_no_show (from 036_reservations_rate_snapshots.sql, audit slot 6 normalized)
-- ==================================================================

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

  perform app.audit('RESERVATION_NO_SHOW', 'reservation', v_row.id, to_jsonb(v_old), to_jsonb(v_row), null, null);

  return to_jsonb(v_row);
end;
$$;

-- ==================================================================
-- move_room (from 037_stays_checkin_checkout.sql, audit slot 6 normalized)
-- ==================================================================

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

  perform app.audit('ROOM_MOVED', 'stay', p_stay, null, null, null, jsonb_build_object('from_room_id', v_old_room_id, 'to_room_id', p_new_room, 'reason', p_reason));

  return to_jsonb(v_stay);
end;
$$;

-- ==================================================================
-- put_maintenance_on_hold (from 039_housekeeping_maintenance.sql, audit slot 6 normalized)
-- ==================================================================

create or replace function public.put_maintenance_on_hold(
  p_request            uuid,
  p_organization       uuid,
  p_property           uuid,
  p_reason             text,
  p_expected_version   integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.maintenance_requests%rowtype;
  v_row public.maintenance_requests%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.maintenance_requests
  where id = p_request and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;
  if v_old.status <> 'IN_PROGRESS' then
    raise exception 'NIVAAS_INVALID_STATE_TRANSITION';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'maintenance.start');

  update public.maintenance_requests set
    status = 'ON_HOLD',
    notes = concat_ws('. ', v_old.notes, 'ON HOLD: ' || p_reason),
    version = version + 1
  where id = p_request
  returning * into v_row;

  perform app.audit('MAINTENANCE_REQUEST_ON_HOLD', 'maintenance_request', p_request, to_jsonb(v_old), to_jsonb(v_row), null, jsonb_build_object('reason', p_reason));

  return to_jsonb(v_row);
end;
$$;

-- ==================================================================
-- remove_room_block (from 034_room_types_rooms_blocks.sql, audit slot 6 normalized)
-- ==================================================================

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

  perform app.audit('ROOM_BLOCK_CANCELLED', 'room_block', p_block, to_jsonb(v_old), null, null, jsonb_build_object('room_id', v_old.room_id));
end;
$$;

-- ==================================================================
-- resolve_maintenance_request (from 039_housekeeping_maintenance.sql, audit slot 6 normalized)
-- ==================================================================

create or replace function public.resolve_maintenance_request(
  p_request            uuid,
  p_organization       uuid,
  p_property           uuid,
  p_resolution         text,
  p_expected_version   integer,
  p_actual_cost        numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.maintenance_requests%rowtype;
  v_row public.maintenance_requests%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.maintenance_requests
  where id = p_request and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;
  if v_old.status <> 'IN_PROGRESS' then
    raise exception 'NIVAAS_INVALID_STATE_TRANSITION';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'maintenance.resolve');

  update public.maintenance_requests set
    status = 'RESOLVED',
    resolution = p_resolution,
    actual_cost = coalesce(p_actual_cost, v_old.actual_cost),
    resolved_at = now(),
    resolved_by = v_user_id,
    version = version + 1
  where id = p_request
  returning * into v_row;

  perform app.audit('MAINTENANCE_REQUEST_RESOLVED', 'maintenance_request', p_request, to_jsonb(v_old), to_jsonb(v_row), null, jsonb_build_object('room_id', v_row.room_id));

  return to_jsonb(v_row);
end;
$$;

-- ==================================================================
-- return_lost_found_item (from 039_housekeeping_maintenance.sql, audit slot 6 normalized)
-- ==================================================================

create or replace function public.return_lost_found_item(
  p_item               uuid,
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
  v_old public.lost_found_items%rowtype;
  v_row public.lost_found_items%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.lost_found_items
  where id = p_item and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'lost_found.return');

  update public.lost_found_items set
    status = 'RETURNED',
    returned_at = now(),
    returned_to = v_user_id,
    version = version + 1
  where id = p_item
  returning * into v_row;

  perform app.audit('LOST_FOUND_ITEM_RETURNED', 'lost_found_item', p_item, to_jsonb(v_old), to_jsonb(v_row), null, jsonb_build_object('guest_id', v_row.guest_id));

  return to_jsonb(v_row);
end;
$$;

-- ==================================================================
-- set_room_housekeeping_status (from 034_room_types_rooms_blocks.sql, audit slot 6 normalized)
-- ==================================================================

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

  perform app.audit('ROOM_HOUSEKEEPING_STATUS_CHANGED', 'room', v_row.id, to_jsonb(v_old), to_jsonb(v_row), null, jsonb_build_object('old_status', v_old.housekeeping_status, 'new_status', v_row.housekeeping_status));

  return to_jsonb(v_row);
end;
$$;

-- ==================================================================
-- set_room_operational_status (from 034_room_types_rooms_blocks.sql, audit slot 6 normalized)
-- ==================================================================

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

  perform app.audit('ROOM_OPERATIONAL_STATUS_CHANGED', 'room', v_row.id, to_jsonb(v_old), to_jsonb(v_row), null, jsonb_build_object('old_status', v_old.operational_status, 'new_status', v_row.operational_status));

  return to_jsonb(v_row);
end;
$$;

-- ==================================================================
-- start_housekeeping_task (from 039_housekeeping_maintenance.sql, audit slot 6 normalized)
-- ==================================================================

create or replace function public.start_housekeeping_task(
  p_task               uuid,
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
  v_old public.housekeeping_tasks%rowtype;
  v_row public.housekeeping_tasks%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.housekeeping_tasks
  where id = p_task and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;
  if v_old.status <> 'ASSIGNED' then
    raise exception 'NIVAAS_INVALID_STATE_TRANSITION';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'housekeeping.task.start');

  update public.housekeeping_tasks set
    status = 'IN_PROGRESS',
    started_at = now(),
    version = version + 1
  where id = p_task
  returning * into v_row;

  perform app.audit('HOUSEKEEPING_TASK_STARTED', 'housekeeping_task', p_task, to_jsonb(v_old), to_jsonb(v_row), null, jsonb_build_object('room_id', v_row.room_id));

  return to_jsonb(v_row);
end;
$$;

-- ==================================================================
-- start_maintenance_request (from 039_housekeeping_maintenance.sql, audit slot 6 normalized)
-- ==================================================================

create or replace function public.start_maintenance_request(
  p_request            uuid,
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
  v_old public.maintenance_requests%rowtype;
  v_row public.maintenance_requests%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.maintenance_requests
  where id = p_request and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;
  if v_old.status not in ('ASSIGNED', 'ON_HOLD') then
    raise exception 'NIVAAS_INVALID_STATE_TRANSITION';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'maintenance.start');

  update public.maintenance_requests set
    status = 'IN_PROGRESS',
    started_at = coalesce(v_old.started_at, now()),
    version = version + 1
  where id = p_request
  returning * into v_row;

  perform app.audit('MAINTENANCE_REQUEST_STARTED', 'maintenance_request', p_request, to_jsonb(v_old), to_jsonb(v_row), null, jsonb_build_object('room_id', v_row.room_id));

  return to_jsonb(v_row);
end;
$$;

-- ==================================================================
-- update_asset (from 039_housekeeping_maintenance.sql, audit slot 6 normalized)
-- ==================================================================

create or replace function public.update_asset(
  p_asset              uuid,
  p_organization       uuid,
  p_property           uuid,
  p_expected_version   integer,
  p_name               text default null,
  p_category           text default null,
  p_room_id            uuid default null,
  p_location_description text default null,
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
  v_old public.assets%rowtype;
  v_row public.assets%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.assets
  where id = p_asset and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'asset.edit');

  update public.assets set
    name = coalesce(p_name, v_old.name),
    category = coalesce(p_category, v_old.category),
    room_id = coalesce(p_room_id, v_old.room_id),
    location_description = coalesce(p_location_description, v_old.location_description),
    status = coalesce(p_status, v_old.status),
    notes = coalesce(p_notes, v_old.notes),
    version = version + 1
  where id = p_asset
  returning * into v_row;

  perform app.audit('ASSET_UPDATED', 'asset', p_asset, to_jsonb(v_old), to_jsonb(v_row), null, jsonb_build_object('version', v_row.version));

  return to_jsonb(v_row);
end;
$$;

-- ==================================================================
-- update_rate_plan (from 035_rate_plans_room_rates.sql, audit slot 6 normalized)
-- ==================================================================

create or replace function public.update_rate_plan(
  p_rate_plan          uuid,
  p_organization       uuid,
  p_property           uuid,
  p_expected_version   integer,
  p_name               text default null,
  p_description        text default null,
  p_meal_plan          text default null,
  p_inclusions         jsonb default null,
  p_currency           text default null,
  p_is_default         boolean default null,
  p_notes              text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.rate_plans%rowtype;
  v_row public.rate_plans%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.rate_plans
  where id = p_rate_plan and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'reservation.edit');

  update public.rate_plans set
    name = coalesce(p_name, v_old.name),
    description = coalesce(p_description, v_old.description),
    meal_plan = coalesce(p_meal_plan, v_old.meal_plan),
    inclusions = coalesce(p_inclusions, v_old.inclusions),
    currency = coalesce(p_currency, v_old.currency),
    is_default = coalesce(p_is_default, v_old.is_default),
    notes = coalesce(p_notes, v_old.notes),
    version = version + 1
  where id = p_rate_plan returning * into v_row;

  perform app.audit('RATE_PLAN_UPDATED', 'rate_plan', v_row.id, to_jsonb(v_old), to_jsonb(v_row), null, jsonb_build_object('version', v_row.version));

  return to_jsonb(v_row);
end;
$$;

-- ==================================================================
-- update_reservation (from 036_reservations_rate_snapshots.sql, audit slot 6 normalized)
-- ==================================================================

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

  perform app.audit('RESERVATION_UPDATED', 'reservation', v_row.id, to_jsonb(v_old), to_jsonb(v_row), null, jsonb_build_object('version', v_row.version));

  return to_jsonb(v_row);
end;
$$;

-- ==================================================================
-- update_room (from 034_room_types_rooms_blocks.sql, audit slot 6 normalized)
-- ==================================================================

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

  perform app.audit('ROOM_UPDATED', 'room', v_row.id, to_jsonb(v_old), to_jsonb(v_row), null, jsonb_build_object('version', v_row.version));

  return to_jsonb(v_row);
end;
$$;

-- ==================================================================
-- update_room_block (from 034_room_types_rooms_blocks.sql, audit slot 6 normalized)
-- ==================================================================

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

  perform app.audit('ROOM_BLOCK_UPDATED', 'room_block', v_row.id, null, to_jsonb(v_row), null, jsonb_build_object('status', v_row.status));

  return to_jsonb(v_row);
end;
$$;

-- ==================================================================
-- update_room_type (from 034_room_types_rooms_blocks.sql, audit slot 6 normalized)
-- ==================================================================

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

  perform app.audit('ROOM_TYPE_UPDATED', 'room_type', v_row.id, to_jsonb(v_old), to_jsonb(v_row), null, jsonb_build_object('version', v_row.version));

  return to_jsonb(v_row);
end;
$$;

-- ==================================================================
-- upsert_room_rate (from 035_rate_plans_room_rates.sql, audit slot 6 normalized)
-- ==================================================================

create or replace function public.upsert_room_rate(
  p_organization       uuid,
  p_property           uuid,
  p_rate_plan          uuid,
  p_room_type          uuid,
  p_rate_date          date,
  p_base_rate          numeric,
  p_extra_adult_rate   numeric default null,
  p_extra_child_rate   numeric default null,
  p_single_occupancy_rate numeric default null,
  p_double_occupancy_rate numeric default null,
  p_minimum_stay       integer default null,
  p_maximum_stay       integer default null,
  p_closed_to_arrival  boolean default false,
  p_closed_to_departure boolean default false,
  p_notes              text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_row public.room_rates%rowtype;
  v_is_update boolean;
begin
  perform app.require_session(v_user_id, null);
  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'reservation.create');

  select exists(
    select 1 from public.room_rates
    where rate_plan_id = p_rate_plan
      and room_type_id = p_room_type
      and rate_date = p_rate_date
  ) into v_is_update;

  insert into public.room_rates (
    organization_id, property_id, rate_plan_id, room_type_id, rate_date,
    base_rate, extra_adult_rate, extra_child_rate,
    single_occupancy_rate, double_occupancy_rate,
    minimum_stay, maximum_stay, closed_to_arrival, closed_to_departure,
    notes, created_by
  ) values (
    p_organization, p_property, p_rate_plan, p_room_type, p_rate_date,
    p_base_rate, p_extra_adult_rate, p_extra_child_rate,
    p_single_occupancy_rate, p_double_occupancy_rate,
    p_minimum_stay, p_maximum_stay, p_closed_to_arrival, p_closed_to_departure,
    p_notes, v_user_id
  )
  on conflict (rate_plan_id, room_type_id, rate_date)
  do update set
    base_rate = excluded.base_rate,
    extra_adult_rate = excluded.extra_adult_rate,
    extra_child_rate = excluded.extra_child_rate,
    single_occupancy_rate = excluded.single_occupancy_rate,
    double_occupancy_rate = excluded.double_occupancy_rate,
    minimum_stay = excluded.minimum_stay,
    maximum_stay = excluded.maximum_stay,
    closed_to_arrival = excluded.closed_to_arrival,
    closed_to_departure = excluded.closed_to_departure,
    notes = excluded.notes
  returning * into v_row;

  perform app.audit(case when v_is_update then 'ROOM_RATE_UPDATED' else 'ROOM_RATE_CREATED' end, 'room_rate', v_row.id, null, to_jsonb(v_row), null, jsonb_build_object('rate_date', v_row.rate_date, 'base_rate', v_row.base_rate));

  return to_jsonb(v_row);
end;
$$;

-- ==================================================================
-- verify_housekeeping_task (from 039_housekeeping_maintenance.sql, audit slot 6 normalized)
-- ==================================================================

create or replace function public.verify_housekeeping_task(
  p_task               uuid,
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
  v_old public.housekeeping_tasks%rowtype;
  v_row public.housekeeping_tasks%rowtype;
  v_room public.rooms%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.housekeeping_tasks
  where id = p_task and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;
  if v_old.status <> 'COMPLETED' then
    raise exception 'NIVAAS_INVALID_STATE_TRANSITION';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'housekeeping.task.verify');

  update public.housekeeping_tasks set
    status = 'VERIFIED',
    verified_at = now(),
    verified_by = v_user_id,
    version = version + 1
  where id = p_task
  returning * into v_row;

  -- For checkout clean, mark room as INSPECTED (sellable).
  if v_row.task_type = 'CHECKOUT_CLEAN' then
    select * into v_room from public.rooms where id = v_row.room_id;
    if v_room.housekeeping_status = 'VACANT_CLEAN' then
      update public.rooms set
        housekeeping_status = 'INSPECTED',
        version = version + 1
      where id = v_row.room_id;
    end if;
  end if;

  perform app.audit('HOUSEKEEPING_TASK_VERIFIED', 'housekeeping_task', p_task, to_jsonb(v_old), to_jsonb(v_row), null, jsonb_build_object('room_id', v_row.room_id));

  return to_jsonb(v_row);
end;
$$;

-- ==================================================================
-- verify_maintenance_request (from 039_housekeeping_maintenance.sql, audit slot 6 normalized)
-- ==================================================================

create or replace function public.verify_maintenance_request(
  p_request            uuid,
  p_organization       uuid,
  p_property           uuid,
  p_expected_version   integer,
  p_verification_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.maintenance_requests%rowtype;
  v_row public.maintenance_requests%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.maintenance_requests
  where id = p_request and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;
  if v_old.status <> 'RESOLVED' then
    raise exception 'NIVAAS_INVALID_STATE_TRANSITION';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'maintenance.verify');

  update public.maintenance_requests set
    status = 'VERIFIED',
    verified_at = now(),
    verified_by = v_user_id,
    verification_notes = coalesce(p_verification_notes, v_old.verification_notes),
    version = version + 1
  where id = p_request
  returning * into v_row;

  perform app.audit('MAINTENANCE_REQUEST_VERIFIED', 'maintenance_request', p_request, to_jsonb(v_old), to_jsonb(v_row), null, jsonb_build_object('room_id', v_row.room_id));

  return to_jsonb(v_row);
end;
$$;

-- Transcription guard: every re-created door must exist and the canonical
-- overload must still be the ONLY seven-argument row-image shape.
do $$
begin
  if (select count(*) from pg_proc
       where pronamespace = 'public'::regnamespace
         and proname in ('add_stay_guest', 'archive_rate_plan', 'archive_room', 'archive_room_type', 'assign_housekeeping_task', 'assign_maintenance_request', 'assign_room', 'bulk_upsert_room_rates', 'cancel_housekeeping_task', 'cancel_maintenance_request', 'cancel_reservation', 'check_in', 'check_out', 'close_maintenance_request', 'complete_housekeeping_task', 'complete_room_inspection', 'confirm_reservation', 'create_asset', 'create_housekeeping_task', 'create_lost_found_item', 'create_maintenance_request', 'create_rate_plan', 'create_reservation', 'create_room', 'create_room_block', 'create_room_inspection', 'create_room_type', 'extend_stay', 'mark_no_show', 'move_room', 'put_maintenance_on_hold', 'remove_room_block', 'resolve_maintenance_request', 'return_lost_found_item', 'set_room_housekeeping_status', 'set_room_operational_status', 'start_housekeeping_task', 'start_maintenance_request', 'update_asset', 'update_rate_plan', 'update_reservation', 'update_room', 'update_room_block', 'update_room_type', 'upsert_room_rate', 'verify_housekeeping_task', 'verify_maintenance_request')
      ) <> 47 then
    raise exception 'HOTEL_DOORS_MISSING';
  end if;
  if (select count(*) from pg_proc
       where pronamespace = 'app'::regnamespace
         and proname = 'audit'
         and proargtypes::text = '25 25 2950 3802 3802 25 3802'
      ) <> 1 then
    raise exception 'AUDIT_OVERLOAD_SHAPE_CHANGED';
  end if;
end
$$;
