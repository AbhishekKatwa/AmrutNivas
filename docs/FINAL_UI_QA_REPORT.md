# AMRUT NIVAAS — FINAL UI QA REPORT

Per Master Prompt #36 §77. Final release verdict.

## Executive Summary

| Counter | Value |
|---|---|
| Total screens discovered | 100+ (105 routes registered; ~100 distinct surfaces) |
| Total screens tested | TBD — covered here at end of Phase I |
| Total fields tested | TBD |
| Total forms tested | TBD |
| Total buttons tested | TBD |
| Total workflows tested | TBD |
| Total demo records created | TBD |
| Total defects found | TBD |
| Total defects fixed | TBD |
| Remaining defects | TBD |
| Blocked items | TBD |

## Module Results

| Module | Result | Notes |
|---|---|---|
| Authentication | TBD | AUTH-004 FAIL (UI-0004 server half) |
| Organization | TBD | all PASS |
| Property / Outlet / Dashboard | TBD | all PASS |
| Restaurant | TBD | all PASS (after stabilization) |
| KDS | TBD | all PASS |
| Inventory | PASS on retest scope | Items create UI-0021 verified (10 items); locations CRUD verified (12); UI-0022/0023 recipes & stock-takes NOT retested (code-level only). Defects UI-0028/0030/0032 found+fixed. |
| Procurement | PASS on retest scope | PO→GRN→Invoice→Payment→Allocation chain browser-proven end-to-end (PO-2026-000005 → GRN-2026-000001 → invoice 2026-000001 → 2 payments). Defects UI-0027/0029/0031/0033/0034 found+fixed. |
| Hotel PMS | PASS on retest scope | Guest→reservation→stay chain browser-proven (UI-0037..0047); rate-plan doors have no UI surface (observation, DEFERRED) |
| Housekeeping | PASS on retest scope | Full task workflow proven (create→assign→start→complete→verify; room VACANT_CLEAN→INSPECTED); UI-0038/0039 fixed |
| Maintenance | PASS on retest scope | Full lifecycle proven incl. costs + room-status side effect; UI-0048/0049 fixed |
| Finance | PASS on read-layer scope | All four screens browser-driven as OWNER001 after UI-0052 (phantom columns, swallowed errors, open-PO mislabel) and UI-0053 (057 route-guard grants; permissions 312→353). KPIs reconcile with the Phase A/B money; PO commitments now ₹0. |
| CRM | TBD | Phase D |
| Events | TBD | Phase D |
| HR | TBD | Phase D |
| Commerce | TBD | Phase E |
| Public pages | TBD | Phase E |
| Enterprise | TBD | Phase F |
| Billing | TBD | Phase F |
| Notifications | TBD | Phase F |
| AI | TBD | Phase F |
| Integrations | TBD | Phase F |
| Platform Admin | TBD | Phase F |
| Onboarding | TBD | Phase F |
| Documents | TBD | Phase F |
| Operations | TBD | Phase G |
| Revenue | TBD | Phase G |
| Procurement Intelligence | TBD | Phase G |
| Experience | TBD | Phase G |
| Marketing | TBD | Phase G |
| Guest Experience | TBD | Phase G |
| Settings | TBD | Phase G |

## Phase A — Inventory + Procurement (RESULT)

Code-level fixes (UI-0019..0026) were followed by the owner-approved **small-batch browser retest** (2026-10-09): 3 suppliers, 10 items, 12 locations, and one full PO→GRN→Invoice→Payment→Allocation chain driven through the real screens against the hosted DB, signed in as OWNER001.

| Module | Result | Notes |
|---|---|---|
| Inventory | PASS on retest scope | 10 items + 12 locations created via UI; Items dialog (UI-0021) verified. UI-0022 Recipes / UI-0023 Stock-takes NOT retested — code-level fix stands unproven. |
| Procurement | PASS on retest scope | Full chain proven: PO-2026-000005 (₹27,825) APPROVED→RECEIVED; GRN-2026-000001 POSTED; invoice 2026-000001 POSTED; payment 2026-000001 (₹27,825) + ₹100 allocation → invoice PARTIALLY_PAID ₹27,725 outstanding. |

**Phase A defects**: 16 total — UI-0019..0026 (missing create UIs, all fixed) + UI-0027..0034 (surfaced by the retest: service↔door mismatches, empty seed dropdowns, double-`p_` mangling, illegal PO transition + hidden errors, missing 3-arg `app.evaluate_access`). 14 VERIFIED in browser; UI-0022/0023 NOT RETESTED. See `MANUAL_UI_DEFECTS.md` Phase A records.

**Phase A data created via UI**: 3 suppliers, 10 items, 12 locations, 1 PO, 1 GRN, 1 invoice, 2 payments, 1 allocation (small-batch scope). §15 volume targets (150+ items / 30+ suppliers / 50+ POs+GRNs / 100+ payments) remain NOT met — the retest proves the paths, not the volume.

**Phase A scope-vs-budget finding**: §15 demo-data targets require thousands of browser tool calls; per owner decision the retest was scoped small ("Small-batch retest") and defects flipped to VERIFIED only when browser-proven. Volume data entry remains a future pass.

## Phase B — Hotel PMS + HK + MX (RESULT)

All Phase B fixes (UI-0037..0051) were proven in the browser against the hosted DB, signed in as OWNER001 (2026-10-09), through one continuous chain: guest **Rahul Deshmukh** created (UI-0037) → walk-in reservation **RES-2026-00001** (EXEC · 2 adults · 2026-10-09→11 · CONFIRMED) → housekeeping task on Room 101 (VACANT_CLEAN→INSPECTED, UI-0038/0039) → check-in (UI-0041/0042) → extend stay → **EXTENDED** (UI-0044) → move Room 101→102 (UI-0043/0047) → early-departure checkout (UI-0047) → maintenance "AC dripping water" full lifecycle on Room 102 with costs, closing Room 102 back to ACTIVE (UI-0048/0049) → lost-found umbrella FOUND→RETURNED (UI-0050) → asset **AC-101** created + notes-only edit proving null-means-unchanged (reqids 11600/11604).

| Screen | Result | Notes |
|---|---|---|
| `/hotel/room-types` | PASS | EXEC create + row render (UI-0035/0036, verified at Phase A close-out) |
| `/hotel/rooms` | PASS | Room 102 (Executive Deluxe · Floor 2) created; housekeeping status door-defaulted |
| `/hotel/guests` | PASS | Guest create dialog fixed (UI-0037); guest code minted client-side |
| `/hotel/reservations` | PASS | Walk-in RES-2026-00001 via the search→select guest flow |
| `/hotel/front-desk` | PASS | Sellable filter fixed (UI-0040); permission gates realigned (UI-0041); check-in live [200] |
| `/hotel/stays/:id` | PASS | Stay read layer fixed (UI-0046); extend/move/checkout all [200]; routes fixed (UI-0045) |
| `/hotel/housekeeping` | PASS | Correct RPC + Room select (UI-0038/0039); full task workflow |
| `/hotel/maintenance` | PASS | Full lifecycle incl. costs; close side effect Room 102 → ACTIVE (UI-0048/0049) |
| `/hotel/lost-found` | PASS | Return action repaired (UI-0050); FOUND→RETURNED |
| `/hotel/assets` | PASS | 12-field create + notes-only edit; null-means-unchanged proven |

**Phase B defects**: 15 found, all fixed + browser-verified (UI-0037..0051). See `MANUAL_UI_DEFECTS.md` Phase B records + the observations appendix.

**Phase B data created via UI**: 1 room type, 1 guest, 1 room, 1 reservation, 1 stay (check-in→extend→move→checkout), 1 housekeeping task (full workflow), 1 maintenance request (full lifecycle), 1 lost-found item (FOUND→RETURNED), 1 asset (create + edit). §15 volume targets (100+ guests, 100+ rooms, 10+ room types, 100+ reservations, 100+ HK tasks, 50+ maintenance requests) remain NOT met — the retest proves the paths, not the volume.

**Phase B observations (recorded, not fixed)**: the five 035 rate-plan doors have no client caller and `/hotel/rate-plans` is unregistered; `revenue.pricing.view/edit` was never seeded in any migration so `evaluate_access` refuses every role; assign dialogs expose raw staff UUIDs; Housekeeping "Completed" pill is title-cased; checkout has no confirm dialog. All DEFERRED / OBSERVATION in `MANUAL_UI_DEFECTS.md`.

## Phase C — Finance (RESULT)

Phase C is four **read-only** screens (`/finance/invoices`, `/finance/payments`, `/finance/accounting`, `/finance/profit-loss`), so the QA shape is read-layer verification, not form driving. Two P0 blockers were found and fixed:

1. **UI-0052 — the finance read layer was written against an imagined schema.** Invoices selected `bills.table_name` + `folios.guest_name` (no such columns → PGRST204/42703); Accounting and P&L read `events.total_amount` — the `events` table has no amount column (042 puts `quoted_amount`/`actual_amount` on `event_vendors` as vendor COST; real event income is `event_payments.amount`). Because every page destructured `const { data } = await` without checking `error`, all of this failed silently and rendered zeros — a §75 violation on four screens at once. Fix: phantom columns dropped, event income re-based onto `event_payments.amount`, CANCELLED bills excluded, "Purchase Orders (open)" filtered to genuinely open statuses, and `firstError` thrown after every `Promise.all`.
2. **UI-0053 — 62 route-guard permission keys existed in no migration.** `/finance/invoices` opened to "Access restricted" for the OWNER. The client catalogue's route-guard vocabulary and the SQL RBAC matrix had drifted apart exactly the way 006's header warns. Fix: grant-only migration `057_route_guard_permission_grants.sql` (ORG_OWNER/ORG_ADMIN all 56 org keys; PLATFORM_ADMIN only the six platform views per §41; FINANCE_MANAGER/EVENT_MANAGER/HR_MANAGER their own domains), applied hosted and ledger-recorded.

Browser-verified as OWNER001 after the fixes (permissions 312 → 353):

| Screen | Result | Observed |
|---|---|---|
| `/finance/invoices` | PASS | Total Invoices 2 · Outstanding ₹0 · Paid ₹523 · Revenue ₹523; BILL-000001 ₹248 + BILL-000002 ₹275 PAID |
| `/finance/payments` | PASS | Received ₹523 (100+48+100+275) · Made ₹27,925 · Net ₹−27,402 · 6 rows |
| `/finance/accounting` | PASS | Credits ₹523 · Debits ₹27,925 · Net ₹−27,402 · **Purchase Orders (open) ₹0** (5 seeded POs all CANCELLED/RECEIVED, correctly excluded) |
| `/finance/profit-loss` | PASS | Income ₹523 (Restaurant 100%) · Expenses ₹27,925 · Net ₹−27,402 · margin −5239.4% |

Every figure reconciles with the Phase A/B money on the hosted DB. Console clean; targeted tsc clean on the four files; no error banners (reads now surface failures instead of rendering zeros).

**Phase C defects**: 2 found (UI-0052, UI-0053), both P0, both fixed + browser-verified. One residual recorded: `revenue.pricing.edit` remains ungranted (RateCalendar edit affordances hidden; screens reachable) — deferred to Phase G with a probe-first rule.

**Phase C data created via UI**: none — read-only screens; reads verified against the Phase A/B dataset.

## Critical Defects (P0 / P1)

_(Phase A P0s, all fixed + browser-verified: UI-0027 (service↔door column mismatch), UI-0029 (door param mismatches), UI-0032 (`toDoorArgs` double-`p_` mangling — ~900 call sites), UI-0034 (missing 3-arg `app.evaluate_access` on the seven 031 doors), UI-0035 (`bed_configuration` explicit-null 23502), UI-0036 (48 hotel doors' audit slot-6 uuid → 42883, fixed by 056). P1s: UI-0019/0020/0021/0024/0028/0030/0031/0033. Phase B P0s, all fixed + browser-verified: UI-0037 (guest create: missing `p_guest_code`, `p_dob`→`p_date_of_birth`, `p_source ?? null` overriding the door's `'DIRECT'` default → 23502), UI-0039 (create_housekeeping_task called with a non-existent RPC name), UI-0041 (phantom permission keys `stay.check_in`/`stay.check_out`/`stay.edit` vs the doors' `frontoffice.checkin`/`frontoffice.checkout`/`stay.modify`/`frontoffice.room_move`), UI-0042 (check_in missing `p_expected_check_out` timestamptz), UI-0043 (move room wrong params `p_to_room`/`p_notes` vs `p_new_room`/`p_reason` with a CHECK domain), UI-0044 (extend_stay missing `p_expected_version`), UI-0046 (phantom columns `stay_guests`/`stay_room_moves` broke the stay read layer), UI-0048 (maintenance create param mismatch + non-schema estimated-cost field). Phase B P1s: UI-0040 (sellable filter omitted INSPECTED), UI-0045 (`/stays/…` routes missing the `/hotel` prefix), UI-0047 (EXTENDED stays wrongly gated from checkout/move), UI-0050 (lost-found Return refused for FOUND items), UI-0051 (SelectInput disabled empty-value options — placeholders unselectable). Remaining phases TBD. Phase C P0s, both fixed + browser-verified: UI-0052 (finance read layer written against an imagined schema — phantom columns `bills.table_name`/`folios.guest_name`/`events.total_amount` ×2 pages, event income re-based onto `event_payments.amount`, swallowed read errors now thrown, open-PO mislabel filtered), UI-0053 (62 route-guard permission keys never granted — screens "Access restricted" for every user; fixed by grant-only migration 057, permissions 312→353).)_

## Fixes Applied

- **UI-0019** — `/inventory/suppliers` Create Supplier dialog (legalName, tradeName, supplierType, taxId, taxType, openingBalance, paymentTerms, creditLimit, notes). Files: `src/pages/inventory/SuppliersPage.tsx`.
- **UI-0020** — `/inventory/purchases` four-tab page (Orders / Receipts / Invoices / Payments) with full PO → GRN → Invoice → Payment flows. Files: `src/pages/inventory/PurchasesPage.tsx`.
- **UI-0021** — `/inventory/items` Create Item dialog (name, code, item_type, base_unit, category, track_batch, track_expiry, reorder_level, reorder_quantity). Files: `src/pages/inventory/ItemsPage.tsx`.
- **UI-0022** — `/inventory/recipes` ingredient-list editor (add/remove rows with itemId, quantity, unitId, notes). Files: `src/pages/inventory/RecipesPage.tsx`.
- **UI-0023** — `/inventory/stock-takes` count-lines table + post action. Files: `src/pages/inventory/StockTakesPage.tsx`.
- **UI-0024** — PO line-items form on `PurchasesPage` (was header-only). Files: `src/pages/inventory/PurchasesPage.tsx`.
- **UI-0025** — GRN dialog received vs accepted qty (two columns). Files: `src/pages/inventory/PurchasesPage.tsx`.
- **UI-0026** — Supplier payment dialog with allocation-to-invoice control. Files: `src/pages/inventory/PurchasesPage.tsx`.
- **UI-0027** — Supplier service realigned to schema columns + door args (`p_supplier_code`, `p_display_name`, `p_tax_identifier`, `p_payment_terms_days`). Files: procurement services.
- **UI-0028** — 7 malformed `.order("x.desc")` strings split into column + `ascending:false`. Files: procurement services.
- **UI-0029** — Door param mismatches fixed (missing `p_organization`, GRN param names, `p_outlet` on invoice/payment). Files: procurement services.
- **UI-0030** — `051_seed_units_categories.sql`: standard units + categories seeded (hosted DB). Items dropdowns now populated.
- **UI-0031** — GRN location dropdown wired to loaded locations. Files: `src/pages/inventory/PurchasesPage.tsx`.
- **UI-0032** — `toDoorArgs` strips a leading `p_` before re-prefixing (double-`p_` 404s on ~900 call sites). Files: `src/db/case.ts`.
- **UI-0033** — PO approve two-hop (DRAFT→PENDING_APPROVAL→APPROVED) + shared error banner rendered inside all four dialogs (§75). Files: `src/pages/inventory/PurchasesPage.tsx`.
- **UI-0034** — `055_app_evaluate_access_overload.sql`: the 3-arg guard the seven 031 doors call, delegating to the 5-arg form (hosted DB, ledger-recorded). Invoice/payment/return doors un-404'd.
- **UI-0035** — `createRoomType` sends `bedConfiguration ?? []` instead of explicit `null` (explicit null overrides the door's `'[]'::jsonb` default → 23502). Files: `src/domain/hotel/room-service.ts`.
- **UI-0036** — `056_hotel_audit_calls.sql`: 47 hotel doors (034–039) re-created with audit slot 6 normalized to `null` (they passed a uuid where the 054 seven-arg funnel takes `text reason` → 42883). Generated + byte-verified by `db/build_056.mjs`/`db/verify_056.mjs`; applied hosted, ledger-recorded via `db/harness/apply-056-only.mjs`. All 47 Phase B doors un-blocked.
- **UI-0037** — Guest create realigned to the door: client mints `p_guest_code` (`generateGuestCode()` → `GST-…`), `p_dob` → `p_date_of_birth`, `p_source ?? null` dropped (explicit null overrode the door's `'DIRECT'` default → 23502). Files: `src/domain/hotel/guest-service.ts`.
- **UI-0038** — Housekeeping sheet Room select wired to loaded rooms (was a bare placeholder with no options). Files: `src/pages/hotel/HousekeepingPage.tsx`.
- **UI-0039** — Housekeeping create calls the real RPC with its real signature (`p_task_type`, `p_priority` default 'NORMAL', `p_notes`, `p_stay_id`). Files: `src/domain/hotel/housekeeping-service.ts`.
- **UI-0040** — Sellable-room filter counts VACANT_CLEAN **and** INSPECTED (was VACANT_CLEAN only) at three sites: room stats, `availableRoomsForMove`, arrival-row availability. Files: `src/pages/hotel/FrontDeskPage.tsx`.
- **UI-0041** — Phantom permission keys `stay.check_in`/`stay.check_out`/`stay.edit` → realigned to the doors' `frontoffice.checkin`/`frontoffice.checkout`/`stay.modify`/`frontoffice.room_move` at four gate sites. Files: `src/pages/hotel/FrontDeskPage.tsx`, `src/pages/hotel/StayDetailPage.tsx`.
- **UI-0042** — check_in call adds `p_expected_check_out` (timestamptz, no default). Files: `src/domain/hotel/stay-service.ts`.
- **UI-0043** — moveRoom params `p_to_room`+`p_notes` → `p_new_room`+`p_reason` (CHECK GUEST_REQUEST|MAINTENANCE|UPGRADE|OPERATIONAL|OTHER). Files: `src/domain/hotel/stay-service.ts`.
- **UI-0044** — extend_stay call adds the missing `p_expected_version`. Files: `src/domain/hotel/stay-service.ts`.
- **UI-0045** — three `/stays/…` navigates → `/hotel/stays/…`. Files: `src/pages/hotel/StayDetailPage.tsx`.
- **UI-0046** — stay read layer drops phantom columns `stay_guests`/`stay_room_moves` (never existed → stay detail never loaded). Files: `src/domain/hotel/stay-service.ts`.
- **UI-0047** — `canCheckOutThis`/`canMoveThis` include EXTENDED stays (early departure / move after extension). Files: `src/pages/hotel/StayDetailPage.tsx`.
- **UI-0048** — maintenance create realigned to create_maintenance_request params; non-schema estimated-cost field removed. Files: `src/domain/hotel/maintenance-service.ts`.
- **UI-0049** — duplicate "No specific room" placeholder removed; probe `["No specific room[enabled]","Room 101[enabled]","Room 102[enabled]"]`. Files: `src/pages/hotel/MaintenancePage.tsx`.
- **UI-0050** — Lost-found Return unblocked: `item.status !== "FOUND"` guard removed (door accepts any non-terminal → RETURNED); retest reqids 11292/11303. Files: `src/pages/hotel/LostFoundPage.tsx`.
- **UI-0051** — `SelectInput.renderOption` had `disabled={option.value === ""}`, making placeholders and "All X" filter rows unselectable after a choice; empty-value options now render enabled (shared design-system fix). Files: `src/components/ui/SelectInput.tsx`.
- **UI-0052** — finance read layer: phantom columns dropped (`bills.table_name`, `folios.guest_name`, `events.total_amount` on Accounting + P&L); event income re-based onto `event_payments.amount`; CANCELLED bills excluded from invoices; open-PO row filtered to DRAFT/PENDING_APPROVAL/APPROVED/SENT/PARTIALLY_RECEIVED; `firstError` thrown after each `Promise.all` so failed reads surface (§75). Files: `src/pages/finance/FinanceInvoicesPage.tsx`, `FinancePaymentsPage.tsx`, `AccountingPage.tsx`, `ProfitLossPage.tsx`.
- **UI-0053** — `057_route_guard_permission_grants.sql`: 62 route-guard keys granted (ORG_OWNER/ORG_ADMIN ×56 org keys, PLATFORM_ADMIN ×6 platform views, FINANCE_MANAGER/EVENT_MANAGER/HR_MANAGER domain views), idempotent + ledger-recorded via `db/harness/apply-057-only.mjs`. Permissions 312→353; finance screens un-blocked.

## Data Created

_(Phase A small-batch retest: 3 suppliers, 10 items, 12 locations, PO-2026-000005, GRN-2026-000001, invoice 2026-000001, payments 2026-000001 + ₹100 allocation test — all via UI. Full detail in `UI_DEMO_DATA_LOG.md`. §15 volumes NOT met. Phase B small-batch retest: room type EXEC, guest Rahul Deshmukh, Room 102, RES-2026-00001, one stay through check-in→extend→move→checkout, 1 housekeeping task (full workflow), 1 maintenance request (full lifecycle), 1 lost-found item (FOUND→RETURNED), 1 asset (create + notes-only edit) — all via UI. Phase C: read-only screens — no records created; the four finance screens' reads verified against the Phase A/B dataset. Phases D–G: TBD.)_

## Cross-Module Results

_(Filled at end of Phase H — see §52 chains.)_

## Security Results

_(Filled at end of Phase H — auth, RBAC, tenant isolation, property isolation, outlet isolation, audit.)_

## Financial Results

_(Filled at end of Phase H — debits = credits, payment totals, AP / AR reconcile.)_

## Release Recommendation

_(Filled at end of Phase I — NOT READY / INTERNAL QA / PILOT READY / CONTROLLED PRODUCTION READY, with explanation.)_

---

## Phase progression

- Phase A: Inventory + Procurement — **RETESTED (small batch)** — 14/16 defects VERIFIED in browser (UI-0022/0023 code-level only); chain PO→GRN→Invoice→Payment→Allocation proven; §15 volumes unmet
- Phase B: Hotel + HK + MX — **RETESTED (small batch)** — 15/15 defects VERIFIED in browser (UI-0037..0051); guest→reservation→stay→checkout + HK + maintenance + lost-found + assets chains proven; §15 volumes unmet
- Phase C: Finance — **VERIFIED (read-layer scope)** — 2/2 P0 defects fixed + browser-proven (UI-0052 read layer, UI-0053 route-guard grants via 057); all four screens driven, KPIs reconcile with Phase A/B money; §15 volumes unmet (read-only screens — no records created)
- Phase D: CRM + Events + HR — NOT STARTED
- Phase E: Commerce + Public — NOT STARTED
- Phase F: Enterprise + Billing + Notifications + AI + Integrations + Platform + Onboarding + Documents — NOT STARTED
- Phase G: Workflows + Revenue + Procurement + Experience + Marketing + Guest + Settings — NOT STARTED
- Phase H: Full business simulation + reconciliation — NOT STARTED
- Phase I: Final report + release verdict — NOT STARTED
