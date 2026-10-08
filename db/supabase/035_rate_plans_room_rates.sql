-- AMRUT NIVAAS · 035 — rate plans & room rates (Prompt #08 §24-§25)
--
-- Rate plans define the commercial terms (meal plan, inclusions).
-- Room rates are date-aware: one row per (rate_plan, room_type, date).
-- Historical rates are preserved — never overwrite, always insert new rows.
--
-- Key invariants:
--   - Rate plans are property-scoped.
--   - Room rates are date-specific: a rate plan may have different rates for
--     different dates (seasonal, weekend, etc.).
--   - Once a rate is posted for a past date, it must not be changed.
--   - Rate snapshots (in reservations) preserve the agreed rate at booking time.

set local search_path = '';

-- =================================================================== rate plans

create table if not exists public.rate_plans (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  property_id          uuid not null references public.properties(id) on delete restrict,
  code                 text not null,
  name                 text not null,
  description          text,
  meal_plan            text not null default 'ROOM_ONLY',
  inclusions           jsonb not null default '[]'::jsonb,
  currency             text not null default 'INR',
  status               text not null default 'ACTIVE',
  is_default           boolean not null default false,
  notes                text,
  version              integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  archived_at          timestamptz,
  created_by           uuid,

  constraint rate_plans_code_not_blank check (btrim(code) <> ''),
  constraint rate_plans_name_not_blank check (btrim(name) <> ''),
  constraint rate_plans_meal_plan_ok check (meal_plan in (
    'ROOM_ONLY', 'BREAKFAST_INCLUDED', 'HALF_BOARD', 'FULL_BOARD',
    'ALL_INCLUSIVE', 'MODIFIED_AMERICAN', 'EUROPEAN', 'BERMUDA', 'OTHER'
  )),
  constraint rate_plans_status_ok check (status in ('ACTIVE', 'INACTIVE', 'ARCHIVED'))
);

comment on table public.rate_plans is
  'Rate plan master. Property-scoped. Defines meal plan and inclusions.';

-- inclusions JSONB structure:
-- [{"type": "BREAKFAST", "description": "Continental breakfast"}, {"type": "PARKING", "description": "Complimentary parking"}]

drop index if exists public.rate_plans_code_property_idx;
create unique index rate_plans_code_property_idx
  on public.rate_plans (property_id, lower(code))
  where archived_at is null;

create index if not exists rate_plans_property_idx
  on public.rate_plans (property_id);

create index if not exists rate_plans_org_idx
  on public.rate_plans (organization_id);

drop trigger if exists rate_plans_touch on public.rate_plans;
create trigger rate_plans_touch before update on public.rate_plans
  for each row execute function app.touch_updated_at();

drop policy if exists rate_plans_read on public.rate_plans;
create policy rate_plans_read on public.rate_plans
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists rate_plans_no_write on public.rate_plans;
create policy rate_plans_no_write on public.rate_plans
  for all to authenticated
  using (false);

-- =================================================================== room rates

-- Date-aware rates: one row per (rate_plan, room_type, date).
-- This allows seasonal pricing, weekend rates, etc.
-- Historical rates are preserved — once a date has passed, the rate is locked.
create table if not exists public.room_rates (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  property_id          uuid not null references public.properties(id) on delete restrict,
  rate_plan_id         uuid not null references public.rate_plans(id) on delete restrict,
  room_type_id         uuid not null references public.room_types(id) on delete restrict,
  rate_date            date not null,
  base_rate            numeric not null,
  extra_adult_rate     numeric,
  extra_child_rate     numeric,
  single_occupancy_rate numeric,
  double_occupancy_rate numeric,
  minimum_stay         integer,
  maximum_stay         integer,
  closed_to_arrival    boolean not null default false,
  closed_to_departure  boolean not null default false,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid,

  constraint room_rates_base_rate_positive check (base_rate >= 0),
  constraint room_rates_extra_adult_positive check (extra_adult_rate is null or extra_adult_rate >= 0),
  constraint room_rates_extra_child_positive check (extra_child_rate is null or extra_child_rate >= 0),
  constraint room_rates_single_positive check (single_occupancy_rate is null or single_occupancy_rate >= 0),
  constraint room_rates_double_positive check (double_occupancy_rate is null or double_occupancy_rate >= 0),
  constraint room_rates_min_stay_positive check (minimum_stay is null or minimum_stay > 0),
  constraint room_rates_max_stay_positive check (maximum_stay is null or maximum_stay > 0)
);

comment on table public.room_rates is
  'Date-aware room rates. One row per (rate_plan, room_type, date). Historical rates preserved.';

-- Unique rate per (rate_plan, room_type, date).
drop index if exists public.room_rates_unique_idx;
create unique index room_rates_unique_idx
  on public.room_rates (rate_plan_id, room_type_id, rate_date);

create index if not exists room_rates_date_idx
  on public.room_rates (property_id, rate_date);

create index if not exists room_rates_room_type_idx
  on public.room_rates (room_type_id);

create index if not exists room_rates_org_idx
  on public.room_rates (organization_id);

drop trigger if exists room_rates_touch on public.room_rates;
create trigger room_rates_touch before update on public.room_rates
  for each row execute function app.touch_updated_at();

drop policy if exists room_rates_read on public.room_rates;
create policy room_rates_read on public.room_rates
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists room_rates_no_write on public.room_rates;
create policy room_rates_no_write on public.room_rates
  for all to authenticated
  using (false);

-- =================================================================== doors

-- create_rate_plan
drop function if exists public.create_rate_plan(uuid, uuid, text, text, text, text, jsonb, text, boolean, text);
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

  perform app.audit(
    'RATE_PLAN_CREATED', 'rate_plan', v_row.id,
    null, to_jsonb(v_row),
    p_property, jsonb_build_object('code', v_row.code, 'name', v_row.name)
  );

  return to_jsonb(v_row);
end;
$$;

-- update_rate_plan
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

  perform app.audit(
    'RATE_PLAN_UPDATED', 'rate_plan', v_row.id,
    to_jsonb(v_old), to_jsonb(v_row),
    p_property, jsonb_build_object('version', v_row.version)
  );

  return to_jsonb(v_row);
end;
$$;

-- archive_rate_plan
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

  perform app.audit(
    'RATE_PLAN_ARCHIVED', 'rate_plan', p_rate_plan,
    to_jsonb(v_old), null,
    p_property, jsonb_build_object('version', v_old.version + 1)
  );
end;
$$;

-- upsert_room_rate
-- Inserts or updates a room rate for a specific date.
-- IMPORTANT: Past dates should not be modified (enforced at application layer).
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

  perform app.audit(
    case when v_is_update then 'ROOM_RATE_UPDATED' else 'ROOM_RATE_CREATED' end,
    'room_rate', v_row.id,
    null, to_jsonb(v_row),
    p_property, jsonb_build_object('rate_date', v_row.rate_date, 'base_rate', v_row.base_rate)
  );

  return to_jsonb(v_row);
end;
$$;

-- bulk_upsert_room_rates
-- Upsert rates for a date range. Useful for seasonal rate updates.
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

  perform app.audit(
    'ROOM_RATES_BULK_UPSERTED', 'room_rate', null,
    null, null,
    p_property, jsonb_build_object(
      'rate_plan_id', p_rate_plan,
      'room_type_id', p_room_type,
      'start_date', p_start_date,
      'end_date', p_end_date,
      'count', v_count
    )
  );

  return v_count;
end;
$$;

-- =================================================================== grants

grant execute on function public.create_rate_plan to authenticated;
grant execute on function public.update_rate_plan to authenticated;
grant execute on function public.archive_rate_plan to authenticated;
grant execute on function public.upsert_room_rate to authenticated;
grant execute on function public.bulk_upsert_room_rates to authenticated;
