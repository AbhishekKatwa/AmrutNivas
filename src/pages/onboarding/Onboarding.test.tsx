/**
 * The wizard's step machine and its two honesty guarantees, tested directly.
 *
 * Nothing is clickable under `renderToStaticMarkup`, so the ordering, back-navigation and
 * shown-once-token rules are exported pure functions exercised here, while the claims that
 * only markup can prove — the demo label and the unconfigured explanation — render the real
 * components. The doors themselves are not called here: they are exercised by the service
 * suites they wrap.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import OnboardingWizard, {
  CapabilityNote,
  ClaimedEstateSummary,
  advance,
  choosePath,
  currentInviteToken,
  fieldForDoorError,
  goBack,
  initialWizardState,
  reachableSteps,
  stepPermissionFor,
  UnconfiguredNotice,
  type WizardState,
} from "./OnboardingWizard";
import { AppError } from "@/lib/errors";
import type { IssuedInvitation, Organization, Permission } from "@/domain/identity/types";
import { useContextStore, resetForTests } from "@/state/context-store";

const ORG: Organization = {
  id: "a0000000-0000-4000-8000-000000000001",
  name: "Amrut Hospitality",
  legalName: null,
  displayName: null,
  code: "AMRUT",
  slug: "amrut",
  businessTypes: [],
  status: "ACTIVE",
  country: "IN",
  currency: "INR",
  timezone: "Asia/Kolkata",
  locale: "en-IN",
  taxRegion: null,
  phone: null,
  email: null,
  website: null,
  logoUrl: null,
  isDemo: false,
  version: 1,
  createdAt: "2026-03-01T00:00:00Z",
  updatedAt: "2026-03-01T00:00:00Z",
  archivedAt: null,
};

const ISSUED: IssuedInvitation = {
  invitationId: "e0000000-0000-4000-8000-000000000001",
  token: "a".repeat(64),
  role: "PROPERTY_MANAGER",
  scope: "PROPERTY",
  expiresAt: "2026-03-15T00:00:00Z",
};

function withRows(step: WizardState["step"], extra: Partial<WizardState> = {}): WizardState {
  return { ...initialWizardState(), path: "create", step, ...extra };
}

describe("step machine", () => {
  it("lands on the create sequence when a path is chosen", () => {
    const chosen = choosePath(initialWizardState(), "create");
    expect(chosen.step).toBe("organization");
    expect(chosen.path).toBe("create");
  });

  it("lands on the single demo claim when the demo path is chosen", () => {
    expect(choosePath(initialWizardState(), "demo").step).toBe("demo");
  });

  it("exposes only the reachable steps for the chosen path", () => {
    expect(reachableSteps(null)).toEqual(["path"]);
    expect(reachableSteps("create")).toEqual([
      "path",
      "organization",
      "property",
      "outlet",
      "department",
      "invite",
      "done",
    ]);
    expect(reachableSteps("demo")).toEqual(["path", "demo", "done"]);
  });

  it("walks forward one content step when the step is not blocked", () => {
    expect(advance(withRows("organization"), false).step).toBe("property");
    expect(advance(withRows("outlet"), false).step).toBe("department");
  });

  it("does not move off the terminal step", () => {
    const done = withRows("done");
    expect(advance(done, false).step).toBe("done");
  });

  it("stays put and records the reason when a step blocks advancing", () => {
    const blocked = advance(withRows("property"), true, "Choose a property type.");
    expect(blocked.step).toBe("property");
    expect(blocked.blocked).toBe("Choose a property type.");
  });

  it("clears the blocked flag on a successful advance", () => {
    const cleared = advance(withRows("invite", { blocked: "stale" }), false);
    expect(cleared.blocked).toBeNull();
  });

  it("back from the first content step returns to the path choice", () => {
    expect(goBack(withRows("organization")).step).toBe("path");
    expect(goBack({ ...initialWizardState(), path: "demo", step: "demo" }).step).toBe("path");
  });

  it("back from the path choice is a no-op", () => {
    const path = initialWizardState();
    expect(goBack(path)).toBe(path);
  });

  it("back preserves entered data and every row already written", () => {
    const deep = withRows("invite", { organization: ORG });
    const earlier = goBack(deep);
    expect(earlier.step).toBe("department");
    expect(earlier.organization).toEqual(ORG);
    expect(earlier.path).toBe("create");
  });

  it("walks back to the previous content step, not the path, once past the first", () => {
    expect(goBack(withRows("property", { organization: ORG })).step).toBe("organization");
  });
});

describe("currentInviteToken (shown once)", () => {
  it("returns the token only on the invite step while the result holds it", () => {
    expect(currentInviteToken(withRows("invite", { invitation: ISSUED }))).toBe(ISSUED.token);
  });

  it("is null once the wizard moves past the invite step", () => {
    expect(currentInviteToken(withRows("done", { invitation: ISSUED }))).toBeNull();
  });

  it("is null on the invite step before an invitation exists", () => {
    expect(currentInviteToken(withRows("invite"))).toBeNull();
  });
});

describe("fieldForDoorError", () => {
  it("points a code conflict at the code field", () => {
    const error = new AppError("CONFLICT", "That organization code is already in use.", {
      details: { token: "NIVAAS_ORGANIZATION_TAKEN" },
    });
    expect(fieldForDoorError(error)).toBe("code");
  });

  it("points a slug validation failure at the slug field", () => {
    const error = new AppError("VALIDATION_FAILED", "Bad slug.", {
      details: { token: "NIVAAS_INVALID_SLUG" },
    });
    expect(fieldForDoorError(error)).toBe("slug");
  });

  it("points an unknown door token and a non-door error at no field", () => {
    expect(fieldForDoorError(new AppError("INTERNAL", "boom"))).toBeNull();
    expect(fieldForDoorError(new Error("plain failure"))).toBeNull();
  });
});

describe("ClaimedEstateSummary", () => {
  it("labels a claimed demo organization visibly as demo data", () => {
    const html = renderToStaticMarkup(
      <ClaimedEstateSummary organization={{ ...ORG, isDemo: true }} />,
    );
    expect(html).toContain("Demo data");
  });

  it("does not stamp a real tenant with the demo label", () => {
    const html = renderToStaticMarkup(<ClaimedEstateSummary organization={ORG} />);
    expect(html).not.toContain("Demo data");
    expect(html).toContain("Amrut Hospitality");
  });
});

describe("OnboardingWizard render", () => {
  beforeEach(() => resetForTests());

  function ready(permissions: Permission[]): void {
    useContextStore.setState({
      status: "ready",
      context: {
        signedIn: true,
        organizationId: null,
        propertyId: null,
        outletId: null,
        cleared: false,
      },
      permissions: { organizationId: ORG.id, propertyId: null, outletId: null, permissions },
    });
  }

  it("offers both honest paths on the opening step", () => {
    // No capability at all: `create_organization` needs a session and hands the creator
    // ORG_OWNER, so a person signing up for the first time has nothing to be granted.
    ready([]);
    const html = renderToStaticMarkup(<OnboardingWizard />);
    expect(html).toContain("Claim the demo estate to explore");
    expect(html).toContain("Create your organization");
  });

  it("says the estate writes real records rather than pretending to be draft-only", () => {
    ready([]);
    const html = renderToStaticMarkup(<OnboardingWizard />);
    expect(html.toLowerCase()).toContain("real organization");
  });

  it("explains an unconfigured build instead of spinning", () => {
    // The store's `unconfigured` status is the store's *initial* snapshot under a static
    // server render, so the branch cannot be forced here; the notice it renders is proven
    // directly, and the reactive wiring is exercised only in the running app.
    const html = renderToStaticMarkup(<UnconfiguredNotice />);
    expect(html).toContain("No backend configured");
    expect(html.toLowerCase()).not.toContain("loading");
  });

  it("never withholds the organization step for a missing capability", () => {
    ready([]);
    const html = renderToStaticMarkup(<OnboardingWizard />);
    // A gate on an unseeded token would be a button no administrator could ever enable.
    expect(html).not.toContain("organization.create");
    expect(html).not.toContain("refused by the server");
  });

  it("asks only the capability each step's own door requires", () => {
    expect(stepPermissionFor("organization")).toBeNull();
    expect(stepPermissionFor("property")).toBe("property.create");
    expect(stepPermissionFor("outlet")).toBe("outlet.create");
    expect(stepPermissionFor("department")).toBe("department.create");
    expect(stepPermissionFor("invite")).toBe("user.invite");
  });
});

describe("CapabilityNote", () => {
  beforeEach(() => resetForTests());

  it("names the missing grant only once a role has actually been read", () => {
    useContextStore.setState({
      status: "ready",
      permissions: { organizationId: ORG.id, propertyId: null, outletId: null, permissions: [] },
    });
    const html = renderToStaticMarkup(<CapabilityNote permission="property.create" />);
    expect(html).toContain("Your role is missing");
    expect(html).toContain("property.create");
    expect(html).toContain("refused by the server");
  });

  it("does not invent a role refusal when there is no session", () => {
    useContextStore.setState({ status: "unauthenticated", permissions: null });
    const html = renderToStaticMarkup(<CapabilityNote permission="property.create" />);
    expect(html).not.toContain("Your role is missing");
    expect(html).not.toContain("refused by the server");
    expect(html).toContain("signed-in session");
  });

  it("does not invent a role refusal while the session is still loading", () => {
    useContextStore.setState({ status: "loading", permissions: null });
    const html = renderToStaticMarkup(<CapabilityNote permission="property.create" />);
    expect(html).not.toContain("Your role is missing");
    expect(html).toContain("still loading");
  });

  it("does not invent a role refusal when no tenant is selected", () => {
    useContextStore.setState({ status: "ready", permissions: null });
    const html = renderToStaticMarkup(<CapabilityNote permission="property.create" />);
    expect(html).not.toContain("Your role is missing");
    expect(html).toContain("organization selected");
  });
});
