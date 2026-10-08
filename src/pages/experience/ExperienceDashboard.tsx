/**
 * Experience Dashboard — guest experience command center.
 *
 * KPIs, trends, attention items, and quick navigation to feedback, complaints,
 * analytics, and domain-specific experience views. Reads from the in-memory
 * experience service.
 */

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  Heart,
  MessageSquare,
  Star,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import type { EntityId } from "@/domain/identity/types";
import { can, type ActiveContext } from "@/domain/identity/types";
import type {
  ExperienceKPIs,
  ExperienceRecord,
  CategoryBreakdown,
} from "@/domain/experience/types";
import {
  listExperienceRecords,
  getExperienceKPIs,
  getCategoryBreakdown,
  getOverdueRecords,
  ensureExperienceDemoSeeded,
} from "@/domain/experience/experience-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";
import { Link } from "react-router-dom";

type DashboardView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_organization"
  | "scoped";

function pageStatusFor(status: ContextStatus, context: ActiveContext): DashboardView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null ? "scoped" : "no_organization";
  }
  return "bootstrapping";
}

export default function ExperienceDashboard() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const orgId = context.organizationId as EntityId | null;
  const propId = context.propertyId as EntityId | null;

  const canView = can("experience.view", permissions);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kpis, setKpis] = useState<ExperienceKPIs | null>(null);
  const [records, setRecords] = useState<ExperienceRecord[]>([]);
  const [categories, setCategories] = useState<CategoryBreakdown[]>([]);
  const [overdue, setOverdue] = useState<ExperienceRecord[]>([]);

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
      setRecords([...listExperienceRecords(orgId).slice(0, 10)]);
      setCategories([...getCategoryBreakdown(orgId)]);
      setOverdue([...getOverdueRecords(orgId)]);
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setLoading(false);
    }
  }, [view, orgId, propId, canView]);

  if (view === "bootstrapping" || loading) {
    return <LoadingBlock label="Loading experience dashboard…" />;
  }

  if (!canView) {
    return (
      <EmptyState
        icon={<MessageSquare />}
        title="Guest Experience"
        description="You don't have permission to view the experience dashboard."
      />
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={<AlertTriangle />}
        title="Something went wrong"
        description={error}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#17201B]">Guest Experience</h1>
          <p className="text-sm text-[#66706A] mt-1">
            Feedback, complaints, service recovery, and reputation intelligence
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/experience/feedback">
            <Button variant="secondary" size="sm">Feedback</Button>
          </Link>
          <Link to="/experience/complaints">
            <Button variant="secondary" size="sm">Complaints</Button>
          </Link>
          <Link to="/experience/analytics">
            <Button variant="primary" size="sm">Analytics</Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50">
                <MessageSquare className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-[#66706A]">Total Records</p>
                <p className="text-xl font-bold text-[#17201B]">{kpis.totalRecords}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-50">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-[#66706A]">Open</p>
                <p className="text-xl font-bold text-[#17201B]">{kpis.openRecords}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-50">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-[#66706A]">Resolved</p>
                <p className="text-xl font-bold text-[#17201B]">{kpis.resolvedRecords}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-50">
                <Star className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-xs text-[#66706A]">Avg Rating</p>
                <p className="text-xl font-bold text-[#17201B]">{kpis.averageRating || "—"}</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Sentiment & SLA */}
      {kpis && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-[#17201B] mb-3">Sentiment</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#66706A]">Positive</span>
                <Badge tone="success">{kpis.sentimentPositive}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#66706A]">Neutral</span>
                <Badge tone="neutral">{kpis.sentimentNeutral}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#66706A]">Negative</span>
                <Badge tone="danger">{kpis.sentimentNegative}</Badge>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-[#17201B] mb-3">SLA Compliance</h3>
            <div className="flex items-center gap-3">
              <div className={`text-3xl font-bold ${kpis.slaCompliancePercent >= 80 ? "text-green-600" : kpis.slaCompliancePercent >= 60 ? "text-amber-600" : "text-red-600"}`}>
                {kpis.slaCompliancePercent}%
              </div>
              <div className="text-xs text-[#66706A]">
                <p>Response: {kpis.averageResponseTimeHours}h</p>
                <p>Resolution: {kpis.averageResolutionTimeHours}h</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-[#17201B] mb-3">Recovery</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#66706A]">Success Rate</span>
                <Badge tone={kpis.recoverySuccessRate >= 70 ? "success" : "warning"}>
                  {kpis.recoverySuccessRate}%
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#66706A]">Follow-up Rate</span>
                <Badge tone={kpis.followUpCompletionRate >= 70 ? "success" : "warning"}>
                  {kpis.followUpCompletionRate}%
                </Badge>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Overdue & Recent */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Overdue Items */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-[#17201B] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              Overdue ({overdue.length})
            </h3>
          </div>
          {overdue.length === 0 ? (
            <p className="text-xs text-[#66706A] py-4 text-center">No overdue items</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {overdue.slice(0, 5).map((r) => (
                <Link
                  key={r.id}
                  to={`/experience/${r.id}`}
                  className="block p-2 rounded-lg border border-red-100 bg-red-50/50 hover:bg-red-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[#17201B] truncate">
                      {r.title}
                    </span>
                    <Badge tone="danger">{r.priority}</Badge>
                  </div>
                  <p className="text-xs text-[#66706A] mt-1 truncate">{r.guestName}</p>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* Recent Records */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-[#17201B]">Recent Activity</h3>
            <Link to="/experience/feedback" className="text-xs text-blue-600 hover:underline">
              View all
            </Link>
          </div>
          {records.length === 0 ? (
            <p className="text-xs text-[#66706A] py-4 text-center">No records yet</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {records.slice(0, 5).map((r) => (
                <Link
                  key={r.id}
                  to={`/experience/${r.id}`}
                  className="block p-2 rounded-lg border border-[#E3E7E3] hover:bg-[#F7F8F5] transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[#17201B] truncate">
                      {r.title}
                    </span>
                    <Badge
                      tone={r.status === "RESOLVED" ? "success" : r.status === "CLOSED" ? "neutral" : "warning"}
                    >
                      {r.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-[#66706A]">{r.guestName}</span>
                    {r.sentiment && (
                      <Heart
                        className={`w-3 h-3 ${r.sentiment.label === "POSITIVE" ? "text-green-500 fill-green-500" : r.sentiment.label === "NEGATIVE" ? "text-red-500 fill-red-500" : "text-gray-400"}`}
                      />
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Category Breakdown */}
      {categories.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-[#17201B] mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#66706A]" />
            Category Breakdown
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {categories.slice(0, 8).map((c) => (
              <div key={c.category} className="p-3 rounded-lg border border-[#E3E7E3]">
                <p className="text-xs text-[#66706A]">{c.category.replace(/_/g, " ")}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-lg font-bold text-[#17201B]">{c.count}</span>
                  {c.averageRating > 0 && (
                    <span className="text-xs text-yellow-600 flex items-center gap-1">
                      <Star className="w-3 h-3 fill-yellow-500" />
                      {c.averageRating}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Quick Links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link to="/experience/hotel" className="block">
          <Card className="p-4 hover:border-blue-300 transition-colors cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50">
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#17201B]">Hotel</p>
                <p className="text-xs text-[#66706A]">Room & stay experience</p>
              </div>
            </div>
          </Card>
        </Link>
        <Link to="/experience/restaurant" className="block">
          <Card className="p-4 hover:border-green-300 transition-colors cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-50">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#17201B]">Restaurant</p>
                <p className="text-xs text-[#66706A]">Dining experience</p>
              </div>
            </div>
          </Card>
        </Link>
        <Link to="/experience/events" className="block">
          <Card className="p-4 hover:border-purple-300 transition-colors cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-50">
                <TrendingUp className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#17201B]">Events</p>
                <p className="text-xs text-[#66706A]">Event experience</p>
              </div>
            </div>
          </Card>
        </Link>
        <Link to="/experience/service-quality" className="block">
          <Card className="p-4 hover:border-amber-300 transition-colors cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-50">
                <Star className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#17201B]">Service Quality</p>
                <p className="text-xs text-[#66706A]">Standards & SLAs</p>
              </div>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
}
