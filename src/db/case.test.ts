/**
 * The mapping layer that decides whether a door call sends the parameters the
 * function actually declares, and whether a row arrives shaped like the domain.
 */
import { describe, expect, it } from "vitest";
import { camelKey, toCamelCase, toCamelRow, toCamelRows, toDoorArgs } from "./case";

describe("camelKey", () => {
  it("converts a database column", () => {
    expect(camelKey("organization_id")).toBe("organizationId");
    expect(camelKey("business_day_start")).toBe("businessDayStart");
    expect(camelKey("id")).toBe("id");
  });

  it("strips a door parameter prefix", () => {
    expect(camelKey("p_expected_version")).toBe("expectedVersion");
    expect(camelKey("p_property_ids")).toBe("propertyIds");
  });
});

describe("toCamelCase", () => {
  it("maps a hierarchy row", () => {
    expect(
      toCamelCase<{ organizationId: string; outletType: string; archivedAt: string | null }>({
        organization_id: "a1",
        outlet_type: "BAR",
        archived_at: null,
      }),
    ).toEqual({ organizationId: "a1", outletType: "BAR", archivedAt: null });
  });

  it("leaves the keys inside a JSON column alone", () => {
    // business_hours is data, not schema: 'mon-sun' and a meal-part name are chosen
    // by the person editing the outlet, and rewriting them would corrupt the value.
    const row = toCamelCase<{
      businessHours: Record<string, unknown>;
      outletType: string;
    }>({
      business_hours: { "mon-sun": { open: "07:00", close: "23:00" } },
      outlet_type: "RESTAURANT",
    });
    expect(row.outletType).toBe("RESTAURANT");
    expect(Object.keys(row.businessHours)).toEqual(["mon-sun"]);
  });

  it("maps rows and accepts an empty result", () => {
    expect(toCamelRows<{ propertyName: string }>([{ property_name: "Deccan" }])).toEqual([
      { propertyName: "Deccan" },
    ]);
    expect(toCamelRows<object>([])).toEqual([]);
  });

  it("treats a SQL null door result as no row", () => {
    expect(toCamelRow<object>(null)).toBeNull();
  });
});

describe("toDoorArgs", () => {
  it("produces the p_ names PostgREST binds to", () => {
    expect(
      toDoorArgs({
        organization: "a1",
        propertyType: "HOSTEL",
        expectedVersion: 3,
        businessTypes: ["HOTEL"],
      }),
    ).toEqual({
      p_organization: "a1",
      p_property_type: "HOSTEL",
      p_expected_version: 3,
      p_business_types: ["HOTEL"],
    });
  });

  it("omits an absent field so the door default applies, and keeps an explicit null", () => {
    // `undefined` = "the caller has no opinion". `null` = "write NULL", which some
    // doors take as clearing a column, so the two must not collapse into each other.
    expect(toDoorArgs({ phone: undefined, email: null })).toEqual({ p_email: null });
  });

  it("keeps arrays and booleans as values, not strings", () => {
    expect(toDoorArgs({ propertyIds: ["p1", "p2"], isDemo: true })).toEqual({
      p_property_ids: ["p1", "p2"],
      p_is_demo: true,
    });
  });
});
