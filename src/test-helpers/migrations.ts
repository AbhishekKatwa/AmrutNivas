/**
 * Reading the shipped migrations from a test.
 *
 * The client and the database drift apart silently unless something compares them
 * to each other, and the only trustworthy source of "what the database actually
 * offers" is the SQL itself. These helpers parse `db/supabase/*.sql` at test time —
 * no generated types, no hand-copied list that can go stale.
 */

import { readFileSync, readdirSync } from "node:fs";

const MIGRATIONS = new URL("../../db/supabase/", import.meta.url);
const SOURCE = new URL("../../src/", import.meta.url);

export type MigrationSource = { readonly file: string; readonly sql: string };

export function migrationSources(): MigrationSource[] {
  return readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => ({ file, sql: readFileSync(new URL(file, MIGRATIONS), "utf8") }));
}

function allSql(): string {
  return migrationSources().map((source) => source.sql).join("\n");
}

/**
 * The parameter names of one signature, in declaration order.
 *
 * Split on commas that sit outside quotes and brackets, not on newlines: several
 * doors are declared on a single line (`cancel_invitation(p_invitation uuid, p_reason
 * text)`), and a line-based parser would report only their first parameter — which
 * would quietly turn the client's "every parameter I sent exists on the door" check
 * into a check of one name. Defaults are kept out of the split for the same reason
 * (`p_business_types text[] default '{}'` contains a comma inside its own text).
 */
function parameterNames(signature: string): string[] {
  const withoutComments = signature.replace(/--[^\n]*/g, "");
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let inText = false;
  for (const char of withoutComments) {
    if (char === "'") {
      inText = !inText;
    } else if (!inText && (char === "(" || char === "[")) {
      depth += 1;
    } else if (!inText && (char === ")" || char === "]")) {
      depth -= 1;
    } else if (!inText && depth === 0 && char === ",") {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);

  return parts
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .map((part) => /^[a-z_][a-z0-9_]*/.exec(part)?.[0])
    .filter((name): name is string => name !== undefined);
}

/**
 * Every function exposed over HTTP, with its parameter names in order.
 * `public` is the only schema PostgREST serves, so this IS the client's API surface.
 */
export function publicDoorSignatures(): Map<string, string[]> {
  const doors = new Map<string, string[]>();
  const pattern =
    /create or replace function public\.([a-z_]+)\(([\s\S]*?)\)\s*\n\s*returns/g;
  for (const match of allSql().matchAll(pattern)) {
    doors.set(match[1], parameterNames(match[2]));
  }
  return doors;
}

/** Every single-token refusal the database can raise. */
export function doorErrorTokens(): string[] {
  return [...new Set(allSql().match(/NIVAAS_[A-Z0-9_]+/g) ?? [])].sort();
}

/** The `domain.verb` permissions the RBAC seed actually grants. */
export function seededPermissions(): string[] {
  const found = allSql().match(/'[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*'/g) ?? [];
  return [...new Set(found.map((token) => token.replaceAll("'", "")))].sort();
}

/**
 * Every capability token the client references.
 *
 * `Permission` is `${string}.${string}`, so the compiler accepts a token the database
 * has never heard of — and gating a control on one makes it ungrantable, which is the
 * invisible half of the failure the donor project hit when its role matrix lived twice.
 * So the literals are scraped out of the source here and compared against the seed, in
 * the same spirit as the door list.
 *
 * Scan breadth: comments go first (`stock.adjust` in a doc comment is prose, not a gate);
 * the `nav.` namespace is excluded because the navigation registry's i18n label keys share
 * the dotted shape; test files are excluded because an assertion about a token the client
 * never gates on is not a gate.
 */
export function clientPermissionTokens(): string[] {
  const pattern = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
  const tokens = new Set<string>();

  const walk = (dir: URL): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      // A directory URL needs its trailing "/" or resolution replaces the base's own
      // last segment instead of descending into it.
      const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), dir);
      if (entry.isDirectory()) {
        walk(url);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      if (entry.name.includes(".test.")) continue;
      if (url.pathname.includes("/src/test-helpers/")) continue;

      const code = readFileSync(url, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
      for (const literal of code.match(/(["'])[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\1/g) ?? []) {
        const value = literal.slice(1, -1);
        if (value.startsWith("nav.")) continue;
        if (pattern.test(value)) tokens.add(value);
      }
    }
  };

  walk(SOURCE);
  return [...tokens].sort();
}

function tableBlock(table: string): string {
  const sql = allSql();
  const match = new RegExp(`create table (?:if not exists )?public\\.${table} \\(`).exec(sql);
  if (match === null) throw new Error(`no table public.${table} in the migrations`);
  const end = sql.indexOf("\n);", match.index);
  return sql.slice(match.index, end);
}

/**
 * The exact value list a `CHECK (column in (...))` constraint allows.
 *
 * This is what lets a client taxonomy test assert against the database's own rule
 * instead of against a second hand-written list that can agree with nothing.
 */
export function checkEnum(table: string, column: string): string[] {
  const block = tableBlock(table);
  const match = new RegExp(
    `check\\s*\\(\\s*${column}\\s+in\\s*\\(([\\s\\S]*?)\\)\\s*\\)`,
  ).exec(block);
  if (match === null) throw new Error(`public.${table}.${column} has no CHECK enum`);
  return [...new Set(match[1].match(/'([^']+)'/g) ?? [])].map((value) => value.replaceAll("'", ""));
}

/** The value list a `CHECK (column <@ array[...]::text[])` allows on an array column. */
export function arrayCheckEnum(table: string, column: string): string[] {
  const block = tableBlock(table);
  const match = new RegExp(
    `check\\s*\\(\\s*${column}\\s*<@\\s*array\\[([\\s\\S]*?)\\]\\s*::\\s*text\\[\\]`,
  ).exec(block);
  if (match === null) throw new Error(`public.${table}.${column} has no array CHECK`);
  return [...new Set(match[1].match(/'([^']+)'/g) ?? [])].map((value) => value.replaceAll("'", ""));
}
