/**
 * SaaS billing service layer (Prompt #16).
 *
 * Reads and writes for subscription plans, subscriptions, billing accounts,
 * invoices, payments and usage. All writes go through 046 doors; reads use
 * RLS-scoped Supabase queries.
 *
 * This is the platform's own billing system — organizations paying AMRUT NIVAAS
 * for the service. It is deliberately separate from the hospitality finance layer
 * (folios, bills, payments) which tracks the customer's business transactions.
 */

import { requireSupabase } from "@/db/client";
import { asRead, callDoor, callDoorRow, camelRows, firstCamelRow } from "@/db/rpc";
import type { EntityId } from "@/domain/identity/types";
import type {
  BillingAccount,
  PlanFeature,
  PlanLimit,
  PlanWithDetails,
  SaaSInvoice,
  SaaSInvoiceLine,
  SaaSPayment,
  Subscription,
  SubscriptionEvent,
  SubscriptionPlan,
  SubscriptionWithPlan,
  UsageSnapshot,
} from "@/domain/billing/types";

export type {
  BillingAccount,
  PlanFeature,
  PlanLimit,
  PlanWithDetails,
  SaaSInvoice,
  SaaSInvoiceLine,
  SaaSPayment,
  Subscription,
  SubscriptionEvent,
  SubscriptionPlan,
  SubscriptionWithPlan,
  UsageSnapshot,
} from "@/domain/billing/types";

const PLANS_TABLE = "subscription_plans";
const PLAN_FEATURES_TABLE = "plan_features";
const PLAN_LIMITS_TABLE = "plan_limits";
const SUBSCRIPTIONS_TABLE = "subscriptions";
const SUBSCRIPTION_EVENTS_TABLE = "subscription_events";
const BILLING_ACCOUNTS_TABLE = "billing_accounts";
const INVOICES_TABLE = "saas_invoices";
const INVOICE_LINES_TABLE = "saas_invoice_lines";
const PAYMENTS_TABLE = "saas_payments";
const USAGE_TABLE = "usage_snapshots";

const PLAN_COLUMNS =
  "id, code, name, description, status, billing_interval, base_price, currency, trial_days, max_properties, max_outlets, max_users, created_at, updated_at";
const PLAN_FEATURE_COLUMNS = "id, plan_id, feature, enabled, created_at";
const PLAN_LIMIT_COLUMNS = "id, plan_id, metric, limit_value, unit, is_hard_limit, created_at";
const SUBSCRIPTION_COLUMNS =
  "id, organization_id, plan_id, status, start_date, current_period_start, current_period_end, trial_start, trial_end, cancel_at_period_end, cancelled_at, cancellation_reason, currency, created_at, updated_at";
const SUBSCRIPTION_EVENT_COLUMNS =
  "id, subscription_id, organization_id, event_type, metadata, created_by, created_at";
const BILLING_ACCOUNT_COLUMNS =
  "id, organization_id, billing_name, legal_name, email, phone, address_line1, address_line2, city, state, postal_code, country, tax_id, currency, created_at, updated_at";
const INVOICE_COLUMNS =
  "id, organization_id, billing_account_id, subscription_id, invoice_number, invoice_date, period_start, period_end, currency, subtotal, discount, tax, total, status, due_date, paid_at, notes, created_at, updated_at";
const INVOICE_LINE_COLUMNS =
  "id, invoice_id, description, quantity, unit_price, discount, tax_rate, amount, reference_type, reference_id, created_at";
const PAYMENT_COLUMNS =
  "id, organization_id, invoice_id, subscription_id, amount, currency, method, status, transaction_reference, paid_at, created_at";
const USAGE_COLUMNS = "id, organization_id, metric, period_start, period_end, quantity, calculated_at";

// =====================================================================
// PLANS
// =====================================================================

/** List all active subscription plans. */
export async function listPlans(): Promise<SubscriptionPlan[]> {
  const chain = requireSupabase()
    .from(PLANS_TABLE)
    .select(PLAN_COLUMNS)
    .eq("status", "ACTIVE")
    .order("base_price", { ascending: true });
  return camelRows<SubscriptionPlan>(asRead(chain));
}

/** Get a single plan by ID. */
export async function getPlan(id: EntityId): Promise<SubscriptionPlan | null> {
  const chain = requireSupabase()
    .from(PLANS_TABLE)
    .select(PLAN_COLUMNS)
    .eq("id", id)
    .limit(1);
  return firstCamelRow<SubscriptionPlan>(asRead(chain));
}

/** Get a plan with its features and limits. */
export async function getPlanWithDetails(id: EntityId): Promise<PlanWithDetails | null> {
  const plan = await getPlan(id);
  if (!plan) return null;

  const [features, limits] = await Promise.all([
    listPlanFeatures(id),
    listPlanLimits(id),
  ]);

  return { ...plan, features, limits };
}

/** List features for a plan. */
export async function listPlanFeatures(planId: EntityId): Promise<PlanFeature[]> {
  const chain = requireSupabase()
    .from(PLAN_FEATURES_TABLE)
    .select(PLAN_FEATURE_COLUMNS)
    .eq("plan_id", planId)
    .order("feature");
  return camelRows<PlanFeature>(asRead(chain));
}

/** List limits for a plan. */
export async function listPlanLimits(planId: EntityId): Promise<PlanLimit[]> {
  const chain = requireSupabase()
    .from(PLAN_LIMITS_TABLE)
    .select(PLAN_LIMIT_COLUMNS)
    .eq("plan_id", planId)
    .order("metric");
  return camelRows<PlanLimit>(asRead(chain));
}

// =====================================================================
// SUBSCRIPTIONS
// =====================================================================

/** Get the current subscription for an organization. */
export async function getCurrentSubscription(
  organizationId: EntityId,
): Promise<SubscriptionWithPlan | null> {
  const chain = requireSupabase()
    .from(SUBSCRIPTIONS_TABLE)
    .select(`${SUBSCRIPTION_COLUMNS}, plan:plan_id(${PLAN_COLUMNS})`)
    .eq("organization_id", organizationId)
    .in("status", ["TRIALING", "ACTIVE", "PAST_DUE"])
    .limit(1);

  const result = await chain;
  if (result.error) throw result.error;
  const row = result.data?.[0];
  if (!row) return null;

  const { plan, ...rest } = row;
  return {
    ...(rest as unknown as Subscription),
    plan: plan as unknown as SubscriptionPlan,
  };
}

/** List subscription events for an organization. */
export async function listSubscriptionEvents(
  organizationId: EntityId,
  limit = 50,
): Promise<SubscriptionEvent[]> {
  const chain = requireSupabase()
    .from(SUBSCRIPTION_EVENTS_TABLE)
    .select(SUBSCRIPTION_EVENT_COLUMNS)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return camelRows<SubscriptionEvent>(asRead(chain));
}

/** Create or update a subscription. */
export async function upsertSubscription(input: {
  organizationId: EntityId;
  planId: EntityId;
  status?: string;
  startDate?: string;
  trialDays?: number;
}): Promise<Subscription> {
  return callDoorRow<Subscription>("upsert_subscription", {
    organization: input.organizationId,
    plan: input.planId,
    status: input.status ?? "TRIALING",
    startDate: input.startDate ?? new Date().toISOString().split("T")[0],
    trialDays: input.trialDays ?? 0,
  });
}

/** Cancel a subscription. */
export async function cancelSubscription(input: {
  subscriptionId: EntityId;
  cancelAtPeriodEnd?: boolean;
  reason?: string | null;
}): Promise<void> {
  await callDoor("cancel_subscription", {
    subscription: input.subscriptionId,
    cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? true,
    reason: input.reason ?? null,
  });
}

// =====================================================================
// BILLING ACCOUNTS
// =====================================================================

/** Get the billing account for an organization. */
export async function getBillingAccount(
  organizationId: EntityId,
): Promise<BillingAccount | null> {
  const chain = requireSupabase()
    .from(BILLING_ACCOUNTS_TABLE)
    .select(BILLING_ACCOUNT_COLUMNS)
    .eq("organization_id", organizationId)
    .limit(1);
  return firstCamelRow<BillingAccount>(asRead(chain));
}

/** Create or update a billing account. */
export async function upsertBillingAccount(input: {
  organizationId: EntityId;
  billingName: string;
  email: string;
  legalName?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string;
  postalCode?: string | null;
  taxId?: string | null;
}): Promise<BillingAccount> {
  return callDoorRow<BillingAccount>("upsert_billing_account", {
    organization: input.organizationId,
    billingName: input.billingName,
    email: input.email,
    legalName: input.legalName ?? null,
    phone: input.phone ?? null,
    addressLine1: input.addressLine1 ?? null,
    addressLine2: input.addressLine2 ?? null,
    city: input.city ?? null,
    state: input.state ?? null,
    country: input.country ?? "India",
    postalCode: input.postalCode ?? null,
    taxId: input.taxId ?? null,
  });
}

// =====================================================================
// INVOICES
// =====================================================================

/** List invoices for an organization. */
export async function listInvoices(
  organizationId: EntityId,
  limit = 50,
): Promise<SaaSInvoice[]> {
  const chain = requireSupabase()
    .from(INVOICES_TABLE)
    .select(INVOICE_COLUMNS)
    .eq("organization_id", organizationId)
    .order("invoice_date", { ascending: false })
    .limit(limit);
  return camelRows<SaaSInvoice>(asRead(chain));
}

/** Get a single invoice by ID. */
export async function getInvoice(
  id: EntityId,
  organizationId: EntityId,
): Promise<SaaSInvoice | null> {
  const chain = requireSupabase()
    .from(INVOICES_TABLE)
    .select(INVOICE_COLUMNS)
    .eq("id", id)
    .eq("organization_id", organizationId)
    .limit(1);
  return firstCamelRow<SaaSInvoice>(asRead(chain));
}

/** Get an invoice with its lines. */
export async function getInvoiceWithLines(
  id: EntityId,
  organizationId: EntityId,
): Promise<(SaaSInvoice & { lines: SaaSInvoiceLine[] }) | null> {
  const invoice = await getInvoice(id, organizationId);
  if (!invoice) return null;

  const lines = await listInvoiceLines(id);
  return { ...invoice, lines };
}

/** List lines for an invoice. */
export async function listInvoiceLines(invoiceId: EntityId): Promise<SaaSInvoiceLine[]> {
  const chain = requireSupabase()
    .from(INVOICE_LINES_TABLE)
    .select(INVOICE_LINE_COLUMNS)
    .eq("invoice_id", invoiceId)
    .order("created_at");
  return camelRows<SaaSInvoiceLine>(asRead(chain));
}

/** Generate the next invoice number for an organization. */
export async function nextInvoiceNumber(organizationId: EntityId): Promise<string> {
  return callDoor<string>("next_saas_invoice_number", {
    organization: organizationId,
  });
}

/** Create a SaaS invoice. */
export async function createInvoice(input: {
  organizationId: EntityId;
  subscriptionId?: EntityId | null;
  billingAccountId?: EntityId | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  dueDate?: string | null;
}): Promise<SaaSInvoice> {
  return callDoorRow<SaaSInvoice>("create_saas_invoice", {
    organization: input.organizationId,
    subscription: input.subscriptionId ?? null,
    billingAccount: input.billingAccountId ?? null,
    periodStart: input.periodStart ?? null,
    periodEnd: input.periodEnd ?? null,
    dueDate: input.dueDate ?? null,
  });
}

// =====================================================================
// PAYMENTS
// =====================================================================

/** List payments for an organization. */
export async function listPayments(
  organizationId: EntityId,
  limit = 50,
): Promise<SaaSPayment[]> {
  const chain = requireSupabase()
    .from(PAYMENTS_TABLE)
    .select(PAYMENT_COLUMNS)
    .eq("organization_id", organizationId)
    .order("paid_at", { ascending: false })
    .limit(limit);
  return camelRows<SaaSPayment>(asRead(chain));
}

/** Record a SaaS payment. */
export async function recordPayment(input: {
  organizationId: EntityId;
  invoiceId?: EntityId | null;
  subscriptionId?: EntityId | null;
  amount: string;
  method: string;
  transactionRef?: string | null;
}): Promise<SaaSPayment> {
  return callDoorRow<SaaSPayment>("record_saas_payment", {
    organization: input.organizationId,
    invoice: input.invoiceId ?? null,
    subscription: input.subscriptionId ?? null,
    amount: input.amount,
    method: input.method,
    transactionRef: input.transactionRef ?? null,
  });
}

// =====================================================================
// USAGE
// =====================================================================

/** List usage snapshots for an organization. */
export async function listUsageSnapshots(
  organizationId: EntityId,
  limit = 100,
): Promise<UsageSnapshot[]> {
  const chain = requireSupabase()
    .from(USAGE_TABLE)
    .select(USAGE_COLUMNS)
    .eq("organization_id", organizationId)
    .order("calculated_at", { ascending: false })
    .limit(limit);
  return camelRows<UsageSnapshot>(asRead(chain));
}
