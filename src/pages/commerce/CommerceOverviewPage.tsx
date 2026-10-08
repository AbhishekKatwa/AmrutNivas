/**
 * Commerce Overview — digital channel performance for the organization.
 *
 * Reads commerce channels, QR codes, table requests and commerce settings to
 * surface headline counts. This screen answers "how is digital commerce doing?"
 * at a glance.
 */

import { useEffect, useMemo, useState } from "react";
import {
  CircleSlash,
  LogIn,
  QrCode,
  ShoppingBag,
  Store,
  Bell,
  Settings,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { can, type ActiveContext } from "@/domain/identity/types";
import {
  listCommerceChannels,
  listQRCodes,
  listTableRequests,
  type CommerceScope,
} from "@/domain/commerce/commerce-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

export type CommerceOverviewView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_organization"
  | "scoped";

export function pageStatusFor(status: ContextStatus, context: ActiveContext): CommerceOverviewView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null ? "scoped" : "no_organization";
  }
  return "bootstrapping";
}

type Counts = {
  activeChannels: number;
  activeQRCodes: number;
  openTableRequests: number;
};

const NO_BACKEND_COPY = "This build has no backend configured, so it cannot read commerce data.";

export default function CommerceOverviewPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const storeError = useContextStore((s) => s.error);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const scope = useMemo<CommerceScope | null>(
    () => (context.organizationId !== null ? { organizationId: context.organizationId } : null),
    [context.organizationId],
  );

  const canView = can("commerce.view", permissions);

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
      listCommerceChannels(scope).catch(() => []),
      listQRCodes(scope).catch(() => []),
      listTableRequests(scope).catch(() => []),
    ])
      .then(([channels, qrCodes, tableRequests]) => {
        if (ignore) return;
        setCounts({
          activeChannels: channels.filter((c) => c.status === "ACTIVE").length,
          activeQRCodes: qrCodes.filter((q) => q.status === "ACTIVE").length,
          openTableRequests: tableRequests.filter((t) => t.status === "OPEN" || t.status === "ACKNOWLEDGED").length,
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
          <ShoppingBag className="size-5 shrink-0 text-brand-600" aria-hidden />
          Commerce
        </h2>
        <p className="mt-1 text-sm text-muted">
          Digital commerce layer for QR ordering, online ordering, direct booking and public menus.
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
          title="Sign in to view Commerce"
          description="There is no active session for this build to read a tenant from."
        />
      )}

      {view === "no_organization" && (
        <EmptyState
          icon={<Store aria-hidden />}
          title="Choose an organization first"
          description="Commerce data belongs to an organization. Pick one and this screen will show its digital channels."
        />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied capability="view commerce" permission="commerce.view" />
      )}

      {view === "scoped" && scope !== null && canView && (
        <>
          {error !== null && (
            <p role="alert" className="rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}

          {counts === null ? (
            <LoadingBlock label="Reading commerce data…" />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3">
              <KpiCard
                icon={<Store className="size-4" aria-hidden />}
                label="Active channels"
                value={counts.activeChannels}
                href="/commerce/channels"
              />
              <KpiCard
                icon={<QrCode className="size-4" aria-hidden />}
                label="Active QR codes"
                value={counts.activeQRCodes}
                href="/commerce/qr-codes"
              />
              <KpiCard
                icon={<Bell className="size-4" aria-hidden />}
                label="Open table requests"
                value={counts.openTableRequests}
                href="/commerce/table-requests"
              />
            </div>
          )}

          <section className="grid gap-4 sm:grid-cols-2">
            <QuickActionCard
              icon={<QrCode className="size-5" aria-hidden />}
              title="QR Codes"
              description="Generate and manage QR codes for menus, tables and properties."
              href="/commerce/qr-codes"
            />
            <QuickActionCard
              icon={<Settings className="size-5" aria-hidden />}
              title="Commerce Settings"
              description="Configure feature flags for QR ordering, online ordering, direct booking."
              href="/commerce/settings"
            />
          </section>
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
      className="group rounded-xl border border-border bg-surface p-4 transition hover:border-brand-300 hover:shadow-sm"
    >
      <div className="flex items-center gap-2 text-muted">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-ink">{value}</div>
    </a>
  );
}

function QuickActionCard({
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
      className="group rounded-xl border border-border bg-surface p-5 transition hover:border-brand-300 hover:shadow-sm"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-brand-50 p-2 text-brand-600">{icon}</div>
        <div className="flex-1">
          <h3 className="font-semibold text-ink">{title}</h3>
          <p className="mt-1 text-sm text-muted">{description}</p>
        </div>
      </div>
    </a>
  );
}
