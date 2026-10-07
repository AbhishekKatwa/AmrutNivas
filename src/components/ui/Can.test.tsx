/**
 * The one authorization question, as a person sees it (§20).
 *
 * What matters here is not that a boolean comes back — `can()` already did that — but
 * that a control reflects the CURRENT grant set rather than the one at mount, and that
 * the copy a closed affordance shows carries the server's sentence and none of the
 * machinery behind it. The leak assertions run over every catalogue key and every door
 * token instead of sampling two of them.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Can, Denied, decideAccess, useCan } from "@/components/ui/Can";
import { ACCESS_DENIAL_REASONS } from "@/config/security";
import { denialCopy } from "@/domain/access/authorize";
import { PERMISSION_KEYS } from "@/domain/identity/permissions";
import type { Permission } from "@/domain/identity/types";
import { doorErrorTokens } from "@/test-helpers/migrations";
import { textInMarkup } from "@/test-helpers/markup";
import { resetForTests, useContextStore } from "@/state/context-store";

const ORG = "8b1c1f2e-7a5d-4e3b-9c2a-1d0f9e8b7a65";

function session(rights: Permission[]): void {
  useContextStore.setState({
    status: "ready",
    context: { signedIn: true, organizationId: ORG, propertyId: null, outletId: null, cleared: false },
    permissions: { organizationId: ORG, propertyId: null, outletId: null, permissions: rights },
  });
}

function Probe({ permission }: { readonly permission: Permission }) {
  return <span>{useCan(permission) ? "allowed" : "closed"}</span>;
}

beforeEach(() => {
  resetForTests();
});

describe("useCan", () => {
  it("is true only for a capability the active tenant's set holds", () => {
    session(["property.view", "user.invite"]);
    const html = renderToStaticMarkup(
      <div>
        <Probe permission="property.view" />
        <Probe permission="user.invite" />
        <Probe permission="property.create" />
      </div>,
    );
    expect(html.match(/>allowed</g)).toHaveLength(2);
    expect(html).toContain(">closed<");
  });

  it("is false when there is no organization to scope the grant set", () => {
    useContextStore.setState({
      status: "ready",
      context: { signedIn: true, organizationId: null, propertyId: null, outletId: null, cleared: false },
      permissions: null,
    });
    expect(renderToStaticMarkup(<Probe permission="property.view" />)).toContain(">closed<");
  });
});

describe("Can", () => {
  it("renders its children when the permission is in the set", () => {
    session(["property.create"]);
    const html = renderToStaticMarkup(
      <Can permission="property.create">
        <button type="button">Add a property</button>
      </Can>,
    );
    expect(html).toContain("Add a property");
  });

  it("renders nothing at all when it is not", () => {
    session(["property.view"]);
    const html = renderToStaticMarkup(
      <Can permission="property.create">
        <button type="button">Add a property</button>
      </Can>,
    );
    expect(html).not.toContain("Add a property");
    expect(html.trim()).toBe("");
  });

  it("renders the fallback it is given", () => {
    session(["property.view"]);
    const html = renderToStaticMarkup(
      <Can permission="property.create" fallback={<span>disabled</span>}>
        <button type="button">Add a property</button>
      </Can>,
    );
    expect(html).toContain("disabled");
    expect(html).not.toContain("Add a property");
  });

  it("says why when the reason variant is asked for, instead of vanishing", () => {
    session(["property.view"]);
    const html = renderToStaticMarkup(
      <Can permission="property.create" reason>
        <button type="button">Add a property</button>
      </Can>,
    );
    expect(html).not.toContain("Add a property");
    expect(html).toContain(textInMarkup(denialCopy("PERMISSION_DENIED")));
    expect(html).toContain('role="status"');
  });

  it("greys the control on the render after a switch revokes it", () => {
    // §20's requirement in one line: the person must not be able to click something the
    // new tenant no longer grants, and must not learn that only when the door refuses.
    session(["property.create"]);
    expect(
      renderToStaticMarkup(
        <Can permission="property.create">
          <span>the control</span>
        </Can>,
      ),
    ).toContain("the control");

    useContextStore.setState({
      context: { signedIn: true, organizationId: ORG, propertyId: null, outletId: null, cleared: true },
      permissions: { organizationId: ORG, propertyId: null, outletId: null, permissions: [] },
    });
    expect(
      renderToStaticMarkup(
        <Can permission="property.create">
          <span>the control</span>
        </Can>,
      ),
    ).not.toContain("the control");
  });

  it("keeps the membership refusal for a context the server narrowed to nothing", () => {
    // The gate must not report "your role lacks it" when there is no tenant in scope at
    // all — `authorize` reaches the membership step first, in the server's order.
    session(["property.create"]);
    const decision = decideAccess(
      {
        context: { signedIn: true, organizationId: null, propertyId: null, outletId: null, cleared: false },
        permissions: { organizationId: ORG, propertyId: null, outletId: null, permissions: ["property.create"] },
      },
      "property.create",
    );
    expect(decision).toEqual({ allowed: false, reason: "NO_ACTIVE_MEMBERSHIP" });
  });
});

describe("the copy a closed affordance shows (§63)", () => {
  const tokens = doorErrorTokens();

  it("names no permission key and no door token, for every refusal it can show", () => {
    // Every code the ladder can reach, not the two that happen to be on screen today:
    // a new reason would otherwise arrive as an unreviewed string in front of a person.
    expect(ACCESS_DENIAL_REASONS.length).toBeGreaterThan(1);
    for (const reason of ACCESS_DENIAL_REASONS) {
      const html = renderToStaticMarkup(<Denied reason={reason} />);
      expect(html).toContain(textInMarkup(denialCopy(reason)));
      for (const key of PERMISSION_KEYS) {
        expect(html, `the ${reason} notice names ${key}`).not.toContain(key);
      }
      for (const token of tokens) {
        expect(html, `the ${reason} notice shows ${token}`).not.toContain(token);
      }
      expect(html).not.toContain("NIVAAS_");
    }
  });
});
