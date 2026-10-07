-- =============================================================================
-- 019 — the outlet's trading day, in ONE read (Prompt #04 §52; contract §1, §2, §12)
--
-- Phase 1's exit gate is a sentence with three figures in it: "the printed bill, the
-- Z-report and the outlet revenue figure agreeing". Two of those three are a day's money,
-- which is why this file exists as a door rather than as six counts inside a component:
-- §2 puts every number a sale becomes in one server-side engine, and a day total keyed in
-- TypeScript would be a SECOND engine — the exact divergence the contract refuses, on the
-- one figure a manager signs off. So Postgres does the summing, in `numeric`, exactly.
--
-- What the read answers, and what it deliberately does not:
--
--   - The day is the OUTLET's business date, not the clock's. `app.rest_outlet_business_date`
--     (016) is the same resolver `create_order`, `open_bill` and `record_payment` stamp rows
--     with, so a ticket booked at 00:40 belongs to the night it was served on and appears in
--     exactly one day's figures. A screen that filtered on `created_at::date` would split a
--     late service across two days.
--   - Money is grouped BY CURRENCY and never added across one. 014 pins an outlet's menu to a
--     single currency, so today every array below holds one row; the day two are ever in play,
--     the figures stay honest instead of becoming a meaningless sum. Every amount leaves as
--     `::text` for §1's reason — a `numeric` that reaches JavaScript as a float is how ₹280.50
--     becomes 280.49999999999997 on the way to a manager's screen.
--   - `collected` is the money the counter actually took: SUCCESSFUL payments for the date.
--     `outstanding` is what the frozen documents still believe is due. Today `bills.amount_paid`
--     is kept in step with the payments by `record_payment`, so the two views agree; they are
--     stated apart anyway, because the day a refund door (017 has none yet) lands, they
--     legitimately must not be averaged into one figure.
--   - Counts are counts. `tickets.live` is what is open RIGHT NOW across any date; `tickets.today`
--     and `byStatus` are what was BOOKED on this business date. A late ticket from yesterday is
--     live and not today's, and saying both is the difference between a manager's view and a
--     misleading one.
--   - Covers read through 016's `restaurant_table_status`, so the derived precedence
--     (OUT_OF_SERVICE > CLEANING > OCCUPIED > RESERVED > AVAILABLE) is stated once, in the one
--     place that owns it. The view is `security_invoker`; inside this DEFINER function the
--     querying role is the function owner, which is why the outlet predicate and the
--     `restaurant.view` gate above are both load-bearing rather than decorative.
--   - NOT here: tax. There is no tax engine in this build — 014 leaves `tax_category_id` an
--     unresolved placeholder and 017 freezes `tax_rate` at zero — so a GST day figure would be
--     an invention, and Phase 4 owns it. NOT here: cash drawer, shifts, or a day-close
--     read-more; those are #05's, and a Z-report signed against a shift that does not exist
--     yet would be the fake feature the roadmap warns about.
--
-- One capability gates it — `restaurant.view`, seeded in 013 onto every restaurant role — and
-- the door writes nothing, so there is no reason to record and no audit row to leave. The rails
-- and panels of this release read their own rows; this file answers only "how is tonight
-- going", and answers it in one round trip.
-- =============================================================================

-- ---------------------------------------------------------------- the day read

create or replace function public.restaurant_day_overview(p_outlet uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid := app.require_session();
  v_org      uuid;
  v_prop     uuid;
  v_out      uuid;
  v_bdate    date;
  v_covers   jsonb;
  v_tickets  jsonb;
  v_kitchen  jsonb;
  v_money    jsonb;
  v_tender   jsonb;
begin
  -- The outlet resolves its own tenant, exactly as `open_kots` (018) does: a screen passes one
  -- id and the database decides what that id belongs to.
  select o.organization_id, o.property_id, o.id into v_org, v_prop, v_out
    from public.outlets o
   where o.id = p_outlet;
  perform app.require_valid(v_out is not null, 'NIVAAS_NOT_FOUND');
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('restaurant.view', v_org, v_prop, v_out);

  select app.rest_outlet_business_date(p_outlet) into v_bdate;

  -- The floor's operational truth, derived once by 016's view rather than re-derived here.
  select jsonb_build_object(
    'total',        (count(*))::int,
    'available',    (count(*) filter (where derived_status = 'AVAILABLE'))::int,
    'occupied',     (count(*) filter (where derived_status = 'OCCUPIED'))::int,
    'reserved',     (count(*) filter (where derived_status = 'RESERVED'))::int,
    'cleaning',     (count(*) filter (where derived_status = 'CLEANING'))::int,
    'outOfService', (count(*) filter (where derived_status = 'OUT_OF_SERVICE'))::int
  ) into v_covers
    from public.restaurant_table_status
   where outlet_id = p_outlet;

  -- `live` is the room's present tense; `today` and `byStatus` are the business date's.
  select jsonb_build_object(
    'live', coalesce((select count(*)
                        from public.orders o
                       where o.outlet_id = p_outlet
                         and o.status not in ('COMPLETED','CANCELLED','VOID')), 0)::int,
    'today', coalesce((select count(*)
                         from public.orders o
                        where o.outlet_id = p_outlet
                          and o.business_date = v_bdate), 0)::int,
    'byStatus', coalesce((
      select jsonb_object_agg(s.status, s.n)
        from (select o.status, count(*)::int as n
                from public.orders o
               where o.outlet_id = p_outlet
                 and o.business_date = v_bdate
               group by o.status) s
    ), '{}'::jsonb)
  ) into v_tickets;

  -- The pass: open slips and the lines on them, plus the day's two retired figures — a reprint
  -- and a cancellation are the two things on a slip a manager asks about afterwards.
  select jsonb_build_object(
    'openSlips', coalesce((select count(*)
                              from public.kitchen_order_tickets k
                             where k.outlet_id = p_outlet
                               and k.status = 'OPEN'), 0)::int,
    'linesCooking', coalesce((select count(*)
                                from public.order_items oi
                                join public.kitchen_order_tickets k on k.id = oi.kot_id
                               where k.outlet_id = p_outlet
                                 and k.status = 'OPEN'
                                 and oi.fire_status = 'FIRED'), 0)::int,
    'linesRungUp', coalesce((select count(*)
                               from public.order_items oi
                               join public.kitchen_order_tickets k on k.id = oi.kot_id
                              where k.outlet_id = p_outlet
                                and k.status = 'OPEN'
                                and oi.fire_status = 'READY'), 0)::int,
    'reprintsToday', coalesce((select sum(k.reprint_count)
                                  from public.kitchen_order_tickets k
                                 where k.outlet_id = p_outlet
                                   and k.business_date = v_bdate), 0)::int,
    'cancelledSlipsToday', coalesce((select count(*)
                                       from public.kitchen_order_tickets k
                                      where k.outlet_id = p_outlet
                                        and k.business_date = v_bdate
                                        and k.status = 'CANCELLED'), 0)::int
  ) into v_kitchen;

  -- The day's money, per currency. A CANCELLED document is excluded: it billed nothing, and
  -- counting its grand_total would inflate the figure the exit gate exists to check.
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'currency',    b.currency,
      'documents',   b.documents,
      'payments',    coalesce(p.moves, 0),
      'billed',      b.billed::text,
      'collected',   coalesce(p.collected, 0)::text,
      'outstanding', b.outstanding::text
    ) order by b.currency),
    '[]'::jsonb
  ) into v_money
    from (
      select currency,
             count(*)::int      as documents,
             sum(grand_total)   as billed,
             sum(amount_due)    as outstanding
        from public.bills
       where outlet_id = p_outlet
         and business_date = v_bdate
         and status <> 'CANCELLED'
       group by currency
    ) b
    -- A payment cannot exist without a bill (017's FK is `on delete restrict`), so every
    -- currency in the payment side is already on the bill side — a LEFT JOIN loses nothing.
    left join (
      select currency,
             count(*)::int as moves,
             sum(amount)   as collected
        from public.payments
       where outlet_id = p_outlet
         and business_date = v_bdate
         and status = 'SUCCESSFUL'
       group by currency
    ) p on p.currency = b.currency;

  -- How the money arrived. Methods are 017's own CHECK vocabulary, so no list is repeated here.
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'currency', t.currency,
      'method',   t.method,
      'amount',   t.total::text,
      'payments', t.moves
    ) order by t.currency, t.method),
    '[]'::jsonb
  ) into v_tender
    from (
      select currency,
             method,
             sum(amount)   as total,
             count(*)::int as moves
        from public.payments
       where outlet_id = p_outlet
         and business_date = v_bdate
         and status = 'SUCCESSFUL'
       group by currency, method
    ) t;

  return jsonb_build_object(
    'outletId',     v_out,
    'organizationId', v_org,
    'propertyId',   v_prop,
    'businessDate', v_bdate,
    'generatedAt',  now(),
    'covers',       v_covers,
    'tickets',      v_tickets,
    'kitchen',      v_kitchen,
    'money',        v_money,
    'tender',       v_tender
  );
end;
$$;

comment on function public.restaurant_day_overview(uuid) is
  'The active outlet''s trading day in one read: covers by derived status, tickets live and by business-date status, the pass''s open slips and line counts, and the day''s money per currency (billed / collected / outstanding) plus tender by method. Every amount is ::text (§1); every sum is Postgres numeric (§2 — no client may compute a day total). Gated on restaurant.view and writes nothing.';

-- ================================================================ grants
--
-- The same catalog-resolved loop 015/016/017/018 use: name only, signature derived from
-- pg_proc, so a future parameter cannot desync an ACL list.
do $$
declare
  v_name text;
  v_oid  oid;
  v_oids oid[];
begin
  foreach v_name in array array['restaurant_day_overview'] loop
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

-- ================================================================ self-check
--
-- The shape this file exists to provide, verified rather than assumed — the way 015, 016,
-- 017 and 018 each close. A half-applied 019 must fail loudly at apply time.
do $$
declare
  v_oid oid;
  v_def text;
begin
  -- The door exists, takes the outlet, and returns jsonb.
  select p.oid into v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'restaurant_day_overview';
  perform app.require_valid(v_oid is not null, 'NIVAAS_MIGRATION_GAP');
  perform app.require_valid(
    (select count(*) from pg_proc p where p.oid = v_oid
      and p.proname = 'restaurant_day_overview'
      and p.proargtypes = 'uuid'::regtype::oidvector
      and p.pronargs = 1
      and p.prorettype = 'jsonb'::regtype) = 1,
    'NIVAAS_MIGRATION_GAP');

  -- DEFINER with an empty search_path: the door surface 005 established, or the read could be
  -- redirected by a hostile `public` schema in the session path.
  select p.prosecdef into v_def from pg_proc p where p.oid = v_oid;
  perform app.require_valid(v_def = 'true', 'NIVAAS_MIGRATION_GAP');
  perform app.require_valid(
    (select coalesce(nullif(p.proconfig, '{}'), '{search_path=}')::text[]
        @> array['search_path=']
       from pg_proc p where p.oid = v_oid),
    'NIVAAS_MIGRATION_GAP');

  -- Executable by the two roles that read the app, and granted through the catalog loop above
  -- rather than a hand-written signature.
  perform app.require_valid(
    has_function_privilege('authenticated', v_oid, 'execute')
    and has_function_privilege('service_role', v_oid, 'execute'),
    'NIVAAS_MIGRATION_GAP');

  -- The one capability that gates it was actually seeded (013), or every manager would be
  -- refused by a door nobody can pass.
  perform app.require_valid(
    exists (select 1 from public.role_permissions where permission = 'restaurant.view'),
    'NIVAAS_MIGRATION_GAP');

  -- The money this door reads is still TEXT-on-the-wire discipline at its source: the columns
  -- it sums exist and are unconstrained numeric, the same shape 017's self-check insists on.
  perform app.require_valid(
    exists (select 1 from pg_attribute a join pg_class c on c.oid = a.attrelid
             where c.relnamespace = 'public'::regnamespace
               and c.relname = 'bills' and a.attname = 'grand_total'
               and a.atttypid = 'numeric'::regtype and a.atttypmod = -1)
    and exists (select 1 from pg_attribute a join pg_class c on c.oid = a.attrelid
                 where c.relnamespace = 'public'::regnamespace
                   and c.relname = 'payments' and a.attname = 'amount'
                   and a.atttypid = 'numeric'::regtype and a.atttypmod = -1),
    'NIVAAS_MIGRATION_GAP');

  -- 016's derived-status view is the floor's source; without it this door has no covers block.
  perform app.require_valid(
    exists (select 1 from pg_class where relname = 'restaurant_table_status'
              and relkind = 'v'),
    'NIVAAS_MIGRATION_GAP');

  -- The day is the outlet's business date, resolved by the helper 016 owns — not `now()::date`.
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'restaurant_day_overview';
  perform app.require_valid(v_def like '%rest_outlet_business_date%', 'NIVAAS_MIGRATION_GAP');
  perform app.require_valid(v_def like '%restaurant.view%', 'NIVAAS_MIGRATION_GAP');
  -- Every amount leaves as text: three casts, one per money figure, asserted rather than hoped.
  perform app.require_valid(
    (select count(*) from regexp_matches(v_def, '::text', 'g')) >= 3,
    'NIVAAS_MIGRATION_GAP');
end;
$$;
