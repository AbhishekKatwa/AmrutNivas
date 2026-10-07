# AMRUT NIVAAS — Permission catalogue

This is the catalogue as an administrator reads it: every capability the database can actually grant,
what it allows, which system roles hold it, and which a tenant may put on a custom role. Prompt #03
§58 requires this file. The security reasoning behind it — enforcement, scope resolution, the denial
ladder — is in [SECURITY.md](./SECURITY.md).

**One source of truth, diffed against the SQL.** The grantable set is the distinct
`role_permissions.permission` values in the migrations: 25 seeded by `db/supabase/006_seed_rbac.sql`
(which self-checks `count(*) = 25`) plus `role.create` and `role.edit` inserted by
`db/supabase/011_custom_roles.sql` — 27 for Prompt #03 — plus the 27 restaurant tokens seeded by
`db/supabase/013_restaurant_permissions.sql` (which self-checks its own count *and* the resulting total
of 54). 54 in all. The client labels them in `PERMISSION_CATALOGUE`
(`src/domain/identity/permissions.ts`) and `permissions.test.ts` re-reads all three SQL files and diffs
them against that list **in both directions**, so a seed that gains or drops a token fails the build
instead of shipping a button the doors refuse, or a document naming a capability nobody can grant. The
answer to "may I?" never comes from this page or from that file — it comes from `my_permissions` /
`evaluate_access` server-side.

**Format.** Every key is `domain.verb`: one lowercase segment, one dot, one verb, enforced by the 002
column CHECK and mirrored once as `PERMISSION_PATTERN` (`src/domain/identity/types.ts:373`). A
well-shaped but unseeded key is still refused — `isPermissionKey()` requires membership in the
catalogue, because the donor shipped gates on tokens no role could ever hold. Prompt #04 §5 writes its
keys in three segments (`restaurant.menu.view`); the CHECK refuses a second dot at insert time, so
`013` flattens them to `menu.view` — the same treatment `property.manage_access` and
`outlet.manage_access` already give a parent concept: prefix, not level.

**Not yet in the catalogue (do not gate on these):** `audit.export` (Prompt #03 §58's example — only
`audit.view` is seeded), `organization.manageUsers` (deliberately not seeded — it is a bundle of
`user.invite`/`user.suspend`/`user.remove`/`role.assign` that the doors already check individually),
and any `department`-scoped grant (department *keys* exist, but a role scoped to DEPARTMENT cannot be
granted — see SECURITY.md §7). There is no `kitchen.*` or `discount.*` family and never will be: the
verbs are `kot.*`, and discounting is a named verb on the thing being discounted
(`order.discount`/`bill.discount`).

---

## The 54 permissions

"Holds it" lists the system roles seeded with the key (`006` matrix, `role.create`/`role.edit` from
`011`, and the restaurant ladder from `013`). A `PLATFORM_ADMIN` additionally resolves **all 54**
through the whole-catalogue arm of `my_permissions` (`008:289-295`), even though only four are seeded
on it; `013` therefore grants it no restaurant token explicitly.

For the restaurant tables below, `ORG_OWNER · ORG_ADMIN · GENERAL_MANAGER · PROPERTY_MANAGER ·
RESTAURANT_MANAGER` hold **every one of the 27 tokens**, so they are not repeated row by row. The
abbreviations list the partial holders: **KM** = KITCHEN_MANAGER (7), **ST** = STAFF (11),
**EM** = EVENT_MANAGER (14), **FM** = FINANCE_MANAGER (5). HOUSEKEEPING_MANAGER, STORE_MANAGER and
HR_MANAGER hold no restaurant token — their remit does not include the floor.

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

### Restaurant — Prompt #04 (`013`)

`restaurant.view` is the entry door: it opens the module for the outlets a person can reach, and each
area below then answers for itself.

All 27 tokens are now named by a real door: `014` menu, `015` floors and tables, `016` orders, `017` bills and
payments, `018` KOT, `019` the day read. Two caveats the tables below do not change: those five migrations have
not been applied to a database yet, so the enforcement is written rather than proven; and `bill.discount` and
`order.discount` still have **no door behind them** — a role can hold the capability and nothing in the product
can yet act on it (`docs/ACCEPTANCE-04.md` §6.6).

| Key | Allows | Also held by |
|---|---|---|
| `restaurant.view` | Open the restaurant module for the outlets you can reach | KM, ST, EM, FM |

**Menu.** `menu.edit` is the availability door and `menu.publish` is the price-and-service door; the
split is why a kitchen manager can mark a dish out of stock without being able to change what it costs
the counter.

| Key | Allows | Also held by |
|---|---|---|
| `menu.view` | See the menu: categories, items, modifiers and prices | KM, ST, EM, FM |
| `menu.create` | Add categories, items, modifier groups and modifiers | EM |
| `menu.edit` | Change a menu item's details, availability and pricing | KM, EM |
| `menu.archive` | Retire a category or item so it can no longer be ordered | EM |
| `menu.publish` | Put a menu or price change in front of the counter for service | — |

**Table.**

| Key | Allows | Also held by |
|---|---|---|
| `table.view` | See the floor plan, its tables and how each one stands | ST, EM |
| `table.create` | Add dining areas and tables to an outlet's floor | EM |
| `table.edit` | Change a table's name, capacity, position or display order | EM |
| `table.archive` | Retire a table so it stops showing on the floor | — |

**Order.** `order.cancel` and `order.void` are separate verbs on purpose: #04 §53 treats a void as the
more sensitive reversal, so a role that may cancel an order must be granted the reversal on its own
terms.

| Key | Allows | Also held by |
|---|---|---|
| `order.view` | See orders with their items, amounts and current status | ST, EM, FM |
| `order.create` | Open a new order and add items to it | ST, EM |
| `order.edit` | Change an order while its status still allows the change | ST, EM |
| `order.cancel` | Cancel an order at a stage where cancellation is permitted | — |
| `order.discount` | Apply a percentage or fixed discount to an order or a line | — |
| `order.void` | Void an order — a privileged reversal, taken for a recorded reason | — |

**KOT** (kitchen order tickets).

| Key | Allows | Also held by |
|---|---|---|
| `kot.view` | See kitchen order tickets and how far each has come | KM, EM |
| `kot.create` | Send an order's items to the kitchen as a KOT | KM, ST, EM |
| `kot.reprint` | Reprint a ticket for the pass | KM |
| `kot.cancel` | Cancel a ticket the kitchen has not served | KM |

**Bill.**

| Key | Allows | Also held by |
|---|---|---|
| `bill.view` | See a bill and its lines, discounts and totals | ST, EM, FM |
| `bill.create` | Open a bill for an order | ST |
| `bill.discount` | Discount a bill | — |
| `bill.void` | Void a bill — a privileged reversal, taken for a recorded reason | — |

**Payment.**

| Key | Allows | Also held by |
|---|---|---|
| `payment.view` | See payments taken against a bill | ST, FM |
| `payment.create` | Take a payment | ST |
| `payment.refund` | Refund a payment — a privileged reversal, taken for a recorded reason | — |

The seed asserts its own ladder (`013:193-251`), so a half-applied grant table fails the migration
rather than quietly handing a kitchen the till:

- KITCHEN_MANAGER and STAFF hold **none** of `payment.refund`, `order.discount`, `order.void`,
  `bill.void`, `bill.discount` (`NIVAAS_PERMISSION_LADDER_BROKEN`).
- KITCHEN_MANAGER holds **no money verb at all** — not even the `bill.view`/`payment.view` reads — and
  cannot `menu.publish`.
- STAFF can open a bill and take a payment but never void one.

The five reversals above (`order.discount`, `order.void`, `bill.discount`, `bill.void`,
`payment.refund`) and `menu.publish`/`table.archive` therefore stop at manager level and above. Note
that FM reads the money but does not move it: a refund is an outlet's operational act, not a
back-office one.

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
domains present today are `organization · property · outlet · department · restaurant · menu · table ·
order · kot · bill · payment · user · role · audit · platform`, all on the same `domain.verb` shape.
A later prompt that adds an area adds verbs inside it; the 002 CHECK is what keeps a three-segment key
from ever reaching the database.
