/**
 * The audit screen's testable half.
 *
 * There is no jsdom and nothing is clickable, so the two claims that could otherwise only
 * be checked by hand-driving a browser are pulled out and proven directly: the filter
 * controls map onto the real `listAuditEvents` parameters (and an empty set sends nothing),
 * and the render is read-only by construction. The trail body and the whole page render
 * through `renderToStaticMarkup` the way `Shell.render.test.tsx` renders the shell.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AuditTrail,
  buildAuditFilter,
  snapshotDiff,
  uniqueAuditValues,
} from "./AuditPage";
import AuditPage from "./AuditPage";
import type { AuditEvent, Permission } from "@/domain/identity/types";
import { useContextStore, resetForTests } from "@/state/context-store";

const ORG = "a0000000-0000-4000-8000-000000000001";
const PROPERTY = "b1000000-0000-4000-8000-000000000001";
const OUTLET = "c1000000-0000-4000-8000-000000000001";

function event(over: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: 10,
    actorId: "d0000000-0000-4000-8000-000000000009",
    organizationId: ORG,
    propertyId: PROPERTY,
    outletId: null,
    action: "property_archived",
    entity: "property",
    entityId: PROPERTY,
    before: { status: "ACTIVE" },
    after: { status: "ARCHIVED" },
    reason: "closed for renovation",
    metadata: {},
    createdAt: "2026-03-05T10:00:00Z",
    ...over,
  };
}

describe("buildAuditFilter", () => {
  it("sends only the tenant for an empty filter set", () => {
    expect(buildAuditFilter(ORG, {})).toEqual({ organizationId: ORG });
  });

  it("maps each chosen filter onto its real listAuditEvents parameter", () => {
    const filter = buildAuditFilter(ORG, {
      entity: "membership",
      action: "member_invited",
      propertyId: PROPERTY,
      outletId: OUTLET,
      pageSize: 100,
    });
    expect(filter).toEqual({
      organizationId: ORG,
      entity: "membership",
      action: "member_invited",
      propertyId: PROPERTY,
      outletId: OUTLET,
      limit: 100,
    });
  });

  it("expands a calendar day range into inclusive ISO bounds", () => {
    const filter = buildAuditFilter(ORG, { fromDate: "2026-03-01", toDate: "2026-03-31" });
    expect(filter.from).toBe("2026-03-01T00:00:00.000Z");
    expect(filter.to).toBe("2026-03-31T23:59:59.999Z");
  });

  it("drops an empty-string control rather than sending a filter that matches nothing", () => {
    const filter = buildAuditFilter(ORG, { entity: "", action: "", propertyId: "" });
    expect(filter).toEqual({ organizationId: ORG });
  });
});

describe("uniqueAuditValues", () => {
  it("offers only distinct values that appear in the loaded rows", () => {
    const rows = [
      event({ entity: "property", action: "property_archived", propertyId: PROPERTY }),
      event({ id: 9, entity: "membership", action: "member_invited", propertyId: OUTLET }),
      event({ id: 8, entity: "property", action: "property_created" }),
    ];
    expect(uniqueAuditValues(rows, "entity")).toEqual(["membership", "property"]);
    expect(uniqueAuditValues(rows, "action")).toEqual([
      "member_invited",
      "property_archived",
      "property_created",
    ]);
    expect(uniqueAuditValues(rows, "propertyId")).toEqual([PROPERTY, OUTLET]);
  });

  it("skips a field that is null on every row", () => {
    expect(uniqueAuditValues([event({ outletId: null })], "outletId")).toEqual([]);
  });
});

describe("snapshotDiff", () => {
  it("lists the union of both snapshots' keys and flags what changed", () => {
    const diff = snapshotDiff(
      { status: "ACTIVE", code: "HTL" },
      { status: "ARCHIVED", city: "Goa" },
    );
    expect(diff.map((d) => d.field)).toEqual(["city", "code", "status"]);
    expect(diff.find((d) => d.field === "status")).toMatchObject({
      before: "ACTIVE",
      after: "ARCHIVED",
      changed: true,
    });
    expect(diff.find((d) => d.field === "code")).toMatchObject({
      before: "HTL",
      after: undefined,
      changed: true,
    });
    expect(diff.find((d) => d.field === "city")?.changed).toBe(true);
  });

  it("keeps an unchanged field visible but marked unchanged", () => {
    const diff = snapshotDiff({ version: 2 }, { version: 2 });
    expect(diff).toEqual([{ field: "version", before: 2, after: 2, changed: false }]);
  });

  it("renders nothing invented when there is no snapshot at all", () => {
    expect(snapshotDiff(null, null)).toEqual([]);
  });
});

describe("AuditTrail render", () => {
  it("names a fresh install as a normal empty state, not a zero", () => {
    const html = renderToStaticMarkup(<AuditTrail events={[]} loading={false} error={null} />);
    expect(html).toContain("No trail recorded yet");
    expect(html).not.toContain("0 events");
  });

  it("shows a loading region while reading", () => {
    const html = renderToStaticMarkup(<AuditTrail events={[]} loading error={null} />);
    expect(html).toContain("Reading the trail");
  });

  it("frames a read failure as a read failure, never a change to history", () => {
    const html = renderToStaticMarkup(
      <AuditTrail events={[]} loading={false} error="The service is unavailable." />,
    );
    expect(html).toContain("could not be loaded");
    expect(html).toContain("read failure");
  });

  it("renders a row's reason and its recorded fields honestly", () => {
    const html = renderToStaticMarkup(
      <AuditTrail events={[event()]} loading={false} error={null} />,
    );
    expect(html).toContain("property_archived");
    expect(html).toContain("closed for renovation");
    expect(html).toContain("Recorded fields");
    expect(html).toContain("ACTIVE");
    expect(html).toContain("ARCHIVED");
  });

  it("renders metadata as the explanation when a derived row carries no reason", () => {
    const html = renderToStaticMarkup(
      <AuditTrail
        events={[event({ reason: null, metadata: { consumed_kg: 42, batch: "B-7" } })]}
        loading={false}
        error={null}
      />,
    );
    expect(html).toContain("Metadata (as recorded)");
    expect(html).toContain("consumed_kg");
  });

  it("is read-only by construction: no control and no mutate verb anywhere", () => {
    const html = renderToStaticMarkup(
      <AuditTrail events={[event(), event({ id: 9, reason: null })]} loading={false} error={null} />,
    );
    expect((html.match(/<button/g) ?? []).length).toBe(0);
    const lower = html.toLowerCase();
    expect(lower).not.toContain("clear log");
    expect(lower).not.toContain("delete");
    expect(lower).not.toContain("edit record");
  });
});

describe("AuditPage access gate", () => {
  beforeEach(() => resetForTests());

  function ready(permissions: Permission[], organizationId: string | null = ORG): void {
    useContextStore.setState({
      status: "ready",
      context: {
        signedIn: true,
        organizationId,
        propertyId: null,
        outletId: null,
        cleared: false,
      },
      permissions: {
        organizationId: organizationId ?? ORG,
        propertyId: null,
        outletId: null,
        permissions,
      },
    });
  }

  it("renders AccessDenied naming audit.view when the capability is missing", () => {
    ready(["organization.view"]);
    const html = renderToStaticMarkup(<AuditPage />);
    expect(html).toContain("Access not available");
    expect(html).toContain("audit.view");
  });

  it("does not deny the screen when audit.view is held", () => {
    ready(["audit.view"]);
    const html = renderToStaticMarkup(<AuditPage />);
    expect(html).not.toContain("Access not available");
    // Even with the trail still loading, the header names the read-only contract.
    expect(html).toContain("Audit trail");
    expect(html).toContain("Read-only");
  });

  it("refuses to show another tenant's scope: with no organization selected it says so", () => {
    ready(["audit.view"], null);
    const html = renderToStaticMarkup(<AuditPage />);
    expect(html).toContain("No organization selected");
  });
});
