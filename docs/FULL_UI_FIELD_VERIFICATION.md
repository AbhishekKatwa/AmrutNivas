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

**Phase B status**: browser-driven 2026-10-09 as OWNER001 against the hosted DB — the chain guest → WALK_IN reservation → housekeeping task (room VACANT_CLEAN → INSPECTED) → front-desk check-in → extend → move → early-departure checkout, plus maintenance full lifecycle, lost-found create→return, and assets create→edit. Fields exercised in those flows are VERIFIED; the rest are marked "present; not individually exercised".

### HOTEL-FV-01 — Room types (`/hotel/room-types`) — VERIFIED (create path, retest after UI-0035/0036)

| Field | Type | Req | Validation | Status |
|---|---|---|---|---|
| Code | text | yes | unique, e.g. EXEC | VERIFIED (retest) |
| Name | text | yes | Executive Deluxe | VERIFIED (retest) |
| Description | textarea | no | left blank | VERIFIED (retest, omitted) |
| Max occupancy | number | yes | 3 | VERIFIED (retest) |
| Base occupancy | number | yes | 2 | VERIFIED (retest) |
| Room size sq ft | number | no | 320 | VERIFIED (retest) |
| Bed configuration | (not in dialog) | no | door default `[]` | VERIFIED — UI-0035: client must send `[]`, not explicit null (23502) |
| Create room type | action | yes | door `create_room_type` + 054 audit funnel | VERIFIED — UI-0036: 056 normalized audit slot 6 (42883); row renders "EXEC · 2–3 guests · 320 sq ft" |
| Edit / Archive | actions | — | update/archive room type | present; not individually exercised |

### HOTEL-FV-02 — Rooms (`/hotel/rooms`) — VERIFIED (create path)

| Field | Type | Req | Validation | Status |
|---|---|---|---|---|
| Room number | text | yes | unique per property | VERIFIED (retest — 102) |
| Room type | dropdown | yes | room-type list | VERIFIED (retest — Executive Deluxe) |
| Floor | text | no | free text | VERIFIED (retest — "2") |
| Remaining optional fields | — | no | — | left at defaults in retest |
| Create room | action | yes | door `create_room`, defaults the housekeeping status | VERIFIED (retest — Room 102 `b5401c49-7f22-4659-a92f-7ac4e0049396`; later returned to ACTIVE by the maintenance-close side effect) |
| Edit / Archive | actions | — | — | present; not individually exercised |

### HOTEL-FV-03 — Reservations (`/hotel/reservations`) — VERIFIED (create path)

| Field | Type | Req | Validation | Status |
|---|---|---|---|---|
| Guest | lookup (search → select) | yes | guest list | VERIFIED (retest — search → select flow → Rahul Deshmukh) |
| Source | dropdown | yes | WALK_IN / … | VERIFIED (retest — WALK_IN) |
| Arrival | date | yes | — | VERIFIED (retest — 2026-10-09) |
| Departure | date | yes | ≥ arrival | VERIFIED (retest — 2026-10-11) |
| Adults / Children / Infants | number | yes | ≥ 0 | VERIFIED (retest — 2 / 0 / 0) |
| Room type | dropdown | yes | room-type list | VERIFIED (retest — EXEC) |
| Special requests | text | no | left blank | VERIFIED (retest, omitted) |
| Create reservation | action | yes | door `create_reservation` | VERIFIED (retest — RES-2026-00001 CONFIRMED) |
| Cancel / modify actions | — | — | — | present; not individually exercised |

### HOTEL-FV-04 — Reservation detail (`/hotel/reservations/:reservationId`) — NOT TESTED

The chain went through the front desk, not the reservation detail page.

### HOTEL-FV-05 — Front desk (`/hotel/front-desk`) — VERIFIED (availability + arrival + in-house)

| Field | Type | Req | Validation | Status |
|---|---|---|---|---|
| Availability (room stats) | derived | n/a | sellable = operationalStatus ACTIVE + housekeeping (VACANT_CLEAN \| INSPECTED) | VERIFIED — UI-0040: 3 sellable-filter sites fixed; "Available 1" |
| Arrival row | list | n/a | offers sellable rooms for the arrival | VERIFIED (retest — Room 101 offered for RES-2026-00001) |
| Check-in | action | yes | gates on real keys (`frontoffice.checkin`) + door `check_in` (5 args incl. `p_expected_check_out`) | VERIFIED — UI-0041/0042: `[200]`, stay created |
| In-house list | list | n/a | shows current stays | VERIFIED (guest listed while in house; cleared after early-departure checkout) |

### HOTEL-FV-06 — Stay detail (`/hotel/stays/:stayId`) — VERIFIED (extend / move / early-departure checkout)

| Field | Type | Req | Validation | Status |
|---|---|---|---|---|
| Stay read (guests, room moves) | read | n/a | real columns only | VERIFIED — UI-0046: both reads `[200]`, page renders |
| Extend stay | action | yes | door `extend_stay` + `p_expected_version` | VERIFIED — UI-0044: `[200]`, status → EXTENDED |
| Move room | action + reason dropdown | yes | door `move_room` `p_new_room` + `p_reason` (Guest request / Maintenance / Upgrade / Operational / Other) | VERIFIED — UI-0043/0047: moved Room 101 → Room 102 on the EXTENDED stay |
| Check out | action | yes | gates include EXTENDED | VERIFIED — UI-0047: early-departure checkout succeeded |
| Routes to detail | navigation | n/a | `/hotel/stays/…` registered | VERIFIED — UI-0045 |

### HOTEL-FV-07 — Guests (`/hotel/guests`) — VERIFIED (create path)

| Field | Type | Req | Validation | Status |
|---|---|---|---|---|
| Full name | text | yes | non-empty | VERIFIED (retest — Rahul Deshmukh) |
| Phone | text | no | free text | VERIFIED (retest — +91 98220 11223) |
| Remaining optional fields | — | no | — | left at defaults in retest |
| Create guest | action | yes | door `create_guest`; client mints `p_guest_code` (GST-…), DOB arg renamed, source defaults DIRECT | VERIFIED — UI-0037 |

### HOTEL-FV-08 — Lost & found (`/hotel/lost-found`) — VERIFIED (create → return)

| Field | Type | Req | Validation | Status |
|---|---|---|---|---|
| Item name | text | yes | non-empty | VERIFIED (retest — umbrella) |
| Room | dropdown | yes | room list | VERIFIED (retest — Room 101) |
| Location description | text | no | free text | VERIFIED (retest — "Front desk closet, shelf 2") |
| Remaining optional fields | — | no | — | left at defaults in retest |
| Create item | action | yes | door mints status FOUND | VERIFIED — `create_lost_found_item [200]` reqid 11292 |
| Return | action | yes | door accepts any non-terminal → RETURNED | VERIFIED — UI-0050: `return_lost_found_item [200]` reqid 11303; pill FOUND → RETURNED |
| Dispose | action | — | — | present; not individually exercised |

### HOTEL-FV-09 — Assets (`/hotel/assets`) — VERIFIED (create + edit)

| Field | Type | Req | Validation | Status |
|---|---|---|---|---|
| Asset code | text | yes | non-empty; disabled while editing | VERIFIED (retest — AC-101) |
| Name | text | yes | non-empty | VERIFIED (retest — Split AC 1.5 ton) |
| Category | dropdown | yes | AC / TV / … | VERIFIED (retest — AC) |
| Room | dropdown | no | "No specific room" empty option enabled | VERIFIED (retest — Room 101; UI-0051 fix live) |
| Location description | text | no | free text | VERIFIED (retest — "Above the wardrobe") |
| Serial number | text | no | free text | VERIFIED (retest — SN-DAIKIN-2026-0115) |
| Manufacturer | text | no | free text | VERIFIED (retest — Daikin) |
| Model number | text | no | free text | VERIFIED (retest — FTKF50TV16) |
| Purchase date | date | no | — | VERIFIED (retest — 2026-01-15) |
| Purchase cost | currency | no | ≥ 0 | VERIFIED (retest — 38500) |
| Warranty end date | date | no | — | VERIFIED (retest — 2031-01-15) |
| Notes | textarea | no | free text | VERIFIED (retest — set at create, then changed in edit) |
| Create asset | action | yes | door `create_asset` (13 args) | VERIFIED — `create_asset [200]` reqid 11600 |
| Save changes (edit) | action | yes | door `update_asset`; sparse input + `p_expected_version`; untouched fields sent null = unchanged | VERIFIED — `update_asset [200]` reqid 11604; notes-only edit preserved the Room 101 link (null-means-unchanged proven) |

### HK-FV-01 — Housekeeping (`/hotel/housekeeping`) — VERIFIED (full task workflow)

| Field | Type | Req | Validation | Status |
|---|---|---|---|---|
| Room | dropdown | yes | honest unselected state | VERIFIED — UI-0038: placeholder "Choose a room…" |
| Task type | dropdown | yes | task-type list | VERIFIED (retest) |
| Priority | dropdown | no | — | left at default in retest |
| Notes | text | no | — | left at default in retest |
| Create task | action | yes | door `create_housekeeping_task` (`p_stay_id`, not `p_stay`) | VERIFIED — UI-0039 |
| Assign / Start / Complete / Verify | actions | yes | PENDING → ASSIGNED → IN_PROGRESS → COMPLETED → verified | VERIFIED (retest — full chain on Room 101; room VACANT_CLEAN → INSPECTED) |

### MAINT-FV-01 — Maintenance (`/hotel/maintenance`) — VERIFIED (full lifecycle)

| Field | Type | Req | Validation | Status |
|---|---|---|---|---|
| Title / description | text | yes | non-empty | VERIFIED (retest — "AC dripping water") |
| Room | dropdown | yes | no duplicate empty option | VERIFIED — UI-0049 fix probe `["No specific room[enabled]","Room 101[enabled]","Room 102[enabled]"]` |
| Estimated cost | (removed) | — | door takes no such param | VERIFIED — UI-0048: field removed from the sheet |
| Create request | action | yes | door `create_maintenance_request` | VERIFIED — UI-0048 |
| Assign | action | yes | raw staff-UUID text input (see ledger observation) | VERIFIED — `assign_maintenance_request [200]` reqid 10097 |
| Start | action | yes | — | VERIFIED — `[200]` reqid 10101 |
| Resolve (with costs) | action | yes | cost fields | VERIFIED — `[200]` reqid 10105 |
| Verify | action | yes | — | VERIFIED — `[200]` reqid 10109 |
| Close | action | yes | side effect: room back to ACTIVE | VERIFIED — `[200]` reqid 10113; Room 102 → ACTIVE |

---

## FINANCE screens (Phase C)

**Phase C status**: browser-driven 2026-10-09 as OWNER001 against the hosted DB after the read-layer fixes (UI-0052) and the route-guard grant migration 057 (UI-0053). All four screens are read-only ledgers — no forms — so fields below are the KPI cards and list rows; each was checked against the known Phase A/B money (bills ₹523 PAID, supplier payments ₹27,925 + ₹100, folio unsettled, no event payments, 5 POs all CANCELLED/RECEIVED).

### FIN-FV-01 — Invoices (`/finance/invoices`) — VERIFIED (UI-0052)

| Field | Type | Req | Validation | Tested | Result | Issue | Fix | Retest | Status |
|---|---|---|---|---|---|---|---|---|---|
| Total Invoices | KPI | n/a | count of bills (excl. CANCELLED) + folios | render | PASS | UI-0052 phantom `bills.table_name` + `folios.guest_name` | columns dropped; CANCELLED excluded; errors now thrown | 2026-10-09 PASS | PASS |
| Outstanding | KPI | n/a | UNPAID/PARTIALLY_PAID bills | render | PASS | — | — | — | PASS |
| Paid | KPI | n/a | PAID bills | render | PASS | — | — | — | PASS |
| Revenue | KPI | n/a | sum of bill totals | render | PASS | — | — | — | PASS |
| Invoice rows | list | n/a | bill no · party · status · amount · date | render (2 rows) | PASS | — | — | — | PASS |

Observed: Total Invoices 2 · Outstanding ₹0 · Paid ₹523 · Revenue ₹523; BILL-000001 ₹248 PAID + BILL-000002 ₹275 PAID ("Walk-in · Restaurant", 09/10/2026). Permissions 353 after 057.

### FIN-FV-02 — Payments (`/finance/payments`) — VERIFIED (UI-0052)

| Field | Type | Req | Validation | Tested | Result | Issue | Fix | Retest | Status |
|---|---|---|---|---|---|---|---|---|---|
| Received | KPI | n/a | sum of money-in rows | render | PASS | UI-0052 swallowed read errors | firstError thrown after Promise.all | 2026-10-09 PASS | PASS |
| Made | KPI | n/a | sum of supplier payments | render | PASS | — | — | — | PASS |
| Net Flow | KPI | n/a | in − out | render | PASS | — | — | — | PASS |
| Transactions | KPI | n/a | row count | render | PASS | — | — | — | PASS |
| Recent payments | list | n/a | ref · source · method · date · ± amount | render (6 rows) | PASS | — | — | — | PASS |

Observed: Received ₹523 (100+48+100+275) · Made ₹27,925 · Net ₹−27,402 · 6 rows (4 Received + 2 Paid, CASH/CARD/UPI/BANK_TRANSFER).

### FIN-FV-03 — Accounting (`/finance/accounting`) — VERIFIED (UI-0052)

| Field | Type | Req | Validation | Tested | Result | Issue | Fix | Retest | Status |
|---|---|---|---|---|---|---|---|---|---|
| Accounts (active categories) | KPI | n/a | summary group count | render | PASS | — | — | — | PASS |
| Credits | KPI | n/a | revenue accounts | render | PASS | — | — | — | PASS |
| Debits | KPI | n/a | expense accounts | render | PASS | — | — | — | PASS |
| Net | KPI | n/a | credits − debits | render | PASS | — | — | — | PASS |
| Restaurant Sales / Room / Event | breakdown | n/a | bills / settled folios / **event_payments** | render | PASS | UI-0052: events had no `total_amount` column (phantom) | event income re-based onto `event_payments.amount` | 2026-10-09 PASS | PASS |
| Procurement Payments | expense row | n/a | POSTED supplier payments | render | PASS | — | — | — | PASS |
| Purchase Orders (open) | commitment row | n/a | only genuinely open statuses | render | PASS | UI-0052: unfiltered PO read mislabelled CANCELLED/RECEIVED as commitments | `.in(status, [DRAFT, PENDING_APPROVAL, APPROVED, SENT, PARTIALLY_RECEIVED])` | 2026-10-09 PASS | PASS |

Observed: Credits ₹523 · Debits ₹27,925 · Net ₹−27,402 · Room/Event ₹0 · **Purchase Orders (open) ₹0** (the 5 seeded POs are all CANCELLED/RECEIVED and are now correctly excluded).

### FIN-FV-04 — P&L (`/finance/profit-loss`) — VERIFIED (UI-0052)

| Field | Type | Req | Validation | Tested | Result | Issue | Fix | Retest | Status |
|---|---|---|---|---|---|---|---|---|---|
| Total Income | KPI | n/a | restaurant + hotel + events | render | PASS | UI-0052 phantom `events.total_amount` | event income re-based onto `event_payments.amount` | 2026-10-09 PASS | PASS |
| Total Expenses | KPI | n/a | POSTED supplier payments | render | PASS | — | — | — | PASS |
| Net Profit | KPI | n/a | income − expenses | render | PASS | — | — | — | PASS |
| Margin | KPI | n/a | profit % | render | PASS | — | — | — | PASS |
| Income breakdown | bars | n/a | shares of income | render | PASS | — | — | — | PASS |
| Summary | block | n/a | gross income / expenses / net | render | PASS | — | — | — | PASS |

Observed: Income ₹523 (Restaurant 100.0%) · Expenses ₹27,925 · Net ₹−27,402 · Margin −5239.4% (−27,402/523 — arithmetic verified). Console clean on all four screens; no error banner anywhere (reads now surface failures instead of rendering zeros).

---

## CRM / EVENTS / HR screens (Phase D)

_(Skeletons to be filled.)_

## COMMERCE / PUBLIC screens (Phase E)

_(Skeletons to be filled.)_

## ENTERPRISE / BILLING / NOTIFICATIONS / AI / INTEGRATIONS / PLATFORM / ONBOARDING / DOCUMENTS screens (Phase F)

_(Skeletons to be filled.)_

## WORKFLOWS / REVENUE / PROCUREMENT / EXPERIENCE / MARKETING / GUEST / SETTINGS screens (Phase G)

_(Skeletons to be filled.)_
