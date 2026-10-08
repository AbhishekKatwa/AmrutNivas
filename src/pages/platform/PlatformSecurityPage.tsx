/**
 * Platform Security — security incidents and events across the platform.
 *
 * Platform security team can view, investigate, and resolve security incidents.
 */

import { useEffect, useState } from "react";
import { Shield, AlertTriangle, Plus } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { can } from "@/domain/identity/types";
import { useContextStore } from "@/state/context-store";
import type { SecurityIncident, SecurityIncidentSeverity, SecurityIncidentStatus } from "@/domain/platform/types";

export default function PlatformSecurityPage() {
  const permissions = useContextStore((s) => s.permissions);
  const canView = can("platform.security.view", permissions);

  const [incidents, setIncidents] = useState<SecurityIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canView) return;
    let ignore = false;
    setLoading(true);
    setError(null);

    // TODO: Fetch security incidents from platform service
    setTimeout(() => {
      if (!ignore) {
        setIncidents([]);
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
        icon={<Shield aria-hidden />}
        title="Platform access required"
        description="You need platform.security.view permission to access this page."
      />
    );
  }

  if (loading) {
    return <LoadingBlock label="Loading security incidents…" />;
  }

  if (error) {
    return (
      <EmptyState
        icon={<AlertTriangle aria-hidden />}
        title="Failed to load security incidents"
        description={error}
      />
    );
  }

  const severityColor = (severity: SecurityIncidentSeverity) => {
    switch (severity) {
      case "CRITICAL":
        return "bg-danger/10 text-danger";
      case "HIGH":
        return "bg-orange-50 text-orange-700";
      case "MEDIUM":
        return "bg-amber-50 text-amber-700";
      case "LOW":
        return "bg-blue-50 text-blue-700";
    }
  };

  const statusColor = (status: SecurityIncidentStatus) => {
    switch (status) {
      case "OPEN":
        return "bg-danger/10 text-danger";
      case "INVESTIGATING":
        return "bg-amber-50 text-amber-700";
      case "CONTAINED":
        return "bg-blue-50 text-blue-700";
      case "RESOLVED":
        return "bg-success/10 text-success";
      case "CLOSED":
        return "bg-muted/10 text-muted";
    }
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header className="flex items-start justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
            <Shield className="size-5 shrink-0 text-brand-600" aria-hidden />
            Security Center
          </h2>
          <p className="mt-1 text-sm text-muted">
            Monitor and manage security incidents across the platform.
          </p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          <Plus className="size-4" />
          Report Incident
        </button>
      </header>

      {incidents.length === 0 ? (
        <EmptyState
          icon={<Shield aria-hidden />}
          title="No security incidents"
          description="No security incidents reported. The platform is secure."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full">
            <thead className="border-b border-border bg-surface-alt">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                  Incident
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                  Severity
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                  Category
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                  Detected
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                  Assigned To
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {incidents.map((incident) => (
                <tr key={incident.id} className="hover:bg-surface-alt">
                  <td className="px-4 py-3">
                    <div>
                      <div className="font-medium text-ink">{incident.title}</div>
                      <div className="text-xs text-muted">{incident.category}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${severityColor(incident.severity)}`}>
                      {incident.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted">{incident.category}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(incident.status)}`}>
                      {incident.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted">
                    {new Date(incident.detectedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted">
                    {incident.assignedTo ?? "Unassigned"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
