/**
 * Owner Command Center — main analytics dashboard.
 *
 * Shows business performance, KPIs, trends, changes, and attention items.
 * Aggregates data from all operational modules.
 */

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus, AlertCircle } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { can } from "@/domain/identity/types";
import { useContextStore } from "@/state/context-store";
import {
  getRevenueSummary,
  getProfitabilitySummary,
  getRestaurantSummary,
  getHotelSummary,
  getEventSummary,
  getInventorySummary,
  getFinanceSummary,
  getAttentionItems,
  detectChanges,
} from "@/domain/analytics/analytics-service";
import {
  resolveComparisonRanges,
  toDateStrings,
  type AnalyticsPeriod,
  type ComparisonMode,
} from "@/domain/analytics/date-utils";
import type {
  RevenueSummary,
  ProfitabilitySummary,
  RestaurantSummary,
  HotelSummary,
  EventSummary,
  InventorySummary,
  FinanceSummary,
  AttentionItem,
  ChangeItem,
} from "@/domain/analytics/types";
import { formatMoneyText } from "@/domain/money/money";

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatCurrency(amount: number, currency: string): string {
  return formatMoneyText(String(amount), currency as any);
}
import clsx from "clsx";

export default function OwnerCommandCenter() {
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const organizationId = context.organizationId;
  const propertyId = context.propertyId;

  const canView = can("analytics.dashboard.view", permissions);

  const [period, setPeriod] = useState<AnalyticsPeriod>("THIS_MONTH");
  const [comparison, setComparison] = useState<ComparisonMode>("PREVIOUS_PERIOD");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [revenue, setRevenue] = useState<RevenueSummary | null>(null);
  const [profitability, setProfitability] = useState<ProfitabilitySummary | null>(null);
  const [restaurant, setRestaurant] = useState<RestaurantSummary | null>(null);
  const [hotel, setHotel] = useState<HotelSummary | null>(null);
  const [events, setEvents] = useState<EventSummary | null>(null);
  const [inventory, setInventory] = useState<InventorySummary | null>(null);
  const [finance, setFinance] = useState<FinanceSummary | null>(null);
  const [attention, setAttention] = useState<AttentionItem[]>([]);
  const [changes, setChanges] = useState<ChangeItem[]>([]);

  useEffect(() => {
    if (!organizationId || !canView) return;
    let ignore = false;
    setLoading(true);
    setError(null);

    const ranges = resolveComparisonRanges(period, comparison);
    const currentRange = toDateStrings(ranges.current);
    const previousRange = ranges.previous ? toDateStrings(ranges.previous) : null;

    const ctx = {
      organizationId,
      propertyId: propertyId ?? undefined,
      startDate: currentRange.start,
      endDate: currentRange.end,
      currency: "INR",
    };

    const previousCtx = previousRange
      ? {
          organizationId,
          propertyId: propertyId ?? undefined,
          startDate: previousRange.start,
          endDate: previousRange.end,
          currency: "INR",
        }
      : null;

    Promise.all([
      getRevenueSummary(ctx),
      getProfitabilitySummary(ctx),
      getRestaurantSummary(ctx),
      getHotelSummary(ctx),
      getEventSummary(ctx),
      getInventorySummary(ctx),
      getFinanceSummary(ctx),
      getAttentionItems(ctx),
      previousCtx ? detectChanges(ctx, previousCtx) : Promise.resolve([]),
    ])
      .then(([rev, prof, rest, hot, evt, inv, fin, att, chg]) => {
        if (ignore) return;
        setRevenue(rev);
        setProfitability(prof);
        setRestaurant(rest);
        setHotel(hot);
        setEvents(evt);
        setInventory(inv);
        setFinance(fin);
        setAttention(att);
        setChanges(chg);
      })
      .catch((err) => {
        if (ignore) return;
        setError(err instanceof Error ? err.message : "Failed to load analytics");
      })
      .finally(() => {
        if (ignore) return;
        setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [organizationId, propertyId, period, comparison, canView]);

  if (!canView) {
    return (
      <AccessDenied
        capability="view analytics dashboard"
        permission="analytics.dashboard.view"
      />
    );
  }

  if (loading) {
    return <LoadingBlock label="Loading analytics..." />;
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Owner Command Center</h1>
          <p className="mt-1 text-sm text-gray-600">Business performance overview</p>
        </div>
        <div className="flex gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as AnalyticsPeriod)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="TODAY">Today</option>
            <option value="THIS_WEEK">This Week</option>
            <option value="THIS_MONTH">This Month</option>
            <option value="THIS_QUARTER">This Quarter</option>
            <option value="THIS_YEAR">This Year</option>
          </select>
          <select
            value={comparison}
            onChange={(e) => setComparison(e.target.value as ComparisonMode)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="PREVIOUS_PERIOD">vs Previous Period</option>
            <option value="SAME_PERIOD_LAST_YEAR">vs Last Year</option>
            <option value="NONE">No Comparison</option>
          </select>
        </div>
      </div>

      {/* Top KPI Strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          label="Revenue"
          value={revenue ? formatCurrency(revenue.totalRevenue, revenue.currency) : "—"}
          trend={getTrend(changes, "Revenue")}
        />
        <KpiCard
          label="Profit"
          value={profitability ? formatCurrency(profitability.netProfit, profitability.currency) : "—"}
          trend="UNKNOWN"
        />
        <KpiCard
          label="Occupancy"
          value={hotel ? formatPercent(hotel.occupancy) : "—"}
          trend="UNKNOWN"
        />
        <KpiCard
          label="Restaurant"
          value={restaurant ? formatCurrency(restaurant.revenue, restaurant.currency) : "—"}
          trend="UNKNOWN"
        />
        <KpiCard
          label="Events"
          value={events ? formatCurrency(events.eventRevenue, events.currency) : "—"}
          trend="UNKNOWN"
        />
        <KpiCard
          label="Cash"
          value={finance ? formatCurrency(finance.cash + finance.bank, finance.currency) : "—"}
          trend="UNKNOWN"
        />
      </div>

      {/* What Changed */}
      {changes.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">What Changed</h2>
          <div className="space-y-3">
            {changes.slice(0, 5).map((change, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <span className="text-sm text-gray-700">{change.metric}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">
                    {change.changePercent > 0 ? "+" : ""}
                    {change.changePercent.toFixed(1)}%
                  </span>
                  {change.trend === "UP" && <TrendingUp className="h-4 w-4 text-green-600" />}
                  {change.trend === "DOWN" && <TrendingDown className="h-4 w-4 text-red-600" />}
                  {change.trend === "FLAT" && <Minus className="h-4 w-4 text-gray-400" />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Attention Center */}
      {attention.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
            <AlertCircle className="h-5 w-5 text-amber-600" />
            Requires Attention
          </h2>
          <div className="space-y-3">
            {attention.slice(0, 5).map((item) => (
              <div key={item.id} className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{item.title}</p>
                  <p className="text-xs text-gray-600">{item.description}</p>
                </div>
                <span
                  className={clsx(
                    "rounded-full px-2 py-1 text-xs font-medium",
                    item.priority === "CRITICAL" && "bg-red-100 text-red-800",
                    item.priority === "HIGH" && "bg-orange-100 text-orange-800",
                    item.priority === "MEDIUM" && "bg-yellow-100 text-yellow-800",
                    item.priority === "LOW" && "bg-blue-100 text-blue-800",
                  )}
                >
                  {item.priority}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Revenue Overview */}
      {revenue && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Revenue Overview</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <div>
              <p className="text-sm text-gray-600">Total</p>
              <p className="text-xl font-semibold text-gray-900">
                {formatCurrency(revenue.totalRevenue, revenue.currency)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Restaurant</p>
              <p className="text-lg font-medium text-gray-900">
                {formatCurrency(revenue.restaurantRevenue, revenue.currency)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Hotel</p>
              <p className="text-lg font-medium text-gray-900">
                {formatCurrency(revenue.roomRevenue, revenue.currency)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Events</p>
              <p className="text-lg font-medium text-gray-900">
                {formatCurrency(revenue.eventRevenue, revenue.currency)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Other</p>
              <p className="text-lg font-medium text-gray-900">
                {formatCurrency(revenue.otherRevenue, revenue.currency)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Domain Summaries */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Restaurant */}
        {restaurant && (
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Restaurant</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Revenue</span>
                <span className="text-sm font-medium text-gray-900">
                  {formatCurrency(restaurant.revenue, restaurant.currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Orders</span>
                <span className="text-sm font-medium text-gray-900">{restaurant.orders}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Avg Order Value</span>
                <span className="text-sm font-medium text-gray-900">
                  {formatCurrency(restaurant.averageOrderValue, restaurant.currency)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Hotel */}
        {hotel && (
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Hotel</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Occupancy</span>
                <span className="text-sm font-medium text-gray-900">
                  {formatPercent(hotel.occupancy)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">ADR</span>
                <span className="text-sm font-medium text-gray-900">
                  {formatCurrency(hotel.adr, hotel.currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">RevPAR</span>
                <span className="text-sm font-medium text-gray-900">
                  {formatCurrency(hotel.revpar, hotel.currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Room Revenue</span>
                <span className="text-sm font-medium text-gray-900">
                  {formatCurrency(hotel.roomRevenue, hotel.currency)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Events */}
        {events && (
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Events</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Leads</span>
                <span className="text-sm font-medium text-gray-900">{events.leads}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Confirmed</span>
                <span className="text-sm font-medium text-gray-900">{events.confirmedEvents}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Pipeline Value</span>
                <span className="text-sm font-medium text-gray-900">
                  {formatCurrency(events.pipelineValue, events.currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Revenue</span>
                <span className="text-sm font-medium text-gray-900">
                  {formatCurrency(events.eventRevenue, events.currency)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Inventory */}
        {inventory && (
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Inventory</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Stock Value</span>
                <span className="text-sm font-medium text-gray-900">
                  {formatCurrency(inventory.inventoryValue, inventory.currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Low Stock Items</span>
                <span className="text-sm font-medium text-gray-900">{inventory.lowStockItems}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Out of Stock</span>
                <span className="text-sm font-medium text-gray-900">{inventory.outOfStockItems}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Empty State */}
      {!revenue && !loading && (
        <EmptyState
          icon="BarChart3"
          title="No analytics data"
          description="Start recording transactions to see analytics"
        />
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  trend,
}: {
  label: string;
  value: string;
  trend: "UP" | "DOWN" | "FLAT" | "UNKNOWN";
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-sm text-gray-600">{label}</p>
      <div className="mt-1 flex items-center justify-between">
        <p className="text-xl font-semibold text-gray-900">{value}</p>
        {trend === "UP" && <TrendingUp className="h-4 w-4 text-green-600" />}
        {trend === "DOWN" && <TrendingDown className="h-4 w-4 text-red-600" />}
        {trend === "FLAT" && <Minus className="h-4 w-4 text-gray-400" />}
      </div>
    </div>
  );
}

function getTrend(changes: ChangeItem[], metric: string): "UP" | "DOWN" | "FLAT" | "UNKNOWN" {
  const change = changes.find((c) => c.metric === metric);
  return change?.trend || "UNKNOWN";
}
