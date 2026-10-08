/**
 * Goods receipts: physical receipt of goods against a PO.
 * Posts RECEIPT movements to the stock ledger.
 *
 * Reads are plain SELECTs under RLS. Writes go through doors (030).
 */

import { requireSupabase } from "@/db/client";
import { asRead, callDoorRow, camelRows } from "@/db/rpc";
import type { EntityId } from "@/domain/identity/types";
import type { GoodsReceipt, GoodsReceiptItem, GoodsReceiptStatus } from "./types";

const RECEIPTS = "goods_receipts";
const RECEIPT_ITEMS = "goods_receipt_items";

const RECEIPT_COLUMNS =
  "id, organization_id, property_id, outlet_id, purchase_order_id, supplier_id, receipt_number, " +
  "received_at, received_by, location_id, status, notes, posted_at, cancelled_at, " +
  "cancellation_reason, version, created_at, updated_at";

const RECEIPT_ITEM_COLUMNS =
  "id, organization_id, receipt_id, purchase_order_item_id, item_id, ordered_quantity, " +
  "received_quantity, accepted_quantity, rejected_quantity, unit_id, unit_cost, total_cost, " +
  "batch_number, expiry_date, rejection_reason, ledger_id, location_id, created_at";

// ============================================================ goods receipts

export async function listGoodsReceipts(
  organizationId: EntityId,
  opts?: { status?: GoodsReceiptStatus; supplierId?: EntityId; purchaseOrderId?: EntityId }
): Promise<GoodsReceipt[]> {
  const sb = requireSupabase();
  let chain = sb
    .from(RECEIPTS)
    .select(RECEIPT_COLUMNS)
    .eq("organization_id", organizationId);
  if (opts?.status) chain = chain.eq("status", opts.status);
  if (opts?.supplierId) chain = chain.eq("supplier_id", opts.supplierId);
  if (opts?.purchaseOrderId) chain = chain.eq("purchase_order_id", opts.purchaseOrderId);
  return camelRows<GoodsReceipt>(asRead(chain.order("created_at.desc")));
}

export async function getGoodsReceipt(
  receiptId: EntityId
): Promise<GoodsReceipt | null> {
  const sb = requireSupabase();
  const chain = sb
    .from(RECEIPTS)
    .select(RECEIPT_COLUMNS)
    .eq("id", receiptId)
    .limit(1);
  const rows = await camelRows<GoodsReceipt>(asRead(chain));
  return rows[0] ?? null;
}

export async function listGoodsReceiptItems(
  receiptId: EntityId
): Promise<GoodsReceiptItem[]> {
  const sb = requireSupabase();
  const chain = sb
    .from(RECEIPT_ITEMS)
    .select(RECEIPT_ITEM_COLUMNS)
    .eq("receipt_id", receiptId);
  return camelRows<GoodsReceiptItem>(asRead(chain.order("created_at")));
}

export async function createGoodsReceipt(
  organizationId: EntityId,
  propertyId: EntityId,
  purchaseOrderId: EntityId,
  supplierId: EntityId,
  locationId: EntityId,
  opts?: {
    outletId?: EntityId;
    receivedAt?: string;
    notes?: string;
  }
): Promise<GoodsReceipt> {
  return callDoorRow<GoodsReceipt>("create_goods_receipt", {
    p_organization: organizationId,
    p_property: propertyId,
    p_purchase_order: purchaseOrderId,
    p_supplier: supplierId,
    p_location: locationId,
    p_outlet: opts?.outletId,
    p_received_at: opts?.receivedAt,
    p_notes: opts?.notes,
  });
}

export async function addGoodsReceiptItems(
  receiptId: EntityId,
  items: Array<{
    purchaseOrderItemId: EntityId;
    itemId: EntityId;
    locationId: EntityId;
    receivedQuantity: number;
    acceptedQuantity: number;
    rejectedQuantity?: number;
    unitId: EntityId;
    unitCost: number;
    batchNumber?: string;
    expiryDate?: string;
    rejectionReason?: string;
  }>
): Promise<GoodsReceipt> {
  return callDoorRow<GoodsReceipt>("add_goods_receipt_items", {
    p_receipt: receiptId,
    p_items: items,
  });
}

export async function postGoodsReceipt(
  receiptId: EntityId
): Promise<GoodsReceipt> {
  return callDoorRow<GoodsReceipt>("post_goods_receipt", {
    p_receipt: receiptId,
  });
}

export async function cancelGoodsReceipt(
  receiptId: EntityId,
  reason: string
): Promise<GoodsReceipt> {
  return callDoorRow<GoodsReceipt>("cancel_goods_receipt", {
    p_receipt: receiptId,
    p_reason: reason,
  });
}
