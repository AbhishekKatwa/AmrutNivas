/**
 * The audit read path, exercised against a stub transport.
 *
 * There is no write test here on purpose. 004 revokes INSERT/UPDATE/DELETE from
 * `authenticated`, has no INSERT policy at all, and puts a trigger on the table that raises
 * `NIVAAS_AUDIT_IMMUTABLE` for an UPDATE or DELETE — `app.audit()` inside a write door is
 * the only writer in the system. So what this file proves is the shape of the history a
 * tenant can see: scoped to the tenant it names, newest-first with a stable tie-break, and
 * bounded.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_AUDIT_PAGE_SIZE,
  MAX_AUDIT_PAGE_SIZE,
  compareNewestFirst,
  listAuditEvents,
} from "./audit-service";
import { setSupabaseClientForTests } from "@/db/client";
import type { AuditEvent } from "@/domain/identity/types";
import { stubBackend, type BackendStub, type QueryChain } from "@/test-helpers/transport";

const ORG = "a0000000-0000-4000-8000-000000000001";
const PROPERTY = "a1000000-0000-4000-8000-000000000001";
const OUTLET = "a2000000-0000-4000-8000-000000000001";
const ACTOR = "b0000000-0000-4000-8000-000000000002";

function eventRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 41,
    actor_id: ACTOR,
    organization_id: ORG,
    property_id: PROPERTY,
    outlet_id: null,
    action: "property_archived",
    entity: "property",
    entity_id: PROPERTY,
    before: { status: "ACTIVE" },
    after: { status: "ARCHIVED" },
    reason: "site closed for renovation",
    metadata: {},
    created_at: "2026-03-05T10:00:00Z",
    ...over,
  };
}

let stub: BackendStub;

function backendReturning(rows: unknown[]): BackendStub {
  return stubBackend({
    reads: (query: QueryChain) => (query.table === "audit_log" ? rows : []),
    doors: () => undefined,
  });
}

beforeEach(() => {
  stub = backendReturning([]);
  setSupabaseClientForTests(stub.client);
});

afterEach(() => setSupabaseClientForTests(undefined));

function steps(): readonly (readonly [string, readonly unknown[]])[] {
  return stub.queries[0].steps;
}

describe("listAuditEvents", () => {
  it("stays inside the tenant it names and reads newest-first with a bounded page", async () => {
    stub = backendReturning([eventRow(), eventRow({ id: 40, action: "property_created" })]);
    setSupabaseClientForTests(stub.client);

    const events = await listAuditEvents({ organizationId: ORG, limit: 25 });

    expect(stub.queries[0].table).toBe("audit_log");
    expect(steps()).toContainEqual(["eq", ["organization_id", ORG]]);
    expect(steps()).toContainEqual(["order", ["created_at", { ascending: false }]]);
    expect(steps()).toContainEqual(["order", ["id", { ascending: false }]]);
    expect(steps()).toContainEqual(["limit", [25]]);
    // Positive case, so the filter above cannot pass by reading an empty table.
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      id: 41,
      actorId: ACTOR,
      organizationId: ORG,
      propertyId: PROPERTY,
      outletId: null,
      action: "property_archived",
      entity: "property",
      entityId: PROPERTY,
      reason: "site closed for renovation",
    });
  });

  it("narrows by site, outlet, actor, verb, entity and date range on request", async () => {
    stub = backendReturning([eventRow()]);
    setSupabaseClientForTests(stub.client);

    await listAuditEvents({
      organizationId: ORG,
      propertyId: PROPERTY,
      outletId: OUTLET,
      actorId: ACTOR,
      action: "member_invited",
      entity: "invitation",
      entityId: "00000000-0000-4000-8000-000000000007",
      from: "2026-03-01T00:00:00Z",
      to: "2026-03-31T00:00:00Z",
    });

    expect(steps()).toContainEqual(["eq", ["organization_id", ORG]]);
    expect(steps()).toContainEqual(["eq", ["property_id", PROPERTY]]);
    expect(steps()).toContainEqual(["eq", ["outlet_id", OUTLET]]);
    expect(steps()).toContainEqual(["eq", ["actor_id", ACTOR]]);
    expect(steps()).toContainEqual(["eq", ["action", "member_invited"]]);
    expect(steps()).toContainEqual(["eq", ["entity", "invitation"]]);
    expect(steps()).toContainEqual(["eq", ["entity_id", "00000000-0000-4000-8000-000000000007"]]);
    expect(steps()).toContainEqual(["gte", ["created_at", "2026-03-01T00:00:00Z"]]);
    expect(steps()).toContainEqual(["lte", ["created_at", "2026-03-31T00:00:00Z"]]);
  });

  it("sends none of the optional filters a caller left out", async () => {
    stub = backendReturning([eventRow()]);
    setSupabaseClientForTests(stub.client);

    await listAuditEvents({ organizationId: ORG });

    expect(steps().filter(([name]) => name === "eq")).toEqual([
      ["eq", ["organization_id", ORG]],
    ]);
    expect(steps()).toContainEqual(["limit", [DEFAULT_AUDIT_PAGE_SIZE]]);
  });

  it("clamps a page that asks for more than one screen of history", async () => {
    // A browser is not the place to export a tenant's whole trail; a feed asks for a page
    // and the ceiling is what keeps a typo from becoming a full-table read.
    stub = backendReturning([eventRow()]);
    setSupabaseClientForTests(stub.client);

    await listAuditEvents({ organizationId: ORG, limit: 100_000 });
    expect(steps()).toContainEqual(["limit", [MAX_AUDIT_PAGE_SIZE]]);

    await listAuditEvents({ organizationId: ORG, limit: 0 });
    expect(stub.queries[1].steps).toContainEqual(["limit", [1]]);
  });

  it("keeps a snapshot's own field names exactly as the door stored them", async () => {
    // `before`/`after` are JSON columns whose keys are data, not schema. The mapper is
    // top-level only, so `site_status` inside a snapshot must NOT arrive as `siteStatus`.
    stub = backendReturning([eventRow({ before: { site_status: "ACTIVE", tax_region: "IN" } })]);
    setSupabaseClientForTests(stub.client);

    const [event] = await listAuditEvents({ organizationId: ORG });
    expect(event!.before).toEqual({ site_status: "ACTIVE", tax_region: "IN" });
  });

  it("offers no write path — the client cannot add, edit or trim history", async () => {
    stub = backendReturning([eventRow()]);
    setSupabaseClientForTests(stub.client);

    await listAuditEvents({ organizationId: ORG });

    expect(stub.calls).toEqual([]);
    expect(stub.queries).toHaveLength(1);
  });
});

describe("compareNewestFirst", () => {
  const base: AuditEvent = {
    id: 1,
    actorId: ACTOR,
    organizationId: ORG,
    propertyId: null,
    outletId: null,
    action: "member_invited",
    entity: "invitation",
    entityId: "x",
    before: null,
    after: null,
    reason: null,
    metadata: {},
    createdAt: "2026-03-05T10:00:00Z",
  };

  it("puts a later timestamp first", () => {
    const newer = { ...base, id: 2, createdAt: "2026-03-06T10:00:00Z" };
    expect([base, newer].sort(compareNewestFirst).map((e) => e.id)).toEqual([2, 1]);
  });

  it("breaks a same-timestamp tie by id, highest first", () => {
    // One door writes two rows in one transaction, and `now()` is the transaction's
    // timestamp: `member_suspended` and `access_changed` share `created_at` exactly. Time
    // alone would order them differently on alternate reads.
    const earlier = { ...base, id: 41 };
    const later = { ...base, id: 42 };
    expect([earlier, later].sort(compareNewestFirst).map((e) => e.id)).toEqual([42, 41]);
    expect([later, earlier].sort(compareNewestFirst).map((e) => e.id)).toEqual([42, 41]);
    expect(compareNewestFirst(earlier, later)).toBeGreaterThan(0);
    expect(compareNewestFirst(later, earlier)).toBeLessThan(0);
    expect(compareNewestFirst(earlier, earlier)).toBe(0);
  });

  it("orders a whole page that arrived out of sequence", () => {
    const rows = [
      { ...base, id: 3, createdAt: "2026-03-05T10:00:00Z" },
      { ...base, id: 1, createdAt: "2026-03-04T10:00:00Z" },
      { ...base, id: 4, createdAt: "2026-03-05T10:00:00Z" },
      { ...base, id: 2, createdAt: "2026-03-04T10:00:00Z" },
    ];
    expect(rows.sort(compareNewestFirst).map((e) => e.id)).toEqual([4, 3, 2, 1]);
  });
});
