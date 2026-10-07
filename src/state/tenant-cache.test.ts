/**
 * The tenant cache, exercised directly.
 *
 * These tests exist to fail loudly on the one thing this layer is for: a read that could
 * serve Organization A's rows to Organization B. The isolation guarantee is asserted two
 * ways — the active-scope gate (a cross-tenant read misses even without invalidation), and
 * physical eviction (invalidateScope actually removes the memory, checked through `peek`,
 * which bypasses the gate). The generation race is asserted on the exact bad ordering, not
 * just the happy path.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  activateScope,
  beginFetch,
  clearAll,
  commitFetch,
  invalidateScope,
  peek,
  read,
  resetForTests,
  scopeFor,
  size,
  TENANT_CACHE_MAX_ENTRIES,
  write,
} from "./tenant-cache";

const ORG_A = "a0000000-0000-4000-8000-00000000000a";
const ORG_B = "a0000000-0000-4000-8000-00000000000b";
const PROPERTY = "b0000000-0000-4000-8000-000000000001";

const scopeA = scopeFor({ organizationId: ORG_A, propertyId: null, outletId: null });
const scopeB = scopeFor({ organizationId: ORG_B, propertyId: PROPERTY, outletId: null });

beforeEach(() => resetForTests());

describe("scopeFor", () => {
  it("is stable for an identical context and distinct across tenants", () => {
    expect(scopeFor({ organizationId: ORG_A, propertyId: null, outletId: null })).toBe(scopeA);
    expect(scopeA).not.toBe(scopeB);
  });

  it("makes a shallower scope a prefix of the deeper one", () => {
    const orgOnly = scopeFor({ organizationId: ORG_A, propertyId: null, outletId: null });
    const withProperty = scopeFor({ organizationId: ORG_A, propertyId: PROPERTY, outletId: null });
    expect(withProperty.startsWith(orgOnly)).toBe(true);
  });
});

describe("cross-tenant isolation", () => {
  it("hides a write made under scope A once scope B is active", () => {
    activateScope(scopeA);
    write(scopeA, "properties", [{ id: PROPERTY, name: "A's hotel" }]);
    expect(read(scopeA, "properties")).toHaveLength(1);

    activateScope(scopeB);
    // The whole point: asking for A's rows while B is active is a miss, never a hit,
    // even though A's entry has not been invalidated yet.
    expect(read(scopeA, "properties")).toBeUndefined();
    // And B has no entry of its own, so it is not served A's data either.
    expect(read(scopeB, "properties")).toBeUndefined();
  });

  it("invalidateScope on the A prefix leaves B untouched", () => {
    activateScope(scopeA);
    write(scopeA, "properties", ["a-row"]);
    activateScope(scopeB);
    write(scopeB, "properties", ["b-row"]);

    invalidateScope(scopeA);

    expect(peek(scopeA, "properties")).toBeUndefined();
    expect(read(scopeB, "properties")).toEqual(["b-row"]);
  });
});

describe("generation race", () => {
  it("refuses a stale fetch commit while a fresh one lands", () => {
    activateScope(scopeA);
    // A slow request began under A's generation and is still in flight across the switch.
    const stale = beginFetch(scopeA, "properties");

    activateScope(scopeB);
    const fresh = beginFetch(scopeB, "properties");

    // The stale response arrives: it must NOT overwrite the (now different) tenant's cache.
    expect(commitFetch(stale, ["leaked-across-tenant"])).toBe(false);
    expect(peek(scopeA, "properties")).toBeUndefined();

    // The fresh one commits normally.
    expect(commitFetch(fresh, ["b-rows"])).toBe(true);
    expect(read(scopeB, "properties")).toEqual(["b-rows"]);
  });

  it("honours a commit when no switch happened in between", () => {
    activateScope(scopeA);
    const token = beginFetch(scopeA, "outlets");
    expect(commitFetch(token, ["a-outlet"])).toBe(true);
    expect(read(scopeA, "outlets")).toEqual(["a-outlet"]);
  });
});

describe("bounded storage", () => {
  it("clearAll empties everything and forgets the active scope", () => {
    activateScope(scopeA);
    write(scopeA, "a", 1);
    write(scopeA, "b", 2);
    expect(size()).toBe(2);
    clearAll();
    expect(size()).toBe(0);
    // active scope was reset too, so even a read for the old scope misses.
    expect(read(scopeA, "a")).toBeUndefined();
  });

  it("evicts the oldest entry once the cap is exceeded", () => {
    activateScope(scopeA);
    // Fill to the cap with distinct keys, oldest first.
    for (let i = 0; i < TENANT_CACHE_MAX_ENTRIES; i += 1) {
      write(scopeA, `key-${i}`, i);
    }
    expect(size()).toBe(TENANT_CACHE_MAX_ENTRIES);

    // One past the cap: the FIFO order means `key-0` (the oldest) is evicted.
    write(scopeA, `key-${TENANT_CACHE_MAX_ENTRIES}`, "extra");
    expect(size()).toBe(TENANT_CACHE_MAX_ENTRIES);
    expect(read(scopeA, "key-0")).toBeUndefined();
    // The newest two survive.
    expect(read(scopeA, "key-1")).toBe(1);
    expect(read(scopeA, `key-${TENANT_CACHE_MAX_ENTRIES}`)).toBe("extra");
  });

  it("re-writing an existing key refreshes its value without growing the cache", () => {
    activateScope(scopeA);
    write(scopeA, "properties", ["first"]);
    write(scopeA, "properties", ["second"]);
    expect(size()).toBe(1);
    expect(read(scopeA, "properties")).toEqual(["second"]);
  });
});
