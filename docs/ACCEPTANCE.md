# AMRUT NIVAAS — Prompt #02 acceptance checklist and stage report

**Date:** 2026-10-07 · **Stage:** multi-tenant organization, property and outlet foundation · **Brand:** AMRUT NIVAAS

This is §97 (the checklist) and §98 (the report) in one file. Every row names the artefact that
proves it and how to re-run that artefact. A row is marked `PASS` only when it was actually
exercised in this session; `PARTIAL`, `NOT_TESTED`, `BLOCKED` and `DEFERRED` are stated as such —
Prompt #02's whole point is that the tenant architecture is honest about what it does not yet do.

Reproduce the two proof layers with:

```
npx tsc --noEmit --incremental false     # clean
npx vitest run                           # 41 files / 566 tests
npm run build                            # 721.15 kB JS + 27.05 kB CSS
./db/harness/local-pg.sh rebuild         # 9 scenarios / 78 PASS assertions, 0 failures (PG 18.3)
```

---

## 1. §97 — acceptance checklist

| Requirement | Proven by | Status |
| --- | --- | --- |
| `Organization → Property → Outlet → Department` hierarchy, organization is the tenant boundary | `db/verify/tenant_isolation.sql` scenarios 1, 3, 9; `src/domain/hierarchy/*-service.test.ts` (59 tests across the four levels) | PASS |
| `User → Membership → Organization → Property access → Outlet access → Role` chain | scenarios 6, 9f, 9g, 9g2; `src/domain/access/role-service.test.ts`, `people-service.test.ts` | PASS |
| All authorization is server-side; a client has SELECT only and every write enters a `SECURITY DEFINER` door | scenario 2 (direct write refused by grant alone); `src/db/doors.test.ts`, `src/db/rpc.test.ts` | PASS |
| Cross-tenant reads and cross-tenant foreign ids are refused, by RLS and again at the door | scenarios 1, 3 (guessed foreign uuids), and the `NIVAAS_SCOPE_MISMATCH` assertions | PASS |
| Invitations: create, accept, revoke; exactly one owner per organization | scenario 8 (accept round trip with a seeded identity), `memberships_one_owner_idx` assertion; `people-service.test.ts` | PASS — the **email itself** is DEFERRED → Prompt #03 |
| Context switching, server-persisted active context, re-proving every level on each load (§29) | `session-service.test.ts` (13), `context-store.test.ts` (11), scenario 5 (a saved context cannot outlive the access that justified it) | PASS |
| Context in the URL, including a hostile or malformed param (§30) | `src/app/context-url.test.ts` (13) — non-uuid is ignored rather than clearing a tenant, unrelated params survive, the `askedFor` guard breaks the switch↔URL loop | PASS |
| The switcher UI shows only what the session can reach, and deeper pickers disable with the shallower one | `src/app/ContextSwitcher.test.tsx` (14) | PASS at 4188 in a browser on the no-data-plane build; with a real session it is BLOCKED (see §2) |
| Onboarding wizard, both honest paths, with **no fabricated capability gate** | `Onboarding.test.tsx` (28) — `stepPermissionFor("organization")` is null because `create_organization` needs only a session | PASS |
| Admin CRUD with archive as the lifecycle; nothing hard-deletes | scenario 9c (archiving keeps the row and records why), 9e; `ArchiveDialog.test.tsx`; every service suite's archive cases | PASS |
| Optimistic `version` and a mandatory `p_reason` on every state change | `doors.test.ts` parameter checks against the migration signatures; door refusals asserted with a single `NIVAAS_*` token | PASS |
| `DEPARTMENT`-scoped grants are refused outright, not half-wired | scenario 9f2 — `assign_role` refused with `NIVAAS_DEPARTMENT_GRANTS_UNSUPPORTED` | PASS |
| Audit trail: append-only, read-only, records the writes (§47/§48) | scenario 9e + the `NIVAAS_AUDIT_IMMUTABLE` delete assertion; `audit-service.test.ts` (9); `AuditPage` has no edit or clear control | PASS |
| Tenant, cache and state isolation across a switch (§57–§59) | `tenant-cache.test.ts` (9), `context-store.test.ts` — scope keying, generation bump, an in-flight fetch from a discarded switch cannot commit | PASS |
| Access denied is honest about its cause (§51) | `AccessDenied.test.tsx` (12) + `accessReasonFor` — five causes; only a loaded role set may say "denied by your role", `hint` and the admin suggestion are withheld otherwise. Same model in `CapabilityNote` | PASS |
| A permission token the seed never granted fails the suite | `clientPermissionTokens()` in `src/test-helpers/migrations.ts` diffed against `006_seed_rbac.sql` in `taxonomy.test.ts`; proven to reject by injecting a bogus token and watching the test name it | PASS |
| Route table and navigation registry agree; no nav row points at nothing | `routes.test.ts` (5) | PASS |
| Typecheck, suite, production build | commands above | PASS |
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
the admin CRUD set — and a route/nav registry that cannot advertise a screen that does not exist.

**Three defects this stage found and fixed at their root, not per screen.**
1. A gate on `organization.create` — a token the seed never grants — would have disabled the
   wizard's first step forever for every person on the system. The gate now names each step's own
   door, and a scraped-and-diffed drift test means the *class* of bug (a client token with no seed
   behind it) now fails CI instead of shipping.
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
