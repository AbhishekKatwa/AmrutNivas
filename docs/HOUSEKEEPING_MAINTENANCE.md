# Housekeeping, maintenance & room operations build contract

Binding conventions for Prompt #09 — the operational layer that keeps rooms sellable and the property running. Every migration, service and screen in this domain follows these rules. Where this file and an existing migration disagree, the migration wins and this file is corrected.

## 1. Four sub-domains, one property scope

Prompt #09 adds four operational sub-domains, all property-scoped (organization + property):

| Sub-domain | Table | Purpose |
|---|---|---|
| Housekeeping | `housekeeping_tasks` | Cleaning and inspection tasks for rooms |
| Maintenance | `maintenance_requests` | Repair and upkeep requests for rooms, assets and outlets |
| Lost & found | `lost_found_items` | Items found on the property, tracked until returned or disposed |
| Assets | `assets` | Physical assets (furniture, equipment) tracked by location and status |

All four use the same `{ organizationId, propertyId }` scope shape as the rest of the hotel domain.

## 2. Housekeeping task state machine

```
PENDING → ASSIGNED → IN_PROGRESS → COMPLETED → VERIFIED
                                            ↘ CANCELLED (any non-terminal)
```

- **PENDING**: task created, not yet assigned.
- **ASSIGNED**: a staff member is named; `assigned_to` is set.
- **IN_PROGRESS**: the assignee has started work; `started_at` is stamped.
- **COMPLETED**: work is done; `completed_at` is stamped. Completing a CHECKOUT_CLEAN task updates the room's housekeeping status.
- **VERIFIED**: a supervisor has inspected the work; `verified_at` and `verified_by` are stamped. For CHECKOUT_CLEAN tasks, verification sets the room to `INSPECTED`.
- **CANCELLED**: task is abandoned; a reason is recorded.

Task types: `CHECKOUT_CLEAN`, `STAYOVER_CLEAN`, `DEEP_CLEAN`, `INSPECTION`, `TURNDOWN`, `SPECIAL_REQUEST`, `OTHER`. Check-out auto-creates a `CHECKOUT_CLEAN` task.

Priority: `LOW`, `NORMAL`, `HIGH`, `URGENT`.

## 3. Maintenance request state machine

```
OPEN → ASSIGNED → IN_PROGRESS → RESOLVED → VERIFIED → CLOSED
                         ↕                        ↗
                     ON_HOLD ──────────────────→ CANCELLED (any non-terminal)
```

- **OPEN**: request reported, not yet assigned.
- **ASSIGNED**: a technician or vendor is named.
- **IN_PROGRESS**: work has started; `started_at` is stamped.
- **ON_HOLD**: work paused (waiting for parts, etc.); a reason is recorded.
- **RESOLVED**: repair is done; `resolved_at`, `resolved_by`, `resolution` and `actual_cost` are stamped.
- **VERIFIED**: the fix is confirmed; `verified_at` and `verified_by` are stamped.
- **CLOSED**: request is fully closed. If the request set the room to `OUT_OF_ORDER`, closing returns it to `ACTIVE`.
- **CANCELLED**: request is abandoned; a reason is recorded.

Categories: `ELECTRICAL`, `PLUMBING`, `HVAC`, `STRUCTURAL`, `FURNITURE`, `APPLIANCE`, `ELEVATOR`, `BOILER`, `GENERATOR`, `KITCHEN_EQUIPMENT`, `IT_EQUIPMENT`, `OTHER`.

Priority: `LOW`, `NORMAL`, `HIGH`, `URGENT`, `EMERGENCY`. High-priority and emergency requests may set the room to `OUT_OF_ORDER` on creation.

Source: `HOUSEKEEPING`, `FRONT_DESK`, `MANAGER`, `INSPECTION`, `SYSTEM`, `EMPLOYEE`, `GUEST`, `OTHER`.

## 4. Lost & found item lifecycle

```
FOUND → STORED → CLAIMED → RETURNED
                  ↘ DISPOSED (any non-terminal)
```

- **FOUND**: item just found, basic details recorded.
- **STORED**: item is in a storage location; `storage_location` is set.
- **CLAIMED**: a guest has claimed the item.
- **RETURNED**: item is returned to its owner; `returned_at` and `returned_to` are stamped.
- **DISPOSED**: item is disposed of (unclaimed after policy period, damaged beyond use, etc.).

Categories: `ELECTRONICS`, `JEWELRY`, `CLOTHING`, `DOCUMENTS`, `KEYS`, `MEDICATION`, `OTHER`.

## 5. Asset register

Assets are physical items tracked by location and status. An asset belongs to a property and optionally to a room or outlet.

Statuses: `ACTIVE`, `MAINTENANCE`, `RETIRED`, `SOLD`.

Categories: `AC`, `TV`, `REFRIGERATOR`, `WASHING_MACHINE`, `ELEVATOR`, `BOILER`, `GENERATOR`, `KITCHEN_EQUIPMENT`, `FURNITURE`, `IT_EQUIPMENT`, `OTHER`.

An asset has an `asset_code` (unique within the property), optional serial number, manufacturer, model number, purchase date and cost, and warranty end date. When an asset's status is `MAINTENANCE`, a linked maintenance request may exist.

## 6. Permission keys

Twenty-eight new permission tokens, grouped by sub-domain:

**Housekeeping (9):** `housekeeping.view`, `housekeeping.task.create`, `housekeeping.task.assign`, `housekeeping.task.start`, `housekeeping.task.complete`, `housekeeping.task.verify`, `housekeeping.task.cancel`, `housekeeping.task.own`, `housekeeping.inspect`

**Maintenance (10):** `maintenance.view`, `maintenance.create`, `maintenance.assign`, `maintenance.start`, `maintenance.resolve`, `maintenance.verify`, `maintenance.close`, `maintenance.cancel`, `maintenance.hold`, `maintenance.own`

**Room operations (3):** `room_operation.inspect`, `room_operation.toggle_status`, `room_operation.override_status`

**Lost & found (3):** `lost_found.view`, `lost_found.create`, `lost_found.return`

**Assets (3):** `asset.view`, `asset.create`, `asset.edit`

## 7. Client service layer

Four service files, one per sub-domain, all in `src/domain/hotel/`:

| Service | Key functions |
|---|---|
| `housekeeping-service.ts` | `listHousekeepingTasks`, `createHousekeepingTask`, `assignHousekeepingTask`, `startHousekeepingTask`, `completeHousekeepingTask`, `verifyHousekeepingTask`, `cancelHousekeepingTask` |
| `maintenance-service.ts` | `listMaintenanceRequests`, `createMaintenanceRequest`, `assignMaintenanceRequest`, `startMaintenanceRequest`, `resolveMaintenanceRequest`, `verifyMaintenanceRequest`, `closeMaintenanceRequest`, `cancelMaintenanceRequest`, `putMaintenanceOnHold` |
| `lost-found-service.ts` | `listLostFoundItems`, `createLostFoundItem`, `returnLostFoundItem` |
| `asset-service.ts` | `listAssets`, `createAsset`, `updateAsset` |

All services follow the established pattern: `callDoor()` / `callDoorRow()` for writes, `camelRows()` / `firstCamelRow()` with `asRead()` for reads. Every write goes through a security-definer RPC door; the client never writes to tables directly.

## 8. Screen conventions

Four pages in `src/pages/hotel/`:

| Page | Route | Permission gate |
|---|---|---|
| `HousekeepingPage` | `/hotel/housekeeping` | `housekeeping.view` |
| `MaintenancePage` | `/hotel/maintenance` | `maintenance.view` |
| `LostFoundPage` | `/hotel/lost-found` | `lost_found.view` |
| `AssetsPage` | `/hotel/assets` | `asset.view` |

Each page follows the established hotel page pattern:
- View state machine: bootstrapping → unauthenticated → unconfigured → no_property → scoped.
- `hotelScopeFor()` and `pageStatusFor()` from the context store.
- `can()` permission checks gate action buttons, not screen visibility.
- Cards list with status badges, filter chips, and state-appropriate action buttons.
- Dialogs for create and state-transition actions, using `Field` wrappers for form inputs.

## 9. Door names

Twenty new RPC door names registered in `CLIENT_DOORS` (`src/db/doors.ts`):

`create_housekeeping_task`, `assign_housekeeping_task`, `start_housekeeping_task`, `complete_housekeeping_task`, `verify_housekeeping_task`, `cancel_housekeeping_task`, `create_maintenance_request`, `assign_maintenance_request`, `start_maintenance_request`, `resolve_maintenance_request`, `verify_maintenance_request`, `close_maintenance_request`, `cancel_maintenance_request`, `put_maintenance_on_hold`, `create_room_inspection`, `complete_room_inspection`, `create_lost_found_item`, `return_lost_found_item`, `create_asset`, `update_asset`.

## 10. Cross-domain links

- **Housekeeping ↔ Rooms**: completing a CHECKOUT_CLEAN task updates the room's housekeeping status. The housekeeping screen loads rooms to resolve room numbers.
- **Maintenance ↔ Rooms**: high-priority requests may set a room to `OUT_OF_ORDER`; closing the request returns it to `ACTIVE`.
- **Maintenance ↔ Assets**: a maintenance request can reference an `asset_id` for equipment repairs.
- **Housekeeping ↔ Stays**: a housekeeping task can reference a `stay_id` to link it to a guest's visit.
- **Lost & found ↔ Guests**: a lost-found item can reference a `guest_id` when the owner is known.
- **Lost & found ↔ Rooms**: items are found in a specific room (`room_id`).
