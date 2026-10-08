/**
 * Centralized configuration service (Prompt #25).
 *
 * Single canonical service for all business settings. Resolves effective values
 * following the hierarchy: most specific scope wins, falling back to defaults.
 *
 * This service never bypasses permissions, entitlements, or state machines.
 * It only answers "what is the configured value?" — domain services decide
 * whether the operation is allowed.
 */

import type { EntityId } from "@/domain/identity/types";
import {
  SETTING_DEFINITIONS,
  getSettingDefinition,
} from "./setting-definitions";
import type {
  ConfigurationAudit,
  ConfigurationHealth,
  EffectiveValue,
  SettingCategory,
  SettingDefinition,
  SettingScope,
  SettingValue,
} from "./types";

// =================================================================== scope context

export type ScopeContext = {
  organizationId: EntityId;
  propertyId?: EntityId | null;
  outletId?: EntityId | null;
  departmentId?: EntityId | null;
};

// =================================================================== in-memory store

const settingValues = new Map<string, SettingValue>();
const auditLog: ConfigurationAudit[] = [];

function scopeKey(
  settingKey: string,
  scope: SettingScope,
  ctx: ScopeContext,
): string {
  switch (scope) {
    case "ORGANIZATION":
      return `${settingKey}|org:${ctx.organizationId}`;
    case "PROPERTY":
      return `${settingKey}|prop:${ctx.propertyId ?? "none"}`;
    case "OUTLET":
      return `${settingKey}|outlet:${ctx.outletId ?? "none"}`;
    case "DEPARTMENT":
      return `${settingKey}|dept:${ctx.departmentId ?? "none"}`;
    case "PLATFORM":
      return `${settingKey}|platform`;
  }
}

// =================================================================== effective value resolution

/**
 * Resolve the effective value for a setting in a given scope context.
 *
 * Resolution order (most specific wins):
 *   Department → Outlet → Property → Organization → Platform default
 */
export function getEffectiveValue(
  settingKey: string,
  ctx: ScopeContext,
): EffectiveValue {
  const def = getSettingDefinition(settingKey);
  if (!def) {
    return { settingKey, value: null, source: "PLATFORM" };
  }

  const scopesToCheck: SettingScope[] = [];
  if (def.scope.includes("DEPARTMENT") && ctx.departmentId) {
    scopesToCheck.push("DEPARTMENT");
  }
  if (def.scope.includes("OUTLET") && ctx.outletId) {
    scopesToCheck.push("OUTLET");
  }
  if (def.scope.includes("PROPERTY") && ctx.propertyId) {
    scopesToCheck.push("PROPERTY");
  }
  if (def.scope.includes("ORGANIZATION")) {
    scopesToCheck.push("ORGANIZATION");
  }

  for (const scope of scopesToCheck) {
    const key = scopeKey(settingKey, scope, ctx);
    const stored = settingValues.get(key);
    if (stored !== undefined) {
      return {
        settingKey,
        value: stored.value,
        source: scope,
        sourceId:
          scope === "DEPARTMENT"
            ? ctx.departmentId!
            : scope === "OUTLET"
              ? ctx.outletId!
              : scope === "PROPERTY"
                ? ctx.propertyId!
                : ctx.organizationId,
      };
    }
  }

  return { settingKey, value: def.defaultValue, source: "PLATFORM" };
}

/**
 * Type-safe effective value getter.
 */
export function getEffectiveBoolean(
  key: string,
  ctx: ScopeContext,
): boolean {
  return Boolean(getEffectiveValue(key, ctx).value);
}

export function getEffectiveNumber(
  key: string,
  ctx: ScopeContext,
): number {
  return Number(getEffectiveValue(key, ctx).value);
}

export function getEffectiveString(
  key: string,
  ctx: ScopeContext,
): string {
  return String(getEffectiveValue(key, ctx).value);
}

// =================================================================== set value

export type SetSettingParams = {
  settingKey: string;
  value: unknown;
  scope: SettingScope;
  context: ScopeContext;
  actorId: EntityId;
  reason?: string;
};

export type SetSettingResult =
  | { ok: true; audit: ConfigurationAudit }
  | { ok: false; error: string };

export function setSettingValue(params: SetSettingParams): SetSettingResult {
  const def = getSettingDefinition(params.settingKey);
  if (!def) {
    return { ok: false, error: `Unknown setting: ${params.settingKey}` };
  }

  if (!def.scope.includes(params.scope)) {
    return {
      ok: false,
      error: `Setting ${params.settingKey} does not support scope ${params.scope}`,
    };
  }

  const validationError = validateSettingValue(def, params.value);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  if (def.requiresReason && !params.reason) {
    return {
      ok: false,
      error: `Setting ${params.settingKey} requires a reason for changes`,
    };
  }

  const key = scopeKey(params.settingKey, params.scope, params.context);
  const existing = settingValues.get(key);
  const oldValue = existing?.value ?? def.defaultValue;

  const audit: ConfigurationAudit = {
    id: `cfg_audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    settingKey: params.settingKey,
    organizationId: params.context.organizationId,
    propertyId: params.context.propertyId ?? undefined,
    outletId: params.context.outletId ?? undefined,
    departmentId: params.context.departmentId ?? undefined,
    oldValue,
    newValue: params.value,
    changedBy: params.actorId,
    changedAt: new Date().toISOString(),
    reason: params.reason,
    scope: params.scope,
  };

  const settingValue: SettingValue = {
    settingKey: params.settingKey,
    organizationId: params.context.organizationId,
    propertyId: params.context.propertyId ?? undefined,
    outletId: params.context.outletId ?? undefined,
    departmentId: params.context.departmentId ?? undefined,
    value: params.value,
    updatedBy: params.actorId,
    updatedAt: audit.changedAt,
    reason: params.reason,
  };

  settingValues.set(key, settingValue);
  auditLog.push(audit);

  return { ok: true, audit };
}

// =================================================================== get values

export function getSettingValue(
  settingKey: string,
  scope: SettingScope,
  ctx: ScopeContext,
): SettingValue | null {
  const key = scopeKey(settingKey, scope, ctx);
  return settingValues.get(key) ?? null;
}

export function getSettingsForCategory(
  category: SettingCategory,
  ctx: ScopeContext,
): Array<{ definition: SettingDefinition; effective: EffectiveValue }> {
  return SETTING_DEFINITIONS.filter((d) => d.category === category).map((d) => ({
    definition: d,
    effective: getEffectiveValue(d.key, ctx),
  }));
}

// =================================================================== validation

export function validateSettingValue(
  def: SettingDefinition,
  value: unknown,
): string | null {
  if (def.dataType === "BOOLEAN" && typeof value !== "boolean") {
    return "Value must be a boolean";
  }
  if (def.dataType === "STRING" && typeof value !== "string") {
    return "Value must be a string";
  }
  if (def.dataType === "INTEGER") {
    if (typeof value !== "number" || !Number.isInteger(value)) {
      return "Value must be an integer";
    }
  }
  if (def.dataType === "DECIMAL") {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return "Value must be a number";
    }
  }
  if (def.dataType === "ENUM") {
    if (def.enumValues && !def.enumValues.includes(value as string)) {
      return `Value must be one of: ${def.enumValues.join(", ")}`;
    }
  }

  if (def.validation) {
    const num = Number(value);
    if (def.validation.min !== undefined && num < def.validation.min) {
      return `Value must be >= ${def.validation.min}`;
    }
    if (def.validation.max !== undefined && num > def.validation.max) {
      return `Value must be <= ${def.validation.max}`;
    }
    if (def.validation.pattern && typeof value === "string") {
      const re = new RegExp(def.validation.pattern);
      if (!re.test(value)) {
        return `Value does not match pattern: ${def.validation.pattern}`;
      }
    }
  }

  return null;
}

// =================================================================== audit

export function getConfigurationAuditLog(params: {
  settingKey?: string;
  organizationId?: EntityId;
  limit?: number;
}): ConfigurationAudit[] {
  let entries = [...auditLog];

  if (params.settingKey) {
    entries = entries.filter((e) => e.settingKey === params.settingKey);
  }
  if (params.organizationId) {
    entries = entries.filter(
      (e) => e.organizationId === params.organizationId,
    );
  }

  entries.sort(
    (a, b) =>
      new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime(),
  );

  if (params.limit) {
    entries = entries.slice(0, params.limit);
  }

  return entries;
}

export function getSettingHistory(
  settingKey: string,
  _ctx: ScopeContext,
): ConfigurationAudit[] {
  return auditLog
    .filter((e) => e.settingKey === settingKey)
    .sort(
      (a, b) =>
        new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime(),
    );
}

// =================================================================== health check

export function checkConfigurationHealth(
  ctx: ScopeContext,
): ConfigurationHealth[] {
  const results: ConfigurationHealth[] = [];

  for (const def of SETTING_DEFINITIONS) {
    if (def.status !== "ACTIVE") continue;

    const effective = getEffectiveValue(def.key, ctx);
    const validationError = validateSettingValue(def, effective.value);

    if (validationError) {
      results.push({
        settingKey: def.key,
        status: "INVALID",
        message: validationError,
      });
    } else {
      results.push({ settingKey: def.key, status: "OK" });
    }
  }

  return results;
}

// =================================================================== search

export function searchSettings(query: string): SettingDefinition[] {
  const lower = query.toLowerCase();
  return SETTING_DEFINITIONS.filter(
    (d) =>
      d.key.toLowerCase().includes(lower) ||
      d.name.toLowerCase().includes(lower) ||
      d.description.toLowerCase().includes(lower),
  );
}

// =================================================================== rollback

export function rollbackSetting(
  auditId: string,
  actorId: EntityId,
  ctx: ScopeContext,
): SetSettingResult {
  const audit = auditLog.find((e) => e.id === auditId);
  if (!audit) {
    return { ok: false, error: "Audit entry not found" };
  }

  return setSettingValue({
    settingKey: audit.settingKey,
    value: audit.oldValue,
    scope: audit.scope,
    context: ctx,
    actorId,
    reason: `Rollback from audit ${auditId}`,
  });
}

// =================================================================== category metadata

export type CategoryMeta = {
  key: SettingCategory;
  label: string;
  description: string;
};

export const CATEGORY_META: readonly CategoryMeta[] = [
  { key: "GENERAL", label: "General", description: "Date, time, currency, timezone" },
  { key: "BUSINESS", label: "Business", description: "Business day and operating hours" },
  { key: "RESTAURANT", label: "Restaurant", description: "Orders, discounts, tables, KOT" },
  { key: "HOTEL", label: "Hotel", description: "Check-in/out, policies, guests" },
  { key: "INVENTORY", label: "Inventory", description: "Stock, wastage, costing" },
  { key: "PROCUREMENT", label: "Procurement", description: "Purchase orders, approvals" },
  { key: "FINANCE", label: "Finance", description: "Tax, expenses, backdated transactions" },
  { key: "CRM", label: "CRM", description: "Customers, feedback, loyalty" },
  { key: "EVENTS", label: "Events", description: "Quotations, advances, bookings" },
  { key: "HR", label: "HR", description: "Attendance, leave, documents" },
  { key: "COMMERCE", label: "Commerce", description: "Online ordering, QR, public menu" },
  { key: "NOTIFICATIONS", label: "Notifications", description: "Alerts and digests" },
  { key: "DOCUMENTS", label: "Documents", description: "Auto-generation, templates" },
  { key: "SECURITY", label: "Security", description: "Sessions, support access" },
  { key: "INTEGRATIONS", label: "Integrations", description: "Third-party connections" },
  { key: "AI", label: "AI", description: "AI features and recommendations" },
  { key: "ENTERPRISE", label: "Enterprise", description: "Multi-property settings" },
];
