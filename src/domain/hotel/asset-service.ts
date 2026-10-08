/**
 * Asset service (Prompt #09, migration 039).
 *
 * Lightweight asset register: track physical assets (AC, TV, furniture, etc.)
 * across rooms and outlets. Separate from inventory items (consumables).
 */

import { requireSupabase } from "@/db/client";
import { asRead, callDoorRow, camelRows, firstCamelRow } from "@/db/rpc";
import type { EntityId } from "@/domain/identity/types";
import type {
  Asset,
  AssetCategory,
  AssetStatus,
} from "./types";

const ASSETS = "assets";

const ASSET_COLUMNS =
  "id, organization_id, property_id, room_id, outlet_id, asset_code, name, category, " +
  "location_description, status, serial_number, manufacturer, model_number, " +
  "purchase_date, purchase_cost, warranty_end_date, notes, version, " +
  "created_at, updated_at, created_by";

export type AssetScope = {
  organizationId: EntityId;
  propertyId: EntityId;
};

export type AssetFilters = {
  category?: AssetCategory;
  status?: AssetStatus;
  roomId?: EntityId | null;
  outletId?: EntityId | null;
};

/** List assets with optional filters. */
export async function listAssets(
  scope: AssetScope,
  filters: AssetFilters = {},
): Promise<Asset[]> {
  const sb = requireSupabase();
  let chain = sb
    .from(ASSETS)
    .select(ASSET_COLUMNS)
    .eq("organization_id", scope.organizationId)
    .eq("property_id", scope.propertyId);

  if (filters.category) {
    chain = chain.eq("category", filters.category);
  }
  if (filters.status) {
    chain = chain.eq("status", filters.status);
  }
  if (filters.roomId !== undefined) {
    if (filters.roomId === null) {
      chain = chain.is("room_id", null);
    } else {
      chain = chain.eq("room_id", filters.roomId);
    }
  }
  if (filters.outletId !== undefined) {
    if (filters.outletId === null) {
      chain = chain.is("outlet_id", null);
    } else {
      chain = chain.eq("outlet_id", filters.outletId);
    }
  }

  chain = chain.order("asset_code", { ascending: true });

  return camelRows<Asset>(asRead(chain));
}

/** Get a single asset by ID. */
export async function getAsset(
  scope: AssetScope,
  assetId: EntityId,
): Promise<Asset | null> {
  const sb = requireSupabase();
  return firstCamelRow<Asset>(
    asRead(
      sb
        .from(ASSETS)
        .select(ASSET_COLUMNS)
        .eq("id", assetId)
        .eq("organization_id", scope.organizationId)
        .eq("property_id", scope.propertyId),
    ),
  );
}

/** Create a new asset. */
export async function createAsset(
  scope: AssetScope,
  params: {
    assetCode: string;
    name: string;
    category: AssetCategory;
    roomId?: EntityId | null;
    outletId?: EntityId | null;
    locationDescription?: string | null;
    serialNumber?: string | null;
    manufacturer?: string | null;
    modelNumber?: string | null;
    purchaseDate?: string | null;
    purchaseCost?: number | null;
    warrantyEndDate?: string | null;
    notes?: string | null;
  },
): Promise<Asset> {
  return callDoorRow<Asset>("create_asset", {
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_asset_code: params.assetCode,
    p_name: params.name,
    p_category: params.category,
    p_room_id: params.roomId ?? null,
    p_outlet_id: params.outletId ?? null,
    p_location_description: params.locationDescription ?? null,
    p_serial_number: params.serialNumber ?? null,
    p_manufacturer: params.manufacturer ?? null,
    p_model_number: params.modelNumber ?? null,
    p_purchase_date: params.purchaseDate ?? null,
    p_purchase_cost: params.purchaseCost ?? null,
    p_warranty_end_date: params.warrantyEndDate ?? null,
    p_notes: params.notes ?? null,
  });
}

/** Update an asset's mutable fields. */
export async function updateAsset(
  scope: AssetScope,
  assetId: EntityId,
  params: {
    name?: string;
    category?: AssetCategory;
    roomId?: EntityId | null;
    locationDescription?: string | null;
    status?: AssetStatus;
    notes?: string | null;
    expectedVersion: number;
  },
): Promise<Asset> {
  return callDoorRow<Asset>("update_asset", {
    p_asset: assetId,
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_expected_version: params.expectedVersion,
    p_name: params.name ?? null,
    p_category: params.category ?? null,
    p_room_id: params.roomId ?? null,
    p_location_description: params.locationDescription ?? null,
    p_status: params.status ?? null,
    p_notes: params.notes ?? null,
  });
}
