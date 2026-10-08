-- AMRUT NIVAAS · 002 — identity, membership and access scope
--
-- §16/§21: a user does NOT have an `organization_id` column. Access is a membership row,
-- so one human can be Owner of one group and Consultant of another, and revoking one
-- never touches the login.
--
-- §87: `profiles` (a person who can sign in) and `employees` (an HR/business record, a
-- later module) are separate concepts and are deliberately not merged here.

-- ------------------------------------------------------------------------ profiles

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  -- Canonical login, normalized at write time so two casings are never two people.
  -- Schema-qualified rather than bare `citext`: the type lives in the `extensions`
  -- schema, and whether that is in the session's search_path is an environment
  -- detail. A tenant table must not depend on one.
  email        extensions.citext unique not null,
  full_name    text not null default '',
  phone        text,
  avatar_url   text,
  status       text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE','SUSPENDED')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.profiles is
  'Authentication-facing person record. Business authority lives in memberships, never here.';

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function app.touch_updated_at();

-- Mirror Supabase's own signup path so a profile always exists for a session user.
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();

-- ------------------------------------------------------------------- memberships

create table if not exists public.organization_memberships (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete restrict,
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  -- §17 lifecycle. Rows are kept as history when access ends (§73).
  status           text not null default 'ACTIVE'
                   check (status in ('INVITED','ACTIVE','SUSPENDED','REMOVED')),
  -- §18 ownership semantics as data: exactly one owner per organization, and no
  -- hardcoded user id anywhere.
  is_owner         boolean not null default false,
  joined_at        timestamptz,
  suspended_at     timestamptz,
  removed_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  version          integer not null default 1,
  unique (user_id, organization_id)
);

create index if not exists memberships_org_idx on public.organization_memberships (organization_id);
create index if not exists memberships_user_idx on public.organization_memberships (user_id);
-- One owner per tenant, enforced by the database rather than by application hope.
create unique index if not exists memberships_one_owner_idx
  on public.organization_memberships (organization_id) where is_owner;

drop trigger if exists memberships_touch on public.organization_memberships;
create trigger memberships_touch before update on public.organization_memberships
  for each row execute function app.touch_updated_at();

-- ------------------------------------------------------------------------ roles

create table if not exists public.roles (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique check (name ~ '^[A-Z][A-Z0-9_]{2,39}$'),
  display_name text not null,
  description  text,
  -- §23: the level a role speaks at. Encoding it on the role is what stops every screen
  -- inventing its own interpretation of "manager".
  scope_level  text not null check (scope_level in ('GLOBAL','ORGANIZATION','PROPERTY','OUTLET','DEPARTMENT')),
  -- Null for the seeded system roles. Tenant-defined roles carry their organization so RLS
  -- can keep one group's custom roles out of another group's list.
  organization_id uuid references public.organizations(id) on delete cascade,
  is_system    boolean not null default false,
  -- A role is either a system role (no tenant) or a tenant role (exactly one tenant).
  constraint roles_owner_consistency_ok check (
    (is_system and organization_id is null) or (not is_system and organization_id is not null)
  ),
  status       text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on column public.roles.is_system is
  'Seeded and read-only. Tenant-defined roles are editable and never collide with a system name.';

-- The permission catalogue is one row per grant. Permission strings are `domain.verb`
-- (§24) and the shape is enforced here so a typo cannot silently become a new capability.
create table if not exists public.role_permissions (
  id          uuid primary key default gen_random_uuid(),
  role_id     uuid not null references public.roles(id) on delete cascade,
  permission  text not null check (permission ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  created_at  timestamptz not null default now(),
  unique (role_id, permission)
);

create index if not exists role_permissions_permission_idx on public.role_permissions (permission);

-- A grant of a role to a user at a tenant and, where the role says so, at a site/outlet.
create table if not exists public.user_roles (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  role_id          uuid not null references public.roles(id) on delete restrict,
  organization_id  uuid references public.organizations(id) on delete cascade,
  property_id      uuid references public.properties(id) on delete cascade,
  outlet_id        uuid references public.outlets(id) on delete cascade,
  department_id    uuid references public.departments(id) on delete cascade,
  granted_by       uuid references public.profiles(id) on delete set null,
  granted_at       timestamptz not null default now(),
  revoked_at       timestamptz
  -- Scope shape is enforced by app.assert_role_grant_shape() below: a CHECK cannot
  -- reference another table, so the "role's scope_level must match the columns filled"
  -- rule lives in a trigger rather than in a decorative constraint.
);

create index if not exists user_roles_user_idx on public.user_roles (user_id);
create index if not exists user_roles_org_idx on public.user_roles (organization_id);
create index if not exists user_roles_role_idx on public.user_roles (role_id);
-- Idempotent grants: the same role cannot be stacked twice at the same scope.
create unique index if not exists user_roles_unique_active_idx
  on public.user_roles (user_id, role_id,
                        coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
                        coalesce(property_id, '00000000-0000-0000-0000-000000000000'::uuid),
                        coalesce(outlet_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where revoked_at is null;

-- Scope shape is validated here rather than in the UI, because the UI can be bypassed.
create or replace function app.assert_role_grant_shape()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_level text;
begin
  select scope_level into v_level from public.roles where id = new.role_id;
  if v_level is null then
    raise exception 'NIVAAS_ROLE_NOT_FOUND';
  end if;

  if v_level = 'GLOBAL' then
    null;  -- platform role: no tenant columns required
  elsif v_level = 'ORGANIZATION' then
    if new.organization_id is null then
      raise exception 'NIVAAS_SCOPE_MISMATCH: ORGANIZATION role requires organization_id';
    end if;
  elsif v_level = 'PROPERTY' then
    if new.organization_id is null or new.property_id is null then
      raise exception 'NIVAAS_SCOPE_MISMATCH: PROPERTY role requires organization_id and property_id';
    end if;
  elsif v_level = 'OUTLET' then
    if new.organization_id is null or new.outlet_id is null then
      raise exception 'NIVAAS_SCOPE_MISMATCH: OUTLET role requires organization_id and outlet_id';
    end if;
  else  -- DEPARTMENT
    if new.organization_id is null or new.department_id is null then
      raise exception 'NIVAAS_SCOPE_MISMATCH: DEPARTMENT role requires organization_id and department_id';
    end if;
  end if;

  -- A grant may never reach outside the tenant it claims (§15).
  if new.property_id is not null then
    perform 1 from public.properties p
      where p.id = new.property_id and p.organization_id = new.organization_id;
    if not found then
      raise exception 'NIVAAS_SCOPE_MISMATCH: property belongs to another organization';
    end if;
  end if;
  if new.outlet_id is not null then
    perform 1 from public.outlets o
      where o.id = new.outlet_id and o.organization_id = new.organization_id;
    if not found then
      raise exception 'NIVAAS_SCOPE_MISMATCH: outlet belongs to another organization';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists user_roles_shape on public.user_roles;
create trigger user_roles_shape before insert or update on public.user_roles
  for each row execute function app.assert_role_grant_shape();

-- ---------------------------------------------------------- property/outlet access

-- §19/§20: access breadth is modelled, not inferred from which rows happen to exist.
create table if not exists public.membership_property_access (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  property_id      uuid references public.properties(id) on delete cascade,
  mode             text not null check (mode in ('ALL_PROPERTIES','SELECTED_PROPERTIES')),
  created_at       timestamptz not null default now(),
  constraint mpa_shape_ok check (
    (mode = 'ALL_PROPERTIES'      and property_id is null)
    or (mode = 'SELECTED_PROPERTIES' and property_id is not null)
  )
);

create unique index if not exists mpa_all_idx on public.membership_property_access (user_id, organization_id)
  where mode = 'ALL_PROPERTIES';
create unique index if not exists mpa_selected_idx on public.membership_property_access (user_id, property_id)
  where mode = 'SELECTED_PROPERTIES';
create index if not exists mpa_org_idx on public.membership_property_access (organization_id);

create table if not exists public.membership_outlet_access (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  property_id      uuid not null references public.properties(id) on delete cascade,
  outlet_id        uuid references public.outlets(id) on delete cascade,
  mode             text not null check (mode in ('ALL_OUTLETS','SELECTED_OUTLETS')),
  created_at       timestamptz not null default now(),
  constraint moa_shape_ok check (
    (mode = 'ALL_OUTLETS'        and outlet_id is null)
    or (mode = 'SELECTED_OUTLETS' and outlet_id is not null)
  )
);

create unique index if not exists moa_all_idx on public.membership_outlet_access (user_id, property_id)
  where mode = 'ALL_OUTLETS';
create unique index if not exists moa_selected_idx on public.membership_outlet_access (user_id, outlet_id)
  where mode = 'SELECTED_OUTLETS';
create index if not exists moa_org_idx on public.membership_outlet_access (organization_id);

-- Outlet rows must sit inside a property the grant already reaches (§15 invalid case).
create or replace function app.assert_outlet_access_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.mode = 'SELECTED_OUTLETS' and new.outlet_id is not null then
    if not exists (
      select 1 from public.membership_property_access a
      where a.user_id = new.user_id
        and (a.mode = 'ALL_PROPERTIES' or a.property_id = new.property_id)
    ) then
      raise exception 'NIVAAS_SCOPE_MISMATCH: outlet granted without access to its property';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists moa_parent on public.membership_outlet_access;
create trigger moa_parent before insert or update on public.membership_outlet_access
  for each row execute function app.assert_outlet_access_parent();

-- ------------------------------------------------------------------ invitations

-- §35/§36: an invitation is a pending grant, not an account. The account is created only
-- when the invitation is accepted, and the token is stored hashed so a leaked table dump
-- cannot hand anyone a working accept link.
create table if not exists public.invitations (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  email             extensions.citext not null,
  phone             text,
  full_name         text,
  role_id           uuid not null references public.roles(id) on delete restrict,
  -- Scope travels with the invite so an accepted invite cannot arrive with wider rights.
  property_ids      uuid[] not null default '{}'::uuid[],
  outlet_ids        uuid[] not null default '{}'::uuid[],
  status            text not null default 'INVITED'
                    check (status in ('INVITED','ACCEPTED','EXPIRED','CANCELLED','REVOKED')),
  token_hash        text not null unique,
  invited_by        uuid not null references public.profiles(id) on delete restrict,
  expires_at        timestamptz not null,
  accepted_at       timestamptz,
  accepted_by       uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists invitations_org_status_idx on public.invitations (organization_id, status);
create index if not exists invitations_email_idx on public.invitations (email);

drop trigger if exists invitations_touch on public.invitations;
create trigger invitations_touch before update on public.invitations
  for each row execute function app.touch_updated_at();

-- ------------------------------------------------------------------- last context

-- §29 persistence. This stores a *preference*, and is never trusted as authorization:
-- every load re-proves it against memberships before use.
create table if not exists public.user_active_contexts (
  user_id            uuid primary key references public.profiles(id) on delete cascade,
  organization_id    uuid,
  property_id        uuid,
  outlet_id          uuid,
  updated_at         timestamptz not null default now()
);
