import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Package,
  TrendingUp,
  AlertTriangle,
  FileText,
  Star,
  Clock,
} from "lucide-react";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { can } from "@/domain/identity/types";
import { useContextStore } from "@/state/context-store";
import {
  getSupplier360,
  ensureSupplyChainDemoSeeded,
} from "@/domain/supply-chain/supply-chain-service";
import type { Supplier360Data, SupplierIssue, SupplierContract, SupplierPriceChange } from "@/domain/supply-chain/types";
import clsx from "clsx";

export default function Supplier360Page() {
  const { supplierId } = useParams<{ supplierId: string }>();
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const organizationId = context.organizationId;
  const propertyId = context.propertyId;

  const canView = can("supply_chain.supplier.view", permissions);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Supplier360Data | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "orders" | "issues" | "contracts" | "prices" | "items">("overview");

  useEffect(() => {
    if (!organizationId || !propertyId || !supplierId || !canView) return;
    let ignore = false;
    setLoading(true);

    try {
      ensureSupplyChainDemoSeeded(organizationId, propertyId);
      const result = getSupplier360(organizationId, supplierId);
      if (!ignore) setData(result);
    } catch {
      if (!ignore) setData(null);
    } finally {
      if (!ignore) setLoading(false);
    }

    return () => { ignore = true; };
  }, [organizationId, propertyId, supplierId, canView]);

  if (!canView) {
    return <AccessDenied capability="Supplier 360" permission="supply_chain.supplier.view" />;
  }

  if (loading) {
    return <LoadingBlock label="Loading supplier profile..." />;
  }

  if (!data) {
    return (
      <div className="p-6">
        <Link to="/procurement" className="text-sm text-green-700 hover:underline flex items-center gap-1 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to Procurement
        </Link>
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-500">Supplier not found.</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { key: "overview" as const, label: "Overview" },
    { key: "orders" as const, label: "Orders" },
    { key: "issues" as const, label: "Issues" },
    { key: "contracts" as const, label: "Contracts" },
    { key: "prices" as const, label: "Price History" },
    { key: "items" as const, label: "Items" },
  ];

  return (
    <div className="space-y-6 p-6">
      <Link to="/procurement" className="text-sm text-green-700 hover:underline flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Back to Procurement
      </Link>

      {/* Header */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{data.supplierName}</h1>
            <div className="mt-1 flex items-center gap-3">
              <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                {data.status}
              </span>
              <span className="text-sm text-gray-500">{data.supplierType.replace("_", " ")}</span>
            </div>
          </div>
          {data.scorecard && (
            <div className="text-right">
              <div className="text-3xl font-bold text-gray-900">{data.scorecard.overallScore}</div>
              <div className="text-xs text-gray-500">Score / 100</div>
            </div>
          )}
        </div>

        {/* Summary stats */}
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatBox label="Total Orders" value={data.totalOrders.toString()} icon={<Package className="h-4 w-4" />} />
          <StatBox label="Total Spend" value={`₹${data.totalSpend.toLocaleString("en-IN")}`} icon={<TrendingUp className="h-4 w-4" />} />
          <StatBox label="Outstanding" value={`₹${data.outstandingPayable.toLocaleString("en-IN")}`} icon={<FileText className="h-4 w-4" />} />
          <StatBox label="Avg Lead Time" value={data.averageLeadTime != null ? `${data.averageLeadTime} days` : "N/A"} icon={<Clock className="h-4 w-4" />} />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={clsx(
                "border-b-2 pb-2 text-sm font-medium transition-colors",
                activeTab === tab.key
                  ? "border-green-600 text-green-700"
                  : "border-transparent text-gray-500 hover:text-gray-700",
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && <OverviewTab data={data} />}
      {activeTab === "orders" && <OrdersTab data={data} />}
      {activeTab === "issues" && <IssuesTab issues={data.recentIssues} />}
      {activeTab === "contracts" && <ContractsTab contracts={data.activeContracts} />}
      {activeTab === "prices" && <PricesTab changes={data.priceChanges} />}
      {activeTab === "items" && <ItemsTab data={data} />}
    </div>
  );
}

function StatBox({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
      <div className="flex items-center gap-2 text-gray-500">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className="mt-1 text-lg font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function OverviewTab({ data }: { data: Supplier360Data }) {
  if (!data.scorecard) {
    return <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-gray-500">No scorecard data available.</div>;
  }

  const { components } = data.scorecard;
  const scoreItems = [
    { label: "Delivery", value: components.delivery },
    { label: "Fill Rate", value: components.fillRate },
    { label: "Quality", value: components.quality },
    { label: "Price Stability", value: components.priceStability },
    { label: "Invoice Accuracy", value: components.invoiceAccuracy },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
          <Star className="h-4 w-4 text-amber-500" /> Performance Scorecard
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
          {scoreItems.map((item) => (
            <div key={item.label} className="text-center">
              <div className={clsx(
                "text-2xl font-bold",
                item.value >= 80 ? "text-green-600" : item.value >= 60 ? "text-amber-600" : "text-red-600",
              )}>
                {item.value}
              </div>
              <div className="text-xs text-gray-500">{item.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="font-medium text-gray-900 mb-3">Quality Summary</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <div className="text-xs text-gray-500">Accepted Qty</div>
            <div className="text-lg font-semibold text-gray-900">{data.scorecard.acceptedQuantity.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Rejected Qty</div>
            <div className="text-lg font-semibold text-red-600">{data.scorecard.rejectedQuantity.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Invoice Matches</div>
            <div className="text-lg font-semibold text-green-600">{data.scorecard.invoiceMatchCount}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Invoice Mismatches</div>
            <div className="text-lg font-semibold text-amber-600">{data.scorecard.invoiceMismatchCount}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrdersTab({ data }: { data: Supplier360Data }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="px-4 py-2 text-left font-medium text-gray-600">PO Number</th>
            <th className="px-4 py-2 text-left font-medium text-gray-600">Date</th>
            <th className="px-4 py-2 text-right font-medium text-gray-600">Total</th>
            <th className="px-4 py-2 text-left font-medium text-gray-600">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {data.recentOrders.map((order) => (
            <tr key={order.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-900">{order.orderNumber}</td>
              <td className="px-4 py-3 text-gray-600">{order.orderDate}</td>
              <td className="px-4 py-3 text-right text-gray-900">₹{order.total.toLocaleString("en-IN")}</td>
              <td className="px-4 py-3">
                <span className={clsx(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  order.status === "RECEIVED" && "bg-green-100 text-green-800",
                  order.status === "APPROVED" && "bg-blue-100 text-blue-800",
                  order.status === "SENT" && "bg-purple-100 text-purple-800",
                )}>
                  {order.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IssuesTab({ issues }: { issues: readonly SupplierIssue[] }) {
  if (issues.length === 0) {
    return <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-gray-500">No issues recorded.</div>;
  }

  return (
    <div className="space-y-3">
      {issues.map((issue) => (
        <div key={issue.id} className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-medium text-gray-900">{issue.issueType.replace(/_/g, " ")}</span>
              </div>
              <p className="mt-1 text-sm text-gray-600">{issue.description}</p>
            </div>
            <span className={clsx(
              "rounded-full px-2 py-0.5 text-xs font-medium",
              issue.status === "OPEN" && "bg-red-100 text-red-800",
              issue.status === "INVESTIGATING" && "bg-amber-100 text-amber-800",
              issue.status === "RESOLVED" && "bg-green-100 text-green-800",
              issue.status === "CLOSED" && "bg-gray-100 text-gray-800",
            )}>
              {issue.status}
            </span>
          </div>
          <div className="mt-2 text-xs text-gray-400">
            Severity: {issue.severity} | Created: {issue.createdAt.slice(0, 10)}
          </div>
        </div>
      ))}
    </div>
  );
}

function ContractsTab({ contracts }: { contracts: readonly SupplierContract[] }) {
  if (contracts.length === 0) {
    return <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-gray-500">No active contracts.</div>;
  }

  return (
    <div className="space-y-3">
      {contracts.map((contract) => (
        <div key={contract.id} className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-900">{contract.contractNumber}</div>
              <div className="text-xs text-gray-500">{contract.startDate} to {contract.endDate}</div>
            </div>
            <span className={clsx(
              "rounded-full px-2 py-0.5 text-xs font-medium",
              contract.status === "ACTIVE" && "bg-green-100 text-green-800",
              contract.status === "EXPIRING" && "bg-amber-100 text-amber-800",
              contract.status === "EXPIRED" && "bg-red-100 text-red-800",
            )}>
              {contract.status}
            </span>
          </div>
          {contract.paymentTerms && (
            <div className="mt-2 text-xs text-gray-500">Payment: {contract.paymentTerms}</div>
          )}
          {contract.priceTerms && (
            <div className="mt-1 text-xs text-gray-500">Terms: {contract.priceTerms}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function PricesTab({ changes }: { changes: readonly SupplierPriceChange[] }) {
  if (changes.length === 0) {
    return <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-gray-500">No price changes recorded.</div>;
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="px-4 py-2 text-left font-medium text-gray-600">Item</th>
            <th className="px-4 py-2 text-right font-medium text-gray-600">Previous</th>
            <th className="px-4 py-2 text-right font-medium text-gray-600">Current</th>
            <th className="px-4 py-2 text-right font-medium text-gray-600">Change</th>
            <th className="px-4 py-2 text-left font-medium text-gray-600">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {changes.map((pc, idx) => (
            <tr key={idx} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-900">{pc.itemName}</td>
              <td className="px-4 py-3 text-right text-gray-600">₹{pc.previousRate}</td>
              <td className="px-4 py-3 text-right text-gray-900">₹{pc.currentRate}</td>
              <td className={clsx(
                "px-4 py-3 text-right font-medium",
                pc.changePercent > 0 ? "text-red-600" : "text-green-600",
              )}>
                {pc.changePercent > 0 ? "+" : ""}{pc.changePercent.toFixed(1)}%
              </td>
              <td className="px-4 py-3 text-gray-500">{pc.effectiveDate}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ItemsTab({ data }: { data: Supplier360Data }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="px-4 py-2 text-left font-medium text-gray-600">Item</th>
            <th className="px-4 py-2 text-right font-medium text-gray-600">Current Rate</th>
            <th className="px-4 py-2 text-center font-medium text-gray-600">Lead Time</th>
            <th className="px-4 py-2 text-center font-medium text-gray-600">Preferred</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {data.items.map((item) => (
            <tr key={item.itemId} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-900">{item.itemName}</td>
              <td className="px-4 py-3 text-right text-gray-900">₹{item.currentRate}</td>
              <td className="px-4 py-3 text-center text-gray-600">{item.leadTimeDays != null ? `${item.leadTimeDays}d` : "N/A"}</td>
              <td className="px-4 py-3 text-center">
                {item.isPreferred && <Star className="h-4 w-4 text-amber-500 inline" />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
