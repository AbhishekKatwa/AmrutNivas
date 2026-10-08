/**
 * Domain types for SaaS subscription billing.
 *
 * This is the platform's own billing system — organizations paying AMRUT NIVAAS
 * for the service. It is deliberately separate from the hospitality finance layer
 * (folios, bills, payments) which tracks the customer's business transactions.
 *
 * The SQL schema lives in `db/supabase/046_saas_billing.sql`. These types mirror
 * that schema; the service layer (`./billing-service.ts`) is the only code that
 * touches the tables directly.
 */

import type { EntityId } from "@/domain/identity/types";

// ============================================================================
// STATUS & ENUM TYPES
// ============================================================================

export type PlanStatus = "ACTIVE" | "ARCHIVED";

export type SubscriptionStatus =
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELLED"
  | "EXPIRED";

export type InvoiceStatus = "DRAFT" | "OPEN" | "PAID" | "VOID" | "OVERDUE";

export type PaymentStatus = "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED";

export type BillingInterval = "MONTHLY" | "QUARTERLY" | "ANNUAL";

export type Currency = "INR" | "USD";

// ============================================================================
// FEATURE & METRIC ENUMS
// ============================================================================

/** Features a plan can enable/disable. Mirrors the CHECK constraint in plan_features. */
export type BillingFeature =
  | "RESTAURANT_POS"
  | "HOTEL_PMS"
  | "INVENTORY"
  | "PROCUREMENT"
  | "CRM"
  | "EVENTS"
  | "HR"
  | "COMMERCE"
  | "ENTERPRISE"
  | "API_ACCESS"
  | "CUSTOM_BRANDING"
  | "ADVANCED_REPORTING"
  | "MULTI_PROPERTY"
  | "PRIORITY_SUPPORT";

/** Metrics that can be metered and limited. Mirrors plan_limits. */
export type BillingMetric =
  | "PROPERTIES"
  | "OUTLETS"
  | "USERS"
  | "ORDERS_PER_MONTH"
  | "STORAGE_GB"
  | "API_CALLS_PER_DAY";

// ============================================================================
// PLAN TYPES
// ============================================================================

export interface SubscriptionPlan {
  id: EntityId;
  code: string;
  name: string;
  description: string | null;
  status: PlanStatus;
  billingInterval: BillingInterval;
  basePrice: string; // numeric(14,2) as string
  currency: Currency;
  trialDays: number;
  maxProperties: number | null; // null = unlimited
  maxOutlets: number | null;
  maxUsers: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlanFeature {
  id: EntityId;
  planId: EntityId;
  feature: BillingFeature;
  enabled: boolean;
  createdAt: string;
}

export interface PlanLimit {
  id: EntityId;
  planId: EntityId;
  metric: BillingMetric;
  limitValue: string; // numeric as string
  unit: string;
  isHardLimit: boolean;
  createdAt: string;
}

// ============================================================================
// SUBSCRIPTION TYPES
// ============================================================================

export interface Subscription {
  id: EntityId;
  organizationId: EntityId;
  planId: EntityId;
  status: SubscriptionStatus;
  startDate: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialStart: string | null;
  trialEnd: string | null;
  cancelAtPeriodEnd: boolean;
  cancelledAt: string | null;
  cancellationReason: string | null;
  currency: Currency;
  createdAt: string;
  updatedAt: string;
}

export type SubscriptionEventType =
  | "CREATED"
  | "ACTIVATED"
  | "TRIAL_STARTED"
  | "TRIAL_ENDED"
  | "RENEWED"
  | "UPGRADED"
  | "DOWNGRADED"
  | "CANCELLED"
  | "REACTIVATED"
  | "EXPIRED"
  | "PAYMENT_FAILED";

export interface SubscriptionEvent {
  id: EntityId;
  subscriptionId: EntityId;
  organizationId: EntityId;
  eventType: SubscriptionEventType;
  metadata: Record<string, unknown> | null;
  createdBy: EntityId | null;
  createdAt: string;
}

// ============================================================================
// BILLING ACCOUNT
// ============================================================================

export interface BillingAccount {
  id: EntityId;
  organizationId: EntityId;
  billingName: string;
  legalName: string | null;
  email: string;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string;
  taxId: string | null; // GSTIN
  currency: Currency;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// INVOICE TYPES
// ============================================================================

export interface SaaSInvoice {
  id: EntityId;
  organizationId: EntityId;
  billingAccountId: EntityId;
  subscriptionId: EntityId;
  invoiceNumber: string;
  invoiceDate: string;
  periodStart: string;
  periodEnd: string;
  currency: Currency;
  subtotal: string; // numeric(14,2)
  discount: string;
  tax: string;
  total: string;
  status: InvoiceStatus;
  dueDate: string;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SaaSInvoiceLine {
  id: EntityId;
  invoiceId: EntityId;
  description: string;
  quantity: string; // numeric
  unitPrice: string; // numeric(14,2)
  discount: string;
  taxRate: string; // numeric(5,2)
  amount: string; // numeric(14,2)
  referenceType: string | null; // 'PLAN', 'USAGE', 'ADJUSTMENT'
  referenceId: EntityId | null;
  createdAt: string;
}

// ============================================================================
// PAYMENT TYPES
// ============================================================================

export interface SaaSPayment {
  id: EntityId;
  organizationId: EntityId;
  invoiceId: EntityId;
  subscriptionId: EntityId;
  amount: string; // numeric(14,2)
  currency: Currency;
  method: string; // 'CARD', 'UPI', 'BANK_TRANSFER', 'CASH', etc.
  status: PaymentStatus;
  transactionReference: string | null;
  paidAt: string | null;
  createdAt: string;
}

// ============================================================================
// USAGE TYPES
// ============================================================================

export interface UsageSnapshot {
  id: EntityId;
  organizationId: EntityId;
  metric: BillingMetric;
  periodStart: string;
  periodEnd: string;
  quantity: string; // numeric
  calculatedAt: string;
}

// ============================================================================
// BILLING SETTINGS (singleton per org)
// ============================================================================

export interface SaaSBillingSettings {
  id: EntityId;
  organizationId: EntityId;
  defaultBillingInterval: BillingInterval;
  defaultTrialDays: number;
  gracePeriodDays: number;
  invoiceDueDays: number;
  invoiceNumberPrefix: string;
  invoiceNumberSeed: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// COMPOSITE / VIEW TYPES
// ============================================================================

/** A plan with its features and limits eagerly loaded. */
export interface PlanWithDetails extends SubscriptionPlan {
  features: PlanFeature[];
  limits: PlanLimit[];
}

/** A subscription with its plan eagerly loaded. */
export interface SubscriptionWithPlan extends Subscription {
  plan: SubscriptionPlan;
}

/** An invoice with its lines eagerly loaded. */
export interface InvoiceWithLines extends SaaSInvoice {
  lines: SaaSInvoiceLine[];
}

/** Current usage vs limits for an organization. */
export interface UsageSummary {
  metric: BillingMetric;
  current: number;
  limit: number | null; // null = unlimited
  unit: string;
  isHardLimit: boolean;
  percentageUsed: number | null; // null if no limit
}
