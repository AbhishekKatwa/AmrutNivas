import { useEffect, useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { listStockMovements } from "@/domain/inventory/stock-service";
import type { StockLedger } from "@/domain/inventory/types";
import { useContextStore } from "@/state/context-store";

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

  const [movements, setMovements] = useState<StockLedger[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (!organizationId || !propertyId) return;
    let ignore = false;
    setMovements(null);
    listStockMovements(organizationId)
      .then((data: StockLedger[]) => {
        if (ignore) return;
        const transfers = data.filter(
          (m: StockLedger) => m.movementType === "TRANSFER_IN" || m.movementType === "TRANSFER_OUT"
        );
        setMovements(transfers);
      })
      .catch((err: unknown) => {
        if (ignore) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => { ignore = true; };
  }, [organizationId, propertyId]);

  if (!movements) {
    return <LoadingBlock label="Loading transfers" />;
  }

  return (
    <div className="space-y-6">
      <Card
        title="Stock Transfers"
        description="Inventory movements between locations"
      >
        {error && (
          <div className="mb-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}
        {movements.length === 0 ? (
          <EmptyState
            icon={<ArrowRightLeft />}
            title="No transfers yet"
            description="Transfer records will appear here when stock moves between locations."
          />
        ) : (
          <DataTable columns={COLUMNS} rows={movements} rowKey={(r) => r.id} />
        )}
      </Card>
    </div>
  );
}
