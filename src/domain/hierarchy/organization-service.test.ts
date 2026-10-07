/**
 * The tenant level, exercised against a stub transport.
 *
 * What these prove before any screen exists: the door gets exactly the parameter
 * names 005 declares (§82's version check included), a read filters on `status` so a
 * retired tenant is hidden by default yet still reachable, and a row — from a SELECT
 * or from a write door — arrives as the domain type with `created_by` left behind.
 */
import { afterEach, describe, expect, it } from "vitest";
import { setSupabaseClientForTests } from "@/db/client";
import type { Organization } from "@/domain/identity/types";
import {
  createOrganization,
  getOrganization,
  listOrganizations,
  setOrganizationStatus,
  updateOrganization,
} from "./organization-service";
import {
  doorParametersMatchTheSchema,
  stubBackend,
  type BackendStub,
} from "@/test-helpers/transport";

const ORG = "a0000000-0000-4000-8000-000000000001";
const ACTOR = "b0000000-0000-4000-8000-000000000009";

/** A row exactly as `organizations` stores it, audit column included. */
const ORG_ROW = {
  id: ORG,
  name: "Amrut Hospitality",
  legal_name: "Amrut Hospitality Private Limited",
  display_name: "Amrut",
  code: "AMR",
  slug: "amrut-hospitality",
  business_types: ["HOTEL", "RESTAURANT"],
  status: "ACTIVE",
  country: "IN",
  currency: "INR",
  timezone: "Asia/Kolkata",
  locale: "en-IN",
  tax_region: "GST-MH",
  phone: "+91 22 4000 0000",
  email: "group@amrut.example",
  website: "https://amrut.example",
  logo_url: null,
  is_demo: false,
  version: 3,
  created_at: "2026-01-04T09:00:00Z",
  updated_at: "2026-02-11T10:30:00Z",
  archived_at: null,
  created_by: ACTOR,
};

const EXPECTED: Organization = {
  id: ORG,
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
  taxRegion: "GST-MH",
  phone: "+91 22 4000 0000",
  email: "group@amrut.example",
  website: "https://amrut.example",
  logoUrl: null,
  isDemo: false,
  version: 3,
  createdAt: "2026-01-04T09:00:00Z",
  updatedAt: "2026-02-11T10:30:00Z",
  archivedAt: null,
};

const MINIMAL_CREATE = {
  name: "Nivaas Estates",
  code: "NIV",
  slug: "nivaas-estates",
  country: "IN",
  currency: "INR",
  timezone: "Asia/Kolkata",
  locale: "en-IN",
};

function withReads(rows: Record<string, unknown[]>): BackendStub {
  const stub = stubBackend({ reads: (query) => rows[query.table] });
  setSupabaseClientForTests(stub.client);
  return stub;
}

function withDoorRows(row: Record<string, unknown>): BackendStub {
  const stub = stubBackend({ doors: () => ({ data: row }) });
  setSupabaseClientForTests(stub.client);
  return stub;
}

// Every test installs its own stub below, so no test can inherit another's transport.
afterEach(() => setSupabaseClientForTests(undefined));

describe("listOrganizations", () => {
  it("hides an archived tenant by default and maps what comes back", async () => {
    const read = withReads({ organizations: [ORG_ROW] });

    const organizations = await listOrganizations();

    expect(read.queries[0].table).toBe("organizations");
    expect(read.queries[0].steps).toContainEqual(["neq", ["status", "ARCHIVED"]]);
    // A read lists only what the policy returns; the mapping is the service's job.
    expect(organizations).toEqual([EXPECTED]);
  });

  it("keeps the status filter out when archived rows are asked for", async () => {
    const retired = { ...ORG_ROW, status: "ARCHIVED", archived_at: "2026-03-01T00:00:00Z" };
    const read = withReads({ organizations: [retired] });

    const organizations = await listOrganizations({ includeArchived: true });

    expect(read.queries[0].steps.some(([, args]) => args.includes("status"))).toBe(false);
    expect(organizations).toHaveLength(1);
    expect(organizations[0]?.archivedAt).toBe("2026-03-01T00:00:00Z");
  });

  it("selects flat columns only, because the camel mapper is top-level", async () => {
    // An embedded `x(*)` would arrive half-converted and the service would never see it.
    const read = withReads({ organizations: [] });
    await expect(listOrganizations()).resolves.toEqual([]);
    expect(read.queries[0].columns).toContain("is_demo");
    expect(read.queries[0].columns).not.toMatch(/[()]/);
  });
});

describe("getOrganization", () => {
  it("filters on the id and excludes archived rows unless opted in", async () => {
    const read = withReads({ organizations: [ORG_ROW] });
    await expect(getOrganization(ORG)).resolves.toEqual(EXPECTED);
    expect(read.queries[0].steps).toContainEqual(["eq", ["id", ORG]]);
    expect(read.queries[0].steps).toContainEqual(["neq", ["status", "ARCHIVED"]]);

    const opted = withReads({ organizations: [ORG_ROW] });
    await expect(getOrganization(ORG, { includeArchived: true })).resolves.toEqual(EXPECTED);
    expect(opted.queries[0].steps).not.toContainEqual(["neq", ["status", "ARCHIVED"]]);
  });

  it("answers null when the policy gives nothing, instead of inventing a tenant", async () => {
    withReads({ organizations: [] });
    await expect(getOrganization(ORG)).resolves.toBeNull();
  });
});

describe("createOrganization", () => {
  it("sends exactly the parameters create_organization declares", async () => {
    const written = withDoorRows(ORG_ROW);

    await createOrganization({
      ...MINIMAL_CREATE,
      businessTypes: ["HOTEL", "RESTAURANT"],
      legalName: "Amrut Hospitality Private Limited",
      taxRegion: "GST-MH",
      phone: "+91 22 4000 0000",
      email: "group@amrut.example",
      isDemo: false,
    });

    expect(written.calls).toEqual([
      {
        name: "create_organization",
        args: {
          p_name: MINIMAL_CREATE.name,
          p_code: MINIMAL_CREATE.code,
          p_slug: MINIMAL_CREATE.slug,
          p_country: MINIMAL_CREATE.country,
          p_currency: MINIMAL_CREATE.currency,
          p_timezone: MINIMAL_CREATE.timezone,
          p_locale: MINIMAL_CREATE.locale,
          p_business_types: ["HOTEL", "RESTAURANT"],
          p_legal_name: "Amrut Hospitality Private Limited",
          p_tax_region: "GST-MH",
          p_phone: "+91 22 4000 0000",
          p_email: "group@amrut.example",
          p_is_demo: false,
        },
      },
    ]);
    expect(() =>
      doorParametersMatchTheSchema("create_organization", written.argsFor("create_organization")),
    ).not.toThrow();
  });

  it("returns the written row as a tenant, not as a database record", async () => {
    withDoorRows(ORG_ROW);
    await expect(createOrganization(MINIMAL_CREATE)).resolves.toEqual(EXPECTED);
  });

  it("drops an omitted optional and sends an explicit null", async () => {
    // `undefined` lets the door's own default apply; `null` is the caller's answer.
    const blank = withDoorRows(ORG_ROW);
    await createOrganization({ ...MINIMAL_CREATE, taxRegion: null });
    expect(blank.argsFor("create_organization")).toEqual({
      p_name: MINIMAL_CREATE.name,
      p_code: MINIMAL_CREATE.code,
      p_slug: MINIMAL_CREATE.slug,
      p_country: MINIMAL_CREATE.country,
      p_currency: MINIMAL_CREATE.currency,
      p_timezone: MINIMAL_CREATE.timezone,
      p_locale: MINIMAL_CREATE.locale,
      p_tax_region: null,
    });
  });
});

describe("updateOrganization", () => {
  it("passes the row's version through as p_expected_version", async () => {
    const written = withDoorRows({ ...ORG_ROW, version: 4 });

    await updateOrganization({
      organizationId: ORG,
      displayName: "Amrut Group",
      expectedVersion: 3,
    });

    expect(written.argsFor("update_organization")).toEqual({
      p_organization: ORG,
      p_display_name: "Amrut Group",
      p_expected_version: 3,
    });
    expect(() =>
      doorParametersMatchTheSchema("update_organization", written.argsFor("update_organization")),
    ).not.toThrow();
  });

  it("sends no version key when the caller holds none", async () => {
    const written = withDoorRows(ORG_ROW);
    await updateOrganization({ organizationId: ORG, name: "Renamed Group" });
    expect(written.argsFor("update_organization")).not.toHaveProperty("p_expected_version");
  });

  it("sends an omitted field as no key, a cleared one as \"\", a filled one as its value", async () => {
    // `app.blankable` in 005: NULL means "not edited" and an empty string means the
    // operator cleared the column — so a clear must travel as `""`, never as `null`,
    // and an untouched field must not appear on the wire at all.
    const written = withDoorRows(ORG_ROW);
    await updateOrganization({
      organizationId: ORG,
      legalName: "",
      taxRegion: "GST-KA",
      website: undefined,
    });

    const sent = written.argsFor("update_organization");
    expect(sent).toEqual({
      p_organization: ORG,
      p_legal_name: "",
      p_tax_region: "GST-KA",
    });
    expect(sent).not.toHaveProperty("p_website");
    expect(sent.p_legal_name).toBe("");
    expect(() =>
      doorParametersMatchTheSchema("update_organization", sent),
    ).not.toThrow();
  });
});

describe("setOrganizationStatus", () => {
  it("sends the target, the status and the operator's reason", async () => {
    const written = withDoorRows({ ...ORG_ROW, status: "SUSPENDED" });

    await setOrganizationStatus({
      organizationId: ORG,
      status: "SUSPENDED",
      reason: "Payment relationship suspended by the platform team.",
    });

    expect(written.calls).toEqual([
      {
        name: "set_organization_status",
        args: {
          p_organization: ORG,
          p_status: "SUSPENDED",
          p_reason: "Payment relationship suspended by the platform team.",
        },
      },
    ]);
    expect(() =>
      doorParametersMatchTheSchema(
        "set_organization_status",
        written.argsFor("set_organization_status"),
      ),
    ).not.toThrow();
  });

  it("retires a tenant by status, and the row comes back with archived_at set", async () => {
    withDoorRows({ ...ORG_ROW, status: "ARCHIVED", archived_at: "2026-04-01T00:00:00Z" });
    const retired = await setOrganizationStatus({
      organizationId: ORG,
      status: "ARCHIVED",
      reason: "Group wound up; records retained.",
    });
    expect(retired).toEqual({
      ...EXPECTED,
      status: "ARCHIVED",
      archivedAt: "2026-04-01T00:00:00Z",
    });
  });
});
