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
  | "PACKAGING"
  | "EQUIPMENT"
  | "MAINTENANCE"
  | "SERVICES"
  | "UTILITIES"
  | "TRANSPORT"
  | "LABOR"
  | "OTHER";

export const SUPPLIER_TYPES: readonly SupplierType[] = [
  "RAW_MATERIAL",
  "PACKAGING",
  "EQUIPMENT",
  "MAINTENANCE",
  "SERVICES",
  "UTILITIES",
  "TRANSPORT",
  "LABOR",
  "OTHER",
];

export interface Supplier {
  id: EntityId;
  organizationId: EntityId;
  supplierCode: string;
  legalName: string;
  tradeName?: string;
  supplierType: SupplierType;
  status: SupplierStatus;
  taxId?: string;
  taxType?: string;
  openingBalance?: number;
  paymentTerms?: number;
  creditLimit?: number;
  notes?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierContact {
  id: EntityId;
  organizationId: EntityId;
  supplierId: EntityId;
  contactName: string;
  designation?: string;
  phone?: string;
  email?: string;
  isPrimary: boolean;
  createdAt: string;
}

export interface SupplierAddress {
  id: EntityId;
  organizationId: EntityId;
  supplierId: EntityId;
  addressType: "BILLING" | "SHIPPING" | "OFFICE";
  addressLine1: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country: string;
  isDefault: boolean;
  createdAt: string;
}

export interface SupplierItem {
  id: EntityId;
  organizationId: EntityId;
  supplierId: EntityId;
  itemId: EntityId;
  purchaseUnitId: EntityId;
  conversionToBase: number;
  lastPurchaseRate?: number;
  standardRate?: number;
  leadTimeDays?: number;
  minimumOrderQuantity?: number;
  isPreferred: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierPriceHistory {
  id: EntityId;
  organizationId: EntityId;
  supplierId: EntityId;
  itemId: EntityId;
  purchaseOrderId?: EntityId;
  purchaseDate: string;
  unitRate: number;
  discountPercent?: number;
  taxRate?: number;
  freightAmount?: number;
  landedRate?: number;
  createdAt: string;
}

// ============================================================ purchase requests

export type PurchaseRequestStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "CONVERTED"
  | "CANCELLED";

export const PURCHASE_REQUEST_STATUSES: readonly PurchaseRequestStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "CONVERTED",
  "CANCELLED",
];

export interface PurchaseRequest {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  outletId?: EntityId;
  requestNumber: string;
  requestedAt: string;
  requestedBy: EntityId;
  status: PurchaseRequestStatus;
  notes?: string;
  approvedAt?: string;
  approvedBy?: EntityId;
  rejectionReason?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseRequestItem {
  id: EntityId;
  organizationId: EntityId;
  requestId: EntityId;
  itemId: EntityId;
  quantity: number;
  unitId: EntityId;
  estimatedRate?: number;
  preferredSupplierId?: EntityId;
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
  purchaseRequestId?: EntityId;
  supplierId: EntityId;
  poNumber: string;
  orderDate: string;
  expectedDelivery?: string;
  status: PurchaseOrderStatus;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  freightAmount: number;
  otherCharges: number;
  grandTotal: number;
  totalReceived: number;
  notes?: string;
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
  organizationId: EntityId;
  purchaseOrderId: EntityId;
  itemId: EntityId;
  description: string;
  orderedQuantity: number;
  receivedQuantity: number;
  unitId: EntityId;
  unitRate: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
  notes?: string;
  createdAt: string;
}

export type ChargeType =
  | "FREIGHT"
  | "TRANSPORT"
  | "LOADING"
  | "UNLOADING"
  | "STORAGE"
  | "INSURANCE"
  | "CUSTOMS"
  | "TAX"
  | "OTHER";

export const CHARGE_TYPES: readonly ChargeType[] = [
  "FREIGHT",
  "TRANSPORT",
  "LOADING",
  "UNLOADING",
  "STORAGE",
  "INSURANCE",
  "CUSTOMS",
  "TAX",
  "OTHER",
];

export type PayableToType = "SUPPLIER" | "TRANSPORTER" | "AGENT" | "OTHER";

export const PAYABLE_TO_TYPES: readonly PayableToType[] = [
  "SUPPLIER",
  "TRANSPORTER",
  "AGENT",
  "OTHER",
];

export interface PurchaseCharge {
  id: EntityId;
  organizationId: EntityId;
  purchaseOrderId: EntityId;
  chargeType: ChargeType;
  description: string;
  amount: number;
  payableToType: PayableToType;
  payableToId?: EntityId;
  capitalizeToInventory: boolean;
  allocationMethod: "AMOUNT" | "QUANTITY" | "VALUE";
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
  organizationId: EntityId;
  receiptId: EntityId;
  purchaseOrderItemId: EntityId;
  itemId: EntityId;
  orderedQuantity: number;
  receivedQuantity: number;
  acceptedQuantity: number;
  rejectedQuantity: number;
  unitId: EntityId;
  unitCost: number;
  totalCost: number;
  batchNumber?: string;
  expiryDate?: string;
  rejectionReason?: string;
  ledgerId?: EntityId;
  locationId: EntityId;
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
