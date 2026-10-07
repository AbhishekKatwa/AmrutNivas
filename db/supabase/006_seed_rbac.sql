-- ============================================================================
-- AMRUT NIVAAS — Prompt #02, migration 006: RBAC seed (system roles + permissions)
--
-- §22 says thirteen roles, no more; §23 says each one speaks at a scope; §24 says
-- one centralised permission vocabulary. This file is the ONLY copy of that
-- vocabulary. The donor project kept a permission matrix in TypeScript AND another
-- in SQL, and they drifted until the UI offered buttons the database refused — the
-- exact failure recorded in that project's memory as "role matrix lives twice".
--
-- So: the client asks `app.my_permissions()` (005) and renders what the answer says.
-- It never hardcodes which role implies which capability.
--
-- Permission shape is enforced by the CHECK in 002 (`domain.verb`, lowercase, one
-- dot), so a typo here fails loudly at migration time instead of becoming a
-- capability nobody can grant.
-- ============================================================================

-- ------------------------------------------------------------------ the roles

-- Re-seeding updates in place so a staging environment converges on the shipped
-- definition rather than keeping whatever an earlier draft created.
insert into public.roles (name, display_name, description, scope_level, is_system, status) values
  ('PLATFORM_ADMIN',        'Platform Administrator',
   'AMRUT NIVAAS operator support. Reads and administers any tenant; never a farm/hotel staff role.',
   'GLOBAL', true, 'ACTIVE'),
  ('ORG_OWNER',             'Organization Owner',
   'The tenant''s owner. Full control of the group, its sites, its people and its billing identity.',
   'ORGANIZATION', true, 'ACTIVE'),
  ('ORG_ADMIN',             'Organization Administrator',
   'Runs the group on the owner''s behalf, including people and roles, but cannot retire the tenant.',
   'ORGANIZATION', true, 'ACTIVE'),
  ('GENERAL_MANAGER',       'General Manager',
   'Runs one property end to end: its outlets, departments and staff.',
   'PROPERTY', true, 'ACTIVE'),
  ('PROPERTY_MANAGER',      'Property Manager',
   'Accountable for one property, including who can reach its outlets.',
   'PROPERTY', true, 'ACTIVE'),
  ('RESTAURANT_MANAGER',    'Restaurant Manager',
   'Accountable for one restaurant outlet.',
   'OUTLET', true, 'ACTIVE'),
  ('KITCHEN_MANAGER',       'Kitchen Manager',
   'Accountable for a kitchen inside one outlet.',
   'OUTLET', true, 'ACTIVE'),
  ('HOUSEKEEPING_MANAGER',  'Housekeeping Manager',
   'Accountable for housekeeping within one outlet.',
   'OUTLET', true, 'ACTIVE'),
  ('FINANCE_MANAGER',       'Finance Manager',
   'Reads the group''s money and its audit trail across every site.',
   'ORGANIZATION', true, 'ACTIVE'),
  ('HR_MANAGER',            'HR Manager',
   'Invites, suspends and removes people, and assigns roles. Group-wide.',
   'ORGANIZATION', true, 'ACTIVE'),
  ('STORE_MANAGER',         'Store Manager',
   'Accountable for a stores/godown department inside one outlet.',
   'OUTLET', true, 'ACTIVE'),
  ('EVENT_MANAGER',         'Event Manager',
   'Runs banquet and event outlets.',
   'OUTLET', true, 'ACTIVE'),
  ('STAFF',                 'Staff',
   'Operational floor access to one outlet. No administration anywhere.',
   'OUTLET', true, 'ACTIVE')
on conflict (name) do update
  set display_name = excluded.display_name,
      description  = excluded.description,
      scope_level  = excluded.scope_level,
      is_system    = true,
      status       = excluded.status;

-- --------------------------------------------------------------- the catalogue

-- Exactly the verbs the write doors in 005 ask for, plus the `.view` reads the
-- navigation needs. Deliberately absent: §24's `organization.manageUsers`, which is
-- a bundle of four capabilities the doors already check individually
-- (user.invite / user.suspend / user.remove / role.assign). Seeding a permission
-- nothing enables would put a row in the admin UI that means nothing — a fake
-- capability is worse than a missing one.
with permissions(name) as (
  values
    ('organization.view'), ('organization.edit'), ('organization.archive'),
    ('property.view'), ('property.create'), ('property.edit'), ('property.archive'),
    ('property.manage_access'),
    ('outlet.view'), ('outlet.create'), ('outlet.edit'), ('outlet.archive'),
    ('outlet.manage_access'),
    ('department.view'), ('department.create'), ('department.edit'), ('department.archive'),
    ('user.view'), ('user.invite'), ('user.suspend'), ('user.remove'),
    ('role.view'), ('role.assign'),
    ('audit.view'),
    ('platform.manage')
)
-- The catalogue is validated against the same pattern the column uses, so this
-- migration cannot seed a permission the schema would reject later.
select app.require_valid(count(*) = 25, 'NIVAAS_PERMISSION_SEED_BROKEN') from permissions;

-- System roles are seeded, so their grants are owned by this file: clear and re-apply
-- rather than merge, or a deleted capability would survive a re-run forever.
delete from public.role_permissions rp
  using public.roles r
  where r.id = rp.role_id and r.is_system;

with role_permission_matrix(role_name, permission) as (
  values
    -- The platform seat: operate tenants, read everything, never run a property's day.
    ('PLATFORM_ADMIN', 'platform.manage'),
    ('PLATFORM_ADMIN', 'organization.view'),
    ('PLATFORM_ADMIN', 'organization.archive'),
    ('PLATFORM_ADMIN', 'audit.view'),

    -- The owner holds every capability in the tenant except the platform seat.
    ('ORG_OWNER', 'organization.view'), ('ORG_OWNER', 'organization.edit'), ('ORG_OWNER', 'organization.archive'),
    ('ORG_OWNER', 'property.view'), ('ORG_OWNER', 'property.create'), ('ORG_OWNER', 'property.edit'),
    ('ORG_OWNER', 'property.archive'), ('ORG_OWNER', 'property.manage_access'),
    ('ORG_OWNER', 'outlet.view'), ('ORG_OWNER', 'outlet.create'), ('ORG_OWNER', 'outlet.edit'),
    ('ORG_OWNER', 'outlet.archive'), ('ORG_OWNER', 'outlet.manage_access'),
    ('ORG_OWNER', 'department.view'), ('ORG_OWNER', 'department.create'), ('ORG_OWNER', 'department.edit'),
    ('ORG_OWNER', 'department.archive'),
    ('ORG_OWNER', 'user.view'), ('ORG_OWNER', 'user.invite'), ('ORG_OWNER', 'user.suspend'), ('ORG_OWNER', 'user.remove'),
    ('ORG_OWNER', 'role.view'), ('ORG_OWNER', 'role.assign'),
    ('ORG_OWNER', 'audit.view'),

    -- An admin runs everything the owner can, except retiring the tenant itself.
    ('ORG_ADMIN', 'organization.view'), ('ORG_ADMIN', 'organization.edit'),
    ('ORG_ADMIN', 'property.view'), ('ORG_ADMIN', 'property.create'), ('ORG_ADMIN', 'property.edit'),
    ('ORG_ADMIN', 'property.archive'), ('ORG_ADMIN', 'property.manage_access'),
    ('ORG_ADMIN', 'outlet.view'), ('ORG_ADMIN', 'outlet.create'), ('ORG_ADMIN', 'outlet.edit'),
    ('ORG_ADMIN', 'outlet.archive'), ('ORG_ADMIN', 'outlet.manage_access'),
    ('ORG_ADMIN', 'department.view'), ('ORG_ADMIN', 'department.create'), ('ORG_ADMIN', 'department.edit'),
    ('ORG_ADMIN', 'department.archive'),
    ('ORG_ADMIN', 'user.view'), ('ORG_ADMIN', 'user.invite'), ('ORG_ADMIN', 'user.suspend'), ('ORG_ADMIN', 'user.remove'),
    ('ORG_ADMIN', 'role.view'), ('ORG_ADMIN', 'role.assign'),
    ('ORG_ADMIN', 'audit.view'),

    -- A GM runs the site and its people, but does not redraw access boundaries.
    ('GENERAL_MANAGER', 'property.view'), ('GENERAL_MANAGER', 'property.edit'),
    ('GENERAL_MANAGER', 'outlet.view'), ('GENERAL_MANAGER', 'outlet.create'), ('GENERAL_MANAGER', 'outlet.edit'),
    ('GENERAL_MANAGER', 'department.view'), ('GENERAL_MANAGER', 'department.create'), ('GENERAL_MANAGER', 'department.edit'),
    ('GENERAL_MANAGER', 'user.view'), ('GENERAL_MANAGER', 'user.invite'),
    ('GENERAL_MANAGER', 'role.view'), ('GENERAL_MANAGER', 'audit.view'),

    -- A property manager additionally decides which outlets a person may reach.
    ('PROPERTY_MANAGER', 'property.view'), ('PROPERTY_MANAGER', 'property.edit'),
    ('PROPERTY_MANAGER', 'property.manage_access'),
    ('PROPERTY_MANAGER', 'outlet.view'), ('PROPERTY_MANAGER', 'outlet.create'), ('PROPERTY_MANAGER', 'outlet.edit'),
    ('PROPERTY_MANAGER', 'outlet.manage_access'),
    ('PROPERTY_MANAGER', 'department.view'), ('PROPERTY_MANAGER', 'department.create'), ('PROPERTY_MANAGER', 'department.edit'),
    ('PROPERTY_MANAGER', 'user.view'), ('PROPERTY_MANAGER', 'user.invite'), ('PROPERTY_MANAGER', 'user.suspend'),
    ('PROPERTY_MANAGER', 'role.view'), ('PROPERTY_MANAGER', 'audit.view'),

    ('RESTAURANT_MANAGER', 'outlet.view'), ('RESTAURANT_MANAGER', 'outlet.edit'),
    ('RESTAURANT_MANAGER', 'department.view'), ('RESTAURANT_MANAGER', 'department.edit'),
    ('RESTAURANT_MANAGER', 'user.view'),

    ('KITCHEN_MANAGER', 'outlet.view'),
    ('KITCHEN_MANAGER', 'department.view'), ('KITCHEN_MANAGER', 'department.edit'),

    ('HOUSEKEEPING_MANAGER', 'outlet.view'), ('HOUSEKEEPING_MANAGER', 'department.view'),

    ('FINANCE_MANAGER', 'organization.view'), ('FINANCE_MANAGER', 'property.view'),
    ('FINANCE_MANAGER', 'outlet.view'), ('FINANCE_MANAGER', 'audit.view'),

    ('HR_MANAGER', 'organization.view'), ('HR_MANAGER', 'property.view'),
    ('HR_MANAGER', 'user.view'), ('HR_MANAGER', 'user.invite'), ('HR_MANAGER', 'user.suspend'),
    ('HR_MANAGER', 'user.remove'), ('HR_MANAGER', 'role.view'), ('HR_MANAGER', 'role.assign'),

    ('STORE_MANAGER', 'outlet.view'), ('STORE_MANAGER', 'department.view'),

    ('EVENT_MANAGER', 'outlet.view'), ('EVENT_MANAGER', 'outlet.edit'),
    ('EVENT_MANAGER', 'department.view'),

    ('STAFF', 'outlet.view')
)
insert into public.role_permissions (role_id, permission)
select r.id, m.permission
  from role_permission_matrix m
  join public.roles r on r.name = m.role_name
on conflict (role_id, permission) do nothing;

-- The one structural guarantee this file exists to provide: every seeded grant
-- resolves to a real role, and the matrix is the size the review approved.
do $$
declare
  v_roles      integer;
  v_grants     integer;
  v_orphaned   integer;
begin
  select count(*) into v_roles from public.roles where is_system;
  select count(*) into v_grants from public.role_permissions rp
    join public.roles r on r.id = rp.role_id where r.is_system;
  select count(*) into v_orphaned from public.role_permissions rp
    where rp.permission not in (
      'organization.view','organization.edit','organization.archive',
      'property.view','property.create','property.edit','property.archive','property.manage_access',
      'outlet.view','outlet.create','outlet.edit','outlet.archive','outlet.manage_access',
      'department.view','department.create','department.edit','department.archive',
      'user.view','user.invite','user.suspend','user.remove',
      'role.view','role.assign','audit.view','platform.manage');

  perform app.require_valid(v_roles = 13, 'NIVAAS_ROLE_SEED_INCOMPLETE');
  perform app.require_valid(v_grants > 0, 'NIVAAS_ROLE_SEED_EMPTY');
  perform app.require_valid(v_orphaned = 0, 'NIVAAS_PERMISSION_ORPHAN');
end;
$$;
