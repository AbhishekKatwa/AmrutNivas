/**
 * Purchase requests and purchase orders: requisitions, POs with state machine,
 * line items, charges.
 *
 * Reads are plain SELECTs under RLS. Writes go through doors (029).
 * The item doors return void — the caller refetches the order after a write.
 */

import { requireSupabase } from "@/db/client";
import { asRead, callDoor, callDoorRow, camelRows } from "@/db/rpc";
import type { EntityId } from "@/domain/identity/types";
import type {
  ChargeAllocationMethod,
  ChargeType,
  PayableToType,
  PurchaseCharge,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
  PurchaseRequest,
  PurchaseRequestItem,
  PurchaseRequestPriority,
  PurchaseRequestStatus,
} from "./types";

const REQUESTS = "purchase_requests";
const REQUEST_ITEMS = "purchase_request_items";
const ORDERS = "purchase_orders";
const ORDER_ITEMS = "purchase_order_items";
const CHARGES = "purchase_charges";

const REQUEST_COLUMNS =
  "id, organization_id, property_id, outlet_id, requested_by, request_date, required_by_date, " +
  "reason, priority, status, notes, version, created_at, updated_at";

const REQUEST_ITEM_COLUMNS =
  "id, purchase_request_id, inventory_item_id, requested_quantity, uom, notes, created_at";

const ORDER_COLUMNS =
  "id, organization_id, property_id, outlet_id, supplier_id, po_number, order_date, " +
  "expected_delivery, currency, payment_terms_days, status, notes, subtotal, total_discount, " +
  "total_tax, total_freight, total_other_charges, grand_total, total_received, created_by, " +
  "approved_by, approved_at, sent_at, closed_at, cancelled_at, cancellation_reason, version, " +
  "created_at, updated_at";

const ORDER_ITEM_COLUMNS =
  "id, purchase_order_id, inventory_item_id, description, ordered_quantity, received_quantity, " +
  "uom, unit_rate, discount, tax_rate, line_subtotal, line_discount, line_tax, line_total, " +
  "notes, created_at";

const CHARGE_COLUMNS =
  "id, purchase_order_id, charge_type, description, amount, tax_amount, currency, " +
  "payable_to_type, payable_to_supplier_id, expense_category, capitalize_to_inventory, " +
  "allocation_method, notes, created_at";

// ============================================================ purchase requests

export async function listPurchaseRequests(
  organizationId: EntityId,
  opts?: { status?: PurchaseRequestStatus }
): Promise<PurchaseRequest[]> {
  const sb = requireSupabase();
  let chain = sb
    .from(REQUESTS)
    .select(REQUEST_COLUMNS)
    .eq("organization_id", organizationId);
  if (opts?.status) chain = chain.eq("status", opts.status);
  return camelRows<PurchaseRequest>(
    asRead(chain.order("created_at", { ascending: false }))
  );
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
    .eq("purchase_request_id", requestId);
  return camelRows<PurchaseRequestItem>(asRead(chain.order("created_at")));
}

export async function createPurchaseRequest(
  organizationId: EntityId,
  propertyId: EntityId,
  input?: {
    outletId?: EntityId;
    requiredByDate?: string;
    reason?: string;
    priority?: PurchaseRequestPriority;
    notes?: string;
  }
): Promise<PurchaseRequest> {
  return callDoorRow<PurchaseRequest>("create_purchase_request", {
    p_organization: organizationId,
    p_property: propertyId,
    p_outlet: input?.outletId,
    p_required_by_date: input?.requiredByDate,
    p_reason: input?.reason,
    p_priority: input?.priority,
    p_notes: input?.notes,
  });
}

export async function addPurchaseRequestItems(
  requestId: EntityId,
  organizationId: EntityId,
  items: Array<{
    inventoryItemId: EntityId;
    requestedQuantity: number;
    uom: EntityId;
    notes?: string;
  }>
): Promise<void> {
  await callDoor("add_purchase_request_items", {
    p_request: requestId,
    p_organization: organizationId,
    p_items: items,
  });
}

export async function setPurchaseRequestStatus(
  requestId: EntityId,
  organizationId: EntityId,
  status: PurchaseRequestStatus,
  expectedVersion?: number
): Promise<PurchaseRequest> {
  return callDoorRow<PurchaseRequest>("set_purchase_request_status", {
    p_request: requestId,
    p_organization: organizationId,
    p_status: status,
    p_expected_version: expectedVersion,
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
  return camelRows<PurchaseOrder>(
    asRead(chain.order("created_at", { ascending: false }))
  );
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
    orderDate?: string;
    expectedDelivery?: string;
    currency?: string;
    paymentTermsDays?: number;
    notes?: string;
  }
): Promise<PurchaseOrder> {
  return callDoorRow<PurchaseOrder>("create_purchase_order", {
    p_organization: organizationId,
    p_property: propertyId,
    p_supplier: supplierId,
    p_outlet: opts?.outletId,
    p_order_date: opts?.orderDate,
    p_expected_delivery: opts?.expectedDelivery,
    p_currency: opts?.currency,
    p_payment_terms_days: opts?.paymentTermsDays,
    p_notes: opts?.notes,
  });
}

export async function addPurchaseOrderItems(
  orderId: EntityId,
  organizationId: EntityId,
  items: Array<{
    inventoryItemId: EntityId;
    description?: string;
    orderedQuantity: number;
    uom: EntityId;
    unitRate: number;
    discount?: number;
    taxRate?: number;
    notes?: string;
  }>
): Promise<void> {
  await callDoor("add_purchase_order_items", {
    p_order: orderId,
    p_organization: organizationId,
    p_items: items,
  });
}

export async function addPurchaseCharge(
  orderId: EntityId,
  organizationId: EntityId,
  input: {
    chargeType: ChargeType;
    amount: number;
    description?: string;
    taxAmount?: number;
    payableToType?: PayableToType;
    payableToSupplierId?: EntityId;
    expenseCategory?: string;
    capitalizeToInventory?: boolean;
    allocationMethod?: ChargeAllocationMethod;
    notes?: string;
  }
): Promise<PurchaseCharge> {
  return callDoorRow<PurchaseCharge>("add_purchase_charge", {
    p_order: orderId,
    p_organization: organizationId,
    p_charge_type: input.chargeType,
    p_amount: input.amount,
    p_description: input.description,
    p_tax_amount: input.taxAmount,
    p_payable_to_type: input.payableToType,
    p_payable_to_supplier: input.payableToSupplierId,
    p_expense_category: input.expenseCategory,
    p_capitalize: input.capitalizeToInventory ?? false,
    p_allocation_method: input.allocationMethod,
    p_notes: input.notes,
  });
}

export async function setPurchaseOrderStatus(
  orderId: EntityId,
  organizationId: EntityId,
  status: PurchaseOrderStatus,
  reason?: string,
  expectedVersion?: number
): Promise<PurchaseOrder> {
  return callDoorRow<PurchaseOrder>("set_purchase_order_status", {
    p_order: orderId,
    p_organization: organizationId,
    p_status: status,
    p_reason: reason,
    p_expected_version: expectedVersion,
  });
}

export async function recalculatePurchaseOrderTotals(
  orderId: EntityId,
  organizationId: EntityId
): Promise<void> {
  await callDoor("recalculate_purchase_order_totals", {
    p_order: orderId,
    p_organization: organizationId,
  });
}
