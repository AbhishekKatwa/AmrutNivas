/**
 * The active context lives in the address bar (§30).
 *
 * Two things this buys and one trap it walks into:
 *   - a link to `/properties?organization=…&property=…` opens that site on another
 *     machine, and a reload does not drop back to the first property;
 *   - the string in the URL is what the server was *asked* for, so it is never
 *     trusted — `set_active_context` re-proves every level and `resolve_active_context`
 *     re-proves it again on load, which is why a stale link narrows instead of leaking;
 *   - the trap is a feedback loop: the URL drives a switch, the switch changes the
 *     store, and the store writes the URL. Without a guard, a link the server refused
 *     (a level that was revoked) would be asked for again on every render, forever. So
 *     each adoption records the exact search string it asked for, and a URL that has
 *     already been tried once is corrected to the server's answer instead of re-tried.
 */

import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import type { ContextSelection } from "@/domain/access/session-service";
import type { ActiveContext, EntityId } from "@/domain/identity/types";
import { useContextStore } from "@/state/context-store";

/** Parameter names, spelled out because they are what a shared link carries. */
export const ORGANIZATION_PARAM = "organization";
export const PROPERTY_PARAM = "property";
export const OUTLET_PARAM = "outlet";

/** A uuid, and nothing else: a stray `?property=1` is noise, not a tenant. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function idParam(params: URLSearchParams, name: string): EntityId | null {
  const value = params.get(name);
  if (value === null) return null;
  return UUID.test(value) ? value : null;
}

/**
 * What the address bar asks to be standing in, or null when it asks for nothing.
 *
 * Null means "no valid level is named", which is deliberately different from
 * "all three levels are null": an unrelated `?tab=ledger` must leave the context
 * alone, while `?organization=&property=` from a cleared link does name the
 * organization-wide level. Absent-but-invalid is treated as absent.
 */
export function contextFromSearch(search: string): ContextSelection | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const organization = idParam(params, ORGANIZATION_PARAM);
  const property = idParam(params, PROPERTY_PARAM);
  const outlet = idParam(params, OUTLET_PARAM);
  if (organization === null && property === null && outlet === null) return null;
  return { organizationId: organization, propertyId: property, outletId: outlet };
}

/** True when the address bar and the server already agree at every level. */
export function sameContext(
  selection: ContextSelection,
  context: Pick<ActiveContext, "organizationId" | "propertyId" | "outletId">,
): boolean {
  return (
    (selection.organizationId ?? null) === context.organizationId &&
    (selection.propertyId ?? null) === context.propertyId &&
    (selection.outletId ?? null) === context.outletId
  );
}

/**
 * The search string that would describe `context`, leaving every unrelated
 * parameter in place. A level with no id loses its parameter entirely, so the
 * organization-wide view reads as `/properties?organization=…` rather than
 * `/properties?organization=…&property=&outlet=`.
 */
export function writeContextToSearch(
  search: string,
  context: Pick<ActiveContext, "organizationId" | "propertyId" | "outletId">,
): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const levels: readonly [string, EntityId | null][] = [
    [ORGANIZATION_PARAM, context.organizationId],
    [PROPERTY_PARAM, context.propertyId],
    [OUTLET_PARAM, context.outletId],
  ];
  for (const [name, value] of levels) {
    if (value === null) params.delete(name);
    else params.set(name, value);
  }
  return params.toString();
}

/**
 * Keeps the address bar and the active context equal, in whichever direction moved.
 *
 * Mounted once, inside the router, by the component that owns application effects.
 * `idle`/`loading` do nothing: the first resolve has not answered yet, and writing a
 * half-known context into the URL would be a guess.
 */
export function useSyncContextWithUrl(): void {
  const [params, setParams] = useSearchParams();
  const search = params.toString();
  const context = useContextStore((state) => state.context);
  const status = useContextStore((state) => state.status);
  const switchContext = useContextStore((state) => state.switchContext);

  /** The exact search string most recently sent to the door, so a refusal corrects the URL rather than looping. */
  const askedFor = useRef<string | null>(null);

  useEffect(() => {
    if (status !== "ready" && status !== "unauthenticated") return;

    const wanted = contextFromSearch(search);
    if (wanted !== null && !sameContext(wanted, context)) {
      // One attempt per distinct URL. A second disagreement means the server narrowed
      // what this link asked for, and the address bar is the thing that is wrong.
      if (askedFor.current !== search) {
        askedFor.current = search;
        void switchContext(wanted);
        return;
      }
    }

    const corrected = writeContextToSearch(search, context);
    if (corrected !== search) {
      askedFor.current = corrected;
      // replace, not push: a tenant switch is not a browsing history step, and undo
      // should return to the previous screen, not to the previous tenant.
      setParams(new URLSearchParams(corrected), { replace: true });
    }
  }, [search, context, status, switchContext, setParams]);
}
