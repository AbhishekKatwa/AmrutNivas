-- 051 — Seed inventory master data: units of measure, categories, default locations.
--
-- Fixes UI-0030 (unit + category dropdowns empty) and UI-0031 (GRN location
-- dropdown empty): the procurement forms bind uom/location to units_of_measure,
-- inventory_categories and inventory_locations rows, which no organization had.
--
-- Idempotent at (organization, code) granularity: rows already present (any
-- status) are skipped, so re-running adds nothing and never violates the
-- partial unique indexes on lower(code) where status = 'ACTIVE'.
--
-- Locations are tagged per outlet because listLocations() filters
-- outlet_id = context outlet; one 'Main Store' is also created for properties
-- with no outlets (outlet_id null) so outlet-less contexts still resolve one.

-- ============================================================ units of measure

insert into public.units_of_measure (organization_id, name, code, description)
select o.id, u.name, u.code, u.description
from public.organizations o
cross join (values
  ('Kilogram',   'KG',  'Weight — kilogram'),
  ('Gram',       'GM',  'Weight — gram'),
  ('Litre',      'L',   'Volume — litre'),
  ('Millilitre', 'ML',  'Volume — millilitre'),
  ('Piece',      'PC',  'Count — individual piece'),
  ('Dozen',      'DZ',  'Count — dozen (12 pieces)'),
  ('Bottle',     'BTL', 'Container — bottle'),
  ('Can',        'CAN', 'Container — can'),
  ('Packet',     'PKT', 'Container — packet'),
  ('Box',        'BOX', 'Container — box'),
  ('Bag',        'BAG', 'Container — bag'),
  ('Crate',      'CRT', 'Container — crate')
) as u(name, code, description)
where not exists (
  select 1 from public.units_of_measure existing
  where existing.organization_id = o.id
    and lower(existing.code) = lower(u.code)
);

-- ============================================================ inventory categories

insert into public.inventory_categories (organization_id, name, code, display_order, description)
select o.id, c.name, c.code, c.display_order, c.description
from public.organizations o
cross join (values
  ('Vegetables & Fruits',  'VEG',    1,  'Fresh produce'),
  ('Dairy & Eggs',         'DAIRY',  2,  'Milk, cheese, butter, eggs'),
  ('Meat & Poultry',       'MEAT',   3,  'Fresh and frozen meat, chicken'),
  ('Seafood',              'SEA',    4,  'Fish and shellfish'),
  ('Dry Goods & Grains',   'DRY',    5,  'Flour, rice, pulses, cereals'),
  ('Spices & Masala',      'SPICE',  6,  'Whole and ground spices'),
  ('Beverages',            'BEV',    7,  'Tea, coffee, juices, soft drinks'),
  ('Bakery',               'BAKERY', 8,  'Bread, buns, baked goods'),
  ('Oils & Fats',          'OIL',    9,  'Cooking oils, ghee, fats'),
  ('Packaging',            'PACK',   10, 'Boxes, wraps, disposables'),
  ('Cleaning Supplies',    'CLEAN',  11, 'Detergents, sanitizers'),
  ('Other',                'OTHER',  12, 'Miscellaneous items')
) as c(name, code, display_order, description)
where not exists (
  select 1 from public.inventory_categories existing
  where existing.organization_id = o.id
    and lower(existing.code) = lower(c.code)
);

-- ============================================================ default locations

-- One store per outlet (the GRN flow selects locations scoped to the context outlet).
insert into public.inventory_locations
  (organization_id, property_id, outlet_id, name, code, location_type, description)
select ot.organization_id, ot.property_id, ot.id,
       'Main Store', 'ST-' || ot.code, 'STORE',
       'Default storage location for ' || ot.name
from public.outlets ot
where not exists (
  select 1 from public.inventory_locations existing
  where existing.organization_id = ot.organization_id
    and existing.property_id = ot.property_id
    and lower(existing.code) = lower('ST-' || ot.code)
);

-- Fallback for properties with no outlets (outlet-less contexts).
insert into public.inventory_locations
  (organization_id, property_id, outlet_id, name, code, location_type, description)
select p.organization_id, p.id, null,
       'Main Store', 'ST-MAIN', 'STORE',
       'Default storage location for ' || p.name
from public.properties p
where not exists (select 1 from public.outlets ot where ot.property_id = p.id)
  and not exists (
    select 1 from public.inventory_locations existing
    where existing.organization_id = p.organization_id
      and existing.property_id = p.id
      and lower(existing.code) = 'st-main'
  );
