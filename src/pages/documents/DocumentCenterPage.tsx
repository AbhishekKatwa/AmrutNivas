import { useState } from "react";
import { Search, Filter, Upload, FileText, Calendar, Tag, Download, Eye, Share2, Archive, MoreVertical } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { TextInput } from "@/components/ui/TextInput";
import type { Document, DocumentType, DocumentStatus, DocumentExpiryStatus } from "@/domain/documents/types";
import { DOCUMENT_TYPES, DOCUMENT_STATUSES } from "@/domain/documents/types";

type DocumentFilter = {
  search: string;
  documentType: DocumentType | null;
  status: DocumentStatus | null;
  expiryStatus: DocumentExpiryStatus | null;
  propertyId: string | null;
};

const MOCK_DOCUMENTS: Document[] = [
  {
    id: "doc_1",
    organizationId: "org_1",
    propertyId: "prop_1",
    outletId: null,
    documentType: "INVOICE",
    name: "Invoice INV-2026-001",
    description: "Invoice for order #12345",
    fileName: "invoice_001.pdf",
    mimeType: "application/pdf",
    fileSize: 245678,
    storageReference: "org_1/invoices/inv_001.pdf",
    checksum: "abc123",
    version: 1,
    status: "ACTIVE",
    visibility: "CUSTOMER_VISIBLE",
    classification: "INTERNAL",
    uploadedBy: "user_1",
    createdAt: "2026-10-01T10:00:00Z",
    updatedAt: "2026-10-01T10:00:00Z",
    expiryDate: null,
    issueDate: "2026-10-01",
    documentNumber: "INV-2026-001",
    issuer: "AMRUT NIVAAS",
    tags: ["invoice", "october"],
    category: "Finance",
    notes: null,
    retentionUntil: null,
  },
  {
    id: "doc_2",
    organizationId: "org_1",
    propertyId: "prop_1",
    outletId: null,
    documentType: "LICENSE",
    name: "FSSAI License",
    description: "Food safety license",
    fileName: "fssai_license.pdf",
    mimeType: "application/pdf",
    fileSize: 534890,
    storageReference: "org_1/licenses/fssai.pdf",
    checksum: "def456",
    version: 2,
    status: "ACTIVE",
    visibility: "ORGANIZATION",
    classification: "CONFIDENTIAL",
    uploadedBy: "user_1",
    createdAt: "2026-09-15T10:00:00Z",
    updatedAt: "2026-10-01T10:00:00Z",
    expiryDate: "2026-11-15",
    issueDate: "2025-11-15",
    documentNumber: "FSSAI-123456",
    issuer: "FSSAI",
    tags: ["license", "compliance"],
    category: "Compliance",
    notes: "Renewal due in 30 days",
    retentionUntil: null,
  },
  {
    id: "doc_3",
    organizationId: "org_1",
    propertyId: "prop_1",
    outletId: null,
    documentType: "EMPLOYEE_DOCUMENT",
    name: "Employee ID Proof - John Doe",
    description: "Aadhaar card copy",
    fileName: "john_aadhaar.pdf",
    mimeType: "application/pdf",
    fileSize: 1234567,
    storageReference: "org_1/employees/john_aadhaar.pdf",
    checksum: "ghi789",
    version: 1,
    status: "ACTIVE",
    visibility: "EMPLOYEE_VISIBLE",
    classification: "RESTRICTED",
    uploadedBy: "user_2",
    createdAt: "2026-09-20T10:00:00Z",
    updatedAt: "2026-09-20T10:00:00Z",
    expiryDate: null,
    issueDate: null,
    documentNumber: null,
    issuer: null,
    tags: ["employee", "id-proof"],
    category: "HR",
    notes: null,
    retentionUntil: null,
  },
  {
    id: "doc_4",
    organizationId: "org_1",
    propertyId: "prop_1",
    outletId: null,
    documentType: "INSURANCE_DOCUMENT",
    name: "Property Insurance",
    description: "Annual property insurance policy",
    fileName: "insurance_2026.pdf",
    mimeType: "application/pdf",
    fileSize: 2345678,
    storageReference: "org_1/insurance/property_2026.pdf",
    checksum: "jkl012",
    version: 1,
    status: "ACTIVE",
    visibility: "PROPERTY",
    classification: "CONFIDENTIAL",
    uploadedBy: "user_1",
    createdAt: "2026-01-01T10:00:00Z",
    updatedAt: "2026-01-01T10:00:00Z",
    expiryDate: "2026-12-31",
    issueDate: "2026-01-01",
    documentNumber: "INS-2026-001",
    issuer: "Insurance Corp",
    tags: ["insurance", "property"],
    category: "Compliance",
    notes: null,
    retentionUntil: null,
  },
];

export default function DocumentCenterPage() {
  const [filters, setFilters] = useState<DocumentFilter>({
    search: "",
    documentType: null,
    status: null,
    expiryStatus: null,
    propertyId: null,
  });

  const filteredDocuments = MOCK_DOCUMENTS.filter((doc) => {
    if (filters.search && !doc.name.toLowerCase().includes(filters.search.toLowerCase())) {
      return false;
    }
    if (filters.documentType && doc.documentType !== filters.documentType) {
      return false;
    }
    if (filters.status && doc.status !== filters.status) {
      return false;
    }
    return true;
  });

  const expiringDocuments = MOCK_DOCUMENTS.filter((doc) => {
    if (!doc.expiryDate) return false;
    const expiry = new Date(doc.expiryDate);
    const now = new Date();
    const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry <= 30 && daysUntilExpiry >= 0;
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Documents</h1>
          <p className="mt-1 text-sm text-muted">
            Manage business documents, templates and generated files
          </p>
        </div>
        <Button>
          <Upload className="mr-2 size-4" />
          Upload Document
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50">
              <FileText className="size-5 text-brand-600" />
            </div>
            <div>
              <p className="text-sm text-muted">Total Documents</p>
              <p className="text-2xl font-semibold text-ink">{MOCK_DOCUMENTS.length}</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-warning-50">
              <Calendar className="size-5 text-warning-600" />
            </div>
            <div>
              <p className="text-sm text-muted">Expiring Soon</p>
              <p className="text-2xl font-semibold text-ink">{expiringDocuments.length}</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-success-50">
              <Tag className="size-5 text-success-600" />
            </div>
            <div>
              <p className="text-sm text-muted">Templates</p>
              <p className="text-2xl font-semibold text-ink">12</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50">
              <Archive className="size-5 text-brand-600" />
            </div>
            <div>
              <p className="text-sm text-muted">Storage Used</p>
              <p className="text-2xl font-semibold text-ink">2.4 GB</p>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px]">
              <TextInput
                placeholder="Search documents..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                leadingIcon={<Search className="size-4" />}
              />
            </div>
            <select
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
              value={filters.documentType ?? ""}
              onChange={(e) =>
                setFilters({ ...filters, documentType: e.target.value as DocumentType || null })
              }
            >
              <option value="">All Types</option>
              {DOCUMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            <select
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
              value={filters.status ?? ""}
              onChange={(e) =>
                setFilters({ ...filters, status: e.target.value as DocumentStatus || null })
              }
            >
              <option value="">All Statuses</option>
              {DOCUMENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <Button variant="ghost" size="sm">
              <Filter className="mr-2 size-4" />
              More Filters
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted">
                  <th className="pb-2 pr-4">Name</th>
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4">Size</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Expiry</th>
                  <th className="pb-2 pr-4">Uploaded</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocuments.map((doc) => (
                  <tr key={doc.id} className="border-b border-border last:border-0">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3">
                        <FileText className="size-5 text-muted" />
                        <div>
                          <p className="font-medium text-ink">{doc.name}</p>
                          <p className="text-xs text-muted">{doc.fileName}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge tone="neutral">{doc.documentType}</Badge>
                    </td>
                    <td className="py-3 pr-4 text-muted">
                      {formatFileSize(doc.fileSize)}
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={doc.status} />
                    </td>
                    <td className="py-3 pr-4">
                      {doc.expiryDate ? (
                        <ExpiryBadge expiryDate={doc.expiryDate} />
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-muted">
                      {formatDate(doc.createdAt)}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm">
                          <Eye className="size-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Download className="size-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Share2 className="size-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredDocuments.length === 0 && (
            <div className="py-12 text-center">
              <FileText className="mx-auto size-12 text-muted" />
              <p className="mt-4 text-sm text-muted">No documents found</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: DocumentStatus }) {
  const tone =
    status === "ACTIVE"
      ? "success"
      : status === "ARCHIVED"
        ? "neutral"
        : status === "EXPIRED"
          ? "warning"
          : "danger";

  return <Badge tone={tone}>{status}</Badge>;
}

function ExpiryBadge({ expiryDate }: { expiryDate: string }) {
  const expiry = new Date(expiryDate);
  const now = new Date();
  const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  let tone: "success" | "warning" | "danger" = "success";
  let label = `${daysUntilExpiry} days`;

  if (daysUntilExpiry < 0) {
    tone = "danger";
    label = "Expired";
  } else if (daysUntilExpiry <= 30) {
    tone = "warning";
    label = `${daysUntilExpiry} days`;
  }

  return <Badge tone={tone}>{label}</Badge>;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
