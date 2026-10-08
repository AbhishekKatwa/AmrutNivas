/**
 * AI service layer.
 *
 * Query routing, intent detection, permission checking, domain routing,
 * context building, and response generation.
 */

import type {
  AIContext,
  AIQuery,
  AIResponse,
  AIIntent,
  AIDomain,
  AISourceReference,
  AIFinding,
  AIRecommendation,
  AISuggestedAction,
  AIDailyBriefing,
} from "./types";
import { getAIProvider } from "./ai-provider";
import { executeTools } from "./ai-tools";
import type { AnalyticsContext } from "@/domain/analytics/types";
import {
  getRevenueSummary,
  getAttentionItems,
} from "@/domain/analytics/analytics-service";

// =====================================================================
// INTENT DETECTION
// =====================================================================

/**
 * Detect query intent from natural language.
 */
export function detectIntent(question: string): AIIntent {
  const lower = question.toLowerCase();

  if (lower.includes("revenue") && (lower.includes("why") || lower.includes("fall") || lower.includes("drop"))) {
    return "REVENUE_ANALYSIS";
  }
  if (lower.includes("profit") && (lower.includes("why") || lower.includes("down"))) {
    return "PROFIT_ANALYSIS";
  }
  if (lower.includes("occupancy") && (lower.includes("why") || lower.includes("low"))) {
    return "OCCUPANCY_ANALYSIS";
  }
  if (lower.includes("inventory") || lower.includes("stock") || lower.includes("low")) {
    return "INVENTORY_ANALYSIS";
  }
  if (lower.includes("supplier") || lower.includes("price") || lower.includes("cost")) {
    return "SUPPLIER_ANALYSIS";
  }
  if (lower.includes("customer") || lower.includes("retention") || lower.includes("returning")) {
    return "CUSTOMER_ANALYSIS";
  }
  if (lower.includes("event") || lower.includes("booking") || lower.includes("lead")) {
    return "EVENT_ANALYSIS";
  }
  if (lower.includes("employee") || lower.includes("attendance") || lower.includes("staff")) {
    return "HR_ANALYSIS";
  }
  if (lower.includes("attention") || lower.includes("needs") || lower.includes("urgent")) {
    return "ATTENTION_CHECK";
  }
  if (lower.includes("summary") || lower.includes("today") || lower.includes("snapshot")) {
    return "SUMMARY_REQUEST";
  }
  if (lower.includes("compare") || lower.includes("vs") || lower.includes("versus")) {
    return "COMPARISON_REQUEST";
  }
  if (lower.includes("what if") || lower.includes("scenario") || lower.includes("forecast")) {
    return "SCENARIO_REQUEST";
  }
  if (lower.includes("create") || lower.includes("send") || lower.includes("prepare")) {
    return "ACTION_REQUEST";
  }

  return "GENERAL_QUERY";
}

// =====================================================================
// DOMAIN ROUTING
// =====================================================================

/**
 * Route query to relevant domain(s).
 */
export function detectDomain(question: string, intent: AIIntent): AIDomain[] {
  const lower = question.toLowerCase();
  const domains: Set<AIDomain> = new Set();

  if (lower.includes("restaurant") || lower.includes("food") || lower.includes("menu") || lower.includes("order")) {
    domains.add("RESTAURANT");
  }
  if (lower.includes("hotel") || lower.includes("room") || lower.includes("occupancy") || lower.includes("reservation")) {
    domains.add("HOTEL");
  }
  if (lower.includes("inventory") || lower.includes("stock") || lower.includes("item")) {
    domains.add("INVENTORY");
  }
  if (lower.includes("supplier") || lower.includes("purchase") || lower.includes("procurement")) {
    domains.add("PROCUREMENT");
  }
  if (lower.includes("finance") || lower.includes("profit") || lower.includes("revenue") || lower.includes("cash") || lower.includes("receivable") || lower.includes("payable")) {
    domains.add("FINANCE");
  }
  if (lower.includes("customer") || lower.includes("crm") || lower.includes("loyalty")) {
    domains.add("CRM");
  }
  if (lower.includes("event") || lower.includes("booking") || lower.includes("venue")) {
    domains.add("EVENTS");
  }
  if (lower.includes("employee") || lower.includes("hr") || lower.includes("attendance") || lower.includes("staff")) {
    domains.add("HR");
  }
  if (lower.includes("commerce") || lower.includes("qr") || lower.includes("online")) {
    domains.add("COMMERCE");
  }
  if (lower.includes("property") || lower.includes("enterprise") || lower.includes("all properties")) {
    domains.add("ENTERPRISE");
  }

  if (domains.size === 0) {
    if (intent === "SUMMARY_REQUEST" || intent === "ATTENTION_CHECK") {
      domains.add("OPERATIONS");
    } else {
      domains.add("FINANCE");
    }
  }

  return Array.from(domains);
}

// =====================================================================
// PERMISSION CHECK
// =====================================================================

/**
 * Check if user has permission to access domain data.
 */
export function checkDomainPermission(
  domain: AIDomain,
  context: AIContext,
): boolean {
  const permissionMap: Record<AIDomain, string> = {
    RESTAURANT: "analytics.restaurant.view",
    HOTEL: "analytics.hotel.view",
    INVENTORY: "analytics.inventory.view",
    PROCUREMENT: "analytics.inventory.view",
    FINANCE: "analytics.finance.view",
    CRM: "analytics.crm.view",
    EVENTS: "analytics.events.view",
    HR: "analytics.hr.view",
    COMMERCE: "analytics.commerce.view",
    ENTERPRISE: "analytics.dashboard.view",
    SUBSCRIPTION: "billing.subscription.view",
    OPERATIONS: "analytics.dashboard.view",
  };

  const required = permissionMap[domain];
  return context.permissions.includes(required);
}

// =====================================================================
// CONTEXT BUILDING
// =====================================================================

/**
 * Build AI context from user session.
 */
export function buildAIContext(
  organizationId: string,
  userId: string,
  permissions: string[],
  propertyId?: string,
  outletId?: string,
  dateRange?: { start: string; end: string },
): AIContext {
  const today = new Date();
  const start = dateRange?.start || new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0];
  const end = dateRange?.end || today.toISOString().split("T")[0];

  return {
    organizationId,
    propertyId,
    outletId,
    userId,
    permissions,
    dateRange: { start, end },
    scope: outletId ? "OUTLET" : propertyId ? "PROPERTY" : "ALL_PROPERTIES",
  };
}

// =====================================================================
// QUERY PROCESSING
// =====================================================================

/**
 * Process an AI query end-to-end.
 */
export async function processQuery(query: AIQuery): Promise<AIResponse> {
  const { question, context } = query;

  const intent = detectIntent(question);
  const domains = detectDomain(question, intent);

  const allowedDomains = domains.filter((d) => checkDomainPermission(d, context));

  if (allowedDomains.length === 0) {
    return {
      queryId: query.id,
      answer: "You don't have permission to access the data needed to answer this question.",
      findings: [],
      recommendations: [],
      sources: [],
      suggestedActions: [],
      confidence: "HIGH",
      dataFreshness: "LIVE",
      timestamp: new Date().toISOString(),
    };
  }

  const toolResults = await fetchRelevantData(intent, allowedDomains, context);

  const provider = getAIProvider();
  const prompt = buildPrompt(question, intent, allowedDomains, toolResults);

  const response = await provider.generateResponse(prompt, context);

  const findings = extractFindings(toolResults, allowedDomains);
  const sources = extractSources(toolResults, allowedDomains);
  const recommendations = generateRecommendations(intent, toolResults);
  const suggestedActions = generateSuggestedActions(intent, toolResults, context);

  return {
    queryId: query.id,
    answer: response,
    findings,
    recommendations,
    sources,
    suggestedActions,
    confidence: "HIGH",
    dataFreshness: "LIVE",
    timestamp: new Date().toISOString(),
  };
}

// =====================================================================
// DATA FETCHING
// =====================================================================

async function fetchRelevantData(
  intent: AIIntent,
  domains: AIDomain[],
  context: AIContext,
): Promise<Record<string, any>> {
  const tools: string[] = [];

  if (domains.includes("FINANCE") || intent === "SUMMARY_REQUEST") {
    tools.push("getRevenueSummary");
  }
  if (domains.includes("RESTAURANT")) {
    tools.push("getRestaurantSummary");
  }
  if (domains.includes("HOTEL")) {
    tools.push("getHotelSummary");
  }
  if (domains.includes("EVENTS")) {
    tools.push("getEventSummary");
  }
  if (domains.includes("INVENTORY")) {
    tools.push("getInventorySummary");
  }
  if (domains.includes("CRM")) {
    tools.push("getCrmSummary");
  }
  if (domains.includes("HR")) {
    tools.push("getHrSummary");
  }
  if (intent === "ATTENTION_CHECK") {
    tools.push("getAttentionItems");
  }

  if (tools.length === 0) {
    tools.push("getRevenueSummary");
  }

  return executeTools(tools, context);
}

// =====================================================================
// PROMPT BUILDING
// =====================================================================

function buildPrompt(
  question: string,
  intent: AIIntent,
  domains: AIDomain[],
  data: Record<string, any>,
): string {
  const dataSummary = Object.entries(data)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join("\n");

  return `User question: ${question}

Intent: ${intent}
Domains: ${domains.join(", ")}

Available data:
${dataSummary}

Provide a concise, grounded answer based on the data. Include specific numbers and sources.`;
}

// =====================================================================
// FINDINGS & SOURCES
// =====================================================================

function extractFindings(
  data: Record<string, any>,
  _domains: AIDomain[],
): AIFinding[] {
  const findings: AIFinding[] = [];

  if (data.getRevenueSummary && !data.getRevenueSummary.error) {
    const revenue = data.getRevenueSummary;
    findings.push({
      statement: `Total revenue: ₹${(revenue.totalRevenue / 100000).toFixed(1)}L`,
      evidence: `Restaurant: ₹${(revenue.restaurantRevenue / 1000).toFixed(0)}K, Hotel: ₹${(revenue.roomRevenue / 1000).toFixed(0)}K, Events: ₹${(revenue.eventRevenue / 1000).toFixed(0)}K`,
      source: {
        label: "Revenue Summary",
        domain: "FINANCE",
        route: "/analytics/finance",
        metric: "totalRevenue",
        value: revenue.totalRevenue,
        currency: revenue.currency,
      },
    });
  }

  if (data.getRestaurantSummary && !data.getRestaurantSummary.error) {
    const restaurant = data.getRestaurantSummary;
    findings.push({
      statement: `Restaurant: ${restaurant.orders} orders, AOV ₹${restaurant.averageOrderValue.toFixed(0)}`,
      evidence: `${restaurant.covers} covers, ₹${(restaurant.discounts / 1000).toFixed(1)}K discounts`,
      source: {
        label: "Restaurant Performance",
        domain: "RESTAURANT",
        route: "/analytics/restaurant",
        metric: "revenue",
        value: restaurant.revenue,
        currency: restaurant.currency,
      },
    });
  }

  if (data.getHotelSummary && !data.getHotelSummary.error) {
    const hotel = data.getHotelSummary;
    findings.push({
      statement: `Hotel occupancy: ${hotel.occupancy.toFixed(1)}%, ADR ₹${hotel.adr.toFixed(0)}`,
      evidence: `RevPAR ₹${hotel.revpar.toFixed(0)}, ${hotel.soldRooms} rooms sold`,
      source: {
        label: "Hotel Performance",
        domain: "HOTEL",
        route: "/analytics/hotel",
        metric: "occupancy",
        value: hotel.occupancy,
      },
    });
  }

  return findings;
}

function extractSources(
  data: Record<string, any>,
  _domains: AIDomain[],
): AISourceReference[] {
  const sources: AISourceReference[] = [];

  if (data.getRevenueSummary) {
    sources.push({
      label: "Finance → Revenue",
      domain: "FINANCE",
      route: "/analytics/finance",
    });
  }
  if (data.getRestaurantSummary) {
    sources.push({
      label: "Restaurant → Orders",
      domain: "RESTAURANT",
      route: "/analytics/restaurant",
    });
  }
  if (data.getHotelSummary) {
    sources.push({
      label: "Hotel → Reservations",
      domain: "HOTEL",
      route: "/analytics/hotel",
    });
  }
  if (data.getInventorySummary) {
    sources.push({
      label: "Inventory → Stock",
      domain: "INVENTORY",
      route: "/analytics/inventory",
    });
  }

  return sources;
}

// =====================================================================
// RECOMMENDATIONS
// =====================================================================

function generateRecommendations(
  _intent: AIIntent,
  data: Record<string, any>,
): AIRecommendation[] {
  const recommendations: AIRecommendation[] = [];

  if (data.getAttentionItems && Array.isArray(data.getAttentionItems)) {
    const critical = data.getAttentionItems.filter(
      (item: any) => item.priority === "CRITICAL" || item.priority === "HIGH",
    );

    if (critical.length > 0) {
      recommendations.push({
        statement: `Review ${critical.length} high-priority attention items`,
        reasoning: `${critical.length} items require immediate action`,
        priority: "HIGH",
        action: "Open attention center",
      });
    }
  }

  if (data.getInventorySummary && !data.getInventorySummary.error) {
    const inventory = data.getInventorySummary;
    if (inventory.lowStockItems > 0) {
      recommendations.push({
        statement: `${inventory.lowStockItems} low-stock items need attention`,
        reasoning: "Low stock may impact operations",
        priority: "MEDIUM",
        action: "Review inventory",
      });
    }
  }

  return recommendations;
}

// =====================================================================
// SUGGESTED ACTIONS
// =====================================================================

function generateSuggestedActions(
  intent: AIIntent,
  data: Record<string, any>,
  context: AIContext,
): AISuggestedAction[] {
  const actions: AISuggestedAction[] = [];

  if (intent === "ATTENTION_CHECK" && data.getAttentionItems) {
    actions.push({
      id: "review-attention",
      type: "CREATE_TASK",
      category: "SAFE",
      label: "Review attention items",
      description: "Open the attention center to review all items",
      reason: "Multiple items require attention",
      requiredPermission: "analytics.dashboard.view",
    });
  }

  if (data.getInventorySummary && !data.getInventorySummary.error) {
    const inventory = data.getInventorySummary;
    if (inventory.lowStockItems > 0 && context.permissions.includes("procurement.purchase_request.create")) {
      actions.push({
        id: "create-purchase",
        type: "CREATE_PURCHASE_REQUEST",
        category: "SENSITIVE",
        label: "Create purchase request",
        description: "Prepare purchase request for low-stock items",
        reason: `${inventory.lowStockItems} items are low in stock`,
        requiredPermission: "procurement.purchase_request.create",
      });
    }
  }

  return actions;
}

// =====================================================================
// DAILY BRIEFING
// =====================================================================

/**
 * Generate AI daily briefing.
 */
export async function generateDailyBriefing(
  context: AIContext,
): Promise<AIDailyBriefing> {
  const analyticsCtx: AnalyticsContext = {
    organizationId: context.organizationId,
    propertyId: context.propertyId,
    startDate: context.dateRange.start,
    endDate: context.dateRange.end,
    currency: "INR",
  };

  const [revenue, attention] = await Promise.all([
    getRevenueSummary(analyticsCtx),
    getAttentionItems(analyticsCtx),
  ]);

  const highlights = [
    {
      category: "Revenue",
      metric: "Total",
      value: revenue.totalRevenue,
      currency: revenue.currency,
    },
    {
      category: "Restaurant",
      metric: "Revenue",
      value: revenue.restaurantRevenue,
      currency: revenue.currency,
    },
    {
      category: "Hotel",
      metric: "Revenue",
      value: revenue.roomRevenue,
      currency: revenue.currency,
    },
  ];

  const priorities: string[] = [];
  const criticalAttention = attention.filter(
    (item) => item.priority === "CRITICAL" || item.priority === "HIGH",
  );

  if (criticalAttention.length > 0) {
    priorities.push(`Review ${criticalAttention.length} high-priority items`);
  }

  return {
    date: context.dateRange.end,
    summary: `Today's business overview with ${attention.length} attention items.`,
    highlights,
    priorities,
    attentionItems: attention.slice(0, 5).map((item) => ({
      id: item.id,
      type: "OPERATIONAL_ISSUE" as const,
      title: item.title,
      description: item.description,
      priority: item.priority as any,
      finding: item.description,
      evidence: "",
      sources: [],
      createdAt: new Date().toISOString(),
    })),
    generatedAt: new Date().toISOString(),
  };
}
