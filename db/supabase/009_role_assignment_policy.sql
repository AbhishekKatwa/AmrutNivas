-- AMRUT NIVAAS · 009 — role-assignment policy and owner protection (Prompt #03 §29, §30)
--
-- What `assign_role` did before this file: prove the actor holds `role.assign`, prove the
-- role exists, prove the grantee is a member — and then accept ANY role, including
-- `PLATFORM_ADMIN`, including for the actor themself. `role.assign` is seeded on
-- HR_MANAGER (006), so an HR manager could have minted a platform administrator in their
-- own tenant. Nothing compared the actor's own authority with the authority being handed
-- out, which is the single question §29 asks.
--
-- `set_member_status` refused REMOVED on an owner row but not SUSPENDED, so a platform
-- admin could suspend a tenant's sole owner: no operable owner left, and no peer who can
-- undo it.
--
-- The policy is data, not code scattered through doors: two columns on `roles`.
--   * `seniority` — a ceiling. An actor may only grant roles at or below the most senior
--     role they themselves hold in that tenant (GLOBAL grants count everywhere).
--   * `owner_class` — the two roles that carry ownership of the tenant or the platform.
--     Only an owner (or the platform) may grant them, and a tenant-created role can never
--     have it, so a custom "Night Auditor" cannot become a back door to OWNER.
-- Refusing in the door is what makes §29 a control: a hidden button is not.

-- ------------------------------------------------------------------ the ladder

alter table public.roles
  add column if not exists seniority    integer not null default 50,
  add column if not exists owner_class  boolean not null default false;

do $$
begin
  alter table public.roles drop constraint if exists roles_seniority_range;
end;
$$;
alter table public.roles
  add constraint roles_seniority_range check (seniority between 1 and 100);

comment on column public.roles.seniority is
  'Grant ceiling: 1-100, higher is more powerful. An actor may only grant roles at or '
  'below the highest seniority they hold in the tenant (GLOBAL counts everywhere).';
comment on column public.roles.owner_class is
  'True only for the roles that own a tenant or the platform. Owner-class grants move '
  'through an owner or the platform, never through a delegated role.assign holder, and a '
  'tenant-created role is always false.';

-- The seeded system roles, in the order the product means them. A DEFAULT of 50 would
-- leave every role on the same rung, so the ladder is stated per role rather than
-- inherited: an unlisted new system role lands at 50 and reads as a deliberate choice.
update public.roles set seniority = v.seniority, owner_class = v.owner_class
  from (values
    ('PLATFORM_ADMIN',      100, true),
    ('ORG_OWNER',            90, true),
    ('ORG_ADMIN',            80, false),
    ('GENERAL_MANAGER',      70, false),
    ('PROPERTY_MANAGER',     60, false),
    ('FINANCE_MANAGER',      55, false),
    ('HR_MANAGER',           55, false),
    ('RESTAURANT_MANAGER',   50, false),
    ('STORE_MANAGER',        50, false),
    ('EVENT_MANAGER',        50, false),
    ('KITCHEN_MANAGER',      45, false),
    ('HOUSEKEEPING_MANAGER', 45, false),
    ('STAFF',                10, false)
  ) as v(name, seniority, owner_class)
 where public.roles.name = v.name and public.roles.is_system;

-- Self-check, same discipline as 006: a ladder that silently lost a rung is worse than
-- no ladder, because the doors would still look like they were comparing something.
do $$
declare
  n integer;
begin
  select count(*) into n from public.roles
   where is_system and seniority is null;
  perform app.require_valid(n = 0, 'NIVAAS_ROLE_SEED_INCOMPLETE');

  select count(*) into n from public.roles
   where owner_class and not is_system;
  perform app.require_valid(n = 0, 'NIVAAS_ROLE_SEED_INCOMPLETE');

  select count(*) into n from public.roles
   where is_system and name in ('ORG_OWNER','PLATFORM_ADMIN') and owner_class;
  perform app.require_valid(n = 2, 'NIVAAS_ROLE_SEED_INCOMPLETE');
end;
$$;

-- ----------------------------------------------------------------- assign_role

-- The actor's ceiling: the most senior live grant they hold in this tenant, counting a
-- GLOBAL grant wherever it applies. 0 for someone with nothing live, which is the right
-- answer for a revoked or suspended actor — 008 made revoked grants stop authorizing, and
-- a ceiling derived the same way cannot be higher than the authority that earned it.
create or replace function app.grant_ceiling(p_user uuid, p_organization uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(max(r.seniority), 0)
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
   where ur.user_id = p_user
     and ur.revoked_at is null
     and (ur.organization_id = p_organization or r.scope_level = 'GLOBAL');
$$;

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
  v_actor     uuid := app.require_session();
  v_role      record;
  v_ceiling   integer;
  v_target    integer;
  v_grant     uuid;
begin
  perform app.require_permission('role.assign', p_organization);
  perform app.require_active_organization(p_organization);

  select * into v_role from public.roles
   where name = upper(p_role) and status = 'ACTIVE'
     and (is_system or organization_id = p_organization);
  perform app.require_valid(v_role.id is not null, 'NIVAAS_ROLE_NOT_FOUND');

  -- §29: no self-elevation, ever. Adding a role to your own account is how a delegated
  -- admin becomes an owner, and there is no legitimate flow for it at this stage — an
  -- owner is created by create_organization or moved by transfer_ownership, and a new
  -- member's role arrives through an invitation accepted by that person (which audits the
  -- inviting actor, not the grantee). Refusing outright is the boring, checkable rule.
  perform app.require_valid(p_user <> v_actor, 'NIVAAS_SELF_ASSIGN_DENIED');

  -- §29: you cannot grant what you do not hold. A ceiling of 0 also refuses a suspended
  -- or revoked actor, whose grants 008 stopped honouring.
  v_ceiling := app.grant_ceiling(v_actor, p_organization);
  v_target  := v_role.seniority;
  perform app.require_valid(v_target <= v_ceiling, 'NIVAAS_ROLE_ABOVE_AUTHORITY');

  -- §29/§30: ownership-class authority moves only through someone who already holds it.
  -- A delegated `role.assign` holder cannot mint an ORG_OWNER, and a custom role can
  -- never be owner-class (011 forbids the column on tenant roles), so this wall has no
  -- gap around it.
  if v_role.owner_class then
    perform app.require_valid(
      exists (select 1 from public.organization_memberships o
               where o.organization_id = p_organization and o.user_id = v_actor and o.is_owner)
        or app.is_platform_admin(v_actor),
      'NIVAAS_OWNER_ONLY');
  end if;

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
  -- half-built — SECURITY.md records department scoping as the deliberate open edge.
  perform app.require_valid(
    v_role.scope_level <> 'DEPARTMENT', 'NIVAAS_DEPARTMENT_GRANTS_UNSUPPORTED');

  if v_role.scope_level = 'PROPERTY' then
    perform app.require_valid(p_property is not null, 'NIVAAS_SCOPE_MISMATCH');
  elsif v_role.scope_level = 'OUTLET' then
    perform app.require_valid(p_outlet is not null, 'NIVAAS_SCOPE_MISMATCH');
  end if;

  -- §14/§15/§16: a site-scoped grant travels with site breadth (below), so granting a
  -- role at a property the actor cannot reach would hand out ACCESS, not just a title.
  -- This is the resource-scope half of privilege escalation.
  if v_role.scope_level = 'PROPERTY' then
    perform app.require_valid(
      app.can_access_property(v_actor, p_property), 'NIVAAS_GRANT_OUTSIDE_SCOPE');
  elsif v_role.scope_level = 'OUTLET' then
    perform app.require_valid(
      app.can_access_outlet(v_actor, p_outlet), 'NIVAAS_GRANT_OUTSIDE_SCOPE');
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

  -- §31/§34: the trail for a grant names the ladder it was checked against, so a review
  -- can see why an authority was allowed — without recording anything secret.
  perform app.audit('role_assigned', 'user_role', v_grant,
    p_organization := p_organization, p_property := p_property, p_outlet := p_outlet,
    p_reason := p_reason,
    p_after := jsonb_build_object('user', p_user, 'role', v_role.name),
    p_metadata := jsonb_build_object('actor_ceiling', v_ceiling, 'granted_seniority', v_target));
  perform app.audit('access_changed', 'user_role', v_grant,
    p_organization := p_organization, p_reason := p_reason,
    p_metadata := jsonb_build_object('effect', 'granted', 'role', v_role.name));

  return jsonb_build_object('grantId', v_grant, 'role', v_role.name,
                            'scope', v_role.scope_level);
end;
$$;

-- ------------------------------------------------------------------ revoke_role

create or replace function public.revoke_role(p_grant uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before    jsonb;
  v_org       uuid;
  v_grantee   uuid;
  v_role_name text;
  v_seniority integer;
  v_owner     boolean;
  v_ceiling   integer;
begin
  perform app.require_session();
  perform app.require_reason(p_reason);

  select to_jsonb(ur) into v_before from public.user_roles ur where ur.id = p_grant;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');
  v_org     := (v_before->>'organization_id')::uuid;
  v_grantee := (v_before->>'user_id')::uuid;
  perform app.require_permission('role.assign', v_org);
  perform app.require_valid(v_before->>'revoked_at' is null, 'NIVAAS_ALREADY_REVOKED');

  -- Taking authority away is the same ladder in the other direction: a manager may not
  -- strip a role senior to their own, which is otherwise how a delegated admin disables
  -- the people above them.
  select r.name, r.seniority, r.owner_class
    into v_role_name, v_seniority, v_owner
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
   where ur.id = p_grant;
  v_ceiling := app.grant_ceiling(app.current_user_id(), v_org);
  perform app.require_valid(v_seniority <= v_ceiling, 'NIVAAS_ROLE_ABOVE_AUTHORITY');

  -- §30: the owner's owner-class grant is what makes the `is_owner` row operable.
  -- Revoking it would leave a tenant whose owner holds no owner permissions — the same
  -- ownerless outcome as suspending them, reached by a different door.
  if v_owner then
    perform app.require_valid(
      not exists (select 1 from public.organization_memberships m
                   where m.organization_id = v_org and m.user_id = v_grantee and m.is_owner),
      'NIVAAS_OWNER_MUST_TRANSFER');
  end if;

  update public.user_roles set revoked_at = now() where id = p_grant;

  perform app.audit('access_changed', 'user_role', p_grant,
    p_organization := v_org, p_before := v_before,
    p_after := jsonb_build_object('revoked_at', now()), p_reason := p_reason,
    p_metadata := jsonb_build_object('role', v_role_name, 'actor_ceiling', v_ceiling));
  return jsonb_build_object('grantId', p_grant, 'revoked', true);
end;
$$;

-- --------------------------------------------------------------- set_member_status

-- Only the owner-protection block changes: §30 says the last OWNER cannot be removed,
-- suspended or downgraded without a controlled transfer. `transfer_ownership` is that
-- transfer, it is owner-or-platform only, and the 002 partial unique index makes two
-- owners impossible — so refusing here has a documented way out rather than being a wall
-- with no door.
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
  -- §30: the owner row is not an ordinary membership. Both retired statuses are refused,
  -- not just REMOVED — a suspended sole owner is as ownerless as a removed one, and the
  -- platform admin who did it has no peer left to undo it.
  if (v_before->>'is_owner')::boolean then
    perform app.require_valid(p_status = 'ACTIVE', 'NIVAAS_OWNER_MUST_TRANSFER');
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
  -- some future bug could re-honour. Since 008 the bug is not hypothetical: the doors
  -- now read `revoked_at`, so this is what actually strips authority.
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

-- ---------------------------------------------------------------------- grants

-- The ceiling helper is called from doors (which are SECURITY DEFINER) and from the
-- verifier; it is not part of the policy surface, but 005's grant block names the guards
-- it does call, so this follows the same convention. `public` stays the only HTTP-
-- reachable schema: an `app` helper cannot be invoked by a client whatever it is granted.
grant execute on function app.grant_ceiling(uuid, uuid) to authenticated, service_role;
