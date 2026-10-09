/**
 * The procurement domain: suppliers, purchase requests, purchase orders,
 * goods receipts, invoices, payments, returns.
 *
 * Types mirror the schema's CHECK constraints. Every array must match the DB's
 * allowed values exactly — a drift is answered by the door refusing the write.
 *
 * Hierarchy: Organization → Property → Outlet → Supplier/PO/GRN/Invoice/Payment/Return.
 * GRN posts RECEIPT movements to the stock ledger.
 * Purchase returns post RETURN movements to the stock ledger.
 */

import type { EntityId } from "@/domain/identity/types";

// ============================================================ suppliers

export type SupplierStatus = "ACTIVE" | "INACTIVE" | "BLOCKED" | "ARCHIVED";

export const SUPPLIER_STATUSES: readonly SupplierStatus[] = [
  "ACTIVE",
  "INACTIVE",
  "BLOCKED",
  "ARCHIVED",
];

export type SupplierType =
  | "RAW_MATERIAL"
  | "FOOD"
  | "BEVERAGE"
  | "PACKAGING"
  | "CLEANING"
  | "EQUIPMENT"
  | "MAINTENANCE"
  | "UTILITY"
  | "SERVICE"
  | "OTHER";

export const SUPPLIER_TYPES: readonly SupplierType[] = [
  "RAW_MATERIAL",
  "FOOD",
  "BEVERAGE",
  "PACKAGING",
  "CLEANING",
  "EQUIPMENT",
  "MAINTENANCE",
  "UTILITY",
  "SERVICE",
  "OTHER",
];

export interface Supplier {
  id: EntityId;
  organizationId: EntityId;
  supplierCode: string;
  legalName: string;
  displayName?: string;
  supplierType: SupplierType;
  status: SupplierStatus;
  taxIdentifier?: string;
  gstin?: string;
  pan?: string;
  email?: string;
  phone?: string;
  website?: string;
  paymentTermsDays?: number;
  creditLimit?: number;
  currency?: string;
  notes?: string;
  openingBalance?: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierContact {
  id: EntityId;
  supplierId: EntityId;
  name: string;
  designation?: string;
  phone?: string;
  email?: string;
  isPrimary: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type SupplierAddressType =
  | "REGISTERED"
  | "BILLING"
  | "SHIPPING"
  | "WAREHOUSE"
  | "OTHER";

export const SUPPLIER_ADDRESS_TYPES: readonly SupplierAddressType[] = [
  "REGISTERED",
  "BILLING",
  "SHIPPING",
  "WAREHOUSE",
  "OTHER",
];

export interface SupplierAddress {
  id: EntityId;
  supplierId: EntityId;
  addressType: SupplierAddressType;
  addressLine1: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country: string;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierItem {
  id: EntityId;
  supplierId: EntityId;
  inventoryItemId: EntityId;
  supplierItemCode?: string;
  supplierItemName?: string;
  purchaseUnit: EntityId;
  conversionToBase: number;
  lastPurchaseRate?: number;
  standardRate?: number;
  minimumOrderQty?: number;
  leadTimeDays?: number;
  isPreferred: boolean;
  isActive: boolean;
  notes?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierPriceHistory {
  id: EntityId;
  supplierId: EntityId;
  inventoryItemId: EntityId;
  purchaseOrderId?: EntityId;
  goodsReceiptId?: EntityId;
  purchaseDate: string;
  quantity: number;
  purchaseUnit: EntityId;
  rate: number;
  discount: number;
  taxAmount: number;
  freightAmount: number;
  otherCharges: number;
  landedRate?: number;
  currency: string;
  createdAt: string;
}

// ============================================================ purchase requests

export type PurchaseRequestStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | "CONVERTED_TO_PO";

export const PURCHASE_REQUEST_STATUSES: readonly PurchaseRequestStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "CONVERTED_TO_PO",
];

export type PurchaseRequestPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export const PURCHASE_REQUEST_PRIORITIES: readonly PurchaseRequestPriority[] = [
  "LOW",
  "NORMAL",
  "HIGH",
  "URGENT",
];

export interface PurchaseRequest {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  outletId?: EntityId;
  requestedBy: EntityId;
  requestDate: string;
  requiredByDate?: string;
  reason?: string;
  priority: PurchaseRequestPriority;
  status: PurchaseRequestStatus;
  notes?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseRequestItem {
  id: EntityId;
  purchaseRequestId: EntityId;
  inventoryItemId: EntityId;
  requestedQuantity: number;
  uom: EntityId;
  notes?: string;
  createdAt: string;
}

// ============================================================ purchase orders

export type PurchaseOrderStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "SENT"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED"
  | "CLOSED"
  | "CANCELLED";

export const PURCHASE_ORDER_STATUSES: readonly PurchaseOrderStatus[] = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "SENT",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
  "CLOSED",
  "CANCELLED",
];

export interface PurchaseOrder {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  outletId?: EntityId;
  supplierId: EntityId;
  poNumber: string;
  orderDate: string;
  expectedDelivery?: string;
  currency: string;
  paymentTermsDays?: number;
  status: PurchaseOrderStatus;
  subtotal: number;
  totalDiscount: number;
  totalTax: number;
  totalFreight: number;
  totalOtherCharges: number;
  grandTotal: number;
  totalReceived: number;
  notes?: string;
  createdBy: EntityId;
  approvedAt?: string;
  approvedBy?: EntityId;
  sentAt?: string;
  closedAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderItem {
  id: EntityId;
  purchaseOrderId: EntityId;
  inventoryItemId: EntityId;
  description?: string;
  orderedQuantity: number;
  receivedQuantity: number;
  uom: EntityId;
  unitRate: number;
  discount?: number;
  taxRate?: number;
  lineSubtotal: number;
  lineDiscount: number;
  lineTax: number;
  lineTotal: number;
  notes?: string;
  createdAt: string;
}

export type ChargeType =
  | "FREIGHT"
  | "TRANSPORT"
  | "LOADING"
  | "UNLOADING"
  | "HANDLING"
  | "INSURANCE"
  | "OTHER";

export const CHARGE_TYPES: readonly ChargeType[] = [
  "FREIGHT",
  "TRANSPORT",
  "LOADING",
  "UNLOADING",
  "HANDLING",
  "INSURANCE",
  "OTHER",
];

export type PayableToType =
  | "SUPPLIER"
  | "TRANSPORTER"
  | "OTHER_VENDOR"
  | "EMPLOYEE"
  | "CASH"
  | "OTHER";

export const PAYABLE_TO_TYPES: readonly PayableToType[] = [
  "SUPPLIER",
  "TRANSPORTER",
  "OTHER_VENDOR",
  "EMPLOYEE",
  "CASH",
  "OTHER",
];

export type ChargeAllocationMethod =
  | "BY_VALUE"
  | "BY_QUANTITY"
  | "BY_WEIGHT"
  | "BY_VOLUME"
  | "EQUAL"
  | "MANUAL";

export interface PurchaseCharge {
  id: EntityId;
  purchaseOrderId: EntityId;
  chargeType: ChargeType;
  description?: string;
  amount: number;
  taxAmount: number;
  currency: string;
  payableToType: PayableToType;
  payableToSupplierId?: EntityId;
  expenseCategory?: string;
  capitalizeToInventory: boolean;
  allocationMethod?: ChargeAllocationMethod;
  notes?: string;
  createdAt: string;
}

// ============================================================ goods receipts

export type GoodsReceiptStatus = "DRAFT" | "POSTED" | "CANCELLED";

export const GOODS_RECEIPT_STATUSES: readonly GoodsReceiptStatus[] = [
  "DRAFT",
  "POSTED",
  "CANCELLED",
];

export interface GoodsReceipt {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  outletId?: EntityId;
  purchaseOrderId: EntityId;
  supplierId: EntityId;
  receiptNumber: string;
  receivedAt: string;
  receivedBy: EntityId;
  locationId: EntityId;
  status: GoodsReceiptStatus;
  notes?: string;
  postedAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface GoodsReceiptItem {
  id: EntityId;
  goodsReceiptId: EntityId;
  purchaseOrderItemId?: EntityId;
  inventoryItemId: EntityId;
  orderedQuantity?: number;
  receivedQuantity: number;
  acceptedQuantity?: number;
  rejectedQuantity?: number;
  uom: EntityId;
  unitRate: number;
  batchNumber?: string;
  expiryDate?: string;
  manufacturingDate?: string;
  rejectionReason?: string;
  notes?: string;
  ledgerId?: EntityId;
  createdAt: string;
}

// ============================================================ purchase invoices

export type InvoiceStatus =
  | "DRAFT"
  | "POSTED"
  | "PARTIALLY_PAID"
  | "FULLY_PAID"
  | "CANCELLED";

export const INVOICE_STATUSES: readonly InvoiceStatus[] = [
  "DRAFT",
  "POSTED",
  "PARTIALLY_PAID",
  "FULLY_PAID",
  "CANCELLED",
];

export interface PurchaseInvoice {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  outletId?: EntityId;
  supplierId: EntityId;
  purchaseOrderId?: EntityId;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  status: InvoiceStatus;
  notes?: string;
  postedAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseInvoiceItem {
  id: EntityId;
  organizationId: EntityId;
  invoiceId: EntityId;
  purchaseOrderItemId?: EntityId;
  goodsReceiptItemId?: EntityId;
  itemId: EntityId;
  description: string;
  quantity: number;
  unitId: EntityId;
  unitRate: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
  createdAt: string;
}

// ============================================================ supplier payments

export type PaymentMethod =
  | "CASH"
  | "BANK_TRANSFER"
  | "CHEQUE"
  | "UPI"
  | "CREDIT_CARD"
  | "OTHER";

export const PAYMENT_METHODS: readonly PaymentMethod[] = [
  "CASH",
  "BANK_TRANSFER",
  "CHEQUE",
  "UPI",
  "CREDIT_CARD",
  "OTHER",
];

export type PaymentStatus = "POSTED" | "CANCELLED";

export const PAYMENT_STATUSES: readonly PaymentStatus[] = ["POSTED", "CANCELLED"];

export interface SupplierPayment {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  outletId?: EntityId;
  supplierId: EntityId;
  paymentNumber: string;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  referenceNumber?: string;
  totalAmount: number;
  allocatedAmount: number;
  unallocatedAmount: number;
  status: PaymentStatus;
  notes?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentAllocation {
  id: EntityId;
  organizationId: EntityId;
  paymentId: EntityId;
  invoiceId: EntityId;
  allocatedAmount: number;
  allocatedAt: string;
}

// ============================================================ purchase returns

export type ReturnStatus = "DRAFT" | "POSTED" | "CANCELLED";

export const RETURN_STATUSES: readonly ReturnStatus[] = [
  "DRAFT",
  "POSTED",
  "CANCELLED",
];

export interface PurchaseReturn {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  outletId?: EntityId;
  supplierId: EntityId;
  goodsReceiptId: EntityId;
  returnNumber: string;
  returnDate: string;
  status: ReturnStatus;
  notes?: string;
  postedAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseReturnItem {
  id: EntityId;
  organizationId: EntityId;
  returnId: EntityId;
  goodsReceiptItemId: EntityId;
  itemId: EntityId;
  quantity: number;
  unitId: EntityId;
  unitCost: number;
  totalCost: number;
  reason?: string;
  ledgerId?: EntityId;
  createdAt: string;
}
