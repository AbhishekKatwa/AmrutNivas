/**
 * The revenue-point level, exercised against a stub transport.
 *
 * Two details make this file worth its length: `create_outlet` deliberately has no
 * organization parameter (§12/§15 — the door derives it from the property), so a
 * service that "helpfully" sent one must fail here rather than at PostgREST; and
 * `business_hours` is JSON whose own keys must survive the funnel untouched.
 */
import { afterEach, describe, expect, it } from "vitest";
import { setSupabaseClientForTests } from "@/db/client";
import type { Outlet } from "@/domain/identity/types";
import {
  createOutlet,
  getOutlet,
  listOutlets,
  setOutletStatus,
  updateOutlet,
} from "./outlet-service";
import {
  doorParametersMatchTheSchema,
  stubBackend,
  type BackendStub,
} from "@/test-helpers/transport";

const ORG = "a0000000-0000-4000-8000-000000000001";
const PROPERTY = "a1000000-0000-4000-8000-000000000007";
const OUTLET = "a2000000-0000-4000-8000-000000000003";
const ACTOR = "b0000000-0000-4000-8000-000000000009";

/** Keys inside `business_hours` are data, so they stay exactly as stored. */
const BUSINESS_HOURS = {
  "mon-sun": { open: "07:00", close: "23:30" },
  "happy-hour": { from: "17:00", to: "19:00" },
};

const OUTLET_ROW = {
  id: OUTLET,
  organization_id: ORG,
  property_id: PROPERTY,
  name: "Sea View Restaurant",
  code: "SVR",
  slug: "sea-view-restaurant",
  outlet_type: "RESTAURANT",
  status: "ACTIVE",
  business_hours: BUSINESS_HOURS,
  phone: "+91 22 4000 0002",
  email: null,
  version: 5,
  created_at: "2026-01-12T09:00:00Z",
  updated_at: "2026-03-04T09:00:00Z",
  archived_at: null,
  created_by: ACTOR,
};

const EXPECTED: Outlet = {
  id: OUTLET,
  organizationId: ORG,
  propertyId: PROPERTY,
  name: "Sea View Restaurant",
  code: "SVR",
  slug: "sea-view-restaurant",
  type: "RESTAURANT",
  status: "ACTIVE",
  businessHours: BUSINESS_HOURS,
  phone: "+91 22 4000 0002",
  email: null,
  version: 5,
  createdAt: "2026-01-12T09:00:00Z",
  updatedAt: "2026-03-04T09:00:00Z",
  archivedAt: null,
};

const REQUIRED_CREATE = {
  propertyId: PROPERTY,
  name: "Sea View Restaurant",
  code: "SVR",
  slug: "sea-view-restaurant",
  type: "RESTAURANT" as const,
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

describe("listOutlets", () => {
  it("scopes the read to both ancestors and hides archived outlets", async () => {
    const read = withReads({ outlets: [OUTLET_ROW] });

    const outlets = await listOutlets(SCOPE);

    expect(read.queries[0].table).toBe("outlets");
    expect(read.queries[0].steps).toContainEqual(["eq", ["organization_id", ORG]]);
    expect(read.queries[0].steps).toContainEqual(["eq", ["property_id", PROPERTY]]);
    expect(read.queries[0].steps).toContainEqual(["neq", ["status", "ARCHIVED"]]);
    expect(outlets).toEqual([EXPECTED]);
  });

  it("keeps a retired outlet out of the default list and back in on request", async () => {
    const defaultRead = withReads({ outlets: [] });
    await expect(listOutlets(SCOPE)).resolves.toEqual([]);
    expect(defaultRead.queries[0].steps).toContainEqual(["neq", ["status", "ARCHIVED"]]);

    const retired = { ...OUTLET_ROW, status: "ARCHIVED", archived_at: "2026-04-20T00:00:00Z" };
    const read = withReads({ outlets: [retired] });
    const outlets = await listOutlets(SCOPE, { includeArchived: true });

    expect(read.queries[0].steps.some(([, args]) => args.includes("status"))).toBe(false);
    expect(outlets).toHaveLength(1);
    expect(outlets[0]?.archivedAt).toBe("2026-04-20T00:00:00Z");
  });

  it("leaves the JSON column's own keys alone", async () => {
    withReads({ outlets: [OUTLET_ROW] });
    const [outlet] = await listOutlets(SCOPE);
    // `mon-sun` would become `monSun` if the funnel ever recursed into JSON values.
    expect(outlet?.businessHours).toEqual(BUSINESS_HOURS);
  });
});

describe("getOutlet", () => {
  it("filters on the id plus both ancestors", async () => {
    const read = withReads({ outlets: [OUTLET_ROW] });

    await expect(getOutlet(OUTLET, SCOPE)).resolves.toEqual(EXPECTED);

    expect(read.queries[0].steps).toContainEqual(["eq", ["id", OUTLET]]);
    expect(read.queries[0].steps).toContainEqual(["eq", ["property_id", PROPERTY]]);
    expect(read.queries[0].steps).toContainEqual(["limit", [1]]);
  });

  it("answers null when the outlet is not in this property", async () => {
    withReads({ outlets: [] });
    await expect(getOutlet(OUTLET, SCOPE)).resolves.toBeNull();
  });
});

describe("createOutlet", () => {
  it("sends exactly the parameters create_outlet declares", async () => {
    const written = withDoorRows(OUTLET_ROW);

    await createOutlet({
      ...REQUIRED_CREATE,
      businessHours: BUSINESS_HOURS,
      phone: EXPECTED.phone,
    });

    expect(written.calls).toEqual([
      {
        name: "create_outlet",
        args: {
          p_property: PROPERTY,
          p_name: REQUIRED_CREATE.name,
          p_code: REQUIRED_CREATE.code,
          p_slug: REQUIRED_CREATE.slug,
          p_outlet_type: "RESTAURANT",
          p_business_hours: BUSINESS_HOURS,
          p_phone: "+91 22 4000 0002",
        },
      },
    ]);
    expect(() =>
      doorParametersMatchTheSchema("create_outlet", written.argsFor("create_outlet")),
    ).not.toThrow();
  });

  it("sends no organization, because the door derives it from the property", async () => {
    const written = withDoorRows(OUTLET_ROW);
    await createOutlet(REQUIRED_CREATE);
    expect(written.argsFor("create_outlet")).not.toHaveProperty("p_organization");
    expect(written.argsFor("create_outlet")).not.toHaveProperty("p_business_hours");
  });

  it("sends an explicit null email while dropping an absent phone", async () => {
    const written = withDoorRows({ ...OUTLET_ROW, email: null });
    await createOutlet({ ...REQUIRED_CREATE, email: null });

    expect(written.argsFor("create_outlet")).toEqual({
      p_property: PROPERTY,
      p_name: REQUIRED_CREATE.name,
      p_code: REQUIRED_CREATE.code,
      p_slug: REQUIRED_CREATE.slug,
      p_outlet_type: "RESTAURANT",
      p_email: null,
    });
  });

  it("returns the written row as an outlet, not as a database record", async () => {
    withDoorRows(OUTLET_ROW);
    await expect(createOutlet(REQUIRED_CREATE)).resolves.toEqual(EXPECTED);
  });
});

describe("updateOutlet", () => {
  it("passes the row's version through as p_expected_version", async () => {
    const written = withDoorRows({ ...OUTLET_ROW, version: 6 });

    await updateOutlet({
      outletId: OUTLET,
      businessHours: BUSINESS_HOURS,
      expectedVersion: 5,
    });

    expect(written.argsFor("update_outlet")).toEqual({
      p_outlet: OUTLET,
      p_business_hours: BUSINESS_HOURS,
      p_expected_version: 5,
    });
    expect(() =>
      doorParametersMatchTheSchema("update_outlet", written.argsFor("update_outlet")),
    ).not.toThrow();
  });

  it("sends no version key when the caller holds none", async () => {
    const written = withDoorRows(OUTLET_ROW);
    await updateOutlet({ outletId: OUTLET, name: "Sea View All-Day Dining" });

    const sent = written.argsFor("update_outlet");
    expect(sent).not.toHaveProperty("p_expected_version");
    expect(sent).toEqual({ p_outlet: OUTLET, p_name: "Sea View All-Day Dining" });
  });

  it("clears a contact detail with \"\" and leaves an absent field untouched", async () => {
    // `app.blankable` in 005 reads NULL as "not edited", so a cleared phone must
    // travel as an empty string — sending `null` would silently keep the old number.
    const written = withDoorRows(OUTLET_ROW);
    await updateOutlet({ outletId: OUTLET, phone: "", email: undefined });

    const sent = written.argsFor("update_outlet");
    expect(sent).toEqual({ p_outlet: OUTLET, p_phone: "" });
    expect(sent).not.toHaveProperty("p_email");
    expect(() => doorParametersMatchTheSchema("update_outlet", sent)).not.toThrow();
  });

  it("sends a filled field as its value", async () => {
    const written = withDoorRows(OUTLET_ROW);
    await updateOutlet({ outletId: OUTLET, email: "svr@amrut.example" });
    expect(written.argsFor("update_outlet")).toEqual({
      p_outlet: OUTLET,
      p_email: "svr@amrut.example",
    });
  });
});

describe("setOutletStatus", () => {
  it("sends the target, the status and the operator's reason", async () => {
    const written = withDoorRows({ ...OUTLET_ROW, status: "INACTIVE" });

    await setOutletStatus({
      outletId: OUTLET,
      status: "INACTIVE",
      reason: "Kitchen refurbishment.",
    });

    expect(written.calls).toEqual([
      {
        name: "set_outlet_status",
        args: { p_outlet: OUTLET, p_status: "INACTIVE", p_reason: "Kitchen refurbishment." },
      },
    ]);
    expect(() =>
      doorParametersMatchTheSchema("set_outlet_status", written.argsFor("set_outlet_status")),
    ).not.toThrow();
  });

  it("retires an outlet by status, with archived_at written by the door", async () => {
    withDoorRows({ ...OUTLET_ROW, status: "ARCHIVED", archived_at: "2026-07-01T00:00:00Z" });

    const retired = await setOutletStatus({
      outletId: OUTLET,
      status: "ARCHIVED",
      reason: "Outlet closed for good; history retained.",
    });

    expect(retired).toEqual({
      ...EXPECTED,
      status: "ARCHIVED",
      archivedAt: "2026-07-01T00:00:00Z",
    });
  });
});
