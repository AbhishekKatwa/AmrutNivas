# AMRUT NIVAAS — UI DEMO DATA LOG

Per Master Prompt #36 §59. Volume of realistic demo data created through the UI.

## Counts (running)

| Entity | §15 target | Created via UI | Notes |
|---|---|---|---|
| Organizations | 2-3 | 1 (seed) | amrut-nivaas-demo |
| Properties | 3-5 | 2 (seed) | hotel + restaurant |
| Outlets | 8-15 | 4 (seed) | lobby + rooftop + main-dining + private-dining |
| Departments | 10+ | 8 (seed) | front-office, HK, F&B, kitchen, maintenance, FOH, restaurant-kitchen, bar |
| Users | 15-30 | 5 (seed: OWNER / MANAGER / STAFF / HOUSEKEEPING / FINANCE) | demo creds only |
| Employees | 30-75 | 0 | — |
| Customers / Guests | 100+ | 1 (Phase B retest) | Rahul Deshmukh |
| Suppliers | 30+ | 3 (small-batch retest) | + 1 debug supplier archived |
| Inventory Items | 150+ | 10 (small-batch retest) | — |
| Categories | 30+ | 0 | — |
| Menu Items | 150+ | 0 | — |
| Modifiers | 50+ | 0 | — |
| Tables | 50+ | 0 | — |
| Rooms | 100+ | 1 (Phase B retest) | Room 102; seed provides the rest |
| Room Types | 10+ | 1 (Phase B retest) | EXEC — Executive Deluxe |
| Rate Plans | 10+ | 0 | — |
| Reservations | 100+ | 1 (small-batch retest) | RES-2026-00001 |
| Orders | 200+ | 0 | — |
| Invoices / Bills | 100+ | 0 | — |
| Purchase Requests | 50+ | 0 | — |
| Purchase Orders | 50+ | 1 (+4 cancelled retest attempts) | PO-2026-000005 |
| GRNs | 50+ | 1 | GRN-2026-000001 |
| Payments | 100+ | 2 | ₹27,825 + ₹100 (allocation proof) |
| Events | 30+ | 0 | — |
| Tasks | 100+ | 0 | — |
| Maintenance Requests | 50+ | 1 (Phase B retest) | "AC dripping water" — full lifecycle |
| Housekeeping Tasks | 100+ | 1 (Phase B retest) | Room 101 — full workflow |
| Expenses | 100+ | 0 | — |
| CRM interactions | 100+ | 0 | — |
| Feedback records | 50+ | 0 | — |
| Documents | as supported | 0 | — |
| Notifications | as supported | 0 | — |
| Automation rules | as supported | 0 | — |

## Realism rules (§56)

- No "Test 1 / Test 2 / ABC" names.
- Use names from §56 examples: The Grand Spice, Royal Banquet, Sunrise Suite, Executive Deluxe, Garden Pavilion, Masala Kitchen, Blue Orchid Events, Premium Business Room.
- Varied prices / dates / statuses / quantities.
- Multi-property: every record scoped to a real propertyId; never span properties.

## Seed state (before Prompt #36)

The 007_seed_demo_dev.sql migration inserts:

- 1 organization
- 2 properties (HOTEL + RESTAURANT)
- 4 outlets
- 8 departments
- A small menu + rooms + tables set
- Demo users with `amrut-nivas.local` emails

That is the foundation; Prompt #36 extends it through the UI, not through SQL.

---

## Phase A — Inventory / Procurement data

### Phase A — Code-level only (no UI data creation yet)

The Phase A defects (UI-0019 through UI-0026) were fixed at the code level by extending the page components with the missing create/edit dialogs and the corresponding service calls. `tsc --noEmit` is clean. The full §15 target volume (150+ items, 30+ suppliers, 50+ POs/GRNs, 100+ payments, 20+ wastages, 15+ transfers, 5+ stock takes, 30+ recipes) has **not yet been created through the UI** — the prior subagent exhausted its turn budget on the dialog work and never reached the data-entry pass.

| Entity | §15 target | Created via UI | Code-level create UI present? | Notes |
|---|---|---|---|---|
| Suppliers | 30+ | 0 | YES (UI-0019 fixed) | Awaiting UI data pass |
| Inventory Items | 150+ | 0 | YES (UI-0021 fixed) | Awaiting UI data pass |
| Categories | 30+ | 0 | YES (ItemsPage form has `category_id` select) | Awaiting UI data pass |
| Stock Locations | 10+ | 0 | UI was already CRUD | Awaiting UI data pass (12 locations planned) |
| Units of Measure | 8+ | 0 (seed) | n/a | Seed provides base units |
| Purchase Orders | 50+ | 0 | YES (UI-0020 + UI-0024 fixed) | Awaiting UI data pass |
| Goods Receipts (GRN) | 50+ | 0 | YES (UI-0020 + UI-0025 fixed) | Awaiting UI data pass |
| Supplier Invoices | 50+ | 0 | YES (UI-0020 fixed) | Awaiting UI data pass |
| Supplier Payments | 100+ | 0 | YES (UI-0020 + UI-0026 fixed) | Awaiting UI data pass |
| Stock Wastage | 20+ | 0 | YES (WastagePage already CRUD) | Awaiting UI data pass |
| Stock Transfers | 15+ | 0 | YES (TransfersPage already CRUD) | Awaiting UI data pass |
| Stock Takes | 5+ | 0 | YES (UI-0023 fixed) | Awaiting UI data pass |
| Recipes | 30+ | 0 | YES (UI-0022 fixed) | Awaiting UI data pass |
| Recipe ingredients | n/a | 0 | YES (UI-0022 fixed) | Awaiting UI data pass |
| Cross-module chain (PO→GRN→Invoice→Payment→Ledger) | end-to-end | 0 | YES (all 4 tabs fixed) | Weighted-avg verification NOT YET RUN |

**Honest verdict for Phase A data creation**: code-level fixes land; the UI data pass was scoped too large for the available subagent turns. Each record is ~5-10 browser tool calls (navigate, snapshot, click, fill, save, verify) so 12 locations + 150 items + 30 suppliers + 50 POs ≈ 1500 calls — far beyond one 150-turn subagent. Realistic schedule: a future Phase A retest pass that drives the browser and creates records in batches, then independently verifies the weighted-avg cost ledger entry.

### Small-batch retest data (2026-10-09, browser-driven, OWNER001, hosted DB)

Owner-picked scope ("small-batch retest"): 3 suppliers, 10 items, 1 PO→GRN→Invoice→Payment chain + 1 allocation. All created through the real dialogs.

| Record | Detail |
|---|---|
| Suppliers (3) | Shree Balaji Feeds & Traders · SUP-MV0JGC9P8WJ Metro Packaging Industries · Anand Pharma & Chemicals (Anand Chem) |
| Items (10) | Maize (Yellow), soy, DDGS, medicines, etc. — base units/categories from 051 seed |
| Locations (12) | Main Store + 11 more |
| PO-2026-000005 | Shree Balaji Feeds & Traders, line items, ₹27,825 — APPROVED→RECEIVED. (PO-2026-000001..004 CANCELLED — duplicate/aborted retest attempts) |
| GRN-2026-000001 | Received against PO-2026-000005 into Main Store — POSTED |
| Invoice 2026-000001 | ₹27,825 — POSTED |
| Payment 2026-000001 | ₹27,825 BANK TRANSFER — recorded, UNALLOCATED |
| Payment 2 | ₹100 BANK TRANSFER with allocation row to invoice 2026-000001 — allocation proven: invoice → PARTIALLY_PAID, outstanding ₹27,825 → ₹27,725 |
| Cleanup | Debug Probe Supplier (SUP-DEBUG-01) archived after the direct-rpc probe |

DB-side actions taken during the retest (documented for auditability):

- `051_seed_units_categories.sql` — units_of_measure + inventory_categories seed (UI-0030).
- `055_app_evaluate_access_overload.sql` — 3-arg guard overload for the seven 031 doors (UI-0034).
- `056_hotel_audit_calls.sql` — 47 hotel doors re-created with audit slot 6 normalized (UI-0036); applied + ledger-recorded via `db/harness/apply-056-only.mjs` (targeted single-file apply because of the ledger gap below).
- **Hosted ledger discrepancy**: `app.schema_migrations` records 000–049 **plus 055** (and now 056), but 050–054 are applied-yet-unrecorded (they were applied out-of-band while under edit). A future `remote-apply.mjs apply` run will list 050–054 as unapplied and re-attempt them — reconcile the ledger (manual INSERT of those five names) before the next hosted apply.

## Phase B — Hotel / HK / MX data

Browser-driven 2026-10-09 as OWNER001 against the hosted DB (small-batch retest). One continuous chain: guest → reservation → HK task → check-in → extend → move → checkout → maintenance lifecycle → lost-found → asset.

| Record | Detail |
|---|---|
| Room type EXEC | Executive Deluxe · 2–3 guests · 320 sq ft · bed_configuration `[]` — first write through the repaired create_room_type + 056 audit funnel (UI-0035/0036). Created via UI on `/hotel/room-types`. |
| Guest Rahul Deshmukh | +91 98220 11223 · id `b5be2042-2548-4373-8575-15d9d8225c72` · client mints the `GST-…` guest code (UI-0037). Created via `/hotel/guests`. |
| Room 102 | Executive Deluxe · Floor 2 · id `b5401c49-7f22-4659-a92f-7ac4e0049396` · housekeeping status door-defaulted. Created via `/hotel/rooms`. |
| Reservation RES-2026-00001 | WALK_IN · guest chosen via the search→select flow · 2026-10-09→2026-10-11 · 2 adults / 0 children / 0 infants · EXEC · CONFIRMED. Created via `/hotel/reservations`. |
| Housekeeping task (Room 101) | Full workflow driven: create → assign → start → complete → verify; room VACANT_CLEAN→INSPECTED (UI-0038/0039). |
| Stay `ff5ef366-6d3c-43bb-96ca-92b99fa4ab3b` | Check-in → extend (EXTENDED, UI-0044) → move Room 101→102 (UI-0043, reason required) → early-departure checkout (UI-0047). All writes [200]. |
| Maintenance "AC dripping water" | Room 102 · assign [200] reqid 10097 → start 10101 → resolve 10105 (costs booked) → verify 10109 → close 10113; close side effect: Room 102 → ACTIVE. |
| Lost-found umbrella | Room 101 · "Front desk closet, shelf 2" · create reqid 11292 → return reqid 11303 · FOUND→RETURNED (UI-0050). |
| Asset AC-101 | Split AC 1.5 ton · AC · Room 101 · "Above the wardrobe" · SN-DAIKIN-2026-0115 · Daikin FTKF50TV16 · installed 2026-01-15 · ₹38,500 · warranty to 2031-01-15 · create [200] reqid 11600; notes-only edit reqid 11604 — Room 101 survived the edit (null-means-unchanged proven). |

## Phase C — Finance data

**No records created** — the four finance screens (`/finance/invoices`, `/finance/payments`, `/finance/accounting`, `/finance/profit-loss`) are read-only ledgers; Phase C verified their reads against the existing Phase A/B dataset (bills ₹523 PAID, supplier payments ₹27,825 + ₹100, folio unsettled, no event payments, 5 POs all CANCELLED/RECEIVED). All four screens rendered reconciling KPIs with permissions 353.

DB-side action taken during Phase C (documented for auditability):

- `057_route_guard_permission_grants.sql` — grant-only RBAC convergence for the 62 route-guard keys that existed in no migration (UI-0053); applied + ledger-recorded via `db/harness/apply-057-only.mjs`. Owner permission count 312 → 353. Residual: `revenue.pricing.edit` still ungranted (Phase G).

## Phase D — CRM / Events / HR data

## Phase E — Commerce / Public data

## Phase F — Enterprise / Billing / Notifications / AI / Integrations / Platform / Onboarding / Documents data

## Phase G — Workflows / Revenue / Procurement / Experience / Marketing / Guest / Settings data
