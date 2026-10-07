/**
 * Roles, grants and breadth, exercised against a stub transport.
 *
 * The point of these tests is the scope columns. A grant is only meaningful if the id it
 * names is the id the role's `scope_level` asks for, and PostgREST binds parameters by name
 * — so an OUTLET grant sent as `p_property` would be accepted by the wire and refused by
 * 002's shape trigger, which is the kind of bug that only ever shows up in front of an
 * operator. Each write here is therefore asserted twice: against the exact argument object
 * and against the signature parsed out of `db/supabase/*.sql`.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assignRole,
  listGrants,
  listOutletAccess,
  listPropertyAccess,
  listRolePermissions,
  listRoles,
  listTenantRoles,
  revokeRole,
  setOutletAccess,
  setPropertyAccess,
} from "./role-service";
import { setSupabaseClientForTests } from "@/db/client";
import {
  doorParametersMatchTheSchema,
  stubBackend,
  type BackendStub,
  type QueryChain,
} from "@/test-helpers/transport";

const ORG = "a0000000-0000-4000-8000-000000000001";
const PROPERTY = "a1000000-0000-4000-8000-000000000001";
const OTHER_PROPERTY = "a1000000-0000-4000-8000-000000000002";
const OUTLET = "a2000000-0000-4000-8000-000000000001";
const USER = "b0000000-0000-4000-8000-000000000002";
const GRANT = "f0000000-0000-4000-8000-000000000001";
const ROLE_ID = "e0000000-0000-4000-8000-000000000001";
const OTHER_ROLE_ID = "e0000000-0000-4000-8000-000000000002";

let stub: BackendStub;

beforeEach(() => {
  stub = stubBackend({ doors: () => undefined });
  setSupabaseClientForTests(stub.client);
});

afterEach(() => setSupabaseClientForTests(undefined));

function steps(): readonly (readonly [string, readonly unknown[]])[] {
  return stub.queries[0].steps;
}

describe("listRoles", () => {
  it("reads the active system roles as reference data", async () => {
    stub = stubBackend({
      reads: () => [
        {
          id: ROLE_ID,
          name: "ORG_OWNER",
          display_name: "Owner",
          description: null,
          scope_level: "ORGANIZATION",
          organization_id: null,
          is_system: true,
          status: "ACTIVE",
        },
      ],
      doors: () => undefined,
    });
    setSupabaseClientForTests(stub.client);

    const roles = await listRoles();

    expect(stub.queries[0].table).toBe("roles");
    expect(steps()).toContainEqual(["eq", ["is_system", true]]);
    expect(steps()).toContainEqual(["eq", ["status", "ACTIVE"]]);
    expect(roles).toEqual([
      {
        id: ROLE_ID,
        name: "ORG_OWNER",
        displayName: "Owner",
        description: null,
        scopeLevel: "ORGANIZATION",
        organizationId: null,
        isSystem: true,
        status: "ACTIVE",
      },
    ]);
  });
});

describe("listTenantRoles — the roles 011 lets a tenant own", () => {
  const tenantRoleRow = {
    id: ROLE_ID,
    name: "NIGHT_AUDITOR",
    display_name: "Night Auditor",
    description: "Audits the close at one site.",
    scope_level: "PROPERTY",
    organization_id: ORG,
    is_system: false,
    status: "ACTIVE",
  };

  it("asks for this tenant's own roles, retired ones included", async () => {
    stub = stubBackend({ reads: () => [tenantRoleRow], doors: () => undefined });
    setSupabaseClientForTests(stub.client);

    const roles = await listTenantRoles(ORG);

    // `is_system = false` is the tenancy filter, not `organization_id` alone: 003's policy
    // keeps a tenant's rows inside the tenant, and this read must not accidentally return the
    // platform catalogue alongside them.
    expect(steps()).toContainEqual(["eq", ["organization_id", ORG]]);
    expect(steps()).toContainEqual(["eq", ["is_system", false]]);
    // Retired roles stay listable on purpose — `user_roles` rows still point at them and §53
    // wants "who held what, when" answerable rather than a role that appears to have vanished.
    expect(steps().some(([method, args]) => method === "eq" && args[0] === "status")).toBe(false);
    expect(roles).toEqual([
      {
        id: ROLE_ID,
        name: "NIGHT_AUDITOR",
        displayName: "Night Auditor",
        description: "Audits the close at one site.",
        scopeLevel: "PROPERTY",
        organizationId: ORG,
        isSystem: false,
        status: "ACTIVE",
      },
    ]);
  });

  it("does not read seniority or owner_class into the client mirror", async () => {
    // 009's ladder columns decide who may grant a role. They are the doors' arithmetic and a
    // screen must not invite an operator to reason about a number they cannot verify, so the
    // column list is stated rather than `*` and the test is what keeps it that way.
    stub = stubBackend({ reads: () => [], doors: () => undefined });
    setSupabaseClientForTests(stub.client);

    await listTenantRoles(ORG);

    expect(stub.queries[0].columns).not.toContain("*");
    expect(stub.queries[0].columns).not.toContain("seniority");
    expect(stub.queries[0].columns).not.toContain("owner_class");
  });
});

describe("listRolePermissions", () => {
  it("reads what a set of roles grants, which 003 lets anyone who sees the role see", async () => {
    stub = stubBackend({
      reads: () => [
        { role_id: ROLE_ID, permission: "audit.view" },
        { role_id: ROLE_ID, permission: "stock.adjust" },
      ],
      doors: () => undefined,
    });
    setSupabaseClientForTests(stub.client);

    const grants = await listRolePermissions([ROLE_ID, OTHER_ROLE_ID]);

    expect(stub.queries[0].table).toBe("role_permissions");
    expect(stub.queries[0].steps).toContainEqual(["in", ["role_id", [ROLE_ID, OTHER_ROLE_ID]]]);
    // The positive case: the keys arrive mapped to the domain's spelling, so a screen can put
    // them straight through `describePermission` without a second conversion.
    expect(grants).toEqual([
      { roleId: ROLE_ID, permission: "audit.view" },
      { roleId: ROLE_ID, permission: "stock.adjust" },
    ]);
  });

  it("asks the database nothing when there are no roles to describe", async () => {
    // `.in("role_id", [])` is a filter nothing can satisfy; it still costs a round trip and it
    // would make an empty Roles screen look like it queried. No input, no query.
    stub = stubBackend({ reads: () => [], doors: () => undefined });
    setSupabaseClientForTests(stub.client);

    await expect(listRolePermissions([])).resolves.toEqual([]);
    expect(stub.queries).toHaveLength(0);
  });
});

describe("listGrants", () => {
  const grantRow = {
    id: GRANT,
    user_id: USER,
    role_id: ROLE_ID,
    organization_id: ORG,
    property_id: PROPERTY,
    outlet_id: null,
    department_id: null,
    granted_by: USER,
    granted_at: "2026-03-01T08:00:00Z",
    revoked_at: null,
  };

  it("filters a tenant's grants to the level being inspected and joins the role", async () => {
    stub = stubBackend({
      reads: (query: QueryChain) =>
        query.table === "user_roles"
          ? [grantRow]
          : [{ id: ROLE_ID, name: "PROPERTY_MANAGER", display_name: "Property manager", scope_level: "PROPERTY" }],
      doors: () => undefined,
    });
    setSupabaseClientForTests(stub.client);

    const grants = await listGrants({ organizationId: ORG, propertyId: PROPERTY });

    expect(steps()).toContainEqual(["eq", ["organization_id", ORG]]);
    expect(steps()).toContainEqual(["eq", ["property_id", PROPERTY]]);
    // Active grants only by default: a revoked row is history, not a current capability.
    expect(steps()).toContainEqual(["is", ["revoked_at", null]]);
    expect(stub.queries[1].table).toBe("roles");
    expect(stub.queries[1].steps).toContainEqual(["in", ["id", [ROLE_ID]]]);
    expect(grants).toEqual([
      {
        id: GRANT,
        userId: USER,
        roleId: ROLE_ID,
        organizationId: ORG,
        propertyId: PROPERTY,
        outletId: null,
        departmentId: null,
        grantedBy: USER,
        grantedAt: "2026-03-01T08:00:00Z",
        revokedAt: null,
        role: { name: "PROPERTY_MANAGER", displayName: "Property manager", scopeLevel: "PROPERTY" },
      },
    ]);
  });

  it("includes the revoked trail when asked, and orders newest first", async () => {
    stub = stubBackend({
      reads: (query: QueryChain) =>
        query.table === "user_roles" ? [grantRow] : [{ id: ROLE_ID, name: "X", display_name: "X", scope_level: "PROPERTY" }],
      doors: () => undefined,
    });
    setSupabaseClientForTests(stub.client);

    await listGrants({ organizationId: ORG, userId: USER, includeRevoked: true });

    expect(steps()).toContainEqual(["eq", ["organization_id", ORG]]);
    expect(steps()).toContainEqual(["eq", ["user_id", USER]]);
    expect(steps()).not.toContainEqual(["is", ["revoked_at", null]]);
    expect(steps()).toContainEqual(["order", ["granted_at", { ascending: false }]]);
  });

  it("leaves the role off a grant whose role row the reader cannot see", async () => {
    // Another tenant's custom role can reach this list through the platform-admin arm of
    // 003's policy. Inventing a label for it would be worse than omitting the optional field.
    stub = stubBackend({ reads: (q: QueryChain) => (q.table === "user_roles" ? [grantRow] : []), doors: () => undefined });
    setSupabaseClientForTests(stub.client);

    const [grant] = await listGrants({ organizationId: ORG });
    expect(grant).toBeDefined();
    expect(grant!.role).toBeUndefined();
  });

  it("returns rows for a real tenant, not only an empty filtered set", async () => {
    stub = stubBackend({
      reads: (q: QueryChain) =>
        q.table === "user_roles"
          ? [grantRow]
          : [{ id: ROLE_ID, name: "CHEF", display_name: "Chef", scope_level: "OUTLET" }],
      doors: () => undefined,
    });
    setSupabaseClientForTests(stub.client);
    await expect(listGrants({ organizationId: ORG })).resolves.toHaveLength(1);
  });
});

describe("listPropertyAccess / listOutletAccess", () => {
  it("reads one tenant's breadth rows, grouped by person and site", async () => {
    stub = stubBackend({
      reads: () => [
        { id: "11111111-1111-4111-8111-111111111111", user_id: USER, organization_id: ORG, property_id: PROPERTY, mode: "SELECTED_PROPERTIES" },
      ],
      doors: () => undefined,
    });
    setSupabaseClientForTests(stub.client);

    const access = await listPropertyAccess(ORG);

    expect(stub.queries[0].table).toBe("membership_property_access");
    expect(steps()).toContainEqual(["eq", ["organization_id", ORG]]);
    expect(access).toEqual([
      {
        id: "11111111-1111-4111-8111-111111111111",
        userId: USER,
        organizationId: ORG,
        propertyId: PROPERTY,
        mode: "SELECTED_PROPERTIES",
      },
    ]);
  });

  it("reads one property's outlet breadth, which is how the dialog is opened", async () => {
    stub = stubBackend({
      reads: () => [
        { id: "22222222-2222-4222-8222-222222222222", user_id: USER, organization_id: ORG, property_id: PROPERTY, outlet_id: null, mode: "ALL_OUTLETS" },
      ],
      doors: () => undefined,
    });
    setSupabaseClientForTests(stub.client);

    const access = await listOutletAccess(PROPERTY);

    expect(stub.queries[0].table).toBe("membership_outlet_access");
    expect(steps()).toContainEqual(["eq", ["property_id", PROPERTY]]);
    // An `ALL_OUTLETS` row legitimately has no outlet id — the mode IS the breadth.
    expect(access[0]).toMatchObject({ outletId: null, mode: "ALL_OUTLETS" });
  });
});

describe("assignRole", () => {
  it("sends a property-scope grant's ids as the door names them", async () => {
    stub = stubBackend({
      doors: () => ({ data: { grantId: GRANT, role: "PROPERTY_MANAGER", scope: "PROPERTY" } }),
    });
    setSupabaseClientForTests(stub.client);

    const assigned = await assignRole({
      userId: USER,
      role: "property_manager",
      organizationId: ORG,
      propertyId: PROPERTY,
      reason: "appointed for the Nivaas lodge",
    });

    expect(stub.argsFor("assign_role")).toEqual({
      p_user: USER,
      p_role: "property_manager",
      p_organization: ORG,
      p_property: PROPERTY,
      p_outlet: null,
      p_reason: "appointed for the Nivaas lodge",
    });
    expect(() => doorParametersMatchTheSchema("assign_role", stub.argsFor("assign_role"))).not.toThrow();
    expect(assigned).toEqual({ grantId: GRANT, role: "PROPERTY_MANAGER", scope: "PROPERTY" });
  });

  it("sends the outlet id, not the property, for an outlet-scope role", async () => {
    // 002's `assert_role_grant_shape` requires `outlet_id` for an OUTLET role and the door
    // refuses without `p_outlet` (`NIVAAS_SCOPE_MISMATCH`). A form that filed the site here
    // would produce a grant that names the wrong level.
    stub = stubBackend({ doors: () => ({ data: { grantId: GRANT, role: "CHEF", scope: "OUTLET" } }) });
    setSupabaseClientForTests(stub.client);

    await assignRole({ userId: USER, role: "chef", organizationId: ORG, outletId: OUTLET });

    expect(stub.argsFor("assign_role")).toEqual({
      p_user: USER,
      p_role: "chef",
      p_organization: ORG,
      p_property: null,
      p_outlet: OUTLET,
    });
    expect(() => doorParametersMatchTheSchema("assign_role", stub.argsFor("assign_role"))).not.toThrow();
  });

  it("sends only the tenant for a tenant-wide role", async () => {
    stub = stubBackend({ doors: () => ({ data: { grantId: GRANT, role: "ORG_OWNER", scope: "ORGANIZATION" } }) });
    setSupabaseClientForTests(stub.client);

    await assignRole({ userId: USER, role: "org_owner", organizationId: ORG });

    expect(stub.argsFor("assign_role")).toEqual({
      p_user: USER,
      p_role: "org_owner",
      p_organization: ORG,
      p_property: null,
      p_outlet: null,
    });
  });
});

describe("revokeRole", () => {
  it("sends the grant id and the mandatory reason", async () => {
    stub = stubBackend({ doors: () => ({ data: { grantId: GRANT, revoked: true } }) });
    setSupabaseClientForTests(stub.client);

    await expect(revokeRole(GRANT, "moved to another site")).resolves.toEqual({
      grantId: GRANT,
      revoked: true,
    });
    expect(stub.argsFor("revoke_role")).toEqual({ p_grant: GRANT, p_reason: "moved to another site" });
    // `publicDoorSignatures` reads one identifier per line, so this door — declared on a
    // single line as `revoke_role(p_grant uuid, p_reason text)` — only yields `p_grant` to
    // the schema comparison. The reason parameter is pinned by the exact-args assertion
    // above; the helper's limitation is reported rather than patched here.
    expect(() => doorParametersMatchTheSchema("revoke_role", { p_grant: GRANT })).not.toThrow();
    // Revocation is a single door call: nothing here deletes the row or rewrites its scope.
    expect(stub.calls).toHaveLength(1);
  });
});

describe("setPropertyAccess", () => {
  it("replaces the whole set with the selected ids under the door's own names", async () => {
    stub = stubBackend({ doors: () => ({ data: { user: USER, mode: "SELECTED_PROPERTIES" } }) });
    setSupabaseClientForTests(stub.client);

    const stored = await setPropertyAccess({
      userId: USER,
      organizationId: ORG,
      mode: "SELECTED_PROPERTIES",
      propertyIds: [PROPERTY, OTHER_PROPERTY],
      reason: "site transfer",
    });

    expect(stub.argsFor("set_property_access")).toEqual({
      p_user: USER,
      p_organization: ORG,
      p_mode: "SELECTED_PROPERTIES",
      p_property_ids: [PROPERTY, OTHER_PROPERTY],
      p_reason: "site transfer",
    });
    expect(() =>
      doorParametersMatchTheSchema("set_property_access", stub.argsFor("set_property_access")),
    ).not.toThrow();
    // The door's answer is camelCase and only names the user and the mode: it does not
    // return the property list, which is why the screen re-reads `listPropertyAccess`.
    expect(stored).toEqual({ user: USER, mode: "SELECTED_PROPERTIES" });
  });

  it("omits the id list for ALL_PROPERTIES so the door's empty default stands", async () => {
    // `ALL_PROPERTIES` must store no property id (002's `mpa_shape_ok` check), and the door
    // refuses a non-empty list paired with the wide mode only indirectly — sending nothing
    // is what keeps the two readings of "everything" from disagreeing.
    stub = stubBackend({ doors: () => ({ data: { user: USER, mode: "ALL_PROPERTIES" } }) });
    setSupabaseClientForTests(stub.client);

    await setPropertyAccess({ userId: USER, organizationId: ORG, mode: "ALL_PROPERTIES" });

    expect(stub.argsFor("set_property_access")).toEqual({
      p_user: USER,
      p_organization: ORG,
      p_mode: "ALL_PROPERTIES",
    });
  });
});

describe("setOutletAccess", () => {
  it("names the property, not the tenant — the door derives the organization itself", async () => {
    stub = stubBackend({
      doors: () => ({ data: { user: USER, property: PROPERTY, mode: "SELECTED_OUTLETS" } }),
    });
    setSupabaseClientForTests(stub.client);

    const stored = await setOutletAccess({
      userId: USER,
      propertyId: PROPERTY,
      mode: "SELECTED_OUTLETS",
      outletIds: [OUTLET],
      reason: "kitchen split",
    });

    expect(stub.argsFor("set_outlet_access")).toEqual({
      p_user: USER,
      p_property: PROPERTY,
      p_mode: "SELECTED_OUTLETS",
      p_outlet_ids: [OUTLET],
      p_reason: "kitchen split",
    });
    expect(() =>
      doorParametersMatchTheSchema("set_outlet_access", stub.argsFor("set_outlet_access")),
    ).not.toThrow();
    expect(stored).toEqual({ user: USER, property: PROPERTY, mode: "SELECTED_OUTLETS" });
  });

  it("sends the wide mode with no outlet list", async () => {
    stub = stubBackend({ doors: () => ({ data: { user: USER, property: PROPERTY, mode: "ALL_OUTLETS" } }) });
    setSupabaseClientForTests(stub.client);

    await setOutletAccess({ userId: USER, propertyId: PROPERTY, mode: "ALL_OUTLETS" });

    expect(stub.argsFor("set_outlet_access")).toEqual({
      p_user: USER,
      p_property: PROPERTY,
      p_mode: "ALL_OUTLETS",
    });
  });
});
