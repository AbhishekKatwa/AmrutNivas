#!/usr/bin/env node
/*
 * Apply db/supabase/0*.sql to a HOSTED Supabase project through the Management API.
 *
 * `local-pg.sh` remains the schema's real proving ground: it builds a scratch cluster,
 * applies every migration and then runs the tenant-isolation verifier against it. A
 * hosted project gets no verifier step — `db/verify/tenant_isolation.sql` truncates
 * `audit_log` and seeds superuser fixtures, so pointed at anything but a scratch
 * cluster it would destroy real history rather than test it. This script applies,
 * records the same `app.schema_migrations` ledger, and stops.
 *
 *   node db/harness/remote-apply.mjs plan    # what would run, nothing more
 *   node db/harness/remote-apply.mjs apply --through 012   # only up to 012
 *   node db/harness/remote-apply.mjs apply   # applies unrun migrations in order
 *   node db/harness/remote-apply.mjs check    # ledger + table/door/RLS posture
 *
 * Add `--with-seed` to include 007, which is held back on purpose: its demo `profiles`
 * rows reference `auth.users(id)`, and on a hosted project that table belongs to
 * GoTrue, so the seed only lands once matching logins actually exist.
 *
 * The credential is `SUPABASE_ACCESS_TOKEN` — from the environment if set, else from
 * the gitignored root `.env`. It is a revocable account token, so revoke it when the
 * apply is done rather than letting it sit in the file.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import url from "node:url";

const DB_DIR = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.dirname(DB_DIR);
const ENV_FILE = path.join(REPO_ROOT, ".env");
const API = "https://api.supabase.com/v1";

/*
 * The live AMRUT POULTRY FARM tenant database. A NIVAAS migration run against it is
 * not recoverable by undoing a migration, so the ref is refused here rather than left
 * to whoever edits `.env` next.
 */
const FORBIDDEN_REF = "pixipyqpcdnjddysdbea";

const SEED_FILE = "007_seed_demo_dev.sql";

function readEnv(name) {
  if (process.env[name]) return process.env[name];
  if (!existsSync(ENV_FILE)) return null;
  const line = readFileSync(ENV_FILE, "utf8")
    .split("\n")
    .find((entry) => entry.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : null;
}

function projectRef() {
  const base = readEnv("VITE_SUPABASE_URL");
  const match = base ? /https:\/\/([a-z0-9]+)\.supabase\.co/.exec(base) : null;
  if (!match) {
    throw new Error(
      `VITE_SUPABASE_URL is missing or is not a *.supabase.co project URL (found in ${ENV_FILE}).`,
    );
  }
  if (match[1] === FORBIDDEN_REF) {
    throw new Error(
      `Refusing to run: ${match[1]} is the live poultry tenant database. ` +
        "Point .env at the AMRUT NIVAAS project.",
    );
  }
  return match[1];
}

function accessToken() {
  const token = readEnv("SUPABASE_ACCESS_TOKEN");
  if (!token) {
    throw new Error(
      "No SUPABASE_ACCESS_TOKEN. Export it, or add it to the gitignored root .env.",
    );
  }
  return token;
}

/** One Management-API call. A non-2xx answer is a failed migration, never a warning. */
async function query(ref, sql) {
  const response = await fetch(`${API}/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 2000)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function migrations(withSeed, through) {
  const files = readdirSync(path.join(DB_DIR, "supabase"))
    .filter((name) => /^0\d\d_.*\.sql$/.test(name))
    .sort();
  // `--through 012` exists because the newest migrations may still be under edit by
  // another work item: an applied migration is frozen, so shipping a file that then
  // changes leaves the hosted schema silently behind the local one.
  const capped = files.filter((name) => Number(name.slice(0, 3)) <= through);
  return withSeed ? capped : capped.filter((name) => name !== SEED_FILE);
}

function flagEnabled(name) {
  return process.argv.includes(name);
}

/** Highest numeric prefix to include, or 999 for everything on disk. */
function throughPrefix() {
  const index = process.argv.indexOf("--through");
  if (index === -1) return 999;
  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`--through wants a migration number, got "${process.argv[index + 1]}"`);
  }
  return value;
}

async function appliedNames(ref) {
  const rows = await query(
    ref,
    "select name from app.schema_migrations order by name",
  );
  return Array.isArray(rows) ? rows.map((row) => row.name) : [];
}

async function plan(ref, through) {
  let done = [];
  try {
    done = await appliedNames(ref);
  } catch {
    // Either the ledger does not exist yet (a fresh project, so nothing is applied) or
    // the credentials are wrong. Say which reading is uncertain rather than quietly
    // listing every migration as unapplied.
    console.log("note: the migration ledger could not be read; every file is listed as unapplied.");
  }
  console.log(`project ${ref}`);
  for (const name of migrations(flagEnabled("--with-seed"), through)) {
    console.log(`${done.includes(name) ? "skip  " : "apply "} ${name}`);
  }
}

async function apply(ref, through) {
  await query(
    ref,
    `create schema if not exists app;
create table if not exists app.schema_migrations (
  name text primary key, applied_at timestamptz not null default now()
);`,
  );
  const done = await appliedNames(ref);
  for (const name of migrations(flagEnabled("--with-seed"), through)) {
    if (done.includes(name)) {
      console.log(`skip   ${name} (already applied)`);
      continue;
    }
    // Each file is one request, recorded only after it returns 2xx, so an aborted run
    // resumes where it stopped instead of replaying a partial schema.
    await query(ref, readFileSync(path.join(DB_DIR, "supabase", name), "utf8"));
    await query(
      ref,
      `insert into app.schema_migrations (name) values ('${name}')
       on conflict (name) do nothing`,
    );
    console.log(`apply  ${name}`);
  }
}

async function check(ref) {
  console.log(await query(ref, "select name, applied_at from app.schema_migrations order by name"));
  console.log(
    await query(
      ref,
      `select count(*)::int as tables_total,
              count(*) filter (where relrowsecurity)::int as tables_with_rls
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'`,
    ),
  );
  console.log(
    await query(
      ref,
      `select count(*)::int as security_definer_doors
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef`,
    ),
  );
  // Any tenant table missing RLS is the defect the local matrix check guards against.
  console.log(
    await query(
      ref,
      `select c.relname
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not relrowsecurity
        order by 1`,
    ),
  );
}

const ref = projectRef();
const mode = process.argv[2];

try {
  if (mode === "plan") await plan(ref, throughPrefix());
  else if (mode === "apply") await apply(ref, throughPrefix());
  else if (mode === "check") await check(ref);
  else {
    console.error("usage: remote-apply.mjs <plan|apply|check> [--with-seed]");
    process.exit(2);
  }
} catch (error) {
  console.error(`FAILED: ${error.message}`);
  process.exit(1);
}
