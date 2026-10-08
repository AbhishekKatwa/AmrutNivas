/**
 * Enterprise Reports — consolidated cross-property reports.
 *
 * Provides organization-wide financial and operational reports: revenue by property,
 * occupancy comparison, inventory valuation, and more. This screen answers "how do
 * properties compare?" at the organization level.
 */

import { useEffect, useMemo } from "react";
import {
  CircleSlash,
  LogIn,
  Store,
  BarChart3,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { can, type ActiveContext } from "@/domain/identity/types";
import { useContextStore, type ContextStatus } from "@/state/context-store";

export type EnterpriseReportsView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_organization"
  | "scoped";

export function pageStatusFor(
  status: ContextStatus,
  context: ActiveContext,
): EnterpriseReportsView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null ? "scoped" : "no_organization";
  }
  return "bootstrapping";
}

const NO_BACKEND_COPY =
  "This build has no backend configured, so it cannot read report data.";

export default function EnterpriseReportsPage() {
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

  const canView = can("enterprise.reporting.view", permissions);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          <BarChart3 className="size-5 shrink-0 text-brand-600" aria-hidden />
          Consolidated Reports
        </h2>
        <p className="mt-1 text-sm text-muted">
          Cross-property financial and operational reports for the organization.
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
          title="Sign in to view Reports"
          description="There is no active session for this build to read a tenant from."
        />
      )}

      {view === "no_organization" && (
        <EmptyState
          icon={<Store aria-hidden />}
          title="Choose an organization first"
          description="Report data belongs to an organization. Pick one and this screen will show its reports."
        />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied
          capability="view enterprise reports"
          permission="enterprise.reporting.view"
        />
      )}

      {view === "scoped" && scope !== null && canView && (
        <EmptyState
          icon={<BarChart3 aria-hidden />}
          title="Reports coming soon"
          description="Consolidated reports will aggregate financial and operational data across all properties. This feature is under development."
        />
      )}
    </div>
  );
}
