/**
 * The audit trail: read, and only read.
 *
 * THERE IS DELIBERATELY NO WRITE PATH IN THIS FILE, and a reader who looks for one
 * should stop here rather than add one. History enters `audit_log` through exactly one
 * function, `app.audit()` in 004, which every write door in 005 calls inside its own
 * transaction — so a mutation that cannot commit cannot leave a log line behind, and a log
 * line cannot exist without the actor the session really had. 004 then puts a
 * `before update or delete` trigger on the table that raises `NIVAAS_AUDIT_IMMUTABLE` for
 * every role, and revokes INSERT/UPDATE/DELETE from `authenticated`. A client-side writer
 * would not be a control anyway: anything the browser records can be omitted or edited by
 * the person it is meant to constrain. Corrections are new events, never edits.
 *
 * So this module's whole job is the newest-first read every ledger and activity feed in
 * this product does, and its one design obligation is that a query never leaves the tenant
 * it names (004's `audit_tenant_read` policy is the backstop; the filter below is the
 * plan-friendly front, because `audit_org_time_idx` is built on
 * `(organization_id, created_at desc)`).
 */

import { requireSupabase } from "@/db/client";
import { camelRows } from "@/db/rpc";
import type { AuditEvent, EntityId } from "@/domain/identity/types";

/** Everything a caller may narrow a history view by. `organizationId` is not optional. */
export type AuditFilter = {
  /** The tenant whose history is being read. There is no platform-wide audit read from a
   *  browser: an actor-only view is served by the same policy through their own tenant. */
  organizationId: EntityId;
  propertyId?: EntityId;
  outletId?: EntityId;
  /** The lower_snake verb 004 checks for, e.g. `member_invited`, `property_archived`. */
  action?: string;
  /** The entity TYPE name, e.g. `organization`, `membership`, `invitation`. */
  entity?: string;
  /** One entity's whole history: "everything that ever happened to this site". */
  entityId?: string;
  /** One person's footprint. 004's own policy always lets a person see this. */
  actorId?: EntityId;
  /** Inclusive ISO-8601 bounds on `created_at`. */
  from?: string;
  to?: string;
  /** Rows to fetch. Defaults to `DEFAULT_AUDIT_PAGE_SIZE`, clamped to the maximum. */
  limit?: number;
};

// One literal, never a concatenation: postgrest-js parses the SELECT list at the type
// level, and a `+`-joined string arrives as plain `string`, whose row type is an error type
// that the funnel's `camelRows` refuses.
const AUDIT_COLUMNS = "id, actor_id, organization_id, property_id, outlet_id, action, entity, entity_id, before, after, reason, metadata, created_at";

/** A feed is a screen, not an export; 50 entries is a page and a bound is a contract. */
export const DEFAULT_AUDIT_PAGE_SIZE = 50;

/** The most a single client read may ask for. Above this, paginate or filter narrower. */
export const MAX_AUDIT_PAGE_SIZE = 200;

/**
 * Newest first, and `id` breaks the tie.
 *
 * `created_at` comes from `now()`, which is the transaction's timestamp: everything a
 * single door writes — a membership change logs `member_suspended` and `access_changed` —
 * shares one timestamp to the microsecond. Ordering by time alone would then interleave
 * those two rows differently on every read. `id` is a bigint identity, monotonic in
 * insertion order, so `(created_at desc, id desc)` is both newest-first and stable.
 * Exported because the test asserts the comparator itself, not just a query that asks the
 * database to use it.
 */
export function compareNewestFirst(a: AuditEvent, b: AuditEvent): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return b.id - a.id;
}

/**
 * The tenant's history, newest first, capped.
 *
 * Filters map straight onto 004's indexed columns and none of them is required except the
 * tenant. `before`/`after`/`metadata` are JSON columns: the mapper converts top-level row
 * keys only, so a snapshot's own field names arrive exactly as the door stored them — which
 * is the point of an audit row, and why no domain type is layered over it here.
 *
 * The query already asks Postgres for this order; `compareNewestFirst` is re-applied so a
 * feed cannot reorder itself if a transport ever drops the order chain, and so the rule has
 * one implementation a test can reach.
 */
export async function listAuditEvents(filter: AuditFilter): Promise<AuditEvent[]> {
  const limit = Math.min(
    Math.max(1, Math.trunc(filter.limit ?? DEFAULT_AUDIT_PAGE_SIZE)),
    MAX_AUDIT_PAGE_SIZE,
  );

  let query = requireSupabase()
    .from("audit_log")
    .select(AUDIT_COLUMNS)
    .eq("organization_id", filter.organizationId);

  if (filter.propertyId !== undefined) query = query.eq("property_id", filter.propertyId);
  if (filter.outletId !== undefined) query = query.eq("outlet_id", filter.outletId);
  if (filter.action !== undefined) query = query.eq("action", filter.action);
  if (filter.entity !== undefined) query = query.eq("entity", filter.entity);
  if (filter.entityId !== undefined) query = query.eq("entity_id", filter.entityId);
  if (filter.actorId !== undefined) query = query.eq("actor_id", filter.actorId);
  if (filter.from !== undefined) query = query.gte("created_at", filter.from);
  if (filter.to !== undefined) query = query.lte("created_at", filter.to);

  const found = await camelRows<AuditEvent>(
    query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit),
  );
  return found.sort(compareNewestFirst);
}
