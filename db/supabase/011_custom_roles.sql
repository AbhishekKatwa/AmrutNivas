-- AMRUT NIVAAS · 011 — tenant custom roles (Prompt #03 §10, §29)
--
-- §10 asks for a "Night Auditor" role a tenant can define: a set of permissions, scoped,
-- tenant-owned, and never able to reach owner authority. The storage for that has existed
-- since 002 — `roles.organization_id` is nullable with an `is_system` flag, and the
-- consistency CHECK already forces a tenant role to name its tenant — but there was no
-- door, so the only way in was a hand-written SQL insert. This file adds the doors, and
-- fixes the one thing in 002 that would have broken the first two tenants who used them:
--
--   `roles.name` was GLOBALY unique. Amrut Nivaas and the hotel group down the road could
--   not both have a role called NIGHT_AUDITOR, and the second one would have been refused
--   with a unique-violation it could not explain. §10 says organization-created roles are
--   tenant-scoped, so uniqueness is too.
--
-- The anti-escalation property is the reason these doors exist at all: a role a tenant
-- invents must not be able to exceed the person who invented it. Two rules enforce that,
-- and both are checked server-side:
--   1. every permission on the role must be one the ACTOR holds in that tenant
--      (§29: "cannot grant permissions they themselves cannot grant");
--   2. the role's seniority is pinned to the creator's own ceiling, so it can be granted
--      by their peers and never by anyone junior to them — and a role cannot bootstrap its
--      way to authority by being handed out sideways.
-- `owner_class` is always false for a tenant role, so no custom role can ever mint an
-- owner or a platform administrator.

-- ------------------------------------------------------------------ name scope

-- 002's column-level `unique` created this constraint; replacing it with two partial
-- indexes makes "unique where it has to be" explicit: one namespace for the platform's
-- system roles, one per tenant for theirs.
do $$
begin
  alter table public.roles drop constraint if exists roles_name_key;
end;
$$;

create unique index if not exists roles_system_name_idx
  on public.roles (name)
  where organization_id is null;
create unique index if not exists roles_tenant_name_idx
  on public.roles (organization_id, name)
  where organization_id is not null;

-- ---------------------------------------------------------------- the two tokens

-- §29 needs a permission to create a role that is separate from the permission to assign
-- one, or "may I hand out roles" and "may I invent authority" are the same answer. The
-- catalogue is the distinct set of `role_permissions.permission` (006 §12's note: the
-- matrix IS the catalogue), so a token exists once some role holds it — these two go to
-- the tenant's owner and administrator, and reach a platform admin through the whole-
-- catalogue arm of `my_permissions`.
do $$
declare
  v_owner uuid;
  v_admin uuid;
begin
  select id into v_owner from public.roles where name = 'ORG_OWNER' and is_system;
  select id into v_admin from public.roles where name = 'ORG_ADMIN' and is_system;
  perform app.require_valid(v_owner is not null and v_admin is not null,
                            'NIVAAS_ROLE_SEED_INCOMPLETE');

  insert into public.role_permissions (role_id, permission)
  values (v_owner, 'role.create'), (v_owner, 'role.edit'),
         (v_admin, 'role.create'), (v_admin, 'role.edit')
  on conflict (role_id, permission) do nothing;

  -- Both tokens must exist in the catalogue before any door checks them, or a typo here
  -- would look like a permission nobody can ever hold.
  perform app.require_valid(
    (select count(distinct permission) from public.role_permissions
      where permission in ('role.create','role.edit')) = 2,
    'NIVAAS_PERMISSION_SEED_BROKEN');
end;
$$;

-- --------------------------------------------------------------- permission subset

-- The one predicate both role doors need: is every requested token (a) real and (b) held
-- by the actor in this tenant. Returns the first offender so the refusal can name the
-- shape of the problem without naming someone else's authority.
create or replace function app.ungrantable_permission(
  p_actor uuid,
  p_organization uuid,
  p_permissions text[]
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p
    from unnest(coalesce(p_permissions, '{}'::text[])) as p
   where not exists (select 1 from public.role_permissions rp where rp.permission = p)
      or not app.has_permission(p_actor, p_organization, p)
   limit 1;
$$;

-- ------------------------------------------------------------------ id visibility

-- The role doors take a role ID, which is an opaque handle into someone else's tenant.
-- Answering `NIVAAS_ACCESS_DENIED` for one proves the row exists to a person who cannot
-- see it (§40's enumeration rule). So the tenant check comes first, and its failure is
-- reported as the same `NIVAAS_NOT_FOUND` an unknown ID gets: outside a tenant, its roles
-- do not exist. A real member who lacks `role.edit` still gets the honest 403.
create or replace function app.require_tenant_visibility(p_organization uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_valid(
    app.member_of(app.current_user_id(), p_organization)
      or app.is_platform_admin(app.current_user_id()),
    'NIVAAS_NOT_FOUND');
end;
$$;

-- ------------------------------------------------------------------ create_role

create or replace function public.create_role(
  p_organization uuid,
  p_name text,
  p_display_name text,
  p_description text,
  p_scope_level text,
  p_permissions text[],
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid := app.require_session();
  v_ceiling integer;
  v_bad     text;
  v_id      uuid;
begin
  perform app.require_permission('role.create', p_organization);
  perform app.require_active_organization(p_organization);
  perform app.require_reason(p_reason);

  perform app.require_valid(
    p_name ~ '^[A-Z][A-Z0-9_]{2,39}$'
      and nullif(btrim(coalesce(p_display_name, '')), '') is not null,
    'NIVAAS_INVALID_NAME');
  -- A tenant role may not take a system role's name in either direction: the platform
  -- namespace is not a tenant's to reuse, and a collision would be a 409 with no
  -- explanation (§39).
  perform app.require_valid(
    not exists (select 1 from public.roles r
                 where r.name = upper(p_name) and r.organization_id is null),
    'NIVAAS_ROLE_NAME_TAKEN');

  -- §10/§17: a tenant role can reach an organization, a site or an outlet. GLOBAL is the
  -- platform's namespace and DEPARTMENT has no resolution path (005 refuses grants at it),
  -- so accepting either would create a role that means nothing or means everything.
  perform app.require_valid(
    p_scope_level in ('ORGANIZATION','PROPERTY','OUTLET'), 'NIVAAS_ROLE_SCOPE_FORBIDDEN');

  v_ceiling := app.grant_ceiling(v_actor, p_organization);
  -- A role with no live grants above it cannot be handed out by anyone, including its
  -- creator. This is a broken ladder, not a valid draft.
  perform app.require_valid(v_ceiling > 0, 'NIVAAS_ROLE_ABOVE_AUTHORITY');

  perform app.require_valid(
    coalesce(array_length(p_permissions, 1), 0) > 0, 'NIVAAS_EMPTY_SELECTION');
  v_bad := app.ungrantable_permission(v_actor, p_organization, p_permissions);
  perform app.require_valid(v_bad is null, 'NIVAAS_ROLE_ABOVE_AUTHORITY');

  -- The index is the guarantee; the name pre-check above is only there to give the common
  -- case a readable code. Whichever fires, the client sees NIVAAS_ROLE_NAME_TAKEN — §39's
  -- structured errors, not a constraint name.
  begin
    insert into public.roles
      (name, display_name, description, scope_level, organization_id,
       is_system, seniority, owner_class, status)
    values (
      upper(p_name), btrim(p_display_name),
      nullif(btrim(coalesce(p_description, '')), ''),
      p_scope_level, p_organization,
      false, v_ceiling, false, 'ACTIVE')
    returning id into v_id;
  exception when unique_violation then
    if sqlerrm like '%roles_tenant_name_idx%' or sqlerrm like '%roles_system_name_idx%' then
      raise exception 'NIVAAS_ROLE_NAME_TAKEN';
    end if;
    raise;
  end;

  insert into public.role_permissions (role_id, permission)
  select v_id, p from unnest(p_permissions) as p;

  -- §31/§34: creating authority is a sensitive action — permission, validation,
  -- mandatory reason, and the whole permission list in the trail.
  perform app.audit('role_created', 'role', v_id,
    p_organization := p_organization, p_reason := p_reason,
    p_after := jsonb_build_object('name', upper(p_name), 'scope', p_scope_level,
                                  'permissions', (select array_agg(p order by p)
                                                    from unnest(p_permissions) p)),
    p_metadata := jsonb_build_object('actor_ceiling', v_ceiling));

  return jsonb_build_object('roleId', v_id, 'name', upper(p_name),
                            'scope', p_scope_level,
                            'permissions', (select jsonb_agg(p order by p)
                                             from unnest(p_permissions) p));
end;
$$;

-- ------------------------------------------------------------------ update_role

create or replace function public.update_role(
  p_role uuid,
  p_display_name text,
  p_description text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := app.require_session();
  v_before jsonb;
  v_org    uuid;
begin
  perform app.require_reason(p_reason);
  select to_jsonb(r) into v_before from public.roles r where r.id = p_role;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');
  -- A system role's label is product copy, not tenant data: editing it in one tenant
  -- would rewrite it everywhere.
  perform app.require_valid(
    not (v_before->>'is_system')::boolean, 'NIVAAS_SYSTEM_ROLE_PROTECTED');
  v_org := (v_before->>'organization_id')::uuid;
  perform app.require_valid(v_org is not null, 'NIVAAS_SYSTEM_ROLE_PROTECTED');
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('role.edit', v_org);

  perform app.require_valid(
    nullif(btrim(coalesce(p_display_name, '')), '') is not null, 'NIVAAS_INVALID_NAME');

  update public.roles
     set display_name = btrim(p_display_name),
         description  = nullif(btrim(coalesce(p_description, '')), '')
   where id = p_role;

  perform app.audit('role_updated', 'role', p_role,
    p_organization := v_org, p_before := v_before,
    p_after := (select to_jsonb(r) from public.roles r where r.id = p_role),
    p_reason := p_reason);
  return jsonb_build_object('roleId', p_role, 'updated', true);
end;
$$;

-- ---------------------------------------------------------- set_role_permissions

-- Replace-whole-set, the same semantics `set_property_access` uses: a partial diff is how
-- a stale client re-grants something that was withdrawn. Every rule from create_role still
-- applies, including the subset check — editing a role is how an administrator widens one,
-- and widening past your own authority is the escalation this file exists to stop.
create or replace function public.set_role_permissions(
  p_role uuid,
  p_permissions text[],
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid := app.require_session();
  v_role    record;
  v_org     uuid;
  v_before  jsonb;
  v_bad     text;
  v_ceiling integer;
begin
  perform app.require_reason(p_reason);
  select * into v_role from public.roles where id = p_role;
  perform app.require_valid(v_role.id is not null, 'NIVAAS_NOT_FOUND');
  perform app.require_valid(not v_role.is_system, 'NIVAAS_SYSTEM_ROLE_PROTECTED');
  v_org := v_role.organization_id;
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('role.edit', v_org);
  perform app.require_active_organization(v_org);

  select jsonb_agg(p order by p) into v_before
    from public.role_permissions rp, unnest(array[rp.permission]) as p
   where rp.role_id = p_role;

  perform app.require_valid(
    coalesce(array_length(p_permissions, 1), 0) > 0, 'NIVAAS_EMPTY_SELECTION');
  v_bad := app.ungrantable_permission(v_actor, v_org, p_permissions);
  perform app.require_valid(v_bad is null, 'NIVAAS_ROLE_ABOVE_AUTHORITY');

  -- A role may not be re-seniorised: its ceiling stays where its creator put it, so
  -- editing permissions cannot be used to promote a role above its editor.
  v_ceiling := v_role.seniority;

  delete from public.role_permissions where role_id = p_role;
  insert into public.role_permissions (role_id, permission)
    select p_role, p from unnest(p_permissions) as p;

  perform app.audit('role_permissions_changed', 'role', p_role,
    p_organization := v_org,
    p_before := jsonb_build_object('permissions', v_before),
    p_after := jsonb_build_object('permissions',
      (select jsonb_agg(p order by p) from (select unnest(p_permissions) as p) t)),
    p_reason := p_reason,
    p_metadata := jsonb_build_object('seniority', v_ceiling));
  return jsonb_build_object('roleId', p_role,
    'permissions', (select jsonb_agg(rp.permission order by rp.permission)
                      from public.role_permissions rp where rp.role_id = p_role));
end;
$$;

-- ---------------------------------------------------------------- set_role_status

-- Retiring a role, never deleting it: `user_roles` rows reference it and §53 keeps
-- history readable. An INACTIVE role is already invisible to `assign_role` (it selects
-- `status = 'ACTIVE'`), so retiring one stops future grants without touching the ones
-- that exist — which is what makes the audit trail honest about who held what when.
create or replace function public.set_role_status(
  p_role uuid,
  p_status text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := app.require_session();
  v_before jsonb;
  v_org    uuid;
begin
  perform app.require_reason(p_reason);
  perform app.require_valid(p_status in ('ACTIVE','INACTIVE'), 'NIVAAS_INVALID_STATUS');
  select to_jsonb(r) into v_before from public.roles r where r.id = p_role;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');
  perform app.require_valid(not (v_before->>'is_system')::boolean,
                            'NIVAAS_SYSTEM_ROLE_PROTECTED');
  v_org := (v_before->>'organization_id')::uuid;
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('role.edit', v_org);

  update public.roles set status = p_status where id = p_role;

  perform app.audit('role_status_changed', 'role', p_role,
    p_organization := v_org, p_before := v_before,
    p_after := jsonb_build_object('status', p_status), p_reason := p_reason);
  return jsonb_build_object('roleId', p_role, 'status', p_status);
end;
$$;

-- ---------------------------------------------------------------------- grants

grant execute on function app.ungrantable_permission(uuid, uuid, text[])
  to authenticated, service_role;
grant execute on function public.create_role(uuid, text, text, text, text, text[], text)
  to authenticated, service_role;
grant execute on function public.update_role(uuid, text, text, text)
  to authenticated, service_role;
grant execute on function public.set_role_permissions(uuid, text[], text)
  to authenticated, service_role;
grant execute on function public.set_role_status(uuid, text, text)
  to authenticated, service_role;

-- Self-check: a tenant role that could reach owner authority would undo this whole file.
do $$
begin
  perform app.require_valid(
    not exists (select 1 from public.roles where organization_id is not null
                  and (owner_class or is_system or seniority > 100)),
    'NIVAAS_MIGRATION_GAP');
end;
$$;
