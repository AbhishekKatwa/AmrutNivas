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
  claimDemoEstate,
  loadPermissions,
  resolveActiveContext,
  setActiveContext,
} from "./session-service";
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
