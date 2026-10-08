/**
 * AI tools layer.
 *
 * Controlled read tools that call existing analytics and domain services.
 * Each tool declares required permissions and whether it's read-only or mutating.
 * AI never receives raw database access — only these controlled tools.
 */

import type { AIContext, AIToolDefinition } from "./types";
import {
  getRevenueSummary,
  getProfitabilitySummary,
  getRestaurantSummary,
  getHotelSummary,
  getEventSummary,
  getInventorySummary,
  getFinanceSummary,
  getCrmSummary,
  getHrSummary,
  getCommerceSummary,
  getAttentionItems,
} from "@/domain/analytics/analytics-service";

// =====================================================================
// TOOL REGISTRY
// =====================================================================

const toolRegistry: Map<string, AIToolDefinition> = new Map();

/**
 * Register an AI tool.
 */
function registerTool(tool: AIToolDefinition): void {
  toolRegistry.set(tool.name, tool);
}

/**
 * Get a tool by name.
 */
export function getTool(name: string): AIToolDefinition | undefined {
  return toolRegistry.get(name);
}

/**
 * Get all available tools for a context (permission-filtered).
 */
export function getAvailableTools(context: AIContext): AIToolDefinition[] {
  return Array.from(toolRegistry.values()).filter((tool) =>
    context.permissions.includes(tool.requiredPermission),
  );
}

// =====================================================================
// REVENUE TOOLS
// =====================================================================

registerTool({
  name: "getRevenueSummary",
  description: "Get revenue summary for the context period",
  requiredPermission: "analytics.dashboard.view",
  readOnly: true,
  allowedDomains: ["FINANCE", "RESTAURANT", "HOTEL", "EVENTS"],
  handler: async (context: AIContext) => {
    const analyticsCtx = {
      organizationId: context.organizationId,
      propertyId: context.propertyId,
      startDate: context.dateRange.start,
      endDate: context.dateRange.end,
      currency: "INR",
    };
    return getRevenueSummary(analyticsCtx);
  },
});

registerTool({
  name: "getProfitabilitySummary",
  description: "Get profitability summary including gross/net profit and margins",
  requiredPermission: "analytics.finance.view",
  readOnly: true,
  allowedDomains: ["FINANCE"],
  handler: async (context: AIContext) => {
    const analyticsCtx = {
      organizationId: context.organizationId,
      propertyId: context.propertyId,
      startDate: context.dateRange.start,
      endDate: context.dateRange.end,
      currency: "INR",
    };
    return getProfitabilitySummary(analyticsCtx);
  },
});

// =====================================================================
// DOMAIN-SPECIFIC TOOLS
// =====================================================================

registerTool({
  name: "getRestaurantSummary",
  description: "Get restaurant performance metrics",
  requiredPermission: "analytics.restaurant.view",
  readOnly: true,
  allowedDomains: ["RESTAURANT"],
  handler: async (context: AIContext) => {
    const analyticsCtx = {
      organizationId: context.organizationId,
      propertyId: context.propertyId,
      outletId: context.outletId,
      startDate: context.dateRange.start,
      endDate: context.dateRange.end,
      currency: "INR",
    };
    return getRestaurantSummary(analyticsCtx);
  },
});

registerTool({
  name: "getHotelSummary",
  description: "Get hotel performance metrics including occupancy, ADR, RevPAR",
  requiredPermission: "analytics.hotel.view",
  readOnly: true,
  allowedDomains: ["HOTEL"],
  handler: async (context: AIContext) => {
    const analyticsCtx = {
      organizationId: context.organizationId,
      propertyId: context.propertyId,
      startDate: context.dateRange.start,
      endDate: context.dateRange.end,
      currency: "INR",
    };
    return getHotelSummary(analyticsCtx);
  },
});

registerTool({
  name: "getEventSummary",
  description: "Get event pipeline and revenue metrics",
  requiredPermission: "analytics.events.view",
  readOnly: true,
  allowedDomains: ["EVENTS"],
  handler: async (context: AIContext) => {
    const analyticsCtx = {
      organizationId: context.organizationId,
      propertyId: context.propertyId,
      startDate: context.dateRange.start,
      endDate: context.dateRange.end,
      currency: "INR",
    };
    return getEventSummary(analyticsCtx);
  },
});

registerTool({
  name: "getInventorySummary",
  description: "Get inventory health including stock levels and wastage",
  requiredPermission: "analytics.inventory.view",
  readOnly: true,
  allowedDomains: ["INVENTORY"],
  handler: async (context: AIContext) => {
    const analyticsCtx = {
      organizationId: context.organizationId,
      propertyId: context.propertyId,
      startDate: context.dateRange.start,
      endDate: context.dateRange.end,
      currency: "INR",
    };
    return getInventorySummary(analyticsCtx);
  },
});

registerTool({
  name: "getFinanceSummary",
  description: "Get finance position including cash, receivables, payables",
  requiredPermission: "analytics.finance.view",
  readOnly: true,
  allowedDomains: ["FINANCE"],
  handler: async (context: AIContext) => {
    const analyticsCtx = {
      organizationId: context.organizationId,
      propertyId: context.propertyId,
      startDate: context.dateRange.start,
      endDate: context.dateRange.end,
      currency: "INR",
    };
    return getFinanceSummary(analyticsCtx);
  },
});

registerTool({
  name: "getCrmSummary",
  description: "Get customer metrics including retention and spend",
  requiredPermission: "analytics.crm.view",
  readOnly: true,
  allowedDomains: ["CRM"],
  handler: async (context: AIContext) => {
    const analyticsCtx = {
      organizationId: context.organizationId,
      propertyId: context.propertyId,
      startDate: context.dateRange.start,
      endDate: context.dateRange.end,
      currency: "INR",
    };
    return getCrmSummary(analyticsCtx);
  },
});

registerTool({
  name: "getHrSummary",
  description: "Get HR metrics including attendance and workforce",
  requiredPermission: "analytics.hr.view",
  readOnly: true,
  allowedDomains: ["HR"],
  handler: async (context: AIContext) => {
    const analyticsCtx = {
      organizationId: context.organizationId,
      propertyId: context.propertyId,
      startDate: context.dateRange.start,
      endDate: context.dateRange.end,
      currency: "INR",
    };
    return getHrSummary(analyticsCtx);
  },
});

registerTool({
  name: "getCommerceSummary",
  description: "Get commerce channel metrics",
  requiredPermission: "analytics.commerce.view",
  readOnly: true,
  allowedDomains: ["COMMERCE"],
  handler: async (context: AIContext) => {
    const analyticsCtx = {
      organizationId: context.organizationId,
      propertyId: context.propertyId,
      startDate: context.dateRange.start,
      endDate: context.dateRange.end,
      currency: "INR",
    };
    return getCommerceSummary(analyticsCtx);
  },
});

// =====================================================================
// ATTENTION & INSIGHTS
// =====================================================================

registerTool({
  name: "getAttentionItems",
  description: "Get attention items requiring action",
  requiredPermission: "analytics.dashboard.view",
  readOnly: true,
  allowedDomains: ["OPERATIONS", "FINANCE", "INVENTORY", "RESTAURANT", "HOTEL", "EVENTS"],
  handler: async (context: AIContext) => {
    const analyticsCtx = {
      organizationId: context.organizationId,
      propertyId: context.propertyId,
      startDate: context.dateRange.start,
      endDate: context.dateRange.end,
      currency: "INR",
    };
    return getAttentionItems(analyticsCtx);
  },
});

// =====================================================================
// TOOL EXECUTION
// =====================================================================

/**
 * Execute a tool with permission check.
 */
export async function executeTool(
  toolName: string,
  context: AIContext,
  params?: Record<string, any>,
): Promise<any> {
  const tool = getTool(toolName);

  if (!tool) {
    throw new Error(`Tool not found: ${toolName}`);
  }

  if (!context.permissions.includes(tool.requiredPermission)) {
    throw new Error(
      `Permission denied: ${tool.requiredPermission} required for ${toolName}`,
    );
  }

  return tool.handler(context, params);
}

/**
 * Execute multiple tools in parallel.
 */
export async function executeTools(
  toolNames: string[],
  context: AIContext,
): Promise<Record<string, any>> {
  const results: Record<string, any> = {};

  await Promise.all(
    toolNames.map(async (name) => {
      try {
        results[name] = await executeTool(name, context);
      } catch (error) {
        results[name] = { error: (error as Error).message };
      }
    }),
  );

  return results;
}
