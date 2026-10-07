-- AMRUT NIVAAS · 000 — tenancy helpers
-- The whole security model resolves through these functions. Nothing here trusts a
-- client-supplied id: a scope claim only ever names the tenant the user is *asking*
-- about, and every function below independently proves membership before it is believed.
--
-- Environment note (learned in the sibling project): `set_config` without `transaction`
-- is session-local on a pooled connection and leaks across requests, so scope is always
-- set with `set_config(..., true)` from inside a transaction, and every RPC re-proves
-- membership rather than relying on the setting having survived.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

create schema if not exists app;
grant usage on schema app to authenticated, service_role;
-- The doors hash invitation tokens with pgcrypto, which Supabase installs in its own
-- schema and pins out of search_path — so it has to be reachable by name.
grant usage on schema extensions to authenticated, service_role;

-- These helpers resolve members, breadth and permissions out of tables that 001 and 002
-- create. Postgres validates a SQL/pgpsql body when the function is *created*, so on an
-- empty database the first apply would abort on `relation ... does not exist`. Body
-- checking is restored at the end of this file; anything genuinely misspelled here then
-- fails on its first call, which the verifier exercises in the same apply run.
set check_function_bodies = off;

-- ---------------------------------------------------------------- identities

-- Who is asking. This function is the root of every authorization decision in the
-- product, so its one override path is gated deliberately (see below).
create or replace function app.current_user_id()
returns uuid
language sql
stable
as $$
  -- auth.uid() is the JWT claim and is the only identity a real client has.
  --
  -- A placeholder GUC (any `app.*` name) is settable by ANY role via set_config, so
  -- honouring it unconditionally would let a client whose JWT has no subject name
  -- whichever user id it liked and read that tenant. The override is therefore gated
  -- on the LOGIN identity, not the effective one:
  --
  --   * via the API, PostgREST logs in as `authenticator` and does `set local role
  --     authenticated`, so current_user is `authenticated` but session_user stays
  --     `authenticator` — the branch below is unreachable, whatever the client sends;
  --   * inside a SECURITY DEFINER door, current_user switches to the function owner
  --     (which would re-open the branch for a client-driven request) while
  --     session_user does not change — which is why this predicate uses session_user.
  --
  -- What remains able to use it: a direct connection as `postgres`/superuser, i.e.
  -- the psql verifier and the local test cluster, which can exercise the exact same
  -- policies and doors without minting JWTs. They are already trusted with the DB
  -- password, so the override grants no privilege they did not have.
  select coalesce(
    auth.uid(),
    case when session_user not in ('anon', 'authenticated', 'authenticator')
         then nullif(current_setting('app.user_id', true), '')::uuid
    end
  );
$$;

-- ---------------------------------------------------------------- membership

-- An ACTIVE membership in the tenant. SUSPENDED/REMOVED/ARCHIVED do not count.
create or replace function app.member_of(p_user uuid, p_organization uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships m
    where m.user_id = p_user
      and m.organization_id = p_organization
      and m.status = 'ACTIVE'
  );
$$;

create or replace function app.is_platform_admin(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = p_user
      and r.name = 'PLATFORM_ADMIN'
      and r.scope_level = 'GLOBAL'
  );
$$;

-- Organization must be usable for new operational work.
create or replace function app.organization_is_active(p_organization uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organizations o
    where o.id = p_organization
      and o.status = 'ACTIVE'
  );
$$;

-- ---------------------------------------------------------------- scope walk

-- Property access = membership in the owning org AND either an ALL_PROPERTIES grant
-- or an explicit property row. Archived property: readable, never writable — that
-- distinction lives in the write RPCs, which call app.property_is_writable().
create or replace function app.can_access_property(p_user uuid, p_property uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_platform_admin(p_user) or (
    exists (
      select 1
      from public.properties pr
      where pr.id = p_property
        and app.member_of(p_user, pr.organization_id)
    )
    and (
      exists (
        select 1
        from public.membership_property_access a
        where a.user_id = p_user
          and a.organization_id = (select organization_id from public.properties where id = p_property)
          and a.mode = 'ALL_PROPERTIES'
      )
      or exists (
        select 1
        from public.membership_property_access a
        where a.user_id = p_user
          and a.property_id = p_property
          and a.mode = 'SELECTED_PROPERTIES'
      )
    )
  );
$$;

-- Outlet breadth INHERITS the property unless an administrator has carved out an
-- explicit SELECTED_OUTLETS set for that (user, property) — which is what §23's
-- "widest applicable grant wins" means in practice. Without the inheritance an owner
-- would reach every site and no restaurant in it, and §54's outlet selector would
-- have nothing to preselect.
create or replace function app.can_access_outlet(p_user uuid, p_outlet uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with target as (
    select property_id from public.outlets where id = p_outlet
  )
  select app.is_platform_admin(p_user) or (
    -- Never reachable through an outlet alone: the property has to be reachable too.
    exists (select 1 from target t
             where app.can_access_property(p_user, t.property_id))
    and (
      -- No carve-out at this property means the property's breadth applies.
      not exists (
        select 1 from public.membership_outlet_access a, target t
        where a.user_id = p_user and a.property_id = t.property_id
          and a.mode = 'SELECTED_OUTLETS'
      )
      -- Otherwise only the outlets named by a grant.
      or exists (
        select 1 from public.membership_outlet_access a, target t
        where a.user_id = p_user
          and ((a.mode = 'ALL_OUTLETS' and a.property_id = t.property_id)
            or (a.mode = 'SELECTED_OUTLETS' and a.outlet_id = p_outlet))
      )
    )
  );
$$;

create or replace function app.property_is_writable(p_property uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.properties pr
    join public.organizations o on o.id = pr.organization_id
    where pr.id = p_property and pr.status = 'ACTIVE' and o.status = 'ACTIVE'
  );
$$;

create or replace function app.outlet_is_writable(p_outlet uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.outlets o
    where o.id = p_outlet and o.status = 'ACTIVE'
      and app.property_is_writable(o.property_id)
  );
$$;

-- ---------------------------------------------------------------- permission

-- The single authorization question. Answers "may this user, in this tenant, at this
-- property/outlet, do `permission`?" — widest applicable grant wins; anything outside
-- the widest grant is invisible, not merely denied.
create or replace function app.has_permission(
  p_user uuid,
  p_organization uuid,
  p_permission text,
  p_property uuid default null,
  p_outlet uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_platform_admin(p_user) or (
    app.member_of(p_user, p_organization)
    and exists (
      select 1
      from public.role_permissions rp
      join public.roles r on r.id = rp.role_id
      join public.user_roles ur on ur.role_id = r.id
      where ur.user_id = p_user
        and rp.permission = p_permission
        and ur.organization_id = p_organization
        and (
          -- GLOBAL and ORGANIZATION grants need no location predicate
          r.scope_level in ('GLOBAL', 'ORGANIZATION')
          -- PROPERTY/OUTLET grants only fire inside the scope the user actually has
          or (r.scope_level = 'PROPERTY'  and p_property is not null
              and ur.property_id = p_property)
          or (r.scope_level = 'OUTLET'    and p_outlet is not null
              and (ur.outlet_id = p_outlet or ur.property_id = (select property_id from public.outlets where id = p_outlet)))
        )
    )
  );
$$;

-- Convenience for RLS policies on tenant tables: readable by any active member.
create or replace function app.can_see_organization(p_user uuid, p_organization uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_platform_admin(p_user) or app.member_of(p_user, p_organization);
$$;

-- ---------------------------------------------------------------- validation

-- IANA zone names are a view, not an enum: validating against it means a new timezone
-- never requires a migration.
create or replace function app.is_valid_timezone(p_timezone text)
returns boolean
language sql
stable
as $$
  select exists (select 1 from pg_timezone_names t where t.name = p_timezone);
$$;

create or replace function app.is_valid_currency(p_currency text)
returns boolean
language sql
immutable
as $$
  select p_currency ~ '^[A-Z]{3}$';
$$;

create or replace function app.is_valid_slug(p_slug text)
returns boolean
language sql
immutable
as $$
  -- stable, url-safe, never derived from a display name at read time
  select p_slug ~ '^[a-z0-9][a-z0-9-]{1,59}$';
$$;

-- Money helper for every later module: integer paise in, numeric out. NEVER float.
create or replace function app.r2(p_value numeric)
returns numeric
language sql
immutable
as $$
  select round(coalesce(p_value, 0), 2);
$$;

reset check_function_bodies;
