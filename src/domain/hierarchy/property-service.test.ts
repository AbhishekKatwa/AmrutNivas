/**
 * The site level, exercised against a stub transport.
 *
 * Beyond the parameter names, the two things worth failing a build over: every read
 * says which organization it belongs to, and the `property_type` column becomes the
 * domain's `type` — a rename the camel funnel cannot do on its own.
 */
import { afterEach, describe, expect, it } from "vitest";
import { setSupabaseClientForTests } from "@/db/client";
import type { Property } from "@/domain/identity/types";
import {
  createProperty,
  getProperty,
  listProperties,
  setPropertyStatus,
  updateProperty,
} from "./property-service";
import {
  doorParametersMatchTheSchema,
  stubBackend,
  type BackendStub,
} from "@/test-helpers/transport";

const ORG = "a0000000-0000-4000-8000-000000000001";
const PROPERTY = "a1000000-0000-4000-8000-000000000007";
const ACTOR = "b0000000-0000-4000-8000-000000000009";

const PROPERTY_ROW = {
  id: PROPERTY,
  organization_id: ORG,
  name: "Amrut Nivaas Alibaug",
  display_name: "Nivaas Alibaug",
  code: "ALB",
  slug: "amrut-nivaas-alibaug",
  property_type: "RESORT",
  status: "ACTIVE",
  address_line1: "Rewatdan Road",
  address_line2: null,
  city: "Alibaug",
  state: "Maharashtra",
  postal_code: "402201",
  country: "IN",
  phone: "+91 22 4000 0001",
  email: "alibaug@amrut.example",
  timezone: "Asia/Kolkata",
  currency: "INR",
  locale: "en-IN",
  business_day_start: "03:00",
  tax_profile_id: null,
  version: 2,
  created_at: "2026-01-10T09:00:00Z",
  updated_at: "2026-02-02T09:00:00Z",
  archived_at: null,
  created_by: ACTOR,
};

const EXPECTED: Property = {
  id: PROPERTY,
  organizationId: ORG,
  name: "Amrut Nivaas Alibaug",
  displayName: "Nivaas Alibaug",
  code: "ALB",
  slug: "amrut-nivaas-alibaug",
  type: "RESORT",
  status: "ACTIVE",
  addressLine1: "Rewatdan Road",
  addressLine2: null,
  city: "Alibaug",
  state: "Maharashtra",
  postalCode: "402201",
  country: "IN",
  phone: "+91 22 4000 0001",
  email: "alibaug@amrut.example",
  timezone: "Asia/Kolkata",
  currency: "INR",
  locale: "en-IN",
  businessDayStart: "03:00",
  taxProfileId: null,
  version: 2,
  createdAt: "2026-01-10T09:00:00Z",
  updatedAt: "2026-02-02T09:00:00Z",
  archivedAt: null,
};

const REQUIRED_CREATE = {
  organizationId: ORG,
  name: "Amrut Nivaas Alibaug",
  code: "ALB",
  slug: "amrut-nivaas-alibaug",
  type: "RESORT" as const,
  country: "IN",
  currency: "INR",
  timezone: "Asia/Kolkata",
  locale: "en-IN",
};

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

describe("listProperties", () => {
  it("scopes the read to the organization the caller holds and hides archived sites", async () => {
    const read = withReads({ properties: [PROPERTY_ROW] });

    const properties = await listProperties({ organizationId: ORG });

    expect(read.queries[0].table).toBe("properties");
    expect(read.queries[0].steps).toContainEqual(["eq", ["organization_id", ORG]]);
    expect(read.queries[0].steps).toContainEqual(["neq", ["status", "ARCHIVED"]]);
    expect(properties).toEqual([EXPECTED]);
  });

  it("re-admits an archived site when asked, without touching the scope", async () => {
    const retired = { ...PROPERTY_ROW, status: "ARCHIVED", archived_at: "2026-05-01T00:00:00Z" };
    const read = withReads({ properties: [retired] });

    const properties = await listProperties({ organizationId: ORG }, { includeArchived: true });

    expect(read.queries[0].steps).toContainEqual(["eq", ["organization_id", ORG]]);
    expect(read.queries[0].steps.some(([, args]) => args.includes("ARCHIVED"))).toBe(false);
    expect(properties[0]?.archivedAt).toBe("2026-05-01T00:00:00Z");
  });

  it("answers an empty policy result with an empty list", async () => {
    withReads({ properties: [] });
    await expect(listProperties({ organizationId: ORG })).resolves.toEqual([]);
  });
});

describe("getProperty", () => {
  it("filters on both the id and the tenant, and maps property_type to type", async () => {
    const read = withReads({ properties: [PROPERTY_ROW] });

    await expect(getProperty(PROPERTY, { organizationId: ORG })).resolves.toEqual(EXPECTED);

    expect(read.queries[0].steps).toContainEqual(["eq", ["id", PROPERTY]]);
    expect(read.queries[0].steps).toContainEqual(["eq", ["organization_id", ORG]]);
    expect(read.queries[0].steps).toContainEqual(["limit", [1]]);
  });

  it("returns null for a site the policy did not allow", async () => {
    withReads({ properties: [] });
    await expect(getProperty(PROPERTY, { organizationId: ORG })).resolves.toBeNull();
  });
});

describe("createProperty", () => {
  it("sends exactly the parameters create_property declares", async () => {
    const written = withDoorRows(PROPERTY_ROW);

    await createProperty({
      ...REQUIRED_CREATE,
      businessDayStart: "03:00",
      addressLine1: "Rewatdan Road",
      addressLine2: null,
      city: "Alibaug",
      state: "Maharashtra",
      postalCode: "402201",
      phone: "+91 22 4000 0001",
      email: "alibaug@amrut.example",
    });

    expect(written.calls).toEqual([
      {
        name: "create_property",
        args: {
          p_organization: ORG,
          p_name: REQUIRED_CREATE.name,
          p_code: REQUIRED_CREATE.code,
          p_slug: REQUIRED_CREATE.slug,
          p_property_type: "RESORT",
          p_country: "IN",
          p_currency: "INR",
          p_timezone: "Asia/Kolkata",
          p_locale: "en-IN",
          p_business_day_start: "03:00",
          p_address_line1: "Rewatdan Road",
          p_address_line2: null,
          p_city: "Alibaug",
          p_state: "Maharashtra",
          p_postal_code: "402201",
          p_phone: "+91 22 4000 0001",
          p_email: "alibaug@amrut.example",
        },
      },
    ]);
    expect(() =>
      doorParametersMatchTheSchema("create_property", written.argsFor("create_property")),
    ).not.toThrow();
  });

  it("leaves an omitted optional out so the door's default applies", async () => {
    // `business_day_start` defaults to 04:00 in SQL; sending null instead would break
    // the NOT NULL column, so an absent field must stay absent on the wire.
    const written = withDoorRows(PROPERTY_ROW);
    await createProperty(REQUIRED_CREATE);

    const sent = written.argsFor("create_property");
    expect(sent).not.toHaveProperty("p_business_day_start");
    expect(sent).not.toHaveProperty("p_city");
    expect(sent).not.toHaveProperty("p_display_name");
    expect(() => doorParametersMatchTheSchema("create_property", sent)).not.toThrow();
  });

  it("sends an explicit null the caller asked for", async () => {
    const written = withDoorRows({ ...PROPERTY_ROW, city: null });
    await createProperty({ ...REQUIRED_CREATE, city: null });

    const sent = written.argsFor("create_property");
    expect(sent).toEqual(expect.objectContaining({ p_city: null }));
    expect(Object.keys(sent)).toHaveLength(10);
  });

  it("returns the written row as a site, not as a database record", async () => {
    withDoorRows(PROPERTY_ROW);
    await expect(createProperty(REQUIRED_CREATE)).resolves.toEqual(EXPECTED);
  });
});

describe("updateProperty", () => {
  it("passes the row's version through as p_expected_version", async () => {
    const written = withDoorRows({ ...PROPERTY_ROW, version: 3 });

    await updateProperty({
      propertyId: PROPERTY,
      name: "Amrut Nivaas Alibaug Resort",
      businessDayStart: "02:30",
      expectedVersion: 2,
    });

    expect(written.argsFor("update_property")).toEqual({
      p_property: PROPERTY,
      p_name: "Amrut Nivaas Alibaug Resort",
      p_business_day_start: "02:30",
      p_expected_version: 2,
    });
    expect(() =>
      doorParametersMatchTheSchema("update_property", written.argsFor("update_property")),
    ).not.toThrow();
  });

  it("sends no version key when the caller holds none", async () => {
    const written = withDoorRows(PROPERTY_ROW);
    await updateProperty({ propertyId: PROPERTY, city: "Alibaug" });
    expect(written.argsFor("update_property")).not.toHaveProperty("p_expected_version");
  });

  it("cannot be coaxed into changing the immutable type", async () => {
    // The update door declares no `p_property_type`; a service that invented one would
    // fail at PostgREST, not at compile time — so this is where that is caught.
    const written = withDoorRows(PROPERTY_ROW);
    await updateProperty({ propertyId: PROPERTY, displayName: "Nivaas", phone: "" });

    const sent = written.argsFor("update_property");
    expect(sent).not.toHaveProperty("p_property_type");
    expect(sent).toEqual({
      p_property: PROPERTY,
      p_display_name: "Nivaas",
      p_phone: "",
    });
  });

  it("sends an omitted field as no key, a cleared one as \"\", a filled one as its value", async () => {
    // `app.blankable` in 005: NULL means "not edited" and an empty string is the
    // operator clearing the column, so a clear must travel as `""`, never as `null`.
    const written = withDoorRows(PROPERTY_ROW);
    await updateProperty({
      propertyId: PROPERTY,
      addressLine2: "",
      city: "Alibaug",
      postalCode: undefined,
    });

    const sent = written.argsFor("update_property");
    expect(sent).toEqual({ p_property: PROPERTY, p_address_line2: "", p_city: "Alibaug" });
    expect(sent).not.toHaveProperty("p_postal_code");
    expect(sent.p_address_line2).toBe("");
    expect(() => doorParametersMatchTheSchema("update_property", sent)).not.toThrow();
  });
});

describe("setPropertyStatus", () => {
  it("sends the target, the status and the operator's reason", async () => {
    const written = withDoorRows({ ...PROPERTY_ROW, status: "INACTIVE" });

    await setPropertyStatus({
      propertyId: PROPERTY,
      status: "INACTIVE",
      reason: "Renovation across the monsoon; bookings closed.",
    });

    expect(written.calls).toEqual([
      {
        name: "set_property_status",
        args: {
          p_property: PROPERTY,
          p_status: "INACTIVE",
          p_reason: "Renovation across the monsoon; bookings closed.",
        },
      },
    ]);
    expect(() =>
      doorParametersMatchTheSchema("set_property_status", written.argsFor("set_property_status")),
    ).not.toThrow();
  });

  it("retires a site by status and reports the stamp the door wrote", async () => {
    withDoorRows({ ...PROPERTY_ROW, status: "ARCHIVED", archived_at: "2026-06-01T00:00:00Z" });

    const retired = await setPropertyStatus({
      propertyId: PROPERTY,
      status: "ARCHIVED",
      reason: "Lease ended.",
    });

    expect(retired).toEqual({ ...EXPECTED, status: "ARCHIVED", archivedAt: "2026-06-01T00:00:00Z" });
  });
});
