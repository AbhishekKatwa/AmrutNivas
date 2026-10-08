/**
 * Commerce Orders — the order ledger for digital channel sessions.
 *
 * Phase 1 destination. Reads commerce sessions and table requests to show
 * active and completed orders from digital channels.
 */

import { useEffect, useState } from "react";
import { ShoppingBag, Clock, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { listTableRequests } from "@/domain/commerce/commerce-service";
import type { TableRequest } from "@/domain/commerce/types";
import { useContextStore } from "@/state/context-store";

export default function OrdersPage() {
  const context = useContextStore((s) => s.context);
  const organizationId = context.organizationId;
  const propertyId = context.propertyId;
  const outletId = context.outletId;

  const [requests, setRequests] = useState<TableRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    let ignore = false;
    setLoading(true);
    listTableRequests({
      organizationId,
      propertyId: propertyId ?? undefined,
      outletId: outletId ?? undefined,
    })
      .then((rows) => {
        if (ignore) return;
        setRequests(rows);
        setLoading(false);
      })
      .catch((err) => {
        if (ignore) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => { ignore = true; };
  }, [organizationId, propertyId, outletId]);

  if (loading) return <LoadingBlock label="Loading orders" />;

  const active = requests.filter((r) => r.status === "OPEN" || r.status === "IN_PROGRESS");
  const resolved = requests.filter((r) => r.status === "RESOLVED");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Orders</h1>
        <p className="mt-1 text-sm text-muted">
          Digital channel orders and table requests from all connected sources.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card title="Active Requests" description="Currently open">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50">
              <Clock className="size-5 text-brand-700" />
            </div>
            <div className="text-2xl font-semibold text-ink tabular-nums">
              {active.length}
            </div>
          </div>
        </Card>
        <Card title="Resolved" description="Completed requests">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-success-soft">
              <CheckCircle2 className="size-5 text-success" />
            </div>
            <div className="text-2xl font-semibold text-ink tabular-nums">
              {resolved.length}
            </div>
          </div>
        </Card>
        <Card title="Total Requests" description="All table requests">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50">
              <ShoppingBag className="size-5 text-brand-700" />
            </div>
            <div className="text-2xl font-semibold text-ink tabular-nums">
              {requests.length}
            </div>
          </div>
        </Card>
      </div>

      {requests.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag />}
          title="No orders yet"
          description="Orders from digital channels (website, QR, delivery partners) will appear here once customers start ordering."
        />
      ) : (
        <Card title="Recent Requests">
          <div className="divide-y divide-line">
            {requests.slice(0, 20).map((req) => (
              <div key={req.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-8 items-center justify-center rounded-md bg-surface-sunken">
                    <ShoppingBag className="size-4 text-muted" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-ink">
                      {req.type.replace(/_/g, " ")}
                    </div>
                    <div className="text-xs text-muted">
                      {new Date(req.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  req.status === "RESOLVED"
                    ? "bg-success-soft text-success"
                    : req.status === "CANCELLED"
                      ? "bg-danger-soft text-danger"
                      : "bg-brand-50 text-brand-700"
                }`}>
                  {req.status}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
