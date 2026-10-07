/**
 * The cost-centre level, exercised against a stub transport.
 *
 * This is where `null` and "absent" genuinely differ: a department's outlet parent is
 * nullable (§14), so `outletId: null` must reach the wire as `p_outlet: null` /
 * `["eq", ["outlet_id", null]]` — "the property-level departments only" — while an
 * omitted `outletId` must add no predicate at all. The read and the write are both
 * asserted on that difference.
 */
import { afterEach, describe, expect, it } from "vitest";
import { setSupabaseClientForTests } from "@/db/client";
import type { Department } from "@/domain/identity/types";
import {
  createDepartment,
  getDepartment,
  listDepartments,
  setDepartmentStatus,
  updateDepartment,
} from "./department-service";
import {
  doorParametersMatchTheSchema,
  stubBackend,
  type BackendStub,
} from "@/test-helpers/transport";

const ORG = "a0000000-0000-4000-8000-000000000001";
const PROPERTY = "a1000000-0000-4000-8000-000000000007";
const OUTLET = "a2000000-0000-4000-8000-000000000003";
const DEPARTMENT = "a3000000-0000-4000-8000-000000000011";
const ACTOR = "b0000000-0000-4000-8000-000000000009";

const KITCHEN_ROW = {
  id: DEPARTMENT,
  organization_id: ORG,
  property_id: PROPERTY,
  outlet_id: OUTLET,
  name: "Kitchen",
  code: "KIT",
  slug: "sea-view-kitchen",
  status: "ACTIVE",
  version: 1,
  created_at: "2026-01-12T09:00:00Z",
  updated_at: "2026-01-12T09:00:00Z",
  created_by: ACTOR,
};

const KITCHEN: Department = {
  id: DEPARTMENT,
  organizationId: ORG,
  propertyId: PROPERTY,
  outletId: OUTLET,
  name: "Kitchen",
  code: "KIT",
  slug: "sea-view-kitchen",
  status: "ACTIVE",
  version: 1,
  createdAt: "2026-01-12T09:00:00Z",
  updatedAt: "2026-01-12T09:00:00Z",
};

const FRONT_OFFICE_ROW = { ...KITCHEN_ROW, outlet_id: null, name: "Front Office", code: "FO" };
const FRONT_OFFICE: Department = {
  ...KITCHEN,
  outletId: null,
  name: "Front Office",
  code: "FO",
};

const REQUIRED_CREATE = {
  propertyId: PROPERTY,
  name: "Kitchen",
  code: "KIT",
  slug: "sea-view-kitchen",
};

const SCOPE = { organizationId: ORG, propertyId: PROPERTY };

function withReads(rows: Record<string, unknown[]>): BackendStub {
  const read = stubBackend({ reads: (query) => rows[query.table] });
  setSupabaseClientForTests(read.client);
  return read;
}

function withDoorRows(row: Record<string, unknown>): BackendStub {
  const written = stubBackend({ doors: () => ({ data: row }) });
  setSupabaseClientForTests(written.client);
  return written;
}

afterEach(() => setSupabaseClientForTests(undefined));

describe("listDepartments", () => {
  it("scopes the read to both ancestors and hides retired centres", async () => {
    const read = withReads({ departments: [KITCHEN_ROW, FRONT_OFFICE_ROW] });

    const departments = await listDepartments(SCOPE);

    expect(read.queries[0].table).toBe("departments");
    expect(read.queries[0].steps).toContainEqual(["eq", ["organization_id", ORG]]);
    expect(read.queries[0].steps).toContainEqual(["eq", ["property_id", PROPERTY]]);
    expect(read.queries[0].steps).toContainEqual(["neq", ["status", "ARCHIVED"]]);
    expect(departments).toEqual([KITCHEN, FRONT_OFFICE]);
  });

  it("narrows to one outlet only when the caller names one", async () => {
    const read = withReads({ departments: [KITCHEN_ROW] });
    await expect(listDepartments({ ...SCOPE, outletId: OUTLET })).resolves.toEqual([KITCHEN]);
    expect(read.queries[0].steps).toContainEqual(["eq", ["outlet_id", OUTLET]]);
  });

  it("reads the property-level centres alone for an explicit null outlet", async () => {
    // `null` is a predicate here, not an omission: this is how a screen lists a
    // property-wide Front Office without also pulling every outlet's departments.
    const read = withReads({ departments: [FRONT_OFFICE_ROW] });
    await expect(listDepartments({ ...SCOPE, outletId: null })).resolves.toEqual([FRONT_OFFICE]);
    expect(read.queries[0].steps).toContainEqual(["eq", ["outlet_id", null]]);
  });

  it("adds no outlet predicate when the caller says nothing, and re-admits archived rows", async () => {
    const archived = { ...KITCHEN_ROW, status: "ARCHIVED" };
    const read = withReads({ departments: [archived] });

    const departments = await listDepartments(SCOPE, { includeArchived: true });

    expect(read.queries[0].steps.some(([, args]) => args.includes("outlet_id"))).toBe(false);
    expect(read.queries[0].steps.some(([, args]) => args.includes("status"))).toBe(false);
    expect(departments).toEqual([{ ...KITCHEN, status: "ARCHIVED" }]);
  });
});

describe("getDepartment", () => {
  it("filters on the id plus both ancestors", async () => {
    const read = withReads({ departments: [KITCHEN_ROW] });

    await expect(getDepartment(DEPARTMENT, SCOPE)).resolves.toEqual(KITCHEN);

    expect(read.queries[0].steps).toContainEqual(["eq", ["id", DEPARTMENT]]);
    expect(read.queries[0].steps).toContainEqual(["eq", ["organization_id", ORG]]);
    expect(read.queries[0].steps).toContainEqual(["eq", ["property_id", PROPERTY]]);
    expect(read.queries[0].steps).toContainEqual(["limit", [1]]);
  });

  it("answers null when the cost centre is in another property", async () => {
    withReads({ departments: [] });
    await expect(getDepartment(DEPARTMENT, SCOPE)).resolves.toBeNull();
  });

  it("selects the flat columns this level has, and no archived_at it cannot have", async () => {
    // 001 gives `departments` no `archived_at`: retirement here is the status alone,
    // so a column list that reached for it would fail the read at PostgREST.
    const read = withReads({ departments: [] });
    await listDepartments(SCOPE);

    expect(read.queries[0].columns).toContain("outlet_id");
    expect(read.queries[0].columns).not.toContain("archived_at");
    expect(read.queries[0].columns).not.toMatch(/[()]/);
  });
});

describe("createDepartment", () => {
  it("sends exactly the parameters create_department declares", async () => {
    const written = withDoorRows(KITCHEN_ROW);

    await createDepartment({ ...REQUIRED_CREATE, outletId: OUTLET });

    expect(written.calls).toEqual([
      {
        name: "create_department",
        args: {
          p_property: PROPERTY,
          p_name: REQUIRED_CREATE.name,
          p_code: REQUIRED_CREATE.code,
          p_slug: REQUIRED_CREATE.slug,
          p_outlet: OUTLET,
        },
      },
    ]);
    expect(() =>
      doorParametersMatchTheSchema("create_department", written.argsFor("create_department")),
    ).not.toThrow();
  });

  it("sends an explicit null outlet for a property-level centre", async () => {
    const written = withDoorRows(FRONT_OFFICE_ROW);

    await expect(createDepartment({ ...REQUIRED_CREATE, outletId: null })).resolves.toEqual(
      FRONT_OFFICE,
    );

    const sent = written.argsFor("create_department");
    expect(sent).toEqual({
      p_property: PROPERTY,
      p_name: REQUIRED_CREATE.name,
      p_code: REQUIRED_CREATE.code,
      p_slug: REQUIRED_CREATE.slug,
      p_outlet: null,
    });
    expect(() => doorParametersMatchTheSchema("create_department", sent)).not.toThrow();
  });

  it("leaves an unstated outlet absent so the door's default applies", async () => {
    const written = withDoorRows(FRONT_OFFICE_ROW);
    await createDepartment(REQUIRED_CREATE);
    expect(written.argsFor("create_department")).not.toHaveProperty("p_outlet");
  });

  it("returns the written row as a cost centre, not as a database record", async () => {
    withDoorRows(KITCHEN_ROW);
    await expect(createDepartment(REQUIRED_CREATE)).resolves.toEqual(KITCHEN);
  });
});

describe("updateDepartment", () => {
  it("sends the department, the new name and the version it read", async () => {
    const written = withDoorRows({ ...KITCHEN_ROW, name: "Main Kitchen", version: 2 });

    await updateDepartment({
      departmentId: DEPARTMENT,
      name: "Main Kitchen",
      expectedVersion: 1,
    });

    expect(written.calls).toEqual([
      {
        name: "update_department",
        args: {
          p_department: DEPARTMENT,
          p_name: "Main Kitchen",
          p_expected_version: 1,
        },
      },
    ]);
    expect(() =>
      doorParametersMatchTheSchema("update_department", written.argsFor("update_department")),
    ).not.toThrow();
  });

  it("sends no version key when the caller holds none", async () => {
    const written = withDoorRows(KITCHEN_ROW);
    await updateDepartment({ departmentId: DEPARTMENT });

    expect(written.argsFor("update_department")).toEqual({ p_department: DEPARTMENT });
  });

  it("cannot move a department between outlets, because the door has no such parameter", async () => {
    const written = withDoorRows(KITCHEN_ROW);
    await updateDepartment({ departmentId: DEPARTMENT, name: "Banquet Kitchen" });

    const sent = written.argsFor("update_department");
    expect(sent).not.toHaveProperty("p_outlet");
    expect(sent).not.toHaveProperty("p_property");
    expect(() => doorParametersMatchTheSchema("update_department", sent)).not.toThrow();
  });
});

describe("setDepartmentStatus", () => {
  it("sends the department, the status and the operator's reason", async () => {
    const written = withDoorRows({ ...KITCHEN_ROW, status: "INACTIVE" });

    await setDepartmentStatus({
      departmentId: DEPARTMENT,
      status: "INACTIVE",
      reason: "Team merged into Front Office for the season.",
    });

    expect(written.calls).toEqual([
      {
        name: "set_department_status",
        args: {
          p_department: DEPARTMENT,
          p_status: "INACTIVE",
          p_reason: "Team merged into Front Office for the season.",
        },
      },
    ]);
    expect(() =>
      doorParametersMatchTheSchema("set_department_status", written.argsFor("set_department_status")),
    ).not.toThrow();
  });

  it("retires a cost centre as a status change, with no delete and no archived_at", async () => {
    withDoorRows({ ...KITCHEN_ROW, status: "ARCHIVED" });

    const retired = await setDepartmentStatus({
      departmentId: DEPARTMENT,
      status: "ARCHIVED",
      reason: "Function closed; historic costs stay attributable.",
    });

    expect(retired).toEqual({ ...KITCHEN, status: "ARCHIVED" });
    expect(retired).not.toHaveProperty("archivedAt");
  });
});
