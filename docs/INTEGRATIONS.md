# Integrations, API Platform & External Connectors

**Prompt #20 Implementation**  
**Phase**: 10 — Enterprise & Platform  
**Status**: Foundation Complete (Adapter Patterns & Service Layer)

---

## Overview

AMRUT NIVAAS provides a comprehensive integration layer that connects the platform to external systems while maintaining data integrity, security, and auditability. The integration architecture follows strict adapter patterns to isolate external dependencies from core domain logic.

### Design Principles

1. **Adapter Pattern**: All external systems connect through provider-specific adapters
2. **Organization-Scoped**: Every integration belongs to an organization (multi-tenant isolation)
3. **Credential Security**: Never store raw secrets; use credential references
4. **Audit Trail**: Every integration operation is logged and audited
5. **Idempotency**: Sensitive operations support idempotency keys
6. **Rate Limiting**: Tier-based rate limiting protects the platform
7. **Webhook Foundation**: Both outbound (event dispatch) and inbound (event processing) webhooks

### Architecture Flow

```
Internal Flow:
  Domain Services → Integration Layer → Adapter → External System

External Flow:
  Webhook/API → Integration Layer → Validation → Auth → Domain Services → Audit
```

---

## Integration Categories

### 1. Payment Gateways

**Providers**: Razorpay, Stripe, PayU, CCAvenue

**Capabilities**:
- Create payment links
- Verify payment status
- Process refunds
- Handle payment webhooks

**Use Cases**:
- Online order payments
- Event booking payments
- Subscription billing
- Direct booking payments

**Integration Pattern**:
```typescript
// Create payment
const payment = await paymentAdapter.createPayment({
  amount: 1500,
  currency: "INR",
  referenceId: "order_123",
  metadata: { customerId: "cust_456" }
});

// Verify payment (webhook callback)
const verified = await paymentAdapter.verifyPayment(payment.paymentId);
```

### 2. Messaging & Communication

**Providers**: Twilio (SMS), WhatsApp Cloud API, SendGrid (Email)

**Capabilities**:
- Send SMS notifications
- Send WhatsApp messages
- Send email notifications
- Template-based messaging

**Use Cases**:
- Order confirmations
- Reservation reminders
- Payment receipts
- Low stock alerts
- Automation rule actions

**Integration Pattern**:
```typescript
// Send SMS
await messagingAdapter.sendSMS({
  to: "+919876543210",
  message: "Your order #12345 is confirmed",
  templateId: "order_confirmation"
});

// Send WhatsApp
await messagingAdapter.sendWhatsApp({
  to: "+919876543210",
  template: "reservation_reminder",
  variables: { guestName: "John Doe", date: "2026-10-15" }
});
```

### 3. Booking Channels

**Providers**: Booking.com, MakeMyTrip, Goibibo, Airbnb

**Capabilities**:
- Receive booking requests
- Sync availability
- Update rates
- Process cancellations

**Use Cases**:
- Hotel room bookings from OTAs
- Event venue bookings
- Sync inventory across channels

**Integration Pattern**:
```typescript
// Receive booking webhook
const booking = await processInboundWebhook({
  provider: "BOOKING.COM",
  payload: webhookPayload,
  signature: request.headers["x-booking-signature"]
});

// Sync availability
await bookingChannelAdapter.updateAvailability({
  roomId: "room_123",
  date: "2026-10-15",
  available: 5,
  rate: 3500
});
```

### 4. Food Delivery Platforms

**Providers**: Swiggy, Zomato

**Capabilities**:
- Receive orders
- Update order status
- Sync menu items
- Handle cancellations

**Use Cases**:
- Restaurant orders from delivery platforms
- Real-time order tracking
- Menu synchronization

**Integration Pattern**:
```typescript
// Receive order webhook
const order = await processInboundWebhook({
  provider: "SWIGGY",
  payload: orderPayload,
  signature: request.headers["x-swiggy-signature"]
});

// Update order status
await foodDeliveryAdapter.updateOrderStatus({
  orderId: "swiggy_order_123",
  status: "PREPARING"
});
```

### 5. Accounting & ERP

**Providers**: Tally, QuickBooks, Zoho Books

**Capabilities**:
- Sync invoices
- Sync payments
- Export reports
- Journal entries

**Use Cases**:
- Export sales invoices to accounting software
- Sync payment receipts
- Generate financial reports

**Integration Pattern**:
```typescript
// Export invoice
await accountingAdapter.createInvoice({
  invoiceNumber: "INV-2026-001",
  customer: { name: "John Doe", email: "john@example.com" },
  items: [
    { description: "Room Charge", amount: 5000 },
    { description: "Restaurant", amount: 1500 }
  ],
  total: 6500
});
```

### 6. Banking & Payments

**Providers**: RazorpayX, Cashfree, Bank APIs

**Capabilities**:
- Vendor payments
- Payouts
- Bank statements
- Reconciliation

**Use Cases**:
- Supplier payments
- Employee salary disbursement
- Bank reconciliation

### 7. Tax & Compliance

**Providers**: ClearTax, GSTN

**Capabilities**:
- GST filing
- E-invoicing
- E-way bills
- Tax reports

**Use Cases**:
- Generate e-invoices for B2B customers
- File GST returns
- Generate e-way bills for inter-state shipments

---

## Integration Lifecycle

### 1. Setup Phase

```
1. Select provider from registry
2. Configure credentials (stored as reference)
3. Test connection
4. Mark as CONNECTED
```

### 2. Active Phase

```
1. Integration is CONNECTED
2. Operations are logged
3. Health is monitored
4. Failures trigger alerts
```

### 3. Paused Phase

```
1. Integration is PAUSED
2. Operations are queued or rejected
3. No external calls are made
4. Can be resumed without reconfiguration
```

### 4. Disconnected Phase

```
1. Integration is DISCONNECTED
2. Credentials may be revoked
3. Historical logs are retained
4. Can be reconnected with new credentials
```

---

## Provider Registry

The provider registry maintains metadata for all supported providers:

```typescript
const providerInfo = providerRegistry.get("RAZORPAY");
// Returns:
{
  provider: "RAZORPAY",
  category: "PAYMENT",
  name: "Razorpay",
  description: "Indian payment gateway for online and offline payments",
  capabilities: ["PAYMENT_CREATE", "PAYMENT_VERIFY", "REFUND", "WEBHOOK"],
  documentationUrl: "https://razorpay.com/docs"
}
```

### Available Providers

| Category | Provider | Capabilities |
|----------|----------|--------------|
| PAYMENT | Razorpay | Create, Verify, Refund, Webhook |
| PAYMENT | Stripe | Create, Verify, Refund, Webhook |
| MESSAGING | Twilio | SMS, Voice, WhatsApp |
| MESSAGING | WhatsApp Cloud | WhatsApp Business API |
| BOOKING | Booking.com | Booking Sync, Availability, Rates |
| FOOD_DELIVERY | Swiggy | Orders, Menu, Status Updates |
| FOOD_DELIVERY | Zomato | Orders, Menu, Status Updates |
| ACCOUNTING | Tally | Invoice Sync, Payment Sync |
| BANKING | RazorpayX | Payouts, Bank Statements |
| TAX | ClearTax | GST Filing, E-Invoicing |

---

## Security & Authentication

### Credential Storage

Credentials are **never stored in plain text**:

```typescript
// Store credentials
const { credentialReference } = await updateCredentials(
  organizationId,
  integrationId,
  { apiKey: "rzp_live_xxx", secret: "xxx" }
);
// Returns: { credentialReference: "cred_abc123" }

// The reference points to encrypted storage (e.g., AWS Secrets Manager)
```

### Webhook Signature Verification

All inbound webhooks must be verified:

```typescript
// Verify Razorpay webhook
const isValid = await verifyWebhookSignature({
  payload: requestBody,
  signature: request.headers["x-razorpay-signature"],
  secret: webhookSecret
});

if (!isValid) {
  throw new Error("Invalid webhook signature");
}
```

### API Key Authentication

API keys are hashed before storage:

```typescript
// Create API key
const { apiKey, fullKey } = await createApiKey({
  organizationId,
  name: "Production API Key",
  permissions: ["orders.read", "orders.write"],
  expiresAt: "2027-01-01T00:00:00Z"
});

// fullKey is shown only once: "amrut_abc123..."
// Only the hash is stored in the database
```

---

## Permissions

Integration operations require specific permissions:

| Permission | Description |
|------------|-------------|
| `integrations.view` | View configured integrations |
| `integrations.manage` | Create, update, delete integrations |
| `integrations.connect` | Connect/disconnect integrations |
| `integrations.test` | Test integration connections |
| `integrations.logs.view` | View integration operation logs |
| `integrations.webhook.view` | View webhook endpoints |
| `integrations.webhook.manage` | Manage webhook endpoints |
| `api_keys.view` | View API keys |
| `api_keys.create` | Create API keys |
| `api_keys.revoke` | Revoke API keys |
| `api_keys.rotate` | Rotate API keys |
| `api.access` | Use API keys to access the API |

---

## Monitoring & Health

### Integration Health Check

```typescript
const health = await getIntegrationHealth(organizationId, integrationId);
// Returns:
{
  status: "CONNECTED",
  lastSuccessAt: "2026-10-08T10:30:00Z",
  lastFailureAt: null,
  failureCount: 0,
  lastSyncAt: "2026-10-08T10:30:00Z"
}
```

### Integration Logs

Every operation is logged:

```typescript
const logs = await listIntegrationLogs({
  organizationId,
  integrationId,
  status: "FAILURE",
  limit: 50
});
// Returns: Array of IntegrationLog
```

---

## Implementation Status

### Completed

- ✅ Integration domain types
- ✅ Provider registry with 15 built-in providers
- ✅ Adapter interfaces (Payment, Messaging, Booking, FoodDelivery, Accounting)
- ✅ Integration service layer (CRUD, connection management)
- ✅ Webhook foundation (outbound dispatch, inbound processing)
- ✅ API platform (keys, idempotency, rate limiting)
- ✅ Integration settings UI
- ✅ 15 integration permissions
- ✅ Routes and navigation

### Pending

- ⏳ Database schema for integrations
- ⏳ Actual provider implementations (Razorpay, Stripe, etc.)
- ⏳ Credential encryption/secret manager integration
- ⏳ Webhook delivery retry mechanism
- ⏳ Rate limiting implementation (Redis/in-memory)
- ⏳ HMAC signature generation/verification
- ⏳ Integration health monitoring dashboard
- ⏳ API key management UI
- ⏳ Webhook endpoint management UI

---

## Next Steps

1. **Database Schema**: Create SQL migration for integration tables
2. **Provider Implementations**: Implement actual adapters for Razorpay, Twilio, etc.
3. **Credential Security**: Integrate with AWS Secrets Manager or similar
4. **Webhook UI**: Build webhook endpoint management interface
5. **API Key UI**: Build API key management interface
6. **Testing**: Test actual provider integrations in sandbox mode

---

## Related Documentation

- [API Platform](./API.md) — API key management and rate limiting
- [Webhooks](./WEBHOOKS.md) — Webhook configuration and event dispatch
- [Permissions](./SECURITY.md#permissions) — Full permission catalogue
- [Audit](./SECURITY.md#audit) — Audit trail and compliance
