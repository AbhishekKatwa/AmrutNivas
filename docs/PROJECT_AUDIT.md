# AMRUT NIVAAS — Project Audit

**Task:** Implementation Prompt #01 — Repository Audit + Architecture Foundation
**Date:** 2026-10-07
**Auditor:** Qoder agent
**Method:** structural measurement of the donor codebase plus targeted source inspection with file:line evidence. No claim below is inferred from filenames alone.

---

## 0. What was audited, and why that matters

AMRUT NIVAAS starts as a **new, separate repository** at
`/Users/madhukatwa/Documents/Qoder/2026-09-21/amrut-nivas` (owner's decision, 2026-10-07).

There was therefore no pre-existing AMRUT NIVAAS codebase to audit. What exists today is:

1. **The donor codebase** — `ccf6b386`, "AMRUT Poultry Farm", a production React/Vite/TypeScript/Supabase
   app. It was audited because it is the only evidence of what this team's architecture actually looks
   like under real usage, and because Prompt #01 requires the foundation to inherit working patterns
   rather than re-invent them.
2. **The NIVAAS baseline created by this task** — documented in §6.

The donor app is **not** being converted, renamed or refactored. It stays as it is. Its business logic
(sheds, batches, feed formulas, egg grades, traders, mortality) is poultry-specific and is **rejected**
as a source of code.

---

## 1. Current stack (donor, measured — not assumed)

```text
Frontend:      React 19 + TypeScript 5.7, Vite 6, 196 TS/TSX files, ~105.8k lines in src
Backend:       none of its own — Postgres RPCs exposed through Supabase PostgREST
Database:      Supabase Postgres; 74 numbered migration files in db/supabase/
               ~170 app.* functions + 87 public.* doors; 16 derived read-model views
Authentication: Supabase GoTrue sessions; server-side session verification
               (src/services/supabase/engine.ts:147-162)
State:         Zustand 5 — a single store, src/store/app.ts (5,137 lines)
Routing:       react-router-dom 7, lazy per-screen
UI/CSS:        Tailwind CSS v4 via @tailwindcss/vite, @theme token layer (src/index.css:9-79)
Icons/motion:  lucide-react, motion 13, three.js (decorative only)
i18n:          hand-rolled, 6 dictionaries (~5,774 keys each), lazy per-language chunks
Testing:       NONE in the app. ~40 db/verify-*.mjs node scripts test SQL/RPC refusals only
Deployment:    Vercel (vercel.json SPA rewrite), branch intelligent_engine == production
Native:        Capacitor 8 (android/, ios/ committed), APK/AAB scripts
Packaging:     javascript-obfuscator in production build, with stringArray:false and
               splitStrings:false as a hard constraint (vite.config.ts:45-54) or lazy chunks 404
```

---

## 2. Existing features (donor), classified

| Status | Capability | Evidence / note |
|---|---|---|
| **Working** | Multi-tenant company isolation in SQL | `app.current_company()` reads a request-scoped setting or the JWT claim, then RLS proves membership — `db/supabase/000_helpers.sql:60-81`; matrix in `003_auth_rls.sql:9-21` |
| **Working** | RBAC with a single matrix, enforced in write paths | `src/lib/permissions.ts:9-120`, store `can()` at `app.ts:1521,1699,1943`, mirrored as DB table `app.role_permissions` (`000_helpers.sql:108-143`) |
| **Working** | Audit trail with field-level before/after and mandatory reason | `src/types/index.ts:1340-1356`; RPCs insert audit rows in `db/supabase/004_functions.sql` |
| **Working** | Server-side receipt/document number allocation | `db/supabase/008_receipt_allocator.sql:15-32`, client format `SCOPE-YYYY-MM-DD-NNN` (`src/lib/receipts.ts:11-28`) |
| **Working** | DB error normalisation at the seam | `src/lib/dbErrors.ts:1-74` — SQLSTATE → kind/user message/retryable |
| **Working** | Write-through with refusal surfaced, store untouched | `src/services/supabase/write.ts:171-214`; reconnect/visibility re-pull `engine.ts:296-459` |
| **Working** | Boot snapshot cache in IndexedDB, cleared on sign-out | `src/services/supabase/snapshot.ts:1-24` |
| **Working** | Per-company feature flags (JSONB) | `db/supabase/065_company_feature_flags.sql:5-12`, `useFinanceEnabled` `app.ts:4999-5001` |
| **Working** | i18n with compile-checked dictionaries | `src/i18n/index.ts:1-92,171-182` |
| **Partial** | Persistence story | business rows stopped persisting at v24 but the `amrut-poultry-v1` localStorage persist + recovery key remain live (`app.ts:186,4923,4966`) — two sources of truth still wired |
| **Partial** | Permission coverage | not every write has a `can()` gate; some screens are nav-only protected |
| **Placeholder** | Legacy local auth | `src/lib/auth.ts:8-31` — client-side "hashing"/OTP demo code. Not a security control |
| **Unused** | three.js decoration | scene file removed; residual dependency only |
| **Duplicate** | Role matrix exists twice | client `permissions.ts:9` and SQL seed `000_helpers.sql:117`; the repo's own comment calls the drift "a real risk" (`000_helpers.sql:104-106`) |
| **Broken / open** | Mortality ceiling check | validates a count against deaths up to its own date (known defect carried in project memory) |

No hardcoded tenant or property IDs were found in the donor `src/` — searched, NOT FOUND.

---

## 3. Existing architecture (flows that are worth understanding)

- **Application flow:** `main.tsx` → `App.tsx` route table → lazy screen → screen reads Zustand selectors
  → screen calls a service action → action checks `can()` → `writeThrough` to a `SECURITY DEFINER` RPC →
  RPC validates scope, books money/stock, writes an audit row → response merges into the store.
- **Data flow:** Postgres is the authority; the browser store is a cache of server-derived slices. Reads
  hydrate per-person snapshots; writes go DB-first with no queue and no retry ladder by design
  (`engine.ts:8`, `dataService.ts:9`).
- **Auth flow:** cloud session gate is verified against the server rather than the device clock; the
  publishable key is the only client secret (`src/lib/supabase.ts:13-15`).
- **Tenancy flow:** the JWT carries company membership; SQL re-derives it. Frontend filtering is a
  convenience, never the boundary — which is exactly the doctrine AMRUT NIVAAS must inherit.
- **Schema-integrity flow:** `db/gen-columns.mjs` emits `src/services/supabase/columns.gen.ts` (782 lines)
  from live `information_schema`, so client column casts cannot silently drift from the database.

---

## 4. Technical debt — items to NOT carry into AMRUT NIVAAS

| Debt | Measurement | Why it must not be repeated |
|---|---|---|
| God-object store | `src/store/app.ts` = 5,137 lines | Every domain change touches one file; untestable in isolation; merge-hostile |
| Oversized services | `dataService.ts` 2,974; `lib/reports.ts` 2,646 | Business rules scattered across UI, store and service |
| Oversized screens | `BatchDetailScreen.tsx` 2,254; `FinanceScreen.tsx` 1,873; 54 screens ≈ 23,860 lines | Component-level tests impossible; every fix risks a regression |
| **Float money in the client** | JS numbers with `toFixed` rounders — `src/lib/calc.ts:350`, `src/lib/accounting.ts:43`. The DB is correct (`numeric(14,2)`, `001_schema.sql:10,132`) | Direct accounting exposure. NIVAAS uses integer minor units throughout |
| No app-level tests | confirmed: no `tests/`, `test/`, `__tests__`, no `*.test.*`/`*.spec.*`, no test script | Regressions are found by the farm, not by CI |
| Dual persistence remnants | see §2 Partial | Two sources of truth for the same rows |
| Permission matrix drift | see §2 Duplicate | UI offers what the DB refuses — a real production incident class in this repo's history |
| Hardcoded domain constants in neutral places | login domain baked as `@login.amrut.app` (`engine.ts:30`); role CHECK list in SQL (`000_helpers.sql:109-110`); receipt scopes CR/PUR/MED (`receipts.ts:11`) | Blocks a second tenant, second country, second vertical |
| Documentation drift | `IP_PROTECTION_AND_AI.md` claims base64 string-array encoding while `vite.config.ts:53-54` disables `stringArray`/`splitStrings`; `ARCHITECTURE.md:5-7` still admits a Figma-Make origin | Stale docs are worse than none |
| Dictionary mass | 6 × ~6,083–6,255 lines (~37.6k lines, ~3.3 MB lazy text) | Correct approach, wrong scale to start with; NIVAAS begins English + one Indic locale |

---

## 5. Risk assessment

**CRITICAL**
1. Client-side float money (donor) — carrying it into a product that handles invoices and GST makes the
   defect financial, not cosmetic.
2. Tenant isolation by convention rather than by policy would be catastrophic in a commercial multi-tenant
   SaaS. Mitigation is mandatory: Postgres RLS + JWT-derived scope on every read and write, never a
   frontend filter.
3. Absence of app-level tests on money/inventory paths.

**HIGH**
4. Permission matrix duplicated client/SQL → drift where the UI offers what the DB refuses.
5. God-object store and 2,000-line screens: cost of change grows with every module added — and NIVAAS
   plans to add ~12 domains.
6. Legacy client-side "auth" code left in a codebase is a false-assurance trap; it must not be copied.
7. Documentation drift already observed in the donor repo.

**MEDIUM**
8. Obfuscation coupling (`stringArray:false` constraint) — a build-time landmine inherited only if the same
   packaging is adopted before it is needed.
9. Committed native shells (`android/`, `ios/`) plus `three` in a repo that does not need them yet.
10. Dictionary scale and translation pipeline cost.

**LOW**
11. Naming/structure inconsistencies (screens vs modules organisation).
12. Unused decorative dependencies.

---

## 6. What AMRUT NIVAAS established in this task

Ports **as patterns** (re-implemented, not copied): tenancy via JWT + `current_company()` equivalent,
RLS matrix covering every tenant-scoped table, centralized permission model enforced in the write path,
append-only audit with reason-on-protected-figure, server-side document-number allocation, DB error
normaliser at the seam, columns codegen from `information_schema`, per-tenant feature flags,
numbered idempotent migrations, and the node verifier-harness discipline.

Established as new code in this task: brand configuration as the single source of product identity,
Tailwind v4 token system with a distinct NIVAAS identity, the application shell with honest
not-implemented navigation states, the `Organization → Property → Outlet → Department` domain types,
integer minor-unit money with Indian grouping formatting and drift-free splitting, the standard public
error model, the `AuditLogEntry` contract, and the testing foundation (vitest) the donor never had.

Deliberately **not** built in this task: POS, PMS, KDS, inventory engine, accounting, GST, HRMS, CRM,
events, AI, subscription billing, auth implementation, backend/database wiring. See `ROADMAP.md`.

---

## 7. Open decisions that block Prompt #02+

1. **Thermal printing path** for kitchen/hotel bills — a browser cannot open a raw TCP socket to an
   ESC/POS device. Either a counter-side local print bridge or browser-print/PDF for V1. Changes the
   architecture; must be answered before POS.
2. **Hosting/data plane** — Supabase again vs plain Postgres + own API layer, and whether the platform
   control plane (subscriptions, organizations) lives in the same database as tenant data.
3. **Tenant key strategy** — `organization_id` on everything with `property_id`/`outlet_id` only where the
   domain genuinely scopes there (this rule is stated in `ARCHITECTURE.md` §4 but must be applied per table).
4. **Environment plan** — development / staging / production, and per-customer demo isolation.
5. **Brand/domain** for the product site, and whether `amrut-nivas` or `amrut-nivaas` is the canonical
   repository spelling (product name is AMRUT NIVAAS; the repo directory was named `amrut-nivas` on
   instruction).
