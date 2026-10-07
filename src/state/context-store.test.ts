/**
 * The active-context store, exercised through `getState()` against a stub transport.
 *
 * These are the assertions that make the tenancy model real before any screen exists:
 *   - a preview build with no data plane sets `unconfigured` and reaches ZERO doors;
 *   - a server-narrowed switch is adopted verbatim (never what we asked for), records the
 *     cleared notice, reloads permissions for the NEW scope only, and physically
 *     invalidates the OLD scope's cache — the cross-tenant-leak path;
 *   - two overlapping switches never interleave writes: the lower-issued request bails at
 *     its first checkpoint, so only the newer tenant lands.
 *
 * Prompt #03 added the session half (§25/§26/§27), so the stub client now carries a fake
 * GoTrue `auth` surface next to the door recorder:
 *   - bootstrap with NO session lands `unauthenticated` having called zero doors;
 *   - an account-standing refusal (suspended / missing profile) is the explainable
 *     `access-lost` state with human copy — the token itself never reaches the screen;
 *   - `signOut()` calls GoTrue and then clears every piece of tenant state;
 *   - `startSessionSync()` drops state on a sign-out without a wire call and
 *     re-validates on a refreshed session.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  startSessionSync,
  useContextStore,
  resetForTests,
  type ContextState,
} from "./context-store";
import {
  activateScope,
  peek,
  read,
  scopeFor,
  size,
  write,
} from "@/state/tenant-cache";
import { setSupabaseClientForTests } from "@/db/client";
import { stubDoors, type BackendStub, type StubResult } from "@/test-helpers/transport";
import type { ActiveContext } from "@/domain/identity/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const ORG_A = "a0000000-0000-4000-8000-00000000000a";
const ORG_B = "a0000000-0000-4000-8000-00000000000b";
const PROPERTY = "b0000000-0000-4000-8000-000000000001";
const USER_ID = "c0000000-0000-4000-8000-000000000001";

let stub: BackendStub;

/**
 * A mutable fake of the GoTrue surface the adapter touches: `getSession`,
 * `signOut`, `onAuthStateChange`. One session object shape (user only) proves
 * the store survives on identifiers — no token field exists to be copied.
 */
const authWire = {
  hasSession: true,
  signOutCalls: 0,
  listeners: [] as ((event: string, session: unknown) => void)[],
};

function resetAuthWire(): void {
  authWire.hasSession = true;
  authWire.signOutCalls = 0;
  authWire.listeners = [];
}

function currentSession(): { user: { id: string; email: string | null } } | null {
  return authWire.hasSession ? { user: { id: USER_ID, email: null } } : null;
}

/** Fire the auth event to every live subscription, as GoTrue would. */
function emit(event: string): void {
  for (const listener of [...authWire.listeners]) listener(event, currentSession());
}

const fakeAuth = {
  async getSession() {
    return { data: { session: currentSession() }, error: null };
  },
  async signOut() {
    authWire.signOutCalls += 1;
    authWire.hasSession = false;
    emit("SIGNED_OUT");
    return { error: null };
  },
  onAuthStateChange(callback: (event: string, session: unknown) => void) {
    authWire.listeners.push(callback);
    return {
      data: {
        subscription: {
          unsubscribe: () => {
            authWire.listeners = authWire.listeners.filter((l) => l !== callback);
          },
        },
      },
    };
  },
};

/** The door stub, plus the auth surface — the two halves one real client has. */
function attachAuth(client: SupabaseClient): SupabaseClient {
  return { ...client, auth: fakeAuth } as unknown as SupabaseClient;
}

/** Let every queued promise (bootstrap chains included) settle before asserting. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** Answer each door by name; anything unlisted resolves to `data: null`. */
function withDoors(responses: Record<string, StubResult>): BackendStub {
  stub = stubDoors((name) => responses[name]);
  setSupabaseClientForTests(attachAuth(stub.client));
  return stub;
}

const signedInOrgA = {
  resolve_active_context: {
    data: { signedIn: true, organizationId: ORG_A, propertyId: null, outletId: null },
  },
};

beforeEach(() => {
  resetForTests();
  resetAuthWire();
  stub = stubDoors(() => undefined);
  setSupabaseClientForTests(attachAuth(stub.client));
});

afterEach(() => setSupabaseClientForTests(undefined));

describe("resetForTests", () => {
  it("restores the pristine state so no assertion depends on order", () => {
    useContextStore.setState({ status: "ready", context: { ...empty(), organizationId: ORG_A } });
    resetForTests();
    const state = useContextStore.getState();
    expect(state.status).toBe("idle");
    expect(state.context).toEqual(empty());
    expect(state.permissions).toBeNull();
    expect(state.organization).toBeNull();
    expect(state.notices).toEqual([]);
    expect(state.error).toBeNull();
  });
});

describe("bootstrap", () => {
  it("with no backend sets unconfigured and issues ZERO door calls", async () => {
    // The preview-build path: there is no client, so the store must decide `unconfigured`
    // without ever touching the wire. Install a recording stub, then pin the seam to null
    // so nothing has a client to call; if the store wrongly proceeded it would fail on a
    // throw (not `unconfigured`), never reach the stub.
    const witness = stubDoors(() => ({ data: { signedIn: true, organizationId: ORG_A } }));
    setSupabaseClientForTests(null);

    await useContextStore.getState().bootstrap();

    expect(useContextStore.getState().status).toBe("unconfigured");
    expect(useContextStore.getState().error).toBeTruthy();
    expect(witness.calls.length).toBe(0);
  });

  it("with no session lands unauthenticated WITHOUT calling a single door (§25)", async () => {
    // The network-storm gate: doors refuse with `NIVAAS_NO_SESSION` when there is no
    // session, which is true but costs a round trip per door. The store asks the local
    // session FIRST and stops there.
    withDoors({
      ...signedInOrgA,
      my_permissions: { data: ["organization.view"] },
    });
    authWire.hasSession = false;

    await useContextStore.getState().bootstrap();

    const state = useContextStore.getState();
    expect(state.status).toBe("unauthenticated");
    expect(state.permissions).toBeNull();
    expect(stub.calls.length).toBe(0);
  });

  it("resolves the context then loads permissions for an organisation", async () => {
    withDoors({
      ...signedInOrgA,
      my_permissions: { data: ["organization.view", "property.edit"] },
    });

    await useContextStore.getState().bootstrap();

    const state = useContextStore.getState();
    expect(state.status).toBe("ready");
    expect(state.context.organizationId).toBe(ORG_A);
    expect(state.permissions).toEqual({
      organizationId: ORG_A,
      propertyId: null,
      outletId: null,
      permissions: ["organization.view", "property.edit"],
    });
    expect(stub.calls.map((call) => call.name)).toEqual([
      "resolve_active_context",
      "my_permissions",
    ]);
  });

  it("a signedIn:false answer yields unauthenticated with no permission set", async () => {
    withDoors({
      resolve_active_context: { data: { signedIn: false } },
      my_permissions: { data: ["organization.view"] },
    });

    await useContextStore.getState().bootstrap();

    const state = useContextStore.getState();
    expect(state.status).toBe("unauthenticated");
    expect(state.permissions).toBeNull();
    // No org means there is nothing to ask permissions about — the door is never called.
    expect(stub.calls.some((call) => call.name === "my_permissions")).toBe(false);
  });

  it("surfaces a no-session door refusal as unauthenticated", async () => {
    withDoors({
      resolve_active_context: { error: { message: "NIVAAS_NO_SESSION" } },
    });

    await useContextStore.getState().bootstrap();

    const state = useContextStore.getState();
    expect(state.status).toBe("unauthenticated");
    expect(state.permissions).toBeNull();
    expect(state.error).toBeTruthy();
  });

  it("a suspended account refusal lands access-lost with human copy, never the token (§27)", async () => {
    withDoors({
      resolve_active_context: { error: { message: "NIVAAS_ACCOUNT_SUSPENDED" } },
    });

    await useContextStore.getState().bootstrap();

    const state = useContextStore.getState();
    expect(state.status).toBe("access-lost");
    expect(state.permissions).toBeNull();
    expect(state.context).toEqual(empty());
    // The sentence comes from the denial copy table, not from the database text.
    expect(state.error).toBe("Your account has been suspended. Contact your administrator.");
    expect(state.error).not.toMatch(/NIVAAS_/);
  });

  it("a missing profile is the same explainable state, not a blank screen (§28)", async () => {
    withDoors({
      resolve_active_context: { error: { message: "NIVAAS_PROFILE_MISSING" } },
    });

    await useContextStore.getState().bootstrap();

    expect(useContextStore.getState().status).toBe("access-lost");
    expect(useContextStore.getState().error).toBe(
      "Your account is not fully set up. Contact your administrator.",
    );
  });
});

describe("switchContext", () => {
  it("adopts the server-narrowed context, records the cleared notice and reloads for the NEW scope", async () => {
    withDoors({
      // We ask for B + a property; the server keeps only B (property revoked).
      set_active_context: { data: { organizationId: ORG_B, propertyId: null, outletId: null } },
      my_permissions: { data: ["organization.view"] },
    });

    await useContextStore.getState().switchContext({
      organizationId: ORG_B,
      propertyId: PROPERTY,
    });

    const state = useContextStore.getState();
    expect(state.context).toEqual({
      signedIn: true,
      organizationId: ORG_B,
      propertyId: null,
      outletId: null,
      cleared: true,
    });
    expect(state.notices.map((n) => n.kind)).toEqual(["context-cleared"]);
    // Permissions reloaded for the narrowed new scope only — never for the property we asked for.
    expect(stub.argsFor("my_permissions")).toEqual({
      p_organization: ORG_B,
      p_property: null,
      p_outlet: null,
    });
  });

  it("invalidates the OLD scope's tenant cache (fails if the invalidation is removed)", async () => {
    const contextA: ActiveContext = {
      ...empty(),
      signedIn: true,
      organizationId: ORG_A,
    };
    const scopeA = scopeFor(contextA);
    // Pre-warm Organization A's cache under A's active scope and point the store at A.
    activateScope(scopeA);
    write(scopeA, "properties", [{ id: PROPERTY, name: "A's hotel" }]);
    useContextStore.setState({ context: contextA });
    expect(peek(scopeA, "properties")).toHaveLength(1);

    withDoors({
      set_active_context: { data: { organizationId: ORG_B, propertyId: null, outletId: null } },
      my_permissions: { data: ["organization.view"] },
    });

    await useContextStore.getState().switchContext({ organizationId: ORG_B });

    // A's rows are physically reclaimed, not merely gated off, so they cannot leak back.
    expect(peek(scopeA, "properties")).toBeUndefined();
    // And the store now reads as Organization B.
    expect(useContextStore.getState().context.organizationId).toBe(ORG_B);
    expect(useContextStore.getState().currentScope()).toBe(scopeFor(useContextStore.getState().context));
  });

  it("discards the earlier of two overlapping switches so writes never interleave", async () => {
    withDoors({
      set_active_context: { data: { organizationId: ORG_A, propertyId: null, outletId: null } },
      my_permissions: { data: ["organization.view"] },
    });

    // Two switches issued back to back. The second takes the higher commit slot, so the
    // first bails at its very first checkpoint and never loads permissions or commits.
    const switchB = stubDoors((name) => {
      if (name === "set_active_context") {
        return { data: { organizationId: ORG_B, propertyId: null, outletId: null } };
      }
      if (name === "my_permissions") return { data: ["property.edit"] };
      return undefined;
    });
    setSupabaseClientForTests(attachAuth(switchB.client));

    const first = useContextStore.getState().switchContext({ organizationId: ORG_A });
    const second = useContextStore.getState().switchContext({ organizationId: ORG_B });
    await Promise.all([first, second]);

    const state = useContextStore.getState();
    expect(state.context.organizationId).toBe(ORG_B);
    expect(state.permissions?.permissions).toEqual(["property.edit"]);
    // Only the winning switch reached the permissions door; the loser discarded early.
    expect(switchB.calls.filter((call) => call.name === "my_permissions").length).toBe(1);
    expect(switchB.argsFor("my_permissions")).toMatchObject({ p_organization: ORG_B });
    expect(state.status).toBe("ready");
  });
});

describe("claimDemo", () => {
  it("adopts the claimed organization and its demo flag", async () => {
    withDoors({
      claim_demo_organization: {
        data: { id: ORG_A, code: "DEMO", is_demo: true, status: "ACTIVE", version: 1 },
      },
      resolve_active_context: {
        data: { signedIn: true, organizationId: ORG_A, propertyId: null, outletId: null },
      },
      my_permissions: { data: ["organization.view"] },
    });

    await useContextStore.getState().claimDemo();

    const state = useContextStore.getState();
    expect(state.organization).toMatchObject({ id: ORG_A, code: "DEMO", isDemo: true });
    expect(state.status).toBe("ready");
    expect(state.context.organizationId).toBe(ORG_A);
    expect(state.permissions?.permissions).toEqual(["organization.view"]);
  });
});

describe("signOut", () => {
  it("invalidates the session at GoTrue, then clears context, permissions and the whole tenant cache", async () => {
    withDoors({
      ...signedInOrgA,
      my_permissions: { data: ["organization.view"] },
    });
    await useContextStore.getState().bootstrap();
    const scopeA = scopeFor(useContextStore.getState().context);
    activateScope(scopeA);
    write(scopeA, "properties", ["warm"]);

    await useContextStore.getState().signOut();

    // §26: a real server-side sign-out, not just a state wipe.
    expect(authWire.signOutCalls).toBe(1);
    const state = useContextStore.getState();
    expect(state.status).toBe("unauthenticated");
    expect(state.context).toEqual(empty());
    expect(state.permissions).toBeNull();
    expect(state.organization).toBeNull();
    expect(state.notices).toEqual([]);
    expect(size()).toBe(0);
    expect(read(scopeA, "properties")).toBeUndefined();
  });
});

describe("startSessionSync", () => {
  it("drops every piece of tenant state on a sign-out WITHOUT a wire call", async () => {
    withDoors({
      ...signedInOrgA,
      my_permissions: { data: ["organization.view"] },
    });
    await useContextStore.getState().bootstrap();
    const scopeA = scopeFor(useContextStore.getState().context);
    write(scopeA, "properties", ["warm"]);
    const callsBefore = stub.calls.length;

    const detach = startSessionSync();
    emit("SIGNED_OUT");

    const state = useContextStore.getState();
    expect(state.status).toBe("unauthenticated");
    expect(state.permissions).toBeNull();
    expect(peek(scopeA, "properties")).toBeUndefined();
    // A session that is gone needs no proof from the server — no door is asked.
    expect(stub.calls.length).toBe(callsBefore);
    detach();
  });

  it("re-asks the server for the truth when the session is refreshed", async () => {
    withDoors({
      ...signedInOrgA,
      my_permissions: { data: ["organization.view"] },
    });
    await useContextStore.getState().bootstrap();
    const callsBefore = stub.calls.length;

    const detach = startSessionSync();
    emit("TOKEN_REFRESHED");
    await settle();

    // The refreshed JWT is re-proved through the same doors, never trusted blindly.
    expect(stub.calls.length).toBeGreaterThan(callsBefore);
    expect(stub.calls.slice(callsBefore).map((call) => call.name)).toEqual([
      "resolve_active_context",
      "my_permissions",
    ]);
    expect(useContextStore.getState().status).toBe("ready");
    detach();
  });

  it("detach stops the subscription so later events change nothing", async () => {
    withDoors({
      ...signedInOrgA,
      my_permissions: { data: ["organization.view"] },
    });
    await useContextStore.getState().bootstrap();

    const detach = startSessionSync();
    detach();
    emit("SIGNED_OUT");

    expect(useContextStore.getState().status).toBe("ready");
  });

  it("INITIAL_SESSION does not trigger a second bootstrap (the app's own covers it)", async () => {
    withDoors({
      ...signedInOrgA,
      my_permissions: { data: ["organization.view"] },
    });
    await useContextStore.getState().bootstrap();
    const callsBefore = stub.calls.length;

    const detach = startSessionSync();
    emit("INITIAL_SESSION");
    await settle();

    expect(stub.calls.length).toBe(callsBefore);
    detach();
  });
});

describe("selectors", () => {
  it("can() reflects the loaded permissions and is false with none loaded", async () => {
    resetForTests();
    expect(useContextStore.getState().can("organization.view")).toBe(false);

    withDoors({
      ...signedInOrgA,
      my_permissions: { data: ["organization.view"] },
    });
    await useContextStore.getState().bootstrap();

    const state = useContextStore.getState() as ContextState;
    expect(state.can("organization.view")).toBe(true);
    expect(state.can("property.edit")).toBe(false);
    expect(state.currentScope()).toBe(scopeFor({ organizationId: ORG_A, propertyId: null, outletId: null }));
  });
});

/** A fresh context object so each test can hand the store a clean baseline. */
function empty(): ActiveContext {
  return { signedIn: false, organizationId: null, propertyId: null, outletId: null, cleared: false };
}
