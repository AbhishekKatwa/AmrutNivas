/**
 * The drift gate between the client and the schema.
 *
 * `src/db/doors.ts` is a hand-written list, which is exactly the kind of thing the
 * donor project learned to distrust (the role matrix lived twice and disagreed). So
 * this test compares it against the SQL every run, in both directions: a door that
 * exists but is unlisted, a listed door that has been renamed away, and a signature
 * whose parameters stopped following the `p_*` convention that `toDoorArgs` assumes.
 */
import { describe, expect, it } from "vitest";
import { CLIENT_DOORS, isDoorName } from "./doors";
import { publicDoorSignatures } from "@/test-helpers/migrations";

const signatures = publicDoorSignatures();
const defined = [...signatures.keys()].sort();
const listed = [...CLIENT_DOORS].sort();

describe("the door list against the shipped schema", () => {
  it("parses the migrations at all", () => {
    // Without this, a broken regex would make every assertion below vacuously pass.
    expect(defined.length).toBeGreaterThanOrEqual(25);
  });

  it("lists every door the database exposes over HTTP", () => {
    const unlisted = defined.filter((name) => !isDoorName(name));
    expect(unlisted).toEqual([]);
  });

  it("names nothing the database does not define", () => {
    const missing = listed.filter((name) => !signatures.has(name));
    expect(missing).toEqual([]);
  });

  it("has no duplicate entry", () => {
    expect(new Set(CLIENT_DOORS).size).toBe(CLIENT_DOORS.length);
  });

  it("keeps every door parameter on the p_ naming convention", () => {
    const offenders = [...signatures.entries()].flatMap(([name, params]) =>
      params.filter((param) => !param.startsWith("p_")).map((param) => `${name}.${param}`),
    );
    expect(offenders).toEqual([]);
  });

  it("exposes the session read the shell boots with", () => {
    // Not decorative: the whole app boot depends on these two existing and taking
    // no required argument, so a rename here breaks every screen at once.
    expect(signatures.get("resolve_active_context")).toEqual([]);
    expect(signatures.get("my_permissions")).toEqual(["p_organization", "p_property", "p_outlet"]);
  });

  it("reads every parameter of a door declared on one line", () => {
    // Two doors are written on a single line. A line-based parser would see only
    // their first parameter, and the contract check would pass while sending an
    // undeclared `p_reson` that PostgREST rejects at runtime.
    expect(signatures.get("cancel_invitation")).toEqual(["p_invitation", "p_reason"]);
    expect(signatures.get("revoke_role")).toEqual(["p_grant", "p_reason"]);
    expect(signatures.get("accept_invitation")).toEqual(["p_token"]);
  });

  it("does not mistake a quoted default for a parameter", () => {
    // `p_business_types text[] default '{}'` and `default '04:00'` both contain
    // characters a naive comma split would cut on.
    const createProperty = signatures.get("create_property") ?? [];
    expect(createProperty).toContain("p_business_day_start");
    expect(createProperty.filter((param) => !param.startsWith("p_"))).toEqual([]);
    expect(signatures.get("create_organization")?.filter((p) => p.includes("'"))).toEqual([]);
  });
});
