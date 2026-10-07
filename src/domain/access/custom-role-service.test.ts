/**
 * The four custom-role doors, exercised against a stub transport and against the SQL.
 *
 * 011 is the migration where a customer can author their own authority, so these tests are
 * the drift gate for it. Three things are proven and none of them is provable by a type:
 *
 *   1. Every parameter reaches the wire under the name the migration declares. These doors
 *      have no `default` clause, so a dropped argument is not a null — it is PostgREST failing
 *      to resolve the function at all. `doorParametersMatchTheSchema` compares against the
 *      parsed signature rather than against a list copied into this file.
 *   2. The return payload a screen reads is the payload the door's own `return` builds.
 *   3. The refusals reach an operator as sentences that name no internal token.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CREATABLE_SCOPE_LEVELS,
  createRole,
  grantablePermissions,
  roleNameIsValid,
  roleIsEditable,
  setRolePermissions,
  setRoleStatus,
  updateRole,
} from "./custom-role-service";
import { setSupabaseClientForTests } from "@/db/client";
import { DOOR_ERRORS } from "@/db/door-errors";
import type { Permission } from "@/domain/identity/types";
import {
  doorParametersMatchTheSchema,
  stubBackend,
  type BackendStub,
} from "@/test-helpers/transport";

const ORG = "a0000000-0000-4000-8000-000000000001";
const ROLE_ID = "e0000000-0000-4000-8000-000000000001";
const REASON = "Standing up a night-shift audit bundle for the Bandra site.";

let stub: BackendStub;

beforeEach(() => {
  stub = stubBackend({ doors: () => undefined });
  setSupabaseClientForTests(stub.client);
});

afterEach(() => setSupabaseClientForTests(undefined));

/** The argument object the last call to `name` sent, with the schema check attached. */
function sentTo(name: string): Record<string, unknown> {
  const args = stub.argsFor(name);
  doorParametersMatchTheSchema(name, args);
  return args;
}

describe("createRole", () => {
  it("sends all seven declared parameters, including the ones the caller left blank", async () => {
    stub = stubBackend({
      doors: (name) =>
        name === "create_role"
          ? {
              data: {
                roleId: ROLE_ID,
                name: "NIGHT_AUDITOR",
                scope: "PROPERTY",
                permissions: ["audit.view", "stock.adjust"],
              },
            }
          : undefined,
    });
    setSupabaseClientForTests(stub.client);

    const created = await createRole({
      organizationId: ORG,
      name: "night_auditor",
      displayName: "Night Auditor",
      scopeLevel: "PROPERTY",
      permissions: ["audit.view", "stock.adjust"],
      reason: REASON,
    });

    expect(sentTo("create_role")).toEqual({
      p_organization: ORG,
      p_name: "night_auditor",
      p_display_name: "Night Auditor",
      // The absent description is sent as an explicit NULL, not dropped: the door declares no
      // default, so an omitted key would make the function unresolvable at the wire.
      p_description: null,
      p_scope_level: "PROPERTY",
      p_permissions: ["audit.view", "stock.adjust"],
      p_reason: REASON,
    });

    // The positive case, asserted as a value rather than as the absence of a throw.
    expect(created).toEqual({
      roleId: ROLE_ID,
      name: "NIGHT_AUDITOR",
      scope: "PROPERTY",
      permissions: ["audit.view", "stock.adjust"],
    });
  });

  it("keeps a supplied description in the payload the door reads", async () => {
    stub = stubBackend({ doors: () => ({ data: { roleId: ROLE_ID, name: "X", scope: "ORGANIZATION", permissions: [] } }) });
    setSupabaseClientForTests(stub.client);

    await createRole({
      organizationId: ORG,
      name: "CELLAR_KEEPER",
      displayName: "Cellar Keeper",
      description: "Counts the wine store and signs the transfer.",
      scopeLevel: "ORGANIZATION",
      permissions: ["stock.adjust"],
      reason: REASON,
    });

    expect(sentTo("create_role").p_description).toBe(
      "Counts the wine store and signs the transfer.",
    );
  });

  it("refuses a name the door's own pattern would reject, before the wire is involved", () => {
    // 011 checks `^[A-Z][A-Z0-9_]{2,39}$` AND a blank display name behind ONE token
    // (NIVAAS_INVALID_NAME), so a form that only posts cannot tell the operator which half
    // failed. The client check exists to make that distinction, not to replace the door's.
    expect(roleNameIsValid("NIGHT_AUDITOR")).toBe(true);
    expect(roleNameIsValid("AB")).toBe(false); // two characters is below the floor
    expect(roleNameIsValid("ABC")).toBe(true); // three is the minimum
    expect(roleNameIsValid("_AUDIT")).toBe(false); // must start with a letter
    expect(roleNameIsValid("Night_Auditor")).toBe(false); // lowercase is not the stored form
    expect(roleNameIsValid("a".repeat(41))).toBe(false);
    expect(roleNameIsValid("A".repeat(40))).toBe(true);
    expect(roleNameIsValid("NIGHT AUDITOR")).toBe(false); // a space is not in the class
  });
});

describe("updateRole", () => {
  it("sends the four parameters `update_role` declares, and nothing about the grants", async () => {
    stub = stubBackend({ doors: () => ({ data: { roleId: ROLE_ID, updated: true } }) });
    setSupabaseClientForTests(stub.client);

    const updated = await updateRole({
      roleId: ROLE_ID,
      displayName: "Night Desk",
      reason: REASON,
    });

    expect(sentTo("update_role")).toEqual({
      p_role: ROLE_ID,
      p_display_name: "Night Desk",
      p_description: null,
      p_reason: REASON,
    });
    // The door reports the write rather than the row; `updated` is its literal, not ours.
    expect(updated).toEqual({ roleId: ROLE_ID, updated: true });
  });
});

describe("setRolePermissions", () => {
  it("replaces the whole set and reads back what the role now holds", async () => {
    stub = stubBackend({
      doors: () => ({ data: { roleId: ROLE_ID, permissions: ["audit.view", "stock.adjust"] } }),
    });
    setSupabaseClientForTests(stub.client);

    const result = await setRolePermissions({
      roleId: ROLE_ID,
      permissions: ["audit.view", "stock.adjust"],
      reason: REASON,
    });

    expect(sentTo("set_role_permissions")).toEqual({
      p_role: ROLE_ID,
      p_permissions: ["audit.view", "stock.adjust"],
      p_reason: REASON,
    });
    expect(result.permissions).toEqual(["audit.view", "stock.adjust"]);
  });

  it("sends an empty list as an empty list, not as an absent parameter", async () => {
    // A stale client must not be able to "clear" a role by forgetting to send it: the door
    // answers NIVAAS_EMPTY_SELECTION for that, and it only can if the key actually arrives.
    stub = stubBackend({ doors: () => ({ data: { roleId: ROLE_ID, permissions: [] } }) });
    setSupabaseClientForTests(stub.client);

    await setRolePermissions({ roleId: ROLE_ID, permissions: [], reason: REASON });

    expect(sentTo("set_role_permissions")).toEqual({
      p_role: ROLE_ID,
      p_permissions: [],
      p_reason: REASON,
    });
  });
});

describe("setRoleStatus", () => {
  it("retires a custom role with the door's two-value status", async () => {
    stub = stubBackend({ doors: () => ({ data: { roleId: ROLE_ID, status: "INACTIVE" } }) });
    setSupabaseClientForTests(stub.client);

    const result = await setRoleStatus({ roleId: ROLE_ID, status: "INACTIVE", reason: REASON });

    expect(sentTo("set_role_status")).toEqual({
      p_role: ROLE_ID,
      p_status: "INACTIVE",
      p_reason: REASON,
    });
    expect(result).toEqual({ roleId: ROLE_ID, status: "INACTIVE" });
  });
});

describe("the refusals an operator is shown", () => {
  // 011's six tokens, all already mapped in `src/db/door-errors.ts` — this file's job is to
  // keep them honest, not to restate them. A sentence carrying `NIVAAS_*` would put an
  // internal code on a screen, and a missing mapping would fall through to a generic database
  // string, which is the other way an implementation detail leaks.
  const ROLE_TOKENS = [
    "NIVAAS_ROLE_NAME_TAKEN",
    "NIVAAS_SYSTEM_ROLE_PROTECTED",
    "NIVAAS_ROLE_ABOVE_AUTHORITY",
    "NIVAAS_ROLE_SCOPE_FORBIDDEN",
    "NIVAAS_GRANT_OUTSIDE_SCOPE",
    "NIVAAS_SELF_ASSIGN_DENIED",
  ] as const;

  for (const token of ROLE_TOKENS) {
    it(`${token} reaches the operator as plain English`, () => {
      const entry = DOOR_ERRORS[token];
      expect(entry, `${token} has no user-facing mapping`).toBeDefined();
      expect(entry.message).not.toContain("NIVAAS_");
      expect(entry.message.length).toBeGreaterThan(20);
      // Every refusal is a state the operator can act on, so a real category, not INTERNAL.
      expect(["PERMISSION_DENIED", "CONFLICT", "VALIDATION_FAILED"]).toContain(entry.code);
    });
  }

  it("keeps the authority ceiling's sentence about the person, not about seniority numbers", () => {
    // `seniority` is 011's ladder. It is deliberately not read into the client's `Role`
    // mirror, so the copy must not ask an operator to reason about a number they cannot see.
    expect(DOOR_ERRORS.NIVAAS_ROLE_ABOVE_AUTHORITY.message).not.toMatch(/seniority/i);
    expect(DOOR_ERRORS.NIVAAS_ROLE_ABOVE_AUTHORITY.message).toMatch(/your own authority/i);
  });
});

describe("the pure aids a Roles screen is allowed to use", () => {
  it("offers only what the actor actually holds", () => {
    const held = ["role.create", "role.edit", "audit.view"] as Permission[];
    // The positive case first: a capability the operator has is offered, not greyed out.
    expect(grantablePermissions(held, ["audit.view", "role.create"])).toEqual([
      "audit.view",
      "role.create",
    ]);
    expect(grantablePermissions(held, ["folio.transfer"])).toEqual([]);
    // Order follows the wanted list, so a screen's own sort survives the filter.
    expect(grantablePermissions(held, ["role.edit", "audit.view"])).toEqual([
      "role.edit",
      "audit.view",
    ]);
    expect(grantablePermissions(held, [])).toEqual([]);
  });

  it("gates on the database's own is_system column, never on a role's name", () => {
    // A name comparison (`=== "ORG_OWNER"`) is the version of this rule that rots the day the
    // catalogue changes, and 011 is the migration that made names tenant-scoped.
    expect(roleIsEditable({ isSystem: false })).toBe(true);
    expect(roleIsEditable({ isSystem: true })).toBe(false);
  });

  it("confines a create picker to the three scopes 011 accepts", () => {
    // `ScopeLevel` carries GLOBAL and DEPARTMENT too; a role at either would mean everything
    // or nothing, which is why the door refuses them with NIVAAS_ROLE_SCOPE_FORBIDDEN.
    expect([...CREATABLE_SCOPE_LEVELS].sort()).toEqual(["ORGANIZATION", "OUTLET", "PROPERTY"]);
    expect(CREATABLE_SCOPE_LEVELS).not.toContain("GLOBAL");
    expect(CREATABLE_SCOPE_LEVELS).not.toContain("DEPARTMENT");
  });
});
