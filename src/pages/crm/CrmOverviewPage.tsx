/**
 * CRM Overview — high-level customer intelligence for the organization.
 *
 * Reads guests (customers), feedback, complaints, loyalty accounts and corporate
 * accounts to surface headline counts. No financial metrics — those belong to
 * Finance. This screen answers "how is the customer base doing?" at a glance.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CircleSlash,
  Heart,
  LogIn,
  MessageSquare,
  Star,
  Users,
  AlertTriangle,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { can, type ActiveContext } from "@/domain/identity/types";
import { listGuests } from "@/domain/hotel/guest-service";
import {
  listCustomerFeedback,
  listComplaints,
  listLoyaltyPrograms,
  listCorporateAccounts,
  type CrmScope,
} from "@/domain/crm/crm-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

export type CrmOverviewView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_organization"
  | "scoped";

export function pageStatusFor(status: ContextStatus, context: ActiveContext): CrmOverviewView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null ? "scoped" : "no_organization";
  }
  return "bootstrapping";
}

type Counts = {
  totalCustomers: number;
  activeFeedback: number;
  openComplaints: number;
  loyaltyPrograms: number;
  corporateAccounts: number;
};

const NO_BACKEND_COPY = "This build has no backend configured, so it cannot read CRM data.";

export default function CrmOverviewPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const storeError = useContextStore((s) => s.error);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const scope = useMemo<CrmScope | null>(
    () => (context.organizationId !== null ? { organizationId: context.organizationId } : null),
    [context.organizationId],
  );

  const canView = can("crm.view", permissions);

  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || scope === null || !canView) return;
    let ignore = false;
    setCounts(null);
    setError(null);

    Promise.all([
      listGuests(scope).catch(() => []),
      listCustomerFeedback(scope).catch(() => []),
      listComplaints(scope).catch(() => []),
      listLoyaltyPrograms(scope).catch(() => []),
      listCorporateAccounts(scope).catch(() => []),
    ])
      .then(([guests, feedback, complaints, programs, corporates]) => {
        if (ignore) return;
        setCounts({
          totalCustomers: guests.length,
          activeFeedback: feedback.filter((f) => f.status === "OPEN" || f.status === "IN_REVIEW").length,
          openComplaints: complaints.filter((c) => c.status !== "CLOSED" && c.status !== "RESOLVED").length,
          loyaltyPrograms: programs.length,
          corporateAccounts: corporates.length,
        });
      })
      .catch((err) => {
        if (!ignore) setError(toPublicError(err).message);
      });

    return () => {
      ignore = true;
    };
  }, [view, scope, canView]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          <Users className="size-5 shrink-0 text-brand-600" aria-hidden />
          CRM
        </h2>
        <p className="mt-1 text-sm text-muted">
          Customer intelligence for the organization. One identity per guest, enriched with
          preferences, tags, feedback, complaints and loyalty.
        </p>
      </header>

      {view === "bootstrapping" && <LoadingBlock label="Loading your workspace…" />}

      {view === "unconfigured" && (
        <EmptyState
          icon={<CircleSlash aria-hidden />}
          title="Backend not configured"
          description={storeError ?? NO_BACKEND_COPY}
        />
      )}

      {view === "unauthenticated" && (
        <EmptyState
          icon={<LogIn aria-hidden />}
          title="Sign in to view CRM"
          description="There is no active session for this build to read a tenant from."
        />
      )}

      {view === "no_organization" && (
        <EmptyState
          icon={<Users aria-hidden />}
          title="Choose an organization first"
          description="CRM data belongs to an organization. Pick one and this screen will show its customers."
        />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied capability="view CRM" permission="crm.view" />
      )}

      {view === "scoped" && scope !== null && canView && (
        <>
          {error !== null && (
            <p role="alert" className="rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}

          {counts === null ? (
            <LoadingBlock label="Reading CRM data…" />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <KpiCard
                icon={<Users className="size-4" aria-hidden />}
                label="Customers"
                value={counts.totalCustomers}
                href="/crm/customers"
              />
              <KpiCard
                icon={<MessageSquare className="size-4" aria-hidden />}
                label="Active feedback"
                value={counts.activeFeedback}
                href="/crm/feedback"
              />
              <KpiCard
                icon={<AlertTriangle className="size-4" aria-hidden />}
                label="Open complaints"
                value={counts.openComplaints}
                href="/crm/complaints"
              />
              <KpiCard
                icon={<Star className="size-4" aria-hidden />}
                label="Loyalty programs"
                value={counts.loyaltyPrograms}
                href="/crm/loyalty"
              />
              <KpiCard
                icon={<Building2 className="size-4" aria-hidden />}
                label="Corporate accounts"
                value={counts.corporateAccounts}
                href="/crm/corporate"
              />
            </div>
          )}

          <Card
            title="CRM modules"
            description="Each module reads the canonical guest identity. No competing customer tables."
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ModuleRow
                icon={<Users className="size-4 text-brand-600" aria-hidden />}
                title="Customers"
                description="Guest directory with CRM fields, tags, notes and preferences."
                href="/crm/customers"
              />
              <ModuleRow
                icon={<MessageSquare className="size-4 text-brand-600" aria-hidden />}
                title="Feedback"
                description="Ratings and comments from guests, tracked to resolution."
                href="/crm/feedback"
              />
              <ModuleRow
                icon={<AlertTriangle className="size-4 text-brand-600" aria-hidden />}
                title="Complaints"
                description="Tracked issues with priority, assignment and resolution workflow."
                href="/crm/complaints"
              />
              <ModuleRow
                icon={<Star className="size-4 text-brand-600" aria-hidden />}
                title="Loyalty"
                description="Programs, tiers, accounts and an append-only points ledger."
                href="/crm/loyalty"
              />
              <ModuleRow
                icon={<Building2 className="size-4 text-brand-600" aria-hidden />}
                title="Corporate accounts"
                description="Company entities linked to guest records for billing and rates."
                href="/crm/corporate"
              />
              <ModuleRow
                icon={<Heart className="size-4 text-brand-600" aria-hidden />}
                title="Customer profiles"
                description="360° view: stays, feedback, complaints, loyalty, tags and notes."
                href="/crm/customers"
              />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  href: string;
}) {
  return (
    <a
      href={href}
      className="group flex flex-col gap-2 rounded-lg border border-line bg-surface p-4 shadow-soft transition-colors hover:border-brand-200 hover:bg-brand-50/30"
    >
      <div className="flex items-center gap-2 text-muted">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <span className="text-2xl font-semibold tabular-nums text-ink">{value}</span>
    </a>
  );
}

function ModuleRow({
  icon,
  title,
  description,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="flex items-start gap-3 rounded-lg border border-line p-3 transition-colors hover:border-brand-200 hover:bg-brand-50/20"
    >
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-xs text-muted">{description}</p>
      </div>
    </a>
  );
}
