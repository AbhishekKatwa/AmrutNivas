import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Gift,
  Mail,
  Megaphone,
  Send,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import type { EntityId } from "@/domain/identity/types";
import { can, type ActiveContext } from "@/domain/identity/types";
import type {
  MarketingKPIs,
  ChannelPerformance,
  CustomerGrowthPoint,
} from "@/domain/marketing/types";
import {
  getMarketingKPIs,
  getChannelPerformance,
  getCustomerGrowth,
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

function channelIcon(ch: string) {
  switch (ch) {
    case "EMAIL": return <Mail className="w-4 h-4" />;
    case "SMS": return <Send className="w-4 h-4" />;
    case "WHATSAPP": return <Send className="w-4 h-4" />;
    case "PUSH": return <Megaphone className="w-4 h-4" />;
    default: return <Megaphone className="w-4 h-4" />;
  }
}

export default function MarketingAnalyticsPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const orgId = context.organizationId as EntityId | null;

  const canView = can("marketing.analytics.view", permissions);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kpis, setKpis] = useState<MarketingKPIs | null>(null);
  const [channels, setChannels] = useState<ChannelPerformance[]>([]);
  const [growth, setGrowth] = useState<CustomerGrowthPoint[]>([]);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || !orgId || !canView) return;
    setLoading(true);
    setError(null);
    try {
      setKpis(getMarketingKPIs(orgId));
      setChannels([...getChannelPerformance(orgId)]);
      setGrowth([...getCustomerGrowth(orgId, 30)]);
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setLoading(false);
    }
  }, [view, orgId, canView]);

  if (view === "bootstrapping" || loading) {
    return <LoadingBlock label="Loading marketing analytics…" />;
  }

  if (!canView) {
    return (
      <EmptyState
        icon={<BarChart3 />}
        title="Marketing Analytics"
        description="You don't have permission to view marketing analytics."
      />
    );
  }

  if (error) {
    return <EmptyState icon={<AlertTriangle />} title="Error" description={error} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#17201B]">Marketing Analytics</h1>
        <p className="text-sm text-[#66706A] mt-1">
          Performance metrics, channel analysis, and customer engagement trends
        </p>
      </div>

      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Megaphone className="w-4 h-4 text-indigo-600" />
              <p className="text-xs text-[#66706A]">Active Campaigns</p>
            </div>
            <p className="text-xl font-bold text-[#17201B]">{kpis.activeCampaigns}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-blue-600" />
              <p className="text-xs text-[#66706A]">Total Reach</p>
            </div>
            <p className="text-xl font-bold text-[#17201B]">{kpis.totalReach.toLocaleString()}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4 text-amber-600" />
              <p className="text-xs text-[#66706A]">Conversions</p>
            </div>
            <p className="text-xl font-bold text-[#17201B]">{kpis.totalConversions}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <p className="text-xs text-[#66706A]">Revenue</p>
            </div>
            <p className="text-xl font-bold text-[#17201B]">₹{kpis.totalAttributedRevenue.toLocaleString()}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Gift className="w-4 h-4 text-purple-600" />
              <p className="text-xs text-[#66706A]">Redemptions</p>
            </div>
            <p className="text-xl font-bold text-[#17201B]">{kpis.totalOfferRedemptions}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-4 h-4 text-green-600" />
              <p className="text-xs text-[#66706A]">Delivery Rate</p>
            </div>
            <p className="text-xl font-bold text-[#17201B]">{kpis.averageDeliveryRate}%</p>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-[#17201B] mb-4">Channel Performance</h3>
          {channels.length === 0 ? (
            <p className="text-sm text-[#66706A]">No channel data available.</p>
          ) : (
            <div className="space-y-4">
              {channels.map((ch) => {
                const openRate = ch.totalSent > 0 ? Math.round(ch.totalOpened / ch.totalSent * 100) : 0;
                const convRate = ch.totalSent > 0 ? Math.round(ch.totalConversions / ch.totalSent * 100) : 0;
                return (
                <div key={ch.channel} className="p-3 rounded-lg border border-[#E3E7E3]">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded bg-indigo-50 text-indigo-600">
                        {channelIcon(ch.channel)}
                      </div>
                      <span className="text-sm font-medium text-[#17201B]">{ch.channel}</span>
                    </div>
                    <span className="text-xs text-[#66706A]">{ch.totalSent.toLocaleString()} sent</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-xs text-[#66706A]">Delivery</p>
                      <p className="text-sm font-bold text-[#17201B]">{ch.deliveryRate}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-[#66706A]">Open</p>
                      <p className="text-sm font-bold text-[#17201B]">{openRate}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-[#66706A]">Conversion</p>
                      <p className="text-sm font-bold text-[#17201B]">{convRate}%</p>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-[#E3E7E3] flex justify-between text-xs text-[#66706A]">
                    <span>Revenue: ₹{ch.attributedRevenue.toLocaleString()}</span>
                    <span>Engagement: {ch.engagementRate}%</span>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold text-[#17201B] mb-4">Customer Growth (30 days)</h3>
          {growth.length === 0 ? (
            <p className="text-sm text-[#66706A]">No growth data available.</p>
          ) : (
            <div className="space-y-2">
              {growth.slice(-7).map((g) => {
                const total = g.newCustomers + g.returningCustomers + g.reactivatedCustomers;
                const maxCustomers = Math.max(...growth.map((p) => p.newCustomers + p.returningCustomers + p.reactivatedCustomers), 1);
                const pct = (total / maxCustomers) * 100;
                return (
                  <div key={g.date}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-[#66706A]">{new Date(g.date).toLocaleDateString()}</span>
                      <span className="text-xs font-medium text-[#17201B]">{total.toLocaleString()}</span>
                    </div>
                    <div className="h-2 bg-[#E3E7E3] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
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

      {kpis && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-[#17201B] mb-4">Overall Performance</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-xs text-[#66706A] mb-1">Delivery Rate</p>
              <p className="text-2xl font-bold text-[#17201B]">{kpis.averageDeliveryRate}%</p>
            </div>
            <div>
              <p className="text-xs text-[#66706A] mb-1">Open Rate</p>
              <p className="text-2xl font-bold text-[#17201B]">{kpis.averageOpenRate}%</p>
            </div>
            <div>
              <p className="text-xs text-[#66706A] mb-1">Click Rate</p>
              <p className="text-2xl font-bold text-[#17201B]">{kpis.averageClickRate}%</p>
            </div>
            <div>
              <p className="text-xs text-[#66706A] mb-1">Conversion Rate</p>
              <p className="text-2xl font-bold text-[#17201B]">{kpis.totalReach > 0 ? Math.round(kpis.totalConversions / kpis.totalReach * 100) : 0}%</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
