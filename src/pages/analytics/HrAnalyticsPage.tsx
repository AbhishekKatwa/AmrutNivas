/**
 * HR Analytics — detailed human resources metrics.
 *
 * Shows employee counts, attendance, and task tracking.
 * Reads from existing operational tables.
 */

import { useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { can } from "@/domain/identity/types";
import { useContextStore } from "@/state/context-store";
import { getHrSummary } from "@/domain/analytics/analytics-service";
import {
  resolveComparisonRanges,
  toDateStrings,
  type AnalyticsPeriod,
} from "@/domain/analytics/date-utils";
import type { HrSummary } from "@/domain/analytics/types";

export default function HrAnalyticsPage() {
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const organizationId = context.organizationId;
  const propertyId = context.propertyId;

  const canView = can("analytics.dashboard.view", permissions);

  const [period, setPeriod] = useState<AnalyticsPeriod>("THIS_MONTH");
  const [summary, setSummary] = useState<HrSummary | null>(null);
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
    getHrSummary(ctx)
      .then(setSummary)
      .finally(() => setLoading(false));
  }, [canView, organizationId, propertyId, currentRange]);

  if (!canView) {
    return (
      <AccessDenied
        capability="analytics.dashboard.view"
        resourceName="HR Analytics"
      />
    );
  }

  if (loading) {
    return <LoadingBlock label="Loading HR analytics…" />;
  }

  if (!summary) {
    return <EmptyState title="No HR data" description="No HR data for this period." />;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-900">HR Analytics</h1>
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
          <div className="text-sm text-neutral-600">Active Employees</div>
          <div className="mt-2 text-2xl font-semibold text-neutral-900">
            {summary.activeEmployees}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-sm text-neutral-600">Present Today</div>
          <div className="mt-2 text-2xl font-semibold text-emerald-600">
            {summary.presentToday}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-sm text-neutral-600">Absent</div>
          <div className="mt-2 text-2xl font-semibold text-rose-600">
            {summary.absent}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-sm text-neutral-600">On Leave</div>
          <div className="mt-2 text-2xl font-semibold text-amber-600">
            {summary.onLeave}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-sm text-neutral-600">Late</div>
          <div className="mt-2 text-2xl font-semibold text-amber-600">
            {summary.late}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-sm text-neutral-600">Open Tasks</div>
          <div className="mt-2 text-2xl font-semibold text-neutral-900">
            {summary.openTasks}
          </div>
        </div>
      </div>
    </div>
  );
}
