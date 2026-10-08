/**
 * Lost & found service (Prompt #09, migration 039).
 *
 * Lightweight foundation: record items found on the property, track their
 * storage location, and mark them returned when claimed by a guest.
 */

import { requireSupabase } from "@/db/client";
import { asRead, callDoorRow, camelRows, firstCamelRow } from "@/db/rpc";
import type { EntityId } from "@/domain/identity/types";
import type {
  LostFoundItem,
  LostFoundCategory,
  LostFoundStatus,
} from "./types";

const LOST_FOUND_ITEMS = "lost_found_items";

const ITEM_COLUMNS =
  "id, organization_id, property_id, room_id, found_by, found_at, description, " +
  "category, status, storage_location, guest_id, returned_at, returned_to, notes, " +
  "version, created_at, updated_at, created_by";

export type LostFoundScope = {
  organizationId: EntityId;
  propertyId: EntityId;
};

export type LostFoundFilters = {
  status?: LostFoundStatus;
  category?: LostFoundCategory;
  roomId?: EntityId;
  guestId?: EntityId;
};

/** List lost & found items with optional filters. */
export async function listLostFoundItems(
  scope: LostFoundScope,
  filters: LostFoundFilters = {},
): Promise<LostFoundItem[]> {
  const sb = requireSupabase();
  let chain = sb
    .from(LOST_FOUND_ITEMS)
    .select(ITEM_COLUMNS)
    .eq("organization_id", scope.organizationId)
    .eq("property_id", scope.propertyId);

  if (filters.status) {
    chain = chain.eq("status", filters.status);
  }
  if (filters.category) {
    chain = chain.eq("category", filters.category);
  }
  if (filters.roomId) {
    chain = chain.eq("room_id", filters.roomId);
  }
  if (filters.guestId) {
    chain = chain.eq("guest_id", filters.guestId);
  }

  chain = chain.order("found_at", { ascending: false });

  return camelRows<LostFoundItem>(asRead(chain));
}

/** Get a single lost & found item by ID. */
export async function getLostFoundItem(
  scope: LostFoundScope,
  itemId: EntityId,
): Promise<LostFoundItem | null> {
  const sb = requireSupabase();
  return firstCamelRow<LostFoundItem>(
    asRead(
      sb
        .from(LOST_FOUND_ITEMS)
        .select(ITEM_COLUMNS)
        .eq("id", itemId)
        .eq("organization_id", scope.organizationId)
        .eq("property_id", scope.propertyId),
    ),
  );
}

/** Record a new lost & found item. */
export async function createLostFoundItem(
  scope: LostFoundScope,
  params: {
    description: string;
    category?: LostFoundCategory;
    roomId?: EntityId | null;
    storageLocation?: string | null;
    guestId?: EntityId | null;
    notes?: string | null;
  },
): Promise<LostFoundItem> {
  return callDoorRow<LostFoundItem>("create_lost_found_item", {
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_description: params.description,
    p_category: params.category ?? "OTHER",
    p_room_id: params.roomId ?? null,
    p_storage_location: params.storageLocation ?? null,
    p_guest_id: params.guestId ?? null,
    p_notes: params.notes ?? null,
  });
}

/** Mark a lost & found item as returned to its owner. */
export async function returnLostFoundItem(
  scope: LostFoundScope,
  itemId: EntityId,
  expectedVersion: number,
): Promise<LostFoundItem> {
  return callDoorRow<LostFoundItem>("return_lost_found_item", {
    p_item: itemId,
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_expected_version: expectedVersion,
  });
}
