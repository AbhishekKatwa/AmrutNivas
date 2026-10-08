# Hotel PMS build contract

Binding conventions for the Hotel domain (Prompt #08). Every migration, service and screen in this domain follows these, so four work items do not produce four dialects of the same model. Where this file and an existing migration disagree, the existing migration wins and this file is corrected.

## 1. Hotel is property-scoped, not outlet-scoped

A hotel is a `properties` row of type `HOTEL` (or `RESORT`, `MOTEL`, …) from Prompt #02. There is no `HotelBusiness` entity. Everything hotel-scoped hangs off `property_id` with its `organization_id` ancestor denormalized, as everywhere else in this schema. The restaurant domain uses `outlet_id`; the hotel domain uses `property_id`. A hotel has no outlets — a property is the hotel.

## 2. Room types are categories, rooms are instances

A `room_types` row is a category of room (Deluxe, Suite, Standard) with default rate and capacity. A `rooms` row is a specific physical room (Room 101, Room 202) that points at a room type and inherits its default rate. Room types are master data; rooms are operational data. A room type can have many rooms; a room points at exactly one room type. Both are property-scoped.

## 3. Room status is two orthogonal facts

A room has two independent status dimensions:
- **Operational status** (`ACTIVE`, `OUT_OF_ORDER`, `OUT_OF_SERVICE`, `BLOCKED`): is this room available for sale?
- **Housekeeping status** (`VACANT_CLEAN`, `VACANT_DIRTY`, `OCCUPIED_CLEAN`, `OCCUPIED_DIRTY`, `INSPECTED`): what is the physical state of this room?

A room can be `ACTIVE` + `VACANT_DIRTY` (available for sale but needs cleaning) or `OUT_OF_ORDER` + `VACANT_CLEAN` (clean but broken). The two statuses are set by separate doors and have separate permission keys (`room.operational_status` vs `room.housekeeping_status`). Prompt #09 (Housekeeping) owns the housekeeping workflow; Prompt #08 owns the operational status.

## 4. Guests are organization-scoped, not property-scoped

A `guests` row is a person who has stayed or may stay at any property in the organization. A guest is not tied to one property — a guest who stayed at Property A can book at Property B. Guest search, creation and edits are organization-scoped. Reservations and stays link to a guest by `primary_guest_id`.

## 5. Reservations are bookings, stays are visits

A `reservations` row is a request to stay: dates, guest, room type preference, source. A reservation has a state machine (`INQUIRY` → `TENTATIVE` → `CONFIRMED` → `CHECKED_IN` → `CHECKED_OUT`, with `CANCELLED` and `NO_SHOW` as terminal states). A `stays` row is the actual visit: check-in date, check-out date, room assignment, guests. A reservation becomes a stay when the guest checks in. A stay has its own state machine (`EXPECTED` → `CHECKED_IN` → `CHECKED_OUT`, with `EXTENDED` and `EARLY_DEPARTURE` as modifications).

## 6. Rate plans and room rates are separate

A `rate_plans` row is a pricing strategy (BAR, Corporate, AAA) with a base rate and currency. A `room_rates` row is a specific rate for a specific room type on a specific date range, linked to a rate plan. A reservation captures the rate plan and rate at booking time as `rate_snapshots` — the rate the guest was quoted, frozen for history. A room rate edit never rewrites a past reservation's rate.

## 7. Room assignments are historical, not current

A `reservation_room_assignments` row records that a room was assigned to a reservation at a point in time. A reservation can have multiple assignments over its life (assigned Room 101, then reassigned to Room 202). Each assignment has `assigned_at` and `unassigned_at` timestamps. The current assignment is the one with `unassigned_at IS NULL`. A stay's room is the room the guest is actually in; a reservation's room assignment is the room the guest will be in.

## 8. Folios are billing documents, not stays

A `folios` row is a billing document for a stay. A folio has a state machine (`OPEN` → `SETTLED` → `CLOSED`). A folio has `folio_entries` — charges and payments. A charge is a debit (room rate, minibar, restaurant); a payment is a credit. A folio's balance is the sum of charges minus the sum of payments. A stay has at most one folio; a folio belongs to exactly one stay. Prompt #08 opens the folio and posts charges; Prompt #04 (Finance) owns the payment ledger and settlement.

## 9. State transitions are explicit, not implicit

Reservation and stay transitions go through an explicit allowed-transition function. A reservation can only move from `CONFIRMED` to `CHECKED_IN` via check-in; it cannot jump from `INQUIRY` to `CHECKED_IN`. A stay can only move from `CHECKED_IN` to `CHECKED_OUT` via check-out; it cannot jump from `EXPECTED` to `CHECKED_OUT`. Invalid transitions raise `NIVAAS_INVALID_TRANSITION`. The client displays the current status and offers only valid next actions.

## 10. Optimistic locking on mutable rows

Mutable operational rows (reservations, stays, folios, rooms, room types, guests) carry `version` and doors take `p_expected_version` (`NIVAAS_VERSION_CONFLICT`). Two front-desk agents editing the same reservation cannot interleave. The client re-reads the row on conflict and retries.

## 11. Every sensitive write is permission, validation, reason, audit

The existing four-step shape holds for the whole domain: `app.require_permission`, `app.require_valid`, a mandatory `p_reason` (for cancellations, no-shows, room moves), and one `app.audit` entry with `result = 'SUCCESS' | 'FAILURE' | 'DENIED'`. Reservation cancellation, no-show, stay check-out, room move, folio charge and folio payment are sensitive actions by definition.

## 12. Isolation is proven, not assumed

Every new table gets its RLS SELECT policy in the migration that creates it, mirroring `003_rls.sql`. Every id-addressed door calls `app.require_tenant_visibility` before it answers with anything, so a foreign id is `NIVAAS_NOT_FOUND` and never a 403 that confirms existence. Deeper levels check reachability through `app.can_access_property`, and a write to a paused site is refused by `app.require_writable_property`.

## 13. Money is never a float

Postgres: **unconstrained `numeric` + a scale CHECK**, plus a `currency` column on every money-bearing row. No `real`, no `double precision`, and **no `numeric(p,s)`**. Doors return money as **strings** (`x::text` / `to_char`), never as raw JSON numbers. The client keeps one money module (`src/lib/money.ts`): parse a decimal string to integer minor units, add and multiply in integers, round only at the display boundary, format with `Intl`. No screen does arithmetic on a parsed float.

## 14. History snapshots what it sold

A reservation stores the rate plan, rate amount, currency and room type at booking time. A stay stores the check-in and check-out dates, room and guests. A folio entry stores the charge description, amount and currency. A room rate edit never rewrites a past reservation's rate; a guest edit never rewrites a past reservation's guest name. History is immutable.

## 15. The front desk is a dashboard, not a workflow

The front desk screen (`/hotel/front-desk`) is a read-only dashboard: expected arrivals, expected departures, in-house guests, room stats. It offers check-in and check-out actions, but it does not drive the workflow. The workflow is: a reservation is confirmed → the guest arrives → the front desk agent checks them in (creating a stay) → the guest stays → the guest departs → the front desk agent checks them out. The front desk screen surfaces the next actions; it does not invent them.

## 16. Room types, rooms and guests archive; they are never deleted

A room type, room or guest that is no longer used is archived (`status = 'ARCHIVED'`). An archived room type cannot have new rooms created under it; an archived room cannot be assigned to a reservation; an archived guest can still be linked to past reservations and stays. Deletion would break history; archiving preserves it.

## 17. Permissions are domain-scoped

Hotel permissions follow the `domain.verb` pattern: `room_type.view`, `room_type.create`, `room_type.edit`, `room_type.archive`, `room.view`, `room.create`, `room.edit`, `room.archive`, `room.operational_status`, `room.housekeeping_status`, `guest.view`, `guest.create`, `guest.edit`, `guest.archive`, `reservation.view`, `reservation.create`, `reservation.edit`, `reservation.confirm`, `reservation.cancel`, `reservation.no_show`, `reservation.assign_room`, `stay.view`, `stay.check_in`, `stay.check_out`, `stay.extend`, `stay.move_room`, `folio.view`, `folio.open`, `folio.charge`, `folio.payment`. The permission catalogue (`src/domain/identity/permissions.ts`) is the single source of truth.

## 18. The client reads lists, the database enforces reachability

A list door (`list_rooms`, `list_reservations`, `list_stays`) returns all rows the session can see, filtered by the client's scope (`organization_id`, `property_id`). The database enforces reachability through RLS policies; the client does not re-check. A detail door (`get_room`, `get_reservation`, `get_stay`) calls `app.require_tenant_visibility` before answering, so a foreign id is `NIVAAS_NOT_FOUND` and never a 403 that confirms existence.

## 19. State machines are enforced at the door, not the screen

A reservation's state transitions are enforced by the `app.reservation_transition_allowed` function, called by every door that changes status. A stay's state transitions are enforced by the `app.stay_transition_allowed` function. The client displays the current status and offers only valid next actions, but the database is the authority. A client bug that offers an invalid transition is caught by the door and refused with `NIVAAS_INVALID_TRANSITION`.

## 20. Prompt #08 is the foundation; Prompt #09 is the workflow

Prompt #08 delivers the hotel foundation: room types, rooms, guests, reservations, stays, folios, front desk. Prompt #09 delivers the housekeeping workflow: housekeeping status changes, room inspections, maintenance requests. Prompt #08 sets the operational status; Prompt #09 sets the housekeeping status. The two prompts are separate work items with separate migrations, services and screens.
