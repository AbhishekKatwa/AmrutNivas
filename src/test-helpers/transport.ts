/**
 * A stub Supabase backend for service and store tests.
 *
 * The suite runs in Node with no hosted project, so the only honest way to exercise
 * a service is to replace the client underneath the RPC funnel and assert on what
 * reached the wire. Two surfaces are stubbed, because those are the only two the
 * data plane has:
 *
 *   - `rpc`   — a write door. Captured by name and argument object.
 *   - `from`  — a plain SELECT under RLS. Captured as the whole chain of calls, so a
 *               test can prove a query is scoped by `organization_id` rather than
 *               trusting a comment that says it is.
 *
 * `doorParametersMatchTheSchema` then compares captured door arguments against the
 * signatures parsed out of `db/supabase/*.sql`, which is what turns "this test
 * passes" into "this call would actually be accepted by PostgREST".
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { publicDoorSignatures } from "./migrations";

export type DoorCall = { readonly name: string; readonly args: Record<string, unknown> };

export type StubResult = { data?: unknown; error?: Record<string, unknown> | null };

/** Everything a read call chain recorded, in the order it was chained. */
export type QueryChain = {
  readonly table: string;
  /** The column list passed to `.select()`, verbatim. */
  readonly columns: string;
  /** Each filter/order step as `[name, args]` — `["eq", ["organization_id", id]]`. */
  readonly steps: readonly (readonly [string, readonly unknown[]])[];
};

export type ReadHandler = (
  query: QueryChain,
) => unknown[] | StubResult | undefined;

export type BackendStub = {
  readonly client: SupabaseClient;
  readonly calls: DoorCall[];
  readonly queries: QueryChain[];
  /** The arguments of the nth (default: last) call to one door. */
  argsFor(name: string, nth?: number): Record<string, unknown>;
};

const FILTERS = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "ilike",
  "in",
  "is",
  "contains",
  "order",
  "limit",
  "range",
] as const;

function builderFor(
  table: string,
  handler: ReadHandler | undefined,
  queries: QueryChain[],
): Record<string, unknown> {
  const steps: [string, unknown[]][] = [];
  let columns = "";

  const chain: Record<string, unknown> = {};
  chain.select = (...args: unknown[]) => {
    columns = String(args[0] ?? "");
    return chain;
  };
  for (const method of FILTERS) {
    chain[method] = (...args: unknown[]) => {
      steps.push([method, args]);
      return chain;
    };
  }
  // Refused rather than recorded: a single-row read awaits to an object, and `rpc.ts`
  // types every read as a list — the stub would have to lie about the shape to accept it.
  for (const method of ["single", "maybeSingle"]) {
    chain[method] = () => {
      throw new Error(`use .limit(1) with rows()/camelRows instead of .${method}()`);
    };
  }
  for (const method of ["insert", "update", "delete", "upsert"]) {
    chain[method] = () => {
      throw new Error(`.${method}() on ${table}: writes go through a 005 door, never a table`);
    };
  }

  // `columns` is read through a getter because the chain is pushed at `.from()` time
  // and finished later; a snapshot would report an empty column list forever.
  const query = {
    table,
    get columns() {
      return columns;
    },
    steps,
  } satisfies QueryChain;
  queries.push(query);

  const resolve = async (): Promise<StubResult> => {
    if (handler === undefined) {
      throw new Error(`the stub has no read handler for table "${table}"`);
    }
    const answered = handler(query);
    if (answered === undefined) return { data: null, error: null };
    return Array.isArray(answered) ? { data: answered, error: null } : answered;
  };

  // PostgREST builders are thenable; the data plane awaits them directly.
  chain.then = (
    onOk: (value: StubResult) => unknown,
    onErr: (reason: unknown) => unknown,
  ) => resolve().then(onOk, onErr);
  return chain;
}

/**
 * `doors` answers calls by function name, `reads` answers table selects. Anything a
 * handler does not answer resolves to `data: null`, so a test expecting a row fails
 * on that null instead of silently continuing — the alternative is a stub that
 * quietly absorbs a typo.
 */
export function stubBackend(handlers: {
  doors?: (name: string, args: Record<string, unknown>) => StubResult | undefined;
  reads?: ReadHandler;
}): BackendStub {
  const calls: DoorCall[] = [];
  const queries: QueryChain[] = [];

  const client = {
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      calls.push({ name, args });
      const answered = handlers.doors?.(name, args);
      return { data: null, error: null, ...(answered ?? {}) };
    },
    from: (table: string) => builderFor(table, handlers.reads, queries),
  } as unknown as SupabaseClient;

  return {
    client,
    calls,
    queries,
    argsFor(name: string, nth?: number): Record<string, unknown> {
      const matching = calls.filter((call) => call.name === name);
      if (matching.length === 0) throw new Error(`no call to ${name} was made`);
      return matching[nth ?? matching.length - 1].args;
    },
  };
}

/** Doors only — the shape the session and write-path tests need. */
export function stubDoors(
  handler: (name: string, args: Record<string, unknown>) => StubResult | undefined,
): BackendStub {
  return stubBackend({ doors: handler });
}

/**
 * Every parameter a service sent for one door must exist on that door, in the
 * database's own spelling.
 *
 * PostgREST binds by name: an unknown key is not a type error but a
 * "function ... does not exist" at runtime, which no browser-side type can catch.
 */
export function doorParametersMatchTheSchema(
  name: string,
  sentArgs: Record<string, unknown>,
): void {
  const declared = publicDoorSignatures().get(name);
  if (declared === undefined) {
    throw new Error(`${name} is not defined in public in the migrations`);
  }
  const expected = [...declared].sort();
  const unknown = Object.keys(sentArgs)
    .sort()
    .filter((key) => !expected.includes(key));
  if (unknown.length > 0) {
    throw new Error(
      `${name} was sent ${unknown.join(", ")}; the migration declares ${expected.join(", ")}`,
    );
  }
}
