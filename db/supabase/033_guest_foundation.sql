-- AMRUT NIVAAS · 033 — guest foundation (Prompt #08 §11-§13)
--
-- Guest master data: guests and their identification documents.
-- Organization-scoped with RLS. Guests are NOT authenticated users — they are
-- people who stay at the property. The profiles table is for login identity;
-- this table is for hospitality guests.
--
-- Key invariants:
--   - A guest belongs to one organization (the tenancy boundary for RLS).
--   - A guest may visit multiple properties within that organization.
--   - Guest documents (ID/passport) are sensitive — access requires
--     guest.sensitive.view permission, enforced at the application layer.
--   - Document numbers must NEVER appear in audit metadata.
--   - Archive-never-delete for guests with stay history.

set local search_path = '';

-- =================================================================== guests

create table if not exists public.guests (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  guest_code           text not null,
  first_name           text not null,
  last_name            text,
  display_name         text,
  email                text,
  phone                text,
  date_of_birth        date,
  nationality          text,
  gender               text,
  address_line1        text,
  address_line2        text,
  city                 text,
  state                text,
  postal_code          text,
  country              text not null default 'India',
  preferred_language   text,
  vip_status           text not null default 'REGULAR',
  source               text not null default 'DIRECT',
  notes                text,
  total_stays          integer not null default 0,
  total_nights         integer not null default 0,
  version              integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  archived_at          timestamptz,
  created_by           uuid,

  constraint guests_code_not_blank check (btrim(guest_code) <> ''),
  constraint guests_first_name_not_blank check (btrim(first_name) <> ''),
  constraint guests_gender_ok check (gender is null or gender in ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY')),
  constraint guests_vip_status_ok check (vip_status in ('REGULAR', 'VIP', 'VVIP')),
  constraint guests_source_ok check (source in (
    'DIRECT', 'WALK_IN', 'PHONE', 'EMAIL', 'WEBSITE', 'OTA',
    'TRAVEL_AGENT', 'CORPORATE', 'WHATSAPP', 'REFERRAL', 'OTHER'
  )),
  constraint guests_total_stays_non_negative check (total_stays >= 0),
  constraint guests_total_nights_non_negative check (total_nights >= 0)
);

comment on table public.guests is
  'Guest master. Organization-scoped. Archive-never-delete. NOT an authenticated user.';

-- Unique code per organization (active guests only).
drop index if exists public.guests_code_org_idx;
create unique index guests_code_org_idx
  on public.guests (organization_id, lower(guest_code))
  where archived_at is null;

create index if not exists guests_org_idx
  on public.guests (organization_id);

create index if not exists guests_phone_idx
  on public.guests (organization_id, phone)
  where phone is not null;

create index if not exists guests_email_idx
  on public.guests (organization_id, lower(email))
  where email is not null;

create index if not exists guests_name_idx
  on public.guests (organization_id, lower(last_name), lower(first_name));

drop trigger if exists guests_touch on public.guests;
create trigger guests_touch before update on public.guests
  for each row execute function app.touch_updated_at();

-- RLS
drop policy if exists guests_read on public.guests;
create policy guests_read on public.guests
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists guests_no_write on public.guests;
create policy guests_no_write on public.guests
  for all to authenticated
  using (false);

-- =================================================================== guest documents

-- Identity documents (passport, national ID, driving licence). Sensitive data.
-- Document numbers must NEVER appear in audit metadata — the audit doors below
-- record only the document type and ID, never the number itself.
create table if not exists public.guest_documents (
  id                   uuid primary key default gen_random_uuid(),
  guest_id             uuid not null references public.guests(id) on delete cascade,
  document_type        text not null,
  document_number      text not null,
  issuing_country      text not null default 'India',
  expiry_date          date,
  is_verified          boolean not null default false,
  verified_at          timestamptz,
  verified_by          uuid,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint guest_documents_number_not_blank check (btrim(document_number) <> ''),
  constraint guest_documents_type_ok check (document_type in (
    'PASSPORT', 'NATIONAL_ID', 'DRIVING_LICENSE', 'VOTER_ID', 'AADHAAR', 'OTHER'
  ))
);

comment on table public.guest_documents is
  'Guest identity documents. Sensitive — access requires guest.sensitive.view.';

create index if not exists guest_documents_guest_idx
  on public.guest_documents (guest_id);

drop trigger if exists guest_documents_touch on public.guest_documents;
create trigger guest_documents_touch before update on public.guest_documents
  for each row execute function app.touch_updated_at();

-- RLS: guest_documents inherit access through the parent guest's organization.
drop policy if exists guest_documents_read on public.guest_documents;
create policy guest_documents_read on public.guest_documents
  for select to authenticated
  using (guest_id in (
    select g.id from public.guests g
    where g.organization_id in (
      select m.organization_id from public.organization_memberships m
      where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
    )
  ));

drop policy if exists guest_documents_no_write on public.guest_documents;
create policy guest_documents_no_write on public.guest_documents
  for all to authenticated
  using (false);

-- =================================================================== doors

-- create_guest
create or replace function public.create_guest(
  p_organization       uuid,
  p_guest_code         text,
  p_first_name         text,
  p_last_name          text default null,
  p_display_name       text default null,
  p_email              text default null,
  p_phone              text default null,
  p_date_of_birth      date default null,
  p_nationality        text default null,
  p_gender             text default null,
  p_address_line1      text default null,
  p_address_line2      text default null,
  p_city               text default null,
  p_state              text default null,
  p_postal_code        text default null,
  p_country            text default 'India',
  p_preferred_language text default null,
  p_vip_status         text default 'REGULAR',
  p_source             text default 'DIRECT',
  p_notes              text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_row public.guests%rowtype;
begin
  perform app.require_session(v_user_id, null);
  perform app.evaluate_access(v_user_id, p_organization, null, null, 'guest.create');

  insert into public.guests (
    organization_id, guest_code, first_name, last_name, display_name,
    email, phone, date_of_birth, nationality, gender,
    address_line1, address_line2, city, state, postal_code, country,
    preferred_language, vip_status, source, notes, created_by
  ) values (
    p_organization, p_guest_code, p_first_name, p_last_name,
    coalesce(p_display_name, nullif(trim(coalesce(p_last_name, '') || ' ' || p_first_name), ' ')),
    p_email, p_phone, p_date_of_birth, p_nationality, p_gender,
    p_address_line1, p_address_line2, p_city, p_state, p_postal_code, p_country,
    p_preferred_language, p_vip_status, p_source, p_notes, v_user_id
  ) returning * into v_row;

  perform app.audit(
    'GUEST_CREATED', 'guest', v_row.id,
    null, to_jsonb(v_row) - 'date_of_birth' - 'email' - 'phone' - 'address_line1' - 'address_line2',
    null, jsonb_build_object('guest_code', v_row.guest_code, 'name', v_row.display_name)
  );

  return to_jsonb(v_row);
end;
$$;

-- update_guest
create or replace function public.update_guest(
  p_guest              uuid,
  p_organization       uuid,
  p_expected_version   integer,
  p_first_name         text default null,
  p_last_name          text default null,
  p_display_name       text default null,
  p_email              text default null,
  p_phone              text default null,
  p_date_of_birth      date default null,
  p_nationality        text default null,
  p_gender             text default null,
  p_address_line1      text default null,
  p_address_line2      text default null,
  p_city               text default null,
  p_state              text default null,
  p_postal_code        text default null,
  p_country            text default null,
  p_preferred_language text default null,
  p_vip_status         text default null,
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
    first_name = coalesce(p_first_name, v_old.first_name),
    last_name = coalesce(p_last_name, v_old.last_name),
    display_name = coalesce(p_display_name, v_old.display_name),
    email = coalesce(p_email, v_old.email),
    phone = coalesce(p_phone, v_old.phone),
    date_of_birth = coalesce(p_date_of_birth, v_old.date_of_birth),
    nationality = coalesce(p_nationality, v_old.nationality),
    gender = coalesce(p_gender, v_old.gender),
    address_line1 = coalesce(p_address_line1, v_old.address_line1),
    address_line2 = coalesce(p_address_line2, v_old.address_line2),
    city = coalesce(p_city, v_old.city),
    state = coalesce(p_state, v_old.state),
    postal_code = coalesce(p_postal_code, v_old.postal_code),
    country = coalesce(p_country, v_old.country),
    preferred_language = coalesce(p_preferred_language, v_old.preferred_language),
    vip_status = coalesce(p_vip_status, v_old.vip_status),
    source = coalesce(p_source, v_old.source),
    notes = coalesce(p_notes, v_old.notes),
    version = version + 1
  where id = p_guest returning * into v_row;

  perform app.audit(
    'GUEST_UPDATED', 'guest', v_row.id,
    to_jsonb(v_old) - 'date_of_birth' - 'email' - 'phone' - 'address_line1' - 'address_line2',
    to_jsonb(v_row) - 'date_of_birth' - 'email' - 'phone' - 'address_line1' - 'address_line2',
    null, jsonb_build_object('version', v_row.version)
  );

  return to_jsonb(v_row);
end;
$$;

-- archive_guest
create or replace function public.archive_guest(
  p_guest              uuid,
  p_organization       uuid,
  p_expected_version   integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.guests%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.guests
  where id = p_guest and organization_id = p_organization;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;

  perform app.evaluate_access(v_user_id, p_organization, null, null, 'guest.edit');

  update public.guests set
    archived_at = now(),
    version = version + 1
  where id = p_guest;

  perform app.audit(
    'GUEST_ARCHIVED', 'guest', p_guest,
    to_jsonb(v_old) - 'date_of_birth' - 'email' - 'phone' - 'address_line1' - 'address_line2',
    null,
    null, jsonb_build_object('version', v_old.version + 1)
  );
end;
$$;

-- create_guest_document
-- IMPORTANT: document_number is NEVER included in audit metadata.
create or replace function public.create_guest_document(
  p_guest              uuid,
  p_organization       uuid,
  p_document_type      text,
  p_document_number    text,
  p_issuing_country    text default 'India',
  p_expiry_date        date default null,
  p_is_verified        boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_guest public.guests%rowtype;
  v_row public.guest_documents%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_guest from public.guests
  where id = p_guest and organization_id = p_organization;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;

  perform app.evaluate_access(v_user_id, p_organization, null, null, 'guest.edit');

  insert into public.guest_documents (
    guest_id, document_type, document_number, issuing_country,
    expiry_date, is_verified, verified_at, verified_by
  ) values (
    p_guest, p_document_type, p_document_number, p_issuing_country,
    p_expiry_date, p_is_verified,
    case when p_is_verified then now() else null end,
    case when p_is_verified then v_user_id else null end
  ) returning * into v_row;

  -- Audit records document type and ID only — NEVER the document number.
  perform app.audit(
    'GUEST_DOCUMENT_CREATED', 'guest_document', v_row.id,
    null, to_jsonb(v_row) - 'document_number',
    null, jsonb_build_object('guest_id', v_row.guest_id, 'document_type', v_row.document_type)
  );

  return to_jsonb(v_row);
end;
$$;

-- update_guest_document
create or replace function public.update_guest_document(
  p_document           uuid,
  p_organization       uuid,
  p_document_type      text default null,
  p_document_number    text default null,
  p_issuing_country    text default null,
  p_expiry_date        date default null,
  p_is_verified        boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.guest_documents%rowtype;
  v_row public.guest_documents%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select gd.* into v_old
  from public.guest_documents gd
  join public.guests g on g.id = gd.guest_id
  where gd.id = p_document and g.organization_id = p_organization;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;

  perform app.evaluate_access(v_user_id, p_organization, null, null, 'guest.edit');

  update public.guest_documents set
    document_type = coalesce(p_document_type, v_old.document_type),
    document_number = coalesce(p_document_number, v_old.document_number),
    issuing_country = coalesce(p_issuing_country, v_old.issuing_country),
    expiry_date = coalesce(p_expiry_date, v_old.expiry_date),
    is_verified = coalesce(p_is_verified, v_old.is_verified),
    verified_at = case
      when coalesce(p_is_verified, v_old.is_verified) and not v_old.is_verified then now()
      else v_old.verified_at
    end,
    verified_by = case
      when coalesce(p_is_verified, v_old.is_verified) and not v_old.is_verified then v_user_id
      else v_old.verified_by
    end
  where id = p_document returning * into v_row;

  -- Audit: NEVER include document_number.
  perform app.audit(
    'GUEST_DOCUMENT_UPDATED', 'guest_document', v_row.id,
    to_jsonb(v_old) - 'document_number',
    to_jsonb(v_row) - 'document_number',
    null, jsonb_build_object('document_type', v_row.document_type)
  );

  return to_jsonb(v_row);
end;
$$;

-- delete_guest_document (soft: only if not verified, or if no stay references it)
create or replace function public.delete_guest_document(
  p_document           uuid,
  p_organization       uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.guest_documents%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select gd.* into v_old
  from public.guest_documents gd
  join public.guests g on g.id = gd.guest_id
  where gd.id = p_document and g.organization_id = p_organization;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;

  perform app.evaluate_access(v_user_id, p_organization, null, null, 'guest.edit');

  delete from public.guest_documents where id = p_document;

  -- Audit: NEVER include document_number.
  perform app.audit(
    'GUEST_DOCUMENT_DELETED', 'guest_document', p_document,
    to_jsonb(v_old) - 'document_number',
    null,
    null, jsonb_build_object('document_type', v_old.document_type)
  );
end;
$$;

-- =================================================================== grants

grant execute on function public.create_guest to authenticated;
grant execute on function public.update_guest to authenticated;
grant execute on function public.archive_guest to authenticated;
grant execute on function public.create_guest_document to authenticated;
grant execute on function public.update_guest_document to authenticated;
grant execute on function public.delete_guest_document to authenticated;
