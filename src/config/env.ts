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
/** Supabase issues the publishable key in two shapes, and both are valid `apikey` values. */
const LEGACY_ANON_JWT = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
/** A `sb_secret_*` or `sbp_*` key matches neither shape, so this gate refuses them by form. */
const PUBLISHABLE_KEY = /^sb_publishable_[A-Za-z0-9_-]{16,}$/;

function isPublishableKey(value: string): boolean {
  return LEGACY_ANON_JWT.test(value) || PUBLISHABLE_KEY.test(value);
}

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
  if (!isPublishableKey(anonKey)) {
    return {
      configured: false,
      reason:
        "VITE_SUPABASE_ANON_KEY is neither a legacy anon JWT (eyJ…) nor a sb_publishable_… key, so this build refuses to send it. A sb_secret_… or sbp_… key belongs on the server, never here.",
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
