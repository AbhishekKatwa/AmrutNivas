import { useEffect, useState } from "react";
import { ChefHat } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { listRecipes } from "@/domain/inventory/stock-service";
import type { Recipe } from "@/domain/inventory/types";
import { useContextStore } from "@/state/context-store";

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
  const outletId = context.outletId ?? undefined;

  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (!organizationId) return;
    let ignore = false;
    setRecipes(null);
    listRecipes(organizationId, outletId)
      .then((data) => {
        if (ignore) return;
        setRecipes(data);
      })
      .catch((err) => {
        if (ignore) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => { ignore = true; };
  }, [organizationId, outletId]);

  if (!recipes) {
    return <LoadingBlock label="Loading recipes" />;
  }

  return (
    <div className="space-y-6">
      <Card
        title="Recipes"
        description="Ingredient formulas for menu items and prepared goods"
      >
        {error && (
          <div className="mb-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}
        {recipes.length === 0 ? (
          <EmptyState
            icon={<ChefHat />}
            title="No recipes yet"
            description="Create recipes to define ingredient formulas for your menu items."
          />
        ) : (
          <DataTable columns={COLUMNS} rows={recipes} rowKey={(r) => r.id} />
        )}
      </Card>
    </div>
  );
}
