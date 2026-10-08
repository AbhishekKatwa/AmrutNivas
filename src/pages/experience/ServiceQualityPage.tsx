/**
 * Service Quality — SLA monitoring, standards tracking, overdue items.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, Clock, Shield, Star } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import type { EntityId } from "@/domain/identity/types";
import { can, type ActiveContext } from "@/domain/identity/types";
import type { ExperienceRecord } from "@/domain/experience/types";
import { DEFAULT_SLA_CONFIG } from "@/domain/experience/types";
import {
  getExperienceKPIs,
  getOverdueRecords,
  getDepartmentPerformance,
  ensureExperienceDemoSeeded,
} from "@/domain/experience/experience-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";
import { Link } from "react-router-dom";

type View = "bootstrapping" | "unconfigured" | "unauthenticated" | "no_organization" | "scoped";

function pageStatusFor(status: ContextStatus, context: ActiveContext): View {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") return context.organizationId !== null ? "scoped" : "no_organization";
  return "bootstrapping";
}

export default function ServiceQualityPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const orgId = context.organizationId as EntityId | null;
  const propId = context.propertyId as EntityId | null;
  const canView = can("experience.analytics.view", permissions);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overdue, setOverdue] = useState<ExperienceRecord[]>([]);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  const kpis = orgId ? getExperienceKPIs(orgId) : null;
  const departments = orgId ? getDepartmentPerformance(orgId) : [];

  useEffect(() => {
    if (view !== "scoped" || !orgId || !canView) return;
    setLoading(true);
    setError(null);
    try {
      if (propId) ensureExperienceDemoSeeded(orgId, propId);
      else ensureExperienceDemoSeeded(orgId, "prop_default" as EntityId);
      setOverdue([...getOverdueRecords(orgId)]);
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setLoading(false);
    }
  }, [view, orgId, propId, canView]);

  if (view === "bootstrapping" || loading) return <LoadingBlock label="Loading service quality…" />;
  if (!canView) return <EmptyState icon={<Shield />} title="Service Quality" description="You don't have permission to view this." />;
  if (error) return <EmptyState icon={<AlertTriangle />} title="Error" description={error} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#17201B]">Service Quality</h1>
        <p className="text-sm text-[#66706A] mt-1">SLA compliance, standards monitoring, and department performance</p>
      </div>

      {/* SLA Configuration */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-[#17201B] mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-[#66706A]" />
          SLA Targets
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {DEFAULT_SLA_CONFIG.map((sla) => (
            <div key={sla.priority} className="p-3 rounded-lg border border-[#E3E7E3] text-center">
              <Badge
                tone={sla.priority === "CRITICAL" ? "danger" : sla.priority === "URGENT" ? "danger" : sla.priority === "HIGH" ? "warning" : "neutral"}
              >
                {sla.priority}
              </Badge>
              <div className="mt-2 text-xs text-[#66706A]">
                <p>Response: {sla.responseTimeHours}h</p>
                <p>Resolution: {sla.resolutionTimeHours}h</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Compliance overview */}
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <p className="text-xs text-[#66706A]">SLA Compliance</p>
            <p className={`text-xl font-bold ${kpis.slaCompliancePercent >= 80 ? "text-green-600" : kpis.slaCompliancePercent >= 60 ? "text-amber-600" : "text-red-600"}`}>
              {kpis.slaCompliancePercent}%
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-[#66706A]">Avg Response</p>
            <p className="text-xl font-bold text-[#17201B]">{kpis.averageResponseTimeHours}h</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-[#66706A]">Avg Resolution</p>
            <p className="text-xl font-bold text-[#17201B]">{kpis.averageResolutionTimeHours}h</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-[#66706A]">Overdue</p>
            <p className="text-xl font-bold text-red-600">{overdue.length}</p>
          </Card>
        </div>
      )}

      {/* Department SLA performance */}
      {departments.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-[#17201B] mb-3 flex items-center gap-2">
            <Star className="w-4 h-4 text-[#66706A]" />
            Department SLA Performance
          </h3>
          <div className="space-y-3">
            {departments.map((d) => (
              <div key={d.departmentId} className="flex items-center justify-between p-3 rounded-lg border border-[#E3E7E3]">
                <div>
                  <p className="text-sm font-medium text-[#17201B]">{d.departmentName}</p>
                  <p className="text-xs text-[#66706A]">{d.totalRecords} records · {d.openRecords} open · Avg {d.averageResolutionTimeHours}h</p>
                </div>
                <div className="flex items-center gap-3">
                  {d.averageRating > 0 && (
                    <span className="text-sm text-yellow-600 flex items-center gap-0.5">
                      <Star className="w-4 h-4 fill-yellow-500" />
                      {d.averageRating}
                    </span>
                  )}
                  <Badge tone={d.slaCompliancePercent >= 80 ? "success" : d.slaCompliancePercent >= 60 ? "warning" : "danger"}>
                    {d.slaCompliancePercent}%
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Overdue items */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-[#17201B] mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          Overdue Items ({overdue.length})
        </h3>
        {overdue.length === 0 ? (
          <p className="text-xs text-[#66706A] py-4 text-center">All items are within SLA</p>
        ) : (
          <div className="space-y-2">
            {overdue.map((r) => (
              <Link key={r.id} to={`/experience/${r.id}`}>
                <div className="flex items-center justify-between p-2 rounded-lg border border-red-100 bg-red-50/50 hover:bg-red-50 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-[#17201B]">{r.title}</p>
                    <p className="text-xs text-[#66706A]">{r.guestName} · {r.category.replace(/_/g, " ")}</p>
                  </div>
                  <Badge tone="danger">{r.priority}</Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
