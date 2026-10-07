# AMRUT NIVAAS — Architecture

**Positioning:** The Operating System for Hospitality — a multi-tenant, multi-property, multi-outlet,
multi-role, multi-language, multi-currency, AI-ready hospitality SaaS.
**Status of this document:** Prompt #01 direction, corrected against what Prompt #02, #03 and the first
half of #04 actually built. The tenancy data plane, the tenant architecture and the authentication/RBAC/audit
hardening are **IMPLEMENTED and executed** — `db/supabase/000`–`014` applied twice over: against a real
PostgreSQL 18.3 in `db/harness/` (and attacked by `db/verify/tenant_isolation.sql`: **15 scenarios, 195 `PASS`
assertions, 0 failures**) and against the hosted AMRUT NIVAAS Supabase project (`000`–`014` minus the dev-only
`007`; 20/20 tenant tables under RLS, 50 `SECURITY DEFINER` doors, no unprotected table). The client mirror
lives in `src/db`, `src/domain` and `src/state`, the built shell/screens in `src/app` and `src/pages`, and the
suite is **51 files / 721 tests**. `013`/`014` are Prompt #04's substrate — the restaurant permission ladder and
the menu domain — and are described here because they are schema facts, not because the module is finished.
Anything marked **not yet exercised** has no proof behind it yet and must not be read as done — see the closing
list.

---

## 1. Core principle: one Hospitality Business Graph, not fifteen apps

AMRUT NIVAAS must not degrade into a POS with extras bolted on. Every operational fact resolves to the
same graph, so that money, stock, guests and work are reconcilable without manual retype.

```text
Organization
    ↓
Property
    ↓
Outlet
    ↓
Department

Operational domains attach to the graph at exactly one level each:
Guest · Reservation · Room · Order · Menu · Recipe · Inventory · Supplier · Purchase
Employee · Event · Invoice · Payment · Accounting · CRM · Analytics · AI
```

The graph is the contract. A module that cannot express which organization, property, outlet and
department a fact belongs to is architecturally non-compliant.

---

## 2. Tenancy model

```text
AMRUT NIVAAS PLATFORM
├── Organization A (Amrut Hospitality Pvt Ltd)
│   ├── Property A1 — Amrut Grand Hotel      → Outlets: Main Restaurant, Rooftop, Banquet, Room Service
│   ├── Property A2 — Lodge, Mahabaleshwar
│   └── Property A3
├── Organization B
│   └── Property B1 — Restaurant-only
└── Organization C
    └── Property C1 — Cloud kitchen
```

- **Organization** = the legal/customer boundary. This is the tenant. Billing, contracts and data
  residency attach here.
- **Property** = one physical location. **Locale, currency, timezone, country and tax configuration are
  property-level**, because one group can run properties in two states or two countries.
- **Outlet** = a revenue point inside a property (restaurant, bar, spa, banquet hall, room-service).
- **Department** = a cost/ownership unit (Front Office, Kitchen, Housekeeping, Finance, Stores, HR).
- **Property types are data, not code paths:** the `property_type` CHECK on `public.properties` allows exactly
  eleven values — HOTEL, LODGE, RESORT, HOSTEL, RESTAURANT, CAFE, CLOUD_KITCHEN, BANQUET, CONVENTION_CENTER,
  RESTAURANT_HOTEL, OTHER — and that list is the taxonomy the whole product branches on
  (`PROPERTY_TYPES` in `src/domain/identity/types.ts`, diffed against the SQL by `taxonomy.test.ts`).
  `BOUTIQUE_HOTEL` is deliberately **not** a property type: it lives only in `organizations.business_types`,
  a self-descriptive array (`BUSINESS_TYPES`, twelve values) that a group uses to say what it operates. A
  group can hold several formats across its sites, so the switch is `property_type`, never `business_types`.
  No module may branch on `type === 'HOTEL'` for behaviour that belongs in configuration.

---

## 3. Tenant isolation — non-negotiable

1. **The boundary is in the database, not the client.** Never rely on frontend filtering. Every
   tenant-scoped table gets RLS keyed on membership, and the session's tenant claim is derived
   server-side, never accepted from the UI.
2. **Every new company-scoped table must be added to the RLS matrix** or it silently has none. The donor
   app shipped exactly this bug class; completeness of the matrix is a review gate.
3. Reads and writes must go through the same scope-derivation helper, so a read path can never be wider
   than its write path.
4. A user's access is `(user, organization, property?, outlet?, department?, role)` — membership, not
   identity, carries the role. One human may hold different roles in two properties.
5. Cross-tenant aggregation is allowed only in an explicitly platform-scoped surface, never as a
   side effect of a missing `WHERE`.

---

## 4. Scope columns — the discipline against "add all four everywhere"

| Scope level | Applied to | Examples |
|---|---|---|
| `organization_id` | nearly every tenant table; master data shared across properties | users/memberships, roles, suppliers, chart of accounts, subscriptions |
| `property_id` | anything that happens at a location | rooms, rates, tables, outlets, shifts, invoices, stock, folios |
| `outlet_id` | facts that are genuinely outlet-specific | menu items, orders, kitchen tickets, outlet revenue, covers |
| `department_id` | ownership/cost only, never identity of a transaction | purchase approvals, cost centres, housekeeping assignment |

Rules: use the **narrowest level that is true**; derive broader levels by join, never by copy. Storing the
same fact at two levels is how reconciliation breaks. Financial rows carry the scope they are accountable
at, and one immutable `cost_center` reference rather than four.

---

## 5. Identity, authentication and RBAC

```text
User → Membership → Organization → Property → Outlet → Role → Permissions
```

**IMPLEMENTED (tables + doors):** `db/supabase/002_identity_access.sql` (profiles, organization_memberships,
roles, role_permissions, user_roles, membership_property_access, membership_outlet_access, invitations,
user_active_contexts) and the RLS + access-resolution helpers in `003_rls.sql` / `000_tenancy_helpers.sql`.

- **Authentication identity stays separate from business roles.** The auth provider answers "who is this
  session" (`auth.uid()`, mirrored into `public.profiles`); the membership table answers "what may they do
  where". Nothing encodes a role in the login. Prompt #03 wired the provider: sign-in is a GoTrue **email link
  only**, never a password (`src/domain/auth/auth-service.ts`, D-32), and the account-status gate in `008`
  makes the login itself a first-class access decision. See `docs/SECURITY.md` §2/§9.
- **A role grant is `(role, permission, scope_level, scope_id)`** resolved to the *widest applicable grant*,
  and breadth (which properties/outlets, via `membership_property_access` / `membership_outlet_access` with
  `ALL_PROPERTIES`/`SELECTED_PROPERTIES` and `ALL_OUTLETS`/`SELECTED_OUTLETS`) is kept separate from
  capability (`domain.verb` permissions). An outlet carve-out narrows only outlet-bound rows; outside the
  widest grant the row is invisible, not merely denied.
- **DEPARTMENT scope is defined but not grantable yet.** `roles.scope_level` accepts `DEPARTMENT`
  (`PERMISSION_SCOPES` = GLOBAL · ORGANIZATION · PROPERTY · OUTLET · DEPARTMENT), so a department-scoped
  role can be *seeded* — but `assign_role` refuses to grant one with `NIVAAS_DEPARTMENT_GRANTS_UNSUPPORTED`,
  because `my_permissions` resolves organization/property/outlet grants only. Accepting a department id would
  write a grant that silently confers nothing. This is deliberate: a half-wired capability is worse than an
  absent one. **Prompt #03 kept the refusal** (D-26) — it hardened the four resolvable scopes and left
  DEPARTMENT as un-grantable data; resolving it is a named future phase, not a silent half-wire.
- **Permissions are strings of shape `domain.verb`** — `006_seed_rbac.sql` ships 13 system roles and 25
  permissions, `011_custom_roles.sql` adds `role.create`/`role.edit` for a total of **27** keys across 8
  domains, and `taxonomy.test.ts` checks each seeded verb matches `PERMISSION_PATTERN` and that every verb
  the admin screens gate on is present. `docs/PERMISSIONS.md` is the admin-readable catalogue.
- **One source of truth, enforced by diffing rather than by promise** (this replaced the donor's "matrix
  lives twice and drifts" bug): `src/db/doors.ts`, `src/db/door-errors.ts` and every client status/taxonomy
  list in `src/domain/identity/types.ts` are each compared **against the SQL itself, in both directions** by
  `src/db/doors.test.ts`, `src/db/door-errors.test.ts` and `src/domain/identity/taxonomy.test.ts`. A door
  added server-side but not listed, a token raised but not mapped, a picker offering a value the CHECK would
  refuse, or a listed door renamed away — all fail the suite. See §13.
- **Enforcement is in the write path, not the nav.** A screen that only hides a button is not authorized.
  The door re-proves membership and permission before it acts, and the UI merely reflects that refusal;
  `my_permissions` output is a display aid and is re-asked by every door on every write.

---

## 6. Auditability

Hospitality software touches money, stock, reservations, guest PII and employee data; audit is a product
requirement, not an admin extra. **IMPLEMENTED:** `db/supabase/004_audit.sql` (`audit_log`, its immutability
trigger `app.forbid_audit_mutation`, and `app.audit()` — the only way history is written), the client event
type `AuditEvent` in `src/domain/identity/types.ts`, and the reader `src/domain/audit/audit-service.ts`.

```text
AuditEvent { actorId, organizationId, propertyId, outletId, action, entity, entityId,
             before, after, reason, metadata, createdAt }
```

- Field-level `before`/`after`, not just "record updated" — every door passes the jsonb it read and the jsonb
  it wrote.
- `reason` is **mandatory** where the schema requires it (archive/status changes, role revocation):
  `app.require_reason` raises `NIVAAS_REASON_REQUIRED`, and the doors refuse the write without it. A reason
  for every protected figure (price change, voided bill, stock adjustment, folio correction) is enforced
  when those modules land — **not yet exercised**, because those figures do not exist yet.
- Audit rows are append-only and unwritable by every role: the immutability trigger refuses UPDATE and DELETE
  for all roles **including the table owner**, because a privilege check would not fire for a superuser where
  a trigger does. Corrections are new events, never edits.
- Deletes are archive-only in the built layer: `status = ARCHIVED` + (on org/property/outlet) `archived_at`,
  with no delete door anywhere; soft-or-blocked deletion for money-referenced rows arrives with the modules.

---

## 7. Money, tax and locale

- **Money is integer minor units** (paise). No float, no double, anywhere — client, API or database.
  The database uses `numeric`, the client uses exact integer arithmetic.
  **IMPLEMENTED:** `src/domain/money/money.ts` (parse-from-string, add/sub, deterministic remainder split,
  locale-aware format).
- Currency is a **property-level setting**; formatting and grouping are derived from locale, so `en-IN`
  lakh/crore grouping and `en-US` thousands grouping both work without code branches.
- Rates are `numeric`, never `float`; rounding is explicitly specified per document type
  (bill total vs line vs tax) and is a tested function, not an ad-hoc `toFixed`.
- **Tax is configuration, never a constant.** No hardcoded GST slab, no hardcoded tax region. A tax
  template (SAC/HSN, rate, compoundability, place-of-supply rules) is a versioned record; documents store
  the template version they were billed under so history never re-prices itself.
- Timezone: store UTC, render in the property's timezone, and define the **business day** per property —
  a hotel night audit at 03:00 and a restaurant day close at midnight are not the same clock event.

---

## 8. Inventory: ledger-based by construction

Inventory is not a number that gets edited. **Principle only — not implemented in this task.**

```text
Opening + Purchase + TransferIn − Consumption − Wastage − TransferOut ± Adjustment = Closing
```

- Every movement is a row with document reference, reason, actor, and time. Closing stock is a
  **derived** read model, never a mutable column that can drift from its ledger.
- Valuation (moving average / FIFO) is a per-organization policy, applied consistently and versioned.
- Recipes consume stock; wastage and shortage are accounted movements with distinct reasons and owners —
  in a hotel, "shortage" is an accountability event, not a rounding error.
- Inter-outlet transfers are paired movements (in and out) that must net to zero across the property.

---

## 9. Accounting: double-entry, and only one source of truth for money

Future core objects: `ChartOfAccount`, `Journal`, `JournalLine`, `Ledger`, `AccountingPeriod`,
`CostCenter`, `ProfitCenter`.

- **Debit = Credit** for every journal is an enforced database invariant, not a UI check.
- Sub-modules (POS, PMS, procurement, payroll) do not write their own totals into reports. They post
  journals; reports read journals. Operationally-derived figures (e.g. a nightly room charge) are posted
  by an explicit, dated, re-runnable process — never by a silent UI side effect.
- **Period close is a real state:** once a period is closed, writes into it are refused, and corrections
  land in an open period with a reason.
- Invoice numbers are allocated server-side from a per-tenant sequence; gaps are acceptable, duplicates
  are not. (The donor app proves this pattern works at production scale.)
- A document's billed amount and the money actually received are different facts and are never merged
  into one figure. Receivables are per party, with loads/invoices as a drill-down.

---

## 10. Event-driven concept — at the right scale

```text
ReservationCreated · ReservationCancelled · GuestCheckedIn · GuestCheckedOut
OrderCreated · OrderSentToKitchen · OrderReady · OrderCompleted
StockLow · StockReceived · StockConsumed
InvoiceCreated · PaymentReceived · EventBooked · EmployeeAbsent
```

- **No Kafka and no microservices in this stage.** Introducing a broker now would be architecture theatre
  at the scale of hundreds of properties.
- The right first implementation is transactional: a state change and its `domain_event` row commit in
  the same transaction (outbox), with consumers that are idempotent and can be replayed. That gives
  auditability, wake-ups, WhatsApp dispatch, analytics and later AI the same reliable feed, and it can be
  moved onto a real bus later without changing producers.
- Events are named in past tense and are facts; commands (imperative, may fail validation) are a separate
  concept and must not be conflated in the same table.

---

## 11. API principles

**There is no REST API layer.** The shipped data plane is PostgREST calling `SECURITY DEFINER` doors directly
(§13): every write is `POST /rpc/<door>`, every read is a scoped `SELECT` under RLS. The door list in
`src/db/doors.ts` *is* the API surface, and it is diffed against the schema on every test run.

The principles a future REST gateway must keep are unchanged — versioned paths
(`/api/v1/organizations · /api/v1/properties · …`), input validated at the boundary, authorization enforced
server-side (never by the client picking its own context, §13.2), consistent naming, no internal
implementation leakage, structured errors (single-token refusals mapped in `door-errors`, §12), idempotency
keys on writes that create money-bearing documents. A REST layer would be a gateway in front of the doors,
not a replacement for the checks they run.

---

## 12. Errors and logging

**IMPLEMENTED:** `src/lib/errors.ts` (the `AppError`/`PublicError` model), `src/db/door-errors.ts` (the token
table) and `src/db/rpc.ts` (the funnel that routes every failure through it).

The path from a refusal to a user is deliberately short and never paraphrases the database:

```text
door raises a single token        →  NIVAAS_ACCESS_DENIED  (and nothing else — no SQL text, no column)
src/db/door-errors.ts             →  DOOR_ERRORS[token] = { code: "PERMISSION_DENIED", message: <our copy> }
new AppError(code, message)       →  toPublicError() maps code → status via statusForCode (403 here)
```

- **Doors refuse with one token, never a sentence** (`NIVAAS_*`): `NIVAAS_ACCESS_DENIED`,
  `NIVAAS_NO_SESSION`, `NIVAAS_SCOPE_MISMATCH`, `NIVAAS_VERSION_CONFLICT`, `NIVAAS_REASON_REQUIRED`,
  `NIVAAS_DEPARTMENT_GRANTS_UNSUPPORTED` and the rest. That keeps the client from parsing prose and from
  surfacing a schema detail to a browser. `door-errors.ts` is the only place a token becomes copy, and the
  table is **total** over what the SQL can raise — `door-errors.test.ts` fails if any token in the
  migrations is unmapped *or* any mapped token is no longer raised.
- **No token, only SQLSTATE:** a failure with no `NIVAAS_*` token is classified by PostgREST's own stable
  code — `42501` → PERMISSION_DENIED, `23505`/`23514` → CONFLICT, `23503` → TENANT_SCOPE_MISMATCH,
  `40001`/`40P01` → retryable CONFLICT — and everything else falls back to `INTERNAL` with a message written
  here, never the database's text.
- `toPublicError` is a **one-way filter**: it never copies a foreign `message`, stack, SQLSTATE, driver string
  or file path. Stack traces, SQL text, connection strings and secrets never reach a user.
- Structured logs answer: what / when / where / which organization / which property / which user / which
  request; request-correlation id spans client → API → DB. Prompt #03 built the **durable security trail** —
  `app.audit` writes outcomes (SUCCESS/FAILURE/DENIED) and `public.record_auth_event` writes sign-in/sign-out,
  with the §68 rule that no secret or credential material is ever stored in a row (`docs/SECURITY.md` §8). A
  general runtime **application logger** (stdout/OTEL correlation ids) is still not built; its shape is defined
  and it is a later phase. No PII or token material in logs.

---

## 13. The request path, the schema split and the client security model

This is the spine Prompt #02 actually built. One call, end to end:

```text
env gate          src/config/env.ts        only VITE_* is read, shape-checked (hosted url / local url / JWT-ish key);
                                             a half-configured build resolves "unconfigured", never crashes at import
memoized client   src/db/client.ts         createClient(..., auth:{persistSession:true, autoRefreshToken:true,
                                             detectSessionInUrl:true}); one instance; returns null when unconfigured
two funnels only  src/db/rpc.ts            callDoor / callDoorRow  = every write + the resolved reads the DB owns
                                             rows / camelRows / firstCamelRow = a plain SELECT under RLS, read-only by type
one case map      src/db/case.ts           toCamelCase at the TOP LEVEL only (JSON columns keep their own keys);
                                             toDoorArgs: expectedVersion → p_expected_version, p_ stripped on the way back
the door          public.<fn> (005,007,010,011) SECURITY DEFINER, set search_path = '', re-proves membership+permission,
                                             acts, calls app.audit(), returns the written row as jsonb
the backstop      RLS (003)                even if a door were bypassed, authenticated holds SELECT only and every
                                             tenant table has a scope policy — the client is convenience, the DB is truth
```

There are exactly **two ways this client touches Postgres** (`callDoor` and `rows`) and both funnel through
the same three steps: unwrap PostgREST's `{data, error}`, normalise any failure to an `AppError` through
`door-errors` (never a raw database string), and map `snake_case` → `camelCase` in `case.ts` — so no call
site re-invents any of them. `callDoorRow` returns the row the door *wrote* rather than re-selecting it, on
purpose: a second read can race a concurrent change and then the UI would display a version it never wrote.

### 13.1 Two schemas — a security boundary, not tidiness

Supabase's PostgREST serves functions in **`public`** and nothing else. So the split is load-bearing:

- **`public`** holds only the **50 client-facing doors** — the whole write API of the product, named in one
  place in `src/db/doors.ts`: 12 hierarchy (`create/update/set_*_status` × organization/property/outlet/
  department), 9 people/access (`invite_member`, `accept_invitation`, `cancel_invitation`, `set_member_status`,
  `transfer_ownership`, `assign_role`, `revoke_role`, `set_property_access`, `set_outlet_access`), 4 custom-role
  doors from `011` (`create_role`, `update_role`, `set_role_permissions`, `set_role_status`), 3 session/
  permission (`set_active_context`, `resolve_active_context`, `my_permissions`), 2 security-decision doors from
  `010` (`evaluate_access`, `record_auth_event`), 19 menu doors from `014` (`create_menu` … `menu_snapshot`,
  `menu_item_current_price` — the last two are reads that go through a door because a bill line must be priced
  from the snapshot the kitchen served, not from whatever the price row is today), and 1 dev-only
  (`claim_demo_organization`, from `007`). 24 are defined in `005_write_rpc.sql`; `claim_demo_organization` is
  the 25th (in `007`); `010`/`011` add 6 more and `014` the final 19.
- **`app`** holds every guard and helper — access resolution, validation, `audit()`, `blankable()`, version
  checks, chain assertions — and is **unreachable from a browser regardless of grants**, because PostgREST
  does not expose it. A bug that leaks an `app.*` name cannot be exploited over HTTP; the surface is closed by
  construction, not by remembering to revoke.

`authenticated` is **SELECT-only with DML revoked** (grant-level, not just policy-level) in `003_rls.sql`, so
there is no client path to `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` on a tenant table — a write reaches the
database through a door or not at all. The `db/verify` harness proves a client-role direct write is refused
(scenario 2).

### 13.2 Context resolution (§29) — the client never decides its own context

`src/domain/access/session-service.ts` + `src/state/context-store.ts` implement the rule that a screen must
never pick the tenant it is showing:

- On every boot, `bootstrap()` calls `resolve_active_context`, which **re-proves every level against the
  current grants server-side** (005 comment: "a revoked grant drops that level and everything under it") and
  returns what the session will actually be honoured at — not what the client saved.
- A revoked or archived level is *dropped*, not fatal, and comes back as `cleared: true`; the store turns a
  cleared answer into a visible notice (`context-cleared`), never a silently smaller context — surfaced by the
  `ContextNotices` strip in the shell header and acknowledged through `dismissNotice(id)`, which removes the
  message but never the access: a still-dropped level puts the notice back on the next load.
- `my_permissions` reloads for whatever the server narrowed to (the answer's levels, never the requested
  ones), so a dropped property cannot leave its grants cached. `can()` is a display aid only; every door
  re-checks the same predicate on write.
- `switchContext` commits **atomically under overlap**: a single monotonic `commitSequence`; each action
  claims one and only the highest-issued claim is allowed to land, so two racing switches cannot interleave
  writes and leave a screen half on tenant A and half on tenant B.

**The active context is also addressable (§30).** `src/app/context-url.ts` keeps the query string and the
store equal, in whichever direction moved. The `organization` / `property` / `outlet` params carry the tenant,
so a link opens that site on another machine and a reload does not drop back to the first property; every
unrelated param (a screen's own `?tab=ledger`) is left untouched, because reading `?tab=` as an empty context
would sign the person out of their tenant on a tab change. A param that is not a uuid is *ignored*, not acted
on — `?property=1` names nothing and must not clear the session. The trap is a feedback loop (URL → switch →
store → URL), so `useSyncContextWithUrl` records the exact search string it last `askedFor`: a link the server
narrowed is corrected to the server's answer instead of being re-tried every render. Because the URL string is
only what was *asked for*, it is never trusted — `set_active_context` and `resolve_active_context` re-prove
every level, which is why a stale link narrows rather than leaks. `src/app/context-url.test.ts` proves the
parsing round-trips idempotently, which is what makes the correction terminate.

### 13.3 Tenant cache and the generation counter

`src/state/tenant-cache.ts` prevents the failure that would otherwise look like a stale UI bug: a cache keyed
only by entity type handing Organization A's rows to Organization B after a switch. Two independent guards:

1. Every entry remembers the scope it was fetched under (`scope = org|prop|out`, trailing empty levels
   dropped so a shallower scope is a literal prefix of every deeper one inside it). `read()` serves a value
   **only for the currently active scope**; any other scope is a hard miss.
2. `activateScope()` bumps a **generation** on every switch. A fetch stamps the generation it began under
   (`beginFetch`) and `commitFetch` refuses to write if the generation has since moved — so a slow response
   from the previous tenant can never land after the switch.

It is an in-memory `Map`, bounded at `TENANT_CACHE_MAX_ENTRIES = 512` with deterministic FIFO eviction, no
timers and no TTLs. `invalidateScope(prefix)` physically reclaims a tenant subtree when the operator leaves
it. The context store owns this lifecycle: it activates the new scope first (bumping the generation to gate
in-flight reads), then invalidates the old scope only when the new one does not sit inside the same tenant —
drilling deeper into one tenant keeps that tenant's rows warm, since they cannot cross the boundary. **This
is proven in `src/state/tenant-cache.test.ts`, in TypeScript, not in the SQL verifier** — see the closing
list. All UI state is in memory: there is no `persist` middleware and no localStorage writer, because a
multi-tenant cache living in a browser is a leak waiting to happen.

### 13.4 Frontend layout (built) and module layout (target)

```text
src/
  app/            Shell.tsx (chrome + sidebar nav) · navigation.ts (the destination registry, honest
                  `available`/disabled rows) · routes.ts (the ROUTES table `App` maps into `<Routes>`; a
                  catch-all `*` route answers "not implemented" for any unregistered path) ·
                  context-url.ts (§30 address-bar ↔ store context sync) · ContextSwitcher.tsx (header
                  trigger, three-level picker with org-wide/property-wide sentinels, ContextNotices strip)
  config/         brand.ts and env.ts — the only places product identity and the data plane are named
  components/ui/  shared primitives: Button, Card, Field, Dialog, DataTable, Badge, StatusPill,
                  EmptyState, Spinner, TextInput/Textarea/SelectInput/Checkbox/Switch,
                  ArchiveDialog, AccessDenied (see the honesty paragraph below)
  db/             client, rpc, case, doors, door-errors — the ONLY network surface
  domain/         pure types + scoped services, no React:
                    identity/ (types.ts = the schema mirror, + taxonomy.test.ts)
                    hierarchy/ (organization|property|outlet|department-service.ts)
                    access/   (session|people|role-service.ts)
                    audit/    (audit-service.ts)   money/ (money.ts)
  pages/          one screen per live route — FoundationStatusPage (counts the registry), the organization/
                  property/outlet/department hierarchy screens, team (people) + roles (access) + audit, and
                  the onboarding wizard; each gates on a `domain.verb` token and renders AccessDenied or
                  CapabilityNote when the session is short of it
  state/          context-store.ts (incl. notices + dismissNotice), tenant-cache.ts (both in-memory, no
                  persistence)
  lib/            errors.ts, audit.ts   test-helpers/ (SQL parser + Node stub transport)   types/
```

Feature modules (`modules/{restaurant,hotel,inventory,finance,…}`) are the target from Prompt #04 onward; they
do not exist yet because no operational module has been built (Prompt #03 hardened the security substrate, not
the modules). The frontend keeps `domain/` pure and
network-free so business rules unit-test in Node without rendering (a lesson from the donor's test attempts,
which it never had).

**Denial is honest about its cause (§51).** `src/components/ui/AccessDenied.tsx` no longer always claims
"denied by your role." `can()` answers yes or no, and *no* has five distinct causes: `accessReasonFor(status,
permissionsLoaded)` and the `useAccessReason()` hook resolve `role` (a loaded grant set actually refused the
verb), `no-organization` (signed in with no tenant selected, so no grant set was ever loaded), `no-session`
(not signed in), `no-data-plane` (this build has no Supabase project to ask) and `resolving` (the session is
still loading). Only the `role` wording names a permission token or tells the person to ask an administrator;
the other four say nothing was denied, because asserting a role refusal on a backend-less build — or before
sign-in — invents a server decision that never happened, which is exactly what §51 exists to prevent.
`OnboardingWizard`'s `CapabilityNote` (now exported and reason-aware) reuses the same model per wizard step.
These rely on a zustand quirk worth recording: under a static/server render (`react-dom/server`, and this
Node suite) the store hook returns the **initial** snapshot, not the live one, so a component that must show
current session state subscribes with the hook (to re-render on change) but reads the value through
`useContextStore.getState()` — see the comments in `src/pages/team/TeamPage.tsx` and `AccessDenied.tsx`.

### 13.5 The drift-killing tests

`src/test-helpers/migrations.ts` parses `db/supabase/*.sql` at test time — no generated types, no hand-copied
list — and three suites diff the client against that live SQL **in both directions**:

- `doors.test.ts` — the `CLIENT_DOORS` list vs the functions actually defined in `public` (unlisted /
  removed / duplicate), every door parameter on the `p_*` convention, and the boot-critical signatures
  (`resolve_active_context` takes no arg, `my_permissions` takes `p_organization/p_property/p_outlet`).
- `door-errors.test.ts` — the `DOOR_ERRORS` map covers every `NIVAAS_*` token the SQL raises (and holds no
  copy for a token that no longer exists), uses only declared codes, and never leaks a token into user copy.
- `taxonomy.test.ts` — every client status/taxonomy array vs the CHECK constraint it mirrors, **and the
  permission vocabulary the UI gates on**. `clientPermissionTokens()` (in `src/test-helpers/migrations.ts`)
  scrapes every `domain.verb` string literal out of `src/` — skipping test files, the test helpers, the
  `nav.` i18n label keys and comments — and diffs them against the permissions `006_seed_rbac.sql` actually
  seeds. `Permission` is typed `${string}.${string}`, so a token the database never created compiles, ships,
  and gates a control no grant can ever satisfy; the diff turns that silently-disabled-forever button into a
  red test. (This build actually grew one such token before the gate caught it.) A companion assertion checks
  the scrape itself is non-empty, so a broken scraper cannot pass vacuously.

The rule they enforce is simple and load-bearing: **a picker can never offer a value the database's CHECK
would refuse**, a client can never call a door the schema does not define, and a control can never gate on a
permission the seed does not grant. That is exactly how the donor project's role matrix drifted and produced a
UI that offered what the DB refused. A separate suite keeps the *menu* honest against the *router*:
`src/app/routes.test.ts` diffs `ROUTES` and the `navigation.ts` registry both directions, so a live nav row
never points at no route and an unroutable screen never ships as dead code in the bundle.

---

## 14. Database principles

**Data plane chosen: Supabase** (managed Postgres + PostgREST + GoTrue + migrations) over a bespoke backend
— see `DECISIONS.md`. **IMPLEMENTED:** `db/supabase/000`–`007`, executed against PostgreSQL 18.3.

- **PostgreSQL** is the platform store. Foreign keys, unique constraints, CHECK constraints and indexes are
  part of the design, not optimizations to add later. Money/quantity columns will be `numeric`; floats appear
  nowhere.
- **Two schemas** (`app` guards, `public` doors) as in §13.1 — the split *is* the privilege model.
- **Doors over direct DML.** Writes are `SECURITY DEFINER` functions with `set search_path = ''` that
  re-prove scope, use optimistic locking (`version integer`, refused on a stale `p_expected_version` with
  `NIVAAS_VERSION_CONFLICT`), audit through `app.audit()`, and return the written row.
- **Archive, never hard-delete.** `status` (+ `archived_at` on organization/property/outlet; departments carry
  `status` alone) with a mandatory reason via the `set_*_status` doors; no delete path exists anywhere in the
  surface.
- **Denormalized ancestors + chain triggers.** Every tenant row carries the ids of ALL its ancestors so a
  query filters on `organization_id` alone and cannot leak even if a deeper predicate is forgotten; a chain
  trigger refuses a write whose ancestors disagree, raising `NIVAAS_SCOPE_MISMATCH`.
- Migrations are numbered, idempotent, forward-only, and recorded in `app.schema_migrations` so a re-run
  skips what landed instead of half-applying twice; the schema is never hand-edited in production.
- **The taxonomy is the CHECK, and the CHECK is tested against the client** (§13.5) rather than codegen'd
  from live `information_schema` into casts — this stage validates the enum value lists directly.
- **No giant JSON documents.** `business_hours`, audit `before`/`after` and `metadata` are the only JSON
  columns and they hold genuinely flexible shape; amounts, quantities and state machines stay in typed
  columns. That will matter most when money lands (it does not exist yet).
- Constraints that encode business invariants (a bill cannot be negative; a folio balance must reconcile)
  belong in the database — deferred to the modules that have such invariants.

---

## 15. Testing foundation

**IMPLEMENTED:** two proof layers, plus a green typecheck and production build — as of Prompt #02, extended by
Prompt #03's security substrate.

- **Client suite** — `npx vitest run`, run in Node (no jsdom; the render tests use `react-dom/server`'s
  `renderToStaticMarkup`, so effects never fire). It covers money exactness, error sanitisation, the
  identity/permission type contract, the context store and tenant-cache
  isolation, the §30 address-bar context sync, the route↔navigation registry, the access-denied reason model,
  every scoped service and the built hierarchy/people/roles/audit/onboarding screens, the shared UI primitives,
  and the drift tests of §13.5 — including the client permission-token scrape that fails the suite on a
  capability the seed never granted. Prompt #03 added the pure client access mirror `authorize.test.ts`, the
  email-link-only `auth-service.test.ts` (asserts the wire never carries `signInWithPassword`) and extended
  `permissions.test.ts`, `door-errors.test.ts` and `doors.test.ts` to the new keys, tokens and doors. The stub
  transport (`src/test-helpers/transport.ts`) replaces the client
  under the RPC funnel and asserts what reached the wire, and `doorParametersMatchTheSchema` checks those
  parameters against the migration signatures — so "the test passes" also means "PostgREST would accept the
  call". The measured total after Prompt #03 and `014` is **51 test files / 721 tests, all passing** (the Prompt
  #02 snapshot was 41 files / 566 tests).
- **SQL verifier** — `db/verify/tenant_isolation.sql` (tenant isolation + Prompt #03 hardening + the #04
  permission ladder and menu domain): **15 scenarios / 195 `PASS` assertions, 0 failures on a cold rebuild**.
  Scenarios 1–9 are the Prompt #02 isolation bar; 10–14 are the Prompt #03 proofs (10 = the account gate `008`,
  11 = privilege escalation `009`, 12 = outcomes in the trail `010`, 13 = a custom tenant role `011`,
  14 = the invitation lifecycle `012`); 15 is Prompt #04's — the restaurant permission ladder, the cross-tenant
  menu door refusal and the exact-decimal money constraints on `menu_item_prices`. It exercises the isolation
  bar under the `authenticated` role only (writes are seeded as superuser because migration-time seeds have no
  session), and asserts both directions: the valid case is accepted *and* the invalid case is refused with a
  specific `NIVAAS_*` token.
- **Typecheck + production build** — `npx tsc --noEmit --incremental false` is clean and `npm run build`
  succeeds, emitting one JS chunk of **756.42 kB** and **27.44 kB** of CSS. Vite's chunk-size warning fires on
  that single bundle; route-level lazy code-splitting was **deliberately not done in this stage** — one honest
  number is easier to revisit when the operational modules land than a premature split.

A green typecheck is not a gate on financial correctness. Future layers (integration beyond the door, API
contract, E2E for money- and stock-critical workflows) arrive with those modules.

**Not yet exercised (no proof behind these yet, do not read as done):**
- **`db/verify` has never run against the hosted project.** The hosted apply *has* happened — `000`–`014` on the
  AMRUT NIVAAS Supabase project, then re-read as 20/20 RLS tables, 50 doors and zero unprotected tables, with an
  anonymous read of `menus` refused (401) and an anonymous `create_menu` refused by the door itself
  (`NIVAAS_NO_SESSION`). What is NOT done is the 195-assertion scenario file against it: the harness deliberately
  refuses to run `db/verify` hosted, so the hosted posture is verified structurally, not behaviourally.
- **End-to-end browser data flow** — PostgREST is not installed in the local harness, and the hosted project has
  not been driven from a browser in this session (**NOT_TESTED**). Without project keys the app boots into its
  honest `unconfigured` state — the shell header reads "No data plane" (`ContextSwitcher.triggerLabel`), and any
  gated screen falls back to the `no-data-plane` AccessDenied wording rather than inventing a denial.
- **A real emailed sign-in link and delivered invitation** — the auth *code* exists: `src/db/client.ts:56`
  runs `persistSession/autoRefreshToken/detectSessionInUrl: true`, `auth-service.ts` signs in with
  `signInWithOtp` (email link only, D-32), `010` records `sign_in`/`sign_out` and stamps `last_login_at`, and the
  session-sync/`bootstrap` path is unit-tested. The remaining blocker is configuration, not code: the hosted
  project has **no SMTP transport** (`smtp_host` null) and `site_url` still defaults to `http://localhost:3000`,
  so a magic link could neither be sent nor land on the app. Invitation *accept* door logic is proven in the
  verifier (scenarios 8 and 14); the delivery hop is the unproven link. The acting user in the local harness
  remains the seeded dev user from `007`.
- **§57–§59 cache/state isolation is TypeScript-only** — proven in `src/state/tenant-cache.test.ts`, asserted
  as NOT covered by the SQL verifier.

---

## 16. Design system and surfaces

**IMPLEMENTED:** Tailwind v4 `@theme` tokens, brand config, the shared UI primitives (`Button`, `Card`,
`Field`, `Dialog`, `DataTable`, `Badge`, `StatusPill`, `EmptyState`, `Spinner`,
`TextInput`/`Textarea`/`SelectInput`/`Checkbox`/`Switch`, `ArchiveDialog`, `AccessDenied`), a responsive
`Shell` with sidebar + mobile drawer, and the header `ContextSwitcher` (§13.4).

Calm, premium, operational: Inter, Lucide icons, 8px spacing rhythm, moderate radii, hairline borders,
two soft shadow levels, subtle motion only. Deliberately distinct from the donor app's forest-green/gold
identity. Explicitly avoided: gradients everywhere, glassmorphism, giant rounded cards, decorative
animation, dashboard clutter, tiny controls, rainbow-ERP styling.

Surfaces that must be designed as first-class, not shrunk desktop: desktop/laptop, tablet, phone,
**counter POS** (large touch targets, gloves-and-crums reality, no scrolling to pay a bill) and
**kitchen display** (full-screen, high-contrast, glanceable at distance, fire-order latency visible,
silent-audible alarms for overdue tickets). A kitchen display is not a dashboard.

---

## 17. Internationalization

Architecture is India-first, never India-locked. Languages targeted eventually: English, Hindi, Kannada,
Telugu, Tamil, Malayalam, Marathi, Bengali. **Never hardcode UI strings** — every user-visible string goes
through the i18n layer from the first screen, because retrofitting 5,000 keys later is the donor app's
most expensive lesson (6 dictionaries × ~5,774 keys ≈ 37,600 lines of generated text).
Locale, currency, timezone, tax and number formatting are property-level configuration. Start with
English + one Indic locale and grow, keeping the compile-checked dictionary contract.

---

## 18. Scalability posture

- Tenancy is horizontal: new organizations add rows, not code paths.
- Read models/derived views absorb reporting load before caching does.
- Nightly hotel processes (room charges, night audit, reservation no-shows) are idempotent, per-property,
  re-runnable jobs — the operational risk that actually distinguishes hospitality platforms.
- Add a cache or a queue when a measured problem demands it, and keep the outbox as the seam that lets a
  real bus arrive later without a rewrite.
- Platform control plane (subscriptions, organization lifecycle) is planned as separable from tenant data
  so a future compliance or residency requirement does not force a migration under load.

---

## 19. Non-goals for the foundation

No microservices. No Kubernetes. No Kafka. No message broker. No fake AI, accounting or inventory. No
placeholder pages behind disabled navigation. No second implementation of an existing donor pattern where
the pattern itself can be adopted. No poultry vocabulary anywhere in this codebase.
