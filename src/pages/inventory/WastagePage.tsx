import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { LoadingBlock } from "@/components/ui/Spinner";
import { SelectInput, type SelectOption } from "@/components/ui/SelectInput";
import { TextInput } from "@/components/ui/TextInput";
import { listItems, listLocations, listUnits } from "@/domain/inventory/inventory-service";
import { listStockMovements, recordWastage } from "@/domain/inventory/stock-service";
import type { InventoryItem, InventoryLocation, StockLedger, UnitOfMeasure } from "@/domain/inventory/types";
import { useContextStore } from "@/state/context-store";

type WastageFormState = {
  location_id: string;
  item_id: string;
  quantity: string;
  unit_id: string;
  reason: string;
  notes: string;
};

const EMPTY_FORM: WastageFormState = {
  location_id: "",
  item_id: "",
  quantity: "",
  unit_id: "",
  reason: "",
  notes: "",
};

const COLUMNS: DataColumn<StockLedger>[] = [
  {
    key: "date",
    header: "Date",
    render: (row) => new Date(row.createdAt).toLocaleDateString(),
  },
  {
    key: "type",
    header: "Type",
    render: (row) => (
      <span className="font-mono text-xs">{row.movementType}</span>
    ),
  },
  {
    key: "quantity",
    header: "Quantity",
    render: (row) => (
      <span className="font-mono text-danger">
        -{row.quantity.toFixed(2)}
      </span>
    ),
  },
  { key: "reason", header: "Reason", render: (row) => row.reason || "—" },
];

export default function WastagePage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const organizationId = context.organizationId;
  const propertyId = context.propertyId;
  const outletId = context.outletId ?? undefined;

  const [movements, setMovements] = useState<StockLedger[] | null>(null);
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [units, setUnits] = useState<UnitOfMeasure[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<WastageFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  function loadData() {
    if (!organizationId || !propertyId) return;
    setMovements(null);
    Promise.all([
      listStockMovements(organizationId, { movementType: "WASTAGE" }),
      listLocations(organizationId, propertyId, outletId),
      listItems(organizationId),
      listUnits(organizationId),
    ])
      .then(([movData, locData, itemData, unitData]) => {
        setMovements(movData);
        setLocations(locData);
        setItems(itemData);
        setUnits(unitData);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, propertyId]);

  const locationOptions = useMemo<SelectOption<string>[]>(
    () => [
      { value: "", label: "Select a location" },
      ...locations.map((l) => ({ value: l.id, label: `${l.name} (${l.code})` })),
    ],
    [locations],
  );

  const itemOptions = useMemo<SelectOption<string>[]>(
    () => [
      { value: "", label: "Select an item" },
      ...items.map((i) => ({ value: i.id, label: `${i.name} (${i.code})` })),
    ],
    [items],
  );

  const unitOptions = useMemo<SelectOption<string>[]>(
    () => units.map((u) => ({ value: u.id, label: `${u.name} (${u.code})` })),
    [units],
  );

  async function handleSubmit() {
    if (!organizationId || !propertyId) return;
    if (!form.location_id || !form.item_id || !form.unit_id || !form.reason.trim()) return;
    const qty = parseFloat(form.quantity);
    if (!qty || qty <= 0) return;

    setSubmitting(true);
    try {
      await recordWastage(
        organizationId,
        propertyId,
        outletId,
        form.location_id,
        form.item_id,
        qty,
        form.unit_id,
        form.reason.trim(),
        form.notes.trim() || undefined,
      );
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!movements) {
    return <LoadingBlock label="Loading wastage records" />;
  }

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">Wastage Records</h1>
          <p className="mt-0.5 text-xs text-muted">
            Inventory write-offs and spoilage tracking
          </p>
        </div>
        <Button
          variant="primary"
          icon={<Plus className="size-4" aria-hidden />}
          onClick={() => setDialogOpen(true)}
        >
          Record Wastage
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-danger bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <Card title={`Wastage (${movements.length})`} padded={false}>
        <DataTable<StockLedger>
          columns={COLUMNS}
          rows={movements}
          rowKey={(r) => r.id}
          empty={
            <EmptyState
              icon={<AlertTriangle />}
              title="No wastage recorded"
              description="Wastage records will appear here when inventory is written off."
              action={
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Plus className="size-4" aria-hidden />}
                  onClick={() => setDialogOpen(true)}
                >
                  Record Wastage
                </Button>
              }
            />
          }
        />
      </Card>

      <Dialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setForm(EMPTY_FORM); }}
        title="Record Wastage"
        description="Write off stock that was spoiled, damaged or otherwise lost."
        footer={
          <>
            <Button variant="secondary" onClick={() => { setDialogOpen(false); setForm(EMPTY_FORM); }}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={
                submitting ||
                !form.location_id ||
                !form.item_id ||
                !form.unit_id ||
                !form.reason.trim() ||
                !form.quantity ||
                parseFloat(form.quantity) <= 0
              }
            >
              {submitting ? "Recording..." : "Record Wastage"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Location" required>
            <SelectInput
              options={locationOptions}
              value={form.location_id}
              onChange={(value) => setForm({ ...form, location_id: value })}
              placeholder="Where was the stock lost?"
            />
          </Field>
          <Field label="Item" required>
            <SelectInput
              options={itemOptions}
              value={form.item_id}
              onChange={(value) => setForm({ ...form, item_id: value })}
              placeholder="Select the item"
            />
          </Field>
          <Field label="Quantity" required>
            <TextInput
              type="number"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              placeholder="e.g. 2.5"
            />
          </Field>
          <Field label="Unit" required>
            <SelectInput
              options={unitOptions}
              value={form.unit_id}
              onChange={(value) => setForm({ ...form, unit_id: value })}
              placeholder="Select a unit"
            />
          </Field>
          <Field label="Reason" required>
            <TextInput
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="e.g. Expired, Spoiled, Damaged in transit"
            />
          </Field>
          <Field label="Notes">
            <TextInput
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Optional additional details"
            />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
