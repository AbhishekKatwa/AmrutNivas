import type { EntityId } from "@/domain/identity/types";

// ============================================================ supplier scorecard

export type SupplierScoreComponent = {
  readonly delivery: number;
  readonly fillRate: number;
  readonly quality: number;
  readonly priceStability: number;
  readonly invoiceAccuracy: number;
};

export interface SupplierScorecard {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly supplierId: EntityId;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly overallScore: number;
  readonly components: SupplierScoreComponent;
  readonly onTimeDeliveryPercent: number | null;
  readonly fillRatePercent: number | null;
  readonly acceptedQuantity: number;
  readonly rejectedQuantity: number;
  readonly returnedValue: number;
  readonly purchasedValue: number;
  readonly invoiceMatchCount: number;
  readonly invoiceMismatchCount: number;
  readonly calculatedAt: string;
}

// ============================================================ supplier issue

export type SupplierIssueStatus = "OPEN" | "INVESTIGATING" | "RESOLVED" | "CLOSED";

export const SUPPLIER_ISSUE_STATUSES: readonly SupplierIssueStatus[] = [
  "OPEN",
  "INVESTIGATING",
  "RESOLVED",
  "CLOSED",
];

export type SupplierIssueType =
  | "LATE_DELIVERY"
  | "QUALITY_ISSUE"
  | "SHORT_SUPPLY"
  | "WRONG_ITEM"
  | "WRONG_PRICE"
  | "DAMAGED_GOODS"
  | "INVOICE_MISMATCH"
  | "OTHER";

export const SUPPLIER_ISSUE_TYPES: readonly SupplierIssueType[] = [
  "LATE_DELIVERY",
  "QUALITY_ISSUE",
  "SHORT_SUPPLY",
  "WRONG_ITEM",
  "WRONG_PRICE",
  "DAMAGED_GOODS",
  "INVOICE_MISMATCH",
  "OTHER",
];

export type IssueSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export const ISSUE_SEVERITIES: readonly IssueSeverity[] = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
];

export interface SupplierIssue {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly propertyId: EntityId;
  readonly supplierId: EntityId;
  readonly purchaseOrderId?: EntityId;
  readonly goodsReceiptId?: EntityId;
  readonly itemId?: EntityId;
  readonly issueType: SupplierIssueType;
  readonly severity: IssueSeverity;
  readonly status: SupplierIssueStatus;
  readonly description: string;
  readonly owner?: EntityId;
  readonly resolution?: string;
  readonly resolvedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ============================================================ supplier contract

export type SupplierContractStatus = "DRAFT" | "ACTIVE" | "EXPIRING" | "EXPIRED" | "CANCELLED";

export const SUPPLIER_CONTRACT_STATUSES: readonly SupplierContractStatus[] = [
  "DRAFT",
  "ACTIVE",
  "EXPIRING",
  "EXPIRED",
  "CANCELLED",
];

export interface ContractPriceTerm {
  readonly itemId: EntityId;
  readonly contractRate: number;
  readonly validFrom: string;
  readonly validUntil: string;
  readonly minimumOrderQuantity?: number;
  readonly leadTimeDays?: number;
}

export interface SupplierContract {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly supplierId: EntityId;
  readonly contractNumber: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly paymentTerms?: string;
  readonly priceTerms?: string;
  readonly discountTerms?: string;
  readonly minimumCommitment?: number;
  readonly documentId?: EntityId;
  readonly status: SupplierContractStatus;
  readonly priceTerms_detail?: readonly ContractPriceTerm[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ============================================================ purchase plan

export type PurchasePlanStatus = "DRAFT" | "REVIEW" | "APPROVED" | "CONVERTED" | "CANCELLED";

export const PURCHASE_PLAN_STATUSES: readonly PurchasePlanStatus[] = [
  "DRAFT",
  "REVIEW",
  "APPROVED",
  "CONVERTED",
  "CANCELLED",
];

export interface PurchasePlanItem {
  readonly itemId: EntityId;
  readonly itemName: string;
  readonly suggestedQuantity: number;
  readonly unitId: EntityId;
  readonly estimatedRate: number;
  readonly supplierId?: EntityId;
  readonly currentStock: number;
  readonly openPOQuantity: number;
  readonly daysOfStock: number | null;
}

export interface PurchasePlan {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly propertyId: EntityId;
  readonly items: readonly PurchasePlanItem[];
  readonly plannedDate: string;
  readonly reason: string;
  readonly status: PurchasePlanStatus;
  readonly createdBy: EntityId;
  readonly approvedBy?: EntityId;
  readonly approvedAt?: string;
  readonly purchaseRequestId?: EntityId;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ============================================================ cost anomaly

export type CostAnomalyType =
  | "PRICE_UNUSUALLY_HIGH"
  | "REPEATED_REJECTIONS"
  | "HIGH_WASTAGE"
  | "HIGH_RETURN_RATE"
  | "DUPLICATE_PURCHASING"
  | "SUPPLIER_PRICE_JUMP"
  | "HIGH_FREIGHT_RATIO";

export const COST_ANOMALY_TYPES: readonly CostAnomalyType[] = [
  "PRICE_UNUSUALLY_HIGH",
  "REPEATED_REJECTIONS",
  "HIGH_WASTAGE",
  "HIGH_RETURN_RATE",
  "DUPLICATE_PURCHASING",
  "SUPPLIER_PRICE_JUMP",
  "HIGH_FREIGHT_RATIO",
];

export interface CostAnomaly {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly propertyId: EntityId;
  readonly anomalyType: CostAnomalyType;
  readonly supplierId?: EntityId;
  readonly itemId?: EntityId;
  readonly title: string;
  readonly description: string;
  readonly severity: IssueSeverity;
  readonly detectedAt: string;
  readonly resolvedAt?: string;
}

// ============================================================ stockout risk

export interface StockoutRisk {
  readonly itemId: EntityId;
  readonly itemName: string;
  readonly unitId: EntityId;
  readonly currentStock: number;
  readonly averageDailyConsumption: number | null;
  readonly daysLeft: number | null;
  readonly supplierLeadTimeDays: number | null;
  readonly expectedReceiptDate: string | null;
  readonly openPOQuantity: number;
  readonly riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

// ============================================================ reorder suggestion

export interface ReorderSuggestion {
  readonly itemId: EntityId;
  readonly itemName: string;
  readonly unitId: EntityId;
  readonly currentStock: number;
  readonly averageDailyConsumption: number | null;
  readonly safetyStock: number;
  readonly reorderPoint: number;
  readonly openPOQuantity: number;
  readonly supplierLeadTimeDays: number | null;
  readonly suggestedQuantity: number;
  readonly preferredSupplierId: EntityId | null;
  readonly estimatedCost: number;
}

// ============================================================ price change

export interface SupplierPriceChange {
  readonly supplierId: EntityId;
  readonly supplierName: string;
  readonly itemId: EntityId;
  readonly itemName: string;
  readonly currentRate: number;
  readonly previousRate: number;
  readonly changePercent: number;
  readonly effectiveDate: string;
  readonly unitId: EntityId;
}

// ============================================================ supplier spend

export interface SupplierSpend {
  readonly supplierId: EntityId;
  readonly supplierName: string;
  readonly totalSpend: number;
  readonly percentageOfTotal: number;
  readonly orderCount: number;
  readonly lastOrderDate: string | null;
}

// ============================================================ single supplier risk

export interface SingleSupplierRisk {
  readonly itemId: EntityId;
  readonly itemName: string;
  readonly supplierCount: number;
  readonly supplierId: EntityId;
  readonly supplierName: string;
}

// ============================================================ procurement attention

export type AttentionPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface ProcurementAttention {
  readonly id: EntityId;
  readonly priority: AttentionPriority;
  readonly category: string;
  readonly title: string;
  readonly description: string;
  readonly supplierId?: EntityId;
  readonly itemId?: EntityId;
  readonly relatedId?: EntityId;
  readonly createdAt: string;
}

// ============================================================ procurement dashboard data

export interface ProcurementDashboardData {
  readonly openPOCount: number;
  readonly overduePOCount: number;
  readonly pendingApprovalCount: number;
  readonly openIssueCount: number;
  readonly priceIncreaseCount: number;
  readonly stockoutRiskCount: number;
  readonly contractsExpiringCount: number;
  readonly totalOpenPOValue: number;
  readonly totalOutstandingPayable: number;
  readonly recentAttendions: readonly ProcurementAttention[];
  readonly period: {
    readonly startDate: string;
    readonly endDate: string;
  };
}

// ============================================================ procurement intelligence data

export interface ProcurementIntelligenceData {
  readonly totalPurchaseValue: number;
  readonly spendBySupplier: readonly SupplierSpend[];
  readonly spendByCategory: readonly { category: string; spend: number; percentage: number }[];
  readonly topCostItems: readonly { itemId: EntityId; itemName: string; totalSpend: number; quantity: number; unitId: EntityId }[];
  readonly priceChanges: readonly SupplierPriceChange[];
  readonly singleSupplierRisks: readonly SingleSupplierRisk[];
  readonly stockoutRisks: readonly StockoutRisk[];
  readonly costAnomalies: readonly CostAnomaly[];
  readonly period: {
    readonly startDate: string;
    readonly endDate: string;
  };
}

// ============================================================ supplier 360 data

export interface Supplier360Data {
  readonly supplierId: EntityId;
  readonly supplierName: string;
  readonly supplierType: string;
  readonly status: string;
  readonly totalOrders: number;
  readonly totalSpend: number;
  readonly outstandingPayable: number;
  readonly averageLeadTime: number | null;
  readonly scorecard: SupplierScorecard | null;
  readonly recentOrders: readonly { id: EntityId; orderNumber: string; orderDate: string; total: number; status: string }[];
  readonly recentIssues: readonly SupplierIssue[];
  readonly activeContracts: readonly SupplierContract[];
  readonly priceChanges: readonly SupplierPriceChange[];
  readonly items: readonly { itemId: EntityId; itemName: string; currentRate: number; unitId: EntityId; isPreferred: boolean; leadTimeDays: number | null }[];
}

// ============================================================ supplier price comparison

export interface SupplierPriceComparison {
  readonly itemId: EntityId;
  readonly itemName: string;
  readonly unitId: EntityId;
  readonly comparisons: readonly {
    supplierId: EntityId;
    supplierName: string;
    materialRate: number;
    landedRate: number;
    leadTimeDays: number | null;
    score: number | null;
    isPreferred: boolean;
  }[];
}

// ============================================================ cost volatility

export type CostVolatility = "STABLE" | "MODERATE" | "HIGH";

export interface ItemCostVolatility {
  readonly itemId: EntityId;
  readonly itemName: string;
  readonly volatility: CostVolatility;
  readonly lowestPrice: number;
  readonly highestPrice: number;
  readonly weightedAverage: number;
  readonly currentPrice: number;
  readonly priceChangePercent: number | null;
}

// ============================================================ procurement calendar event

export type ProcurementCalendarEventType =
  | "EXPECTED_DELIVERY"
  | "PO_DUE"
  | "CONTRACT_EXPIRY"
  | "PAYMENT_DUE"
  | "SUPPLIER_FOLLOW_UP";

export interface ProcurementCalendarEvent {
  readonly id: EntityId;
  readonly eventType: ProcurementCalendarEventType;
  readonly title: string;
  readonly date: string;
  readonly supplierId?: EntityId;
  readonly purchaseOrderId?: EntityId;
  readonly contractId?: EntityId;
  readonly amount?: number;
}
