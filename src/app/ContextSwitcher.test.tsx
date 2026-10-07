/**
 * The context switcher's decisions and its three panel states.
 *
 * `renderToStaticMarkup` cannot click, so what is pinned here is the arithmetic the
 * control performs — which levels a choice leaves selected, what each option reads as,
 * and whether the panel admits it has no backend instead of rendering an empty select.
 * The switch itself is the store's `switchContext`, already covered by the session
 * service tests and exercised in the running app.
 */
import { describe, expect, it } from "vitest";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ContextSwitcherPanel,
  ORG_WIDE,
  PROPERTY_WIDE,
  organizationOptions,
  outletOptions,
  propertyOptions,
  scopeSummary,
  selectionAfter,
  triggerLabel,
} from "./ContextSwitcher";
import type { ActiveContext, Organization, Outlet, Property } from "@/domain/identity/types";

const ORG = "a0000000-0000-4000-8000-00000000000a";
const ORG2 = "a0000000-0000-4000-8000-00000000000z";
const PROPERTY = "b1111111-0000-4000-8000-00000000000b";
const OUTLET = "c2222222-0000-4000-8000-00000000000c";

const organization: Organization = {
  id: ORG,
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
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  archivedAt: null,
};

const property: Property = {
  id: PROPERTY,
  organizationId: ORG,
  name: "Amrut Nivas Shirur",
  displayName: null,
  code: "SHIRUR",
  slug: "shirur",
  type: "HOTEL",
  status: "ACTIVE",
  addressLine1: null,
  addressLine2: null,
  city: "Shirur",
  state: "Maharashtra",
  postalCode: null,
  country: "IN",
  phone: null,
  email: null,
  timezone: "Asia/Kolkata",
  currency: "INR",
  locale: "en-IN",
  businessDayStart: "04:00",
  taxProfileId: null,
  version: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  archivedAt: null,
};

const outlet: Outlet = {
  id: OUTLET,
  organizationId: ORG,
  propertyId: PROPERTY,
  name: "Garden Cafe",
  code: "CAFE",
  slug: "garden-cafe",
  type: "CAFE",
  status: "ACTIVE",
  businessHours: {},
  phone: null,
  email: null,
  version: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  archivedAt: null,
};

const OPTIONS = { organizations: [organization], properties: [property], outlets: [outlet] };

describe("what a choice leaves selected", () => {
  const at = { organizationId: ORG, propertyId: PROPERTY };

  it("drops every level below the one chosen", () => {
    // Moving to another site cannot keep an outlet of the previous property: that pair
    // names nothing, and the door would silently narrow it — showing a context the
    // person never asked for.
    expect(selectionAfter("organization", ORG2, at)).toEqual({
      organizationId: ORG2,
      propertyId: null,
      outletId: null,
    });
    expect(selectionAfter("property", null, at)).toEqual({
      organizationId: ORG,
      propertyId: null,
      outletId: null,
    });
  });

  it("keeps the ancestors of a deeper choice", () => {
    expect(selectionAfter("outlet", OUTLET, at)).toEqual({
      organizationId: ORG,
      propertyId: PROPERTY,
      outletId: OUTLET,
    });
  });
});

describe("the options offered", () => {
  it("names a tenant that is not trading instead of hiding it", () => {
    const [option] = organizationOptions([{ ...organization, status: "SUSPENDED" }]);
    expect(option?.label).toBe("Amrut Hospitality (suspended)");
  });

  it("labels demo data as demo data", () => {
    const [option] = organizationOptions([{ ...organization, isDemo: true }]);
    expect(option?.description).toBe("Demo data");
  });

  it("offers organization-wide before any site", () => {
    expect(propertyOptions(OPTIONS.properties)[0]?.value).toBe(ORG_WIDE);
    expect(outletOptions(OPTIONS.outlets)[0]?.value).toBe(PROPERTY_WIDE);
  });

  it("shows a site's city so two properties with one name tell apart", () => {
    expect(propertyOptions(OPTIONS.properties)[1]?.label).toBe("Amrut Nivas Shirur · Shirur");
  });
});

describe("the header line", () => {
  const base = { signedIn: true, cleared: false };

  it("reads as the depth actually selected", () => {
    expect(
      scopeSummary(
        { ...base, organizationId: ORG, propertyId: null, outletId: null },
        { organization: "Amrut Hospitality" },
      ),
    ).toBe("Amrut Hospitality");
    expect(
      scopeSummary(
        { ...base, organizationId: ORG, propertyId: PROPERTY, outletId: OUTLET },
        { organization: "Amrut Hospitality", property: "Amrut Nivas Shirur", outlet: "Garden Cafe" },
      ),
    ).toBe("Amrut Hospitality › Amrut Nivas Shirur › Garden Cafe");
  });

  it("says so when nothing is selected", () => {
    expect(
      scopeSummary({ signedIn: false, organizationId: null, propertyId: null, outletId: null }, {}),
    ).toBe("No session");
    expect(
      scopeSummary({ ...base, organizationId: null, propertyId: null, outletId: null }, {}),
    ).toBe("No organization selected");
  });
});

describe("the header trigger", () => {
  const nowhere = { signedIn: false, organizationId: null, propertyId: null, outletId: null };

  it("blames the build, not the person, when there is no data plane", () => {
    // "No session" here would send someone to sign in again when the real problem is
    // that the deployment has no project keys.
    expect(triggerLabel("unconfigured", nowhere, {})).toBe("No data plane");
    expect(triggerLabel("unauthenticated", nowhere, {})).toBe("No session");
  });

  it("reads the selected tenant when there is one", () => {
    expect(
      triggerLabel(
        "ready",
        { signedIn: true, organizationId: ORG, propertyId: null, outletId: null },
        { organization: "Amrut Hospitality" },
      ),
    ).toBe("Amrut Hospitality");
  });
});

describe("ContextSwitcherPanel", () => {
  const context: ActiveContext = {
    signedIn: true,
    organizationId: ORG,
    propertyId: PROPERTY,
    outletId: null,
    cleared: false,
  };
  const noop = () => {};

  function render(overrides: Partial<ComponentProps<typeof ContextSwitcherPanel>> = {}) {
    return renderToStaticMarkup(
      <ContextSwitcherPanel
        context={context}
        busy={false}
        options={OPTIONS}
        missing={null}
        onChoose={noop}
        {...overrides}
      />,
    );
  }

  it("marks the current level selected rather than empty", () => {
    const html = render();
    expect(html).toContain("Amrut Nivas Shirur · Shirur");
    expect(html).toContain("Garden Cafe");
    expect(html).toMatch(/<option value="a0000000[^"]*" selected/);
    expect(html).toMatch(/<option value="b1111111[^"]*" selected/);
    // Property-wide is where this context sits, so the sentinel — not an outlet — is
    // what the outlet picker must show as chosen.
    expect(html).toMatch(/<option value=":property" selected/);
    expect((html.match(/ selected/g) ?? []).length).toBe(3);
  });

  it("explains a build with nothing to switch between", () => {
    const html = render({ missing: "This build has no backend connected, so there is no tenant to switch to." });
    expect(html).toContain("no backend connected");
    expect(html).not.toContain("<select");
  });

  it("says it is loading the tenants instead of showing empty pickers", () => {
    const html = render({ options: null });
    expect(html).toContain("Loading the tenants you belong to");
    expect(html).not.toContain("<select");
  });

  it("blocks the deeper pickers until there is an organization to hang them on", () => {
    const html = render({
      context: { ...context, organizationId: null, propertyId: null, outletId: null },
    });
    expect((html.match(/disabled=/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
