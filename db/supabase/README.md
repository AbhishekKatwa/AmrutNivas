# AMRUT NIVAAS — database migrations

The tenant model, the security substrate and now the restaurant. Nothing here is decorative: every file
up to `014` was executed against a real PostgreSQL 18.3 and attacked by `db/verify/tenant_isolation.sql`
(195 assertions, 15 scenarios) from a cold cluster before it was claimed to work.
**`015`–`019` have not had that run.** They are written, each closes with its own self-check block, and no
harness or hosted apply after `014` is recorded for any of them — `docs/ACCEPTANCE-04.md` says so row by row.
Read them as design until `./db/harness/local-pg.sh rebuild` says otherwise.

## Apply order

| # | File | Creates |
|---|------|---------|
| 000 | `000_tenancy_helpers.sql` | `app` schema, extensions, the identity + access-resolution functions every policy calls |
| 001 | `001_business_hierarchy.sql` | `organizations`, `properties`, `outlets`, `departments` + chain/timezone triggers |
| 002 | `002_identity_access.sql` | `profiles`, `organization_memberships`, `roles`, `role_permissions`, `user_roles`, `membership_property_access`, `membership_outlet_access`, `invitations`, `user_active_contexts` |
| 003 | `003_rls.sql` | RLS enabled + one documented SELECT policy per table, and the privilege cuts |
| 004 | `004_audit.sql` | `audit_log`, its immutability trigger, and `app.audit()` — the only way history is written |
| 005 | `005_write_rpc.sql` | 11 guards in `app` (the eleventh being `blankable`, the clear-or-keep rule) + 24 `SECURITY DEFINER` write doors in `public`, then their catalog-resolved grants |
| 006 | `006_seed_rbac.sql` | 13 system roles, 25 `domain.verb` permissions, the role→permission matrix, self-checks |
| 007 | `007_seed_demo_dev.sql` | Development-only demo estate + `public.claim_demo_organization()` |
| 008 | `008_identity_hardening.sql` | Prompt #03 identity fixes + 1 door |
| 009 | `009_role_assignment_policy.sql` | The role ladder, self-grant limits, last-owner protection + 3 doors |
| 010 | `010_audit_outcomes.sql` | `audit_log.result`, `evaluate_access`, auth-event recording (2 doors) |
| 011 | `011_custom_roles.sql` | Tenant custom-role management (4 doors), `owner_class`/seniority pinned |
| 012 | `012_invitation_lifecycle.sql` | Invitation state rules, one pending per address, lazy expiry (3 doors) |
| 013 | `013_restaurant_permissions.sql` | The 27 restaurant `domain.verb` tokens, seeded onto the system roles; the ladder proved in-SQL |
| 014 | `014_restaurant_menu.sql` | The six menu tables and 19 menu doors, including the two priced reads |
| 015 | `015_restaurant_tables.sql` | `dining_areas`, `restaurant_tables`, their ordering, and the derived `restaurant_table_status` view — 9 doors |
| 016 | `016_restaurant_orders.sql` | `orders`, `order_items`, `order_item_modifiers`, the order state machine, `app.calculate_restaurant_totals` (the product's only money engine), the document-number counter and the outlet business-date resolver — 8 doors |
| 017 | `017_restaurant_calculation.sql` | `bills`, `payments`, payment immutability, the bill/payment chain asserts, SELECT grants + outlet policies — 5 doors |
| 018 | `018_restaurant_kot.sql` | `kitchen_order_tickets`, the fire and ticket ladders, the reprint counter, and a permission-drift self-check — 6 doors |
| 019 | `019_restaurant_day_overview.sql` | `restaurant_day_overview`: one outlet's trading day in a single read, gated on `restaurant.view`. No table — the day is a read model, and §2 of the build contract forbids a second place where money is decided |

They are ordered by dependency, not by preference. `000`'s helper bodies necessarily name
tables `001`/`002` create, so it turns `check_function_bodies` off for its own definitions
and resets it at the end — that is the only reason it can be applied first.

`007` is not applied to any hosted project. It exists so a seeded dev user can sign in and
see a tenant (real authentication lands in Prompt #03); `claim_demo_organization()` is
guarded so only a person with no organization can take the demo estate.

## The rules these files encode

- `authenticated` holds **SELECT only**. There is no client path to `INSERT`, `UPDATE`,
  `DELETE` or `TRUNCATE` on a tenant table — the grant is revoked, not merely denied by a
  policy. A write reaches the database through a door (`005`, then `008`–`019`) or not at all.
- Doors are `security definer` with `set search_path = ''`, re-prove membership before
  acting on an id, and return the written row as `jsonb` so no second read can race it.
- Every door calls `app.audit(...)`. History is append-only: a trigger refuses UPDATE and
  DELETE for every role, including the table owner, because a privilege check would not
  fire for a superuser where a trigger does.
- Identity comes from `auth.uid()`. The `app.user_id` GUC override is gated on
  `session_user`, so PostgREST (which logs in as `authenticator`) can never reach it while
  the harness and verifier can.
- Access is a *membership row*, never a column on `profiles`, and breadth
  (property/outlet) is separate from capability (`domain.verb` permissions). The widest
  applicable grant wins; an outlet carve-out narrows only outlet-bound rows.
- Archive, never hard-delete: `status` + `archived_at` on the hierarchy tables, and the
  doors refuse to add rows to a retired tenant.

## Adding a table

A new tenant table without a policy is a table nobody can read — or, if RLS is simply not
enabled, one everybody can. So:

1. Create it with `organization_id` denormalized and a chain trigger, as `001` does.
2. In **its own module migration**, revoke `anon` entirely, revoke `insert/update/delete/truncate` from
   `authenticated`, grant it SELECT, enable RLS and add the `<table>_outlet_read` policy. That is what `015`–`018`
   each do for their own tables; `003` can only cover what existed when `003` ran.
3. Add its doors **in the same migration**, with the catalog-resolved grant loop at the end (it reads
   signatures from `pg_proc`, so only the door names have to be maintained).
4. Audit through `app.audit()`, never with a direct insert.
5. Add a scenario to `db/verify/tenant_isolation.sql` and re-run `rebuild`. **Step 5 is the one `015`–`019`
   have not done**, which is why the restaurant is documented as unverified rather than working.

`003` is the gate for the tables it knows: it enumerates them in one place. A module table that carries no
policy of its own and is absent from `003` has no protection — which is why the per-migration rule in step 2
exists, and why every restaurant migration closes with a self-check that reads the catalog for its own tables,
indexes, door signatures and (in `017` and `019`) grants.

## Harness vs hosted

```bash
./db/harness/local-pg.sh up        # throwaway cluster on /tmp, port 54329, no network
./db/harness/local-pg.sh apply     # db/harness/stub-supabase.sql, then every db/supabase/0*.sql in
                                   # filename order (000–019 today; a new migration is picked up by the glob)
./db/harness/local-pg.sh verify    # db/verify/tenant_isolation.sql
./db/harness/local-pg.sh rebuild   # down, up, apply, verify — the only run that proves anything
./db/harness/local-pg.sh down      # delete the cluster
```

`db/harness/stub-supabase.sql` recreates the Supabase-managed objects the migrations
assume (API roles, `auth.users`, `auth.uid()`, the `extensions` schema). It is **never**
applied to a hosted project — Supabase already has all of it, and applying the stub there
would fight GoTrue over `auth.users`.

Against a hosted project, apply `000`–`019` in order through the dashboard SQL editor (or
`psql` with `PGSERVICE`), and skip `007` unless it is a scratch database. Keep the same
`ON_ERROR_STOP` discipline: `apply` stops at the first failure and records each filename in
`app.schema_migrations`, so a re-run skips what already landed instead of half-applying
twice.

## What has not been proved

- **`015`–`019`.** Neither the harness nor the hosted project has an apply recorded past `014`, so the entire
  restaurant substrate — tables, orders, bills, payments, KOTs and the day read — is design plus in-file
  self-checks. A `rebuild` is the first thing that will tell us whether any of it parses.
- **No verifier scenario covers a restaurant table.** The 15 scenarios stop at `014`; `bills`, `payments`,
  `order_items`, `kitchen_order_tickets` and `restaurant_day_overview` have no cross-tenant attack recorded yet.
- The client's cache/state isolation (§57–§59) is TypeScript, tested in `src/` — but no restaurant screen has
  been loaded in a browser, and Prompt #04 adds no tests by instruction.
- **The printing decision (O-1) is still open**, and KOT without a print path is a queue on one screen rather
  than a ticket in a kitchen.
