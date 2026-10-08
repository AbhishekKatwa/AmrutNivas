/**
 * Usage page — organization's usage against plan limits.
 *
 * Shows current usage for each metric (properties, outlets, users, etc.)
 * compared to plan limits. Helps organizations understand their consumption
 * and when they might need to upgrade.
 */

import { useEffect, useState } from "react";
import { BarChart3, TrendingUp } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { can } from "@/domain/identity/types";
import {
  getCurrentSubscription,
  listUsageSnapshots,
  type SubscriptionWithPlan,
  type UsageSnapshot,
} from "@/domain/billing/billing-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore } from "@/state/context-store";

export default function UsagePage() {
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const organizationId = context.organizationId;

  const canView = can("billing.usage.view", permissions);

  const [subscription, setSubscription] = useState<SubscriptionWithPlan | null>(null);
  const [usage, setUsage] = useState<UsageSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId || !canView) return;
    let ignore = false;
    setLoading(true);
    setError(null);

    Promise.all([
      getCurrentSubscription(organizationId),
      listUsageSnapshots(organizationId),
    ])
      .then(([sub, usageData]) => {
        if (ignore) return;
        setSubscription(sub);
        setUsage(usageData);
      })
      .catch((err) => {
        if (ignore) return;
        setError(toPublicError(err).message);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [organizationId, canView]);

  if (!canView) {
    return <AccessDenied capability="view usage" permission="billing.usage.view" />;
  }

  if (loading) {
    return <LoadingBlock label="Loading usage..." />;
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          {error}
        </div>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<BarChart3 className="h-12 w-12" />}
          title="No active subscription"
          description="Usage tracking is available once you have an active subscription."
        />
      </div>
    );
  }

  const { plan } = subscription;

  // Get latest usage for each metric
  const latestUsage = new Map<string, UsageSnapshot>();
  for (const snapshot of usage) {
    const existing = latestUsage.get(snapshot.metric);
    if (!existing || snapshot.calculatedAt > existing.calculatedAt) {
      latestUsage.set(snapshot.metric, snapshot);
    }
  }

  const metrics = [
    { key: "PROPERTIES", label: "Properties", limit: plan.maxProperties, unit: "properties" },
    { key: "OUTLETS", label: "Outlets", limit: plan.maxOutlets, unit: "outlets" },
    { key: "USERS", label: "Users", limit: plan.maxUsers, unit: "users" },
  ];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Usage</h1>
        <p className="mt-1 text-sm text-gray-600">
          Your current usage against plan limits for {plan.name}.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {metrics.map(({ key, label, limit, unit }) => {
          const snapshot = latestUsage.get(key);
          const current = snapshot ? Number(snapshot.quantity) : 0;
          const percentage = limit ? Math.min((current / limit) * 100, 100) : 0;
          const isNearLimit = limit && percentage >= 80;
          const isAtLimit = limit && current >= limit;

          return (
            <div
              key={key}
              className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-medium text-gray-600">{label}</h3>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-gray-900">{current}</span>
                    {limit && (
                      <span className="text-sm text-gray-600">/ {limit} {unit}</span>
                    )}
                  </div>
                </div>
                <TrendingUp className="h-5 w-5 text-gray-400" />
              </div>

              {limit && (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span>{percentage.toFixed(0)}% used</span>
                    {isAtLimit && (
                      <span className="font-medium text-red-600">At limit</span>
                    )}
                    {isNearLimit && !isAtLimit && (
                      <span className="font-medium text-amber-600">Near limit</span>
                    )}
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isAtLimit
                          ? "bg-red-500"
                          : isNearLimit
                            ? "bg-amber-500"
                            : "bg-green-500"
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              )}

              {!limit && (
                <div className="mt-4 text-sm text-gray-600">Unlimited</div>
              )}
            </div>
          );
        })}
      </div>

      {usage.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <BarChart3 className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No usage data yet</h3>
          <p className="mt-2 text-sm text-gray-600">
            Usage metrics are calculated periodically. Check back soon.
          </p>
        </div>
      )}
    </div>
  );
}
