/**
 * Revenue Management Dashboard — main revenue intelligence screen.
 *
 * Shows revenue summary, demand signals, active promotions, pending recommendations,
 * and recent price changes. Aggregates data from the pricing service.
 */

import { useEffect, useState } from "react";
import { TrendingUp, AlertCircle, Tag, Calendar } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { can } from "@/domain/identity/types";
import { useContextStore } from "@/state/context-store";
import {
  getRevenueDashboard,
  listRecommendations,
  listPromotions,
  ensureRevenueDemoSeeded,
} from "@/domain/revenue/pricing-service";
import { toPublicError } from "@/lib/errors";
import { format } from "date-fns";
import type { RevenueDashboardData, RevenueRecommendation, Promotion } from "@/domain/revenue/types";
import clsx from "clsx";

export default function RevenueDashboard() {
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const organizationId = context.organizationId;
  const propertyId = context.propertyId;

  const canView = can("revenue.view", permissions);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<RevenueDashboardData | null>(null);
  const [recommendations, setRecommendations] = useState<RevenueRecommendation[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);

  useEffect(() => {
    if (!organizationId || !propertyId || !canView) return;
    let ignore = false;
    setLoading(true);
    setError(null);

    // Seed demo data on first load
    ensureRevenueDemoSeeded(organizationId, propertyId);

    const startDate = format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");
    const endDate = format(new Date(), "yyyy-MM-dd");

    Promise.all([
      getRevenueDashboard(organizationId, propertyId, startDate, endDate),
      listRecommendations(organizationId, propertyId, "PENDING"),
      listPromotions(organizationId, propertyId, "ACTIVE"),
    ])
      .then(([dash, recs, promos]) => {
        if (ignore) return;
        setDashboard(dash);
        setRecommendations(recs);
        setPromotions(promos);
      })
      .catch((err) => {
        if (ignore) return;
        setError(toPublicError(err).message);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [organizationId, propertyId, canView]);

  if (!canView) {
    return <AccessDenied capability="Revenue Management" permission="revenue.view" />;
  }

  if (loading) {
    return <LoadingBlock label="Loading revenue dashboard…" />;
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-900">
          {error}
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return <EmptyState title="No revenue data" description="Revenue data is not available for this property." />;
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Revenue Management</h1>
        <p className="mt-1 text-sm text-gray-600">
          Pricing intelligence, demand signals, and revenue optimization
        </p>
      </div>

      {/* Revenue Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <RevenueCard
          title="Total Revenue"
          value={`₹${Number(dashboard.summary.totalRevenue).toLocaleString("en-IN")}`}
          subtitle={dashboard.period.startDate + " to " + dashboard.period.endDate}
          icon={<TrendingUp className="h-5 w-5 text-green-600" />}
        />
        <RevenueCard
          title="Room Revenue"
          value={`₹${Number(dashboard.summary.roomRevenue).toLocaleString("en-IN")}`}
          subtitle="Hotel stays"
          icon={<Calendar className="h-5 w-5 text-blue-600" />}
        />
        <RevenueCard
          title="Restaurant Revenue"
          value={`₹${Number(dashboard.summary.restaurantRevenue).toLocaleString("en-IN")}`}
          subtitle="Food & beverage"
          icon={<TrendingUp className="h-5 w-5 text-orange-600" />}
        />
        <RevenueCard
          title="Event Revenue"
          value={`₹${Number(dashboard.summary.eventRevenue).toLocaleString("en-IN")}`}
          subtitle="Events & banquets"
          icon={<TrendingUp className="h-5 w-5 text-purple-600" />}
        />
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-medium text-amber-900">
                {recommendations.length} Revenue Recommendation{recommendations.length !== 1 ? "s" : ""}
              </h3>
              <p className="mt-1 text-sm text-amber-800">
                Review pricing suggestions based on demand analysis
              </p>
              <div className="mt-3 space-y-2">
                {recommendations.slice(0, 3).map((rec) => (
                  <div key={rec.id} className="rounded bg-white p-3 text-sm">
                    <div className="font-medium text-gray-900">{rec.title}</div>
                    <div className="text-gray-600">{rec.suggestedAction}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Promotions */}
      {promotions.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-3">
            <Tag className="h-5 w-5 text-gray-700" />
            <h3 className="font-medium text-gray-900">
              {promotions.length} Active Promotion{promotions.length !== 1 ? "s" : ""}
            </h3>
          </div>
          <div className="space-y-2">
            {promotions.slice(0, 5).map((promo) => (
              <div key={promo.id} className="flex items-center justify-between rounded bg-gray-50 p-3">
                <div>
                  <div className="font-medium text-gray-900">{promo.name}</div>
                  <div className="text-sm text-gray-600">
                    {promo.type === "PERCENTAGE" && `${promo.discountPercentage}% off`}
                    {promo.type === "FIXED" && `₹${promo.discountAmount} off`}
                    {promo.type === "RATE_OVERRIDE" && `₹${promo.overridePrice}`}
                  </div>
                </div>
                <div className="text-sm text-gray-500">
                  {promo.usageCount} {promo.usageLimit ? `/ ${promo.usageLimit}` : ""} uses
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Demand Level */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="font-medium text-gray-900 mb-3">Current Demand</h3>
        <div className="flex items-center gap-4">
          <div
            className={clsx(
              "rounded-full px-4 py-2 text-sm font-medium",
              dashboard.demand.currentDemandLevel === "LOW" && "bg-blue-100 text-blue-800",
              dashboard.demand.currentDemandLevel === "NORMAL" && "bg-green-100 text-green-800",
              dashboard.demand.currentDemandLevel === "HIGH" && "bg-orange-100 text-orange-800",
              dashboard.demand.currentDemandLevel === "VERY_HIGH" && "bg-red-100 text-red-800",
            )}
          >
            {dashboard.demand.currentDemandLevel.replace("_", " ")}
          </div>
          <div className="text-sm text-gray-600">
            Based on occupancy and booking patterns
          </div>
        </div>
      </div>
    </div>
  );
}

function RevenueCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-gray-600">{title}</div>
        {icon}
      </div>
      <div className="mt-2 text-2xl font-semibold text-gray-900">{value}</div>
      <div className="mt-1 text-xs text-gray-500">{subtitle}</div>
    </div>
  );
}
