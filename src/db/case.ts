/**
 * The single Postgres row -> TypeScript object mapping rule.
 *
 * Postgres speaks `snake_case`, TypeScript speaks `camelCase`, and the mapping has
 * to happen exactly once or every service invents its own. `toCamelCase` is applied
 * to the TOP LEVEL of a row only: JSON columns (`business_hours`, `before`,
 * `metadata`) hold values whose keys are data — day ranges, meal-part names, an
 * arbitrary shape the door chose — and rewriting those keys would corrupt the
 * payload while looking like it was normalising it.
 */

const SEPARATORS = /_+([a-z0-9])/g;

export function camelKey(key: string): string {
  return key.startsWith("p_")
    ? camelKey(key.slice(2))
    : key.replace(SEPARATORS, (_, char: string) => char.toUpperCase());
}

/**
 * `p_expected_version` -> `expectedVersion`, `organization_id` -> `organizationId`.
 * The `p_` strip is what lets a door's parameter names and the client's input names
 * share one vocabulary, so a service signature reads `expectedVersion` while the
 * wire call sends `p_expected_version`.
 */
export function toCamelCase<T extends object>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[camelKey(key)] = value;
  }
  return out as T;
}

export function toCamelRows<T extends object>(rows: readonly Record<string, unknown>[]): T[] {
  return rows.map((row) => toCamelCase<T>(row));
}

/** A door returns a single row, or SQL `null` for "nothing written". */
export function toCamelRow<T extends object>(row: Record<string, unknown> | null): T | null {
  return row === null ? null : toCamelCase<T>(row);
}

const CAMEL_BOUNDARY = /([a-z0-9])([A-Z])/g;

/**
 * TypeScript input -> the door's parameter object.
 *
 * `expectedVersion` -> `p_expected_version`. PostgREST binds parameters by name, so
 * a wrong key is not a type error but a runtime "function does not exist" — which
 * is why `db/door-args.test.ts` used to compare these names against the signatures
 * parsed out of the migration files rather than trusting a comment. That test is
 * deleted, so the database is now the only arbiter of a wrong key.
 *
 * `undefined` is dropped so the door's own default applies; `null` is sent, because
 * a door reads an explicit null as "set this column to NULL".
 */
export function toDoorArgs(input: Record<string, unknown>): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    args[`p_${key.replace(CAMEL_BOUNDARY, "$1_$2").toLowerCase()}`] = value;
  }
  return args;
}
