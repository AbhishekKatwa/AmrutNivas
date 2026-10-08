-- 045: Enterprise Multi-Property Foundation
-- Property groups, extended property status/types, module configuration,
-- enterprise permissions and doors.
-- Enterprise sits ABOVE operational modules — it aggregates, never replaces.
-- All tables are org-scoped under RLS.
-- Writes through security-definer doors; reads under RLS.

-- =====================================================================
-- 1. EXTEND PROPERTY TYPE AND STATUS
-- =====================================================================

-- Add MIXED_HOSPITALITY to property_type CHECK.
-- The existing list covers single-format sites; a property that operates
-- multiple formats (e.g. hotel + restaurant + banquet) needs its own type.
ALTER TABLE public.properties
  DROP CONSTRAINT IF EXISTS properties_property_type_check;

ALTER TABLE public.properties
  ADD CONSTRAINT properties_property_type_check
  CHECK (property_type IN (
    'HOTEL','LODGE','RESORT','HOSTEL','RESTAURANT','CAFE','CLOUD_KITCHEN',
    'BANQUET','CONVENTION_CENTER','RESTAURANT_HOTEL','MIXED_HOSPITALITY','OTHER'
  ));

-- Extend property status. The existing three (ACTIVE, INACTIVE, ARCHIVED)
-- are joined by TEMPORARILY_CLOSED and COMING_SOON for the enterprise view.
-- INACTIVE is retained for backward compatibility but new writes should use
-- the more specific statuses.
ALTER TABLE public.properties
  DROP CONSTRAINT IF EXISTS properties_status_check;

ALTER TABLE public.properties
  ADD CONSTRAINT properties_status_check
  CHECK (status IN (
    'ACTIVE','INACTIVE','TEMPORARILY_CLOSED','COMING_SOON','SUSPENDED','ARCHIVED'
  ));

-- =====================================================================
-- 2. PROPERTY GROUPS
-- =====================================================================

-- A property group is an optional organizational layer between the organization
-- and its properties. Not every organization uses them; a single-property
-- restaurant never needs one. A multi-property group uses them to cluster
-- sites by region, format, or division.
CREATE TABLE IF NOT EXISTS public.property_groups (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,

  name             text not null check (char_length(name) between 2 and 120),
  code             text not null check (code ~ '^[A-Z0-9][A-Z0-9-]{1,19}$'),
  description      text,

  status           text not null default 'ACTIVE'
                   check (status in ('ACTIVE','INACTIVE','ARCHIVED')),

  version          integer not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  unique (organization_id, code),
  unique (organization_id, name)
);

comment on table public.property_groups is
  'Optional clustering of properties within an organization (region, division, format).';

create index if not exists property_groups_org_idx on public.property_groups (organization_id);

drop trigger if exists property_groups_touch on public.property_groups;
create trigger property_groups_touch before update on public.property_groups
  for each row execute function app.touch_updated_at();

-- A property can belong to at most one group. NULL means ungrouped.
-- This is a soft reference (no FK) because the group is optional and the
-- property must remain creatable without one.
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS property_group_id uuid
  REFERENCES public.property_groups(id) ON DELETE SET NULL;

create index if not exists properties_group_idx on public.properties (property_group_id);

-- =====================================================================
-- 3. PROPERTY MODULE CONFIGURATION
-- =====================================================================

-- Different properties may need different modules enabled. A standalone
-- restaurant does not need Hotel PMS; a hotel may not need the restaurant POS.
-- This table controls module availability per property. A missing row means
-- the module uses the organization default (typically enabled).
--
-- Module disabling does NOT delete data — it controls visibility/availability.
-- Historical transactions remain queryable through enterprise views.

CREATE TABLE IF NOT EXISTS public.property_module_config (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  property_id      uuid not null references public.properties(id) on delete restrict,

  module           text not null check (module in (
                     'RESTAURANT','HOTEL','INVENTORY','PROCUREMENT','FINANCE',
                     'CRM','EVENTS','HR','COMMERCE'
                   )),
  enabled          boolean not null default true,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  unique (property_id, module)
);

comment on table public.property_module_config is
  'Per-property module enablement. Missing row = use org default (enabled). Disabling never deletes data.';

create index if not exists property_module_config_property_idx
  on public.property_module_config (property_id);
create index if not exists property_module_config_org_idx
  on public.property_module_config (organization_id);

drop trigger if exists property_module_config_touch on public.property_module_config;
create trigger property_module_config_touch before update on public.property_module_config
  for each row execute function app.touch_updated_at();

-- =====================================================================
-- 4. RLS POLICIES
-- =====================================================================

-- Property groups follow the same org-scoped pattern as properties.
ALTER TABLE public.property_groups ENABLE ROW LEVEL SECURITY;

drop policy if exists property_groups_select on public.property_groups;
create policy property_groups_select on public.property_groups
  for select to authenticated
  using (organization_id = app.current_organization_id());

drop policy if exists property_groups_write on public.property_groups;
create policy property_groups_write on public.property_groups
  for all to authenticated
  with check (
    organization_id = app.current_organization_id()
    and app.has_permission(app.current_user_id(), app.current_organization_id(), 'enterprise.group.manage')
  );

-- Property module config: org-scoped, writes need enterprise.property.manage.
ALTER TABLE public.property_module_config ENABLE ROW LEVEL SECURITY;

drop policy if exists property_module_config_select on public.property_module_config;
create policy property_module_config_select on public.property_module_config
  for select to authenticated
  using (organization_id = app.current_organization_id());

drop policy if exists property_module_config_write on public.property_module_config;
create policy property_module_config_write on public.property_module_config
  for all to authenticated
  with check (
    organization_id = app.current_organization_id()
    and app.has_permission(app.current_user_id(), app.current_organization_id(), 'enterprise.property.manage')
  );

-- =====================================================================
-- 5. ENTERPRISE PERMISSIONS
-- =====================================================================

-- Enterprise permissions follow the existing domain.verb pattern.
-- These are organization-level capabilities that control access to the
-- enterprise aggregation layer (not operational modules).

DO $$ DECLARE
  perms text[] := array[
    'enterprise.view', 'enterprise.dashboard.view', 'enterprise.reporting.view', 'enterprise.reporting.export',
    'enterprise.property.view', 'enterprise.property.manage',
    'enterprise.group.view', 'enterprise.group.manage',
    'enterprise.alerts.view', 'enterprise.global_search.view',
    'enterprise.master.view', 'enterprise.master.manage',
    'enterprise.module_config.view', 'enterprise.module_config.manage'
  ];
  owner_only text[] := array[
    'enterprise.property.manage', 'enterprise.group.manage',
    'enterprise.master.manage', 'enterprise.module_config.manage'
  ];
  pm_perms text[] := array[
    'enterprise.property.view', 'enterprise.alerts.view', 'enterprise.global_search.view'
  ];
  p text;
  v_owner uuid;
  v_pm uuid;
BEGIN
  SELECT id INTO v_owner FROM public.roles WHERE name = 'ORG_OWNER' AND is_system;
  SELECT id INTO v_pm FROM public.roles WHERE name = 'PROPERTY_MANAGER' AND is_system;

  FOREACH p IN ARRAY perms LOOP
    INSERT INTO public.role_permissions (role_id, permission) VALUES (v_owner, p) ON CONFLICT DO NOTHING;
  END LOOP;

  FOREACH p IN ARRAY pm_perms LOOP
    INSERT INTO public.role_permissions (role_id, permission) VALUES (v_pm, p) ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- =====================================================================
-- 6. ENTERPRISE DOORS
-- =====================================================================

-- Property group CRUD
create or replace function public.create_property_group(
  p_organization uuid,
  p_name text,
  p_code text,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
begin
  if not app.has_permission(app.current_user_id(), app.current_organization_id(), 'enterprise.group.manage') then
    raise exception 'NIVAAS_PERMISSION_DENIED';
  end if;

  insert into public.property_groups (organization_id, name, code, description)
  values (p_organization, p_name, p_code, p_description)
  returning id into v_group_id;

  perform public.record_audit_event(
    p_organization, null, null, null,
    'PROPERTY_GROUP_CREATED',
    jsonb_build_object('group_id', v_group_id, 'name', p_name, 'code', p_code),
    'SUCCESS'
  );

  return v_group_id;
end;
$$;

create or replace function public.update_property_group(
  p_group_id uuid,
  p_name text default null,
  p_description text default null,
  p_status text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  select organization_id into v_org_id
  from public.property_groups
  where id = p_group_id;

  if v_org_id is null then
    raise exception 'NIVAAS_NOT_FOUND';
  end if;

  if not app.has_permission(app.current_user_id(), app.current_organization_id(), 'enterprise.group.manage') then
    raise exception 'NIVAAS_PERMISSION_DENIED';
  end if;

  update public.property_groups
  set
    name = coalesce(p_name, name),
    description = coalesce(p_description, description),
    status = coalesce(p_status, status),
    version = version + 1
  where id = p_group_id;

  perform public.record_audit_event(
    v_org_id, null, null, null,
    'PROPERTY_GROUP_UPDATED',
    jsonb_build_object('group_id', p_group_id),
    'SUCCESS'
  );
end;
$$;

create or replace function public.set_property_group(
  p_property_id uuid,
  p_group_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_expected_org uuid;
begin
  select organization_id into v_org_id
  from public.properties
  where id = p_property_id;

  if v_org_id is null then
    raise exception 'NIVAAS_NOT_FOUND';
  end if;

  if not app.has_permission(app.current_user_id(), app.current_organization_id(), 'enterprise.property.manage') then
    raise exception 'NIVAAS_PERMISSION_DENIED';
  end if;

  -- If assigning to a group, verify the group belongs to the same org.
  if p_group_id is not null then
    select organization_id into v_expected_org
    from public.property_groups
    where id = p_group_id;

    if v_expected_org is null then
      raise exception 'NIVAAS_NOT_FOUND';
    end if;

    if v_expected_org <> v_org_id then
      raise exception 'NIVAAS_SCOPE_MISMATCH';
    end if;
  end if;

  update public.properties
  set property_group_id = p_group_id,
      version = version + 1
  where id = p_property_id;

  perform public.record_audit_event(
    v_org_id, p_property_id, null, null,
    'PROPERTY_ACCESS_CHANGED',
    jsonb_build_object('property_id', p_property_id, 'group_id', p_group_id),
    'SUCCESS'
  );
end;
$$;

-- Module configuration
create or replace function public.set_property_module(
  p_property_id uuid,
  p_module text,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_action text;
begin
  select organization_id into v_org_id
  from public.properties
  where id = p_property_id;

  if v_org_id is null then
    raise exception 'NIVAAS_NOT_FOUND';
  end if;

  if not app.has_permission(app.current_user_id(), app.current_organization_id(), 'enterprise.module_config.manage') then
    raise exception 'NIVAAS_PERMISSION_DENIED';
  end if;

  insert into public.property_module_config (organization_id, property_id, module, enabled)
  values (v_org_id, p_property_id, p_module, p_enabled)
  on conflict (property_id, module)
  do update set enabled = p_enabled, updated_at = now();

  v_action = case when p_enabled then 'MODULE_ENABLED' else 'MODULE_DISABLED' end;

  perform public.record_audit_event(
    v_org_id, p_property_id, null, null,
    v_action,
    jsonb_build_object('module', p_module, 'enabled', p_enabled),
    'SUCCESS'
  );
end;
$$;

-- Grant execute on enterprise doors
grant execute on function public.create_property_group to authenticated;
grant execute on function public.update_property_group to authenticated;
grant execute on function public.set_property_group to authenticated;
grant execute on function public.set_property_module to authenticated;
