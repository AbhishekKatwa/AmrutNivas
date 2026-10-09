// build_056.mjs — generate 056_hotel_audit_calls.sql from 034–039.
//
// The hotel-domain doors (034 room types/rooms/blocks, 035 rate plans, 036
// reservations, 037 stays, 038 folios, 039 housekeeping/maintenance) call
// app.audit(...) in a seven-argument positional shape whose slot 6 carries a
// property uuid. 054 installed the canonical row-image overload with slot 6 as
// a text reason and documented (in its header) that uuid-slot-6 callers stay
// unresolved until their phase fixes them. A sibling uuid-slot-6 overload is
// impossible: 028–033/041 pass untyped null in that slot, and two overloads
// differing only there make every such call ambiguous (42725).
//
// So 056 re-creates each affected door verbatim with one change per audit
// call: the property-uuid slot-6 expression becomes null. The canonical funnel
// derives organization (and carries property_id) from the row image the door
// already passes, so nothing is lost. Only doors containing a rewritten call
// are re-created; currently-working doors outside 034–039 are never touched.
//
// Usage: node db/build_056.mjs           → writes db/supabase/056_hotel_audit_calls.sql
//        node db/build_056.mjs --check   → analysis only, prints slot map, writes nothing

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const files = [
  "034_room_types_rooms_blocks",
  "035_rate_plans_room_rates",
  "036_reservations_rate_snapshots",
  "037_stays_checkin_checkout",
  "038_folios_charges",
  "039_housekeeping_maintenance",
];

const CHECK = process.argv.includes("--check");

// Balanced-paren scan that respects single-quoted SQL string literals
// (including '' escapes) and line comments.
function scanCall(src, openParen) {
  let depth = 0;
  let i = openParen;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === "'") {
      i++;
      while (i < src.length) {
        if (src[i] === "'") {
          if (src[i + 1] === "'") { i++; } else break;
        }
        i++;
      }
    } else if (ch === "(") depth++;
    else if (ch === ")") { depth--; if (depth === 0) return i; }
  }
  throw new Error("unbalanced parens");
}

function splitArgs(s) {
  const out = [];
  let d = 0, cur = "", inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      cur += c;
      if (c === "'") {
        if (s[i + 1] === "'") { cur += s[++i]; } else inStr = false;
      }
      continue;
    }
    if (c === "'") { inStr = true; cur += c; continue; }
    if (c === "(") d++;
    if (c === ")") d--;
    if (c === "," && d === 0) { out.push(cur.trim()); cur = ""; } else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// Extract the full `create or replace function public.name(...)` block that
// contains `pos`: from the statement start through its closing `$$;`.
function doorBlock(src, pos) {
  const start = src.lastIndexOf("create or replace function public.", pos);
  if (start < 0) throw new Error("no door start before audit at " + pos);
  const end = src.indexOf("$$;", pos);
  if (end < 0) throw new Error("no $$; after audit at " + pos);
  return { start, end: end + 3 };
}

const report = [];
const doors = new Map(); // name -> { file, sql }

for (const f of files) {
  const src = readFileSync(join(here, "supabase", f + ".sql"), "utf8");
  let idx = 0;
  let callNo = 0;

  // Group this file's audit calls by their containing door block so a door
  // with several calls is rebuilt once, with every call fixed.
  const blocksInFile = new Map(); // blockStart -> { end, name, callPositions: [] }
  const callsInFile = [];
  while (true) {
    const m = src.indexOf("perform app.audit(", idx);
    if (m < 0) break;
    const open = m + "perform app.audit".length;
    const close = scanCall(src, open);
    const args = splitArgs(src.slice(open + 1, close));
    if (args.length !== 7) {
      throw new Error(f + " call #" + callNo + " has " + args.length + " args, expected 7");
    }
    const slot4 = args[3].replace(/\s+/g, " ");
    const slot6 = args[5].replace(/\s+/g, " ");
    const needsFix = !/^null$/i.test(slot6);
    report.push({ file: f, call: callNo, argc: args.length, slot4, slot6, needsFix });
    if (needsFix) {
      const block = doorBlock(src, m);
      const name = src.slice(block.start, src.indexOf("(", block.start))
        .replace("create or replace function public.", "").trim();
      const entry = blocksInFile.get(block.start) ??
        { end: block.end, name, callPositions: [] };
      entry.callPositions.push({ callStart: m, callEnd: close, args });
      blocksInFile.set(block.start, entry);
    }
    idx = close;
    callNo++;
  }

  // Emit each affected block once. Files are processed in order and a later
  // file may supersede an earlier door of the same name (039's check_out
  // replaces 037's) — the replacement wins.
  for (const [blockStart, entry] of [...blocksInFile.entries()]
    .sort((a, b) => a[1].callPositions[0].callStart - b[1].callPositions[0].callStart)) {
    let sql = src.slice(blockStart, entry.callPositions[0].callStart);
    let cursor = entry.callPositions[0].callStart;
    for (const c of entry.callPositions) {
      sql += src.slice(cursor, c.callStart);
      const newArgs = [...c.args];
      newArgs[5] = "null";
      sql += "perform app.audit(" + newArgs.join(", ") + ")";
      cursor = c.callEnd + 1;
    }
    sql += src.slice(cursor, entry.end);
    // A later definition of the same door name supersedes the earlier one.
    doors.set(entry.name, { file: f, sql });
  }
}

console.log("audit calls scanned: " + report.length);
const broken = report.filter((r) => r.needsFix);
console.log("calls with uuid slot 6 (broken): " + broken.length);
const nullish = report.length - broken.length;
console.log("calls already null slot 6: " + nullish);
for (const r of report) {
  console.log(
    (r.needsFix ? "FIX " : "ok  ") + r.file + " #" + r.call +
    " slot4=[" + r.slot4.slice(0, 30) + "] slot6=[" + r.slot6 + "]",
  );
}

if (CHECK) process.exit(0);

if (doors.size === 0) throw new Error("nothing to emit");

let out = `-- 056 — the hotel-domain audit calls, normalized to the canonical funnel.
--
-- 054 installed the row-image app.audit overload (action, entity, id, before,
-- after, reason text, metadata) and documented in its header that callers
-- passing a property uuid in slot six stay unresolved: 034-039's doors do
-- exactly that, so every hotel/HK/MX door died at its audit line (42883) after
-- doing its real work, and the insert went down with the transaction. A
-- sibling uuid-slot-6 overload is not an option — 028-033/041 pass untyped
-- null there and would all become ambiguous (42725) — so this migration
-- re-creates each affected door verbatim with one change per audit call: the
-- property expression in slot six becomes null. Organization and property are
-- not lost: the funnel reads organization_id out of the row image, and the
-- row image carries property_id. Only doors containing a rewritten call are
-- re-created; their grants survive (create or replace never drops grants).

`;

const names = [...doors.keys()].sort((a, b) => a.localeCompare(b));
for (const name of names) {
  const d = doors.get(name);
  out += `-- ==================================================================\n`;
  out += `-- ${name} (from ${d.file}.sql, audit slot 6 normalized)\n`;
  out += `-- ==================================================================\n\n`;
  out += d.sql + "\n\n";
}

out += `-- Transcription guard: every re-created door must exist and the canonical
-- overload must still be the ONLY seven-argument row-image shape.
do $$
begin
  if (select count(*) from pg_proc
       where pronamespace = 'public'::regnamespace
         and proname in (${names.map((n) => `'${n}'`).join(", ")})
      ) <> ${names.length} then
    raise exception 'HOTEL_DOORS_MISSING';
  end if;
  if (select count(*) from pg_proc
       where pronamespace = 'app'::regnamespace
         and proname = 'audit'
         and proargtypes::text = '25 25 2950 3802 3802 25 3802'
      ) <> 1 then
    raise exception 'AUDIT_OVERLOAD_SHAPE_CHANGED';
  end if;
end
$$;
`;

const dest = join(here, "supabase", "056_hotel_audit_calls.sql");
writeFileSync(dest, out);
console.log("wrote " + dest + " with " + doors.size + " doors: " + names.join(", "));
