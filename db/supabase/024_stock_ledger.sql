-- ============================================================================
-- AMRUT NIVAAS — 024: Immutable Stock Ledger
--
-- The ledger is the single source of truth for inventory. Every movement —
-- opening, receipt, consumption, wastage, adjustment, transfer — is a row.
-- Rows are INSERT-only; corrections are compensating rows, never edits.
--
-- Stock balance is DERIVED: sum of movements for (item, location) to date.
-- No mutable quantity column anywhere.
--
-- Weighted average cost is recalculated on every inbound movement:
--   new_avg = (existing_qty * existing_avg + incoming_qty * incoming_cost)
--             / (existing_qty + incoming_qty)
-- Outbound movements use the current avg at the time of posting.
--
-- Idempotency: every movement carries an idempotency_key (document_type +
-- document_id + movement_type + seq). A duplicate post returns the existing
-- row instead of creating a second one.
-- ============================================================================

set local search_path = '';

-- ============================================================ stock_ledger

create table if not exists public.stock_ledger (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  property_id          uuid not null references public.properties(id)  on delete restrict,
  outlet_id            uuid          references public.outlets(id)     on delete restrict,
  location_id          uuid not null references public.inventory_locations(id) on delete restrict,
  item_id              uuid not null references public.inventory_items(id) on delete restrict,

  movement_type        text not null,
  quantity             numeric not null,
  unit_id              uuid not null references public.units_of_measure(id) on delete restrict,
  unit_cost            numeric,
  total_cost           numeric,
  avg_cost_after      numeric,

  document_type        text,
  document_id          uuid,
  idempotency_key      text not null unique,

  batch_number         text,
  expiry_date          date,

  reason               text,
  notes                text,

  created_at           timestamptz not null default now(),
  created_by           uuid,

  constraint stock_ledger_quantity_positive check (quantity > 0),
  constraint stock_ledger_unit_cost_positive check (unit_cost is null or unit_cost >= 0),
  constraint stock_ledger_movement_type_ok check (movement_type in (
    'OPENING', 'RECEIPT', 'TRANSFER_IN', 'TRANSFER_OUT',
    'CONSUMPTION', 'WASTAGE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'RETURN'
  ))
);

comment on table public.stock_ledger is
  'Immutable ledger of all inventory movements. Balance is derived, never stored.';

create index if not exists stock_ledger_item_location_idx
  on public.stock_ledger (organization_id, item_id, location_id, created_at);

create index if not exists stock_ledger_document_idx
  on public.stock_ledger (document_type, document_id);

create index if not exists stock_ledger_org_created_idx
  on public.stock_ledger (organization_id, created_at desc);

-- Chain guard: ledger row's scope must match its item and location.
create or replace function app.assert_ledger_chain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item_org  uuid;
  v_loc_org   uuid;
  v_loc_prop  uuid;
  v_loc_out   uuid;
begin
  select i.organization_id into v_item_org
    from public.inventory_items i where i.id = new.item_id;

  select l.organization_id, l.property_id, l.outlet_id
    into v_loc_org, v_loc_prop, v_loc_out
    from public.inventory_locations l where l.id = new.location_id;

  if v_item_org is null or v_loc_org is null then
    raise exception 'NIVAAS_SCOPE_MISMATCH: ledger row references missing item or location';
  end if;

  if new.organization_id <> v_item_org or new.organization_id <> v_loc_org then
    raise exception 'NIVAAS_SCOPE_MISMATCH: ledger row organization does not match item/location';
  end if;

  if new.property_id <> v_loc_prop then
    raise exception 'NIVAAS_SCOPE_MISMATCH: ledger row property does not match location';
  end if;

  -- Outlet: if location has one, row must match; if location has none, row's must be null.
  if (new.outlet_id is null) <> (v_loc_out is null) or
     (new.outlet_id is not null and new.outlet_id <> v_loc_out) then
    raise exception 'NIVAAS_SCOPE_MISMATCH: ledger row outlet does not match location';
  end if;

  return new;
end;
$$;

drop trigger if exists stock_ledger_chain on public.stock_ledger;
create trigger stock_ledger_chain before insert on public.stock_ledger
  for each row execute function app.assert_ledger_chain();

-- RLS: authenticated members SELECT their tenant scope; no DML.
drop policy if exists stock_ledger_select on public.stock_ledger;
create policy stock_ledger_select on public.stock_ledger
  for select to authenticated
  using (
    app.member_of(app.current_user_id(), organization_id)
  );

-- No UPDATE/DELETE/INSERT policies — all writes through doors only.

-- ============================================================ stock balance view

-- Derived balance per (item, location). Inbound types add, outbound subtract.
create or replace view public.stock_balance as
select
  l.organization_id,
  l.property_id,
  l.outlet_id,
  l.item_id,
  l.location_id,
  l.unit_id,
  coalesce(sum(
    case when l.movement_type in (
      'OPENING', 'RECEIPT', 'TRANSFER_IN', 'ADJUSTMENT_IN', 'RETURN'
    ) then l.quantity
    else -l.quantity
    end
  ), 0) as quantity_on_hand,
  max(l.avg_cost_after) as last_avg_cost,
  max(l.created_at) as last_movement_at
from public.stock_ledger l
group by l.organization_id, l.property_id, l.outlet_id, l.item_id, l.location_id, l.unit_id;

comment on view public.stock_balance is
  'Derived stock balance per (item, location). Read model, never written to directly.';

drop policy if exists stock_balance_select on public.stock_balance;
create policy stock_balance_select on public.stock_balance
  for select to authenticated
  using (
    app.member_of(app.current_user_id(), organization_id)
  );

-- ============================================================ post_stock_movement door

-- The ONLY way to insert a ledger row. Handles idempotency, cost calculation,
-- and balance validation (no negative stock unless explicitly allowed).
create or replace function public.post_stock_movement(
  p_organization      uuid,
  p_property          uuid,
  p_outlet            uuid,
  p_location          uuid,
  p_item              uuid,
  p_movement_type     text,
  p_quantity          numeric,
  p_unit              uuid,
  p_unit_cost         numeric default null,
  p_document_type     text default null,
  p_document_id       uuid default null,
  p_idempotency_key   text,
  p_batch_number      text default null,
  p_expiry_date       date default null,
  p_reason            text default null,
  p_notes             text default null,
  p_allow_negative    boolean default false,
  p_expected_version  integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id       uuid := app.current_user_id();
  v_existing_id   uuid;
  v_current_qty   numeric;
  v_current_avg   numeric;
  v_new_qty       numeric;
  v_new_avg       numeric;
  v_total_cost    numeric;
  v_is_inbound    boolean;
  v_item_unit     uuid;
begin
  -- Gate: membership + permission.
  if not app.member_of(v_user_id, p_organization) then
    raise exception 'NIVAAS_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not app.has_permission(v_user_id, p_organization, 'stock.adjust') then
    raise exception 'NIVAAS_FORBIDDEN' using errcode = '28000';
  end if;

  -- Idempotency: if this key already exists, return its id.
  select sl.id into v_existing_id
    from public.stock_ledger sl
    where sl.idempotency_key = p_idempotency_key;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  -- Validate item exists and get its base unit.
  select i.base_unit_id into v_item_unit
    from public.inventory_items i
    where i.id = p_item and i.organization_id = p_organization;

  if v_item_unit is null then
    raise exception 'NIVAAS_NOT_FOUND: item % does not exist', p_item;
  end if;

  -- Unit must match item's base unit (no conversion in this door).
  if p_unit <> v_item_unit then
    raise exception 'NIVAAS_INVALID_OPERATION: unit must match item base unit; use convert_unit first';
  end if;

  -- Current balance at this location.
  select coalesce(sb.quantity_on_hand, 0), coalesce(sb.last_avg_cost, 0)
    into v_current_qty, v_current_avg
    from public.stock_balance sb
    where sb.item_id = p_item and sb.location_id = p_location;

  -- Determine inbound vs outbound.
  v_is_inbound := p_movement_type in (
    'OPENING', 'RECEIPT', 'TRANSFER_IN', 'ADJUSTMENT_IN', 'RETURN'
  );

  -- Calculate new quantity.
  if v_is_inbound then
    v_new_qty := v_current_qty + p_quantity;
  else
    v_new_qty := v_current_qty - p_quantity;
  end if;

  -- No negative stock unless allowed.
  if v_new_qty < 0 and not p_allow_negative then
    raise exception 'NIVAAS_INSUFFICIENT_STOCK: item % at location % would go negative (%  %)',
      p_item, p_location, v_current_qty, p_quantity;
  end if;

  -- Calculate weighted average cost (inbound only; outbound uses current avg).
  if v_is_inbound and p_unit_cost is not null then
    if v_current_qty = 0 then
      v_new_avg := p_unit_cost;
    else
      v_new_avg := (v_current_qty * v_current_avg + p_quantity * p_unit_cost) / v_new_qty;
    end if;
    v_total_cost := p_quantity * p_unit_cost;
  elsif not v_is_inbound then
    v_new_avg := v_current_avg;
    v_total_cost := p_quantity * v_current_avg;
  else
    v_new_avg := v_current_avg;
    v_total_cost := null;
  end if;

  -- Insert the ledger row.
  insert into public.stock_ledger (
    organization_id, property_id, outlet_id, location_id, item_id,
    movement_type, quantity, unit_id, unit_cost, total_cost, avg_cost_after,
    document_type, document_id, idempotency_key,
    batch_number, expiry_date, reason, notes, created_by
  ) values (
    p_organization, p_property, p_outlet, p_location, p_item,
    p_movement_type, p_quantity, p_unit, p_unit_cost, v_total_cost, v_new_avg,
    p_document_type, p_document_id, p_idempotency_key,
    p_batch_number, p_expiry_date, p_reason, p_notes, v_user_id
  )
  returning id into v_existing_id;

  -- Audit.
  perform app.audit(
    'create',
    'stock_ledger',
    v_existing_id,
    p_organization,
    p_property,
    p_outlet,
    null,
    jsonb_build_object(
      'movement_type', p_movement_type,
      'quantity', p_quantity,
      'item_id', p_item,
      'location_id', p_location,
      'balance_before', v_current_qty,
      'balance_after', v_new_qty,
      'avg_cost_before', v_current_avg,
      'avg_cost_after', v_new_avg
    )
  );

  return v_existing_id;
end;
$$;

grant execute on function public.post_stock_movement to authenticated;

-- ============================================================ reverse_stock_movement

-- Creates a compensating movement for a given ledger row (corrections, cancellations).
create or replace function public.reverse_stock_movement(
  p_organization      uuid,
  p_original_ledger_id uuid,
  p_reason            text,
  p_idempotency_key   text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id       uuid := app.current_user_id();
  v_original      public.stock_ledger%rowtype;
  v_reverse_type  text;
  v_reverse_id    uuid;
begin
  -- Gate.
  if not app.member_of(v_user_id, p_organization) then
    raise exception 'NIVAAS_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not app.has_permission(v_user_id, p_organization, 'stock.adjust') then
    raise exception 'NIVAAS_FORBIDDEN' using errcode = '28000';
  end if;

  -- Fetch original row.
  select * into v_original
    from public.stock_ledger sl
    where sl.id = p_original_ledger_id and sl.organization_id = p_organization;

  if v_original.id is null then
    raise exception 'NIVAAS_NOT_FOUND: ledger row % does not exist', p_original_ledger_id;
  end if;

  -- Determine reverse movement type.
  v_reverse_type := case v_original.movement_type
    when 'OPENING'        then 'ADJUSTMENT_OUT'
    when 'RECEIPT'        then 'ADJUSTMENT_OUT'
    when 'TRANSFER_IN'    then 'ADJUSTMENT_OUT'
    when 'TRANSFER_OUT'   then 'ADJUSTMENT_IN'
    when 'CONSUMPTION'    then 'ADJUSTMENT_IN'
    when 'WASTAGE'        then 'ADJUSTMENT_IN'
    when 'ADJUSTMENT_IN'  then 'ADJUSTMENT_OUT'
    when 'ADJUSTMENT_OUT' then 'ADJUSTMENT_IN'
    when 'RETURN'         then 'ADJUSTMENT_OUT'
    else raise exception 'NIVAAS_INVALID_OPERATION: cannot reverse movement type %', v_original.movement_type
  end;

  -- Post the reverse movement.
  v_reverse_id := public.post_stock_movement(
    p_organization      := p_organization,
    p_property          := v_original.property_id,
    p_outlet            := v_original.outlet_id,
    p_location          := v_original.location_id,
    p_item              := v_original.item_id,
    p_movement_type     := v_reverse_type,
    p_quantity          := v_original.quantity,
    p_unit              := v_original.unit_id,
    p_unit_cost         := v_original.avg_cost_after,
    p_document_type     := 'REVERSAL',
    p_document_id       := v_original.id,
    p_idempotency_key   := p_idempotency_key,
    p_batch_number      := v_original.batch_number,
    p_expiry_date       := v_original.expiry_date,
    p_reason            := p_reason,
    p_notes             := format('Reversal of ledger row %s (%s)', v_original.id, v_original.movement_type),
    p_allow_negative    := true
  );

  -- Audit the reversal.
  perform app.audit(
    'reverse',
    'stock_ledger',
    v_reverse_id,
    p_organization,
    v_original.property_id,
    v_original.outlet_id,
    null,
    jsonb_build_object(
      'original_ledger_id', p_original_ledger_id,
      'original_movement_type', v_original.movement_type,
      'reason', p_reason
    )
  );

  return v_reverse_id;
end;
$$;

grant execute on function public.reverse_stock_movement to authenticated;
