/**
 * Door error normalisation.
 *
 * The doors in 005 refuse with a single token (`NIVAAS_ACCESS_DENIED`) and nothing
 * else — deliberately, so the client never has to parse a sentence and never has a
 * chance to surface a schema detail, a column name or a constraint to a user.
 *
 * This file is the only place that turns a token into a code + copy. Two rules
 * make it safe:
 *   - the map is total over the tokens the database can raise, and
 *   - an unrecognised message falls back to INTERNAL with a message written here,
 *     never the database's own text.
 * `db/door-errors.test.ts` reads `db/supabase/*.sql` and fails if any token in the
 * migrations is missing from this table, which is what keeps the two in step.
 */

import { AppError, type ErrorCode } from "@/lib/errors";

type DoorErrorSpec = { readonly code: ErrorCode; readonly message: string };

function spec(code: ErrorCode, message: string): DoorErrorSpec {
  return { code, message };
}

const DENIED = "You do not have permission to do that here.";

/**
 * 008's `require_session` raises the account-standing family by format expansion
 * (`raise exception 'NIVAAS_ACCOUNT_%', v_status`), so the database never emits a
 * single literal token for it — it emits `NIVAAS_ACCOUNT_SUSPENDED`,
 * `NIVAAS_ACCOUNT_DEACTIVATED`, and any standing the CHECK gains later. The map
 * therefore holds the family PREFIX, and `specFor` resolves an unrecognised token
 * to it by trimming trailing segments. The drift gate stays honest either way: it
 * finds `NIVAAS_ACCOUNT_` in the SQL text, and only that key is legal here.
 */
const ACCOUNT_STANDING_PREFIX = "NIVAAS_ACCOUNT_";

/** Every token the database can refuse with, keyed by the token itself. */
export const DOOR_ERRORS: Record<string, DoorErrorSpec> = {
  // ---- session / identity
  NIVAAS_NO_SESSION: spec("AUTH_REQUIRED", "Your session has ended. Please sign in again."),

  // ---- account standing (008's require_session). These are access-lost states:
  // authenticated, but no longer operational (§27/§28). The store recognises them
  // by token (§37/§63: the person gets the sentence, the code never leaves here).
  [ACCOUNT_STANDING_PREFIX]: spec(
    "PERMISSION_DENIED",
    "This account is not operational any more, so it cannot be used. Contact your administrator.",
  ),
  NIVAAS_PROFILE_MISSING: spec(
    "RESOURCE_NOT_FOUND",
    "Your account is not fully set up. Contact your administrator.",
  ),

  // ---- capability
  NIVAAS_ACCESS_DENIED: spec("PERMISSION_DENIED", DENIED),
  NIVAAS_OWNER_ONLY: spec("PERMISSION_DENIED", "Only the organization owner can do that."),
  NIVAAS_NOT_A_MEMBER: spec("PERMISSION_DENIED", "You are not a member of that organization."),
  NIVAAS_EMAIL_MISMATCH: spec(
    "PERMISSION_DENIED",
    "This invitation was issued to a different email address.",
  ),
  NIVAAS_GRANT_OUTSIDE_SCOPE: spec(
    "PERMISSION_DENIED",
    "You can only grant access to a property or outlet you can reach yourself.",
  ),
  NIVAAS_ROLE_ABOVE_AUTHORITY: spec(
    "PERMISSION_DENIED",
    "You cannot grant or create a role that reaches above your own authority.",
  ),

  // ---- tenancy integrity (a client should never see these; they mean a bug)
  NIVAAS_SCOPE_MISMATCH: spec(
    "TENANT_SCOPE_MISMATCH",
    "That record belongs to a different organization or property.",
  ),

  // ---- shape of the input
  NIVAAS_INVALID_NAME: spec("VALIDATION_FAILED", "Enter a name between 2 and 120 characters."),
  NIVAAS_INVALID_CODE: spec(
    "VALIDATION_FAILED",
    "Codes use letters, numbers, hyphens and underscores, up to 24 characters.",
  ),
  NIVAAS_INVALID_SLUG: spec(
    "VALIDATION_FAILED",
    "Slugs use lowercase letters, numbers and hyphens, and start with a letter.",
  ),
  NIVAAS_INVALID_STATUS: spec("VALIDATION_FAILED", "That status is not available here."),
  NIVAAS_INVALID_MODE: spec("VALIDATION_FAILED", "Choose either all-or-selected access."),
  NIVAAS_INVALID_COUNTRY: spec("VALIDATION_FAILED", "Enter a two-letter country code."),
  NIVAAS_INVALID_CURRENCY: spec("VALIDATION_FAILED", "Enter a three-letter currency code."),
  NIVAAS_INVALID_TIMEZONE: spec("VALIDATION_FAILED", "Choose a valid timezone, e.g. Asia/Kolkata."),
  NIVAAS_INVALID_LOCALE: spec("VALIDATION_FAILED", "Enter a locale like en-IN."),
  NIVAAS_INVALID_EMAIL: spec("VALIDATION_FAILED", "Enter a valid email address."),
  NIVAAS_INVALID_PROPERTY_TYPE: spec("VALIDATION_FAILED", "That property type is not supported."),
  NIVAAS_INVALID_OUTLET_TYPE: spec("VALIDATION_FAILED", "That outlet type is not supported."),
  NIVAAS_INVALID_EXPIRY: spec("VALIDATION_FAILED", "Invitations expire between 1 and 90 days."),
  NIVAAS_EMPTY_SELECTION: spec(
    "VALIDATION_FAILED",
    "Select at least one property or outlet for this person.",
  ),
  NIVAAS_REASON_REQUIRED: spec("VALIDATION_FAILED", "Give a reason for this change."),
  NIVAAS_SELF_NOT_ALLOWED: spec("VALIDATION_FAILED", "You cannot change your own access."),
  NIVAAS_SELF_ASSIGN_DENIED: spec(
    "VALIDATION_FAILED",
    "A role must be granted to you by someone with the authority to do so.",
  ),
  NIVAAS_INVALID_EVENT: spec("VALIDATION_FAILED", "That session event cannot be recorded."),
  NIVAAS_INVALID_RESULT: spec("VALIDATION_FAILED", "That outcome does not fit this session event."),
  NIVAAS_DEPARTMENT_GRANTS_UNSUPPORTED: spec(
    "VALIDATION_FAILED",
    "Roles can be granted at organization, property or outlet level for now.",
  ),

  // ---- lookups
  NIVAAS_NOT_FOUND: spec("RESOURCE_NOT_FOUND", "That record could not be found."),
  NIVAAS_ROLE_NOT_FOUND: spec("RESOURCE_NOT_FOUND", "That role is no longer available."),
  NIVAAS_INVITATION_NOT_FOUND: spec("RESOURCE_NOT_FOUND", "That invitation link is not valid."),
  NIVAAS_DEMO_ESTATE_MISSING: spec(
    "RESOURCE_NOT_FOUND",
    "The demo estate has not been seeded in this project.",
  ),

  // ---- lifecycle and uniqueness
  NIVAAS_ORGANIZATION_TAKEN: spec("CONFLICT", "That organization code is already in use."),
  NIVAAS_PROPERTY_TAKEN: spec("CONFLICT", "That property code is already used in this organization."),
  NIVAAS_OUTLET_TAKEN: spec("CONFLICT", "That outlet code is already used in this property."),
  NIVAAS_DEPARTMENT_TAKEN: spec("CONFLICT", "That department code is already used here."),
  NIVAAS_ALREADY_INVITED: spec("CONFLICT", "That person has already been invited."),
  NIVAAS_ALREADY_REVOKED: spec("CONFLICT", "That access has already been removed."),
  NIVAAS_ROLE_NAME_TAKEN: spec(
    "CONFLICT",
    "Another role already uses that name in this organization.",
  ),
  NIVAAS_SYSTEM_ROLE_PROTECTED: spec(
    "CONFLICT",
    "System roles are managed by the platform and cannot be changed here.",
  ),
  NIVAAS_ROLE_SCOPE_FORBIDDEN: spec(
    "VALIDATION_FAILED",
    "Tenant roles can be scoped to an organization, a property or an outlet.",
  ),
  NIVAAS_ALREADY_HAS_ORGANIZATION: spec(
    "CONFLICT",
    "This account already belongs to an organization, so the demo estate is not offered.",
  ),
  NIVAAS_INVITATION_EXPIRED: spec(
    "CONFLICT",
    "This invitation has expired. Ask the owner to send a new one.",
  ),
  NIVAAS_INVITATION_NOT_USABLE: spec(
    "CONFLICT",
    "That invitation has already been used or cancelled.",
  ),
  NIVAAS_ORGANIZATION_NOT_ACTIVE: spec(
    "CONFLICT",
    "This organization is suspended, so nothing new can be added to it.",
  ),
  NIVAAS_ORGANIZATION_ARCHIVED: spec("CONFLICT", "This organization has been retired."),
  NIVAAS_MEMBER_NOT_ACTIVE: spec(
    "CONFLICT",
    "That person is not an active member of this organization.",
  ),
  NIVAAS_PROPERTY_NOT_WRITABLE: spec(
    "CONFLICT",
    "This property is archived or inactive, so it cannot gain records.",
  ),
  NIVAAS_OUTLET_NOT_WRITABLE: spec(
    "CONFLICT",
    "This outlet is archived or inactive, so it cannot gain records.",
  ),
  NIVAAS_OUTLET_NOT_IN_PROPERTY: spec(
    "TENANT_SCOPE_MISMATCH",
    "That outlet is not part of this property.",
  ),
  NIVAAS_OWNER_MUST_TRANSFER: spec(
    "CONFLICT",
    "Transfer ownership to another member before removing yourself.",
  ),
  NIVAAS_VERSION_CONFLICT: spec(
    "CONFLICT",
    "Someone changed this record first. Reload the page and try again.",
  ),

  // ---- server-side integrity: never a user's fault, never their detail to read
  NIVAAS_AUDIT_IMMUTABLE: spec(
    "INTERNAL",
    "The audit history cannot be modified. Please contact support.",
  ),
  NIVAAS_MIGRATION_GAP: spec(
    "INTERNAL",
    "This database is missing a function the application expects. Please contact support.",
  ),
  NIVAAS_SEED_MISSING: spec("INTERNAL", "Role data has not been seeded in this database."),
  NIVAAS_ROLE_SEED_EMPTY: spec("INTERNAL", "Role data has not been seeded in this database."),
  NIVAAS_ROLE_SEED_INCOMPLETE: spec(
    "INTERNAL",
    "The role and permission data in this database is incomplete.",
  ),
  NIVAAS_PERMISSION_SEED_BROKEN: spec(
    "INTERNAL",
    "The role and permission data in this database is incomplete.",
  ),
  NIVAAS_PERMISSION_ORPHAN: spec(
    "INTERNAL",
    "The role and permission data in this database is incomplete.",
  ),
};

/** A refusal from PostgREST, narrowed to the fields this layer may look at. */
export type DoorErrorPayload = {
  readonly message?: string;
  readonly code?: string;
  readonly details?: string;
  readonly hint?: string;
};

const TOKEN_PATTERN = /NIVAAS_[A-Z0-9_]+/;

/**
 * The map entry a raised token resolves to: its own key first, then the longest
 * mapped family prefix (see `ACCOUNT_STANDING_PREFIX`). Trimming stops at
 * `NIVAAS_` itself, so an unknown token can never fall through to a catch-all.
 */
function specFor(token: string): DoorErrorSpec | null {
  let candidate = token;
  for (;;) {
    const known = DOOR_ERRORS[candidate];
    if (known !== undefined) return known;
    if (candidate.length <= "NIVAAS_".length) return null;
    const cut = candidate.lastIndexOf("_", candidate.length - 2);
    if (cut < "NIVAAS".length) return null;
    candidate = candidate.slice(0, cut + 1);
  }
}

/**
 * `ERROR: NIVAAS_ACCESS_DENIED` -> `NIVAAS_ACCESS_DENIED`; anything else -> null.
 * The returned token is the exact one the database raised — the precise value a
 * log line and the store's access-lost check need — even when its copy resolves
 * through a family prefix.
 */
export function doorToken(message: string | undefined): string | null {
  if (typeof message !== "string") return null;
  const match = TOKEN_PATTERN.exec(message);
  if (match === null) return null;
  // A token the database knows but this map has not been taught is caught by the
  // completeness test; an over-capture (e.g. a trailing word) simply misses the map.
  return specFor(match[0]) === null ? null : match[0];
}

/**
 * Turn a PostgREST/door failure into the AppError every service throws.
 *
 * Nothing here echoes the database text. When there is no token, the only thing
 * consulted is PostgREST's own SQLSTATE, which is a stable public contract:
 * 42501 is a policy/grant refusal, 23505/23503 and 40001 are retryable states.
 */
export function toDoorError(payload: DoorErrorPayload): AppError {
  const token = doorToken(payload.message);
  const matched = token === null ? null : specFor(token);
  if (token !== null && matched !== null) {
    return new AppError(matched.code, matched.message, { details: { token } });
  }

  switch (payload.code) {
    case "42501":
      return new AppError("PERMISSION_DENIED", DENIED, { details: { sqlstate: payload.code } });
    case "23505":
    case "23514":
      return new AppError("CONFLICT", "That change conflicts with a record that already exists.", {
        details: { sqlstate: payload.code },
      });
    case "23503":
      return new AppError("TENANT_SCOPE_MISMATCH", "That record is missing the hierarchy it belongs to.", {
        details: { sqlstate: payload.code },
      });
    case "40001":
    case "40P01":
      return new AppError("CONFLICT", "The database was busy. Please try again.", {
        details: { sqlstate: payload.code },
      });
    default:
      return new AppError("INTERNAL", "Something went wrong. Please try again.", {
        details: { sqlstate: payload.code ?? "unknown" },
      });
  }
}

/** A thrown AppError carries the token in `details` for logging; re-export for tests. */
export function tokenOf(error: unknown): string | null {
  if (error instanceof AppError) {
    const token = error.details?.token;
    return typeof token === "string" ? token : null;
  }
  return null;
}
