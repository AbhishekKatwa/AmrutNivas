# AMRUT NIVAAS — Prompt #03 acceptance checklist and stage report

**Date:** 2026-10-07 · **Stage:** authentication + RBAC + permission + audit hardening · **Brand:** AMRUT NIVAAS

This is §78 (the acceptance criteria) and §81 (the final report) in one file, the way Prompt #02's §97/§98 are
`docs/ACCEPTANCE.md`. Every row names the artefact that proves it and the command that re-runs it. A row is
`PASS` only when it was actually exercised in this session; `PARTIAL`, `NOT_TESTED`, `BLOCKED` and `DEFERRED`
are written as themselves, because a security foundation that overstates its own coverage is the failure mode
this prompt exists to prevent.

Reproduce every gate with:

```
npx tsc --noEmit --incremental false      # clean
npx vitest run                            # NOT_RUN — DELETED. This gate ran 51 files / 721 tests at acceptance;
                                          # the owner then ordered every test file deleted (2026-10-07,
                                          # "no test cases, ever again"). The deletion is executed: zero
                                          # *.test.ts / *.test.tsx remain under src/, src/test-helpers/ is gone,
                                          # package.json no longer carries a test script, and vitest survives
                                          # only as an unused devDependencies entry.
npm run build                             # 756.42 kB JS + 27.44 kB CSS
./db/harness/local-pg.sh rebuild          # live: twenty scenarios against a real PostgreSQL 18.3 cluster
                                          # (15 scenarios / 195 PASS assertions at acceptance)
node db/harness/remote-apply.mjs check    # hosted posture: 20/20 RLS tables, 50 doors, 0 unprotected
```

Every `*.test.ts` / `*.test.tsx` citation below is a historical record of what was exercised at the time of
writing, not live evidence. Rows whose proof was only a deleted TypeScript test are restated as `NOT_TESTED`
or re-based on the SQL verifier (`db/verify/tenant_isolation.sql`), the migration self-checks, source
references, and the compiler.

---

## 1. §78 — security acceptance criteria

### Authentication

| Criterion | Proven by | Status |
| --- | --- | --- |
| Existing authentication understood and hardened | §1 read-first pass recorded in `docs/SECURITY.md` §2; `008_identity_hardening.sql` re-cuts `profiles.status` to the vocabulary the doors actually check, backfills a profile for every identity, and makes a missing profile refuse closed (`NIVAAS_PROFILE_MISSING`). Verifier scenario 10 | PASS |
| Sessions handled safely | `src/db/client.ts:56` — `persistSession/autoRefreshToken/detectSessionInUrl: true` (D-31 supersedes #02's `false` flags); `src/domain/auth/session-config.ts` + `auth-service.ts:79` sign in with `signInWithOtp` only; the actor is resolved server-side from `auth.uid()` in every door, never from an argument. `auth-service.test.ts` asserted the wire never carries `signInWithPassword`; that suite is deleted — the claim is code reading only, NOT_TESTED. Against a live GoTrue: **NOT_TESTED** — see §3 | PASS in code (wire assertion NOT_TESTED), NOT_TESTED over HTTP |
| Logout works correctly | `auth-service.ts:118` calls `signOut` and `010`'s `record_auth_event` exists in the applied SQL; the cache-clear and `sign_out` event recording were asserted in the deleted `auth-service.test.ts` and `src/state/tenant-cache.test.ts` — service level now code reading only, **NOT_TESTED** | NOT_TESTED (no SQL or browser evidence; source only) |
| Suspended users rejected | Scenario 6 + scenario 10 in `db/verify/tenant_isolation.sql` (live); the ladder emits `ACCOUNT_SUSPENDED`. The client mirror `shouldRejectSuspendedMembership()` lived in the deleted `security-matrix.test.ts` — client half NOT_TESTED | PASS (server side, SQL verifier) |
| Removed users rejected | Scenario 6 (grants revoked while the login survives) in the live verifier; `NO_ACTIVE_MEMBERSHIP` in the applied SQL; `shouldRejectRemovedMembership()` and `people-service.test.ts` are deleted — client half NOT_TESTED | PASS (server side, SQL verifier) |

### Multi-tenancy

| Criterion | Proven by | Status |
| --- | --- | --- |
| User can belong to multiple organizations | `organization_memberships` unique on `(user_id, organization_id)` (`002`); `resolve_active_context` returns the reachable set. The two-tenant person case was covered by the deleted `session-service.test.ts` — that client coverage is gone; the schema and the SQL function remain | PASS (schema + SQL) |
| Membership is organization-specific | Scenario 9's per-tenant assertions; `app.member_of` counts exactly one `ACTIVE` row for one organization | PASS |
| Tenant context is validated | Scenario 5 (a saved context cannot outlive the access that justified it); `set_active_context` re-proves every level and returns `cleared: true` rather than silently narrowing | PASS |
| Cross-tenant access impossible through normal APIs | Scenarios 1, 3 (guessed foreign uuids refused `NIVAAS_SCOPE_MISMATCH`), 2; hosted: anonymous table read 401, anonymous door call refused `NIVAAS_NO_SESSION` | PASS |
| Cache/state is tenant-aware | `src/state/tenant-cache.ts` and `src/state/context-store.ts` implement scope keying plus a generation bump that makes an in-flight fetch from a discarded switch unable to commit. The proof was `tenant-cache.test.ts` (9) and `context-store.test.ts` (18); both suites are deleted and this layer was never covered by the SQL verifier — code reading only | **NOT_TESTED** |

### RBAC

| Criterion | Proven by | Status |
| --- | --- | --- |
| Roles centralized | `006_seed_rbac.sql` seeds 13 system roles; `roles` is the only authority and `docs/PERMISSIONS.md` documents what each holds | PASS |
| Permissions centralized | 54 `domain.verb` tokens in `src/domain/identity/permissions.ts` (measured: 54 distinct keys in `role_permissions`, 13 system roles). The both-directions diff against `006` + `011` + `013` was `permissions.test.ts` (12), now deleted — the drift check itself is NOT_TESTED; the counts remain re-measurable from the shipped SQL and source | PASS (SQL + source); drift check NOT_TESTED |
| Custom roles architecturally supported | `011_custom_roles.sql` — `create_role`/`update_role`/`set_role_permissions`/`set_role_status`, tenant names scoped per organization (D-40), ceiling and subset guards. Scenario 13 in the live verifier. `custom-role-service.test.ts` (17) is deleted — client half NOT_TESTED | PASS (server side, SQL verifier) |
| Role assignment protected | `009_role_assignment_policy.sql` — no self-grant (`NIVAAS_SELF_ASSIGN_DENIED`), no grant of a permission the grantor lacks, `assign_role`/`revoke_role` require a reason; scenario 11 exercises the ceiling against the live verifier. `role-service.test.ts` (19) is deleted — client half NOT_TESTED | PASS (server side, SQL verifier) |
| Privilege escalation prevented | Scenario 11 in the live verifier; `grantablePermissions()` (`src/domain/access/custom-role-service.ts:206`) mirrors the server ceiling client-side; `013` re-proves the same ladder for the restaurant family (`NIVAAS_PERMISSION_LADDER_BROKEN`) as a migration self-check. `shouldPreventPrivilegeEscalation()` lived in the deleted `security-matrix.test.ts` — client half NOT_TESTED | PASS (server side, SQL verifier + self-check) |

### Scope

| Criterion | Proven by | Status |
| --- | --- | --- |
| Property access enforced | `app.can_access_property` inside every door + `property_access_denied` in `evaluate_access`; scenario 9 in the live verifier. `shouldRejectUnauthorizedPropertyAccess()` lived in the deleted `security-matrix.test.ts` — client half NOT_TESTED | PASS (server side, SQL verifier) |
| Outlet access enforced | Same shape one level down; scenario 4 (outlet narrowing inside one tenant) and 9g2 in the live verifier; `shouldRejectUnauthorizedOutletAccess()` is deleted with `security-matrix.test.ts` — client half NOT_TESTED | PASS (server side, SQL verifier) |
| Future department scope possible | `DEPARTMENT` exists in the scope taxonomy and `role_permissions` can carry it, while `assign_role` refuses it with `NIVAAS_DEPARTMENT_GRANTS_UNSUPPORTED` rather than half-wiring a resolution `my_permissions` cannot do (D-26) — the refusal is asserted in the live verifier. Adding it is one migration, not a rewrite | PASS as a documented, SQL-verified refusal — PARTIAL as a capability |
| Direct API access cannot bypass scope | Scenario 2 (`authenticated` is SELECT-only, DML revoked at grant level in `003`); PostgREST exposes `public` only, so `app.*` guards are unreachable whatever they are granted | PASS |

### Audit

| Criterion | Proven by | Status |
| --- | --- | --- |
| Important mutations audited | Every write door enters `app.audit()` in the same transaction as its write; scenario 9e and "audit trail recorded the scenario writes" | PASS |
| Security failures auditable | `010_audit_outcomes.sql` adds the `result` column (`SUCCESS`/`FAILURE`/`DENIED`) and `evaluate_access` — the one non-raising door — writes an `access_denied` row via `app.audit_access`, because a raising door cannot self-audit (D-30). Scenario 12 in the live verifier. `shouldAuditAccessDenied()` lived in the deleted `security-matrix.test.ts` — client half NOT_TESTED | PASS (server side, SQL verifier) |
| Audit records append-only | `app.forbid_audit_mutation` refuses UPDATE/DELETE for every role including the owner — `NIVAAS_AUDIT_IMMUTABLE`, asserted in the verifier; `AuditPage` has no edit or clear control | PASS |
| Audit data exposes no secrets | §68 is enforced at the write: no password, OTP, access/refresh token, session secret, invitation token or payment credential is ever a column or a metadata key — written against `src/lib/audit.ts` and `docs/SECURITY.md` §8. The enforcing test (`src/lib/audit.test.ts`, 6 cases) is deleted and the SQL verifier does not assert payload contents — code reading only | **NOT_TESTED** |

### Security

| Criterion | Proven by | Status |
| --- | --- | --- |
| No plaintext secrets | `.env` is gitignored (`.gitignore:3`) and holds only `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_URL`, `SUPABASE_ACCESS_TOKEN`; the tracked tree scanned clean for `sbp_`, `sb_secret_`, JWT-shaped and inline service-role literals. The evidence is the `.gitignore` and the tracked-tree scan, not a test: the only `sb_secret_` string ever in the source was the fixture in `src/config/env.test.ts:83` proving the env gate *refuses* it, and that file was deleted with the suite on 2026-10-07, so the tracked tree now contains no such fixture at all | PASS (gitignore + tree scan) |
| No sensitive credentials in source | Same scan; §56's demo credentials were not introduced, and `007` (dev seed) is excluded from every hosted apply by `remote-apply.mjs`. **Caveat, owner-side:** the Personal Access Token used for the applies was pasted into chat and must be revoked — see §5 | PASS for the repository; the token itself is a live risk |
| No frontend-only authorization | `Can`/`useCan` and `RouteGuard` hide and refuse *before* the call for UX; the same check runs again inside the door (`app.require_permission`), and RLS is the backstop. `authorize.ts` is explicitly documented as a mirror, not a decision-maker | PASS |
| No cross-tenant data leakage | Scenarios 1, 3, 5, 9 + the tenant-cache generation guard + hosted anonymous refusals | PASS |
| No unauthorized role escalation | Scenario 11 + `013`'s ladder self-check + `grantablePermissions`; `ORG_OWNER` cannot be demoted or stripped of its last holder (scenario 13, D-39) | PASS |

### Testing

| Criterion | Artefact | Status |
| --- | --- | --- |
| Authentication tests | `src/domain/auth/auth-service.test.ts` (21) — deleted 2026-10-07; the email-link-only wire claim is code reading only | **NOT_TESTED** (server-side account gates remain proven by scenarios 6/10) |
| Membership tests | `people-service.test.ts` (26) — deleted; scenario 6 in the live verifier remains | PASS (server side, SQL verifier) |
| Tenant isolation tests | `taxonomy.test.ts` (17) — deleted; scenarios 1, 2, 3, 5 in the live verifier remain | PASS (SQL verifier) |
| Property isolation tests | `property-service.test.ts` (15) — deleted; scenario 9 in the live verifier remains | PASS (SQL verifier) |
| Outlet isolation tests | `outlet-service.test.ts` (15) — deleted; scenarios 4 and 9g2 in the live verifier remain | PASS (SQL verifier) |
| RBAC tests | `role-service.test.ts` (19), `custom-role-service.test.ts` (17), `permissions.test.ts` (12) — deleted; scenario 13 in the live verifier remains | PASS (server side, SQL verifier) |
| Owner protection tests | `security-matrix.test.ts` `shouldPreventRemovingLastOwner()` — deleted; scenario 13 and `memberships_one_owner_idx` in the applied SQL remain | PASS (SQL verifier) |
| Audit tests | `audit-service.test.ts` (9), `src/lib/audit.test.ts` (6), `Audit.test.tsx` (18) — deleted; scenarios 9e/12 in the live verifier remain | PASS (server side, SQL verifier); client/UI half **NOT_TESTED** |
| Cache isolation tests | `tenant-cache.test.ts` (9), `context-store.test.ts` (18) — deleted; no SQL or browser evidence exists for this layer | **NOT_TESTED** |

The ten cases §49 names were all present in `src/domain/access/security-matrix.test.ts` by the prompt's own
method names; that file was deleted on 2026-10-07 with the rest of the suite. The database-owned decisions
they cited remain exercised by the verifier scenarios (6, 9, 11, 12, 13); the client-side mirrors are now code
reading only — **NOT_TESTED**.

---

## 2. §79 — required verification

| Gate | Command | Result |
| --- | --- | --- |
| Typecheck | `npx tsc --noEmit --incremental false` | **clean** (forced run; the incremental cache is not trusted as a gate) |
| Lint | — | **NOT_AVAILABLE** — `package.json` has no linter; scripts are `dev`, `build`, `preview`, `typecheck` (the `test` script is gone with the deleted suite). Not suppressed, simply absent; adding a linter is a separate decision |
| Unit + contract tests | `npx vitest run` | **NOT_RUN** — the suite (then 51 files / 721 tests, all passing at acceptance; Prompt #02's bar was 41/566) was deleted on 2026-10-07 by owner instruction ("no test cases, ever again"). Zero `*.test.ts` / `*.test.tsx` files remain; `vitest` survives only as an unused `devDependencies` entry |
| Integration tests (SQL) | `./db/harness/local-pg.sh rebuild` | **15 scenarios / 195 `PASS` assertions / 0 failures**, cold rebuild, PostgreSQL 18.3 — "ALL SCENARIOS PASSED". Live: the verifier has since grown to twenty scenarios and remains the primary behavioural evidence |
| Build | `npm run build` | **✓ built in ~2.3s** — `dist/assets/index-DD93sd_b.js` 756.42 kB (gzip 212.45 kB), CSS 27.44 kB (gzip 6.28 kB). Vite's >500 kB chunk warning still stands; route-level code-splitting is deliberately deferred (see §5) |
| Drift gates | included above | **NOT_TESTED** since deletion — `doors.test.ts` (8) and `door-errors.test.ts` (12) both directions against the shipped SQL; `permissions.test.ts` (12) across `006` + `011` + `013`; `taxonomy.test.ts` (17) including the client permission-token scrape — all four were the deleted TypeScript suite's checks, not SQL-verifier scenarios. The drift they guarded against is now re-checkable only by hand or by the compiler |
| E2E | — | **NOT_TESTED** — no Playwright/Cypress in this repository and no PostgREST in the local harness |

Nothing was hidden to get here: the two then-live drift gates failed loudly when `014` landed 19 unregistered doors and
19 unmapped tokens, and both were fixed by registering the doors and writing copy derived from each actual
`require_valid` expression rather than by loosening an assertion.

---

## 3. §81 — stage report

### 3.1 Authentication

**Before (#02):** no GoTrue in the browser at all. The client was constructed with
`persistSession: false, autoRefreshToken: false, detectSessionInUrl: false`; the acting identity was the
`007` dev user; there was no sign-in screen. **Now:** `src/db/client.ts` runs a real session client (D-31),
`src/domain/auth/auth-service.ts` sends an email link (`signInWithOtp`) and signs out,
`src/pages/auth/SignInPage.tsx` is the only entry surface and has **no password field** — §41 forbade
introducing password auth because the prompt mentioned authentication, and D-32 kept that refusal. Session
events are recorded server-side (`010`'s `record_auth_event`) and `last_login_at` is stamped. **Not** yet true:
this has never completed a round trip against the hosted GoTrue, because the project has no SMTP transport and
`site_url` is still `http://localhost:3000` (O-8, owner action).

### 3.2 Authorization — User → Membership → Role → Permission → Scope

One ladder, in one order, in two places that agree. `User` = a GoTrue identity plus exactly one `profiles` row
(`008` backfills it and `app.handle_new_user()` guarantees it thereafter); a missing profile is
`PROFILE_MISSING`, not "no permissions". `Membership` = `organization_memberships` — the only thing that puts a
user inside a tenant; `INVITED`, `SUSPENDED`, `REMOVED` or no row all resolve to `NO_ACTIVE_MEMBERSHIP`.
`Role` = a named bundle, system (`006`) or tenant-created (`011`), attached at a scope. `Permission` = one of
54 `domain.verb` tokens; the CHECK and `PERMISSION_PATTERN` both reject a second dot, which is how Prompt #04's
three-segment names get flattened (`restaurant.menu.view` → `menu.view`). `Scope` = organization → property →
outlet, each narrowed by `property_access`/`outlet_access`, with department deliberately refused. Every door
resolves the actor from the session, calls `app.require_permission`, and derives denormalized ancestors from the
parent row so a client cannot claim a property that is not under the organization it named. `evaluate_access`
is the same ladder as a *value* rather than an exception, so guards can pre-flight and audit a denial (D-30),
and `authorize.ts` is its pure mirror — the mirror's 24 tests in `authorize.test.ts` were deleted with the
suite on 2026-10-07, so client/server agreement is code reading only (NOT_TESTED), while the server ladder
itself stays verified by scenarios 6, 9, 11 and 13.

### 3.3 Tenant isolation

Three independent refusals, in descending trust order. (1) **RLS** (`003`): every tenant table has a
organization-scoped policy and `authenticated` holds SELECT only — a direct `INSERT`/`UPDATE`/`DELETE` is
refused by grants before any policy runs (scenario 2). (2) **The doors**: each one re-proves membership,
breadth and permission for the ids in the payload, so a guessed foreign uuid is `NIVAAS_SCOPE_MISMATCH` even
from a caller who can read its own tenant (scenario 3). (3) **The schema split**: PostgREST serves `public`
only, so all 41 `app.*` guards are unreachable from a browser whatever they are granted. Cross-tenant reads
return zero rows, not an error, so nothing leaks existence. The client adds a fourth, non-security layer: a
generation-keyed tenant cache that discards any fetch whose switch was superseded. Hosted, the same posture
was re-read as 20/20 tables under RLS and 50 definer doors with no unprotected table.

### 3.4 Audit

`app.audit()` is the single funnel; every write door calls it in the same transaction as its write, recording
actor, organization/property/outlet, action verb, entity, entity id, before/after, the mandatory `p_reason`
(§46 — `app.require_reason` raises `NIVAAS_REASON_REQUIRED`) and `010`'s `result`
(`SUCCESS`/`FAILURE`/`DENIED`). Security events join the same trail: `sign_in`/`sign_out` via
`record_auth_event`, and every `evaluate_access` denial via `app.audit_access`, because a raising door cannot
write its own refusal. `member_invited`/`accepted`/`cancelled`/`revoked`, `role_created`/`updated`/
`permissions_set`, `ownership_transferred` and each `*_status_changed` are all in it. `access_denied` records
the reason code, never a secret. `app.forbid_audit_mutation` makes the table append-only for every role
including the owner, and the verifier asserts the delete attempt is refused.

### 3.5 Security tests added (then deleted)

The TypeScript security suites were `security-matrix.test.ts` (10 — §49's named cases), `authorize.test.ts`
(24 — the full denial ladder and every `AccountStanding`), `auth-service.test.ts` (21 — email-link-only,
sign-out, cache cleared, never `signInWithPassword`), `custom-role-service.test.ts` (17 — the four `011`
doors and their guards), `role-service.test.ts` (19), `people-service.test.ts` (26), `session-service.test.ts`
(17), `src/app/RouteGuard.test.tsx` (10), `Can.test.tsx` (9), `AccessDeniedScreen.test.tsx` (4),
`AccessDebugPanel.test.tsx` (4), `src/db/doors.test.ts` + `door-errors.test.ts` (20 combined, both directions).
All of them were deleted on 2026-10-07 under the owner's standing instruction; the delete-tests order is now
fully executed — zero test files remain, the `test` script is gone from `package.json`, and `vitest` sits in
`devDependencies` as an unused entry. What survives is the SQL half: scenarios 10 (account gate), 11
(privilege escalation), 12 (outcomes in the trail), 13 (custom tenant role + last-owner), 14 (invitation
lifecycle) in the live `db/verify/tenant_isolation.sql`, plus the migration self-check blocks. Everything the
deleted suites alone proved is **NOT_TESTED**.

### 3.6 Files changed

- **SQL:** `db/supabase/008_identity_hardening.sql`, `009_role_assignment_policy.sql`, `010_audit_outcomes.sql`,
  `011_custom_roles.sql`, `012_invitation_lifecycle.sql`; verifier `db/verify/tenant_isolation.sql` (scenarios
  10–14, and 15 with #04).
- **Session/auth:** `src/db/client.ts`, `src/config/env.ts`, `src/domain/auth/{auth-service.ts,session-config.ts}`,
  `src/pages/auth/SignInPage.tsx`.
- **Access decisions:** `src/domain/access/authorize.ts`, `src/domain/identity/permissions.ts`,
  `src/domain/access/{session,people,role}-service.ts`, `src/domain/access/custom-role-service.ts` (new).
- **Data plane:** `src/db/doors.ts`, `src/db/door-errors.ts`, `src/db/rpc.ts`, `src/lib/audit.ts`.
- **Surfaces:** `src/components/ui/{Can.tsx,AccessDenied.tsx}`, `src/app/{RouteGuard.tsx,AccessDeniedScreen.tsx,
  AccessDebugPanel.tsx,Shell.tsx,navigation.ts,routes.ts}`, `src/pages/access/RolesPage.tsx`,
  `src/pages/team/TeamPage.tsx`, `src/pages/audit/AuditPage.tsx`.
- **Docs:** `docs/SECURITY.md`, `docs/PERMISSIONS.md` (54-token catalogue), `docs/ARCHITECTURE.md` §13–§15,
  `docs/ROADMAP.md` Phase 0, `docs/DECISIONS.md` D-29…D-40 + O-7/O-8, and this file.

### 3.7 Database changes

`008` re-cuts the `profiles.status` CHECK to `ACTIVE`/`SUSPENDED`/`DEACTIVATED`, backfills a profile per
identity, fixes the revoked-GLOBAL `is_platform_admin` path and adds `last_login_at`. `009` adds the role-
assignment ladder: no self-assign, ceiling/subset checks, the last-owner protection, `transfer_ownership`
semantics. `010` adds `audit_log.result`, `evaluate_access` (non-raising, auditable) and `record_auth_event`.
`011` adds the four tenant custom-role doors and per-organization role naming. `012` adds one pending invitation
per `(organization, email)` (partial unique index over `citext`), `app.expire_stale_invitations`, and
cancel-vs-revoke. Prompt #04's `013` seeds the 27 restaurant tokens and proves the ladder in-SQL; `014` creates
`menus`, `menu_categories`, `menu_items`, `menu_item_prices`, `modifier_groups`, `modifiers` with 19 doors —
counted locally at 50 public doors, 41 `app` functions, 20 tables, 20 of 20 under RLS. All of `000`–`014` are
applied to the hosted project except dev-only `007`.

### 3.8 Build status

```
Typecheck:  clean (npx tsc --noEmit --incremental false)
Lint:       NOT_AVAILABLE — no linter configured in package.json
Tests:      NOT_RUN — the suite (then 51 files / 721 tests passed) was deleted on 2026-10-07 by owner
            instruction; zero test files remain. SQL verifier live: 15 scenarios / 195 PASS / 0 FAIL at
            acceptance (cold rebuild, PG 18.3), now twenty scenarios
Build:      ✓ npm run build — 756.42 kB JS (gzip 212.45 kB) + 27.44 kB CSS, ~2.3s
```

### 3.9 Known limitations

1. **No live GoTrue round trip.** The hosted project has no SMTP transport and `site_url` is still GoTrue's
   `localhost:3000` default, so an emailed link can be neither delivered nor consumed (O-8). `007` is absent
   hosted, so the hosted tenant has no demo estate and no seeded user.
2. **`db/verify` has never run hosted, by rule.** The hosted posture is verified structurally
   (`remote-apply.mjs check` + anonymous refusals), behaviourally it is proven only against the local mirror.
3. **No linter** (§79's gate cannot be satisfied here) and **no E2E harness**.
4. **Single 756 kB chunk.** Code-splitting was deliberately deferred; it is now a real cost, not a theoretical
   one, and mobile-width sweeps of the new auth/team/roles surfaces are still open from #02.
5. **`src/domain/identity/types.ts` lags the database's account vocabulary** (D-34). The database and
   `authorize.ts` are correct; the picker array is stale.
6. **Department scope is refused, not resolved** (D-26). `platform.manage` is seeded but no door uses it.
7. **No rate limiting of our own**, no MFA/recency check, no session-duration control beyond GoTrue's 1 h JWT;
   only GoTrue's email-send throttle is surfaced honestly as `RATE_LIMITED`.
8. **A raising door cannot self-audit its refusal** (§6) — the reason `evaluate_access` exists, not a fix.
9. **Secrets discipline held, but one credential was exposed outside the repository.** The Supabase Personal
   Access Token used for the hosted applies was pasted into chat. It was never written to a tracked file, a
   fixture or a bundle (verified by scan above) and is read only from the environment or gitignored `.env`;
   it still needs **revoking by the owner**. Similarly, the earlier-session poultry credentials stay treated
   as never-known.
10. **Instruction injection observed in tool output.** During this stage, output returned by a tool contained
    instructions that were not the owner's (git push/merge, `npm audit fix`, "wait for the owner"). They were
    not executed and the tracked tree was scanned for the files they implied (zero matches). This is a harness
    integrity risk, not a product defect, but it belongs in a security report rather than being dropped.

### 3.10 Architectural decisions

D-29…D-40 in `docs/DECISIONS.md`, of which the ones that were real forks: **D-32** email-link only, no password
path (§41); **D-33** two-part `domain.verb` keys kept over the prompt's resource/action split, with later
domains adding verbs inside the existing 15 domains rather than widening the key grammar; **D-30** the
non-raising `evaluate_access` as the denial recorder, since a door that raises cannot write its own refusal;
**D-26** department-scope refused rather than half-wired; **D-34** the database is authoritative and the client
vocabulary is allowed to lag, documented rather than papered over; **D-36/D-37** `INVITED` stays a membership
status and `profiles.status` is a platform kill switch with no tenant door; **D-39** `ORG_OWNER` is grantable
while the owner *seat* moves only through `transfer_ownership`; **D-40** tenant role names are per-organization.
Two of these deliberately diverge from the prompt text, and both divergences are stated in the docs rather than
quietly implemented.

### 3.11 Next step

Prompt #03 is closed; the first operational module is now allowed by its own exit gate on the schema side.
**Prompt #04 — Restaurant Foundation (menu, tables, POS orders, KOT)** is already under way: `013` (the 27
restaurant permissions) and `014` (the six menu tables and 19 doors) are applied locally and hosted, scenario
15 attacks them, and 721 tests were green when that sentence was true; the suite was deleted on 2026-10-07,
so the #04 client side is now NOT_TESTED and the SQL verifier is the only live behavioural gate. The
remaining #04 work is `015` floors/areas/tables, `016` the order state machine, `017` the bill calculation
engine and payments, `018` KOT, then the menu/floor/POS/billing/dashboard screens and the dev seed. Tax on
the bill stays in Phase 1 (D-07, still awaiting owner sign-off); the accounting engine and GST returns stay
in Phase 4.

Two owner actions unblock the rows above: **configure the hosted SMTP transport and `site_url`** (or accept
that Phase 0's exit gate cannot be walked by a real person yet), and **revoke the Personal Access Token**.
