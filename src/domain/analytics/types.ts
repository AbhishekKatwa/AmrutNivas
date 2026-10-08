/**
 * Analytics type definitions.
 *
 * KPIs, summaries, and comparison structures for the analytics layer.
 */

import type { EntityId } from "@/domain/identity/types";

// =====================================================================
// KPI DEFINITIONS
// =====================================================================

export type KpiUnit = "CURRENCY" | "PERCENT" | "COUNT" | "DAYS" | "RATIO";

export type KpiStatus = "ACTUAL" | "ESTIMATED" | "PARTIAL" | "UNAVAILABLE";

export type KpiTrend = "UP" | "DOWN" | "FLAT" | "UNKNOWN";

export interface KpiDefinition {
  code: string;
  name: string;
  description: string;
  domain: string;
  formulaDescription: string;
  unit: KpiUnit;
  source: string;
}

export interface KpiValue {
  code: string;
  value: number;
  previousValue?: number;
  change?: number;
  changePercent?: number;
  trend: KpiTrend;
  status: KpiStatus;
  unit: KpiUnit;
  currency?: string;
}

// =====================================================================
// REVENUE
// =====================================================================

export interface RevenueSummary {
  totalRevenue: number;
  restaurantRevenue: number;
  roomRevenue: number;
  eventRevenue: number;
  otherRevenue: number;
  currency: string;
  status: KpiStatus;
}

export interface RevenueTrendPoint {
  date: string;
  revenue: number;
  previousRevenue?: number;
}

export interface RevenueMix {
  category: string;
  amount: number;
  percentage: number;
}

// =====================================================================
// PROFITABILITY
// =====================================================================

export interface ProfitabilitySummary {
  revenue: number;
  cogs: number;
  grossProfit: number;
  operatingExpenses: number;
  netProfit: number;
  grossMargin: number;
  netMargin: number;
  currency: string;
  status: KpiStatus;
}

export interface CogsBreakdown {
  foodCost: number;
  beverageCost: number;
  roomOperatingCost: number;
  otherCogs: number;
}

export interface OpexBreakdown {
  salaries: number;
  utilities: number;
  rent: number;
  repairs: number;
  marketing: number;
  administrative: number;
  other: number;
}

// =====================================================================
// RESTAURANT
// =====================================================================

export interface RestaurantSummary {
  revenue: number;
  orders: number;
  averageOrderValue: number;
  covers: number;
  revenuePerCover: number;
  discounts: number;
  refunds: number;
  cancelledOrders: number;
  currency: string;
  status: KpiStatus;
}

export interface OutletPerformance {
  outletId: EntityId;
  outletName: string;
  revenue: number;
  orders: number;
  averageOrderValue: number;
  growth?: number;
}

export interface MenuItemPerformance {
  itemId: EntityId;
  itemName: string;
  quantitySold: number;
  revenue: number;
  averageSellingPrice: number;
  classification?: "HIGH_VOLUME" | "HIGH_REVENUE" | "LOW_VOLUME" | "LOW_REVENUE";
}

// =====================================================================
// HOTEL
// =====================================================================

export interface HotelSummary {
  occupancy: number;
  adr: number;
  revpar: number;
  roomRevenue: number;
  availableRooms: number;
  soldRooms: number;
  noShows: number;
  cancellations: number;
  averageLengthOfStay: number;
  currency: string;
  status: KpiStatus;
}

export interface RoomTypePerformance {
  roomTypeId: EntityId;
  roomTypeName: string;
  available: number;
  sold: number;
  occupancy: number;
  adr: number;
  revenue: number;
}

export interface BookingSourceAnalytics {
  source: string;
  bookings: number;
  roomNights: number;
  revenue: number;
  adr: number;
  cancellationRate: number;
}

// =====================================================================
// EVENTS
// =====================================================================

export interface EventSummary {
  leads: number;
  confirmedEvents: number;
  completedEvents: number;
  pipelineValue: number;
  confirmedValue: number;
  collectedAdvance: number;
  outstanding: number;
  eventRevenue: number;
  currency: string;
  status: KpiStatus;
}

export interface EventPipelineStage {
  stage: string;
  count: number;
  value: number;
}

export interface EventTypePerformance {
  eventType: string;
  numberOfEvents: number;
  revenue: number;
  averageEventValue: number;
}

// =====================================================================
// INVENTORY
// =====================================================================

export interface InventorySummary {
  inventoryValue: number;
  lowStockItems: number;
  outOfStockItems: number;
  wastageValue: number;
  consumption: number;
  stockAdjustments: number;
  currency: string;
  status: KpiStatus;
}

export interface StockHealth {
  healthy: number;
  low: number;
  critical: number;
  outOfStock: number;
}

export interface WastageAnalytics {
  totalWastageValue: number;
  totalWastageQuantity: number;
  byReason: Record<string, number>;
  byProperty: Record<string, number>;
  byOutlet: Record<string, number>;
}

// =====================================================================
// PROCUREMENT
// =====================================================================

export interface ProcurementSummary {
  purchaseValue: number;
  purchaseOrders: number;
  goodsReceipts: number;
  averagePurchaseCost: number;
  pendingOrders: number;
  currency: string;
  status: KpiStatus;
}

export interface SupplierAnalytics {
  supplierId: EntityId;
  supplierName: string;
  purchaseValue: number;
  orders: number;
  averageRate: number;
  outstanding: number;
}

// =====================================================================
// FINANCE
// =====================================================================

export interface FinanceSummary {
  revenue: number;
  expenses: number;
  profit: number;
  cash: number;
  bank: number;
  receivables: number;
  payables: number;
  taxes: number;
  currency: string;
  status: KpiStatus;
}

export interface CashPosition {
  cash: number;
  bank: number;
  totalLiquidFunds: number;
  opening: number;
  inflows: number;
  outflows: number;
  closing: number;
}

export interface ReceivablesAging {
  totalOutstanding: number;
  current: number;
  days1To30: number;
  days31To60: number;
  days61To90: number;
  days90Plus: number;
}

export interface PayablesSummary {
  totalOutstanding: number;
  due: number;
  overdue: number;
}

// =====================================================================
// CRM
// =====================================================================

export interface CrmSummary {
  totalCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  repeatRate: number;
  totalCustomerSpend: number;
  averageCustomerSpend: number;
  currency: string;
  status: KpiStatus;
}

export interface TopCustomer {
  customerId: EntityId;
  customerName: string;
  revenue: number;
  visits: number;
  averageSpend: number;
  lastVisit: string;
}

// =====================================================================
// HR
// =====================================================================

export interface HrSummary {
  activeEmployees: number;
  presentToday: number;
  absent: number;
  onLeave: number;
  late: number;
  openTasks: number;
  status: KpiStatus;
}

export interface AttendanceAnalytics {
  attendanceRate: number;
  absenceRate: number;
  lateCount: number;
  missedPunches: number;
}

// =====================================================================
// COMMERCE
// =====================================================================

export interface CommerceSummary {
  qrOrders: number;
  onlineOrders: number;
  directBookings: number;
  takeawayOrders: number;
  conversionRate: number;
  currency: string;
  status: KpiStatus;
}

// =====================================================================
// ENTERPRISE
// =====================================================================

export interface PropertyScorecard {
  propertyId: EntityId;
  propertyName: string;
  revenue: number;
  profit: number;
  occupancy: number;
  restaurantSales: number;
  events: number;
  outstanding: number;
  trends: {
    revenue: KpiTrend;
    profit: KpiTrend;
    occupancy: KpiTrend;
    restaurant: KpiTrend;
    inventory: KpiTrend;
    receivables: KpiTrend;
  };
}

// =====================================================================
// ATTENTION CENTER
// =====================================================================

export type AttentionPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface AttentionItem {
  id: string;
  priority: AttentionPriority;
  category: string;
  title: string;
  description: string;
  count?: number;
  amount?: number;
  link?: string;
  currency?: string;
}

// =====================================================================
// CHANGE DETECTION
// =====================================================================

export interface ChangeItem {
  metric: string;
  currentValue: number;
  previousValue: number;
  change: number;
  changePercent: number;
  trend: KpiTrend;
  unit: KpiUnit;
}

// =====================================================================
// ANALYTICS CONTEXT
// =====================================================================

export interface AnalyticsContext {
  organizationId: EntityId;
  propertyId?: EntityId;
  outletId?: EntityId;
  startDate: string;
  endDate: string;
  currency: string;
}
