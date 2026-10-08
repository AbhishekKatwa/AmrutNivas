-- 047: Notifications, Communications, Templates & Automation
-- AMRUT NIVAAS unified notification and automation layer.
-- Domain events → automation rules → notifications/communications/tasks.
-- All tables are org-scoped under RLS. Writes through security-definer doors.

-- =====================================================================
-- 1. DOMAIN EVENTS
-- =====================================================================

-- Domain events are produced by modules (hotel, restaurant, inventory, etc.)
-- and consumed by automation rules. They represent business facts, not commands.
CREATE TABLE IF NOT EXISTS public.domain_events (
  id               uuid primary key default gen_random_uuid(),

  organization_id  uuid not null references public.organizations(id) on delete restrict,
  property_id      uuid references public.properties(id),
  outlet_id        uuid references public.outlets(id),

  event_type       text not null,
  entity_type      text not null,
  entity_id        uuid not null,

  occurred_at      timestamptz not null default now(),
  actor_user_id    uuid references public.users(id),

  metadata         jsonb not null default '{}'::jsonb,

  created_at       timestamptz not null default now()
);

comment on table public.domain_events is
  'Domain events produced by modules and consumed by automation rules.';

create index if not exists domain_events_org_idx on public.domain_events (organization_id);
create index if not exists domain_events_type_idx on public.domain_events (event_type);
create index if not exists domain_events_entity_idx on public.domain_events (entity_type, entity_id);
create index if not exists domain_events_occurred_idx on public.domain_events (occurred_at desc);

-- =====================================================================
-- 2. NOTIFICATIONS
-- =====================================================================

-- In-app notifications for users. Can reference a source entity for deep linking.
CREATE TABLE IF NOT EXISTS public.notifications (
  id               uuid primary key default gen_random_uuid(),

  organization_id  uuid not null references public.organizations(id) on delete restrict,
  property_id      uuid references public.properties(id),
  outlet_id        uuid references public.outlets(id),

  recipient_user_id uuid references public.users(id),

  -- Notification type: INFO, SUCCESS, WARNING, ERROR, ACTION_REQUIRED.
  type             text not null check (type in ('INFO','SUCCESS','WARNING','ERROR','ACTION_REQUIRED')),

  -- Severity: LOW, NORMAL, HIGH, CRITICAL.
  severity         text not null default 'NORMAL'
                   check (severity in ('LOW','NORMAL','HIGH','CRITICAL')),

  title            text not null check (char_length(title) between 1 and 200),
  message          text not null check (char_length(message) between 1 and 2000),

  -- Optional reference to source entity (e.g. reservation, order, event).
  reference_type   text,
  reference_id     uuid,

  -- Status: UNREAD, READ, ARCHIVED.
  status           text not null default 'UNREAD'
                   check (status in ('UNREAD','READ','ARCHIVED')),

  read_at          timestamptz,

  created_at       timestamptz not null default now()
);

comment on table public.notifications is
  'In-app notifications for users. Org-scoped, optionally property/outlet-scoped.';

create index if not exists notifications_org_idx on public.notifications (organization_id);
create index if not exists notifications_recipient_idx on public.notifications (recipient_user_id);
create index if not exists notifications_status_idx on public.notifications (status);
create index if not exists notifications_created_idx on public.notifications (created_at desc);

-- =====================================================================
-- 3. NOTIFICATION PREFERENCES
-- =====================================================================

-- Per-user preferences for notification delivery. Controls which channels
-- (in-app, email, SMS, WhatsApp) and frequency (immediate, digest, none).
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id               uuid primary key default gen_random_uuid(),

  user_id          uuid not null references public.users(id) on delete cascade,

  -- Event type pattern (e.g. 'HOTEL.RESERVATION_CONFIRMED' or 'HOTEL.*' for all hotel events).
  event_type       text not null,

  -- Channel toggles.
  in_app_enabled   boolean not null default true,
  email_enabled    boolean not null default false,
  sms_enabled      boolean not null default false,
  whatsapp_enabled boolean not null default false,

  -- Frequency: IMMEDIATE, DAILY_DIGEST, WEEKLY_DIGEST, NONE.
  frequency        text not null default 'IMMEDIATE'
                   check (frequency in ('IMMEDIATE','DAILY_DIGEST','WEEKLY_DIGEST','NONE')),

  -- Quiet hours (optional). Notifications queued during quiet hours.
  quiet_hours_enabled boolean not null default false,
  quiet_hours_start   time,
  quiet_hours_end     time,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  unique (user_id, event_type)
);

comment on table public.notification_preferences is
  'Per-user notification delivery preferences by event type.';

create index if not exists notification_preferences_user_idx on public.notification_preferences (user_id);

drop trigger if exists notification_preferences_touch on public.notification_preferences;
create trigger notification_preferences_touch before update on public.notification_preferences
  for each row execute function app.touch_updated_at();

-- =====================================================================
-- 4. NOTIFICATION TEMPLATES
-- =====================================================================

-- Reusable templates for notifications and communications. Support variables
-- like {{customerName}}, {{reservationNumber}}, etc.
-- Organization-specific templates override platform defaults.
CREATE TABLE IF NOT EXISTS public.notification_templates (
  id               uuid primary key default gen_random_uuid(),

  organization_id  uuid references public.organizations(id) on delete cascade,

  event_type       text not null,

  -- Channel: IN_APP, EMAIL, SMS, WHATSAPP.
  channel          text not null check (channel in ('IN_APP','EMAIL','SMS','WHATSAPP')),

  name             text not null check (char_length(name) between 2 and 120),

  subject          text,
  body             text not null check (char_length(body) between 1 and 5000),

  -- JSON array of variable names used in the template.
  variables        jsonb not null default '[]'::jsonb,

  status           text not null default 'ACTIVE'
                   check (status in ('ACTIVE','INACTIVE','DRAFT')),

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.notification_templates is
  'Reusable templates for notifications and communications. Org-specific or platform-wide.';

create index if not exists notification_templates_org_idx on public.notification_templates (organization_id);
create index if not exists notification_templates_event_idx on public.notification_templates (event_type);

drop trigger if exists notification_templates_touch on public.notification_templates;
create trigger notification_templates_touch before update on public.notification_templates
  for each row execute function app.touch_updated_at();

-- =====================================================================
-- 5. COMMUNICATION MESSAGES
-- =====================================================================

-- Outbound communications (email, SMS, WhatsApp). Tracks delivery status,
-- provider, and retry logic. Linked to a template and optional domain event.
CREATE TABLE IF NOT EXISTS public.communication_messages (
  id               uuid primary key default gen_random_uuid(),

  organization_id  uuid not null references public.organizations(id) on delete restrict,

  -- Recipient (user, customer, or external contact).
  recipient_type   text not null check (recipient_type in ('USER','CUSTOMER','EXTERNAL')),
  recipient_id     uuid,

  -- Channel: EMAIL, SMS, WHATSAPP.
  channel          text not null check (channel in ('EMAIL','SMS','WHATSAPP')),

  template_id      uuid references public.notification_templates(id),

  subject          text,
  body             text not null,

  -- Status: QUEUED, SENDING, SENT, DELIVERED, FAILED, CANCELLED.
  status           text not null default 'QUEUED'
                   check (status in ('QUEUED','SENDING','SENT','DELIVERED','FAILED','CANCELLED')),

  -- Provider tracking.
  provider         text,
  provider_message_id text,

  scheduled_at     timestamptz,
  sent_at          timestamptz,
  delivered_at     timestamptz,
  failed_at        timestamptz,

  error_message    text,

  -- Retry logic.
  retry_count      integer not null default 0,
  max_retries      integer not null default 3,

  created_at       timestamptz not null default now()
);

comment on table public.communication_messages is
  'Outbound communications (email, SMS, WhatsApp) with delivery tracking.';

create index if not exists communication_messages_org_idx on public.communication_messages (organization_id);
create index if not exists communication_messages_status_idx on public.communication_messages (status);
create index if not exists communication_messages_created_idx on public.communication_messages (created_at desc);

-- =====================================================================
-- 6. AUTOMATION RULES
-- =====================================================================

-- Automation rules react to domain events. Each rule has conditions (JSON)
-- and actions (JSON array). Status: ACTIVE, INACTIVE, DRAFT.
CREATE TABLE IF NOT EXISTS public.automation_rules (
  id               uuid primary key default gen_random_uuid(),

  organization_id  uuid not null references public.organizations(id) on delete restrict,

  name             text not null check (char_length(name) between 2 and 200),
  description      text,

  -- Event type that triggers this rule.
  event_type       text not null,

  -- Conditions (JSON array of condition objects).
  conditions       jsonb not null default '[]'::jsonb,

  -- Actions (JSON array of action objects).
  actions          jsonb not null default '[]'::jsonb,

  status           text not null default 'DRAFT'
                   check (status in ('ACTIVE','INACTIVE','DRAFT')),

  created_by       uuid references public.users(id),

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.automation_rules is
  'Automation rules that react to domain events with conditions and actions.';

create index if not exists automation_rules_org_idx on public.automation_rules (organization_id);
create index if not exists automation_rules_event_idx on public.automation_rules (event_type);
create index if not exists automation_rules_status_idx on public.automation_rules (status);

drop trigger if exists automation_rules_touch on public.automation_rules;
create trigger automation_rules_touch before update on public.automation_rules
  for each row execute function app.touch_updated_at();

-- =====================================================================
-- 7. AUTOMATION EXECUTIONS
-- =====================================================================

-- Execution log for automation rules. Provides idempotency and audit trail.
-- Prevents duplicate execution of the same rule for the same event.
CREATE TABLE IF NOT EXISTS public.automation_executions (
  id               uuid primary key default gen_random_uuid(),

  rule_id          uuid not null references public.automation_rules(id) on delete cascade,
  domain_event_id  uuid not null references public.domain_events(id) on delete cascade,

  -- Action index (0-based) within the rule's actions array.
  action_index     integer not null,

  -- Status: PENDING, RUNNING, SUCCESS, FAILED, SKIPPED.
  status           text not null default 'PENDING'
                   check (status in ('PENDING','RUNNING','SUCCESS','FAILED','SKIPPED')),

  executed_at      timestamptz,

  -- Result or error message.
  result           jsonb,

  created_at       timestamptz not null default now(),

  unique (rule_id, domain_event_id, action_index)
);

comment on table public.automation_executions is
  'Execution log for automation rules. Idempotency and audit trail.';

create index if not exists automation_executions_rule_idx on public.automation_executions (rule_id);
create index if not exists automation_executions_event_idx on public.automation_executions (domain_event_id);
create index if not exists automation_executions_status_idx on public.automation_executions (status);

-- =====================================================================
-- 8. RLS POLICIES
-- =====================================================================

-- Domain events are org-scoped (read-only for most users).
ALTER TABLE public.domain_events ENABLE ROW LEVEL SECURITY;

drop policy if exists domain_events_select on public.domain_events;
create policy domain_events_select on public.domain_events
  for select to authenticated
  using (organization_id = app.current_organization_id());

-- Notifications are org-scoped and user-scoped (users see only their own).
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated
  using (
    organization_id = app.current_organization_id()
    and (recipient_user_id = app.current_user_id() or recipient_user_id is null)
  );

drop policy if exists notifications_write on public.notifications
  for all to authenticated
  with check (
    organization_id = app.current_organization_id()
    and app.has_permission('notifications.manage')
  );

-- Notification preferences are user-scoped (users manage only their own).
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

drop policy if exists notification_preferences_select on public.notification_preferences;
create policy notification_preferences_select on public.notification_preferences
  for select to authenticated
  using (user_id = app.current_user_id());

drop policy if exists notification_preferences_write on public.notification_preferences;
create policy notification_preferences_write on public.notification_preferences
  for all to authenticated
  with check (user_id = app.current_user_id());

-- Notification templates are org-scoped (or platform-wide if organization_id is null).
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;

drop policy if exists notification_templates_select on public.notification_templates;
create policy notification_templates_select on public.notification_templates
  for select to authenticated
  using (
    organization_id = app.current_organization_id()
    or organization_id is null
  );

drop policy if exists notification_templates_write on public.notification_templates;
create policy notification_templates_write on public.notification_templates
  for all to authenticated
  with check (
    (organization_id = app.current_organization_id() or organization_id is null)
    and app.has_permission('communications.template.manage')
  );

-- Communication messages are org-scoped.
ALTER TABLE public.communication_messages ENABLE ROW LEVEL SECURITY;

drop policy if exists communication_messages_select on public.communication_messages;
create policy communication_messages_select on public.communication_messages
  for select to authenticated
  using (organization_id = app.current_organization_id());

drop policy if exists communication_messages_write on public.communication_messages;
create policy communication_messages_write on public.communication_messages
  for all to authenticated
  with check (
    organization_id = app.current_organization_id()
    and app.has_permission('communications.manage')
  );

-- Automation rules are org-scoped.
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;

drop policy if exists automation_rules_select on public.automation_rules;
create policy automation_rules_select on public.automation_rules
  for select to authenticated
  using (organization_id = app.current_organization_id());

drop policy if exists automation_rules_write on public.automation_rules;
create policy automation_rules_write on public.automation_rules
  for all to authenticated
  with check (
    organization_id = app.current_organization_id()
    and app.has_permission('automation.manage')
  );

-- Automation executions are org-scoped (via rule).
ALTER TABLE public.automation_executions ENABLE ROW LEVEL SECURITY;

drop policy if exists automation_executions_select on public.automation_executions;
create policy automation_executions_select on public.automation_executions
  for select to authenticated
  using (
    rule_id in (
      select id from public.automation_rules
      where organization_id = app.current_organization_id()
    )
  );

-- =====================================================================
-- 9. NOTIFICATION & AUTOMATION PERMISSIONS
-- =====================================================================

INSERT INTO public.role_permissions (permission, role, granted_by)
VALUES
  -- Notifications
  ('notifications.view', 'MASTER_ADMIN', 'system'),
  ('notifications.view', 'ORG_OWNER', 'system'),
  ('notifications.view', 'PROPERTY_MANAGER', 'system'),
  ('notifications.view', 'OUTLET_MANAGER', 'system'),
  ('notifications.manage', 'MASTER_ADMIN', 'system'),
  ('notifications.manage', 'ORG_OWNER', 'system'),

  -- Notification preferences (all users can manage their own)
  ('notifications.preference.view', 'MASTER_ADMIN', 'system'),
  ('notifications.preference.view', 'ORG_OWNER', 'system'),
  ('notifications.preference.view', 'PROPERTY_MANAGER', 'system'),
  ('notifications.preference.view', 'OUTLET_MANAGER', 'system'),
  ('notifications.preference.view', 'EMPLOYEE', 'system'),
  ('notifications.preference.manage', 'MASTER_ADMIN', 'system'),
  ('notifications.preference.manage', 'ORG_OWNER', 'system'),
  ('notifications.preference.manage', 'PROPERTY_MANAGER', 'system'),
  ('notifications.preference.manage', 'OUTLET_MANAGER', 'system'),
  ('notifications.preference.manage', 'EMPLOYEE', 'system'),

  -- Communications
  ('communications.view', 'MASTER_ADMIN', 'system'),
  ('communications.view', 'ORG_OWNER', 'system'),
  ('communications.manage', 'MASTER_ADMIN', 'system'),
  ('communications.manage', 'ORG_OWNER', 'system'),

  -- Communication templates
  ('communications.template.view', 'MASTER_ADMIN', 'system'),
  ('communications.template.view', 'ORG_OWNER', 'system'),
  ('communications.template.manage', 'MASTER_ADMIN', 'system'),
  ('communications.template.manage', 'ORG_OWNER', 'system'),

  -- Automation
  ('automation.view', 'MASTER_ADMIN', 'system'),
  ('automation.view', 'ORG_OWNER', 'system'),
  ('automation.create', 'MASTER_ADMIN', 'system'),
  ('automation.create', 'ORG_OWNER', 'system'),
  ('automation.edit', 'MASTER_ADMIN', 'system'),
  ('automation.edit', 'ORG_OWNER', 'system'),
  ('automation.enable', 'MASTER_ADMIN', 'system'),
  ('automation.enable', 'ORG_OWNER', 'system'),
  ('automation.disable', 'MASTER_ADMIN', 'system'),
  ('automation.disable', 'ORG_OWNER', 'system'),
  ('automation.history.view', 'MASTER_ADMIN', 'system'),
  ('automation.history.view', 'ORG_OWNER', 'system')
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 10. NOTIFICATION & AUTOMATION DOORS
-- =====================================================================

-- Record a domain event.
create or replace function public.record_domain_event(
  p_organization uuid,
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_property uuid default null,
  p_outlet uuid default null,
  p_actor_user uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  -- Domain events can be recorded by any authenticated user (modules produce events).
  if not app.is_authenticated() then
    raise exception 'NIVAAS_NOT_AUTHENTICATED';
  end if;

  insert into public.domain_events (
    organization_id, property_id, outlet_id,
    event_type, entity_type, entity_id,
    actor_user_id, metadata
  )
  values (
    p_organization, p_property, p_outlet,
    p_event_type, p_entity_type, p_entity_id,
    p_actor_user, p_metadata
  )
  returning to_jsonb(domain_events.*) into v_result;

  return v_result;
end;
$$;

-- Create a notification.
create or replace function public.create_notification(
  p_organization uuid,
  p_type text,
  p_title text,
  p_message text,
  p_property uuid default null,
  p_outlet uuid default null,
  p_recipient_user uuid default null,
  p_severity text default 'NORMAL',
  p_reference_type text default null,
  p_reference_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not app.has_permission('notifications.manage') then
    raise exception 'NIVAAS_PERMISSION_DENIED';
  end if;

  insert into public.notifications (
    organization_id, property_id, outlet_id,
    recipient_user_id, type, severity,
    title, message, reference_type, reference_id
  )
  values (
    p_organization, p_property, p_outlet,
    p_recipient_user, p_type, p_severity,
    p_title, p_message, p_reference_type, p_reference_id
  )
  returning to_jsonb(notifications.*) into v_result;

  return v_result;
end;
$$;

-- Mark a notification as read.
create or replace function public.mark_notification_read(p_notification uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notifications
  set status = 'READ',
      read_at = now()
  where id = p_notification
    and organization_id = app.current_organization_id()
    and (recipient_user_id = app.current_user_id() or recipient_user_id is null);
end;
$$;

-- Mark all notifications as read for the current user.
create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with updated as (
    update public.notifications
    set status = 'READ',
        read_at = now()
    where organization_id = app.current_organization_id()
      and recipient_user_id = app.current_user_id()
      and status = 'UNREAD'
    returning id
  )
  select count(*) into v_count from updated;

  return v_count;
end;
$$;

-- Archive a notification.
create or replace function public.archive_notification(p_notification uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notifications
  set status = 'ARCHIVED'
  where id = p_notification
    and organization_id = app.current_organization_id()
    and (recipient_user_id = app.current_user_id() or recipient_user_id is null);
end;
$$;

-- Upsert a notification preference.
create or replace function public.upsert_notification_preference(
  p_user uuid,
  p_event_type text,
  p_in_app_enabled boolean default true,
  p_email_enabled boolean default false,
  p_sms_enabled boolean default false,
  p_whatsapp_enabled boolean default false,
  p_frequency text default 'IMMEDIATE',
  p_quiet_hours_enabled boolean default false,
  p_quiet_hours_start time default null,
  p_quiet_hours_end time default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  -- Users can only manage their own preferences.
  if p_user != app.current_user_id() and not app.has_permission('notifications.preference.manage') then
    raise exception 'NIVAAS_PERMISSION_DENIED';
  end if;

  insert into public.notification_preferences (
    user_id, event_type,
    in_app_enabled, email_enabled, sms_enabled, whatsapp_enabled,
    frequency, quiet_hours_enabled, quiet_hours_start, quiet_hours_end
  )
  values (
    p_user, p_event_type,
    p_in_app_enabled, p_email_enabled, p_sms_enabled, p_whatsapp_enabled,
    p_frequency, p_quiet_hours_enabled, p_quiet_hours_start, p_quiet_hours_end
  )
  on conflict (user_id, event_type)
  do update set
    in_app_enabled = excluded.in_app_enabled,
    email_enabled = excluded.email_enabled,
    sms_enabled = excluded.sms_enabled,
    whatsapp_enabled = excluded.whatsapp_enabled,
    frequency = excluded.frequency,
    quiet_hours_enabled = excluded.quiet_hours_enabled,
    quiet_hours_start = excluded.quiet_hours_start,
    quiet_hours_end = excluded.quiet_hours_end
  returning to_jsonb(notification_preferences.*) into v_result;

  return v_result;
end;
$$;

-- Create a notification template.
create or replace function public.create_notification_template(
  p_event_type text,
  p_channel text,
  p_name text,
  p_body text,
  p_organization uuid default null,
  p_subject text default null,
  p_variables jsonb default '[]'::jsonb,
  p_status text default 'ACTIVE'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not app.has_permission('communications.template.manage') then
    raise exception 'NIVAAS_PERMISSION_DENIED';
  end if;

  insert into public.notification_templates (
    organization_id, event_type, channel,
    name, subject, body, variables, status
  )
  values (
    p_organization, p_event_type, p_channel,
    p_name, p_subject, p_body, p_variables, p_status
  )
  returning to_jsonb(notification_templates.*) into v_result;

  return v_result;
end;
$$;

-- Update a notification template.
create or replace function public.update_notification_template(
  p_template uuid,
  p_name text default null,
  p_subject text default null,
  p_body text default null,
  p_variables jsonb default null,
  p_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not app.has_permission('communications.template.manage') then
    raise exception 'NIVAAS_PERMISSION_DENIED';
  end if;

  update public.notification_templates
  set name = coalesce(p_name, name),
      subject = coalesce(p_subject, subject),
      body = coalesce(p_body, body),
      variables = coalesce(p_variables, variables),
      status = coalesce(p_status, status)
  where id = p_template
    and (organization_id = app.current_organization_id() or organization_id is null)
  returning to_jsonb(notification_templates.*) into v_result;

  return v_result;
end;
$$;

-- Queue a communication message.
create or replace function public.queue_communication_message(
  p_organization uuid,
  p_recipient_type text,
  p_channel text,
  p_body text,
  p_recipient_id uuid default null,
  p_template_id uuid default null,
  p_subject text default null,
  p_scheduled_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not app.has_permission('communications.manage') then
    raise exception 'NIVAAS_PERMISSION_DENIED';
  end if;

  insert into public.communication_messages (
    organization_id, recipient_type, recipient_id,
    channel, template_id, subject, body, scheduled_at
  )
  values (
    p_organization, p_recipient_type, p_recipient_id,
    p_channel, p_template_id, p_subject, p_body, p_scheduled_at
  )
  returning to_jsonb(communication_messages.*) into v_result;

  return v_result;
end;
$$;

-- Create an automation rule.
create or replace function public.create_automation_rule(
  p_organization uuid,
  p_name text,
  p_event_type text,
  p_description text default null,
  p_conditions jsonb default '[]'::jsonb,
  p_actions jsonb default '[]'::jsonb,
  p_status text default 'DRAFT'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not app.has_permission('automation.create') then
    raise exception 'NIVAAS_PERMISSION_DENIED';
  end if;

  insert into public.automation_rules (
    organization_id, name, description,
    event_type, conditions, actions, status,
    created_by
  )
  values (
    p_organization, p_name, p_description,
    p_event_type, p_conditions, p_actions, p_status,
    app.current_user_id()
  )
  returning to_jsonb(automation_rules.*) into v_result;

  return v_result;
end;
$$;

-- Update an automation rule.
create or replace function public.update_automation_rule(
  p_rule uuid,
  p_name text default null,
  p_description text default null,
  p_conditions jsonb default null,
  p_actions jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not app.has_permission('automation.edit') then
    raise exception 'NIVAAS_PERMISSION_DENIED';
  end if;

  update public.automation_rules
  set name = coalesce(p_name, name),
      description = coalesce(p_description, description),
      conditions = coalesce(p_conditions, conditions),
      actions = coalesce(p_actions, actions)
  where id = p_rule
    and organization_id = app.current_organization_id()
  returning to_jsonb(automation_rules.*) into v_result;

  return v_result;
end;
$$;

-- Set automation rule status (enable/disable).
create or replace function public.set_automation_rule_status(
  p_rule uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status = 'ACTIVE' and not app.has_permission('automation.enable') then
    raise exception 'NIVAAS_PERMISSION_DENIED';
  end if;

  if p_status = 'INACTIVE' and not app.has_permission('automation.disable') then
    raise exception 'NIVAAS_PERMISSION_DENIED';
  end if;

  update public.automation_rules
  set status = p_status
  where id = p_rule
    and organization_id = app.current_organization_id();
end;
$$;

-- Process a domain event (find matching rules and execute actions).
-- This is a simplified implementation. Full automation engine would be more sophisticated.
create or replace function public.process_domain_event(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event record;
  v_rule record;
  v_execution_count integer := 0;
begin
  -- Get the event.
  select * into v_event
  from public.domain_events
  where id = p_event_id;

  if not found then
    raise exception 'NIVAAS_NOT_FOUND';
  end if;

  -- Find active rules for this event type.
  for v_rule in
    select *
    from public.automation_rules
    where organization_id = v_event.organization_id
      and event_type = v_event.event_type
      and status = 'ACTIVE'
  loop
    -- TODO: Evaluate conditions (simplified — real implementation would parse JSON conditions).
    -- For now, execute all actions if conditions are empty or match.

    -- Execute each action.
    for i in 0..jsonb_array_length(v_rule.actions) - 1 loop
      -- Check if already executed (idempotency).
      if not exists (
        select 1
        from public.automation_executions
        where rule_id = v_rule.id
          and domain_event_id = p_event_id
          and action_index = i
      ) then
        -- Record execution.
        insert into public.automation_executions (
          rule_id, domain_event_id, action_index,
          status, executed_at, result
        )
        values (
          v_rule.id, p_event_id, i,
          'SUCCESS', now(),
          jsonb_build_object('action', v_rule.actions->i)
        );

        v_execution_count := v_execution_count + 1;

        -- TODO: Actually execute the action (create notification, send email, etc.).
        -- This is a placeholder. Real implementation would switch on action type.
      end if;
    end loop;
  end loop;

  return jsonb_build_object(
    'event_id', p_event_id,
    'executions', v_execution_count
  );
end;
$$;
