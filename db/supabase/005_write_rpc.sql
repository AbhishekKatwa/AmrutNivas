-- ============================================================================
-- AMRUT NIVAAS — Prompt #02, migration 005: Server-side write doors
--
-- §25: "never rely only on `if (canEdit) show button`". §26: "do not accept
-- arbitrary organization/property IDs from the frontend and trust them".
--
-- So `authenticated` has no INSERT/UPDATE/DELETE on any table (003). Every
-- mutation in this product enters through one of these SECURITY DEFINER doors,
-- and every door does the same four things in the same order:
--
--   1. resolve the actor from the SESSION (never from an argument),
--   2. re-prove tenant membership + permission + access breadth for the ids
--      given, and DERIVE denormalized ancestors from the parent row rather than
--      from whatever the client sent,
--   3. refuse archived/suspended targets, so a closed site cannot gain history,
--   4. append an audit event with before/after (§48) in the same transaction.
--
-- Conventions used throughout:
--   * `p_* IS NULL` in an update door means "leave that column alone". Clearing a
--     column to NULL is not something this stage's fields need; when one does, it
--     gets an explicit boolean flag rather than this ambiguity.
--   * `p_expected_version` implements §82 optimistic locking when supplied; a
--     mismatch is a lost-update attempt, not a write to be repeated blindly.
--   * `p_reason` is mandatory wherever §48/§83 says a decision must be explained:
--     archives, access changes, membership removals.
--   * Errors are single-token messages (`NIVAAS_ACCESS_DENIED`) so the client
--     normalizer can map them without parsing sentences or leaking SQL.
--   * A door returns `jsonb` of the written row, so the caller can refresh state
--     without a second round-trip that could race the write.
--   * Client-facing doors are defined in `public`, every helper and guard in `app`.
--     Supabase's PostgREST serves RPCs from `public` only, so that split is what
--     makes the door list an enforceable API surface rather than a convention:
--     nothing in `app` is reachable from a browser at all.
-- ============================================================================

-- --------------------------------------------------------------- shared guards

-- There must be a session. In this stage the acting user is a seeded dev login
-- (D-12), but the doors already demand what a real session supplies, so Prompt
-- #03's auth landing changes nothing here.
create or replace function app.require_session()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  v_user := app.current_user_id();
  if v_user is null then
    raise exception 'NIVAAS_NO_SESSION';
  end if;
  return v_user;
end;
$$;

create or replace function app.require_permission(
  p_permission text,
  p_organization uuid,
  p_property uuid default null,
  p_outlet uuid default null
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.has_permission(app.current_user_id(), p_organization, p_permission, p_property, p_outlet) then
    raise exception 'NIVAAS_ACCESS_DENIED';
  end if;
end;
$$;

-- Rows may not be added to a tenant that is not trading (§73).
create or replace function app.require_active_organization(p_organization uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.organization_is_active(p_organization) then
    raise exception 'NIVAAS_ORGANIZATION_NOT_ACTIVE';
  end if;
end;
$$;

-- A site must be ACTIVE to receive anything; ARCHIVED/INACTIVE stay readable.
create or replace function app.require_writable_property(p_property uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.property_is_writable(p_property) then
    raise exception 'NIVAAS_PROPERTY_NOT_WRITABLE';
  end if;
end;
$$;

create or replace function app.require_writable_outlet(p_outlet uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.outlet_is_writable(p_outlet) then
    raise exception 'NIVAAS_OUTLET_NOT_WRITABLE';
  end if;
end;
$$;

-- §48/§83: a protected change without an explanation is refused, not guessed at.
create or replace function app.require_reason(p_reason text)
returns void
language plpgsql
immutable
as $$
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'NIVAAS_REASON_REQUIRED';
  end if;
end;
$$;

create or replace function app.require_valid(p_ok boolean, p_code text)
returns void
language plpgsql
immutable
as $$
begin
  if not coalesce(p_ok, false) then
    raise exception '%', p_code;
  end if;
end;
$$;

-- Uniqueness is pre-checked in the door so the caller receives a domain code
-- ("this property code is already used") instead of a constraint name.
create or replace function app.require_unique(p_duplicated boolean, p_code text)
returns void
language plpgsql
immutable
as $$
begin
  if coalesce(p_duplicated, false) then
    raise exception '%', p_code;
  end if;
end;
$$;

-- §82: optimistic concurrency, enforced only when the caller states a version.
create or replace function app.require_version(p_actual integer, p_expected integer)
returns void
language plpgsql
immutable
as $$
begin
  if p_expected is not null and p_actual is distinct from p_expected then
    raise exception 'NIVAAS_VERSION_CONFLICT';
  end if;
end;
$$;

-- An update door has to tell "this field was not edited" apart from "the operator
-- emptied it". A null parameter means not edited — that is what lets every door take
-- optional arguments — so `coalesce` alone could never blank a column, and an admin
-- form that cleared a phone number would silently keep the old one. An empty (or
-- whitespace-only) string is the stated intent to clear.
create or replace function app.blankable(p_current text, p_proposed text)
returns text
language sql
immutable
as $$
  select case
    when p_proposed is null      then p_current
    when btrim(p_proposed) = ''  then null
    else p_proposed
  end;
$$;

-- One place that knows what a valid shape looks like, so every create door asks the
-- same questions and a client cannot pass a check the other one forgot.
create or replace function app.require_valid_common(
  p_name text, p_code text, p_slug text, p_country text, p_currency text, p_timezone text, p_locale text
)
returns void
language plpgsql
immutable
as $$
begin
  perform app.require_valid(p_name ~ '^.{2,120}$', 'NIVAAS_INVALID_NAME');
  perform app.require_valid(app.is_valid_slug(p_slug), 'NIVAAS_INVALID_SLUG');
  perform app.require_valid(p_country ~ '^[A-Z]{2}$', 'NIVAAS_INVALID_COUNTRY');
  perform app.require_valid(app.is_valid_currency(p_currency), 'NIVAAS_INVALID_CURRENCY');
  perform app.require_valid(app.is_valid_timezone(p_timezone), 'NIVAAS_INVALID_TIMEZONE');
  perform app.require_valid(p_locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$', 'NIVAAS_INVALID_LOCALE');
end;
$$;

-- ---------------------------------------------------------------- organizations

-- §31/§75: onboarding step 1. The organization and the creator's OWNER standing are
-- one transaction, because a tenant with no owner is an orphan nothing can ever
-- administer.
create or replace function public.create_organization(
  p_name text,
  p_code text,
  p_slug text,
  p_country text,
  p_currency text,
  p_timezone text,
  p_locale text,
  p_business_types text[] default '{}',
  p_legal_name text default null,
  p_tax_region text default null,
  p_phone text default null,
  p_email text default null,
  p_is_demo boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.require_session();
  v_org   uuid;
  v_role  uuid;
  v_grant uuid;
  v_after jsonb;
begin
  perform app.require_valid(p_code ~ '^[A-Z0-9][A-Z0-9-]{1,11}$', 'NIVAAS_INVALID_CODE');
  perform app.require_valid_common(p_name, p_code, p_slug, p_country, p_currency, p_timezone, p_locale);

  perform app.require_unique(
    exists (select 1 from public.organizations o where o.code = p_code or o.slug = p_slug),
    'NIVAAS_ORGANIZATION_TAKEN');

  insert into public.organizations
    (name, legal_name, display_name, code, slug, business_types, country, currency,
     timezone, locale, tax_region, phone, email, is_demo, created_by)
  values
    (p_name, p_legal_name, p_name, p_code, p_slug, p_business_types, p_country, p_currency,
     p_timezone, p_locale, p_tax_region, p_phone, p_email, p_is_demo, v_actor)
  returning id into v_org;

  select id into v_role from public.roles where name = 'ORG_OWNER';
  perform app.require_valid(v_role is not null, 'NIVAAS_SEED_MISSING');

  -- §18: ownership is data, not a hardcoded user id, and the 002 partial unique
  -- index makes "exactly one owner" a database fact.
  insert into public.organization_memberships
    (user_id, organization_id, status, is_owner, joined_at)
  values (v_actor, v_org, 'ACTIVE', true, now());

  -- The owner reaches every site they will ever create (§19).
  insert into public.membership_property_access (user_id, organization_id, mode)
  values (v_actor, v_org, 'ALL_PROPERTIES');

  insert into public.user_roles (user_id, role_id, organization_id, granted_by)
  values (v_actor, v_role, v_org, v_actor)
  returning id into v_grant;

  insert into public.user_active_contexts (user_id, organization_id)
  values (v_actor, v_org)
  on conflict (user_id) do update
    set organization_id = excluded.organization_id, property_id = null, outlet_id = null;

  select to_jsonb(o) into v_after from public.organizations o where o.id = v_org;
  perform app.audit('organization_created', 'organization', v_org,
    p_organization := v_org, p_after := v_after);
  perform app.audit('role_assigned', 'user_role', v_grant,
    p_organization := v_org,
    p_after := jsonb_build_object('role', 'ORG_OWNER'));

  return v_after;
end;
$$;

-- §40 update. `organization.edit` is the group-level capability, so a property
-- manager cannot rename the tenant (§24).
create or replace function public.update_organization(
  p_organization uuid,
  p_name text default null,
  p_legal_name text default null,
  p_display_name text default null,
  p_country text default null,
  p_currency text default null,
  p_timezone text default null,
  p_locale text default null,
  p_tax_region text default null,
  p_phone text default null,
  p_email text default null,
  p_website text default null,
  p_logo_url text default null,
  p_business_types text[] default null,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after  jsonb;
begin
  perform app.require_session();
  perform app.require_permission('organization.edit', p_organization);

  select to_jsonb(o) into v_before from public.organizations o where o.id = p_organization;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');
  perform app.require_valid(v_before->>'status' <> 'ARCHIVED', 'NIVAAS_ORGANIZATION_ARCHIVED');
  perform app.require_version((v_before->>'version')::integer, p_expected_version);
  if p_country is not null or p_currency is not null or p_timezone is not null or p_locale is not null then
    perform app.require_valid_common(
      coalesce(p_name, v_before->>'name'), v_before->>'code', v_before->>'slug',
      coalesce(p_country, v_before->>'country'), coalesce(p_currency, v_before->>'currency'),
      coalesce(p_timezone, v_before->>'timezone'), coalesce(p_locale, v_before->>'locale'));
  end if;

  -- A group-level currency or timezone change retroactively rewrites nothing: each
  -- property keeps its own values, which is exactly why both levels carry them.
  update public.organizations set
    name           = coalesce(p_name, name),
    legal_name     = app.blankable(legal_name, p_legal_name),
    display_name   = app.blankable(display_name, p_display_name),
    country        = coalesce(p_country, country),
    currency       = coalesce(p_currency, currency),
    timezone       = coalesce(p_timezone, timezone),
    locale         = coalesce(p_locale, locale),
    tax_region     = app.blankable(tax_region, p_tax_region),
    phone          = app.blankable(phone, p_phone),
    email          = app.blankable(email, p_email),
    website        = app.blankable(website, p_website),
    logo_url       = app.blankable(logo_url, p_logo_url),
    business_types = coalesce(p_business_types, business_types),
    version        = version + 1
  where id = p_organization;
  select to_jsonb(cur) into v_after from public.organizations cur where cur.id = p_organization;

  perform app.audit('organization_updated', 'organization', p_organization,
    p_organization := p_organization, p_before := v_before, p_after := v_after);
  return v_after;
end;
$$;

-- §40/§41/§73: suspend, archive and restore are status transitions, never deletes.
create or replace function public.set_organization_status(
  p_organization uuid,
  p_status text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after  jsonb;
  v_actor  uuid := app.require_session();
begin
  perform app.require_reason(p_reason);
  perform app.require_valid(p_status in ('ACTIVE','SUSPENDED','ARCHIVED'), 'NIVAAS_INVALID_STATUS');

  select to_jsonb(o) into v_before from public.organizations o where o.id = p_organization;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');

  perform app.require_permission('organization.archive', p_organization);
  -- Only the owner may retire a tenant (§18). A permission alone would be the wrong
  -- tool: an admin who could archive a group could delete a business.
  perform app.require_valid(
    exists (select 1 from public.organization_memberships m
             where m.organization_id = p_organization and m.user_id = v_actor
               and m.is_owner and m.status = 'ACTIVE')
      or app.is_platform_admin(v_actor),
    'NIVAAS_OWNER_ONLY');

  update public.organizations set
    status      = p_status,
    archived_at = case when p_status = 'ARCHIVED' then now() end,
    version     = version + 1
  where id = p_organization;
  select to_jsonb(cur) into v_after from public.organizations cur where cur.id = p_organization;

  perform app.audit(
    case p_status
      when 'ARCHIVED'  then 'organization_archived'
      when 'SUSPENDED' then 'organization_suspended'
      else                  'organization_restored'
    end,
    'organization', p_organization,
    p_organization := p_organization, p_before := v_before, p_after := v_after,
    p_reason := p_reason);
  return v_after;
end;
$$;

-- ------------------------------------------------------------------- properties

-- §33/§76: the group's country/currency/locale/timezone are DEFAULTS the client may
-- send, validated here — never values baked into the schema (§11/§69).
create or replace function public.create_property(
  p_organization uuid,
  p_name text,
  p_code text,
  p_slug text,
  p_property_type text,
  p_country text,
  p_currency text,
  p_timezone text,
  p_locale text,
  p_business_day_start time default '04:00',
  p_address_line1 text default null,
  p_address_line2 text default null,
  p_city text default null,
  p_state text default null,
  p_postal_code text default null,
  p_phone text default null,
  p_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.require_session();
  v_id    uuid;
  v_after jsonb;
begin
  perform app.require_permission('property.create', p_organization);
  perform app.require_active_organization(p_organization);

  perform app.require_valid(p_code ~ '^[A-Z0-9][A-Z0-9-]{1,19}$', 'NIVAAS_INVALID_CODE');
  perform app.require_valid_common(p_name, p_code, p_slug, p_country, p_currency, p_timezone, p_locale);
  perform app.require_valid(
    p_property_type in ('HOTEL','LODGE','RESORT','HOSTEL','RESTAURANT','CAFE','CLOUD_KITCHEN',
                        'BANQUET','CONVENTION_CENTER','RESTAURANT_HOTEL','OTHER'),
    'NIVAAS_INVALID_PROPERTY_TYPE');

  perform app.require_unique(
    exists (select 1 from public.properties pr
             where pr.organization_id = p_organization and (pr.code = p_code or pr.slug = p_slug)),
    'NIVAAS_PROPERTY_TAKEN');

  insert into public.properties
    (organization_id, name, display_name, code, slug, property_type, country, currency,
     timezone, locale, business_day_start, address_line1, address_line2, city, state,
     postal_code, phone, email, created_by)
  values
    (p_organization, p_name, p_name, p_code, p_slug, p_property_type, p_country, p_currency,
     p_timezone, p_locale, p_business_day_start, p_address_line1, p_address_line2, p_city,
     p_state, p_postal_code, p_phone, p_email, v_actor)
  returning id into v_id;

  select to_jsonb(pr) into v_after from public.properties pr where pr.id = v_id;
  perform app.audit('property_created', 'property', v_id,
    p_organization := p_organization, p_property := v_id, p_after := v_after);
  return v_after;
end;
$$;

create or replace function public.update_property(
  p_property uuid,
  p_name text default null,
  p_display_name text default null,
  p_country text default null,
  p_currency text default null,
  p_timezone text default null,
  p_locale text default null,
  p_business_day_start time default null,
  p_address_line1 text default null,
  p_address_line2 text default null,
  p_city text default null,
  p_state text default null,
  p_postal_code text default null,
  p_phone text default null,
  p_email text default null,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after  jsonb;
  v_org    uuid;
begin
  perform app.require_session();

  select to_jsonb(pr) into v_before from public.properties pr where pr.id = p_property;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');
  -- The tenant predicate is read from the row, never supplied by the caller (§26).
  v_org := (v_before->>'organization_id')::uuid;
  perform app.require_permission('property.edit', v_org, p_property);
  perform app.require_writable_property(p_property);
  perform app.require_version((v_before->>'version')::integer, p_expected_version);

  -- code/slug are immutable once issued: they appear in document numbers and URLs
  -- (§11/§44), so editing one would silently rewrite the meaning of past records.
  update public.properties set
    name               = coalesce(p_name, name),
    display_name       = app.blankable(display_name, p_display_name),
    country            = coalesce(p_country, country),
    currency           = coalesce(p_currency, currency),
    timezone           = coalesce(p_timezone, timezone),
    locale             = coalesce(p_locale, locale),
    business_day_start = coalesce(p_business_day_start, business_day_start),
    address_line1      = app.blankable(address_line1, p_address_line1),
    address_line2      = app.blankable(address_line2, p_address_line2),
    city               = app.blankable(city, p_city),
    state              = app.blankable(state, p_state),
    postal_code        = app.blankable(postal_code, p_postal_code),
    phone              = app.blankable(phone, p_phone),
    email              = app.blankable(email, p_email),
    version            = version + 1
  where id = p_property;
  select to_jsonb(cur) into v_after from public.properties cur where cur.id = p_property;

  perform app.audit('property_updated', 'property', p_property,
    p_organization := v_org, p_property := p_property,
    p_before := v_before, p_after := v_after);
  return v_after;
end;
$$;

create or replace function public.set_property_status(
  p_property uuid,
  p_status text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after  jsonb;
  v_org    uuid;
begin
  perform app.require_session();
  perform app.require_reason(p_reason);
  perform app.require_valid(p_status in ('ACTIVE','INACTIVE','ARCHIVED'), 'NIVAAS_INVALID_STATUS');

  select to_jsonb(pr) into v_before from public.properties pr where pr.id = p_property;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');
  v_org := (v_before->>'organization_id')::uuid;
  perform app.require_permission('property.archive', v_org, p_property);
  -- Re-activating a site needs the tenant itself to be trading.
  if p_status = 'ACTIVE' then
    perform app.require_active_organization(v_org);
  end if;

  update public.properties set
    status      = p_status,
    archived_at = case when p_status = 'ARCHIVED' then now() end,
    version     = version + 1
  where id = p_property;
  select to_jsonb(cur) into v_after from public.properties cur where cur.id = p_property;

  perform app.audit(
    case p_status
      when 'ARCHIVED'  then 'property_archived'
      when 'INACTIVE'  then 'property_deactivated'
      else                  'property_reactivated'
    end,
    'property', p_property,
    p_organization := v_org, p_property := p_property,
    p_before := v_before, p_after := v_after, p_reason := p_reason);
  return v_after;
end;
$$;

-- ---------------------------------------------------------------------- outlets

-- §12/§15: organization_id is derived from the property, and the door never accepts
-- it — which is what makes "an outlet belonging to another organization's property"
-- impossible rather than merely discouraged.
create or replace function public.create_outlet(
  p_property uuid,
  p_name text,
  p_code text,
  p_slug text,
  p_outlet_type text,
  p_business_hours jsonb default '{}'::jsonb,
  p_phone text default null,
  p_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.require_session();
  v_org   uuid;
  v_id    uuid;
  v_after jsonb;
begin
  select organization_id into v_org from public.properties where id = p_property;
  perform app.require_valid(v_org is not null, 'NIVAAS_NOT_FOUND');
  perform app.require_permission('outlet.create', v_org, p_property);
  perform app.require_writable_property(p_property);

  perform app.require_valid(p_code ~ '^[A-Z0-9][A-Z0-9-]{1,19}$', 'NIVAAS_INVALID_CODE');
  perform app.require_valid(p_name ~ '^.{2,120}$', 'NIVAAS_INVALID_NAME');
  perform app.require_valid(app.is_valid_slug(p_slug), 'NIVAAS_INVALID_SLUG');
  perform app.require_valid(
    p_outlet_type in ('RESTAURANT','CAFE','BAR','ROOM_SERVICE','BANQUET','SPA','RETAIL',
                      'CLOUD_KITCHEN','OTHER'),
    'NIVAAS_INVALID_OUTLET_TYPE');

  perform app.require_unique(
    exists (select 1 from public.outlets o
             where o.property_id = p_property and (o.code = p_code or o.slug = p_slug)),
    'NIVAAS_OUTLET_TAKEN');

  insert into public.outlets
    (organization_id, property_id, name, code, slug, outlet_type, business_hours,
     phone, email, created_by)
  values
    (v_org, p_property, p_name, p_code, p_slug, p_outlet_type, p_business_hours,
     p_phone, p_email, v_actor)
  returning id into v_id;

  select to_jsonb(o) into v_after from public.outlets o where o.id = v_id;
  perform app.audit('outlet_created', 'outlet', v_id,
    p_organization := v_org, p_property := p_property, p_outlet := v_id, p_after := v_after);
  return v_after;
end;
$$;

create or replace function public.update_outlet(
  p_outlet uuid,
  p_name text default null,
  p_business_hours jsonb default null,
  p_phone text default null,
  p_email text default null,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after  jsonb;
  v_org    uuid;
  v_prop   uuid;
begin
  perform app.require_session();

  select to_jsonb(o) into v_before from public.outlets o where o.id = p_outlet;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');
  v_org  := (v_before->>'organization_id')::uuid;
  v_prop := (v_before->>'property_id')::uuid;
  perform app.require_permission('outlet.edit', v_org, v_prop, p_outlet);
  perform app.require_writable_outlet(p_outlet);
  perform app.require_version((v_before->>'version')::integer, p_expected_version);

  update public.outlets set
    name           = coalesce(p_name, name),
    business_hours = coalesce(p_business_hours, business_hours),
    phone          = app.blankable(phone, p_phone),
    email          = app.blankable(email, p_email),
    version        = version + 1
  where id = p_outlet;
  select to_jsonb(cur) into v_after from public.outlets cur where cur.id = p_outlet;

  perform app.audit('outlet_updated', 'outlet', p_outlet,
    p_organization := v_org, p_property := v_prop, p_outlet := p_outlet,
    p_before := v_before, p_after := v_after);
  return v_after;
end;
$$;

create or replace function public.set_outlet_status(
  p_outlet uuid,
  p_status text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after  jsonb;
  v_org    uuid;
  v_prop   uuid;
begin
  perform app.require_session();
  perform app.require_reason(p_reason);
  perform app.require_valid(p_status in ('ACTIVE','INACTIVE','ARCHIVED'), 'NIVAAS_INVALID_STATUS');

  select to_jsonb(o) into v_before from public.outlets o where o.id = p_outlet;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');
  v_org  := (v_before->>'organization_id')::uuid;
  v_prop := (v_before->>'property_id')::uuid;
  perform app.require_permission('outlet.archive', v_org, v_prop, p_outlet);

  update public.outlets set
    status      = p_status,
    archived_at = case when p_status = 'ARCHIVED' then now() end,
    version     = version + 1
  where id = p_outlet;
  select to_jsonb(cur) into v_after from public.outlets cur where cur.id = p_outlet;

  perform app.audit(
    case p_status
      when 'ARCHIVED'  then 'outlet_archived'
      when 'INACTIVE'  then 'outlet_deactivated'
      else                  'outlet_reactivated'
    end,
    'outlet', p_outlet,
    p_organization := v_org, p_property := v_prop, p_outlet := p_outlet,
    p_before := v_before, p_after := v_after, p_reason := p_reason);
  return v_after;
end;
$$;

-- ------------------------------------------------------------------ departments

-- §14: outlet_id is optional. Kitchen under an outlet, Finance under a property.
create or replace function public.create_department(
  p_property uuid,
  p_name text,
  p_code text,
  p_slug text,
  p_outlet uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.require_session();
  v_org   uuid;
  v_id    uuid;
  v_after jsonb;
begin
  select organization_id into v_org from public.properties where id = p_property;
  perform app.require_valid(v_org is not null, 'NIVAAS_NOT_FOUND');

  -- §15 invalid case: an outlet from another property is refused here, because the
  -- client is not a trustworthy source of parentage.
  if p_outlet is not null then
    perform app.require_valid(
      exists (select 1 from public.outlets o where o.id = p_outlet and o.property_id = p_property),
      'NIVAAS_OUTLET_NOT_IN_PROPERTY');
  end if;

  -- A property-level department needs property reach; an outlet-level one needs
  -- that outlet's reach (§20).
  perform app.require_permission('department.create', v_org, p_property, p_outlet);
  perform app.require_writable_property(p_property);

  perform app.require_valid(p_code ~ '^[A-Z0-9][A-Z0-9-]{1,19}$', 'NIVAAS_INVALID_CODE');
  perform app.require_valid(p_name ~ '^.{2,120}$', 'NIVAAS_INVALID_NAME');
  perform app.require_valid(app.is_valid_slug(p_slug), 'NIVAAS_INVALID_SLUG');

  perform app.require_unique(
    exists (select 1 from public.departments d
             where d.property_id = p_property and (d.code = p_code or d.slug = p_slug)),
    'NIVAAS_DEPARTMENT_TAKEN');

  insert into public.departments
    (organization_id, property_id, outlet_id, name, code, slug, created_by)
  values (v_org, p_property, p_outlet, p_name, p_code, p_slug, v_actor)
  returning id into v_id;

  select to_jsonb(d) into v_after from public.departments d where d.id = v_id;
  perform app.audit('department_created', 'department', v_id,
    p_organization := v_org, p_property := p_property, p_outlet := p_outlet,
    p_after := v_after);
  return v_after;
end;
$$;

create or replace function public.update_department(
  p_department uuid,
  p_name text default null,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after  jsonb;
  v_org    uuid;
  v_prop   uuid;
begin
  perform app.require_session();

  select to_jsonb(d) into v_before from public.departments d where d.id = p_department;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');
  v_org  := (v_before->>'organization_id')::uuid;
  v_prop := (v_before->>'property_id')::uuid;
  perform app.require_permission('department.edit', v_org, v_prop);
  perform app.require_version((v_before->>'version')::integer, p_expected_version);

  -- A department's parent is not editable from this door: moving a cost centre
  -- between outlets would restate which outlet's reports its people appear in.
  update public.departments set
    name    = coalesce(p_name, name),
    version = version + 1
  where id = p_department;
  select to_jsonb(cur) into v_after from public.departments cur where cur.id = p_department;

  perform app.audit('department_updated', 'department', p_department,
    p_organization := v_org, p_property := v_prop, p_before := v_before, p_after := v_after);
  return v_after;
end;
$$;

create or replace function public.set_department_status(
  p_department uuid,
  p_status text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after  jsonb;
  v_org    uuid;
  v_prop   uuid;
begin
  perform app.require_session();
  perform app.require_reason(p_reason);
  perform app.require_valid(p_status in ('ACTIVE','INACTIVE','ARCHIVED'), 'NIVAAS_INVALID_STATUS');

  select to_jsonb(d) into v_before from public.departments d where d.id = p_department;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');
  v_org  := (v_before->>'organization_id')::uuid;
  v_prop := (v_before->>'property_id')::uuid;
  -- Retiring a cost centre is its own capability, not a side effect of renaming it:
  -- the three levels above all separate `*.edit` from `*.archive`, and a manager who
  -- can edit a department must not be able to make it disappear from reporting.
  perform app.require_permission('department.archive', v_org, v_prop);

  update public.departments set status = p_status, version = version + 1
  where id = p_department;
  select to_jsonb(cur) into v_after from public.departments cur where cur.id = p_department;

  perform app.audit(
    case p_status
      when 'ARCHIVED'  then 'department_archived'
      when 'INACTIVE'  then 'department_deactivated'
      else                  'department_reactivated'
    end,
    'department', p_department,
    p_organization := v_org, p_property := v_prop,
    p_before := v_before, p_after := v_after, p_reason := p_reason);
  return v_after;
end;
$$;

-- ------------------------------------------------------------------ invitations

-- §35/§36/§75: an invitation is a pending grant, not an account. The raw token is
-- returned once and only its SHA-256 is stored, so a leaked table dump cannot be
-- walked into working accept links.
create or replace function public.invite_member(
  p_organization uuid,
  p_email text,
  p_role text,
  p_full_name text default null,
  p_phone text default null,
  p_property_ids uuid[] default '{}',
  p_outlet_ids uuid[] default '{}',
  p_valid_days integer default 14
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.require_session();
  v_role  record;
  v_inv   uuid;
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash  text;
begin
  perform app.require_permission('user.invite', p_organization);
  perform app.require_active_organization(p_organization);

  select * into v_role from public.roles
   where name = upper(p_role) and status = 'ACTIVE'
     and (is_system or organization_id = p_organization);
  perform app.require_valid(v_role.id is not null, 'NIVAAS_ROLE_NOT_FOUND');

  perform app.require_valid(p_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$',
    'NIVAAS_INVALID_EMAIL');
  perform app.require_valid(p_valid_days between 1 and 90, 'NIVAAS_INVALID_EXPIRY');

  -- The scope offered cannot name another tenant's sites (§15), and an outlet-scoped
  -- role must actually be told which outlet.
  perform app.require_valid(
    not exists (select 1 from unnest(p_property_ids) pid
                 where not exists (select 1 from public.properties pr
                                    where pr.id = pid and pr.organization_id = p_organization)),
    'NIVAAS_SCOPE_MISMATCH');
  perform app.require_valid(
    not exists (select 1 from unnest(p_outlet_ids) oid
                 where not exists (select 1 from public.outlets o
                                    where o.id = oid and o.organization_id = p_organization)),
    'NIVAAS_SCOPE_MISMATCH');
  if v_role.scope_level = 'PROPERTY' then
    perform app.require_valid(p_property_ids <> '{}'::uuid[], 'NIVAAS_EMPTY_SELECTION');
  end if;
  if v_role.scope_level = 'OUTLET' then
    perform app.require_valid(p_outlet_ids <> '{}'::uuid[], 'NIVAAS_EMPTY_SELECTION');
  end if;

  perform app.require_unique(
    exists (select 1 from public.invitations i
             where i.organization_id = p_organization and i.email = p_email
               and i.status = 'INVITED'),
    'NIVAAS_ALREADY_INVITED');

  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  insert into public.invitations
    (organization_id, email, phone, full_name, role_id, property_ids, outlet_ids,
     token_hash, invited_by, expires_at)
  values
    (p_organization, p_email, p_phone, p_full_name, v_role.id, p_property_ids, p_outlet_ids,
     v_hash, v_actor, now() + make_interval(days => p_valid_days))
  returning id into v_inv;

  perform app.audit('member_invited', 'invitation', v_inv,
    p_organization := p_organization,
    p_after := jsonb_build_object('email', p_email, 'role', v_role.name,
                                  'properties', to_jsonb(p_property_ids),
                                  'outlets', to_jsonb(p_outlet_ids)));

  -- The token leaves once, in this response, and exists nowhere else.
  return jsonb_build_object('invitationId', v_inv, 'token', v_token,
                            'role', v_role.name, 'scope', v_role.scope_level,
                            'expiresAt', (select i.expires_at from public.invitations i where i.id = v_inv));
end;
$$;

-- §78: an existing, verified person presents the token. The door proves the token,
-- the expiry, and that the session's own address is the invited address — so an
-- accept link cannot grant anyone but its recipient.
create or replace function public.accept_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := app.require_session();
  v_email  text;
  v_inv    record;
  v_scope  text;
  v_grant  uuid;
  v_grants uuid[];
begin
  select * into v_inv from public.invitations
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  perform app.require_valid(v_inv.id is not null, 'NIVAAS_INVITATION_NOT_FOUND');
  perform app.require_valid(v_inv.status = 'INVITED', 'NIVAAS_INVITATION_NOT_USABLE');
  if v_inv.expires_at < now() then
    update public.invitations set status = 'EXPIRED' where id = v_inv.id;
    raise exception 'NIVAAS_INVITATION_EXPIRED';
  end if;

  -- The invitation is for an address, and this session must own that address.
  select email into v_email from public.profiles where id = v_actor;
  perform app.require_valid(v_email is not null and lower(v_email) = lower(v_inv.email::text),
    'NIVAAS_EMAIL_MISMATCH');

  insert into public.organization_memberships
    (user_id, organization_id, status, joined_at)
  values (v_actor, v_inv.organization_id, 'ACTIVE', now())
  on conflict (user_id, organization_id) do update
    set status = 'ACTIVE', joined_at = now(), suspended_at = null, removed_at = null;

  select scope_level into v_scope from public.roles where id = v_inv.role_id;

  -- Breadth first: the outlet-access trigger refuses an outlet whose property the
  -- user cannot reach, so the property rows have to exist before it runs.
  if v_inv.property_ids <> '{}'::uuid[] then
    insert into public.membership_property_access (user_id, organization_id, property_id, mode)
    select v_actor, v_inv.organization_id, pid, 'SELECTED_PROPERTIES'
      from unnest(v_inv.property_ids) pid
    on conflict do nothing;
  elsif v_scope in ('ORGANIZATION','GLOBAL') then
    -- A tenant-wide role implies the whole estate, including sites created later.
    insert into public.membership_property_access (user_id, organization_id, mode)
    values (v_actor, v_inv.organization_id, 'ALL_PROPERTIES')
    on conflict do nothing;
  end if;

  if v_inv.outlet_ids <> '{}'::uuid[] then
    insert into public.membership_outlet_access
      (user_id, organization_id, property_id, outlet_id, mode)
    select v_actor, v_inv.organization_id, o.property_id, o.id, 'SELECTED_OUTLETS'
      from public.outlets o where o.id = any (v_inv.outlet_ids)
    on conflict do nothing;
  elsif v_scope = 'OUTLET' and v_inv.property_ids <> '{}'::uuid[] then
    insert into public.membership_outlet_access (user_id, organization_id, property_id, mode)
    select v_actor, v_inv.organization_id, pid, 'ALL_OUTLETS'
      from unnest(v_inv.property_ids) pid
    on conflict do nothing;
  end if;

  -- One grant per scope target. An earlier draft stored only `(property_ids)[1]`, so a
  -- person invited as a manager of three sites could administratively reach all three
  -- but held the role in one of them — the widest-applicable-grant rule would then
  -- answer "no permission" for the other two. A tenant-wide role has one grant and no
  -- target, which is its own shape (see the 002 grant trigger).
  with targets as (
    select null::uuid as property_id, null::uuid as outlet_id
      where v_scope in ('ORGANIZATION', 'GLOBAL')
    union all
    select case when v_scope = 'OUTLET' then null else t.tid end,
           case when v_scope = 'OUTLET' then t.tid else null end
      from unnest(
        case when v_scope = 'OUTLET' then v_inv.outlet_ids else v_inv.property_ids end
      ) as t(tid)
     where v_scope in ('PROPERTY', 'OUTLET')
  ), grants as (
    insert into public.user_roles
      (user_id, role_id, organization_id, property_id, outlet_id, granted_by)
    select v_actor, v_inv.role_id, v_inv.organization_id,
           targets.property_id, targets.outlet_id, v_inv.invited_by
      from targets
    returning id
  )
  select coalesce(array_agg(id), '{}'::uuid[]) into v_grants from grants;

  update public.invitations
     set status = 'ACCEPTED', accepted_at = now(), accepted_by = v_actor
   where id = v_inv.id;

  perform app.audit('member_accepted', 'invitation', v_inv.id,
    p_organization := v_inv.organization_id,
    p_after := jsonb_build_object('role', v_inv.role_id, 'scope', v_scope));

  -- One history row per grant, so a later "how did they get this?" has an answer.
  foreach v_grant in array v_grants loop
    perform app.audit('role_assigned', 'user_role', v_grant,
      p_organization := v_inv.organization_id,
      p_metadata := jsonb_build_object('via_invitation', v_inv.id));
  end loop;

  return jsonb_build_object('organizationId', v_inv.organization_id,
                            'role', (select name from public.roles where id = v_inv.role_id),
                            'scope', v_scope);
end;
$$;

create or replace function public.cancel_invitation(p_invitation uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_org    uuid;
begin
  perform app.require_session();
  perform app.require_reason(p_reason);

  select to_jsonb(i) into v_before from public.invitations i where i.id = p_invitation;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');
  v_org := (v_before->>'organization_id')::uuid;
  perform app.require_permission('user.invite', v_org);
  perform app.require_valid(v_before->>'status' = 'INVITED', 'NIVAAS_INVITATION_NOT_USABLE');

  update public.invitations set status = 'CANCELLED' where id = p_invitation;

  perform app.audit('member_invitation_cancelled', 'invitation', p_invitation,
    p_organization := v_org, p_before := v_before,
    p_after := jsonb_build_object('status', 'CANCELLED'), p_reason := p_reason);
  return jsonb_build_object('invitationId', p_invitation, 'status', 'CANCELLED');
end;
$$;

-- -------------------------------------------------------------------- membership

-- §17/§74: suspend and remove are status transitions. The row survives as history,
-- and the person's login is untouched — a membership is not an account (§12 of #01).
create or replace function public.set_member_status(
  p_membership uuid,
  p_status text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor      uuid := app.require_session();
  v_before     jsonb;
  v_org        uuid;
  v_user       uuid;
  v_permission text;
begin
  perform app.require_reason(p_reason);
  perform app.require_valid(p_status in ('ACTIVE','SUSPENDED','REMOVED'), 'NIVAAS_INVALID_STATUS');

  select to_jsonb(m) into v_before from public.organization_memberships m where m.id = p_membership;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');
  v_org  := (v_before->>'organization_id')::uuid;
  v_user := (v_before->>'user_id')::uuid;

  v_permission := case p_status when 'SUSPENDED' then 'user.suspend' else 'user.remove' end;
  perform app.require_permission(v_permission, v_org);

  -- Retiring yourself is almost always a mistake, and dropping an owner is never
  -- allowed until ownership has moved (§18).
  perform app.require_valid(v_user <> v_actor, 'NIVAAS_SELF_NOT_ALLOWED');
  if p_status = 'REMOVED' then
    perform app.require_valid(not (v_before->>'is_owner')::boolean, 'NIVAAS_OWNER_MUST_TRANSFER');
  end if;
  -- Nobody may retire someone more senior than themselves: acting on an owner row
  -- requires being the owner (or the platform).
  if (v_before->>'is_owner')::boolean then
    perform app.require_valid(
      exists (select 1 from public.organization_memberships o
               where o.organization_id = v_org and o.user_id = v_actor and o.is_owner)
        or app.is_platform_admin(v_actor),
      'NIVAAS_OWNER_ONLY');
  end if;

  update public.organization_memberships set
    status       = p_status,
    suspended_at = case when p_status = 'SUSPENDED' then now() end,
    removed_at   = case when p_status = 'REMOVED' then now() end,
    joined_at    = case when p_status = 'ACTIVE' then coalesce(joined_at, now()) end,
    version      = version + 1
  where id = p_membership;

  -- Revocation must reach the grants too, or a suspended person keeps role rows that
  -- some future bug could re-honour.
  if p_status in ('SUSPENDED','REMOVED') then
    update public.user_roles set revoked_at = now()
     where user_id = v_user and organization_id = v_org and revoked_at is null;
  end if;
  -- Access breadth is withdrawn with removal, but a suspension keeps it: the point of
  -- suspending is a temporary pause, and rebuilding a scope on return is guesswork.
  if p_status = 'REMOVED' then
    delete from public.membership_property_access where user_id = v_user and organization_id = v_org;
    delete from public.membership_outlet_access   where user_id = v_user and organization_id = v_org;
  end if;

  perform app.audit(
    case p_status
      when 'SUSPENDED' then 'member_suspended'
      when 'REMOVED'   then 'member_removed'
      else                  'member_restored'
    end,
    'membership', p_membership,
    p_organization := v_org, p_before := v_before,
    p_after := jsonb_build_object('status', p_status), p_reason := p_reason);
  perform app.audit('access_changed', 'membership', p_membership,
    p_organization := v_org, p_reason := p_reason,
    p_metadata := jsonb_build_object('user', v_user, 'status', p_status));

  return jsonb_build_object('membershipId', p_membership, 'status', p_status);
end;
$$;

-- §18 ownership is transferable. Two rows change in one transaction and the 002
-- partial unique index makes "two owners" impossible rather than merely unlikely.
create or replace function public.transfer_ownership(
  p_organization uuid,
  p_to_membership uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := app.require_session();
  v_target record;
  v_from   uuid;
  v_owner_role uuid;
begin
  perform app.require_reason(p_reason);

  select * into v_target from public.organization_memberships where id = p_to_membership;
  perform app.require_valid(
    v_target.id is not null and v_target.organization_id = p_organization, 'NIVAAS_NOT_FOUND');
  perform app.require_valid(v_target.status = 'ACTIVE', 'NIVAAS_MEMBER_NOT_ACTIVE');
  perform app.require_valid(
    exists (select 1 from public.organization_memberships m
             where m.organization_id = p_organization and m.user_id = v_actor
               and m.is_owner and m.status = 'ACTIVE')
      or app.is_platform_admin(v_actor),
    'NIVAAS_OWNER_ONLY');

  select id into v_owner_role from public.roles where name = 'ORG_OWNER';
  select user_id into v_from from public.organization_memberships
   where organization_id = p_organization and is_owner;

  update public.organization_memberships set is_owner = false, version = version + 1
   where organization_id = p_organization and is_owner;
  update public.organization_memberships set is_owner = true, version = version + 1
   where id = p_to_membership;

  -- The ORG_OWNER grant travels with the seat, not the person.
  update public.user_roles set revoked_at = now()
   where role_id = v_owner_role and organization_id = p_organization
     and user_id = v_from and revoked_at is null;
  insert into public.user_roles (user_id, role_id, organization_id, granted_by)
  values (v_target.user_id, v_owner_role, p_organization, v_actor);

  perform app.audit('access_changed', 'organization', p_organization,
    p_organization := p_organization, p_reason := p_reason,
    p_metadata := jsonb_build_object('from_user', v_from, 'to_membership', p_to_membership));

  return jsonb_build_object('organizationId', p_organization,
                            'previousOwner', v_from, 'newMemberId', p_to_membership);
end;
$$;

-- ------------------------------------------------------------ role assign/revoke

-- §21/§23: one door for grants, so no screen invents its own scope semantics.
create or replace function public.assign_role(
  p_user uuid,
  p_role text,
  p_organization uuid,
  p_property uuid default null,
  p_outlet uuid default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.require_session();
  v_role  record;
  v_grant uuid;
begin
  perform app.require_permission('role.assign', p_organization);
  perform app.require_active_organization(p_organization);

  select * into v_role from public.roles
   where name = upper(p_role) and status = 'ACTIVE'
     and (is_system or organization_id = p_organization);
  perform app.require_valid(v_role.id is not null, 'NIVAAS_ROLE_NOT_FOUND');

  -- The grantee must already belong to the tenant (§15). The 002 trigger then proves
  -- the scope columns match the role's declared level, server-side.
  perform app.require_valid(
    exists (select 1 from public.organization_memberships m
             where m.user_id = p_user and m.organization_id = p_organization
               and m.status = 'ACTIVE'),
    'NIVAAS_NOT_A_MEMBER');
  -- A DEPARTMENT-scope role has no wired path: `my_permissions` resolves grants at
  -- organization, property and outlet level only, so accepting a department id here
  -- would write a grant that silently confers nothing. Refused at the door instead of
  -- half-built — Prompt #03 decides whether department scoping is worth resolving.
  perform app.require_valid(
    v_role.scope_level <> 'DEPARTMENT', 'NIVAAS_DEPARTMENT_GRANTS_UNSUPPORTED');

  if v_role.scope_level = 'PROPERTY' then
    perform app.require_valid(p_property is not null, 'NIVAAS_SCOPE_MISMATCH');
  elsif v_role.scope_level = 'OUTLET' then
    perform app.require_valid(p_outlet is not null, 'NIVAAS_SCOPE_MISMATCH');
  end if;

  insert into public.user_roles
    (user_id, role_id, organization_id, property_id, outlet_id, granted_by)
  values (p_user, v_role.id, p_organization,
          case when v_role.scope_level = 'PROPERTY' then p_property end,
          case when v_role.scope_level = 'OUTLET'   then p_outlet end,
          v_actor)
  returning id into v_grant;

  -- A scoped role is meaningless inside an access set that hides its site, so the
  -- breadth travels with the grant — narrowed to the single site, never widened to
  -- the whole group.
  if v_role.scope_level = 'PROPERTY' then
    insert into public.membership_property_access (user_id, organization_id, property_id, mode)
    values (p_user, p_organization, p_property, 'SELECTED_PROPERTIES')
    on conflict do nothing;
  elsif v_role.scope_level = 'OUTLET' then
    insert into public.membership_property_access (user_id, organization_id, property_id, mode)
    select p_user, p_organization, o.property_id, 'SELECTED_PROPERTIES'
      from public.outlets o where o.id = p_outlet
    on conflict do nothing;
    insert into public.membership_outlet_access (user_id, organization_id, property_id, outlet_id, mode)
    select p_user, p_organization, o.property_id, o.id, 'SELECTED_OUTLETS'
      from public.outlets o where o.id = p_outlet
    on conflict do nothing;
  end if;

  perform app.audit('role_assigned', 'user_role', v_grant,
    p_organization := p_organization, p_property := p_property, p_outlet := p_outlet,
    p_reason := p_reason,
    p_after := jsonb_build_object('user', p_user, 'role', v_role.name));
  perform app.audit('access_changed', 'user_role', v_grant,
    p_organization := p_organization, p_reason := p_reason,
    p_metadata := jsonb_build_object('effect', 'granted', 'role', v_role.name));

  return jsonb_build_object('grantId', v_grant, 'role', v_role.name,
                            'scope', v_role.scope_level);
end;
$$;

create or replace function public.revoke_role(p_grant uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_org    uuid;
begin
  perform app.require_session();
  perform app.require_reason(p_reason);

  select to_jsonb(ur) into v_before from public.user_roles ur where ur.id = p_grant;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');
  v_org := (v_before->>'organization_id')::uuid;
  perform app.require_permission('role.assign', v_org);
  perform app.require_valid(v_before->>'revoked_at' is null, 'NIVAAS_ALREADY_REVOKED');

  update public.user_roles set revoked_at = now() where id = p_grant;

  perform app.audit('access_changed', 'user_role', p_grant,
    p_organization := v_org, p_before := v_before,
    p_after := jsonb_build_object('revoked_at', now()), p_reason := p_reason);
  return jsonb_build_object('grantId', p_grant, 'revoked', true);
end;
$$;

-- ------------------------------------------------------- access breadth (§19/§20)

-- Setting breadth replaces the whole set, because a partial diff is how an old grant
-- quietly survives a reassignment.
create or replace function public.set_property_access(
  p_user uuid,
  p_organization uuid,
  p_mode text,
  p_property_ids uuid[] default '{}',
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_session();
  perform app.require_permission('property.manage_access', p_organization);
  perform app.require_valid(p_mode in ('ALL_PROPERTIES','SELECTED_PROPERTIES'), 'NIVAAS_INVALID_MODE');
  perform app.require_valid(p_mode = 'ALL_PROPERTIES' or p_property_ids <> '{}'::uuid[],
    'NIVAAS_EMPTY_SELECTION');
  perform app.require_valid(
    exists (select 1 from public.organization_memberships m
             where m.user_id = p_user and m.organization_id = p_organization
               and m.status = 'ACTIVE'),
    'NIVAAS_NOT_A_MEMBER');
  perform app.require_valid(
    not exists (select 1 from unnest(p_property_ids) pid
                 where not exists (select 1 from public.properties pr
                                    where pr.id = pid and pr.organization_id = p_organization)),
    'NIVAAS_SCOPE_MISMATCH');

  delete from public.membership_property_access
   where user_id = p_user and organization_id = p_organization;

  if p_mode = 'ALL_PROPERTIES' then
    insert into public.membership_property_access (user_id, organization_id, mode)
    values (p_user, p_organization, 'ALL_PROPERTIES');
  else
    insert into public.membership_property_access (user_id, organization_id, property_id, mode)
    select p_user, p_organization, pid, 'SELECTED_PROPERTIES' from unnest(p_property_ids) pid;
  end if;

  -- Narrowing breadth strands any property/outlet-scoped role that now sits outside
  -- the set; leaving the grant behind is the bug, not the audit trail.
  perform app.audit('access_changed', 'membership_property_access', p_user,
    p_organization := p_organization, p_reason := p_reason,
    p_after := jsonb_build_object('user', p_user, 'mode', p_mode,
                                  'properties', to_jsonb(p_property_ids)));
  return jsonb_build_object('user', p_user, 'mode', p_mode);
end;
$$;

create or replace function public.set_outlet_access(
  p_user uuid,
  p_property uuid,
  p_mode text,
  p_outlet_ids uuid[] default '{}',
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  perform app.require_session();

  select organization_id into v_org from public.properties where id = p_property;
  perform app.require_valid(v_org is not null, 'NIVAAS_NOT_FOUND');
  perform app.require_permission('outlet.manage_access', v_org, p_property);
  perform app.require_valid(p_mode in ('ALL_OUTLETS','SELECTED_OUTLETS'), 'NIVAAS_INVALID_MODE');
  perform app.require_valid(p_mode = 'ALL_OUTLETS' or p_outlet_ids <> '{}'::uuid[],
    'NIVAAS_EMPTY_SELECTION');
  perform app.require_valid(
    not exists (select 1 from unnest(p_outlet_ids) oid
                 where not exists (select 1 from public.outlets o
                                    where o.id = oid and o.property_id = p_property)),
    'NIVAAS_SCOPE_MISMATCH');

  delete from public.membership_outlet_access
   where user_id = p_user and property_id = p_property;

  if p_mode = 'ALL_OUTLETS' then
    insert into public.membership_outlet_access (user_id, organization_id, property_id, mode)
    values (p_user, v_org, p_property, 'ALL_OUTLETS');
  else
    insert into public.membership_outlet_access
      (user_id, organization_id, property_id, outlet_id, mode)
    select p_user, v_org, p_property, oid, 'SELECTED_OUTLETS' from unnest(p_outlet_ids) oid;
  end if;

  perform app.audit('access_changed', 'membership_outlet_access', p_user,
    p_organization := v_org, p_property := p_property, p_reason := p_reason,
    p_after := jsonb_build_object('user', p_user, 'mode', p_mode,
                                  'outlets', to_jsonb(p_outlet_ids)));
  return jsonb_build_object('user', p_user, 'property', p_property, 'mode', p_mode);
end;
$$;

-- ------------------------------------------------------------ active context §29

-- Storing a context proves it first. A stale preference (revoked access, archived
-- site) is narrowed rather than persisted, which is what §29's security rule asks.
create or replace function public.set_active_context(
  p_organization uuid default null,
  p_property uuid default null,
  p_outlet uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.require_session();
  v_org   uuid := p_organization;
  v_prop  uuid := p_property;
  v_out   uuid := p_outlet;
begin
  if v_org is not null and not app.member_of(v_actor, v_org) then
    v_org := null;
  end if;
  if v_prop is not null and not app.can_access_property(v_actor, v_prop) then
    v_prop := null;
    v_out  := null;
  end if;
  if v_out is not null and not app.can_access_outlet(v_actor, v_out) then
    v_out := null;
  end if;

  insert into public.user_active_contexts (user_id, organization_id, property_id, outlet_id)
  values (v_actor, v_org, v_prop, v_out)
  on conflict (user_id) do update
    set organization_id = excluded.organization_id,
        property_id     = excluded.property_id,
        outlet_id       = excluded.outlet_id,
        updated_at      = now();

  return jsonb_build_object('organizationId', v_org, 'propertyId', v_prop, 'outletId', v_out);
end;
$$;

-- The §29 verification itself: on every load the client calls this and renders the
-- answer, so a saved context can never outlive the access that justified it.
create or replace function public.resolve_active_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.current_user_id();
  v_row   record;
begin
  if v_actor is null then
    return jsonb_build_object('signedIn', false);
  end if;

  select * into v_row from public.user_active_contexts where user_id = v_actor;

  -- Re-prove every level; a revoked grant drops that level and everything under it.
  if v_row.organization_id is not null
     and not app.member_of(v_actor, v_row.organization_id) then
    return jsonb_build_object('signedIn', true, 'organizationId', null,
                              'propertyId', null, 'outletId', null, 'cleared', true);
  end if;
  if v_row.property_id is not null
     and not app.can_access_property(v_actor, v_row.property_id) then
    return jsonb_build_object('signedIn', true,
                              'organizationId', v_row.organization_id,
                              'propertyId', null, 'outletId', null, 'cleared', true);
  end if;
  if v_row.outlet_id is not null
     and not app.can_access_outlet(v_actor, v_row.outlet_id) then
    return jsonb_build_object('signedIn', true,
                              'organizationId', v_row.organization_id,
                              'propertyId', v_row.property_id,
                              'outletId', null, 'cleared', true);
  end if;

  return jsonb_build_object('signedIn', true,
                            'organizationId', v_row.organization_id,
                            'propertyId', v_row.property_id,
                            'outletId', v_row.outlet_id,
                            'cleared', false);
end;
$$;

-- The client's mirror of §24, so the UI can hide what the server would refuse. This
-- is a display aid, never the gate — every door above re-asks the question itself.
create or replace function public.my_permissions(
  p_organization uuid,
  p_property uuid default null,
  p_outlet uuid default null
)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  -- A platform admin holds GLOBAL grants, which carry no organization row, so the
  -- tenant predicate would otherwise answer "no permissions" for the one role that
  -- sees everything.
  select case
    when app.is_platform_admin(app.current_user_id())
      then (select coalesce(array_agg(distinct rp.permission order by rp.permission), '{}'::text[])
              from public.role_permissions rp)
    else coalesce(array_agg(distinct rp.permission order by rp.permission), '{}'::text[])
  end
  from public.role_permissions rp
  join public.roles r on r.id = rp.role_id
  join public.user_roles ur on ur.role_id = r.id
  where ur.user_id = app.current_user_id()
    and ur.revoked_at is null
    and (
      -- tenant-wide standing
      (ur.organization_id = p_organization and r.scope_level = 'ORGANIZATION')
      -- a site-scoped grant only counts for the site asked about
      or (ur.organization_id = p_organization and r.scope_level = 'PROPERTY'
          and p_property is not null and ur.property_id = p_property)
      -- an outlet grant counts for its own outlet, or for the property it sits in
      or (ur.organization_id = p_organization and r.scope_level = 'OUTLET'
          and (ur.outlet_id = p_outlet
               or (p_outlet is not null
                   and ur.property_id = (select property_id from public.outlets where id = p_outlet))
               or (p_property is not null and ur.property_id = p_property)))
    );
$$;

-- ------------------------------------------------------------------ door grants

-- Client roles may call the doors; the doors reach the tables through their owner,
-- which is the only write path any client has.
--
-- The list below names functions WITHOUT signatures and lets the catalog resolve them.
-- Hand-written `(uuid, text, ...)` lists rot the moment a parameter is added, and the
-- resulting error — "function does not exist" at the far end of the file — gives no hint
-- of which definition drifted. A listed name with no function behind it aborts the apply,
-- so the drift can only ever be in the direction of an intentional new door.
do $$
declare
  v_name text;
  v_oid  oid;
  v_oids oid[];
begin
  foreach v_name in array array[
    -- hierarchy doors
    'create_organization', 'update_organization', 'set_organization_status',
    'create_property', 'update_property', 'set_property_status',
    'create_outlet', 'update_outlet', 'set_outlet_status',
    'create_department', 'update_department', 'set_department_status',
    -- people doors
    'invite_member', 'accept_invitation', 'cancel_invitation',
    'set_member_status', 'transfer_ownership', 'assign_role', 'revoke_role',
    'set_property_access', 'set_outlet_access',
    -- session & permission resolution
    'set_active_context', 'resolve_active_context', 'my_permissions',
    -- guard helpers (SECURITY INVOKER; the doors call them, and RLS policies need them too)
    'require_session', 'require_permission', 'require_active_organization',
    'require_writable_property', 'require_writable_outlet', 'require_reason',
    'require_valid', 'require_unique', 'require_version', 'require_valid_common'
  ] loop
    -- The two schemas are a security boundary, not tidiness. Supabase's PostgREST
    -- exposes only `public` over HTTP, so a door in `public` is the ONLY thing a
    -- client can call, and everything that stays in `app` — the guards, app.audit,
    -- every tenancy helper — is unreachable from a browser no matter what grants it
    -- holds. Moving a door here without moving its guard therefore cannot widen
    -- anything: a client can never call require_permission and skip it.
    select coalesce(array_agg(p.oid), '{}'::oid[]) into v_oids
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'app') and p.proname = v_name;

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
