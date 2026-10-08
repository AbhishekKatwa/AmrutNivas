import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Plus } from "lucide-react";
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
import { listStockMovements, recordTransfer } from "@/domain/inventory/stock-service";
import type { InventoryItem, InventoryLocation, StockLedger, UnitOfMeasure } from "@/domain/inventory/types";
import { useContextStore } from "@/state/context-store";

type TransferFormState = {
  source_location_id: string;
  dest_location_id: string;
  item_id: string;
  quantity: string;
  unit_id: string;
  reason: string;
  notes: string;
};

const EMPTY_FORM: TransferFormState = {
  source_location_id: "",
  dest_location_id: "",
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
      <span className="font-mono">
        {row.movementType === "TRANSFER_OUT" ? "-" : "+"}
        {row.quantity.toFixed(2)}
      </span>
    ),
  },
  { key: "notes", header: "Notes", render: (row) => row.notes || "—" },
];

export default function TransfersPage() {
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
  const [form, setForm] = useState<TransferFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  function loadData() {
    if (!organizationId || !propertyId) return;
    setMovements(null);
    Promise.all([
      listStockMovements(organizationId).then((data) =>
        data.filter((m) => m.movementType === "TRANSFER_IN" || m.movementType === "TRANSFER_OUT"),
      ),
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
    if (!form.source_location_id || !form.dest_location_id || !form.item_id || !form.unit_id) return;
    if (form.source_location_id === form.dest_location_id) return;
    const qty = parseFloat(form.quantity);
    if (!qty || qty <= 0) return;

    setSubmitting(true);
    try {
      await recordTransfer(
        organizationId,
        propertyId,
        outletId,
        form.source_location_id,
        form.dest_location_id,
        form.item_id,
        qty,
        form.unit_id,
        form.reason.trim() || undefined,
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
    return <LoadingBlock label="Loading transfers" />;
  }

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">Stock Transfers</h1>
          <p className="mt-0.5 text-xs text-muted">
            Inventory movements between locations
          </p>
        </div>
        <Button
          variant="primary"
          icon={<Plus className="size-4" aria-hidden />}
          onClick={() => setDialogOpen(true)}
        >
          Record Transfer
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-danger bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <Card title={`Transfers (${movements.length})`} padded={false}>
        <DataTable<StockLedger>
          columns={COLUMNS}
          rows={movements}
          rowKey={(r) => r.id}
          empty={
            <EmptyState
              icon={<ArrowRightLeft />}
              title="No transfers yet"
              description="Transfer records will appear here when stock moves between locations."
              action={
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Plus className="size-4" aria-hidden />}
                  onClick={() => setDialogOpen(true)}
                >
                  Record Transfer
                </Button>
              }
            />
          }
        />
      </Card>

      <Dialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setForm(EMPTY_FORM); }}
        title="Record Transfer"
        description="Move stock from one location to another."
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
                !form.source_location_id ||
                !form.dest_location_id ||
                form.source_location_id === form.dest_location_id ||
                !form.item_id ||
                !form.unit_id ||
                !form.quantity ||
                parseFloat(form.quantity) <= 0
              }
            >
              {submitting ? "Transferring..." : "Record Transfer"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="From Location" required>
            <SelectInput
              options={locationOptions}
              value={form.source_location_id}
              onChange={(value) => setForm({ ...form, source_location_id: value })}
              placeholder="Source location"
            />
          </Field>
          <Field label="To Location" required>
            <SelectInput
              options={locationOptions}
              value={form.dest_location_id}
              onChange={(value) => setForm({ ...form, dest_location_id: value })}
              placeholder="Destination location"
            />
          </Field>
          <Field label="Item" required>
            <SelectInput
              options={itemOptions}
              value={form.item_id}
              onChange={(value) => setForm({ ...form, item_id: value })}
              placeholder="Select the item to transfer"
            />
          </Field>
          <Field label="Quantity" required>
            <TextInput
              type="number"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              placeholder="e.g. 10"
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
          <Field label="Reason">
            <TextInput
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="e.g. Kitchen restock, Event prep"
            />
          </Field>
          <Field label="Notes">
            <TextInput
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Optional details"
            />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
