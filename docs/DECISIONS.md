# AMRUT NIVAAS — Decisions

Only decisions actually taken are recorded here (Prompt #01 §34). Status is explicit:
**ACCEPTED** = decided and binding · **PROPOSED** = taken by this task, reversible, needs owner sign-off ·
**OPEN** = not decided, blocking something.

---

## D-01 · AMRUT NIVAAS is a new, separate repository
**Date:** 2026-10-07 · **Decided by:** owner · **Status:** ACCEPTED

**Decision:** the product lives in `/Users/madhukatwa/Documents/Qoder/2026-09-21/amrut-nivas`, separate
from the production poultry app (`ccf6b386`), which is not converted, renamed or refactored.
**Reason:** the poultry app is live with real farm data, Vercel production deploys from its branch, and
visible rebranding or restructuring of it would affect a running business. A separate repo also lets the
hospitality product adopt the donor's lessons (modular store, no float money, tests from day one) instead
of inheriting its shape.
**Consequence:** "audit the existing repository" was executed as an audit of the donor codebase; reuse is
by pattern, not by copy.

## D-02 · Product name and brand configuration
**Date:** 2026-10-07 · **Decided by:** owner · **Status:** ACCEPTED

**Decision:** product name **AMRUT NIVAAS**, tagline **The Operating System for Hospitality**. The working
names HOSPIRA and Amrut Hospitality OS are retired; "Amrut Poultry / Amrut Poultry Farm" is never the
product identity. `src/config/brand.ts` is the single source; `document.title` and any identity surface
read from it; the only static occurrence is `<title>` in `index.html`.
**Reason:** Prompt #01 §16. The owner chose to keep the Amrut family name after being told the poultry
association may read as an agri vendor to hotel buyers — that trade-off is accepted, not re-litigated.
**Note:** repo directory is `amrut-nivas` (one "a") as instructed while the product is NIVAAS; recorded
under D-14 as a naming consistency item.

## D-03 · Preserve the donor's technology stack
**Date:** 2026-10-07 · **Status:** ACCEPTED

**Decision:** React 19 + TypeScript 5.7 + Vite 6 + Tailwind CSS v4 + Zustand 5 + react-router-dom 7 +
lucide-react + clsx + date-fns, tested with vitest.
**Reason:** the stack is sound and the team has production experience with it; rewriting would add risk
with no architectural benefit (Prompt #01 §1, §35). No Next.js, no NestJS, no Redux, no new UI framework.

## D-04 · No poultry business logic is ported
**Date:** 2026-10-07 · **Status:** ACCEPTED

**Decision:** architecture patterns are re-implemented; domain code, vocabulary, calculations, seed data
and Supabase project are not shared.
**Reason:** shed/batch/feed/egg/trader semantics have no hospitality equivalent, and coupling two live
products to one database would put farm data at risk.

## D-05 · Money is integer minor units; float is banned
**Date:** 2026-10-07 · **Status:** ACCEPTED

**Decision:** `Money` is exact integer paise (`bigint`) with parse-from-string rupee input, additive
arithmetic, deterministic remainder splitting and `Intl`-based formatting; the database will use `numeric`.
**Reason:** the donor app computes money with JS floats and `toFixed` (`src/lib/calc.ts:350`,
`src/lib/accounting.ts:43`) while only its database is correct — an accounting exposure in a product that
must issue tax invoices. Prompt #01 §22 makes this non-negotiable.
**Consequence:** formatting is locale-pluggable from day one, so nothing is India-locked.

## D-06 · Foundation only in this stage: no backend, auth or module implementations
**Date:** 2026-10-07 · **Status:** ACCEPTED

**Decision:** no Supabase/Postgres wiring, no authentication implementation, no POS/PMS/KDS/inventory/
accounting/GST/HRMS/CRM/events/AI/subscription code. Domain entities exist as typed contracts, and the
navigation exposes unavailable items as disabled "Not implemented" rows.
**Reason:** Prompt #01 §IMPORTANT and §35 forbid building the product or creating placeholder pages in
this task.
**Superseded in part (Prompt #02, extended by #03):** the "no backend wiring / typed contracts only" half
of this decision no longer describes the tree. D-16–D-18 wired the data plane and `db/supabase/000`–`012` are
**executed** against a local PostgreSQL 18.3 mirror, the Phase 0 admin screens render over those real tables
(see ROADMAP Phase 0), and Prompt #03 built the authentication/RBAC/audit layer this decision used to defer
(D-29–D-40; see `docs/SECURITY.md`, `docs/PERMISSIONS.md`). What still stands is the *product* scope of the
deferral: no operational-module screens — POS/PMS/KDS/inventory/accounting/GST/HRMS/CRM/events/AI/subscription
are still honest disabled "Not implemented" nav rows (the restaurant loop arrives with Prompt #04).

## D-07 · Tax computation on the document belongs in Phase 1; the accounting engine stays in Phase 4
**Date:** 2026-10-07 · **Status:** PROPOSED (needs owner sign-off; see ROADMAP §5)

**Reason:** a restaurant that cannot print a compliant bill is unsellable, but double-entry books, GST
returns and P&L require the ledgers of Phases 1–3 to exist first. Splitting "calculation on a document"
from "bookkeeping" preserves both truths without faking accounting.

## D-08 · Obfuscation and native packaging deferred
**Date:** 2026-10-07 · **Status:** PROPOSED

**Decision:** no `javascript-obfuscator` and no Capacitor in the initial build; they are added when there
is a distribution need.
**Reason:** the donor's obfuscation carries a live landmine — `stringArray:false` and `splitStrings:false`
are mandatory or every lazy screen 404s (`vite.config.ts:45-54`) — and its own `IP_PROTECTION_AND_AI.md`
already contradicts that config. Adopting it before it is needed imports a build failure mode and stale
documentation for free. Native shells are likewise irrelevant until there is an app to ship.

## D-09 · vitest is the application test framework
**Date:** 2026-10-07 · **Status:** ACCEPTED

**Decision:** vitest for unit/domain tests in `npm test`, with the donor's node-verifier harness discipline
(assert the valid case is accepted *and* the invalid case is refused with a specific message) carried over
when the database arrives.
**Reason:** Prompt #01 §29, and the donor ships with zero app-level tests — the direct reason float money
and permission drift survived there.

## D-10 · Domain-first frontend layout adopted at creation
**Date:** 2026-10-07 · **Status:** ACCEPTED

**Decision:** `src/{app,config,design-system,domain,modules,services,lib,types}` from the first commit, with
`domain/` pure and network-free.
**Reason:** the donor reached one 5,137-line store and 2,000-line screens precisely because structure was
retrofitted. Adopting the layout now costs nothing; adopting it later costs a rewrite (Prompt #01 §19
"do not blindly restructure a working application" does not apply to an empty repo).

## D-11 · Locale, currency, timezone and tax are property-level, not organization-level
**Date:** 2026-10-07 · **Status:** ACCEPTED

**Reason:** Prompt #01 §10–11. A hospitality group can run properties in two states (different GST
place-of-supply) or two countries (different currency and timezone). Business-day definition is
property-level too, because a hotel night audit and a restaurant day close are different clock events.

## D-12 · Tenant isolation is enforced in the database; RLS-matrix completeness is a review gate
**Date:** 2026-10-07 · **Status:** ACCEPTED

**Decision:** every tenant-scoped table must be registered in the RLS matrix when created; a table that is
company-scoped but absent from the matrix fails review.
**Reason:** Prompt #01 §7 forbids frontend-only isolation, and the donor project already recorded this
exact bug class as a completeness hazard.

## D-13 · One source of truth for the permission matrix
**Date:** 2026-10-07 · **Status:** PROPOSED

**Decision:** the matrix is generated/served from one definition; the client mirrors it read-only and
enforcement lives in the write path.
**Reason:** the donor keeps it in TypeScript and SQL and lets them drift — its own SQL comment calls this
"a real risk" (`db/supabase/000_helpers.sql:104-106`), and the drift produced a real incident where the UI
offered an action the database refused.

## D-14 · Domain events via a transactional outbox; no broker, no microservices, no Kubernetes
**Date:** 2026-10-07 · **Status:** PROPOSED

**Reason:** Prompt #01 §25 and §35 forbid infrastructure adopted for the sound it makes. An outbox row
written in the same transaction gives auditability, notifications, analytics and later AI one reliable,
replayable feed, and leaves the seam where a real bus can be introduced later without changing producers.

## D-15 · SPA fallback must 404 for missing asset chunks
**Date:** 2026-10-07 · **Status:** ACCEPTED

**Decision:** `vercel.json` rewrites everything to `index.html` **except** `/assets/*`, which keeps real
404s, with immutable caching on `/assets/*`.
**Reason:** the donor hit exactly this — a hashed chunk that no longer exists returned 200 HTML, and the
client then failed to parse a script instead of noticing a stale deploy.

---

## Prompt #02 decisions — the tenant architecture

## D-16 · Supabase is the data plane (resolves O-2)
**Date:** 2026-10-07 · **Decided by:** owner + this task · **Status:** ACCEPTED

**Decision:** the data plane is Supabase — managed Postgres + PostgREST + RLS + migrations — over a bespoke
backend. No self-hosted API layer was written; the tenant tables, policies and doors live in
`db/supabase/000`–`007` and are reached over PostgREST.
**Reason:** Supabase gives RLS, migrations and (later) GoTrue for free, and the tenancy contract that matters
here is enforced *inside* the database, which is where Postgres is strongest. A bespoke API would add a tier
to build, host and secure without adding a control the doors do not already run.
**Consequence:** there is no REST layer (§11 of `ARCHITECTURE.md`); the door list *is* the API surface. A
future gateway sits *in front of* the doors, not in place of their checks. The platform control plane
(subscriptions, org lifecycle) is still separable and deferred to Phase 9.

## D-17 · Seeded dev user + `claim_demo_organization()` instead of shipping auth first
**Date:** 2026-10-07 · **Status:** ACCEPTED, then SUPERSEDED by D-31 (Prompt #03)

**Decision (Prompt #02):** until real authentication landed, a session got a tenant through `007`'s seeded dev
estate and the `claim_demo_organization()` door, which refuses anyone who already belongs to an organization.
The client shipped with `persistSession: false`, `autoRefreshToken: false`, `detectSessionInUrl: false`.
**Reason:** shipping an incomplete auth surface is how a security hole gets committed. It was safer to defer the
whole of authentication behind one honest deferral than to half-wire a login that cannot be trusted.
**Consequence (as it stood):** `007` is **never** applied to a hosted project (README says so); live sign-in
was explicitly **not yet exercised**, and the app degraded to a status message rather than a blank screen when
no backend was configured.
**Superseded (Prompt #03):** the deferral is closed. Real email-link sign-in and session persistence arrived —
D-31 replaces the three `false` flags with `true` and D-32 records the email-link-only (no password) choice.
`claim_demo_organization()` survives, but as a local-harness convenience for the seeded estate, not as the
production sign-in path. See `docs/SECURITY.md` §9.

## D-18 · `public` doors / `app` guards — a two-schema security boundary
**Date:** 2026-10-07 · **Status:** ACCEPTED

**Decision:** the 25 client-facing doors live in `public`; every guard and helper lives in `app`. PostgREST
serves only `public`, so `app` is unreachable from a browser regardless of grants.
**Reason:** the exposure surface should be closed *by construction*, not by remembering to revoke a grant on
each new helper. A leak of an `app.*` name is then unexploitable over HTTP.
**Consequence:** the client cannot accidentally call an internal helper; `authenticated` holds SELECT only with
DML revoked, so the ONLY write path is a door. Documented in `ARCHITECTURE.md` §13.1.

## D-19 · A door returns the row it wrote; the client never re-selects it
**Date:** 2026-10-07 · **Status:** ACCEPTED

**Decision:** write doors return the written row as `jsonb`; `callDoorRow` uses it directly rather than issuing
a follow-up SELECT.
**Reason:** a second read can race a concurrent change and then the UI would display a version it never wrote —
which, with optimistic locking, is exactly how a lost update looks like a normal screen.
**Consequence:** a write door that returns nothing is treated as an `INTERNAL` defect, not an empty result; the
returned row's `version` is what the next edit sends as `p_expected_version`.

## D-20 · Single-token refusals, not sentences
**Date:** 2026-10-07 · **Status:** ACCEPTED

**Decision:** every door refusal is a single `NIVAAS_*` token and nothing else; `src/db/door-errors.ts` is the
only place a token becomes an `AppError` code + user copy, with a SQLSTATE fallback and an `INTERNAL` default
that never echoes database text.
**Reason:** the client must not parse prose, and a raw Postgres error in a toast is both a UX failure and an
information leak about a multi-tenant schema in a public repository.
**Consequence:** the token table is total over what the SQL raises and is diffed against it by
`door-errors.test.ts` (both directions, >40 tokens); a new refusal without a mapping fails the suite.

## D-21 · Optimistic `version` on every editable entity
**Date:** 2026-10-07 · **Status:** ACCEPTED

**Decision:** each editable row carries `version integer default 1`; update doors take `p_expected_version` and
raise `NIVAAS_VERSION_CONFLICT` on a stale write.
**Reason:** two operators on one tenant (front desk + manager) is the normal case; last-write-wins silently
destroys the earlier change, which in a money product is an accounting exposure even before money exists.
**Consequence:** the client maps the conflict to a retryable `CONFLICT` and tells the user to reload; a lost
update is a surfaced event, never a silent overwrite.

## D-22 · Archive with a mandatory reason; no delete path anywhere
**Date:** 2026-10-07 · **Status:** ACCEPTED

**Decision:** entities retire via `status = ARCHIVED` (+ `archived_at` on organization/property/outlet;
departments carry `status` alone) through a `set_*_status` door that requires a `reason`. No delete door
exists for any table.
**Reason:** referenced rows (a sale, a membership, an audit subject) must not vanish; and a retirement without
a recorded reason is untraceable in exactly the situations a hospitality audit asks about.
**Consequence:** the doors also refuse to *add* rows under a retired organization or write into a non-writable
property/outlet; `archived_at` where present, `status` everywhere. Hard-deletion, if ever needed, is an
explicit future decision, not an accident of a missing guard.

## D-23 · SHA-256-hashed, one-time invitation tokens
**Date:** 2026-10-07 · **Status:** ACCEPTED

**Decision:** an invitation stores only `token_hash` (SHA-256, unique); `invite_member` returns the plaintext
token exactly once (the `IssuedInvitation` type) and the store must not cache it; `accept_invitation` looks the
row up by hashing the presented token and is single-use.
**Reason:** a leaked database dump must not hand over usable invitation links, and a link that can be replayed
lets someone re-join a tenant they were removed from.
**Consequence:** `012` hardened the lifecycle around this door — one pending invitation per
`(organization_id, email)` (a partial unique index, case-insensitive on the `citext` column), a lazy expiry
sweep (`app.expire_stale_invitations`, run inside `invite_member`, not audited because time is not a person),
and `cancel_invitation` recording `member_invitation_cancelled` for the inviter versus `member_invitation_revoked`
for anyone else. The accept *door* is proven in the verifier (scenario 14). What is still **blocked** is
*delivery*: the link is returned to the caller, but no message reaches a real inbox until the owner provisions a
hosted Supabase project with an email provider — see `docs/ACCEPTANCE.md` (hosted apply / real email).

## D-24 · Suspension revokes grants; reinstatement does NOT restore them
**Date:** 2026-10-07 · **Status:** ACCEPTED

**Decision:** setting a membership `SUSPENDED`/`REMOVED` stamps `revoked_at` on that person's `user_roles`
grants in the same door; setting it back to `ACTIVE` does not un-revoke anything — access returns only through
an explicit `assign_role`.
**Reason:** if the grant rows survive in the dark, any later bug that forgets to filter on `revoked_at` honours
authority that was meant to be gone. Reinstatement is a deliberate act, not a side effect of a status flip.
**Consequence:** Scenario 6e asserts the grants themselves are revoked while 6d asserts the *login* (profile)
row survives — revoking a membership never revokes the identity.

## D-25 · Empty string clears; absent leaves the column alone (`app.blankable`)
**Date:** 2026-10-07 · **Status:** ACCEPTED

**Decision:** in update doors `app.blankable(current, proposed)` treats `null` as "this field was not edited"
and an empty/whitespace string as the stated intent to clear a nullable text column.
**Reason:** every door takes optional arguments, so `coalesce` alone could never blank a column — an admin form
that cleared a phone number would silently keep the old one, which is a data-integrity bug that reads as a UI
glitch.
**Consequence:** `toDoorArgs` drops `undefined` (door default applies) but sends `null` deliberately; the
convention is uniform across the 17 `blankable` call sites in the `update_organization`, `update_property` and
`update_outlet` doors, so a nullable text field is genuinely clearable.

## D-26 · Refuse DEPARTMENT-scope grants rather than half-wire them
**Date:** 2026-10-07 · **Status:** ACCEPTED

**Decision:** `roles.scope_level` accepts `DEPARTMENT` as data, but `assign_role` refuses to grant such a role
with `NIVAAS_DEPARTMENT_GRANTS_UNSUPPORTED`, because `my_permissions` resolves organization/property/outlet
grants only.
**Reason:** accepting a department id here would write a grant that silently confers nothing — a capability
that appears to exist but does not is worse than one plainly absent. **Prompt #03 kept the refusal.** It
hardened the four resolvable scopes (organization/property/outlet plus the global arm) and left DEPARTMENT as
data that cannot be granted; `app.has_permission`/`public.my_permissions` still resolve only those scopes, so
the `NIVAAS_DEPARTMENT_GRANTS_UNSUPPORTED` guard in `009` remains the honest answer. Resolving department
scoping end to end is a named future phase, not a silent half-wire (see `docs/SECURITY.md` §7).
**Consequence:** the gap is a named, tested refusal (mapped in `door-errors.ts`), not a bug waiting to be
discovered; the type system still lists DEPARTMENT as a valid scope level so nothing else breaks when it is
wired.

## D-27 · All UI state in memory; no localStorage persistence
**Date:** 2026-10-07 · **Status:** ACCEPTED

**Decision:** the context store and tenant cache are in-memory Zustand/Map only; there is no `persist`
middleware and no localStorage writer, and no route or refresh persistence in the store.
**Reason:** a multi-tenant cache living in a browser is a leak waiting to happen — a stale key would hand
Organization A's rows to Organization B, and the generation counter (§57–§59) plus active-scope gate are what
prevent that *within a session*; persisting across sessions would reintroduce the exact failure.
**Consequence:** the client re-asks `resolve_active_context` on every bootstrap (never trusting a saved
context), and the tenant-cache isolation is proven in `src/state/tenant-cache.test.ts` — **TypeScript only, not
the SQL verifier**.

## D-28 · vitest in Node with `react-dom/server`, not jsdom
**Date:** 2026-10-07 · **Status:** ACCEPTED

**Decision:** the suite runs in Node (no jsdom); the one render assertion uses `react-dom/server`
(`renderToStaticMarkup`) and service/store tests drive a stub Supabase client injected under the RPC funnel.
**Reason:** the code under test at this layer is data-plane contracts, the store, and the cache — none needs a
DOM; a stub transport lets a test assert what actually reached the wire and compare those parameters against
the migration signatures, which jsdom would not.
**Consequence:** `doorParametersMatchTheSchema` turns "the test passes" into "PostgREST would accept the call";
the stub refuses `.insert/.update/.delete` and `.single()` so a write can only be exercised through a door and
a read through `rows()`.

---

## Open decisions (blocking)

| # | Decision | Blocks | Notes |
|---|---|---|---|
| O-1 | **Thermal printing path** — counter-side local print bridge vs browser-print/PDF for V1 | Phase 1 POS/KDS | A browser cannot open a raw TCP socket to an ESC/POS printer. Architecture choice, not a detail. Still OPEN |
| ~~O-2~~ | ~~Data plane hosting~~ | — | **RESOLVED** → D-16 (Supabase). Control-plane co-location still deferred to Phase 9 |
| O-3 | **Environment plan** — development / staging / production, and per-customer demo isolation | First external pilot / any hosted apply | Donor deploys production from a feature branch; that habit must not carry over. Still OPEN |
| O-4 | **Repo spelling** `amrut-nivas` vs `amrut-nivaas` | Cosmetic, cheap now, expensive after first commits | Product name is definitively AMRUT NIVAAS; package name is `amrut-nivas`. Still OPEN |
| O-5 | **Design property** — is B.S.P Comfort the Phase 1 pilot, and who owns its real menu, stock list and tax profile data | Phase 1 exit gate | Cannot validate a restaurant loop on invented data. Still OPEN |
| O-6 | **i18n start** — English only vs English + one Indic locale in Phase 0 | Cheap now, brutal later | Donor ended with 6 × ~5,774-key dictionaries; rule is "never hardcode UI strings" from screen one. Still OPEN |
| **O-7** | **A real AMRUT NIVAAS Supabase project for a hosted apply** | Any apply outside the local harness | The migrations have only ever been run against a local PostgreSQL 18.3 mirror (`db/harness/local-pg.sh`). A **hosted apply is not yet exercised** and needs the owner to provision the project (and to keep `007` off it) |
