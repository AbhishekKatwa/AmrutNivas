/**
 * Hotel Analytics — detailed hotel performance metrics.
 *
 * Shows occupancy, ADR, RevPAR, room revenue, and booking statistics.
 * Reads from existing operational tables.
 */

import { useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { can } from "@/domain/identity/types";
import { useContextStore } from "@/state/context-store";
import { getHotelSummary } from "@/domain/analytics/analytics-service";
import {
  resolveComparisonRanges,
  toDateStrings,
  type AnalyticsPeriod,
} from "@/domain/analytics/date-utils";
import type { HotelSummary } from "@/domain/analytics/types";
import { formatMoneyText } from "@/domain/money/money";

function formatCurrency(amount: number, currency: string): string {
  return formatMoneyText(String(amount), currency as any);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export default function HotelAnalyticsPage() {
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const organizationId = context.organizationId;
  const propertyId = context.propertyId;

  const canView = can("analytics.dashboard.view", permissions);

  const [period, setPeriod] = useState<AnalyticsPeriod>("THIS_MONTH");
  const [summary, setSummary] = useState<HotelSummary | null>(null);
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
    getHotelSummary(ctx)
      .then(setSummary)
      .finally(() => setLoading(false));
  }, [canView, organizationId, propertyId, currentRange]);

  if (!canView) {
    return (
      <AccessDenied
        capability="analytics.dashboard.view"
        resourceName="Hotel Analytics"
      />
    );
  }

  if (loading) {
    return <LoadingBlock label="Loading hotel analytics…" />;
  }

  if (!summary) {
    return <EmptyState title="No hotel data" description="No hotel data for this period." />;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-900">Hotel Analytics</h1>
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
          <div className="text-sm text-neutral-600">Occupancy</div>
          <div className="mt-2 text-2xl font-semibold text-neutral-900">
            {formatPercent(summary.occupancy * 100)}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-sm text-neutral-600">ADR</div>
          <div className="mt-2 text-2xl font-semibold text-neutral-900">
            {formatCurrency(summary.adr, summary.currency)}
          </div>
          <div className="mt-1 text-xs text-neutral-500">Average Daily Rate</div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-sm text-neutral-600">RevPAR</div>
          <div className="mt-2 text-2xl font-semibold text-neutral-900">
            {formatCurrency(summary.revpar, summary.currency)}
          </div>
          <div className="mt-1 text-xs text-neutral-500">Revenue per Available Room</div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-sm text-neutral-600">Room Revenue</div>
          <div className="mt-2 text-2xl font-semibold text-neutral-900">
            {formatCurrency(summary.roomRevenue, summary.currency)}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-sm text-neutral-600">Available Rooms</div>
          <div className="mt-2 text-2xl font-semibold text-neutral-900">
            {summary.availableRooms}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-sm text-neutral-600">Rooms Sold</div>
          <div className="mt-2 text-2xl font-semibold text-neutral-900">
            {summary.soldRooms}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-sm text-neutral-600">No-Shows</div>
          <div className="mt-2 text-2xl font-semibold text-rose-600">
            {summary.noShows}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-sm text-neutral-600">Cancellations</div>
          <div className="mt-2 text-2xl font-semibold text-rose-600">
            {summary.cancellations}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5 md:col-span-2 lg:col-span-4">
          <div className="text-sm text-neutral-600">Average Length of Stay</div>
          <div className="mt-2 text-2xl font-semibold text-neutral-900">
            {summary.averageLengthOfStay.toFixed(1)} nights
          </div>
        </div>
      </div>
    </div>
  );
}
