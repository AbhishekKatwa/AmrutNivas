-- ============================================================================
-- AMRUT NIVAAS — 025: Recipes and Recipe Versioning
--
-- A recipe is a formula: "to make one unit of item X, you need N units of
-- component A, M units of component B, etc." Recipes are outlet-scoped and
-- versioned. Only one version is ACTIVE at a time.
--
-- Menu items link to a recipe (optional). When an order is placed, the
-- consumption engine (026) resolves the menu item → recipe → ingredients →
-- stock movements.
--
-- Recipe cost is DERIVED: sum of (ingredient_qty × ingredient_avg_cost).
-- No mutable cost column. Cost is recalculated on demand.
--
-- Design invariants:
--   - Recipes are outlet-scoped (one outlet's Biryani may differ from another's).
--   - Only one ACTIVE version per recipe at a time.
--   - Ingredients reference inventory_items (must be stockable).
--   - Unit conversion happens at consumption time, not recipe time.
--   - Recipe activation is permission-gated (manager+).
-- ============================================================================

set local search_path = '';

-- ============================================================ recipes

create table if not exists public.recipes (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  property_id          uuid not null references public.properties(id)  on delete restrict,
  outlet_id            uuid not null references public.outlets(id)     on delete restrict,
  item_id              uuid not null references public.inventory_items(id) on delete restrict,
  name                 text not null,
  code                 text not null,
  description          text,
  yield_quantity       numeric not null default 1,
  yield_unit_id        uuid not null references public.units_of_measure(id) on delete restrict,
  status               text not null default 'DRAFT',
  notes                text,
  version              integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid,

  constraint recipes_name_not_blank check (btrim(name) <> ''),
  constraint recipes_code_not_blank check (btrim(code) <> ''),
  constraint recipes_yield_positive check (yield_quantity > 0),
  constraint recipes_status_ok check (status in ('DRAFT', 'ACTIVE', 'ARCHIVED'))
);

comment on table public.recipes is
  'Recipe master: what item is produced, in what quantity, at which outlet.';

create unique index if not exists recipes_code_outlet_idx
  on public.recipes (organization_id, outlet_id, lower(code))
  where status <> 'ARCHIVED';

create index if not exists recipes_item_idx
  on public.recipes (item_id);

create index if not exists recipes_outlet_idx
  on public.recipes (outlet_id);

-- Chain guard: recipe's scope must match its outlet and item.
create or replace function app.assert_recipe_chain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_prop   uuid;
  v_out    uuid;
  v_item_org uuid;
begin
  select o.organization_id, o.property_id, o.id
    into v_org, v_prop, v_out
    from public.outlets o where o.id = new.outlet_id;

  if v_out is null then
    raise exception 'NIVAAS_SCOPE_MISMATCH: recipe % points at no outlet', new.id;
  end if;

  if new.organization_id <> v_org or new.property_id <> v_prop then
    raise exception 'NIVAAS_SCOPE_MISMATCH: a recipe cannot sit outside its outlet''s tenant';
  end if;

  -- Item must belong to the same organization.
  select i.organization_id into v_item_org
    from public.inventory_items i where i.id = new.item_id;

  if v_item_org is null or v_item_org <> new.organization_id then
    raise exception 'NIVAAS_SCOPE_MISMATCH: recipe item does not belong to this organization';
  end if;

  return new;
end;
$$;

drop trigger if exists recipes_touch on public.recipes;
create trigger recipes_touch before update on public.recipes
  for each row execute function app.touch_updated_at();

drop trigger if exists recipes_chain on public.recipes;
create trigger recipes_chain before insert or update on public.recipes
  for each row execute function app.assert_recipe_chain();

-- RLS: authenticated members SELECT their tenant scope; no DML.
drop policy if exists recipes_select on public.recipes;
create policy recipes_select on public.recipes
  for select to authenticated
  using (
    app.member_of(app.current_user_id(), organization_id)
  );

-- ============================================================ recipe_versions

-- Each recipe has one or more versions. Only one is ACTIVE at a time.
-- When a recipe is "updated", a new version row is created; the old version
-- becomes INACTIVE. This preserves historical cost calculations.
create table if not exists public.recipe_versions (
  id                   uuid primary key default gen_random_uuid(),
  recipe_id            uuid not null references public.recipes(id) on delete cascade,
  version_number       integer not null,
  status               text not null default 'DRAFT',
  yield_quantity       numeric not null default 1,
  yield_unit_id        uuid not null references public.units_of_measure(id) on delete restrict,
  notes                text,
  activated_at         timestamptz,
  activated_by         uuid,
  created_at           timestamptz not null default now(),
  created_by           uuid,

  constraint recipe_versions_status_ok check (status in ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED')),
  constraint recipe_versions_version_positive check (version_number > 0),
  constraint recipe_versions_yield_positive check (yield_quantity > 0)
);

comment on table public.recipe_versions is
  'Versioned snapshots of a recipe. Only one ACTIVE version per recipe at a time.';

create unique index if not exists recipe_versions_recipe_version_idx
  on public.recipe_versions (recipe_id, version_number);

create index if not exists recipe_versions_recipe_status_idx
  on public.recipe_versions (recipe_id, status);

-- RLS: inherits through recipe_id (no direct org column).
drop policy if exists recipe_versions_select on public.recipe_versions;
create policy recipe_versions_select on public.recipe_versions
  for select to authenticated
  using (
    exists (
      select 1 from public.recipes r
        where r.id = recipe_versions.recipe_id
          and app.member_of(app.current_user_id(), r.organization_id)
    )
  );

-- ============================================================ recipe_ingredients

-- The components of a recipe version: "N units of item X".
-- Unit conversion happens at consumption time if the ingredient's unit differs
-- from the stock ledger's unit.
create table if not exists public.recipe_ingredients (
  id                   uuid primary key default gen_random_uuid(),
  recipe_version_id    uuid not null references public.recipe_versions(id) on delete cascade,
  item_id              uuid not null references public.inventory_items(id) on delete restrict,
  quantity             numeric not null,
  unit_id              uuid not null references public.units_of_measure(id) on delete restrict,
  notes                text,
  display_order        integer not null default 0,
  created_at           timestamptz not null default now(),

  constraint recipe_ingredients_quantity_positive check (quantity > 0)
);

comment on table public.recipe_ingredients is
  'Components of a recipe version: item, quantity, unit.';

create index if not exists recipe_ingredients_version_idx
  on public.recipe_ingredients (recipe_version_id);

create index if not exists recipe_ingredients_item_idx
  on public.recipe_ingredients (item_id);

-- RLS: inherits through recipe_version_id.
drop policy if exists recipe_ingredients_select on public.recipe_ingredients;
create policy recipe_ingredients_select on public.recipe_ingredients
  for select to authenticated
  using (
    exists (
      select 1 from public.recipe_versions rv
        join public.recipes r on r.id = rv.recipe_id
        where rv.id = recipe_ingredients.recipe_version_id
          and app.member_of(app.current_user_id(), r.organization_id)
    )
  );

-- ============================================================ menu_item → recipe link

-- A menu item can optionally link to a recipe. When an order is placed, the
-- consumption engine resolves the link and posts stock movements.
alter table public.menu_items
  add column if not exists recipe_id uuid references public.recipes(id) on delete set null;

comment on column public.menu_items.recipe_id is
  'Optional recipe link: when set, ordering this item triggers consumption.';

create index if not exists menu_items_recipe_idx
  on public.menu_items (recipe_id);

-- ============================================================ doors

-- create_recipe
create or replace function public.create_recipe(
  p_organization  uuid,
  p_property      uuid,
  p_outlet        uuid,
  p_item          uuid,
  p_name          text,
  p_code          text,
  p_description   text default null,
  p_yield_qty     numeric default 1,
  p_yield_unit    uuid,
  p_notes         text default null,
  p_ingredients   jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id    uuid := app.current_user_id();
  v_recipe_id  uuid;
  v_version_id uuid;
  v_ingredient jsonb;
begin
  if not app.member_of(v_user_id, p_organization) then
    raise exception 'NIVAAS_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not app.has_permission(v_user_id, p_organization, 'recipe.create') then
    raise exception 'NIVAAS_FORBIDDEN' using errcode = '28000';
  end if;

  -- Create the recipe master.
  insert into public.recipes (
    organization_id, property_id, outlet_id, item_id,
    name, code, description, yield_quantity, yield_unit_id, notes, created_by
  ) values (
    p_organization, p_property, p_outlet, p_item,
    p_name, p_code, p_description, p_yield_qty, p_yield_unit, p_notes, v_user_id
  ) returning id into v_recipe_id;

  -- Create version 1.
  insert into public.recipe_versions (
    recipe_id, version_number, status, yield_quantity, yield_unit_id, notes, created_by
  ) values (
    v_recipe_id, 1, 'DRAFT', p_yield_qty, p_yield_unit, p_notes, v_user_id
  ) returning id into v_version_id;

  -- Add ingredients.
  for v_ingredient in select * from jsonb_array_elements(p_ingredients) loop
    insert into public.recipe_ingredients (
      recipe_version_id, item_id, quantity, unit_id, notes, display_order
    ) values (
      v_version_id,
      (v_ingredient->>'item_id')::uuid,
      (v_ingredient->>'quantity')::numeric,
      (v_ingredient->>'unit_id')::uuid,
      v_ingredient->>'notes',
      coalesce((v_ingredient->>'display_order')::integer, 0)
    );
  end loop;

  -- Audit.
  perform app.audit(
    'create',
    'recipe',
    v_recipe_id,
    p_organization,
    p_property,
    p_outlet,
    null,
    jsonb_build_object('name', p_name, 'code', p_code, 'item_id', p_item)
  );

  return v_recipe_id;
end;
$$;

grant execute on function public.create_recipe to authenticated;

-- activate_recipe_version
create or replace function public.activate_recipe_version(
  p_organization    uuid,
  p_recipe_version  uuid,
  p_reason          text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id    uuid := app.current_user_id();
  v_recipe_id  uuid;
  v_recipe_org uuid;
  v_recipe_prop uuid;
  v_recipe_out uuid;
begin
  -- Fetch the version and its recipe.
  select rv.recipe_id, r.organization_id, r.property_id, r.outlet_id
    into v_recipe_id, v_recipe_org, v_recipe_prop, v_recipe_out
    from public.recipe_versions rv
    join public.recipes r on r.id = rv.recipe_id
    where rv.id = p_recipe_version;

  if v_recipe_id is null then
    raise exception 'NIVAAS_NOT_FOUND: recipe version % does not exist', p_recipe_version;
  end if;

  if not app.member_of(v_user_id, v_recipe_org) then
    raise exception 'NIVAAS_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not app.has_permission(v_user_id, v_recipe_org, 'recipe.activate') then
    raise exception 'NIVAAS_FORBIDDEN' using errcode = '28000';
  end if;

  -- Deactivate all other versions of this recipe.
  update public.recipe_versions rv
    set status = 'INACTIVE'
    where rv.recipe_id = v_recipe_id and rv.status = 'ACTIVE';

  -- Activate this version.
  update public.recipe_versions rv
    set status = 'ACTIVE',
        activated_at = now(),
        activated_by = v_user_id
    where rv.id = p_recipe_version;

  -- Update the recipe master's status.
  update public.recipes r
    set status = 'ACTIVE'
    where r.id = v_recipe_id;

  -- Audit.
  perform app.audit(
    'activate',
    'recipe_version',
    p_recipe_version,
    v_recipe_org,
    v_recipe_prop,
    v_recipe_out,
    null,
    jsonb_build_object('reason', p_reason)
  );
end;
$$;

grant execute on function public.activate_recipe_version to authenticated;

-- calculate_recipe_cost (read-only, returns numeric)
create or replace function public.calculate_recipe_cost(
  p_organization    uuid,
  p_recipe_version  uuid
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id     uuid := app.current_user_id();
  v_recipe_org  uuid;
  v_total_cost  numeric := 0;
  v_ingredient  record;
  v_item_avg    numeric;
  v_converted_qty numeric;
begin
  -- Fetch the recipe's org.
  select r.organization_id into v_recipe_org
    from public.recipe_versions rv
    join public.recipes r on r.id = rv.recipe_id
    where rv.id = p_recipe_version;

  if v_recipe_org is null then
    raise exception 'NIVAAS_NOT_FOUND: recipe version % does not exist', p_recipe_version;
  end if;

  if not app.member_of(v_user_id, v_recipe_org) then
    raise exception 'NIVAAS_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not app.has_permission(v_user_id, v_recipe_org, 'recipe.cost.view') then
    raise exception 'NIVAAS_FORBIDDEN' using errcode = '28000';
  end if;

  -- Sum up ingredient costs.
  for v_ingredient in
    select ri.item_id, ri.quantity, ri.unit_id
      from public.recipe_ingredients ri
      where ri.recipe_version_id = p_recipe_version
  loop
    -- Get the item's current weighted average cost (any location).
    select coalesce(max(sb.last_avg_cost), 0) into v_item_avg
      from public.stock_balance sb
      where sb.item_id = v_ingredient.item_id
        and sb.organization_id = v_recipe_org;

    -- Convert ingredient unit to stock unit if needed.
    if v_ingredient.unit_id <> (select i.base_unit_id from public.inventory_items i where i.id = v_ingredient.item_id) then
      v_converted_qty := app.convert_unit(
        v_recipe_org,
        v_ingredient.unit_id,
        (select i.base_unit_id from public.inventory_items i where i.id = v_ingredient.item_id),
        v_ingredient.quantity
      );
    else
      v_converted_qty := v_ingredient.quantity;
    end if;

    v_total_cost := v_total_cost + (v_converted_qty * v_item_avg);
  end loop;

  return v_total_cost;
end;
$$;

grant execute on function public.calculate_recipe_cost to authenticated;
