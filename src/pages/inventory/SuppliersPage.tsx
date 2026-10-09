/**
 * Suppliers — the supplier master for the organization.
 *
 * Phase 2 destination. Lists, creates, edits, archives suppliers
 * through supplier-service createSupplier / updateSupplier / archiveSupplier.
 *
 * Phase A fix: UI-0019 — was a read-only directory; needed a Create form.
 */

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Users, Pencil, Archive } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { LoadingBlock } from "@/components/ui/Spinner";
import { SelectInput, type SelectOption } from "@/components/ui/SelectInput";
import { TextInput } from "@/components/ui/TextInput";
import {
  listSuppliers,
  createSupplier,
  updateSupplier,
  archiveSupplier,
} from "@/domain/procurement/supplier-service";
import type { Supplier, SupplierType } from "@/domain/procurement/types";
import { SUPPLIER_TYPES } from "@/domain/procurement/types";
import { useContextStore } from "@/state/context-store";

type SupplierFormState = {
  legalName: string;
  displayName: string;
  supplierType: SupplierType;
  taxIdentifier: string;
  openingBalance: string;
  paymentTermsDays: string;
  creditLimit: string;
  notes: string;
};

const EMPTY_FORM: SupplierFormState = {
  legalName: "",
  displayName: "",
  supplierType: "RAW_MATERIAL",
  taxIdentifier: "",
  openingBalance: "0",
  paymentTermsDays: "30",
  creditLimit: "0",
  notes: "",
};

const SUPPLIER_TYPE_OPTIONS: SelectOption<SupplierType>[] = SUPPLIER_TYPES.map(
  (t) => ({ value: t, label: t.replace(/_/g, " ") }),
);

const COLUMNS: DataColumn<Supplier>[] = [
  {
    key: "code",
    header: "Code",
    render: (row) => (
      <span className="font-mono text-xs">{row.supplierCode}</span>
    ),
  },
  { key: "name", header: "Legal Name", render: (row) => row.legalName },
  {
    key: "displayName",
    header: "Display Name",
    render: (row) => row.displayName || "—",
  },
  {
    key: "type",
    header: "Type",
    render: (row) => (
      <Badge tone="muted">{row.supplierType.replace(/_/g, " ")}</Badge>
    ),
  },
  {
    key: "tax",
    header: "Tax",
    render: (row) => row.taxIdentifier || "—",
  },
  {
    key: "terms",
    header: "Terms",
    render: (row) => (
      <span className="tabular-nums">{row.paymentTermsDays ?? 0}d</span>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (row) => (
      <Badge tone={row.status === "ACTIVE" ? "success" : "muted"}>
        {row.status}
      </Badge>
    ),
  },
];

export default function SuppliersPage() {
  const context = useContextStore((s) => s.context);
  const organizationId = context.organizationId;

  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<SupplierFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [query, setQuery] = useState("");
  const [filterType, setFilterType] = useState<SupplierType | "ALL">("ALL");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");

  function refresh() {
    if (!organizationId) return;
    listSuppliers(organizationId)
      .then(setSuppliers)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }

  useEffect(refresh, [organizationId]);

  const filtered = useMemo(() => {
    if (!suppliers) return [];
    return suppliers.filter((s) => {
      if (filterType !== "ALL" && s.supplierType !== filterType) return false;
      if (filterStatus !== "ALL" && s.status !== filterStatus) return false;
      if (query) {
        const q = query.toLowerCase();
        if (
          !s.legalName.toLowerCase().includes(q) &&
          !(s.displayName ?? "").toLowerCase().includes(q) &&
          !s.supplierCode.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [suppliers, query, filterType, filterStatus]);

  if (suppliers === null) return <LoadingBlock label="Loading suppliers" />;

  const active = suppliers.filter((s) => s.status === "ACTIVE");
  const types = new Set(suppliers.map((s) => s.supplierType));

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
    setDialogOpen(true);
  }

  function openEdit(s: Supplier) {
    setEditing(s);
    setForm({
      legalName: s.legalName,
      displayName: s.displayName ?? "",
      supplierType: s.supplierType,
      taxIdentifier: s.taxIdentifier ?? "",
      openingBalance: String(s.openingBalance ?? 0),
      paymentTermsDays: String(s.paymentTermsDays ?? 30),
      creditLimit: String(s.creditLimit ?? 0),
      notes: s.notes ?? "",
    });
    setError(null);
    setDialogOpen(true);
  }

  async function handleSubmit() {
    if (!organizationId || !form.legalName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      if (editing) {
        await updateSupplier(
          editing.id,
          organizationId,
          {
            legalName: form.legalName.trim(),
            displayName: form.displayName.trim() || undefined,
            supplierType: form.supplierType,
            taxIdentifier: form.taxIdentifier.trim() || undefined,
            paymentTermsDays: parseInt(form.paymentTermsDays, 10) || 0,
            creditLimit: parseFloat(form.creditLimit) || 0,
            notes: form.notes.trim() || undefined,
          },
          editing.version,
        );
      } else {
        await createSupplier(organizationId, {
          legalName: form.legalName.trim(),
          supplierType: form.supplierType,
          displayName: form.displayName.trim() || undefined,
          taxIdentifier: form.taxIdentifier.trim() || undefined,
          openingBalance: parseFloat(form.openingBalance) || 0,
          paymentTermsDays: parseInt(form.paymentTermsDays, 10) || 30,
          creditLimit: parseFloat(form.creditLimit) || 0,
          notes: form.notes.trim() || undefined,
        });
      }
      setDialogOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleArchive(s: Supplier) {
    if (!organizationId) return;
    if (!confirm(`Archive supplier ${s.legalName}?`)) return;
    try {
      await archiveSupplier(s.id, organizationId, s.version);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const canSubmit =
    !!organizationId &&
    !!form.legalName.trim() &&
    !submitting;

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">Suppliers</h1>
          <p className="mt-0.5 text-xs text-muted">
            Vendor master for the organization
          </p>
        </div>
        <Button
          variant="primary"
          icon={<Plus className="size-4" aria-hidden />}
          onClick={openCreate}
        >
          Add Supplier
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card title="Total Suppliers" description="All vendors">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50">
              <Users className="size-5 text-brand-700" />
            </div>
            <div className="text-2xl font-semibold text-ink tabular-nums">{suppliers.length}</div>
          </div>
        </Card>
        <Card title="Active" description="Currently trading">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-success-soft">
              <Users className="size-5 text-success" />
            </div>
            <div className="text-2xl font-semibold text-ink tabular-nums">{active.length}</div>
          </div>
        </Card>
        <Card title="Types" description="Distinct categories">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-surface-sunken">
              <Users className="size-5 text-muted" />
            </div>
            <div className="text-2xl font-semibold text-ink tabular-nums">{types.size}</div>
          </div>
        </Card>
      </div>

      {error && (
        <div className="rounded-md border border-danger bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted" />
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by legal name, trade, code"
            className="pl-8"
          />
        </div>
        <SelectInput<string>
          options={[
            { value: "ALL", label: "All types" },
            ...SUPPLIER_TYPE_OPTIONS,
          ]}
          value={filterType}
          onChange={(v) => setFilterType(v as SupplierType | "ALL")}
        />
        <SelectInput<string>
          options={[
            { value: "ALL", label: "All statuses" },
            { value: "ACTIVE", label: "Active" },
            { value: "INACTIVE", label: "Inactive" },
            { value: "BLOCKED", label: "Blocked" },
            { value: "ARCHIVED", label: "Archived" },
          ]}
          value={filterStatus}
          onChange={(v) => setFilterStatus(v)}
        />
      </div>

      <Card title={`Suppliers (${filtered.length})`} padded={false}>
        <DataTable<Supplier>
          columns={COLUMNS}
          rows={filtered}
          rowKey={(row) => row.id}
          loading={false}
          empty={
            <EmptyState
              icon={<Users aria-hidden />}
              title={suppliers.length === 0 ? "No suppliers yet" : "No suppliers match the filters"}
              description={
                suppliers.length === 0
                  ? "Add suppliers to start creating purchase orders and tracking procurement activity."
                  : "Adjust search or filters."
              }
              action={
                suppliers.length === 0 ? (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Plus className="size-4" aria-hidden />}
                    onClick={openCreate}
                  >
                    Add Supplier
                  </Button>
                ) : undefined
              }
            />
          }
        />
        {filtered.length > 0 && (
          <div className="border-t border-line">
            <div className="px-4 py-2 text-xs text-muted">
              Quick actions: use the buttons below to edit or archive.
            </div>
            <div className="divide-y divide-line">
              {filtered.slice(0, 50).map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-2">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-ink">{s.legalName}</span>
                    <span className="font-mono text-xs text-muted">{s.supplierCode}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Pencil className="size-4" aria-hidden />}
                      onClick={() => openEdit(s)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Archive className="size-4" aria-hidden />}
                      onClick={() => handleArchive(s)}
                      disabled={s.status === "ARCHIVED"}
                    >
                      Archive
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Dialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
        title={editing ? `Edit ${editing.legalName}` : "New Supplier"}
        description={
          editing
            ? "Update vendor master fields. Stock balance remains unchanged."
            : "Add a new vendor to this organization's supplier master."
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => { setDialogOpen(false); setEditing(null); }}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={!canSubmit}
            >
              {submitting ? "Saving..." : editing ? "Save Changes" : "Create Supplier"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Legal Name" required>
            <TextInput
              value={form.legalName}
              onChange={(e) => setForm({ ...form, legalName: e.target.value })}
              placeholder="e.g. Greenfield Traders Pvt Ltd"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Display Name">
              <TextInput
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                placeholder="e.g. Greenfield"
              />
            </Field>
            <Field label="Supplier Type" required>
              <SelectInput<SupplierType>
                options={SUPPLIER_TYPE_OPTIONS}
                value={form.supplierType}
                onChange={(v) => setForm({ ...form, supplierType: v })}
              />
            </Field>
          </div>
          <Field label="Tax Identifier (GSTIN)">
            <TextInput
              value={form.taxIdentifier}
              onChange={(e) => setForm({ ...form, taxIdentifier: e.target.value.toUpperCase() })}
              placeholder="22AAAAA0000A1Z5"
            />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Opening Balance">
              <TextInput
                type="number"
                value={form.openingBalance}
                onChange={(e) => setForm({ ...form, openingBalance: e.target.value })}
              />
            </Field>
            <Field label="Payment Terms (days)">
              <TextInput
                type="number"
                value={form.paymentTermsDays}
                onChange={(e) => setForm({ ...form, paymentTermsDays: e.target.value })}
              />
            </Field>
            <Field label="Credit Limit">
              <TextInput
                type="number"
                value={form.creditLimit}
                onChange={(e) => setForm({ ...form, creditLimit: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Notes">
            <TextInput
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Optional remarks (preferred brands, delivery windows)"
            />
          </Field>
          {error && (
            <div className="rounded-md border border-danger bg-danger-soft px-3 py-2 text-xs text-danger">
              {error}
            </div>
          )}
        </div>
      </Dialog>
    </div>
  );
}
