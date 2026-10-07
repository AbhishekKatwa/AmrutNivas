-- AMRUT NIVAAS · 015 — the restaurant floor: dining areas and tables (Prompt #04 §18-§22)
--
-- One level of grouping, then the covers themselves. A restaurant is an outlet (contract §12),
-- an outlet holds DINING AREAS — Main Hall, Outdoor, Rooftop, AC Section, Private Dining — and
-- an area holds TABLES with a capacity, a code and a spot on the floor map. §19 asks for a
-- single `DiningArea` concept "rather than overcomplicating it into a generic floor-management
-- system", so there is exactly ONE parent level here: no `floors` table, no floor/area tree, no
-- generic hierarchy node. Restaurant → Area → Table is the whole depth of the model.
--
-- What this file prevents, in the donor project's own failure words:
--
--   * A generic floor-management system. §19 named the concept and the field list; a second
--     "floor" tier above the area would have produced two parent ids, two orderings and two
--     archive rules for a restaurant that has one floor and several sections. So areas hang
--     directly off the outlet, and the only tree in this file is two levels deep.
--   * A manually editable OCCUPIED. §20 wants table status DERIVED from live orders and
--     reservations "rather than becoming an uncontrolled manually edited status", and says
--     plainly: "Do not allow arbitrary status corruption." A comment cannot hold that line,
--     so the vocabulary cannot either: `service_status` is CHECKed to
--     ('AVAILABLE','CLEANING','OUT_OF_SERVICE') — the three facts a person genuinely knows —
--     and OCCUPIED and RESERVED are structurally absent. There is no string a client can
--     send, and no column a screen can write, that puts a table into "occupied".
--   * Lifecycle entangled with the operational fact. `status` (ACTIVE/ARCHIVED) and
--     `service_status` are separate columns with separate doors, exactly as 014 keeps a menu
--     item's `status` separate from its `is_available`. Retiring a cover is not the same
--     statement as "the cleaners are on it".
--   * A trusted client scope. Every denormalized ancestor (organization_id / property_id /
--     outlet_id) is derived from the parent row inside the door — from the OUTLET for an area,
--     from the AREA for a table — never taken from an argument, and re-proved row-level by
--     app.assert_dining_chain(). A table whose own outlet_id disagreed with its area's outlet
--     is refused there, which is also what makes a cross-outlet "move" impossible rather than
--     merely discouraged.
--   * An area archived out from under live tables. `restaurant_tables.area_id` is
--     `on delete restrict` and `archive_dining_area` refuses while any live table still sits
--     in the area (NIVAAS_AREA_NOT_EMPTY). Nothing here ever DELETEs a row: §78 of #04 is that
--     history must be able to name the cover an order was served on.
--   * A table code collision inside one outlet. `code` is the handle an order, a KOT and a
--     bill all print, so it is unique across the OUTLET (a partial unique index over live
--     rows), while `name` is unique only inside its AREA — two sections may both have a
--     "Table 1", and no outlet may have two T01.
--   * Non-deterministic floor-map order. §21's map is a picture an operator arranges, so live
--     areas carry a unique display_order per outlet and live tables a unique display_order
--     per area, and the only way to resequence either is a full-permutation reorder door: an
--     incomplete, duplicated or foreign list is refused (NIVAAS_INVALID_PERMUTATION), never
--     silently patched.
--
-- Scope cut, stated rather than hidden: this file is the FLOOR ONLY — §18-§22. The table map
-- screen (§21) and its label/icon/state treatment (§22, never colour alone) are the later UI
-- item #38; what this file owes that screen is stable ordering and drawable geometry
-- (`display_order`, `position_x`, `position_y`, `shape`), and it owes it nothing else. There
-- is no read door here: the floor map reads `dining_areas` and `restaurant_tables` directly
-- under the outlet SELECT policies below, the same way the admin screens read the hierarchy.
-- No Inventory, recipes, procurement, tax engine, CRM, PMS, banquet, KDS or online ordering —
-- #04 §12 forbids inventing scope and this file agrees with it.

-- ============================================================================ extension
--
-- DERIVED TABLE STATUS — where 016 and Prompt #08 plug in. Read this before adding a column.
--
-- §20's operational states are AVAILABLE, OCCUPIED, RESERVED, CLEANING, OUT_OF_SERVICE. Two
-- of them are not facts a person holds; they are facts about rows that do not exist yet:
-- OCCUPIED belongs to an order (016) and RESERVED belongs to a reservation (Prompt #08). A
-- STORED generated column cannot reference another table, so a derived `status` written here
-- would be a fake that 016 has to break. It is therefore not written.
--
--   * `service_status` below holds ONLY the manual states, and a CHECK enforces it.
--   * 016 will resolve the operational status a screen shows as
--       OUT_OF_SERVICE > CLEANING > OCCUPIED > RESERVED > AVAILABLE
--     i.e. `service_status` overridden by a live order (OCCUPIED) and, in #08, by a live
--     reservation (RESERVED). The precedence puts a human's "this cover is broken" above any
--     inference, because the person is the one who can be wrong about nothing here.
--   * The read-side resolution (a view or a door over both tables) arrives WITH 016, in the
--     migration that can actually see an order. It is deliberately NOT created now: a view
--     that joins a table which does not exist fails at CREATE, and a door that promises
--     OCCUPIED without an order table is the same lie in a different costume.
--   * Two known hooks: `archive_restaurant_table` refuses a non-AVAILABLE cover and comments
--     where 016's live-order check joins it, and no door here needs to change for the
--     precedence rule to land.

-- The row-level twin of app.assert_menu_chain(): each floor table's denormalized
-- (organization_id, property_id, outlet_id) must equal its parent's, and the parent must
-- itself be inside the scope it claims. Without this, a client-crafted ancestor id could leak
-- a table into another tenant — the invariant that makes the RLS predicate below sound.
--
-- It is defined BEFORE the tables that attach it as a trigger: CREATE TRIGGER ... EXECUTE
-- FUNCTION needs the function to exist at attach time, while plpgsql resolves the table
-- references inside the body only when a trigger actually fires (by which point both floor
-- tables below exist). Same lazy-body rule 000 relies on.
create or replace function app.assert_dining_chain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org  uuid;
  v_prop uuid;
  v_out  uuid;
begin
  if TG_TABLE_NAME = 'dining_areas' then
    -- An area's parent is the outlet itself: there is no floor tier above it (§19).
    select o.organization_id, o.property_id, o.id into v_org, v_prop, v_out
      from public.outlets o where o.id = new.outlet_id;
    if v_out is null then
      raise exception 'NIVAAS_SCOPE_MISMATCH: outlet % does not exist', new.outlet_id;
    end if;

  elsif TG_TABLE_NAME = 'restaurant_tables' then
    -- A table's parent is its AREA, which is inside an outlet. Deriving the chain from the
    -- area rather than from the row is what makes the next check meaningful.
    select a.organization_id, a.property_id, a.outlet_id into v_org, v_prop, v_out
      from public.dining_areas a where a.id = new.area_id;
    if v_out is null then
      raise exception 'NIVAAS_SCOPE_MISMATCH: dining area % does not exist', new.area_id;
    end if;
    -- Spelled out because it is the attack this table actually faces: a row pointing at an
    -- area in another outlet while claiming a different outlet for itself.
    if new.outlet_id is distinct from v_out then
      raise exception 'NIVAAS_SCOPE_MISMATCH: table outlet does not match its area outlet';
    end if;

  else
    raise exception 'NIVAAS_SCOPE_MISMATCH: unhandled floor table %', TG_TABLE_NAME;
  end if;

  -- Now the copied-ancestor columns must match what the parent actually says.
  if new.organization_id <> v_org or new.property_id <> v_prop or new.outlet_id <> v_out then
    raise exception 'NIVAAS_SCOPE_MISMATCH: denormalized tenant chain disagrees with the parent';
  end if;

  return new;
end;
$$;

-- ===================================================================== tables

-- ------------------------------------------------------------------- dining_areas

-- §19: one `DiningArea` per section of a restaurant. display_order is deterministic and
-- unique among an outlet's live areas — that uniqueness is the whole ordering guarantee the
-- floor map depends on.
create table if not exists public.dining_areas (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id     uuid not null references public.properties(id)  on delete restrict,
  outlet_id       uuid not null references public.outlets(id)     on delete restrict,
  name            text not null check (char_length(name) between 2 and 120),
  description     text,
  display_order   integer not null default 0,
  -- Archival lifecycle ONLY. The operational facts of the floor live on the tables inside.
  status          text not null default 'ACTIVE'
                  check (status in ('ACTIVE','ARCHIVED')),
  archived_at     timestamptz,
  version         integer not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid
);

comment on table public.dining_areas is
  'One section of one restaurant (Main Hall, Outdoor, Rooftop). Deliberately a single level: §19 rejects a generic floor hierarchy.';
comment on column public.dining_areas.display_order is
  'Deterministic section order on the floor map. Unique per outlet across live rows; resequenced only via the reorder door.';
comment on column public.dining_areas.status is
  'ACTIVE or ARCHIVED — nothing else. An area is never "busy"; busy is a fact about its tables, and derived (see the file header).';
comment on column public.dining_areas.archived_at is
  'Stamped by archive_dining_area on the way in. An area takes no new tables once archived.';

-- A live area name is unique per outlet; an archived one frees the name for reuse.
-- Every PARTIAL UNIQUE index below is dropped then created rather than guarded by
-- `if not exists`: a uniqueness wall whose predicate has drifted must be REPLACED on a
-- re-apply, not skipped because the name was already there. Plain read indexes, which
-- cannot refuse a row, keep `if not exists`.
drop index if exists public.dining_areas_live_name_idx;
create unique index dining_areas_live_name_idx
  on public.dining_areas (outlet_id, name) where status <> 'ARCHIVED';
drop index if exists public.dining_areas_live_order_idx;
create unique index dining_areas_live_order_idx
  on public.dining_areas (outlet_id, display_order) where status <> 'ARCHIVED';
create index if not exists dining_areas_outlet_idx on public.dining_areas (outlet_id);
create index if not exists dining_areas_org_status_idx
  on public.dining_areas (organization_id, status);

drop trigger if exists dining_areas_touch on public.dining_areas;
create trigger dining_areas_touch before update on public.dining_areas
  for each row execute function app.touch_updated_at();

drop trigger if exists dining_areas_chain on public.dining_areas;
create trigger dining_areas_chain before insert or update on public.dining_areas
  for each row execute function app.assert_dining_chain();

-- --------------------------------------------------------------- restaurant_tables

-- §20's field list, with one deliberate divergence stated in the open: the spec's five
-- operational states become TWO columns. `status` is lifecycle, `service_status` is the manual
-- part of the operational fact, and the derived part (OCCUPIED / RESERVED) is 016's and #08's
-- to add — see the extension block above. There is no `notes`, no `section_id`, no
-- `min_order_value`: a field #04 did not ask for is a field nobody maintains.
create table if not exists public.restaurant_tables (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id     uuid not null references public.properties(id)  on delete restrict,
  outlet_id       uuid not null references public.outlets(id)     on delete restrict,
  area_id         uuid not null references public.dining_areas(id) on delete restrict,
  name            text not null check (char_length(name) between 1 and 60),
  code            text not null check (code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,23}$'),
  capacity        integer not null check (capacity between 1 and 100),
  status          text not null default 'ACTIVE'
                  check (status in ('ACTIVE','ARCHIVED')),
  -- The anti-corruption wall. The ABSENCE of OCCUPIED and RESERVED from this list is the
  -- point of the column, and the self-check at the bottom of this file reads the constraint
  -- back out of the catalog to prove they were never added.
  service_status  text not null default 'AVAILABLE'
                  check (service_status in ('AVAILABLE','CLEANING','OUT_OF_SERVICE')),
  display_order   integer not null default 0,
  position_x      numeric,
  position_y      numeric,
  shape           text
                  check (shape in ('ROUND','SQUARE','RECTANGLE','OVAL','BOOTH','OTHER')),
  archived_at     timestamptz,
  version         integer not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid,
  -- Floor-map geometry, not money. These are canvas coordinates for §21's map: unconstrained
  -- `numeric` (never numeric(p,s), per contract §1's habit of refusing silently-rounded
  -- inputs) bounded by a plain sanity CHECK, and deliberately carrying NO scale rule, because
  -- a scale rule is an accounting statement and this is a drawing.
  constraint restaurant_tables_position_ok
    check ((position_x is null or position_x between 0 and 10000)
      and (position_y is null or position_y between 0 and 10000))
);

comment on table public.restaurant_tables is
  'A cover inside a dining area. code is unique across the outlet, name across the area, and both only among live rows.';
comment on column public.restaurant_tables.status is
  'Archival lifecycle, kept separate from the operational fact exactly as 014 keeps menu status separate from is_available.';
comment on column public.restaurant_tables.service_status is
  'The ONLY manually settable operational facts (§20). OCCUPIED and RESERVED are not in this vocabulary by design: they are derived from live orders (016) and reservations (#08) and no person may write them.';
comment on column public.restaurant_tables.code is
  'The handle an order, a KOT and a bill print. Unique per outlet across live rows, so a ticket is never ambiguous.';
comment on column public.restaurant_tables.position_x is
  'Floor-map canvas coordinate (0-10000), not an amount; no money scale CHECK applies. NULL means the map auto-places it.';
comment on column public.restaurant_tables.shape is
  'Nullable: a CHECK passes on NULL, and an unknown silhouette is simply drawn as a card. The list exists so §21''s renderer draws a known shape rather than five spellings of one; OTHER is deliberate, and no attributes bag is invented to hold the rest.';
comment on column public.restaurant_tables.display_order is
  'Table order inside its area. Unique across live rows of that area; resequenced only via the reorder door.';

-- One code per outlet (see the header): two sections may both have a "Table 1".
drop index if exists public.restaurant_tables_live_code_idx;
create unique index restaurant_tables_live_code_idx
  on public.restaurant_tables (outlet_id, code) where status <> 'ARCHIVED';
drop index if exists public.restaurant_tables_live_name_idx;
create unique index restaurant_tables_live_name_idx
  on public.restaurant_tables (area_id, name) where status <> 'ARCHIVED';
drop index if exists public.restaurant_tables_live_order_idx;
create unique index restaurant_tables_live_order_idx
  on public.restaurant_tables (area_id, display_order) where status <> 'ARCHIVED';
create index if not exists restaurant_tables_outlet_idx on public.restaurant_tables (outlet_id);
create index if not exists restaurant_tables_org_status_idx
  on public.restaurant_tables (organization_id, status);
-- The common operational read: the covers of one section and what is happening on them.
create index if not exists restaurant_tables_area_service_idx
  on public.restaurant_tables (area_id, service_status);

drop trigger if exists restaurant_tables_touch on public.restaurant_tables;
create trigger restaurant_tables_touch before update on public.restaurant_tables
  for each row execute function app.touch_updated_at();

drop trigger if exists restaurant_tables_chain on public.restaurant_tables;
create trigger restaurant_tables_chain before insert or update on public.restaurant_tables
  for each row execute function app.assert_dining_chain();

-- ======================================================================= rls

-- Mirrors 014's block exactly: enabled, readable by the client role under the SAME outlet
-- predicate the write doors use, and with no DML at all. A table cannot be readable under a
-- rule that diverged from its authorization.
alter table public.dining_areas       enable row level security;
alter table public.restaurant_tables  enable row level security;

grant select on public.dining_areas, public.restaurant_tables to authenticated, service_role;

revoke all on public.dining_areas, public.restaurant_tables from anon;

revoke insert, update, delete, truncate
  on public.dining_areas, public.restaurant_tables
  from authenticated;

drop policy if exists dining_areas_outlet_read on public.dining_areas;
create policy dining_areas_outlet_read on public.dining_areas
  for select to authenticated
  using (app.can_access_outlet(app.current_user_id(), outlet_id));

drop policy if exists restaurant_tables_outlet_read on public.restaurant_tables;
create policy restaurant_tables_outlet_read on public.restaurant_tables
  for select to authenticated
  using (app.can_access_outlet(app.current_user_id(), outlet_id));

-- ==================================================================== doors

-- ------------------------------------------------------------------- areas

-- §19. The outlet is the only scope argument: an area's organization/property are read off the
-- outlet, so a client cannot name a tenant it does not belong to.
create or replace function public.create_dining_area(
  p_outlet uuid,
  p_name text,
  p_description text default null,
  p_display_order integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.require_session();
  v_org   uuid;
  v_prop  uuid;
  v_out   uuid;
  v_order integer;
  v_id    uuid;
  v_after jsonb;
begin
  select o.organization_id, o.property_id, o.id into v_org, v_prop, v_out
    from public.outlets o where o.id = p_outlet;
  perform app.require_valid(v_out is not null, 'NIVAAS_NOT_FOUND');
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('table.create', v_org, v_prop, v_out);
  perform app.require_writable_outlet(v_out);

  perform app.require_valid(p_name ~ '^.{2,120}$', 'NIVAAS_INVALID_NAME');

  -- An unranked new section goes to the end of the floor map, not to 0 (which would collide
  -- with the first section every outlet already has).
  v_order := coalesce(
    p_display_order,
    (select coalesce(max(a.display_order), -1) + 1 from public.dining_areas a
      where a.outlet_id = v_out and a.status <> 'ARCHIVED'));

  perform app.require_unique(
    exists (select 1 from public.dining_areas a
             where a.outlet_id = v_out and a.name = p_name and a.status <> 'ARCHIVED'),
    'NIVAAS_AREA_TAKEN');

  begin
    insert into public.dining_areas
      (organization_id, property_id, outlet_id, name, description, display_order, created_by)
    values (v_org, v_prop, v_out, p_name,
            nullif(btrim(coalesce(p_description, '')), ''), v_order, v_actor)
    returning id into v_id;
  exception when unique_violation then
    if sqlerrm like '%dining_areas_live_name_idx%' then
      raise exception 'NIVAAS_AREA_TAKEN';
    end if;
    if sqlerrm like '%dining_areas_live_order_idx%' then
      raise exception 'NIVAAS_AREA_ORDER_TAKEN';
    end if;
    raise;
  end;

  select to_jsonb(a) into v_after from public.dining_areas a where a.id = v_id;
  perform app.audit('dining_area_created', 'dining_area', v_id,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out, p_after := v_after);
  return v_after;
end;
$$;

-- An ordinary content edit. `p_expected_version` is 005's lost-update guard, and an empty
-- description is the operator's stated intent to clear it (app.blankable), not an omission.
create or replace function public.update_dining_area(
  p_area uuid,
  p_name text default null,
  p_description text default null,
  p_display_order integer default null,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := app.require_session();
  v_before jsonb;
  v_after  jsonb;
  v_org    uuid;
  v_prop   uuid;
  v_out    uuid;
begin
  select to_jsonb(a) into v_before from public.dining_areas a where a.id = p_area;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');
  v_org  := (v_before->>'organization_id')::uuid;
  v_prop := (v_before->>'property_id')::uuid;
  v_out  := (v_before->>'outlet_id')::uuid;
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('table.edit', v_org, v_prop, v_out);
  perform app.require_writable_outlet(v_out);
  perform app.require_version((v_before->>'version')::integer, p_expected_version);
  perform app.require_valid(v_before->>'status' <> 'ARCHIVED', 'NIVAAS_ARCHIVED');
  if p_name is not null then
    perform app.require_valid(p_name ~ '^.{2,120}$', 'NIVAAS_INVALID_NAME');
  end if;

  begin
    update public.dining_areas set
      name          = coalesce(p_name, name),
      description   = app.blankable(description, p_description),
      display_order = coalesce(p_display_order, display_order),
      version       = version + 1
    where id = p_area;
  exception when unique_violation then
    if sqlerrm like '%dining_areas_live_name_idx%' then raise exception 'NIVAAS_AREA_TAKEN'; end if;
    if sqlerrm like '%dining_areas_live_order_idx%' then
      raise exception 'NIVAAS_AREA_ORDER_TAKEN';
    end if;
    raise;
  end;
  select to_jsonb(a) into v_after from public.dining_areas a where a.id = p_area;

  perform app.audit('dining_area_updated', 'dining_area', p_area,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_before := v_before, p_after := v_after);
  return v_after;
end;
$$;

-- Retiring a section is a protected decision: a reason is mandatory (§48) and the row is
-- archived, never deleted (§78) — an order line from last season still names this area.
create or replace function public.archive_dining_area(p_area uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := app.require_session();
  v_before jsonb;
  v_after  jsonb;
  v_org    uuid;
  v_prop   uuid;
  v_out    uuid;
begin
  select to_jsonb(a) into v_before from public.dining_areas a where a.id = p_area;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');
  v_org  := (v_before->>'organization_id')::uuid;
  v_prop := (v_before->>'property_id')::uuid;
  v_out  := (v_before->>'outlet_id')::uuid;
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('table.archive', v_org, v_prop, v_out);
  perform app.require_writable_outlet(v_out);
  perform app.require_reason(p_reason);

  -- The area cannot be closed from under a live table. The alternative — an archived parent
  -- with children still trading on it — is exactly the orphan 001's chain triggers exist to
  -- prevent, and the floor map would have to invent a place to draw those covers.
  perform app.require_valid(
    not exists (select 1 from public.restaurant_tables t
                 where t.area_id = p_area and t.status <> 'ARCHIVED'),
    'NIVAAS_AREA_NOT_EMPTY');

  update public.dining_areas
     set status = 'ARCHIVED', archived_at = now(), version = version + 1
   where id = p_area;
  select to_jsonb(a) into v_after from public.dining_areas a where a.id = p_area;

  perform app.audit('dining_area_archived', 'dining_area', p_area,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_before := v_before, p_after := v_after, p_reason := p_reason);
  return v_after;
end;
$$;

-- §21: resequencing the floor is a full-permutation operation, never a partial diff. The
-- array must be exactly this outlet's live areas — same members, no duplicates, none missing.
-- `p_area_ids` is jsonb because PostgREST marshals an array body as JSON; the uuids inside it
-- are cast, and a malformed element is the same operator error as an incomplete list.
create or replace function public.reorder_dining_areas(p_outlet uuid, p_area_ids jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid := app.require_session();
  v_org      uuid;
  v_prop     uuid;
  v_out      uuid;
  v_proposed uuid[];
  v_live     uuid[];
  v_after    jsonb;
begin
  select o.organization_id, o.property_id, o.id into v_org, v_prop, v_out
    from public.outlets o where o.id = p_outlet;
  perform app.require_valid(v_out is not null, 'NIVAAS_NOT_FOUND');
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('table.edit', v_org, v_prop, v_out);
  perform app.require_writable_outlet(v_out);

  begin
    select coalesce(array_agg(x.area_id order by x.ord), '{}'::uuid[]) into v_proposed
      from (select elem::uuid as area_id, ord
              from jsonb_array_elements_text(p_area_ids) with ordinality as t(elem, ord)) x;
  exception when invalid_text_representation then
    raise exception 'NIVAAS_INVALID_PERMUTATION';
  end;

  select coalesce(array_agg(a.id order by a.display_order), '{}'::uuid[]) into v_live
    from public.dining_areas a
   where a.outlet_id = p_outlet and a.status <> 'ARCHIVED';

  -- Same MEMBERS, no duplicate, none missing, and an empty list is not a reorder.
  perform app.require_valid(
    array_length(v_proposed, 1) is not null
    and array_length(v_proposed, 1) = (select count(distinct x) from unnest(v_proposed) x)
    and array_length(v_proposed, 1) = array_length(v_live, 1)
    and (select array_agg(x order by x) from unnest(v_proposed) x)
        is not distinct from
          (select array_agg(x order by x) from unnest(v_live) x),
    'NIVAAS_INVALID_PERMUTATION');

  -- Two-phase rewrite so the partial unique (outlet_id, display_order) is satisfied by every
  -- statement: first move every live area to a distinct negative, then to its final rank
  -- 0..n-1. A single pass could momentarily collide two swapped sections. The scratch phase
  -- does not bump `version` — only the rank the operator sees does.
  update public.dining_areas da
     set display_order = -t.ord
    from (select x.area_id, x.ord from unnest(v_proposed) with ordinality as x(area_id, ord)) t
   where da.id = t.area_id and da.outlet_id = p_outlet;

  update public.dining_areas da
     set display_order = t.ord - 1, version = da.version + 1
    from (select x.area_id, x.ord from unnest(v_proposed) with ordinality as x(area_id, ord)) t
   where da.id = t.area_id and da.outlet_id = p_outlet;

  select jsonb_agg(jsonb_build_object('id', a.id, 'displayOrder', a.display_order)
                    order by a.display_order) into v_after
    from public.dining_areas a
   where a.outlet_id = p_outlet and a.status <> 'ARCHIVED';

  perform app.audit('dining_areas_reordered', 'outlet', p_outlet,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_after := jsonb_build_object('order', v_after));
  return jsonb_build_object('outletId', p_outlet, 'order', v_after);
end;
$$;

-- ------------------------------------------------------------------ tables

-- A new cover is created INSIDE an area, so the area is the only scope argument: the outlet,
-- the property and the organization are read off it. This is the shape §19's hierarchy gives
-- and the reason a client never gets to name a tenant here at all.
create or replace function public.create_restaurant_table(
  p_area uuid,
  p_name text,
  p_code text,
  p_capacity integer,
  p_shape text default null,
  p_position_x numeric default null,
  p_position_y numeric default null,
  p_display_order integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.require_session();
  v_org   uuid;
  v_prop  uuid;
  v_out   uuid;
  v_order integer;
  v_id    uuid;
  v_after jsonb;
begin
  select a.organization_id, a.property_id, a.outlet_id into v_org, v_prop, v_out
    from public.dining_areas a where a.id = p_area;
  perform app.require_valid(v_org is not null, 'NIVAAS_NOT_FOUND');
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('table.create', v_org, v_prop, v_out);
  perform app.require_writable_outlet(v_out);
  -- A retired section takes no new covers: history can name it, a floor map cannot grow one.
  perform app.require_valid(
    exists (select 1 from public.dining_areas a
             where a.id = p_area and a.status = 'ACTIVE'),
    'NIVAAS_AREA_UNAVAILABLE');

  perform app.require_valid(p_name ~ '^.{1,60}$', 'NIVAAS_INVALID_TABLE_NAME');
  perform app.require_valid(
    p_code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,23}$', 'NIVAAS_INVALID_TABLE_CODE');
  perform app.require_valid(p_capacity between 1 and 100, 'NIVAAS_INVALID_CAPACITY');
  perform app.require_valid(
    p_shape is null or p_shape in ('ROUND','SQUARE','RECTANGLE','OVAL','BOOTH','OTHER'),
    'NIVAAS_INVALID_SHAPE');
  perform app.require_valid(
    (p_position_x is null or p_position_x between 0 and 10000)
    and (p_position_y is null or p_position_y between 0 and 10000),
    'NIVAAS_INVALID_POSITION');

  -- Code uniqueness is an OUTLET rule; name uniqueness is an AREA rule (§20's map, §21's
  -- picture). Both arrive as the same refusal because the operator's problem is identical:
  -- that cover is already called that.
  perform app.require_unique(
    exists (select 1 from public.restaurant_tables t
             where t.outlet_id = v_out and t.code = p_code and t.status <> 'ARCHIVED'),
    'NIVAAS_TABLE_TAKEN');
  perform app.require_unique(
    exists (select 1 from public.restaurant_tables t
             where t.area_id = p_area and t.name = p_name and t.status <> 'ARCHIVED'),
    'NIVAAS_TABLE_TAKEN');

  v_order := coalesce(
    p_display_order,
    (select coalesce(max(t.display_order), -1) + 1 from public.restaurant_tables t
      where t.area_id = p_area and t.status <> 'ARCHIVED'));

  begin
    insert into public.restaurant_tables
      (organization_id, property_id, outlet_id, area_id, name, code, capacity, shape,
       position_x, position_y, display_order, created_by)
    values (v_org, v_prop, v_out, p_area, p_name, p_code, p_capacity, p_shape,
            p_position_x, p_position_y, v_order, v_actor)
    returning id into v_id;
  exception when unique_violation then
    if sqlerrm like '%restaurant_tables_live_code_idx%' then
      raise exception 'NIVAAS_TABLE_TAKEN';
    end if;
    if sqlerrm like '%restaurant_tables_live_name_idx%' then
      raise exception 'NIVAAS_TABLE_TAKEN';
    end if;
    if sqlerrm like '%restaurant_tables_live_order_idx%' then
      raise exception 'NIVAAS_TABLE_ORDER_TAKEN';
    end if;
    raise;
  end;

  select to_jsonb(t) into v_after from public.restaurant_tables t where t.id = v_id;
  perform app.audit('restaurant_table_created', 'restaurant_table', v_id,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out, p_after := v_after);
  return v_after;
end;
$$;

-- Content and placement only. This door takes NO service_status: §20's corruption wall is that
-- an ordinary edit cannot quietly mark a cover occupied, cleaning or out of service — that
-- takes its own reasoned door. Moving a cover between sections is allowed, but only into a
-- live area of the SAME outlet, and the chain trigger re-proves the ancestors afterwards, so
-- a cross-outlet move is refused twice over.
create or replace function public.update_restaurant_table(
  p_table uuid,
  p_area uuid default null,
  p_name text default null,
  p_code text default null,
  p_capacity integer default null,
  p_shape text default null,
  p_position_x numeric default null,
  p_position_y numeric default null,
  p_display_order integer default null,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid := app.require_session();
  v_before  jsonb;
  v_after   jsonb;
  v_org     uuid;
  v_prop    uuid;
  v_out     uuid;
  v_area    uuid;
  v_order   integer;
begin
  select to_jsonb(t) into v_before from public.restaurant_tables t where t.id = p_table;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');
  v_org  := (v_before->>'organization_id')::uuid;
  v_prop := (v_before->>'property_id')::uuid;
  v_out  := (v_before->>'outlet_id')::uuid;
  v_area := (v_before->>'area_id')::uuid;
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('table.edit', v_org, v_prop, v_out);
  perform app.require_writable_outlet(v_out);
  perform app.require_version((v_before->>'version')::integer, p_expected_version);
  perform app.require_valid(v_before->>'status' <> 'ARCHIVED', 'NIVAAS_ARCHIVED');

  if p_name is not null then
    perform app.require_valid(p_name ~ '^.{1,60}$', 'NIVAAS_INVALID_TABLE_NAME');
  end if;
  if p_code is not null then
    perform app.require_valid(
      p_code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,23}$', 'NIVAAS_INVALID_TABLE_CODE');
  end if;
  if p_capacity is not null then
    perform app.require_valid(p_capacity between 1 and 100, 'NIVAAS_INVALID_CAPACITY');
  end if;
  if p_shape is not null then
    perform app.require_valid(
      p_shape in ('ROUND','SQUARE','RECTANGLE','OVAL','BOOTH','OTHER'), 'NIVAAS_INVALID_SHAPE');
  end if;
  if p_position_x is not null or p_position_y is not null then
    perform app.require_valid(
      (p_position_x is null or p_position_x between 0 and 10000)
      and (p_position_y is null or p_position_y between 0 and 10000),
      'NIVAAS_INVALID_POSITION');
  end if;

  if p_area is not null then
    perform app.require_valid(
      exists (select 1 from public.dining_areas a
               where a.id = p_area and a.outlet_id = v_out and a.status = 'ACTIVE'),
      'NIVAAS_AREA_NOT_IN_OUTLET');
    v_area := p_area;
  end if;

  -- A move without a stated rank joins the END of the destination section: rank is unique per
  -- area, so carrying the old number into a section that already uses it would fail for a
  -- reason the operator cannot see on the screen they are dragging on.
  if p_display_order is not null then
    v_order := p_display_order;
  elsif p_area is not null and p_area <> (v_before->>'area_id')::uuid then
    v_order := (select coalesce(max(t.display_order), -1) + 1 from public.restaurant_tables t
                 where t.area_id = p_area and t.status <> 'ARCHIVED' and t.id <> p_table);
  else
    v_order := (v_before->>'display_order')::integer;
  end if;

  perform app.require_unique(
    exists (select 1 from public.restaurant_tables t
             where t.outlet_id = v_out and t.code = p_code and t.id <> p_table
               and t.status <> 'ARCHIVED'),
    'NIVAAS_TABLE_TAKEN');
  perform app.require_unique(
    exists (select 1 from public.restaurant_tables t
             where t.area_id = v_area and t.name = p_name and t.id <> p_table
               and t.status <> 'ARCHIVED'),
    'NIVAAS_TABLE_TAKEN');

  begin
    update public.restaurant_tables set
      area_id       = v_area,
      name          = coalesce(p_name, name),
      code          = coalesce(p_code, code),
      capacity      = coalesce(p_capacity, capacity),
      shape         = coalesce(p_shape, shape),
      position_x    = coalesce(p_position_x, position_x),
      position_y    = coalesce(p_position_y, position_y),
      display_order = v_order,
      version       = version + 1
    where id = p_table;
  exception when unique_violation then
    if sqlerrm like '%restaurant_tables_live_code_idx%' then
      raise exception 'NIVAAS_TABLE_TAKEN';
    end if;
    if sqlerrm like '%restaurant_tables_live_name_idx%' then
      raise exception 'NIVAAS_TABLE_TAKEN';
    end if;
    if sqlerrm like '%restaurant_tables_live_order_idx%' then
      raise exception 'NIVAAS_TABLE_ORDER_TAKEN';
    end if;
    raise;
  end;
  select to_jsonb(t) into v_after from public.restaurant_tables t where t.id = p_table;

  perform app.audit('restaurant_table_updated', 'restaurant_table', p_table,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_before := v_before, p_after := v_after);
  return v_after;
end;
$$;

-- §21: the same full-permutation rule one level down, scoped to one area.
create or replace function public.reorder_restaurant_tables(p_area uuid, p_table_ids jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid := app.require_session();
  v_org      uuid;
  v_prop     uuid;
  v_out      uuid;
  v_proposed uuid[];
  v_live     uuid[];
  v_after    jsonb;
begin
  select a.organization_id, a.property_id, a.outlet_id into v_org, v_prop, v_out
    from public.dining_areas a where a.id = p_area;
  perform app.require_valid(v_org is not null, 'NIVAAS_NOT_FOUND');
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('table.edit', v_org, v_prop, v_out);
  perform app.require_writable_outlet(v_out);

  begin
    select coalesce(array_agg(x.table_id order by x.ord), '{}'::uuid[]) into v_proposed
      from (select elem::uuid as table_id, ord
              from jsonb_array_elements_text(p_table_ids) with ordinality as t(elem, ord)) x;
  exception when invalid_text_representation then
    raise exception 'NIVAAS_INVALID_PERMUTATION';
  end;

  select coalesce(array_agg(t.id order by t.display_order), '{}'::uuid[]) into v_live
    from public.restaurant_tables t
   where t.area_id = p_area and t.status <> 'ARCHIVED';

  perform app.require_valid(
    array_length(v_proposed, 1) is not null
    and array_length(v_proposed, 1) = (select count(distinct x) from unnest(v_proposed) x)
    and array_length(v_proposed, 1) = array_length(v_live, 1)
    and (select array_agg(x order by x) from unnest(v_proposed) x)
        is not distinct from
          (select array_agg(x order by x) from unnest(v_live) x),
    'NIVAAS_INVALID_PERMUTATION');

  update public.restaurant_tables rt
     set display_order = -t.ord
    from (select x.table_id, x.ord from unnest(v_proposed) with ordinality as x(table_id, ord)) t
   where rt.id = t.table_id and rt.area_id = p_area;

  update public.restaurant_tables rt
     set display_order = t.ord - 1, version = rt.version + 1
    from (select x.table_id, x.ord from unnest(v_proposed) with ordinality as x(table_id, ord)) t
   where rt.id = t.table_id and rt.area_id = p_area;

  select jsonb_agg(jsonb_build_object('id', t.id, 'displayOrder', t.display_order)
                    order by t.display_order) into v_after
    from public.restaurant_tables t
   where t.area_id = p_area and t.status <> 'ARCHIVED';

  perform app.audit('restaurant_tables_reordered', 'dining_area', p_area,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_after := jsonb_build_object('order', v_after));
  return jsonb_build_object('areaId', p_area, 'order', v_after);
end;
$$;

create or replace function public.archive_restaurant_table(p_table uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := app.require_session();
  v_before jsonb;
  v_after  jsonb;
  v_org    uuid;
  v_prop   uuid;
  v_out    uuid;
begin
  select to_jsonb(t) into v_before from public.restaurant_tables t where t.id = p_table;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');
  v_org  := (v_before->>'organization_id')::uuid;
  v_prop := (v_before->>'property_id')::uuid;
  v_out  := (v_before->>'outlet_id')::uuid;
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('table.archive', v_org, v_prop, v_out);
  perform app.require_writable_outlet(v_out);
  perform app.require_reason(p_reason);

  -- A cover the floor is not standing behind cannot be retired. Today the only manual facts
  -- say so; 016 adds the louder one.
  -- 016: this is where the live-order check joins it — an OPEN order on this table must refuse
  -- the archive too. Deliberately not written here, because there is no order table to read;
  -- a fake `exists (select 1 from orders ...)` would be a compile error, and a comment-shaped
  -- permission would be a lie.
  perform app.require_valid(
    (v_before->>'service_status') = 'AVAILABLE', 'NIVAAS_TABLE_IN_USE');

  update public.restaurant_tables
     set status = 'ARCHIVED', archived_at = now(), version = version + 1
   where id = p_table;
  select to_jsonb(t) into v_after from public.restaurant_tables t where t.id = p_table;

  perform app.audit('restaurant_table_archived', 'restaurant_table', p_table,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_before := v_before, p_after := v_after, p_reason := p_reason);
  return v_after;
end;
$$;

-- The one operational write §20 permits a person: cleaning, out of service, and back to
-- available. It takes its own door and its own verb because a status that is derived for two
-- of its five states must not be reachable from a general edit path.
create or replace function public.set_table_service_status(
  p_table uuid,
  p_service_status text,
  p_reason text,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := app.require_session();
  v_before jsonb;
  v_after  jsonb;
  v_org    uuid;
  v_prop   uuid;
  v_out    uuid;
begin
  -- FIRST, before the row is even read: an attempted OCCUPIED or RESERVED fails on the
  -- vocabulary, not on something later. The order is the assertion — a check that came after
  -- the permission test would let a refusal pattern tell a stranger which words are legal.
  perform app.require_valid(
    p_service_status in ('AVAILABLE','CLEANING','OUT_OF_SERVICE'), 'NIVAAS_INVALID_STATUS');

  select to_jsonb(t) into v_before from public.restaurant_tables t where t.id = p_table;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');
  v_org  := (v_before->>'organization_id')::uuid;
  v_prop := (v_before->>'property_id')::uuid;
  v_out  := (v_before->>'outlet_id')::uuid;
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('table.edit', v_org, v_prop, v_out);
  perform app.require_writable_outlet(v_out);
  perform app.require_reason(p_reason);
  perform app.require_version((v_before->>'version')::integer, p_expected_version);
  perform app.require_valid(v_before->>'status' <> 'ARCHIVED', 'NIVAAS_ARCHIVED');

  update public.restaurant_tables
     set service_status = p_service_status, version = version + 1
   where id = p_table;
  select to_jsonb(t) into v_after from public.restaurant_tables t where t.id = p_table;

  perform app.audit('table_service_status_changed', 'restaurant_table', p_table,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_before := jsonb_build_object('serviceStatus', v_before->>'service_status'),
    p_after := jsonb_build_object('serviceStatus', p_service_status),
    p_reason := p_reason);
  return v_after;
end;
$$;

-- NO read door in this file, on purpose. §21's floor map needs an ordered list of a restaurant's
-- sections and covers, which is a plain SELECT on two tables the outlet policy above already
-- makes correct; wrapping it in a SECURITY DEFINER function would grant more reach than the
-- policy does and buy nothing. 014 needs `menu_snapshot` because a price is a HISTORY row;
-- a table has no history to resolve. When 016 adds the derived OCCUPIED/RESERVED read, the
-- resolution goes with IT (see the extension block at the top).

-- ==================================================================== grants

-- Catalog-resolved (name only, signatures derived from pg_proc) so a future parameter added to
-- a door cannot desync an ACL list. A listed name with no function behind it aborts the apply —
-- the only allowed direction of drift is an intentional new door.
do $$
declare
  v_name text;
  v_oid  oid;
  v_oids oid[];
begin
  foreach v_name in array array[
    'create_dining_area', 'update_dining_area', 'archive_dining_area',
    'reorder_dining_areas',
    'create_restaurant_table', 'update_restaurant_table', 'reorder_restaurant_tables',
    'archive_restaurant_table', 'set_table_service_status'
  ] loop
    select coalesce(array_agg(p.oid), '{}'::oid[]) into v_oids
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_name;
    if v_oids = '{}'::oid[] then
      raise exception 'NIVAAS_MIGRATION_GAP: % is granted but never defined', v_name;
    end if;
    foreach v_oid in array v_oids loop
      execute format('grant execute on function %s to authenticated, service_role',
                     v_oid::regprocedure);
    end loop;
  end loop;
end;
$$;

-- ================================================================= self-check

-- The structural guarantees this file exists to provide, verified rather than assumed: a
-- half-applied 015 must fail loudly the way 006, 012 and 014 do.
do $$
declare
  v_def text;
begin
  -- The ordering and identity walls are real indexes, not comments. Code is unique per
  -- outlet, name and rank per area, name and rank per outlet for sections.
  perform app.require_valid(
    exists (select 1 from pg_class where relname = 'dining_areas_live_name_idx')
    and exists (select 1 from pg_class where relname = 'dining_areas_live_order_idx')
    and exists (select 1 from pg_class where relname = 'restaurant_tables_live_code_idx')
    and exists (select 1 from pg_class where relname = 'restaurant_tables_live_name_idx')
    and exists (select 1 from pg_class where relname = 'restaurant_tables_live_order_idx'),
    'NIVAAS_MIGRATION_GAP');

  -- Both chain guards and both touch triggers are attached (counted, so a dropped trigger on
  -- a re-apply is caught rather than merely missing from a list).
  perform app.require_valid(
    (select count(distinct tgname) from pg_trigger
      where tgname in ('dining_areas_chain','restaurant_tables_chain')) = 2,
    'NIVAAS_MIGRATION_GAP');
  perform app.require_valid(
    (select count(distinct tgname) from pg_trigger
      where tgname in ('dining_areas_touch','restaurant_tables_touch')) = 2,
    'NIVAAS_MIGRATION_GAP');

  -- THE wall of §20, read back out of the catalog rather than asserted in prose: exactly one
  -- CHECK governs service_status, it holds the three manual states, and the two derived ones
  -- are NOT in its definition. If a later migration widens this vocabulary by hand, the apply
  -- stops here instead of shipping a table whose "derived" status a person can now type.
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public' and t.relname = 'restaurant_tables'
     and c.contype = 'c'
     and pg_get_constraintdef(c.oid) like '%service_status%';
  perform app.require_valid(
    v_def is not null
    and v_def like '%AVAILABLE%' and v_def like '%CLEANING%' and v_def like '%OUT_OF_SERVICE%'
    and v_def not like '%OCCUPIED%'
    and v_def not like '%RESERVED%',
    'NIVAAS_MIGRATION_GAP');

  -- Geometry is drawn, not billed: unconstrained numeric, never a precisioned numeric(p,s)
  -- (012's lesson — assert the wall exists, do not trust the intent).
  perform app.require_valid(
    not exists (select 1 from pg_attribute a join pg_class c on c.oid = a.attrelid
                 where c.relnamespace = 'public'::regnamespace
                   and c.relname = 'restaurant_tables'
                   and a.attname in ('position_x', 'position_y')
                   and (a.atttypid <> 'numeric'::regtype or a.atttypmod <> -1)),
    'NIVAAS_MIGRATION_GAP');
end;
$$;
