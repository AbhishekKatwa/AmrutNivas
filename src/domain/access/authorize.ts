/**
 * The pure client mirror of `public.evaluate_access` (010_audit_outcomes.sql).
 *
 * §13/§18 ask for one centralized authorization question with an explicit reason
 * on every denial. The server's door is the authority — this module exists so the
 * client can pre-flight the SAME ladder (route guards, disabled controls, the
 * access-denied screen) without inventing a second set of rules that drift from it.
 * The reason codes come from `config/security.ts`, which `authorize.test.ts` used to
 * diff against the SQL text, so a renamed or reordered server step broke a test rather
 * than quietly changing what users see. That suite is deleted (2026-10-07, owner
 * instruction); the ladder below is now mirrored from the migrations by hand, and the
 * server's door remains the authority that refuses regardless of what this says.
 *
 * Pure by contract: no Supabase, no store, no async — every fact is something the
 * server's own resolvers already answer (`resolve_active_context`, `my_permissions`,
 * the membership/profile rows RLS serves), passed in as a plain object.
 */

import { ACCESS_DENIAL_REASONS, DENIAL_MESSAGES, type AccessDenialReason } from "@/config/security";
import { PERMISSION_PATTERN, type EntityId, type MembershipStatus, type OrganizationStatus } from "@/domain/identity/types";

/**
 * `profiles.status` as of 008's rewritten CHECK. types.ts still mirrors the older
 * 002 vocabulary; 010 emits `'ACCOUNT_' || status`, so only these two refusals can
 * actually occur against a current database.
 */
export type AccountStanding = "ACTIVE" | "SUSPENDED" | "DEACTIVATED";

/**
 * The facts `evaluate_access` consults, one field per server question.
 *
 * `propertyReachable`/`outletReachable`/`permissionHeld` are only consulted when the
 * matching `…Requested` id is non-null — exactly the SQL's `p_property is not null
 * and not app.can_access_property(...)` shape. Fill them from the server's answers
 * (`my_permissions` includes the permission, a resolved context includes the site),
 * never from a client-side guess.
 */
export type AccessFacts = {
  readonly signedIn: boolean;
  readonly profileExists: boolean;
  readonly accountStanding: AccountStanding;
  /** null when there is no membership row for this tenant at all. */
  readonly membershipStatus: MembershipStatus | null;
  /** null when the organization id does not resolve. */
  readonly organizationStatus: OrganizationStatus | null;
  readonly propertyRequested: EntityId | null;
  readonly propertyReachable: boolean;
  readonly outletRequested: EntityId | null;
  readonly outletReachable: boolean;
  /** The capability being asked about; a key outside 002's format is a programming error. */
  readonly permissionRequested: string | null;
  readonly permissionHeld: boolean;
};

export type AccessDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: AccessDenialReason };

/**
 * Every code in the order 010's ladder can emit it: malformed key (a refusal, not a
 * verdict — it never reaches `has_permission`), session, profile, standing,
 * membership, organization, property, outlet, permission.
 */
export const DENIAL_LADDER: readonly AccessDenialReason[] = ACCESS_DENIAL_REASONS;

export function authorize(facts: AccessFacts): AccessDecision {
  if (facts.permissionRequested === null || !PERMISSION_PATTERN.test(facts.permissionRequested)) {
    return deny("PERMISSION_DENIED");
  }
  if (!facts.signedIn) {
    return deny("NOT_AUTHENTICATED");
  }
  if (!facts.profileExists) {
    return deny("PROFILE_MISSING");
  }
  if (facts.accountStanding !== "ACTIVE") {
    // 010 builds this code as `'ACCOUNT_' || status`, so the standing IS the code.
    return deny(`ACCOUNT_${facts.accountStanding}`);
  }
  // app.member_of (008) counts exactly an ACTIVE membership; INVITED, SUSPENDED,
  // REMOVED or no row at all all answer NO_ACTIVE_MEMBERSHIP.
  if (facts.membershipStatus !== "ACTIVE") {
    return deny("NO_ACTIVE_MEMBERSHIP");
  }
  if (facts.organizationStatus !== "ACTIVE") {
    return deny("ORGANIZATION_NOT_ACTIVE");
  }
  if (facts.propertyRequested !== null && !facts.propertyReachable) {
    return deny("PROPERTY_ACCESS_DENIED");
  }
  if (facts.outletRequested !== null && !facts.outletReachable) {
    return deny("OUTLET_ACCESS_DENIED");
  }
  if (!facts.permissionHeld) {
    return deny("PERMISSION_DENIED");
  }
  return { allowed: true };
}

/**
 * The sentence a person sees for a denial (§46, §63). The reason code itself stays
 * in the audit trail and the console; the copy carries no permission key and no
 * internal error token. `authorize.test.ts` used to assert that on every entry; the
 * suite is deleted, so these sentences are checked by eye against §39/§63 and the
 * reason code itself still goes to the audit trail and the console.
 */
export function denialCopy(reason: AccessDenialReason): string {
  return DENIAL_MESSAGES[reason];
}

function deny(reason: AccessDenialReason): AccessDecision {
  return { allowed: false, reason };
}
