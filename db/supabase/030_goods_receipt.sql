-- AMRUT NIVAAS · 030 — goods receipt (Prompt #07 §19-§26)
--
-- Goods Receipt Note (GRN): the physical receipt of goods against a PO.
-- This is the critical integration point with the inventory stock ledger.
--
-- Key invariants:
--   - GRN posts RECEIPT movements to the stock ledger via post_stock_movement.
--   - Idempotency: posting the same GRN twice must NOT double inventory.
--   - Over-receiving is blocked by default.
--   - Rejected quantities do NOT enter usable inventory.
--   - Batch/lot/expiry captured for applicable items.

set local search_path = '';

-- =================================================================== goods receipts

create table if not exists public.goods_receipts (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  property_id          uuid not null references public.properties(id) on delete restrict,
  outlet_id            uuid references public.outlets(id) on delete restrict,
  purchase_order_id    uuid not null references public.purchase_orders(id) on delete restrict,
  supplier_id          uuid not null references public.suppliers(id) on delete restrict,
  receipt_number       text not null,
  received_at          timestamptz not null default now(),
  received_by          uuid not null,
  location_id          uuid not null references public.inventory_locations(id) on delete restrict,
  status               text not null default 'DRAFT',
  notes                text,
  posted_at            timestamptz,
  cancelled_at         timestamptz,
  cancellation_reason  text,
  version              integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint goods_receipts_receipt_number_not_blank check (btrim(receipt_number) <> ''),
  constraint goods_receipts_status_ok check (status in ('DRAFT', 'POSTED', 'CANCELLED'))
);

comment on table public.goods_receipts is
  'Goods Receipt Note: physical receipt of goods against a PO. Posts to stock ledger.';

-- Unique receipt number per organization.
drop index if exists public.goods_receipts_number_org_idx;
create unique index goods_receipts_number_org_idx
  on public.goods_receipts (organization_id, receipt_number);

create index if not exists goods_receipts_org_idx
  on public.goods_receipts (organization_id);

create index if not exists goods_receipts_po_idx
  on public.goods_receipts (purchase_order_id);

create index if not exists goods_receipts_supplier_idx
  on public.goods_receipts (supplier_id);

create index if not exists goods_receipts_date_idx
  on public.goods_receipts (organization_id, received_at desc);

drop trigger if exists goods_receipts_touch on public.goods_receipts;
create trigger goods_receipts_touch before update on public.goods_receipts
  for each row execute function app.touch_updated_at();

drop policy if exists goods_receipts_read on public.goods_receipts;
create policy goods_receipts_read on public.goods_receipts
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists goods_receipts_no_write on public.goods_receipts;
create policy goods_receipts_no_write on public.goods_receipts
  for all to authenticated
  using (false);

-- =================================================================== goods receipt items

create table if not exists public.goods_receipt_items (
  id                   uuid primary key default gen_random_uuid(),
  goods_receipt_id     uuid not null references public.goods_receipts(id) on delete cascade,
  purchase_order_item_id uuid not null references public.purchase_order_items(id) on delete restrict,
  inventory_item_id    uuid not null references public.inventory_items(id) on delete restrict,
  ordered_quantity     numeric not null,
  received_quantity    numeric not null,
  accepted_quantity    numeric not null,
  rejected_quantity    numeric not null default 0,
  uom                  uuid not null references public.units_of_measure(id) on delete restrict,
  unit_rate            numeric not null,
  batch_number         text,
  expiry_date          date,
  manufacturing_date   date,
  rejection_reason     text,
  notes                text,
  ledger_id            uuid,  -- the stock_ledger row created when posted
  created_at           timestamptz not null default now(),

  constraint goods_receipt_items_qty_positive check (received_quantity > 0),
  constraint goods_receipt_items_accepted_non_negative check (accepted_quantity >= 0),
  constraint goods_receipt_items_rejected_non_negative check (rejected_quantity >= 0),
  constraint goods_receipt_items_rate_positive check (unit_rate >= 0),
  -- accepted + rejected <= received
  constraint goods_receipt_items_qty_check check (accepted_quantity + rejected_quantity <= received_quantity),
  constraint goods_receipt_items_rejection_reason_check check (
    rejected_quantity = 0 or rejection_reason is not null
  ),
  constraint goods_receipt_items_rejection_reason_ok check (rejection_reason is null or rejection_reason in (
    'DAMAGED', 'QUALITY_FAILURE', 'WRONG_ITEM', 'WRONG_QUANTITY', 'EXPIRED', 'PACKAGING_DAMAGE', 'OTHER'
  ))
);

comment on table public.goods_receipt_items is
  'Line items on a GRN. accepted_quantity enters stock; rejected_quantity does not.';

create index if not exists goods_receipt_items_receipt_idx
  on public.goods_receipt_items (goods_receipt_id);

create index if not exists goods_receipt_items_po_item_idx
  on public.goods_receipt_items (purchase_order_item_id);

create index if not exists goods_receipt_items_item_idx
  on public.goods_receipt_items (inventory_item_id);

drop policy if exists goods_receipt_items_read on public.goods_receipt_items;
create policy goods_receipt_items_read on public.goods_receipt_items
  for select to authenticated
  using (goods_receipt_id in (
    select gr.id from public.goods_receipts gr
    where gr.organization_id in (
      select m.organization_id from public.organization_memberships m
      where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
    )
  ));

drop policy if exists goods_receipt_items_no_write on public.goods_receipt_items;
create policy goods_receipt_items_no_write on public.goods_receipt_items
  for all to authenticated
  using (false);

-- =================================================================== GRN number generation

create or replace function public.generate_grn_number(p_organization uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year int := extract(year from current_date);
  v_count int;
  v_number text;
begin
  select count(*) into v_count
  from public.goods_receipts
  where organization_id = p_organization
    and extract(year from received_at) = v_year;

  v_number := 'GRN-' || v_year || '-' || lpad((v_count + 1)::text, 6, '0');
  return v_number;
end;
$$;

-- =================================================================== GRN doors

create or replace function public.create_goods_receipt(
  p_organization       uuid,
  p_property           uuid,
  p_outlet             uuid default null,
  p_purchase_order     uuid,
  p_location           uuid,
  p_notes              text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_receipt_number text;
  v_po_org uuid;
  v_po_supplier uuid;
  v_po_status text;
  v_row public.goods_receipts%rowtype;
begin
  perform app.require_session(v_user_id, null);

  -- Validate PO belongs to organization and is in a receivable state
  select po.organization_id, po.supplier_id, po.status
  into v_po_org, v_po_supplier, v_po_status
  from public.purchase_orders po where po.id = p_purchase_order;

  if v_po_org is null or v_po_org <> p_organization then
    raise exception 'NIVAAS_SCOPE_MISMATCH';
  end if;

  if v_po_status not in ('SENT', 'PARTIALLY_RECEIVED') then
    raise exception 'NIVAAS_INVALID_STATE: PO is %, cannot receive', v_po_status;
  end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, p_outlet, 'goods_receipt.create');

  v_receipt_number := public.generate_grn_number(p_organization);

  insert into public.goods_receipts (
    organization_id, property_id, outlet_id, purchase_order_id, supplier_id,
    receipt_number, received_by, location_id, notes
  ) values (
    p_organization, p_property, p_outlet, p_purchase_order, v_po_supplier,
    v_receipt_number, v_user_id, p_location, p_notes
  ) returning * into v_row;

  perform app.audit(
    'GOODS_RECEIPT_CREATED', 'goods_receipt', v_row.id,
    null, to_jsonb(v_row),
    null, jsonb_build_object('receipt_number', v_row.receipt_number, 'po_id', p_purchase_order)
  );

  return to_jsonb(v_row);
end;
$$;

create or replace function public.add_goods_receipt_items(
  p_receipt            uuid,
  p_organization       uuid,
  p_items              jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_receipt_org uuid;
  v_receipt_status text;
  v_item jsonb;
  v_ordered_qty numeric;
begin
  perform app.require_session(v_user_id, null);

  select gr.organization_id, gr.status into v_receipt_org, v_receipt_status
  from public.goods_receipts gr where gr.id = p_receipt;

  if v_receipt_org is null or v_receipt_org <> p_organization then
    raise exception 'NIVAAS_SCOPE_MISMATCH';
  end if;

  if v_receipt_status <> 'DRAFT' then
    raise exception 'NIVAAS_INVALID_STATE: GRN is %, cannot add items', v_receipt_status;
  end if;

  perform app.evaluate_access(v_user_id, p_organization, null, null, 'goods_receipt.edit');

  for v_item in select * from jsonb_array_elements(p_items) loop
    -- Get ordered quantity from PO item
    select poi.ordered_quantity into v_ordered_qty
    from public.purchase_order_items poi
    where poi.id = (v_item->>'purchaseOrderItemId')::uuid;

    insert into public.goods_receipt_items (
      goods_receipt_id, purchase_order_item_id, inventory_item_id,
      ordered_quantity, received_quantity, accepted_quantity, rejected_quantity,
      uom, unit_rate, batch_number, expiry_date, manufacturing_date,
      rejection_reason, notes
    ) values (
      p_receipt,
      (v_item->>'purchaseOrderItemId')::uuid,
      (v_item->>'inventoryItemId')::uuid,
      v_ordered_qty,
      (v_item->>'receivedQuantity')::numeric,
      coalesce((v_item->>'acceptedQuantity')::numeric, (v_item->>'receivedQuantity')::numeric),
      coalesce((v_item->>'rejectedQuantity')::numeric, 0),
      (v_item->>'uom')::uuid,
      (v_item->>'unitRate')::numeric,
      v_item->>'batchNumber',
      case when v_item->>'expiryDate' is not null then (v_item->>'expiryDate')::date else null end,
      case when v_item->>'manufacturingDate' is not null then (v_item->>'manufacturingDate')::date else null end,
      v_item->>'rejectionReason',
      v_item->>'notes'
    );
  end loop;
end;
$$;

create or replace function public.post_goods_receipt(
  p_receipt            uuid,
  p_organization       uuid,
  p_expected_version   integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.goods_receipts%rowtype;
  v_row public.goods_receipts%rowtype;
  v_grn_item public.goods_receipt_items%rowtype;
  v_po_property uuid;
  v_po_outlet uuid;
  v_idempotency_key text;
  v_ledger_id uuid;
  v_already_posted boolean;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.goods_receipts
  where id = p_receipt and organization_id = p_organization;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.status <> 'DRAFT' then
    raise exception 'NIVAAS_INVALID_STATE: GRN is %, cannot post', v_old.status;
  end if;
  if p_expected_version is not null and v_old.version <> p_expected_version then
    raise exception 'NIVAAS_VERSION_CONFLICT';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, v_old.property_id, v_old.outlet_id, 'goods_receipt.post');

  -- Get PO scope
  select po.property_id, po.outlet_id into v_po_property, v_po_outlet
  from public.purchase_orders po where po.id = v_old.purchase_order_id;

  -- Check idempotency: has this GRN already been posted?
  select exists(
    select 1 from public.stock_ledger
    where document_type = 'GOODS_RECEIPT' and document_id = p_receipt
  ) into v_already_posted;

  if v_already_posted then
    raise exception 'NIVAAS_IDEMPOTENCY: GRN already posted';
  end if;

  -- Post each accepted item to stock ledger
  for v_grn_item in
    select * from public.goods_receipt_items
    where goods_receipt_id = p_receipt and accepted_quantity > 0
  loop
    v_idempotency_key := 'GRN:' || p_receipt || ':ITEM:' || v_grn_item.id || ':RECEIPT';

    -- Call the existing post_stock_movement door
    select public.post_stock_movement(
      p_organization => p_organization,
      p_property => v_old.property_id,
      p_outlet => v_old.outlet_id,
      p_location => v_old.location_id,
      p_item => v_grn_item.inventory_item_id,
      p_movement_type => 'RECEIPT',
      p_quantity => v_grn_item.accepted_quantity,
      p_unit => v_grn_item.uom,
      p_unit_cost => v_grn_item.unit_rate,
      p_document_type => 'GOODS_RECEIPT',
      p_document_id => p_receipt,
      p_idempotency_key => v_idempotency_key,
      p_batch_number => v_grn_item.batch_number,
      p_expiry_date => v_grn_item.expiry_date,
      p_reason => null,
      p_notes => v_grn_item.notes,
      p_allow_negative => false,
      p_expected_version => null
    ) into v_ledger_id;

    -- Update GRN item with ledger reference
    update public.goods_receipt_items set ledger_id = v_ledger_id
    where id = v_grn_item.id;

    -- Update PO item received quantity
    perform public.update_purchase_order_item_received(
      v_grn_item.purchase_order_item_id,
      p_organization,
      v_grn_item.accepted_quantity
    );

    -- Record price history
    perform public.record_supplier_price(
      p_supplier => v_old.supplier_id,
      p_organization => p_organization,
      p_inventory_item => v_grn_item.inventory_item_id,
      p_purchase_order_id => v_old.purchase_order_id,
      p_goods_receipt_id => p_receipt,
      p_purchase_date => current_date,
      p_quantity => v_grn_item.accepted_quantity,
      p_purchase_unit => v_grn_item.uom,
      p_rate => v_grn_item.unit_rate,
      p_discount => 0,
      p_tax_amount => 0,
      p_freight_amount => 0,
      p_other_charges => 0,
      p_landed_rate => v_grn_item.unit_rate,
      p_currency => 'INR'
    );
  end loop;

  -- Update PO status based on received quantities
  perform public.update_po_status_after_grn(v_old.purchase_order_id, p_organization);

  -- Mark GRN as posted
  update public.goods_receipts set
    status = 'POSTED',
    posted_at = now(),
    version = version + 1
  where id = p_receipt returning * into v_row;

  perform app.audit(
    'GOODS_RECEIPT_POSTED', 'goods_receipt', v_row.id,
    to_jsonb(v_old), to_jsonb(v_row),
    null, jsonb_build_object('receipt_number', v_row.receipt_number)
  );

  return to_jsonb(v_row);
end;
$$;

-- Update PO status after GRN posting
create or replace function public.update_po_status_after_grn(
  p_order              uuid,
  p_organization       uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total_ordered numeric;
  v_total_received numeric;
  v_current_status text;
begin
  select po.status,
    (select coalesce(sum(ordered_quantity), 0) from public.purchase_order_items where purchase_order_id = p_order),
    (select coalesce(sum(received_quantity), 0) from public.purchase_order_items where purchase_order_id = p_order)
  into v_current_status, v_total_ordered, v_total_received
  from public.purchase_orders po where po.id = p_order;

  if v_current_status not in ('SENT', 'PARTIALLY_RECEIVED') then
    return;  -- No status change needed
  end if;

  if v_total_received >= v_total_ordered then
    update public.purchase_orders set status = 'RECEIVED' where id = p_order;
  elsif v_total_received > 0 then
    update public.purchase_orders set status = 'PARTIALLY_RECEIVED' where id = p_order;
  end if;
end;
$$;

create or replace function public.cancel_goods_receipt(
  p_receipt            uuid,
  p_organization       uuid,
  p_reason             text,
  p_expected_version   integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.goods_receipts%rowtype;
  v_row public.goods_receipts%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.goods_receipts
  where id = p_receipt and organization_id = p_organization;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.status = 'POSTED' then
    raise exception 'NIVAAS_INVALID_STATE: cannot cancel a posted GRN';
  end if;
  if p_expected_version is not null and v_old.version <> p_expected_version then
    raise exception 'NIVAAS_VERSION_CONFLICT';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, null, null, 'goods_receipt.cancel');

  update public.goods_receipts set
    status = 'CANCELLED',
    cancelled_at = now(),
    cancellation_reason = p_reason,
    version = version + 1
  where id = p_receipt returning * into v_row;

  perform app.audit(
    'GOODS_RECEIPT_CANCELLED', 'goods_receipt', v_row.id,
    to_jsonb(v_old), to_jsonb(v_row),
    p_reason, jsonb_build_object('receipt_number', v_row.receipt_number)
  );

  return to_jsonb(v_row);
end;
$$;

-- grants
grant execute on function public.generate_grn_number to authenticated;
grant execute on function public.create_goods_receipt to authenticated;
grant execute on function public.add_goods_receipt_items to authenticated;
grant execute on function public.post_goods_receipt to authenticated;
grant execute on function public.cancel_goods_receipt to authenticated;
grant execute on function public.update_po_status_after_grn to authenticated;
