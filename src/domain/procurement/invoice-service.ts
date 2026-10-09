/**
 * Purchase invoices, supplier payments, payment allocations, purchase returns.
 *
 * Reads are plain SELECTs under RLS. Writes go through doors (031).
 * Purchase returns post RETURN movements to the stock ledger.
 */

import { requireSupabase } from "@/db/client";
import { asRead, callDoorRow, camelRows } from "@/db/rpc";
import type { EntityId } from "@/domain/identity/types";
import type {
  InvoiceStatus,
  PaymentAllocation,
  PaymentMethod,
  PurchaseInvoice,
  PurchaseInvoiceItem,
  PurchaseReturn,
  PurchaseReturnItem,
  ReturnStatus,
  SupplierPayment,
} from "./types";

const INVOICES = "purchase_invoices";
const INVOICE_ITEMS = "purchase_invoice_items";
const PAYMENTS = "supplier_payments";
const ALLOCATIONS = "payment_allocations";
const RETURNS = "purchase_returns";
const RETURN_ITEMS = "purchase_return_items";

const INVOICE_COLUMNS =
  "id, organization_id, property_id, outlet_id, supplier_id, purchase_order_id, invoice_number, " +
  "invoice_date, due_date, subtotal, tax_amount, total_amount, paid_amount, outstanding_amount, " +
  "status, notes, posted_at, cancelled_at, cancellation_reason, version, created_at, updated_at";

const INVOICE_ITEM_COLUMNS =
  "id, organization_id, invoice_id, purchase_order_item_id, goods_receipt_item_id, item_id, " +
  "description, quantity, unit_id, unit_rate, discount_amount, tax_rate, tax_amount, line_total, " +
  "created_at";

const PAYMENT_COLUMNS =
  "id, organization_id, property_id, outlet_id, supplier_id, payment_number, payment_date, " +
  "payment_method, reference_number, total_amount, allocated_amount, unallocated_amount, status, " +
  "notes, version, created_at, updated_at";

const ALLOCATION_COLUMNS =
  "id, organization_id, payment_id, invoice_id, allocated_amount, allocated_at";

const RETURN_COLUMNS =
  "id, organization_id, property_id, outlet_id, supplier_id, goods_receipt_id, return_number, " +
  "return_date, status, notes, posted_at, cancelled_at, cancellation_reason, version, " +
  "created_at, updated_at";

const RETURN_ITEM_COLUMNS =
  "id, organization_id, return_id, goods_receipt_item_id, item_id, quantity, unit_id, " +
  "unit_cost, total_cost, reason, ledger_id, created_at";

// ============================================================ purchase invoices

export async function listPurchaseInvoices(
  organizationId: EntityId,
  opts?: { status?: InvoiceStatus; supplierId?: EntityId }
): Promise<PurchaseInvoice[]> {
  const sb = requireSupabase();
  let chain = sb
    .from(INVOICES)
    .select(INVOICE_COLUMNS)
    .eq("organization_id", organizationId);
  if (opts?.status) chain = chain.eq("status", opts.status);
  if (opts?.supplierId) chain = chain.eq("supplier_id", opts.supplierId);
  return camelRows<PurchaseInvoice>(
    asRead(chain.order("created_at", { ascending: false }))
  );
}

export async function getPurchaseInvoice(
  invoiceId: EntityId
): Promise<PurchaseInvoice | null> {
  const sb = requireSupabase();
  const chain = sb
    .from(INVOICES)
    .select(INVOICE_COLUMNS)
    .eq("id", invoiceId)
    .limit(1);
  const rows = await camelRows<PurchaseInvoice>(asRead(chain));
  return rows[0] ?? null;
}

export async function listPurchaseInvoiceItems(
  invoiceId: EntityId
): Promise<PurchaseInvoiceItem[]> {
  const sb = requireSupabase();
  const chain = sb
    .from(INVOICE_ITEMS)
    .select(INVOICE_ITEM_COLUMNS)
    .eq("invoice_id", invoiceId);
  return camelRows<PurchaseInvoiceItem>(asRead(chain.order("created_at")));
}

export async function createPurchaseInvoice(
  organizationId: EntityId,
  propertyId: EntityId,
  outletId: EntityId,
  supplierId: EntityId,
  opts?: {
    purchaseOrderId?: EntityId;
    invoiceDate?: string;
    dueDate?: string;
    notes?: string;
  }
): Promise<PurchaseInvoice> {
  return callDoorRow<PurchaseInvoice>("create_purchase_invoice", {
    p_organization: organizationId,
    p_property: propertyId,
    p_outlet: outletId,
    p_supplier: supplierId,
    p_purchase_order: opts?.purchaseOrderId,
    p_invoice_date: opts?.invoiceDate,
    p_due_date: opts?.dueDate,
    p_notes: opts?.notes,
  });
}

export async function addPurchaseInvoiceItems(
  invoiceId: EntityId,
  items: Array<{
    itemId: EntityId;
    description: string;
    quantity: number;
    unitId: EntityId;
    unitRate: number;
    discountAmount?: number;
    taxRate: number;
    purchaseOrderItemId?: EntityId;
    goodsReceiptItemId?: EntityId;
  }>
): Promise<PurchaseInvoice> {
  return callDoorRow<PurchaseInvoice>("add_purchase_invoice_items", {
    p_invoice: invoiceId,
    p_items: items,
  });
}

export async function setPurchaseInvoiceStatus(
  invoiceId: EntityId,
  status: InvoiceStatus,
  reason?: string
): Promise<PurchaseInvoice> {
  return callDoorRow<PurchaseInvoice>("set_purchase_invoice_status", {
    p_invoice: invoiceId,
    p_status: status,
    p_reason: reason,
  });
}

// ============================================================ supplier payments

export async function listSupplierPayments(
  organizationId: EntityId,
  opts?: { supplierId?: EntityId }
): Promise<SupplierPayment[]> {
  const sb = requireSupabase();
  let chain = sb
    .from(PAYMENTS)
    .select(PAYMENT_COLUMNS)
    .eq("organization_id", organizationId);
  if (opts?.supplierId) chain = chain.eq("supplier_id", opts.supplierId);
  return camelRows<SupplierPayment>(
    asRead(chain.order("payment_date", { ascending: false }))
  );
}

export async function getSupplierPayment(
  paymentId: EntityId
): Promise<SupplierPayment | null> {
  const sb = requireSupabase();
  const chain = sb
    .from(PAYMENTS)
    .select(PAYMENT_COLUMNS)
    .eq("id", paymentId)
    .limit(1);
  const rows = await camelRows<SupplierPayment>(asRead(chain));
  return rows[0] ?? null;
}

export async function listPaymentAllocations(
  paymentId: EntityId
): Promise<PaymentAllocation[]> {
  const sb = requireSupabase();
  const chain = sb
    .from(ALLOCATIONS)
    .select(ALLOCATION_COLUMNS)
    .eq("payment_id", paymentId);
  return camelRows<PaymentAllocation>(asRead(chain.order("allocated_at")));
}

export async function recordSupplierPayment(
  organizationId: EntityId,
  propertyId: EntityId,
  outletId: EntityId,
  supplierId: EntityId,
  input: {
    paymentDate: string;
    paymentMethod: PaymentMethod;
    amount: number;
    referenceNumber?: string;
    notes?: string;
  }
): Promise<SupplierPayment> {
  return callDoorRow<SupplierPayment>("record_supplier_payment", {
    p_organization: organizationId,
    p_property: propertyId,
    p_outlet: outletId,
    p_supplier: supplierId,
    p_payment_date: input.paymentDate,
    p_payment_method: input.paymentMethod,
    p_amount: input.amount,
    p_reference_number: input.referenceNumber,
    p_notes: input.notes,
  });
}

export async function allocatePaymentToInvoice(
  paymentId: EntityId,
  invoiceId: EntityId,
  amount: number
): Promise<PaymentAllocation> {
  return callDoorRow<PaymentAllocation>("allocate_payment_to_invoice", {
    p_payment: paymentId,
    p_invoice: invoiceId,
    p_amount: amount,
  });
}

// ============================================================ purchase returns

export async function listPurchaseReturns(
  organizationId: EntityId,
  opts?: { status?: ReturnStatus; supplierId?: EntityId }
): Promise<PurchaseReturn[]> {
  const sb = requireSupabase();
  let chain = sb
    .from(RETURNS)
    .select(RETURN_COLUMNS)
    .eq("organization_id", organizationId);
  if (opts?.status) chain = chain.eq("status", opts.status);
  if (opts?.supplierId) chain = chain.eq("supplier_id", opts.supplierId);
  return camelRows<PurchaseReturn>(
    asRead(chain.order("created_at", { ascending: false }))
  );
}

export async function getPurchaseReturn(
  returnId: EntityId
): Promise<PurchaseReturn | null> {
  const sb = requireSupabase();
  const chain = sb
    .from(RETURNS)
    .select(RETURN_COLUMNS)
    .eq("id", returnId)
    .limit(1);
  const rows = await camelRows<PurchaseReturn>(asRead(chain));
  return rows[0] ?? null;
}

export async function listPurchaseReturnItems(
  returnId: EntityId
): Promise<PurchaseReturnItem[]> {
  const sb = requireSupabase();
  const chain = sb
    .from(RETURN_ITEMS)
    .select(RETURN_ITEM_COLUMNS)
    .eq("return_id", returnId);
  return camelRows<PurchaseReturnItem>(asRead(chain.order("created_at")));
}

export async function createPurchaseReturn(
  organizationId: EntityId,
  propertyId: EntityId,
  outletId: EntityId,
  supplierId: EntityId,
  goodsReceiptId: EntityId,
  opts?: {
    returnDate?: string;
    notes?: string;
  }
): Promise<PurchaseReturn> {
  return callDoorRow<PurchaseReturn>("create_purchase_return", {
    p_organization: organizationId,
    p_property: propertyId,
    p_outlet: outletId,
    p_supplier: supplierId,
    p_goods_receipt: goodsReceiptId,
    p_return_date: opts?.returnDate,
    p_notes: opts?.notes,
  });
}

export async function postPurchaseReturn(
  returnId: EntityId,
  items: Array<{
    goodsReceiptItemId: EntityId;
    quantity: number;
    reason?: string;
  }>
): Promise<PurchaseReturn> {
  return callDoorRow<PurchaseReturn>("post_purchase_return", {
    p_return: returnId,
    p_items: items,
  });
}
