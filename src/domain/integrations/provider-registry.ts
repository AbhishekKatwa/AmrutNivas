/**
 * Provider registry and adapter pattern (Prompt #20 §8-10, §47-52).
 *
 * Centralized provider registry with capability declarations.
 * Adapter pattern abstracts vendor-specific implementations behind canonical interfaces.
 *
 * Architecture:
 *   Provider Registry → declares capabilities
 *   Adapter Interface → canonical operations
 *   Vendor Adapters → implement specific providers
 *
 * Domain modules call adapters, never providers directly.
 */

import type {
  IntegrationProvider,
  IntegrationCategory,
  ProviderCapability,
  ProviderInfo,
} from "./types";

// =====================================================================
// Adapter Interfaces
// =====================================================================

/**
 * PaymentAdapter — canonical payment operations.
 * Vendor-specific implementations: RazorpayAdapter, StripeAdapter, etc.
 */
export interface PaymentAdapter {
  createPayment(params: {
    amount: number;
    currency: string;
    referenceId: string;
    metadata?: Record<string, unknown>;
  }): Promise<{
    paymentId: string;
    status: "PENDING" | "SUCCESS" | "FAILED";
    redirectUrl?: string;
  }>;

  verifyPayment(paymentId: string): Promise<{
    verified: boolean;
    status: "PENDING" | "SUCCESS" | "FAILED";
    amount?: number;
  }>;

  refundPayment(params: {
    paymentId: string;
    amount?: number;
    reason?: string;
  }): Promise<{
    refundId: string;
    status: "PENDING" | "SUCCESS" | "FAILED";
  }>;

  getPaymentStatus(paymentId: string): Promise<{
    status: "PENDING" | "SUCCESS" | "FAILED";
    amount?: number;
  }>;
}

/**
 * MessagingAdapter — canonical messaging operations.
 * Vendor-specific implementations: TwilioAdapter, WhatsAppCloudAdapter, etc.
 */
export interface MessagingAdapter {
  sendMessage(params: {
    to: string;
    content: string;
    templateId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{
    messageId: string;
    status: "SENT" | "FAILED";
  }>;

  sendTemplate(params: {
    to: string;
    templateId: string;
    variables?: Record<string, string>;
  }): Promise<{
    messageId: string;
    status: "SENT" | "FAILED";
  }>;

  getDeliveryStatus(messageId: string): Promise<{
    status: "SENT" | "DELIVERED" | "FAILED" | "READ";
  }>;
}

/**
 * BookingChannelAdapter — canonical OTA/booking channel operations.
 * Vendor-specific implementations: BookingComAdapter, ExpediaAdapter, etc.
 */
export interface BookingChannelAdapter {
  getAvailability(params: {
    checkIn: string;
    checkOut: string;
    roomTypeId?: string;
  }): Promise<{
    available: boolean;
    rooms?: number;
    rate?: number;
  }>;

  getRates(params: {
    checkIn: string;
    checkOut: string;
    roomTypeId: string;
  }): Promise<{
    rate: number;
    currency: string;
    breakdown?: Array<{ date: string; rate: number }>;
  }>;

  createReservation(params: {
    guestName: string;
    guestEmail: string;
    guestPhone?: string;
    checkIn: string;
    checkOut: string;
    roomTypeId: string;
    guests: number;
  }): Promise<{
    reservationId: string;
    status: "CONFIRMED" | "PENDING" | "FAILED";
    externalReference?: string;
  }>;

  updateReservation(params: {
    reservationId: string;
    updates: Record<string, unknown>;
  }): Promise<{
    success: boolean;
    status?: string;
  }>;

  cancelReservation(params: {
    reservationId: string;
    reason?: string;
  }): Promise<{
    success: boolean;
    cancellationPolicy?: string;
  }>;
}

/**
 * FoodDeliveryAdapter — canonical food delivery platform operations.
 * Vendor-specific implementations: SwiggyAdapter, ZomatoAdapter, etc.
 */
export interface FoodDeliveryAdapter {
  syncMenu(params: {
    items: Array<{
      id: string;
      name: string;
      price: number;
      category?: string;
      available: boolean;
    }>;
  }): Promise<{
    success: boolean;
    syncedCount: number;
  }>;

  syncAvailability(params: {
    available: boolean;
    reason?: string;
  }): Promise<{
    success: boolean;
  }>;

  receiveOrder(params: {
    externalOrderId: string;
    items: Array<{
      id: string;
      name: string;
      quantity: number;
      price: number;
    }>;
    total: number;
    customerName: string;
    customerPhone: string;
    deliveryAddress: string;
  }): Promise<{
    internalOrderId: string;
    status: "RECEIVED" | "REJECTED";
  }>;

  updateOrderStatus(params: {
    orderId: string;
    status: "ACCEPTED" | "PREPARING" | "READY" | "OUT_FOR_DELIVERY" | "COMPLETED" | "CANCELLED";
  }): Promise<{
    success: boolean;
  }>;
}

/**
 * AccountingAdapter — canonical accounting export operations.
 * Vendor-specific implementations: TallyAdapter, ZohoBooksAdapter, etc.
 */
export interface AccountingAdapter {
  exportCustomers(params: {
    customers: Array<{
      id: string;
      name: string;
      email?: string;
      phone?: string;
      address?: string;
    }>;
  }): Promise<{
    success: boolean;
    exportedCount: number;
  }>;

  exportSuppliers(params: {
    suppliers: Array<{
      id: string;
      name: string;
      email?: string;
      phone?: string;
      address?: string;
    }>;
  }): Promise<{
    success: boolean;
    exportedCount: number;
  }>;

  exportInvoices(params: {
    invoices: Array<{
      id: string;
      number: string;
      customerId: string;
      amount: number;
      currency: string;
      date: string;
      dueDate?: string;
      items: Array<{
        description: string;
        quantity: number;
        rate: number;
        amount: number;
      }>;
    }>;
  }): Promise<{
    success: boolean;
    exportedCount: number;
  }>;

  exportPayments(params: {
    payments: Array<{
      id: string;
      invoiceId: string;
      amount: number;
      currency: string;
      date: string;
      method: string;
    }>;
  }): Promise<{
    success: boolean;
    exportedCount: number;
  }>;

  getSyncStatus(): Promise<{
    lastSyncAt?: string;
    status: "SYNCED" | "SYNCING" | "FAILED" | "NOT_SYNCED";
    pendingCount: number;
  }>;
}

/**
 * Test connection result.
 */
export type TestConnectionResult = {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
};

/**
 * BaseAdapter — common operations all adapters support.
 */
export interface BaseAdapter {
  testConnection(): Promise<TestConnectionResult>;
}

// =====================================================================
// Provider Registry
// =====================================================================

/**
 * Provider registry — centralized provider metadata and capabilities.
 */
class ProviderRegistry {
  private providers = new Map<IntegrationProvider, ProviderInfo>();

  /**
   * Register a provider with its metadata and capabilities.
   */
  register(info: ProviderInfo): void {
    this.providers.set(info.provider, info);
  }

  /**
   * Get provider info.
   */
  get(provider: IntegrationProvider): ProviderInfo | undefined {
    return this.providers.get(provider);
  }

  /**
   * Check if a provider is registered.
   */
  has(provider: IntegrationProvider): boolean {
    return this.providers.has(provider);
  }

  /**
   * Get all providers in a category.
   */
  getByCategory(category: IntegrationCategory): ProviderInfo[] {
    return Array.from(this.providers.values()).filter(
      (p) => p.category === category
    );
  }

  /**
   * Get all registered providers.
   */
  getAll(): ProviderInfo[] {
    return Array.from(this.providers.values());
  }

  /**
   * Check if a provider has a specific capability.
   */
  hasCapability(
    provider: IntegrationProvider,
    capability: ProviderCapability
  ): boolean {
    const info = this.providers.get(provider);
    return info ? info.capabilities.includes(capability) : false;
  }
}

/**
 * Global provider registry instance.
 */
export const providerRegistry = new ProviderRegistry();

// =====================================================================
// Register Built-in Providers
// =====================================================================

// Payment providers
providerRegistry.register({
  provider: "RAZORPAY",
  name: "Razorpay",
  description: "Indian payment gateway for cards, UPI, netbanking, and wallets",
  category: "PAYMENT",
  capabilities: [
    "PAYMENT_CREATE",
    "PAYMENT_VERIFY",
    "PAYMENT_REFUND",
    "PAYMENT_STATUS",
  ],
});

providerRegistry.register({
  provider: "STRIPE",
  name: "Stripe",
  description: "Global payment platform for cards and digital wallets",
  category: "PAYMENT",
  capabilities: [
    "PAYMENT_CREATE",
    "PAYMENT_VERIFY",
    "PAYMENT_REFUND",
    "PAYMENT_STATUS",
  ],
});

// Messaging providers
providerRegistry.register({
  provider: "TWILIO",
  name: "Twilio",
  description: "SMS and voice communication platform",
  category: "SMS",
  capabilities: ["MESSAGE_SEND", "MESSAGE_STATUS"],
});

providerRegistry.register({
  provider: "WHATSAPP_CLOUD",
  name: "WhatsApp Business Cloud API",
  description: "Official WhatsApp Business messaging platform",
  category: "WHATSAPP",
  capabilities: ["MESSAGE_SEND", "MESSAGE_TEMPLATE", "MESSAGE_STATUS"],
});

providerRegistry.register({
  provider: "SENDGRID",
  name: "SendGrid",
  description: "Email delivery and marketing platform",
  category: "EMAIL",
  capabilities: ["MESSAGE_SEND", "MESSAGE_TEMPLATE"],
});

// Booking/OTA providers
providerRegistry.register({
  provider: "BOOKING_COM",
  name: "Booking.com",
  description: "Online travel agency for hotel reservations",
  category: "BOOKING",
  capabilities: [
    "BOOKING_CREATE",
    "BOOKING_UPDATE",
    "BOOKING_CANCEL",
    "BOOKING_AVAILABILITY",
    "BOOKING_RATES",
  ],
});

providerRegistry.register({
  provider: "EXPEDIA",
  name: "Expedia",
  description: "Online travel agency for hotel and flight reservations",
  category: "BOOKING",
  capabilities: [
    "BOOKING_CREATE",
    "BOOKING_UPDATE",
    "BOOKING_CANCEL",
    "BOOKING_AVAILABILITY",
    "BOOKING_RATES",
  ],
});

// Food delivery providers
providerRegistry.register({
  provider: "SWIGGY",
  name: "Swiggy",
  description: "Indian food delivery platform",
  category: "FOOD_DELIVERY",
  capabilities: [
    "ORDER_CREATE",
    "ORDER_STATUS",
    "ORDER_UPDATE",
    "WEBHOOK_INBOUND",
  ],
});

providerRegistry.register({
  provider: "ZOMATO",
  name: "Zomato",
  description: "Indian food delivery and restaurant discovery platform",
  category: "FOOD_DELIVERY",
  capabilities: [
    "ORDER_CREATE",
    "ORDER_STATUS",
    "ORDER_UPDATE",
    "WEBHOOK_INBOUND",
  ],
});

// Accounting providers
providerRegistry.register({
  provider: "TALLY",
  name: "Tally",
  description: "Accounting and ERP software popular in India",
  category: "ACCOUNTING",
  capabilities: [
    "ACCOUNTING_EXPORT_CUSTOMERS",
    "ACCOUNTING_EXPORT_SUPPLIERS",
    "ACCOUNTING_EXPORT_INVOICES",
    "ACCOUNTING_EXPORT_PAYMENTS",
    "ACCOUNTING_SYNC_STATUS",
  ],
});

providerRegistry.register({
  provider: "ZOHO_BOOKS",
  name: "Zoho Books",
  description: "Cloud accounting software",
  category: "ACCOUNTING",
  capabilities: [
    "ACCOUNTING_EXPORT_CUSTOMERS",
    "ACCOUNTING_EXPORT_SUPPLIERS",
    "ACCOUNTING_EXPORT_INVOICES",
    "ACCOUNTING_EXPORT_PAYMENTS",
    "ACCOUNTING_EXPORT_EXPENSES",
    "ACCOUNTING_SYNC_STATUS",
  ],
});

// Generic
providerRegistry.register({
  provider: "GENERIC_WEBHOOK",
  name: "Generic Webhook",
  description: "Custom webhook integration for external systems",
  category: "OTHER",
  capabilities: ["WEBHOOK_OUTBOUND", "WEBHOOK_INBOUND"],
});
