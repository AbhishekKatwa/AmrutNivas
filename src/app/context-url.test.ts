/**
 * The address-bar half of the context (§30), as pure functions.
 *
 * The syncing hook that uses these needs a live router and store, so what is proven
 * here is the parsing and writing — the parts that decide whether a stale link clears a
 * tenant, narrows it, or is ignored. The round-trip and idempotence assertions are the
 * loop guarantee: if writing the context into a URL produced a URL that parsed back to
 * something different, the sync effect would ask the server again forever.
 */
import { describe, expect, it } from "vitest";
import {
  contextFromSearch,
  sameContext,
  writeContextToSearch,
  ORGANIZATION_PARAM,
  OUTLET_PARAM,
  PROPERTY_PARAM,
} from "./context-url";

const ORG = "a0000000-0000-4000-8000-00000000000a";
const PROPERTY = "b1111111-0000-4000-8000-00000000000b";
const OUTLET = "c2222222-0000-4000-8000-00000000000c";

const ALL = { organizationId: ORG, propertyId: PROPERTY, outletId: OUTLET };

function levels(search: string): Record<string, string | null> {
  const params = new URLSearchParams(search);
  return {
    [ORGANIZATION_PARAM]: params.get(ORGANIZATION_PARAM),
    [PROPERTY_PARAM]: params.get(PROPERTY_PARAM),
    [OUTLET_PARAM]: params.get(OUTLET_PARAM),
  };
}

describe("reading a context out of a link", () => {
  it("takes all three levels from a shared link", () => {
    expect(contextFromSearch(`?${ORGANIZATION_PARAM}=${ORG}&${PROPERTY_PARAM}=${PROPERTY}&${OUTLET_PARAM}=${OUTLET}`)).toEqual(
      ALL,
    );
  });

  it("treats a link to one level as a request for nothing below it", () => {
    expect(contextFromSearch(`?${ORGANIZATION_PARAM}=${ORG}`)).toEqual({
      organizationId: ORG,
      propertyId: null,
      outletId: null,
    });
  });

  it("ignores a query that names no tenant at all", () => {
    // The screen's own filters live in the same string; reading them as an empty
    // context would sign the person out of their tenant on every tab change.
    expect(contextFromSearch("?tab=ledger&page=2")).toBeNull();
    expect(contextFromSearch("")).toBeNull();
  });

  it("refuses an id that is not a uuid", () => {
    expect(contextFromSearch(`?${PROPERTY_PARAM}=1&${ORGANIZATION_PARAM}=../etc`)).toBeNull();
    expect(contextFromSearch(`?${ORGANIZATION_PARAM}=${ORG}&${PROPERTY_PARAM}=nope`)).toEqual({
      organizationId: ORG,
      propertyId: null,
      outletId: null,
    });
  });
});

describe("writing a context into a link", () => {
  it("leaves unrelated parameters alone", () => {
    const search = writeContextToSearch(`tab=ledger&${ORGANIZATION_PARAM}=stale`, ALL);
    const params = new URLSearchParams(search);
    expect(params.get("tab")).toBe("ledger");
    expect(params.get(PROPERTY_PARAM)).toBe(PROPERTY);
    expect(params.get(ORGANIZATION_PARAM)).toBe(ORG);
  });

  it("drops the parameters of levels that are not selected", () => {
    const search = writeContextToSearch(
      `${ORGANIZATION_PARAM}=${ORG}&${PROPERTY_PARAM}=${PROPERTY}&${OUTLET_PARAM}=${OUTLET}`,
      { organizationId: ORG, propertyId: null, outletId: null },
    );
    expect(search).toBe(`${ORGANIZATION_PARAM}=${ORG}`);
  });

  it("publishes nothing when no context is selected", () => {
    expect(writeContextToSearch("tab=ledger", { organizationId: null, propertyId: null, outletId: null })).toBe(
      "tab=ledger",
    );
  });

  it("is idempotent, which is what stops the sync loop", () => {
    const once = writeContextToSearch("", ALL);
    expect(writeContextToSearch(once, ALL)).toBe(once);
    expect(once.split("&")).toHaveLength(3);
  });

  it("reads back exactly what it wrote", () => {
    expect(contextFromSearch(writeContextToSearch("", ALL))).toEqual(ALL);
    const narrowed = { organizationId: ORG, propertyId: null, outletId: null };
    expect(contextFromSearch(writeContextToSearch("", narrowed))).toEqual(narrowed);
  });
});

describe("comparing a link with the server's answer", () => {
  it("calls an identical context identical", () => {
    // The positive case: without it, a comparison that always returned false would
    // re-ask the door on every render and the test above would still pass.
    expect(sameContext(ALL, ALL)).toBe(true);
  });

  it("sees a missing level as a difference", () => {
    expect(sameContext(ALL, { organizationId: ORG, propertyId: null, outletId: null })).toBe(false);
  });

  it("reads an absent level in the link as null, not as a difference", () => {
    expect(
      sameContext({ organizationId: ORG }, { organizationId: ORG, propertyId: null, outletId: null }),
    ).toBe(true);
  });
});

it("keeps the parameter names a shared link depends on", () => {
  // Spelling, but load-bearing: these strings are the public shape of a URL someone
  // pastes into WhatsApp, so a rename silently breaks every link already sent.
  expect(levels(`?${ORGANIZATION_PARAM}=x`)[ORGANIZATION_PARAM]).toBe("x");
  expect([ORGANIZATION_PARAM, PROPERTY_PARAM, OUTLET_PARAM]).toEqual([
    "organization",
    "property",
    "outlet",
  ]);
});
