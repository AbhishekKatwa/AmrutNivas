import { describe, expect, it } from "vitest";
import {
  AppError,
  ERROR_CODES,
  statusForCode,
  toPublicError,
  type ErrorCode,
} from "./errors";

/** A realistic worst case: a raw driver error with a stack and SQL in it. */
function postgresError(): Error {
  const err = new Error(
    'relation "folio_entries" does not exist - syntax error at or near "SELECT c.balance FROM folio_entries c WHERE c.outlet_id = $1"',
  );
  err.stack =
    "error: DatabaseError: duplicate key value violates unique constraint\n" +
    "    at Query.run (/app/node_modules/pg/lib/query.js:1:1)\n" +
    "    at processTicks (/app/src/server/folio.ts:88:12)";
  return err;
}

describe("toPublicError — internals never reach a user", () => {
  it("neutralises a stack trace and SQL text from a thrown Error", () => {
    const result = toPublicError(postgresError());
    expect(result.code).toBe(ERROR_CODES.INTERNAL);

    const serialised = JSON.stringify(result);
    for (const leak of [
      "at Query.run",
      "node_modules",
      "pg/lib/query.js",
      "folio.ts",
      "SELECT",
      "FROM",
      "WHERE",
      "folio_entries",
      "duplicate key",
      "unique constraint",
      "DatabaseError",
      "stack",
    ]) {
      expect(serialised.toLowerCase()).not.toContain(leak.toLowerCase());
    }
    expect(result.message).toBe("Something went wrong. Please try again.");
  });

  it("neutralises an Error whose message is already one long line of internals", () => {
    const result = toPublicError(new Error("TypeError: undefined is not a function"));
    expect(result.code).toBe(ERROR_CODES.INTERNAL);
    expect(JSON.stringify(result)).not.toContain("TypeError");
    expect(JSON.stringify(result)).not.toContain("undefined");
  });

  it("neutralises a thrown string, a thrown object with unknown code, null and undefined", () => {
    expect(toPublicError("connection refused to db-primary.internal:5432")).toEqual({
      code: ERROR_CODES.INTERNAL,
      message: "Something went wrong. Please try again.",
    });
    expect(toPublicError({ message: "SELECT * FROM users failed" }).code).toBe(
      ERROR_CODES.INTERNAL,
    );
    expect(toPublicError({ code: "23505", detail: "violates foreign key" })).toEqual({
      code: ERROR_CODES.INTERNAL,
      message: "Something went wrong. Please try again.",
    });
    expect(toPublicError(null).code).toBe(ERROR_CODES.INTERNAL);
    expect(toPublicError(undefined).code).toBe(ERROR_CODES.INTERNAL);
    expect(toPublicError(42).code).toBe(ERROR_CODES.INTERNAL);
  });

  it("trusts a known error code from an API payload but not its text", () => {
    const result = toPublicError({
      code: "PERMISSION_DENIED",
      message: "row-level security failed for policy tenant_isolation on table orders",
    });
    expect(result.code).toBe(ERROR_CODES.PERMISSION_DENIED);
    expect(result.message).toBe("You do not have permission to do that.");
  });

  it("keeps a purpose-written AppError message and its field details", () => {
    const err = new AppError(ERROR_CODES.VALIDATION_FAILED, "Check the invoice date.", {
      details: { date: "required" },
    });
    expect(toPublicError(err)).toEqual({
      code: ERROR_CODES.VALIDATION_FAILED,
      message: "Check the invoice date.",
      details: { date: "required" },
    });
  });

  it("falls back to generic copy when an AppError message leaks internals", () => {
    const err = new AppError(ERROR_CODES.CONFLICT, postgresError().message);
    const result = toPublicError(err);
    expect(result.code).toBe(ERROR_CODES.CONFLICT);
    expect(JSON.stringify(result)).not.toContain("folio_entries");
    expect(result.message).toBe(
      "That action conflicts with a more recent change. Please retry.",
    );
  });

  it("is total: it never throws, whatever is thrown", () => {
    const hostile = [
      Symbol("x") as unknown as Error,
      () => "nope",
      { toString() { throw new Error("boom"); } },
      Object.create(null),
      new AggregateError([new Error("inner")], "aggregate"),
    ];
    for (const value of hostile) {
      expect(() => toPublicError(value)).not.toThrow();
      expect(toPublicError(value).code).toBe(ERROR_CODES.INTERNAL);
    }
  });

  it("produces a single-line message of bounded length", () => {
    const result = toPublicError(
      new AppError(ERROR_CODES.RESOURCE_NOT_FOUND, "A".repeat(5000)),
    );
    expect(result.message).toHaveLength(180);
    expect(result.message).not.toContain("\n");
  });
});

describe("error codes", () => {
  it("exposes the documented set", () => {
    const codes: ErrorCode[] = [
      "RESOURCE_NOT_FOUND",
      "VALIDATION_FAILED",
      "PERMISSION_DENIED",
      "TENANT_SCOPE_MISMATCH",
      "CONFLICT",
      "RATE_LIMITED",
      "AUTH_REQUIRED",
      "BACKEND_NOT_CONFIGURED",
      "INTERNAL",
    ];
    expect(Object.values(ERROR_CODES).sort()).toEqual([...codes].sort());
  });

  it("gives the two seam codes their own status", () => {
    // A UI needs 401 to mean "re-authenticate" and 503 to mean "this deployment has
    // no data plane" — folding either into 500 hides an actionable difference.
    expect(statusForCode("AUTH_REQUIRED")).toBe(401);
    expect(statusForCode("BACKEND_NOT_CONFIGURED")).toBe(503);
  });

  it("maps every code to a status and a message", () => {
    for (const code of Object.values(ERROR_CODES)) {
      expect(statusForCode(code)).toBeGreaterThanOrEqual(400);
      expect(statusForCode(code)).toBeLessThan(600);
      expect(toPublicError(new AppError(code, "clean operator copy")).code).toBe(code);
    }
  });

  it("keeps AppError a real Error so cause chains survive logging", () => {
    const cause = new Error("upstream timeout");
    const err = new AppError(ERROR_CODES.INTERNAL, "Internal failure", { cause });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("AppError");
    expect(err.cause).toBe(cause);
    // The cause is never surfaced to the public error.
    expect(JSON.stringify(toPublicError(err))).not.toContain("upstream timeout");
  });
});
