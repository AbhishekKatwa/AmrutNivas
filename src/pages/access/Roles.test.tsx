import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import RolesPage, {
  breadthError,
  grantScopeError,
  roleGrantability,
} from "@/pages/access/RolesPage";
import { resetForTests, useContextStore } from "@/state/context-store";
import type {
  OutletAccessMode,
  PropertyAccessMode,
  Role,
  ScopeLevel,
} from "@/domain/identity/types";

function makeRole(scope: ScopeLevel, over: Partial<Role> = {}): Role {
  return {
    id: `role-${scope}`,
    name: `ROLE_${scope}`,
    displayName: `${scope} role`,
    description: null,
    scopeLevel: scope,
    isSystem: true,
    organizationId: null,
    status: "ACTIVE",
    ...over,
  };
}

describe("roleGrantability", () => {
  it("blocks department-scope roles with the door's own reason", () => {
    const result = roleGrantability(makeRole("DEPARTMENT"));
    expect(result.grantable).toBe(false);
    expect(result.reason).toMatch(/Department-scoped roles cannot be granted/);
    expect(result.reason).toMatch(/confer nothing/);
  });

  it("allows organization, property, outlet and global roles", () => {
    for (const scope of ["ORGANIZATION", "PROPERTY", "OUTLET", "GLOBAL"] as const) {
      const result = roleGrantability(makeRole(scope));
      expect(result.grantable).toBe(true);
      expect(result.reason).toBe("");
    }
  });
});

describe("grantScopeError", () => {
  it("requires a property for a PROPERTY-scope role", () => {
    const role = makeRole("PROPERTY");
    expect(grantScopeError(role, { propertyId: null })).toMatch(/Choose the property/);
    expect(grantScopeError(role, { propertyId: "p1" })).toBeNull();
  });

  it("requires an outlet for an OUTLET-scope role", () => {
    const role = makeRole("OUTLET");
    expect(grantScopeError(role, { outletId: "" })).toMatch(/Choose the outlet/);
    expect(grantScopeError(role, { outletId: "o1" })).toBeNull();
  });

  it("requires no site target for an ORGANIZATION role", () => {
    expect(grantScopeError(makeRole("ORGANIZATION"), {})).toBeNull();
  });

  it("returns the department refusal even before any target is checked", () => {
    const error = grantScopeError(makeRole("DEPARTMENT"), { propertyId: "p1" });
    expect(error).toMatch(/Department-scoped/);
  });
});

describe("breadthError", () => {
  it("refuses a SELECTED mode with nothing chosen", () => {
    expect(breadthError("SELECTED_PROPERTIES" as PropertyAccessMode, [])).toMatch(/at least one/i);
    expect(breadthError("SELECTED_OUTLETS" as OutletAccessMode, [])).toMatch(/at least one/i);
  });

  it("accepts a SELECTED mode with a non-empty selection", () => {
    expect(breadthError("SELECTED_PROPERTIES" as PropertyAccessMode, ["p1"])).toBeNull();
    expect(breadthError("SELECTED_OUTLETS" as OutletAccessMode, ["o1", "o2"])).toBeNull();
  });

  it("accepts an ALL mode with no list", () => {
    expect(breadthError("ALL_PROPERTIES" as PropertyAccessMode, [])).toBeNull();
    expect(breadthError("ALL_OUTLETS" as OutletAccessMode, ["ignored"])).toBeNull();
  });
});

describe("RolesPage honest states", () => {
  afterEach(() => resetForTests());

  function render(): string {
    return renderToStaticMarkup(<RolesPage />);
  }

  it("says so plainly when there is no backend", () => {
    useContextStore.setState({ status: "unconfigured" });
    const html = render();
    expect(html).toContain("No backend configured");
    expect(html).toContain("Roles cannot be listed");
  });

  it("shows the sign-in state rather than a spinner when unauthenticated", () => {
    useContextStore.setState({ status: "unauthenticated" });
    const html = render();
    expect(html).toContain("Sign in required");
    expect(html).toContain("No active session");
  });

  it("renders an access-denied state when the viewer lacks role.view", () => {
    useContextStore.setState({
      status: "ready",
      context: { signedIn: true, organizationId: "org-1", propertyId: null, outletId: null, cleared: false },
      permissions: { organizationId: "org-1", propertyId: null, outletId: null, permissions: [] },
    });
    const html = render();
    expect(html).toContain("Access not available");
    expect(html).toContain("role.view");
  });

  it("renders the catalogue and points to the seed that holds the matrix", () => {
    useContextStore.setState({
      status: "ready",
      context: { signedIn: true, organizationId: "org-1", propertyId: null, outletId: null, cleared: false },
      permissions: {
        organizationId: "org-1",
        propertyId: null,
        outletId: null,
        permissions: ["role.view", "role.assign", "property.manage_access", "outlet.manage_access"],
      },
    });
    const html = render();
    expect(html).toContain("System roles");
    expect(html).toContain("006_seed_rbac.sql");
    expect(html).toContain("People &amp; grants");
  });
});
