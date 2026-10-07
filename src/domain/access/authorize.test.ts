/**
 * The pure ladder against the SQL that owns it.
 *
 * `authorize()` exists so the client pre-flights the same decision
 * `public.evaluate_access` (010) makes. The moment the two disagree, a guard hides
 * a door the server would open — or shows a screen the door refuses — so every
 * reason code, the order they are tested in, and the copy that wraps them are all
 * pinned here, partly against the migration text itself.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  ACCESS_DENIAL_REASONS,
  INTERNAL_ERROR_TOKEN_PREFIX,
  type AccessDenialReason,
} from "@/config/security";
import { PERMISSION_KEYS } from "@/domain/identity/permissions";
import { authorize, denialCopy, type AccessFacts } from "@/domain/access/authorize";

function sqlFile(name: string): string {
  return readFileSync(new URL(`../../../db/supabase/${name}`, import.meta.url), "utf8");
}

const GRANTED = "outlet.view";

/**
 * Everything healthy by default, so each case flips exactly one fact and the
 * assertion says which rung of the ladder caught it. `propertyReachable` and
 * `outletReachable` stay false here on purpose: with no id requested they must be
 * ignored, and the allowed cases below prove they are.
 */
function facts(overrides: Partial<AccessFacts> = {}): AccessFacts {
  return {
    signedIn: true,
    profileExists: true,
    accountStanding: "ACTIVE",
    membershipStatus: "ACTIVE",
    organizationStatus: "ACTIVE",
    propertyRequested: null,
    propertyReachable: false,
    outletRequested: null,
    outletReachable: false,
    permissionRequested: GRANTED,
    permissionHeld: true,
    ...overrides,
  };
}

function denial(overrides: Partial<AccessFacts>): AccessDenialReason {
  const decision = authorize(facts(overrides));
  if (decision.allowed) {
    throw new Error(`expected a denial, got: ${JSON.stringify(decision)}`);
  }
  return decision.reason;
}

describe("the ladder, one rung at a time", () => {
  it("allows a healthy tenant-wide request", () => {
    expect(authorize(facts())).toEqual({ allowed: true });
  });

  it("allows a scoped request when the site and outlet are reachable", () => {
    expect(
      authorize(
        facts({
          propertyRequested: "p-1",
          propertyReachable: true,
          outletRequested: "o-1",
          outletReachable: true,
        }),
      ),
    ).toEqual({ allowed: true });
  });

  it("NOT_AUTHENTICATED for a caller with no session", () => {
    expect(denial({ signedIn: false })).toBe("NOT_AUTHENTICATED");
  });

  it("PROFILE_MISSING when the signup trigger never produced a profile", () => {
    expect(denial({ profileExists: false })).toBe("PROFILE_MISSING");
  });

  it("ACCOUNT_SUSPENDED for a suspended standing", () => {
    expect(denial({ accountStanding: "SUSPENDED" })).toBe("ACCOUNT_SUSPENDED");
  });

  it("ACCOUNT_DEACTIVATED for a deactivated standing", () => {
    expect(denial({ accountStanding: "DEACTIVATED" })).toBe("ACCOUNT_DEACTIVATED");
  });

  it("NO_ACTIVE_MEMBERSHIP when there is no membership row at all", () => {
    expect(denial({ membershipStatus: null })).toBe("NO_ACTIVE_MEMBERSHIP");
  });

  it("ORGANIZATION_NOT_ACTIVE when the tenant is not trading", () => {
    expect(denial({ organizationStatus: "SUSPENDED" })).toBe("ORGANIZATION_NOT_ACTIVE");
  });

  it("PROPERTY_ACCESS_DENIED for a site outside the person's breadth", () => {
    expect(denial({ propertyRequested: "p-3", propertyReachable: false })).toBe(
      "PROPERTY_ACCESS_DENIED",
    );
  });

  it("OUTLET_ACCESS_DENIED for an outlet the person cannot reach", () => {
    expect(
      denial({
        propertyRequested: "p-1",
        propertyReachable: true,
        outletRequested: "o-9",
        outletReachable: false,
      }),
    ).toBe("OUTLET_ACCESS_DENIED");
  });

  it("PERMISSION_DENIED when no live grant carries the capability", () => {
    expect(denial({ permissionHeld: false })).toBe("PERMISSION_DENIED");
  });

  it("refuses a malformed key before answering the security question", () => {
    // 010 tests the key format first, even before the session: a broken literal is
    // a programming error, and the answer must not pretend to be one.
    expect(denial({ permissionRequested: "Organization.View", permissionHeld: true })).toBe(
      "PERMISSION_DENIED",
    );
    expect(denial({ permissionRequested: null })).toBe("PERMISSION_DENIED");
  });
});

describe("precedence — which denial wins", () => {
  it("a suspended account that also lacks the permission hears about the account", () => {
    expect(
      denial({ accountStanding: "SUSPENDED", permissionHeld: false, permissionRequested: "user.remove" }),
    ).toBe("ACCOUNT_SUSPENDED");
  });

  it("a missing profile outranks every later rung", () => {
    expect(
      denial({
        profileExists: false,
        membershipStatus: null,
        organizationStatus: "ARCHIVED",
        permissionHeld: false,
      }),
    ).toBe("PROFILE_MISSING");
  });

  it("shouldRejectCrossTenantAccess", () => {
    // Probing a stranger's tenant with a stale local permission set that happens to
    // say yes: the membership rung answers before the permission question is asked,
    // and the answer does not confirm the tenant exists (§40).
    expect(
      denial({
        membershipStatus: null,
        permissionHeld: true,
        propertyRequested: "p-other",
        propertyReachable: true,
      }),
    ).toBe("NO_ACTIVE_MEMBERSHIP");
  });

  it("membership rung precedes the organization rung", () => {
    // A non-member probing a suspended tenant hears "you are not a member", never a
    // fact about someone else's organization (§18: no internal detail).
    expect(denial({ membershipStatus: null, organizationStatus: "SUSPENDED" })).toBe(
      "NO_ACTIVE_MEMBERSHIP",
    );
  });

  it("property breadth precedes outlet breadth and the permission", () => {
    expect(
      denial({
        propertyRequested: "p-2",
        propertyReachable: false,
        outletRequested: "o-2",
        outletReachable: false,
        permissionHeld: false,
      }),
    ).toBe("PROPERTY_ACCESS_DENIED");
  });

  it("shouldPreventPrivilegeEscalation", () => {
    // The §29 ladder in pure form: everything around the ask is healthy, but no
    // live grant carries `role.assign`, so the answer is still a refusal — a
    // client-side cache claiming otherwise changes nothing (011's doors re-check the
    // same subset rule server-side).
    expect(denial({ permissionRequested: "role.assign", permissionHeld: false })).toBe(
      "PERMISSION_DENIED",
    );
  });

  it("shouldInvalidateContextAfterMembershipRemoval", () => {
    // Removal and suspension are membership-status facts, not permission facts: a
    // REVOKED/SUSPENDED-only seat resolves to the no-active-membership reason even
    // though every grant row still exists.
    expect(
      denial({ membershipStatus: "REMOVED", permissionHeld: true }),
    ).toBe("NO_ACTIVE_MEMBERSHIP");
    expect(
      denial({ membershipStatus: "SUSPENDED", permissionHeld: true }),
    ).toBe("NO_ACTIVE_MEMBERSHIP");
  });
});

describe("the codes match the server that emits them", () => {
  // 010's `evaluate_access` builds this function's contract; these assertions read
  // the migration text so a renamed or re-ordered rung breaks a test, not a user.
  const evaluateAccess = sqlFile("010_audit_outcomes.sql");
  const ladder = [...evaluateAccess.matchAll(/v_reason := '([A-Z_]+)'/g)].map((m) => m[1]);
  const emitted = new Set(ladder);

  it("emits exactly the codes the client list carries", () => {
    // `ACCOUNT_` is emitted as a prefix (`'ACCOUNT_' || v_status`); the concrete
    // codes live in ACCESS_DENIAL_REASONS and are pinned to 008 separately below.
    for (const code of emitted) {
      const covered =
        code === "ACCOUNT_" ||
        (ACCESS_DENIAL_REASONS as readonly string[]).includes(code);
      expect(covered, `evaluate_access emits ${code}`).toBe(true);
    }
    const nonAccount = ACCESS_DENIAL_REASONS.filter((code) => !code.startsWith("ACCOUNT_"));
    expect([...nonAccount].sort()).toEqual(
      [...emitted].filter((code) => code !== "ACCOUNT_").sort(),
    );
  });

  it("checks rungs in the same order the client ladder does", () => {
    // Drop the malformed-key guard (it shares PERMISSION_DENIED with the last rung
    // and always comes first) and require the rest to appear in ladder order.
    const clientOrder = [
      "NOT_AUTHENTICATED",
      "PROFILE_MISSING",
      "ACCOUNT_",
      "NO_ACTIVE_MEMBERSHIP",
      "ORGANIZATION_NOT_ACTIVE",
      "PROPERTY_ACCESS_DENIED",
      "OUTLET_ACCESS_DENIED",
      "PERMISSION_DENIED",
    ];
    const ranks = ladder.slice(1).map((code) => clientOrder.indexOf(code));
    expect(ranks.includes(-1), "an unmodelled reason code appeared in 010").toBe(false);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it("the ACCOUNT_ refusals are exactly 008's non-ACTIVE standings", () => {
    const hardening = sqlFile("008_identity_hardening.sql");
    const constraint =
      /add constraint profiles_status_check\s+check \(status in \(([^)]*)\)\)/.exec(hardening);
    expect(constraint, "008 no longer replaces the profiles.status CHECK").not.toBeNull();
    const statuses = [...constraint![1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
    const nonActive = [...new Set(statuses)].filter((s) => s !== "ACTIVE").sort();
    expect(nonActive).toEqual(["DEACTIVATED", "SUSPENDED"]);
    expect(
      ACCESS_DENIAL_REASONS.filter((code) => code.startsWith("ACCOUNT_")).sort(),
    ).toEqual(nonActive.map((status) => `ACCOUNT_${status}`));
  });
});

describe("denial copy stays presentable (§63)", () => {
  it("every code has a sentence", () => {
    for (const reason of ACCESS_DENIAL_REASONS) {
      expect(denialCopy(reason).trim().length).toBeGreaterThan(0);
    }
  });

  it("no sentence leaks an internal token or a permission key", () => {
    // §63: the access-denied experience must not show `audit.view` or a door error
    // code; a person sees an effect, a developer sees the reason code elsewhere.
    for (const reason of ACCESS_DENIAL_REASONS) {
      const copy = denialCopy(reason);
      expect(copy).not.toContain(INTERNAL_ERROR_TOKEN_PREFIX);
      expect(copy).not.toContain(reason);
      for (const key of PERMISSION_KEYS) {
        expect(copy, `copy for ${reason} names ${key}`).not.toContain(key);
      }
    }
  });
});
