/**
 * Enterprise Attention Center — cross-property alerts requiring action.
 *
 * Aggregates alerts from all operational modules (low stock, overdue tasks,
 * compliance issues) across all properties. This screen answers "what needs
 * my attention right now?" at the organization level.
 */

import { useEffect, useMemo } from "react";
import {
  CircleSlash,
  LogIn,
  Store,
  AlertTriangle,
  Info,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { can, type ActiveContext } from "@/domain/identity/types";
import { useContextStore, type ContextStatus } from "@/state/context-store";

export type EnterpriseAttentionView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_organization"
  | "scoped";

export function pageStatusFor(
  status: ContextStatus,
  context: ActiveContext,
): EnterpriseAttentionView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null ? "scoped" : "no_organization";
  }
  return "bootstrapping";
}

const NO_BACKEND_COPY =
  "This build has no backend configured, so it cannot read alert data.";

export default function EnterpriseAttentionPage() {
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

  const canView = can("enterprise.alerts.view", permissions);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          <AlertTriangle className="size-5 shrink-0 text-brand-600" aria-hidden />
          Attention Center
        </h2>
        <p className="mt-1 text-sm text-muted">
          Cross-property alerts requiring action across the organization.
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
          title="Sign in to view Alerts"
          description="There is no active session for this build to read a tenant from."
        />
      )}

      {view === "no_organization" && (
        <EmptyState
          icon={<Store aria-hidden />}
          title="Choose an organization first"
          description="Alert data belongs to an organization. Pick one and this screen will show its alerts."
        />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied
          capability="view enterprise alerts"
          permission="enterprise.alerts.view"
        />
      )}

      {view === "scoped" && scope !== null && canView && (
        <EmptyState
          icon={<Info aria-hidden />}
          title="No alerts at this time"
          description="The attention center aggregates alerts from all operational modules. When alerts exist, they will appear here grouped by severity and property."
        />
      )}
    </div>
  );
}
