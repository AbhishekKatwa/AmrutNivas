/**
 * The one GoTrue adapter (Prompt #03 §25/§26/§41/§68, Prompt #31.5).
 *
 * Primary authentication is User ID + Password. The user types a `user_id`
 * (e.g. AMRUT001); the adapter resolves it to a synthetic email the underlying
 * Supabase Auth project understands, then delegates the password check to
 * GoTrue's native `signInWithPassword`. No password ever travels further than
 * GoTrue's own storage (§68).
 *
 * Anything that wants to know, start, observe or end a session comes through
 * this file, so the GoTrue API exists in exactly one place.
 */

import type { Session } from "@supabase/supabase-js";
import { getSupabase, requireSupabase } from "@/db/client";
import { callDoor } from "@/db/rpc";
import { appUrl } from "@/config/env";
import { AppError } from "@/lib/errors";
import {
  SIGN_IN_PATH,
  isNewSignInEvent,
  isSignOutEvent,
  type AuthEvent,
  type AuthResult,
} from "./session-config";

/** What a session says about its person — identifiers only, never credentials. */
export type SessionIdentity = {
  readonly userId: string;
  readonly email: string | null;
};

/** The narrowed fact an auth-state change carries to the store. */
export type AuthStateNotice = {
  readonly event: string;
  readonly hasSession: boolean;
  readonly userId: string | null;
};

/**
 * The session's footprint in the audit trail is written once per login, not once
 * per event: consuming a sign-in link can surface `SIGNED_IN` and `TOKEN_CREATED`
 * back to back, and two rows for one login would date the trail wrong.
 */
let auditedSignInUserId: string | null = null;

/**
 * Who the browser's session claims to be — `getSession` forces the refresh GoTrue
 * owes us first. Null means "there is definitely no session", which is what lets
 * the store skip every door instead of staging a network storm (§25).
 */
export async function readSession(): Promise<SessionIdentity | null> {
  const client = getSupabase();
  if (client === null) return null;
  const { data, error } = await client.auth.getSession();
  if (error !== null) {
    throw new AppError("AUTH_REQUIRED", "Your session has ended. Please sign in again.", {
      cause: error,
    });
  }
  return identityOf(data.session);
}

function identityOf(session: Session | null): SessionIdentity | null {
  if (session === null || session.user === undefined) return null;
  return { userId: session.user.id, email: session.user.email ?? null };
}

/**
 * Sign in with User ID + Password (Prompt #31.5).
 *
 * The user supplies a `user_id` (e.g. AMRUT001). We resolve it to the synthetic
 * email GoTrue knows, then delegate the password check to `signInWithPassword`.
 * The failure message is always generic (§18): parsing GoTrue's error would let
 * the login screen confirm which user IDs exist.
 *
 * On success, stamps `last_login_at` (fire-and-forget — never blocks the session).
 */
export async function signInWithPassword(userId: string, password: string): Promise<void> {
  const client = requireSupabase();
  const trimmedId = userId.trim();
  if (trimmedId.length === 0 || password.length === 0) {
    throw new AppError("VALIDATION_FAILED", "Invalid User ID or password.");
  }

  const { data: resolved, error: resolveError } = await client.rpc("resolve_login", {
    p_user_id: trimmedId,
  });

  if (resolveError !== null || resolved === null || (Array.isArray(resolved) && resolved.length === 0)) {
    throw new AppError("AUTH_REQUIRED", "Invalid User ID or password.");
  }

  const row = Array.isArray(resolved) ? resolved[0] : resolved;
  if (row.status !== "ACTIVE") {
    throw new AppError("AUTH_REQUIRED", "Invalid User ID or password.");
  }

  const syntheticEmail = row.email as string;
  const { error: signInError } = await client.auth.signInWithPassword({
    email: syntheticEmail,
    password,
  });

  if (signInError !== null) {
    const rateLimited = signInError.status === 429;
    throw new AppError(
      rateLimited ? "RATE_LIMITED" : "AUTH_REQUIRED",
      rateLimited
        ? "Too many login attempts. Please wait a minute and try again."
        : "Invalid User ID or password.",
      { cause: signInError },
    );
  }

  // Stamp last_login_at — fire-and-forget, never blocks the session.
  // Uses a direct RPC since touch_last_login is not in the door catalogue.
  void client.rpc("touch_last_login");
}

/**
 * Request a password reset. The user supplies their User ID; we resolve it to
 * the underlying email and ask GoTrue to send a reset link. The response is
 * always the same (§18): we never reveal whether the user ID exists.
 */
export async function requestPasswordReset(userId: string): Promise<void> {
  const client = requireSupabase();
  const trimmedId = userId.trim();
  if (trimmedId.length === 0) return;

  const { data: resolved } = await client.rpc("resolve_recovery_email", {
    p_user_id: trimmedId,
  });

  const email = Array.isArray(resolved) ? resolved[0]?.email : resolved?.email;
  if (typeof email !== "string" || email.length === 0) return;

  const redirect = typeof window !== "undefined" ? `${appUrl()}${SIGN_IN_PATH}` : undefined;
  await client.auth.resetPasswordForEmail(email, redirect ? { redirectTo: redirect } : undefined);
}

/**
 * A real sign-out (§26): the audit footprint is dispatched first — while a JWT
 * still exists to authenticate the door — then the session is invalidated at
 * GoTrue, which also drops the persisted session and emits `SIGNED_OUT`.
 * Awaiting the audit would let a slow database refuse a person their exit; not
 * dispatching it before the teardown would mean it could never be written at all.
 */
export async function signOutSession(): Promise<void> {
  const client = getSupabase();
  if (client === null) return;

  const session = identityOf((await client.auth.getSession()).data.session);
  if (session !== null) recordAuthEvent("sign_out", "SUCCESS");

  const { error } = await client.auth.signOut();
  auditedSignInUserId = null;
  if (error !== null) {
    throw new AppError("INTERNAL", "We could not complete the sign-out. Please try again.", {
      cause: error,
    });
  }
}

/**
 * Watch the session. The store decides what the facts mean; this function only
 * narrows the event into a plain notice — and owns the login footprint, because
 * deciding *when a login happened* is an auth question, not a state question.
 * Returns the detach function.
 */
export function observeAuthSession(notice: (change: AuthStateNotice) => void): () => void {
  const client = getSupabase();
  if (client === null) return () => {};

  const { data } = client.auth.onAuthStateChange((event, session) => {
    const identity = identityOf(session);
    if (isSignOutEvent(event)) auditedSignInUserId = null;
    if (identity !== null && isNewSignInEvent(event) && auditedSignInUserId !== identity.userId) {
      auditedSignInUserId = identity.userId;
      recordAuthEvent("sign_in", "SUCCESS");
    }
    notice({ event, hasSession: identity !== null, userId: identity?.userId ?? null });
  });

  return () => data.subscription.unsubscribe();
}

/**
 * §33/§35's login/logout trail, fire-and-forget by contract: a sign-in or a
 * sign-out is never held hostage to an audit insert, and a refusal from the door
 * (no session yet, a suspended profile, a database outage) is swallowed as a
 * typed no-op rather than surfacing anywhere. The payload is the event vocabulary
 * and the outcome — nothing else can reach it, which is §68 by construction.
 */
function recordAuthEvent(event: AuthEvent, result: AuthResult): void {
  void callDoor("record_auth_event", { event, result }).catch(swallowAuditFailure);
}

function swallowAuditFailure(_error: unknown): void {
  // Deliberately silent: logging the failure is how a token-shaped error string
  // ends up in a console (§68). A missing audit row is the documented, accepted
  // cost of never letting an audit write deny somebody their sign-in or sign-out.
}

/**
 * DEV ONLY: Complete bypass that skips Supabase auth entirely.
 * Sets a flag in sessionStorage that the context store reads to bypass all auth.
 * Only works in development mode.
 */
export async function devBypassSignIn(email: string): Promise<void> {
  if (import.meta.env.DEV === false) {
    throw new AppError("PERMISSION_DENIED", "Dev bypass is only available in development mode.");
  }

  // Set flags that the context store will read on next bootstrap
  sessionStorage.setItem("dev-bypass-auth", "true");
  sessionStorage.setItem("dev-bypass-email", email.trim());

  // Trigger a page reload so the context store re-bootstraps with the dev flag
  window.location.reload();
}
