/**
 * The two ways this client touches Postgres, and the only two.
 *
 *   - `callDoor`  — every write, and every resolved read the database owns
 *                   (active context, permissions). These are the 005 functions;
 *                   nothing bypasses them, because `authenticated` has no DML grant
 *                   to bypass INTO (003).
 *   - `rows`      — a plain SELECT under RLS. Read-only by construction: the grant
 *                   makes this safe, and the type below refuses a mutation builder.
 *
 * Both funnels do the same three things so no call site repeats them: unwrap
 * PostgREST's `{ data, error }`, normalize a failure into an `AppError` through
 * `door-errors` (never a raw database string), and convert `snake_case` rows to the
 * camelCase the domain uses — top level only, so JSON columns keep their own keys.
 */

import { requireSupabase } from "./client";
import { toCamelCase, toCamelRows, toDoorArgs } from "./case";
import { toDoorError, type DoorErrorPayload } from "./door-errors";
import type { DoorName } from "./doors";
import { AppError } from "@/lib/errors";

export type DoorInput = Record<string, unknown>;

/** A raw door call: use when the door returns an array or a scalar. */
export async function callDoor<TResult = unknown>(
  name: DoorName,
  input: DoorInput = {},
): Promise<TResult> {
  const { data, error } = await requireSupabase().rpc(name, toDoorArgs(input));
  if (error !== null) throw toDoorError(error as DoorErrorPayload);
  return data as TResult;
}

/**
 * A door that writes and returns its row (`jsonb`), camel-cased. The written row is
 * returned rather than re-selected on purpose: a second read can race a concurrent
 * change and then the UI would show a version it never wrote.
 */
export async function callDoorRow<TRow extends object>(
  name: DoorName,
  input: DoorInput = {},
): Promise<TRow> {
  const data = await callDoor<Record<string, unknown> | null>(name, input);
  if (data === null) {
    // Every write door returns the row it wrote, so nothing back means the door did
    // not run as documented. That is a defect to report, not an empty result to show.
    throw new AppError("INTERNAL", `${name} returned no row.`, { details: { door: name } });
  }
  return toCamelCase<TRow>(data);
}

/** The shape a PostgREST builder resolves to, narrowed to what this layer reads. */
export type Resolved<Row> = PromiseLike<{
  data: Row[] | null;
  error: DoorErrorPayload | null;
}>;

/**
 * Bridge a PostgREST SELECT builder to the `Resolved` shape the funnel reads.
 *
 * Why the cast exists: this client is built without a generated `Database` type, so a
 * `.select()` whose column list the type-level query parser cannot read (any list
 * assembled with `+`) infers the parser's placeholder row, while `camelRows` awaits raw
 * `Record<string, unknown>` rows. The two views do not unify at the declaration site,
 * and this is the single place they are allowed to meet — one stated reason instead of
 * a copy growing per service.
 *
 * It calls nothing on the builder: the exact object the service chained is the object
 * the funnel awaits, so the stubbed transport in service tests remains the whole truth
 * about what reaches PostgREST. The day `supabase gen types` lands and real row types
 * flow out of `client.ts`, delete this function and pass the builder straight through.
 */
export function asRead(
  chain: PromiseLike<{ data: unknown; error: unknown }>,
): Resolved<Record<string, unknown>> {
  return chain as unknown as Resolved<Record<string, unknown>>;
}

/** Raw rows, exactly as the table stores them. */
export async function rows<Row>(query: Resolved<Row>): Promise<Row[]> {
  const result = await query;
  if (result.error !== null) throw toDoorError(result.error);
  return result.data ?? [];
}

/** Rows mapped to a domain shape (`organization_id` -> `organizationId`). */
export async function camelRows<TRow extends object>(
  query: Resolved<Record<string, unknown>>,
): Promise<TRow[]> {
  return toCamelRows<TRow>(await rows(query));
}

/** The first row of an ordered query, or null — "not found" is a domain decision. */
export async function firstCamelRow<TRow extends object>(
  query: Resolved<Record<string, unknown>>,
): Promise<TRow | null> {
  const [row] = await camelRows<TRow>(query);
  return row ?? null;
}
