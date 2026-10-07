/**
 * The gate a hand-typed URL runs into (§21).
 *
 * What is proven is the safety half: on a refusal the page component is never mounted —
 * not rendered-then-hidden, but never called, so none of its reads or its own affordances
 * ever run — while a session that is still resolving gets a loading state instead of a
 * flash of denial, and the states `App` already explains do not get a second copy here.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { GuardedRoute } from "@/app/RouteGuard";
import { ROUTES, type AppRoute } from "@/app/routes";
import type { Permission } from "@/domain/identity/types";
import { resetForTests, useContextStore } from "@/state/context-store";

const ORG = "8b1c1f2e-7a5d-4e3b-9c2a-1d0f9e8b7a65";
const BODY = "the team page body";

function TeamPage() {
  return <p>{BODY}</p>;
}

/** Records whether React ever got as far as calling it — the mount itself is the failure. */
let mounted = false;
function MountRecorder() {
  mounted = true;
  return <p>the page mounted behind a refusal</p>;
}

function guarded(permission: Permission, path = "/team"): AppRoute {
  return { path, component: TeamPage, permission };
}

function render(route: AppRoute, path = route.path): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <GuardedRoute route={route} />
    </MemoryRouter>,
  );
}

function signedInWith(rights: Permission[]): void {
  useContextStore.setState({
    status: "ready",
    context: { signedIn: true, organizationId: ORG, propertyId: null, outletId: null, cleared: false },
    permissions: { organizationId: ORG, propertyId: null, outletId: null, permissions: rights },
  });
}

beforeEach(() => {
  resetForTests();
});

describe("GuardedRoute", () => {
  it("mounts the page when the session holds the route's capability", () => {
    signedInWith(["user.view"]);
    expect(render(guarded("user.view"))).toContain(BODY);
  });

  it("refuses direct navigation the person's role does not cover, without the page", () => {
    signedInWith(["property.view"]);
    mounted = false;
    const html = render({ path: "/team", component: MountRecorder, permission: "user.view" });
    // Not "rendered then hidden": §21's fail-safe means the screen never runs at all, so
    // none of its reads fires and none of its affordances ever reaches the person.
    expect(mounted).toBe(false);
    expect(html).not.toContain("the page mounted behind a refusal");
    expect(html).toContain("Access restricted");
  });

  it("shows the loading state rather than a flash of denial while the session resolves", () => {
    for (const status of ["idle", "loading"] as const) {
      useContextStore.setState({ status });
      const html = render(guarded("user.view"));
      expect(html).toContain("Checking access");
      expect(html).not.toContain(BODY);
      expect(html).not.toContain("Access restricted");
    }
  });

  it("gives an unsigned browser no page and no invented permission message", () => {
    useContextStore.setState({
      status: "unauthenticated",
      context: { signedIn: false, organizationId: null, propertyId: null, outletId: null, cleared: false },
      permissions: null,
    });
    const html = render(guarded("user.view"));
    // The redirect itself needs a live router; what the static render can pin is that
    // neither the page nor a permission claim was emitted.
    expect(html).not.toContain(BODY);
    expect(html).not.toContain("Access restricted");
  });

  it("keeps an account-standing refusal out of the page tree that `App` is already explaining", () => {
    useContextStore.setState({
      status: "access-lost",
      context: { signedIn: false, organizationId: null, propertyId: null, outletId: null, cleared: false },
      permissions: null,
      error: "Your account has been suspended. Contact your administrator.",
    });
    expect(render(guarded("user.view"))).toBe("");
  });

  it("does not invent a denial when the build has no data plane to ask", () => {
    // No backend means no server answer for any step of the ladder, and "you are not
    // signed in" would blame the person for a preview build. The screen's own
    // no-connection state is the honest one.
    useContextStore.setState({ status: "unconfigured", permissions: null });
    expect(render(guarded("user.view"))).toContain(BODY);
  });

  it("leaves an ungated route open to every signed-in person", () => {
    // The wizard has to stay reachable: it is how the first tenant gets created.
    signedInWith([]);
    expect(render({ path: "/onboarding", component: TeamPage })).toContain(BODY);
  });

  it("closes the session the moment the switch drops the capability", () => {
    signedInWith(["user.view"]);
    expect(render(guarded("user.view"))).toContain(BODY);
    useContextStore.setState({
      permissions: { organizationId: ORG, propertyId: null, outletId: null, permissions: [] },
    });
    const html = render(guarded("user.view"));
    expect(html).not.toContain(BODY);
    expect(html).toContain("Access restricted");
  });
});

describe("the route table's capability demands", () => {
  it("names only catalogue keys the database can actually grant", () => {
    // The scrape in `taxonomy.test.ts` diffs these against 006; this pins that the gate
    // reads the field it is meant to read rather than a list kept somewhere else.
    const demanded = ROUTES.map((route) => route.permission).filter((p): p is Permission => p !== undefined);
    expect(demanded).toEqual(["organization.view", "property.view", "user.view", "role.view", "audit.view"]);
  });

  it("leaves the landing, the wizard and the reach-based lists ungated", () => {
    const open = ROUTES.filter((route) => route.permission === undefined).map((route) => route.path);
    expect(open).toEqual(["/", "/onboarding", "/outlets", "/departments"]);
  });
});
