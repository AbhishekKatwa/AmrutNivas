-- AMRUT NIVAAS · 029 — purchase orders (Prompt #07 §10-§17)
--
-- Purchase requests, purchase orders, order items, and additional charges.
-- The PO is the central procurement document. It tracks what was ordered,
-- from whom, at what price, with what additional charges.
--
-- Key invariants:
--   - PO number is human-readable and unique per organization (PO-2026-000001).
--   - State machine is enforced: DRAFT → PENDING_APPROVAL → APPROVED → SENT → etc.
--   - Additional charges have a payable-to party (supplier, transporter, etc.).
--   - All money is NUMERIC, never floats.

set local search_path = '';

-- =================================================================== purchase requests

create table if not exists public.purchase_requests (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  property_id          uuid not null references public.properties(id) on delete restrict,
  outlet_id            uuid references public.outlets(id) on delete restrict,
  requested_by         uuid not null,
  request_date         date not null default current_date,
  required_by_date     date,
  reason               text,
  priority             text not null default 'NORMAL',
  status               text not null default 'DRAFT',
  notes                text,
  version              integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint purchase_requests_priority_ok check (priority in ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  constraint purchase_requests_status_ok check (status in (
    'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED', 'CONVERTED_TO_PO'
  ))
);

comment on table public.purchase_requests is
  'Lightweight request workflow: staff requests → manager approves → procurement creates PO.';

create index if not exists purchase_requests_org_idx
  on public.purchase_requests (organization_id);

create index if not exists purchase_requests_property_idx
  on public.purchase_requests (property_id);

create index if not exists purchase_requests_status_idx
  on public.purchase_requests (organization_id, status);

drop trigger if exists purchase_requests_touch on public.purchase_requests;
create trigger purchase_requests_touch before update on public.purchase_requests
  for each row execute function app.touch_updated_at();

drop policy if exists purchase_requests_read on public.purchase_requests;
create policy purchase_requests_read on public.purchase_requests
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists purchase_requests_no_write on public.purchase_requests;
create policy purchase_requests_no_write on public.purchase_requests
  for all to authenticated
  using (false);

-- =================================================================== purchase request items

create table if not exists public.purchase_request_items (
  id                   uuid primary key default gen_random_uuid(),
  purchase_request_id  uuid not null references public.purchase_requests(id) on delete cascade,
  inventory_item_id    uuid not null references public.inventory_items(id) on delete restrict,
  requested_quantity   numeric not null,
  uom                  uuid not null references public.units_of_measure(id) on delete restrict,
  notes                text,
  created_at           timestamptz not null default now(),

  constraint purchase_request_items_qty_positive check (requested_quantity > 0)
);

create index if not exists purchase_request_items_request_idx
  on public.purchase_request_items (purchase_request_id);

drop policy if exists purchase_request_items_read on public.purchase_request_items;
create policy purchase_request_items_read on public.purchase_request_items
  for select to authenticated
  using (purchase_request_id in (
    select pr.id from public.purchase_requests pr
    where pr.organization_id in (
      select m.organization_id from public.organization_memberships m
      where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
    )
  ));

drop policy if exists purchase_request_items_no_write on public.purchase_request_items;
create policy purchase_request_items_no_write on public.purchase_request_items
  for all to authenticated
  using (false);

-- =================================================================== purchase orders

create table if not exists public.purchase_orders (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  property_id          uuid not null references public.properties(id) on delete restrict,
  outlet_id            uuid references public.outlets(id) on delete restrict,
  supplier_id          uuid not null references public.suppliers(id) on delete restrict,
  po_number            text not null,
  order_date           date not null default current_date,
  expected_delivery    date,
  currency             text not null default 'INR',
  payment_terms_days   integer,
  status               text not null default 'DRAFT',
  notes                text,

  -- Calculated totals (denormalized for performance; doors enforce consistency)
  subtotal             numeric not null default 0,
  total_discount       numeric not null default 0,
  total_tax            numeric not null default 0,
  total_freight        numeric not null default 0,
  total_other_charges  numeric not null default 0,
  grand_total          numeric not null default 0,

  -- Received totals (updated by GRN posting)
  total_received       numeric not null default 0,

  created_by           uuid not null,
  approved_by          uuid,
  approved_at          timestamptz,
  sent_at              timestamptz,
  closed_at            timestamptz,
  cancelled_at         timestamptz,
  cancellation_reason  text,

  version              integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint purchase_orders_po_number_not_blank check (btrim(po_number) <> ''),
  constraint purchase_orders_payment_terms_non_negative check (payment_terms_days is null or payment_terms_days >= 0),
  constraint purchase_orders_totals_non_negative check (
    subtotal >= 0 and total_discount >= 0 and total_tax >= 0 and
    total_freight >= 0 and total_other_charges >= 0 and grand_total >= 0 and total_received >= 0
  ),
  constraint purchase_orders_status_ok check (status in (
    'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED',
    'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED'
  ))
);

comment on table public.purchase_orders is
  'Central procurement document. Tracks ordered quantities, received quantities, and totals.';

-- Unique PO number per organization.
drop index if exists public.purchase_orders_po_number_org_idx;
create unique index purchase_orders_po_number_org_idx
  on public.purchase_orders (organization_id, po_number);

create index if not exists purchase_orders_org_idx
  on public.purchase_orders (organization_id);

create index if not exists purchase_orders_supplier_idx
  on public.purchase_orders (supplier_id);

create index if not exists purchase_orders_property_idx
  on public.purchase_orders (property_id);

create index if not exists purchase_orders_status_idx
  on public.purchase_orders (organization_id, status);

create index if not exists purchase_orders_date_idx
  on public.purchase_orders (organization_id, order_date desc);

drop trigger if exists purchase_orders_touch on public.purchase_orders;
create trigger purchase_orders_touch before update on public.purchase_orders
  for each row execute function app.touch_updated_at();

drop policy if exists purchase_orders_read on public.purchase_orders;
create policy purchase_orders_read on public.purchase_orders
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists purchase_orders_no_write on public.purchase_orders;
create policy purchase_orders_no_write on public.purchase_orders
  for all to authenticated
  using (false);

-- =================================================================== purchase order items

create table if not exists public.purchase_order_items (
  id                   uuid primary key default gen_random_uuid(),
  purchase_order_id    uuid not null references public.purchase_orders(id) on delete cascade,
  inventory_item_id    uuid not null references public.inventory_items(id) on delete restrict,
  description          text,
  ordered_quantity     numeric not null,
  received_quantity    numeric not null default 0,
  uom                  uuid not null references public.units_of_measure(id) on delete restrict,
  unit_rate            numeric not null,
  discount             numeric not null default 0,
  tax_rate             numeric not null default 0,
  line_subtotal        numeric not null,
  line_discount        numeric not null default 0,
  line_tax             numeric not null default 0,
  line_total           numeric not null,
  notes                text,
  created_at           timestamptz not null default now(),

  constraint purchase_order_items_qty_positive check (ordered_quantity > 0),
  constraint purchase_order_items_received_non_negative check (received_quantity >= 0),
  constraint purchase_order_items_rate_positive check (unit_rate >= 0),
  constraint purchase_order_items_discount_non_negative check (discount >= 0),
  constraint purchase_order_items_tax_non_negative check (tax_rate >= 0),
  constraint purchase_order_items_line_non_negative check (
    line_subtotal >= 0 and line_discount >= 0 and line_tax >= 0 and line_total >= 0
  ),
  constraint purchase_order_items_received_check check (received_quantity <= ordered_quantity)
);

comment on table public.purchase_order_items is
  'Line items on a PO. received_quantity is updated by GRN posting.';

create index if not exists purchase_order_items_order_idx
  on public.purchase_order_items (purchase_order_id);

create index if not exists purchase_order_items_item_idx
  on public.purchase_order_items (inventory_item_id);

drop policy if exists purchase_order_items_read on public.purchase_order_items;
create policy purchase_order_items_read on public.purchase_order_items
  for select to authenticated
  using (purchase_order_id in (
    select po.id from public.purchase_orders po
    where po.organization_id in (
      select m.organization_id from public.organization_memberships m
      where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
    )
  ));

drop policy if exists purchase_order_items_no_write on public.purchase_order_items;
create policy purchase_order_items_no_write on public.purchase_order_items
  for all to authenticated
  using (false);

-- =================================================================== purchase charges (additional charges)

-- Freight, transport, loading, etc. Each charge has a payable-to party.
-- This prevents the common mistake of adding freight to the supplier's total
-- when the freight was actually paid to a transporter.
create table if not exists public.purchase_charges (
  id                   uuid primary key default gen_random_uuid(),
  purchase_order_id    uuid not null references public.purchase_orders(id) on delete cascade,
  charge_type          text not null,
  description          text,
  amount               numeric not null,
  tax_amount           numeric not null default 0,
  currency             text not null default 'INR',
  payable_to_type      text not null default 'SUPPLIER',
  payable_to_supplier_id uuid references public.suppliers(id) on delete restrict,
  expense_category     text,
  capitalize_to_inventory boolean not null default false,
  allocation_method    text,
  notes                text,
  created_at           timestamptz not null default now(),

  constraint purchase_charges_amount_positive check (amount >= 0),
  constraint purchase_charges_tax_non_negative check (tax_amount >= 0),
  constraint purchase_charges_type_ok check (charge_type in (
    'FREIGHT', 'TRANSPORT', 'LOADING', 'UNLOADING', 'HANDLING', 'INSURANCE', 'OTHER'
  )),
  constraint purchase_charges_payable_ok check (payable_to_type in (
    'SUPPLIER', 'TRANSPORTER', 'OTHER_VENDOR', 'EMPLOYEE', 'CASH', 'OTHER'
  )),
  constraint purchase_charges_allocation_ok check (allocation_method is null or allocation_method in (
    'BY_VALUE', 'BY_QUANTITY', 'BY_WEIGHT', 'BY_VOLUME', 'EQUAL', 'MANUAL'
  )),
  constraint purchase_charges_payable_supplier_check check (
    payable_to_type <> 'SUPPLIER' or payable_to_supplier_id is not null
  )
);

comment on table public.purchase_charges is
  'Additional charges on a PO (freight, loading, etc.). Each has a payable-to party.';

create index if not exists purchase_charges_order_idx
  on public.purchase_charges (purchase_order_id);

drop policy if exists purchase_charges_read on public.purchase_charges;
create policy purchase_charges_read on public.purchase_charges
  for select to authenticated
  using (purchase_order_id in (
    select po.id from public.purchase_orders po
    where po.organization_id in (
      select m.organization_id from public.organization_memberships m
      where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
    )
  ));

drop policy if exists purchase_charges_no_write on public.purchase_charges;
create policy purchase_charges_no_write on public.purchase_charges
  for all to authenticated
  using (false);

-- =================================================================== PO number generation

-- Generate a human-friendly PO number: PO-YYYY-NNNNNN
create or replace function public.generate_po_number(p_organization uuid)
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
  from public.purchase_orders
  where organization_id = p_organization
    and extract(year from order_date) = v_year;

  v_number := 'PO-' || v_year || '-' || lpad((v_count + 1)::text, 6, '0');
  return v_number;
end;
$$;

-- =================================================================== purchase request doors

create or replace function public.create_purchase_request(
  p_organization       uuid,
  p_property           uuid,
  p_outlet             uuid default null,
  p_required_by_date   date default null,
  p_reason             text default null,
  p_priority           text default 'NORMAL',
  p_notes              text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_row public.purchase_requests%rowtype;
begin
  perform app.require_session(v_user_id, null);
  perform app.evaluate_access(v_user_id, p_organization, p_property, p_outlet, 'purchase_request.create');

  insert into public.purchase_requests (
    organization_id, property_id, outlet_id, requested_by, required_by_date, reason, priority, notes
  ) values (
    p_organization, p_property, p_outlet, v_user_id, p_required_by_date, p_reason, p_priority, p_notes
  ) returning * into v_row;

  perform app.audit(
    'PURCHASE_REQUEST_CREATED', 'purchase_request', v_row.id,
    null, to_jsonb(v_row),
    null, jsonb_build_object('priority', v_row.priority)
  );

  return to_jsonb(v_row);
end;
$$;

create or replace function public.add_purchase_request_items(
  p_request            uuid,
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
  v_request_org uuid;
  v_item jsonb;
begin
  perform app.require_session(v_user_id, null);

  select pr.organization_id into v_request_org from public.purchase_requests pr where pr.id = p_request;
  if v_request_org is null or v_request_org <> p_organization then
    raise exception 'NIVAAS_SCOPE_MISMATCH';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, null, null, 'purchase_request.edit');

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.purchase_request_items (
      purchase_request_id, inventory_item_id, requested_quantity, uom, notes
    ) values (
      p_request,
      (v_item->>'inventoryItemId')::uuid,
      (v_item->>'requestedQuantity')::numeric,
      (v_item->>'uom')::uuid,
      v_item->>'notes'
    );
  end loop;
end;
$$;

create or replace function public.set_purchase_request_status(
  p_request            uuid,
  p_organization       uuid,
  p_status             text,
  p_expected_version   integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.purchase_requests%rowtype;
  v_row public.purchase_requests%rowtype;
  v_perm text;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.purchase_requests
  where id = p_request and organization_id = p_organization;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if p_expected_version is not null and v_old.version <> p_expected_version then
    raise exception 'NIVAAS_VERSION_CONFLICT';
  end if;

  -- Map status to permission
  v_perm := case p_status
    when 'SUBMITTED' then 'purchase_request.submit'
    when 'APPROVED' then 'purchase_request.approve'
    when 'REJECTED' then 'purchase_request.reject'
    when 'CANCELLED' then 'purchase_request.edit'
    else 'purchase_request.edit'
  end;

  perform app.evaluate_access(v_user_id, p_organization, null, null, v_perm);

  -- Validate state transitions
  if not (
    (v_old.status = 'DRAFT' and p_status in ('SUBMITTED', 'CANCELLED')) or
    (v_old.status = 'SUBMITTED' and p_status in ('UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED')) or
    (v_old.status = 'UNDER_REVIEW' and p_status in ('APPROVED', 'REJECTED')) or
    (v_old.status = 'APPROVED' and p_status = 'CONVERTED_TO_PO')
  ) then
    raise exception 'NIVAAS_INVALID_STATE_TRANSITION: % → %', v_old.status, p_status;
  end if;

  update public.purchase_requests set
    status = p_status,
    version = version + 1
  where id = p_request returning * into v_row;

  perform app.audit(
    'PURCHASE_REQUEST_STATUS_CHANGED', 'purchase_request', v_row.id,
    to_jsonb(v_old), to_jsonb(v_row),
    null, jsonb_build_object('old_status', v_old.status, 'new_status', v_row.status)
  );

  return to_jsonb(v_row);
end;
$$;

-- =================================================================== purchase order doors

create or replace function public.create_purchase_order(
  p_organization       uuid,
  p_property           uuid,
  p_supplier           uuid,
  p_outlet             uuid default null,
  p_order_date         date default null,
  p_expected_delivery  date default null,
  p_currency           text default 'INR',
  p_payment_terms_days integer default null,
  p_notes              text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_po_number text;
  v_supplier_org uuid;
  v_row public.purchase_orders%rowtype;
begin
  perform app.require_session(v_user_id, null);

  -- Validate supplier belongs to organization
  select s.organization_id into v_supplier_org from public.suppliers s where s.id = p_supplier;
  if v_supplier_org is null or v_supplier_org <> p_organization then
    raise exception 'NIVAAS_SCOPE_MISMATCH';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, p_outlet, 'purchase_order.create');

  v_po_number := public.generate_po_number(p_organization);

  insert into public.purchase_orders (
    organization_id, property_id, outlet_id, supplier_id, po_number,
    order_date, expected_delivery, currency, payment_terms_days, notes, created_by
  ) values (
    p_organization, p_property, p_outlet, p_supplier, v_po_number,
    coalesce(p_order_date, current_date), p_expected_delivery, p_currency, p_payment_terms_days, p_notes, v_user_id
  ) returning * into v_row;

  perform app.audit(
    'PURCHASE_ORDER_CREATED', 'purchase_order', v_row.id,
    null, to_jsonb(v_row),
    null, jsonb_build_object('po_number', v_row.po_number, 'supplier_id', p_supplier)
  );

  return to_jsonb(v_row);
end;
$$;

create or replace function public.add_purchase_order_items(
  p_order              uuid,
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
  v_order_org uuid;
  v_order_status text;
  v_item jsonb;
  v_line_subtotal numeric;
  v_line_discount numeric;
  v_line_tax numeric;
  v_line_total numeric;
begin
  perform app.require_session(v_user_id, null);

  select po.organization_id, po.status into v_order_org, v_order_status
  from public.purchase_orders po where po.id = p_order;

  if v_order_org is null or v_order_org <> p_organization then
    raise exception 'NIVAAS_SCOPE_MISMATCH';
  end if;

  if v_order_status not in ('DRAFT', 'PENDING_APPROVAL') then
    raise exception 'NIVAAS_INVALID_STATE: cannot add items to %', v_order_status;
  end if;

  perform app.evaluate_access(v_user_id, p_organization, null, null, 'purchase_order.edit');

  for v_item in select * from jsonb_array_elements(p_items) loop
    -- Calculate line totals
    v_line_subtotal := (v_item->>'orderedQuantity')::numeric * (v_item->>'unitRate')::numeric;
    v_line_discount := coalesce((v_item->>'discount')::numeric, 0);
    v_line_tax := (v_line_subtotal - v_line_discount) * coalesce((v_item->>'taxRate')::numeric, 0) / 100;
    v_line_total := v_line_subtotal - v_line_discount + v_line_tax;

    insert into public.purchase_order_items (
      purchase_order_id, inventory_item_id, description, ordered_quantity, uom,
      unit_rate, discount, tax_rate, line_subtotal, line_discount, line_tax, line_total, notes
    ) values (
      p_order,
      (v_item->>'inventoryItemId')::uuid,
      v_item->>'description',
      (v_item->>'orderedQuantity')::numeric,
      (v_item->>'uom')::uuid,
      (v_item->>'unitRate')::numeric,
      v_line_discount,
      coalesce((v_item->>'taxRate')::numeric, 0),
      v_line_subtotal,
      v_line_discount,
      v_line_tax,
      v_line_total,
      v_item->>'notes'
    );
  end loop;

  -- Recalculate order totals
  perform public.recalculate_purchase_order_totals(p_order, p_organization);
end;
$$;

-- Recalculate PO totals from line items + charges
create or replace function public.recalculate_purchase_order_totals(
  p_order              uuid,
  p_organization       uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subtotal numeric;
  v_discount numeric;
  v_tax numeric;
  v_freight numeric;
  v_other numeric;
begin
  select
    coalesce(sum(line_subtotal), 0),
    coalesce(sum(line_discount), 0),
    coalesce(sum(line_tax), 0)
  into v_subtotal, v_discount, v_tax
  from public.purchase_order_items
  where purchase_order_id = p_order;

  select
    coalesce(sum(amount) filter (where charge_type = 'FREIGHT'), 0),
    coalesce(sum(amount) filter (where charge_type <> 'FREIGHT'), 0)
  into v_freight, v_other
  from public.purchase_charges
  where purchase_order_id = p_order;

  update public.purchase_orders set
    subtotal = v_subtotal,
    total_discount = v_discount,
    total_tax = v_tax,
    total_freight = v_freight,
    total_other_charges = v_other,
    grand_total = v_subtotal - v_discount + v_tax + v_freight + v_other
  where id = p_order;
end;
$$;

create or replace function public.add_purchase_charge(
  p_order              uuid,
  p_organization       uuid,
  p_charge_type        text,
  p_amount             numeric,
  p_description        text default null,
  p_tax_amount         numeric default 0,
  p_payable_to_type    text default 'SUPPLIER',
  p_payable_to_supplier uuid default null,
  p_expense_category   text default null,
  p_capitalize         boolean default false,
  p_allocation_method  text default null,
  p_notes              text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_order_org uuid;
  v_order_status text;
  v_row public.purchase_charges%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select po.organization_id, po.status into v_order_org, v_order_status
  from public.purchase_orders po where po.id = p_order;

  if v_order_org is null or v_order_org <> p_organization then
    raise exception 'NIVAAS_SCOPE_MISMATCH';
  end if;

  if v_order_status not in ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT') then
    raise exception 'NIVAAS_INVALID_STATE: cannot add charges to %', v_order_status;
  end if;

  perform app.evaluate_access(v_user_id, p_organization, null, null, 'purchase_order.edit');

  insert into public.purchase_charges (
    purchase_order_id, charge_type, description, amount, tax_amount,
    payable_to_type, payable_to_supplier_id, expense_category,
    capitalize_to_inventory, allocation_method, notes
  ) values (
    p_order, p_charge_type, p_description, p_amount, p_tax_amount,
    p_payable_to_type, p_payable_to_supplier, p_expense_category,
    p_capitalize, p_allocation_method, p_notes
  ) returning * into v_row;

  perform public.recalculate_purchase_order_totals(p_order, p_organization);

  return to_jsonb(v_row);
end;
$$;

create or replace function public.set_purchase_order_status(
  p_order              uuid,
  p_organization       uuid,
  p_status             text,
  p_reason             text default null,
  p_expected_version   integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.purchase_orders%rowtype;
  v_row public.purchase_orders%rowtype;
  v_perm text;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.purchase_orders
  where id = p_order and organization_id = p_organization;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if p_expected_version is not null and v_old.version <> p_expected_version then
    raise exception 'NIVAAS_VERSION_CONFLICT';
  end if;

  -- Map status to permission
  v_perm := case p_status
    when 'PENDING_APPROVAL' then 'purchase_order.submit'
    when 'APPROVED' then 'purchase_order.approve'
    when 'SENT' then 'purchase_order.send'
    when 'CANCELLED' then 'purchase_order.cancel'
    when 'CLOSED' then 'purchase_order.close'
    else 'purchase_order.edit'
  end;

  perform app.evaluate_access(v_user_id, p_organization, null, null, v_perm);

  -- Validate state transitions
  if not (
    (v_old.status = 'DRAFT' and p_status in ('PENDING_APPROVAL', 'CANCELLED')) or
    (v_old.status = 'PENDING_APPROVAL' and p_status in ('APPROVED', 'REJECTED', 'CANCELLED')) or
    (v_old.status = 'APPROVED' and p_status in ('SENT', 'CANCELLED')) or
    (v_old.status = 'SENT' and p_status in ('PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED')) or
    (v_old.status = 'PARTIALLY_RECEIVED' and p_status in ('RECEIVED', 'CLOSED')) or
    (v_old.status = 'RECEIVED' and p_status = 'CLOSED')
  ) then
    raise exception 'NIVAAS_INVALID_STATE_TRANSITION: % → %', v_old.status, p_status;
  end if;

  update public.purchase_orders set
    status = p_status,
    approved_by = case when p_status = 'APPROVED' then v_user_id else approved_by end,
    approved_at = case when p_status = 'APPROVED' then now() else approved_at end,
    sent_at = case when p_status = 'SENT' then now() else sent_at end,
    closed_at = case when p_status = 'CLOSED' then now() else closed_at end,
    cancelled_at = case when p_status = 'CANCELLED' then now() else cancelled_at end,
    cancellation_reason = case when p_status = 'CANCELLED' then p_reason else cancellation_reason end,
    version = version + 1
  where id = p_order returning * into v_row;

  perform app.audit(
    'PURCHASE_ORDER_STATUS_CHANGED', 'purchase_order', v_row.id,
    to_jsonb(v_old), to_jsonb(v_row),
    p_reason, jsonb_build_object('old_status', v_old.status, 'new_status', v_row.status)
  );

  return to_jsonb(v_row);
end;
$$;

create or replace function public.update_purchase_order_item_received(
  p_item               uuid,
  p_organization       uuid,
  p_received_delta     numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_org uuid;
  v_order_id uuid;
  v_new_received numeric;
  v_ordered numeric;
begin
  -- This is called internally by GRN posting
  select poi.purchase_order_id, poi.ordered_quantity, poi.received_quantity + p_received_delta
  into v_order_id, v_ordered, v_new_received
  from public.purchase_order_items poi
  join public.purchase_orders po on po.id = poi.purchase_order_id
  where poi.id = p_item and po.organization_id = p_organization;

  if v_order_id is null then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_new_received > v_ordered then raise exception 'NIVAAS_OVER_RECEIVE'; end if;

  update public.purchase_order_items set received_quantity = received_quantity + p_received_delta
  where id = p_item;

  -- Update order total_received
  update public.purchase_orders set
    total_received = (select coalesce(sum(received_quantity), 0) from public.purchase_order_items where purchase_order_id = v_order_id)
  where id = v_order_id;
end;
$$;

-- grants
grant execute on function public.generate_po_number to authenticated;
grant execute on function public.create_purchase_request to authenticated;
grant execute on function public.add_purchase_request_items to authenticated;
grant execute on function public.set_purchase_request_status to authenticated;
grant execute on function public.create_purchase_order to authenticated;
grant execute on function public.add_purchase_order_items to authenticated;
grant execute on function public.add_purchase_charge to authenticated;
grant execute on function public.set_purchase_order_status to authenticated;
grant execute on function public.recalculate_purchase_order_totals to authenticated;
grant execute on function public.update_purchase_order_item_received to authenticated;
