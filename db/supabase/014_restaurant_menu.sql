-- AMRUT NIVAAS · 014 — the menu domain (Prompt #04 §6-§17)
--
-- This is the restaurant's data spine: menus, their ordered categories, the items on
-- them, the modifier groups/options that customise an item, and the price HISTORY behind
-- each item. It also lays the permission-gated write doors every later hospitality module
-- (tables, orders, KOT, bills, payments — three subsequent work items) will be built on.
--
-- What this file prevents, in the donor project's own failure words:
--
--   * A mutable `base_price` column on the item. It cannot be kept: §13 requires that a
--     past order resolve to the price it was actually sold at, and a single mutable column
--     destroys that the moment a dish is repriced. So price is a row in `menu_item_prices`,
--     an open (effective_to IS NULL) current row plus closed history rows, with one partial
--     unique index guaranteeing exactly one current price per item. The item itself has NO
--     price column at all.
--   * Float money. Every stored amount is `numeric` with the scale enforced. `numeric(10,2)`
--     was rejected because Postgres SILENTLY ROUNDS an over-scale input to fit (1.239 →
--     1.24), so a 2-decimal currency could quietly swallow a sub-cent error. Instead the
--     columns are unconstrained `numeric` with a CHECK on scale(trim_scale(col)) — the CHECK
--     sees the exact input, so a genuine third decimal is refused (NIVAAS_INVALID_MONEY)
--     while a harmless trailing zero (19.9900) is accepted. Each money row also carries its
--     currency (validated by app.is_valid_currency).
--   * Availability entangled with lifecycle. §10 says "sold out tonight" is NOT the same
--     fact as "retired from the menu". So `is_available` (a fast operational flag, flipped
--     by its own audited door) sits beside `status` (DRAFT/ACTIVE/ARCHIVED), and the derived
--     `availability_status` is a STORED generated column so the two spellings of one fact
--     can never drift apart.
--   * Non-deterministic category order. §8 wants a stable, operator-controlled order, not
--     "whatever the DB returns". Live categories carry a unique display_order per menu (a
--     partial unique index), and the only way to resequence them is `reorder_menu_categories`
--     with a full permutation — an incomplete or duplicated list is refused, never silently
--     patched (the negative-first/positive-second rewrite inside that door keeps the unique
--     index satisfied at every statement of the swap).
--   * An invented cuisine taxonomy. §9: item `type` and the boolean classification flags
--     are nullable and extensible; a `jsonb attributes` bag absorbs anything else an outlet
--     wants per item. Nothing here hardcodes "North Indian / Italian".
--   * A trusted client scope. Every denormalized ancestor (organization_id / property_id /
--     outlet_id) is derived from the parent row inside the door, never taken from an
--     argument, and re-proved by app.assert_menu_chain() at the row level — the same drift
--     guard app.assert_org_chain() gives the hierarchy tables.
--
-- Scope cut, stated rather than hidden: this file is MENU ONLY. There are no order, table,
-- KOT, bill or payment tables here; those arrive in the next three items and use the tokens
-- 013 already seeded. A modifier group's max_selections is a STATIC fact enforced here; the
-- runtime rule "this order picked 3 toppings under a max of 2" is an ORDER-time check and
-- is deliberately left to the later order door — see the comment on `modifier_groups`.
--
-- Doors are one per write path, SECURITY DEFINER, `set search_path = ''`, p_reason where
-- sensitive, p_expected_version on updates, an app.audit row on every write. Reads go
-- through menu_snapshot / menu_item_current_price. `authenticated` has SELECT on these
-- tables (governed by outlet RLS, copied from 003's shape) and no DML — the doors are the
-- only way in. A cross-tenant probe of any id answers NIVAAS_NOT_FOUND, never a
-- 403-that-proves-existence (app.require_tenant_visibility, 011).

-- The row-level twin of app.assert_org_chain(): each menu table's denormalized
-- (organization_id, property_id, outlet_id) must equal the parent's, and the immediate
-- parent must itself be inside the scope it claims. Without this, a client-crafted ancestor
-- id could leak a row into another tenant — the invariant that makes the RLS predicate sound.
--
-- It is defined BEFORE the tables that attach it as a trigger: CREATE TRIGGER ... EXECUTE
-- FUNCTION needs the function to exist at attach time, while plpgsql resolves the table
-- references inside the body only when a trigger actually fires (by which point every menu
-- table below exists). Same lazy-body rule 000 relies on.
create or replace function app.assert_menu_chain()
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
  if TG_TABLE_NAME = 'menus' then
    select o.organization_id, o.property_id, o.id into v_org, v_prop, v_out
      from public.outlets o where o.id = new.outlet_id;
    if v_out is null then
      raise exception 'NIVAAS_SCOPE_MISMATCH: outlet % does not exist', new.outlet_id;
    end if;

  elsif TG_TABLE_NAME = 'menu_categories' then
    select m.organization_id, m.property_id, m.outlet_id into v_org, v_prop, v_out
      from public.menus m where m.id = new.menu_id;
    if v_out is null then
      raise exception 'NIVAAS_SCOPE_MISMATCH: menu % does not exist', new.menu_id;
    end if;

  elsif TG_TABLE_NAME = 'menu_items' then
    select m.organization_id, m.property_id, m.outlet_id into v_org, v_prop, v_out
      from public.menus m where m.id = new.menu_id;
    if v_out is null then
      raise exception 'NIVAAS_SCOPE_MISMATCH: menu % does not exist', new.menu_id;
    end if;
    -- A category, when set, must be one of the same menu.
    if new.category_id is not null then
      perform 1 from public.menu_categories c
        where c.id = new.category_id and c.menu_id = new.menu_id;
      if not found then
        raise exception 'NIVAAS_SCOPE_MISMATCH: category is not in this menu';
      end if;
    end if;

  elsif TG_TABLE_NAME = 'modifier_groups' then
    select i.organization_id, i.property_id, i.outlet_id into v_org, v_prop, v_out
      from public.menu_items i where i.id = new.menu_item_id;
    if v_out is null then
      raise exception 'NIVAAS_SCOPE_MISMATCH: menu item % does not exist', new.menu_item_id;
    end if;
    if new.menu_id is distinct from (select i.menu_id from public.menu_items i where i.id = new.menu_item_id) then
      raise exception 'NIVAAS_SCOPE_MISMATCH: group menu does not match its item menu';
    end if;

  elsif TG_TABLE_NAME = 'modifiers' then
    select g.organization_id, g.property_id, g.outlet_id into v_org, v_prop, v_out
      from public.modifier_groups g where g.id = new.group_id;
    if v_out is null then
      raise exception 'NIVAAS_SCOPE_MISMATCH: modifier group % does not exist', new.group_id;
    end if;
    if new.menu_item_id is distinct from (select g.menu_item_id from public.modifier_groups g where g.id = new.group_id) then
      raise exception 'NIVAAS_SCOPE_MISMATCH: modifier item does not match its group item';
    end if;
    if new.menu_id is distinct from (select g.menu_id from public.modifier_groups g where g.id = new.group_id) then
      raise exception 'NIVAAS_SCOPE_MISMATCH: modifier menu does not match its group menu';
    end if;

  elsif TG_TABLE_NAME = 'menu_item_prices' then
    select i.organization_id, i.property_id, i.outlet_id into v_org, v_prop, v_out
      from public.menu_items i where i.id = new.menu_item_id;
    if v_out is null then
      raise exception 'NIVAAS_SCOPE_MISMATCH: menu item % does not exist', new.menu_item_id;
    end if;
    if new.menu_id is distinct from (select i.menu_id from public.menu_items i where i.id = new.menu_item_id) then
      raise exception 'NIVAAS_SCOPE_MISMATCH: price menu does not match its item menu';
    end if;

  else
    raise exception 'NIVAAS_SCOPE_MISMATCH: unhandled menu table %', TG_TABLE_NAME;
  end if;

  -- Now the copied-ancestor columns must match what the parent actually says.
  if new.organization_id <> v_org or new.property_id <> v_prop or new.outlet_id <> v_out then
    raise exception 'NIVAAS_SCOPE_MISMATCH: denormalized tenant chain disagrees with the parent';
  end if;

  return new;
end;
$$;

-- ===================================================================== tables

-- ------------------------------------------------------------------- menus

-- A menu belongs to one outlet (§6). The tenant chain is carried so the RLS predicate is a
-- single column and a forgotten join cannot widen a tenant's view.
create table if not exists public.menus (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id     uuid not null references public.properties(id)  on delete restrict,
  outlet_id       uuid not null references public.outlets(id)     on delete restrict,
  name            text not null check (char_length(name) between 2 and 120),
  description     text,
  -- Lifecycle, distinct from every item's availability. A menu is unpublished (DRAFT)
  -- until someone with menu.publish makes it live.
  status          text not null default 'DRAFT'
                  check (status in ('DRAFT','ACTIVE','ARCHIVED')),
  currency        text not null check (app.is_valid_currency(currency)),
  effective_from  timestamptz,
  effective_to    timestamptz,
  archived_at     timestamptz,
  version         integer not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid,
  -- A menu that has an expiry must have a start, and they must be in order.
  constraint menus_effective_window_ok
    check (effective_to is null or effective_from is null or effective_to > effective_from)
);

comment on table public.menus is
  'One menu per outlet. Currency is fixed here and every price row must agree with it.';

-- A live menu name is unique per outlet; an archived one frees the name for reuse.
create unique index if not exists menus_live_name_idx
  on public.menus (outlet_id, name) where status <> 'ARCHIVED';
create index if not exists menus_outlet_idx on public.menus (outlet_id);
create index if not exists menus_org_status_idx on public.menus (organization_id, status);

drop trigger if exists menus_touch on public.menus;
create trigger menus_touch before update on public.menus
  for each row execute function app.touch_updated_at();

drop trigger if exists menus_chain on public.menus;
create trigger menus_chain before insert or update on public.menus
  for each row execute function app.assert_menu_chain();

-- -------------------------------------------------------- menu_categories

-- §8: ordered sections inside a menu. display_order is deterministic and unique among the
-- live categories of a menu — that uniqueness is the whole ordering guarantee.
create table if not exists public.menu_categories (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id     uuid not null references public.properties(id)  on delete restrict,
  outlet_id       uuid not null references public.outlets(id)     on delete restrict,
  menu_id         uuid not null references public.menus(id)       on delete restrict,
  name            text not null check (char_length(name) between 1 and 120),
  description     text,
  image_url       text,
  display_order   integer not null default 0,
  status          text not null default 'ACTIVE'
                  check (status in ('ACTIVE','ARCHIVED')),
  version         integer not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid
);

comment on column public.menu_categories.display_order is
  'Deterministic section order. Unique per menu across live rows; resequenced only via the reorder door.';

create unique index if not exists menu_categories_live_name_idx
  on public.menu_categories (menu_id, name) where status <> 'ARCHIVED';
create unique index if not exists menu_categories_live_order_idx
  on public.menu_categories (menu_id, display_order) where status <> 'ARCHIVED';
create index if not exists menu_categories_menu_idx on public.menu_categories (menu_id);

drop trigger if exists menu_categories_touch on public.menu_categories;
create trigger menu_categories_touch before update on public.menu_categories
  for each row execute function app.touch_updated_at();

drop trigger if exists menu_categories_chain on public.menu_categories;
create trigger menu_categories_chain before insert or update on public.menu_categories
  for each row execute function app.assert_menu_chain();

-- ------------------------------------------------------------- menu_items

-- §7/§9/§10/§11. NOTE the two deliberate divergences from the spec's literal field list:
--   * there is NO price column here — price lives in menu_item_prices (§13);
--   * availability is `is_available` (boolean), mirrored by a STORED generated
--     `availability_status` so the enum spelling cannot drift from the boolean.
create table if not exists public.menu_items (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete restrict,
  property_id        uuid not null references public.properties(id)  on delete restrict,
  outlet_id          uuid not null references public.outlets(id)     on delete restrict,
  menu_id            uuid not null references public.menus(id)       on delete restrict,
  category_id        uuid references public.menu_categories(id)      on delete restrict,
  name               text not null check (char_length(name) between 1 and 120),
  short_name         text,
  item_code          text check (item_code is null or char_length(item_code) between 1 and 40),
  description        text,
  image_url          text,
  -- Extensible, lowercase-slug classification. Deliberately NOT a fixed enum: no cuisine
  -- taxonomy is invented here (§9). NULL means "uncategorised", not "invalid".
  type               text check (type is null or type ~ '^[a-z][a-z0-9_]{0,39}$'),
  status             text not null default 'ACTIVE'
                     check (status in ('DRAFT','ACTIVE','ARCHIVED')),
  -- §10: operational availability, INDEPENDENT of status. Sold out tonight is not retired.
  is_available       boolean not null default true,
  availability_status text generated always as
                     (case when is_available then 'AVAILABLE' else 'UNAVAILABLE' end) stored,
  -- §9 nullable flags: present only when the outlet declares them; no forced taxonomy.
  is_vegetarian      boolean,
  is_non_vegetarian  boolean,
  is_egg             boolean,
  is_vegan           boolean,
  -- Anything genuinely outlet-specific lands here rather than in a new column every migration.
  attributes         jsonb not null default '{}'::jsonb
                     check (jsonb_typeof(attributes) = 'object'),
  -- Placeholder until the tax module: an opaque id with no foreign key, so no tax schema is
  -- implied this early. Nullable, and readable into the order-time snapshot untouched.
  tax_category_id    uuid,
  display_order      integer not null default 0,
  version            integer not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid
);

comment on column public.menu_items.availability_status is
  'Derived from is_available (STORED). One fact, two spellings, zero drift.';
comment on column public.menu_items.tax_category_id is
  'Opaque placeholder for the later tax module; intentionally not a foreign key.';

create unique index if not exists menu_items_live_name_idx
  on public.menu_items (menu_id, name) where status <> 'ARCHIVED';
create unique index if not exists menu_items_live_code_idx
  on public.menu_items (menu_id, item_code) where item_code is not null and status <> 'ARCHIVED';
create index if not exists menu_items_menu_idx on public.menu_items (menu_id);
create index if not exists menu_items_category_idx on public.menu_items (category_id);
-- The common operational read: what is currently sellable in a menu.
create index if not exists menu_items_available_idx on public.menu_items (menu_id, is_available)
  where status <> 'ARCHIVED';

drop trigger if exists menu_items_touch on public.menu_items;
create trigger menu_items_touch before update on public.menu_items
  for each row execute function app.touch_updated_at();

drop trigger if exists menu_items_chain on public.menu_items;
create trigger menu_items_chain before insert or update on public.menu_items
  for each row execute function app.assert_menu_chain();

-- --------------------------------------------------------- modifier_groups

-- §14/§15. An option group hangs off one item ("add-ons", "cook level", "size").
--
-- The CHECKs here enforce only the STATIC shape: min <= max, and SINGLE selection caps at
-- exactly one option. The RUNTIME rule — "this order chose 3 items but the group allows 2"
-- — is an order-time validation and belongs to the order door in a later work item; the row
-- level cannot see an order that does not exist yet. Said out loud so nobody later assumes
-- the constraint is missing when it is only in the wrong place.
create table if not exists public.modifier_groups (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  property_id      uuid not null references public.properties(id)  on delete restrict,
  outlet_id        uuid not null references public.outlets(id)     on delete restrict,
  menu_id          uuid not null references public.menus(id)       on delete restrict,
  menu_item_id     uuid not null references public.menu_items(id)  on delete restrict,
  name             text not null check (char_length(name) between 1 and 120),
  selection_type   text not null check (selection_type in ('SINGLE','MULTIPLE')),
  min_selections   integer not null default 0 check (min_selections >= 0),
  max_selections   integer not null check (max_selections >= 1),
  display_order    integer not null default 0,
  status           text not null default 'ACTIVE'
                   check (status in ('ACTIVE','ARCHIVED')),
  version          integer not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  -- min and max must be consistent with each other...
  constraint modifier_groups_range_ok check (min_selections <= max_selections),
  -- ...and a SINGLE-choice group can never allow more than one.
  constraint modifier_groups_single_max_one_ok
    check (selection_type = 'MULTIPLE' or max_selections = 1)
);

create unique index if not exists modifier_groups_live_name_idx
  on public.modifier_groups (menu_item_id, name) where status <> 'ARCHIVED';
create index if not exists modifier_groups_item_idx on public.modifier_groups (menu_item_id);
create index if not exists modifier_groups_menu_idx on public.modifier_groups (menu_id);

drop trigger if exists modifier_groups_touch on public.modifier_groups;
create trigger modifier_groups_touch before update on public.modifier_groups
  for each row execute function app.touch_updated_at();

drop trigger if exists modifier_groups_chain on public.modifier_groups;
create trigger modifier_groups_chain before insert or update on public.modifier_groups
  for each row execute function app.assert_menu_chain();

-- -------------------------------------------------------------- modifiers

-- §16. A single option inside a group. price_adjustment is a delta over the item's current
-- price, expressed in the owning MENU's currency (resolved via the item's price row at read
-- time), which is why there is deliberately no per-modifier currency column: an adjustment
-- in a different currency to its own item is a contradiction, never a legitimate value. The
-- magnitude is still money, so scale is enforced and a range bound stops nonsense.
create table if not exists public.modifiers (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete restrict,
  property_id       uuid not null references public.properties(id)  on delete restrict,
  outlet_id         uuid not null references public.outlets(id)     on delete restrict,
  menu_id           uuid not null references public.menus(id)       on delete restrict,
  menu_item_id      uuid not null references public.menu_items(id)  on delete restrict,
  group_id          uuid not null references public.modifier_groups(id) on delete restrict,
  name              text not null check (char_length(name) between 1 and 120),
  price_adjustment  numeric not null default 0,
  display_order     integer not null default 0,
  status            text not null default 'ACTIVE'
                    check (status in ('ACTIVE','ARCHIVED')),
  version           integer not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid,
  -- Explicit scale via the exact-input CHECK; a negative delta (a cheaper swap) is allowed.
  constraint modifiers_money_ok
    check (scale(trim_scale(price_adjustment)) <= 2
           and price_adjustment between -1000000000 and 1000000000)
);

create unique index if not exists modifiers_live_name_idx
  on public.modifiers (group_id, name) where status <> 'ARCHIVED';
create index if not exists modifiers_group_idx on public.modifiers (group_id);
create index if not exists modifiers_item_idx on public.modifiers (menu_item_id);

drop trigger if exists modifiers_touch on public.modifiers;
create trigger modifiers_touch before update on public.modifiers
  for each row execute function app.touch_updated_at();

drop trigger if exists modifiers_chain on public.modifiers;
create trigger modifiers_chain before insert or update on public.modifiers
  for each row execute function app.assert_menu_chain();

-- ------------------------------------------------------- menu_item_prices

-- §12/§13. Price HISTORY: one open (current) row per item plus closed rows, each carrying its
-- own effective window and currency. The current price resolves to the open row. There is no
-- mutable price on the item because a repriced item must not be able to restate past orders.
create table if not exists public.menu_item_prices (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id     uuid not null references public.properties(id)  on delete restrict,
  outlet_id       uuid not null references public.outlets(id)     on delete restrict,
  menu_id         uuid not null references public.menus(id)       on delete restrict,
  menu_item_id    uuid not null references public.menu_items(id)  on delete restrict,
  unit_price      numeric not null,
  currency        text not null check (app.is_valid_currency(currency)),
  effective_from  timestamptz not null default now(),
  effective_to    timestamptz,   -- NULL means this is the CURRENT open price
  source          text not null default 'MANUAL'
                  check (source in ('MANUAL','IMPORT','MIGRATION')),
  created_at      timestamptz not null default now(),
  created_by      uuid,
  -- Money scale enforced against the exact stored input (see the file header on why not
  -- numeric(p,s)), plus a sane magnitude bound.
  constraint menu_item_prices_money_ok
    check (scale(trim_scale(unit_price)) <= 2
           and unit_price >= 0 and unit_price < 1000000000000)
);

comment on table public.menu_item_prices is
  'Immutable price history. Exactly one row per item has effective_to IS NULL — that is the current price.';

-- The single guarantee that makes "the current price" well-defined.
create unique index if not exists menu_item_prices_open_idx
  on public.menu_item_prices (menu_item_id) where effective_to is null;
create index if not exists menu_item_prices_item_idx on public.menu_item_prices (menu_item_id);

drop trigger if exists menu_item_prices_chain on public.menu_item_prices;
create trigger menu_item_prices_chain before insert or update on public.menu_item_prices
  for each row execute function app.assert_menu_chain();

-- ===================================================================== chain

-- app.assert_menu_chain() is defined above, before the tables that attach it. Each of the six
-- menu tables carries a `<table>_chain` trigger running it on insert/update; the per-table
-- attach statements live with their CREATE TABLE blocks.

-- ======================================================================= rls

alter table public.menus              enable row level security;
alter table public.menu_categories    enable row level security;
alter table public.menu_items         enable row level security;
alter table public.modifier_groups    enable row level security;
alter table public.modifiers          enable row level security;
alter table public.menu_item_prices   enable row level security;

-- Read-only for the client role; the outlet predicate is the same helper the write doors
-- use, so a table can never be readable under a rule that diverged from its authorization.
grant select on public.menus, public.menu_categories, public.menu_items,
  public.modifier_groups, public.modifiers, public.menu_item_prices
  to authenticated, service_role;

revoke all on public.menus, public.menu_categories, public.menu_items,
  public.modifier_groups, public.modifiers, public.menu_item_prices
  from anon;

revoke insert, update, delete, truncate
  on public.menus, public.menu_categories, public.menu_items,
     public.modifier_groups, public.modifiers, public.menu_item_prices
  from authenticated;

drop policy if exists menus_outlet_read on public.menus;
create policy menus_outlet_read on public.menus
  for select to authenticated
  using (app.can_access_outlet(app.current_user_id(), outlet_id));

drop policy if exists menu_categories_outlet_read on public.menu_categories;
create policy menu_categories_outlet_read on public.menu_categories
  for select to authenticated
  using (app.can_access_outlet(app.current_user_id(), outlet_id));

drop policy if exists menu_items_outlet_read on public.menu_items;
create policy menu_items_outlet_read on public.menu_items
  for select to authenticated
  using (app.can_access_outlet(app.current_user_id(), outlet_id));

drop policy if exists modifier_groups_outlet_read on public.modifier_groups;
create policy modifier_groups_outlet_read on public.modifier_groups
  for select to authenticated
  using (app.can_access_outlet(app.current_user_id(), outlet_id));

drop policy if exists modifiers_outlet_read on public.modifiers;
create policy modifiers_outlet_read on public.modifiers
  for select to authenticated
  using (app.can_access_outlet(app.current_user_id(), outlet_id));

drop policy if exists menu_item_prices_outlet_read on public.menu_item_prices;
create policy menu_item_prices_outlet_read on public.menu_item_prices
  for select to authenticated
  using (app.can_access_outlet(app.current_user_id(), outlet_id));

-- ==================================================================== doors

-- ------------------------------------------------------------------ create_menu

create or replace function public.create_menu(
  p_outlet uuid,
  p_name text,
  p_currency text,
  p_description text default null,
  p_effective_from timestamptz default null,
  p_effective_to timestamptz default null
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
  v_id    uuid;
  v_after jsonb;
begin
  -- Derive the chain from the outlet, then prove the caller can see and write inside it.
  select o.organization_id, o.property_id, o.id into v_org, v_prop, v_out
    from public.outlets o where o.id = p_outlet;
  perform app.require_valid(v_out is not null, 'NIVAAS_NOT_FOUND');
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('menu.create', v_org, v_prop, v_out);
  perform app.require_writable_outlet(v_out);

  perform app.require_valid(p_name ~ '^.{2,120}$', 'NIVAAS_INVALID_NAME');
  perform app.require_valid(app.is_valid_currency(p_currency), 'NIVAAS_INVALID_CURRENCY');
  perform app.require_valid(
    p_effective_to is null or p_effective_from is null or p_effective_to > p_effective_from,
    'NIVAAS_INVALID_WINDOW');

  perform app.require_unique(
    exists (select 1 from public.menus m
             where m.outlet_id = v_out and m.name = p_name and m.status <> 'ARCHIVED'),
    'NIVAAS_MENU_TAKEN');

  begin
    insert into public.menus
      (organization_id, property_id, outlet_id, name, description, currency,
       effective_from, effective_to, created_by)
    values (v_org, v_prop, v_out, p_name, nullif(btrim(coalesce(p_description, '')), ''),
            p_currency, p_effective_from, p_effective_to, v_actor)
    returning id into v_id;
  exception when unique_violation then
    if sqlerrm like '%menus_live_name_idx%' then raise exception 'NIVAAS_MENU_TAKEN'; end if;
    raise;
  end;

  select to_jsonb(m) into v_after from public.menus m where m.id = v_id;
  perform app.audit('menu_created', 'menu', v_id,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out, p_after := v_after);
  return v_after;
end;
$$;

-- ---------------------------------------------------------------- set_menu_status

-- Publish (DRAFT→ACTIVE, and the reverse unpublish) is `menu.publish`; retiring a menu is
-- `menu.archive` with a mandatory reason. One door because they are one operator decision —
-- "what state is this menu in" — decided by who is asking for which transition.
create or replace function public.set_menu_status(
  p_menu uuid,
  p_status text,
  p_reason text default null
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
  v_action text;
begin
  perform app.require_valid(p_status in ('DRAFT','ACTIVE','ARCHIVED'), 'NIVAAS_INVALID_STATUS');

  select to_jsonb(m) into v_before from public.menus m where m.id = p_menu;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');
  v_org  := (v_before->>'organization_id')::uuid;
  v_prop := (v_before->>'property_id')::uuid;
  v_out  := (v_before->>'outlet_id')::uuid;
  perform app.require_tenant_visibility(v_org);

  if p_status = 'ARCHIVED' then
    perform app.require_permission('menu.archive', v_org, v_prop, v_out);
    perform app.require_reason(p_reason);
    v_action := 'menu_archived';
  else
    perform app.require_permission('menu.publish', v_org, v_prop, v_out);
    -- Publishing only into a trading outlet.
    if p_status = 'ACTIVE' then
      perform app.require_writable_outlet(v_out);
    end if;
    v_action := case p_status when 'ACTIVE' then 'menu_published' else 'menu_unpublished' end;
  end if;

  update public.menus set
    status      = p_status,
    archived_at = case when p_status = 'ARCHIVED' then now() end,
    version     = version + 1
  where id = p_menu;
  select to_jsonb(m) into v_after from public.menus m where m.id = p_menu;

  perform app.audit(v_action, 'menu', p_menu,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_before := v_before, p_after := v_after, p_reason := p_reason);
  return v_after;
end;
$$;

-- ------------------------------------------------------------ menu_categories

create or replace function public.create_menu_category(
  p_menu uuid,
  p_name text,
  p_description text default null,
  p_image_url text default null,
  p_display_order integer default 0
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
  v_id    uuid;
  v_after jsonb;
begin
  select m.organization_id, m.property_id, m.outlet_id into v_org, v_prop, v_out
    from public.menus m where m.id = p_menu;
  perform app.require_valid(v_org is not null, 'NIVAAS_NOT_FOUND');
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('menu.create', v_org, v_prop, v_out);
  perform app.require_writable_outlet(v_out);

  perform app.require_valid(p_name ~ '^.{1,120}$', 'NIVAAS_INVALID_NAME');
  perform app.require_unique(
    exists (select 1 from public.menu_categories c
             where c.menu_id = p_menu and c.name = p_name and c.status <> 'ARCHIVED'),
    'NIVAAS_CATEGORY_TAKEN');

  begin
    insert into public.menu_categories
      (organization_id, property_id, outlet_id, menu_id, name, description,
       image_url, display_order, created_by)
    values (v_org, v_prop, v_out, p_menu, p_name,
            nullif(btrim(coalesce(p_description, '')), ''),
            nullif(btrim(coalesce(p_image_url, '')), ''), p_display_order, v_actor)
    returning id into v_id;
  exception when unique_violation then
    if sqlerrm like '%menu_categories_live_name_idx%' then
      raise exception 'NIVAAS_CATEGORY_TAKEN';
    end if;
    if sqlerrm like '%menu_categories_live_order_idx%' then
      raise exception 'NIVAAS_ORDER_TAKEN';
    end if;
    raise;
  end;

  select to_jsonb(c) into v_after from public.menu_categories c where c.id = v_id;
  perform app.audit('menu_category_created', 'menu_category', v_id,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out, p_after := v_after);
  return v_after;
end;
$$;

create or replace function public.update_menu_category(
  p_category uuid,
  p_name text default null,
  p_description text default null,
  p_image_url text default null,
  p_display_order integer default null,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.require_session();
  v_before jsonb;
  v_after  jsonb;
  v_org    uuid;
  v_prop   uuid;
  v_out    uuid;
begin
  select to_jsonb(c) into v_before from public.menu_categories c where c.id = p_category;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');
  v_org  := (v_before->>'organization_id')::uuid;
  v_prop := (v_before->>'property_id')::uuid;
  v_out  := (v_before->>'outlet_id')::uuid;
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('menu.edit', v_org, v_prop, v_out);
  perform app.require_writable_outlet(v_out);
  perform app.require_version((v_before->>'version')::integer, p_expected_version);
  perform app.require_valid(v_before->>'status' <> 'ARCHIVED', 'NIVAAS_ARCHIVED');
  if p_name is not null then
    perform app.require_valid(p_name ~ '^.{1,120}$', 'NIVAAS_INVALID_NAME');
  end if;

  begin
    update public.menu_categories set
      name          = coalesce(p_name, name),
      description   = app.blankable(description, p_description),
      image_url     = app.blankable(image_url, p_image_url),
      display_order = coalesce(p_display_order, display_order),
      version       = version + 1
    where id = p_category;
  exception when unique_violation then
    if sqlerrm like '%menu_categories_live_name_idx%' then
      raise exception 'NIVAAS_CATEGORY_TAKEN';
    end if;
    if sqlerrm like '%menu_categories_live_order_idx%' then
      raise exception 'NIVAAS_ORDER_TAKEN';
    end if;
    raise;
  end;
  select to_jsonb(c) into v_after from public.menu_categories c where c.id = p_category;

  perform app.audit('menu_category_updated', 'menu_category', p_category,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_before := v_before, p_after := v_after);
  return v_after;
end;
$$;

-- §8: resequencing is a full-permutation operation, never a partial diff. The array must be
-- exactly the set of this menu's live categories (same members, no duplicates, none missing).
create or replace function public.reorder_menu_categories(
  p_menu uuid,
  p_category_ids uuid[]
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
  v_live  uuid[];
  v_after jsonb;
begin
  select m.organization_id, m.property_id, m.outlet_id into v_org, v_prop, v_out
    from public.menus m where m.id = p_menu;
  perform app.require_valid(v_org is not null, 'NIVAAS_NOT_FOUND');
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('menu.edit', v_org, v_prop, v_out);

  select coalesce(array_agg(c.id order by c.display_order), '{}'::uuid[]) into v_live
    from public.menu_categories c
   where c.menu_id = p_menu and c.status <> 'ARCHIVED';

  -- Proposed list equals the live set as a SET, and carries no duplicate.
  perform app.require_valid(
    coalesce(array_length(p_category_ids, 1), 0) > 0
    and array_length(p_category_ids, 1) = (select count(distinct x) from unnest(p_category_ids) x)
    and (select array_agg(x order by x) from unnest(p_category_ids) x)
        = (select array_agg(x order by x) from unnest(v_live) x),
    'NIVAAS_INVALID_REORDER');

  -- Two-phase rewrite so the partial unique (menu_id, display_order) is satisfied by every
  -- statement: first move every live category to a distinct negative, then to its final
  -- positive rank. A single pass could momentarily collide two swapped rows.
  update public.menu_categories mc
     set display_order = -t.ord
    from (select c.cid, c.ord from unnest(p_category_ids) with ordinality as c(cid, ord)) t
   where mc.id = t.cid and mc.menu_id = p_menu;

  update public.menu_categories mc
     set display_order = t.ord, version = mc.version + 1
    from (select c.cid, c.ord from unnest(p_category_ids) with ordinality as c(cid, ord)) t
   where mc.id = t.cid and mc.menu_id = p_menu;

  select jsonb_agg(jsonb_build_object('id', c.id, 'displayOrder', c.display_order)
                    order by c.display_order) into v_after
    from public.menu_categories c
   where c.menu_id = p_menu and c.status <> 'ARCHIVED';

  perform app.audit('menu_categories_reordered', 'menu', p_menu,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_after := jsonb_build_object('order', v_after));
  return jsonb_build_object('menuId', p_menu, 'order', v_after);
end;
$$;

create or replace function public.archive_menu_category(p_category uuid, p_reason text)
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
  perform app.require_reason(p_reason);
  select to_jsonb(c) into v_before from public.menu_categories c where c.id = p_category;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');
  v_org  := (v_before->>'organization_id')::uuid;
  v_prop := (v_before->>'property_id')::uuid;
  v_out  := (v_before->>'outlet_id')::uuid;
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('menu.archive', v_org, v_prop, v_out);

  -- Items keep their menu_id and simply lose their section; a category is archived, never
  -- deleted (§78), so an item that referenced it stays readable and becomes uncategorised.
  update public.menu_categories
     set status = 'ARCHIVED', version = version + 1
   where id = p_category;
  update public.menu_items set category_id = null, version = version + 1
   where category_id = p_category;
  select to_jsonb(c) into v_after from public.menu_categories c where c.id = p_category;

  perform app.audit('menu_category_archived', 'menu_category', p_category,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_before := v_before, p_after := v_after, p_reason := p_reason);
  return v_after;
end;
$$;

-- ----------------------------------------------------------------- menu_items

-- A new item must arrive with a current price, or nothing can be ordered from it. The price
-- is written into menu_item_prices in the same transaction, using the menu's own currency.
create or replace function public.create_menu_item(
  p_menu uuid,
  p_name text,
  p_unit_price numeric,
  p_category uuid default null,
  p_short_name text default null,
  p_item_code text default null,
  p_description text default null,
  p_image_url text default null,
  p_type text default null,
  p_display_order integer default 0,
  p_is_available boolean default true,
  p_is_vegetarian boolean default null,
  p_is_non_vegetarian boolean default null,
  p_is_egg boolean default null,
  p_is_vegan boolean default null,
  p_tax_category_id uuid default null,
  p_attributes jsonb default '{}'::jsonb
)
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
  v_currency text;
  v_id       uuid;
  v_after    jsonb;
begin
  select m.organization_id, m.property_id, m.outlet_id, m.currency
    into v_org, v_prop, v_out, v_currency
    from public.menus m where m.id = p_menu;
  perform app.require_valid(v_org is not null, 'NIVAAS_NOT_FOUND');
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('menu.create', v_org, v_prop, v_out);
  perform app.require_writable_outlet(v_out);

  perform app.require_valid(p_name ~ '^.{1,120}$', 'NIVAAS_INVALID_NAME');
  perform app.require_valid(p_type is null or p_type ~ '^[a-z][a-z0-9_]{0,39}$',
    'NIVAAS_INVALID_TYPE');
  perform app.require_valid(
    p_unit_price is not null
      and scale(trim_scale(p_unit_price)) <= 2
      and p_unit_price >= 0 and p_unit_price < 1000000000000,
    'NIVAAS_INVALID_MONEY');
  perform app.require_valid(coalesce(p_attributes, '{}'::jsonb) = '{}'::jsonb
      or jsonb_typeof(p_attributes) = 'object', 'NIVAAS_INVALID_ATTRIBUTES');
  if p_category is not null then
    perform app.require_valid(
      exists (select 1 from public.menu_categories c
               where c.id = p_category and c.menu_id = p_menu and c.status <> 'ARCHIVED'),
      'NIVAAS_CATEGORY_NOT_IN_MENU');
  end if;

  perform app.require_unique(
    exists (select 1 from public.menu_items i
             where i.menu_id = p_menu and i.name = p_name and i.status <> 'ARCHIVED'),
    'NIVAAS_ITEM_TAKEN');
  if p_item_code is not null then
    perform app.require_unique(
      exists (select 1 from public.menu_items i
               where i.menu_id = p_menu and i.item_code = p_item_code and i.status <> 'ARCHIVED'),
      'NIVAAS_ITEM_CODE_TAKEN');
  end if;

  begin
    insert into public.menu_items
      (organization_id, property_id, outlet_id, menu_id, category_id, name, short_name,
       item_code, description, image_url, type, is_available, is_vegetarian,
       is_non_vegetarian, is_egg, is_vegan, tax_category_id, attributes,
       display_order, created_by)
    values
      (v_org, v_prop, v_out, p_menu, p_category, p_name,
       nullif(btrim(coalesce(p_short_name, '')), ''), nullif(btrim(coalesce(p_item_code, '')), ''),
       nullif(btrim(coalesce(p_description, '')), ''), nullif(btrim(coalesce(p_image_url, '')), ''),
       p_type, coalesce(p_is_available, true), p_is_vegetarian, p_is_non_vegetarian, p_is_egg, p_is_vegan,
       p_tax_category_id, coalesce(p_attributes, '{}'::jsonb), p_display_order, v_actor)
    returning id into v_id;
  exception when unique_violation then
    if sqlerrm like '%menu_items_live_name_idx%' then raise exception 'NIVAAS_ITEM_TAKEN'; end if;
    if sqlerrm like '%menu_items_live_code_idx%' then raise exception 'NIVAAS_ITEM_CODE_TAKEN'; end if;
    raise;
  end;

  -- The initial price row. Currency is the menu's, never the caller's.
  insert into public.menu_item_prices
    (organization_id, property_id, outlet_id, menu_id, menu_item_id,
     unit_price, currency, source, created_by)
  values (v_org, v_prop, v_out, p_menu, v_id, p_unit_price, v_currency, 'MANUAL', v_actor);

  select to_jsonb(i) into v_after from public.menu_items i where i.id = v_id;
  perform app.audit('menu_item_created', 'menu_item', v_id,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_after := v_after,
    p_metadata := jsonb_build_object('initialPrice', p_unit_price, 'currency', v_currency));
  return v_after;
end;
$$;

-- Update never touches availability (its own door) and never touches price (its own door),
-- so a routine content edit cannot silently reprice or sell-out an item.
create or replace function public.update_menu_item(
  p_item uuid,
  p_name text default null,
  p_short_name text default null,
  p_item_code text default null,
  p_description text default null,
  p_image_url text default null,
  p_type text default null,
  p_category uuid default null,
  p_display_order integer default null,
  p_is_vegetarian boolean default null,
  p_is_non_vegetarian boolean default null,
  p_is_egg boolean default null,
  p_is_vegan boolean default null,
  p_tax_category_id uuid default null,
  p_attributes jsonb default null,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.require_session();
  v_before jsonb;
  v_after  jsonb;
  v_org    uuid;
  v_prop   uuid;
  v_out    uuid;
  v_menu   uuid;
begin
  select to_jsonb(i) into v_before from public.menu_items i where i.id = p_item;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');
  v_org  := (v_before->>'organization_id')::uuid;
  v_prop := (v_before->>'property_id')::uuid;
  v_out  := (v_before->>'outlet_id')::uuid;
  v_menu := (v_before->>'menu_id')::uuid;
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('menu.edit', v_org, v_prop, v_out);
  perform app.require_writable_outlet(v_out);
  perform app.require_version((v_before->>'version')::integer, p_expected_version);
  perform app.require_valid(v_before->>'status' <> 'ARCHIVED', 'NIVAAS_ARCHIVED');
  if p_name is not null then
    perform app.require_valid(p_name ~ '^.{1,120}$', 'NIVAAS_INVALID_NAME');
  end if;
  if p_type is not null then
    perform app.require_valid(p_type ~ '^[a-z][a-z0-9_]{0,39}$', 'NIVAAS_INVALID_TYPE');
  end if;
  if p_category is not null then
    perform app.require_valid(
      exists (select 1 from public.menu_categories c
               where c.id = p_category and c.menu_id = v_menu and c.status <> 'ARCHIVED'),
      'NIVAAS_CATEGORY_NOT_IN_MENU');
  end if;

  begin
    update public.menu_items set
      name              = coalesce(p_name, name),
      short_name        = app.blankable(short_name, p_short_name),
      item_code         = app.blankable(item_code, p_item_code),
      description       = app.blankable(description, p_description),
      image_url         = app.blankable(image_url, p_image_url),
      type              = coalesce(p_type, type),
      category_id       = coalesce(p_category, category_id),
      display_order     = coalesce(p_display_order, display_order),
      is_vegetarian     = coalesce(p_is_vegetarian, is_vegetarian),
      is_non_vegetarian = coalesce(p_is_non_vegetarian, is_non_vegetarian),
      is_egg            = coalesce(p_is_egg, is_egg),
      is_vegan          = coalesce(p_is_vegan, is_vegan),
      tax_category_id   = coalesce(p_tax_category_id, tax_category_id),
      attributes        = coalesce(p_attributes, attributes),
      version           = version + 1
    where id = p_item;
  exception when unique_violation then
    if sqlerrm like '%menu_items_live_name_idx%' then raise exception 'NIVAAS_ITEM_TAKEN'; end if;
    if sqlerrm like '%menu_items_live_code_idx%' then raise exception 'NIVAAS_ITEM_CODE_TAKEN'; end if;
    raise;
  end;
  select to_jsonb(i) into v_after from public.menu_items i where i.id = p_item;

  perform app.audit('menu_item_updated', 'menu_item', p_item,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_before := v_before, p_after := v_after);
  return v_after;
end;
$$;

-- §11: the fast operational action. Sold out / back in is a one-boolean flip with its own
-- audit verb, reachable by kitchen staff who cannot edit the item's content or its price.
create or replace function public.set_menu_item_availability(
  p_item uuid,
  p_available boolean,
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
  perform app.require_valid(p_available is not null, 'NIVAAS_EMPTY_SELECTION');

  select to_jsonb(i) into v_before from public.menu_items i where i.id = p_item;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');
  v_org  := (v_before->>'organization_id')::uuid;
  v_prop := (v_before->>'property_id')::uuid;
  v_out  := (v_before->>'outlet_id')::uuid;
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('menu.edit', v_org, v_prop, v_out);
  perform app.require_valid(v_before->>'status' <> 'ARCHIVED', 'NIVAAS_ARCHIVED');
  perform app.require_version((v_before->>'version')::integer, p_expected_version);

  -- ONLY is_available moves; `status` and price are untouched by this door.
  update public.menu_items
     set is_available = p_available, version = version + 1
   where id = p_item;
  select to_jsonb(i) into v_after from public.menu_items i where i.id = p_item;

  perform app.audit('menu_item_availability_changed', 'menu_item', p_item,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_before := jsonb_build_object('isAvailable', v_before->'is_available'),
    p_after := jsonb_build_object('isAvailable', p_available,
                                  'availabilityStatus', v_after->>'availability_status'));
  return v_after;
end;
$$;

create or replace function public.archive_menu_item(p_item uuid, p_reason text)
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
  perform app.require_reason(p_reason);
  select to_jsonb(i) into v_before from public.menu_items i where i.id = p_item;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');
  v_org  := (v_before->>'organization_id')::uuid;
  v_prop := (v_before->>'property_id')::uuid;
  v_out  := (v_before->>'outlet_id')::uuid;
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('menu.archive', v_org, v_prop, v_out);

  update public.menu_items
     set status = 'ARCHIVED', is_available = false, version = version + 1
   where id = p_item;
  -- The open price is closed so "current price" no longer resolves to a retired item.
  update public.menu_item_prices
     set effective_to = now()
   where menu_item_id = p_item and effective_to is null;
  select to_jsonb(i) into v_after from public.menu_items i where i.id = p_item;

  perform app.audit('menu_item_archived', 'menu_item', p_item,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_before := v_before, p_after := v_after, p_reason := p_reason);
  return v_after;
end;
$$;

-- ------------------------------------------------------------ repricing (§12/§13)

-- `menu.create`, not `menu.edit`: a price is a NEW immutable history row, and the kitchen
-- manager holds menu.edit (for availability) but must never reprice. Repricing a live item
-- is a money decision, so a reason is mandatory. Any open row is closed and a new one opened;
-- the partial unique index makes "two current prices" impossible even under concurrency.
create or replace function public.set_menu_item_price(
  p_item uuid,
  p_unit_price numeric,
  p_effective_from timestamptz default now(),
  p_reason text default null
)
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
  v_menu     uuid;
  v_currency text;
  v_price_id uuid;
  v_after    jsonb;
begin
  select i.organization_id, i.property_id, i.outlet_id, i.menu_id, m.currency
    into v_org, v_prop, v_out, v_menu, v_currency
    from public.menu_items i
    join public.menus m on m.id = i.menu_id
   where i.id = p_item;
  perform app.require_valid(v_org is not null, 'NIVAAS_NOT_FOUND');
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('menu.create', v_org, v_prop, v_out);
  perform app.require_writable_outlet(v_out);
  perform app.require_reason(p_reason);

  perform app.require_valid(
    p_unit_price is not null
      and scale(trim_scale(p_unit_price)) <= 2
      and p_unit_price >= 0 and p_unit_price < 1000000000000,
    'NIVAAS_INVALID_MONEY');

  -- Close the current open row, then open the new one. History is never overwritten.
  update public.menu_item_prices
     set effective_to = p_effective_from
   where menu_item_id = p_item and effective_to is null;

  begin
    insert into public.menu_item_prices
      (organization_id, property_id, outlet_id, menu_id, menu_item_id,
       unit_price, currency, effective_from, source, created_by)
    values (v_org, v_prop, v_out, v_menu, p_item, p_unit_price, v_currency,
            p_effective_from, 'MANUAL', v_actor)
    returning id into v_price_id;
  exception when unique_violation then
    if sqlerrm like '%menu_item_prices_open_idx%' then
      raise exception 'NIVAAS_PRICE_CONFLICT';
    end if;
    raise;
  end;

  select to_jsonb(pr) into v_after from public.menu_item_prices pr where pr.id = v_price_id;
  perform app.audit('menu_item_price_set', 'menu_item_price', v_price_id,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_after := v_after, p_reason := p_reason,
    p_metadata := jsonb_build_object('item', p_item));
  return v_after;
end;
$$;

-- ------------------------------------------------------------- modifier_groups

create or replace function public.create_modifier_group(
  p_item uuid,
  p_name text,
  p_selection_type text,
  p_min_selections integer default 0,
  p_max_selections integer default 1,
  p_display_order integer default 0
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
  v_menu  uuid;
  v_id    uuid;
  v_after jsonb;
begin
  select i.organization_id, i.property_id, i.outlet_id, i.menu_id
    into v_org, v_prop, v_out, v_menu
    from public.menu_items i where i.id = p_item;
  perform app.require_valid(v_org is not null, 'NIVAAS_NOT_FOUND');
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('menu.create', v_org, v_prop, v_out);
  perform app.require_writable_outlet(v_out);

  perform app.require_valid(p_name ~ '^.{1,120}$', 'NIVAAS_INVALID_NAME');
  perform app.require_valid(p_selection_type in ('SINGLE','MULTIPLE'), 'NIVAAS_INVALID_SELECTION_TYPE');
  -- The same static rules as the table CHECK, surfaced as a domain code rather than a
  -- constraint name (runtime order-time selection is out of scope here, see the table comment).
  perform app.require_valid(
    p_min_selections >= 0 and p_max_selections >= 1 and p_min_selections <= p_max_selections,
    'NIVAAS_INVALID_SELECTION_RANGE');
  perform app.require_valid(
    p_selection_type = 'MULTIPLE' or p_max_selections = 1,
    'NIVAAS_INVALID_SELECTION_RANGE');

  perform app.require_unique(
    exists (select 1 from public.modifier_groups g
             where g.menu_item_id = p_item and g.name = p_name and g.status <> 'ARCHIVED'),
    'NIVAAS_GROUP_TAKEN');

  begin
    insert into public.modifier_groups
      (organization_id, property_id, outlet_id, menu_id, menu_item_id, name,
       selection_type, min_selections, max_selections, display_order, created_by)
    values (v_org, v_prop, v_out, v_menu, p_item, p_name, p_selection_type,
            p_min_selections, p_max_selections, p_display_order, v_actor)
    returning id into v_id;
  exception when unique_violation then
    if sqlerrm like '%modifier_groups_live_name_idx%' then
      raise exception 'NIVAAS_GROUP_TAKEN';
    end if;
    raise;
  end;

  select to_jsonb(g) into v_after from public.modifier_groups g where g.id = v_id;
  perform app.audit('modifier_group_created', 'modifier_group', v_id,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out, p_after := v_after);
  return v_after;
end;
$$;

create or replace function public.update_modifier_group(
  p_group uuid,
  p_name text default null,
  p_selection_type text default null,
  p_min_selections integer default null,
  p_max_selections integer default null,
  p_display_order integer default null,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.require_session();
  v_before jsonb;
  v_after  jsonb;
  v_org    uuid;
  v_prop   uuid;
  v_out    uuid;
begin
  select to_jsonb(g) into v_before from public.modifier_groups g where g.id = p_group;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');
  v_org  := (v_before->>'organization_id')::uuid;
  v_prop := (v_before->>'property_id')::uuid;
  v_out  := (v_before->>'outlet_id')::uuid;
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('menu.edit', v_org, v_prop, v_out);
  perform app.require_writable_outlet(v_out);
  perform app.require_version((v_before->>'version')::integer, p_expected_version);
  perform app.require_valid(v_before->>'status' <> 'ARCHIVED', 'NIVAAS_ARCHIVED');

  -- Re-validate the STATIC shape against the merged (proposed or existing) values, so a
  -- partial edit cannot drive min above max or give a SINGLE group a max of three.
  perform app.require_valid(
    coalesce(p_selection_type, v_before->>'selection_type') in ('SINGLE','MULTIPLE'),
    'NIVAAS_INVALID_SELECTION_TYPE');
  perform app.require_valid(
    coalesce(p_min_selections, (v_before->>'min_selections')::integer) >= 0
    and coalesce(p_max_selections, (v_before->>'max_selections')::integer) >= 1
    and coalesce(p_min_selections, (v_before->>'min_selections')::integer)
        <= coalesce(p_max_selections, (v_before->>'max_selections')::integer),
    'NIVAAS_INVALID_SELECTION_RANGE');
  perform app.require_valid(
    coalesce(p_selection_type, v_before->>'selection_type') = 'MULTIPLE'
    or coalesce(p_max_selections, (v_before->>'max_selections')::integer) = 1,
    'NIVAAS_INVALID_SELECTION_RANGE');

  begin
    update public.modifier_groups set
      name           = coalesce(p_name, name),
      selection_type = coalesce(p_selection_type, selection_type),
      min_selections = coalesce(p_min_selections, min_selections),
      max_selections = coalesce(p_max_selections, max_selections),
      display_order  = coalesce(p_display_order, display_order),
      version        = version + 1
    where id = p_group;
  exception when unique_violation then
    if sqlerrm like '%modifier_groups_live_name_idx%' then
      raise exception 'NIVAAS_GROUP_TAKEN';
    end if;
    raise;
  end;
  select to_jsonb(g) into v_after from public.modifier_groups g where g.id = p_group;

  perform app.audit('modifier_group_updated', 'modifier_group', p_group,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_before := v_before, p_after := v_after);
  return v_after;
end;
$$;

create or replace function public.archive_modifier_group(p_group uuid, p_reason text)
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
  perform app.require_reason(p_reason);
  select to_jsonb(g) into v_before from public.modifier_groups g where g.id = p_group;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');
  v_org  := (v_before->>'organization_id')::uuid;
  v_prop := (v_before->>'property_id')::uuid;
  v_out  := (v_before->>'outlet_id')::uuid;
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('menu.archive', v_org, v_prop, v_out);

  update public.modifier_groups set status = 'ARCHIVED', version = version + 1
   where id = p_group;
  update public.modifiers set status = 'ARCHIVED', version = version + 1
   where group_id = p_group and status <> 'ARCHIVED';
  select to_jsonb(g) into v_after from public.modifier_groups g where g.id = p_group;

  perform app.audit('modifier_group_archived', 'modifier_group', p_group,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_before := v_before, p_after := v_after, p_reason := p_reason);
  return v_after;
end;
$$;

-- --------------------------------------------------------------------- modifiers

create or replace function public.create_modifier(
  p_group uuid,
  p_name text,
  p_price_adjustment numeric default 0,
  p_display_order integer default 0
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
  v_menu  uuid;
  v_item  uuid;
  v_id    uuid;
  v_after jsonb;
begin
  select g.organization_id, g.property_id, g.outlet_id, g.menu_id, g.menu_item_id
    into v_org, v_prop, v_out, v_menu, v_item
    from public.modifier_groups g where g.id = p_group;
  perform app.require_valid(v_org is not null, 'NIVAAS_NOT_FOUND');
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('menu.create', v_org, v_prop, v_out);
  perform app.require_writable_outlet(v_out);

  perform app.require_valid(p_name ~ '^.{1,120}$', 'NIVAAS_INVALID_NAME');
  -- Negative allowed (a cheaper option); a delta is still money, so scale and range apply.
  perform app.require_valid(
    p_price_adjustment is not null
      and scale(trim_scale(p_price_adjustment)) <= 2
      and p_price_adjustment between -1000000000 and 1000000000,
    'NIVAAS_INVALID_MONEY');

  perform app.require_unique(
    exists (select 1 from public.modifiers mo
             where mo.group_id = p_group and mo.name = p_name and mo.status <> 'ARCHIVED'),
    'NIVAAS_MODIFIER_TAKEN');

  begin
    insert into public.modifiers
      (organization_id, property_id, outlet_id, menu_id, menu_item_id, group_id,
       name, price_adjustment, display_order, created_by)
    values (v_org, v_prop, v_out, v_menu, v_item, p_group,
            p_name, p_price_adjustment, p_display_order, v_actor)
    returning id into v_id;
  exception when unique_violation then
    if sqlerrm like '%modifiers_live_name_idx%' then
      raise exception 'NIVAAS_MODIFIER_TAKEN';
    end if;
    raise;
  end;

  select to_jsonb(mo) into v_after from public.modifiers mo where mo.id = v_id;
  perform app.audit('modifier_created', 'modifier', v_id,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out, p_after := v_after);
  return v_after;
end;
$$;

create or replace function public.update_modifier(
  p_modifier uuid,
  p_name text default null,
  p_price_adjustment numeric default null,
  p_display_order integer default null,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.require_session();
  v_before jsonb;
  v_after  jsonb;
  v_org    uuid;
  v_prop   uuid;
  v_out    uuid;
begin
  select to_jsonb(mo) into v_before from public.modifiers mo where mo.id = p_modifier;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');
  v_org  := (v_before->>'organization_id')::uuid;
  v_prop := (v_before->>'property_id')::uuid;
  v_out  := (v_before->>'outlet_id')::uuid;
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('menu.edit', v_org, v_prop, v_out);
  perform app.require_writable_outlet(v_out);
  perform app.require_version((v_before->>'version')::integer, p_expected_version);
  perform app.require_valid(v_before->>'status' <> 'ARCHIVED', 'NIVAAS_ARCHIVED');
  if p_price_adjustment is not null then
    perform app.require_valid(
      scale(trim_scale(p_price_adjustment)) <= 2
        and p_price_adjustment between -1000000000 and 1000000000,
      'NIVAAS_INVALID_MONEY');
  end if;

  begin
    update public.modifiers set
      name             = coalesce(p_name, name),
      price_adjustment = coalesce(p_price_adjustment, price_adjustment),
      display_order    = coalesce(p_display_order, display_order),
      version          = version + 1
    where id = p_modifier;
  exception when unique_violation then
    if sqlerrm like '%modifiers_live_name_idx%' then
      raise exception 'NIVAAS_MODIFIER_TAKEN';
    end if;
    raise;
  end;
  select to_jsonb(mo) into v_after from public.modifiers mo where mo.id = p_modifier;

  perform app.audit('modifier_updated', 'modifier', p_modifier,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_before := v_before, p_after := v_after);
  return v_after;
end;
$$;

create or replace function public.archive_modifier(p_modifier uuid, p_reason text)
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
  perform app.require_reason(p_reason);
  select to_jsonb(mo) into v_before from public.modifiers mo where mo.id = p_modifier;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');
  v_org  := (v_before->>'organization_id')::uuid;
  v_prop := (v_before->>'property_id')::uuid;
  v_out  := (v_before->>'outlet_id')::uuid;
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('menu.archive', v_org, v_prop, v_out);

  update public.modifiers set status = 'ARCHIVED', version = version + 1
   where id = p_modifier;
  select to_jsonb(mo) into v_after from public.modifiers mo where mo.id = p_modifier;

  perform app.audit('modifier_archived', 'modifier', p_modifier,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_before := v_before, p_after := v_after, p_reason := p_reason);
  return v_after;
end;
$$;

-- ===================================================================== read

-- §17: the order-time snapshot shape. A stable SECURITY DEFINER read, gated by menu.view and
-- by tenant visibility (a foreign item id answers NIVAAS_NOT_FOUND, never existence). It
-- returns the exact fields an order line must freeze so a later menu edit cannot rewrite a
-- past order: name, code, the CURRENT unit price and currency, tax placeholder, the flags, and
-- every live modifier group with its options and adjustment amounts.
create or replace function public.menu_item_current_price(p_item uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.require_session();
  v_org   uuid;
  v_prop  uuid;
  v_out   uuid;
  v_row   jsonb;
begin
  select i.organization_id, i.property_id, i.outlet_id into v_org, v_prop, v_out
    from public.menu_items i where i.id = p_item;
  perform app.require_valid(v_org is not null, 'NIVAAS_NOT_FOUND');
  perform app.require_tenant_visibility(v_org);
  -- An item outside the caller's outlets is invisible, not merely denied — the same wall
  -- RLS puts on a direct SELECT, so the helper cannot see a row the table hides.
  perform app.require_valid(app.can_access_outlet(v_actor, v_out), 'NIVAAS_NOT_FOUND');
  -- The full chain, not the organization alone: `menu.view` is held at OUTLET scope by a
  -- restaurant/kitchen manager and at PROPERTY scope by a general manager, and has_permission
  -- only fires those grants when the matching property/outlet is named. Checking org-only
  -- would answer NIVAAS_ACCESS_DENIED to the very people the read path exists to serve.
  perform app.require_permission('menu.view', v_org, v_prop, v_out);

  select to_jsonb(pr) into v_row
    from public.menu_item_prices pr
   where pr.menu_item_id = p_item and pr.effective_to is null;
  return jsonb_build_object(
    'itemId', p_item,
    'unitPrice', (v_row->>'unit_price'),
    'currency', (v_row->>'currency'),
    'effectiveFrom', (v_row->>'effective_from'),
    'source', (v_row->>'source'));
end;
$$;

create or replace function public.menu_snapshot(p_item uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.require_session();
  v_org   uuid;
  v_prop  uuid;
  v_out   uuid;
  v_item  jsonb;
  v_price jsonb;
  v_groups jsonb;
begin
  select i.organization_id, i.property_id, i.outlet_id into v_org, v_prop, v_out
    from public.menu_items i where i.id = p_item;
  perform app.require_valid(v_org is not null, 'NIVAAS_NOT_FOUND');
  perform app.require_tenant_visibility(v_org);
  -- Outside the caller's outlets the item does not exist (mirrors the RLS read policy), so a
  -- cross-outlet probe cannot enumerate ids even inside its own tenant.
  perform app.require_valid(app.can_access_outlet(v_actor, v_out), 'NIVAAS_NOT_FOUND');
  -- Checked at the item's own property/outlet: restaurant and kitchen managers hold
  -- `menu.view` at OUTLET scope and general managers at PROPERTY scope, and those grants
  -- resolve only when the location is named. An organization-only check denies them.
  perform app.require_permission('menu.view', v_org, v_prop, v_out);

  select to_jsonb(i) into v_item from public.menu_items i where i.id = p_item;
  select to_jsonb(pr) into v_price
    from public.menu_item_prices pr
   where pr.menu_item_id = p_item and pr.effective_to is null;

  select jsonb_agg(jsonb_build_object(
           'groupId', g.id, 'name', g.name, 'selectionType', g.selection_type,
           'minSelections', g.min_selections, 'maxSelections', g.max_selections,
           'modifiers', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'modifierId', m.id, 'name', m.name,
                      'priceAdjustment', m.price_adjustment)
                    order by m.display_order, m.name)
               from public.modifiers m
              where m.group_id = g.id and m.status <> 'ARCHIVED'), '[]'::jsonb)
         ) order by g.display_order, g.name)
    into v_groups
    from public.modifier_groups g
   where g.menu_item_id = p_item and g.status <> 'ARCHIVED';

  return jsonb_build_object(
    'itemId',           v_item->>'id',
    'itemName',         v_item->>'name',
    'shortName',        v_item->>'short_name',
    'itemCode',         v_item->>'item_code',
    'type',             v_item->>'type',
    'unitPrice',        v_price->>'unit_price',
    'currency',         v_price->>'currency',
    'taxCategoryId',    v_item->>'tax_category_id',
    'isAvailable',      (v_item->>'is_available')::boolean,
    'availabilityStatus', v_item->>'availability_status',
    'itemStatus',       v_item->>'status',
    'flags', jsonb_build_object(
      'vegetarian',     (v_item->>'is_vegetarian')::boolean,
      'nonVegetarian',  (v_item->>'is_non_vegetarian')::boolean,
      'egg',            (v_item->>'is_egg')::boolean,
      'vegan',          (v_item->>'is_vegan')::boolean),
    'attributes',       (v_item->'attributes'),
    'modifierGroups',   coalesce(v_groups, '[]'::jsonb));
end;
$$;

-- ==================================================================== grants

-- Catalog-resolved (name only, signatures derived from pg_proc) so a future parameter added
-- to a door cannot desync an ACL list. A listed name with no function behind it aborts the
-- apply — the only allowed direction of drift is an intentional new door.
do $$
declare
  v_name text;
  v_oid  oid;
  v_oids oid[];
begin
  foreach v_name in array array[
    'create_menu', 'set_menu_status',
    'create_menu_category', 'update_menu_category', 'reorder_menu_categories',
    'archive_menu_category',
    'create_menu_item', 'update_menu_item', 'set_menu_item_availability',
    'archive_menu_item', 'set_menu_item_price',
    'create_modifier_group', 'update_modifier_group', 'archive_modifier_group',
    'create_modifier', 'update_modifier', 'archive_modifier',
    'menu_snapshot', 'menu_item_current_price'
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
-- half-applied 014 must fail loudly the way 006 and 012 do.
do $$
begin
  -- Both ordering/history walls are real indexes, not comments.
  perform app.require_valid(
    exists (select 1 from pg_class where relname = 'menu_categories_live_order_idx'),
    'NIVAAS_MIGRATION_GAP');
  perform app.require_valid(
    exists (select 1 from pg_class where relname = 'menu_item_prices_open_idx'),
    'NIVAAS_MIGRATION_GAP');
  -- Money columns are unconstrained numeric guarded by a scale CHECK, never a rounding
  -- numeric(p,s). (012's lesson: assert the wall exists, do not trust the intent.)
  perform app.require_valid(
    not exists (select 1 from pg_attribute a join pg_class c on c.oid = a.attrelid
                 where c.relnamespace = 'public'::regnamespace
                   and c.relname in ('menu_item_prices', 'modifiers')
                   and a.atttypid = 'numeric'::regtype and a.atttypmod <> -1),
    'NIVAAS_MIGRATION_GAP');
  -- The chain guard is attached to every tenant-carrying menu table.
  perform app.require_valid(
    (select count(distinct tgname) from pg_trigger
      where tgname in ('menus_chain','menu_categories_chain','menu_items_chain',
                       'modifier_groups_chain','modifiers_chain','menu_item_prices_chain')) = 6,
    'NIVAAS_MIGRATION_GAP');
end;
$$;
