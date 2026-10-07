-- AMRUT NIVAAS · 008 — identity hardening (Prompt #03 §5, §6, §25, §27)
--
-- Two defects this file closes, both found by reading the executed schema rather than
-- the design notes:
--
--   1. `app.has_permission` and `app.is_platform_admin` joined `user_roles` without
--      `revoked_at is null`. `revoke_role` and the suspension path soft-revoke a grant
--      (005), and `my_permissions` filtered it, so the UI went quiet while EVERY DOOR
--      kept honouring the revoked authority. A permission taken away was a permission
--      still in force on the server — which is precisely the case §2 says must not be
--      decided by frontend visibility.
--   2. Nothing in the schema read `profiles.status`. Every authorizer tested the
--      MEMBERSHIP status, so a person whose login was SUSPENDED passed `app.member_of`,
--      every policy and every door as long as one membership row stayed ACTIVE.
--      Suspending an account was a UI field.
--
-- The fix is one predicate in the two functions everything else resolves through, not
-- a new check per call site: `member_of` and `is_platform_admin` now require an
-- operational account. Policies evaluate as the session role but the helpers are
-- SECURITY DEFINER, so the added read of `public.profiles` runs as the function owner
-- and cannot recurse into the profiles policy that calls `member_of` itself.
--
-- Scope note: an account suspension is platform-level and therefore global — one login
-- spans several tenants, and §5 forbids putting tenant state on `profiles`. Per-tenant
-- lockout is `organization_memberships.status`, which already works. SECURITY.md states
-- this so nobody reads a suspension as a single-tenant action.

-- ---------------------------------------------------------------- §5 the person

-- Prompt #03 §5 names first/last/display name, locale, timezone and last_login_at.
-- `full_name` stays as the stored name of record (the signup mirror writes it); the two
-- parts are optional decomposition, and `display_name` is derived so the three can never
-- disagree and no screen has to pick which one to trust.
alter table public.profiles
  add column if not exists first_name     text,
  add column if not exists last_name      text,
  add column if not exists locale         text,
  add column if not exists timezone       text,
  add column if not exists last_login_at  timestamptz;

comment on column public.profiles.first_name is
  'Optional given name. Absent is absent — never filled from an email local part and shown as a name.';
comment on column public.profiles.last_login_at is
  'Written by public.record_auth_event (010) on a signed-in session, never by the client.';

do $$
begin
  alter table public.profiles drop constraint if exists profiles_locale_check;
end;
$$;
alter table public.profiles
  add constraint profiles_locale_check
  check (locale is null or locale ~ '^[a-z]{2}(-[A-Z]{2})?$');

-- Generated rather than trigger-maintained: a trigger can be forgotten by a future write
-- path, and a name the person never gave must not become a fabricated one. The last arm
-- mirrors what `app.handle_new_user()` already stores in `full_name` when a signup
-- carries no name metadata, so display_name is exactly as invented as the data already
-- is — no more.
alter table public.profiles
  add column if not exists display_name text generated always as (
    coalesce(
      nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''),
      nullif(btrim(coalesce(full_name, '')), ''),
      nullif(split_part(email::text, '@', 1), ''),
      ''
    )
  ) stored;

-- §5 statuses: ACTIVE / INVITED / SUSPENDED / DEACTIVATED. `INVITED` is deliberately
-- NOT here: invitation standing belongs to a tenant, and a profile is the global login —
-- §5's own warning about `user.role = OWNER`. It lives on `invitations.status` and
-- `organization_memberships.status` (both already carry it), which is why a person can be
-- invited to one group and ACTIVE in another.
--
-- `INACTIVE` is retired: it meant "not trading" at the organization level and nothing
-- ever wrote it here. Existing rows move to DEACTIVATED, the value that says the login is
-- closed rather than merely unused.
update public.profiles set status = 'DEACTIVATED' where status = 'INACTIVE';

do $$
begin
  alter table public.profiles drop constraint if exists profiles_status_check;
end;
$$;
alter table public.profiles
  add constraint profiles_status_check
  check (status in ('ACTIVE','SUSPENDED','DEACTIVATED'));

-- Same catalog-backed IANA validation the hierarchy tables use (a CHECK cannot read a
-- view), on the two name columns now that a person's own zone is stored.
drop trigger if exists profiles_timezone on public.profiles;
create trigger profiles_timezone before insert or update on public.profiles
  for each row execute function app.assert_timezone();

-- The signup mirror learns the name parts when GoTrue has them. It sets nothing it does
-- not have: no invented locale, no invented timezone.
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, first_name, last_name)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    nullif(new.raw_user_meta_data ->> 'first_name', ''),
    nullif(new.raw_user_meta_data ->> 'last_name', '')
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

-- ---------------------------------------------------------------- account standing

-- The one question every authorizer now asks. A missing profile is treated as not
-- operational: `app.handle_new_user()` guarantees a row for every GoTrue signup, so its
-- absence means a half-created identity, and an unknown standing must deny.
create or replace function app.account_is_operational(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles pr
    where pr.id = p_user
      and pr.status = 'ACTIVE'
  );
$$;

-- The standing itself, for `app.require_session()`'s refusal code. Kept separate from the
-- boolean so a screen can say "your account is suspended" instead of "access denied"
-- (§46's security UX states) without each caller re-reading the table.
create or replace function app.account_status(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pr.status from public.profiles pr where pr.id = p_user;
$$;

-- ---------------------------------------------------- authorizers: the two fixes

-- Membership AND an operational account. Every read policy and every door resolves
-- through here, so suspension takes effect on the next call — no refresh, no grace.
create or replace function app.member_of(p_user uuid, p_organization uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.account_is_operational(p_user)
    and exists (
      select 1
      from public.organization_memberships m
      where m.user_id = p_user
        and m.organization_id = p_organization
        and m.status = 'ACTIVE'
    );
$$;

-- A revoked GLOBAL grant is not an admin, and a suspended account is not an admin.
-- Without this, revoking PLATFORM_ADMIN changed only what the UI offered.
create or replace function app.is_platform_admin(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.account_is_operational(p_user)
    and exists (
      select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = p_user
        and r.name = 'PLATFORM_ADMIN'
        and r.scope_level = 'GLOBAL'
        and ur.revoked_at is null
    );
$$;

-- The server's own answer to "may I?". Same revoked-grant fix as the helper above; the
-- two must agree or a door passes where the UI refused (or the reverse), and the donor
-- project's role matrix drifted exactly that way.
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
        -- A soft-revoked grant grants nothing. This line is the defect this migration
        -- exists to fix.
        and ur.revoked_at is null
        and (
          r.scope_level in ('GLOBAL', 'ORGANIZATION')
          or (r.scope_level = 'PROPERTY'  and p_property is not null
              and ur.property_id = p_property)
          or (r.scope_level = 'OUTLET'    and p_outlet is not null
              and (ur.outlet_id = p_outlet or ur.property_id = (select property_id from public.outlets where id = p_outlet)))
        )
    )
  );
$$;

-- ----------------------------------------------------------------- session guard

-- Distinct refusals, because a person locked out by their own account standing must not
-- be told they lack a permission (the §39 rule: no internal detail, but the right
-- sentence). `stable` is unchanged: the body only reads.
create or replace function app.require_session()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user   uuid;
  v_status text;
begin
  v_user := app.current_user_id();
  if v_user is null then
    raise exception 'NIVAAS_NO_SESSION';
  end if;

  select pr.status into v_status from public.profiles pr where pr.id = v_user;
  if not found then
    raise exception 'NIVAAS_PROFILE_MISSING';
  end if;
  if v_status <> 'ACTIVE' then
    raise exception 'NIVAAS_ACCOUNT_%', v_status;
  end if;

  return v_user;
end;
$$;

-- ------------------------------------------------------ permission resolution door

-- Two fixes in the door the client reads capabilities from:
--   * a REVOKED grant is filtered here too, so the UI and `app.has_permission` now agree
--     by construction instead of by two hand-written copies of the same predicate;
--   * the answer is gated on membership, which it never was: a REMOVED person's grant rows
--     survive (revocation is only forced on suspension), so this door used to hand a
--     removed member a live permission list for the tenant they were just ejected from —
--     exactly the §6 "removed must not retain operational access" case.
--
-- `returns text[]` is load-bearing: PostgREST renders the array the client reads, and
-- changing a return type is not a valid `create or replace`.
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
  select case
    -- A platform admin holds GLOBAL grants, which carry no organization row, so the
    -- tenant predicate would otherwise answer "no permissions" for the one role that
    -- sees everything.
    when app.is_platform_admin(app.current_user_id())
      then (select coalesce(array_agg(distinct rp.permission order by rp.permission), '{}'::text[])
              from public.role_permissions rp)
    when app.member_of(app.current_user_id(), p_organization)
      then coalesce(array_agg(distinct rp.permission order by rp.permission), '{}'::text[])
    else '{}'::text[]
  end
  from public.role_permissions rp
  join public.roles r on r.id = rp.role_id
  join public.user_roles ur on ur.role_id = r.id
  where ur.user_id = app.current_user_id()
    and ur.revoked_at is null
    and (
      (ur.organization_id = p_organization and r.scope_level = 'ORGANIZATION')
      or (ur.organization_id = p_organization and r.scope_level = 'PROPERTY'
          and p_property is not null and ur.property_id = p_property)
      or (ur.organization_id = p_organization and r.scope_level = 'OUTLET'
          and (ur.outlet_id = p_outlet
               or (p_outlet is not null
                   and ur.property_id = (select property_id from public.outlets where id = p_outlet))
               or (p_property is not null and ur.property_id = p_property)))
    );
$$;

-- ---------------------------------------------------------------------- grants

-- Policies call these as the session role, so they must be executable by it. Bodies run
-- as the owner, so this grants no extra reach — it is the same note 003 carries.
grant execute on function app.account_is_operational(uuid), app.account_status(uuid)
  to authenticated, service_role;

-- Self-check: the helpers the whole model resolves through must exist with the shapes
-- the policies were written against, or a future edit silently widens a gate.
do $$
begin
  if not (
    select prosecdef
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'app' and p.proname = 'account_is_operational'
  ) then
    raise exception 'NIVAAS_MIGRATION_GAP: app.account_is_operational is not a security definer helper';
  end if;
  if exists (select 1 from public.profiles where status not in ('ACTIVE','SUSPENDED','DEACTIVATED')) then
    raise exception 'NIVAAS_MIGRATION_GAP: profiles carries a retired status';
  end if;
end;
$$;
