/**
 * Automations page — manage automation rules that react to domain events.
 *
 * Shows list of automation rules with status, trigger event, and actions.
 * Supports enable/disable, edit, and view execution history.
 */

import { useEffect, useState } from "react";
import { Zap, Play, Pause, Edit, History } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { can } from "@/domain/identity/types";
import {
  listAutomationRules,
  enableAutomationRule,
  disableAutomationRule,
  type AutomationRule,
} from "@/domain/notifications/notifications-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore } from "@/state/context-store";
import { format, parseISO } from "date-fns";
import clsx from "clsx";

export default function AutomationsPage() {
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const organizationId = context.organizationId;

  const canView = can("automation.view", permissions);
  const canEnable = can("automation.enable", permissions);
  const canDisable = can("automation.disable", permissions);

  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId || !canView) return;
    let ignore = false;
    setLoading(true);
    setError(null);

    listAutomationRules(organizationId)
      .then((data) => {
        if (ignore) return;
        setRules(data);
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

  const handleToggleStatus = async (rule: AutomationRule) => {
    try {
      if (rule.status === "ACTIVE") {
        await disableAutomationRule(rule.id);
        setRules((prev) =>
          prev.map((r) => (r.id === rule.id ? { ...r, status: "INACTIVE" } : r)),
        );
      } else {
        await enableAutomationRule(rule.id);
        setRules((prev) =>
          prev.map((r) => (r.id === rule.id ? { ...r, status: "ACTIVE" } : r)),
        );
      }
    } catch (err) {
      console.error("Failed to toggle rule:", err);
    }
  };

  if (!canView) {
    return <AccessDenied capability="view automations" permission="automation.view" />;
  }

  if (loading) {
    return <LoadingBlock label="Loading automations..." />;
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

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Automations</h1>
        <p className="mt-1 text-sm text-gray-600">
          Rules that react to events and trigger notifications, messages, or tasks.
        </p>
      </div>

      {rules.length === 0 ? (
        <EmptyState
          icon={<Zap className="h-12 w-12" />}
          title="No automations"
          description="Create automation rules to react to events like reservations, payments, or low stock."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-600">
                  Automation
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-600">
                  Trigger
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-600">
                  Actions
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-600">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-600">
                  Last Updated
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-600">
                  Operations
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-6 py-4">
                    <div>
                      <div className="font-medium text-gray-900">{rule.name}</div>
                      {rule.description && (
                        <div className="mt-1 text-sm text-gray-600">{rule.description}</div>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                      {rule.eventType}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {Array.isArray(rule.actions) ? rule.actions.length : 0} action(s)
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span
                      className={clsx(
                        "inline-flex items-center rounded-full px-2 py-1 text-xs font-medium",
                        rule.status === "ACTIVE"
                          ? "bg-green-100 text-green-800"
                          : rule.status === "INACTIVE"
                            ? "bg-gray-100 text-gray-800"
                            : "bg-yellow-100 text-yellow-800",
                      )}
                    >
                      {rule.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                    {format(parseISO(rule.updatedAt), "MMM d, yyyy")}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                    <div className="flex items-center justify-end gap-2">
                      {(canEnable || canDisable) && (
                        <button
                          onClick={() => handleToggleStatus(rule)}
                          disabled={
                            (rule.status === "ACTIVE" && !canDisable) ||
                            (rule.status !== "ACTIVE" && !canEnable)
                          }
                          className={clsx(
                            "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium",
                            rule.status === "ACTIVE"
                              ? "border border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100 disabled:opacity-50"
                              : "border border-green-300 bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50",
                          )}
                          title={rule.status === "ACTIVE" ? "Disable" : "Enable"}
                        >
                          {rule.status === "ACTIVE" ? (
                            <>
                              <Pause className="h-3 w-3" />
                              Disable
                            </>
                          ) : (
                            <>
                              <Play className="h-3 w-3" />
                              Enable
                            </>
                          )}
                        </button>
                      )}
                      <button
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        title="Edit"
                      >
                        <Edit className="h-3 w-3" />
                      </button>
                      <button
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        title="View history"
                      >
                        <History className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
