-- AMRUT NIVAAS · 013 — restaurant permission tokens (Prompt #04 §5)
--
-- Prompt #04 opens the hospitality domain: menus, tables, orders, KOT, bills and
-- payments. Every write door that domain needs must check a permission that already
-- exists in the catalogue — so the vocabulary arrives before the code that asks for
-- it, the same way 006 seeded the hierarchy tokens before 005's doors ran, and 011
-- added `role.create`/`role.edit` alongside the custom-role doors.
--
-- Why a separate file and not an edit to 006: 006 clear-and-reinserts EVERY system
-- role's grants on apply (its DELETE removes all is_system rows before re-inserting
-- its own matrix). Anything appended to 006's matrix would be re-owned by 006; anything
-- added elsewhere would be wiped by a re-apply of 006. So the restaurant tokens live
-- here, are deleted-and-reinserted here for just these 27 keys, and apply after 006 in
-- the harness order. A re-run of this file converges rather than duplicating.
--
-- The spec writes these as three-segment keys (`restaurant.menu.view`). The catalogue's
-- CHECK (002) is `domain.verb` — exactly one dot — so a three-segment key is refused at
-- insert time. Two segments it is: the domain is the single word that names the area
-- (menu, table, order, kot, bill, payment; restaurant for the shared read), and the verb
-- is what the door checks. This is the same flattening `property.manage_access` and
-- `outlet.manage_access` already use — the parent concept is a prefix, not a level.
--
-- The ladder, and the wall this file guards. Sensitive capabilities — publishing a menu,
-- voiding an order or a bill, discounting an order, refunding a payment — stop at
-- manager level and above. A kitchen manager runs the pass: they see the menu, they flip
-- item availability, they raise, reprint and cancel KOTs, and they hold no money verb at
-- all. A floor staff member takes orders and payments but cannot discount, void or
-- refund. Those walls are asserted below so a half-applied seed fails loudly instead of
-- quietly handing a kitchen the till.

-- --------------------------------------------------------------- the 27 new tokens

-- The exact set this file owns, referenced three times (delete scope, existence
-- assertion, and the matrix), so a token added to one list and not the others cannot
-- slip through.
do $$
declare
  v_tokens text[] := array[
    'restaurant.view',
    'menu.view', 'menu.create', 'menu.edit', 'menu.archive', 'menu.publish',
    'table.view', 'table.create', 'table.edit', 'table.archive',
    'order.view', 'order.create', 'order.edit', 'order.cancel', 'order.discount', 'order.void',
    'kot.view', 'kot.create', 'kot.reprint', 'kot.cancel',
    'bill.view', 'bill.create', 'bill.discount', 'bill.void',
    'payment.view', 'payment.create', 'payment.refund'
  ];
begin
  -- §5 lists these keys; the count is the promise. A dropped or duplicated line here is
  -- the same class of mistake 006 guards with `count(*) = 25`.
  perform app.require_valid(array_length(v_tokens, 1) = 27, 'NIVAAS_PERMISSION_SEED_BROKEN');
  -- Every token must match the catalogue's own shape before any role is pointed at it,
  -- or a typo becomes a capability nothing can grant rather than a migration-time failure.
  perform app.require_valid(
    not exists (select t from unnest(v_tokens) t
                 where t !~ E'^[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*$'),
    'NIVAAS_PERMISSION_SEED_BROKEN');
end;
$$;

-- ------------------------------------------------------------- the grants to re-own

-- Clear only this file's tokens across the system roles, then re-apply the matrix. A
-- capability retired from the ladder disappears on the next apply instead of surviving
-- forever in a stale grant row (the merge-would-leave-orphans rule 006 states).
delete from public.role_permissions rp
  using public.roles r
  where r.id = rp.role_id and r.is_system
    and rp.permission in (
      'restaurant.view',
      'menu.view', 'menu.create', 'menu.edit', 'menu.archive', 'menu.publish',
      'table.view', 'table.create', 'table.edit', 'table.archive',
      'order.view', 'order.create', 'order.edit', 'order.cancel', 'order.discount', 'order.void',
      'kot.view', 'kot.create', 'kot.reprint', 'kot.cancel',
      'bill.view', 'bill.create', 'bill.discount', 'bill.void',
      'payment.view', 'payment.create', 'payment.refund'
    );

with role_permission_matrix(role_name, permission) as (
  values
    -- The owner and the administrator reach the whole restaurant, exactly as they reach
    -- the whole estate. They are the two roles 006 grants everything to.
    ('ORG_OWNER', 'restaurant.view'),
    ('ORG_OWNER', 'menu.view'), ('ORG_OWNER', 'menu.create'), ('ORG_OWNER', 'menu.edit'),
    ('ORG_OWNER', 'menu.archive'), ('ORG_OWNER', 'menu.publish'),
    ('ORG_OWNER', 'table.view'), ('ORG_OWNER', 'table.create'), ('ORG_OWNER', 'table.edit'),
    ('ORG_OWNER', 'table.archive'),
    ('ORG_OWNER', 'order.view'), ('ORG_OWNER', 'order.create'), ('ORG_OWNER', 'order.edit'),
    ('ORG_OWNER', 'order.cancel'), ('ORG_OWNER', 'order.discount'), ('ORG_OWNER', 'order.void'),
    ('ORG_OWNER', 'kot.view'), ('ORG_OWNER', 'kot.create'), ('ORG_OWNER', 'kot.reprint'), ('ORG_OWNER', 'kot.cancel'),
    ('ORG_OWNER', 'bill.view'), ('ORG_OWNER', 'bill.create'), ('ORG_OWNER', 'bill.discount'), ('ORG_OWNER', 'bill.void'),
    ('ORG_OWNER', 'payment.view'), ('ORG_OWNER', 'payment.create'), ('ORG_OWNER', 'payment.refund'),

    ('ORG_ADMIN', 'restaurant.view'),
    ('ORG_ADMIN', 'menu.view'), ('ORG_ADMIN', 'menu.create'), ('ORG_ADMIN', 'menu.edit'),
    ('ORG_ADMIN', 'menu.archive'), ('ORG_ADMIN', 'menu.publish'),
    ('ORG_ADMIN', 'table.view'), ('ORG_ADMIN', 'table.create'), ('ORG_ADMIN', 'table.edit'),
    ('ORG_ADMIN', 'table.archive'),
    ('ORG_ADMIN', 'order.view'), ('ORG_ADMIN', 'order.create'), ('ORG_ADMIN', 'order.edit'),
    ('ORG_ADMIN', 'order.cancel'), ('ORG_ADMIN', 'order.discount'), ('ORG_ADMIN', 'order.void'),
    ('ORG_ADMIN', 'kot.view'), ('ORG_ADMIN', 'kot.create'), ('ORG_ADMIN', 'kot.reprint'), ('ORG_ADMIN', 'kot.cancel'),
    ('ORG_ADMIN', 'bill.view'), ('ORG_ADMIN', 'bill.create'), ('ORG_ADMIN', 'bill.discount'), ('ORG_ADMIN', 'bill.void'),
    ('ORG_ADMIN', 'payment.view'), ('ORG_ADMIN', 'payment.create'), ('ORG_ADMIN', 'payment.refund'),

    -- A general manager runs a property end to end, including its covers and its closes.
    ('GENERAL_MANAGER', 'restaurant.view'),
    ('GENERAL_MANAGER', 'menu.view'), ('GENERAL_MANAGER', 'menu.create'), ('GENERAL_MANAGER', 'menu.edit'),
    ('GENERAL_MANAGER', 'menu.archive'), ('GENERAL_MANAGER', 'menu.publish'),
    ('GENERAL_MANAGER', 'table.view'), ('GENERAL_MANAGER', 'table.create'), ('GENERAL_MANAGER', 'table.edit'),
    ('GENERAL_MANAGER', 'table.archive'),
    ('GENERAL_MANAGER', 'order.view'), ('GENERAL_MANAGER', 'order.create'), ('GENERAL_MANAGER', 'order.edit'),
    ('GENERAL_MANAGER', 'order.cancel'), ('GENERAL_MANAGER', 'order.discount'), ('GENERAL_MANAGER', 'order.void'),
    ('GENERAL_MANAGER', 'kot.view'), ('GENERAL_MANAGER', 'kot.create'), ('GENERAL_MANAGER', 'kot.reprint'), ('GENERAL_MANAGER', 'kot.cancel'),
    ('GENERAL_MANAGER', 'bill.view'), ('GENERAL_MANAGER', 'bill.create'), ('GENERAL_MANAGER', 'bill.discount'), ('GENERAL_MANAGER', 'bill.void'),
    ('GENERAL_MANAGER', 'payment.view'), ('GENERAL_MANAGER', 'payment.create'), ('GENERAL_MANAGER', 'payment.refund'),

    -- A property manager carries the same operational reach inside their one site.
    ('PROPERTY_MANAGER', 'restaurant.view'),
    ('PROPERTY_MANAGER', 'menu.view'), ('PROPERTY_MANAGER', 'menu.create'), ('PROPERTY_MANAGER', 'menu.edit'),
    ('PROPERTY_MANAGER', 'menu.archive'), ('PROPERTY_MANAGER', 'menu.publish'),
    ('PROPERTY_MANAGER', 'table.view'), ('PROPERTY_MANAGER', 'table.create'), ('PROPERTY_MANAGER', 'table.edit'),
    ('PROPERTY_MANAGER', 'table.archive'),
    ('PROPERTY_MANAGER', 'order.view'), ('PROPERTY_MANAGER', 'order.create'), ('PROPERTY_MANAGER', 'order.edit'),
    ('PROPERTY_MANAGER', 'order.cancel'), ('PROPERTY_MANAGER', 'order.discount'), ('PROPERTY_MANAGER', 'order.void'),
    ('PROPERTY_MANAGER', 'kot.view'), ('PROPERTY_MANAGER', 'kot.create'), ('PROPERTY_MANAGER', 'kot.reprint'), ('PROPERTY_MANAGER', 'kot.cancel'),
    ('PROPERTY_MANAGER', 'bill.view'), ('PROPERTY_MANAGER', 'bill.create'), ('PROPERTY_MANAGER', 'bill.discount'), ('PROPERTY_MANAGER', 'bill.void'),
    ('PROPERTY_MANAGER', 'payment.view'), ('PROPERTY_MANAGER', 'payment.create'), ('PROPERTY_MANAGER', 'payment.refund'),

    -- The restaurant manager owns the floor: menu, covers, orders, the pass and the till,
    -- including the void/publish/refund verbs that stop at manager level.
    ('RESTAURANT_MANAGER', 'restaurant.view'),
    ('RESTAURANT_MANAGER', 'menu.view'), ('RESTAURANT_MANAGER', 'menu.create'), ('RESTAURANT_MANAGER', 'menu.edit'),
    ('RESTAURANT_MANAGER', 'menu.archive'), ('RESTAURANT_MANAGER', 'menu.publish'),
    ('RESTAURANT_MANAGER', 'table.view'), ('RESTAURANT_MANAGER', 'table.create'), ('RESTAURANT_MANAGER', 'table.edit'),
    ('RESTAURANT_MANAGER', 'table.archive'),
    ('RESTAURANT_MANAGER', 'order.view'), ('RESTAURANT_MANAGER', 'order.create'), ('RESTAURANT_MANAGER', 'order.edit'),
    ('RESTAURANT_MANAGER', 'order.cancel'), ('RESTAURANT_MANAGER', 'order.discount'), ('RESTAURANT_MANAGER', 'order.void'),
    ('RESTAURANT_MANAGER', 'kot.view'), ('RESTAURANT_MANAGER', 'kot.create'), ('RESTAURANT_MANAGER', 'kot.reprint'), ('RESTAURANT_MANAGER', 'kot.cancel'),
    ('RESTAURANT_MANAGER', 'bill.view'), ('RESTAURANT_MANAGER', 'bill.create'), ('RESTAURANT_MANAGER', 'bill.discount'), ('RESTAURANT_MANAGER', 'bill.void'),
    ('RESTAURANT_MANAGER', 'payment.view'), ('RESTAURANT_MANAGER', 'payment.create'), ('RESTAURANT_MANAGER', 'payment.refund'),

    -- Kitchen manager: the pass, not the till. Sees the menu and flips item availability
    -- (menu.edit is the availability door's verb), owns every KOT action, holds no money
    -- verb and never builds or publishes the menu itself.
    ('KITCHEN_MANAGER', 'restaurant.view'),
    ('KITCHEN_MANAGER', 'menu.view'), ('KITCHEN_MANAGER', 'menu.edit'),
    ('KITCHEN_MANAGER', 'kot.view'), ('KITCHEN_MANAGER', 'kot.create'),
    ('KITCHEN_MANAGER', 'kot.reprint'), ('KITCHEN_MANAGER', 'kot.cancel'),

    -- Staff: work a table and a bill. Take and amend orders, raise the KOT, open and view
    -- the bill, take a payment. Cannot discount, void or refund — those are a manager's
    -- signature.
    ('STAFF', 'restaurant.view'),
    ('STAFF', 'menu.view'),
    ('STAFF', 'table.view'),
    ('STAFF', 'order.view'), ('STAFF', 'order.create'), ('STAFF', 'order.edit'),
    ('STAFF', 'kot.create'),
    ('STAFF', 'bill.view'), ('STAFF', 'bill.create'),
    ('STAFF', 'payment.view'), ('STAFF', 'payment.create'),

    -- Event manager: builds and retires its own banquet menus and tables and runs its
    -- orders through to opening a bill. Publishing the canonical menu, and every
    -- void/discount/refund, stay with the restaurant/property managers.
    ('EVENT_MANAGER', 'restaurant.view'),
    ('EVENT_MANAGER', 'menu.view'), ('EVENT_MANAGER', 'menu.create'), ('EVENT_MANAGER', 'menu.edit'),
    ('EVENT_MANAGER', 'menu.archive'),
    ('EVENT_MANAGER', 'table.view'), ('EVENT_MANAGER', 'table.create'), ('EVENT_MANAGER', 'table.edit'),
    ('EVENT_MANAGER', 'order.view'), ('EVENT_MANAGER', 'order.create'), ('EVENT_MANAGER', 'order.edit'),
    ('EVENT_MANAGER', 'kot.view'), ('EVENT_MANAGER', 'kot.create'),
    ('EVENT_MANAGER', 'bill.view'),

    -- Finance manager reads the money across the group. Views only — refunds are an
    -- outlet's operational act, not a back-office one.
    ('FINANCE_MANAGER', 'restaurant.view'),
    ('FINANCE_MANAGER', 'menu.view'), ('FINANCE_MANAGER', 'order.view'),
    ('FINANCE_MANAGER', 'bill.view'), ('FINANCE_MANAGER', 'payment.view')

    -- PLATFORM_ADMIN holds none of these explicitly: app.has_permission short-circuits on
    -- the platform seat and public.my_permissions returns the whole catalogue for it, the
    -- same arrangement 006 uses for organization/property/audit.
    -- HOUSEKEEPING_MANAGER, STORE_MANAGER, HR_MANAGER hold no restaurant token: their remit
    -- does not include the floor.
)
insert into public.role_permissions (role_id, permission)
select r.id, m.permission
  from role_permission_matrix m
  join public.roles r on r.name = m.role_name
on conflict (role_id, permission) do nothing;

-- ------------------------------------------------------------------ self-checks

-- A half-applied seed must fail loudly, the way 006's do-block does. Each assertion below
-- is a distinct way the ladder could silently break.
do $$
declare
  v_new_count   integer;
  v_total       integer;
  v_sensitive   integer;
  v_km_money    integer;
  v_km_publish  integer;
  v_staff_void  integer;
begin
  -- 1. All 27 restaurant tokens now exist in the catalogue (granted to at least one role).
  select count(distinct permission) into v_new_count from public.role_permissions
   where permission in (
      'restaurant.view',
      'menu.view', 'menu.create', 'menu.edit', 'menu.archive', 'menu.publish',
      'table.view', 'table.create', 'table.edit', 'table.archive',
      'order.view', 'order.create', 'order.edit', 'order.cancel', 'order.discount', 'order.void',
      'kot.view', 'kot.create', 'kot.reprint', 'kot.cancel',
      'bill.view', 'bill.create', 'bill.discount', 'bill.void',
      'payment.view', 'payment.create', 'payment.refund');
  perform app.require_valid(v_new_count = 27, 'NIVAAS_PERMISSION_SEED_BROKEN');

  -- 2. The catalogue grew by exactly this file's tokens: 27 before (006's 25 + 011's 2),
  --    54 now. A collision or a stray extra would show as a wrong total.
  select count(distinct permission) into v_total from public.role_permissions;
  perform app.require_valid(v_total = 54, 'NIVAAS_PERMISSION_SEED_BROKEN');

  -- 3. The money-sensitive tokens exist ONLY at manager level and above. Kitchen manager
  --    and staff must hold none of payment.refund / order.discount / order.void /
  --    bill.void / bill.discount — the whole reason this file separates menu.edit from
  --    menu.publish and availability from pricing.
  select count(*) into v_sensitive from public.role_permissions rp
    join public.roles r on r.id = rp.role_id
   where r.name in ('KITCHEN_MANAGER', 'STAFF')
     and rp.permission in ('payment.refund', 'order.discount', 'order.void',
                           'bill.void', 'bill.discount');
  perform app.require_valid(v_sensitive = 0, 'NIVAAS_PERMISSION_LADDER_BROKEN');

  -- 4. Kitchen manager holds no money verb whatsoever, and cannot publish the menu.
  select count(*) into v_km_money from public.role_permissions rp
    join public.roles r on r.id = rp.role_id
   where r.name = 'KITCHEN_MANAGER'
     and rp.permission in ('payment.view', 'payment.create', 'payment.refund',
                           'bill.view', 'bill.create', 'bill.discount', 'bill.void',
                           'order.discount', 'order.void');
  perform app.require_valid(v_km_money = 0, 'NIVAAS_PERMISSION_LADDER_BROKEN');

  select count(*) into v_km_publish from public.role_permissions rp
    join public.roles r on r.id = rp.role_id
   where r.name = 'KITCHEN_MANAGER' and rp.permission = 'menu.publish';
  perform app.require_valid(v_km_publish = 0, 'NIVAAS_PERMISSION_LADDER_BROKEN');

  -- 5. Staff can open a bill and take a payment but never void one.
  select count(*) into v_staff_void from public.role_permissions rp
    join public.roles r on r.id = rp.role_id
   where r.name = 'STAFF'
     and rp.permission in ('bill.void', 'order.void', 'payment.refund');
  perform app.require_valid(v_staff_void = 0, 'NIVAAS_PERMISSION_LADDER_BROKEN');
end;
$$;
