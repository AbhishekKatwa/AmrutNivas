/**
 * Document Management domain types (Prompt #24).
 *
 * Unified document architecture for AMRUT NIVAAS — one canonical system for all
 * business documents, attachments, templates and generated files.
 *
 * Key concepts:
 *   - Document: canonical file/metadata record with storage reference
 *   - DocumentLink: polymorphic relationship between Document and any business entity
 *   - DocumentVersion: version history for important documents
 *   - DocumentTemplate: reusable templates for document generation
 *   - DocumentShare: controlled, time-limited sharing
 *
 * Architecture:
 *   Business Record → DocumentLink → Document → Storage
 *
 * Security:
 *   - Every document belongs to an organization (multi-tenant isolation)
 *   - Visibility never overrides authorization
 *   - Sensitive files use secure access, not public URLs
 *   - Full audit trail for all document operations
 */

import type { EntityId } from "@/domain/identity/types";

// =================================================================== document types

export type DocumentType =
  | "INVOICE"
  | "RECEIPT"
  | "QUOTATION"
  | "PURCHASE_ORDER"
  | "GOODS_RECEIPT"
  | "CREDIT_NOTE"
  | "DEBIT_NOTE"
  | "PAYMENT_RECEIPT"
  | "RESERVATION_CONFIRMATION"
  | "BOOKING_CONFIRMATION"
  | "FOLIO"
  | "EVENT_QUOTATION"
  | "EVENT_CONTRACT"
  | "EVENT_DOCUMENT"
  | "MENU"
  | "PRICE_LIST"
  | "EMPLOYEE_DOCUMENT"
  | "CUSTOMER_DOCUMENT"
  | "SUPPLIER_DOCUMENT"
  | "PROPERTY_DOCUMENT"
  | "LICENSE"
  | "CERTIFICATE"
  | "ID_PROOF"
  | "TAX_DOCUMENT"
  | "BANK_DOCUMENT"
  | "INSURANCE_DOCUMENT"
  | "MAINTENANCE_DOCUMENT"
  | "REPORT"
  | "EXPORT"
  | "IMAGE"
  | "OTHER";

export const DOCUMENT_TYPES: readonly DocumentType[] = [
  "INVOICE",
  "RECEIPT",
  "QUOTATION",
  "PURCHASE_ORDER",
  "GOODS_RECEIPT",
  "CREDIT_NOTE",
  "DEBIT_NOTE",
  "PAYMENT_RECEIPT",
  "RESERVATION_CONFIRMATION",
  "BOOKING_CONFIRMATION",
  "FOLIO",
  "EVENT_QUOTATION",
  "EVENT_CONTRACT",
  "EVENT_DOCUMENT",
  "MENU",
  "PRICE_LIST",
  "EMPLOYEE_DOCUMENT",
  "CUSTOMER_DOCUMENT",
  "SUPPLIER_DOCUMENT",
  "PROPERTY_DOCUMENT",
  "LICENSE",
  "CERTIFICATE",
  "ID_PROOF",
  "TAX_DOCUMENT",
  "BANK_DOCUMENT",
  "INSURANCE_DOCUMENT",
  "MAINTENANCE_DOCUMENT",
  "REPORT",
  "EXPORT",
  "IMAGE",
  "OTHER",
];

// =================================================================== document status

export type DocumentStatus = "ACTIVE" | "ARCHIVED" | "EXPIRED" | "DELETED";

export const DOCUMENT_STATUSES: readonly DocumentStatus[] = [
  "ACTIVE",
  "ARCHIVED",
  "EXPIRED",
  "DELETED",
];

// =================================================================== document visibility

export type DocumentVisibility =
  | "PRIVATE"
  | "ORGANIZATION"
  | "PROPERTY"
  | "OUTLET"
  | "INTERNAL"
  | "CUSTOMER_VISIBLE"
  | "SUPPLIER_VISIBLE"
  | "EMPLOYEE_VISIBLE";

export const DOCUMENT_VISIBILITIES: readonly DocumentVisibility[] = [
  "PRIVATE",
  "ORGANIZATION",
  "PROPERTY",
  "OUTLET",
  "INTERNAL",
  "CUSTOMER_VISIBLE",
  "SUPPLIER_VISIBLE",
  "EMPLOYEE_VISIBLE",
];

// =================================================================== document classification

export type DocumentClassification = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";

export const DOCUMENT_CLASSIFICATIONS: readonly DocumentClassification[] = [
  "PUBLIC",
  "INTERNAL",
  "CONFIDENTIAL",
  "RESTRICTED",
];

// =================================================================== document entity

export type Document = {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly propertyId: EntityId | null;
  readonly outletId: EntityId | null;

  readonly documentType: DocumentType;
  readonly name: string;
  readonly description: string | null;

  readonly fileName: string;
  readonly mimeType: string;
  readonly fileSize: number;
  readonly storageReference: string;
  readonly checksum: string | null;

  readonly version: number;
  readonly status: DocumentStatus;
  readonly visibility: DocumentVisibility;
  readonly classification: DocumentClassification;

  readonly uploadedBy: EntityId;
  readonly createdAt: string;
  readonly updatedAt: string;

  readonly expiryDate: string | null;
  readonly issueDate: string | null;
  readonly documentNumber: string | null;
  readonly issuer: string | null;

  readonly tags: readonly string[];
  readonly category: string | null;
  readonly notes: string | null;

  readonly retentionUntil: string | null;
};

// =================================================================== document link

export type DocumentRelationshipType =
  | "ATTACHMENT"
  | "PRIMARY_DOCUMENT"
  | "SUPPORTING_DOCUMENT"
  | "CONTRACT"
  | "IDENTITY_PROOF"
  | "RECEIPT"
  | "INVOICE"
  | "QUOTATION"
  | "PHOTO"
  | "REPORT"
  | "EXPORT"
  | "OTHER";

export const DOCUMENT_RELATIONSHIP_TYPES: readonly DocumentRelationshipType[] = [
  "ATTACHMENT",
  "PRIMARY_DOCUMENT",
  "SUPPORTING_DOCUMENT",
  "CONTRACT",
  "IDENTITY_PROOF",
  "RECEIPT",
  "INVOICE",
  "QUOTATION",
  "PHOTO",
  "REPORT",
  "EXPORT",
  "OTHER",
];

export type DocumentLink = {
  readonly id: EntityId;
  readonly documentId: EntityId;
  readonly organizationId: EntityId;
  readonly propertyId: EntityId | null;
  readonly outletId: EntityId | null;

  readonly entityType: string;
  readonly entityId: EntityId;
  readonly relationshipType: DocumentRelationshipType;

  readonly createdBy: EntityId;
  readonly createdAt: string;
};

// =================================================================== document version

export type DocumentVersion = {
  readonly id: EntityId;
  readonly documentId: EntityId;
  readonly versionNumber: number;

  readonly fileName: string;
  readonly mimeType: string;
  readonly fileSize: number;
  readonly storageReference: string;
  readonly checksum: string | null;

  readonly uploadedBy: EntityId;
  readonly createdAt: string;
};

// =================================================================== document template

export type DocumentTemplateScope = "PLATFORM_DEFAULT" | "ORGANIZATION_CUSTOM" | "PROPERTY_CUSTOM";

export const DOCUMENT_TEMPLATE_SCOPES: readonly DocumentTemplateScope[] = [
  "PLATFORM_DEFAULT",
  "ORGANIZATION_CUSTOM",
  "PROPERTY_CUSTOM",
];

export type DocumentTemplateFormat = "HTML" | "PDF" | "EXCEL" | "CSV";

export const DOCUMENT_TEMPLATE_FORMATS: readonly DocumentTemplateFormat[] = [
  "HTML",
  "PDF",
  "EXCEL",
  "CSV",
];

export type DocumentTemplateStatus = "ACTIVE" | "ARCHIVED" | "DRAFT";

export const DOCUMENT_TEMPLATE_STATUSES: readonly DocumentTemplateStatus[] = [
  "ACTIVE",
  "ARCHIVED",
  "DRAFT",
];

export type DocumentTemplate = {
  readonly id: EntityId;
  readonly organizationId: EntityId | null;
  readonly propertyId: EntityId | null;

  readonly documentType: DocumentType;
  readonly name: string;
  readonly description: string | null;
  readonly format: DocumentTemplateFormat;
  readonly content: string;

  readonly status: DocumentTemplateStatus;
  readonly version: number;
  readonly isDefault: boolean;
  readonly scope: DocumentTemplateScope;

  readonly createdBy: EntityId;
  readonly updatedBy: EntityId;
  readonly createdAt: string;
  readonly updatedAt: string;
};

// =================================================================== document share

export type DocumentShareStatus = "ACTIVE" | "REVOKED" | "EXPIRED";

export const DOCUMENT_SHARE_STATUSES: readonly DocumentShareStatus[] = [
  "ACTIVE",
  "REVOKED",
  "EXPIRED",
];

export type DocumentShare = {
  readonly id: EntityId;
  readonly documentId: EntityId;
  readonly organizationId: EntityId;

  readonly recipientEmail: string;
  readonly recipientName: string | null;

  readonly scope: string | null;
  readonly expiresAt: string | null;
  readonly status: DocumentShareStatus;

  readonly sharedBy: EntityId;
  readonly createdAt: string;
  readonly revokedAt: string | null;
};

// =================================================================== signature request

export type SignatureRequestStatus =
  | "DRAFT"
  | "SENT"
  | "VIEWED"
  | "SIGNED"
  | "DECLINED"
  | "EXPIRED"
  | "CANCELLED";

export const SIGNATURE_REQUEST_STATUSES: readonly SignatureRequestStatus[] = [
  "DRAFT",
  "SENT",
  "VIEWED",
  "SIGNED",
  "DECLINED",
  "EXPIRED",
  "CANCELLED",
];

export type SignatureRequest = {
  readonly id: EntityId;
  readonly documentId: EntityId;
  readonly organizationId: EntityId;

  readonly requestedFrom: string;
  readonly status: SignatureRequestStatus;

  readonly requestedAt: string;
  readonly completedAt: string | null;
  readonly providerReference: string | null;

  readonly requestedBy: EntityId;
  readonly createdAt: string;
  readonly updatedAt: string;
};

// =================================================================== document audit

export type DocumentAuditAction =
  | "UPLOADED"
  | "VIEWED"
  | "DOWNLOADED"
  | "GENERATED"
  | "SHARED"
  | "SHARE_REVOKED"
  | "ARCHIVED"
  | "RESTORED"
  | "TEMPLATE_CREATED"
  | "TEMPLATE_CHANGED"
  | "REGENERATED"
  | "VERSION_CREATED"
  | "DELETED";

export const DOCUMENT_AUDIT_ACTIONS: readonly DocumentAuditAction[] = [
  "UPLOADED",
  "VIEWED",
  "DOWNLOADED",
  "GENERATED",
  "SHARED",
  "SHARE_REVOKED",
  "ARCHIVED",
  "RESTORED",
  "TEMPLATE_CREATED",
  "TEMPLATE_CHANGED",
  "REGENERATED",
  "VERSION_CREATED",
  "DELETED",
];

export type DocumentAudit = {
  readonly id: EntityId;
  readonly documentId: EntityId | null;
  readonly organizationId: EntityId;

  readonly action: DocumentAuditAction;
  readonly performedBy: EntityId;
  readonly performedAt: string;

  readonly metadata: Record<string, unknown> | null;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
};

// =================================================================== expiry status

export type DocumentExpiryStatus = "VALID" | "EXPIRING_SOON" | "EXPIRED";

export function deriveExpiryStatus(expiryDate: string | null): DocumentExpiryStatus | null {
  if (!expiryDate) return null;

  const now = new Date();
  const expiry = new Date(expiryDate);
  const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysUntilExpiry < 0) return "EXPIRED";
  if (daysUntilExpiry <= 30) return "EXPIRING_SOON";
  return "VALID";
}
