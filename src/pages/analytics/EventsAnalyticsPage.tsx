/**
 * Events Analytics — detailed events performance metrics.
 *
 * Shows leads, confirmed events, pipeline value, and revenue.
 * Reads from existing operational tables.
 */

import { useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { can } from "@/domain/identity/types";
import { useContextStore } from "@/state/context-store";
import { getEventSummary } from "@/domain/analytics/analytics-service";
import {
  resolveComparisonRanges,
  toDateStrings,
  type AnalyticsPeriod,
} from "@/domain/analytics/date-utils";
import type { EventSummary } from "@/domain/analytics/types";
import { formatMoneyText } from "@/domain/money/money";

function formatCurrency(amount: number, currency: string): string {
  return formatMoneyText(String(amount), currency as any);
}

export default function EventsAnalyticsPage() {
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const organizationId = context.organizationId;
  const propertyId = context.propertyId;

  const canView = can("analytics.dashboard.view", permissions);

  const [period, setPeriod] = useState<AnalyticsPeriod>("THIS_MONTH");
  const [summary, setSummary] = useState<EventSummary | null>(null);
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
    getEventSummary(ctx)
      .then(setSummary)
      .finally(() => setLoading(false));
  }, [canView, organizationId, propertyId, currentRange]);

  if (!canView) {
    return (
      <AccessDenied
        capability="analytics.dashboard.view"
        resourceName="Events Analytics"
      />
    );
  }

  if (loading) {
    return <LoadingBlock label="Loading events analytics…" />;
  }

  if (!summary) {
    return <EmptyState title="No events data" description="No events data for this period." />;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-900">Events Analytics</h1>
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
          <div className="text-sm text-neutral-600">Leads</div>
          <div className="mt-2 text-2xl font-semibold text-neutral-900">
            {summary.leads}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-sm text-neutral-600">Confirmed Events</div>
          <div className="mt-2 text-2xl font-semibold text-neutral-900">
            {summary.confirmedEvents}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-sm text-neutral-600">Completed Events</div>
          <div className="mt-2 text-2xl font-semibold text-emerald-600">
            {summary.completedEvents}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-sm text-neutral-600">Pipeline Value</div>
          <div className="mt-2 text-2xl font-semibold text-amber-600">
            {formatCurrency(summary.pipelineValue, summary.currency)}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-sm text-neutral-600">Confirmed Value</div>
          <div className="mt-2 text-2xl font-semibold text-neutral-900">
            {formatCurrency(summary.confirmedValue, summary.currency)}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-sm text-neutral-600">Collected Advance</div>
          <div className="mt-2 text-2xl font-semibold text-emerald-600">
            {formatCurrency(summary.collectedAdvance, summary.currency)}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-sm text-neutral-600">Outstanding</div>
          <div className="mt-2 text-2xl font-semibold text-rose-600">
            {formatCurrency(summary.outstanding, summary.currency)}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-sm text-neutral-600">Event Revenue</div>
          <div className="mt-2 text-2xl font-semibold text-emerald-600">
            {formatCurrency(summary.eventRevenue, summary.currency)}
          </div>
        </div>
      </div>
    </div>
  );
}
