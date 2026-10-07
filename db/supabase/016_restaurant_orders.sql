-- AMRUT NIVAAS · 016 — the order spine: orders, lines, chosen options (Prompt #04 §23-§31, §51-§57)
--
-- An OUTLET (contract §12) takes an ORDER, an order is a list of LINES, and a line is a menu
-- item with the options the guest actually chose. That is the whole depth of this file:
-- `orders` → `order_items` → `order_item_modifiers`, plus the two machines those three tables
-- exist to run — the document-number counter (§4) and the order status state machine (§7).
--
-- What this file prevents, in the donor project's own failure words:
--
--   * A float total. There is no total column at all here, on purpose (§2): a subtotal, a
--     discount, a tax, a service charge and a rounded grand total are ONE calculation
--     implementation and 017 owns it. Everything money in this file is an input to that engine
--     — a unit price and a currency on a line, an adjustment on an option — and every one of
--     them is unconstrained `numeric` guarded by `scale(trim_scale(x)) <= 2` plus a magnitude
--     bound, exactly 014's shape. `1.239` is refused, `19.9900` is stored losslessly, and
--     nothing is ever `numeric(p,s)`, because a precisioned column silently ROUNDS an over-scale
--     input and a sub-cent error disappears instead of being refused.
--   * A client-supplied tenant scope. An order's `organization_id` / `property_id` /
--     `outlet_id` are read off the OUTLET argument inside `create_order`; a line's are read off
--     the ORDER; an option's off the LINE. Never off an argument, and re-proved row-level by
--     app.assert_order_chain() — which additionally refuses a line whose dish belongs to another
--     outlet's menu, and an option whose group belongs elsewhere.
--   * A line that re-prices when the menu changes (§9). `order_items` stores
--     `item_name_snapshot`, `item_code_snapshot`, `unit_price` and `currency` from the
--     `menu_item_prices` row that was OPEN at the moment of sale. 014 built price HISTORY
--     precisely so a repriced item cannot restate a past order; this file is where that
--     guarantee gets used. Renaming or repricing the item afterwards changes no line here.
--   * A typable status. An order's nine §27 states are reachable only through
--     app.rest_order_transition_allowed(), which lives in `app`, NOT in `public` (§7):
--     PostgREST serves `public`, so the machine is not a client surface, and every door calls
--     one function instead of each inventing its own ladder. `COMPLETED → PREPARING` is
--     impossible because there is no edge for it — not because a screen hides the button.
--     Cancellation stops at CONFIRMED; everything already fired is VOID territory (§28).
--   * A double-tap booking two orders (§6, #04 §77). `idempotency_key` is scoped to
--     (organization, outlet, key) by a partial unique index, and `create_order` answers a
--     replay with the FIRST order, unchanged, audited once.
--   * A burned order number "fixed" by reusing it (§4). A number is minted per outlet per
--     business date inside the caller's transaction, so a create that aborts takes its number
--     back with it — the counter update is part of the same transaction, and that is the
--     STRONGER half of §4: an aborted create leaves no row and issues no orphan number, and
--     nothing is ever reused. The gap this counter does produce is committed and honest: an
--     idempotency replay mints a number, then answers with the FIRST order, and the minted
--     value burns (scenario 17 measures it). A gap is legal; reusing a number is what gives two
--     documents one invoice number, and the unique index below makes that impossible.
--     The counter table is generic over `prefix` because 017 mints BILL from this same engine;
--     today only ORD is ever called.
--   * A table reading AVAILABLE while an unpaid order sits on it (§54). 015 CHECKed
--     `service_status` to the three facts a person knows and handed the derived half over; this
--     file lands it, as `public.restaurant_table_status` — OUT_OF_SERVICE > CLEANING > OCCUPIED
--     > RESERVED > AVAILABLE — reading live orders through the SAME RLS policy the floor reads
--     tables through. The same hook lands in `archive_restaurant_table`, so a cover with an open
--     order on it cannot be retired.
--   * An order silently losing its table on transfer (§55). There is no table-history table:
--     `move_order_table` is one audited UPDATE whose `before`/`after` carry the old and the new
--     cover id AND code, so the trail is the history and a transfer is a dated, reasoned event
--     nobody can perform by accident.
--
-- Scope cut, stated rather than hidden. This is the SPINE ONLY. Deliberately absent, with the
-- file that owns it named at the hook: the totals/discount/tax/service-charge/rounding engine
-- and every total column, plus bills and payments (017); KOTs and line-fire states — which is
-- why `order_items.status` is only ACTIVE/VOIDED today (018); reservations, which is why the
-- derived status has no RESERVED branch yet — a CASE cannot read a table that does not exist
-- (Prompt #08); and CRM, §57, which is why `orders.customer_id` is a nullable column with no
-- foreign key — `create_order` stores it verbatim and resolves nothing, mirroring 014's
-- `tax_category_id` exactly. No Inventory,
-- recipes, procurement, tax ENGINE, payroll, Hotel PMS, housekeeping, banquet, advanced KDS,
-- online/WhatsApp ordering, AI or subscription billing: #04 §12 forbids inventing scope and this
-- file agrees with it.

-- ============================================================================ chain
--
-- The row-level twin of app.assert_menu_chain() (014) and app.assert_dining_chain() (015): a
-- denormalized (organization_id, property_id, outlet_id) must equal its parent's, and the
-- parent must itself be inside the scope it claims. This is the invariant that makes the RLS
-- predicates below sound: a policy that filters on `outlet_id` is only a tenant wall while the
-- outlet_id it filters on is the one the parent says.
--
-- It is defined BEFORE the three tables that attach it, because CREATE TRIGGER ... EXECUTE
-- FUNCTION needs the function to exist at attach time, while plpgsql resolves the table
-- references inside the body only when a trigger actually fires (by which point all three
-- tables exist). Same lazy-body rule 015 relies on.
create or replace function app.assert_order_chain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_prop   uuid;
  v_out    uuid;
  v_check  uuid;
  v_check2 uuid;
begin
  if TG_TABLE_NAME = 'orders' then
    -- An order's parent is the OUTLET (contract §12: the outlet IS the restaurant), so the
    -- chain is read off it and the copied columns are then compared against what it says.
    select o.organization_id, o.property_id, o.id into v_org, v_prop, v_out
      from public.outlets o where o.id = new.outlet_id;
    if v_out is null then
      raise exception 'NIVAAS_SCOPE_MISMATCH: outlet % does not exist', new.outlet_id;
    end if;

    if new.table_id is not null then
      -- Proved against the OUTLET, not against the order row: this is the wall under §55's
      -- "an order silently lost its table", and the reason a cross-outlet transfer is
      -- impossible rather than merely discouraged.
      select t.organization_id, t.outlet_id into v_check, v_check2
        from public.restaurant_tables t where t.id = new.table_id;
      if v_check2 is null then
        raise exception 'NIVAAS_SCOPE_MISMATCH: restaurant table % does not exist', new.table_id;
      end if;
      if v_check2 <> v_out or v_check <> v_org then
        raise exception 'NIVAAS_SCOPE_MISMATCH: an order cannot sit on a cover outside its own outlet';
      end if;
    end if;

  elsif TG_TABLE_NAME = 'order_items' then
    -- A line's parent is the ORDER. Deriving the chain from the order is what makes the two
    -- checks below meaningful rather than decorative.
    select o.organization_id, o.property_id, o.outlet_id into v_org, v_prop, v_out
      from public.orders o where o.id = new.order_id;
    if v_out is null then
      raise exception 'NIVAAS_SCOPE_MISMATCH: order % does not exist', new.order_id;
    end if;

    -- The dish on the line must be THIS outlet's own. A line pointing at a neighbour's menu
    -- item would price itself off a currency and a price list this restaurant never published
    -- — the exact smuggling this table faces, since the payload arrives as jsonb.
    select mi.outlet_id into v_check
      from public.menu_items mi where mi.id = new.menu_item_id;
    if v_check is null then
      raise exception 'NIVAAS_SCOPE_MISMATCH: menu item % does not exist', new.menu_item_id;
    end if;
    if v_check <> v_out then
      raise exception 'NIVAAS_SCOPE_MISMATCH: an order line cannot sell another outlet''s menu item';
    end if;

  elsif TG_TABLE_NAME = 'order_item_modifiers' then
    -- An option's parent is the LINE, and the line's ancestors are what an option inherits:
    -- both hops are proved, because "the order's outlet agrees with its line" is exactly the
    -- kind of thing a single-level check quietly assumes.
    select i.organization_id, i.property_id, i.outlet_id, i.order_id into v_org, v_prop, v_out, v_check2
      from public.order_items i where i.id = new.order_item_id;
    if v_out is null then
      raise exception 'NIVAAS_SCOPE_MISMATCH: order item % does not exist', new.order_item_id;
    end if;
    if not exists (select 1 from public.orders o where o.id = v_check2) then
      raise exception 'NIVAAS_SCOPE_MISMATCH: order line % has no order', new.order_item_id;
    end if;

    -- The group the option was chosen from belongs to the same outlet as the line, and a
    -- resolved option additionally belongs to that group.
    select g.outlet_id, g.menu_item_id into v_check, v_check2
      from public.modifier_groups g where g.id = new.modifier_group_id;
    if v_check is null then
      raise exception 'NIVAAS_SCOPE_MISMATCH: modifier group % does not exist', new.modifier_group_id;
    end if;
    if v_check <> v_out then
      raise exception 'NIVAAS_SCOPE_MISMATCH: an order option cannot come from another outlet''s modifier group';
    end if;
    if new.modifier_id is not null then
      select m.group_id, m.outlet_id into v_check, v_check2
        from public.modifiers m where m.id = new.modifier_id;
      if v_check2 is null then
        raise exception 'NIVAAS_SCOPE_MISMATCH: modifier % does not exist', new.modifier_id;
      end if;
      if v_check <> new.modifier_group_id or v_check2 <> v_out then
        raise exception 'NIVAAS_SCOPE_MISMATCH: an order option must be chosen from the group it belongs to';
      end if;
    end if;

  else
    raise exception 'NIVAAS_SCOPE_MISMATCH: unhandled order table %', TG_TABLE_NAME;
  end if;

  -- Now the copied ancestors must match what the parent actually says.
  if new.organization_id <> v_org or new.property_id <> v_prop or new.outlet_id <> v_out then
    raise exception 'NIVAAS_SCOPE_MISMATCH: denormalized tenant chain disagrees with the parent';
  end if;

  return new;
end;
$$;

-- ==================================================================== documents
--
-- §4: a human-readable number per outlet per business date, from a counter row, inside the
-- CALLER's transaction. Generic over `prefix` on purpose — 017 mints BILL through this same
-- engine — and the comment that matters is the one that stops someone "fixing" a gap: a
-- transaction that rolls back after minting has burnt a value, and that is correct. Reusing a
-- number is what produces two documents with one invoice number.

-- One row per (organization, outlet, prefix, business date). `last_value` is the highest value
-- handed out, not the highest value that exists: gaps are legal, so the two are different
-- numbers and only one of them is useful.
create table if not exists public.document_counters (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id     uuid not null references public.properties(id)  on delete restrict,
  outlet_id       uuid not null references public.outlets(id)     on delete restrict,
  prefix          text not null check (prefix ~ '^[A-Z][A-Z0-9]{0,7}$'),
  business_date   date not null,
  last_value      bigint not null default 0 check (last_value >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.document_counters is
  'The §4 counter behind ORD-/BILL- numbers: one row per outlet, prefix and business date. A gap in the sequence is legal and is never repaired.';
comment on column public.document_counters.prefix is
  'The document family (ORD today, BILL from 017). Generic so two migrations do not build two counters.';
comment on column public.document_counters.last_value is
  'Highest value handed out, not highest value that exists. A rolled-back transaction burns one.';

-- The uniqueness §4 asks for, spelled exactly: (organization_id, outlet_id, prefix,
-- business_date). Full, not partial, so it is a plain `if not exists` — nothing about a
-- counter row is lifecycle-dependent.
create unique index if not exists document_counters_scope_idx
  on public.document_counters (organization_id, outlet_id, prefix, business_date);
create index if not exists document_counters_outlet_idx
  on public.document_counters (outlet_id, business_date);

-- Not attached to app.assert_order_chain(): this row has no parent row inside the file's own
-- model — its ancestors are derived from the outlets row by the single function below, and the
-- ONLY writer of this table is that function. A trigger would re-assert what that function
-- already read out of `public.outlets`.

-- The business date the counter (and the order) is filed under. `outlets` carries no timezone
-- (001), so this resolves through the PROPERTY and falls back to the ORGANIZATION, and a
-- property's `business_day_start` (001's default 04:00) is honoured: a cover served at 02:30
-- belongs to yesterday's trading day, which is the difference between two outlets' ORD numbers
-- colliding and not colliding.
create or replace function app.rest_outlet_business_date(p_outlet uuid, p_at timestamptz default now())
returns date
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz    text;
  v_start time;
  v_local timestamp;
begin
  select coalesce(pr.timezone, org.timezone), coalesce(pr.business_day_start, '04:00'::time)
    into v_tz, v_start
    from public.outlets o
    join public.organizations org on org.id = o.organization_id
    left join public.properties pr on pr.id = o.property_id
   where o.id = p_outlet;
  perform app.require_valid(v_tz is not null, 'NIVAAS_NOT_FOUND');

  -- Wall-clock local time, then the business-day cut. `at time zone` on a timestamptz yields a
  -- timestamp (the clock reading), which is exactly what a business date is made of.
  v_local := p_at at time zone v_tz;
  if v_local::time < v_start then
    return (date_trunc('day', v_local) - interval '1 day')::date;
  end if;
  return v_local::date;
end;
$$;

create or replace function app.next_document_number(
  p_organization uuid,
  p_property uuid,
  p_outlet uuid,
  p_prefix text,
  p_business_date date
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_value bigint;
begin
  perform app.require_valid(p_prefix ~ '^[A-Z][A-Z0-9]{0,7}$', 'NIVAAS_INVALID_DOCUMENT_PREFIX');
  perform app.require_valid(p_business_date is not null, 'NIVAAS_INVALID_BUSINESS_DATE');

  -- FOR UPDATE inside the CALLER's transaction: two sessions minting into one outlet and one
  -- business date queue instead of both reading the same value, and the lock is held until the
  -- order commits or aborts. A create that aborts takes its number back with it (the counter
  -- update is part of the same transaction); the value a COMMITTED path burns — an idempotency
  -- replay — stays burned. Both readings of §4 forbid the same thing: reusing a number.
  select c.last_value into v_value
    from public.document_counters c
   where c.organization_id = p_organization
     and c.outlet_id = p_outlet
     and c.prefix = p_prefix
     and c.business_date = p_business_date
     for update;
  if not found then
    -- First use of this counter. The unique index above is the serialization point for two
    -- simultaneous first uses: the loser's insert raises inside a subtransaction, swallows
    -- nothing, and simply re-reads the row the winner created.
    begin
      insert into public.document_counters
        (organization_id, property_id, outlet_id, prefix, business_date, last_value)
      values (p_organization, p_property, p_outlet, p_prefix, p_business_date, 0);
    exception when unique_violation then
      null;
    end;
    select c.last_value into v_value
      from public.document_counters c
     where c.organization_id = p_organization
       and c.outlet_id = p_outlet
       and c.prefix = p_prefix
       and c.business_date = p_business_date
       for update;
  end if;

  v_value := v_value + 1;
  update public.document_counters
     set last_value = v_value, updated_at = now()
   where organization_id = p_organization and outlet_id = p_outlet
     and prefix = p_prefix and business_date = p_business_date;

  return p_prefix || '-' || lpad(v_value::text, 6, '0');
end;
$$;

-- ORD is the only prefix called today. Said out loud because the table is generic and a reader
-- who has not met 017 will look for a BILL row: there is none, because there is no bill yet.

-- ======================================================================= tables
--
-- NO TOTAL COLUMN IN THIS SECTION. `subtotal`, `discount_amount`, `tax_amount`,
-- `service_charge`, `rounding`, `grand_total`, `amount_due` — none of them appear in any of the
-- three tables below, and the self-check at the bottom of this file reads the catalog to prove
-- that. They are 017's, because §2 says one engine produces them and two places storing them is
-- how a POS total and a bill total start disagreeing.
-- 017: app.calculate_restaurant_totals(...) is the only thing that may write a total, and the
-- only thing that may add a total column to `orders`.

-- --------------------------------------------------------------------- orders
create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id     uuid not null references public.properties(id)  on delete restrict,
  outlet_id       uuid not null references public.outlets(id)     on delete restrict,
  order_number    text not null,
  -- §24 asks for five more types (below). Widening this list is a MIGRATION plus the client
  -- array mirror in src/domain/restaurant/types.ts — it is not a free-text field, and it is
  -- not a value a screen can invent.
  order_type      text not null
                  constraint orders_type_ok check (order_type in ('DINE_IN','TAKEAWAY')),
  table_id        uuid references public.restaurant_tables(id)    on delete restrict,
  -- NULLABLE AND DELIBERATELY NOT A FOREIGN KEY — the same treatment 014 gave
  -- menu_items.tax_category_id. §57 forbids CRM scope right now, so no `customers` table exists
  -- to point at, and a fake FK to a table nobody has created would be a promise this build
  -- cannot keep. The column exists so the future CRM/PMS work is an additive migration instead
  -- of a data backfill. `create_order` copies it verbatim; nothing resolves it.
  customer_id     uuid,
  -- §27's nine states. Reachable only through app.rest_order_transition_allowed() — the column
  -- says which words exist, the machine says which MOVEMENTS exist, and a CHECK cannot do the
  -- second job, which is why 015's derived-status wall needed a function too.
  status          text not null default 'DRAFT'
                  constraint orders_status_ok check (status in
                    ('DRAFT','PLACED','CONFIRMED','PREPARING','READY','SERVED',
                     'COMPLETED','CANCELLED','VOID')),
  business_date   date not null,
  notes           text,
  cancel_reason   text,
  void_reason     text,
  cancelled_at    timestamptz,
  voided_at       timestamptz,
  closed_at       timestamptz,
  idempotency_key text,
  version         integer not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid,
  -- §24/§20 together: a DINE_IN order is on a cover and a TAKEAWAY is not. A row that broke
  -- this rule would make restaurant_table_status lie about a guest who is not there, or hide a
  -- guest who is.
  constraint orders_table_matches_type
    check ((order_type = 'DINE_IN' and table_id is not null)
       or (order_type <> 'DINE_IN' and table_id is null)),
  -- §48's reason discipline made structural: a timestamp without the sentence that explains it
  -- is an event nobody can audit. The door enforces the reason BEFORE the write; this CHECK
  -- makes the row incapable of recording one without the other.
  constraint orders_cancel_reason_ok check (cancelled_at is null or cancel_reason is not null),
  constraint orders_void_reason_ok   check (voided_at is null or void_reason is not null)
);

comment on table public.orders is
  'One order at one outlet on one business date. Carries no total of any kind: 017 owns the calculation engine and every money column it produces.';
comment on column public.orders.order_number is
  'Human number from public.document_counters, unique per outlet and business date. Gaps in the sequence are legal (§4) and must never be repaired by reusing a number.';
comment on column public.orders.order_type is
  'DINE_IN or TAKEAWAY today. §24 reserves DELIVERY, ROOM_SERVICE, ONLINE, AGGREGATOR and BANQUET; adding one is a migration here AND the ORDER_TYPES array mirror, never a string a screen can pass.';
comment on column public.orders.table_id is
  'The cover, for a DINE_IN order only (CHECK enforced). Restrict, because §55 and the derived OCCUPIED both depend on a cover being unable to vanish from under a live order.';
comment on column public.orders.customer_id is
  'Opaque, nullable, and NO foreign key by design — 014''s tax_category_id precedent, because §57 keeps CRM out of this build. create_order stores it verbatim and NOTHING resolves it: there is no customers table to point at yet, so a fake FK would be a promise this build cannot keep.';
comment on column public.orders.business_date is
  'Derived in create_order from the outlet''s property/organization timezone and business_day_start. Never accepted as an argument.';
comment on column public.orders.status is
  'The §27 vocabulary. Which transitions are legal is app.rest_order_transition_allowed(), in `app` and therefore off the client surface (§7).';
comment on column public.orders.idempotency_key is
  'Optional. Unique per (organization, outlet, key) among rows that have one, so a double tap replays instead of booking twice (§6).';

-- Every PARTIAL UNIQUE index below is dropped then created rather than guarded by
-- `if not exists`: a uniqueness wall whose predicate has drifted must be REPLACED on a
-- re-apply, not skipped because the name was already there. 015's lesson, same reason.
drop index if exists public.orders_idempotency_scoped;
create unique index orders_idempotency_scoped
  on public.orders (organization_id, outlet_id, idempotency_key)
  where idempotency_key is not null;

-- §4's uniqueness, and the read that backs a printed ticket.
create unique index if not exists orders_number_idx
  on public.orders (organization_id, outlet_id, order_number, business_date);
create index if not exists orders_outlet_status_idx on public.orders (outlet_id, status);
create index if not exists orders_org_date_idx
  on public.orders (organization_id, business_date);
-- The §54 read: "is a live order sitting on this cover?" must be cheap, because the floor map
-- asks it for every cover on screen. PARTIAL, over exactly the terminal states, so the
-- restaurant_table_status view and archive_restaurant_table both land on it.
drop index if exists public.orders_live_table_idx;
create index orders_live_table_idx
  on public.orders (table_id)
  where status not in ('COMPLETED','CANCELLED','VOID');

-- ---------------------------------------------------------------- order_items
--
-- One line of one order: the dish, the options the guest actually chose, and the
-- price the kitchen was told — all frozen at the moment of sale (§9). There is no
-- discount, tax or line-total column here: 017's engine computes those FROM these
-- rows and owns every column it produces.
-- 017: discount_amount / tax_amount / line_total arrive with the calculation
-- engine, together with the totals on `orders` they belong to.
-- 018: the line-fire/KOT states of #04 §26 arrive with the KOT, which is why
-- `status` below is only ACTIVE/VOIDED today.
create table if not exists public.order_items (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  property_id          uuid not null references public.properties(id)  on delete restrict,
  outlet_id            uuid not null references public.outlets(id)     on delete restrict,
  order_id             uuid not null references public.orders(id)        on delete restrict,
  menu_item_id         uuid not null references public.menu_items(id)    on delete restrict,
  -- The snapshot (§9, #04 §12): what the guest ordered is what this row says, forever.
  -- 014 built menu_item_prices as HISTORY precisely so this can be true after a reprice,
  -- and scenario 17 measures it: reprice and rename the item, the line does not move.
  item_name_snapshot   text not null,
  item_code_snapshot   text,
  currency             text not null check (app.is_valid_currency(currency)),
  -- Money as an input to 017's engine, not an output of it: unconstrained `numeric`,
  -- exact scale via the CHECK, 014's magnitude bound — the same shape as
  -- menu_item_prices, because this IS a menu price, frozen.
  unit_price           numeric not null,
  -- §31: positive whole quantities only. A -1 line or a 0.5 line is a credit/adjustment
  -- model this build does not have (that is refunds and 017's problem, not a hack here);
  -- a line nobody can eat is refused at the column, not at the screen.
  quantity             integer not null
                       constraint order_items_quantity_ok check (quantity between 1 and 999),
  special_instructions text,
  status               text not null default 'ACTIVE'
                       constraint order_items_status_ok check (status in ('ACTIVE','VOIDED')),
  voided_at            timestamptz,
  -- The ticket's print order. Unique among LIVE lines only, because a voided line is
  -- history that keeps its slot on the printed ticket it was served on.
  line_sequence        integer not null check (line_sequence between 1 and 999),
  version              integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid,
  constraint order_items_money_ok
    check (scale(trim_scale(unit_price)) <= 2
           and unit_price >= 0 and unit_price < 1000000000000)
);

comment on table public.order_items is
  'One line of one order, snapshotted from the menu at sale time. Carries no line total: 017 computes money FROM these rows.';
comment on column public.order_items.item_name_snapshot is
  'The name the guest ordered. Renaming the menu item later must never restate a past order (§9).';
comment on column public.order_items.unit_price is
  'Frozen from the item''s OPEN menu_item_prices row at create time. Unconstrained numeric + scale CHECK, never numeric(p,s) (§1).';
comment on column public.order_items.quantity is
  '§31: between 1 and 999. No zero, no negatives, no fractions — an adjustment model does not exist yet and a line cannot be half-eaten.';
comment on column public.order_items.status is
  'ACTIVE or VOIDED today. A voided line stays in history and is excluded from 017''s totals; the KOT line-fire states are 018''s (§26).';
comment on column public.order_items.line_sequence is
  'Print order within the order, unique among ACTIVE lines (partial unique index).';

-- ---------------------------------------------------------------- order_item_modifiers
--
-- The options the guest chose on that line — also snapshotted. This is where 014's
-- explicitly deferred rule lands: min_selections/max_selections were a STATIC shape
-- check there, and the runtime count against a real order is `create_order`'s job
-- (NIVAAS_INVALID_SELECTION_COUNT, proven in both directions by scenario 17).
create table if not exists public.order_item_modifiers (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id) on delete restrict,
  property_id            uuid not null references public.properties(id)  on delete restrict,
  outlet_id              uuid not null references public.outlets(id)     on delete restrict,
  order_item_id          uuid not null references public.order_items(id)   on delete restrict,
  -- NULLABLE ON PURPOSE: a modifier retired (or, one day, deleted) must not erase the
  -- sold fact that the guest asked for it. The name and price below are the record;
  -- this id is the link back while it lasts. RESTRICT means the link cannot be cut by
  -- a delete either way — the column is nullable so an ARCHIVED modifier still reads.
  modifier_id            uuid references public.modifiers(id)            on delete restrict,
  -- NOT NULL: the group is what the choice was made against, and the chain trigger
  -- proves it belongs to the line's outlet. Without it the min/max history of a choice
  -- would be unresolvable.
  modifier_group_id      uuid not null references public.modifier_groups(id) on delete restrict,
  modifier_name_snapshot text not null,
  -- Money again as input, not output: the adjustment frozen at sale time, negative
  -- allowed (a cheaper swap is a real thing on a menu), 014's modifiers bound.
  price_adjustment       numeric not null,
  currency               text not null check (app.is_valid_currency(currency)),
  quantity               integer not null default 1
                         constraint order_item_modifiers_quantity_ok check (quantity between 1 and 99),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  created_by             uuid,
  constraint order_item_modifiers_money_ok
    check (scale(trim_scale(price_adjustment)) <= 2
           and price_adjustment between -1000000000 and 1000000000)
);

comment on table public.order_item_modifiers is
  'The chosen options on an order line, snapshotted. 014 deferred the min/max selection COUNT to order time; these rows are where it was enforced.';
comment on column public.order_item_modifiers.modifier_id is
  'Nullable: a retired modifier must not erase a sold line. The snapshot columns, not the link, are the record.';

create index if not exists order_items_order_idx on public.order_items (order_id);
create index if not exists order_items_item_idx on public.order_items (menu_item_id);
create index if not exists order_item_modifiers_item_idx
  on public.order_item_modifiers (order_item_id);

-- The §30 print-order wall: live lines of one order cannot share a slot. PARTIAL,
-- because a VOIDED line keeps the slot it was served on — drop-then-create so a
-- re-apply replaces the predicate too rather than skipping on a name collision.
drop index if exists public.order_items_live_sequence_idx;
create unique index order_items_live_sequence_idx
  on public.order_items (order_id, line_sequence)
  where status = 'ACTIVE';

-- Touch and chain for all three tables. The chain guard is app.assert_order_chain(),
-- defined at the top of this file before any of these tables existed.
drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders
  for each row execute function app.touch_updated_at();

drop trigger if exists orders_chain on public.orders;
create trigger orders_chain before insert or update on public.orders
  for each row execute function app.assert_order_chain();

drop trigger if exists order_items_touch on public.order_items;
create trigger order_items_touch before update on public.order_items
  for each row execute function app.touch_updated_at();

drop trigger if exists order_items_chain on public.order_items;
create trigger order_items_chain before insert or update on public.order_items
  for each row execute function app.assert_order_chain();

drop trigger if exists order_item_modifiers_touch on public.order_item_modifiers;
create trigger order_item_modifiers_touch before update on public.order_item_modifiers
  for each row execute function app.touch_updated_at();

drop trigger if exists order_item_modifiers_chain on public.order_item_modifiers;
create trigger order_item_modifiers_chain before insert or update on public.order_item_modifiers
  for each row execute function app.assert_order_chain();

-- ======================================================================= rls

-- Mirrors 014's and 015's blocks exactly: enabled, readable by the client role under
-- the SAME outlet predicate the write doors use, and with no DML at all. The line and
-- option tables carry their own outlet_id precisely so this predicate can be the same
-- simple test at every level — the chain trigger above is what makes it sound.
alter table public.orders                enable row level security;
alter table public.order_items           enable row level security;
alter table public.order_item_modifiers  enable row level security;

grant select on public.orders, public.order_items, public.order_item_modifiers
  to authenticated, service_role;

revoke all on public.orders, public.order_items, public.order_item_modifiers from anon;

revoke insert, update, delete, truncate
  on public.orders, public.order_items, public.order_item_modifiers
  from authenticated;

drop policy if exists orders_outlet_read on public.orders;
create policy orders_outlet_read on public.orders
  for select to authenticated
  using (app.can_access_outlet(app.current_user_id(), outlet_id));

drop policy if exists order_items_outlet_read on public.order_items;
create policy order_items_outlet_read on public.order_items
  for select to authenticated
  using (app.can_access_outlet(app.current_user_id(), outlet_id));

drop policy if exists order_item_modifiers_outlet_read on public.order_item_modifiers;
create policy order_item_modifiers_outlet_read on public.order_item_modifiers
  for select to authenticated
  using (app.can_access_outlet(app.current_user_id(), outlet_id));

-- ----------------------------------------------------- document_counters: server-internal
--
-- THE counter-forgery cut. The ONLY writer of this table is app.next_document_number()
-- above — a SECURITY DEFINER function that reads the chain off the outlet and mints
-- inside the caller's transaction. So the client role gets nothing: no SELECT (a
-- counter value is not a business fact anyone should read), no INSERT/UPDATE (a client
-- that can advance a counter is a client that can forge ORD- and BILL- numbers, skip
-- the audit trail of a day's takings, and collide printed documents with numbers the
-- sequence never issued). RLS is enabled with NO POLICY AT ALL, so even a stray grant
-- or a future default-privilege change reads zero rows; the revokes make the refusal
-- loud at the privilege layer first. `service_role` is the only non-owner role with
-- access, because it is the only trusted server identity in this stack.
alter table public.document_counters enable row level security;

revoke all on public.document_counters from authenticated, anon;
grant select, insert, update on public.document_counters to service_role;

-- ===================================================================== derived status
--
-- §20's other half, the part 015 explicitly handed to 016: the operational truth of a
-- cover is PARTLY derived. A live (non-terminal) order on a table makes it OCCUPIED;
-- nobody may set that word, and 015's CHECK is what keeps a person from typing it.
-- Precedence is OUT_OF_SERVICE > CLEANING > OCCUPIED > RESERVED > AVAILABLE:
-- a broken table outranks a dirty one, a dirty one outranks a guest, and a guest
-- outranks an empty cover. §54's contradiction — an AVAILABLE cover with an unpaid
-- order on it — is made impossible here, in one read, not discouraged in three screens.
--
-- RESERVED has no source yet: reservations are Prompt #08's, and a CASE arm cannot
-- read a table that does not exist. This slot in the precedence chain is where its
-- branch lands when that migration arrives — it is deliberately NOT faked with a
-- `when false` arm or a predicate on some other column, because a fake derived state
-- would be exactly the "uncontrolled manually edited status" §20 refuses.
--
-- security_invoker = true is the whole point: the view runs the QUERYING role's own
-- RLS (015's outlet policy on restaurant_tables, and orders_outlet_read just above),
-- so a plain view owned by the migration user would not silently widen any tenant's
-- read. That is why 015 shipped no read door and this ships a view instead: the
-- §54 read is per-cover and belongs next to the covers, and scenario 17 measures the
-- leak directly (tenant B reads zero rows here).
create or replace view public.restaurant_table_status
with (security_invoker = true)
as
select t.id                              as table_id,
       t.organization_id,
       t.property_id,
       t.outlet_id,
       t.area_id,
       a.name                            as area_name,
       t.name                            as table_name,
       t.code                            as table_code,
       t.capacity,
       t.service_status,
       lo.live_orders,
       case
         when t.service_status = 'OUT_OF_SERVICE' then 'OUT_OF_SERVICE'
         when t.service_status = 'CLEANING'       then 'CLEANING'
         when lo.live_orders > 0                  then 'OCCUPIED'
         -- RESERVED: the §20 precedence slot a live reservation would claim, between
         -- OCCUPIED and AVAILABLE. Prompt #08 owns that source row; no fake arm today.
         else 'AVAILABLE'
       end                               as derived_status
  from public.restaurant_tables t
  join public.dining_areas a on a.id = t.area_id
  left join lateral (
    select count(*)::integer as live_orders
      from public.orders o
     where o.table_id = t.id
       and o.status not in ('COMPLETED','CANCELLED','VOID')
  ) lo on true
 where t.status <> 'ARCHIVED';

comment on view public.restaurant_table_status is
  '§20/§54: the cover''s operational truth. service_status is what a person set; derived_status layers the live order over it with OUT_OF_SERVICE > CLEANING > OCCUPIED > RESERVED > AVAILABLE. security_invoker, so the reading role''s own RLS applies.';

grant select on public.restaurant_table_status to authenticated, service_role;
revoke all on public.restaurant_table_status from anon;

-- ------------------------------------------------- 015's hook, landed (see header)
--
-- 015 comments its exact location: "016: this is where the live-order check joins it
-- — an OPEN order on this table must refuse the archive too." 015 must not be edited,
-- so the whole door is redefined here with `create or replace`, keeping 015's body
-- byte-for-byte and ADDING one refusal: a cover with a live order on it cannot be
-- retired, no matter what its manual service_status says (the one that lies loudest
-- about a guest still sitting there).
create or replace function public.archive_restaurant_table(p_table uuid, p_reason text)
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
  select to_jsonb(t) into v_before from public.restaurant_tables t where t.id = p_table;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');
  v_org  := (v_before->>'organization_id')::uuid;
  v_prop := (v_before->>'property_id')::uuid;
  v_out  := (v_before->>'outlet_id')::uuid;
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('table.archive', v_org, v_prop, v_out);
  perform app.require_writable_outlet(v_out);
  perform app.require_reason(p_reason);

  -- 015's refusal, kept verbatim in spirit: a cover the floor is not standing behind
  -- manually cannot be retired either.
  perform app.require_valid(
    (v_before->>'service_status') = 'AVAILABLE', 'NIVAAS_TABLE_IN_USE');

  -- 016's addition — the same token, because it is the same problem: the cover is in
  -- use. A live order is the louder fact than the person-cleaner never marked.
  -- This rides orders_live_table_idx, the partial index built for exactly this read.
  perform app.require_valid(
    not exists (select 1 from public.orders o
                 where o.table_id = p_table
                   and o.status not in ('COMPLETED','CANCELLED','VOID')),
    'NIVAAS_TABLE_IN_USE');

  update public.restaurant_tables
     set status = 'ARCHIVED', archived_at = now(), version = version + 1
   where id = p_table;
  select to_jsonb(t) into v_after from public.restaurant_tables t where t.id = p_table;

  perform app.audit('restaurant_table_archived', 'restaurant_table', p_table,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_before := v_before, p_after := v_after, p_reason := p_reason);
  return v_after;
end;
$$;

-- ================================================================ state machine
--
-- §27's ladder is nine states and thirteen legal moves; the moves, not the words, are
-- the security property. So the map lives in `app` — PostgREST serves `public`, and a
-- transition rule published over HTTP is a rule a client can call for a row it
-- cannot read. Every door below asks this one function; none of them compares status
-- strings by hand, which is how 007's donor project grew eleven status checks in
-- eleven code paths and made each of them wrong in a different way.
--
-- The shape is deliberate: an explicit edge list, one comment per edge, and
-- ABSENCE as the wall. COMPLETED, CANCELLED and VOID have no outgoing edges at all,
-- so §27's "COMPLETED → PREPARING" is impossible rather than discouraged — there is
-- no edge to take, and the CHECK on the column cannot help because the word is
-- perfectly legal there; only this map knows the difference between a word that
-- exists and a move that is allowed.
--
-- §28's rule, written as the design it is: CANCELLATION stops at CONFIRMED. Until
-- the kitchen works on an order, un-serving it is a cancellation. Once lines are
-- fired, the guest has been served facts, and the only honest verb left is VOID —
-- which is why VOID covers PREPARING/READY/SERVED (and DRAFT, for a booking that
-- was never real) and CANCEL does not.
create or replace function app.rest_order_transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_from, '') || '>' || coalesce(p_to, '') in (
    'DRAFT>PLACED',           -- the order is written; it goes to the pass
    'PLACED>CONFIRMED',       -- the restaurant accepts it
    'CONFIRMED>PREPARING',    -- the kitchen starts cooking  (§28: fire this, and CANCEL is gone)
    'PREPARING>READY',        -- cooked, waiting on runner
    'READY>SERVED',           -- on the cover / handed over
    'SERVED>COMPLETED',       -- closed; 017's settlement writes the bill around this
    'DRAFT>CANCELLED',        -- never really happened
    'PLACED>CANCELLED',       -- guest walked out before the pass saw it
    'CONFIRMED>CANCELLED',    -- §28's last legal moment for a cancel
    'DRAFT>VOID',             -- a phantom booking: void it, keep the history
    'PREPARING>VOID',         -- §28: already fired at the kitchen, so only void remains
    'READY>VOID',             -- cooked and uneaten; the line history must say so
    'SERVED>VOID'             -- walked out after eating; still void, never deleted
  );
$$;

-- One call per door, one token per refusal. The refusal says the MOVE was illegal —
-- never which moves from the current state would have been, so the error cannot turn
-- into a state-machine oracle for someone holding an id.
create or replace function app.require_order_transition(p_from text, p_to text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_valid(app.rest_order_transition_allowed(p_from, p_to),
    'NIVAAS_INVALID_TRANSITION');
end;
$$;

-- ===================================================================== resolver
--
-- The single place a jsonb order line becomes database facts, shared by create_order
-- and add_order_items so the two doors cannot drift. Reads ONLY through SECURITY
-- DEFINER and returns NOTHING to the client that it did not validate — the caller
-- assembles rows out of the returned object. The output object carries money as
-- TEXT (the door-internal copy is cast back with ::numeric on the same
-- transaction; what the doors return to callers is text, per contract §1).
--
-- Refusals answer existence questions the way every door here does: a row in another
-- tenant is NIVAAS_NOT_FOUND (§10, never confirm it exists); a row in YOUR tenant
-- that simply cannot be sold right now is NIVAAS_ITEM_NOT_ON_MENU, because that
-- knowledge is already yours; an item with no open price row is
-- NIVAAS_ITEM_HAS_NO_PRICE, which 014 made reachable precisely so this door can
-- refuse it rather than selling an unpriced plate.
--
-- This is where 014 deferred its runtime selection rule to: min_selections /
-- max_selections were a STATIC shape check there ("min <= max"); the count of what
-- a real order picked is checked here (NIVAAS_INVALID_SELECTION_COUNT), in both
-- directions, including groups the payload did not mention at all — a group with
-- min 1 that nobody answered is the same failure as picking zero.
create or replace function app.resolve_restaurant_order_line(p_outlet uuid, p_elem jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_item        uuid;
  v_qty         integer := 1;
  v_si          text;
  v_name        text;
  v_code        text;
  v_menu_id     uuid;
  v_menu_cur    text;
  v_menu_out    uuid;
  v_menu_status text;
  v_item_org    uuid;
  v_item_status text;
  v_available   boolean;
  v_out_org     uuid;
  v_price       numeric;
  v_price_cur   text;
  v_mods        jsonb := '[]'::jsonb;
  v_g           jsonb;
  v_ids         jsonb;
  v_group       uuid;
  v_mid         uuid;
  v_id          text;
  v_mname       text;
  v_madj        numeric;
  v_gmin        integer;
  v_gmax        integer;
  v_n           integer;
  v_seen        uuid[] := '{}';
  v_seen_mods   uuid[];
begin
  perform app.require_valid(p_elem is not null and jsonb_typeof(p_elem) = 'object',
    'NIVAAS_INVALID_ORDER_LINE');

  -- Cast-safe first: a malformed uuid must be a domain refusal, never a
  -- Postgres cast error leaking a schema detail.
  perform app.require_valid(
    p_elem->>'itemId' is not null
    and p_elem->>'itemId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    'NIVAAS_INVALID_ORDER_LINE');
  v_item := (p_elem->>'itemId')::uuid;

  -- Quantity: a jsonb NUMBER whose text form is a plain integer, in 1..999. The
  -- regex runs BEFORE any cast, so "1.5", "0", "-2" and "abc" are all refused as
  -- the same domain problem the line owner can fix. Default 1 when unstated —
  -- "one of these" is the thing a cashier means by tapping a dish.
  if p_elem ? 'quantity' and p_elem -> 'quantity' <> 'null'::jsonb then
    perform app.require_valid(
      jsonb_typeof(p_elem -> 'quantity') = 'number'
      and (p_elem ->> 'quantity') ~ '^-?[0-9]+$',
      'NIVAAS_INVALID_QUANTITY');
    perform app.require_valid(
      (p_elem ->> 'quantity')::numeric between 1 and 999,
      'NIVAAS_INVALID_QUANTITY');
    v_qty := (p_elem ->> 'quantity')::integer;
  end if;

  if p_elem ? 'specialInstructions' and p_elem -> 'specialInstructions' <> 'null'::jsonb then
    perform app.require_valid(jsonb_typeof(p_elem -> 'specialInstructions') = 'string',
      'NIVAAS_INVALID_ORDER_LINE');
    v_si := p_elem ->> 'specialInstructions';
  end if;

  select mi.organization_id, mi.name, mi.item_code, mi.menu_id, mi.status, mi.is_available,
         m.currency, m.outlet_id, m.status, o.organization_id
    into v_item_org, v_name, v_code, v_menu_id, v_item_status, v_available,
         v_menu_cur, v_menu_out, v_menu_status, v_out_org
    from public.menu_items mi
    join public.menus m on m.id = mi.menu_id
    join public.outlets o on o.id = p_outlet
   where mi.id = v_item;
  perform app.require_valid(v_item_org is not null, 'NIVAAS_NOT_FOUND');

  -- Another tenant's dish answers the same way the missing one did.
  perform app.require_valid(v_item_org = v_out_org, 'NIVAAS_NOT_FOUND');

  -- In the tenant, but not sellable HERE, RIGHT NOW: wrong outlet, unpublished or
  -- retired menu, retired item, sold out. Four facts the POS already has and must
  -- be told about — they are not stranger-shape.
  perform app.require_valid(
    v_menu_out = p_outlet and v_menu_status = 'ACTIVE'
    and v_item_status = 'ACTIVE' and v_available,
    'NIVAAS_ITEM_NOT_ON_MENU');

  -- The OPEN (effective_to IS NULL) price row — the exact row 014's
  -- menu_item_current_price resolves, and the whole point of price HISTORY: the
  -- line freezes THIS value and the menu can move on without restating the sale.
  select p.unit_price, p.currency into v_price, v_price_cur
    from public.menu_item_prices p
   where p.menu_item_id = v_item and p.effective_to is null;
  perform app.require_valid(v_price is not null, 'NIVAAS_ITEM_HAS_NO_PRICE');
  -- Defensive: 014 keeps a price and its menu in the same currency. If that ever
  -- stopped being true, freezing the MENU's currency on a line priced in another
  -- would be a silent money lie; refuse instead, and mean by INTERNAL.
  if v_price_cur is distinct from v_menu_cur then
    raise exception 'NIVAAS_CURRENCY_MISMATCH';
  end if;

  -- Modifiers: per chosen group — belongs to this item, live, in this outlet,
  -- answer within min..max, no double answers, options that exist in that group
  -- and are still live. Then globally: every live group with min >= 1 must have
  -- been answered at all.
  if p_elem ? 'modifiers' and p_elem -> 'modifiers' <> 'null'::jsonb then
    perform app.require_valid(jsonb_typeof(p_elem -> 'modifiers') = 'array',
      'NIVAAS_INVALID_ORDER_LINE');
    for v_g in select * from jsonb_array_elements(p_elem -> 'modifiers') loop
      perform app.require_valid(
        jsonb_typeof(v_g) = 'object'
        and v_g ->> 'groupId' is not null
        and v_g ->> 'groupId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
        'NIVAAS_INVALID_MODIFIER_CHOICE');
      v_group := (v_g ->> 'groupId')::uuid;
      -- The same group twice would be two answers to one question.
      perform app.require_valid(not (v_group = any (v_seen)),
        'NIVAAS_INVALID_MODIFIER_CHOICE');
      v_seen := v_seen || v_group;

      select g.min_selections, g.max_selections into v_gmin, v_gmax
        from public.modifier_groups g
       where g.id = v_group and g.menu_item_id = v_item
         and g.menu_id = v_menu_id and g.outlet_id = p_outlet
         and g.status = 'ACTIVE';
      -- v_gmin stays NULL when the group is not this item's live group at this
      -- outlet; the min..max comparison below turns that into the refusal.
      v_gmin := coalesce(v_gmin, -1);
      perform app.require_valid(v_gmin >= 0, 'NIVAAS_INVALID_MODIFIER_CHOICE');

      v_ids := '[]'::jsonb;
      if v_g ? 'modifierIds' and v_g -> 'modifierIds' <> 'null'::jsonb then
        perform app.require_valid(jsonb_typeof(v_g -> 'modifierIds') = 'array',
          'NIVAAS_INVALID_MODIFIER_CHOICE');
        v_ids := v_g -> 'modifierIds';
      end if;

      -- The rule 014 deferred: what the ORDER picked, counted against what the
      -- GROUP allows. An empty answer to a min-0 group is a legal DECLINE.
      v_n := jsonb_array_length(v_ids);
      perform app.require_valid(v_n between v_gmin and v_gmax,
        'NIVAAS_INVALID_SELECTION_COUNT');

      v_seen_mods := '{}';
      for v_id in select jsonb_array_elements_text(v_ids) loop
        perform app.require_valid(
          v_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
          'NIVAAS_INVALID_MODIFIER_CHOICE');
        v_mid := v_id::uuid;
        perform app.require_valid(not (v_mid = any (v_seen_mods)),
          'NIVAAS_INVALID_MODIFIER_CHOICE');
        v_seen_mods := v_seen_mods || v_mid;

        select m.name, m.price_adjustment into v_mname, v_madj
          from public.modifiers m
         where m.id = v_mid and m.group_id = v_group
           and m.menu_item_id = v_item and m.outlet_id = p_outlet
           and m.status = 'ACTIVE';
        perform app.require_valid(v_mname is not null, 'NIVAAS_INVALID_MODIFIER_CHOICE');

        v_mods := v_mods || jsonb_build_object(
          'groupId', v_group,
          'modifierId', v_mid,
          'name', v_mname,
          -- money as TEXT inside the frozen object too: every copy of a price in
          -- this file's outputs is a string (contract §1).
          'priceAdjustment', v_madj::text,
          'currency', v_menu_cur);
      end loop;
      v_mname := null;  -- reset so the NEXT group's missing-row check is honest
      v_madj := null;
    end loop;
  end if;

  -- A live group of this item that demands at least one choice and was never
  -- mentioned is the same failure as choosing zero of it.
  perform app.require_valid(
    not exists (select 1 from public.modifier_groups g
                 where g.menu_item_id = v_item and g.menu_id = v_menu_id
                   and g.status = 'ACTIVE' and g.min_selections > 0
                   and not (g.id = any (v_seen))),
    'NIVAAS_INVALID_SELECTION_COUNT');

  return jsonb_build_object(
    'menuItemId', v_item,
    'itemName', v_name,
    'itemCode', v_code,
    'currency', v_menu_cur,
    'unitPrice', v_price::text,
    'quantity', v_qty,
    'specialInstructions', v_si,
    'mods', v_mods);
end;
$$;

-- ======================================================================== doors
--
-- Eight doors. Every one of them: session first, chain read off the PARENT row (the
-- outlet for an order, the order for a line, the line for an option) and never off
-- an argument, the refusal ladder in the same order as 014/015 (NOT_FOUND → tenant →
-- permission → writable → validation), exactly one audit row per accepted write, and
-- money returned as TEXT. `p_expected_version` on the update family is 005's lost-
-- update guard; stating it is optional, ignoring it after stating it is not.

-- ------------------------------------------------------------------- create_order
--
-- The order's whole scope comes from ONE argument: p_outlet. The organization and
-- property are read off the outlets row, the business date is derived from the
-- outlet's own timezone chain, the number comes from the counter, and customer_id is
-- stored verbatim because §57 keeps CRM out of this build (nothing resolves it).
-- Idempotency is §6's contract: the same (outlet, key) answers with the FIRST order,
-- unchanged, audited once — the replay's minted number is burned, which is legal
-- (§4) and which scenario 17 measures as a gap nobody may paper over.
create or replace function public.create_order(
  p_outlet uuid,
  p_order_type text,
  p_items jsonb,
  p_table uuid default null,
  p_customer_id uuid default null,
  p_notes text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid := app.require_session();
  v_org      uuid;
  v_prop     uuid;
  v_order    jsonb;
  v_line     jsonb;
  v_lines    jsonb;
  v_mod      jsonb;
  v_elem     jsonb;
  v_date     date;
  v_number   text;
  v_order_id uuid;
  v_item_id  uuid;
  v_seq      integer := 0;
  v_key      text := nullif(btrim(p_idempotency_key), '');
begin
  select o.organization_id, o.property_id into v_org, v_prop
    from public.outlets o where o.id = p_outlet;
  perform app.require_valid(v_org is not null, 'NIVAAS_NOT_FOUND');
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('order.create', v_org, v_prop, p_outlet);
  perform app.require_writable_outlet(p_outlet);

  -- Vocabulary before shape: an unknown type is the same class of failure 015's
  -- status door answers first, and before anything table-shaped gets examined.
  perform app.require_valid(p_order_type in ('DINE_IN','TAKEAWAY'),
    'NIVAAS_INVALID_ORDER_TYPE');
  -- §24's pairing as one sentence: DINE_IN means a cover, anything else means not
  -- having one. orders_table_matches_type repeats it at the row; the door answers
  -- with the domain code so the POS learns WHICH half it got wrong.
  perform app.require_valid((p_order_type = 'DINE_IN') = (p_table is not null),
    'NIVAAS_ORDER_TABLE_MISMATCH');
  if p_table is not null then
    -- A cover of THIS outlet or it is not a cover at all here: an id from the
    -- rooftop is NOT a Main Dining table and the chain trigger would only be the
    -- second thing to say so.
    perform app.require_valid(
      exists (select 1 from public.restaurant_tables t
               where t.id = p_table and t.outlet_id = p_outlet and t.status <> 'ARCHIVED'),
      'NIVAAS_TABLE_NOT_IN_OUTLET');
    -- An OUT_OF_SERVICE cover is a person's stated fact ("do not seat anyone
    -- here"); a booking must not walk around it. CLEANING is NOT refused: the
    -- §20 precedence is CLEANING > OCCUPIED, i.e. a table can be being wiped
    -- and take a booking anyway — that ordering is the door's, and the derived
    -- view's, resolution.
    perform app.require_valid(
      not exists (select 1 from public.restaurant_tables t
                   where t.id = p_table and t.service_status = 'OUT_OF_SERVICE'),
      'NIVAAS_TABLE_OUT_OF_SERVICE');
  end if;

  perform app.require_valid(p_items is not null and jsonb_typeof(p_items) = 'array',
    'NIVAAS_EMPTY_ORDER');
  perform app.require_valid(jsonb_array_length(p_items) > 0, 'NIVAAS_EMPTY_ORDER');

  -- Every line resolves BEFORE anything is booked: an order the kitchen cannot
  -- cook never reaches the sequence, so a mistyped item costs no document number
  -- — a refused create leaves the counter where it was (scenario 17 measures the
  -- value not moving across failed creates). The frozen values written below come
  -- from THIS resolve pass, not from a second menu read: a reprice landing between
  -- resolve and insert is exactly what the snapshot makes harmless.
  v_lines := '[]'::jsonb;
  for v_elem in select * from jsonb_array_elements(p_items) loop
    v_lines := v_lines || jsonb_build_array(app.resolve_restaurant_order_line(p_outlet, v_elem));
  end loop;

  v_date := app.rest_outlet_business_date(p_outlet);
  v_number := app.next_document_number(v_org, v_prop, p_outlet, 'ORD', v_date);

  -- The idempotency wall lives in its own block so the replay path can answer
  -- WITHOUT aborting the transaction: the mint already done stays burned (a
  -- committed gap, §4 — "never repaired" is this sentence's job), while the
  -- duplicate insert is caught, discarded, and the FIRST order is returned with
  -- its original number, its lines and exactly one order_created audit row.
  begin
    insert into public.orders (organization_id, property_id, outlet_id, order_number,
      order_type, table_id, customer_id, business_date, notes, idempotency_key, created_by)
    values (v_org, v_prop, p_outlet, v_number, p_order_type, p_table, p_customer_id,
      v_date, nullif(btrim(p_notes), ''), v_key, v_actor)
    returning id into v_order_id;
  exception when unique_violation then
    if v_key is null then
      raise;  -- not a replay: the number itself collided (it cannot; do not mask it)
    end if;
    select to_jsonb(o) into v_order
      from public.orders o
     where o.organization_id = v_org and o.outlet_id = p_outlet
       and o.idempotency_key = v_key
     order by o.created_at
     limit 1;
    if v_order is null then
      raise;  -- same story: a collision on nothing replayable; never mask it
    end if;
    return v_order;  -- replay: unchanged first order, no second booking, no second audit
  end;

  for v_line in select * from jsonb_array_elements(v_lines) loop
    v_seq := v_seq + 1;
    insert into public.order_items (organization_id, property_id, outlet_id, order_id,
      menu_item_id, item_name_snapshot, item_code_snapshot, currency, unit_price,
      quantity, special_instructions, line_sequence, created_by)
    values (v_org, v_prop, p_outlet, v_order_id,
      (v_line ->> 'menuItemId')::uuid, v_line ->> 'itemName', v_line ->> 'itemCode',
      v_line ->> 'currency', (v_line ->> 'unitPrice')::numeric,
      (v_line ->> 'quantity')::integer,
      nullif(btrim(v_line ->> 'specialInstructions'), ''), v_seq, v_actor)
    returning id into v_item_id;

    for v_mod in select * from jsonb_array_elements(v_line -> 'mods') loop
      insert into public.order_item_modifiers (organization_id, property_id, outlet_id,
        order_item_id, modifier_id, modifier_group_id, modifier_name_snapshot,
        price_adjustment, currency, created_by)
      values (v_org, v_prop, p_outlet, v_item_id,
        (v_mod ->> 'modifierId')::uuid, (v_mod ->> 'groupId')::uuid,
        v_mod ->> 'name', (v_mod ->> 'priceAdjustment')::numeric,
        v_mod ->> 'currency', v_actor);
    end loop;
  end loop;

  select to_jsonb(o) into v_order from public.orders o where o.id = v_order_id;
  perform app.audit('order_created', 'order', v_order_id,
    p_organization := v_org, p_property := v_prop, p_outlet := p_outlet,
    p_after := v_order);
  return v_order;
end;
$$;

-- ---------------------------------------------------------------- add_order_items
--
-- §51's gate: only a DRAFT or a PLACED order takes new lines. From CONFIRMED on the
-- pass owns the tickets; COMPLETED is history. One token for every closed moment —
-- the order at that point is not editable, whatever else a caller could do to it.
-- The parent order is locked FOR UPDATE first (contract §5: parent before children,
-- so two sessions adding lines to one order queue instead of racing on line_sequence).
create or replace function public.add_order_items(
  p_order uuid,
  p_items jsonb,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid := app.require_session();
  v_order    jsonb;
  v_after    jsonb;
  v_line     jsonb;
  v_mod      jsonb;
  v_elem     jsonb;
  v_org      uuid;
  v_prop     uuid;
  v_out      uuid;
  v_item_id  uuid;
  v_seq      integer;
  v_before_lines integer;
begin
  select to_jsonb(o) into v_order from public.orders o where o.id = p_order for update;
  perform app.require_valid(v_order is not null, 'NIVAAS_NOT_FOUND');
  v_org  := (v_order ->> 'organization_id')::uuid;
  v_prop := (v_order ->> 'property_id')::uuid;
  v_out  := (v_order ->> 'outlet_id')::uuid;
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('order.edit', v_org, v_prop, v_out);
  perform app.require_writable_outlet(v_out);
  perform app.require_version((v_order ->> 'version')::integer, p_expected_version);
  perform app.require_valid(v_order ->> 'status' in ('DRAFT','PLACED'),
    'NIVAAS_IMMUTABLE_ORDER');

  perform app.require_valid(p_items is not null and jsonb_typeof(p_items) = 'array',
    'NIVAAS_EMPTY_ORDER');
  perform app.require_valid(jsonb_array_length(p_items) > 0, 'NIVAAS_EMPTY_ORDER');

  -- Continue the ticket's numbering, among LIVE lines — a voided line keeps its old
  -- slot on the printed ticket, so it does not hold the next one hostage.
  select count(*)::integer into v_before_lines
    from public.order_items where order_id = p_order and status = 'ACTIVE';
  select coalesce(max(line_sequence), 0) into v_seq
    from public.order_items
   where order_id = p_order and status = 'ACTIVE';

  for v_elem in select * from jsonb_array_elements(p_items) loop
    v_line := app.resolve_restaurant_order_line(v_out, v_elem);
    v_seq := v_seq + 1;
    insert into public.order_items (organization_id, property_id, outlet_id, order_id,
      menu_item_id, item_name_snapshot, item_code_snapshot, currency, unit_price,
      quantity, special_instructions, line_sequence, created_by)
    values (v_org, v_prop, v_out, p_order,
      (v_line ->> 'menuItemId')::uuid, v_line ->> 'itemName', v_line ->> 'itemCode',
      v_line ->> 'currency', (v_line ->> 'unitPrice')::numeric,
      (v_line ->> 'quantity')::integer,
      nullif(btrim(v_line ->> 'specialInstructions'), ''), v_seq, v_actor)
    returning id into v_item_id;

    for v_mod in select * from jsonb_array_elements(v_line -> 'mods') loop
      insert into public.order_item_modifiers (organization_id, property_id, outlet_id,
        order_item_id, modifier_id, modifier_group_id, modifier_name_snapshot,
        price_adjustment, currency, created_by)
      values (v_org, v_prop, v_out, v_item_id,
        (v_mod ->> 'modifierId')::uuid, (v_mod ->> 'groupId')::uuid,
        v_mod ->> 'name', (v_mod ->> 'priceAdjustment')::numeric,
        v_mod ->> 'currency', v_actor);
    end loop;
  end loop;

  update public.orders set version = version + 1 where id = p_order;
  select to_jsonb(o) into v_after from public.orders o where o.id = p_order;

  perform app.audit('order_items_added', 'order', p_order,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_before := jsonb_build_object('version', v_order -> 'version',
                                   'liveLines', v_before_lines),
    p_after := jsonb_build_object('version', v_after -> 'version',
                                  'addedLines', jsonb_array_length(p_items)));
  return v_after;
end;
$$;

-- ---------------------------------------------------------------- update_order_item
--
-- Same §51 window as add_order_items, one level down: the line itself may be
-- re-counted or its instructions rewritten while the order is still the restaurant's
-- to change. A VOIDED line refuses with the same token — it is history of what was
-- served, not a draft. p_special_instructions follows 005's blankable rule: absent
-- means not edited, empty means the operator cleared it.
create or replace function public.update_order_item(
  p_item uuid,
  p_quantity integer default null,
  p_special_instructions text default null,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := app.require_session();
  v_line   jsonb;
  v_order  jsonb;
  v_after  jsonb;
  v_org    uuid;
  v_prop   uuid;
  v_out    uuid;
begin
  -- One statement, parent and line locked together (contract §5's queue).
  select to_jsonb(i), to_jsonb(o) into v_line, v_order
    from public.order_items i
    join public.orders o on o.id = i.order_id
   where i.id = p_item
   for update of o, i;
  perform app.require_valid(v_line is not null, 'NIVAAS_NOT_FOUND');
  v_org  := (v_order ->> 'organization_id')::uuid;
  v_prop := (v_order ->> 'property_id')::uuid;
  v_out  := (v_order ->> 'outlet_id')::uuid;
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('order.edit', v_org, v_prop, v_out);
  perform app.require_writable_outlet(v_out);
  -- History first, then the lost update, then the value: a caller who did not state
  -- a version still cannot write into a terminal order or onto a dead line.
  perform app.require_valid(v_line ->> 'status' = 'ACTIVE', 'NIVAAS_IMMUTABLE_ORDER');
  perform app.require_valid(v_order ->> 'status' in ('DRAFT','PLACED'),
    'NIVAAS_IMMUTABLE_ORDER');
  perform app.require_version((v_line ->> 'version')::integer, p_expected_version);
  perform app.require_valid(p_quantity is not null or p_special_instructions is not null,
    'NIVAAS_INVALID_ORDER_LINE');
  if p_quantity is not null then
    -- The typed integer still has to be a quantity: 0, negative and >999 are the
    -- same §31 refusal the jsonb resolver gives, whichever door they arrive at.
    perform app.require_valid(p_quantity between 1 and 999, 'NIVAAS_INVALID_QUANTITY');
  end if;

  update public.order_items
     set quantity = coalesce(p_quantity, quantity),
         special_instructions = app.blankable(special_instructions, p_special_instructions),
         version = version + 1
   where id = p_item;
  -- The parent is touched too: the order's version is what a POS screen holds, and
  -- a line edit that did not move it would let two screens both think they won.
  update public.orders set version = version + 1 where id = (v_order ->> 'id')::uuid;

  select jsonb_set(to_jsonb(i), '{unit_price}', to_jsonb(i.unit_price::text))
    into v_after from public.order_items i where i.id = p_item;

  perform app.audit('order_item_updated', 'order_item', p_item,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_before := jsonb_build_object('quantity', v_line -> 'quantity',
      'specialInstructions', v_line -> 'special_instructions',
      'unitPrice', v_line -> 'unit_price'),
    p_after := jsonb_build_object('quantity', v_after -> 'quantity',
      'specialInstructions', v_after -> 'special_instructions',
      'unitPrice', v_after -> 'unit_price'));
  return v_after;
end;
$$;

-- ------------------------------------------------------------------ void_order_item
--
-- Why VOID and not DELETE, in the sentence that stops the next engineer from
-- "simplifying" it: a voided line stays in history — the kitchen did make (or not
-- make) that dish, the ticket was printed, the audit says who killed it and why —
-- and 017's totals simply exclude it. Deleting would make the order's own past a
-- lie every time a guest changes their mind mid-course.
create or replace function public.void_order_item(
  p_item uuid,
  p_reason text,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := app.require_session();
  v_line   jsonb;
  v_order  jsonb;
  v_after  jsonb;
  v_org    uuid;
  v_prop   uuid;
  v_out    uuid;
begin
  select to_jsonb(i), to_jsonb(o) into v_line, v_order
    from public.order_items i
    join public.orders o on o.id = i.order_id
   where i.id = p_item
   for update of o, i;
  perform app.require_valid(v_line is not null, 'NIVAAS_NOT_FOUND');
  v_org  := (v_order ->> 'organization_id')::uuid;
  v_prop := (v_order ->> 'property_id')::uuid;
  v_out  := (v_order ->> 'outlet_id')::uuid;
  perform app.require_tenant_visibility(v_org);
  -- order.edit, not order.void: voiding ONE LINE is a correction of the ticket;
  -- voiding the ORDER is the §53 capability and set_order_status holds it.
  perform app.require_permission('order.edit', v_org, v_prop, v_out);
  perform app.require_writable_outlet(v_out);
  perform app.require_valid(v_line ->> 'status' = 'ACTIVE', 'NIVAAS_IMMUTABLE_ORDER');
  perform app.require_valid(v_order ->> 'status' not in ('COMPLETED','CANCELLED','VOID'),
    'NIVAAS_IMMUTABLE_ORDER');
  perform app.require_reason(p_reason);
  perform app.require_version((v_line ->> 'version')::integer, p_expected_version);

  update public.order_items
     set status = 'VOIDED', voided_at = now(), version = version + 1
   where id = p_item;
  update public.orders set version = version + 1 where id = (v_order ->> 'id')::uuid;

  select jsonb_set(to_jsonb(i), '{unit_price}', to_jsonb(i.unit_price::text))
    into v_after from public.order_items i where i.id = p_item;

  perform app.audit('order_item_voided', 'order_item', p_item,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_before := jsonb_build_object('status', v_line -> 'status'),
    p_after := jsonb_build_object('status', v_after -> 'status',
      'voidedAt', v_after -> 'voided_at'),
    p_reason := p_reason);
  return v_after;
end;
$$;

-- ------------------------------------------------------------------ set_order_status
--
-- The single wall for §27's whole machine. The order of its questions IS the design:
-- vocabulary before the row (a stranger is not told which words are legal), the
-- TRANSITION before any permission test (an illegal move is illegal for every seat,
-- so the refusal never teaches anyone which capability would have unlocked it),
-- then the permission picked by the DESTINATION — cancel and void are their own
-- verbs, more sensitive than editing (§53), and both require the sentence (§48).
-- A terminal order needs no separate IMMUTABLE check: the machine has no outgoing
-- edges from COMPLETED/CANCELLED/VOID, so "immutable" and "no legal transition" are
-- the same fact stated once, in one place, with one token.
create or replace function public.set_order_status(
  p_order uuid,
  p_status text,
  p_reason text default null,
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
  v_action text;
begin
  perform app.require_valid(p_status in ('DRAFT','PLACED','CONFIRMED','PREPARING','READY',
    'SERVED','COMPLETED','CANCELLED','VOID'), 'NIVAAS_INVALID_STATUS');

  select to_jsonb(o) into v_before from public.orders o where o.id = p_order for update;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');
  v_org  := (v_before ->> 'organization_id')::uuid;
  v_prop := (v_before ->> 'property_id')::uuid;
  v_out  := (v_before ->> 'outlet_id')::uuid;
  perform app.require_tenant_visibility(v_org);

  -- The machine, BEFORE the capability ladder — see the door comment.
  perform app.require_order_transition(v_before ->> 'status', p_status);

  if p_status = 'CANCELLED' then
    perform app.require_permission('order.cancel', v_org, v_prop, v_out);
    perform app.require_reason(p_reason);
    v_action := 'order_cancelled';
  elsif p_status = 'VOID' then
    -- §53: void is the more sensitive verb of the two, and it carries its own key.
    perform app.require_permission('order.void', v_org, v_prop, v_out);
    perform app.require_reason(p_reason);
    v_action := 'order_voided';
  else
    perform app.require_permission('order.edit', v_org, v_prop, v_out);
    v_action := case p_status when 'COMPLETED' then 'order_completed'
                              else 'order_status_advanced' end;
  end if;
  perform app.require_writable_outlet(v_out);
  perform app.require_version((v_before ->> 'version')::integer, p_expected_version);

  update public.orders
     set status = p_status,
         version = version + 1,
         cancelled_at = case when p_status = 'CANCELLED' then now() else cancelled_at end,
         cancel_reason = case when p_status = 'CANCELLED' then p_reason else cancel_reason end,
         voided_at = case when p_status = 'VOID' then now() else voided_at end,
         void_reason = case when p_status = 'VOID' then p_reason else void_reason end,
         -- §27's completion timestamp. The SETTLEMENT that earns it is 017's bill;
         -- closed_at says the order stopped being operable, not that money moved.
         closed_at = case when p_status = 'COMPLETED' then now() else closed_at end
   where id = p_order;
  select to_jsonb(o) into v_after from public.orders o where o.id = p_order;

  perform app.audit(v_action, 'order', p_order,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_before := jsonb_build_object('status', v_before -> 'status',
                                   'version', v_before -> 'version'),
    p_after := jsonb_build_object('status', v_after -> 'status',
                                  'version', v_after -> 'version'),
    p_reason := case when p_status in ('CANCELLED','VOID') then p_reason else null end);
  return v_after;
end;
$$;

-- ------------------------------------------------------------------ move_order_table
--
-- §55, implemented as the single audited UPDATE it asks for. There is deliberately
-- NO table-history table: `before` carries the old cover's id AND code, `after`
-- carries the new one's, and the audit trail is the move ledger — dated, reasoned,
-- attributable, and impossible to perform by editing a row quietly. A live order
-- only (a completed one is history of the cover it actually sat on); DINE_IN only
-- (there is nothing to move on a takeaway); and the destination obeys the same
-- outlet and OUT_OF_SERVICE rules as seating in the first place.
create or replace function public.move_order_table(
  p_order uuid,
  p_table uuid,
  p_reason text,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid := app.require_session();
  v_before   jsonb;
  v_after    jsonb;
  v_org      uuid;
  v_prop     uuid;
  v_out      uuid;
  v_old_code text;
  v_new_code text;
begin
  select to_jsonb(o) into v_before from public.orders o where o.id = p_order for update;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');
  v_org  := (v_before ->> 'organization_id')::uuid;
  v_prop := (v_before ->> 'property_id')::uuid;
  v_out  := (v_before ->> 'outlet_id')::uuid;
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('order.edit', v_org, v_prop, v_out);
  perform app.require_writable_outlet(v_out);
  perform app.require_reason(p_reason);
  perform app.require_version((v_before ->> 'version')::integer, p_expected_version);

  perform app.require_valid(v_before ->> 'order_type' = 'DINE_IN',
    'NIVAAS_ORDER_NOT_DINE_IN');
  perform app.require_valid(v_before ->> 'status' not in ('COMPLETED','CANCELLED','VOID'),
    'NIVAAS_IMMUTABLE_ORDER');
  perform app.require_valid(
    exists (select 1 from public.restaurant_tables t
             where t.id = p_table and t.outlet_id = v_out and t.status <> 'ARCHIVED'),
    'NIVAAS_TABLE_NOT_IN_OUTLET');
  perform app.require_valid(
    not exists (select 1 from public.restaurant_tables t
                 where t.id = p_table and t.service_status = 'OUT_OF_SERVICE'),
    'NIVAAS_TABLE_OUT_OF_SERVICE');

  select t.code into v_old_code from public.restaurant_tables t
   where t.id = (v_before ->> 'table_id')::uuid;
  select t.code into v_new_code from public.restaurant_tables t where t.id = p_table;

  update public.orders set table_id = p_table, version = version + 1 where id = p_order;
  select to_jsonb(o) into v_after from public.orders o where o.id = p_order;

  perform app.audit('order_table_moved', 'order', p_order,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_before := jsonb_build_object('tableId', v_before -> 'table_id', 'tableCode', v_old_code),
    p_after := jsonb_build_object('tableId', p_table, 'tableCode', v_new_code),
    p_reason := p_reason);
  return v_after;
end;
$$;

-- ---------------------------------------------------------------------- order_detail
--
-- Justified the way 014 justifies menu_snapshot: a POS reprinting a ticket must not
-- reassemble it from three separate RLS round trips (order, lines, options) that can
-- each be filtered differently by a policy tweak — one door, one consistent read,
-- money out as TEXT. It shows VOIDED lines with their status (ticket reprints must
-- show what was cancelled — §28's history argument again), because hiding rows from
-- a printed document is the quiet version of rewriting it.
create or replace function public.order_detail(
  p_order uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := app.require_session();
  v_order  jsonb;
  v_items  jsonb;
  v_org    uuid;
  v_prop   uuid;
  v_out    uuid;
begin
  select to_jsonb(o) into v_order from public.orders o where o.id = p_order;
  perform app.require_valid(v_order is not null, 'NIVAAS_NOT_FOUND');
  v_org  := (v_order ->> 'organization_id')::uuid;
  v_prop := (v_order ->> 'property_id')::uuid;
  v_out  := (v_order ->> 'outlet_id')::uuid;
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('order.view', v_org, v_prop, v_out);

  select coalesce(jsonb_agg(item order by (item ->> 'line_sequence')::integer), '[]'::jsonb)
    into v_items
    from (
      select jsonb_set(to_jsonb(i), '{unit_price}', to_jsonb(i.unit_price::text))
             || jsonb_build_object('modifiers', coalesce((
                  select jsonb_agg(jsonb_set(to_jsonb(m), '{price_adjustment}',
                                    to_jsonb(m.price_adjustment::text))
                                   order by m.modifier_name_snapshot)
                    from public.order_item_modifiers m
                   where m.order_item_id = i.id), '[]'::jsonb)) as item
        from public.order_items i
       where i.order_id = p_order
    ) lines;

  return v_order || jsonb_build_object('items', v_items);
end;
$$;

-- ----------------------------------------------------------------------- open_orders
--
-- The POS open-orders screen: this outlet's live orders, each with its cover code,
-- its live line count and its lines as name/quantity/unit-price-as-TEXT. No totals
-- appear here and none can — 017's engine has not been born; the raw frozen line
-- prices are what cross the wire, as strings (contract §1), because "the POS must
-- not recompute money in TypeScript" is the same rule as "a view must not widen a
-- tenant's read". One door beats the three-way RLS round trip for the same reason
-- order_detail exists.
create or replace function public.open_orders(
  p_outlet uuid
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
  v_rows  jsonb;
begin
  select o.organization_id, o.property_id into v_org, v_prop
    from public.outlets o where o.id = p_outlet;
  perform app.require_valid(v_org is not null, 'NIVAAS_NOT_FOUND');
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('order.view', v_org, v_prop, p_outlet);

  select coalesce(jsonb_agg(ord order by ord ->> 'orderNumber'), '[]'::jsonb) into v_rows
    from (
      select jsonb_build_object(
        'id', o.id,
        'orderNumber', o.order_number,
        'orderType', o.order_type,
        'status', o.status,
        'businessDate', o.business_date,
        'tableId', o.table_id,
        'tableCode', t.code,
        'itemCount', (select count(*)::integer from public.order_items i
                       where i.order_id = o.id and i.status = 'ACTIVE'),
        'lines', (select coalesce(jsonb_agg(jsonb_build_object(
                        'name', i.item_name_snapshot,
                        'quantity', i.quantity,
                        'unitPrice', i.unit_price::text,
                        'currency', i.currency)
                      order by i.line_sequence), '[]'::jsonb)
                   from public.order_items i
                  where i.order_id = o.id and i.status = 'ACTIVE')
      ) as ord
        from public.orders o
        left join public.restaurant_tables t on t.id = o.table_id
       where o.outlet_id = p_outlet
         and o.status not in ('COMPLETED','CANCELLED','VOID')
    ) live_orders;

  return jsonb_build_object('outletId', p_outlet, 'orders', v_rows);
end;
$$;

-- ==================================================================== grants

-- Catalog-resolved (name only, signatures derived from pg_proc) so a future parameter
-- added to a door cannot desync an ACL list. A listed name with no function behind it
-- aborts the apply — the only allowed direction of drift is an intentional new door.
-- 015's loop mechanics verbatim, per the file contract. `archive_restaurant_table` is
-- in this file's list because this file redefines it (015's hook); granting again is
-- the idempotent no-op the loop is anyway.
do $$
declare
  v_name text;
  v_oid  oid;
  v_oids oid[];
begin
  foreach v_name in array array[
    'create_order', 'add_order_items', 'update_order_item', 'void_order_item',
    'set_order_status', 'move_order_table', 'order_detail', 'open_orders',
    'archive_restaurant_table'
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

-- ================================================================= self-check

-- The structural guarantees this file exists to provide, verified from the catalog
-- rather than asserted in prose. A half-applied 016 must fail the apply the way
-- 006, 012, 014 and 015 do.
do $$
declare
  v_def    text;
  v_count  integer;
begin
  -- The §4/§6/§54 walls are real indexes, not door conventions.
  perform app.require_valid(
    exists (select 1 from pg_class where relname = 'orders_number_idx')
    and exists (select 1 from pg_class where relname = 'orders_idempotency_scoped')
    and exists (select 1 from pg_class where relname = 'orders_live_table_idx')
    and exists (select 1 from pg_class where relname = 'document_counters_scope_idx')
    and exists (select 1 from pg_class where relname = 'order_items_live_sequence_idx'),
    'NIVAAS_MIGRATION_GAP');

  -- All three chain guards and all three touch triggers are attached (counted, so a
  -- trigger dropped by a re-apply is caught, not merely missing from a list).
  perform app.require_valid(
    (select count(distinct tgname) from pg_trigger
      where tgname in ('orders_chain','order_items_chain','order_item_modifiers_chain')) = 3,
    'NIVAAS_MIGRATION_GAP');
  perform app.require_valid(
    (select count(distinct tgname) from pg_trigger
      where tgname in ('orders_touch','order_items_touch','order_item_modifiers_touch')) = 3,
    'NIVAAS_MIGRATION_GAP');

  -- The counter-forgery cut, read back: RLS ON and ZERO policies — a table the client
  -- role cannot read a row of, whatever any future default grant decides — and the
  -- wall is the table's own relrowsecurity bit, not a comment claiming it.
  perform app.require_valid(
    (select relrowsecurity from pg_class
      where relname = 'document_counters' and relnamespace = 'public'::regnamespace)
    and (select count(*) from pg_policies
          where tablename = 'document_counters'
            and schemaname = 'public') = 0,
    'NIVAAS_MIGRATION_GAP');

  -- §7: the transition machine exists where no client can call it. Present in `app`,
  -- absent from `public` — if a future migration "promotes" it to the served schema,
  -- the apply stops here, because a published transition rule is one a client can
  -- shop for.
  perform app.require_valid(
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'app' and p.proname = 'rest_order_transition_allowed')
    and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'rest_order_transition_allowed'),
    'NIVAAS_MIGRATION_GAP');

  -- §27's nine states, read out of the live constraint (the same anti-corruption
  -- reading 015 does to its service_status): all nine words present, and the CHECK
  -- holds EXACTLY nine quoted words, no tenth.
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public' and t.relname = 'orders' and c.conname = 'orders_status_ok';
  perform app.require_valid(
    v_def is not null
    and v_def like '%DRAFT%' and v_def like '%PLACED%' and v_def like '%CONFIRMED%'
    and v_def like '%PREPARING%' and v_def like '%READY%' and v_def like '%SERVED%'
    and v_def like '%COMPLETED%' and v_def like '%CANCELLED%' and v_def like '%VOID%'
    and (select count(*) from regexp_matches(v_def, '''[A-Z_]+''', 'g')) = 9,
    'NIVAAS_MIGRATION_GAP');

  -- Decision A, verified rather than promised: 017 owns every total, so none of the
  -- three spine tables may carry one — a half-built engine column shipping here is
  -- how a POS total and a bill total start disagreeing.
  perform app.require_valid(
    not exists (select 1 from information_schema.columns
                 where table_schema = 'public'
                   and table_name in ('orders','order_items','order_item_modifiers')
                   and column_name in ('subtotal','discount_amount','tax_amount',
                     'service_charge_amount','rounding_amount','grand_total','line_total')),
    'NIVAAS_MIGRATION_GAP');

  -- Money doctrine on the only money this file stores: unconstrained numeric, never
  -- numeric(p,s) (014's lesson — assert the wall exists, do not trust the intent).
  perform app.require_valid(
    not exists (select 1 from pg_attribute a join pg_class c on c.oid = a.attrelid
                 where c.relnamespace = 'public'::regnamespace
                   and ((c.relname = 'order_items' and a.attname = 'unit_price')
                     or (c.relname = 'order_item_modifiers' and a.attname = 'price_adjustment'))
                   and (a.atttypid <> 'numeric'::regtype or a.atttypmod <> -1)),
    'NIVAAS_MIGRATION_GAP');

  -- §20's derived half landed: the view exists, as a view, with security_invoker —
  -- the option itself is checked, not just its result, because a plain view here
  -- would run as the owner and WOULD widen every tenant's read of the floor.
  perform app.require_valid(
    (select relkind from pg_class
      where relname = 'restaurant_table_status'
        and relnamespace = 'public'::regnamespace) = 'v'
    and exists (select 1 from pg_class
                 where relname = 'restaurant_table_status'
                   and relnamespace = 'public'::regnamespace
                   and 'security_invoker=true' = any(reloptions)),
    'NIVAAS_MIGRATION_GAP');
end;
$$;
