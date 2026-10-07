/**
 * The client's vocabularies against the database's own rules.
 *
 * A picker that offers a value the CHECK constraint refuses is a 500 at the door,
 * and a permission string the seed does not contain is a button that can never
 * work. So each list the UI renders is compared here against the migration that
 * decides whether the value is legal — not against another copy in this file.
 */
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_STATUSES,
  AUDIT_RESULTS,
  BUSINESS_TYPES,
  INVITATION_STATUSES,
  MEMBERSHIP_STATUSES,
  ORGANIZATION_STATUSES,
  OUTLET_ACCESS_MODES,
  OUTLET_TYPES,
  PROPERTY_ACCESS_MODES,
  PROPERTY_TYPES,
  PERMISSION_PATTERN,
  PERMISSION_SCOPES,
  SITE_STATUSES,
} from "./types";
import {
  arrayCheckEnum,
  checkEnum,
  clientPermissionTokens,
  migrationSources,
  seededPermissions,
} from "@/test-helpers/migrations";

/**
 * The value list of a CHECK that a LATER migration added by name.
 *
 * `checkEnum` reads the `create table` block, which is right while a constraint lives there
 * and wrong once a migration replaces it: 008 drops `profiles_status_check` and re-adds it
 * with a retired value removed, and 010 adds `audit_log_result_check` on a column the 004
 * create-table statement never had. Comparing those client arrays against the original block
 * would gate them to a vocabulary the database no longer enforces, so this reads the
 * constraint that is actually in force — the last `add constraint <name>` in migration order.
 */
function alteredCheckEnum(constraint: string, column: string): string[] {
  let found: string[] | null = null;
  for (const { sql } of migrationSources()) {
    const match = new RegExp(
      `add constraint ${constraint}\\s+\\n?\\s*check\\s*\\(\\s*${column}\\s+in\\s*\\(([\\s\\S]*?)\\)\\s*\\)`,
    ).exec(sql);
    if (match !== null) {
      found = [...new Set(match[1].match(/'([^']+)'/g) ?? [])].map((v) => v.replaceAll("'", ""));
    }
  }
  if (found === null || found.length === 0) {
    throw new Error(`no ALTERed CHECK named ${constraint} was parsed from db/supabase`);
  }
  return found;
}

function compare(
  label: string,
  client: readonly string[],
  database: () => string[],
): void {
  it(label, () => {
    const allowed = database();
    // A parse that found nothing would make an empty client list pass, so the
    // database side is asserted non-empty before the sets are compared.
    expect(allowed.length, `${label}: no constraint parsed`).toBeGreaterThan(1);
    expect([...client].sort()).toEqual([...new Set(allowed)].sort());
  });
}

describe("status lifecycles", () => {
  compare("organizations.status matches ORGANIZATION_STATUSES", ORGANIZATION_STATUSES, () =>
    checkEnum("organizations", "status"),
  );
  compare("properties.status matches SITE_STATUSES", SITE_STATUSES, () =>
    checkEnum("properties", "status"),
  );
  compare("outlets.status matches SITE_STATUSES", SITE_STATUSES, () =>
    checkEnum("outlets", "status"),
  );
  compare("departments.status matches SITE_STATUSES", SITE_STATUSES, () =>
    checkEnum("departments", "status"),
  );
  // 002's inline `check (status in ('ACTIVE','INACTIVE','SUSPENDED'))` is the constraint
  // Postgres names `profiles_status_check`, and 008 drops exactly that name and re-adds it
  // without `INACTIVE`. The ALTERed form is the rule the database enforces today.
  compare("profiles.status matches ACCOUNT_STATUSES", ACCOUNT_STATUSES, () =>
    alteredCheckEnum("profiles_status_check", "status"),
  );
  // 010 adds the outcome column and its CHECK after 004 created the table, so there is no
  // inline constraint to read at all.
  compare("audit_log.result matches AUDIT_RESULTS", AUDIT_RESULTS, () =>
    alteredCheckEnum("audit_log_result_check", "result"),
  );
  compare(
    "organization_memberships.status matches MEMBERSHIP_STATUSES",
    MEMBERSHIP_STATUSES,
    () => checkEnum("organization_memberships", "status"),
  );
  compare("invitations.status matches INVITATION_STATUSES", INVITATION_STATUSES, () =>
    checkEnum("invitations", "status"),
  );
});

describe("hierarchies and breadth", () => {
  compare("properties.property_type matches PROPERTY_TYPES", PROPERTY_TYPES, () =>
    checkEnum("properties", "property_type"),
  );
  compare("outlets.outlet_type matches OUTLET_TYPES", OUTLET_TYPES, () =>
    checkEnum("outlets", "outlet_type"),
  );
  compare("organizations.business_types matches BUSINESS_TYPES", BUSINESS_TYPES, () =>
    arrayCheckEnum("organizations", "business_types"),
  );
  compare(
    "membership_property_access.mode matches PROPERTY_ACCESS_MODES",
    PROPERTY_ACCESS_MODES,
    () => checkEnum("membership_property_access", "mode"),
  );
  compare(
    "membership_outlet_access.mode matches OUTLET_ACCESS_MODES",
    OUTLET_ACCESS_MODES,
    () => checkEnum("membership_outlet_access", "mode"),
  );
  compare("roles.scope_level matches PERMISSION_SCOPES", PERMISSION_SCOPES, () =>
    checkEnum("roles", "scope_level"),
  );
});

describe("the permission vocabulary the UI gates on", () => {
  it("keeps every seeded permission in the domain.verb contract", () => {
    const invalid = seededPermissions().filter((permission) => !PERMISSION_PATTERN.test(permission));
    expect(invalid).toEqual([]);
  });

  it("gates only on capabilities the seed actually grants", () => {
    // `Permission` is `${string}.${string}`, so a token the database has never heard of
    // compiles, ships, and disables its control forever — no grant can ever satisfy it
    // (this build actually grew one). So the client's own literals are scraped from src
    // and diffed against 006, which also subsumes any hand-written list of verbs: a seed
    // that drops one breaks this assertion the moment a screen still gates on it.
    const seeded = seededPermissions();
    const referenced = clientPermissionTokens();
    expect(referenced.filter((permission) => !seeded.includes(permission))).toEqual([]);
  });

  it("really reads the client's gates, not an empty scrape", () => {
    // Without this, a scraper that matched nothing would make the check above pass
    // vacuously. These two are the two shapes it has to catch: a screen's `can("…")`
    // call and a step map's value.
    const referenced = clientPermissionTokens();
    expect(referenced.length).toBeGreaterThanOrEqual(20);
    for (const permission of ["property.create", "audit.view"]) {
      expect(referenced, `${permission} was not scraped`).toContain(permission);
    }
  });
});
