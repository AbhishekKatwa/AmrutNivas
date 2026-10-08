/**
 * Experience Analytics — trends, category breakdown, department performance.
 */

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Star,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import type { EntityId } from "@/domain/identity/types";
import { can, type ActiveContext } from "@/domain/identity/types";
import type {
  ExperienceKPIs,
  ExperienceTrendPoint,
  CategoryBreakdown,
  DepartmentPerformance,
} from "@/domain/experience/types";
import {
  getExperienceKPIs,
  getExperienceTrends,
  getCategoryBreakdown,
  getDepartmentPerformance,
  ensureExperienceDemoSeeded,
} from "@/domain/experience/experience-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

type View = "bootstrapping" | "unconfigured" | "unauthenticated" | "no_organization" | "scoped";

function pageStatusFor(status: ContextStatus, context: ActiveContext): View {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") return context.organizationId !== null ? "scoped" : "no_organization";
  return "bootstrapping";
}

export default function ExperienceAnalyticsPage() {
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
  const [kpis, setKpis] = useState<ExperienceKPIs | null>(null);
  const [trends, setTrends] = useState<ExperienceTrendPoint[]>([]);
  const [categories, setCategories] = useState<CategoryBreakdown[]>([]);
  const [departments, setDepartments] = useState<DepartmentPerformance[]>([]);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || !orgId || !canView) return;
    setLoading(true);
    setError(null);
    try {
      if (propId) ensureExperienceDemoSeeded(orgId, propId);
      else ensureExperienceDemoSeeded(orgId, "prop_default" as EntityId);

      setKpis(getExperienceKPIs(orgId));
      setTrends([...getExperienceTrends(orgId, 14)]);
      setCategories([...getCategoryBreakdown(orgId)]);
      setDepartments([...getDepartmentPerformance(orgId)]);
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setLoading(false);
    }
  }, [view, orgId, propId, canView]);

  if (view === "bootstrapping" || loading) {
    return <LoadingBlock label="Loading analytics…" />;
  }

  if (!canView) {
    return (
      <EmptyState
        icon={<BarChart3 />}
        title="Experience Analytics"
        description="You don't have permission to view analytics."
      />
    );
  }

  if (error) {
    return <EmptyState icon={<AlertTriangle />} title="Error" description={error} />;
  }

  const maxTrendCount = Math.max(...trends.map((t) => Math.max(t.feedbackCount, t.complaintCount)), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#17201B]">Experience Analytics</h1>
        <p className="text-sm text-[#66706A] mt-1">
          Trends, category insights, and department performance
        </p>
      </div>

      {/* KPI Summary */}
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <Card className="p-4">
            <p className="text-xs text-[#66706A]">Total</p>
            <p className="text-xl font-bold text-[#17201B]">{kpis.totalRecords}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-[#66706A]">Avg Rating</p>
            <p className="text-xl font-bold text-[#17201B] flex items-center gap-1">
              {kpis.averageRating || "—"}
              {kpis.averageRating > 0 && <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" />}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-[#66706A]">SLA Compliance</p>
            <p className={`text-xl font-bold ${kpis.slaCompliancePercent >= 80 ? "text-green-600" : kpis.slaCompliancePercent >= 60 ? "text-amber-600" : "text-red-600"}`}>
              {kpis.slaCompliancePercent}%
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-[#66706A]">Response Time</p>
            <p className="text-xl font-bold text-[#17201B]">{kpis.averageResponseTimeHours}h</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-[#66706A]">Recovery Rate</p>
            <p className="text-xl font-bold text-[#17201B]">{kpis.recoverySuccessRate}%</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-[#66706A]">Follow-up Rate</p>
            <p className="text-xl font-bold text-[#17201B]">{kpis.followUpCompletionRate}%</p>
          </Card>
        </div>
      )}

      {/* Trends */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-[#17201B] mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[#66706A]" />
          14-Day Trend
        </h3>
        <div className="flex items-end gap-1 h-32">
          {trends.map((t) => (
            <div key={t.date} className="flex-1 flex flex-col items-center gap-0.5">
              <div className="w-full flex flex-col gap-px">
                <div
                  className="w-full bg-blue-400 rounded-t-sm"
                  style={{ height: `${(t.feedbackCount / maxTrendCount) * 48}px`, minHeight: t.feedbackCount > 0 ? "4px" : "0" }}
                  title={`Feedback: ${t.feedbackCount}`}
                />
                <div
                  className="w-full bg-red-400"
                  style={{ height: `${(t.complaintCount / maxTrendCount) * 48}px`, minHeight: t.complaintCount > 0 ? "4px" : "0" }}
                  title={`Complaints: ${t.complaintCount}`}
                />
                <div
                  className="w-full bg-green-400 rounded-b-sm"
                  style={{ height: `${(t.resolvedCount / maxTrendCount) * 48}px`, minHeight: t.resolvedCount > 0 ? "4px" : "0" }}
                  title={`Resolved: ${t.resolvedCount}`}
                />
              </div>
              <span className="text-[9px] text-[#66706A] mt-1 -rotate-45 origin-left whitespace-nowrap">
                {t.date.slice(5)}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 mt-3">
          <span className="text-xs text-[#66706A] flex items-center gap-1">
            <span className="w-3 h-3 bg-blue-400 rounded-sm" /> Feedback
          </span>
          <span className="text-xs text-[#66706A] flex items-center gap-1">
            <span className="w-3 h-3 bg-red-400 rounded-sm" /> Complaints
          </span>
          <span className="text-xs text-[#66706A] flex items-center gap-1">
            <span className="w-3 h-3 bg-green-400 rounded-sm" /> Resolved
          </span>
        </div>
      </Card>

      {/* Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-[#17201B] mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#66706A]" />
            Category Breakdown
          </h3>
          {categories.length === 0 ? (
            <p className="text-xs text-[#66706A] py-4 text-center">No data</p>
          ) : (
            <div className="space-y-2">
              {categories
                .sort((a, b) => b.count - a.count)
                .map((c) => (
                  <div key={c.category} className="flex items-center justify-between py-1.5 border-b border-[#E3E7E3] last:border-0">
                    <span className="text-sm text-[#17201B]">{c.category.replace(/_/g, " ")}</span>
                    <div className="flex items-center gap-3">
                      <Badge tone="neutral">{c.count}</Badge>
                      {c.averageRating > 0 && (
                        <span className="text-xs text-yellow-600 flex items-center gap-0.5">
                          <Star className="w-3 h-3 fill-yellow-500" />
                          {c.averageRating}
                        </span>
                      )}
                      {c.sentimentScore !== 0 && (
                        c.sentimentScore > 0
                          ? <TrendingUp className="w-3 h-3 text-green-500" />
                          : <TrendingDown className="w-3 h-3 text-red-500" />
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </Card>

        {/* Department Performance */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-[#17201B] mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#66706A]" />
            Department Performance
          </h3>
          {departments.length === 0 ? (
            <p className="text-xs text-[#66706A] py-4 text-center">No data</p>
          ) : (
            <div className="space-y-3">
              {departments.map((d) => (
                <div key={d.departmentId} className="p-3 rounded-lg border border-[#E3E7E3]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-[#17201B]">{d.departmentName}</span>
                    <Badge tone={d.slaCompliancePercent >= 80 ? "success" : d.slaCompliancePercent >= 60 ? "warning" : "danger"}>
                      SLA {d.slaCompliancePercent}%
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-[#66706A]">
                    <span>{d.totalRecords} records</span>
                    <span>{d.openRecords} open</span>
                    <span>Avg {d.averageResolutionTimeHours}h</span>
                    {d.averageRating > 0 && (
                      <span className="text-yellow-600 flex items-center gap-0.5">
                        <Star className="w-3 h-3 fill-yellow-500" />
                        {d.averageRating}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Sentiment distribution */}
      {kpis && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-[#17201B] mb-3">Sentiment Distribution</h3>
          <div className="flex items-center gap-2 h-8">
            {kpis.sentimentPositive + kpis.sentimentNeutral + kpis.sentimentNegative > 0 && (
              <>
                <div
                  className="h-full bg-green-400 rounded-l-lg flex items-center justify-center"
                  style={{ width: `${(kpis.sentimentPositive / (kpis.sentimentPositive + kpis.sentimentNeutral + kpis.sentimentNegative)) * 100}%` }}
                >
                  <span className="text-xs font-medium text-white">{kpis.sentimentPositive}</span>
                </div>
                <div
                  className="h-full bg-gray-300 flex items-center justify-center"
                  style={{ width: `${(kpis.sentimentNeutral / (kpis.sentimentPositive + kpis.sentimentNeutral + kpis.sentimentNegative)) * 100}%` }}
                >
                  <span className="text-xs font-medium text-gray-700">{kpis.sentimentNeutral}</span>
                </div>
                <div
                  className="h-full bg-red-400 rounded-r-lg flex items-center justify-center"
                  style={{ width: `${(kpis.sentimentNegative / (kpis.sentimentPositive + kpis.sentimentNeutral + kpis.sentimentNegative)) * 100}%` }}
                >
                  <span className="text-xs font-medium text-white">{kpis.sentimentNegative}</span>
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-4 mt-2">
            <span className="text-xs text-[#66706A] flex items-center gap-1">
              <span className="w-3 h-3 bg-green-400 rounded-sm" /> Positive
            </span>
            <span className="text-xs text-[#66706A] flex items-center gap-1">
              <span className="w-3 h-3 bg-gray-300 rounded-sm" /> Neutral
            </span>
            <span className="text-xs text-[#66706A] flex items-center gap-1">
              <span className="w-3 h-3 bg-red-400 rounded-sm" /> Negative
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}
