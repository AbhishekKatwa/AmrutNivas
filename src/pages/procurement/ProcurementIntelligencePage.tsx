import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ShieldAlert,
  BarChart3,
  ArrowUpRight,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { can } from "@/domain/identity/types";
import { useContextStore } from "@/state/context-store";
import {
  getProcurementIntelligence,
  ensureSupplyChainDemoSeeded,
} from "@/domain/supply-chain/supply-chain-service";
import type { ProcurementIntelligenceData, SupplierSpend, SupplierPriceChange } from "@/domain/supply-chain/types";
import clsx from "clsx";

export default function ProcurementIntelligencePage() {
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const organizationId = context.organizationId;
  const propertyId = context.propertyId;

  const canView = can("supply_chain.intelligence.view", permissions);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ProcurementIntelligenceData | null>(null);

  useEffect(() => {
    if (!organizationId || !propertyId || !canView) return;
    let ignore = false;
    setLoading(true);
    setError(null);

    try {
      ensureSupplyChainDemoSeeded(organizationId, propertyId);
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const endDate = new Date().toISOString().slice(0, 10);
      const result = getProcurementIntelligence(organizationId, propertyId, startDate, endDate);
      if (!ignore) setData(result);
    } catch (err) {
      if (!ignore) setError(err instanceof Error ? err.message : "Failed to load intelligence");
    } finally {
      if (!ignore) setLoading(false);
    }

    return () => { ignore = true; };
  }, [organizationId, propertyId, canView]);

  if (!canView) {
    return <AccessDenied capability="Procurement Intelligence" permission="supply_chain.intelligence.view" />;
  }

  if (loading) {
    return <LoadingBlock label="Loading procurement intelligence..." />;
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-900">{error}</div>
      </div>
    );
  }

  if (!data) {
    return <EmptyState icon={<BarChart3 />} title="No intelligence data" description="Procurement intelligence is not available for this property." />;
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Procurement Intelligence</h1>
        <p className="mt-1 text-sm text-gray-600">
          Spend analytics, supplier concentration, cost risks, and anomaly detection
        </p>
      </div>

      {/* Total spend */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="text-sm text-gray-500">Total Purchase Spend</div>
        <div className="mt-1 text-3xl font-bold text-gray-900">
          ₹{data.totalPurchaseValue.toLocaleString("en-IN")}
        </div>
        <div className="mt-1 text-xs text-gray-400">
          {data.period.startDate} to {data.period.endDate}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Spend by supplier */}
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-3">
            <h3 className="font-medium text-gray-900">Spend by Supplier</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {data.spendBySupplier.map((s) => (
              <SpendRow key={s.supplierId} spend={s} />
            ))}
          </div>
        </div>

        {/* Spend by category */}
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-3">
            <h3 className="font-medium text-gray-900">Spend by Category</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {data.spendByCategory.map((c) => (
              <div key={c.category} className="flex items-center justify-between px-4 py-3">
                <div className="text-sm text-gray-900">{c.category}</div>
                <div className="text-right">
                  <div className="text-sm font-medium text-gray-900">₹{c.spend.toLocaleString("en-IN")}</div>
                  <div className="text-xs text-gray-500">{c.percentage}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top cost items */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4 py-3">
          <h3 className="font-medium text-gray-900">Top Cost Items</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-2 text-left font-medium text-gray-600">Item</th>
              <th className="px-4 py-2 text-right font-medium text-gray-600">Total Spend</th>
              <th className="px-4 py-2 text-right font-medium text-gray-600">Quantity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.topCostItems.map((item) => (
              <tr key={item.itemId} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{item.itemName}</td>
                <td className="px-4 py-3 text-right text-gray-900">₹{item.totalSpend.toLocaleString("en-IN")}</td>
                <td className="px-4 py-3 text-right text-gray-600">{item.quantity.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Risk sections */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Single supplier risk */}
        <RiskSection
          title="Single Supplier Risk"
          icon={<ShieldAlert className="h-4 w-4 text-red-500" />}
          items={data.singleSupplierRisks}
          emptyMessage="All items have multiple suppliers."
          renderItem={(risk) => (
            <div key={risk.itemId} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm font-medium text-gray-900">{risk.itemName}</div>
                <div className="text-xs text-gray-500">{risk.supplierName}</div>
              </div>
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                {risk.supplierCount} supplier
              </span>
            </div>
          )}
        />

        {/* Stockout risks */}
        <RiskSection
          title="Stockout Risks"
          icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
          items={data.stockoutRisks}
          emptyMessage="No stockout risks detected."
          renderItem={(risk) => (
            <div key={risk.itemId} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm font-medium text-gray-900">{risk.itemName}</div>
                <div className="text-xs text-gray-500">
                  Stock: {risk.currentStock} | {risk.daysLeft != null ? `${risk.daysLeft} days left` : "No consumption data"}
                </div>
              </div>
              <span className={clsx(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                risk.riskLevel === "CRITICAL" && "bg-red-100 text-red-800",
                risk.riskLevel === "HIGH" && "bg-orange-100 text-orange-800",
                risk.riskLevel === "MEDIUM" && "bg-amber-100 text-amber-800",
                risk.riskLevel === "LOW" && "bg-green-100 text-green-800",
              )}>
                {risk.riskLevel}
              </span>
            </div>
          )}
        />
      </div>

      {/* Price changes */}
      {data.priceChanges.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-3">
            <h3 className="font-medium text-gray-900 flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4 text-red-500" /> Recent Price Changes
            </h3>
          </div>
          <div className="divide-y divide-gray-50">
            {data.priceChanges.map((pc, idx) => (
              <PriceChangeRow key={idx} change={pc} />
            ))}
          </div>
        </div>
      )}

      {/* Cost anomalies */}
      {data.costAnomalies.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-3">
            <h3 className="font-medium text-gray-900">Cost Anomalies</h3>
            <p className="text-xs text-gray-500">Review recommended</p>
          </div>
          <div className="divide-y divide-gray-50">
            {data.costAnomalies.map((anomaly) => (
              <div key={anomaly.id} className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-medium text-gray-900">{anomaly.title}</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">{anomaly.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SpendRow({ spend }: { spend: SupplierSpend }) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-gray-900">{spend.supplierName}</div>
        <div className="text-right">
          <div className="text-sm font-medium text-gray-900">₹{spend.totalSpend.toLocaleString("en-IN")}</div>
          <div className="text-xs text-gray-500">{spend.percentageOfTotal}%</div>
        </div>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-gray-100">
        <div
          className="h-1.5 rounded-full bg-green-600"
          style={{ width: `${Math.min(spend.percentageOfTotal, 100)}%` }}
        />
      </div>
    </div>
  );
}

function PriceChangeRow({ change }: { change: SupplierPriceChange }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div>
        <div className="text-sm font-medium text-gray-900">{change.itemName}</div>
        <div className="text-xs text-gray-500">{change.supplierName}</div>
      </div>
      <div className="text-right">
        <div className="text-sm text-gray-900">₹{change.previousRate} → ₹{change.currentRate}</div>
        <div className="text-xs font-medium text-red-600">+{change.changePercent.toFixed(1)}%</div>
      </div>
    </div>
  );
}

function RiskSection<T>({
  title,
  icon,
  items,
  emptyMessage,
  renderItem,
}: {
  title: string;
  icon: React.ReactNode;
  items: readonly T[];
  emptyMessage: string;
  renderItem: (item: T) => React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-4 py-3">
        <h3 className="font-medium text-gray-900 flex items-center gap-2">{icon} {title}</h3>
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-gray-500">{emptyMessage}</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {items.map(renderItem)}
        </div>
      )}
    </div>
  );
}
