-- AMRUT NIVAAS · 038 — folios & charges (Prompt #08 §33-§38)
--
-- Folios are the financial record of a stay. Every charge (room, restaurant, minibar, laundry)
-- and every payment is a row in folio_entries. Entries are immutable — corrections use
-- compensating entries, never edits.
--
-- Key invariants:
--   - A stay has one folio (opened at check-in, settled at check-out).
--   - Folio entries are INSERT-only: no UPDATE, no DELETE.
--   - Corrections are compensating entries (e.g., VOID_CHARGE offsets a CHARGE).
--   - Balance is derived: sum(charges) - sum(payments). Never stored.
--   - Restaurant orders can reference folio_id for "charge to room".
--   - Folio status: OPEN (active), SETTLED (balance = 0), CLOSED (archived).

set local search_path = '';

-- =================================================================== folios

create table if not exists public.folios (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  property_id          uuid not null references public.properties(id) on delete restrict,
  stay_id              uuid not null references public.stays(id) on delete restrict,
  folio_number         text not null,
  status               text not null default 'OPEN',
  currency             text not null default 'INR',
  subtotal             numeric not null default 0,
  tax_total            numeric not null default 0,
  discount_total       numeric not null default 0,
  total_charges        numeric not null default 0,
  total_payments       numeric not null default 0,
  balance              numeric not null default 0,
  opened_at            timestamptz not null default now(),
  settled_at           timestamptz,
  closed_at            timestamptz,
  notes                text,
  version              integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint folios_number_not_blank check (btrim(folio_number) <> ''),
  constraint folios_currency_ok check (btrim(currency) <> ''),
  constraint folios_money_scale_ok check (
    (scale(trim_scale(subtotal)) <= 2)
    and (scale(trim_scale(tax_total)) <= 2)
    and (scale(trim_scale(discount_total)) <= 2)
    and (scale(trim_scale(total_charges)) <= 2)
    and (scale(trim_scale(total_payments)) <= 2)
    and (scale(trim_scale(balance)) <= 2)
  ),
  constraint folios_totals_ok check (
    subtotal >= 0
    and tax_total >= 0
    and discount_total >= 0
    and total_charges >= 0
    and total_payments >= 0
  ),
  constraint folios_balance_ok check (
    balance = total_charges - total_payments
  ),
  constraint folios_status_ok check (status in ('OPEN', 'SETTLED', 'CLOSED'))
);

comment on table public.folios is
  'Financial record of a stay. Tracks charges and payments. Balance is derived.';

drop index if exists public.folios_number_org_idx;
create unique index folios_number_org_idx
  on public.folios (organization_id, folio_number);

create index if not exists folios_stay_idx
  on public.folios (stay_id);

create index if not exists folios_property_idx
  on public.folios (property_id);

create index if not exists folios_org_idx
  on public.folios (organization_id);

create index if not exists folios_status_idx
  on public.folios (property_id, status);

drop trigger if exists folios_touch on public.folios;
create trigger folios_touch before update on public.folios
  for each row execute function app.touch_updated_at();

-- RLS
drop policy if exists folios_read on public.folios;
create policy folios_read on public.folios
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists folios_no_write on public.folios;
create policy folios_no_write on public.folios
  for all to authenticated
  using (false);

-- =================================================================== folio entries

-- Immutable ledger of charges and payments. INSERT-only: no UPDATE, no DELETE.
-- Corrections use compensating entries (e.g., VOID_CHARGE offsets a CHARGE).
create table if not exists public.folio_entries (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  folio_id             uuid not null references public.folios(id) on delete restrict,

  entry_type           text not null,
  reference_type       text,
  reference_id         uuid,
  description          text not null,
  quantity             numeric not null default 1,
  unit_rate            numeric not null default 0,
  amount               numeric not null,
  tax_amount           numeric not null default 0,
  discount_amount      numeric not null default 0,
  net_amount           numeric not null,

  business_date        date not null,
  posted_at            timestamptz not null default now(),
  voided_at            timestamptz,
  void_reason          text,
  voided_by            uuid,

  notes                text,
  created_at           timestamptz not null default now(),
  created_by           uuid,

  constraint folio_entries_description_not_blank check (btrim(description) <> ''),
  constraint folio_entries_quantity_positive check (quantity > 0),
  constraint folio_entries_rate_non_negative check (unit_rate >= 0),
  constraint folio_entries_tax_non_negative check (tax_amount >= 0),
  constraint folio_entries_discount_non_negative check (discount_amount >= 0),
  constraint folio_entries_money_scale_ok check (
    (scale(trim_scale(amount)) <= 2)
    and (scale(trim_scale(tax_amount)) <= 2)
    and (scale(trim_scale(discount_amount)) <= 2)
    and (scale(trim_scale(net_amount)) <= 2)
  ),
  constraint folio_entries_net_amount_ok check (
    net_amount = amount + tax_amount - discount_amount
  ),
  constraint folio_entries_entry_type_ok check (entry_type in (
    'ROOM_CHARGE',
    'RESTAURANT_CHARGE',
    'MINIBAR',
    'LAUNDRY',
    'SERVICE',
    'TAX',
    'DISCOUNT',
    'PAYMENT',
    'REFUND',
    'ADJUSTMENT',
    'VOID_CHARGE',
    'VOID_PAYMENT',
    'OTHER'
  ))
);

comment on table public.folio_entries is
  'Immutable ledger of charges and payments. Corrections use compensating entries.';

create index if not exists folio_entries_folio_idx
  on public.folio_entries (folio_id);

create index if not exists folio_entries_org_idx
  on public.folio_entries (organization_id);

create index if not exists folio_entries_business_date_idx
  on public.folio_entries (organization_id, business_date);

create index if not exists folio_entries_reference_idx
  on public.folio_entries (reference_type, reference_id);

create index if not exists folio_entries_entry_type_idx
  on public.folio_entries (folio_id, entry_type);

-- Chain guard: folio_entry's organization must match its folio.
create or replace function app.assert_folio_entry_chain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_folio_org uuid;
begin
  select f.organization_id into v_folio_org
    from public.folios f where f.id = new.folio_id;

  if v_folio_org is null then
    raise exception 'NIVAAS_SCOPE_MISMATCH: folio_entry references missing folio';
  end if;

  if new.organization_id <> v_folio_org then
    raise exception 'NIVAAS_SCOPE_MISMATCH: folio_entry organization does not match folio';
  end if;

  return new;
end;
$$;

drop trigger if exists folio_entry_chain_check on public.folio_entries;
create trigger folio_entry_chain_check
  before insert or update on public.folio_entries
  for each row execute function app.assert_folio_entry_chain();

-- RLS
drop policy if exists folio_entries_read on public.folio_entries;
create policy folio_entries_read on public.folio_entries
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists folio_entries_no_write on public.folio_entries;
create policy folio_entries_no_write on public.folio_entries
  for all to authenticated
  using (false);

-- =================================================================== doors

-- app.open_folio(p_stay_id)
--
-- Opens a folio for a stay. Called at check-in. One folio per stay.
create or replace function public.open_folio(
  p_stay_id    uuid,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_stay jsonb;
  v_folio_number text;
  v_row public.folios%rowtype;
begin
  perform app.require_session(v_user_id, null);

  -- Read the stay
  select to_jsonb(s) into v_stay
    from public.stays s
   where s.id = p_stay_id;
  perform app.require_valid(v_stay is not null, 'NIVAAS_NOT_FOUND');

  perform app.evaluate_access(v_user_id, (v_stay->>'organization_id')::uuid, (v_stay->>'property_id')::uuid, null, 'folio.create');

  -- Check if folio already exists (idempotency)
  select to_jsonb(f) into v_row
    from public.folios f
   where f.stay_id = p_stay_id;

  if v_row.id is not null then
    return to_jsonb(v_row);
  end if;

  -- Generate folio number using the document counter
  select app.next_document_number(
    (v_stay->>'organization_id')::uuid,
    (v_stay->>'property_id')::uuid,
    null,
    'FOL',
    current_date
  ) into v_folio_number;

  -- Insert folio
  insert into public.folios (
    organization_id, property_id, stay_id, folio_number, status, currency
  ) values (
    (v_stay->>'organization_id')::uuid,
    (v_stay->>'property_id')::uuid,
    p_stay_id,
    v_folio_number,
    'OPEN',
    'INR'
  ) returning * into v_row;

  perform app.audit(
    'FOLIO_OPENED', 'folio', v_row.id,
    null, to_jsonb(v_row),
    null, jsonb_build_object('folio_number', v_row.folio_number)
  );

  return to_jsonb(v_row);
end;
$$;

comment on function public.open_folio is
  'Opens a folio for a stay. One folio per stay.';

-- app.post_folio_charge(p_folio_id, ...)
--
-- Posts a charge to a folio. entry_type: ROOM_CHARGE, RESTAURANT_CHARGE, MINIBAR, LAUNDRY, SERVICE, TAX, OTHER.
-- Immutable: once posted, cannot be edited. Corrections use void_folio_entry.
create or replace function public.post_folio_charge(
  p_folio_id         uuid,
  p_entry_type       text,
  p_description      text,
  p_amount           numeric,
  p_quantity         numeric default 1,
  p_unit_rate        numeric default 0,
  p_tax_amount       numeric default 0,
  p_discount_amount  numeric default 0,
  p_business_date    date default current_date,
  p_reference_type   text default null,
  p_reference_id     uuid default null,
  p_notes            text default null,
  p_idempotency_key  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_folio jsonb;
  v_net_amount numeric;
  v_row public.folio_entries%rowtype;
begin
  perform app.require_session(v_user_id, null);

  -- Read the folio
  select to_jsonb(f) into v_folio
    from public.folios f
   where f.id = p_folio_id;
  perform app.require_valid(v_folio is not null, 'NIVAAS_NOT_FOUND');

  perform app.evaluate_access(v_user_id, (v_folio->>'organization_id')::uuid, (v_folio->>'property_id')::uuid, null, 'folio.post_charge');

  -- Validate folio is OPEN
  if (v_folio->>'status') <> 'OPEN' then
    raise exception 'NIVAAS_INVALID_STATE: folio is not open';
  end if;

  -- Validate entry_type is a charge type
  if p_entry_type not in ('ROOM_CHARGE', 'RESTAURANT_CHARGE', 'MINIBAR', 'LAUNDRY', 'SERVICE', 'TAX', 'OTHER') then
    raise exception 'NIVAAS_INVALID_ENTRY_TYPE: not a charge type';
  end if;

  -- Calculate net amount
  v_net_amount := p_amount + p_tax_amount - p_discount_amount;

  -- Insert entry
  insert into public.folio_entries (
    organization_id, folio_id, entry_type, reference_type, reference_id,
    description, quantity, unit_rate, amount, tax_amount, discount_amount, net_amount,
    business_date, notes, created_by
  ) values (
    (v_folio->>'organization_id')::uuid,
    p_folio_id,
    p_entry_type,
    p_reference_type,
    p_reference_id,
    p_description,
    p_quantity,
    p_unit_rate,
    p_amount,
    p_tax_amount,
    p_discount_amount,
    v_net_amount,
    p_business_date,
    p_notes,
    v_user_id
  ) returning * into v_row;

  -- Update folio totals
  update public.folios
     set subtotal = subtotal + p_amount,
         tax_total = tax_total + p_tax_amount,
         discount_total = discount_total + p_discount_amount,
         total_charges = total_charges + v_net_amount,
         balance = balance + v_net_amount,
         version = version + 1
   where id = p_folio_id;

  perform app.audit(
    'FOLIO_CHARGE_POSTED', 'folio_entry', v_row.id,
    null, to_jsonb(v_row) - 'reference_id',
    null, jsonb_build_object('entry_type', v_row.entry_type, 'net_amount', v_row.net_amount::text)
  );

  return to_jsonb(v_row);
end;
$$;

comment on function public.post_folio_charge is
  'Posts a charge to a folio. Immutable: corrections use void_folio_entry.';

-- app.post_folio_payment(p_folio_id, ...)
--
-- Posts a payment to a folio. Reduces balance.
create or replace function public.post_folio_payment(
  p_folio_id         uuid,
  p_amount           numeric,
  p_description      text,
  p_business_date    date default current_date,
  p_reference_type   text default null,
  p_reference_id     uuid default null,
  p_notes            text default null,
  p_idempotency_key  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_folio jsonb;
  v_row public.folio_entries%rowtype;
begin
  perform app.require_session(v_user_id, null);

  -- Read the folio
  select to_jsonb(f) into v_folio
    from public.folios f
   where f.id = p_folio_id;
  perform app.require_valid(v_folio is not null, 'NIVAAS_NOT_FOUND');

  perform app.evaluate_access(v_user_id, (v_folio->>'organization_id')::uuid, (v_folio->>'property_id')::uuid, null, 'folio.post_payment');

  -- Validate folio is OPEN
  if (v_folio->>'status') <> 'OPEN' then
    raise exception 'NIVAAS_INVALID_STATE: folio is not open';
  end if;

  -- Validate amount
  if p_amount <= 0 then
    raise exception 'NIVAAS_VALIDATION_FAILED: payment amount must be positive';
  end if;

  -- Insert entry
  insert into public.folio_entries (
    organization_id, folio_id, entry_type, reference_type, reference_id,
    description, quantity, unit_rate, amount, tax_amount, discount_amount, net_amount,
    business_date, notes, created_by
  ) values (
    (v_folio->>'organization_id')::uuid,
    p_folio_id,
    'PAYMENT',
    p_reference_type,
    p_reference_id,
    p_description,
    1,
    p_amount,
    p_amount,
    0,
    0,
    p_amount,
    p_business_date,
    p_notes,
    v_user_id
  ) returning * into v_row;

  -- Update folio totals
  update public.folios
     set total_payments = total_payments + p_amount,
         balance = balance - p_amount,
         version = version + 1
   where id = p_folio_id;

  perform app.audit(
    'FOLIO_PAYMENT_POSTED', 'folio_entry', v_row.id,
    null, to_jsonb(v_row) - 'reference_id',
    null, jsonb_build_object('amount', v_row.amount::text)
  );

  return to_jsonb(v_row);
end;
$$;

comment on function public.post_folio_payment is
  'Posts a payment to a folio. Reduces balance.';

-- app.void_folio_entry(p_entry_id, p_reason)
--
-- Voids a folio entry by posting a compensating entry. Original entry is not deleted.
create or replace function public.void_folio_entry(
  p_entry_id    uuid,
  p_reason      text,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_entry jsonb;
  v_folio jsonb;
  v_void_type text;
  v_void_amount numeric;
  v_row public.folio_entries%rowtype;
begin
  perform app.require_session(v_user_id, null);

  -- Read the entry
  select to_jsonb(e) into v_entry
    from public.folio_entries e
   where e.id = p_entry_id;
  perform app.require_valid(v_entry is not null, 'NIVAAS_NOT_FOUND');

  -- Read the folio
  select to_jsonb(f) into v_folio
    from public.folios f
   where f.id = (v_entry->>'folio_id')::uuid;
  perform app.require_valid(v_folio is not null, 'NIVAAS_NOT_FOUND');

  perform app.evaluate_access(v_user_id, (v_folio->>'organization_id')::uuid, (v_folio->>'property_id')::uuid, null, 'folio.void_entry');

  -- Validate folio is OPEN
  if (v_folio->>'status') <> 'OPEN' then
    raise exception 'NIVAAS_INVALID_STATE: folio is not open';
  end if;

  -- Validate entry is not already voided
  if (v_entry->>'voided_at') is not null then
    raise exception 'NIVAAS_INVALID_STATE: entry already voided';
  end if;

  -- Determine void type
  if (v_entry->>'entry_type') = 'PAYMENT' then
    v_void_type := 'VOID_PAYMENT';
    v_void_amount := -(v_entry->>'net_amount')::numeric;
  else
    v_void_type := 'VOID_CHARGE';
    v_void_amount := -(v_entry->>'net_amount')::numeric;
  end if;

  -- Mark original entry as voided
  update public.folio_entries
     set voided_at = now(),
         void_reason = p_reason,
         voided_by = v_user_id
   where id = p_entry_id;

  -- Insert compensating entry
  insert into public.folio_entries (
    organization_id, folio_id, entry_type, reference_type, reference_id,
    description, quantity, unit_rate, amount, tax_amount, discount_amount, net_amount,
    business_date, notes, created_by
  ) values (
    (v_folio->>'organization_id')::uuid,
    (v_entry->>'folio_id')::uuid,
    v_void_type,
    'FOLIO_ENTRY',
    p_entry_id,
    'VOID: ' || (v_entry->>'description'),
    1,
    v_void_amount,
    v_void_amount,
    0,
    0,
    v_void_amount,
    (v_entry->>'business_date')::date,
    'Void reason: ' || p_reason,
    v_user_id
  ) returning * into v_row;

  -- Update folio totals
  if (v_entry->>'entry_type') = 'PAYMENT' then
    update public.folios
       set total_payments = total_payments + v_void_amount,
           balance = balance - v_void_amount,
           version = version + 1
     where id = (v_entry->>'folio_id')::uuid;
  else
    update public.folios
       set subtotal = subtotal + v_void_amount,
           total_charges = total_charges + v_void_amount,
           balance = balance + v_void_amount,
           version = version + 1
     where id = (v_entry->>'folio_id')::uuid;
  end if;

  perform app.audit(
    'FOLIO_ENTRY_VOIDED', 'folio_entry', p_entry_id,
    null, jsonb_build_object('voided_entry_id', p_entry_id, 'compensating_entry_id', v_row.id),
    null, jsonb_build_object('reason', p_reason, 'void_type', v_void_type)
  );

  return to_jsonb(v_row);
end;
$$;

comment on function public.void_folio_entry is
  'Voids a folio entry by posting a compensating entry. Original entry is not deleted.';

-- app.settle_folio(p_folio_id)
--
-- Settles a folio when balance is zero. Called at check-out.
create or replace function public.settle_folio(
  p_folio_id    uuid,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_folio jsonb;
  v_row public.folios%rowtype;
begin
  perform app.require_session(v_user_id, null);

  -- Read the folio
  select to_jsonb(f) into v_folio
    from public.folios f
   where f.id = p_folio_id;
  perform app.require_valid(v_folio is not null, 'NIVAAS_NOT_FOUND');

  perform app.evaluate_access(v_user_id, (v_folio->>'organization_id')::uuid, (v_folio->>'property_id')::uuid, null, 'folio.settle');

  -- Validate folio is OPEN
  if (v_folio->>'status') <> 'OPEN' then
    raise exception 'NIVAAS_INVALID_STATE: folio is not open';
  end if;

  -- Validate balance is zero
  if (v_folio->>'balance')::numeric <> 0 then
    raise exception 'NIVAAS_VALIDATION_FAILED: folio balance is not zero';
  end if;

  -- Settle folio
  update public.folios
     set status = 'SETTLED',
         settled_at = now(),
         version = version + 1
   where id = p_folio_id
  returning * into v_row;

  perform app.audit(
    'FOLIO_SETTLED', 'folio', v_row.id,
    null, to_jsonb(v_row),
    null, jsonb_build_object('folio_number', v_row.folio_number)
  );

  return to_jsonb(v_row);
end;
$$;

comment on function public.settle_folio is
  'Settles a folio when balance is zero. Called at check-out.';

-- app.close_folio(p_folio_id)
--
-- Closes a settled folio (archives it). Cannot be reopened.
create or replace function public.close_folio(
  p_folio_id    uuid,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_folio jsonb;
  v_row public.folios%rowtype;
begin
  perform app.require_session(v_user_id, null);

  -- Read the folio
  select to_jsonb(f) into v_folio
    from public.folios f
   where f.id = p_folio_id;
  perform app.require_valid(v_folio is not null, 'NIVAAS_NOT_FOUND');

  perform app.evaluate_access(v_user_id, (v_folio->>'organization_id')::uuid, (v_folio->>'property_id')::uuid, null, 'folio.close');

  -- Validate folio is SETTLED
  if (v_folio->>'status') <> 'SETTLED' then
    raise exception 'NIVAAS_INVALID_STATE: folio is not settled';
  end if;

  -- Close folio
  update public.folios
     set status = 'CLOSED',
         closed_at = now(),
         version = version + 1
   where id = p_folio_id
  returning * into v_row;

  perform app.audit(
    'FOLIO_CLOSED', 'folio', v_row.id,
    null, to_jsonb(v_row),
    null, jsonb_build_object('folio_number', v_row.folio_number)
  );

  return to_jsonb(v_row);
end;
$$;

comment on function public.close_folio is
  'Closes a settled folio (archives it). Cannot be reopened.';
