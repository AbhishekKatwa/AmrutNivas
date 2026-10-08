# Business Configuration, Policies & Rules (Prompt #25)

## Overview

Centralized configuration layer for AMRUT NIVAAS — one canonical service that lets each
hospitality business define how its operations work while the platform maintains one
consistent underlying architecture.

## Architecture

### Configuration Hierarchy

```
Platform → Organization → Property → Outlet → Department
```

**Resolution:** most specific configured value wins, falling back to platform defaults.

### Core Concepts

| Concept | Purpose |
|---------|---------|
| `SettingDefinition` | Metadata for a setting (key, type, scope, validation, sensitivity) |
| `SettingValue` | Actual value at a specific scope |
| `EffectiveValue` | Resolved value following hierarchy |
| `ConfigurationAudit` | Change history with actor, reason, timestamp |
| `ApprovalPolicy` | Lightweight configurable approval rules |

### Setting Categories (17)

| Category | Examples |
|----------|---------|
| General | Date format, time format, timezone, currency |
| Business | Business day start time |
| Restaurant | Discount policies, void reasons, table operations, KOT |
| Hotel | Check-in/out times, early/late policies, walk-in |
| Inventory | Negative stock, wastage reasons, costing method |
| Procurement | Purchase requests, PO approval, thresholds |
| Finance | Tax inclusive, expense approval, backdated transactions |
| CRM | Customer requirements, feedback, loyalty |
| Events | Quotation approval, advance payment |
| HR | Attendance correction, late threshold |
| Commerce | Online ordering, QR ordering, public menu |
| Notifications | Reservation, low stock, document expiry |
| Documents | Auto-generate invoice/receipt |
| Security | Session timeout, support access |
| Integrations | Third-party connection settings |
| AI | AI features, recommendations |
| Enterprise | Central reporting, central procurement |

### Data Types

- `BOOLEAN` — toggle on/off
- `STRING` — free text
- `INTEGER` — whole numbers
- `DECIMAL` — decimal numbers
- `ENUM` — fixed set of values
- `JSON` — structured data

### Sensitivity Levels

| Level | Description |
|-------|-------------|
| `NORMAL` | Standard operational settings |
| `SENSITIVE` | Financial, approval, policy settings |
| `CRITICAL` | Security, immutability, backdated transactions |

## Domain Layer

### Files

| File | Purpose |
|------|---------|
| `src/domain/settings/types.ts` | Core domain types |
| `src/domain/settings/setting-definitions.ts` | Registry of ~60 settings |
| `src/domain/settings/configuration-service.ts` | Effective value resolution, CRUD, validation, audit |
| `src/domain/settings/index.ts` | Barrel export |

### Configuration Service API

```typescript
// Effective value resolution
getEffectiveValue(key, scopeContext): EffectiveValue
getEffectiveBoolean(key, scopeContext): boolean
getEffectiveNumber(key, scopeContext): number
getEffectiveString(key, scopeContext): string

// CRUD
setSettingValue(params): SetSettingResult
getSettingValue(key, scope, ctx): SettingValue | null
getSettingsForCategory(category, ctx): SettingEntry[]

// Validation
validateSettingValue(def, value): string | null

// Audit
getConfigurationAuditLog(params): ConfigurationAudit[]
getSettingHistory(key, ctx): ConfigurationAudit[]

// Health
checkConfigurationHealth(ctx): ConfigurationHealth[]

// Search
searchSettings(query): SettingDefinition[]

// Rollback
rollbackSetting(auditId, actorId, ctx): SetSettingResult
```

### Scope Context

```typescript
type ScopeContext = {
  organizationId: EntityId;
  propertyId?: EntityId | null;
  outletId?: EntityId | null;
  departmentId?: EntityId | null;
};
```

## UI

### Settings Page (`/settings`)

- Category sidebar navigation (17 categories)
- Search bar for cross-category search
- Setting rows with inline editing
- Sensitivity badges (NORMAL/SENSITIVE/CRITICAL)
- Effective value source display
- Change history modal with rollback
- Reason field for sensitive/critical settings

### Reusable Components

- `SettingRow` — displays one setting with edit/history actions
- `SettingEditor` — type-aware editor (boolean toggle, enum select, number input, text input)
- `SearchResults` — cross-category search results
- `HistoryPanel` — modal with change history and rollback

## Permissions

| Permission | Description |
|-----------|-------------|
| `settings.view` | View business configuration |
| `settings.edit` | Edit settings |
| `settings.edit_sensitive` | Edit sensitive settings |
| `settings.edit_critical` | Edit critical settings |
| `settings.view_audit` | View change history |
| `settings.rollback` | Rollback to previous values |

## Key Design Decisions

### D-50: Settings never bypass permissions
A setting controls *how* an operation behaves, not *who* can perform it. RBAC and
subscription entitlements remain authoritative.

### D-51: Settings never bypass state machines
A configuration cannot permit an operation the domain state machine forbids. Example:
`allowVoidAfterPayment = true` does not override the order state machine if payment
finalizes the order.

### D-52: Financial immutability preserved
`allowBackdatedTransactions` and `backdatedTransactionLimitDays` are CRITICAL sensitivity
and require a reason. Locked financial periods remain protected regardless of settings.

### D-53: No generic workflow engine
Approval policies are lightweight threshold rules, not a BPM system. Each domain
service evaluates its own policies using the existing approval infrastructure.

### D-54: Configuration is metadata-driven
Only approved settings exist in the registry. Arbitrary key-value storage is not
supported. Every setting has validation, scope, and sensitivity metadata.

### D-55: Historical consistency
Settings changes do not rewrite historical records. A discount policy change today
does not alter yesterday's bills.

## Integration Points

### Domain Services
Domain services call `getEffectiveValue()` or `getEffectiveBoolean()` to resolve
configuration at runtime. Example:

```typescript
const requireManagerDiscount = getEffectiveBoolean(
  "restaurant.requireManagerForDiscount",
  scopeContext,
);
```

### Existing Modules
- Restaurant: discount policies, void reasons, table operations
- Hotel: check-in/out times, early/late policies
- Inventory: negative stock, wastage reasons, costing method
- Procurement: approval thresholds
- Finance: tax, expense approval, backdated transactions
- CRM: customer requirements, loyalty
- Events: quotation approval, advance payment
- HR: attendance correction, late threshold
- Commerce: online ordering, QR ordering
- Security: session timeout, support access

### Audit Integration
All configuration changes are audited with:
- Setting key
- Old value → New value
- Scope (org/property/outlet/department)
- Actor
- Reason (required for sensitive/critical)
- Timestamp

## Configuration Health

The `checkConfigurationHealth()` function validates all active settings:
- `OK` — valid value
- `INVALID` — value fails validation
- `MISSING` — no value configured (using default)
- `CONFLICT` — cross-setting validation failure

## Cross-Setting Validation

Some settings depend on each other:
- `negativeStockRequiresApproval = true` requires `negativeStockAllowed = true`
- `cashReconciliationRequired = true` requires `cashDrawerEnabled = true`

These relationships are validated in `checkConfigurationHealth()`.

## Future Work

- Database persistence (currently in-memory)
- Configuration templates (starter configs for business types)
- Copy configuration across properties
- Bulk import/export
- Configuration preview before apply
- Approval workflow for critical settings changes
