/**
 * Restaurant Analytics — detailed restaurant performance metrics.
 *
 * Shows revenue, orders, covers, average order value, outlet performance,
 * and top menu items. Reads from existing operational tables.
 */

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { can } from "@/domain/identity/types";
import { useContextStore } from "@/state/context-store";
import {
  getRestaurantSummary,
  getOutletPerformance,
} from "@/domain/analytics/analytics-service";
import {
  resolveComparisonRanges,
  toDateStrings,
  type AnalyticsPeriod,
} from "@/domain/analytics/date-utils";
import type { RestaurantSummary, OutletPerformance } from "@/domain/analytics/types";
import { formatMoneyText } from "@/domain/money/money";

function formatCurrency(amount: number, currency: string): string {
  return formatMoneyText(String(amount), currency as any);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function TrendIcon({ trend }: { trend: number }) {
  if (trend > 0.01) return <TrendingUp className="h-4 w-4 text-emerald-600" />;
  if (trend < -0.01) return <TrendingDown className="h-4 w-4 text-rose-600" />;
  return <Minus className="h-4 w-4 text-neutral-500" />;
}

export default function RestaurantAnalyticsPage() {
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const organizationId = context.organizationId;
  const propertyId = context.propertyId;

  const canView = can("analytics.dashboard.view", permissions);

  const [period, setPeriod] = useState<AnalyticsPeriod>("THIS_MONTH");
  const [summary, setSummary] = useState<RestaurantSummary | null>(null);
  const [outlets, setOutlets] = useState<OutletPerformance[]>([]);
  const [loading, setLoading] = useState(true);

  const ranges = resolveComparisonRanges(period, "PREVIOUS_PERIOD");
  const currentRange = toDateStrings(ranges.current);

  useEffect(() => {
    if (!canView || !organizationId) return;

    const ctx = {
      organizationId,
      propertyId: propertyId ?? undefined,
      startDate: currentRange.start,
      endDate: currentRange.end,
      currency: "INR",
    };

    setLoading(true);
    Promise.all([getRestaurantSummary(ctx), getOutletPerformance(ctx)])
      .then(([summaryData, outletData]) => {
        setSummary(summaryData);
        setOutlets(outletData);
      })
      .finally(() => setLoading(false));
  }, [canView, organizationId, propertyId, currentRange]);

  if (!canView) {
    return (
      <AccessDenied
        capability="analytics.dashboard.view"
        resourceName="Restaurant Analytics"
      />
    );
  }

  if (loading) {
    return <LoadingBlock label="Loading restaurant analytics…" />;
  }

  if (!summary) {
    return <EmptyState title="No restaurant data" description="No restaurant data for this period." />;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-900">Restaurant Analytics</h1>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as AnalyticsPeriod)}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="TODAY">Today</option>
          <option value="THIS_WEEK">This Week</option>
          <option value="THIS_MONTH">This Month</option>
          <option value="THIS_QUARTER">This Quarter</option>
          <option value="THIS_YEAR">This Year</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-sm text-neutral-600">Revenue</div>
          <div className="mt-2 text-2xl font-semibold text-neutral-900">
            {formatCurrency(summary.revenue, summary.currency)}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-sm text-neutral-600">Orders</div>
          <div className="mt-2 text-2xl font-semibold text-neutral-900">
            {summary.orders}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-sm text-neutral-600">Average Order Value</div>
          <div className="mt-2 text-2xl font-semibold text-neutral-900">
            {formatCurrency(summary.averageOrderValue, summary.currency)}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-sm text-neutral-600">Covers</div>
          <div className="mt-2 text-2xl font-semibold text-neutral-900">
            {summary.covers}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-sm text-neutral-600">Revenue per Cover</div>
          <div className="mt-2 text-2xl font-semibold text-neutral-900">
            {formatCurrency(summary.revenuePerCover, summary.currency)}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-sm text-neutral-600">Discounts</div>
          <div className="mt-2 text-2xl font-semibold text-rose-600">
            {formatCurrency(summary.discounts, summary.currency)}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-sm text-neutral-600">Refunds</div>
          <div className="mt-2 text-2xl font-semibold text-rose-600">
            {formatCurrency(summary.refunds, summary.currency)}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-sm text-neutral-600">Cancelled Orders</div>
          <div className="mt-2 text-2xl font-semibold text-rose-600">
            {summary.cancelledOrders}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold text-neutral-900">Outlet Performance</h2>
        {outlets.length === 0 ? (
          <EmptyState title="No outlets" description="No outlet data available." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left">
                  <th className="pb-2 font-medium text-neutral-600">Outlet</th>
                  <th className="pb-2 font-medium text-neutral-600 text-right">Revenue</th>
                  <th className="pb-2 font-medium text-neutral-600 text-right">Orders</th>
                  <th className="pb-2 font-medium text-neutral-600 text-right">Avg Order</th>
                  <th className="pb-2 font-medium text-neutral-600 text-right">Growth</th>
                </tr>
              </thead>
              <tbody>
                {outlets.map((outlet) => (
                  <tr key={outlet.outletId} className="border-b border-neutral-100">
                    <td className="py-3 text-neutral-900">{outlet.outletName}</td>
                    <td className="py-3 text-right text-neutral-900">
                      {formatCurrency(outlet.revenue, summary.currency)}
                    </td>
                    <td className="py-3 text-right text-neutral-900">{outlet.orders}</td>
                    <td className="py-3 text-right text-neutral-900">
                      {formatCurrency(outlet.averageOrderValue, summary.currency)}
                    </td>
                    <td className="py-3 text-right">
                      {outlet.growth !== undefined ? (
                        <div className="flex items-center justify-end gap-1">
                          <TrendIcon trend={outlet.growth} />
                          <span className={outlet.growth > 0 ? "text-emerald-600" : outlet.growth < 0 ? "text-rose-600" : "text-neutral-600"}>
                            {formatPercent(outlet.growth * 100)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
