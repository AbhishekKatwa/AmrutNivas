/**
 * §67's inspector, proven to be a tool and not a feature.
 *
 * It exists so "why is that control greyed out?" is answerable at a glance, which means
 * it must show the resolved context and nothing that could be reused: the session is read
 * for its id, and the grant set is read for its size.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AccessDebugPanel } from "@/app/AccessDebugPanel";
import type { Permission } from "@/domain/identity/types";
import { doorErrorTokens } from "@/test-helpers/migrations";
import { resetForTests, useContextStore } from "@/state/context-store";

const ORG = "8b1c1f2e-7a5d-4e3b-9c2a-1d0f9e8b7a65";
const PROPERTY = "9c2d2a3f-8b6e-4f4c-8d3b-2e1f0a9c8b76";

function signedInAt(rights: Permission[] | null): void {
  useContextStore.setState({
    status: "ready",
    context: { signedIn: true, organizationId: ORG, propertyId: PROPERTY, outletId: null, cleared: false },
    permissions:
      rights === null
        ? null
        : { organizationId: ORG, propertyId: PROPERTY, outletId: null, permissions: rights },
  });
}

beforeEach(() => {
  resetForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("AccessDebugPanel", () => {
  it("shows the resolved context and the size of the loaded grant set", () => {
    signedInAt(["organization.view", "property.view"]);
    const html = renderToStaticMarkup(<AccessDebugPanel />);
    expect(html).toContain("development only");
    expect(html).toContain(ORG);
    expect(html).toContain(PROPERTY);
    expect(html).toContain(">none<");
    expect(html).toContain(">2<");
  });

  it("says the grant set is not loaded instead of calling that zero permissions", () => {
    signedInAt(null);
    const html = renderToStaticMarkup(<AccessDebugPanel />);
    expect(html).toContain("not loaded");
    expect(html).not.toContain(">0<");
  });

  it("carries no door token and no credential-shaped text (§68)", () => {
    signedInAt(["user.view"]);
    const html = renderToStaticMarkup(<AccessDebugPanel />);
    for (const token of doorErrorTokens()) {
      expect(html, `the panel shows ${token}`).not.toContain(token);
    }
    expect(html).not.toContain("NIVAAS_");
    for (const word of ["token", "password", "secret", "eyJ"]) {
      expect(html.toLowerCase(), `the panel shows a ${word}`).not.toContain(word);
    }
  });

  it("renders nothing outside a development build", () => {
    // `import.meta.env.DEV` is a build-time constant in the app; the unit test can only
    // pin the component half of the exclusion — the bundle half is proven by the check
    // that a production `dist` never contains the panel's label.
    signedInAt(["user.view"]);
    vi.stubEnv("DEV", false);
    expect(renderToStaticMarkup(<AccessDebugPanel />)).toBe("");
  });
});
