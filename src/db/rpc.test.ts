/**
 * The transport funnel, exercised against a stub.
 *
 * There is no hosted AMRUT NIVAAS project yet, so these assertions are about the
 * contract this layer owns: parameter naming, `{ data, error }` unwrapping, failure
 * normalization and row mapping. They pass without a network, and they would fail
 * if a service ever started reading `error.message` directly.
 */
import { afterEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import { setSupabaseClientForTests } from "./client";
import { callDoor, callDoorRow, camelRows, asRead, firstCamelRow, rows } from "./rpc";

type RpcResult = { data?: unknown; error?: Record<string, unknown> | null };

function stubRpc(impl: (name: string, args: Record<string, unknown>) => RpcResult) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      calls.push({ name, args });
      return { data: null, error: null, ...impl(name, args) };
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

afterEach(() => setSupabaseClientForTests(undefined));

describe("callDoor", () => {
  it("sends the door's own parameter names", async () => {
    const { client, calls } = stubRpc(() => ({ data: { id: "p1" } }));
    setSupabaseClientForTests(client);

    await callDoor("create_property", {
      organization: "o1",
      propertyType: "HOSTEL",
      businessDayStart: "04:00",
    });

    expect(calls).toEqual([
      {
        name: "create_property",
        args: {
          p_organization: "o1",
          p_property_type: "HOSTEL",
          p_business_day_start: "04:00",
        },
      },
    ]);
  });

  it("returns the door's payload unchanged", async () => {
    const { client } = stubRpc(() => ({ data: ["property.view", "outlet.edit"] }));
    setSupabaseClientForTests(client);
    await expect(callDoor<string[]>("my_permissions", { organization: "o1" })).resolves.toEqual([
      "property.view",
      "outlet.edit",
    ]);
  });

  it("throws the mapped error, never the database text", async () => {
    const { client } = stubRpc(() => ({
      error: { message: "NIVAAS_ACCESS_DENIED", code: "P0001", details: "Context: SQL statement..." },
    }));
    setSupabaseClientForTests(client);

    const failure = await callDoor("create_organization", { name: "X" }).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(AppError);
    expect((failure as AppError).code).toBe("PERMISSION_DENIED");
    expect((failure as AppError).message).toBe("You do not have permission to do that here.");
  });

  it("refuses before a request when the build has no backend", async () => {
    setSupabaseClientForTests(null);
    const failure = await callDoor("resolve_active_context").catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(AppError);
    expect((failure as AppError).code).toBe("BACKEND_NOT_CONFIGURED");
  });

  it("camel-cases the written row and keeps a JSON column's own keys", async () => {
    const { client } = stubRpc(() => ({
      data: {
        id: "o1",
        organization_id: "o1",
        business_hours: { "mon-sun": { open: "07:00" } },
        archived_at: null,
      },
    }));
    setSupabaseClientForTests(client);

    await expect(callDoorRow<{
      id: string;
      organizationId: string;
      businessHours: Record<string, unknown>;
      archivedAt: string | null;
    }>("update_outlet", { outlet: "o1" })).resolves.toEqual({
      id: "o1",
      organizationId: "o1",
      businessHours: { "mon-sun": { open: "07:00" } },
      archivedAt: null,
    });
  });

  it("treats a write door that returned nothing as a defect", async () => {
    // Not "an empty list": a write door is supposed to answer with the row it wrote.
    const { client } = stubRpc(() => ({ data: null, error: null }));
    setSupabaseClientForTests(client);
    const failure = await callDoorRow<{ id: string }>("create_outlet", {
      property: "p1",
    }).catch((e: unknown) => e);
    expect((failure as AppError).code).toBe("INTERNAL");
  });
});

describe("asRead", () => {
  it("hands the funnel the very same builder, and a read error still maps through", async () => {
    // The bridge is a type-level cast only: no wrapper is constructed and no method is
    // called, so the stubbed chain in service tests remains the whole truth about what
    // reaches PostgREST — the object handed in is the object awaited below.
    const chain = Promise.resolve({ data: [{ organization_id: "o1" }], error: null });
    expect(asRead(chain)).toBe(chain);
    await expect(camelRows<{ organizationId: string }>(asRead(chain))).resolves.toEqual([
      { organizationId: "o1" },
    ]);

    // A failing read still normalizes through `door-errors`; bridging changes the
    // types the funnel sees, never what it does with an error.
    const failing = asRead(
      Promise.resolve({ data: null, error: { message: "NIVAAS_NO_SESSION", code: "P0001" } }),
    );
    const failure = await rows(failing).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(AppError);
    expect((failure as AppError).code).toBe("AUTH_REQUIRED");
  });
});

describe("rows", () => {
  it("returns the data a policy allowed", async () => {
    await expect(
      rows<{ id: string }>(Promise.resolve({ data: [{ id: "p1" }], error: null })),
    ).resolves.toEqual([{ id: "p1" }]);
  });

  it("treats a null result as no rows rather than an error", async () => {
    // PostgREST sends `data: null` for an empty aggregate-free read in some paths;
    // an empty list is the honest answer and must not surface as a failure.
    await expect(
      rows<object>(Promise.resolve({ data: null, error: null })),
    ).resolves.toEqual([]);
  });

  it("maps a read failure through the same normalizer", async () => {
    const failure = await rows<object>(
      Promise.resolve({ data: null, error: { message: "NIVAAS_NO_SESSION", code: "P0001" } }),
    ).catch((e: unknown) => e);
    expect((failure as AppError).code).toBe("AUTH_REQUIRED");
  });

  it("gives a single row or null, leaving not-found to the caller", async () => {
    await expect(
      firstCamelRow<{ organizationId: string }>(
        Promise.resolve({ data: [{ organization_id: "o1" }], error: null }),
      ),
    ).resolves.toEqual({ organizationId: "o1" });

    await expect(
      firstCamelRow<object>(Promise.resolve({ data: [], error: null })),
    ).resolves.toBeNull();
  });
});
