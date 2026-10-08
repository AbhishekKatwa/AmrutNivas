/**
 * Inventory operations: stock ledger, recipes, wastage, adjustments, transfers,
 * stock takes, consumption.
 *
 * All writes go through doors (024, 025, 026). Reads are SELECTs under RLS.
 * The stock ledger is immutable — corrections create compensating movements,
 * never edit original rows.
 */

import { requireSupabase } from "@/db/client";
import { asRead, camelRows, callDoor } from "@/db/rpc";
import type { EntityId } from "@/domain/identity/types";
import type {
  Recipe,
  RecipeIngredient,
  RecipeVersion,
  StockBalance,
  StockLedger,
  StockTake,
  StockTakeLine,
} from "./types";

const LEDGER = "stock_ledger";
const BALANCE = "stock_balance";
const RECIPES = "recipes";
const RECIPE_VERSIONS = "recipe_versions";
const RECIPE_INGREDIENTS = "recipe_ingredients";
const STOCK_TAKES = "stock_takes";
const STOCK_TAKE_LINES = "stock_take_lines";

const LEDGER_COLUMNS =
  "id, organization_id, property_id, outlet_id, location_id, item_id, movement_type, " +
  "quantity, unit_id, unit_cost, total_cost, avg_cost_after, document_type, document_id, " +
  "idempotency_key, batch_number, expiry_date, reason, notes, created_at, created_by";

const BALANCE_COLUMNS =
  "organization_id, property_id, outlet_id, item_id, location_id, unit_id, " +
  "quantity_on_hand, last_avg_cost, last_movement_at";

const RECIPE_COLUMNS =
  "id, organization_id, property_id, outlet_id, item_id, name, code, description, " +
  "yield_quantity, yield_unit_id, status, notes, version, created_at, updated_at";

const RECIPE_VERSION_COLUMNS =
  "id, recipe_id, version_number, status, yield_quantity, yield_unit_id, notes, " +
  "activated_at, activated_by, created_at";

const RECIPE_INGREDIENT_COLUMNS =
  "id, recipe_version_id, item_id, quantity, unit_id, notes, display_order, created_at";

const STOCK_TAKE_COLUMNS =
  "id, organization_id, property_id, outlet_id, location_id, counted_at, counted_by, " +
  "status, notes, created_at, updated_at";

const STOCK_TAKE_LINE_COLUMNS =
  "id, stock_take_id, item_id, unit_id, expected_quantity, actual_quantity, " +
  "variance_quantity, adjustment_ledger_id, notes, created_at";

// ============================================================ stock ledger (read-only)

export async function listStockMovements(
  organizationId: EntityId,
  filters?: {
    itemId?: EntityId;
    locationId?: EntityId;
    movementType?: string;
    fromDate?: string;
    toDate?: string;
  }
): Promise<StockLedger[]> {
  const sb = requireSupabase();
  let query = sb
    .from(LEDGER)
    .select(LEDGER_COLUMNS)
    .eq("organization_id", organizationId);

  if (filters?.itemId) query = query.eq("item_id", filters.itemId);
  if (filters?.locationId) query = query.eq("location_id", filters.locationId);
  if (filters?.movementType) query = query.eq("movement_type", filters.movementType);
  if (filters?.fromDate) query = query.gte("created_at", filters.fromDate);
  if (filters?.toDate) query = query.lte("created_at", filters.toDate);

  return camelRows<StockLedger>(asRead(query.order("created_at", { ascending: false }).limit(1000)));
}

export async function listStockBalances(
  organizationId: EntityId,
  filters?: { itemId?: EntityId; locationId?: EntityId }
): Promise<StockBalance[]> {
  const sb = requireSupabase();
  let query = sb
    .from(BALANCE)
    .select(BALANCE_COLUMNS)
    .eq("organization_id", organizationId);

  if (filters?.itemId) query = query.eq("item_id", filters.itemId);
  if (filters?.locationId) query = query.eq("location_id", filters.locationId);

  return camelRows<StockBalance>(asRead(query));
}

// ============================================================ opening stock

export async function setOpeningStock(
  organizationId: EntityId,
  propertyId: EntityId,
  outletId: EntityId | undefined,
  locationId: EntityId,
  itemId: EntityId,
  quantity: number,
  unitId: EntityId,
  unitCost: number,
  batchNumber?: string,
  expiryDate?: string
): Promise<EntityId> {
  const idempotencyKey = `OPENING:${itemId}:${locationId}:${Date.now()}`;
  return callDoor("set_opening_stock", {
    p_organization: organizationId,
    p_property: propertyId,
    p_outlet: outletId,
    p_location: locationId,
    p_item: itemId,
    p_quantity: quantity,
    p_unit: unitId,
    p_unit_cost: unitCost,
    p_batch_number: batchNumber,
    p_expiry_date: expiryDate,
    p_idempotency_key: idempotencyKey,
  });
}

// ============================================================ wastage

export async function recordWastage(
  organizationId: EntityId,
  propertyId: EntityId,
  outletId: EntityId | undefined,
  locationId: EntityId,
  itemId: EntityId,
  quantity: number,
  unitId: EntityId,
  reason: string,
  notes?: string
): Promise<EntityId> {
  const idempotencyKey = `WASTAGE:${itemId}:${locationId}:${Date.now()}`;
  return callDoor("record_wastage", {
    p_organization: organizationId,
    p_property: propertyId,
    p_outlet: outletId,
    p_location: locationId,
    p_item: itemId,
    p_quantity: quantity,
    p_unit: unitId,
    p_reason: reason,
    p_notes: notes,
    p_idempotency_key: idempotencyKey,
  });
}

// ============================================================ adjustments

export async function recordAdjustment(
  organizationId: EntityId,
  propertyId: EntityId,
  outletId: EntityId | undefined,
  locationId: EntityId,
  itemId: EntityId,
  quantity: number,
  unitId: EntityId,
  adjustmentType: "IN" | "OUT",
  reason: string,
  notes?: string
): Promise<EntityId> {
  const idempotencyKey = `ADJUSTMENT:${itemId}:${locationId}:${Date.now()}`;
  return callDoor("record_adjustment", {
    p_organization: organizationId,
    p_property: propertyId,
    p_outlet: outletId,
    p_location: locationId,
    p_item: itemId,
    p_quantity: quantity,
    p_unit: unitId,
    p_adjustment_type: adjustmentType,
    p_reason: reason,
    p_notes: notes,
    p_idempotency_key: idempotencyKey,
  });
}

// ============================================================ transfers

export async function recordTransfer(
  organizationId: EntityId,
  propertyId: EntityId,
  outletId: EntityId | undefined,
  sourceLocationId: EntityId,
  destLocationId: EntityId,
  itemId: EntityId,
  quantity: number,
  unitId: EntityId,
  reason?: string,
  notes?: string
): Promise<EntityId> {
  const idempotencyKey = `TRANSFER:${itemId}:${sourceLocationId}:${destLocationId}:${Date.now()}`;
  return callDoor("record_transfer", {
    p_organization: organizationId,
    p_property: propertyId,
    p_outlet: outletId,
    p_source_location: sourceLocationId,
    p_dest_location: destLocationId,
    p_item: itemId,
    p_quantity: quantity,
    p_unit: unitId,
    p_reason: reason,
    p_notes: notes,
    p_idempotency_key: idempotencyKey,
  });
}

// ============================================================ recipes

export async function listRecipes(
  organizationId: EntityId,
  outletId?: EntityId
): Promise<Recipe[]> {
  const sb = requireSupabase();
  let query = sb
    .from(RECIPES)
    .select(RECIPE_COLUMNS)
    .eq("organization_id", organizationId);

  if (outletId) {
    query = query.eq("outlet_id", outletId);
  }

  return camelRows<Recipe>(asRead(query.order("name")));
}

export async function createRecipe(
  organizationId: EntityId,
  propertyId: EntityId,
  outletId: EntityId,
  itemId: EntityId,
  name: string,
  code: string,
  yieldQuantity: number,
  yieldUnitId: EntityId,
  description?: string,
  notes?: string,
  ingredients?: Array<{
    item_id: EntityId;
    quantity: number;
    unit_id: EntityId;
    notes?: string;
    display_order?: number;
  }>
): Promise<EntityId> {
  return callDoor("create_recipe", {
    p_organization: organizationId,
    p_property: propertyId,
    p_outlet: outletId,
    p_item: itemId,
    p_name: name,
    p_code: code,
    p_description: description,
    p_yield_qty: yieldQuantity,
    p_yield_unit: yieldUnitId,
    p_notes: notes,
    p_ingredients: ingredients ? JSON.stringify(ingredients) : "[]",
  });
}

export async function listRecipeVersions(
  recipeId: EntityId
): Promise<RecipeVersion[]> {
  const sb = requireSupabase();
  const chain = sb
    .from(RECIPE_VERSIONS)
    .select(RECIPE_VERSION_COLUMNS)
    .eq("recipe_id", recipeId);
  return camelRows<RecipeVersion>(asRead(chain.order("version_number", { ascending: false })));
}

export async function listRecipeIngredients(
  recipeVersionId: EntityId
): Promise<RecipeIngredient[]> {
  const sb = requireSupabase();
  const chain = sb
    .from(RECIPE_INGREDIENTS)
    .select(RECIPE_INGREDIENT_COLUMNS)
    .eq("recipe_version_id", recipeVersionId);
  return camelRows<RecipeIngredient>(asRead(chain.order("display_order")));
}

export async function activateRecipeVersion(
  organizationId: EntityId,
  recipeVersionId: EntityId,
  reason?: string
): Promise<void> {
  await callDoor("activate_recipe_version", {
    p_organization: organizationId,
    p_recipe_version: recipeVersionId,
    p_reason: reason,
  });
}

export async function calculateRecipeCost(
  organizationId: EntityId,
  recipeVersionId: EntityId
): Promise<number> {
  const result = await callDoor("calculate_recipe_cost", {
    p_organization: organizationId,
    p_recipe_version: recipeVersionId,
  });
  return Number(result);
}

// ============================================================ stock takes

export async function listStockTakes(
  organizationId: EntityId,
  locationId?: EntityId
): Promise<StockTake[]> {
  const sb = requireSupabase();
  let query = sb
    .from(STOCK_TAKES)
    .select(STOCK_TAKE_COLUMNS)
    .eq("organization_id", organizationId);

  if (locationId) {
    query = query.eq("location_id", locationId);
  }

  return camelRows<StockTake>(asRead(query.order("created_at", { ascending: false })));
}

export async function createStockTake(
  organizationId: EntityId,
  propertyId: EntityId,
  outletId: EntityId | undefined,
  locationId: EntityId,
  notes?: string
): Promise<EntityId> {
  return callDoor("create_stock_take", {
    p_organization: organizationId,
    p_property: propertyId,
    p_outlet: outletId,
    p_location: locationId,
    p_notes: notes,
  });
}

export async function listStockTakeLines(
  stockTakeId: EntityId
): Promise<StockTakeLine[]> {
  const sb = requireSupabase();
  const chain = sb
    .from(STOCK_TAKE_LINES)
    .select(STOCK_TAKE_LINE_COLUMNS)
    .eq("stock_take_id", stockTakeId);
  return camelRows<StockTakeLine>(asRead(chain.order("created_at")));
}

export async function postStockTake(
  organizationId: EntityId,
  stockTakeId: EntityId,
  lines: Array<{ line_id: EntityId; actual_quantity: number }>,
  reason?: string
): Promise<void> {
  await callDoor("post_stock_take", {
    p_organization: organizationId,
    p_stock_take: stockTakeId,
    p_lines: JSON.stringify(lines),
    p_reason: reason,
  });
}

// ============================================================ consumption

export async function consumeForOrder(
  organizationId: EntityId,
  propertyId: EntityId,
  outletId: EntityId,
  locationId: EntityId,
  menuItemId: EntityId,
  quantity: number,
  orderId: EntityId
): Promise<void> {
  const idempotencyKey = `CONSUMPTION:${orderId}:${menuItemId}:${Date.now()}`;
  await callDoor("consume_for_order", {
    p_organization: organizationId,
    p_property: propertyId,
    p_outlet: outletId,
    p_location: locationId,
    p_menu_item: menuItemId,
    p_quantity: quantity,
    p_order_id: orderId,
    p_idempotency_key: idempotencyKey,
  });
}
