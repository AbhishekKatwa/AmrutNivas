/**
 * The §63 experience, proven against the two leaks it exists to prevent.
 *
 * A denied screen is read by the person with the least information in the building, so
 * it has to say something true and nothing internal. The loop covers every reason code the
 * ladder can emit rather than the one a screen happens to hit today, and the
 * role-name check is a shape check (`SNAKE_CASE`) because that is what a role looks like —
 * naming the current set here would itself be a list that drifts from the seed.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { AccessDeniedScreen } from "@/app/AccessDeniedScreen";
import { ACCESS_DENIAL_REASONS } from "@/config/security";
import { denialCopy } from "@/domain/access/authorize";
import { PERMISSION_KEYS } from "@/domain/identity/permissions";
import { doorErrorTokens } from "@/test-helpers/migrations";
import { textInMarkup } from "@/test-helpers/markup";
import { resetForTests, useContextStore } from "@/state/context-store";

const ORG = "8b1c1f2e-7a5d-4e3b-9c2a-1d0f9e8b7a65";
const PROPERTY = "9c2d2a3f-8b6e-4f4c-8d3b-2e1f0a9c8b76";
const OUTLET = "ad3e3b40-9c7f-4a5d-9e4c-3f201bad0c87";

beforeEach(() => {
  resetForTests();
});

function render(reason: (typeof ACCESS_DENIAL_REASONS)[number]): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/team"]}>
      <AccessDeniedScreen reason={reason} />
    </MemoryRouter>,
  );
}

describe("AccessDeniedScreen", () => {
  it("says access is restricted and gives the server's own sentence for the refusal", () => {
    const html = render("PERMISSION_DENIED");
    expect(html).toContain("Access restricted");
    expect(html).toContain(textInMarkup(denialCopy("PERMISSION_DENIED")));
  });

  it("offers the three ways out a person can actually take", () => {
    const html = render("PERMISSION_DENIED");
    expect(html).toContain("Go back");
    expect(html).toContain("Open the overview");
    expect(html).toContain("switcher");
    expect(html).toContain(textInMarkup("ask an administrator"));
  });

  it("carries no permission key, door token or role name, for every reason it can show", () => {
    const tokens = doorErrorTokens();
    for (const reason of ACCESS_DENIAL_REASONS) {
      const html = render(reason);
      expect(html).toContain(textInMarkup(denialCopy(reason)));
      for (const key of PERMISSION_KEYS) {
        expect(html, `the ${reason} screen names ${key}`).not.toContain(key);
      }
      for (const token of tokens) {
        expect(html, `the ${reason} screen shows ${token}`).not.toContain(token);
      }
      expect(html).not.toContain("NIVAAS_");
      // Roles, table names and internal enums all share this shape; none of them belongs
      // on a screen a person reads.
      expect(html, `the ${reason} screen exposes an internal name`).not.toMatch(
        /\b[A-Z][A-Z0-9]*_[A-Z0-9_]*\b/,
      );
    }
  });

  it("invites no retry and leaks no identifier from the session it is refusing (§40)", () => {
    // The screen's own guidance is about the switcher, so the honest version of the
    // enumeration rule is what to check here: nothing the person was pointed at — a
    // tenant id, a user id, an address — may come back out of this experience.
    useContextStore.setState({
      status: "ready",
      context: { signedIn: true, organizationId: ORG, propertyId: PROPERTY, outletId: OUTLET, cleared: false },
      permissions: { organizationId: ORG, propertyId: PROPERTY, outletId: OUTLET, permissions: [] },
    });
    for (const reason of ACCESS_DENIAL_REASONS) {
      const html = render(reason).toLowerCase();
      expect(html).not.toContain("try again");
      for (const id of [ORG, PROPERTY, OUTLET]) {
        expect(html, `the ${reason} screen exposes ${id}`).not.toContain(id.toLowerCase());
      }
    }
  });
});
