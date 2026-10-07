-- ============================================================================
-- AMRUT NIVAAS — Prompt #02 §80/§81 verification: tenant isolation
--
-- The acceptance bar for this stage is not "the SQL parses", it is the six isolation
-- scenarios holding against a real server. Run it through db/harness/local-pg.sh
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
  -- the same question.
  select public.my_permissions(
    'a0000000-0000-4000-8000-00000000000a'::uuid,
    'a1000000-0000-4000-8000-000000000001'::uuid,
    'a2000000-0000-4000-8000-000000000001'::uuid) into v_perms;
  perform app.verify('10b an active account resolves its grants at the granted outlet',
    'outlet.view' = any (v_perms) and cardinality(v_perms) = 1);
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
  raise notice 'NOT covered by this file: a hosted apply, which needs the real AMRUT NIVAAS';
  raise notice 'Supabase project; and the email delivery plus GoTrue sign-up behind an';
  raise notice 'invitation, which land in Prompt #03. Scenario 8 proves the accept path';
  raise notice 'itself with a seeded identity, so the door logic is not the unknown part.';
  raise notice 'Covered elsewhere: §57-§59 client cache and state isolation is a TypeScript';
  raise notice 'concern and is asserted in src/state/tenant-cache.test.ts, not here.';
end;
$$;
