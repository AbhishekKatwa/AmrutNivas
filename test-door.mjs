import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(".env", "utf8").split("\n").filter(Boolean).map((l) => {
  const [k, ...v] = l.split("="); return [k.trim(), v.join("=").trim()];
}));
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const { data: r } = await sb.rpc("resolve_login", { p_user_id: "OWNER001" });
const row = Array.isArray(r) ? r[0] : r;
await sb.auth.signInWithPassword({ email: row.email, password: "Owner123!" });
// Try to call create_unit with both styles
const { data: d1, error: e1 } = await sb.rpc("create_unit", { p_organization: "936c73c5-c0f2-4e3f-ae14-8fa4dd974c06", p_name: "TEST_UNIT_KEYS", p_code: "TUK1" });
console.log("p_organization direct:", d1, e1?.message);
const { data: d2, error: e2 } = await sb.rpc("create_unit", { organization: "936c73c5-c0f2-4e3f-ae14-8fa4dd974c06", name: "TEST_UNIT_CAMEL", code: "TUK2" });
console.log("organization direct:", d2, e2?.message);
