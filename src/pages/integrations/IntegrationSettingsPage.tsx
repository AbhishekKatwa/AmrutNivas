/**
 * Integration settings — manage external system connections.
 *
 * Shows integration categories (Payment, Messaging, Booking, etc.) with provider cards.
 * Each card displays provider info, connection status, last sync, and actions.
 * Supports connection flow: select → configure → test → connect.
 */

import { useEffect, useState } from "react";
import {
  Plug,
  CheckCircle,
  XCircle,
  AlertCircle,
  Pause,
  Play,
  Settings,
  ExternalLink,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { can } from "@/domain/identity/types";
import {
  listIntegrations,
  getAvailableProviders,
  connectIntegration,
  disconnectIntegration,
  pauseIntegration,
  testConnection,
  type Integration,
  type IntegrationCategory,
  type ProviderInfo,
} from "@/domain/integrations/integrations-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore } from "@/state/context-store";
import { format, parseISO } from "date-fns";
import clsx from "clsx";

const CATEGORY_LABELS: Record<IntegrationCategory, string> = {
  PAYMENT: "Payment",
  MESSAGING: "Messaging",
  BOOKING: "Booking Channels",
  FOOD_DELIVERY: "Food Delivery",
  ACCOUNTING: "Accounting",
  BANKING: "Banking",
  TAX: "Tax",
  EMAIL: "Email",
  SMS: "SMS",
  WHATSAPP: "WhatsApp",
  POS: "POS",
  KITCHEN: "Kitchen",
  HARDWARE: "Hardware",
  HR: "HR",
  IDENTITY: "Identity",
  ANALYTICS: "Analytics",
  OTHER: "Other",
};

const CATEGORY_ORDER: IntegrationCategory[] = [
  "PAYMENT",
  "MESSAGING",
  "BOOKING",
  "FOOD_DELIVERY",
  "ACCOUNTING",
  "EMAIL",
  "SMS",
  "WHATSAPP",
  "HR",
  "IDENTITY",
  "ANALYTICS",
  "OTHER",
];

export default function IntegrationSettingsPage() {
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const organizationId = context.organizationId;

  const canView = can("integrations.view", permissions);
  const canManage = can("integrations.manage", permissions);

  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<IntegrationCategory | "ALL">("ALL");
  const [testingId, setTestingId] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId || !canView) return;
    let ignore = false;
    setLoading(true);
    setError(null);

    Promise.all([
      listIntegrations({ organizationId }),
      Promise.resolve(getAvailableProviders()),
    ])
      .then(([ints, provs]) => {
        if (ignore) return;
        setIntegrations(ints);
        setProviders(provs);
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

  const handleTestConnection = async (integrationId: string) => {
    if (!organizationId) return;
    setTestingId(integrationId);
    try {
      const result = await testConnection(organizationId, integrationId);
      alert(result.success ? `✓ ${result.message}` : `✗ ${result.message}`);
    } catch (err) {
      alert(`Error: ${toPublicError(err).message}`);
    } finally {
      setTestingId(null);
    }
  };

  const handleConnect = async (integrationId: string) => {
    if (!organizationId) return;
    try {
      await connectIntegration(organizationId, integrationId);
      // Refresh integrations
      const ints = await listIntegrations({ organizationId });
      setIntegrations(ints);
    } catch (err) {
      alert(`Error: ${toPublicError(err).message}`);
    }
  };

  const handleDisconnect = async (integrationId: string) => {
    if (!organizationId) return;
    if (!confirm("Disconnect this integration?")) return;
    try {
      await disconnectIntegration(organizationId, integrationId);
      const ints = await listIntegrations({ organizationId });
      setIntegrations(ints);
    } catch (err) {
      alert(`Error: ${toPublicError(err).message}`);
    }
  };

  const handlePause = async (integrationId: string) => {
    if (!organizationId) return;
    try {
      await pauseIntegration(organizationId, integrationId);
      const ints = await listIntegrations({ organizationId });
      setIntegrations(ints);
    } catch (err) {
      alert(`Error: ${toPublicError(err).message}`);
    }
  };

  if (!canView) {
    return <AccessDenied capability="view integrations" permission="integrations.view" />;
  }

  const filteredProviders =
    selectedCategory === "ALL"
      ? providers
      : providers.filter((p) => p.category === selectedCategory);

  const groupedProviders = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    providers: filteredProviders.filter((p) => p.category === cat),
  })).filter((g) => g.providers.length > 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#17201B]">Integrations</h1>
        <p className="mt-1 text-sm text-[#66706A]">
          Connect external systems to extend AMRUT NIVAAS capabilities
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Category filter */}
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCategory("ALL")}
          className={clsx(
            "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            selectedCategory === "ALL"
              ? "bg-[#1B5E3B] text-white"
              : "bg-white text-[#66706A] hover:bg-[#F5F6F2]"
          )}
        >
          All
        </button>
        {CATEGORY_ORDER.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={clsx(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              selectedCategory === cat
                ? "bg-[#1B5E3B] text-white"
                : "bg-white text-[#66706A] hover:bg-[#F5F6F2]"
            )}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingBlock />
      ) : groupedProviders.length === 0 ? (
        <EmptyState
          icon={<Plug />}
          title="No integrations available"
          description="No providers are registered for the selected category."
        />
      ) : (
        <div className="space-y-8">
          {groupedProviders.map(({ category, label, providers: provs }) => (
            <div key={category}>
              <h2 className="mb-4 text-lg font-semibold text-[#17201B]">{label}</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {provs.map((provider) => {
                  const integration = integrations.find(
                    (i) => i.provider === provider.provider
                  );
                  return (
                    <ProviderCard
                      key={provider.provider}
                      provider={provider}
                      integration={integration}
                      canManage={canManage}
                      testing={testingId === integration?.id}
                      onTest={() => integration && handleTestConnection(integration.id)}
                      onConnect={() => integration && handleConnect(integration.id)}
                      onDisconnect={() => integration && handleDisconnect(integration.id)}
                      onPause={() => integration && handlePause(integration.id)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProviderCard({
  provider,
  integration,
  canManage,
  testing,
  onTest,
  onConnect,
  onDisconnect,
  onPause,
}: {
  provider: ProviderInfo;
  integration: Integration | undefined;
  canManage: boolean;
  testing: boolean;
  onTest: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onPause: () => void;
}) {
  const status = integration?.status ?? "DISCONNECTED";

  const statusConfig: {
    icon: typeof CheckCircle;
    color: string;
    bg: string;
    label: string;
  } = {
    CONNECTED: { icon: CheckCircle, color: "text-green-600", bg: "bg-green-50", label: "Connected" },
    DISCONNECTED: { icon: XCircle, color: "text-gray-400", bg: "bg-gray-50", label: "Not connected" },
    ERROR: { icon: AlertCircle, color: "text-red-600", bg: "bg-red-50", label: "Error" },
    PAUSED: { icon: Pause, color: "text-amber-600", bg: "bg-amber-50", label: "Paused" },
    PENDING_SETUP: { icon: AlertCircle, color: "text-amber-600", bg: "bg-amber-50", label: "Setup pending" },
  }[status];

  const StatusIcon = statusConfig.icon;

  return (
    <div className="rounded-xl border border-[#E3E7E3] bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex-1">
          <h3 className="font-semibold text-[#17201B]">{provider.name}</h3>
          <p className="mt-1 text-xs text-[#66706A]">{provider.description}</p>
        </div>
        <div className={clsx("rounded-full p-1.5", statusConfig.bg)}>
          <StatusIcon className={clsx("h-4 w-4", statusConfig.color)} />
        </div>
      </div>

      <div className="mb-4">
        <div className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", statusConfig.bg, statusConfig.color)}>
          <StatusIcon className="h-3 w-3" />
          {statusConfig.label}
        </div>
      </div>

      {integration && (
        <div className="mb-4 space-y-1 text-xs text-[#66706A]">
          {integration.lastSuccessAt && (
            <div>
              Last success: {format(parseISO(integration.lastSuccessAt), "dd MMM yyyy HH:mm")}
            </div>
          )}
          {integration.lastFailureAt && (
            <div className="text-red-600">
              Last failure: {format(parseISO(integration.lastFailureAt), "dd MMM yyyy HH:mm")}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!integration && canManage && (
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-[#1B5E3B] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#164A35]">
            <Plug className="h-3.5 w-3.5" />
            Connect
          </button>
        )}
        {integration && status === "CONNECTED" && (
          <>
            <button
              onClick={onTest}
              disabled={testing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E3E7E3] bg-white px-3 py-1.5 text-sm font-medium text-[#17201B] transition-colors hover:bg-[#F5F6F2] disabled:opacity-50"
            >
              {testing ? "Testing..." : "Test"}
            </button>
            <button
              onClick={onPause}
              disabled={!canManage}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E3E7E3] bg-white px-3 py-1.5 text-sm font-medium text-[#17201B] transition-colors hover:bg-[#F5F6F2] disabled:opacity-50"
            >
              <Pause className="h-3.5 w-3.5" />
              Pause
            </button>
            <button
              onClick={onDisconnect}
              disabled={!canManage}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" />
              Disconnect
            </button>
          </>
        )}
        {integration && (status === "DISCONNECTED" || status === "ERROR" || status === "PENDING_SETUP") && canManage && (
          <button
            onClick={onConnect}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1B5E3B] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#164A35]"
          >
            <Play className="h-3.5 w-3.5" />
            Connect
          </button>
        )}
        {integration && canManage && (
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-[#E3E7E3] bg-white px-3 py-1.5 text-sm font-medium text-[#17201B] transition-colors hover:bg-[#F5F6F2]">
            <Settings className="h-3.5 w-3.5" />
            Configure
          </button>
        )}
      </div>

      {provider.documentationUrl && (
        <a
          href={provider.documentationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-xs text-[#1B5E3B] hover:underline"
        >
          Documentation
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
