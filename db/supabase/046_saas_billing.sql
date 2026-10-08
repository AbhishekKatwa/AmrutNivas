-- 046: SaaS Subscription, Billing, Usage & Entitlements
-- AMRUT NIVAAS SaaS billing layer — the customer paying AMRUT NIVAAS.
-- This is SEPARATE from hospitality finance (the customer's business finance).
-- All tables are org-scoped under RLS. Writes through security-definer doors.

-- =====================================================================
-- 1. SUBSCRIPTION PLANS
-- =====================================================================

-- A subscription plan defines what an organization gets: features, limits, pricing.
-- Plans are platform-wide (not org-scoped) — all organizations see the same catalogue.
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id               uuid primary key default gen_random_uuid(),

  code             text not null unique check (code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  name             text not null check (char_length(name) between 2 and 120),
  description      text,

  status           text not null default 'DRAFT'
                   check (status in ('DRAFT','ACTIVE','INACTIVE','ARCHIVED')),

  billing_interval text not null default 'MONTHLY'
                   check (billing_interval in ('MONTHLY','YEARLY')),

  -- Money stored as numeric(14,2) — never floating point.
  base_price       numeric(14,2) not null default 0,
  currency         text not null default 'INR' check (char_length(currency) = 3),

  trial_days       integer not null default 0 check (trial_days >= 0),

  -- Soft limits (can be overridden per-org). NULL means unlimited.
  max_properties   integer,
  max_outlets      integer,
  max_users        integer,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.subscription_plans is
  'SaaS subscription plans. Platform-wide, not org-scoped. Defines features, limits, pricing.';

drop trigger if exists subscription_plans_touch on public.subscription_plans;
create trigger subscription_plans_touch before update on public.subscription_plans
  for each row execute function app.touch_updated_at();

-- =====================================================================
-- 2. PLAN FEATURES
-- =====================================================================

-- Which modules/features a plan includes. A plan without a row for a feature
-- is treated as that feature being disabled.
CREATE TABLE IF NOT EXISTS public.plan_features (
  id               uuid primary key default gen_random_uuid(),
  plan_id          uuid not null references public.subscription_plans(id) on delete cascade,

  -- Feature names match the ModuleName type in enterprise/types.ts, plus
  -- platform-level features like ENTERPRISE.
  feature          text not null check (feature in (
                     'RESTAURANT','HOTEL','INVENTORY','PROCUREMENT','FINANCE',
                     'CRM','EVENTS','HR','COMMERCE','ENTERPRISE'
                   )),
  enabled          boolean not null default true,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  unique (plan_id, feature)
);

comment on table public.plan_features is
  'Which modules/features each plan includes. Missing row = feature disabled.';

create index if not exists plan_features_plan_idx on public.plan_features (plan_id);

drop trigger if exists plan_features_touch on public.plan_features;
create trigger plan_features_touch before update on public.plan_features
  for each row execute function app.touch_updated_at();

-- =====================================================================
-- 3. PLAN LIMITS
-- =====================================================================

-- Hard and soft limits for a plan. Metrics like MAX_PROPERTIES, MAX_USERS, etc.
-- is_hard_limit = true means the limit is enforced (cannot exceed).
-- is_hard_limit = false means the limit is a soft warning (can exceed with warning).
CREATE TABLE IF NOT EXISTS public.plan_limits (
  id               uuid primary key default gen_random_uuid(),
  plan_id          uuid not null references public.subscription_plans(id) on delete cascade,

  metric           text not null check (metric in (
                     'MAX_PROPERTIES','MAX_OUTLETS','MAX_USERS','MAX_EMPLOYEES',
                     'MAX_ROOMS','MAX_ORDERS_PER_MONTH','MAX_EVENTS','MAX_STORAGE_GB'
                   )),
  limit_value      integer not null check (limit_value > 0),
  unit             text not null default 'COUNT',

  is_hard_limit    boolean not null default true,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  unique (plan_id, metric)
);

comment on table public.plan_limits is
  'Usage limits per plan. Hard limits are enforced; soft limits are warnings.';

create index if not exists plan_limits_plan_idx on public.plan_limits (plan_id);

drop trigger if exists plan_limits_touch on public.plan_limits;
create trigger plan_limits_touch before update on public.plan_limits
  for each row execute function app.touch_updated_at();

-- =====================================================================
-- 4. SUBSCRIPTIONS
-- =====================================================================

-- An organization's subscription to a plan. Only one active subscription per org.
-- Status lifecycle: TRIALING → ACTIVE → PAST_DUE → CANCELLED/EXPIRED.
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,

  plan_id          uuid not null references public.subscription_plans(id),

  status           text not null default 'TRIALING'
                   check (status in ('TRIALING','ACTIVE','PAST_DUE','PAUSED','CANCELLED','EXPIRED')),

  start_date       date not null,
  current_period_start date not null,
  current_period_end date not null,

  -- Trial period (nullable — not all subscriptions have a trial).
  trial_start      date,
  trial_end        date,

  -- Cancellation: cancel_at_period_end = true means the subscription will end
  -- at the close of the current period, not immediately.
  cancel_at_period_end boolean not null default false,
  cancelled_at     timestamptz,
  cancellation_reason text,

  currency         text not null default 'INR' check (char_length(currency) = 3),

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.subscriptions is
  'Organization subscriptions to SaaS plans. One active subscription per org.';

create index if not exists subscriptions_org_idx on public.subscriptions (organization_id);
create index if not exists subscriptions_plan_idx on public.subscriptions (plan_id);
create index if not exists subscriptions_status_idx on public.subscriptions (status);

drop trigger if exists subscriptions_touch on public.subscriptions;
create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function app.touch_updated_at();

-- =====================================================================
-- 5. SUBSCRIPTION EVENTS
-- =====================================================================

-- Immutable audit trail of subscription lifecycle events.
-- Never delete rows — this is the subscription history.
CREATE TABLE IF NOT EXISTS public.subscription_events (
  id               uuid primary key default gen_random_uuid(),
  subscription_id  uuid not null references public.subscriptions(id) on delete cascade,
  organization_id  uuid not null references public.organizations(id) on delete restrict,

  event_type       text not null check (event_type in (
                     'SUBSCRIPTION_CREATED','TRIAL_STARTED','TRIAL_ENDED',
                     'PLAN_CHANGED','SUBSCRIPTION_RENEWED',
                     'PAYMENT_SUCCEEDED','PAYMENT_FAILED',
                     'PAST_DUE','CANCELLATION_REQUESTED','CANCELLED',
                     'SUBSCRIPTION_EXPIRED','SUBSCRIPTION_REACTIVATED'
                   )),

  -- Flexible metadata: old_plan_id, new_plan_id, reason, etc.
  metadata         jsonb not null default '{}',

  created_at       timestamptz not null default now(),
  created_by       uuid references auth.users(id)
);

comment on table public.subscription_events is
  'Immutable subscription lifecycle audit trail. Never delete rows.';

create index if not exists subscription_events_sub_idx on public.subscription_events (subscription_id);
create index if not exists subscription_events_org_idx on public.subscription_events (organization_id);
create index if not exists subscription_events_type_idx on public.subscription_events (event_type);

-- =====================================================================
-- 6. BILLING ACCOUNTS
-- =====================================================================

-- The legal/billing identity for an organization. May differ from the operational
-- organization name (e.g. a holding company vs. the brand name).
CREATE TABLE IF NOT EXISTS public.billing_accounts (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict unique,

  billing_name     text not null check (char_length(billing_name) between 2 and 200),
  legal_name       text,

  email            text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone            text,

  address_line1    text,
  address_line2    text,
  city             text,
  state            text,
  country          text not null default 'India',
  postal_code      text,

  -- GSTIN or other tax ID for invoicing.
  tax_id           text,

  currency         text not null default 'INR' check (char_length(currency) = 3),

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.billing_accounts is
  'Legal/billing identity for an organization. One per org.';

create index if not exists billing_accounts_org_idx on public.billing_accounts (organization_id);

drop trigger if exists billing_accounts_touch on public.billing_accounts;
create trigger billing_accounts_touch before update on public.billing_accounts
  for each row execute function app.touch_updated_at();

-- =====================================================================
-- 7. SAAS INVOICES
-- =====================================================================

-- SaaS subscription invoices. SEPARATE from hospitality sales invoices.
-- Invoice numbers are org-scoped and sequential: AMRUT-INV-2026-000001.
CREATE TABLE IF NOT EXISTS public.saas_invoices (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  billing_account_id uuid references public.billing_accounts(id),
  subscription_id  uuid references public.subscriptions(id),

  -- Human-readable invoice number, unique per org.
  invoice_number   text not null,

  invoice_date     date not null default current_date,
  period_start     date,
  period_end       date,

  currency         text not null default 'INR' check (char_length(currency) = 3),

  -- Money stored as numeric(14,2).
  subtotal         numeric(14,2) not null default 0,
  discount         numeric(14,2) not null default 0,
  tax              numeric(14,2) not null default 0,
  total            numeric(14,2) not null default 0,

  status           text not null default 'DRAFT'
                   check (status in ('DRAFT','ISSUED','PARTIALLY_PAID','PAID','OVERDUE','VOID','CANCELLED')),

  due_date         date,
  paid_at          timestamptz,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  unique (organization_id, invoice_number)
);

comment on table public.saas_invoices is
  'SaaS subscription invoices. Separate from hospitality sales invoices.';

create index if not exists saas_invoices_org_idx on public.saas_invoices (organization_id);
create index if not exists saas_invoices_sub_idx on public.saas_invoices (subscription_id);
create index if not exists saas_invoices_status_idx on public.saas_invoices (status);

drop trigger if exists saas_invoices_touch on public.saas_invoices;
create trigger saas_invoices_touch before update on public.saas_invoices
  for each row execute function app.touch_updated_at();

-- =====================================================================
-- 8. SAAS INVOICE LINES
-- =====================================================================

-- Line items on a SaaS invoice.
CREATE TABLE IF NOT EXISTS public.saas_invoice_lines (
  id               uuid primary key default gen_random_uuid(),
  invoice_id       uuid not null references public.saas_invoices(id) on delete cascade,

  description      text not null check (char_length(description) between 1 and 500),
  quantity         numeric(10,2) not null default 1,
  unit_price       numeric(14,2) not null default 0,
  discount         numeric(14,2) not null default 0,
  tax_rate         numeric(5,2) not null default 0,
  amount           numeric(14,2) not null default 0,

  -- Optional reference to a plan, feature, or usage metric.
  reference_type   text,
  reference_id     uuid,

  created_at       timestamptz not null default now()
);

comment on table public.saas_invoice_lines is
  'Line items on a SaaS invoice.';

create index if not exists saas_invoice_lines_inv_idx on public.saas_invoice_lines (invoice_id);

-- =====================================================================
-- 9. SAAS PAYMENTS
-- =====================================================================

-- Payments against SaaS invoices. SEPARATE from hospitality payments.
CREATE TABLE IF NOT EXISTS public.saas_payments (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  invoice_id       uuid references public.saas_invoices(id),
  subscription_id  uuid references public.subscriptions(id),

  amount           numeric(14,2) not null check (amount > 0),
  currency         text not null default 'INR' check (char_length(currency) = 3),

  method           text not null check (method in ('CARD','UPI','BANK_TRANSFER','OTHER')),

  status           text not null default 'PENDING'
                   check (status in ('PENDING','SUCCESS','FAILED','REFUNDED','PARTIALLY_REFUNDED')),

  -- External transaction reference (e.g. Razorpay/Stripe payment ID).
  transaction_reference text,

  paid_at          timestamptz,

  created_at       timestamptz not null default now()
);

comment on table public.saas_payments is
  'Payments against SaaS invoices. Separate from hospitality payments.';

create index if not exists saas_payments_org_idx on public.saas_payments (organization_id);
create index if not exists saas_payments_inv_idx on public.saas_payments (invoice_id);
create index if not exists saas_payments_status_idx on public.saas_payments (status);

-- =====================================================================
-- 10. USAGE SNAPSHOTS
-- =====================================================================

-- Periodic snapshots of usage metrics for an organization.
-- Used for billing and limit enforcement.
CREATE TABLE IF NOT EXISTS public.usage_snapshots (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,

  metric           text not null check (metric in (
                     'PROPERTIES','OUTLETS','USERS','EMPLOYEES','ROOMS',
                     'ORDERS','EVENTS','STORAGE_GB'
                   )),
  period_start     date not null,
  period_end       date not null,

  quantity         integer not null default 0,
  calculated_at    timestamptz not null default now()
);

comment on table public.usage_snapshots is
  'Periodic usage snapshots for billing and limit enforcement.';

create index if not exists usage_snapshots_org_idx on public.usage_snapshots (organization_id);
create index if not exists usage_snapshots_period_idx on public.usage_snapshots (period_start, period_end);

-- =====================================================================
-- 11. SAAS BILLING SETTINGS
-- =====================================================================

-- Platform-wide billing configuration. Only one row (singleton).
CREATE TABLE IF NOT EXISTS public.saas_billing_settings (
  id               uuid primary key default gen_random_uuid(),

  default_billing_interval text not null default 'MONTHLY'
                           check (default_billing_interval in ('MONTHLY','YEARLY')),
  default_trial_days       integer not null default 14 check (default_trial_days >= 0),
  grace_period_days        integer not null default 7 check (grace_period_days >= 0),
  invoice_due_days         integer not null default 7 check (invoice_due_days >= 0),

  invoice_number_prefix    text not null default 'AMRUT-INV',
  invoice_number_seed      integer not null default 1 check (invoice_number_seed > 0),

  updated_at       timestamptz not null default now()
);

comment on table public.saas_billing_settings is
  'Platform-wide SaaS billing configuration. Singleton (one row).';

-- Insert default settings if not exists.
INSERT INTO public.saas_billing_settings (id)
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

drop trigger if exists saas_billing_settings_touch on public.saas_billing_settings;
create trigger saas_billing_settings_touch before update on public.saas_billing_settings
  for each row execute function app.touch_updated_at();

-- =====================================================================
-- 12. RLS POLICIES
-- =====================================================================

-- Subscription plans are platform-wide (readable by all authenticated users).
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

drop policy if exists subscription_plans_select on public.subscription_plans;
create policy subscription_plans_select on public.subscription_plans
  for select to authenticated
  using (true);

drop policy if exists subscription_plans_write on public.subscription_plans;
create policy subscription_plans_write on public.subscription_plans
  for all
  with check (app.has_permission(app.current_user_id(), app.current_organization_id(), 'billing.plan.manage'));

-- Plan features and limits follow the plan's write policy.
ALTER TABLE public.plan_features ENABLE ROW LEVEL SECURITY;

drop policy if exists plan_features_select on public.plan_features;
create policy plan_features_select on public.plan_features
  for select to authenticated
  using (true);

drop policy if exists plan_features_write on public.plan_features;
create policy plan_features_write on public.plan_features
  for all
  with check (app.has_permission(app.current_user_id(), app.current_organization_id(), 'billing.plan.manage'));

ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;

drop policy if exists plan_limits_select on public.plan_limits;
create policy plan_limits_select on public.plan_limits
  for select to authenticated
  using (true);

drop policy if exists plan_limits_write on public.plan_limits;
create policy plan_limits_write on public.plan_limits
  for all
  with check (app.has_permission(app.current_user_id(), app.current_organization_id(), 'billing.plan.manage'));

-- Subscriptions are org-scoped.
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions
  for select to authenticated
  using (organization_id = app.current_organization_id());

drop policy if exists subscriptions_write on public.subscriptions;
create policy subscriptions_write on public.subscriptions
  for all
  with check (
    organization_id = app.current_organization_id()
    and app.has_permission(app.current_user_id(), app.current_organization_id(), 'billing.subscription.manage')
  );

-- Subscription events are org-scoped (read-only for most users).
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

drop policy if exists subscription_events_select on public.subscription_events;
create policy subscription_events_select on public.subscription_events
  for select to authenticated
  using (organization_id = app.current_organization_id());

-- Billing accounts are org-scoped.
ALTER TABLE public.billing_accounts ENABLE ROW LEVEL SECURITY;

drop policy if exists billing_accounts_select on public.billing_accounts;
create policy billing_accounts_select on public.billing_accounts
  for select to authenticated
  using (organization_id = app.current_organization_id());

drop policy if exists billing_accounts_write on public.billing_accounts;
create policy billing_accounts_write on public.billing_accounts
  for all
  with check (
    organization_id = app.current_organization_id()
    and app.has_permission(app.current_user_id(), app.current_organization_id(), 'billing.account.manage')
  );

-- SaaS invoices are org-scoped.
ALTER TABLE public.saas_invoices ENABLE ROW LEVEL SECURITY;

drop policy if exists saas_invoices_select on public.saas_invoices;
create policy saas_invoices_select on public.saas_invoices
  for select to authenticated
  using (organization_id = app.current_organization_id());

drop policy if exists saas_invoices_write on public.saas_invoices;
create policy saas_invoices_write on public.saas_invoices
  for all
  with check (
    organization_id = app.current_organization_id()
    and app.has_permission(app.current_user_id(), app.current_organization_id(), 'billing.invoice.manage')
  );

-- Invoice lines follow the invoice's policy.
ALTER TABLE public.saas_invoice_lines ENABLE ROW LEVEL SECURITY;

drop policy if exists saas_invoice_lines_select on public.saas_invoice_lines;
create policy saas_invoice_lines_select on public.saas_invoice_lines
  for select to authenticated
  using (
    invoice_id in (
      select id from public.saas_invoices
      where organization_id = app.current_organization_id()
    )
  );

-- SaaS payments are org-scoped.
ALTER TABLE public.saas_payments ENABLE ROW LEVEL SECURITY;

drop policy if exists saas_payments_select on public.saas_payments;
create policy saas_payments_select on public.saas_payments
  for select to authenticated
  using (organization_id = app.current_organization_id());

drop policy if exists saas_payments_write on public.saas_payments;
create policy saas_payments_write on public.saas_payments
  for all
  with check (
    organization_id = app.current_organization_id()
    and app.has_permission(app.current_user_id(), app.current_organization_id(), 'billing.payment.manage')
  );

-- Usage snapshots are org-scoped (read-only for most users).
ALTER TABLE public.usage_snapshots ENABLE ROW LEVEL SECURITY;

drop policy if exists usage_snapshots_select on public.usage_snapshots;
create policy usage_snapshots_select on public.usage_snapshots
  for select to authenticated
  using (organization_id = app.current_organization_id());

-- Billing settings are platform-wide (readable by all, writable by platform admin).
ALTER TABLE public.saas_billing_settings ENABLE ROW LEVEL SECURITY;

drop policy if exists saas_billing_settings_select on public.saas_billing_settings;
create policy saas_billing_settings_select on public.saas_billing_settings
  for select to authenticated
  using (true);

drop policy if exists saas_billing_settings_write on public.saas_billing_settings;
create policy saas_billing_settings_write on public.saas_billing_settings
  for all
  with check (app.has_permission(app.current_user_id(), app.current_organization_id(), 'billing.settings.manage'));

-- =====================================================================
-- 13. BILLING PERMISSIONS
-- =====================================================================

-- SaaS billing permissions. Platform admin manages plans and settings.
-- Organization owner manages their own subscription, billing account, invoices, payments.

DO $$ DECLARE
  perms text[] := array[
    'billing.subscription.view', 'billing.subscription.manage',
    'billing.account.view', 'billing.account.manage',
    'billing.invoice.view', 'billing.invoice.manage',
    'billing.payment.view', 'billing.payment.manage',
    'billing.usage.view'
  ];
  p text;
  v_owner uuid;
BEGIN
  SELECT id INTO v_owner FROM public.roles WHERE name = 'ORG_OWNER' AND is_system;

  FOREACH p IN ARRAY perms LOOP
    INSERT INTO public.role_permissions (role_id, permission) VALUES (v_owner, p) ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- =====================================================================
-- 14. SAAS BILLING DOORS
-- =====================================================================

-- Create or update a subscription for an organization.
create or replace function public.upsert_subscription(
  p_organization uuid,
  p_plan uuid,
  p_status text default 'TRIALING',
  p_start_date date default current_date,
  p_trial_days integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub_id uuid;
  v_trial_end date;
  v_period_end date;
  v_result jsonb;
begin
  if not app.has_permission(app.current_user_id(), app.current_organization_id(), 'billing.subscription.manage') then
    raise exception 'NIVAAS_PERMISSION_DENIED';
  end if;

  -- Calculate trial end and period end.
  v_trial_end = case when p_trial_days > 0 then p_start_date + p_trial_days else null end;
  v_period_end = case
    when p_trial_days > 0 then p_start_date + p_trial_days
    else p_start_date + interval '1 month'
  end;

  -- Check if org already has an active subscription.
  select id into v_sub_id
  from public.subscriptions
  where organization_id = p_organization
    and status in ('TRIALING','ACTIVE','PAST_DUE')
  limit 1;

  if v_sub_id is not null then
    -- Update existing subscription.
    update public.subscriptions
    set plan_id = p_plan,
        status = p_status,
        start_date = p_start_date,
        current_period_start = p_start_date,
        current_period_end = v_period_end,
        trial_start = case when p_trial_days > 0 then p_start_date else null end,
        trial_end = v_trial_end
    where id = v_sub_id
    returning to_jsonb(subscriptions.*) into v_result;

    -- Record event.
    insert into public.subscription_events (subscription_id, organization_id, event_type, metadata)
    values (v_sub_id, p_organization, 'PLAN_CHANGED', jsonb_build_object('plan_id', p_plan));
  else
    -- Create new subscription.
    insert into public.subscriptions (
      organization_id, plan_id, status, start_date,
      current_period_start, current_period_end,
      trial_start, trial_end
    )
    values (
      p_organization, p_plan, p_status, p_start_date,
      p_start_date, v_period_end,
      case when p_trial_days > 0 then p_start_date else null end,
      v_trial_end
    )
    returning id into v_sub_id;

    select to_jsonb(s.*) into v_result
    from public.subscriptions s where id = v_sub_id;

    -- Record events.
    insert into public.subscription_events (subscription_id, organization_id, event_type, metadata)
    values (v_sub_id, p_organization, 'SUBSCRIPTION_CREATED', jsonb_build_object('plan_id', p_plan));

    if p_trial_days > 0 then
      insert into public.subscription_events (subscription_id, organization_id, event_type, metadata)
      values (v_sub_id, p_organization, 'TRIAL_STARTED', jsonb_build_object('trial_days', p_trial_days));
    end if;
  end if;

  return v_result;
end;
$$;

-- Cancel a subscription.
create or replace function public.cancel_subscription(
  p_subscription uuid,
  p_cancel_at_period_end boolean default true,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_event_type text;
begin
  select organization_id into v_org_id
  from public.subscriptions
  where id = p_subscription;

  if v_org_id is null then
    raise exception 'NIVAAS_NOT_FOUND';
  end if;

  if not app.has_permission(app.current_user_id(), app.current_organization_id(), 'billing.subscription.manage') then
    raise exception 'NIVAAS_PERMISSION_DENIED';
  end if;

  if p_cancel_at_period_end then
    update public.subscriptions
    set cancel_at_period_end = true,
        cancelled_at = now(),
        cancellation_reason = p_reason
    where id = p_subscription;

    v_event_type = 'CANCELLATION_REQUESTED';
  else
    update public.subscriptions
    set status = 'CANCELLED',
        cancel_at_period_end = true,
        cancelled_at = now(),
        cancellation_reason = p_reason
    where id = p_subscription;

    v_event_type = 'CANCELLED';
  end if;

  insert into public.subscription_events (subscription_id, organization_id, event_type, metadata)
  values (p_subscription, v_org_id, v_event_type, jsonb_build_object('reason', p_reason));
end;
$$;

-- Create a billing account for an organization.
create or replace function public.upsert_billing_account(
  p_organization uuid,
  p_billing_name text,
  p_email text,
  p_legal_name text default null,
  p_phone text default null,
  p_address_line1 text default null,
  p_address_line2 text default null,
  p_city text default null,
  p_state text default null,
  p_country text default 'India',
  p_postal_code text default null,
  p_tax_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not app.has_permission(app.current_user_id(), app.current_organization_id(), 'billing.account.manage') then
    raise exception 'NIVAAS_PERMISSION_DENIED';
  end if;

  insert into public.billing_accounts (
    organization_id, billing_name, legal_name, email, phone,
    address_line1, address_line2, city, state, country, postal_code, tax_id
  )
  values (
    p_organization, p_billing_name, p_legal_name, p_email, p_phone,
    p_address_line1, p_address_line2, p_city, p_state, p_country, p_postal_code, p_tax_id
  )
  on conflict (organization_id) do update set
    billing_name = excluded.billing_name,
    legal_name = excluded.legal_name,
    email = excluded.email,
    phone = excluded.phone,
    address_line1 = excluded.address_line1,
    address_line2 = excluded.address_line2,
    city = excluded.city,
    state = excluded.state,
    country = excluded.country,
    postal_code = excluded.postal_code,
    tax_id = excluded.tax_id
  returning to_jsonb(billing_accounts.*) into v_result;

  return v_result;
end;
$$;

-- Generate next invoice number for an organization.
create or replace function public.next_saas_invoice_number(
  p_organization uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_year text;
  v_seq integer;
  v_max_seq integer;
begin
  -- Get settings.
  select invoice_number_prefix, invoice_number_seed
  into v_prefix, v_seq
  from public.saas_billing_settings
  limit 1;

  v_year = to_char(current_date, 'YYYY');

  -- Find the max sequence number for this org and year.
  select coalesce(max(
    substring(invoice_number from '(\d+)$')::integer
  ), 0) into v_max_seq
  from public.saas_invoices
  where organization_id = p_organization
    and invoice_number like v_prefix || '-' || v_year || '-%';

  -- Return the next number.
  return v_prefix || '-' || v_year || '-' || lpad((v_max_seq + 1)::text, 6, '0');
end;
$$;

-- Create a SaaS invoice.
create or replace function public.create_saas_invoice(
  p_organization uuid,
  p_subscription uuid default null,
  p_billing_account uuid default null,
  p_period_start date default null,
  p_period_end date default null,
  p_due_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_number text;
  v_result jsonb;
begin
  if not app.has_permission(app.current_user_id(), app.current_organization_id(), 'billing.invoice.manage') then
    raise exception 'NIVAAS_PERMISSION_DENIED';
  end if;

  -- Generate invoice number.
  v_invoice_number = public.next_saas_invoice_number(p_organization);

  insert into public.saas_invoices (
    organization_id, billing_account_id, subscription_id,
    invoice_number, period_start, period_end, due_date
  )
  values (
    p_organization, p_billing_account, p_subscription,
    v_invoice_number, p_period_start, p_period_end, p_due_date
  )
  returning to_jsonb(saas_invoices.*) into v_result;

  return v_result;
end;
$$;

-- Record a SaaS payment.
create or replace function public.record_saas_payment(
  p_organization uuid,
  p_amount numeric,
  p_method text,
  p_invoice uuid default null,
  p_subscription uuid default null,
  p_transaction_ref text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_id uuid;
  v_result jsonb;
begin
  if not app.has_permission(app.current_user_id(), app.current_organization_id(), 'billing.payment.manage') then
    raise exception 'NIVAAS_PERMISSION_DENIED';
  end if;

  insert into public.saas_payments (
    organization_id, invoice_id, subscription_id,
    amount, method, transaction_reference, status, paid_at
  )
  values (
    p_organization, p_invoice, p_subscription,
    p_amount, p_method, p_transaction_ref, 'SUCCESS', now()
  )
  returning id into v_payment_id;

  -- Update invoice status if fully paid.
  if p_invoice is not null then
    update public.saas_invoices
    set status = 'PAID',
        paid_at = now()
    where id = p_invoice
      and total <= (
        select coalesce(sum(amount), 0)
        from public.saas_payments
        where invoice_id = p_invoice and status = 'SUCCESS'
      );
  end if;

  -- Record subscription event.
  if p_subscription is not null then
    insert into public.subscription_events (subscription_id, organization_id, event_type, metadata)
    values (p_subscription, p_organization, 'PAYMENT_SUCCEEDED', jsonb_build_object('amount', p_amount));
  end if;

  select to_jsonb(p.*) into v_result
  from public.saas_payments p where id = v_payment_id;

  return v_result;
end;
$$;

-- Grant execute on SaaS billing doors.
grant execute on function public.upsert_subscription to authenticated;
grant execute on function public.cancel_subscription to authenticated;
grant execute on function public.upsert_billing_account to authenticated;
grant execute on function public.next_saas_invoice_number to authenticated;
grant execute on function public.create_saas_invoice to authenticated;
grant execute on function public.record_saas_payment to authenticated;

-- =====================================================================
-- 15. SEED DATA — SUBSCRIPTION PLANS
-- =====================================================================

-- Seed four starter plans. Prices are placeholders — adjust via admin UI.
INSERT INTO public.subscription_plans (code, name, description, status, billing_interval, base_price, currency, trial_days, max_properties, max_outlets, max_users)
VALUES
  ('STARTER', 'Starter', 'For small restaurants, cafés and single properties.', 'ACTIVE', 'MONTHLY', 1999.00, 'INR', 14, 1, 2, 5),
  ('GROWTH', 'Growth', 'For growing restaurants, hotels and multi-outlet businesses.', 'ACTIVE', 'MONTHLY', 4999.00, 'INR', 14, 5, 10, 20),
  ('PROFESSIONAL', 'Professional', 'For multi-property operations and larger businesses.', 'ACTIVE', 'MONTHLY', 9999.00, 'INR', 14, 20, 50, 100),
  ('ENTERPRISE', 'Enterprise', 'For hospitality groups and enterprise chains. Custom pricing.', 'ACTIVE', 'MONTHLY', 0.00, 'INR', 30, null, null, null)
ON CONFLICT (code) DO NOTHING;

-- Seed plan features.
INSERT INTO public.plan_features (plan_id, feature, enabled)
SELECT p.id, f.feature, f.enabled
FROM public.subscription_plans p
CROSS JOIN (VALUES
  ('STARTER', 'RESTAURANT', true),
  ('STARTER', 'INVENTORY', true),
  ('STARTER', 'FINANCE', true),
  ('STARTER', 'HOTEL', false),
  ('STARTER', 'EVENTS', false),
  ('STARTER', 'HR', false),
  ('STARTER', 'COMMERCE', false),
  ('STARTER', 'ENTERPRISE', false),
  ('GROWTH', 'RESTAURANT', true),
  ('GROWTH', 'INVENTORY', true),
  ('GROWTH', 'FINANCE', true),
  ('GROWTH', 'HOTEL', true),
  ('GROWTH', 'EVENTS', true),
  ('GROWTH', 'HR', true),
  ('GROWTH', 'COMMERCE', true),
  ('GROWTH', 'ENTERPRISE', false),
  ('PROFESSIONAL', 'RESTAURANT', true),
  ('PROFESSIONAL', 'INVENTORY', true),
  ('PROFESSIONAL', 'FINANCE', true),
  ('PROFESSIONAL', 'HOTEL', true),
  ('PROFESSIONAL', 'EVENTS', true),
  ('PROFESSIONAL', 'HR', true),
  ('PROFESSIONAL', 'COMMERCE', true),
  ('PROFESSIONAL', 'ENTERPRISE', true),
  ('ENTERPRISE', 'RESTAURANT', true),
  ('ENTERPRISE', 'INVENTORY', true),
  ('ENTERPRISE', 'FINANCE', true),
  ('ENTERPRISE', 'HOTEL', true),
  ('ENTERPRISE', 'EVENTS', true),
  ('ENTERPRISE', 'HR', true),
  ('ENTERPRISE', 'COMMERCE', true),
  ('ENTERPRISE', 'ENTERPRISE', true)
) AS f(plan_code, feature, enabled)
WHERE p.code = f.plan_code
ON CONFLICT (plan_id, feature) DO NOTHING;

-- Seed plan limits.
INSERT INTO public.plan_limits (plan_id, metric, limit_value, unit, is_hard_limit)
SELECT p.id, l.metric, l.limit_value, l.unit, l.is_hard_limit
FROM public.subscription_plans p
CROSS JOIN (VALUES
  ('STARTER', 'MAX_PROPERTIES', 1, 'COUNT', true),
  ('STARTER', 'MAX_OUTLETS', 2, 'COUNT', true),
  ('STARTER', 'MAX_USERS', 5, 'COUNT', true),
  ('GROWTH', 'MAX_PROPERTIES', 5, 'COUNT', true),
  ('GROWTH', 'MAX_OUTLETS', 10, 'COUNT', true),
  ('GROWTH', 'MAX_USERS', 20, 'COUNT', true),
  ('PROFESSIONAL', 'MAX_PROPERTIES', 20, 'COUNT', true),
  ('PROFESSIONAL', 'MAX_OUTLETS', 50, 'COUNT', true),
  ('PROFESSIONAL', 'MAX_USERS', 100, 'COUNT', true)
) AS l(plan_code, metric, limit_value, unit, is_hard_limit)
WHERE p.code = l.plan_code
ON CONFLICT (plan_id, metric) DO NOTHING;
