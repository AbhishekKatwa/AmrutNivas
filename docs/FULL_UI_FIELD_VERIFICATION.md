# AMRUT NIVAAS — FULL UI FIELD VERIFICATION

Per Master Prompt #36 §57. Every important form gets a field-by-field audit.
Status vocabulary: PASS · PASS WITH ISSUE FIXED · FAIL · BLOCKED · NOT IMPLEMENTED · NOT APPLICABLE.

## How to read this file

For each screen, fields are listed in the order they appear in the form.
Each field carries:

| Column | Meaning |
|---|---|
| Field | The label / control name |
| Input type | text, number, currency, percentage, date, dropdown, multi-select, toggle, file, rich-text, lookup |
| Required? | yes / no / conditional |
| Validation | what the form rejects (length, format, range) |
| Test performed | which of the §11 cases ran (empty, valid, min, max, dup, special, unicode, long, paste, save) |
| Result | the observed outcome of the test |
| Issue | defect ID if a test failed (links to UI_AUTONOMOUS_DEFECT_LOG.md) |
| Fix | files changed |
| Retest | date + outcome of the second run |
| Status | the screen-level verdict |

Tests cover: §10 field inventory, §11 input types, §12 required behaviour,
§13 optional behaviour, §14 duplicates, §33 search, §34 filter, §36 CRUD,
§37 persistence, §38 calculation, §39 rounding, §40 dates.

---

## AUTH screens

### AUTH-FV-01 — Sign in (`/sign-in`)

| Field | Type | Req | Validation | Tested | Result | Issue | Fix | Retest | Status |
|---|---|---|---|---|---|---|---|---|---|
| Sign-in method tab | segmented | yes | one of User ID / Password · Email / Password · Mobile / Password | both tabs visible | PASS | — | — | — | PASS |
| User ID | text | yes | must resolve to a profile | empty, valid, leading space, long | PASS | — | — | — | PASS |
| Password | password | yes | min 8, must match user | empty, wrong, right | PASS | — | — | — | PASS |
| Sign in | submit | yes | gates on both fields valid | click before fill / after fill | PASS | — | — | — | PASS |
| Forgot password? | link | no | opens recovery flow | click → `AUTH-004` | PASS | — | — | — | PASS |

### AUTH-FV-02 — Forgot password (`/sign-in` recovery sheet)

| Field | Type | Req | Validation | Tested | Result | Issue | Fix | Retest | Status |
|---|---|---|---|---|---|---|---|---|---|
| Identifier | text | yes | email or user-id | empty, valid, unknown | PASS server/client throws | UI-0004 client fixed | client `requestPasswordReset` throws; server half BLOCKED @ task #58 | 2026-10-09 client retested PASS | FAIL/BLOCKED |

---

## ORG / PROPERTY / OUTLET screens

### ORG-FV-01 — Organization (`/organization`)

| Field | Type | Req | Validation | Tested | Result | Status |
|---|---|---|---|---|---|---|
| Legal name | text | yes | length 1–120 | empty, valid, very long | PASS | PASS |
| Display name | text | yes | length 1–80 | empty, valid, dup | PASS | PASS |
| Code | text | yes | `[A-Z0-9]{2,10}` | empty, valid, dup, lowercase rejected | PASS | PASS |
| Country | dropdown | yes | ISO list | clear, every option | PASS | PASS |
| Currency | dropdown | yes | ISO 4217 | clear, every option | PASS | PASS |
| Timezone | dropdown | yes | IANA | clear, every option | PASS | PASS |
| Locale | dropdown | yes | BCP-47 | clear, every option | PASS | PASS |
| Phone | text | no | E.164 | empty, valid | PASS | PASS |
| Email | text | no | email | empty, invalid, valid | PASS | PASS |
| Website | text | no | url | empty, invalid, valid | PASS | PASS |
| Logo | file | no | png/jpg ≤ 2 MB | upload / remove / replace | PASS | PASS |
| Save | submit | yes | gates required | click before fill / after fill | PASS | PASS |

### ORG-FV-02 — Departments (`/departments`)

| Field | Type | Req | Validation | Tested | Result | Status |
|---|---|---|---|---|---|---|
| Name | text | yes | 1–80 | empty, dup, valid | PASS | PASS |
| Code | text | yes | `[A-Z0-9]{2,10}` | empty, dup, lowercase | PASS | PASS |
| Property | dropdown | yes | property list | clear, every option | PASS | PASS |
| Save | submit | yes | gates required | click before/after | PASS | PASS |

### PROPERTY-FV-01 — Properties (`/properties`)

| Field | Type | Req | Validation | Tested | Result | Issue | Fix | Retest | Status |
|---|---|---|---|---|---|---|---|---|---|
| Name | text | yes | 1–120 | empty, dup, valid | PASS | — | — | — | PASS |
| Code | text | yes | `[A-Z0-9]{2,10}` | empty, dup | PASS | — | — | — | PASS |
| Type | dropdown | yes | HOTEL / RESTAURANT / RESORT / BANQUET | clear, every option | PASS | — | — | — | PASS |
| Address line 1 | text | yes | 1–200 | empty, valid | PASS | — | — | — | PASS |
| Address line 2 | text | no | 0–200 | empty | PASS | — | — | — | PASS |
| City | text | yes | 1–80 | empty | PASS | — | — | — | PASS |
| State | text | yes | 1–80 | empty | PASS | — | — | — | PASS |
| Postal code | text | yes | 4–12 | empty, valid, too long | PASS | — | — | — | PASS |
| Country | dropdown | yes | ISO | clear, every option | PASS | — | — | — | PASS |
| Phone | text | no | E.164 | empty | PASS | — | — | — | PASS |
| Email | text | no | email | empty | PASS | — | — | — | PASS |
| Timezone | dropdown | yes | IANA | clear, every option | PASS | — | — | — | PASS |
| Currency | dropdown | yes | ISO 4217 | clear, every option | PASS | — | — | — | PASS |
| Locale | dropdown | yes | BCP-47 | clear | PASS | — | — | — | PASS |
| Business day start | time | yes | HH:mm | empty, valid, edge 00:00 / 23:59 | PASS | UI-0010 fixed | `BusinessDayStart` formatter | 2026-10-09 PASS | PASS |

### OUTLET-FV-01 — Outlets (`/outlets`)

| Field | Type | Req | Validation | Tested | Result | Status |
|---|---|---|---|---|---|---|
| Name | text | yes | 1–80 | empty, dup, valid | PASS | PASS |
| Code | text | yes | `[A-Z0-9]{2,10}` | empty, dup | PASS | PASS |
| Property | dropdown | yes | property list | clear, every option | PASS | PASS |
| Type | dropdown | yes | RESTAURANT / BAR / BANQUET / ROOM_SERVICE / CLOUD_KITCHEN / BAKERY | every option | PASS | PASS |
| Business hours × 7 days | time pair | no | open ≤ close | empty, valid, open > close rejected | PASS | PASS |
| Phone | text | no | E.164 | empty | PASS | PASS |
| Email | text | no | email | empty | PASS | PASS |

---

## DASHBOARD screens

### DASH-FV-01 — Foundation status (`/`)

| Field | Type | Req | Validation | Tested | Result | Issue | Fix | Retest | Status |
|---|---|---|---|---|---|---|---|---|---|
| Empty-state copy | static | n/a | reads honestly | render | PASS | UI-0001 stale copy | `FoundationStatusPage.tsx` "Wire status" panel | 2026-10-09 PASS | PASS |
| Module status cards | list | n/a | derives from gate | each module reads | PASS | UI-0011/0012 fixed | cards wire live | 2026-10-09 PASS | PASS |

---

## RESTAURANT screens

### REST-FV-01 — Menu management (`/menu`)

| Field | Type | Req | Validation | Tested | Result | Status |
|---|---|---|---|---|---|---|
| Item name | text | yes | 1–80 | empty, dup, valid | PASS | PASS |
| Category | dropdown | yes | category list | clear, every option | PASS | PASS |
| Description | rich-text | no | ≤ 500 chars | empty, long | PASS | PASS |
| Price | currency | yes | > 0, ≤ 99999.99 | 0, negative, valid, large | PASS | PASS |
| Tax profile | dropdown | yes | tax list | clear | PASS | PASS |
| Modifier set | multi-select | no | modifier-set list | none, multiple | PASS | PASS |
| Outlet availability | multi-select | yes | outlet list | none, multiple | PASS | PASS |
| Image | file | no | png/jpg ≤ 2 MB | upload / remove | PASS | PASS |
| Availability toggle | toggle | yes | on/off | toggle save | PASS | PASS |

### REST-FV-02 — Tables & floor (`/tables`)

| Field | Type | Req | Validation | Tested | Result | Issue | Fix | Retest | Status |
|---|---|---|---|---|---|---|---|---|---|
| Floor name | text | yes | 1–80 | empty, dup | PASS | — | — | — | PASS |
| Section | text | no | 1–40 | empty | PASS | — | — | — | PASS |
| Table number | text | yes | 1–10 | empty, dup | PASS | — | — | — | PASS |
| Capacity | number | yes | 1–20 | 0, valid, large | PASS | — | — | — | PASS |
| Status | dropdown | yes | derived states | every option | PASS | UI-0013 fixed | pill renders Active/Retired | 2026-10-09 PASS | PASS |
| Position X / Y | number | no | 0–9999 | empty, valid | PASS | — | — | — | PASS |

### REST-FV-03 — POS (`/pos`)

| Field | Type | Req | Validation | Tested | Result | Issue | Fix | Retest | Status |
|---|---|---|---|---|---|---|---|---|---|
| Outlet | dropdown | yes | outlet list | every option | PASS | — | — | — | PASS |
| Table | dropdown | yes | table list | empty, every option | PASS | — | — | — | PASS |
| Menu item | search + qty | yes | menu list | search, click, qty 0/1/many | PASS | UI-0014 fixed | quantity parses correctly | 2026-10-09 PASS | PASS |
| Modifier | multi-select | conditional | per item | none, multiple | PASS | — | — | — | PASS |
| KOT print | action | yes | pushes KOT | click → KOT view | PASS | — | — | — | PASS |

### REST-FV-04 — Bills & payments (`/billing`)

| Field | Type | Req | Validation | Tested | Result | Issue | Fix | Retest | Status |
|---|---|---|---|---|---|---|---|---|---|
| Order | dropdown | yes | order list | empty, every option | PASS | — | — | — | PASS |
| Discount | currency | no | ≥ 0 | 0, valid, larger than total (capped) | PASS | UI-0015 fixed | discount cap | 2026-10-09 PASS | PASS |
| Tax | dropdown | yes | tax list | every option | PASS | UI-0016 fixed | tax reads from profile | 2026-10-09 PASS | PASS |
| Payment method | dropdown | yes | CASH / CARD / UPI / WALLET | every option | PASS | — | — | — | PASS |
| Tendered | currency | yes | ≥ total | less, equal, more (change) | PASS | — | — | — | PASS |

### REST-FV-05 — Shifts (`/shifts`)

| Field | Type | Req | Validation | Tested | Result | Issue | Fix | Retest | Status |
|---|---|---|---|---|---|---|---|---|---|
| Outlet | dropdown | yes | outlet list | every option | PASS | — | — | — | PASS |
| Opened by | lookup | auto | session user | — | PASS | — | — | — | PASS |
| Opening cash | currency | yes | ≥ 0 | empty, 0, valid | PASS | — | — | — | PASS |
| Close shift | action | conditional | only after reconciliation | click before/after | PASS | UI-0017 fixed | close flow | 2026-10-09 PASS | PASS |

### REST-FV-06 — Stations (`/stations`)

| Field | Type | Req | Validation | Tested | Result | Status |
|---|---|---|---|---|---|---|
| Name | text | yes | 1–80 | empty, dup | PASS | PASS |
| Code | text | yes | `[A-Z0-9]{2,10}` | empty, dup | PASS | PASS |
| KOT categories | multi-select | yes | category list | none, multiple | PASS | PASS |

### REST-FV-07 — Restaurant day (`/restaurant`)

Static overview — see §71 owner dashboard audit in FINAL_UI_QA_REPORT.md.

### KDS-FV-01 — Kitchen display (`/kitchen`)

| Field | Type | Req | Validation | Tested | Result | Issue | Fix | Retest | Status |
|---|---|---|---|---|---|---|---|---|---|
| Station | dropdown | yes | station list | every option | PASS | — | — | — | PASS |
| KOT status filter | multi-select | no | PLACED/PREPARING/READY/SERVED | every option | PASS | — | — | — | PASS |
| Bump | action | yes | advances state | click → state change | PASS | UI-0018 fixed | bump advances state | 2026-10-09 PASS | PASS |

---

## INVENTORY / PROCUREMENT screens (Phase A)

**Phase A status**: small-batch browser retest run 2026-10-09 (owner-approved scope: 3 suppliers, 10 items, 12 locations, one PO→GRN→Invoice→Payment→Allocation chain). Fields exercised in that chain are VERIFIED; Recipes and Stock-takes were outside the batch and stay NOT RETESTED.

### INV-FV-02 — Items (`/inventory/items`) — VERIFIED (retest: 10 items created)

| Field | Type | Req | Validation | Status |
|---|---|---|---|---|
| Name | text | yes | 1–80 | VERIFIED (retest) |
| Code | text | yes | `[A-Z0-9]{2,10}` | VERIFIED (retest) |
| Item type | dropdown | yes | STOCK / NON_STOCK / SERVICE | VERIFIED (retest) |
| Base unit | dropdown | yes | unit list | VERIFIED (retest; 051 seed fills it — UI-0030) |
| Category | dropdown | no | category list | VERIFIED (retest; 051 seed fills it) |
| Track batch | toggle | no | on/off | present; left at defaults in retest |
| Track expiry | toggle | no | on/off | present; left at defaults in retest |
| Reorder level | number | no | ≥ 0 | present; left at defaults in retest |
| Reorder quantity | number | no | ≥ 0 | present; left at defaults in retest |
| Save | submit | yes | gates required | VERIFIED (retest — 10 rows created) |

### INV-FV-05 — Locations (`/inventory/locations`) — VERIFIED (retest: 12 locations created)

### INV-FV-06 — Recipes (`/inventory/recipes`) — NOT RETESTED (code-level fix UI-0022 stands unproven)

| Field | Type | Req | Validation | Status |
|---|---|---|---|---|
| Name | text | yes | 1–80 | not exercised |
| Code | text | yes | `[A-Z0-9]{2,10}` | not exercised |
| Output item | dropdown | yes | item list | not exercised |
| Yield quantity | number | yes | > 0 | not exercised |
| Yield unit | dropdown | yes | unit list | not exercised |
| Description | text | no | ≤ 500 | not exercised |
| Notes | text | no | ≤ 500 | not exercised |
| Ingredients list | repeater | yes | ≥ 1 row | not exercised (UI-0022) |
| — Ingredient item | dropdown | yes | item list | not exercised (UI-0022) |
| — Quantity | number | yes | > 0 | not exercised (UI-0022) |
| — Unit | dropdown | yes | unit list | not exercised (UI-0022) |
| — Notes | text | no | ≤ 200 | not exercised (UI-0022) |

### INV-FV-09 — Stock takes (`/inventory/stock-takes`) — NOT RETESTED (code-level fix UI-0023 stands unproven)

| Field | Type | Req | Validation | Status |
|---|---|---|---|---|
| Location | dropdown | yes | location list | not exercised |
| Notes | text | no | ≤ 500 | not exercised |
| Count lines table | repeater | yes | ≥ 1 row | not exercised (UI-0023) |
| — Item | dropdown | yes | item list | not exercised (UI-0023) |
| — Counted qty | number | yes | ≥ 0 | not exercised (UI-0023) |
| Post | action | yes | closes take | not exercised (UI-0023) |

### PROC-FV-01 — Purchases (`/inventory/purchases`) — VERIFIED on retest scope (full chain driven)

| Field | Type | Req | Validation | Status |
|---|---|---|---|---|
| **PO header** | | | | |
| Supplier | dropdown | yes | supplier list | VERIFIED (retest — PO-2026-000005) |
| Order date | date | yes | ≤ today | VERIFIED (retest) |
| Expected delivery | date | no | ≥ order date | present; not individually exercised |
| Currency | dropdown | yes | ISO 4217 | VERIFIED (retest, default) |
| Notes | text | no | ≤ 500 | present; not individually exercised |
| **PO line items** | repeater | yes | ≥ 1 row | VERIFIED (retest — UI-0024) |
| — Item | dropdown | yes | item list | VERIFIED (retest) |
| — Quantity | number | yes | > 0 | VERIFIED (retest) |
| — Unit | dropdown | yes | unit list | VERIFIED (retest) |
| — Unit price | currency | yes | ≥ 0 | VERIFIED (retest) |
| — Tax % | number | no | 0–100 | VERIFIED (retest) |
| Approve | action | yes | DRAFT→PENDING_APPROVAL→APPROVED | VERIFIED (retest — UI-0033 two-hop) |
| **GRN** | | | | |
| PO | dropdown | yes | PO list | VERIFIED (retest) |
| Receive-into-Location | dropdown | yes | location list | VERIFIED (retest — UI-0031 fixed) |
| Received qty | number | yes | ≥ 0 | VERIFIED (retest — GRN-2026-000001) |
| Accepted qty | number | yes | ≥ 0, ≤ received | VERIFIED (retest — UI-0025) |
| Post GRN | action | yes | books stock | VERIFIED (retest — GRN POSTED, PO → RECEIVED) |
| **Invoice** | | | | |
| GRN | dropdown | yes | GRN list | VERIFIED (retest) |
| Invoice number | text | yes | unique | VERIFIED (retest — 2026-000001) |
| Invoice date | date | yes | ≤ today | VERIFIED (retest) |
| Due date | date | no | ≥ invoice date | present; not individually exercised |
| Post invoice | action | yes | door `create_purchase_invoice`+`set_…_status` | VERIFIED (retest — UI-0034 fixed via 055) |
| **Payment** | | | | |
| Supplier | dropdown | yes | supplier list | VERIFIED (retest) |
| Date | date | yes | ≤ today | VERIFIED (retest, default) |
| Method | dropdown | yes | CASH / BANK / UPI / CHEQUE | VERIFIED (retest — BANK TRANSFER) |
| Amount | currency | yes | > 0 | VERIFIED (retest — ₹27,825 and ₹100) |
| Allocation | repeater | no | invoice rows | VERIFIED (retest — ₹100 allocation → invoice PARTIALLY_PAID ₹27,725) |

### PROC-FV-02 — Suppliers (`/inventory/suppliers`) — VERIFIED (retest: 3 suppliers created + 1 archived)

| Field | Type | Req | Validation | Status |
|---|---|---|---|---|
| Legal name | text | yes | 1–200 | VERIFIED (retest) |
| Trade name | text | no | 0–200 | VERIFIED (retest) |
| Supplier type | dropdown | yes | GOODS / SERVICE / BOTH | VERIFIED (retest) |
| Tax ID | text | no | 0–30 | VERIFIED (retest) |
| Tax type | dropdown | no | GST / VAT / NONE | VERIFIED (retest) |
| Opening balance | currency | no | signed | present; not individually exercised |
| Payment terms | dropdown | no | NET_15 / NET_30 / NET_60 / COD | VERIFIED (retest — NET_30 seen on rows) |
| Credit limit | currency | no | ≥ 0 | present; not individually exercised |
| Notes | text | no | ≤ 500 | present; not individually exercised |
| Archive | action | yes | row → ARCHIVED | VERIFIED (retest — SUP-DEBUG-01 archived) |

---

## HOTEL / HK / MX screens (Phase B)

### HOTEL-FV-01 — Room types (`/hotel/room-types`) — NOT TESTED

### HOTEL-FV-02 — Rooms (`/hotel/rooms`) — NOT TESTED

### HOTEL-FV-03 — Reservations (`/hotel/reservations`) — NOT TESTED

### HOTEL-FV-04 — Reservation detail (`/hotel/reservations/:reservationId`) — NOT TESTED

### HOTEL-FV-05 — Front desk (`/hotel/front-desk`) — NOT TESTED

### HOTEL-FV-06 — Stay detail (`/hotel/stays/:stayId`) — NOT TESTED

### HOTEL-FV-07 — Guests (`/hotel/guests`) — NOT TESTED

### HOTEL-FV-08 — Lost & found (`/hotel/lost-found`) — NOT TESTED

### HOTEL-FV-09 — Assets (`/hotel/assets`) — NOT TESTED

### HK-FV-01 — Housekeeping (`/hotel/housekeeping`) — NOT TESTED

### MAINT-FV-01 — Maintenance (`/hotel/maintenance`) — NOT TESTED

---

## FINANCE screens (Phase C)

### FIN-FV-01 — Invoices (`/finance/invoices`) — NOT TESTED

### FIN-FV-02 — Payments (`/finance/payments`) — NOT TESTED

### FIN-FV-03 — Accounting (`/finance/accounting`) — NOT TESTED

### FIN-FV-04 — P&L (`/finance/profit-loss`) — NOT TESTED

---

## CRM / EVENTS / HR screens (Phase D)

_(Skeletons to be filled.)_

## COMMERCE / PUBLIC screens (Phase E)

_(Skeletons to be filled.)_

## ENTERPRISE / BILLING / NOTIFICATIONS / AI / INTEGRATIONS / PLATFORM / ONBOARDING / DOCUMENTS screens (Phase F)

_(Skeletons to be filled.)_

## WORKFLOWS / REVENUE / PROCUREMENT / EXPERIENCE / MARKETING / GUEST / SETTINGS screens (Phase G)

_(Skeletons to be filled.)_
