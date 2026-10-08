import { useEffect, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { listStockTakes } from "@/domain/inventory/stock-service";
import type { StockTake } from "@/domain/inventory/types";
import { useContextStore } from "@/state/context-store";

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

  const [stockTakes, setStockTakes] = useState<StockTake[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (!organizationId || !propertyId) return;
    let ignore = false;
    setStockTakes(null);
    listStockTakes(organizationId, propertyId)
      .then((data) => {
        if (ignore) return;
        setStockTakes(data);
      })
      .catch((err) => {
        if (ignore) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => { ignore = true; };
  }, [organizationId, propertyId]);

  if (!stockTakes) {
    return <LoadingBlock label="Loading stock takes" />;
  }

  return (
    <div className="space-y-6">
      <Card
        title="Stock Takes"
        description="Physical inventory counts and variance analysis"
      >
        {error && (
          <div className="mb-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}
        {stockTakes.length === 0 ? (
          <EmptyState
            icon={<ClipboardCheck />}
            title="No stock takes yet"
            description="Create a stock take to count physical inventory and reconcile with system records."
          />
        ) : (
          <DataTable columns={COLUMNS} rows={stockTakes} rowKey={(r) => r.id} />
        )}
      </Card>
    </div>
  );
}
