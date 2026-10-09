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
| UI-0035 | Room types — `bed_configuration` explicit-null 23502 | P0 blocker | VERIFIED (2026-10-09) |
| UI-0036 | 48 hotel doors — `p_property` uuid in audit slot 6 → 42883 | P0 blocker | VERIFIED (2026-10-09) |

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

## UI-0035

- **Screen / Route**: `/hotel/room-types` — New room type dialog
- **Severity**: P0 blocker
- **Actual**: Create room type → "Something went wrong". The dialog binds
  `bedConfiguration` to `null` when the field is left blank, and the service sent
  that explicit `null` to `create_room_type`, whose `p_bed_configuration` has a
  `'[]'::jsonb` **default** — an explicit null overrides the default and hits
  `room_types.bed_configuration` (`jsonb NOT NULL`) → SQL 23502.
- **Root cause**: client passes `?? null` where the door expects the parameter to
  be *omitted* (or `[]`), not nulled.
- **Fix**: `src/domain/hotel/room-service.ts` `createRoomType` sends
  `params.bedConfiguration ?? []`.
- **Retest**: EXEC / Executive Deluxe / 3 max / 2 base / 320 sq ft created from
  the dialog; row renders "EXEC · 2–3 guests · 320 sq ft".
- **Status**: VERIFIED (2026-10-09)

## UI-0036

- **Screen / Route**: all hotel doors (034–039) — every write with an audit call
- **Severity**: P0 blocker
- **Actual**: after the client fix, create still failed. Raw RPC probe exposed
  `42883: function app.audit(unknown, unknown, uuid, unknown, jsonb, uuid, jsonb)
  does not exist`: 48 hotel audit calls pass `p_property` (uuid) in **slot 6** of
  the seven-argument row-image overload (054), whose slot 6 is `text reason`.
- **Root cause**: 054 froze the seven-arg shape with slot 6 = text (028–030's
  convention) and explicitly deferred the 041/hotel callers that pass a uuid
  there. Adding a uuid-slot-6 overload is impossible: two overloads differing
  only in that slot make every untyped `null` call in 028–033/041 ambiguous
  (42725) — so the callers, not the funnel, must change.
- **Fix**: migration `056_hotel_audit_calls.sql` re-creates the 47 distinct
  affected doors (48 calls; 039 `check_out` supersedes 037's) verbatim except
  slot 6 → `null`. Org is recovered from the row image by the 054 funnel; the
  audit call already passed `p_property` as a named door param where the row
  image carries `property_id`. Generated + byte-verified by `db/build_056.mjs` /
  `db/verify_056.mjs` (47/47 OK); applied to hosted and ledger-recorded via
  `db/harness/apply-056-only.mjs` (the shared ledger is missing 050–054, so a
  plain `remote-apply` run would replay them — see UI_DEMO_DATA_LOG).
- **Retest**: room type EXEC created end-to-end through the UI (door committed,
  audit line included — the whole transaction would have rolled back otherwise).
- **Scope note**: 041 CRM doors passing `v_row.property_id` in slot 6 (8 calls)
  remain broken and stay on Phase D's defect list — same defect class, CRM
  domain.
- **Status**: VERIFIED (2026-10-09)

---

# PHASE B RETEST RECORDS (UI-0037..0051)

Phase B covered the hotel PMS surfaces — guests, front desk (rooms, room types,
reservations), stays, housekeeping, maintenance, lost & found and assets — all
driven live in the browser as OWNER001 against the hosted Supabase project.
Defects were found by exercising the real flows, fixed at code level, and every
VERIFIED status below is backed by an on-screen readback and, for writes, a
captured `rest/v1/rpc/*` entry from the browser network log. As in Phase A,
§15 volume targets remain unmet (documented in `UI_DEMO_DATA_LOG.md`) — the
pass proves the paths, not the volume.

## Index

| ID | Screen | Severity | Status |
|---|---|---|---|
| UI-0037 | Guests — create | P0 blocker | VERIFIED (2026-10-09) |
| UI-0038 | Housekeeping — create-task sheet | P3 cosmetic | VERIFIED (2026-10-09) |
| UI-0039 | Housekeeping — create task RPC | P0 blocker | VERIFIED (2026-10-09) |
| UI-0040 | Front desk — room availability | P1 major | VERIFIED (2026-10-09) |
| UI-0041 | Front desk + stay detail — permission gates | P0 blocker | VERIFIED (2026-10-09) |
| UI-0042 | Stays — check-in RPC | P0 blocker | VERIFIED (2026-10-09) |
| UI-0043 | Stays — move room RPC | P0 blocker | VERIFIED (2026-10-09) |
| UI-0044 | Stays — extend stay RPC | P0 blocker | VERIFIED (2026-10-09) |
| UI-0045 | Stay detail — routes | P1 major | VERIFIED (2026-10-09) |
| UI-0046 | Stay detail — read layer | P0 blocker | VERIFIED (2026-10-09) |
| UI-0047 | Stay detail — EXTENDED gating | P1 major | VERIFIED (2026-10-09) |
| UI-0048 | Maintenance — create request | P0 blocker | VERIFIED (2026-10-09) |
| UI-0049 | Maintenance — room select | P3 cosmetic | VERIFIED (2026-10-09) |
| UI-0050 | Lost & found — Return action | P1 major | VERIFIED (2026-10-09) |
| UI-0051 | SelectInput (shared) — disabled empty options | P1 major | VERIFIED (2026-10-09) |
| UI-0052 | Finance read layer — phantom columns, swallowed errors, open-PO mislabel | P0 blocker | VERIFIED (2026-10-09) |
| UI-0053 | Route guards — 62 permission keys never granted | P0 blocker | VERIFIED (2026-10-09) |

## UI-0037

- **Screen / Route**: `/hotel/guests` — New guest dialog · reservation guest panel
- **Domain**: Hotel / guest foundation (033)
- **Severity**: P0 blocker
- **Actual**: Create guest → 404. Three client↔door mismatches: the service never
  sent the required `p_guest_code`; it sent `p_dob` where the door declares
  `p_date_of_birth`; and it sent `p_source ?? null`, whose explicit null overrides
  the door's `'DIRECT'` default and lands NULL in a NOT NULL column (23502).
- **Root cause**: guest service written against an invented signature, not 033's
  `create_guest`.
- **Files changed**: `src/domain/hotel/guest-service.ts`
- **Fix**: mints `generateGuestCode()` (`GST-…`), renames the DOB arg, sends
  `"DIRECT"` when no source is chosen.
- **Retest**: guest Rahul Deshmukh created through the dialog
  (`b5be2042-2548-4373-8575-15d9d8225c72`) and used for the WALK_IN reservation
  2026-10-09 → 2026-10-11 (see demo log).
- **Status**: VERIFIED (2026-10-09)

## UI-0038

- **Screen / Route**: `/hotel/housekeeping` — Create task sheet
- **Domain**: Hotel / housekeeping (039)
- **Severity**: P3 cosmetic
- **Actual**: the Room select opened on a real room with no honest unselected
  state.
- **Fix**: `placeholder="Choose a room…"` on the Room select
  (`HousekeepingPage.tsx` ~709).
- **Retest**: the HK workflow below picks the room explicitly; the sheet renders
  the placeholder on open.
- **Status**: VERIFIED (2026-10-09)

## UI-0039

- **Screen / Route**: `/hotel/housekeeping` — task creation
- **Domain**: Hotel / housekeeping (039)
- **Severity**: P0 blocker
- **Actual**: `create_housekeeping_task [404]` — the client sent `p_stay`; the
  door declares `p_stay_id`.
- **Fix**: `src/domain/hotel/housekeeping-service.ts` realigned to the 039 door.
- **Retest**: full HK workflow for Room 101 below: task created → started →
  completed (room → VACANT_CLEAN) → verified (→ INSPECTED).
- **Status**: VERIFIED (2026-10-09)

## UI-0040

- **Screen / Route**: `/hotel/front-desk`
- **Domain**: Hotel / front office
- **Severity**: P1 major
- **Actual**: front desk showed "Available 0" / "No available rooms" for
  RES-2026-00001 even though Room 101 had just passed the entire designed HK
  lifecycle to ACTIVE + INSPECTED. The sellable filter counted only
  `VACANT_CLEAN`, omitting `INSPECTED` — the terminal state of a verified
  checkout clean. A verified room is sellable.
- **Fix**: the three sellable-filter sites in `FrontDeskPage.tsx` (room stats
  ~178–190, `availableRoomsForMove` ~203–210, arrival-row availability) now
  accept `(VACANT_CLEAN || INSPECTED)` on operationalStatus ACTIVE.
- **Retest**: "Available 1"; Room 101 offered in the arrival row; Check-in
  clickable (completes via UI-0042).
- **Status**: VERIFIED (2026-10-09)

## UI-0041

- **Screen / Route**: `/hotel/front-desk` + `/hotel/stays/…`
- **Domain**: Hotel / permissions
- **Severity**: P0 blocker
- **Actual**: the Check-in button was missing from the arrival row despite a
  room being available. Gates referenced phantom keys `stay.check_in` /
  `stay.check_out` / `stay.edit` that exist in neither the client
  PERMISSION_CATALOGUE nor any DB seed → false for every role, buttons never
  rendered.
- **Fix**: gates realigned to the keys the doors actually check —
  `frontoffice.checkin`, `frontoffice.checkout`, `stay.modify`,
  `frontoffice.room_move` — across four gate sites (`FrontDeskPage.tsx`
  ~115–118, `StayDetailPage.tsx` move/checkout gates).
- **Retest**: render-proven (button renders → UI-0042's 200 completes the
  chain); Move/Check-out render on the EXTENDED stay via UI-0047.
- **Status**: VERIFIED (2026-10-09)

## UI-0042

- **Screen / Route**: `/hotel/front-desk` — Check-in
- **Domain**: Hotel / stays (037)
- **Severity**: P0 blocker
- **Actual**: `check_in` rejected — the client sent 4 args; the 037 door
  requires 5, `p_expected_check_out timestamptz` with no default.
- **Fix**: `src/domain/hotel/stay-service.ts` sends `p_expected_check_out` from
  the reservation's departure date.
- **Retest**: check-in from the arrival row → `[200]`; stay `ff5ef366…` created,
  Room 101 → OCCUPIED.
- **Status**: VERIFIED (2026-10-09)

## UI-0043

- **Screen / Route**: stay detail — Move room
- **Domain**: Hotel / stays (037)
- **Severity**: P0 blocker
- **Actual**: `move_room` 404 — the client sent `p_to_room` + `p_notes`; the
  door declares `p_new_room` + `p_reason` (CHECK:
  GUEST_REQUEST|MAINTENANCE|UPGRADE|OPERATIONAL|OTHER) and takes no notes.
- **Fix**: `stay-service.ts` realigned; the UI sends a reason choice.
- **Retest**: move exercised on the EXTENDED stay → `[200]` (also proves
  UI-0047's gate).
- **Status**: VERIFIED (2026-10-09)

## UI-0044

- **Screen / Route**: stay detail — Extend stay
- **Domain**: Hotel / stays (037)
- **Severity**: P0 blocker
- **Actual**: `extend_stay` rejected — the client sent 4 args; the door requires
  5 (`p_expected_version`, no default).
- **Fix**: `stay-service.ts` sends the stay's version.
- **Retest**: extend from the detail page → `[200]`; status → EXTENDED,
  departure moved.
- **Status**: VERIFIED (2026-10-09)

## UI-0045

- **Screen / Route**: stay detail navigation
- **Domain**: Hotel / routing
- **Severity**: P1 major
- **Actual**: three navigations used `/stays/…`, which is not a registered
  route.
- **Fix**: → `/hotel/stays/…`.
- **Retest**: routes resolve; the detail page loads (UI-0046).
- **Status**: VERIFIED (2026-10-09)

## UI-0046

- **Screen / Route**: `/hotel/stays/:id`
- **Domain**: Hotel / stays read layer
- **Severity**: P0 blocker
- **Actual**: "Cannot load stay" — the read layer selected phantom columns on
  `stay_guests` / `stay_room_moves` → 400s.
- **Fix**: stay-service reads realigned to the executed columns.
- **Retest**: both reads `[200]`; the detail page renders guests and room moves.
- **Status**: VERIFIED (2026-10-09)

## UI-0047

- **Screen / Route**: stay detail — action gating
- **Domain**: Hotel / stays
- **Severity**: P1 major
- **Actual**: an EXTENDED stay (still in house) hid Move room / Check out — the
  gates only allowed `CHECKED_IN`.
- **Fix**: `canCheckOutThis` / `canMoveThis` include `EXTENDED`
  (`StayDetailPage.tsx` ~270/272), matching the doors.
- **Retest**: the EXTENDED stay was moved rooms and checked out (early
  departure) through the UI; front desk in-house then cleared.
- **Status**: VERIFIED (2026-10-09)

## UI-0048

- **Screen / Route**: `/hotel/maintenance` — create request
- **Domain**: Hotel / maintenance (039)
- **Severity**: P0 blocker
- **Actual**: `create_maintenance_request` param mismatch (404); the form also
  collected an estimated cost the door does not take.
- **Fix**: param names realigned; the estimated-cost field removed from the
  sheet.
- **Retest**: "AC dripping water" created; full lifecycle exercised with costs;
  closing it flipped Room 102 back to ACTIVE (side-effect proven).
- **Status**: VERIFIED (2026-10-09)

## UI-0049

- **Screen / Route**: maintenance request sheet — Room select
- **Domain**: Hotel / maintenance
- **Severity**: P3 cosmetic
- **Actual**: duplicate "No specific room" — `roomOptions` already carries the
  empty option and the sheet added a placeholder on top.
- **Fix**: removed the placeholder (`MaintenancePage.tsx:992`).
- **Retest**: options probe
  `["No specific room[enabled]","Room 101[enabled]","Room 102[enabled]"]`.
- **Status**: VERIFIED (2026-10-09)

## UI-0050

- **Screen / Route**: `/hotel/lost-found`
- **Domain**: Hotel / lost & found (039)
- **Severity**: P1 major
- **Actual**: every lost-found item was permanently stuck. Doors mint items as
  FOUND and `return_lost_found_item` accepts any non-terminal status (039), but
  the UI hid Return for FOUND items (`item.status !== "FOUND"` guard,
  `LostFoundPage.tsx:431`) and no FOUND→STORED door exists.
- **Fix**: client restriction removed — Return shows for any non-terminal item;
  the door is the authority.
- **Retest**: umbrella created (Room 101, "Front desk closet, shelf 2")
  `create_lost_found_item [200]` reqid 11292 → Return →
  `return_lost_found_item [200]` reqid 11303; pill FOUND → RETURNED.
- **Status**: VERIFIED (2026-10-09)

## UI-0051

- **Screen / Route**: shared `SelectInput` — all screens
- **Domain**: Design system
- **Severity**: P1 major
- **Actual**: `renderOption` set `disabled={option.value === ""}` — every
  empty-value option (placeholders like "No preference" / "No specific room",
  and "All X" filter rows) became unselectable once a real choice was made and
  could never be re-selected.
- **Fix**: `src/components/ui/SelectInput.tsx` — empty-value options render
  enabled; the placeholder renders an enabled `<option value="">`.
- **Retest**: assets edit-sheet probe `roomHasEmptyEnabled: true`; maintenance
  probe (UI-0049); assets category/status filters re-selectable after a choice.
- **Regression**: none — pure enablement; no option value or ordering changed.
- **Status**: VERIFIED (2026-10-09)

## UI-0052

- **Screen / Route**: `/finance/invoices` · `/finance/payments` ·
  `/finance/accounting` · `/finance/profit-loss` (all four finance screens)
- **Domain**: Finance / read layer
- **Severity**: P0 blocker — every screen violated §75: read failures were
  swallowed by `const { data } = await` destructuring and the pages rendered
  zeros, and two of the four reads were guaranteed to fail every time.
- **Steps**:
  1. Sign in as OWNER001 and open any finance screen.
  2. Observe the KPIs and the absence of any error banner.
  3. Check the network tab: the doomed selects return PGRST204 / 42703.
- **Expected**: Reads name real columns; a failed read surfaces an error and
  never silently renders zeros (§75).
- **Actual**:
  1. `FinanceInvoicesPage` selected `bills.table_name` (no such column —
     PGRST204) and `folios.guest_name` (42703), so the whole page read failed
     while rendering "no data".
  2. `AccountingPage` and `ProfitLossPage` both read
     `events.total_amount` — the `events` table has NO amount column
     (042: `quoted_amount`/`actual_amount` live on `event_vendors` and are
     vendor COST, not income; real event income is `event_payments.amount`).
  3. On all four pages a failed read inside `Promise.all` was destructured
     into `data = null` and never surfaced.
  4. `AccountingPage` counted every purchase order as a commitment — the
     Phase A data's 4 CANCELLED + 1 RECEIVED POs were labelled
     "Purchase Orders (open)".
- **Root cause**: the screens were written against an imagined schema
  (Phase C build, tasks #216–#219) and the destructuring pattern hid the
  resulting PGRST204/42703 from every reader.
- **Files changed**: `FinanceInvoicesPage.tsx` (prior window), 
  `FinancePaymentsPage.tsx` (prior window), `AccountingPage.tsx`,
  `ProfitLossPage.tsx`.
- **Fix**: phantom columns dropped (`table_name`, `guest_name`,
  `events.total_amount` ×2); event income re-based onto
  `event_payments.amount`; CANCELLED bills excluded from the invoices read;
  open-PO row filtered to genuinely open statuses (DRAFT /
  PENDING_APPROVAL / APPROVED / SENT / PARTIALLY_RECEIVED); every page now
  throws `firstError` after its `Promise.all` so a failed read shows the
  existing error banner. Customer fallbacks are literal
  `"Walk-in"`/`"Guest"` instead of reading `guest_name`.
- **Retest**: 2026-10-09 PASS — all four screens driven as OWNER001:
  Invoices (2 invoices, Paid ₹523, Outstanding ₹0), Payments
  (Received ₹523 / Made ₹27,925 / Net ₹−27,402 / 6 rows), Accounting
  (Credits ₹523 / Debits ₹27,925 / **PO open ₹0**), P&L
  (Income ₹523 / Expenses ₹27,925 / Net ₹−27,402 / margin −5239.4%).
  Console clean; targeted tsc clean on the four files.
- **Regression**: none — each KPI reconciles with the Phase A/B money on the
  hosted DB.
- **Status**: VERIFIED (2026-10-09)

## UI-0053

- **Screen / Route**: every route guarded by `src/app/routes.ts` permissions
  that no migration granted — 62 keys across analytics, billing, commerce,
  enterprise, events, experience, hr, marketing, revenue, integrations,
  documents, settings, task/approval, plus `shift.manage`, `station.manage`,
  `supplier.view`.
- **Domain**: Access / RBAC drift
- **Severity**: P0 blocker — dozens of built screens were unreachable for
  EVERY user, including the organization owner ("Access restricted").
- **Steps**:
  1. Sign in as OWNER001 (pre-057: 312 permissions).
  2. Navigate to `/finance/invoices` (guard `analytics.finance.view`).
  3. Observe "Access restricted".
- **Expected**: The route table's promise matches the database matrix — if a
  screen is built and routed, its guard key is granted to the roles that
  should reach it (006's own header warns exactly against this drift).
- **Actual**: the client catalogue grew one vocabulary (route guards) while
  the SQL matrix grew another (006/013/032/…); 62 guard keys existed in no
  migration.
- **Root cause**: two permission vocabularies evolved independently — the
  exact donor-project failure 006's header documents.
- **Files changed**: `db/supabase/057_route_guard_permission_grants.sql`
  (new), `db/harness/apply-057-only.mjs` (new; ledger-recorded apply).
- **Fix**: grant-only, idempotent migration 057: ORG_OWNER + ORG_ADMIN get
  all 56 org-reachable keys; PLATFORM_ADMIN gets only the six
  `platform.*.view` console keys (§41 — platform seat ≠ tenant role);
  FINANCE_MANAGER gets the two finance analytics keys; EVENT_MANAGER and
  HR_MANAGER get the view keys of their domains. Recorded in
  `app.schema_migrations` as `057_route_guard_permission_grants.sql`.
- **Retest**: 2026-10-09 PASS — probe counts correct per role
  (ORG_OWNER/ORG_ADMIN 4-of-5 with `platform.dashboard.view` withheld;
  FINANCE_MANAGER 2; EVENT_MANAGER 1; HR_MANAGER 1; PLATFORM_ADMIN 1);
  after reload the access-debugging panel shows 353 permissions
  (312 → 353) and `/finance/invoices` renders its data instead of
  "Access restricted".
- **Regression**: grant-only — nothing revoked; tenant isolation unchanged
  (role_permissions are role-scoped, not row-scoped).
- **Residual**: `revenue.pricing.edit` (edit-affordance gate inside
  RateCalendar, `RateCalendar.tsx:28`) is still granted in no migration —
  the route renders (its guard `revenue.pricing.view` IS in 057) but edit
  affordances stay hidden for everyone. Not browser-observed yet; tracked in
  the Appendix for Phase G (Revenue) with a probe-first rule.
- **Status**: VERIFIED (2026-10-09)

## Appendix · Phase B observations (recorded, NOT fixed this pass)

| Item | Detail | Disposition |
|---|---|---|
| Rate-plan doors without UI surface | `/hotel/rate-plans` is not a registered route; the five 035 rate-plan doors have no client caller (the rate calendar lives at `/hotel/revenue/rates` under Revenue) | DEFERRED — surface or remove |
| `revenue.pricing.view/edit` never seeded | **Update (2026-10-09, UI-0053)**: `revenue.pricing.view` and all other 61 route-guard keys are now granted by migration 057; `revenue.pricing.edit` (RateCalendar edit-affordance gate) remains ungranted — screens open, edit affordances hidden for everyone | PARTIALLY FIXED — `.edit` key deferred to Phase G with a probe-first rule |
| Raw staff-UUID assign dialogs | assign actions (e.g. maintenance Assign) render a single unlabeled text input expecting a raw staff UUID | DEFERRED — needs a staff picker |
| Housekeeping "Completed" pill | title case while every other status pill is uppercase | DEFERRED — cosmetic |
| Checkout has no confirm dialog | checkout applies immediately on click | OBSERVATION only |
