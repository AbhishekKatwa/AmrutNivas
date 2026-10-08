/**
 * Event Venues — bookable spaces with capacity and availability.
 *
 * Lists all venues with filters for status and type. Supports creating new
 * venues and updating their status.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CircleSlash,
  LogIn,
  MapPin,
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
import {
  listEventVenues,
  createEventVenue,
  updateEventVenue,
} from "@/domain/events/event-service";
import type {
  EventScope,
  EventVenue,
  EventVenueStatus,
  EventVenueType,
} from "@/domain/events/types";
import { EVENT_VENUE_STATUSES, EVENT_VENUE_TYPES } from "@/domain/events/types";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

export type EventVenuesView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_organization"
  | "scoped";

export function pageStatusFor(status: ContextStatus, context: ActiveContext): EventVenuesView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null && context.propertyId !== null
      ? "scoped"
      : "no_organization";
  }
  return "bootstrapping";
}

const NO_BACKEND_COPY = "This build has no backend configured, so it cannot read event venues.";

export default function EventVenuesPage() {
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

  const canView = can("events.venue.view", permissions);
  const canManage = can("events.venue.manage", permissions);

  const [venues, setVenues] = useState<EventVenue[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<EventVenueStatus | "">("");
  const [typeFilter, setTypeFilter] = useState<EventVenueType | "">("");
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
    setVenues(null);
    setListError(null);

    listEventVenues(scope, {
      status: statusFilter || undefined,
      venueType: typeFilter || undefined,
    })
      .then((rows) => {
        if (ignore) return;
        setVenues(rows);
      })
      .catch((error) => {
        if (!ignore) setListError(toPublicError(error).message);
      });
    return () => {
      ignore = true;
    };
  }, [view, scope, canView, statusFilter, typeFilter, reloadTick]);

  const handleStatusChange = useCallback(
    async (venueId: string, newStatus: EventVenueStatus) => {
      if (!canManage) return;
      try {
        await updateEventVenue(venueId, { status: newStatus });
        reload();
      } catch (err) {
        alert(toPublicError(err).message);
      }
    },
    [canManage, reload],
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          <MapPin className="size-5 shrink-0 text-brand-600" aria-hidden />
          Event Venues
        </h2>
        <p className="mt-1 text-sm text-muted">
          Bookable spaces with capacity, availability and conflict detection.
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
          title="Sign in to manage venues"
          description="There is no active session for this build to read a tenant from."
        />
      )}

      {view === "no_organization" && (
        <EmptyState
          icon={<MapPin aria-hidden />}
          title="Choose an organization and property first"
          description="Venues belong to a property. Pick one and this screen will show its venues."
        />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied capability="view venues" permission="events.venue.view" />
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
                {canManage && (
                  <Button
                    size="sm"
                    icon={<Plus className="size-4" aria-hidden />}
                    onClick={() => setShowCreateDialog(true)}
                  >
                    New venue
                  </Button>
                )}
              </div>
            }
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Status">
                <SelectInput
                  placeholder="All statuses"
                  options={[
                    { value: "", label: "All statuses" },
                    ...EVENT_VENUE_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, " ") })),
                  ]}
                  value={statusFilter}
                  onChange={(v) => setStatusFilter(v as EventVenueStatus | "")}
                />
              </Field>
              <Field label="Venue type">
                <SelectInput
                  placeholder="All types"
                  options={[
                    { value: "", label: "All types" },
                    ...EVENT_VENUE_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, " ") })),
                  ]}
                  value={typeFilter}
                  onChange={(v) => setTypeFilter(v as EventVenueType | "")}
                />
              </Field>
            </div>
          </Card>

          {venues === null ? (
            <LoadingBlock label="Reading venues…" />
          ) : venues.length === 0 ? (
            <EmptyState
              icon={<MapPin aria-hidden />}
              title="No venues yet"
              description="This property has no event venues. Create one to start booking events."
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {venues.map((venue) => (
                <VenueCard
                  key={venue.id}
                  venue={venue}
                  canManage={canManage}
                  onStatusChange={handleStatusChange}
                />
              ))}
            </div>
          )}
        </>
      )}

      {showCreateDialog && scope !== null && (
        <CreateVenueDialog
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

function VenueCard({
  venue,
  canManage,
  onStatusChange,
}: {
  venue: EventVenue;
  canManage: boolean;
  onStatusChange: (venueId: string, status: EventVenueStatus) => void;
}) {
  const isInactive = venue.status === "INACTIVE" || venue.status === "MAINTENANCE";

  return (
    <div className={`rounded-lg border border-line bg-surface p-4 shadow-soft ${isInactive ? "opacity-70" : ""}`}>
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
              {venue.name}
              <Badge tone={statusTone(venue.status)}>{venue.status.replace(/_/g, " ")}</Badge>
            </h3>
            <p className="mt-0.5 text-xs text-muted">
              {venue.code && `${venue.code} · `}
              {venue.venueType.replace(/_/g, " ")}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>Capacity: {venue.capacity}</span>
          {venue.areaSqFt && <span>· {venue.areaSqFt} sq ft</span>}
        </div>

        {venue.description && <p className="text-sm text-muted">{venue.description}</p>}

        {canManage && (
          <div className="flex flex-wrap gap-2">
            {EVENT_VENUE_STATUSES.filter((s) => s !== venue.status).map((s) => (
              <Button
                key={s}
                size="sm"
                variant="ghost"
                onClick={() => onStatusChange(venue.id, s)}
              >
                Set {s.replace(/_/g, " ")}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function statusTone(status: EventVenueStatus): "brand" | "neutral" | "warning" | "muted" {
  switch (status) {
    case "AVAILABLE":
      return "brand";
    case "BLOCKED":
      return "warning";
    case "MAINTENANCE":
    case "INACTIVE":
      return "muted";
    default:
      return "neutral";
  }
}

function CreateVenueDialog({
  scope,
  onClose,
  onCreated,
}: {
  scope: EventScope;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [venueType, setVenueType] = useState<EventVenueType>("BANQUET_HALL");
  const [capacity, setCapacity] = useState("");
  const [areaSqFt, setAreaSqFt] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Venue name is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createEventVenue(scope, {
        name: name.trim(),
        code: code.trim() || null,
        venueType,
        capacity: capacity ? parseInt(capacity) : 0,
        areaSqFt: areaSqFt ? parseFloat(areaSqFt) : null,
        description: description.trim() || null,
      });
      onCreated();
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title="New venue">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Venue name" required>
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </Field>
        <Field label="Code">
          <TextInput value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
        <Field label="Venue type">
          <SelectInput
            options={EVENT_VENUE_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, " ") }))}
            value={venueType}
            onChange={(v) => setVenueType(v as EventVenueType)}
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Capacity">
            <TextInput
              type="number"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </Field>
          <Field label="Area (sq ft)">
            <TextInput
              type="number"
              value={areaSqFt}
              onChange={(e) => setAreaSqFt(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Description">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
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
            {submitting ? "Creating…" : "Create venue"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
