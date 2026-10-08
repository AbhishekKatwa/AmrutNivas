/**
 * API platform — keys, idempotency, rate limiting (Prompt #20 §33-43).
 *
 * Organization-level API keys with scoped permissions.
 * Idempotency support for sensitive operations.
 * Lightweight rate limiting abstraction.
 *
 * Security:
 * - Never store raw API keys (hash only)
 * - Show full key only once at creation
 * - Scoped permissions (e.g., "orders.read", "reservations.write")
 * - Organization-scoped (never cross-tenant)
 */

import type { EntityId } from "@/domain/identity/types";
import type { ApiKey } from "./types";

// =====================================================================
// API Key Management
// =====================================================================

/**
 * Available API key permissions.
 *
 * Format: "<resource>.<action>"
 * Resources: orders, reservations, customers, inventory, events, reports, etc.
 * Actions: read, write, manage
 */
export const API_KEY_PERMISSIONS = [
  // Orders
  "orders.read",
  "orders.write",
  // Reservations
  "reservations.read",
  "reservations.write",
  // Customers
  "customers.read",
  "customers.write",
  // Inventory
  "inventory.read",
  "inventory.write",
  // Events
  "events.read",
  "events.write",
  // Reports
  "reports.read",
  // Integrations
  "integrations.read",
  "integrations.write",
  // Webhooks
  "webhooks.read",
  "webhooks.write",
] as const;

export type ApiKeyPermission = (typeof API_KEY_PERMISSIONS)[number];

/**
 * Create an API key.
 *
 * Returns the full key only once — store it securely.
 * Only the key prefix and hashed key are stored.
 */
export async function createApiKey(params: {
  organizationId: EntityId;
  name: string;
  permissions: ApiKeyPermission[];
  expiresAt?: string;
}): Promise<{
  apiKey: ApiKey;
  fullKey: string; // Only returned once
}> {
  // Generate secure random key
  const fullKey = generateSecureApiKey();
  const keyPrefix = fullKey.slice(0, 8);
  const hashedKey = await hashApiKey(fullKey);

  const now = new Date().toISOString();
  const apiKey: ApiKey = {
    id: `ak_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    organizationId: params.organizationId,
    name: params.name,
    keyPrefix,
    hashedKey,
    permissions: params.permissions,
    status: "ACTIVE",
    lastUsedAt: null,
    expiresAt: params.expiresAt ?? null,
    createdAt: now,
    updatedAt: now,
  };

  // TODO: Persist to database
  // TODO: Audit event: API_KEY_CREATED

  return { apiKey, fullKey };
}

/**
 * Get API key by ID.
 */
export async function getApiKey(
  _organizationId: EntityId,
  _apiKeyId: EntityId
): Promise<ApiKey | null> {
  // TODO: Fetch from database with organization scope check
  return null;
}

/**
 * List API keys for an organization.
 */
export async function listApiKeys(
  _organizationId: EntityId
): Promise<ApiKey[]> {
  // TODO: Fetch from database with organization scope check
  return [];
}

/**
 * Revoke an API key.
 */
export async function revokeApiKey(
  _organizationId: EntityId,
  _apiKeyId: EntityId
): Promise<ApiKey> {
  // TODO: Update status to REVOKED in database
  // TODO: Audit event: API_KEY_REVOKED
  throw new Error("Not implemented");
}

/**
 * Rotate an API key — revoke old, create new with same permissions.
 */
export async function rotateApiKey(
  organizationId: EntityId,
  apiKeyId: EntityId
): Promise<{
  apiKey: ApiKey;
  fullKey: string;
}> {
  const oldKey = await getApiKey(organizationId, apiKeyId);
  if (!oldKey) {
    throw new Error("API key not found");
  }

  // Revoke old key
  await revokeApiKey(organizationId, apiKeyId);

  // Create new key with same permissions
  const newKey = await createApiKey({
    organizationId,
    name: `${oldKey.name} (rotated)`,
    permissions: oldKey.permissions as ApiKeyPermission[],
    expiresAt: oldKey.expiresAt ?? undefined,
  });

  // TODO: Audit event: API_KEY_ROTATED

  return newKey;
}

/**
 * Validate an API key and return its permissions.
 */
export async function validateApiKey(
  _fullKey: string
): Promise<{
  valid: boolean;
  organizationId?: EntityId;
  permissions?: string[];
  error?: string;
}> {
  // TODO: Hash the provided key
  // TODO: Look up in database by hashed key
  // TODO: Check status is ACTIVE
  // TODO: Check not expired
  // TODO: Update lastUsedAt
  // TODO: Return organization and permissions

  return {
    valid: false,
    error: "Not implemented",
  };
}

/**
 * Check if an API key has a specific permission.
 */
export function hasPermission(
  apiKey: ApiKey,
  permission: ApiKeyPermission
): boolean {
  return apiKey.permissions.includes(permission);
}

// =====================================================================
// API Key Utilities
// =====================================================================

/**
 * Generate a secure random API key.
 */
function generateSecureApiKey(): string {
  const prefix = "amrut_";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let key = prefix;
  for (let i = 0; i < 48; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

/**
 * Hash an API key for storage.
 */
async function hashApiKey(key: string): Promise<string> {
  // TODO: Use proper hashing (e.g., SHA-256 with salt)
  // For now, use a simple hash placeholder
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// =====================================================================
// Idempotency
// =====================================================================

/**
 * Idempotency record for sensitive operations.
 */
export type IdempotencyRecord = {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly idempotencyKey: string;
  readonly operation: string;
  readonly entityType: string;
  readonly entityId?: EntityId | null;
  readonly response: unknown;
  readonly createdAt: string;
  readonly expiresAt: string;
};

/**
 * Check if an operation has already been executed (idempotency).
 */
export async function checkIdempotency(_params: {
  organizationId: EntityId;
  idempotencyKey: string;
}): Promise<{
  executed: boolean;
  response?: unknown;
}> {
  // TODO: Look up idempotency key in database
  // TODO: Check not expired
  // TODO: Return stored response if found

  return {
    executed: false,
  };
}

/**
 * Record an operation result for idempotency.
 */
export async function recordIdempotency(params: {
  organizationId: EntityId;
  idempotencyKey: string;
  operation: string;
  entityType: string;
  entityId?: EntityId;
  response: unknown;
  ttlSeconds?: number;
}): Promise<IdempotencyRecord> {
  const now = new Date();
  const ttl = params.ttlSeconds ?? 86400; // 24 hours default
  const expiresAt = new Date(now.getTime() + ttl * 1000);

  const record: IdempotencyRecord = {
    id: `idm_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    organizationId: params.organizationId,
    idempotencyKey: params.idempotencyKey,
    operation: params.operation,
    entityType: params.entityType,
    entityId: params.entityId ?? null,
    response: params.response,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  // TODO: Persist to database

  return record;
}

// =====================================================================
// Rate Limiting
// =====================================================================

/**
 * Rate limit tier.
 */
export type RateLimitTier = "public" | "private" | "webhook" | "api_key";

/**
 * Rate limit configuration.
 */
export const RATE_LIMITS: Record<RateLimitTier, { requests: number; windowSeconds: number }> = {
  public: { requests: 100, windowSeconds: 60 }, // 100 req/min
  private: { requests: 1000, windowSeconds: 60 }, // 1000 req/min
  webhook: { requests: 500, windowSeconds: 60 }, // 500 req/min
  api_key: { requests: 500, windowSeconds: 60 }, // 500 req/min
};

/**
 * Check if a request is within rate limits.
 */
export async function checkRateLimit(params: {
  organizationId: EntityId;
  tier: RateLimitTier;
  identifier: string; // IP, API key, etc.
}): Promise<{
  allowed: boolean;
  remaining: number;
  resetAt: string;
}> {
  const limit = RATE_LIMITS[params.tier];

  // TODO: Implement rate limiting (e.g., Redis, in-memory counter)
  // For now, always allow

  return {
    allowed: true,
    remaining: limit.requests,
    resetAt: new Date(Date.now() + limit.windowSeconds * 1000).toISOString(),
  };
}

/**
 * Record a request for rate limiting.
 */
export async function recordRateLimitRequest(_params: {
  organizationId: EntityId;
  tier: RateLimitTier;
  identifier: string;
}): Promise<void> {
  // TODO: Increment counter in rate limit store
}

// =====================================================================
// API Error Format
// =====================================================================

/**
 * Standard API error response format.
 */
export type ApiError = {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: Record<string, unknown>;
  };
};

/**
 * Create a standard API error response.
 */
export function createApiError(params: {
  code: string;
  message: string;
  requestId: string;
  details?: Record<string, unknown>;
  statusCode?: number;
}): ApiError & { statusCode: number } {
  return {
    error: {
      code: params.code,
      message: params.message,
      requestId: params.requestId,
      details: params.details,
    },
    statusCode: params.statusCode ?? 400,
  };
}

/**
 * Common API error codes.
 */
export const API_ERROR_CODES = {
  PERMISSION_DENIED: "PERMISSION_DENIED",
  UNAUTHORIZED: "UNAUTHORIZED",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;
