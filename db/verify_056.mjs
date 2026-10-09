// verify_056.mjs — byte-compare 056's door bodies against a fresh transformation
// of their origin blocks. One-shot; run from repo root: node db/verify_056.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const gen = readFileSync(join(here, "build_056.mjs"), "utf8");

// Reuse the generator's parser verbatim by evaluating its helper section.
const helperStart = gen.indexOf("function scanCall");
const helperEnd = gen.indexOf("const report = []");
if (helperStart < 0 || helperEnd < 0) throw new Error("helpers not found");
const { scanCall, splitArgs } = new Function(
  gen.slice(helperStart, helperEnd) + "; return { scanCall, splitArgs };",
)();

const fiveSix = readFileSync(join(here, "supabase", "056_hotel_audit_calls.sql"), "utf8");

// Split 056 into banner-delimited door sections.
const bannerRe = /-- =+\n-- (\w+) \(from (\w+)\.sql, audit slot 6 normalized\)\n-- =+\n\n/g;
const sections = [];
let m;
while ((m = bannerRe.exec(fiveSix)) !== null) {
  sections.push({ name: m[1], file: m[2], bannerIndex: m.index, start: m.index + m[0].length });
}
for (let i = 0; i < sections.length; i++) {
  const end = i + 1 < sections.length ? sections[i + 1].bannerIndex : fiveSix.indexOf("-- Transcription guard:");
  sections[i].body = fiveSix.slice(sections[i].start, end).trim();
}

const fileCache = new Map();
const src = (f) => {
  if (!fileCache.has(f)) fileCache.set(f, readFileSync(join(here, "supabase", f + ".sql"), "utf8"));
  return fileCache.get(f);
};

function normalizeSourceBlock(file, name) {
  const s = src(file);
  const sig = "create or replace function public." + name + "(";
  const start = s.indexOf(sig);
  if (start < 0) throw new Error(file + " has no door " + name);
  const end = s.indexOf("$$;", start) + 3;
  const block = s.slice(start, end);
  // Rewrite every 7-arg audit call's slot 6 to null (same rule as the generator).
  let out = "";
  let cursor = start;
  let idx = start;
  while (true) {
    const m2 = s.indexOf("perform app.audit(", idx);
    if (m2 < 0 || m2 >= end) break;
    const open = m2 + "perform app.audit".length;
    const close = scanCall(s, open);
    const args = splitArgs(s.slice(open + 1, close));
    if (args.length !== 7) throw new Error(name + ": unexpected argc " + args.length);
    if (/^null$/i.test(args[5].trim())) { idx = close; continue; }
    out += s.slice(cursor, m2);
    const newArgs = [...args];
    newArgs[5] = "null";
    out += "perform app.audit(" + newArgs.join(", ") + ")";
    cursor = close + 1;
    idx = close;
  }
  out += s.slice(cursor, end);
  return out.trim();
}

let fails = 0;
for (const sec of sections) {
  try {
    const expected = normalizeSourceBlock(sec.file, sec.name);
    if (expected === sec.body) {
      console.log("OK   " + sec.name);
    } else {
      fails++;
      console.log("FAIL " + sec.name + " — body differs from transformed source");
      // first divergence
      let i = 0;
      while (i < expected.length && i < sec.body.length && expected[i] === sec.body[i]) i++;
      console.log("  at +" + i + " expected: " + JSON.stringify(expected.slice(i, i + 60)));
      console.log("  at +" + i + " actual  : " + JSON.stringify(sec.body.slice(i, i + 60)));
    }
  } catch (e) {
    fails++;
    console.log("FAIL " + sec.name + " — " + e.message);
  }
}
console.log(sections.length + " sections, " + fails + " failures");
process.exit(fails ? 1 : 0);
