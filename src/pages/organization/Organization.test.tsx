/**
 * The Organization screen's rules, asserted without a browser.
 *
 * This suite runs in node: nothing can be clicked, so every rule worth pinning —
 * form values -> door input, validation, archive enablement, immutability — is an
 * exported pure function and is called directly. The render cases go through
 * `react-dom/server` against a stubbed context store, because §50/§51 states and the
 * "which actions are offered" question can only be answered by what actually renders.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BUSINESS_TYPES,
  type Organization,
  type Permission,
  type PermissionSet,
} from "@/domain/identity/types";
import type { ContextState } from "@/state/context-store";
import { AppError } from "@/lib/errors";
import OrganizationPage, {
  IMMUTABLE_ORGANIZATION_FIELDS,
  buildOrganizationUpdate,
  businessTypeOptions,
  demoLabel,
  displayValue,
  formHasErrors,
  immutableOrganizationField,
  isImmutableOrganizationField,
  organizationFormValues,
  organizationStatusChoices,
  submitFailure,
  taxonomyLabel,
  validateOrganizationForm,
  type OrganizationFormValues,
} from "./OrganizationPage";

/* ------------------------------------------------------------------ harness */

const holder: { state: ContextState } = { state: snapshot() };

vi.mock("@/state/context-store", () => ({
  // In a browser zustand hands the page the live state; here the same selector is
  // applied to a snapshot the test controls. `getState` belongs to that same live
  // surface: a static render cannot see the hook's value, so a component that reads the
  // snapshot directly (TeamPage, RolesPage, AccessDenied) has to be served it too.
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
    legalName: "Amrut Hospitality Private Limited",
    displayName: "Amrut",
    code: "AMR",
    slug: "amrut-hospitality",
    businessTypes: ["HOTEL", "RESTAURANT"],
    status: "ACTIVE",
    country: "IN",
    currency: "INR",
    timezone: "Asia/Kolkata",
    locale: "en-IN",
    taxRegion: "MH",
    phone: "+91 22 4000 1000",
    email: "group@example.test",
    website: "https://amrut.example.test",
    logoUrl: null,
    isDemo: false,
    version: 4,
    createdAt: "2026-01-05T09:00:00Z",
    updatedAt: "2026-02-01T09:00:00Z",
    archivedAt: null,
    ...overrides,
  };
}

function form(overrides: Partial<OrganizationFormValues> = {}): OrganizationFormValues {
  return {
    name: "Amrut Hospitality",
    legalName: "Amrut Hospitality Private Limited",
    displayName: "Amrut",
    country: "IN",
    currency: "INR",
    timezone: "Asia/Kolkata",
    locale: "en-IN",
    taxRegion: "MH",
    phone: "+91 22 4000 1000",
    email: "group@example.test",
    website: "https://amrut.example.test",
    logoUrl: "",
    businessTypes: ["HOTEL", "RESTAURANT"],
    ...overrides,
  };
}

function render(): string {
  return renderToStaticMarkup(<OrganizationPage />);
}

const VIEW = ["organization.view"];
const ALL = ["organization.view", "organization.edit", "organization.archive"];

/* ------------------------------------------------------------ form values */

describe("organizationFormValues", () => {
  it("turns a row into strings, mapping every NULL to the empty string", () => {
    const values = organizationFormValues(organizationRow({ logoUrl: null, taxRegion: null }));
    expect(values.logoUrl).toBe("");
    expect(values.taxRegion).toBe("");
    expect(values.name).toBe("Amrut Hospitality");
    expect(values.country).toBe("IN");
    expect(values.businessTypes).toEqual(["HOTEL", "RESTAURANT"]);
  });

  it("copies the business types so a form edit cannot mutate the loaded row", () => {
    const row = organizationRow();
    const values = organizationFormValues(row);
    values.businessTypes.push("CAFE");
    expect(row.businessTypes).toEqual(["HOTEL", "RESTAURANT"]);
  });
});

/* ------------------------------------------------------------ validation */

describe("validateOrganizationForm", () => {
  it("accepts a form that satisfies the door's own patterns", () => {
    expect(validateOrganizationForm(form())).toEqual({});
  });

  it("accepts an empty optional field — that is the operator clearing it", () => {
    const errors = validateOrganizationForm(
      form({ phone: "", email: "", website: "", legalName: "", logoUrl: "", taxRegion: "" }),
    );
    expect(formHasErrors(errors)).toBe(false);
  });

  it("names the field, not a generic failure, for each shape the database refuses", () => {
    const errors = validateOrganizationForm(
      form({
        name: "A",
        country: "india",
        currency: "rupee",
        timezone: "kolkata",
        locale: "EN_in",
        email: "not-an-email",
        website: "amrut.example.test",
        phone: "0".repeat(40),
      }),
    );
    expect(Object.keys(errors).sort()).toEqual(
      ["country", "currency", "email", "locale", "name", "phone", "timezone", "website"].sort(),
    );
  });

  it("refuses a business type outside the taxonomy the CHECK accepts", () => {
    const bogus = ["HOTEL", "NOT_A_FORMAT"] as unknown as OrganizationFormValues["businessTypes"];
    const errors = validateOrganizationForm(form({ businessTypes: bogus }));
    expect(errors.businessTypes).toBeDefined();
    expect(formHasErrors(errors)).toBe(true);
  });

  it("only offers the formats the domain declares", () => {
    expect(businessTypeOptions().map((option) => option.value)).toEqual([...BUSINESS_TYPES]);
    expect(businessTypeOptions().every((option) => option.label.length > 0)).toBe(true);
  });

  it("labels a taxonomy value from the constant instead of a hand-copied list", () => {
    expect(taxonomyLabel("CLOUD_KITCHEN")).toBe("Cloud Kitchen");
    expect(taxonomyLabel("CONVENTION_CENTER")).toBe("Convention Center");
  });
});

/* ---------------------------------------------------- door input building */

describe("buildOrganizationUpdate", () => {
  const row = organizationRow();

  it("sends every NOT NULL column, always normalised", () => {
    const patch = buildOrganizationUpdate(form({ country: " in ", currency: " inr " }), row, 4);
    expect(patch.name).toBe("Amrut Hospitality");
    expect(patch.country).toBe("IN");
    expect(patch.currency).toBe("INR");
    expect(patch.businessTypes).toEqual(["HOTEL", "RESTAURANT"]);
  });

  it("leaves an untouched blankable field out of the patch so the door keeps the column", () => {
    const patch = buildOrganizationUpdate(form(), row, 4);
    expect("phone" in patch).toBe(false);
    expect("email" in patch).toBe(false);
    expect("legalName" in patch).toBe(false);
    // logoUrl is NULL on the row and empty in the form: nothing was edited.
    expect("logoUrl" in patch).toBe(false);
  });

  it("sends the empty string — not undefined — when the operator clears a field", () => {
    const patch = buildOrganizationUpdate(form({ phone: "" }), row, 4);
    expect(patch.phone).toBe("");
    expect("phone" in patch).toBe(true);
  });

  it("sends a changed blankable field verbatim", () => {
    const patch = buildOrganizationUpdate(form({ taxRegion: "GA" }), row, 4);
    expect(patch.taxRegion).toBe("GA");
  });

  it("carries the version the row had when it was read", () => {
    expect(buildOrganizationUpdate(form(), row, 7).expectedVersion).toBe(7);
  });

  it("never sends code or slug", () => {
    const patch = buildOrganizationUpdate(form(), row, 4) as Record<string, unknown>;
    expect("code" in patch).toBe(false);
    expect("slug" in patch).toBe(false);
    expect(patch.organizationId).toBe("org-1");
  });
});

/* ----------------------------------------------------------- immutability */

describe("immutable identifiers", () => {
  it("locks exactly the two columns quoted in document numbers and URLs", () => {
    expect(isImmutableOrganizationField("code")).toBe(true);
    expect(isImmutableOrganizationField("slug")).toBe(true);
    expect(isImmutableOrganizationField("name")).toBe(false);
    expect(IMMUTABLE_ORGANIZATION_FIELDS.map((field) => field.key)).toEqual(["code", "slug"]);
  });

  it("states the reason rather than refusing silently", () => {
    expect(immutableOrganizationField("code").reason).toContain("document numbers");
    expect(immutableOrganizationField("slug").reason).toContain("URL");
  });
});

/* -------------------------------------------------------- status machine */

describe("organizationStatusChoices", () => {
  it("offers suspend and archive to a trading tenant", () => {
    expect(organizationStatusChoices("ACTIVE").map((c) => c.status)).toEqual([
      "SUSPENDED",
      "ARCHIVED",
    ]);
  });

  it("offers restore to a suspended tenant without taking archive away", () => {
    expect(organizationStatusChoices("SUSPENDED").map((c) => c.status)).toEqual([
      "ACTIVE",
      "ARCHIVED",
    ]);
  });

  it("offers only a restore on an archived tenant — there is no second archive, no delete", () => {
    const choices = organizationStatusChoices("ARCHIVED");
    expect(choices.map((c) => c.status)).toEqual(["ACTIVE"]);
    expect(choices[0]?.label.toLowerCase()).toContain("restore");
  });

  it("never offers a transition into the status the row already holds", () => {
    for (const status of ["ACTIVE", "SUSPENDED", "ARCHIVED"] as const) {
      expect(organizationStatusChoices(status).every((c) => c.status !== status)).toBe(true);
    }
  });

  it("requires a reason for every transition, because every door takes p_reason", () => {
    for (const status of ["ACTIVE", "SUSPENDED", "ARCHIVED"] as const) {
      expect(organizationStatusChoices(status).every((c) => c.requiresReason)).toBe(true);
    }
  });
});

/* --------------------------------------------------------------- failures */

describe("submitFailure", () => {
  it("treats a CONFLICT as a stale row, not a failed save", () => {
    const failure = submitFailure(new AppError("CONFLICT", "Someone changed this record first."));
    expect(failure.reloadRequired).toBe(true);
    expect(failure.message.toLowerCase()).toContain("reload");
  });

  it("shows a refusal inline and keeps the form usable", () => {
    const failure = submitFailure(new AppError("PERMISSION_DENIED", "You do not have permission to do that."));
    expect(failure).toEqual({
      message: "You do not have permission to do that.",
      reloadRequired: false,
    });
  });

  it("surfaces a validation refusal as the door's own line", () => {
    expect(submitFailure(new AppError("VALIDATION_FAILED", "Enter a two-letter country code.")).reloadRequired).toBe(false);
  });

  it("never leaks an unknown throw's internals", () => {
    const failure = submitFailure(new Error("connect ECONNREFUSED /src/db/client.ts"));
    expect(failure.message).toBe("Something went wrong. Please try again.");
    expect(failure.reloadRequired).toBe(false);
  });
});

describe("displayValue", () => {
  it("records a missing value honestly instead of a dash, zero or blank", () => {
    expect(displayValue(null)).toBe("Not recorded");
    expect(displayValue("")).toBe("Not recorded");
    expect(displayValue("   ")).toBe("Not recorded");
    expect(displayValue("MH")).toBe("MH");
  });
});

describe("demoLabel", () => {
  it("labels a demo tenant and says nothing about a customer's", () => {
    expect(demoLabel(true)).toBe("Demo data");
    expect(demoLabel(false)).toBeNull();
  });
});

/* ----------------------------------------------------------------- render */

describe("OrganizationPage render", () => {
  it("explains a build with no backend instead of spinning", () => {
    holder.state = snapshot({
      status: "unconfigured",
      error: "Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable this build.",
    });
    const html = render();
    expect(html).toContain("No backend configured");
    expect(html).toContain("VITE_SUPABASE_URL");
    expect(html).not.toContain("Loading this organization");
  });

  it("explains a sessionless visit instead of spinning", () => {
    holder.state = snapshot({ status: "unauthenticated", permissions: null });
    const html = render();
    expect(html).toContain("Not signed in");
    expect(html).toContain("session");
    expect(html).not.toContain("Loading this organization");
  });

  it("shows a loading state while the context is still resolving", () => {
    holder.state = snapshot({ status: "loading", permissions: null });
    expect(render()).toContain("Loading this organization");
  });

  it("names the missing capability when the tenant record cannot be viewed (§51)", () => {
    holder.state = snapshot({ permissions: grant([]) });
    const html = render();
    expect(html).toContain("Access not available");
    expect(html).toContain("organization.view");
  });

  it("offers the way to fill the empty state when no tenant is active (§50)", () => {
    holder.state = snapshot({
      context: { signedIn: true, organizationId: null, propertyId: null, outletId: null, cleared: false },
      permissions: null,
    });
    const html = render();
    expect(html).toContain("No organization is active for this session");
    expect(html).toContain("Use the demo estate");
    expect(html).toContain("<button");
  });

  it("shows the record but withholds every action from a view-only session", () => {
    holder.state = snapshot({
      permissions: grant(VIEW),
      organization: organizationRow(),
    });
    const html = render();
    expect(html).toContain("Amrut Hospitality");
    expect(html).toContain("AMR");
    expect(html).toContain("amrut-hospitality");
    expect(html).not.toContain("Edit details");
    expect(html).not.toContain("Suspend trading");
    expect(html).not.toContain("Archive tenant");
    expect(html).toContain("organization.archive");
  });

  it("offers edit, suspend and archive once the capabilities are held", () => {
    holder.state = snapshot({ permissions: grant(ALL), organization: organizationRow() });
    const html = render();
    expect(html).toContain("Edit details");
    expect(html).toContain("Suspend trading");
    expect(html).toContain("Archive tenant");
  });

  it("offers a restore, and no archive, on a retired tenant", () => {
    holder.state = snapshot({
      permissions: grant(ALL),
      organization: organizationRow({ status: "ARCHIVED", archivedAt: "2026-03-01T00:00:00Z" }),
    });
    const html = render();
    expect(html).toContain("Restore as trading");
    expect(html).not.toContain("Archive tenant");
    expect(html).toContain("archived");
  });

  it("labels a demo tenant where its data appears, and leaves a customer's unlabelled", () => {
    holder.state = snapshot({
      permissions: grant(ALL),
      organization: organizationRow({ isDemo: true }),
    });
    expect(render()).toContain("Demo data");

    holder.state = snapshot({ permissions: grant(ALL), organization: organizationRow({ isDemo: false }) });
    expect(render()).not.toContain("Demo data");
  });

  it("keeps the immutable identifiers on screen with the reason they are read-only", () => {
    holder.state = snapshot({ permissions: grant(ALL), organization: organizationRow() });
    const html = render();
    expect(html).toContain("Organization code");
    expect(html).toContain("URL slug");
    expect(html).toContain("document numbers");
  });

  it("never uses the word delete, because archive is a status (§41)", () => {
    for (const status of ["ACTIVE", "SUSPENDED", "ARCHIVED"] as const) {
      holder.state = snapshot({ permissions: grant(ALL), organization: organizationRow({ status }) });
      expect(render().toLowerCase()).not.toContain("delete");
    }
  });

  it("renders the tenant's own values, not an invented zero, when columns are NULL", () => {
    holder.state = snapshot({
      permissions: grant(ALL),
      organization: organizationRow({
        legalName: null,
        displayName: null,
        taxRegion: null,
        phone: null,
        email: null,
        website: null,
        logoUrl: null,
        businessTypes: [],
      }),
    });
    const html = render();
    expect(html).toContain("Not recorded");
    expect(html).toContain("None declared");
  });
});
