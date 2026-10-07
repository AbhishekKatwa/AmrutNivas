/**
 * Configuration is a deployment state, so it gets asserted as one: the happy path
 * resolves to the exact values the client will use, and every incomplete
 * combination names the variable that is missing instead of failing at runtime with
 * an opaque SDK error.
 */
import { afterEach, describe, expect, it } from "vitest";
import { backendStatus, isBackendConfigured } from "./env";

const env = import.meta.env as unknown as Record<string, string | undefined>;
const KEYS = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"] as const;
const saved: Record<string, string | undefined> = {};
for (const key of KEYS) saved[key] = env[key];

function setEnv(url?: string, anonKey?: string): void {
  for (const key of KEYS) delete env[key];
  if (url !== undefined) env.VITE_SUPABASE_URL = url;
  if (anonKey !== undefined) env.VITE_SUPABASE_ANON_KEY = anonKey;
}

afterEach(() => {
  for (const key of KEYS) delete env[key];
  for (const [key, value] of Object.entries(saved)) {
    if (value !== undefined) env[key] = value;
  }
});

// Shape-checked, structurally valid, and pointed at a project that does not exist.
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.signature";

describe("backendStatus", () => {
  it("accepts a complete hosted configuration and trims the trailing slash", () => {
    setEnv("https://abcdefgxyz.supabase.co/", ANON_KEY);
    const status = backendStatus();
    expect(status.configured).toBe(true);
    if (status.configured) {
      expect(status.config).toEqual({
        url: "https://abcdefgxyz.supabase.co",
        anonKey: ANON_KEY,
      });
    }
    expect(isBackendConfigured()).toBe(true);
  });

  it("accepts a local supabase stack, which is plain http on localhost", () => {
    setEnv("http://localhost:54321", ANON_KEY);
    expect(backendStatus().configured).toBe(true);
  });

  it("reports nothing configured when both variables are absent", () => {
    setEnv();
    const status = backendStatus();
    expect(status.configured).toBe(false);
    if (!status.configured) {
      expect(status.reason).toContain("VITE_SUPABASE_URL");
      expect(status.reason).toContain("VITE_SUPABASE_ANON_KEY");
    }
  });

  it("names the specific variable that is missing", () => {
    setEnv("https://abcdefgxyz.supabase.co");
    expect(backendStatus()).toEqual({
      configured: false,
      reason: "VITE_SUPABASE_ANON_KEY is not set.",
    });

    setEnv(undefined, ANON_KEY);
    const status = backendStatus();
    expect(status.configured).toBe(false);
    if (!status.configured) expect(status.reason).toContain("VITE_SUPABASE_URL is not set");
  });

  it("refuses a URL that is not a Supabase project", () => {
    // A copy-paste from another product's env file is the realistic failure, and it
    // must not be able to send this app's tenant data somewhere else.
    setEnv("https://donor-poultry-project.supabase.in.edge", ANON_KEY);
    expect(backendStatus().configured).toBe(false);

    setEnv("http://192.168.31.191:54321", ANON_KEY);
    expect(backendStatus().configured).toBe(false);
  });

  it("refuses a key that is not a publishable JWT", () => {
    setEnv("https://abcdefgxyz.supabase.co", "sb_secret_abcdefghijklmnopqrstuvwxyz");
    const status = backendStatus();
    expect(status.configured).toBe(false);
    if (!status.configured) expect(status.reason).toContain("publishable");
  });
});
