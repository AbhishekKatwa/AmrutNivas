/**
 * The people module, exercised against a stub transport.
 *
 * Three things are worth proving here and nowhere else: that every write reaches its door
 * under the parameter names the migration actually declares (PostgREST binds by name, so a
 * wrong key is a runtime failure no type can catch); that every read names its tenant,
 * because RLS is the backstop rather than the plan; and that the invitation token survives
 * the row mapper intact, since it exists exactly once in the whole system.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  acceptInvitation,
  cancelInvitation,
  effectiveInvitationStatus,
  invitationIsUsable,
  invitationStatusLabel,
  inviteMember,
  INVITATION_OUTCOME_COPY,
  listInvitations,
  listMembers,
  listPendingInvitations,
  setMemberStatus,
  transferOwnership,
} from "./people-service";
import { setSupabaseClientForTests } from "@/db/client";
import { INVITATION_STATUSES } from "@/domain/identity/types";
import {
  doorParametersMatchTheSchema,
  stubBackend,
  type BackendStub,
  type QueryChain,
} from "@/test-helpers/transport";

const ORG = "a0000000-0000-4000-8000-000000000001";
const OTHER_ORG = "a0000000-0000-4000-8000-000000000009";
const OWNER_USER = "b0000000-0000-4000-8000-000000000001";
const NEW_USER = "b0000000-0000-4000-8000-000000000002";
const OWNER_MEMBERSHIP = "c0000000-0000-4000-8000-000000000001";
const NEW_MEMBERSHIP = "c0000000-0000-4000-8000-000000000002";
const INVITATION = "d0000000-0000-4000-8000-000000000001";
const OTHER_INVITATION = "d0000000-0000-4000-8000-000000000002";
const PROPERTY = "a1000000-0000-4000-8000-000000000001";
const OUTLET = "a2000000-0000-4000-8000-000000000001";
/** 64 hex characters, the shape `encode(gen_random_bytes(32), 'hex')` produces. */
const TOKEN = "9f8e7d6c5b4a39281706f5e4d3c2b1a0".repeat(2);

function membershipRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: OWNER_MEMBERSHIP,
    user_id: OWNER_USER,
    organization_id: ORG,
    status: "ACTIVE",
    is_owner: true,
    joined_at: "2026-02-01T09:00:00Z",
    suspended_at: null,
    removed_at: null,
    version: 3,
    created_at: "2026-02-01T09:00:00Z",
    ...over,
  };
}

function profileRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: OWNER_USER,
    email: "owner@amrut.example",
    full_name: "Rhea Amrut",
    // 008's generated label and 010's activity stamp. `display_name` is never written by a
    // client, and a NULL `last_login_at` is a real answer ("no sign-in recorded"), not a gap.
    display_name: "Rhea Amrut",
    last_login_at: "2026-03-05T08:12:00Z",
    ...over,
  };
}

/** Rows keyed by table, so one stub answers both reads of `listMembers`. */
function backendWithReads(rowsByTable: Record<string, unknown[]>): BackendStub {
  return stubBackend({
    reads: (query: QueryChain) => rowsByTable[query.table] ?? [],
    doors: () => undefined,
  });
}

let stub: BackendStub;

beforeEach(() => {
  stub = stubBackend({ doors: () => undefined });
  setSupabaseClientForTests(stub.client);
});

afterEach(() => setSupabaseClientForTests(undefined));

function stepNames(): readonly (readonly [string, readonly unknown[]])[] {
  return stub.queries[0].steps;
}

describe("listMembers", () => {
  it("reads the tenant's memberships and joins each person in a second query", async () => {
    stub = backendWithReads({
      organization_memberships: [
        membershipRow(),
        membershipRow({
          id: NEW_MEMBERSHIP,
          user_id: NEW_USER,
          status: "INVITED",
          is_owner: false,
          joined_at: null,
          created_at: "2026-03-04T10:00:00Z",
          version: 1,
        }),
      ],
      profiles: [profileRow(), profileRow({ id: NEW_USER, email: "new@amrut.example", full_name: "" })],
    });
    setSupabaseClientForTests(stub.client);

    const members = await listMembers(ORG);

    expect(stepNames()).toContainEqual(["eq", ["organization_id", ORG]]);
    // Newest addition first, with the id as the tie-break (§ every feed reads newest-first).
    expect(stepNames()).toContainEqual(["order", ["created_at", { ascending: false }]]);
    expect(stepNames()).toContainEqual(["order", ["id", { ascending: false }]]);

    // The second read is scoped to the ids the first returned: a person row has no
    // tenant column at all (§16), so the membership ids ARE the tenant boundary here.
    expect(stub.queries[1].table).toBe("profiles");
    expect(stub.queries[1].steps).toContainEqual(["in", ["id", [OWNER_USER, NEW_USER]]]);

    expect(members).toHaveLength(2);
    expect(members[0]).toEqual({
      id: OWNER_MEMBERSHIP,
      userId: OWNER_USER,
      organizationId: ORG,
      status: "ACTIVE",
      isOwner: true,
      joinedAt: "2026-02-01T09:00:00Z",
      suspendedAt: null,
      removedAt: null,
      version: 3,
      member: {
        id: OWNER_USER,
        email: "owner@amrut.example",
        fullName: "Rhea Amrut",
        displayName: "Rhea Amrut",
        lastLoginAt: "2026-03-05T08:12:00Z",
      },
    });
    // A pending membership has no `joined_at` in 002, and the domain reports that NULL
    // rather than the seat's creation date — the person has not joined yet.
    expect(members[1].joinedAt).toBeNull();
    expect(members[1].member?.email).toBe("new@amrut.example");
  });

  it("brings Last activity and the generated name into the roster (§64)", async () => {
    // §64 asks the Team screen for "Last activity", and 008 gives it a profile column rather
    // than a membership one. A NULL has to stay NULL: it means "no sign-in has been recorded",
    // which is a different fact from "signed in at the seat's creation time".
    stub = backendWithReads({
      organization_memberships: [membershipRow()],
      profiles: [profileRow({ last_login_at: null, display_name: "owner" })],
    });
    setSupabaseClientForTests(stub.client);

    const [member] = await listMembers(ORG);

    expect(stub.queries[1].columns).toContain("last_login_at");
    expect(stub.queries[1].columns).toContain("display_name");
    expect(stub.queries[1].columns).not.toContain("*");
    expect(member?.member).toEqual({
      id: OWNER_USER,
      email: "owner@amrut.example",
      fullName: "Rhea Amrut",
      displayName: "owner",
      lastLoginAt: null,
    });
  });

  it("returns rows for a real roster rather than only proving the filter", async () => {
    stub = backendWithReads({
      organization_memberships: [membershipRow()],
      profiles: [profileRow()],
    });
    setSupabaseClientForTests(stub.client);
    await expect(listMembers(ORG)).resolves.toHaveLength(1);
  });

  it("asks for no person rows when the tenant has no memberships", async () => {
    stub = backendWithReads({ organization_memberships: [], profiles: [] });
    setSupabaseClientForTests(stub.client);

    await expect(listMembers(ORG)).resolves.toEqual([]);
    expect(stub.queries.map((query) => query.table)).toEqual(["organization_memberships"]);
  });

  it("never selects a membership's columns as `*`", async () => {
    stub = backendWithReads({ organization_memberships: [], profiles: [] });
    setSupabaseClientForTests(stub.client);
    await listMembers(ORG);
    expect(stub.queries[0].columns).toContain("is_owner");
    expect(stub.queries[0].columns).not.toContain("*");
  });
});

describe("listPendingInvitations", () => {
  const pending = {
    id: INVITATION,
    organization_id: ORG,
    email: "chef@amrut.example",
    phone: null,
    full_name: "Ilya Chef",
    role_id: "e0000000-0000-4000-8000-000000000001",
    property_ids: [PROPERTY],
    outlet_ids: [OUTLET],
    status: "INVITED",
    invited_by: OWNER_USER,
    expires_at: "2026-03-20T00:00:00Z",
    accepted_at: null,
    accepted_by: null,
    created_at: "2026-03-06T00:00:00Z",
    updated_at: "2026-03-06T00:00:00Z",
  };

  it("filters on the tenant and on INVITED, newest first", async () => {
    stub = backendWithReads({ invitations: [pending] });
    setSupabaseClientForTests(stub.client);

    const found = await listPendingInvitations(ORG);

    expect(stepNames()).toContainEqual(["eq", ["organization_id", ORG]]);
    // Narrowed through `in` rather than `eq`: `listPendingInvitations` is the one-status case
    // of `listInvitations`, and the assertion has to follow the filter the read really sends.
    expect(stepNames()).toContainEqual(["in", ["status", ["INVITED"]]]);
    expect(stepNames()).toContainEqual(["order", ["created_at", { ascending: false }]]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      id: INVITATION,
      organizationId: ORG,
      status: "INVITED",
      propertyIds: [PROPERTY],
      outletIds: [OUTLET],
      invitedBy: OWNER_USER,
      acceptedBy: null,
    });
  });

  it("does not read the token digest out of the table", async () => {
    // The column exists in 002 and is the only credential on the row. A listing screen has
    // no use for it, and one `*` would put it in a bundle.
    stub = backendWithReads({ invitations: [pending] });
    setSupabaseClientForTests(stub.client);

    const found = await listPendingInvitations(ORG);

    expect(stub.queries[0].columns).not.toContain("token_hash");
    expect(Object.keys(found[0]!)).not.toContain("tokenHash");
  });
});

describe("listInvitations — the whole §66 lifecycle", () => {
  const row = (status: string, id: string, extra: Record<string, unknown> = {}) => ({
    id,
    organization_id: ORG,
    email: `${status.toLowerCase()}-${id.slice(-4)}@amrut.example`,
    phone: null,
    full_name: null,
    role_id: "e0000000-0000-4000-8000-000000000001",
    property_ids: [],
    outlet_ids: [],
    status,
    invited_by: OWNER_USER,
    expires_at: "2026-03-20T00:00:00Z",
    accepted_at: null,
    accepted_by: null,
    created_at: "2026-03-06T00:00:00Z",
    updated_at: "2026-03-06T00:00:00Z",
    ...extra,
  });

  it("asks the database for every status when none is named", async () => {
    stub = backendWithReads({ invitations: [] });
    setSupabaseClientForTests(stub.client);

    await listInvitations(ORG);

    // No status filter at all: an operator reading the lifecycle needs the closed rows too,
    // and a silent `eq(status, INVITED)` here is how "Accepted" and "Revoked" go missing.
    expect(stepNames()).toContainEqual(["eq", ["organization_id", ORG]]);
    expect(
      stepNames().some(([method, args]) => method === "in" && args[0] === "status"),
    ).toBe(false);
    expect(
      stepNames().some(([method, args]) => method === "eq" && args[0] === "status"),
    ).toBe(false);
  });

  it("filters on the statuses it is given, including the terminal ones", async () => {
    stub = backendWithReads({
      invitations: [row("CANCELLED", INVITATION), row("REVOKED", OTHER_INVITATION)],
    });
    setSupabaseClientForTests(stub.client);

    const found = await listInvitations(ORG, ["CANCELLED", "REVOKED"]);

    expect(stepNames()).toContainEqual(["in", ["status", ["CANCELLED", "REVOKED"]]]);
    expect(found.map((invitation) => invitation.status)).toEqual(["CANCELLED", "REVOKED"]);
  });

  it("returns nothing without querying when asked for no statuses", async () => {
    stub = backendWithReads({ invitations: [row("INVITED", INVITATION)] });
    setSupabaseClientForTests(stub.client);

    const found = await listInvitations(ORG, []);

    expect(found).toEqual([]);
    expect(stub.queries).toHaveLength(0);
  });

  it("keeps token_hash off the wire for the full lifecycle read too", async () => {
    stub = backendWithReads({ invitations: [] });
    setSupabaseClientForTests(stub.client);

    await listInvitations(ORG);

    expect(stub.queries[0].columns).not.toContain("token_hash");
    expect(stub.queries[0].columns).toContain("expires_at");
  });
});

describe("the §66 invitation lifecycle, computed rather than asserted", () => {
  const DAY = "2026-03-20T00:00:00Z";
  const before = new Date("2026-03-19T00:00:00Z");
  const after = new Date("2026-03-21T00:00:00Z");

  it("treats a lapsed INVITED row as EXPIRED, which is what the next sweep will do to it", () => {
    // 012 sweeps expiry; it is not a trigger. Between sweeps the STORED status is a lie about
    // whether the link works, and a screen that renders the stored value invites an operator
    // to send someone a link the door will refuse with NIVAAS_INVITATION_EXPIRED.
    expect(invitationIsUsable({ status: "INVITED", expiresAt: DAY }, before)).toBe(true);
    expect(invitationIsUsable({ status: "INVITED", expiresAt: DAY }, after)).toBe(false);
    expect(effectiveInvitationStatus({ status: "INVITED", expiresAt: DAY }, before)).toBe(
      "INVITED",
    );
    expect(effectiveInvitationStatus({ status: "INVITED", expiresAt: DAY }, after)).toBe(
      "EXPIRED",
    );
  });

  it("leaves every closed status exactly as stored — expiry cannot re-open an accepted seat", () => {
    for (const status of ["ACCEPTED", "EXPIRED", "CANCELLED", "REVOKED"] as const) {
      expect(effectiveInvitationStatus({ status, expiresAt: DAY }, after)).toBe(status);
      expect(invitationIsUsable({ status, expiresAt: DAY }, before)).toBe(false);
    }
  });

  it("says something different about a cancellation and a revocation, because they are", () => {
    // §66's requirement in one assertion: these two rows must not render identically.
    expect(INVITATION_OUTCOME_COPY.CANCELLED).not.toBe(INVITATION_OUTCOME_COPY.REVOKED);
    expect(INVITATION_OUTCOME_COPY.CANCELLED).toMatch(/person who sent it/i);
    expect(INVITATION_OUTCOME_COPY.REVOKED).toMatch(/another administrator/i);
  });

  it("names every status in the vocabulary and no internal token in any sentence", () => {
    // The copy is operator-facing, so a `NIVAAS_*` string reaching it would leak an internal
    // code into a screen — the same rule `door-errors` and `authorize.test.ts` enforce.
    expect(Object.keys(INVITATION_OUTCOME_COPY).sort()).toEqual(
      [...INVITATION_STATUSES].sort(),
    );
    for (const sentence of Object.values(INVITATION_OUTCOME_COPY)) {
      expect(sentence).not.toMatch(/NIVAAS_/);
      expect(sentence.length).toBeGreaterThan(10);
    }
    expect(invitationStatusLabel("INVITED")).toBe("Pending");
    expect(invitationStatusLabel("REVOKED")).toBe("Revoked");
  });

  it("survives a malformed expiry instead of rendering NaN", () => {
    // A garbage timestamp must not turn an open invitation into a lapsed one by accident.
    expect(invitationIsUsable({ status: "INVITED", expiresAt: "not a date" }, after)).toBe(true);
    expect(effectiveInvitationStatus({ status: "INVITED", expiresAt: "" }, after)).toBe("INVITED");
  });
});

describe("inviteMember", () => {
  it("sends the door's own parameter names and echoes the token back once", async () => {
    stub = stubBackend({
      doors: (name) =>
        name === "invite_member"
          ? {
              data: {
                invitationId: INVITATION,
                token: TOKEN,
                role: "PROPERTY_MANAGER",
                scope: "PROPERTY",
                expiresAt: "2026-03-20T00:00:00Z",
              },
            }
          : undefined,
    });
    setSupabaseClientForTests(stub.client);

    const issued = await inviteMember({
      organizationId: ORG,
      email: "chef@amrut.example",
      role: "property_manager",
      fullName: "Ilya Chef",
      phone: "+919820000000",
      propertyIds: [PROPERTY],
      outletIds: [OUTLET],
      validDays: 30,
    });

    expect(stub.calls).toEqual([
      {
        name: "invite_member",
        args: {
          p_organization: ORG,
          p_email: "chef@amrut.example",
          p_role: "property_manager",
          p_full_name: "Ilya Chef",
          p_phone: "+919820000000",
          p_property_ids: [PROPERTY],
          p_outlet_ids: [OUTLET],
          p_valid_days: 30,
        },
      },
    ]);
    expect(() => doorParametersMatchTheSchema("invite_member", stub.argsFor("invite_member"))).not.toThrow();

    // The door builds its answer in camelCase already; the mapper must leave it alone and
    // the token must survive both hops, because nothing can produce it a second time.
    expect(issued.token).toHaveLength(64);
    expect(issued.token).toMatch(/^[0-9a-f]{64}$/);
    // Exactly the door's payload — no `email`, no `organizationId`, no scope arrays:
    // `invite_member`'s `return` builds these five keys and nothing a screen may trust.
    expect(issued).toEqual({
      invitationId: INVITATION,
      token: TOKEN,
      role: "PROPERTY_MANAGER",
      scope: "PROPERTY",
      expiresAt: "2026-03-20T00:00:00Z",
    });
  });

  it("drops what the caller omitted so the door's defaults apply", async () => {
    stub = stubBackend({
      doors: () => ({
        data: {
          invitationId: INVITATION,
          token: TOKEN,
          role: "OWNER",
          scope: "ORGANIZATION",
          expiresAt: "x",
        },
      }),
    });
    setSupabaseClientForTests(stub.client);

    const issued = await inviteMember({ organizationId: ORG, email: "a@b.co", role: "owner" });

    expect(stub.argsFor("invite_member")).toEqual({
      p_organization: ORG,
      p_email: "a@b.co",
      p_role: "owner",
    });
    // Omitted scope arrays mean "none", and the door's `default '{}'` is what stores that.
    expect(issued).toEqual({
      invitationId: INVITATION,
      token: TOKEN,
      role: "OWNER",
      scope: "ORGANIZATION",
      expiresAt: "x",
    });
  });

  it("sends an explicit null rather than dropping it", async () => {
    // `undefined` means "not supplied" and lets the door's default win; `null` means
    // "store nothing in this column". Collapsing them would lose an operator's edit.
    stub = stubBackend({
      doors: () => ({ data: { invitationId: INVITATION, token: TOKEN, role: "OWNER", expiresAt: "x" } }),
    });
    setSupabaseClientForTests(stub.client);

    await inviteMember({
      organizationId: ORG,
      email: "a@b.co",
      role: "owner",
      fullName: null,
      phone: null,
    });

    expect(stub.argsFor("invite_member")).toEqual({
      p_organization: ORG,
      p_email: "a@b.co",
      p_role: "owner",
      p_full_name: null,
      p_phone: null,
    });
  });
});

describe("cancelInvitation", () => {
  it("sends the invitation id and the mandatory reason", async () => {
    stub = stubBackend({
      doors: () => ({ data: { invitationId: INVITATION, status: "CANCELLED" } }),
    });
    setSupabaseClientForTests(stub.client);

    await expect(cancelInvitation(INVITATION, "wrong address typed in")).resolves.toEqual({
      invitationId: INVITATION,
      status: "CANCELLED",
    });
    expect(stub.argsFor("cancel_invitation")).toEqual({
      p_invitation: INVITATION,
      p_reason: "wrong address typed in",
    });
    // `publicDoorSignatures` reads one identifier per line, so this door — declared on a
    // single line as `cancel_invitation(p_invitation uuid, p_reason text)` — yields only
    // `p_invitation` to the schema comparison. `p_reason` is pinned by the exact-args
    // assertion above, and the helper's limitation is reported instead of patched here.
    expect(() => doorParametersMatchTheSchema("cancel_invitation", { p_invitation: INVITATION })).not.toThrow();
  });
});

describe("acceptInvitation", () => {
  // CONTRACT-ONLY: this flow has never been run end to end. `accept_invitation` needs a
  // session whose own address is the invited one (§78), and Prompt #03 owns real sign-up,
  // so nothing below claims the membership, breadth or grants the door creates actually
  // happened. What is proved is the wire contract: one parameter, named `p_token`.
  it("passes the plaintext token as the door's single parameter", async () => {
    stub = stubBackend({
      doors: () => ({ data: { organizationId: ORG, role: "CHEF", scope: "OUTLET" } }),
    });
    setSupabaseClientForTests(stub.client);

    const accepted = await acceptInvitation(TOKEN);

    expect(stub.calls).toEqual([{ name: "accept_invitation", args: { p_token: TOKEN } }]);
    expect(() => doorParametersMatchTheSchema("accept_invitation", stub.argsFor("accept_invitation"))).not.toThrow();
    expect(accepted).toEqual({ organizationId: ORG, role: "CHEF", scope: "OUTLET" });
  });
});

describe("setMemberStatus", () => {
  it("carries the suspension reason all the way to the door", async () => {
    stub = stubBackend({
      doors: () => ({ data: { membershipId: NEW_MEMBERSHIP, status: "SUSPENDED" } }),
    });
    setSupabaseClientForTests(stub.client);

    await expect(setMemberStatus(NEW_MEMBERSHIP, "SUSPENDED", "pending HR investigation")).resolves.toEqual({
      membershipId: NEW_MEMBERSHIP,
      status: "SUSPENDED",
    });
    expect(stub.argsFor("set_member_status")).toEqual({
      p_membership: NEW_MEMBERSHIP,
      p_status: "SUSPENDED",
      p_reason: "pending HR investigation",
    });
    expect(() => doorParametersMatchTheSchema("set_member_status", stub.argsFor("set_member_status"))).not.toThrow();
  });

  it("restores with the same three parameters", async () => {
    // The door only stamps `ACTIVE`; re-granting the revoked roles is a separate call, and
    // no parameter here can be mistaken for "put the grants back".
    stub = stubBackend({ doors: () => ({ data: { membershipId: NEW_MEMBERSHIP, status: "ACTIVE" } }) });
    setSupabaseClientForTests(stub.client);

    await setMemberStatus(NEW_MEMBERSHIP, "ACTIVE", "cleared by HR");
    expect(stub.argsFor("set_member_status")).toEqual({
      p_membership: NEW_MEMBERSHIP,
      p_status: "ACTIVE",
      p_reason: "cleared by HR",
    });
    expect(stub.calls).toHaveLength(1);
  });
});

describe("transferOwnership", () => {
  it("names the target by MEMBERSHIP id, which is what the door takes", async () => {
    stub = stubBackend({
      doors: () => ({
        data: { organizationId: ORG, previousOwner: OWNER_USER, newMemberId: NEW_MEMBERSHIP },
      }),
    });
    setSupabaseClientForTests(stub.client);

    const moved = await transferOwnership(ORG, NEW_MEMBERSHIP, "founder stepping back");

    expect(stub.argsFor("transfer_ownership")).toEqual({
      p_organization: ORG,
      p_to_membership: NEW_MEMBERSHIP,
      p_reason: "founder stepping back",
    });
    expect(() =>
      doorParametersMatchTheSchema("transfer_ownership", stub.argsFor("transfer_ownership")),
    ).not.toThrow();
    expect(moved).toEqual({
      organizationId: ORG,
      previousOwner: OWNER_USER,
      newMemberId: NEW_MEMBERSHIP,
    });
  });

  it("keeps the tenant it is acting on separate from the seat it moves", async () => {
    // `p_organization` is the tenant whose owner row is cleared; `p_to_membership` is the
    // seat inside it. The door refuses the pair with `NIVAAS_NOT_FOUND` when they disagree,
    // and a target that is not ACTIVE with `NIVAAS_MEMBER_NOT_ACTIVE`.
    stub = stubBackend({
      doors: () => ({ data: { organizationId: ORG, previousOwner: OWNER_USER, newMemberId: NEW_MEMBERSHIP } }),
    });
    setSupabaseClientForTests(stub.client);

    await transferOwnership(ORG, OWNER_MEMBERSHIP, "confirming the current owner");
    const sent = stub.argsFor("transfer_ownership");
    expect(sent.p_organization).toBe(ORG);
    expect(sent.p_organization).not.toBe(OTHER_ORG);
    expect(sent.p_to_membership).toBe(OWNER_MEMBERSHIP);
  });
});

describe("write paths", () => {
  it("never touches a table builder — every change is a door call", async () => {
    // The stub throws on `.insert/.update/.delete/.upsert`, so this is a real guard rather
    // than a comment: `authenticated` holds SELECT only and this client must not imply
    // otherwise.
    stub = stubBackend({
      doors: () => ({ data: { invitationId: INVITATION, token: TOKEN, role: "OWNER", expiresAt: "x" } }),
      reads: () => [],
    });
    setSupabaseClientForTests(stub.client);

    await inviteMember({ organizationId: ORG, email: "a@b.co", role: "owner" });
    await listPendingInvitations(ORG);

    expect(stub.calls).toHaveLength(1);
    expect(stub.queries.map((query) => query.table)).toEqual(["invitations"]);
  });
});
