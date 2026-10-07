/**
 * Outlets screen tests — node, no DOM.
 *
 * Two layers, because nothing can be clicked here:
 *   - every rule the screen enforces (scope derivation, archived opt-in, hours
 *     JSON discipline, the door-input mapping, row-action gating, conflict copy)
 *     is asserted directly against the exported pure functions;
 *   - the surfaces a session state can produce (unconfigured, unauthenticated,
 *     no property, scoped-with-permission / without) are asserted against the
 *     real static markup, with the context store mocked to a plain snapshot.
 *
 * What actually renders after a data load, and every click handler, is browser
 * behaviour this suite cannot exercise — reported as NOT_TESTED.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import OutletsPage, {
  businessHoursSummary,
  newOutletDraft,
  outletCreateInput,
  outletDraftFrom,
  outletReadOptions,
  outletRowActions,
  outletScopeFor,
  outletTypeOptions,
  outletUpdateInput,
  pageStatusFor,
  parseBusinessHours,
  submitFailureMessage,
  validateOutletForm,
  workHereSelection,
} from "@/pages/outlets/OutletsPage";
import {
  OUTLET_TYPES,
  type ActiveContext,
  type Outlet,
  type PermissionSet,
} from "@/domain/identity/types";
import { AppError } from "@/lib/errors";
import type { ContextStatus } from "@/state/context-store";

const store = vi.hoisted(() => ({
  state: {
    status: "idle",
    context: {
      signedIn: false,
      organizationId: null,
      propertyId: null,
      outletId: null,
      cleared: false,
    },
    permissions: null,
    error: null,
    bootstrap: async () => {},
    switchContext: async () => {},
  } as FakeState,
}));

type FakeState = {
  status: ContextStatus;
  context: ActiveContext;
  permissions: PermissionSet | null;
  error: string | null;
  bootstrap: () => Promise<void>;
  switchContext: (selection: {
    organizationId?: string | null;
    propertyId?: string | null;
    outletId?: string | null;
  }) => Promise<void>;
};

vi.mock("@/state/context-store", () => ({
  useContextStore: (selector: (state: FakeState) => unknown) => selector(store.state),
}));

beforeEach(() => {
  store.state = {
    status: "idle",
    context: {
      signedIn: false,
      organizationId: null,
      propertyId: null,
      outletId: null,
      cleared: false,
    },
    permissions: null,
    error: null,
    bootstrap: async () => {},
    switchContext: async () => {},
  };
});

/* ------------------------------------------------------------------ fixtures */

const READY_CONTEXT: ActiveContext = {
  signedIn: true,
  organizationId: "org-1",
  propertyId: "prop-1",
  outletId: null,
  cleared: false,
};

const NO_CONTEXT: ActiveContext = {
  signedIn: true,
  organizationId: "org-1",
  propertyId: null,
  outletId: null,
  cleared: false,
};

const FULL_GRANTS: PermissionSet = {
  organizationId: "org-1",
  propertyId: null,
  outletId: null,
  permissions: ["outlet.view", "outlet.create", "outlet.edit", "outlet.archive"],
};

function makeOutlet(overrides: Partial<Outlet> = {}): Outlet {
  return {
    id: "outlet-1",
    organizationId: "org-1",
    propertyId: "prop-1",
    name: "Lakeside Café",
    code: "LAC",
    slug: "lakeside-cafe",
    type: "RESTAURANT",
    status: "ACTIVE",
    businessHours: { breakfast: "07:00-11:00", dinner: "19:00-23:00" },
    phone: "+91 90000 00000",
    email: "cafe@example.com",
    version: 3,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
    archivedAt: null,
    ...overrides,
  };
}

/* --------------------------------------------------------------- pure rules */

describe("pageStatusFor", () => {
  it("names every session surface honestly", () => {
    expect(pageStatusFor("unconfigured", NO_CONTEXT)).toBe("unconfigured");
    expect(pageStatusFor("unauthenticated", NO_CONTEXT)).toBe("unauthenticated");
    expect(pageStatusFor("idle", NO_CONTEXT)).toBe("bootstrapping");
    expect(pageStatusFor("loading", READY_CONTEXT)).toBe("bootstrapping");
  });

  it("requires BOTH ancestors for a scoped read — no property is not an empty tenant", () => {
    expect(pageStatusFor("ready", NO_CONTEXT)).toBe("no_property");
    expect(pageStatusFor("ready", READY_CONTEXT)).toBe("scoped");
    expect(outletScopeFor(NO_CONTEXT)).toBeNull();
    expect(outletScopeFor(READY_CONTEXT)).toEqual({
      organizationId: "org-1",
      propertyId: "prop-1",
    });
  });
});

describe("archived opt-in", () => {
  it("sends nothing by default and opts in only when toggled", () => {
    expect(outletReadOptions(false)).toEqual({});
    expect(outletReadOptions(true)).toEqual({ includeArchived: true });
  });
});

describe("parseBusinessHours", () => {
  it("treats a blank field as ‘leave the stored hours alone’", () => {
    expect(parseBusinessHours("  ", { breakfast: "07:00" })).toEqual({ ok: true, value: undefined });
  });

  it("refuses invalid JSON and non-object JSON", () => {
    expect(parseBusinessHours("{breakfast:", null).ok).toBe(false);
    const array = parseBusinessHours("[1,2]", null);
    expect(array.ok).toBe(false);
    if (!array.ok) expect(array.error).toContain("JSON object");
    expect(parseBusinessHours("42", null).ok).toBe(false);
  });

  it("never lets an empty object silently erase published hours", () => {
    const erased = parseBusinessHours("{}", { breakfast: "07:00-11:00" });
    expect(erased.ok).toBe(false);
    if (!erased.ok) expect(erased.error).toContain("erase");
    expect(parseBusinessHours("{}", {})).toEqual({ ok: true, value: undefined });
  });

  it("passes a valid object through untouched", () => {
    expect(parseBusinessHours('{"brunch": "10:00-14:00"}', null)).toEqual({
      ok: true,
      value: { brunch: "10:00-14:00" },
    });
  });
});

describe("validateOutletForm", () => {
  it("demands the create-set: name, code, slug, type", () => {
    const errors = validateOutletForm(newOutletDraft(), { editing: false });
    expect(errors.name).toBeDefined();
    expect(errors.code).toBeDefined();
    expect(errors.slug).toBeDefined();
    expect(errors.type).toBeDefined();
  });

  it("relaxes to name-only when editing — immutable fields are not demanded again", () => {
    const draft = { ...newOutletDraft(), name: "" };
    const errors = validateOutletForm(draft, { editing: true });
    expect(errors.name).toBeDefined();
    expect(errors.code).toBeUndefined();
    expect(errors.slug).toBeUndefined();
    expect(errors.type).toBeUndefined();
  });

  it("checks slug shape and email format without touching the door", () => {
    const draft = {
      ...newOutletDraft(),
      name: "A",
      code: "A",
      slug: "Bad Slug!",
      type: "CAFE" as const,
      email: "not-an-email",
    };
    const errors = validateOutletForm(draft, { editing: false });
    expect(errors.slug).toBeDefined();
    expect(errors.email).toBeDefined();
  });

  it("surfaces the hours parse error on the right field", () => {
    const draft = { ...newOutletDraft(), name: "A", code: "A", slug: "a", type: "CAFE" as const, hoursText: "{" };
    const errors = validateOutletForm(draft, { editing: false });
    expect(errors.hoursText).toBeDefined();
  });
});

describe("outletDraftFrom", () => {
  it("seeds the form with exactly what the row holds", () => {
    const draft = outletDraftFrom(makeOutlet({ phone: null, email: null }));
    expect(draft).toEqual({
      name: "Lakeside Café",
      type: "RESTAURANT",
      code: "LAC",
      slug: "lakeside-cafe",
      phone: "",
      email: "",
      hoursText: JSON.stringify(
        { breakfast: "07:00-11:00", dinner: "19:00-23:00" },
        null,
        2,
      ),
    });
  });

  it("renders an empty hours editor for an empty JSON column", () => {
    expect(outletDraftFrom(makeOutlet({ businessHours: {} })).hoursText).toBe("");
  });
});

describe("outletCreateInput", () => {
  it("takes the property only — the door derives the organization itself", () => {
    const draft = {
      ...newOutletDraft(),
      name: " Terrace Bar ",
      type: "BAR" as const,
      code: " TB ",
      slug: " terrace-bar ",
    };
    const input = outletCreateInput(draft, "prop-1");
    expect("organizationId" in input).toBe(false);
    expect(input).toEqual({
      propertyId: "prop-1",
      name: "Terrace Bar",
      code: "TB",
      slug: "terrace-bar",
      type: "BAR",
    });
  });

  it("omits blank contact fields and unparsed hours", () => {
    const draft = {
      ...newOutletDraft(),
      name: "X",
      type: "CAFE" as const,
      code: "X",
      slug: "x",
      hoursText: '{"brunch": "10:00"}',
    };
    const input = outletCreateInput(draft, "prop-1");
    expect(input.phone).toBeUndefined();
    expect(input.email).toBeUndefined();
    expect(input.businessHours).toEqual({ brunch: "10:00" });
  });
});

describe("outletUpdateInput — the door’s omit/blank convention", () => {
  const outlet = makeOutlet();

  it("sends nothing but id and version when no field moved", () => {
    const draft = outletDraftFrom(outlet);
    expect(outletUpdateInput(outlet, draft)).toEqual({
      outletId: "outlet-1",
      expectedVersion: 3,
    });
  });

  it("sends the loaded version as expectedVersion (§82)", () => {
    expect(outletUpdateInput(makeOutlet({ version: 9 }), outletDraftFrom(makeOutlet({ version: 9 }))).expectedVersion).toBe(9);
  });

  it("sends a cleared phone as the empty string — never null, which means ‘not edited’", () => {
    const draft = { ...outletDraftFrom(outlet), phone: "", email: "" };
    const input = outletUpdateInput(outlet, draft);
    expect(input.phone).toBe("");
    expect(input.email).toBe("");
  });

  it("keeps a blank hours field out of the payload entirely", () => {
    const draft = { ...outletDraftFrom(outlet), hoursText: "" };
    expect("businessHours" in outletUpdateInput(outlet, draft)).toBe(false);
  });

  it("sends edited hours as the parsed object", () => {
    const draft = { ...outletDraftFrom(outlet), hoursText: '{"lunch": "12:00-15:00"}' };
    expect(outletUpdateInput(outlet, draft).businessHours).toEqual({ lunch: "12:00-15:00" });
  });
});

describe("outletRowActions — display gating; the door is the gate", () => {
  it("hides edit without outlet.edit and both status moves without outlet.archive", () => {
    const outlet = makeOutlet();
    expect(outletRowActions(outlet, { canEdit: false, canArchive: false })).toEqual(["work"]);
    expect(outletRowActions(outlet, { canEdit: true, canArchive: false })).toEqual(["work", "edit"]);
  });

  it("offers archive on an active row and restore on an archived one, never both", () => {
    const caps = { canEdit: true, canArchive: true };
    expect(outletRowActions(makeOutlet(), caps)).toEqual(["work", "edit", "archive"]);
    expect(outletRowActions(makeOutlet({ status: "ARCHIVED" }), caps)).toEqual([
      "work",
      "edit",
      "restore",
    ]);
  });

  it("gates restore by outlet.archive too — the status door is the same door in both directions", () => {
    const archived = makeOutlet({ status: "ARCHIVED" });
    expect(outletRowActions(archived, { canEdit: true, canArchive: false })).not.toContain("restore");
  });
});

describe("workHereSelection", () => {
  it("points the session at the outlet with both ancestors", () => {
    expect(workHereSelection(makeOutlet())).toEqual({
      organizationId: "org-1",
      propertyId: "prop-1",
      outletId: "outlet-1",
    });
  });
});

describe("submitFailureMessage", () => {
  it("names a conflict as a moved row, not a bad form", () => {
    expect(submitFailureMessage(new AppError("CONFLICT", "version mismatch"))).toContain(
      "changed by someone else",
    );
  });

  it("shows the door’s own line for a refusal", () => {
    expect(
      submitFailureMessage(new AppError("PERMISSION_DENIED", "You do not have permission to do that.")),
    ).toBe("You do not have permission to do that.");
  });

  it("maps an unknown throw to the safe generic message", () => {
    expect(submitFailureMessage(new Error("at Object.<anonymous> /src/x.ts"))).toBe(
      "Something went wrong. Please try again.",
    );
  });
});

describe("taxonomy pickers come from the domain arrays", () => {
  it("offers exactly OUTLET_TYPES, in order, humanized", () => {
    const options = outletTypeOptions();
    expect(options.map((option) => option.value)).toEqual([...OUTLET_TYPES]);
    expect(options.find((option) => option.value === "ROOM_SERVICE")?.label).toBe("Room Service");
  });
});

describe("businessHoursSummary", () => {
  it("says ‘Not published’ rather than inventing hours", () => {
    expect(businessHoursSummary({})).toBe("Not published");
    expect(businessHoursSummary(null)).toBe("Not published");
  });

  it("lists up to three keys and counts the rest", () => {
    expect(businessHoursSummary({ breakfast: "07:00", dinner: "19:00" })).toBe("breakfast, dinner");
    const five = { a: 1, b: 2, c: 3, d: 4, e: 5 };
    expect(businessHoursSummary(five)).toBe("a, b, c +2 more");
  });
});

/* ---------------------------------------------------------------- renderers */

function renderPage(): string {
  return renderToStaticMarkup(<OutletsPage />);
}

describe("OutletsPage surfaces", () => {
  it("reads unconfigured honestly and never as a permanent spinner", () => {
    store.state.status = "unconfigured";
    store.state.error =
      "This build has no backend configured, so it cannot read or save data.";
    const html = renderPage();
    expect(html).toContain("Backend not configured");
    expect(html).toContain("no backend configured, so it cannot read or save data");
    expect(html).not.toContain("animate-spin");
  });

  it("says sign-in for an unauthenticated session", () => {
    store.state.status = "unauthenticated";
    const html = renderPage();
    expect(html).toContain("Sign in to manage outlets");
  });

  it("shows the deliberate ‘choose a property first’ state, not an empty table", () => {
    store.state.status = "ready";
    store.state.context = NO_CONTEXT;
    const html = renderPage();
    expect(html).toContain("Choose a property first");
    expect(html).not.toContain("<table");
  });

  it("renders the scoped table in its loading state and gates Add by outlet.create", () => {
    store.state.status = "ready";
    store.state.context = READY_CONTEXT;
    const denied = renderPage();
    expect(denied).toContain("Outlets");
    expect(denied).toContain("animate-pulse"); // skeleton rows, not an empty claim
    expect(denied).not.toContain("Add outlet");

    store.state.permissions = FULL_GRANTS;
    expect(renderPage()).toContain("Add outlet");
  });

  it("offers the archived opt-in toggle on the scoped surface", () => {
    store.state.status = "ready";
    store.state.context = READY_CONTEXT;
    store.state.permissions = FULL_GRANTS;
    const html = renderPage();
    expect(html).toContain("Show archived");
    expect(html).toContain('role="switch"');
  });
});
