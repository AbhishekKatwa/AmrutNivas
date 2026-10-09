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
| Hotel PMS | TBD | Phase B |
| Housekeeping | TBD | Phase B |
| Maintenance | TBD | Phase B |
| Finance | TBD | Phase C |
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

## Critical Defects (P0 / P1)

_(Phase A P0s, all fixed + browser-verified: UI-0027 (service↔door column mismatch), UI-0029 (door param mismatches), UI-0032 (`toDoorArgs` double-`p_` mangling — ~900 call sites), UI-0034 (missing 3-arg `app.evaluate_access` on the seven 031 doors). P1s: UI-0019/0020/0021/0024/0028/0030/0031/0033. Remaining phases TBD.)_

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

## Data Created

_(Phase A small-batch retest: 3 suppliers, 10 items, 12 locations, PO-2026-000005, GRN-2026-000001, invoice 2026-000001, payments 2026-000001 + ₹100 allocation test — all via UI. Full detail in `UI_DEMO_DATA_LOG.md`. §15 volumes NOT met. Phases B–G: TBD.)_

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
- Phase B: Hotel + HK + MX — NOT STARTED
- Phase C: Finance — NOT STARTED
- Phase D: CRM + Events + HR — NOT STARTED
- Phase E: Commerce + Public — NOT STARTED
- Phase F: Enterprise + Billing + Notifications + AI + Integrations + Platform + Onboarding + Documents — NOT STARTED
- Phase G: Workflows + Revenue + Procurement + Experience + Marketing + Guest + Settings — NOT STARTED
- Phase H: Full business simulation + reconciliation — NOT STARTED
- Phase I: Final report + release verdict — NOT STARTED
