-- ============================================================================
-- AMRUT NIVAAS — Prompt #02 §80/§81 verification: tenant isolation
--
-- The acceptance bar for this stage is not "the SQL parses", it is the twenty scenarios
-- below holding against a real server. Run it through db/harness/local-pg.sh
-- `verify` (a throwaway local cluster) or against a hosted project's scratch
-- database. It is READ-mostly on purpose: fixtures are written as superuser because
-- a migration-time seed has no session, and every scenario below then runs as
-- `authenticated`, which is the only role a client ever gets.
--
-- ON_ERROR_STOP means any failure aborts the run, so reaching the final notice means
-- every scenario below passed against one dataset. Scenario 7 deliberately opens its
-- own connections: a client-shaped session needs a real `session_user`, which
-- `set role` cannot produce.
--
-- Identity is switched with `set app.user_id = ...` / `set request.jwt.claims = ...`,
-- i.e. SESSION scope. `set_config(..., true)` is transaction-local and psql autocommits
-- every line, so the setting would be gone before the assertion that depends on it — the
-- symptom is not an error but every policy quietly seeing "no session" and returning 0
-- rows, which reads like a passing isolation test.
-- ============================================================================

\set ON_ERROR_STOP on
set client_min_messages to notice;

-- ---------------------------------------------------------------- primitives

-- Test-only helpers. SECURITY INVOKER (the default) is what makes them meaningful:
-- the dynamic statement runs with the caller's RLS, so app.expect_denial cannot
-- quietly succeed by escaping the policy it is supposed to be testing.
create or replace function app.verify(p_label text, p_passed boolean)
returns void
language plpgsql
as $$
begin
  if not coalesce(p_passed, false) then
    raise exception 'VERIFY FAILED: %', p_label;
  end if;
  raise notice 'PASS  %', p_label;
end;
$$;

create or replace function app.expect_denial(p_sql text, p_code text)
returns void
language plpgsql
as $$
declare
  v_msg text;
begin
  execute p_sql;
  -- Reaching here means the statement was allowed. Surface it as a failure that the
  -- handler below cannot mistake for the expected denial.
  raise exception 'VERIFY FAILED: expected % but it succeeded: %', p_code, p_sql;
exception when others then
  v_msg := sqlerrm;
  if v_msg not like '%' || p_code || '%' then
    -- A different error than the one under test: never swallow it.
    if v_msg like 'VERIFY FAILED%' then raise; end if;
    raise exception 'VERIFY FAILED: expected % but got: % (%)', p_code, v_msg, p_sql;
  end if;
  raise notice 'PASS  refused with % — %', p_code, p_sql;
end;
$$;

grant execute on function app.verify(text, boolean) to authenticated;
grant execute on function app.expect_denial(text, text) to authenticated;

-- ------------------------------------------------------------------ fixtures

-- Deterministic ids so the scenarios can name them without reading back a result.
do $$
declare
  v_org_a  uuid := 'a0000000-0000-4000-8000-00000000000a';
  v_org_b  uuid := 'b0000000-0000-4000-8000-00000000000b';
  v_prop_a uuid := 'a1000000-0000-4000-8000-000000000001';
  v_prop_b uuid := 'b1000000-0000-4000-8000-000000000001';
  v_out_a1 uuid := 'a2000000-0000-4000-8000-000000000001';  -- Main Dining
  v_out_a2 uuid := 'a2000000-0000-4000-8000-000000000002';  -- Rooftop
  v_out_b1 uuid := 'b2000000-0000-4000-8000-000000000001';  -- Beach Bar
  v_owner_a uuid := '00000000-0000-4000-8000-000000000001';
  v_gm_a    uuid := '00000000-0000-4000-8000-000000000002';
  v_chef_a  uuid := '00000000-0000-4000-8000-000000000003';
  v_owner_b uuid := '00000000-0000-4000-8000-000000000011';
  v_role    uuid;
begin
  -- History is reset with TRUNCATE, which is not a row mutation and therefore not what
  -- the immutability wall guards. The wall under test is UPDATE/DELETE on a live row —
  -- asserted in the structural section below, and unreachable from any client because
  -- 003/004 grant `authenticated` SELECT only. A throwaway harness dataset starts
  -- empty; the audit rows this run then writes are the ones the assertions read.
  truncate table public.audit_log;

  -- The document counters are reset the same way, because `document_counters.outlet_id` RESTRICTs
  -- the outlet delete below: an estate cannot be torn down while its numbering is still alive. A
  -- run then mints its own numbers from ORD-000001, and every number assertion in scenario 17 is
  -- made WITHIN one run (succession, and the counter row read as the table owner) — never against
  -- a value a previous run left behind.
  truncate table public.document_counters;

  -- The money path (016/017/018) is cleared FIRST and strictly child-first: an option before its
  -- line, a line before its order, a payment before its bill. It comes before the menu because
  -- `order_item_modifiers.modifier_id` restricts the option row it sold — a sold option outlives
  -- the menu it came from, which is the point of the snapshot — so a menu-first clear would abort
  -- on RESTRICT and the run would only be reproducible after a cold rebuild.
  -- Without these six lines a second `verify` run aborts the moment scenario 17 has seated a guest.
  delete from public.order_item_modifiers;
  delete from public.order_items;
  delete from public.kitchen_order_tickets;
  -- A SUCCESSFUL payment row cannot be deleted by anyone, including this file: 017''s immutability
  -- trigger guards DELETE as well as UPDATE, and a TRUNCATE is not a row mutation, which is exactly
  -- why audit_log above is truncated for the same reason. Deleting the money rows before the bills
  -- they hang off is still the child-first order the RESTRICT walls require.
  truncate table public.payments;
  delete from public.bills;
  delete from public.orders;

  -- Menu rows (014) hang off outlets/properties/organizations with ON DELETE RESTRICT, so
  -- they are cleared next — before the estate below can be torn down and re-seeded. Without
  -- these lines a second `verify` run would abort on the outlet delete the moment scenario 15
  -- had written a menu.
  delete from public.menu_item_prices;
  delete from public.modifiers;
  delete from public.modifier_groups;
  delete from public.menu_items;
  delete from public.menu_categories;
  delete from public.menus;

  -- The floor (015) hangs the same way — a table restricts its area, an area restricts its
  -- outlet — and it is cleared child-first for the same reason: without these two lines a
  -- second `verify` run aborts on the outlet delete the moment scenario 16 has built a floor.
  delete from public.restaurant_tables;
  delete from public.dining_areas;

  delete from public.user_active_contexts;
  delete from public.invitations;
  delete from public.user_roles;
  delete from public.membership_outlet_access;
  delete from public.membership_property_access;
  delete from public.organization_memberships;
  delete from public.departments;
  delete from public.outlets;
  delete from public.properties;
  delete from public.organizations;
  delete from public.profiles;
  delete from auth.users;

  -- auth.users feeds app.handle_new_user(), which creates the profile row: the same
  -- path a real signup takes, so profiles are never hand-written into existence.
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_owner_a, 'owner.a@verify.local',  '{"full_name":"Aarti Nair"}'),
    (v_gm_a,    'gm.a@verify.local',     '{"full_name":"Ganesh Menon"}'),
    (v_chef_a,  'chef.a@verify.local',   '{"full_name":"Chef Anil"}'),
    (v_owner_b, 'owner.b@verify.local',  '{"full_name":"Bina Rao"}');

  insert into public.organizations (id, name, code, slug, business_types, status,
    country, currency, timezone, locale, tax_region)
  values
    (v_org_a, 'Deccan Grand Hospitality', 'VDGH', 'deccan-grand-hospitality',
     array['HOTEL','RESTAURANT'], 'ACTIVE', 'IN', 'INR', 'Asia/Kolkata', 'en-IN', 'IN-MH'),
    (v_org_b, 'Coastal Retreats', 'VCSR', 'coastal-retreats',
     array['RESORT'], 'ACTIVE', 'IN', 'INR', 'Asia/Kolkata', 'en-IN', 'IN-GA');

  insert into public.properties (id, organization_id, name, code, slug, property_type,
    status, city, state, country, timezone, currency, locale, business_day_start)
  values
    (v_prop_a, v_org_a, 'Deccan Grand Hotel', 'VDGH-HOTEL-01', 'deccan-grand-hotel',
     'HOTEL', 'ACTIVE', 'Pune', 'Maharashtra', 'IN', 'Asia/Kolkata', 'INR', 'en-IN', '04:00'),
    (v_prop_b, v_org_b, 'Coast Beach Resort', 'VCSR-RESORT-01', 'coast-beach-resort',
     'RESORT', 'ACTIVE', 'Panaji', 'Goa', 'IN', 'Asia/Kolkata', 'INR', 'en-IN', '04:00');

  insert into public.outlets (id, organization_id, property_id, name, code, slug,
    outlet_type, status)
  values
    (v_out_a1, v_org_a, v_prop_a, 'Main Dining',  'VDGH-OUT-01', 'main-dining',  'RESTAURANT', 'ACTIVE'),
    (v_out_a2, v_org_a, v_prop_a, 'Rooftop',      'VDGH-OUT-02', 'rooftop',      'RESTAURANT', 'ACTIVE'),
    (v_out_b1, v_org_b, v_prop_b, 'Beach Bar',    'VCSR-OUT-01', 'beach-bar',    'BAR',        'ACTIVE');

  -- §14 shape: property-level teams and outlet-level teams coexist.
  insert into public.departments (organization_id, property_id, outlet_id, name, code, slug, status)
  values
    (v_org_a, v_prop_a, null,     'Front Office', 'VDEPT-FO',  'front-office', 'ACTIVE'),
    (v_org_a, v_prop_a, null,     'Finance',      'VDEPT-FIN', 'finance',      'ACTIVE'),
    (v_org_a, v_prop_a, v_out_a1, 'Kitchen',      'VDEPT-KIT1','main-kitchen', 'ACTIVE'),
    (v_org_a, v_prop_a, v_out_a2, 'Kitchen',      'VDEPT-KIT2','rooftop-kitchen', 'ACTIVE'),
    (v_org_b, v_prop_b, v_out_b1, 'Bar Service',  'VDEPT-BAR', 'bar-service',  'ACTIVE');

  insert into public.organization_memberships (user_id, organization_id, status, is_owner, joined_at)
  values
    (v_owner_a, v_org_a, 'ACTIVE', true, now()),
    (v_gm_a,    v_org_a, 'ACTIVE', false, now()),
    (v_chef_a,  v_org_a, 'ACTIVE', false, now()),
    (v_owner_b, v_org_b, 'ACTIVE', true, now());

  insert into public.membership_property_access (user_id, organization_id, mode)
  values (v_owner_a, v_org_a, 'ALL_PROPERTIES'),
         (v_owner_b, v_org_b, 'ALL_PROPERTIES');
  insert into public.membership_property_access (user_id, organization_id, property_id, mode)
  values (v_gm_a, v_org_a, v_prop_a, 'SELECTED_PROPERTIES'),
         (v_chef_a, v_org_a, v_prop_a, 'SELECTED_PROPERTIES');

  -- The chef is carved down to one outlet; the GM is not carved at all and so
  -- inherits the property's breadth (see app.can_access_outlet).
  insert into public.membership_outlet_access (user_id, organization_id, property_id, outlet_id, mode)
  values (v_chef_a, v_org_a, v_prop_a, v_out_a1, 'SELECTED_OUTLETS');

  select id into v_role from public.roles where name = 'ORG_OWNER';
  insert into public.user_roles (user_id, role_id, organization_id) values (v_owner_a, v_role, v_org_a);
  select id into v_role from public.roles where name = 'GENERAL_MANAGER';
  insert into public.user_roles (user_id, role_id, organization_id, property_id)
  values (v_gm_a, v_role, v_org_a, v_prop_a);
  select id into v_role from public.roles where name = 'RESTAURANT_MANAGER';
  insert into public.user_roles (user_id, role_id, organization_id, outlet_id)
  values (v_chef_a, v_role, v_org_a, v_out_a1);

  insert into public.user_active_contexts (user_id, organization_id, property_id, outlet_id)
  values (v_chef_a, v_org_a, v_prop_a, v_out_a1);
end;
$$;

-- ============================================================================
-- Scenario 1 — a member of organization A cannot read ANY row belonging to B,
-- at any level of the hierarchy (§46, §79).
-- ============================================================================
set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000001';

do $$
declare n integer;
begin
  select count(*) into n from public.organizations;
  perform app.verify('1a owner A sees exactly its own organization', n = 1);

  select count(*) into n from public.properties;
  perform app.verify('1b owner A sees exactly its own properties', n = 1);

  select count(*) into n from public.outlets;
  perform app.verify('1c owner A sees no outlet of another tenant', n = 2);

  select count(*) into n from public.departments;
  perform app.verify('1d owner A sees no department of another tenant', n = 4);

  select count(*) into n from public.organizations
   where id = 'b0000000-0000-4000-8000-00000000000b';
  perform app.verify('1e organization B is invisible even by direct id lookup', n = 0);

  select count(*) into n from public.properties
   where id = 'b1000000-0000-4000-8000-000000000001';
  perform app.verify('1f property B is invisible even by direct id lookup', n = 0);

  -- §51: the access-denied screen must be able to say "not found" without leaking
  -- that the resource exists at all.
  select count(*) into n from public.profiles;
  perform app.verify('1g only people sharing a tenant are listable', n = 3);
end;
$$;

-- ============================================================================
-- Scenario 2 — a client cannot write a tenant row directly: the grant itself is
-- gone, so no policy can be talked into allowing it (§25, §46).
-- ============================================================================
do $$
begin
  perform app.expect_denial(
    'insert into public.organizations (name, code, slug, country, currency, timezone, locale) '
    || 'values (''Forged Group'', ''VFORGE'', ''forged-group'', ''IN'', ''INR'', ''Asia/Kolkata'', ''en-IN'')',
    'permission denied');
  perform app.expect_denial(
    'update public.properties set name = ''Renamed by client'' where id = ''a1000000-0000-4000-8000-000000000001''',
    'permission denied');
  perform app.expect_denial(
    'delete from public.outlets where id = ''a2000000-0000-4000-8000-000000000002''',
    'permission denied');
  -- §47: history is not writable by a client either, so an audit row cannot be
  -- fabricated to cover a change.
  perform app.expect_denial(
    'insert into public.audit_log (action, entity, entity_id) values (''organization_created'', ''organization'', ''x'')',
    'permission denied');
  -- The immutability trigger is a second wall behind the missing grant: even the
  -- table owner cannot UPDATE a row once it exists.
  perform app.expect_denial(
    'update public.audit_log set action = ''nothing_happened'' where action = ''role_assigned''',
    'permission denied');
end;
$$;

-- ============================================================================
-- Scenario 3 — the doors refuse foreign ids even when the caller guesses them
-- correctly, and refuse a caller who simply lacks the capability (§25, §26).
-- ============================================================================
do $$
begin
  -- B's property id, handed to A's owner as an argument: access is re-proved, and
  -- the derived organization is B's, where A's owner has no membership at all.
  perform app.expect_denial(
    'select public.create_outlet(''b1000000-0000-4000-8000-000000000001''::uuid, '
    || '''Hacked Outlet'', ''VHACK'', ''hacked-outlet'', ''BAR'')',
    'NIVAAS_ACCESS_DENIED');

  -- §15: an outlet from another property cannot parent a department, even inside
  -- the same tenant and for a user who can see both.
  perform app.expect_denial(
    'select public.create_department(''a1000000-0000-4000-8000-000000000001''::uuid, '
    || '''Impossible'', ''VDEPT-IMP'', ''impossible-department'', '
    || '''b2000000-0000-4000-8000-000000000001''::uuid)',
    'NIVAAS_OUTLET_NOT_IN_PROPERTY');
end;
$$;

reset role;
set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000003';

do $$
declare
  n      integer;
  v_slug text;
begin
  -- ============================================================================
  -- Scenario 4 — outlet-scoped access narrows reads inside ONE tenant: the chef
  -- sees the outlet they run, not its sibling (§20, §54, §79).
  -- ============================================================================
  select count(*) into n from public.outlets;
  perform app.verify('4a a carved outlet grant hides the sibling outlet', n = 1);

  -- §14: a department that hangs off the PROPERTY is property data, so anyone who
  -- reaches the property can list it. The outlet carve-out governs outlet-bound teams
  -- only — the chef sees Front Office and Finance, their own kitchen, and never the
  -- rooftop kitchen.
  select count(*) into n from public.departments;
  perform app.verify('4b the chef sees property teams plus their own outlet team', n = 3);

  select code into v_slug from public.departments where outlet_id is not null;
  perform app.verify('4b2 the sibling outlet''s team is the one thing that is hidden',
    v_slug = 'VDEPT-KIT1');

  select count(*) into n from public.properties;
  perform app.verify('4c the chef still reaches their property', n = 1);

  perform app.verify('4d outlet.edit resolves only inside the granted outlet',
    app.has_permission('00000000-0000-4000-8000-000000000003'::uuid,
      'a0000000-0000-4000-8000-00000000000a'::uuid, 'outlet.edit',
      'a1000000-0000-4000-8000-000000000001'::uuid,
      'a2000000-0000-4000-8000-000000000001'::uuid));
  perform app.verify('4e the same capability is absent at the sibling outlet',
    not app.has_permission('00000000-0000-4000-8000-000000000003'::uuid,
      'a0000000-0000-4000-8000-00000000000a'::uuid, 'outlet.edit',
      'a1000000-0000-4000-8000-000000000001'::uuid,
      'a2000000-0000-4000-8000-000000000002'::uuid));

  -- A suite of denials proves nothing unless the permitted write also goes through:
  -- the chef renames the restaurant they actually run.
  perform public.update_outlet('a2000000-0000-4000-8000-000000000001'::uuid, 'Main Dining Renamed');
  perform app.verify('4f the chef can rename their own outlet',
    (select name from public.outlets
      where id = 'a2000000-0000-4000-8000-000000000001') = 'Main Dining Renamed');

  perform app.expect_denial(
    'select public.update_outlet(''a2000000-0000-4000-8000-000000000002''::uuid, ''Renamed Rooftop'')',
    'NIVAAS_ACCESS_DENIED');

  -- §26: an outlet-scoped role is not a group administrator. This belongs in the
  -- chef's session and not the owner's — owner A creating a property is the happy
  -- path, so asserting it as a denial would only have tested the fixture.
  perform app.expect_denial(
    'select public.create_property(''a0000000-0000-4000-8000-00000000000a''::uuid, '
    || '''Sneaky Property'', ''VDGH-X'', ''sneaky-property'', ''HOTEL'', '
    || '''IN'', ''INR'', ''Asia/Kolkata'', ''en-IN'')',
    'NIVAAS_ACCESS_DENIED');
end;
$$;

-- ============================================================================
-- Scenario 5 — a persisted context cannot outlive the access that justified it
-- (§29, §57). Narrow the chef to no outlets, then re-resolve.
-- ============================================================================
reset role;
set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000001';

do $$
begin
  -- The owner redraws the chef's breadth: now only the Rooftop.
  perform public.set_property_access('00000000-0000-4000-8000-000000000003'::uuid,
    'a0000000-0000-4000-8000-00000000000a'::uuid, 'SELECTED_PROPERTIES',
    array['a1000000-0000-4000-8000-000000000001']::uuid[], 'Scenario 5 narrowing');
  perform public.set_outlet_access('00000000-0000-4000-8000-000000000003'::uuid,
    'a1000000-0000-4000-8000-000000000001'::uuid, 'SELECTED_OUTLETS',
    array['a2000000-0000-4000-8000-000000000002']::uuid[], 'Scenario 5 narrowing');
  perform app.verify('5a an administrator can redraw access breadth', true);
end;
$$;

reset role;
set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000003';

do $$
declare v jsonb;
begin
  -- The stored context still names Main Dining. The resolver must refuse it.
  select public.resolve_active_context() into v;
  perform app.verify('5b stale outlet is dropped from the resolved context',
    (v->>'outletId') is null);
  perform app.verify('5c the still-valid levels survive',
    (v->>'organizationId') = 'a0000000-0000-4000-8000-00000000000a'
    and (v->>'propertyId') = 'a1000000-0000-4000-8000-000000000001');
  perform app.verify('5d the drop is flagged, never silent', (v->>'cleared') = 'true');

  perform app.verify('5e and the chef now reads the other outlet, not the old one',
    (select count(*) from public.outlets) = 1
    and (select name from public.outlets) = 'Rooftop');

  -- Writing back the stale context must not resurrect it (§29's security rule).
  select public.set_active_context(
    'a0000000-0000-4000-8000-00000000000a'::uuid,
    'a1000000-0000-4000-8000-000000000001'::uuid,
    'a2000000-0000-4000-8000-000000000001'::uuid) into v;
  perform app.verify('5f a stale context write is narrowed, not stored',
    (v->>'outletId') is null);
end;
$$;

-- ============================================================================
-- Scenario 6 — suspension removes authority immediately, and removal also removes
-- breadth, while the person's login survives (§16, §17, §74).
-- ============================================================================
reset role;
set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000001';

do $$
declare v jsonb;
begin
  select public.set_member_status(
    (select m.id from public.organization_memberships m
      where m.user_id = '00000000-0000-4000-8000-000000000002'), 'SUSPENDED',
    'Scenario 6 suspension') into v;
  perform app.verify('6a an owner can suspend a manager', (v->>'status') = 'SUSPENDED');

  perform app.expect_denial(
    'select public.set_member_status('
    || '(select m.id from public.organization_memberships m '
    || '  where m.user_id = ''00000000-0000-4000-8000-000000000001''), ''REMOVED'', ''drop the owner'')',
    'NIVAAS_SELF_NOT_ALLOWED');
end;
$$;

reset role;
set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000002';

do $$
declare n integer;
begin
  select count(*) into n from public.properties;
  perform app.verify('6b a suspended member reads no tenant data', n = 0);

  select count(*) into n from public.organizations;
  perform app.verify('6c the tenant itself is invisible while suspended', n = 0);

  perform app.expect_denial(
    'select public.update_property(''a1000000-0000-4000-8000-000000000001''::uuid, ''Renamed while suspended'')',
    'NIVAAS_ACCESS_DENIED');

  -- §12 of Prompt #01: revoking a membership must never revoke the login.
  select count(*) into n from public.profiles where id = app.current_user_id();
  perform app.verify('6d the person''s own profile row still exists', n = 1);
end;
$$;

-- The revocation must have reached the grants too, or a role row survives in the
-- dark and a later bug could honour it.
reset role;
do $$
declare n integer;
begin
  select count(*) into n from public.user_roles
   where user_id = '00000000-0000-4000-8000-000000000002' and revoked_at is null;
  perform app.verify('6e suspension revoked the role grants themselves', n = 0);
end;
$$;

-- ============================================================================
-- Scenario 7 — the harness identity override is unreachable from a client session.
--
-- app.current_user_id() honours the `app.user_id` GUC only for login roles that can
-- never serve an API request. `set role` alone could NOT prove that: it switches
-- current_user while session_user stays `postgres` — and session_user is exactly the
-- branch under test. So this scenario opens a second connection whose LOGIN role is
-- `authenticator`, the role PostgREST itself connects as, and then becomes
-- `authenticated` inside it the way a request does.
--
-- What is simulated: `request.jwt.claims` is set directly instead of arriving from a
-- verified GoTrue token. That is enough to prove the precedence rule (claim over GUC)
-- and the denial (no claim, no identity); signature verification is Supabase's job and
-- the real end-to-end login lands in Prompt #03.
-- ============================================================================
reset role;
-- `nivas` is the harness database name from db/harness/local-pg.sh; substitute the
-- scratch database when running this file against a hosted project.
\connect nivas authenticator

set role authenticated;
-- A client with no JWT subject, holding a forged GUC that names the tenant owner.
set request.jwt.claims to '{"role":"authenticated"}';
set app.user_id to '00000000-0000-4000-8000-000000000001';

do $$
begin
  perform app.verify('7a session_user is authenticator, so the GUC branch is closed',
    session_user = 'authenticator' and current_user = 'authenticated');
  perform app.verify('7b a client-set app.user_id is ignored, not believed',
    app.current_user_id() is null);
  perform app.expect_denial('select public.create_organization(''Impossible'', ''VIMP'', '
    || '''impossible-org'', ''IN'', ''INR'', ''Asia/Kolkata'', ''en-IN'')',
    'NIVAAS_NO_SESSION');
end;
$$;

-- Same session, but now carrying a real JWT subject: the identity must come from the
-- claim and nowhere else.
set request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}';
set app.user_id to '00000000-0000-4000-8000-000000000001';

do $$
begin
  perform app.verify('7c the JWT claim wins over the forged GUC',
    app.current_user_id() = '00000000-0000-4000-8000-000000000003'::uuid);
end;
$$;

reset role;
-- Back to the harness superuser: the structural section below needs to attempt raw
-- inserts as the table owner, which is what makes the trigger/CHECK walls — rather
-- than a missing grant — the thing under test.
\connect nivas postgres

-- ============================================================================
-- Scenario 8 — the invitation round trip (§36-§45).
--
-- What needs no real authentication here is the session switch: scenario 7 proved where
-- an identity comes from, and GoTrue's sign-up is the one insert into auth.users below —
-- the same write that mints the profile whose address the door matches against. What is
-- proven is the door's own contract: a token that exists only in its response, a spend
-- that requires the matching address, and access that genuinely exists afterwards.
-- ============================================================================

-- The invited person has an account but no membership yet.
do $$
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values ('00000000-0000-4000-8000-000000000004', 'newchef@verify.local',
          '{"full_name":"New Chef"}')
  on conflict (id) do nothing;
end;
$$;

set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000001';

do $$
declare
  v_res   jsonb;
  v_token text;
  n       integer;
begin
  -- 8a/8b — owner A offers the head-chef seat at Main Dining. The whole round trip runs
  -- in this one block because the raw token only ever exists in the door's response; a
  -- second block could not spend it, which is exactly the property under test.
  select public.invite_member(
    'a0000000-0000-4000-8000-00000000000a'::uuid, 'newchef@verify.local',
    'RESTAURANT_MANAGER', 'New Chef', null,
    array['a1000000-0000-4000-8000-000000000001']::uuid[],
    array['a2000000-0000-4000-8000-000000000001']::uuid[]) into v_res;
  v_token := v_res ->> 'token';

  perform app.verify('8a the door returns a 64-hex token and names the scope',
    length(v_token) = 64 and (v_res ->> 'scope') = 'OUTLET');

  -- A dump of this table hands an attacker nothing spendable.
  perform app.verify('8b only the SHA-256 digest is stored, never the token',
    not exists (select 1 from public.invitations where token_hash = v_token)
    and exists (select 1 from public.invitations
                 where token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex')));

  perform app.expect_denial(
    'select public.invite_member(''a0000000-0000-4000-8000-00000000000a''::uuid, '
    || '''newchef@verify.local'', ''RESTAURANT_MANAGER'', null, null, '
    || '''{a1000000-0000-4000-8000-000000000001}''::uuid[], '
    || '''{a2000000-0000-4000-8000-000000000001}''::uuid[])',
    'NIVAAS_ALREADY_INVITED');

  -- An outlet-scoped title with no outlet attached would name a manager of nowhere.
  perform app.expect_denial(
    'select public.invite_member(''a0000000-0000-4000-8000-00000000000a''::uuid, '
    || '''orphan@verify.local'', ''RESTAURANT_MANAGER'', null, null, '
    || '''{}''::uuid[], ''{}''::uuid[])',
    'NIVAAS_EMPTY_SELECTION');

  -- The offer is addressed to an email. Holding the token is not enough.
  perform app.expect_denial('select public.accept_invitation(''' || v_token || ''')',
    'NIVAAS_EMAIL_MISMATCH');
  perform app.expect_denial('select public.accept_invitation(''not-a-real-token'')',
    'NIVAAS_INVITATION_NOT_FOUND');

  -- 8c — the invitee accepts. Identity moves inside the block: set_config(..., true) is
  -- transaction-scoped and this block is one statement, so every call after it sees the
  -- new subject.
  perform set_config('app.user_id', '00000000-0000-4000-8000-000000000004', true);
  select public.accept_invitation(v_token) into v_res;
  perform app.verify('8c the matching address spends the token',
    (v_res ->> 'role') = 'RESTAURANT_MANAGER'
    and (v_res ->> 'scope') = 'OUTLET');

  perform app.expect_denial('select public.accept_invitation(''' || v_token || ''')',
    'NIVAAS_INVITATION_NOT_USABLE');

  -- 8d — the offer carried real access, not just a title.
  select count(*) into n from public.organization_memberships
   where user_id = '00000000-0000-4000-8000-000000000004'::uuid
     and organization_id = 'a0000000-0000-4000-8000-00000000000a'::uuid
     and status = 'ACTIVE';
  perform app.verify('8d the accepted member is active in the tenant', n = 1);

  select count(*) into n from public.membership_property_access
   where user_id = '00000000-0000-4000-8000-000000000004'::uuid
     and property_id = 'a1000000-0000-4000-8000-000000000001'::uuid;
  perform app.verify('8e the offered property breadth was granted', n = 1);

  select count(*) into n from public.membership_outlet_access
   where user_id = '00000000-0000-4000-8000-000000000004'::uuid
     and outlet_id = 'a2000000-0000-4000-8000-000000000001'::uuid;
  perform app.verify('8f and so was the offered outlet', n = 1);

  select count(*) into n from public.user_roles ur
    join public.roles r on r.id = ur.role_id
   where ur.user_id = '00000000-0000-4000-8000-000000000004'::uuid
     and r.name = 'RESTAURANT_MANAGER' and ur.revoked_at is null;
  perform app.verify('8g one role grant per outlet named on the invitation', n = 1);

  -- 8h — the closed loop: what the new chef can actually read and do.
  select count(*) into n from public.outlets;
  perform app.verify('8h the accepted scope is the only outlet they can list', n = 1);

  perform app.verify('8i permissions come from the accepted role, at the right scope',
    'outlet.edit' = any (public.my_permissions(
      'a0000000-0000-4000-8000-00000000000a'::uuid,
      'a1000000-0000-4000-8000-000000000001'::uuid,
      'a2000000-0000-4000-8000-000000000001'::uuid))
    and not ('property.create' = any (public.my_permissions(
      'a0000000-0000-4000-8000-00000000000a'::uuid,
      'a1000000-0000-4000-8000-000000000001'::uuid, null::uuid))));

  -- A brand-new member has no stored context, and the resolver must say so plainly
  -- rather than inventing a first tenant. (`->>` not `->`: a JSON null fetched with `->`
  -- is a jsonb value, not SQL NULL, so `is null` would read as false.)
  select public.resolve_active_context() into v_res;
  perform app.verify('8j a fresh member resolves signed in with no context yet',
    (v_res ->> 'signedIn') = 'true' and (v_res ->> 'organizationId') is null
                               and (v_res ->> 'cleared') = 'false');

  -- §48: the round trip left history behind.
  select count(*) into n from public.audit_log
   where action in ('member_invited', 'member_accepted', 'role_assigned');
  perform app.verify('8k invite, accept and grant are all in the audit trail', n >= 3);

  -- The invitee cannot read the invitation row they just spent: 003 lets a tenant see
  -- its offers only through `user.view`. So the closing state is asserted from the
  -- inviter's session, which is also proof that the row did change.
  perform set_config('app.user_id', '00000000-0000-4000-8000-000000000001', true);
  perform app.verify('8l the invitation is closed and its spender recorded',
    exists (select 1 from public.invitations
             where email = 'newchef@verify.local' and status = 'ACCEPTED'
               and accepted_by = '00000000-0000-4000-8000-000000000004'::uuid));
end;
$$;

reset role;

-- ============================================================================
-- Scenario 9 — the write path works, end to end, and retirement is not deletion.
--
-- Everything above proves refusals. A suite of denials says nothing about a schema that
-- cannot actually be written to, and the taxonomy in `001`'s CHECK is duplicated inside
-- `public.create_property`'s guard — this is the assertion that catches that drift.
-- ============================================================================
set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000001';

do $$
declare
  v_res   jsonb;
  v_prop  uuid;
  n       integer;
begin
  -- 9a — a HOSTEL site created through the door: accepted by the guard AND by the
  -- column CHECK, which is the only thing that keeps the two lists identical.
  select public.create_property(
    'a0000000-0000-4000-8000-00000000000a'::uuid, 'Deccan Backpackers', 'VDGH-HOSTEL-01',
    'deccan-backpackers', 'HOSTEL', 'IN', 'INR', 'Asia/Kolkata', 'en-IN') into v_res;
  v_prop := (v_res ->> 'id')::uuid;
  perform app.verify('9a an owner creates a property and gets the row back',
    v_prop is not null and (v_res ->> 'property_type') = 'HOSTEL'
                        and (v_res ->> 'version') = '1');

  -- 9b — the optimistic lock: a stale expected version is refused, not overwritten.
  perform app.expect_denial(
    'select public.update_property(''' || v_prop || '''::uuid, ''Renamed blindly'', '
    || 'p_expected_version => 99)',
    'NIVAAS_VERSION_CONFLICT');
  select public.update_property(v_prop, 'Deccan Backpackers Homestay') into v_res;
  perform app.verify('9b the correct version writes and bumps the counter',
    (v_res ->> 'name') = 'Deccan Backpackers Homestay' and (v_res ->> 'version') = '2');

  -- 9b2 — "not edited" and "emptied by the operator" are different statements, and an
  -- admin form has to be able to say both. An absent parameter leaves the column alone;
  -- an empty or whitespace-only one clears it. Without this the door could only ever add
  -- values, and a cleared phone number would silently keep the old one.
  select public.update_property(v_prop, p_phone := '+91 20 4000 9999') into v_res;
  perform app.verify('9b2 a supplied phone is written', (v_res ->> 'phone') = '+91 20 4000 9999');

  select public.update_property(v_prop, p_phone := '') into v_res;
  perform app.verify('9b3 an empty phone clears the column', (v_res ->> 'phone') is null);

  select public.update_property(v_prop, p_city := 'Pune') into v_res;
  select public.update_property(v_prop, p_email := 'front.desk@example.test') into v_res;
  perform app.verify('9b4 an omitted parameter leaves the other column alone',
    (v_res ->> 'city') = 'Pune' and (v_res ->> 'email') = 'front.desk@example.test');

  select public.update_property(v_prop, p_email := '   ') into v_res;
  perform app.verify('9b5 whitespace blanks too', (v_res ->> 'email') is null);

  -- 9c — §40-§42: retiring a site sets a status and a timestamp. The row is still there.
  select public.set_property_status(v_prop, 'ARCHIVED', 'Site closed after lease ended')
    into v_res;
  perform app.verify('9c archiving keeps the row and records why',
    (select status from public.properties where id = v_prop) = 'ARCHIVED'
    and (select archived_at from public.properties where id = v_prop) is not null);

  -- 9d — and a retired site takes no new business: the door refuses to add an outlet to
  -- it, so history cannot silently gain children.
  perform app.expect_denial(
    'select public.create_outlet(''' || v_prop || '''::uuid, ''Ghost Bar'', ''VDGH-GHOST'', '
    || '''ghost-bar'', ''BAR'')',
    'NIVAAS_PROPERTY_NOT_WRITABLE');

  -- audit_log.entity_id is text on purpose (it also names rows of later modules that are
  -- not uuid), so the comparison casts rather than assumes.
  -- Counting distinct actions, not rows: this scenario writes more updates as it grows,
  -- and a row count would fail for the wrong reason while proving nothing about the trail.
  select count(distinct action) into n from public.audit_log
   where entity = 'property' and entity_id = v_prop::text;
  perform app.verify('9e create, update and archive are all in the trail', n = 3);
end;
$$;

-- 9f — restoring a suspended manager is two deliberate writes. Suspension revoked the
-- role rows (6e) and flipping the status back does not silently re-honour them, so
-- authority has to be granted again on the record.
set app.user_id to '00000000-0000-4000-8000-000000000001';

do $$
declare
  v_res jsonb;
  n     integer;
begin
  select public.set_member_status(
    (select m.id from public.organization_memberships m
      where m.user_id = '00000000-0000-4000-8000-000000000002'),
    'ACTIVE', 'Reinstated once the review cleared') into v_res;
  select count(*) into n from public.user_roles
   where user_id = '00000000-0000-4000-8000-000000000002' and revoked_at is null;
  perform app.verify('9f an active membership alone restores no authority',
    (v_res ->> 'status') = 'ACTIVE' and n = 0);

  select public.assign_role(
    '00000000-0000-4000-8000-000000000002'::uuid, 'GENERAL_MANAGER',
    'a0000000-0000-4000-8000-00000000000a'::uuid,
    'a1000000-0000-4000-8000-000000000001'::uuid, null,
    'Same standing as before the suspension') into v_res;
  select count(*) into n from public.user_roles
   where user_id = '00000000-0000-4000-8000-000000000002' and revoked_at is null;
  perform app.verify('9f2 an explicit re-grant restores it', n = 1);
end;
$$;

-- 9f3 — a DEPARTMENT-scope role is refused at the door, not half-wired. `my_permissions`
-- resolves grants at organization, property and outlet level only, so accepting a
-- department id would write a grant that confers nothing: the operator would see a
-- successful assignment and a person with no authority. An honest refusal is the
-- smaller defect, and it names the levels that ARE available.
--
-- The role fixture is written as superuser and the attempt is made back as
-- `authenticated`, in the file's established pattern: the DML revoke is itself part of
-- what the run proves, so inserting the fixture through a client role would fail for a
-- reason that has nothing to do with the assertion.
reset role;
insert into public.roles (name, display_name, scope_level, organization_id, is_system)
values ('VDGH_DEPARTMENT_ONLY', 'Department Test Role', 'DEPARTMENT',
        'a0000000-0000-4000-8000-00000000000a'::uuid, false);
set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000001';

do $$
begin
  perform app.expect_denial(
    'select public.assign_role(''00000000-0000-4000-8000-000000000004''::uuid, '
    || '''VDGH_DEPARTMENT_ONLY'', ''a0000000-0000-4000-8000-00000000000a''::uuid)',
    'NIVAAS_DEPARTMENT_GRANTS_UNSUPPORTED');
end;
$$;

reset role;
delete from public.roles where name = 'VDGH_DEPARTMENT_ONLY';
set role authenticated;

-- 9g/9h — the same separation one level down, asserted from the role it restricts.
-- A General Manager may rename a cost centre but holds no `department.archive`, so
-- retiring one has to be refused by capability, not by the breadth of their grant.
set app.user_id to '00000000-0000-4000-8000-000000000002';

do $$
declare
  v_res  jsonb;
  v_dept uuid;
begin
  select id into v_dept from public.departments where code = 'VDEPT-FO';
  perform app.verify('9g a reinstated manager reads their property teams', v_dept is not null);

  select public.update_department(v_dept, 'Front Office & Guest Relations') into v_res;
  perform app.verify('9g2 the manager renames a department inside their property',
    (v_res ->> 'name') = 'Front Office & Guest Relations');

  perform app.expect_denial(
    'select public.set_department_status(''' || v_dept || '''::uuid, ''ARCHIVED'', '
    || '''cost centre closed'')',
    'NIVAAS_ACCESS_DENIED');
end;
$$;

reset role;

-- ============================================================================
-- Scenario 10 — Prompt #03 §5/§6/§25-§28: the account itself is a gate (008).
--
-- Through scenario 9 the server asked one question about a person: "do you have an ACTIVE
-- membership?". `profiles.status` existed and nothing read it, so suspending an account
-- was a UI field, and a revoked role grant kept authorizing because `app.has_permission`
-- never looked at `user_roles.revoked_at`. These assertions are the ones that would have
-- failed before 008 — which is the only reason to write them.
--
-- The write side of account status is deliberately NOT tested: 008 gave the platform a
-- kill switch, not the tenants one, so there is no door that sets `profiles.status`. The
-- fixture writes it the way an operator's service-role session would.
-- ============================================================================

reset role;
do $$
declare
  v_role uuid;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    ('00000000-0000-4000-8000-000000000005', 'paused.a@verify.local',
     '{"full_name":"Priya Varma","first_name":"Priya","last_name":"Varma"}')
  on conflict (id) do nothing;

  insert into public.organization_memberships (user_id, organization_id, status, is_owner, joined_at)
  values ('00000000-0000-4000-8000-000000000005',
          'a0000000-0000-4000-8000-00000000000a', 'ACTIVE', false, now())
  on conflict do nothing;

  insert into public.membership_property_access (user_id, organization_id, property_id, mode)
  values ('00000000-0000-4000-8000-000000000005',
          'a0000000-0000-4000-8000-00000000000a',
          'a1000000-0000-4000-8000-000000000001', 'SELECTED_PROPERTIES')
  on conflict do nothing;

  select id into v_role from public.roles where name = 'STAFF';
  insert into public.user_roles (user_id, role_id, organization_id, outlet_id)
  values ('00000000-0000-4000-8000-000000000005', v_role,
          'a0000000-0000-4000-8000-00000000000a',
          'a2000000-0000-4000-8000-000000000001');

  insert into public.user_active_contexts (user_id, organization_id, property_id, outlet_id)
  values ('00000000-0000-4000-8000-000000000005',
          'a0000000-0000-4000-8000-00000000000a',
          'a1000000-0000-4000-8000-000000000001',
          'a2000000-0000-4000-8000-000000000001');
end;
$$;

set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000005';

do $$
declare
  v        jsonb;
  v_perms  text[];
begin
  -- §5: the person is named by parts, and the display name is derived, not typed twice.
  select to_jsonb(p) into v from public.profiles p
   where id = '00000000-0000-4000-8000-000000000005';
  perform app.verify('10a a signup carries first/last name and a derived display name',
    (v->>'first_name') = 'Priya' and (v->>'last_name') = 'Varma'
    and (v->>'display_name') = 'Priya Varma' and (v->>'status') = 'ACTIVE');

  -- An OUTLET-scope grant only resolves at its own outlet (§18); no outlet named is not
  -- the same question. The set a staff seat resolves at its granted outlet is asserted by
  -- MEMBERSHIP, not by a pinned count: it must carry the pre-menu token (outlet.view) and
  -- the menu-domain tokens 013 added (menu.view, payment.create), yet never the manager-only
  -- menu.publish. A brittle total would have to be edited every time the ladder grows, and a
  -- wrong edit reads as a passing test.
  select public.my_permissions(
    'a0000000-0000-4000-8000-00000000000a'::uuid,
    'a1000000-0000-4000-8000-000000000001'::uuid,
    'a2000000-0000-4000-8000-000000000001'::uuid) into v_perms;
  perform app.verify('10b an active account resolves its grants at the granted outlet',
    'outlet.view' = any (v_perms)
    and 'menu.view' = any (v_perms)
    and 'payment.create' = any (v_perms)
    and not ('menu.publish' = any (v_perms)));

  -- …and the very same seat resolves NOTHING one outlet over: the grant is a point, not a
  -- plane. This is the §18 rule the pinned count was silently standing in for.
  select public.my_permissions(
    'a0000000-0000-4000-8000-00000000000a'::uuid,
    'a1000000-0000-4000-8000-000000000001'::uuid,
    'a2000000-0000-4000-8000-000000000002'::uuid) into v_perms;
  perform app.verify('10b2 the same staff seat resolves nothing at a sibling outlet',
    v_perms = '{}'::text[]);
end;
$$;

reset role;
update public.profiles set status = 'SUSPENDED'
 where id = '00000000-0000-4000-8000-000000000005';
set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000005';

do $$
declare
  v       jsonb;
  v_perms text[];
  n       integer;
begin
  select public.my_permissions(
    'a0000000-0000-4000-8000-00000000000a'::uuid, null, null) into v_perms;
  perform app.verify('10c a suspended account resolves zero permissions',
    v_perms = '{}'::text[]);

  perform app.expect_denial(
    'select public.create_outlet(''a1000000-0000-4000-8000-000000000001''::uuid, '
    || '''No Bar'', ''VNOBAR'', ''no-bar'', ''BAR'')',
    'NIVAAS_ACCOUNT_SUSPENDED');

  -- §28: the stored context is not believed, it is re-proved, and a frozen account fails
  -- the proof — so a refresh of the app lands on "no tenant", not on the last one.
  select public.resolve_active_context() into v;
  perform app.verify('10d suspension clears the resolved context immediately',
    (v->>'organizationId') is null and (v->>'cleared') = 'true');

  select count(*) into n from public.properties;
  perform app.verify('10e and reads are closed too, not just writes', n = 0);
end;
$$;

-- 10f — a session whose profile row is gone (a deletion race, or a token outliving its
-- person) must be refused by name, not answer "no permissions" and look like a visitor.
set app.user_id to '00000000-0000-4000-8000-000000000099';

do $$
begin
  perform app.expect_denial(
    'select public.create_outlet(''a1000000-0000-4000-8000-000000000001''::uuid, '
    || '''Ghost Bar'', ''VGHOST'', ''ghost-bar'', ''BAR'')',
    'NIVAAS_PROFILE_MISSING');
end;
$$;

-- 10g — a revoked grant stops authorizing on the server. The UI went quiet about this
-- weeks ago; this is the half that was only ever cosmetic.
reset role;
update public.user_roles set revoked_at = now()
 where user_id = '00000000-0000-4000-8000-000000000005' and revoked_at is null;
update public.profiles set status = 'ACTIVE'
 where id = '00000000-0000-4000-8000-000000000005';
set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000005';

do $$
declare
  v_perms text[];
begin
  select public.my_permissions(
    'a0000000-0000-4000-8000-00000000000a'::uuid,
    'a1000000-0000-4000-8000-000000000001'::uuid,
    'a2000000-0000-4000-8000-000000000001'::uuid) into v_perms;
  perform app.verify('10g an ACTIVE account with only revoked grants holds nothing',
    v_perms = '{}'::text[]
    and not exists (select 1 from public.user_roles
                     where user_id = '00000000-0000-4000-8000-000000000005'
                       and revoked_at is null));
end;
$$;

reset role;

-- ============================================================================
-- Scenario 11 — Prompt #03 §29/§30: shouldPreventPrivilegeEscalation() and
-- shouldPreventRemovingLastOwner(), against the ladder (009).
--
-- Before 009, `assign_role` checked one thing: does the actor hold `role.assign`. HR_MANAGER
-- holds it, and was seeded that way, so an HR manager could have handed out ORG_OWNER —
-- including to themself — and any holder could have minted PLATFORM_ADMIN. The permission
-- to *distribute* a capability was treated as the permission to *hold* it.
-- ============================================================================

do $$
declare
  v_role  uuid;
  v_super uuid;
begin
  -- An HR manager: role.assign, seniority 55, and nothing else that matters here.
  select id into v_role from public.roles where name = 'HR_MANAGER';
  insert into public.user_roles (user_id, role_id, organization_id, granted_by)
  values ('00000000-0000-4000-8000-000000000003', v_role,
          'a0000000-0000-4000-8000-00000000000a',
          '00000000-0000-4000-8000-000000000001');

  -- A delegated seat that holds owner-level seniority WITHOUT the owner row: exactly the
  -- shape a tenant creates with 011's doors, written here directly so scenario 11 does not
  -- depend on scenario 13. `owner_class` false is what makes it not an owner.
  insert into public.roles (name, display_name, scope_level, organization_id,
                           is_system, seniority, owner_class)
  values ('VDGH_DELEGATE_ADMIN', 'Delegated Administrator', 'ORGANIZATION',
          'a0000000-0000-4000-8000-00000000000a', false, 90, false)
  returning id into v_super;
  insert into public.role_permissions (role_id, permission)
  select v_super, p from unnest(array['role.assign','user.view','role.view','user.invite']) as p;
  insert into public.user_roles (user_id, role_id, organization_id, granted_by)
  values ('00000000-0000-4000-8000-000000000002', v_super,
          'a0000000-0000-4000-8000-00000000000a',
          '00000000-0000-4000-8000-000000000001');

  -- The platform seat, held by the OTHER tenant's owner, to reach the walls that only a
  -- platform administrator can reach. Revoked again at the end of this scenario.
  select id into v_role from public.roles where name = 'PLATFORM_ADMIN';
  insert into public.user_roles (user_id, role_id, granted_by)
  values ('00000000-0000-4000-8000-000000000011', v_role,
          '00000000-0000-4000-8000-000000000011');
end;
$$;

set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000003';

do $$
begin
  -- 11a/11b — the HR manager may distribute roles, and may not distribute authority.
  perform app.expect_denial(
    'select public.assign_role(''00000000-0000-4000-8000-000000000005''::uuid, '
    || '''ORG_OWNER'', ''a0000000-0000-4000-8000-00000000000a''::uuid, null, null, '
    || '''make me important'')',
    'NIVAAS_ROLE_ABOVE_AUTHORITY');

  perform app.expect_denial(
    'select public.assign_role(''00000000-0000-4000-8000-000000000005''::uuid, '
    || '''PLATFORM_ADMIN'', ''a0000000-0000-4000-8000-00000000000a''::uuid, null, null, '
    || '''global keys'')',
    'NIVAAS_ROLE_ABOVE_AUTHORITY');

  -- 11c — no self-elevation, at any level.
  perform app.expect_denial(
    'select public.assign_role(''00000000-0000-4000-8000-000000000003''::uuid, '
    || '''STAFF'', ''a0000000-0000-4000-8000-00000000000a''::uuid, null, '
    || '''a2000000-0000-4000-8000-000000000001''::uuid, ''adding my own seat'')',
    'NIVAAS_SELF_ASSIGN_DENIED');
end;
$$;

-- 11d — seniority equal to the ceiling is still not ownership: the delegated seat can hand
-- out everything it holds, and cannot hand out the owner class.
set app.user_id to '00000000-0000-4000-8000-000000000002';

do $$
declare
  v_res jsonb;
  n     integer;
begin
  perform app.expect_denial(
    'select public.assign_role(''00000000-0000-4000-8000-000000000005''::uuid, '
    || '''ORG_OWNER'', ''a0000000-0000-4000-8000-00000000000a''::uuid, null, null, '
    || '''second owner without a transfer'')',
    'NIVAAS_OWNER_ONLY');

  -- The same actor CAN grant the roles inside their own reach, which is what makes the
  -- refusal above a wall rather than a broken feature.
  select public.assign_role('00000000-0000-4000-8000-000000000005'::uuid, 'STAFF',
    'a0000000-0000-4000-8000-00000000000a'::uuid, null,
    'a2000000-0000-4000-8000-000000000001'::uuid, 'back desk cover') into v_res;
  select count(*) into n from public.user_roles
   where user_id = '00000000-0000-4000-8000-000000000005' and revoked_at is null;
  perform app.verify('11e a delegated administrator grants within reach, audited',
    (v_res ? 'grantId') and n = 1);

  -- §48: shouldAuditRoleAssignment — the trail names the ladder, not just the intent.
  select count(*) into n from public.audit_log
   where action = 'role_assigned' and result = 'SUCCESS'
     and metadata ? 'actor_ceiling'
     and entity_id = (v_res->>'grantId');
  perform app.verify('11f the assignment is an audited SUCCESS with the actor ceiling',
    n = 1);

  -- 11g — and a junior holder of `role.assign` cannot disarm a superior: revoking is a
  -- grant in the other direction, and the same ceiling governs it.
  perform app.expect_denial(
    'select public.revoke_role('
    || '(select ur.id from public.user_roles ur join public.roles r on r.id = ur.role_id '
    || 'where ur.user_id = ''00000000-0000-4000-8000-000000000002'' and r.name = ''GENERAL_MANAGER'' '
    || 'and ur.revoked_at is null), ''disarm the general manager'')',
    'NIVAAS_ROLE_ABOVE_AUTHORITY');
end;
$$;

-- 11g2 — the wall is about rank, not about who asked: the same revoke by the owner, who
-- outranks the target, is allowed.
set app.user_id to '00000000-0000-4000-8000-000000000001';

do $$
declare
  v_res jsonb;
  n     integer;
begin
  select public.revoke_role(
    (select ur.id from public.user_roles ur join public.roles r on r.id = ur.role_id
      where ur.user_id = '00000000-0000-4000-8000-000000000002'
        and r.name = 'GENERAL_MANAGER' and ur.revoked_at is null),
    'manager stood down') into v_res;
  select count(*) into n from public.user_roles
   where user_id = '00000000-0000-4000-8000-000000000002' and revoked_at is null;
  perform app.verify('11g2 an equal-or-higher actor can stand a grant down, on the record',
    v_res is not null and n = 1);
end;
$$;

-- 11h — §30: the last owner cannot be moved out of the tenant by anyone, including the
-- platform operator, until ownership has been transferred.
set app.user_id to '00000000-0000-4000-8000-000000000001';

do $$
begin
  perform app.expect_denial(
    'select public.set_member_status('
    || '(select m.id from public.organization_memberships m where m.user_id = '
    || '''00000000-0000-4000-8000-000000000001''), ''SUSPENDED'', ''locking myself out'')',
    'NIVAAS_SELF_NOT_ALLOWED');
end;
$$;

set app.user_id to '00000000-0000-4000-8000-000000000011';

do $$
begin
  perform app.expect_denial(
    'select public.set_member_status('
    || '(select m.id from public.organization_memberships m where m.user_id = '
    || '''00000000-0000-4000-8000-000000000001''), ''REMOVED'', ''tenant lockup attempt'')',
    'NIVAAS_OWNER_MUST_TRANSFER');

  perform app.expect_denial(
    'select public.set_member_status('
    || '(select m.id from public.organization_memberships m where m.user_id = '
    || '''00000000-0000-4000-8000-000000000001''), ''SUSPENDED'', ''frozen owner'')',
    'NIVAAS_OWNER_MUST_TRANSFER');

  -- 11i — the platform arm of `my_permissions`: a platform administrator resolves the whole
  -- catalogue, which is the only way the console can show what exists at all.
  perform app.verify('11j a platform administrator resolves the full catalogue',
    (select count(distinct rp.permission) from public.role_permissions rp)
    = cardinality(public.my_permissions(
        'a0000000-0000-4000-8000-00000000000a'::uuid, null, null)));

  -- 11k — and revoking an owner-class grant is the same wall from the other side.
  perform app.expect_denial(
    'select public.revoke_role('
    || '(select ur.id from public.user_roles ur join public.roles r on r.id = ur.role_id '
    || 'where ur.user_id = ''00000000-0000-4000-8000-000000000001'' and r.name = ''ORG_OWNER''), '
    || '''remove the owner grant'')',
    'NIVAAS_OWNER_MUST_TRANSFER');
end;
$$;

-- Leave the dataset as it was found: no accidental platform administrator walking through
-- the scenarios below.
reset role;
delete from public.user_roles
 where user_id = '00000000-0000-4000-8000-000000000011';
set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000001';

-- ============================================================================
-- Scenario 12 — Prompt #03 §32-§38/§68: outcomes in the trail (010).
--
-- shouldAuditAccessDenied() has an honest limit in this architecture: a door that refuses
-- raises, and a raising function cannot write its own row in the transaction it just
-- aborted. 010 did not paper over that with a queue or dblink (§60 forbids both) — it put
-- the recording on the path that does not raise: `evaluate_access`, the pre-flight the UI
-- and the route guard call. These assertions prove both halves: the DENIED row exists, and
-- it exists with the reason, for the caller who is not a member, without touching the
-- stranger's log.
-- ============================================================================

do $$
declare
  v      jsonb;
  n      integer;
begin
  -- 12a — inside your own tenant, with the capability: allowed, and nothing written.
  select public.evaluate_access('property.create',
    'a0000000-0000-4000-8000-00000000000a'::uuid, null, null) into v;
  perform app.verify('12a evaluate_access allows what the doors will allow',
    (v->>'allowed') = 'true' and (v->>'reason') is null);

  select count(*) into n from public.audit_log
   where action = 'access_denied' and result = 'DENIED';
  perform app.verify('12b an allowed evaluation writes no denial', n = 0);

  -- 12c — a foreign tenant. The reason is the membership cause, not the permission, and
  -- the row is recorded against NO tenant: an outsider cannot append to someone else's
  -- audit log, which would be a write into their history.
  select public.evaluate_access('property.create',
    'b0000000-0000-4000-8000-00000000000b'::uuid, null, null) into v;
  perform app.verify('12c a stranger is refused with the membership reason',
    (v->>'allowed') = 'false' and (v->>'reason') = 'NO_ACTIVE_MEMBERSHIP');

  select count(*) into n from public.audit_log
   where action = 'access_denied' and result = 'DENIED'
     and organization_id is null
     and metadata->>'reason' = 'NO_ACTIVE_MEMBERSHIP'
     and metadata->>'permission' = 'property.create';
  perform app.verify('12d the denial is in the trail, unattributed to the stranger''s tenant',
    n = 1);

  -- 12e — a member without the capability: a real PERMISSION_DENIED, recorded against
  -- THEIR own tenant, which is the row an operator needs to see.
  perform set_config('app.user_id', '00000000-0000-4000-8000-000000000003', true);
  select public.evaluate_access('property.create',
    'a0000000-0000-4000-8000-00000000000a'::uuid, null, null) into v;
  perform app.verify('12e a member lacking the permission is refused for the permission',
    (v->>'allowed') = 'false' and (v->>'reason') = 'PERMISSION_DENIED');

  select count(*) into n from public.audit_log
   where action = 'access_denied' and result = 'DENIED'
     and organization_id = 'a0000000-0000-4000-8000-00000000000a'
     and metadata->>'reason' = 'PERMISSION_DENIED';
  perform app.verify('12f and that denial is visible in the tenant''s own history', n = 1);

  -- 12g — the §18 chain reports its causes separately rather than all as "forbidden".
  select public.evaluate_access('outlet.edit',
    'a0000000-0000-4000-8000-00000000000a'::uuid,
    'b1000000-0000-4000-8000-000000000001'::uuid, null) into v;
  perform app.verify('12g a site outside the grant is named as such',
    (v->>'allowed') = 'false'
    and (v->>'reason') in ('PROPERTY_ACCESS_DENIED','PERMISSION_DENIED','NO_ACTIVE_MEMBERSHIP'));

  perform set_config('app.user_id', '00000000-0000-4000-8000-000000000005', true);
  select public.evaluate_access('outlet.view',
    'a0000000-0000-4000-8000-00000000000a'::uuid, null, null) into v;
  perform app.verify('12h a revoked-only member is refused at the grant step',
    (v->>'allowed') = 'false');
end;
$$;

-- 12i — the session bookkeeping, and §68: what must NEVER be in a log line.
set app.user_id to '00000000-0000-4000-8000-000000000001';

do $$
declare
  v jsonb;
  n integer;
begin
  select public.record_auth_event('sign_in', 'SUCCESS') into v;
  perform app.verify('12i a successful sign-in is recorded and stamps last login',
    (v->>'recorded') = 'true'
    and exists (select 1 from public.profiles
                 where id = '00000000-0000-4000-8000-000000000001'
                   and last_login_at is not null));

  select public.record_auth_event('sign_out', 'SUCCESS') into v;
  select count(*) into n from public.audit_log
   where action in ('auth_sign_in','auth_sign_out') and entity = 'session';
  perform app.verify('12j sign-in and sign-out are their own audit events', n = 2);

  -- The metadata is a whitelist by construction: event and result only. A token, an OTP,
  -- or a password could not get in, and this assertion is what keeps it that way when
  -- someone adds a column.
  select count(*) into n from public.audit_log
   where entity = 'session'
     and (metadata ? 'token' or metadata ? 'password' or metadata ? 'otp'
                   or metadata ? 'access_token' or metadata ? 'refresh_token');
  perform app.verify('12k no credential material is in a session audit row', n = 0);

  -- The vocabulary is a gate, not a suggestion: an unrecognised event or outcome is
  -- refused rather than written into the permanent trail.
  perform app.expect_denial('select public.record_auth_event(''teleport'', ''SUCCESS'')',
    'NIVAAS_INVALID_EVENT');
  perform app.expect_denial('select public.record_auth_event(''sign_in'', ''MAYBE'')',
    'NIVAAS_INVALID_RESULT');
end;
$$;

reset role;

-- 12l/12m — the outcome vocabulary is a CHECK, and the immutability wall still holds with
-- the new column in place (a table alteration does not reopen the door).
do $$
begin
  perform app.expect_denial(
    'insert into public.audit_log (action, entity, entity_id, result) '
    || 'values (''test_write'', ''test'', ''1'', ''MAYBE'')',
    'audit_log_result_check');

  perform app.expect_denial(
    'update public.audit_log set result = ''SUCCESS'' '
    || 'where id = (select min(id) from public.audit_log)',
    'NIVAAS_AUDIT_IMMUTABLE');

  -- A DENIED row is history, not a mutable flag: an operator cannot tidy a refusal away.
  perform app.expect_denial(
    'delete from public.audit_log where result = ''DENIED''',
    'NIVAAS_AUDIT_IMMUTABLE');
end;
$$;

-- ============================================================================
-- Scenario 13 — Prompt #03 §10/§29: a tenant defines its own role (011).
--
-- The Night Auditor from §10, end to end: invented by an administrator, limited to what
-- that administrator actually holds, invisible to the tenant next door, and unable to
-- reach the owner class.
-- ============================================================================

set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000001';

do $$
declare
  v       jsonb;
  v_audit jsonb;
  v_role  uuid;
  n       integer;
begin
  select public.create_role('a0000000-0000-4000-8000-00000000000a'::uuid,
    'NIGHT_AUDITOR', 'Night Auditor', 'closes the day and posts the night report',
    'ORGANIZATION', array['audit.view','property.view','role.view'],
    'the estate needs a night desk') into v;
  v_role := (v->>'roleId')::uuid;

  perform app.verify('13a a tenant role is created with the requested permissions',
    v_role is not null and (v->>'scope') = 'ORGANIZATION'
    and jsonb_array_length(v->'permissions') = 3);

  -- The two columns that make it a tenant role rather than a hidden administrator.
  select to_jsonb(r) into v_audit from public.roles r where id = v_role;
  perform app.verify('13b a custom role is neither system nor owner class, at the creator''s ceiling',
    (v_audit->>'is_system') = 'false' and (v_audit->>'owner_class') = 'false'
    and (v_audit->>'seniority')::int = 90
    and (v_audit->>'organization_id') = 'a0000000-0000-4000-8000-00000000000a');

  -- §29 — invent a permission nobody granted you and the door refuses before writing.
  perform app.expect_denial(
    'select public.create_role(''a0000000-0000-4000-8000-00000000000a''::uuid, '
    || '''SHADOW_ADMIN'', ''Shadow'', ''x'', ''ORGANIZATION'', '
    || '''{platform.manage,user.remove}''::text[], ''pretend to be the owner'')',
    'NIVAAS_ROLE_ABOVE_AUTHORITY');

  -- A GLOBAL-scope tenant role would be a platform administrator by another name.
  perform app.expect_denial(
    'select public.create_role(''a0000000-0000-4000-8000-00000000000a''::uuid, '
    || '''GLOBAL_THING'', ''Global'', ''x'', ''GLOBAL'', ''{role.view}''::text[], ''oops'')',
    'NIVAAS_ROLE_SCOPE_FORBIDDEN');

  -- The platform namespace is not a tenant's to reuse, and a duplicate inside the tenant
  -- comes back as the same readable code the pre-check would have given.
  perform app.expect_denial(
    'select public.create_role(''a0000000-0000-4000-8000-00000000000a''::uuid, '
    || '''ORG_OWNER'', ''Clone'', ''x'', ''ORGANIZATION'', ''{role.view}''::text[], ''clone'')',
    'NIVAAS_ROLE_NAME_TAKEN');
  perform app.expect_denial(
    'select public.create_role(''a0000000-0000-4000-8000-00000000000a''::uuid, '
    || '''NIGHT_AUDITOR'', ''Dup'', ''x'', ''ORGANIZATION'', ''{role.view}''::text[], ''twice'')',
    'NIVAAS_ROLE_NAME_TAKEN');
  perform app.expect_denial(
    'select public.create_role(''a0000000-0000-4000-8000-00000000000a''::uuid, '
    || '''EMPTY_ONE'', ''Empty'', ''x'', ''ORGANIZATION'', ''{}''::text[], ''nothing'')',
    'NIVAAS_EMPTY_SELECTION');

  -- §34: the whole permission list is in the trail, so "who gave this desk what" is
  -- answerable a year later without a snapshot of the UI.
  select count(*) into n from public.audit_log
   where action = 'role_created' and entity = 'role' and result = 'SUCCESS'
     and entity_id = v_role::text
     and "after"->'permissions' @> '["audit.view","property.view","role.view"]'::jsonb;
  perform app.verify('13c creating authority is audited with its full permission list', n = 1);

  -- Editing is how a role gets wider, so the same ceiling applies on the way up.
  perform app.expect_denial(
    'select public.set_role_permissions(''' || v_role || '''::uuid, '
    || '''{audit.view,user.remove,platform.manage}''::text[], ''widen the desk'')',
    'NIVAAS_ROLE_ABOVE_AUTHORITY');

  select public.set_role_permissions(v_role, array['audit.view','role.view'],
    'reports no longer read sites') into v;
  perform app.verify('13d a legitimate re-set replaces the whole list',
    jsonb_array_length(v->'permissions') = 2);

  -- And the role can be granted, at its own level, by someone who holds it.
  select public.assign_role('00000000-0000-4000-8000-000000000005'::uuid, 'NIGHT_AUDITOR',
    'a0000000-0000-4000-8000-00000000000a'::uuid, null, null, 'night desk') into v;
  perform app.verify('13e the custom role is grantable like any other', v ? 'grantId');

  -- Retiring it stops future grants (005/009 only resolve ACTIVE roles) and keeps the
  -- history readable.
  select public.set_role_status(v_role, 'INACTIVE', 'desk merged into the GM role') into v;
  perform app.expect_denial(
    'select public.assign_role(''00000000-0000-4000-8000-000000000003''::uuid, '
    || '''NIGHT_AUDITOR'', ''a0000000-0000-4000-8000-00000000000a''::uuid)',
    'NIVAAS_ROLE_NOT_FOUND');
  perform app.verify('13f a retired role takes no new grants and is not deleted',
    (select status from public.roles where id = v_role) = 'INACTIVE');

  -- The system catalogue is not tenant data: no tenant may rename or retire a role that
  -- exists everywhere.
  perform app.expect_denial(
    'select public.set_role_status('
    || '(select id from public.roles where name = ''ORG_OWNER'' and organization_id is null), '
    || '''INACTIVE'', ''remove the owner role'')',
    'NIVAAS_SYSTEM_ROLE_PROTECTED');
  perform app.expect_denial(
    'select public.update_role('
    || '(select id from public.roles where name = ''STAFF'' and organization_id is null), '
    || '''Everyone'', ''x'', ''confuse the platform'')',
    'NIVAAS_SYSTEM_ROLE_PROTECTED');

  -- §40: someone else's role ID does not exist here, so a probe cannot learn that it does.
  perform app.expect_denial(
    'select public.update_role(''' || v_role || '''::uuid, ''Not mine'', ''x'', ''probe'')',
    'NIVAAS_NOT_FOUND');
end;
$$;

-- 13g — the same name is a different role in the tenant next door (§10's scoping, which
-- 002's global unique constraint used to forbid).
reset role;
do $$
declare
  v_role uuid;
begin
  -- owner B needs a seat that can create roles; the invitation fixtures below own one.
  select id into v_role from public.roles where name = 'ORG_OWNER';
  insert into public.user_roles (user_id, role_id, organization_id, granted_by)
  values ('00000000-0000-4000-8000-000000000011', v_role,
          'b0000000-0000-4000-8000-00000000000b',
          '00000000-0000-4000-8000-000000000011');
end;
$$;

-- Tenant A's copy, captured from a superuser read so the probe below can hand the door a
-- REAL foreign id. Read as `authenticated`, RLS turns that subquery into a NULL and the
-- door would refuse for the wrong reason.
select id as na_a from public.roles
 where name = 'NIGHT_AUDITOR'
   and organization_id = 'a0000000-0000-4000-8000-00000000000a' \gset

set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000011';

-- Top-level statements because the captured id only interpolates outside a dollar-quoted
-- body, and this runs as `authenticated` with owner B's identity.
select public.create_role('b0000000-0000-4000-8000-00000000000b'::uuid,
  'NIGHT_AUDITOR', 'Night Auditor (Coastal)', 'their own night desk',
  'ORGANIZATION', array['audit.view'], 'second hotel, same job title') as na_b \gset

-- What tenant B can see of that name is exactly its own role.
select app.verify('13g a tenant sees only its own NIGHT_AUDITOR',
  (select count(*) from public.roles where name = 'NIGHT_AUDITOR') = 1
  and (select organization_id from public.roles
        where name = 'NIGHT_AUDITOR') = 'b0000000-0000-4000-8000-00000000000b'::uuid
  and :'na_b' is not null);

-- And tenant A's copy is still not reachable from tenant B. (`'''` around the interpolated
-- id: psql substitutes the variable's value, so the quotes belong to the statement.)
select app.expect_denial(
  'select public.set_role_permissions(''' || :'na_a' || '''::uuid, '
  || '''{audit.view}''::text[], ''steal'')',
  'NIVAAS_NOT_FOUND');

reset role;

-- The structural half: one name, two rows, two different tenants. §10's scoping is what
-- 002's global unique constraint used to forbid.
do $$
declare
  n integer;
  d integer;
begin
  select count(*), count(distinct organization_id) into n, d
    from public.roles where name = 'NIGHT_AUDITOR';
  perform app.verify('13g the job title is shared, the roles are not', n = 2 and d = 2);
end;
$$;

-- ============================================================================
-- Scenario 14 — Prompt #03 §7: the invitation lifecycle (012).
--
-- Hashing, expiry-on-accept and the address match were already proven by scenario 8. What
-- 012 adds is the parts that only matter under concurrency, under a suspension, or under
-- an attacker holding a valid-looking ID.
-- ============================================================================

do $$
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    ('00000000-0000-4000-8000-000000000006', 'stale@verify.local',   '{"full_name":"Stale Link"}'),
    ('00000000-0000-4000-8000-000000000007', 'suspended.org@verify.local', '{"full_name":"Frozen Estate"}'),
    ('00000000-0000-4000-8000-000000000008', 'retired.role@verify.local',  '{"full_name":"Retired Role"}'),
    ('00000000-0000-4000-8000-000000000009', 'gone.inviter@verify.local',  '{"full_name":"Gone Inviter"}'),
    ('00000000-0000-4000-8000-000000000010', 'cancel.or.revoke@verify.local', '{"full_name":"Cancel Or Revoke"}')
  on conflict (id) do nothing;

  -- A link that expired while nobody clicked it. Left as INVITED, it would hold the
  -- address's pending slot forever — which is the bug the new index would have hardened.
  insert into public.invitations (id, organization_id, email, role_id, token_hash,
                                  invited_by, status, expires_at)
  values ('d0000000-0000-4000-8000-000000000001',
          'a0000000-0000-4000-8000-00000000000a', 'dead.link@verify.local',
          (select id from public.roles where name = 'GENERAL_MANAGER'),
          'dead-link-hash-not-a-real-token', '00000000-0000-4000-8000-000000000001',
          'INVITED', now() - interval '1 hour');
end;
$$;

set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000001';

-- 14a — the sweep happens on the way in, so the address is inviteable again and the old
-- row is honestly marked. No client call, no cron, no queue (§60).
select (public.invite_member(
  'a0000000-0000-4000-8000-00000000000a'::uuid, 'dead.link@verify.local',
  'GENERAL_MANAGER', 'Dead Link', null,
  array['a1000000-0000-4000-8000-000000000001']::uuid[], '{}'::uuid[]) ->> 'invitationId')
  as reinvite_id \gset

do $$
declare
  n integer;
begin
  select count(*) into n from public.invitations
   where email = 'dead.link@verify.local' and status = 'EXPIRED';
  perform app.verify('14a an expired invitation is swept to EXPIRED, freeing the address', n = 1);
end;
$$;

-- 14b — the database, not the pre-check, is the one that refuses two live links. Written
-- as superuser so nothing but the index can possibly answer.
reset role;
do $$
begin
  perform app.expect_denial(
    'insert into public.invitations (organization_id, email, role_id, token_hash, invited_by, '
    || 'expires_at) values (''a0000000-0000-4000-8000-00000000000a'', '
    || '''dead.link@verify.local'', (select id from public.roles where name=''STAFF''), '
    || '''a-second-live-link'', ''00000000-0000-4000-8000-000000000001'', now() + interval ''1 day'')',
    'invitations_one_pending_idx');

  -- Case-insensitive by construction: citext, so `Dead.Link@…` is the same slot.
  perform app.expect_denial(
    'insert into public.invitations (organization_id, email, role_id, token_hash, invited_by, '
    || 'expires_at) values (''a0000000-0000-4000-8000-00000000000a'', '
    || '''DEAD.LINK@VERIFY.LOCAL'', (select id from public.roles where name=''STAFF''), '
    || '''a-case-twist'', ''00000000-0000-4000-8000-000000000001'', now() + interval ''1 day'')',
    'invitations_one_pending_idx');

  -- The same person may be invited again by the OTHER tenant: the slot is per tenant.
  insert into public.invitations (id, organization_id, email, role_id, token_hash,
                                  invited_by, expires_at)
  values ('d0000000-0000-4000-8000-000000000002',
          'b0000000-0000-4000-8000-00000000000b', 'dead.link@verify.local',
          (select id from public.roles where name = 'STAFF'), 'other-tenant-link',
          '00000000-0000-4000-8000-000000000011', now() + interval '1 day');
  raise notice 'PASS  14b one pending invitation per tenant per address, enforced by the index';
end;
$$;

-- 14c — a link whose clock has run out is refused on the accept path too, with its own
-- reason rather than a generic "not usable".
set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000001';

select (public.invite_member(
  'a0000000-0000-4000-8000-00000000000a'::uuid, 'stale@verify.local',
  'GENERAL_MANAGER', 'Stale Link', null,
  array['a1000000-0000-4000-8000-000000000001']::uuid[], '{}'::uuid[]) ->> 'token')
  as stale_tok \gset

reset role;
update public.invitations set expires_at = now() - interval '1 minute'
 where email = 'stale@verify.local' and status = 'INVITED';

set role authenticated;
select app.expect_denial('select public.accept_invitation(''' || :'stale_tok' || ''')',
                         'NIVAAS_INVITATION_EXPIRED');

-- 14d — a suspended estate cannot be joined through a link issued before the suspension.
set app.user_id to '00000000-0000-4000-8000-000000000001';
select (public.invite_member(
  'a0000000-0000-4000-8000-00000000000a'::uuid, 'suspended.org@verify.local',
  'GENERAL_MANAGER', 'Frozen Estate', null,
  array['a1000000-0000-4000-8000-000000000001']::uuid[], '{}'::uuid[]) ->> 'token')
  as frozen_tok \gset

select public.set_organization_status(
  'a0000000-0000-4000-8000-00000000000a'::uuid, 'SUSPENDED',
  'compliance review') as freeze \gset

set app.user_id to '00000000-0000-4000-8000-000000000007';
select app.expect_denial('select public.accept_invitation(''' || :'frozen_tok' || ''')',
                         'NIVAAS_ORGANIZATION_NOT_ACTIVE');

set app.user_id to '00000000-0000-4000-8000-000000000001';
select public.set_organization_status(
  'a0000000-0000-4000-8000-00000000000a'::uuid, 'ACTIVE',
  'review closed, estate reopened') as thaw \gset

-- 14e — a role retired after the invite went out cannot be re-minted through the link.
-- The invitation is the second door, and 011's retirement is what closes it: the seat the
-- offer named no longer exists as authority.
set app.user_id to '00000000-0000-4000-8000-000000000001';
select (public.create_role('a0000000-0000-4000-8000-00000000000a'::uuid,
  'VDGH_DAY_AUDITOR', 'Day Auditor', 'temporary desk for the accept test',
  'ORGANIZATION', array['audit.view','role.view'], 'created to be retired') ->> 'roleId')
  as day_role \gset

select (public.invite_member(
  'a0000000-0000-4000-8000-00000000000a'::uuid, 'retired.role@verify.local',
  'VDGH_DAY_AUDITOR', 'Retired Role', null, '{}'::uuid[], '{}'::uuid[]) ->> 'token')
  as retired_tok \gset

select public.set_role_status(:'day_role'::uuid, 'INACTIVE',
  'desk closed before it opened') as retire \gset

set app.user_id to '00000000-0000-4000-8000-000000000008';
select app.expect_denial('select public.accept_invitation(''' || :'retired_tok' || ''')',
                         'NIVAAS_INVITATION_NOT_USABLE');

-- 14f — and a link issued by someone who has since been removed from the tenant.
set app.user_id to '00000000-0000-4000-8000-000000000003';
select (public.invite_member(
  'a0000000-0000-4000-8000-00000000000a'::uuid, 'gone.inviter@verify.local',
  'STAFF', 'Gone Inviter', null, '{}'::uuid[],
  array['a2000000-0000-4000-8000-000000000001']::uuid[]) ->> 'token') as ghost_tok \gset

set app.user_id to '00000000-0000-4000-8000-000000000001';
select public.set_member_status(
  (select m.id from public.organization_memberships m
    where m.user_id = '00000000-0000-4000-8000-000000000003'),
  'REMOVED', 'left the estate') as remove_chef \gset

set app.user_id to '00000000-0000-4000-8000-000000000009';
select app.expect_denial('select public.accept_invitation(''' || :'ghost_tok' || ''')',
                         'NIVAAS_INVITATION_NOT_USABLE');

-- §6: the removal itself is what the server now believes, with no cache in the way. Read
-- from the tenant side (003 lets a member see its own grants), not from the removed seat.
set app.user_id to '00000000-0000-4000-8000-000000000001';

do $$
declare
  n integer;
begin
  select count(*) into n from public.user_roles
   where user_id = '00000000-0000-4000-8000-000000000003' and revoked_at is null;
  perform app.verify('14g a removed member''s live link confers nothing and their grants are gone',
    n = 0);
end;
$$;

-- 14h/14i — CANCELLED and REVOKED are now different facts, decided by who is asking. The
-- GM issues the link; the owner withdraws it, which is a revocation and not a cancellation.
set app.user_id to '00000000-0000-4000-8000-000000000002';
select (public.invite_member(
  'a0000000-0000-4000-8000-00000000000a'::uuid, 'cancel.or.revoke@verify.local',
  'STAFF', 'Cancel Or Revoke', null, '{}'::uuid[],
  array['a2000000-0000-4000-8000-000000000001']::uuid[]) ->> 'invitationId') as gm_inv \gset

set app.user_id to '00000000-0000-4000-8000-000000000001';
select public.cancel_invitation(:'gm_inv'::uuid,
  'the desk was filled internally') ->> 'status' as gm_cancel \gset

select (public.invite_member(
  'a0000000-0000-4000-8000-00000000000a'::uuid, 'owner.pull@verify.local',
  'STAFF', 'Owner Pull', null, '{}'::uuid[],
  array['a2000000-0000-4000-8000-000000000001']::uuid[]) ->> 'invitationId') as own_inv \gset

select public.cancel_invitation(:'own_inv'::uuid,
  'issued in error') ->> 'status' as own_cancel \gset

do $$
declare
  n integer;
begin
  select count(*) into n from public.invitations
   where email = 'cancel.or.revoke@verify.local' and status = 'REVOKED';
  perform app.verify('14h an administrator withdrawing someone else''s link REVOKES it', n = 1);

  select count(*) into n from public.audit_log
   where action = 'member_invitation_revoked' and result = 'SUCCESS';
  perform app.verify('14i the revocation is its own audited event', n = 1);

  select count(*) into n from public.invitations
   where email = 'owner.pull@verify.local' and status = 'CANCELLED';
  perform app.verify('14j the inviter withdrawing their own link CANCELS it', n = 1);

  select count(*) into n from public.audit_log
   where action = 'member_invitation_cancelled' and result = 'SUCCESS';
  perform app.verify('14k and the cancellation is recorded separately', n = 1);

  -- §40: an invitation ID from a tenant you are not in does not exist. The id is literal
  -- because reading it back through RLS would return nothing, and a NULL argument would
  -- pass this assertion for the wrong reason.
  perform app.expect_denial(
    'select public.cancel_invitation(''d0000000-0000-4000-8000-000000000002''::uuid, '
    || '''probe a foreign invitation'')',
    'NIVAAS_NOT_FOUND');
end;
$$;

reset role;

-- ============================================================================
-- Scenario 15 — Prompt #04 §5-§17: the restaurant permission ladder and the menu
-- domain (013 + 014).
--
-- Everything Prompt #04 delivers that is not an order line is exercised here: the 27
-- new tokens and the seats that hold them, the menu/category/item/modifier/price tables,
-- the write doors, and the order-time read helper. These are the assertions that would
-- have failed if 013 had quietly handed a kitchen manager the till, or if 014 had priced
-- with a mutable column, a float, or a read path that leaks existence to a stranger.
--
-- The personas are data-driven: each is given a SYSTEM role at the scope an operator
-- would choose, and nothing here asks a door to trust a role NAME. The ladder is proven
-- only through what app.has_permission resolves for each seat's actual grants.
-- ============================================================================

-- 15.0 — fixtures, written as superuser because the doors are themselves under test:
-- a row inserted through a door would succeed or fail for the door's reasons, not the
-- isolation rule's. Two things are added beyond the personas so the property boundary
-- and the cross-tenant rule each have a real target: a second site INSIDE the estate
-- (Deccan Banquet), and one menu in the foreign tenant whose id is a literal.
reset role;
do $$
declare
  v_role uuid;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    ('00000000-0000-4000-8000-0000000000ac', 'menu.staff@verify.local',    '{"full_name":"Floor Staff"}'),
    ('00000000-0000-4000-8000-0000000000ad', 'menu.kitchen@verify.local',  '{"full_name":"Kitchen Chief"}'),
    ('00000000-0000-4000-8000-0000000000ae', 'menu.rm.main@verify.local',  '{"full_name":"Dining Manager"}'),
    ('00000000-0000-4000-8000-0000000000af', 'menu.rm.roof@verify.local',  '{"full_name":"Rooftop Manager"}'),
    ('00000000-0000-4000-8000-0000000000b0', 'menu.rm.banq@verify.local',  '{"full_name":"Banquet Manager"}')
  on conflict (id) do nothing;

  -- A second property inside the SAME organization, so a cross-property probe tests the
  -- property wall and is not secretly a cross-tenant one.
  insert into public.properties (id, organization_id, name, code, slug, property_type,
    status, city, state, country, timezone, currency, locale)
  values ('a1000000-0000-4000-8000-0000000000a2', 'a0000000-0000-4000-8000-00000000000a',
    'Deccan Banquet', 'VDGH-BANQ-01', 'deccan-banquet', 'BANQUET', 'ACTIVE',
    'Pune', 'Maharashtra', 'IN', 'Asia/Kolkata', 'INR', 'en-IN')
  on conflict (id) do nothing;

  insert into public.outlets (id, organization_id, property_id, name, code, slug, outlet_type, status)
  values ('a2000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-00000000000a',
    'a1000000-0000-4000-8000-0000000000a2', 'Banquet Hall', 'VDGH-OUT-09', 'banquet-hall',
    'BANQUET', 'ACTIVE')
  on conflict (id) do nothing;

  -- Every seat is an ACTIVE member of the estate; only their breadth differs.
  insert into public.organization_memberships (user_id, organization_id, status, is_owner, joined_at)
  values
    ('00000000-0000-4000-8000-0000000000ac', 'a0000000-0000-4000-8000-00000000000a', 'ACTIVE', false, now()),
    ('00000000-0000-4000-8000-0000000000ad', 'a0000000-0000-4000-8000-00000000000a', 'ACTIVE', false, now()),
    ('00000000-0000-4000-8000-0000000000ae', 'a0000000-0000-4000-8000-00000000000a', 'ACTIVE', false, now()),
    ('00000000-0000-4000-8000-0000000000af', 'a0000000-0000-4000-8000-00000000000a', 'ACTIVE', false, now()),
    ('00000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-00000000000a', 'ACTIVE', false, now())
  on conflict do nothing;

  -- Staff, kitchen chief and the dining manager span the Main property; the rooftop
  -- manager is carved to one outlet; the banquet manager to the OTHER property.
  insert into public.membership_property_access (user_id, organization_id, property_id, mode)
  values
    ('00000000-0000-4000-8000-0000000000ac', 'a0000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-000000000001', 'SELECTED_PROPERTIES'),
    ('00000000-0000-4000-8000-0000000000ad', 'a0000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-000000000001', 'SELECTED_PROPERTIES'),
    ('00000000-0000-4000-8000-0000000000ae', 'a0000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-000000000001', 'SELECTED_PROPERTIES'),
    ('00000000-0000-4000-8000-0000000000af', 'a0000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-000000000001', 'SELECTED_PROPERTIES'),
    ('00000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-0000000000a2', 'SELECTED_PROPERTIES')
  on conflict do nothing;

  -- The lone outlet carve-out: the rooftop manager reaches the rooftop and nothing else.
  insert into public.membership_outlet_access (user_id, organization_id, property_id, outlet_id, mode)
  values ('00000000-0000-4000-8000-0000000000af', 'a0000000-0000-4000-8000-00000000000a',
          'a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002', 'SELECTED_OUTLETS')
  on conflict do nothing;

  -- System roles at their natural scope; OUTLET seats get an outlet, no property.
  select id into v_role from public.roles where name = 'STAFF';
  insert into public.user_roles (user_id, role_id, organization_id, outlet_id)
  values ('00000000-0000-4000-8000-0000000000ac', v_role, 'a0000000-0000-4000-8000-00000000000a', 'a2000000-0000-4000-8000-000000000001')
  on conflict do nothing;

  select id into v_role from public.roles where name = 'KITCHEN_MANAGER';
  insert into public.user_roles (user_id, role_id, organization_id, outlet_id)
  values ('00000000-0000-4000-8000-0000000000ad', v_role, 'a0000000-0000-4000-8000-00000000000a', 'a2000000-0000-4000-8000-000000000001')
  on conflict do nothing;

  select id into v_role from public.roles where name = 'RESTAURANT_MANAGER';
  insert into public.user_roles (user_id, role_id, organization_id, outlet_id) values
    ('00000000-0000-4000-8000-0000000000ae', v_role, 'a0000000-0000-4000-8000-00000000000a', 'a2000000-0000-4000-8000-000000000001'),
    ('00000000-0000-4000-8000-0000000000af', v_role, 'a0000000-0000-4000-8000-00000000000a', 'a2000000-0000-4000-8000-000000000002'),
    ('00000000-0000-4000-8000-0000000000b0', v_role, 'a0000000-0000-4000-8000-00000000000a', 'a2000000-0000-4000-8000-00000000000a')
  on conflict do nothing;

  -- A whole menu in the FOREIGN estate, chain columns copied so 014's chain trigger is
  -- satisfied. Its item id is a literal the cross-tenant probe quotes: owner A cannot
  -- read it back through RLS, and a NULL argument would pass the probe for the wrong reason.
  insert into public.menus (id, organization_id, property_id, outlet_id, name, currency, status)
  values ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000b',
          'b1000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001',
          'Beach Raw Menu', 'INR', 'ACTIVE')
  on conflict (id) do nothing;
  insert into public.menu_items (id, organization_id, property_id, outlet_id, menu_id, name, item_code)
  values ('c1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000b',
          'b1000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001',
          'c0000000-0000-4000-8000-000000000001', 'Foreign Catch', 'BB-1')
  on conflict (id) do nothing;
end;
$$;

-- 15.1 — the owner builds the domain end to end. A menu arrives DRAFT (a menu is not
-- publishable the instant it is typed up); sections, an item, its first price and a
-- modifier group are written through the doors, and the order-time snapshot resolves them.
set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000001';

do $$
declare
  v_res    jsonb;
  v_menu   uuid;
  v_start  uuid;
  v_mains  uuid;
  v_item   uuid;
  v_group  uuid;
  n        integer;
begin
  -- 15.1a a menu is created unpublished.
  select public.create_menu('a2000000-0000-4000-8000-000000000001', 'Dinner Service', 'INR') into v_res;
  v_menu := (v_res ->> 'id')::uuid;
  perform app.verify('15.1a the owner creates a menu and it starts DRAFT',
    v_menu is not null and (v_res ->> 'status') = 'DRAFT' and (v_res ->> 'currency') = 'INR');

  -- 15.1b deterministic sections. display_order is the ordering guarantee, so two live
  -- sections cannot silently share a rank.
  select public.create_menu_category(v_menu, 'Starters', null, null, 1) into v_res;
  v_start := (v_res ->> 'id')::uuid;
  select public.create_menu_category(v_menu, 'Mains', null, null, 2) into v_res;
  v_mains := (v_res ->> 'id')::uuid;
  perform app.verify('15.1b two ordered sections are created',
    v_start is not null and v_mains is not null
    and (select count(*) from public.menu_categories where menu_id = v_menu) = 2);

  -- 15.1c an item arrives with its CURRENT price in the same write; there is no mutable
  -- base_price column to restate a past order with.
  select public.create_menu_item(v_menu, 'Paneer Tandoori', 280.00,
    p_category => v_start, p_item_code => 'PT-1', p_type => 'main_course',
    p_is_vegetarian => true, p_is_non_vegetarian => false) into v_res;
  v_item := (v_res ->> 'id')::uuid;
  perform app.verify('15.1c the item is created ACTIVE, available, and carries a current price row',
    v_item is not null and (v_res ->> 'status') = 'ACTIVE' and (v_res ->> 'is_available') = 'true'
    and exists (select 1 from public.menu_item_prices p
                 where p.menu_item_id = v_item and p.effective_to is null
                   and p.unit_price = 280.00 and p.currency = 'INR'));

  -- 15.1d a MULTIPLE group (0..2) plus a SINGLE group (1..1). The runtime "picked three of
  -- a two-option group" rule is an ORDER concern and deliberately not a row constraint, so
  -- the STATIC shape here is what is asserted.
  select public.create_modifier_group(v_item, 'Extras', 'MULTIPLE', 0, 2) into v_res;
  v_group := (v_res ->> 'id')::uuid;
  perform app.expect_denial(
    'select public.create_modifier_group(''' || v_item || '''::uuid, ''Bad Single'', '
    || '''SINGLE'', 0, 3)',
    'NIVAAS_INVALID_SELECTION_RANGE');
  -- The other half of the same static guard: a group that asks for more minimum selections
  -- than maximum is incoherent and must be refused before it can ever be ordered against.
  perform app.expect_denial(
    'select public.create_modifier_group(''' || v_item || '''::uuid, ''Backwards'', '
    || '''MULTIPLE'', 5, 2)',
    'NIVAAS_INVALID_SELECTION_RANGE');
  perform app.verify('15.1d a legal MULTIPLE group is created; a SINGLE(max 3) and a min>max group are refused',
    v_group is not null
    and not exists (select 1 from public.modifier_groups
                     where menu_item_id = v_item and name in ('Bad Single', 'Backwards')));

  perform public.create_modifier(v_group, 'Extra Paneer', 40.00, 1);
  perform public.create_modifier(v_group, 'No Onions', 0.00, 2);

  -- 15.1e the snapshot is the shape an order line freezes: name, code, the CURRENT price
  -- and currency, the lifecycle status, and every live modifier with its adjustment.
  select public.menu_snapshot(v_item) into v_res;
  perform app.verify('15.1e menu_snapshot exposes item name, code, exact price, currency and modifiers',
    (v_res ->> 'itemName') = 'Paneer Tandoori'
    and (v_res ->> 'itemCode') = 'PT-1'
    and (v_res ->> 'unitPrice') = '280.00'
    and (v_res ->> 'currency') = 'INR'
    and (v_res ->> 'itemStatus') = 'ACTIVE'
    and (v_res ->> 'availabilityStatus') = 'AVAILABLE'
    and jsonb_array_length(v_res -> 'modifierGroups') = 1
    and jsonb_array_length((v_res -> 'modifierGroups' -> 0 -> 'modifiers')) = 2
    and (v_res -> 'modifierGroups' -> 0 -> 'modifiers' -> 0 ->> 'priceAdjustment') = '40.00');

  -- 15.1f an ordinary content edit must not silently reprice or sell out: update_menu_item
  -- takes neither a price nor availability, so both survive the rename untouched.
  select public.update_menu_item(v_item, 'Paneer Tandoori Special', p_expected_version => 1) into v_res;
  perform app.verify('15.1f a content edit renames the item, leaves price and availability alone, and bumps the version',
    (v_res ->> 'name') = 'Paneer Tandoori Special'
    and (v_res ->> 'version') = '2'
    and (v_res ->> 'is_available') = 'true'
    and (select count(*) from public.menu_item_prices p
          where p.menu_item_id = v_item and p.effective_to is null and p.unit_price = 280.00) = 1);

  -- 15.1f2 the same door's optimistic lock: a caller who states a version that is no longer
  -- current is refused, not silently overwritten. Two editors of one item cannot clobber each
  -- other and neither can a client that cached version 1 after the row already moved to 2.
  perform app.expect_denial(
    'select public.update_menu_item(''' || v_item || '''::uuid, ''Stale rewrite'', '
    || 'p_expected_version => 1)',
    'NIVAAS_VERSION_CONFLICT');
  perform app.verify('15.1f2 a stale expected version is refused and rewrites nothing',
    (select name from public.menu_items where id = v_item) = 'Paneer Tandoori Special'
    and (select version from public.menu_items where id = v_item) = 2);

  -- 15.1g a protected write with no reason is refused, not guessed (§48).
  perform app.expect_denial(
    'select public.archive_menu_item(''' || v_item || '''::uuid, null)',
    'NIVAAS_REASON_REQUIRED');

  -- 15.1h money doctrine at the door: a third decimal is a domain refusal, never a silent
  -- round. The column is unconstrained numeric, so only the scale CHECK can catch this.
  perform app.expect_denial(
    'select public.set_menu_item_price(''' || v_item || '''::uuid, 10.005, '
    || 'p_reason => ''sub-rupee rounding test'')',
    'NIVAAS_INVALID_MONEY');

  -- 15.1i repricing is a NEW immutable history row: the old price is closed, a new one
  -- opened, and the current price resolves to the new row. The reason is mandatory because
  -- a price is a money decision.
  select public.set_menu_item_price(v_item, 300.00, p_reason => 'festive menu repricing') into v_res;
  perform app.verify('15.1i a reprice closes the old row and opens a new current row',
    (v_res ->> 'unit_price') = '300.00'
    and (select count(*) from public.menu_item_prices p
          where p.menu_item_id = v_item) = 2
    and (select count(*) from public.menu_item_prices p
          where p.menu_item_id = v_item and p.effective_to is not null) = 1);

  select public.menu_item_current_price(v_item) into v_res;
  perform app.verify('15.1j the current-price helper now reads the new open row',
    (v_res ->> 'unitPrice') = '300.00' and (v_res ->> 'currency') = 'INR');

  -- 15.1k the trail records the whole sequence, each action once.
  select count(distinct action) into n from public.audit_log
   where organization_id = 'a0000000-0000-4000-8000-00000000000a';
  perform app.verify('15.1k create/reorder-capable writes and the reprice are all in the trail',
    exists (select 1 from public.audit_log where action = 'menu_created' and result = 'SUCCESS')
    and exists (select 1 from public.audit_log where action = 'menu_item_created' and result = 'SUCCESS')
    and exists (select 1 from public.audit_log where action = 'menu_item_price_set' and result = 'SUCCESS')
    and n >= 5);
end;
$$;

-- 15.1l — capture the item and menu ids for the later isolation probes and the door
-- ordering tests. These run at psql top level because a \gset variable cannot be
-- interpolated into a dollar-quoted body; the cross-outlet/cross-tenant/cross-property
-- probes below quote them in a string, and reading them back through the probing role's
-- own RLS would return NULL and pass those probes for the wrong reason.
select id::text as main_item from public.menu_items where item_code = 'PT-1' \gset
select id::text as main_menu from public.menus where name = 'Dinner Service' \gset

-- 15.2 — the ladder bites. A floor staff member reads the menu but cannot build it, and
-- a kitchen manager flips availability but never touches the till or the archive. These
-- are the two refusals 013 exists to guarantee: menu.edit (the availability verb) is not
-- menu.create (the pricing verb), and neither is menu.publish.
set app.user_id to '00000000-0000-4000-8000-0000000000ac';   -- STAFF

do $$
declare
  v_menu uuid;
  v_item uuid;
  n      integer;
begin
  select menu_id, id into v_menu, v_item from public.menu_items where item_code = 'PT-1';
  select count(*) into n from public.menu_items;
  perform app.verify('15.2a staff can read the menu inside their own outlet', n > 0 and v_menu is not null);

  perform app.expect_denial(
    'select public.create_menu_item(''' || v_menu || '''::uuid, ''Ghost Item'', 99)',
    'NIVAAS_ACCESS_DENIED');
  perform app.expect_denial(
    'select public.set_menu_item_price(''' || v_item || '''::uuid, 199, p_reason => ''staff cannot price'')',
    'NIVAAS_ACCESS_DENIED');
  perform app.verify('15.2b staff build/refuse and price/refuse leave no rows',
    not exists (select 1 from public.menu_items where name = 'Ghost Item')
    and (select count(*) from public.menu_item_prices p
          where p.menu_item_id = v_item and p.effective_to is null and p.unit_price = 199) = 0);
end;
$$;

-- 15.3 — the kitchen manager. This is the one door they legitimately open (availability)
-- and the four they must never reach.
set app.user_id to '00000000-0000-4000-8000-0000000000ad';   -- KITCHEN_MANAGER

do $$
declare
  v_res  jsonb;
  v_menu uuid;
  v_item uuid;
  n      integer;
begin
  select menu_id, id into v_menu, v_item from public.menu_items where item_code = 'PT-1';

  -- 15.3a §10/§11: selling out is NOT retiring. One door flips availability, leaves the
  -- lifecycle status exactly where it was, and is audited under its own verb.
  select public.set_menu_item_availability(v_item, false) into v_res;
  perform app.verify('15.3a availability goes UNAVAILABLE while the lifecycle status stays ACTIVE',
    (v_res ->> 'is_available') = 'false'
    and (v_res ->> 'availability_status') = 'UNAVAILABLE'
    and (v_res ->> 'status') = 'ACTIVE');

  select count(*) into n from public.audit_log
   where action = 'menu_item_availability_changed' and entity_id = v_item::text and result = 'SUCCESS';
  perform app.verify('15.3b the availability flip is its own audited action verb', n = 1);

  -- 15.3c the pass, not the till. Kitchen manager cannot build, price, archive or publish.
  perform app.expect_denial(
    'select public.create_menu_item(''' || v_menu || '''::uuid, ''Kitchen Cannot'', 50)',
    'NIVAAS_ACCESS_DENIED');
  perform app.expect_denial(
    'select public.set_menu_item_price(''' || v_item || '''::uuid, 500, p_reason => ''kitchen cannot reprice'')',
    'NIVAAS_ACCESS_DENIED');
  perform app.expect_denial(
    'select public.archive_menu_item(''' || v_item || '''::uuid, ''kitchen cannot archive'')',
    'NIVAAS_ACCESS_DENIED');
  perform app.expect_denial(
    'select public.set_menu_status(''' || v_menu || '''::uuid, ''ACTIVE'', null)',
    'NIVAAS_ACCESS_DENIED');
end;
$$;

-- 15.4 — the restaurant manager at the SAME outlet proves the OUTLET-scope grants fire
-- when the door names the outlet: publish, create, reorder and the read snapshot all work
-- for a seat that is scoped to one restaurant, not to the whole estate.
set app.user_id to '00000000-0000-4000-8000-0000000000ae';   -- RESTAURANT_MANAGER @ Main Dining

do $$
declare
  v_res  jsonb;
  v_menu uuid;
  v_item uuid;
begin
  select menu_id, id into v_menu, v_item from public.menu_items where item_code = 'PT-1';

  -- 15.4a publishing is menu.publish, which the kitchen manager was refused moments ago.
  select public.set_menu_status(v_menu, 'ACTIVE') into v_res;
  perform app.verify('15.4a a restaurant manager publishes the menu (menu.publish)',
    (v_res ->> 'status') = 'ACTIVE');
  perform app.verify('15.4b the publish is audited as menu_published',
    exists (select 1 from public.audit_log
             where action = 'menu_published' and entity = 'menu'
               and entity_id = v_menu::text and result = 'SUCCESS'));

  -- 15.4c the read path resolves for an OUTLET-scoped seat only because the door checks
  -- the token at the item's own outlet. An organization-only check would deny this manager.
  select public.menu_snapshot(v_item) into v_res;
  perform app.verify('15.4c the outlet-scoped manager reads the order snapshot',
    (v_res ->> 'itemCode') = 'PT-1' and (v_res ->> 'unitPrice') = '300.00');

  -- 15.4d a new item through the same OUTLET-scope grant.
  select public.create_menu_item(v_menu, 'Butter Chicken', 420.00, p_item_code => 'BC-1') into v_res;
  perform app.verify('15.4d the outlet-scoped manager creates an item (menu.create at the outlet)',
    (v_res ->> 'item_code') = 'BC-1');
end;
$$;

-- 15.5 — the ordering rule. A dedicated menu keeps this test off Dinner Service. Two live
-- sections cannot share a display_order (the partial unique surfaces it as NIVAAS_ORDER_TAKEN),
-- a reorder must hand back the whole live set (NIVAAS_INVALID_REORDER), and a valid reorder
-- leaves ranks 1..n with no gap or collision.
set app.user_id to '00000000-0000-4000-8000-000000000001';   -- back to the owner

do $$
declare
  v_res   jsonb;
  v_menu  uuid;
  v_a     uuid;
  v_b     uuid;
  ord_a   integer;
  ord_b   integer;
begin
  select public.create_menu('a2000000-0000-4000-8000-000000000001', 'Order Test', 'INR') into v_res;
  v_menu := (v_res ->> 'id')::uuid;

  select public.create_menu_category(v_menu, 'Alpha', null, null, 5) into v_res;
  v_a := (v_res ->> 'id')::uuid;

  -- 15.5a a second live section colliding on display_order is refused by the index, whose
  -- domain code the door maps for us.
  perform app.expect_denial(
    'select public.create_menu_category(''' || v_menu || '''::uuid, ''Beta'', null, null, 5)',
    'NIVAAS_ORDER_TAKEN');

  -- 15.5b give Beta its own rank, then attempt a partial reorder (drops Gamma/Absolute set).
  select public.create_menu_category(v_menu, 'Beta', null, null, 6) into v_res;
  v_b := (v_res ->> 'id')::uuid;
  perform app.expect_denial(
    'select public.reorder_menu_categories(''' || v_menu || '''::uuid, '
    || 'array[''' || v_a || '''::uuid])',
    'NIVAAS_INVALID_REORDER');

  -- 15.5c a full reorder of both live sections writes ranks 1..2 deterministically.
  select public.reorder_menu_categories(v_menu, array[v_b, v_a]) into v_res;
  select display_order into ord_a from public.menu_categories where id = v_a;
  select display_order into ord_b from public.menu_categories where id = v_b;
  perform app.verify('15.5c a full swap renumbers the live sections 1..n with no collision',
    ord_a = 2 and ord_b = 1);
end;
$$;

-- 15.6 — isolation. The read policy and the doors must refuse the same rows, so that no
-- client can enumerate ids it cannot already see. Each probe distinguishes a FOREIGN tenant
-- (NIVAAS_NOT_FOUND — the stranger is never told the row exists) from a member who simply
-- lacks the capability (NIVAAS_ACCESS_DENIED, exercised above in 15.2/15.3).
--
-- A cross-tenant read leaks nothing: the door answers NOT_FOUND, and a direct SELECT under
-- RLS returns zero rows. The id is quoted from the top-level capture, and would pass for the
-- wrong reason if it were NULL, so the literal is load-bearing.
set app.user_id to '00000000-0000-4000-8000-000000000011';   -- OWNER B (foreign estate)

do $$
declare
  n integer;
begin
  -- The estate has its own menu row (the foreign target below), so "sees nothing" is the
  -- wrong claim and would pass for the wrong reason if RLS were simply broken. The isolation
  -- fact is: NONE of the visible rows belong to tenant A.
  select count(*) into n from public.menus
   where organization_id = 'a0000000-0000-4000-8000-00000000000a';
  perform app.verify('15.6a a foreign owner reads none of tenant A''s menus through RLS', n = 0);
  select count(*) into n from public.menu_items
   where organization_id = 'a0000000-0000-4000-8000-00000000000a';
  perform app.verify('15.6b and none of their items either', n = 0);
  -- …while their OWN estate's menu is visible, proving the wall is tenancy, not a dead policy.
  select count(*) into n from public.menus
   where organization_id = 'b0000000-0000-4000-8000-00000000000b';
  perform app.verify('15.6b2 the same owner does read their own estate''s menu', n = 1);
end;
$$;

-- Owner B reaching into tenant A's rows is a stranger, answered as NOT_FOUND not 403.
select app.expect_denial('select public.menu_snapshot(''' || :'main_item' || '''::uuid)',
                         'NIVAAS_NOT_FOUND');
select app.expect_denial('select public.update_menu_item(''' || :'main_item' || '''::uuid, ''Hijacked'')',
                         'NIVAAS_NOT_FOUND');

-- 15.6c — the mirror: owner A reaching into tenant B's foreign item is also invisible.
set app.user_id to '00000000-0000-4000-8000-000000000001';
select app.expect_denial('select public.menu_snapshot(''c1000000-0000-4000-8000-000000000001''::uuid)',
                         'NIVAAS_NOT_FOUND');

-- 15.6d — outlet isolation inside one estate: the rooftop manager cannot see Main Dining's
-- item, so the snapshot reports it as NOT_FOUND (matching the RLS read policy, which simply
-- hides the row), not as a capability denial.
set app.user_id to '00000000-0000-4000-8000-0000000000af';
do $$
declare
  n integer;
begin
  select count(*) into n from public.menu_items where item_code = 'PT-1';
  perform app.verify('15.6d a rooftop-only manager reads none of Main Dining''s items', n = 0);
end;
$$;
select app.expect_denial('select public.menu_snapshot(''' || :'main_item' || '''::uuid)',
                         'NIVAAS_NOT_FOUND');

-- 15.6e — property isolation inside one estate: the banquet manager (a member of the SAME
-- organization, but scoped to a different property) cannot read or reach Main Dining. This
-- is the property wall, not the tenant wall — the same estate, a different site.
set app.user_id to '00000000-0000-4000-8000-0000000000b0';
do $$
declare
  n integer;
begin
  select count(*) into n from public.menus;
  perform app.verify('15.6e a manager scoped to another property sees none of Main''s menus', n = 0);
end;
$$;
-- The snapshot of a Main item from another property is invisible (NOT_FOUND), mirroring the
-- read policy rather than leaking that the id is real.
select app.expect_denial('select public.menu_snapshot(''' || :'main_item' || '''::uuid)',
                         'NIVAAS_NOT_FOUND');
-- A write door, though, reaches the permission layer: the banquet manager IS a member of
-- the estate (so the row is not foreign), but their menu.create grant lives at their own
-- outlet and does not fire at Main Dining — a clean NIVAAS_ACCESS_DENIED, which is the
-- honest signal that a capable seat exists elsewhere in the tenant. The Main menu id is
-- quoted from the top-level capture because this role cannot read it back through its own RLS.
select app.expect_denial('select public.create_menu_item(''' || :'main_menu' || '''::uuid, ''Cross Property'', 10)',
                         'NIVAAS_ACCESS_DENIED');

-- 15.7 — the walls below the doors. These run as the table owner on purpose: 014 revokes
-- DML from the client role, so only a superuser can reach a constraint or index directly
-- and prove the database itself — not just the door — refuses it.
reset role;

do $$
declare
  v_item  uuid;
  v_menu  uuid;
  v_org   uuid;
  v_prop  uuid;
  v_out   uuid;
begin
  select id, menu_id, organization_id, property_id, outlet_id
    into v_item, v_menu, v_org, v_prop, v_out
    from public.menu_items where item_code = 'PT-1';

  -- 15.7a the current price is unique by INDEX, not by convention: a second open row for
  -- the same item is impossible even if a door were bypassed.
  perform app.expect_denial(
    'insert into public.menu_item_prices (organization_id, property_id, outlet_id, menu_id, '
    || 'menu_item_id, unit_price, currency, effective_to) values ('
    || quote_literal(v_org) || ', ' || quote_literal(v_prop) || ', ' || quote_literal(v_out) || ', '
    || quote_literal(v_menu) || ', ' || quote_literal(v_item) || ', 88.00, ''INR'', NULL)',
    'menu_item_prices_open_idx');

  -- 15.7b the money column is unconstrained numeric guarded by a scale CHECK, so an
  -- over-scale value reaches the constraint. numeric(10,2) would silently have rounded it
  -- to 100.00 and the whole doctrine of "reject excess scale" would be a lie.
  perform app.expect_denial(
    'insert into public.menu_item_prices (organization_id, property_id, outlet_id, menu_id, '
    || 'menu_item_id, unit_price, currency, effective_to) values ('
    || quote_literal(v_org) || ', ' || quote_literal(v_prop) || ', ' || quote_literal(v_out) || ', '
    || quote_literal(v_menu) || ', ' || quote_literal(v_item) || ', 99.999, ''INR'', now())',
    'menu_item_prices_money_ok');

  -- 15.7c but an exact decimal, however it is spelled, is stored losslessly. A trailing-zero
  -- value on a CLOSED row (so not the open one) must be accepted and normalized to 19.99.
  insert into public.menu_item_prices (organization_id, property_id, outlet_id, menu_id,
    menu_item_id, unit_price, currency, effective_to)
  values (v_org, v_prop, v_out, v_menu, v_item, '19.9900', 'INR', now() - interval '1 day');
  perform app.verify('15.7c a trailing-zero price is accepted losslessly (exact decimal, not a float)',
    exists (select 1 from public.menu_item_prices p
             where p.menu_item_id = v_item and p.unit_price = 19.99));
  delete from public.menu_item_prices
   where menu_item_id = v_item and unit_price = 19.99;
end;
$$;

reset role;

-- ============================================================================
-- Scenario 16 — Prompt #04 §18-§22: the restaurant floor (015).
--
-- Dining areas and tables, and the two decisions 015 exists to make. First, the floor is
-- exactly two levels deep: outlet → area → table, with no invented "floor" tier above the
-- section (§19 rejects a generic floor-management system, so there is one parent level and
-- one ordering per parent, never two). Second, and this is the assertion the whole file is
-- written for: a table's operational status is only PARTLY a human's to set. OCCUPIED and
-- RESERVED are absent from the column's CHECK vocabulary rather than merely discouraged, so
-- 16.3 and 16.9c are the tests that would fail if 015 had caved in and made table status a
-- string a screen can paint.
--
-- Everything else is scenario 15's doctrine applied to a new table pair: ancestors derived
-- from the parent and never from an argument, a partial unique index behind every "live"
-- rule, a full permutation behind every reorder, the tenant wall answering as NOT_FOUND, a
-- refusal that leaves no row, and a reason on everything that retires or restates.
-- ============================================================================

-- 16.0 — two fixtures the scenario must not have to earn. A PAUSED restaurant inside tenant
-- A, so "a write into a closed outlet" has a real target that no other scenario touches; and
-- one floor in the FOREIGN estate, so 16.8's "a stranger reads none of tenant A" is measured
-- against a policy that demonstrably works for the stranger's own rows.
reset role;
do $$
begin
  insert into public.outlets (id, organization_id, property_id, name, code, slug,
    outlet_type, status)
  values ('a2000000-0000-4000-8000-0000000000b1', 'a0000000-0000-4000-8000-00000000000a',
    'a1000000-0000-4000-8000-000000000001', 'Sunset Terrace', 'VDGH-OUT-11',
    'sunset-terrace', 'RESTAURANT', 'INACTIVE')
  on conflict (id) do nothing;

  -- Chain columns correct, because 015's own trigger audits a superuser the same way it
  -- audits a client: this fixture is written before the doors are, never through them.
  insert into public.dining_areas (id, organization_id, property_id, outlet_id, name,
    display_order)
  values ('d0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000b',
    'b1000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001',
    'Sand Floor', 0)
  on conflict (id) do nothing;

  insert into public.restaurant_tables (id, organization_id, property_id, outlet_id,
    area_id, name, code, capacity, display_order)
  values ('d1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000b',
    'b1000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000001', 'Table 1', 'BB-1', 4, 0)
  on conflict (id) do nothing;
end;
$$;

-- 16.1 — the sections. An area is created with an OUTLET id and no other scope argument, so
-- the tenant chain that comes back is the outlet's own, which is what makes the RLS predicate
-- in 015 sound rather than merely hopeful.
set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000001';   -- ORG OWNER A

do $$
declare
  v_res jsonb;
  v_a1  uuid;
  v_a2  uuid;
  n     integer;
begin
  select public.create_dining_area('a2000000-0000-4000-8000-000000000001',
    'Main Hall', 'Ground-floor section', 0) into v_res;
  v_a1 := (v_res ->> 'id')::uuid;
  perform app.verify('16.1a an area''s chain is read off the outlet it was made in, not off an argument',
    v_a1 is not null
    and (v_res ->> 'organization_id') = 'a0000000-0000-4000-8000-00000000000a'
    and (v_res ->> 'property_id')     = 'a1000000-0000-4000-8000-000000000001'
    and (v_res ->> 'outlet_id')       = 'a2000000-0000-4000-8000-000000000001'
    and (v_res ->> 'name') = 'Main Hall'
    and (v_res ->> 'description') = 'Ground-floor section'
    and (v_res ->> 'status') = 'ACTIVE' and (v_res ->> 'display_order') = '0'
    and (v_res ->> 'version') = '1' and (v_res ->> 'archived_at') is null);

  -- 16.1b an unranked section joins the END of the map. Defaulting it to 0 would collide with
  -- the first section every restaurant already has, so "no rank stated" is not "rank zero".
  select public.create_dining_area('a2000000-0000-4000-8000-000000000001', 'Garden Seats') into v_res;
  v_a2 := (v_res ->> 'id')::uuid;
  perform app.verify('16.1b an unranked section appends after the live ones',
    v_a2 is not null and (v_res ->> 'display_order') = '1');

  -- 16.1c the two live-uniqueness walls and the name rule, each with its own domain code.
  perform app.expect_denial(
    'select public.create_dining_area(''a2000000-0000-4000-8000-000000000001''::uuid, ''Main Hall'')',
    'NIVAAS_AREA_TAKEN');
  perform app.expect_denial(
    'select public.create_dining_area(''a2000000-0000-4000-8000-000000000001''::uuid, '
    || '''Patio'', null, 0)',
    'NIVAAS_AREA_ORDER_TAKEN');
  perform app.expect_denial(
    'select public.create_dining_area(''a2000000-0000-4000-8000-000000000001''::uuid, ''X'')',
    'NIVAAS_INVALID_NAME');

  select count(*) into n from public.dining_areas
   where outlet_id = 'a2000000-0000-4000-8000-000000000001' and status <> 'ARCHIVED';
  perform app.verify('16.1c the duplicate-name, duplicate-rank and short-name refusals leave two live sections',
    n = 2);
end;
$$;

-- 16.2 — the covers. A table is created INSIDE an area, so the area supplies the outlet, the
-- property and the organization; and 015's split scopes are proven here — `code` is an OUTLET
-- rule because it is what an order, a KOT and a bill print, while `name` is an AREA rule
-- because it is what the floor map draws.
do $$
declare
  v_res   jsonb;
  v_hall  uuid;
  v_garden uuid;
  v_t1    uuid;
  v_t2    uuid;
  v_other uuid;
  n       integer;
begin
  select id into v_hall   from public.dining_areas where name = 'Main Hall';
  select id into v_garden from public.dining_areas where name = 'Garden Seats';

  select public.create_restaurant_table(v_hall, 'Table 1', 'T01', 4, 'ROUND', 120.5, 88, 0) into v_res;
  v_t1 := (v_res ->> 'id')::uuid;
  perform app.verify('16.2a a cover''s chain comes off its AREA; it starts ACTIVE/AVAILABLE with drawable geometry',
    v_t1 is not null
    and (v_res ->> 'organization_id') = 'a0000000-0000-4000-8000-00000000000a'
    and (v_res ->> 'property_id')     = 'a1000000-0000-4000-8000-000000000001'
    and (v_res ->> 'outlet_id')       = 'a2000000-0000-4000-8000-000000000001'
    and (v_res ->> 'area_id') = v_hall::text
    and (v_res ->> 'status') = 'ACTIVE' and (v_res ->> 'service_status') = 'AVAILABLE'
    and (v_res ->> 'capacity') = '4' and (v_res ->> 'shape') = 'ROUND'
    and (v_res ->> 'position_x') = '120.5' and (v_res ->> 'display_order') = '0'
    and (v_res ->> 'version') = '1');

  -- 16.2b two sections may each open with a "Table 1" …
  select public.create_restaurant_table(v_garden, 'Table 1', 'T21', 2) into v_res;
  v_other := (v_res ->> 'id')::uuid;
  perform app.verify('16.2b two areas may each hold a table called "Table 1"',
    v_other is not null and (v_res ->> 'area_id') = v_garden::text
    and (v_res ->> 'display_order') = '0');

  -- …but one outlet may not hold the same CODE twice, whichever section it sits in, and one
  -- section may not hold the same name twice. Both arrive as the same refusal because the
  -- operator's problem is identical: that cover is already called that.
  perform app.expect_denial(
    'select public.create_restaurant_table(''' || v_garden || '''::uuid, ''Second Try'', ''T01'', 4)',
    'NIVAAS_TABLE_TAKEN');
  perform app.expect_denial(
    'select public.create_restaurant_table(''' || v_hall || '''::uuid, ''Table 1'', ''T55'', 4)',
    'NIVAAS_TABLE_TAKEN');

  -- 16.2c the field rules, one domain code per box a screen can get wrong.
  perform app.expect_denial(
    'select public.create_restaurant_table(''' || v_hall || '''::uuid, ''No Covers'', ''T56'', 0)',
    'NIVAAS_INVALID_CAPACITY');
  perform app.expect_denial(
    'select public.create_restaurant_table(''' || v_hall || '''::uuid, ''Bad Code'', ''-T7'', 4)',
    'NIVAAS_INVALID_TABLE_CODE');
  perform app.expect_denial(
    'select public.create_restaurant_table(''' || v_hall || '''::uuid, ''Hexagon'', ''T57'', 4, ''HEXAGON'')',
    'NIVAAS_INVALID_SHAPE');
  -- Geometry is drawn, not billed: the sanity bound is a range, and there is deliberately no
  -- money-scale CHECK on it (015's header says why).
  perform app.expect_denial(
    'select public.create_restaurant_table(''' || v_hall || '''::uuid, ''Off Canvas'', ''T58'', 4, '
    || '''OTHER'', 99999, 0)',
    'NIVAAS_INVALID_POSITION');

  -- 16.2d a second cover, unranked, joins the end of its own section.
  select public.create_restaurant_table(v_hall, 'Table 2', 'T02', 2, 'SQUARE', 140, 88) into v_res;
  v_t2 := (v_res ->> 'id')::uuid;
  perform app.verify('16.2d an unranked cover appends inside its area, not across the outlet',
    v_t2 is not null and (v_res ->> 'display_order') = '1');

  -- 16.2e every floor write so far is in the tenant's own trail, and the refusals above left
  -- neither a row nor a hole in it.
  select count(*) into n from public.audit_log
   where action in ('dining_area_created', 'restaurant_table_created') and result = 'SUCCESS'
     and outlet_id = 'a2000000-0000-4000-8000-000000000001';
  perform app.verify('16.2e two sections and three covers are all audited as SUCCESS', n = 5);
  select count(*) into n from public.restaurant_tables where code in ('T55','T56','T57','T58');
  perform app.verify('16.2f a refused floor write leaves no row', n = 0);
end;
$$;

-- 16.3 — THE wall. §20 asks for table status derived from live orders and reservations "rather
-- than becoming an uncontrolled manually edited status", and contract §7 says a person sets
-- only the genuinely manual states. 015 made that structural instead of aspirational, so these
-- are the assertions the migration exists to satisfy.
do $$
declare
  v_res jsonb;
  v_t1  uuid;
  n     integer;
begin
  select id into v_t1 from public.restaurant_tables where code = 'T01';

  -- 16.3a the door refuses the WORD before it reads the row, before it asks for a reason, and
  -- before it checks who is calling. The first probe deliberately hands it a NULL reason: if
  -- the vocabulary check had been parked after the reason check, this would come back
  -- NIVAAS_REASON_REQUIRED and the order — which is the security property — would have silently
  -- reversed. Nothing here can be reached by argument order luck.
  perform app.expect_denial(
    'select public.set_table_service_status(''' || v_t1 || '''::uuid, ''OCCUPIED'', null)',
    'NIVAAS_INVALID_STATUS');
  perform app.expect_denial(
    'select public.set_table_service_status(''' || v_t1 || '''::uuid, ''RESERVED'', ''a reservation exists'')',
    'NIVAAS_INVALID_STATUS');
  -- And neither derived state can be smuggled in through the ordinary edit door, which takes
  -- no status parameter at all: 16.6e proves the value survives a content edit unchanged.
  perform app.verify('16.3a OCCUPIED and RESERVED were never written',
    (select service_status from public.restaurant_tables where id = v_t1) = 'AVAILABLE');

  -- 16.3b a manual state writes, bumps the version, and leaves the lifecycle column alone —
  -- "the cleaners are on it" is not the same statement as "this cover is retired" (§7).
  select public.set_table_service_status(v_t1, 'CLEANING', 'spilled service, wiping down') into v_res;
  perform app.verify('16.3b CLEANING is written, versioned, and keeps the cover ACTIVE',
    (v_res ->> 'service_status') = 'CLEANING' and (v_res ->> 'status') = 'ACTIVE'
    and (v_res ->> 'version') = '2' and (v_res ->> 'archived_at') is null);

  select count(*) into n from public.audit_log a
   where a.action = 'table_service_status_changed' and a.entity_id = v_t1::text
     and a.result = 'SUCCESS' and a.reason = 'spilled service, wiping down'
     and (a."before" ->> 'serviceStatus') = 'AVAILABLE'
     and (a."after"  ->> 'serviceStatus') = 'CLEANING';
  perform app.verify('16.3c the change is its own audited action, with the reason and both sides', n = 1);

  -- 16.3d OUT_OF_SERVICE is the other human fact; and a status change without an explanation
  -- is refused rather than guessed at (§48) — the reason requirement is what keeps a cover from
  -- disappearing from the map for a reason nobody wrote down.
  select public.set_table_service_status(v_t1, 'OUT_OF_SERVICE', 'a leg is broken') into v_res;
  perform app.verify('16.3d OUT_OF_SERVICE is settable, and is audited with its reason',
    (v_res ->> 'service_status') = 'OUT_OF_SERVICE'
    and exists (select 1 from public.audit_log where action = 'table_service_status_changed'
                 and entity_id = v_t1::text and reason = 'a leg is broken'));
  perform app.expect_denial(
    'select public.set_table_service_status(''' || v_t1 || '''::uuid, ''AVAILABLE'', null)',
    'NIVAAS_REASON_REQUIRED');

  select public.set_table_service_status(v_t1, 'AVAILABLE', 'fixed and back on the floor') into v_res;
  perform app.verify('16.3e the cover returns to AVAILABLE, so 16.4 can retire the section around it',
    (v_res ->> 'service_status') = 'AVAILABLE' and (v_res ->> 'version') = '4');
end;
$$;

-- 16.4 — retirement, in the only order that is allowed. §78 of #04 is that history must still be
-- able to name the cover an order was served on, so nothing here deletes: children retire first,
-- the parent follows, and the parent is refused while anything still trades on it. A separate
-- section on the Rooftop carries this so Main Dining's live set stays intact for 16.5.
do $$
declare
  v_res  jsonb;
  v_deck uuid;
  v_t90  uuid;
  v_re   uuid;
begin
  select public.create_dining_area('a2000000-0000-4000-8000-000000000002', 'Skyline Deck') into v_res;
  v_deck := (v_res ->> 'id')::uuid;
  select public.create_restaurant_table(v_deck, 'Table 1', 'T90', 8, 'OVAL') into v_res;
  v_t90 := (v_res ->> 'id')::uuid;

  -- A protected close without an explanation is refused before the floor is examined at all.
  perform app.expect_denial(
    'select public.archive_dining_area(''' || v_deck || '''::uuid, null)',
    'NIVAAS_REASON_REQUIRED');
  -- …and with one, it is still refused, because an archived parent with live children is the
  -- orphan a chain trigger exists to prevent and a floor map would have to invent a place for.
  perform app.expect_denial(
    'select public.archive_dining_area(''' || v_deck || '''::uuid, ''closing the deck'')',
    'NIVAAS_AREA_NOT_EMPTY');

  -- A cover the floor is not standing behind cannot be retired either. Today the two manual
  -- facts say so; 016 adds the louder one (an OPEN order on this table), and 015 comments
  -- exactly where that check joins this door.
  select public.set_table_service_status(v_t90, 'CLEANING', 'mopping after the wind') into v_res;
  perform app.expect_denial(
    'select public.archive_restaurant_table(''' || v_t90 || '''::uuid, ''not while it is being wiped'')',
    'NIVAAS_TABLE_IN_USE');

  select public.set_table_service_status(v_t90, 'AVAILABLE', 'deck is dry') into v_res;
  select public.archive_restaurant_table(v_t90, 'sun loungers replaced this cover') into v_res;
  perform app.verify('16.4b archiving retires the row rather than deleting it',
    (v_res ->> 'status') = 'ARCHIVED' and (v_res ->> 'archived_at') is not null
    and exists (select 1 from public.restaurant_tables where id = v_t90));

  -- 16.4c once the last live cover is gone the section closes, and a retired section takes no
  -- new cover: history may name it, a map may not grow it.
  select public.archive_dining_area(v_deck, 'the deck is now only plants') into v_res;
  perform app.verify('16.4c the area archives once its last cover is retired',
    (v_res ->> 'status') = 'ARCHIVED' and (v_res ->> 'archived_at') is not null
    and (v_res ->> 'version') = '2');
  perform app.expect_denial(
    'select public.create_restaurant_table(''' || v_deck || '''::uuid, ''Ghost Cover'', ''T91'', 4)',
    'NIVAAS_AREA_UNAVAILABLE');

  -- 16.4d a retired cover takes no further edits, operational or otherwise — the two columns
  -- are separate facts, and BOTH now refuse, not one of them.
  perform app.expect_denial(
    'select public.set_table_service_status(''' || v_t90 || '''::uuid, ''OUT_OF_SERVICE'', ''rotten leg'')',
    'NIVAAS_ARCHIVED');
  perform app.expect_denial(
    'select public.update_restaurant_table(''' || v_t90 || '''::uuid, p_capacity => 6)',
    'NIVAAS_ARCHIVED');

  -- 16.4e the archived section's NAME is free again, because every one of these walls is a
  -- partial unique over live rows. This is also the live section that 16.6 uses as the
  -- cross-outlet move target.
  select public.create_dining_area('a2000000-0000-4000-8000-000000000002', 'Skyline Deck') into v_res;
  v_re := (v_res ->> 'id')::uuid;
  perform app.verify('16.4e reusing an archived section name is allowed, and it starts live again',
    v_re is not null and v_re <> v_deck and (v_res ->> 'status') = 'ACTIVE'
    and (v_res ->> 'display_order') = '0');
end;
$$;

-- 16.5 — §21's ordering rule. A reorder is a FULL permutation of one parent's live set or it is
-- refused outright: 015 never patches a partial list into a guess, because a floor map that
-- silently re-numbered the sections nobody mentioned is exactly the drift the rule exists to stop.
do $$
declare
  v_res  jsonb;
  v_list text;
  v_a1   uuid;
  v_a2   uuid;
  v_deck uuid;
  v_t1   uuid;
  v_t2   uuid;
begin
  select id into v_a1   from public.dining_areas where name = 'Main Hall';
  select id into v_a2   from public.dining_areas where name = 'Garden Seats' and status = 'ACTIVE';
  select id into v_deck from public.dining_areas
   where name = 'Skyline Deck' and status = 'ACTIVE';
  select id into v_t1 from public.restaurant_tables where code = 'T01';
  select id into v_t2 from public.restaurant_tables where code = 'T02';

  -- 16.5a every shape of "almost" is refused, and the JSON list is the door's own surface: a
  -- missing element, a repeated one, a value that is not an id at all, one from another floor,
  -- and the empty list that would flatten the map. The payloads are built with
  -- jsonb_build_array so the quoting is the database's, not this file's guess at it.
  perform app.expect_denial(
    'select public.reorder_dining_areas(''a2000000-0000-4000-8000-000000000001''::uuid, '
    || quote_literal(jsonb_build_array(v_a1::text)::text) || '::jsonb)',
    'NIVAAS_INVALID_PERMUTATION');
  perform app.expect_denial(
    'select public.reorder_dining_areas(''a2000000-0000-4000-8000-000000000001''::uuid, '
    || quote_literal(jsonb_build_array(v_a1::text, v_a1::text)::text) || '::jsonb)',
    'NIVAAS_INVALID_PERMUTATION');
  perform app.expect_denial(
    'select public.reorder_dining_areas(''a2000000-0000-4000-8000-000000000001''::uuid, '
    || quote_literal('["not-a-uuid"]') || '::jsonb)',
    'NIVAAS_INVALID_PERMUTATION');
  -- A section from the Rooftop is not this outlet's to order, even handed over in a full list.
  perform app.expect_denial(
    'select public.reorder_dining_areas(''a2000000-0000-4000-8000-000000000001''::uuid, '
    || quote_literal(jsonb_build_array(v_a1::text, v_deck::text)::text) || '::jsonb)',
    'NIVAAS_INVALID_PERMUTATION');
  perform app.expect_denial(
    'select public.reorder_dining_areas(''a2000000-0000-4000-8000-000000000001''::uuid, '
    || quote_literal('[]') || '::jsonb)',
    'NIVAAS_INVALID_PERMUTATION');

  -- 16.5b the same rule one level down, over the covers of one section.
  perform app.expect_denial(
    'select public.reorder_restaurant_tables(''' || v_a1 || '''::uuid, '
    || quote_literal(jsonb_build_array(v_t1::text)::text) || '::jsonb)',
    'NIVAAS_INVALID_PERMUTATION');
  perform app.expect_denial(
    'select public.reorder_restaurant_tables(''' || v_a1 || '''::uuid, '
    || quote_literal(jsonb_build_array(v_t1::text, v_t1::text)::text) || '::jsonb)',
    'NIVAAS_INVALID_PERMUTATION');

  -- 16.5c a valid full swap of the sections. The rewrite is two-phase (every live row to a
  -- distinct negative, then to its final rank) precisely so the partial unique
  -- (outlet_id, display_order) is satisfied by EVERY statement — a single-pass swap would
  -- momentarily put two sections on the same rank and die on its own index.
  v_list := jsonb_build_array(v_a2::text, v_a1::text)::text;
  select public.reorder_dining_areas('a2000000-0000-4000-8000-000000000001', v_list::jsonb) into v_res;
  perform app.verify('16.5c a full section reorder hands back the new map in order',
    jsonb_array_length(v_res -> 'order') = 2
    and (v_res -> 'order' -> 0 ->> 'displayOrder') = '0'
    and (v_res -> 'order' -> 0 ->> 'id') = v_a2::text
    and (v_res -> 'order' -> 1 ->> 'displayOrder') = '1');
  perform app.verify('16.5d the sections now occupy ranks 0..n-1 with no gap and no collision',
    (select array_agg(display_order order by display_order) from public.dining_areas
      where outlet_id = 'a2000000-0000-4000-8000-000000000001' and status <> 'ARCHIVED') = array[0, 1]);

  -- 16.5e covers too, and the reorder is a rank write per row, so each row's version moves.
  v_list := jsonb_build_array(v_t2::text, v_t1::text)::text;
  select public.reorder_restaurant_tables(v_a1, v_list::jsonb) into v_res;
  perform app.verify('16.5e a full cover reorder renumbers its section 0..n-1 and bumps versions',
    (select array_agg(display_order order by display_order) from public.restaurant_tables
      where area_id = v_a1 and status <> 'ARCHIVED') = array[0, 1]
    -- one create, three status writes and now the reorder: 1 → 5, each write accounted for.
    and (select version from public.restaurant_tables where id = v_t1) = 5);

  -- 16.5f the reorder is audited once per call, against the parent it resequenced.
  perform app.verify('16.5f both reorders are audited against their parent, not per row',
    exists (select 1 from public.audit_log where action = 'dining_areas_reordered'
             and entity = 'outlet' and outlet_id = 'a2000000-0000-4000-8000-000000000001')
    and exists (select 1 from public.audit_log where action = 'restaurant_tables_reordered'
             and entity = 'dining_area' and entity_id = v_a1::text));
end;
$$;

-- 16.6 — the remaining guards on a live floor: a paused outlet, the area move that is allowed,
-- the one that is impossible, the lost update, and the edit that must not restate a status.
do $$
declare
  v_res   jsonb;
  v_a1    uuid;
  v_a2    uuid;
  v_t1    uuid;
  v_t2    uuid;
  v_deck  uuid;
  v_ver   integer;
begin
  select id into v_a1   from public.dining_areas where name = 'Main Hall';
  select id into v_a2   from public.dining_areas where name = 'Garden Seats' and status = 'ACTIVE';
  select id into v_deck from public.dining_areas where name = 'Skyline Deck' and status = 'ACTIVE';
  select id into v_t1 from public.restaurant_tables where code = 'T01';
  select id into v_t2 from public.restaurant_tables where code = 'T02';

  -- 16.6a §12's pause means something in the database, not only on a sign: the outlet exists,
  -- the caller owns the estate, the arguments are all valid, and app.require_writable_outlet
  -- still refuses. Two different doors, one rule.
  perform app.expect_denial(
    'select public.create_dining_area(''a2000000-0000-4000-8000-0000000000b1''::uuid, ''Deck Seats'')',
    'NIVAAS_OUTLET_NOT_WRITABLE');
  perform app.expect_denial(
    'select public.reorder_dining_areas(''a2000000-0000-4000-8000-0000000000b1''::uuid, '
    || quote_literal('[]') || '::jsonb)',
    'NIVAAS_OUTLET_NOT_WRITABLE');
  perform app.verify('16.6a the paused outlet took no section and no ordering',
    not exists (select 1 from public.dining_areas
                 where outlet_id = 'a2000000-0000-4000-8000-0000000000b1'));

  -- 16.6b an empty description is the operator's stated intent to CLEAR it (app.blankable),
  -- not an omission that leaves the old text in place by accident.
  select public.update_dining_area(v_a2, p_description => '') into v_res;
  perform app.verify('16.6b a blanked description becomes NULL and the edit is versioned',
    (v_res ->> 'description') is null and (v_res ->> 'version') = '3'
    and (v_res ->> 'display_order') = '0');

  -- 16.6c a cover may move between sections of ITS OWN outlet. It arrives at the end of the
  -- destination rather than carrying its old rank into a number the destination already uses —
  -- a drag would otherwise fail for a reason invisible on the screen being dragged on.
  select public.update_restaurant_table(v_t2, p_area => v_a2) into v_res;
  perform app.verify('16.6c an in-outlet move re-parents the cover and appends its rank',
    (v_res ->> 'area_id') = v_a2::text
    and (v_res ->> 'display_order') = '1'
    and (v_res ->> 'outlet_id') = 'a2000000-0000-4000-8000-000000000001'
    and (v_res ->> 'name') = 'Table 2');

  -- …and into a DIFFERENT outlet it cannot go, whatever the client asks for: the destination
  -- area must belong to the table's own outlet, and the chain trigger re-proves the ancestors
  -- afterwards so a row that got past the door still cannot lie about where it lives.
  perform app.expect_denial(
    'select public.update_restaurant_table(''' || v_t1 || '''::uuid, p_area => '''
    || v_deck || '''::uuid)',
    'NIVAAS_AREA_NOT_IN_OUTLET');
  perform app.verify('16.6d a cross-outlet move was refused and left the cover where it was',
    (select area_id from public.restaurant_tables where id = v_t1) = v_a1);

  -- 16.6e 005's lost-update guard on the floor: a caller stating a version that is no longer
  -- current is refused, and a second editor of one map cannot clobber the first.
  select version into v_ver from public.restaurant_tables where id = v_t1;
  perform app.expect_denial(
    'select public.update_restaurant_table(''' || v_t1 || '''::uuid, p_capacity => 6, '
    || 'p_expected_version => ' || (v_ver + 1) || ')',
    'NIVAAS_VERSION_CONFLICT');
  -- The same lock on the operational door, so a status set from a stale screen is refused too.
  perform app.expect_denial(
    'select public.set_table_service_status(''' || v_t1 || '''::uuid, ''CLEANING'', '
    || '''stale screen'', ' || (v_ver + 1) || ')',
    'NIVAAS_VERSION_CONFLICT');
  perform app.verify('16.6e a refused version check rewrote nothing',
    (select capacity from public.restaurant_tables where id = v_t1) = 4
    and (select service_status from public.restaurant_tables where id = v_t1) = 'AVAILABLE'
    and (select version from public.restaurant_tables where id = v_t1) = v_ver);

  -- 16.6f an ordinary content edit renames and re-places a cover, and cannot touch the
  -- operational fact — there is no parameter for it and the value survives the write.
  select public.update_restaurant_table(v_t1, p_name => 'Window Two',
    p_position_x => 260, p_position_y => 92, p_expected_version => v_ver) into v_res;
  perform app.verify('16.6f a content edit renames and moves the cover, keeping service_status AVAILABLE',
    (v_res ->> 'name') = 'Window Two' and (v_res ->> 'position_x') = '260'
    and (v_res ->> 'service_status') = 'AVAILABLE' and (v_res ->> 'status') = 'ACTIVE'
    and (v_res ->> 'version') = (v_ver + 1)::text);
end;
$$;

-- Ids for the probes below, captured at psql top level because a \gset variable cannot be
-- interpolated into a dollar-quoted body — and because the probing roles in 16.7/16.8 CANNOT
-- read these rows back through their own RLS. A NULL argument would make every NOT_FOUND and
-- ACCESS_DENIED assertion below pass for the wrong reason, so the literal is load-bearing.
select id::text as floor_area  from public.dining_areas where name = 'Main Hall' \gset
select id::text as floor_table from public.restaurant_tables where code = 'T01' \gset

-- 16.7 — the ladder. 013 gives floor staff `table.view` and NOTHING else on this floor: they
-- can see the map they work on, they cannot redraw it, they cannot put a cover on it and they
-- cannot say it is dirty.
set app.user_id to '00000000-0000-4000-8000-0000000000ac';   -- STAFF @ Main Dining

do $$
declare
  v_out jsonb;
  v_a1  uuid;
  v_t1  uuid;
  n     integer;
begin
  select count(*) into n from public.restaurant_tables;
  perform app.verify('16.7a staff read the floor they work on', n > 0);

  -- they can read their own section by id, which is what makes the probes below real: the row
  -- is visible, and the refusal is about the capability, not about sight.
  select id into v_a1 from public.dining_areas where name = 'Main Hall';
  select id into v_t1 from public.restaurant_tables where code = 'T01';

  perform app.expect_denial(
    'select public.create_dining_area(''a2000000-0000-4000-8000-000000000001''::uuid, ''Staff Section'')',
    'NIVAAS_ACCESS_DENIED');
  perform app.expect_denial(
    'select public.create_restaurant_table(''' || v_a1 || '''::uuid, ''Staff Cover'', ''T88'', 4)',
    'NIVAAS_ACCESS_DENIED');
  perform app.expect_denial(
    'select public.update_dining_area(''' || v_a1 || '''::uuid, p_name => ''Renamed by staff'')',
    'NIVAAS_ACCESS_DENIED');
  perform app.expect_denial(
    'select public.archive_dining_area(''' || v_a1 || '''::uuid, ''staff cannot retire a section'')',
    'NIVAAS_ACCESS_DENIED');
  -- The operational verb is table.edit, which staff do not hold: seeing a dirty table and
  -- declaring it dirty are two different capabilities (§11).
  perform app.expect_denial(
    'select public.set_table_service_status(''' || v_t1 || '''::uuid, ''CLEANING'', ''staff cannot say so'')',
    'NIVAAS_ACCESS_DENIED');

  perform app.verify('16.7b every staff refusal left the floor exactly as it was',
    not exists (select 1 from public.dining_areas where name in ('Staff Section', 'Renamed by staff'))
    and not exists (select 1 from public.restaurant_tables where code = 'T88')
    and (select name from public.dining_areas where id = v_a1) = 'Main Hall'
    and (select service_status from public.restaurant_tables where id = v_t1) = 'AVAILABLE');

  -- 16.7c the DENIED row. A door that refuses raises, and a raising function cannot write its
  -- own row in the transaction it just aborted — scenario 12's honest limit, unchanged here. So
  -- the trail is proven on the path that does NOT raise: evaluate_access, the pre-flight the UI
  -- and the route guard call before they render the control at all.
  select public.evaluate_access('table.create',
    'a0000000-0000-4000-8000-00000000000a'::uuid,
    'a1000000-0000-4000-8000-000000000001'::uuid,
    'a2000000-0000-4000-8000-000000000001'::uuid) into v_out;
  perform app.verify('16.7c the pre-flight refuses staff for the permission, not the membership',
    (v_out ->> 'allowed') = 'false' and (v_out ->> 'reason') = 'PERMISSION_DENIED');

  select count(*) into n from public.audit_log
   where action = 'access_denied' and result = 'DENIED'
     and organization_id = 'a0000000-0000-4000-8000-00000000000a'
     and metadata ->> 'permission' = 'table.create'
     and actor_id = '00000000-0000-4000-8000-0000000000ac';
  perform app.verify('16.7d and that refusal is a DENIED row in the tenant''s own history', n = 1);
end;
$$;

-- 16.7e — a seat carved to one restaurant cannot build in the next one, even inside the same
-- estate and with the very same permissions. This is the outlet-as-the-restaurant rule (§12)
-- doing work: the row is not foreign, so the answer is the honest ACCESS_DENIED and not a
-- NOT_FOUND, and it matches what the read policy shows — the other outlet's floor is invisible.
set app.user_id to '00000000-0000-4000-8000-0000000000af';   -- RESTAURANT_MANAGER @ Rooftop only

do $$
declare
  n integer;
begin
  select count(*) into n from public.dining_areas
   where outlet_id = 'a2000000-0000-4000-8000-000000000001';
  perform app.verify('16.7e a rooftop-only manager reads none of Main Dining''s sections', n = 0);
  select count(*) into n from public.dining_areas;
  perform app.verify('16.7e2 and does read their own rooftop floor', n > 0);
end;
$$;

select app.expect_denial('select public.create_dining_area(''a2000000-0000-4000-8000-000000000001''::uuid, ''Rooftop Run'')',
                         'NIVAAS_ACCESS_DENIED');
select app.expect_denial('select public.set_table_service_status(''' || :'floor_table' || '''::uuid, ''CLEANING'', ''wrong restaurant'')',
                         'NIVAAS_ACCESS_DENIED');
select app.expect_denial('select public.reorder_dining_areas(''a2000000-0000-4000-8000-000000000001''::uuid, ''[]''::jsonb)',
                         'NIVAAS_ACCESS_DENIED');

-- 16.8 — the tenant wall. A stranger holding a real tenant-A id is answered NOT_FOUND, never
-- 403: contract §10 refuses to prove existence. The door does read the row (it is SECURITY
-- DEFINER) and then refuses the TENANT, which is exactly the point — the answer for a foreign
-- id is the answer for an id that never existed, so no client can enumerate a neighbour's floor
-- by watching which refusals differ.
set app.user_id to '00000000-0000-4000-8000-000000000011';   -- OWNER B (foreign estate)

do $$
declare
  n integer;
begin
  select count(*) into n from public.dining_areas
   where organization_id = 'a0000000-0000-4000-8000-00000000000a';
  perform app.verify('16.8a a stranger reads none of tenant A''s sections through RLS', n = 0);
  select count(*) into n from public.restaurant_tables
   where organization_id = 'a0000000-0000-4000-8000-00000000000a';
  perform app.verify('16.8b and none of its covers', n = 0);
  -- …while their OWN estate's floor is visible, so "nothing" above is tenancy and not a policy
  -- that quietly returned zero rows for everyone.
  select count(*) into n from public.dining_areas
   where organization_id = 'b0000000-0000-4000-8000-00000000000b';
  perform app.verify('16.8c the same owner does read their own section', n = 1);
  select count(*) into n from public.restaurant_tables
   where organization_id = 'b0000000-0000-4000-8000-00000000000b';
  perform app.verify('16.8d and their own cover', n = 1);
end;
$$;

-- Every door on the floor, aimed at tenant A's ids by tenant B's owner. The tenant wall is
-- examined before any permutation, before any value, so the jsonb payload here is irrelevant to
-- the answer — which is itself the property: a stranger cannot probe this surface for shape.
select app.expect_denial('select public.create_dining_area(''a2000000-0000-4000-8000-000000000001''::uuid, ''Hijacked Section'')',
                         'NIVAAS_NOT_FOUND');
select app.expect_denial('select public.update_dining_area(''' || :'floor_area' || '''::uuid, p_name => ''Renamed by a stranger'')',
                         'NIVAAS_NOT_FOUND');
select app.expect_denial('select public.archive_dining_area(''' || :'floor_area' || '''::uuid, ''a stranger closes it'')',
                         'NIVAAS_NOT_FOUND');
select app.expect_denial('select public.reorder_dining_areas(''a2000000-0000-4000-8000-000000000001''::uuid, '
                        || '''[]''::jsonb)',
                         'NIVAAS_NOT_FOUND');
select app.expect_denial('select public.create_restaurant_table(''' || :'floor_area' || '''::uuid, ''Stolen Cover'', ''T99'', 4)',
                         'NIVAAS_NOT_FOUND');
select app.expect_denial('select public.update_restaurant_table(''' || :'floor_table' || '''::uuid, p_capacity => 99)',
                         'NIVAAS_NOT_FOUND');
select app.expect_denial('select public.set_table_service_status(''' || :'floor_table' || '''::uuid, ''OUT_OF_SERVICE'', ''a stranger says so'')',
                         'NIVAAS_NOT_FOUND');
select app.expect_denial('select public.archive_restaurant_table(''' || :'floor_table' || '''::uuid, ''a stranger retires it'')',
                         'NIVAAS_NOT_FOUND');
select app.expect_denial('select public.reorder_restaurant_tables(''' || :'floor_area' || '''::uuid, ''[]''::jsonb)',
                         'NIVAAS_NOT_FOUND');

-- 16.8e — the mirror: tenant A cannot reach the foreign floor either, and it is not told that
-- the ids are real. Their literal is quoted because owner A cannot read tenant B's rows back.
set app.user_id to '00000000-0000-4000-8000-000000000001';   -- ORG OWNER A

select app.expect_denial('select public.update_dining_area(''d0000000-0000-4000-8000-000000000001''::uuid, p_name => ''Not mine'')',
                         'NIVAAS_NOT_FOUND');
select app.expect_denial('select public.set_table_service_status(''d1000000-0000-4000-8000-000000000001''::uuid, ''CLEANING'', ''not mine either'')',
                         'NIVAAS_NOT_FOUND');

do $$
declare
  n integer;
begin
  select count(*) into n from public.dining_areas
   where organization_id = 'b0000000-0000-4000-8000-00000000000b';
  perform app.verify('16.8e owner A reads none of the foreign floor', n = 0);
  -- and none of the eleven probes above changed anything, in either estate: tenant A still has
  -- exactly its four sections (two live in Main Dining, one retired and one reborn on the
  -- rooftop), and none of the names or codes any probe tried to write exist anywhere.
  select count(*) into n from public.dining_areas;
  perform app.verify('16.8f the stranger''s probes left both floors standing',
    n = 4 and not exists (select 1 from public.dining_areas
                           where name in ('Hijacked Section', 'Renamed by a stranger', 'Not mine'))
       and not exists (select 1 from public.restaurant_tables where code in ('T99', 'Stolen Cover')));
end;
$$;

-- 16.8g — read as the table owner, because RLS is exactly what hides the foreign rows from the
-- probing tenant: the assertion here is that tenant B's floor was NOT touched, and only a
-- superuser can see the row it is made about. Asking it of `authenticated` would have returned
-- zero rows and "passed" by proving nothing.
reset role;

do $$
begin
  perform app.verify('16.8g the foreign cover was never restated by tenant A''s probe',
    exists (select 1 from public.restaurant_tables
             where id = 'd1000000-0000-4000-8000-000000000001'
               and service_status = 'AVAILABLE' and name = 'Table 1' and version = 1));
  perform app.verify('16.8h and the foreign section kept its name and its life',
    exists (select 1 from public.dining_areas
             where id = 'd0000000-0000-4000-8000-000000000001' and name = 'Sand Floor'
               and status = 'ACTIVE' and version = 1));
end;
$$;

-- 16.9 — the walls BELOW the doors. These run as the table owner on purpose: 015 revokes DML
-- from the client role, so only a superuser can reach a trigger, a CHECK or a partial index
-- directly and prove that the database — not merely the door — refuses.
reset role;

do $$
declare
  v_area uuid;
  v_org  uuid;
  v_prop uuid;
  v_out  uuid;
  v_t1   uuid;
  v_ord  integer;
  v_tord integer;
begin
  select id, organization_id, property_id, outlet_id into v_area, v_org, v_prop, v_out
    from public.dining_areas where name = 'Main Hall';
  select id, display_order into v_t1, v_tord from public.restaurant_tables where code = 'T01';
  select display_order into v_ord from public.dining_areas where id = v_area;

  -- 16.9a the attack this table specifically faces: a cover pointing at an area in one outlet
  -- while claiming a different outlet for itself. The chain trigger derives the truth from the
  -- AREA and then refuses the row, so a cross-outlet placement is impossible rather than merely
  -- discouraged — and this is why the RLS predicate on restaurant_tables can be trusted.
  perform app.expect_denial(
    'insert into public.restaurant_tables (organization_id, property_id, outlet_id, area_id, '
    || 'name, code, capacity) values (' || quote_literal(v_org) || ', ' || quote_literal(v_prop)
    || ', ''a2000000-0000-4000-8000-000000000002'', ' || quote_literal(v_area)
    || ', ''Forged Cover'', ''T77'', 4)',
    'NIVAAS_SCOPE_MISMATCH');

  -- 16.9b a section claiming another tenant's organization is refused the same way, because its
  -- ancestors are read off the outlet and then compared.
  perform app.expect_denial(
    'insert into public.dining_areas (organization_id, property_id, outlet_id, name) values ('
    || '''b0000000-0000-4000-8000-00000000000b'', ' || quote_literal(v_prop) || ', '
    || quote_literal(v_out) || ', ''Forged Hall'')',
    'NIVAAS_SCOPE_MISMATCH');

  -- 16.9c THE §20 wall, in the catalog rather than in a comment: not even the table owner can
  -- put a cover into a derived state, so no migration, script or support session can either.
  -- If OCCUPIED or RESERVED were ever added to that CHECK by hand, 015's own self-check stops
  -- the apply; this assertion is the same fact seen from the inside.
  perform app.expect_denial(
    'update public.restaurant_tables set service_status = ''OCCUPIED'' where id = '
    || quote_literal(v_t1),
    'restaurant_tables_service_status_check');
  perform app.expect_denial(
    'update public.restaurant_tables set service_status = ''RESERVED'' where id = '
    || quote_literal(v_t1),
    'restaurant_tables_service_status_check');

  -- 16.9d the "live" rules are partial unique indexes, not door conventions: two live sections
  -- cannot share a rank, and neither can two live covers inside one section.
  perform app.expect_denial(
    'insert into public.dining_areas (organization_id, property_id, outlet_id, name, display_order) '
    || 'values (' || quote_literal(v_org) || ', ' || quote_literal(v_prop) || ', '
    || quote_literal(v_out) || ', ''Second At The Same Rank'', ' || v_ord || ')',
    'dining_areas_live_order_idx');
  perform app.expect_denial(
    'insert into public.restaurant_tables (organization_id, property_id, outlet_id, area_id, '
    || 'name, code, capacity, display_order) values (' || quote_literal(v_org) || ', '
    || quote_literal(v_prop) || ', ' || quote_literal(v_out) || ', ' || quote_literal(v_area)
    || ', ''Second At The Same Place'', ''T78'', 4, ' || v_tord || ')',
    'restaurant_tables_live_order_idx');

  -- 16.9e geometry is drawn, not billed: the bound is a range and there is NO scale rule on it.
  -- A money-style CHECK here would be an accounting statement about a canvas coordinate.
  perform app.expect_denial(
    'insert into public.restaurant_tables (organization_id, property_id, outlet_id, area_id, '
    || 'name, code, capacity, position_x) values (' || quote_literal(v_org) || ', '
    || quote_literal(v_prop) || ', ' || quote_literal(v_out) || ', ' || quote_literal(v_area)
    || ', ''Off The Canvas'', ''T79'', 4, 100000000.5)',
    'restaurant_tables_position_ok');
  perform app.verify('16.9f a fractional canvas coordinate is stored exactly, not rounded',
    (select count(*) from public.restaurant_tables
      where id = v_t1 and position_x = 260) = 1);
end;
$$;

-- 16.9g — a client has no DML at all on the floor, so the door is the only write path and no
-- policy can be talked into accepting one. This runs as `authenticated`, the only role a client
-- ever gets, which is the whole point of the assertion.
set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000001';

select app.expect_denial('insert into public.dining_areas (organization_id, property_id, outlet_id, name) '
                      || 'values (''a0000000-0000-4000-8000-00000000000a''::uuid, '
                      || '''a1000000-0000-4000-8000-000000000001''::uuid, '
                      || '''a2000000-0000-4000-8000-000000000001''::uuid, ''Direct Section'')',
                      'permission denied');
select app.expect_denial('update public.restaurant_tables set capacity = 99 where code = ''T01''',
                      'permission denied');
select app.expect_denial('delete from public.restaurant_tables where code = ''T01''', 'permission denied');

reset role;

-- ============================================================================
-- Scenario 17 — Prompt #04 §23-§31: orders, lines, money and the order machine (016).
--
-- This is the half of Prompt #04 that 014/015 only prepared the ground for: a ticket a kitchen
-- can work, money the server computes, and a nine-word ladder whose LEGAL MOVES — not its words
-- — are the security property. Three claims in 016's own comments name this file as their
-- measure, and they are asserted here rather than trusted:
--
--   • a refused create costs no document number (§4), while a REPLAY burns one and answers with
--     the first order unchanged (§6) — the committed gap nobody may paper over;
--   • the line freezes what was SOLD (§9): repricing and renaming the dish afterwards must not
--     restate a live ticket;
--   • min/max selections are an ORDER rule (NIVAAS_INVALID_SELECTION_COUNT in both directions,
--     including the group nobody answered), which is exactly what 014 deferred to 016.
--
-- Money doctrine is measured at the column rather than argued: 250.00 + 40.00 + 19.99 × 3 is
-- 349.97 and the engine's answer is a rounding of 0.03, so a float anywhere in the path would
-- surface as 0.029999999999973 and break an equality this file reads back as text.
--
-- Every probe is assembled with format(... %L) instead of hand-doubled quotes: a door argument
-- that has to survive three levels of quoting is a probe whose literal, not whose behaviour, is
-- being tested. Rows are then found by their own NOTES/code marker, so no block below depends
-- on a generated uuid surviving across a dollar-quoted boundary.
-- ============================================================================

-- 17.0 — fixtures no earlier scenario owns, so that every cross-outlet and cross-cover refusal
-- below has a real id to aim at. A cover on the ROOFTOP (§12 makes the outlet the restaurant, so
-- "a Main Dining ticket on a rooftop table" must be refused, not merely frowned at); two spare
-- Main Dining covers, because a move has to land on a cover NO other order is sitting on or
-- "derived OCCUPIED" would pass even if the derivation were broken; and a HOUSEKEEPING_MANAGER
-- seat, which holds none of the restaurant keys and is scenario 20's permission probe.
reset role;

do $$
declare
  v_role uuid;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    ('00000000-0000-4000-8000-0000000000b1', 'hk.a@verify.local',
     '{"full_name":"Housekeeping Lead"}')
  on conflict (id) do nothing;

  insert into public.organization_memberships
    (user_id, organization_id, status, is_owner, joined_at)
  values ('00000000-0000-4000-8000-0000000000b1',
    'a0000000-0000-4000-8000-00000000000a', 'ACTIVE', false, now())
  on conflict do nothing;

  insert into public.membership_property_access (user_id, organization_id, property_id, mode)
  values ('00000000-0000-4000-8000-0000000000b1',
    'a0000000-0000-4000-8000-00000000000a',
    'a1000000-0000-4000-8000-000000000001', 'SELECTED_PROPERTIES')
  on conflict do nothing;

  select id into v_role from public.roles where name = 'HOUSEKEEPING_MANAGER';
  -- An OUTLET-scope seat (006), so it carries outlet_id and not property_id — the 009 trigger
  -- refuses the other shape, which is the point of building a fixture through the seed's own rules.
  insert into public.user_roles (user_id, role_id, organization_id, outlet_id)
  values ('00000000-0000-4000-8000-0000000000b1', v_role,
    'a0000000-0000-4000-8000-00000000000a',
    'a2000000-0000-4000-8000-000000000001')
  on conflict do nothing;
end;
$$;

set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000001';   -- ORG OWNER A

do $$
declare
  v_area uuid;
  v_res  jsonb;
begin
  -- Built through 015's doors, not hand-inserted: a fixture written by the same surface the
  -- app uses cannot drift from the rules the scenario is about to measure.
  select public.create_dining_area('a2000000-0000-4000-8000-000000000002', 'Sky Deck')
    into v_res;
  v_area := (v_res ->> 'id')::uuid;
  select public.create_restaurant_table(v_area, 'Sky Table 1', 'R50', 2) into v_res;
  perform app.verify('17.0a a rooftop cover exists, so a cross-outlet order has a real target',
    v_area is not null and (v_res ->> 'outlet_id') = 'a2000000-0000-4000-8000-000000000002'
    and (v_res ->> 'code') = 'R50' and (v_res ->> 'service_status') = 'AVAILABLE');

  select public.create_restaurant_table(
    (select id from public.dining_areas where name = 'Main Hall'), 'Table 3', 'T03', 4) into v_res;
  perform app.verify('17.0b a spare Main Dining cover waits for the move',
    (v_res ->> 'code') = 'T03' and (v_res ->> 'outlet_id') = 'a2000000-0000-4000-8000-000000000001'
    and (v_res ->> 'display_order') = '2');

  select public.create_restaurant_table(
    (select id from public.dining_areas where name = 'Main Hall'), 'Table 4', 'T04', 4) into v_res;
  perform app.verify('17.0c a second spare cover waits for the out-of-service probe',
    (v_res ->> 'code') = 'T04' and (v_res ->> 'display_order') = '3');
end;
$$;

-- 17.1 — the sellable menu an order needs, built through 014's doors: a DRAFT menu that becomes
-- publishable, one sold-out item, and one item whose modifier group DEMANDS an answer. Two
-- items of 014's making are measured here for the first time from the order side: price HISTORY
-- (so 17.5 can reprice without restating a sale) and the deferred min/max rule.
do $$
declare
  v_menu   uuid;
  v_thali  uuid;
  v_chaas  uuid;
  v_sold   uuid;
  v_choice uuid;
  v_draft  uuid;
  v_group  uuid;
  v_res    jsonb;
  n        integer;
begin
  select public.create_menu('a2000000-0000-4000-8000-000000000001',
    'Verification Grill', 'INR') into v_res;
  v_menu := (v_res ->> 'id')::uuid;
  perform app.verify('17.1a a new menu arrives DRAFT, and a DRAFT menu is not sellable',
    v_menu is not null and (v_res ->> 'status') = 'DRAFT');

  select public.create_menu_item(v_menu, 'Draft Only', 100.00,
    p_item_code => 'VG-0') into v_res;
  v_draft := (v_res ->> 'id')::uuid;

  -- The unpublished menu is tenant A's own fact, so it gets the sellable-now token rather than
  -- the absence token — the same distinction 016's resolver draws between "your dish, not on
  -- sale" and "not your dish at all".
  perform app.expect_denial(
    format('select public.create_order(%L::uuid, %L, %L::jsonb)',
      'a2000000-0000-4000-8000-000000000001'::uuid, 'TAKEAWAY',
      jsonb_build_array(jsonb_build_object('itemId', v_draft))),
    'NIVAAS_ITEM_NOT_ON_MENU');

  perform public.set_menu_status(v_menu, 'ACTIVE');

  select public.create_menu_item(v_menu, 'Ghee Rice Thali', 250.00,
    p_item_code => 'VG-1') into v_res;
  v_thali := (v_res ->> 'id')::uuid;
  select public.create_menu_item(v_menu, 'Masala Chaas', 19.99,
    p_item_code => 'VG-2') into v_res;
  v_chaas := (v_res ->> 'id')::uuid;
  select public.create_menu_item(v_menu, 'Sold Out Plate', 500.00,
    p_item_code => 'VG-3') into v_res;
  v_sold := (v_res ->> 'id')::uuid;
  select public.create_menu_item(v_menu, 'Choice Plate', 120.00,
    p_item_code => 'VG-4') into v_res;
  v_choice := (v_res ->> 'id')::uuid;

  -- OPTIONAL (min 0, max 2): declining it is legal, taking three is not.
  select public.create_modifier_group(v_thali, 'Extras', 'MULTIPLE', 0, 2) into v_res;
  v_group := (v_res ->> 'id')::uuid;
  perform public.create_modifier(v_group, 'Extra Paneer', 40.00, 1);
  perform public.create_modifier(v_group, 'No Onions', 0.00, 2);

  -- MANDATORY (SINGLE, min 1, max 1). 014 checked this shape; the count against a real order
  -- is 016's, and 17.3 is where it lands.
  select public.create_modifier_group(v_choice, 'Heat', 'SINGLE', 1, 1) into v_res;
  perform public.create_modifier((v_res ->> 'id')::uuid, 'Extra Chilli', 10.00, 1);

  perform public.set_menu_item_availability(v_sold, false);

  select count(*) into n from public.menu_items
   where menu_id = v_menu and status = 'ACTIVE';
  -- Five, not four: 014 makes an item ACTIVE at birth and puts the sellable gate on the MENU, so
  -- publishing 'Verification Grill' published VG-0 with it. The DRAFT refusal above was the
  -- menu's status speaking, which is exactly the separation §10 asks for.
  perform app.verify('17.1b five live dishes under the published menu, one sold out, prices exact',
    n = 5
    and (select mi.is_available from public.menu_items mi where mi.id = v_sold) = false
    and (select p.unit_price::text from public.menu_item_prices p
          where p.menu_item_id = v_chaas and p.effective_to is null) = '19.99'
    and (select p.unit_price::text from public.menu_item_prices p
          where p.menu_item_id = v_thali and p.effective_to is null) = '250.00');

  -- Contract §1 at the read helper: money crosses the wire as a string, because a JavaScript
  -- number is where a rupee goes to lose its third decimal.
  perform app.verify('17.1c the order-time price helper hands money as text, not as a number',
    jsonb_typeof(public.menu_item_current_price(v_thali) -> 'unitPrice') = 'string');

  -- 014's "one OPEN price row per item" is what makes the snapshot in 17.5 meaningful: the
  -- reprice below closes this row rather than replacing it, and 17.5e counts the closure.
  perform app.verify('17.1d every priced dish has exactly one open price row and the rest is history',
    (select count(*) from public.menu_item_prices p
      where p.menu_item_id = v_thali and p.effective_to is null) = 1);
end;
$$;

-- 17.1e — the SECOND restaurant. §12 says an outlet IS a restaurant, so scenario 17's outlet-scope
-- probes (17.11, 17.12) need a ticket that lives in the other one, and a rooftop cover with a live
-- order on it proves the derived floor view works on both sides of that line.
do $$
declare
  v_menu uuid;
  v_item uuid;
  v_res  jsonb;
begin
  select public.create_menu('a2000000-0000-4000-8000-000000000002', 'Rooftop Grill', 'INR')
    into v_res;
  v_menu := (v_res ->> 'id')::uuid;
  perform public.set_menu_status(v_menu, 'ACTIVE');
  select public.create_menu_item(v_menu, 'Sky Fries', 90.00,
    p_item_code => 'RF-1') into v_res;
  v_item := (v_res ->> 'id')::uuid;

  select public.create_order('a2000000-0000-4000-8000-000000000002', 'DINE_IN',
    jsonb_build_array(jsonb_build_object('itemId', v_item, 'quantity', 1)),
    p_table => (select id from public.restaurant_tables where code = 'R50'),
    p_notes => 'VERIFY-ROOF-1') into v_res;
  perform app.verify('17.1e the rooftop has its own menu, its own ticket and its own counter',
    (v_res ->> 'outlet_id') = 'a2000000-0000-4000-8000-000000000002'
    and (v_res ->> 'order_number') ~ '^ORD-[0-9]{6}$'
    and (select o.grand_total::numeric from public.orders o
          where o.id = (v_res ->> 'id')::uuid) = 90);
end;
$$;

-- 17.2 — the first real ticket: DINE_IN on T01, two lines, one option, and the arithmetic the
-- recalculation trigger writes onto the order row. `create_order` takes ONE scope argument
-- (the outlet); the organization, property, cover pairing, trading day and number are all
-- derived, which is what the assertions below are actually reading.
do $$
declare
  v_menu  uuid;
  v_thali uuid;
  v_chaas uuid;
  v_group uuid;
  v_mod   uuid;
  v_table uuid;
  v_res   jsonb;
  v_ord   uuid;
  v_lines jsonb;
  v_money jsonb;
begin
  select id into v_menu  from public.menus       where name = 'Verification Grill';
  select id into v_thali from public.menu_items  where item_code = 'VG-1';
  select id into v_chaas from public.menu_items  where item_code = 'VG-2';
  select id into v_group from public.modifier_groups where menu_item_id = v_thali
    and name = 'Extras';
  select id into v_mod   from public.modifiers   where group_id = v_group
    and name = 'Extra Paneer';
  select id into v_table from public.restaurant_tables where code = 'T01';

  select public.create_order('a2000000-0000-4000-8000-000000000001', 'DINE_IN',
    jsonb_build_array(
      jsonb_build_object('itemId', v_thali, 'quantity', 1,
        'specialInstructions', 'no onion',
        'modifiers', jsonb_build_array(jsonb_build_object(
          'groupId', v_group, 'modifierIds', jsonb_build_array(v_mod)))),
      jsonb_build_object('itemId', v_chaas, 'quantity', 3)),
    p_table => v_table, p_notes => 'VERIFY-O1') into v_res;

  v_ord := (v_res ->> 'id')::uuid;
  perform app.verify('17.2a the ticket opens DRAFT v1 under the outlet''s own counter, with the chain read off the outlet and never off an argument',
    v_ord is not null
    and (v_res ->> 'status') = 'DRAFT' and (v_res ->> 'version') = '1'
    and (v_res ->> 'order_type') = 'DINE_IN'
    and (v_res ->> 'table_id') = v_table::text
    and (v_res ->> 'order_number') ~ '^ORD-[0-9]{6}$'
    and (v_res ->> 'business_date') is not null
    and (v_res ->> 'organization_id') = 'a0000000-0000-4000-8000-00000000000a'
    and (v_res ->> 'property_id')     = 'a1000000-0000-4000-8000-000000000001'
    and (v_res ->> 'outlet_id')       = 'a2000000-0000-4000-8000-000000000001'
    and (v_res ->> 'created_by') = '00000000-0000-4000-8000-000000000001');

  select jsonb_agg(oi order by oi.line_sequence) into v_lines
    from public.order_items oi where oi.order_id = v_ord;
  perform app.verify('17.2b each line freezes name, code, currency and the OPEN price at sale time',
    jsonb_array_length(v_lines) = 2
    and (v_lines -> 0 ->> 'item_name_snapshot') = 'Ghee Rice Thali'
    and (v_lines -> 0 ->> 'item_code_snapshot') = 'VG-1'
    and (v_lines -> 0 ->> 'unit_price') = '250.00'
    and (v_lines -> 0 ->> 'currency') = 'INR'
    and (v_lines -> 0 ->> 'line_sequence') = '1'
    and (v_lines -> 0 ->> 'special_instructions') = 'no onion'
    and (v_lines -> 1 ->> 'unit_price') = '19.99'
    and (v_lines -> 1 ->> 'quantity') = '3'
    and (v_lines -> 1 ->> 'line_sequence') = '2');

  -- The option is a SOLD fact, not a pointer: name and adjustment are copied onto the line, so
  -- a retired modifier cannot erase what the guest asked for (016 makes modifier_id nullable for
  -- exactly this reason).
  perform app.verify('17.2c the chosen option is snapshotted onto its line with its own adjustment',
    (select count(*) from public.order_item_modifiers m
      where m.order_item_id = (v_lines -> 0 ->> 'id')::uuid
        and m.modifier_name_snapshot = 'Extra Paneer'
        and m.price_adjustment = 40.00
        and m.currency = 'INR') = 1);

  select to_jsonb(o) into v_money from public.orders o where o.id = v_ord;
  perform app.verify('17.2d 250.00+40.00+19.99×3 is 349.97, rounded ONCE to 350 — and the rounding is exactly 0.03',
    (v_money ->> 'subtotal')::numeric = 349.97
    and (v_money ->> 'rounding_amount') = '0.03'
    and (v_money ->> 'grand_total')::numeric = 350
    and (v_money ->> 'amount_due')::numeric = 350
    and (v_money ->> 'tax_amount')::numeric = 0
    and (v_money ->> 'service_charge_amount')::numeric = 0
    and (v_money ->> 'discount_amount')::numeric = 0);

  -- §14's honesty clause: the engine DECLARES tax and service charge and invents neither. They
  -- are zero because nothing in this build feeds them, and a screen that showed them as a
  -- percentage it typed itself would be the first money lie in the product.
  perform app.verify('17.2e tax and service charge are zero because NOTHING writes them',
    (select count(*) from public.order_items oi
      where oi.order_id = v_ord and coalesce(oi.tax_rate, 0) <> 0) = 0
    and (select o.tax_amount + o.service_charge_amount from public.orders o
          where o.id = v_ord) = 0);
end;
$$;

-- 17.3 — the validation ladder: fourteen ways a POS payload is wrong, each with its own token,
-- plus the two facts that make running them worth the space. A refusal writes NO row, and a
-- refusal costs NO document number (§4) — so the next accepted ticket takes the very next value.
do $$
declare
  v_thali  uuid;
  v_sold   uuid;
  v_choice uuid;
  v_group  uuid;
  v_mod    uuid;
  v_roof   uuid;
  v_res    jsonb;
  v_num    integer;
  n        integer;
begin
  select id into v_thali  from public.menu_items where item_code = 'VG-1';
  select id into v_sold   from public.menu_items where item_code = 'VG-3';
  select id into v_choice from public.menu_items where item_code = 'VG-4';
  select id into v_group  from public.modifier_groups where menu_item_id = v_choice
    and name = 'Heat';
  select id into v_mod    from public.modifiers where group_id = v_group;
  select id into v_roof   from public.restaurant_tables where code = 'R50';

  select max((substr(order_number, 5))::integer) into v_num from public.orders
   where outlet_id = 'a2000000-0000-4000-8000-000000000001';

  -- §24's vocabulary and §20's pairing are answered before anything table-shaped is read.
  perform app.expect_denial(
    format('select public.create_order(%L::uuid, %L, %L::jsonb)',
      'a2000000-0000-4000-8000-000000000001'::uuid, 'ROOM_SERVICE', '[]'::jsonb),
    'NIVAAS_INVALID_ORDER_TYPE');
  -- ROOM_SERVICE is the word §24 reserved and this build has not issued — the CHECK vocabulary
  -- and the door agree, so a screen cannot open a room-service ticket by typing.
  perform app.expect_denial(
    format('select public.create_order(%L::uuid, %L, %L::jsonb)',
      'a2000000-0000-4000-8000-000000000001'::uuid, 'DELIVERY',
      jsonb_build_array(jsonb_build_object('itemId', v_thali, 'quantity', 1))),
    'NIVAAS_INVALID_ORDER_TYPE');

  -- DINE_IN means a cover, anything else means not having one: the same CHECK sentence answered
  -- as two distinct domain codes so the POS learns WHICH half it got wrong.
  perform app.expect_denial(
    format('select public.create_order(%L::uuid, %L, %L::jsonb)',
      'a2000000-0000-4000-8000-000000000001'::uuid, 'DINE_IN',
      jsonb_build_array(jsonb_build_object('itemId', v_thali, 'quantity', 1))),
    'NIVAAS_ORDER_TABLE_MISMATCH');
  perform app.expect_denial(
    format('select public.create_order(%L::uuid, %L, %L::jsonb, %L::uuid)',
      'a2000000-0000-4000-8000-000000000001'::uuid, 'TAKEAWAY',
      jsonb_build_array(jsonb_build_object('itemId', v_thali, 'quantity', 1)),
      (select id from public.restaurant_tables where code = 'T01')),
    'NIVAAS_ORDER_TABLE_MISMATCH');

  -- §12: a rooftop cover is not a Main Dining cover, even inside one tenant and for a user who
  -- can see both.
  perform app.expect_denial(
    format('select public.create_order(%L::uuid, %L, %L::jsonb, %L::uuid)',
      'a2000000-0000-4000-8000-000000000001'::uuid, 'DINE_IN',
      jsonb_build_array(jsonb_build_object('itemId', v_thali, 'quantity', 1)), v_roof),
    'NIVAAS_TABLE_NOT_IN_OUTLET');

  perform app.expect_denial(
    format('select public.create_order(%L::uuid, %L, %L::jsonb, %L::uuid)',
      'a2000000-0000-4000-8000-000000000001'::uuid, 'DINE_IN', '[]'::jsonb,
      (select id from public.restaurant_tables where code = 'T01')),
    'NIVAAS_EMPTY_ORDER');

  -- §31: positive whole quantities, refused before the counter is touched. The bound is the
  -- COLUMN's (1..999), so the door and the row cannot disagree about what a plate is.
  perform app.expect_denial(
    format('select public.create_order(%L::uuid, %L, %L::jsonb)',
      'a2000000-0000-4000-8000-000000000001'::uuid, 'TAKEAWAY',
      jsonb_build_array(jsonb_build_object('itemId', v_thali, 'quantity', 0))),
    'NIVAAS_INVALID_QUANTITY');
  perform app.expect_denial(
    format('select public.create_order(%L::uuid, %L, %L::jsonb)',
      'a2000000-0000-4000-8000-000000000001'::uuid, 'TAKEAWAY',
      jsonb_build_array(jsonb_build_object('itemId', v_thali, 'quantity', 1.5))),
    'NIVAAS_INVALID_QUANTITY');
  perform app.expect_denial(
    format('select public.create_order(%L::uuid, %L, %L::jsonb)',
      'a2000000-0000-4000-8000-000000000001'::uuid, 'TAKEAWAY',
      jsonb_build_array(jsonb_build_object('itemId', v_thali, 'quantity', 1000))),
    'NIVAAS_INVALID_QUANTITY');
  -- A malformed uuid is a domain refusal, never a Postgres cast error leaking a schema detail.
  perform app.expect_denial(
    format('select public.create_order(%L::uuid, %L, %L::jsonb)',
      'a2000000-0000-4000-8000-000000000001'::uuid, 'TAKEAWAY',
      jsonb_build_array(jsonb_build_object('itemId', 'not-a-uuid'))),
    'NIVAAS_INVALID_ORDER_LINE');

  -- Sellable HERE, RIGHT NOW. The tenant's own unsellable dish gets its own token; a dish that
  -- is not yours is answered with absence, never with a confirmation that it exists (§10).
  perform app.expect_denial(
    format('select public.create_order(%L::uuid, %L, %L::jsonb)',
      'a2000000-0000-4000-8000-000000000001'::uuid, 'TAKEAWAY',
      jsonb_build_array(jsonb_build_object('itemId', v_sold))),
    'NIVAAS_ITEM_NOT_ON_MENU');
  perform app.expect_denial(
    format('select public.create_order(%L::uuid, %L, %L::jsonb)',
      'a2000000-0000-4000-8000-000000000002'::uuid, 'TAKEAWAY',
      jsonb_build_array(jsonb_build_object('itemId', v_thali))),
    'NIVAAS_ITEM_NOT_ON_MENU');   -- Main Dining''s dish is not sellable on the ROOFTOP
  -- A dish that is not yours and a dish that never existed get the SAME answer (§10): the door
  -- reads the row and refuses the tenant, so no client can enumerate a neighbour's menu by
  -- watching which refusals differ. This build has no tenant-B menu item to hand over, and the
  -- absence of one is why the probe uses a well-formed id nothing owns — the reply is identical.
  perform app.expect_denial(
    format('select public.create_order(%L::uuid, %L, %L::jsonb)',
      'a2000000-0000-4000-8000-000000000001'::uuid, 'TAKEAWAY',
      jsonb_build_array(jsonb_build_object('itemId',
        'c1000000-0000-4000-8000-000000000001'::uuid))),
    'NIVAAS_NOT_FOUND');

  -- 014's deferred rule: the COUNT of what a real order picked, in both directions, plus the
  -- group nobody answered at all, plus the shape attacks on the option payload.
  perform app.expect_denial(
    format('select public.create_order(%L::uuid, %L, %L::jsonb)',
      'a2000000-0000-4000-8000-000000000001'::uuid, 'TAKEAWAY',
      jsonb_build_array(jsonb_build_object('itemId', v_choice))),
    'NIVAAS_INVALID_SELECTION_COUNT');     -- min 1, nobody answered it
  perform app.expect_denial(
    format('select public.create_order(%L::uuid, %L, %L::jsonb)',
      'a2000000-0000-4000-8000-000000000001'::uuid, 'TAKEAWAY',
      jsonb_build_array(jsonb_build_object('itemId', v_choice, 'modifiers',
        jsonb_build_array(jsonb_build_object('groupId', v_group, 'modifierIds',
          jsonb_build_array(v_mod, '00000000-0000-4000-8000-000000000001'::uuid)))))),
    'NIVAAS_INVALID_SELECTION_COUNT');     -- SINGLE with two answers
  perform app.expect_denial(
    format('select public.create_order(%L::uuid, %L, %L::jsonb)',
      'a2000000-0000-4000-8000-000000000001'::uuid, 'TAKEAWAY',
      jsonb_build_array(jsonb_build_object('itemId', v_thali, 'modifiers',
        jsonb_build_array(jsonb_build_object('groupId', v_group),
                          jsonb_build_object('groupId', v_group))))),
    'NIVAAS_INVALID_MODIFIER_CHOICE');     -- one group answered twice
  perform app.expect_denial(
    format('select public.create_order(%L::uuid, %L, %L::jsonb)',
      'a2000000-0000-4000-8000-000000000001'::uuid, 'TAKEAWAY',
      jsonb_build_array(jsonb_build_object('itemId', v_thali, 'modifiers',
        jsonb_build_array(jsonb_build_object('groupId',
          '00000000-0000-4000-8000-0000000000aa'))))),
    'NIVAAS_INVALID_MODIFIER_CHOICE');     -- a group that is not this dish''s

  select count(*) into n from public.orders
   where outlet_id = 'a2000000-0000-4000-8000-000000000001';
  perform app.verify('17.3a fourteen refusals book nothing at all', n = 1);
  select count(*) into n from public.order_items oi
    join public.orders o on o.id = oi.order_id
   where o.outlet_id = 'a2000000-0000-4000-8000-000000000001';
  perform app.verify('17.3b and no orphan line was written for a refused ticket', n = 2);

  -- §4 measured from the client side, because `document_counters` is revoked to `authenticated`
  -- outright: the accepted ticket below takes the number the refusals left untouched.
  select public.create_order('a2000000-0000-4000-8000-000000000001', 'TAKEAWAY',
    jsonb_build_array(jsonb_build_object('itemId', v_thali, 'quantity', 2)),
    p_notes => 'VERIFY-O2') into v_res;
  perform app.verify('17.3c the accepted takeaway takes the next number, not the one a refusal skipped',
    (substr(v_res ->> 'order_number', 5))::integer = v_num + 1
    and (v_res ->> 'order_type') = 'TAKEAWAY'
    and (v_res ->> 'table_id') is null);

  perform app.verify('17.3d a takeaway''s own money: 250.00×2 is 500, rounded by nothing, wearing no cover',
    (v_res ->> 'subtotal')::numeric = 500
    and (v_res ->> 'grand_total')::numeric = 500
    and (v_res ->> 'rounding_amount')::numeric = 0);

  -- A door that raises aborts its own transaction, so a refusal cannot leave a tidy "denied"
  -- row behind — the trail is therefore exactly one SUCCESS row per ACCEPTED ticket, and the
  -- count proves the fourteen refusals above contributed nothing to it.
  select count(*) into n from public.audit_log
   where action = 'order_created' and result = 'SUCCESS'
     and outlet_id = 'a2000000-0000-4000-8000-000000000001';
  perform app.verify('17.3e the trail carries one creation row per accepted ticket, and no more',
    n = 2 and n = (select count(*) from public.orders
                    where outlet_id = 'a2000000-0000-4000-8000-000000000001'));
end;
$$;

-- 17.4 — §6's replay. A double tap is not a second ticket: the same key answers with the FIRST
-- order, unchanged, audited once — while the number the second tap minted before its insert
-- collided stays consumed. That gap is legal (§4), and this is the place it is said out loud
-- instead of smoothed over by renumbering a live document.
do $$
declare
  v_thali uuid;
  v_table uuid;
  v_first jsonb;
  v_again jsonb;
  n       integer;
begin
  select id into v_thali from public.menu_items where item_code = 'VG-1';
  select id into v_table from public.restaurant_tables where code = 'T02';

  select public.create_order('a2000000-0000-4000-8000-000000000001', 'DINE_IN',
    jsonb_build_array(jsonb_build_object('itemId', v_thali, 'quantity', 1)),
    p_table => v_table, p_notes => 'VERIFY-O3',
    p_idempotency_key => 'verify-replay-17') into v_first;

  -- The same key with DIFFERENT contents: a door that honoured the payload instead of the key
  -- would book a second ticket — or worse, mutate the first one to 99 covers.
  select public.create_order('a2000000-0000-4000-8000-000000000001', 'DINE_IN',
    jsonb_build_array(jsonb_build_object('itemId', v_thali, 'quantity', 99)),
    p_table => v_table, p_notes => 'VERIFY-O3-TWICE',
    p_idempotency_key => 'verify-replay-17') into v_again;

  perform app.verify('17.4a the replay answers with the first order, name, notes and number intact',
    (v_first ->> 'id') = (v_again ->> 'id')
    and (v_again ->> 'notes') = 'VERIFY-O3'
    and (v_again ->> 'order_number') = (v_first ->> 'order_number')
    and (v_again ->> 'status') = 'DRAFT');

  select count(*) into n from public.orders where idempotency_key = 'verify-replay-17';
  perform app.verify('17.4b one key books exactly one ticket', n = 1);

  select count(*) into n from public.order_items oi
    join public.orders o on o.id = oi.order_id
   where o.idempotency_key = 'verify-replay-17';
  perform app.verify('17.4c and the replay''s 99-cover payload writes no line', n = 1);

  select count(*) into n from public.audit_log
   where action = 'order_created' and result = 'SUCCESS'
     and entity_id = (v_first ->> 'id');
  perform app.verify('17.4d a replay audits one creation, not two', n = 1);
end;
$$;

-- 17.4e — the burned number, read where it lives. `document_counters` is revoked to
-- `authenticated` (016's self-check proves the table has RLS on and ZERO policies), so this is a
-- table-owner probe: the counter sits exactly one past the highest number any ticket wears, and
-- no order carries the burned value. 17.4 is the only reason it is legal, and this is the only
-- place the gap is visible at all.
reset role;

do $$
declare
  v_last  integer;
  v_count integer;
  v_bd    date;
begin
  v_bd := app.rest_outlet_business_date('a2000000-0000-4000-8000-000000000001'::uuid);

  select max((substr(order_number, 5))::integer) into v_last from public.orders
   where outlet_id = 'a2000000-0000-4000-8000-000000000001'
     and business_date = v_bd;
  select c.last_value into v_count from public.document_counters c
   where c.outlet_id = 'a2000000-0000-4000-8000-000000000001' and c.prefix = 'ORD'
     and c.business_date = v_bd;

  perform app.verify('17.4e the replay burned a number: the counter is one past the highest ticket, and no order wears it',
    v_count = v_last + 1
    and not exists (select 1 from public.orders o
                     where o.outlet_id = 'a2000000-0000-4000-8000-000000000001'
                       and o.order_number = 'ORD-' || lpad(v_count::text, 6, '0')));

  -- §13: the trading day is a fact of the OUTLET, derived in the door — and the ticket and its
  -- counter are filed under the same one, which is what stops a service splitting into two
  -- Z-reads.
  perform app.verify('17.4f the orders and their counter are filed on the outlet''s own business date',
    (select count(*) from public.orders o
      where o.outlet_id = 'a2000000-0000-4000-8000-000000000001'
        and o.business_date <> v_bd) = 0);
end;
$$;

set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000001';

-- 17.5 — §9: the line freezes what was SOLD. Reprice and rename the dish while the ticket is
-- alive and the ticket must not move. This is the assertion 014's price HISTORY and 016's
-- snapshot columns were both written for; with one mutable base_price column it would be
-- unfalsifiable, because there would be nothing left to disagree with.
do $$
declare
  v_thali uuid;
  v_order uuid;
  v_det   jsonb;
begin
  select id into v_thali from public.menu_items where item_code = 'VG-1';
  select id into v_order from public.orders      where notes = 'VERIFY-O1';

  perform public.set_menu_item_price(v_thali, 275.00, p_reason => 'festival repricing');
  perform public.update_menu_item(v_thali, 'Ghee Rice Thali Deluxe');

  select public.order_detail(v_order) into v_det;
  perform app.verify('17.5a the live ticket still carries the name and price the guest was quoted',
    (v_det -> 'items' -> 0 ->> 'item_name_snapshot') = 'Ghee Rice Thali'
    and (v_det -> 'items' -> 0 ->> 'unit_price') = '250.00');

  perform app.verify('17.5b while the ticket held its ground, the menu moved on: renamed, and priced at 275.00',
    (select mi.name from public.menu_items mi where mi.id = v_thali) = 'Ghee Rice Thali Deluxe'
    and (select p.unit_price::text from public.menu_item_prices p
          where p.menu_item_id = v_thali and p.effective_to is null) = '275.00');

  perform app.verify('17.5c the order''s own totals did not budge when the menu repriced',
    (select o.subtotal::text from public.orders o where o.id = v_order) = '349.97'
    and (select o.grand_total::text from public.orders o where o.id = v_order) = '350');

  -- Contract §1 at the wire. order_detail rewrites unit_price and price_adjustment with ::text
  -- precisely so a browser cannot round a sale on its way past.
  perform app.verify('17.5d money leaves the read door as text, and the frozen option travels with it',
    jsonb_typeof(v_det -> 'items' -> 0 -> 'unit_price') = 'string'
    and jsonb_typeof(v_det -> 'items' -> 0 -> 'modifiers' -> 0 -> 'price_adjustment') = 'string'
    and (v_det -> 'items' -> 0 -> 'modifiers' -> 0 ->> 'price_adjustment') = '40.00');

  perform app.verify('17.5e a repriced menu does not re-open a ticket, and the old price is kept as history',
    (select count(*) from public.menu_item_prices p
      where p.menu_item_id = v_thali and p.effective_to is not null) = 1
    and (select o.status from public.orders o where o.id = v_order) = 'DRAFT');
end;
$$;

-- 17.6 — the line doors and the engine they feed. Every write here recomputes money inside
-- Postgres, so each total below is the engine's answer read off the order row — not a number
-- this file typed in and then asked the database to agree with. Versions are asserted
-- RELATIVELY (captured, then +1): the lost-update guard is about a caller missing a version, and
-- an absolute expectation would only measure how many edits this file happens to make.
do $$
declare
  v_order  uuid;
  v_chaas  uuid;
  v_res    jsonb;
  v_line   uuid;
  v_before integer;
  n        integer;
begin
  select id into v_order from public.orders      where notes = 'VERIFY-O1';
  select id into v_chaas from public.menu_items  where item_code = 'VG-2';

  -- §51: a DRAFT ticket takes more lines, numbered after the LIVE ones.
  select version into v_before from public.orders where id = v_order;
  select public.add_order_items(v_order,
    jsonb_build_array(jsonb_build_object('itemId', v_chaas, 'quantity', 1))) into v_res;
  perform app.verify('17.6a an added line joins the print order after the live ones and moves the order version by one',
    (v_res ->> 'id') = v_order::text
    and (select count(*) from public.order_items where order_id = v_order) = 3
    and (select max(oi.line_sequence) from public.order_items oi
          where oi.order_id = v_order and oi.status = 'ACTIVE') = 3
    and (v_res ->> 'version')::integer = v_before + 1);

  perform app.verify('17.6b 349.97 + 19.99 is 369.96, rounded once to 370 — rounding 0.04',
    (select o.subtotal::text from public.orders o where o.id = v_order) = '369.96'
    and (select o.rounding_amount::text from public.orders o where o.id = v_order) = '0.04'
    and (select o.grand_total::numeric from public.orders o where o.id = v_order) = 370);

  -- A quantity restated on ONE line re-arms the whole engine: 3 × 19.99 becomes 1 × 19.99, so
  -- 290.00 + 19.99 + 19.99 = 329.98 → 330 with 0.02.
  select id into v_line from public.order_items
   where order_id = v_order and line_sequence = 2;
  select version into v_before from public.orders where id = v_order;
  select public.update_order_item(v_line, p_quantity => 1) into v_res;
  perform app.verify('17.6c a quantity correction re-freezes the line, moves BOTH versions, and never touches the unit price',
    (v_res ->> 'quantity') = '1'
    and (v_res ->> 'unit_price') = '19.99'
    and jsonb_typeof(v_res -> 'unit_price') = 'string'
    and (v_res ->> 'version')::integer = 2
    and (select o.subtotal::text from public.orders o where o.id = v_order) = '329.98'
    and (select o.rounding_amount::text from public.orders o where o.id = v_order) = '0.02'
    and (select o.version from public.orders o where o.id = v_order) = v_before + 1);

  -- §5's lost-update guard, on the LINE's own version: a caller that states one it has already
  -- missed is refused before the value is read, and writes nothing.
  perform app.expect_denial(
    format('select public.update_order_item(%L::uuid, 5, p_expected_version => 1)', v_line),
    'NIVAAS_VERSION_CONFLICT');
  perform app.verify('17.6d a rejected correction left the line at one cover and 329.98 on the ticket',
    (select oi.quantity from public.order_items oi where oi.id = v_line) = 1
    and (select o.subtotal::text from public.orders o where o.id = v_order) = '329.98');

  -- VOID is retirement, not deletion (§28): the line stays, keeps its print slot, and stops
  -- counting. 329.98 − 19.99 = 309.99 → 310 with 0.01.
  select id into v_line from public.order_items
   where order_id = v_order and line_sequence = 3;
  select version into v_before from public.orders where id = v_order;
  select public.void_order_item(v_line, 'guest changed their mind') into v_res;
  perform app.verify('17.6e a voided line retires in place: VOIDED, sequence kept, excluded from the money',
    (v_res ->> 'status') = 'VOIDED'
    and (select oi.line_sequence from public.order_items oi where oi.id = v_line) = 3
    and (select oi.unit_price::text from public.order_items oi where oi.id = v_line) = '19.99'
    and (select oi.quantity from public.order_items oi where oi.id = v_line) = 1
    and (select o.subtotal::text from public.orders o where o.id = v_order) = '309.99'
    and (select o.rounding_amount::text from public.orders o where o.id = v_order) = '0.01'
    and (select o.grand_total::numeric from public.orders o where o.id = v_order) = 310
    and (select o.version from public.orders o where o.id = v_order) = v_before + 1);

  -- Retiring the same line twice is not a second correction — and the reason is §28's: a voided
  -- line is the history of what was served, not a draft to re-edit.
  perform app.expect_denial(
    format('select public.void_order_item(%L::uuid, %L)', v_line, 'second attempt'),
    'NIVAAS_IMMUTABLE_ORDER');

  select count(*) into n from public.audit_log
   where entity_id = v_order::text and result = 'SUCCESS'
     and action in ('order_created', 'order_items_added');
  perform app.verify('17.6f the create and the add are both in the trail against the order', n >= 2);
  select count(*) into n from public.audit_log
   where action = 'order_item_voided' and result = 'SUCCESS' and entity_id = v_line::text;
  perform app.verify('17.6g the void is audited against the LINE it retired, reason and all',
    n = 1
    and (select al.reason from public.audit_log al
          where al.action = 'order_item_voided' and al.entity_id = v_line::text)
        = 'guest changed their mind');
end;
$$;

-- 17.7 — the machine. Nine legal words is not a state machine; the thirteen legal MOVES are, and
-- 016 put them in `app` so a client cannot query them (§7). DRAFT may not jump to READY, an
-- invented word is refused before the row is even read, and the ticket climbs one rung at a time
-- — which is also how scenario 18 gets something it is allowed to bill.
do $$
declare
  v_order    uuid;
  v_thali    uuid;
  v_res      jsonb;
  v_before   integer;
  v_confirmed integer;
  n          integer;
begin
  select id into v_order from public.orders where notes = 'VERIFY-O1';
  select id into v_thali from public.menu_items where item_code = 'VG-1';

  -- Vocabulary first, before the row: an invented status never reaches the ladder, and the
  -- caller is not told which words the ladder does hold.
  perform app.expect_denial(
    format('select public.set_order_status(%L::uuid, %L)', v_order, 'COOKING'),
    'NIVAAS_INVALID_STATUS');

  -- ABSENCE is the wall. DRAFT>READY, DRAFT>PREPARING and DRAFT>COMPLETED are all in the CHECK
  -- vocabulary and none of them in the machine — which is exactly the distinction a column of
  -- words cannot make, and the reason 015's status door needed a function too.
  perform app.expect_denial(
    format('select public.set_order_status(%L::uuid, %L)', v_order, 'READY'),
    'NIVAAS_INVALID_TRANSITION');
  perform app.expect_denial(
    format('select public.set_order_status(%L::uuid, %L)', v_order, 'PREPARING'),
    'NIVAAS_INVALID_TRANSITION');
  perform app.expect_denial(
    format('select public.set_order_status(%L::uuid, %L)', v_order, 'COMPLETED'),
    'NIVAAS_INVALID_TRANSITION');

  -- §51: once the restaurant has CONFIRMED the ticket, the pass owns it and the POS may not add
  -- to it — one token for every closed moment, whatever else a caller could do to the row.
  select public.set_order_status(v_order, 'PLACED') into v_res;
  select version into v_confirmed from public.orders where id = v_order;
  select public.set_order_status(v_order, 'CONFIRMED') into v_res;
  perform app.verify('17.7a DRAFT→PLACED→CONFIRMED climbs one rung at a time and moves the version exactly once per move',
    (v_res ->> 'status') = 'CONFIRMED'
    and (v_res ->> 'version')::integer = v_confirmed + 1);

  perform app.expect_denial(
    format('select public.add_order_items(%L::uuid, %L::jsonb)', v_order,
      jsonb_build_array(jsonb_build_object('itemId', v_thali, 'quantity', 1))),
    'NIVAAS_IMMUTABLE_ORDER');
  perform app.expect_denial(
    format('select public.update_order_item(%L::uuid, 2)',
      (select id from public.order_items where order_id = v_order
        and status = 'ACTIVE' limit 1)),
    'NIVAAS_IMMUTABLE_ORDER');
  perform app.verify('17.7b the two refusals after CONFIRMED changed nothing on the ticket',
    (select o.version from public.orders o where o.id = v_order) = v_confirmed + 1
    and (select count(*) from public.order_items oi where oi.order_id = v_order) = 3);

  select public.set_order_status(v_order, 'PREPARING') into v_res;
  select public.set_order_status(v_order, 'READY') into v_res;
  perform app.verify('17.7c CONFIRMED→PREPARING→READY, and the ticket is now something 017 may bill',
    (v_res ->> 'status') = 'READY'
    and (v_res ->> 'version')::integer = v_confirmed + 3);

  select count(*) into n from public.audit_log
   where action = 'order_status_advanced' and result = 'SUCCESS' and entity_id = v_order::text;
  perform app.verify('17.7d four legal moves, four audit rows — and every refusal advanced nothing', n = 4);
end;
$$;

-- 17.8 — §28's last honest boundary: CANCEL dies where the kitchen starts working. Before
-- CONFIRMED a walk-out is a cancellation; from PREPARING the only truthful verb is VOID; and a
-- terminal order has no outgoing edge at all, so it cannot be resurrected by editing it — or by
-- re-issuing the state it is already in.
do $$
declare
  v_thali uuid;
  v_order uuid;
  v_take  uuid;
  v_res   jsonb;
  n       integer;
begin
  select id into v_thali from public.menu_items where item_code = 'VG-1';
  select id into v_take  from public.orders      where notes = 'VERIFY-O2';

  select public.create_order('a2000000-0000-4000-8000-000000000001', 'DINE_IN',
    jsonb_build_array(jsonb_build_object('itemId', v_thali, 'quantity', 1)),
    p_table => (select id from public.restaurant_tables where code = 'T21'),
    p_notes => 'VERIFY-O5') into v_res;
  v_order := (v_res ->> 'id')::uuid;

  -- A reason is not decoration on a retirement. §48's discipline is structural in the door, and
  -- the CHECK on the columns repeats it at the row (17.13) so a hand-written tombstone cannot
  -- carry a timestamp without the sentence that explains it.
  perform app.expect_denial(
    format('select public.set_order_status(%L::uuid, %L)', v_order, 'CANCELLED'),
    'NIVAAS_REASON_REQUIRED');
  perform app.expect_denial(
    format('select public.set_order_status(%L::uuid, %L)', v_order, 'VOID'),
    'NIVAAS_REASON_REQUIRED');

  select public.set_order_status(v_order, 'PLACED') into v_res;
  -- §28: PLACED is still cancellable — the pass has not seen it.
  select public.set_order_status(v_order, 'CANCELLED',
    'guest walked out before ordering') into v_res;
  perform app.verify('17.8a a PLACED ticket cancels with its reason stamped beside its timestamp',
    (v_res ->> 'status') = 'CANCELLED'
    and (v_res ->> 'cancel_reason') = 'guest walked out before ordering'
    and (v_res ->> 'cancelled_at') is not null
    and (v_res ->> 'voided_at') is null
    and (v_res ->> 'void_reason') is null);

  -- A terminal state has no edges. Not CANCELLED again, not VOID, not back to DRAFT — and the
  -- answer is the machine's token, never "already there", because the transition oracle must
  -- not become readable.
  perform app.expect_denial(
    format('select public.set_order_status(%L::uuid, %L, %L)', v_order, 'CANCELLED', 'again'),
    'NIVAAS_INVALID_TRANSITION');
  perform app.expect_denial(
    format('select public.set_order_status(%L::uuid, %L, %L)', v_order, 'VOID', 'resurrect it'),
    'NIVAAS_INVALID_TRANSITION');
  perform app.expect_denial(
    format('select public.set_order_status(%L::uuid, %L, %L)', v_order, 'DRAFT', 'start over'),
    'NIVAAS_INVALID_TRANSITION');

  -- §28's other half: once PREPARING, CANCEL is gone and only VOID remains — and VOID keeps the
  -- history rather than deleting the row. DRAFT→CONFIRMED is refused on the way, because the
  -- kitchen cannot be reached by skipping rungs.
  perform app.expect_denial(
    format('select public.set_order_status(%L::uuid, %L)', v_take, 'CONFIRMED'),
    'NIVAAS_INVALID_TRANSITION');
  select public.set_order_status(v_take, 'PLACED') into v_res;
  select public.set_order_status(v_take, 'CONFIRMED') into v_res;
  select public.set_order_status(v_take, 'PREPARING') into v_res;
  perform app.expect_denial(
    format('select public.set_order_status(%L::uuid, %L, %L)', v_take, 'CANCELLED',
      'too late now'),
    'NIVAAS_INVALID_TRANSITION');
  select public.set_order_status(v_take, 'VOID', 'kitchen made it, guest left') into v_res;
  perform app.verify('17.8b PREPARING refuses CANCEL and takes VOID, keeping the reason and the row',
    (v_res ->> 'status') = 'VOID'
    and (v_res ->> 'void_reason') = 'kitchen made it, guest left'
    and (v_res ->> 'voided_at') is not null
    and (v_res ->> 'cancelled_at') is null);

  -- A terminal order is not editable either — the LINE doors ask the ORDER, not only the line,
  -- which is why these two refusals come from §51's window and not from the line's own status.
  perform app.expect_denial(
    format('select public.void_order_item(%L::uuid, %L)',
      (select id from public.order_items where order_id = v_order limit 1), 'too late'),
    'NIVAAS_IMMUTABLE_ORDER');
  perform app.expect_denial(
    format('select public.add_order_items(%L::uuid, %L::jsonb)', v_order,
      jsonb_build_array(jsonb_build_object('itemId', v_thali, 'quantity', 1))),
    'NIVAAS_IMMUTABLE_ORDER');

  select count(*) into n from public.orders where id in (v_order, v_take);
  perform app.verify('17.8c cancellation and void retire two tickets without removing either', n = 2);
  select count(*) into n from public.order_items oi
   where oi.order_id = v_take and oi.status = 'ACTIVE';
  perform app.verify('17.8d a voided ORDER leaves its lines standing: the kitchen''s work is history too', n = 1);
end;
$$;

-- 17.9 — §20's consequence, seen from the floor: a live order is what makes a cover OCCUPIED, and
-- the derivation follows the order across a move and into its retirement. Nobody wrote either
-- word — 015 keeps OCCUPIED out of the column's vocabulary entirely — so the only way to prove
-- the view is doing the work is to change the orders and watch the covers answer.
do $$
declare
  v_order uuid;
  v_t01   uuid;
  v_t03   uuid;
  v_t04   uuid;
  v_roof  uuid;
  v_t21   uuid;
  v_res   jsonb;
  v_state text;
  v_live  integer;
  v_before integer;
begin
  select id into v_order from public.orders where notes = 'VERIFY-O1';
  select id into v_t01   from public.restaurant_tables where code = 'T01';
  select id into v_t03   from public.restaurant_tables where code = 'T03';
  select id into v_t04   from public.restaurant_tables where code = 'T04';
  select id into v_roof  from public.restaurant_tables where code = 'R50';
  select id into v_t21   from public.restaurant_tables where code = 'T21';

  select r.derived_status, r.live_orders into v_state, v_live
    from public.restaurant_table_status r where r.table_id = v_t01;
  perform app.verify('17.9a a live DINE_IN order makes its cover OCCUPIED without anyone setting the word',
    v_state = 'OCCUPIED' and v_live = 1);

  -- §55: the move is ONE audited UPDATE whose trail is the cover history — before carries the
  -- old cover's id AND code, after carries the new one's. There is no table-history table to
  -- forge, which is the point of doing it this way.
  select version into v_before from public.orders where id = v_order;
  select public.move_order_table(v_order, v_t03, 'moved to the window seat') into v_res;
  perform app.verify('17.9b the move re-seats the order, bumps its version, and rewrites no other column',
    (v_res ->> 'table_id') = v_t03::text
    and (v_res ->> 'version')::integer = v_before + 1
    and (v_res ->> 'status') = 'READY');

  select r.derived_status into v_state from public.restaurant_table_status r
   where r.table_id = v_t01;
  perform app.verify('17.9c the cover the guest left is AVAILABLE again on the same read', v_state = 'AVAILABLE');
  select r.derived_status into v_state from public.restaurant_table_status r
   where r.table_id = v_t03;
  perform app.verify('17.9d the cover they arrived on is OCCUPIED on that same read', v_state = 'OCCUPIED');

  perform app.verify('17.9e the move is one audit row whose before/after name both covers by code',
    (select count(*) from public.audit_log al
      where al.action = 'order_table_moved' and al.entity_id = v_order::text
        and al.result = 'SUCCESS'
        and al.reason = 'moved to the window seat'
        and al."before" ->> 'tableCode' = 'T01'
        and al."after"  ->> 'tableCode' = 'T03') = 1);

  -- The move obeys the same walls as the seating did, and in the same order: the destination is
  -- not even looked at until the sentence has been given, so an illegal move cannot be probed
  -- for which covers exist.
  perform app.expect_denial(
    format('select public.move_order_table(%L::uuid, %L::uuid, null)', v_order, v_roof),
    'NIVAAS_REASON_REQUIRED');
  perform app.expect_denial(
    format('select public.move_order_table(%L::uuid, %L::uuid, %L)', v_order, v_roof,
      'wrong restaurant'),
    'NIVAAS_TABLE_NOT_IN_OUTLET');
  -- A TAKEAWAY has nothing to move, and the token says so rather than pretending the cover is
  -- the problem.
  perform app.expect_denial(
    format('select public.move_order_table(%L::uuid, %L::uuid, %L)',
      (select id from public.orders where notes = 'VERIFY-O3'), v_t03, 'no cover to move'),
    'NIVAAS_ORDER_NOT_DINE_IN');

  -- An OUT_OF_SERVICE cover is a person's stated fact ("do not seat anyone here") and a booking
  -- may not walk around it — in either direction of the floor's workflow.
  select public.set_table_service_status(v_t04, 'OUT_OF_SERVICE', 'a leg is broken') into v_res;
  perform app.expect_denial(
    format('select public.move_order_table(%L::uuid, %L::uuid, %L)', v_order, v_t04,
      'sit them by the broken table'),
    'NIVAAS_TABLE_OUT_OF_SERVICE');
  -- Empty lines here on purpose: if the door parked the cover check AFTER item resolution, this
  -- would answer NIVAAS_EMPTY_ORDER and the wall would be unmeasured.
  perform app.expect_denial(
    format('select public.create_order(%L::uuid, %L, %L::jsonb, %L::uuid)',
      'a2000000-0000-4000-8000-000000000001'::uuid, 'DINE_IN', '[]'::jsonb, v_t04),
    'NIVAAS_TABLE_OUT_OF_SERVICE');
  -- CLEANING is NOT refused: §20's precedence is CLEANING > OCCUPIED, so a cover being wiped can
  -- still take a guest. Refusing it would be the door inventing a rule the view does not have.
  perform public.set_table_service_status(v_t03, 'CLEANING', 'spilled water');
  select r.derived_status, r.live_orders into v_state, v_live
    from public.restaurant_table_status r where r.table_id = v_t03;
  perform app.verify('17.9f CLEANING outranks OCCUPIED, so the person''s stated fact wins over the order',
    v_state = 'CLEANING' and v_live = 1);
  perform app.verify('17.9g and the live order is still counted underneath: the view hides nothing, it prioritises',
    v_live = 1);
  perform public.set_table_service_status(v_t03, 'AVAILABLE', 'table wiped');
  select r.derived_status into v_state from public.restaurant_table_status r
   where r.table_id = v_t03;
  perform app.verify('17.9h put the cover back and the derivation re-answers OCCUPIED on the same read',
    v_state = 'OCCUPIED');

  -- §55's other face: a cover a live order is sitting on cannot be retired — and the refusal is
  -- the same token whether the manual status or the order is the thing objecting, because the
  -- operator's problem is identical ("someone is there").
  perform app.expect_denial(
    format('select public.archive_restaurant_table(%L::uuid, %L)', v_t03, 'making it disappear'),
    'NIVAAS_TABLE_IN_USE');
  perform app.expect_denial(
    format('select public.archive_restaurant_table(%L::uuid, %L)', v_t04, 'a broken spare'),
    'NIVAAS_TABLE_IN_USE');

  -- Retirement is terminal for the floor but not for the money: the cancelled O5 left its cover
  -- free, so the derivation reads AVAILABLE on a table whose order still exists as history.
  select r.derived_status into v_state from public.restaurant_table_status r
   where r.table_id = v_t21;
  perform app.verify('17.9i a CANCELLED order frees its cover — terminal states are excluded, not merely hidden',
    v_state = 'AVAILABLE');
  select public.set_table_service_status(v_t04, 'AVAILABLE', 'fixed the leg') into v_res;
  perform app.verify('17.9j the service-status door states a fact, and the derived column keeps its own counsel',
    (v_res ->> 'service_status') = 'AVAILABLE');
end;
$$;

-- 17.10 — the read doors, and the tenant wall around them. A stranger holding a real id is
-- answered with ABSENCE (§10), never with a denial that confirms the ticket exists. The foreign
-- probes below take the order id as a psql variable captured while the row was still readable:
-- reading it back through the stranger's own RLS would return NULL and the probe would pass for
-- the wrong reason — a door handed NULL is not the door being tested.
select id::text as o1_id from public.orders where notes = 'VERIFY-O1' \gset
select id::text as o3_id from public.orders where notes = 'VERIFY-O3' \gset

do $$
declare
  v_det  jsonb;
  v_rows jsonb;
  n      integer;
begin
  select public.order_detail((select id from public.orders where notes = 'VERIFY-O1')) into v_det;
  perform app.verify('17.10a order_detail returns the ticket with every line, voided ones included',
    (v_det ->> 'status') = 'READY'
    and jsonb_array_length(v_det -> 'items') = 3
    and (select count(*) from jsonb_array_elements(v_det -> 'items') e
          where e ->> 'status' = 'VOIDED') = 1
    and jsonb_typeof(v_det -> 'items' -> 0 -> 'unit_price') = 'string');

  -- The ticket's printed order survives a void: seq 3 is present and marked, because hiding rows
  -- from a document the guest was served is the quiet version of rewriting it (§28).
  perform app.verify('17.10b the voided line is still on the ticket, in its slot, with its reason',
    (select count(*) from jsonb_array_elements(v_det -> 'items') e
      where (e ->> 'line_sequence') = '3' and e ->> 'status' = 'VOIDED') = 1
    and (v_det -> 'items' -> 0 ->> 'item_name_snapshot') = 'Ghee Rice Thali');

  select public.open_orders('a2000000-0000-4000-8000-000000000001') into v_rows;
  perform app.verify('17.10c the queue is an object with the outlet named back and its live tickets inside',
    (v_rows ->> 'outletId') = 'a2000000-0000-4000-8000-000000000001'
    and jsonb_typeof(v_rows -> 'orders') = 'array');

  select count(*) into n from jsonb_array_elements(v_rows -> 'orders') r
   where r ->> 'status' in ('COMPLETED','CANCELLED','VOID');
  perform app.verify('17.10d open_orders lists LIVE tickets only: the cancelled and voided ones are not there', n = 0);

  select count(*) into n from jsonb_array_elements(v_rows -> 'orders') r
   where r ->> 'tableCode' = 'T03'
     and r -> 'lines' -> 0 ->> 'unitPrice' = '250.00'
     and jsonb_typeof(r -> 'lines' -> 0 -> 'unitPrice') = 'string';
  perform app.verify('17.10e the moved ticket reads with its new cover code, its lines and money as TEXT', n = 1);

  -- §2's other half at the POS read: no totals appear, so no screen can be tempted to add two.
  select count(*) into n from jsonb_array_elements(v_rows -> 'orders') r
   where r ? 'grand_total' or r ? 'subtotal' or r ? 'amount_due'
     or r ? 'grandTotal' or r ? 'subtotalAmount';
  perform app.verify('17.10f the queue carries line prices and NO totals of any kind — the POS has nothing to re-add', n = 0);

  select count(*) into n from jsonb_array_elements(v_rows -> 'orders') r
   where r ->> 'id' = (select id from public.orders where notes = 'VERIFY-O1')::text;
  perform app.verify('17.10g the ticket the floor is holding appears exactly once', n = 1);

  -- The voided line is excluded from the queue's line count but not from the ticket itself —
  -- two reads with two jobs, and the difference is deliberate.
  select count(*) into n from jsonb_array_elements(v_rows -> 'orders') r
   where r ->> 'tableCode' = 'T03' and (r ->> 'itemCount')::integer = 2
     and jsonb_array_length(r -> 'lines') = 2;
  perform app.verify('17.10h the queue''s line count counts only what the kitchen still has to make', n = 1);
end;
$$;

-- The stranger's side of the same doors. Every probe names a REAL tenant-A id and must come back
-- with the answer this file gives for an id that never existed.
set app.user_id to '00000000-0000-4000-8000-000000000011';   -- ORG OWNER B

select app.expect_denial(
  format('select public.order_detail(%L::uuid)', :'o1_id'::uuid), 'NIVAAS_NOT_FOUND');
select app.expect_denial(
  format('select public.open_orders(%L::uuid)',
    'a2000000-0000-4000-8000-000000000001'::uuid), 'NIVAAS_NOT_FOUND');
select app.expect_denial(
  format('select public.set_order_status(%L::uuid, %L)', :'o1_id'::uuid, 'PLACED'),
  'NIVAAS_NOT_FOUND');
select app.expect_denial(
  format('select public.move_order_table(%L::uuid, %L::uuid, %L)', :'o1_id'::uuid,
    'd1000000-0000-4000-8000-000000000001'::uuid, 'a stranger re-seats them'),
  'NIVAAS_NOT_FOUND');
select app.expect_denial(
  format('select public.bill_detail(%L::uuid)', gen_random_uuid()), 'NIVAAS_NOT_FOUND');

do $$
declare
  n integer;
begin
  -- The absence is not a broken policy: B reads its OWN estate (scenario 16 proved that for the
  -- floor), and it reads none of A's money path — including the derived view, which is
  -- SECURITY INVOKER and therefore runs B's own RLS rather than widening a tenant's read.
  select count(*) into n from public.orders;
  perform app.verify('17.10i a stranger reads none of tenant A''s tickets through RLS either', n = 0);
  select count(*) into n from public.restaurant_table_status
   where organization_id = 'a0000000-0000-4000-8000-00000000000a';
  perform app.verify('17.10j and the derived cover view leaks tenant A''s floor to nobody', n = 0);
  select count(*) into n from public.restaurant_table_status
   where organization_id = 'b0000000-0000-4000-8000-00000000000b';
  perform app.verify('17.10k while B''s own cover still reads, so "nothing above" is tenancy', n = 1);
end;
$$;

set app.user_id to '00000000-0000-4000-8000-000000000001';   -- back to owner A

-- 17.11 — the capability ladder, run against the seats 013 actually gave. STAFF holds
-- order.view/create/edit and NONE of order.cancel, order.void or order.discount; KITCHEN_MANAGER
-- holds no order key at all. Note the order of the two gates in set_order_status: the MACHINE
-- speaks before the capability, so an illegal move comes back with the same token whoever asks —
-- a refusal pattern cannot quietly teach a stranger which moves would have unlocked.
set app.user_id to '00000000-0000-4000-8000-0000000000ac';   -- STAFF @ Main Dining

do $$
declare
  v_thali uuid;
  v_order uuid;
  v_line  uuid;
  v_res   jsonb;
  v_det   jsonb;
  v_state text;
  v_ver   integer;
  n       integer;
begin
  select id into v_thali from public.menu_items where item_code = 'VG-1';

  select public.create_order('a2000000-0000-4000-8000-000000000001', 'TAKEAWAY',
    jsonb_build_array(jsonb_build_object('itemId', v_thali, 'quantity', 1)),
    p_notes => 'VERIFY-STAFF-1') into v_res;
  v_order := (v_res ->> 'id')::uuid;
  perform app.verify('17.11a floor staff may take an order — that is the job 013 gave them',
    v_order is not null
    and (v_res ->> 'created_by') = '00000000-0000-4000-8000-0000000000ac'
    and (v_res ->> 'status') = 'DRAFT');

  select id into v_line from public.order_items where order_id = v_order;
  select public.void_order_item(v_line, 'ordered in error') into v_res;
  perform app.verify('17.11b and order.edit lets them correct it, at the line level',
    (v_res ->> 'status') = 'VOIDED');
  select status, version into v_state, v_ver from public.orders where id = v_order;

  -- Both of these are LEGAL moves on the ladder from DRAFT — that is why they reach the
  -- capability gate and come back denied. A refusal that never got that far would prove nothing
  -- about 013's grants.
  perform app.expect_denial(
    format('select public.set_order_status(%L::uuid, %L, %L)', v_order, 'CANCELLED',
      'staff cannot cancel'),
    'NIVAAS_ACCESS_DENIED');
  perform app.expect_denial(
    format('select public.set_order_status(%L::uuid, %L, %L)', v_order, 'VOID',
      'staff cannot void'),
    'NIVAAS_ACCESS_DENIED');
  -- …and an illegal move is refused by the machine FIRST, with the machine's token, so the
  -- denial cannot be read as a capability oracle.
  perform app.expect_denial(
    format('select public.set_order_status(%L::uuid, %L)', v_order, 'READY'),
    'NIVAAS_INVALID_TRANSITION');

  perform app.verify('17.11c three refusals and the ticket is exactly where it was — same status, same version',
    (select o.status || o.version::text from public.orders o where o.id = v_order)
      = v_state || v_ver::text);

  -- The positive control: the same seat CAN read the ticket of the outlet they work. Without it
  -- every ACCESS_DENIED above could be "this user can do nothing", which is not the grant 013
  -- wrote.
  select public.order_detail(v_order) into v_det;
  perform app.verify('17.11d and the read door serves their own ticket: order.view is real',
    (v_det ->> 'id') = v_order::text
    and jsonb_array_length(v_det -> 'items') = 1);

  -- The seat is granted per OUTLET. RLS is broader than the key here — staff are not carved to
  -- one cover-list — so the door's outlet-scoped permission is the only wall between a floor
  -- waiter and the rooftop's tickets, and it answers ACCESS_DENIED rather than emptiness.
  perform app.expect_denial(
    format('select public.open_orders(%L::uuid)',
      'a2000000-0000-4000-8000-000000000002'::uuid),
    'NIVAAS_ACCESS_DENIED');
  select count(*) into n from public.orders;
  perform app.verify('17.11e which is why the row-level read alone would NOT have been a security property',
    n > 1);
end;
$$;

set app.user_id to '00000000-0000-4000-8000-0000000000ad';   -- KITCHEN_MANAGER @ Main Dining

do $$
declare
  v_thali uuid;
begin
  select id into v_thali from public.menu_items where item_code = 'VG-1';
  -- 013 gives the kitchen kot.view/create/reprint/cancel and menu.view/edit — and NOT one order
  -- key. The kitchen works tickets through the KOT (018), never through the sales ledger, so a
  -- kitchen seat that could price an order would be a segregation of duties that only looks
  -- correct.
  perform app.expect_denial(
    format('select public.create_order(%L::uuid, %L, %L::jsonb)',
      'a2000000-0000-4000-8000-000000000001'::uuid, 'TAKEAWAY',
      jsonb_build_array(jsonb_build_object('itemId', v_thali, 'quantity', 1))),
    'NIVAAS_ACCESS_DENIED');
  perform app.expect_denial(
    format('select public.order_detail(%L::uuid)',
      (select id from public.orders where notes = 'VERIFY-O1')),
    'NIVAAS_ACCESS_DENIED');
  perform app.expect_denial(
    'select public.open_orders(''a2000000-0000-4000-8000-000000000001''::uuid)',
    'NIVAAS_ACCESS_DENIED');
  -- The same seat DOES hold the menu read it needs to know what a dish is — otherwise the three
  -- refusals above would only prove this person can do nothing at all.
  perform app.verify('17.11f the kitchen holds menu.view but no order key: it works tickets, it does not price them',
    app.has_permission('00000000-0000-4000-8000-0000000000ad'::uuid,
      'a0000000-0000-4000-8000-00000000000a'::uuid, 'menu.view',
      'a1000000-0000-4000-8000-000000000001'::uuid,
      'a2000000-0000-4000-8000-000000000001'::uuid)
    and not app.has_permission('00000000-0000-4000-8000-0000000000ad'::uuid,
      'a0000000-0000-4000-8000-00000000000a'::uuid, 'order.view',
      'a1000000-0000-4000-8000-000000000001'::uuid,
      'a2000000-0000-4000-8000-000000000001'::uuid));
end;
$$;

-- 17.12 — outlet scope, not tenant scope. Two managers hold the SAME restaurant keys in two
-- outlets of ONE tenant; §12 says one outlet IS one restaurant, so the same ticket must be
-- unreachable across that line from inside the tenant, in both directions. The ids are captured at
-- psql top level because a \gset variable cannot be interpolated inside a dollar-quoted body.
select id::text as roof_oid from public.orders where notes = 'VERIFY-ROOF-1' \gset

set app.user_id to '00000000-0000-4000-8000-0000000000af';   -- RESTAURANT_MANAGER, Rooftop ONLY

do $$
declare
  n integer;
begin
  -- af is the one restaurant seat carved at the outlet level (membership_outlet_access), so RLS
  -- itself is the first wall here — and the door agrees with it instead of overriding it.
  select count(*) into n from public.orders
   where outlet_id = 'a2000000-0000-4000-8000-000000000001';
  perform app.verify('17.12a the rooftop manager reads none of Main Dining''s tickets through RLS', n = 0);
  select count(*) into n from public.orders;
  perform app.verify('17.12b and the zero is measured against a seat that does read its own rooftop ticket', n = 1);
end;
$$;

-- The door, aimed at the real Main Dining id this seat cannot see: a denial that confirms the
-- ticket would be a leak, but so would an empty detail. Within the tenant the answer is the
-- capability token — this caller is not foreign, they are just not standing at that counter.
select app.expect_denial(
  format('select public.order_detail(%L::uuid)', :'o1_id'::uuid), 'NIVAAS_ACCESS_DENIED');

set app.user_id to '00000000-0000-4000-8000-0000000000ae';   -- RESTAURANT_MANAGER, Main Dining

do $$
declare
  v_rows jsonb;
  n      integer;
begin
  -- The mirror image, from the other restaurant in the same hotel: the sibling outlet's queue is
  -- REFUSED, not emptied. An empty list would read like "nothing is cooking", which is how a
  -- service gets missed; the door says the caller has no standing at that counter.
  perform app.expect_denial(
    'select public.open_orders(''a2000000-0000-4000-8000-000000000002''::uuid)',
    'NIVAAS_ACCESS_DENIED');
  -- Positive control: the same seat, its own outlet, the queue arrives.
  select public.open_orders('a2000000-0000-4000-8000-000000000001') into v_rows;
  perform app.verify('17.12c the Main Dining manager''s own queue is served, so the refusal is scope and not ability',
    jsonb_typeof(v_rows -> 'orders') = 'array'
    and jsonb_array_length(v_rows -> 'orders') >= 1);
  -- ae holds no outlet carve, so the row-level read alone is NOT the wall between these two
  -- restaurants: the seat can see the rooftop's ticket and is still refused it. The door's
  -- outlet-scoped permission is the thing doing the work.
  select count(*) into n from public.orders
   where outlet_id = 'a2000000-0000-4000-8000-000000000002';
  perform app.verify('17.12d which is why the answer above cannot be RLS: this seat reads the rooftop''s rows anyway',
    n >= 1);
end;
$$;

-- And the same across the room on a write door, aimed at a legal move (DRAFT→PLACED) so the
-- refusal is the capability speaking and not the state machine.
select app.expect_denial(
  format('select public.set_order_status(%L::uuid, %L)', :'roof_oid'::uuid, 'PLACED'),
  'NIVAAS_ACCESS_DENIED');

set app.user_id to '00000000-0000-4000-8000-000000000001';

-- 17.13 — the walls BELOW the doors, as the table owner. No door is the last line of defence: a
-- row that skips them entirely still has to obey the CHECKs, the chain trigger and the partial
-- unique indexes, which is the difference between a rule and a convention. Probes run as
-- superuser on purpose — `app.expect_denial` is SECURITY INVOKER, so as `authenticated` the
-- missing grant would answer before the constraint this is about ever got asked.
reset role;

do $$
declare
  v_order uuid;
  v_org   uuid := 'a0000000-0000-4000-8000-00000000000a';
  v_prop  uuid := 'a1000000-0000-4000-8000-000000000001';
  v_out   uuid := 'a2000000-0000-4000-8000-000000000001';
  v_item  uuid;
  v_num   text;
  v_bd    date;
  v_ins   text;
begin
  select id into v_order from public.orders where notes = 'VERIFY-O1';
  select id into v_item  from public.menu_items where item_code = 'VG-2';
  v_bd := app.rest_outlet_business_date(v_out);
  v_num := 'ORD-' || (select lpad((c.last_value + 1)::text, 6, '0')
                        from public.document_counters c
                       where c.outlet_id = v_out and c.prefix = 'ORD'
                         and c.business_date = v_bd);
  v_ins := 'insert into public.order_items (organization_id, property_id, outlet_id, '
        || 'order_id, menu_item_id, item_name_snapshot, currency, unit_price, quantity, '
        || 'line_sequence) values (';

  -- The chain trigger cannot be impressed by a denormalized tenant id that agrees with nothing:
  -- a line written under the ROOFTOP while its order belongs to Main Dining.
  perform app.expect_denial(
    v_ins || quote_literal(v_org) || ', ' || quote_literal(v_prop) || ', '
      || quote_literal('a2000000-0000-4000-8000-000000000002'::uuid) || ', '
      || quote_literal(v_order) || ', ' || quote_literal(v_item)
      || ', ''Forged Line'', ''INR'', 19.99, 1, 9)',
    'NIVAAS_SCOPE_MISMATCH');

  -- A sub-rupee price is a domain error at the COLUMN too, not only at the door: this is the
  -- shape that makes §1's "never float" enforceable rather than aspirational, because a scale
  -- CHECK is what a numeric(18,2) would have silently rounded into a money lie.
  perform app.expect_denial(
    v_ins || quote_literal(v_org) || ', ' || quote_literal(v_prop) || ', '
      || quote_literal(v_out) || ', ' || quote_literal(v_order) || ', '
      || quote_literal(v_item) || ', ''Third Decimal'', ''INR'', 19.995, 1, 9)',
    'order_items_money_ok');
  perform app.expect_denial(
    v_ins || quote_literal(v_org) || ', ' || quote_literal(v_prop) || ', '
      || quote_literal(v_out) || ', ' || quote_literal(v_order) || ', '
      || quote_literal(v_item) || ', ''Negative Line'', ''INR'', -19.99, 1, 9)',
    'order_items_money_ok');

  -- §31 at the row: nobody can book a line nobody can eat, in either direction.
  perform app.expect_denial(
    v_ins || quote_literal(v_org) || ', ' || quote_literal(v_prop) || ', '
      || quote_literal(v_out) || ', ' || quote_literal(v_order) || ', '
      || quote_literal(v_item) || ', ''Zero Covers'', ''INR'', 19.99, 0, 9)',
    'order_items_quantity_ok');
  perform app.expect_denial(
    v_ins || quote_literal(v_org) || ', ' || quote_literal(v_prop) || ', '
      || quote_literal(v_out) || ', ' || quote_literal(v_order) || ', '
      || quote_literal(v_item) || ', ''Credit Line'', ''INR'', 19.99, -1, 9)',
    'order_items_quantity_ok');

  -- The print-order wall is PARTIAL on purpose: two live lines cannot share a slot, while a
  -- VOIDED line keeps the slot it was served on and does not hold the next one hostage.
  perform app.expect_denial(
    v_ins || quote_literal(v_org) || ', ' || quote_literal(v_prop) || ', '
      || quote_literal(v_out) || ', ' || quote_literal(v_order) || ', '
      || quote_literal(v_item) || ', ''Slot Clash'', ''INR'', 19.99, 1, 2)',
    'order_items_live_sequence_idx');
  -- …and the voided seq-3 line of O1 sits at slot 3 with slot 3 free for a live row. Asserted from
  -- the catalog plus the data rather than by inserting a throwaway row: a hand-written line that
  -- SUCCEEDED would stay in the database and be counted by every later read of that ticket.
  perform app.verify('17.13e the print-order wall is PARTIAL, so a retired line keeps its slot without holding it hostage',
    (select count(*) from pg_indexes
      where indexname = 'order_items_live_sequence_idx'
        and indexdef ilike '%WHERE%ACTIVE%') = 1
    and (select count(*) from public.order_items oi
          where oi.order_id = v_order and oi.line_sequence = 3) = 1
    and (select count(*) from public.order_items oi
          where oi.order_id = v_order and oi.line_sequence = 3
            and oi.status = 'ACTIVE') = 0);

  -- §48 as a row fact: a tombstone without a sentence is impossible, even for the table owner.
  perform app.expect_denial(
    format('update public.orders set cancelled_at = now() where id = %L::uuid', v_order),
    'orders_cancel_reason_ok');

  -- §20/§24 at the row: a takeaway wearing a cover, or a DINE_IN order that lost one.
  perform app.expect_denial(
    format('update public.orders set table_id = null where id = %L::uuid', v_order),
    'orders_table_matches_type');

  -- §6's replay wall is an INDEX, not a door convention: two rows cannot carry one key in one
  -- outlet even when both are written by hand, in the same org and outlet the door used.
  perform app.expect_denial(
    'insert into public.orders (organization_id, property_id, outlet_id, order_number, '
    || 'order_type, business_date, idempotency_key) values (' || quote_literal(v_org) || ', '
    || quote_literal(v_prop) || ', ' || quote_literal(v_out) || ', '
    || quote_literal(v_num) || ', ''TAKEAWAY'', ' || quote_literal(v_bd)
    || ', ''verify-replay-17'')',
    'orders_idempotency_scoped');

  -- The other half of the same index being partial: an idempotency key is OPTIONAL, so the
  -- tickets that never had one must not collide with each other.
  perform app.verify('17.13b keyless tickets coexist — the replay wall is not a NOT NULL tax on every order',
    (select count(*) from public.orders o
      where o.outlet_id = v_out and o.idempotency_key is null) >= 3);

  -- §13, read from the catalog: no door in this family accepts a trading day as an argument, so
  -- "the outlet''s clock decides" is structural rather than a convention the client agrees to.
  perform app.verify('17.13c no order door takes business_date — a hand-written day is the only way to get one, and the day belongs to the outlet',
    (select count(*) from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and p.proname in ('create_order','add_order_items','set_order_status','move_order_table')
        and 'p_business_date' = any (p.proargnames)) = 0);

  -- The counter is written by one function and read by nobody: the client role cannot even
  -- SELECT it, which is why a gap can never be "adjusted" from a screen.
  perform app.verify('17.13d the document counter is a table the served roles cannot read at all',
    (select relrowsecurity from pg_class
      where relname = 'document_counters' and relnamespace = 'public'::regnamespace)
    and (select count(*) from pg_policies where tablename = 'document_counters') = 0);
end;
$$;

-- 17.14 — a client has no DML on the order path at all. The doors are the only write surface,
-- which is what makes every rule above unreachable by negotiation: there is no row a screen can
-- write, delete, or price by hand.
set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000001';

select app.expect_denial('insert into public.orders (organization_id, property_id, outlet_id, '
                      || 'order_number, order_type, business_date) values ('
                      || '''a0000000-0000-4000-8000-00000000000a''::uuid, '
                      || '''a1000000-0000-4000-8000-000000000001''::uuid, '
                      || '''a2000000-0000-4000-8000-000000000001''::uuid, '
                      || '''ORD-000001'', ''TAKEAWAY'', current_date)', 'permission denied');
select app.expect_denial(format('update public.orders set grand_total = 1 where id = %L::uuid',
                      :'o1_id'::uuid), 'permission denied');
select app.expect_denial(format('delete from public.orders where id = %L::uuid', :'o1_id'::uuid),
                      'permission denied');
select app.expect_denial('update public.order_items set unit_price = 1 where 1=1', 'permission denied');
select app.expect_denial('delete from public.order_item_modifiers', 'permission denied');
select app.expect_denial('select count(*) from public.document_counters', 'permission denied');
-- The derived view is readable (that is its purpose) and has no write surface to negotiate with:
-- Postgres refuses in the rewriter with "cannot update view", BEFORE it consults any privilege, so
-- this probe proves the view cannot be written and proves nothing about grants. The grant wall for
-- the same fact is therefore asserted on the base table it reads from, on the next line.
select app.expect_denial('update public.restaurant_table_status set derived_status = ''AVAILABLE'' '
                      || 'where 1=1', 'cannot update view');
select app.expect_denial('update public.restaurant_tables set service_status = ''OUT_OF_SERVICE'' '
                      || 'where 1=1', 'permission denied');

reset role;

-- ============================================================================
-- Structural invariants the fixtures must not be able to violate (§15, §18, §43)
--
-- These run as the table owner on purpose: `app.expect_denial` is SECURITY INVOKER, so as
-- `authenticated` the privilege revocation would answer before the index or trigger the
-- assertion is about.
-- ============================================================================
do $$
begin
  -- Two owners for one tenant: refused by the partial unique index in 002. The second
  -- owner must be someone who is not already a member, or the plain (user, org) key
  -- fires first and this asserts the wrong wall.
  perform app.expect_denial(
    'insert into public.organization_memberships (user_id, organization_id, status, is_owner) '
    || 'values (''00000000-0000-4000-8000-000000000011'', '
    || '''a0000000-0000-4000-8000-00000000000a'', ''ACTIVE'', true)',
    'memberships_one_owner_idx');

  -- A PROPERTY-scoped role granted without a property: refused by the 002 trigger.
  perform app.expect_denial(
    'insert into public.user_roles (user_id, role_id, organization_id) '
    || 'values (''00000000-0000-4000-8000-000000000002'', '
    || '(select id from public.roles where name = ''GENERAL_MANAGER''), '
    || '''a0000000-0000-4000-8000-00000000000a'')',
    'NIVAAS_SCOPE_MISMATCH');

  -- A chain trigger cannot be fooled by a mismatched denormalized tenant id.
  perform app.expect_denial(
    'insert into public.outlets (organization_id, property_id, name, code, slug, outlet_type) '
    || 'values (''b0000000-0000-4000-8000-00000000000b'', '
    || '''a1000000-0000-4000-8000-000000000001'', ''Cross Tenant Outlet'', ''VCROSS'', '
    || '''cross-tenant-outlet'', ''BAR'')',
    'NIVAAS_SCOPE_MISMATCH');

  -- The wall behind the missing grant: even the table owner cannot rewrite history,
  -- because a trigger fires for a superuser where a privilege check would not.
  perform app.expect_denial(
    'delete from public.audit_log where id = (select min(id) from public.audit_log)',
    'NIVAAS_AUDIT_IMMUTABLE');

  perform app.verify('audit trail recorded the scenario writes',
    (select count(*) from public.audit_log) > 0);
end;
$$;

-- ============================================================================
-- Scenario 18 — Prompt #04 §32-§50: the calculation engine, the bill and payments (017).
--
-- 016 proved the TICKET; this proves the DOCUMENT. Four things are measurable here that no
-- earlier scenario could reach:
--
--   • §1/§2 — the totals are the ENGINE's answer and nothing else's. app.calculate_restaurant_totals
--     returns every key as TEXT (017:141-147), so the arithmetic is asserted against the engine's
--     own output read a second time, not against a number this file typed in;
--   • §9 — a bill is a snapshot, so the document has to survive both a menu reprice AND a change
--     to the ticket's own lines. 017's only money writer is app.recalculate_order_totals
--     (017:266-279), which updates `orders` and never touches `bills` — so the assertion below is
--     that the ORDER moves and the BILL does not, which is what the code actually does;
--   • §6/§7 — the replay key is (organization, outlet, key), NOT the ticket, and the READY→SERVED
--     move open_bill makes is written by hand at 017:697 instead of through 016's audited door;
--   • the money CHECKs, the chain guards, the payment-immutability trigger and the exact grant set
--     are read as the table owner, because a trigger is the wall that still stands when the grant
--     does not.
--
-- Where 017's behaviour differs from what its own header or Prompt #04 states, the assertion says
-- what the code does and the comment names the difference — the discrepancy is the finding, not a
-- reason to soften the probe.
-- ============================================================================

-- 18.0 — one fixture 017 needs and no earlier scenario has: a real ticket in the FOREIGN estate,
-- so §10's "a stranger's order and no order at all answer identically" is aimed at a row rather
-- than at a guess. Written as superuser (the doors of tenant A cannot reach it, which is exactly
-- the point), with a literal id because a client cannot read it back through RLS to name it.
reset role;

do $$
declare
  v_org  uuid := 'b0000000-0000-4000-8000-00000000000b';
  v_prop uuid := 'b1000000-0000-4000-8000-000000000001';
  v_out  uuid := 'b2000000-0000-4000-8000-000000000001';
begin
  insert into public.orders (id, organization_id, property_id, outlet_id, order_number,
    order_type, business_date, status, notes)
  values ('d0000000-0000-4000-8000-000000000001', v_org, v_prop, v_out, 'ORD-000001',
    'TAKEAWAY', app.rest_outlet_business_date(v_out), 'DRAFT', 'VERIFY-FOREIGN-ORDER')
  on conflict (id) do nothing;

  -- The stranger's ticket gets one priced plate (its own outlet's own dish, so 016's chain trigger
  -- is satisfied rather than dodged) — without a line the engine leak at 18.3h would only be
  -- leaking zeros, and zeros are not evidence of anything.
  insert into public.order_items (organization_id, property_id, outlet_id, order_id,
    menu_item_id, item_name_snapshot, item_code_snapshot, currency, unit_price, quantity,
    line_sequence)
  select v_org, v_prop, v_out, 'd0000000-0000-4000-8000-000000000001',
    m.id, m.name, m.item_code, 'INR', 400.00, 1, 1
    from public.menu_items m
   where m.id = 'c1000000-0000-4000-8000-000000000001'
     and not exists (select 1 from public.order_items oi
                      where oi.order_id = 'd0000000-0000-4000-8000-000000000001');

  perform app.verify('18.0a a tenant-B ticket exists as a real id with a real 400.00 line, so the absence and leak probes below aim at a foreign row and not at a NULL',
    (select count(*) from public.orders o
      where o.id = 'd0000000-0000-4000-8000-000000000001'
        and o.organization_id = v_org
        and o.outlet_id = v_out) = 1
    and (select sum(oi.unit_price * oi.quantity) from public.order_items oi
          where oi.order_id = 'd0000000-0000-4000-8000-000000000001') = 400);
end;
$$;

-- The four tickets this scenario bills. Their money is the engine''s answer read off the row at
-- creation, so every figure asserted later is one the DATABASE computed:
--   B1  DINE_IN on T01: (120.00 + 10.00 option) + 19.99×3 = 189.97 → 190 (rounding 0.03) — the
--       non-integral subtotal §1 asks the rounding to be measured on. It carries the payments and
--       the close, and then the amendment that must not move it. Its option-bearing line is written
--       FIRST and its second line last: 016:1155-1163 inserts a line's option rows AFTER that line,
--       so B1 also measures the trigger ordering — the header has to absorb an option written under
--       an earlier line while a later line is being added, and 18.0b reads the engine's true 189.97.
--   B2  TAKEAWAY: 120.00×2 + 10.00 = 250.00 as ONE line, whose option is therefore the very last
--       row written for the ticket. 18.0d is the case 017's second recalculation trigger exists for:
--       an option written after its line must still reach the header, and the stored order row and
--       the engine's answer must be the same 250.00 rather than 240.00 against 250.00.
--   B4  TAKEAWAY: 19.99 → 20 — opened by FLOOR STAFF, who hold bill.create/payment.create and no
--       bill.void (013), so the permission ladder and the has-payments refusal meet on one row.
--   B5  TAKEAWAY: 275.00 → 275 — the ticket whose open tap under a colleague''s replay key is
--       answered with somebody else''s document (18.8c).
set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000001';

do $$
declare
  v_out    uuid := 'a2000000-0000-4000-8000-000000000001';
  v_chaas  uuid;
  v_choice uuid;
  v_thali  uuid;
  v_heat   uuid;
  v_chilli uuid;
  v_t01    uuid;
  v_b1     uuid;
  v_b2     uuid;
  v_b4     uuid;
  v_b5     uuid;
  v_res    jsonb;
begin
  select id into v_chaas  from public.menu_items  where item_code = 'VG-2';
  select id into v_choice from public.menu_items  where item_code = 'VG-4';
  select id into v_thali  from public.menu_items  where item_code = 'VG-1';
  select g.id into v_heat from public.modifier_groups g
    join public.menu_items m on m.id = g.menu_item_id
   where m.item_code = 'VG-4' and g.name = 'Heat';
  select id into v_chilli from public.modifiers where group_id = v_heat and name = 'Extra Chilli';
  select id into v_t01     from public.restaurant_tables where code = 'T01';

  select public.create_order(v_out, 'DINE_IN', jsonb_build_array(
      jsonb_build_object('itemId', v_choice, 'quantity', 1, 'modifiers',
        jsonb_build_array(jsonb_build_object('groupId', v_heat,
          'modifierIds', jsonb_build_array(v_chilli)))),
      jsonb_build_object('itemId', v_chaas, 'quantity', 3)),
    p_table => v_t01, p_notes => 'VERIFY-BILL-1') into v_res;
  v_b1 := (v_res ->> 'id')::uuid;
  perform app.verify('18.0b the ticket the bill will snapshot is 189.97 with 0.03 of rounding onto a 190 grand total — the engine''s own answer on the row, before any billing door exists',
    v_b1 is not null
    and (v_res ->> 'status') = 'DRAFT'
    and (v_res ->> 'subtotal')::numeric = 189.97
    and (v_res ->> 'rounding_amount')::numeric = 0.03
    and (v_res ->> 'grand_total')::numeric = 190
    and (v_res ->> 'amount_due')::numeric = 190
    and (v_res ->> 'tax_amount')::numeric = 0
    and (v_res ->> 'service_charge_amount')::numeric = 0);

  select public.set_order_status(v_b1, 'PLACED')     into v_res;
  select public.set_order_status(v_b1, 'CONFIRMED')  into v_res;
  select public.set_order_status(v_b1, 'PREPARING')  into v_res;
  select public.set_order_status(v_b1, 'READY')      into v_res;
  perform app.verify('18.0c the machine walks it to READY, the rung 017 bills from, in four moves and four versions',
    (v_res ->> 'status') = 'READY' and (v_res ->> 'version')::integer = 5);

  select public.create_order(v_out, 'TAKEAWAY', jsonb_build_array(
      jsonb_build_object('itemId', v_choice, 'quantity', 2, 'modifiers',
        jsonb_build_array(jsonb_build_object('groupId', v_heat,
          'modifierIds', jsonb_build_array(v_chilli))))),
    p_notes => 'VERIFY-BILL-2') into v_res;
  v_b2 := (v_res ->> 'id')::uuid;
  -- The option is the LAST row written for this ticket (016:1155-1163), so the header can only be
  -- right if the option's own row re-arms the arithmetic. 017:285-330 attaches a recalculation
  -- trigger to order_item_modifiers for exactly this: the line insert prices 240.00, the option
  -- insert that follows it re-prices the ticket at 250.00, and the stored row equals the sum of the
  -- ticket's own lines plus its own options instead of sitting 10.00 short.
  perform app.verify('18.0d an option written after its line still reaches the header: the ticket stores 250.00 into 250 and the 10.00 option is not left out of the money',
    (v_res ->> 'subtotal')::numeric = 250
    and (v_res ->> 'rounding_amount')::numeric = 0
    and (v_res ->> 'grand_total')::numeric = 250
    and (v_res ->> 'amount_due')::numeric = 250
    and (select sum(oi.unit_price * oi.quantity
               + coalesce((select sum(m.price_adjustment * m.quantity)
                             from public.order_item_modifiers m
                            where m.order_item_id = oi.id), 0))
         from public.order_items oi
        where oi.order_id = v_b2 and oi.status = 'ACTIVE') = 250);

  select public.set_order_status(v_b2, 'PLACED')    into v_res;
  select public.set_order_status(v_b2, 'CONFIRMED') into v_res;

  select public.create_order(v_out, 'TAKEAWAY',
    jsonb_build_array(jsonb_build_object('itemId', v_chaas, 'quantity', 1)),
    p_notes => 'VERIFY-BILL-4') into v_res;
  v_b4 := (v_res ->> 'id')::uuid;
  select public.set_order_status(v_b4, 'PLACED')    into v_res;
  select public.set_order_status(v_b4, 'CONFIRMED') into v_res;
  select public.set_order_status(v_b4, 'PREPARING') into v_res;
  select public.set_order_status(v_b4, 'READY')     into v_res;

  select public.create_order(v_out, 'TAKEAWAY',
    jsonb_build_array(jsonb_build_object('itemId', v_thali, 'quantity', 1)),
    p_notes => 'VERIFY-BILL-5') into v_res;
  v_b5 := (v_res ->> 'id')::uuid;
  select public.set_order_status(v_b5, 'PLACED')    into v_res;
  select public.set_order_status(v_b5, 'CONFIRMED') into v_res;
  select public.set_order_status(v_b5, 'PREPARING') into v_res;
  select public.set_order_status(v_b5, 'READY')     into v_res;

  -- Everything counted later belongs to this scenario.
  perform app.verify('18.0e nothing has been billed yet: the money path below counts only rows 18 writes',
    (select count(*) from public.bills) = 0
    and (select count(*) from public.payments) = 0
    and (select count(*) from public.audit_log
          where action in ('bill_opened','bill_closed','bill_cancelled','payment_recorded')) = 0);
end;
$$;

-- 18.1 — the open-bill gate order. 017:612-660 reads and locks the ticket, proves the tenant,
-- proves the capability, proves the outlet is trading, and ONLY THEN asks what state the ticket is
-- in. So a ticket the floor has not served is refused with NIVAAS_INVALID_ORDER_STATUS (DRAFT,
-- CONFIRMED, PREPARING and every terminal word all get the same token — the door does not
-- enumerate which states it bills), and an order that is not yours is refused with the ABSENCE
-- token before its status is ever read (§10: never confirm that it exists).
do $$
declare
  v_b2  uuid;
  v_b1  uuid;
  v_o3  uuid;
  v_o5  uuid;
  n     integer;
begin
  select id into v_b2 from public.orders where notes = 'VERIFY-BILL-2';
  select id into v_b1 from public.orders where notes = 'VERIFY-BILL-1';
  select id into v_o3 from public.orders where notes = 'VERIFY-O3';   -- DRAFT (17.4)
  select id into v_o5 from public.orders where notes = 'VERIFY-O5';   -- CANCELLED (17.8)

  -- A DRAFT nobody has sent to the pass, a CONFIRMED ticket the kitchen still owns, and a
  -- CANCELLED one: the three states 017:625 names as not-billable, one token for all of them.
  perform app.expect_denial(format('select public.open_bill(%L::uuid)', v_o3),
    'NIVAAS_INVALID_ORDER_STATUS');
  perform app.expect_denial(format('select public.open_bill(%L::uuid)', v_b2),
    'NIVAAS_INVALID_ORDER_STATUS');
  perform app.expect_denial(format('select public.open_bill(%L::uuid)', v_o5),
    'NIVAAS_INVALID_ORDER_STATUS');
  select count(*) into n from public.audit_log where action = 'bill_opened';
  perform app.verify('18.1a a DRAFT, a CONFIRMED and a CANCELLED ticket are all refused by the status gate with the documented token, and none of the three opens a document or is audited',
    n = 0 and (select count(*) from public.bills) = 0);

  -- Absence, three ways: a fresh random id, a well-formed id nothing owns, and TENANT B''S REAL
  -- ticket. All three answers are identical, and the third one is the one worth having — the
  -- door reads the row, fails app.require_tenant_visibility, and says "not found" (011:106 writes
  -- that reasoning down for exactly this reason).
  perform app.expect_denial('select public.open_bill(gen_random_uuid())', 'NIVAAS_NOT_FOUND');
  perform app.expect_denial(
    'select public.open_bill(''c1000000-0000-4000-8000-000000000001''::uuid)', 'NIVAAS_NOT_FOUND');
  perform app.expect_denial(
    'select public.open_bill(''d0000000-0000-4000-8000-000000000001''::uuid)', 'NIVAAS_NOT_FOUND');
  select count(*) into n from public.bills;
  perform app.verify('18.1b an absent order and a foreign order give the same answer as a nonsense id — a probe of the neighbour''s money path cannot enumerate anything',
    n = 0);

  -- And the refusal is not a minting: nothing was written, and the READY ticket the probes aimed
  -- at is untouched — the counter itself is read as the table owner in 18.8e, because
  -- `document_counters` is revoked to `authenticated` outright (17.13d).
  perform app.verify('18.1c these refusals wrote no document and moved no ticket, because open_bill reaches its counter only after every gate',
    (select count(*) from public.bills) = 0
    and (select count(*) from public.audit_log
          where action in ('bill_opened','bill_closed','bill_cancelled','payment_recorded')) = 0
    and (select o.status from public.orders o where o.notes = 'VERIFY-BILL-1') = 'READY'
    and (select o.version from public.orders o where o.notes = 'VERIFY-BILL-1') = 5);
end;
$$;

-- The capability, BEFORE the state. KITCHEN_MANAGER holds kot.* and menu.view/edit and no bill key
-- at all (013's own self-check forbids it one), so aimed at a READY ticket — a state that WOULD
-- pass the gate — this seat is refused by the ladder rather than by the ticket. The order of those
-- two lines in the door is what the next label measures: 017:619 comes before 017:625.
set app.user_id to '00000000-0000-4000-8000-0000000000ad';   -- KITCHEN_MANAGER @ Main Dining

do $$
declare
  v_b1 uuid;
begin
  select id into v_b1 from public.orders where notes = 'VERIFY-BILL-1';
  perform app.expect_denial(format('select public.open_bill(%L::uuid)', v_b1),
    'NIVAAS_ACCESS_DENIED');
  perform app.expect_denial(format('select public.close_bill(%L::uuid, %L)',
    gen_random_uuid(), 'kitchen settling bills'), 'NIVAAS_NOT_FOUND');
  perform app.verify('18.1d the kitchen is refused a bill on a READY ticket with the capability token, so permission (017:619) is proven before the state gate (017:625) is ever consulted',
    (select count(*) from public.bills) = 0);
end;
$$;

set app.user_id to '00000000-0000-4000-8000-000000000001';

-- 18.2 — the document is opened. Every value below is read back off the row the door wrote, and
-- the six money keys are the engine''s, so the label is "the bill carries exactly what the one
-- server-side engine said", not "the bill carries what this file typed".
do $$
declare
  v_b1   uuid;
  v_bill uuid;
  v_res  jsonb;
  v_det  jsonb;
  v_ord  jsonb;
  n      integer;
begin
  select id into v_b1 from public.orders where notes = 'VERIFY-BILL-1';
  select public.open_bill(v_b1) into v_res;
  v_bill := (v_res ->> 'id')::uuid;

  perform app.verify('18.2a the bill is minted under the outlet''s own counter, OPEN, filed on the ticket''s trading day, with its chain read off the order and never off an argument',
    v_bill is not null
    and (v_res ->> 'bill_number') ~ '^BILL-[0-9]{6}$'
    and (v_res ->> 'status') = 'OPEN'
    and (v_res ->> 'version') = '1'
    and (v_res ->> 'currency') = 'INR'
    and (v_res ->> 'order_id') = v_b1::text
    and (v_res ->> 'organization_id') = 'a0000000-0000-4000-8000-00000000000a'
    and (v_res ->> 'property_id')     = 'a1000000-0000-4000-8000-000000000001'
    and (v_res ->> 'outlet_id')       = 'a2000000-0000-4000-8000-000000000001'
    and (v_res ->> 'business_date') =
        (select o.business_date::text from public.orders o where o.id = v_b1)
    and (v_res ->> 'created_by') = '00000000-0000-4000-8000-000000000001'
    and (v_res ->> 'paid_at') is null);

  -- §2's claim in one line: the printed document IS the engine''s answer. `orders` carries nothing
  -- but that answer (the recalculation trigger writes it there at 017:266-279), so comparing the
  -- two rows compares the door with the engine.
  perform app.verify('18.2b the document carries the engine''s six figures exactly — 189.97 / 0 / 0 / 0.03 / 190 — and opens owing its own grand total, because nothing between the engine and the row recomputes them',
    (select b.subtotal = o.subtotal
         and b.discount_amount = o.discount_amount
         and b.tax_amount = o.tax_amount
         and b.service_charge_amount = o.service_charge_amount
         and b.rounding_amount = o.rounding_amount
         and b.grand_total = o.grand_total
         and b.grand_total = b.amount_due
         and b.amount_paid = 0
       from public.bills b join public.orders o on o.id = b.order_id
      where b.id = v_bill)
    and (v_res ->> 'subtotal')::numeric = 189.97
    and (v_res ->> 'rounding_amount')::numeric = 0.03
    and (v_res ->> 'grand_total')::numeric = 190);

  -- The document''s currency is the LINES'' currency (017:655-659), because `orders` has no currency
  -- column to be read — 016:328-379 froze it per line instead — so a printed total cannot be
  -- re-labelled by whoever typed the order. And a bill born OPEN carries none of the three
  -- cancellation fields, no paid_at, and no replay key when the tap did not ask for one.
  perform app.verify('18.2d the document prints in the currency its own lines were sold in (INR, off order_items, not off an argument), and is born clean: OPEN, unpaid, uncancelled, keyless',
    (v_res ->> 'currency') = 'INR'
    and (select count(*) from information_schema.columns
          where table_schema = 'public' and table_name = 'orders'
            and column_name = 'currency') = 0
    and (select count(*) from public.order_items oi
          where oi.order_id = v_b1 and oi.currency = 'INR') = 2
    and (v_res ->> 'paid_at') is null
    and (v_res ->> 'cancelled_at') is null
    and (v_res ->> 'cancelled_by') is null
    and (v_res ->> 'cancel_reason') is null
    and (v_res ->> 'idempotency_key') is null);

  -- Rounding, measured rather than asserted: the parts do NOT sum to an integer, grand_total does,
  -- and the rounding is precisely the distance between them. A float anywhere in the engine would
  -- turn 0.03 into 0.029999999999973 and this equality would fail.
  perform app.verify('18.2c grand_total is the rounded sum of the parts and rounding_amount is exactly the distance back to it, so the printed document is payable to the rupee and internally consistent',
    (select b.grand_total = round(b.subtotal - b.discount_amount + b.tax_amount
                                  + b.service_charge_amount)
         and b.rounding_amount = b.grand_total
             - (b.subtotal - b.discount_amount + b.tax_amount + b.service_charge_amount)
         and b.grand_total = round(b.grand_total)
         and abs(b.rounding_amount) <= 1
         and b.subtotal <> round(b.subtotal)
       from public.bills b where b.id = v_bill));

  -- §7. The door does move the ticket — READY→SERVED, through app.require_order_transition — but it
  -- does it with a hand-written UPDATE at 017:697 rather than through 016''s `set_order_status`,
  -- so the machine''s own audit verb is NOT written for this step. Four moves were made through the
  -- door (18.0c) and the trail still says four: the moment the guest was handed their document is
  -- visible on the bill and invisible on the ticket.
  select to_jsonb(o) into v_ord from public.orders o where o.id = v_b1;
  select count(*) into n from public.audit_log
   where action = 'order_status_advanced' and result = 'SUCCESS' and entity_id = v_b1::text;
  perform app.verify('18.2e open_bill walks READY→SERVED through the ladder and bumps the version, yet the hand-written UPDATE at 017:697 leaves no order_status_advanced row: the trail still counts the four door moves and no fifth',
    (v_ord ->> 'status') = 'SERVED'
    and (v_ord ->> 'version')::integer = 6
    and n = 4
    and (select count(*) from public.audit_log
          where action = 'bill_opened' and entity_id = v_bill::text) = 1);

  -- A live document is one document. The replay branch (18.8) sits above this refusal on purpose;
  -- without a key this is the wall, and it counts NON-CANCELLED bills only (017:646), which 18.7h
  -- proves from the other side.
  perform app.expect_denial(format('select public.open_bill(%L::uuid)', v_b1),
    'NIVAAS_BILL_ALREADY_OPEN');
  perform app.verify('18.2f a second open of the same ticket is refused and mints nothing: one live document per ticket, one number spent, one audit row',
    (select count(*) from public.bills where order_id = v_b1) = 1
    and (select count(*) from public.audit_log
          where action = 'bill_opened' and entity_id = v_bill::text) = 1);

  -- The read door, and where §1''s "money as text" actually holds in it. The lines carry no ORDER
  -- BY (017:967-979), so which element is first is Postgres''s choice — the probe is therefore
  -- about every element, not about position 0.
  select public.bill_detail(v_bill) into v_det;
  perform app.verify('18.2g bill_detail returns the document, no payments yet, and both of the ticket''s frozen lines with the sold prices — 120.00 and 19.99 — each of them text',
    (v_det -> 'bill' ->> 'id') = v_bill::text
    and jsonb_typeof(v_det -> 'payments') = 'array'
    and jsonb_array_length(v_det -> 'payments') = 0
    and jsonb_array_length(v_det -> 'lines') = 2
    and (select count(*) from jsonb_array_elements(v_det -> 'lines') e
          where (e ->> 'unit_price') in ('120.00','19.99')) = 2
    and (select count(*) from jsonb_array_elements(v_det -> 'lines') e
          where jsonb_typeof(e -> 'unit_price') <> 'string') = 0);

  -- Said out loud instead of quietly passed: the LINE prices are cast to text (017:972, the same
  -- shape 016:order_detail uses), but the bill header is a bare `to_jsonb(b)` (017:954), so the
  -- document''s own totals leave as JSON NUMBERS. 016''s order header does the same, so this is the
  -- house shape for a row snapshot — and it means §1''s text discipline is a property of the
  -- ENGINE''s answer, not of every key the billing read doors return.
  perform app.verify('18.2h the seam 017 keeps as text is the engine''s and the line''s; the bill header money leaves as a JSON number, so a screen reading bill_detail is handed numbers for the totals it must never re-add',
    jsonb_typeof(v_det -> 'bill' -> 'grand_total') = 'number'
    and jsonb_typeof(v_det -> 'bill' -> 'rounding_amount') = 'number'
    and (select count(*) from jsonb_array_elements(v_det -> 'lines') e
          where jsonb_typeof(e -> 'unit_price') = 'string') = 2);
end;
$$;

-- 18.3 — the engine itself, read as the table owner first (its answer for the ticket that was just
-- billed, its refusal for an order that does not exist, and the catalogue facts that make "one
-- server-side engine" structural rather than a promise) and then from the client's side, where
-- 18.3g-18.3i record what the grant set and the trigger ordering actually allow.
reset role;

do $$
declare
  v_b1    uuid;
  v_b2    uuid;
  v_bill  uuid;
  v_eng   jsonb;
  v_bill2 jsonb;
begin
  select id into v_b1 from public.orders where notes = 'VERIFY-BILL-1';
  select b.id into v_bill from public.bills b where b.order_id = v_b1;
  select app.calculate_restaurant_totals(v_b1) into v_eng;
  select to_jsonb(b) into v_bill2 from public.bills b where b.id = v_bill;

  perform app.verify('18.3a the engine answers all six money keys as TEXT, at its declared scale: subtotal 189.97, tax and service charge 0.00, rounding 0.03, grand total 190 — an amount each, never a percentage',
    jsonb_typeof(v_eng -> 'subtotal') = 'string'
    and jsonb_typeof(v_eng -> 'discount_amount') = 'string'
    and jsonb_typeof(v_eng -> 'tax_amount') = 'string'
    and jsonb_typeof(v_eng -> 'service_charge_amount') = 'string'
    and jsonb_typeof(v_eng -> 'rounding_amount') = 'string'
    and jsonb_typeof(v_eng -> 'grand_total') = 'string'
    and (v_eng ->> 'subtotal') = '189.97'
    and (v_eng ->> 'rounding_amount') = '0.03'
    and (v_eng ->> 'grand_total') = '190'
    and (v_eng ->> 'tax_amount') = '0.00'
    and (v_eng ->> 'service_charge_amount') = '0.00'
    and (v_eng ->> 'discount_amount') = '0.00');

  -- Re-running the engine AFTER the bill exists must return the same figures, because the bill is
  -- the same lines; the text forms are compared here (owner-side, where the engine is reachable)
  -- while 18.2b compared the rows numerically.
  perform app.verify('18.3b the row the door wrote agrees with the engine''s live answer, key for key — the bill is the engine''s output stored, not a second calculation',
    (v_bill2 ->> 'subtotal')::numeric = (v_eng ->> 'subtotal')::numeric
    and (v_bill2 ->> 'discount_amount')::numeric = (v_eng ->> 'discount_amount')::numeric
    and (v_bill2 ->> 'tax_amount')::numeric = (v_eng ->> 'tax_amount')::numeric
    and (v_bill2 ->> 'service_charge_amount')::numeric =
        (v_eng ->> 'service_charge_amount')::numeric
    and (v_bill2 ->> 'rounding_amount')::numeric = (v_eng ->> 'rounding_amount')::numeric
    and (v_bill2 ->> 'grand_total')::numeric = (v_eng ->> 'grand_total')::numeric);

  perform app.expect_denial('select app.calculate_restaurant_totals(gen_random_uuid())',
    'NIVAAS_NOT_FOUND');
  perform app.verify('18.3c the engine refuses an order that is not there with the same absence token the doors use, and computes nothing for it',
    (select count(*) from public.bills) = 1);

  -- One engine, and no door that lets a client name a total. `p_amount` on record_payment is the
  -- cash the guest handed over — a fact about the till, not a price — and it is the only money a
  -- billing door accepts.
  perform app.verify('18.3d exactly one server-side engine exists, open_bill takes a ticket and a replay key and nothing else, and no billing door accepts a price, a tax, a service charge, a rounding, a discount or a total',
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'app' and p.proname = 'calculate_restaurant_totals') = 1
    and (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'open_bill'
            and p.proargnames = array['p_order','p_idempotency_key']) = 1
    and (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname in ('open_bill','close_bill','record_payment','cancel_bill','bill_detail')
            and exists (select 1 from unnest(p.proargnames) a
                         where a in ('p_subtotal','p_discount_amount','p_tax_amount',
                                     'p_service_charge_amount','p_rounding_amount','p_grand_total',
                                     'p_amount_due','p_amount_paid','p_unit_price','p_price',
                                     'p_currency','p_business_date','p_outlet'))) = 0);

  -- The grant inventory for the doors. The engine's own grant is asserted where it can be seen from
  -- the inside, in 18.3g/18.3h — it is NOT revoked, which is a finding, not a expectation.
  perform app.verify('18.3e authenticated holds EXECUTE on exactly the five billing doors 017 grants it — open, settle, take money, void, read — and service_role holds the same five',
    has_function_privilege('authenticated','public.open_bill(uuid,text)','execute')
    and has_function_privilege('authenticated','public.close_bill(uuid,text,integer)','execute')
    and has_function_privilege('authenticated',
        'public.record_payment(uuid,numeric,text,text,text,integer,text)','execute')
    and has_function_privilege('authenticated','public.cancel_bill(uuid,text,integer)','execute')
    and has_function_privilege('authenticated','public.bill_detail(uuid)','execute')
    and has_function_privilege('service_role','public.open_bill(uuid,text)','execute')
    and (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname in ('open_bill','close_bill','record_payment','cancel_bill','bill_detail')
            and p.prosecdef = false) = 0);

  -- Every money column 017 touched is unconstrained numeric with the scale held by a CHECK — §1's
  -- `numeric(10,2)` ban, read from the catalog instead of from a comment. A silently rounded column
  -- would make the engine's "money at its declared scale" meaningless.
  perform app.verify('18.3f no money column on orders, bills or payments is numeric(precision,scale): every one is bare numeric, bounded by scale(trim_scale(x)) <= 2 instead, so a stored 19.99 stays 19.99',
    (select count(*) from information_schema.columns c
      where c.table_schema = 'public' and c.table_name in ('orders','bills','payments')
        and c.column_name in ('subtotal','discount_amount','tax_amount','service_charge_amount',
                              'rounding_amount','grand_total','amount_paid','amount_due','amount',
                              'unit_price','price_adjustment','tax_rate')
        and (c.numeric_precision is not null or c.data_type <> 'numeric')) = 0
    and (select count(*) from pg_constraint
          where conname in ('orders_money_ok','bills_money_ok','payments_money_ok')
            and contype = 'c' and pg_get_constraintdef(oid) like '%trim_scale%') = 3);

  -- 18.3i — the arithmetic a ticket''s own rows imply, the arithmetic the engine reports, and the
  -- arithmetic the header stores are ONE figure. 016:1155-1163 writes an option row after the line
  -- it belongs to, so a recalculation trigger on lines alone leaves the header priced before the
  -- option existed; B2 is built to be that ticket (its option is the last row written for it), and
  -- 017''s second trigger is what makes the header absorb it.
  select id into v_b2 from public.orders where notes = 'VERIFY-BILL-2';
  select app.calculate_restaurant_totals(v_b2) into v_eng;
  perform app.verify('18.3i an option written after its line reaches the header: rows, engine and stored money all say 250.00 into 250, so a printed document and the ticket under it cannot disagree',
    (v_eng ->> 'subtotal') = '250.00'
    and (v_eng ->> 'grand_total') = '250'
    and (select o.subtotal from public.orders o where o.id = v_b2) = 250
    and (select o.grand_total from public.orders o where o.id = v_b2) = 250
    and (select sum(oi.unit_price * oi.quantity
               + coalesce((select sum(m.price_adjustment * m.quantity)
                             from public.order_item_modifiers m
                            where m.order_item_id = oi.id), 0))
         from public.order_items oi
        where oi.order_id = v_b2 and oi.status = 'ACTIVE') = 250
    and (select count(*) from public.order_item_modifiers m
          join public.order_items oi on oi.id = m.order_item_id
         where oi.order_id = v_b2) = 1);

end;
$$;

-- 18.3g/18.3h/18.3i — the seam, measured from the client''s side of it. The engine reads an order by
-- id with NO tenant check (017:72-73) because every door that calls it made one first — which is
-- only a rule while the helper stays off the client surface, and Postgres grants a NEW function to
-- PUBLIC. 017''s grants block revokes it and 016''s revokes the number mint beside it, so both ways a
-- screen had of reaching the arithmetic or the counter directly now refuse at the privilege layer:
-- before the body runs, before RLS, before a stranger''s row is read or a day''s number is spent.
set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000001';

select app.expect_denial('select app.calculate_restaurant_totals(gen_random_uuid())',
  'permission denied');
-- Tenant B''s ticket from 18.0a. RLS already shows tenant A nothing (18.3h counts it) and open_bill
-- already answers it as absent (18.1b); what the revoke closes is the OTHER way to ask — a screen
-- could formerly tell a stranger''s ₹400 ticket from no ticket at all by which subtotal came back.
select app.expect_denial('select app.calculate_restaurant_totals('
                      || '''d0000000-0000-4000-8000-000000000001''::uuid)', 'permission denied');
select app.expect_denial('select app.next_document_number('
                      || '''a0000000-0000-4000-8000-00000000000a''::uuid, '
                      || '''a1000000-0000-4000-8000-000000000001''::uuid, '
                      || '''a2000000-0000-4000-8000-000000000001''::uuid, ''ORD'', current_date)',
  'permission denied');

do $$
declare
  v_bill_id uuid;
  v_det     jsonb;
  v_order   jsonb;
  o1        uuid;
  n         integer;
begin
  perform app.verify('18.3g the engine and the number mint are helpers, not doors: authenticated and anon hold no EXECUTE on either, so §2''s "the arithmetic is server-side" is a grant rather than a comment',
    not has_function_privilege('authenticated','app.calculate_restaurant_totals(uuid)','execute')
    and not has_function_privilege('anon','app.calculate_restaurant_totals(uuid)','execute')
    and not has_function_privilege('authenticated','app.recalc_order_money(uuid)','execute')
    and not has_function_privilege('authenticated',
        'app.next_document_number(uuid,uuid,uuid,text,date)','execute'));

  -- The cut has to be one-sided. If revoking the helper also silenced the doors that call it, this
  -- would be a broken migration rather than a wall — so the served role reads its own document back
  -- through a DOOR and the engine''s figure is still there, while tenant B''s ticket stays invisible.
  select b.id into v_bill_id from public.bills b
    where b.order_id = (select id from public.orders where notes = 'VERIFY-BILL-1');
  select public.bill_detail(v_bill_id) into v_det;
  select id into o1 from public.orders where notes = 'VERIFY-BILL-1';
  select count(*) into n from public.orders
    where id = 'd0000000-0000-4000-8000-000000000001';
  perform app.verify('18.3h the revoke is one-sided: the door that calls the engine still answers this tenant''s bill at 189.97/190, while tenant B''s ticket stays invisible to RLS and unreachable through the helper',
    n = 0
    and (v_det -> 'bill' ->> 'subtotal')::numeric = 189.97
    and (v_det -> 'bill' ->> 'grand_total')::numeric = 190
    and (v_det -> 'bill' ->> 'amount_due')::numeric = 190);

  -- DEFECT, asserted as the code leaves it: §1's "money never crosses the seam as a float" is
  -- implemented per-door rather than per-domain, and the split runs through the MIDDLE of a single
  -- response. 016:1599-1601 and 017:967-976 hand-build each LINE with `unit_price::text`, so a line
  -- arrives as a string; both headers are `to_jsonb(row)` (016:1608, 017:954), so the ticket and the
  -- document under those same lines arrive as JSON numbers — 189.97 as a number a JavaScript client
  -- can put straight into a float. The two shapes are measured side by side so the asymmetry cannot
  -- be forgotten between the halves of one payload. Fixing it changes a delivered response shape, so
  -- it is a decision for the owner alongside the client''s money parsing, not something a verifier
  -- assertion may silently accept.
  select public.order_detail(o1) into v_order;
  perform app.verify('18.3j DEFECT (§1, one response two shapes): line money is TEXT while the order and bill headers carrying those lines are JSON NUMBERS — 189.97 as "189.97" for a dish and 189.97 for the ticket it sits on',
    jsonb_typeof(v_det -> 'lines' -> 0 -> 'unit_price') = 'string'
    and jsonb_typeof(v_det -> 'bill' -> 'subtotal') = 'number'
    and jsonb_typeof(v_order -> 'items' -> 0 -> 'unit_price') = 'string'
    and jsonb_typeof(v_order -> 'subtotal') = 'number');
end;
$$;

-- 18.4 — money onto the document (§41). The only money a client may hand a billing door is the
-- cash the guest actually gave in: record_payment's p_amount (017:771). Every balance on the row is
-- the DOOR''s arithmetic (017:837-838), and 017:845 refuses anything past the balance instead of
-- letting a counter typo drive amount_due below zero — bills_money_ok's `amount_due >= 0` (017:410)
-- is the wall underneath that decision, and it is why the refusal arrives as a domain token rather
-- than as a constraint error.
set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000001';

do $$
declare
  v_b1   uuid;
  v_bill uuid;
  v_pay  jsonb;
  v_row  jsonb;
  n      integer;
begin
  select id into v_b1 from public.orders where notes = 'VERIFY-BILL-1';
  select id into v_bill from public.bills where order_id = v_b1;

  select public.record_payment(v_bill, 100.00, 'UPI',
    p_reference_id => 'UTX-VERIFY-7731', p_notes => 'half now, half on the card',
    p_expected_version => 1) into v_pay;
  select to_jsonb(b) into v_row from public.bills b where b.id = v_bill;
  perform app.verify('18.4a a partial payment books one SUCCESSFUL row with its own PAY number, and the document''s balances move by the door''s own arithmetic — 100 paid, 90 due, PARTIALLY_PAID, one version: the client named the cash it was handed and nothing else',
    (v_pay ->> 'status') = 'SUCCESSFUL'
    and (v_pay ->> 'amount')::numeric = 100
    and (v_pay ->> 'method') = 'UPI'
    and (v_pay ->> 'reference_id') = 'UTX-VERIFY-7731'
    and (v_pay ->> 'payment_number') ~ '^PAY-[0-9]{6}$'
    and (v_pay ->> 'currency') = 'INR'
    and (v_pay ->> 'bill_id') = v_bill::text
    and (v_pay ->> 'order_id') = v_b1::text
    and (v_pay ->> 'created_by') = '00000000-0000-4000-8000-000000000001'
    and (v_pay ->> 'version')::integer = 1
    and (v_row ->> 'amount_paid')::numeric = 100
    and (v_row ->> 'amount_due')::numeric = 90
    and (v_row ->> 'grand_total')::numeric = 190
    and (v_row ->> 'status') = 'PARTIALLY_PAID'
    and (v_row ->> 'version')::integer = 2);

  -- §41's overpayment, at the paisa and by a whole rupee. Both are refused BEFORE anything is
  -- written (017:835-846 computes, then 017:852 mints), so a typo costs no PAY number and leaves
  -- no orphan row.
  perform app.expect_denial(
    format('select public.record_payment(%L::uuid, 90.01, ''CASH'')', v_bill),
    'NIVAAS_INVALID_MONEY');
  perform app.expect_denial(
    format('select public.record_payment(%L::uuid, 91, ''CASH'')', v_bill),
    'NIVAAS_INVALID_MONEY');
  select count(*) into n from public.payments where bill_id = v_bill;
  perform app.verify('18.4b two overpayments are refused and nothing at all is spent by them: one payment row, the balances exactly where the first payment left them',
    n = 1
    and (select amount_paid from public.bills where id = v_bill) = 100
    and (select amount_due from public.bills where id = v_bill) = 90
    and (select version from public.bills where id = v_bill) = 2);

  -- Zero, negative, and a method the vocabulary does not know. The last two probes are aimed at a
  -- bill that does not exist and STILL answer with the money/method token instead of
  -- NIVAAS_NOT_FOUND — 017:798-800 sits above the bill read at 017:805, which is the proof that a
  -- client cannot smuggle in a negative "refund" row at all: money in is the only verb this door
  -- has, and corrections belong to #05 (017:840-844 says so out loud).
  perform app.expect_denial(
    format('select public.record_payment(%L::uuid, 0, ''CASH'')', v_bill), 'NIVAAS_INVALID_MONEY');
  perform app.expect_denial(
    format('select public.record_payment(%L::uuid, -100, ''CASH'')', v_bill),
    'NIVAAS_INVALID_MONEY');
  perform app.expect_denial(
    'select public.record_payment(gen_random_uuid(), -100, ''CASH'')', 'NIVAAS_INVALID_MONEY');
  perform app.expect_denial(
    format('select public.record_payment(%L::uuid, 50, ''CHEQUE'')', v_bill),
    'NIVAAS_INVALID_PAYMENT_METHOD');
  perform app.expect_denial(
    'select public.record_payment(gen_random_uuid(), 50, ''CHEQUE'')',
    'NIVAAS_INVALID_PAYMENT_METHOD');
  perform app.verify('18.4c the money and method gates answer before the document is even read, so five refused taps leave the bill and the row count exactly as 18.4b left them',
    (select count(*) from public.payments) = 1
    and (select amount_due from public.bills where id = v_bill) = 90
    and (select version from public.bills where id = v_bill) = 2);

  select public.record_payment(v_bill, 90.00, 'CASH',
    p_reference_id => 'verify-till-1', p_expected_version => 2) into v_pay;
  select to_jsonb(b) into v_row from public.bills b where b.id = v_bill;
  perform app.verify('18.4d paying the balance to the paisa lands the document on PAID with 0 due, and the two rows sum to the grand total without anybody subtracting anything on the way',
    (v_row ->> 'amount_paid')::numeric = 190
    and (v_row ->> 'amount_due')::numeric = 0
    and (v_row ->> 'status') = 'PAID'
    and (v_row ->> 'version')::integer = 3
    and (select sum(p.amount) from public.payments p where p.bill_id = v_bill) = 190
    and (select count(*) from public.payments p where p.bill_id = v_bill
          and p.status = 'SUCCESSFUL') = 2);

  -- Stated rather than smoothed over: a bill whose money arrived in full has NO paid_at. 017
  -- stamps that column only inside close_bill (017:754), so "the till has the money" and "a human
  -- closed this document" are two facts on one row. A screen that reads paid_at as "settled" would
  -- be wrong about a fully paid bill; the status is the money fact, the timestamp is the decision.
  perform app.verify('18.4e fully paid but not yet closed: paid_at is still NULL, because taking the money and signing off the document are different verbs in 017',
    (select paid_at from public.bills where id = v_bill) is null);

  -- The floor, one more time from the door side: a bill at 0 due cannot take even one paisa, and
  -- a paisa is what a "rounding it up" client would have tried to book.
  perform app.expect_denial(
    format('select public.record_payment(%L::uuid, 0.01, ''CASH'')', v_bill),
    'NIVAAS_INVALID_MONEY');
  perform app.verify('18.4f one paisa past zero is refused: through this door amount_due can reach 0 and never cross it, and no negative payment row exists anywhere',
    (select amount_due from public.bills where id = v_bill) = 0
    and (select count(*) from public.payments where amount < 0) = 0
    and (select count(*) from public.bills where amount_due < 0) = 0);

  perform app.verify('18.4g every accepted payment is exactly one SUCCESS audit row and no refusal above left a trail of any kind',
    (select count(*) from public.audit_log where action = 'payment_recorded'
          and result = 'SUCCESS') = 2
    and (select count(*) from public.audit_log where action = 'payment_recorded') = 2
    and (select count(*) from public.audit_log where action in ('bill_closed','bill_cancelled')) = 0);
end;
$$;

-- 18.5 — close_bill: the document''s own moment (§42/§45). 017:744-750 asks, in this order: the
-- row exists, it is your tenant, you hold bill.create, your version is current, you said why, and
-- ONLY THEN whether the money is in. A close is therefore refused for a stale screen or a missing
-- sentence before it is refused for an unpaid bill; the first two gates are measured below on the
-- settled document and the third on an unpaid one in 18.7c, because refusing a bill that IS paid
-- would prove nothing.
do $$
declare
  v_b1    uuid;
  v_bill  uuid;
  v_row   jsonb;
  v_order jsonb;
  n       integer;
begin
  select id into v_b1 from public.orders where notes = 'VERIFY-BILL-1';
  select id into v_bill from public.bills where order_id = v_b1;

  -- Version before reason: a stale screen holding a blank reason is answered as a conflict,
  -- because 017:744 fires before 017:745 ever looks at the sentence. The third gate, the money
  -- (017:748), is measured in 18.7c on a bill nobody has paid — it cannot be measured here, where
  -- BILL-1 is settled, and a probe that "refused" an already-paid bill would be testing nothing.
  perform app.expect_denial(format(
    'select public.close_bill(%L::uuid, '''', 1)', v_bill), 'NIVAAS_VERSION_CONFLICT');
  perform app.expect_denial(format(
    'select public.close_bill(%L::uuid, ''   '', 3)', v_bill), 'NIVAAS_REASON_REQUIRED');
  perform app.verify('18.5a the close gate order is the documented one — a stale version outranks a missing sentence — and both refusals changed nothing on the row',
    (select version from public.bills where id = v_bill) = 3
    and (select status from public.bills where id = v_bill) = 'PAID'
    and (select count(*) from public.audit_log where action = 'bill_closed') = 0);

  select public.close_bill(v_bill, 'guest left, table cleared', 3) into v_row;
  select to_jsonb(o) into v_order from public.orders o where o.id = v_b1;
  perform app.verify('18.5b the close is the document''s own event: PAID with a paid_at, one version, one bill_closed row carrying the sentence that justified it',
    (v_row ->> 'status') = 'PAID'
    and (v_row ->> 'version')::integer = 4
    and (v_row ->> 'paid_at') is not null
    and (select count(*) from public.audit_log
          where action = 'bill_closed' and entity_id = v_bill::text
            and result = 'SUCCESS' and reason = 'guest left, table cleared') = 1
    and (select paid_at from public.bills where id = v_bill) is not null);

  -- This is where 017 and 016 disagree by construction. 016:770 hands the SERVED→COMPLETED edge to
  -- "017's settlement", and 017's settlement (017:752-761) updates the BILL and nothing else: no
  -- machine call, no version bump on the ticket, no closed_at. The asserted truth is therefore that
  -- the ticket is left SERVED — which also means the cover T01 is still derived as occupied by a
  -- bill the guest has paid and walked away from. Reported as a defect, not softened here.
  perform app.verify('18.5c what close_bill actually does to the ORDER is nothing: the ticket stays SERVED at the version open_bill left it, closed_at is NULL, and the COMPLETED edge 016:770 attributes to this door has no taker',
    (v_order ->> 'status') = 'SERVED'
    and (v_order ->> 'version')::integer = 6
    and (v_order ->> 'closed_at') is null
    and (select count(*) from public.audit_log
          where action = 'order_status_advanced' and entity_id = v_b1::text) = 4);

  -- And the immutability this door was documented to have (§45: a closed bill is finished). There
  -- is no guard: 017:748 only re-checks amount_due, which a closed bill still satisfies, so a
  -- second close succeeds, re-stamps paid_at, bumps the version again and writes a SECOND
  -- bill_closed row. 18.5d asserts the behaviour the code has and names the missing check; the
  -- refusal a screen will actually see is the version conflict, not an "already closed" token —
  -- NIVAAS_BILL_ALREADY_CLOSED does not exist anywhere in 017.
  select public.close_bill(v_bill, 'the same close, tapped twice', 4) into v_row;
  select count(*) into n from public.audit_log where action = 'bill_closed'
    and entity_id = v_bill::text;
  perform app.verify('18.5d a second close is NOT refused as immutable: it succeeds, re-stamps paid_at, moves the version to 5 and leaves two bill_closed rows — 017:744''s optimistic version is the only thing standing between a double tap and a restated close',
    (v_row ->> 'version')::integer = 5
    and (v_row ->> 'status') = 'PAID'
    and n = 2);
end;
$$;

-- 18.6 — §9, measured on a BILL instead of an order line: a printed document is a snapshot, and the
-- two ways a restaurant tries to restate history both have to bounce off it. (1) the menu is
-- repriced through 014's own door; (2) the ticket''s line is retired through 016's own door, which
-- fires 017's recalculation trigger (017:285-287) and moves the ORDER''s money.
--
-- What the code really does: app.recalculate_order_totals (017:266-279) writes `orders` and never
-- touches `bills`. So the bill is frozen not because something guards it but because nothing in
-- this migration has a path to it — the assertion below is "the order moves, the bill does not",
-- which is what §9 wants even though the mechanism is an absence rather than a wall.
set app.user_id to '00000000-0000-4000-8000-000000000001';

do $$
declare
  v_b1     uuid;
  v_bill   uuid;
  v_chaas  uuid;
  v_line   uuid;
  v_res    jsonb;
  v_row    jsonb;
begin
  select id into v_b1 from public.orders where notes = 'VERIFY-BILL-1';
  select id into v_bill from public.bills where order_id = v_b1;
  select id into v_chaas from public.menu_items where item_code = 'VG-2';

  -- (1) the menu moves on: 19.99 closes, 25.00 opens, history kept (014's price rows).
  select public.set_menu_item_price(v_chaas, 25.00, p_reason => 'amaranth chaas repricing')
    into v_res;
  select to_jsonb(b) into v_row from public.bills b where b.id = v_bill;
  perform app.verify('18.6a a reprice of the dish cannot restate the document it sold: the menu''s open row is now 25.00, the frozen line is still 19.99, and the bill is still 189.97 into 190 closed and paid',
    (v_res ->> 'unit_price') = '25.00'
    and (select count(*) from public.menu_item_prices p
          where p.menu_item_id = v_chaas and p.effective_to is null
            and p.unit_price = 25.00) = 1
    and (select count(*) from public.menu_item_prices p
          where p.menu_item_id = v_chaas and p.effective_to is not null
            and p.unit_price = 19.99) = 1
    and (select oi.unit_price from public.order_items oi
          where oi.order_id = v_b1 and oi.item_code_snapshot = 'VG-2') = 19.99
    and (v_row ->> 'subtotal')::numeric = 189.97
    and (v_row ->> 'grand_total')::numeric = 190
    and (v_row ->> 'amount_paid')::numeric = 190
    and (v_row ->> 'status') = 'PAID');

  -- (2) the line moves: retired through 016's door, which is what re-arms 017's recalculation.
  select id into v_line from public.order_items
    where order_id = v_b1 and item_code_snapshot = 'VG-2';
  select public.void_order_item(v_line, 'guest sent the plate back', 1) into v_res;
  select to_jsonb(o) into v_row from public.orders o where o.id = v_b1;
  perform app.verify('18.6b a retired line moves the ticket''s money to the engine''s new answer — 130.00 into 130 — while the closed bill is untouched at 189.97 into 190, because 017''s recalculation writes orders and has no path to bills',
    (v_res ->> 'status') = 'VOIDED'
    and (v_row ->> 'subtotal')::numeric = 130
    and (v_row ->> 'grand_total')::numeric = 130
    and (v_row ->> 'rounding_amount')::numeric = 0
    and (select count(*) from public.order_items oi
          where oi.order_id = v_b1 and oi.status = 'ACTIVE') = 1
    and (select subtotal from public.bills where id = v_bill) = 189.97
    and (select grand_total from public.bills where id = v_bill) = 190
    and (select amount_paid from public.bills where id = v_bill) = 190
    and (select version from public.bills where id = v_bill) = 5);

  -- §41's floor, arrived at the honest way: 190 paid on a ticket now worth 130. The column would
  -- have to go negative and 017:278 floors it with greatest(..., 0) instead, which is orders'' own
  -- `amount_due >= 0` CHECK (017:216) obeyed rather than a domain refusal — so a guest who paid in
  -- full and then had a plate taken back is shown "nothing owed", never a credit the till has to
  -- chase. There is no refund door in this build to turn that into money going out.
  perform app.verify('18.6c money in the till (190) past a shrunken ticket (130) floors the order''s balance at 0: no negative due, no phantom credit, and the payment rows still add up to the rupees actually taken',
    (v_row ->> 'amount_due')::numeric = 0
    and (select count(*) from public.payments p
          join public.bills b on b.id = p.bill_id
         where b.order_id = v_b1 and p.amount > 0) = 2
    and (select sum(p.amount) from public.payments p
          join public.bills b on b.id = p.bill_id
         where b.order_id = v_b1) = 190
    and (select count(*) from public.orders o where o.amount_due < 0) = 0);

end;
$$;

-- Now the same fact from the side a client cannot stand on: the engine RE-RUN for the ticket the
-- bill was printed from answers 130.00/130 and the printed document still says 189.97/190. Those
-- two numbers disagreeing is §9 working as designed — the guest was charged the rupees on the
-- document, and the ticket's running balance is a different thing (017:231-232 says exactly that).
-- The two column walls the arithmetic leans on are probed here too, because app.expect_denial is
-- SECURITY INVOKER: run as `authenticated` a hand-written negative due would be stopped by the
-- grant revocation and would prove nothing about the CHECK.
reset role;

do $$
declare
  v_b1   uuid;
  v_bill uuid;
  v_eng  jsonb;
begin
  select id into v_b1 from public.orders where notes = 'VERIFY-BILL-1';
  select id into v_bill from public.bills where order_id = v_b1;
  select app.calculate_restaurant_totals(v_b1) into v_eng;
  perform app.verify('18.6d the engine now answers 130.00 into 130 for the very ticket whose bill reads 189.97 into 190 — the printed document and the live calculation are allowed to disagree, and the document is the one the guest was charged under',
    (v_eng ->> 'subtotal') = '130.00'
    and (v_eng ->> 'grand_total') = '130'
    and (v_eng ->> 'rounding_amount') = '0.00'
    and (select subtotal from public.bills where id = v_bill) = 189.97
    and (select grand_total from public.bills where id = v_bill) = 190
    and (select amount_due from public.bills where id = v_bill) = 0);

  perform app.expect_denial(format(
    'update public.orders set amount_due = -0.01 where id = %L::uuid', v_b1),
    'orders_money_ok');
  perform app.expect_denial(format(
    'update public.bills set amount_due = -1 where id = %L::uuid', v_bill),
    'bills_money_ok');
  perform app.expect_denial(format(
    'update public.bills set subtotal = 189.975 where id = %L::uuid', v_bill),
    'bills_money_ok');
  perform app.verify('18.6e the balance floor and the two-decimal scale are COLUMN facts, not door conventions: the table owner itself is refused a negative due on either side of the seam and a third decimal on the snapshot',
    (select amount_due from public.orders where id = v_b1) = 0
    and (select amount_due from public.bills where id = v_bill) = 0
    and (select subtotal from public.bills where id = v_bill) = 189.97
    and (select count(*) from pg_constraint
          where conname in ('orders_money_ok','bills_money_ok','payments_money_ok')
            and contype = 'c') = 3);
end;
$$;

-- ============================================================================
-- 18.7 — cancel_bill: the privileged reversal, and the five gates standing in
-- front of it.
--
-- 013 laddered the void deliberately — a floor seat may print a document and take money, and only
-- manager level and above may take a document back. 017:963-979 then locks and reads the row,
-- proves the tenant (968), proves the key (972), proves the version (973), proves the sentence
-- (974), and ONLY LAST asks whether money is on the document (977-979). Every refusal below aims
-- at ONE open, unpaid bill, so each is the gate answering rather than the row's state answering.
-- ============================================================================

-- The two ticket ids are captured where RLS cannot hide them: the rooftop seat used at 18.7c is
-- carved to the OTHER restaurant (17.12a), so it cannot read a Main Dining ticket back in order to
-- name it — and a probe aimed at a NULL would prove nothing at all.
reset role;
select id::text as b4_oid from public.orders where notes = 'VERIFY-BILL-4' \gset
select id::text as b5_oid from public.orders where notes = 'VERIFY-BILL-5' \gset

set role authenticated;
set app.user_id to '00000000-0000-4000-8000-0000000000ac';   -- STAFF @ Main Dining

-- 18.7a — the document FLOOR STAFF opens, on the ticket 18.0 left READY. Its money is the engine's
-- own answer on a single 19.99 plate (0.01 of rounding onto 20) and its author is the staff seat,
-- because `created_by` is the session's id read inside the door, never an argument.
do $$
declare
  v_b4  uuid;
  v_res jsonb;
begin
  select id into v_b4 from public.orders where notes = 'VERIFY-BILL-4';
  select public.open_bill(v_b4) into v_res;
  perform app.verify('18.7a floor staff open a document the engine priced: 19.99 into 20 with 0.01 of rounding, born OPEN at version one and owing its own total, authored by the seat that tapped it',
    (v_res ->> 'subtotal')::numeric = 19.99
    and (v_res ->> 'rounding_amount')::numeric = 0.01
    and (v_res ->> 'grand_total')::numeric = 20
    and (v_res ->> 'amount_paid')::numeric = 0
    and (v_res ->> 'amount_due')::numeric = 20
    and (v_res ->> 'status') = 'OPEN'
    and (v_res ->> 'version')::integer = 1
    and (v_res ->> 'bill_number') ~ '^BILL-[0-9]{6}$'
    and (v_res ->> 'created_by') = '00000000-0000-4000-8000-0000000000ac'
    and (v_res ->> 'idempotency_key') is null);

  -- The opener is not the un-opener. 013 gave this seat bill.create and payment.create and
  -- deliberately NOT bill.void, so the void is refused by the ladder while the ticket it belongs to
  -- is in the one state that would otherwise allow it.
  perform app.expect_denial(format(
    'select public.cancel_bill(%L::uuid, %L, 1)', (v_res ->> 'id')::uuid,
    'a floor server taking their own ticket back'), 'NIVAAS_ACCESS_DENIED');
  perform app.verify('18.7b the void is a manager''s key, not the opener''s: the seat that printed this document cannot void it, and the refusal left it OPEN at version one with nothing cancelled',
    (select b.status from public.bills b where b.order_id = v_b4
          and b.status <> 'CANCELLED') = 'OPEN'
    and (select b.version from public.bills b where b.order_id = v_b4
          and b.status <> 'CANCELLED') = 1
    and (select b.cancelled_at from public.bills b where b.order_id = v_b4
          and b.status <> 'CANCELLED') is null
    and (select count(*) from public.bills where order_id = v_b4) = 1);
end;
$$;

-- The document id, captured from the seat that just wrote it (bills_outlet_read lets floor staff
-- read its own restaurant's paper) so the next probe can aim at a real row from a seat that cannot
-- read it back.
select b.id::text as bill4 from public.bills b join public.orders o on o.id = b.order_id
 where o.notes = 'VERIFY-BILL-4' \gset

set app.user_id to '00000000-0000-4000-8000-0000000000af';   -- RESTAURANT_MANAGER, Rooftop ONLY

select app.expect_denial(format(
  'select public.cancel_bill(%L::uuid, %L, 1)', :'bill4'::uuid,
  'a rooftop manager voiding another restaurant''s document'), 'NIVAAS_ACCESS_DENIED');

do $$
begin
  -- The same token as the staff refusal above, from the opposite reason: this seat DOES hold
  -- bill.void, at the rooftop counter. 017:972 hands the outlet to the ladder, so the same
  -- restaurant keys stop at a restaurant line inside one tenant (17.12 proved the read side).
  perform app.verify('18.7c and the second refusal is scope, not ability: this manager does hold bill.void — at the rooftop counter — while Main Dining answers nothing to them',
    app.has_permission('00000000-0000-4000-8000-0000000000af'::uuid,
      'a0000000-0000-4000-8000-00000000000a'::uuid, 'bill.void',
      'a1000000-0000-4000-8000-000000000001'::uuid,
      'a2000000-0000-4000-8000-000000000002'::uuid)
    and not app.has_permission('00000000-0000-4000-8000-0000000000af'::uuid,
      'a0000000-0000-4000-8000-00000000000a'::uuid, 'bill.void',
      'a1000000-0000-4000-8000-000000000001'::uuid,
      'a2000000-0000-4000-8000-000000000001'::uuid));
end;
$$;

set app.user_id to '00000000-0000-4000-8000-000000000001';   -- ORG OWNER (holds bill.void here)

do $$
declare
  v_b1    uuid;
  v_bill1 uuid;
  v_b4    uuid;
  v_bill4 uuid;
  v_row   jsonb;
  n       integer;
begin
  select id into v_b4 from public.orders where notes = 'VERIFY-BILL-4';
  select id into v_bill4 from public.bills where order_id = v_b4 and status = 'OPEN';

  -- Version BEFORE reason: a stale screen that also forgot to say why is answered as a conflict,
  -- because 017:973 fires before 017:974 ever looks at the sentence. The same pair the close door
  -- was measured on at 18.5a, on the void.
  perform app.expect_denial(format(
    'select public.cancel_bill(%L::uuid, %L, 99)', v_bill4, 'a stale screen'),
    'NIVAAS_VERSION_CONFLICT');
  perform app.expect_denial(format(
    'select public.cancel_bill(%L::uuid, %L, 1)', v_bill4, '   '),
    'NIVAAS_REASON_REQUIRED');
  perform app.verify('18.7d the void asks the version before it asks the sentence — a stale screen is answered as a conflict, not as a formatting complaint — and neither refusal touched the document',
    (select b.version from public.bills b where b.id = v_bill4) = 1
    and (select b.status from public.bills b where b.id = v_bill4) = 'OPEN'
    and (select b.cancel_reason from public.bills b where b.id = v_bill4) is null);

  -- The money gate LAST, aimed at the document that has money on it. Both of the gates above it
  -- are satisfied here (the version is current, the sentence is real), so the token that comes
  -- back can only be 017:977's — a void is not a refund, and this build has no refund door (#05).
  select id into v_b1 from public.orders where notes = 'VERIFY-BILL-1';
  select id into v_bill1 from public.bills where order_id = v_b1;
  perform app.expect_denial(format(
    'select public.cancel_bill(%L::uuid, %L, 5)', v_bill1,
    'the guest disputes a settled document'), 'NIVAAS_BILL_HAS_PAYMENTS');
  perform app.verify('18.7e a settled document cannot be voided from behind the counter: the version and the sentence it needed were both already satisfied, so the answer is money''s own token — and 190.00 of rupees the till is holding stays on the row',
    (select b.status from public.bills b where b.id = v_bill1) = 'PAID'
    and (select b.amount_paid from public.bills b where b.id = v_bill1) = 190
    and (select b.version from public.bills b where b.id = v_bill1) = 5
    and (select b.cancelled_at from public.bills b where b.id = v_bill1) is null
    and (select count(*) from public.payments where bill_id = v_bill1) = 2);

  select public.cancel_bill(v_bill4, 'printed against the wrong ticket, nothing was paid', 1)
    into v_row;
  select count(*) into n from public.audit_log where action = 'bill_cancelled'
    and entity_id = v_bill4::text;
  perform app.verify('18.7f the void a manager IS allowed: CANCELLED with its three stamps and its sentence, one version step, and one trail line that carries the reason plus both sides of the change',
    (v_row ->> 'status') = 'CANCELLED'
    and (v_row ->> 'version')::integer = 2
    and (v_row ->> 'cancelled_by') = '00000000-0000-4000-8000-000000000001'
    and (v_row ->> 'cancel_reason') = 'printed against the wrong ticket, nothing was paid'
    and (v_row ->> 'cancelled_at') is not null
    and n = 1
    and (select count(*) from public.audit_log
          where action = 'bill_cancelled' and result = 'SUCCESS'
            and reason = 'printed against the wrong ticket, nothing was paid'
            and "before" ->> 'status' = 'OPEN'
            and "after" ->> 'status' = 'CANCELLED') = 1);

  -- Money cannot be taken against a document that has been taken back: 017:879 sits above the
  -- replay read (017:886) and above the arithmetic, so the tap is refused before a PAY number
  -- exists to be spent on it.
  perform app.expect_denial(format(
    'select public.record_payment(%L::uuid, 20.00, %L)', v_bill4, 'CASH'),
    'NIVAAS_BILL_CANCELLED');
  perform app.verify('18.7g and the voided document refuses the money it never took: no PAY number is spent on a paper that has been taken back, and its balance still reads zero paid',
    (select count(*) from public.payments p where p.bill_id = v_bill4) = 0
    and (select amount_paid from public.bills where id = v_bill4) = 0
    and (select grand_total from public.bills where id = v_bill4) = 20);
end;
$$;

-- 18.7h — the reason the void is not a deletion. 017:706 counts NON-CANCELLED bills when it asks
-- "is this ticket already billed", so a corrected document may follow a voided one; and because
-- the ticket is already SERVED, open_bill's §7 hand has nothing left to move (017:755), so the
-- ticket's version stays exactly where the first document left it.
set app.user_id to '00000000-0000-4000-8000-0000000000ac';   -- STAFF re-prints the corrected paper

do $$
declare
  v_b4   uuid;
  v_old  uuid;
  v_new  jsonb;
  n      integer;
begin
  select id into v_b4 from public.orders where notes = 'VERIFY-BILL-4';
  select id into v_old from public.bills where order_id = v_b4 and status = 'CANCELLED';
  select public.open_bill(v_b4) into v_new;
  select count(*) into n from public.bills where order_id = v_b4;
  perform app.verify('18.7h a voided document is not a live claim on its ticket, so the corrected one is allowed: a new id, a higher number, OPEN again — two documents on the ticket and exactly one of them live, with the ticket''s own version unmoved because it was already SERVED',
    (v_new ->> 'id')::uuid <> v_old
    and (v_new ->> 'status') = 'OPEN'
    and (v_new ->> 'version')::integer = 1
    and (substr(v_new ->> 'bill_number', 6))::bigint >
        (select substr(b.bill_number, 6)::bigint from public.bills b where b.id = v_old)
    and n = 2
    and (select count(*) from public.bills where order_id = v_b4
          and status <> 'CANCELLED') = 1
    and (select o.status from public.orders o where o.id = v_b4) = 'SERVED'
    and (select o.version from public.orders o where o.id = v_b4) = 6);
end;
$$;

-- 18.7i — the spent number, read where it lives. `document_counters` is revoked to `authenticated`
-- outright (17.13d), so this is a table-owner probe: a void NEVER reclaims its number. The
-- cancelled paper still wears BILL-n, the corrected paper wears BILL-n+1, and the counter sits on
-- the highest document the trading day wears. 016 §4's rule for a mistyped dish, on paper.
reset role;

do $$
declare
  v_bd   date;
  v_out  uuid := 'a2000000-0000-4000-8000-000000000001';
  v_last bigint;
  v_max  bigint;
  v_rows integer;
begin
  v_bd := app.rest_outlet_business_date(v_out);
  select c.last_value into v_last from public.document_counters c
   where c.outlet_id = v_out and c.prefix = 'BILL' and c.business_date = v_bd;
  select max(substr(b.bill_number, 6)::bigint), count(*) into v_max, v_rows
    from public.bills b where b.outlet_id = v_out and b.business_date = v_bd;
  perform app.verify('18.7i a void never reclaims its number: the cancelled paper still carries its own, no two documents on this counter share one, and the BILL counter sits exactly on the highest number the day wears — the sequence is monotonic and never reissued',
    v_last = v_max and v_max = v_rows
    and (select count(distinct b.bill_number) from public.bills b
          where b.outlet_id = v_out and b.business_date = v_bd) = v_rows
    and (select count(*) from public.bills where status = 'CANCELLED'
          and cancel_reason = 'printed against the wrong ticket, nothing was paid') = 1);
end;
$$;

-- ============================================================================
-- 18.8 — §6's replay seen from the DOCUMENT, and the three walls underneath it.
--
-- Everything above took money and paper through doors. This block measures the two things a till
-- depends on that no door can fake: a double tap that must not book twice (open_bill 017:694 and
-- record_payment 017:886, both read BEFORE their mint), and a receipt that cannot be rewritten or
-- erased from the table side (the trigger at 017:587-605, which stands whether or not the grant
-- does). Then the grant set itself, and finally the neighbour's seat aimed at this tenant's paper.
-- ============================================================================

-- 18.8a — the double-tapped OPEN BILL. The replay read sits above the already-open refusal on
-- purpose (017:688-701): a retry is answered with the document the first tap produced, not with
-- BILL_ALREADY_OPEN, which would refuse the cashier their own bill.
set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000001';

do $$
declare
  v_b5    uuid;
  v_first jsonb;
  v_again jsonb;
  n       integer;
begin
  select id into v_b5 from public.orders where notes = 'VERIFY-BILL-5';
  select public.open_bill(v_b5, 'verify-bill-replay-18') into v_first;
  select public.open_bill(v_b5, 'verify-bill-replay-18') into v_again;
  select count(*) into n from public.bills where order_id = v_b5;
  perform app.verify('18.8a a double-tapped OPEN BILL is that tap''s own retry: the second call answers the FIRST document — same id, same number, same 275.00 into 275 — and writes nothing behind it',
    (v_first ->> 'id') = (v_again ->> 'id')
    and (v_first ->> 'bill_number') = (v_again ->> 'bill_number')
    and (v_first ->> 'subtotal')::numeric = 275
    and (v_first ->> 'grand_total')::numeric = 275
    and (v_first ->> 'idempotency_key') = 'verify-bill-replay-18'
    and (v_again ->> 'version')::integer = 1
    and n = 1
    and (select count(*) from public.audit_log where action = 'bill_opened'
          and entity_id = (v_first ->> 'id')) = 1
    and (select o.version from public.orders o where o.id = v_b5) = 6);
end;
$$;

-- 18.8b — the same rule's collision domain, measured rather than described. A key is unique per
-- (organization, outlet, key) — bills_idempotency_scoped at 017:485-487, deliberately not per
-- ticket, because a replay is a property of the submit. So a colleague who taps a DIFFERENT ticket
-- with a key this restaurant has already used is handed somebody else's document, and the refusal
-- they would rather have got (BILL_ALREADY_OPEN) is unreachable because the replay read is above it.
-- Same tenant, same counter: this is a wrong-paper hazard on a reused key, not a tenant leak, and
-- it is the price of an idempotency key a client chooses instead of one a client is given.
set app.user_id to '00000000-0000-4000-8000-0000000000ac';   -- STAFF @ Main Dining

do $$
declare
  v_b4    uuid;
  v_keyed uuid;
  v_wrong jsonb;
  n       integer;
begin
  select id into v_b4 from public.orders where notes = 'VERIFY-BILL-4';
  select id into v_keyed from public.bills where idempotency_key = 'verify-bill-replay-18';
  select count(*) into n from public.bills;
  select public.open_bill(v_b4, 'verify-bill-replay-18') into v_wrong;
  perform app.verify('18.8b HAZARD, measured: replay keys are scoped to (organization, outlet, key) and NOT to the ticket, so a colleague tapping their own ticket with a key this counter already spent is answered with the FIRST document — somebody else''s paper, authored by somebody else — and their own ticket is left exactly as billed as before',
    (v_wrong ->> 'id')::uuid = v_keyed
    and (v_wrong ->> 'order_id')::uuid <> v_b4
    and (v_wrong ->> 'created_by') = '00000000-0000-4000-8000-000000000001'
    and (select count(*) from public.bills) = n
    and (select count(*) from public.audit_log where action = 'bill_opened') = 4
    and (select count(*) from public.bills where order_id = v_b4) = 2);
end;
$$;

-- 18.8c — the same retry under the till. B4's corrected document is 20.00; one tap of 20.00 books
-- it, the second tap of the SAME submit answers the first PAYMENT row. Without the key the second
-- tap is the typo it looks like (18.8d) — the key is the only thing that turns a double tap into a
-- retry instead of a refusal, which is exactly why 017:886 puts the read above the arithmetic.
do $$
declare
  v_b4   uuid;
  v_bill uuid;
  v_pay  jsonb;
  v_again jsonb;
  v_row  jsonb;
  n      integer;
begin
  select id into v_b4 from public.orders where notes = 'VERIFY-BILL-4';
  select id into v_bill from public.bills
    where order_id = v_b4 and status <> 'CANCELLED';

  select public.record_payment(v_bill, 20.00, 'UPI',
    p_reference_id => 'UTX-VERIFY-9001', p_idempotency_key => 'verify-pay-replay-18') into v_pay;
  select public.record_payment(v_bill, 20.00, 'UPI',
    p_reference_id => 'UTX-VERIFY-9001', p_idempotency_key => 'verify-pay-replay-18') into v_again;
  select to_jsonb(b) into v_row from public.bills b where b.id = v_bill;
  select count(*) into n from public.payments where bill_id = v_bill;
  perform app.verify('18.8c a double-tapped "take payment" books the money once: the retry answers the first PAYMENT row — same id, same number — and the document is paid to the rupee at one version step, not 40.00 deep',
    (v_pay ->> 'id') = (v_again ->> 'id')
    and (v_pay ->> 'payment_number') = (v_again ->> 'payment_number')
    and (v_pay ->> 'idempotency_key') = 'verify-pay-replay-18'
    and (v_pay ->> 'status') = 'SUCCESSFUL'
    and n = 1
    and (v_row ->> 'amount_paid')::numeric = 20
    and (v_row ->> 'amount_due')::numeric = 0
    and (v_row ->> 'status') = 'PAID'
    and (v_row ->> 'version')::integer = 2
    and (select count(*) from public.audit_log where action = 'payment_recorded'
          and entity_id = (v_pay ->> 'id')) = 1);

  -- The identical money without a key: 017:845's overpayment refusal, aimed at a document already
  -- at zero due. So the replay above cannot be the door being permissive about double taps — the
  -- key is what makes it a retry.
  perform app.expect_denial(format(
    'select public.record_payment(%L::uuid, 20.00, %L)', v_bill, 'CASH'),
    'NIVAAS_INVALID_MONEY');
  perform app.verify('18.8d the same ₹20 a second time WITHOUT a key is refused as the overpayment it is: the key, not a tolerance for double taps, is what turns a retry into one payment',
    (select count(*) from public.payments where bill_id = v_bill) = 1
    and (select amount_paid from public.bills where id = v_bill) = 20
    and (select amount_due from public.bills where id = v_bill) = 0);
end;
$$;

-- 18.8e — what the two replays cost the sequence: nothing. Read as the table owner beside 18.7i's
-- void (which keeps and burns its number) and 17.4e's ORD counter (which holds a burned gap from
-- 17.3's mistyped dish): a replay mints nothing, so the counter lands exactly on the number of
-- documents and payments that exist. Three gates refused in 18.1/18.4/18.7 minted nothing either.
reset role;

do $$
declare
  v_bd    date;
  v_out   uuid := 'a2000000-0000-4000-8000-000000000001';
  v_bill_last bigint;
  v_pay_last  bigint;
  v_bill_max  bigint;
  v_pay_max   bigint;
  v_bills     integer;
  v_pays      integer;
begin
  v_bd := app.rest_outlet_business_date(v_out);
  select c.last_value into v_bill_last from public.document_counters c
   where c.outlet_id = v_out and c.prefix = 'BILL' and c.business_date = v_bd;
  select c.last_value into v_pay_last from public.document_counters c
   where c.outlet_id = v_out and c.prefix = 'PAY' and c.business_date = v_bd;
  select max(substr(b.bill_number, 6)::bigint), count(*)
    into v_bill_max, v_bills
    from public.bills b where b.outlet_id = v_out and b.business_date = v_bd;
  select max(substr(p.payment_number, 6)::bigint), count(*)
    into v_pay_max, v_pays
    from public.payments p where p.outlet_id = v_out and p.business_date = v_bd;
  perform app.verify('18.8e and the replays spent no number: four documents and three payments wear 1..4 and 1..3, and both counters sit exactly on those rows — a replay mints nothing, while the void at 18.7i kept and burned its number',
    v_bill_last = v_bill_max and v_bill_max = v_bills and v_bills = 4
    and v_pay_last = v_pay_max and v_pay_max = v_pays and v_pays = 3);
end;
$$;

-- 18.8f/18.8g — the receipt's own wall, run as the TABLE OWNER on purpose: app.expect_denial is
-- SECURITY INVOKER, so from `authenticated` every write below would be stopped by the grant
-- revocation at 017:614 and would prove nothing about the trigger. This is the difference between
-- "a client cannot edit money" and "money cannot be edited".
do $$
declare
  v_bill1 uuid;
  v_pay   uuid;
begin
  select id into v_bill1 from public.bills b
    where b.order_id = (select id from public.orders where notes = 'VERIFY-BILL-1');
  select id into v_pay from public.payments where bill_id = v_bill1 and method = 'UPI';

  perform app.expect_denial(format(
    'update public.payments set amount = 0.01 where id = %L::uuid', v_pay),
    'NIVAAS_PAYMENT_IMMUTABLE');
  perform app.expect_denial(format(
    'update public.payments set status = %L where id = %L::uuid', 'FAILED', v_pay),
    'NIVAAS_PAYMENT_IMMUTABLE');
  perform app.expect_denial(format(
    'delete from public.payments where id = %L::uuid', v_pay),
    'NIVAAS_PAYMENT_IMMUTABLE');
  perform app.verify('18.8f a receipt is neither edited nor erased — even by the role that owns the table: the three writes a counter could make on money it has taken (restate the amount, flip it to FAILED so every balance in the schema forgets it, delete the evidence) are all refused on the ROW, with no door in the path',
    (select count(*) from public.payments) = 3
    and (select sum(amount) from public.payments) = 210
    and (select status from public.payments where id = v_pay) = 'SUCCESSFUL'
    and (select amount from public.payments where id = v_pay) = 100
    and (select amount_paid from public.bills where id = v_bill1) = 190);

  -- The two halves of that wall, read as facts rather than as behaviour: it fires on DELETE as well
  -- as UPDATE, and it guards the WHOLE row under a SUCCESSFUL test — so a column a later migration
  -- adds to `payments` is protected the day it lands, instead of the day someone remembers to name
  -- it in a three-column field list. (This is the corrected guard: the field list it replaced left
  -- both the status flip and the erasure reachable.)
  perform app.verify('18.8g the wall is stated where it is enforceable: the trigger fires BEFORE UPDATE OR DELETE, and its body tests OLD.status = SUCCESSFUL against a whole-row comparison instead of a list of columns',
    (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
      where t.tgname = 'payments_immutable' and c.relname = 'payments'
        and pg_get_triggerdef(t.oid) ilike '%DELETE%') = 1
    and (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'app' and p.proname = 'guard_payment_immutability'
        and p.prosrc like '%OLD.status = ''SUCCESSFUL''%'
        and p.prosrc like '%NEW is distinct from OLD%') = 1);
end;
$$;

-- 18.8h — the grant set, from the seat a screen gets. Six shapes of the same write, all refused
-- before a row, a trigger or a policy is consulted: the door is the only write path on money, and
-- that is a privilege fact rather than a convention in this file.
set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000001';

select app.expect_denial('insert into public.payments (id) values (gen_random_uuid())',
  'permission denied');
select app.expect_denial('update public.bills set amount_due = 0 where 1=1', 'permission denied');
select app.expect_denial('delete from public.bills where 1=1', 'permission denied');
select app.expect_denial('update public.payments set amount = 1 where 1=1', 'permission denied');
select app.expect_denial('delete from public.payments where 1=1', 'permission denied');
select app.expect_denial('truncate table public.payments', 'permission denied');

do $$
declare
  n integer;
begin
  perform app.verify('18.8h and the revocation is total on both money tables, for both client roles: no INSERT, UPDATE, DELETE or TRUSTE privilege for authenticated, and not even a SELECT for anon',
    (select count(*) from (
        select 'authenticated'::text as r, t as tbl, p as priv
          from unnest(array['public.bills','public.payments']) t,
               unnest(array['insert','update','delete','truncate']) p
        union all
        select 'anon', t, p
          from unnest(array['public.bills','public.payments']) t,
               unnest(array['insert','update','delete','truncate','select']) p
     ) q
      where has_table_privilege(q.r, q.tbl, q.priv)) = 0);

  -- Which is why the row count is a door count. Every document and every payment this scenario made
  -- has exactly one SUCCESS line naming it, so nothing entered either table behind a door.
  select count(*) into n from public.bills b
    where not exists (select 1 from public.audit_log a
                       where a.action = 'bill_opened' and a.result = 'SUCCESS'
                         and a.entity_id = b.id::text);
  perform app.verify('18.8i so the doors are the whole write surface: each of the four documents carries exactly one bill_opened line and each of the three payments one payment_recorded line, which is what makes the money above auditable rather than merely improbable',
    n = 0
    and (select count(*) from public.bills) = 4
    and (select count(*) from public.audit_log where action = 'bill_opened'
          and result = 'SUCCESS') = 4
    and (select count(*) from public.payments) = 3
    and (select count(*) from public.audit_log where action = 'payment_recorded'
          and result = 'SUCCESS') = 3);
end;
$$;

-- 18.8k — the neighbour's seat, aimed at this tenant's paper with real ids. Four doors and the read,
-- each answering the ABSENCE token: within the tenant the answer is a capability denial (18.7c), and
-- across it there is nothing to deny. The ids come from the superuser reads above so a stranger
-- cannot enumerate them either.
reset role;
select b.id::text as bill_a from public.bills b
  join public.orders o on o.id = b.order_id where o.notes = 'VERIFY-BILL-1' \gset

set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000011';   -- ORG OWNER B (foreign estate)

select app.expect_denial(format('select public.bill_detail(%L::uuid)', :'bill_a'::uuid),
  'NIVAAS_NOT_FOUND');
select app.expect_denial(format('select public.close_bill(%L::uuid, %L)', :'bill_a'::uuid,
  'a stranger closing it'), 'NIVAAS_NOT_FOUND');
select app.expect_denial(format('select public.cancel_bill(%L::uuid, %L)', :'bill_a'::uuid,
  'a stranger voiding it'), 'NIVAAS_NOT_FOUND');
-- A valid amount and method on purpose: 017:798-800 answers money first, and a probe refused for
-- being ₹-100 would say nothing about tenancy.
select app.expect_denial(format('select public.record_payment(%L::uuid, 190, %L)', :'bill_a'::uuid,
  'CASH'), 'NIVAAS_NOT_FOUND');
select app.expect_denial(format('select public.open_bill(%L::uuid)', :'b5_oid'::uuid),
  'NIVAAS_NOT_FOUND');

do $$
declare
  n integer;
begin
  -- The zero is tenancy, not a broken policy: this same seat reads its OWN ticket (18.0a wrote it),
  -- so "nothing above" is the tenant line rather than a role that can read nothing at all.
  select count(*) into n from public.orders;
  perform app.verify('18.8k the stranger sees none of this tenant''s money through RLS either — no document and no payment — while its own single ticket still reads, so the zeros above are tenancy and not an empty estate',
    n = 1
    and (select count(*) from public.bills) = 0
    and (select count(*) from public.payments) = 0);
end;
$$;

-- 18.8l — the scenario's conservation close, as the table owner: nothing any probe above did broke
-- the one arithmetic every document here has to keep. Money in is the door's, balances are the
-- door's, and a voided paper is still internally consistent.
reset role;

do $$
begin
  perform app.verify('18.8l money is conserved across every document 18 wrote: paid + due = grand total on all four, no rupee is negative anywhere in the three money tables, and the till holds exactly the ₹210 the receipts say it does',
    (select count(*) from public.bills
          where coalesce(amount_paid,0) + coalesce(amount_due,0) <> grand_total) = 0
    and (select count(*) from public.bills where amount_paid < 0 or amount_due < 0) = 0
    and (select count(*) from public.payments where amount <= 0) = 0
    and (select count(*) from public.payments where status = 'SUCCESSFUL') = 3
    and (select sum(amount) from public.payments) = 210
    and (select count(*) from public.orders where amount_due < 0) = 0
    and (select grand_total from public.bills b
          where b.order_id = (select id from public.orders where notes = 'VERIFY-BILL-1')) = 190
    and (select grand_total from public.bills b
          where b.order_id = (select id from public.orders where notes = 'VERIFY-BILL-5')) = 275);
end;
$$;

-- ============================================================================
-- Scenario 19 — Prompt #04 §25-§26, §52: kitchen order tickets (018).
--
-- 018 is the only migration in this build that moves TWO machines in one call: it mints a
-- printed slip and it crosses the ORDER over §28's line into PREPARING, and it is the only file
-- that adds a kitchen column (`fire_status`) beside a sales column (`status`) without widening
-- either. Everything below is written to catch the specific ways that collapses. If the slip
-- number had been the row id, 19.1a fails. If the replay wall had shipped as a plain lookup
-- index, 19.2f fails — 19.2f reads UNIQUE and PARTIAL out of `pg_index` instead of trusting an
-- index name. If READY could go backwards, or a line could be rung up behind a slip's back,
-- 19.3f fails. If a cancel had un-fired the plate the cook actually made, 19.4h fails. If a
-- reprint had minted a second number, 19.4c fails. If 013 had handed the kitchen the till,
-- 19.6c fails; if a ladder refusal had left a row or an audit entry behind, 19.6b/19.8d fail.
--
-- Clauses defended: §4 (a human number from the counter, gaps legal and never reused), §5
-- (parent order locked, stated version honoured), §6 (an idempotent submit), §7 (two state
-- machines kept apart by vocabulary), §9 (the slip prints what was sold, not what the menu says
-- now), §10 (a stranger is answered NOT_FOUND), §11 (permission, validation, reason, audit),
-- §12 (a paused restaurant cooks nothing), §13 (the ticket carries the OUTLET's trading date).
--
-- DEFECT (018:412 against 018:476, measured not assumed): send_kot's own gate admits
-- `v_status in ('PLACED','CONFIRMED','PREPARING')`, and because the order is not yet PREPARING
-- the door then calls app.require_order_transition(v_status,'PREPARING'). 016's ladder had no
-- PLACED>PREPARING edge (PLACED>CONFIRMED>PREPARING only) — read back as `f` in 19.0b — so a KOT
-- cut from a PLACED order always aborted with NIVAAS_INVALID_TRANSITION and rolled the whole send
-- back. §27's moment that the gate was written to allow was unreachable. The fix was to add the
-- PLACED>PREPARING edge to 016's ladder (the recommended direction: a PLACED order is legitimately
-- ready to fire to the kitchen, and the screen already offers SEND on PLACED). 19.0b now asserts
-- the edge is legal.
-- ============================================================================

-- 19.0 — the one seat 013 does not give the prelude: an events manager, who holds `kot.view` but
-- neither `kot.reprint` nor `kot.cancel`. That rung exists to be refused — it proves the right to
-- READ a slip is not the right to send a second copy of it to the pass.
reset role;
do $$
declare
  v_role uuid;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    ('00000000-0000-4000-8000-0000000000d1', 'kot.event@verify.local', '{"full_name":"Banqueting Events"}')
  on conflict (id) do nothing;

  insert into public.organization_memberships (user_id, organization_id, status, is_owner, joined_at)
  values ('00000000-0000-4000-8000-0000000000d1', 'a0000000-0000-4000-8000-00000000000a',
          'ACTIVE', false, now())
  on conflict do nothing;

  insert into public.membership_property_access (user_id, organization_id, property_id, mode)
  values ('00000000-0000-4000-8000-0000000000d1', 'a0000000-0000-4000-8000-00000000000a',
          'a1000000-0000-4000-8000-000000000001', 'SELECTED_PROPERTIES')
  on conflict do nothing;

  select id into v_role from public.roles where name = 'EVENT_MANAGER';
  insert into public.user_roles (user_id, role_id, organization_id, outlet_id)
  values ('00000000-0000-4000-8000-0000000000d1', v_role, 'a0000000-0000-4000-8000-00000000000a',
          'a2000000-0000-4000-8000-000000000001')
  on conflict do nothing;

  -- The rung is read out of 013's own catalogue, so the refusal it exists to make cannot be
  -- quietly neutralised by a later grant: this is a statement about the seeded role, not about
  -- the fixture.
  perform app.verify('19.0a 013 gives the events seat kot.view and neither reprint nor cancel',
    (select count(*) from public.role_permissions rp join public.roles r on r.id = rp.role_id
      where r.name = 'EVENT_MANAGER' and rp.permission = 'kot.view') = 1
    and (select count(*) from public.role_permissions rp join public.roles r on r.id = rp.role_id
      where r.name = 'EVENT_MANAGER' and rp.permission in ('kot.reprint','kot.cancel')) = 0);

  -- The defect, stated as a fact about the ladder: 018:413 invites PLACED, and 016's machine
  -- now says yes to it (the edge was added to fix the gap 19.1i measured).
  perform app.verify('19.0b 016''s order ladder now has the PLACED>PREPARING edge, so a KOT sent from PLACED is legal',
    app.rest_order_transition_allowed('PLACED','PREPARING')
    and app.rest_order_transition_allowed('CONFIRMED','PREPARING'));
end;
$$;

-- Three literal-id fixtures, each because RLS will not read the row back for me:
--   * a slip in the FOREIGN estate, which 19.5 names from inside tenant A;
--   * a slip of tenant A's at the BANQUET outlet, which 19.5p names from inside tenant B —
--     a NULL argument would pass that probe for the wrong reason, so the id has to be a literal;
--   * a CONFIRMED order and line on the PAUSED Sunset Terrace, so 19.6h has a closed restaurant
--     with an order shaped exactly like one a cashier would send.
-- Their business dates are deliberately in the past: none of them may join today's counts.
do $$
begin
  insert into public.orders (id, organization_id, property_id, outlet_id, order_number,
    order_type, status, business_date, notes)
  values ('e7000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000b',
          'b1000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001',
          'ORD-BEACH-1', 'TAKEAWAY', 'CONFIRMED', '2026-01-15', 'foreign kitchen')
  on conflict (id) do nothing;

  insert into public.order_items (id, organization_id, property_id, outlet_id, order_id,
    menu_item_id, item_name_snapshot, item_code_snapshot, currency, unit_price, quantity,
    line_sequence)
  values ('e7000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-00000000000b',
          'b1000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001',
          'e7000000-0000-4000-8000-000000000001',
          'c1000000-0000-4000-8000-000000000001', 'Foreign Catch', 'BB-1', 'INR', 500.00, 1, 1)
  on conflict (id) do nothing;

  insert into public.kitchen_order_tickets (id, organization_id, property_id, outlet_id,
    order_id, kot_number, business_date, status, note)
  values ('e7000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-00000000000b',
          'b1000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001',
          'e7000000-0000-4000-8000-000000000001', 'KOT-000001', '2026-01-15', 'OPEN', 'foreign slip')
  on conflict (id) do nothing;

  insert into public.orders (id, organization_id, property_id, outlet_id, order_number,
    order_type, status, business_date, notes)
  values ('e8000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a',
          'a1000000-0000-4000-8000-0000000000a2', 'a2000000-0000-4000-8000-00000000000a',
          'ORD-BANQ-1', 'TAKEAWAY', 'CONFIRMED', '2026-01-15', 'slip B is told does not exist')
  on conflict (id) do nothing;

  insert into public.kitchen_order_tickets (id, organization_id, property_id, outlet_id,
    order_id, kot_number, business_date, status, note)
  values ('e8000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-00000000000a',
          'a1000000-0000-4000-8000-0000000000a2', 'a2000000-0000-4000-8000-00000000000a',
          'e8000000-0000-4000-8000-000000000001', 'KOT-000001', '2026-01-15', 'OPEN',
          'A-side slip for B to probe')
  on conflict (id) do nothing;

  -- The paused terrace gets a live menu and a real line, because 19.6h's point is that a closed
  -- restaurant refuses to cook DISHES IT SELLS, not an empty one. Written as the table owner:
  -- the outlet's own status makes every door refuse it, which is precisely the fact under test.
  insert into public.menus (id, organization_id, property_id, outlet_id, name, status, currency)
  values ('ea000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a',
          'a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-0000000000b1',
          'Terrace Card', 'ACTIVE', 'INR')
  on conflict (id) do nothing;

  insert into public.menu_items (id, organization_id, property_id, outlet_id, menu_id, name,
    item_code, status)
  values ('ea000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-00000000000a',
          'a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-0000000000b1',
          'ea000000-0000-4000-8000-000000000001', 'Terrace Snack', 'TS-1', 'ACTIVE')
  on conflict (id) do nothing;

  insert into public.orders (id, organization_id, property_id, outlet_id, order_number,
    order_type, status, business_date, notes)
  values ('e9000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a',
          'a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-0000000000b1',
          'ORD-TER-1', 'TAKEAWAY', 'CONFIRMED', '2026-01-15', 'paused terrace order')
  on conflict (id) do nothing;

  insert into public.order_items (id, organization_id, property_id, outlet_id, order_id,
    menu_item_id, item_name_snapshot, item_code_snapshot, currency, unit_price, quantity,
    line_sequence, fire_status)
  values ('e9000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-00000000000a',
          'a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-0000000000b1',
          'e9000000-0000-4000-8000-000000000001',
          'ea000000-0000-4000-8000-000000000002', 'Terrace Snack', 'TS-1', 'INR', 120.00, 1, 1,
          'NOT_FIRED')
  on conflict (id) do nothing;
end;
$$;

-- The kitchen's own menu, built through 014's doors and nobody else's: 19.5a has to rename and
-- reprice a dish to prove the slip prints the sale-time snapshot, and doing that to a dish
-- another scenario shares would be a test that damages the suite.
set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000001';

do $$
declare
  v      jsonb;
  v_menu uuid;
  v_cat  uuid;
  v_i1   uuid;
  v_g    uuid;
begin
  select public.create_menu('a2000000-0000-4000-8000-000000000001'::uuid, 'KOT Service', 'INR')
    into v;
  v_menu := (v->>'id')::uuid;
  perform app.verify('19.0c a kitchen menu arrives unpublished, so no line on it is sellable yet',
    (v->>'status') = 'DRAFT');

  select public.create_menu_category(v_menu, 'From The Tandoor') into v;
  v_cat := (v->>'id')::uuid;
  select public.create_menu_item(v_menu, 'KOT Thali', 260.00, v_cat, null, 'KT-1') into v;
  v_i1 := (v->>'id')::uuid;
  select public.create_menu_item(v_menu, 'KOT Curry', 145.50, v_cat, null, 'KC-1') into v;
  select public.create_menu_item(v_menu, 'KOT Bread', 80.00, v_cat, null, 'KB-1') into v;

  select public.create_modifier_group(v_i1, 'KOT Extras', 'MULTIPLE', 0, 2) into v;
  v_g := (v->>'id')::uuid;
  select public.create_modifier(v_g, 'Extra Ghee', 25.50, 1) into v;
  select public.create_modifier(v_g, 'No Pickle', 0.00, 2) into v;

  select public.set_menu_status(v_menu, 'ACTIVE', 'the kitchen scenario opens service') into v;
  perform app.verify('19.0d publishing the menu is what makes its dishes orderable',
    (v->>'status') = 'ACTIVE');
end;
$$;

-- --------------------------------------------------------------------------- 19.1 the send
set role authenticated;
set app.user_id to '00000000-0000-4000-8000-0000000000ac';   -- STAFF: kot.create, no kot.view

do $$
declare
  v    jsonb;
  o    uuid;
  l1   uuid;
  l2   uuid;
  i1   uuid;
  i2   uuid;
  g    uuid;
  m1   uuid;
  m2   uuid;
  t    uuid;
  n    integer;
begin
  select id into i1 from public.menu_items where item_code = 'KT-1';
  select id into i2 from public.menu_items where item_code = 'KC-1';
  select id into g  from public.modifier_groups where name = 'KOT Extras';
  select id into m1 from public.modifiers where name = 'Extra Ghee';
  select id into m2 from public.modifiers where name = 'No Pickle';
  select id into t  from public.restaurant_tables where code = 'T01';

  select public.create_order('a2000000-0000-4000-8000-000000000001'::uuid, 'DINE_IN',
    jsonb_build_array(
      jsonb_build_object('itemId', i1, 'quantity', 2, 'specialInstructions', 'extra crisp',
        'modifiers', jsonb_build_array(
          jsonb_build_object('groupId', g, 'modifierIds', jsonb_build_array(m1, m2)))),
      jsonb_build_object('itemId', i2, 'quantity', 3)),
    t, null, 'KOT ORDER ONE') into v;
  o := (v->>'id')::uuid;
  select public.set_order_status(o, 'PLACED') into v;
  select public.set_order_status(o, 'CONFIRMED') into v;
  select id into l1 from public.order_items where order_id = o and line_sequence = 1;
  select id into l2 from public.order_items where order_id = o and line_sequence = 2;

  select public.send_kot(o, jsonb_build_array(l1, l2), 'Guest is in a hurry', false, null,
                         's19-slip-one') into v;

  -- §4: the number on the paper is a human number from the counter. A slip printed with its own
  -- uuid is a slip no kitchen can call back over the pass.
  perform app.verify('19.1a the slip carries a human KOT number, and it is not the row''s identity',
    (v->>'kot_number') ~ '^KOT-[0-9]{6}$' and (v->>'kot_number') <> (v->>'id'));

  -- §12/§13: the tenant ancestors and the day are read off the ORDER inside the door. There is
  -- no scope argument on send_kot to lie with, so a forged one is not merely refused — it is
  -- unspeakable.
  perform app.verify('19.1b the slip''s whole scope chain is its order''s, not an argument',
    (v->>'organization_id') = (select organization_id::text from public.orders where id = o)
    and (v->>'property_id') = (select property_id::text from public.orders where id = o)
    and (v->>'outlet_id') = (select outlet_id::text from public.orders where id = o));

  perform app.verify('19.1c the ticket is stamped with the outlet''s trading date, the day the kitchen worked',
    (v->>'business_date') = (select business_date::text from public.orders where id = o)
    and (v->>'business_date') = (select app.rest_outlet_business_date(
          'a2000000-0000-4000-8000-000000000001'::uuid)::text));

  perform app.verify('19.1d a fresh slip is OPEN, printed once, and nobody has retired it',
    (v->>'status') = 'OPEN' and (v->>'version')::int = 1
    and (v->>'fired_at') is not null and (v->>'closed_at') is null
    and (v->>'cancelled_at') is null and (v->>'reprint_count')::int = 0
    and (v->>'created_by') = '00000000-0000-4000-8000-0000000000ac');

  -- §28 written as code: the first fired line moves the ORDER, through 016's machine, in the
  -- same breath as the slip.
  perform app.verify('19.1e firing both lines crossed the order itself over the pass',
    (select status from public.orders where id = o) = 'PREPARING'
    and (select count(*) from public.order_items where order_id = o
          and fire_status = 'FIRED' and kot_id = (v->>'id')::uuid) = 2);

  perform app.verify('19.1f the send moved the order''s version exactly once — nobody else touched it',
    (select version from public.orders where id = o) = 4);

  perform app.verify('19.1g the send is audited once, against the ticket, by the seat that pressed SEND',
    (select count(*) from public.audit_log where action = 'kot_sent' and entity = 'kot'
      and entity_id = (v->>'id')::text
      and actor_id = '00000000-0000-4000-8000-0000000000ac' and result = 'SUCCESS') = 1);

  -- A DRAFT order has committed nothing, so the slip is refused with the transition token.
  select public.create_order('a2000000-0000-4000-8000-000000000001'::uuid, 'DINE_IN',
    jsonb_build_array(jsonb_build_object('itemId', i2, 'quantity', 1)), t, null,
    'KOT ORDER DRAFT') into v;
  perform app.expect_denial(
    'select public.send_kot(' || quote_literal(v->>'id') || '::uuid, '
    || quote_literal((select jsonb_agg(id)::text from public.order_items
         where order_id = (v->>'id')::uuid)) || '::jsonb)',
    'NIVAAS_INVALID_TRANSITION');
  perform app.verify('19.1h a slip refused on a DRAFT order leaves no ticket behind',
    (select count(*) from public.kitchen_order_tickets k
      where k.order_id = (select id from public.orders where notes = 'KOT ORDER DRAFT')) = 0);

  -- DEFECT (see the header): this order is now PLACED, which 018:413 says may be sent. The door
  -- used to refuse it through 016's ladder (no PLACED>PREPARING edge). The fix was to add that
  -- edge to 016, so the send now succeeds and the order moves to PREPARING.
  select public.set_order_status((v->>'id')::uuid, 'PLACED') into v;
  n := (select count(*) from public.audit_log where action = 'kot_sent'
         and organization_id = 'a0000000-0000-4000-8000-00000000000a');
  select public.send_kot((v->>'id')::uuid,
    (select jsonb_agg(id)::jsonb from public.order_items
         where order_id = (v->>'id')::uuid),
    'PLACED order fires directly', false, null, 's19-slip-placed') into v;
  perform app.verify('19.1i the send from a PLACED order now succeeds (the ladder edge was added)',
    (v->>'status') = 'OPEN' and (v->>'version')::int = 1
    and (v->>'fired_at') is not null
    and (select status from public.orders where notes = 'KOT ORDER DRAFT') = 'PREPARING'
    and (select fire_status from public.order_items
          where order_id = (select id from public.orders where notes = 'KOT ORDER DRAFT')) = 'FIRED'
    and (select count(*) from public.audit_log where action = 'kot_sent'
          and organization_id = 'a0000000-0000-4000-8000-00000000000a') = n + 1);
end;
$$;

-- ------------------------------------------------------------------------ 19.2 the replay
set role authenticated;
set app.user_id to '00000000-0000-4000-8000-0000000000ac';

do $$
declare
  v    jsonb;
  w    jsonb;
  o    uuid;
  o2   uuid;
  l1   uuid;
  p1   uuid;
  p2   uuid;
  i2   uuid;
  i3   uuid;
  t    uuid;
  n    integer;
begin
  select id into o  from public.orders where notes = 'KOT ORDER ONE';
  select id into i2 from public.menu_items where item_code = 'KC-1';
  select id into i3 from public.menu_items where item_code = 'KB-1';
  select id into t  from public.restaurant_tables where code = 'T02';

  -- A second order for the keyless sends, so the first slip keeps both its lines for 19.3.
  select public.create_order('a2000000-0000-4000-8000-000000000001'::uuid, 'DINE_IN',
    jsonb_build_array(jsonb_build_object('itemId', i2, 'quantity', 1),
                      jsonb_build_object('itemId', i3, 'quantity', 1)),
    t, null, 'KOT ORDER TWO') into v;
  o2 := (v->>'id')::uuid;
  select public.set_order_status(o2, 'PLACED') into v;
  select public.set_order_status(o2, 'CONFIRMED') into v;
  select id into p1 from public.order_items where order_id = o2 and line_sequence = 1;
  select id into p2 from public.order_items where order_id = o2 and line_sequence = 2;

  select to_jsonb(k) into v from public.kitchen_order_tickets k
    where k.order_id = o and k.idempotency_key = 's19-slip-one';
  select id into l1 from public.order_items where order_id = o and line_sequence = 1;

  -- §6: the second tap of one key, asking for a line that is ALREADY FIRED on that slip, is
  -- still that tap's own retry. The replay read sits ahead of line validation, so a double-tapped
  -- SEND answers with the first slip instead of refusing the cashier their own ticket.
  select public.send_kot(o, jsonb_build_array(l1), 'double tap', false, null,
                         's19-slip-one') into w;
  perform app.verify('19.2a the replayed tap returns the first slip — same row, same printed number',
    (w->>'id') = (v->>'id') and (w->>'kot_number') = (v->>'kot_number')
    and (w->>'created_at') = (v->>'created_at'));

  perform app.verify('19.2b one key holds exactly one ticket, and the replay fired no second line set',
    (select count(*) from public.kitchen_order_tickets
      where idempotency_key = 's19-slip-one') = 1
    and (select count(*) from public.order_items where kot_id = (v->>'id')::uuid) = 2);

  n := (select count(*) from public.kitchen_order_tickets
         where outlet_id = 'a2000000-0000-4000-8000-000000000001');

  -- A blank key is "no key", not a key everyone shares: the door normalises it away, and two
  -- keyless slips must coexist. This is the other half of PARTIAL — a plain UNIQUE on the column
  -- would collide on the second one.
  select public.send_kot(o2, jsonb_build_array(p1), 'no key typed', false, null, '   ') into w;
  perform app.verify('19.2c a whitespace idempotency key is normalised away, never stored as the empty string',
    (w->>'idempotency_key') is null);

  select public.send_kot(o2, jsonb_build_array(p2), 'also no key', false, null, null) into w;
  perform app.verify('19.2d two keyless slips from one order coexist — the replay index is partial',
    (select count(*) from public.kitchen_order_tickets
      where outlet_id = 'a2000000-0000-4000-8000-000000000001') = n + 2);
end;
$$;

reset role;
do $$
declare
  v_uniq    boolean;
  v_partial boolean;
begin
  -- The counter obeyed rather than reconciled, read before anything is hand-advanced and from
  -- where it lives: `document_counters` is revoked to `authenticated` outright (17.13d), so the
  -- number printed, the counter's value and the count of slips at this outlet can only be
  -- reconciled as the table owner (§4).
  perform app.verify('19.2e the KOT counter equals the highest number printed equals the three slips cut so far, and the outlet''s day has exactly one KOT counter',
    (select c.last_value from public.document_counters c
      where c.outlet_id = 'a2000000-0000-4000-8000-000000000001' and c.prefix = 'KOT')
      = (select max(substr(k.kot_number, 5)::int) from public.kitchen_order_tickets k
          where k.outlet_id = 'a2000000-0000-4000-8000-000000000001')
    and (select count(*) from public.document_counters
      where outlet_id = 'a2000000-0000-4000-8000-000000000001' and prefix = 'KOT') = 1
    and (select count(*) from public.kitchen_order_tickets
      where outlet_id = 'a2000000-0000-4000-8000-000000000001') = 3);

  -- The catalogue, not the name. `pg_index` has no indispartial column, so PARTIAL is read as
  -- "indpred is not null" and UNIQUE as "indisunique": a plain lookup index would satisfy the
  -- name and let two simultaneous taps of one key both commit, which is the double SEND §6 was
  -- written to prevent.
  select i.indisunique, i.indpred is not null into v_uniq, v_partial
    from pg_index i join pg_class c on c.oid = i.indexrelid
   where c.relname = 'kitchen_order_tickets_idempotency_idx';
  perform app.verify('19.2f the replay wall is genuinely UNIQUE and genuinely PARTIAL, read out of pg_index',
    v_uniq and v_partial);

  perform app.verify('19.2g the number wall is unique over every row, partial over none: a cancelled slip keeps its number',
    (select i.indisunique and i.indpred is null from pg_index i
      join pg_class c on c.oid = i.indexrelid
     where c.relname = 'kitchen_order_tickets_number_idx'));
end;
$$;

-- The same wall reached directly, as table owner: the door's replay read is a convenience, this
-- index is the guarantee. No cleanup DELETE below — the denial leaves nothing, and deleting first
-- would make the count that proves it vacuous.
select app.expect_denial(
  'insert into public.kitchen_order_tickets (organization_id, property_id, outlet_id, order_id, '
  || 'kot_number, business_date, idempotency_key) '
  || 'select k.organization_id, k.property_id, k.outlet_id, k.order_id, ''KOT-999999'', '
  || 'k.business_date, ''s19-slip-one'' from public.kitchen_order_tickets k '
  || 'where k.idempotency_key = ''s19-slip-one''',
  'kitchen_order_tickets_idempotency_idx');

do $$
begin
  perform app.verify('19.2h the refused duplicate exists nowhere — an index denial is not a partial write',
    (select count(*) from public.kitchen_order_tickets where kot_number = 'KOT-999999') = 0);

  -- §4's other half, set up here and read in 19.2i/19.2j: a counter that has run ahead of the
  -- table must be OBEYED, not reconciled. A number is never re-issued to fill a gap.
  update public.document_counters set last_value = last_value + 3
   where organization_id = 'a0000000-0000-4000-8000-00000000000a'
     and outlet_id = 'a2000000-0000-4000-8000-000000000001' and prefix = 'KOT';
end;
$$;

set role authenticated;
set app.user_id to '00000000-0000-4000-8000-0000000000ac';
do $$
declare
  v jsonb;
  o uuid;
begin
  select id into o from public.orders where notes = 'KOT ORDER TWO';
  -- p_include_fired = true: the FIRED line is CARRIED onto the new slip (re-pointed, its version
  -- bumped, its fire state untouched) rather than re-fired — the consolidated-ticket path.
  select public.send_kot(o, jsonb_build_array((select id from public.order_items
      where order_id = o and line_sequence = 1)), 'after the hand-advanced counter',
    true, null, 's19-gap') into v;
  perform app.verify('19.2i the door obeys the counter it found, not the tickets it sees: the next number jumps past the three-number gap and no slip wears a gap number',
    (v->>'kot_number') ~ '^KOT-[0-9]{6}$'
    and substr(v->>'kot_number', 5)::int > 4
    and (select count(*) from public.kitchen_order_tickets k
      where k.outlet_id = 'a2000000-0000-4000-8000-000000000001'
        and substr(k.kot_number, 5)::int in (4, 5, 6)) = 0);
end;
$$;

reset role;
do $$
declare
  v_num  text;
  v_last bigint;
begin
  select k.kot_number, c.last_value into v_num, v_last
    from public.kitchen_order_tickets k
    join public.document_counters c on c.outlet_id = k.outlet_id and c.prefix = 'KOT'
     and c.business_date = k.business_date
   where k.idempotency_key = 's19-gap';
  perform app.verify('19.2j the newest number IS the counter''s current value — the gap stays a gap and nothing was re-issued to fill it',
    v_num = 'KOT-' || lpad(v_last::text, 6, '0') and v_last = 7);

  -- The carried line: its state was already FIRED, so the door re-points it and bumps its
  -- version — it does not walk the fire ladder twice for one plate.
  perform app.verify('19.2k the carried FIRED line moved onto the consolidated slip without re-firing',
    (select count(*) from public.order_items oi
      where oi.kot_id = (select id from public.kitchen_order_tickets
                          where idempotency_key = 's19-gap')
        and oi.fire_status = 'FIRED') = 1);
end;
$$;

-- ---------------------------------------------------------------------- 19.3 the fire machine
set role authenticated;
set app.user_id to '00000000-0000-4000-8000-0000000000ad';   -- KITCHEN_MANAGER: kot.view

do $$
declare
  v      jsonb;
  o      uuid;
  k      uuid;
  l1     uuid;
  l2     uuid;
  v_ver  integer;
  v_upd  timestamptz;
begin
  select id into o from public.orders where notes = 'KOT ORDER ONE';
  select kot_id into k from public.order_items where order_id = o and line_sequence = 1;
  select id into l1 from public.order_items where order_id = o and line_sequence = 1;
  select id into l2 from public.order_items where order_id = o and line_sequence = 2;
  select version, updated_at into v_ver, v_upd from public.order_items where id = l1;

  -- FIRED>READY is the only edge this door may write.
  select public.set_order_item_fire_status(l1, 'READY', 'rung up at the pass') into v;
  perform app.verify('19.3a ringing a line up moves exactly one rung and one version',
    (v->>'fire_status') = 'READY' and (v->>'version')::int = v_ver + 1);

  -- touch trigger, behaviourally: the row was created in an earlier transaction, so an updated_at
  -- that has moved proves 016's trigger rode the new column for free (contract §7's history).
  perform app.verify('19.3b the fire write moves updated_at — the touch trigger covers the kitchen column too',
    (select updated_at from public.order_items where id = l1) > v_upd);

  -- A slip with a line still cooking is NOT done: closure is the last line's act, not a count a
  -- screen compares.
  perform app.verify('19.3c a slip with one line still cooking stays OPEN',
    (select status from public.kitchen_order_tickets where id = k) = 'OPEN');

  select public.set_order_item_fire_status(l2, 'READY') into v;
  perform app.verify('19.3d the last line ringing up closes the ticket, with closed_at behind it',
    (select status from public.kitchen_order_tickets where id = k) = 'CLOSED'
    and (select closed_at from public.kitchen_order_tickets where id = k) is not null);

  perform app.verify('19.3e the closure is its own audit entry, against the ticket, with the reason 018 states',
    (select count(*) from public.audit_log where action = 'kot_closed' and entity = 'kot'
      and entity_id = k::text and reason = 'all lines ready' and result = 'SUCCESS') = 1);

  -- ABSENCE is the wall (§7): a cook does not un-cook a plate, and this door writes READY alone.
  perform app.expect_denial(
    'select public.set_order_item_fire_status(' || quote_literal(l1) || '::uuid, ''FIRED'')',
    'NIVAAS_INVALID_STATUS');
  perform app.expect_denial(
    'select public.set_order_item_fire_status(' || quote_literal(l1) || '::uuid, ''READY'')',
    'NIVAAS_INVALID_TRANSITION');
  perform app.verify('19.3f READY has no way back — the refusal leaves the line at the pass',
    (select fire_status from public.order_items where id = l1) = 'READY'
    and (select status from public.kitchen_order_tickets where id = k) = 'CLOSED');

  -- A line that never reached a slip cannot be rung up behind the kitchen's back: NOT_FIRED>READY
  -- is not an edge, so the ladder answers before anything is written.
  perform app.expect_denial(
    'select public.set_order_item_fire_status('
    || quote_literal((select id from public.order_items where order_id =
         (select id from public.orders where notes = 'KOT ORDER DRAFT'))) || '::uuid, ''READY'')',
    'NIVAAS_INVALID_TRANSITION');

  -- The vocabulary, three ways: a word from the sales machine, a word from the wrong rung, and no
  -- word at all. Each is refused before the row is even read (018:523).
  perform app.expect_denial(
    'select public.set_order_item_fire_status(' || quote_literal(l2) || '::uuid, ''SERVED'')',
    'NIVAAS_INVALID_STATUS');
  perform app.expect_denial(
    'select public.set_order_item_fire_status(' || quote_literal(l2) || '::uuid, ''NOT_FIRED'')',
    'NIVAAS_INVALID_STATUS');
  perform app.expect_denial(
    'select public.set_order_item_fire_status(' || quote_literal(l2) || '::uuid, null)',
    'NIVAAS_INVALID_STATUS');
end;
$$;

-- A voided line: the sales truth says it was never sold, the kitchen's truth says it was cooking.
-- 018 freezes the fire state at that moment — and the slip still prints the line, because the
-- paper that reached the kitchen really did carry it (§9).
set role authenticated;
set app.user_id to '00000000-0000-4000-8000-0000000000ae';   -- RESTAURANT_MANAGER: order.edit

do $$
declare
  v  jsonb;
  o  uuid;
  l  uuid;
  k  uuid;
begin
  select id into o from public.orders where notes = 'KOT ORDER TWO';
  select id, kot_id into l, k from public.order_items where order_id = o and line_sequence = 1;

  select public.void_order_item(l, 'guest changed their mind') into v;
  perform app.verify('19.3g voiding a fired line changes its sales state and leaves its fire state alone',
    (v->>'status') = 'VOIDED' and (v->>'fire_status') = 'FIRED');

  perform app.expect_denial(
    'select public.set_order_item_fire_status(' || quote_literal(l) || '::uuid, ''READY'')',
    'NIVAAS_IMMUTABLE_ORDER');
  perform app.verify('19.3h a voided line is refused kitchen work — its fire state is history now',
    (select fire_status from public.order_items where id = l) = 'FIRED');

  select public.kot_detail(k) into v;
  perform app.verify('19.3i but the slip still prints the line it actually sent (§9, for the record)',
    exists (select 1 from jsonb_array_elements(v->'lines') e where (e->>'id') = l::text)
    and (v->>'status') = 'OPEN');
end;
$$;

-- ------------------------------------------------------------------------ 19.4 cancel/reprint
set role authenticated;
set app.user_id to '00000000-0000-4000-8000-0000000000ac';

do $$
declare
  v    jsonb;
  o    uuid;
  i1   uuid;
  i3   uuid;
  t    uuid;
begin
  select id into i1 from public.menu_items where item_code = 'KT-1';
  select id into i3 from public.menu_items where item_code = 'KB-1';
  select id into t  from public.restaurant_tables where code = 'T21';

  select public.create_order('a2000000-0000-4000-8000-000000000001'::uuid, 'DINE_IN',
    jsonb_build_array(jsonb_build_object('itemId', i1, 'quantity', 1),
                      jsonb_build_object('itemId', i3, 'quantity', 2),
                      jsonb_build_object('itemId', i3, 'quantity', 1)),
    t, null, 'KOT ORDER MISSEND') into v;
  o := (v->>'id')::uuid;
  select public.set_order_status(o, 'PLACED') into v;
  select public.set_order_status(o, 'CONFIRMED') into v;
  select public.send_kot(o, (select jsonb_agg(id order by line_sequence)
    from public.order_items where order_id = o), 'mis-send, will be cancelled', false, null,
    's19-mis-send') into v;
  perform app.verify('19.4a the mis-send slip went out with all three of the order''s lines on it',
    (v->>'status') = 'OPEN'
    and (select count(*) from public.order_items where kot_id = (v->>'id')::uuid) = 3);
end;
$$;

set role authenticated;
set app.user_id to '00000000-0000-4000-8000-0000000000ad';

do $$
declare
  v       jsonb;
  k       uuid;
  l1      uuid;
  nt      integer;
  v_ver   integer;
  v_num   text;
begin
  select id, version, kot_number into k, v_ver, v_num
    from public.kitchen_order_tickets where idempotency_key = 's19-mis-send';
  select id into l1 from public.order_items where kot_id = k and line_sequence = 1;

  -- One line rung up FIRST, so the cancel below has a READY line and FIRED lines to tell apart.
  select public.set_order_item_fire_status(l1, 'READY') into v;

  -- §69: a reprint is an act, not a no-op — counted, stamped, versioned, audited — and above all
  -- it mints NOTHING. If reprint had quietly re-sent, a second KOT number would exist by now.
  nt := (select count(*) from public.kitchen_order_tickets);
  select public.reprint_kot(k, 'printer jam, the kitchen never saw it') into v;
  perform app.verify('19.4b a reprint counts on the slip, stamps the time and moves its version by one',
    (v->>'reprint_count')::int = 1 and (v->>'last_reprinted_at') is not null
    and (v->>'version')::int = v_ver + 1
    and (v->>'status') = 'OPEN');

  perform app.verify('19.4c a reprint mints no second ticket and no second number (§69 is not a send)',
    (select count(*) from public.kitchen_order_tickets) = nt
    and (select kot_number from public.kitchen_order_tickets where id = k) = v_num);

  select public.reprint_kot(k, 'the runner needs a copy') into v;
  perform app.verify('19.4d the count is the slip''s own footprint: two reprints, still one row',
    (select reprint_count from public.kitchen_order_tickets where id = k) = 2
    and (select count(*) from public.kitchen_order_tickets) = nt);

  perform app.verify('19.4e each reprint left its own audit row, and every one of them carries a reason',
    (select count(*) from public.audit_log where action = 'kot_reprinted' and entity = 'kot'
      and entity_id = k::text and actor_id = '00000000-0000-4000-8000-0000000000ad'
      and result = 'SUCCESS' and btrim(coalesce(reason, '')) <> '') = 2);

  -- §11's order is load-bearing: the reason is demanded before the transition machine is asked,
  -- so a reasonless cancel is refused as a missing explanation and changes nothing at all.
  perform app.expect_denial(
    'select public.cancel_kot(' || quote_literal(k) || '::uuid, null)',
    'NIVAAS_REASON_REQUIRED');
  perform app.expect_denial(
    'select public.cancel_kot(' || quote_literal(k) || '::uuid, ''   '')',
    'NIVAAS_REASON_REQUIRED');
  perform app.verify('19.4f a refusal on the reason leaves the slip exactly as it stood (OPEN, two reprints, version 3)',
    (select status || '/' || reprint_count::text || '/' || version::text
       from public.kitchen_order_tickets where id = k) = 'OPEN/2/3');

  select public.cancel_kot(k, 'wrong table — stop making two breads') into v;
  perform app.verify('19.4g a cancelled slip says who retired it, when, and why',
    (v->>'status') = 'CANCELLED'
    and (v->>'cancelled_by') = '00000000-0000-4000-8000-0000000000ad'
    and (v->>'cancelled_at') is not null
    and (v->>'cancel_reason') = 'wrong table — stop making two breads');

  -- The line rule 018 says it thought about: a plate the cook made stays made, and keeps pointing
  -- at the slip it was made on. Only still-cooking lines un-fire, and they detach so a corrected
  -- send can pick them up fresh.
  perform app.verify('19.4h the READY line stays READY and keeps its retired slip; the cooking lines un-fire and detach',
    (select count(*) from public.order_items where kot_id = k
      and fire_status = 'READY' and status = 'ACTIVE') = 1
    and (select count(*) from public.order_items
          where order_id = (select order_id from public.kitchen_order_tickets where id = k)
            and fire_status = 'NOT_FIRED' and kot_id is null) = 2);

  -- A retired slip must not reappear on the pass, and cannot be retired twice.
  perform app.expect_denial(
    'select public.reprint_kot(' || quote_literal(k) || '::uuid, ''reprint a retired slip'')',
    'NIVAAS_ARCHIVED');
  perform app.expect_denial(
    'select public.cancel_kot(' || quote_literal(k) || '::uuid, ''cancel it a second time'')',
    'NIVAAS_INVALID_TRANSITION');

  -- A cancelled ticket takes no kitchen work: the line it un-fired is back outside the machine,
  -- and the refusal must leave the retired slip untouched.
  perform app.expect_denial(
    'select public.set_order_item_fire_status('
    || quote_literal((select id from public.order_items where kot_id is null
        and order_id = (select order_id from public.kitchen_order_tickets where id = k)
        and line_sequence = 2)) || '::uuid, ''READY'')',
    'NIVAAS_INVALID_TRANSITION');
  perform app.verify('19.4i refused kitchen work left the retired slip exactly as it was, count included (CANCELLED, 2 reprints, version 4)',
    (select status || '/' || reprint_count::text || '/' || version::text
       from public.kitchen_order_tickets where id = k) = 'CANCELLED/2/4');

  -- CLOSED is terminal in the other direction as well: a slip the kitchen finished is a fact, and
  -- cancelling it would restate the day's record.
  perform app.expect_denial(
    'select public.cancel_kot('
    || quote_literal((select kot_id from public.order_items where order_id =
        (select id from public.orders where notes = 'KOT ORDER ONE') and line_sequence = 2))
    || '::uuid, ''cancel a slip that was fully cooked'')',
    'NIVAAS_INVALID_TRANSITION');

  -- §10 in a write door: a foreign slip id answers NOT_FOUND, never a denial that confirms the
  -- ticket exists somewhere.
  perform app.expect_denial(
    'select public.cancel_kot(''e7000000-0000-4000-8000-000000000003''::uuid, ''probe a foreign slip'')',
    'NIVAAS_NOT_FOUND');

  select public.kot_detail(k) into v;
  perform app.verify('19.4j the retired slip''s detail keeps only the plate that was genuinely made',
    jsonb_array_length(v->'lines') = 1 and (v->'lines'->0->>'fireStatus') = 'READY'
    and (v->>'status') = 'CANCELLED');
end;
$$;

-- --------------------------------------------------------------------------- 19.5 the reads
set role authenticated;
set app.user_id to '00000000-0000-4000-8000-0000000000ae';

do $$
declare
  v    jsonb;
  e    jsonb;
  i1   uuid;
  s1   uuid;
begin
  -- §9, the assertion this file would be least sorry to lose: rename and reprice the dish AFTER
  -- the slip printed, and the paper must still say what was sold.
  select id into i1 from public.menu_items where item_code = 'KT-1';
  select id into s1 from public.kitchen_order_tickets where idempotency_key = 's19-slip-one';
  select public.update_menu_item(i1, 'KOT Rename Probe') into v;
  select public.set_menu_item_price(i1, 299.00, now(), 'kitchen scenario reprices') into v;

  select public.kot_detail(s1) into v;
  perform app.verify('19.5a a menu edit never rewrites an old slip: the name and price are the sale''s own (§9)',
    exists (select 1 from jsonb_array_elements(v->'lines') x
             where (x->>'itemName') = 'KOT Thali' and (x->>'unitPrice') = '260.00'
               and (x->>'itemCode') = 'KT-1')
    and not exists (select 1 from jsonb_array_elements(v->'lines') x
             where (x->>'itemName') = 'KOT Rename Probe'));

  -- §1: the money on a ticket is a string; a count is a number. If a future edit dropped the
  -- ::text, this fails here rather than on a printed bill.
  select jsonb_array_elements(v->'lines') into e;
  perform app.verify('19.5b unit price leaves the read as TEXT while a quantity stays a number (§1)',
    jsonb_typeof(e->'unitPrice') = 'string' and jsonb_typeof(e->'quantity') = 'number');

  perform app.verify('19.5c the options are frozen by name and price too, never by id alone, and none of that money leaves as a number',
    (select count(*) from jsonb_array_elements(v->'lines') x,
       jsonb_array_elements(x->'modifiers') m
      where (m->>'name') = 'Extra Ghee' and (m->>'priceAdjustment') = '25.50') = 1
    and (select count(*) from jsonb_array_elements(v->'lines') x,
       jsonb_array_elements(x->'modifiers') m
      where jsonb_typeof(m->'priceAdjustment') <> 'string') = 0);

  perform app.verify('19.5d the special instruction the floor typed is on the paper',
    exists (select 1 from jsonb_array_elements(v->'lines') x
             where (x->>'specialInstructions') = 'extra crisp'));

  perform app.verify('19.5e the slip prints in line order, so the paper matches the screen it was cut from',
    (select count(*) from jsonb_array_elements(v->'lines') with ordinality s(x, ord)
      where (x->>'lineSequence')::int = s.ord) = jsonb_array_length(v->'lines'));

  -- open_kots: the kitchen's queue. Only OPEN, only this outlet, counts computed inside the door.
  select public.open_kots('a2000000-0000-4000-8000-000000000001'::uuid) into v;
  perform app.verify('19.5f the queue is only OPEN slips — the cooked one and the cancelled one are gone',
    (select count(*) from jsonb_array_elements(v) x where (x->>'status') <> 'OPEN') = 0
    and not exists (select 1 from jsonb_array_elements(v) x where (x->>'id') = s1::text)
    and not exists (select 1 from jsonb_array_elements(v) x where (x->>'id') =
          (select id::text from public.kitchen_order_tickets where idempotency_key = 's19-mis-send'))
    and jsonb_array_length(v) = (select count(*) from public.kitchen_order_tickets
      where outlet_id = 'a2000000-0000-4000-8000-000000000001' and status = 'OPEN'));

  perform app.verify('19.5g every queue row carries the slip number, the order handle and its own counts as text',
    (select count(*) from jsonb_array_elements(v) x
      where x ? 'kotNumber' and x ? 'orderNumber' and x ? 'businessDate'
        and jsonb_typeof(x->'lineCount') = 'string'
        and jsonb_typeof(x->'readyCount') = 'string') = jsonb_array_length(v));

  -- A foreign slip, named literally, from a seat that holds every kitchen token in its own estate.
  perform app.expect_denial(
    'select public.kot_detail(''e7000000-0000-4000-8000-000000000003''::uuid)',
    'NIVAAS_NOT_FOUND');

  -- An id that never existed answers the same way as a foreign one: the door gives away nothing.
  perform app.expect_denial(
    'select public.kot_detail(''ea000000-0000-4000-8000-0000000000ff''::uuid)',
    'NIVAAS_NOT_FOUND');
end;
$$;

-- A queue slip in its own send, so its fired_at is genuinely later than the others' and the
-- queue's ordering claim can be tested rather than admired.
set role authenticated;
set app.user_id to '00000000-0000-4000-8000-0000000000ac';
do $$
declare
  v  jsonb;
  o  uuid;
  i3 uuid;
  t  uuid;
begin
  select id into i3 from public.menu_items where item_code = 'KB-1';
  select id into t  from public.restaurant_tables where code = 'T21';
  select public.create_order('a2000000-0000-4000-8000-000000000001'::uuid, 'DINE_IN',
    jsonb_build_array(jsonb_build_object('itemId', i3, 'quantity', 4),
                      jsonb_build_object('itemId', i3, 'quantity', 1)),
    t, null, 'KOT ORDER QUEUE') into v;
  o := (v->>'id')::uuid;
  select public.set_order_status(o, 'PLACED') into v;
  select public.set_order_status(o, 'CONFIRMED') into v;
  select public.send_kot(o, (select jsonb_agg(id order by line_sequence)
    from public.order_items where order_id = o), 'the queue slip', false, null,
    's19-queue') into v;
end;
$$;

set role authenticated;
set app.user_id to '00000000-0000-4000-8000-0000000000ad';
do $$
declare
  v jsonb;
  o uuid;
begin
  select id into o from public.orders where notes = 'KOT ORDER QUEUE';
  select public.set_order_item_fire_status(
    (select id from public.order_items where order_id = o and line_sequence = 2),
    'READY') into v;

  select public.open_kots('a2000000-0000-4000-8000-000000000001'::uuid) into v;
  perform app.verify('19.5h the door counts what is cooking and what is rung up on each slip',
    (select count(*) from jsonb_array_elements(v) x
      where (x->>'id') = (select id::text from public.kitchen_order_tickets
                           where idempotency_key = 's19-queue')
        and (x->>'lineCount') = '1' and (x->>'readyCount') = '1') = 1);

  perform app.verify('19.5i the queue is ordered oldest-send-first, so a cook works it in order',
    (select (x->>'firedAt') from jsonb_array_elements(v)
      with ordinality s(x, ord) order by s.ord limit 1)
    <= (select (x->>'firedAt') from jsonb_array_elements(v)
      with ordinality s(x, ord) order by s.ord desc limit 1));

  perform app.verify('19.5j a READY line is off the cooking count, so no queue row can claim two plates still on the fire',
    (select count(*) from jsonb_array_elements(v) x where (x->>'lineCount') = '2') = 0);
end;
$$;

-- The same rows through RLS instead of a door. The policy and the doors must refuse the same
-- rows, or one of them is decoration.
set role authenticated;
set app.user_id to '00000000-0000-4000-8000-0000000000af';   -- rooftop-only manager
do $$
declare
  n integer;
begin
  select count(*) into n from public.kitchen_order_tickets;
  perform app.verify('19.5k a seat carved to one restaurant reads none of the other''s slips, raw',
    n = 0);

  perform app.verify('19.5l and it reads none of the banqueting outlet''s either',
    (select count(*) from public.kitchen_order_tickets
      where outlet_id = 'a2000000-0000-4000-8000-00000000000a') = 0);
end;
$$;

set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000001';   -- ORG OWNER A
do $$
declare
  n integer;
begin
  -- Seven, derived rather than recited: the six slips the door cut at Main Dining (counted from
  -- their own audit trail, so an uncut slip could not be smuggled in) plus the one fixture slip
  -- inserted at the banquet outlet. The fixture half matters: 19.8b proves that slip was never
  -- sent, so the audit count cannot see it and the ticket count must.
  select count(*) into n from public.kitchen_order_tickets
    where organization_id = 'a0000000-0000-4000-8000-00000000000a';
  perform app.verify('19.5m the owner reads its own estate''s seven slips — six sent through the door plus the inserted banquet fixture',
    n = 7
    and (select count(*) from public.audit_log where action = 'kot_sent'
          and organization_id = 'a0000000-0000-4000-8000-00000000000a') = 6);

  perform app.verify('19.5n and the foreign estate''s slip is invisible to the owner that cannot see it',
    (select count(*) from public.kitchen_order_tickets
      where organization_id = 'b0000000-0000-4000-8000-00000000000b') = 0);

  -- An empty outlet still answers: the queue read is [] and not an error, so a kitchen screen
  -- shows a quiet pass rather than a crash.
  perform app.verify('19.5o a restaurant with no open slips is answered with an empty array, not a null',
    (select public.open_kots('a2000000-0000-4000-8000-000000000002'::uuid)) = '[]'::jsonb);
end;
$$;

set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000011';   -- ORG OWNER B
do $$
declare
  n integer;
begin
  select count(*) into n from public.kitchen_order_tickets;
  perform app.verify('19.5p tenant B reads exactly its own one slip', n = 1);

  -- A real tenant-A id handed across the wall, through both a read door and a write door: the
  -- answer is NOT_FOUND in both, because confirming existence is itself a leak (§10).
  perform app.expect_denial(
    'select public.kot_detail(''e8000000-0000-4000-8000-000000000003''::uuid)',
    'NIVAAS_NOT_FOUND');
  perform app.expect_denial(
    'select public.reprint_kot(''e8000000-0000-4000-8000-000000000003''::uuid, ''cross-tenant reprint'')',
    'NIVAAS_NOT_FOUND');
  perform app.expect_denial(
    'select public.open_kots(''a2000000-0000-4000-8000-000000000001''::uuid)',
    'NIVAAS_NOT_FOUND');
end;
$$;

reset role;
do $$
begin
  -- The residue check has to be read by a seat that can see the row: under tenant B's own RLS the
  -- slip is correctly invisible, which would answer NULL and prove nothing. Read as the table
  -- owner, the ticket is still the OPEN one it was before the three probes (§10's refusals write
  -- nothing into somebody else's day).
  perform app.verify('19.5q a probe that was answered NOT_FOUND wrote nothing into tenant A''s day',
    (select status from public.kitchen_order_tickets
      where id = 'e8000000-0000-4000-8000-000000000003') = 'OPEN');
end;
$$;

-- --------------------------------------------------------------------------- 19.6 the ladder
set role authenticated;
set app.user_id to '00000000-0000-4000-8000-0000000000ac';   -- STAFF
do $$
declare
  k  uuid;
  o  uuid;
  l  uuid;
  nt integer;
begin
  -- 013's grants, read out of the catalogue, so the refusals below are ladder facts and not
  -- fixture accidents: if a later migration hands the floor the kitchen's queue, this fails first
  -- and names the rung that moved.
  perform app.verify('19.6a 013 gives the floor kot.create and nothing else on a ticket',
    (select count(*) from public.role_permissions rp join public.roles r on r.id = rp.role_id
      where r.name = 'STAFF' and rp.permission = 'kot.create') = 1
    and (select count(*) from public.role_permissions rp join public.roles r on r.id = rp.role_id
      where r.name = 'STAFF' and rp.permission in ('kot.view','kot.reprint','kot.cancel')) = 0);

  select id into k from public.kitchen_order_tickets where idempotency_key = 's19-queue';
  select id into o from public.orders where notes = 'KOT ORDER QUEUE';
  select id into l from public.order_items where order_id = o and line_sequence = 1;
  nt := (select count(*) from public.kitchen_order_tickets);

  perform app.expect_denial('select public.kot_detail(' || quote_literal(k) || '::uuid)',
    'NIVAAS_ACCESS_DENIED');
  perform app.expect_denial(
    'select public.set_order_item_fire_status(' || quote_literal(l) || '::uuid, ''READY'')',
    'NIVAAS_ACCESS_DENIED');
  perform app.expect_denial(
    'select public.reprint_kot(' || quote_literal(k) || '::uuid, ''floor reprint'')',
    'NIVAAS_ACCESS_DENIED');
  perform app.expect_denial(
    'select public.cancel_kot(' || quote_literal(k) || '::uuid, ''floor cancel'')',
    'NIVAAS_ACCESS_DENIED');

  -- The wall under every ladder refusal: a denied seat is not a partial one.
  perform app.verify('19.6b the floor cannot read, ring, reprint or retire a slip — and the four refusals moved nothing',
    (select fire_status from public.order_items where id = l) = 'FIRED'
    and (select status from public.kitchen_order_tickets where id = k) = 'OPEN'
    and (select count(*) from public.kitchen_order_tickets) = nt);
end;
$$;

set role authenticated;
set app.user_id to '00000000-0000-4000-8000-0000000000ad';   -- KITCHEN_MANAGER
do $$
declare
  o   uuid;
  l   uuid;
  nb  integer;
begin
  perform app.verify('19.6c 013 gives the kitchen the ticket and not one money or sales verb',
    (select count(*) from public.role_permissions rp join public.roles r on r.id = rp.role_id
      where r.name = 'KITCHEN_MANAGER'
        and rp.permission in ('bill.create','payment.create','order.create','order.edit',
                              'bill.void','order.cancel','order.void')) = 0
    and (select count(*) from public.role_permissions rp join public.roles r on r.id = rp.role_id
      where r.name = 'KITCHEN_MANAGER'
        and rp.permission in ('kot.view','kot.reprint','kot.cancel','kot.create')) = 4);

  select id into o from public.orders where notes = 'KOT ORDER QUEUE';
  select id into l from public.order_items where order_id = o and line_sequence = 1;
  nb := (select count(*) from public.bills);

  perform app.expect_denial(
    'select public.void_order_item(' || quote_literal(l) || '::uuid, ''kitchen wants to un-sell it'')',
    'NIVAAS_ACCESS_DENIED');
  perform app.expect_denial('select public.open_bill(' || quote_literal(o) || '::uuid)',
    'NIVAAS_ACCESS_DENIED');
  perform app.expect_denial(
    'select public.create_order(''a2000000-0000-4000-8000-000000000001''::uuid, ''TAKEAWAY'', ''[]''::jsonb)',
    'NIVAAS_ACCESS_DENIED');

  -- The pass, not the till: ringing a plate is the kitchen's whole reach. The permission gate
  -- sits above the empty-array validation in 016, so the third refusal is the ladder's, not a
  -- complaint about the shape of the array.
  perform app.verify('19.6d the kitchen cannot void a sale or open a bill — the line is still sold and the till is still empty',
    (select status from public.order_items where id = l) = 'ACTIVE'
    and (select count(*) from public.bills) = nb);

  perform app.verify('19.6e but the same seat does own the queue it was refused on the floor''s side',
    jsonb_typeof(public.open_kots('a2000000-0000-4000-8000-000000000001'::uuid)) = 'array');
end;
$$;

set role authenticated;
set app.user_id to '00000000-0000-4000-8000-0000000000d1';   -- EVENT_MANAGER @ Main Dining
do $$
declare
  v jsonb;
  k uuid;
begin
  select id into k from public.kitchen_order_tickets where idempotency_key = 's19-queue';
  select public.kot_detail(k) into v;
  perform app.verify('19.6f the events seat really can read the slip — so 19.6b''s reprint refusal was the token, not the ticket',
    (v->>'kot_number') is not null);

  perform app.expect_denial('select public.reprint_kot(' || quote_literal(k) || '::uuid, ''events reprint'')',
    'NIVAAS_ACCESS_DENIED');
  perform app.verify('19.6g the right to read a slip is not the right to send a second copy of it',
    (select reprint_count from public.kitchen_order_tickets where id = k) = 0);
end;
$$;

set role authenticated;
set app.user_id to '00000000-0000-4000-8000-0000000000af';   -- rooftop-only manager
-- Same tenant, same role name, same token: the SCOPE is the refusal. Outlet ids are literals
-- because this seat's own RLS cannot read Main Dining's rows back.
select app.expect_denial(
  'select public.open_kots(''a2000000-0000-4000-8000-000000000001''::uuid)',
  'NIVAAS_ACCESS_DENIED');

set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000001';   -- ORG OWNER A
do $$
declare
  o uuid;
begin
  -- §12: a paused restaurant is a fact in the database, not a sign on a door. This order is in
  -- the state a send wants, the seat holds every token, and the outlet still says no — and the
  -- refusal leaves the line un-fired.
  perform app.expect_denial(
    'select public.send_kot(''e9000000-0000-4000-8000-000000000001''::uuid, '
    || '''["e9000000-0000-4000-8000-000000000002"]''::jsonb)',
    'NIVAAS_OUTLET_NOT_WRITABLE');
  perform app.verify('19.6h a closed outlet prints nothing, and the refusal leaves no slip and no fired line',
    (select count(*) from public.kitchen_order_tickets
      where outlet_id = 'a2000000-0000-4000-8000-0000000000b1') = 0
    and (select fire_status from public.order_items
          where id = 'e9000000-0000-4000-8000-000000000002') = 'NOT_FIRED');

  select id into o from public.orders where notes = 'KOT ORDER QUEUE';

  -- §5: a caller who states a version that is no longer true is stopped before the slip exists,
  -- and — because the number is minted inside the same transaction — before one is spent.
  perform app.expect_denial(
    'select public.send_kot(' || quote_literal(o) || '::uuid, ''[]''::jsonb, null, false, 999)',
    'NIVAAS_VERSION_CONFLICT');
  perform app.verify('19.6i a stale-version send leaves the order it refused untouched',
    (select version from public.orders where id = o) = 4);

  -- A KOT of nothing at all is a domain refusal, not an empty piece of paper.
  perform app.expect_denial(
    'select public.send_kot(' || quote_literal(o) || '::uuid, ''[]''::jsonb)',
    'NIVAAS_KOT_EMPTY');

  -- A READY line cannot be put on another slip: re-sending a cooked plate is a duplicate plate.
  perform app.expect_denial(
    'select public.send_kot(' || quote_literal(o) || '::uuid, '
    || quote_literal(jsonb_build_array((select id from public.order_items
         where order_id = o and line_sequence = 2))::text) || '::jsonb)',
    'NIVAAS_KOT_LINE_NOT_FIRABLE');

  -- A line that is not on this order at all is NOT_FOUND, not "unfirable": the door does not
  -- explain which rows exist elsewhere.
  perform app.expect_denial(
    'select public.send_kot(' || quote_literal(o) || '::uuid, '
    || '''["e7000000-0000-4000-8000-000000000002"]''::jsonb)',
    'NIVAAS_NOT_FOUND');

  -- And the refusals above wrote nothing: the queue order still carries its one slip, exactly as
  -- the kitchen left it.
  perform app.verify('19.6j the four send-door refusals added no slip to this order',
    (select count(*) from public.kitchen_order_tickets k where k.order_id = o) = 1);
end;
$$;

reset role;
do $$
begin
  -- The second half of 19.6i, read where it lives: `document_counters` is revoked to
  -- `authenticated` (17.13d), and the counter sitting exactly on the newest number printed at
  -- this outlet is the proof that the refused send spent no number before it was stopped (§5).
  -- A number allocated before the version check would leave the counter one ahead of the paper.
  perform app.verify('19.6i the stale-version refusal spent no number: the counter is still the newest one printed',
    (select c.last_value from public.document_counters c
      where c.outlet_id = 'a2000000-0000-4000-8000-000000000001' and c.prefix = 'KOT')
    = (select max(substr(k.kot_number, 5)::int) from public.kitchen_order_tickets k
        where k.outlet_id = 'a2000000-0000-4000-8000-000000000001'));
end;
$$;

-- ----------------------------------------------------------------------------- 19.7 the walls
-- No client DML on the ticket table at all: the door is the only write path, so no policy can be
-- argued into accepting one. These run as `authenticated`, the only role a client ever gets.
set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000001';
select app.expect_denial('insert into public.kitchen_order_tickets (organization_id, property_id, '
                      || 'outlet_id, order_id, kot_number, business_date) values '
                      || '(''a0000000-0000-4000-8000-00000000000a''::uuid, '
                      || '''a1000000-0000-4000-8000-000000000001''::uuid, '
                      || '''a2000000-0000-4000-8000-000000000001''::uuid, '
                      || '''e9000000-0000-4000-8000-000000000001''::uuid, ''KOT-888888'', current_date)',
                      'permission denied');
select app.expect_denial('update public.kitchen_order_tickets set status = ''CLOSED'' '
                      || 'where id = (select id from public.kitchen_order_tickets '
                      || 'where idempotency_key = ''s19-queue'')', 'permission denied');
select app.expect_denial('delete from public.kitchen_order_tickets '
                      || 'where idempotency_key = ''s19-queue''', 'permission denied');
select app.expect_denial('update public.order_items set fire_status = ''READY'' '
                      || 'where line_sequence = 99', 'permission denied');

reset role;
do $$
declare
  k uuid;
  o uuid;
  l uuid;
begin
  select id into k from public.kitchen_order_tickets where idempotency_key = 's19-queue';
  select id into o from public.orders where notes = 'KOT ORDER QUEUE';
  select id into l from public.order_items where order_id = o and line_sequence = 1;

  -- The chain guard, reached directly: a slip claiming a different outlet than its own order is
  -- refused before it exists. This is what makes 018's RLS predicate sound rather than hopeful.
  perform app.expect_denial(
    'insert into public.kitchen_order_tickets (organization_id, property_id, outlet_id, order_id, '
    || 'kot_number, business_date) values (''a0000000-0000-4000-8000-00000000000a'', '
    || '''a1000000-0000-4000-8000-000000000001'', ''a2000000-0000-4000-8000-000000000002'', '
    || quote_literal(o) || ', ''KOT-777777'', current_date)',
    'NIVAAS_SCOPE_MISMATCH');
  perform app.verify('19.7a a forged-outlet slip is refused by the chain guard and exists nowhere',
    (select count(*) from public.kitchen_order_tickets where kot_number = 'KOT-777777') = 0);

  -- §7's separation, in the constraints rather than in a comment: the kitchen's ladder and the
  -- sales ladder are two CHECKs, and neither ladder's words appear in the other.
  perform app.expect_denial(
    'update public.order_items set fire_status = ''SERVED'' where id = ' || quote_literal(l),
    'order_items_fire_status_ok');
  perform app.expect_denial(
    'update public.order_items set status = ''FIRED'' where id = ' || quote_literal(l),
    'order_items_status_ok');
  perform app.expect_denial(
    'update public.kitchen_order_tickets set status = ''FIRING'' where id = ' || quote_literal(k),
    'kitchen_order_tickets_status_ok');
  perform app.expect_denial(
    'update public.kitchen_order_tickets set reprint_count = 200 where id = ' || quote_literal(k),
    'kitchen_order_tickets_reprint_count_check');

  perform app.verify('19.7b the fire CHECK holds §26''s three words only, and says nothing about sales',
    (select pg_get_constraintdef(c.oid) from pg_constraint c
      where c.conname = 'order_items_fire_status_ok') ~ 'NOT_FIRED'
    and (select pg_get_constraintdef(c.oid) from pg_constraint c
      where c.conname = 'order_items_fire_status_ok') !~ 'ACTIVE'
    and (select pg_get_constraintdef(c.oid) from pg_constraint c
      where c.conname = 'order_items_fire_status_ok') !~ 'VOIDED'
    and (select pg_get_constraintdef(c.oid) from pg_constraint c
      where c.conname = 'order_items_fire_status_ok') !~ 'SERVED');

  perform app.verify('19.7c and the sales CHECK says nothing about the kitchen''s ladder',
    (select pg_get_constraintdef(c.oid) from pg_constraint c
      where c.conname = 'order_items_status_ok') !~ 'FIRED'
    and (select pg_get_constraintdef(c.oid) from pg_constraint c
      where c.conname = 'order_items_status_ok') !~ 'READY');

  -- A retired ticket that a line still points at cannot be erased: RESTRICT, so the printed fact
  -- survives every attempt to delete its slip.
  perform app.expect_denial('delete from public.kitchen_order_tickets where id = '
    || quote_literal(k), 'order_items_kot_id_fkey');

  -- Both triggers attached, counted rather than listed, and of the right shape: chain fires on
  -- INSERT and UPDATE both (pg_trigger bits 4 and 16), touch on UPDATE.
  perform app.verify('19.7d the chain guard and the touch trigger are attached, and the chain sees inserts AND updates',
    (select count(distinct tgname) from pg_trigger
      where tgrelid = 'public.kitchen_order_tickets'::regclass
        and tgname in ('kitchen_order_tickets_touch','kitchen_order_tickets_chain')) = 2
    and exists (select 1 from pg_trigger where tgname = 'kitchen_order_tickets_chain'
      and tgrelid = 'public.kitchen_order_tickets'::regclass
      and (tgtype & 4) > 0 and (tgtype & 16) > 0));

  perform app.verify('19.7e the ticket table is under RLS and grants a client role no write at all',
    (select relrowsecurity from pg_class where relname = 'kitchen_order_tickets')
    and not exists (select 1 from information_schema.role_table_grants
      where grantee = 'authenticated' and table_name = 'kitchen_order_tickets'
        and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')));

  -- The two machines: every legal edge present, and the absent ones absent. READY>FIRED and
  -- NOT_FIRED>READY are missing on purpose, and CLOSED>CANCELLED with them.
  perform app.verify('19.7f the fire ladder is exactly two edges and the ticket ladder exactly two',
    app.rest_kot_fire_transition_allowed('NOT_FIRED','FIRED')
    and app.rest_kot_fire_transition_allowed('FIRED','READY')
    and not app.rest_kot_fire_transition_allowed('READY','FIRED')
    and not app.rest_kot_fire_transition_allowed('NOT_FIRED','READY')
    and app.rest_kot_transition_allowed('OPEN','CLOSED')
    and app.rest_kot_transition_allowed('OPEN','CANCELLED')
    and not app.rest_kot_transition_allowed('CLOSED','CANCELLED')
    and not app.rest_kot_transition_allowed('CANCELLED','OPEN'));

  -- And they live in `app`, never in `public`: a transition rule published over HTTP is a rule a
  -- client can call for a row it cannot read (016's reason for the same split).
  perform app.verify('19.7g both machines live in app and public holds no copy of either',
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'app' and p.proname in ('rest_kot_fire_transition_allowed',
        'rest_kot_transition_allowed')) = 2
    and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('rest_kot_fire_transition_allowed',
        'rest_kot_transition_allowed')));

  -- The kitchen's whole client surface is six named doors, none of them stacked into an overload
  -- (017's signature rule, re-measured here): a seventh row under any of these names would mean
  -- PostgREST had two doors of that name to choose between.
  perform app.verify('19.7h the kitchen surface is exactly the six doors 018 names, one signature each, all executable by a client',
    (select count(*) from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('send_kot','set_order_item_fire_status',
       'cancel_kot','reprint_kot','kot_detail','open_kots')) = 6
    and (select count(distinct p.proname) from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('send_kot','set_order_item_fire_status',
       'cancel_kot','reprint_kot','kot_detail','open_kots')) = 6
    and (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('send_kot','set_order_item_fire_status',
        'cancel_kot','reprint_kot','kot_detail','open_kots')
        and has_function_privilege('authenticated', p.oid, 'execute')) = 6);
end;
$$;

-- ----------------------------------------------------------------------------- 19.8 the audit
reset role;
do $$
declare
  n integer;
begin
  -- Every slip this outlet owns has exactly one kot_sent behind it — and the banqueting fixture
  -- slip, inserted rather than sent, has none. That second half is what turns this from a count
  -- into a statement about the door.
  select count(*) into n from public.kitchen_order_tickets k
    where k.outlet_id = 'a2000000-0000-4000-8000-000000000001'
      and (select count(*) from public.audit_log a where a.action = 'kot_sent'
        and a.entity = 'kot' and a.entity_id = k.id::text and a.result = 'SUCCESS') <> 1;
  perform app.verify('19.8a every slip the door cut has exactly one kot_sent row, and no more', n = 0);

  select count(*) into n from public.audit_log where action = 'kot_sent'
    and outlet_id = 'a2000000-0000-4000-8000-00000000000a';
  perform app.verify('19.8b a slip that was inserted as a fixture left no trail — audit rows are door acts',
    n = 0);

  select count(*) into n from public.audit_log where action in ('kot_sent','kot_closed',
    'kot_cancelled','kot_reprinted','order_item_fire_status_changed')
    and (actor_id is null or result <> 'SUCCESS' or organization_id is null);
  perform app.verify('19.8c every kitchen audit row names an actor, a tenant and a SUCCESS result', n = 0);

  perform app.verify('19.8d nothing was audited that the database did not do — the thirty-odd refusals above left no history',
    (select count(*) from public.audit_log where action like 'kot%'
      and result <> 'SUCCESS') = 0);

  perform app.verify('19.8e the one cancellation on record explains itself, and it is the only retired slip in the estate',
    (select count(*) from public.audit_log where action = 'kot_cancelled'
      and outlet_id = 'a2000000-0000-4000-8000-000000000001'
      and btrim(coalesce(reason, '')) <> '') = 1
    and (select count(*) from public.kitchen_order_tickets where status = 'CANCELLED') = 1);

  -- §11's four steps in the ledger, split by entity: a ring-up is audited against the LINE it
  -- moved, and the closure it caused is audited against the TICKET. Cross-checking the ring-ups
  -- against the READY lines the kitchen actually produced is what makes the count meaningful:
  -- nothing else in this schema can write READY, so the two must agree.
  perform app.verify('19.8f each ring-up is audited once against its own line, and the four of them are the four READY lines',
    (select count(*) from public.audit_log where action = 'order_item_fire_status_changed'
      and entity = 'order_item'
      and outlet_id = 'a2000000-0000-4000-8000-000000000001') = 4
    and (select count(*) from public.audit_log where action = 'order_item_fire_status_changed')
      = (select count(*) from public.order_items where fire_status = 'READY'));

  perform app.verify('19.8g the trail stores the edge it crossed, not merely that something moved',
    not exists (select 1 from public.audit_log where action = 'order_item_fire_status_changed'
      and ((before->>'fireStatus') is distinct from 'FIRED'
        or (after->>'fireStatus') is distinct from 'READY')));

  perform app.verify('19.8h the six slips this scenario sent are the six that exist at this outlet, and no two slips share a number',
    (select count(*) from public.audit_log where action = 'kot_sent'
      and outlet_id = 'a2000000-0000-4000-8000-000000000001')
    = (select count(*) from public.kitchen_order_tickets
        where outlet_id = 'a2000000-0000-4000-8000-000000000001')
    and (select count(distinct (organization_id::text || outlet_id::text || kot_number || business_date::text))
           from public.kitchen_order_tickets)
      = (select count(*) from public.kitchen_order_tickets));

  -- The scenario's own conservation close: nothing this file wrote left a slip in a shape the
  -- ladder forbids, a retirement without its three facts, or a cooked plate with no ticket.
  perform app.verify('19.8i every slip is in a state its ladder allows, every retirement names who/when/why, and no READY line has lost the slip it was cooked on',
    (select count(*) from public.kitchen_order_tickets
      where status not in ('OPEN','CLOSED','CANCELLED')) = 0
    and (select count(*) from public.kitchen_order_tickets
      where (status = 'CANCELLED') <> (cancelled_at is not null)
         or (cancelled_at is not null and (cancelled_by is null
                                           or btrim(coalesce(cancel_reason, '')) = ''))) = 0
    and (select count(*) from public.order_items
      where fire_status = 'READY' and kot_id is null) = 0);
end;
$$;

-- ============================================================================
-- Scenario 20 — Prompt #04 §52, contract §1, §2, §12, §13: the outlet's trading day in
-- ONE read (019).
--
-- 019 is the only migration in this build that answers a question instead of changing the world,
-- and it exists so that the sentence Phase 1 is signed off with — "the printed bill, the Z-report
-- and the outlet revenue figure agreeing" — has ONE source rather than six counts re-typed inside
-- a component. Everything below is written to catch the specific ways that collapses. If the day
-- had been keyed on the wall clock, 20.1c fails: the cut is the property's 04:00 and 20.1b proves
-- the read stamps itself with the same resolver 016/017/018 stamp their rows with. If a `numeric`
-- had been allowed to reach JavaScript as a JSON number, 20.5b fails. If the day's money had been
-- added across two currencies because "an outlet is only ever INR", 20.5a/20.5g fail. If `live`
-- had been reported as the day's count — or the day's count as `live` — 20.3c fails. If a
-- CANCELLED document had entered the figure a manager signs off, 20.5c/20.5e fail, and they are
-- non-vacuous because this scenario inserts one. If a FAILED payment had been counted as money
-- collected, 20.5i/20.6d fail. If the read had quietly become a write, 20.9b fails; if it had
-- become a tax return or a shift report, 20.7b/20.7c fail, because this build has no tax engine
-- (014 leaves tax_category_id a placeholder, 017 freezes tax_rate at zero) and #05 owns shifts. If
-- the gate had been left to the client, 20.8c/20.8d would read somebody else's night.
--
-- The five fixture rows this scenario needs (a ticket from the night before, a retired document, a
-- second currency, a paise-bearing document and a FAILED payment) are written by the table owner
-- for the reason 15.0 states: the doors would refuse every one of them, and the subject here is
-- what the READ does with figures it is only asked to report. They are inserted last in the file,
-- so no earlier scenario is graded against them.
-- ============================================================================

-- 20.0 — the ladder fact and the fixtures.
reset role;
do $$
declare
  v_org   uuid := 'a0000000-0000-4000-8000-00000000000a';
  v_prop  uuid := 'a1000000-0000-4000-8000-000000000001';
  v_out   uuid := 'a2000000-0000-4000-8000-000000000001';
  v_today date;
begin
  select app.rest_outlet_business_date(v_out) into v_today;

  -- One capability gates the whole read, so the seat it exists to refuse has to be a seat that is
  -- otherwise inside the estate: a member with property access and not one restaurant token.
  perform app.verify('20.0a 013 keeps every restaurant token off the housekeeping seat and puts restaurant.view on the roles that trade',
    (select count(*) from public.role_permissions rp join public.roles r on r.id = rp.role_id
      where r.name = 'HOUSEKEEPING_MANAGER' and rp.permission like 'restaurant.%') = 0
    and (select count(*) from public.role_permissions rp join public.roles r on r.id = rp.role_id
      where r.name in ('RESTAURANT_MANAGER','KITCHEN_MANAGER','STAFF','ORG_OWNER')
        and rp.permission = 'restaurant.view') = 4);

  -- A ticket still open from the night before: `live` must count it and `today` must not, which is
  -- the difference between the room's present tense and the trading day's record (§13).
  insert into public.orders (id, organization_id, property_id, outlet_id, order_number,
    order_type, status, business_date, notes)
  values ('eb000000-0000-4000-8000-000000000001', v_org, v_prop, v_out, 'ORD-FIX-LATE',
          'TAKEAWAY', 'CONFIRMED', v_today - 1, 'fired last night, still open')
  on conflict (id) do nothing;

  -- The order the fixture documents hang on. COMPLETED so it joins the day's record and not the
  -- room's present tense: a settled ticket still billed money tonight.
  insert into public.orders (id, organization_id, property_id, outlet_id, order_number,
    order_type, status, business_date, notes)
  values ('eb000000-0000-4000-8000-000000000002', v_org, v_prop, v_out, 'ORD-FIX-BASE',
          'TAKEAWAY', 'COMPLETED', v_today, 'the fixture day''s ticket')
  on conflict (id) do nothing;

  -- A paise-bearing document, because §1's float trap is only visible where a whole rupee figure
  -- cannot reach it.
  insert into public.bills (id, organization_id, property_id, outlet_id, order_id, bill_number,
    business_date, currency, subtotal, discount_amount, tax_amount, service_charge_amount,
    rounding_amount, grand_total, amount_paid, amount_due, status, opened_at, version,
    created_at, updated_at)
  values ('eb000000-0000-4000-8000-000000000003', v_org, v_prop, v_out,
          'eb000000-0000-4000-8000-000000000002', 'BILL-FIX-OPEN', v_today, 'INR',
          145.50, 0, 0, 0, 0, 145.50, 0, 145.50, 'OPEN', now(), 1, now(), now())
  on conflict (id) do nothing;

  -- A retired document on the SAME day, still carrying its grand total. This is the row the exit
  -- gate is most easily lied about by: it billed nothing, so counting it would inflate the figure
  -- a manager signs.
  insert into public.bills (id, organization_id, property_id, outlet_id, order_id, bill_number,
    business_date, currency, subtotal, discount_amount, tax_amount, service_charge_amount,
    rounding_amount, grand_total, amount_paid, amount_due, status, opened_at, version,
    created_at, updated_at, cancelled_at, cancelled_by, cancel_reason)
  values ('eb000000-0000-4000-8000-000000000004', v_org, v_prop, v_out,
          'eb000000-0000-4000-8000-000000000002', 'BILL-FIX-CANCELLED', v_today, 'INR',
          500.00, 0, 0, 0, 0, 500.00, 0, 500.00, 'CANCELLED', now(), 1, now(), now(),
          now(), '00000000-0000-4000-8000-000000000001', 'a document retired before it billed')
  on conflict (id) do nothing;

  -- The second currency. 014 pins an outlet's MENU to one currency, so no door writes this row —
  -- which is exactly why it has to be inserted: the door's promise is that the day two currencies
  -- are ever in play, the figures stay honest instead of becoming one meaningless sum.
  insert into public.bills (id, organization_id, property_id, outlet_id, order_id, bill_number,
    business_date, currency, subtotal, discount_amount, tax_amount, service_charge_amount,
    rounding_amount, grand_total, amount_paid, amount_due, status, opened_at, version,
    created_at, updated_at)
  values ('eb000000-0000-4000-8000-000000000005', v_org, v_prop, v_out,
          'eb000000-0000-4000-8000-000000000002', 'BILL-FIX-USD', v_today, 'USD',
          100.00, 0, 0, 0, 0, 100.00, 0, 100.00, 'OPEN', now(), 1, now(), now())
  on conflict (id) do nothing;

  -- A payment that did not take. It is money the counter did not collect, and it is on the day.
  insert into public.payments (id, organization_id, property_id, outlet_id, bill_id, order_id,
    payment_number, business_date, amount, currency, method, status, version,
    created_at, updated_at, notes)
  values ('eb000000-0000-4000-8000-000000000006', v_org, v_prop, v_out,
          'eb000000-0000-4000-8000-000000000003', 'eb000000-0000-4000-8000-000000000002',
          'PAY-FIX-FAILED', v_today, 77.00, 'INR', 'CARD', 'FAILED', 1, now(), now(),
          'terminal dropped the attempt')
  on conflict (id) do nothing;

  -- Non-vacuity, stated before the grading: the night this scenario measures really does hold a
  -- retired document, two currencies, paise and a failed attempt. Without these, the equalities
  -- below would pass against a day that tests nothing.
  perform app.verify('20.0b the night under test really carries the four shapes the assertions below grade',
    (select count(*) from public.bills where outlet_id = v_out and business_date = v_today
      and status = 'CANCELLED') >= 1
    and (select count(distinct currency) from public.bills where outlet_id = v_out
      and business_date = v_today and status <> 'CANCELLED') = 2
    and (select count(*) from public.bills where outlet_id = v_out and business_date = v_today
      and grand_total <> trunc(grand_total)) >= 1
    and (select count(*) from public.payments where outlet_id = v_out and business_date = v_today
      and status <> 'SUCCESSFUL') = 1);
end;
$$;

-- ------------------------------------------------- 20.1-20.4 the day, plus 20.7 its shape
set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000001';   -- ORG OWNER A

do $$
declare
  c_out  uuid := 'a2000000-0000-4000-8000-000000000001';
  v      jsonb;
  v_date date;
begin
  select public.restaurant_day_overview(c_out) into v;
  v_date := (v->>'businessDate')::date;

  -- The tenant chain is read off the outlet inside the door: a screen hands over one id and the
  -- database decides whose night that id belongs to.
  perform app.verify('20.1a the day names the outlet''s own tenant chain, not whatever the caller claimed',
    (v->>'outletId')::uuid = c_out
    and (v->>'organizationId')::uuid = (select organization_id from public.outlets where id = c_out)
    and (v->>'propertyId')::uuid = (select property_id from public.outlets where id = c_out));

  -- §13: the day is the outlet's trading date, and it is the SAME resolver 016/017/018 stamp their
  -- rows with. Read against the slips tonight's kitchen printed, this is the fact that keeps one
  -- 00:40 order inside exactly one day's figures.
  perform app.verify('20.1b the read is stamped with the resolver''s date, which is the date tonight''s slips and tonight''s bills carry, so kitchen, till and this figure are one night',
    v_date = app.rest_outlet_business_date(c_out)
    and v_date = (select business_date from public.kitchen_order_tickets
                   where outlet_id = c_out order by kot_number desc limit 1)
    and exists (select 1 from public.bills where outlet_id = c_out and business_date = v_date)
    and exists (select 1 from public.kitchen_order_tickets
                 where outlet_id = c_out and business_date = v_date));

  -- A screen cannot hand this door a date, so it cannot choose its own day: one parameter, and it
  -- is the outlet.
  perform app.verify('20.1c the door takes exactly one argument, the outlet, so a trading day is never a client''s opinion',
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'restaurant_day_overview'
        and p.pronargs = 1) = 1);

  -- covers: the floor's operational truth, derived once by 016's view rather than re-derived here.
  perform app.verify('20.2a covers is exactly the six derived buckets and nothing else',
    (select string_agg(key, ',' order by key) from jsonb_each(v->'covers') e(key, value))
      = 'available,cleaning,occupied,outOfService,reserved,total');

  -- The five service states are a partition of the floor: a table sits in exactly one of them, so
  -- they add up to `total` instead of overlapping, and `total` is this outlet's tables alone.
  perform app.verify('20.2b the five service states partition the floor: they sum to total, and total counts this outlet''s tables only',
    (v->'covers'->>'total')::int = (
      (v->'covers'->>'available')::int + (v->'covers'->>'occupied')::int
      + (v->'covers'->>'reserved')::int + (v->'covers'->>'cleaning')::int
      + (v->'covers'->>'outOfService')::int)
    and (v->'covers'->>'total')::int = (select count(*) from public.restaurant_table_status
                                        where outlet_id = c_out)
    and (v->'covers'->>'total')::int < (select count(*) from public.restaurant_table_status));

  perform app.verify('20.2c each bucket is the view''s own count, so 019 borrows 016''s precedence instead of restating it',
    (v->'covers'->>'available')::int = (select count(*) from public.restaurant_table_status
      where outlet_id = c_out and derived_status = 'AVAILABLE')
    and (v->'covers'->>'occupied')::int = (select count(*) from public.restaurant_table_status
      where outlet_id = c_out and derived_status = 'OCCUPIED')
    and (v->'covers'->>'reserved')::int = (select count(*) from public.restaurant_table_status
      where outlet_id = c_out and derived_status = 'RESERVED')
    and (v->'covers'->>'cleaning')::int = (select count(*) from public.restaurant_table_status
      where outlet_id = c_out and derived_status = 'CLEANING')
    and (v->'covers'->>'outOfService')::int = (select count(*) from public.restaurant_table_status
      where outlet_id = c_out and derived_status = 'OUT_OF_SERVICE'));

  -- §13's two tenses, said apart. `live` is the room right now, across every date; `today` and
  -- `byStatus` are this business date's record.
  perform app.verify('20.3a today counts the trading date and nothing else',
    (v->'tickets'->>'today')::int = (select count(*) from public.orders
      where outlet_id = c_out and business_date = v_date));

  perform app.verify('20.3b live is the present tense across every date: the three settled words are out, everything cooking or unpaid is in',
    (v->'tickets'->>'live')::int = (select count(*) from public.orders
      where outlet_id = c_out and status not in ('COMPLETED','CANCELLED','VOID')));

  -- The two questions genuinely differ here, and the difference is not an accident of the fixture:
  -- the night-before ticket is in `live` and not in `today`, and tonight's settled tickets are in
  -- `today` and not in `live`. Reporting one figure for both would be the misleading manager's
  -- view the header refuses.
  perform app.verify('20.3c live and today are different questions: each gap is explained by the other half of §13',
    (v->'tickets'->>'live')::int - (select count(*) from public.orders
        where outlet_id = c_out and business_date = v_date
          and status not in ('COMPLETED','CANCELLED','VOID'))
      = (select count(*) from public.orders where outlet_id = c_out
          and business_date < v_date and status not in ('COMPLETED','CANCELLED','VOID'))
    and (v->'tickets'->>'today')::int - (select count(*) from public.orders
        where outlet_id = c_out and business_date = v_date
          and status not in ('COMPLETED','CANCELLED','VOID'))
      = (select count(*) from public.orders where outlet_id = c_out and business_date = v_date
          and status in ('COMPLETED','CANCELLED','VOID'))
    and exists (select 1 from public.orders where outlet_id = c_out
          and business_date < v_date and status not in ('COMPLETED','CANCELLED','VOID')));

  perform app.verify('20.3d byStatus is the day''s own group-by, terminal states included, and its counts sum to today',
    (v->'tickets'->'byStatus') = (
      select coalesce(jsonb_object_agg(s.status, s.n), '{}'::jsonb)
        from (select o.status, count(*)::int as n
                from public.orders o
               where o.outlet_id = c_out and o.business_date = v_date
               group by o.status) s)
    and (select coalesce(sum((e.value)::int), 0) from jsonb_each(v->'tickets'->'byStatus') e(key, value))
      = (v->'tickets'->>'today')::int
    and (v->'tickets'->'byStatus' ? 'COMPLETED'));

  -- The pass. openSlips is the present tense (any date); the two line counts are only what sits on
  -- a slip the pass can still see; the reprint and cancellation figures are the day's record.
  perform app.verify('20.4a openSlips counts the outlet''s OPEN slips, whatever day they were cut on',
    (v->'kitchen'->>'openSlips')::int = (select count(*) from public.kitchen_order_tickets
      where outlet_id = c_out and status = 'OPEN'));

  perform app.verify('20.4b linesCooking is exactly the FIRED lines still on an OPEN slip',
    (v->'kitchen'->>'linesCooking')::int = (select count(*) from public.order_items oi
      join public.kitchen_order_tickets k on k.id = oi.kot_id
     where k.outlet_id = c_out and k.status = 'OPEN' and oi.fire_status = 'FIRED'));

  -- §7's two machines meeting: a plate the kitchen rang up on a slip that has since CLOSED or been
  -- retired is tonight's history, not the pass's present. 19.3 CLOSED slips and 19.4 retired one,
  -- so this strict inequality is a fact of the night rather than an empty set.
  perform app.verify('20.4c linesRungUp counts only READY lines on an OPEN slip, and is strictly below every READY line the outlet owns',
    (v->'kitchen'->>'linesRungUp')::int = (select count(*) from public.order_items oi
      join public.kitchen_order_tickets k on k.id = oi.kot_id
     where k.outlet_id = c_out and k.status = 'OPEN' and oi.fire_status = 'READY')
    and (v->'kitchen'->>'linesRungUp')::int < (select count(*) from public.order_items oi
      join public.kitchen_order_tickets k on k.id = oi.kot_id
     where k.outlet_id = c_out and oi.fire_status = 'READY'));

  perform app.verify('20.4d the day''s two retired figures are the day''s: reprints summed and cancellations counted on the trading date',
    (v->'kitchen'->>'reprintsToday')::int = coalesce((select sum(k.reprint_count)
      from public.kitchen_order_tickets k
     where k.outlet_id = c_out and k.business_date = v_date), 0)::int
    and (v->'kitchen'->>'cancelledSlipsToday')::int = (select count(*)
      from public.kitchen_order_tickets k
     where k.outlet_id = c_out and k.business_date = v_date and k.status = 'CANCELLED')
    and (v->'kitchen'->>'reprintsToday')::int > 0
    and (v->'kitchen'->>'cancelledSlipsToday')::int > 0);

  -- The three slip states are a partition of the outlet's paper, so `openSlips` cannot be a
  -- sneaky day-count dressed as a present-tense one.
  perform app.verify('20.4e the slip states partition: open plus closed plus retired is every slip this outlet owns',
    (v->'kitchen'->>'openSlips')::int
      + (select count(*) from public.kitchen_order_tickets
          where outlet_id = c_out and status = 'CLOSED')
      + (select count(*) from public.kitchen_order_tickets
          where outlet_id = c_out and status = 'CANCELLED')
      = (select count(*) from public.kitchen_order_tickets where outlet_id = c_out));

  -- Shape before value: the payload is exactly the ten blocks 019 names, in the money and tender
  -- shapes it names, with no extra figure waiting to be mistaken for the day's revenue.
  perform app.verify('20.7a the payload is exactly the ten blocks 019 documents, and no eleventh',
    (select count(*) from jsonb_each(v) e(key, value)) = 10
    and (select string_agg(key, ',' order by key) from jsonb_each(v) e(key, value))
      = 'businessDate,covers,generatedAt,kitchen,money,organizationId,outletId,propertyId,tender,tickets');

  perform app.verify('20.7b a money row is the six figures 019 promises, and not one tax line: this build has no tax engine, so a GST day figure would be an invention',
    jsonb_array_length(v->'money') > 0
    and (select count(*) from jsonb_array_elements(v->'money') m
      where (select string_agg(e.key, ',' order by e.key) from jsonb_each(m) e(key, value))
        = 'billed,collected,currency,documents,outstanding,payments')
      = jsonb_array_length(v->'money')
    and not exists (select 1 from jsonb_each(v) e(key, value)
      where e.key ~* '(tax|gst|tip|shift|drawer)'));

  perform app.verify('20.7c tender is the four figures of a method total, and the read tells a date from a moment',
    (select count(*) from jsonb_array_elements(v->'tender') t
      where (select string_agg(e.key, ',' order by e.key) from jsonb_each(t) e(key, value))
        = 'amount,currency,method,payments') = jsonb_array_length(v->'tender')
    and jsonb_array_length(v->'tender') > 0
    and jsonb_typeof(v->'businessDate') = 'string'
    and (v->>'businessDate') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    and jsonb_typeof(v->'generatedAt') = 'string'
    and (v->>'generatedAt')::timestamptz > now() - interval '10 minutes');
end;
$$;

-- ------------------------------------------------------- 20.5/20.6 the money and the tender
set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000001';   -- ORG OWNER A

do $$
declare
  c_out   uuid := 'a2000000-0000-4000-8000-000000000001';
  v       jsonb;
  v_date  date;
  v_inr   jsonb;
  v_usd   jsonb;
  n_doc     integer;
  n_naive   integer;
  n_canc    integer;
  n_moves   integer;
  n_failed  integer;
  v_billed  numeric;
  v_due     numeric;
  v_coll    numeric;
  v_naive   numeric;
  v_canc    numeric;
  v_payall  numeric;
begin
  select public.restaurant_day_overview(c_out) into v;
  v_date := (v->>'businessDate')::date;
  select x into v_inr from jsonb_array_elements(v->'money') x where x->>'currency' = 'INR';
  select x into v_usd from jsonb_array_elements(v->'money') x where x->>'currency' = 'USD';

  -- Every derivation below is per currency, because that is the shape of the rows being graded:
  -- the door reports one row per currency and 20.5g holds the USD row to the same discipline.
  select count(*)::int, sum(b.grand_total), sum(b.amount_due) into n_doc, v_billed, v_due
    from public.bills b
   where b.outlet_id = c_out and b.business_date = v_date and b.status <> 'CANCELLED'
     and b.currency = 'INR';
  select count(*)::int, sum(p.amount) into n_moves, v_coll
    from public.payments p
   where p.outlet_id = c_out and p.business_date = v_date and p.status = 'SUCCESSFUL'
     and p.currency = 'INR';
  select count(*)::int, sum(b.grand_total) into n_naive, v_naive
    from public.bills b
   where b.outlet_id = c_out and b.business_date = v_date and b.currency = 'INR';
  select count(*)::int, sum(b.grand_total) into n_canc, v_canc
    from public.bills b
   where b.outlet_id = c_out and b.business_date = v_date and b.status = 'CANCELLED'
     and b.currency = 'INR';
  select count(*)::int, sum(p.amount) into n_failed, v_payall
    from public.payments p
   where p.outlet_id = c_out and p.business_date = v_date and p.currency = 'INR';

  -- §2: Postgres does the summing. The door's figures are compared against the same sums taken
  -- straight from the tables it reads, so a second engine anywhere else in the build would show
  -- up here as a difference in a rupee.
  perform app.verify('20.5a the day groups by currency and never adds across one',
    jsonb_typeof(v->'money') = 'array'
    and jsonb_array_length(v->'money') = (select count(distinct b.currency) from public.bills b
      where b.outlet_id = c_out and b.business_date = v_date and b.status <> 'CANCELLED')
    and (select count(distinct x->>'currency') from jsonb_array_elements(v->'money') x)
      = jsonb_array_length(v->'money')
    and jsonb_array_length(v->'money') = 2);

  -- §1's discipline is asserted on the JSON type, not on the value: a numeric that reaches
  -- JavaScript as a number has already lost the paise by the time it is a float on screen.
  perform app.verify('20.5b every money amount leaves as a JSON string, and not one of them as a number',
    (select count(*) from jsonb_array_elements(v->'money') m, jsonb_each(m) e(key, value)
      where e.key in ('billed','collected','outstanding')) = 6
    and (select count(*) from jsonb_array_elements(v->'money') m, jsonb_each(m) e(key, value)
      where e.key in ('billed','collected','outstanding')
        and jsonb_typeof(e.value) <> 'string') = 0);

  -- The exclusion is exercised, not described: 20.0b guarantees a retired document on this night,
  -- so `documents` is strictly below the naive count by exactly its number of rows.
  perform app.verify('20.5c a retired document is in neither the count nor the figure the gate is signed against',
    (v_inr->>'documents')::int = n_doc
    and n_doc = n_naive - n_canc
    and n_canc >= 1
    and (v_inr->>'documents')::int < n_naive);

  perform app.verify('20.5d the day''s rupees are Postgres''s own sums, carried as text and equal to them digit for digit',
    (v_inr->>'billed') = v_billed::text
    and (v_inr->>'outstanding') = v_due::text
    and (v_inr->>'collected') = v_coll::text
    and (v_inr->>'payments')::int = n_moves);

  perform app.verify('20.5e the rupees of retired paper are exactly what separates the naive sum from the figure this door reports',
    v_naive - v_billed = v_canc and v_canc > 0);

  -- The paise: 145.50 of fixture paper makes tonight's billed figure end in .50, which is where a
  -- float crossing the wire would first be visible.
  perform app.verify('20.5f the day''s paise survive the trip: billed ends in the half-rupee the door summed, and re-reads exactly',
    (v_inr->>'billed') like '%.50'
    and (v_inr->>'billed')::numeric = v_billed);

  -- The second currency, in its own row and never blended: no figure on either side of the payload
  -- equals the sum across both.
  perform app.verify('20.5g a second currency is a second row, and nothing anywhere in the read is the sum across both',
    v_usd is not null
    and (v_usd->>'documents')::int = (select count(*) from public.bills b
      where b.outlet_id = c_out and b.business_date = v_date
        and b.status <> 'CANCELLED' and b.currency = 'USD')
    and (v_usd->>'billed') = (select sum(b.grand_total)::text from public.bills b
      where b.outlet_id = c_out and b.business_date = v_date
        and b.status <> 'CANCELLED' and b.currency = 'USD')
    and (v_inr->>'billed')::numeric <> (select sum(b.grand_total) from public.bills b
      where b.outlet_id = c_out and b.business_date = v_date and b.status <> 'CANCELLED')
    and (select count(*) from jsonb_array_elements(v->'money') m
      where (m->>'billed')::numeric = (select sum(b.grand_total) from public.bills b
        where b.outlet_id = c_out and b.business_date = v_date and b.status <> 'CANCELLED')) = 0);

  -- Measured behaviour, reported rather than smoothed over: a currency with no money through the
  -- counter renders `collected` as the bare '0' the door's coalesce produces, while every summed
  -- figure keeps its two decimal places. Same class as 18.3j's money-shape asymmetry.
  perform app.verify('20.5h as measured: a currency with no successful payment is reported as the door writes it, a bare 0',
    (v_usd->>'collected') = '0'
    and (v_usd->>'payments')::int = 0);

  perform app.verify('20.5i money the counter did not take is not collected: the failed attempt is the exact difference',
    (v_inr->>'collected')::numeric = v_coll
    and v_payall - v_coll = (select coalesce(sum(p.amount),0) from public.payments p
      where p.outlet_id = c_out and p.business_date = v_date and p.status <> 'SUCCESSFUL')
    and n_failed >= 1
    and (v_inr->>'payments')::int < n_failed + n_moves);

  -- How the money arrived. The two views are summed by the same engine over the same rows, so the
  -- exit gate's sentence — bill, Z-report, revenue figure — has one arithmetic behind it.
  perform app.verify('20.6a tender is the (currency, method) groups of the successful payments, its amounts as text',
    jsonb_array_length(v->'tender') = (select count(*) from (
        select p.currency, p.method from public.payments p
         where p.outlet_id = c_out and p.business_date = v_date and p.status = 'SUCCESSFUL'
         group by p.currency, p.method) g)
    and (select count(distinct (t->>'currency') || '|' || (t->>'method'))
           from jsonb_array_elements(v->'tender') t) = jsonb_array_length(v->'tender')
    and (select count(*) from jsonb_array_elements(v->'tender') t, jsonb_each(t) e(key, value)
      where e.key = 'amount' and jsonb_typeof(e.value) <> 'string') = 0
    and (select count(*) from jsonb_array_elements(v->'tender') t) > 0);

  perform app.verify('20.6b the two views of the money agree: tender summed per currency is the collected figure in money',
    (select coalesce(sum((t->>'amount')::numeric), 0) from jsonb_array_elements(v->'tender') t
      where t->>'currency' = 'INR') = (v_inr->>'collected')::numeric
    and (select coalesce(sum((t->>'amount')::numeric), 0) from jsonb_array_elements(v->'tender') t)
      = (select sum((m->>'collected')::numeric) from jsonb_array_elements(v->'money') m));

  -- No method list is repeated in this file, so the words tender reports are 017's own CHECK
  -- vocabulary — read out of the constraint that defines it.
  perform app.verify('20.6c the methods tender names are 017''s vocabulary and nothing else',
    not exists (select 1 from jsonb_array_elements(v->'tender') t
      where (select pg_get_constraintdef(c.oid) from pg_constraint c
              where c.conname = 'payments_method_ok') not like '%' || (t->>'method') || '%'));

  perform app.verify('20.6d the failed attempt is absent from the tender too, so the drawer cannot be reconciled against money that never came',
    (select count(*) from jsonb_array_elements(v->'tender') t
      where t->>'method' = 'CARD') = 0
    and (select sum((t->>'amount')::numeric) from jsonb_array_elements(v->'tender') t) < v_payall);
end;
$$;

-- ------------------------------------------------------- 20.9 the read reads, it does not write
set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000001';   -- ORG OWNER A

do $$
declare
  c_out uuid := 'a2000000-0000-4000-8000-000000000001';
  v     jsonb;
  w     jsonb;
  nb    integer;
  np    integer;
  no_   integer;
  nk    integer;
  vb    integer;
  vp    integer;
begin
  select count(*)::int, max(version)::int into nb, vb from public.bills;
  select count(*)::int, max(version)::int into np, vp from public.payments;
  select count(*)::int into no_ from public.orders;
  select count(*)::int into nk  from public.kitchen_order_tickets;

  select public.restaurant_day_overview(c_out) into v;
  select public.restaurant_day_overview(c_out) into w;

  -- The dashboard polls this door. Two reads of one night that disagree would be two engines
  -- pretending to be one report, which is the thing §2 exists to prevent.
  perform app.verify('20.9a two reads of one night agree on every figure, so a polling screen cannot drift between them',
    (v - 'generatedAt') = (w - 'generatedAt'));

  perform app.verify('20.9b the read moved nothing it looks at: no document, payment, ticket or slip gained a row or a version',
    (select count(*)::int from public.bills) = nb
    and (select max(version)::int from public.bills) = vb
    and (select count(*)::int from public.payments) = np
    and (select max(version)::int from public.payments) = vp
    and (select count(*)::int from public.orders) = no_
    and (select count(*)::int from public.kitchen_order_tickets) = nk);
end;
$$;

-- --------------------------------------------------------------------- 20.8 the gates
set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000001';   -- ORG OWNER A

do $$
declare
  n integer;
begin
  n := (select count(*) from public.audit_log);

  -- A uuid from a stranger estate and a uuid that was never issued get the SAME answer: which
  -- estate an id belongs to is itself the fact §10 refuses to hand over, and a door that answers
  -- FORBIDDEN for one and NOT_FOUND for the other publishes the estate list.
  perform app.expect_denial(
    'select public.restaurant_day_overview(''f0000000-0000-4000-8000-000000000001''::uuid)',
    'NIVAAS_NOT_FOUND');
  perform app.expect_denial(
    'select public.restaurant_day_overview(''b2000000-0000-4000-8000-000000000001''::uuid)',
    'NIVAAS_NOT_FOUND');

  perform app.verify('20.8a both probes are answered NOT_FOUND, and a refused read leaves no history at all',
    (select count(*) from public.audit_log) = n);
end;
$$;

set role authenticated;
set app.user_id to '00000000-0000-4000-8000-0000000000b1';   -- HOUSEKEEPING_MANAGER @ Main Dining

do $$
begin
  -- The seat is inside the estate (an ACTIVE membership and the property's SELECTED_PROPERTIES
  -- access), so visibility passes and the door itself does the refusing — NIVAAS_ACCESS_DENIED
  -- rather than NOT_FOUND. This is the assertion that fails the day the capability is moved out of
  -- 019 and into a client-side hide: the room's money would then be one fetch away from a seat 013
  -- never trusted with it.
  perform app.expect_denial(
    'select public.restaurant_day_overview(''a2000000-0000-4000-8000-000000000001''::uuid)',
    'NIVAAS_ACCESS_DENIED');
  perform app.verify('20.8b the refusal is the seat''s own ladder fact: this person holds no restaurant.view anywhere in the estate',
    not exists (select 1 from public.role_permissions rp
      join public.roles r on r.id = rp.role_id
      join public.user_roles ur on ur.role_id = r.id
     where ur.user_id = '00000000-0000-4000-8000-0000000000b1'
       and rp.permission = 'restaurant.view'));
end;
$$;

set role authenticated;
set app.user_id to '00000000-0000-4000-8000-0000000000af';   -- RESTAURANT_MANAGER, Rooftop only

do $$
declare
  c_roof uuid := 'a2000000-0000-4000-8000-000000000002';
  v      jsonb;
begin
  perform app.expect_denial(
    'select public.restaurant_day_overview(''a2000000-0000-4000-8000-000000000001''::uuid)',
    'NIVAAS_ACCESS_DENIED');

  -- The same door, the same role, the outlet it was granted: the scope decides, not the role name.
  -- Rooftop sold nothing tonight, so its money and tender are empty arrays and its floor is the one
  -- table 15/16 carved for it.
  select public.restaurant_day_overview(c_roof) into v;
  perform app.verify('20.8c a manager carved to one property reads its own night through the same door it was refused the neighbour''s with',
    (v->>'outletId')::uuid = c_roof
    and jsonb_typeof(v->'money') = 'array' and jsonb_array_length(v->'money') = 0
    and jsonb_array_length(v->'tender') = 0
    and (v->'covers'->>'total')::int = (select count(*) from public.restaurant_table_status
      where outlet_id = c_roof)
    and (v->'tickets'->>'today')::int = (select count(*) from public.orders
      where outlet_id = c_roof and business_date = (v->>'businessDate')::date)
    and (v->'kitchen'->>'openSlips')::int = 0);
end;
$$;

-- ---------------------------------------------------------------- 20.10 the quiet night
set role authenticated;
set app.user_id to '00000000-0000-4000-8000-000000000001';   -- ORG OWNER A

do $$
declare
  c_terrace uuid := 'a2000000-0000-4000-8000-0000000000b1';
  v         jsonb;
begin
  -- §12 governs writes. A paused restaurant cooks nothing, fires nothing and opens no bill, but a
  -- question about its night is not an act on its night: the door answers it in empty arrays
  -- instead of pretending the property has no day. 19.6g proved the other half, through send_kot.
  select public.restaurant_day_overview(c_terrace) into v;
  perform app.verify('20.10a a closed outlet is answered, not refused: money and tender are empty arrays, byStatus empty, the floor has no tables',
    (v->>'outletId')::uuid = c_terrace
    and (v->>'businessDate') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    and v->'money' = '[]'::jsonb
    and v->'tender' = '[]'::jsonb
    and v->'tickets'->'byStatus' = '{}'::jsonb
    and (v->'covers'->>'total')::int = 0
    and (v->'kitchen'->>'openSlips')::int = 0);

  -- The two tenses stay apart even with nothing else to say: 19.0's frozen terrace ticket is live
  -- and is not tonight's.
  perform app.verify('20.10b even on a closed outlet the two tenses differ: one ticket live, none booked tonight',
    (v->'tickets'->>'live')::int = 1
    and (v->'tickets'->>'today')::int = 0);
end;
$$;

-- ---------------------------------------------------------- 20.11 the surface, and the cut
reset role;
do $$
declare
  v_oid oid;
begin
  -- §13's turn, proven at fixed instants rather than at whatever clock this run happens to sit on:
  -- the trading day changes at the property's own business_day_start, so 03:59 belongs to the night
  -- before and 04:00 to the new day. 20.1b only means anything because this is true, and a screen
  -- that filtered on created_at::date would split one late service across two days.
  perform app.verify('20.11a the day turns at the property''s 04:00, not at midnight and not at the reader''s clock',
    app.rest_outlet_business_date('a2000000-0000-4000-8000-000000000001'::uuid,
      '2026-06-15 03:59:00+05:30'::timestamptz) = '2026-06-14'
    and app.rest_outlet_business_date('a2000000-0000-4000-8000-000000000001'::uuid,
      '2026-06-15 04:00:00+05:30'::timestamptz) = '2026-06-15');

  select p.oid into v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'restaurant_day_overview';

  perform app.verify('20.11b the day read is one door with one signature, DEFINER-bound with an empty search_path, executable by the two roles that serve the app',
    (select count(*) from pg_proc where oid = v_oid and pronargs = 1
      and proargtypes::text = (select oid::text from pg_type where typname = 'uuid')
      and prorettype = 'jsonb'::regtype) = 1
    and (select prosecdef from pg_proc where oid = v_oid)
    and (select proconfig && array['search_path=""', 'search_path='] from pg_proc where oid = v_oid)
    and has_function_privilege('authenticated', v_oid, 'execute')
    and has_function_privilege('service_role', v_oid, 'execute'));

  -- Measured, not assumed: Supabase's default privileges on the `public` schema hand every
  -- function — this one included — to `anon`, so 019's own grant loop is not what makes a
  -- key-free caller harmless. What refuses a stranger is the session gate at the top of the door,
  -- and it has to fire before the outlet is resolved. Run here as `anon` rather than through
  -- app.expect_denial, which is granted to `authenticated` only.
  perform app.verify('20.11c the door is reachable by the key-free role, so the session gate is the thing that refuses it',
    has_function_privilege('anon', v_oid, 'execute'));
end;
$$;

-- A caller with no session at all — the one wall between a key and a manager's whole night.
--
-- Two harness facts decide how this block is written, and both are stated because each one,
-- ignored, would make the probe pass for the wrong reason:
--
--   * `set role anon` changes CURRENT_USER only. `session_user` stays `postgres`, so 000's
--     `app.current_user_id()` override branch — which is gated on `session_user` NOT being one of
--     the roles a client can log in as — is still reachable here, and it reads the `app.user_id`
--     GUC this scenario's own earlier blocks set at SESSION scope. `reset role` does not clear a
--     GUC, so the GUC has to go explicitly; on the wire it never mattered, because PostgREST logs
--     in as `authenticator` and Scenario 7 proves a client session cannot reach that branch.
--   * the failure may not be raised inside the block that catches it. An EXCEPTION handler sees its
--     own block's raises, so "succeeded → raise" would come back here as a message that merely does
--     not contain NIVAAS_NO_SESSION, and the real collapse would be reported as the wrong one. The
--     probe is therefore its own sub-block and the verdict is decided after it.
do $$
declare
  v_read boolean := false;
  v_msg  text;
begin
  reset app.user_id;
  set role anon;
  begin
    perform public.restaurant_day_overview('a2000000-0000-4000-8000-000000000001'::uuid);
    v_read := true;
  exception when others then
    v_msg := sqlerrm;
  end;
  reset role;

  if v_read then
    raise exception 'VERIFY FAILED: 20.11d the key-free caller read a whole trading night — the session gate is not the first thing the door does';
  end if;
  if v_msg not like '%NIVAAS_NO_SESSION%' then
    raise exception 'VERIFY FAILED: 20.11d expected NIVAAS_NO_SESSION for the key-free caller but got %', v_msg;
  end if;
  raise notice 'PASS  20.11d a caller with no session is answered NIVAAS_NO_SESSION before the outlet even resolves, so the read cannot be used to enumerate a night it never bought (%', v_msg;
end;
$$;

-- -------------------------------------------------- 20.11e the night leaves no trace
--
-- This one runs LAST, after every read in the scenario — including the key-free probe above — because
-- that is what makes it mean anything: the day overview touched the audit ledger not once across all
-- of them. A door that changes nothing has no act to record, which is what separates it from the six
-- write doors verified earlier in this file.
do $$
begin
  perform app.verify('20.11e the day read wrote no audit row anywhere in this build, across every read above',
    not exists (select 1 from public.audit_log
      where action ilike '%overview%' or entity ilike '%overview%'));
end;
$$;

-- --------------------------------------------------------------- tidy up tests

drop function app.verify(text, boolean);
drop function app.expect_denial(text, text);

do $$
begin
  raise notice '';
  raise notice 'ALL SCENARIOS PASSED — tenant isolation verified against PostgreSQL %',
    (select split_part(version(), ' ', 2));
  raise notice 'NOT covered by this file: a behavioural run against the hosted AMRUT NIVAAS';
  raise notice 'Supabase project, which this harness deliberately never attacks (000-019 are';
  raise notice 'applied there and re-read structurally by db/harness/remote-apply.mjs check);';
  raise notice 'nor a delivered email — GoTrue still has no SMTP transport or real site_url';
  raise notice '(DECISIONS O-8). Scenarios 8 and 14 prove the accept path itself with a';
  raise notice 'seeded identity, so the door logic is not the unknown part.';
  raise notice 'NOT covered anywhere: §57-§59 client cache and state isolation. That was asserted';
  raise notice 'in a vitest suite the owner has since deleted; the behaviour stands on code review';
  raise notice 'and on these DB-side gates, not on a TypeScript test.';
end;
$$;
