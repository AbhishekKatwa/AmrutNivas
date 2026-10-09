# AMRUT NIVAAS — UI AUTONOMOUS DEFECT LOG

Per Master Prompt #36 §58. Every defect discovered during §5 testing gets a row.

## Severity vocabulary (§58)

| Severity | Meaning |
|---|---|
| P0 | Security / data / financial integrity failure |
| P1 | Core workflow failure |
| P2 | Important functional / UI failure |
| P3 | Minor issue |
| P4 | Cosmetic |

## Status vocabulary (§56)

| Status | Meaning |
|---|---|
| OPEN | Newly discovered, root cause known, fix not yet committed |
| IN_PROGRESS | Fix being authored |
| FIXED | Code change shipped, not yet re-exercised |
| RETESTING | Re-running the failing flow |
| VERIFIED | Re-tested PASS in the browser |
| WONT_FIX | Documented decision — see notes |
| BLOCKED | Cannot complete because of an external dependency |
| DEFERRED | Parked for the next phase |

---

## Index

| ID | Date | Module | Screen | Sev | Title | Status |
|---|---|---|---|---|---|---|
| UI-0001 | 2026-10-09 | Dashboard | `/` | P3 | Stale landing-page copy | VERIFIED |
| UI-0002 | 2026-10-09 | Hotel | `/hotel/rooms` | P1 | Room list price-per-night mis-read | VERIFIED |
| UI-0003 | 2026-10-09 | Auth | `/sign-in` | P1 | Sign-in surface allowed magic-link-style submit before fields valid | VERIFIED |
| UI-0004 | 2026-10-09 | Auth | `/sign-in` recovery | P1 | Forgot-password server half swallows the failure | BLOCKED |
| UI-0005 | 2026-10-09 | Access | `/team` | P3 | Invitation panel copy claims SMTP delivery when platform is offline | VERIFIED |
| UI-0006 | 2026-10-09 | Access | `/roles` | P2 | Custom role could be deleted while assigned to users | VERIFIED |
| UI-0007 | 2026-10-09 | Access | `/roles` | P1 | Custom-role permission change didn't propagate to active sessions | VERIFIED |
| UI-0008 | 2026-10-09 | Access | `/roles` | P2 | New permission columns didn't render at narrow widths | VERIFIED |
| UI-0009 | 2026-10-09 | Access | `/roles` | P3 | No STATUS column — retired custom roles looked active | VERIFIED |
| UI-0010 | 2026-10-09 | Property | `/properties` | P2 | BusinessDayStart formatter dropped leading zero | VERIFIED |
| UI-0011 | 2026-10-09 | Dashboard | `/` | P1 | Module status card count didn't match nav | VERIFIED |
| UI-0012 | 2026-10-09 | Dashboard | `/` | P1 | Empty-state copy misled users into "wire status" path that doesn't exist | VERIFIED |
| UI-0013 | 2026-10-09 | Restaurant | `/tables` | P3 | Table-status pill rendered the wrong colour for RETIRED | VERIFIED |
| UI-0014 | 2026-10-09 | Restaurant | `/pos` | P1 | Quantity parser dropped values > 9 | VERIFIED |
| UI-0015 | 2026-10-09 | Restaurant | `/billing` | P3 | Discount cap silently allowed negative totals | VERIFIED |
| UI-0016 | 2026-10-09 | Restaurant | `/billing` | P3 | Tax profile dropdown listed profiles from other properties | VERIFIED |
| UI-0017 | 2026-10-09 | Restaurant | `/shifts` | P1 | Close-shift action didn't block when petty cash was unreconciled | VERIFIED |
| UI-0018 | 2026-10-09 | KDS | `/kitchen` | P1 | KOT bump button advanced state twice on rapid double-click | VERIFIED |
| UI-0019 | 2026-10-09 | Procurement | `/inventory/suppliers` | P1 | Suppliers master had no Create dialog — read-only directory | FIXED |
| UI-0020 | 2026-10-09 | Procurement | `/inventory/purchases` | P0 | Purchases page was read-only — no way to drive PO → GRN → Invoice → Payment through the UI | FIXED |
| UI-0021 | 2026-10-09 | Inventory | `/inventory/items` | P1 | Items master missing Create dialog form (only table) | FIXED |
| UI-0022 | 2026-10-09 | Inventory | `/inventory/recipes` | P1 | Recipes missing ingredient-list editor — no way to add rows | FIXED |
| UI-0023 | 2026-10-09 | Inventory | `/inventory/stock-takes` | P1 | Stock takes missing count-lines + post UI | FIXED |
| UI-0024 | 2026-10-09 | Procurement | `/inventory/purchases` | P2 | PO line items couldn't be added through the form (only header captured) | FIXED |
| UI-0025 | 2026-10-09 | Procurement | `/inventory/purchases` | P2 | GRN dialog didn't accept received/accepted qty separately | FIXED |
| UI-0026 | 2026-10-09 | Procurement | `/inventory/purchases` | P2 | Supplier payment dialog had no allocation-to-invoice control | FIXED |

---

## Records

(Each row above expands below with the §58 fields: ID / Date / Module / Screen / Severity / Description / Steps to Reproduce / Expected / Actual / Root Cause / Fix / Files Changed / Retest / Regression / Status.)

### UI-0001 — Stale landing-page copy
- **Date**: 2026-10-09
- **Module**: Dashboard
- **Screen**: `/`
- **Severity**: P3
- **Description**: Foundation status page showed copy claiming wire was live; the platform's SMTP + auth paths are still offline.
- **Steps**: Sign in, observe `/`.
- **Expected**: Empty-state copy tells the truth about which doors are live.
- **Actual**: Copy suggested wire was complete.
- **Root cause**: Copy predated the offline configuration.
- **Fix**: `src/pages/FoundationStatusPage.tsx` — "Wire status" panel + new copy.
- **Files changed**: `src/pages/FoundationStatusPage.tsx`.
- **Retest**: 2026-10-09 PASS — DOM snapshot uid 24_1034/1036 chain.
- **Regression**: status / nav / sign-in unaffected.
- **Status**: VERIFIED.

### UI-0004 — Forgot-password server half swallows the failure
- **Date**: 2026-10-09
- **Module**: Auth
- **Screen**: `/sign-in` recovery sheet
- **Severity**: P1
- **Description**: User enters email and clicks "Send recovery link"; client returns success; no email is ever delivered and the user is given no error.
- **Steps**: Sign-in → Forgot password? → enter a known email → Send.
- **Expected**: Either a real email OR an honest error.
- **Actual**: Success message; no email; user stuck.
- **Root cause**: Hosted Supabase has no SMTP + no `site_url`, so `resetPasswordForEmail` silently no-ops.
- **Fix**: Client `requestPasswordReset` now throws on failure with a normalised error — code side fixed.
- **Files changed**: `src/domain/auth/...` (password recovery service).
- **Retest**: 2026-10-09 client half PASS — error surfaces.
- **Regression**: sign-in / sign-up / session unaffected.
- **Status**: BLOCKED — server half awaits task #58 (real SMTP + site_url).

### UI-0009 — No STATUS column on roles
- **Date**: 2026-10-09
- **Module**: Access
- **Screen**: `/roles`
- **Severity**: P3
- **Description**: Retired custom roles rendered identically to active ones; no way to tell from the table.
- **Steps**: Sign in → Roles → mark `QA Night Auditor` retired → reload.
- **Expected**: STATUS column shows Active / Retired pill.
- **Actual**: No STATUS column at all.
- **Root cause**: Column missing from table definition.
- **Fix**: `src/pages/access/RolesPage.tsx` — `key: "status"` column added (now ROLE / TYPE / STATUS / PERMISSIONS / SCOPE / USERS / MANAGE).
- **Files changed**: `src/pages/access/RolesPage.tsx`.
- **Retest**: 2026-10-09 PASS — 14 rows: 13 System (Active) + 1 Custom `QA Night Auditor (probe)` (Retired, Edit + Restore).
- **Regression**: other columns unchanged.
- **Status**: VERIFIED.

### UI-0018 — KOT bump double-click
- **Date**: 2026-10-09
- **Module**: KDS
- **Screen**: `/kitchen`
- **Severity**: P1
- **Description**: Bump button advanced state twice on rapid double-click, skipping READY → SERVED.
- **Steps**: `/kitchen` → KOT in PREPARING → click Bump twice quickly.
- **Expected**: First click → READY; second click → SERVED.
- **Actual**: Single click advanced all the way to SERVED.
- **Root cause**: Optimistic state mutated twice on rapid events.
- **Fix**: Action guard added; only fires once per state.
- **Files changed**: `src/pages/restaurant/KitchenPage.tsx`.
- **Retest**: 2026-10-09 PASS — single click advances once.
- **Regression**: Bump from PLACED → PREPARING unchanged.
- **Status**: VERIFIED.

_(Full records for UI-0002, UI-0003, UI-0005, UI-0006, UI-0007, UI-0008, UI-0010, UI-0011, UI-0012, UI-0013, UI-0014, UI-0015, UI-0016, UI-0017 already live in `docs/MANUAL_UI_DEFECTS.md`. Future defects discovered under Master Prompt #36 will be appended below.)_

---

## Phase A — Inventory / Procurement defects

### UI-0019 — Suppliers master missing Create dialog
- **Date**: 2026-10-09
- **Module**: Procurement
- **Screen**: `/inventory/suppliers`
- **Severity**: P1
- **Description**: SuppliersPage was a read-only directory. No `+ New Supplier` affordance, no Dialog form, no call to `createSupplier`. Master Prompt §15 expects 30+ suppliers created through the UI — this page made that impossible.
- **Steps**: Sign in as OWNER001 → `/inventory/suppliers` → no Create button anywhere.
- **Expected**: Header exposes `+ New Supplier` opening a Dialog with `legalName`, `tradeName`, `supplierType`, `taxId`, `taxType`, `openingBalance`, `paymentTerms`, `creditLimit`, `notes`.
- **Actual**: No Create control. Empty DataTable only.
- **Root cause**: SuppliersPage was a phase-2 stub — header omitted the `Plus` action and the form state.
- **Fix**: `src/pages/inventory/SuppliersPage.tsx` — added `EMPTY_FORM`, `SupplierFormState`, `+ New Supplier` button, Dialog with TextInput/SelectInput controls, `createSupplier` integration. Also added Edit and Archive actions.
- **Files changed**: `src/pages/inventory/SuppliersPage.tsx`.
- **Retest**: Code-level + `tsc --noEmit` PASS; browser-level retest DEFERRED (subagent turns exhausted before browser verification).
- **Status**: FIXED.

### UI-0020 — Purchases page had no procurement flows (PO/GRN/Invoice/Payment)
- **Date**: 2026-10-09
- **Module**: Procurement
- **Screen**: `/inventory/purchases`
- **Severity**: P0 — financial integrity (the cross-module chain Supplier → PO → GRN → Invoice → Payment → Stock Ledger is the spine of cost-of-goods accounting; without it, weighted-avg cost cannot be verified and §25 finance validation cannot run)
- **Description**: PurchasesPage rendered a single read-only dashboard. No PO create, no GRN, no Supplier Invoice, no Supplier Payment. The procurement service layer (`@/domain/procurement/*`) was complete — the UI just wasn't wired.
- **Steps**: Sign in → `/inventory/purchases` → no Create button, no tab structure.
- **Expected**: Four tabs (Orders / Receipts / Invoices / Payments), each with a `+ New` dialog and the correct service call.
- **Actual**: One read-only dashboard.
- **Root cause**: Page was a placeholder dashboard during the phase-2 build; the tabbed transaction screens were never authored.
- **Fix**: `src/pages/inventory/PurchasesPage.tsx` — full rewrite to four tabs (Orders, Receipts, Invoices, Payments), each with form state, Dialog, `+ New` button, and the corresponding service call (`createPurchaseOrder` / `addPurchaseOrderItems`, `createGoodsReceipt` / `postGoodsReceipt`, `createPurchaseInvoice` / `setPurchaseInvoiceStatus`, `recordSupplierPayment` / `allocatePaymentToInvoice`).
- **Files changed**: `src/pages/inventory/PurchasesPage.tsx` (now 1337 lines, was ~190).
- **Retest**: Code-level + typecheck PASS; browser-level retest DEFERRED.
- **Status**: FIXED.

### UI-0021 — Items master missing Create dialog
- **Date**: 2026-10-09
- **Module**: Inventory
- **Screen**: `/inventory/items`
- **Severity**: P1
- **Description**: ItemsPage rendered a DataTable of items but no Create form. Master Prompt §15 expects 150+ items through the UI.
- **Steps**: Sign in → `/inventory/items` → no `+ New Item` button.
- **Expected**: `+ New Item` Dialog with `name`, `code`, `item_type`, `base_unit_id`, `category_id`, `track_batch`, `track_expiry`, `reorder_level`, `reorder_quantity`.
- **Actual**: No Create control.
- **Root cause**: ItemsPage was a phase-2 stub.
- **Fix**: `src/pages/inventory/ItemsPage.tsx` — added form state, Dialog, `+ New Item` button, `createItem` integration.
- **Files changed**: `src/pages/inventory/ItemsPage.tsx`.
- **Retest**: Code-level + typecheck PASS; browser-level retest DEFERRED.
- **Status**: FIXED.

### UI-0022 — Recipes missing ingredient editor
- **Date**: 2026-10-09
- **Module**: Inventory
- **Screen**: `/inventory/recipes`
- **Severity**: P1
- **Description**: Recipes page listed recipes but had no UI path to add ingredients. Master Prompt §20 requires verifying that recipe ingredients drive stock consumption — without an authoring UI, the chain can't be tested.
- **Steps**: Sign in → `/inventory/recipes` → no ingredient-list editor.
- **Expected**: Create-Recipe dialog with ingredient-list sub-form (`itemId`, `quantity`, `unitId`, `notes`) and Add Row / Remove Row controls.
- **Actual**: No ingredient editor.
- **Root cause**: RecipesPage was incomplete.
- **Fix**: `src/pages/inventory/RecipesPage.tsx` — added `IngredientFormRow` type, `RecipeFormState` with `ingredients: IngredientFormRow[]`, Dialog with Add Row control, `createRecipe` + `addRecipeIngredients` integration.
- **Files changed**: `src/pages/inventory/RecipesPage.tsx`.
- **Retest**: Code-level + typecheck PASS; browser-level retest DEFERRED.
- **Status**: FIXED.

### UI-0023 — Stock takes missing count-lines + post UI
- **Date**: 2026-10-09
- **Module**: Inventory
- **Screen**: `/inventory/stock-takes`
- **Severity**: P1
- **Description**: StockTakesPage listed stock takes but had no way to enter counted quantities per item or post the take (apply variance to stock).
- **Steps**: Sign in → `/inventory/stock-takes` → no count-line entry.
- **Expected**: Create-Stock-Take dialog + per-line counted-qty editor + Post button calling `postStockTake`.
- **Actual**: Read-only list.
- **Root cause**: StockTakesPage was incomplete.
- **Fix**: `src/pages/inventory/StockTakesPage.tsx` — added form state, Dialog with `location_id` + `notes`, count-lines editor, `createStockTake` + `postStockTake` integration.
- **Files changed**: `src/pages/inventory/StockTakesPage.tsx`.
- **Retest**: Code-level + typecheck PASS; browser-level retest DEFERRED.
- **Status**: FIXED.

### UI-0024 — PO dialog couldn't add line items
- **Date**: 2026-10-09
- **Module**: Procurement
- **Screen**: `/inventory/purchases` (Orders tab)
- **Severity**: P2
- **Description**: After UI-0020 fix, the PO dialog only captured header fields (supplier, outlet, expectedDelivery, notes). No rows for line items.
- **Steps**: Open PO dialog → fill header → Save.
- **Expected**: Header + at least one item row with `itemId`, `quantity`, `unitId`, `unitRate`, `taxRate`, `description`, plus Add Row / Remove Row.
- **Actual**: No line-item section.
- **Root cause**: First pass at UI-0020 captured only the header.
- **Fix**: Added `items: Array<{...}>` to `POFormState` + Add Row / Remove Row controls + `addPurchaseOrderItems` after header save.
- **Files changed**: `src/pages/inventory/PurchasesPage.tsx`.
- **Retest**: Code-level + typecheck PASS; browser-level retest DEFERRED.
- **Status**: FIXED.

### UI-0025 — GRN dialog didn't separate received vs accepted qty
- **Date**: 2026-10-09
- **Module**: Procurement
- **Screen**: `/inventory/purchases` (Receipts tab)
- **Severity**: P2
- **Description**: GRN dialog had one quantity field, conflating what was delivered with what was accepted (goods can arrive damaged or short).
- **Steps**: Open GRN dialog → save.
- **Expected**: Separate `receivedQuantity` and `acceptedQuantity` per line; service layer (`addGoodsReceiptItems`) already takes both.
- **Actual**: One quantity field only.
- **Root cause**: First pass at UI-0020 simplified the GRN form.
- **Fix**: Added `receivedQuantity` + `acceptedQuantity` columns to `GRNFormState` and the dialog; reject lines where accepted > received.
- **Files changed**: `src/pages/inventory/PurchasesPage.tsx`.
- **Retest**: Code-level + typecheck PASS; browser-level retest DEFERRED.
- **Status**: FIXED.

### UI-0026 — Supplier payment dialog had no invoice-allocation control
- **Date**: 2026-10-09
- **Module**: Procurement
- **Screen**: `/inventory/purchases` (Payments tab)
- **Severity**: P2
- **Description**: Payment dialog recorded a payment but had no way to allocate it against specific supplier invoices. Without allocation, supplier AP couldn't be tracked per invoice (Master Prompt §21 requirement).
- **Steps**: Open Payment dialog → save.
- **Expected**: An allocation sub-form listing open invoices for the supplier with per-invoice allocated amount, calling `allocatePaymentToInvoice`.
- **Actual**: Single payment amount, no allocation.
- **Root cause**: First pass at UI-0020 skipped allocation.
- **Fix**: Added invoice-allocation list to payment dialog + `allocatePaymentToInvoice` call.
- **Files changed**: `src/pages/inventory/PurchasesPage.tsx`.
- **Retest**: Code-level + typecheck PASS; browser-level retest DEFERRED.
- **Status**: FIXED.

## Phase B — Hotel / HK / MX defects (to be appended)

## Phase C — Finance defects (to be appended)

## Phase D — CRM / Events / HR defects (to be appended)

## Phase E — Commerce / Public defects (to be appended)

## Phase F — Enterprise / Billing / Notifications / AI / Integrations / Platform / Onboarding / Documents defects (to be appended)

## Phase G — Workflows / Revenue / Procurement / Experience / Marketing / Guest / Settings defects (to be appended)
