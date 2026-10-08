/**
 * Platform Admin domain types (Prompt #22).
 *
 * Platform Admin operates the AMRUT NIVAAS SaaS platform itself — managing organizations,
 * subscriptions, support, system health, security incidents, and platform configuration.
 * This is separate from Organization Owner who operates within their organization.
 *
 * Key principles:
 * - Platform Admin must NOT automatically access customer business data
 * - Support access is time-limited, scoped, and audited
 * - All sensitive operations are audited
 */

import type { EntityId } from "@/domain/identity/types";

// ============================================================================
// Platform Roles
// ============================================================================

export type PlatformRoleCode =
  | "PLATFORM_SUPER_ADMIN"
  | "PLATFORM_ADMIN"
  | "PLATFORM_SUPPORT"
  | "PLATFORM_OPERATIONS"
  | "PLATFORM_FINANCE"
  | "PLATFORM_SECURITY"
  | "PLATFORM_READ_ONLY";

export type PlatformRole = {
  id: EntityId;
  code: PlatformRoleCode;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PlatformPermission =
  | "platform.dashboard.view"
  | "platform.organization.view"
  | "platform.organization.manage"
  | "platform.organization.suspend"
  | "platform.organization.archive"
  | "platform.user.view"
  | "platform.user.manage"
  | "platform.subscription.view"
  | "platform.subscription.manage"
  | "platform.plan.view"
  | "platform.plan.manage"
  | "platform.billing.view"
  | "platform.billing.manage"
  | "platform.support.view"
  | "platform.support.manage"
  | "platform.support.impersonate"
  | "platform.health.view"
  | "platform.integration.view"
  | "platform.integration.manage"
  | "platform.webhook.view"
  | "platform.security.view"
  | "platform.security.manage"
  | "platform.incident.view"
  | "platform.incident.manage"
  | "platform.audit.view"
  | "platform.audit.export"
  | "platform.announcement.view"
  | "platform.announcement.manage"
  | "platform.configuration.view"
  | "platform.configuration.manage"
  | "platform.analytics.view"
  | "platform.analytics.export";

// ============================================================================
// Support Cases
// ============================================================================

export type SupportCaseCategory =
  | "ACCOUNT"
  | "BILLING"
  | "SUBSCRIPTION"
  | "RESTAURANT"
  | "HOTEL"
  | "INVENTORY"
  | "PROCUREMENT"
  | "FINANCE"
  | "CRM"
  | "EVENTS"
  | "HR"
  | "COMMERCE"
  | "INTEGRATION"
  | "API"
  | "SECURITY"
  | "DATA"
  | "OTHER";

export type SupportCasePriority = "LOW" | "NORMAL" | "HIGH" | "URGENT" | "CRITICAL";

export type SupportCaseStatus =
  | "OPEN"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "WAITING_FOR_CUSTOMER"
  | "WAITING_INTERNAL"
  | "RESOLVED"
  | "CLOSED";

export type SupportCase = {
  id: EntityId;
  organizationId: EntityId | null;
  propertyId: EntityId | null;
  outletId: EntityId | null;
  requesterId: EntityId | null;
  title: string;
  description: string;
  category: SupportCaseCategory;
  priority: SupportCasePriority;
  status: SupportCaseStatus;
  assignedTo: EntityId | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

export type SupportCaseNoteVisibility = "INTERNAL" | "CUSTOMER_VISIBLE";

export type SupportCaseNote = {
  id: EntityId;
  caseId: EntityId;
  authorId: EntityId;
  content: string;
  visibility: SupportCaseNoteVisibility;
  createdAt: string;
};

// ============================================================================
// Support Access Sessions
// ============================================================================

export type SupportAccessScope =
  | "ORGANIZATION"
  | "PROPERTY"
  | "OUTLET"
  | "READ_ONLY"
  | "SPECIFIC_MODULE";

export type SupportAccessSession = {
  id: EntityId;
  platformAdminId: EntityId;
  organizationId: EntityId;
  propertyId: EntityId | null;
  outletId: EntityId | null;
  reason: string;
  scope: SupportAccessScope;
  module: string | null;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
};

// ============================================================================
// Security Incidents
// ============================================================================

export type SecurityIncidentSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type SecurityIncidentCategory =
  | "ACCOUNT_COMPROMISE"
  | "UNAUTHORIZED_ACCESS"
  | "API_ABUSE"
  | "DATA_EXPOSURE"
  | "PAYMENT_SECURITY"
  | "WEBHOOK_SECURITY"
  | "CREDENTIAL_LEAK"
  | "SUSPICIOUS_ACTIVITY"
  | "OTHER";

export type SecurityIncidentStatus =
  | "OPEN"
  | "INVESTIGATING"
  | "CONTAINED"
  | "RESOLVED"
  | "CLOSED";

export type SecurityIncident = {
  id: EntityId;
  organizationId: EntityId | null;
  severity: SecurityIncidentSeverity;
  category: SecurityIncidentCategory;
  status: SecurityIncidentStatus;
  title: string;
  description: string | null;
  detectedAt: string;
  assignedTo: EntityId | null;
  resolvedAt: string | null;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
};

// ============================================================================
// Platform Announcements
// ============================================================================

export type AnnouncementSeverity = "INFO" | "NOTICE" | "WARNING" | "CRITICAL";

export type AnnouncementStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

export type AnnouncementTargetAudience =
  | "ALL"
  | "PLAN"
  | "ORGANIZATION_TYPE"
  | "PROPERTY_TYPE"
  | "SPECIFIC_ORGANIZATIONS";

export type PlatformAnnouncement = {
  id: EntityId;
  title: string;
  message: string;
  severity: AnnouncementSeverity;
  status: AnnouncementStatus;
  targetAudience: AnnouncementTargetAudience;
  targetOrganizations: EntityId[] | null;
  startAt: string;
  endAt: string | null;
  createdBy: EntityId;
  createdAt: string;
  updatedAt: string;
};

// ============================================================================
// Feature Flags
// ============================================================================

export type FeatureFlagTargetType = "GLOBAL" | "PLAN" | "ORGANIZATION" | "PROPERTY";

export type FeatureFlagEnvironment = "development" | "staging" | "production";

export type FeatureFlag = {
  id: EntityId;
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  environment: FeatureFlagEnvironment;
  targetType: FeatureFlagTargetType;
  targetReference: string | null;
  createdAt: string;
  updatedAt: string;
};

// ============================================================================
// Data Export/Deletion Requests
// ============================================================================

export type DataExportRequestStatus =
  | "REQUESTED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "EXPIRED";

export type DataExportRequest = {
  id: EntityId;
  organizationId: EntityId;
  requesterId: EntityId;
  reason: string;
  status: DataExportRequestStatus;
  dataScope: Record<string, unknown>;
  fileUrl: string | null;
  expiresAt: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type DataDeletionRequestStatus =
  | "REQUESTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "SCHEDULED"
  | "COMPLETED"
  | "CANCELLED";

export type DataDeletionRequest = {
  id: EntityId;
  organizationId: EntityId;
  requesterId: EntityId;
  reason: string;
  status: DataDeletionRequestStatus;
  dataScope: Record<string, unknown>;
  reviewerId: EntityId | null;
  reviewNotes: string | null;
  reviewedAt: string | null;
  scheduledFor: string | null;
  createdAt: string;
  completedAt: string | null;
};

// ============================================================================
// Platform Configuration
// ============================================================================

export type PlatformConfiguration = {
  id: EntityId;
  key: string;
  value: Record<string, unknown>;
  description: string | null;
  updatedAt: string;
  updatedBy: EntityId;
};

// ============================================================================
// Platform Dashboard Metrics
// ============================================================================

export type PlatformDashboardMetrics = {
  organizations: {
    total: number;
    active: number;
    trialing: number;
    pastDue: number;
    suspended: number;
    cancelled: number;
    newThisMonth: number;
  };
  subscriptions: {
    active: number;
    trialing: number;
    pastDue: number;
    cancelled: number;
    mrr: number;
    arr: number;
    arpa: number;
  };
  users: {
    total: number;
    active: number;
  };
  properties: {
    total: number;
  };
  outlets: {
    total: number;
  };
  revenue: {
    mrr: number;
    arr: number;
  };
  supportCases: {
    open: number;
    urgent: number;
  };
  securityIncidents: {
    open: number;
    critical: number;
  };
  supportAccess: {
    activeSessions: number;
  };
  integrations: {
    failed: number;
  };
  health: {
    apiHealthy: boolean;
    databaseHealthy: boolean;
    integrationFailures: number;
    webhookFailures: number;
  };
};
