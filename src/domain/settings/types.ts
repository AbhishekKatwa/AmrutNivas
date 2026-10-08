/**
 * Business Configuration domain types (Prompt #25).
 *
 * Centralized configuration system for AMRUT NIVAAS — one canonical service
 * for all business settings, policies, and operational rules.
 *
 * Key concepts:
 *   - SettingDefinition: metadata for a configurable setting (key, type, scope, validation)
 *   - SettingValue: actual value at a specific scope (org/property/outlet/department)
 *   - EffectiveValue: resolved value following hierarchy (most specific wins)
 *   - SettingCategory: logical grouping (General, Restaurant, Hotel, Inventory, etc.)
 *   - ConfigurationAudit: change history with actor, reason, timestamp
 *
 * Configuration hierarchy:
 *   Platform → Organization → Property → Outlet → Department
 *
 * Resolution: most specific configured value wins, falling back to defaults.
 */

import type { EntityId } from "@/domain/identity/types";

// =================================================================== setting categories

export type SettingCategory =
  | "GENERAL"
  | "BUSINESS"
  | "RESTAURANT"
  | "HOTEL"
  | "INVENTORY"
  | "PROCUREMENT"
  | "FINANCE"
  | "CRM"
  | "EVENTS"
  | "HR"
  | "COMMERCE"
  | "NOTIFICATIONS"
  | "DOCUMENTS"
  | "SECURITY"
  | "INTEGRATIONS"
  | "AI"
  | "ENTERPRISE";

export const SETTING_CATEGORIES: readonly SettingCategory[] = [
  "GENERAL",
  "BUSINESS",
  "RESTAURANT",
  "HOTEL",
  "INVENTORY",
  "PROCUREMENT",
  "FINANCE",
  "CRM",
  "EVENTS",
  "HR",
  "COMMERCE",
  "NOTIFICATIONS",
  "DOCUMENTS",
  "SECURITY",
  "INTEGRATIONS",
  "AI",
  "ENTERPRISE",
];

// =================================================================== setting data types

export type SettingDataType =
  | "BOOLEAN"
  | "STRING"
  | "INTEGER"
  | "DECIMAL"
  | "ENUM"
  | "JSON";

// =================================================================== setting scope

export type SettingScope =
  | "PLATFORM"
  | "ORGANIZATION"
  | "PROPERTY"
  | "OUTLET"
  | "DEPARTMENT";

export const SETTING_SCOPES: readonly SettingScope[] = [
  "PLATFORM",
  "ORGANIZATION",
  "PROPERTY",
  "OUTLET",
  "DEPARTMENT",
];

// =================================================================== setting sensitivity

export type SettingSensitivity = "NORMAL" | "SENSITIVE" | "CRITICAL";

// =================================================================== setting status

export type SettingStatus = "ACTIVE" | "DEPRECATED" | "EXPERIMENTAL";

// =================================================================== setting definition

export type SettingDefinition = {
  key: string;
  name: string;
  description: string;
  category: SettingCategory;
  dataType: SettingDataType;
  defaultValue: unknown;
  scope: SettingScope[];
  validation?: SettingValidation;
  enumValues?: readonly string[];
  sensitivity: SettingSensitivity;
  status: SettingStatus;
  requiresReason: boolean;
};

export type SettingValidation = {
  min?: number;
  max?: number;
  pattern?: string;
  required?: boolean;
};

// =================================================================== setting value

export type SettingValue = {
  settingKey: string;
  organizationId?: EntityId;
  propertyId?: EntityId;
  outletId?: EntityId;
  departmentId?: EntityId;
  value: unknown;
  updatedBy: EntityId;
  updatedAt: string;
  reason?: string;
};

// =================================================================== effective value

export type EffectiveValue = {
  settingKey: string;
  value: unknown;
  source: SettingScope;
  sourceId?: EntityId;
};

// =================================================================== configuration audit

export type ConfigurationAudit = {
  id: string;
  settingKey: string;
  organizationId?: EntityId;
  propertyId?: EntityId;
  outletId?: EntityId;
  departmentId?: EntityId;
  oldValue: unknown;
  newValue: unknown;
  changedBy: EntityId;
  changedAt: string;
  reason?: string;
  scope: SettingScope;
};

// =================================================================== configuration health

export type ConfigurationHealth = {
  settingKey: string;
  status: "OK" | "MISSING" | "INVALID" | "CONFLICT";
  message?: string;
};

// =================================================================== approval policy

export type ApprovalPolicy = {
  id: string;
  organizationId: EntityId;
  propertyId?: EntityId;
  outletId?: EntityId;
  resourceType: string;
  condition: ApprovalCondition;
  approverRole: string;
  status: "ACTIVE" | "INACTIVE";
};

export type ApprovalCondition = {
  field: string;
  operator: "GREATER_THAN" | "LESS_THAN" | "EQUALS" | "GREATER_EQUAL" | "LESS_EQUAL";
  threshold: number;
};

// =================================================================== business hours

export type BusinessHours = {
  id: string;
  organizationId: EntityId;
  propertyId?: EntityId;
  outletId?: EntityId;
  dayOfWeek: number; // 0 = Sunday, 6 = Saturday
  periods: BusinessHoursPeriod[];
  isClosed: boolean;
};

export type BusinessHoursPeriod = {
  open: string; // HH:mm
  close: string; // HH:mm
};

// =================================================================== numbering configuration

export type NumberingConfig = {
  entityType: string;
  prefix: string;
  sequence: number;
  padding: number;
  resetFrequency: "NEVER" | "DAILY" | "MONTHLY" | "YEARLY";
  lastReset?: string;
};
