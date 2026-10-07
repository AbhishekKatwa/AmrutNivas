/**
 * The one Supabase client.
 *
 * Two deliberate properties:
 *
 * 1. It degrades instead of throwing at import time. No AMRUT NIVAAS project has
 *    been created yet, so every preview build ships with the variables absent;
 *    `getSupabase()` returns null, the shell renders, and the status page says
 *    which variable is missing. A blank screen with a console stack would be the
 *    alternative, and it tells the operator nothing.
 *
 * 2. Nothing here creates a session. The anon key identifies the app; the row-level
 *    policies (003) and the doors (005) only ever act on a verified JWT. Until a
 *    person signs in through the email sign-in link (`domain/auth/auth-service.ts`,
 *    the one GoTrue adapter), reads return no rows and every door refuses with
 *    `NIVAAS_NO_SESSION` — which is the correct behaviour, not a bug to paper over
 *    with a service-role key. A service key in a browser bundle would hand the
 *    whole multi-tenant database to whoever opened devtools.
 *
 * Prompt #03 decided the session question this file used to defer: the client now
 * persists the session, refreshes it automatically, and consumes the sign-in link
 * from the URL, all behind that one adapter.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { backendStatus } from "@/config/env";
import { AppError } from "@/lib/errors";

let client: SupabaseClient | null | undefined;

/** Why there is no backend, for a screen to show. Null when there is one. */
export function backendUnavailableReason(): string | null {
  const status = backendStatus();
  return status.configured ? null : status.reason;
}

export function isBackendReady(): boolean {
  return backendStatus().configured;
}

/** Memoized; returns null when this build has no usable configuration. */
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;

  const status = backendStatus();
  if (!status.configured) {
    client = null;
    return client;
  }
  client = createClient(status.config.url, status.config.anonKey, {
    // Prompt #03's session decision, taken once here: persist the session so a
    // reload restores it, refresh it automatically, and consume the emailed
    // sign-in link when the URL carries one. Only the publishable anon key is in
    // this bundle; §25's "no unnecessary sensitive data in browser storage" is
    // met by letting GoTrue own its own storage and adding nothing to it.
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    global: { headers: { "x-application-name": "amrut-nivaas" } },
  });
  return client;
}

/** For the services that cannot proceed without a data plane. */
export function requireSupabase(): SupabaseClient {
  const existing = getSupabase();
  if (existing !== null) return existing;
  throw new AppError("BACKEND_NOT_CONFIGURED", backendUnavailableReason() ?? "", {
    details: { reason: "missing_env" },
  });
}

/**
 * Test seam. The suite injects a stub so service and store behaviour is exercised
 * without a network, a browser or a hosted project. `undefined` clears the seam and
 * restores real resolution; `null` pins the "no backend" path so it can be asserted.
 */
export function setSupabaseClientForTests(
  replacement: SupabaseClient | null | undefined,
): void {
  client = replacement;
}
