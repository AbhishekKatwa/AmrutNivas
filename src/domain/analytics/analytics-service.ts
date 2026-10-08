/**
 * Centralized analytics service layer.
 *
 * Aggregates data from existing domain services to provide KPIs, summaries,
 * trends, and drilldowns. Reads operational data, never rewrites it.
 */

import { requireSupabase } from "@/db/client";
import type {
  AnalyticsContext,
  RevenueSummary,
  RevenueTrendPoint,
  RevenueMix,
  ProfitabilitySummary,
  RestaurantSummary,
  OutletPerformance,
  HotelSummary,
  EventSummary,
  InventorySummary,
  ProcurementSummary,
  FinanceSummary,
  CrmSummary,
  HrSummary,
  CommerceSummary,
  PropertyScorecard,
  AttentionItem,
  ChangeItem,
} from "./types";

// =====================================================================
// REVENUE
// =====================================================================

/**
 * Get revenue summary for the context period.
 * Aggregates from restaurant bills, hotel folios, event bookings, and other income.
 */
export async function getRevenueSummary(
  ctx: AnalyticsContext,
): Promise<RevenueSummary> {
  const sb = requireSupabase();

  // Restaurant revenue from bills
  const { data: bills } = await sb
    .from("bills")
    .select("grand_total")
    .eq("organization_id", ctx.organizationId)
    .eq("status", "PAID")
    .gte("business_date", ctx.startDate)
    .lte("business_date", ctx.endDate);

  const restaurantRevenue = bills?.reduce((sum, b) => sum + Number(b.grand_total || 0), 0) || 0;

  // Room revenue from folios
  const { data: folios } = await sb
    .from("folios")
    .select("total_charges")
    .eq("organization_id", ctx.organizationId)
    .eq("status", "SETTLED")
    .gte("opened_at", ctx.startDate)
    .lte("opened_at", ctx.endDate);

  const roomRevenue = folios?.reduce((sum, f) => sum + Number(f.total_charges || 0), 0) || 0;

  // Event revenue from events
  const { data: events } = await sb
    .from("events")
    .select("total_amount")
    .eq("organization_id", ctx.organizationId)
    .eq("status", "COMPLETED")
    .gte("event_date", ctx.startDate)
    .lte("event_date", ctx.endDate);

  const eventRevenue = events?.reduce((sum, e) => sum + Number(e.total_amount || 0), 0) || 0;

  const totalRevenue = restaurantRevenue + roomRevenue + eventRevenue;
  const otherRevenue = 0; // TODO: Add other income sources

  return {
    totalRevenue,
    restaurantRevenue,
    roomRevenue,
    eventRevenue,
    otherRevenue,
    currency: ctx.currency,
    status: "ACTUAL",
  };
}

/**
 * Get revenue trend data points.
 */
export async function getRevenueTrend(
  ctx: AnalyticsContext,
  _granularity: "daily" | "weekly" | "monthly" = "daily",
): Promise<RevenueTrendPoint[]> {
  const sb = requireSupabase();

  // Simplified: group by date
  const { data: bills } = await sb
    .from("bills")
    .select("business_date, grand_total")
    .eq("organization_id", ctx.organizationId)
    .eq("status", "PAID")
    .gte("business_date", ctx.startDate)
    .lte("business_date", ctx.endDate)
    .order("business_date", { ascending: true });

  const byDate = new Map<string, number>();
  bills?.forEach((b) => {
    const date = b.business_date;
    const current = byDate.get(date) || 0;
    byDate.set(date, current + Number(b.grand_total || 0));
  });

  return Array.from(byDate.entries()).map(([date, revenue]) => ({
    date,
    revenue,
  }));
}

/**
 * Get revenue mix by category.
 */
export async function getRevenueMix(ctx: AnalyticsContext): Promise<RevenueMix[]> {
  const summary = await getRevenueSummary(ctx);
  const total = summary.totalRevenue || 1;

  return [
    { category: "Restaurant", amount: summary.restaurantRevenue, percentage: (summary.restaurantRevenue / total) * 100 },
    { category: "Hotel", amount: summary.roomRevenue, percentage: (summary.roomRevenue / total) * 100 },
    { category: "Events", amount: summary.eventRevenue, percentage: (summary.eventRevenue / total) * 100 },
    { category: "Other", amount: summary.otherRevenue, percentage: (summary.otherRevenue / total) * 100 },
  ];
}

// =====================================================================
// PROFITABILITY
// =====================================================================

/**
 * Get profitability summary.
 * Uses finance transactions for revenue and expenses.
 */
export async function getProfitabilitySummary(
  ctx: AnalyticsContext,
): Promise<ProfitabilitySummary> {
  const revenue = await getRevenueSummary(ctx);

  // TODO: Get COGS from inventory consumption
  const cogs = 0;
  const grossProfit = revenue.totalRevenue - cogs;

  // TODO: Get operating expenses from finance
  const operatingExpenses = 0;
  const netProfit = grossProfit - operatingExpenses;

  const grossMargin = revenue.totalRevenue > 0 ? (grossProfit / revenue.totalRevenue) * 100 : 0;
  const netMargin = revenue.totalRevenue > 0 ? (netProfit / revenue.totalRevenue) * 100 : 0;

  return {
    revenue: revenue.totalRevenue,
    cogs,
    grossProfit,
    operatingExpenses,
    netProfit,
    grossMargin,
    netMargin,
    currency: ctx.currency,
    status: "PARTIAL", // Incomplete until COGS and OpEx are wired
  };
}

// =====================================================================
// RESTAURANT
// =====================================================================

/**
 * Get restaurant performance summary.
 */
export async function getRestaurantSummary(
  ctx: AnalyticsContext,
): Promise<RestaurantSummary> {
  const sb = requireSupabase();

  const { data: bills } = await sb
    .from("bills")
    .select("grand_total, discount_amount, order_id")
    .eq("organization_id", ctx.organizationId)
    .eq("status", "PAID")
    .gte("business_date", ctx.startDate)
    .lte("business_date", ctx.endDate);

  const revenue = bills?.reduce((sum, b) => sum + Number(b.grand_total || 0), 0) || 0;
  const discounts = bills?.reduce((sum, b) => sum + Number(b.discount_amount || 0), 0) || 0;
  const orders = bills?.length || 0;
  const averageOrderValue = orders > 0 ? revenue / orders : 0;

  // TODO: Get covers from order data
  const covers = 0;
  const revenuePerCover = covers > 0 ? revenue / covers : 0;

  return {
    revenue,
    orders,
    averageOrderValue,
    covers,
    revenuePerCover,
    discounts,
    refunds: 0, // TODO: Wire refunds
    cancelledOrders: 0, // TODO: Wire cancellations
    currency: ctx.currency,
    status: "ACTUAL",
  };
}

/**
 * Get outlet performance comparison.
 */
export async function getOutletPerformance(
  ctx: AnalyticsContext,
): Promise<OutletPerformance[]> {
  const sb = requireSupabase();

  const { data: bills } = await sb
    .from("bills")
    .select("outlet_id, grand_total")
    .eq("organization_id", ctx.organizationId)
    .eq("status", "PAID")
    .gte("business_date", ctx.startDate)
    .lte("business_date", ctx.endDate);

  // Group by outlet
  const byOutlet = new Map<string, { revenue: number; orders: number }>();
  bills?.forEach((b) => {
    const outletId = b.outlet_id;
    const current = byOutlet.get(outletId) || { revenue: 0, orders: 0 };
    byOutlet.set(outletId, {
      revenue: current.revenue + Number(b.grand_total || 0),
      orders: current.orders + 1,
    });
  });

  // TODO: Get outlet names
  return Array.from(byOutlet.entries()).map(([outletId, data]) => ({
    outletId,
    outletName: outletId, // TODO: Resolve name
    revenue: data.revenue,
    orders: data.orders,
    averageOrderValue: data.orders > 0 ? data.revenue / data.orders : 0,
  }));
}

// =====================================================================
// HOTEL
// =====================================================================

/**
 * Get hotel performance summary.
 */
export async function getHotelSummary(
  ctx: AnalyticsContext,
): Promise<HotelSummary> {
  const sb = requireSupabase();

  if (!ctx.propertyId) {
    return {
      occupancy: 0,
      adr: 0,
      revpar: 0,
      roomRevenue: 0,
      availableRooms: 0,
      soldRooms: 0,
      noShows: 0,
      cancellations: 0,
      averageLengthOfStay: 0,
      currency: ctx.currency,
      status: "UNAVAILABLE",
    };
  }

  // Get reservations
  const { data: reservations } = await sb
    .from("reservations")
    .select("status, total_amount, arrival_date, departure_date")
    .eq("organization_id", ctx.organizationId)
    .eq("property_id", ctx.propertyId)
    .gte("arrival_date", ctx.startDate)
    .lte("arrival_date", ctx.endDate);

  const confirmed = reservations?.filter((r) => r.status === "CONFIRMED" || r.status === "CHECKED_IN" || r.status === "CHECKED_OUT") || [];
  const cancellations = reservations?.filter((r) => r.status === "CANCELLED") || [];
  const noShows = reservations?.filter((r) => r.status === "NO_SHOW") || [];

  const roomRevenue = confirmed.reduce((sum, r) => sum + Number(r.total_amount || 0), 0);
  const soldRooms = confirmed.length;

  // TODO: Calculate available rooms from room inventory
  const availableRooms = 0;
  const occupancy = availableRooms > 0 ? (soldRooms / availableRooms) * 100 : 0;
  const adr = soldRooms > 0 ? roomRevenue / soldRooms : 0;
  const revpar = availableRooms > 0 ? roomRevenue / availableRooms : 0;

  // Average length of stay
  const totalNights = confirmed.reduce((sum, r) => {
    const arrival = new Date(r.arrival_date);
    const departure = new Date(r.departure_date);
    const nights = Math.ceil((departure.getTime() - arrival.getTime()) / (1000 * 60 * 60 * 24));
    return sum + nights;
  }, 0);
  const averageLengthOfStay = soldRooms > 0 ? totalNights / soldRooms : 0;

  return {
    occupancy,
    adr,
    revpar,
    roomRevenue,
    availableRooms,
    soldRooms,
    noShows: noShows.length,
    cancellations: cancellations.length,
    averageLengthOfStay,
    currency: ctx.currency,
    status: availableRooms > 0 ? "ACTUAL" : "PARTIAL",
  };
}

// =====================================================================
// EVENTS
// =====================================================================

/**
 * Get events summary.
 */
export async function getEventSummary(
  ctx: AnalyticsContext,
): Promise<EventSummary> {
  const sb = requireSupabase();

  const { data: events } = await sb
    .from("events")
    .select("status, total_amount, advance_amount")
    .eq("organization_id", ctx.organizationId)
    .gte("event_date", ctx.startDate)
    .lte("event_date", ctx.endDate);

  const leads = events?.length || 0;
  const confirmed = events?.filter((e) => e.status === "CONFIRMED") || [];
  const completed = events?.filter((e) => e.status === "COMPLETED") || [];

  const pipelineValue = events?.reduce((sum, e) => sum + Number(e.total_amount || 0), 0) || 0;
  const confirmedValue = confirmed.reduce((sum, e) => sum + Number(e.total_amount || 0), 0);
  const collectedAdvance = events?.reduce((sum, e) => sum + Number(e.advance_amount || 0), 0) || 0;
  const outstanding = confirmedValue - collectedAdvance;
  const eventRevenue = completed.reduce((sum, e) => sum + Number(e.total_amount || 0), 0);

  return {
    leads,
    confirmedEvents: confirmed.length,
    completedEvents: completed.length,
    pipelineValue,
    confirmedValue,
    collectedAdvance,
    outstanding,
    eventRevenue,
    currency: ctx.currency,
    status: "ACTUAL",
  };
}

// =====================================================================
// INVENTORY
// =====================================================================

/**
 * Get inventory summary.
 */
export async function getInventorySummary(
  ctx: AnalyticsContext,
): Promise<InventorySummary> {
  const sb = requireSupabase();

  // Get current stock value
  const { data: stock } = await sb
    .from("inventory_ledger")
    .select("quantity_kg, unit_cost")
    .eq("organization_id", ctx.organizationId);

  const inventoryValue = stock?.reduce((sum, s) => sum + Number(s.quantity_kg || 0) * Number(s.unit_cost || 0), 0) || 0;

  // TODO: Get low stock, out of stock, wastage, consumption
  return {
    inventoryValue,
    lowStockItems: 0,
    outOfStockItems: 0,
    wastageValue: 0,
    consumption: 0,
    stockAdjustments: 0,
    currency: ctx.currency,
    status: "PARTIAL",
  };
}

// =====================================================================
// PROCUREMENT
// =====================================================================

/**
 * Get procurement summary.
 */
export async function getProcurementSummary(
  ctx: AnalyticsContext,
): Promise<ProcurementSummary> {
  const sb = requireSupabase();

  const { data: purchases } = await sb
    .from("purchase_orders")
    .select("total_amount, status")
    .eq("organization_id", ctx.organizationId)
    .gte("order_date", ctx.startDate)
    .lte("order_date", ctx.endDate);

  const purchaseValue = purchases?.reduce((sum, p) => sum + Number(p.total_amount || 0), 0) || 0;
  const purchaseOrders = purchases?.length || 0;
  const pending = purchases?.filter((p) => p.status === "PENDING" || p.status === "APPROVED") || [];

  return {
    purchaseValue,
    purchaseOrders,
    goodsReceipts: 0, // TODO: Wire GRN
    averagePurchaseCost: purchaseOrders > 0 ? purchaseValue / purchaseOrders : 0,
    pendingOrders: pending.length,
    currency: ctx.currency,
    status: "ACTUAL",
  };
}

// =====================================================================
// FINANCE
// =====================================================================

/**
 * Get finance summary.
 */
export async function getFinanceSummary(
  ctx: AnalyticsContext,
): Promise<FinanceSummary> {
  const revenue = await getRevenueSummary(ctx);

  // TODO: Get expenses, cash, bank, receivables, payables from finance module
  return {
    revenue: revenue.totalRevenue,
    expenses: 0,
    profit: 0,
    cash: 0,
    bank: 0,
    receivables: 0,
    payables: 0,
    taxes: 0,
    currency: ctx.currency,
    status: "PARTIAL",
  };
}

// =====================================================================
// CRM
// =====================================================================

/**
 * Get CRM summary.
 */
export async function getCrmSummary(
  ctx: AnalyticsContext,
): Promise<CrmSummary> {
  const sb = requireSupabase();

  const { data: customers } = await sb
    .from("customers")
    .select("id, created_at")
    .eq("organization_id", ctx.organizationId);

  const totalCustomers = customers?.length || 0;
  const newCustomers = customers?.filter((c) => {
    const created = new Date(c.created_at);
    return created >= new Date(ctx.startDate) && created <= new Date(ctx.endDate);
  }).length || 0;

  // TODO: Get returning customers, repeat rate, spend data
  return {
    totalCustomers,
    newCustomers,
    returningCustomers: 0,
    repeatRate: 0,
    totalCustomerSpend: 0,
    averageCustomerSpend: 0,
    currency: ctx.currency,
    status: "PARTIAL",
  };
}

// =====================================================================
// HR
// =====================================================================

/**
 * Get HR summary.
 */
export async function getHrSummary(
  ctx: AnalyticsContext,
): Promise<HrSummary> {
  const sb = requireSupabase();

  const { data: employees } = await sb
    .from("employees")
    .select("id, status")
    .eq("organization_id", ctx.organizationId);

  const activeEmployees = employees?.filter((e) => e.status === "ACTIVE").length || 0;

  // TODO: Get attendance, leave, tasks
  return {
    activeEmployees,
    presentToday: 0,
    absent: 0,
    onLeave: 0,
    late: 0,
    openTasks: 0,
    status: "PARTIAL",
  };
}

// =====================================================================
// COMMERCE
// =====================================================================

/**
 * Get commerce summary.
 */
export async function getCommerceSummary(
  ctx: AnalyticsContext,
): Promise<CommerceSummary> {
  // TODO: Wire commerce channels
  return {
    qrOrders: 0,
    onlineOrders: 0,
    directBookings: 0,
    takeawayOrders: 0,
    conversionRate: 0,
    currency: ctx.currency,
    status: "UNAVAILABLE",
  };
}

// =====================================================================
// ENTERPRISE
// =====================================================================

/**
 * Get property scorecards for multi-property organizations.
 */
export async function getPropertyScorecards(
  ctx: AnalyticsContext,
): Promise<PropertyScorecard[]> {
  const sb = requireSupabase();

  const { data: properties } = await sb
    .from("properties")
    .select("id, name")
    .eq("organization_id", ctx.organizationId);

  if (!properties || properties.length === 0) {
    return [];
  }

  // TODO: Calculate KPIs for each property
  return properties.map((p) => ({
    propertyId: p.id,
    propertyName: p.name,
    revenue: 0,
    profit: 0,
    occupancy: 0,
    restaurantSales: 0,
    events: 0,
    outstanding: 0,
    trends: {
      revenue: "FLAT",
      profit: "FLAT",
      occupancy: "FLAT",
      restaurant: "FLAT",
      inventory: "FLAT",
      receivables: "FLAT",
    },
  }));
}

// =====================================================================
// ATTENTION CENTER
// =====================================================================

/**
 * Get attention items requiring owner action.
 */
export async function getAttentionItems(
  _ctx: AnalyticsContext,
): Promise<AttentionItem[]> {
  const items: AttentionItem[] = [];

  // TODO: Aggregate from various modules
  // - Housekeeping issues
  // - Maintenance issues
  // - Low stock
  // - Overdue receivables
  // - Due payables
  // - Event follow-ups
  // - Cancellations

  return items.sort((a, b) => {
    const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

// =====================================================================
// CHANGE DETECTION
// =====================================================================

/**
 * Detect meaningful changes between current and previous period.
 */
export async function detectChanges(
  ctx: AnalyticsContext,
  previousCtx: AnalyticsContext,
): Promise<ChangeItem[]> {
  const changes: ChangeItem[] = [];

  const currentRevenue = await getRevenueSummary(ctx);
  const previousRevenue = await getRevenueSummary(previousCtx);

  if (previousRevenue.totalRevenue > 0) {
    const change = currentRevenue.totalRevenue - previousRevenue.totalRevenue;
    const changePercent = (change / previousRevenue.totalRevenue) * 100;
    changes.push({
      metric: "Revenue",
      currentValue: currentRevenue.totalRevenue,
      previousValue: previousRevenue.totalRevenue,
      change,
      changePercent,
      trend: change > 0 ? "UP" : change < 0 ? "DOWN" : "FLAT",
      unit: "CURRENCY",
    });
  }

  // TODO: Add more change detections

  return changes.filter((c) => Math.abs(c.changePercent) > 5); // Only meaningful changes
}
