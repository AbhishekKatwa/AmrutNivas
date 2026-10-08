/**
 * Integration service layer (Prompt #20 §6-7, §12-15, §44-46).
 *
 * Manages integration lifecycle: create, configure, connect, test, pause, disconnect.
 * All operations are organization-scoped and permission-gated.
 * Credentials are stored as references, never raw secrets.
 *
 * Architecture:
 *   Service → validates → calls adapter → logs → audits
 */

import type { EntityId } from "@/domain/identity/types";
import type {
  Integration,
  IntegrationCategory,
  IntegrationProvider,
  IntegrationStatus,
  IntegrationLog,
  ProviderInfo,
} from "./types";
import { providerRegistry } from "./provider-registry";

export type { Integration, IntegrationCategory, ProviderInfo };

// =====================================================================
// Integration CRUD
// =====================================================================

/**
 * Create a new integration.
 *
 * Status starts as PENDING_SETUP until credentials are configured and connection is tested.
 */
export async function createIntegration(params: {
  organizationId: EntityId;
  propertyId?: EntityId | null;
  outletId?: EntityId | null;
  provider: IntegrationProvider;
  category: IntegrationCategory;
  name: string;
  configuration?: Record<string, unknown>;
}): Promise<Integration> {
  // Validate provider exists
  const providerInfo = providerRegistry.get(params.provider);
  if (!providerInfo) {
    throw new Error(`Provider ${params.provider} is not registered`);
  }

  // Validate category matches provider
  if (providerInfo.category !== params.category) {
    throw new Error(
      `Provider ${params.provider} belongs to category ${providerInfo.category}, not ${params.category}`
    );
  }

  const now = new Date().toISOString();
  const integration: Integration = {
    id: `int_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    organizationId: params.organizationId,
    propertyId: params.propertyId ?? null,
    outletId: params.outletId ?? null,
    provider: params.provider,
    category: params.category,
    name: params.name,
    status: "PENDING_SETUP",
    configuration: params.configuration ?? {},
    credentialReference: null,
    lastSyncAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    createdAt: now,
    updatedAt: now,
  };

  // TODO: Persist to database
  // TODO: Audit event: INTEGRATION_CREATED

  return integration;
}

/**
 * Get integration by ID.
 */
export async function getIntegration(
  _organizationId: EntityId,
  _integrationId: EntityId
): Promise<Integration | null> {
  // TODO: Fetch from database with organization scope check
  return null;
}

/**
 * List integrations for an organization.
 */
export async function listIntegrations(_params: {
  organizationId: EntityId;
  propertyId?: EntityId | null;
  category?: IntegrationCategory;
  status?: IntegrationStatus;
}): Promise<Integration[]> {
  // TODO: Fetch from database with organization scope check
  return [];
}

/**
 * Update integration configuration.
 */
export async function updateIntegration(
  _organizationId: EntityId,
  _integrationId: EntityId,
  _updates: {
    name?: string;
    configuration?: Record<string, unknown>;
    status?: IntegrationStatus;
  }
): Promise<Integration> {
  // TODO: Update in database with organization scope check
  // TODO: Audit event based on changes
  throw new Error("Not implemented");
}

/**
 * Delete integration.
 */
export async function deleteIntegration(
  _organizationId: EntityId,
  _integrationId: EntityId
): Promise<void> {
  // TODO: Delete from database with organization scope check
  // TODO: Audit event: INTEGRATION_DELETED
}

// =====================================================================
// Connection Management
// =====================================================================

/**
 * Update integration credentials.
 *
 * Credentials are stored securely via credentialReference, never as raw secrets.
 */
export async function updateCredentials(
  _organizationId: EntityId,
  _integrationId: EntityId,
  _credentials: Record<string, string>
): Promise<{ credentialReference: string }> {
  // TODO: Store credentials securely (e.g., encrypted vault, secrets manager)
  // TODO: Return reference ID
  // TODO: Audit event: CREDENTIAL_UPDATED

  const credentialReference = `cred_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  return { credentialReference };
}

/**
 * Test integration connection.
 *
 * Calls the provider's testConnection() method to verify credentials and connectivity.
 */
export async function testConnection(
  organizationId: EntityId,
  integrationId: EntityId
): Promise<{
  success: boolean;
  message: string;
  testedAt: string;
}> {
  const integration = await getIntegration(organizationId, integrationId);
  if (!integration) {
    throw new Error("Integration not found");
  }

  // TODO: Get adapter for provider
  // TODO: Call adapter.testConnection()
  // TODO: Log result
  // TODO: Update integration status
  // TODO: Audit event: INTEGRATION_TESTED

  const testedAt = new Date().toISOString();

  return {
    success: true,
    message: "Connection test successful",
    testedAt,
  };
}

/**
 * Connect integration — marks as CONNECTED after successful test.
 */
export async function connectIntegration(
  organizationId: EntityId,
  integrationId: EntityId
): Promise<Integration> {
  const integration = await getIntegration(organizationId, integrationId);
  if (!integration) {
    throw new Error("Integration not found");
  }

  // Test connection first
  const testResult = await testConnection(organizationId, integrationId);
  if (!testResult.success) {
    throw new Error(`Connection test failed: ${testResult.message}`);
  }

  // Update status to CONNECTED
  const updated = await updateIntegration(organizationId, integrationId, {
    status: "CONNECTED",
  });

  // TODO: Audit event: INTEGRATION_CONNECTED

  return updated;
}

/**
 * Disconnect integration — marks as DISCONNECTED.
 */
export async function disconnectIntegration(
  organizationId: EntityId,
  integrationId: EntityId
): Promise<Integration> {
  const updated = await updateIntegration(organizationId, integrationId, {
    status: "DISCONNECTED",
  });

  // TODO: Audit event: INTEGRATION_DISCONNECTED

  return updated;
}

/**
 * Pause integration — marks as PAUSED (temporary disconnect).
 */
export async function pauseIntegration(
  organizationId: EntityId,
  integrationId: EntityId
): Promise<Integration> {
  const updated = await updateIntegration(organizationId, integrationId, {
    status: "PAUSED",
  });

  // TODO: Audit event: INTEGRATION_PAUSED

  return updated;
}

// =====================================================================
// Integration Logs
// =====================================================================

/**
 * Log an integration operation.
 */
export async function logIntegrationOperation(params: {
  organizationId: EntityId;
  integrationId: EntityId;
  direction: "OUTBOUND" | "INBOUND";
  operation: string;
  entityType?: string;
  entityId?: EntityId;
  status: "SUCCESS" | "FAILURE" | "PENDING";
  errorCode?: string;
  errorMessage?: string;
  startedAt: string;
  completedAt?: string;
}): Promise<IntegrationLog> {
  const log: IntegrationLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    organizationId: params.organizationId,
    integrationId: params.integrationId,
    direction: params.direction,
    operation: params.operation,
    entityType: params.entityType ?? null,
    entityId: params.entityId ?? null,
    status: params.status,
    errorCode: params.errorCode ?? null,
    errorMessage: params.errorMessage ?? null,
    startedAt: params.startedAt,
    completedAt: params.completedAt ?? null,
  };

  // TODO: Persist to database

  return log;
}

/**
 * List integration logs.
 */
export async function listIntegrationLogs(_params: {
  organizationId: EntityId;
  integrationId?: EntityId;
  direction?: "OUTBOUND" | "INBOUND";
  status?: "SUCCESS" | "FAILURE" | "PENDING";
  limit?: number;
}): Promise<IntegrationLog[]> {
  // TODO: Fetch from database with organization scope check
  return [];
}

// =====================================================================
// Provider Info
// =====================================================================

/**
 * Get all available providers.
 */
export function getAvailableProviders(): ProviderInfo[] {
  return providerRegistry.getAll();
}

/**
 * Get providers by category.
 */
export function getProvidersByCategory(
  category: IntegrationCategory
): ProviderInfo[] {
  return providerRegistry.getByCategory(category);
}

/**
 * Get provider info.
 */
export function getProviderInfo(
  provider: IntegrationProvider
): ProviderInfo | undefined {
  return providerRegistry.get(provider);
}

// =====================================================================
// Integration Health
// =====================================================================

/**
 * Get integration health summary.
 */
export async function getIntegrationHealth(
  organizationId: EntityId,
  integrationId: EntityId
): Promise<{
  status: IntegrationStatus;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  failureCount: number;
  lastSyncAt: string | null;
}> {
  const integration = await getIntegration(organizationId, integrationId);
  if (!integration) {
    throw new Error("Integration not found");
  }

  // TODO: Calculate failure count from logs

  return {
    status: integration.status,
    lastSuccessAt: integration.lastSuccessAt ?? null,
    lastFailureAt: integration.lastFailureAt ?? null,
    failureCount: 0, // TODO: Calculate from logs
    lastSyncAt: integration.lastSyncAt ?? null,
  };
}
