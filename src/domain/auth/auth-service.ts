/**
 * The one GoTrue adapter (Prompt #03 §25/§26/§41/§68).
 *
 * The defect this prevents: two auth paths. This product has no passwords and §41
 * forbids inventing any — its whole entry path is the email sign-in link, the same
 * token-by-email model the invitations already use. Anything that wants to know,
 * start, observe or end a session comes through this file, so the GoTrue API
 * exists in exactly one place and the second path has nowhere to grow.
 *
 * §68 is binding here: no session object, token or credential travels further
 * than GoTrue's own storage. The audit door is fed event names and outcomes only —
 * never an email address, never a token, never anything a log could leak.
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
 * Send the sign-in link. This is the only credential-adjacent request the app
 * makes, and it asks for an address and nothing else. The failure copy is one line
 * for every GoTrue refusal on purpose (§41): parsing the message would let the
 * sign-in screen confirm which addresses have accounts.
 */
export async function sendSignInLink(email: string): Promise<void> {
  const client = requireSupabase();
  const redirect = emailRedirectTo();
  const { error } = await client.auth.signInWithOtp({
    email: email.trim(),
    ...(redirect === null ? {} : { options: { emailRedirectTo: redirect } }),
  });
  if (error === null) return;

  const rateLimited =
    error.status === 429 || error.code === "over_email_send_rate_limit";
  throw new AppError(
    rateLimited ? "RATE_LIMITED" : "VALIDATION_FAILED",
    rateLimited
      ? "Too many sign-in requests. Please wait a minute and try again."
      : "We could not send the sign-in link. Check the email address and try again.",
    { cause: error },
  );
}

function emailRedirectTo(): string | null {
  // The link must come back to this app so `detectSessionInUrl` can consume it.
  // The suite runs in Node with no window; there the GoTrue default origin is the
  // honest fallback, and only a browser can be redirected anywhere.
  if (typeof window === "undefined") return null;
  return `${appUrl()}${SIGN_IN_PATH}`;
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
