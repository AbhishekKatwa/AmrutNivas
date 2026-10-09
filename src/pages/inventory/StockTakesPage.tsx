import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Plus, BarChart3 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { LoadingBlock } from "@/components/ui/Spinner";
import { SelectInput, type SelectOption } from "@/components/ui/SelectInput";
import { TextInput } from "@/components/ui/TextInput";
import { listLocations } from "@/domain/inventory/inventory-service";
import {
  createStockTake,
  listStockTakes,
  listStockTakeLines,
  postStockTake,
} from "@/domain/inventory/stock-service";
import type {
  InventoryLocation,
  InventoryItem,
  StockTake,
  StockTakeLine,
} from "@/domain/inventory/types";
import { listItems, listUnits } from "@/domain/inventory/inventory-service";
import type { UnitOfMeasure } from "@/domain/inventory/types";
import { useContextStore } from "@/state/context-store";

type StockTakeFormState = {
  location_id: string;
  notes: string;
};

const EMPTY_FORM: StockTakeFormState = {
  location_id: "",
  notes: "",
};

export default function StockTakesPage() {
  const context = useContextStore((s) => s.context);

  const organizationId = context.organizationId;
  const propertyId = context.propertyId;
  const outletId = context.outletId ?? undefined;

  const [stockTakes, setStockTakes] = useState<StockTake[] | null>(null);
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [units, setUnits] = useState<UnitOfMeasure[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<StockTakeFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  // Count editor
  const [editingStockTake, setEditingStockTake] = useState<StockTake | null>(null);
  const [lines, setLines] = useState<StockTakeLine[] | null>(null);
  const [loadingLines, setLoadingLines] = useState(false);
  const [savingLines, setSavingLines] = useState<Record<string, string>>({});
  const [posting, setPosting] = useState(false);

  function loadData() {
    if (!organizationId || !propertyId) return;
    setStockTakes(null);
    Promise.all([
      listStockTakes(organizationId),
      listLocations(organizationId, propertyId, outletId),
      listItems(organizationId),
      listUnits(organizationId),
    ])
      .then(([takesData, locData, itemsData, unitsData]) => {
        setStockTakes(takesData);
        setLocations(locData);
        setItems(itemsData);
        setUnits(unitsData);
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

  async function openCountEditor(t: StockTake) {
    setEditingStockTake(t);
    setLines(null);
    setLoadingLines(true);
    try {
      const ls = await listStockTakeLines(t.id);
      setLines(ls);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingLines(false);
    }
  }

  function closeCountEditor() {
    setEditingStockTake(null);
    setLines(null);
  }

  async function postVariance() {
    if (!organizationId || !editingStockTake || !lines) return;
    setPosting(true);
    setError(null);
    try {
      await postStockTake(
        organizationId,
        editingStockTake.id,
        lines.map((l) => ({
          line_id: l.id,
          actual_quantity: parseFloat(savingLines[l.id] ?? String(l.actualQuantity)),
        })),
        `Posted via UI from ${editingStockTake.countedAt.slice(0, 10)}`,
      );
      closeCountEditor();
      loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPosting(false);
    }
  }

  function itemName(id: string) {
    return items.find((i) => i.id === id)?.name ?? id.slice(0, 6);
  }
  function unitName(id: string) {
    const u = units.find((x) => x.id === id);
    return u ? `${u.name} (${u.code})` : id.slice(0, 6);
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-soft text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-2 text-left">Count Date</th>
                <th className="px-4 py-2 text-left">Location</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Notes</th>
                <th className="px-4 py-2 text-left">Created</th>
                <th className="px-4 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {stockTakes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8">
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
                  </td>
                </tr>
              ) : (
                stockTakes.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-2">{new Date(t.countedAt).toLocaleDateString()}</td>
                    <td className="px-4 py-2">{locations.find((l) => l.id === t.locationId)?.name ?? t.locationId.slice(0, 6)}</td>
                    <td className="px-4 py-2">
                      <Badge
                        tone={
                          t.status === "POSTED"
                            ? "success"
                            : t.status === "DRAFT"
                              ? "brand"
                              : "muted"
                        }
                      >
                        {t.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted">{t.notes || "—"}</td>
                    <td className="px-4 py-2">{new Date(t.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-2">
                      {t.status === "DRAFT" ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<BarChart3 className="size-4" aria-hidden />}
                          onClick={() => openCountEditor(t)}
                        >
                          Enter counts
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<BarChart3 className="size-4" aria-hidden />}
                          onClick={() => openCountEditor(t)}
                        >
                          View
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setForm(EMPTY_FORM); }}
        title="New Stock Take"
        description="Start a physical count for a location. Counts are auto-populated from current stock balances and posted as variance."
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

      <Dialog
        size="xl"
        open={editingStockTake !== null}
        onClose={closeCountEditor}
        title={editingStockTake ? `Stock Take · ${editingStockTake.countedAt.slice(0, 10)}` : ""}
        description={
          editingStockTake?.status === "DRAFT"
            ? "Set the actual counted quantity for each line, then post variance."
            : "Read-only — this stock take is already posted."
        }
        footer={
          <>
            <Button variant="secondary" onClick={closeCountEditor}>
              Close
            </Button>
            {editingStockTake?.status === "DRAFT" && (
              <Button variant="primary" onClick={postVariance} disabled={posting || lines === null}>
                {posting ? "Posting..." : "Post Variance"}
              </Button>
            )}
          </>
        }
      >
        {loadingLines ? (
          <LoadingBlock label="Loading lines" />
        ) : !lines || lines.length === 0 ? (
          <div className="rounded-md border border-dashed border-line p-4 text-xs text-muted">
            No count lines were created for this stock take. The trigger seeds only items that have a balance at the chosen location.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-soft text-xs uppercase text-muted">
                <tr>
                  <th className="px-3 py-2 text-left">Item</th>
                  <th className="px-3 py-2 text-left">Unit</th>
                  <th className="px-3 py-2 text-right">Expected</th>
                  <th className="px-3 py-2 text-right">Actual</th>
                  <th className="px-3 py-2 text-right">Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {lines.map((l) => {
                  const actualStr = savingLines[l.id] ?? String(l.actualQuantity ?? l.expectedQuantity);
                  const actual = parseFloat(actualStr);
                  const expected = parseFloat(String(l.expectedQuantity));
                  const variance = (Number.isFinite(actual) ? actual : 0) - expected;
                  const disabled = editingStockTake?.status !== "DRAFT";
                  return (
                    <tr key={l.id}>
                      <td className="px-3 py-1">{itemName(l.itemId)}</td>
                      <td className="px-3 py-1 text-xs">{unitName(l.unitId)}</td>
                      <td className="px-3 py-1 text-right tabular-nums">{expected.toFixed(2)}</td>
                      <td className="px-3 py-1 text-right">
                        <input
                          type="number"
                          step="0.01"
                          disabled={disabled}
                          value={actualStr}
                          onChange={(e) =>
                            setSavingLines((p) => ({ ...p, [l.id]: e.target.value }))
                          }
                          className="w-24 rounded border border-line bg-surface px-2 py-1 text-right text-sm tabular-nums focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                      </td>
                      <td className={`px-3 py-1 text-right tabular-nums font-medium ${variance === 0 ? "text-muted" : variance > 0 ? "text-success" : "text-danger"}`}>
                        {variance >= 0 ? "+" : ""}{variance.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Dialog>
    </div>
  );
}
