/**
 * The client's audit vocabulary.
 *
 * Two obligations, both about not inventing a second truth:
 *   - `@/lib/audit` must re-export the storage shape rather than restate it, so a screen
 *     typing against `AuditEvent` cannot be handed a shape `audit_log` does not have.
 *   - the fallback that stands in for the read projection's missing `result` column is the
 *     SCHEMA's default, in one function, rather than a `?? "SUCCESS"` per call site.
 */
import { describe, expect, it } from "vitest";
import {
  AUDIT_RESULTS,
  auditOutcomeIsAdverse,
  auditResultOf,
  type AuditEvent,
  type AuditLogSummary,
} from "./audit";
import { AUDIT_RESULTS as CANONICAL } from "@/domain/identity/types";

const ORG = "a0000000-0000-4000-8000-000000000001";

function event(over: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: 1,
    actorId: "b0000000-0000-4000-8000-000000000001",
    organizationId: ORG,
    propertyId: null,
    outletId: null,
    action: "member_suspended",
    entity: "membership",
    entityId: "c0000000-0000-4000-8000-000000000001",
    before: { status: "ACTIVE" },
    after: { status: "SUSPENDED" },
    reason: "Left the rota without notice.",
    metadata: {},
    createdAt: "2026-03-06T09:00:00Z",
    ...over,
  };
}

describe("one audit vocabulary, not two", () => {
  it("is the same array the identity layer compares against the database CHECK", () => {
    // The re-export must not have become a copy: `taxonomy.test.ts` gates the canonical one
    // against `audit_log_result_check`, and a second list here would drift silently.
    expect(AUDIT_RESULTS).toBe(CANONICAL);
  });

  it("exposes the fields `audit_log` really has, and none it does not", () => {
    // The shape this module used to declare had a nested `actor` snapshot and a `timestamp`
    // field. Neither is a column: 004 stores a bare `actor_id` and `created_at`, and it
    // snapshots no PII into history at all.
    const row = event();
    expect(Object.keys(row).sort()).toEqual(
      [
        "action",
        "actorId",
        "after",
        "before",
        "createdAt",
        "entity",
        "entityId",
        "id",
        "metadata",
        "organizationId",
        "outletId",
        "propertyId",
        "reason",
      ].sort(),
    );
    expect(row).not.toHaveProperty("actor");
    expect(row).not.toHaveProperty("timestamp");
  });

  it("keeps a summary a screen can render, chosen from real columns", () => {
    const summary: AuditLogSummary = {
      id: 1,
      actorId: event().actorId,
      action: "folio_voided",
      entity: "folio",
      entityId: "7",
      reason: "Guest dispute settled at the desk.",
      createdAt: "2026-03-06T09:00:00Z",
    };
    // `result` is optional precisely because the read may not project it yet; a summary that
    // required it would be a summary no current read can satisfy.
    expect(summary.result).toBeUndefined();
    expect(auditResultOf(summary)).toBe("SUCCESS");
  });
});

describe("auditResultOf", () => {
  it("applies the schema's own default to a row the projection did not carry", () => {
    // `audit_log.result` is `not null default 'SUCCESS'` (010). A door-written row without the
    // key in the response is therefore a success by definition, and this is the only place the
    // client is allowed to say so.
    expect(auditResultOf(event())).toBe("SUCCESS");
    expect(auditResultOf(event({ result: "FAILURE" }))).toBe("FAILURE");
    expect(auditResultOf(event({ result: "DENIED" }))).toBe("DENIED");
  });

  it("never reads a missing outcome as a denial", () => {
    // Fail-open here is correct and worth stating: the absence of a column is not evidence
    // that anything was refused, and a history list that painted quiet rows red would train
    // reviewers to ignore it.
    expect(auditOutcomeIsAdverse(event())).toBe(false);
    expect(auditOutcomeIsAdverse(event({ result: "DENIED" }))).toBe(true);
    expect(auditOutcomeIsAdverse(event({ result: "FAILURE" }))).toBe(true);
  });

  it("names the one outcome a screen may not promise to show in full", () => {
    // A door refuses by raising, which aborts its own transaction — including any audit insert
    // it had already made. Only `evaluate_access` records a `DENIED`, so an audit view is a
    // record of attempts that reached the database, not of every refusal ever issued.
    expect(AUDIT_RESULTS).toContain("DENIED");
    const denied = event({
      action: "access_denied",
      entity: "access",
      entityId: "stock.adjust",
      result: "DENIED",
      metadata: { reason: "PERMISSION_DENIED" },
    });
    expect(auditResultOf(denied)).toBe("DENIED");
    expect(auditOutcomeIsAdverse(denied)).toBe(true);
  });
});
