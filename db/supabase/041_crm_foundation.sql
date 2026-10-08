-- AMRUT NIVAAS · 041 — CRM foundation (Prompt #11)
--
-- Extends the existing guest entity into a unified customer identity and adds
-- CRM support tables: preferences, tags, notes, feedback, complaints, loyalty
-- (programs, tiers, accounts, transactions), corporate accounts, and customer
-- relationships. All organization-scoped under RLS.
--
-- Key invariants:
--   - The `guests` table IS the canonical customer identity. No parallel entity.
--   - CRM tables reference guests.id as the customer FK.
--   - Financial metrics are derived, never stored in CRM.
--   - Loyalty uses an append-only transaction ledger.
--   - All writes go through SECURITY DEFINER doors.
--   - PII fields stripped from audit metadata.

set local search_path = '';

-- ============================================= extend guests for CRM (Prompt #11 §4)

alter table public.guests
  add column if not exists customer_type     text default 'INDIVIDUAL',
  add column if not exists company_name      text,
  add column if not exists designation       text,
  add column if not exists anniversary_date  date;

alter table public.guests
  add constraint guests_customer_type_ok check (customer_type is null or customer_type in (
    'INDIVIDUAL', 'CORPORATE', 'TRAVEL_AGENT', 'EVENT_CUSTOMER', 'WALK_IN', 'OTHER'
  ));

-- ============================================= customer_preferences (§5, §6)

create table if not exists public.customer_preferences (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  customer_id          uuid not null references public.guests(id) on delete cascade,

  -- Communication preferences (§5)
  preferred_language        text,
  preferred_communication   text,
  marketing_email_allowed   boolean not null default false,
  marketing_sms_allowed     boolean not null default false,
  marketing_whatsapp_allowed boolean not null default false,
  transactional_communication_allowed boolean not null default true,
  consent_updated_at   timestamptz,
  consent_source       text,

  -- Structured preferences (§6): flexible key/value per category
  category             text,
  pref_key             text,
  pref_value           text,
  source               text,
  notes                text,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint customer_preferences_channel_ok check (preferred_communication is null or preferred_communication in (
    'PHONE', 'SMS', 'EMAIL', 'WHATSAPP', 'NONE'
  ))
);

create index if not exists customer_preferences_customer_idx
  on public.customer_preferences (customer_id);
create index if not exists customer_preferences_org_idx
  on public.customer_preferences (organization_id);

drop trigger if exists customer_preferences_touch on public.customer_preferences;
create trigger customer_preferences_touch before update on public.customer_preferences
  for each row execute function app.touch_updated_at();

-- RLS
drop policy if exists customer_preferences_read on public.customer_preferences;
create policy customer_preferences_read on public.customer_preferences
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists customer_preferences_no_write on public.customer_preferences;
create policy customer_preferences_no_write on public.customer_preferences
  for all to authenticated using (false);

-- ============================================= customer_tags (§7)

create table if not exists public.customer_tags (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  name                 text not null,
  color                text,
  description          text,
  status               text not null default 'ACTIVE',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint customer_tags_name_not_blank check (btrim(name) <> ''),
  constraint customer_tags_status_ok check (status in ('ACTIVE', 'ARCHIVED'))
);

create unique index if not exists customer_tags_org_name_idx
  on public.customer_tags (organization_id, lower(name));

drop trigger if exists customer_tags_touch on public.customer_tags;
create trigger customer_tags_touch before update on public.customer_tags
  for each row execute function app.touch_updated_at();

-- RLS
drop policy if exists customer_tags_read on public.customer_tags;
create policy customer_tags_read on public.customer_tags
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists customer_tags_no_write on public.customer_tags;
create policy customer_tags_no_write on public.customer_tags
  for all to authenticated using (false);

-- ============================================= customer_tag_assignments (§7)

create table if not exists public.customer_tag_assignments (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  customer_id          uuid not null references public.guests(id) on delete cascade,
  tag_id               uuid not null references public.customer_tags(id) on delete cascade,
  created_by           uuid,
  created_at           timestamptz not null default now(),

  constraint customer_tag_assignments_unique unique (customer_id, tag_id)
);

create index if not exists customer_tag_assignments_customer_idx
  on public.customer_tag_assignments (customer_id);
create index if not exists customer_tag_assignments_tag_idx
  on public.customer_tag_assignments (tag_id);

-- RLS
drop policy if exists customer_tag_assignments_read on public.customer_tag_assignments;
create policy customer_tag_assignments_read on public.customer_tag_assignments
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists customer_tag_assignments_no_write on public.customer_tag_assignments;
create policy customer_tag_assignments_no_write on public.customer_tag_assignments
  for all to authenticated using (false);

-- ============================================= customer_notes (§15, §16)

create table if not exists public.customer_notes (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  property_id          uuid,
  customer_id          uuid not null references public.guests(id) on delete cascade,
  note                 text not null,
  note_type            text not null default 'GENERAL',
  created_by           uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint customer_notes_note_not_blank check (btrim(note) <> ''),
  constraint customer_notes_type_ok check (note_type in (
    'GENERAL', 'SERVICE', 'PREFERENCE', 'COMPLAINT', 'FOLLOW_UP', 'VIP', 'OTHER'
  ))
);

create index if not exists customer_notes_customer_idx
  on public.customer_notes (customer_id);
create index if not exists customer_notes_org_idx
  on public.customer_notes (organization_id);

drop trigger if exists customer_notes_touch on public.customer_notes;
create trigger customer_notes_touch before update on public.customer_notes
  for each row execute function app.touch_updated_at();

-- RLS
drop policy if exists customer_notes_read on public.customer_notes;
create policy customer_notes_read on public.customer_notes
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists customer_notes_no_write on public.customer_notes;
create policy customer_notes_no_write on public.customer_notes
  for all to authenticated using (false);

-- ============================================= customer_feedback (§17)

create table if not exists public.customer_feedback (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  property_id          uuid,
  outlet_id            uuid,
  customer_id          uuid not null references public.guests(id) on delete cascade,

  source               text not null default 'INTERNAL',
  rating               integer,
  category             text not null default 'OTHER',
  comment              text,

  reference_type       text,
  reference_id         uuid,

  status               text not null default 'OPEN',
  created_at           timestamptz not null default now(),

  constraint customer_feedback_rating_ok check (rating is null or (rating >= 1 and rating <= 5)),
  constraint customer_feedback_category_ok check (category in (
    'FOOD', 'SERVICE', 'ROOM', 'CLEANLINESS', 'STAFF', 'VALUE', 'AMBIENCE', 'OTHER'
  )),
  constraint customer_feedback_status_ok check (status in (
    'OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED'
  )),
  constraint customer_feedback_source_ok check (source in (
    'INTERNAL', 'WEBSITE', 'QR', 'STAFF', 'OTHER'
  ))
);

create index if not exists customer_feedback_customer_idx
  on public.customer_feedback (customer_id);
create index if not exists customer_feedback_org_idx
  on public.customer_feedback (organization_id);

-- RLS
drop policy if exists customer_feedback_read on public.customer_feedback;
create policy customer_feedback_read on public.customer_feedback
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists customer_feedback_no_write on public.customer_feedback;
create policy customer_feedback_no_write on public.customer_feedback
  for all to authenticated using (false);

-- ============================================= complaints (§18)

create table if not exists public.complaints (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  property_id          uuid,
  outlet_id            uuid,
  customer_id          uuid references public.guests(id) on delete set null,

  category             text not null default 'OTHER',
  priority             text not null default 'NORMAL',
  description          text not null,

  reference_type       text,
  reference_id         uuid,

  assigned_to          uuid,
  status               text not null default 'OPEN',
  resolution           text,
  resolved_at          timestamptz,

  created_by           uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint complaints_description_not_blank check (btrim(description) <> ''),
  constraint complaints_priority_ok check (priority in ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  constraint complaints_status_ok check (status in (
    'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'
  ))
);

create index if not exists complaints_customer_idx
  on public.complaints (customer_id);
create index if not exists complaints_org_idx
  on public.complaints (organization_id);

drop trigger if exists complaints_touch on public.complaints;
create trigger complaints_touch before update on public.complaints
  for each row execute function app.touch_updated_at();

-- RLS
drop policy if exists complaints_read on public.complaints;
create policy complaints_read on public.complaints
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists complaints_no_write on public.complaints;
create policy complaints_no_write on public.complaints
  for all to authenticated using (false);

-- ============================================= loyalty_programs (§19)

create table if not exists public.loyalty_programs (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,

  name                 text not null,
  description          text,

  currency             text not null default 'INR',
  points_name          text not null default 'Points',

  -- Earning rule foundation (§22)
  points_per_amount    numeric,
  minimum_spend        numeric,
  eligible_transaction_types text[],

  earning_enabled      boolean not null default true,
  redemption_enabled   boolean not null default false,

  status               text not null default 'ACTIVE',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint loyalty_programs_name_not_blank check (btrim(name) <> ''),
  constraint loyalty_programs_status_ok check (status in ('ACTIVE', 'INACTIVE')),
  constraint loyalty_programs_points_per_amount_ok check (points_per_amount is null or points_per_amount > 0),
  constraint loyalty_programs_minimum_spend_ok check (minimum_spend is null or minimum_spend >= 0),
  constraint loyalty_programs_scale_ok check (
    points_per_amount is null or scale(trim_scale(points_per_amount)) <= 2
  ),
  constraint loyalty_programs_min_spend_scale_ok check (
    minimum_spend is null or scale(trim_scale(minimum_spend)) <= 2
  )
);

create index if not exists loyalty_programs_org_idx
  on public.loyalty_programs (organization_id);

drop trigger if exists loyalty_programs_touch on public.loyalty_programs;
create trigger loyalty_programs_touch before update on public.loyalty_programs
  for each row execute function app.touch_updated_at();

-- RLS
drop policy if exists loyalty_programs_read on public.loyalty_programs;
create policy loyalty_programs_read on public.loyalty_programs
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists loyalty_programs_no_write on public.loyalty_programs;
create policy loyalty_programs_no_write on public.loyalty_programs
  for all to authenticated using (false);

-- ============================================= loyalty_tiers (§24)

create table if not exists public.loyalty_tiers (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  program_id           uuid not null references public.loyalty_programs(id) on delete cascade,

  name                 text not null,
  rank                 integer not null,
  minimum_lifetime_spend numeric,
  minimum_visits       integer,
  benefits_description text,

  status               text not null default 'ACTIVE',
  created_at           timestamptz not null default now(),

  constraint loyalty_tiers_name_not_blank check (btrim(name) <> ''),
  constraint loyalty_tiers_rank_positive check (rank > 0),
  constraint loyalty_tiers_status_ok check (status in ('ACTIVE', 'INACTIVE')),
  constraint loyalty_tiers_spend_scale_ok check (
    minimum_lifetime_spend is null or scale(trim_scale(minimum_lifetime_spend)) <= 2
  ),
  constraint loyalty_tiers_min_visits_ok check (minimum_visits is null or minimum_visits >= 0)
);

create index if not exists loyalty_tiers_program_idx
  on public.loyalty_tiers (program_id);

-- RLS
drop policy if exists loyalty_tiers_read on public.loyalty_tiers;
create policy loyalty_tiers_read on public.loyalty_tiers
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists loyalty_tiers_no_write on public.loyalty_tiers;
create policy loyalty_tiers_no_write on public.loyalty_tiers
  for all to authenticated using (false);

-- ============================================= loyalty_accounts (§20)

create table if not exists public.loyalty_accounts (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  program_id           uuid not null references public.loyalty_programs(id) on delete restrict,
  customer_id          uuid not null references public.guests(id) on delete cascade,

  member_number        text not null,
  current_points       numeric not null default 0,
  lifetime_earned      numeric not null default 0,
  lifetime_redeemed    numeric not null default 0,

  tier_id              uuid references public.loyalty_tiers(id) on delete set null,
  status               text not null default 'ACTIVE',
  joined_at            timestamptz not null default now(),

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint loyalty_accounts_points_non_negative check (current_points >= 0),
  constraint loyalty_accounts_lifetime_earned_non_negative check (lifetime_earned >= 0),
  constraint loyalty_accounts_lifetime_redeemed_non_negative check (lifetime_redeemed >= 0),
  constraint loyalty_accounts_status_ok check (status in ('ACTIVE', 'SUSPENDED', 'CLOSED')),
  constraint loyalty_accounts_points_scale_ok check (scale(trim_scale(current_points)) <= 2),
  constraint loyalty_accounts_earned_scale_ok check (scale(trim_scale(lifetime_earned)) <= 2),
  constraint loyalty_accounts_redeemed_scale_ok check (scale(trim_scale(lifetime_redeemed)) <= 2),
  constraint loyalty_accounts_unique_customer_program unique (organization_id, program_id, customer_id)
);

create unique index if not exists loyalty_accounts_member_number_idx
  on public.loyalty_accounts (organization_id, member_number);
create index if not exists loyalty_accounts_customer_idx
  on public.loyalty_accounts (customer_id);

drop trigger if exists loyalty_accounts_touch on public.loyalty_accounts;
create trigger loyalty_accounts_touch before update on public.loyalty_accounts
  for each row execute function app.touch_updated_at();

-- RLS
drop policy if exists loyalty_accounts_read on public.loyalty_accounts;
create policy loyalty_accounts_read on public.loyalty_accounts
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists loyalty_accounts_no_write on public.loyalty_accounts;
create policy loyalty_accounts_no_write on public.loyalty_accounts
  for all to authenticated using (false);

-- ============================================= loyalty_transactions (§21)

-- Append-only ledger. No update/delete doors.
create table if not exists public.loyalty_transactions (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  loyalty_account_id   uuid not null references public.loyalty_accounts(id) on delete cascade,
  customer_id          uuid not null references public.guests(id) on delete restrict,

  type                 text not null,
  points               numeric not null,
  balance_after        numeric not null,

  reference_type       text,
  reference_id         uuid,

  description          text,
  created_by           uuid,
  created_at           timestamptz not null default now(),

  constraint loyalty_transactions_type_ok check (type in (
    'EARN', 'REDEEM', 'ADJUSTMENT', 'EXPIRE', 'BONUS', 'REVERSAL'
  )),
  constraint loyalty_transactions_points_scale_ok check (scale(trim_scale(points)) <= 2),
  constraint loyalty_transactions_balance_scale_ok check (scale(trim_scale(balance_after)) <= 2),
  constraint loyalty_transactions_balance_non_negative check (balance_after >= 0)
);

create index if not exists loyalty_transactions_account_idx
  on public.loyalty_transactions (loyalty_account_id);
create index if not exists loyalty_transactions_customer_idx
  on public.loyalty_transactions (customer_id);
create index if not exists loyalty_transactions_org_idx
  on public.loyalty_transactions (organization_id);

-- RLS
drop policy if exists loyalty_transactions_read on public.loyalty_transactions;
create policy loyalty_transactions_read on public.loyalty_transactions
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists loyalty_transactions_no_write on public.loyalty_transactions;
create policy loyalty_transactions_no_write on public.loyalty_transactions
  for all to authenticated using (false);

-- ============================================= corporate_accounts (§28)

create table if not exists public.corporate_accounts (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,

  name                 text not null,
  code                 text,
  contact_name         text,
  phone                text,
  email                text,
  billing_address      text,
  tax_id               text,
  credit_limit         numeric,
  payment_terms        text,

  status               text not null default 'ACTIVE',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint corporate_accounts_name_not_blank check (btrim(name) <> ''),
  constraint corporate_accounts_status_ok check (status in ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  constraint corporate_accounts_credit_limit_ok check (credit_limit is null or credit_limit >= 0),
  constraint corporate_accounts_credit_limit_scale_ok check (
    credit_limit is null or scale(trim_scale(credit_limit)) <= 2
  )
);

create index if not exists corporate_accounts_org_idx
  on public.corporate_accounts (organization_id);

drop trigger if exists corporate_accounts_touch on public.corporate_accounts;
create trigger corporate_accounts_touch before update on public.corporate_accounts
  for each row execute function app.touch_updated_at();

-- RLS
drop policy if exists corporate_accounts_read on public.corporate_accounts;
create policy corporate_accounts_read on public.corporate_accounts
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists corporate_accounts_no_write on public.corporate_accounts;
create policy corporate_accounts_no_write on public.corporate_accounts
  for all to authenticated using (false);

-- Link guests to corporate accounts
alter table public.guests
  add column if not exists corporate_account_id uuid references public.corporate_accounts(id) on delete set null;

-- ============================================= customer_relationships (§29)

create table if not exists public.customer_relationships (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  customer_id          uuid not null references public.guests(id) on delete cascade,
  related_customer_id  uuid not null references public.guests(id) on delete cascade,
  relationship_type    text not null,
  created_at           timestamptz not null default now(),

  constraint customer_relationships_type_ok check (relationship_type in (
    'SPOUSE', 'PARENT', 'CHILD', 'SIBLING', 'COLLEAGUE', 'ASSISTANT', 'OTHER'
  )),
  constraint customer_relationships_no_self check (customer_id <> related_customer_id),
  constraint customer_relationships_unique unique (customer_id, related_customer_id, relationship_type)
);

create index if not exists customer_relationships_customer_idx
  on public.customer_relationships (customer_id);
create index if not exists customer_relationships_related_idx
  on public.customer_relationships (related_customer_id);

-- RLS
drop policy if exists customer_relationships_read on public.customer_relationships;
create policy customer_relationships_read on public.customer_relationships
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists customer_relationships_no_write on public.customer_relationships;
create policy customer_relationships_no_write on public.customer_relationships
  for all to authenticated using (false);

-- =================================================================== doors

-- --------------------------------------------------- update_guest_crm (§4 CRM fields)
create or replace function public.update_guest_crm(
  p_guest              uuid,
  p_organization       uuid,
  p_expected_version   integer,
  p_customer_type      text default null,
  p_company_name       text default null,
  p_designation        text default null,
  p_anniversary_date   date default null,
  p_corporate_account_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.guests%rowtype;
  v_row public.guests%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.guests
  where id = p_guest and organization_id = p_organization;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;

  perform app.evaluate_access(v_user_id, p_organization, null, null, 'guest.edit');

  update public.guests set
    customer_type = coalesce(p_customer_type, v_old.customer_type),
    company_name = coalesce(p_company_name, v_old.company_name),
    designation = coalesce(p_designation, v_old.designation),
    anniversary_date = coalesce(p_anniversary_date, v_old.anniversary_date),
    corporate_account_id = coalesce(p_corporate_account_id, v_old.corporate_account_id),
    version = version + 1
  where id = p_guest returning * into v_row;

  perform app.audit(
    'CUSTOMER_UPDATED', 'guest', v_row.id,
    to_jsonb(v_old) - 'date_of_birth' - 'email' - 'phone' - 'address_line1' - 'address_line2',
    to_jsonb(v_row) - 'date_of_birth' - 'email' - 'phone' - 'address_line1' - 'address_line2',
    null, jsonb_build_object('version', v_row.version, 'crm_update', true)
  );

  return to_jsonb(v_row);
end;
$$;

-- --------------------------------------------------- create_customer_tag (§7)
create or replace function public.create_customer_tag(
  p_organization       uuid,
  p_name               text,
  p_color              text default null,
  p_description        text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_row public.customer_tags%rowtype;
begin
  perform app.require_session(v_user_id, null);
  perform app.evaluate_access(v_user_id, p_organization, null, null, 'crm.customer.tag.manage');

  insert into public.customer_tags (organization_id, name, color, description)
  values (p_organization, p_name, p_color, p_description)
  returning * into v_row;

  perform app.audit(
    'CUSTOMER_TAG_CREATED', 'customer_tag', v_row.id,
    null, to_jsonb(v_row),
    null, jsonb_build_object('name', v_row.name)
  );

  return to_jsonb(v_row);
end;
$$;

-- --------------------------------------------------- delete_customer_tag
create or replace function public.delete_customer_tag(
  p_tag                  uuid,
  p_organization         uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.customer_tags%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.customer_tags
  where id = p_tag and organization_id = p_organization;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;

  perform app.evaluate_access(v_user_id, p_organization, null, null, 'crm.customer.tag.manage');

  delete from public.customer_tag_assignments where tag_id = p_tag;
  delete from public.customer_tags where id = p_tag;

  perform app.audit(
    'CUSTOMER_TAG_DELETED', 'customer_tag', p_tag,
    to_jsonb(v_old), null,
    null, jsonb_build_object('name', v_old.name)
  );
end;
$$;

-- --------------------------------------------------- assign_customer_tag (§7)
create or replace function public.assign_customer_tag(
  p_customer           uuid,
  p_tag                uuid,
  p_organization       uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_row public.customer_tag_assignments%rowtype;
begin
  perform app.require_session(v_user_id, null);
  perform app.evaluate_access(v_user_id, p_organization, null, null, 'crm.customer.tag.manage');

  insert into public.customer_tag_assignments (organization_id, customer_id, tag_id, created_by)
  values (p_organization, p_customer, p_tag, v_user_id)
  on conflict (customer_id, tag_id) do nothing
  returning * into v_row;

  if not found then
    select * into v_row from public.customer_tag_assignments
    where customer_id = p_customer and tag_id = p_tag;
  end if;

  perform app.audit(
    'CUSTOMER_TAG_ADDED', 'customer_tag_assignment', v_row.id,
    null, to_jsonb(v_row),
    null, jsonb_build_object('customer_id', p_customer, 'tag_id', p_tag)
  );

  return to_jsonb(v_row);
end;
$$;

-- --------------------------------------------------- remove_customer_tag
create or replace function public.remove_customer_tag(
  p_customer           uuid,
  p_tag                uuid,
  p_organization       uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
begin
  perform app.require_session(v_user_id, null);
  perform app.evaluate_access(v_user_id, p_organization, null, null, 'crm.customer.tag.manage');

  delete from public.customer_tag_assignments
  where customer_id = p_customer and tag_id = p_tag;

  perform app.audit(
    'CUSTOMER_TAG_REMOVED', 'customer_tag_assignment', null,
    null, null,
    null, jsonb_build_object('customer_id', p_customer, 'tag_id', p_tag)
  );
end;
$$;

-- --------------------------------------------------- create_customer_note (§15)
create or replace function public.create_customer_note(
  p_organization       uuid,
  p_customer           uuid,
  p_note               text,
  p_note_type          text default 'GENERAL',
  p_property           uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_row public.customer_notes%rowtype;
begin
  perform app.require_session(v_user_id, null);
  perform app.evaluate_access(v_user_id, p_organization, null, null, 'crm.customer.note.create');

  insert into public.customer_notes (organization_id, property_id, customer_id, note, note_type, created_by)
  values (p_organization, p_property, p_customer, p_note, p_note_type, v_user_id)
  returning * into v_row;

  perform app.audit(
    'CUSTOMER_NOTE_CREATED', 'customer_note', v_row.id,
    null, to_jsonb(v_row),
    p_property, jsonb_build_object('customer_id', p_customer, 'note_type', v_row.note_type)
  );

  return to_jsonb(v_row);
end;
$$;

-- --------------------------------------------------- update_customer_note
create or replace function public.update_customer_note(
  p_note_id            uuid,
  p_organization       uuid,
  p_note               text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.customer_notes%rowtype;
  v_row public.customer_notes%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.customer_notes
  where id = p_note_id and organization_id = p_organization;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;

  perform app.evaluate_access(v_user_id, p_organization, null, null, 'crm.customer.note.edit');

  update public.customer_notes set
    note = p_note
  where id = p_note_id returning * into v_row;

  perform app.audit(
    'CUSTOMER_NOTE_UPDATED', 'customer_note', v_row.id,
    to_jsonb(v_old), to_jsonb(v_row),
    v_row.property_id, jsonb_build_object('customer_id', v_row.customer_id)
  );

  return to_jsonb(v_row);
end;
$$;

-- --------------------------------------------------- delete_customer_note
create or replace function public.delete_customer_note(
  p_note_id            uuid,
  p_organization       uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.customer_notes%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.customer_notes
  where id = p_note_id and organization_id = p_organization;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;

  perform app.evaluate_access(v_user_id, p_organization, null, null, 'crm.customer.note.delete');

  delete from public.customer_notes where id = p_note_id;

  perform app.audit(
    'CUSTOMER_NOTE_DELETED', 'customer_note', p_note_id,
    to_jsonb(v_old), null,
    v_old.property_id, jsonb_build_object('customer_id', v_old.customer_id)
  );
end;
$$;

-- --------------------------------------------------- upsert_customer_preferences (§5, §6)
create or replace function public.upsert_customer_preferences(
  p_organization       uuid,
  p_customer           uuid,
  p_preferred_language text default null,
  p_preferred_communication text default null,
  p_marketing_email    boolean default null,
  p_marketing_sms      boolean default null,
  p_marketing_whatsapp boolean default null,
  p_transactional      boolean default null,
  p_consent_source     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_row public.customer_preferences%rowtype;
begin
  perform app.require_session(v_user_id, null);
  perform app.evaluate_access(v_user_id, p_organization, null, null, 'crm.customer.preference.manage');

  -- Upsert the communication preference row (one per customer, category IS NULL)
  insert into public.customer_preferences (
    organization_id, customer_id,
    preferred_language, preferred_communication,
    marketing_email_allowed, marketing_sms_allowed, marketing_whatsapp_allowed,
    transactional_communication_allowed, consent_updated_at, consent_source
  ) values (
    p_organization, p_customer,
    p_preferred_language, p_preferred_communication,
    coalesce(p_marketing_email, false),
    coalesce(p_marketing_sms, false),
    coalesce(p_marketing_whatsapp, false),
    coalesce(p_transactional, true),
    now(), p_consent_source
  )
  on conflict (id) do update set
    preferred_language = coalesce(p_preferred_language, customer_preferences.preferred_language),
    preferred_communication = coalesce(p_preferred_communication, customer_preferences.preferred_communication),
    marketing_email_allowed = coalesce(p_marketing_email, customer_preferences.marketing_email_allowed),
    marketing_sms_allowed = coalesce(p_marketing_sms, customer_preferences.marketing_sms_allowed),
    marketing_whatsapp_allowed = coalesce(p_marketing_whatsapp, customer_preferences.marketing_whatsapp_allowed),
    transactional_communication_allowed = coalesce(p_transactional, customer_preferences.transactional_communication_allowed),
    consent_updated_at = now(),
    consent_source = coalesce(p_consent_source, customer_preferences.consent_source)
  returning * into v_row;

  perform app.audit(
    'PREFERENCE_UPDATED', 'customer_preference', v_row.id,
    null, to_jsonb(v_row),
    null, jsonb_build_object('customer_id', p_customer)
  );

  return to_jsonb(v_row);
end;
$$;

-- --------------------------------------------------- set_customer_preference_item (§6 structured)
create or replace function public.set_customer_preference_item(
  p_organization       uuid,
  p_customer           uuid,
  p_category           text,
  p_key                text,
  p_value              text,
  p_source             text default null,
  p_notes              text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_row public.customer_preferences%rowtype;
begin
  perform app.require_session(v_user_id, null);
  perform app.evaluate_access(v_user_id, p_organization, null, null, 'crm.customer.preference.manage');

  -- Find existing row for this customer+category+key
  select * into v_row from public.customer_preferences
  where organization_id = p_organization
    and customer_id = p_customer
    and category = p_category
    and pref_key = p_key;

  if found then
    update public.customer_preferences set
      pref_value = p_value,
      source = coalesce(p_source, v_row.source),
      notes = coalesce(p_notes, v_row.notes)
    where id = v_row.id
    returning * into v_row;
  else
    insert into public.customer_preferences (
      organization_id, customer_id, category, pref_key, pref_value, source, notes
    ) values (
      p_organization, p_customer, p_category, p_key, p_value, p_source, p_notes
    ) returning * into v_row;
  end if;

  perform app.audit(
    'PREFERENCE_UPDATED', 'customer_preference', v_row.id,
    null, to_jsonb(v_row),
    null, jsonb_build_object('customer_id', p_customer, 'category', p_category, 'key', p_key)
  );

  return to_jsonb(v_row);
end;
$$;

-- --------------------------------------------------- create_customer_feedback (§17)
create or replace function public.create_customer_feedback(
  p_organization       uuid,
  p_customer           uuid,
  p_category           text default 'OTHER',
  p_rating             integer default null,
  p_comment            text default null,
  p_source             text default 'INTERNAL',
  p_property           uuid default null,
  p_outlet             uuid default null,
  p_reference_type     text default null,
  p_reference_id       uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_row public.customer_feedback%rowtype;
begin
  perform app.require_session(v_user_id, null);
  perform app.evaluate_access(v_user_id, p_organization, null, null, 'crm.feedback.create');

  insert into public.customer_feedback (
    organization_id, property_id, outlet_id, customer_id,
    source, rating, category, comment, reference_type, reference_id
  ) values (
    p_organization, p_property, p_outlet, p_customer,
    p_source, p_rating, p_category, p_comment, p_reference_type, p_reference_id
  ) returning * into v_row;

  perform app.audit(
    'FEEDBACK_CREATED', 'customer_feedback', v_row.id,
    null, to_jsonb(v_row),
    p_property, jsonb_build_object('customer_id', p_customer, 'category', v_row.category, 'rating', v_row.rating)
  );

  return to_jsonb(v_row);
end;
$$;

-- --------------------------------------------------- update_feedback_status
create or replace function public.update_feedback_status(
  p_feedback           uuid,
  p_organization       uuid,
  p_status             text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.customer_feedback%rowtype;
  v_row public.customer_feedback%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.customer_feedback
  where id = p_feedback and organization_id = p_organization;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;

  perform app.evaluate_access(v_user_id, p_organization, null, null, 'crm.feedback.manage');

  update public.customer_feedback set
    status = p_status
  where id = p_feedback returning * into v_row;

  perform app.audit(
    'FEEDBACK_UPDATED', 'customer_feedback', v_row.id,
    to_jsonb(v_old), to_jsonb(v_row),
    v_row.property_id, jsonb_build_object('status_old', v_old.status, 'status_new', v_row.status)
  );

  return to_jsonb(v_row);
end;
$$;

-- --------------------------------------------------- create_complaint (§18)
create or replace function public.create_complaint(
  p_organization       uuid,
  p_customer           uuid default null,
  p_category           text default 'OTHER',
  p_priority           text default 'NORMAL',
  p_description        text,
  p_property           uuid default null,
  p_outlet             uuid default null,
  p_reference_type     text default null,
  p_reference_id       uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_row public.complaints%rowtype;
begin
  perform app.require_session(v_user_id, null);
  perform app.evaluate_access(v_user_id, p_organization, null, null, 'crm.complaint.create');

  insert into public.complaints (
    organization_id, property_id, outlet_id, customer_id,
    category, priority, description, reference_type, reference_id, created_by
  ) values (
    p_organization, p_property, p_outlet, p_customer,
    p_category, p_priority, p_description, p_reference_type, p_reference_id, v_user_id
  ) returning * into v_row;

  perform app.audit(
    'COMPLAINT_CREATED', 'complaint', v_row.id,
    null, to_jsonb(v_row),
    p_property, jsonb_build_object('customer_id', p_customer, 'priority', v_row.priority)
  );

  return to_jsonb(v_row);
end;
$$;

-- --------------------------------------------------- update_complaint
create or replace function public.update_complaint(
  p_complaint          uuid,
  p_organization       uuid,
  p_status             text default null,
  p_assigned_to        uuid default null,
  p_resolution         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.complaints%rowtype;
  v_row public.complaints%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.complaints
  where id = p_complaint and organization_id = p_organization;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;

  perform app.evaluate_access(v_user_id, p_organization, null, null, 'crm.complaint.manage');

  update public.complaints set
    status = coalesce(p_status, v_old.status),
    assigned_to = coalesce(p_assigned_to, v_old.assigned_to),
    resolution = coalesce(p_resolution, v_old.resolution),
    resolved_at = case
      when p_status = 'RESOLVED' and v_old.status <> 'RESOLVED' then now()
      when p_status <> 'RESOLVED' then null
      else v_old.resolved_at
    end
  where id = p_complaint returning * into v_row;

  perform app.audit(
    'COMPLAINT_UPDATED', 'complaint', v_row.id,
    to_jsonb(v_old), to_jsonb(v_row),
    v_row.property_id, jsonb_build_object('status_old', v_old.status, 'status_new', v_row.status)
  );

  return to_jsonb(v_row);
end;
$$;

-- --------------------------------------------------- create_loyalty_program (§19)
create or replace function public.create_loyalty_program(
  p_organization       uuid,
  p_name               text,
  p_description        text default null,
  p_currency           text default 'INR',
  p_points_name        text default 'Points',
  p_points_per_amount  numeric default null,
  p_minimum_spend      numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_row public.loyalty_programs%rowtype;
begin
  perform app.require_session(v_user_id, null);
  perform app.evaluate_access(v_user_id, p_organization, null, null, 'crm.loyalty.manage');

  insert into public.loyalty_programs (
    organization_id, name, description, currency, points_name,
    points_per_amount, minimum_spend
  ) values (
    p_organization, p_name, p_description, p_currency, p_points_name,
    p_points_per_amount, p_minimum_spend
  ) returning * into v_row;

  perform app.audit(
    'LOYALTY_PROGRAM_CREATED', 'loyalty_program', v_row.id,
    null, to_jsonb(v_row),
    null, jsonb_build_object('name', v_row.name)
  );

  return to_jsonb(v_row);
end;
$$;

-- --------------------------------------------------- create_loyalty_account (§20)
create or replace function public.create_loyalty_account(
  p_organization       uuid,
  p_program            uuid,
  p_customer           uuid,
  p_member_number      text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_row public.loyalty_accounts%rowtype;
begin
  perform app.require_session(v_user_id, null);
  perform app.evaluate_access(v_user_id, p_organization, null, null, 'crm.loyalty.manage');

  insert into public.loyalty_accounts (
    organization_id, program_id, customer_id, member_number
  ) values (
    p_organization, p_program, p_customer, p_member_number
  ) returning * into v_row;

  perform app.audit(
    'LOYALTY_ACCOUNT_CREATED', 'loyalty_account', v_row.id,
    null, to_jsonb(v_row),
    null, jsonb_build_object('customer_id', p_customer, 'member_number', v_row.member_number)
  );

  return to_jsonb(v_row);
end;
$$;

-- --------------------------------------------------- record_loyalty_transaction (§21)
-- Append-only: adjusts the account balance atomically.
create or replace function public.record_loyalty_transaction(
  p_organization       uuid,
  p_loyalty_account    uuid,
  p_customer           uuid,
  p_type               text,
  p_points             numeric,
  p_reference_type     text default null,
  p_reference_id       uuid default null,
  p_description        text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_account public.loyalty_accounts%rowtype;
  v_new_balance numeric;
  v_new_earned numeric;
  v_new_redeemed numeric;
  v_txn public.loyalty_transactions%rowtype;
begin
  perform app.require_session(v_user_id, null);
  perform app.evaluate_access(v_user_id, p_organization, null, null, 'crm.loyalty.manage');

  select * into v_account from public.loyalty_accounts
  where id = p_loyalty_account and organization_id = p_organization;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;

  -- Calculate new balance based on transaction type
  if p_type in ('EARN', 'BONUS', 'ADJUSTMENT') then
    v_new_balance := v_account.current_points + p_points;
    v_new_earned := v_account.lifetime_earned + p_points;
    v_new_redeemed := v_account.lifetime_redeemed;
  elsif p_type = 'REDEEM' then
    if v_account.current_points < p_points then
      raise exception 'NIVAAS_INSUFFICIENT_POINTS';
    end if;
    v_new_balance := v_account.current_points - p_points;
    v_new_earned := v_account.lifetime_earned;
    v_new_redeemed := v_account.lifetime_redeemed + p_points;
  elsif p_type = 'REVERSAL' then
    v_new_balance := v_account.current_points + p_points;
    v_new_earned := v_account.lifetime_earned;
    v_new_redeemed := v_account.lifetime_redeemed;
  elsif p_type = 'EXPIRE' then
    if v_account.current_points < p_points then
      raise exception 'NIVAAS_INSUFFICIENT_POINTS';
    end if;
    v_new_balance := v_account.current_points - p_points;
    v_new_earned := v_account.lifetime_earned;
    v_new_redeemed := v_account.lifetime_redeemed;
  else
    raise exception 'NIVAAS_INVALID_TRANSITION';
  end if;

  if v_new_balance < 0 then
    raise exception 'NIVAAS_INSUFFICIENT_POINTS';
  end if;

  -- Record the transaction
  insert into public.loyalty_transactions (
    organization_id, loyalty_account_id, customer_id,
    type, points, balance_after,
    reference_type, reference_id, description, created_by
  ) values (
    p_organization, p_loyalty_account, p_customer,
    p_type, p_points, v_new_balance,
    p_reference_type, p_reference_id, p_description, v_user_id
  ) returning * into v_txn;

  -- Update account balance
  update public.loyalty_accounts set
    current_points = v_new_balance,
    lifetime_earned = v_new_earned,
    lifetime_redeemed = v_new_redeemed
  where id = p_loyalty_account;

  perform app.audit(
    'LOYALTY_' || p_type, 'loyalty_transaction', v_txn.id,
    null, to_jsonb(v_txn),
    null, jsonb_build_object(
      'customer_id', p_customer, 'points', p_points,
      'balance_after', v_new_balance, 'type', p_type
    )
  );

  return to_jsonb(v_txn);
end;
$$;

-- --------------------------------------------------- create_corporate_account (§28)
create or replace function public.create_corporate_account(
  p_organization       uuid,
  p_name               text,
  p_code               text default null,
  p_contact_name       text default null,
  p_phone              text default null,
  p_email              text default null,
  p_billing_address    text default null,
  p_tax_id             text default null,
  p_credit_limit       numeric default null,
  p_payment_terms      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_row public.corporate_accounts%rowtype;
begin
  perform app.require_session(v_user_id, null);
  perform app.evaluate_access(v_user_id, p_organization, null, null, 'crm.corporate.manage');

  insert into public.corporate_accounts (
    organization_id, name, code, contact_name, phone, email,
    billing_address, tax_id, credit_limit, payment_terms
  ) values (
    p_organization, p_name, p_code, p_contact_name, p_phone, p_email,
    p_billing_address, p_tax_id, p_credit_limit, p_payment_terms
  ) returning * into v_row;

  perform app.audit(
    'CORPORATE_ACCOUNT_CREATED', 'corporate_account', v_row.id,
    null, to_jsonb(v_row),
    null, jsonb_build_object('name', v_row.name)
  );

  return to_jsonb(v_row);
end;
$$;

-- --------------------------------------------------- update_corporate_account
create or replace function public.update_corporate_account(
  p_account            uuid,
  p_organization       uuid,
  p_name               text default null,
  p_code               text default null,
  p_contact_name       text default null,
  p_phone              text default null,
  p_email              text default null,
  p_billing_address    text default null,
  p_tax_id             text default null,
  p_credit_limit       numeric default null,
  p_payment_terms      text default null,
  p_status             text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.corporate_accounts%rowtype;
  v_row public.corporate_accounts%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.corporate_accounts
  where id = p_account and organization_id = p_organization;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;

  perform app.evaluate_access(v_user_id, p_organization, null, null, 'crm.corporate.manage');

  update public.corporate_accounts set
    name = coalesce(p_name, v_old.name),
    code = coalesce(p_code, v_old.code),
    contact_name = coalesce(p_contact_name, v_old.contact_name),
    phone = coalesce(p_phone, v_old.phone),
    email = coalesce(p_email, v_old.email),
    billing_address = coalesce(p_billing_address, v_old.billing_address),
    tax_id = coalesce(p_tax_id, v_old.tax_id),
    credit_limit = coalesce(p_credit_limit, v_old.credit_limit),
    payment_terms = coalesce(p_payment_terms, v_old.payment_terms),
    status = coalesce(p_status, v_old.status)
  where id = p_account returning * into v_row;

  perform app.audit(
    'CORPORATE_ACCOUNT_UPDATED', 'corporate_account', v_row.id,
    to_jsonb(v_old), to_jsonb(v_row),
    null, jsonb_build_object('name', v_row.name)
  );

  return to_jsonb(v_row);
end;
$$;

-- --------------------------------------------------- create_customer_relationship (§29)
create or replace function public.create_customer_relationship(
  p_organization       uuid,
  p_customer           uuid,
  p_related_customer   uuid,
  p_relationship_type  text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_row public.customer_relationships%rowtype;
begin
  perform app.require_session(v_user_id, null);
  perform app.evaluate_access(v_user_id, p_organization, null, null, 'crm.customer.edit');

  insert into public.customer_relationships (
    organization_id, customer_id, related_customer_id, relationship_type
  ) values (
    p_organization, p_customer, p_related_customer, p_relationship_type
  ) returning * into v_row;

  perform app.audit(
    'CUSTOMER_RELATIONSHIP_CREATED', 'customer_relationship', v_row.id,
    null, to_jsonb(v_row),
    null, jsonb_build_object('customer_id', p_customer, 'related_customer_id', p_related_customer, 'type', p_relationship_type)
  );

  return to_jsonb(v_row);
end;
$$;

-- --------------------------------------------------- delete_customer_relationship
create or replace function public.delete_customer_relationship(
  p_relationship       uuid,
  p_organization       uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.customer_relationships%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.customer_relationships
  where id = p_relationship and organization_id = p_organization;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;

  perform app.evaluate_access(v_user_id, p_organization, null, null, 'crm.customer.edit');

  delete from public.customer_relationships where id = p_relationship;

  perform app.audit(
    'CUSTOMER_RELATIONSHIP_DELETED', 'customer_relationship', p_relationship,
    to_jsonb(v_old), null,
    null, jsonb_build_object('customer_id', v_old.customer_id, 'related_customer_id', v_old.related_customer_id)
  );
end;
$$;

-- =================================================================== grants

grant execute on function public.update_guest_crm to authenticated;
grant execute on function public.create_customer_tag to authenticated;
grant execute on function public.delete_customer_tag to authenticated;
grant execute on function public.assign_customer_tag to authenticated;
grant execute on function public.remove_customer_tag to authenticated;
grant execute on function public.create_customer_note to authenticated;
grant execute on function public.update_customer_note to authenticated;
grant execute on function public.delete_customer_note to authenticated;
grant execute on function public.upsert_customer_preferences to authenticated;
grant execute on function public.set_customer_preference_item to authenticated;
grant execute on function public.create_customer_feedback to authenticated;
grant execute on function public.update_feedback_status to authenticated;
grant execute on function public.create_complaint to authenticated;
grant execute on function public.update_complaint to authenticated;
grant execute on function public.create_loyalty_program to authenticated;
grant execute on function public.create_loyalty_account to authenticated;
grant execute on function public.record_loyalty_transaction to authenticated;
grant execute on function public.create_corporate_account to authenticated;
grant execute on function public.update_corporate_account to authenticated;
grant execute on function public.create_customer_relationship to authenticated;
grant execute on function public.delete_customer_relationship to authenticated;

-- =================================================================== CRM permissions (§34)

do $$
declare
  v_tokens text[] := array[
    'crm.view',
    'crm.customer.view', 'crm.customer.create', 'crm.customer.edit',
    'crm.customer.archive', 'crm.customer.merge',
    'crm.customer.note.view', 'crm.customer.note.create',
    'crm.customer.note.edit', 'crm.customer.note.delete',
    'crm.customer.preference.view', 'crm.customer.preference.manage',
    'crm.customer.tag.view', 'crm.customer.tag.manage',
    'crm.feedback.view', 'crm.feedback.create', 'crm.feedback.manage',
    'crm.complaint.view', 'crm.complaint.create', 'crm.complaint.manage',
    'crm.loyalty.view', 'crm.loyalty.manage', 'crm.loyalty.adjust',
    'crm.segment.view', 'crm.segment.manage',
    'crm.corporate.view', 'crm.corporate.manage'
  ];
begin
  perform app.require_valid(array_length(v_tokens, 1) = 27, 'NIVAAS_PERMISSION_SEED_BROKEN');
  perform app.require_valid(
    not exists (select t from unnest(v_tokens) t
                 where t !~ E'^[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*$'),
    'NIVAAS_PERMISSION_SEED_BROKEN');
end;
$$;

-- Delete existing grants for these tokens (idempotent re-run)
delete from public.role_permissions rp
  using public.roles r
  where r.id = rp.role_id and r.is_system
    and rp.permission in (
      'crm.view',
      'crm.customer.view', 'crm.customer.create', 'crm.customer.edit',
      'crm.customer.archive', 'crm.customer.merge',
      'crm.customer.note.view', 'crm.customer.note.create',
      'crm.customer.note.edit', 'crm.customer.note.delete',
      'crm.customer.preference.view', 'crm.customer.preference.manage',
      'crm.customer.tag.view', 'crm.customer.tag.manage',
      'crm.feedback.view', 'crm.feedback.create', 'crm.feedback.manage',
      'crm.complaint.view', 'crm.complaint.create', 'crm.complaint.manage',
      'crm.loyalty.view', 'crm.loyalty.manage', 'crm.loyalty.adjust',
      'crm.segment.view', 'crm.segment.manage',
      'crm.corporate.view', 'crm.corporate.manage'
    );

with role_permission_matrix(role_name, permission) as (
  values
    -- Owner: full CRM
    ('ORG_OWNER', 'crm.view'),
    ('ORG_OWNER', 'crm.customer.view'), ('ORG_OWNER', 'crm.customer.create'),
    ('ORG_OWNER', 'crm.customer.edit'), ('ORG_OWNER', 'crm.customer.archive'),
    ('ORG_OWNER', 'crm.customer.merge'),
    ('ORG_OWNER', 'crm.customer.note.view'), ('ORG_OWNER', 'crm.customer.note.create'),
    ('ORG_OWNER', 'crm.customer.note.edit'), ('ORG_OWNER', 'crm.customer.note.delete'),
    ('ORG_OWNER', 'crm.customer.preference.view'), ('ORG_OWNER', 'crm.customer.preference.manage'),
    ('ORG_OWNER', 'crm.customer.tag.view'), ('ORG_OWNER', 'crm.customer.tag.manage'),
    ('ORG_OWNER', 'crm.feedback.view'), ('ORG_OWNER', 'crm.feedback.create'),
    ('ORG_OWNER', 'crm.feedback.manage'),
    ('ORG_OWNER', 'crm.complaint.view'), ('ORG_OWNER', 'crm.complaint.create'),
    ('ORG_OWNER', 'crm.complaint.manage'),
    ('ORG_OWNER', 'crm.loyalty.view'), ('ORG_OWNER', 'crm.loyalty.manage'),
    ('ORG_OWNER', 'crm.loyalty.adjust'),
    ('ORG_OWNER', 'crm.segment.view'), ('ORG_OWNER', 'crm.segment.manage'),
    ('ORG_OWNER', 'crm.corporate.view'), ('ORG_OWNER', 'crm.corporate.manage'),

    -- Admin: full CRM
    ('ORG_ADMIN', 'crm.view'),
    ('ORG_ADMIN', 'crm.customer.view'), ('ORG_ADMIN', 'crm.customer.create'),
    ('ORG_ADMIN', 'crm.customer.edit'), ('ORG_ADMIN', 'crm.customer.archive'),
    ('ORG_ADMIN', 'crm.customer.merge'),
    ('ORG_ADMIN', 'crm.customer.note.view'), ('ORG_ADMIN', 'crm.customer.note.create'),
    ('ORG_ADMIN', 'crm.customer.note.edit'), ('ORG_ADMIN', 'crm.customer.note.delete'),
    ('ORG_ADMIN', 'crm.customer.preference.view'), ('ORG_ADMIN', 'crm.customer.preference.manage'),
    ('ORG_ADMIN', 'crm.customer.tag.view'), ('ORG_ADMIN', 'crm.customer.tag.manage'),
    ('ORG_ADMIN', 'crm.feedback.view'), ('ORG_ADMIN', 'crm.feedback.create'),
    ('ORG_ADMIN', 'crm.feedback.manage'),
    ('ORG_ADMIN', 'crm.complaint.view'), ('ORG_ADMIN', 'crm.complaint.create'),
    ('ORG_ADMIN', 'crm.complaint.manage'),
    ('ORG_ADMIN', 'crm.loyalty.view'), ('ORG_ADMIN', 'crm.loyalty.manage'),
    ('ORG_ADMIN', 'crm.loyalty.adjust'),
    ('ORG_ADMIN', 'crm.segment.view'), ('ORG_ADMIN', 'crm.segment.manage'),
    ('ORG_ADMIN', 'crm.corporate.view'), ('ORG_ADMIN', 'crm.corporate.manage'),

    -- General Manager: CRM operations
    ('GENERAL_MANAGER', 'crm.view'),
    ('GENERAL_MANAGER', 'crm.customer.view'), ('GENERAL_MANAGER', 'crm.customer.create'),
    ('GENERAL_MANAGER', 'crm.customer.edit'),
    ('GENERAL_MANAGER', 'crm.customer.note.view'), ('GENERAL_MANAGER', 'crm.customer.note.create'),
    ('GENERAL_MANAGER', 'crm.customer.note.edit'),
    ('GENERAL_MANAGER', 'crm.customer.preference.view'), ('GENERAL_MANAGER', 'crm.customer.preference.manage'),
    ('GENERAL_MANAGER', 'crm.customer.tag.view'), ('GENERAL_MANAGER', 'crm.customer.tag.manage'),
    ('GENERAL_MANAGER', 'crm.feedback.view'), ('GENERAL_MANAGER', 'crm.feedback.create'),
    ('GENERAL_MANAGER', 'crm.feedback.manage'),
    ('GENERAL_MANAGER', 'crm.complaint.view'), ('GENERAL_MANAGER', 'crm.complaint.create'),
    ('GENERAL_MANAGER', 'crm.complaint.manage'),
    ('GENERAL_MANAGER', 'crm.loyalty.view'), ('GENERAL_MANAGER', 'crm.loyalty.manage'),
    ('GENERAL_MANAGER', 'crm.segment.view'),
    ('GENERAL_MANAGER', 'crm.corporate.view'), ('GENERAL_MANAGER', 'crm.corporate.manage'),

    -- Property Manager: same as GM
    ('PROPERTY_MANAGER', 'crm.view'),
    ('PROPERTY_MANAGER', 'crm.customer.view'), ('PROPERTY_MANAGER', 'crm.customer.create'),
    ('PROPERTY_MANAGER', 'crm.customer.edit'),
    ('PROPERTY_MANAGER', 'crm.customer.note.view'), ('PROPERTY_MANAGER', 'crm.customer.note.create'),
    ('PROPERTY_MANAGER', 'crm.customer.note.edit'),
    ('PROPERTY_MANAGER', 'crm.customer.preference.view'), ('PROPERTY_MANAGER', 'crm.customer.preference.manage'),
    ('PROPERTY_MANAGER', 'crm.customer.tag.view'), ('PROPERTY_MANAGER', 'crm.customer.tag.manage'),
    ('PROPERTY_MANAGER', 'crm.feedback.view'), ('PROPERTY_MANAGER', 'crm.feedback.create'),
    ('PROPERTY_MANAGER', 'crm.feedback.manage'),
    ('PROPERTY_MANAGER', 'crm.complaint.view'), ('PROPERTY_MANAGER', 'crm.complaint.create'),
    ('PROPERTY_MANAGER', 'crm.complaint.manage'),
    ('PROPERTY_MANAGER', 'crm.loyalty.view'), ('PROPERTY_MANAGER', 'crm.loyalty.manage'),
    ('PROPERTY_MANAGER', 'crm.segment.view'),
    ('PROPERTY_MANAGER', 'crm.corporate.view'), ('PROPERTY_MANAGER', 'crm.corporate.manage'),

    -- Restaurant Manager: view customers, notes, feedback
    ('RESTAURANT_MANAGER', 'crm.view'),
    ('RESTAURANT_MANAGER', 'crm.customer.view'),
    ('RESTAURANT_MANAGER', 'crm.customer.note.view'), ('RESTAURANT_MANAGER', 'crm.customer.note.create'),
    ('RESTAURANT_MANAGER', 'crm.customer.tag.view'),
    ('RESTAURANT_MANAGER', 'crm.feedback.view'), ('RESTAURANT_MANAGER', 'crm.feedback.create'),
    ('RESTAURANT_MANAGER', 'crm.complaint.view'), ('RESTAURANT_MANAGER', 'crm.complaint.create'),
    ('RESTAURANT_MANAGER', 'crm.loyalty.view'),

    -- Store Manager: view customers
    ('STORE_MANAGER', 'crm.view'),
    ('STORE_MANAGER', 'crm.customer.view'),
    ('STORE_MANAGER', 'crm.customer.tag.view'),
    ('STORE_MANAGER', 'crm.loyalty.view'),

    -- Staff: minimal CRM access
    ('STAFF', 'crm.view'),
    ('STAFF', 'crm.customer.view')
)
insert into public.role_permissions (role_id, permission)
select r.id, m.permission
from role_permission_matrix m
join public.roles r on r.name = m.role_name and r.is_system
on conflict (role_id, permission) do nothing;

-- Self-check
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.role_permissions rp
  join public.roles r on r.id = rp.role_id and r.is_system
  where rp.permission in (
    'crm.view',
    'crm.customer.view', 'crm.customer.create', 'crm.customer.edit',
    'crm.customer.archive', 'crm.customer.merge',
    'crm.customer.note.view', 'crm.customer.note.create',
    'crm.customer.note.edit', 'crm.customer.note.delete',
    'crm.customer.preference.view', 'crm.customer.preference.manage',
    'crm.customer.tag.view', 'crm.customer.tag.manage',
    'crm.feedback.view', 'crm.feedback.create', 'crm.feedback.manage',
    'crm.complaint.view', 'crm.complaint.create', 'crm.complaint.manage',
    'crm.loyalty.view', 'crm.loyalty.manage', 'crm.loyalty.adjust',
    'crm.segment.view', 'crm.segment.manage',
    'crm.corporate.view', 'crm.corporate.manage'
  );
  -- ORG_OWNER=27, ORG_ADMIN=27, GM=24, PM=24, RM=10, SM=4, STAFF=2 → 118
  perform app.require_valid(v_count = 118,
    'NIVAAS_PERMISSION_COUNT: expected 118 CRM grants, got ' || v_count);
end;
$$;
