/**
 * The Properties screen's rules, asserted without a browser.
 *
 * Node-only suite, so nothing can be clicked: the rules that matter (form values -> door
 * input, validation, the archived opt-in, archive/restore enablement) are exported pure
 * functions and called directly. Render cases go through `react-dom/server` with a
 * stubbed context store, and the list itself is seeded through the real tenant cache —
 * which is the path the page uses to paint without a round trip.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PROPERTY_TYPES,
  type Organization,
  type Permission,
  type PermissionSet,
  type Property,
} from "@/domain/identity/types";
import type { ContextState } from "@/state/context-store";
import { activateScope, resetForTests as resetCache, write } from "@/state/tenant-cache";
import { AppError } from "@/lib/errors";
import PropertiesPage, {
  PropertyRowActions,
  archivedReadRequest,
  buildPropertyCreate,
  buildPropertyUpdate,
  defaultsFromOrganization,
  displayValue,
  filterProperties,
  formHasErrors,
  propertiesCacheKey,
  propertyFormValues,
  propertyTypeOptions,
  siteStatusChoices,
  submitFailure,
  summarizeProperties,
  taxonomyLabel,
  validatePropertyForm,
  workHereState,
  type PropertyDefaults,
  type PropertyFormValues,
} from "./PropertiesPage";

/* ------------------------------------------------------------------ harness */

const holder: { state: ContextState } = { state: snapshot() };

vi.mock("@/state/context-store", () => ({
  // The selector runs against a snapshot the test controls, and `getState` serves the
  // same snapshot: a static render cannot see a zustand hook's value, so components that
  // read the live snapshot (AccessDenied among them) would otherwise render defaults.
  useContextStore: Object.assign(
    (selector: (state: ContextState) => unknown) => selector(holder.state),
    { getState: () => holder.state },
  ),
}));

function snapshot(overrides: Partial<ContextState> = {}): ContextState {
  return {
    status: "ready",
    context: {
      signedIn: true,
      organizationId: "org-1",
      propertyId: null,
      outletId: null,
      cleared: false,
    },
    permissions: null,
    organization: null,
    notices: [],
    error: null,
    bootstrap: async () => {},
    switchContext: async () => {},
    claimDemo: async () => {},
    signOut: async () => {},
    dismissNotice: () => {},
    can: () => false,
    currentScope: () => "org-1",
    ...overrides,
  };
}

function grant(permissions: readonly string[]): PermissionSet {
  return {
    organizationId: "org-1",
    propertyId: null,
    outletId: null,
    permissions: permissions as Permission[],
  };
}

function organizationRow(overrides: Partial<Organization> = {}): Organization {
  return {
    id: "org-1",
    name: "Amrut Hospitality",
    legalName: null,
    displayName: null,
    code: "AMR",
    slug: "amrut-hospitality",
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
    version: 2,
    createdAt: "2026-01-05T09:00:00Z",
    updatedAt: "2026-01-05T09:00:00Z",
    archivedAt: null,
    ...overrides,
  };
}

function propertyRow(overrides: Partial<Property> = {}): Property {
  return {
    id: "prop-1",
    organizationId: "org-1",
    name: "Amrut Residency Pune",
    displayName: null,
    code: "AMR-PUN",
    slug: "amrut-residency-pune",
    type: "HOTEL",
    status: "ACTIVE",
    addressLine1: "Fergusson College Road",
    addressLine2: null,
    city: "Pune",
    state: "MH",
    postalCode: "411004",
    country: "IN",
    phone: "+91 20 4000 1000",
    email: "pune@example.test",
    timezone: "Asia/Kolkata",
    currency: "INR",
    locale: "en-IN",
    businessDayStart: "04:00",
    taxProfileId: null,
    version: 3,
    createdAt: "2026-01-06T09:00:00Z",
    updatedAt: "2026-02-02T09:00:00Z",
    archivedAt: null,
    ...overrides,
  };
}

const GROUP_DEFAULTS: PropertyDefaults = {
  country: "IN",
  currency: "INR",
  timezone: "Asia/Kolkata",
  locale: "en-IN",
};

function form(overrides: Partial<PropertyFormValues> = {}): PropertyFormValues {
  return {
    name: "Amrut Residency Pune",
    displayName: "",
    code: "AMR-PUN",
    slug: "amrut-residency-pune",
    type: "HOTEL",
    country: "IN",
    currency: "INR",
    timezone: "Asia/Kolkata",
    locale: "en-IN",
    businessDayStart: "04:00",
    addressLine1: "Fergusson College Road",
    addressLine2: "",
    city: "Pune",
    state: "MH",
    postalCode: "411004",
    phone: "+91 20 4000 1000",
    email: "pune@example.test",
    ...overrides,
  };
}

/** Seed the list the way a warm cache would, then paint the screen. */
function seedList(rows: readonly Property[], state?: Partial<ContextState>): void {
  resetCache();
  activateScope("org-1");
  write("org-1", propertiesCacheKey(false), rows);
  holder.state = snapshot({
    permissions: grant(["property.view", "property.create", "property.edit", "property.archive"]),
    ...state,
  });
}

function render(): string {
  return renderToStaticMarkup(<PropertiesPage />);
}

function rowActions(property: Property, options: Partial<{ mayEdit: boolean; mayArchive: boolean }> = {}): string {
  return renderToStaticMarkup(
    <PropertyRowActions
      property={property}
      mayEdit={options.mayEdit ?? true}
      mayArchive={options.mayArchive ?? true}
      currentPropertyId={null}
      onWorkHere={() => {}}
      onEdit={() => {}}
      onArchive={() => {}}
      onTransition={() => {}}
    />,
  );
}

beforeEach(() => {
  resetCache();
  holder.state = snapshot();
});

/* ------------------------------------------------------- defaults + values */

describe("defaultsFromOrganization", () => {
  it("copies the group's regime onto a new site rather than inventing one", () => {
    expect(defaultsFromOrganization(organizationRow())).toEqual(GROUP_DEFAULTS);
  });

  it("returns nothing when the tenant has not been read — a guessed country is a wrong record", () => {
    expect(defaultsFromOrganization(null)).toEqual({
      country: "",
      currency: "",
      timezone: "",
      locale: "",
    });
  });

  it("seeds a create form from those defaults and leaves the rest empty", () => {
    const values = propertyFormValues(null, defaultsFromOrganization(organizationRow()));
    expect(values.country).toBe("IN");
    expect(values.currency).toBe("INR");
    expect(values.name).toBe("");
    expect(values.type).toBe("");
    expect(values.businessDayStart).toBe("");
  });

  it("maps a row onto the form, NULL columns becoming the empty string", () => {
    const values = propertyFormValues(propertyRow({ email: null, addressLine2: null }), GROUP_DEFAULTS);
    expect(values.email).toBe("");
    expect(values.addressLine2).toBe("");
    expect(values.type).toBe("HOTEL");
    expect(values.businessDayStart).toBe("04:00");
    expect(values.code).toBe("AMR-PUN");
  });
});

/* ------------------------------------------------------------ validation */

describe("validatePropertyForm", () => {
  it("accepts a create form that satisfies the door", () => {
    expect(validatePropertyForm(form(), "create")).toEqual({});
  });

  it("enforces the code and slug shapes only where they can still be set", () => {
    const bad = form({ code: "amr pun", slug: "Pune Center" });
    expect(Object.keys(validatePropertyForm(bad, "create")).sort()).toEqual(["code", "slug"]);
    expect(validatePropertyForm(bad, "edit")).toEqual({});
  });

  it("requires a site type on create and accepts the taxonomy's own values", () => {
    expect(validatePropertyForm(form({ type: "" }), "create").type).toBeDefined();
    expect(propertyTypeOptions().map((option) => option.value)).toEqual([...PROPERTY_TYPES]);
    expect(taxonomyLabel("CONVENTION_CENTER")).toBe("Convention Center");
  });

  it("requires the trading-day boundary on an existing site but leaves it to the door on create", () => {
    expect(validatePropertyForm(form({ businessDayStart: "" }), "edit").businessDayStart).toBeDefined();
    expect(validatePropertyForm(form({ businessDayStart: "" }), "create")).toEqual({});
    expect(validatePropertyForm(form({ businessDayStart: "24:00" }), "create").businessDayStart).toBeDefined();
  });

  it("names each regime field the database would refuse", () => {
    const errors = validatePropertyForm(
      form({ name: "A", country: "India", currency: "rupee", timezone: "kolkata", locale: "EN_in", email: "nope", phone: "1".repeat(40) }),
      "edit",
    );
    expect(Object.keys(errors).sort()).toEqual(
      ["country", "currency", "email", "locale", "name", "phone", "timezone"].sort(),
    );
    expect(formHasErrors(errors)).toBe(true);
  });
});

/* ------------------------------------------------------- door: create */

describe("buildPropertyCreate", () => {
  it("sends NULL for an optional field left blank, never an empty string", () => {
    const input = buildPropertyCreate(form({ addressLine2: "", postalCode: "  ", phone: "", email: "" }), "org-1");
    expect(input.addressLine2).toBeNull();
    expect(input.postalCode).toBeNull();
    expect(input.phone).toBeNull();
    expect(input.email).toBeNull();
    expect(input.addressLine1).toBe("Fergusson College Road");
  });

  it("omits the trading-day boundary so the door applies its own default", () => {
    expect(buildPropertyCreate(form({ businessDayStart: "" }), "org-1").businessDayStart).toBeUndefined();
    expect(buildPropertyCreate(form({ businessDayStart: "03:00" }), "org-1").businessDayStart).toBe("03:00");
  });

  it("normalises code, slug, country and currency and carries the type and tenant", () => {
    const input = buildPropertyCreate(form({ code: " amr-pun ", slug: " AMRUT-PUNE " }), "org-9");
    expect(input).toMatchObject({
      organizationId: "org-9",
      code: "AMR-PUN",
      slug: "amrut-pune",
      country: "IN",
      currency: "INR",
      type: "HOTEL",
    });
  });

  it("declares no display name, because create_property has no such parameter", () => {
    expect("displayName" in buildPropertyCreate(form({ displayName: "Residency" }), "org-1")).toBe(false);
  });
});

/* ------------------------------------------------------- door: update */

describe("buildPropertyUpdate", () => {
  const row = propertyRow();

  it("leaves an untouched blankable column out of the patch", () => {
    const patch = buildPropertyUpdate(propertyFormValues(row, GROUP_DEFAULTS), row, 3);
    expect("city" in patch).toBe(false);
    expect("phone" in patch).toBe(false);
    expect("displayName" in patch).toBe(false);
  });

  it("sends the empty string when the operator clears a field", () => {
    const patch = buildPropertyUpdate(propertyFormValues(row, GROUP_DEFAULTS), row, 3);
    const cleared = buildPropertyUpdate({ ...propertyFormValues(row, GROUP_DEFAULTS), city: "" }, row, 3);
    expect(patch.city).toBeUndefined();
    expect(cleared.city).toBe("");
    expect("city" in cleared).toBe(true);
  });

  it("sends the NOT NULL regime columns and the trading day", () => {
    const patch = buildPropertyUpdate(form({ businessDayStart: "05:00" }), row, 3);
    expect(patch.name).toBe("Amrut Residency Pune");
    expect(patch.timezone).toBe("Asia/Kolkata");
    expect(patch.currency).toBe("INR");
    expect(patch.businessDayStart).toBe("05:00");
  });

  it("carries the loaded version as expectedVersion", () => {
    expect(buildPropertyUpdate(propertyFormValues(row, GROUP_DEFAULTS), row, 9).expectedVersion).toBe(9);
  });

  it("never sends code, slug or the site type — they are immutable once issued", () => {
    const patch = buildPropertyUpdate(form({ code: "OTHER", slug: "other", type: "CAFE" }), row, 3) as Record<string, unknown>;
    expect("code" in patch).toBe(false);
    expect("slug" in patch).toBe(false);
    expect("propertyType" in patch).toBe(false);
    expect("type" in patch).toBe(false);
    expect(patch.propertyId).toBe("prop-1");
  });
});

/* ------------------------------------------------------- archived opt-in */

describe("the archived filter", () => {
  const rows = [
    propertyRow(),
    propertyRow({ id: "prop-2", name: "Amrut Kitchen", status: "INACTIVE" }),
    propertyRow({ id: "prop-3", name: "Amrut Retreat", status: "ARCHIVED" }),
  ];

  it("keeps retired sites out of the list until they are asked for", () => {
    expect(filterProperties(rows, false).map((row) => row.id)).toEqual(["prop-1", "prop-2"]);
    expect(filterProperties(rows, true).map((row) => row.id)).toEqual(["prop-1", "prop-2", "prop-3"]);
  });

  it("sends the opt-in to the read, which excludes ARCHIVED by default", () => {
    expect(archivedReadRequest(false)).toEqual({});
    expect(archivedReadRequest(true)).toEqual({ includeArchived: true });
  });

  it("keeps a separate cache entry per opt-in so one view cannot serve the other's rows", () => {
    expect(propertiesCacheKey(false)).not.toBe(propertiesCacheKey(true));
  });

  it("counts what is listed and says nothing about what was excluded", () => {
    expect(summarizeProperties(filterProperties(rows, false))).toEqual({
      total: 2,
      active: 1,
      paused: 1,
      archived: 0,
    });
    expect(summarizeProperties(rows).archived).toBe(1);
  });
});

/* -------------------------------------------------------- status machine */

describe("siteStatusChoices", () => {
  it("offers pause and archive to a trading site", () => {
    expect(siteStatusChoices("ACTIVE").map((c) => c.status)).toEqual(["INACTIVE", "ARCHIVED"]);
  });

  it("offers resume and archive to a paused site", () => {
    expect(siteStatusChoices("INACTIVE").map((c) => c.status)).toEqual(["ACTIVE", "ARCHIVED"]);
  });

  it("offers a restore on the archived row, via the status transition the door supports", () => {
    const choices = siteStatusChoices("ARCHIVED");
    expect(choices.map((c) => c.status)).toEqual(["ACTIVE"]);
    expect(choices[0]?.label.toLowerCase()).toContain("restore");
  });

  it("requires a reason for every transition", () => {
    for (const status of ["ACTIVE", "INACTIVE", "ARCHIVED"] as const) {
      expect(siteStatusChoices(status).every((c) => c.requiresReason)).toBe(true);
    }
  });

  it("never offers a transition into the status the row already holds", () => {
    for (const status of ["ACTIVE", "INACTIVE", "ARCHIVED"] as const) {
      expect(siteStatusChoices(status).every((c) => c.status !== status)).toBe(true);
    }
  });
});

describe("workHereState", () => {
  it("will not make an archived site the active context", () => {
    expect(workHereState(propertyRow({ status: "ARCHIVED" }), null).enabled).toBe(false);
  });

  it("will not re-switch to the site already active", () => {
    expect(workHereState(propertyRow(), "prop-1")).toEqual({ enabled: false, label: "Current site" });
  });

  it("offers the switch for any other site", () => {
    expect(workHereState(propertyRow({ id: "prop-2" }), "prop-1")).toEqual({
      enabled: true,
      label: "Work here",
    });
  });
});

describe("submitFailure", () => {
  it("treats a CONFLICT as a stale row and tells the operator to reload", () => {
    const failure = submitFailure(new AppError("CONFLICT", "That property code is already used in this organization."));
    expect(failure.reloadRequired).toBe(true);
    expect(failure.message.toLowerCase()).toContain("reload");
  });

  it("shows a refusal inline without disturbing what was typed", () => {
    expect(submitFailure(new AppError("PERMISSION_DENIED", "You do not have permission to do that."))).toEqual({
      message: "You do not have permission to do that.",
      reloadRequired: false,
    });
  });
});

describe("displayValue", () => {
  it("reports a missing city as Not recorded rather than blank or zero", () => {
    expect(displayValue(null)).toBe("Not recorded");
    expect(displayValue("")).toBe("Not recorded");
    expect(displayValue("Pune")).toBe("Pune");
  });
});

/* ------------------------------------------------------------- row actions */

describe("PropertyRowActions", () => {
  it("offers the switch, the editor, the pause and the archive to a permitted session", () => {
    const html = rowActions(propertyRow());
    expect(html).toContain("Work here");
    expect(html).toContain("Edit");
    expect(html).toContain("Pause trading");
    expect(html).toContain("Archive site");
  });

  it("restores an archived site and offers it nothing else", () => {
    const html = rowActions(propertyRow({ status: "ARCHIVED" }));
    expect(html).toContain("Restore site");
    expect(html).not.toContain("Archive site");
    expect(html).not.toContain("Edit");
    expect(html).toContain("Archived");
  });

  it("withholds the editor and every transition from a view-only session", () => {
    const html = rowActions(propertyRow(), { mayEdit: false, mayArchive: false });
    expect(html).not.toContain("Edit");
    expect(html).not.toContain("Archive site");
    expect(html).not.toContain("Pause trading");
    expect(html).toContain("Work here");
  });

  it("marks the current site's switch disabled instead of hiding it", () => {
    const html = renderToStaticMarkup(
      <PropertyRowActions
        property={propertyRow()}
        mayEdit
        mayArchive
        currentPropertyId="prop-1"
        onWorkHere={() => {}}
        onEdit={() => {}}
        onArchive={() => {}}
        onTransition={() => {}}
      />,
    );
    expect(html).toContain("Current site");
    expect(html).toContain("disabled");
  });

  it("never reaches for the word delete", () => {
    for (const status of ["ACTIVE", "INACTIVE", "ARCHIVED"] as const) {
      expect(rowActions(propertyRow({ status })).toLowerCase()).not.toContain("delete");
    }
  });
});

/* ----------------------------------------------------------------- render */

describe("PropertiesPage render", () => {
  it("explains a build with no backend instead of spinning", () => {
    holder.state = snapshot({ status: "unconfigured", error: "This build has no backend configured." });
    const html = render();
    expect(html).toContain("No backend configured");
    expect(html).not.toContain("Loading this tenant");
  });

  it("explains a sessionless visit instead of spinning", () => {
    holder.state = snapshot({ status: "unauthenticated", permissions: null });
    const html = render();
    expect(html).toContain("Not signed in");
    expect(html).not.toContain("Loading this tenant");
  });

  it("shows a loading state while the context is still resolving", () => {
    holder.state = snapshot({ status: "loading", permissions: null });
    expect(render()).toContain("Loading this tenant");
  });

  it("names the missing capability before anything else (§51)", () => {
    holder.state = snapshot({ permissions: grant([]) });
    const html = render();
    expect(html).toContain("Access not available");
    expect(html).toContain("property.view");
    expect(html).not.toContain("Add property");
  });

  it("offers the way to fill the empty state when no tenant is active (§50)", () => {
    holder.state = snapshot({
      permissions: grant(["property.view"]),
      context: { signedIn: true, organizationId: null, propertyId: null, outletId: null, cleared: false },
    });
    const html = render();
    expect(html).toContain("No organization is active for this session");
    expect(html).toContain("Use the demo estate");
  });

  it("invites the first property when the tenant has none, and names the permission when it cannot", () => {
    seedList([]);
    const creatable = render();
    expect(creatable).toContain("No properties yet");
    expect(creatable).toContain("Add the first property");

    seedList([], { permissions: grant(["property.view"]) });
    const viewerOnly = render();
    expect(viewerOnly).toContain("No properties yet");
    expect(viewerOnly).not.toContain("Add the first property");
    expect(viewerOnly).toContain("property.create");
  });

  it("lists the sites ordered as read, with each one's own regime", () => {
    seedList([propertyRow(), propertyRow({ id: "prop-2", name: "Amrut Kitchen", type: "CAFE", city: "Nashik", businessDayStart: "06:30" })]);
    const html = render();
    expect(html).toContain("Amrut Residency Pune");
    expect(html).toContain("Amrut Kitchen");
    expect(html).toContain("AMR-PUN");
    expect(html).toContain("Cafe");
    expect(html).toContain("Nashik");
    expect(html).toContain("06:30");
    expect(html).toContain("Asia/Kolkata");
    expect(html).toContain("Include archived");
  });

  it("does not list a retired site even when one arrives under the non-archived key", () => {
    seedList([propertyRow(), propertyRow({ id: "prop-3", name: "Amrut Retreat", status: "ARCHIVED" })]);
    const html = render();
    expect(html).toContain("Amrut Residency Pune");
    expect(html).not.toContain("Amrut Retreat");
  });

  it("labels a demonstration tenant's list and leaves a customer's alone", () => {
    seedList([propertyRow()], { organization: organizationRow({ isDemo: true }) });
    expect(render()).toContain("Demo data");

    seedList([propertyRow()], { organization: organizationRow({ isDemo: false }) });
    expect(render()).not.toContain("Demo data");
  });

  it("reads its own city as Not recorded rather than leaving a hole in the table", () => {
    seedList([propertyRow({ city: null })]);
    expect(render()).toContain("Not recorded");
  });

  it("never uses the word delete anywhere on the screen (§41)", () => {
    seedList([propertyRow(), propertyRow({ id: "prop-2", name: "Amrut Kitchen", status: "INACTIVE" })], {
      organization: organizationRow(),
    });
    expect(render().toLowerCase()).not.toContain("delete");
  });
});
