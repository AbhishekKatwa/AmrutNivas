# Enterprise Multi-Property, Group Management & Consolidation

**Prompt #15** | Phase 9: Enterprise | Migration 045

Enterprise adds organization-wide visibility and control on top of the existing operational modules (Restaurant, Hotel, Inventory, Procurement, Finance, CRM, Events, HR, Commerce). It aggregates property-level data into group-wide views but never replaces the operational modules themselves.

---

## Core Concepts

### Property Groups

Optional clustering of properties within an organization. A single-property restaurant never needs a group; a chain with 50 locations uses groups to organize by region, brand, or business unit.

- **Optional**: A property can exist without a group (nullable FK)
- **Single assignment**: A property belongs to at most one group
- **Org-scoped**: Groups are scoped to the organization under RLS
- **Status-aware**: Groups have ACTIVE/INACTIVE/ARCHIVED status like properties

### Module Configuration

Per-property enable/disable of operational modules. Disabling a module hides it from the UI but never deletes data. This allows:

- Rolling out modules gradually across properties
- Hiding unused modules for specific properties
- Maintaining data integrity while controlling UI complexity

**Default behavior**: A missing config row means "enabled" (opt-out model).

### Enterprise Aggregation

Enterprise screens read from the same tables operational screens write to. They aggregate counts, metrics, and alerts across properties but never create duplicate ledgers or replace module-level services.

---

## Database Schema (Migration 045)

### Extended Property Status

The `properties.status` CHECK now includes six values:

- `ACTIVE` — operational
- `INACTIVE` — not operational
- `TEMPORARILY_CLOSED` — short-term closure (renovation, seasonal)
- `COMING_SOON` — pre-opening
- `SUSPENDED` — administrative hold
- `ARCHIVED` — retired (excluded from default reads)

### Extended Property Type

Added `MIXED_HOSPITALITY` to `properties.property_type` for properties that combine hotel and restaurant operations.

### New Tables

#### `property_groups`

```sql
CREATE TABLE property_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  code text NOT NULL,
  description text,
  status site_status NOT NULL DEFAULT 'ACTIVE',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);
```

#### `property_module_config`

```sql
CREATE TABLE property_module_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id),
  module text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, module)
);
```

#### `properties.property_group_id`

Nullable FK from `properties` to `property_groups` with `ON DELETE SET NULL`.

### RLS Policies

Both new tables are org-scoped under RLS:

- `property_groups`: organization members can SELECT; writes require `enterprise.group.manage`
- `property_module_config`: organization members can SELECT; writes require `enterprise.module_config.manage`

### Permissions

14 new permission keys in the `enterprise` domain:

- `enterprise.view` — base enterprise access
- `enterprise.dashboard.view` — command center
- `enterprise.reporting.view` / `enterprise.reporting.export` — consolidated reports
- `enterprise.property.view` / `enterprise.property.manage` — property portfolio
- `enterprise.group.view` / `enterprise.group.manage` — property groups
- `enterprise.alerts.view` — attention center
- `enterprise.global_search.view` — cross-property search
- `enterprise.master.view` / `enterprise.master.manage` — organization templates
- `enterprise.module_config.view` / `enterprise.module_config.manage` — module configuration

Granted to `MASTER_ADMIN`, `ORG_OWNER`, and `PROPERTY_MANAGER` roles.

### Doors (Security-Definer RPCs)

Four new doors for enterprise writes:

1. **`create_property_group`** — creates a group, emits `property_group.created` audit event
2. **`update_property_group`** — updates group name/description/status, emits `property_group.updated`
3. **`set_property_group`** — assigns a property to a group (or removes from group), emits `property.group_changed`
4. **`set_property_module`** — enables/disables a module for a property, emits `property_module.configured`

All doors check permissions, validate inputs, and enforce org-scoping.

---

## Client Architecture

### Domain Types (`src/domain/enterprise/types.ts`)

- `PropertyStatus` — six-value union matching the database CHECK
- `ModuleName` — nine modules (RESTAURANT, HOTEL, INVENTORY, PROCUREMENT, FINANCE, CRM, EVENTS, HR, COMMERCE)
- `PropertyGroup` — mirrors the `property_groups` table
- `PropertyModuleConfig` — mirrors the `property_module_config` table
- `PropertyWithGroup` — property with resolved group name/code for enterprise views
- `PropertyMetric` — aggregated metrics for comparison (revenue, orderCount, occupancy, adr, etc.)
- `AlertSeverity` / `EnterpriseAlert` — attention center types

### Service Layer (`src/domain/enterprise/enterprise-service.ts`)

Reads and writes for enterprise operations:

- `listPropertyGroups(scope)` — list all groups for an organization
- `getPropertyGroup(id, scope)` — get a single group
- `createPropertyGroup(input)` — create a group via door
- `updatePropertyGroup(input)` — update a group via door
- `setPropertyGroup(propertyId, groupId)` — assign property to group via door
- `listPropertyModuleConfig(propertyId, scope)` — list module config for a property
- `setPropertyModule(propertyId, module, enabled)` — enable/disable module via door
- `listPropertiesWithGroups(scope)` — list properties with group association resolved
- `isModuleEnabled(config, module)` — helper to check if a module is enabled (missing = enabled)

All reads use RLS-scoped Supabase queries; all writes go through 045 doors.

### UI Pages (`src/pages/enterprise/`)

Six enterprise screens:

1. **EnterpriseOverviewPage** — Command Center with property/group counts and quick actions
2. **EnterprisePropertiesPage** — Portfolio view with group management (create/edit groups, assign properties)
3. **EnterpriseAttentionPage** — Cross-property alerts (placeholder; aggregation logic pending)
4. **EnterpriseSearchPage** — Cross-property search (placeholder; search logic pending)
5. **EnterpriseReportsPage** — Consolidated reports (placeholder; report generation pending)
6. **OrgSettingsPage** — Module configuration matrix (property × module enabled/disabled)

All pages follow the standard pattern: bootstrap → status check → permission gate → data load → render.

### Navigation & Routes

Enterprise nav group added to `src/app/navigation.ts` with six items (all `available: true`, phase 9).

Routes added to `src/app/routes.ts`:

- `/enterprise` → EnterpriseOverviewPage (`enterprise.view`)
- `/enterprise/properties` → EnterprisePropertiesPage (`enterprise.property.view`)
- `/enterprise/attention` → EnterpriseAttentionPage (`enterprise.alerts.view`)
- `/enterprise/search` → EnterpriseSearchPage (`enterprise.global_search.view`)
- `/enterprise/reports` → EnterpriseReportsPage (`enterprise.reporting.view`)
- `/enterprise/settings` → OrgSettingsPage (`enterprise.module_config.view`)

### Context Switcher

The header context switcher (`src/app/ContextSwitcher.tsx`) was simplified to remove incomplete grouping code. The property list remains flat; group visualization is handled by the enterprise Properties page.

---

## Key Design Decisions

### 1. Enterprise Aggregates, Never Replaces

Enterprise screens read from the same tables operational screens write to. They never create duplicate ledgers, replace module-level services, or introduce parallel data flows. A property's restaurant orders are still in `orders`; the enterprise dashboard just counts them across properties.

### 2. Module Configuration Controls Visibility, Not Data

Disabling a module hides it from the UI but never deletes data. This allows:

- Rolling out modules gradually
- Hiding unused modules for specific properties
- Re-enabling modules later with all data intact

### 3. Property Groups Are Optional

A single-property restaurant never needs a group. The FK is nullable, and the UI shows "Ungrouped" for properties without a group. This avoids forcing small operations into an enterprise structure they don't need.

### 4. Default-Enabled Modules

A missing `property_module_config` row means "enabled" (opt-out model). This reduces boilerplate for new properties and avoids the "why is everything disabled?" problem.

### 5. Org-Scoped Under RLS

All enterprise data is org-scoped. A property manager can only see their property's data; an org owner sees all properties in their organization. Cross-organization aggregation is a platform-level concern (future work).

---

## Current State

**Implemented**:

- SQL migration 045 (applied to hosted Supabase)
- Client domain types and service layer
- Four doors (create_property_group, update_property_group, set_property_group, set_property_module)
- 14 enterprise permissions
- Six enterprise UI pages (overview, properties, attention, search, reports, settings)
- Navigation and route wiring
- Typecheck and build validation

**Placeholder screens** (structure in place, aggregation logic pending):

- Attention Center — needs alert aggregation from operational modules
- Enterprise Search — needs cross-property search implementation
- Consolidated Reports — needs report generation logic

**Future work**:

- Property comparison views (side-by-side metrics)
- Organization-level master data templates (menu categories, room types, inventory items)
- Property onboarding workflow (guided setup for new properties)
- Cross-property alerts aggregation (low stock, overdue tasks, compliance)
- Consolidated report generation (revenue by property, occupancy comparison, inventory valuation)
- Platform-level cross-organization aggregation (for the SaaS operator)

---

## Validation

- **Typecheck**: `npx tsc --noEmit` — PASS
- **Build**: `npm run build` — PASS (2192 modules, 1.4 MB bundle)
- **Navigation**: 6 enterprise routes registered, all `available: true`
- **Permissions**: 14 enterprise keys in PERMISSION_CATALOGUE
- **Doors**: 4 enterprise doors in CLIENT_DOORS

---

## References

- Prompt #15 specification (fa29e61c-0824-43e5-934b-0eb001552aa9.txt)
- Migration 045: `db/supabase/045_enterprise_foundation.sql`
- Domain types: `src/domain/enterprise/types.ts`
- Service layer: `src/domain/enterprise/enterprise-service.ts`
- UI pages: `src/pages/enterprise/*.tsx`
- Navigation: `src/app/navigation.ts` (Enterprise group)
- Routes: `src/app/routes.ts` (6 enterprise routes)
