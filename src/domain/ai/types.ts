/**
 * AI domain types.
 *
 * Defines the AI intelligence layer's data structures for queries, responses,
 * insights, recommendations, actions, and audit trail.
 */

import type { EntityId } from "@/domain/identity/types";

// =====================================================================
// AI CONTEXT
// =====================================================================

/**
 * Scoped context for AI queries.
 * Inherits user permissions and data scope.
 */
export interface AIContext {
  organizationId: EntityId;
  propertyId?: EntityId;
  outletId?: EntityId;
  userId: EntityId;
  permissions: string[];
  dateRange: {
    start: string;
    end: string;
  };
  scope: "ALL_PROPERTIES" | "PROPERTY" | "OUTLET" | "DEPARTMENT";
}

// =====================================================================
// AI QUERY
// =====================================================================

export type AIIntent =
  | "REVENUE_ANALYSIS"
  | "PROFIT_ANALYSIS"
  | "OCCUPANCY_ANALYSIS"
  | "INVENTORY_ANALYSIS"
  | "SUPPLIER_ANALYSIS"
  | "CUSTOMER_ANALYSIS"
  | "EVENT_ANALYSIS"
  | "HR_ANALYSIS"
  | "ATTENTION_CHECK"
  | "SUMMARY_REQUEST"
  | "COMPARISON_REQUEST"
  | "SCENARIO_REQUEST"
  | "ACTION_REQUEST"
  | "GENERAL_QUERY";

export type AIDomain =
  | "RESTAURANT"
  | "HOTEL"
  | "INVENTORY"
  | "PROCUREMENT"
  | "FINANCE"
  | "CRM"
  | "EVENTS"
  | "HR"
  | "COMMERCE"
  | "ENTERPRISE"
  | "SUBSCRIPTION"
  | "OPERATIONS";

export interface AIQuery {
  id: string;
  question: string;
  intent?: AIIntent;
  domain?: AIDomain;
  context: AIContext;
  conversationId?: string;
}

// =====================================================================
// AI RESPONSE
// =====================================================================

export interface AISourceReference {
  label: string;
  domain: string;
  route?: string;
  metric?: string;
  value?: number;
  currency?: string;
}

export interface AIFinding {
  statement: string;
  evidence: string;
  source: AISourceReference;
}

export interface AIRecommendation {
  statement: string;
  reasoning: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  action?: string;
}

export interface AIResponse {
  queryId: string;
  answer: string;
  findings: AIFinding[];
  recommendations: AIRecommendation[];
  sources: AISourceReference[];
  suggestedActions: AISuggestedAction[];
  confidence: "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT_DATA";
  dataFreshness: "LIVE" | "PARTIAL" | "STALE";
  timestamp: string;
}

// =====================================================================
// AI INSIGHT
// =====================================================================

export type AIInsightType =
  | "REVENUE_CHANGE"
  | "PROFIT_ALERT"
  | "INVENTORY_RISK"
  | "CUSTOMER_OPPORTUNITY"
  | "EVENT_FOLLOWUP"
  | "FINANCE_ALERT"
  | "OPERATIONAL_ISSUE"
  | "ANOMALY";

export interface AIInsight {
  id: string;
  type: AIInsightType;
  title: string;
  description: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  finding: string;
  evidence: string;
  impact?: string;
  recommendation?: string;
  sources: AISourceReference[];
  createdAt: string;
}

// =====================================================================
// AI ACTIONS
// =====================================================================

export type AIActionType =
  | "CREATE_TASK"
  | "CREATE_PURCHASE_REQUEST"
  | "CREATE_FOLLOWUP"
  | "SEND_NOTIFICATION"
  | "PREPARE_REPORT"
  | "DRAFT_MESSAGE";

export type AIActionCategory = "SAFE" | "SENSITIVE" | "FORBIDDEN";

export interface AISuggestedAction {
  id: string;
  type: AIActionType;
  category: AIActionCategory;
  label: string;
  description: string;
  reason: string;
  targetType?: string;
  targetId?: EntityId;
  estimatedValue?: number;
  currency?: string;
  requiredPermission: string;
}

export interface AIActionPreview {
  action: AISuggestedAction;
  affectedRecords: number;
  expectedOutcome: string;
  property?: string;
  userPermission: string;
}

export type AIActionStatus = "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "EXECUTED" | "FAILED";

export interface AIAction {
  id: string;
  interactionId: string;
  actionType: AIActionType;
  targetType?: string;
  targetId?: EntityId;
  status: AIActionStatus;
  requestedBy: EntityId;
  approvedBy?: EntityId;
  approvedAt?: string;
  executedAt?: string;
  result?: string;
  createdAt: string;
}

// =====================================================================
// AI CONVERSATION
// =====================================================================

export interface AIConversation {
  id: string;
  organizationId: EntityId;
  userId: EntityId;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export type AIMessageRole = "USER" | "ASSISTANT" | "TOOL" | "SYSTEM";

export interface AIMessage {
  id: string;
  conversationId: string;
  role: AIMessageRole;
  content: string;
  queryId?: string;
  responseId?: string;
  createdAt: string;
}

// =====================================================================
// AI AUDIT
// =====================================================================

export interface AIInteraction {
  id: string;
  organizationId: EntityId;
  userId: EntityId;
  propertyId?: EntityId;
  conversationId?: string;
  intent?: AIIntent;
  domain?: AIDomain;
  question: string;
  responseSummary: string;
  toolsUsed: string[];
  sourceReferences: AISourceReference[];
  createdAt: string;
}

// =====================================================================
// ANOMALY DETECTION
// =====================================================================

export type AIAnomalyType =
  | "REVENUE_DROP"
  | "COST_INCREASE"
  | "WASTAGE_SPIKE"
  | "PRICE_INCREASE"
  | "CANCELLATION_SPIKE"
  | "OCCUPANCY_DROP"
  | "DISCOUNT_INCREASE";

export interface AIAnomaly {
  id: string;
  type: AIAnomalyType;
  metric: string;
  currentValue: number;
  previousValue: number;
  changePercent: number;
  threshold: number;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  description: string;
  contributors: Array<{
    label: string;
    value: number;
    change: number;
  }>;
  sources: AISourceReference[];
  detectedAt: string;
}

// =====================================================================
// AI DAILY BRIEFING
// =====================================================================

export interface AIDailyBriefing {
  date: string;
  summary: string;
  highlights: Array<{
    category: string;
    metric: string;
    value: number;
    change?: number;
    currency?: string;
  }>;
  priorities: string[];
  attentionItems: AIInsight[];
  generatedAt: string;
}

// =====================================================================
// AI SCENARIO
// =====================================================================

export interface AIScenario {
  id: string;
  question: string;
  assumption: string;
  projectedImpact: {
    metric: string;
    currentValue: number;
    projectedValue: number;
    change: number;
    currency?: string;
  };
  disclaimer: string;
  sources: AISourceReference[];
}

// =====================================================================
// AI TOOL DEFINITION
// =====================================================================

export interface AIToolDefinition {
  name: string;
  description: string;
  requiredPermission: string;
  readOnly: boolean;
  allowedDomains: AIDomain[];
  handler: (context: AIContext, params?: Record<string, any>) => Promise<any>;
}
