/**
 * Purchases — the purchase order ledger for the active property.
 *
 * Phase 2 destination. Reads purchase orders from the procurement domain
 * and shows them by status.
 */

import { useEffect, useState } from "react";
import { Package, ClipboardCheck, Truck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { listPurchaseOrders } from "@/domain/procurement/purchase-service";
import type { PurchaseOrder } from "@/domain/procurement/types";
import { useContextStore } from "@/state/context-store";

export default function PurchasesPage() {
  const context = useContextStore((s) => s.context);
  const organizationId = context.organizationId;

  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    let ignore = false;
    setLoading(true);
    listPurchaseOrders(organizationId)
      .then((rows) => {
        if (ignore) return;
        setOrders(rows);
        setLoading(false);
      })
      .catch((err) => {
        if (ignore) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => { ignore = true; };
  }, [organizationId]);

  if (loading) return <LoadingBlock label="Loading purchase orders" />;

  const draft = orders.filter((o) => o.status === "DRAFT" || o.status === "PENDING_APPROVAL");
  const approved = orders.filter((o) => o.status === "APPROVED" || o.status === "SENT");
  const received = orders.filter((o) => o.status === "PARTIALLY_RECEIVED" || o.status === "RECEIVED");

  const totalValue = orders.reduce((sum, o) => sum + (o.grandTotal ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Purchases</h1>
        <p className="mt-1 text-sm text-muted">
          Purchase orders and procurement activity for the organization.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Draft / Pending" description="Awaiting approval">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-amber-50">
              <ClipboardCheck className="size-5 text-amber-600" />
            </div>
            <div className="text-2xl font-semibold text-ink tabular-nums">{draft.length}</div>
          </div>
        </Card>
        <Card title="Approved / Sent" description="With supplier">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50">
              <Package className="size-5 text-brand-700" />
            </div>
            <div className="text-2xl font-semibold text-ink tabular-nums">{approved.length}</div>
          </div>
        </Card>
        <Card title="Received" description="Goods received">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-success-soft">
              <Truck className="size-5 text-success" />
            </div>
            <div className="text-2xl font-semibold text-ink tabular-nums">{received.length}</div>
          </div>
        </Card>
        <Card title="Total Value" description="All orders">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-surface-sunken">
              <Package className="size-5 text-muted" />
            </div>
            <div className="text-2xl font-semibold text-ink tabular-nums">
              ₹{totalValue.toLocaleString("en-IN")}
            </div>
          </div>
        </Card>
      </div>

      {orders.length === 0 ? (
        <EmptyState
          icon={<Package />}
          title="No purchase orders yet"
          description="Create a purchase request to start the procurement workflow. Requests become orders once approved."
        />
      ) : (
        <Card title="Recent Purchase Orders">
          <div className="divide-y divide-line">
            {orders.slice(0, 20).map((order) => (
              <div key={order.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-8 items-center justify-center rounded-md bg-surface-sunken">
                    <Package className="size-4 text-muted" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-ink">
                      PO #{order.poNumber}
                    </div>
                    <div className="text-xs text-muted">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-ink tabular-nums">
                    ₹{(order.grandTotal ?? 0).toLocaleString("en-IN")}
                  </div>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    order.status === "RECEIVED" || order.status === "CLOSED"
                      ? "bg-success-soft text-success"
                      : order.status === "CANCELLED"
                        ? "bg-danger-soft text-danger"
                        : order.status === "SENT" || order.status === "APPROVED"
                          ? "bg-brand-50 text-brand-700"
                          : "bg-amber-50 text-amber-600"
                  }`}>
                    {order.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
