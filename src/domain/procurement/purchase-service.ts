/**
 * Purchase requests and purchase orders: requisitions, POs with state machine,
 * line items, charges.
 *
 * Reads are plain SELECTs under RLS. Writes go through doors (029).
 */

import { requireSupabase } from "@/db/client";
import { asRead, callDoorRow, camelRows } from "@/db/rpc";
import type { EntityId } from "@/domain/identity/types";
import type {
  ChargeType,
  PayableToType,
  PurchaseCharge,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
  PurchaseRequest,
  PurchaseRequestItem,
  PurchaseRequestStatus,
} from "./types";

const REQUESTS = "purchase_requests";
const REQUEST_ITEMS = "purchase_request_items";
const ORDERS = "purchase_orders";
const ORDER_ITEMS = "purchase_order_items";
const CHARGES = "purchase_charges";

const REQUEST_COLUMNS =
  "id, organization_id, property_id, outlet_id, request_number, requested_at, requested_by, " +
  "status, notes, approved_at, approved_by, rejection_reason, version, created_at, updated_at";

const REQUEST_ITEM_COLUMNS =
  "id, organization_id, request_id, item_id, quantity, unit_id, estimated_rate, " +
  "preferred_supplier_id, notes, created_at";

const ORDER_COLUMNS =
  "id, organization_id, property_id, outlet_id, purchase_request_id, supplier_id, po_number, " +
  "order_date, expected_delivery, status, subtotal, discount_amount, tax_amount, freight_amount, " +
  "other_charges, grand_total, total_received, notes, approved_at, approved_by, sent_at, " +
  "closed_at, cancelled_at, cancellation_reason, version, created_at, updated_at";

const ORDER_ITEM_COLUMNS =
  "id, organization_id, purchase_order_id, item_id, description, ordered_quantity, " +
  "received_quantity, unit_id, unit_rate, discount_amount, tax_rate, tax_amount, line_total, " +
  "notes, created_at";

const CHARGE_COLUMNS =
  "id, organization_id, purchase_order_id, charge_type, description, amount, payable_to_type, " +
  "payable_to_id, capitalize_to_inventory, allocation_method, created_at";

// ============================================================ purchase requests

export async function listPurchaseRequests(
  organizationId: EntityId,
  opts?: { status?: PurchaseRequestStatus; supplierId?: EntityId }
): Promise<PurchaseRequest[]> {
  const sb = requireSupabase();
  let chain = sb
    .from(REQUESTS)
    .select(REQUEST_COLUMNS)
    .eq("organization_id", organizationId);
  if (opts?.status) chain = chain.eq("status", opts.status);
  return camelRows<PurchaseRequest>(asRead(chain.order("created_at.desc")));
}

export async function getPurchaseRequest(
  requestId: EntityId
): Promise<PurchaseRequest | null> {
  const sb = requireSupabase();
  const chain = sb
    .from(REQUESTS)
    .select(REQUEST_COLUMNS)
    .eq("id", requestId)
    .limit(1);
  const rows = await camelRows<PurchaseRequest>(asRead(chain));
  return rows[0] ?? null;
}

export async function listPurchaseRequestItems(
  requestId: EntityId
): Promise<PurchaseRequestItem[]> {
  const sb = requireSupabase();
  const chain = sb
    .from(REQUEST_ITEMS)
    .select(REQUEST_ITEM_COLUMNS)
    .eq("request_id", requestId);
  return camelRows<PurchaseRequestItem>(asRead(chain.order("created_at")));
}

export async function createPurchaseRequest(
  organizationId: EntityId,
  propertyId: EntityId,
  outletId?: EntityId,
  notes?: string
): Promise<PurchaseRequest> {
  return callDoorRow<PurchaseRequest>("create_purchase_request", {
    p_organization: organizationId,
    p_property: propertyId,
    p_outlet: outletId,
    p_notes: notes,
  });
}

export async function addPurchaseRequestItems(
  requestId: EntityId,
  items: Array<{
    itemId: EntityId;
    quantity: number;
    unitId: EntityId;
    estimatedRate?: number;
    preferredSupplierId?: EntityId;
    notes?: string;
  }>
): Promise<PurchaseRequest> {
  return callDoorRow<PurchaseRequest>("add_purchase_request_items", {
    p_request: requestId,
    p_items: items,
  });
}

export async function setPurchaseRequestStatus(
  requestId: EntityId,
  status: PurchaseRequestStatus,
  reason?: string
): Promise<PurchaseRequest> {
  return callDoorRow<PurchaseRequest>("set_purchase_request_status", {
    p_request: requestId,
    p_status: status,
    p_reason: reason,
  });
}

// ============================================================ purchase orders

export async function listPurchaseOrders(
  organizationId: EntityId,
  opts?: { status?: PurchaseOrderStatus; supplierId?: EntityId }
): Promise<PurchaseOrder[]> {
  const sb = requireSupabase();
  let chain = sb
    .from(ORDERS)
    .select(ORDER_COLUMNS)
    .eq("organization_id", organizationId);
  if (opts?.status) chain = chain.eq("status", opts.status);
  if (opts?.supplierId) chain = chain.eq("supplier_id", opts.supplierId);
  return camelRows<PurchaseOrder>(asRead(chain.order("created_at.desc")));
}

export async function getPurchaseOrder(
  orderId: EntityId
): Promise<PurchaseOrder | null> {
  const sb = requireSupabase();
  const chain = sb
    .from(ORDERS)
    .select(ORDER_COLUMNS)
    .eq("id", orderId)
    .limit(1);
  const rows = await camelRows<PurchaseOrder>(asRead(chain));
  return rows[0] ?? null;
}

export async function listPurchaseOrderItems(
  orderId: EntityId
): Promise<PurchaseOrderItem[]> {
  const sb = requireSupabase();
  const chain = sb
    .from(ORDER_ITEMS)
    .select(ORDER_ITEM_COLUMNS)
    .eq("purchase_order_id", orderId);
  return camelRows<PurchaseOrderItem>(asRead(chain.order("created_at")));
}

export async function listPurchaseCharges(
  orderId: EntityId
): Promise<PurchaseCharge[]> {
  const sb = requireSupabase();
  const chain = sb
    .from(CHARGES)
    .select(CHARGE_COLUMNS)
    .eq("purchase_order_id", orderId);
  return camelRows<PurchaseCharge>(asRead(chain.order("created_at")));
}

export async function createPurchaseOrder(
  organizationId: EntityId,
  propertyId: EntityId,
  supplierId: EntityId,
  opts?: {
    outletId?: EntityId;
    purchaseRequestId?: EntityId;
    orderDate?: string;
    expectedDelivery?: string;
    notes?: string;
  }
): Promise<PurchaseOrder> {
  return callDoorRow<PurchaseOrder>("create_purchase_order", {
    p_organization: organizationId,
    p_property: propertyId,
    p_supplier: supplierId,
    p_outlet: opts?.outletId,
    p_purchase_request: opts?.purchaseRequestId,
    p_order_date: opts?.orderDate,
    p_expected_delivery: opts?.expectedDelivery,
    p_notes: opts?.notes,
  });
}

export async function addPurchaseOrderItems(
  orderId: EntityId,
  items: Array<{
    itemId: EntityId;
    description: string;
    quantity: number;
    unitId: EntityId;
    unitRate: number;
    discountAmount?: number;
    taxRate?: number;
    notes?: string;
  }>
): Promise<PurchaseOrder> {
  return callDoorRow<PurchaseOrder>("add_purchase_order_items", {
    p_order: orderId,
    p_items: items,
  });
}

export async function addPurchaseCharge(
  orderId: EntityId,
  input: {
    chargeType: ChargeType;
    description: string;
    amount: number;
    payableToType: PayableToType;
    payableToId?: EntityId;
    capitalizeToInventory?: boolean;
    allocationMethod?: "AMOUNT" | "QUANTITY" | "VALUE";
  }
): Promise<PurchaseOrder> {
  return callDoorRow<PurchaseOrder>("add_purchase_charge", {
    p_order: orderId,
    p_charge_type: input.chargeType,
    p_description: input.description,
    p_amount: input.amount,
    p_payable_to_type: input.payableToType,
    p_payable_to_id: input.payableToId,
    p_capitalize_to_inventory: input.capitalizeToInventory ?? false,
    p_allocation_method: input.allocationMethod ?? "AMOUNT",
  });
}

export async function setPurchaseOrderStatus(
  orderId: EntityId,
  status: PurchaseOrderStatus,
  reason?: string
): Promise<PurchaseOrder> {
  return callDoorRow<PurchaseOrder>("set_purchase_order_status", {
    p_order: orderId,
    p_status: status,
    p_reason: reason,
  });
}

export async function recalculatePurchaseOrderTotals(
  orderId: EntityId
): Promise<PurchaseOrder> {
  return callDoorRow<PurchaseOrder>("recalculate_purchase_order_totals", {
    p_order: orderId,
  });
}
