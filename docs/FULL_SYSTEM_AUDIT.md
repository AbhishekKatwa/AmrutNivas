# FULL SYSTEM AUDIT — AMRUT NIVAAS

Date: 2026-10-08 · Scope: entire repository (src/, db/supabase, config, docs) · Mode: read-first audit, safe high-confidence corrections only.

Mandate: identify architectural inconsistencies, broken cross-module integrations, duplicate concepts, security gaps, incomplete flows, dead code, and UI/navigation inconsistencies; fix only what is safe and high-confidence; document everything else.

---

## A. System inventory

Stack: React 19 · TypeScript 5.7 · Vite 6 · Tailwind v4 · Zustand 5 · React Router 7 · Supabase JS 2.x. Backend: hosted Supabase Postgres, RLS (003) + SECURITY DEFINER "doors" (RPCs). Auth: User ID + Password (#31.5, migration 049 `resolve_login`).

Persistence classification of all 30 domain modules (verified by direct inspection of every service file):

| Domain | Storage | Routes/UI | Verdict |
|---|---|---|---|
| auth | GoTrue + `resolve_login` RPC (049) | sign-in | ✅ #31.5 intact |
| access (session, people, role, custom-role) | doors (005/008–012) | team, roles, audit | ✅ |
| identity | types + static permission catalogue | — | ✅ pure |
| hierarchy (org/property/outlet/department) | doors | admin CRUD | ✅ |
| audit | door + audit table (010) | audit screen | ✅ |
| restaurant (menu, floor, order, bill, kot, day, operations) | doors (013–019, 022–023) | 6+ screens | ✅ |
| inventory (stock, recipes, stock-takes) | doors (024–026) | screens | ✅ one defect (J1) |
| procurement (supplier, purchase, receipt, invoice) | doors | screens | ✅ |
| hotel (room, reservation, stay, folio, housekeeping, inspection, maintenance, asset, lost-found, guest) | doors (032–040) | screens | ✅ |
| crm | tables + doors (041) | 6 screens | ✅ guests canonical |
| events | doors (042) | screens | ✅ FK → guests.id |
| hr (employee, attendance, shift, leave) | doors (043) | screens | ✅ |
| commerce | tables + public-profile tables (044) | admin + 4 public pages | ✅ safe public reads |
| enterprise | doors (045) | switcher + screens | ✅ |
| billing | doors (046) | org billing pages | ✅ platform console pending (K4) |
| notifications | direct `.from()` tables (047) | center + automation | ✅ correct pattern |
| platform | doors (048) | admin screens | ✅ |
| analytics | reads canonical tables via Supabase | dashboards | ✅ read-only |
| ai | provider abstraction + permission-gated tools over analytics | command center | ✅ permission-aware, read-only |
| **workflows** (#26) | **in-memory Maps** | task board, my-work, approvals | ❌ P0 fake |
| **marketing** (#30) | **in-memory Maps** | campaigns screens | ❌ P0 fake |
| **revenue** (#27) | **hybrid**: real reads of room_rates / menu_item_prices / event_packages / bills / folios / events; channel pricing in Maps | pricing screens | ⚠️ P1 partial |
| **guest-experience** (#31) | **in-memory Maps** | screens | ❌ P0 fake |
| **supply-chain** (#28) | **in-memory Maps** | screens | ❌ P0 fake |
| **experience** (#29) | **in-memory Maps** | screens | ❌ P0 fake |
| **settings/configuration** (#25) | **in-memory Map** | settings screens | ❌ P0 fake |
| **integrations** | provider registry in-memory; rate limiting TODO (api-platform.ts:330) | settings UI | ⚠️ P1 partial |
| documents | pure services + storage-adapter seam; no DB wiring | — | ⚠️ P2 inert |
| onboarding | deterministic reads of canonical tables, stores nothing | wizard | ✅ by design |
| money | bigint-paise library | — | ✅ pure |

Migrations: 000–049 on disk. No journal/general-ledger tables exist anywhere (only `stock_ledger`, 024).

---

## B. Architecture consistency

The core architecture is coherent and unusually disciplined: every write goes through a SECURITY DEFINER door that calls `require_session` → `require_tenant_visibility` → `require_permission` → `require_version` → `require_reason` → `app.audit` (verified in `close_bill`, 017:771). The client mirrors the ladder in `src/domain/access/authorize.ts` for pre-flight only; the server remains authoritative. Money is integer paise (`src/domain/money`). Public pages read dedicated `*_public_profiles` tables with explicit column lists — no internal leakage.

The inconsistency is not in the core: it is that seven later domains ignore the architecture entirely (section G).

## C. Cross-module integrations

Verified-good:
- **Guests canonical identity**: 041 states "the `guests` table IS the canonical customer identity"; 042 `events.customer_id` FKs `guests(id)`; create_event and convert-lead doors pass the customer through. No parallel customer entity found.
- **Ledger-driven inventory**: all stock mutations flow through `post_stock_movement` (024) into `stock_ledger`; `consume_for_order` (026) resolves menu item → ACTIVE recipe version → ingredients, with per-ingredient idempotency keys.
- **Tenant isolation**: every door re-derives org from the row, never from client input (`consume_for_order` refuses non-members; `close_bill` calls `require_tenant_visibility(v_org)`).

Broken (documented, NOT fixed — wiring them changes behavior, which exceeds "safe corrections"):
- **C1 — Inventory never consumes on order completion.** `consume_for_order` (026:488) has **zero callers**: not in any page, not in any other domain service, and no SQL function performs it. `close_bill` (017:771) only flips status to PAID. A sold dish never decrements its recipe ingredients.
- **C2 — Restaurant bills never post to hotel folios.** `post_folio_charge` (038:301) likewise has zero callers. A resident's restaurant bill cannot charge their room.
- Both doors are granted to `authenticated` and both client wrappers exist — built but unwired.

## D. Duplicate concepts

- **D1 — Two task systems.** `workflows` domain defines an in-memory `OperationalTask` with its own board, audit, handoffs and approvals — while `housekeeping_tasks` (039) and `maintenance_requests` (039) are real DB tables with their own screens. §31 expects ONE canonical task concept with domain-specific views. Not merged: a merge is a feature decision.
- No other duplicates found: pricing reads the restaurant/hotel/event tables rather than re-deriving rates; events reference guests rather than a second customer record.

## E. Security

Verified intact (Prompt #32 checks):
- **#31.5 password auth is NOT undone**: `auth-service.ts` still routes `signInWithPassword(userId, password)` → `rpc("resolve_login")` → ACTIVE check → GoTrue `signInWithPassword` with the synthetic email; 429 → RATE_LIMITED; generic error messages; `devBypassSignIn` throws outside DEV.
- **AI is permission-aware and read-only**: `checkDomainPermission` maps each domain to its `analytics.*.view` key before any tool runs; all registered tools (ai-tools.ts) are reads routed through analytics-service. No raw SQL/DB access.
- **Public pages**: dedicated `property_public_profiles` / `outlet_public_profiles` with explicit columns + `status = 'ACTIVE'`.
- **Demo seed** (007): gated by `code = 'DEMO'`, ownerless until `claim_demo_organization()`; every row flagged `is_demo`.
- **Audit metadata strips PII** (041); audit trail covers all door writes.

Gaps (documented, not fixed):
- **E1 — In-memory domains bypass the security chain.** The seven fake services take no permission check on writes and hardcode `org_demo`/`prop_demo`/`user_admin` (workflow-service.ts:44-46). Their screens sit behind route permission gates, so access to the screen is gated — but any granted user writes to a shared, tenant-unscoped volatile store.
- **E2 — Idempotency defeat (FIXED, J1).**
- **E3 — Rate limiting is a TODO** (integrations/api-platform.ts:330).

## F. Incomplete flows

- **F1 — No general ledger.** §22–24 prescribe Journal → GL → Trial Balance → P&L. There is no journal-entry or GL table in any of the 49 migrations. Finance/accounting/P&L screens (including the four built in the previous pass) aggregate directly from operational tables (bills, folios, charges, payments, purchase invoices). The chain does not exist; the screens present operational aggregations, not bookkeeping.
- **F2 — Seven fake domains** (full list in G1): screens render, navigation shows them as real destinations, but all data vanishes on reload and cross-user visibility is impossible.
- **F3 —** `consumeForOrder`/`postFolioCharge` unwired (C1/C2).

## G. Dead code / fake data (P0 list)

**G1 — In-memory fake domains (P0).** Verified `const … = new Map()` module stores with no DB persistence and no tenant scoping:
1. `workflows/workflow-service.ts` — tasks, comments, audit log, handoffs, workflow instances, step executions, approvals, delegations; hardcoded `DEMO_ORG = "org_demo"`, `DEMO_PROPERTY = "prop_demo"`, `DEMO_USER = "user_admin"`; header admits "In-memory implementation — no DB persistence yet."
2. `marketing/marketing-service.ts:40-51`
3. `revenue/pricing-service.ts` — channel-pricing half (rate reads are real)
4. `guest-experience/guest-experience-service.ts:32-38`
5. `supply-chain/supply-chain-service.ts:46-54`
6. `settings/configuration-service.ts:38`
7. `experience/experience-service.ts:38-43`
8. `integrations/api-platform.ts:330` (partial — registry in-memory, rate-limit TODO)

All eight violate the no-fake-features rule and the tenant-isolation mandate. **Not deleted and not rewritten** — both exceed the audit's correction mandate (rewrites and removals of surfaced features are owner decisions). Every one is listed in K with the recommended disposition.

**G2 — Dead code.** `consumeForOrder` (stock-service.ts:380) and `postFolioCharge` (folio-service.ts:129): exported wrappers with zero callers. Kept (they wrap live, granted doors and are the natural wire-points for C1/C2).

## H. UI / navigation consistency

- `routes.ts` registers ~163 routes, each with a `permission` key enforced by RouteGuard; the five public routes are explicitly listed (`PUBLIC_ROUTES`). Sign-in is registered apart from the gated tree.
- `navigation.ts` has 19 groups; every item is `available: true`, meaning it points at a registered route — no dead nav entries found.
- `labelFromKey()` is a stand-in for i18n (English-only labels) — consistent everywhere, not a defect.
- The nav↔route consistency test was deleted 2026-10-07 by owner instruction; consistency currently holds but is unenforced.
- Finance routes gate on `analytics.finance.view` / `analytics.profitability.view` — consistent with the analytics family.

## I. Corrections made

**J1 — Idempotency-key defect fixed** (`src/domain/inventory/stock-service.ts:389`).

Before: `const idempotencyKey = \`CONSUMPTION:${orderId}:${menuItemId}:${Date.now()}\`;`
After: `const idempotencyKey = \`CONSUMPTION:${orderId}:${menuItemId}\`;` with a comment noting the server dedupes on the exact string and that a line id belongs in the key once wired to order lines.

Why this is safe and high-confidence: the server (`post_stock_movement`, 024:207) returns the existing movement when the key matches — `Date.now()` made every retry a fresh key, so the idempotency mechanism could never fire and a retried consumption double-consumed. No caller depends on per-call-unique keys (there are **zero callers**). Verified: `npx tsc --noEmit` clean after the edit.

No other corrections were made. Everything else in this document is reported, not changed.

## J. Remaining issues (by severity)

**P0**
1. Seven in-memory fake domains (G1 items 1, 2, 4, 5, 6, 7, 8) render as real product surfaces with volatile, tenant-unscoped data. Disposition: either persist each through doors like every other domain, or remove their routes/nav entries until persisted. Owner decision.
2. C1/C2 unwired integrations: order→inventory consumption and bill→folio posting exist as doors with no caller. Wiring them is a behavioral change and needs an owner decision on *where* they fire (e.g. close_bill vs. KOT send).

**P1**
3. No journal/GL/TB chain (F1) — finance screens are operational aggregations; §22–24 bookkeeping remains unbuilt.
4. Duplicate task concepts (D1) — workflows' in-memory tasks vs housekeeping/maintenance tables.
5. Revenue hybrid (G1 item 3) — channel pricing lost on reload while rate reads are real; least coherent fake.
6. E1 — writes on fake domains bypass permission checks (moot until they persist, but blocks any partial persistence).
7. E3 — API platform rate limiting TODO.

**P2**
8. Documents domain has no storage wiring (adapter seam empty).
9. Nav↔route consistency unenforced since the test deletion (2026-10-07).
10. `labelFromKey()` stand-in awaits real i18n.

## K. Verdict

Core (auth, access, hierarchy, audit, restaurant, hotel, inventory, procurement, CRM, events, HR, commerce, enterprise, billing, notifications, platform, analytics, AI) is production-shaped, tenant-isolated and permission-gated end to end. The product's edges — operations/workflow, marketing, revenue management, guest experience, supply chain intelligence, experience, settings/configuration, integrations — are façades over in-memory state. Two built integration points (C1, C2) are unwired, and the bookkeeping chain (F1) does not exist. One defect (idempotency) was fixed this pass.

Validation: `npx tsc --noEmit` clean after the single correction. No build, test or lint runs beyond that, per mandate.
