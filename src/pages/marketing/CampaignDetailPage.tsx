import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Megaphone,
  Pause,
  Play,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import type { EntityId } from "@/domain/identity/types";
import { can, type ActiveContext } from "@/domain/identity/types";
import type {
  MarketingCampaign,
  CampaignPerformance,
  MessageDelivery,
  MarketingFunnelPoint,
} from "@/domain/marketing/types";
import {
  getCampaign,
  getCampaignPerformance,
  listDeliveries,
  getMarketingFunnel,
  transitionCampaignStatus,
  validateCampaignForLaunch,
} from "@/domain/marketing/marketing-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

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

function deliveryTone(s: string): "success" | "warning" | "danger" | "neutral" {
  switch (s) {
    case "DELIVERED": case "OPENED": case "CLICKED": return "success";
    case "QUEUED": case "SENT": return "neutral";
    case "FAILED": return "danger";
    case "UNSUBSCRIBED": return "warning";
    default: return "neutral";
  }
}

export default function CampaignDetailPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const canView = can("marketing.campaign.view", permissions);
  const canLaunch = can("marketing.campaign.launch", permissions);
  const canApprove = can("marketing.campaign.approve", permissions);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<MarketingCampaign | null>(null);
  const [performance, setPerformance] = useState<CampaignPerformance | null>(null);
  const [deliveries, setDeliveries] = useState<MessageDelivery[]>([]);
  const [funnel, setFunnel] = useState<MarketingFunnelPoint[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || !campaignId || !canView) return;
    setLoading(true);
    setError(null);
    try {
      const c = getCampaign(campaignId as EntityId);
      if (c) {
        setCampaign(c);
        setPerformance(getCampaignPerformance(c.id));
        setDeliveries([...listDeliveries(c.id)]);
        setFunnel([...getMarketingFunnel(c.id)]);
        setValidationErrors([...validateCampaignForLaunch(c.id)]);
      }
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setLoading(false);
    }
  }, [view, campaignId, canView]);

  const handleTransition = (target: string) => {
    if (!campaign) return;
    try {
      transitionCampaignStatus(campaign.id, target as any);
      setCampaign({ ...campaign, status: target as any });
    } catch (err) {
      setError(toPublicError(err).message);
    }
  };

  if (view === "bootstrapping" || loading) {
    return <LoadingBlock label="Loading campaign…" />;
  }

  if (!canView || !campaign) {
    return (
      <EmptyState
        icon={<Megaphone />}
        title="Campaign not found"
        description={!canView ? "You don't have permission to view this campaign." : "This campaign does not exist."}
      />
    );
  }

  if (error) {
    return <EmptyState icon={<AlertTriangle />} title="Error" description={error} />;
  }

  const perf = performance;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/marketing/campaigns">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-[#17201B]">{campaign.name}</h1>
            <Badge tone={statusTone(campaign.status)}>{campaign.status.replace(/_/g, " ")}</Badge>
          </div>
          <p className="text-sm text-[#66706A] mt-1">
            {campaign.campaignType.replace(/_/g, " ")} · {campaign.objective?.replace(/_/g, " ") ?? "No objective"}
          </p>
        </div>
        <div className="flex gap-2">
          {campaign.status === "DRAFT" && canLaunch && (
            <Button variant="primary" size="sm" onClick={() => handleTransition("SCHEDULED")}>
              <Calendar className="w-4 h-4 mr-1" /> Schedule
            </Button>
          )}
          {campaign.status === "SCHEDULED" && canLaunch && (
            <Button variant="primary" size="sm" onClick={() => handleTransition("RUNNING")}>
              <Play className="w-4 h-4 mr-1" /> Launch
            </Button>
          )}
          {campaign.status === "RUNNING" && canLaunch && (
            <Button variant="secondary" size="sm" onClick={() => handleTransition("PAUSED")}>
              <Pause className="w-4 h-4 mr-1" /> Pause
            </Button>
          )}
          {campaign.status === "PAUSED" && canLaunch && (
            <Button variant="primary" size="sm" onClick={() => handleTransition("RUNNING")}>
              <Play className="w-4 h-4 mr-1" /> Resume
            </Button>
          )}
          {campaign.status === "REVIEW" && canApprove && (
            <Button variant="primary" size="sm" onClick={() => handleTransition("APPROVED")}>
              <CheckCircle2 className="w-4 h-4 mr-1" /> Approve
            </Button>
          )}
          {(campaign.status === "DRAFT" || campaign.status === "SCHEDULED") && canLaunch && (
            <Button variant="danger" size="sm" onClick={() => handleTransition("CANCELLED")}>
              <XCircle className="w-4 h-4 mr-1" /> Cancel
            </Button>
          )}
        </div>
      </div>

      {validationErrors.length > 0 && campaign.status === "DRAFT" && (
        <Card className="p-4 border-amber-200 bg-amber-50">
          <p className="text-sm font-medium text-amber-800 mb-2">Launch checklist:</p>
          <ul className="text-xs text-amber-700 space-y-1">
            {validationErrors.map((e, i) => (
              <li key={i}>· {e}</li>
            ))}
          </ul>
        </Card>
      )}

      {perf && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <Card className="p-4">
            <p className="text-xs text-[#66706A]">Reach</p>
            <p className="text-xl font-bold text-[#17201B]">{perf.totalSent.toLocaleString()}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-[#66706A]">Delivered</p>
            <p className="text-xl font-bold text-[#17201B]">{perf.totalDelivered.toLocaleString()}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-[#66706A]">Opened</p>
            <p className="text-xl font-bold text-[#17201B]">{perf.totalOpened.toLocaleString()}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-[#66706A]">Clicked</p>
            <p className="text-xl font-bold text-[#17201B]">{perf.totalClicked.toLocaleString()}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-[#66706A]">Conversions</p>
            <p className="text-xl font-bold text-[#17201B]">{perf.totalConversions}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-[#66706A]">Revenue</p>
            <p className="text-xl font-bold text-[#17201B]">₹{perf.attributedRevenue.toLocaleString()}</p>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-[#17201B] mb-4">Campaign Details</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-[#66706A]">Audience</span>
              <span className="text-sm font-medium text-[#17201B]">{perf ? `${perf.audienceSize.toLocaleString()} contacts` : "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-[#66706A]">Type</span>
              <span className="text-sm font-medium text-[#17201B]">{campaign.campaignType.replace(/_/g, " ")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-[#66706A]">Start Date</span>
              <span className="text-sm font-medium text-[#17201B]">
                {campaign.startAt ? new Date(campaign.startAt).toLocaleDateString() : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-[#66706A]">End Date</span>
              <span className="text-sm font-medium text-[#17201B]">
                {campaign.endAt ? new Date(campaign.endAt).toLocaleDateString() : "—"}
              </span>
            </div>
            {campaign.budget != null && (
              <div className="flex justify-between">
                <span className="text-sm text-[#66706A]">Budget</span>
                <span className="text-sm font-medium text-[#17201B]">₹{campaign.budget.toLocaleString()}</span>
              </div>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold text-[#17201B] mb-4">Conversion Funnel</h3>
          {funnel.length === 0 ? (
            <p className="text-sm text-[#66706A]">No funnel data yet.</p>
          ) : (
            <div className="space-y-2">
              {funnel.map((f) => {
                const maxCount = funnel[0]?.count ?? 1;
                const pct = maxCount > 0 ? (f.count / maxCount) * 100 : 0;
                return (
                  <div key={f.stage}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-[#17201B]">{f.stage.replace(/_/g, " ")}</span>
                      <span className="text-xs text-[#66706A]">{f.count.toLocaleString()}</span>
                    </div>
                    <div className="h-2 bg-[#E3E7E3] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-[#17201B] mb-4">Recent Deliveries</h3>
        {deliveries.length === 0 ? (
          <p className="text-sm text-[#66706A]">No deliveries recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E3E7E3]">
                  <th className="text-left py-2 px-3 text-xs font-medium text-[#66706A]">Channel</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-[#66706A]">Recipient</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-[#66706A]">Status</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-[#66706A]">Sent</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.slice(0, 10).map((d) => (
                  <tr key={d.id} className="border-b border-[#E3E7E3] last:border-0">
                    <td className="py-2 px-3 text-[#17201B]">{d.channel}</td>
                    <td className="py-2 px-3 text-[#66706A] truncate max-w-[200px]">{d.customerId}</td>
                    <td className="py-2 px-3">
                      <Badge tone={deliveryTone(d.status)}>{d.status.replace(/_/g, " ")}</Badge>
                    </td>
                    <td className="py-2 px-3 text-[#66706A]">
                      {d.sentAt ? new Date(d.sentAt).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
