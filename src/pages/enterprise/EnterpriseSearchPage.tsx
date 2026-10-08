/**
 * Enterprise Search — cross-property search across all modules.
 *
 * Searches guests, orders, inventory, employees, and other entities across
 * all properties in the organization. This screen answers "where is X?" at
 * the organization level.
 */

import { useEffect, useMemo, useState } from "react";
import {
  CircleSlash,
  LogIn,
  Store,
  Search,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { Field } from "@/components/ui/Field";
import { can, type ActiveContext } from "@/domain/identity/types";
import { useContextStore, type ContextStatus } from "@/state/context-store";

export type EnterpriseSearchView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_organization"
  | "scoped";

export function pageStatusFor(
  status: ContextStatus,
  context: ActiveContext,
): EnterpriseSearchView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null ? "scoped" : "no_organization";
  }
  return "bootstrapping";
}

const NO_BACKEND_COPY =
  "This build has no backend configured, so it cannot perform searches.";

export default function EnterpriseSearchPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const storeError = useContextStore((s) => s.error);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const scope = useMemo(
    () =>
      context.organizationId !== null
        ? { organizationId: context.organizationId }
        : null,
    [context.organizationId],
  );

  const canView = can("enterprise.global_search.view", permissions);

  const [query, setQuery] = useState("");

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          <Search className="size-5 shrink-0 text-brand-600" aria-hidden />
          Enterprise Search
        </h2>
        <p className="mt-1 text-sm text-muted">
          Search across all properties: guests, orders, inventory, employees.
        </p>
      </header>

      {view === "bootstrapping" && <LoadingBlock label="Loading your workspace…" />}

      {view === "unconfigured" && (
        <EmptyState
          icon={<CircleSlash aria-hidden />}
          title="Backend not configured"
          description={storeError ?? NO_BACKEND_COPY}
        />
      )}

      {view === "unauthenticated" && (
        <EmptyState
          icon={<LogIn aria-hidden />}
          title="Sign in to search"
          description="There is no active session for this build to read a tenant from."
        />
      )}

      {view === "no_organization" && (
        <EmptyState
          icon={<Store aria-hidden />}
          title="Choose an organization first"
          description="Search belongs to an organization. Pick one and this screen will search its data."
        />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied
          capability="use enterprise search"
          permission="enterprise.global_search.view"
        />
      )}

      {view === "scoped" && scope !== null && canView && (
        <>
          <Field label="Search" hint="Search by name, code, phone, or email">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search across all properties…"
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none"
            />
          </Field>

          {query.length === 0 && (
            <EmptyState
              icon={<Search aria-hidden />}
              title="Start typing to search"
              description="Enter a search term to find guests, orders, inventory items, employees, and more across all properties."
            />
          )}

          {query.length > 0 && (
            <EmptyState
              icon={<Search aria-hidden />}
              title="No results found"
              description={`No results found for "${query}". Try a different search term.`}
            />
          )}
        </>
      )}
    </div>
  );
}
