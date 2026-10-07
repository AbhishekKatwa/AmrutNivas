/**
 * Departments screen tests — node, no DOM.
 *
 * The rules that matter here are pure-function rules, because nothing can be
 * clicked in this suite:
 *   - `outletId === null` renders as "Property-wide", never as a blank (§14);
 *   - BOTH retire and restore hide behind `department.archive` — the status door
 *     demands that capability on every transition, so rename rights never buy a
 *     disappearance (`departmentRowActions`);
 *   - the edit payload is name + expectedVersion only — code/slug immutable,
 *     parent not movable;
 *   - the archived read is an opt-in, and the session surfaces (unconfigured,
 *     unauthenticated, no property) are rendered honestly.
 * The context store is mocked to a plain snapshot; what renders after a real data
 * load and every click handler remain browser-only (NOT_TESTED).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import DepartmentsPage, {
  PROPERTY_WIDE,
  departmentCreateInput,
  departmentDraftFrom,
  departmentFilterOptions,
  departmentOutletLabel,
  departmentReadOptions,
  departmentRowActions,
  departmentScopeFor,
  departmentUpdateInput,
  filterDepartments,
  newDepartmentDraft,
  outletChoiceOptions,
  pageStatusFor,
  submitFailureMessage,
  validateDepartmentForm,
} from "@/pages/departments/DepartmentsPage";
import type { ActiveContext, Department, Outlet, PermissionSet } from "@/domain/identity/types";
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
  } as FakeState,
}));

type FakeState = {
  status: ContextStatus;
  context: ActiveContext;
  permissions: PermissionSet | null;
  error: string | null;
  bootstrap: () => Promise<void>;
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
  };
});

/* ----------------------------------------------------------------- fixtures */

const READY_CONTEXT: ActiveContext = {
  signedIn: true,
  organizationId: "org-1",
  propertyId: "prop-1",
  outletId: null,
  cleared: false,
};

const NO_PROPERTY: ActiveContext = { ...READY_CONTEXT, propertyId: null };

const FULL_GRANTS: PermissionSet = {
  organizationId: "org-1",
  propertyId: null,
  outletId: null,
  permissions: ["department.view", "department.create", "department.edit", "department.archive"],
};

const RENAME_ONLY_GRANTS: PermissionSet = {
  ...FULL_GRANTS,
  permissions: ["department.view", "department.edit"],
};

const RESTAURANT: Outlet = {
  id: "outlet-1",
  organizationId: "org-1",
  propertyId: "prop-1",
  name: "Kitchen",
  code: "KIT",
  slug: "kitchen",
  type: "RESTAURANT",
  status: "ACTIVE",
  businessHours: {},
  phone: null,
  email: null,
  version: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  archivedAt: null,
};

const RETIRED_BAR: Outlet = { ...RESTAURANT, id: "outlet-2", name: "Old Bar", status: "ARCHIVED" };

function makeDepartment(overrides: Partial<Department> = {}): Department {
  return {
    id: "dept-1",
    organizationId: "org-1",
    propertyId: "prop-1",
    outletId: "outlet-1",
    name: "Kitchen Operations",
    code: "KITOPS",
    slug: "kitchen-operations",
    status: "ACTIVE",
    version: 4,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
    ...overrides,
  };
}

const FRONT_OFFICE = makeDepartment({ id: "dept-2", name: "Front Office", outletId: null });

/* --------------------------------------------------------------- pure rules */

describe("scope and archived opt-in", () => {
  it("needs both ancestors; the property is the boundary", () => {
    expect(departmentScopeFor(NO_PROPERTY)).toBeNull();
    expect(departmentScopeFor(READY_CONTEXT)).toEqual({
      organizationId: "org-1",
      propertyId: "prop-1",
    });
  });

  it("reads without archived by default and opts in only when toggled", () => {
    expect(departmentReadOptions(false)).toEqual({});
    expect(departmentReadOptions(true)).toEqual({ includeArchived: true });
  });

  it("maps each session surface honestly — never a permanent spinner", () => {
    expect(pageStatusFor("unconfigured", NO_PROPERTY)).toBe("unconfigured");
    expect(pageStatusFor("unauthenticated", NO_PROPERTY)).toBe("unauthenticated");
    expect(pageStatusFor("loading", READY_CONTEXT)).toBe("bootstrapping");
    expect(pageStatusFor("ready", NO_PROPERTY)).toBe("no_property");
    expect(pageStatusFor("ready", READY_CONTEXT)).toBe("scoped");
  });
});

describe("the nullable outlet link is first-class (§14)", () => {
  it("names null as Property-wide, a known outlet by name, and an unknown one honestly", () => {
    const outlets = [RESTAURANT];
    expect(departmentOutletLabel(FRONT_OFFICE, outlets)).toBe("Property-wide");
    expect(departmentOutletLabel(makeDepartment(), outlets)).toBe("Kitchen");
    expect(departmentOutletLabel(makeDepartment({ outletId: "gone" }), outlets)).toBe(
      "Outlet outside this list",
    );
  });

  it("seeds the draft with PROPERTY_WIDE for a null link and the outlet id otherwise", () => {
    expect(departmentDraftFrom(FRONT_OFFICE).outletChoice).toBe(PROPERTY_WIDE);
    expect(departmentDraftFrom(makeDepartment()).outletChoice).toBe("outlet-1");
  });
});

describe("filtering by outlet", () => {
  const rows = [makeDepartment(), FRONT_OFFICE, makeDepartment({ id: "dept-3", outletId: "outlet-2" })];

  it("ALL returns every row; the property-wide view returns only null links", () => {
    expect(filterDepartments(rows, "ALL")).toHaveLength(3);
    expect(filterDepartments(rows, PROPERTY_WIDE).map((row) => row.id)).toEqual(["dept-2"]);
  });

  it("an outlet view returns exactly that outlet’s rows", () => {
    expect(filterDepartments(rows, "outlet-1").map((row) => row.id)).toEqual(["dept-1"]);
  });

  it("keeps the service’s name order — filters never re-sort a master list", () => {
    const names = filterDepartments(rows, "ALL").map((row) => row.name);
    expect(names).toEqual(["Kitchen Operations", "Front Office", "Kitchen Operations"]);
  });

  it("offers the two whole-list views first, then outlets in the given order", () => {
    const options = departmentFilterOptions([RESTAURANT, RETIRED_BAR]);
    expect(options.map((option) => option.value)).toEqual(["ALL", PROPERTY_WIDE, "outlet-1", "outlet-2"]);
  });

  it("never offers an archived outlet as a new parent in the create form", () => {
    const options = outletChoiceOptions([RESTAURANT, RETIRED_BAR]);
    expect(options[0]?.value).toBe(PROPERTY_WIDE);
    expect(options.map((option) => option.value)).not.toContain("outlet-2");
  });
});

describe("validateDepartmentForm", () => {
  it("demands name, code and slug on create", () => {
    const errors = validateDepartmentForm(newDepartmentDraft(), false);
    expect(Object.keys(errors).sort()).toEqual(["code", "name", "slug"]);
  });

  it("demands only the name on edit — code/slug are immutable and not editable", () => {
    const errors = validateDepartmentForm(newDepartmentDraft(), true);
    expect(Object.keys(errors)).toEqual(["name"]);
  });

  it("rejects a malformed slug on create", () => {
    const draft = { ...newDepartmentDraft(), name: "Housekeeping", code: "HK", slug: "Bad Slug!" };
    expect(validateDepartmentForm(draft, false).slug).toBeDefined();
  });
});

describe("door inputs", () => {
  it("create derives nothing itself: property, trimmed identifiers, and null for property-wide", () => {
    const draft = {
      ...newDepartmentDraft(),
      name: " Front Office ",
      code: " FO ",
      slug: " front-office ",
    };
    expect(departmentCreateInput(draft, "prop-1")).toEqual({
      propertyId: "prop-1",
      name: "Front Office",
      code: "FO",
      slug: "front-office",
      outletId: null,
    });
  });

  it("create passes a chosen outlet through", () => {
    const draft = { ...newDepartmentDraft(), name: "X", code: "X", slug: "x", outletChoice: "outlet-1" };
    expect(departmentCreateInput(draft, "prop-1").outletId).toBe("outlet-1");
  });

  it("edit is name + expectedVersion only — never code, slug or the parent", () => {
    const department = makeDepartment();
    const input = departmentUpdateInput(department, departmentDraftFrom(department));
    expect(input).toEqual({ departmentId: "dept-1", expectedVersion: 4 });
    expect("name" in input).toBe(false);
    expect("code" in input).toBe(false);
    expect("outletId" in input).toBe(false);

    const renamed = departmentUpdateInput(department, {
      ...departmentDraftFrom(department),
      name: " Kitchen Ops ",
    });
    expect(renamed).toEqual({
      departmentId: "dept-1",
      expectedVersion: 4,
      name: "Kitchen Ops",
    });
  });

  it("refuses to send a blank name, keeping the column NOT NULL honest", () => {
    const input = departmentUpdateInput(makeDepartment(), { ...departmentDraftFrom(makeDepartment()), name: "  " });
    expect("name" in input).toBe(false);
  });
});

describe("departmentRowActions — archive is its own permission, not a rename side effect", () => {
  it("a rename-only holder can edit but can neither retire nor restore", () => {
    expect(departmentRowActions(makeDepartment(), { canEdit: true, canArchive: false })).toEqual(["edit"]);
    expect(
      departmentRowActions(makeDepartment({ status: "ARCHIVED" }), { canEdit: true, canArchive: false }),
    ).not.toContain("restore");
  });

  it("an archive holder sees retire on an active row and restore on a retired one", () => {
    expect(departmentRowActions(makeDepartment(), { canEdit: false, canArchive: true })).toEqual(["archive"]);
    expect(
      departmentRowActions(makeDepartment({ status: "ARCHIVED" }), { canEdit: false, canArchive: true }),
    ).toEqual(["restore"]);
  });

  it("nothing at all without either capability", () => {
    expect(departmentRowActions(makeDepartment(), { canEdit: false, canArchive: false })).toEqual([]);
  });
});

describe("submitFailureMessage", () => {
  it("a conflict tells the operator the row changed, not that they typed it wrong", () => {
    expect(submitFailureMessage(new AppError("CONFLICT", "version mismatch"))).toContain(
      "cost centre was changed by someone else",
    );
  });

  it("shows the door’s refusal line and keeps the safe generic for junk", () => {
    expect(
      submitFailureMessage(new AppError("PERMISSION_DENIED", "You do not have permission to do that.")),
    ).toBe("You do not have permission to do that.");
    expect(submitFailureMessage("boom")).toBe("Something went wrong. Please try again.");
  });
});

/* ---------------------------------------------------------------- renderers */

function renderPage(): string {
  return renderToStaticMarkup(<DepartmentsPage />);
}

describe("DepartmentsPage surfaces", () => {
  it("reads unconfigured honestly and never as a permanent spinner", () => {
    store.state.status = "unconfigured";
    const html = renderPage();
    expect(html).toContain("Backend not configured");
    expect(html).toContain("no backend configured, so it cannot read or save data");
    expect(html).not.toContain("animate-spin");
  });

  it("says sign-in for an unauthenticated session", () => {
    store.state.status = "unauthenticated";
    expect(renderPage()).toContain("Sign in to manage departments");
  });

  it("shows the deliberate ‘choose a property first’ state, not an empty table", () => {
    store.state.status = "ready";
    store.state.context = NO_PROPERTY;
    const html = renderPage();
    expect(html).toContain("Choose a property first");
    expect(html).not.toContain("<table");
  });

  it("renders the scoped table loading, gates Add by department.create, and shows the outlet filter", () => {
    store.state.status = "ready";
    store.state.context = READY_CONTEXT;

    const denied = renderPage();
    expect(denied).toContain("Departments");
    expect(denied).toContain("animate-pulse");
    expect(denied).not.toContain("Add department");

    // A rename-only holder still cannot create — create is its own capability.
    store.state.permissions = RENAME_ONLY_GRANTS;
    const renameOnly = renderPage();
    expect(renameOnly).not.toContain("Add department");
    expect(renameOnly).toContain("Property-wide only");
    expect(renameOnly).toContain('role="switch"');

    store.state.permissions = FULL_GRANTS;
    expect(renderPage()).toContain("Add department");
  });
});
