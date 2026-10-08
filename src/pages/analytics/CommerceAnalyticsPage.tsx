/**
 * Commerce Analytics — detailed commerce channel metrics.
 *
 * Shows QR orders, online orders, bookings, and conversion rates.
 * Reads from existing operational tables.
 */

import { useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { can } from "@/domain/identity/types";
import { useContextStore } from "@/state/context-store";
import { getCommerceSummary } from "@/domain/analytics/analytics-service";
import {
  resolveComparisonRanges,
  toDateStrings,
  type AnalyticsPeriod,
} from "@/domain/analytics/date-utils";
import type { CommerceSummary } from "@/domain/analytics/types";

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export default function CommerceAnalyticsPage() {
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const organizationId = context.organizationId;
  const propertyId = context.propertyId;

  const canView = can("analytics.dashboard.view", permissions);

  const [period, setPeriod] = useState<AnalyticsPeriod>("THIS_MONTH");
  const [summary, setSummary] = useState<CommerceSummary | null>(null);
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
    getCommerceSummary(ctx)
      .then(setSummary)
      .finally(() => setLoading(false));
  }, [canView, organizationId, propertyId, currentRange]);

  if (!canView) {
    return (
      <AccessDenied
        capability="analytics.dashboard.view"
        resourceName="Commerce Analytics"
      />
    );
  }

  if (loading) {
    return <LoadingBlock label="Loading commerce analytics…" />;
  }

  if (!summary) {
    return <EmptyState title="No commerce data" description="No commerce data for this period." />;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-900">Commerce Analytics</h1>
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
          <div className="text-sm text-neutral-600">QR Orders</div>
          <div className="mt-2 text-2xl font-semibold text-neutral-900">
            {summary.qrOrders}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-sm text-neutral-600">Online Orders</div>
          <div className="mt-2 text-2xl font-semibold text-neutral-900">
            {summary.onlineOrders}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-sm text-neutral-600">Direct Bookings</div>
          <div className="mt-2 text-2xl font-semibold text-neutral-900">
            {summary.directBookings}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-sm text-neutral-600">Takeaway Orders</div>
          <div className="mt-2 text-2xl font-semibold text-neutral-900">
            {summary.takeawayOrders}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5 md:col-span-2 lg:col-span-4">
          <div className="text-sm text-neutral-600">Conversion Rate</div>
          <div className="mt-2 text-2xl font-semibold text-neutral-900">
            {formatPercent(summary.conversionRate * 100)}
          </div>
        </div>
      </div>
    </div>
  );
}
