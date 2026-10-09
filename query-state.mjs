import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const envText = fs.readFileSync(".env", "utf8");
const env = Object.fromEntries(envText.split("\n").filter(Boolean).map((l) => {
  const [k, ...v] = l.split("=");
  return [k.trim(), v.join("=").trim()];
}));
const URL = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_ANON_KEY;
const sb = createClient(URL, KEY);

const { data: resolved, error: rerr } = await sb.rpc("resolve_login", { p_user_id: "OWNER001" });
if (rerr) { console.error("resolve_login", rerr.message); process.exit(1); }
const row = Array.isArray(resolved) ? resolved[0] : resolved;
const email = row.email;
const { data: sd, error: serr } = await sb.auth.signInWithPassword({ email, password: "Owner123!" });
if (serr) { console.error("signIn", serr.message); process.exit(1); }
console.log("Signed in as", sd.user.email, "userId=", sd.user.id);

const out = {};
async function q(name, table) {
  const { data, error, count } = await sb.from(table).select("*", { count: "exact" }).limit(3);
  out[name] = { count, sample: data?.slice(0, 2), error: error?.message };
}
await q("orgs", "organizations");
await q("props", "properties");
await q("outs", "outlets");
await q("sups", "suppliers");
await q("items", "inventory_items");
await q("cats", "inventory_categories");
await q("locs", "inventory_locations");
await q("pos", "purchase_orders");
await q("units", "units_of_measure");
await q("grns", "goods_receipts");
await q("inv", "purchase_invoices");
await q("pays", "supplier_payments");
await q("recipes", "recipes");
await q("stock_takes", "stock_takes");
console.log(JSON.stringify(out, null, 2));
