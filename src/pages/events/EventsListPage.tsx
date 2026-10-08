/**
 * Events List — all confirmed and upcoming events.
 *
 * Lists events with filters for status, event type and date range.
 * Clicking an event opens the Event 360° detail page.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calendar,
  CircleSlash,
  LogIn,
  Plus,
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
import { listEvents, createEvent } from "@/domain/events/event-service";
import type { EventScope, Event, EventStatus, EventType } from "@/domain/events/types";
import { EVENT_STATUSES, EVENT_TYPES } from "@/domain/events/types";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

export type EventsListView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_organization"
  | "scoped";

export function pageStatusFor(status: ContextStatus, context: ActiveContext): EventsListView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null && context.propertyId !== null
      ? "scoped"
      : "no_organization";
  }
  return "bootstrapping";
}

const NO_BACKEND_COPY = "This build has no backend configured, so it cannot read events.";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  ...EVENT_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, " ") })),
];

const TYPE_OPTIONS = [
  { value: "", label: "All types" },
  ...EVENT_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, " ") })),
];

const EVENT_TYPE_FORM_OPTIONS = EVENT_TYPES.map((t) => ({
  value: t,
  label: t.replace(/_/g, " "),
}));

export default function EventsListPage() {
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

  const canView = can("events.event.view", permissions);
  const canCreate = can("events.event.create", permissions);

  const [events, setEvents] = useState<Event[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<EventStatus | "">("");
  const [typeFilter, setTypeFilter] = useState<EventType | "">("");
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
    setEvents(null);
    setListError(null);

    listEvents(scope, {
      status: statusFilter || undefined,
      eventType: typeFilter || undefined,
    })
      .then((rows) => {
        if (ignore) return;
        setEvents(rows);
      })
      .catch((error) => {
        if (!ignore) setListError(toPublicError(error).message);
      });
    return () => {
      ignore = true;
    };
  }, [view, scope, canView, statusFilter, typeFilter, reloadTick]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          <Calendar className="size-5 shrink-0 text-brand-600" aria-hidden />
          Events
        </h2>
        <p className="mt-1 text-sm text-muted">
          All events with full details. Click an event to open its 360° workspace.
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
          icon={<Calendar aria-hidden />}
          title="Choose an organization and property first"
          description="Events belong to a property. Pick one and this screen will show its events."
        />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied capability="view events" permission="events.event.view" />
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
                    New event
                  </Button>
                )}
              </div>
            }
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Status">
                <SelectInput
                  options={STATUS_OPTIONS}
                  value={statusFilter}
                  onChange={(v) => setStatusFilter(v as EventStatus | "")}
                />
              </Field>
              <Field label="Event type">
                <SelectInput
                  options={TYPE_OPTIONS}
                  value={typeFilter}
                  onChange={(v) => setTypeFilter(v as EventType | "")}
                />
              </Field>
            </div>
          </Card>

          {events === null ? (
            <LoadingBlock label="Reading events…" />
          ) : events.length === 0 ? (
            <EmptyState
              icon={<Calendar aria-hidden />}
              title="No events yet"
              description="This property has no events. Create one to start managing bookings."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {events.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          )}
        </>
      )}

      {showCreateDialog && scope !== null && (
        <CreateEventDialog
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

function EventCard({ event }: { event: Event }) {
  const isTerminal = ["COMPLETED", "CLOSED", "CANCELLED", "LOST"].includes(event.status);

  return (
    <a
      href={`/events/${event.id}`}
      className={`block rounded-lg border border-line bg-surface shadow-soft transition-colors hover:border-brand-200 ${isTerminal ? "opacity-70" : ""}`}
    >
      <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
              {event.eventName}
              <Badge tone={statusTone(event.status)}>{event.status.replace(/_/g, " ")}</Badge>
            </h3>
            <p className="mt-0.5 text-xs text-muted">
              {event.eventNumber} · {event.eventType.replace(/_/g, " ")}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>{event.eventDate}</span>
          {event.startTime && <span>· {event.startTime}</span>}
          {event.expectedGuests && <span>· {event.expectedGuests} guests</span>}
          {event.source && <Badge tone="muted">{event.source.replace(/_/g, " ")}</Badge>}
        </div>

        {event.notes && <p className="text-sm text-muted">{event.notes}</p>}
      </div>
    </a>
  );
}

function statusTone(status: EventStatus): "brand" | "neutral" | "warning" | "muted" {
  switch (status) {
    case "ENQUIRY":
    case "FOLLOW_UP":
      return "neutral";
    case "QUOTED":
    case "NEGOTIATION":
      return "warning";
    case "TENTATIVE":
    case "CONFIRMED":
    case "IN_PLANNING":
    case "READY":
    case "IN_PROGRESS":
      return "brand";
    case "COMPLETED":
    case "CLOSED":
      return "brand";
    case "CANCELLED":
    case "LOST":
      return "muted";
    default:
      return "neutral";
  }
}

function CreateEventDialog({
  scope,
  onClose,
  onCreated,
}: {
  scope: EventScope;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [eventName, setEventName] = useState("");
  const [eventType, setEventType] = useState<EventType>("OTHER");
  const [eventDate, setEventDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [expectedGuests, setExpectedGuests] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventName.trim()) {
      setError("Event name is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createEvent(scope, {
        eventName: eventName.trim(),
        eventType,
        eventDate: eventDate || null,
        startTime: startTime || null,
        endTime: endTime || null,
        expectedGuests: expectedGuests ? parseInt(expectedGuests) : null,
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
    <Dialog open onClose={onClose} title="New event">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Event name" required>
          <TextInput
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            required
          />
        </Field>
        <Field label="Event type">
          <SelectInput
            options={EVENT_TYPE_FORM_OPTIONS}
            value={eventType}
            onChange={(v) => setEventType(v as EventType)}
          />
        </Field>
        <Field label="Event date">
          <TextInput
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Start time">
            <TextInput
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </Field>
          <Field label="End time">
            <TextInput
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Expected guests">
          <TextInput
            type="number"
            value={expectedGuests}
            onChange={(e) => setExpectedGuests(e.target.value)}
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
            {submitting ? "Creating…" : "Create event"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
