/**
 * Price history — audit trail of all price changes.
 *
 * Shows when prices changed, why they changed, and who changed them.
 * Supports filtering by product and date range.
 */

import { useEffect, useState } from "react";
import { History, Calendar, User } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { can } from "@/domain/identity/types";
import { useContextStore } from "@/state/context-store";
import { listPriceHistory } from "@/domain/revenue/pricing-service";
import { toPublicError } from "@/lib/errors";
import { format } from "date-fns";
import type { PriceHistory, PriceSource } from "@/domain/revenue/types";
import clsx from "clsx";

export default function PriceHistoryPage() {
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const organizationId = context.organizationId;
  const propertyId = context.propertyId;

  const canView = can("revenue.pricing.view", permissions);

  const [history, setHistory] = useState<PriceHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId || !propertyId || !canView) return;
    setLoading(true);
    setError(null);

    try {
      setHistory(listPriceHistory(organizationId, propertyId, undefined, 100));
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setLoading(false);
    }
  }, [organizationId, propertyId, canView]);

  if (!canView) {
    return <AccessDenied capability="Price History" permission="revenue.pricing.view" />;
  }

  if (loading) {
    return <LoadingBlock label="Loading price history…" />;
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Price History</h1>
        <p className="mt-1 text-sm text-gray-600">
          Audit trail of all price changes with reasons and sources
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-900">
          {error}
        </div>
      )}

      {history.length === 0 ? (
        <EmptyState
          title="No price changes"
          description="Price changes will appear here as they occur."
          icon={<History className="h-12 w-12 text-gray-400" />}
        />
      ) : (
        <div className="space-y-3">
          {history.map((item) => (
            <PriceHistoryCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function PriceHistoryCard({ item }: { item: PriceHistory }) {
  const sourceColors: Record<PriceSource, string> = {
    BASE: "bg-gray-100 text-gray-800",
    RATE_PLAN: "bg-blue-100 text-blue-800",
    PROMOTION: "bg-green-100 text-green-800",
    MANUAL: "bg-purple-100 text-purple-800",
    RULE: "bg-orange-100 text-orange-800",
    CONTRACT: "bg-indigo-100 text-indigo-800",
    PACKAGE: "bg-pink-100 text-pink-800",
    CHANNEL: "bg-teal-100 text-teal-800",
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-gray-900">
              ₹{Number(item.unitPrice).toLocaleString("en-IN")}
            </span>
            <span className={clsx("rounded-full px-2 py-0.5 text-xs font-medium", sourceColors[item.source])}>
              {item.source}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-700">{item.reason}</p>
          <div className="mt-3 flex items-center gap-4 text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              <span>{format(new Date(item.changedAt), "MMM d, yyyy 'at' h:mm a")}</span>
            </div>
            <div className="flex items-center gap-1">
              <User className="h-4 w-4" />
              <span>{item.changedBy}</span>
            </div>
            <div className="text-xs text-gray-500">
              {item.productType}: {item.productId}
            </div>
          </div>
        </div>
        {item.effectiveTo === null && (
          <div className="ml-4 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
            Current
          </div>
        )}
      </div>
    </div>
  );
}
