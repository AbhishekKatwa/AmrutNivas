/**
 * Audit contract — types and one pure normalizer, nothing else.
 *
 * THERE IS NO WRITER HERE AND THERE MUST NOT BE ONE. Client-side audit logging is not a
 * control: anything the browser records can be omitted or edited by the very user it is
 * meant to constrain. History enters `audit_log` through exactly one function, `app.audit()`
 * in 004, which every write door calls inside its own transaction, so a mutation that cannot
 * commit cannot leave a log line behind. The one exception worth knowing about is
 * `public.evaluate_access` (010), the only path that records a refusal, because it is the
 * only path that returns instead of raising.
 *
 * This file used to declare its own `AuditLogEntry`, a plausible-looking shape with a nested
 * `actor` snapshot, a `timestamp` field and no outcome column. None of those are columns in
 * `db/supabase`, and the client already had the accurate mirror: `AuditEvent` in
 * `@/domain/identity/types`, which `src/domain/audit/audit-service.ts` reads rows into. Two
 * vocabularies for one table is how drift starts — a screen would type-check against the
 * invention and receive the real row. So the duplicate is gone and this module re-exports the
 * one true shape. `action` here is 004's lower_snake verb (`member_suspended`), not the
 * `domain.verb` permission-key style the old comment claimed; `entityId` is text, not a uuid,
 * because 004 stores ids for entities that are not rows; and `actor` is a bare `actorId`,
 * because the audit table snapshots no PII.
 */

import type { AuditEvent, AuditResult } from "@/domain/identity/types";

/** The single client name for one append-only audit row. See `@/domain/identity/types`. */
export type { AuditEvent, AuditResult } from "@/domain/identity/types";
export { AUDIT_RESULTS } from "@/domain/identity/types";

/**
 * The columns a history list needs, as a `Pick` over the real row so a future narrower API
 * still type-checks against storage rather than against a hand-copied list that can fall
 * behind a migration.
 */
export type AuditLogSummary = Pick<
  AuditEvent,
  "id" | "actorId" | "action" | "entity" | "entityId" | "reason" | "result" | "createdAt"
>;

/**
 * The outcome of an event, with the schema's own default applied.
 *
 * `audit_log.result` is `not null default 'SUCCESS'` (010), so an absent field on a row that
 * was written by a door is unambiguously a success. `FAILURE` is a door that ran its
 * validation and refused before mutating; `DENIED` is only ever produced by
 * `evaluate_access`. Prefer this over `event.result ?? "SUCCESS"` at every call site: the
 * read projection may not select the column yet (see `AuditEvent["result"]`), and a screen
 * must not each invent its own fallback for that.
 */
export function auditResultOf(event: Pick<AuditEvent, "result">): AuditResult {
  return event.result ?? "SUCCESS";
}

/**
 * True when an event is worth surfacing as bad news.
 *
 * A denial of an attempt the actor never made is noise; a `FAILURE` is a mutation that was
 * blocked by a rule, which is the thing a reviewer is looking for when they ask "why did this
 * not go through".
 */
export function auditOutcomeIsAdverse(event: Pick<AuditEvent, "result">): boolean {
  return auditResultOf(event) !== "SUCCESS";
}
