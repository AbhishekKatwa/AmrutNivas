/**
 * Subscription page — the organization's current plan and subscription status.
 *
 * Shows the active subscription, plan details, billing period, trial status,
 * and actions to upgrade/downgrade/cancel. This is the primary billing screen
 * for organization owners.
 */

import { useEffect, useMemo, useState } from "react";
import { Calendar, CheckCircle2, AlertCircle, Crown } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { can } from "@/domain/identity/types";
import {
  getCurrentSubscription,
  listPlans,
  type SubscriptionWithPlan,
  type SubscriptionPlan,
} from "@/domain/billing/billing-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore } from "@/state/context-store";
import { format, isBefore, parseISO } from "date-fns";

export default function SubscriptionPage() {
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const organizationId = context.organizationId;

  const canView = can("billing.subscription.view", permissions);
  const canManage = can("billing.subscription.manage", permissions);

  const [subscription, setSubscription] = useState<SubscriptionWithPlan | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId || !canView) return;
    let ignore = false;
    setLoading(true);
    setError(null);

    Promise.all([
      getCurrentSubscription(organizationId),
      listPlans(),
    ])
      .then(([sub, planList]) => {
        if (ignore) return;
        setSubscription(sub);
        setPlans(planList);
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
    return <AccessDenied capability="view subscription" permission="billing.subscription.view" />;
  }

  if (loading) {
    return <LoadingBlock label="Loading subscription..." />;
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
          icon={<Crown className="h-12 w-12" />}
          title="No active subscription"
          description="Choose a plan to get started with AMRUT NIVAAS."
        />
        {plans.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Available Plans</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {plans.map((plan) => (
                <PlanCard key={plan.id} plan={plan} />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const { plan } = subscription;
  const isTrial = subscription.status === "TRIALING";
  const trialDaysLeft = useMemo(() => {
    if (!isTrial || !subscription.trialEnd) return 0;
    const end = parseISO(subscription.trialEnd);
    const now = new Date();
    if (isBefore(end, now)) return 0;
    const diff = end.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }, [isTrial, subscription.trialEnd]);

  return (
    <div className="space-y-6 p-6">
      {/* Current Plan Card */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">{plan.name}</h1>
              {isTrial && (
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                  Trial
                </span>
              )}
              {subscription.status === "ACTIVE" && (
                <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
                  Active
                </span>
              )}
              {subscription.status === "PAST_DUE" && (
                <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-800">
                  Past Due
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-gray-600">{plan.description}</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-gray-900">
              ₹{plan.basePrice}
              <span className="text-sm font-normal text-gray-600">
                /{plan.billingInterval.toLowerCase()}
              </span>
            </div>
          </div>
        </div>

        {isTrial && trialDaysLeft > 0 && (
          <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3">
            <div className="flex items-center gap-2 text-amber-800">
              <AlertCircle className="h-5 w-5" />
              <span className="text-sm font-medium">
                {trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""} left in trial
              </span>
            </div>
          </div>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Calendar className="h-4 w-4" />
              Billing Period
            </div>
            <div className="mt-1 font-medium text-gray-900">
              {format(parseISO(subscription.currentPeriodStart), "MMM d")} -{" "}
              {format(parseISO(subscription.currentPeriodEnd), "MMM d, yyyy")}
            </div>
          </div>

          {plan.maxProperties !== null && (
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-sm text-gray-600">Properties</div>
              <div className="mt-1 font-medium text-gray-900">
                Up to {plan.maxProperties}
              </div>
            </div>
          )}

          {plan.maxOutlets !== null && (
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-sm text-gray-600">Outlets</div>
              <div className="mt-1 font-medium text-gray-900">
                Up to {plan.maxOutlets}
              </div>
            </div>
          )}

          {plan.maxUsers !== null && (
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-sm text-gray-600">Users</div>
              <div className="mt-1 font-medium text-gray-900">
                Up to {plan.maxUsers}
              </div>
            </div>
          )}
        </div>

        {canManage && (
          <div className="mt-6 flex gap-3">
            <button className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
              Change Plan
            </button>
            <button className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel Subscription
            </button>
          </div>
        )}
      </div>

      {/* Plan Features */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Plan Features</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            "RESTAURANT_POS",
            "HOTEL_PMS",
            "INVENTORY",
            "PROCUREMENT",
            "CRM",
            "EVENTS",
            "HR",
            "COMMERCE",
            "ENTERPRISE",
            "API_ACCESS",
            "CUSTOM_BRANDING",
            "ADVANCED_REPORTING",
            "MULTI_PROPERTY",
            "PRIORITY_SUPPORT",
          ].map((feature) => (
            <div key={feature} className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <span className="text-sm text-gray-700">
                {feature.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase())}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PlanCard({ plan }: { plan: SubscriptionPlan }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
      <p className="mt-1 text-sm text-gray-600">{plan.description}</p>
      <div className="mt-4">
        <span className="text-3xl font-bold text-gray-900">₹{plan.basePrice}</span>
        <span className="text-sm text-gray-600">/{plan.billingInterval.toLowerCase()}</span>
      </div>
      <button className="mt-4 w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
        Choose Plan
      </button>
    </div>
  );
}
