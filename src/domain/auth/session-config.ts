/**
 * Session and auth lifecycle configuration (Prompt #03 §25/§54).
 *
 * The defect this prevents: auth timing, event vocabulary and refusal codes
 * scattered across screens and services, so a change to one moves less than the
 * others and the product ends up with several half-correct session models. Every
 * lifecycle knob lives here, in one place, read by the single adapter
 * (`auth-service.ts`) that acts on them.
 *
 * No secrets and no env reads: publishable configuration belongs to
 * `config/env.ts`, and nothing in this file needs a value from it.
 */

import type { AccessDenialReason } from "@/config/security";

/** Where an unsigned browser is taken. `routes.ts` registers it; the shell redirects to it. */
export const SIGN_IN_PATH = "/sign-in";

/**
 * The GoTrue event names this app knows about — the whole `onAuthStateChange`
 * surface. Events outside this list are ignored on purpose, so a new GoTrue event
 * can never change behaviour by itself.
 */
export const HANDLED_AUTH_EVENTS = [
  "INITIAL_SESSION",
  "SIGNED_IN",
  "TOKEN_CREATED",
  "TOKEN_REFRESHED",
  "SIGNED_OUT",
] as const;

export type HandledAuthEvent = (typeof HANDLED_AUTH_EVENTS)[number];

/**
 * Events meaning "the server would honour a fresh JWT right now": re-resolve the
 * context and permissions. `INITIAL_SESSION` is deliberately excluded — the app's
 * own bootstrap runs against the same restored session, and letting the listener
 * fire too would be a second boot storm racing the first.
 */
export const REVALIDATE_AUTH_EVENTS = ["SIGNED_IN", "TOKEN_CREATED", "TOKEN_REFRESHED"] as const;

/**
 * A failed token refresh ends the session, and GoTrue says so through this event
 * (§25's invalid-session path): losing the session and signing out arrive as the
 * same signal, which is the honest one.
 */
export const SIGN_OUT_AUTH_EVENTS = ["SIGNED_OUT"] as const;

/**
 * Which events are a login. `INITIAL_SESSION` is a RESTORE, not a login — recording
 * `sign_in` for it would put a login row in the trail (§35) on every page load and
 * bury the events a security reviewer actually wants to see.
 */
export const NEW_SIGN_IN_EVENTS = ["SIGNED_IN", "TOKEN_CREATED"] as const;

function isHandled(event: string, allowed: readonly string[]): boolean {
  return isHandledEvent(event) && (allowed as readonly HandledAuthEvent[]).includes(event as HandledAuthEvent);
}

function isHandledEvent(event: string): boolean {
  return (HANDLED_AUTH_EVENTS as readonly string[]).includes(event);
}

export function isRevalidateEvent(event: string): boolean {
  return isHandled(event, REVALIDATE_AUTH_EVENTS);
}

export function isSignOutEvent(event: string): boolean {
  return isHandled(event, SIGN_OUT_AUTH_EVENTS);
}

export function isNewSignInEvent(event: string): boolean {
  return isHandled(event, NEW_SIGN_IN_EVENTS);
}

/**
 * The exact vocabulary `record_auth_event` (010_audit_outcomes.sql) accepts.
 * Anything else is refused server-side with `NIVAAS_INVALID_EVENT` /
 * `NIVAAS_INVALID_RESULT`; keeping the spelling here means the client never learns
 * that by being rejected.
 */
export const AUTH_EVENTS = ["sign_in", "sign_out"] as const;
export type AuthEvent = (typeof AUTH_EVENTS)[number];

export const AUTH_RESULTS = ["SUCCESS", "FAILURE"] as const;
export type AuthResult = (typeof AUTH_RESULTS)[number];

/**
 * The door refusals that mean "operational access is lost" (§25/§26/§27/§28),
 * keyed by the exact token the migrations raise and mapped onto the reason codes
 * `config/security.ts` already names — the copy then comes from `DENIAL_MESSAGES`,
 * never from the token itself (§39).
 */
export const ACCESS_LOST_REASON_BY_TOKEN: Readonly<Record<string, AccessDenialReason>> = {
  NIVAAS_ACCOUNT_SUSPENDED: "ACCOUNT_SUSPENDED",
  NIVAAS_ACCOUNT_DEACTIVATED: "ACCOUNT_DEACTIVATED",
  NIVAAS_PROFILE_MISSING: "PROFILE_MISSING",
};

/**
 * 008 raises the account-standing family by format expansion (`'NIVAAS_ACCOUNT_%'`),
 * so a status the schema adds later produces a token this client has never seen.
 * Rather than hand that person a blank screen, the family prefix resolves to the
 * generic "no longer operational" reason — which is true of every non-ACTIVE
 * standing — instead of guessing a specific one.
 */
export function accessLostReason(token: string | null): AccessDenialReason | null {
  if (token === null) return null;
  const known = ACCESS_LOST_REASON_BY_TOKEN[token];
  if (known !== undefined) return known;
  return token.startsWith("NIVAAS_ACCOUNT_") ? "ACCOUNT_DEACTIVATED" : null;
}
