/**
 * The development-only access inspector (§67).
 *
 * "Why is this button greyed out?" should be answerable in one look at the resolved
 * context instead of by reading console noise, so the tenant levels, the session's user
 * id and the size of the loaded grant set sit in one inert strip while the app runs.
 *
 * It shows identifiers and a count and nothing else: no token, no email, no credential,
 * no grant list (§68) — this is a panel on a screen, and screens get photographed.
 *
 * Production never ships it: `import.meta.env.DEV` is a build-time constant Vite replaces
 * with `false`, so the mount point in `App` collapses to `false && <AccessDebugPanel/>`,
 * the component becomes unreferenced, and Rollup drops the module from the bundle. The
 * check inside this component is the second lock for any other caller.
 */

import { useEffect, useState } from "react";
import { readSession } from "@/domain/auth/auth-service";
import { useContextStore } from "@/state/context-store";

function level(value: string | null): string {
  return value ?? "none";
}

function Panel() {
  // Subscribe to the fields shown, then read the live snapshot — the same reason the
  // access components do it: a static render only sees the hook's initial snapshot.
  useContextStore((state) => state.status);
  useContextStore((state) => state.context);
  useContextStore((state) => state.permissions);
  const { status, context, permissions } = useContextStore.getState();
  const [userId, setUserId] = useState<string | null>(null);

  // The session is asked for on this status change, because a switch or a sign-out is
  // exactly when the answer below stops being true. Nothing here is written anywhere.
  useEffect(() => {
    let current = true;
    setUserId(null);
    void readSession()
      .then((session) => {
        if (current) setUserId(session?.userId ?? null);
      })
      .catch(() => {
        if (current) setUserId(null);
      });
    return () => {
      current = false;
    };
  }, [status]);

  const rows: readonly (readonly [string, string])[] = [
    ["Status", status],
    ["User", level(userId)],
    ["Organization", level(context.organizationId)],
    ["Property", level(context.propertyId)],
    ["Outlet", level(context.outletId)],
    // A count, not the key list: the grant set is what decides the greyed-out control, and
    // `null` is a different answer from an empty one — signed-in with no tenant loaded has
    // nothing to compare against, so it is not "0 permissions".
    ["Permissions", permissions === null ? "not loaded" : String(permissions.permissions.length)],
  ];

  return (
    <section
      aria-label="Access debugging"
      className="mt-6 rounded-lg border border-dashed border-line-strong bg-surface-sunken px-4 py-3"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        Access · development only
      </p>
      <dl className="mt-2 grid gap-x-6 gap-y-1 text-[11px] leading-relaxed sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex min-w-0 gap-2">
            <dt className="shrink-0 text-muted">{label}</dt>
            <dd className="min-w-0 truncate font-mono text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function AccessDebugPanel() {
  if (!import.meta.env.DEV) return null;
  return <Panel />;
}
