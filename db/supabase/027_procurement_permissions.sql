-- AMRUT NIVAAS · 027 — procurement permission tokens (Prompt #07 §42-§43)
--
-- Procurement domain: suppliers, purchase requests, purchase orders, goods receipt,
-- invoices, payments, returns. Same pattern as 022: tokens arrive before the code.
--
-- Cost visibility is sensitive (procurement.cost.view, procurement.landed_cost.manage,
-- procurement.supplier_price.view). Write verbs stop at manager level and above.
-- A store clerk can view suppliers and POs; only a manager can approve or post.

-- --------------------------------------------------------------- the new tokens

do $$
declare
  v_tokens text[] := array[
    'procurement.view',
    'procurement.cost.view',
    'procurement.landed_cost.manage',
    'procurement.supplier_price.view',

    'supplier.view', 'supplier.create', 'supplier.edit', 'supplier.archive',

    'purchase_request.view', 'purchase_request.create', 'purchase_request.edit',
    'purchase_request.submit', 'purchase_request.approve', 'purchase_request.reject',

    'purchase_order.view', 'purchase_order.create', 'purchase_order.edit',
    'purchase_order.submit', 'purchase_order.approve', 'purchase_order.send',
    'purchase_order.cancel', 'purchase_order.close',

    'goods_receipt.view', 'goods_receipt.create', 'goods_receipt.edit',
    'goods_receipt.post', 'goods_receipt.cancel',

    'purchase_invoice.view', 'purchase_invoice.create', 'purchase_invoice.edit',
    'purchase_invoice.post', 'purchase_invoice.cancel',

    'supplier_payment.view', 'supplier_payment.create', 'supplier_payment.edit',
    'supplier_payment.cancel',

    'purchase_return.view', 'purchase_return.create', 'purchase_return.post'
  ];
begin
  perform app.require_valid(array_length(v_tokens, 1) = 40, 'NIVAAS_PERMISSION_SEED_BROKEN');
  perform app.require_valid(
    not exists (select t from unnest(v_tokens) t
                 where t !~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
    'NIVAAS_PERMISSION_SEED_BROKEN');
end;
$$;

-- ------------------------------------------------------------- delete-and-reinsert

delete from public.role_permissions rp
  using public.roles r
  where r.id = rp.role_id and r.is_system
    and rp.permission in (
      'procurement.view', 'procurement.cost.view',
      'procurement.landed_cost.manage', 'procurement.supplier_price.view',
      'supplier.view', 'supplier.create', 'supplier.edit', 'supplier.archive',
      'purchase_request.view', 'purchase_request.create', 'purchase_request.edit',
      'purchase_request.submit', 'purchase_request.approve', 'purchase_request.reject',
      'purchase_order.view', 'purchase_order.create', 'purchase_order.edit',
      'purchase_order.submit', 'purchase_order.approve', 'purchase_order.send',
      'purchase_order.cancel', 'purchase_order.close',
      'goods_receipt.view', 'goods_receipt.create', 'goods_receipt.edit',
      'goods_receipt.post', 'goods_receipt.cancel',
      'purchase_invoice.view', 'purchase_invoice.create', 'purchase_invoice.edit',
      'purchase_invoice.post', 'purchase_invoice.cancel',
      'supplier_payment.view', 'supplier_payment.create', 'supplier_payment.edit',
      'supplier_payment.cancel',
      'purchase_return.view', 'purchase_return.create', 'purchase_return.post'
    );

with role_permission_matrix(role_name, permission) as (
  values
    -- Owner and administrator reach the whole procurement domain, including cost.
    ('OWNER',            'procurement.view'),
    ('OWNER',            'procurement.cost.view'),
    ('OWNER',            'procurement.landed_cost.manage'),
    ('OWNER',            'procurement.supplier_price.view'),
    ('OWNER',            'supplier.view'),
    ('OWNER',            'supplier.create'),
    ('OWNER',            'supplier.edit'),
    ('OWNER',            'supplier.archive'),
    ('OWNER',            'purchase_request.view'),
    ('OWNER',            'purchase_request.create'),
    ('OWNER',            'purchase_request.edit'),
    ('OWNER',            'purchase_request.submit'),
    ('OWNER',            'purchase_request.approve'),
    ('OWNER',            'purchase_request.reject'),
    ('OWNER',            'purchase_order.view'),
    ('OWNER',            'purchase_order.create'),
    ('OWNER',            'purchase_order.edit'),
    ('OWNER',            'purchase_order.submit'),
    ('OWNER',            'purchase_order.approve'),
    ('OWNER',            'purchase_order.send'),
    ('OWNER',            'purchase_order.cancel'),
    ('OWNER',            'purchase_order.close'),
    ('OWNER',            'goods_receipt.view'),
    ('OWNER',            'goods_receipt.create'),
    ('OWNER',            'goods_receipt.edit'),
    ('OWNER',            'goods_receipt.post'),
    ('OWNER',            'goods_receipt.cancel'),
    ('OWNER',            'purchase_invoice.view'),
    ('OWNER',            'purchase_invoice.create'),
    ('OWNER',            'purchase_invoice.edit'),
    ('OWNER',            'purchase_invoice.post'),
    ('OWNER',            'purchase_invoice.cancel'),
    ('OWNER',            'supplier_payment.view'),
    ('OWNER',            'supplier_payment.create'),
    ('OWNER',            'supplier_payment.edit'),
    ('OWNER',            'supplier_payment.cancel'),
    ('OWNER',            'purchase_return.view'),
    ('OWNER',            'purchase_return.create'),
    ('OWNER',            'purchase_return.post'),

    ('ADMINISTRATOR',    'procurement.view'),
    ('ADMINISTRATOR',    'procurement.cost.view'),
    ('ADMINISTRATOR',    'procurement.landed_cost.manage'),
    ('ADMINISTRATOR',    'procurement.supplier_price.view'),
    ('ADMINISTRATOR',    'supplier.view'),
    ('ADMINISTRATOR',    'supplier.create'),
    ('ADMINISTRATOR',    'supplier.edit'),
    ('ADMINISTRATOR',    'supplier.archive'),
    ('ADMINISTRATOR',    'purchase_request.view'),
    ('ADMINISTRATOR',    'purchase_request.create'),
    ('ADMINISTRATOR',    'purchase_request.edit'),
    ('ADMINISTRATOR',    'purchase_request.submit'),
    ('ADMINISTRATOR',    'purchase_request.approve'),
    ('ADMINISTRATOR',    'purchase_request.reject'),
    ('ADMINISTRATOR',    'purchase_order.view'),
    ('ADMINISTRATOR',    'purchase_order.create'),
    ('ADMINISTRATOR',    'purchase_order.edit'),
    ('ADMINISTRATOR',    'purchase_order.submit'),
    ('ADMINISTRATOR',    'purchase_order.approve'),
    ('ADMINISTRATOR',    'purchase_order.send'),
    ('ADMINISTRATOR',    'purchase_order.cancel'),
    ('ADMINISTRATOR',    'purchase_order.close'),
    ('ADMINISTRATOR',    'goods_receipt.view'),
    ('ADMINISTRATOR',    'goods_receipt.create'),
    ('ADMINISTRATOR',    'goods_receipt.edit'),
    ('ADMINISTRATOR',    'goods_receipt.post'),
    ('ADMINISTRATOR',    'goods_receipt.cancel'),
    ('ADMINISTRATOR',    'purchase_invoice.view'),
    ('ADMINISTRATOR',    'purchase_invoice.create'),
    ('ADMINISTRATOR',    'purchase_invoice.edit'),
    ('ADMINISTRATOR',    'purchase_invoice.post'),
    ('ADMINISTRATOR',    'purchase_invoice.cancel'),
    ('ADMINISTRATOR',    'supplier_payment.view'),
    ('ADMINISTRATOR',    'supplier_payment.create'),
    ('ADMINISTRATOR',    'supplier_payment.edit'),
    ('ADMINISTRATOR',    'supplier_payment.cancel'),
    ('ADMINISTRATOR',    'purchase_return.view'),
    ('ADMINISTRATOR',    'purchase_return.create'),
    ('ADMINISTRATOR',    'purchase_return.post'),

    -- Manager reaches operations but not cost visibility or landed cost management.
    ('MANAGER',          'procurement.view'),
    ('MANAGER',          'supplier.view'),
    ('MANAGER',          'supplier.create'),
    ('MANAGER',          'supplier.edit'),
    ('MANAGER',          'purchase_request.view'),
    ('MANAGER',          'purchase_request.create'),
    ('MANAGER',          'purchase_request.edit'),
    ('MANAGER',          'purchase_request.submit'),
    ('MANAGER',          'purchase_request.approve'),
    ('MANAGER',          'purchase_order.view'),
    ('MANAGER',          'purchase_order.create'),
    ('MANAGER',          'purchase_order.edit'),
    ('MANAGER',          'purchase_order.submit'),
    ('MANAGER',          'purchase_order.approve'),
    ('MANAGER',          'purchase_order.send'),
    ('MANAGER',          'purchase_order.cancel'),
    ('MANAGER',          'purchase_order.close'),
    ('MANAGER',          'goods_receipt.view'),
    ('MANAGER',          'goods_receipt.create'),
    ('MANAGER',          'goods_receipt.edit'),
    ('MANAGER',          'goods_receipt.post'),
    ('MANAGER',          'purchase_invoice.view'),
    ('MANAGER',          'purchase_invoice.create'),
    ('MANAGER',          'purchase_invoice.edit'),
    ('MANAGER',          'purchase_invoice.post'),
    ('MANAGER',          'supplier_payment.view'),
    ('MANAGER',          'supplier_payment.create'),
    ('MANAGER',          'purchase_return.view'),
    ('MANAGER',          'purchase_return.create'),
    ('MANAGER',          'purchase_return.post'),

    -- Supervisor sees suppliers, requests, POs, receipts (read-only mostly).
    ('SUPERVISOR',       'procurement.view'),
    ('SUPERVISOR',       'supplier.view'),
    ('SUPERVISOR',       'purchase_request.view'),
    ('SUPERVISOR',       'purchase_request.create'),
    ('SUPERVISOR',       'purchase_order.view'),
    ('SUPERVISOR',       'goods_receipt.view'),
    ('SUPERVISOR',       'goods_receipt.create'),
    ('SUPERVISOR',       'purchase_invoice.view'),
    ('SUPERVISOR',       'purchase_return.view'),

    -- Staff sees procurement (read-only).
    ('STAFF',            'procurement.view'),
    ('STAFF',            'supplier.view'),
    ('STAFF',            'purchase_request.view'),
    ('STAFF',            'purchase_order.view'),
    ('STAFF',            'goods_receipt.view')
)
insert into public.role_permissions (role_id, permission, granted_by, reason)
select r.id, m.permission, '00000000-0000-0000-0000-000000000000', 'system seed (027)'
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
    'procurement.view', 'procurement.cost.view',
    'procurement.landed_cost.manage', 'procurement.supplier_price.view',
    'supplier.view', 'supplier.create', 'supplier.edit', 'supplier.archive',
    'purchase_request.view', 'purchase_request.create', 'purchase_request.edit',
    'purchase_request.submit', 'purchase_request.approve', 'purchase_request.reject',
    'purchase_order.view', 'purchase_order.create', 'purchase_order.edit',
    'purchase_order.submit', 'purchase_order.approve', 'purchase_order.send',
    'purchase_order.cancel', 'purchase_order.close',
    'goods_receipt.view', 'goods_receipt.create', 'goods_receipt.edit',
    'goods_receipt.post', 'goods_receipt.cancel',
    'purchase_invoice.view', 'purchase_invoice.create', 'purchase_invoice.edit',
    'purchase_invoice.post', 'purchase_invoice.cancel',
    'supplier_payment.view', 'supplier_payment.create', 'supplier_payment.edit',
    'supplier_payment.cancel',
    'purchase_return.view', 'purchase_return.create', 'purchase_return.post'
  );
  -- OWNER + ADMINISTRATOR = 39 each = 78, MANAGER = 29, SUPERVISOR = 9, STAFF = 5 → 121 total.
  perform app.require_valid(v_count = 121,
    'NIVAAS_PERMISSION_COUNT: expected 121 procurement grants, got ' || v_count);
end;
$$;
