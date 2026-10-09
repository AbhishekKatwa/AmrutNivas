# AMRUT NIVAAS — MANUAL UI DEFECT LEDGER

This ledger is the single source of truth for every UI defect recorded during
`/docs/MANUAL_UI_TEST_PLAN.md` execution and the §34 stabilization pass. Records
are added, never silently rewritten: a defect moves through the status chain
`OPEN → IN_PROGRESS → FIXED → RETESTING → VERIFIED`, or to one of
`WONT_FIX · BLOCKED · DEFERRED`. A defect is never closed without an actual
browser exercise against the change (§53).

---

## Record template

Each entry below carries every field required by §9:

| Field | Meaning |
|---|---|
| Screen / Route | The screen surface and its URL |
| Domain | The owning domain (access, team, foundation, …) |
| Severity | P0 (data loss / blocker) · P1 (major) · P2 (functionality impaired) · P3 (cosmetic) |
| Steps | Numbered reproduction steps |
| Expected | Correct behaviour |
| Actual | Observed behaviour |
| Root cause | Why the actual differs from expected |
| Files changed | Source files touched by the fix |
| Fix | Description of the code change |
| Retest | Browser-driven verification performed |
| Regression | Whether the fix breaks adjacent behaviour |
| Status | One of OPEN · IN_PROGRESS · FIXED · RETESTING · VERIFIED · WONT_FIX · BLOCKED · DEFERRED |

Severity vocabulary (§5):

| Severity | Meaning |
|---|---|
| P0 | Blocker — data loss, security, or cannot complete the flow at all |
| P1 | Major — a primary surface is broken or a primary path fails |
| P2 | Functionality impaired — degraded but alternative paths work |
| P3 | Cosmetic — stale copy, off-tone pill, missing indicator |

---

## Index

| ID | Screen | Severity | Status |
|---|---|---|---|
| UI-0001 | Foundation status (landing) | P3 cosmetic | VERIFIED (2026-10-09) |
| UI-0004 | Forgot password | P1 major | BLOCKED — server half OPEN @ task #58 |
| UI-0005 | Team — invitation panel copy | P3 cosmetic | VERIFIED (2026-10-09) |
| UI-0009 | Roles — retired-state signal | P3 cosmetic | VERIFIED (2026-10-09) |

§34 STABILIZATION RECORDS (fresh, this pass)
| ID | Screen | Severity | Status |
|---|---|---|---|
| STB-0001 | Foundation status | P3 cosmetic | VERIFIED (2026-10-09) — UI-0001 implementation record |
| STB-0002 | Team — invitation panel | P3 cosmetic | VERIFIED (2026-10-09) — UI-0005 implementation record |
| STB-0003 | Roles — STATUS column | P3 cosmetic | VERIFIED (2026-10-09) — UI-0009 implementation record |

Records closed earlier this sprint but driven live as part of the verification
chain are tracked in `MANUAL_UI_TEST_REPORT.md §4` (UI-0002, 0003, 0006-0008,
0010-0018) and listed in the STABILIZATION_REPORT §10 ledger.

---

## UI-0001

- **Screen / Route**: DASH-001 — Foundation status (landing) · `/`
- **Domain**: Foundation / landing
- **Severity**: P3 cosmetic
- **Steps**:
  1. Sign in as OWNER001 (`Owner123!`).
  2. Land on `/` and read the status copy.
- **Expected**: Copy reflects the live connected state — the data plane is configured and reachable, the platform should not look "shipped without project keys".
- **Actual**: The page stated "No data plane connected to this build… ships without project keys" while the app was fully connected to Supabase and serving live reads.
- **Root cause**: Hard-coded landing copy predated the Supabase wiring; the empty-data panel copied that caveat as if no data plane existed.
- **Files changed**: `src/pages/FoundationStatusPage.tsx`
- **Fix**: Replaced the "No data plane connected…" empty card with an honest copy ("Operational totals live on each module's overview — the data plane is wired; this page proves the foundation modules, not operational totals") and added a `Wire status` panel naming #31.5 `resolve_login`, the RBAC ladder, audit trail, migrations 000–049 and the hosted Supabase data plane as live. Remaining surface (SMTP / site URL / redirect allow-list) tracked under task #58.
- **Retest**: 2026-10-09 PASS — browser snapshot (`uid 24_1034/1036` chain) renders the new empty-state title and the `Wire status` card.
- **Regression**: None observed — DASH-001 is a read-only landing surface; surrounding pages still load and the access debugging panel still resolves the signed-in session.
- **Status**: VERIFIED (2026-10-09)

---

## UI-0004

- **Screen / Route**: AUTH-004 — Forgot password · `/sign-in` → "Forgot password?"
- **Domain**: Auth / recovery
- **Severity**: P1 major
- **Steps**:
  1. Sign-in card → "Forgot password?".
  2. Submit empty User ID → expect validation error (works: "Enter your User ID.").
  3. Enter OWNER001 → "Send reset link".
  4. Inspect the network tab for `/auth/v1/recover`.
- **Expected**: Reset email is sent; UI confirms "Check your inbox".
- **Actual** (pre-fix): UI showed "Check your inbox" while the request returned 400 `email_address_invalid` — `Email address "owner001@amrut-nivas.local" is invalid`. GoTrue refused the `.local` email domain, so password reset can never send mail for ANY real account. (Unknown emails still returned a generic 200 before this validation, which is why fake-email probes passed.) Two independent defects — server/infra + client.
- **Root cause**:
  1. Server / infra — synthetic login accounts use `@amrut-nivas.local`, a domain GoTrue rejects; SMTP, `site_url` and the redirect allow-list are unconfigured on the hosted project.
  2. Client — `resetPasswordForEmail` returned `{ error }` instead of throwing; the result was ignored, so the 400 was swallowed into a false success.
- **Files changed**: `src/domain/access/auth-service.ts`
- **Fix**: `requestPasswordReset` now destructures the result and throws an `AppError` ("We could not send the reset email. Please try again shortly or contact your administrator.") on failure. §18 non-enumeration preserved: unknown User IDs still get the generic "Check your inbox" (verified via fake-email probe → 200). Redirect target now `appUrl() + /sign-in`.
- **Retest (client half)**: 2026-10-09 PASS — reset form shows the honest error with `invalid="true"` instead of the false "Check your inbox".
- **Retest (server half)**: OPEN. The capability is dead end-to-end until the email-domain convention + SMTP / site URL / redirect allow-list are configured on the hosted Supabase project (task #58). Fixing that requires an owner-controlled dashboard change.
- **Regression**: None observed on adjacent auth flows. Known-fake User IDs still return the generic "Check your inbox" so the non-enumeration invariant is intact.
- **Status**: BLOCKED — server half OPEN, tracked under task #58.

---

## UI-0005

- **Screen / Route**: ORG-003 — Team (members) · `/team`
- **Domain**: Access / invitations
- **Severity**: P3 cosmetic
- **Steps**:
  1. Sign in as OWNER001.
  2. Team → Invite → fill email + role + outlets → Send invitation.
  3. Read the "Invitation created" panel.
- **Expected**: Copy consistent with the current product state — email delivery is configured per-deployment; the panel hands over the link because the DB stores only the token hash.
- **Actual**: "…Send the link now — the live email delivery arrives with Prompt #03." Prompt #03 shipped long ago; this hard-coded reference to a build phase is stale.
- **Root cause**: Hard-coded copy written during Prompt #03 that was never revisited.
- **Files changed**: `src/pages/team/TeamPage.tsx`
- **Fix**: Replaced the one-shot-warning paragraph in the "Invitation created" panel with copy that drops the "Prompt #03" reference and explains the deployment-conditional behaviour: "When SMTP is configured for the deployment, the platform delivers the invite automatically; until then this panel hands it over."
- **Retest**: 2026-10-09 PASS — sent `qa-stabilization@amrut-nivas.local` / Staff / Main Dining; the panel rendered live with no "Prompt #03" reference and the SMTP-conditional explanation.
- **Regression**: None — change is copy-only inside an existing div.
- **Status**: VERIFIED (2026-10-09)

---

## UI-0009

- **Screen / Route**: ORG-004 — Roles & permissions · `/roles`
- **Domain**: Access / roles
- **Severity**: P3 cosmetic
- **Steps**:
  1. Roles → Retire a custom role with a reason.
  2. Read the retired row in the catalogue.
- **Expected**: The retired state is visible at a glance (status pill / badge), not only via the action button.
- **Actual**: The view model computed `retired` (`role.status !== "ACTIVE"`) but never rendered it; the only signal that a role was retired was the Retire button flipping to Restore.
- **Root cause**: The roles table carried `ORIGIN` (System / Custom) but no status column; a retired-state indicator was never designed into the table layout.
- **Files changed**: `src/pages/access/RolesPage.tsx`
- **Fix**: Added a `STATUS` column between `TYPE` and `PERMISSIONS` in `buildRoleColumns`. Active roles show a `success` Badge ("Active"); retired roles show a `warning` Badge ("Retired"). Column count grew from 6 → 7 (ROLE / TYPE / STATUS / PERMISSIONS / SCOPE / USERS / MANAGE).
- **Retest**: 2026-10-09 PASS — `/roles` rendered 14 rows with the new column; all 13 System roles show "Active" and the `QA Night Auditor (probe)` custom role (left RETIRED from the prior session) shows "Retired" with Edit + Restore in the Manage cell.
- **Regression**: None — pure additive column inside `buildRoleColumns`; existing sort / filter / pagination contracts untouched (the column was inserted into the column definition list without any other change to the table).
- **Status**: VERIFIED (2026-10-09)

---

## STB-0001 — Foundation status implementation

- **Screen / Route**: DASH-001 — Foundation status (landing) · `/`
- **Domain**: Foundation / landing
- **Severity**: P3 cosmetic
- **Steps**:
  1. Apply UI-0001 fix.
  2. Navigate to `/` in a signed-in session.
  3. Read the new "Operational totals live on each module's overview" card and the new "Wire status" card.
- **Expected**: Both cards visible with the up-to-date foundation-platform copy; no "ships without project keys" anywhere.
- **Actual**: New copy renders cleanly. Title uid `24_1034`, wire-status body uid `24_1036` (snapshot chain).
- **Root cause**: Pre-fix copy predated the Supabase wiring.
- **Files changed**: `src/pages/FoundationStatusPage.tsx`
- **Fix**: As for UI-0001.
- **Retest**: 2026-10-09 PASS — DOM `take_snapshot` captured from `http://localhost:5175/`.
- **Regression**: None observed.
- **Status**: VERIFIED (2026-10-09)

---

## STB-0002 — Invitation panel implementation

- **Screen / Route**: ORG-003 — Team (members) · `/team`
- **Domain**: Access / invitations
- **Severity**: P3 cosmetic
- **Steps**:
  1. Apply UI-0005 fix.
  2. Sign in as OWNER001.
  3. Team → Invite → `qa-stabilization@amrut-nivas.local` / Full name "QA Stabilization" / Role STAFF / Property Amrut Nivaas Shirur / Outlets [Main Dining].
  4. Send invitation.
  5. Read the "Invitation created" panel.
- **Expected**: Panel renders the new copy; Copy link action works; the link writes a usable `${origin}/accept?token=…` URL once, the panel never persists the token.
- **Actual**: New copy rendered live; invitation panel reads:
  > "Invitation created — Copy the link below and send it to the person. This token is shown **once**. The database keeps only its hash, so it cannot be retrieved after you close this panel. Copy the link now and send it to the invitee through your usual channel. When SMTP is configured for the deployment, the platform delivers the invite automatically; until then this panel hands it over."
- **Root cause**: Pre-fix copy carried a stale Prompt #03 reference.
- **Files changed**: `src/pages/team/TeamPage.tsx`
- **Fix**: As for UI-0005.
- **Retest**: 2026-10-09 PASS — DOM `evaluate_script` returned the new copy verbatim, the action chain (Open → Email → Name → Role → Property → Outlets → Send → "Invitation created") exercised end-to-end.
- **Regression**: Pending invites list still shows the row created; Cancel works (per QA report ORG-003 reference).
- **Status**: VERIFIED (2026-10-09)

---

## STB-0003 — Roles STATUS column implementation

- **Screen / Route**: ORG-004 — Roles & permissions · `/roles`
- **Domain**: Access / roles
- **Severity**: P3 cosmetic
- **Steps**:
  1. Apply UI-0009 fix.
  2. Navigate to `/roles`.
  3. Read the table header sequence and the row rendering for the retired `QA Night Auditor (probe)` row.
- **Expected**: Header order: ROLE / TYPE / STATUS / PERMISSIONS / SCOPE / USERS / MANAGE. The retired role shows `Retired` (warning Badge) and its Manage cell switches to `Edit + Restore`. All 13 System roles show `Active`.
- **Actual**: 14 rows; header sequence matches expected; all 13 System rows show `Active`; the `QA Night Auditor (probe)` row (Custom) shows `Retired` with `Edit + Restore`.
- **Root cause**: Pre-fix table layout had no STATUS column.
- **Files changed**: `src/pages/access/RolesPage.tsx`
- **Fix**: As for UI-0009.
- **Retest**: 2026-10-09 PASS — DOM `evaluate_script` against `http://localhost:5175/roles` confirmed header sequence and the 14-row rendering with `Active`/`Retired` pills.
- **Regression**: None — pure additive column in `buildRoleColumns`.
- **Status**: VERIFIED (2026-10-09)

---

## Appendix · audit-only defects (NOT FIXED this pass)

Per Prompt #55 (NO SCOPE CREEP), the following audit-class items are recorded
in `docs/STABILIZATION_REPORT.md §11` and tracked for owner disposition rather
than introduced as defects here:

| Item | Source | Severity | Disposition |
|---|---|---|---|
| G1 — Seven in-memory fake domains (workflows, marketing, revenue channel-pricing, guest-experience, supply-chain, experience, settings/configuration, integrations partial) | `FULL_SYSTEM_AUDIT.md §G1` | P0 façade | DEFERRED — owner decision required (persist each through doors, or remove routes/nav) |
| C1 — `consume_for_order` has zero callers | `FULL_SYSTEM_AUDIT.md §C1` | P0 wired-cap missing | DEFERRED — wiring is a behavioural change |
| C2 — `post_folio_charge` has zero callers | `FULL_SYSTEM_AUDIT.md §C2` | P0 wired-cap missing | DEFERRED — wiring is a behavioural change |
| F1 — No journal / GL / TB chain | `FULL_SYSTEM_AUDIT.md §F1` | P1 bookkeeping absent | DEFERRED — needs spec / owner sign-off |
| D1 — Two task concepts (workflows in-memory vs housekeeping_tasks / maintenance_requests) | `FULL_SYSTEM_AUDIT.md §D1` | P1 conceptual duplication | DEFERRED — feature decision |
| E1 — Fake-domain writes skip permission checks | `FULL_SYSTEM_AUDIT.md §E1` | P1 security invariant | DEFERRED — moot until the domains persist |
| E3 — API platform rate-limit is a TODO | `FULL_SYSTEM_AUDIT.md §E3` | P1 partial | DEFERRED — wraps an external control |
| Documents — no storage wiring | `FULL_SYSTEM_AUDIT.md §H` | P2 inert seam | DEFERRED — adapter seam preserved |

No §53 redesign has been attempted. No silent removal of surfaced features.

---

# PHASE A RETEST RECORDS (UI-0019..0034)

Phase A's missing-dialog defects (UI-0019..0026) were fixed at code level, then
the owner-approved small-batch browser retest drove the real screens against the
hosted DB (2026-10-09). The retest surfaced eight further defects (UI-0027..0034).
Every VERIFIED status below is backed by an actual browser exercise — created
records read back on-screen, doors exercised end-to-end.

## Index

| ID | Screen | Severity | Status |
|---|---|---|---|
| UI-0019 | Suppliers — Create dialog | P1 major | VERIFIED (2026-10-09) |
| UI-0020 | Purchases — four-tab page | P1 major | VERIFIED (2026-10-09) |
| UI-0021 | Items — Create dialog | P1 major | VERIFIED (2026-10-09) |
| UI-0022 | Recipes — ingredient editor | P2 impaired | NOT RETESTED — code-level fix stands |
| UI-0023 | Stock-takes — count lines + post | P2 impaired | NOT RETESTED — code-level fix stands |
| UI-0024 | PO line-items form | P1 major | VERIFIED (2026-10-09) |
| UI-0025 | GRN received vs accepted qty | P2 impaired | VERIFIED (2026-10-09) |
| UI-0026 | Payment allocation control | P2 impaired | VERIFIED (2026-10-09) |
| UI-0027 | Suppliers — service↔door column mismatch | P0 blocker | VERIFIED (2026-10-09) |
| UI-0028 | Procurement lists — malformed `.order()` strings | P1 major | VERIFIED (2026-10-09) |
| UI-0029 | Procurement services — door param mismatches | P0 blocker | VERIFIED (2026-10-09) |
| UI-0030 | Items — empty units/categories dropdowns | P1 major | VERIFIED (2026-10-09) |
| UI-0031 | GRN — Receive-into-Location dropdown empty | P1 major | VERIFIED (2026-10-09) |
| UI-0032 | `toDoorArgs` double-`p_` mangling | P0 blocker | VERIFIED (2026-10-09) |
| UI-0033 | PO approve — illegal DRAFT→APPROVED + hidden error | P1 major | VERIFIED (2026-10-09) |
| UI-0034 | 031 doors — missing 3-arg `app.evaluate_access` | P0 blocker | VERIFIED (2026-10-09) |

## UI-0019..0026 — small-batch retest proof

Retest scope (owner-picked "small-batch"): 3 suppliers, 10 items, 1 PO→GRN→
Invoice→Payment chain, 1 allocation. All browser-driven at the dev app signed in
as OWNER001 against the hosted Supabase project.

| Leg | Exercise | Evidence |
|---|---|---|
| Suppliers (UI-0019) | Create 3 suppliers incl. Shree Balaji Feeds & Traders | rows read back ACTIVE on `/inventory/suppliers` |
| Items (UI-0021) | Create 10 items (Maize (Yellow), soy, DDGS, medicines, …) | rows read back on `/inventory/items` |
| Locations | Create 12 stock locations (Main Store + 11) | rows read back |
| PO (UI-0020/0024) | Create PO-2026-000005 with line items, approve | Orders tab: PO row APPROVED, ₹27,825 |
| GRN (UI-0025) | Receive PO → post GRN-2026-000001 | Receipts tab: GRN POSTED; PO → RECEIVED |
| Invoice (UI-0020) | Post invoice 2026-000001 | Invoices tab: POSTED, ₹27,825, outstanding ₹27,825 |
| Payment (UI-0026) | Record payment 2026-000001 ₹27,825 BANK TRANSFER; then ₹100 part-payment allocated to invoice 2026-000001 | Payments tab: 2 payments; invoice → PARTIALLY_PAID, outstanding ₹27,725 |

§15 volume targets remain unmet (documented in `UI_DEMO_DATA_LOG.md`) — the
retest proves the paths, not the volume.

## UI-0027

- **Screen / Route**: `/inventory/suppliers` + procurement services
- **Severity**: P0 blocker
- **Actual**: Create Supplier 404s — the service selects/references non-schema
  columns (`trade_name`, `tax_id`, `tax_type`, `payment_terms`) and the doors
  expect `p_supplier_code`/`p_display_name`/`p_tax_identifier`/
  `p_payment_terms_days`.
- **Root cause**: service layer written against invented column names, not the
  executed schema.
- **Fix**: realigned service selects and door args to the schema/door signatures.
- **Retest**: 3 suppliers created through the dialog, all read back.
- **Status**: VERIFIED (2026-10-09)

## UI-0028

- **Screen / Route**: procurement list reads
- **Severity**: P1 major
- **Actual**: seven `.order("x.desc")` strings passed whole as the column name,
  producing broken sorts/queries.
- **Fix**: split into column + `{ ascending: false }` at the 7 sites.
- **Retest**: all four Purchases tabs and Suppliers list render ordered rows.
- **Status**: VERIFIED (2026-10-09)

## UI-0029

- **Screen / Route**: procurement write doors
- **Severity**: P0 blocker
- **Actual**: door param mismatches — missing `p_organization` on add/set/
  recalc/post/cancel doors; `create_goods_receipt` sent `p_supplier` +
  `p_received_at` which the door does not take; `recordSupplierPayment` /
  `createPurchaseInvoice` missing required `p_outlet`.
- **Fix**: service payloads realigned to the door signatures.
- **Retest**: PO → GRN → invoice → payment chain all succeeded through the UI.
- **Status**: VERIFIED (2026-10-09)

## UI-0030

- **Screen / Route**: `/inventory/items` — Create dialog
- **Severity**: P1 major
- **Actual**: Base Unit / Category dropdowns empty DB-wide
  (`units_of_measure`, `inventory_categories` had zero rows), so no item can
  ever be created.
- **Fix**: migration `051_seed_units_categories.sql` seeds standard units +
  categories; applied to the hosted DB.
- **Retest**: dropdowns populated; 10 items created.
- **Status**: VERIFIED (2026-10-09)

## UI-0031

- **Screen / Route**: `/inventory/purchases` — GRN dialog
- **Severity**: P1 major
- **Actual**: Receive-into-Location dropdown empty though `listLocations`
  returns data.
- **Root cause**: client wiring bug in `PurchasesPage` (state not fed to the
  select).
- **Retest**: GRN-2026-000001 posted into Main Store via the dropdown.
- **Status**: VERIFIED (2026-10-09)

## UI-0032

- **Screen / Route**: global RPC funnel (`src/db/case.ts`)
- **Severity**: P0 blocker
- **Actual**: `toDoorArgs` re-prefixed already-`p_`-named keys → `p_p_organization`
  → PostgREST "function does not exist" → HTTP 404 on every one of ~900 door
  call sites in ~20 newer service files.
- **Fix**: strip a leading `p_` before re-prefixing. Proven by direct
  `.rpc('create_supplier', {p_organization,…})` succeeding from the page while
  the funnel call 404'd.
- **Retest**: entire procurement chain ran through the funnel.
- **Status**: VERIFIED (2026-10-09)

## UI-0033

- **Screen / Route**: `/inventory/purchases` — Orders tab
- **Severity**: P1 major
- **Actual**: two defects. (a) Approve called `set_purchase_order_status`
  DRAFT→APPROVED, an illegal transition — the door's state machine only allows
  DRAFT→PENDING_APPROVAL→APPROVED. (b) The dialog's error banner rendered
  behind the modal overlay, so refusals were invisible (§75 masking).
- **Fix**: two-hop approve in `PurchasesPage`; shared `errorBanner` rendered
  inside all four dialogs.
- **Retest**: Approve flips PO DRAFT→APPROVED visibly; a forced refusal surfaces
  as a visible `[role=alert]` inside the dialog.
- **Status**: VERIFIED (2026-10-09)

## UI-0034

- **Screen / Route**: `/inventory/purchases` — Invoices / Payments tabs; purchase returns
- **Severity**: P0 blocker
- **Actual**: Post Invoice → HTTP 404 on `create_purchase_invoice`. The seven
  031 doors (invoice create/add-items/set-status, payment record/allocate,
  return create/post) guard with a **3-arg** `app.evaluate_access(user, org,
  permission)`, but only the 5-arg overload (053) ever existed → SQL 42883
  masked by PostgREST as 404.
- **Root cause**: `db/supabase/031_purchase_invoices_payments.sql` calls a guard
  signature that was never created (same failure mode 053 fixed for 052-era
  doors).
- **Fix**: migration `055_app_evaluate_access_overload.sql` adds the 3-arg
  overload delegating to the 5-arg form with null property/outlet (inheriting
  the session check). Applied to the hosted DB + recorded in
  `app.schema_migrations`.
- **Retest**: invoice 2026-000001 POSTED; payment 2026-000001 recorded; ₹100
  allocation flips invoice to PARTIALLY_PAID (outstanding ₹27,725).
- **Note**: hosted ledger shows 050–054 applied-but-unrecorded (applied
  out-of-band during editing); only 055 was ledger-recorded through
  `remote-apply.mjs`. A future `remote-apply apply` would re-attempt 050–054 —
  see `UI_DEMO_DATA_LOG.md`.
- **Status**: VERIFIED (2026-10-09)
