-- ============================================================================
-- AMRUT NIVAAS — Prompt #02, migration 007: demo estate + dev claim path
--
-- §60/§61: one clearly-identified demo organization with believable hospitality
-- data, never "Test Property 1" and never mixed into a customer's rows. Every row
-- here is reachable from `organizations.is_demo`, which the UI is required to label.
--
-- This seed writes the tables directly rather than through the 005 doors, because a
-- migration has no session: there is nobody to authorize. That is the only reason
-- it may, and the shape it writes is exactly what the doors would have produced —
-- including the denormalized `organization_id` the chain triggers insist on.
--
-- Why there are no membership rows here
-- -------------------------------------
-- §77 chose "seeded dev user" for this stage, which sounds like it wants a login
-- inserted. It cannot have one: `auth.users` belongs to GoTrue, and a profile row
-- without an authentication identity is a record nobody can sign in as (the donor
-- project learned this and had to write a provisioning script to fold the two
-- together). So the demo estate ships ownerless, and the first real session claims
-- it through public.claim_demo_organization() below. Ownership is then genuinely
-- ownership — a membership, an ORG_OWNER grant and full property breadth — created
-- by the same rules the doors use, and audited.
-- ============================================================================

do $$
declare
  v_org   uuid;
  v_hotel uuid;
  v_rest  uuid;
  v_roof  uuid;
  v_banq  uuid;
begin
  -- Idempotent by identity, not by row counting: the demo tenant's code is the mark.
  if exists (select 1 from public.organizations where code = 'DEMO') then
    return;
  end if;

  insert into public.organizations
    (name, legal_name, display_name, code, slug, business_types, status,
     country, currency, timezone, locale, tax_region, phone, email, website,
     is_demo, created_by)
  values
    ('Amrut Demo Hospitality', 'Amrut Demo Hospitality Pvt Ltd', 'Amrut Demo Hospitality',
     'DEMO', 'amrut-demo-hospitality',
     array['HOTEL','RESTAURANT']::text[], 'ACTIVE',
     'IN', 'INR', 'Asia/Kolkata', 'en-IN', 'IN-MH',
     '+91 20 4000 1100', 'front.desk@amrut-demo.example', null,
     true, null)
  returning id into v_org;

  insert into public.properties
    (organization_id, name, display_name, code, slug, property_type, status,
     address_line1, address_line2, city, state, postal_code, country,
     phone, email, timezone, currency, locale, business_day_start, created_by)
  values
    (v_org, 'Amrut Grand Hotel', 'Amrut Grand Hotel', 'DEMO-HOTEL-01', 'amrut-grand-hotel',
     'HOTEL', 'ACTIVE',
     'Survey 118, Lane 6', 'Koregaon Park', 'Pune', 'Maharashtra', '411001', 'IN',
     '+91 20 4000 1100', 'grand@amrut-demo.example',
     'Asia/Kolkata', 'INR', 'en-IN', '04:00'::time, null)
  returning id into v_hotel;

  -- §60's example outlets, with day parts a real property would publish. One insert
  -- per row: a multi-row INSERT ... RETURNING ... INTO a scalar is a cardinality
  -- gamble, and the codes are looked up by name right below anyway.
  insert into public.outlets
    (organization_id, property_id, name, code, slug, outlet_type, status,
     business_hours, phone, email, created_by)
  values
    (v_org, v_hotel, 'Main Restaurant', 'DEMO-OUT-01', 'main-restaurant', 'RESTAURANT', 'ACTIVE',
     jsonb_build_object('mon-sun', jsonb_build_object('open','07:00','close','23:00'),
                        'meal_parts', jsonb_build_array(
                          jsonb_build_object('name','Breakfast','from','07:00','to','11:00'),
                          jsonb_build_object('name','Lunch','from','12:30','to','15:00'),
                          jsonb_build_object('name','Dinner','from','19:00','to','23:00'))),
     '+91 20 4000 1120', null, null)
  returning id into v_rest;

  insert into public.outlets
    (organization_id, property_id, name, code, slug, outlet_type, status,
     business_hours, phone, email, created_by)
  values
    (v_org, v_hotel, 'Rooftop Restaurant', 'DEMO-OUT-02', 'rooftop-restaurant', 'RESTAURANT', 'ACTIVE',
     jsonb_build_object('mon-sun', jsonb_build_object('open','12:00','close','00:30')),
     null, null, null)
  returning id into v_roof;

  insert into public.outlets
    (organization_id, property_id, name, code, slug, outlet_type, status,
     business_hours, phone, email, created_by)
  values
    (v_org, v_hotel, 'Banquet', 'DEMO-OUT-03', 'banquet', 'BANQUET', 'ACTIVE',
     jsonb_build_object('by_event', true), null, 'banquets@amrut-demo.example', null)
  returning id into v_banq;

  -- §14 in practice: Front Office and Finance sit on the property, Kitchen and
  -- Service sit under an outlet. Forcing every department to an outlet would make
  -- the group's own accounts belong to the restaurant.
  insert into public.departments
    (organization_id, property_id, outlet_id, name, code, slug, status, created_by)
  values
    (v_org, v_hotel, null,       'Front Office',  'DEPT-FO',    'front-office',      'ACTIVE', null),
    (v_org, v_hotel, null,       'Housekeeping',  'DEPT-HK',    'housekeeping',      'ACTIVE', null),
    (v_org, v_hotel, null,       'Finance',       'DEPT-FIN',   'finance',           'ACTIVE', null),
    (v_org, v_hotel, v_rest,     'Kitchen',       'DEPT-KIT-01','main-restaurant-kitchen', 'ACTIVE', null),
    (v_org, v_hotel, v_rest,     'Service',       'DEPT-SVC-01','main-restaurant-service', 'ACTIVE', null),
    (v_org, v_hotel, v_roof,     'Kitchen',       'DEPT-KIT-02','rooftop-kitchen',   'ACTIVE', null),
    (v_org, v_hotel, v_roof,     'Service',       'DEPT-SVC-02','rooftop-service',   'ACTIVE', null),
    (v_org, v_hotel, v_banq,     'Banquet Operations', 'DEPT-BNQ', 'banquet-operations', 'ACTIVE', null);

  perform app.audit('organization_seeded', 'organization', v_org,
    p_organization := v_org, p_actor := null,
    p_metadata := jsonb_build_object('demo', true, 'source', '007_seed_demo_dev.sql'));
end;
$$;

-- §36/§78: accepting an invitation needs the invited person to already have an
-- account, so the token flow is exercised in Prompt #03 once real sign-up exists.
-- Until then this door is the only way a session obtains a tenant, and it is
-- deliberately single-use.

-- The demo estate is claimed, not assigned: the first session with no organization
-- becomes its owner. Anyone who already belongs to a tenant is refused, so a real
-- customer's account can never be pointed at demo rows by accident.
create or replace function public.claim_demo_organization()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.require_session();
  v_org   uuid;
  v_role  uuid;
  v_after jsonb;
begin
  perform app.require_valid(
    not exists (select 1 from public.organization_memberships m where m.user_id = v_actor),
    'NIVAAS_ALREADY_HAS_ORGANIZATION');

  select id into v_org from public.organizations where code = 'DEMO' and is_demo;
  perform app.require_valid(v_org is not null, 'NIVAAS_DEMO_ESTATE_MISSING');

  select id into v_role from public.roles where name = 'ORG_OWNER';

  insert into public.organization_memberships
    (user_id, organization_id, status, is_owner, joined_at)
  values (v_actor, v_org, 'ACTIVE', true, now())
  on conflict (user_id, organization_id) do update
    set status = 'ACTIVE', is_owner = true, joined_at = now();

  insert into public.membership_property_access (user_id, organization_id, mode)
  values (v_actor, v_org, 'ALL_PROPERTIES')
  on conflict do nothing;

  insert into public.user_roles (user_id, role_id, organization_id, granted_by)
  select v_actor, v_role, v_org, v_actor
   where not exists (select 1 from public.user_roles ur
                      where ur.user_id = v_actor and ur.role_id = v_role
                        and ur.organization_id = v_org and ur.revoked_at is null);

  update public.user_active_contexts set organization_id = v_org
   where user_id = v_actor;

  perform app.audit('member_accepted', 'organization', v_org,
    p_organization := v_org,
    p_after := jsonb_build_object('claimed_demo', true),
    p_reason := 'First session claimed the seeded demo estate.');

  select to_jsonb(o) into v_after from public.organizations o where o.id = v_org;
  return v_after;
end;
$$;

grant execute on function public.claim_demo_organization() to authenticated, service_role;
