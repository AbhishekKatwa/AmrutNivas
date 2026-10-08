/**
 * Platform Admin Dashboard — operational visibility for the AMRUT NIVAAS SaaS platform.
 *
 * Shows platform-wide metrics: organizations, subscriptions, health, usage.
 * Platform admin operates the SaaS platform, not customer business data.
 */

import { useEffect, useState } from "react";
import {
  Building2,
  Users,
  CreditCard,
  Activity,
  AlertTriangle,
  Shield,
  TrendingUp,
  Package,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { can } from "@/domain/identity/types";
import { getPlatformDashboardMetrics } from "@/domain/platform/platform-service";
import type { PlatformDashboardMetrics } from "@/domain/platform/types";
import { toPublicError } from "@/lib/errors";
import { useContextStore } from "@/state/context-store";

export default function PlatformDashboardPage() {
  const permissions = useContextStore((s) => s.permissions);
  const canView = can("platform.dashboard.view", permissions);

  const [metrics, setMetrics] = useState<PlatformDashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canView) return;
    let ignore = false;
    setLoading(true);
    setError(null);

    getPlatformDashboardMetrics()
      .then((data) => {
        if (!ignore) setMetrics(data);
      })
      .catch((err) => {
        if (!ignore) setError(toPublicError(err).message);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [canView]);

  if (!canView) {
    return (
      <EmptyState
        icon={<Shield aria-hidden />}
        title="Platform access required"
        description="You need platform.dashboard.view permission to access this page."
      />
    );
  }

  if (loading) {
    return <LoadingBlock label="Loading platform metrics…" />;
  }

  if (error) {
    return (
      <EmptyState
        icon={<AlertTriangle aria-hidden />}
        title="Failed to load platform metrics"
        description={error}
      />
    );
  }

  if (!metrics) {
    return (
      <EmptyState
        icon={<Activity aria-hidden />}
        title="No platform data available"
        description="Platform metrics could not be loaded."
      />
    );
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          <Building2 className="size-5 shrink-0 text-brand-600" aria-hidden />
          Platform Dashboard
        </h2>
        <p className="mt-1 text-sm text-muted">
          Operational visibility for the AMRUT NIVAAS platform.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={<Building2 className="size-5" />}
          label="Organizations"
          value={metrics.organizations.total}
          subvalue={`${metrics.organizations.active} active`}
          color="blue"
        />
        <MetricCard
          icon={<CreditCard className="size-5" />}
          label="Subscriptions"
          value={metrics.subscriptions.active}
          subvalue={`${metrics.subscriptions.trialing} trialing`}
          color="green"
        />
        <MetricCard
          icon={<Users className="size-5" />}
          label="Users"
          value={metrics.users.total}
          subvalue={`${metrics.users.active} active`}
          color="purple"
        />
        <MetricCard
          icon={<Package className="size-5" />}
          label="Properties"
          value={metrics.properties.total}
          subvalue={`${metrics.outlets.total} outlets`}
          color="orange"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <Activity className="size-4 text-brand-600" />
            Platform Health
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted">API Status</span>
              <span className="font-medium text-success">Operational</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Database</span>
              <span className="font-medium text-success">Operational</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Integrations</span>
              <span className="font-medium text-warning">
                {metrics.integrations.failed} failed
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <AlertTriangle className="size-4 text-brand-600" />
            Attention Required
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted">Open Support Cases</span>
              <span className="font-medium">{metrics.supportCases.open}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Security Incidents</span>
              <span className="font-medium">{metrics.securityIncidents.open}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Past Due Subscriptions</span>
              <span className="font-medium">
                {metrics.subscriptions.pastDue}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <TrendingUp className="size-4 text-brand-600" />
            Revenue Metrics
          </h3>
          <div className="space-y-3">
            <div>
              <div className="text-2xl font-semibold text-ink">
                ₹{metrics.revenue.mrr.toLocaleString("en-IN")}
              </div>
              <div className="text-xs text-muted">Monthly Recurring Revenue</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-ink">
                ₹{metrics.revenue.arr.toLocaleString("en-IN")}
              </div>
              <div className="text-xs text-muted">Annual Recurring Revenue</div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <Building2 className="size-4 text-brand-600" />
            Organization Status
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted">Active</span>
              <span className="font-medium">{metrics.organizations.active}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Trialing</span>
              <span className="font-medium">{metrics.organizations.trialing}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Past Due</span>
              <span className="font-medium">{metrics.organizations.pastDue}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Suspended</span>
              <span className="font-medium">{metrics.organizations.suspended}</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <Shield className="size-4 text-brand-600" />
            Security Overview
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted">Open Incidents</span>
              <span className="font-medium">{metrics.securityIncidents.open}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Critical</span>
              <span className="font-medium text-danger">
                {metrics.securityIncidents.critical}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Active Support Sessions</span>
              <span className="font-medium">{metrics.supportAccess.activeSessions}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  subvalue,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  subvalue: string;
  color: "blue" | "green" | "purple" | "orange";
}) {
  const colorClasses = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    purple: "bg-purple-50 text-purple-600",
    orange: "bg-orange-50 text-orange-600",
  };

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2 ${colorClasses[color]}`}>{icon}</div>
        <div>
          <div className="text-sm text-muted">{label}</div>
          <div className="text-2xl font-semibold text-ink">{value}</div>
          <div className="text-xs text-muted">{subvalue}</div>
        </div>
      </div>
    </div>
  );
}
