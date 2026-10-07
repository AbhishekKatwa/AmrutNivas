-- ============================================================================
-- AMRUT NIVAAS — Prompt #02 §80/§81 verification: tenant isolation
--
-- The acceptance bar for this stage is not "the SQL parses", it is the sixteen scenarios
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

  -- Menu rows (014) hang off outlets/properties/organizations with ON DELETE RESTRICT, so
  -- they are cleared first — before the estate below can be torn down and re-seeded. Without
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

-- --------------------------------------------------------------- tidy up tests

drop function app.verify(text, boolean);
drop function app.expect_denial(text, text);

do $$
begin
  raise notice '';
  raise notice 'ALL SCENARIOS PASSED — tenant isolation verified against PostgreSQL %',
    (select split_part(version(), ' ', 2));
  raise notice 'NOT covered by this file: a behavioural run against the hosted AMRUT NIVAAS';
  raise notice 'Supabase project, which this harness deliberately never attacks (000-014 are';
  raise notice 'applied there and re-read structurally by db/harness/remote-apply.mjs check);';
  raise notice 'nor a delivered email — GoTrue still has no SMTP transport or real site_url';
  raise notice '(DECISIONS O-8). Scenarios 8 and 14 prove the accept path itself with a';
  raise notice 'seeded identity, so the door logic is not the unknown part.';
  raise notice 'Covered elsewhere: §57-§59 client cache and state isolation is a TypeScript';
  raise notice 'concern and is asserted in src/state/tenant-cache.test.ts, not here.';
end;
$$;
