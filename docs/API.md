# API Platform

**Prompt #20 §33-43**  
**Status**: Foundation Complete

---

## Overview

The API Platform enables third-party developers and internal services to interact with AMRUT NIVAAS programmatically. It provides secure, rate-limited, permission-scoped API access with full audit trails.

### Key Features

- **API Key Management**: Create, rotate, and revoke API keys
- **Scoped Permissions**: Fine-grained permission control per API key
- **Idempotency**: Prevent duplicate operations with idempotency keys
- **Rate Limiting**: Tier-based rate limiting to protect the platform
- **Standard Error Format**: Consistent error responses across all endpoints
- **Organization-Scoped**: All API access is isolated by organization

---

## API Key Management

### Creating an API Key

API keys are created with a name, scoped permissions, and optional expiration:

```typescript
const { apiKey, fullKey } = await createApiKey({
  organizationId: "org_123",
  name: "Production API Key",
  permissions: ["orders.read", "orders.write", "customers.read"],
  expiresAt: "2027-01-01T00:00:00Z"
});

console.log(fullKey); // "amrut_abc123..." — shown only once!
```

**Security**: The full API key is returned **only once** at creation. Store it securely. Only the key prefix and hashed version are stored in the database.

### Listing API Keys

```typescript
const keys = await listApiKeys(organizationId);
// Returns: Array of ApiKey (without full key values)
```

### Revoking an API Key

```typescript
await revokeApiKey(organizationId, apiKeyId);
// Status changes to REVOKED, key can no longer be used
```

### Rotating an API Key

Rotation revokes the old key and creates a new one with the same permissions:

```typescript
const { apiKey: newKey, fullKey: newFullKey } = await rotateApiKey(
  organizationId,
  apiKeyId
);

console.log(newFullKey); // New key — store it securely
```

### Validating an API Key

Used internally to authenticate API requests:

```typescript
const result = await validateApiKey(fullKey);
if (!result.valid) {
  throw new Error(result.error);
}

const { organizationId, permissions } = result;
```

---

## API Key Permissions

API keys support fine-grained permissions:

### Available Permissions

| Permission | Description |
|------------|-------------|
| `orders.read` | Read order data |
| `orders.write` | Create and update orders |
| `reservations.read` | Read reservation data |
| `reservations.write` | Create and update reservations |
| `customers.read` | Read customer data |
| `customers.write` | Create and update customers |
| `inventory.read` | Read inventory data |
| `inventory.write` | Update inventory |
| `events.read` | Read event data |
| `events.write` | Create and update events |
| `reports.read` | Generate and read reports |
| `integrations.read` | Read integration configuration |
| `integrations.write` | Update integration configuration |
| `webhooks.read` | Read webhook endpoints |
| `webhooks.write` | Create and update webhook endpoints |

### Checking Permissions

```typescript
const hasAccess = hasPermission(apiKey, "orders.write");
if (!hasAccess) {
  throw createApiError({
    code: "PERMISSION_DENIED",
    message: "API key lacks orders.write permission",
    requestId: generateRequestId(),
    statusCode: 403
  });
}
```

---

## Idempotency

Sensitive operations (payments, order creation, etc.) support idempotency keys to prevent duplicate processing.

### How It Works

1. Client generates a unique idempotency key (e.g., UUID)
2. Client includes the key in the request header: `Idempotency-Key: <key>`
3. Server checks if the key has been used before
4. If used, return the original response
5. If not used, process the request and store the result

### Example

```typescript
// Check idempotency
const { executed, response } = await checkIdempotency({
  organizationId,
  idempotencyKey: "idem_abc123"
});

if (executed) {
  // Return the original response
  return response;
}

// Process the operation
const result = await createOrder({ ... });

// Record the result
await recordIdempotency({
  organizationId,
  idempotencyKey: "idem_abc123",
  operation: "ORDER_CREATED",
  entityType: "ORDER",
  entityId: result.id,
  response: result,
  ttlSeconds: 86400 // 24 hours
});
```

### Idempotency Record

```typescript
type IdempotencyRecord = {
  id: EntityId;
  organizationId: EntityId;
  idempotencyKey: string;
  operation: string;
  entityType: string;
  entityId?: EntityId | null;
  response: unknown;
  createdAt: string;
  expiresAt: string;
};
```

---

## Rate Limiting

Rate limiting protects the platform from abuse and ensures fair usage.

### Rate Limit Tiers

| Tier | Requests | Window | Use Case |
|------|----------|--------|----------|
| `public` | 100 | 60 seconds | Unauthenticated endpoints |
| `private` | 1000 | 60 seconds | Authenticated user sessions |
| `webhook` | 500 | 60 seconds | Inbound webhook processing |
| `api_key` | 500 | 60 seconds | API key authentication |

### Checking Rate Limits

```typescript
const { allowed, remaining, resetAt } = await checkRateLimit({
  organizationId,
  tier: "api_key",
  identifier: apiKeyId // or IP address
});

if (!allowed) {
  throw createApiError({
    code: "RATE_LIMIT_EXCEEDED",
    message: `Rate limit exceeded. Try again after ${resetAt}`,
    requestId: generateRequestId(),
    statusCode: 429
  });
}

// Include rate limit headers in response
response.setHeader("X-RateLimit-Limit", "500");
response.setHeader("X-RateLimit-Remaining", String(remaining));
response.setHeader("X-RateLimit-Reset", resetAt);
```

### Recording Requests

```typescript
await recordRateLimitRequest({
  organizationId,
  tier: "api_key",
  identifier: apiKeyId
});
```

---

## Error Format

All API errors follow a standard format:

```typescript
type ApiError = {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: Record<string, unknown>;
  };
};
```

### Example Error Response

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid order data",
    "requestId": "req_abc123",
    "details": {
      "fields": {
        "customerId": "Customer ID is required",
        "items": "At least one item is required"
      }
    }
  }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `PERMISSION_DENIED` | 403 | API key lacks required permission |
| `UNAUTHORIZED` | 401 | Invalid or missing API key |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `RATE_LIMIT_EXCEEDED` | 429 | Rate limit exceeded |
| `IDEMPOTENCY_CONFLICT` | 409 | Idempotency key conflict |
| `INTERNAL_ERROR` | 500 | Internal server error |

### Creating Errors

```typescript
const error = createApiError({
  code: "VALIDATION_ERROR",
  message: "Invalid order data",
  requestId: "req_abc123",
  details: {
    fields: {
      customerId: "Customer ID is required"
    }
  },
  statusCode: 400
});

throw error;
```

---

## API Request Flow

```
1. Request arrives
   ↓
2. Rate limit check
   ↓
3. API key validation
   ↓
4. Permission check
   ↓
5. Idempotency check (if applicable)
   ↓
6. Request validation
   ↓
7. Business logic execution
   ↓
8. Record idempotency (if applicable)
   ↓
9. Record rate limit request
   ↓
10. Audit log
   ↓
11. Response
```

---

## Authentication Methods

### 1. API Key (Header)

```http
POST /api/v1/orders HTTP/1.1
Authorization: Bearer amrut_abc123...
Content-Type: application/json
```

### 2. API Key (Query Parameter)

```http
GET /api/v1/orders?api_key=amrut_abc123... HTTP/1.1
```

**Note**: Header authentication is preferred for security.

---

## Implementation Status

### Completed

- ✅ API key management (create, list, revoke, rotate, validate)
- ✅ Permission checking
- ✅ Idempotency foundation (check, record)
- ✅ Rate limiting abstraction (check, record)
- ✅ Standard error format
- ✅ 16 API key permissions

### Pending

- ⏳ Database schema for API keys
- ⏳ Actual rate limiting implementation (Redis/in-memory)
- ⏳ Idempotency persistence
- ⏳ API key management UI
- ⏳ API documentation (Swagger/OpenAPI)
- ⏳ API request logging

---

## Security Best Practices

1. **Never expose full API keys**: Show only at creation, store only hashes
2. **Use HTTPS**: All API requests must use TLS
3. **Rotate keys regularly**: Use `rotateApiKey()` to rotate keys
4. **Scope permissions tightly**: Grant only the permissions needed
5. **Set expiration dates**: Use `expiresAt` to limit key lifetime
6. **Monitor usage**: Track API key usage in logs
7. **Revoke compromised keys**: Immediately revoke if a key is leaked

---

## Related Documentation

- [Integrations](./INTEGRATIONS.md) — Integration architecture and providers
- [Webhooks](./WEBHOOKS.md) — Webhook configuration and events
- [Security](./SECURITY.md) — Authentication and authorization
