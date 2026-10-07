# AMRUT NIVAAS — database migrations

The tenant model for Prompt #02. Nothing here is decorative: every file was executed
against a real PostgreSQL 18.3 and attacked by `db/verify/tenant_isolation.sql`
(78 assertions, 9 scenarios) from a cold cluster before it was claimed to work.

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

They are ordered by dependency, not by preference. `000`'s helper bodies necessarily name
tables `001`/`002` create, so it turns `check_function_bodies` off for its own definitions
and resets it at the end — that is the only reason it can be applied first.

`007` is not applied to any hosted project. It exists so a seeded dev user can sign in and
see a tenant (real authentication lands in Prompt #03); `claim_demo_organization()` is
guarded so only a person with no organization can take the demo estate.

## The rules these files encode

- `authenticated` holds **SELECT only**. There is no client path to `INSERT`, `UPDATE`,
  `DELETE` or `TRUNCATE` on a tenant table — the grant is revoked, not merely denied by a
  policy. A write reaches the database through a door in `005` or not at all.
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
2. Enable RLS, grant SELECT, revoke DML, and add its SELECT policy **in `003`**.
3. Add its doors in `005`, and add the door names to the grant list there (that list
   resolves signatures from the catalog, so only the name has to be maintained).
4. Audit through `app.audit()`, never with a direct insert.
5. Add a scenario to `db/verify/tenant_isolation.sql` and re-run `rebuild`.

`003` is the completeness gate: it enumerates every tenant table in one place. If a table
is missing there, it has no protection.

## Harness vs hosted

```bash
./db/harness/local-pg.sh up        # throwaway cluster on /tmp, port 54329, no network
./db/harness/local-pg.sh apply     # db/harness/stub-supabase.sql, then 000..007
./db/harness/local-pg.sh verify    # db/verify/tenant_isolation.sql
./db/harness/local-pg.sh rebuild   # down, up, apply, verify — the only run that proves anything
./db/harness/local-pg.sh down      # delete the cluster
```

`db/harness/stub-supabase.sql` recreates the Supabase-managed objects the migrations
assume (API roles, `auth.users`, `auth.uid()`, the `extensions` schema). It is **never**
applied to a hosted project — Supabase already has all of it, and applying the stub there
would fight GoTrue over `auth.users`.

Against a hosted project, apply `000`–`006` in order through the dashboard SQL editor (or
`psql` with `PGSERVICE`), and skip `007` unless it is a scratch database. Keep the same
`ON_ERROR_STOP` discipline: `apply` stops at the first failure and records each filename in
`app.schema_migrations`, so a re-run skips what already landed instead of half-applying
twice.

## What this stage does not prove

- The client's cache/state isolation (§57–§59) — TypeScript, tested in `src/`.
- Real sign-in, token verification and the email delivery an invitation implies — Prompt #03.
- A hosted apply: the schema has been run against a local 18.3 mirror, not yet against the
  project these files will ship to.
