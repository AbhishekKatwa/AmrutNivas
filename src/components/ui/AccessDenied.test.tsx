import { describe, expect, it, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AccessDenied, accessReasonFor } from "@/components/ui/AccessDenied";
import { EmptyState } from "@/components/ui/EmptyState";
import { resetForTests, useContextStore } from "@/state/context-store";
import type { Permission } from "@/domain/identity/types";

const ORG = "8b1c1f2e-7a5d-4e3b-9c2a-1d0f9e8b7a65";

/** A real session whose role set was loaded and does not contain the requested right. */
function signedInWithout(rights: Permission[] = ["property.view"]): void {
  useContextStore.setState({
    status: "ready",
    permissions: {
      organizationId: ORG,
      propertyId: null,
      outletId: null,
      permissions: rights,
    },
  });
}

beforeEach(() => {
  resetForTests();
});

describe("accessReasonFor", () => {
  it("separates a role denial from every other reason `can()` says no", () => {
    expect(accessReasonFor("ready", true)).toBe("role");
    expect(accessReasonFor("ready", false)).toBe("no-organization");
    expect(accessReasonFor("unauthenticated", false)).toBe("no-session");
    expect(accessReasonFor("unconfigured", false)).toBe("no-data-plane");
    expect(accessReasonFor("loading", false)).toBe("resolving");
    expect(accessReasonFor("idle", false)).toBe("resolving");
  });
});

describe("AccessDenied", () => {
  it("names the denied capability and the permission behind a real role denial", () => {
    signedInWithout();
    const html = renderToStaticMarkup(
      <AccessDenied capability="create a property" permission="property.create" />,
    );
    expect(html).toContain("Access not available");
    expect(html).toContain("create a property");
    expect(html).toContain("property.create");
    expect(html).toContain("denied by your role");
    expect(html).toContain("permission");
  });

  it("qualifies the denial with the record it is about", () => {
    signedInWithout();
    const html = renderToStaticMarkup(
      <AccessDenied capability="archive" permission="property.archive" resourceName="Amrut Residency" />,
    );
    expect(html).toContain("archive for “Amrut Residency”");
  });

  it("reads as a permission state, not a data error", () => {
    signedInWithout();
    const html = renderToStaticMarkup(
      <AccessDenied capability="view the ledger" permission="audit.view" />,
    ).toLowerCase();
    // A denial must not invite a retry — the record is fine, the right is absent.
    expect(html).not.toContain("went wrong");
    expect(html).not.toContain("try again");
    expect(html).not.toContain("error");
  });

  it("is distinct markup from a generic empty/error state", () => {
    signedInWithout();
    const denied = renderToStaticMarkup(
      <AccessDenied capability="archive the organization" permission="organization.archive" />,
    );
    const generic = renderToStaticMarkup(
      <EmptyState title="Access not available" description="Nothing to show." />,
    );
    expect(denied).not.toEqual(generic);
    // The permission string is the giveaway that this is a rights problem.
    expect(denied).toContain("organization.archive");
    expect(generic).not.toContain("organization.archive");
  });

  it("offers a real way back when a handler is supplied", () => {
    signedInWithout();
    const html = renderToStaticMarkup(
      <AccessDenied capability="invite a member" permission="user.invite" onBack={() => {}} backLabel="Back to members" />,
    );
    expect(html).toContain("<button");
    expect(html).toContain("Back to members");
  });

  it("suggests a request path when there is no back handler", () => {
    signedInWithout();
    const html = renderToStaticMarkup(<AccessDenied capability="suspend a membership" permission="user.suspend" />);
    expect(html).toContain("request");
    expect(html).toContain("access");
  });

  it("shows guidance on whom to ask only for a role denial", () => {
    signedInWithout();
    const html = renderToStaticMarkup(
      <AccessDenied
        capability="view the audit trail"
        permission="audit.view"
        hint="Ask an administrator for audit.view."
      />,
    );
    expect(html).toContain("Ask an administrator for audit.view.");

    useContextStore.setState({ status: "unconfigured", permissions: null });
    const unconfigured = renderToStaticMarkup(
      <AccessDenied
        capability="view the audit trail"
        permission="audit.view"
        hint="Ask an administrator for audit.view."
      />,
    );
    expect(unconfigured).not.toContain("Ask an administrator for audit.view.");
  });

  it("never claims a role denial when the build has no data plane", () => {
    useContextStore.setState({ status: "unconfigured", permissions: null });
    const html = renderToStaticMarkup(
      <AccessDenied capability="view the audit trail" permission="audit.view" />,
    );
    expect(html).toContain("No data plane connected");
    expect(html).toContain("Nothing was denied");
    expect(html).not.toContain("denied by your role");
    expect(html).not.toContain("audit.view");
  });

  it("says sign-in is missing when there is no session", () => {
    useContextStore.setState({ status: "unauthenticated", permissions: null });
    const html = renderToStaticMarkup(<AccessDenied capability="view the team" permission="user.view" />);
    expect(html).toContain("Not signed in");
    expect(html).toContain("Sign in");
    expect(html).not.toContain("denied by your role");
  });

  it("says the tenant is missing when a session has no organization", () => {
    useContextStore.setState({ status: "ready", permissions: null });
    const html = renderToStaticMarkup(<AccessDenied capability="view roles" permission="role.view" />);
    expect(html).toContain("No organization selected");
    expect(html).not.toContain("denied by your role");
  });

  it("says the answer is pending while the session is still loading", () => {
    useContextStore.setState({ status: "loading", permissions: null });
    const html = renderToStaticMarkup(<AccessDenied capability="view the team" permission="user.view" />);
    expect(html).toContain("Checking your access");
    expect(html).toContain("still loading");
    expect(html).not.toContain("denied by your role");
  });
});
