import { useState } from "react";
import { FileText, Plus, Edit, Copy, Archive, Eye } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { DocumentTemplate, DocumentType, DocumentTemplateScope } from "@/domain/documents/types";
import { DOCUMENT_TYPES } from "@/domain/documents/types";

const MOCK_TEMPLATES: DocumentTemplate[] = [
  {
    id: "dt_1",
    organizationId: null,
    propertyId: null,
    documentType: "INVOICE",
    name: "Standard Invoice",
    description: "Default invoice template for all organizations",
    format: "HTML",
    content: "<html>...</html>",
    status: "ACTIVE",
    version: 1,
    isDefault: true,
    scope: "PLATFORM_DEFAULT",
    createdBy: "system",
    updatedBy: "system",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "dt_2",
    organizationId: null,
    propertyId: null,
    documentType: "RECEIPT",
    name: "Payment Receipt",
    description: "Standard payment receipt template",
    format: "HTML",
    content: "<html>...</html>",
    status: "ACTIVE",
    version: 1,
    isDefault: true,
    scope: "PLATFORM_DEFAULT",
    createdBy: "system",
    updatedBy: "system",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "dt_3",
    organizationId: null,
    propertyId: null,
    documentType: "RESERVATION_CONFIRMATION",
    name: "Reservation Confirmation",
    description: "Hotel reservation confirmation letter",
    format: "HTML",
    content: "<html>...</html>",
    status: "ACTIVE",
    version: 1,
    isDefault: true,
    scope: "PLATFORM_DEFAULT",
    createdBy: "system",
    updatedBy: "system",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "dt_4",
    organizationId: "org_1",
    propertyId: null,
    documentType: "INVOICE",
    name: "Custom Invoice - Premium",
    description: "Custom invoice template with branding",
    format: "HTML",
    content: "<html>...</html>",
    status: "ACTIVE",
    version: 2,
    isDefault: false,
    scope: "ORGANIZATION_CUSTOM",
    createdBy: "user_1",
    updatedBy: "user_1",
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
  },
  {
    id: "dt_5",
    organizationId: null,
    propertyId: null,
    documentType: "FOLIO",
    name: "Hotel Folio",
    description: "Guest folio with itemized charges",
    format: "HTML",
    content: "<html>...</html>",
    status: "ACTIVE",
    version: 1,
    isDefault: true,
    scope: "PLATFORM_DEFAULT",
    createdBy: "system",
    updatedBy: "system",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "dt_6",
    organizationId: null,
    propertyId: null,
    documentType: "PURCHASE_ORDER",
    name: "Purchase Order",
    description: "Standard purchase order template",
    format: "HTML",
    content: "<html>...</html>",
    status: "ACTIVE",
    version: 1,
    isDefault: true,
    scope: "PLATFORM_DEFAULT",
    createdBy: "system",
    updatedBy: "system",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
];

export default function DocumentTemplatesPage() {
  const [filterType, setFilterType] = useState<DocumentType | null>(null);
  const [filterScope, setFilterScope] = useState<DocumentTemplateScope | null>(null);

  const filteredTemplates = MOCK_TEMPLATES.filter((template) => {
    if (filterType && template.documentType !== filterType) return false;
    if (filterScope && template.scope !== filterScope) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Document Templates</h1>
          <p className="mt-1 text-sm text-muted">
            Manage templates for generating business documents
          </p>
        </div>
        <Button>
          <Plus className="mr-2 size-4" />
          Create Template
        </Button>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border pb-4">
          <select
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
            value={filterType ?? ""}
            onChange={(e) => setFilterType(e.target.value as DocumentType || null)}
          >
            <option value="">All Document Types</option>
            {DOCUMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <select
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
            value={filterScope ?? ""}
            onChange={(e) => setFilterScope(e.target.value as DocumentTemplateScope || null)}
          >
            <option value="">All Scopes</option>
            <option value="PLATFORM_DEFAULT">Platform Default</option>
            <option value="ORGANIZATION_CUSTOM">Organization Custom</option>
            <option value="PROPERTY_CUSTOM">Property Custom</option>
          </select>
        </div>

        <div className="grid grid-cols-1 gap-4 pt-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50">
                    <FileText className="size-5 text-brand-600" />
                  </div>
                  <div>
                    <h3 className="font-medium text-ink">{template.name}</h3>
                    <p className="text-xs text-muted">{template.documentType.replace(/_/g, " ")}</p>
                  </div>
                </div>
                <ScopeBadge scope={template.scope} />
              </div>

              <p className="text-sm text-muted">{template.description}</p>

              <div className="flex items-center justify-between text-xs text-muted">
                <span>Version {template.version}</span>
                <span>Format: {template.format}</span>
              </div>

              <div className="flex items-center gap-2 border-t border-border pt-3">
                <Button variant="ghost" size="sm" className="flex-1">
                  <Eye className="mr-2 size-4" />
                  Preview
                </Button>
                <Button variant="ghost" size="sm" className="flex-1">
                  <Edit className="mr-2 size-4" />
                  Edit
                </Button>
                <Button variant="ghost" size="sm">
                  <Copy className="size-4" />
                </Button>
                <Button variant="ghost" size="sm">
                  <Archive className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {filteredTemplates.length === 0 && (
          <div className="py-12 text-center">
            <FileText className="mx-auto size-12 text-muted" />
            <p className="mt-4 text-sm text-muted">No templates found</p>
          </div>
        )}
      </Card>
    </div>
  );
}

function ScopeBadge({ scope }: { scope: DocumentTemplateScope }) {
  const tone =
    scope === "PLATFORM_DEFAULT"
      ? "brand"
      : scope === "ORGANIZATION_CUSTOM"
        ? "success"
        : "warning";

  const label =
    scope === "PLATFORM_DEFAULT"
      ? "Platform"
      : scope === "ORGANIZATION_CUSTOM"
        ? "Organization"
        : "Property";

  return <Badge tone={tone}>{label}</Badge>;
}
