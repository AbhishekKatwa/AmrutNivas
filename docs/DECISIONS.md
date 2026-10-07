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
**Superseded in part (Prompt #02, extended by #03 and #04's substrate):** the "no backend wiring / typed
contracts only" half of this decision no longer describes the tree. D-16–D-18 wired the data plane and
`db/supabase/000`–`014` are **executed** — against the local PostgreSQL 18.3 mirror and against the hosted
AMRUT NIVAAS Supabase project (O-7 is closed; `007` stays off it), the Phase 0 admin screens render over those
real tables (see ROADMAP Phase 0), and Prompt #03 built the authentication/RBAC/audit layer this decision used
to defer (D-29–D-40; see `docs/SECURITY.md`, `docs/PERMISSIONS.md`). What still stands is the *product* scope of
the deferral: no operational-module screens — POS/PMS/KDS/inventory/accounting/GST/HRMS/CRM/events/AI/subscription
are still honest disabled "Not implemented" nav rows. `013`/`014` put the restaurant *permissions and menu
schema* in place, which is substrate; the restaurant loop itself arrives with the rest of Prompt #04.

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
*delivery*: the link is returned to the caller, but no message reaches a real inbox until the hosted project gets
an SMTP transport and a real `site_url` (O-8 — the project itself now exists and carries `000`–`014`; see
`docs/ACCEPTANCE-03.md`).

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

## Prompt #03 decisions — authentication, RBAC, permission and audit hardening

These record what Prompt #03 actually built, including where it deliberately diverged from the prompt. Each
divergence is authorized by the prompt's own recurring rule ("use the repository's existing convention if one
exists") and each carries the trade-off that was accepted. Full behavior is in `docs/SECURITY.md` and
`docs/PERMISSIONS.md`.

## D-29 · A tenant can never be left without an operable owner
**Date:** 2026-10-07 · **Status:** ACCEPTED (Prompt #03 §30)

**Decision:** ownership is protected by refusals at the doors, not by a convention. `set_member_status` refuses
to move an `is_owner` membership to *either* retired status with `NIVAAS_OWNER_MUST_TRANSFER` (`009:331-333`);
`revoke_role` refuses to strip the owner's owner-class grant the same way (`009:273-278`); both paths refuse a
non-owner, non-platform actor with `NIVAAS_OWNER_ONLY` (`009:336-342`); and `set_member_status` refuses
self-retirement with `NIVAAS_SELF_NOT_ALLOWED` while `assign_role` refuses self-grant with
`NIVAAS_SELF_ASSIGN_DENIED` (`009:327`, `009:139`). The owner seat itself moves only through
`public.transfer_ownership`, which flips `is_owner` on and off in one transaction (`005:1198`, `005:1229-1233`).
**Reason:** an estate without an accountable owner is unmanageable and unrecoverable — no one can grant, no one
can transfer, and support has no authority to hand back. Losing the last owner through a UI slip is worse than
forcing one deliberate action (a transfer).
**Consequence:** the "leave" path for an owner is always a two-step transfer-then-exit; a single careless
suspend/remove cannot orphan a tenant. Verifier scenario 11 exercises the escalation refusals this pairs with.

## D-30 · `evaluate_access` is the denial recorder, because a raising door cannot audit its own refusal
**Date:** 2026-10-07 · **Status:** ACCEPTED (Prompt #03 §34/§82)

**Decision:** the `DENIED` outcome in the trail comes from `public.evaluate_access` (`010`), a non-raising
access-decision door whose whole purpose is to answer "may this actor do this?" and, when the answer is no,
write an `access_denied` row via `app.audit_access`. Raising doors (`app.require_permission`) still return the
`NIVAAS_ACCESS_DENIED` token to the caller but do **not** self-log the denial.
**Reason:** a refusal is delivered with `raise exception`, which aborts the door's own transaction — including
the audit insert it just made. Postgres has no autonomous transaction, and the only ways to fake one (dblink, a
queue, a background worker) are exactly the §60 machinery this product forbids. So the state is said plainly
rather than papered over: the *decision* that a denial is recorded is made by the non-raising path, and a denial
a person actually sees on a guard or confirmation screen is a denial that went through `evaluate_access`.
**Consequence:** `evaluate_access` records stranger/no-session/profile-missing denials with `organization_id =
NULL` and keeps the probed id only in `metadata` (`010:208-222`), so probing foreign tenants cannot graft rows
onto a victim's history. The §40/`app.require_tenant_visibility` rule that a foreign id answers `NOT_FOUND`
(not 403) is what stops the raise-path from leaking existence at all. Verifier scenario 12 proves outcomes land
in the trail.

## D-31 · Real session persistence — supersedes D-17's `false` flags
**Date:** 2026-10-07 · **Status:** ACCEPTED (supersedes D-17)

**Decision:** `src/db/client.ts:56` now runs `auth: { persistSession: true, autoRefreshToken: true,
detectSessionInUrl: true }`. GoTrue owns its own storage; the app adds nothing to `localStorage` itself, so
D-27 (in-memory context store and tenant cache) still stands unchanged.
**Reason:** a reload must restore the session, a long shift must not end mid-form, and the emailed link must be
consumed when the URL carries one. The Prompt #02 `false` flags existed only because there was nothing to
persist; there is now.
**Consequence:** the store's `bootstrap` re-derives context from the live session on every load (never a saved
context), `startSessionSync` keeps the tenancy cache honest per auth event, and logout is server-side first
(the `sign_out` audit is dispatched while a JWT still authenticates the door) then local. D-17 is marked
superseded rather than deleted so the reason the flags were ever `false` stays readable.

## D-32 · Email-link-only sign-in; no password path introduced
**Date:** 2026-10-07 · **Status:** ACCEPTED (Prompt #03 §41)

**Decision:** the only credential flow is a GoTrue emailed sign-in link. `auth-service.ts:79` calls
`signInWithOtp` and nothing else; `auth-service.test.ts:188` asserts the wire never carries
`signInWithPassword`, and there is no `signUp`/`updatePassword` door.
**Reason:** the prompt's §41 says "DO NOT introduce password authentication merely because this prompt mentions
it", and the architecture it inherited has no password store to secure. A one-time emailed link reuses the same
hashed-token machinery the invitation flow already proved (D-23) and keeps password hashing/reset policy entirely
inside GoTrue.
**Consequence:** there is no password to leak, reset, or brute-force in this product's own schema; rate-limiting
of the *email send* is GoTrue's surface, and the client maps a 429 from `sendSignInLink` to `RATE_LIMITED`
(D-38 notes why we do not log the request's IP ourselves). MFA/step-up remain a named readiness item, not built.

## D-33 · Two-part `domain.verb` permission keys kept over the prompt's resource/action split
**Date:** 2026-10-07 · **Status:** ACCEPTED (divergence from §12, authorized by §12)

**Decision:** the catalogue stays on the shipped `domain.verb` strings enforced by the `002` CHECK and mirrored
in `permissions.ts` (27 keys across 8 domains). The prompt's §12 "PERMISSION OBJECT" conceptually splits a key
into `domain / resource / action / description`; the implementation folds resource and action into the single
verb segment (`outlet.discount` not `outlet.bill.discount`) and keeps `domain` + `description` on each entry.
**Reason:** §12 itself closes with "use the repository's existing architecture if one already exists", and one
already did — a `domain.verb` column CHECK, a seeded matrix, and drift tests all built on it. Renaming to a
three-part scheme would migrate a live permission grammar for a modelling nicety with no enforcement benefit.
**Consequence:** a permission key is exactly one string in exactly one place (`permissions.ts`), diffed against
SQL by `permissions.test.ts`. Restaurant keys (`restaurant.kot.*`) arrive with Prompt #04 on the same pattern.
Trade-off accepted: the object model is flatter than §12's four-field form; resource-level filtering is a future
addition, not a rename.

## D-34 · The database is authoritative; the client account vocabulary lags it
**Date:** 2026-10-07 · **Status:** ACCEPTED (known gap, recorded honestly)

**Decision:** `008` made the account-status vocabulary `ACTIVE · SUSPENDED · DEACTIVATED` (retiring `INACTIVE`),
added `first_name`/`last_name`/`locale`/`timezone`/`last_login_at` and a generated-stored `display_name`. The
domain mirror `src/domain/access/authorize.ts:25` (`AccountStanding`) was updated to match, but
`src/domain/identity/types.ts` still declares the retired `AccountStatus = "ACTIVE"|"INACTIVE"|"SUSPENDED"`
(line 49, mirrored at line 147) and its `UserAccount` (lines 273-283) lacks the new profile columns.
**Reason:** Prompt #03's mandate is the data-plane and the enforcement path; a broad type-layer rename across
every consumer is the route-guard agent's surface (it is editing `src/app/**`/`src/components/**` concurrently),
not this one's, and touching it here would collide.
**Consequence:** enforcement is correct because it lives in SQL and in `authorize.ts`; the `types.ts` lag is a
documentation-and-follow-up defect, NOT_VERIFIED in `docs/ACCEPTANCE.md`, and the fix is to reconcile that file
to the DB once the concurrent route work lands. The DB, not the lagging type, is the source of truth.

## D-35 · Lower-case audit verbs kept over the prompt's upper-case event names
**Date:** 2026-10-07 · **Status:** ACCEPTED (divergence from §33, authorized by §33)

**Decision:** `audit_log.action` and `.entity` are lower_snake, enforced by the `004` CHECK
`^[a-z][a-z0-9_]{2,63}$` — `member_invited`, `role_assigned`, `auth_sign_in`, `access_denied`. The prompt's §33
lists them as `USER_INVITED`, `ROLE_ASSIGNED`, `ACCESS_DENIED`.
**Reason:** §33 itself says "use the repository's existing convention if one exists", and a case-constrained
column already did. Keeping one case avoids a CHECK migration and an index rebuild on the product's write-hottest
table for a cosmetic rename.
**Consequence:** a reader comparing the prompt's event list to the trail must translate case; `docs/SECURITY.md`
§8 and §11 do that reconciliation (e.g. `ACCESS_DENIED ⇔ access_denied`) so no mapping is implied-but-absent.

## D-36 · `INVITED` stays a membership status, not an account status
**Date:** 2026-10-07 · **Status:** ACCEPTED (divergence from §4)

**Decision:** the prompt's User object lists account statuses as `ACTIVE · INVITED · SUSPENDED · DEACTIVATED`;
the shipped `profiles.status` CHECK is `ACTIVE · SUSPENDED · DEACTIVATED` only (`008:86-88`). "Invited" lives
where it belongs — `organization_memberships.status` (`INVITED · ACTIVE · SUSPENDED · REMOVED`, `002:65`) and
`invitations.status`.
**Reason:** a single account can be INVITED into tenant A while ACTIVE in tenant B; putting `INVITED` on the
profile would claim a whole person is "just an invite" based on one tenant's state, which is exactly the
organization-specific leakage §5/§4 warn against (`user.role = OWNER` is rejected for the same reason).
**Consequence:** account status is a platform-level standing; per-tenant standing is the membership row. The
client mirror keeps both vocabularies distinct (`authorize.ts` standing vs membership status).

## D-37 · `profiles.status` is a platform kill switch with no tenant door
**Date:** 2026-10-07 · **Status:** ACCEPTED

**Decision:** nothing a tenant can call changes `profiles.status`. The only writes to it are `008`'s one-time
`INACTIVE→DEACTIVATED` backfill (`008:79`) and the `last_login_at` stamp in `010` — there is no
`set_profile_status` door. Suspending a person *within a tenant* goes through `set_member_status`, which moves
the membership, not the account. `app.require_session` reads `app.account_is_operational` and refuses a
non-operational account with `NIVAAS_ACCOUNT_*`.
**Reason:** deactivating a login across the entire platform is not a tenant's authority — a tenant that could
switch off a person's account could disable them everywhere, including in other tenants. Keeping the account
switch platform-only and the membership switch tenant-scoped preserves that boundary by construction.
**Consequence:** a tenant can remove someone from *its* estate but cannot strand that human's login; only a
platform operator (out of band, against the table) flips the account kill switch, and that path is intentionally
not exposed over PostgREST.

## D-38 · No IP / user-agent columns on audit rows
**Date:** 2026-10-07 · **Status:** ACCEPTED (divergence from the §48 forensic ideal)

**Decision:** `audit_log` records actor, tenant/property/outlet scope, action, entity, before/after, reason and
metadata — but no request IP or user-agent. A grep of `db/supabase` and `src/db` finds no `ip_address`/
`user_agent`/`inet` anywhere.
**Reason:** the trail is written by Postgres functions reached over PostgREST, which do not reliably expose the
originating client's socket; a value the *client* supplies (header or arg) is forgeable, and a column that can be
lied about is worse than none — it invites false-confidence forensics in a security document.
**Consequence:** IP/UA capture is a genuine gap for incident forensics and is listed as such, not papered over.
The correct future layer is the platform edge (reverse proxy / GoTrue logs), where the real socket is known and
un-spoofable by the caller. Trade-off accepted: today's trail proves *who did what to which tenant*, not *from
what address*.

## D-39 · `ORG_OWNER` is a grantable role; the owner *seat* moves only by transfer
**Date:** 2026-10-07 · **Status:** ACCEPTED

**Decision:** two different things share the word "owner" and are kept separate. The `ORG_OWNER` *role* is
grantable through `assign_role` — but only by someone who already holds the seat, because `assign_role` treats an
`owner_class` role grant as owner-only (`009:151-156`, else `NIVAAS_OWNER_ONLY`). The *ownership seat* is the
`organization_memberships.is_owner` boolean, and it changes only via `transfer_ownership` (`005:1229-1233`),
never via a role grant.
**Reason:** "who can act with owner authority" and "who is accountable for the tenant" are different questions.
An owner may legitimately empower a co-admin with the ORG_OWNER role without abdicating accountability; the
single seat must move by one explicit, reason-bearing act so there is never ambiguity about who owns the estate.
**Consequence:** a custom tenant role can never reach owner authority at all — `011` pins `owner_class = false`
and `seniority = grant_ceiling (> 0)` on every created role, and a self-check aborts the apply if any tenant row
ends up `owner_class`/`is_system`/`seniority > 100` (`011:377-384`), so a tenant cannot mint an owner.

## D-40 · Tenant role names are per-tenant and never collide with a system name
**Date:** 2026-10-07 · **Status:** ACCEPTED (fixes the 002 global-unique constraint)

**Decision:** `011` drops `002`'s global `roles_name_key` unique constraint and replaces it with two partial
unique indexes: `roles_system_name_idx` on `(name)` where `organization_id is null`, and `roles_tenant_name_idx`
on `(organization_id, name)` where `organization_id is not null`.
**Reason:** a global uniqueness rule meant the first tenant to create a role named `SUPERVISOR` blocked every
other tenant from using that ordinary word — a cross-tenant naming denial that leaks which names exist elsewhere
and makes custom roles near-unusable. Splitting the namespace gives each tenant its own naming space while keeping
the platform's system role names in a single, protected namespace so `app.has_permission`'s system-role lookups
stay unambiguous.
**Consequence:** two tenants can each define `SUPERVISOR`; neither can shadow a system role name, and a tenant
role name is only ever resolved within its own `organization_id`. Verifier scenario 13 exercises custom-role
creation and its ceiling/subset guards.

---

## Open decisions (blocking)

| # | Decision | Blocks | Notes |
|---|---|---|---|
| O-1 | **Thermal printing path** — counter-side local print bridge vs browser-print/PDF for V1 | Phase 1 POS/KDS | A browser cannot open a raw TCP socket to an ESC/POS printer. Architecture choice, not a detail. Still OPEN |
| ~~O-2~~ | ~~Data plane hosting~~ | — | **RESOLVED** → D-16 (Supabase). Control-plane co-location still deferred to Phase 9 |
| O-3 | **Environment plan** — development / staging / production, and per-customer demo isolation | First external pilot / any hosted apply | Donor deploys production from a feature branch; that habit must not carry over. Still OPEN |
| O-4 | **Repo spelling** `amrut-nivas` vs `amrut-nivaas` | Cosmetic, cheap now, expensive after first commits | Product name is definitively AMRUT NIVAAS; package name is `amrut-nivas`. The checkout is now a git repository with its own history, so the directory name is the last cheap moment to change it. Still OPEN |
| O-5 | **Design property** — is B.S.P Comfort the Phase 1 pilot, and who owns its real menu, stock list and tax profile data | Phase 1 exit gate | Cannot validate a restaurant loop on invented data. Still OPEN |
| O-6 | **i18n start** — English only vs English + one Indic locale in Phase 0 | Cheap now, brutal later | Donor ended with 6 × ~5,774-key dictionaries; rule is "never hardcode UI strings" from screen one. Still OPEN |
| **O-7** | ~~A real AMRUT NIVAAS Supabase project for a hosted apply~~ | — | **RESOLVED (2026-10-07).** The owner provisioned a dedicated NIVAAS project — never the poultry one, which `db/harness/remote-apply.mjs` hard-refuses by ref. `000`–`014` (excluding dev-only `007`) are applied and re-read: 20/20 tenant tables under RLS, 50 `SECURITY DEFINER` doors, zero unprotected tables, anon table read 401, anon door call refused `NIVAAS_NO_SESSION`. `node db/harness/remote-apply.mjs plan\|apply\|check [--through nnn] [--with-seed]` is the operator path. Two things it did **not** buy: `db/verify` stays local-only by rule, and a live session still needs O-8 |
| **O-8** | **GoTrue mailer + site URL configuration** | The sign-up half of the Phase 0 exit gate · every §78 auth row that needs a real session | The hosted project has **no SMTP transport** (`smtp_host` null) and `site_url` is still GoTrue's `http://localhost:3000` default, so an email link can be neither delivered nor returned to the app. Owner action in the Supabase dashboard; `mailer_autoconfirm` is correctly `false` and must stay so. Related owner chore: **revoke the Personal Access Token** used for the applies — it was pasted into chat and must be treated as spent |
