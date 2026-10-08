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

-- --------------------------------------------------------------- the 23 new tokens

do $$
declare
  v_tokens text[] := array[
    'inventory.view',
    'inventory_cost.view',
    'item.view', 'item.create', 'item.edit', 'item.archive',
    'location.view', 'location.create', 'location.edit', 'location.archive',
    'stock.view', 'stock.adjust',
    'wastage.create',
    'transfer.create',
    'stocktake.view', 'stocktake.create', 'stocktake.post',
    'recipe.view', 'recipe.create', 'recipe.edit', 'recipe.activate',
    'recipe_cost.view',
    'consumption.view'
  ];
begin
  perform app.require_valid(array_length(v_tokens, 1) = 23, 'NIVAAS_PERMISSION_SEED_BROKEN');
  perform app.require_valid(
    not exists (select t from unnest(v_tokens) t
                 where t !~ E'^[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*$'),
    'NIVAAS_PERMISSION_SEED_BROKEN');
end;
$$;

-- ------------------------------------------------------------- the grants to re-own

delete from public.role_permissions rp
  using public.roles r
  where r.id = rp.role_id and r.is_system
    and rp.permission in (
      'inventory.view',
      'inventory_cost.view',
      'item.view', 'item.create', 'item.edit', 'item.archive',
      'location.view', 'location.create', 'location.edit', 'location.archive',
      'stock.view', 'stock.adjust',
      'wastage.create',
      'transfer.create',
      'stocktake.view', 'stocktake.create', 'stocktake.post',
      'recipe.view', 'recipe.create', 'recipe.edit', 'recipe.activate',
      'recipe_cost.view',
      'consumption.view'
    );

with role_permission_matrix(role_name, permission) as (
  values
    -- Organization owner and admin reach the whole inventory, including cost visibility.
    ('ORG_OWNER',        'inventory.view'),
    ('ORG_OWNER',        'inventory_cost.view'),
    ('ORG_OWNER',        'item.view'),
    ('ORG_OWNER',        'item.create'),
    ('ORG_OWNER',        'item.edit'),
    ('ORG_OWNER',        'item.archive'),
    ('ORG_OWNER',        'location.view'),
    ('ORG_OWNER',        'location.create'),
    ('ORG_OWNER',        'location.edit'),
    ('ORG_OWNER',        'location.archive'),
    ('ORG_OWNER',        'stock.view'),
    ('ORG_OWNER',        'stock.adjust'),
    ('ORG_OWNER',        'wastage.create'),
    ('ORG_OWNER',        'transfer.create'),
    ('ORG_OWNER',        'stocktake.view'),
    ('ORG_OWNER',        'stocktake.create'),
    ('ORG_OWNER',        'stocktake.post'),
    ('ORG_OWNER',        'recipe.view'),
    ('ORG_OWNER',        'recipe.create'),
    ('ORG_OWNER',        'recipe.edit'),
    ('ORG_OWNER',        'recipe.activate'),
    ('ORG_OWNER',        'recipe_cost.view'),
    ('ORG_OWNER',        'consumption.view'),

    ('ORG_ADMIN',        'inventory.view'),
    ('ORG_ADMIN',        'inventory_cost.view'),
    ('ORG_ADMIN',        'item.view'),
    ('ORG_ADMIN',        'item.create'),
    ('ORG_ADMIN',        'item.edit'),
    ('ORG_ADMIN',        'item.archive'),
    ('ORG_ADMIN',        'location.view'),
    ('ORG_ADMIN',        'location.create'),
    ('ORG_ADMIN',        'location.edit'),
    ('ORG_ADMIN',        'location.archive'),
    ('ORG_ADMIN',        'stock.view'),
    ('ORG_ADMIN',        'stock.adjust'),
    ('ORG_ADMIN',        'wastage.create'),
    ('ORG_ADMIN',        'transfer.create'),
    ('ORG_ADMIN',        'stocktake.view'),
    ('ORG_ADMIN',        'stocktake.create'),
    ('ORG_ADMIN',        'stocktake.post'),
    ('ORG_ADMIN',        'recipe.view'),
    ('ORG_ADMIN',        'recipe.create'),
    ('ORG_ADMIN',        'recipe.edit'),
    ('ORG_ADMIN',        'recipe.activate'),
    ('ORG_ADMIN',        'recipe_cost.view'),
    ('ORG_ADMIN',        'consumption.view'),

    -- General/Property/Restaurant managers reach operations but not cost visibility.
    ('GENERAL_MANAGER',  'inventory.view'),
    ('GENERAL_MANAGER',  'item.view'),
    ('GENERAL_MANAGER',  'item.create'),
    ('GENERAL_MANAGER',  'item.edit'),
    ('GENERAL_MANAGER',  'location.view'),
    ('GENERAL_MANAGER',  'stock.view'),
    ('GENERAL_MANAGER',  'stock.adjust'),
    ('GENERAL_MANAGER',  'wastage.create'),
    ('GENERAL_MANAGER',  'transfer.create'),
    ('GENERAL_MANAGER',  'stocktake.view'),
    ('GENERAL_MANAGER',  'stocktake.create'),
    ('GENERAL_MANAGER',  'stocktake.post'),
    ('GENERAL_MANAGER',  'recipe.view'),
    ('GENERAL_MANAGER',  'recipe.create'),
    ('GENERAL_MANAGER',  'recipe.edit'),
    ('GENERAL_MANAGER',  'recipe.activate'),
    ('GENERAL_MANAGER',  'consumption.view'),

    ('PROPERTY_MANAGER', 'inventory.view'),
    ('PROPERTY_MANAGER', 'item.view'),
    ('PROPERTY_MANAGER', 'item.create'),
    ('PROPERTY_MANAGER', 'item.edit'),
    ('PROPERTY_MANAGER', 'location.view'),
    ('PROPERTY_MANAGER', 'stock.view'),
    ('PROPERTY_MANAGER', 'stock.adjust'),
    ('PROPERTY_MANAGER', 'wastage.create'),
    ('PROPERTY_MANAGER', 'transfer.create'),
    ('PROPERTY_MANAGER', 'stocktake.view'),
    ('PROPERTY_MANAGER', 'stocktake.create'),
    ('PROPERTY_MANAGER', 'stocktake.post'),
    ('PROPERTY_MANAGER', 'recipe.view'),
    ('PROPERTY_MANAGER', 'recipe.create'),
    ('PROPERTY_MANAGER', 'recipe.edit'),
    ('PROPERTY_MANAGER', 'recipe.activate'),
    ('PROPERTY_MANAGER', 'consumption.view'),

    ('RESTAURANT_MANAGER', 'inventory.view'),
    ('RESTAURANT_MANAGER', 'item.view'),
    ('RESTAURANT_MANAGER', 'item.create'),
    ('RESTAURANT_MANAGER', 'item.edit'),
    ('RESTAURANT_MANAGER', 'location.view'),
    ('RESTAURANT_MANAGER', 'stock.view'),
    ('RESTAURANT_MANAGER', 'stock.adjust'),
    ('RESTAURANT_MANAGER', 'wastage.create'),
    ('RESTAURANT_MANAGER', 'transfer.create'),
    ('RESTAURANT_MANAGER', 'stocktake.view'),
    ('RESTAURANT_MANAGER', 'stocktake.create'),
    ('RESTAURANT_MANAGER', 'stocktake.post'),
    ('RESTAURANT_MANAGER', 'recipe.view'),
    ('RESTAURANT_MANAGER', 'recipe.create'),
    ('RESTAURANT_MANAGER', 'recipe.edit'),
    ('RESTAURANT_MANAGER', 'recipe.activate'),
    ('RESTAURANT_MANAGER', 'consumption.view'),

    -- Store Manager sees stock and recipes, can record wastage, but cannot adjust or post counts.
    ('STORE_MANAGER',    'inventory.view'),
    ('STORE_MANAGER',    'item.view'),
    ('STORE_MANAGER',    'location.view'),
    ('STORE_MANAGER',    'stock.view'),
    ('STORE_MANAGER',    'wastage.create'),
    ('STORE_MANAGER',    'recipe.view'),
    ('STORE_MANAGER',    'consumption.view'),

    -- Staff sees inventory and stock (read-only), no write verbs.
    ('STAFF',            'inventory.view'),
    ('STAFF',            'item.view'),
    ('STAFF',            'location.view'),
    ('STAFF',            'stock.view')
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
    'inventory.view', 'inventory_cost.view',
    'item.view', 'item.create', 'item.edit', 'item.archive',
    'location.view', 'location.create', 'location.edit', 'location.archive',
    'stock.view', 'stock.adjust',
    'wastage.create',
    'transfer.create',
    'stocktake.view', 'stocktake.create', 'stocktake.post',
    'recipe.view', 'recipe.create', 'recipe.edit', 'recipe.activate',
    'recipe_cost.view',
    'consumption.view'
  );
  -- 23 tokens × (7 roles with varying grants). The exact count depends on the ladder above.
  -- ORG_OWNER + ORG_ADMIN = 23 each = 46, GENERAL_MANAGER + PROPERTY_MANAGER + RESTAURANT_MANAGER = 17 each = 51,
  -- STORE_MANAGER = 7, STAFF = 4 → 108 total.
  perform app.require_valid(v_count = 108,
    'NIVAAS_PERMISSION_COUNT: expected 108 inventory grants, got ' || v_count);
end;
$$;
