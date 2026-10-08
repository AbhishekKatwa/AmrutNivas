# AMRUT NIVAAS — Security model

This is the authoritative description of how AMRUT NIVAAS answers one question: *may this person do
this thing, here, right now?* It documents what the code actually does and which defect each rule
prevents — not an aspirational security architecture. Prompt #03 §57/§80 require this file; the
permission catalogue an administrator reads lives in [PERMISSIONS.md](./PERMISSIONS.md).

Two ground rules bind everything below.

- **Authentication and authorization are separate.** The auth provider (GoTrue) answers "who is this
  session". Every other line in this document answers "what may they do, where" and never trusts the
  login to carry authority. Prompt #03 §4.
- **Nothing on the client is a control.** `can()`, navigation visibility, disabled buttons and the
  `authorize()` mirror are display aids. Every write is refused server-side even if a caller edits
  the JavaScript. Prompt #03 §2: "User cannot see the Finance menu" is not security.

---

## 1. The authority model

Four mechanisms, each with one job.

**Row-level security is the tenant boundary.** `db/supabase/003_rls.sql` enables RLS on every
tenant table and gives `authenticated` SELECT only, with `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`
revoked at the grant level. Every tenant row carries the ids of all its ancestors, so a query that
forgets a deeper predicate still cannot cross tenants because it filters on `organization_id` alone.
A chain trigger refuses a write whose ancestors disagree (`NIVAAS_SCOPE_MISMATCH`). Proven by
scenarios 1, 2, 3 and 9 of `db/verify/tenant_isolation.sql`.

**`public` doors are the write path.** Supabase's PostgREST serves functions from `public` and
nothing else, so the schema split is a boundary rather than tidiness (`db/supabase/005_write_rpc.sql`
header; `docs/ARCHITECTURE.md` §13.1). The 50 client-callable doors are named in `src/db/doors.ts`;
every guard and helper stays in `app` and is unreachable from a browser whatever it is granted. A
door does the same four things in the same order: resolve the actor from the session (never from an
argument), re-prove membership + permission + breadth for the ids given and derive denormalized
ancestors from the parent row, refuse closed targets, and write the audit row in the same
transaction — then return the written row as `jsonb` (`docs/DECISIONS.md` D-18, D-19).

**`app.audit()` is the single funnel for history.** There is no INSERT policy on `audit_log`, so
rows enter only through that function (`db/supabase/004_audit.sql:105-107`). Centralising the insert
means the actor is always the session user, which is the only way an audit row can be trusted.

**`SECURITY DEFINER` bypasses RLS, so doors must guard enumeration themselves.** A definer body
runs as the table owner and therefore reads across tenants. That is what lets a door resolve a
foreign id at all — and it is why answering `NIVAAS_ACCESS_DENIED` for a role or invitation id
belonging to another tenant would *prove that row exists* to a person who cannot see it (Prompt #03
§40). `app.require_tenant_visibility(p_organization)` (`db/supabase/011_custom_roles.sql:106-119`)
runs first in those doors and raises `NIVAAS_NOT_FOUND` when the caller is neither a member nor a
platform admin. **A foreign id is answered as if it did not exist; a real member who lacks the
permission still gets the honest denial.** The same rule is why `cancel_invitation` calls it before
checking `user.invite` (`db/supabase/012_invitation_lifecycle.sql:316`).

---

## 2. Identity

`db/supabase/008_identity_hardening.sql` adds the §5 profile fields to `public.profiles`:
`first_name`, `last_name`, `locale`, `timezone`, `last_login_at` (lines 34-39). `full_name` stays as
the stored name of record; `locale` is CHECKed against `^[a-z]{2}(-[A-Z]{2})?$` (lines 51-53) and
`timezone` is validated by the same catalog-backed trigger the hierarchy tables use (lines 92-94).

`display_name` is a **generated stored column**, not a trigger (`008:60-68`):

```sql
coalesce(
  nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''),
  nullif(btrim(coalesce(full_name, '')), ''),
  nullif(split_part(email::text, '@', 1), ''),
  '')
```

A trigger can be forgotten by a future write path; a generated column cannot, so the three name
fields can never disagree and no screen has to choose which one to trust. The last arm is exactly
what `app.handle_new_user()` already stores in `full_name` when a signup carries no name metadata,
so the display name invents nothing the data does not already invent.

**Account status vocabulary is `ACTIVE · SUSPENDED · DEACTIVATED`** (`008:86-88`). `INACTIVE` is
retired — it meant "not trading" at the organization level and nothing ever wrote it here; existing
rows were migrated to `DEACTIVATED` (`008:79`). `INVITED` is deliberately **not** an account status:
invitation standing belongs to a tenant, while `profiles` is the global login, and §5 forbids putting
tenant state on the profile. It lives on `invitations.status` and
`organization_memberships.status`, which is why a person can be invited to one group and ACTIVE in
another. `last_login_at` is written only by `public.record_auth_event` on a successful sign-in
(`010_audit_outcomes.sql:268-271`), never by the client.

**Authority is never `user.role`** (Prompt #03 §5). A role is a *grant* — a row in `user_roles`
joined to an organization, optionally narrowed to a property or outlet — so one human holds different
authority in two tenants. `app.member_of`, `app.is_platform_admin` and `app.has_permission` all read
grants, never a profile column.

The client mirror is only partly aligned. `src/domain/access/authorize.ts:25` defines
`AccountStanding = "ACTIVE" | "SUSPENDED" | "DEACTIVATED"`, which matches the database.
`src/domain/identity/types.ts:49` still declares `AccountStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED"`
and `ACCOUNT_STATUSES` at line 147 mirrors the retired 002 vocabulary, and `UserAccount` (lines
273-283) lacks `first_name`/`last_name`/`locale`/`timezone`/`last_login_at`/`display_name`. The
database is authoritative; the TypeScript mirror is a known lag, recorded in `docs/DECISIONS.md`
D-34 and listed as NOT_VERIFIED in `docs/ACCEPTANCE.md`.

---

## 3. Membership lifecycle

`organization_memberships.status` is `INVITED · ACTIVE · SUSPENDED · REMOVED`, with `REMOVED`
terminal (`src/domain/identity/types.ts:43`). `public.set_member_status`
(`db/supabase/009_role_assignment_policy.sql:297-381`) is the only door that moves it, and the
transitions are:

| From → To | Permission asked | Extra walls | What else the door does |
|---|---|---|---|
| INVITED → ACTIVE | (via `accept_invitation`, not this door) | tenant active, role ACTIVE, inviter still able, email match | creates the membership, breadth and one grant per scope target |
| ACTIVE → SUSPENDED | `user.suspend` | not yourself, not an owner row | stamps `revoked_at` on that person's grants in this tenant |
| ACTIVE → REMOVED | `user.remove` | not yourself, not an owner row | stamps `revoked_at` **and** deletes `membership_property_access` / `membership_outlet_access` for that tenant |
| SUSPENDED/REMOVED → ACTIVE | `user.suspend` or `user.remove` | same walls | sets `joined_at` if empty; **does not un-revoke anything** |

**Removal is a breadth deletion.** A revoked grant is not a delete (`user_roles.revoked_at` is a
timestamp, so history stays readable — `docs/DECISIONS.md` D-24), but access *breadth* is genuinely
removed: `009:361-364` deletes the property/outlet access rows so a re-join cannot resurrect a scope
nobody approved. A suspension deliberately keeps breadth, because suspending is a pause and
rebuilding a scope on return is guesswork (`009:359-360`).

**Restoring a membership grants nothing back.** Access returns only through an explicit
`assign_role` (`docs/DECISIONS.md` D-24; scenario 6e asserts the grants are revoked while 6d asserts
the profile row survives).

`app.member_of(p_user, p_organization)` (`008:155-170`) is the implementation of Prompt #03 §6 and
§27 — "a removed or suspended membership must not retain operational access". It requires
`app.account_is_operational` **and** an `ACTIVE` membership row, so:

- suspension or removal of the membership takes effect on the next call, with no refresh and no grace,
  because every read policy and every door resolves through it;
- suspension of the *account* also takes effect, even where a stale membership is still `ACTIVE`.

Before 008, `app.has_permission` and `app.is_platform_admin` joined `user_roles` without
`revoked_at is null`, so the UI went quiet while every door kept honouring revoked authority, and
nothing read `profiles.status` at all — suspending an account was a UI field. Both defects are closed
by two predicates (`008:6-15`). Scenario 10 proves the fix from the other side: a suspended account
answers zero permissions, refuses with `NIVAAS_ACCOUNT_SUSPENDED`, clears the saved context, and
closes every read.

---

## 4. Roles and the authority ladder

**The ladder is data, not code scattered through doors** (`db/supabase/009_role_assignment_policy.sql:24-83`).
`roles.seniority` is an integer `1..100` (higher is more powerful) and `roles.owner_class` marks the
two roles that own a tenant or the platform:

| System role | seniority | owner_class | scope_level |
|---|---|---|---|
| PLATFORM_ADMIN | 100 | yes | GLOBAL |
| ORG_OWNER | 90 | yes | ORGANIZATION |
| ORG_ADMIN | 80 | no | ORGANIZATION |
| GENERAL_MANAGER | 70 | no | PROPERTY |
| PROPERTY_MANAGER | 60 | no | PROPERTY |
| FINANCE_MANAGER | 55 | no | ORGANIZATION |
| HR_MANAGER | 55 | no | ORGANIZATION |
| RESTAURANT_MANAGER | 50 | no | OUTLET |
| STORE_MANAGER | 50 | no | OUTLET |
| EVENT_MANAGER | 50 | no | OUTLET |
| KITCHEN_MANAGER | 45 | no | OUTLET |
| HOUSEKEEPING_MANAGER | 45 | no | OUTLET |
| STAFF | 10 | no | OUTLET |

`app.grant_ceiling(p_user, p_organization)` (`009:91-104`) is the actor's own ceiling: the highest
`seniority` among their **live** (`revoked_at is null`) grants in that tenant, counting a GLOBAL grant
everywhere. It returns 0 for a revoked or suspended actor, which is the correct answer for someone
whose authority 008 already stopped honouring.

**`assign_role` refusals, in the order the door reaches them** (`009:106-230`; Prompt #03 §29):

| Order | Code | Rule it enforces |
|---|---|---|
| 1 | `NIVAAS_ACCESS_DENIED` (from `require_permission('role.assign')`) | may I hand out roles at all |
| 2 | `NIVAAS_ORGANIZATION_NOT_ACTIVE` | no new authority under a closed tenant |
| 3 | `NIVAAS_ROLE_NOT_FOUND` | the role must exist, be ACTIVE, and be a system role or belong to this tenant |
| 4 | `NIVAAS_SELF_ASSIGN_DENIED` | `p_user <> actor` — no self-elevation, ever |
| 5 | `NIVAAS_ROLE_ABOVE_AUTHORITY` | `role.seniority <= grant_ceiling` — you cannot grant what you do not hold |
| 6 | `NIVAAS_OWNER_ONLY` | an owner-class grant requires the owner seat (`is_owner`) or the platform |
| 7 | `NIVAAS_NOT_A_MEMBER` | the grantee must already hold an ACTIVE membership here (§15) |
| 8 | `NIVAAS_DEPARTMENT_GRANTS_UNSUPPORTED` | DEPARTMENT has no resolution path (see below) |
| 9 | `NIVAAS_SCOPE_MISMATCH` | PROPERTY scope requires `p_property`; OUTLET scope requires `p_outlet` |
| 10 | `NIVAAS_GRANT_OUTSIDE_SCOPE` | the actor must reach that property/outlet themselves |

Step 10 is the resource-scope half of privilege escalation: a site-scoped grant travels with site
breadth (the door inserts `SELECTED_PROPERTIES`/`SELECTED_OUTLETS` rows, `009:201-214`), so granting
a role at a property the actor cannot reach would hand out access, not merely a title. Before this
file, `role.assign` — which is seeded on HR_MANAGER by `006_seed_rbac.sql:162` — could have minted a
`PLATFORM_ADMIN` inside the actor's own tenant. Scenario 11 is the escalation suite.

**`revoke_role` walks the same ladder in reverse** (`009:234-288`): `role.assign` for the grant's
tenant, `NIVAAS_ALREADY_REVOKED` if it is already spent, `NIVAAS_ROLE_ABOVE_AUTHORITY` if the grant
is more senior than the actor (otherwise a delegated admin could disable the people above them), and
`NIVAAS_OWNER_MUST_TRANSFER` if the grant is owner-class and the target holds the `is_owner` seat.

**Custom roles** (`db/supabase/011_custom_roles.sql`) deliver §10's "Night Auditor". The name-scoping
defect fixed first: `roles.name` was **globally** unique (002's column-level `unique`), so two tenants
could not both have a role called `NIGHT_AUDITOR` and the second got an unexplained unique violation.
011 drops `roles_name_key` and replaces it with two partial unique indexes — `roles_system_name_idx`
where `organization_id is null`, `roles_tenant_name_idx` on `(organization_id, name)` where it is not
(lines 31-42). Scenario 13g proves two tenants can now hold the same role name.

`create_role` (lines 123-212) enforces, in order: `role.create`, tenant active, `p_reason` present,
name `^[A-Z][A-Z0-9_]{2,39}$` with a non-empty display name (`NIVAAS_INVALID_NAME`), no collision with
a system role name (`NIVAAS_ROLE_NAME_TAKEN`), scope in ORGANIZATION/PROPERTY/OUTLET
(`NIVAAS_ROLE_SCOPE_FORBIDDEN` — GLOBAL is the platform's namespace, DEPARTMENT has no resolution
path), a ceiling above 0 (`NIVAAS_ROLE_ABOVE_AUTHORITY`), a non-empty selection
(`NIVAAS_EMPTY_SELECTION`), and every requested token real **and** held by the actor
(`app.ungrantable_permission`, lines 81-97, again refusing `NIVAAS_ROLE_ABOVE_AUTHORITY`). The row is
always written with `owner_class = false` and `seniority = creator's ceiling` (line 186).

**A custom role can never reach owner authority**, and the reason is structural rather than a
permission to remember: `owner_class` is hard-coded false for tenant roles, `assign_role` refuses an
owner-class grant unless the actor holds the owner seat or the platform (step 6 above), and
`set_role_permissions` re-checks the same subset rule so editing permissions cannot promote a role
above its editor (line 304 pins `v_ceiling := v_role.seniority`). `update_role`,
`set_role_permissions` and `set_role_status` all refuse a system role with
`NIVAAS_SYSTEM_ROLE_PROTECTED`, and the migration's own self-check (lines 377-384) aborts the apply if
any tenant row ends up `owner_class`, `is_system` or `seniority > 100`.

**Last-OWNER protections** (Prompt #03 §30, `docs/DECISIONS.md` D-29) — a tenant must never be left
without an operable owner:

| Action on the owner's membership / grant | Refusal |
|---|---|
| Suspend or remove an `is_owner` row through `set_member_status` | `NIVAAS_OWNER_MUST_TRANSFER` (`009:331-333`) — **both** retired statuses are refused, not just REMOVED |
| Revoke the owner's owner-class grant through `revoke_role` | `NIVAAS_OWNER_MUST_TRANSFER` (`009:273-278`) |
| Any of the above by someone who is not the owner or the platform | `NIVAAS_OWNER_ONLY` (`009:336-342`) |
| Retiring your own membership, or granting a role to yourself | `NIVAAS_SELF_NOT_ALLOWED` / `NIVAAS_SELF_ASSIGN_DENIED` (`009:327`, `009:139`) |

The escape hatch is `transfer_ownership` (`005_write_rpc.sql:1198-1250`), which is owner-or-platform
only, moves the ORG_OWNER grant with the seat rather than the person, and is made atomic by
`memberships_one_owner_idx` — two owners are a database impossibility, so refusing here has a
documented way out instead of being a wall with no door.

---

## 5. The permission catalogue

Storage: `role_permissions(role_id, permission)` with `permission` CHECKed by 002 as a lowercase
`domain.verb` token. The client label layer is `PERMISSION_CATALOGUE` in
`src/domain/identity/permissions.ts` — 54 entries: the 25 seeded by `006_seed_rbac.sql:77-92` (which
self-checks `count(*) = 25`), `role.create` and `role.edit` inserted by `011_custom_roles.sql:62-65`,
and the 27 restaurant tokens seeded by `013_restaurant_permissions.sql`. Those three files are the
sources `permissions.test.ts` used to re-read and diff against the TypeScript list in both directions; that
suite was deleted on 2026-10-07 by owner instruction (`docs/ARCHITECTURE.md` §13.5). Each migration still
self-checks its own count, but nothing now diffs the seed against the TypeScript list: a seed gaining or
dropping a token no longer fails a build, it ships a button nobody can press or a label with no grant behind
it. `audit.export` from Prompt #03 §58's example list is **not** implemented — only `audit.view` is seeded.
The restaurant verbs (`restaurant.view`, `menu.*`, `table.*`, `order.*`, `kot.*`, `bill.*`,
`payment.*`) exist in the catalogue as of `013`; the three-segment names Prompt #04 §5 writes
(`restaurant.menu.view`) are refused by the 002 CHECK, so `013` documents them flattened one level, the
way `property.manage_access` already does.

The administrator-facing rendering — every key, what it allows, which system role holds it — is
[PERMISSIONS.md](./PERMISSIONS.md).

**`my_permissions` resolves in three arms** (`008:278-315`, `returns text[]` — load-bearing, since
PostgREST renders the array and a return type is not a valid `create or replace` change):

1. A platform admin gets the whole catalogue: GLOBAL grants carry no organization row, so a tenant
   predicate would otherwise answer "no permissions" for the one role that sees everything.
2. Otherwise, if `app.member_of`, the distinct union of the permissions of their live, scope-matched
   grants, filtered to the requested `(organization, property, outlet)`.
3. Otherwise `'{}'` — a non-member, a removed member and a stranger all get an empty list, which is
   the second half of the 008 fix (a removed person's grant rows survive revocation, so an
   unfiltered door used to hand them a live permission list for the tenant they were just ejected
   from).

**Scope model.** `roles.scope_level` ∈ `GLOBAL · ORGANIZATION · PROPERTY · OUTLET · DEPARTMENT`
(`src/domain/identity/types.ts:346-354`). Access *breadth* is kept separate from *capability*:
`membership_property_access.mode` ∈ `ALL_PROPERTIES` / `SELECTED_PROPERTIES` and
`membership_outlet_access.mode` ∈ `ALL_OUTLETS` / `SELECTED_OUTLETS`. The `ALL_*` values are stored as
a single sentinel row rather than an id list precisely because they mean "everything at that level,
including rows created next month" (`src/domain/identity/types.ts:76-79`). DEPARTMENT is defined as
data but grants are refused at it (`009:170-171`, `docs/DECISIONS.md` D-26) — see §7.

**Widest applicable grant wins, with carve-out inheritance.** `app.has_permission` (`008:196-231`)
and `app.can_access_property` / `app.can_access_outlet` (`db/supabase/000_tenancy_helpers.sql`)
resolve a grant at the broadest level that covers the request: a PROPERTY grant answers for that
property and, through it, for any outlet inside it; an OUTLET grant answers for that outlet and, when
the request names the property instead, for the outlet's parent property. An outlet row therefore
narrows only outlet-bound requests; it never silently narrows the property-wide grant above it.
Outside the widest grant a row is **invisible**, not merely denied.

---

## 6. The nine-step evaluation

Prompt #03 §18/§13 ask for one centralized question with an explicit reason on every denial. There
are exactly two implementations of it, and they are the same ladder:

- **`public.evaluate_access(p_permission, p_organization, p_property, p_outlet)`**
  (`db/supabase/010_audit_outcomes.sql:157-228`) — the server's authority. It answers
  `{"allowed": true, "reason": null}` or `{"allowed": false, "reason": "<CODE>"}`, and when it
  refuses it *records* the denial before returning.
- **`authorize(facts)`** (`src/domain/access/authorize.ts:64-96`) — a pure client mirror for
  route guards, disabled controls and the access-denied screen. No Supabase, no store, no async;
  every fact is something the server's own resolvers already answer. `authorize.test.ts` used to diff its
  reason codes against the SQL text, so a renamed or reordered server step broke a test instead of quietly
  changing what users see; that suite was deleted on 2026-10-07 by owner instruction
  (`docs/ARCHITECTURE.md` §13.5), so **nothing enforces that agreement now** — the mirror is hand-maintained
  against `010:157-228`, and a renamed or reordered server step silently changes what users see.

| Step | Reason code | Server predicate | Client fact |
|---|---|---|---|
| 0 | `PERMISSION_DENIED` | malformed `p_permission` — a programming error, refused as denied rather than reaching `has_permission` (`010:175-178`) | `PERMISSION_PATTERN` fails |
| 1 | `NOT_AUTHENTICATED` | `app.current_user_id()` is null | `signedIn === false` |
| 2 | `PROFILE_MISSING` | no `profiles` row (a half-created identity) | `profileExists === false` |
| 3 | `ACCOUNT_SUSPENDED` / `ACCOUNT_DEACTIVATED` | `profiles.status <> 'ACTIVE'`; the code is `'ACCOUNT_' || status` (`010:186`) | `accountStanding !== "ACTIVE"` |
| 4 | `NO_ACTIVE_MEMBERSHIP` | `not app.member_of(...)` — covers no row, a non-ACTIVE membership and a retired tenant alike | `membershipStatus !== "ACTIVE"` |
| 5 | `ORGANIZATION_NOT_ACTIVE` | `not app.organization_is_active(...)` | `organizationStatus !== "ACTIVE"` |
| 6 | `PROPERTY_ACCESS_DENIED` | `p_property is not null and not app.can_access_property(...)` | `propertyRequested` set, `propertyReachable === false` |
| 7 | `OUTLET_ACCESS_DENIED` | `p_outlet is not null and not app.can_access_outlet(...)` | `outletRequested` set, `outletReachable === false` |
| 8 | `PERMISSION_DENIED` | `not app.has_permission(...)` | `permissionHeld === false` |
| 9 | — | allow | `{ allowed: true }` |

**The honest limitation, stated plainly.** A door that refuses does so with `raise exception`, which
aborts its own transaction — including the audit insert it just made. Postgres has no autonomous
transaction, and the mechanisms that would fake one (dblink, a queue, a background worker) are
exactly the §60 machinery this product is forbidden to add. So **an in-door refusal raised by
`app.require_permission` cannot self-audit**, and it does not. The security trail for denials is
written by `evaluate_access`, which is the *same decision made as a non-raising read*: its answer is
the input to a refusal rather than the refusal itself. Route guards and sensitive-action
confirmations call it, so a denial a person actually sees is a denial that gets recorded. §39's "a
denial must be explicit" is satisfied either way, because the reason code exists in both paths — but
the recorder is `evaluate_access`, not the raising door. (`010_audit_outcomes.sql:9-18`;
`docs/DECISIONS.md` D-30.)

`evaluate_access` also refuses to write into a stranger's history. When the denial is
`NOT_AUTHENTICATED`, `PROFILE_MISSING` or `NO_ACTIVE_MEMBERSHIP`, the audit row is recorded with
`organization_id = NULL` and the probed id kept only in `metadata` (`010:208-222`), so probing a
tenant you do not belong to cannot push rows into that tenant's trail. Scenario 12d proves it.

---

## 7. Department scope is an open edge, not a hidden path

`roles.scope_level` and `PERMISSION_SCOPES` accept `DEPARTMENT` as data, `006_seed_rbac.sql` seeds
four `department.*` permissions, and the department hierarchy tables are fully built. What is not
wired is the grant path: `my_permissions` resolves grants at organization, property and outlet level
only, so accepting a department id in `assign_role` would write a grant that silently confers
nothing. `009:170-171` and `011:163` refuse it (`NIVAAS_DEPARTMENT_GRANTS_UNSUPPORTED`,
`NIVAAS_ROLE_SCOPE_FORBIDDEN`) and `src/db/door-errors.ts:110-113` maps it to a 422 with an honest
sentence. This is a decision, not a gap discovered later: a capability that appears to exist but does
not is worse than one plainly absent (`docs/DECISIONS.md` D-26; scenario 9f2).

---

## 8. Audit

**Row shape** (`db/supabase/004_audit.sql:20-61` + the outcome column from `010:22-32`):

| Column | Notes |
|---|---|
| `id` | `bigint identity` — write-heavy, monotonic, rarely referenced by id, so a btree-friendly key keeps the index small |
| `actor_id` | nullable only for actions no human took; otherwise always the session user |
| `organization_id` / `property_id` / `outlet_id` | the tenant predicate plus where the action happened, so a site manager reads their own history without joining anything |
| `action` | lowercase `snake_case` verb, CHECKed `^[a-z][a-z0-9_]{2,63}$`. Deliberately **not** an enum or value list: 004's header records that the donor's CHECK forced a schema migration to log a new event type, and teams answered by stuffing meaning into `metadata` |
| `entity`, `entity_id` | polymorphic on purpose, so a future `reservation` or `invoice` row needs no change here |
| `before`, `after`, `metadata` | `jsonb` snapshots of the moment, not data anyone queries by |
| `reason` | mandatory where a door calls `app.require_reason`; the "which actions need one" rule lives with the doors, not in a table CHECK |
| `result` | `SUCCESS` \| `FAILURE` \| `DENIED`, default `SUCCESS` (`010:22-32`) |
| `created_at` | server clock |

**Append-only by trigger, for every role including the owner.** `app.forbid_audit_mutation` raises
`NIVAAS_AUDIT_IMMUTABLE` on UPDATE or DELETE (`004:80-94`). A privilege check would not fire for a
superuser where a trigger does, which is why it is a trigger. Corrections are new events. Clients
hold `SELECT` only, with `insert/update/delete/truncate` revoked (`004:101-103`) and no INSERT policy,
so even `authenticated` cannot fabricate history. There is deliberately no backfill of `result` on
existing rows: `default 'SUCCESS'` already says what they were, and an UPDATE would be refused by the
immutability trigger — which is the point of it (`010:46-48`).

**`access_denied` event shape** (`app.audit_access`, `010:106-140`). An access decision is not a
mutation of a row, so it cannot name one — `app.audit`'s `entity_id` is a uuid for exactly that
reason. `app.audit_access` is the second and only other way history is written; it takes the same
SECURITY DEFINER path and is append-only like everything else. The row is
`action = 'access_denied'`, `entity = 'access'`, `entity_id = <permission key>`,
`result = 'DENIED'`, `metadata = {reason, permission, requested_property, requested_outlet}`. The
spec's `ACCESS_DENIED` (§33) is this row; the vocabulary is the repository's lowercase snake, and this
paragraph is the only place the two spellings are reconciled.

**`record_auth_event`** (`010:237-284`) writes the session footprint. `p_event` ∈ `sign_in|sign_out`
(anything else → `NIVAAS_INVALID_EVENT`), `p_result` ∈ `SUCCESS|FAILURE` (else
`NIVAAS_INVALID_RESULT`). It attributes the row to the tenant the session is working in *only while
that tenant still accepts the caller*, otherwise the row is the person's own footprint and nothing
more (`010:258-266`). A successful `sign_in` stamps `profiles.last_login_at`. The audit row is
`auth_sign_in` / `auth_sign_out`, `entity = 'session'`, `metadata = {event}`. There is no sign-in
door and no `FAILURE` sign-in row: GoTrue authenticates and hands back a JWT, and only then does this
become callable — so a failed attempt lives in GoTrue's own logs, and inventing a pre-session failure
row would mean trusting an unauthenticated caller to write history.

**§68, the binding rule: no password, OTP, token, secret or invitation token reaches a log, a store
field or browser storage.** Construction rather than convention:
`record_auth_event`'s payload is an event name and an outcome and nothing else; `signOutSession`
dispatches the audit *before* GoTrue teardown but sends only `{event, result}`
(`src/domain/auth/auth-service.ts:111-125`); the audit-failure handler is deliberately silent,
because logging the failure is how a token-shaped error string ends up in a console (lines 161-165);
the invitation token leaves in exactly one response and is stored only as a SHA-256 hash
(`012:128-156`); `toPublicError` never copies foreign text (`src/lib/errors.ts:150-170`); and only
the publishable anon key is ever in a browser bundle (`src/db/client.ts:9-22`). Scenario 12k asserts
the whitelist on `access_denied` metadata directly.

---

## 9. Sessions

**There are no passwords.** Prompt #03 §41 is a product decision, not a gap: the entry path is the
GoTrue email sign-in link, the same token-by-email model invitations already use.
`src/domain/auth/auth-service.ts` is the **only** place the GoTrue API exists in this codebase, and it
calls `signInWithOtp` and nothing else (lines 76-94) — there is no `signInWithPassword` anywhere
behind the sign-in screen (`src/pages/auth/SignInPage.tsx`, which validates an address by format only
and states so on the page). Two auth paths is the defect this prevents; a second path has nowhere to
grow. The failure copy is deliberately one line for every GoTrue refusal, because parsing the message
would let the sign-in screen confirm which addresses have accounts.

**Client configuration** — `src/db/client.ts:50-58`:

```js
auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
```

`persistSession` so a reload restores the session, `autoRefreshToken` so a long shift does not end
mid-form, `detectSessionInUrl` so the emailed link is consumed when the URL carries one. This
supersedes `docs/DECISIONS.md` D-17's `persistSession: false` / `detectSessionInUrl: false` (recorded
as D-31). §25's "no unnecessary sensitive data in browser storage" is met by letting GoTrue own its
own storage and adding nothing to it: the app writes no session to `localStorage` itself
(D-27 still stands — the context store and tenant cache are in-memory only).

**Logout is server-side first, then local.** `signOutSession` dispatches the `sign_out` audit while a
JWT still exists to authenticate the door, then calls `client.auth.signOut()`, which drops the
persisted session and emits `SIGNED_OUT`; awaiting the audit would let a slow database refuse a person
their exit, and dispatching it after teardown would mean it could never be written at all
(`auth-service.ts:104-125`). `useContextStore.signOut()` then runs `applySignedOut()`
(`src/state/context-store.ts:355-367`): bump `commitSequence` so any in-flight bootstrap or switch
discards itself, `clearAll()` the tenant cache, and reset the store to `unauthenticated` — carrying a
typed failure message into the fresh state rather than swallowing it. If the GoTrue call fails the
device still gives up the tenant; that half of logout a person can always complete.

**`startSessionSync()`** (`src/state/context-store.ts:389-399`) bridges GoTrue events to the store,
mounted once next to the bootstrap effect (`src/App.tsx`). Per event:

| Event | Effect |
|---|---|
| `INITIAL_SESSION` | nothing — the app's own bootstrap runs against the same restored session, and firing here would be a second boot storm racing the first (`src/domain/auth/session-config.ts:34-40`) |
| `SIGNED_IN`, `TOKEN_CREATED` | revalidate: re-run `bootstrap()` so the server re-proves context and grants; and record one `sign_in` footprint per *login*, not per event, because consuming a link surfaces both back to back (`auth-service.ts:41-46`, `session-config.ts:49-54`) |
| `TOKEN_REFRESHED` | revalidate only — not a login |
| `SIGNED_OUT` | `applySignedOut()` with no wire call. A failed token refresh arrives as this same event, which is the honest signal (`session-config.ts:42-47`) |

**Bootstrap avoids a door storm without a session** (`context-store.ts:213-271`).
`getSupabase() === null` → `unconfigured` without touching a door (test-stub-safe, since
`backendUnavailableReason()` reads env only). Then `readSession()`; a `null` session lands in
`unauthenticated` with `activateScope(null)` and **no door call at all** — each door would refuse with
`NIVAAS_NO_SESSION`, which is true but is a network storm saying nothing new. Only with a session does
it call `resolve_active_context` and then `my_permissions`.

**Real logout must be paired with real re-proof.** `resolve_active_context`
(`005:1516-1559`) re-proves every level on each load, so a saved context cannot outlive the access
that justified it, and a dropped level returns `cleared: true` which the store surfaces as a notice
rather than a silently smaller context (scenario 5; `docs/DECISIONS.md` D-27).

---

## 10. Organization suspension

`organizations.status` ∈ `ACTIVE · SUSPENDED · ARCHIVED`; there is no `INACTIVE` at the tenant level
because a group is trading or not (`src/domain/identity/types.ts:36-37`).

**Which doors refuse, and with what.** `app.require_active_organization`
(`005_write_rpc.sql:79-91`) raises `NIVAAS_ORGANIZATION_NOT_ACTIVE`, and it is called by:

| Door | Why it asks |
|---|---|
| `create_property` (`005:444`), `create_outlet` (via `require_writable_property`, `005:618`) | no new site under a closed tenant |
| `set_property_status` when reactivating (`005:565-567`) | a site cannot come back to life inside a dead tenant |
| `assign_role` (`009:127`), `revoke_role` (tenant-scoped) | no new or reversed authority |
| `create_role`, `set_role_permissions` (`011:144`, `011:291`) | no new authority invented |
| `invite_member` (`012:89`) | no new pending grant |
| `accept_invitation` (`012:189`) | a link issued under a different state of the world cannot create a member now |

Reads are **not** closed by a suspension: RLS membership is unaffected, so a suspended estate's staff
can still read history and reports. What they cannot do is any write through the doors above, add a
member, join a member, grant or revoke a role, create a role or send an invitation. An ARCHIVED
tenant additionally refuses with `NIVAAS_ORGANIZATION_ARCHIVED` on `update_organization` (`005:323`).
Scenario 14d proves the suspended-estate join refusal; scenario 9 covers archive/refuse semantics.

**Retiring a tenant is owner-or-platform only** (`005:380-388`): `organization.archive` *and* the
owner seat. A permission alone would be the wrong tool — an administrator who could archive a group
could delete a business.

Billing, subscription state and support impersonation are **not part of this product** (Prompt #03
§59 defers subscriptions/billing to Phase 9); nothing here pretends to enforce them.

---

## 11. The error model

Prompt #03 §39: a refusal must be structured, single-token, and never database text. Every door
raises one `NIVAAS_*` token; `src/db/door-errors.ts` is the only place a token becomes an `AppError`
code + user copy, and `door-errors.test.ts` used to fail the build if any token in `db/supabase/*.sql` was
unmapped or any mapped token was no longer raised. That suite was deleted on 2026-10-07 by owner instruction
(`docs/ARCHITECTURE.md` §13.5), so the table's totality over what the SQL can raise is now maintained by hand:
an unmapped token falls through to the generic refusal and a stale copy sits unused, and no run catches it —
the SQL half is still visible in the verifier, which asserts the specific token each refusal answers with.
A failure with no token is classified by PostgREST's own
SQLSTATE, and everything else falls back to `INTERNAL` with a message written here
(`door-errors.ts:259-288`; `docs/DECISIONS.md` D-20).

| `NIVAAS_*` token(s) | `AppError` code | HTTP | Category |
|---|---|---|---|
| `NIVAAS_NO_SESSION` | `AUTH_REQUIRED` | 401 | session |
| `NIVAAS_ACCOUNT_*` (family prefix, 008's format expansion) | `PERMISSION_DENIED` | 403 | account standing — an access-lost state |
| `NIVAAS_PROFILE_MISSING` | `RESOURCE_NOT_FOUND` | 404 | account standing |
| `NIVAAS_ACCESS_DENIED`, `NIVAAS_OWNER_ONLY`, `NIVAAS_NOT_A_MEMBER`, `NIVAAS_ROLE_ABOVE_AUTHORITY`, `NIVAAS_GRANT_OUTSIDE_SCOPE`, `NIVAAS_EMAIL_MISMATCH` | `PERMISSION_DENIED` | 403 | capability |
| `NIVAAS_NOT_FOUND`, `NIVAAS_ROLE_NOT_FOUND`, `NIVAAS_INVITATION_NOT_FOUND`, `NIVAAS_DEMO_ESTATE_MISSING` | `RESOURCE_NOT_FOUND` | 404 | lookup — and the enumeration answer (§40) |
| `NIVAAS_SCOPE_MISMATCH`, `NIVAAS_OUTLET_NOT_IN_PROPERTY` | `TENANT_SCOPE_MISMATCH` | 403 | tenancy integrity: a client should never see these; they mean a bug |
| `NIVAAS_INVALID_*`, `NIVAAS_EMPTY_SELECTION`, `NIVAAS_REASON_REQUIRED`, `NIVAAS_SELF_NOT_ALLOWED`, `NIVAAS_SELF_ASSIGN_DENIED`, `NIVAAS_DEPARTMENT_GRANTS_UNSUPPORTED`, `NIVAAS_ROLE_SCOPE_FORBIDDEN` | `VALIDATION_FAILED` | 422 | shape of the input |
| `NIVAAS_*_TAKEN`, `NIVAAS_ALREADY_*`, `NIVAAS_OWNER_MUST_TRANSFER`, `NIVAAS_VERSION_CONFLICT`, `NIVAAS_INVITATION_EXPIRED`, `NIVAAS_INVITATION_NOT_USABLE`, `NIVAAS_ORGANIZATION_NOT_ACTIVE`, `NIVAAS_ORGANIZATION_ARCHIVED`, `NIVAAS_MEMBER_NOT_ACTIVE`, `NIVAAS_PROPERTY_NOT_WRITABLE`, `NIVAAS_OUTLET_NOT_WRITABLE`, `NIVAAS_SYSTEM_ROLE_PROTECTED` | `CONFLICT` | 409 | lifecycle and uniqueness |
| `NIVAAS_AUDIT_IMMUTABLE`, `NIVAAS_MIGRATION_GAP`, `NIVAAS_SEED_MISSING`, `NIVAAS_ROLE_SEED_*`, `NIVAAS_PERMISSION_SEED_BROKEN`, `NIVAAS_PERMISSION_ORPHAN` | `INTERNAL` | 500 | server-side integrity — never a user's fault, never their detail to read |
| (GoTrue `429` / `over_email_send_rate_limit`) | `RATE_LIMITED` | 429 | sign-in link sending |
| (unrecognised) | `INTERNAL` | 500 | SQLSTATE fallback / default |

`src/lib/errors.ts:56-70` is the code → status table; `toPublicError` (lines 150-170) is the one-way
filter that never copies a foreign message, stack, SQLSTATE, driver string or file path.

**What an access-denied screen may say (§63) and what it may not.** It may say the *effect* in the
person's own terms — the nine `DENIAL_MESSAGES` sentences in `src/config/security.ts:41-51`, chosen by
reason code. `PERMISSION_DENIED` reads "You don't have permission to perform this action." (§63's
literal copy) and `NO_ACTIVE_MEMBERSHIP` reads "You no longer have active access to this
organization." — which is §18's rule that a person is told access *moved*, not handed the internal
distinction between no membership, a suspended membership and a retired tenant.

It may **not** display an internal permission key, a `NIVAAS_*` token, a seniority number, a ceiling,
another person's identity, or a reason whether the probed tenant exists. `authorize.test.ts` used to enforce
that no denial sentence contains a permission token or an internal token; that suite is deleted (2026-10-07,
`docs/ARCHITECTURE.md` §13.5) and nothing else checks the nine sentences, so **this is a live risk kept by hand
rather than a gate** — adding a token-bearing sentence to `DENIAL_MESSAGES` would ship unchallenged.
`ACCESS_LOST_REASON_BY_TOKEN` / `accessLostReason()` (`src/domain/auth/session-config.ts:94-112`)
translate tokens into reason codes so the store can recognise an account-standing state without ever
rendering the token; an unrecognised `NIVAAS_ACCOUNT_*` standing falls back to the generic
"no longer operational" reason rather than guessing a specific one. The `AccessLostScreen`
(`src/App.tsx`) shows the store's sentence and offers only a real sign-out — not a retry, because
retrying is not what a suspension needs. `AccessDenied`'s five-cause model (`no-session`,
`no-organization`, `no-data-plane`, `resolving`, `role`) refuses to say "denied by your role" on a
build that has no backend or no loaded grant set, since that would invent a server decision that never
happened (`docs/ARCHITECTURE.md` §13.4).

---

## 12. Readiness, not implementation

**MFA and step-up re-auth (Prompt #03 §42).** *What exists:* the session is carried entirely by
GoTrue, every sensitive door resolves the actor from that session via `app.require_session()` and
nothing else, and there is exactly one place the auth API is touched
(`src/domain/auth/auth-service.ts`). That is the seam a step-up provider can attach to without
retrofit. *What a future phase adds:* a per-sensitive-action "re-authenticate within N minutes"
predicate — most naturally an additional check inside `app.require_session` or a dedicated
`app.require_recent_auth` beside it, plus a step-up surface in the auth adapter and a reason code in
`ACCESS_DENIAL_REASONS`. **Not implemented: nothing in this repository checks authentication recency.**

**Auth rate limiting (Prompt #03 §69).** *What exists:* `sendSignInLink` maps GoTrue's `429` /
`over_email_send_rate_limit` to `RATE_LIMITED` with a "wait a minute" sentence
(`auth-service.ts:85-93`), so the app surfaces GoTrue's own email-send throttle honestly instead of
retrying into it. *What a future phase adds:* application-level limits on link requests per address
and per source, and any limit on door calls — neither is implemented here; the doors have no rate
component at all. **Not implemented: this product does not count or throttle requests itself.**

**Structured logging.** The shape is defined (what/when/where/which organization/which property/
which user/which request) and `docs/ARCHITECTURE.md` §12 still marks the writer **not yet built**;
nothing in `src/lib/audit.ts` ships log lines to a sink. No PII or token material is permitted in
logs, which is the same §68 rule the audit trail obeys.

**Platform administration.** `platform.manage` exists in the catalogue and is seeded on
PLATFORM_ADMIN only, and `app.is_platform_admin` honours a revoked GLOBAL grant (`008:174-191`). What
does **not** exist is any door that *uses* `platform.manage` — there is no impersonation surface, no
cross-tenant admin door and no support-access audit path yet. The capability is reserved, not wired.

---

## 13. The §82 chain, written out for three real actions

Prompt #03 §82 says the backbone of the product is
WHO → WHICH ORGANIZATION → WHICH PROPERTY → WHICH OUTLET → WHICH ROLE → WHICH PERMISSION → WHICH
RESOURCE → WHICH ACTION → WHICH AUDIT EVENT. Every future module must be expressible in that chain.
Here it is for three concrete actions, against the code that runs today.

### 13.1 A role assignment that is allowed

`assign_role(p_user, 'PROPERTY_MANAGER', org, property)` called by an ORG_OWNER.

| Link | Value |
|---|---|
| WHO | the session uuid — `app.require_session()` (`009:120`), never an argument; `008` also proved the profile is ACTIVE |
| WHICH TENANT | `p_organization`, after `require_permission('role.assign', …)` and `require_active_organization` (`009:126-127`) |
| WHICH ACTION | create a `user_roles` row |
| ON WHICH ENTITY | the grant `user_role` (its new uuid), narrowed to `p_property` because PROPERTY scope requires it (`009:173-177`) |
| WHICH CHANGE | `insert into user_roles (user_id, role_id, organization_id, property_id, outlet_id, granted_by)` (`009:190-196`) plus `membership_property_access` mode `SELECTED_PROPERTIES` so the role's site is actually reachable (`009:201-204`) |
| WHY ALLOWED | ladder of §4: role exists ACTIVE → not self → `seniority 60 <= ceiling 90` → not owner-class → grantee is an ACTIVE member → not DEPARTMENT → property supplied → `can_access_property(actor, property)` true |
| RESULT | `SUCCESS` — the change committed |
| WHEN | `created_at` from the server clock |
| FROM WHICH CONTEXT | the door's `p_property`, recorded on the audit row alongside the tenant |
| WITH WHAT REASON | `p_reason` if supplied; `NIVAAS_*` codes never reach the trail's `reason` column |
| WHICH AUDIT EVENT | two rows: `role_assigned` on `user_role` with `after = {user, role}` and `metadata = {actor_ceiling: 90, granted_seniority: 60}` (§31/§34 — the trail names the ladder it was checked against, and nothing secret), and `access_changed` with `metadata = {effect: 'granted', role}` (`009:218-225`) |

### 13.2 An invitation accept

`accept_invitation(token)` called by the invited person, whose email is `name@example.com`, on a link
that offers `PROPERTY_MANAGER` at one property.

| Link | Value |
|---|---|
| WHO | `app.require_session()` (`012:171`) — the person had to sign in through an emailed link first; §5's "who is this" is GoTrue's answer, not this door's |
| WHICH TENANT | `v_inv.organization_id`, taken from the **row**, never supplied by the caller |
| WHICH ACTION | join: create the membership, the breadth rows and one grant per scope target |
| ON WHICH ENTITY | `organization_memberships` + `user_roles`, `invitation` row flipped to `ACCEPTED` |
| WHICH CHANGE | membership `ACTIVE`; `membership_property_access` `SELECTED_PROPERTIES` (or `ALL_PROPERTIES` for a tenant-wide role); `membership_outlet_access` per the scope; `invitations.status = ACCEPTED`, `accepted_at`, `accepted_by` (`012:211-273`) |
| WHY ALLOWED | the walls before anything is written (`012:180-209`): token hash matches a row → `status = INVITED` → not expired (else flipped and `NIVAAS_INVITATION_EXPIRED`) → `require_active_organization` → role still ACTIVE → inviter is still a member or a platform admin → **and** the session's own `profiles.email` equals the invited address case-insensitively. The last wall is why an accept link grants nobody but its recipient |
| RESULT | `SUCCESS` |
| WHEN | `accepted_at = now()` on the row; `created_at` on the trail |
| FROM WHICH CONTEXT | the invitation carries `property_ids` / `outlet_ids`; the audit rows use the tenant, and the grant rows use each site |
| WITH WHAT REASON | none required — acceptance is the invited person's own act, not an administrator's decision; the *inviter* is who the trail attributes the grant to (`granted_by = v_inv.invited_by`) |
| WHICH AUDIT EVENT | `member_accepted` on `invitation` with `after = {role, scope}`, then one `role_assigned` row per created grant carrying `metadata = {via_invitation}` so a later "how did they get this?" has an answer (`012:275-284`) |

### 13.3 A discount attempt by someone without the permission

A RESTAURANT_MANAGER at one outlet tries to record a discount on a bill. This is the case that shows
both halves of the model, and it is the shape Prompt #04's restaurant doors will use.

`discount.manage` **is not in the catalogue and is not implemented** — restaurant permission keys arrive
with Prompt #04, and `permissions.test.ts` used to fail the build if this file claimed a token the SQL
never seeds; that suite was deleted on 2026-10-07 by owner instruction (`docs/ARCHITECTURE.md` §13.5), so this
catalogue is now checked against the seeds by hand, not by a build. So the chain below is written against what
the code does today: the malformed-but-shape-
correct token is refused at step 0, and the same walk applies verbatim once `discount.manage` exists
with `domain.verb` shape, because nothing in `evaluate_access` or `authorize()` depends on which
domain the key names.

| Link | Value |
|---|---|
| WHO | the manager's session uuid |
| WHICH TENANT | their ACTIVE membership's organization |
| WHICH ACTION | apply a discount to an order line |
| ON WHICH ENTITY | an outlet-scoped resource (the order/bill), inside their one outlet |
| WHICH CHANGE | **none** — nothing is written |
| WHY REFUSED | two independent refusals, and both are real. *Pre-flight:* `evaluate_access('<discount key>', org, property, outlet)` reaches step 0 (`p_permission` not in the grantable set as of today) or step 8 (`app.has_permission` false — RESTAURANT_MANAGER's seeded grants are `outlet.view`, `outlet.edit`, `department.view`, `department.edit`, `user.view` per `006_seed_rbac.sql:148-150`) and returns `{"allowed": false, "reason": "PERMISSION_DENIED"}`. *In-door:* the door's `app.require_permission('<discount key>', org, property, outlet)` raises `NIVAAS_ACCESS_DENIED` |
| RESULT | `DENIED` on the recorded row; a 403 for the caller (`PERMISSION_DENIED` → 403 in §11's table) |
| WHEN | `created_at` on the denial row, at the moment of the pre-flight |
| FROM WHICH CONTEXT | `requested_property` and `requested_outlet` are stored in the denial's `metadata`, so the trail answers *where they tried* |
| WITH WHAT REASON | `PERMISSION_DENIED` — kept in the log and a developer console; the person sees "You don't have permission to perform this action." and no key (§63) |
| WHICH AUDIT EVENT | `action = 'access_denied'`, `entity = 'access'`, `entity_id = <the permission key>`, `result = 'DENIED'`, `metadata = {reason, permission, requested_property, requested_outlet}` via `app.audit_access` (`010:121-138`) |

**And the gap that must not be papered over:** the denial row above exists *only* because the attempt
was pre-flighted through `evaluate_access`. The `NIVAAS_ACCESS_DENIED` raised by
`app.require_permission` in the door cannot record itself — raising aborts the transaction that
contains the insert (§6). So an in-door refusal is honest in its response code and silent in the
trail, and the recorder of denials is the pre-flight path. A module that wants its refusals in the
history must call `evaluate_access` before it calls the door; that is a per-module obligation, and
`docs/RESTAURANT_BUILD_CONTRACT.md` is where Prompt #04 accepts it.

---

## 14. Security assumptions

- Supabase's PostgREST serves RPCs from `public` only. The `app`/`public` split is the exposure
  boundary; a leaked `app.*` name is unexploitable over HTTP.
- A JWT is verified by GoTrue/PostgREST before any policy or door runs. `auth.uid()` is trustworthy
  because the platform, not the app, issues it.
- `set search_path = ''` on every SECURITY DEFINER function means an unqualified name cannot resolve
  to an attacker-controlled object; every cross-schema reference is written `app.` or `public.`
  explicitly.
- Migrations are applied by the owner or CI, never by the browser. The only key in a bundle is the
  publishable anon key; a service-role key in a browser bundle would hand the whole multi-tenant
  database to whoever opened devtools (`src/db/client.ts:9-22`).
- `007_seed_demo_dev.sql` is development-only and is **never** applied to a hosted project (its own
  README says so). Prompt #03 §56: demo credentials are marked demo-only, and none are committed here.
- One row per human at `profiles`; a missing profile is treated as not operational, since
  `app.handle_new_user()` guarantees a row for every GoTrue signup.

## 15. Known limitations

1. **A raising door cannot self-audit its refusal.** §6. Stated, not engineered around.
2. **No failed-sign-in row.** GoTrue owns that; a pre-session failure would require trusting an
   unauthenticated caller to write history (§8).
3. **No expiry/session-duration control in this application.** JWT lifetime, refresh cadence and
   invitation validity (`1-90` days, `012:98`) are the whole policy surface; §54's "session duration"
   is therefore only partly centralized.
4. **No rate limiting of our own.** §12.
5. **No MFA, step-up or recency check.** §12.
6. **`platform.manage` is reserved, not wired.** §12.
7. **Department-scope grants are refused, not resolved.** §7.
8. **`src/domain/identity/types.ts` lags the database's account vocabulary and profile columns.** §2.
   The database and `authorize.ts` are correct; the picker array is stale, and closing it is a code
   change (`docs/DECISIONS.md` D-34).
9. **The hosted project is verified structurally, not behaviourally.** `000`–`014` are applied to the real
   AMRUT NIVAAS Supabase project and re-read as 20/20 RLS tables, 50 doors, no unprotected table, an anonymous
   table read refused (401) and an anonymous door call refused by the door itself (`NIVAAS_NO_SESSION`) — see
   `db/harness/remote-apply.mjs check`. What has **not** happened there is a real session: no SMTP transport and
   no `site_url`, so no emailed magic link has ever been delivered or consumed (`docs/DECISIONS.md` O-8), the
   742-assertion `db/verify` file is local-only by rule, and `007`'s demo estate is deliberately absent. The
   session and invitation models are therefore proven at the SQL and door-funnel level, not over a live GoTrue.
10. **No PostgREST in the local harness**, so the wire contract between this client and these doors is
    exercised by neither. It used to be exercised by the stub transport in `src/db/rpc.ts`'s tests
    (`src/db/rpc.test.ts`), but that file was deleted on 2026-10-07 by owner instruction
    (`docs/ARCHITECTURE.md` §13.5); the client-side transport path is now **NOT_TESTED** — code reading only.
11. **`db/harness/remote-apply.mjs` uses the Management API with an operator token, and applies what it is
   told.** It hard-refuses the poultry project's ref and excludes `007` unless `--with-seed` is passed, but an
   applied migration on a hosted project cannot be un-applied by this tool — there is no downgrade path. Applies
   are planned (`plan`) before they are run, and the token is read only from the environment or the gitignored
   root `.env`.
