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
import { denialCopy } from "./authorize";
import { ACCESS_DENIAL_REASONS, type AccessDenialReason } from "@/config/security";
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

/* ------------------------------------------------------------------ access verdicts */

/** What the caller wants to know, and where. Mirrors `evaluate_access`'s four parameters. */
export type AccessProbe = {
  permission: Permission;
  organizationId: EntityId;
  propertyId?: EntityId | null;
  outletId?: EntityId | null;
};

/**
 * The server's own answer to "may this session do this, here?".
 *
 * `reason` is a §46 code from `ACCESS_DENIAL_REASONS` when the answer is no, and null when it
 * is yes. It is for a log line and a developer's console; a person sees `accessDenialCopy()`.
 */
export type AccessVerdict =
  | { readonly allowed: true; readonly reason: null }
  | { readonly allowed: false; readonly reason: AccessDenialReason };

/**
 * Ask the database why an action is not available.
 *
 * WHY THIS EXISTS: `authorize.ts` is a pure mirror of 010's ladder — it decides from FACTS it
 * is handed, and it cannot fetch one. This is the half that supplies the server's own answer
 * for the same ladder, so a screen never has to reconstruct `app.has_permission`'s reasoning
 * from cached booleans and get it subtly wrong. `my_permissions` says what you hold; this says
 * whether a specific action resolves here, right now, including the property and outlet
 * breadth checks a permission set does not carry.
 *
 * CALLING IT HAS A SIDE EFFECT, so do not call it on render. `evaluate_access` is `volatile`
 * and records a `DENIED` audit row for every "no" (that is the only way a refusal ever reaches
 * the trail — a door that refuses does so by raising, which aborts its own transaction along
 * with any log line it wrote). Ask it when a person actually attempts something, or from an
 * explicit diagnostic; polling it would fill a tenant's history with denials nobody made.
 *
 * It never throws for a denial, and it never confirms another tenant's rows: an out-of-tenant
 * probe answers no, and 010 deliberately records it WITHOUT that tenant's id so an outsider
 * cannot write into a stranger's audit log.
 */
export async function evaluateAccess(probe: AccessProbe): Promise<AccessVerdict> {
  const payload = await callDoor<Record<string, unknown>>("evaluate_access", {
    permission: probe.permission,
    organization: probe.organizationId,
    property: probe.propertyId ?? null,
    outlet: probe.outletId ?? null,
  });

  if (payload === null || typeof payload !== "object") {
    // A door that answers nothing answered no: a verdict a screen cannot read is not a
    // permission, and failing open here would be the worst possible default.
    return { allowed: false, reason: "PERMISSION_DENIED" };
  }
  if (payload.allowed === true) return { allowed: true, reason: null };

  const reason = payload.reason;
  if (typeof reason === "string" && (ACCESS_DENIAL_REASONS as readonly string[]).includes(reason)) {
    return { allowed: false, reason: reason as AccessDenialReason };
  }
  // An unrecognised code stays a DENIAL with the generic copy rather than an "allowed". The
  // server's vocabulary may widen in a migration before this client does; the one thing that
  // must never happen in that window is a screen reading the gap as consent.
  return { allowed: false, reason: "PERMISSION_DENIED" };
}

/**
 * The sentence to show for a verdict, or null when the action is allowed.
 *
 * One call site for `DENIAL_MESSAGES` so a screen cannot print a raw reason code — the rule
 * `authorize.test.ts` enforces on the table itself, applied here to the path that reads it.
 */
export function accessDenialCopy(verdict: AccessVerdict): string | null {
  return verdict.allowed ? null : denialCopy(verdict.reason);
}

