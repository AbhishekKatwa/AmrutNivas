/**
 * Public build-time configuration.
 *
 * Only two values exist, and both are the *publishable* ones — an anon key is not
 * a secret, it is a client id that only works with a JWT the server issued, and
 * RLS (003) is what actually decides reachability. Anything genuinely secret
 * (service role, database password, invitation signing) must stay off the client
 * entirely; Vite inlines every `VITE_*` variable into the shipped bundle, so this
 * file is the only place that reads them and the only place to audit.
 */

export type BackendConfig = {
  readonly url: string;
  readonly anonKey: string;
};

export type BackendStatus =
  | { readonly configured: true; readonly config: BackendConfig }
  /**
   * `reason` is written for a status screen, not a log: it names the missing
   * variable so a deploy can be fixed without reading source.
   */
  | { readonly configured: false; readonly reason: string };

const HOSTED_URL = /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.supabase\.(co|in|red)\/?$/i;
/** `supabase start` serves PostgREST on http://localhost:54321. */
const LOCAL_URL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{2,5})?\/?$/i;
/** Anon keys are JWTs; the payload is public, so this shape check is honest. */
const KEY_PATTERN = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

function readEnv(name: string): string {
  const value = (import.meta.env as Record<string, unknown>)[name];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Resolved once per process. A half-configured build (url without key) is treated
 * as unconfigured rather than crashing the app at import time — the shell still
 * renders, and says which variable is missing.
 */
export function backendStatus(): BackendStatus {
  const url = readEnv("VITE_SUPABASE_URL");
  const anonKey = readEnv("VITE_SUPABASE_ANON_KEY");

  if (url === "" && anonKey === "") {
    return {
      configured: false,
      reason:
        "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not set, so this build has no data plane.",
    };
  }
  if (url === "") {
    return { configured: false, reason: "VITE_SUPABASE_URL is not set." };
  }
  if (anonKey === "") {
    return { configured: false, reason: "VITE_SUPABASE_ANON_KEY is not set." };
  }
  if (!HOSTED_URL.test(url) && !LOCAL_URL.test(url)) {
    return {
      configured: false,
      reason:
        "VITE_SUPABASE_URL must be an https://<project>.supabase.co project URL, or a local http://localhost:<port> stack.",
    };
  }
  if (!KEY_PATTERN.test(anonKey)) {
    return {
      configured: false,
      reason: "VITE_SUPABASE_ANON_KEY does not look like a Supabase publishable key.",
    };
  }
  return { configured: true, config: { url: url.replace(/\/$/, ""), anonKey } };
}

export function isBackendConfigured(): boolean {
  return backendStatus().configured;
}

/** The origin a support link or an invitation email would point at. */
export function appUrl(): string {
  const value = readEnv("VITE_APP_URL");
  return value === "" ? window.location.origin : value.replace(/\/$/, "");
}
