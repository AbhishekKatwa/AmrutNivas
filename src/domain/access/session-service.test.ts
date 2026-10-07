/**
 * The session contract, exercised against a stub transport.
 *
 * These are the assertions that matter before any screen exists: the parameter names
 * the doors actually accept (§29's resolution path), that a level the server dropped
 * becomes a visible `cleared` flag instead of a silently wrong context, and that a
 * door which never ran leaves no half-populated scope behind.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  accessDenialCopy,
  claimDemoEstate,
  evaluateAccess,
  loadPermissions,
  resolveActiveContext,
  setActiveContext,
} from "./session-service";
import { authorize, DENIAL_LADDER, type AccessFacts } from "./authorize";
import { denialCopy } from "./authorize";
import type { Permission } from "@/domain/identity/types";
import { setSupabaseClientForTests } from "@/db/client";
import {
  doorParametersMatchTheSchema,
  stubDoors,
  type BackendStub,
} from "@/test-helpers/transport";

const ORG = "a0000000-0000-4000-8000-000000000001";
const PROPERTY = "a1000000-0000-4000-8000-000000000001";
const OUTLET = "a2000000-0000-4000-8000-000000000001";

let stub: BackendStub;

beforeEach(() => {
  stub = stubDoors(() => undefined);
  setSupabaseClientForTests(stub.client);
});

afterEach(() => setSupabaseClientForTests(undefined));

describe("resolveActiveContext", () => {
  it("sends no parameters, because the actor comes from the JWT", async () => {
    stub = stubDoors(() => ({ data: { signedIn: true } }));
    setSupabaseClientForTests(stub.client);
    await resolveActiveContext();
    expect(stub.calls).toEqual([{ name: "resolve_active_context", args: {} }]);
  });

  it("reads the server's answer back as a full context", async () => {
    stub = stubDoors(() => ({
      data: { signedIn: true, organizationId: ORG, propertyId: PROPERTY, cleared: false },
    }));
    setSupabaseClientForTests(stub.client);
    await expect(resolveActiveContext()).resolves.toEqual({
      signedIn: true,
      organizationId: ORG,
      propertyId: PROPERTY,
      outletId: null,
      cleared: false,
    });
  });

  it("reports a pre-sign-in answer as signed out with no scope", async () => {
    // `resolve_active_context` returns only `signedIn: false` before a session; the
    // absent keys must not reach the store as undefined.
    stub = stubDoors(() => ({ data: { signedIn: false } }));
    setSupabaseClientForTests(stub.client);
    const context = await resolveActiveContext();
    expect(context).toEqual({
      signedIn: false,
      organizationId: null,
      propertyId: null,
      outletId: null,
      cleared: false,
    });
    expect(Object.values(context)).not.toContain(undefined);
  });

  it("survives a door that answered with nothing", async () => {
    stub = stubDoors(() => ({ data: null }));
    setSupabaseClientForTests(stub.client);
    expect((await resolveActiveContext()).signedIn).toBe(false);
  });

  it("uses the parameter names the migration declares", async () => {
    expect(() => doorParametersMatchTheSchema("resolve_active_context", {})).not.toThrow();
  });
});

describe("setActiveContext", () => {
  it("sends the three context levels the door accepts", async () => {
    stub = stubDoors(() => ({ data: { organizationId: ORG, propertyId: null, outletId: null } }));
    setSupabaseClientForTests(stub.client);

    await setActiveContext({ organizationId: ORG, propertyId: PROPERTY, outletId: OUTLET });

    const sent = stub.argsFor("set_active_context");
    expect(sent).toEqual({ p_organization: ORG, p_property: PROPERTY, p_outlet: OUTLET });
    expect(() => doorParametersMatchTheSchema("set_active_context", sent)).not.toThrow();
  });

  it("marks the context cleared when the server dropped a level", async () => {
    // The door narrows rather than refusing, and answers with what it kept. That
    // difference is the only signal a screen has that access changed under it.
    stub = stubDoors(() => ({ data: { organizationId: ORG, propertyId: null, outletId: null } }));
    setSupabaseClientForTests(stub.client);

    await expect(
      setActiveContext({ organizationId: ORG, propertyId: PROPERTY }),
    ).resolves.toEqual({
      signedIn: true,
      organizationId: ORG,
      propertyId: null,
      outletId: null,
      cleared: true,
    });
  });

  it("reports a clean switch as not cleared", async () => {
    stub = stubDoors(() => ({ data: { organizationId: ORG, propertyId: null, outletId: null } }));
    setSupabaseClientForTests(stub.client);
    const context = await setActiveContext({ organizationId: ORG });
    expect(context.cleared).toBe(false);
    expect(context.signedIn).toBe(true);
  });

  it("sends an explicit null to clear the whole context", async () => {
    // Signing out of a tenant is a write, not an omission: the door's default would
    // otherwise leave the stored context alone.
    stub = stubDoors(() => ({ data: {} }));
    setSupabaseClientForTests(stub.client);

    await setActiveContext({ organizationId: null, propertyId: null, outletId: null });

    expect(stub.argsFor("set_active_context")).toEqual({
      p_organization: null,
      p_property: null,
      p_outlet: null,
    });
  });
});

describe("loadPermissions", () => {
  it("asks for one context's capabilities", async () => {
    stub = stubDoors(() => ({ data: ["organization.view", "property.edit"] }));
    setSupabaseClientForTests(stub.client);

    const set = await loadPermissions(ORG, PROPERTY, null);

    expect(set).toEqual({
      organizationId: ORG,
      propertyId: PROPERTY,
      outletId: null,
      permissions: ["organization.view", "property.edit"],
    });
    expect(() => doorParametersMatchTheSchema("my_permissions", stub.argsFor("my_permissions"))).not.toThrow();
  });

  it("returns an empty set, not a crash, when the door grants nothing", async () => {
    stub = stubDoors(() => ({ data: [] }));
    setSupabaseClientForTests(stub.client);
    const set = await loadPermissions(ORG);
    expect(set.permissions).toEqual([]);
  });

  it("treats a non-array answer as no permissions", async () => {
    // A door that answers `null` (no session) would otherwise make every `can()`
    // call throw inside a render.
    stub = stubDoors(() => ({ data: null }));
    setSupabaseClientForTests(stub.client);
    await expect(loadPermissions(ORG)).resolves.toMatchObject({ permissions: [] });
  });
});

/**
 * `AccessFacts` in which every question the ladder asks is answered YES, then the one field
 * that has to be NO for `reason`. `"ACTIVE"` means "leave everything yes" — the allowed case,
 * which is as much a contract as any refusal and the one a test suite most often skips.
 */
function factsLeadingTo(reason: string): AccessFacts {
  const facts: AccessFacts = {
    signedIn: true,
    profileExists: true,
    accountStanding: "ACTIVE",
    membershipStatus: "ACTIVE",
    organizationStatus: "ACTIVE",
    propertyRequested: null,
    propertyReachable: true,
    outletRequested: null,
    outletReachable: true,
    permissionRequested: "stock.adjust",
    permissionHeld: true,
  };
  switch (reason) {
    case "NOT_AUTHENTICATED":
      return { ...facts, signedIn: false };
    case "PROFILE_MISSING":
      return { ...facts, profileExists: false };
    case "ACCOUNT_SUSPENDED":
      return { ...facts, accountStanding: "SUSPENDED" };
    case "ACCOUNT_DEACTIVATED":
      return { ...facts, accountStanding: "DEACTIVATED" };
    case "NO_ACTIVE_MEMBERSHIP":
      // null covers "no membership row at all", which 010 refuses identically (§18: the
      // person is told access moved, not given the internal distinction).
      return { ...facts, membershipStatus: null };
    case "ORGANIZATION_NOT_ACTIVE":
      return { ...facts, organizationStatus: "ARCHIVED" };
    case "PROPERTY_ACCESS_DENIED":
      return { ...facts, propertyRequested: PROPERTY, propertyReachable: false };
    case "OUTLET_ACCESS_DENIED":
      return { ...facts, outletRequested: OUTLET, outletReachable: false };
    case "PERMISSION_DENIED":
      return { ...facts, permissionHeld: false };
    default:
      return facts;
  }
}

describe("evaluateAccess — asking the server why, instead of guessing", () => {
  it("sends the four parameters 010 declares, with the optional levels explicit", async () => {
    stub = stubDoors(() => ({ data: { allowed: true, reason: null } }));
    setSupabaseClientForTests(stub.client);

    const verdict = await evaluateAccess({
      permission: "stock.adjust" as Permission,
      organizationId: ORG,
      propertyId: PROPERTY,
    });

    const args = stub.argsFor("evaluate_access");
    doorParametersMatchTheSchema("evaluate_access", args);
    expect(args).toEqual({
      p_permission: "stock.adjust",
      p_organization: ORG,
      p_property: PROPERTY,
      p_outlet: null,
    });
    // The positive case: an allowed action reads as allowed, so a screen built on this verdict
    // is not merely a wall of refusals. `authorize()`'s pure mirror agrees on the same facts.
    expect(verdict).toEqual({ allowed: true, reason: null });
    expect(authorize({
      permissionRequested: "stock.adjust",
      signedIn: true,
      profileExists: true,
      accountStanding: "ACTIVE",
      membershipStatus: "ACTIVE",
      organizationStatus: "ACTIVE",
      propertyRequested: PROPERTY,
      propertyReachable: true,
      outletRequested: null,
      outletReachable: false,
      permissionHeld: true,
    })).toEqual({ allowed: true });
  });

  it("carries the server's reason code back without printing it as copy", async () => {
    stub = stubDoors(() => ({ data: { allowed: false, reason: "OUTLET_ACCESS_DENIED" } }));
    setSupabaseClientForTests(stub.client);

    const verdict = await evaluateAccess({
      permission: "stock.adjust" as Permission,
      organizationId: ORG,
      outletId: OUTLET,
    });

    expect(verdict).toEqual({ allowed: false, reason: "OUTLET_ACCESS_DENIED" });
    // §46: the code belongs in a log line; a person gets the sentence from DENIAL_MESSAGES.
    const copy = accessDenialCopy(verdict);
    expect(copy).toBe("You do not have access to this outlet.");
    expect(copy).not.toContain("NIVAAS_");
    expect(copy).not.toContain("OUTLET_ACCESS_DENIED");
  });

  it("agrees with authorize() on the ladder, which is the whole point of having both", () => {
    // 010's `evaluate_access` and `authorize()` are two renderings of one rule. If the pure
    // mirror drifts, a screen would show a verdict the server does not hold — so every reason
    // code the door can emit must be a code the ladder can also name, with the same sentence.
    for (const reason of DENIAL_LADDER) {
      expect(authorize(factsLeadingTo(reason))).toEqual({ allowed: false, reason });
      expect(accessDenialCopy({ allowed: false, reason })).toBe(denialCopy(reason));
    }
    // And the ladder's happy path matches the door's: all facts true, all facts named.
    expect(authorize(factsLeadingTo("ACTIVE"))).toEqual({ allowed: true });
  });

  it("fails closed on a payload it cannot read", async () => {
    // A door that answers nothing, or answers with a reason this client has never seen, must
    // never be interpreted as consent. The window where a migration has widened the vocabulary
    // ahead of this file is exactly the window where getting this wrong grants access.
    stub = stubDoors(() => ({ data: null }));
    setSupabaseClientForTests(stub.client);
    await expect(
      evaluateAccess({ permission: "stock.adjust" as Permission, organizationId: ORG }),
    ).resolves.toEqual({ allowed: false, reason: "PERMISSION_DENIED" });

    stub = stubDoors(() => ({ data: { allowed: false, reason: "SOMETHING_NEW" } }));
    setSupabaseClientForTests(stub.client);
    await expect(
      evaluateAccess({ permission: "stock.adjust" as Permission, organizationId: ORG }),
    ).resolves.toEqual({ allowed: false, reason: "PERMISSION_DENIED" });
  });
});

describe("claimDemoEstate", () => {
  it("returns the claimed organization with its demo flag intact", async () => {
    stub = stubDoors(() => ({
      data: { id: ORG, code: "DEMO", is_demo: true, status: "ACTIVE", version: 1 },
    }));
    setSupabaseClientForTests(stub.client);

    const organization = await claimDemoEstate();

    expect(organization).toEqual({ id: ORG, code: "DEMO", isDemo: true, status: "ACTIVE", version: 1 });
    expect(stub.calls).toEqual([{ name: "claim_demo_organization", args: {} }]);
  });
});
