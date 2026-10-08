/**
 * Suppliers — the supplier master for the organization.
 *
 * Phase 2 destination. Reads suppliers from the procurement domain
 * and shows them with contact and status information.
 */

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { listSuppliers } from "@/domain/procurement/supplier-service";
import type { Supplier } from "@/domain/procurement/types";
import { useContextStore } from "@/state/context-store";

export default function SuppliersPage() {
  const context = useContextStore((s) => s.context);
  const organizationId = context.organizationId;

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    let ignore = false;
    setLoading(true);
    listSuppliers(organizationId)
      .then((rows) => {
        if (ignore) return;
        setSuppliers(rows);
        setLoading(false);
      })
      .catch((err) => {
        if (ignore) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => { ignore = true; };
  }, [organizationId]);

  if (loading) return <LoadingBlock label="Loading suppliers" />;

  const active = suppliers.filter((s) => s.status === "ACTIVE");
  const types = new Set(suppliers.map((s) => s.supplierType).filter(Boolean));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Suppliers</h1>
        <p className="mt-1 text-sm text-muted">
          Vendor master for the organization.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card title="Total Suppliers" description="All vendors">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50">
              <Users className="size-5 text-brand-700" />
            </div>
            <div className="text-2xl font-semibold text-ink tabular-nums">{suppliers.length}</div>
          </div>
        </Card>
        <Card title="Active" description="Currently trading">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-success-soft">
              <Users className="size-5 text-success" />
            </div>
            <div className="text-2xl font-semibold text-ink tabular-nums">{active.length}</div>
          </div>
        </Card>
        <Card title="Types" description="Supplier types">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-surface-sunken">
              <Users className="size-5 text-muted" />
            </div>
            <div className="text-2xl font-semibold text-ink tabular-nums">{types.size}</div>
          </div>
        </Card>
      </div>

      {suppliers.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="No suppliers yet"
          description="Add suppliers to start creating purchase orders and tracking procurement activity."
        />
      ) : (
        <Card title="Supplier Directory">
          <div className="divide-y divide-line">
            {suppliers.slice(0, 30).map((supplier) => (
              <div key={supplier.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50">
                    <span className="text-sm font-semibold text-brand-700">
                      {supplier.legalName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-ink">{supplier.legalName}</div>
                    <div className="text-xs text-muted">
                      {supplier.supplierType.replace(/_/g, " ")}
                      {supplier.tradeName ? ` · ${supplier.tradeName}` : ""}
                    </div>
                  </div>
                </div>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  supplier.status === "ACTIVE"
                    ? "bg-success-soft text-success"
                    : supplier.status === "INACTIVE"
                      ? "bg-surface-sunken text-muted"
                      : "bg-amber-50 text-amber-600"
                }`}>
                  {supplier.status}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
