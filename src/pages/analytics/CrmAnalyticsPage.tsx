/**
 * CRM Analytics — detailed customer relationship metrics.
 *
 * Shows customer counts, retention, and spend analytics.
 * Reads from existing operational tables.
 */

import { useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { can } from "@/domain/identity/types";
import { useContextStore } from "@/state/context-store";
import { getCrmSummary } from "@/domain/analytics/analytics-service";
import {
  resolveComparisonRanges,
  toDateStrings,
  type AnalyticsPeriod,
} from "@/domain/analytics/date-utils";
import type { CrmSummary } from "@/domain/analytics/types";
import { formatMoneyText } from "@/domain/money/money";

function formatCurrency(amount: number, currency: string): string {
  return formatMoneyText(String(amount), currency as any);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export default function CrmAnalyticsPage() {
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const organizationId = context.organizationId;
  const propertyId = context.propertyId;

  const canView = can("analytics.dashboard.view", permissions);

  const [period, setPeriod] = useState<AnalyticsPeriod>("THIS_MONTH");
  const [summary, setSummary] = useState<CrmSummary | null>(null);
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
    getCrmSummary(ctx)
      .then(setSummary)
      .finally(() => setLoading(false));
  }, [canView, organizationId, propertyId, currentRange]);

  if (!canView) {
    return (
      <AccessDenied
        capability="analytics.dashboard.view"
        resourceName="CRM Analytics"
      />
    );
  }

  if (loading) {
    return <LoadingBlock label="Loading CRM analytics…" />;
  }

  if (!summary) {
    return <EmptyState title="No CRM data" description="No CRM data for this period." />;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-900">CRM Analytics</h1>
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
          <div className="text-sm text-neutral-600">Total Customers</div>
          <div className="mt-2 text-2xl font-semibold text-neutral-900">
            {summary.totalCustomers}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-sm text-neutral-600">New Customers</div>
          <div className="mt-2 text-2xl font-semibold text-emerald-600">
            {summary.newCustomers}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-sm text-neutral-600">Returning Customers</div>
          <div className="mt-2 text-2xl font-semibold text-neutral-900">
            {summary.returningCustomers}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-sm text-neutral-600">Repeat Rate</div>
          <div className="mt-2 text-2xl font-semibold text-neutral-900">
            {formatPercent(summary.repeatRate * 100)}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-sm text-neutral-600">Total Customer Spend</div>
          <div className="mt-2 text-2xl font-semibold text-neutral-900">
            {formatCurrency(summary.totalCustomerSpend, summary.currency)}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-sm text-neutral-600">Average Customer Spend</div>
          <div className="mt-2 text-2xl font-semibold text-neutral-900">
            {formatCurrency(summary.averageCustomerSpend, summary.currency)}
          </div>
        </div>
      </div>
    </div>
  );
}
