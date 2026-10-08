# Webhooks

**Prompt #20 §16-32**  
**Status**: Foundation Complete

---

## Overview

Webhooks enable AMRUT NIVAAS to send real-time notifications to external systems when events occur (outbound webhooks) and receive notifications from external systems (inbound webhooks).

### Key Features

- **Outbound Webhooks**: Dispatch events to registered endpoints
- **Inbound Webhooks**: Receive and process events from external providers
- **HMAC Signatures**: Secure webhook delivery with cryptographic signatures
- **Retry Logic**: Automatic retry for failed deliveries
- **Idempotency**: Prevent duplicate processing of inbound events
- **Event Mapping**: Translate provider-specific events to canonical format

---

## Outbound Webhooks

Outbound webhooks notify external systems when events occur in AMRUT NIVAAS.

### Supported Events

| Event | Description |
|-------|-------------|
| `ORDER_CREATED` | New order placed |
| `ORDER_UPDATED` | Order status changed |
| `ORDER_COMPLETED` | Order fulfilled |
| `ORDER_CANCELLED` | Order cancelled |
| `PAYMENT_RECEIVED` | Payment received |
| `PAYMENT_FAILED` | Payment failed |
| `PAYMENT_REFUNDED` | Payment refunded |
| `RESERVATION_CREATED` | New reservation created |
| `RESERVATION_CONFIRMED` | Reservation confirmed |
| `RESERVATION_CANCELLED` | Reservation cancelled |
| `RESERVATION_CHECK_IN` | Guest checked in |
| `RESERVATION_CHECK_OUT` | Guest checked out |
| `EVENT_CONFIRMED` | Event booking confirmed |
| `EVENT_COMPLETED` | Event completed |
| `INVOICE_CREATED` | Invoice generated |
| `INVOICE_PAID` | Invoice paid |
| `INVOICE_OVERDUE` | Invoice overdue |
| `INVENTORY_LOW` | Stock below threshold |
| `INVENTORY_RECEIVED` | Stock received |
| `CUSTOMER_CREATED` | New customer registered |
| `CUSTOMER_UPDATED` | Customer profile updated |

### Webhook Endpoint Management

#### Create Endpoint

```typescript
const endpoint = await createWebhookEndpoint({
  organizationId: "org_123",
  name: "Order Notifications",
  url: "https://example.com/webhooks/amrut",
  events: ["ORDER_CREATED", "ORDER_COMPLETED", "PAYMENT_RECEIVED"],
  secret: "whsec_abc123...", // Used for HMAC signature
  metadata: {
    environment: "production"
  }
});
```

#### List Endpoints

```typescript
const endpoints = await listWebhookEndpoints(organizationId);
```

#### Update Endpoint

```typescript
await updateWebhookEndpoint(organizationId, endpointId, {
  url: "https://example.com/webhooks/new-url",
  events: ["ORDER_CREATED", "ORDER_UPDATED"]
});
```

#### Delete Endpoint

```typescript
await deleteWebhookEndpoint(organizationId, endpointId);
```

### Dispatching Events

Domain services dispatch events after successful operations:

```typescript
// In order service
async function createOrder(params: CreateOrderParams) {
  const order = await saveOrder(params);
  
  // Dispatch webhook event
  await dispatchWebhookEvent({
    organizationId: order.organizationId,
    propertyId: order.propertyId,
    outletId: order.outletId,
    event: "ORDER_CREATED",
    data: {
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      total: order.total,
      items: order.items
    },
    entityId: order.id,
    entityType: "ORDER"
  });
  
  return order;
}
```

### Webhook Delivery

Each dispatch creates delivery records for tracking:

```typescript
type WebhookDelivery = {
  id: EntityId;
  organizationId: EntityId;
  endpointId: EntityId;
  event: string;
  payload: unknown;
  status: "PENDING" | "SENDING" | "DELIVERED" | "FAILED" | "CANCELLED";
  attempts: number;
  lastAttemptAt: string | null;
  responseStatus: number | null;
  responseBody: string | null;
  error: string | null;
  createdAt: string;
};
```

### Delivery Statuses

| Status | Description |
|--------|-------------|
| `PENDING` | Delivery queued, not yet sent |
| `SENDING` | Delivery in progress |
| `DELIVERED` | Successfully delivered (2xx response) |
| `FAILED` | Delivery failed (non-2xx or timeout) |
| `CANCELLED` | Delivery cancelled (endpoint deleted) |

### Retry Logic

Failed deliveries are automatically retried:

```typescript
// Retry a failed delivery
await retryWebhookDelivery(organizationId, deliveryId);
```

**Retry Schedule** (to be implemented):
- Attempt 1: Immediate
- Attempt 2: 1 minute
- Attempt 3: 5 minutes
- Attempt 4: 30 minutes
- Attempt 5: 2 hours
- Attempt 6: 12 hours
- Attempt 7: 24 hours
- After 7 attempts: Mark as permanently failed

### Webhook Payload Format

```json
{
  "id": "evt_abc123",
  "event": "ORDER_CREATED",
  "timestamp": "2026-10-08T10:30:00Z",
  "organizationId": "org_123",
  "propertyId": "prop_456",
  "outletId": "outlet_789",
  "data": {
    "orderId": "order_123",
    "orderNumber": "ORD-2026-001",
    "customerId": "cust_456",
    "total": 1500,
    "items": [...]
  }
}
```

### Webhook Headers

Each delivery includes security headers:

```http
POST /webhooks/amrut HTTP/1.1
Content-Type: application/json
X-AMRUT-SIGNATURE: sha256=abc123...
X-AMRUT-EVENT: ORDER_CREATED
X-AMRUT-DELIVERY: del_abc123
X-AMRUT-TIMESTAMP: 2026-10-08T10:30:00Z
```

### HMAC Signature Verification

Recipients should verify the signature to ensure authenticity:

```typescript
// On the receiving server
function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  
  return `sha256=${expectedSignature}` === signature;
}

// In webhook handler
app.post("/webhooks/amrut", (req, res) => {
  const signature = req.headers["x-amrut-signature"];
  const payload = JSON.stringify(req.body);
  
  if (!verifyWebhookSignature(payload, signature, WEBHOOK_SECRET)) {
    return res.status(401).send("Invalid signature");
  }
  
  // Process the event
  const event = req.body;
  console.log(`Received ${event.event}:`, event.data);
  
  res.status(200).send("OK");
});
```

---

## Inbound Webhooks

Inbound webhooks receive events from external providers (e.g., payment gateways, booking channels).

### Processing Flow

```
1. Webhook arrives at endpoint
   ↓
2. Authenticate (verify signature/API key)
   ↓
3. Validate payload structure
   ↓
4. Identify provider
   ↓
5. Check idempotency (prevent duplicate processing)
   ↓
6. Translate event to canonical format
   ↓
7. Call appropriate domain service
   ↓
8. Log operation
   ↓
9. Audit event
   ↓
10. Return success response
```

### Processing an Inbound Webhook

```typescript
// In webhook route handler
app.post("/webhooks/razorpay", async (req, res) => {
  try {
    const result = await processInboundWebhook({
      organizationId: "org_123",
      integrationId: "int_razorpay",
      provider: "RAZORPAY",
      signature: req.headers["x-razorpay-signature"],
      payload: req.body,
      headers: req.headers
    });
    
    if (result.success) {
      res.status(200).send("OK");
    } else {
      res.status(400).send(result.error);
    }
  } catch (error) {
    console.error("Webhook processing failed:", error);
    res.status(500).send("Internal error");
  }
});
```

### Idempotency for Inbound Webhooks

Prevent duplicate processing of the same event:

```typescript
// Check if event already processed
const isProcessed = await isInboundEventProcessed({
  integrationId: "int_razorpay",
  externalEventId: "pay_abc123" // Provider's event ID
});

if (isProcessed) {
  return { success: true }; // Already processed, return success
}

// Process the event
const result = await processPaymentWebhook(payload);

// Mark as processed
await markInboundEventProcessed({
  integrationId: "int_razorpay",
  externalEventId: "pay_abc123",
  entityType: "PAYMENT",
  entityId: result.paymentId
});
```

### Event Mapping

Translate provider-specific events to canonical AMRUT events:

```typescript
const canonicalEvent = mapExternalEvent({
  provider: "RAZORPAY",
  externalEvent: "payment.captured"
});
// Returns: "FINANCE.PAYMENT_RECEIVED"

const canonicalEvent = mapExternalEvent({
  provider: "BOOKING.COM",
  externalEvent: "booking.confirmed"
});
// Returns: "HOTEL.RESERVATION_CONFIRMED"
```

### Provider-Specific Event Mappings

#### Razorpay (Payment Gateway)

| External Event | Canonical Event |
|----------------|-----------------|
| `payment.captured` | `FINANCE.PAYMENT_RECEIVED` |
| `payment.failed` | `FINANCE.PAYMENT_FAILED` |
| `refund.processed` | `FINANCE.REFUND_PROCESSED` |

#### Booking.com (Booking Channel)

| External Event | Canonical Event |
|----------------|-----------------|
| `booking.created` | `HOTEL.RESERVATION_CREATED` |
| `booking.confirmed` | `HOTEL.RESERVATION_CONFIRMED` |
| `booking.cancelled` | `HOTEL.RESERVATION_CANCELLED` |

#### Swiggy (Food Delivery)

| External Event | Canonical Event |
|----------------|-----------------|
| `order.created` | `RESTAURANT.ORDER_PLACED` |
| `order.accepted` | `RESTAURANT.ORDER_ACCEPTED` |
| `order.cancelled` | `RESTAURANT.ORDER_CANCELLED` |

---

## Webhook Security

### Outbound Webhook Security

1. **HMAC Signatures**: All outbound webhooks are signed with HMAC-SHA256
2. **Secret Management**: Each endpoint has a unique secret
3. **Timestamp Validation**: Recipients should validate timestamps to prevent replay attacks
4. **HTTPS Required**: All webhook endpoints must use HTTPS

### Inbound Webhook Security

1. **Signature Verification**: Verify provider signatures before processing
2. **IP Whitelisting**: Restrict webhook endpoints to provider IP ranges
3. **Rate Limiting**: Protect against webhook floods
4. **Payload Validation**: Validate payload structure before processing

### Generating Signatures

```typescript
const signature = await generateWebhookSignature({
  payload: JSON.stringify(webhookPayload),
  secret: endpoint.secret
});
// Returns: "sha256=abc123..."
```

### Verifying Signatures

```typescript
const isValid = await verifyWebhookSignature({
  payload: JSON.stringify(req.body),
  signature: req.headers["x-amrut-signature"],
  secret: endpoint.secret
});

if (!isValid) {
  throw new Error("Invalid webhook signature");
}
```

---

## Monitoring & Debugging

### Listing Webhook Deliveries

```typescript
const deliveries = await listWebhookDeliveries({
  organizationId,
  endpointId,
  status: "FAILED",
  limit: 50
});
```

### Delivery Details

Each delivery record includes:

```typescript
{
  id: "del_abc123",
  endpointId: "ep_456",
  event: "ORDER_CREATED",
  payload: { ... },
  status: "FAILED",
  attempts: 3,
  lastAttemptAt: "2026-10-08T10:35:00Z",
  responseStatus: 500,
  responseBody: "Internal server error",
  error: "Non-2xx response",
  createdAt: "2026-10-08T10:30:00Z"
}
```

### Debugging Failed Deliveries

1. Check the delivery status and error message
2. Verify the endpoint URL is accessible
3. Check the endpoint server logs
4. Verify the signature is correct
5. Check for rate limiting or firewall issues
6. Retry the delivery manually

---

## Best Practices

### For Webhook Senders

1. **Use HTTPS**: Always send to HTTPS endpoints
2. **Sign payloads**: Always include HMAC signatures
3. **Include timestamps**: Help recipients detect replay attacks
4. **Handle failures**: Track failed deliveries and retry
5. **Monitor delivery rates**: Detect endpoint issues early
6. **Version your events**: Use event versioning for backward compatibility

### For Webhook Recipients

1. **Verify signatures**: Always verify HMAC signatures
2. **Validate timestamps**: Reject old timestamps (e.g., > 5 minutes)
3. **Respond quickly**: Return 2xx immediately, process asynchronously
4. **Implement idempotency**: Handle duplicate deliveries gracefully
5. **Log everything**: Log all webhook deliveries for debugging
6. **Monitor failures**: Alert on consecutive failures

---

## Implementation Status

### Completed

- ✅ Webhook endpoint management (CRUD)
- ✅ Outbound event dispatch
- ✅ Delivery tracking
- ✅ Inbound webhook processing foundation
- ✅ Idempotency checks
- ✅ Event mapping (provider → canonical)
- ✅ Signature generation/verification (placeholder)

### Pending

- ⏳ Database schema for webhooks
- ⏳ Actual HTTP delivery implementation
- ⏳ Retry mechanism with exponential backoff
- ⏳ Real HMAC-SHA256 signature generation
- ⏳ Webhook endpoint management UI
- ⏳ Webhook delivery monitoring UI
- ⏳ Webhook event logs UI

---

## Related Documentation

- [Integrations](./INTEGRATIONS.md) — Integration architecture and providers
- [API Platform](./API.md) — API key management and rate limiting
- [Security](./SECURITY.md) — Authentication and authorization
