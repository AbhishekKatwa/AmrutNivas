/**
 * The inventory domain: items, locations, stock ledger, recipes, operations.
 *
 * Types mirror the schema's CHECK constraints. Every array must match the DB's
 * allowed values exactly — a drift is answered by the door refusing the write.
 *
 * Hierarchy: Organization → Property → Outlet → Location → (Item, Stock Ledger).
 * Recipes link menu items to ingredient formulas. Operations (wastage, adjustment,
 * transfer, stock take, consumption) post movements to the immutable ledger.
 */

import type { EntityId } from "@/domain/identity/types";

// ============================================================ units of measure

export type UnitStatus = "ACTIVE" | "ARCHIVED";

export const UNIT_STATUSES: readonly UnitStatus[] = ["ACTIVE", "ARCHIVED"];

export interface UnitOfMeasure {
  id: EntityId;
  organizationId: EntityId;
  name: string;
  code: string;
  description?: string;
  status: UnitStatus;
  createdAt: string;
  updatedAt: string;
}

export interface UnitConversion {
  id: EntityId;
  organizationId: EntityId;
  fromUnitId: EntityId;
  toUnitId: EntityId;
  factor: number;
  status: UnitStatus;
  createdAt: string;
}

// ============================================================ inventory categories

export type CategoryStatus = "ACTIVE" | "ARCHIVED";

export const CATEGORY_STATUSES: readonly CategoryStatus[] = ["ACTIVE", "ARCHIVED"];

export interface InventoryCategory {
  id: EntityId;
  organizationId: EntityId;
  name: string;
  code: string;
  description?: string;
  displayOrder: number;
  status: CategoryStatus;
  createdAt: string;
  updatedAt: string;
}

// ============================================================ inventory items

export type ItemStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";
// Mirrors the inventory_items_type_ok check in 023 — the database is the arbiter.
export type ItemType =
  | "RAW_MATERIAL"
  | "INGREDIENT"
  | "BEVERAGE"
  | "PACKAGING"
  | "CONSUMABLE"
  | "CLEANING"
  | "OTHER";

export const ITEM_STATUSES: readonly ItemStatus[] = ["ACTIVE", "INACTIVE", "ARCHIVED"];
export const ITEM_TYPES: readonly ItemType[] = [
  "RAW_MATERIAL",
  "INGREDIENT",
  "BEVERAGE",
  "PACKAGING",
  "CONSUMABLE",
  "CLEANING",
  "OTHER",
];

export interface InventoryItem {
  id: EntityId;
  organizationId: EntityId;
  name: string;
  code: string;
  categoryId?: EntityId;
  description?: string;
  itemType: ItemType;
  baseUnitId: EntityId;
  trackBatch: boolean;
  trackExpiry: boolean;
  reorderLevel?: number;
  reorderQuantity?: number;
  attributes?: Record<string, unknown>;
  status: ItemStatus;
  createdAt: string;
  updatedAt: string;
}

// ============================================================ inventory locations

export type LocationStatus = "ACTIVE" | "ARCHIVED";
export type LocationType = "STORE" | "KITCHEN" | "BAR" | "COLD_STORAGE" | "FREEZER" | "OTHER";

export const LOCATION_STATUSES: readonly LocationStatus[] = ["ACTIVE", "ARCHIVED"];
export const LOCATION_TYPES: readonly LocationType[] = [
  "STORE", "KITCHEN", "BAR", "COLD_STORAGE", "FREEZER", "OTHER"
];

export interface InventoryLocation {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  outletId?: EntityId;
  name: string;
  code: string;
  locationType: LocationType;
  description?: string;
  status: LocationStatus;
  createdAt: string;
  updatedAt: string;
}

// ============================================================ stock ledger

export type MovementType =
  | "OPENING"
  | "RECEIPT"
  | "TRANSFER_IN"
  | "TRANSFER_OUT"
  | "CONSUMPTION"
  | "WASTAGE"
  | "ADJUSTMENT_IN"
  | "ADJUSTMENT_OUT"
  | "RETURN";

export const MOVEMENT_TYPES: readonly MovementType[] = [
  "OPENING", "RECEIPT", "TRANSFER_IN", "TRANSFER_OUT",
  "CONSUMPTION", "WASTAGE", "ADJUSTMENT_IN", "ADJUSTMENT_OUT", "RETURN"
];

export const INBOUND_MOVEMENTS: readonly MovementType[] = [
  "OPENING", "RECEIPT", "TRANSFER_IN", "ADJUSTMENT_IN", "RETURN"
];

export const OUTBOUND_MOVEMENTS: readonly MovementType[] = [
  "TRANSFER_OUT", "CONSUMPTION", "WASTAGE", "ADJUSTMENT_OUT"
];

export interface StockLedger {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  outletId?: EntityId;
  locationId: EntityId;
  itemId: EntityId;
  movementType: MovementType;
  quantity: number;
  unitId: EntityId;
  unitCost?: number;
  totalCost?: number;
  avgCostAfter?: number;
  documentType?: string;
  documentId?: EntityId;
  idempotencyKey: string;
  batchNumber?: string;
  expiryDate?: string;
  reason?: string;
  notes?: string;
  createdAt: string;
  createdBy?: EntityId;
}

export interface StockBalance {
  organizationId: EntityId;
  propertyId: EntityId;
  outletId?: EntityId;
  itemId: EntityId;
  locationId: EntityId;
  unitId: EntityId;
  quantityOnHand: number;
  lastAvgCost?: number;
  lastMovementAt?: string;
}

// ============================================================ recipes

export type RecipeStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type RecipeVersionStatus = "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED";

export const RECIPE_STATUSES: readonly RecipeStatus[] = ["DRAFT", "ACTIVE", "ARCHIVED"];
export const RECIPE_VERSION_STATUSES: readonly RecipeVersionStatus[] = [
  "DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"
];

export interface Recipe {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  outletId: EntityId;
  itemId: EntityId;
  name: string;
  code: string;
  description?: string;
  yieldQuantity: number;
  yieldUnitId: EntityId;
  status: RecipeStatus;
  notes?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeVersion {
  id: EntityId;
  recipeId: EntityId;
  versionNumber: number;
  status: RecipeVersionStatus;
  yieldQuantity: number;
  yieldUnitId: EntityId;
  notes?: string;
  activatedAt?: string;
  activatedBy?: EntityId;
  createdAt: string;
}

export interface RecipeIngredient {
  id: EntityId;
  recipeVersionId: EntityId;
  itemId: EntityId;
  quantity: number;
  unitId: EntityId;
  notes?: string;
  displayOrder: number;
  createdAt: string;
}

// ============================================================ stock takes

export type StockTakeStatus = "DRAFT" | "POSTED" | "ARCHIVED";

export const STOCK_TAKE_STATUSES: readonly StockTakeStatus[] = ["DRAFT", "POSTED", "ARCHIVED"];

export interface StockTake {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  outletId?: EntityId;
  locationId: EntityId;
  countedAt: string;
  countedBy?: EntityId;
  status: StockTakeStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StockTakeLine {
  id: EntityId;
  stockTakeId: EntityId;
  itemId: EntityId;
  unitId: EntityId;
  expectedQuantity: number;
  actualQuantity: number;
  varianceQuantity: number;
  adjustmentLedgerId?: EntityId;
  notes?: string;
  createdAt: string;
}
