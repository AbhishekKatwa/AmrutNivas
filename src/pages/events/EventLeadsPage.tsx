/**
 * Event Leads — enquiry capture and follow-up tracking.
 *
 * Lists all event leads with filters for status, event type and source.
 * Supports creating new leads and converting qualified leads to events.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CircleSlash,
  ClipboardList,
  LogIn,
  Plus,
  ArrowRightCircle,
} from "lucide-react";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { LoadingBlock } from "@/components/ui/Spinner";
import { SelectInput } from "@/components/ui/SelectInput";
import { TextInput } from "@/components/ui/TextInput";
import { Textarea } from "@/components/ui/Textarea";
import { can, type ActiveContext } from "@/domain/identity/types";
import {
  listEventLeads,
  createEventLead,
  convertLeadToEvent,
} from "@/domain/events/event-service";
import type {
  EventScope,
  EventLead,
  EventLeadStatus,
  EventType,
  EventSource,
} from "@/domain/events/types";
import {
  EVENT_LEAD_STATUSES,
  EVENT_TYPES,
  EVENT_SOURCES,
} from "@/domain/events/types";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

export type EventLeadsView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_organization"
  | "scoped";

export function pageStatusFor(status: ContextStatus, context: ActiveContext): EventLeadsView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null && context.propertyId !== null
      ? "scoped"
      : "no_organization";
  }
  return "bootstrapping";
}

const NO_BACKEND_COPY = "This build has no backend configured, so it cannot read event leads.";

export default function EventLeadsPage() {
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

  const canView = can("events.lead.view", permissions);
  const canCreate = can("events.lead.create", permissions);
  const canConvert = can("events.lead.convert", permissions);

  const [leads, setLeads] = useState<EventLead[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<EventLeadStatus | "">("");
  const [typeFilter, setTypeFilter] = useState<EventType | "">("");
  const [sourceFilter, setSourceFilter] = useState<EventSource | "">("");
  const [listError, setListError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const reload = useCallback(() => setReloadTick((tick) => tick + 1), []);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || scope === null || !canView) return;
    let ignore = false;
    setLeads(null);
    setListError(null);

    listEventLeads(scope, {
      status: statusFilter || undefined,
      eventType: typeFilter || undefined,
      source: sourceFilter || undefined,
    })
      .then((rows) => {
        if (ignore) return;
        setLeads(rows);
      })
      .catch((error) => {
        if (!ignore) setListError(toPublicError(error).message);
      });
    return () => {
      ignore = true;
    };
  }, [view, scope, canView, statusFilter, typeFilter, sourceFilter, reloadTick]);

  const handleConvert = useCallback(
    async (leadId: string) => {
      if (!scope || !canConvert) return;
      if (!confirm("Convert this lead to an event? The lead will be marked as converted.")) return;
      try {
        await convertLeadToEvent(leadId, scope.propertyId);
        reload();
      } catch (err) {
        alert(toPublicError(err).message);
      }
    },
    [scope, canConvert, reload],
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          <ClipboardList className="size-5 shrink-0 text-brand-600" aria-hidden />
          Event Leads
        </h2>
        <p className="mt-1 text-sm text-muted">
          Capture enquiries, track follow-ups and convert qualified leads to confirmed events.
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
          title="Sign in to manage event leads"
          description="There is no active session for this build to read a tenant from."
        />
      )}

      {view === "no_organization" && (
        <EmptyState
          icon={<ClipboardList aria-hidden />}
          title="Choose an organization and property first"
          description="Event leads belong to a property. Pick one and this screen will show its leads."
        />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied capability="view event leads" permission="events.lead.view" />
      )}

      {view === "scoped" && scope !== null && canView && (
        <>
          {listError !== null && (
            <p role="alert" className="rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger">
              {listError}
            </p>
          )}

          <Card
            actions={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={reload}>
                  Reload
                </Button>
                {canCreate && (
                  <Button
                    size="sm"
                    icon={<Plus className="size-4" aria-hidden />}
                    onClick={() => setShowCreateDialog(true)}
                  >
                    New lead
                  </Button>
                )}
              </div>
            }
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Status">
                <SelectInput
                  placeholder="All statuses"
                  options={EVENT_LEAD_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, " ") }))}
                  value={statusFilter}
                  onChange={(v) => setStatusFilter(v as EventLeadStatus | "")}
                />
              </Field>
              <Field label="Event type">
                <SelectInput
                  placeholder="All types"
                  options={EVENT_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, " ") }))}
                  value={typeFilter}
                  onChange={(v) => setTypeFilter(v as EventType | "")}
                />
              </Field>
              <Field label="Source">
                <SelectInput
                  placeholder="All sources"
                  options={EVENT_SOURCES.map((s) => ({ value: s, label: s.replace(/_/g, " ") }))}
                  value={sourceFilter}
                  onChange={(v) => setSourceFilter(v as EventSource | "")}
                />
              </Field>
            </div>
          </Card>

          {leads === null ? (
            <LoadingBlock label="Reading leads…" />
          ) : leads.length === 0 ? (
            <EmptyState
              icon={<ClipboardList aria-hidden />}
              title="No leads yet"
              description="This property has no event leads. Create one to start tracking enquiries."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {leads.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  canConvert={canConvert}
                  onConvert={handleConvert}
                />
              ))}
            </div>
          )}
        </>
      )}

      {showCreateDialog && scope !== null && (
        <CreateLeadDialog
          scope={scope}
          onClose={() => setShowCreateDialog(false)}
          onCreated={() => {
            setShowCreateDialog(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

function LeadCard({
  lead,
  canConvert,
  onConvert,
}: {
  lead: EventLead;
  canConvert: boolean;
  onConvert: (leadId: string) => void;
}) {
  const isConverted = lead.status === "CONVERTED";
  const isLost = lead.status === "LOST" || lead.status === "CANCELLED";

  return (
    <div
      className={`rounded-lg border border-line bg-surface shadow-soft ${isConverted || isLost ? "opacity-70" : ""}`}
    >
      <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
              {lead.contactName}
              <Badge tone={statusTone(lead.status)}>{lead.status.replace(/_/g, " ")}</Badge>
            </h3>
            <p className="mt-0.5 text-xs text-muted">
              {lead.leadNumber} · {lead.eventType.replace(/_/g, " ")}
              {lead.eventDate && ` · ${lead.eventDate}`}
            </p>
          </div>
          {canConvert && !isConverted && !isLost && (
            <Button
              size="sm"
              variant="secondary"
              icon={<ArrowRightCircle className="size-4" aria-hidden />}
              onClick={() => onConvert(lead.id)}
            >
              Convert
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          {lead.mobile && <span>{lead.mobile}</span>}
          {lead.email && <span>· {lead.email}</span>}
          {lead.expectedGuests && <span>· {lead.expectedGuests} guests</span>}
          {lead.budget && <span>· ₹{lead.budget.toLocaleString("en-IN")}</span>}
          {lead.source && <Badge tone="muted">{lead.source.replace(/_/g, " ")}</Badge>}
        </div>

        {lead.venuePreference && (
          <p className="text-sm text-muted">Venue: {lead.venuePreference}</p>
        )}
        {lead.notes && <p className="text-sm text-muted">{lead.notes}</p>}
      </div>
    </div>
  );
}

function statusTone(status: EventLeadStatus): "brand" | "neutral" | "warning" | "muted" {
  switch (status) {
    case "NEW":
      return "brand";
    case "CONTACTED":
    case "FOLLOW_UP":
      return "neutral";
    case "QUOTED":
    case "NEGOTIATION":
      return "warning";
    case "CONVERTED":
      return "brand";
    case "LOST":
    case "CANCELLED":
      return "muted";
    default:
      return "neutral";
  }
}

function CreateLeadDialog({
  scope,
  onClose,
  onCreated,
}: {
  scope: EventScope;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [contactName, setContactName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [eventType, setEventType] = useState<EventType>("OTHER");
  const [eventDate, setEventDate] = useState("");
  const [expectedGuests, setExpectedGuests] = useState("");
  const [budget, setBudget] = useState("");
  const [venuePreference, setVenuePreference] = useState("");
  const [source, setSource] = useState<EventSource>("WALK_IN");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName.trim()) {
      setError("Contact name is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createEventLead(scope, {
        contactName: contactName.trim(),
        mobile: mobile.trim() || null,
        email: email.trim() || null,
        eventType,
        eventDate: eventDate || null,
        expectedGuests: expectedGuests ? parseInt(expectedGuests) : null,
        budget: budget ? parseFloat(budget) : null,
        venuePreference: venuePreference.trim() || null,
        source,
        notes: notes.trim() || null,
      });
      onCreated();
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title="New event lead">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Contact name" required>
          <TextInput value={contactName} onChange={(e) => setContactName(e.target.value)} required />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Mobile">
            <TextInput value={mobile} onChange={(e) => setMobile(e.target.value)} />
          </Field>
          <Field label="Email">
            <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Event type">
            <SelectInput
              options={EVENT_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, " ") }))}
              value={eventType}
              onChange={(v) => setEventType(v as EventType)}
            />
          </Field>
          <Field label="Event date">
            <TextInput type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Expected guests">
            <TextInput type="number" value={expectedGuests} onChange={(e) => setExpectedGuests(e.target.value)} />
          </Field>
          <Field label="Budget (₹)">
            <TextInput type="number" value={budget} onChange={(e) => setBudget(e.target.value)} />
          </Field>
        </div>
        <Field label="Venue preference">
          <TextInput value={venuePreference} onChange={(e) => setVenuePreference(e.target.value)} />
        </Field>
        <Field label="Source">
          <SelectInput
            options={EVENT_SOURCES.map((s) => ({ value: s, label: s.replace(/_/g, " ") }))}
            value={source}
            onChange={(v) => setSource(v as EventSource)}
          />
        </Field>
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </Field>
        {error && (
          <p role="alert" className="rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create lead"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
