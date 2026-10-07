/**
 * The catalogue against the SQL that grants it.
 *
 * `Permission` is the loose template `${string}.${string}`, so a key this file
 * invents compiles, renders a picker tick-box, and can never be granted — the
 * invisible half of the donor project's "role matrix lives twice" defect (006's
 * header). And a key the seed grants but the catalogue lacks is a capability the
 * roles screen cannot label. So both directions are diffed here against the two
 * migration files that decide them, parsed fresh rather than hand-copied.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { PERMISSION_PATTERN } from "@/domain/identity/types";
import {
  PERMISSION_CATALOGUE,
  PERMISSION_KEYS,
  describePermission,
  isPermissionKey,
  permissionsByDomain,
} from "@/domain/identity/permissions";

/** One quoted `domain.verb` literal — the shape every grant row stores. */
const PERMISSION_LITERAL = /'([a-z][a-z0-9_]*\.[a-z][a-z0-9_]*)'/g;

function distinctPermissionsIn(file: string): string[] {
  const sql = readFileSync(new URL(`../../../db/supabase/${file}`, import.meta.url), "utf8");
  return [...new Set([...sql.matchAll(PERMISSION_LITERAL)].map((m) => m[1]))].sort();
}

// The seed files are named explicitly: 006 owns the base vocabulary, 011 adds the
// two custom-role tokens, 013 adds the restaurant capabilities (Prompt #04 §5), and
// no other migration inserts into role_permissions.
const SEEDED = distinctPermissionsIn("006_seed_rbac.sql");
const CUSTOM_ROLE_TOKENS = distinctPermissionsIn("011_custom_roles.sql");
const RESTAURANT_TOKENS = distinctPermissionsIn("013_restaurant_permissions.sql");
const GRANTABLE = [...new Set([...SEEDED, ...CUSTOM_ROLE_TOKENS, ...RESTAURANT_TOKENS])].sort();

describe("catalogue equals what the database can grant", () => {
  it("really parses all three seed files, not empty sets", () => {
    // Without this, a regex that matched nothing would make every comparison below
    // pass vacuously. 006 self-checks its own count of 25; 011 asserts its two
    // tokens exist before granting them to any role; 013 seeds the restaurant verbs
    // one per line, so the four below are the ones a greedy dedupe could lose.
    expect(SEEDED).toHaveLength(25);
    expect(CUSTOM_ROLE_TOKENS).toEqual(["role.create", "role.edit"]);
    expect(RESTAURANT_TOKENS).toHaveLength(27);
    for (const key of ["menu.publish", "kot.reprint", "order.void", "payment.refund"]) {
      expect(RESTAURANT_TOKENS, key).toContain(key);
    }
    expect(GRANTABLE).toHaveLength(54);
  });

  it("grants nothing the catalogue does not describe", () => {
    // A DB-granted key missing here means the roles screen cannot label a capability
    // some role already holds.
    const catalogue: string[] = [...PERMISSION_KEYS].sort();
    expect(GRANTABLE.filter((key) => !catalogue.includes(key))).toEqual([]);
  });

  it("describes nothing the seed cannot grant", () => {
    expect([...PERMISSION_KEYS].sort()).toEqual(GRANTABLE);
  });

  it("holds no duplicate keys", () => {
    const keys = [...PERMISSION_KEYS];
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("entry shape", () => {
  it("every key satisfies the 002 CHECK pattern", () => {
    const invalid = PERMISSION_CATALOGUE.filter(
      (entry) => !PERMISSION_PATTERN.test(entry.key),
    ).map((entry) => entry.key);
    expect(invalid).toEqual([]);
  });

  it("domain and verb agree with the key's own segments", () => {
    const mismatched = PERMISSION_CATALOGUE.filter((entry) => {
      const [domain, verb] = entry.key.split(".");
      return entry.domain !== domain || entry.verb !== verb;
    }).map((entry) => entry.key);
    expect(mismatched).toEqual([]);
  });

  it("every entry has a non-empty description for an administrator", () => {
    // A blank label is how a picker ends up showing a tick-box that explains nothing;
    // §58 wants a sentence, so anything shorter than two words fails.
    const thin = PERMISSION_CATALOGUE.filter(
      (entry) => entry.description.trim().split(/\s+/).length < 2,
    ).map((entry) => entry.key);
    expect(thin).toEqual([]);
  });
});

describe("lookups", () => {
  it("isPermissionKey accepts exactly the grantable set", () => {
    for (const key of GRANTABLE) {
      expect(isPermissionKey(key), key).toBe(true);
    }
  });

  it("isPermissionKey refuses malformed and ungrantable values", () => {
    expect(isPermissionKey("audit.")).toBe(false);
    expect(isPermissionKey("Audit.View")).toBe(false);
    expect(isPermissionKey("organization")).toBe(false);
    // Well-shaped but never seeded — §58's sample `audit.export` is exactly this:
    // a catalogue entry must follow a seed, never run ahead of one.
    expect(isPermissionKey("audit.export")).toBe(false);
    expect(isPermissionKey("stock.adjust")).toBe(false);
    for (const junk of [null, undefined, 42, {}, ["audit.view"]]) {
      expect(isPermissionKey(junk)).toBe(false);
    }
  });

  it("describePermission labels a known key and gives up honestly on an unknown one", () => {
    expect(describePermission("property.manage_access")).toBe(
      "Decide which people may reach which properties.",
    );
    expect(describePermission("audit.export")).toBeUndefined();
  });
});

describe("permissionsByDomain", () => {
  it("covers the whole catalogue without loss", () => {
    const groups = permissionsByDomain();
    const flattened = groups.flatMap((group) => group.permissions.map((entry) => entry.key));
    expect([...flattened].sort()).toEqual([...PERMISSION_KEYS].sort());
  });

  it("groups under the domain the key itself carries", () => {
    for (const group of permissionsByDomain()) {
      for (const entry of group.permissions) {
        expect(entry.key.startsWith(`${group.domain}.`)).toBe(true);
      }
    }
  });
});
