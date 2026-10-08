# AMRUT NIVAAS — Prompt #02 acceptance checklist and stage report

**Date:** 2026-10-07 · **Stage:** multi-tenant organization, property and outlet foundation · **Brand:** AMRUT NIVAAS

This is §97 (the checklist) and §98 (the report) in one file. Every row names the artefact that
proves it and how to re-run that artefact. A row is marked `PASS` only when it was actually
exercised in this session; `PARTIAL`, `NOT_TESTED`, `BLOCKED` and `DEFERRED` are stated as such —
Prompt #02's whole point is that the tenant architecture is honest about what it does not yet do.

Reproduce the two proof layers with:

```
npx tsc --noEmit --incremental false     # clean
npm run build                            # 721.15 kB JS + 27.05 kB CSS
./db/harness/local-pg.sh rebuild         # 9 scenarios / 78 `PASS` as measured on the day — now twenty / 742
```

> **The third proof layer this stage ran no longer exists.** It also ran `npx vitest run` — **41 files / 566
> tests**, all green. Every `src/**/*.test.ts(x)` was deleted on 2026-10-07 by owner instruction ("no test cases,
> ever again"), together with `src/test-helpers/` and the `test` script in `package.json`; `vitest` survives only
> as an unused `devDependencies` entry. See `docs/ARCHITECTURE.md` §13.5. The SQL verifier is now the only proof
> layer with assertions behind it, and that file has grown since this stage: **twenty scenarios / 742 `PASS`
> assertions, 0 failures**, last recorded cold on PostgreSQL 18.3 on 2026-10-08.

> **Frozen stage report.** These are the Prompt #02 numbers, kept as measured on the day. The tree has moved on:
> `docs/ACCEPTANCE-03.md` recorded the bar at the #03 close (51 files / 721 tests — that suite is now deleted —
> and 15 scenarios / 195 assertions, since grown to twenty / 742), `000`–`014` applied both locally and on the
> hosted AMRUT NIVAAS project, and it closes §2's first three rows —
> the hosted project now exists, real sign-in code has landed, and only SMTP delivery remains blocked on the
> owner.

---

## 1. §97 — acceptance checklist

| Requirement | Proven by | Status |
| --- | --- | --- |
| `Organization → Property → Outlet → Department` hierarchy, organization is the tenant boundary | `db/verify/tenant_isolation.sql` scenarios 1, 3, 9; `src/domain/hierarchy/*-service.test.ts` (59 tests across the four levels) **deleted 2026-10-07** — the SQL scenarios are what remain | PASS |
| `User → Membership → Organization → Property access → Outlet access → Role` chain | scenarios 6, 9f, 9g, 9g2 (the `role-service.test.ts` / `people-service.test.ts` half is **deleted 2026-10-07**) | PASS |
| All authorization is server-side; a client has SELECT only and every write enters a `SECURITY DEFINER` door | scenario 2 (direct write refused by grant alone) + each migration's self-check block (`NIVAAS_MIGRATION_GAP`); `src/db/doors.test.ts`, `src/db/rpc.test.ts` **deleted 2026-10-07**, so the client door list is no longer diffed against `public` | PASS |
| Cross-tenant reads and cross-tenant foreign ids are refused, by RLS and again at the door | scenarios 1, 3 (guessed foreign uuids), and the `NIVAAS_SCOPE_MISMATCH` assertions | PASS |
| Invitations: create, accept, revoke; exactly one owner per organization | scenario 8 (accept round trip with a seeded identity), `memberships_one_owner_idx` assertion, and scenario 14 for the `012` lifecycle; `people-service.test.ts` **deleted 2026-10-07** | PASS — the **email itself** is DEFERRED → Prompt #03 |
| Context switching, server-persisted active context, re-proving every level on each load (§29) | scenario 5 (a saved context cannot outlive the access that justified it) proves the server half; `session-service.test.ts` (13) and `context-store.test.ts` (11) are **deleted 2026-10-07**, so the client re-proving path is code reading only | PASS server-side; client half code reading only — NOT_TESTED |
| Context in the URL, including a hostile or malformed param (§30) | `src/app/context-url.test.ts` (13) — non-uuid is ignored rather than clearing a tenant, unrelated params survive, the `askedFor` guard breaks the switch↔URL loop — **was the only evidence; deleted 2026-10-07**. The server half (`set_active_context` re-proving every level) is scenario 5; the URL parsing itself is now assured only by reading `context-url.ts` | NOT_TESTED (code reading only) |
| The switcher UI shows only what the session can reach, and deeper pickers disable with the shallower one | `src/app/ContextSwitcher.test.tsx` (14) — **deleted 2026-10-07**, and it is the only artefact behind this row | NOT_TESTED — the shell-only browser pass at `:4188` (no data plane) does not exercise it; with a real session it stays BLOCKED (see §2) |
| Onboarding wizard, both honest paths, with **no fabricated capability gate** | `Onboarding.test.tsx` (28) — `stepPermissionFor("organization")` is null because `create_organization` needs only a session — **deleted 2026-10-07**. `006_seed_rbac.sql` self-checks its own 25 grants, but no artefact now asserts the wizard's step→token mapping | NOT_TESTED (code reading only) |
| Admin CRUD with archive as the lifecycle; nothing hard-deletes | scenario 9c (archiving keeps the row and records why), 9e; `ArchiveDialog.test.tsx` and every service suite's archive cases are **deleted 2026-10-07** — the server lifecycle is still scenario-proven, the dialog is code reading only | PASS server-side; the UI half is code reading only — NOT_TESTED |
| Optimistic `version` and a mandatory `p_reason` on every state change | the verifier's `NIVAAS_VERSION_CONFLICT` and `NIVAAS_REASON_REQUIRED` refusals (8 and 11 assertions) against the real doors. `doors.test.ts`'s parameter checks against the migration signatures are **deleted 2026-10-07**, so a client door drifting from its SQL signature is no longer caught | PASS |
| `DEPARTMENT`-scoped grants are refused outright, not half-wired | scenario 9f2 — `assign_role` refused with `NIVAAS_DEPARTMENT_GRANTS_UNSUPPORTED` | PASS |
| Audit trail: append-only, read-only, records the writes (§47/§48) | scenario 9e + the `NIVAAS_AUDIT_IMMUTABLE` delete assertion; `audit-service.test.ts` (9) is **deleted 2026-10-07**; `AuditPage` having no edit or clear control is code reading only | PASS |
| Tenant, cache and state isolation across a switch (§57–§59) | `tenant-cache.test.ts` (9) and `context-store.test.ts` — scope keying, generation bump, an in-flight fetch from a discarded switch cannot commit — **were the only evidence and are deleted 2026-10-07**; this was always a TypeScript concern and has never been covered by the SQL verifier | NOT_TESTED (code reading only) |
| Access denied is honest about its cause (§51) | `AccessDenied.test.tsx` (12) + `accessReasonFor` — five causes; only a loaded role set may say "denied by your role", `hint` and the admin suggestion are withheld otherwise. Same model in `CapabilityNote`. **The test is deleted 2026-10-07**; the cause wording lives or dies on `src/config/security.ts` reading | NOT_TESTED (code reading only) |
| A permission token the seed never granted fails the suite | `clientPermissionTokens()` in `src/test-helpers/migrations.ts` diffed against `006_seed_rbac.sql` in `taxonomy.test.ts`; proven to reject by injecting a bogus token and watching the test name it. **`taxonomy.test.ts` and `src/test-helpers/` are deleted (2026-10-07), so nothing fails any more** — `006`/`013` self-check their own seeded counts, but a client token with no seed behind it now compiles, ships and gates a control no grant can satisfy (`docs/ARCHITECTURE.md` §13.5) | NOT_TESTED — **live risk, unenforced** |
| Route table and navigation registry agree; no nav row points at nothing | `routes.test.ts` (5) — **deleted 2026-10-07**, and it is the only artefact that compared `ROUTES` with the `navigation.ts` registry in both directions | NOT_TESTED (code reading only) |
| Typecheck + production build | commands above | PASS |
| Console-clean app shell in a real browser | `vite preview` at `:4188` — `/`, `/properties`, `/audit`, `/onboarding`, `/banquets`, plus a malformed `?organization=not-a-uuid&tab=x`: zero console messages | PASS (on the no-data-plane build) |

## 2. Not covered — and why

| Item | Status | What it needs |
| --- | --- | --- |
| Applying the migrations to a hosted AMRUT NIVAAS Supabase project | **BLOCKED** | The owner must create a **new** AMRUT NIVAAS project. NIVAAS must never be pointed at the poultry project. |
| End-to-end data flow in a browser (create a property, switch tenants, read a trail) | **NOT_TESTED** | Project keys in the gitignored `amrut-nivas/.env` **and** a reachable PostgREST. The local harness has no PostgREST, so the wire contract is proven at the door-funnel and SQL level only. |
| Real sign-in, token verification, session refresh | **DEFERRED → Prompt #03** | GoTrue. Today the acting identity is a seeded dev user; `persistSession: false`, `detectSessionInUrl: false`. |
| Invitation delivery | **DEFERRED → Prompt #03** | Email transport + a claim route. The accept door itself is proven (scenario 8). |
| Mobile-width pass over the new header, switcher and admin screens | **OPEN** | Viewport sweep at 360/390/430 once a session exists to populate them. |
| Route-level code-splitting (single 721 kB chunk) | **DEFERRED deliberately** | One honest number to revisit when the operational modules land; splitting now would be premature. |

## 3. §98 — stage report

**What Prompt #02 delivered.** A tenant architecture that is enforced where enforcement is real — in
PostgreSQL — and mirrored honestly in TypeScript. Twenty-five client-facing doors in `public`,
thirty-three helpers in `app` (eleven of them `require_*`/`blankable` guards), RLS as the tenant
boundary with `authenticated` holding SELECT only, `set search_path = ''` on every definer,
single-token `NIVAAS_*` refusals, mandatory reasons, optimistic versions, archive as the only
retirement path, and an append-only trail every write door enters. Above it: the identity taxonomy,
scoped services, the context store with server-side persistence and re-proving, the URL as a
context carrier, the switcher and notices, nine routed screens including the onboarding wizard and
the admin CRUD set — and a route/nav registry that, at this stage, a deleted `routes.test.ts` kept from
advertising a screen that does not exist; nothing holds that guarantee today (§13.5).

**Three defects this stage found and fixed at their root, not per screen.**
1. A gate on `organization.create` — a token the seed never grants — would have disabled the
   wizard's first step forever for every person on the system. The gate now names each step's own
   door, and at this stage a scraped-and-diffed drift test meant the *class* of bug (a client token
   with no seed behind it) failed CI instead of shipping. **That drift test (`taxonomy.test.ts`) was
   deleted on 2026-10-07**, so the class of bug is catchable again only by hand — see
   `docs/ARCHITECTURE.md` §13.5 and the §97 row above.
2. `AccessDenied` asserted "denied by your role (`audit.view`)" on a build that has no backend, no
   session, or no tenant selected — a server decision that never happened. It now reads the session
   and picks among five causes; only a loaded role set earns the role wording.
3. The switcher's trigger said "No session" when the truth is "no data plane connected".

**What is not yet true.** No hosted project exists, so nothing has run against the real Supabase;
no PostgREST locally, so no click-through with real rows; no GoTrue, so the acting user is seeded.
None of that is a tenant-architecture question, which is the point of §99: a beautiful POS built on
a broken tenant architecture is worthless, and the reverse is not true — the architecture is worth
exactly what it takes to keep the modules honest.

**Recommended next step: Prompt #03 — Auth + RBAC + Permission + Audit hardening.** Specifically:
a new AMRUT NIVAAS Supabase project and the hosted apply; GoTrue sign-in with session persistence
and refresh replacing the seeded dev user; invitation email delivery wired to the proven accept
door; the permission catalogue and scope resolution hardened against the failures this stage's
scenarios expose; and the first real end-to-end pass over these nine screens with live rows —
which is also when the mobile sweep and the code-split decision should be taken.

**Explicitly not recommended next: the Restaurant POS.** It is the most visually tempting module
and the worst possible first consumer of an unauthenticated, un-hosted foundation. It belongs after
Prompt #03 proves the tenancy under a real session.

**Waiting on the owner.** D-07 (tax computation on a document in Phase 1, accounting engine in
Phase 4) is still PROPOSED and needs sign-off, along with O-1 thermal printing, O-3 environment
plan, O-4 repository spelling (`amrut-nivas` vs `amrut-nivaas`), O-5 the design property, and O-6
when i18n starts.
