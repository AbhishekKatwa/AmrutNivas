/**
 * The stub itself, exercised.
 *
 * Every service test is only as trustworthy as this helper: a stub that silently
 * returned `[]` for an unhandled table, or lost a filter, would turn a real missing
 * tenant scope into a passing test. So the capture is asserted directly.
 */
import { afterEach, describe, expect, it } from "vitest";
import { rows } from "@/db/rpc";
import { setSupabaseClientForTests } from "@/db/client";
import { doorParametersMatchTheSchema, stubBackend } from "./transport";

afterEach(() => setSupabaseClientForTests(undefined));

describe("stubBackend reads", () => {
  it("captures the table, columns and every filter in order", async () => {
    const stub = stubBackend({ reads: () => [{ id: "o1" }] });
    setSupabaseClientForTests(stub.client);

    const query = stub.client
      .from("organizations")
      .select("id, name, status")
      .eq("organization_id", "o1")
      .in("status", ["ACTIVE", "SUSPENDED"])
      .order("created_at", { ascending: false })
      .limit(20);

    await expect(rows<{ id: string }>(query)).resolves.toEqual([{ id: "o1" }]);
    expect(stub.queries).toHaveLength(1);
    expect(stub.queries[0].table).toBe("organizations");
    expect(stub.queries[0].columns).toBe("id, name, status");
    expect(stub.queries[0].steps).toEqual([
      ["eq", ["organization_id", "o1"]],
      ["in", ["status", ["ACTIVE", "SUSPENDED"]]],
      ["order", ["created_at", { ascending: false }]],
      ["limit", [20]],
    ]);
  });

  it("refuses a single-row read instead of lying about the shape", async () => {
    // `rpc.ts` types every read as a list; `.single()` awaits to an object, so a stub
    // that recorded it happily would hide a broken call site.
    const stub = stubBackend({ reads: () => [{ id: "o1" }] });
    setSupabaseClientForTests(stub.client);
    expect(() =>
      stub.client
        .from("profiles")
        .select("*")
        .maybeSingle(),
    ).toThrow(/use \.limit\(1\)/);
  });

  it("refuses a write attempted through a table", async () => {
    // `authenticated` holds SELECT only (003). A service that reaches for
    // `.update()` has bypassed the doors, and the suite must say so loudly.
    const stub = stubBackend({ reads: () => [] });
    setSupabaseClientForTests(stub.client);
    expect(() =>
      stub.client
        .from("organizations")
        .update({ name: "X" }),
    ).toThrow(/writes go through a 005 door/);
  });

  it("refuses a table the test forgot to give rows for", async () => {
    // Without this, a typo in a table name would read as "the policy returned no rows"
    // and a tenant-isolation assertion could pass vacuously.
    const stub = stubBackend({ doors: () => undefined });
    setSupabaseClientForTests(stub.client);
    await expect(rows(stub.client.from("properties").select("*"))).rejects.toThrow(
      /no read handler for table "properties"/,
    );
  });

  it("maps a read failure through the same normalizer as a door", async () => {
    const stub = stubBackend({
      reads: () => ({ data: null, error: { message: "NIVAAS_NO_SESSION", code: "P0001" } }),
    });
    setSupabaseClientForTests(stub.client);
    await expect(rows(stub.client.from("audit_log").select("*"))).rejects.toThrow(
      /sign in/,
    );
  });
});

describe("doorParametersMatchTheSchema", () => {
  it("accepts the migration's own spelling", () => {
    expect(() =>
      doorParametersMatchTheSchema("create_property", { p_organization: "o1" }),
    ).not.toThrow();
  });

  it("rejects a parameter the database never declared", () => {
    expect(() =>
      doorParametersMatchTheSchema("create_property", { p_proprty: "o1" }),
    ).toThrow(/was sent p_proprty/);
  });

  it("rejects a door that does not exist in public", () => {
    expect(() => doorParametersMatchTheSchema("app_audit", {})).toThrow(
      /not defined in public/,
    );
  });
});
