/**
 * The one GoTrue adapter, exercised against an injected fake client.
 *
 * A hosted sign-in link cannot be followed from this suite — no browser consumes
 * the emailed URL here — so every assertion is about what reaches the wire and
 * what comes back:
 *   - sign-in requests the email link and NOTHING else (§41): a password call
 *     would be a crash-trap, not a silent miss;
 *   - sign-out is real (GoTrue first, then the clear) and its audit footprint is
 *     dispatched while a JWT still exists to authenticate it (§26);
 *   - the §68 rule is checked structurally: every `record_auth_event` call carries
 *     exactly `p_event` + `p_result` from the server's own vocabulary, and the fake
 *     session is stuffed with token-shaped material so any leak would show up in
 *     the recorded arguments;
 *   - refusals surface as human copy — a suspended account gets its sentence, never
 *     an internal token or a permission key.
 */
import { afterEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { setSupabaseClientForTests } from "@/db/client";
import {
  observeAuthSession,
  readSession,
  sendSignInLink,
  signOutSession,
  type AuthStateNotice,
} from "./auth-service";
import { AUTH_EVENTS, AUTH_RESULTS, accessLostReason } from "./session-config";
import { doorParametersMatchTheSchema, type DoorCall } from "@/test-helpers/transport";
import { toDoorError, tokenOf } from "@/db/door-errors";
import { denialCopy } from "@/domain/access/authorize";
import { AppError, toPublicError } from "@/lib/errors";

const EMAIL = "manager@amrut.example";

/** JWT-shaped filler in the fake session: it must never appear in anything we send. */
const JWT_SHAPE = "eyJhbGciOiNiUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJuby1sZWFrIn0.sig";

type Identity = { readonly id: string; readonly email: string | null };
type ErrorShape = Record<string, unknown>;
type Listener = (event: string, session: Record<string, unknown> | null) => void;

/**
 * User ids are never reused across tests in this file: the adapter remembers the
 * last audited login, and a recycled id would suppress a row and fail an assertion
 * for a reason that has nothing to do with the behaviour under test.
 */
let userSeq = 0;

function makeFake(options: {
  readonly session?: Identity | null;
  readonly getSessionError?: ErrorShape;
  readonly otpError?: ErrorShape;
  readonly signOutError?: ErrorShape;
  readonly doorError?: ErrorShape;
} = {}) {
  const doors: DoorCall[] = [];
  /** Every wire touch in the order it happened — the audit-before-teardown proof. */
  const wire: string[] = [];
  const otpCalls: Record<string, unknown>[] = [];
  const listeners: Listener[] = [];
  let identity: Identity | null =
    options.session === undefined ? { id: `user-${++userSeq}`, email: EMAIL } : options.session;

  const sessionFor = (current: Identity | null): Record<string, unknown> | null => {
    // A real GoTrue session carries the access/refresh tokens; including one here
    // is what turns §68 from a comment into a checked property.
    if (current === null) return null;
    return { user: { id: current.id, email: current.email }, access_token: JWT_SHAPE };
  };

  const emit = (event: string): void => {
    for (const listener of [...listeners]) listener(event, sessionFor(identity));
  };

  return {
    doors,
    wire,
    otpCalls,
    emit,
    get identity(): Identity | null {
      return identity;
    },
    set identity(next: Identity | null) {
      identity = next;
    },
    auth: {
      async getSession() {
        wire.push("getSession");
        if (options.getSessionError !== undefined) {
          return { data: { session: null }, error: options.getSessionError };
        }
        return { data: { session: sessionFor(identity) }, error: null };
      },
      async signInWithOtp(payload: Record<string, unknown>) {
        wire.push("signInWithOtp");
        otpCalls.push(payload);
        return { data: null, error: options.otpError ?? null };
      },
      async signInWithPassword(): Promise<never> {
        wire.push("signInWithPassword");
        throw new Error("§41: this product has no password flow; reaching here is the defect");
      },
      async signOut() {
        wire.push("signOut");
        identity = null;
        emit("SIGNED_OUT");
        return { error: options.signOutError ?? null };
      },
      onAuthStateChange(callback: Listener) {
        listeners.push(callback);
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                const at = listeners.indexOf(callback);
                if (at >= 0) listeners.splice(at, 1);
              },
            },
          },
        };
      },
    },
    async rpc(name: string, args: Record<string, unknown>) {
      doors.push({ name, args });
      wire.push(`door:${name}`);
      return { data: null, error: options.doorError ?? null };
    },
  };
}

type Fake = ReturnType<typeof makeFake>;

function install(fake: Fake): void {
  setSupabaseClientForTests(
    { rpc: fake.rpc, auth: fake.auth } as unknown as SupabaseClient,
  );
}

/** Audit rows that a login/logout trail is supposed to leave behind. */
function auditRows(fake: Fake): DoorCall[] {
  return fake.doors.filter((call) => call.name === "record_auth_event");
}

afterEach(() => setSupabaseClientForTests(undefined));

describe("readSession", () => {
  it("reports the session's identifiers only, and null when there is none", async () => {
    const fake = makeFake();
    install(fake);

    expect(await readSession()).toEqual({ userId: fake.identity!.id, email: EMAIL });

    fake.identity = null;
    expect(await readSession()).toBeNull();
  });

  it("a getSession failure is the invalid-session path: a typed AUTH_REQUIRED throw", async () => {
    const fake = makeFake({ getSessionError: { message: "invalid refresh token" } });
    install(fake);

    const thrown = await readSession().catch((error: unknown) => error);
    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).code).toBe("AUTH_REQUIRED");
    // The copy is ours; GoTrue's text (which could name token internals) is not echoed.
    expect(toPublicError(thrown).message).toBe("Your session has ended. Please sign in again.");
  });

  it("with no client at all answers null, without touching a wire", async () => {
    setSupabaseClientForTests(null);
    expect(await readSession()).toBeNull();
  });
});

describe("sendSignInLink", () => {
  it("requests the email link and NOTHING else (§41)", async () => {
    const fake = makeFake();
    install(fake);

    await sendSignInLink(`  ${EMAIL}  `);

    expect(fake.wire).toEqual(["signInWithOtp"]);
    // Trimmed but not rewritten, and in Node (no window) no redirect option is invented.
    expect(fake.otpCalls).toEqual([{ email: EMAIL }]);
    // No door traffic at request time: the audit row belongs to the login itself.
    expect(fake.doors.length).toBe(0);
    // The password trap was never approached (it throws if called at all).
    expect(fake.wire).not.toContain("signInWithPassword");
  });

  it("a GoTrue refusal becomes one fixed sentence — never its text (§41 enumeration rule)", async () => {
    const fake = makeFake({
      otpError: { message: "For security purposes, you can only request this after 2 minutes" },
    });
    install(fake);

    const thrown = await sendSignInLink(EMAIL).catch((error: unknown) => error);
    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).code).toBe("VALIDATION_FAILED");
    expect((thrown as AppError).message).toBe(
      "We could not send the sign-in link. Check the email address and try again.",
    );
  });

  it("rate limiting is its own honest answer, not a failure of the address", async () => {
    const fake = makeFake({ otpError: { status: 429, message: "slow down" } });
    install(fake);

    const thrown = await sendSignInLink(EMAIL).catch((error: unknown) => error);
    expect((thrown as AppError).code).toBe("RATE_LIMITED");
    expect(toPublicError(thrown).message).toContain("wait a minute");
  });
});

describe("signOutSession", () => {
  it("dispatches the audit footprint BEFORE GoTrue tears the session down (§26/§35)", async () => {
    const fake = makeFake();
    install(fake);

    await signOutSession();

    // `record_auth_event` needs a JWT to authenticate; by the time GoTrue has
    // signed out there is none. The order on the wire is the whole defence.
    expect(fake.wire).toEqual(["getSession", "door:record_auth_event", "signOut"]);
    expect(auditRows(fake)).toHaveLength(1);
    expect(fake.identity).toBeNull();
  });

  it("sends exactly the two vocabulary parameters the door declares", async () => {
    const fake = makeFake();
    install(fake);

    await signOutSession();

    const row = auditRows(fake)[0];
    expect(row.args).toEqual({ p_event: "sign_out", p_result: "SUCCESS" });
    doorParametersMatchTheSchema("record_auth_event", row.args);
  });

  it("without a session it still completes the real sign-out and writes no audit row", async () => {
    const fake = makeFake({ session: null });
    install(fake);

    await signOutSession();

    expect(fake.wire).toEqual(["getSession", "signOut"]);
    expect(auditRows(fake)).toHaveLength(0);
  });

  it("a refused audit write never blocks the exit — the person still signs out (§68)", async () => {
    const fake = makeFake({ doorError: { message: "NIVAAS_ACCOUNT_SUSPENDED" } });
    install(fake);

    await expect(signOutSession()).resolves.toBeUndefined();
    expect(fake.wire).toContain("signOut");
  });

  it("a failed GoTrue sign-out is a typed INTERNAL, surfaced to the store", async () => {
    const fake = makeFake({ signOutError: { message: "network" } });
    install(fake);

    const thrown = await signOutSession().catch((error: unknown) => error);
    expect((thrown as AppError).code).toBe("INTERNAL");
    expect((thrown as AppError).message).toBe(
      "We could not complete the sign-out. Please try again.",
    );
  });

  it("with no client there is nothing to end and nothing to throw", async () => {
    setSupabaseClientForTests(null);
    await expect(signOutSession()).resolves.toBeUndefined();
  });
});

describe("observeAuthSession", () => {
  it("audits one sign_in per login — SIGNED_IN then TOKEN_CREATED does not double-row", async () => {
    const fake = makeFake();
    install(fake);
    const loginId = fake.identity!.id;
    const notices: AuthStateNotice[] = [];

    const detach = observeAuthSession((change) => notices.push(change));
    fake.emit("SIGNED_IN");
    fake.emit("TOKEN_CREATED"); // consuming a link can surface both for one login
    detach();

    expect(auditRows(fake)).toHaveLength(1);
    expect(auditRows(fake)[0].args).toEqual({ p_event: "sign_in", p_result: "SUCCESS" });
    expect(notices).toEqual([
      { event: "SIGNED_IN", hasSession: true, userId: loginId },
      { event: "TOKEN_CREATED", hasSession: true, userId: loginId },
    ]);
  });

  it("INITIAL_SESSION is a restore, not a login — no trail row for a page load (§35)", async () => {
    const fake = makeFake();
    install(fake);
    const loginId = fake.identity!.id;
    const notices: AuthStateNotice[] = [];

    const detach = observeAuthSession((change) => notices.push(change));
    fake.emit("INITIAL_SESSION");
    detach();

    expect(auditRows(fake)).toHaveLength(0);
    expect(notices).toEqual([
      { event: "INITIAL_SESSION", hasSession: true, userId: loginId },
    ]);
  });

  it("a sign-out ends the login footprint so the NEXT login is audited again", async () => {
    const fake = makeFake();
    install(fake);

    const detach = observeAuthSession(() => {});
    fake.emit("SIGNED_IN");
    await signOutSession();
    expect(auditRows(fake).map((row) => row.args.p_event)).toEqual(["sign_in", "sign_out"]);

    fake.identity = { id: `user-${++userSeq}`, email: EMAIL };
    fake.emit("SIGNED_IN");
    const signInRows = auditRows(fake).filter((row) => row.args.p_event === "sign_in");
    expect(signInRows).toHaveLength(2);
    detach();
  });

  it("detach stops the notices — a stale listener must not act on new sessions", () => {
    const fake = makeFake();
    install(fake);
    const notices: AuthStateNotice[] = [];

    const detach = observeAuthSession((change) => notices.push(change));
    detach();
    fake.emit("SIGNED_IN");

    expect(notices).toHaveLength(0);
    expect(auditRows(fake)).toHaveLength(0);
  });

  it("with no client it degrades to a live no-op, never a throw", () => {
    setSupabaseClientForTests(null);
    const detach = observeAuthSession(() => {});
    expect(() => detach()).not.toThrow();
  });
});

describe("§68 audit hygiene", () => {
  it("no recorded auth payload contains token-shaped material, an email or a credential key", async () => {
    const fake = makeFake();
    install(fake);

    const detach = observeAuthSession(() => {});
    fake.emit("SIGNED_IN");
    await signOutSession();
    detach();

    const rows = auditRows(fake);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const row of rows) {
      expect(Object.keys(row.args).sort()).toEqual(["p_event", "p_result"]);
      expect(AUTH_EVENTS).toContain(row.args.p_event);
      expect(AUTH_RESULTS).toContain(row.args.p_result);
      const json = JSON.stringify(row.args).toLowerCase();
      expect(json).not.toContain("eyJ"); // the JWT-shaped filler never travelled
      expect(json).not.toContain(EMAIL.toLowerCase());
      expect(json).not.toContain("token");
      expect(json).not.toContain("secret");
    }
  });
});

describe("account-standing refusal surfacing", () => {
  it("NIVAAS_ACCOUNT_SUSPENDED yields human copy and a store-recognisable state", () => {
    const error = toDoorError({ message: "NIVAAS_ACCOUNT_SUSPENDED" });

    // Category per §39: a standing refusal is 403, not a lost session.
    expect(error.code).toBe("PERMISSION_DENIED");
    // The exact raised token is preserved for the store's access-lost check.
    expect(tokenOf(error)).toBe("NIVAAS_ACCOUNT_SUSPENDED");
    expect(accessLostReason(tokenOf(error))).toBe("ACCOUNT_SUSPENDED");

    const copy = denialCopy("ACCOUNT_SUSPENDED");
    expect(copy).toBe("Your account has been suspended. Contact your administrator.");
    // Neither the public message nor the denial copy carries a token or a permission key.
    const publicCopy = `${error.message} ${copy}`;
    expect(publicCopy).not.toMatch(/NIVAAS_/);
    expect(publicCopy).not.toMatch(/\b[a-z_]+\.[a-z_]+\b/);
  });

  it("an unseen account standing still resolves to the family's generic sentence", () => {
    const error = toDoorError({ message: "NIVAAS_ACCOUNT_LOCKEDOUT" });
    expect(error.code).toBe("PERMISSION_DENIED");
    expect(tokenOf(error)).toBe("NIVAAS_ACCOUNT_LOCKEDOUT");
    expect(accessLostReason(tokenOf(error))).toBe("ACCOUNT_DEACTIVATED");
  });

  it("a missing profile is RESOURCE_NOT_FOUND and an access-lost reason too", () => {
    const error = toDoorError({ message: "NIVAAS_PROFILE_MISSING" });
    expect(error.code).toBe("RESOURCE_NOT_FOUND");
    expect(accessLostReason(tokenOf(error))).toBe("PROFILE_MISSING");
  });
});
