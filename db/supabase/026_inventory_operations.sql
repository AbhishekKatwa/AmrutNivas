-- ============================================================================
-- AMRUT NIVAAS — 026: Inventory Operations
--
-- This file adds the operational doors that post stock movements:
--   - Wastage (spoilage, damage, expired)
--   - Adjustments (inventory corrections, count discrepancies)
--   - Transfers (between locations, paired movements)
--   - Stock takes (physical count → adjustment)
--   - Consumption (Order → Recipe → Stock)
--   - Opening stock (initial balance)
--
-- All doors route through post_stock_movement (024) and inherit its idempotency,
-- cost calculation, and audit trail.
--
-- Design invariants:
--   - Every operation is a document with a unique idempotency key.
--   - Transfers are TWO movements (OUT + IN) in one transaction.
--   - Stock takes compare expected vs actual and post the delta.
--   - Consumption resolves menu item → recipe → ingredients → movements.
--   - Opening stock is a one-time initialization per (item, location).
-- ============================================================================

set local search_path = '';

-- ============================================================ wastage

-- Record spoilage, damage, or expired stock.
create or replace function public.record_wastage(
  p_organization    uuid,
  p_property        uuid,
  p_outlet          uuid,
  p_location        uuid,
  p_item            uuid,
  p_quantity        numeric,
  p_unit            uuid,
  p_reason          text,
  p_idempotency_key text,
  p_notes           text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id   uuid := app.current_user_id();
  v_ledger_id uuid;
begin
  if not app.member_of(v_user_id, p_organization) then
    raise exception 'NIVAAS_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not app.has_permission(v_user_id, p_organization, 'wastage.create') then
    raise exception 'NIVAAS_FORBIDDEN' using errcode = '28000';
  end if;

  v_ledger_id := public.post_stock_movement(
    p_organization      := p_organization,
    p_property          := p_property,
    p_outlet            := p_outlet,
    p_location          := p_location,
    p_item              := p_item,
    p_movement_type     := 'WASTAGE',
    p_quantity          := p_quantity,
    p_unit              := p_unit,
    p_document_type     := 'WASTAGE',
    p_idempotency_key   := p_idempotency_key,
    p_reason            := p_reason,
    p_notes             := p_notes,
    p_allow_negative    := false
  );

  return v_ledger_id;
end;
$$;

grant execute on function public.record_wastage to authenticated;

-- ============================================================ adjustments

-- Inventory correction (count discrepancy, data entry error, etc.).
create or replace function public.record_adjustment(
  p_organization    uuid,
  p_property        uuid,
  p_outlet          uuid,
  p_location        uuid,
  p_item            uuid,
  p_quantity        numeric,
  p_unit            uuid,
  p_adjustment_type text, -- 'IN' or 'OUT'
  p_reason          text,
  p_idempotency_key text,
  p_notes           text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id       uuid := app.current_user_id();
  v_movement_type text;
  v_ledger_id     uuid;
begin
  if not app.member_of(v_user_id, p_organization) then
    raise exception 'NIVAAS_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not app.has_permission(v_user_id, p_organization, 'stock.adjust') then
    raise exception 'NIVAAS_FORBIDDEN' using errcode = '28000';
  end if;

  if p_adjustment_type not in ('IN', 'OUT') then
    raise exception 'NIVAAS_INVALID_OPERATION: adjustment_type must be IN or OUT';
  end if;

  v_movement_type := case p_adjustment_type
    when 'IN'  then 'ADJUSTMENT_IN'
    when 'OUT' then 'ADJUSTMENT_OUT'
  end;

  v_ledger_id := public.post_stock_movement(
    p_organization      := p_organization,
    p_property          := p_property,
    p_outlet            := p_outlet,
    p_location          := p_location,
    p_item              := p_item,
    p_movement_type     := v_movement_type,
    p_quantity          := p_quantity,
    p_unit              := p_unit,
    p_document_type     := 'ADJUSTMENT',
    p_idempotency_key   := p_idempotency_key,
    p_reason            := p_reason,
    p_notes             := p_notes,
    p_allow_negative    := (v_movement_type = 'ADJUSTMENT_OUT')
  );

  return v_ledger_id;
end;
$$;

grant execute on function public.record_adjustment to authenticated;

-- ============================================================ transfers

-- Transfer stock between locations. Creates TWO movements: OUT from source,
-- IN to destination. Both use the same idempotency key prefix to ensure
-- atomicity.
create or replace function public.record_transfer(
  p_organization      uuid,
  p_property          uuid,
  p_outlet            uuid,
  p_source_location   uuid,
  p_dest_location     uuid,
  p_item              uuid,
  p_quantity          numeric,
  p_unit              uuid,
  p_idempotency_key   text,
  p_reason            text default null,
  p_notes             text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id      uuid := app.current_user_id();
  v_out_ledger   uuid;
  v_in_ledger    uuid;
  v_current_avg  numeric;
begin
  if not app.member_of(v_user_id, p_organization) then
    raise exception 'NIVAAS_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not app.has_permission(v_user_id, p_organization, 'transfer.create') then
    raise exception 'NIVAAS_FORBIDDEN' using errcode = '28000';
  end if;

  -- Source and destination must differ.
  if p_source_location = p_dest_location then
    raise exception 'NIVAAS_INVALID_OPERATION: source and destination must differ';
  end if;

  -- Get current avg cost at source (for the inbound movement).
  select coalesce(max(sb.last_avg_cost), 0) into v_current_avg
    from public.stock_balance sb
    where sb.item_id = p_item and sb.location_id = p_source_location;

  -- Post OUT from source.
  v_out_ledger := public.post_stock_movement(
    p_organization      := p_organization,
    p_property          := p_property,
    p_outlet            := p_outlet,
    p_location          := p_source_location,
    p_item              := p_item,
    p_movement_type     := 'TRANSFER_OUT',
    p_quantity          := p_quantity,
    p_unit              := p_unit,
    p_document_type     := 'TRANSFER',
    p_idempotency_key   := p_idempotency_key || ':OUT',
    p_reason            := p_reason,
    p_notes             := p_notes,
    p_allow_negative    := false
  );

  -- Post IN to destination (uses source's avg cost).
  v_in_ledger := public.post_stock_movement(
    p_organization      := p_organization,
    p_property          := p_property,
    p_outlet            := p_outlet,
    p_location          := p_dest_location,
    p_item              := p_item,
    p_movement_type     := 'TRANSFER_IN',
    p_quantity          := p_quantity,
    p_unit              := p_unit,
    p_unit_cost         := v_current_avg,
    p_document_type     := 'TRANSFER',
    p_idempotency_key   := p_idempotency_key || ':IN',
    p_reason            := p_reason,
    p_notes             := p_notes,
    p_allow_negative    := false
  );

  -- Audit the transfer document.
  perform app.audit(
    'create',
    'transfer',
    v_out_ledger,
    p_organization,
    p_property,
    p_outlet,
    null,
    jsonb_build_object(
      'source_location', p_source_location,
      'dest_location', p_dest_location,
      'item_id', p_item,
      'quantity', p_quantity,
      'out_ledger', v_out_ledger,
      'in_ledger', v_in_ledger
    )
  );

  return v_out_ledger;
end;
$$;

grant execute on function public.record_transfer to authenticated;

-- ============================================================ stock takes

-- A stock take compares expected (ledger) vs actual (physical count) and
-- posts adjustments for the delta.
create table if not exists public.stock_takes (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  property_id          uuid not null references public.properties(id)  on delete restrict,
  outlet_id            uuid          references public.outlets(id)     on delete restrict,
  location_id          uuid not null references public.inventory_locations(id) on delete restrict,
  counted_at           timestamptz not null default now(),
  counted_by           uuid,
  status               text not null default 'DRAFT',
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint stock_takes_status_ok check (status in ('DRAFT', 'POSTED', 'ARCHIVED'))
);

comment on table public.stock_takes is
  'Physical count events. Lines are in stock_take_lines.';

create index if not exists stock_takes_location_idx
  on public.stock_takes (location_id);

create table if not exists public.stock_take_lines (
  id                   uuid primary key default gen_random_uuid(),
  stock_take_id        uuid not null references public.stock_takes(id) on delete cascade,
  item_id              uuid not null references public.inventory_items(id) on delete restrict,
  unit_id              uuid not null references public.units_of_measure(id) on delete restrict,
  expected_quantity    numeric not null,
  actual_quantity      numeric not null,
  variance_quantity    numeric not null,
  adjustment_ledger_id uuid references public.stock_ledger(id),
  notes                text,
  created_at           timestamptz not null default now(),

  constraint stock_take_lines_variance_check check (
    variance_quantity = actual_quantity - expected_quantity
  )
);

comment on table public.stock_take_lines is
  'One line per (item, location): expected vs actual count.';

create index if not exists stock_take_lines_take_idx
  on public.stock_take_lines (stock_take_id);

-- RLS for stock_takes and stock_take_lines.
drop policy if exists stock_takes_select on public.stock_takes;
create policy stock_takes_select on public.stock_takes
  for select to authenticated
  using (app.member_of(app.current_user_id(), organization_id));

drop policy if exists stock_take_lines_select on public.stock_take_lines;
create policy stock_take_lines_select on public.stock_take_lines
  for select to authenticated
  using (
    exists (
      select 1 from public.stock_takes st
        where st.id = stock_take_lines.stock_take_id
          and app.member_of(app.current_user_id(), st.organization_id)
    )
  );

-- create_stock_take
create or replace function public.create_stock_take(
  p_organization    uuid,
  p_property        uuid,
  p_outlet          uuid,
  p_location        uuid,
  p_notes           text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id     uuid := app.current_user_id();
  v_stock_take_id uuid;
begin
  if not app.member_of(v_user_id, p_organization) then
    raise exception 'NIVAAS_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not app.has_permission(v_user_id, p_organization, 'stocktake.create') then
    raise exception 'NIVAAS_FORBIDDEN' using errcode = '28000';
  end if;

  insert into public.stock_takes (
    organization_id, property_id, outlet_id, location_id, counted_by, notes
  ) values (
    p_organization, p_property, p_outlet, p_location, v_user_id, p_notes
  ) returning id into v_stock_take_id;

  -- Populate lines from current stock balance.
  insert into public.stock_take_lines (
    stock_take_id, item_id, unit_id, expected_quantity, actual_quantity, variance_quantity
  )
  select
    v_stock_take_id,
    sb.item_id,
    sb.unit_id,
    sb.quantity_on_hand,
    sb.quantity_on_hand,
    0
  from public.stock_balance sb
  where sb.location_id = p_location and sb.quantity_on_hand <> 0;

  perform app.audit(
    'create',
    'stock_take',
    v_stock_take_id,
    p_organization,
    p_property,
    p_outlet,
    null,
    jsonb_build_object('location_id', p_location)
  );

  return v_stock_take_id;
end;
$$;

grant execute on function public.create_stock_take to authenticated;

-- post_stock_take (adjust variances)
create or replace function public.post_stock_take(
  p_organization    uuid,
  p_stock_take      uuid,
  p_lines           jsonb, -- [{line_id, actual_quantity}]
  p_reason          text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id       uuid := app.current_user_id();
  v_stock_take    record;
  v_line          jsonb;
  v_line_id       uuid;
  v_actual        numeric;
  v_expected      numeric;
  v_variance      numeric;
  v_adj_type      text;
  v_adj_qty       numeric;
  v_ledger_id     uuid;
begin
  -- Fetch the stock take.
  select * into v_stock_take
    from public.stock_takes st
    where st.id = p_stock_take and st.organization_id = p_organization;

  if v_stock_take.id is null then
    raise exception 'NIVAAS_NOT_FOUND: stock take % does not exist', p_stock_take;
  end if;

  if not app.member_of(v_user_id, p_organization) then
    raise exception 'NIVAAS_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not app.has_permission(v_user_id, p_organization, 'stocktake.post') then
    raise exception 'NIVAAS_FORBIDDEN' using errcode = '28000';
  end if;

  -- Process each line.
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_line_id := (v_line->>'line_id')::uuid;
    v_actual := (v_line->>'actual_quantity')::numeric;

    -- Fetch the line's expected quantity.
    select stl.expected_quantity into v_expected
      from public.stock_take_lines stl
      where stl.id = v_line_id and stl.stock_take_id = p_stock_take;

    if v_expected is null then
      raise exception 'NIVAAS_NOT_FOUND: stock take line % does not exist', v_line_id;
    end if;

    v_variance := v_actual - v_expected;

    -- Post adjustment if variance is non-zero.
    if v_variance <> 0 then
      v_adj_type := case when v_variance > 0 then 'IN' else 'OUT' end;
      v_adj_qty := abs(v_variance);

      v_ledger_id := public.record_adjustment(
        p_organization    := p_organization,
        p_property        := v_stock_take.property_id,
        p_outlet          := v_stock_take.outlet_id,
        p_location        := v_stock_take.location_id,
        p_item            := (select item_id from public.stock_take_lines where id = v_line_id),
        p_quantity        := v_adj_qty,
        p_unit            := (select unit_id from public.stock_take_lines where id = v_line_id),
        p_adjustment_type := v_adj_type,
        p_reason          := coalesce(p_reason, 'Stock take variance'),
        p_notes           := format('Stock take %s, line %s', p_stock_take, v_line_id),
        p_idempotency_key := format('STOCKTAKE:%s:%s', p_stock_take, v_line_id)
      );

      -- Link the adjustment to the line.
      update public.stock_take_lines stl
        set actual_quantity = v_actual,
            variance_quantity = v_variance,
            adjustment_ledger_id = v_ledger_id
        where stl.id = v_line_id;
    end if;
  end loop;

  -- Mark the stock take as POSTED.
  update public.stock_takes st
    set status = 'POSTED', updated_at = now()
    where st.id = p_stock_take;

  perform app.audit(
    'post',
    'stock_take',
    p_stock_take,
    p_organization,
    v_stock_take.property_id,
    v_stock_take.outlet_id,
    null,
    jsonb_build_object('reason', p_reason)
  );
end;
$$;

grant execute on function public.post_stock_take to authenticated;

-- ============================================================ consumption engine

-- Consume stock for an order: resolve menu item → recipe → ingredients →
-- post CONSUMPTION movements.
create or replace function public.consume_for_order(
  p_organization    uuid,
  p_property        uuid,
  p_outlet          uuid,
  p_location        uuid,
  p_menu_item       uuid,
  p_quantity        numeric,
  p_order_id        uuid,
  p_idempotency_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id       uuid := app.current_user_id();
  v_recipe_id     uuid;
  v_version_id    uuid;
  v_ingredient    record;
  v_converted_qty numeric;
  v_ingredient_unit uuid;
begin
  if not app.member_of(v_user_id, p_organization) then
    raise exception 'NIVAAS_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Permission is checked by the caller (order.create or order.edit).

  -- Resolve menu item → recipe.
  select mi.recipe_id into v_recipe_id
    from public.menu_items mi
    where mi.id = p_menu_item;

  if v_recipe_id is null then
    -- No recipe linked; nothing to consume.
    return;
  end if;

  -- Get the ACTIVE recipe version.
  select rv.id into v_version_id
    from public.recipe_versions rv
    where rv.recipe_id = v_recipe_id and rv.status = 'ACTIVE';

  if v_version_id is null then
    raise exception 'NIVAAS_INVALID_OPERATION: no active recipe version for menu item %', p_menu_item;
  end if;

  -- Consume each ingredient.
  for v_ingredient in
    select ri.item_id, ri.quantity, ri.unit_id
      from public.recipe_ingredients ri
      where ri.recipe_version_id = v_version_id
  loop
    -- Scale by order quantity.
    v_ingredient_unit := v_ingredient.unit_id;

    -- Convert to item's base unit if needed.
    select i.base_unit_id into v_converted_qty
      from public.inventory_items i where i.id = v_ingredient.item_id;

    if v_ingredient.unit_id <> v_converted_qty then
      v_converted_qty := app.convert_unit(
        p_organization,
        v_ingredient.unit_id,
        v_converted_qty,
        v_ingredient.quantity * p_quantity
      );
    else
      v_converted_qty := v_ingredient.quantity * p_quantity;
    end if;

    -- Post consumption movement.
    perform public.post_stock_movement(
      p_organization      := p_organization,
      p_property          := p_property,
      p_outlet            := p_outlet,
      p_location          := p_location,
      p_item              := v_ingredient.item_id,
      p_movement_type     := 'CONSUMPTION',
      p_quantity          := v_converted_qty,
      p_unit              := (select base_unit_id from public.inventory_items where id = v_ingredient.item_id),
      p_document_type     := 'ORDER',
      p_document_id       := p_order_id,
      p_idempotency_key   := p_idempotency_key || ':' || v_ingredient.item_id,
      p_reason            := 'Order consumption',
      p_notes             := format('Menu item %s, order %s', p_menu_item, p_order_id),
      p_allow_negative    := false
    );
  end loop;
end;
$$;

grant execute on function public.consume_for_order to authenticated;

-- ============================================================ opening stock

-- Initialize stock for an item at a location (one-time setup).
create or replace function public.set_opening_stock(
  p_organization    uuid,
  p_property        uuid,
  p_outlet          uuid,
  p_location        uuid,
  p_item            uuid,
  p_quantity        numeric,
  p_unit            uuid,
  p_unit_cost       numeric,
  p_idempotency_key text,
  p_batch_number    text default null,
  p_expiry_date     date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id     uuid := app.current_user_id();
  v_ledger_id   uuid;
  v_current_qty numeric;
begin
  if not app.member_of(v_user_id, p_organization) then
    raise exception 'NIVAAS_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not app.has_permission(v_user_id, p_organization, 'stock.adjust') then
    raise exception 'NIVAAS_FORBIDDEN' using errcode = '28000';
  end if;

  -- Check if there's already stock at this location.
  select coalesce(sb.quantity_on_hand, 0) into v_current_qty
    from public.stock_balance sb
    where sb.item_id = p_item and sb.location_id = p_location;

  if v_current_qty <> 0 then
    raise exception 'NIVAAS_INVALID_OPERATION: opening stock can only be set when balance is zero';
  end if;

  v_ledger_id := public.post_stock_movement(
    p_organization      := p_organization,
    p_property          := p_property,
    p_outlet            := p_outlet,
    p_location          := p_location,
    p_item              := p_item,
    p_movement_type     := 'OPENING',
    p_quantity          := p_quantity,
    p_unit              := p_unit,
    p_unit_cost         := p_unit_cost,
    p_document_type     := 'OPENING',
    p_idempotency_key   := p_idempotency_key,
    p_batch_number      := p_batch_number,
    p_expiry_date       := p_expiry_date,
    p_reason            := 'Opening stock',
    p_allow_negative    := false
  );

  return v_ledger_id;
end;
$$;

grant execute on function public.set_opening_stock to authenticated;
