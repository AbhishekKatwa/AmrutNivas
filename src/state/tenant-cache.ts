/**
 * Tenant cache isolation (§57/§58/§59).
 *
 * The consequence this prevents: this product shows ONE tenant's data at a time. A
 * cache keyed only by entity type ("properties", "outlets") would hand Organization A's
 * rows to Organization B the instant the operator switched tenants — and it would not
 * look like a security failure, it would look like a stale UI bug, so it would be
 * "fixed" by a refresh that re-reads the wrong data. Two independent guards stop that:
 *
 *   1. Every entry remembers the scope it was fetched under. A read is only served when
 *      the requested scope is the CURRENTLY ACTIVE scope; asking for any other tenant's
 *      rows is a hard miss, never a stale hit. Physical removal (invalidateScope) then
 *      reclaims the memory, but correctness does not depend on remembering to do it.
 *
 *   2. A generation number is bumped on every context switch. A fetch that began under
 *      generation N commits against N; if the operator has since switched to N+1, that
 *      slow response is dropped instead of overwriting the newer tenant's cache. A
 *      pending request from the previous tenant can therefore never land after the switch.
 *
 * This layer is deliberately generic over the row shape — screens hydrate it later. It
 * holds no timers and no TTLs: entries live until a switch invalidates them or the
 * bounded store evicts the oldest, which keeps the behaviour deterministic and testable.
 */

import type { ActiveContext } from "@/domain/identity/types";

/** Bound on resident entries. Context switching N times never grows past this. */
export const TENANT_CACHE_MAX_ENTRIES = 512;

/** Separator that cannot appear in a UUID, so `scope`/`key` never collide when joined. */
const SCOPE_KEY_SEP = "\u0000";
/** Separator between the three hierarchy levels inside a scope string. */
const LEVEL_SEP = "|";

/** The scope a fetch began under; a commit is honoured only while the generation matches. */
export type FetchToken = {
  readonly scope: string;
  readonly key: string;
  readonly generation: number;
};

type Entry = {
  readonly scope: string;
  readonly key: string;
  readonly value: unknown;
};

/**
 * The cache's own storage. A Map preserves insertion order, which is what makes the
 * eviction deterministic: the oldest written entry is the first key.
 */
const entries = new Map<string, Entry>();

/** The one scope reads are served for. Null means no tenant is currently active. */
let activeScope: string | null = null;

/** Monotonic counter; each `activateScope` bump invalidates older in-flight fetches. */
let generation = 0;

/**
 * A stable identity for one context, used as the cache prefix. Derived only from the
 * three hierarchy levels so an identical context always produces an identical scope.
 * Trailing unselected levels are dropped, which makes a shallower scope the literal
 * string prefix of every deeper scope inside it: `ORG` is a prefix of `ORG|PROP` and of
 * `ORG|PROP|OUT`. That is what lets `invalidateScope(scopeOf(ORG_A))` reclaim an entire
 * tenant subtree in one call when the operator leaves the organization.
 */
export function scopeFor(context: Pick<ActiveContext, "organizationId" | "propertyId" | "outletId">): string {
  const levels = [context.organizationId ?? "", context.propertyId ?? "", context.outletId ?? ""];
  while (levels.length > 0 && levels[levels.length - 1] === "") levels.pop();
  return levels.join(LEVEL_SEP);
}

function compositeKey(scope: string, key: string): string {
  return scope + SCOPE_KEY_SEP + key;
}

/**
 * Point the cache at a scope and open a new generation. Returns the generation, which
 * is what `beginFetch` stamps so a later switch can refuse the fetch. Passing null
 * means "no active tenant" (e.g. signed out): every read then misses until the next
 * activation, which is exactly what a signed-out session should see.
 */
export function activateScope(scope: string | null): number {
  activeScope = scope;
  generation += 1;
  return generation;
}

/** The generation a fetch is running under. See `commitFetch`. */
export function currentGeneration(): number {
  return generation;
}

/**
 * Read a value for a scope. A scope that is not the active one never returns a hit —
 * this is the guard that makes a cross-tenant read impossible even if stale entries
 * have not been invalidated yet.
 */
export function read<T>(scope: string, key: string): T | undefined {
  if (scope !== activeScope) return undefined;
  const entry = entries.get(compositeKey(scope, key));
  return entry === undefined ? undefined : (entry.value as T);
}

/**
 * Store a value for a scope. `write` is the raw primitive — a service that fetched
 * synchronously and knows the scope is current may use it directly. A fetch that races
 * a context switch must use `commitFetch` instead so its late result can be refused.
 */
export function write<T>(scope: string, key: string, value: T): void {
  const composite = compositeKey(scope, key);
  // Re-inserting an existing key would move it to the back of the eviction order;
  // overwrite in place so a refresh never masquerades as the newest entry.
  if (entries.has(composite)) {
    entries.set(composite, { scope, key, value });
    return;
  }
  entries.set(composite, { scope, key, value });
  // Deterministic FIFO eviction: drop the oldest-inserted entry until back under cap.
  while (entries.size > TENANT_CACHE_MAX_ENTRIES) {
    const oldest = entries.keys().next();
    if (oldest.done === true) break;
    entries.delete(oldest.value);
  }
}

/**
 * Record that a fetch for (scope, key) began under the current generation. The token it
 * returns is what a later `commitFetch` checks, so a response that arrives after a
 * context switch is recognised as stale rather than trusted.
 */
export function beginFetch(scope: string, key: string): FetchToken {
  return { scope, key, generation };
}

/**
 * Land a fetched value, unless the world moved on while it was in flight. Returns false
 * (nothing written) when the token's generation is older than the current one — the
 * slow-previous-tenant case. Returns true when the value was stored.
 */
export function commitFetch<T>(token: FetchToken, value: T): boolean {
  if (token.generation !== generation) return false;
  write(token.scope, token.key, value);
  return true;
}

/**
 * Drop everything fetched under `prefix`. The store calls this with the full scope of
 * the context being left, so switching tenants physically reclaims the old tenant's
 * memory and makes it invisible even to `peek`. A shallower prefix (e.g. just the
 * organization segment) clears that whole subtree.
 */
export function invalidateScope(prefix: string): void {
  for (const [composite, entry] of entries) {
    if (entry.scope.startsWith(prefix)) entries.delete(composite);
  }
}

/** Remove every entry and forget the active scope. Used by sign-out. */
export function clearAll(): void {
  entries.clear();
  activeScope = null;
  generation += 1;
}

/**
 * Inspect a stored value IGNORING the active-scope gate. For memory/invalidation
 * assertions only — it is not a data-serving path, and nothing in the app should use
 * it to render. Its only job is to let a test prove an entry was physically evicted.
 */
export function peek(scope: string, key: string): unknown | undefined {
  const entry = entries.get(compositeKey(scope, key));
  return entry === undefined ? undefined : entry.value;
}

/** Number of resident entries, for bounded-cache assertions. */
export function size(): number {
  return entries.size;
}

/** Return the cache to a pristine state. Tests call this between cases. */
export function resetForTests(): void {
  entries.clear();
  activeScope = null;
  generation = 0;
}
