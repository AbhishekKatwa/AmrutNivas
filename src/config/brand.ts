/**
 * The single source of truth for product identity.
 *
 * No other module may hardcode the product name, tagline or version. Anything
 * that displays identity reads it from here, so a rename is a one-line change
 * and the name can be injected per-tenant later without a code search.
 */

export const APP_NAME = "AMRUT NIVAAS";

export const APP_TAGLINE = "The Operating System for Hospitality";

/** Injected by Vite from package.json at build time. */
export const APP_VERSION: string = __APP_VERSION__;

/** Shown wherever a build identifier must be attributed to a stage. */
export const APP_BUILD_STAGE = "Multi-tenant foundation (Prompt #02)";

/**
 * Default locale/currency for formatting. Domain code must never assume these:
 * every formatter takes an explicit currency/locale so a non-India tenant is a
 * configuration change, not a code change.
 */
export const DEFAULT_LOCALE = "en-IN";
export const DEFAULT_CURRENCY = "INR";
