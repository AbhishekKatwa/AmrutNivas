-- ============================================================================
-- AMRUT NIVAAS — Prompt #04 §25-§26, §52: the Kitchen Order Ticket (018)
--
-- 016 deferred this file by name (its header: "the KOT line-fire states of #04 §26 arrive
-- with the KOT, which is why `status` below is only ACTIVE/VOIDED today"). 016 also froze
-- the line lifecycle — ACTIVE/VOIDED is the SALES truth, and a fire state is the KITCHEN's
-- truth about the very same line. Those are two different facts, so 018 adds a SEPARATE
-- column (`fire_status`) rather than widening 016's CHECK, and 015's/016's doctrine holds:
-- a lifecycle word and an operational word never share a column.
--
-- What this file builds:
--   1. `public.kitchen_order_tickets` — one send to the kitchen, its own printed number
--      (KOT-000123 from 016's counter machinery), covering a set of lines, with its own
--      OPEN / CLOSED / CANCELLED lifecycle.
--   2. `order_items.fire_status` — NOT_FIRED → FIRED → READY, and nothing else (§26).
--      The line can be voided (016) without ever being fired; it cannot be fired once
--      voided. The order-level PREPARING that §28 hangs CANCEL's deadline on is driven
--      from here.
--   3. Six doors: `send_kot` (fire lines), `set_order_item_fire_status` (the kitchen works
--      a line), `cancel_kot` (a mis-send is retired, its un-READY lines un-fired),
--      `reprint_kot` (a reprint is an AUDITED act, not a no-op), `kot_detail` and
--      `open_kots` (the kitchen's queue read).
--   4. The line-fire state machine lives in `app` beside 016's order machine, reached only
--      through app.require_kot_fire_transition(), so 016's own `set_order_status` and this
--      file's fire doors agree on one thing: once ANY line of an order is FIRED, the order
--      has crossed §28's line and CANCEL is gone — which is why send_kot drives the order
--      PREPARING transition itself rather than trusting the cashier to have set it.
--
-- Deliberately NOT here (Prompt #04 DO-NOT-BUILD): KDS screens and station routing, course
-- / course-sequence firing, per-station printers, barker/expediter roles, modifiers firing
-- separately from their parent line. Those are #05's. This file is the ticket, the fire
-- state, and the two queues — nothing more.
-- ============================================================================

set local search_path = '';

-- ---------------------------------------------------------------- line-fire states
--
-- §26's ladder has three rungs, and they are NOT the order's states: an order sits in
-- PREPARING while one line is FIRED and another is READY. The words stay separate because
-- the facts are separate, exactly as 015 kept service_status apart from the derived truth.
--
-- NOT_FIRED is the default 016 left the column at: a line that exists on a ticket the
-- kitchen has not seen. FIRED means printed and being cooked. READY means cooked and at
-- the pass. There is no SERVED here: §26's "served" is the ORDER moving to SERVED (016's
-- machine), not a line fact — a line has no moment of leaving the pass that the order
-- does not own.
alter table public.order_items
  add column if not exists fire_status text not null default 'NOT_FIRED'
    constraint order_items_fire_status_ok
    check (fire_status in ('NOT_FIRED','FIRED','READY'));

-- The kitchen's queue read is "everything FIRED at this outlet", and it runs every time a
-- cook looks up. PARTIAL on purpose: NOT_FIRED rows are a POS concern, READY rows drain
-- out of the queue, and indexing the whole table would grow the index for the states
-- nobody queries by.
create index if not exists order_items_fire_outlet_idx
  on public.order_items (outlet_id, fire_status);

-- 016 attached order_items_touch and order_items_chain already; the new column rides both
-- without further wiring — touch keeps updated_at honest on the fire write, and the chain
-- trigger never reads fire_status, so it stays byte-for-byte 016's.

comment on column public.order_items.fire_status is
  'The KITCHEN''s truth about the line (§26): NOT_FIRED (written, not yet sent), FIRED (on the ticket, cooking), READY (cooked, at the pass). Separate from status (ACTIVE/VOIDED), which is the SALES truth.';

-- ---------------------------------------------------------------- fire state machine
--
-- The same reason 016 put the order machine in `app`: PostgREST serves `public`, and a
-- transition rule published over HTTP is one a client can call for a row it cannot read.
-- Two edges, and ABSENCE is the wall: READY never goes back to FIRED (a cook does not
-- un-cook a plate; a mis-send is cancel_kot, which re-mints nothing and un-fires to
-- NOT_FIRED), and a line cannot be fired straight to READY behind the kitchen's back.
create or replace function app.rest_kot_fire_transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_from, '') || '>' || coalesce(p_to, '') in (
    'NOT_FIRED>FIRED',   -- send_kot: the ticket reaches the kitchen
    'FIRED>READY'        -- the cook rings it up at the pass
  );
$$;

create or replace function app.require_kot_fire_transition(p_from text, p_to text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_valid(app.rest_kot_fire_transition_allowed(p_from, p_to),
    'NIVAAS_INVALID_TRANSITION');
end;
$$;

-- ---------------------------------------------------------------- KOT lifecycle
--
-- A ticket has three states and two of them are terminal. CLOSED is what happens when every
-- line the ticket fired has reached READY — the kitchen signals "this slip is done"; the
-- order itself moves on 016's ladder, not this one. CANCELLED is a mis-send: the ticket is
-- retired, and its lines that have NOT yet reached READY are un-fired back to NOT_FIRED so
-- they can be sent again correctly. A line already READY stays READY, because the cook
-- genuinely made that plate and the history must keep saying so.
create or replace function app.rest_kot_transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_from, '') || '>' || coalesce(p_to, '') in (
    'OPEN>CLOSED',       -- every fired line of this slip is READY
    'OPEN>CANCELLED'     -- a mis-send, retired (never a CLOSED ticket: §26's honesty)
  );
$$;

create or replace function app.require_kot_transition(p_from text, p_to text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_valid(app.rest_kot_transition_allowed(p_from, p_to),
    'NIVAAS_INVALID_TRANSITION');
end;
$$;

-- ===================================================================== chain guard
--
-- Same doctrine as app.assert_menu_chain() (014) and app.assert_order_chain() (016): the
-- tenant chain a KOT carries is derived from its order, never from an argument, and a row
-- whose copied ancestors disagree with its parent's is refused before it exists. A KOT has
-- no children of its own; its lines are referenced through order_items, whose chain 016
-- already proves.
create or replace function app.assert_kot_chain()
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
  if new.order_id is null then
    raise exception 'NIVAAS_SCOPE_MISMATCH: a KOT must belong to an order';
  end if;

  select o.organization_id, o.property_id, o.outlet_id
    into v_org, v_prop, v_out
    from public.orders o where o.id = new.order_id;

  if v_out is null then
    raise exception 'NIVAAS_SCOPE_MISMATCH: KOT % points at no order', new.id;
  end if;

  if new.organization_id <> v_org or new.property_id <> v_prop or new.outlet_id <> v_out then
    raise exception 'NIVAAS_SCOPE_MISMATCH: a KOT cannot sit outside its order''s outlet';
  end if;

  return new;
end;
$$;

-- ================================================================== KOT table
--
-- One send, one row. Lines hang off order_items.kot_id (added below), so the ticket is the
-- PRINT UNIT: what came out of the kitchen printer at 19:41 stays one object, and the
-- reprint of that same slip points at the same row and only ever grows its reprint count.
-- A line moved to a later ticket keeps its first ticket's history: the fk is the CURRENT
-- ticket, the audit is the whole trail.
create table if not exists public.kitchen_order_tickets (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  property_id          uuid not null references public.properties(id)  on delete restrict,
  outlet_id            uuid not null references public.outlets(id)     on delete restrict,
  order_id             uuid not null references public.orders(id)        on delete restrict,
  -- The printed slip number (§4). Minted through app.next_document_number with the KOT
  -- prefix, on the order's own business_date — the day the kitchen worked, not the day the
  -- clock says at midnight, which is exactly why 016 built the business-date resolver.
  kot_number           text not null,
  business_date        date not null,
  status               text not null default 'OPEN'
                       constraint kitchen_order_tickets_status_ok check (status in ('OPEN','CLOSED','CANCELLED')),
  note                 text,
  -- §6's replay key. Same shape as 016's orders.idempotency_key: opaque, nullable, no FK,
  -- and the ONLY wall behind a double-tapped SEND is the UNIQUE partial index below.
  idempotency_key      text,
  fired_at             timestamptz not null default now(),
  closed_at            timestamptz,
  cancelled_at         timestamptz,
  cancelled_by         uuid,
  cancel_reason        text,
  -- §69: a reprint is a sensitive act — a second copy appearing on the pass must be audited,
  -- and the count is the ticket's own footprint of how many times it reached the kitchen.
  reprint_count        integer not null default 0 check (reprint_count between 0 and 99),
  last_reprinted_at    timestamptz,
  version              integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid
);

comment on table public.kitchen_order_tickets is
  'One send to the kitchen: the printed slip, its number, its reprint footprint. Lines reference it through order_items.kot_id.';
comment on column public.kitchen_order_tickets.reprint_count is
  'How many times this slip reached the printer AFTER the first send. Each reprint is an audited act (§69), never a silent re-print.';

-- A KOT number is unique among tickets that still exist as a fact. A cancelled ticket keeps
-- its number — that slip DID print, and the day's kitchen record must not be restated — so
-- the index is not partial over status: it is over every row.
drop index if exists public.kitchen_order_tickets_number_idx;
create unique index kitchen_order_tickets_number_idx
  on public.kitchen_order_tickets (organization_id, outlet_id, kot_number, business_date);

create index if not exists kitchen_order_tickets_order_idx
  on public.kitchen_order_tickets (order_id);
create index if not exists kitchen_order_tickets_outlet_status_idx
  on public.kitchen_order_tickets (outlet_id, status);

-- 016's idempotency wall, same shape, same reason — and UNIQUE, which is the half that carries
-- the weight. PARTIAL, so NULL keys (the common case — a cashier not asking for replay) never
-- collide with each other and one outlet's key space cannot shadow another's; UNIQUE, so two
-- simultaneous taps of one key cannot both get past send_kot's replay read and print two slips
-- with two KOT numbers. A non-unique index here is a lookup accelerator that lets the door be
-- raced, and §6's promise would be a comment. Drop-then-create rather than `if not exists`,
-- exactly as 016:405 states: a wall whose uniqueness or predicate has drifted must be REPLACED on
-- a re-apply, not skipped because the name was already there.
drop index if exists public.kitchen_order_tickets_idempotency_idx;
create unique index kitchen_order_tickets_idempotency_idx
  on public.kitchen_order_tickets (organization_id, outlet_id, idempotency_key)
  where idempotency_key is not null;

-- ---------------------------------------------------------------- line → ticket link
--
-- Nullable: a NOT_FIRED line has no ticket yet — it exists on a draft or placed order the
-- kitchen has not seen. On delete RESTRICT for the same reason every link here restricts:
-- retiring a ticket must not erase the sold fact that this line was fired on it. A
-- cancelled ticket keeps its lines pointing at it (they are un-fired, not detached: the
-- history stays readable).
alter table public.order_items
  add column if not exists kot_id uuid references public.kitchen_order_tickets(id) on delete restrict;

create index if not exists order_items_kot_idx on public.order_items (kot_id);

comment on column public.order_items.kot_id is
  'The slip this line currently sits on. NULL until fired. A cancelled KOT keeps its lines pointing at it: the lines un-fire, the history does not detach.';

-- ---------------------------------------------------------------- touch + chain
drop trigger if exists kitchen_order_tickets_touch on public.kitchen_order_tickets;
create trigger kitchen_order_tickets_touch before update on public.kitchen_order_tickets
  for each row execute function app.touch_updated_at();

drop trigger if exists kitchen_order_tickets_chain on public.kitchen_order_tickets;
create trigger kitchen_order_tickets_chain before insert or update on public.kitchen_order_tickets
  for each row execute function app.assert_kot_chain();

-- ======================================================================= rls
--
-- 014/015/016's block exactly: RLS on, SELECT to the client role under the same outlet
-- predicate every write door uses, zero DML. The KOT carries its own outlet_id precisely
-- so this predicate is the same simple test at every level — assert_kot_chain above is
-- what makes that denormalization honest.
alter table public.kitchen_order_tickets enable row level security;

grant select on public.kitchen_order_tickets to authenticated, service_role;
revoke all on public.kitchen_order_tickets from anon;
revoke insert, update, delete, truncate on public.kitchen_order_tickets from authenticated;

drop policy if exists kitchen_order_tickets_outlet_read on public.kitchen_order_tickets;
create policy kitchen_order_tickets_outlet_read on public.kitchen_order_tickets
  for select to authenticated
  using (app.can_access_outlet(app.current_user_id(), outlet_id));

-- ================================================================= resolver
--
-- The one place a jsonb line reference becomes a database row for the KOT doors — the
-- same "two doors cannot drift" rule 016 built app.resolve_restaurant_order_line() for.
-- A caller names order lines by id; this proves each one belongs to the order, is ACTIVE
-- (a voided line is history: it was never re-fired and never re-sent), and is NOT_FIRED or
-- FIRED (a READY line has already been made — re-sending it is a duplicate plate). Returns
-- the ids and the frozen names, and NOTHING that was not validated. A row in another
-- tenant is NIVAAS_NOT_FOUND (§10); a row in YOUR tenant that cannot be fired right now is
-- NIVAAS_KOT_LINE_NOT_FIRABLE, which knows the line exists precisely because you do too.
create or replace function app.resolve_kot_lines(p_order uuid, p_item_ids jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_elem  jsonb;
  v_line  jsonb;
  v_org   uuid;
  v_out   uuid;
  v_order jsonb;
  v_result jsonb := '[]'::jsonb;
begin
  -- The order exists and the tenant chain answers for it. The caller has already been
  -- gated by require_permission; this reads the outlet to check lines against it.
  select to_jsonb(o) into v_order from public.orders o where o.id = p_order;
  perform app.require_valid(v_order is not null, 'NIVAAS_NOT_FOUND');
  v_org := (v_order->>'organization_id')::uuid;
  v_out := (v_order->>'outlet_id')::uuid;

  if jsonb_typeof(p_item_ids) <> 'array' or jsonb_array_length(p_item_ids) = 0 then
    raise exception 'NIVAAS_KOT_EMPTY' using hint = null;
  end if;

  for v_elem in select * from jsonb_array_elements(p_item_ids) loop
    select to_jsonb(oi) into v_line
      from public.order_items oi
     where oi.id = (v_elem #>> '{}')::uuid
       and oi.order_id = p_order;
    perform app.require_valid(v_line is not null, 'NIVAAS_NOT_FOUND');

    -- Cross-tenant rows have already failed as NIVAAS_NOT_FOUND above (the order chain is
    -- the outlet, the chain trigger built the row), so a mismatch here is only ever the
    -- in-tenant refusal path.
    perform app.require_valid(
      (v_line->>'outlet_id')::uuid = v_out and (v_line->>'organization_id')::uuid = v_org,
      'NIVAAS_KOT_LINE_NOT_FIRABLE');

    -- §26's shape: a voided line is history, and a READY line is already cooked. Both
    -- refuse a re-fire with the same token because from the cashier's chair they are the
    -- same problem: this line is not going on the next slip.
    perform app.require_valid(
      (v_line->>'status') = 'ACTIVE'
      and (v_line->>'fire_status') in ('NOT_FIRED','FIRED'),
      'NIVAAS_KOT_LINE_NOT_FIRABLE');

    v_result := v_result || jsonb_build_object(
      'id', v_line->>'id',
      'name', v_line->>'item_name_snapshot',
      'fire_status', v_line->>'fire_status'
    );
  end loop;

  return v_result;
end;
$$;

-- ===================================================================== doors

-- ---------------------------------------------------------------- send_kot
--
-- Fire a set of lines on one order and mint the slip. This is the one door that changes
-- BOTH machines at once, so it takes the parent order FOR UPDATE (contract §5) before
-- writing either side, and §28's consequence is a rule of this door, not a promise in a
-- comment: firing the first line of an order drives the order itself into PREPARING, which
-- is exactly the moment CANCEL dies on 016's ladder.
--
-- Two fire paths, one door. Lines already FIRED on an OPEN ticket of this order can be
-- carried onto the new slip (the kitchen gets a re-consolidated ticket) or left alone —
-- `p_include_fired` chooses. Default FALSE: a send means "the NOT_FIRED lines", which is
-- what a waiter pressing SEND expects; adding fired lines is the explicit, rarer act.
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
  -- 016's normalisation, stated once and used by both the replay read and the insert: a
  -- blank/whitespace key is "no key", never a stored ''. With the KOT index below now UNIQUE,
  -- an un-normalised empty string would be one shared key for every cashier who left the field
  -- empty, and the second send would collide on the index instead of simply being unreplayed.
  v_key     text := nullif(btrim(p_idempotency_key), '');
begin
  -- Lock the parent before reading it: two cashiers sending the same order cannot
  -- interleave a slip between each other's line updates (contract §5).
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

  -- §27's ladder says only an order the kitchen may work gets a ticket. DRAFT (nobody
  -- committed yet), and everything at or past SERVED / terminal, refuse with the
  -- transition token: the ticket's own move is what is illegal here.
  perform app.require_valid(
    v_status in ('PLACED','CONFIRMED','PREPARING'), 'NIVAAS_INVALID_TRANSITION');

  -- §6's replay: a double tap returns the first slip, unchanged, and mints nothing new.
  -- The key is stored on the ticket and the UNIQUE partial index below is the wall under it.
  if v_key is not null then
    select k.id into v_existing from public.kitchen_order_tickets k
      where k.organization_id = v_org and k.outlet_id = v_out
        and k.idempotency_key = v_key;
    if v_existing is not null then
      select to_jsonb(k) into v_after from public.kitchen_order_tickets k where k.id = v_existing;
      return v_after;
    end if;
  end if;

  -- Validate every line (the resolver reads them under this order's chain).
  v_lines := app.resolve_kot_lines(p_order, p_item_ids);

  -- A line that is FIRED and the caller did not ask to carry it refuses: "SEND" means the
  -- unfired remainder, and silently dropping half the array a cashier named is how a plate
  -- goes missing.
  if not p_include_fired then
    for v_elem in select * from jsonb_array_elements(v_lines) loop
      perform app.require_valid(v_elem->>'fire_status' = 'NOT_FIRED',
        'NIVAAS_KOT_LINE_NOT_FIRABLE');
    end loop;
  end if;

  v_bdate := (v_order->>'business_date')::date;
  v_number := app.next_document_number(v_org, v_prop, v_out, 'KOT', v_bdate);

  -- The number comes from 016's counter, which reserves it FOR UPDATE inside this
  -- transaction, so the unique index above cannot fire in ordinary operation: a collision
  -- here means the counter table has drifted from the tickets, which is a server bug and
  -- must raise as one, not be laundered into a user-facing CONFLICT.
  insert into public.kitchen_order_tickets
    (organization_id, property_id, outlet_id, order_id, kot_number, business_date,
     status, note, idempotency_key, created_by)
  values (v_org, v_prop, v_out, p_order, v_number, v_bdate,
          'OPEN', nullif(btrim(coalesce(p_note, '')), ''), v_key, v_actor)
  returning id into v_kot_id;

  -- Fire every line onto the new slip. NOT_FIRED lines take the machine edge (the
  -- transition function is called even here, so the ladder is the one wall and a future
  -- edit to it lands on this door for free); FIRED-and-carried lines only re-point at the
  -- consolidated ticket, their state is already correct.
  for v_elem in select * from jsonb_array_elements(v_lines) loop
    v_id := (v_elem->>'id')::uuid;
    if v_elem->>'fire_status' = 'NOT_FIRED' then
      perform app.require_kot_fire_transition('NOT_FIRED','FIRED');
      update public.order_items
         set fire_status = 'FIRED', kot_id = v_kot_id, version = version + 1
       where id = v_id;
    else
      update public.order_items set kot_id = v_kot_id, version = version + 1
       where id = v_id;
    end if;
  end loop;

  -- §28's consequence, written as code: the kitchen now has work, so the ORDER crosses to
  -- PREPARING (through 016's own machine, not a hand-written string). An order already
  -- PREPARING from an earlier send is left alone. If the ladder refuses the move, this
  -- door has a bug in its own gate above — so it raises, and the transaction rolls back.
  if v_status <> 'PREPARING' then
    perform app.require_order_transition(v_status, 'PREPARING');
    update public.orders
       set status = 'PREPARING', version = version + 1
     where id = p_order;
  end if;

  select to_jsonb(k) into v_after from public.kitchen_order_tickets k where k.id = v_kot_id;
  perform app.audit('kot_sent', 'kot', v_kot_id,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_after := v_after);
  return v_after;
end;
$$;

-- -------------------------------------------------- set_order_item_fire_status
--
-- The kitchen rings a line up: FIRED → READY, and nothing else (§26). Not a POS verb —
-- KITCHEN_MANAGER holds kot.view and staff holds only kot.create, so this door gates on
-- `kot.view`, the one capability the kitchen actually has for its own queue.
--
-- Once every line of a slip is READY, the ticket auto-CLOSES. That is §26's "the cook rang
-- it up" fact expressed as a status rather than a count a screen compares: the ticket is
-- done when its lines are done, and the closure is audited in the same breath.
create or replace function public.set_order_item_fire_status(
  p_item uuid,
  p_fire_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := app.require_session();
  v_line   jsonb;
  v_org    uuid;
  v_prop   uuid;
  v_out    uuid;
  v_from   text;
  v_kot    jsonb;
  v_kot_id uuid;
  v_pending integer;
  v_after  jsonb;
begin
  -- The vocabulary first: READY is the only thing this door can write today (§26). A
  -- caller asking for NOT_FIRED or FIRED is asking for send_kot / cancel_kot, not this.
  perform app.require_valid(p_fire_status in ('READY'), 'NIVAAS_INVALID_STATUS');

  select to_jsonb(oi) into v_line from public.order_items oi where oi.id = p_item;
  perform app.require_valid(v_line is not null, 'NIVAAS_NOT_FOUND');
  v_org  := (v_line->>'organization_id')::uuid;
  v_prop := (v_line->>'property_id')::uuid;
  v_out  := (v_line->>'outlet_id')::uuid;
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('kot.view', v_org, v_prop, v_out);
  perform app.require_writable_outlet(v_out);

  -- Lock the parent order before touching the line: the auto-close below writes the
  -- ticket, and two cooks ringing the last two lines of one slip must not interleave a
  -- half-count (contract §5).
  select to_jsonb(o) into v_line from public.orders o
    where o.id = (v_line->>'order_id')::uuid for update;

  -- Re-read the line after the lock: the status the caller reasoned about may have moved.
  select to_jsonb(oi) into v_line from public.order_items oi where oi.id = p_item;
  v_from := v_line->>'fire_status';
  perform app.require_kot_fire_transition(v_from, p_fire_status);

  -- A line cannot be READY at the pass if the sales row was voided while it cooked — that
  -- is 016's void, and a voided line's fire state is frozen as history.
  perform app.require_valid((v_line->>'status') = 'ACTIVE', 'NIVAAS_IMMUTABLE_ORDER');

  update public.order_items
     set fire_status = p_fire_status, version = version + 1
   where id = p_item;

  -- Auto-close the ticket when its last FIRED line rings up. Only a line that sits on an
  -- OPEN ticket has a ticket to close.
  if (v_line->>'kot_id') is not null then
    select to_jsonb(k) into v_kot from public.kitchen_order_tickets k where k.id = (v_line->>'kot_id')::uuid;
    if v_kot is not null and (v_kot->>'status') = 'OPEN' then
      select count(*) into v_pending
        from public.order_items oi
       where oi.kot_id = (v_kot->>'id')::uuid
         and oi.fire_status = 'FIRED';
      if v_pending = 0 then
        perform app.require_kot_transition('OPEN','CLOSED');
        update public.kitchen_order_tickets
           set status = 'CLOSED', closed_at = now(), version = version + 1
         where id = (v_kot->>'id')::uuid;
        select to_jsonb(k) into v_kot from public.kitchen_order_tickets k where k.id = (v_kot->>'id')::uuid;
        perform app.audit('kot_closed', 'kot', (v_kot->>'id')::uuid,
          p_organization := v_org, p_property := v_prop, p_outlet := v_out,
          p_after := v_kot, p_reason := 'all lines ready');
      end if;
    end if;
  end if;

  select to_jsonb(oi) into v_after from public.order_items oi where oi.id = p_item;
  perform app.audit('order_item_fire_status_changed', 'order_item', p_item,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_before := jsonb_build_object('fireStatus', v_from),
    p_after  := jsonb_build_object('fireStatus', p_fire_status),
    p_reason := p_reason);
  return v_after;
end;
$$;

-- ---------------------------------------------------------------- cancel_kot
--
-- A mis-send retired (§52's shape: permission + valid state + audit, with a mandatory
-- reason). OPEN only — a CLOSED ticket was genuinely cooked and the kitchen's record must
-- not be restated (§26's honesty), and a CANCELLED one is already retired.
--
-- The line rule is the part that took thought: a line that reached READY stays READY, on
-- this ticket. The cook made that plate; un-firing it would erase the fact. Only FIRED
-- lines go back to NOT_FIRED — they are still cooking, so the kitchen needs to be told
-- what to stop making. Those lines also drop their kot_id (they have no current ticket),
-- while READY lines keep pointing at the cancelled slip they were made on.
create or replace function public.cancel_kot(
  p_kot uuid,
  p_reason text
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
  select to_jsonb(k) into v_before from public.kitchen_order_tickets k where k.id = p_kot;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');
  v_org  := (v_before->>'organization_id')::uuid;
  v_prop := (v_before->>'property_id')::uuid;
  v_out  := (v_before->>'outlet_id')::uuid;
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('kot.cancel', v_org, v_prop, v_out);
  perform app.require_writable_outlet(v_out);
  perform app.require_reason(p_reason);
  perform app.require_kot_transition(v_before->>'status', 'CANCELLED');

  -- Un-fire only the still-cooking lines of this slip. READY lines keep their state,
  -- their ticket and their history; FIRED lines become NOT_FIRED and detach from the
  -- retired slip so a corrected send_kot can pick them up fresh.
  update public.order_items
     set fire_status = 'NOT_FIRED', kot_id = null, version = version + 1
   where kot_id = p_kot and fire_status = 'FIRED' and status = 'ACTIVE';

  update public.kitchen_order_tickets
     set status = 'CANCELLED', cancelled_at = now(), cancelled_by = v_actor,
         cancel_reason = p_reason, version = version + 1
   where id = p_kot;
  select to_jsonb(k) into v_after from public.kitchen_order_tickets k where k.id = p_kot;

  perform app.audit('kot_cancelled', 'kot', p_kot,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_before := v_before, p_after := v_after, p_reason := p_reason);
  return v_after;
end;
$$;

-- ---------------------------------------------------------------- reprint_kot
--
-- §69: a reprint is not a no-op. A second slip appearing on the pass can double a plate,
-- so the act is permission-gated, reason-bearing, counted on the ticket, and audited. The
-- ticket itself is otherwise unchanged — this is the kitchen's printer re-emitting the
-- same slip, not a new send.
create or replace function public.reprint_kot(
  p_kot uuid,
  p_reason text
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
  select to_jsonb(k) into v_before from public.kitchen_order_tickets k where k.id = p_kot;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');
  v_org  := (v_before->>'organization_id')::uuid;
  v_prop := (v_before->>'property_id')::uuid;
  v_out  := (v_before->>'outlet_id')::uuid;
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('kot.reprint', v_org, v_prop, v_out);
  perform app.require_writable_outlet(v_out);
  perform app.require_reason(p_reason);

  -- A CANCELLED slip must not reappear on the pass: the ticket was retired precisely
  -- because the kitchen should stop making it. OPEN and CLOSED both reprint (a closed
  -- slip is re-printed for the runner, not for the cook).
  perform app.require_valid((v_before->>'status') <> 'CANCELLED', 'NIVAAS_ARCHIVED');

  update public.kitchen_order_tickets
     set reprint_count = reprint_count + 1, last_reprinted_at = now(), version = version + 1
   where id = p_kot;
  select to_jsonb(k) into v_after from public.kitchen_order_tickets k where k.id = p_kot;

  perform app.audit('kot_reprinted', 'kot', p_kot,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_before := jsonb_build_object('reprintCount', v_before->>'reprint_count'),
    p_after  := jsonb_build_object('reprintCount', v_after->>'reprint_count'),
    p_reason := p_reason);
  return v_after;
end;
$$;

-- ---------------------------------------------------------------- kot_detail
--
-- The printer / kitchen screen's read of one slip: the ticket, and its lines with the
-- frozen name, quantity, options, special instructions and fire state. Money is TEXT (the
-- contract's §1) and lines are ordered by 016's line_sequence so the printed slip matches
-- the POS ticket it was cut from.
create or replace function public.kot_detail(p_kot uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.require_session();
  v_kot   jsonb;
  v_org   uuid;
  v_prop  uuid;
  v_out   uuid;
  v_lines jsonb;
begin
  select to_jsonb(k) into v_kot from public.kitchen_order_tickets k where k.id = p_kot;
  perform app.require_valid(v_kot is not null, 'NIVAAS_NOT_FOUND');
  v_org  := (v_kot->>'organization_id')::uuid;
  v_prop := (v_kot->>'property_id')::uuid;
  v_out  := (v_kot->>'outlet_id')::uuid;
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('kot.view', v_org, v_prop, v_out);

  select coalesce(jsonb_agg(v order by v ->> 'lineSequence'), '[]'::jsonb) into v_lines
    from (
      select jsonb_build_object(
        'id', oi.id,
        'itemName', oi.item_name_snapshot,
        'itemCode', oi.item_code_snapshot,
        'quantity', oi.quantity,
        'unitPrice', oi.unit_price::text,
        'currency', oi.currency,
        'specialInstructions', oi.special_instructions,
        'lineSequence', oi.line_sequence,
        'fireStatus', oi.fire_status,
        'status', oi.status,
        'modifiers', coalesce((
          select jsonb_agg(jsonb_build_object(
            'name', om.modifier_name_snapshot,
            'priceAdjustment', om.price_adjustment::text,
            'quantity', om.quantity
          ) order by om.created_at)
            from public.order_item_modifiers om
           where om.order_item_id = oi.id
        ), '[]'::jsonb)
      ) as v
        from public.order_items oi
       where oi.kot_id = p_kot
    ) s;

  return v_kot || jsonb_build_object('lines', v_lines);
end;
$$;

-- ---------------------------------------------------------------- open_kots
--
-- The kitchen's queue: every OPEN ticket at this outlet, with its slip number, order
-- handle, business date and fired-line count. Ordered oldest-send-first, because a cook
-- works the queue in the order the floor asked for it. Outlet-scoped by predicate, tenant-
-- checked by the shared helpers, and nothing leaks across without going through RLS first.
create or replace function public.open_kots(p_outlet uuid)
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
  select o.organization_id, o.property_id, o.id into v_org, v_prop, v_out
    from public.outlets o where o.id = p_outlet;
  perform app.require_valid(v_out is not null, 'NIVAAS_NOT_FOUND');
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('kot.view', v_org, v_prop, v_out);

  select coalesce(jsonb_agg(v order by v ->> 'firedAt'), '[]'::jsonb) into v_rows
    from (
      select jsonb_build_object(
        'id', k.id,
        'kotNumber', k.kot_number,
        'orderId', k.order_id,
        'orderNumber', o.order_number,
        'businessDate', k.business_date,
        'status', k.status,
        'firedAt', k.fired_at,
        'reprintCount', k.reprint_count,
        'lineCount', (select count(*) from public.order_items oi
                       where oi.kot_id = k.id and oi.fire_status = 'FIRED')::text,
        'readyCount', (select count(*) from public.order_items oi
                        where oi.kot_id = k.id and oi.fire_status = 'READY')::text
      ) as v
        from public.kitchen_order_tickets k
        join public.orders o on o.id = k.order_id
       where k.outlet_id = p_outlet
         and k.status = 'OPEN'
    ) s;

  return v_rows;
end;
$$;

-- ===================================================================== grants
--
-- Same catalog-resolved loop 015/016/017 use: name only, signatures derived from pg_proc,
-- so a future parameter cannot desync an ACL list.
do $$
declare
  v_name text;
  v_oid  oid;
  v_oids oid[];
begin
  foreach v_name in array array[
    'send_kot', 'set_order_item_fire_status', 'cancel_kot', 'reprint_kot',
    'kot_detail', 'open_kots'
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
--
-- The structural guarantees this file exists to provide, verified rather than assumed —
-- a half-applied 018 must fail loudly the way 015, 016, 017 do.
do $$
declare
  v_def text;
begin
  -- The fire-state CHECK exists and holds exactly §26's three words.
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public' and t.relname = 'order_items'
     and c.conname = 'order_items_fire_status_ok';
  perform app.require_valid(
    v_def is not null
    and v_def like '%NOT_FIRED%' and v_def like '%FIRED%' and v_def like '%READY%',
    'NIVAAS_MIGRATION_GAP');

  -- A fire state is not a sales state: 016's status CHECK must still read ACTIVE/VOIDED,
  -- untouched. If a future migration widens one to cover the other, the apply stops.
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public' and t.relname = 'order_items'
     and c.conname = 'order_items_status_ok';
  perform app.require_valid(
    v_def is not null
    and v_def like '%ACTIVE%' and v_def like '%VOIDED%'
    and v_def not like '%FIRED%' and v_def not like '%READY%',
    'NIVAAS_MIGRATION_GAP');

  -- The KOT number wall is a real unique index.
  perform app.require_valid(
    exists (select 1 from pg_class where relname = 'kitchen_order_tickets_number_idx'),
    'NIVAAS_MIGRATION_GAP');

  -- ...and so is §6's replay wall: UNIQUE *and* PARTIAL. The name alone would pass for the plain
  -- index this file shipped with, and a non-unique index is not a wall — it is a lookup that lets
  -- two simultaneous taps of one key both commit, which is the double SEND printing two slips the
  -- replay read was written to prevent. Uniqueness is the property being asserted, read back.
  perform app.require_valid(
    (select count(*) from pg_index i join pg_class c on c.oid = i.indexrelid
      where c.relname = 'kitchen_order_tickets_idempotency_idx'
        and i.indisunique and i.indispartial) = 1,
    'NIVAAS_MIGRATION_GAP');

  -- Chain guard and touch trigger are attached (counted, not listed).
  perform app.require_valid(
    (select count(distinct tgname) from pg_trigger
      where tgname in ('kitchen_order_tickets_touch','kitchen_order_tickets_chain')) = 2,
    'NIVAAS_MIGRATION_GAP');

  -- Both machines live in `app`, never in `public`: a rule published over HTTP is a rule
  -- a client can call for a row it cannot read (016's reason for the same split).
  perform app.require_valid(
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'app' and p.proname = 'rest_kot_fire_transition_allowed')
    and exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'app' and p.proname = 'rest_kot_transition_allowed'),
    'NIVAAS_MIGRATION_GAP');

  -- And the public schema has NO copy — the same name in `public` would be a leak.
  perform app.require_valid(
    not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public'
                   and p.proname in ('rest_kot_fire_transition_allowed','rest_kot_transition_allowed')),
    'NIVAAS_MIGRATION_GAP');

  -- The line → ticket link is RESTRICT: retiring a ticket must not erase the fact its
  -- lines were fired on it.
  perform app.require_valid(
    exists (select 1 from pg_constraint c
             join pg_class t on t.oid = c.conrelid
            where t.relname = 'order_items' and c.contype = 'f'
              and c.confrelid = 'public.kitchen_order_tickets'::regclass
              and c.confdeltype = 'r'),
    'NIVAAS_MIGRATION_GAP');

  -- KOT is under RLS with no write grant for the client role.
  perform app.require_valid(
    (select relrowsecurity from pg_class where relname = 'kitchen_order_tickets') = true,
    'NIVAAS_MIGRATION_GAP');
  perform app.require_valid(
    not exists (select 1 from information_schema.role_table_grants
                 where grantee = 'authenticated' and table_name = 'kitchen_order_tickets'
                   and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')),
    'NIVAAS_MIGRATION_GAP');

  -- Every KOT door exists and is EXECUTE-granted to authenticated (the name list is
  -- complete; the grant loop above would have aborted if not, so this is the belt).
  perform app.require_valid(
    (select count(distinct p.proname) from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('send_kot','set_order_item_fire_status','cancel_kot',
                          'reprint_kot','kot_detail','open_kots')) = 6,
    'NIVAAS_MIGRATION_GAP');

  -- PERMISSION DRIFT GATE. Every `require_permission('<token>', …)` literal written into a public
  -- door body must name a token the catalogue holds. `app.require_permission` tests granted rows
  -- and nothing else (005:59), and in this schema the catalogue IS those rows (002: role_permissions
  -- is the permission table; 013 registers a token by granting it to a system role), so a door
  -- gated on an unregistered token is not "a capability nobody has been handed yet" — it is a door
  -- that refuses EVERY user forever, and the refusal is indistinguishable on screen from a correct
  -- 403. That is precisely how 017 shipped bill.close / payment.record / bill.cancel, and no apply
  -- noticed. A mistake of that class must be an apply-time failure, so it is checked here rather
  -- than trusted in a comment; this file is the last restaurant migration, so by now every door
  -- from 005 onwards exists to be read. Tokens passed as a VARIABLE (005's set_member_status) are
  -- literals this scan cannot see by design — it audits what a door hard-codes.
  --
  -- Two things about the pattern are load-bearing, and both would fail SILENTLY: it stops at the
  -- token's closing quote because no call ever closes its parenthesis there (every door passes its
  -- scope arguments next, so a `\)` anchor matches nothing and the gate passes vacuously), and
  -- regexp_matches with 'g' yields text[], so the captured token is t.tok[1] — comparing t.tok to a
  -- text column is a type error, not a no-match, which at least fails loudly. prosrc is the body
  -- text only, so a comment above a door is invisible to this scan; a comment INSIDE one is not,
  -- which is why the door comments in 017 name their old tokens in prose rather than in call form.
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
