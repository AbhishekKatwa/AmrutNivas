/**
 * Money read off the wire, normalised in one place.
 *
 * WHY THIS EXISTS: every money column in this schema is unconstrained `numeric`, and
 * PostgREST serialises a `numeric` as a JSON **number**. A door that answers with
 * `to_jsonb(row)` therefore hands ₹280.00 over as the float `280`, and a float that has been
 * through an IEEE-754 round-trip is how a printed bill ends up reading 279.99999999999994.
 * Contract §1 says money crosses a boundary as TEXT; a door cannot always honour that
 * (`to_jsonb` gives no say over its cells), so the boundary retypes it here instead.
 *
 * The two rules that make this safe to call from any service:
 *   - a value that already arrived as text stays exactly as it is, so a door that DID cast
 *     (`unit_price::text`) is never double-handled;
 *   - SQL NULL stays `null`, because a money field is only ever null when the database truly
 *     has no figure for it yet — `String(null)` would put the word "null" into an amount, and
 *     a screen would print it.
 *
 * Keys are named in camelCase, i.e. after the funnel has rewritten the row: the cell must be
 * retyped while it is reachable under the key the domain uses, which is why `moneyRow` camel-
 * cases first and then retypes. `menu-service` does the same job in the opposite order, on
 * snake_case keys, before the funnel; at the next hardening pass the two converge here.
 */

import { toCamelCase } from "./case";

/** A money cell read off the wire: text stays text, a number becomes text, null stays null. */
export function moneyCell(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : String(value);
}

/** Camel-case a wire row, then retype its money cells. Nulls are left exactly as stored. */
export function moneyRow<TRow extends object>(
  raw: Record<string, unknown>,
  moneyColumns: readonly string[],
): TRow {
  const camel: Record<string, unknown> = { ...toCamelCase<Record<string, unknown>>(raw) };
  for (const column of moneyColumns) camel[column] = moneyCell(camel[column]);
  return camel as TRow;
}
