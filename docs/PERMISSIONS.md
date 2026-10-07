# AMRUT NIVAAS — Permission catalogue

This is the catalogue as an administrator reads it: every capability the database can actually grant,
what it allows, which system roles hold it, and which a tenant may put on a custom role. Prompt #03
§58 requires this file. The security reasoning behind it — enforcement, scope resolution, the denial
ladder — is in [SECURITY.md](./SECURITY.md).

**One source of truth, diffed against the SQL.** The grantable set is the distinct
`role_permissions.permission` values in the migrations: 25 seeded by `db/supabase/006_seed_rbac.sql`
(which self-checks `count(*) = 25`) plus `role.create` and `role.edit` inserted by
`db/supabase/011_custom_roles.sql` — 27 total. The client labels them in
`PERMISSION_CATALOGUE` (`src/domain/identity/permissions.ts`) and `permissions.test.ts` re-reads both
SQL files and diffs them against that list **in both directions**, so a seed that gains or drops a
token fails the build instead of shipping a button the doors refuse, or a document naming a capability
nobody can grant. The answer to "may I?" never comes from this page or from that file — it comes from
`my_permissions` / `evaluate_access` server-side.

**Format.** Every key is `domain.verb`: one lowercase segment, one dot, one verb, enforced by the 002
column CHECK and mirrored once as `PERMISSION_PATTERN` (`src/domain/identity/types.ts:373`). A
well-shaped but unseeded key is still refused — `isPermissionKey()` requires membership in the
catalogue, because the donor shipped gates on tokens no role could ever hold.

**Not yet in the catalogue (do not gate on these):** `audit.export` (Prompt #03 §58's example — only
`audit.view` is seeded), every restaurant capability (`menu.*`, `table.*`, `order.*`, `kitchen.*`,
`discount.*`) which arrives with **Prompt #04**, `organization.manageUsers` (deliberately not seeded —
it is a bundle of `user.invite`/`user.suspend`/`user.remove`/`role.assign` that the doors already
check individually), and any `department`-scoped grant (department *keys* exist, but a role scoped to
DEPARTMENT cannot be granted — see SECURITY.md §7).

---

## The 27 permissions

"Holds it" lists the system roles seeded with the key (`006` matrix, plus `role.create`/`role.edit`
from `011`). A `PLATFORM_ADMIN` additionally resolves **all 27** through the whole-catalogue arm of
`my_permissions` (`008:289-295`), even though only four are seeded on it.

### Organization

| Key | Allows | System roles that hold it | Tenant-definable? |
|---|---|---|---|
| `organization.view` | See the group's own profile, settings and structure | PLATFORM_ADMIN, ORG_OWNER, ORG_ADMIN, FINANCE_MANAGER, HR_MANAGER | Yes |
| `organization.edit` | Change the group's name, contact details and working settings | ORG_OWNER, ORG_ADMIN | Yes |
| `organization.archive` | Retire the whole group so nobody can work in it any more | ORG_OWNER (+ PLATFORM_ADMIN) | Yes, but the door also demands the owner seat |

`organization.archive` is gated twice: `set_organization_status` asks the permission **and** requires
`is_owner` or the platform, else `NIVAAS_OWNER_ONLY` (`005:380-388`). A custom role can hold the key
and still not be able to use it.

### Property

| Key | Allows | System roles that hold it | Tenant-definable? |
|---|---|---|---|
| `property.view` | See a property's details, status and place in the group | ORG_OWNER, ORG_ADMIN, GENERAL_MANAGER, PROPERTY_MANAGER, FINANCE_MANAGER, HR_MANAGER | Yes |
| `property.create` | Add a new property to the group | ORG_OWNER, ORG_ADMIN | Yes |
| `property.edit` | Change a property's details and status | ORG_OWNER, ORG_ADMIN, GENERAL_MANAGER, PROPERTY_MANAGER | Yes |
| `property.archive` | Retire a property so no new work is done at that site | ORG_OWNER, ORG_ADMIN | Yes |
| `property.manage_access` | Decide which people may reach which properties | ORG_OWNER, ORG_ADMIN, PROPERTY_MANAGER | Yes |

### Outlet

| Key | Allows | System roles that hold it | Tenant-definable? |
|---|---|---|---|
| `outlet.view` | See an outlet's details and status | ORG_OWNER, ORG_ADMIN, GENERAL_MANAGER, PROPERTY_MANAGER, RESTAURANT_MANAGER, KITCHEN_MANAGER, HOUSEKEEPING_MANAGER, FINANCE_MANAGER, STORE_MANAGER, EVENT_MANAGER, STAFF | Yes |
| `outlet.create` | Add a new outlet inside a property | ORG_OWNER, ORG_ADMIN, GENERAL_MANAGER, PROPERTY_MANAGER | Yes |
| `outlet.edit` | Change an outlet's details and status | ORG_OWNER, ORG_ADMIN, GENERAL_MANAGER, PROPERTY_MANAGER, RESTAURANT_MANAGER, EVENT_MANAGER | Yes |
| `outlet.archive` | Retire an outlet so it stops trading | ORG_OWNER, ORG_ADMIN | Yes |
| `outlet.manage_access` | Decide which people may reach which outlets inside a property | ORG_OWNER, ORG_ADMIN, PROPERTY_MANAGER | Yes |

### Department

| Key | Allows | System roles that hold it | Tenant-definable? |
|---|---|---|---|
| `department.view` | See the departments and teams a property or outlet runs | ORG_OWNER, ORG_ADMIN, GENERAL_MANAGER, PROPERTY_MANAGER, RESTAURANT_MANAGER, KITCHEN_MANAGER, HOUSEKEEPING_MANAGER, STORE_MANAGER, EVENT_MANAGER | Yes |
| `department.create` | Add a new department | ORG_OWNER, ORG_ADMIN, GENERAL_MANAGER, PROPERTY_MANAGER | Yes |
| `department.edit` | Change a department's details and status | ORG_OWNER, ORG_ADMIN, GENERAL_MANAGER, PROPERTY_MANAGER, RESTAURANT_MANAGER, KITCHEN_MANAGER | Yes |
| `department.archive` | Retire a department | ORG_OWNER, ORG_ADMIN | Yes |

These four are the department *capability* keys and they are fully enforced at the department doors.
They are not the same thing as a DEPARTMENT-scope **grant**: `assign_role` refuses to grant any role
whose `scope_level` is DEPARTMENT (`NIVAAS_DEPARTMENT_GRANTS_UNSUPPORTED`), because `my_permissions`
resolves grants at organization/property/outlet only. SECURITY.md §7 explains why this is a decision,
not a bug.

### User

| Key | Allows | System roles that hold it | Tenant-definable? |
|---|---|---|---|
| `user.view` | See the people who belong to the group and how they are standing | ORG_OWNER, ORG_ADMIN, GENERAL_MANAGER, PROPERTY_MANAGER, RESTAURANT_MANAGER, HR_MANAGER | Yes |
| `user.invite` | Invite new people into the group | ORG_OWNER, ORG_ADMIN, GENERAL_MANAGER, PROPERTY_MANAGER, HR_MANAGER | Yes |
| `user.suspend` | Pause a person's access to the group without removing them | ORG_OWNER, ORG_ADMIN, PROPERTY_MANAGER, HR_MANAGER | Yes |
| `user.remove` | Take a person out of the group entirely | ORG_OWNER, ORG_ADMIN, HR_MANAGER | Yes |

`user.suspend` / `user.remove` are the permissions `set_member_status` asks depending on the target
status (`009:322`). Both refuse to act on the owner's membership without a prior ownership transfer,
and both refuse to let anyone retire themselves (`NIVAAS_SELF_NOT_ALLOWED`).

### Role

| Key | Allows | System roles that hold it | Tenant-definable? |
|---|---|---|---|
| `role.view` | See the roles that exist and what each one lets its holder do | ORG_OWNER, ORG_ADMIN, GENERAL_MANAGER, PROPERTY_MANAGER, HR_MANAGER | Yes |
| `role.create` | Invent a new role for this group, granting only capabilities you already hold | ORG_OWNER, ORG_ADMIN | Yes |
| `role.edit` | Rename, re-describe, re-permission or retire a custom role of this group | ORG_OWNER, ORG_ADMIN | Yes |
| `role.assign` | Give or revoke roles for the group's people | ORG_OWNER, ORG_ADMIN, HR_MANAGER | Yes |

`role.create`/`role.edit`/`role.assign` are the escalation-sensitive trio. Every one of them is
ladder-checked in the door: `assign_role` refuses anything above your ceiling or owner-class
(SECURITY.md §4), and `create_role`/`set_role_permissions` refuse any permission you do not yourself
hold. `role.create` is deliberately separate from `role.assign` so that "may I hand out roles" and
"may I invent authority" are not the same answer.

### Audit

| Key | Allows | System roles that hold it | Tenant-definable? |
|---|---|---|---|
| `audit.view` | Read the audit trail of who did what, when, and for what reason | ORG_OWNER, ORG_ADMIN, GENERAL_MANAGER, PROPERTY_MANAGER, FINANCE_MANAGER (+ PLATFORM_ADMIN) | Yes |

Reading the trail is actually governed by RLS today (`audit_tenant_read`, `004:112-120`): anyone who
can see the tenant can read its history, plus their own footprint. `audit.view` exists as a narrower
capability for the UI to show history to fewer people than full membership; `audit.export` is not
implemented.

### Platform

| Key | Allows | System roles that hold it | Tenant-definable? |
|---|---|---|---|
| `platform.manage` | Operate the AMRUT NIVAAS platform itself, including administration of any tenant | PLATFORM_ADMIN | **No** — GLOBAL scope is refused by `create_role` (`NIVAAS_ROLE_SCOPE_FORBIDDEN`) |

`platform.manage` is a **reserved, not-yet-wired** capability: no door reads it today. It exists so a
future support/administration surface has a token to gate on rather than inventing one (SECURITY.md
§12).

---

## What a tenant can define

A custom role (`011`) can hold any catalogue key **the creating actor already holds in that tenant**
— that is the subset rule in `app.ungrantable_permission`, and it is what makes a tenant-defined
"Night Auditor" unable to exceed its creator. The three structural limits (SECURITY.md §4):

- A custom role can never be `owner_class`, so no custom role can mint an ORG_OWNER or
  PLATFORM_ADMIN.
- Its `seniority` is pinned to the creator's own ceiling, so it can be granted by their peers and
  never promoted above them by editing its permissions.
- Its scope is ORGANIZATION, PROPERTY or OUTLET — never GLOBAL, and DEPARTMENT cannot be granted.

So `platform.manage` is the only key that is not tenant-definable in practice (a tenant role cannot be
GLOBAL), and the two owner seats are unreachable through any tenant-defined role regardless of which
keys it lists.

## Sensitive actions requiring a reason and a confirmation (Prompt #03 §31)

A **reason** (`p_reason`) is mandatory at the door for these — the door raises
`NIVAAS_REASON_REQUIRED` and refuses without it. Confirmation is a UI obligation (`docs/SECURITY.md`
§11 says what the screen may show); the reason is the server-enforced half.

| Action | Door | Why the reason is mandatory |
|---|---|---|
| Grant a new role, or change who reaches what | `create_role`, `set_role_permissions` | creating or widening authority |
| Revoke a role grant | `revoke_role` | taking authority away must be explainable |
| Retire a tenant / change an owner | `set_organization_status`, `transfer_ownership` | the whole business, or its accountability |
| Suspend or remove a person | `set_member_status` | a person's access |
| Retire a property / outlet / department | `set_property_status`, `set_outlet_status`, `set_department_status` | archive is a business decision |
| Withdraw an invitation | `cancel_invitation` | a grant being taken back (recorded as CANCELLED by the inviter, REVOKED by anyone else — SECURITY.md §8) |
| Edit a custom role's label/description, or retire it | `update_role`, `set_role_status` | changing what a role means, or ending it |

Two access-changing doors accept an **optional** reason and record it in the trail when given but do
not demand one: `assign_role` (the grant itself is audited with the ladder it was checked against) and
`set_property_access` / `set_outlet_access` (breadth changes emit `access_changed`). Future
sensitive-action gates for money figures — price change, voided bill, stock adjustment, folio
correction, period reopen — arrive with those modules (`docs/ARCHITECTURE.md` §6, `docs/DOMAIN_MODEL.md`
invariant #7); they are not enforceable yet because those figures do not exist.

## Extending the catalogue (for later prompts)

Add a token by seeding it into `role_permissions` in a numbered migration **and** adding the matching
entry to `PERMISSION_CATALOGUE`, then re-run `permissions.test.ts`. The test is the contract: a token
in the SQL with no client entry, or a client entry with no SQL, fails the build. New first segments
also extend `PermissionDomain` in `permissions.ts`. Do not invent arbitrary permission patterns — the
domains present today are `organization · property · outlet · department · user · role · audit ·
platform`, and Prompt #04 will add the restaurant domains on the same `domain.verb` shape.
