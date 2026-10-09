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
import {
  createRecipe,
  listRecipes,
  listRecipeIngredients,
  listRecipeVersions,
} from "@/domain/inventory/stock-service";
import type {
  InventoryItem,
  Recipe,
  RecipeIngredient,
  UnitOfMeasure,
} from "@/domain/inventory/types";
import { useContextStore } from "@/state/context-store";

type IngredientFormRow = {
  itemId: string;
  quantity: string;
  unitId: string;
  notes: string;
};

type RecipeFormState = {
  name: string;
  code: string;
  item_id: string;
  yield_quantity: string;
  yield_unit_id: string;
  description: string;
  notes: string;
  ingredients: IngredientFormRow[];
};

const EMPTY_FORM: RecipeFormState = {
  name: "",
  code: "",
  item_id: "",
  yield_quantity: "",
  yield_unit_id: "",
  description: "",
  notes: "",
  ingredients: [],
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
  const context = useContextStore((s) => s.context);

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
  const [expanded, setExpanded] = useState<Record<string, RecipeIngredient[] | "loading" | undefined>>({});

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
    () => [
      { value: "", label: "Unit" },
      ...units.map((u) => ({ value: u.id, label: `${u.name} (${u.code})` })),
    ],
    [units],
  );

  async function handleSubmit() {
    if (!organizationId || !propertyId || !outletId) return;
    if (!form.name.trim() || !form.code.trim() || !form.item_id || !form.yield_unit_id) return;
    const yieldQty = parseFloat(form.yield_quantity);
    if (!yieldQty || yieldQty <= 0) return;

    setSubmitting(true);
    setError(null);
    try {
      const ingredients = form.ingredients
        .filter((ing) => ing.itemId && ing.unitId && parseFloat(ing.quantity) > 0)
        .map((ing, idx) => ({
          item_id: ing.itemId,
          quantity: parseFloat(ing.quantity),
          unit_id: ing.unitId,
          notes: ing.notes.trim() || undefined,
          display_order: idx + 1,
        }));

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
        ingredients.length > 0 ? ingredients : undefined,
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

  async function loadIngredients(recipe: Recipe) {
    if (expanded[recipe.id] !== undefined) {
      setExpanded((p) => { const x = { ...p }; delete x[recipe.id]; return x; });
      return;
    }
    setExpanded((p) => ({ ...p, [recipe.id]: "loading" }));
    try {
      const versions = await listRecipeVersions(recipe.id);
      const active = versions.find((v) => v.status === "ACTIVE") ?? versions[0];
      if (!active) {
        setExpanded((p) => ({ ...p, [recipe.id]: [] }));
        return;
      }
      const ings = await listRecipeIngredients(active.id);
      setExpanded((p) => ({ ...p, [recipe.id]: ings }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setExpanded((p) => ({ ...p, [recipe.id]: [] }));
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
        {recipes.length > 0 && (
          <div className="divide-y divide-line">
            {recipes.map((r) => (
              <div key={r.id} className="px-4 py-3">
                <button
                  type="button"
                  className="flex w-full items-center justify-between text-left"
                  onClick={() => loadIngredients(r)}
                >
                  <span className="text-sm font-medium text-ink">{r.name}</span>
                  <span className="text-xs text-muted">
                    {expanded[r.id] === undefined
                      ? "Show ingredients"
                      : expanded[r.id] === "loading"
                        ? "Loading..."
                        : `Hide ingredients (${(expanded[r.id] as RecipeIngredient[]).length})`}
                  </span>
                </button>
                {expanded[r.id] !== undefined &&
                  expanded[r.id] !== "loading" &&
                  (expanded[r.id] as RecipeIngredient[]).length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs text-muted">
                      {(expanded[r.id] as RecipeIngredient[]).map((ing) => {
                        const itemName = items.find((i) => i.id === ing.itemId)?.name ?? ing.itemId.slice(0, 6);
                        const unit = units.find((u) => u.id === ing.unitId);
                        return (
                          <li key={ing.id} className="flex justify-between">
                            <span>{itemName}</span>
                            <span>
                              {ing.quantity} {unit?.code ?? "?"}
                              {ing.notes ? ` · ${ing.notes}` : ""}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                {expanded[r.id] !== undefined &&
                  expanded[r.id] !== "loading" &&
                  (expanded[r.id] as RecipeIngredient[]).length === 0 && (
                    <div className="mt-2 text-xs text-muted">No ingredients recorded yet.</div>
                  )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog
        size="lg"
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
          <div className="grid grid-cols-2 gap-3">
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
              />
            </Field>
          </div>
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

          <div className="border-t border-line pt-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-ink">Ingredients</span>
              <Button
                size="sm"
                variant="secondary"
                icon={<Plus className="size-3.5" aria-hidden />}
                onClick={() =>
                  setForm({
                    ...form,
                    ingredients: [
                      ...form.ingredients,
                      { itemId: "", quantity: "", unitId: "", notes: "" },
                    ],
                  })
                }
              >
                Add Ingredient
              </Button>
            </div>
            {form.ingredients.length === 0 ? (
              <div className="rounded-md border border-dashed border-line bg-surface-soft p-3 text-xs text-muted">
                No ingredients yet. Add at least one ingredient + quantity + unit before saving. Ingredient rows cost the menu item (yield) to produce.
              </div>
            ) : (
              <div className="space-y-2">
                {form.ingredients.map((ing, idx) => (
                  <div key={idx} className="grid grid-cols-12 items-end gap-2">
                    <div className="col-span-5">
                      <SelectInput<string>
                        options={itemOptions}
                        value={ing.itemId}
                        onChange={(v) => {
                          const next = [...form.ingredients];
                          next[idx] = { ...next[idx], itemId: v };
                          setForm({ ...form, ingredients: next });
                        }}
                      />
                    </div>
                    <div className="col-span-2">
                      <TextInput
                        placeholder="Qty"
                        type="number"
                        value={ing.quantity}
                        onChange={(e) => {
                          const next = [...form.ingredients];
                          next[idx] = { ...next[idx], quantity: e.target.value };
                          setForm({ ...form, ingredients: next });
                        }}
                      />
                    </div>
                    <div className="col-span-2">
                      <SelectInput<string>
                        options={unitOptions}
                        value={ing.unitId}
                        onChange={(v) => {
                          const next = [...form.ingredients];
                          next[idx] = { ...next[idx], unitId: v };
                          setForm({ ...form, ingredients: next });
                        }}
                      />
                    </div>
                    <div className="col-span-2">
                      <TextInput
                        placeholder="Notes"
                        value={ing.notes}
                        onChange={(e) => {
                          const next = [...form.ingredients];
                          next[idx] = { ...next[idx], notes: e.target.value };
                          setForm({ ...form, ingredients: next });
                        }}
                      />
                    </div>
                    <div className="col-span-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setForm({
                            ...form,
                            ingredients: form.ingredients.filter((_, i) => i !== idx),
                          })
                        }
                      >
                        ×
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Dialog>
    </div>
  );
}
