/**
 * The runtime part of the domain contract. The rest is typing, which `tsc` proves.
 */
import { describe, expect, it } from "vitest";
import {
  can,
  PERMISSION_PATTERN,
  PERMISSION_SCOPES,
  type Permission,
  type PermissionSet,
} from "./types";

describe("Permission contract — domain.verb", () => {
  it("accepts the documented shape at the type level", () => {
    // These assignments only compile if the template literal type is right;
    // `npm run typecheck` is what proves them.
    const accepted: Permission[] = [
      "property.view",
      "outlet.edit",
      "organization.archive",
      "role.assign",
      "audit.view",
    ];
    expect(accepted).toHaveLength(5);
  });

  it("accepts the documented shape at runtime", () => {
    for (const value of ["room.create", "invoice.void", "stock.adjust", "menu.publish"]) {
      expect(PERMISSION_PATTERN.test(value)).toBe(true);
    }
  });

  it("rejects anything that is not exactly one domain and one verb", () => {
    for (const value of ["room", "room.create.extra", "Room.create", ".create", "room.", ""]) {
      expect(PERMISSION_PATTERN.test(value)).toBe(false);
    }
  });
});

describe("scope levels", () => {
  it("lists every level, in the order the resolution rules read them", () => {
    // Order is not cosmetic: `has_permission` walks GLOBAL -> DEPARTMENT and the
    // widest applicable grant wins, so a reordered list is a changed rule.
    expect([...PERMISSION_SCOPES]).toEqual([
      "GLOBAL",
      "ORGANIZATION",
      "PROPERTY",
      "OUTLET",
      "DEPARTMENT",
    ]);
    expect(new Set(PERMISSION_SCOPES).size).toBe(PERMISSION_SCOPES.length);
  });
});

describe("can", () => {
  const set: PermissionSet = {
    organizationId: "org_1",
    propertyId: "prop_1",
    outletId: null,
    permissions: ["property.view", "outlet.edit"],
  };

  it("answers for a capability the role holds", () => {
    expect(can("outlet.edit", set)).toBe(true);
  });

  it("answers no for one it does not", () => {
    expect(can("organization.archive", set)).toBe(false);
  });

  it("answers no before anything has resolved", () => {
    // The shell renders screens before `my_permissions` has returned; treating an
    // unresolved set as "allowed" would flash forbidden controls to a real user.
    expect(can("property.view", null)).toBe(false);
  });
});
