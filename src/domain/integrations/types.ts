/**
 * Integrations, API Platform, Webhooks & External Connectors (Prompt #20).
 *
 * The integration layer protects the core application from vendor-specific complexity.
 * External systems never directly mutate the core database. All integrations flow through
 * adapter patterns with validation, authorization, idempotency, and audit.
 *
 * Architecture:
 *   Internal: Domain Services → Integration Layer → External Systems
 *   External: Webhook/API → Integration Layer → Validation → Auth → Domain Services → Audit
 */

import type { EntityId } from "@/domain/identity/types";

// =====================================================================
// Integration Categories & Providers
// =====================================================================

/**
 * Integration categories — broad capability groups.
 * Providers are registered against categories but never hardcoded into them.
 */
export type IntegrationCategory =
  | "PAYMENT"
  | "MESSAGING"
  | "BOOKING"
  | "FOOD_DELIVERY"
  | "ACCOUNTING"
  | "BANKING"
  | "TAX"
  | "EMAIL"
  | "SMS"
  | "WHATSAPP"
  | "POS"
  | "KITCHEN"
  | "HARDWARE"
  | "HR"
  | "IDENTITY"
  | "ANALYTICS"
  | "OTHER";

export const INTEGRATION_CATEGORIES: readonly IntegrationCategory[] = [
  "PAYMENT",
  "MESSAGING",
  "BOOKING",
  "FOOD_DELIVERY",
  "ACCOUNTING",
  "BANKING",
  "TAX",
  "EMAIL",
  "SMS",
  "WHATSAPP",
  "POS",
  "KITCHEN",
  "HARDWARE",
  "HR",
  "IDENTITY",
  "ANALYTICS",
  "OTHER",
];

/**
 * Integration providers — specific third-party systems.
 * New providers can be registered without modifying categories.
 */
export type IntegrationProvider =
  // Payment
  | "RAZORPAY"
  | "STRIPE"
  | "PAYPAL"
  // Messaging
  | "TWILIO"
  | "WHATSAPP_CLOUD"
  | "SENDGRID"
  // Booking/OTA
  | "BOOKING_COM"
  | "EXPEDIA"
  | "AIRBNB"
  // Food Delivery
  | "SWIGGY"
  | "ZOMATO"
  | "UBER_EATS"
  // Accounting
  | "TALLY"
  | "ZOHO_BOOKS"
  | "BUSY"
  | "QUICKBOOKS"
  // Identity
  | "GOOGLE"
  | "FACEBOOK"
  | "APPLE"
  // Generic
  | "GENERIC_WEBHOOK"
  | "CUSTOM_API";

/**
 * Provider capabilities — what a provider can do.
 * Adapters declare which capabilities they support.
 */
export type ProviderCapability =
  // Payment
  | "PAYMENT_CREATE"
  | "PAYMENT_VERIFY"
  | "PAYMENT_REFUND"
  | "PAYMENT_STATUS"
  // Booking
  | "BOOKING_CREATE"
  | "BOOKING_UPDATE"
  | "BOOKING_CANCEL"
  | "BOOKING_AVAILABILITY"
  | "BOOKING_RATES"
  // Orders
  | "ORDER_CREATE"
  | "ORDER_STATUS"
  | "ORDER_UPDATE"
  // Messaging
  | "MESSAGE_SEND"
  | "MESSAGE_TEMPLATE"
  | "MESSAGE_STATUS"
  // Accounting
  | "ACCOUNTING_EXPORT_CUSTOMERS"
  | "ACCOUNTING_EXPORT_SUPPLIERS"
  | "ACCOUNTING_EXPORT_INVOICES"
  | "ACCOUNTING_EXPORT_PAYMENTS"
  | "ACCOUNTING_EXPORT_EXPENSES"
  | "ACCOUNTING_SYNC_STATUS"
  // Generic
  | "WEBHOOK_OUTBOUND"
  | "WEBHOOK_INBOUND"
  | "DATA_SYNC";

// =====================================================================
// Integration
// =====================================================================

/**
 * Integration status — connection lifecycle.
 */
export type IntegrationStatus =
  | "CONNECTED"
  | "DISCONNECTED"
  | "ERROR"
  | "PAUSED"
  | "PENDING_SETUP";

export const INTEGRATION_STATUSES: readonly IntegrationStatus[] = [
  "CONNECTED",
  "DISCONNECTED",
  "ERROR",
  "PAUSED",
  "PENDING_SETUP",
];

/**
 * Integration — a connection to an external system.
 *
 * Scoped to organization, optionally to property or outlet.
 * Credentials are stored as references, never raw secrets.
 */
export type Integration = {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly propertyId?: EntityId | null;
  readonly outletId?: EntityId | null;

  readonly provider: IntegrationProvider;
  readonly category: IntegrationCategory;
  readonly name: string;
  readonly status: IntegrationStatus;

  /** Provider-specific configuration (non-sensitive). */
  readonly configuration: Record<string, unknown>;

  /** Reference to credentials stored securely (never exposed in API). */
  readonly credentialReference?: string | null;

  readonly lastSyncAt?: string | null;
  readonly lastSuccessAt?: string | null;
  readonly lastFailureAt?: string | null;

  readonly createdAt: string;
  readonly updatedAt: string;
};

// =====================================================================
// Integration Log
// =====================================================================

/**
 * Log direction — outbound (AMRUT → External) or inbound (External → AMRUT).
 */
export type IntegrationLogDirection = "OUTBOUND" | "INBOUND";

/**
 * IntegrationLog — audit trail for integration operations.
 *
 * Answers: What happened? Which integration? Which operation? Which record?
 * Did it succeed? Why did it fail?
 *
 * Does not store complete sensitive payloads by default.
 */
export type IntegrationLog = {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly integrationId: EntityId;

  readonly direction: IntegrationLogDirection;
  readonly operation: string;

  readonly entityType?: string | null;
  readonly entityId?: EntityId | null;

  readonly status: "SUCCESS" | "FAILURE" | "PENDING";

  readonly requestReference?: string | null;
  readonly responseReference?: string | null;

  readonly errorCode?: string | null;
  readonly errorMessage?: string | null;

  readonly startedAt: string;
  readonly completedAt?: string | null;
};

// =====================================================================
// Webhooks
// =====================================================================

/**
 * Webhook endpoint status.
 */
export type WebhookEndpointStatus = "ACTIVE" | "INACTIVE" | "FAILED";

/**
 * WebhookEndpoint — where AMRUT sends outbound events or receives inbound events.
 */
export type WebhookEndpoint = {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly integrationId?: EntityId | null;

  readonly name: string;
  readonly url: string;
  readonly status: WebhookEndpointStatus;

  /** Reference to webhook secret (never exposed in API). */
  readonly secretReference?: string | null;

  /** Events this endpoint subscribes to (for outbound). */
  readonly events: string[];

  readonly createdAt: string;
  readonly updatedAt: string;
};

/**
 * Webhook delivery status.
 */
export type WebhookDeliveryStatus =
  | "PENDING"
  | "SENDING"
  | "DELIVERED"
  | "FAILED"
  | "CANCELLED";

/**
 * WebhookDelivery — tracking for outbound webhook attempts.
 */
export type WebhookDelivery = {
  readonly id: EntityId;
  readonly webhookEndpointId: EntityId;
  readonly eventId: EntityId;

  readonly attempt: number;
  readonly status: WebhookDeliveryStatus;

  readonly httpStatus?: number | null;
  readonly responseTime?: number | null;
  readonly error?: string | null;

  readonly createdAt: string;
};

/**
 * Webhook event envelope — stable payload format for outbound webhooks.
 */
export type WebhookEventEnvelope<T = unknown> = {
  readonly id: EntityId;
  readonly event: string;
  readonly occurredAt: string;
  readonly organizationId: EntityId;
  readonly propertyId?: EntityId | null;
  readonly outletId?: EntityId | null;
  readonly data: T;
};

// =====================================================================
// External References
// =====================================================================

/**
 * ExternalReference — maps internal entities to external entities.
 *
 * Example: AMRUT Reservation ↔ Booking.com Reservation ID
 */
export type ExternalReference = {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly integrationId: EntityId;

  readonly entityType: string;
  readonly entityId: EntityId;

  readonly externalEntityType: string;
  readonly externalEntityId: string;

  readonly createdAt: string;
  readonly updatedAt: string;
};

// =====================================================================
// Sync
// =====================================================================

/**
 * Sync status — synchronization state for integrations.
 */
export type SyncStatus =
  | "NOT_SYNCED"
  | "SYNCING"
  | "SYNCED"
  | "FAILED"
  | "CONFLICT";

/**
 * Sync direction — data flow direction.
 */
export type SyncDirection = "INBOUND" | "OUTBOUND" | "BIDIRECTIONAL";

// =====================================================================
// API Keys
// =====================================================================

/**
 * API key status.
 */
export type ApiKeyStatus = "ACTIVE" | "REVOKED" | "EXPIRED";

/**
 * ApiKey — organization-level API access credentials.
 *
 * Never stores raw API key. Shows full key only once at creation.
 */
export type ApiKey = {
  readonly id: EntityId;
  readonly organizationId: EntityId;

  readonly name: string;
  readonly keyPrefix: string;
  readonly hashedKey: string;

  /** Scoped permissions (e.g., "orders.read", "reservations.write"). */
  readonly permissions: string[];

  readonly status: ApiKeyStatus;

  readonly lastUsedAt?: string | null;
  readonly expiresAt?: string | null;

  readonly createdAt: string;
  readonly updatedAt: string;
};

// =====================================================================
// Provider Registry
// =====================================================================

/**
 * ProviderInfo — metadata about a registered provider.
 */
export type ProviderInfo = {
  readonly provider: IntegrationProvider;
  readonly name: string;
  readonly description: string;
  readonly category: IntegrationCategory;
  readonly capabilities: ProviderCapability[];
  readonly documentationUrl?: string;
};
