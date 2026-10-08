/**
 * Platform Health — system health and operational status.
 *
 * Shows health of API, database, integrations, webhooks, and other subsystems.
 */

import { useEffect, useState } from "react";
import { Activity, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { can } from "@/domain/identity/types";
import { useContextStore } from "@/state/context-store";

type HealthStatus = "HEALTHY" | "DEGRADED" | "DOWN" | "UNKNOWN";

type SubsystemHealth = {
  name: string;
  status: HealthStatus;
  lastChecked: string;
  details?: string;
};

export default function PlatformHealthPage() {
  const permissions = useContextStore((s) => s.permissions);
  const canView = can("platform.health.view", permissions);

  const [health, setHealth] = useState<SubsystemHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canView) return;
    let ignore = false;
    setLoading(true);
    setError(null);

    // TODO: Fetch health status from platform service
    setTimeout(() => {
      if (!ignore) {
        setHealth([
          { name: "API", status: "HEALTHY", lastChecked: new Date().toISOString() },
          { name: "Database", status: "HEALTHY", lastChecked: new Date().toISOString() },
          { name: "Authentication", status: "HEALTHY", lastChecked: new Date().toISOString() },
          { name: "Notifications", status: "HEALTHY", lastChecked: new Date().toISOString() },
          { name: "Email Service", status: "HEALTHY", lastChecked: new Date().toISOString() },
          { name: "SMS Service", status: "UNKNOWN", lastChecked: new Date().toISOString(), details: "Not configured" },
          { name: "WhatsApp", status: "UNKNOWN", lastChecked: new Date().toISOString(), details: "Not configured" },
          { name: "Webhooks", status: "HEALTHY", lastChecked: new Date().toISOString() },
          { name: "Integrations", status: "DEGRADED", lastChecked: new Date().toISOString(), details: "2 failures in last hour" },
          { name: "Background Jobs", status: "HEALTHY", lastChecked: new Date().toISOString() },
          { name: "Storage", status: "HEALTHY", lastChecked: new Date().toISOString() },
        ]);
        setLoading(false);
      }
    }, 500);

    return () => {
      ignore = true;
    };
  }, [canView]);

  if (!canView) {
    return (
      <EmptyState
        icon={<Activity aria-hidden />}
        title="Platform access required"
        description="You need platform.health.view permission to access this page."
      />
    );
  }

  if (loading) {
    return <LoadingBlock label="Loading system health…" />;
  }

  if (error) {
    return (
      <EmptyState
        icon={<Activity aria-hidden />}
        title="Failed to load system health"
        description={error}
      />
    );
  }

  const statusIcon = (status: HealthStatus) => {
    switch (status) {
      case "HEALTHY":
        return <CheckCircle2 className="size-5 text-success" />;
      case "DEGRADED":
        return <AlertCircle className="size-5 text-warning" />;
      case "DOWN":
        return <XCircle className="size-5 text-danger" />;
      case "UNKNOWN":
        return <AlertCircle className="size-5 text-muted" />;
    }
  };

  const statusColor = (status: HealthStatus) => {
    switch (status) {
      case "HEALTHY":
        return "text-success";
      case "DEGRADED":
        return "text-warning";
      case "DOWN":
        return "text-danger";
      case "UNKNOWN":
        return "text-muted";
    }
  };

  const healthyCount = health.filter((h) => h.status === "HEALTHY").length;
  const degradedCount = health.filter((h) => h.status === "DEGRADED").length;
  const downCount = health.filter((h) => h.status === "DOWN").length;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          <Activity className="size-5 shrink-0 text-brand-600" aria-hidden />
          System Health
        </h2>
        <p className="mt-1 text-sm text-muted">
          Operational status of platform subsystems.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="size-8 text-success" />
            <div>
              <div className="text-2xl font-semibold text-ink">{healthyCount}</div>
              <div className="text-sm text-muted">Healthy</div>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="size-8 text-warning" />
            <div>
              <div className="text-2xl font-semibold text-ink">{degradedCount}</div>
              <div className="text-sm text-muted">Degraded</div>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center gap-3">
            <XCircle className="size-8 text-danger" />
            <div>
              <div className="text-2xl font-semibold text-ink">{downCount}</div>
              <div className="text-sm text-muted">Down</div>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full">
          <thead className="border-b border-border bg-surface-alt">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                Subsystem
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                Last Checked
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                Details
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {health.map((h) => (
              <tr key={h.name} className="hover:bg-surface-alt">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {statusIcon(h.status)}
                    <span className="font-medium text-ink">{h.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-sm font-medium ${statusColor(h.status)}`}>
                    {h.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-muted">
                  {new Date(h.lastChecked).toLocaleTimeString()}
                </td>
                <td className="px-4 py-3 text-sm text-muted">
                  {h.details ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
