/**
 * Platform onboarding dashboard.
 *
 * Shows onboarding health across all organizations: activation metrics, stalled
 * organizations, time-to-activation, and customer success tasks. This is the
 * platform admin's view of how well new customers are progressing through setup.
 *
 * The dashboard is a read-only view — it reads from the organization's actual
 * state and computes onboarding health deterministically.
 */

import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import type {
  ActivationState,
  OnboardingHealth,
  OnboardingHealthSummary,
} from "@/domain/onboarding/types";

// Mock data for demonstration — in a real implementation, this would come from
// the platform service reading all organizations' onboarding state.
const MOCK_ORGANIZATIONS: OnboardingHealthSummary[] = [
  {
    organizationId: "org_1",
    organizationName: "Hotel ABC",
    signedUpAt: "2026-10-01T10:00:00Z",
    lastActivityAt: "2026-10-07T14:30:00Z",
    completionPercentage: 82,
    health: "HEALTHY",
    firstTransactionAt: "2026-10-05T09:15:00Z",
    activationState: "ACTIVATED",
  },
  {
    organizationId: "org_2",
    organizationName: "Restaurant XYZ",
    signedUpAt: "2026-10-03T08:00:00Z",
    lastActivityAt: "2026-10-04T16:45:00Z",
    completionPercentage: 22,
    health: "STALLED",
    firstTransactionAt: null,
    activationState: "NOT_ACTIVATED",
  },
  {
    organizationId: "org_3",
    organizationName: "Cafe DEF",
    signedUpAt: "2026-10-05T12:00:00Z",
    lastActivityAt: "2026-10-07T10:20:00Z",
    completionPercentage: 65,
    health: "PROGRESSING",
    firstTransactionAt: null,
    activationState: "ACTIVATING",
  },
  {
    organizationId: "org_4",
    organizationName: "Resort GHI",
    signedUpAt: "2026-09-15T09:00:00Z",
    lastActivityAt: null,
    completionPercentage: 0,
    health: "AT_RISK",
    firstTransactionAt: null,
    activationState: "NOT_ACTIVATED",
  },
  {
    organizationId: "org_5",
    organizationName: "Banquet JKL",
    signedUpAt: "2026-10-02T11:00:00Z",
    lastActivityAt: "2026-10-06T15:00:00Z",
    completionPercentage: 100,
    health: "ACTIVATED",
    firstTransactionAt: "2026-10-04T13:30:00Z",
    activationState: "ACTIVATED",
  },
];

export default function PlatformOnboardingPage() {
  const totalOrganizations = MOCK_ORGANIZATIONS.length;
  const activated = MOCK_ORGANIZATIONS.filter((o) => o.activationState === "ACTIVATED").length;
  const activating = MOCK_ORGANIZATIONS.filter((o) => o.activationState === "ACTIVATING").length;
  const notActivated = MOCK_ORGANIZATIONS.filter((o) => o.activationState === "NOT_ACTIVATED").length;
  const stalled = MOCK_ORGANIZATIONS.filter((o) => o.health === "STALLED").length;
  const atRisk = MOCK_ORGANIZATIONS.filter((o) => o.health === "AT_RISK").length;

  const activationRate = totalOrganizations > 0 ? (activated / totalOrganizations) * 100 : 0;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Onboarding Dashboard</h1>
        <p className="mt-1 text-sm text-muted">
          Monitor organization onboarding health and activation metrics
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Total Organizations
            </p>
            <p className="text-3xl font-semibold text-ink">{totalOrganizations}</p>
          </div>
        </Card>

        <Card>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Activation Rate
            </p>
            <p className="text-3xl font-semibold text-ink">{activationRate.toFixed(0)}%</p>
            <p className="text-xs text-muted">
              {activated} of {totalOrganizations} activated
            </p>
          </div>
        </Card>

        <Card>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Stalled
            </p>
            <p className="text-3xl font-semibold text-warning">{stalled}</p>
            <p className="text-xs text-muted">No activity for 7+ days</p>
          </div>
        </Card>

        <Card>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              At Risk
            </p>
            <p className="text-3xl font-semibold text-danger">{atRisk}</p>
            <p className="text-xs text-muted">Signed up but never started</p>
          </div>
        </Card>
      </div>

      <Card title="Activation State Breakdown">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2 rounded-lg border border-success-200 bg-success-50 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-success-900">Activated</p>
              <Badge tone="success">LIVE</Badge>
            </div>
            <p className="text-2xl font-semibold text-success-700">{activated}</p>
            <p className="text-xs text-success-600">
              {totalOrganizations > 0 ? ((activated / totalOrganizations) * 100).toFixed(0) : 0}%
            </p>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-brand-200 bg-brand-50 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-brand-900">Activating</p>
              <Badge tone="brand">IN PROGRESS</Badge>
            </div>
            <p className="text-2xl font-semibold text-brand-700">{activating}</p>
            <p className="text-xs text-brand-600">
              {totalOrganizations > 0 ? ((activating / totalOrganizations) * 100).toFixed(0) : 0}%
            </p>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-ink">Not Activated</p>
              <Badge tone="neutral">PENDING</Badge>
            </div>
            <p className="text-2xl font-semibold text-ink">{notActivated}</p>
            <p className="text-xs text-muted">
              {totalOrganizations > 0 ? ((notActivated / totalOrganizations) * 100).toFixed(0) : 0}%
            </p>
          </div>
        </div>
      </Card>

      <Card title="Organizations">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted">
                <th className="pb-2 pr-4">Organization</th>
                <th className="pb-2 pr-4">Signed Up</th>
                <th className="pb-2 pr-4">Last Activity</th>
                <th className="pb-2 pr-4">Progress</th>
                <th className="pb-2 pr-4">First Transaction</th>
                <th className="pb-2 pr-4">Health</th>
                <th className="pb-2">Activation</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_ORGANIZATIONS.map((org) => (
                <tr key={org.organizationId} className="border-b border-border last:border-0">
                  <td className="py-3 pr-4 font-medium text-ink">{org.organizationName}</td>
                  <td className="py-3 pr-4 text-muted">
                    {formatDate(org.signedUpAt)}
                  </td>
                  <td className="py-3 pr-4 text-muted">
                    {org.lastActivityAt ? formatDate(org.lastActivityAt) : "—"}
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-20 overflow-hidden rounded-full bg-border">
                        <div
                          className="h-full bg-brand-600"
                          style={{ width: `${org.completionPercentage}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted">{org.completionPercentage}%</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-muted">
                    {org.firstTransactionAt ? formatDate(org.firstTransactionAt) : "—"}
                  </td>
                  <td className="py-3 pr-4">
                    <HealthBadge health={org.health} />
                  </td>
                  <td className="py-3">
                    <ActivationBadge state={org.activationState} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Customer Success Tasks">
        <div className="flex flex-col gap-3">
          {MOCK_ORGANIZATIONS.filter((o) => o.health === "STALLED" || o.health === "AT_RISK").map(
            (org) => (
              <div
                key={org.organizationId}
                className="flex items-start justify-between rounded-lg border border-warning-200 bg-warning-50 p-4"
              >
                <div>
                  <p className="font-medium text-ink">{org.organizationName}</p>
                  <p className="mt-1 text-sm text-muted">
                    {org.health === "STALLED"
                      ? `No activity for ${daysSince(org.lastActivityAt)} days`
                      : "Signed up but never started onboarding"}
                  </p>
                </div>
                <button className="rounded-lg border border-warning-300 bg-white px-3 py-1.5 text-xs font-medium text-warning-700 hover:bg-warning-50">
                  Create Task
                </button>
              </div>
            )
          )}

          {MOCK_ORGANIZATIONS.filter((o) => o.health === "STALLED" || o.health === "AT_RISK")
            .length === 0 && (
            <div className="rounded-lg border border-success-200 bg-success-50 p-4 text-sm text-success-700">
              No organizations need attention right now.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function HealthBadge({ health }: { health: OnboardingHealth }) {
  const tone =
    health === "ACTIVATED"
      ? "success"
      : health === "HEALTHY"
        ? "success"
        : health === "PROGRESSING"
          ? "brand"
          : health === "STALLED"
            ? "warning"
            : "danger";

  return <Badge tone={tone}>{health}</Badge>;
}

function ActivationBadge({ state }: { state: ActivationState }) {
  const tone =
    state === "ACTIVATED" ? "success" : state === "ACTIVATING" ? "brand" : "neutral";

  return <Badge tone={tone}>{state}</Badge>;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function daysSince(iso: string | null): number {
  if (!iso) return 0;
  const date = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}
