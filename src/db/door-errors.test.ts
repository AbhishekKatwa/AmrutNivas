/**
 * The refusal vocabulary, checked against the migrations that raise it.
 *
 * Two failure modes are worth testing here: a token the database can raise that the
 * client has no copy for (the user gets "Something went wrong" for a permission
 * problem they could have fixed), and a mapping that leaks database internals
 * (the user gets a schema detail, in a public repository, about a multi-tenant
 * database).
 */
import { describe, expect, it } from "vitest";
import { AppError, ERROR_CODES, toPublicError } from "@/lib/errors";
import { doorToken, DOOR_ERRORS, tokenOf, toDoorError } from "./door-errors";
import { doorErrorTokens } from "@/test-helpers/migrations";

describe("DOOR_ERRORS coverage of the schema", () => {
  it("reads the tokens out of the migrations", () => {
    // Guards the parser, and therefore every assertion below.
    expect(doorErrorTokens()).toContain("NIVAAS_ACCESS_DENIED");
    expect(doorErrorTokens().length).toBeGreaterThan(40);
  });

  it("maps every token the database can raise", () => {
    const unmapped = doorErrorTokens().filter((token) => DOOR_ERRORS[token] === undefined);
    expect(unmapped).toEqual([]);
  });

  it("carries no copy for a token that no longer exists", () => {
    const raised = new Set(doorErrorTokens());
    const dead = Object.keys(DOOR_ERRORS).filter((token) => !raised.has(token));
    expect(dead).toEqual([]);
  });

  it("uses only declared error codes, and always writes its own message", () => {
    const codes = new Set(Object.values(ERROR_CODES));
    for (const [token, { code, message }] of Object.entries(DOOR_ERRORS)) {
      expect(codes.has(code), token).toBe(true);
      expect(message.length, token).toBeGreaterThan(12);
      // A user-facing refusal must read like copy, not like a database line.
      expect(/NIVAAS_[A-Z_]/.test(message), token).toBe(false);
    }
  });
});

describe("doorToken", () => {
  it("finds the token in a bare message", () => {
    expect(doorToken("NIVAAS_ACCESS_DENIED")).toBe("NIVAAS_ACCESS_DENIED");
  });

  it("finds it inside Postgres' decorated form", () => {
    expect(doorToken("ERROR:  NIVAAS_VERSION_CONFLICT\nCONTEXT:  ...")).toBe(
      "NIVAAS_VERSION_CONFLICT",
    );
  });

  it("ignores text that is not a known token", () => {
    expect(doorToken("duplicate key value violates unique constraint")).toBeNull();
    expect(doorToken("NIVAAS_NOT_IMPLEMENTED_BY_THIS_BUILD")).toBeNull();
    expect(doorToken(undefined)).toBeNull();
  });
});

describe("toDoorError", () => {
  it("maps a permission refusal to its code and copy", () => {
    const error = toDoorError({ message: "NIVAAS_ACCESS_DENIED", code: "P0001" });
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe("PERMISSION_DENIED");
    expect(error.message).toBe("You do not have permission to do that here.");
    expect(tokenOf(error)).toBe("NIVAAS_ACCESS_DENIED");
  });

  it("maps the session refusal to a re-auth, not a generic failure", () => {
    expect(toDoorError({ message: "NIVAAS_NO_SESSION" }).code).toBe("AUTH_REQUIRED");
  });

  it("maps a lost update to a retryable conflict", () => {
    expect(toDoorError({ message: "NIVAAS_VERSION_CONFLICT" }).code).toBe("CONFLICT");
  });

  it("keeps an unknown database failure generic and leaks nothing", () => {
    const raw =
      'duplicate key value violates unique constraint "memberships_one_owner_idx"  DETAIL:  Key (user_id, organization_id)=(9f2-…) already exists.';
    const publicError = toPublicError(toDoorError({ message: raw, code: "23505" }));
    expect(publicError.code).toBe("CONFLICT");
    expect(publicError.message).not.toContain("constraint");
    expect(publicError.message).not.toContain("memberships_one_owner_idx");
    expect(JSON.stringify(publicError)).not.toContain("Key (user_id");
  });

  it("classifies a grant refusal by SQLSTATE when there is no token", () => {
    expect(toDoorError({ code: "42501" }).code).toBe("PERMISSION_DENIED");
    expect(toDoorError({ code: "23503" }).code).toBe("TENANT_SCOPE_MISMATCH");
    expect(toDoorError({ code: "40001" }).code).toBe("CONFLICT");
    expect(toDoorError({}).code).toBe("INTERNAL");
  });
});
