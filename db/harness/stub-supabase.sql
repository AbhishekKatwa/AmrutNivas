-- ============================================================================
-- AMRUT NIVAAS — local harness stub for the Supabase-managed environment
--
-- NOT APPLIED TO ANY HOSTED PROJECT. This file exists so the tenant schema can be
-- executed and attacked on a throwaway local cluster instead of being declared
-- correct by reading it. It recreates only what the migrations assume:
--
--   * the three API roles Supabase ships (`anon`, `authenticated`, `service_role`)
--     plus `authenticator`, the login role PostgREST connects as before it does
--     `set local role authenticated`;
--   * the `extensions` and `auth` schemas, `auth.users`, and `auth.uid()` reading
--     the `request.jwt.claims` GUC exactly the way Supabase's does.
--
-- Real Supabase already has all of this, and 000-007 never touch these objects
-- except to read `auth.uid()` and to hang the signup trigger on `auth.users`.
-- Passwords here are local-cluster noise, not credentials; nothing in this file may
-- ever be copied into a hosted migration.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    -- service_role bypasses RLS in Supabase; the local harness mirrors that so the
    -- isolation tests prove the policies rather than a difference in role attributes.
    create role service_role nologin bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login password 'local-harness-only';
  end if;
end;
$$;

grant authenticated to authenticator;
grant anon to authenticator;
grant service_role to authenticator;

create schema if not exists extensions;
create schema if not exists auth;

-- The minimum of GoTrue's table the migrations actually depend on.
create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

-- Supabase's own definition reads the JWT claims PostgREST installs per request.
-- Keeping that path live is what makes scenario 7 (a client forging an identity)
-- a real test rather than a claim.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select (nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', ''))::uuid;
$$;

grant usage on schema public, extensions, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
