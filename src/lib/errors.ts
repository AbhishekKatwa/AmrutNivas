/**
 * The standard error model.
 *
 * Two layers, deliberately separate:
 *   - `AppError` is what the code throws. It may carry rich, internal detail.
 *   - `PublicError` is what a user ever sees. `toPublicError` is the only bridge,
 *     and it is a one-way filter: it maps to a known code and a message it wrote
 *     itself. It never copies a foreign `message`, `stack`, SQLSTATE, driver
 *     string or file path, because a raw Postgres error in a toast is both a
 *     UX failure and an information leak about the schema.
 */

export const ERROR_CODES = {
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  TENANT_SCOPE_MISMATCH: "TENANT_SCOPE_MISMATCH",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  /** The caller has no session the server is willing to act on. */
  AUTH_REQUIRED: "AUTH_REQUIRED",
  /** No backend is configured for this build — a deployment state, not a user error. */
  BACKEND_NOT_CONFIGURED: "BACKEND_NOT_CONFIGURED",
  INTERNAL: "INTERNAL",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export type ErrorDetails = Record<string, unknown>;

/** The only error shape allowed to reach a user. */
export type PublicError = {
  code: ErrorCode;
  message: string;
  /**
   * Field-level, machine-readable context (e.g. which form fields failed).
   * Free-form values are excluded upstream; this is not a debug channel.
   */
  details?: ErrorDetails;
};

const GENERIC_MESSAGES: Record<ErrorCode, string> = {
  RESOURCE_NOT_FOUND: "That record could not be found.",
  VALIDATION_FAILED: "Some of the information entered is not valid.",
  PERMISSION_DENIED: "You do not have permission to do that.",
  TENANT_SCOPE_MISMATCH: "That record does not belong to this property.",
  CONFLICT: "That action conflicts with a more recent change. Please retry.",
  RATE_LIMITED: "Too many requests. Please try again shortly.",
  AUTH_REQUIRED: "Your session has ended. Please sign in again.",
  BACKEND_NOT_CONFIGURED:
    "This build has no backend configured, so it cannot read or save data.",
  INTERNAL: "Something went wrong. Please try again.",
};

/** HTTP-ish status a later API layer can map the code onto. */
const SUGGESTED_STATUS: Record<ErrorCode, number> = {
  RESOURCE_NOT_FOUND: 404,
  VALIDATION_FAILED: 422,
  PERMISSION_DENIED: 403,
  TENANT_SCOPE_MISMATCH: 403,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  AUTH_REQUIRED: 401,
  BACKEND_NOT_CONFIGURED: 503,
  INTERNAL: 500,
};

export function statusForCode(code: ErrorCode): number {
  return SUGGESTED_STATUS[code];
}

/**
 * An error the application raised on purpose. The `message` here is written for
 * whoever reads the log, not necessarily for the end user — `toPublicError`
 * decides what the end user sees.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details?: ErrorDetails;
  /** Kept so a cause chain is available to the server log, never to the UI. */
  readonly cause?: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    options: { details?: ErrorDetails; cause?: unknown } = {},
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = options.details;
    this.cause = options.cause;
  }
}

function isErrorCode(value: unknown): value is ErrorCode {
  return (
    typeof value === "string" &&
    Object.values(ERROR_CODES).includes(value as ErrorCode)
  );
}

/**
 * Anything that looks like internals: stack frames, file paths, SQL, drivers.
 * If a "safe" message ever contains one of these, it is discarded rather than
 * truncated — the generic text for the code says enough.
 */
const INTERNAL_MARKERS = [
  "\n",
  " at ",
  "node_modules",
  "SELECT ",
  "INSERT ",
  "UPDATE ",
  "DELETE ",
  "FROM ",
  "WHERE ",
  "syntax error",
  "relation ",
  "column ",
  "constraint",
  "SQLSTATE",
  "postgres",
  "Error:",
  "TypeError",
  "undefined",
  "0x",
  "/src/",
  ".ts:",
  ".js:",
];

function looksInternal(message: string): boolean {
  const lower = message.toLowerCase();
  return INTERNAL_MARKERS.some((marker) => lower.includes(marker.toLowerCase()));
}

/** Collapse to a single line and a bounded length. */
function clamp(message: string): string {
  const oneLine = message.replace(/\s+/g, " ").trim();
  return oneLine.length > 180 ? `${oneLine.slice(0, 177).trimEnd()}...` : oneLine;
}

/**
 * Map ANY thrown value to a safe code + message.
 *
 * Total function: it never throws, never returns undefined, and for an value it
 * does not recognise it returns INTERNAL with a message it composed itself.
 */
export function toPublicError(value: unknown): PublicError {
  if (value instanceof AppError) {
    const message = clamp(value.message);
    return {
      code: value.code,
      // Our own message is used only when it reads like copy we would ship.
      message: message === "" || looksInternal(message) ? GENERIC_MESSAGES[value.code] : message,
      ...(value.details ? { details: value.details } : {}),
    };
  }

  // A structured error from an API response: trust the code, not the text.
  if (typeof value === "object" && value !== null && "code" in value) {
    const candidate = (value as { code: unknown }).code;
    if (isErrorCode(candidate)) {
      return { code: candidate, message: GENERIC_MESSAGES[candidate] };
    }
  }

  return { code: ERROR_CODES.INTERNAL, message: GENERIC_MESSAGES.INTERNAL };
}

/** Convenience for call sites that only need the display line. */
export function publicErrorMessage(value: unknown): string {
  return toPublicError(value).message;
}
