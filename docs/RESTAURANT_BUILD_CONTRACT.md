# Restaurant build contract

Binding conventions for the Restaurant domain (Prompt #04 and Prompt #05). Every migration,
service and screen in this domain follows these, so four work items do not produce four
dialects of the same model. Where this file and an existing migration disagree, the existing
migration wins and this file is corrected.

## 1. Money is never a float

- Postgres: `numeric` with an explicit scale (`numeric(12,2)` for rupee amounts) plus a
  `currency` column on every money-bearing row. No `real`, no `double precision`.
- Doors return money as **strings** (`x::text` / `to_char`), never as raw JSON numbers: a
  `jsonb` numeric crosses into JavaScript as a float and that is how ₹280 becomes
  `279.99999999999994` on a bill.
- The client keeps one money module (`src/lib/money.ts`): parse a decimal string to integer
  minor units, add and multiply in integers, round only at the display boundary, format with
  `Intl`. No screen does arithmetic on a parsed float.

## 2. One calculation engine, on the server

`app.calculate_restaurant_totals(...)` is the single implementation of
items → subtotal → discount → tax → service charge → rounding → grand total, and every door
that books a total calls it (order create/edit, KOT confirmation, bill, payment validation).
The client displays the engine's answer; it never recomputes it, because two implementations
of one formula is how a POS total and a bill total start disagreeing (#04 §32, §33, §104).

## 3. Tax and service charge are abstractions, not constants

A `tax_category` reference and a rate snapshot per line, and a configurable service-charge
row per outlet. No `GST = 5%` literal anywhere in the order path (#04 §36, §37). The full
GST/finance engine is explicitly out of scope.

## 4. Human numbers come from a sequence, gaps are legal

`ORD-001245` / `BILL-000123` style numbers are minted per outlet per business date from a
counter table inside the same transaction as the row, unique within
`(organization_id, outlet_id, prefix, business_date)`. A rolled-back transaction may burn a
number; a gap is correct and must not be "fixed" by reusing one.

## 5. Optimistic locking plus row locks where it matters

Mutable operational rows carry `version` and doors take `p_expected_version`
(`NIVAAS_VERSION_CONFLICT`). Inside a door, the parent order is taken `FOR UPDATE` before its
children are written, so two cashiers on one order cannot interleave (#04 §75, §76).

## 6. Idempotency keys on the operational submits

Order create, KOT send, bill open and payment record accept an optional `p_idempotency_key`,
stored with a partial unique index scoped to the outlet. A double tap replays the first
result instead of booking a second order (#04 §77).

## 7. Statuses are state machines, not free text

Lifecycle status and operational availability are separate facts (#04 §10, §11). Order and
bill transitions go through an explicit allowed-transition function
(`app.rest_order_transition_allowed(from, to)`, `NIVAAS_INVALID_TRANSITION`), so
`COMPLETED → PREPARING` is impossible rather than merely discouraged. Table status is derived
from live orders wherever possible, with only the genuinely manual states (cleaning,
out-of-service) settable by a person (#04 §20).

## 8. Money rows are immutable once successful

A successful payment refuses an amount, method or bill reassignment at the trigger level
(`NIVAAS_PAYMENT_IMMUTABLE`); corrections are new rows (refund/reversal/adjustment) with their
own audit entries (#04 §43, §104). Same rule as the audit trail already enforces.

## 9. History snapshots what it sold

An order line stores the item name, code, unit price, currency, tax snapshot and the modifier
names and prices it was sold with. A menu edit never rewrites an old bill (#04 §17, §79). Menu
items, categories, tables and modifiers archive; they are never deleted while history refers
to them (#04 §78).

## 10. Isolation is proven, not assumed

Every new table gets its RLS SELECT policy in the migration that creates it, mirroring
`003_rls.sql`. Every id-addressed door calls `app.require_tenant_visibility` before it answers
with anything, so a foreign id is `NIVAAS_NOT_FOUND` and never a 403 that confirms existence.
Deeper levels check reachability through `app.can_access_property` / `app.can_access_outlet`,
and a write to a paused site is refused by `app.require_writable_property/outlet` (#04 §71-§74).

## 11. Every sensitive write is permission, validation, reason, audit

The existing four-step shape holds for the whole domain: `app.require_permission`,
`app.require_valid`, a mandatory `p_reason`, and one `app.audit` entry with
`result = 'SUCCESS' | 'FAILURE' | 'DENIED'`. Availability flips, discounts, voids, KOT reprints
and refunds are sensitive actions by definition (#04 §69).

## 12. Outlets are the restaurant

A restaurant is an `outlets` row of type `RESTAURANT` (or `CAFE`, `BAR`, …) from Prompt #02.
There is no `RestaurantBusiness` entity (#04 §4). Everything restaurant-scoped hangs off
`outlet_id` with its `organization_id` / `property_id` ancestors denormalized, as everywhere
else in this schema.
