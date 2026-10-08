/**
 * Security configuration (Prompt #03 §54).
 *
 * The single place the authorization vocabulary and its user-facing copy live, so
 * a reason code or a denial sentence is never retyped into a screen and allowed to
 * drift. Session/auth lifecycle knobs deliberately live in
 * `src/domain/auth/session-config.ts` (another work item owns that file); this one
 * holds only the access-decision surface.
 *
 * The permission key format is already mirrored once and only once, as
 * `PERMISSION_PATTERN` in `domain/identity/types.ts` (the DB CHECK in 002), and the
 * grantable set is the catalogue in `domain/identity/permissions.ts`. Neither is
 * duplicated here.
 */

/**
 * The exact reason codes `public.evaluate_access` (010_audit_outcomes.sql) emits,
 * listed in the order its ladder can reach them. A tenth spelling of "denied" is
 * how a UI ends up showing a fallback message for a case the server actually named.
 */
export const ACCESS_DENIAL_REASONS = [
  "NOT_AUTHENTICATED",
  "PROFILE_MISSING",
  "ACCOUNT_SUSPENDED",
  "ACCOUNT_DEACTIVATED",
  "NO_ACTIVE_MEMBERSHIP",
  "ORGANIZATION_NOT_ACTIVE",
  "PROPERTY_ACCESS_DENIED",
  "OUTLET_ACCESS_DENIED",
  "PERMISSION_DENIED",
] as const;

export type AccessDenialReason = (typeof ACCESS_DENIAL_REASONS)[number];

/**
 * What a person sees when a denial reaches the screen (§46, §63). §18 forbids
 * leaking internal security detail and §63 forbids showing an internal permission
 * key, so these sentences are written for the effect, not the mechanism: nobody
 * needs to know which of their eleven memberships failed.
 */
export const DENIAL_MESSAGES: Readonly<Record<AccessDenialReason, string>> = {
  NOT_AUTHENTICATED: "Please sign in again to continue.",
  PROFILE_MISSING: "Your account is not fully set up. Contact your administrator.",
  ACCOUNT_SUSPENDED: "Your account has been suspended. Contact your administrator.",
  ACCOUNT_DEACTIVATED: "Your account is no longer active. Contact your administrator.",
  NO_ACTIVE_MEMBERSHIP: "You no longer have active access to this organization.",
  ORGANIZATION_NOT_ACTIVE: "This organization is not currently active.",
  PROPERTY_ACCESS_DENIED: "You do not have access to this property.",
  OUTLET_ACCESS_DENIED: "You do not have access to this outlet.",
  PERMISSION_DENIED: "You don't have permission to perform this action.",
};

/**
 * Door refusals are single-token errors raised by the migrations (005's
 * conventions block). They belong in logs and developer consoles — §39/§63 keep
 * them out of user-facing copy. `authorize.test.ts` used to assert that on every
 * denial sentence below; the suite is deleted, so §39/§63 are held here by review
 * and the only mechanical backstop is that this table is keyed by the token, never
 * by database text.
 */
export const INTERNAL_ERROR_TOKEN_PREFIX = "NIVAAS_" as const;
