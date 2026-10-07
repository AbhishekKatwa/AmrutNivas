/**
 * The session's contract with the database: where am I, and what may I do here.
 *
 * Four doors, and the reason they exist at all is §29. The client never decides on
 * its own what the active context is — it asks `resolve_active_context`, which
 * re-proves every level against the current grants on each load. A person whose
 * property access was revoked while their laptop was closed gets a context without
 * that property, not an error and not a stale screen.
 *
 * `cleared` is the part the UI must never swallow: it means the server dropped a
 * level the client had saved. Showing it as a notice ("your access changed") is the
 * difference between a tenant switch that looks like a bug and one that is explainable.
 */

import { callDoor, callDoorRow } from "@/db/rpc";
import type {
  ActiveContext,
  EntityId,
  Organization,
  Permission,
  PermissionSet,
} from "@/domain/identity/types";

/** What a caller may ask the server to remember. Omitted levels stay unselected. */
export type ContextSelection = {
  organizationId?: EntityId | null;
  propertyId?: EntityId | null;
  outletId?: EntityId | null;
};

const NOTHING_SELECTED: ActiveContext = {
  signedIn: false,
  organizationId: null,
  propertyId: null,
  outletId: null,
  cleared: false,
};

/**
 * The doors hand back hand-built `jsonb` objects with camelCase keys, and a dropped
 * level is simply absent from them (`jsonb_build_object` omits a null under some
 * paths, and `resolve_active_context` returns only `signedIn` before a session).
 * Reading through `unknown` and defaulting here is what keeps a missing key from
 * becoming `undefined` leaking into the store, where it would render as the string
 * "undefined" in a scope filter.
 */
function toContext(payload: Record<string, unknown>): ActiveContext {
  const id = (key: string): EntityId | null =>
    typeof payload[key] === "string" ? (payload[key] as string) : null;
  return {
    signedIn: payload.signedIn === true,
    organizationId: id("organizationId"),
    propertyId: id("propertyId"),
    outletId: id("outletId"),
    cleared: payload.cleared === true,
  };
}

/** The context the server will actually honour for this session. */
export async function resolveActiveContext(): Promise<ActiveContext> {
  const payload = await callDoor<Record<string, unknown>>("resolve_active_context");
  if (payload === null || typeof payload !== "object") return NOTHING_SELECTED;
  return toContext(payload);
}

/**
 * Persist where the person is working.
 *
 * The door narrows rather than refusing: an unauthorised level is dropped and the
 * rest is stored, so one stale bookmark cannot block a whole sign-in. `set_active_context`
 * answers with what it kept, so a difference between asked and kept is exactly the
 * `cleared` signal §29 asks the client to report.
 */
export async function setActiveContext(selection: ContextSelection): Promise<ActiveContext> {
  const payload = await callDoor<Record<string, unknown>>("set_active_context", {
    organization: selection.organizationId ?? null,
    property: selection.propertyId ?? null,
    outlet: selection.outletId ?? null,
  });
  const stored = toContext(payload ?? {});
  const kept = {
    organizationId: selection.organizationId ?? null,
    propertyId: selection.propertyId ?? null,
    outletId: selection.outletId ?? null,
  };
  const dropped =
    kept.organizationId !== stored.organizationId ||
    kept.propertyId !== stored.propertyId ||
    kept.outletId !== stored.outletId;
  // A session that stored anything is signed in, even if the door's payload says
  // nothing about it; the door calls `require_session()` before it can answer.
  return { ...stored, signedIn: true, cleared: dropped };
}

/**
 * The capabilities to offer for one context.
 *
 * A display aid, never the gate — the doors re-check the same predicate on every
 * write. Called again whenever the context changes, so a permission revoked mid-shift
 * stops grey-out-able buttons rather than only failing on submit.
 */
export async function loadPermissions(
  organizationId: EntityId,
  propertyId: EntityId | null = null,
  outletId: EntityId | null = null,
): Promise<PermissionSet> {
  const granted = await callDoor<string[]>("my_permissions", {
    organization: organizationId,
    property: propertyId,
    outlet: outletId,
  });
  return {
    organizationId,
    propertyId,
    outletId,
    permissions: Array.isArray(granted) ? (granted as Permission[]) : [],
  };
}

/**
 * Take the seeded demo estate (§60/§61).
 *
 * The only way a session gets a tenant until Prompt #03's invitation flow: the door
 * refuses anyone who already belongs to an organization, so a real customer's account
 * can never be pointed at demo rows by accident. Returns the claimed organization —
 * `isDemo` is the flag the shell is required to render.
 */
export async function claimDemoEstate(): Promise<Organization> {
  return callDoorRow<Organization>("claim_demo_organization");
}
