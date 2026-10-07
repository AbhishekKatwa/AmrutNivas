/**
 * Global ambient typings. `vite/client` is already pulled in through tsconfig
 * `types`, so this file only declares the build-time defines from
 * vite.config.ts and narrows the public env surface.
 */

/** Injected at build time from package.json `version`. */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_APP_URL?: string;
  /** Publishable only — see `src/config/env.ts`. A service-role key never belongs here. */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
