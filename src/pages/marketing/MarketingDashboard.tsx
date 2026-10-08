import { useEffect, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Gift,
  Mail,
  Megaphone,
  Pause,
  Play,
  Send,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import type { EntityId } from "@/domain/identity/types";
import { can, type ActiveContext } from "@/domain/identity/types";
import type {
  MarketingKPIs,
  MarketingCampaign,
  MarketingOffer,
  ChannelPerformance,
} from "@/domain/marketing/types";
import {
  listCampaigns,
  listOffers,
  getMarketingKPIs,
  getChannelPerformance,
} from "@/domain/marketing/marketing-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";
import { Link } from "react-router-dom";

type DashboardView = "bootstrapping" | "unconfigured" | "unauthenticated" | "no_organization" | "scoped";

function pageStatusFor(status: ContextStatus, context: ActiveContext): DashboardView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") return context.organizationId !== null ? "scoped" : "no_organization";
  return "bootstrapping";
}

function statusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "RUNNING":
    case "ACTIVE":
      return "success";
    case "SCHEDULED":
    case "PENDING_APPROVAL":
      return "neutral";
    case "PAUSED":
      return "warning";
    case "COMPLETED":
    case "ARCHIVED":
      return "neutral";
    case "CANCELLED":
    case "FAILED":
      return "danger";
    default:
      return "neutral";
  }
}

function channelIcon(ch: string) {
  switch (ch) {
    case "EMAIL": return <Mail className="w-4 h-4" />;
    case "SMS": return <Send className="w-4 h-4" />;
    case "WHATSAPP": return <Send className="w-4 h-4" />;
    case "PUSH": return <Megaphone className="w-4 h-4" />;
    default: return <Megaphone className="w-4 h-4" />;
  }
}

export default function MarketingDashboard() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const orgId = context.organizationId as EntityId | null;

  const canView = can("marketing.view", permissions);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kpis, setKpis] = useState<MarketingKPIs | null>(null);
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [offers, setOffers] = useState<MarketingOffer[]>([]);
  const [channels, setChannels] = useState<ChannelPerformance[]>([]);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || !orgId || !canView) return;
    setLoading(true);
    setError(null);
    try {
      setKpis(getMarketingKPIs(orgId));
      setCampaigns([...listCampaigns(orgId).slice(0, 8)]);
      setOffers([...listOffers(orgId).slice(0, 5)]);
      setChannels([...getChannelPerformance(orgId)]);
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setLoading(false);
    }
  }, [view, orgId, canView]);

  if (view === "bootstrapping" || loading) {
    return <LoadingBlock label="Loading marketing dashboard…" />;
  }

  if (!canView) {
    return (
      <EmptyState
        icon={<Megaphone />}
        title="Marketing"
        description="You don't have permission to view the marketing dashboard."
      />
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={<Megaphone />}
        title="Something went wrong"
        description={error}
      />
    );
  }

  const activeCampaigns = campaigns.filter((c) => c.status === "RUNNING");
  const scheduledCampaigns = campaigns.filter((c) => c.status === "SCHEDULED");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#17201B]">Marketing & Engagement</h1>
          <p className="text-sm text-[#66706A] mt-1">
            Campaigns, audiences, offers, and customer engagement intelligence
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/marketing/audiences">
            <Button variant="secondary" size="sm">Audiences</Button>
          </Link>
          <Link to="/marketing/offers">
            <Button variant="secondary" size="sm">Offers</Button>
          </Link>
          <Link to="/marketing/campaigns">
            <Button variant="primary" size="sm">Campaigns</Button>
          </Link>
        </div>
      </div>

      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-50">
                <Megaphone className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-xs text-[#66706A]">Campaigns</p>
                <p className="text-xl font-bold text-[#17201B]">{campaigns.length}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-50">
                <Play className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-[#66706A]">Active</p>
                <p className="text-xl font-bold text-[#17201B]">{kpis.activeCampaigns}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-[#66706A]">Reach</p>
                <p className="text-xl font-bold text-[#17201B]">{kpis.totalReach.toLocaleString()}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-50">
                <Target className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-[#66706A]">Conversions</p>
                <p className="text-xl font-bold text-[#17201B]">{kpis.totalConversions}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-50">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-[#66706A]">Revenue</p>
                <p className="text-xl font-bold text-[#17201B]">₹{kpis.totalAttributedRevenue.toLocaleString()}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-50">
                <Gift className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-[#66706A]">Redemptions</p>
                <p className="text-xl font-bold text-[#17201B]">{kpis.totalOfferRedemptions}</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[#17201B]">Active Campaigns</h3>
            <Link to="/marketing/campaigns" className="text-xs text-indigo-600 hover:underline">
              View all
            </Link>
          </div>
          {activeCampaigns.length === 0 && scheduledCampaigns.length === 0 ? (
            <p className="text-sm text-[#66706A] py-4">No active or scheduled campaigns.</p>
          ) : (
            <div className="space-y-3">
              {[...activeCampaigns, ...scheduledCampaigns].map((c) => (
                <Link
                  key={c.id}
                  to={`/marketing/campaigns/${c.id}`}
                  className="flex items-center justify-between p-3 rounded-lg border border-[#E3E7E3] hover:bg-[#F7F8F5] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-indigo-50">
                      <Megaphone className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#17201B] truncate">{c.name}</p>
                      <p className="text-xs text-[#66706A]">{c.campaignType.replace(/_/g, " ")} · {c.objective?.replace(/_/g, " ") ?? "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={statusTone(c.status)}>{c.status.replace(/_/g, " ")}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold text-[#17201B] mb-4">Channel Performance</h3>
          {channels.length === 0 ? (
            <p className="text-sm text-[#66706A] py-4">No channel data yet.</p>
          ) : (
            <div className="space-y-3">
              {channels.map((ch) => (
                <div key={ch.channel} className="flex items-center gap-3">
                  <div className="p-1.5 rounded bg-[#F7F8F5] text-[#66706A]">
                    {channelIcon(ch.channel)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-[#17201B]">{ch.channel}</span>
                      <span className="text-xs text-[#66706A]">{ch.totalSent.toLocaleString()} sent</span>
                    </div>
                    <div className="mt-1 h-1.5 bg-[#E3E7E3] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full"
                        style={{ width: `${ch.deliveryRate}%` }}
                      />
                    </div>
                    <p className="text-xs text-[#66706A] mt-0.5">
                      {ch.deliveryRate}% delivered · {ch.totalSent > 0 ? Math.round(ch.totalConversions / ch.totalSent * 100) : 0}% converted
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[#17201B]">Active Offers</h3>
            <Link to="/marketing/offers" className="text-xs text-indigo-600 hover:underline">
              View all
            </Link>
          </div>
          {offers.length === 0 ? (
            <p className="text-sm text-[#66706A] py-4">No active offers.</p>
          ) : (
            <div className="space-y-3">
              {offers.map((o) => (
                <div key={o.id} className="flex items-center justify-between p-3 rounded-lg border border-[#E3E7E3]">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-50">
                      <Gift className="w-4 h-4 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[#17201B]">{o.name}</p>
                      <p className="text-xs text-[#66706A]">{o.offerType.replace(/_/g, " ")} · {o.scope?.replace(/_/g, " ") ?? "—"}</p>
                    </div>
                  </div>
                  <Badge tone={o.status === "ACTIVE" ? "success" : "neutral"}>{o.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold text-[#17201B] mb-4">Quick Stats</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-sm text-[#17201B]">Delivery Rate</span>
              </div>
              <span className="text-sm font-semibold text-[#17201B]">
                {kpis ? `${kpis.averageDeliveryRate}%` : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-amber-600" />
                <span className="text-sm text-[#17201B]">Conversion Rate</span>
              </div>
              <span className="text-sm font-semibold text-[#17201B]">
                {kpis ? `${kpis.totalReach > 0 ? Math.round(kpis.totalConversions / kpis.totalReach * 100) : 0}%` : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                <span className="text-sm text-[#17201B]">Scheduled</span>
              </div>
              <span className="text-sm font-semibold text-[#17201B]">{scheduledCampaigns.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Pause className="w-4 h-4 text-amber-600" />
                <span className="text-sm text-[#17201B]">Paused</span>
              </div>
              <span className="text-sm font-semibold text-[#17201B]">
                {campaigns.filter((c) => c.status === "PAUSED").length}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-600" />
                <span className="text-sm text-[#17201B]">Attributed Revenue</span>
              </div>
              <span className="text-sm font-semibold text-[#17201B]">
                {kpis ? `₹${kpis.totalAttributedRevenue.toLocaleString()}` : "—"}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
