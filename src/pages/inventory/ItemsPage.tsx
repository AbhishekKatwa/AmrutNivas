import { useEffect, useMemo, useState } from "react";
import { Package, Plus } from "lucide-react";
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
  createItem,
  listItems,
  listUnits,
  listCategories,
} from "@/domain/inventory/inventory-service";
import type {
  InventoryCategory,
  InventoryItem,
  UnitOfMeasure,
} from "@/domain/inventory/types";
import { useContextStore } from "@/state/context-store";

type ItemFormState = {
  name: string;
  code: string;
  item_type: "STOCK" | "NON_STOCK" | "SERVICE";
  base_unit_id: string;
  category_id: string;
};

const ITEM_TYPE_OPTIONS: SelectOption<string>[] = [
  { value: "STOCK", label: "Stock" },
  { value: "NON_STOCK", label: "Non-Stock" },
  { value: "SERVICE", label: "Service" },
];

const EMPTY_FORM: ItemFormState = {
  name: "",
  code: "",
  item_type: "STOCK",
  base_unit_id: "",
  category_id: "",
};

const COLUMNS: DataColumn<InventoryItem>[] = [
  { key: "name", header: "Name", render: (row) => row.name },
  {
    key: "code",
    header: "Code",
    render: (row) => (
      <span className="font-mono text-xs">{row.code}</span>
    ),
  },
  { key: "type", header: "Type", render: (row) => row.itemType },
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

export default function ItemsPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const organizationId = context.organizationId;

  const [items, setItems] = useState<InventoryItem[] | null>(null);
  const [units, setUnits] = useState<UnitOfMeasure[]>([]);
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<ItemFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (!organizationId) return;
    let ignore = false;
    setItems(null);
    Promise.all([
      listItems(organizationId),
      listUnits(organizationId),
      listCategories(organizationId),
    ])
      .then(([itemsData, unitsData, categoriesData]) => {
        if (ignore) return;
        setItems(itemsData);
        setUnits(unitsData);
        setCategories(categoriesData);
      })
      .catch((err) => {
        if (ignore) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => { ignore = true; };
  }, [organizationId]);

  const unitOptions = useMemo<SelectOption<string>[]>(
    () => units.map((u) => ({ value: u.id, label: `${u.name} (${u.code})` })),
    [units],
  );

  const categoryOptions = useMemo<SelectOption<string>[]>(
    () => [
      { value: "", label: "No category" },
      ...categories.map((c) => ({ value: c.id, label: c.name })),
    ],
    [categories],
  );

  async function handleSubmit() {
    if (!organizationId || !form.name.trim() || !form.code.trim() || !form.base_unit_id) return;
    setSubmitting(true);
    try {
      await createItem(organizationId, {
        name: form.name.trim(),
        code: form.code.trim(),
        item_type: form.item_type,
        base_unit_id: form.base_unit_id,
        category_id: form.category_id || undefined,
      });
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      const refreshed = await listItems(organizationId);
      setItems(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (status !== "ready" || !organizationId) {
    return <LoadingBlock />;
  }

  const isLoading = items === null;

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">Inventory Items</h1>
          <p className="mt-0.5 text-xs text-muted">
            Master data for stockable items, materials and services
          </p>
        </div>
        <Button
          variant="primary"
          icon={<Plus className="size-4" aria-hidden />}
          onClick={() => setDialogOpen(true)}
        >
          Add Item
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-danger bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <Card title={`Items${items ? ` (${items.length})` : ""}`} padded={false}>
        <DataTable<InventoryItem>
          columns={COLUMNS}
          rows={items ?? []}
          rowKey={(row) => row.id}
          loading={isLoading}
          empty={
            <EmptyState
              icon={<Package aria-hidden />}
              title="No inventory items"
              description="Create your first item to start tracking stock, materials and services."
              action={
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Plus className="size-4" aria-hidden />}
                  onClick={() => setDialogOpen(true)}
                >
                  Add Item
                </Button>
              }
            />
          }
        />
      </Card>

      <Dialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setForm(EMPTY_FORM); }}
        title="New Inventory Item"
        description="Add an item to track in stock, as a material, or as a service."
        footer={
          <>
            <Button variant="secondary" onClick={() => { setDialogOpen(false); setForm(EMPTY_FORM); }}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={submitting || !form.name.trim() || !form.code.trim() || !form.base_unit_id}
            >
              {submitting ? "Creating..." : "Create Item"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Name" required>
            <TextInput
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Basmati Rice"
            />
          </Field>
          <Field label="Code" required>
            <TextInput
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="e.g. RICE-BAS-001"
            />
          </Field>
          <Field label="Type">
            <SelectInput
              options={ITEM_TYPE_OPTIONS}
              value={form.item_type}
              onChange={(value) => setForm({ ...form, item_type: value as ItemFormState["item_type"] })}
            />
          </Field>
          <Field label="Base Unit" required>
            <SelectInput
              options={unitOptions}
              value={form.base_unit_id}
              onChange={(value) => setForm({ ...form, base_unit_id: value })}
              placeholder="Select a unit"
            />
          </Field>
          <Field label="Category">
            <SelectInput
              options={categoryOptions}
              value={form.category_id}
              onChange={(value) => setForm({ ...form, category_id: value })}
            />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
