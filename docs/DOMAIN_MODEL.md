# AMRUT NIVAAS — Domain Model

The **tenancy, identity, access, session and audit layer is executed** (Prompt #02, hardened by #03): it exists
as Postgres tables (`db/supabase/001`–`004`, then `008`–`012`), as doors (`005`, plus `010`/`011`'s), as the
client mirror `src/domain/identity/types.ts`, and as scoped services under `src/domain/{hierarchy,access,auth,audit}`.
§2 describes that built model, level by level. Prompt #04 has begun the restaurant from its substrate side:
`013` seeded the 27 restaurant permissions and `014` created the six menu tables and their 19 doors, so the
`Menu`/`MenuItem`/`ModifierGroup`/`Modifier` rows below are now **implemented** while the rest — tables, orders,
KOT, bills, payments, hotel, inventory, finance, CRM, events, HR, platform — is still the **target shape later
modules must conform to**. Nothing in §3 or §4 should be read as implemented unless this file marks it so.

---

## 1. The spine

**IMPLEMENTED (Prompt #02)** — the four tables, their chain triggers and their doors are in
`db/supabase/001_business_hierarchy.sql` + `005_write_rpc.sql`; details in §2.1.

```text
Organization           the tenant · legal/customer boundary · billing and data residency
   ↓
Property               one physical location · carries timezone, currency, locale, country, tax config
   ↓
Outlet                 a revenue point · restaurant, bar, spa, banquet, room service
   ↓
Department             a cost/ownership unit · Front Office, Kitchen, Housekeeping, Finance, Stores, HR
```

Worked example (from the product brief):

```text
Organization  Amrut Hospitality Pvt Ltd
Property      Amrut Grand Hotel
Outlets       Main Restaurant · Rooftop Restaurant · Banquet · Room Service
Departments   Front Office · Kitchen · Housekeeping · Finance · Stores · HR
```

A restaurant-only customer is the same model with one outlet and no rooms:
`Organization → Property(CAFE) → Outlet(Main Dining) → Department(Kitchen, Stores)`.
A resort is one property with many outlets and housekeeping-heavy departments. **No module gets its own
tenancy model.**

---

## 2. Entities, where they attach, and what they mean

### 2.1 Built now (Prompt #02)

Every shape below is executed as a table and mirrored, field-for-field, in camelCase by
`src/domain/identity/types.ts` — that file is the client's mirror of the schema, not an independent model.
The services that read/write them are `src/domain/hierarchy/{organization,property,outlet,department}-service.ts`,
`src/domain/access/{session,people,role}-service.ts` and `src/domain/audit/audit-service.ts`.

**Rule the taxonomy tests used to enforce:** each status/type/mode/scope list is declared twice — as a type for
the compiler and as a `const` array the pickers render — and `domain/identity/taxonomy.test.ts` compared each
array against the `CHECK` constraint in the migration, in both directions. That suite is deleted (2026-10-07,
`docs/ARCHITECTURE.md` §13.5), so the pairing is now maintained by hand and the invariant below is a rule to
keep, not one a build enforces:
**a picker must never
offer a value the database's `CHECK` would refuse**, and the client must never name a status the schema does
not accept. The donor app's property-type list drifted exactly this way and a write failed at the door.

#### The spine — hierarchy (`db/supabase/001_business_hierarchy.sql`)

| Entity | Scope (denormalized ancestors) | Lifecycle `status` | Archive columns | Notes |
|---|---|---|---|---|
| `Organization` | the tenant — no parent | `ACTIVE · SUSPENDED · ARCHIVED` (no `INACTIVE`: a group is trading or not) | `archived_at` | `code` + `slug` unique; `business_types` is the 12-value array; locale/currency/timezone set here as the *reporting* default |
| `Property` | `organization_id` | `ACTIVE · INACTIVE · ARCHIVED` (`SiteStatus`) | `archived_at` | carries `property_type` (11 values), `timezone`, `currency`, `locale`, `business_day_start`; `tax_profile_id` nullable by design (no tax module yet) |
| `Outlet` | `organization_id`, `property_id` | `SiteStatus` | `archived_at` | `outlet_type` (9 values); **no** own timezone/currency/locale/tax — an outlet sits inside one property's regime |
| `Department` | `organization_id`, `property_id`, `outlet_id` (nullable) | `SiteStatus` | `status` only (no `archived_at` column) | a cost/ownership centre, never a tenancy boundary; `outlet_id` nullable so a department can hang off the property |

- **Every row carries the ids of ALL its ancestors.** A query filters on `organization_id` alone and cannot
  leak across tenants even if a deeper predicate is forgotten; a chain trigger refuses a write whose
  ancestors disagree (`NIVAAS_SCOPE_MISMATCH`).
- **Archive, never hard-delete.** Retirement is `status = ARCHIVED` (+ `archived_at` where the column exists)
  through a `set_*_status` door that requires a `reason`; the doors refuse to add rows under a retired
  organization (`NIVAAS_ORGANIZATION_ARCHIVED`) or write into a non-writable property/outlet
  (`NIVAAS_PROPERTY_NOT_WRITABLE` / `NIVAAS_OUTLET_NOT_WRITABLE`). There is no delete door.
- **Optimistic locking.** All four carry `version integer default 1`; an update door takes `p_expected_version`
  and raises `NIVAAS_VERSION_CONFLICT` on a stale write.
- **Empty-string clears, absent leaves alone.** In the update doors `app.blankable(current, proposed)` treats a
  `null` parameter as "not edited" and an empty/whitespace string as the stated intent to clear a nullable
  text column, so a form that emptied a phone number actually blanks it instead of silently keeping the old one.

#### Identity & people (`db/supabase/002_identity_access.sql`)

| Entity | Lifecycle | Meaning |
|---|---|---|
| `UserAccount` (profiles) | `AccountStatus` = `ACTIVE · SUSPENDED · DEACTIVATED` (database-authoritative; `008` retired `INACTIVE`→`DEACTIVATED`) | authentication identity, deliberately separate from tenancy; suspending a person from one tenant must not lock them out of another. `008` added `first_name`/`last_name`/`locale`/`timezone`/`last_login_at` and a generated-stored `display_name`. `profiles.status` is a **platform kill switch with no tenant door** (D-37): tenant-path suspension moves the membership, not the account. |
| `Membership` (organization_memberships) | `MembershipStatus` = `INVITED · ACTIVE · SUSPENDED · REMOVED` (`REMOVED` terminal) | joins a person to ONE organization; `is_owner` exactly one per org (partial unique index); breadth lives elsewhere, never here |
| `Invitation` | `InvitationStatus` = `INVITED · ACCEPTED · EXPIRED · CANCELLED · REVOKED` | the token is stored only as a **SHA-256 hash** (`token_hash`, unique) and is **one-time**; `invite_member` returns the plaintext `IssuedInvitation.token` exactly once, and the store must not cache it |

#### Roles & access breadth (`002`, seeded by `006`)

| Entity | Meaning |
|---|---|
| `Role` | `scope_level` ∈ `GLOBAL · ORGANIZATION · PROPERTY · OUTLET · DEPARTMENT`; `is_system` seeded roles are read-only; `status` `ACTIVE · INACTIVE` (unchanged from `002` — `008` retired `INACTIVE` only on **profiles**, not roles). `009` added `seniority` (1–100 ladder) and `owner_class` (the two roles carrying tenant/platform ownership); `011` makes roles tenant-definable, so `organization_id` scopes a custom role to one tenant |
| `Permission` | a `domain.verb` string, validated by `PERMISSION_PATTERN`; `006` seeds 25 keys, `011` adds `role.create`/`role.edit` for 27 across 8 domains (catalogue in `docs/PERMISSIONS.md`) |
| `RoleGrant` (user_roles) | the row that answers "may I?" — `(user, role, org?, property?, outlet?, department?)`; **revocation is a timestamp (`revoked_at`), never a delete** |
| `PropertyAccess` (membership_property_access) | mode `ALL_PROPERTIES` / `SELECTED_PROPERTIES` |
| `OutletAccess` (membership_outlet_access) | mode `ALL_OUTLETS` / `SELECTED_OUTLETS` |

- **Widest-applicable-grant wins**, and everything outside it is invisible rather than merely denied; an
  outlet carve-out narrows only outlet-bound rows.
- **DEPARTMENT-scope grants are refused at the door** (`NIVAAS_DEPARTMENT_GRANTS_UNSUPPORTED`) because
  `my_permissions` resolves organization/property/outlet only — the scope level exists as data, the grant path
  does not exist yet. **Prompt #03 kept the refusal** (D-26) rather than half-wire it; resolving department
  scoping end to end is a named future phase.
- **Suspension revokes the role grants themselves** (Scenario 6e): setting a membership to `SUSPENDED` (or
  `REMOVED`) stamps `revoked_at` on that person's grants so a later bug cannot honour a dark role row;
  **reinstatement does not restore them** — it needs an explicit `assign_role` re-grant. The person's own
  profile row survives (revoking a membership never revokes the login).

#### Session & permission (client + `005`)

| Entity | Meaning |
|---|---|
| `ActiveContext` | `{ signedIn, organizationId, propertyId, outletId, cleared }` — where the person is working *right now*, re-proved by `resolve_active_context` on each load; `cleared` means the server dropped a level the client had saved |
| `PermissionSet` + `can()` | what the UI may offer for one context; a **display aid only** — every door re-asks the question on write |

#### Audit (`db/supabase/004_audit.sql`)

`AuditEvent { id, actorId, organizationId, propertyId, outletId, action, entity, entityId, before, after,
reason, metadata, createdAt }` — append-only; `app.forbid_audit_mutation` refuses UPDATE and DELETE for every
role including the owner. Every door writes through `app.audit()`.

### 2.2 Target entities (modules NOT built yet)

The table below is the contract later phases must conform to. Except for the rows marked **IMPLEMENTED** — the
four menu rows from `014` and the restaurant rows from `015`–`019` — none of these tables or doors exist. The
restaurant ones are **applied on both servers** (local harness and the hosted project, each migration ending in
its own catalogue self-check that passed), so the tables, doors, grants and policies are facts; what is not yet
a fact is their behaviour, which no verifier scenario attacked until this pass (see `docs/ACCEPTANCE-04.md`). The
relationships in §3 and the state machines in §4 are canonical *intent* until the scenarios say otherwise.

| Domain | Entity | Scope | Meaning and key relationships |
|---|---|---|---|
| identity | `UserAccount` | platform | an authentication identity. Carries no business authority |
| identity | `Membership` | organization (+ property/outlet/department narrowing) | grants a user into an org; the thing a `Role` attaches to |
| identity | `Role` / `RolePermission` | organization or property | named bundle of `domain.verb` permissions with a `PermissionScope` |
| organization | `Organization` | — | the tenant. `status`, `legalName`, `taxRegion`, `featureFlags` |
| property | `Property` | organization | `type` (12 values), `timezone`, `locale`, `currency`, `country`, `taxProfileId`, `businessDayStart` |
| property | `TaxProfile` | organization/property | versioned tax templates: codes, rates, place-of-supply rules. Documents store the version used |
| outlet | `Outlet` | property | `kind` (DINE_IN, BAR, ROOM_SERVICE, BANQUET, CLOUD_KITCHEN, SPA…), service hours, receipt footer |
| outlet | `Department` | property (optionally outlet) | cost centre and ownership target |
| hotel | `RoomType` | property | category, capacity, base rate reference |
| hotel | `Room` | property | physical unit, `roomTypeId`, `status` (clean/dirty/out-of-order/in-use) |
| hotel | `Reservation` | property (+ outlet for packages) | arrival/departure, room allocation, rate, status machine, leads to a `Folio` |
| hotel | `Folio` | property + guest + reservation | the running account a guest settles. **The posting seam every charge channel uses** |
| hotel | `HousekeepingTask` | property → department | assigned clean/inspection work with completion evidence |
| restaurant | `Menu` / `MenuItem` | outlet | **IMPLEMENTED (`014`: `menus`, `menu_items`, `menu_item_prices`)** — versioned price list, one effective-dated price row per item, `menu_snapshot`/`menu_item_current_price` as priced reads. `tax_category_id` is an opaque placeholder with deliberately no foreign key until the tax module lands, so an item still carries no rate constant |
| restaurant | `ModifierGroup` / `Modifier` | outlet | **IMPLEMENTED (`014`)** — options, supplements and per-item price deltas, with min/max selection rules enforced in-SQL |
| restaurant | `Table` | outlet | **IMPLEMENTED (`015`: `dining_areas`, `restaurant_tables`, view `restaurant_table_status`)** — seating map, capacity, ordering, and a service status a person can set (`AVAILABLE/OCCUPIED/RESERVED/CLEANING/OUT_OF_SERVICE`); the *derived* status is what the floor and the day read, precedence-resolved by `016`'s orders, and a `Section` groups tables for a waiter |
| restaurant | `Order` | outlet (+ table) | **IMPLEMENTED (`016`: `orders`, `order_items`)** — a billable ticket on a business date; lines → `OrderItem` with `status` (sales: ACTIVE/VOIDED) *and* `fire_status` (kitchen: NOT_FIRED/FIRED/READY) as independent columns; totals are written only by `app.calculate_restaurant_totals`. Posting to a `Folio` is still #08's |
| restaurant | `Bill` (restaurant document) | outlet (+ order) | **IMPLEMENTED (`017`: `bills`)** — the frozen snapshot of the engine's answer at `open_bill`, with its own `currency` derived from the order's ACTIVE lines, `bill_number` from the counter, and status derived by money (`OPEN → PARTIALLY_PAID → PAID`, plus `CANCELLED`). This is the guest's document, **not** the finance `Invoice`/`Bill` below |
| restaurant | `Payment` | property | **IMPLEMENTED (`017`: `payments`)** — money actually received against one bill; append-only, SUCCESSFUL rows immutable under a guard trigger, a wrong payment answered by a new REFUNDED row with a reason |
| restaurant | `KOT` (kitchen ticket) | outlet → department Kitchen | **IMPLEMENTED (`018`: `kitchen_order_tickets`)** — the fire instruction derived from an order, carrying quantities and instructions and **no money**; lines point at it via `order_items.kot_id`, a reprint re-emits the same row with `reprint_count` incremented, and the lifecycle is separate from the bill's (`OPEN → CLOSED \| CANCELLED`) |
| restaurant | `DayOverview` | outlet | **READ MODEL ONLY (`019`: `restaurant_day_overview`)** — covers, tickets, the pass and money per currency for one business date, computed in-SQL. It is not a table and has no entity of its own; nothing aggregates these figures in the client (contract §2, D-41) |
| inventory | `Item` (stock) | organization (master) → per-property ledger | UoM, conversion, valuation policy, reorder/coverage target |
| inventory | `Recipe` | outlet | item → component quantities; the bridge that turns an `OrderItem` into stock consumption |
| inventory | `StockMovement` | property (+ outlet/department) | the ledger: OPENING, PURCHASE, TRANSFER_IN, CONSUMPTION, WASTAGE, TRANSFER_OUT, ADJUSTMENT |
| inventory | `StockTransfer` | property → outlet/department | paired movements that must net to zero across the property |
| procurement | `Supplier` | organization | one name per party; master data shared across properties |
| procurement | `PurchaseOrder` | property | request/approve with `purchase.approve`; expectation of receipt |
| procurement | `GoodsReceivedNote` | property → department Stores | creates stock movements and a payable |
| finance | `Invoice` / `Bill` | property (+ outlet) | billed amount. Issued document, immutable once finalised. This is Phase 4's accounting document — the restaurant's guest-facing bill is `017`'s `bills`, above |
| finance | `Journal` / `JournalLine` | property → cost centre | double-entry posting; debit = credit is a DB invariant |
| finance | `Account` (CoA) | organization | single chart of accounts, per-tenant |
| finance | `AccountingPeriod` | organization | OPEN / CLOSED; writes into a closed period are refused |
| finance | `Payable` / `Receivable` | property + party | outstanding money, derived from postings, never edited directly |
| crm | `Guest` | organization (shared across properties) | identity + contact + stay history + preferences; the record POS, PMS and events point at |
| crm | `LoyaltyProgram` / `LoyaltyEntry` | organization | accrual and redemption rules as data |
| events | `EventLead` / `Quotation` | property → outlet Banquet | pipeline before commitment |
| events | `BanquetEvent` / `BEO` | property (+ outlets, departments) | confirmed function: hall, timings, covers, menu, revenue split, deposits |
| hr | `Employee` | organization + property | staff record, linked to `UserAccount` where they log in |
| hr | `Shift` / `Attendance` | property → department | roster and actuals; the input to later payroll integration |
| platform | `Subscription` / `Plan` | organization | property count + POS terminal count + monthly floor; the control plane |
| cross-cutting | `AuditLogEntry` | organization (+ property/outlet) | actor, action, entity, before/after, reason, metadata. Append-only |
| cross-cutting | `DomainEvent` | organization (+ property) | past-tense fact emitted transactionally (outbox) for consumers: notifications, analytics, AI |
| cross-cutting | `DocumentNumber` | organization + document type | server-allocated sequence per tenant per document class |

---

## 3. The relationships that make it one system

**Not built yet** — none of the entities below exist; this is the contract the operational modules must
satisfy when they arrive. What is built (§2.1) is only the graph they all attach to.

```text
Order ──settles by──▶ Payment            Order ──posts to──▶ Folio (room service, banquet)
OrderItem ──explodes via──▶ Recipe ──drives──▶ StockMovement(CONSUMPTION)
GoodsReceivedNote ──drives──▶ StockMovement(PURCHASE) ──and──▶ Payable
Reservation ──creates──▶ Folio ──charges nightly by──▶ Journal(ROOM_REVENUE)
BanquetEvent ──books──▶ Outlet capacity + Quotation ──converts to──▶ Order / Invoice
Every money-bearing document ──postings──▶ JournalLines ──roll up──▶ Ledger / P&L / GST reports
Every write above ──emits──▶ AuditLogEntry and DomainEvent
```

**The folio is the load-bearing seam.** A table bill, a minibar charge, a laundry charge and a nightly room
charge all post to the same guest account exactly once, atomically, and reversibly by a counter-posting
with a reason. If that property holds, the hotel and the restaurant are one product; if it does not, they
are two apps that disagree at audit time.

---

## 4. State machines (canonical, to be implemented with the modules)

**Built now** — the lifecycles that exist as schema, each enforced by a `CHECK` and diffed against its client
array (§2.1). The five identity rows are applied and verified; the six restaurant rows are marked as such and are
written in `015`–`018`, **not yet applied to a database**:

| Entity | States | Transitions |
|---|---|---|
| Organization | `ACTIVE → SUSPENDED → ARCHIVED` (and back from SUSPENDED) | via `set_organization_status`, `reason` required |
| Property · Outlet · Department | `ACTIVE ↔ INACTIVE → ARCHIVED` | via `set_property_status` / `set_outlet_status` / `set_department_status` |
| Membership | `INVITED → ACTIVE ↔ SUSPENDED → REMOVED` (terminal) | via `set_member_status`; suspension also revokes that person's `user_roles` grants (§2.1), and `REMOVED` additionally deletes their property/outlet breadth rows (`009`). An `is_owner` row cannot be suspended/removed without first transferring — `NIVAAS_OWNER_MUST_TRANSFER` (D-29) |
| Invitation | `INVITED → ACCEPTED \| EXPIRED \| CANCELLED \| REVOKED` | `accept_invitation` (one-time, hash-verified, address-matched), `cancel_invitation` (inviter → CANCELLED, anyone else → REVOKED). `012` enforces one pending invitation per `(organization, email)` via a partial unique index and sweeps expiry lazily (`app.expire_stale_invitations`) |
| RoleGrant | active ⟷ `revoked_at` stamped | `assign_role` / `revoke_role`; revocation is never a delete |
| Order *(written in `016`, not yet applied)* | `PLACED → CONFIRMED → PREPARING → READY → SERVED → COMPLETED`, plus `CANCELLED` and `VOIDED` | only `set_order_status` moves a ticket, through `app.assert_order_chain`; `send_kot` drives the order to PREPARING and `open_bill` drives it to SERVED **through that same machine**, so no screen writes a status and no verb skips a rung |
| OrderItem fire status *(written in `018`)* | `NOT_FIRED → FIRED → READY`, two edges exactly | `set_order_item_fire_status` is the only writer and accepts READY alone — a cook cannot un-ring a plate. Independent of the line's sales `status` (ACTIVE/VOIDED), never a synonym for it |
| KOT *(written in `018`)* | `OPEN → CLOSED`, `OPEN → CANCELLED` | a slip auto-CLOSES when its last FIRED line rings up, so no screen calls a close verb; `cancel_kot` needs `kot.cancel` and a reason, returns FIRED lines to NOT_FIRED, and leaves a READY line its state |
| Bill *(written in `017`)* | `OPEN → PARTIALLY_PAID → PAID`, plus `CANCELLED` | derived by `record_payment` from the money it has seen — status is not a button. `close_bill` confirms an already-settled document; `cancel_bill` refuses the moment any money is booked |
| Payment *(written in `017`)* | `SUCCESSFUL \| FAILED \| REFUNDED`, INSERT-only | a SUCCESSFUL row is immutable under 017's guard trigger; there is no update or delete verb anywhere in the client, and a wrong payment is answered by a new REFUNDED row carrying its own reason |
| Table service status *(written in `015`)* | person-set `AVAILABLE / OCCUPIED / RESERVED / CLEANING / OUT_OF_SERVICE`; the operational status is **derived** | `set_table_service_status` records the human fact; the `restaurant_table_status` view resolves precedence over `016`'s orders, so the floor and the day read one answer |

All are archive-only: no delete transition exists for any entity, anywhere in the surface.

**Target** — module state machines with nothing behind them yet (the Order row below is the exception: its
ladder is built, its amendments are not):

| Entity | States | Notes |
|---|---|---|
| Reservation | `DRAFT → CONFIRMED → CHECKED_IN → CHECKED_OUT` + `CANCELLED`, `NO_SHOW`, `WAITLIST` | cancel vs no-show have different money consequences |
| Room | `VACANT_CLEAN → VACANT_DIRTY → OCCUPIED → OUT_OF_ORDER` | housekeeping drives the first two transitions |
| Order amendments | the ladder itself is built (above, `016`) | what is still missing is the *middle*: a course model, an amendment after fire that shows the kitchen a visible delta, and a split — all Prompt #05's |
| StockMovement | immutable | corrections are new ADJUSTMENT rows with a reason, never edits |
| Invoice / Bill | `DRAFT → ISSUED → PARTIALLY_PAID → PAID` + `CANCELLED`, `CREDIT_NOTE_ISSUED` | issued is immutable; adjustment is a credit note |
| AccountingPeriod | `OPEN → CLOSED` | closing is a gated, audited action |
| BanquetEvent | `LEAD → QUOTED → BOOKED → IN_PROGRESS → BILLED → SETTLED` | deposits are money rows, not status flags |

---

## 5. Invariants the database must enforce

**Enforced and verified today:** #1 and #2 (denormalized ancestors + chain triggers raise
`NIVAAS_SCOPE_MISMATCH`; scenarios 1, 3 and 5 of `db/verify/tenant_isolation.sql` prove cross-tenant reads
and writes are refused under the `authenticated` role), and the archive/version invariants of §2.1.
**Written into SQL but not yet applied to a database:** #4, #6, #7, #8 and #9 now have real enforcement in
`016`–`019` — a bill's billed/paid/due are separate aggregates with `amount_due` derived, every money column is
`numeric` with explicit scale and TEXT across the wire (never a float), each sensitive door calls
`app.require_reason` and `app.audit()` in the same transaction, business-day membership comes from
`app.rest_outlet_business_date` against the outlet's own settings, and `BILL-nnn`/`KOT-nnn` are allocated by
`app.next_document_number` per tenant per class. Those migrations have not run, so the proof is the in-file
self-check, not a scenario.
**Not yet enforced by anything:** #3, #5 and #10 attach to modules that do not exist yet — listed here so each
module inherits them at birth.

1. A row cannot exist without the scope it claims: an `Order` without an `outlet` belonging to a real
   `Property` of the writing tenant is refused.
2. No cross-tenant reference is resolvable — foreign keys plus RLS, tested with a real second tenant.
3. `Σ JournalLine.debit = Σ JournalLine.credit` per journal.
4. A document's billed amount and its settled amount are separate aggregates; `outstanding` is derived.
5. `Closing = Opening + Purchases + TransfersIn − Consumption − Wastage − TransfersOut ± Adjustments`,
   and a physical count can only differ from it through a labelled shortage/adjustment event.
6. Money and quantity columns are `numeric` with explicit scale; minor units are integers; floats appear
   nowhere in a financial path.
7. Every mutation of a protected figure (price, void, stock adjustment, folio correction, period reopen)
   requires `reason` and writes an audit row in the same transaction.
8. Business-day membership is computed in the property's timezone against its `businessDayStart`; a
   02:00 order does not silently land on the previous day's report.
9. Document numbers are allocated server-side, unique per tenant per document class; gaps allowed,
   duplicates impossible.
10. `Guest` identity is organization-scoped master data; two properties of one organization recognize the
    same guest, and two organizations never see each other's.

---

## 6. Vocabulary

**Property** not "hotel" — a restaurant is a property too. **Outlet** not "branch". **Folio** the guest
running account. **KOT** kitchen order ticket (the fire instruction); **KDS** the screen that shows KOTs.
**Cover** one guest meal served. **BEO** banquet event order. **ADR** average daily rate. **RevPAR**
revenue per available room. **Occupancy** rooms sold ÷ rooms available. **Night audit** the daily
property-close process. **Place of supply** the tax-location rule that decides CGST/SGST vs IGST.

---

## 7. Naming and typing conventions

- `snake_case` columns in Postgres; `camelCase` in TypeScript, mapped in exactly one place —
  `src/db/case.ts` `toCamelCase` at the top level of a row (JSON columns keep their own keys), and
  `toDoorArgs` which prefixes input names with `p_` so the door parameter `p_expected_version` and the client
  input `expectedVersion` share one vocabulary.
- **IDs are `uuid` (`default gen_random_uuid()`)**, typed as `string` (`EntityId`) on the client — this is what
  was actually built. The earlier "prefixed strings (`org_…`)" idea is not implemented; a pasted id is not
  self-describing, so the entity name comes from the door/table it was read through.
- Money fields end `Paise` or live behind the `Money` type; percentage/rate fields are `numeric` with an
  explicit scale and are never multiplied into a float. (No money table exists yet.)
- Timestamps are UTC `timestamptz`; date-only business fields are `date`, never a midnight timestamp.
- **Statuses/types/modes/scopes are `text` columns with a `CHECK (col in (...))` list**, and the client's
  `const` arrays were diffed against that CHECK by `taxonomy.test.ts` in both directions until §13.5 deleted it —
  so the two are meant to be unable to
  drift (the donor app's acknowledged "real risk"), and nothing now checks that they haven't. `src/domain/identity/types.ts` is the single mirror.
