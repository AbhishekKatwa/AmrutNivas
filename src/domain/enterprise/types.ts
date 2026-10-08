/**
 * Enterprise multi-property types (Prompt #15).
 *
 * Enterprise sits ABOVE operational modules. It aggregates property-level data
 * into group-wide views but never replaces the operational modules themselves.
 * The hierarchy remains: Organization → Property → Outlet → Department.
 * Property groups are an optional clustering layer between org and property.
 *
 * Key rules:
 *   - Property groups are optional. A single-property restaurant never needs one.
 *   - A property belongs to at most one group (nullable FK).
 *   - Module configuration controls visibility, never deletes data.
 *   - All enterprise data is org-scoped under RLS.
 */

import type { EntityId, SiteStatus } from "@/domain/identity/types";

/**
 * Extended property status for enterprise visibility.
 * The original three (ACTIVE, INACTIVE, ARCHIVED) are joined by more specific
 * statuses that help the enterprise dashboard surface property state.
 */
export type PropertyStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "TEMPORARILY_CLOSED"
  | "COMING_SOON"
  | "SUSPENDED"
  | "ARCHIVED";

export const PROPERTY_STATUSES: readonly PropertyStatus[] = [
  "ACTIVE",
  "INACTIVE",
  "TEMPORARILY_CLOSED",
  "COMING_SOON",
  "SUSPENDED",
  "ARCHIVED",
];

/**
 * Modules that can be enabled/disabled per property.
 * Disabling a module hides it from the UI but never deletes data.
 */
export type ModuleName =
  | "RESTAURANT"
  | "HOTEL"
  | "INVENTORY"
  | "PROCUREMENT"
  | "FINANCE"
  | "CRM"
  | "EVENTS"
  | "HR"
  | "COMMERCE";

export const MODULE_NAMES: readonly ModuleName[] = [
  "RESTAURANT",
  "HOTEL",
  "INVENTORY",
  "PROCUREMENT",
  "FINANCE",
  "CRM",
  "EVENTS",
  "HR",
  "COMMERCE",
];

/**
 * A property group: optional clustering of properties within an organization.
 * Mirrors the `property_groups` table (045).
 */
export type PropertyGroup = {
  id: EntityId;
  organizationId: EntityId;
  name: string;
  code: string;
  description: string | null;
  status: SiteStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
};

/**
 * A property's module configuration row.
 * Mirrors the `property_module_config` table (045).
 * A missing row for a module means "use org default" (typically enabled).
 */
export type PropertyModuleConfig = {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  module: ModuleName;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * A property with its group association resolved.
 * Used by enterprise views that need to show the group name alongside the property.
 */
export type PropertyWithGroup = {
  id: EntityId;
  organizationId: EntityId;
  name: string;
  code: string;
  type: string;
  status: string;
  city: string | null;
  state: string | null;
  country: string;
  propertyGroupId: EntityId | null;
  propertyGroupName: string | null;
  propertyGroupCode: string | null;
};

/**
 * Aggregated metric for enterprise dashboards.
 * Used by property comparison and command center views.
 */
export type PropertyMetric = {
  propertyId: EntityId;
  propertyName: string;
  propertyType: string;
  /** Total revenue across all modules for the date range. */
  revenue: bigint;
  /** Total orders/transactions. */
  orderCount: number;
  /** Hotel-specific: occupancy percentage (0-100), null if not a hotel. */
  occupancy: number | null;
  /** Hotel-specific: average daily rate, null if not a hotel. */
  adr: bigint | null;
  /** Restaurant-specific: average order value. */
  averageOrderValue: bigint | null;
  /** Event-specific: pipeline value (quoted but not yet confirmed). */
  eventPipelineValue: bigint | null;
  /** Inventory value at cost. */
  inventoryValue: bigint | null;
};

/**
 * Alert severity for the attention center.
 */
export type AlertSeverity = "INFO" | "WARNING" | "HIGH" | "CRITICAL";

/**
 * An actionable alert from any operational module.
 * The attention center aggregates these across all properties.
 */
export type EnterpriseAlert = {
  id: string;
  severity: AlertSeverity;
  module: string;
  propertyId: EntityId;
  propertyName: string;
  title: string;
  description: string;
  /** Route to the source screen for drill-down. */
  actionRoute: string;
  createdAt: string;
};
