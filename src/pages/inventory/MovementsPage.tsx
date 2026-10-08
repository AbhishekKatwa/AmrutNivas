import { useEffect, useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { listStockMovements } from "@/domain/inventory/stock-service";
import type { StockLedger } from "@/domain/inventory/types";
import { useContextStore } from "@/state/context-store";

const MOVEMENT_TONE: Record<string, "success" | "danger" | "neutral" | "brand" | "warning"> = {
  OPENING: "brand",
  RECEIPT: "success",
  TRANSFER_IN: "success",
  TRANSFER_OUT: "danger",
  CONSUMPTION: "danger",
  WASTAGE: "danger",
  ADJUSTMENT_IN: "warning",
  ADJUSTMENT_OUT: "warning",
  RETURN: "neutral",
};

const COLUMNS: DataColumn<StockLedger>[] = [
  {
    key: "created_at",
    header: "Date",
    render: (row) => new Date(row.createdAt).toLocaleString(),
  },
  {
    key: "movement_type",
    header: "Type",
    render: (row) => (
      <Badge tone={MOVEMENT_TONE[row.movementType] ?? "neutral"}>
        {row.movementType}
      </Badge>
    ),
  },
  {
    key: "item_id",
    header: "Item",
    render: (row) => <span className="font-mono text-xs">{row.itemId}</span>,
  },
  {
    key: "quantity",
    header: "Qty",
    align: "right",
    render: (row) => (
      <span className="tabular-nums">
        {Number(row.quantity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}
      </span>
    ),
  },
  {
    key: "total_cost",
    header: "Cost",
    align: "right",
    render: (row) => (
      <span className="tabular-nums">
        {Number(row.totalCost).toFixed(2)}
      </span>
    ),
  },
  {
    key: "reason",
    header: "Reason",
    render: (row) => row.reason || "—",
  },
];

export default function MovementsPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const organizationId = context.organizationId;

  const [movements, setMovements] = useState<StockLedger[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (!organizationId) return;
    let ignore = false;
    setMovements(null);
    listStockMovements(organizationId)
      .then((data) => { if (!ignore) setMovements(data); })
      .catch((err) => {
        if (ignore) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => { ignore = true; };
  }, [organizationId]);

  if (status !== "ready" || !organizationId) {
    return <LoadingBlock />;
  }

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Stock Movements</h1>
        <p className="mt-0.5 text-xs text-muted">
          Immutable ledger of every stock movement posted
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-danger bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <Card
        title={`Movements${movements ? ` (${movements.length})` : ""}`}
        padded={false}
      >
        <DataTable<StockLedger>
          columns={COLUMNS}
          rows={movements ?? []}
          rowKey={(row) => row.id}
          loading={movements === null}
          empty={
            <EmptyState
              icon={<ArrowRightLeft aria-hidden />}
              title="No movements yet"
              description="Stock movements appear here when opening stock, receipts, wastage, adjustments or transfers are posted."
            />
          }
        />
      </Card>
    </div>
  );
}
