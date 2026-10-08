-- ============================================================================
-- AMRUT NIVAAS — Prompt #04 §32-§50: calculation engine, bill, payments (017)
--
-- This migration adds three things that 016 deliberately excluded:
--   1. The single calculation engine (`app.calculate_restaurant_totals`) that computes
--      subtotal → discount → tax → service_charge → rounding → grand_total from order lines.
--   2. Money columns on `orders` (subtotal, discount_amount, tax_amount, service_charge_amount,
--      rounding_amount, grand_total, amount_due), all unconstrained numeric + scale CHECK.
--   3. A `bills` table (the printed document with its own number sequence), a `payments` table
--      (immutable once successful), and the doors that open/close bills and record payments.
--
-- Design invariants (RESTAURANT_BUILD_CONTRACT.md):
--   - Money is never a float: unconstrained numeric + CHECK(scale(trim_scale(col)) <= 2).
--   - One calculation engine, on the server: no screen recomputes totals.
--   - Tax and service charge are ABSTRACTIONS with no data behind them yet: the per-line rate
--     is 0 until a tax module exists and service charge is 0% until an outlet-level setting
--     does. Every key the engine returns carries an AMOUNT, never a percentage.
--   - A bill's currency is its lines' currency: 016 froze currency per LINE and `orders`
--     carries none, so a ticket that disagrees about currency is refused, never resolved.
--   - Human numbers from a sequence: BILL-000123 per outlet per business_date, gaps legal.
--   - Optimistic locking + FOR UPDATE on parent before child writes.
--   - Idempotency keys on operational submits: a replay answers with the FIRST row, mints
--     nothing and audits nothing twice.
--   - Per-domain chain guards (app.assert_bill_chain / app.assert_payment_chain), never 016's
--     order guard bolted onto a table whose parent it cannot read.
--   - A door never hand-writes a status: `orders` moves through 016's machine only (§7).
--   - Payment rows are immutable once SUCCESSFUL.
--   - History snapshots what it sold: repricing never rewrites old bills.
--   - RLS on every new table, tenant isolation proven not assumed.
-- ============================================================================

set local search_path = '';

-- =================================================================== engine

-- app.calculate_restaurant_totals(...)
--
-- The ONLY function that may write money totals to orders. Takes an order_id, reads its
-- ACTIVE lines and their modifiers, computes:
--   subtotal = sum(unit_price * quantity + sum(modifier price_adjustments))
--   discount = flat discount stored on the order (if any)
--   tax = sum of per-line tax (each line's tax_rate × line_base) — 0 while every line's rate is 0
--   service_charge = (subtotal - discount) * the outlet's service-charge percentage, which has
--     no source table yet, so the percentage is declared below at 0
--   rounding = round to nearest integer (or configured precision)
--   grand_total = subtotal - discount + tax + service_charge + rounding
--
-- Every key below is an AMOUNT. A percentage would be a rate wearing a money name, and
-- open_bill stores these keys straight into `bills`, where they are printed on a document.
--
-- Returns a jsonb object with all computed values as TEXT (money crosses door boundaries
-- as text, never as raw JSON numbers).
create or replace function app.calculate_restaurant_totals(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order jsonb;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_tax numeric := 0;
  v_service_charge numeric := 0;
  v_rounding numeric := 0;
  v_grand_total numeric := 0;
  v_line jsonb;
  v_line_total numeric;
  v_sc_percent numeric;
begin
  -- Read the order header
  select to_jsonb(o) into v_order from public.orders o where o.id = p_order_id;
  perform app.require_valid(v_order is not null, 'NIVAAS_NOT_FOUND');

  -- Compute subtotal from ACTIVE lines.
  --
  -- One jsonb per row, deliberately: `for v_line in select a, b …` would put only the FIRST
  -- column into the jsonb variable, and `v_line->>'unit_price'` would then read NULL — a ticket
  -- whose subtotal, tax and grand total are silently NULL. Building the object here is what makes
  -- the `->>` reads below mean what they look like they mean.
  for v_line in
    select jsonb_build_object(
             'unit_price',     oi.unit_price::numeric,
             'quantity',       oi.quantity,
             'modifier_total', coalesce((
               select sum(om.price_adjustment::numeric * om.quantity)
                 from public.order_item_modifiers om
                where om.order_item_id = oi.id
             ), 0)
           )
      from public.order_items oi
     where oi.order_id = p_order_id
       and oi.status = 'ACTIVE'
  loop
    v_line_total := (v_line->>'unit_price')::numeric * (v_line->>'quantity')::integer
                    + (v_line->>'modifier_total')::numeric;
    v_subtotal := v_subtotal + v_line_total;
  end loop;

  -- Discount: read from order-level field if present (future: discount table)
  v_discount := coalesce((v_order->>'discount_amount')::numeric, 0);

  -- Tax: each line's own rate applied to its own base. Nothing writes tax_rate today — there
  -- is no rate table anywhere in this schema, and 014 left menu_items.tax_category_id as an
  -- unfkeyed placeholder — so every line reads 0 and this sum is 0. The engine reads a COLUMN,
  -- not a taxonomy: when a tax module lands it fills the column and this loop starts costing
  -- money without anyone editing the engine (or inventing a rate ladder in a door).
  for v_line in
    select jsonb_build_object(
             'tax_rate',  coalesce(oi.tax_rate, 0),
             'line_base', oi.unit_price::numeric * oi.quantity
                          + coalesce((select sum(om.price_adjustment::numeric * om.quantity)
                                        from public.order_item_modifiers om
                                       where om.order_item_id = oi.id), 0)
           )
      from public.order_items oi
     where oi.order_id = p_order_id
       and oi.status = 'ACTIVE'
  loop
    v_tax := v_tax + (v_line->>'line_base')::numeric * (v_line->>'tax_rate')::numeric / 100;
  end loop;

  -- Service charge: no outlet-level setting table exists yet, so the percentage is DECLARED
  -- here rather than read, and it is 0 — i.e. no outlet is charged a service fee. When a
  -- setting lands, this is the one line that changes, and the key below must keep carrying an
  -- AMOUNT: a 12% charge on a ₹1,000 base is 120 here, not 12.
  v_sc_percent := 0;
  v_service_charge := (v_subtotal - v_discount) * v_sc_percent / 100;

  -- Rounding: round grand total to nearest integer
  v_grand_total := v_subtotal - v_discount + v_tax + v_service_charge;
  v_rounding := round(v_grand_total) - v_grand_total;
  v_grand_total := round(v_grand_total);

  -- Money is stated at its declared scale. Postgres carries the division's full numeric scale
  -- (a percentage tax reads as 0.00000000000000000000, and 100.01 × 5.55% as 5.550555), and every
  -- money column on orders/bills CHECKs `scale(trim_scale(x)) <= 2` — so an amount with a third
  -- decimal is a row the trigger cannot write. Rounding here, once, at the engine that owns the
  -- arithmetic, is the only place that is allowed to decide the scale of money.
  return jsonb_build_object(
    'subtotal', round(v_subtotal, 2)::text,
    'discount_amount', round(v_discount, 2)::text,
    'tax_amount', round(v_tax, 2)::text,
    'service_charge_amount', round(v_service_charge, 2)::text,
    'rounding_amount', round(v_rounding, 2)::text,
    'grand_total', v_grand_total::text
  );
end;
$$;

comment on function app.calculate_restaurant_totals(uuid) is
  'The single calculation engine for restaurant orders. Computes subtotal/discount/tax/SC/rounding/grand_total from ACTIVE order lines. Returns all money as TEXT.';

-- ================================================================ money columns

-- The ONE tax input this file has: a percentage per line, read by the engine above. It is
-- unconstrained numeric + scale CHECK like every other money-shaped number here, bounded to
-- what a percentage can be, and nullable so "untaxed" is a distinct fact from "taxed at zero".
-- The house rule this obeys: contract §3 forbids a `GST = 5%` literal in the order path, and 014
-- keeps menu_items.tax_category_id an opaque id with no foreign key "so no tax schema is implied
-- this early" (014:271). This file has no more right to declare one — and whether bill-level tax
-- is even the right shape (D-07, versus Phase 4's GST engine, D-15 still unresolved) is the
-- owner's call. So the column is an input with nothing feeding it, said out loud instead of a
-- rate ladder faked in a door.
alter table public.order_items
  add column if not exists tax_rate numeric default 0;

-- Drop-then-add (008/009/010's pattern) because this file may already be applied on a harness
-- where the column arrived with no CHECK at all: a wall that has drifted must be REPLACED on a
-- re-apply, not skipped because the constraint name was already there.
do $$
begin
  alter table public.order_items drop constraint if exists order_items_tax_rate_ok;
end;
$$;
alter table public.order_items
  add constraint order_items_tax_rate_ok
  check (tax_rate is null
         or (scale(trim_scale(tax_rate)) <= 2 and tax_rate >= 0 and tax_rate <= 100));

comment on column public.order_items.tax_rate is
  'The single tax input app.calculate_restaurant_totals reads: a PERCENTAGE (5 means 5%), applied to this line''s base. NO TAX ENGINE EXISTS: menu_items.tax_category_id (014) is a deliberate unfkeyed placeholder and no rate table has been published, so no door can write this column and it is 0 for every line until the tax module lands. A bill is therefore untaxed BY CONSTRUCTION, not by omission.';

-- Add money columns to orders. These are NULL until the first calculation runs, then
-- populated by app.calculate_restaurant_totals. Unconstrained numeric + scale CHECK,
-- exactly as 014 established for menu_item_prices.
alter table public.orders
  add column if not exists subtotal numeric,
  add column if not exists discount_amount numeric default 0,
  add column if not exists tax_amount numeric,
  add column if not exists service_charge_amount numeric default 0,
  add column if not exists rounding_amount numeric default 0,
  add column if not exists grand_total numeric,
  add column if not exists amount_due numeric;

-- Scale CHECKs: no more than 2 decimal places, magnitude bound prevents overflow
--
-- Guarded the same way as the tax-rate CHECK above, because a re-apply on a harness that already
-- ran this file dies HERE otherwise: `add constraint` has no if-not-exists form, so the second run
-- reports orders_money_ok as already existing and aborts the migration before a door is defined.
-- The expression below is the one this file has always shipped, character for character; only the
-- drop in front of it is new (008/009/010's pattern again).
do $$
begin
  alter table public.orders drop constraint if exists orders_money_ok;
end;
$$;
alter table public.orders
  add constraint orders_money_ok check (
    (subtotal is null or (scale(trim_scale(subtotal)) <= 2 and subtotal >= 0 and subtotal < 1000000000000))
    and (discount_amount is null or (scale(trim_scale(discount_amount)) <= 2 and discount_amount >= 0 and discount_amount < 1000000000000))
    and (tax_amount is null or (scale(trim_scale(tax_amount)) <= 2 and tax_amount >= 0 and tax_amount < 1000000000000))
    and (service_charge_amount is null or (scale(trim_scale(service_charge_amount)) <= 2 and service_charge_amount >= 0 and service_charge_amount < 1000000000000))
    and (rounding_amount is null or (scale(trim_scale(rounding_amount)) <= 2 and rounding_amount between -1 and 1))
    and (grand_total is null or (scale(trim_scale(grand_total)) <= 2 and grand_total >= 0 and grand_total < 1000000000000))
    and (amount_due is null or (scale(trim_scale(amount_due)) <= 2 and amount_due >= 0 and amount_due < 1000000000000))
  );

comment on column public.orders.subtotal is
  'Sum of (unit_price × quantity + modifier adjustments) for all ACTIVE lines. Computed by app.calculate_restaurant_totals.';
comment on column public.orders.discount_amount is
  'Flat discount applied to the order. Defaults to 0.';
comment on column public.orders.tax_amount is
  'Sum of per-line tax (order_items.tax_rate × that line''s base). Computed by app.calculate_restaurant_totals — and therefore 0 for every order, permanently, until a tax module publishes rates and a door writes them. The column exists so the tax engine is an additive migration instead of a schema argument.';
comment on column public.orders.service_charge_amount is
  'The service-charge AMOUNT off (subtotal - discount), never the percentage. 0 for every outlet: the percentage has no setting table to be read from yet.';
comment on column public.orders.rounding_amount is
  'Rounding adjustment to make grand_total an integer. Between -1 and 1.';
comment on column public.orders.grand_total is
  'subtotal - discount + tax + service_charge + rounding. Rounded to nearest integer.';
comment on column public.orders.amount_due is
  'The ORDER''s running balance: grand_total minus the money actually received (SUCCESSFUL payments on this order''s non-CANCELLED bills), floored at 0. Recomputed whenever a line changes, so adding a dish after a deposit does not reprint the guest''s whole bill as due. The bill is the printed document and stays frozen at open time — this column is not a restatement of one.';

-- ============================================================ recalculation triggers
--
-- One arithmetic, two surfaces. `app.recalc_order_money` is the only thing that writes an order's
-- money columns, and it is called by a trigger on LINES and a trigger on the OPTIONS under a line.
-- The second trigger is not decoration: an option carries a price, and 016:1155-1163 inserts a
-- line's option rows AFTER that line, so with a trigger on lines alone the last line's options
-- never reach the header — the line insert recomputes while no option exists yet, and nothing
-- re-arms it until another line moves. The ticket would then store 240.00 for 250.00 of food while
-- the engine, which reads the rows, prices it at 250.00: a printed bill and the order underneath
-- it disagreeing by exactly the missed option.

create or replace function app.recalc_order_money(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_totals jsonb;
  v_paid numeric;
begin
  -- Money already in the till for this order. A CANCELLED bill is excluded on purpose: its
  -- bill is no longer a claim on the guest, so money booked against it must not sit there as
  -- a phantom credit reducing what a live ticket owes — and it must not be silently refunded
  -- by this arithmetic either (a refund is #05's own row and door). SUCCESSFUL only, because
  -- a FAILED row is a receipt of nothing.
  select coalesce(sum(p.amount), 0) into v_paid
    from public.payments p
    join public.bills b on b.id = p.bill_id
   where b.order_id = p_order_id
     and p.status = 'SUCCESSFUL'
     and b.status <> 'CANCELLED';

  select app.calculate_restaurant_totals(p_order_id) into v_totals;
  update public.orders
     set subtotal = (v_totals->>'subtotal')::numeric,
         discount_amount = coalesce((v_totals->>'discount_amount')::numeric, 0),
         tax_amount = (v_totals->>'tax_amount')::numeric,
         service_charge_amount = coalesce((v_totals->>'service_charge_amount')::numeric, 0),
         rounding_amount = coalesce((v_totals->>'rounding_amount')::numeric, 0),
         grand_total = (v_totals->>'grand_total')::numeric,
         -- grand_total, LESS what has been paid — never grand_total itself. Overwriting the
         -- balance with the total on every line change would turn a paid-down bill into a
         -- fresh debt each time a kitchen line moved. greatest(..., 0) is the column's own
         -- CHECK being obeyed here rather than a domain refusal: a bill paid to the rupee,
         -- then amended downwards, has a negative balance that is genuinely zero owed.
         amount_due = greatest((v_totals->>'grand_total')::numeric - v_paid, 0)
   where id = p_order_id;
end;
$$;

-- Lines: the trigger reads its own order off the row it fired for.
create or replace function app.recalculate_order_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
begin
  if TG_OP = 'DELETE' then
    v_order_id := OLD.order_id;
  else
    v_order_id := NEW.order_id;
  end if;
  perform app.recalc_order_money(v_order_id);
  return null;
end;
$$;

-- Options: one row further down the chain, so the order is read through its line.
create or replace function app.recalculate_option_order_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
begin
  select oi.order_id into v_order_id
    from public.order_items oi
   where oi.id = case when TG_OP = 'DELETE' then OLD.order_item_id
                      else NEW.order_item_id end;
  perform app.recalc_order_money(v_order_id);
  return null;
end;
$$;

-- Attach recalculation triggers to order_items
drop trigger if exists order_items_recalc on public.order_items;
create trigger order_items_recalc after insert or update or delete on public.order_items
  for each row execute function app.recalculate_order_totals();

drop trigger if exists order_item_options_recalc on public.order_item_modifiers;
create trigger order_item_options_recalc after insert or update or delete
  on public.order_item_modifiers
  for each row execute function app.recalculate_option_order_totals();

-- ==================================================================== chain guards
--
-- Per-domain, exactly as the rest of the hospitality files do it: app.assert_menu_chain()
-- (014) knows menus, app.assert_dining_chain() (015) knows covers, app.assert_order_chain()
-- (016) knows the three order tables and raises NIVAAS_SCOPE_MISMATCH for anything else. 017's
-- two tables are NOT in that branch — bolting that guard onto bills would refuse every INSERT
-- into both tables — so they get their own, with the same tail comparison 016 uses: derive the
-- chain from the PARENT row, then require the copied ancestors to equal what it says.
--
-- Both are defined BEFORE the create trigger lines that attach them, because CREATE TRIGGER
-- ... EXECUTE FUNCTION needs the function to exist at attach time while plpgsql resolves the
-- tables inside the body only when a row is actually written (016:78-81's ordering rule).
create or replace function app.assert_bill_chain()
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
  -- A bill's parent is the ORDER: the document is a claim on one ticket, and the outlet that
  -- ticket belongs to is the only thing entitled to print it.
  select o.organization_id, o.property_id, o.outlet_id
    into v_org, v_prop, v_out
    from public.orders o where o.id = new.order_id;
  if v_out is null then
    raise exception 'NIVAAS_SCOPE_MISMATCH: bill % points at no order', new.id;
  end if;

  if new.organization_id <> v_org or new.property_id <> v_prop or new.outlet_id <> v_out then
    raise exception 'NIVAAS_SCOPE_MISMATCH: a bill cannot sit outside its order''s outlet';
  end if;

  return new;
end;
$$;

create or replace function app.assert_payment_chain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_prop  uuid;
  v_out   uuid;
  v_order uuid;
begin
  -- A payment's parent is the BILL — the document the money settles, not the ticket the
  -- cashier happened to be looking at.
  select b.organization_id, b.property_id, b.outlet_id, b.order_id
    into v_org, v_prop, v_out, v_order
    from public.bills b where b.id = new.bill_id;
  if v_out is null then
    raise exception 'NIVAAS_SCOPE_MISMATCH: payment % points at no bill', new.id;
  end if;

  -- The second hop, proved because the payload arrives whole: a row that names one bill and a
  -- different order would hang money on a live ticket while settling another. `payments` keeps
  -- order_id to make the kitchen's day readable without a join, and this is what keeps that
  -- denormalization honest.
  if new.order_id is distinct from v_order then
    raise exception 'NIVAAS_SCOPE_MISMATCH: a payment must name the order its bill belongs to';
  end if;

  if new.organization_id <> v_org or new.property_id <> v_prop or new.outlet_id <> v_out then
    raise exception 'NIVAAS_SCOPE_MISMATCH: a payment cannot sit outside its bill''s outlet';
  end if;

  return new;
end;
$$;

-- ================================================================ bills

-- A bill is the printed/settled document for an order. One order can have multiple bills
-- if split, but initially we support one bill per order. The bill carries its own human-readable
-- number (BILL-000123) minted from document_counters.
create table if not exists public.bills (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  property_id          uuid not null references public.properties(id)  on delete restrict,
  outlet_id            uuid not null references public.outlets(id)     on delete restrict,
  order_id             uuid not null references public.orders(id)        on delete restrict,
  bill_number          text not null,
  business_date        date not null,
  currency             text not null check (app.is_valid_currency(currency)),
  subtotal             numeric not null,
  discount_amount      numeric not null default 0,
  tax_amount           numeric not null,
  service_charge_amount numeric not null default 0,
  rounding_amount      numeric not null default 0,
  grand_total          numeric not null,
  amount_paid          numeric not null default 0,
  amount_due           numeric not null,
  status               text not null default 'OPEN'
                       constraint bills_status_ok check (status in ('OPEN','PARTIALLY_PAID','PAID','CANCELLED')),
  opened_at            timestamptz not null default now(),
  paid_at              timestamptz,
  cancelled_at         timestamptz,
  cancelled_by         uuid,
  cancel_reason        text,
  -- §6's replay key, 016's shape: opaque, nullable, no FK, and the partial UNIQUE index below
  -- is the only wall behind a double-tapped OPEN BILL.
  idempotency_key      text,
  version              integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid,
  constraint bills_money_ok check (
    scale(trim_scale(subtotal)) <= 2 and subtotal >= 0 and subtotal < 1000000000000
    and scale(trim_scale(discount_amount)) <= 2 and discount_amount >= 0 and discount_amount < 1000000000000
    and scale(trim_scale(tax_amount)) <= 2 and tax_amount >= 0 and tax_amount < 1000000000000
    and scale(trim_scale(service_charge_amount)) <= 2 and service_charge_amount >= 0 and service_charge_amount < 1000000000000
    and scale(trim_scale(rounding_amount)) <= 2 and rounding_amount between -1 and 1
    and scale(trim_scale(grand_total)) <= 2 and grand_total >= 0 and grand_total < 1000000000000
    and scale(trim_scale(amount_paid)) <= 2 and amount_paid >= 0 and amount_paid < 1000000000000
    and scale(trim_scale(amount_due)) <= 2 and amount_due >= 0 and amount_due < 1000000000000
  )
);

comment on table public.bills is
  'The printed/settled document for an order. Carries a snapshot of totals at bill-open time. One order typically has one bill.';
comment on column public.bills.bill_number is
  'Human-readable bill number (BILL-000123), unique per outlet per business_date.';
comment on column public.bills.status is
  'OPEN → PARTIALLY_PAID → PAID, or CANCELLED. No other transitions allowed.';
comment on column public.bills.idempotency_key is
  'Optional. Unique per (organization, outlet, key) among rows that have one, so a double-tapped OPEN BILL replays the first bill instead of minting a second number (§6).';

-- Re-runnability, stated rather than assumed: on a harness where this file has already been
-- applied, `create table if not exists` above is a no-op and would skip the new column for
-- ever. The additive form is what lands it on an existing bills table (008/010's rule for a
-- widening a file cannot re-create), and it must run before the index below.
alter table public.bills
  add column if not exists idempotency_key text;

create index if not exists bills_order_idx on public.bills (order_id);
create unique index if not exists bills_number_idx
  on public.bills (organization_id, outlet_id, bill_number, business_date);
create index if not exists bills_outlet_status_idx on public.bills (outlet_id, status);

-- 016's idempotency wall, same shape, same reason: UNIQUE and PARTIAL, so NULL keys (the
-- common case — a cashier not asking for replay) never collide with each other, one outlet's
-- key space cannot shadow another's, and two simultaneous taps cannot both insert the same key
-- past the door's own replay read.
drop index if exists public.bills_idempotency_scoped;
create unique index bills_idempotency_scoped
  on public.bills (organization_id, outlet_id, idempotency_key)
  where idempotency_key is not null;

-- Touch and chain triggers
drop trigger if exists bills_touch on public.bills;
create trigger bills_touch before update on public.bills
  for each row execute function app.touch_updated_at();

drop trigger if exists bills_chain on public.bills;
create trigger bills_chain before insert or update on public.bills
  for each row execute function app.assert_bill_chain();

-- ================================================================ payments

-- A payment is money received against a bill. Immutable once SUCCESSFUL.
-- Supports multiple payment methods per bill (cash, card, UPI, etc.).
create table if not exists public.payments (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  property_id          uuid not null references public.properties(id)  on delete restrict,
  outlet_id            uuid not null references public.outlets(id)     on delete restrict,
  bill_id              uuid not null references public.bills(id)         on delete restrict,
  order_id             uuid not null references public.orders(id)        on delete restrict,
  payment_number       text not null,
  business_date        date not null,
  amount               numeric not null,
  currency             text not null check (app.is_valid_currency(currency)),
  method               text not null
                       constraint payments_method_ok check (method in ('CASH','CARD','UPI','BANK_TRANSFER','WALLET','OTHER')),
  reference_id         text,
  status               text not null default 'SUCCESSFUL'
                       constraint payments_status_ok check (status in ('SUCCESSFUL','FAILED','REFUNDED')),
  refunded_at          timestamptz,
  refund_reason        text,
  notes                text,
  -- §6's replay key, same contract as bills.idempotency_key: the wall under a double-tapped
  -- "take payment", which would otherwise book the money twice.
  idempotency_key      text,
  version              integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid,
  constraint payments_money_ok check (
    scale(trim_scale(amount)) <= 2 and amount > 0 and amount < 1000000000000
  )
);

comment on table public.payments is
  'Money received against a bill. Immutable once SUCCESSFUL: corrections are new REFUNDED rows.';
comment on column public.payments.payment_number is
  'Human-readable payment number (PAY-000123), unique per outlet per business_date.';
comment on column public.payments.method is
  'Payment method: CASH, CARD, UPI, BANK_TRANSFER, WALLET, OTHER.';
comment on column public.payments.reference_id is
  'External reference (transaction ID, card last-4, UPI TRN, etc.).';
comment on column public.payments.status is
  'SUCCESSFUL (immutable), FAILED (reversed), or REFUNDED (correction).';
comment on column public.payments.idempotency_key is
  'Optional. Unique per (organization, outlet, key) among rows that have one, so a double-tapped payment returns the first PAYMENT row instead of booking the money twice (§6).';

-- Same additive rule as bills.idempotency_key above, for the same reason.
alter table public.payments
  add column if not exists idempotency_key text;

create index if not exists payments_bill_idx on public.payments (bill_id);
create index if not exists payments_order_idx on public.payments (order_id);
create unique index if not exists payments_number_idx
  on public.payments (organization_id, outlet_id, payment_number, business_date);

drop index if exists public.payments_idempotency_scoped;
create unique index payments_idempotency_scoped
  on public.payments (organization_id, outlet_id, idempotency_key)
  where idempotency_key is not null;

-- Touch and chain triggers
drop trigger if exists payments_touch on public.payments;
create trigger payments_touch before update on public.payments
  for each row execute function app.touch_updated_at();

drop trigger if exists payments_chain on public.payments;
create trigger payments_chain before insert or update on public.payments
  for each row execute function app.assert_payment_chain();

-- Immutability trigger: prevent modification of SUCCESSFUL payments
create or replace function app.guard_payment_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A SUCCESSFUL payment is money that left a guest's hand, so the row is a receipt — and a receipt
  -- is neither edited nor erased. A refund is #05's own NEW row through its own door, never a
  -- rewrite of the one that exists.
  --
  -- This guard used to compare three columns and call it immutability, which left the two writes
  -- that actually destroy money reachable: flipping STATUS to FAILED silently removes the row from
  -- every balance in the schema (017:258-263 sums SUCCESSFUL payments only — the till loses the
  -- money while the guest's receipt still says it was paid), and DELETE removes the evidence
  -- outright. Comparing the WHOLE row is the point: a column a later migration adds to `payments`
  -- is protected the day it lands, instead of the day someone remembers to name it here.
  if OLD.status = 'SUCCESSFUL' then
    if TG_OP = 'DELETE' then
      raise exception 'NIVAAS_PAYMENT_IMMUTABLE';
    end if;
    if NEW is distinct from OLD then
      raise exception 'NIVAAS_PAYMENT_IMMUTABLE';
    end if;
  end if;

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

drop trigger if exists payments_immutable on public.payments;
create trigger payments_immutable before update or delete on public.payments
  for each row execute function app.guard_payment_immutability();

-- ================================================================ RLS

alter table public.bills enable row level security;
alter table public.payments enable row level security;

grant select on public.bills, public.payments to authenticated, service_role;
revoke all on public.bills, public.payments from anon;
revoke insert, update, delete, truncate on public.bills, public.payments from authenticated;

drop policy if exists bills_outlet_read on public.bills;
create policy bills_outlet_read on public.bills
  for select to authenticated
  using (app.can_access_outlet(app.current_user_id(), outlet_id));

drop policy if exists payments_outlet_read on public.payments;
create policy payments_outlet_read on public.payments
  for select to authenticated
  using (app.can_access_outlet(app.current_user_id(), outlet_id));

-- ================================================================ doors

-- Three of the doors below take p_expected_version (contract §5), which CHANGES their
-- parameter list — and `create or replace` does not replace a signature, it STACKS a new
-- overload beside the old one, leaving PostgREST two doors of that name to choose between.
-- Dropping the pre-version signatures first is 010's rule for app.audit applied to doors:
-- replace the signature, never stack it. Nothing inside the schema calls these by position.
drop function if exists public.close_bill(uuid, text);
drop function if exists public.record_payment(uuid, numeric, text, text, text, text);
drop function if exists public.cancel_bill(uuid, text);

-- ---------------------------------------------------------------- open_bill

-- Opens a bill for an order: snapshots the engine's answer, mints the BILL number, and moves
-- a READY ticket to SERVED through 016's machine. The order is locked first, because "is
-- there already an open bill on this order?" is a question two cashiers can ask at once.
create or replace function public.open_bill(
  p_order uuid,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.require_session();
  v_org uuid;
  v_prop uuid;
  v_out uuid;
  v_order jsonb;
  v_status text;
  v_totals jsonb;
  v_currency text;
  v_currencies integer;
  v_bdate date;
  v_bill_no text;
  v_bill_id uuid;
  v_after jsonb;
  v_replay jsonb;
  v_key text := nullif(btrim(p_idempotency_key), '');
begin
  -- Lock the parent before reading it (contract §5): without the lock both cashiers pass the
  -- already-open check below and the order gets two live bills with two BILL numbers. The
  -- locking read sees the other transaction's committed row, which is what makes the replay
  -- read behind it truthful too.
  select to_jsonb(o) into v_order from public.orders o where o.id = p_order for update;
  perform app.require_valid(v_order is not null, 'NIVAAS_NOT_FOUND');
  v_org := (v_order->>'organization_id')::uuid;
  v_prop := (v_order->>'property_id')::uuid;
  v_out := (v_order->>'outlet_id')::uuid;
  v_status := v_order->>'status';
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('bill.create', v_org, v_prop, v_out);
  perform app.require_writable_outlet(v_out);

  -- Only a ticket the floor has served — or is holding at the pass for the runner — becomes a
  -- bill. CONFIRMED/PREPARING is still the kitchen's business: 017 must not print a bill for
  -- food nobody has eaten, and DRAFT/PLACED/terminal states are refused by the same token.
  perform app.require_valid(v_status in ('READY','SERVED'),
    'NIVAAS_INVALID_ORDER_STATUS');

  -- §6's replay, BEFORE the already-open refusal on purpose: a double-tapped OPEN BILL is that
  -- tap's own retry, and answering it with BILL_ALREADY_OPEN would refuse the cashier their
  -- first bill instead of returning it. Keyed on (organization, outlet, key) rather than on the
  -- order because the key is only usable once the order's scope has been read, and a replay is
  -- a property of the submit, not of the ticket — which is also why bills_number_idx stays the
  -- separate wall it is. No number is minted and no audit row is written on this path.
  if v_key is not null then
    select to_jsonb(b) into v_replay from public.bills b
      where b.organization_id = v_org and b.outlet_id = v_out
        and b.idempotency_key = v_key;
    if v_replay is not null then
      return v_replay;
    end if;
  end if;

  -- Check bill not already open (a CANCELLED bill is not a live claim on the ticket, so a
  -- corrected bill may follow one).
  perform app.require_valid(
    not exists (select 1 from public.bills b where b.order_id = p_order and b.status <> 'CANCELLED'),
    'NIVAAS_BILL_ALREADY_OPEN');

  -- Currency, derived rather than read off the order: `orders` has no currency column (016
  -- never added one) because 016 froze the currency per LINE, off the menu row that was OPEN at
  -- sale time. One outlet publishes one menu in one currency (014), so a ticket whose live
  -- lines disagree is a server fault and stops here — picking one arbitrarily would print a
  -- document whose currency is a guess, which is the money lie this whole file exists to
  -- prevent. Both tokens are 016's and the client already translates them.
  select min(currency), count(distinct currency) into v_currency, v_currencies
    from public.order_items
   where order_id = p_order and status = 'ACTIVE';
  perform app.require_valid(v_currency is not null, 'NIVAAS_EMPTY_ORDER');
  perform app.require_valid(v_currencies = 1, 'NIVAAS_CURRENCY_MISMATCH');

  -- Calculate totals
  select app.calculate_restaurant_totals(p_order) into v_totals;

  -- Derive business date
  select app.rest_outlet_business_date(v_out) into v_bdate;

  -- Mint bill number
  select app.next_document_number(v_org, v_prop, v_out, 'BILL', v_bdate) into v_bill_no;

  -- Create bill
  insert into public.bills (
    organization_id, property_id, outlet_id, order_id, bill_number, business_date,
    currency, subtotal, discount_amount, tax_amount, service_charge_amount,
    rounding_amount, grand_total, amount_paid, amount_due, idempotency_key, created_by
  ) values (
    v_org, v_prop, v_out, p_order, v_bill_no, v_bdate,
    v_currency,
    (v_totals->>'subtotal')::numeric,
    coalesce((v_totals->>'discount_amount')::numeric, 0),
    (v_totals->>'tax_amount')::numeric,
    coalesce((v_totals->>'service_charge_amount')::numeric, 0),
    coalesce((v_totals->>'rounding_amount')::numeric, 0),
    (v_totals->>'grand_total')::numeric,
    0,
    (v_totals->>'grand_total')::numeric,
    v_key,
    v_actor
  ) returning id into v_bill_id;

  -- §7 through the machine, never a hand-written word: READY → SERVED is 016's edge, and the
  -- bill is the moment that move becomes true (018's send_kot drives PREPARING the same way).
  -- An order already SERVED is left alone — its version does not move because a document was
  -- printed against it. If the ladder ever refuses, this door's own gate above has drifted, and
  -- raising is the correct answer: the transaction rolls back with no bill and no number.
  if v_status = 'READY' then
    perform app.require_order_transition(v_status, 'SERVED');
    update public.orders set status = 'SERVED', version = version + 1 where id = p_order;
  end if;

  select to_jsonb(b) into v_after from public.bills b where b.id = v_bill_id;
  perform app.audit('bill_opened', 'bill', v_bill_id,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_after := v_after);
  return v_after;
end;
$$;

-- ---------------------------------------------------------------- close_bill

-- Marks a bill as fully paid. Called after all payments are recorded.
create or replace function public.close_bill(
  p_bill uuid,
  p_reason text,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.require_session();
  v_before jsonb;
  v_after jsonb;
  v_org uuid;
  v_prop uuid;
  v_out uuid;
begin
  -- FOR UPDATE on the document itself: closing is a decision about the money a payment door is
  -- still moving, and reading it unlocked means a cashier can close a bill a millisecond before
  -- the last payment lands on it (contract §5).
  select to_jsonb(b) into v_before from public.bills b where b.id = p_bill for update;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');
  v_org := (v_before->>'organization_id')::uuid;
  v_prop := (v_before->>'property_id')::uuid;
  v_out := (v_before->>'outlet_id')::uuid;
  perform app.require_tenant_visibility(v_org);
  -- bill.create, not the "bill.close" this door used to name: 013 registered
  -- bill.view/create/discount/void, require_permission only checks granted rows (005:59), so an
  -- unregistered token grants nobody anything and this door refused every user forever. The verb
  -- that means "this bill is finished" is the same one that opened it — whoever may open a bill
  -- may settle and close it — and closing is not the privileged reversal, which is bill.void.
  perform app.require_permission('bill.create', v_org, v_prop, v_out);
  perform app.require_version((v_before->>'version')::integer, p_expected_version);
  perform app.require_reason(p_reason);

  -- Check fully paid
  perform app.require_valid(
    (v_before->>'amount_due')::numeric <= 0,
    'NIVAAS_BILL_NOT_PAID');

  update public.bills
     set status = 'PAID',
         paid_at = now(),
         version = version + 1
   where id = p_bill;
  select to_jsonb(b) into v_after from public.bills b where b.id = p_bill;

  perform app.audit('bill_closed', 'bill', p_bill,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_before := v_before, p_after := v_after, p_reason := p_reason);
  return v_after;
end;
$$;

-- ---------------------------------------------------------------- record_payment

-- Records a payment against a bill. Updates bill's amount_paid and amount_due.
create or replace function public.record_payment(
  p_bill uuid,
  p_amount numeric,
  p_method text,
  p_reference_id text default null,
  p_notes text default null,
  p_expected_version integer default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.require_session();
  v_bill jsonb;
  v_org uuid;
  v_prop uuid;
  v_out uuid;
  v_bdate date;
  v_pay_no text;
  v_pay_id uuid;
  v_new_paid numeric;
  v_new_due numeric;
  v_after jsonb;
  v_replay jsonb;
  v_key text := nullif(btrim(p_idempotency_key), '');
begin
  perform app.require_valid(p_amount > 0, 'NIVAAS_INVALID_MONEY');
  perform app.require_valid(p_method in ('CASH','CARD','UPI','BANK_TRANSFER','WALLET','OTHER'),
    'NIVAAS_INVALID_PAYMENT_METHOD');

  -- The bill is locked before its money is read (contract §5). Without the lock this door was a
  -- read-modify-write on amount_paid: two simultaneous payments each added their own amount to
  -- the SAME stale balance, and one of them disappeared — cash received, never booked.
  select to_jsonb(b) into v_bill from public.bills b where b.id = p_bill for update;
  perform app.require_valid(v_bill is not null, 'NIVAAS_NOT_FOUND');
  v_org := (v_bill->>'organization_id')::uuid;
  v_prop := (v_bill->>'property_id')::uuid;
  v_out := (v_bill->>'outlet_id')::uuid;
  perform app.require_tenant_visibility(v_org);
  -- payment.create, the key 013 actually registered — its catalogue description is literally
  -- "Record a payment received on a bill". The "payment.record" this door used to name exists
  -- in no catalogue and therefore in no grant, so nothing could ever have passed this line.
  perform app.require_permission('payment.create', v_org, v_prop, v_out);
  perform app.require_writable_outlet(v_out);
  perform app.require_version((v_bill->>'version')::integer, p_expected_version);

  -- Check bill not cancelled
  perform app.require_valid((v_bill->>'status') <> 'CANCELLED', 'NIVAAS_BILL_CANCELLED');

  -- §6's replay, before the PAY number is minted: the second tap of a double-tapped "take
  -- payment" answers with the first payment row instead of booking the same money twice — and
  -- mints nothing, so it burns no counter value either (016 §4: a gap is legal, and here there
  -- is not even one). The lock above is what makes the first tap's insert visible here; the
  -- unique partial index below is the wall under the read.
  if v_key is not null then
    select to_jsonb(p) into v_replay from public.payments p
      where p.organization_id = v_org and p.outlet_id = v_out
        and p.idempotency_key = v_key;
    if v_replay is not null then
      return v_replay;
    end if;
  end if;

  -- All the arithmetic happens BEFORE anything is written, so a refused amount costs no PAY
  -- number and leaves no orphan row — 016's rule for a mistyped dish, applied to money.
  v_new_paid := coalesce((v_bill->>'amount_paid')::numeric, 0) + p_amount;
  v_new_due := (v_bill->>'grand_total')::numeric - v_new_paid;

  -- An overpayment is a mistake at a counter, not a business case. This build has no split bill,
  -- no change-due column and no refunds (#05 owns those), so anything beyond the balance is a
  -- typo — and saying so here is the difference between a cashier-readable refusal and
  -- bills_money_ok's amount_due >= 0 firing mid-UPDATE and surfacing that typo as a raw
  -- constraint error no screen can translate.
  perform app.require_valid(
    v_new_paid <= (v_bill->>'grand_total')::numeric, 'NIVAAS_INVALID_MONEY');

  -- Derive business date
  select app.rest_outlet_business_date(v_out) into v_bdate;

  -- Mint payment number
  select app.next_document_number(v_org, v_prop, v_out, 'PAY', v_bdate) into v_pay_no;

  -- Insert payment
  insert into public.payments (
    organization_id, property_id, outlet_id, bill_id, order_id, payment_number,
    business_date, amount, currency, method, reference_id, notes, idempotency_key, created_by
  ) values (
    v_org, v_prop, v_out, p_bill, (v_bill->>'order_id')::uuid, v_pay_no,
    v_bdate, p_amount, (v_bill->>'currency')::text, p_method, p_reference_id, p_notes,
    v_key, v_actor
  ) returning id into v_pay_id;

  -- Update bill amounts
  update public.bills
     set amount_paid = v_new_paid,
         amount_due = v_new_due,
         status = case when v_new_due <= 0 then 'PAID' when v_new_paid > 0 then 'PARTIALLY_PAID' else 'OPEN' end,
         version = version + 1
   where id = p_bill;

  select to_jsonb(p) into v_after from public.payments p where p.id = v_pay_id;
  perform app.audit('payment_recorded', 'payment', v_pay_id,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_after := v_after);
  return v_after;
end;
$$;

-- ---------------------------------------------------------------- cancel_bill

-- Cancels an open bill (before any payment). Requires reason.
create or replace function public.cancel_bill(
  p_bill uuid,
  p_reason text,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.require_session();
  v_before jsonb;
  v_after jsonb;
  v_org uuid;
  v_prop uuid;
  v_out uuid;
begin
  -- Locked: cancellation races the till exactly the way closing one does, and a bill that gains
  -- a payment while this door is reasoning about it must not end up CANCELLED with money on it.
  select to_jsonb(b) into v_before from public.bills b where b.id = p_bill for update;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');
  v_org := (v_before->>'organization_id')::uuid;
  v_prop := (v_before->>'property_id')::uuid;
  v_out := (v_before->>'outlet_id')::uuid;
  perform app.require_tenant_visibility(v_org);
  -- bill.void: a cancelled bill IS the privileged reversal 013 named and laddered (staff opens
  -- and takes money; only manager level and above may void, and the reason stays mandatory).
  -- "bill.cancel" was never registered, so this door could not have been passed by anyone.
  perform app.require_permission('bill.void', v_org, v_prop, v_out);
  perform app.require_version((v_before->>'version')::integer, p_expected_version);
  perform app.require_reason(p_reason);

  -- Check no payments recorded
  perform app.require_valid(
    (v_before->>'amount_paid')::numeric = 0,
    'NIVAAS_BILL_HAS_PAYMENTS');

  update public.bills
     set status = 'CANCELLED',
         cancelled_at = now(),
         cancelled_by = v_actor,
         cancel_reason = p_reason,
         version = version + 1
   where id = p_bill;
  select to_jsonb(b) into v_after from public.bills b where b.id = p_bill;

  perform app.audit('bill_cancelled', 'bill', p_bill,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_before := v_before, p_after := v_after, p_reason := p_reason);
  return v_after;
end;
$$;

-- ---------------------------------------------------------------- bill_detail

-- Reads a bill with its payments and order lines.
create or replace function public.bill_detail(p_bill uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill jsonb;
  v_org uuid;
  v_prop uuid;
  v_out uuid;
  v_payments jsonb;
  v_lines jsonb;
begin
  select to_jsonb(b) into v_bill from public.bills b where b.id = p_bill;
  perform app.require_valid(v_bill is not null, 'NIVAAS_NOT_FOUND');
  v_org := (v_bill->>'organization_id')::uuid;
  v_prop := (v_bill->>'property_id')::uuid;
  v_out := (v_bill->>'outlet_id')::uuid;
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('bill.view', v_org, v_prop, v_out);

  -- Get payments
  select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into v_payments
    from public.payments p where p.bill_id = p_bill;

  -- Get order lines
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', oi.id,
    'item_name', oi.item_name_snapshot,
    'item_code', oi.item_code_snapshot,
    'quantity', oi.quantity,
    'unit_price', oi.unit_price::text,
    'currency', oi.currency,
    'special_instructions', oi.special_instructions,
    'status', oi.status
  )), '[]'::jsonb) into v_lines
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
   where o.id = (v_bill->>'order_id')::uuid;

  return jsonb_build_object(
    'bill', v_bill,
    'payments', v_payments,
    'lines', v_lines
  );
end;
$$;

-- ================================================================ grants

do $$
declare
  v_name text;
  v_oid oid;
  v_oids oid[];
begin
  foreach v_name in array array[
    'open_bill', 'close_bill', 'record_payment', 'cancel_bill', 'bill_detail'
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

-- The other half of granting "by name": everything else in `app` this file created is a helper, and
-- a helper a client can call is a second, ungated door. Postgres grants a NEW function to PUBLIC, so
-- `app.calculate_restaurant_totals` — which reads an order by id with NO tenant check, because every
-- caller made one first — was reachable from a screen: RLS hides a stranger's ticket, `open_bill`
-- answers NIVAAS_NOT_FOUND for it, and the helper priced it to the rupee anyway. That is §10's
-- enumeration leak and §2's "the arithmetic is off the client surface" in one statement, and both
-- are closed by a revoke rather than by a comment. The doors above are SECURITY DEFINER owned by
-- this role, so they keep calling it.
revoke all on function app.calculate_restaurant_totals(uuid)
  from public, anon, authenticated, service_role;
revoke all on function app.recalc_order_money(uuid)
  from public, anon, authenticated, service_role;

-- ================================================================ self-check

do $$
declare
  v_def text;
begin
  -- Money columns exist on orders with correct types
  perform app.require_valid(
    not exists (select 1 from pg_attribute a join pg_class c on c.oid = a.attrelid
                 where c.relnamespace = 'public'::regnamespace
                   and c.relname = 'orders'
                   and a.attname in ('subtotal','discount_amount','tax_amount',
                                     'service_charge_amount','rounding_amount','grand_total','amount_due')
                   and (a.atttypid <> 'numeric'::regtype or a.atttypmod <> -1)),
    'NIVAAS_MIGRATION_GAP');

  -- Bills and payments tables exist
  perform app.require_valid(
    exists (select 1 from pg_class where relname = 'bills')
    and exists (select 1 from pg_class where relname = 'payments'),
    'NIVAAS_MIGRATION_GAP');

  -- The document-number walls and §6's replay walls. The replay ones are asserted UNIQUE on
  -- purpose: a non-unique idempotency index is an index the doors' replay read cannot trust,
  -- which is exactly how 018's KOT wall shipped until this file's twin was measured.
  perform app.require_valid(
    exists (select 1 from pg_class where relname = 'bills_number_idx')
    and exists (select 1 from pg_class where relname = 'payments_number_idx')
    and (select count(*) from pg_index i join pg_class c on c.oid = i.indexrelid
          where c.relname in ('bills_idempotency_scoped','payments_idempotency_scoped')
            and i.indisunique) = 2,
    'NIVAAS_MIGRATION_GAP');

  -- Triggers attached
  perform app.require_valid(
    (select count(distinct tgname) from pg_trigger
      where tgname in ('bills_touch','payments_touch','bills_chain','payments_chain',
                       'payments_immutable','order_items_recalc',
                       'order_item_options_recalc')) = 7,
    'NIVAAS_MIGRATION_GAP');

  -- ...and BOTH money surfaces re-arm the same arithmetic. A trigger on lines alone leaves an
  -- option written after its line (016:1155-1163) unpriced in the header, so the order row and the
  -- document opened from the engine disagree by exactly that option.
  perform app.require_valid(
    (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
      join pg_proc p on p.oid = t.tgfoid
      where c.relname = 'order_item_modifiers' and t.tgname = 'order_item_options_recalc'
        and p.proname = 'recalculate_option_order_totals') = 1,
    'NIVAAS_MIGRATION_GAP');

  -- The receipt wall covers ERASURE as well as editing, and that is only visible in the trigger's
  -- own event list: a BEFORE UPDATE guard leaves `delete from payments` an ordinary statement.
  perform app.require_valid(
    (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
      where t.tgname = 'payments_immutable' and c.relname = 'payments'
        and pg_get_triggerdef(t.oid) like '%DELETE%') = 1,
    'NIVAAS_MIGRATION_GAP');

  -- The engine is a helper, not a door: no served role may call it (see the revoke above). Asserted
  -- here because a grant is invisible in the schema — it is only ever a row in pg_proc.
  perform app.require_valid(
    not has_function_privilege('authenticated', 'app.calculate_restaurant_totals(uuid)', 'execute')
    and not has_function_privilege('anon', 'app.calculate_restaurant_totals(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'app.recalc_order_money(uuid)', 'execute'),
    'NIVAAS_MIGRATION_GAP');

  -- ...and pointing at THIS file's guards, paired by name: the trigger names alone would still
  -- pass if either were bolted onto 016's assert_order_chain(), which has no branch for bills or
  -- payments and therefore aborts every insert into both tables. The function behind the trigger
  -- is the fact worth checking.
  perform app.require_valid(
    (select count(*) from pg_trigger t join pg_proc p on p.oid = t.tgfoid
      where (t.tgname = 'bills_chain' and p.proname = 'assert_bill_chain')
         or (t.tgname = 'payments_chain' and p.proname = 'assert_payment_chain')) = 2,
    'NIVAAS_MIGRATION_GAP');

  -- RLS enabled
  perform app.require_valid(
    (select relrowsecurity from pg_class where relname = 'bills') = true
    and (select relrowsecurity from pg_class where relname = 'payments') = true,
    'NIVAAS_MIGRATION_GAP');

  -- Calculation engine exists in app schema
  perform app.require_valid(
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app' and p.proname = 'calculate_restaurant_totals'),
    'NIVAAS_MIGRATION_GAP');
end;
$$;
