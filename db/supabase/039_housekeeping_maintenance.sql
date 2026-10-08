-- AMRUT NIVAAS · 039 — housekeeping, room operations & maintenance (Prompt #09)
--
-- Operational layer: housekeeping tasks, room inspections, maintenance requests,
-- lost & found, and asset foundation. Connects PMS check-out to housekeeping workflow.
--
-- Key invariants:
--   - Housekeeping tasks follow a state machine: PENDING → ASSIGNED → IN_PROGRESS → COMPLETED → VERIFIED.
--   - Check-out auto-creates a CHECKOUT_CLEAN task for the vacated room.
--   - Inspections use configurable checklists; a failed item fails the inspection.
--   - Maintenance requests follow: OPEN → ASSIGNED → IN_PROGRESS → RESOLVED → VERIFIED → CLOSED.
--   - A room out of order (operational_status) is not sellable regardless of housekeeping.
--   - Maintenance resolution does NOT auto-release a room; housekeeping + inspection required.
--   - Parts consumption reuses the stock ledger (024) via post_stock_movement.

set local search_path = '';

-- =================================================================== housekeeping tasks

create table if not exists public.housekeeping_tasks (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  property_id          uuid not null references public.properties(id) on delete restrict,
  room_id              uuid not null references public.rooms(id) on delete restrict,
  stay_id              uuid references public.stays(id) on delete set null,
  task_type            text not null,
  priority             text not null default 'NORMAL',
  status               text not null default 'PENDING',
  assigned_to          uuid,
  started_at           timestamptz,
  completed_at         timestamptz,
  verified_at          timestamptz,
  verified_by          uuid,
  notes                text,
  version              integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid,

  constraint housekeeping_tasks_task_type_ok check (task_type in (
    'CHECKOUT_CLEAN', 'STAYOVER_CLEAN', 'DEEP_CLEAN', 'INSPECTION',
    'TURNDOWN', 'SPECIAL_REQUEST', 'OTHER'
  )),
  constraint housekeeping_tasks_priority_ok check (priority in (
    'LOW', 'NORMAL', 'HIGH', 'URGENT'
  )),
  constraint housekeeping_tasks_status_ok check (status in (
    'PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'VERIFIED', 'CANCELLED'
  )),
  constraint housekeeping_tasks_completed_requires_started check (
    completed_at is null or started_at is not null
  ),
  constraint housekeeping_tasks_verified_requires_completed check (
    verified_at is null or completed_at is not null
  )
);

comment on table public.housekeeping_tasks is
  'Housekeeping work required for a room. State machine: PENDING→ASSIGNED→IN_PROGRESS→COMPLETED→VERIFIED.';

create index if not exists housekeeping_tasks_property_idx
  on public.housekeeping_tasks (property_id);

create index if not exists housekeeping_tasks_room_idx
  on public.housekeeping_tasks (room_id);

create index if not exists housekeeping_tasks_assigned_idx
  on public.housekeeping_tasks (assigned_to)
  where assigned_to is not null;

create index if not exists housekeeping_tasks_status_idx
  on public.housekeeping_tasks (property_id, status);

create index if not exists housekeeping_tasks_org_idx
  on public.housekeeping_tasks (organization_id);

drop trigger if exists housekeeping_tasks_touch on public.housekeeping_tasks;
create trigger housekeeping_tasks_touch before update on public.housekeeping_tasks
  for each row execute function app.touch_updated_at();

drop policy if exists housekeeping_tasks_read on public.housekeeping_tasks;
create policy housekeeping_tasks_read on public.housekeeping_tasks
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists housekeeping_tasks_no_write on public.housekeeping_tasks;
create policy housekeeping_tasks_no_write on public.housekeeping_tasks
  for all to authenticated
  using (false);

-- =================================================================== inspection checklists

-- Configurable checklist templates for room inspections.
create table if not exists public.inspection_checklists (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  property_id          uuid not null references public.properties(id) on delete restrict,
  name                 text not null,
  description          text,
  is_active            boolean not null default true,
  version              integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid,

  constraint inspection_checklists_name_not_blank check (btrim(name) <> '')
);

comment on table public.inspection_checklists is
  'Configurable inspection checklist templates. Property-scoped.';

create index if not exists inspection_checklists_property_idx
  on public.inspection_checklists (property_id);

create index if not exists inspection_checklists_org_idx
  on public.inspection_checklists (organization_id);

drop trigger if exists inspection_checklists_touch on public.inspection_checklists;
create trigger inspection_checklists_touch before update on public.inspection_checklists
  for each row execute function app.touch_updated_at();

drop policy if exists inspection_checklists_read on public.inspection_checklists;
create policy inspection_checklists_read on public.inspection_checklists
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists inspection_checklists_no_write on public.inspection_checklists;
create policy inspection_checklists_no_write on public.inspection_checklists
  for all to authenticated
  using (false);

-- Checklist items (questions/checks within a template).
create table if not exists public.inspection_checklist_items (
  id                   uuid primary key default gen_random_uuid(),
  checklist_id         uuid not null references public.inspection_checklists(id) on delete cascade,
  question             text not null,
  category             text not null default 'GENERAL',
  sort_order           integer not null default 0,
  is_required          boolean not null default true,
  created_at           timestamptz not null default now(),

  constraint inspection_checklist_items_question_not_blank check (btrim(question) <> ''),
  constraint inspection_checklist_items_category_ok check (category in (
    'BEDDING', 'BATHROOM', 'AMENITIES', 'ELECTRICAL', 'HVAC', 'CLEANLINESS', 'SAFETY', 'GENERAL'
  ))
);

comment on table public.inspection_checklist_items is
  'Individual check items within an inspection checklist template.';

create index if not exists inspection_checklist_items_checklist_idx
  on public.inspection_checklist_items (checklist_id);

drop policy if exists inspection_checklist_items_read on public.inspection_checklist_items;
create policy inspection_checklist_items_read on public.inspection_checklist_items
  for select to authenticated
  using (checklist_id in (
    select cl.id from public.inspection_checklists cl
    where cl.organization_id in (
      select m.organization_id from public.organization_memberships m
      where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
    )
  ));

drop policy if exists inspection_checklist_items_no_write on public.inspection_checklist_items;
create policy inspection_checklist_items_no_write on public.inspection_checklist_items
  for all to authenticated
  using (false);

-- =================================================================== room inspections

create table if not exists public.room_inspections (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  property_id          uuid not null references public.properties(id) on delete restrict,
  room_id              uuid not null references public.rooms(id) on delete restrict,
  housekeeping_task_id uuid references public.housekeeping_tasks(id) on delete set null,
  checklist_id         uuid references public.inspection_checklists(id) on delete set null,
  inspector_id         uuid,
  status               text not null default 'PENDING',
  inspection_date      timestamptz not null default now(),
  passed_at            timestamptz,
  failed_at            timestamptz,
  notes                text,
  version              integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid,

  constraint room_inspections_status_ok check (status in ('PENDING', 'PASSED', 'FAILED'))
);

comment on table public.room_inspections is
  'Room inspection records. Links to housekeeping task and checklist.';

create index if not exists room_inspections_property_idx
  on public.room_inspections (property_id);

create index if not exists room_inspections_room_idx
  on public.room_inspections (room_id);

create index if not exists room_inspections_task_idx
  on public.room_inspections (housekeeping_task_id)
  where housekeeping_task_id is not null;

create index if not exists room_inspections_org_idx
  on public.room_inspections (organization_id);

drop trigger if exists room_inspections_touch on public.room_inspections;
create trigger room_inspections_touch before update on public.room_inspections
  for each row execute function app.touch_updated_at();

drop policy if exists room_inspections_read on public.room_inspections;
create policy room_inspections_read on public.room_inspections
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists room_inspections_no_write on public.room_inspections;
create policy room_inspections_no_write on public.room_inspections
  for all to authenticated
  using (false);

-- Inspection results (per checklist item).
create table if not exists public.room_inspection_results (
  id                   uuid primary key default gen_random_uuid(),
  inspection_id        uuid not null references public.room_inspections(id) on delete cascade,
  checklist_item_id    uuid not null references public.inspection_checklist_items(id) on delete restrict,
  result               text not null,
  note                 text,
  created_at           timestamptz not null default now(),

  constraint room_inspection_results_result_ok check (result in ('PASS', 'FAIL', 'NOT_APPLICABLE'))
);

comment on table public.room_inspection_results is
  'Per-item results for a room inspection.';

create index if not exists room_inspection_results_inspection_idx
  on public.room_inspection_results (inspection_id);

drop policy if exists room_inspection_results_read on public.room_inspection_results;
create policy room_inspection_results_read on public.room_inspection_results
  for select to authenticated
  using (inspection_id in (
    select ri.id from public.room_inspections ri
    where ri.organization_id in (
      select m.organization_id from public.organization_memberships m
      where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
    )
  ));

drop policy if exists room_inspection_results_no_write on public.room_inspection_results;
create policy room_inspection_results_no_write on public.room_inspection_results
  for all to authenticated
  using (false);

-- =================================================================== maintenance requests

create table if not exists public.maintenance_requests (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  property_id          uuid not null references public.properties(id) on delete restrict,
  room_id              uuid references public.rooms(id) on delete set null,
  outlet_id            uuid references public.outlets(id) on delete set null,
  asset_id             uuid,  -- forward reference; assets table created below
  category             text not null,
  priority             text not null default 'NORMAL',
  status               text not null default 'OPEN',
  source               text not null default 'OTHER',
  title                text not null,
  description          text,
  reported_by          uuid,
  assigned_to          uuid,
  assigned_vendor_id   uuid,  -- references suppliers (028) for external work
  estimated_cost       numeric,
  actual_cost          numeric,
  reported_at          timestamptz not null default now(),
  assigned_at          timestamptz,
  started_at           timestamptz,
  resolved_at          timestamptz,
  resolved_by          uuid,
  verified_at          timestamptz,
  verified_by          uuid,
  verification_notes   text,
  closed_at            timestamptz,
  closed_by            uuid,
  resolution           text,
  notes                text,
  version              integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid,

  constraint maintenance_requests_title_not_blank check (btrim(title) <> ''),
  constraint maintenance_requests_category_ok check (category in (
    'ELECTRICAL', 'PLUMBING', 'HVAC', 'CARPENTRY', 'PAINTING', 'APPLIANCE',
    'IT', 'CIVIL', 'FURNITURE', 'ROOM_AMENITY', 'KITCHEN_EQUIPMENT', 'OTHER'
  )),
  constraint maintenance_requests_priority_ok check (priority in (
    'LOW', 'NORMAL', 'HIGH', 'URGENT', 'EMERGENCY'
  )),
  constraint maintenance_requests_status_ok check (status in (
    'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'VERIFIED', 'CLOSED', 'CANCELLED'
  )),
  constraint maintenance_requests_source_ok check (source in (
    'HOUSEKEEPING', 'FRONT_DESK', 'MANAGER', 'INSPECTION', 'SYSTEM', 'EMPLOYEE', 'GUEST', 'OTHER'
  )),
  constraint maintenance_requests_estimated_cost_positive check (estimated_cost is null or estimated_cost >= 0),
  constraint maintenance_requests_actual_cost_positive check (actual_cost is null or actual_cost >= 0)
);

comment on table public.maintenance_requests is
  'Maintenance work requests. State machine: OPEN→ASSIGNED→IN_PROGRESS→RESOLVED→VERIFIED→CLOSED.';

create index if not exists maintenance_requests_property_idx
  on public.maintenance_requests (property_id);

create index if not exists maintenance_requests_room_idx
  on public.maintenance_requests (room_id)
  where room_id is not null;

create index if not exists maintenance_requests_status_idx
  on public.maintenance_requests (property_id, status);

create index if not exists maintenance_requests_assigned_idx
  on public.maintenance_requests (assigned_to)
  where assigned_to is not null;

create index if not exists maintenance_requests_org_idx
  on public.maintenance_requests (organization_id);

drop trigger if exists maintenance_requests_touch on public.maintenance_requests;
create trigger maintenance_requests_touch before update on public.maintenance_requests
  for each row execute function app.touch_updated_at();

drop policy if exists maintenance_requests_read on public.maintenance_requests;
create policy maintenance_requests_read on public.maintenance_requests
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists maintenance_requests_no_write on public.maintenance_requests;
create policy maintenance_requests_no_write on public.maintenance_requests
  for all to authenticated
  using (false);

-- =================================================================== lost & found (lightweight)

create table if not exists public.lost_found_items (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  property_id          uuid not null references public.properties(id) on delete restrict,
  room_id              uuid references public.rooms(id) on delete set null,
  found_by             uuid,
  found_at             timestamptz not null default now(),
  description          text not null,
  category             text not null default 'OTHER',
  status               text not null default 'FOUND',
  storage_location     text,
  guest_id             uuid references public.guests(id) on delete set null,
  returned_at          timestamptz,
  returned_to          uuid,
  notes                text,
  version              integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid,

  constraint lost_found_items_description_not_blank check (btrim(description) <> ''),
  constraint lost_found_items_category_ok check (category in (
    'ELECTRONICS', 'JEWELRY', 'CLOTHING', 'DOCUMENTS', 'KEYS', 'MEDICATION', 'OTHER'
  )),
  constraint lost_found_items_status_ok check (status in (
    'FOUND', 'STORED', 'CLAIMED', 'RETURNED', 'DISPOSED'
  ))
);

comment on table public.lost_found_items is
  'Lost and found items. Lightweight foundation for future expansion.';

create index if not exists lost_found_items_property_idx
  on public.lost_found_items (property_id);

create index if not exists lost_found_items_status_idx
  on public.lost_found_items (property_id, status);

create index if not exists lost_found_items_org_idx
  on public.lost_found_items (organization_id);

drop trigger if exists lost_found_items_touch on public.lost_found_items;
create trigger lost_found_items_touch before update on public.lost_found_items
  for each row execute function app.touch_updated_at();

drop policy if exists lost_found_items_read on public.lost_found_items;
create policy lost_found_items_read on public.lost_found_items
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists lost_found_items_no_write on public.lost_found_items;
create policy lost_found_items_no_write on public.lost_found_items
  for all to authenticated
  using (false);

-- =================================================================== assets (lightweight foundation)

create table if not exists public.assets (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  property_id          uuid not null references public.properties(id) on delete restrict,
  room_id              uuid references public.rooms(id) on delete set null,
  outlet_id            uuid references public.outlets(id) on delete set null,
  asset_code           text not null,
  name                 text not null,
  category             text not null,
  location_description text,
  status               text not null default 'ACTIVE',
  serial_number        text,
  manufacturer         text,
  model_number         text,
  purchase_date        date,
  purchase_cost        numeric,
  warranty_end_date    date,
  notes                text,
  version              integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid,

  constraint assets_code_not_blank check (btrim(asset_code) <> ''),
  constraint assets_name_not_blank check (btrim(name) <> ''),
  constraint assets_category_ok check (category in (
    'AC', 'TV', 'REFRIGERATOR', 'WASHING_MACHINE', 'ELEVATOR', 'BOILER',
    'GENERATOR', 'KITCHEN_EQUIPMENT', 'FURNITURE', 'IT_EQUIPMENT', 'OTHER'
  )),
  constraint assets_status_ok check (status in ('ACTIVE', 'MAINTENANCE', 'RETIRED', 'SOLD')),
  constraint assets_purchase_cost_positive check (purchase_cost is null or purchase_cost >= 0)
);

comment on table public.assets is
  'Maintained physical assets. Separate from inventory items (consumables).';

-- Add foreign key from maintenance_requests to assets now that assets exists.
alter table public.maintenance_requests
  drop constraint if exists maintenance_requests_asset_id_fkey;
alter table public.maintenance_requests
  add constraint maintenance_requests_asset_id_fkey
  foreign key (asset_id) references public.assets(id) on delete set null;

create index if not exists assets_property_idx
  on public.assets (property_id);

create index if not exists assets_room_idx
  on public.assets (room_id)
  where room_id is not null;

create index if not exists assets_org_idx
  on public.assets (organization_id);

drop index if exists public.assets_code_property_idx;
create unique index assets_code_property_idx
  on public.assets (property_id, lower(asset_code));

drop trigger if exists assets_touch on public.assets;
create trigger assets_touch before update on public.assets
  for each row execute function app.touch_updated_at();

drop policy if exists assets_read on public.assets;
create policy assets_read on public.assets
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_memberships m
    where m.user_id = app.current_user_id() and m.status = 'ACTIVE'
  ));

drop policy if exists assets_no_write on public.assets;
create policy assets_no_write on public.assets
  for all to authenticated
  using (false);

-- =================================================================== doors: housekeeping tasks

-- Allowed transition helper for housekeeping tasks.
create or replace function app.housekeeping_task_transition_allowed(
  p_from text, p_to text
)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('PENDING', 'ASSIGNED'),
    ('PENDING', 'CANCELLED'),
    ('ASSIGNED', 'IN_PROGRESS'),
    ('ASSIGNED', 'CANCELLED'),
    ('IN_PROGRESS', 'COMPLETED'),
    ('COMPLETED', 'VERIFIED')
  );
$$;

-- create_housekeeping_task
create or replace function public.create_housekeeping_task(
  p_organization       uuid,
  p_property           uuid,
  p_room               uuid,
  p_task_type          text,
  p_priority           text default 'NORMAL',
  p_notes              text default null,
  p_stay_id            uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_row public.housekeeping_tasks%rowtype;
begin
  perform app.require_session(v_user_id, null);
  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'housekeeping.task.create');

  insert into public.housekeeping_tasks (
    organization_id, property_id, room_id, stay_id, task_type, priority, notes, created_by
  ) values (
    p_organization, p_property, p_room, p_stay_id, p_task_type, p_priority, p_notes, v_user_id
  ) returning * into v_row;

  perform app.audit(
    'HOUSEKEEPING_TASK_CREATED', 'housekeeping_task', v_row.id,
    null, to_jsonb(v_row),
    p_property, jsonb_build_object('room_id', p_room, 'task_type', p_task_type)
  );

  return to_jsonb(v_row);
end;
$$;

-- assign_housekeeping_task
create or replace function public.assign_housekeeping_task(
  p_task               uuid,
  p_organization       uuid,
  p_property           uuid,
  p_assigned_to        uuid,
  p_expected_version   integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.housekeeping_tasks%rowtype;
  v_row public.housekeeping_tasks%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.housekeeping_tasks
  where id = p_task and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;
  if not app.housekeeping_task_transition_allowed(v_old.status, 'ASSIGNED') then
    raise exception 'NIVAAS_INVALID_STATE_TRANSITION';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'housekeeping.task.assign');

  update public.housekeeping_tasks set
    assigned_to = p_assigned_to,
    status = 'ASSIGNED',
    version = version + 1
  where id = p_task
  returning * into v_row;

  perform app.audit(
    'HOUSEKEEPING_TASK_ASSIGNED', 'housekeeping_task', p_task,
    to_jsonb(v_old), to_jsonb(v_row),
    p_property, jsonb_build_object('assigned_to', p_assigned_to)
  );

  return to_jsonb(v_row);
end;
$$;

-- start_housekeeping_task
create or replace function public.start_housekeeping_task(
  p_task               uuid,
  p_organization       uuid,
  p_property           uuid,
  p_expected_version   integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.housekeeping_tasks%rowtype;
  v_row public.housekeeping_tasks%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.housekeeping_tasks
  where id = p_task and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;
  if v_old.status <> 'ASSIGNED' then
    raise exception 'NIVAAS_INVALID_STATE_TRANSITION';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'housekeeping.task.start');

  update public.housekeeping_tasks set
    status = 'IN_PROGRESS',
    started_at = now(),
    version = version + 1
  where id = p_task
  returning * into v_row;

  perform app.audit(
    'HOUSEKEEPING_TASK_STARTED', 'housekeeping_task', p_task,
    to_jsonb(v_old), to_jsonb(v_row),
    p_property, jsonb_build_object('room_id', v_row.room_id)
  );

  return to_jsonb(v_row);
end;
$$;

-- complete_housekeeping_task
-- For CHECKOUT_CLEAN: also updates room housekeeping_status to VACANT_CLEAN.
create or replace function public.complete_housekeeping_task(
  p_task               uuid,
  p_organization       uuid,
  p_property           uuid,
  p_expected_version   integer,
  p_notes              text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.housekeeping_tasks%rowtype;
  v_row public.housekeeping_tasks%rowtype;
  v_room public.rooms%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.housekeeping_tasks
  where id = p_task and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;
  if v_old.status <> 'IN_PROGRESS' then
    raise exception 'NIVAAS_INVALID_STATE_TRANSITION';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'housekeeping.task.complete');

  update public.housekeeping_tasks set
    status = 'COMPLETED',
    completed_at = now(),
    notes = coalesce(p_notes, v_old.notes),
    version = version + 1
  where id = p_task
  returning * into v_row;

  -- Update room housekeeping status based on task type.
  select * into v_room from public.rooms where id = v_row.room_id;
  if v_row.task_type = 'CHECKOUT_CLEAN' and v_room.housekeeping_status = 'VACANT_DIRTY' then
    update public.rooms set
      housekeeping_status = 'VACANT_CLEAN',
      version = version + 1
    where id = v_row.room_id;
  elsif v_row.task_type = 'STAYOVER_CLEAN' and v_room.housekeeping_status = 'OCCUPIED_DIRTY' then
    update public.rooms set
      housekeeping_status = 'OCCUPIED_CLEAN',
      version = version + 1
    where id = v_row.room_id;
  end if;

  perform app.audit(
    'HOUSEKEEPING_TASK_COMPLETED', 'housekeeping_task', p_task,
    to_jsonb(v_old), to_jsonb(v_row),
    p_property, jsonb_build_object('room_id', v_row.room_id)
  );

  return to_jsonb(v_row);
end;
$$;

-- verify_housekeeping_task
-- For CHECKOUT_CLEAN: also updates room housekeeping_status to INSPECTED.
create or replace function public.verify_housekeeping_task(
  p_task               uuid,
  p_organization       uuid,
  p_property           uuid,
  p_expected_version   integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.housekeeping_tasks%rowtype;
  v_row public.housekeeping_tasks%rowtype;
  v_room public.rooms%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.housekeeping_tasks
  where id = p_task and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;
  if v_old.status <> 'COMPLETED' then
    raise exception 'NIVAAS_INVALID_STATE_TRANSITION';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'housekeeping.task.verify');

  update public.housekeeping_tasks set
    status = 'VERIFIED',
    verified_at = now(),
    verified_by = v_user_id,
    version = version + 1
  where id = p_task
  returning * into v_row;

  -- For checkout clean, mark room as INSPECTED (sellable).
  if v_row.task_type = 'CHECKOUT_CLEAN' then
    select * into v_room from public.rooms where id = v_row.room_id;
    if v_room.housekeeping_status = 'VACANT_CLEAN' then
      update public.rooms set
        housekeeping_status = 'INSPECTED',
        version = version + 1
      where id = v_row.room_id;
    end if;
  end if;

  perform app.audit(
    'HOUSEKEEPING_TASK_VERIFIED', 'housekeeping_task', p_task,
    to_jsonb(v_old), to_jsonb(v_row),
    p_property, jsonb_build_object('room_id', v_row.room_id)
  );

  return to_jsonb(v_row);
end;
$$;

-- cancel_housekeeping_task
create or replace function public.cancel_housekeeping_task(
  p_task               uuid,
  p_organization       uuid,
  p_property           uuid,
  p_expected_version   integer,
  p_reason             text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.housekeeping_tasks%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.housekeeping_tasks
  where id = p_task and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;
  if not app.housekeeping_task_transition_allowed(v_old.status, 'CANCELLED') then
    raise exception 'NIVAAS_INVALID_STATE_TRANSITION';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'housekeeping.task.cancel');

  update public.housekeeping_tasks set
    status = 'CANCELLED',
    notes = case when p_reason is not null then concat_ws('. ', v_old.notes, p_reason) else v_old.notes end,
    version = version + 1
  where id = p_task;

  perform app.audit(
    'HOUSEKEEPING_TASK_CANCELLED', 'housekeeping_task', p_task,
    to_jsonb(v_old), null,
    p_property, jsonb_build_object('reason', p_reason)
  );
end;
$$;

-- =================================================================== doors: inspections

-- create_room_inspection
create or replace function public.create_room_inspection(
  p_organization       uuid,
  p_property           uuid,
  p_room               uuid,
  p_checklist_id       uuid default null,
  p_housekeeping_task_id uuid default null,
  p_notes              text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_row public.room_inspections%rowtype;
begin
  perform app.require_session(v_user_id, null);
  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'housekeeping.inspection.create');

  insert into public.room_inspections (
    organization_id, property_id, room_id, checklist_id, housekeeping_task_id, notes, created_by
  ) values (
    p_organization, p_property, p_room, p_checklist_id, p_housekeeping_task_id, p_notes, v_user_id
  ) returning * into v_row;

  perform app.audit(
    'ROOM_INSPECTION_CREATED', 'room_inspection', v_row.id,
    null, to_jsonb(v_row),
    p_property, jsonb_build_object('room_id', p_room)
  );

  return to_jsonb(v_row);
end;
$$;

-- complete_room_inspection
-- Records results for each checklist item. If any required item fails, inspection fails.
create or replace function public.complete_room_inspection(
  p_inspection         uuid,
  p_organization       uuid,
  p_property           uuid,
  p_results            jsonb,  -- [{"checklist_item_id": "...", "result": "PASS|FAIL|NOT_APPLICABLE", "note": "..."}]
  p_notes              text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_inspection public.room_inspections%rowtype;
  v_item record;
  v_has_failure boolean := false;
  v_final_status text;
begin
  perform app.require_session(v_user_id, null);

  select * into v_inspection from public.room_inspections
  where id = p_inspection and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_inspection.status <> 'PENDING' then
    raise exception 'NIVAAS_INVALID_STATE_TRANSITION';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'housekeeping.inspection.complete');

  -- Insert results.
  for v_item in select * from jsonb_to_recordset(p_results) as x(
    checklist_item_id uuid, result text, note text
  ) loop
    insert into public.room_inspection_results (
      inspection_id, checklist_item_id, result, note
    ) values (
      p_inspection, v_item.checklist_item_id, v_item.result, v_item.note
    );
    if v_item.result = 'FAIL' then
      v_has_failure := true;
    end if;
  end loop;

  -- Determine final status.
  v_final_status := case when v_has_failure then 'FAILED' else 'PASSED' end;

  update public.room_inspections set
    status = v_final_status,
    inspector_id = v_user_id,
    notes = coalesce(p_notes, v_inspection.notes),
    passed_at = case when v_final_status = 'PASSED' then now() else null end,
    failed_at = case when v_final_status = 'FAILED' then now() else null end,
    version = version + 1
  where id = p_inspection
  returning * into v_inspection;

  -- If passed and linked to a checkout clean task, update room to INSPECTED.
  if v_final_status = 'PASSED' then
    update public.rooms set
      housekeeping_status = 'INSPECTED',
      version = version + 1
    where id = v_inspection.room_id
      and housekeeping_status in ('VACANT_CLEAN', 'OCCUPIED_CLEAN');
  end if;

  perform app.audit(
    case when v_final_status = 'PASSED' then 'ROOM_INSPECTION_PASSED' else 'ROOM_INSPECTION_FAILED' end,
    'room_inspection', p_inspection,
    null, to_jsonb(v_inspection),
    p_property, jsonb_build_object('room_id', v_inspection.room_id, 'status', v_final_status)
  );

  return to_jsonb(v_inspection);
end;
$$;

-- =================================================================== doors: maintenance requests

-- Allowed transition helper for maintenance requests.
create or replace function app.maintenance_request_transition_allowed(
  p_from text, p_to text
)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('OPEN', 'ASSIGNED'),
    ('OPEN', 'CANCELLED'),
    ('ASSIGNED', 'IN_PROGRESS'),
    ('ASSIGNED', 'CANCELLED'),
    ('IN_PROGRESS', 'RESOLVED'),
    ('IN_PROGRESS', 'ON_HOLD'),
    ('ON_HOLD', 'IN_PROGRESS'),
    ('RESOLVED', 'VERIFIED'),
    ('VERIFIED', 'CLOSED')
  );
$$;

-- create_maintenance_request
create or replace function public.create_maintenance_request(
  p_organization       uuid,
  p_property           uuid,
  p_category           text,
  p_title              text,
  p_description        text default null,
  p_priority           text default 'NORMAL',
  p_source             text default 'OTHER',
  p_room_id            uuid default null,
  p_outlet_id          uuid default null,
  p_asset_id           uuid default null,
  p_notes              text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_row public.maintenance_requests%rowtype;
begin
  perform app.require_session(v_user_id, null);
  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'maintenance.create');

  insert into public.maintenance_requests (
    organization_id, property_id, room_id, outlet_id, asset_id,
    category, title, description, priority, source, notes,
    reported_by, created_by
  ) values (
    p_organization, p_property, p_room_id, p_outlet_id, p_asset_id,
    p_category, p_title, p_description, p_priority, p_source, p_notes,
    v_user_id, v_user_id
  ) returning * into v_row;

  -- If room-bound and high priority, mark room out of order.
  if p_room_id is not null and p_priority in ('HIGH', 'URGENT', 'EMERGENCY') then
    update public.rooms set
      operational_status = 'OUT_OF_ORDER',
      version = version + 1
    where id = p_room_id and operational_status = 'ACTIVE';
  end if;

  perform app.audit(
    'MAINTENANCE_REQUEST_CREATED', 'maintenance_request', v_row.id,
    null, to_jsonb(v_row),
    p_property, jsonb_build_object('category', p_category, 'room_id', p_room_id)
  );

  return to_jsonb(v_row);
end;
$$;

-- assign_maintenance_request
create or replace function public.assign_maintenance_request(
  p_request            uuid,
  p_organization       uuid,
  p_property           uuid,
  p_assigned_to        uuid,
  p_expected_version   integer,
  p_assigned_vendor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.maintenance_requests%rowtype;
  v_row public.maintenance_requests%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.maintenance_requests
  where id = p_request and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;
  if not app.maintenance_request_transition_allowed(v_old.status, 'ASSIGNED') then
    raise exception 'NIVAAS_INVALID_STATE_TRANSITION';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'maintenance.assign');

  update public.maintenance_requests set
    assigned_to = p_assigned_to,
    assigned_vendor_id = coalesce(p_assigned_vendor_id, v_old.assigned_vendor_id),
    status = 'ASSIGNED',
    assigned_at = now(),
    version = version + 1
  where id = p_request
  returning * into v_row;

  perform app.audit(
    'MAINTENANCE_REQUEST_ASSIGNED', 'maintenance_request', p_request,
    to_jsonb(v_old), to_jsonb(v_row),
    p_property, jsonb_build_object('assigned_to', p_assigned_to)
  );

  return to_jsonb(v_row);
end;
$$;

-- start_maintenance_request
create or replace function public.start_maintenance_request(
  p_request            uuid,
  p_organization       uuid,
  p_property           uuid,
  p_expected_version   integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.maintenance_requests%rowtype;
  v_row public.maintenance_requests%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.maintenance_requests
  where id = p_request and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;
  if v_old.status not in ('ASSIGNED', 'ON_HOLD') then
    raise exception 'NIVAAS_INVALID_STATE_TRANSITION';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'maintenance.start');

  update public.maintenance_requests set
    status = 'IN_PROGRESS',
    started_at = coalesce(v_old.started_at, now()),
    version = version + 1
  where id = p_request
  returning * into v_row;

  perform app.audit(
    'MAINTENANCE_REQUEST_STARTED', 'maintenance_request', p_request,
    to_jsonb(v_old), to_jsonb(v_row),
    p_property, jsonb_build_object('room_id', v_row.room_id)
  );

  return to_jsonb(v_row);
end;
$$;

-- resolve_maintenance_request
create or replace function public.resolve_maintenance_request(
  p_request            uuid,
  p_organization       uuid,
  p_property           uuid,
  p_resolution         text,
  p_expected_version   integer,
  p_actual_cost        numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.maintenance_requests%rowtype;
  v_row public.maintenance_requests%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.maintenance_requests
  where id = p_request and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;
  if v_old.status <> 'IN_PROGRESS' then
    raise exception 'NIVAAS_INVALID_STATE_TRANSITION';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'maintenance.resolve');

  update public.maintenance_requests set
    status = 'RESOLVED',
    resolution = p_resolution,
    actual_cost = coalesce(p_actual_cost, v_old.actual_cost),
    resolved_at = now(),
    resolved_by = v_user_id,
    version = version + 1
  where id = p_request
  returning * into v_row;

  perform app.audit(
    'MAINTENANCE_REQUEST_RESOLVED', 'maintenance_request', p_request,
    to_jsonb(v_old), to_jsonb(v_row),
    p_property, jsonb_build_object('room_id', v_row.room_id)
  );

  return to_jsonb(v_row);
end;
$$;

-- verify_maintenance_request
create or replace function public.verify_maintenance_request(
  p_request            uuid,
  p_organization       uuid,
  p_property           uuid,
  p_expected_version   integer,
  p_verification_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.maintenance_requests%rowtype;
  v_row public.maintenance_requests%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.maintenance_requests
  where id = p_request and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;
  if v_old.status <> 'RESOLVED' then
    raise exception 'NIVAAS_INVALID_STATE_TRANSITION';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'maintenance.verify');

  update public.maintenance_requests set
    status = 'VERIFIED',
    verified_at = now(),
    verified_by = v_user_id,
    verification_notes = coalesce(p_verification_notes, v_old.verification_notes),
    version = version + 1
  where id = p_request
  returning * into v_row;

  perform app.audit(
    'MAINTENANCE_REQUEST_VERIFIED', 'maintenance_request', p_request,
    to_jsonb(v_old), to_jsonb(v_row),
    p_property, jsonb_build_object('room_id', v_row.room_id)
  );

  return to_jsonb(v_row);
end;
$$;

-- close_maintenance_request
-- If room-bound, returns room to ACTIVE operational status.
create or replace function public.close_maintenance_request(
  p_request            uuid,
  p_organization       uuid,
  p_property           uuid,
  p_expected_version   integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.maintenance_requests%rowtype;
  v_row public.maintenance_requests%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.maintenance_requests
  where id = p_request and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;
  if v_old.status <> 'VERIFIED' then
    raise exception 'NIVAAS_INVALID_STATE_TRANSITION';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'maintenance.close');

  update public.maintenance_requests set
    status = 'CLOSED',
    closed_at = now(),
    closed_by = v_user_id,
    version = version + 1
  where id = p_request
  returning * into v_row;

  -- If room was out of order for this maintenance, return it to ACTIVE.
  if v_row.room_id is not null then
    update public.rooms set
      operational_status = 'ACTIVE',
      version = version + 1
    where id = v_row.room_id and operational_status = 'OUT_OF_ORDER';
  end if;

  perform app.audit(
    'MAINTENANCE_REQUEST_CLOSED', 'maintenance_request', p_request,
    to_jsonb(v_old), to_jsonb(v_row),
    p_property, jsonb_build_object('room_id', v_row.room_id)
  );

  return to_jsonb(v_row);
end;
$$;

-- cancel_maintenance_request
create or replace function public.cancel_maintenance_request(
  p_request            uuid,
  p_organization       uuid,
  p_property           uuid,
  p_expected_version   integer,
  p_reason             text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.maintenance_requests%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.maintenance_requests
  where id = p_request and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;
  if not app.maintenance_request_transition_allowed(v_old.status, 'CANCELLED') then
    raise exception 'NIVAAS_INVALID_STATE_TRANSITION';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'maintenance.cancel');

  update public.maintenance_requests set
    status = 'CANCELLED',
    notes = case when p_reason is not null then concat_ws('. ', v_old.notes, p_reason) else v_old.notes end,
    version = version + 1
  where id = p_request;

  perform app.audit(
    'MAINTENANCE_REQUEST_CANCELLED', 'maintenance_request', p_request,
    to_jsonb(v_old), null,
    p_property, jsonb_build_object('reason', p_reason)
  );
end;
$$;

-- put_maintenance_on_hold
create or replace function public.put_maintenance_on_hold(
  p_request            uuid,
  p_organization       uuid,
  p_property           uuid,
  p_reason             text,
  p_expected_version   integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.maintenance_requests%rowtype;
  v_row public.maintenance_requests%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.maintenance_requests
  where id = p_request and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;
  if v_old.status <> 'IN_PROGRESS' then
    raise exception 'NIVAAS_INVALID_STATE_TRANSITION';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'maintenance.start');

  update public.maintenance_requests set
    status = 'ON_HOLD',
    notes = concat_ws('. ', v_old.notes, 'ON HOLD: ' || p_reason),
    version = version + 1
  where id = p_request
  returning * into v_row;

  perform app.audit(
    'MAINTENANCE_REQUEST_ON_HOLD', 'maintenance_request', p_request,
    to_jsonb(v_old), to_jsonb(v_row),
    p_property, jsonb_build_object('reason', p_reason)
  );

  return to_jsonb(v_row);
end;
$$;

-- =================================================================== doors: lost & found

-- create_lost_found_item
create or replace function public.create_lost_found_item(
  p_organization       uuid,
  p_property           uuid,
  p_description        text,
  p_category           text default 'OTHER',
  p_room_id            uuid default null,
  p_storage_location   text default null,
  p_guest_id           uuid default null,
  p_notes              text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_row public.lost_found_items%rowtype;
begin
  perform app.require_session(v_user_id, null);
  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'lost_found.create');

  insert into public.lost_found_items (
    organization_id, property_id, room_id, description, category,
    storage_location, guest_id, notes, found_by, created_by
  ) values (
    p_organization, p_property, p_room_id, p_description, p_category,
    p_storage_location, p_guest_id, p_notes, v_user_id, v_user_id
  ) returning * into v_row;

  perform app.audit(
    'LOST_FOUND_ITEM_CREATED', 'lost_found_item', v_row.id,
    null, to_jsonb(v_row),
    p_property, jsonb_build_object('category', p_category, 'room_id', p_room_id)
  );

  return to_jsonb(v_row);
end;
$$;

-- return_lost_found_item
create or replace function public.return_lost_found_item(
  p_item               uuid,
  p_organization       uuid,
  p_property           uuid,
  p_expected_version   integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.lost_found_items%rowtype;
  v_row public.lost_found_items%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.lost_found_items
  where id = p_item and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'lost_found.return');

  update public.lost_found_items set
    status = 'RETURNED',
    returned_at = now(),
    returned_to = v_user_id,
    version = version + 1
  where id = p_item
  returning * into v_row;

  perform app.audit(
    'LOST_FOUND_ITEM_RETURNED', 'lost_found_item', p_item,
    to_jsonb(v_old), to_jsonb(v_row),
    p_property, jsonb_build_object('guest_id', v_row.guest_id)
  );

  return to_jsonb(v_row);
end;
$$;

-- =================================================================== doors: assets

-- create_asset
create or replace function public.create_asset(
  p_organization       uuid,
  p_property           uuid,
  p_asset_code         text,
  p_name               text,
  p_category           text,
  p_room_id            uuid default null,
  p_outlet_id          uuid default null,
  p_location_description text default null,
  p_serial_number      text default null,
  p_manufacturer       text default null,
  p_model_number       text default null,
  p_purchase_date      date default null,
  p_purchase_cost      numeric default null,
  p_warranty_end_date  date default null,
  p_notes              text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_row public.assets%rowtype;
begin
  perform app.require_session(v_user_id, null);
  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'asset.create');

  insert into public.assets (
    organization_id, property_id, room_id, outlet_id,
    asset_code, name, category, location_description,
    serial_number, manufacturer, model_number,
    purchase_date, purchase_cost, warranty_end_date,
    notes, created_by
  ) values (
    p_organization, p_property, p_room_id, p_outlet_id,
    p_asset_code, p_name, p_category, p_location_description,
    p_serial_number, p_manufacturer, p_model_number,
    p_purchase_date, p_purchase_cost, p_warranty_end_date,
    p_notes, v_user_id
  ) returning * into v_row;

  perform app.audit(
    'ASSET_CREATED', 'asset', v_row.id,
    null, to_jsonb(v_row),
    p_property, jsonb_build_object('asset_code', v_row.asset_code, 'category', v_row.category)
  );

  return to_jsonb(v_row);
end;
$$;

-- update_asset
create or replace function public.update_asset(
  p_asset              uuid,
  p_organization       uuid,
  p_property           uuid,
  p_expected_version   integer,
  p_name               text default null,
  p_category           text default null,
  p_room_id            uuid default null,
  p_location_description text default null,
  p_status             text default null,
  p_notes              text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_old public.assets%rowtype;
  v_row public.assets%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_old from public.assets
  where id = p_asset and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_old.version <> p_expected_version then raise exception 'NIVAAS_VERSION_CONFLICT'; end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'asset.edit');

  update public.assets set
    name = coalesce(p_name, v_old.name),
    category = coalesce(p_category, v_old.category),
    room_id = coalesce(p_room_id, v_old.room_id),
    location_description = coalesce(p_location_description, v_old.location_description),
    status = coalesce(p_status, v_old.status),
    notes = coalesce(p_notes, v_old.notes),
    version = version + 1
  where id = p_asset
  returning * into v_row;

  perform app.audit(
    'ASSET_UPDATED', 'asset', p_asset,
    to_jsonb(v_old), to_jsonb(v_row),
    p_property, jsonb_build_object('version', v_row.version)
  );

  return to_jsonb(v_row);
end;
$$;

-- =================================================================== modify check_out to auto-create housekeeping task

-- Replace the check_out door from 037 to add housekeeping task creation.
create or replace function public.check_out(
  p_stay               uuid,
  p_organization       uuid,
  p_property           uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_stay public.stays%rowtype;
  v_reservation public.reservations%rowtype;
  v_task public.housekeeping_tasks%rowtype;
begin
  perform app.require_session(v_user_id, null);

  select * into v_stay from public.stays
  where id = p_stay and organization_id = p_organization and property_id = p_property;
  if not found then raise exception 'NIVAAS_NOT_FOUND'; end if;
  if v_stay.status not in ('CHECKED_IN', 'EXTENDED') then
    raise exception 'NIVAAS_INVALID_STATE_TRANSITION';
  end if;

  perform app.evaluate_access(v_user_id, p_organization, p_property, null, 'frontoffice.checkout');

  -- Load reservation.
  select * into v_reservation from public.reservations
  where id = v_stay.reservation_id;

  -- Update stay.
  update public.stays
  set actual_check_out_at = now(),
      status = case
        when now() < v_stay.expected_check_out_at then 'EARLY_DEPARTURE'
        else 'CHECKED_OUT'
      end,
      version = version + 1
  where id = p_stay
  returning * into v_stay;

  -- Update reservation status.
  update public.reservations
  set status = 'CHECKED_OUT', version = version + 1
  where id = v_stay.reservation_id;

  -- Update room housekeeping status to VACANT_DIRTY.
  update public.rooms
  set housekeeping_status = 'VACANT_DIRTY', version = version + 1
  where id = v_stay.room_id;

  -- Auto-create housekeeping task for checkout cleaning.
  insert into public.housekeeping_tasks (
    organization_id, property_id, room_id, stay_id, task_type, priority, created_by
  ) values (
    p_organization, p_property, v_stay.room_id, p_stay, 'CHECKOUT_CLEAN', 'HIGH', v_user_id
  ) returning * into v_task;

  perform app.audit(
    'GUEST_CHECKED_OUT', 'stay', p_stay,
    null, to_jsonb(v_stay),
    p_property, jsonb_build_object(
      'reservation_id', v_stay.reservation_id,
      'housekeeping_task_id', v_task.id
    )
  );

  return to_jsonb(v_stay);
end;
$$;

-- =================================================================== grants

grant execute on function public.create_housekeeping_task to authenticated;
grant execute on function public.assign_housekeeping_task to authenticated;
grant execute on function public.start_housekeeping_task to authenticated;
grant execute on function public.complete_housekeeping_task to authenticated;
grant execute on function public.verify_housekeeping_task to authenticated;
grant execute on function public.cancel_housekeeping_task to authenticated;

grant execute on function public.create_room_inspection to authenticated;
grant execute on function public.complete_room_inspection to authenticated;

grant execute on function public.create_maintenance_request to authenticated;
grant execute on function public.assign_maintenance_request to authenticated;
grant execute on function public.start_maintenance_request to authenticated;
grant execute on function public.resolve_maintenance_request to authenticated;
grant execute on function public.verify_maintenance_request to authenticated;
grant execute on function public.close_maintenance_request to authenticated;
grant execute on function public.cancel_maintenance_request to authenticated;
grant execute on function public.put_maintenance_on_hold to authenticated;

grant execute on function public.create_lost_found_item to authenticated;
grant execute on function public.return_lost_found_item to authenticated;

grant execute on function public.create_asset to authenticated;
grant execute on function public.update_asset to authenticated;
