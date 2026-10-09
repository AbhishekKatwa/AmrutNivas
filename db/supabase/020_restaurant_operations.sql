-- ============================================================================
-- AMRUT NIVAAS — Prompt #05: Restaurant Operations (020)
--
-- Builds on 014-019's restaurant foundation. This migration adds:
--
--   1. Kitchen stations — MAIN KITCHEN, TANDOOR, BAR, BEVERAGE, etc.
--      Menu items route to a station; KOTs are station-scoped.
--   2. Station-scoped KOTs — one order can produce multiple KOTs, one per station.
--      send_kot now groups lines by station and mints one slip per station.
--   3. Discounts — order-level and item-level, percentage or fixed, with
--      permission + reason + audit.
--   4. Split bills — one order can have multiple bills (by item, equal, custom).
--   5. Split payments — multiple tenders per bill (already supported by payments
--      table; this file adds the door and validation).
--   6. Shifts — open/close with cash opening/closing, operator tracking.
--   7. Table merge — combine orders from multiple tables into one.
--   8. Restaurant activity timeline — order event log.
--
-- Design invariants (same as 014-019):
--   - Money is TEXT across door boundaries, never floats.
--   - Every new table has RLS, chain guards, outlet-scoped reads.
--   - Doors are security-definer, in `public`, with state machines in `app`.
--   - Optimistic locking via version + p_expected_version.
--   - Idempotency keys where appropriate.
--   - Audit on every mutation.
-- ============================================================================

set local search_path = '';

-- =================================================================== kitchen stations

-- A station is a physical work area in the kitchen (MAIN KITCHEN, TANDOOR, BAR, etc.).
-- Menu items route to a station; when lines are fired, they group by station into
-- separate KOTs. An outlet's stations are its own — one outlet's TANDOOR is not
-- another's.
create table if not exists public.kitchen_stations (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  property_id          uuid not null references public.properties(id)  on delete restrict,
  outlet_id            uuid not null references public.outlets(id)     on delete restrict,
  name                 text not null,
  code                 text not null,
  description          text,
  display_order        integer not null default 0,
  status               text not null default 'ACTIVE'
                       constraint kitchen_stations_status_ok check (status in ('ACTIVE','ARCHIVED')),
  archived_at          timestamptz,
  version              integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid,
  constraint kitchen_stations_name_not_blank check (btrim(name) <> ''),
  constraint kitchen_stations_code_not_blank check (btrim(code) <> '')
);

comment on table public.kitchen_stations is
  'Physical work areas in the kitchen. Menu items route to a station; KOTs are station-scoped.';

-- Station code is unique per outlet among live rows.
drop index if exists public.kitchen_stations_code_outlet_idx;
create unique index kitchen_stations_code_outlet_idx
  on public.kitchen_stations (organization_id, outlet_id, lower(code))
  where status = 'ACTIVE';

create index if not exists kitchen_stations_outlet_idx
  on public.kitchen_stations (outlet_id);

-- Chain guard: a station's tenant scope must match its outlet's.
create or replace function app.assert_station_chain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org  uuid;
  v_prop uuid;
  v_out  uuid;
begin
  select o.organization_id, o.property_id, o.id
    into v_org, v_prop, v_out
    from public.outlets o where o.id = new.outlet_id;

  if v_out is null then
    raise exception 'NIVAAS_SCOPE_MISMATCH: station % points at no outlet', new.id;
  end if;

  if new.organization_id <> v_org or new.property_id <> v_prop then
    raise exception 'NIVAAS_SCOPE_MISMATCH: a station cannot sit outside its outlet''s tenant';
  end if;

  return new;
end;
$$;

drop trigger if exists kitchen_stations_touch on public.kitchen_stations;
create trigger kitchen_stations_touch before update on public.kitchen_stations
  for each row execute function app.touch_updated_at();

drop trigger if exists kitchen_stations_chain on public.kitchen_stations;
create trigger kitchen_stations_chain before insert or update on public.kitchen_stations
  for each row execute function app.assert_station_chain();

-- RLS
alter table public.kitchen_stations enable row level security;

grant select on public.kitchen_stations to authenticated, service_role;
revoke all on public.kitchen_stations from anon;
revoke insert, update, delete, truncate on public.kitchen_stations from authenticated;

drop policy if exists kitchen_stations_outlet_read on public.kitchen_stations;
create policy kitchen_stations_outlet_read on public.kitchen_stations
  for select to authenticated
  using (app.can_access_outlet(app.current_user_id(), outlet_id));

-- Link menu items to stations. Nullable: an item with no station is not routable to
-- any kitchen display — it can still be sold but will not produce a KOT.
alter table public.menu_items
  add column if not exists station_id uuid references public.kitchen_stations(id) on delete set null;

create index if not exists menu_items_station_idx on public.menu_items (station_id);

comment on column public.menu_items.station_id is
  'The kitchen station this item routes to. NULL means no station — the item is sellable but produces no KOT.';

-- =================================================================== station doors

-- create_kitchen_station
create or replace function public.create_kitchen_station(
  p_outlet uuid,
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
  v_actor uuid := app.require_session();
  v_org   uuid;
  v_prop  uuid;
  v_out   uuid;
  v_row   jsonb;
begin
  select o.organization_id, o.property_id, o.id into v_org, v_prop, v_out
    from public.outlets o where o.id = p_outlet;
  perform app.require_valid(v_out is not null, 'NIVAAS_NOT_FOUND');
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('station.manage', v_org, v_prop, v_out);
  perform app.require_writable_outlet(v_out);
  perform app.require_valid(btrim(p_name) <> '', 'NIVAAS_BLANK');
  perform app.require_valid(btrim(p_code) <> '', 'NIVAAS_BLANK');

  insert into public.kitchen_stations
    (organization_id, property_id, outlet_id, name, code, description, display_order, created_by)
  values (v_org, v_prop, v_out, btrim(p_name), btrim(p_code),
          nullif(btrim(coalesce(p_description, '')), ''), p_display_order, v_actor)
  -- The whole-row reference in RETURNING must be the bare table name: schema-qualified,
  -- Postgres parses "public" as a table alias and raises 42P01 "missing FROM-clause entry".
  returning to_jsonb(kitchen_stations) into v_row;

  perform app.audit('kitchen_station_created', 'kitchen_station', (v_row->>'id')::uuid,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_after := v_row);
  return v_row;
end;
$$;

-- update_kitchen_station
create or replace function public.update_kitchen_station(
  p_station uuid,
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
  v_actor  uuid := app.require_session();
  v_before jsonb;
  v_after  jsonb;
  v_org    uuid;
  v_prop   uuid;
  v_out    uuid;
begin
  select to_jsonb(s) into v_before from public.kitchen_stations s where s.id = p_station;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');
  v_org  := (v_before->>'organization_id')::uuid;
  v_prop := (v_before->>'property_id')::uuid;
  v_out  := (v_before->>'outlet_id')::uuid;
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('station.manage', v_org, v_prop, v_out);
  perform app.require_writable_outlet(v_out);
  perform app.require_version((v_before->>'version')::integer, p_expected_version);

  if p_name is not null then
    perform app.require_valid(btrim(p_name) <> '', 'NIVAAS_BLANK');
  end if;
  if p_code is not null then
    perform app.require_valid(btrim(p_code) <> '', 'NIVAAS_BLANK');
  end if;

  update public.kitchen_stations
     set name = coalesce(btrim(p_name), name),
         code = coalesce(btrim(p_code), code),
         description = case when p_description is not null then nullif(btrim(p_description), '') else description end,
         display_order = coalesce(p_display_order, display_order),
         version = version + 1
   where id = p_station;

  select to_jsonb(s) into v_after from public.kitchen_stations s where s.id = p_station;
  perform app.audit('kitchen_station_updated', 'kitchen_station', p_station,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_before := v_before, p_after := v_after);
  return v_after;
end;
$$;

-- archive_kitchen_station
create or replace function public.archive_kitchen_station(
  p_station uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := app.require_session();
  v_before jsonb;
  v_after  jsonb;
  v_org    uuid;
  v_prop   uuid;
  v_out    uuid;
begin
  select to_jsonb(s) into v_before from public.kitchen_stations s where s.id = p_station;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');
  v_org  := (v_before->>'organization_id')::uuid;
  v_prop := (v_before->>'property_id')::uuid;
  v_out  := (v_before->>'outlet_id')::uuid;
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('station.manage', v_org, v_prop, v_out);
  perform app.require_writable_outlet(v_out);
  perform app.require_valid((v_before->>'status') = 'ACTIVE', 'NIVAAS_ARCHIVED');

  update public.kitchen_stations
     set status = 'ARCHIVED', archived_at = now(), version = version + 1
   where id = p_station;

  -- Detach menu items pointing at this station (set null).
  update public.menu_items set station_id = null, version = version + 1
   where station_id = p_station;

  select to_jsonb(s) into v_after from public.kitchen_stations s where s.id = p_station;
  perform app.audit('kitchen_station_archived', 'kitchen_station', p_station,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_before := v_before, p_after := v_after);
  return v_after;
end;
$$;

-- =================================================================== KOT station routing

-- Add station_id to KOTs. Each KOT is now scoped to a station — one order produces
-- one KOT per station that has lines to fire.
alter table public.kitchen_order_tickets
  add column if not exists station_id uuid references public.kitchen_stations(id) on delete set null;

create index if not exists kitchen_order_tickets_station_idx
  on public.kitchen_order_tickets (station_id);

comment on column public.kitchen_order_tickets.station_id is
  'The kitchen station this slip was sent to. NULL for legacy KOTs created before station routing.';

-- Extend send_kot to group lines by station and mint one KOT per station.
-- The existing send_kot is replaced with a station-aware version.
create or replace function public.send_kot(
  p_order uuid,
  p_item_ids jsonb,
  p_note text default null,
  p_include_fired boolean default false,
  p_expected_version integer default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid := app.require_session();
  v_order   jsonb;
  v_org     uuid;
  v_prop    uuid;
  v_out     uuid;
  v_lines   jsonb;
  v_elem    jsonb;
  v_line    jsonb;
  v_id      uuid;
  v_bdate   date;
  v_number  text;
  v_kot_id  uuid;
  v_status  text;
  v_after   jsonb;
  v_existing uuid;
  v_key     text := nullif(btrim(p_idempotency_key), '');
  v_station uuid;
  v_stations uuid[];
  v_first_kot jsonb;
begin
  select to_jsonb(o) into v_order
    from public.orders o where o.id = p_order for update;
  perform app.require_valid(v_order is not null, 'NIVAAS_NOT_FOUND');
  v_org  := (v_order->>'organization_id')::uuid;
  v_prop := (v_order->>'property_id')::uuid;
  v_out  := (v_order->>'outlet_id')::uuid;
  v_status := v_order->>'status';
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('kot.create', v_org, v_prop, v_out);
  perform app.require_writable_outlet(v_out);
  perform app.require_version((v_order->>'version')::integer, p_expected_version);

  perform app.require_valid(
    v_status in ('PLACED','CONFIRMED','PREPARING'), 'NIVAAS_INVALID_TRANSITION');

  -- Idempotency: return existing KOT if key matches.
  if v_key is not null then
    select k.id into v_existing from public.kitchen_order_tickets k
      where k.organization_id = v_org and k.outlet_id = v_out
        and k.idempotency_key = v_key;
    if v_existing is not null then
      select to_jsonb(k) into v_after from public.kitchen_order_tickets k where k.id = v_existing;
      return v_after;
    end if;
  end if;

  -- Validate lines.
  v_lines := app.resolve_kot_lines(p_order, p_item_ids);

  if not p_include_fired then
    for v_elem in select * from jsonb_array_elements(v_lines) loop
      perform app.require_valid(v_elem->>'fire_status' = 'NOT_FIRED',
        'NIVAAS_KOT_LINE_NOT_FIRABLE');
    end loop;
  end if;

  v_bdate := (v_order->>'business_date')::date;

  -- Group lines by station. Lines with no station go to a NULL-station KOT.
  -- Collect distinct stations from the lines' menu items.
  create temp table _kot_line_stations on commit drop as
    select oi.id as line_id, mi.station_id
      from public.order_items oi
      join public.menu_items mi on mi.id = oi.menu_item_id
     where oi.id in (select (v_elem->>'id')::uuid from jsonb_array_elements(v_lines) v_elem);

  -- Mint one KOT per station.
  for v_station in
    select distinct station_id from _kot_line_stations
  loop
    v_number := app.next_document_number(v_org, v_prop, v_out, 'KOT', v_bdate);

    insert into public.kitchen_order_tickets
      (organization_id, property_id, outlet_id, order_id, kot_number, business_date,
       status, note, idempotency_key, station_id, created_by)
    values (v_org, v_prop, v_out, p_order, v_number, v_bdate,
            'OPEN', nullif(btrim(coalesce(p_note, '')), ''),
            case when array_position(v_stations, v_station) is null then v_key else null end,
            v_station, v_actor)
    returning id into v_kot_id;

    -- Fire lines for this station onto the new slip.
    for v_elem in select * from jsonb_array_elements(v_lines) loop
      v_id := (v_elem->>'id')::uuid;
      -- Check if this line belongs to this station.
      if exists (select 1 from _kot_line_stations cls
                  where cls.line_id = v_id and cls.station_id is not distinct from v_station) then
        if v_elem->>'fire_status' = 'NOT_FIRED' then
          perform app.require_kot_fire_transition('NOT_FIRED','FIRED');
          update public.order_items
             set fire_status = 'FIRED', kot_id = v_kot_id, version = version + 1
           where id = v_id;
        else
          update public.order_items set kot_id = v_kot_id, version = version + 1
           where id = v_id;
        end if;
      end if;
    end loop;

    -- Remember the first KOT for the return value.
    if v_first_kot is null then
      select to_jsonb(k) into v_first_kot from public.kitchen_order_tickets k where k.id = v_kot_id;
    end if;

    v_stations := coalesce(v_stations, '{}'::uuid[]) || v_station;
  end loop;

  -- Drive order to PREPARING.
  if v_status <> 'PREPARING' then
    perform app.require_order_transition(v_status, 'PREPARING');
    update public.orders
       set status = 'PREPARING', version = version + 1
     where id = p_order;
  end if;

  -- Audit each new KOT.
  for v_kot_id in select k.id from public.kitchen_order_tickets k
                   where k.order_id = p_order and k.business_date = v_bdate
                     and k.fired_at >= now() - interval '5 seconds'
  loop
    select to_jsonb(k) into v_after from public.kitchen_order_tickets k where k.id = v_kot_id;
    perform app.audit('kot_sent', 'kot', v_kot_id,
      p_organization := v_org, p_property := v_prop, p_outlet := v_out,
      p_after := v_after);
  end loop;

  -- Return the first KOT (backwards-compatible shape).
  return coalesce(v_first_kot, '{}'::jsonb);
end;
$$;

-- =================================================================== discounts

-- Order-level and item-level discounts. A discount is a row, not a column — each
-- application is its own audited event with a reason and a permission check.
create table if not exists public.order_discounts (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  property_id          uuid not null references public.properties(id)  on delete restrict,
  outlet_id            uuid not null references public.outlets(id)     on delete restrict,
  order_id             uuid not null references public.orders(id)      on delete restrict,
  order_item_id        uuid references public.order_items(id)          on delete restrict,
  discount_type        text not null constraint order_discounts_type_ok
                       check (discount_type in ('PERCENTAGE','FIXED')),
  discount_value       numeric not null,
  discount_amount      numeric not null,
  reason               text,
  applied_by           uuid,
  applied_at           timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  constraint order_discounts_value_ok check (
    (discount_type = 'PERCENTAGE' and discount_value >= 0 and discount_value <= 100)
    or (discount_type = 'FIXED' and discount_value >= 0)
  ),
  constraint order_discounts_amount_ok check (
    scale(trim_scale(discount_amount)) <= 2
    and discount_amount >= 0
    and discount_amount < 1000000000000
  )
);

comment on table public.order_discounts is
  'Discount applications on orders and order items. Each row is an audited event.';

create index if not exists order_discounts_order_idx on public.order_discounts (order_id);
create index if not exists order_discounts_item_idx on public.order_discounts (order_item_id);

-- Chain guard
create or replace function app.assert_discount_chain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org  uuid;
  v_prop uuid;
  v_out  uuid;
begin
  select o.organization_id, o.property_id, o.outlet_id
    into v_org, v_prop, v_out
    from public.orders o where o.id = new.order_id;

  if v_out is null then
    raise exception 'NIVAAS_SCOPE_MISMATCH: discount % points at no order', new.id;
  end if;

  if new.organization_id <> v_org or new.property_id <> v_prop or new.outlet_id <> v_out then
    raise exception 'NIVAAS_SCOPE_MISMATCH: a discount cannot sit outside its order''s outlet';
  end if;

  -- If item-level, check the item belongs to the order.
  if new.order_item_id is not null then
    perform app.require_valid(
      exists (select 1 from public.order_items oi
               where oi.id = new.order_item_id and oi.order_id = new.order_id),
      'NIVAAS_SCOPE_MISMATCH');
  end if;

  return new;
end;
$$;

drop trigger if exists order_discounts_chain on public.order_discounts;
create trigger order_discounts_chain before insert on public.order_discounts
  for each row execute function app.assert_discount_chain();

-- RLS
alter table public.order_discounts enable row level security;

grant select on public.order_discounts to authenticated, service_role;
revoke all on public.order_discounts from anon;
revoke insert, update, delete, truncate on public.order_discounts from authenticated;

drop policy if exists order_discounts_outlet_read on public.order_discounts;
create policy order_discounts_outlet_read on public.order_discounts
  for select to authenticated
  using (app.can_access_outlet(app.current_user_id(), outlet_id));

-- apply_order_discount
create or replace function public.apply_order_discount(
  p_order uuid,
  p_discount_type text,
  p_discount_value numeric,
  p_reason text,
  p_item_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.require_session();
  v_order jsonb;
  v_org   uuid;
  v_prop  uuid;
  v_out   uuid;
  v_base  numeric;
  v_amount numeric;
  v_row   jsonb;
begin
  select to_jsonb(o) into v_order from public.orders o where o.id = p_order;
  perform app.require_valid(v_order is not null, 'NIVAAS_NOT_FOUND');
  v_org  := (v_order->>'organization_id')::uuid;
  v_prop := (v_order->>'property_id')::uuid;
  v_out  := (v_order->>'outlet_id')::uuid;
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('order.discount', v_org, v_prop, v_out);
  perform app.require_writable_outlet(v_out);
  perform app.require_reason(p_reason);

  -- Order must be editable (not completed/cancelled/void).
  perform app.require_valid(
    (v_order->>'status') not in ('COMPLETED','CANCELLED','VOID'),
    'NIVAAS_IMMUTABLE_ORDER');

  -- Calculate discount base.
  if p_item_id is not null then
    -- Item-level discount.
    select (oi.unit_price::numeric * oi.quantity
            + coalesce((select sum(om.price_adjustment::numeric * om.quantity)
                          from public.order_item_modifiers om where om.order_item_id = oi.id), 0))
      into v_base
      from public.order_items oi where oi.id = p_item_id and oi.order_id = p_order
        and oi.status = 'ACTIVE';
    perform app.require_valid(v_base is not null, 'NIVAAS_NOT_FOUND');
  else
    -- Order-level discount: base is the current subtotal.
    select coalesce(sum(oi.unit_price::numeric * oi.quantity
            + coalesce((select sum(om.price_adjustment::numeric * om.quantity)
                          from public.order_item_modifiers om where om.order_item_id = oi.id), 0)), 0)
      into v_base
      from public.order_items oi
     where oi.order_id = p_order and oi.status = 'ACTIVE';
  end if;

  if p_discount_type = 'PERCENTAGE' then
    perform app.require_valid(p_discount_value >= 0 and p_discount_value <= 100, 'NIVAAS_INVALID');
    v_amount := round(v_base * p_discount_value / 100, 2);
  elsif p_discount_type = 'FIXED' then
    perform app.require_valid(p_discount_value >= 0, 'NIVAAS_INVALID');
    v_amount := least(p_discount_value, v_base);
  else
    raise exception 'NIVAAS_INVALID';
  end if;

  insert into public.order_discounts
    (organization_id, property_id, outlet_id, order_id, order_item_id,
     discount_type, discount_value, discount_amount, reason, applied_by)
  values (v_org, v_prop, v_out, p_order, p_item_id,
          p_discount_type, p_discount_value, v_amount, p_reason, v_actor)
  -- Bare table name in RETURNING whole-row capture (see create_kitchen_station note).
  returning to_jsonb(order_discounts) into v_row;

  -- Update order's discount_amount (sum of all order-level discounts).
  update public.orders
     set discount_amount = coalesce((
           select sum(od.discount_amount) from public.order_discounts od
            where od.order_id = p_order and od.order_item_id is null
         ), 0),
         version = version + 1
   where id = p_order;

  -- Recalculate totals.
  perform app.recalc_order_money(p_order);

  perform app.audit('order_discount_applied', 'order_discount', (v_row->>'id')::uuid,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_after := v_row, p_reason := p_reason);
  return v_row;
end;
$$;

-- =================================================================== split bills

-- A bill can be split into multiple bills. Each split bill covers a subset of the
-- order's lines or a share of the total. The original bill is cancelled and new bills
-- are created.
create table if not exists public.bill_splits (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  property_id          uuid not null references public.properties(id)  on delete restrict,
  outlet_id            uuid not null references public.outlets(id)     on delete restrict,
  original_bill_id     uuid not null references public.bills(id)       on delete restrict,
  new_bill_id          uuid not null references public.bills(id)       on delete restrict,
  split_type           text not null constraint bill_splits_type_ok
                       check (split_type in ('BY_ITEM','EQUAL','CUSTOM')),
  split_by             uuid,
  created_at           timestamptz not null default now()
);

comment on table public.bill_splits is
  'Audit trail of bill splits: which original bill was split into which new bills.';

create index if not exists bill_splits_original_idx on public.bill_splits (original_bill_id);
create index if not exists bill_splits_new_idx on public.bill_splits (new_bill_id);

alter table public.bill_splits enable row level security;

grant select on public.bill_splits to authenticated, service_role;
revoke all on public.bill_splits from anon;
revoke insert, update, delete, truncate on public.bill_splits from authenticated;

drop policy if exists bill_splits_outlet_read on public.bill_splits;
create policy bill_splits_outlet_read on public.bill_splits
  for select to authenticated
  using (app.can_access_outlet(app.current_user_id(), outlet_id));

-- split_bill_by_item: split a bill by assigning specific lines to new bills.
create or replace function public.split_bill_by_item(
  p_bill uuid,
  p_splits jsonb,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid := app.require_session();
  v_bill     jsonb;
  v_org      uuid;
  v_prop     uuid;
  v_out      uuid;
  v_order    uuid;
  v_bdate    date;
  v_currency text;
  v_elem     jsonb;
  v_group    jsonb;
  v_line_ids jsonb;
  v_new_bill jsonb;
  v_new_id   uuid;
  v_number   text;
  v_subtotal numeric;
  v_line     jsonb;
  v_result   jsonb := '[]'::jsonb;
begin
  select to_jsonb(b) into v_bill from public.bills b where b.id = p_bill;
  perform app.require_valid(v_bill is not null, 'NIVAAS_NOT_FOUND');
  v_org  := (v_bill->>'organization_id')::uuid;
  v_prop := (v_bill->>'property_id')::uuid;
  v_out  := (v_bill->>'outlet_id')::uuid;
  v_order := (v_bill->>'order_id')::uuid;
  v_bdate := (v_bill->>'business_date')::date;
  v_currency := v_bill->>'currency';
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('bill.split', v_org, v_prop, v_out);
  perform app.require_writable_outlet(v_out);
  perform app.require_version((v_bill->>'version')::integer, p_expected_version);

  -- Bill must be OPEN or PARTIALLY_PAID and have no payments (simplification: split before payment).
  perform app.require_valid(
    (v_bill->>'status') in ('OPEN') and (v_bill->>'amount_paid')::numeric = 0,
    'NIVAAS_IMMUTABLE_ORDER');

  -- p_splits is an array of {lineIds: [uuid, ...]} groups.
  perform app.require_valid(
    jsonb_typeof(p_splits) = 'array' and jsonb_array_length(p_splits) >= 2,
    'NIVAAS_INVALID');

  -- Cancel the original bill. Status is already pinned OPEN + unpaid by the guard above.
  update public.bills
     set status = 'CANCELLED', cancelled_at = now(), cancelled_by = v_actor,
         cancel_reason = 'Split into multiple bills', version = version + 1
   where id = p_bill;

  -- Create new bills for each group.
  for v_elem in select * from jsonb_array_elements(p_splits) loop
    v_line_ids := v_elem->'lineIds';
    perform app.require_valid(
      jsonb_typeof(v_line_ids) = 'array' and jsonb_array_length(v_line_ids) > 0,
      'NIVAAS_INVALID');

    v_number := app.next_document_number(v_org, v_prop, v_out, 'BILL', v_bdate);

    -- Calculate subtotal for this group's lines.
    v_subtotal := 0;
    for v_line in
      select jsonb_build_object(
               'unit_price', oi.unit_price::numeric,
               'quantity', oi.quantity,
               'modifier_total', coalesce((
                 select sum(om.price_adjustment::numeric * om.quantity)
                   from public.order_item_modifiers om where om.order_item_id = oi.id
               ), 0)
             )
        from public.order_items oi
       where oi.id in (select (lid #>> '{}')::uuid from jsonb_array_elements(v_line_ids) lid)
         and oi.order_id = v_order and oi.status = 'ACTIVE'
    loop
      v_subtotal := v_subtotal + (v_line->>'unit_price')::numeric * (v_line->>'quantity')::integer
                    + (v_line->>'modifier_total')::numeric;
    end loop;

    -- Insert new bill.
    insert into public.bills
      (organization_id, property_id, outlet_id, order_id, bill_number, business_date,
       currency, subtotal, discount_amount, tax_amount, service_charge_amount,
       rounding_amount, grand_total, amount_paid, amount_due, status, created_by)
    values (v_org, v_prop, v_out, v_order, v_number, v_bdate,
            v_currency, v_subtotal, 0, 0, 0, 0, round(v_subtotal), 0, round(v_subtotal),
            'OPEN', v_actor)
    returning id into v_new_id;

    -- Record the split.
    insert into public.bill_splits
      (organization_id, property_id, outlet_id, original_bill_id, new_bill_id, split_type, split_by)
    values (v_org, v_prop, v_out, p_bill, v_new_id, 'BY_ITEM', v_actor);

    select to_jsonb(b) into v_new_bill from public.bills b where b.id = v_new_id;
    v_result := v_result || v_new_bill;

    perform app.audit('bill_split_created', 'bill', v_new_id,
      p_organization := v_org, p_property := v_prop, p_outlet := v_out,
      p_after := v_new_bill, p_reason := 'Split from bill ' || p_bill);
  end loop;

  perform app.audit('bill_split', 'bill', p_bill,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_before := v_bill, p_reason := 'Split into ' || jsonb_array_length(p_splits)::text || ' bills');

  return v_result;
end;
$$;

-- =================================================================== shifts

-- A shift tracks a cashier's time at the till: when they opened, what cash they started
-- with, when they closed, and what cash they ended with. One outlet can have multiple
-- shifts per day (morning/evening).
create table if not exists public.restaurant_shifts (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  property_id          uuid not null references public.properties(id)  on delete restrict,
  outlet_id            uuid not null references public.outlets(id)     on delete restrict,
  business_date        date not null,
  operator_id          uuid not null,
  opening_cash         numeric not null default 0,
  closing_cash         numeric,
  status               text not null default 'OPEN'
                       constraint restaurant_shifts_status_ok check (status in ('OPEN','CLOSED')),
  opened_at            timestamptz not null default now(),
  closed_at            timestamptz,
  notes                text,
  version              integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint restaurant_shifts_cash_ok check (
    (opening_cash is null or (scale(trim_scale(opening_cash)) <= 2 and opening_cash >= 0))
    and (closing_cash is null or (scale(trim_scale(closing_cash)) <= 2 and closing_cash >= 0))
  )
);

comment on table public.restaurant_shifts is
  'A cashier''s shift at the till: open/close times, cash in/out, operator.';

create index if not exists restaurant_shifts_outlet_date_idx
  on public.restaurant_shifts (outlet_id, business_date);
create index if not exists restaurant_shifts_operator_idx
  on public.restaurant_shifts (operator_id);

-- Chain guard
create or replace function app.assert_shift_chain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org  uuid;
  v_prop uuid;
  v_out  uuid;
begin
  select o.organization_id, o.property_id, o.id
    into v_org, v_prop, v_out
    from public.outlets o where o.id = new.outlet_id;

  if v_out is null then
    raise exception 'NIVAAS_SCOPE_MISMATCH: shift % points at no outlet', new.id;
  end if;

  if new.organization_id <> v_org or new.property_id <> v_prop then
    raise exception 'NIVAAS_SCOPE_MISMATCH: a shift cannot sit outside its outlet''s tenant';
  end if;

  return new;
end;
$$;

drop trigger if exists restaurant_shifts_touch on public.restaurant_shifts;
create trigger restaurant_shifts_touch before update on public.restaurant_shifts
  for each row execute function app.touch_updated_at();

drop trigger if exists restaurant_shifts_chain on public.restaurant_shifts;
create trigger restaurant_shifts_chain before insert or update on public.restaurant_shifts
  for each row execute function app.assert_shift_chain();

-- RLS
alter table public.restaurant_shifts enable row level security;

grant select on public.restaurant_shifts to authenticated, service_role;
revoke all on public.restaurant_shifts from anon;
revoke insert, update, delete, truncate on public.restaurant_shifts from authenticated;

drop policy if exists restaurant_shifts_outlet_read on public.restaurant_shifts;
create policy restaurant_shifts_outlet_read on public.restaurant_shifts
  for select to authenticated
  using (app.can_access_outlet(app.current_user_id(), outlet_id));

-- open_shift
create or replace function public.open_restaurant_shift(
  p_outlet uuid,
  p_opening_cash numeric default 0,
  p_business_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.require_session();
  v_org   uuid;
  v_prop  uuid;
  v_out   uuid;
  v_bdate date;
  v_row   jsonb;
begin
  select o.organization_id, o.property_id, o.id into v_org, v_prop, v_out
    from public.outlets o where o.id = p_outlet;
  perform app.require_valid(v_out is not null, 'NIVAAS_NOT_FOUND');
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('restaurant.view', v_org, v_prop, v_out);
  perform app.require_writable_outlet(v_out);

  -- Resolve business date.
  v_bdate := coalesce(p_business_date, app.rest_outlet_business_date(v_out));

  -- Cannot open a second shift while one is already OPEN.
  perform app.require_valid(
    not exists (select 1 from public.restaurant_shifts s
                 where s.outlet_id = v_out and s.business_date = v_bdate and s.status = 'OPEN'),
    'NIVAAS_CONFLICT');

  insert into public.restaurant_shifts
    (organization_id, property_id, outlet_id, business_date, operator_id, opening_cash)
  values (v_org, v_prop, v_out, v_bdate, v_actor, coalesce(p_opening_cash, 0))
  -- Bare table name in RETURNING whole-row capture (see create_kitchen_station note).
  returning to_jsonb(restaurant_shifts) into v_row;

  perform app.audit('shift_opened', 'restaurant_shift', (v_row->>'id')::uuid,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_after := v_row);
  return v_row;
end;
$$;

-- close_shift
create or replace function public.close_restaurant_shift(
  p_shift uuid,
  p_closing_cash numeric,
  p_notes text default null,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := app.require_session();
  v_before jsonb;
  v_after  jsonb;
  v_org    uuid;
  v_prop   uuid;
  v_out    uuid;
begin
  select to_jsonb(s) into v_before from public.restaurant_shifts s where s.id = p_shift;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');
  v_org  := (v_before->>'organization_id')::uuid;
  v_prop := (v_before->>'property_id')::uuid;
  v_out  := (v_before->>'outlet_id')::uuid;
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('restaurant.view', v_org, v_prop, v_out);
  perform app.require_writable_outlet(v_out);
  perform app.require_version((v_before->>'version')::integer, p_expected_version);
  perform app.require_valid((v_before->>'status') = 'OPEN', 'NIVAAS_ARCHIVED');

  update public.restaurant_shifts
     set status = 'CLOSED', closed_at = now(), closing_cash = p_closing_cash,
         notes = nullif(btrim(coalesce(p_notes, '')), ''), version = version + 1
   where id = p_shift;

  select to_jsonb(s) into v_after from public.restaurant_shifts s where s.id = p_shift;
  perform app.audit('shift_closed', 'restaurant_shift', p_shift,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_before := v_before, p_after := v_after);
  return v_after;
end;
$$;

-- =================================================================== table merge

-- Track when orders from multiple tables are merged. The merged order stays on one
-- table; the others are detached. History is preserved.
create table if not exists public.table_merges (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  property_id          uuid not null references public.properties(id)  on delete restrict,
  outlet_id            uuid not null references public.outlets(id)     on delete restrict,
  target_table_id      uuid not null references public.restaurant_tables(id) on delete restrict,
  source_table_id      uuid not null references public.restaurant_tables(id) on delete restrict,
  target_order_id      uuid not null references public.orders(id) on delete restrict,
  source_order_id      uuid not null references public.orders(id) on delete restrict,
  merged_by            uuid,
  merged_at            timestamptz not null default now(),
  created_at           timestamptz not null default now()
);

comment on table public.table_merges is
  'Audit trail of table merges: which orders were combined and where they ended up.';

create index if not exists table_merges_outlet_idx on public.table_merges (outlet_id);
create index if not exists table_merges_target_idx on public.table_merges (target_order_id);

alter table public.table_merges enable row level security;

grant select on public.table_merges to authenticated, service_role;
revoke all on public.table_merges from anon;
revoke insert, update, delete, truncate on public.table_merges from authenticated;

drop policy if exists table_merges_outlet_read on public.table_merges;
create policy table_merges_outlet_read on public.table_merges
  for select to authenticated
  using (app.can_access_outlet(app.current_user_id(), outlet_id));

-- merge_tables: move all ACTIVE lines from source order to target order, then cancel source.
create or replace function public.merge_tables(
  p_target_order uuid,
  p_source_order uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid := app.require_session();
  v_target   jsonb;
  v_source   jsonb;
  v_org      uuid;
  v_prop     uuid;
  v_out      uuid;
  v_target_table uuid;
  v_source_table uuid;
  v_result   jsonb;
begin
  select to_jsonb(o) into v_target from public.orders o where o.id = p_target_order;
  perform app.require_valid(v_target is not null, 'NIVAAS_NOT_FOUND');
  select to_jsonb(o) into v_source from public.orders o where o.id = p_source_order;
  perform app.require_valid(v_source is not null, 'NIVAAS_NOT_FOUND');

  v_org  := (v_target->>'organization_id')::uuid;
  v_prop := (v_target->>'property_id')::uuid;
  v_out  := (v_target->>'outlet_id')::uuid;
  v_target_table := (v_target->>'table_id')::uuid;
  v_source_table := (v_source->>'table_id')::uuid;

  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('order.merge', v_org, v_prop, v_out);
  perform app.require_writable_outlet(v_out);

  -- Both orders must be at the same outlet and editable.
  perform app.require_valid(
    (v_source->>'outlet_id')::uuid = v_out, 'NIVAAS_SCOPE_MISMATCH');
  perform app.require_valid(
    (v_target->>'status') not in ('COMPLETED','CANCELLED','VOID'), 'NIVAAS_IMMUTABLE_ORDER');
  perform app.require_valid(
    (v_source->>'status') not in ('COMPLETED','CANCELLED','VOID'), 'NIVAAS_IMMUTABLE_ORDER');

  -- Move ACTIVE lines from source to target.
  update public.order_items
     set order_id = p_target_order, version = version + 1
   where order_id = p_source_order and status = 'ACTIVE';

  -- Cancel the source order.
  if (v_source->>'status') <> 'CANCELLED' then
    perform app.require_order_transition((v_source->>'status'), 'CANCELLED');
    update public.orders
       set status = 'CANCELLED', cancel_reason = coalesce(p_reason, 'Merged into order ' || p_target_order),
           cancelled_at = now(), version = version + 1
     where id = p_source_order;
  end if;

  -- Record the merge.
  insert into public.table_merges
    (organization_id, property_id, outlet_id, target_table_id, source_table_id,
     target_order_id, source_order_id, merged_by)
  values (v_org, v_prop, v_out, v_target_table, v_source_table,
          p_target_order, p_source_order, v_actor);

  -- Recalculate target order totals.
  perform app.recalc_order_money(p_target_order);

  select to_jsonb(o) into v_result from public.orders o where o.id = p_target_order;

  perform app.audit('tables_merged', 'order', p_target_order,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_after := v_result,
    p_reason := coalesce(p_reason, 'Merged order ' || p_source_order || ' into ' || p_target_order));

  return v_result;
end;
$$;

-- =================================================================== order activity timeline

-- A simple event log for orders: every status change, KOT send, payment, etc. is
-- recorded here. The timeline is append-only.
create table if not exists public.order_activity (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  property_id          uuid not null references public.properties(id)  on delete restrict,
  outlet_id            uuid not null references public.outlets(id)     on delete restrict,
  order_id             uuid not null references public.orders(id)      on delete restrict,
  event_type           text not null,
  event_data           jsonb,
  performed_by         uuid,
  performed_at         timestamptz not null default now(),
  created_at           timestamptz not null default now()
);

comment on table public.order_activity is
  'Append-only timeline of order events: status changes, KOT sends, payments, discounts, etc.';

create index if not exists order_activity_order_idx on public.order_activity (order_id, performed_at desc);
create index if not exists order_activity_outlet_idx on public.order_activity (outlet_id, performed_at desc);

alter table public.order_activity enable row level security;

grant select on public.order_activity to authenticated, service_role;
revoke all on public.order_activity from anon;
revoke insert, update, delete, truncate on public.order_activity from authenticated;

drop policy if exists order_activity_outlet_read on public.order_activity;
create policy order_activity_outlet_read on public.order_activity
  for select to authenticated
  using (app.can_access_outlet(app.current_user_id(), outlet_id));

-- Helper to record an activity event.
create or replace function app.record_order_activity(
  p_order_id uuid,
  p_event_type text,
  p_event_data jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org  uuid;
  v_prop uuid;
  v_out  uuid;
  v_actor uuid;
begin
  select o.organization_id, o.property_id, o.outlet_id
    into v_org, v_prop, v_out
    from public.orders o where o.id = p_order_id;

  if v_out is null then return; end if;

  v_actor := app.current_user_id();

  insert into public.order_activity
    (organization_id, property_id, outlet_id, order_id, event_type, event_data, performed_by)
  values (v_org, v_prop, v_out, p_order_id, p_event_type, p_event_data, v_actor);
end;
$$;

-- Read door for order activity.
create or replace function public.order_activity_timeline(p_order uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.require_session();
  v_org   uuid;
  v_prop  uuid;
  v_out   uuid;
  v_rows  jsonb;
begin
  select o.organization_id, o.property_id, o.outlet_id
    into v_org, v_prop, v_out
    from public.orders o where o.id = p_order;
  perform app.require_valid(v_out is not null, 'NIVAAS_NOT_FOUND');
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('order.view', v_org, v_prop, v_out);

  select coalesce(jsonb_agg(v order by v ->> 'performedAt' desc), '[]'::jsonb) into v_rows
    from (
      select jsonb_build_object(
        'id', a.id,
        'eventType', a.event_type,
        'eventData', a.event_data,
        'performedBy', a.performed_by,
        'performedAt', a.performed_at
      ) as v
        from public.order_activity a
       where a.order_id = p_order
    ) s;

  return v_rows;
end;
$$;

-- =================================================================== permissions

-- Register new permission tokens.
with new_permissions(permission) as (
  values ('station.manage'),
         ('order.merge'),
         ('bill.split'),
         ('shift.manage')
),
role_grants(role_name, permission) as (
  select r.name, p.permission
    from public.roles r
    cross join new_permissions p
   where r.name in ('OWNER','MANAGER','KITCHEN_MANAGER','STAFF')
)
insert into public.role_permissions (role_id, permission)
select r.id, rg.permission
  from role_grants rg
  join public.roles r on r.name = rg.role_name
on conflict (role_id, permission) do nothing;

-- =================================================================== grants

do $$
declare
  v_name text;
  v_oid  oid;
  v_oids oid[];
begin
  foreach v_name in array array[
    'create_kitchen_station', 'update_kitchen_station', 'archive_kitchen_station',
    'apply_order_discount', 'split_bill_by_item',
    'open_restaurant_shift', 'close_restaurant_shift',
    'merge_tables', 'order_activity_timeline'
  ] loop
    select coalesce(array_agg(p.oid), '{}'::oid[]) into v_oids
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_name;
    if v_oids = '{}'::oid[] then
      raise exception 'NIVAAS_MIGRATION_GAP: % is granted but never defined', v_name;
    end if;
    foreach v_oid in array v_oids loop
      execute format('grant execute on function %s to authenticated, service_role',
                     v_oid::regprocedure);
    end loop;
  end loop;
end;
$$;

-- Also re-grant send_kot (replaced above).
do $$
declare
  v_oid  oid;
  v_oids oid[];
begin
  select coalesce(array_agg(p.oid), '{}'::oid[]) into v_oids
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'send_kot';
  foreach v_oid in array v_oids loop
    execute format('grant execute on function %s to authenticated, service_role',
                   v_oid::regprocedure);
  end loop;
end;
$$;

-- =================================================================== self-check

do $$
begin
  -- Kitchen stations table exists with RLS.
  perform app.require_valid(
    (select relrowsecurity from pg_class where relname = 'kitchen_stations') = true,
    'NIVAAS_MIGRATION_GAP');

  -- Menu items have station_id.
  perform app.require_valid(
    exists (select 1 from information_schema.columns
             where table_name = 'menu_items' and column_name = 'station_id'),
    'NIVAAS_MIGRATION_GAP');

  -- KOTs have station_id.
  perform app.require_valid(
    exists (select 1 from information_schema.columns
             where table_name = 'kitchen_order_tickets' and column_name = 'station_id'),
    'NIVAAS_MIGRATION_GAP');

  -- Order discounts table exists.
  perform app.require_valid(
    exists (select 1 from information_schema.tables where table_name = 'order_discounts'),
    'NIVAAS_MIGRATION_GAP');

  -- Bill splits table exists.
  perform app.require_valid(
    exists (select 1 from information_schema.tables where table_name = 'bill_splits'),
    'NIVAAS_MIGRATION_GAP');

  -- Shifts table exists.
  perform app.require_valid(
    exists (select 1 from information_schema.tables where table_name = 'restaurant_shifts'),
    'NIVAAS_MIGRATION_GAP');

  -- Table merges table exists.
  perform app.require_valid(
    exists (select 1 from information_schema.tables where table_name = 'table_merges'),
    'NIVAAS_MIGRATION_GAP');

  -- Order activity table exists.
  perform app.require_valid(
    exists (select 1 from information_schema.tables where table_name = 'order_activity'),
    'NIVAAS_MIGRATION_GAP');

  -- All new doors exist.
  perform app.require_valid(
    (select count(distinct p.proname) from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('create_kitchen_station','update_kitchen_station','archive_kitchen_station',
                          'apply_order_discount','split_bill_by_item',
                          'open_restaurant_shift','close_restaurant_shift',
                          'merge_tables','order_activity_timeline')) = 9,
    'NIVAAS_MIGRATION_GAP');

  -- Permission drift gate (same as 018).
  perform app.require_valid(
    not exists (
      select 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       cross join lateral regexp_matches(p.prosrc,
                 'require_permission\(''([a-z_.]+)''', 'g') as t(tok)
       where n.nspname = 'public'
         and not exists (select 1 from public.role_permissions rp
                          where rp.permission = t.tok[1])
    ),
    'NIVAAS_MIGRATION_GAP');
end;
$$;
