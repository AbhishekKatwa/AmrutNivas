import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Clock,
  Save,
  Settings,
  Shield,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import type { EntityId } from "@/domain/identity/types";
import { can, type ActiveContext } from "@/domain/identity/types";
import type { MarketingConsent } from "@/domain/marketing/types";
import {
  getFrequencyPolicy,
  updateFrequencyPolicy,
  listConsents,
} from "@/domain/marketing/marketing-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

type View = "bootstrapping" | "unconfigured" | "unauthenticated" | "no_organization" | "scoped";

function pageStatusFor(status: ContextStatus, context: ActiveContext): View {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") return context.organizationId !== null ? "scoped" : "no_organization";
  return "bootstrapping";
}

function consentTone(s: string): "success" | "danger" | "neutral" {
  switch (s) {
    case "OPTED_IN": return "success";
    case "OPTED_OUT": return "danger";
    default: return "neutral";
  }
}

export default function MarketingSettingsPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const orgId = context.organizationId as EntityId | null;

  const canView = can("marketing.settings.manage", permissions) || can("marketing.consent.view", permissions);
  const canEdit = can("marketing.settings.manage", permissions) || can("marketing.consent.edit", permissions);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [consents, setConsents] = useState<MarketingConsent[]>([]);

  const [maxMessages, setMaxMessages] = useState(3);
  const [windowDays, setWindowDays] = useState(7);
  const [quietStart, setQuietStart] = useState("22:00");
  const [quietEnd, setQuietEnd] = useState("08:00");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || !orgId || !canView) return;
    setLoading(true);
    setError(null);
    try {
      const p = getFrequencyPolicy(orgId);
      if (p) {
        setMaxMessages(p.maxMessagesPerPeriod);
        setWindowDays(p.periodDays);
        setQuietStart(p.quietHourStart ?? "22:00");
        setQuietEnd(p.quietHourEnd ?? "08:00");
      }
      setConsents([...listConsents(orgId).slice(0, 20)]);
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setLoading(false);
    }
  }, [view, orgId, canView]);

  const handleSave = () => {
    if (!orgId || !canEdit) return;
    try {
      updateFrequencyPolicy(orgId, {
        maxMessagesPerPeriod: maxMessages,
        periodDays: windowDays,
        quietHourStart: quietStart,
        quietHourEnd: quietEnd,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(toPublicError(err).message);
    }
  };

  if (view === "bootstrapping" || loading) {
    return <LoadingBlock label="Loading marketing settings…" />;
  }

  if (!canView) {
    return (
      <EmptyState
        icon={<Settings />}
        title="Marketing Settings"
        description="You don't have permission to view marketing settings."
      />
    );
  }

  if (error) {
    return <EmptyState icon={<AlertTriangle />} title="Error" description={error} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#17201B]">Marketing Settings</h1>
        <p className="text-sm text-[#66706A] mt-1">
          Frequency controls, quiet hours, and consent management
        </p>
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-indigo-50">
            <Clock className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#17201B]">Frequency Control</h3>
            <p className="text-xs text-[#66706A]">Limit how often customers receive marketing messages</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#66706A] mb-1">
              Max messages per window
            </label>
            <input
              type="number"
              min={1}
              max={20}
              value={maxMessages}
              onChange={(e) => setMaxMessages(Number(e.target.value))}
              disabled={!canEdit}
              className="w-full px-3 py-2 text-sm border border-[#E3E7E3] rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:bg-[#F7F8F5]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#66706A] mb-1">
              Window (days)
            </label>
            <input
              type="number"
              min={1}
              max={30}
              value={windowDays}
              onChange={(e) => setWindowDays(Number(e.target.value))}
              disabled={!canEdit}
              className="w-full px-3 py-2 text-sm border border-[#E3E7E3] rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:bg-[#F7F8F5]"
            />
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-amber-50">
            <Bell className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#17201B]">Quiet Hours</h3>
            <p className="text-xs text-[#66706A]">No marketing messages during these hours</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#66706A] mb-1">
              Start time
            </label>
            <input
              type="time"
              value={quietStart}
              onChange={(e) => setQuietStart(e.target.value)}
              disabled={!canEdit}
              className="w-full px-3 py-2 text-sm border border-[#E3E7E3] rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:bg-[#F7F8F5]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#66706A] mb-1">
              End time
            </label>
            <input
              type="time"
              value={quietEnd}
              onChange={(e) => setQuietEnd(e.target.value)}
              disabled={!canEdit}
              className="w-full px-3 py-2 text-sm border border-[#E3E7E3] rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:bg-[#F7F8F5]"
            />
          </div>
        </div>
      </Card>

      {canEdit && (
        <div className="flex items-center gap-3">
          <Button variant="primary" size="sm" onClick={handleSave}>
            <Save className="w-4 h-4 mr-1" /> Save Settings
          </Button>
          {saved && <span className="text-sm text-green-600">Settings saved.</span>}
        </div>
      )}

      <Card className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-green-50">
            <Shield className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#17201B]">Customer Consent</h3>
            <p className="text-xs text-[#66706A]">Marketing consent status by customer and channel</p>
          </div>
        </div>
        {consents.length === 0 ? (
          <p className="text-sm text-[#66706A]">No consent records found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E3E7E3]">
                  <th className="text-left py-2 px-3 text-xs font-medium text-[#66706A]">Customer</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-[#66706A]">Channel</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-[#66706A]">Status</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-[#66706A]">Updated</th>
                </tr>
              </thead>
              <tbody>
                {consents.map((c) => (
                  <tr key={`${c.customerId}-${c.consentKey}`} className="border-b border-[#E3E7E3] last:border-0">
                    <td className="py-2 px-3 text-[#17201B] truncate max-w-[150px]">{c.customerId}</td>
                    <td className="py-2 px-3 text-[#66706A]">{c.consentKey.replace(/_/g, " ")}</td>
                    <td className="py-2 px-3">
                      <Badge tone={consentTone(c.status)}>{c.status.replace(/_/g, " ")}</Badge>
                    </td>
                    <td className="py-2 px-3 text-[#66706A]">
                      {new Date(c.updatedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
