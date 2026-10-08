/**
 * Events Overview — high-level event intelligence for the organization.
 *
 * Reads events, leads, venues and quotations to surface headline counts and
 * pipeline value. This screen answers "how is the events business doing?" at
 * a glance.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  CircleSlash,
  ClipboardList,
  DollarSign,
  LogIn,
  MapPin,
  FileText,
  Users,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { can, type ActiveContext } from "@/domain/identity/types";
import {
  listEvents,
  listEventLeads,
  listEventVenues,
} from "@/domain/events/event-service";
import type { EventScope } from "@/domain/events/types";
import { EVENT_PIPELINE_PROBABILITY } from "@/domain/events/types";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

export type EventsOverviewView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_organization"
  | "scoped";

export function pageStatusFor(status: ContextStatus, context: ActiveContext): EventsOverviewView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null && context.propertyId !== null
      ? "scoped"
      : "no_organization";
  }
  return "bootstrapping";
}

type Counts = {
  totalEvents: number;
  upcomingEvents: number;
  openLeads: number;
  availableVenues: number;
  pendingQuotations: number;
  pipelineValue: number;
};

const NO_BACKEND_COPY = "This build has no backend configured, so it cannot read events data.";

export default function EventsOverviewPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const storeError = useContextStore((s) => s.error);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const scope = useMemo<EventScope | null>(
    () =>
      context.organizationId !== null && context.propertyId !== null
        ? { organizationId: context.organizationId, propertyId: context.propertyId }
        : null,
    [context.organizationId, context.propertyId],
  );

  const canView = can("events.view", permissions);

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

    const today = new Date().toISOString().split("T")[0];

    Promise.all([
      listEvents(scope).catch(() => []),
      listEventLeads(scope).catch(() => []),
      listEventVenues(scope).catch(() => []),
    ])
      .then(([events, leads, venues]) => {
        if (ignore) return;

        const upcomingEvents = events.filter(
          (e) => e.eventDate >= today && !["COMPLETED", "CLOSED", "CANCELLED", "LOST"].includes(e.status),
        ).length;

        const openLeads = leads.filter((l) =>
          ["NEW", "CONTACTED", "FOLLOW_UP", "QUOTED", "NEGOTIATION"].includes(l.status),
        ).length;

        const availableVenues = venues.filter((v) => v.status === "AVAILABLE").length;

        // Pipeline value: sum of expected budget * probability for open leads
        const pipelineValue = leads.reduce((sum, lead) => {
          if (["CONVERTED", "LOST", "CANCELLED"].includes(lead.status)) return sum;
          const probability = EVENT_PIPELINE_PROBABILITY[lead.status] ?? 10;
          return sum + (lead.budget ?? 0) * (probability / 100);
        }, 0);

        // Pending quotations: count from events (would need separate query for quotations)
        const pendingQuotations = events.filter((e) =>
          ["ENQUIRY", "FOLLOW_UP", "QUOTED", "NEGOTIATION"].includes(e.status),
        ).length;

        setCounts({
          totalEvents: events.length,
          upcomingEvents,
          openLeads,
          availableVenues,
          pendingQuotations,
          pipelineValue,
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
          <Calendar className="size-5 shrink-0 text-brand-600" aria-hidden />
          Events & Banquet
        </h2>
        <p className="mt-1 text-sm text-muted">
          Complete event lifecycle management: leads, venues, quotations, bookings, planning and
          billing. One workspace for every event from enquiry to settlement.
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
          title="Sign in to view events"
          description="There is no active session for this build to read a tenant from."
        />
      )}

      {view === "no_organization" && (
        <EmptyState
          icon={<Users aria-hidden />}
          title="Choose an organization and property first"
          description="Events belong to a property. Pick one and this screen will show its events."
        />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied capability="view events" permission="events.view" />
      )}

      {view === "scoped" && scope !== null && canView && (
        <>
          {error !== null && (
            <p role="alert" className="rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}

          {counts === null ? (
            <LoadingBlock label="Reading events data…" />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <KpiCard
                icon={<Calendar className="size-4" aria-hidden />}
                label="Total events"
                value={counts.totalEvents}
                href="/events/list"
              />
              <KpiCard
                icon={<Calendar className="size-4" aria-hidden />}
                label="Upcoming"
                value={counts.upcomingEvents}
                href="/events/list"
              />
              <KpiCard
                icon={<ClipboardList className="size-4" aria-hidden />}
                label="Open leads"
                value={counts.openLeads}
                href="/events/leads"
              />
              <KpiCard
                icon={<MapPin className="size-4" aria-hidden />}
                label="Venues"
                value={counts.availableVenues}
                href="/events/venues"
              />
              <KpiCard
                icon={<FileText className="size-4" aria-hidden />}
                label="In pipeline"
                value={counts.pendingQuotations}
                href="/events/list"
              />
              <KpiCard
                icon={<DollarSign className="size-4" aria-hidden />}
                label="Pipeline value"
                value={counts.pipelineValue}
                href="/events/leads"
                isCurrency
              />
            </div>
          )}

          <Card
            title="Events modules"
            description="Manage the full event lifecycle from enquiry to settlement."
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ModuleRow
                icon={<ClipboardList className="size-4 text-brand-600" aria-hidden />}
                title="Leads & Enquiries"
                description="Capture enquiries, track follow-ups and convert to bookings."
                href="/events/leads"
              />
              <ModuleRow
                icon={<Calendar className="size-4 text-brand-600" aria-hidden />}
                title="Events"
                description="All confirmed and upcoming events with full details."
                href="/events/list"
              />
              <ModuleRow
                icon={<MapPin className="size-4 text-brand-600" aria-hidden />}
                title="Venues"
                description="Bookable spaces with capacity, availability and conflict detection."
                href="/events/venues"
              />
              <ModuleRow
                icon={<FileText className="size-4 text-brand-600" aria-hidden />}
                title="Quotations"
                description="Versioned pricing proposals with line items, managed from each event."
                href="/events/list"
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
  isCurrency,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  href: string;
  isCurrency?: boolean;
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
      <span className="text-2xl font-semibold tabular-nums text-ink">
        {isCurrency ? `₹${value.toLocaleString("en-IN")}` : value}
      </span>
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
