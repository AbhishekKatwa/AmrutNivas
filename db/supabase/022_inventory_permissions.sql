-- AMRUT NIVAAS · 022 — inventory permission tokens (Prompt #06 §81-§83)
--
-- Prompt #06 opens the inventory domain: items, locations, stock ledger, recipes,
-- consumption, wastage, transfers, stock takes. Every write door must check a permission
-- that already exists in the catalogue — so the vocabulary arrives before the code.
--
-- Same pattern as 013: this file owns its own token set, deletes-and-reinserts only its
-- tokens across system roles, and applies after 006 in the harness order. The catalogue's
-- CHECK (002) is `domain.verb` — exactly one dot — so inventory keys flatten the same way
-- restaurant keys did: `inventory.view`, `item.create`, `stock.adjust`, etc.
--
-- The ladder: cost visibility is sensitive (inventory.cost.view, recipe.cost.view), and
-- write verbs (adjust, wastage, transfer, stocktake.post) stop at manager level and above.
-- A store clerk can view stock and record wastage; only a manager can adjust or post a
-- stock take. This is the same wall 013 drew around void/discount/refund.

-- --------------------------------------------------------------- the 24 new tokens

do $$
declare
  v_tokens text[] := array[
    'inventory.view',
    'inventory.cost.view',
    'item.view', 'item.create', 'item.edit', 'item.archive',
    'location.view', 'location.create', 'location.edit', 'location.archive',
    'stock.view', 'stock.adjust',
    'wastage.create',
    'transfer.create',
    'stocktake.view', 'stocktake.create', 'stocktake.post',
    'recipe.view', 'recipe.create', 'recipe.edit', 'recipe.activate',
    'recipe.cost.view',
    'consumption.view'
  ];
begin
  perform app.require_valid(array_length(v_tokens, 1) = 23, 'NIVAAS_PERMISSION_SEED_BROKEN');
  perform app.require_valid(
    not exists (select t from unnest(v_tokens) t
                 where t !~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
    'NIVAAS_PERMISSION_SEED_BROKEN');
end;
$$;

-- ------------------------------------------------------------- the grants to re-own

delete from public.role_permissions rp
  using public.roles r
  where r.id = rp.role_id and r.is_system
    and rp.permission in (
      'inventory.view',
      'inventory.cost.view',
      'item.view', 'item.create', 'item.edit', 'item.archive',
      'location.view', 'location.create', 'location.edit', 'location.archive',
      'stock.view', 'stock.adjust',
      'wastage.create',
      'transfer.create',
      'stocktake.view', 'stocktake.create', 'stocktake.post',
      'recipe.view', 'recipe.create', 'recipe.edit', 'recipe.activate',
      'recipe.cost.view',
      'consumption.view'
    );

with role_permission_matrix(role_name, permission) as (
  values
    -- Owner and administrator reach the whole inventory, including cost visibility.
    ('OWNER',            'inventory.view'),
    ('OWNER',            'inventory.cost.view'),
    ('OWNER',            'item.view'),
    ('OWNER',            'item.create'),
    ('OWNER',            'item.edit'),
    ('OWNER',            'item.archive'),
    ('OWNER',            'location.view'),
    ('OWNER',            'location.create'),
    ('OWNER',            'location.edit'),
    ('OWNER',            'location.archive'),
    ('OWNER',            'stock.view'),
    ('OWNER',            'stock.adjust'),
    ('OWNER',            'wastage.create'),
    ('OWNER',            'transfer.create'),
    ('OWNER',            'stocktake.view'),
    ('OWNER',            'stocktake.create'),
    ('OWNER',            'stocktake.post'),
    ('OWNER',            'recipe.view'),
    ('OWNER',            'recipe.create'),
    ('OWNER',            'recipe.edit'),
    ('OWNER',            'recipe.activate'),
    ('OWNER',            'recipe.cost.view'),
    ('OWNER',            'consumption.view'),

    ('ADMINISTRATOR',    'inventory.view'),
    ('ADMINISTRATOR',    'inventory.cost.view'),
    ('ADMINISTRATOR',    'item.view'),
    ('ADMINISTRATOR',    'item.create'),
    ('ADMINISTRATOR',    'item.edit'),
    ('ADMINISTRATOR',    'item.archive'),
    ('ADMINISTRATOR',    'location.view'),
    ('ADMINISTRATOR',    'location.create'),
    ('ADMINISTRATOR',    'location.edit'),
    ('ADMINISTRATOR',    'location.archive'),
    ('ADMINISTRATOR',    'stock.view'),
    ('ADMINISTRATOR',    'stock.adjust'),
    ('ADMINISTRATOR',    'wastage.create'),
    ('ADMINISTRATOR',    'transfer.create'),
    ('ADMINISTRATOR',    'stocktake.view'),
    ('ADMINISTRATOR',    'stocktake.create'),
    ('ADMINISTRATOR',    'stocktake.post'),
    ('ADMINISTRATOR',    'recipe.view'),
    ('ADMINISTRATOR',    'recipe.create'),
    ('ADMINISTRATOR',    'recipe.edit'),
    ('ADMINISTRATOR',    'recipe.activate'),
    ('ADMINISTRATOR',    'recipe.cost.view'),
    ('ADMINISTRATOR',    'consumption.view'),

    -- Manager reaches operations but not cost visibility (separate gate).
    ('MANAGER',          'inventory.view'),
    ('MANAGER',          'item.view'),
    ('MANAGER',          'item.create'),
    ('MANAGER',          'item.edit'),
    ('MANAGER',          'location.view'),
    ('MANAGER',          'stock.view'),
    ('MANAGER',          'stock.adjust'),
    ('MANAGER',          'wastage.create'),
    ('MANAGER',          'transfer.create'),
    ('MANAGER',          'stocktake.view'),
    ('MANAGER',          'stocktake.create'),
    ('MANAGER',          'stocktake.post'),
    ('MANAGER',          'recipe.view'),
    ('MANAGER',          'recipe.create'),
    ('MANAGER',          'recipe.edit'),
    ('MANAGER',          'recipe.activate'),
    ('MANAGER',          'consumption.view'),

    -- Supervisor sees stock and recipes, can record wastage, but cannot adjust or post counts.
    ('SUPERVISOR',       'inventory.view'),
    ('SUPERVISOR',       'item.view'),
    ('SUPERVISOR',       'location.view'),
    ('SUPERVISOR',       'stock.view'),
    ('SUPERVISOR',       'wastage.create'),
    ('SUPERVISOR',       'recipe.view'),
    ('SUPERVISOR',       'consumption.view'),

    -- Staff sees inventory and stock (read-only), no write verbs.
    ('STAFF',            'inventory.view'),
    ('STAFF',            'item.view'),
    ('STAFF',            'location.view'),
    ('STAFF',            'stock.view')
)
insert into public.role_permissions (role_id, permission, granted_by, reason)
select r.id, m.permission, '00000000-0000-0000-0000-000000000000', 'system seed (022)'
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
    'inventory.view', 'inventory.cost.view',
    'item.view', 'item.create', 'item.edit', 'item.archive',
    'location.view', 'location.create', 'location.edit', 'location.archive',
    'stock.view', 'stock.adjust',
    'wastage.create',
    'transfer.create',
    'stocktake.view', 'stocktake.create', 'stocktake.post',
    'recipe.view', 'recipe.create', 'recipe.edit', 'recipe.activate',
    'recipe.cost.view',
    'consumption.view'
  );
  -- 23 tokens × (5 roles with varying grants). The exact count depends on the ladder above.
  -- OWNER + ADMINISTRATOR = 23 each = 46, MANAGER = 17, SUPERVISOR = 7, STAFF = 4 → 74 total.
  perform app.require_valid(v_count = 74,
    'NIVAAS_PERMISSION_COUNT: expected 74 inventory grants, got ' || v_count);
end;
$$;
