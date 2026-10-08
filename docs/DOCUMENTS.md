# Document Management, Templates & Digital Records

> Unified document architecture for AMRUT NIVAAS — one canonical system for every business document, template, and digital record.

## Overview

Every important business document in AMRUT NIVAAS follows one consistent, secure, auditable document architecture:

- **Business Record** → Invoice, Reservation, Quotation, Employee, Customer
- **Document** → PDF, Image, Contract, Receipt generated from or attached to a record
- **Attachment** → A document linked to a business record via polymorphic relationship

The document layer never duplicates business records. It renders, stores, and links them.

## Core Entities

### Document

The canonical document entity:

```typescript
{
  id: DocumentId
  organizationId: EntityId
  propertyId?: EntityId
  outletId?: EntityId
  documentType: DocumentType
  name: string
  description?: string
  fileName: string
  mimeType: string
  fileSize: number
  storageReference: string
  version: number
  status: DocumentStatus
  visibility: DocumentVisibility
  classification: DocumentClassification
  uploadedBy: EntityId
  expiryDate?: string
  retentionUntil?: string
  metadata?: Record<string, any>
  createdAt: string
  updatedAt: string
}
```

### Document Types

Extensible taxonomy covering all business documents:

- **Financial**: INVOICE, RECEIPT, QUOTATION, PURCHASE_ORDER, GOODS_RECEIPT, CREDIT_NOTE, DEBIT_NOTE, PAYMENT_RECEIPT
- **Hospitality**: RESERVATION_CONFIRMATION, BOOKING_CONFIRMATION, FOLIO, MENU, PRICE_LIST
- **Events**: EVENT_QUOTATION, EVENT_CONTRACT, EVENT_DOCUMENT
- **People**: EMPLOYEE_DOCUMENT, CUSTOMER_DOCUMENT, SUPPLIER_DOCUMENT
- **Property**: PROPERTY_DOCUMENT, LICENSE, CERTIFICATE, ID_PROOF, TAX_DOCUMENT, BANK_DOCUMENT, INSURANCE_DOCUMENT, MAINTENANCE_DOCUMENT
- **System**: REPORT, EXPORT, IMAGE, OTHER

### Document Status

- `ACTIVE` — live and accessible
- `ARCHIVED` — soft-deleted, still searchable by authorized users
- `EXPIRED` — past expiry date
- `DELETED` — marked for deletion (follows retention rules)

Financial and audit documents follow existing retention policies.

### Document Visibility

Controls default access scope (never overrides authorization):

- `PRIVATE` — uploader only
- `ORGANIZATION` — entire organization
- `PROPERTY` — property-level access
- `OUTLET` — outlet-level access
- `INTERNAL` — internal staff only
- `CUSTOMER_VISIBLE` — customer can access (still requires auth)
- `SUPPLIER_VISIBLE` — supplier can access
- `EMPLOYEE_VISIBLE` — employee can access

### Document Classification

Privacy and security classification:

- `PUBLIC` — public documents (e.g., menu)
- `INTERNAL` — internal SOPs
- `CONFIDENTIAL` — supplier contracts
- `RESTRICTED` — employee ID proofs, customer ID proofs

Restricted documents are hidden from ordinary search results.

## Document Links

Polymorphic relationship linking documents to any business record:

```typescript
{
  documentId: DocumentId
  organizationId: EntityId
  propertyId?: EntityId
  outletId?: EntityId
  entityType: string  // "invoice", "reservation", "employee", etc.
  entityId: EntityId
  relationshipType: DocumentRelationshipType
  createdBy: EntityId
  createdAt: string
}
```

**Relationship types**: ATTACHMENT, PRIMARY_DOCUMENT, SUPPORTING_DOCUMENT, CONTRACT, IDENTITY_PROOF, RECEIPT, INVOICE, QUOTATION, PHOTO, REPORT, EXPORT, OTHER

**Examples**:
- Document → Invoice
- Document → Reservation
- Document → Event
- Document → Supplier
- Document → Employee
- Document → Customer
- Document → Property

One `DocumentLink` table replaces dozens of attachment columns across business tables.

## Versioning

Documents support version history:

```typescript
{
  id: DocumentVersionId
  documentId: DocumentId
  versionNumber: number
  fileName: string
  mimeType: string
  fileSize: number
  storageReference: string
  checksum?: string
  uploadedBy: EntityId
  createdAt: string
}
```

**Immutable financial documents** (Invoice, Credit Note, Debit Note, Payment Receipt) cannot be silently replaced. Instead:
- New version
- Correction
- Reissue
- Reversal

according to the underlying financial workflow.

## Document Metadata

Optional metadata for rich document management:

- `tags` — searchable labels
- `category` — document category
- `expiryDate` — for licenses, certificates, insurance
- `issueDate` — when document was issued
- `documentNumber` — external reference number
- `issuer` — who issued the document
- `notes` — internal notes

## Expiry Tracking

Documents with `expiryDate` derive status automatically:

- `VALID` — expiry > 30 days
- `EXPIRING_SOON` — expiry ≤ 30 days
- `EXPIRED` — expiry < today

Expiry alerts integrate with the notification system:
- License expires in 30 days
- Insurance expires in 15 days
- Employee document expires in 7 days
- Supplier certificate expired

## Storage Abstraction

`DocumentStorageService` provides vendor-agnostic storage:

```typescript
interface StorageAdapter {
  upload(file: File, path: string): Promise<string>;
  download(reference: string): Promise<Blob>;
  delete(reference: string): Promise<void>;
  getSignedUrl(reference: string, expiresInSeconds: number): Promise<string>;
}
```

**Operations**:
- `upload` — validate and store file
- `download` — retrieve file blob
- `delete` — remove file (soft or hard)
- `getSignedUrl` — generate short-lived access URL

Storage adapter is injected; domain logic never hardcodes a vendor.

## File Upload Security

Lightweight safeguards at upload boundary:

- **Size limit**: 50 MB
- **Allowed MIME types**: PDF, JPEG, PNG, GIF, WebP, DOC, DOCX, XLS, XLSX, CSV, TXT
- **Filename sanitization**: strip path separators, normalize
- **Extension validation**: match MIME type
- **Storage isolation**: organization-scoped paths
- **Virus-scan readiness**: hook point for future integration

Never execute uploaded files. Never trust file extension alone.

## Secure Downloads

Sensitive files never use predictable public URLs.

**Access flow**:
1. Authorized request (authenticated user)
2. Permission check (documents.download)
3. Resource check (organization, property, outlet)
4. Document authorization (visibility, classification)
5. Secure access (signed URL or direct stream)
6. Download
7. Audit log

Signed URLs are short-lived (15 minutes default). Storage credentials are never exposed.

## Document Permissions

11 permissions in the `documents` domain:

- `documents.view` — view documents and document center
- `documents.upload` — upload new documents
- `documents.create` — create document records
- `documents.edit` — edit document metadata
- `documents.archive` — archive documents
- `documents.delete` — delete documents
- `documents.download` — download documents
- `documents.share` — share documents with external parties
- `documents.manage_templates` — create and manage document templates
- `documents.generate` — generate documents from templates
- `documents.export` — export documents

Resource scope applies where applicable (property, outlet).

## Document Center

UI at `/documents` provides unified document management:

**Sections**:
- All Documents
- Recent
- Shared
- Expiring
- Archived
- Templates
- Generated

**Filters**:
- Property
- Outlet
- Document Type
- Date
- Status
- Owner
- Expiry
- Tag

**Search**: by document name, document number, entity, customer, supplier, employee, property, document type, tag.

**KPIs**: Total Documents, Expiring Soon, Templates, Storage Used.

## Document Preview

Supported formats:
- PDF — inline preview
- Images (JPEG, PNG, GIF, WebP) — inline preview
- Text — inline preview

Unsupported formats:
- Download only
- No Office document viewer

## Document Upload UX

Reusable upload component with flow:

1. Select File
2. Validate (size, type)
3. Add Metadata (name, description, tags, expiry)
4. Choose Visibility
5. Link Record (optional)
6. Upload (with progress)
7. Success

Shows: upload progress, validation errors, file size, file type.

**Drag & Drop**: supported on desktop, optional. Mobile uses standard file selection.

## Template System

### DocumentTemplate

```typescript
{
  id: DocumentTemplateId
  organizationId?: EntityId
  propertyId?: EntityId
  documentType: DocumentType
  name: string
  description?: string
  format: "HTML" | "MARKDOWN" | "PLAIN_TEXT"
  content: string
  status: "ACTIVE" | "ARCHIVED"
  version: number
  scope: "PLATFORM_DEFAULT" | "ORGANIZATION_CUSTOM" | "PROPERTY_CUSTOM"
  isDefault: boolean
  createdBy: EntityId
  updatedBy: EntityId
  createdAt: string
  updatedAt: string
}
```

### Template Hierarchy

Resolution order (most specific wins):

1. Property Template
2. Organization Template
3. Platform Default

### Template Variables

Controlled variables exposed to templates:

```
{{organization.name}}
{{property.name}}
{{outlet.name}}
{{customer.name}}
{{invoice.number}}
{{invoice.date}}
{{invoice.total}}
{{reservation.number}}
{{reservation.arrival}}
{{reservation.departure}}
{{event.name}}
{{event.date}}
```

Only approved variables are accessible. No arbitrary database access through template expressions.

### Template Security

Templates are declarative. No:
- `eval()`
- Arbitrary JavaScript
- Raw SQL
- Filesystem access
- Network requests

### Default Templates

Lightweight defaults for common documents:
- Invoice
- Receipt
- Payment Receipt
- Restaurant Bill
- Hotel Folio
- Reservation Confirmation
- Purchase Order
- Goods Receipt
- Event Quotation
- Event Booking Confirmation
- Employee Document

Templates reuse actual domain fields. No fake fields.

## Document Generation

`DocumentGenerationService` renders documents from templates:

**Flow**:
1. Business Record (Invoice, Reservation, etc.)
2. Template (resolved via hierarchy)
3. Data Mapping (record fields → template variables)
4. Rendered Document (HTML/Markdown/Text)
5. Output Format (PDF/HTML/other)
6. Document (stored with metadata)
7. Audit (logged)

Generation does not duplicate business logic. It renders existing data.

### Invoice Documents

Finance generates Invoice PDF from existing invoice record:

```
Invoice → Validate → Template → Generate → Document → Link to Invoice
```

No second invoice model.

### Restaurant Receipts

Restaurant bill generation:

```
Order → Completed Bill → Generate Receipt → Document
```

Receipt reflects actual finalized order totals. No recalculation.

### Hotel Folio

Folio generation:

```
Folio → Finalize → Generate Folio → Document
```

Uses existing folio data.

### Reservation Confirmation

Generates confirmation with:
- Property
- Guest
- Reservation number
- Arrival / Departure
- Room type / Room
- Rate
- Important policies
- Contact information

No internal operational data exposed.

### Purchase Documents

Procurement documents:
- Purchase Order
- Goods Receipt
- Purchase Invoice
- Supplier Payment Receipt

Reuse procurement and finance models.

### Event Documents

Events generate:
- Quotation
- Booking Confirmation
- Event Summary
- Final Bill
- Payment Receipt

Reuse Events and Finance models.

## Document Sharing

Authorized users can create controlled shares:

```
Document → Share → Recipient → Scope → Expiry → Access → Audit
```

Shares are:
- Time-limited (default 7 days)
- Revocable
- Audited

No permanent public URLs for sensitive files.

## Customer-Facing Documents

Customer-visible documents delivered through existing communication channels:
- Email
- SMS link
- WhatsApp link
- Portal

Reuse notification system. No separate communication system.

## Supplier Documents

Supplier-facing documents:
- Purchase Order
- Goods Receipt
- Payment Receipt

Use existing communication adapters.

## Document Audit

Audited operations:
- Document uploaded
- Document viewed
- Document downloaded
- Document generated
- Document shared
- Share revoked
- Document archived
- Document restored
- Template created
- Template changed
- Document regenerated

Harmless UI events (hover, click) are not audited.

## Generated Document Metadata

Generated documents retain traceability:

```typescript
{
  sourceEntityType: string
  sourceEntityId: EntityId
  templateId: DocumentTemplateId
  templateVersion: number
  generatedBy: EntityId
  generatedAt: string
}
```

## Document Regeneration

Regenerating a document creates a new version. No silent overwrite.

```
Document → Version 1, Version 2, Version 3
```

## Business Document Numbering

Document numbering (Invoice number, PO number, Reservation number) comes from the respective domain. The document merely renders the number.

## Exports

Reuse existing export infrastructure. Exports may become Documents:

```
Report → Generate → Document → Download
```

Respect export permissions and audit.

## Document Retention

Lightweight retention metadata:

```typescript
retentionUntil?: string
```

No complex legal retention engine. Financial and audit records respect existing security/retention rules.

## Document Archiving

Documents can be archived and restored:
- Archive — soft-delete, still searchable
- Restore — bring back to active

No physical deletion by default.

## Document Cleanup

No automatic deletion of old files. Future cleanup requires:
- Retention policy
- Authorization
- Audit

## Document Storage Health

Platform Admin can see:
- Storage usage
- Document count
- Failed uploads
- Failed generations
- Expiring documents

Reuse platform operations. No storage observability platform.

## Document Generation Failures

If generation fails:
- Show: "Generation failed", Request ID, Retry
- Original business record is not lost
- Invoice/payment/etc. not marked failed

Generation supports safe retry. No duplicate financial transactions.

## Printing

Browser/device-friendly print views for:
- Invoice
- Receipt
- KOT
- Quotation
- Folio
- Purchase Order

No native printer driver.

## Document Preview UX

Actions based on permissions:
- Preview
- Download
- Print
- Share
- Archive

Consistent UI throughout AMRUT NIVAAS.

## Document Panel in Business Records

Every major record has a Documents section:

```
Customer → Documents
Supplier → Documents
Reservation → Documents
Event → Documents
Employee → Documents
Invoice → Documents
Property → Documents
```

Reusable `DocumentPanel` component. No duplicate UI implementations.

## AI Integration

Reuse AI Command Center. AI may answer:
- "Show me the latest insurance document."
- "When does our fire certificate expire?"
- "Which supplier documents are missing?"
- "Generate a summary of this event quotation."

AI uses existing document authorization. No bypass.

## Analytics Integration

Reuse analytics layer. Metrics:
- Documents generated
- Documents shared
- Document generation failures
- Expiring documents
- Storage usage

No separate analytics engine.

## Onboarding Integration

Reuse setup wizard. During onboarding, suggest:
- Upload business license
- Upload GST certificate
- Upload property documents
- Upload insurance

Optional unless required by configured workflow.

## Subscription Integration

Reuse SaaS billing. If document/storage limits exist:
- Storage used
- Storage limit

Come from entitlement/usage system. No hardcoded plan names.

## Platform Admin

Extend platform operations with:
- Document Health
- Storage Usage
- Failed Generations
- Failed Uploads
- Expiring Documents

Platform Admin does not automatically gain unrestricted access to customer documents.

## Privacy

Documents classified per security architecture:

- **PUBLIC**: Public menu
- **INTERNAL**: Internal SOP
- **CONFIDENTIAL**: Supplier contract
- **RESTRICTED**: Employee ID proof, Customer ID proof

Restricted documents hidden from ordinary search results.

## Security

Full security chain applied:

```
Authentication
↓
User Active
↓
Organization Membership
↓
Organization Active
↓
Property Access
↓
Outlet Access
↓
Module Enabled
↓
Subscription Entitlement
↓
Permission
↓
Resource Authorization
↓
Document Authorization
↓
Operation
↓
Audit
```

## Multi-Tenant Isolation

Every document query scoped by `organizationId`. Cross-organization access impossible.

## Digital Signature Readiness

Lightweight abstraction (optional):

```typescript
{
  documentId: DocumentId
  requestedFrom: string
  status: "DRAFT" | "SENT" | "VIEWED" | "SIGNED" | "DECLINED" | "EXPIRED" | "CANCELLED"
  requestedAt: string
  completedAt?: string
  providerReference?: string
}
```

Provider abstraction only. No complete e-signature implementation.

## Implementation Status

**Completed**:
- Core domain types (Document, DocumentLink, DocumentVersion, DocumentTemplate, DocumentShare, SignatureRequest, DocumentAudit)
- Service layer with storage abstraction, document CRUD, template management, generation, sharing, audit
- Document Center UI at `/documents`
- Document Templates UI at `/documents/templates`
- 11 document permissions added to catalogue
- Routes wired
- Typecheck passes
- Build succeeds

**Pending**:
- SQL migration for document tables
- Actual storage adapter implementation (currently interface)
- Integration with existing modules (Invoice, Reservation, Folio, Event, Employee, Supplier, Property)
- Document sections in business record screens
- Document expiry alerts integration with notifications
- Seed data for demo documents
- PDF generation engine
- Template rendering engine

## Architecture Decisions

1. **One canonical document system** — not per-module duplicates
2. **Polymorphic links** — one `DocumentLink` table, not dozens of attachment columns
3. **Storage abstraction** — vendor-agnostic, injectable adapter
4. **Template hierarchy** — property → org → platform, most specific wins
5. **Versioning** — important documents versioned, not overwritten
6. **Expiry tracking** — derived status, not manually stored
7. **Visibility vs authorization** — visibility never overrides auth
8. **Secure downloads** — signed URLs, not public
9. **Audit trail** — all document operations logged
10. **No arbitrary code in templates** — declarative only

## File Structure

```
src/domain/documents/
  types.ts              — core document domain types
  document-service.ts   — service layer with storage abstraction

src/pages/documents/
  DocumentCenterPage.tsx       — main document center UI
  DocumentTemplatesPage.tsx    — template management UI
```

## Routes

- `/documents` — Document Center (permission: `documents.view`)
- `/documents/templates` — Template Management (permission: `documents.manage_templates`)

## Related Documentation

- [SECURITY.md](./SECURITY.md) — security architecture
- [NOTIFICATIONS_AUTOMATION.md](./NOTIFICATIONS_AUTOMATION.md) — notification system
- [PLATFORM_ADMIN.md](./PLATFORM_ADMIN.md) — platform operations
- [SUBSCRIPTIONS.md](./SUBSCRIPTIONS.md) — SaaS billing
