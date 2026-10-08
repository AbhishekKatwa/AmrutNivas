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
    'procurement_cost.view',
    'procurement_landed_cost.manage',
    'procurement_supplier_price.view',

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
  perform app.require_valid(array_length(v_tokens, 1) = 39, 'NIVAAS_PERMISSION_SEED_BROKEN');
  perform app.require_valid(
    not exists (select t from unnest(v_tokens) t
                 where t !~ E'^[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*$'),
    'NIVAAS_PERMISSION_SEED_BROKEN');
end;
$$;

-- ------------------------------------------------------------- delete-and-reinsert

delete from public.role_permissions rp
  using public.roles r
  where r.id = rp.role_id and r.is_system
    and rp.permission in (
      'procurement.view', 'procurement_cost.view',
      'procurement_landed_cost.manage', 'procurement_supplier_price.view',
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
    ('ORG_OWNER',            'procurement.view'),
    ('ORG_OWNER',            'procurement_cost.view'),
    ('ORG_OWNER',            'procurement_landed_cost.manage'),
    ('ORG_OWNER',            'procurement_supplier_price.view'),
    ('ORG_OWNER',            'supplier.view'),
    ('ORG_OWNER',            'supplier.create'),
    ('ORG_OWNER',            'supplier.edit'),
    ('ORG_OWNER',            'supplier.archive'),
    ('ORG_OWNER',            'purchase_request.view'),
    ('ORG_OWNER',            'purchase_request.create'),
    ('ORG_OWNER',            'purchase_request.edit'),
    ('ORG_OWNER',            'purchase_request.submit'),
    ('ORG_OWNER',            'purchase_request.approve'),
    ('ORG_OWNER',            'purchase_request.reject'),
    ('ORG_OWNER',            'purchase_order.view'),
    ('ORG_OWNER',            'purchase_order.create'),
    ('ORG_OWNER',            'purchase_order.edit'),
    ('ORG_OWNER',            'purchase_order.submit'),
    ('ORG_OWNER',            'purchase_order.approve'),
    ('ORG_OWNER',            'purchase_order.send'),
    ('ORG_OWNER',            'purchase_order.cancel'),
    ('ORG_OWNER',            'purchase_order.close'),
    ('ORG_OWNER',            'goods_receipt.view'),
    ('ORG_OWNER',            'goods_receipt.create'),
    ('ORG_OWNER',            'goods_receipt.edit'),
    ('ORG_OWNER',            'goods_receipt.post'),
    ('ORG_OWNER',            'goods_receipt.cancel'),
    ('ORG_OWNER',            'purchase_invoice.view'),
    ('ORG_OWNER',            'purchase_invoice.create'),
    ('ORG_OWNER',            'purchase_invoice.edit'),
    ('ORG_OWNER',            'purchase_invoice.post'),
    ('ORG_OWNER',            'purchase_invoice.cancel'),
    ('ORG_OWNER',            'supplier_payment.view'),
    ('ORG_OWNER',            'supplier_payment.create'),
    ('ORG_OWNER',            'supplier_payment.edit'),
    ('ORG_OWNER',            'supplier_payment.cancel'),
    ('ORG_OWNER',            'purchase_return.view'),
    ('ORG_OWNER',            'purchase_return.create'),
    ('ORG_OWNER',            'purchase_return.post'),

    ('ORG_ADMIN',    'procurement.view'),
    ('ORG_ADMIN',    'procurement_cost.view'),
    ('ORG_ADMIN',    'procurement_landed_cost.manage'),
    ('ORG_ADMIN',    'procurement_supplier_price.view'),
    ('ORG_ADMIN',    'supplier.view'),
    ('ORG_ADMIN',    'supplier.create'),
    ('ORG_ADMIN',    'supplier.edit'),
    ('ORG_ADMIN',    'supplier.archive'),
    ('ORG_ADMIN',    'purchase_request.view'),
    ('ORG_ADMIN',    'purchase_request.create'),
    ('ORG_ADMIN',    'purchase_request.edit'),
    ('ORG_ADMIN',    'purchase_request.submit'),
    ('ORG_ADMIN',    'purchase_request.approve'),
    ('ORG_ADMIN',    'purchase_request.reject'),
    ('ORG_ADMIN',    'purchase_order.view'),
    ('ORG_ADMIN',    'purchase_order.create'),
    ('ORG_ADMIN',    'purchase_order.edit'),
    ('ORG_ADMIN',    'purchase_order.submit'),
    ('ORG_ADMIN',    'purchase_order.approve'),
    ('ORG_ADMIN',    'purchase_order.send'),
    ('ORG_ADMIN',    'purchase_order.cancel'),
    ('ORG_ADMIN',    'purchase_order.close'),
    ('ORG_ADMIN',    'goods_receipt.view'),
    ('ORG_ADMIN',    'goods_receipt.create'),
    ('ORG_ADMIN',    'goods_receipt.edit'),
    ('ORG_ADMIN',    'goods_receipt.post'),
    ('ORG_ADMIN',    'goods_receipt.cancel'),
    ('ORG_ADMIN',    'purchase_invoice.view'),
    ('ORG_ADMIN',    'purchase_invoice.create'),
    ('ORG_ADMIN',    'purchase_invoice.edit'),
    ('ORG_ADMIN',    'purchase_invoice.post'),
    ('ORG_ADMIN',    'purchase_invoice.cancel'),
    ('ORG_ADMIN',    'supplier_payment.view'),
    ('ORG_ADMIN',    'supplier_payment.create'),
    ('ORG_ADMIN',    'supplier_payment.edit'),
    ('ORG_ADMIN',    'supplier_payment.cancel'),
    ('ORG_ADMIN',    'purchase_return.view'),
    ('ORG_ADMIN',    'purchase_return.create'),
    ('ORG_ADMIN',    'purchase_return.post'),

    -- Manager reaches operations but not cost visibility or landed cost management.
    ('GENERAL_MANAGER',          'procurement.view'),
    ('GENERAL_MANAGER',          'supplier.view'),
    ('GENERAL_MANAGER',          'supplier.create'),
    ('GENERAL_MANAGER',          'supplier.edit'),
    ('GENERAL_MANAGER',          'purchase_request.view'),
    ('GENERAL_MANAGER',          'purchase_request.create'),
    ('GENERAL_MANAGER',          'purchase_request.edit'),
    ('GENERAL_MANAGER',          'purchase_request.submit'),
    ('GENERAL_MANAGER',          'purchase_request.approve'),
    ('GENERAL_MANAGER',          'purchase_order.view'),
    ('GENERAL_MANAGER',          'purchase_order.create'),
    ('GENERAL_MANAGER',          'purchase_order.edit'),
    ('GENERAL_MANAGER',          'purchase_order.submit'),
    ('GENERAL_MANAGER',          'purchase_order.approve'),
    ('GENERAL_MANAGER',          'purchase_order.send'),
    ('GENERAL_MANAGER',          'purchase_order.cancel'),
    ('GENERAL_MANAGER',          'purchase_order.close'),
    ('GENERAL_MANAGER',          'goods_receipt.view'),
    ('GENERAL_MANAGER',          'goods_receipt.create'),
    ('GENERAL_MANAGER',          'goods_receipt.edit'),
    ('GENERAL_MANAGER',          'goods_receipt.post'),
    ('GENERAL_MANAGER',          'purchase_invoice.view'),
    ('GENERAL_MANAGER',          'purchase_invoice.create'),
    ('GENERAL_MANAGER',          'purchase_invoice.edit'),
    ('GENERAL_MANAGER',          'purchase_invoice.post'),
    ('GENERAL_MANAGER',          'supplier_payment.view'),
    ('GENERAL_MANAGER',          'supplier_payment.create'),
    ('GENERAL_MANAGER',          'purchase_return.view'),
    ('GENERAL_MANAGER',          'purchase_return.create'),
    ('GENERAL_MANAGER',          'purchase_return.post'),

    -- Supervisor sees suppliers, requests, POs, receipts (read-only mostly).
    ('STORE_MANAGER',       'procurement.view'),
    ('STORE_MANAGER',       'supplier.view'),
    ('STORE_MANAGER',       'purchase_request.view'),
    ('STORE_MANAGER',       'purchase_request.create'),
    ('STORE_MANAGER',       'purchase_order.view'),
    ('STORE_MANAGER',       'goods_receipt.view'),
    ('STORE_MANAGER',       'goods_receipt.create'),
    ('STORE_MANAGER',       'purchase_invoice.view'),
    ('STORE_MANAGER',       'purchase_return.view'),

    -- Staff sees procurement (read-only).
    ('STAFF',            'procurement.view'),
    ('STAFF',            'supplier.view'),
    ('STAFF',            'purchase_request.view'),
    ('STAFF',            'purchase_order.view'),
    ('STAFF',            'goods_receipt.view')
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
    'procurement.view', 'procurement_cost.view',
    'procurement_landed_cost.manage', 'procurement_supplier_price.view',
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
  -- ORG_OWNER + ORG_ADMIN = 39 each = 78, GENERAL_MANAGER = 29, STORE_MANAGER = 9, STAFF = 5 → 122 total.
  perform app.require_valid(v_count = 122,
    'NIVAAS_PERMISSION_COUNT: expected 122 procurement grants, got ' || v_count);
end;
$$;
