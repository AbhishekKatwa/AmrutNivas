import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import TeamPage, {
  buildInviteDoorInput,
  invitationAcceptLink,
  memberActionState,
  type InviteFormValues,
  type MemberActionView,
} from "@/pages/team/TeamPage";
import { archiveActionState } from "@/components/ui/ArchiveDialog";
import { resetForTests, useContextStore } from "@/state/context-store";
import type { MembershipStatus, Role, ScopeLevel } from "@/domain/identity/types";

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

function form(over: Partial<InviteFormValues> = {}): InviteFormValues {
  return {
    organizationId: "org-1",
    email: "person@example.com",
    fullName: "Person One",
    role: "ORG_OWNER",
    propertyIds: [],
    outletIds: [],
    ...over,
  };
}

/* ------------------------------------------------------------- invite -> door input */

describe("buildInviteDoorInput", () => {
  it("builds an organization-wide input and trims the address", () => {
    const result = buildInviteDoorInput(form({ email: "  a@b.co  " }), makeRole("ORGANIZATION"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input).toEqual({
        organizationId: "org-1",
        email: "a@b.co",
        role: "ROLE_ORGANIZATION",
        fullName: "Person One",
      });
    }
  });

  it("drops an empty full name rather than sending a blank", () => {
    const result = buildInviteDoorInput(form({ fullName: "   " }), makeRole("ORGANIZATION"));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.input).not.toHaveProperty("fullName");
  });

  it("requires a property for a PROPERTY-scope role", () => {
    const result = buildInviteDoorInput(form({ role: "ROLE_PROPERTY" }), makeRole("PROPERTY"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.propertyIds).toMatch(/at least one property/i);
  });

  it("requires an outlet for an OUTLET-scope role", () => {
    const result = buildInviteDoorInput(form({ role: "ROLE_OUTLET" }), makeRole("OUTLET"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.outletIds).toMatch(/at least one outlet/i);
  });

  it("carries the chosen property and outlet ids into the door input", () => {
    const result = buildInviteDoorInput(
      form({ role: "ROLE_OUTLET", outletIds: ["o1"], propertyIds: ["p1"] }),
      makeRole("OUTLET"),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.outletIds).toEqual(["o1"]);
      expect(result.input.propertyIds).toEqual(["p1"]);
    }
  });

  it("refuses a department-scope role with the door reason", () => {
    const result = buildInviteDoorInput(form({ role: "ROLE_DEPARTMENT" }), makeRole("DEPARTMENT"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.role).toMatch(/Department-scoped roles cannot be granted/);
  });

  it("rejects a missing or malformed email", () => {
    const blank = buildInviteDoorInput(form({ email: "" }), makeRole("ORGANIZATION"));
    if (blank.ok) throw new Error("expected failure");
    expect(blank.errors.email).toMatch(/required/i);

    const malformed = buildInviteDoorInput(form({ email: "not-an-email" }), makeRole("ORGANIZATION"));
    if (malformed.ok) throw new Error("expected failure");
    expect(malformed.errors.email).toMatch(/valid email/i);
  });

  it("refuses when no role is chosen", () => {
    const result = buildInviteDoorInput(form({ role: "" }), null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.role).toMatch(/Choose a role/);
  });

  it("never puts a token in the request the operator builds", () => {
    const result = buildInviteDoorInput(form(), makeRole("ORGANIZATION"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input).not.toHaveProperty("token");
      expect(JSON.stringify(result.input)).not.toContain("token");
    }
  });
});

/* --------------------------------------------------------------- token -> one link */

describe("invitationAcceptLink", () => {
  it("places the token into the accept path, url-encoded", () => {
    expect(invitationAcceptLink("abc def", "https://nivaas.test")).toBe(
      "https://nivaas.test/accept?token=abc%20def",
    );
  });

  it("strips a trailing slash from the origin", () => {
    const link = invitationAcceptLink("tok", "https://nivaas.test/");
    expect(link).toBe("https://nivaas.test/accept?token=tok");
  });

  it("keeps the token visible in the link (the copy-panel value)", () => {
    expect(invitationAcceptLink("secret123", "https://nivaas.test")).toContain("secret123");
  });
});

/* ---------------------------------------------------------- status transition rules */

function view(over: Partial<MemberActionView> = {}): MemberActionView {
  return {
    status: "ACTIVE" as MembershipStatus,
    isOwner: false,
    isSelf: false,
    actorIsOwner: true,
    canSuspend: true,
    canRemove: true,
    ...over,
  };
}

describe("memberActionState", () => {
  it("lets an authorized operator suspend an active member", () => {
    expect(memberActionState(view()).suspend.enabled).toBe(true);
  });

  it("blocks suspension without the user.suspend capability", () => {
    const state = memberActionState(view({ canSuspend: false }));
    expect(state.suspend.enabled).toBe(false);
    expect(state.suspend.reason).toMatch(/cannot suspend/i);
  });

  it("never lets a person change their own membership", () => {
    const state = memberActionState(view({ isSelf: true }));
    expect(state.suspend.enabled).toBe(false);
    expect(state.reinstate.enabled).toBe(false);
    expect(state.remove.enabled).toBe(false);
    expect(state.suspend.reason).toMatch(/your own/i);
  });

  it("restores only a suspended member, and needs user.remove to do it", () => {
    const restored = memberActionState(view({ status: "SUSPENDED" }));
    expect(restored.reinstate.enabled).toBe(true);
    const blocked = memberActionState(view({ status: "SUSPENDED", canRemove: false }));
    expect(blocked.reinstate.enabled).toBe(false);
    expect(blocked.reinstate.reason).toMatch(/cannot restore/i);
  });

  it("treats removal as terminal and forbids removing an owner", () => {
    expect(memberActionState(view({ status: "REMOVED" })).remove.enabled).toBe(false);
    const owner = memberActionState(view({ isOwner: true, actorIsOwner: true }));
    expect(owner.remove.enabled).toBe(false);
    expect(owner.remove.reason).toMatch(/Transfer ownership/i);
  });

  it("restricts acting on the owner seat to the current owner", () => {
    const foreign = memberActionState(view({ isOwner: true, actorIsOwner: false }));
    expect(foreign.suspend.enabled).toBe(false);
    expect(foreign.suspend.reason).toMatch(/owner can act/i);
  });

  it("offers ownership only to an active, non-owner when the actor owns the group", () => {
    expect(memberActionState(view()).transfer.enabled).toBe(true);
    const suspended = memberActionState(view({ status: "SUSPENDED" }));
    expect(suspended.transfer.enabled).toBe(false);
    expect(suspended.transfer.reason).toMatch(/active member/i);
    const notOwnerActor = memberActionState(view({ actorIsOwner: false }));
    expect(notOwnerActor.transfer.enabled).toBe(false);
    expect(notOwnerActor.transfer.reason).toMatch(/Only the current owner/i);
  });

  it("never offers transfer to the row that is already the owner", () => {
    const current = memberActionState(view({ isOwner: true }));
    expect(current.transfer.enabled).toBe(false);
    expect(current.transfer.reason).toMatch(/already the owner/i);
  });
});

/* -------------------------------------------------------- reason gate is shared */

describe("reason gating reuses archiveActionState", () => {
  it("enables a suspend only once a real reason is written", () => {
    expect(archiveActionState("", "Person One").canConfirm).toBe(false);
    expect(archiveActionState("   ", "Person One").canConfirm).toBe(false);
    const state = archiveActionState("  policy breach  ", "Person One");
    expect(state.canConfirm).toBe(true);
    expect(state.normalizedReason).toBe("policy breach");
  });
});

/* --------------------------------------------------------------- honest render */

describe("TeamPage honest states", () => {
  afterEach(() => resetForTests());

  function render(): string {
    return renderToStaticMarkup(<TeamPage />);
  }

  it("says so plainly when there is no backend", () => {
    useContextStore.setState({ status: "unconfigured" });
    const html = render();
    expect(html).toContain("No backend configured");
    expect(html).toContain("The team cannot be listed");
  });

  it("shows the sign-in state rather than a spinner when unauthenticated", () => {
    useContextStore.setState({ status: "unauthenticated" });
    const html = render();
    expect(html).toContain("Sign in required");
    expect(html).toContain("No active session");
  });

  it("renders an access-denied state when the viewer lacks user.view", () => {
    useContextStore.setState({
      status: "ready",
      context: { signedIn: true, organizationId: "org-1", propertyId: null, outletId: null, cleared: false },
      permissions: { organizationId: "org-1", propertyId: null, outletId: null, permissions: [] },
    });
    const html = render();
    expect(html).toContain("Access not available");
    expect(html).toContain("user.view");
  });

  it("renders the roster and invitation sections for a permitted viewer", () => {
    useContextStore.setState({
      status: "ready",
      context: { signedIn: true, organizationId: "org-1", propertyId: null, outletId: null, cleared: false },
      permissions: {
        organizationId: "org-1",
        propertyId: null,
        outletId: null,
        permissions: ["user.view", "user.invite", "user.suspend", "user.remove", "organization.archive"],
      },
    });
    const html = render();
    expect(html).toContain("Members");
    expect(html).toContain("Pending invitations");
    expect(html).toContain("Invite");
  });

  it("labels a demo tenant only when organization data carries the flag", () => {
    useContextStore.setState({
      status: "ready",
      context: { signedIn: true, organizationId: "org-1", propertyId: null, outletId: null, cleared: false },
      permissions: { organizationId: "org-1", propertyId: null, outletId: null, permissions: ["user.view"] },
      organization: null,
    });
    expect(render()).not.toContain("Demo tenant");
  });
});
