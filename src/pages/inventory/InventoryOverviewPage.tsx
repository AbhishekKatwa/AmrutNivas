import { useEffect, useState } from "react";
import { Package, MapPin, ClipboardList, ChefHat } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { LoadingBlock } from "@/components/ui/Spinner";
import { listItems, listLocations, listCategories } from "@/domain/inventory/inventory-service";
import { listRecipes, listStockTakes } from "@/domain/inventory/stock-service";
import { useContextStore } from "@/state/context-store";

export default function InventoryOverviewPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const organizationId = context.organizationId;
  const propertyId = context.propertyId;
  const outletId = context.outletId ?? undefined;

  const [counts, setCounts] = useState<{
    items: number;
    locations: number;
    categories: number;
    recipes: number;
    stockTakes: number;
  } | null>(null);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (!organizationId || !propertyId) return;
    let ignore = false;
    setCounts(null);
    Promise.all([
      listItems(organizationId),
      listLocations(organizationId, propertyId),
      listCategories(organizationId),
      listRecipes(organizationId, outletId),
      listStockTakes(organizationId, propertyId),
    ])
      .then(([items, locations, categories, recipes, stockTakes]) => {
        if (ignore) return;
        setCounts({
          items: items.length,
          locations: locations.length,
          categories: categories.length,
          recipes: recipes.length,
          stockTakes: stockTakes.length,
        });
      })
      .catch((err) => {
        if (ignore) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => { ignore = true; };
  }, [organizationId, propertyId, outletId]);

  if (!counts) {
    return <LoadingBlock label="Loading inventory overview" />;
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card title="Items" description="Inventory items in catalog">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50">
              <Package className="size-5 text-brand-700" />
            </div>
            <div>
              <div className="text-2xl font-semibold text-ink tabular-nums">
                {counts.items}
              </div>
              <div className="text-xs text-muted">Total items</div>
            </div>
          </div>
        </Card>

        <Card title="Locations" description="Storage areas">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50">
              <MapPin className="size-5 text-brand-700" />
            </div>
            <div>
              <div className="text-2xl font-semibold text-ink tabular-nums">
                {counts.locations}
              </div>
              <div className="text-xs text-muted">Total locations</div>
            </div>
          </div>
        </Card>

        <Card title="Categories" description="Item classifications">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50">
              <ClipboardList className="size-5 text-brand-700" />
            </div>
            <div>
              <div className="text-2xl font-semibold text-ink tabular-nums">
                {counts.categories}
              </div>
              <div className="text-xs text-muted">Total categories</div>
            </div>
          </div>
        </Card>

        <Card title="Recipes" description="Ingredient formulas">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50">
              <ChefHat className="size-5 text-brand-700" />
            </div>
            <div>
              <div className="text-2xl font-semibold text-ink tabular-nums">
                {counts.recipes}
              </div>
              <div className="text-xs text-muted">Total recipes</div>
            </div>
          </div>
        </Card>

        <Card title="Stock Takes" description="Physical counts">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50">
              <ClipboardList className="size-5 text-brand-700" />
            </div>
            <div>
              <div className="text-2xl font-semibold text-ink tabular-nums">
                {counts.stockTakes}
              </div>
              <div className="text-xs text-muted">Total counts</div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
