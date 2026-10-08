/**
 * Hotel Experience — experience records filtered to hotel-related categories.
 */

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Bed,
  Star,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import type { EntityId } from "@/domain/identity/types";
import { can, type ActiveContext } from "@/domain/identity/types";
import type { ExperienceRecord } from "@/domain/experience/types";
import {
  listExperienceRecords,
  getExperienceKPIs,
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

const HOTEL_CATEGORIES = new Set(["ROOM", "CLEANLINESS", "HOUSEKEEPING", "CHECK_IN", "CHECK_OUT", "MAINTENANCE", "AMBIENCE"]);

export default function HotelExperiencePage() {
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
  const [records, setRecords] = useState<ExperienceRecord[]>([]);

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

      const all = listExperienceRecords(orgId);
      setRecords(all.filter((r) => HOTEL_CATEGORIES.has(r.category)) as ExperienceRecord[]);
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setLoading(false);
    }
  }, [view, orgId, propId, canView]);

  if (view === "bootstrapping" || loading) {
    return <LoadingBlock label="Loading hotel experience…" />;
  }

  if (!canView) {
    return <EmptyState icon={<Bed />} title="Hotel Experience" description="You don't have permission to view this." />;
  }

  if (error) {
    return <EmptyState icon={<AlertTriangle />} title="Error" description={error} />;
  }

  const kpis = orgId ? getExperienceKPIs(orgId) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#17201B]">Hotel Experience</h1>
        <p className="text-sm text-[#66706A] mt-1">Room, housekeeping, check-in/out and maintenance experience</p>
      </div>

      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <p className="text-xs text-[#66706A]">Hotel Records</p>
            <p className="text-xl font-bold text-[#17201B]">{records.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-[#66706A]">Avg Rating</p>
            <p className="text-xl font-bold text-[#17201B]">{kpis.averageRating || "—"}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-[#66706A]">SLA Compliance</p>
            <p className="text-xl font-bold text-[#17201B]">{kpis.slaCompliancePercent}%</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-[#66706A]">Open Issues</p>
            <p className="text-xl font-bold text-[#17201B]">{records.filter((r) => r.status !== "RESOLVED" && r.status !== "CLOSED").length}</p>
          </Card>
        </div>
      )}

      {records.length === 0 ? (
        <EmptyState icon={<Bed />} title="No hotel experience records" description="Hotel-related feedback and complaints will appear here." />
      ) : (
        <div className="space-y-2">
          {records.map((r) => (
            <Link key={r.id} to={`/experience/${r.id}`}>
              <Card className="p-4 hover:border-[#C9972E] transition-colors cursor-pointer">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-[#17201B]">{r.title}</span>
                      <Badge tone={r.status === "RESOLVED" ? "success" : "warning"}>{r.status.replace(/_/g, " ")}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[#66706A]">
                      <span>{r.guestName}</span>
                      {r.roomNumber && <span>Room {r.roomNumber}</span>}
                      <span>{r.category.replace(/_/g, " ")}</span>
                      {r.categoryRatings.length > 0 && (
                        <span className="text-yellow-600 flex items-center gap-0.5">
                          <Star className="w-3 h-3 fill-yellow-500" />
                          {(r.categoryRatings.reduce((s, cr) => s + cr.rating, 0) / r.categoryRatings.length).toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge tone={r.priority === "CRITICAL" || r.priority === "URGENT" ? "danger" : r.priority === "HIGH" ? "warning" : "neutral"}>
                    {r.priority}
                  </Badge>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
