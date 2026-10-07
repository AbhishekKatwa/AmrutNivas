# AMRUT NIVAAS — Roadmap

Sequence fixed by Implementation Prompt #01 §33. **Prompt #02 delivered the tenancy/identity/access layer
(Phase 0 core); Prompt #03 delivered the authentication + RBAC + permission + audit hardening; the first
operational module (Phase 1 restaurant) is Prompt #04.** Each phase lists its exit gate — a
phase is not "done" because its screens exist, it is done when the gate is true.

The owner also maintains a three-release commercial cut
(`/Users/madhukatwa/Downloads/AMRUT-NIVAAS-Phase-Plan.md`): *Release 1 restaurant → Release 2 hotel →
Release 3 business*. §5 below maps the two and flags the one real disagreement.

---

## Phase 0 — Foundation

```text
Authentication · Organization · Property · Outlet · Department · RBAC · Audit · Design System · Application Shell
```

### Prompt #02 — delivered (the tenant architecture)

Proven, not asserted:

- **SQL verifier green** — `db/verify/tenant_isolation.sql` (tenant isolation): scenarios **1–9** are the
  Prompt #02 isolation bar (cross-tenant read denial 1, no direct client DML 2, foreign-id refusal at the doors
  3, outlet-scoped narrowing inside one tenant 4, a persisted context not outliving the access that justified it
  5, suspension removing authority + revoking grants while the login survives 6, the harness identity override
  unreachable from a client session 7, the invitation round trip 8, end-to-end write + archive-not-delete 9).
  This bar was **9 scenarios / 78 `PASS` assertions** at the #02 close; the file has only grown since — see the
  #03 and Phase 1 sections for the current measured total.
- **Client suite green** — `npx vitest run`: **41 test files / 566 tests passing** at this stage (51 / 721 now),
  in Node (no jsdom; render tests use `react-dom/server`'s `renderToStaticMarkup`, so effects never fire).
- **Typecheck + production build green** — `tsc --noEmit` is clean and `npm run build` succeeds: one JS chunk
  of **721.15 kB** and **27.05 kB** of CSS at this stage (756.42 kB / 27.44 kB now). Vite's chunk-size warning on
  that single bundle is known — route-level lazy code-splitting was deliberately **not** done in this stage.
- **§97 checklist + §98 stage report** — `docs/ACCEPTANCE.md` maps every Prompt #02 requirement to the
  artefact that proves it, and names the `BLOCKED` / `NOT_TESTED` / `DEFERRED` ones instead of rounding them up.

| Deliverable | Status after Prompt #02 |
|---|---|
| Organization / Property / Outlet / Department tables | **IMPLEMENTED** (`001`, doors in `005`) — RLS, chain triggers, archive-never-delete, optimistic `version` |
| Identity + access + session tables (profiles, memberships, roles, role_permissions, user_roles, property/outlet access, invitations, active contexts) | **IMPLEMENTED** (`002`) + `006` seeds 13 roles / 25 `domain.verb` permissions with self-checks |
| Server-side authorization (mandatory) | **IMPLEMENTED** — `authenticated` is SELECT-only with DML revoked (`003`); 25 doors re-prove scope+permission before acting |
| Audit writer + append-only immutability | **IMPLEMENTED** (`004`) — `app.audit()`, trigger refuses UPDATE/DELETE for every role incl. owner |
| Door error-token vocabulary + client normalisation | **IMPLEMENTED** (`src/db/door-errors.ts`, `src/lib/errors.ts`) — single-token refusals, never DB text |
| Client data plane (env gate → memoized client → `callDoor`/`rows` → one case map) | **IMPLEMENTED** (`src/config/env.ts`, `src/db/*`) |
| Context resolution (§29) + atomic switch + address-bar context (§30) | **IMPLEMENTED** (`src/domain/access/session-service.ts`, `src/state/context-store.ts`, `src/app/context-url.ts`) — the client never decides its own context; a non-uuid param is ignored rather than clearing the tenant, unrelated params survive, and an `askedFor` guard stops a switch and a URL rewrite from looping each other |
| Tenant cache isolation + generation counter (§57–§59) | **IMPLEMENTED** (`src/state/tenant-cache.ts`) — proven in `src/state/tenant-cache.test.ts` (TypeScript, **not** the SQL verifier) |
| Drift-killing tests (doors / error tokens / taxonomies diffed vs SQL, both directions) | **IMPLEMENTED** (`doors.test.ts`, `door-errors.test.ts`, `taxonomy.test.ts`, `routes.test.ts`) — `taxonomy.test.ts` also scrapes the client's own `domain.verb` gates (`clientPermissionTokens()` in `src/test-helpers/migrations.ts`) and diffs them against the seeded catalogue in `006`, so a capability the DB never seeded fails the suite instead of silently disabling a control forever |
| Shared UI primitives | **IMPLEMENTED** (`src/components/ui/*`: Button, Card, Field, Dialog, DataTable, Badge, StatusPill, EmptyState, Spinner, inputs/switch, ArchiveDialog, AccessDenied) |
| Design system tokens + application shell + brand | **IMPLEMENTED** (Prompt #01) |
| Money contract, public error model, identity types | **IMPLEMENTED** (Prompt #01) |
| Real authentication (GoTrue sign-in, session persistence + refresh) | **DEFERRED → Prompt #03** — bootstrapped today by a seeded dev user + `claim_demo_organization()`; `persistSession: false`, `detectSessionInUrl: false` |
| Invitation email delivery | **DEFERRED → Prompt #03** — accept door is proven (scenario 8); the link is never emailed |
| Admin CRUD screens + onboarding wizard + context switcher UI | **IMPLEMENTED** — routes are data (`src/app/routes.ts` `ROUTES`, mapped inside `BrowserRouter` in `src/App.tsx` with a catch-all "not implemented" route; `src/app/navigation.ts` marks the live rows and `src/app/routes.test.ts` diffs the two lists); one screen per route under `src/pages/` (organization / properties / outlets / departments / team / roles / audit + the onboarding wizard); the header `ContextSwitcher` (§27–§30) renders the three-level picker with org-wide / property-wide sentinels and non-ACTIVE rows labelled, `ContextNotices` (store `notices` + `dismissNotice(id)`) surfaces a cleared context, and `AccessDenied`/`CapabilityNote` distinguish five denial causes so only a real `role` refusal names a permission or an administrator. **End-to-end browser data flow is NOT_TESTED** — no PostgREST locally, so the app boots into its honest "no data plane" state (see "Not yet exercised") |

### Prompt #03 — delivered (Phase 0 security substrate)

`008`–`012` plus the client half. Each of the four items #02 deferred arrived, one of them deliberately not in
the form the prompt asked for (D-32: email-link-only sign-in — no password path was introduced, because §41
forbade inventing one and GoTrue magic links already satisfy "a real session"):

1. **Real authentication** — `src/db/client.ts` boots GoTrue with `persistSession/autoRefreshToken/
   detectSessionInUrl: true` (supersedes D-17's `false` flags, D-31); `src/domain/auth/auth-service.ts` signs in
   with `signInWithOtp` (:79) and signs out through `signOut` (:118), and `010` records both as
   `sign_in`/`sign_out` session events with `last_login_at` stamped on the profile.
2. **The account itself is a gate** — `008` makes `profiles.status` refuse a suspended or deactivated person at
   every door, and a deleted profile fails closed (`NIVAAS_PROFILE_MISSING`); scenario 10 proves it.
3. **RBAC + permission hardening** — `009` blocks privilege escalation at the doors (a role cannot be granted a
   permission its grantor does not hold; `ORG_OWNER` cannot be demoted or stripped of its last holder), `011`
   lets a tenant invent its own role inside those same walls, and `012` closes the invitation lifecycle (one
   pending invitation per `(organization, email)`, expiry swept lazily, cancel vs revoke distinguished).
   Scenarios 11–14. DEPARTMENT-scope grants stay **refused, not half-wired** (D-26) — `assign_role` still answers
   `NIVAAS_DEPARTMENT_GRANTS_UNSUPPORTED`, and `my_permissions` resolves organization/property/outlet only.
4. **`evaluate_access` + `authorize()`** — the non-raising access decision the client pre-flights with (`010`,
   D-30), mirrored as a pure ladder in `src/domain/access/authorize.ts` and tested against every denial reason,
   so the UI and the database cannot disagree about *why* someone was refused.

**Proof:** `db/verify` **15 scenarios / 195 `PASS` assertions / 0 failures on a cold rebuild**; client suite
**51 files / 721 tests**; `npx tsc --noEmit --incremental false` clean; `npm run build` 756.42 kB + 27.44 kB;
`docs/SECURITY.md`, `docs/PERMISSIONS.md` (54-token catalogue) and the drift gates
(`permissions.test.ts`, `doors.test.ts`, `door-errors.test.ts`, `taxonomy.test.ts`) green in both directions.
The §78 checklist and the §81 stage report are `docs/ACCEPTANCE-03.md`.

**Exit gate for Phase 0:** a real person can sign up, create an organization, add two properties with different
currencies/timezones, add an outlet to each, invite a second user with a different role, and see tenant B
provably unable to read tenant A's rows at the database level. The tenancy/RBAC/audit half is **proven**
(scenarios 1–14); the *sign-up / invite-a-real-person / email-the-link* half is **BLOCKED on owner
configuration**, not on code — see the next list.

**Not yet exercised (read as pending, not done):**
- **A behavioural run against the hosted project.** `000`–`014` (minus the dev-only `007`) are applied to the real
  AMRUT NIVAAS Supabase project and re-read structurally — 20/20 tenant tables under RLS, 50 doors, zero
  unprotected tables, anonymous table read refused 401, anonymous door call refused `NIVAAS_NO_SESSION`. The
  195-assertion scenario file is **deliberately never run hosted** (`db/harness` keeps it local-only).
- **A delivered sign-in link** — the hosted project has **no SMTP transport** (`smtp_host` null) and `site_url`
  is still GoTrue's `http://localhost:3000` default, so a magic link can be neither sent nor landed on the app.
  Owner action, through the Supabase dashboard.
- **End-to-end browser data flow** — PostgREST is not installed locally, and the hosted stack has not been driven
  from a browser in this session (**NOT_TESTED**). With no project keys the app boots into its honest
  "no data plane" state rather than showing placeholder rows.
- **Cache / state isolation (§57–§59)** — proven in `src/state/tenant-cache.test.ts`, asserted NOT covered by
  the SQL verifier.

---

## Phase 1 — Restaurant

`Menu · Tables · POS · KOT · KDS · Payments`

Prerequisites: Phase 0 complete (tenancy, RBAC, audit) and **the printing decision resolved** — KOT/KDS is
where an unresolved print architecture becomes a customer-visible failure.

**In progress (Prompt #04).** `013` seeded the 27 restaurant tokens onto the system roles and proved the
permission ladder in-SQL; `014` created the six menu tables and their 19 doors, and scenario 15 attacks them.
Floors/tables, the order state machine, the bill calculation engine, payments and KOT are the remaining #04
migrations (`015`–`018`), and none of the restaurant UI exists yet — so this phase is substrate, not a usable
restaurant.

Must-not-skip detail: tax computation on the bill belongs here (a restaurant that cannot issue a
compliant bill is not sellable in India), even though the accounting engine and GST reports arrive in
Phase 4. Bill-level tax is calculation; the ledger is bookkeeping — see §5.

**Exit gate:** one real service at the design property: seat → order → fire to kitchen → amend → split →
settle → day close, with the printed bill, the Z-report and the outlet revenue figure agreeing, and every
void/amendment carrying a reason and an audit row.

---

## Phase 2 — Inventory

`Recipes · Inventory · Procurement · Suppliers · Wastage`

Ledger-based stock from the first row (see `ARCHITECTURE.md` §8) — never a mutable `current_stock`.
Recipe explosion connects Phase 1 consumption to stock, which is what makes the two phases one product.

**Exit gate:** a physical count reconciles to the ledger through labelled shortage/adjustment only, and a
purchase-to-payable path produces the supplier outstanding without anyone editing a number.

---

## Phase 3 — Hotel

`Rooms · Reservations · Front Office · Housekeeping · Folios`

The folio is the deliverable, not the room calendar. Night audit (post room charges, no-show handling,
business-day roll in the property's timezone) is the hardest real work in this phase and the thing that
separates a PMS from a booking sheet.

**Exit gate:** a guest's table bill posts to their folio exactly once, a folio correction is reversed by a
counter-posting with a reason, and the nightly room-charge run is idempotent and re-runnable without
double-posting.

---

## Phase 4 — Finance

`Accounting · Invoices · Payments · GST · P&L`

Double-entry chart of accounts, journals, periods with close, and the reports that read journals rather
than re-adding documents. GST returns generated from posted tax, not from a re-derived summary.

**Exit gate:** for a real month at the design property, the P&L, the GST tax liability and the cash
position reconcile against each other and against the counter's own figures — with zero manual journal
entries typed by hand.

---

## Phase 5 — CRM

`Guests · Customer 360 · Loyalty · Marketing`

**Exit gate:** one guest identity across properties of an organization, with stay + dining history derived
only from posted data (never an edited "total spend" column).

---

## Phase 6 — Events

`Leads · Quotation · Banquets · Event Management · Event P&L`

Highest revenue per order and worst productization fit; per-event customization stays as configuration.
Event P&L requires Phases 2–4 to be real, or it is a spreadsheet.

**Exit gate:** a booked banquet produces deposits, a BEO, outlet orders, and an event-level P&L that ties
to the period P&L.

---

## Phase 7 — HR

`Employees · Attendance · Roster · Payroll`

Attendance and roster are ours; **payroll is an integration, not a build.** Indian payroll is a commodity
with statutory complexity that does not differentiate this product.

**Exit gate:** a week of shifts across departments with attendance exceptions driving cost allocation to
departments.

---

## Phase 8 — Commerce

`Direct Booking · QR Ordering · Online Ordering · WhatsApp`

Public-facing surfaces, so they need rate limiting, moderation and payment handling that internal screens
do not. WhatsApp automated outbound (confirmation, folio, payment link) needs provider approval lead time —
start the paper trail before the phase, not during it. Cheap deep-link-based flows ship first.

**Exit gate:** a stranger can book or order without staff touching a second system, and it lands in the
same ledger with the same audit trail.

---

## Phase 9 — Enterprise

`Multi-property · Group Reporting · Subscriptions · Advanced RBAC`

Group-level rollups across properties with different currencies and tax profiles, per-plan limits,
delegated administration, and permission scopes beyond the base matrix. Subscription billing belongs here
deliberately: pricing can only be set once real support and infrastructure cost per property is known.

**Exit gate:** the first paying multi-property group, with consolidated reporting and self-serve plan
changes, and per-property unit economics measured.

---

## Phase 10 — AI

`AI Owner · AI Finance · AI Inventory · AI Revenue · AI Operations · AI CRM`

Deliberately last. Its inputs are the history Phases 1–9 produce: purchase patterns, menu mix, occupancy,
rate performance, labour cost, guest behaviour. Without that data an "AI copilot" is a demo, and the
product's credibility with owners is what would pay for it.

Order of real value: **stock-out / coverage prediction → purchasing suggestion → pricing and revenue-mix
suggestion → guest-reply drafting → anomaly detection on money and stock.**

**Exit gate:** a recommendation that a named customer acted on and can verify in their own numbers, with
the evidence traceable to posted data.

---

## 5. Reconciliation with the three-release commercial cut

| Release plan (owner) | Roadmap phases | Agreement |
|---|---|---|
| Release 1 — *the restaurant*: multi-org, RBAC/audit, inventory, POS billing, GST finance | Phases 0, 1, 2 + **part of 4** | Same modules, same intent |
| Release 2 — *the hotel*: PMS, guest CRM, WhatsApp, staff mobile, KDS, command center | Phases 3, 5, part of 8, 1 | KDS timing differs: roadmap puts it in Phase 1 where it is needed for the service gate |
| Release 3 — *the business*: events, commerce, HR, subscriptions, AI | Phases 6, 7, 8, 9, 10 | Aligned |

**One disagreement, unresolved (D-15):** the roadmap sequences full Finance/GST in Phase 4, after
Inventory and Hotel. A restaurant POS that cannot produce a compliant tax invoice is not sellable, so
bill-level tax must move into Phase 1 while the accounting engine and GST returns stay in Phase 4. The
release plan already puts "Finance + GST" in Release 1. **Recommendation:** adopt the split — tax
computation on the document in Phase 1, double-entry ledger and returns in Phase 4 — and treat Phase 4's
P&L/reports as the accounting layer over money already posted correctly by Phases 1–3. Owner approval
needed before Prompt #02 is written against it.

---

## 6. Sequencing rules that apply to every phase

1. A phase does not start until Phase 0's tenancy and audit are real for the module's own tables.
2. Every module posts to one ledger; no module keeps a private totals column for reporting.
3. No fake implementations to make a demo look complete — an unavailable capability is labelled as such.
4. Each phase ends with the design property's real numbers reconciling, not with a screenshot.
5. Migration path when donor patterns are adopted: existing → adapter → new architecture → gradual
   migration; old code is removed only after the replacement is verified.
