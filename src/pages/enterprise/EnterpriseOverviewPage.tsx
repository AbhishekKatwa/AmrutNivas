/**
 * Enterprise Command Center — organization-wide operational visibility.
 *
 * Aggregates property counts, group counts, and alert summaries across all
 * properties in the organization. This screen answers "how is the portfolio
 * doing?" at a glance. Enterprise aggregates, never replaces operational modules.
 */

import { useEffect, useMemo, useState } from "react";
import {
  CircleSlash,
  LogIn,
  Store,
  Building2,
  AlertTriangle,
  Search,
  BarChart3,
  Settings,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { can, type ActiveContext } from "@/domain/identity/types";
import {
  listPropertyGroups,
  listPropertiesWithGroups,
  type PropertyGroupScope,
} from "@/domain/enterprise/enterprise-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

export type EnterpriseOverviewView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_organization"
  | "scoped";

export function pageStatusFor(
  status: ContextStatus,
  context: ActiveContext,
): EnterpriseOverviewView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null ? "scoped" : "no_organization";
  }
  return "bootstrapping";
}

type Counts = {
  totalProperties: number;
  activeProperties: number;
  totalGroups: number;
  activeGroups: number;
};

const NO_BACKEND_COPY =
  "This build has no backend configured, so it cannot read enterprise data.";

export default function EnterpriseOverviewPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const storeError = useContextStore((s) => s.error);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const scope = useMemo<PropertyGroupScope | null>(
    () =>
      context.organizationId !== null
        ? { organizationId: context.organizationId }
        : null,
    [context.organizationId],
  );

  const canView = can("enterprise.view", permissions);

  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || scope === null || !canView) return;
    let ignore = false;
    setCounts(null);
    setError(null);

    Promise.all([
      listPropertiesWithGroups(scope).catch(() => []),
      listPropertyGroups(scope).catch(() => []),
    ])
      .then(([properties, groups]) => {
        if (ignore) return;
        setCounts({
          totalProperties: properties.length,
          activeProperties: properties.filter((p) => p.status === "ACTIVE").length,
          totalGroups: groups.length,
          activeGroups: groups.filter((g) => g.status === "ACTIVE").length,
        });
      })
      .catch((err) => {
        if (!ignore) setError(toPublicError(err).message);
      });

    return () => {
      ignore = true;
    };
  }, [view, scope, canView]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          <Building2 className="size-5 shrink-0 text-brand-600" aria-hidden />
          Enterprise Command Center
        </h2>
        <p className="mt-1 text-sm text-muted">
          Organization-wide visibility across all properties and modules.
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
          title="Sign in to view Enterprise"
          description="There is no active session for this build to read a tenant from."
        />
      )}

      {view === "no_organization" && (
        <EmptyState
          icon={<Store aria-hidden />}
          title="Choose an organization first"
          description="Enterprise data belongs to an organization. Pick one and this screen will show its portfolio."
        />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied
          capability="view enterprise"
          permission="enterprise.view"
        />
      )}

      {view === "scoped" && scope !== null && canView && (
        <>
          {error !== null && (
            <p
              role="alert"
              className="rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger"
            >
              {error}
            </p>
          )}

          {counts === null ? (
            <LoadingBlock label="Reading enterprise data…" />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
              <KpiCard
                icon={<Building2 className="size-4" aria-hidden />}
                label="Total properties"
                value={counts.totalProperties}
                href="/enterprise/properties"
              />
              <KpiCard
                icon={<Building2 className="size-4" aria-hidden />}
                label="Active properties"
                value={counts.activeProperties}
                href="/enterprise/properties"
              />
              <KpiCard
                icon={<Store className="size-4" aria-hidden />}
                label="Property groups"
                value={counts.totalGroups}
                href="/enterprise/properties"
              />
              <KpiCard
                icon={<Store className="size-4" aria-hidden />}
                label="Active groups"
                value={counts.activeGroups}
                href="/enterprise/properties"
              />
            </div>
          )}

          <section className="grid gap-4 sm:grid-cols-2">
            <QuickActionCard
              icon={<AlertTriangle className="size-5" aria-hidden />}
              title="Attention Center"
              description="Cross-property alerts requiring action: low stock, overdue tasks, compliance issues."
              href="/enterprise/attention"
            />
            <QuickActionCard
              icon={<Search className="size-5" aria-hidden />}
              title="Enterprise Search"
              description="Search across all properties: guests, orders, inventory, employees."
              href="/enterprise/search"
            />
            <QuickActionCard
              icon={<BarChart3 className="size-5" aria-hidden />}
              title="Consolidated Reports"
              description="Cross-property financial and operational reports for the organization."
              href="/enterprise/reports"
            />
            <QuickActionCard
              icon={<Settings className="size-5" aria-hidden />}
              title="Organization Settings"
              description="Configure modules, templates, and defaults for all properties."
              href="/enterprise/settings"
            />
          </section>
        </>
      )}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  href: string;
}) {
  return (
    <a
      href={href}
      className="group rounded-xl border border-border bg-surface p-4 transition hover:border-brand-300 hover:shadow-sm"
    >
      <div className="flex items-center gap-2 text-muted">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">
          {label}
        </span>
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-ink">
        {value}
      </div>
    </a>
  );
}

function QuickActionCard({
  icon,
  title,
  description,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="group rounded-xl border border-border bg-surface p-5 transition hover:border-brand-300 hover:shadow-sm"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-brand-50 p-2 text-brand-600">{icon}</div>
        <div className="flex-1">
          <h3 className="font-semibold text-ink">{title}</h3>
          <p className="mt-1 text-sm text-muted">{description}</p>
        </div>
      </div>
    </a>
  );
}
