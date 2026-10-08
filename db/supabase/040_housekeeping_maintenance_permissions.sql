-- AMRUT NIVAAS · 040 — housekeeping, maintenance & room operations permissions
--
-- Prompt #09 extends the hotel PMS with housekeeping tasks, inspections,
-- maintenance requests, room operations, lost & found and assets. This migration
-- seeds the 28 new permission tokens and updates the role matrix.
--
-- Role matrix:
--   ORG_OWNER / ORG_ADMIN — full reach over housekeeping, maintenance, room ops
--   GENERAL_MANAGER / PROPERTY_MANAGER — operations, assignments, resolutions
--   RESTAURANT_MANAGER — read-only housekeeping/maintenance, can log lost & found
--   STORE_MANAGER — read-only housekeeping/maintenance, view lost & found
--   STAFF — minimal: view housekeeping and maintenance boards

-- Widen the permission CHECK to allow multi-segment tokens (e.g. housekeeping.task.create).
-- The original constraint (from 002) only allowed `domain.verb`; later modules use deeper paths.
alter table public.role_permissions drop constraint if exists role_permissions_permission_check;
alter table public.role_permissions add constraint role_permissions_permission_check
  check (permission ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$');

do $$
declare
  v_tokens text[] := array[
    -- Housekeeping module entry
    'housekeeping.view',

    -- Housekeeping tasks
    'housekeeping.task.create', 'housekeeping.task.assign',
    'housekeeping.task.start', 'housekeeping.task.complete',
    'housekeeping.task.verify', 'housekeeping.task.cancel',

    -- Housekeeping inspections
    'housekeeping.inspection.create', 'housekeeping.inspection.complete',

    -- Maintenance module entry
    'maintenance.view',

    -- Maintenance requests
    'maintenance.create', 'maintenance.assign', 'maintenance.start',
    'maintenance.resolve', 'maintenance.verify', 'maintenance.close',
    'maintenance.cancel',

    -- Maintenance cost visibility
    'maintenance.cost.view', 'maintenance.parts.consume',

    -- Room operations
    'room_operation.view', 'room_operation.manage',
    'room.release',

    -- Lost & found
    'lost_found.view', 'lost_found.create', 'lost_found.return',

    -- Assets
    'asset.view', 'asset.create', 'asset.edit'
  ];
begin
  perform app.require_valid(array_length(v_tokens, 1) = 28, 'NIVAAS_PERMISSION_SEED_BROKEN');
  perform app.require_valid(
    not exists (select t from unnest(v_tokens) t
                 where t !~ E'^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+$'),
    'NIVAAS_PERMISSION_SEED_BROKEN');
end;
$$;

-- ------------------------------------------------------------- delete-and-reinsert

delete from public.role_permissions rp
  using public.roles r
  where r.id = rp.role_id and r.is_system
    and rp.permission in (
      'housekeeping.view',
      'housekeeping.task.create', 'housekeeping.task.assign',
      'housekeeping.task.start', 'housekeeping.task.complete',
      'housekeeping.task.verify', 'housekeeping.task.cancel',
      'housekeeping.inspection.create', 'housekeeping.inspection.complete',
      'maintenance.view',
      'maintenance.create', 'maintenance.assign', 'maintenance.start',
      'maintenance.resolve', 'maintenance.verify', 'maintenance.close',
      'maintenance.cancel',
      'maintenance.cost.view', 'maintenance.parts.consume',
      'room_operation.view', 'room_operation.manage', 'room.release',
      'lost_found.view', 'lost_found.create', 'lost_found.return',
      'asset.view', 'asset.create', 'asset.edit'
    );

with role_permission_matrix(role_name, permission) as (
  values
    -- Owner: full housekeeping + maintenance + room ops
    ('ORG_OWNER', 'housekeeping.view'),
    ('ORG_OWNER', 'housekeeping.task.create'), ('ORG_OWNER', 'housekeeping.task.assign'),
    ('ORG_OWNER', 'housekeeping.task.start'), ('ORG_OWNER', 'housekeeping.task.complete'),
    ('ORG_OWNER', 'housekeeping.task.verify'), ('ORG_OWNER', 'housekeeping.task.cancel'),
    ('ORG_OWNER', 'housekeeping.inspection.create'), ('ORG_OWNER', 'housekeeping.inspection.complete'),
    ('ORG_OWNER', 'maintenance.view'),
    ('ORG_OWNER', 'maintenance.create'), ('ORG_OWNER', 'maintenance.assign'),
    ('ORG_OWNER', 'maintenance.start'), ('ORG_OWNER', 'maintenance.resolve'),
    ('ORG_OWNER', 'maintenance.verify'), ('ORG_OWNER', 'maintenance.close'),
    ('ORG_OWNER', 'maintenance.cancel'),
    ('ORG_OWNER', 'maintenance.cost.view'), ('ORG_OWNER', 'maintenance.parts.consume'),
    ('ORG_OWNER', 'room_operation.view'), ('ORG_OWNER', 'room_operation.manage'),
    ('ORG_OWNER', 'room.release'),
    ('ORG_OWNER', 'lost_found.view'), ('ORG_OWNER', 'lost_found.create'),
    ('ORG_OWNER', 'lost_found.return'),
    ('ORG_OWNER', 'asset.view'), ('ORG_OWNER', 'asset.create'), ('ORG_OWNER', 'asset.edit'),

    -- Admin: same as owner
    ('ORG_ADMIN', 'housekeeping.view'),
    ('ORG_ADMIN', 'housekeeping.task.create'), ('ORG_ADMIN', 'housekeeping.task.assign'),
    ('ORG_ADMIN', 'housekeeping.task.start'), ('ORG_ADMIN', 'housekeeping.task.complete'),
    ('ORG_ADMIN', 'housekeeping.task.verify'), ('ORG_ADMIN', 'housekeeping.task.cancel'),
    ('ORG_ADMIN', 'housekeeping.inspection.create'), ('ORG_ADMIN', 'housekeeping.inspection.complete'),
    ('ORG_ADMIN', 'maintenance.view'),
    ('ORG_ADMIN', 'maintenance.create'), ('ORG_ADMIN', 'maintenance.assign'),
    ('ORG_ADMIN', 'maintenance.start'), ('ORG_ADMIN', 'maintenance.resolve'),
    ('ORG_ADMIN', 'maintenance.verify'), ('ORG_ADMIN', 'maintenance.close'),
    ('ORG_ADMIN', 'maintenance.cancel'),
    ('ORG_ADMIN', 'maintenance.cost.view'), ('ORG_ADMIN', 'maintenance.parts.consume'),
    ('ORG_ADMIN', 'room_operation.view'), ('ORG_ADMIN', 'room_operation.manage'),
    ('ORG_ADMIN', 'room.release'),
    ('ORG_ADMIN', 'lost_found.view'), ('ORG_ADMIN', 'lost_found.create'),
    ('ORG_ADMIN', 'lost_found.return'),
    ('ORG_ADMIN', 'asset.view'), ('ORG_ADMIN', 'asset.create'), ('ORG_ADMIN', 'asset.edit'),

    -- General Manager: operations but not cost visibility
    ('GENERAL_MANAGER', 'housekeeping.view'),
    ('GENERAL_MANAGER', 'housekeeping.task.create'), ('GENERAL_MANAGER', 'housekeeping.task.assign'),
    ('GENERAL_MANAGER', 'housekeeping.task.start'), ('GENERAL_MANAGER', 'housekeeping.task.complete'),
    ('GENERAL_MANAGER', 'housekeeping.task.verify'), ('GENERAL_MANAGER', 'housekeeping.task.cancel'),
    ('GENERAL_MANAGER', 'housekeeping.inspection.create'), ('GENERAL_MANAGER', 'housekeeping.inspection.complete'),
    ('GENERAL_MANAGER', 'maintenance.view'),
    ('GENERAL_MANAGER', 'maintenance.create'), ('GENERAL_MANAGER', 'maintenance.assign'),
    ('GENERAL_MANAGER', 'maintenance.start'), ('GENERAL_MANAGER', 'maintenance.resolve'),
    ('GENERAL_MANAGER', 'maintenance.verify'), ('GENERAL_MANAGER', 'maintenance.close'),
    ('GENERAL_MANAGER', 'maintenance.cancel'),
    ('GENERAL_MANAGER', 'maintenance.parts.consume'),
    ('GENERAL_MANAGER', 'room_operation.view'), ('GENERAL_MANAGER', 'room_operation.manage'),
    ('GENERAL_MANAGER', 'room.release'),
    ('GENERAL_MANAGER', 'lost_found.view'), ('GENERAL_MANAGER', 'lost_found.create'),
    ('GENERAL_MANAGER', 'lost_found.return'),
    ('GENERAL_MANAGER', 'asset.view'), ('GENERAL_MANAGER', 'asset.create'), ('GENERAL_MANAGER', 'asset.edit'),

    -- Property Manager: same as GM
    ('PROPERTY_MANAGER', 'housekeeping.view'),
    ('PROPERTY_MANAGER', 'housekeeping.task.create'), ('PROPERTY_MANAGER', 'housekeeping.task.assign'),
    ('PROPERTY_MANAGER', 'housekeeping.task.start'), ('PROPERTY_MANAGER', 'housekeeping.task.complete'),
    ('PROPERTY_MANAGER', 'housekeeping.task.verify'), ('PROPERTY_MANAGER', 'housekeeping.task.cancel'),
    ('PROPERTY_MANAGER', 'housekeeping.inspection.create'), ('PROPERTY_MANAGER', 'housekeeping.inspection.complete'),
    ('PROPERTY_MANAGER', 'maintenance.view'),
    ('PROPERTY_MANAGER', 'maintenance.create'), ('PROPERTY_MANAGER', 'maintenance.assign'),
    ('PROPERTY_MANAGER', 'maintenance.start'), ('PROPERTY_MANAGER', 'maintenance.resolve'),
    ('PROPERTY_MANAGER', 'maintenance.verify'), ('PROPERTY_MANAGER', 'maintenance.close'),
    ('PROPERTY_MANAGER', 'maintenance.cancel'),
    ('PROPERTY_MANAGER', 'maintenance.parts.consume'),
    ('PROPERTY_MANAGER', 'room_operation.view'), ('PROPERTY_MANAGER', 'room_operation.manage'),
    ('PROPERTY_MANAGER', 'room.release'),
    ('PROPERTY_MANAGER', 'lost_found.view'), ('PROPERTY_MANAGER', 'lost_found.create'),
    ('PROPERTY_MANAGER', 'lost_found.return'),
    ('PROPERTY_MANAGER', 'asset.view'), ('PROPERTY_MANAGER', 'asset.create'), ('PROPERTY_MANAGER', 'asset.edit'),

    -- Restaurant Manager: read-only housekeeping/maintenance, can log lost & found
    ('RESTAURANT_MANAGER', 'housekeeping.view'),
    ('RESTAURANT_MANAGER', 'maintenance.view'),
    ('RESTAURANT_MANAGER', 'lost_found.view'), ('RESTAURANT_MANAGER', 'lost_found.create'),

    -- Store Manager: read-only housekeeping/maintenance, view lost & found
    ('STORE_MANAGER', 'housekeeping.view'),
    ('STORE_MANAGER', 'maintenance.view'),
    ('STORE_MANAGER', 'lost_found.view'),

    -- Staff: minimal
    ('STAFF', 'housekeeping.view'),
    ('STAFF', 'maintenance.view')
)
insert into public.role_permissions (role_id, permission)
select r.id, m.permission
from role_permission_matrix m
join public.roles r on r.name = m.role_name and r.is_system
on conflict (role_id, permission) do nothing;

-- ------------------------------------------------------------- self-check

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.role_permissions rp
  join public.roles r on r.id = rp.role_id and r.is_system
  where rp.permission in (
    'housekeeping.view',
    'housekeeping.task.create', 'housekeeping.task.assign',
    'housekeeping.task.start', 'housekeeping.task.complete',
    'housekeeping.task.verify', 'housekeeping.task.cancel',
    'housekeeping.inspection.create', 'housekeeping.inspection.complete',
    'maintenance.view',
    'maintenance.create', 'maintenance.assign', 'maintenance.start',
    'maintenance.resolve', 'maintenance.verify', 'maintenance.close',
    'maintenance.cancel',
    'maintenance.cost.view', 'maintenance.parts.consume',
    'room_operation.view', 'room_operation.manage', 'room.release',
    'lost_found.view', 'lost_found.create', 'lost_found.return',
    'asset.view', 'asset.create', 'asset.edit'
  );
  -- ORG_OWNER=28, ORG_ADMIN=28, GENERAL_MANAGER=27, PROPERTY_MANAGER=27,
  -- RESTAURANT_MANAGER=4, STORE_MANAGER=3, STAFF=2 → 119 total
  perform app.require_valid(v_count = 119,
    'NIVAAS_PERMISSION_COUNT: expected 119 housekeeping/maintenance grants, got ' || v_count);
end;
$$;
