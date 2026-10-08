-- AMRUT NIVAAS · 032 — hotel PMS permission tokens (Prompt #08 §53)
--
-- Hotel domain: room types, rooms, reservations, front office, stays, folios,
-- payments, guests, availability, housekeeping status. Tokens arrive before code.
--
-- Role matrix:
--   ORG_OWNER / ORG_ADMIN — full hotel reach including rate overrides and folio adjustments
--   GENERAL_MANAGER / PROPERTY_MANAGER — operations, check-in/out, folio charges
--   RESTAURANT_MANAGER — read-only reservations, guest view (for charge-to-room)
--   STORE_MANAGER — read-only rooms and reservations
--   STAFF — minimal: guest view, reservation view

do $$
declare
  v_tokens text[] := array[
    -- Hotel overview
    'hotel.view',

    -- Room types
    'room_type.view', 'room_type.create', 'room_type.edit', 'room_type.archive',

    -- Rooms
    'room.view', 'room.create', 'room.edit', 'room.archive', 'room.block',

    -- Reservations
    'reservation.view', 'reservation.create', 'reservation.edit',
    'reservation.confirm', 'reservation.cancel', 'reservation.no_show',
    'reservation.modify_rate', 'reservation.assign_room',

    -- Front office
    'frontoffice.view', 'frontoffice.checkin', 'frontoffice.checkout',
    'frontoffice.room_move',

    -- Stays
    'stay.view', 'stay.create', 'stay.modify',

    -- Folios
    'folio.view', 'folio.charge', 'folio.adjust', 'folio.discount', 'folio.settle',

    -- Hotel payments
    'hotel_payment.view', 'hotel_payment.create', 'hotel_payment.refund',

    -- Guests
    'guest.view', 'guest.create', 'guest.edit', 'guest.view_sensitive',

    -- Availability
    'room_availability.view', 'room_availability.override',

    -- Housekeeping status (foundation only — full module is Prompt #09)
    'housekeeping_status.view', 'housekeeping_status.update'
  ];
begin
  perform app.require_valid(array_length(v_tokens, 1) = 41, 'NIVAAS_PERMISSION_SEED_BROKEN');
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
      'hotel.view',
      'room_type.view', 'room_type.create', 'room_type.edit', 'room_type.archive',
      'room.view', 'room.create', 'room.edit', 'room.archive', 'room.block',
      'reservation.view', 'reservation.create', 'reservation.edit',
      'reservation.confirm', 'reservation.cancel', 'reservation.no_show',
      'reservation.modify_rate', 'reservation.assign_room',
      'frontoffice.view', 'frontoffice.checkin', 'frontoffice.checkout',
      'frontoffice.room_move',
      'stay.view', 'stay.create', 'stay.modify',
      'folio.view', 'folio.charge', 'folio.adjust', 'folio.discount', 'folio.settle',
      'hotel_payment.view', 'hotel_payment.create', 'hotel_payment.refund',
      'guest.view', 'guest.create', 'guest.edit', 'guest.view_sensitive',
      'room_availability.view', 'room_availability.override',
      'housekeeping_status.view', 'housekeeping_status.update'
    );

with role_permission_matrix(role_name, permission) as (
  values
    -- Owner: full hotel reach
    ('ORG_OWNER', 'hotel.view'),
    ('ORG_OWNER', 'room_type.view'), ('ORG_OWNER', 'room_type.create'),
    ('ORG_OWNER', 'room_type.edit'), ('ORG_OWNER', 'room_type.archive'),
    ('ORG_OWNER', 'room.view'), ('ORG_OWNER', 'room.create'),
    ('ORG_OWNER', 'room.edit'), ('ORG_OWNER', 'room.archive'), ('ORG_OWNER', 'room.block'),
    ('ORG_OWNER', 'reservation.view'), ('ORG_OWNER', 'reservation.create'),
    ('ORG_OWNER', 'reservation.edit'), ('ORG_OWNER', 'reservation.confirm'),
    ('ORG_OWNER', 'reservation.cancel'), ('ORG_OWNER', 'reservation.no_show'),
    ('ORG_OWNER', 'reservation.modify_rate'), ('ORG_OWNER', 'reservation.assign_room'),
    ('ORG_OWNER', 'frontoffice.view'), ('ORG_OWNER', 'frontoffice.checkin'),
    ('ORG_OWNER', 'frontoffice.checkout'), ('ORG_OWNER', 'frontoffice.room_move'),
    ('ORG_OWNER', 'stay.view'), ('ORG_OWNER', 'stay.create'), ('ORG_OWNER', 'stay.modify'),
    ('ORG_OWNER', 'folio.view'), ('ORG_OWNER', 'folio.charge'),
    ('ORG_OWNER', 'folio.adjust'), ('ORG_OWNER', 'folio.discount'), ('ORG_OWNER', 'folio.settle'),
    ('ORG_OWNER', 'hotel_payment.view'), ('ORG_OWNER', 'hotel_payment.create'),
    ('ORG_OWNER', 'hotel_payment.refund'),
    ('ORG_OWNER', 'guest.view'), ('ORG_OWNER', 'guest.create'),
    ('ORG_OWNER', 'guest.edit'), ('ORG_OWNER', 'guest.view_sensitive'),
    ('ORG_OWNER', 'room_availability.view'), ('ORG_OWNER', 'room_availability.override'),
    ('ORG_OWNER', 'housekeeping_status.view'), ('ORG_OWNER', 'housekeeping_status.update'),

    -- Admin: same as owner for hotel
    ('ORG_ADMIN', 'hotel.view'),
    ('ORG_ADMIN', 'room_type.view'), ('ORG_ADMIN', 'room_type.create'),
    ('ORG_ADMIN', 'room_type.edit'), ('ORG_ADMIN', 'room_type.archive'),
    ('ORG_ADMIN', 'room.view'), ('ORG_ADMIN', 'room.create'),
    ('ORG_ADMIN', 'room.edit'), ('ORG_ADMIN', 'room.archive'), ('ORG_ADMIN', 'room.block'),
    ('ORG_ADMIN', 'reservation.view'), ('ORG_ADMIN', 'reservation.create'),
    ('ORG_ADMIN', 'reservation.edit'), ('ORG_ADMIN', 'reservation.confirm'),
    ('ORG_ADMIN', 'reservation.cancel'), ('ORG_ADMIN', 'reservation.no_show'),
    ('ORG_ADMIN', 'reservation.modify_rate'), ('ORG_ADMIN', 'reservation.assign_room'),
    ('ORG_ADMIN', 'frontoffice.view'), ('ORG_ADMIN', 'frontoffice.checkin'),
    ('ORG_ADMIN', 'frontoffice.checkout'), ('ORG_ADMIN', 'frontoffice.room_move'),
    ('ORG_ADMIN', 'stay.view'), ('ORG_ADMIN', 'stay.create'), ('ORG_ADMIN', 'stay.modify'),
    ('ORG_ADMIN', 'folio.view'), ('ORG_ADMIN', 'folio.charge'),
    ('ORG_ADMIN', 'folio.adjust'), ('ORG_ADMIN', 'folio.discount'), ('ORG_ADMIN', 'folio.settle'),
    ('ORG_ADMIN', 'hotel_payment.view'), ('ORG_ADMIN', 'hotel_payment.create'),
    ('ORG_ADMIN', 'hotel_payment.refund'),
    ('ORG_ADMIN', 'guest.view'), ('ORG_ADMIN', 'guest.create'),
    ('ORG_ADMIN', 'guest.edit'), ('ORG_ADMIN', 'guest.view_sensitive'),
    ('ORG_ADMIN', 'room_availability.view'), ('ORG_ADMIN', 'room_availability.override'),
    ('ORG_ADMIN', 'housekeeping_status.view'), ('ORG_ADMIN', 'housekeeping_status.update'),

    -- General Manager: operations but not rate override
    ('GENERAL_MANAGER', 'hotel.view'),
    ('GENERAL_MANAGER', 'room_type.view'), ('GENERAL_MANAGER', 'room_type.create'),
    ('GENERAL_MANAGER', 'room_type.edit'),
    ('GENERAL_MANAGER', 'room.view'), ('GENERAL_MANAGER', 'room.create'),
    ('GENERAL_MANAGER', 'room.edit'), ('GENERAL_MANAGER', 'room.block'),
    ('GENERAL_MANAGER', 'reservation.view'), ('GENERAL_MANAGER', 'reservation.create'),
    ('GENERAL_MANAGER', 'reservation.edit'), ('GENERAL_MANAGER', 'reservation.confirm'),
    ('GENERAL_MANAGER', 'reservation.cancel'), ('GENERAL_MANAGER', 'reservation.no_show'),
    ('GENERAL_MANAGER', 'reservation.assign_room'),
    ('GENERAL_MANAGER', 'frontoffice.view'), ('GENERAL_MANAGER', 'frontoffice.checkin'),
    ('GENERAL_MANAGER', 'frontoffice.checkout'), ('GENERAL_MANAGER', 'frontoffice.room_move'),
    ('GENERAL_MANAGER', 'stay.view'), ('GENERAL_MANAGER', 'stay.create'), ('GENERAL_MANAGER', 'stay.modify'),
    ('GENERAL_MANAGER', 'folio.view'), ('GENERAL_MANAGER', 'folio.charge'),
    ('GENERAL_MANAGER', 'folio.adjust'), ('GENERAL_MANAGER', 'folio.discount'), ('GENERAL_MANAGER', 'folio.settle'),
    ('GENERAL_MANAGER', 'hotel_payment.view'), ('GENERAL_MANAGER', 'hotel_payment.create'),
    ('GENERAL_MANAGER', 'hotel_payment.refund'),
    ('GENERAL_MANAGER', 'guest.view'), ('GENERAL_MANAGER', 'guest.create'), ('GENERAL_MANAGER', 'guest.edit'),
    ('GENERAL_MANAGER', 'room_availability.view'),
    ('GENERAL_MANAGER', 'housekeeping_status.view'), ('GENERAL_MANAGER', 'housekeeping_status.update'),

    -- Property Manager: same as GM for hotel operations
    ('PROPERTY_MANAGER', 'hotel.view'),
    ('PROPERTY_MANAGER', 'room_type.view'), ('PROPERTY_MANAGER', 'room_type.create'),
    ('PROPERTY_MANAGER', 'room_type.edit'),
    ('PROPERTY_MANAGER', 'room.view'), ('PROPERTY_MANAGER', 'room.create'),
    ('PROPERTY_MANAGER', 'room.edit'), ('PROPERTY_MANAGER', 'room.block'),
    ('PROPERTY_MANAGER', 'reservation.view'), ('PROPERTY_MANAGER', 'reservation.create'),
    ('PROPERTY_MANAGER', 'reservation.edit'), ('PROPERTY_MANAGER', 'reservation.confirm'),
    ('PROPERTY_MANAGER', 'reservation.cancel'), ('PROPERTY_MANAGER', 'reservation.no_show'),
    ('PROPERTY_MANAGER', 'reservation.assign_room'),
    ('PROPERTY_MANAGER', 'frontoffice.view'), ('PROPERTY_MANAGER', 'frontoffice.checkin'),
    ('PROPERTY_MANAGER', 'frontoffice.checkout'), ('PROPERTY_MANAGER', 'frontoffice.room_move'),
    ('PROPERTY_MANAGER', 'stay.view'), ('PROPERTY_MANAGER', 'stay.create'), ('PROPERTY_MANAGER', 'stay.modify'),
    ('PROPERTY_MANAGER', 'folio.view'), ('PROPERTY_MANAGER', 'folio.charge'),
    ('PROPERTY_MANAGER', 'folio.adjust'), ('PROPERTY_MANAGER', 'folio.discount'), ('PROPERTY_MANAGER', 'folio.settle'),
    ('PROPERTY_MANAGER', 'hotel_payment.view'), ('PROPERTY_MANAGER', 'hotel_payment.create'),
    ('PROPERTY_MANAGER', 'guest.view'), ('PROPERTY_MANAGER', 'guest.create'), ('PROPERTY_MANAGER', 'guest.edit'),
    ('PROPERTY_MANAGER', 'room_availability.view'),
    ('PROPERTY_MANAGER', 'housekeeping_status.view'), ('PROPERTY_MANAGER', 'housekeeping_status.update'),

    -- Restaurant Manager: read-only reservations + guest view (for charge-to-room)
    ('RESTAURANT_MANAGER', 'hotel.view'),
    ('RESTAURANT_MANAGER', 'room.view'),
    ('RESTAURANT_MANAGER', 'reservation.view'),
    ('RESTAURANT_MANAGER', 'guest.view'), ('RESTAURANT_MANAGER', 'guest.create'),
    ('RESTAURANT_MANAGER', 'room_availability.view'),

    -- Store Manager: read-only rooms and reservations
    ('STORE_MANAGER', 'hotel.view'),
    ('STORE_MANAGER', 'room.view'),
    ('STORE_MANAGER', 'reservation.view'),
    ('STORE_MANAGER', 'room_availability.view'),

    -- Staff: minimal
    ('STAFF', 'hotel.view'),
    ('STAFF', 'room.view'),
    ('STAFF', 'reservation.view'),
    ('STAFF', 'guest.view')
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
    'hotel.view',
    'room_type.view', 'room_type.create', 'room_type.edit', 'room_type.archive',
    'room.view', 'room.create', 'room.edit', 'room.archive', 'room.block',
    'reservation.view', 'reservation.create', 'reservation.edit',
    'reservation.confirm', 'reservation.cancel', 'reservation.no_show',
    'reservation.modify_rate', 'reservation.assign_room',
    'frontoffice.view', 'frontoffice.checkin', 'frontoffice.checkout',
    'frontoffice.room_move',
    'stay.view', 'stay.create', 'stay.modify',
    'folio.view', 'folio.charge', 'folio.adjust', 'folio.discount', 'folio.settle',
    'hotel_payment.view', 'hotel_payment.create', 'hotel_payment.refund',
    'guest.view', 'guest.create', 'guest.edit', 'guest.view_sensitive',
    'room_availability.view', 'room_availability.override',
    'housekeeping_status.view', 'housekeeping_status.update'
  );
  -- ORG_OWNER=41, ORG_ADMIN=41, GENERAL_MANAGER=36, PROPERTY_MANAGER=35,
  -- RESTAURANT_MANAGER=6, STORE_MANAGER=4, STAFF=4 → 167 total
  perform app.require_valid(v_count = 167,
    'NIVAAS_PERMISSION_COUNT: expected 167 hotel grants, got ' || v_count);
end;
$$;
