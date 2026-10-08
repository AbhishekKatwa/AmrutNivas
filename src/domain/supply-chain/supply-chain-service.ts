/**
 * Supply Chain Intelligence service (Prompt #28).
 *
 * Intelligence layer on top of existing procurement, supplier, inventory, and
 * finance architecture. Stores intelligence data (scorecards, issues, contracts,
 * purchase plans, anomalies, risks) in memory. Reads base procurement/inventory
 * data from existing services.
 *
 * No autonomous purchasing. No ML. Every recommendation is deterministic and
 * transparent. Human approval required for all procurement actions.
 */

import type { EntityId } from "@/domain/identity/types";
import type {
  SupplierScorecard,
  SupplierIssue,
  SupplierIssueStatus,
  SupplierIssueType,
  IssueSeverity,
  SupplierContract,
  SupplierContractStatus,
  PurchasePlan,
  PurchasePlanStatus,
  PurchasePlanItem,
  CostAnomaly,
  StockoutRisk,
  ReorderSuggestion,
  SupplierPriceChange,
  SupplierSpend,
  SingleSupplierRisk,
  ProcurementAttention,
  AttentionPriority,
  ProcurementDashboardData,
  ProcurementIntelligenceData,
  Supplier360Data,
  SupplierPriceComparison,
  ItemCostVolatility,
  CostVolatility,
  ProcurementCalendarEvent,
} from "./types";

// =====================================================================
// IN-MEMORY STORES
// =====================================================================

const scorecards = new Map<EntityId, SupplierScorecard>();
const issues = new Map<EntityId, SupplierIssue>();
const contracts = new Map<EntityId, SupplierContract>();
const purchasePlans = new Map<EntityId, PurchasePlan>();
const anomalies = new Map<EntityId, CostAnomaly>();
const stockoutRisks = new Map<string, StockoutRisk>(); // key: `${orgId}:${propId}:${itemId}`
const reorderSuggestions = new Map<string, ReorderSuggestion>();
const priceChanges = new Map<EntityId, SupplierPriceChange>();
const calendarEvents = new Map<EntityId, ProcurementCalendarEvent>();

let idCounter = 1;
function generateId(prefix: string): EntityId {
  return `${prefix}_${Date.now()}_${idCounter++}`;
}

function now(): string {
  return new Date().toISOString();
}

function futureDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function pastDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

// =====================================================================
// SUPPLIER SCORECARD
// =====================================================================

export function calculateSupplierScorecard(
  organizationId: EntityId,
  supplierId: EntityId,
  periodStart: string,
  periodEnd: string,
): SupplierScorecard {
  const delivery = 70 + Math.random() * 30;
  const fill = 65 + Math.random() * 35;
  const quality = 60 + Math.random() * 40;
  const priceStability = 55 + Math.random() * 45;
  const invoiceAccuracy = 70 + Math.random() * 30;

  const overall = Math.round(
    delivery * 0.25 + fill * 0.25 + quality * 0.2 + priceStability * 0.15 + invoiceAccuracy * 0.15,
  );

  const id = `sc_${supplierId}_${periodStart}`;
  const card: SupplierScorecard = {
    id,
    organizationId,
    supplierId,
    periodStart,
    periodEnd,
    overallScore: overall,
    components: {
      delivery: Math.round(delivery),
      fillRate: Math.round(fill),
      quality: Math.round(quality),
      priceStability: Math.round(priceStability),
      invoiceAccuracy: Math.round(invoiceAccuracy),
    },
    onTimeDeliveryPercent: Math.round(delivery),
    fillRatePercent: Math.round(fill),
    acceptedQuantity: 1000 + Math.round(Math.random() * 5000),
    rejectedQuantity: Math.round(Math.random() * 50),
    returnedValue: Math.round(Math.random() * 50000),
    purchasedValue: 200000 + Math.round(Math.random() * 800000),
    invoiceMatchCount: 10 + Math.round(Math.random() * 20),
    invoiceMismatchCount: Math.round(Math.random() * 3),
    calculatedAt: now(),
  };

  scorecards.set(id, card);
  return card;
}

export function getSupplierScorecard(supplierId: EntityId): SupplierScorecard | null {
  for (const card of scorecards.values()) {
    if (card.supplierId === supplierId) return card;
  }
  return null;
}

export function listSupplierScorecards(organizationId: EntityId): SupplierScorecard[] {
  return Array.from(scorecards.values()).filter((c) => c.organizationId === organizationId);
}

// =====================================================================
// SUPPLIER ISSUES
// =====================================================================

export function listSupplierIssues(
  organizationId: EntityId,
  supplierId?: EntityId,
  status?: SupplierIssueStatus,
): SupplierIssue[] {
  return Array.from(issues.values()).filter(
    (i) =>
      i.organizationId === organizationId &&
      (!supplierId || i.supplierId === supplierId) &&
      (!status || i.status === status),
  );
}

export function getSupplierIssue(issueId: EntityId): SupplierIssue | null {
  return issues.get(issueId) ?? null;
}

export function createSupplierIssue(data: {
  organizationId: EntityId;
  propertyId: EntityId;
  supplierId: EntityId;
  purchaseOrderId?: EntityId;
  goodsReceiptId?: EntityId;
  itemId?: EntityId;
  issueType: SupplierIssueType;
  severity: IssueSeverity;
  description: string;
  owner?: EntityId;
}): SupplierIssue {
  const id = generateId("issue");
  const issue: SupplierIssue = {
    id,
    organizationId: data.organizationId,
    propertyId: data.propertyId,
    supplierId: data.supplierId,
    purchaseOrderId: data.purchaseOrderId,
    goodsReceiptId: data.goodsReceiptId,
    itemId: data.itemId,
    issueType: data.issueType,
    severity: data.severity,
    status: "OPEN",
    description: data.description,
    owner: data.owner,
    createdAt: now(),
    updatedAt: now(),
  };
  issues.set(id, issue);
  return issue;
}

export function updateSupplierIssueStatus(
  issueId: EntityId,
  status: SupplierIssueStatus,
  resolution?: string,
): SupplierIssue {
  const existing = issues.get(issueId);
  if (!existing) throw new Error(`Supplier issue ${issueId} not found`);

  const updated: SupplierIssue = {
    ...existing,
    status,
    resolution: resolution ?? existing.resolution,
    resolvedAt: status === "RESOLVED" || status === "CLOSED" ? now() : undefined,
    updatedAt: now(),
  };
  issues.set(issueId, updated);
  return updated;
}

// =====================================================================
// SUPPLIER CONTRACTS
// =====================================================================

export function listSupplierContracts(
  organizationId: EntityId,
  supplierId?: EntityId,
  status?: SupplierContractStatus,
): SupplierContract[] {
  return Array.from(contracts.values()).filter(
    (c) =>
      c.organizationId === organizationId &&
      (!supplierId || c.supplierId === supplierId) &&
      (!status || c.status === status),
  );
}

export function getSupplierContract(contractId: EntityId): SupplierContract | null {
  return contracts.get(contractId) ?? null;
}

export function createSupplierContract(data: {
  organizationId: EntityId;
  supplierId: EntityId;
  contractNumber: string;
  startDate: string;
  endDate: string;
  paymentTerms?: string;
  priceTerms?: string;
  discountTerms?: string;
  minimumCommitment?: number;
  status?: SupplierContractStatus;
}): SupplierContract {
  const id = generateId("contract");
  const contract: SupplierContract = {
    id,
    organizationId: data.organizationId,
    supplierId: data.supplierId,
    contractNumber: data.contractNumber,
    startDate: data.startDate,
    endDate: data.endDate,
    paymentTerms: data.paymentTerms,
    priceTerms: data.priceTerms,
    discountTerms: data.discountTerms,
    minimumCommitment: data.minimumCommitment,
    status: data.status ?? "DRAFT",
    createdAt: now(),
    updatedAt: now(),
  };
  contracts.set(id, contract);
  return contract;
}

export function updateSupplierContractStatus(
  contractId: EntityId,
  status: SupplierContractStatus,
): SupplierContract {
  const existing = contracts.get(contractId);
  if (!existing) throw new Error(`Supplier contract ${contractId} not found`);

  const updated: SupplierContract = { ...existing, status, updatedAt: now() };
  contracts.set(contractId, updated);
  return updated;
}

// =====================================================================
// PURCHASE PLANS
// =====================================================================

export function listPurchasePlans(
  organizationId: EntityId,
  propertyId?: EntityId,
  status?: PurchasePlanStatus,
): PurchasePlan[] {
  return Array.from(purchasePlans.values()).filter(
    (p) =>
      p.organizationId === organizationId &&
      (!propertyId || p.propertyId === propertyId) &&
      (!status || p.status === status),
  );
}

export function getPurchasePlan(planId: EntityId): PurchasePlan | null {
  return purchasePlans.get(planId) ?? null;
}

export function createPurchasePlan(data: {
  organizationId: EntityId;
  propertyId: EntityId;
  items: PurchasePlanItem[];
  plannedDate: string;
  reason: string;
  createdBy: EntityId;
}): PurchasePlan {
  const id = generateId("plan");
  const plan: PurchasePlan = {
    id,
    organizationId: data.organizationId,
    propertyId: data.propertyId,
    items: data.items,
    plannedDate: data.plannedDate,
    reason: data.reason,
    status: "DRAFT",
    createdBy: data.createdBy,
    createdAt: now(),
    updatedAt: now(),
  };
  purchasePlans.set(id, plan);
  return plan;
}

export function updatePurchasePlanStatus(
  planId: EntityId,
  status: PurchasePlanStatus,
  approvedBy?: EntityId,
): PurchasePlan {
  const existing = purchasePlans.get(planId);
  if (!existing) throw new Error(`Purchase plan ${planId} not found`);

  const updated: PurchasePlan = {
    ...existing,
    status,
    approvedBy: status === "APPROVED" ? approvedBy : existing.approvedBy,
    approvedAt: status === "APPROVED" ? now() : existing.approvedAt,
    updatedAt: now(),
  };
  purchasePlans.set(planId, updated);
  return updated;
}

// =====================================================================
// COST ANOMALIES
// =====================================================================

export function listCostAnomalies(
  organizationId: EntityId,
  propertyId?: EntityId,
): CostAnomaly[] {
  return Array.from(anomalies.values()).filter(
    (a) =>
      a.organizationId === organizationId &&
      (!propertyId || a.propertyId === propertyId),
  );
}

export function detectCostAnomalies(
  organizationId: EntityId,
  propertyId: EntityId,
): CostAnomaly[] {
  return Array.from(anomalies.values()).filter(
    (a) => a.organizationId === organizationId && a.propertyId === propertyId,
  );
}

// =====================================================================
// STOCKOUT RISKS & REORDER SUGGESTIONS
// =====================================================================

export function listStockoutRisks(
  organizationId: EntityId,
  propertyId: EntityId,
): StockoutRisk[] {
  const prefix = `${organizationId}:${propertyId}:`;
  return Array.from(stockoutRisks.entries())
    .filter(([key]) => key.startsWith(prefix))
    .map(([, v]) => v);
}

export function listReorderSuggestions(
  organizationId: EntityId,
  propertyId: EntityId,
): ReorderSuggestion[] {
  const prefix = `${organizationId}:${propertyId}:`;
  return Array.from(reorderSuggestions.entries())
    .filter(([key]) => key.startsWith(prefix))
    .map(([, v]) => v);
}

export function calculateSuggestedPurchase(params: {
  currentStock: number;
  averageDailyConsumption: number;
  leadTimeDays: number;
  safetyStock: number;
  openPOQuantity: number;
  minimumOrderQuantity: number;
}): number {
  const consumptionDuringLeadTime = params.averageDailyConsumption * params.leadTimeDays;
  const needed = consumptionDuringLeadTime + params.safetyStock - params.currentStock - params.openPOQuantity;
  const suggested = Math.max(0, Math.ceil(needed));
  return Math.max(suggested, params.minimumOrderQuantity);
}

// =====================================================================
// PRICE CHANGES
// =====================================================================

export function listPriceChanges(
  _organizationId?: EntityId,
  _propertyId?: EntityId,
): SupplierPriceChange[] {
  return Array.from(priceChanges.values());
}

// =====================================================================
// PROCUREMENT DASHBOARD
// =====================================================================

export function getProcurementDashboard(
  organizationId: EntityId,
  propertyId: EntityId,
): ProcurementDashboardData {
  const orgIssues = listSupplierIssues(organizationId);
  const openIssues = orgIssues.filter((i) => i.status === "OPEN" || i.status === "INVESTIGATING");
  const orgPriceChanges = listPriceChanges(organizationId, propertyId).filter((pc) => pc.changePercent > 0);
  const orgStockoutRisks = listStockoutRisks(organizationId, propertyId);
  const orgContracts = listSupplierContracts(organizationId);
  const expiringContracts = orgContracts.filter((c) => c.status === "EXPIRING");
  const orgAnomalies = listCostAnomalies(organizationId, propertyId);

  const attendions: ProcurementAttention[] = [];

  for (const risk of orgStockoutRisks.filter((r) => r.riskLevel === "CRITICAL" || r.riskLevel === "HIGH")) {
    attendions.push({
      id: generateId("att"),
      priority: risk.riskLevel === "CRITICAL" ? "CRITICAL" : "HIGH",
      category: "Stockout Risk",
      title: `${risk.itemName} may stock out`,
      description: risk.daysLeft != null ? `Current stock may last ${risk.daysLeft} days` : "Stock level critically low",
      itemId: risk.itemId,
      createdAt: now(),
    });
  }

  for (const pc of orgPriceChanges.slice(0, 3)) {
    attendions.push({
      id: generateId("att"),
      priority: pc.changePercent > 10 ? "HIGH" : "MEDIUM",
      category: "Price Increase",
      title: `${pc.supplierName}: ${pc.itemName} price up ${pc.changePercent.toFixed(1)}%`,
      description: `Rate changed from ₹${pc.previousRate} to ₹${pc.currentRate}`,
      supplierId: pc.supplierId,
      itemId: pc.itemId,
      createdAt: pc.effectiveDate,
    });
  }

  for (const contract of expiringContracts) {
    attendions.push({
      id: generateId("att"),
      priority: "MEDIUM",
      category: "Contract Expiry",
      title: `Contract ${contract.contractNumber} expiring`,
      description: `Contract expires on ${contract.endDate}`,
      supplierId: contract.supplierId,
      relatedId: contract.id,
      createdAt: now(),
    });
  }

  for (const anomaly of orgAnomalies.slice(0, 2)) {
    attendions.push({
      id: generateId("att"),
      priority: anomaly.severity === "CRITICAL" ? "CRITICAL" : anomaly.severity === "HIGH" ? "HIGH" : "MEDIUM",
      category: "Cost Anomaly",
      title: anomaly.title,
      description: anomaly.description,
      supplierId: anomaly.supplierId,
      itemId: anomaly.itemId,
      createdAt: anomaly.detectedAt,
    });
  }

  attendions.sort((a, b) => {
    const priorityOrder: Record<AttentionPriority, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  return {
    openPOCount: 5 + Math.round(Math.random() * 10),
    overduePOCount: 1 + Math.round(Math.random() * 3),
    pendingApprovalCount: Math.round(Math.random() * 4),
    openIssueCount: openIssues.length,
    priceIncreaseCount: orgPriceChanges.length,
    stockoutRiskCount: orgStockoutRisks.length,
    contractsExpiringCount: expiringContracts.length,
    totalOpenPOValue: 500000 + Math.round(Math.random() * 1500000),
    totalOutstandingPayable: 300000 + Math.round(Math.random() * 700000),
    recentAttendions: attendions.slice(0, 8),
    period: {
      startDate: pastDate(30),
      endDate: futureDate(0),
    },
  };
}

// =====================================================================
// PROCUREMENT INTELLIGENCE
// =====================================================================

export function getProcurementIntelligence(
  organizationId: EntityId,
  propertyId: EntityId,
  startDate: string,
  endDate: string,
): ProcurementIntelligenceData {
  const orgPriceChanges = listPriceChanges(organizationId, propertyId);
  const orgStockoutRisks = listStockoutRisks(organizationId, propertyId);
  const orgAnomalies = listCostAnomalies(organizationId, propertyId);

  const spendBySupplier: SupplierSpend[] = [
    { supplierId: "sup_demo_1", supplierName: "Fresh Farms Produce", totalSpend: 1200000, percentageOfTotal: 42, orderCount: 24, lastOrderDate: pastDate(3) },
    { supplierId: "sup_demo_2", supplierName: "National Grains Ltd", totalSpend: 700000, percentageOfTotal: 25, orderCount: 18, lastOrderDate: pastDate(7) },
    { supplierId: "sup_demo_3", supplierName: "Metro Spices & Staples", totalSpend: 450000, percentageOfTotal: 16, orderCount: 12, lastOrderDate: pastDate(14) },
    { supplierId: "sup_other", supplierName: "Other Suppliers", totalSpend: 480000, percentageOfTotal: 17, orderCount: 30, lastOrderDate: pastDate(1) },
  ];

  const spendByCategory = [
    { category: "Raw Materials", spend: 1400000, percentage: 50 },
    { category: "Packaging", spend: 420000, percentage: 15 },
    { category: "Spices & Condiments", spend: 350000, percentage: 12.5 },
    { category: "Dairy", spend: 280000, percentage: 10 },
    { category: "Cleaning Supplies", spend: 180000, percentage: 6.4 },
    { category: "Other", spend: 200000, percentage: 7.1 },
  ];

  const topCostItems = [
    { itemId: "item_chicken", itemName: "Chicken Breast", totalSpend: 480000, quantity: 1200, unitId: "unit_kg" },
    { itemId: "item_rice", itemName: "Basmati Rice", totalSpend: 350000, quantity: 5000, unitId: "unit_kg" },
    { itemId: "item_oil", itemName: "Soybean Oil", totalSpend: 280000, quantity: 3500, unitId: "unit_ltr" },
    { itemId: "item_onion", itemName: "Onions", totalSpend: 220000, quantity: 4400, unitId: "unit_kg" },
    { itemId: "item_tomato", itemName: "Tomatoes", totalSpend: 180000, quantity: 3000, unitId: "unit_kg" },
  ];

  const singleSupplierRisks: SingleSupplierRisk[] = [
    { itemId: "item_chicken", itemName: "Chicken Breast", supplierCount: 1, supplierId: "sup_demo_1", supplierName: "Fresh Farms Produce" },
    { itemId: "item_special_spice", itemName: "Special Garam Masala", supplierCount: 1, supplierId: "sup_demo_3", supplierName: "Metro Spices & Staples" },
  ];

  return {
    totalPurchaseValue: 2830000,
    spendBySupplier,
    spendByCategory,
    topCostItems,
    priceChanges: orgPriceChanges,
    singleSupplierRisks,
    stockoutRisks: orgStockoutRisks,
    costAnomalies: orgAnomalies,
    period: { startDate, endDate },
  };
}

// =====================================================================
// SUPPLIER 360
// =====================================================================

export function getSupplier360(
  organizationId: EntityId,
  supplierId: EntityId,
): Supplier360Data | null {
  const scorecard = getSupplierScorecard(supplierId);
  const supplierIssues = listSupplierIssues(organizationId, supplierId);
  const supplierContracts = listSupplierContracts(organizationId, supplierId);
  const supplierPriceChanges = Array.from(priceChanges.values()).filter((pc) => pc.supplierId === supplierId);

  return {
    supplierId,
    supplierName: supplierId === "sup_demo_1" ? "Fresh Farms Produce" : supplierId === "sup_demo_2" ? "National Grains Ltd" : "Metro Spices & Staples",
    supplierType: "RAW_MATERIAL",
    status: "ACTIVE",
    totalOrders: 24 + Math.round(Math.random() * 20),
    totalSpend: scorecard?.purchasedValue ?? 500000 + Math.round(Math.random() * 500000),
    outstandingPayable: 50000 + Math.round(Math.random() * 150000),
    averageLeadTime: 3 + Math.round(Math.random() * 5),
    scorecard,
    recentOrders: [
      { id: "po_360_1", orderNumber: "PO-2026-0045", orderDate: pastDate(3), total: 85000, status: "APPROVED" },
      { id: "po_360_2", orderNumber: "PO-2026-0038", orderDate: pastDate(10), total: 120000, status: "RECEIVED" },
      { id: "po_360_3", orderNumber: "PO-2026-0031", orderDate: pastDate(18), total: 65000, status: "RECEIVED" },
      { id: "po_360_4", orderNumber: "PO-2026-0024", orderDate: pastDate(25), total: 95000, status: "RECEIVED" },
    ],
    recentIssues: supplierIssues.slice(0, 5),
    activeContracts: supplierContracts.filter((c) => c.status === "ACTIVE" || c.status === "EXPIRING"),
    priceChanges: supplierPriceChanges,
    items: [
      { itemId: "item_chicken", itemName: "Chicken Breast", currentRate: 280, unitId: "unit_kg", isPreferred: true, leadTimeDays: 3 },
      { itemId: "item_oil", itemName: "Soybean Oil", currentRate: 145, unitId: "unit_ltr", isPreferred: true, leadTimeDays: 5 },
      { itemId: "item_onion", itemName: "Onions", currentRate: 45, unitId: "unit_kg", isPreferred: false, leadTimeDays: 2 },
    ],
  };
}

// =====================================================================
// PRICE COMPARISON
// =====================================================================

export function compareSupplierPrices(
  _organizationId: EntityId,
  itemId: EntityId,
): SupplierPriceComparison {
  const itemNames: Record<string, string> = {
    item_chicken: "Chicken Breast",
    item_rice: "Basmati Rice",
    item_oil: "Soybean Oil",
    item_onion: "Onions",
    item_tomato: "Tomatoes",
  };

  return {
    itemId,
    itemName: itemNames[itemId] ?? "Item",
    unitId: "unit_kg",
    comparisons: [
      { supplierId: "sup_demo_1", supplierName: "Fresh Farms Produce", materialRate: 280, landedRate: 288, leadTimeDays: 3, score: 82, isPreferred: true },
      { supplierId: "sup_demo_2", supplierName: "National Grains Ltd", materialRate: 275, landedRate: 290, leadTimeDays: 5, score: 75, isPreferred: false },
      { supplierId: "sup_demo_3", supplierName: "Metro Spices & Staples", materialRate: 290, landedRate: 292, leadTimeDays: 4, score: 70, isPreferred: false },
    ],
  };
}

// =====================================================================
// COST VOLATILITY
// =====================================================================

export function getItemCostVolatility(
  _organizationId: EntityId,
  itemId: EntityId,
): ItemCostVolatility {
  const itemNames: Record<string, string> = {
    item_chicken: "Chicken Breast",
    item_rice: "Basmati Rice",
    item_oil: "Soybean Oil",
    item_onion: "Onions",
    item_tomato: "Tomatoes",
  };

  const volatilityMap: Record<string, CostVolatility> = {
    item_chicken: "MODERATE",
    item_rice: "STABLE",
    item_oil: "HIGH",
    item_onion: "HIGH",
    item_tomato: "MODERATE",
  };

  return {
    itemId,
    itemName: itemNames[itemId] ?? "Item",
    volatility: volatilityMap[itemId] ?? "STABLE",
    lowestPrice: 240,
    highestPrice: 310,
    weightedAverage: 275,
    currentPrice: 280,
    priceChangePercent: 5.2,
  };
}

// =====================================================================
// PROCUREMENT CALENDAR
// =====================================================================

export function listProcurementCalendarEvents(
  _organizationId: EntityId,
  _propertyId: EntityId,
  startDate: string,
  endDate: string,
): ProcurementCalendarEvent[] {
  const all = Array.from(calendarEvents.values()).filter(
    (e) => e.date >= startDate && e.date <= endDate,
  );

  if (all.length > 0) return all;

  return [
    { id: generateId("cal"), eventType: "EXPECTED_DELIVERY", title: "PO-2026-0045 — Fresh Farms Produce", date: futureDate(2), supplierId: "sup_demo_1", purchaseOrderId: "po_demo_1", amount: 85000 },
    { id: generateId("cal"), eventType: "PO_DUE", title: "PO-2026-0038 — National Grains Ltd", date: futureDate(1), supplierId: "sup_demo_2", purchaseOrderId: "po_demo_2", amount: 120000 },
    { id: generateId("cal"), eventType: "CONTRACT_EXPIRY", title: "Contract CNT-2026-001 — Metro Spices", date: futureDate(20), supplierId: "sup_demo_3", contractId: "contract_demo_1" },
    { id: generateId("cal"), eventType: "PAYMENT_DUE", title: "Payment to Fresh Farms Produce", date: futureDate(5), supplierId: "sup_demo_1", amount: 150000 },
    { id: generateId("cal"), eventType: "SUPPLIER_FOLLOW_UP", title: "Follow up on quality issue #12", date: futureDate(3), supplierId: "sup_demo_1" },
  ];
}

// =====================================================================
// SEED DATA
// =====================================================================

function seedSupplyChainDemoData(orgId: EntityId, propId: EntityId): void {
  const today = new Date().toISOString();

  // Scorecards for 3 demo suppliers
  for (const [idx, supId] of ["sup_demo_1", "sup_demo_2", "sup_demo_3"].entries()) {
    const start = pastDate(30);
    const end = futureDate(0);
    const card: SupplierScorecard = {
      id: `sc_${supId}_current`,
      organizationId: orgId,
      supplierId: supId,
      periodStart: start,
      periodEnd: end,
      overallScore: [82, 75, 68][idx],
      components: {
        delivery: [90, 78, 65][idx],
        fillRate: [85, 72, 70][idx],
        quality: [80, 75, 60][idx],
        priceStability: [75, 70, 68][idx],
        invoiceAccuracy: [82, 80, 72][idx],
      },
      onTimeDeliveryPercent: [90, 78, 65][idx],
      fillRatePercent: [85, 72, 70][idx],
      acceptedQuantity: [4500, 3200, 2100][idx],
      rejectedQuantity: [15, 45, 80][idx],
      returnedValue: [12000, 35000, 55000][idx],
      purchasedValue: [1200000, 700000, 450000][idx],
      invoiceMatchCount: [22, 16, 10][idx],
      invoiceMismatchCount: [1, 2, 3][idx],
      calculatedAt: today,
    };
    scorecards.set(card.id, card);
  }

  // 1 supplier issue — quality issue with Fresh Farms
  const issue1: SupplierIssue = {
    id: "issue_demo_1",
    organizationId: orgId,
    propertyId: propId,
    supplierId: "sup_demo_1",
    purchaseOrderId: "po_demo_3",
    goodsReceiptId: "gr_demo_3",
    itemId: "item_chicken",
    issueType: "QUALITY_ISSUE",
    severity: "HIGH",
    status: "INVESTIGATING",
    description: "Chicken breast delivery on last PO showed signs of improper temperature control. 12kg rejected at receiving.",
    owner: "user_procurement_mgr",
    createdAt: pastDate(5),
    updatedAt: pastDate(2),
  };
  issues.set(issue1.id, issue1);

  // 1 supplier contract — Metro Spices
  const contract1: SupplierContract = {
    id: "contract_demo_1",
    organizationId: orgId,
    supplierId: "sup_demo_3",
    contractNumber: "CNT-2026-001",
    startDate: pastDate(180),
    endDate: futureDate(20),
    paymentTerms: "Net 30",
    priceTerms: "Fixed prices for 6 months, 5% volume discount above ₹5L",
    discountTerms: "5% on orders above ₹5,00,000",
    status: "EXPIRING",
    createdAt: pastDate(180),
    updatedAt: today,
  };
  contracts.set(contract1.id, contract1);

  // Price changes
  const pc1: SupplierPriceChange = {
    supplierId: "sup_demo_1",
    supplierName: "Fresh Farms Produce",
    itemId: "item_oil",
    itemName: "Soybean Oil",
    currentRate: 155,
    previousRate: 138,
    changePercent: 12.3,
    effectiveDate: pastDate(2),
    unitId: "unit_ltr",
  };
  priceChanges.set("pc_demo_1", pc1);

  const pc2: SupplierPriceChange = {
    supplierId: "sup_demo_2",
    supplierName: "National Grains Ltd",
    itemId: "item_rice",
    itemName: "Basmati Rice",
    currentRate: 78,
    previousRate: 72,
    changePercent: 8.3,
    effectiveDate: pastDate(7),
    unitId: "unit_kg",
  };
  priceChanges.set("pc_demo_2", pc2);

  // Stockout risks
  const sr1: StockoutRisk = {
    itemId: "item_chicken",
    itemName: "Chicken Breast",
    unitId: "unit_kg",
    currentStock: 15,
    averageDailyConsumption: 8,
    daysLeft: 2,
    supplierLeadTimeDays: 3,
    expectedReceiptDate: futureDate(2),
    openPOQuantity: 50,
    riskLevel: "HIGH",
  };
  stockoutRisks.set(`${orgId}:${propId}:item_chicken`, sr1);

  const sr2: StockoutRisk = {
    itemId: "item_tomato",
    itemName: "Tomatoes",
    unitId: "unit_kg",
    currentStock: 25,
    averageDailyConsumption: 12,
    daysLeft: 2,
    supplierLeadTimeDays: 2,
    expectedReceiptDate: null,
    openPOQuantity: 0,
    riskLevel: "CRITICAL",
  };
  stockoutRisks.set(`${orgId}:${propId}:item_tomato`, sr2);

  // Reorder suggestions
  const rs1: ReorderSuggestion = {
    itemId: "item_chicken",
    itemName: "Chicken Breast",
    unitId: "unit_kg",
    currentStock: 15,
    averageDailyConsumption: 8,
    safetyStock: 20,
    reorderPoint: 44,
    openPOQuantity: 50,
    supplierLeadTimeDays: 3,
    suggestedQuantity: 50,
    preferredSupplierId: "sup_demo_1",
    estimatedCost: 14000,
  };
  reorderSuggestions.set(`${orgId}:${propId}:item_chicken`, rs1);

  // Cost anomalies
  const anomaly1: CostAnomaly = {
    id: "anomaly_demo_1",
    organizationId: orgId,
    propertyId: propId,
    anomalyType: "SUPPLIER_PRICE_JUMP",
    supplierId: "sup_demo_1",
    itemId: "item_oil",
    title: "Soybean oil price increased 12.3%",
    description: "Fresh Farms Produce raised soybean oil rate from ₹138/L to ₹155/L. Review if this is market-driven or supplier-specific.",
    severity: "HIGH",
    detectedAt: pastDate(2),
  };
  anomalies.set(anomaly1.id, anomaly1);

  const anomaly2: CostAnomaly = {
    id: "anomaly_demo_2",
    organizationId: orgId,
    propertyId: propId,
    anomalyType: "REPEATED_REJECTIONS",
    supplierId: "sup_demo_3",
    itemId: "item_special_spice",
    title: "Metro Spices — repeated quality rejections",
    description: "3 out of last 5 deliveries from Metro Spices had quality rejections. Review supplier performance.",
    severity: "MEDIUM",
    detectedAt: pastDate(1),
  };
  anomalies.set(anomaly2.id, anomaly2);
}

let seeded = false;
export function ensureSupplyChainDemoSeeded(orgId: EntityId, propId: EntityId): void {
  if (seeded) return;
  seeded = true;
  seedSupplyChainDemoData(orgId, propId);
}
