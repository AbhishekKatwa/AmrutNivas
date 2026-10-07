/**
 * Prompt #03 §48/§49 — the named security test matrix, client half.
 *
 * §49 lists ten case names; every `it` below carries one verbatim so the matrix is
 * auditable against the prompt. The behaviours were already covered piecemeal in
 * `authorize.test.ts`, `custom-role-service.test.ts` and `context-store.test.ts` —
 * this file is the one traceable index, not a rewrite of those.
 *
 * Environment note: vitest runs in `node` with no jsdom, so these exercise pure
 * functions and direct store transitions — never a rendered screen or an auth event.
 *
 * Honest split of the ten (rule: never assert in JS a guarantee the JS does not
 * implement):
 *   - Client-tested end to end: cases 1-6 and 10 (`authorize()` ladder,
 *     `grantablePermissions()` subset rule, tenant-cache scope gating, and real
 *     `useContextStore` transitions against the stub transport).
 *   - Enforcement is in the database and `db/verify/tenant_isolation.sql` proves the
 *     scenario: case 7 (scenario 11h, lines ~1116-1160 — `NIVAAS_OWNER_MUST_TRANSFER`
 *     refuses removing/suspending the last owner, even for the platform operator),
 *     case 8 (scenario 11f, lines ~1076-1082 — the `role_assigned` SUCCESS row
 *     carries the actor ceiling), case 9 (scenario 12, lines ~1171-1234 — the
 *     `access_denied` DENIED rows carry the reason and never a stranger tenant's id).
 *     Each of those still asserts the client-side half that truly exists — the door
 *     path with its mandatory reason, and the outcome/copy layering in
 *     `@/lib/audit` and `denialCopy()` — and points at the SQL scenario by name.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { authorize, denialCopy, type AccessFacts } from "./authorize";
import { grantablePermissions } from "./custom-role-service";
import { accessDenialCopy, evaluateAccess } from "./session-service";
import { setMemberStatus } from "./people-service";
import { assignRole } from "./role-service";
import { isPermissionKey, PERMISSION_KEYS } from "@/domain/identity/permissions";
import { INTERNAL_ERROR_TOKEN_PREFIX } from "@/config/security";
import { AUDIT_RESULTS, auditOutcomeIsAdverse, auditResultOf } from "@/lib/audit";
import type { ActiveContext, Permission } from "@/domain/identity/types";
import { resetForTests, useContextStore } from "@/state/context-store";
import { activateScope, peek, read, scopeFor, write } from "@/state/tenant-cache";
import { setSupabaseClientForTests } from "@/db/client";
import { doorParametersMatchTheSchema, stubDoors, type BackendStub } from "@/test-helpers/transport";

const ORG_A = "a0000000-0000-4000-8000-00000000000a";
const ORG_B = "a0000000-0000-4000-8000-00000000000b";
const PROP_A = "b0000000-0000-4000-8000-000000000001";
const PROP_B = "b0000000-0000-4000-8000-000000000002";
const OUTLET_A = "a2000000-0000-4000-8000-000000000001";
const OUTLET_B = "a2000000-0000-4000-8000-000000000002";
const USER_ID = "00000000-0000-4000-8000-000000000001";
const OWNER_MEMBERSHIP = "d0000000-0000-4000-8000-000000000001";
const MEMBER_ID = "d0000000-0000-4000-8000-000000000002";
const GRANT_ID = "e1000000-0000-4000-8000-000000000001";

let stub: BackendStub;

beforeEach(() => {
  // Store + tenant cache pristine, and a recording client installed so the
  // door-path cases never reach a real network seam.
  resetForTests();
  stub = stubDoors(() => undefined);
  setSupabaseClientForTests(stub.client);
});

afterEach(() => setSupabaseClientForTests(undefined));

/**
 * Every question 010's ladder asks is answered YES — the way `authorize.test.ts`
 * builds it — and each case flips exactly the fact under test. Reachability flags
 * are true here because a refused-site case must show the breadth rung itself
 * denying, not a default-false artefact.
 */
function facts(overrides: Partial<AccessFacts> = {}): AccessFacts {
  return {
    signedIn: true,
    profileExists: true,
    accountStanding: "ACTIVE",
    membershipStatus: "ACTIVE",
    organizationStatus: "ACTIVE",
    propertyRequested: null,
    propertyReachable: true,
    outletRequested: null,
    outletReachable: true,
    permissionRequested: "property.view",
    permissionHeld: true,
    ...overrides,
  };
}

/** Copy a person could see must carry no door token, no reason code, no permission key. */
function expectPresentableCopy(copy: string, reason: string): void {
  expect(copy.trim().length).toBeGreaterThan(0);
  expect(copy).not.toContain(INTERNAL_ERROR_TOKEN_PREFIX);
  expect(copy).not.toContain(reason);
  for (const key of PERMISSION_KEYS) expect(copy).not.toContain(key);
}

describe("§49 security test matrix — client half", () => {
  it("shouldRejectCrossTenantAccess()", () => {
    // A stale local permission set says yes, a stranger's property id is probed, and
    // the stranger's tenant itself is healthy: the membership rung answers first, with
    // the person's own cause, and nothing about Org B is confirmed (§18/§40).
    expect(
      authorize(
        facts({
          membershipStatus: null,
          propertyRequested: PROP_B,
          permissionRequested: "property.create",
        }),
      ),
    ).toEqual({ allowed: false, reason: "NO_ACTIVE_MEMBERSHIP" });
    const copy = denialCopy("NO_ACTIVE_MEMBERSHIP");
    expectPresentableCopy(copy, "NO_ACTIVE_MEMBERSHIP");

    // Same shape, own ACTIVE membership, own reachable property: allowed.
    expect(
      authorize(facts({ propertyRequested: PROP_A, permissionRequested: "property.create" })),
    ).toEqual({ allowed: true });

    // Cache isolation (§48): rows fetched under Org A are not served once the active
    // scope has moved to Org B — a hard miss, never a stale hit.
    const scopeA = scopeFor({ organizationId: ORG_A, propertyId: null, outletId: null });
    const scopeB = scopeFor({ organizationId: ORG_B, propertyId: null, outletId: null });
    expect(scopeA).not.toBe(scopeB);
    activateScope(scopeA);
    write(scopeA, "reservations", ["Org A rows"]);
    activateScope(scopeB);
    expect(read(scopeA, "reservations")).toBeUndefined();
    // Positive direction: back under A's own scope the rows serve again — the gate
    // refuses cross-tenant reads, not reads.
    activateScope(scopeA);
    expect(read(scopeA, "reservations")).toEqual(["Org A rows"]);
  });

  it("shouldRejectUnauthorizedPropertyAccess()", () => {
    // Property B with everything else healthy, and a held capability on the books:
    // the breadth rung denies with its own code, before the permission is ever asked.
    expect(
      authorize(
        facts({ propertyRequested: PROP_B, propertyReachable: false, permissionRequested: "property.edit" }),
      ),
    ).toEqual({ allowed: false, reason: "PROPERTY_ACCESS_DENIED" });
    expectPresentableCopy(denialCopy("PROPERTY_ACCESS_DENIED"), "PROPERTY_ACCESS_DENIED");

    // Same request against a property the person can reach: allowed.
    expect(authorize(facts({ propertyRequested: PROP_A, permissionRequested: "property.edit" }))).toEqual(
      { allowed: true },
    );
  });

  it("shouldRejectUnauthorizedOutletAccess()", () => {
    // The property is reachable (so this is not the property rung) and the capability
    // is held; only the outlet is outside the person's breadth.
    expect(
      authorize(
        facts({
          propertyRequested: PROP_A,
          outletRequested: OUTLET_B,
          outletReachable: false,
          permissionRequested: "outlet.view",
        }),
      ),
    ).toEqual({ allowed: false, reason: "OUTLET_ACCESS_DENIED" });
    expectPresentableCopy(denialCopy("OUTLET_ACCESS_DENIED"), "OUTLET_ACCESS_DENIED");

    expect(
      authorize(facts({ propertyRequested: PROP_A, outletRequested: OUTLET_A, permissionRequested: "outlet.view" })),
    ).toEqual({ allowed: true });
  });

  it("shouldRejectRemovedMembership()", () => {
    // 008's `app.member_of` counts exactly an ACTIVE membership: REMOVED is refused
    // even while cached grant rows still claim the capability, and the reason names
    // the membership cause, never a permission.
    expect(
      authorize(facts({ membershipStatus: "REMOVED", permissionRequested: "user.remove" })),
    ).toEqual({ allowed: false, reason: "NO_ACTIVE_MEMBERSHIP" });

    // Positive direction: the same seat while ACTIVE passes the same probe.
    expect(authorize(facts({ membershipStatus: "ACTIVE", permissionRequested: "user.remove" }))).toEqual(
      { allowed: true },
    );
  });

  it("shouldRejectSuspendedMembership()", () => {
    // The two suspensions are different facts with different codes (§48 lists both):
    // a suspended seat inside one tenant, and a suspended account everywhere.
    expect(authorize(facts({ membershipStatus: "SUSPENDED" }))).toEqual({
      allowed: false,
      reason: "NO_ACTIVE_MEMBERSHIP",
    });
    expect(authorize(facts({ accountStanding: "SUSPENDED", membershipStatus: "ACTIVE" }))).toEqual({
      allowed: false,
      reason: "ACCOUNT_SUSPENDED",
    });
    // An INVITED seat has not joined yet — the same membership refusal, and the only
    // membership status that lets the ladder continue is ACTIVE.
    expect(authorize(facts({ membershipStatus: "INVITED" }))).toEqual({
      allowed: false,
      reason: "NO_ACTIVE_MEMBERSHIP",
    });
    expectPresentableCopy(denialCopy("ACCOUNT_SUSPENDED"), "ACCOUNT_SUSPENDED");

    expect(authorize(facts({ membershipStatus: "ACTIVE", accountStanding: "ACTIVE" }))).toEqual({
      allowed: true,
    });
  });

  it("shouldPreventPrivilegeEscalation()", () => {
    // Ladder half: everything healthy, but no live grant carries `role.assign` — the
    // answer is the permission rung, not an approval.
    expect(authorize(facts({ permissionRequested: "role.assign", permissionHeld: false }))).toEqual({
      allowed: false,
      reason: "PERMISSION_DENIED",
    });
    expect(authorize(facts({ permissionRequested: "role.assign", permissionHeld: true }))).toEqual({
      allowed: true,
    });

    // Subset-rule half (`grantablePermissions`, the client mirror of 011's ceiling):
    // a role creator can only ever see capabilities they already hold.
    const held: Permission[] = ["organization.view", "user.view", "role.create"];
    const wanted: Permission[] = ["role.create", "role.assign", "user.remove", "platform.manage", "user.view"];
    expect(grantablePermissions(held, wanted)).toEqual(["role.create", "user.view"]);
    for (const offered of grantablePermissions(held, wanted)) {
      expect(isPermissionKey(offered)).toBe(true);
    }
    // Positive direction: a wanted set inside the holder's own set passes whole, in
    // wanted order — the rule filters escalation, not legitimate grants.
    expect(grantablePermissions(held, ["role.create", "organization.view"])).toEqual([
      "role.create",
      "organization.view",
    ]);
    // A well-shaped key the catalogue has never heard of is not grantable either.
    expect(isPermissionKey("role.grant_everything")).toBe(false);
  });

  it("shouldPreventRemovingLastOwner()", async () => {
    // The guard itself is a database fact: scenario 11h of
    // `db/verify/tenant_isolation.sql` (lines ~1116-1160) refuses REMOVING and
    // SUSPENDING the last owner — `NIVAAS_OWNER_MUST_TRANSFER`, even for the
    // platform operator — and `NIVAAS_SELF_NOT_ALLOWED` for the owner acting on
    // themselves. No JS mirrors that arithmetic, and none may pretend to.
    //
    // What this file can and does prove is why the client cannot bypass the guard:
    // the only client path that changes a seat is the guarded door itself, sent with
    // the parameter names PostgREST resolves and the mandatory audit reason. A
    // membership table write is not a path that exists.
    stub = stubDoors((name) =>
      name === "set_member_status"
        ? { data: { membershipId: OWNER_MEMBERSHIP, status: "REMOVED" } }
        : undefined,
    );
    setSupabaseClientForTests(stub.client);

    await setMemberStatus(OWNER_MEMBERSHIP, "REMOVED", "seat vacated after transfer");
    expect(stub.calls.map((call) => call.name)).toEqual(["set_member_status"]);
    const sent = stub.argsFor("set_member_status");
    expect(sent).toEqual({
      p_membership: OWNER_MEMBERSHIP,
      p_status: "REMOVED",
      p_reason: "seat vacated after transfer",
    });
    expect(() => doorParametersMatchTheSchema("set_member_status", sent)).not.toThrow();

    // Positive direction: the same door serves a legitimate restore, so the path is
    // a door binding rather than a dead end papering over the guard.
    await setMemberStatus(MEMBER_ID, "ACTIVE", "returning colleague restored");
    expect(stub.argsFor("set_member_status", 1)).toEqual({
      p_membership: MEMBER_ID,
      p_status: "ACTIVE",
      p_reason: "returning colleague restored",
    });

    // And once the database has actually removed a seat, the client's own ladder
    // refuses the ex-member's stale grants with the membership code.
    expect(
      authorize(facts({ membershipStatus: "REMOVED", permissionRequested: "user.remove" })),
    ).toEqual({ allowed: false, reason: "NO_ACTIVE_MEMBERSHIP" });
  });

  it("shouldAuditRoleAssignment()", async () => {
    // The SUCCESS row is written inside `assign_role`'s own transaction: scenario 11f
    // of `db/verify/tenant_isolation.sql` (lines ~1076-1082) asserts the
    // `role_assigned` audit row exists with the actor ceiling in its metadata. The
    // client does not write audits and must not claim to (`@/lib/audit` has no writer
    // on purpose). The client-side halves that are real:
    //   1. the assignment reaches the auditing door carrying its reason, with the
    //      parameter names the migration declares — the inputs the audit row is built
    //      from;
    //   2. the read-side outcome layering: `AUDIT_COLUMNS` does not yet project
    //      `result`, so `auditResultOf()` must apply 010's column default.
    stub = stubDoors((name) =>
      name === "assign_role"
        ? { data: { grantId: GRANT_ID, role: "STAFF", scope: "ORGANIZATION" } }
        : undefined,
    );
    setSupabaseClientForTests(stub.client);

    const assignment = await assignRole({
      userId: USER_ID,
      role: "STAFF",
      organizationId: ORG_A,
      reason: "Back-desk cover for the night shift",
    });
    expect(assignment).toEqual({ grantId: GRANT_ID, role: "STAFF", scope: "ORGANIZATION" });
    const sent = stub.argsFor("assign_role");
    expect(sent).toEqual({
      p_user: USER_ID,
      p_role: "STAFF",
      p_organization: ORG_A,
      p_property: null,
      p_outlet: null,
      p_reason: "Back-desk cover for the night shift",
    });
    expect(() => doorParametersMatchTheSchema("assign_role", sent)).not.toThrow();

    // Outcome layering, both directions: a role_assigned row without the field is the
    // schema's own default (a success); FAILURE and DENIED are adverse.
    expect(AUDIT_RESULTS).toEqual(["SUCCESS", "FAILURE", "DENIED"]);
    expect(auditResultOf({})).toBe("SUCCESS");
    expect(auditOutcomeIsAdverse({})).toBe(false);
    expect(auditResultOf({ result: "SUCCESS" })).toBe("SUCCESS");
    expect(auditOutcomeIsAdverse({ result: "SUCCESS" })).toBe(false);
    expect(auditResultOf({ result: "FAILURE" })).toBe("FAILURE");
    expect(auditOutcomeIsAdverse({ result: "FAILURE" })).toBe(true);
  });

  it("shouldAuditAccessDenied()", async () => {
    // The DENIED rows themselves are 010's job: scenario 12 of
    // `db/verify/tenant_isolation.sql` (lines ~1171-1234) proves an allowed
    // evaluation writes no denial (12b) and every refused one is recorded as
    // `access_denied`/DENIED carrying its reason — and never a stranger tenant's id.
    // The client halves that are real: the verdict's reason round-trips through
    // `evaluateAccess()` without leaking into copy, and a DENIED row read back is
    // classified adverse.
    stub = stubDoors((name) =>
      name === "evaluate_access" ? { data: { allowed: false, reason: "PERMISSION_DENIED" } } : undefined,
    );
    setSupabaseClientForTests(stub.client);

    const verdict = await evaluateAccess({ permission: "payment.refund", organizationId: ORG_A });
    expect(verdict).toEqual({ allowed: false, reason: "PERMISSION_DENIED" });
    expect(() => doorParametersMatchTheSchema("evaluate_access", stub.argsFor("evaluate_access"))).not.toThrow();

    const copy = accessDenialCopy(verdict);
    expect(copy).toBe("You don't have permission to perform this action.");
    expectPresentableCopy(copy ?? "", "PERMISSION_DENIED");

    // A DENIED row from history is bad news a reviewer must see.
    expect(auditResultOf({ result: "DENIED" })).toBe("DENIED");
    expect(auditOutcomeIsAdverse({ result: "DENIED" })).toBe(true);

    // Positive direction: the allowed answer reads as allowed, carries no reason, and
    // produces no denial copy at all (and 12b proves the server writes no row).
    stub = stubDoors((name) =>
      name === "evaluate_access" ? { data: { allowed: true, reason: null } } : undefined,
    );
    setSupabaseClientForTests(stub.client);
    const allowed = await evaluateAccess({ permission: "property.create", organizationId: ORG_A });
    expect(allowed).toEqual({ allowed: true, reason: null });
    expect(accessDenialCopy(allowed)).toBeNull();
  });

  it("shouldInvalidateContextAfterMembershipRemoval()", async () => {
    // The client never decides its own context: after a removal, the server's answer
    // is a dropped level, and the store must adopt it — permissions gone, old scope
    // physically reclaimed, and the cleared notice raised (§29).
    const contextA: ActiveContext = {
      signedIn: true,
      organizationId: ORG_A,
      propertyId: PROP_A,
      outletId: null,
      cleared: false,
    };
    useContextStore.setState({
      status: "ready",
      context: contextA,
      permissions: { organizationId: ORG_A, propertyId: PROP_A, outletId: null, permissions: ["property.edit"] },
    });
    const scopeA = scopeFor(contextA);
    activateScope(scopeA);
    write(scopeA, "reservations", ["warm rows from the removed tenant"]);

    // Membership removed in Org A; re-selecting it answers with nothing kept.
    stub = stubDoors((name) => (name === "set_active_context" ? { data: {} } : undefined));
    setSupabaseClientForTests(stub.client);
    await useContextStore.getState().switchContext({ organizationId: ORG_A });

    const state = useContextStore.getState();
    expect(state.context).toEqual({
      signedIn: true,
      organizationId: null,
      propertyId: null,
      outletId: null,
      cleared: true,
    });
    expect(state.permissions).toBeNull();
    expect(state.can("property.edit")).toBe(false);
    expect(state.notices.map((notice) => notice.kind)).toEqual(["context-cleared"]);
    // The removed tenant's cached rows are reclaimed, not merely gated: `peek` — which
    // ignores the active-scope gate — finds nothing to leak back.
    expect(peek(scopeA, "reservations")).toBeUndefined();
    // And no permission was loaded for the tenant that no longer has the person.
    expect(stub.calls.map((call) => call.name)).toEqual(["set_active_context"]);

    // Positive direction: the identical flow with an ACTIVE membership in Org B lands
    // B's server-kept context, reloads grants for B only, and raises no notice.
    resetForTests();
    useContextStore.setState({
      status: "ready",
      context: contextA,
      permissions: { organizationId: ORG_A, propertyId: PROP_A, outletId: null, permissions: ["property.edit"] },
    });
    activateScope(scopeA);
    write(scopeA, "reservations", ["warm"]);
    stub = stubDoors((name) => {
      if (name === "set_active_context") {
        return { data: { signedIn: true, organizationId: ORG_B, propertyId: null, outletId: null } };
      }
      if (name === "my_permissions") return { data: ["organization.view"] };
      return undefined;
    });
    setSupabaseClientForTests(stub.client);

    await useContextStore.getState().switchContext({ organizationId: ORG_B });

    const landed = useContextStore.getState();
    expect(landed.context.organizationId).toBe(ORG_B);
    expect(landed.context.cleared).toBe(false);
    expect(landed.permissions).toEqual({
      organizationId: ORG_B,
      propertyId: null,
      outletId: null,
      permissions: ["organization.view"],
    });
    expect(landed.can("organization.view")).toBe(true);
    expect(landed.can("property.edit")).toBe(false);
    expect(landed.notices).toEqual([]);
    expect(peek(scopeA, "reservations")).toBeUndefined();
    expect(stub.argsFor("my_permissions")).toEqual({ p_organization: ORG_B, p_property: null, p_outlet: null });
  });
});
