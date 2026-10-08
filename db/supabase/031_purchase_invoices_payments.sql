-- AMRUT NIVAAS · 031 — purchase invoices, payments & returns (Prompt #07 §27-§30, §33-§35)
--
-- Purchase invoices: the supplier's bill against a PO/GRN. Links to payables.
-- Supplier payments: money paid to the supplier, allocated against invoices.
-- Purchase returns: goods sent back to supplier, reversing stock movements.
--
-- Key invariants:
--   - Invoices track what the supplier bills; payments track what we pay.
--   - A payment can be allocated across multiple invoices (or one invoice partially).
--   - Purchase returns post RETURN movements to the stock ledger (reversing RECEIPT).
--   - Outstanding = invoice total - allocated payments. Never negative.
--   - Returns cannot exceed original received quantity.

set local search_path = '';

-- =================================================================== purchase invoices

create table if not exists public.purchase_invoices (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  property_id          uuid not null references public.properties(id) on delete restrict,
  outlet_id            uuid references public.outlets(id) on delete restrict,
  supplier_id          uuid not null references public.suppliers(id) on delete restrict,
  purchase_order_id    uuid references public.purchase_orders(id) on delete restrict,
  invoice_number       text not null,
  invoice_date         date not null,
  due_date             date,
  subtotal             numeric not null default 0,
  tax_amount           numeric not null default 0,
  total_amount         numeric not null default 0,
  paid_amount          numeric not null default 0,
  outstanding_amount   numeric not null default 0,
  status               text not null default 'DRAFT',
  notes                text,
  posted_at            timestamptz,
  cancelled_at         timestamptz,
  cancellation_reason  text,
  version              integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint purchase_invoices_number_not_blank check (btrim(invoice_number) <> ''),
  constraint purchase_invoices_amounts_positive check (
    subtotal >= 0 and tax_amount >= 0 and total_amount >= 0 and
    paid_amount >= 0 and outstanding_amount >= 0
  ),
  constraint purchase_invoices_total_matches check (total_amount = subtotal + tax_amount),
  constraint purchase_invoices_outstanding_matches check (
    outstanding_amount = total_amount - paid_amount
  ),
  constraint purchase_invoices_status_ok check (status in (
    'DRAFT', 'POSTED', 'PARTIALLY_PAID', 'FULLY_PAID', 'CANCELLED'
  ))
);

comment on table public.purchase_invoices is
  'Supplier invoices against POs. Tracks billing and payment status.';

drop index if exists public.purchase_invoices_number_org_idx;
create unique index purchase_invoices_number_org_idx
  on public.purchase_invoices (organization_id, invoice_number);

create index if not exists purchase_invoices_org_idx
  on public.purchase_invoices (organization_id);

create index if not exists purchase_invoices_supplier_idx
  on public.purchase_invoices (supplier_id);

create index if not exists purchase_invoices_status_idx
  on public.purchase_invoices (organization_id, status);

drop trigger if exists purchase_invoices_touch on public.purchase_invoices;
create trigger purchase_invoices_touch before update on public.purchase_invoices
  for each row execute function app.touch_updated_at();

-- RLS
drop policy if exists purchase_invoices_read on public.purchase_invoices;
create policy purchase_invoices_read on public.purchase_invoices
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists purchase_invoices_no_write on public.purchase_invoices;
create policy purchase_invoices_no_write on public.purchase_invoices
  for all to authenticated
  using (false);

-- =================================================================== purchase invoice items

create table if not exists public.purchase_invoice_items (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations(id) on delete restrict,
  invoice_id              uuid not null references public.purchase_invoices(id) on delete cascade,
  purchase_order_item_id  uuid references public.purchase_order_items(id) on delete restrict,
  goods_receipt_item_id   uuid references public.goods_receipt_items(id) on delete restrict,
  item_id                 uuid not null references public.inventory_items(id) on delete restrict,
  description             text not null,
  quantity                numeric not null,
  unit_id                 uuid not null references public.units_of_measure(id) on delete restrict,
  unit_rate               numeric not null,
  discount_amount         numeric not null default 0,
  tax_rate                numeric not null default 0,
  tax_amount              numeric not null default 0,
  line_total              numeric not null,

  constraint purchase_invoice_items_quantity_positive check (quantity > 0),
  constraint purchase_invoice_items_rate_positive check (unit_rate >= 0),
  constraint purchase_invoice_items_discount_non_negative check (discount_amount >= 0),
  constraint purchase_invoice_items_tax_rate_ok check (tax_rate >= 0 and tax_rate <= 100),
  constraint purchase_invoice_items_line_total_ok check (line_total >= 0)
);

comment on table public.purchase_invoice_items is
  'Line items on a supplier invoice. Links to PO items or GRN items.';

create index if not exists purchase_invoice_items_invoice_idx
  on public.purchase_invoice_items (invoice_id);

-- =================================================================== supplier payments

create table if not exists public.supplier_payments (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  property_id          uuid not null references public.properties(id) on delete restrict,
  outlet_id            uuid references public.outlets(id) on delete restrict,
  supplier_id          uuid not null references public.suppliers(id) on delete restrict,
  payment_number       text not null,
  payment_date         date not null,
  payment_method       text not null,
  reference_number     text,
  total_amount         numeric not null,
  allocated_amount     numeric not null default 0,
  unallocated_amount   numeric not null default 0,
  status               text not null default 'POSTED',
  notes                text,
  version              integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint supplier_payments_number_not_blank check (btrim(payment_number) <> ''),
  constraint supplier_payments_amount_positive check (total_amount > 0),
  constraint supplier_payments_allocated_ok check (
    allocated_amount >= 0 and allocated_amount <= total_amount
  ),
  constraint supplier_payments_unallocated_ok check (
    unallocated_amount = total_amount - allocated_amount
  ),
  constraint supplier_payments_method_ok check (payment_method in (
    'CASH', 'BANK_TRANSFER', 'CHEQUE', 'UPI', 'CREDIT_CARD', 'OTHER'
  )),
  constraint supplier_payments_status_ok check (status in ('POSTED', 'CANCELLED'))
);

comment on table public.supplier_payments is
  'Payments made to suppliers. Allocated against invoices.';

drop index if exists public.supplier_payments_number_org_idx;
create unique index supplier_payments_number_org_idx
  on public.supplier_payments (organization_id, payment_number);

create index if not exists supplier_payments_org_idx
  on public.supplier_payments (organization_id);

create index if not exists supplier_payments_supplier_idx
  on public.supplier_payments (supplier_id);

drop trigger if exists supplier_payments_touch on public.supplier_payments;
create trigger supplier_payments_touch before update on public.supplier_payments
  for each row execute function app.touch_updated_at();

drop policy if exists supplier_payments_read on public.supplier_payments;
create policy supplier_payments_read on public.supplier_payments
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists supplier_payments_no_write on public.supplier_payments;
create policy supplier_payments_no_write on public.supplier_payments
  for all to authenticated
  using (false);

-- =================================================================== payment allocations

create table if not exists public.payment_allocations (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  payment_id           uuid not null references public.supplier_payments(id) on delete cascade,
  invoice_id           uuid not null references public.purchase_invoices(id) on delete restrict,
  allocated_amount     numeric not null,
  allocated_at         timestamptz not null default now(),

  constraint payment_allocations_amount_positive check (allocated_amount > 0)
);

comment on table public.payment_allocations is
  'Links payments to invoices. A payment can be split across invoices.';

create index if not exists payment_allocations_payment_idx
  on public.payment_allocations (payment_id);

create index if not exists payment_allocations_invoice_idx
  on public.payment_allocations (invoice_id);

-- =================================================================== purchase returns

create table if not exists public.purchase_returns (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  property_id          uuid not null references public.properties(id) on delete restrict,
  outlet_id            uuid references public.outlets(id) on delete restrict,
  supplier_id          uuid not null references public.suppliers(id) on delete restrict,
  goods_receipt_id     uuid not null references public.goods_receipts(id) on delete restrict,
  return_number        text not null,
  return_date          date not null,
  status               text not null default 'DRAFT',
  notes                text,
  posted_at            timestamptz,
  cancelled_at         timestamptz,
  cancellation_reason  text,
  version              integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint purchase_returns_number_not_blank check (btrim(return_number) <> ''),
  constraint purchase_returns_status_ok check (status in ('DRAFT', 'POSTED', 'CANCELLED'))
);

comment on table public.purchase_returns is
  'Goods returned to supplier. Posts RETURN movements to stock ledger.';

drop index if exists public.purchase_returns_number_org_idx;
create unique index purchase_returns_number_org_idx
  on public.purchase_returns (organization_id, return_number);

create index if not exists purchase_returns_org_idx
  on public.purchase_returns (organization_id);

create index if not exists purchase_returns_supplier_idx
  on public.purchase_returns (supplier_id);

drop trigger if exists purchase_returns_touch on public.purchase_returns;
create trigger purchase_returns_touch before update on public.purchase_returns
  for each row execute function app.touch_updated_at();

drop policy if exists purchase_returns_read on public.purchase_returns;
create policy purchase_returns_read on public.purchase_returns
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists purchase_returns_no_write on public.purchase_returns;
create policy purchase_returns_no_write on public.purchase_returns
  for all to authenticated
  using (false);

-- =================================================================== purchase return items

create table if not exists public.purchase_return_items (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations(id) on delete restrict,
  return_id               uuid not null references public.purchase_returns(id) on delete cascade,
  goods_receipt_item_id   uuid not null references public.goods_receipt_items(id) on delete restrict,
  item_id                 uuid not null references public.inventory_items(id) on delete restrict,
  quantity                numeric not null,
  unit_id                 uuid not null references public.units_of_measure(id) on delete restrict,
  unit_cost               numeric not null,
  total_cost              numeric not null,
  reason                  text,
  ledger_id               uuid references public.stock_ledger(id),

  constraint purchase_return_items_quantity_positive check (quantity > 0),
  constraint purchase_return_items_cost_positive check (unit_cost >= 0 and total_cost >= 0)
);

comment on table public.purchase_return_items is
  'Items returned to supplier. Links to original GRN item.';

create index if not exists purchase_return_items_return_idx
  on public.purchase_return_items (return_id);

-- =================================================================== number generators

create or replace function public.generate_invoice_number(
  p_organization uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year    integer := extract(year from now());
  v_seq     integer;
  v_number  text;
begin
  select coalesce(max(
    cast(substring(invoice_number from '^\d{4}-(\d+)$') as integer)
  ), 0) + 1
  into v_seq
  from public.purchase_invoices
  where organization_id = p_organization
    and invoice_number like v_year || '-%';

  v_number := v_year || '-' || lpad(v_seq::text, 6, '0');
  return v_number;
end;
$$;

create or replace function public.generate_payment_number(
  p_organization uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year    integer := extract(year from now());
  v_seq     integer;
  v_number  text;
begin
  select coalesce(max(
    cast(substring(payment_number from '^\d{4}-(\d+)$') as integer)
  ), 0) + 1
  into v_seq
  from public.supplier_payments
  where organization_id = p_organization
    and payment_number like v_year || '-%';

  v_number := v_year || '-' || lpad(v_seq::text, 6, '0');
  return v_number;
end;
$$;

create or replace function public.generate_return_number(
  p_organization uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year    integer := extract(year from now());
  v_seq     integer;
  v_number  text;
begin
  select coalesce(max(
    cast(substring(return_number from '^\d{4}-(\d+)$') as integer)
  ), 0) + 1
  into v_seq
  from public.purchase_returns
  where organization_id = p_organization
    and return_number like v_year || '-%';

  v_number := v_year || '-' || lpad(v_seq::text, 6, '0');
  return v_number;
end;
$$;

-- =================================================================== doors: purchase invoices

create or replace function public.create_purchase_invoice(
  p_organization      uuid,
  p_property          uuid,
  p_outlet            uuid,
  p_supplier          uuid,
  p_purchase_order    uuid default null,
  p_invoice_number    text default null,
  p_invoice_date      date default null,
  p_due_date          date default null,
  p_notes             text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id     uuid := app.current_user_id();
  v_invoice_num text;
  v_invoice     record;
begin
  perform app.evaluate_access(v_user_id, p_organization, 'purchase_invoice.create');

  v_invoice_num := coalesce(p_invoice_number, public.generate_invoice_number(p_organization));

  insert into public.purchase_invoices (
    organization_id, property_id, outlet_id, supplier_id, purchase_order_id,
    invoice_number, invoice_date, due_date, status, notes
  ) values (
    p_organization, p_property, p_outlet, p_supplier, p_purchase_order,
    v_invoice_num, coalesce(p_invoice_date, current_date), p_due_date, 'DRAFT', p_notes
  ) returning * into v_invoice;

  perform app.audit(
    p_organization_id => p_organization,
    p_actor_id => v_user_id,
    p_action => 'PURCHASE_INVOICE.CREATE',
    p_entity_type => 'PURCHASE_INVOICE',
    p_entity_id => v_invoice.id,
    p_result => 'SUCCESS',
    p_details => jsonb_build_object('invoice_number', v_invoice_num)
  );

  return to_jsonb(v_invoice);
end;
$$;

create or replace function public.add_purchase_invoice_items(
  p_invoice  uuid,
  p_items    jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id       uuid := app.current_user_id();
  v_invoice       record;
  v_item          jsonb;
  v_subtotal      numeric := 0;
  v_tax           numeric := 0;
  v_line_total    numeric;
  v_line_tax      numeric;
begin
  select * into v_invoice from public.purchase_invoices where id = p_invoice;
  if v_invoice is null then
    raise exception 'NIVAAS_NOT_FOUND: invoice not found';
  end if;

  if v_invoice.status <> 'DRAFT' then
    raise exception 'NIVAAS_INVALID_STATE: cannot add items to % invoice', v_invoice.status;
  end if;

  perform app.evaluate_access(v_user_id, v_invoice.organization_id, 'purchase_invoice.edit');

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_line_total := (v_item->>'quantity')::numeric * (v_item->>'unitRate')::numeric
                    - coalesce((v_item->>'discountAmount')::numeric, 0);
    v_line_tax := v_line_total * (v_item->>'taxRate')::numeric / 100;

    insert into public.purchase_invoice_items (
      organization_id, invoice_id, purchase_order_item_id, goods_receipt_item_id,
      item_id, description, quantity, unit_id, unit_rate, discount_amount,
      tax_rate, tax_amount, line_total
    ) values (
      v_invoice.organization_id, p_invoice,
      (v_item->>'purchaseOrderItemId')::uuid,
      (v_item->>'goodsReceiptItemId')::uuid,
      (v_item->>'itemId')::uuid,
      v_item->>'description',
      (v_item->>'quantity')::numeric,
      (v_item->>'unitId')::uuid,
      (v_item->>'unitRate')::numeric,
      coalesce((v_item->>'discountAmount')::numeric, 0),
      (v_item->>'taxRate')::numeric,
      v_line_tax,
      v_line_total + v_line_tax
    );

    v_subtotal := v_subtotal + v_line_total;
    v_tax := v_tax + v_line_tax;
  end loop;

  update public.purchase_invoices
  set subtotal = subtotal + v_subtotal,
      tax_amount = tax_amount + v_tax,
      total_amount = total_amount + v_subtotal + v_tax,
      outstanding_amount = outstanding_amount + v_subtotal + v_tax,
      version = version + 1
  where id = p_invoice;

  perform app.audit(
    p_organization_id => v_invoice.organization_id,
    p_actor_id => v_user_id,
    p_action => 'PURCHASE_INVOICE.ADD_ITEMS',
    p_entity_type => 'PURCHASE_INVOICE',
    p_entity_id => p_invoice,
    p_result => 'SUCCESS',
    p_details => jsonb_build_object('item_count', jsonb_array_length(p_items))
  );

  return (select to_jsonb(inv) from public.purchase_invoices inv where inv.id = p_invoice);
end;
$$;

create or replace function public.set_purchase_invoice_status(
  p_invoice    uuid,
  p_status     text,
  p_reason     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id   uuid := app.current_user_id();
  v_invoice   record;
  v_action    text;
begin
  select * into v_invoice from public.purchase_invoices where id = p_invoice;
  if v_invoice is null then
    raise exception 'NIVAAS_NOT_FOUND: invoice not found';
  end if;

  perform app.evaluate_access(v_user_id, v_invoice.organization_id, 'purchase_invoice.edit');

  if p_status = 'POSTED' and v_invoice.status = 'DRAFT' then
    v_action := 'POST';
  elsif p_status = 'CANCELLED' and v_invoice.status in ('DRAFT', 'POSTED') then
    v_action := 'CANCEL';
  else
    raise exception 'NIVAAS_INVALID_STATE_TRANSITION: % → %', v_invoice.status, p_status;
  end if;

  update public.purchase_invoices
  set status = p_status,
      posted_at = case when p_status = 'POSTED' then now() else posted_at end,
      cancelled_at = case when p_status = 'CANCELLED' then now() else cancelled_at end,
      cancellation_reason = case when p_status = 'CANCELLED' then p_reason else cancellation_reason end,
      version = version + 1
  where id = p_invoice;

  perform app.audit(
    p_organization_id => v_invoice.organization_id,
    p_actor_id => v_user_id,
    p_action => 'PURCHASE_INVOICE.' || v_action,
    p_entity_type => 'PURCHASE_INVOICE',
    p_entity_id => p_invoice,
    p_result => 'SUCCESS',
    p_details => jsonb_build_object('from_status', v_invoice.status, 'to_status', p_status)
  );

  return (select to_jsonb(inv) from public.purchase_invoices inv where inv.id = p_invoice);
end;
$$;

-- =================================================================== doors: supplier payments

create or replace function public.record_supplier_payment(
  p_organization      uuid,
  p_property          uuid,
  p_outlet            uuid,
  p_supplier          uuid,
  p_payment_date      date,
  p_payment_method    text,
  p_amount            numeric,
  p_reference_number  text default null,
  p_notes             text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id       uuid := app.current_user_id();
  v_payment_num   text;
  v_payment       record;
begin
  perform app.evaluate_access(v_user_id, p_organization, 'supplier_payment.create');

  v_payment_num := public.generate_payment_number(p_organization);

  insert into public.supplier_payments (
    organization_id, property_id, outlet_id, supplier_id,
    payment_number, payment_date, payment_method, reference_number,
    total_amount, unallocated_amount, status, notes
  ) values (
    p_organization, p_property, p_outlet, p_supplier,
    v_payment_num, p_payment_date, p_payment_method, p_reference_number,
    p_amount, p_amount, 'POSTED', p_notes
  ) returning * into v_payment;

  perform app.audit(
    p_organization_id => p_organization,
    p_actor_id => v_user_id,
    p_action => 'SUPPLIER_PAYMENT.CREATE',
    p_entity_type => 'SUPPLIER_PAYMENT',
    p_entity_id => v_payment.id,
    p_result => 'SUCCESS',
    p_details => jsonb_build_object('payment_number', v_payment_num, 'amount', p_amount)
  );

  return to_jsonb(v_payment);
end;
$$;

create or replace function public.allocate_payment_to_invoice(
  p_payment       uuid,
  p_invoice       uuid,
  p_amount        numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id     uuid := app.current_user_id();
  v_payment     record;
  v_invoice     record;
  v_allocation  record;
begin
  select * into v_payment from public.supplier_payments where id = p_payment;
  if v_payment is null then
    raise exception 'NIVAAS_NOT_FOUND: payment not found';
  end if;

  select * into v_invoice from public.purchase_invoices where id = p_invoice;
  if v_invoice is null then
    raise exception 'NIVAAS_NOT_FOUND: invoice not found';
  end if;

  if v_payment.supplier_id <> v_invoice.supplier_id then
    raise exception 'NIVAAS_VALIDATION: payment and invoice must be for the same supplier';
  end if;

  if v_payment.status <> 'POSTED' then
    raise exception 'NIVAAS_INVALID_STATE: payment is not active';
  end if;

  if v_invoice.status not in ('POSTED', 'PARTIALLY_PAID') then
    raise exception 'NIVAAS_INVALID_STATE: invoice is not payable';
  end if;

  if p_amount > v_payment.unallocated_amount then
    raise exception 'NIVAAS_VALIDATION: allocation exceeds payment balance';
  end if;

  if p_amount > v_invoice.outstanding_amount then
    raise exception 'NIVAAS_VALIDATION: allocation exceeds invoice outstanding';
  end if;

  perform app.evaluate_access(v_user_id, v_payment.organization_id, 'supplier_payment.create');

  insert into public.payment_allocations (
    organization_id, payment_id, invoice_id, allocated_amount
  ) values (
    v_payment.organization_id, p_payment, p_invoice, p_amount
  ) returning * into v_allocation;

  update public.supplier_payments
  set allocated_amount = allocated_amount + p_amount,
      unallocated_amount = unallocated_amount - p_amount,
      version = version + 1
  where id = p_payment;

  update public.purchase_invoices
  set paid_amount = paid_amount + p_amount,
      outstanding_amount = outstanding_amount - p_amount,
      status = case
        when outstanding_amount - p_amount = 0 then 'FULLY_PAID'
        else 'PARTIALLY_PAID'
      end,
      version = version + 1
  where id = p_invoice;

  perform app.audit(
    p_organization_id => v_payment.organization_id,
    p_actor_id => v_user_id,
    p_action => 'PAYMENT_ALLOCATE',
    p_entity_type => 'PAYMENT_ALLOCATION',
    p_entity_id => v_allocation.id,
    p_result => 'SUCCESS',
    p_details => jsonb_build_object(
      'payment_id', p_payment,
      'invoice_id', p_invoice,
      'amount', p_amount
    )
  );

  return to_jsonb(v_allocation);
end;
$$;

-- =================================================================== doors: purchase returns

create or replace function public.create_purchase_return(
  p_organization    uuid,
  p_property        uuid,
  p_outlet          uuid,
  p_supplier        uuid,
  p_goods_receipt   uuid,
  p_return_date     date default null,
  p_notes           text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id     uuid := app.current_user_id();
  v_return_num  text;
  v_return      record;
begin
  perform app.evaluate_access(v_user_id, p_organization, 'purchase_return.create');

  v_return_num := public.generate_return_number(p_organization);

  insert into public.purchase_returns (
    organization_id, property_id, outlet_id, supplier_id, goods_receipt_id,
    return_number, return_date, status, notes
  ) values (
    p_organization, p_property, p_outlet, p_supplier, p_goods_receipt,
    v_return_num, coalesce(p_return_date, current_date), 'DRAFT', p_notes
  ) returning * into v_return;

  perform app.audit(
    p_organization_id => p_organization,
    p_actor_id => v_user_id,
    p_action => 'PURCHASE_RETURN.CREATE',
    p_entity_type => 'PURCHASE_RETURN',
    p_entity_id => v_return.id,
    p_result => 'SUCCESS',
    p_details => jsonb_build_object('return_number', v_return_num)
  );

  return to_jsonb(v_return);
end;
$$;

create or replace function public.post_purchase_return(
  p_return  uuid,
  p_items   jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id         uuid := app.current_user_id();
  v_return          record;
  v_item            jsonb;
  v_grn_item        record;
  v_ledger_id       uuid;
  v_idempotency_key text;
  v_already_posted  integer;
begin
  select * into v_return from public.purchase_returns where id = p_return;
  if v_return is null then
    raise exception 'NIVAAS_NOT_FOUND: return not found';
  end if;

  if v_return.status <> 'DRAFT' then
    raise exception 'NIVAAS_INVALID_STATE: return is not in DRAFT status';
  end if;

  perform app.evaluate_access(v_user_id, v_return.organization_id, 'purchase_return.post');

  for v_item in select * from jsonb_array_elements(p_items) loop
    select gri.*, ii.organization_id as item_org
    into v_grn_item
    from public.goods_receipt_items gri
    join public.inventory_items ii on ii.id = gri.item_id
    where gri.id = (v_item->>'goodsReceiptItemId')::uuid;

    if v_grn_item is null then
      raise exception 'NIVAAS_NOT_FOUND: GRN item not found';
    end if;

    if (v_item->>'quantity')::numeric > v_grn_item.accepted_quantity then
      raise exception 'NIVAAS_VALIDATION: return quantity exceeds accepted quantity';
    end if;

    v_idempotency_key := 'RETURN:' || p_return || ':ITEM:' || v_grn_item.id || ':RETURN';

    select count(*) into v_already_posted
    from public.stock_ledger
    where idempotency_key = v_idempotency_key;

    if v_already_posted > 0 then
      raise exception 'NIVAAS_DUPLICATE: return item already posted';
    end if;

    select public.post_stock_movement(
      p_organization => v_return.organization_id,
      p_property => v_return.property_id,
      p_outlet => v_return.outlet_id,
      p_location => v_grn_item.location_id,
      p_item => v_grn_item.item_id,
      p_movement_type => 'RETURN',
      p_quantity => (v_item->>'quantity')::numeric,
      p_unit => v_grn_item.unit_id,
      p_unit_cost => v_grn_item.unit_cost,
      p_document_type => 'PURCHASE_RETURN',
      p_document_id => p_return,
      p_idempotency_key => v_idempotency_key,
      p_batch_number => v_grn_item.batch_number,
      p_expiry_date => v_grn_item.expiry_date,
      p_reason => v_item->>'reason',
      p_notes => v_return.notes
    ) into v_ledger_id;

    insert into public.purchase_return_items (
      organization_id, return_id, goods_receipt_item_id, item_id,
      quantity, unit_id, unit_cost, total_cost, reason, ledger_id
    ) values (
      v_return.organization_id, p_return, v_grn_item.id, v_grn_item.item_id,
      (v_item->>'quantity')::numeric, v_grn_item.unit_id, v_grn_item.unit_cost,
      (v_item->>'quantity')::numeric * v_grn_item.unit_cost,
      v_item->>'reason', v_ledger_id
    );
  end loop;

  update public.purchase_returns
  set status = 'POSTED',
      posted_at = now(),
      version = version + 1
  where id = p_return;

  perform app.audit(
    p_organization_id => v_return.organization_id,
    p_actor_id => v_user_id,
    p_action => 'PURCHASE_RETURN.POST',
    p_entity_type => 'PURCHASE_RETURN',
    p_entity_id => p_return,
    p_result => 'SUCCESS',
    p_details => jsonb_build_object('item_count', jsonb_array_length(p_items))
  );

  return (select to_jsonb(ret) from public.purchase_returns ret where ret.id = p_return);
end;
$$;
