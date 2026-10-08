import { useEffect, useState } from "react";
import {
  Package,
  AlertTriangle,
  Clock,
  FileText,
  TrendingUp,
  AlertCircle,
  ShieldAlert,
  Calendar,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { can } from "@/domain/identity/types";
import { useContextStore } from "@/state/context-store";
import {
  getProcurementDashboard,
  ensureSupplyChainDemoSeeded,
} from "@/domain/supply-chain/supply-chain-service";
import type { ProcurementDashboardData, ProcurementAttention } from "@/domain/supply-chain/types";
import clsx from "clsx";

export default function ProcurementDashboard() {
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const organizationId = context.organizationId;
  const propertyId = context.propertyId;

  const canView = can("supply_chain.view", permissions);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<ProcurementDashboardData | null>(null);

  useEffect(() => {
    if (!organizationId || !propertyId || !canView) return;
    let ignore = false;
    setLoading(true);
    setError(null);

    try {
      ensureSupplyChainDemoSeeded(organizationId, propertyId);
      const data = getProcurementDashboard(organizationId, propertyId);
      if (!ignore) setDashboard(data);
    } catch (err) {
      if (!ignore) setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      if (!ignore) setLoading(false);
    }

    return () => { ignore = true; };
  }, [organizationId, propertyId, canView]);

  if (!canView) {
    return <AccessDenied capability="Procurement" permission="supply_chain.view" />;
  }

  if (loading) {
    return <LoadingBlock label="Loading procurement dashboard..." />;
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-900">{error}</div>
      </div>
    );
  }

  if (!dashboard) {
    return <EmptyState icon={<Package />} title="No procurement data" description="Procurement data is not available for this property." />;
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Procurement</h1>
        <p className="mt-1 text-sm text-gray-600">
          Purchase orders, supplier management, and procurement intelligence
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Open POs"
          value={dashboard.openPOCount}
          subtitle={`₹${dashboard.totalOpenPOValue.toLocaleString("en-IN")} value`}
          icon={<Package className="h-5 w-5 text-blue-600" />}
        />
        <KpiCard
          title="Overdue"
          value={dashboard.overduePOCount}
          subtitle="Past expected delivery"
          icon={<Clock className="h-5 w-5 text-red-600" />}
          tone="red"
        />
        <KpiCard
          title="Pending Approval"
          value={dashboard.pendingApprovalCount}
          subtitle="Purchase requests"
          icon={<FileText className="h-5 w-5 text-amber-600" />}
          tone="amber"
        />
        <KpiCard
          title="Outstanding Payable"
          value={`₹${dashboard.totalOutstandingPayable.toLocaleString("en-IN")}`}
          subtitle="To suppliers"
          icon={<TrendingUp className="h-5 w-5 text-purple-600" />}
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MiniCard
          title="Open Issues"
          value={dashboard.openIssueCount}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone={dashboard.openIssueCount > 0 ? "amber" : "green"}
        />
        <MiniCard
          title="Price Increases"
          value={dashboard.priceIncreaseCount}
          icon={<TrendingUp className="h-4 w-4" />}
          tone={dashboard.priceIncreaseCount > 0 ? "red" : "green"}
        />
        <MiniCard
          title="Stockout Risks"
          value={dashboard.stockoutRiskCount}
          icon={<ShieldAlert className="h-4 w-4" />}
          tone={dashboard.stockoutRiskCount > 0 ? "red" : "green"}
        />
        <MiniCard
          title="Contracts Expiring"
          value={dashboard.contractsExpiringCount}
          icon={<Calendar className="h-4 w-4" />}
          tone={dashboard.contractsExpiringCount > 0 ? "amber" : "green"}
        />
      </div>

      {/* Attention Center */}
      {dashboard.recentAttendions.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-3">
            <h3 className="font-medium text-gray-900">Attention Center</h3>
            <p className="text-xs text-gray-500">Actionable items requiring review</p>
          </div>
          <div className="divide-y divide-gray-50">
            {dashboard.recentAttendions.map((att) => (
              <AttentionRow key={att.id} attention={att} />
            ))}
          </div>
        </div>
      )}

      {dashboard.recentAttendions.length === 0 && (
        <EmptyState
          icon={<AlertCircle />}
          title="All clear"
          description="No procurement items require attention right now."
        />
      )}
    </div>
  );
}

function KpiCard({
  title,
  value,
  subtitle,
  icon,
  tone,
}: {
  title: string;
  value: number | string;
  subtitle: string;
  icon: React.ReactNode;
  tone?: "red" | "amber";
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-gray-600">{title}</div>
        {icon}
      </div>
      <div className={clsx(
        "mt-2 text-2xl font-semibold",
        tone === "red" ? "text-red-700" : tone === "amber" ? "text-amber-700" : "text-gray-900",
      )}>
        {value}
      </div>
      <div className="mt-1 text-xs text-gray-500">{subtitle}</div>
    </div>
  );
}

function MiniCard({
  title,
  value,
  icon,
  tone,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  tone: "red" | "amber" | "green";
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
      <div className={clsx(
        "flex h-8 w-8 items-center justify-center rounded-full",
        tone === "red" && "bg-red-100 text-red-700",
        tone === "amber" && "bg-amber-100 text-amber-700",
        tone === "green" && "bg-green-100 text-green-700",
      )}>
        {icon}
      </div>
      <div>
        <div className="text-lg font-semibold text-gray-900">{value}</div>
        <div className="text-xs text-gray-500">{title}</div>
      </div>
    </div>
  );
}

function AttentionRow({ attention }: { attention: ProcurementAttention }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className={clsx(
        "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
        attention.priority === "CRITICAL" && "bg-red-100 text-red-700",
        attention.priority === "HIGH" && "bg-orange-100 text-orange-700",
        attention.priority === "MEDIUM" && "bg-amber-100 text-amber-700",
        attention.priority === "LOW" && "bg-blue-100 text-blue-700",
      )}>
        {attention.priority[0]}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500">{attention.category}</span>
        </div>
        <div className="text-sm font-medium text-gray-900">{attention.title}</div>
        <div className="text-xs text-gray-500">{attention.description}</div>
      </div>
    </div>
  );
}
