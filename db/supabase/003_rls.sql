-- ============================================================================
-- AMRUT NIVAAS — Prompt #02, migration 003: Row Level Security
--
-- This is the tenant boundary. Prompt #02 §46 forbids "SELECT * FROM outlets
-- WHERE id = ?", and §25 forbids trusting a frontend check — so the rule lives
-- here, where a query that forgot a predicate is refused by the server rather
-- than merely returning too many rows.
--
-- Two doctrines, applied consistently:
--
--  1. READS are governed by the policies below. Every policy resolves through an
--     app.* helper, so a table can never be readable by a rule that diverged
--     from the authorization the write doors use.
--  2. WRITES are not governed by policies at all. `authenticated` holds no
--     insert/update/delete grant on any table; every mutation goes through a
--     SECURITY DEFINER RPC in 005 that re-proves membership, scope and status
--     before it touches a row. That is why 005 can be the only place business
--     rules are checked, and why a client cannot craft a row that bypasses them.
--
-- `service_role` bypasses RLS by design (it is a server-only secret and must
-- never be reachable from src/, because a Vite bundle ships every client import
-- to the browser). `anon` gets nothing at all: an unauthenticated visitor has no
-- tenant, so there is no correct policy for them.
--
-- Note on the `to ... from` revokes: Postgres grants a new table's privileges to
-- `PUBLIC`, which includes `anon`. Revoking from PUBLIC is therefore mandatory,
-- not cosmetic, and it is listed for every table rather than assumed once.
-- ============================================================================

-- ------------------------------------------------------------------ enable

alter table public.organizations              enable row level security;
alter table public.properties                 enable row level security;
alter table public.outlets                    enable row level security;
alter table public.departments                enable row level security;
alter table public.profiles                   enable row level security;
alter table public.organization_memberships   enable row level security;
alter table public.roles                      enable row level security;
alter table public.role_permissions           enable row level security;
alter table public.user_roles                 enable row level security;
alter table public.membership_property_access enable row level security;
alter table public.membership_outlet_access   enable row level security;
alter table public.invitations                enable row level security;
alter table public.user_active_contexts       enable row level security;

-- ------------------------------------------------------------ grants (read-only)

-- One block, deliberately repetitive: a table missing from here simply cannot be
-- read, which is the failure direction we want. Review gate: any new
-- company/tenant-scoped table must appear in this file AND above (the completeness
-- lesson from the donor's RLS matrix).
grant select on public.organizations, public.properties, public.outlets,
  public.departments, public.profiles, public.organization_memberships,
  public.roles, public.role_permissions, public.user_roles,
  public.membership_property_access, public.membership_outlet_access,
  public.invitations, public.user_active_contexts
  to authenticated, service_role;

revoke all on public.organizations, public.properties, public.outlets,
  public.departments, public.profiles, public.organization_memberships,
  public.roles, public.role_permissions, public.user_roles,
  public.membership_property_access, public.membership_outlet_access,
  public.invitations, public.user_active_contexts
  from anon;

revoke insert, update, delete, truncate
  on public.organizations, public.properties, public.outlets,
     public.departments, public.profiles, public.organization_memberships,
     public.roles, public.role_permissions, public.user_roles,
     public.membership_property_access, public.membership_outlet_access,
     public.invitations, public.user_active_contexts
  from authenticated;

-- The helpers the policies below call must be callable by the role that owns the
-- session. Their bodies run as their owner, so this grants no extra reach.
grant execute on function
  app.current_user_id(),
  app.member_of(uuid, uuid), app.is_platform_admin(uuid),
  app.organization_is_active(uuid), app.can_access_property(uuid, uuid),
  app.can_access_outlet(uuid, uuid), app.can_see_organization(uuid, uuid),
  app.has_permission(uuid, uuid, text, uuid, uuid)
  to authenticated, service_role;

-- ----------------------------------------------------------------- organizations

-- A tenant row is visible only to its own members and to the platform. Archived
-- stays visible: a group that closed still needs its history readable (§41), and
-- the archive is enforced by the write doors, not by hiding rows.
drop policy if exists organizations_member_read on public.organizations;
create policy organizations_member_read on public.organizations
  for select
  to authenticated
  using (app.can_see_organization(app.current_user_id(), id));

-- -------------------------------------------------------------------- properties

drop policy if exists properties_access_read on public.properties;
create policy properties_access_read on public.properties
  for select
  to authenticated
  using (app.can_access_property(app.current_user_id(), id));

-- ----------------------------------------------------------------------- outlets

-- Outlet reach is strictly narrower than property reach: holding a property does
-- not silently expose every outlet inside it (§20, §54).
drop policy if exists outlets_access_read on public.outlets;
create policy outlets_access_read on public.outlets
  for select
  to authenticated
  using (app.can_access_outlet(app.current_user_id(), id));

-- ------------------------------------------------------------------ departments

-- Departments belong to a property or an outlet (§14). The predicate mirrors that
-- optionality: a department hanging off an outlet is only visible through that
-- outlet, never through a sibling outlet that shares the property.
drop policy if exists departments_access_read on public.departments;
create policy departments_access_read on public.departments
  for select
  to authenticated
  using (
    app.can_access_property(app.current_user_id(), property_id)
    and (
      outlet_id is null
      or app.can_access_outlet(app.current_user_id(), outlet_id)
    )
  );

-- ---------------------------------------------------------------------- profiles

-- Own profile, plus the people who share a tenant with me. Without the second arm
-- the Users screen cannot render a member list; with it, a profile is still
-- invisible to strangers because membership is what unlocks the read.
drop policy if exists profiles_self_or_tenant_read on public.profiles;
create policy profiles_self_or_tenant_read on public.profiles
  for select
  to authenticated
  using (
    id = app.current_user_id()
    or app.is_platform_admin(app.current_user_id())
    or exists (
      select 1
      from public.organization_memberships m
      where m.user_id = profiles.id
        and app.member_of(app.current_user_id(), m.organization_id)
    )
  );

-- ----------------------------------------------------------- memberships

-- A member may see the roster of their own organization (that is what "Users"
-- means), and always their own row — including an INVITED or REMOVED one, so a
-- suspended person can see why they lost access instead of hitting a blank wall.
drop policy if exists memberships_read on public.organization_memberships;
create policy memberships_read on public.organization_memberships
  for select
  to authenticated
  using (
    user_id = app.current_user_id()
    or app.member_of(app.current_user_id(), organization_id)
    or app.is_platform_admin(app.current_user_id())
  );

-- ------------------------------------------------------------------------ roles

-- System roles are shared reference data (§22) and are the only rows a stranger
-- can see; tenant-defined roles stay inside their tenant.
drop policy if exists roles_read on public.roles;
create policy roles_read on public.roles
  for select
  to authenticated
  using (
    is_system
    or organization_id is not null and app.member_of(app.current_user_id(), organization_id)
    or app.is_platform_admin(app.current_user_id())
  );

-- A role's permissions travel with the role. No separate secret: whoever may see
-- a role may see what it grants, which is what makes the UI able to explain a
-- denial instead of just saying "no".
drop policy if exists role_permissions_read on public.role_permissions;
create policy role_permissions_read on public.role_permissions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id
        and (r.is_system or app.member_of(app.current_user_id(), r.organization_id))
    )
  );

-- ------------------------------------------------------------------ role grants

drop policy if exists user_roles_read on public.user_roles;
create policy user_roles_read on public.user_roles
  for select
  to authenticated
  using (
    user_id = app.current_user_id()
    or app.member_of(app.current_user_id(), organization_id)
    or app.is_platform_admin(app.current_user_id())
  );

-- ---------------------------------------------------- property / outlet access

-- Access breadth is readable by the person it describes and by anyone who administers
-- that tenant — but never across tenants (§15's "user accessing another organization's
-- property" rejected at the storage layer).
drop policy if exists property_access_read on public.membership_property_access;
create policy property_access_read on public.membership_property_access
  for select
  to authenticated
  using (
    user_id = app.current_user_id()
    or app.member_of(app.current_user_id(), organization_id)
    or app.is_platform_admin(app.current_user_id())
  );

drop policy if exists outlet_access_read on public.membership_outlet_access;
create policy outlet_access_read on public.membership_outlet_access
  for select
  to authenticated
  using (
    user_id = app.current_user_id()
    or app.member_of(app.current_user_id(), organization_id)
    or app.is_platform_admin(app.current_user_id())
  );

-- ----------------------------------------------------------------- invitations

-- An invitation carries an email address, which is someone's PII, so tenant
-- membership alone is not enough: you also need the user-viewing capability.
-- The accept link is deliberately NOT covered by any policy — a stranger has no
-- session, and acceptance goes through accept_invitation() in 005, which proves
-- the hashed token and nothing else.
drop policy if exists invitations_read on public.invitations;
create policy invitations_read on public.invitations
  for select
  to authenticated
  using (
    app.is_platform_admin(app.current_user_id())
    or app.has_permission(app.current_user_id(), organization_id, 'user.view', null, null)
  );

-- ------------------------------------------------------------------ last context

-- §29: a stored preference, owned by one person. Not readable by an administrator
-- because it grants nothing — the write doors re-prove it on every use.
drop policy if exists active_context_own_read on public.user_active_contexts;
create policy active_context_own_read on public.user_active_contexts
  for select
  to authenticated
  using (user_id = app.current_user_id());
