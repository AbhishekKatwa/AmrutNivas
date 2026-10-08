import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  Megaphone,
  Plus,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import type { EntityId } from "@/domain/identity/types";
import { can, type ActiveContext } from "@/domain/identity/types";
import type { MarketingCampaign, CampaignStatus } from "@/domain/marketing/types";
import { CAMPAIGN_STATUSES } from "@/domain/marketing/types";
import { listCampaigns } from "@/domain/marketing/marketing-service";
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

function statusTone(s: string): "success" | "warning" | "danger" | "neutral" {
  switch (s) {
    case "RUNNING": return "success";
    case "SCHEDULED": return "neutral";
    case "REVIEW": return "neutral";
    case "APPROVED": return "neutral";
    case "PAUSED": return "warning";
    case "COMPLETED": return "neutral";
    case "CANCELLED": return "danger";
    default: return "neutral";
  }
}

export default function CampaignListPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const orgId = context.organizationId as EntityId | null;

  const canView = can("marketing.campaign.view", permissions);
  const canCreate = can("marketing.campaign.create", permissions);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || !orgId || !canView) return;
    setLoading(true);
    setError(null);
    try {
      setCampaigns([...listCampaigns(orgId)]);
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setLoading(false);
    }
  }, [view, orgId, canView]);

  if (view === "bootstrapping" || loading) {
    return <LoadingBlock label="Loading campaigns…" />;
  }

  if (!canView) {
    return (
      <EmptyState
        icon={<Megaphone />}
        title="Campaigns"
        description="You don't have permission to view campaigns."
      />
    );
  }

  if (error) {
    return <EmptyState icon={<AlertTriangle />} title="Error" description={error} />;
  }

  const filtered = campaigns.filter((c) => {
    if (statusFilter !== "ALL" && c.status !== statusFilter) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#17201B]">Campaigns</h1>
          <p className="text-sm text-[#66706A] mt-1">
            Create, manage, and track marketing campaigns across all channels
          </p>
        </div>
        {canCreate && (
          <Link to="/marketing/campaigns/new">
            <Button variant="primary" size="sm">
              <Plus className="w-4 h-4 mr-1" /> New Campaign
            </Button>
          </Link>
        )}
      </div>

      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#66706A]" />
            <input
              type="text"
              placeholder="Search campaigns…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-[#E3E7E3] rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as CampaignStatus | "ALL")}
            className="px-3 py-2 text-sm border border-[#E3E7E3] rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="ALL">All Statuses</option>
            {CAMPAIGN_STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Megaphone />}
          title="No campaigns found"
          description={search || statusFilter !== "ALL" ? "Try adjusting your filters." : "Create your first campaign to get started."}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => (
            <Link
              key={c.id}
              to={`/marketing/campaigns/${c.id}`}
              className="block"
            >
              <Card className="p-4 hover:border-indigo-200 transition-colors cursor-pointer">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-indigo-50 mt-0.5">
                      <Megaphone className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-[#17201B] truncate">{c.name}</h3>
                        <Badge tone={statusTone(c.status)}>{c.status.replace(/_/g, " ")}</Badge>
                      </div>
                      <p className="text-xs text-[#66706A] mt-1">
                        {c.campaignType.replace(/_/g, " ")} · {c.objective?.replace(/_/g, " ") ?? "No objective"}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-[#66706A]">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {c.startAt ? new Date(c.startAt).toLocaleDateString() : "—"}
                          {c.endAt && ` → ${new Date(c.endAt).toLocaleDateString()}`}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {c.budget != null && (
                      <p className="text-sm font-semibold text-[#17201B]">₹{c.budget.toLocaleString()}</p>
                    )}
                    <p className="text-xs text-[#66706A]">budget</p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
