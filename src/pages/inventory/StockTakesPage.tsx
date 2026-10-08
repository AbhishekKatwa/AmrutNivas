import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Plus } from "lucide-react";
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
import { listLocations } from "@/domain/inventory/inventory-service";
import { createStockTake, listStockTakes } from "@/domain/inventory/stock-service";
import type { InventoryLocation, StockTake } from "@/domain/inventory/types";
import { useContextStore } from "@/state/context-store";

type StockTakeFormState = {
  location_id: string;
  notes: string;
};

const EMPTY_FORM: StockTakeFormState = {
  location_id: "",
  notes: "",
};

const COLUMNS: DataColumn<StockTake>[] = [
  {
    key: "date",
    header: "Count Date",
    render: (row) => new Date(row.countedAt).toLocaleDateString(),
  },
  {
    key: "status",
    header: "Status",
    render: (row) => (
      <Badge
        tone={
          row.status === "POSTED"
            ? "success"
            : row.status === "DRAFT"
              ? "brand"
              : "muted"
        }
      >
        {row.status}
      </Badge>
    ),
  },
  { key: "notes", header: "Notes", render: (row) => row.notes || "—" },
  {
    key: "created",
    header: "Created",
    render: (row) => new Date(row.createdAt).toLocaleDateString(),
  },
];

export default function StockTakesPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const organizationId = context.organizationId;
  const propertyId = context.propertyId;
  const outletId = context.outletId ?? undefined;

  const [stockTakes, setStockTakes] = useState<StockTake[] | null>(null);
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<StockTakeFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  function loadData() {
    if (!organizationId || !propertyId) return;
    setStockTakes(null);
    Promise.all([
      listStockTakes(organizationId),
      listLocations(organizationId, propertyId, outletId),
    ])
      .then(([takesData, locData]) => {
        setStockTakes(takesData);
        setLocations(locData);
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

  async function handleSubmit() {
    if (!organizationId || !propertyId || !form.location_id) return;

    setSubmitting(true);
    try {
      await createStockTake(
        organizationId,
        propertyId,
        outletId,
        form.location_id,
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

  if (!stockTakes) {
    return <LoadingBlock label="Loading stock takes" />;
  }

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">Stock Takes</h1>
          <p className="mt-0.5 text-xs text-muted">
            Physical inventory counts and variance analysis
          </p>
        </div>
        <Button
          variant="primary"
          icon={<Plus className="size-4" aria-hidden />}
          onClick={() => setDialogOpen(true)}
        >
          Create Stock Take
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-danger bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <Card title={`Stock Takes (${stockTakes.length})`} padded={false}>
        <DataTable<StockTake>
          columns={COLUMNS}
          rows={stockTakes}
          rowKey={(r) => r.id}
          empty={
            <EmptyState
              icon={<ClipboardCheck />}
              title="No stock takes yet"
              description="Create a stock take to count physical inventory and reconcile with system records."
              action={
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Plus className="size-4" aria-hidden />}
                  onClick={() => setDialogOpen(true)}
                >
                  Create Stock Take
                </Button>
              }
            />
          }
        />
      </Card>

      <Dialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setForm(EMPTY_FORM); }}
        title="New Stock Take"
        description="Start a physical count for a location. You can post the variances once counting is complete."
        footer={
          <>
            <Button variant="secondary" onClick={() => { setDialogOpen(false); setForm(EMPTY_FORM); }}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={submitting || !form.location_id}
            >
              {submitting ? "Creating..." : "Create Stock Take"}
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
              placeholder="Select the location to count"
            />
          </Field>
          <Field label="Notes">
            <TextInput
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="e.g. Monthly cycle count, Year-end audit"
            />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
