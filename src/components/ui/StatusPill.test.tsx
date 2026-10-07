import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ACCOUNT_STATUSES,
  INVITATION_STATUSES,
  MEMBERSHIP_STATUSES,
  ORGANIZATION_STATUSES,
  SITE_STATUSES,
} from "@/domain/identity/types";
import { StatusPill, statusLabel, statusTone } from "@/components/ui/StatusPill";

const ALL_STATUS_ARRAYS: readonly (readonly string[])[] = [
  ORGANIZATION_STATUSES,
  SITE_STATUSES,
  MEMBERSHIP_STATUSES,
  INVITATION_STATUSES,
  ACCOUNT_STATUSES,
];

/**
 * StatusPill speaks every lifecycle union in domain/identity. The assertions pull
 * the values from the `const` arrays themselves — never a copy typed into this
 * file — so if a status is added on the domain side the pill is checked against it.
 */
describe("StatusPill tone mapping", () => {
  it.each([
    ["ACTIVE", "success"],
    ["INACTIVE", "neutral"],
    ["SUSPENDED", "warning"],
    ["ARCHIVED", "muted"],
    ["REMOVED", "muted"],
    ["EXPIRED", "muted"],
    ["CANCELLED", "muted"],
    ["REVOKED", "muted"],
  ] as const)("maps %s to a %s tone", (status, tone) => {
    expect(statusTone(status)).toBe(tone);
  });

  it("shows the raw value for a status the mapping has never seen, as neutral", () => {
    expect(statusTone("TELEPORTING")).toBe("neutral");
    expect(statusLabel("TELEPORTING")).toBe("TELEPORTING");
  });
});

describe("StatusPill across the real taxonomies", () => {
  const allStatuses = [...new Set(ALL_STATUS_ARRAYS.flat())];

  it("renders a non-empty label for every status in all five unions", () => {
    for (const status of allStatuses) {
      const html = renderToStaticMarkup(<StatusPill status={status} />);
      // Never crashes, never renders empty — always carries the mapped or raw label.
      expect(html).toContain(statusLabel(status));
      expect(html).toContain("<span");
    }
  });

  it("maps every union member to a known tone and a non-empty label", () => {
    const knownTones = new Set(["success", "neutral", "brand", "warning", "danger", "muted"]);
    for (const status of allStatuses) {
      expect(knownTones.has(statusTone(status)), `${status} tone`).toBe(true);
      expect(statusLabel(status).trim().length).toBeGreaterThan(0);
    }
  });

  it("renders exactly the union members with no extra or dropped status", () => {
    const html = renderToStaticMarkup(
      <div>{INVITATION_STATUSES.map((status) => <StatusPill key={status} status={status} />)}</div>,
    );
    for (const status of INVITATION_STATUSES) {
      expect(html).toContain(statusLabel(status));
    }
    expect((html.match(/<span/g) ?? []).length).toBe(INVITATION_STATUSES.length);
  });
});
