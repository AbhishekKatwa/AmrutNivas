import { useEffect, useState } from "react";
import { Package } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { listStockBalances } from "@/domain/inventory/stock-service";
import type { StockBalance } from "@/domain/inventory/types";
import { useContextStore } from "@/state/context-store";

const COLUMNS: DataColumn<StockBalance>[] = [
  { key: "item_id", header: "Item", render: (row) => (
    <span className="font-mono text-xs">{row.itemId}</span>
  )},
  { key: "location_id", header: "Location", render: (row) => (
    <span className="font-mono text-xs">{row.locationId}</span>
  )},
  {
    key: "quantity",
    header: "On Hand",
    align: "right",
    render: (row) => (
      <span className="tabular-nums">
        {Number(row.quantityOnHand).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}
      </span>
    ),
  },
  {
    key: "cost",
    header: "Avg Cost",
    align: "right",
    render: (row) => (
      <span className="tabular-nums">
        {Number(row.lastAvgCost).toFixed(2)}
      </span>
    ),
  },
  {
    key: "last_movement",
    header: "Last Movement",
    render: (row) =>
      row.lastMovementAt
        ? new Date(row.lastMovementAt).toLocaleDateString()
        : "—",
  },
];

export default function StockPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const organizationId = context.organizationId;

  const [balances, setBalances] = useState<StockBalance[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (!organizationId) return;
    let ignore = false;
    setBalances(null);
    listStockBalances(organizationId)
      .then((data) => { if (!ignore) setBalances(data); })
      .catch((err) => {
        if (ignore) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => { ignore = true; };
  }, [organizationId]);

  const totals = balances
    ? {
        items: new Set(balances.map((b) => b.itemId)).size,
        locations: new Set(balances.map((b) => b.locationId)).size,
        totalValue: balances.reduce(
          (sum, b) => sum + Number(b.quantityOnHand) * Number(b.lastAvgCost),
          0,
        ),
      }
    : null;

  if (status !== "ready" || !organizationId) {
    return <LoadingBlock />;
  }

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Stock Balance</h1>
        <p className="mt-0.5 text-xs text-muted">
          Current on-hand quantities and weighted average costs
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-danger bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {totals && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card title="Items in Stock">
            <p className="text-2xl font-semibold tabular-nums text-ink">{totals.items}</p>
          </Card>
          <Card title="Locations">
            <p className="text-2xl font-semibold tabular-nums text-ink">{totals.locations}</p>
          </Card>
          <Card title="Total Value">
            <p className="text-2xl font-semibold tabular-nums text-ink">
              {totals.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </Card>
        </div>
      )}

      <Card title={`Balances${balances ? ` (${balances.length})` : ""}`} padded={false}>
        <DataTable<StockBalance>
          columns={COLUMNS}
          rows={balances ?? []}
          rowKey={(row) => `${row.itemId}-${row.locationId}`}
          loading={balances === null}
          empty={
            <EmptyState
              icon={<Package aria-hidden />}
              title="No stock recorded"
              description="Stock balances appear here once opening stock or receipts are posted."
            />
          }
        />
      </Card>
    </div>
  );
}
