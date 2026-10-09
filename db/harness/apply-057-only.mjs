#!/usr/bin/env node
/*
 * One-off: apply ONLY db/supabase/057_route_guard_permission_grants.sql to the
 * hosted project and record it in app.schema_migrations. The shared ledger is
 * missing 050-054 (applied-but-unrecorded), so remote-apply.mjs would replay
 * them (051 is a seed) — 057 is grant-only and idempotent, applied alone.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import url from "node:url";

const REPO = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..", "..");
const ENV_FILE = path.join(REPO, ".env");

function readEnv(name) {
  if (process.env[name]) return process.env[name];
  if (!existsSync(ENV_FILE)) return null;
  const line = readFileSync(ENV_FILE, "utf8")
    .split("\n")
    .find((entry) => entry.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : null;
}

const base = readEnv("VITE_SUPABASE_URL");
const ref = base ? /https:\/\/([a-z0-9]+)\.supabase\.co/.exec(base)?.[1] : null;
if (!ref || ref === "pixipyqpcdnjddysdbea") {
  console.error("FAILED: no NIVAAS project ref in VITE_SUPABASE_URL");
  process.exit(1);
}
const token = readEnv("SUPABASE_ACCESS_TOKEN");
if (!token) {
  console.error("FAILED: no SUPABASE_ACCESS_TOKEN");
  process.exit(1);
}

async function query(sql) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 2000)}`);
  return text;
}

const sql = readFileSync(path.join(REPO, "db/supabase/057_route_guard_permission_grants.sql"), "utf8");
await query(sql);
console.log("apply  057_route_guard_permission_grants.sql");
await query(
  `insert into app.schema_migrations (name) values ('057_route_guard_permission_grants.sql')
   on conflict (name) do nothing`,
);
console.log("ledger recorded");
console.log(
  await query(
    `select r.name as role, count(*)::int as grants
     from public.role_permissions rp
     join public.roles r on r.id = rp.role_id
     where r.name in ('ORG_OWNER','ORG_ADMIN','PLATFORM_ADMIN','FINANCE_MANAGER','EVENT_MANAGER','HR_MANAGER')
       and rp.permission in ('analytics.finance.view','analytics.profitability.view','platform.dashboard.view','events.view','hr.view')
     group by r.name order by r.name`,
  ),
);
