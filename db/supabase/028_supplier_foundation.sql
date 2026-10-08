-- AMRUT NIVAAS · 028 — supplier foundation (Prompt #07 §5-§8)
--
-- Supplier master data: suppliers, contacts, addresses, supplier-item mappings,
-- and price history. Every table is organization-scoped with RLS.
--
-- Key invariants:
--   - A supplier belongs to one organization.
--   - Supplier-item is many-to-many: a supplier sells many items, an item may be
--     purchased from many suppliers.
--   - Price history is append-only; never overwrite historical rates.
--   - Archive-never-delete for suppliers with transaction history.

set local search_path = '';

-- =================================================================== suppliers

create table if not exists public.suppliers (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  supplier_code        text not null,
  legal_name           text not null,
  display_name         text,
  supplier_type        text not null default 'OTHER',
  status               text not null default 'ACTIVE',
  tax_identifier       text,
  gstin                text,
  pan                  text,
  email                text,
  phone                text,
  website              text,
  payment_terms_days   integer not null default 0,
  credit_limit         numeric,
  currency             text not null default 'INR',
  notes                text,
  opening_balance      numeric not null default 0,
  version              integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  archived_at          timestamptz,
  created_by           uuid,

  constraint suppliers_code_not_blank check (btrim(supplier_code) <> ''),
  constraint suppliers_legal_name_not_blank check (btrim(legal_name) <> ''),
  constraint suppliers_credit_limit_positive check (credit_limit is null or credit_limit >= 0),
  constraint suppliers_opening_balance_check check (opening_balance >= 0),
  constraint suppliers_payment_terms_non_negative check (payment_terms_days >= 0),
  constraint suppliers_status_ok check (status in ('ACTIVE', 'INACTIVE', 'BLOCKED', 'ARCHIVED')),
  constraint suppliers_type_ok check (supplier_type in (
    'RAW_MATERIAL', 'FOOD', 'BEVERAGE', 'PACKAGING', 'CLEANING',
    'EQUIPMENT', 'MAINTENANCE', 'UTILITY', 'SERVICE', 'OTHER'
  ))
);

comment on table public.suppliers is
  'Supplier master. Organization-scoped. Archive-never-delete.';

-- Unique code per organization (active suppliers only).
drop index if exists public.suppliers_code_org_idx;
create unique index suppliers_code_org_idx
  on public.suppliers (organization_id, lower(supplier_code))
  where status not in ('ARCHIVED');

create index if not exists suppliers_org_idx
  on public.suppliers (organization_id);

create index if not exists suppliers_type_idx
  on public.suppliers (organization_id, supplier_type);

drop trigger if exists suppliers_touch on public.suppliers;
create trigger suppliers_touch before update on public.suppliers
  for each row execute function app.touch_updated_at();

-- RLS
drop policy if exists suppliers_read on public.suppliers;
create policy suppliers_read on public.suppliers
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists suppliers_no_write on public.suppliers;
create policy suppliers_no_write on public.suppliers
  for all to authenticated
  using (false);

-- =================================================================== supplier contacts

create table if not exists public.supplier_contacts (
  id                   uuid primary key default gen_random_uuid(),
  supplier_id          uuid not null references public.suppliers(id) on delete cascade,
  name                 text not null,
  designation          text,
  phone                text,
  email                text,
  is_primary           boolean not null default false,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint supplier_contacts_name_not_blank check (btrim(name) <> '')
);

comment on table public.supplier_contacts is
  'Multiple contacts per supplier (sales, accounts, delivery, etc.).';

create index if not exists supplier_contacts_supplier_idx
  on public.supplier_contacts (supplier_id);

drop trigger if exists supplier_contacts_touch on public.supplier_contacts;
create trigger supplier_contacts_touch before update on public.supplier_contacts
  for each row execute function app.touch_updated_at();

drop policy if exists supplier_contacts_read on public.supplier_contacts;
create policy supplier_contacts_read on public.supplier_contacts
  for select to authenticated
  using (supplier_id in (
    select s.id from public.suppliers s
    where s.organization_id in (
      select m.organization_id from public.organization_memberships m
      where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
    )
  ));

drop policy if exists supplier_contacts_no_write on public.supplier_contacts;
create policy supplier_contacts_no_write on public.supplier_contacts
  for all to authenticated
  using (false);

-- =================================================================== supplier addresses

create table if not exists public.supplier_addresses (
  id                   uuid primary key default gen_random_uuid(),
  supplier_id          uuid not null references public.suppliers(id) on delete cascade,
  address_type         text not null default 'OTHER',
  address_line1        text not null,
  address_line2        text,
  city                 text,
  state                text,
  postal_code          text,
  country              text not null default 'India',
  is_primary           boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint supplier_addresses_line1_not_blank check (btrim(address_line1) <> ''),
  constraint supplier_addresses_type_ok check (address_type in (
    'REGISTERED', 'BILLING', 'SHIPPING', 'WAREHOUSE', 'OTHER'
  ))
);

comment on table public.supplier_addresses is
  'Multiple addresses per supplier (registered, billing, shipping, warehouse).';

create index if not exists supplier_addresses_supplier_idx
  on public.supplier_addresses (supplier_id);

drop trigger if exists supplier_addresses_touch on public.supplier_addresses;
create trigger supplier_addresses_touch before update on public.supplier_addresses
  for each row execute function app.touch_updated_at();

drop policy if exists supplier_addresses_read on public.supplier_addresses;
create policy supplier_addresses_read on public.supplier_addresses
  for select to authenticated
  using (supplier_id in (
    select s.id from public.suppliers s
    where s.organization_id in (
      select m.organization_id from public.organization_memberships m
      where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
    )
  ));

drop policy if exists supplier_addresses_no_write on public.supplier_addresses;
create policy supplier_addresses_no_write on public.supplier_addresses
  for all to authenticated
  using (false);

-- =================================================================== supplier items

-- Many-to-many: a supplier sells many items, an item may come from many suppliers.
-- This allows comparing rates across suppliers without corrupting the item master.
create table if not exists public.supplier_items (
  id                   uuid primary key default gen_random_uuid(),
  supplier_id          uuid not null references public.suppliers(id) on delete cascade,
  inventory_item_id    uuid not null references public.inventory_items(id) on delete restrict,
  supplier_item_code   text,
  supplier_item_name   text,
  purchase_unit        uuid not null references public.units_of_measure(id) on delete restrict,
  conversion_to_base   numeric not null default 1,
  last_purchase_rate   numeric,
  standard_rate        numeric,
  minimum_order_qty    numeric,
  lead_time_days       integer,
  is_preferred         boolean not null default false,
  is_active            boolean not null default true,
  notes                text,
  version              integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint supplier_items_conversion_positive check (conversion_to_base > 0),
  constraint supplier_items_rate_positive check (last_purchase_rate is null or last_purchase_rate >= 0),
  constraint supplier_items_standard_positive check (standard_rate is null or standard_rate >= 0),
  constraint supplier_items_moq_positive check (minimum_order_qty is null or minimum_order_qty >= 0),
  constraint supplier_items_lead_time_positive check (lead_time_days is null or lead_time_days >= 0)
);

comment on table public.supplier_items is
  'Many-to-many: supplier ↔ inventory item. Stores supplier-specific pricing and terms.';

-- One active mapping per (supplier, item) pair.
drop index if exists public.supplier_items_pair_idx;
create unique index supplier_items_pair_idx
  on public.supplier_items (supplier_id, inventory_item_id)
  where is_active;

create index if not exists supplier_items_supplier_idx
  on public.supplier_items (supplier_id);

create index if not exists supplier_items_item_idx
  on public.supplier_items (inventory_item_id);

drop trigger if exists supplier_items_touch on public.supplier_items;
create trigger supplier_items_touch before update on public.supplier_items
  for each row execute function app.touch_updated_at();

drop policy if exists supplier_items_read on public.supplier_items;
create policy supplier_items_read on public.supplier_items
  for select to authenticated
  using (supplier_id in (
    select s.id from public.suppliers s
    where s.organization_id in (
      select m.organization_id from public.organization_memberships m
      where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
    )
  ));

drop policy if exists supplier_items_no_write on public.supplier_items;
create policy supplier_items_no_write on public.supplier_items
  for all to authenticated
  using (false);

-- =================================================================== supplier price history

-- Append-only history of purchase prices. Every GRN posted should create a row here.
-- This allows answering "what did we pay Supplier X for Item Y six months ago?"
create table if not exists public.supplier_price_history (
  id                   uuid primary key default gen_random_uuid(),
  supplier_id          uuid not null references public.suppliers(id) on delete restrict,
  inventory_item_id    uuid not null references public.inventory_items(id) on delete restrict,
  purchase_order_id    uuid,
  goods_receipt_id     uuid,
  purchase_date        date not null,
  quantity             numeric not null,
  purchase_unit        uuid not null references public.units_of_measure(id) on delete restrict,
  rate                 numeric not null,
  discount             numeric not null default 0,
  tax_amount           numeric not null default 0,
  freight_amount       numeric not null default 0,
  other_charges        numeric not null default 0,
  landed_rate          numeric,
  currency             text not null default 'INR',
  created_at           timestamptz not null default now(),

  constraint supplier_price_history_qty_positive check (quantity > 0),
  constraint supplier_price_history_rate_positive check (rate >= 0),
  constraint supplier_price_history_discount_non_negative check (discount >= 0),
  constraint supplier_price_history_tax_non_negative check (tax_amount >= 0),
  constraint supplier_price_history_freight_non_negative check (freight_amount >= 0),
  constraint supplier_price_history_other_non_negative check (other_charges >= 0),
  constraint supplier_price_history_landed_positive check (landed_rate is null or landed_rate >= 0)
);

comment on table public.supplier_price_history is
  'Append-only purchase price history. Never overwrite; always append.';

create index if not exists supplier_price_history_supplier_item_idx
  on public.supplier_price_history (supplier_id, inventory_item_id, purchase_date desc);

create index if not exists supplier_price_history_date_idx
  on public.supplier_price_history (purchase_date desc);

drop policy if exists supplier_price_history_read on public.supplier_price_history;
create policy supplier_price_history_read on public.supplier_price_history
  for select to authenticated
  using (supplier_id in (
    select s.id from public.suppliers s
    where s.organization_id in (
      select m.organization_id from public.organization_memberships m
      where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
    )
  ));

drop policy if exists supplier_price_history_no_write on public.supplier_price_history;
create policy supplier_price_history_no_write on public.supplier_price_history
  for all to authenticated
  using (false);

-- =================================================================== doors

-- create_supplier
create or replace function public.create_supplier(
  p_organization       uuid,
  p_supplier_code      text,
  p_legal_name         text,
  p_display_name       text default null,
  p_supplier_type      text default 'OTHER',
  p_tax_identifier     text default null,
  p_gstin              text default null,
  p_pan                text default null,
  p_email              text default null,
  p_phone              text default null,
  p_website            text default null,
  p_payment_terms_days integer default 0,
  p_credit_limit       numeric default null,
  p_currency           text default 'INR',
  p_notes              text default null,
  p_opening_balance    numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_row public.suppliers%rowtype;
begin
  perform app.require_session(v_user_id, null);
  perform app.evaluate_access(v_user_id, p_organization, null, null, 'supplier.create');

  insert into public.suppliers (
    organization_id, supplier_code, legal_name, display_name, supplier_type,
    tax_identifier, gstin, pan, email, phone, website,
    payment_terms_days, credit_limit, currency, notes, opening_balance, created_by
  ) values (
    p_organization, p_supplier_code, p_legal_name, p_display_name, p_supplier_type,
    p_tax_identifier, p_gstin, p_pan, p_email, p_phone, p_website,
    p_payment_terms_days, p_credit_limit, p_currency, p_notes, p_opening_balance, v_user_id
  ) returning * into v_row;

  perform app.audit(
    'SUPPLIER_CREATED', 'supplier', v_row.id,
    null, to_jsonb(v_row),
    null, jsonb_build_object('supplier_code', v_row.supplier_code)
  );

  return to_jsonb(v_row);
end;
$$;

-- update_supplier
create or replace function public.update_supplier(
  p_supplier           uuid,
  p_organization       uuid,
  p_expected_version   integer,
  p_legal_name         text default null,
  p_display_name       text default null,
  p_supplier_type      text default null,
  p_tax_identifier     text default null,
  p_gstin              text default null,
  p_pan                text default null,
  p_email              text default null,
  p_phone              text default null,
  p_website            text default null,
  p_payment_terms_days integer default null,
  p_credit_limit       numeric default null,
  p_currency           text default null,
  p_notes              text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.suppliers%rowtype;
  v_row public.suppliers%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.suppliers
  where id = p_supplier and organization_id = p_organization;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;

  perform app.evaluate_access(v_user_id, p_organization, null, null, 'supplier.edit');

  update public.suppliers set
    legal_name = coalesce(p_legal_name, v_old.legal_name),
    display_name = coalesce(p_display_name, v_old.display_name),
    supplier_type = coalesce(p_supplier_type, v_old.supplier_type),
    tax_identifier = coalesce(p_tax_identifier, v_old.tax_identifier),
    gstin = coalesce(p_gstin, v_old.gstin),
    pan = coalesce(p_pan, v_old.pan),
    email = coalesce(p_email, v_old.email),
    phone = coalesce(p_phone, v_old.phone),
    website = coalesce(p_website, v_old.website),
    payment_terms_days = coalesce(p_payment_terms_days, v_old.payment_terms_days),
    credit_limit = coalesce(p_credit_limit, v_old.credit_limit),
    currency = coalesce(p_currency, v_old.currency),
    notes = coalesce(p_notes, v_old.notes),
    version = version + 1
  where id = p_supplier returning * into v_row;

  perform app.audit(
    'SUPPLIER_UPDATED', 'supplier', v_row.id,
    to_jsonb(v_old), to_jsonb(v_row),
    null, jsonb_build_object('version', v_row.version)
  );

  return to_jsonb(v_row);
end;
$$;

-- archive_supplier
create or replace function public.archive_supplier(
  p_supplier           uuid,
  p_organization       uuid,
  p_expected_version   integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.suppliers%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.suppliers
  where id = p_supplier and organization_id = p_organization;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;

  perform app.evaluate_access(v_user_id, p_organization, null, null, 'supplier.archive');

  update public.suppliers set
    status = 'ARCHIVED',
    archived_at = now(),
    version = version + 1
  where id = p_supplier;

  perform app.audit(
    'SUPPLIER_ARCHIVED', 'supplier', p_supplier,
    to_jsonb(v_old), null,
    null, jsonb_build_object('version', v_old.version + 1)
  );
end;
$$;

-- set_supplier_status
create or replace function public.set_supplier_status(
  p_supplier           uuid,
  p_organization       uuid,
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
  v_old public.suppliers%rowtype;
  v_row public.suppliers%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.suppliers
  where id = p_supplier and organization_id = p_organization;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;

  perform app.evaluate_access(v_user_id, p_organization, null, null, 'supplier.edit');

  update public.suppliers set
    status = p_status,
    version = version + 1
  where id = p_supplier returning * into v_row;

  perform app.audit(
    'SUPPLIER_STATUS_CHANGED', 'supplier', v_row.id,
    to_jsonb(v_old), to_jsonb(v_row),
    null, jsonb_build_object('old_status', v_old.status, 'new_status', v_row.status)
  );

  return to_jsonb(v_row);
end;
$$;

-- create_supplier_contact
create or replace function public.create_supplier_contact(
  p_supplier           uuid,
  p_organization       uuid,
  p_name               text,
  p_designation        text default null,
  p_phone              text default null,
  p_email              text default null,
  p_is_primary         boolean default false,
  p_notes              text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_supplier_org uuid;
  v_row public.supplier_contacts%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select s.organization_id into v_supplier_org from public.suppliers s where s.id = p_supplier;
  if v_supplier_org is null or v_supplier_org <> p_organization then
    raise exception 'NIVAAS_SCOPE_MISMATCH';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, null, null, 'supplier.edit');

  -- If this is primary, unset other primaries
  if p_is_primary then
    update public.supplier_contacts set is_primary = false where supplier_id = p_supplier;
  end if;

  insert into public.supplier_contacts (
    supplier_id, name, designation, phone, email, is_primary, notes
  ) values (
    p_supplier, p_name, p_designation, p_phone, p_email, p_is_primary, p_notes
  ) returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

-- update_supplier_contact
create or replace function public.update_supplier_contact(
  p_contact            uuid,
  p_organization       uuid,
  p_name               text default null,
  p_designation        text default null,
  p_phone              text default null,
  p_email              text default null,
  p_is_primary         boolean default null,
  p_notes              text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_supplier_org uuid;
  v_row public.supplier_contacts%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select s.organization_id into v_supplier_org
  from public.supplier_contacts c
  join public.suppliers s on s.id = c.supplier_id
  where c.id = p_contact;

  if v_supplier_org is null or v_supplier_org <> p_organization then
    raise exception 'NIVAAS_SCOPE_MISMATCH';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, null, null, 'supplier.edit');

  if p_is_primary then
    update public.supplier_contacts c set is_primary = false
    from public.suppliers s
    where s.id = c.supplier_id and s.organization_id = p_organization
    and c.id <> p_contact;
  end if;

  update public.supplier_contacts set
    name = coalesce(p_name, name),
    designation = coalesce(p_designation, designation),
    phone = coalesce(p_phone, phone),
    email = coalesce(p_email, email),
    is_primary = coalesce(p_is_primary, is_primary),
    notes = coalesce(p_notes, notes)
  where id = p_contact returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

-- delete_supplier_contact
create or replace function public.delete_supplier_contact(
  p_contact            uuid,
  p_organization       uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_supplier_org uuid;
begin
  perform app.require_session(v_user_id, null);

  select s.organization_id into v_supplier_org
  from public.supplier_contacts c
  join public.suppliers s on s.id = c.supplier_id
  where c.id = p_contact;

  if v_supplier_org is null or v_supplier_org <> p_organization then
    raise exception 'NIVAAS_SCOPE_MISMATCH';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, null, null, 'supplier.edit');

  delete from public.supplier_contacts where id = p_contact;
end;
$$;

-- create_supplier_address
create or replace function public.create_supplier_address(
  p_supplier           uuid,
  p_organization       uuid,
  p_address_line1      text,
  p_address_type       text default 'OTHER',
  p_address_line2      text default null,
  p_city               text default null,
  p_state              text default null,
  p_postal_code        text default null,
  p_country            text default 'India',
  p_is_primary         boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_supplier_org uuid;
  v_row public.supplier_addresses%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select s.organization_id into v_supplier_org from public.suppliers s where s.id = p_supplier;
  if v_supplier_org is null or v_supplier_org <> p_organization then
    raise exception 'NIVAAS_SCOPE_MISMATCH';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, null, null, 'supplier.edit');

  if p_is_primary then
    update public.supplier_addresses set is_primary = false
    where supplier_id = p_supplier and address_type = p_address_type;
  end if;

  insert into public.supplier_addresses (
    supplier_id, address_type, address_line1, address_line2, city, state, postal_code, country, is_primary
  ) values (
    p_supplier, p_address_type, p_address_line1, p_address_line2, p_city, p_state, p_postal_code, p_country, p_is_primary
  ) returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

-- update_supplier_address
create or replace function public.update_supplier_address(
  p_address            uuid,
  p_organization       uuid,
  p_address_type       text default null,
  p_address_line1      text default null,
  p_address_line2      text default null,
  p_city               text default null,
  p_state              text default null,
  p_postal_code        text default null,
  p_country            text default null,
  p_is_primary         boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_supplier_org uuid;
  v_row public.supplier_addresses%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select s.organization_id into v_supplier_org
  from public.supplier_addresses a
  join public.suppliers s on s.id = a.supplier_id
  where a.id = p_address;

  if v_supplier_org is null or v_supplier_org <> p_organization then
    raise exception 'NIVAAS_SCOPE_MISMATCH';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, null, null, 'supplier.edit');

  update public.supplier_addresses set
    address_type = coalesce(p_address_type, address_type),
    address_line1 = coalesce(p_address_line1, address_line1),
    address_line2 = coalesce(p_address_line2, address_line2),
    city = coalesce(p_city, city),
    state = coalesce(p_state, state),
    postal_code = coalesce(p_postal_code, postal_code),
    country = coalesce(p_country, country),
    is_primary = coalesce(p_is_primary, is_primary)
  where id = p_address returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

-- delete_supplier_address
create or replace function public.delete_supplier_address(
  p_address            uuid,
  p_organization       uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_supplier_org uuid;
begin
  perform app.require_session(v_user_id, null);

  select s.organization_id into v_supplier_org
  from public.supplier_addresses a
  join public.suppliers s on s.id = a.supplier_id
  where a.id = p_address;

  if v_supplier_org is null or v_supplier_org <> p_organization then
    raise exception 'NIVAAS_SCOPE_MISMATCH';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, null, null, 'supplier.edit');

  delete from public.supplier_addresses where id = p_address;
end;
$$;

-- create_supplier_item
create or replace function public.create_supplier_item(
  p_supplier           uuid,
  p_organization       uuid,
  p_inventory_item     uuid,
  p_purchase_unit      uuid,
  p_conversion_to_base numeric default 1,
  p_supplier_item_code text default null,
  p_supplier_item_name text default null,
  p_last_purchase_rate numeric default null,
  p_standard_rate      numeric default null,
  p_minimum_order_qty  numeric default null,
  p_lead_time_days     integer default null,
  p_is_preferred       boolean default false,
  p_notes              text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_supplier_org uuid;
  v_item_org uuid;
  v_row public.supplier_items%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select s.organization_id into v_supplier_org from public.suppliers s where s.id = p_supplier;
  select i.organization_id into v_item_org from public.inventory_items i where i.id = p_inventory_item;

  if v_supplier_org is null or v_item_org is null then
    raise exception 'NIVAAS_NOT_FOUND';
  end if;
  if v_supplier_org <> p_organization or v_item_org <> p_organization then
    raise exception 'NIVAAS_SCOPE_MISMATCH';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, null, null, 'supplier.edit');

  -- Deactivate any existing mapping for this pair
  update public.supplier_items set is_active = false
  where supplier_id = p_supplier and inventory_item_id = p_inventory_item and is_active;

  insert into public.supplier_items (
    supplier_id, inventory_item_id, purchase_unit, conversion_to_base,
    supplier_item_code, supplier_item_name, last_purchase_rate, standard_rate,
    minimum_order_qty, lead_time_days, is_preferred, notes
  ) values (
    p_supplier, p_inventory_item, p_purchase_unit, p_conversion_to_base,
    p_supplier_item_code, p_supplier_item_name, p_last_purchase_rate, p_standard_rate,
    p_minimum_order_qty, p_lead_time_days, p_is_preferred, p_notes
  ) returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

-- update_supplier_item
create or replace function public.update_supplier_item(
  p_supplier_item      uuid,
  p_organization       uuid,
  p_purchase_unit      uuid default null,
  p_conversion_to_base numeric default null,
  p_supplier_item_code text default null,
  p_supplier_item_name text default null,
  p_last_purchase_rate numeric default null,
  p_standard_rate      numeric default null,
  p_minimum_order_qty  numeric default null,
  p_lead_time_days     integer default null,
  p_is_preferred       boolean default null,
  p_is_active          boolean default null,
  p_notes              text default null,
  p_expected_version   integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_supplier_org uuid;
  v_old public.supplier_items%rowtype;
  v_row public.supplier_items%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select s.organization_id into v_supplier_org
  from public.supplier_items si
  join public.suppliers s on s.id = si.supplier_id
  where si.id = p_supplier_item;

  if v_supplier_org is null or v_supplier_org <> p_organization then
    raise exception 'NIVAAS_SCOPE_MISMATCH';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, null, null, 'supplier.edit');

  select * into v_old from public.supplier_items where id = p_supplier_item;
  if p_expected_version is not null and v_old.version <> p_expected_version then
    raise exception 'NIVAAS_VERSION_CONFLICT';
  end if;

  update public.supplier_items set
    purchase_unit = coalesce(p_purchase_unit, purchase_unit),
    conversion_to_base = coalesce(p_conversion_to_base, conversion_to_base),
    supplier_item_code = coalesce(p_supplier_item_code, supplier_item_code),
    supplier_item_name = coalesce(p_supplier_item_name, supplier_item_name),
    last_purchase_rate = coalesce(p_last_purchase_rate, last_purchase_rate),
    standard_rate = coalesce(p_standard_rate, standard_rate),
    minimum_order_qty = coalesce(p_minimum_order_qty, minimum_order_qty),
    lead_time_days = coalesce(p_lead_time_days, lead_time_days),
    is_preferred = coalesce(p_is_preferred, is_preferred),
    is_active = coalesce(p_is_active, is_active),
    notes = coalesce(p_notes, notes),
    version = version + 1
  where id = p_supplier_item returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

-- record_supplier_price (called by GRN posting)
create or replace function public.record_supplier_price(
  p_supplier           uuid,
  p_organization       uuid,
  p_inventory_item     uuid,
  p_purchase_date      date,
  p_quantity           numeric,
  p_purchase_unit      uuid,
  p_rate               numeric,
  p_purchase_order_id  uuid default null,
  p_goods_receipt_id   uuid default null,
  p_discount           numeric default 0,
  p_tax_amount         numeric default 0,
  p_freight_amount     numeric default 0,
  p_other_charges      numeric default 0,
  p_landed_rate        numeric default null,
  p_currency           text default 'INR'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_supplier_org uuid;
  v_row public.supplier_price_history%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select s.organization_id into v_supplier_org from public.suppliers s where s.id = p_supplier;
  if v_supplier_org is null or v_supplier_org <> p_organization then
    raise exception 'NIVAAS_SCOPE_MISMATCH';
  end if;

  insert into public.supplier_price_history (
    supplier_id, inventory_item_id, purchase_order_id, goods_receipt_id,
    purchase_date, quantity, purchase_unit, rate, discount, tax_amount,
    freight_amount, other_charges, landed_rate, currency
  ) values (
    p_supplier, p_inventory_item, p_purchase_order_id, p_goods_receipt_id,
    p_purchase_date, p_quantity, p_purchase_unit, p_rate, p_discount, p_tax_amount,
    p_freight_amount, p_other_charges, p_landed_rate, p_currency
  ) returning * into v_row;

  -- Also update the last_purchase_rate on supplier_items
  update public.supplier_items set last_purchase_rate = p_rate
  where supplier_id = p_supplier and inventory_item_id = p_inventory_item and is_active;

  return to_jsonb(v_row);
end;
$$;

-- grant execute on all supplier doors
grant execute on function public.create_supplier to authenticated;
grant execute on function public.update_supplier to authenticated;
grant execute on function public.archive_supplier to authenticated;
grant execute on function public.set_supplier_status to authenticated;
grant execute on function public.create_supplier_contact to authenticated;
grant execute on function public.update_supplier_contact to authenticated;
grant execute on function public.delete_supplier_contact to authenticated;
grant execute on function public.create_supplier_address to authenticated;
grant execute on function public.update_supplier_address to authenticated;
grant execute on function public.delete_supplier_address to authenticated;
grant execute on function public.create_supplier_item to authenticated;
grant execute on function public.update_supplier_item to authenticated;
grant execute on function public.record_supplier_price to authenticated;
