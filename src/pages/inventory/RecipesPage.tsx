import { useEffect, useMemo, useState } from "react";
import { ChefHat, Plus } from "lucide-react";
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
import { listItems, listUnits } from "@/domain/inventory/inventory-service";
import { createRecipe, listRecipes } from "@/domain/inventory/stock-service";
import type { InventoryItem, Recipe, UnitOfMeasure } from "@/domain/inventory/types";
import { useContextStore } from "@/state/context-store";

type RecipeFormState = {
  name: string;
  code: string;
  item_id: string;
  yield_quantity: string;
  yield_unit_id: string;
  description: string;
  notes: string;
};

const EMPTY_FORM: RecipeFormState = {
  name: "",
  code: "",
  item_id: "",
  yield_quantity: "",
  yield_unit_id: "",
  description: "",
  notes: "",
};

const COLUMNS: DataColumn<Recipe>[] = [
  {
    key: "name",
    header: "Recipe",
    render: (row) => (
      <div className="flex items-center gap-2">
        <ChefHat className="size-4 text-muted" />
        <span className="font-medium text-ink">{row.name}</span>
      </div>
    ),
  },
  {
    key: "code",
    header: "Code",
    render: (row) => (
      <span className="font-mono text-xs">{row.code}</span>
    ),
  },
  {
    key: "yield",
    header: "Yield",
    render: (row) => `${row.yieldQuantity} units`,
  },
  {
    key: "version",
    header: "Version",
    render: (row) => `v${row.version}`,
  },
  {
    key: "status",
    header: "Status",
    render: (row) => (
      <Badge
        tone={
          row.status === "ACTIVE"
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
];

export default function RecipesPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const organizationId = context.organizationId;
  const propertyId = context.propertyId;
  const outletId = context.outletId ?? undefined;

  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [units, setUnits] = useState<UnitOfMeasure[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<RecipeFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (!organizationId) return;
    let ignore = false;
    setRecipes(null);
    Promise.all([
      listRecipes(organizationId, outletId),
      listItems(organizationId),
      listUnits(organizationId),
    ])
      .then(([recipesData, itemsData, unitsData]) => {
        if (ignore) return;
        setRecipes(recipesData);
        setItems(itemsData);
        setUnits(unitsData);
      })
      .catch((err) => {
        if (ignore) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => { ignore = true; };
  }, [organizationId, outletId]);

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
    if (!organizationId || !propertyId || !outletId) return;
    if (!form.name.trim() || !form.code.trim() || !form.item_id || !form.yield_unit_id) return;
    const yieldQty = parseFloat(form.yield_quantity);
    if (!yieldQty || yieldQty <= 0) return;

    setSubmitting(true);
    try {
      await createRecipe(
        organizationId,
        propertyId,
        outletId,
        form.item_id,
        form.name.trim(),
        form.code.trim(),
        yieldQty,
        form.yield_unit_id,
        form.description.trim() || undefined,
        form.notes.trim() || undefined,
      );
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      const refreshed = await listRecipes(organizationId, outletId);
      setRecipes(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!recipes) {
    return <LoadingBlock label="Loading recipes" />;
  }

  const canCreate = Boolean(organizationId && propertyId && outletId);

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">Recipes</h1>
          <p className="mt-0.5 text-xs text-muted">
            Ingredient formulas for menu items and prepared goods
          </p>
        </div>
        {canCreate && (
          <Button
            variant="primary"
            icon={<Plus className="size-4" aria-hidden />}
            onClick={() => setDialogOpen(true)}
          >
            Create Recipe
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-danger bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <Card title={`Recipes (${recipes.length})`} padded={false}>
        <DataTable<Recipe>
          columns={COLUMNS}
          rows={recipes}
          rowKey={(r) => r.id}
          empty={
            <EmptyState
              icon={<ChefHat />}
              title="No recipes yet"
              description="Create recipes to define ingredient formulas for your menu items."
              action={
                canCreate ? (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Plus className="size-4" aria-hidden />}
                    onClick={() => setDialogOpen(true)}
                  >
                    Create Recipe
                  </Button>
                ) : undefined
              }
            />
          }
        />
      </Card>

      <Dialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setForm(EMPTY_FORM); }}
        title="New Recipe"
        description="Define an ingredient formula linking a menu item to its components."
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
                !form.name.trim() ||
                !form.code.trim() ||
                !form.item_id ||
                !form.yield_unit_id ||
                !form.yield_quantity ||
                parseFloat(form.yield_quantity) <= 0
              }
            >
              {submitting ? "Creating..." : "Create Recipe"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Recipe Name" required>
            <TextInput
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Paneer Butter Masala"
            />
          </Field>
          <Field label="Code" required>
            <TextInput
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="e.g. RCP-PBM-001"
            />
          </Field>
          <Field label="Menu Item" required>
            <SelectInput
              options={itemOptions}
              value={form.item_id}
              onChange={(value) => setForm({ ...form, item_id: value })}
              placeholder="Select the item this recipe produces"
            />
          </Field>
          <Field label="Yield Quantity" required>
            <TextInput
              type="number"
              value={form.yield_quantity}
              onChange={(e) => setForm({ ...form, yield_quantity: e.target.value })}
              placeholder="e.g. 4"
            />
          </Field>
          <Field label="Yield Unit" required>
            <SelectInput
              options={unitOptions}
              value={form.yield_unit_id}
              onChange={(value) => setForm({ ...form, yield_unit_id: value })}
              placeholder="Select a unit"
            />
          </Field>
          <Field label="Description">
            <TextInput
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Optional description"
            />
          </Field>
          <Field label="Notes">
            <TextInput
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Optional preparation notes"
            />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
