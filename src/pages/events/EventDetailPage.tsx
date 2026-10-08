/**
 * Event 360° workspace — the unified view of a single event.
 *
 * Shows event details, status actions (confirm, cancel), and tabbed sections
 * for quotations, tasks, schedule, vendors, payments and the change log.
 * All reads are org+property scoped under RLS. Writes go through doors.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  CircleSlash,
  Clock,
  FileText,
  LogIn,
  MapPin,
  Plus,
  Users,
} from "lucide-react";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { SelectInput } from "@/components/ui/SelectInput";
import { TextInput } from "@/components/ui/TextInput";
import { can, type ActiveContext } from "@/domain/identity/types";
import type {
  Event,
  EventQuotation,
  EventQuotationItem,
  EventTask,
  EventScheduleItem,
  EventVendor,
  EventPayment,
  EventChange,
  EventScope,
  EventStatus,
  EventTaskStatus,
  EventTaskCategory,
  EventTaskPriority,
  EventDepartment,
  EventPaymentType,
} from "@/domain/events/types";
import {
  EVENT_TASK_STATUSES,
  EVENT_TASK_CATEGORIES,
  EVENT_TASK_PRIORITIES,
  EVENT_DEPARTMENTS,
  EVENT_PAYMENT_TYPES,
} from "@/domain/events/types";
import {
  getEvent,
  confirmEvent,
  cancelEvent,
  listEventQuotations,
  listQuotationItems,
  createEventQuotation,
  listEventTasks,
  createEventTask,
  updateEventTask,
  listEventScheduleItems,
  createEventScheduleItem,
  deleteEventScheduleItem,
  listEventVendors,
  listEventPayments,
  createEventPayment,
  listEventChanges,
} from "@/domain/events/event-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

type DetailView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_property"
  | "scoped";

function pageStatusFor(status: ContextStatus, context: ActiveContext): DetailView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null && context.propertyId !== null
      ? "scoped"
      : "no_property";
  }
  return "bootstrapping";
}

type TabKey = "overview" | "quotations" | "tasks" | "schedule" | "vendors" | "payments" | "changes";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "quotations", label: "Quotations" },
  { key: "tasks", label: "Tasks" },
  { key: "schedule", label: "Schedule" },
  { key: "vendors", label: "Vendors" },
  { key: "payments", label: "Payments" },
  { key: "changes", label: "Changes" },
];

export default function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
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
  const canEdit = can("events.event.edit", permissions);

  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [event, setEvent] = useState<Event | null>(null);
  const [quotations, setQuotations] = useState<EventQuotation[]>([]);
  const [tasks, setTasks] = useState<EventTask[]>([]);
  const [scheduleItems, setScheduleItems] = useState<EventScheduleItem[]>([]);
  const [vendors, setVendors] = useState<EventVendor[]>([]);
  const [payments, setPayments] = useState<EventPayment[]>([]);
  const [changes, setChanges] = useState<EventChange[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  const loadEvent = useCallback(async () => {
    if (view !== "scoped" || scope === null || !eventId || !canView) return;
    setLoading(true);
    setError(null);
    try {
      const evt = await getEvent(scope, eventId);
      setEvent(evt);
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setLoading(false);
    }
  }, [view, scope, eventId, canView]);

  const loadTab = useCallback(async () => {
    if (view !== "scoped" || scope === null || !eventId || !canView || !event) return;
    try {
      switch (activeTab) {
        case "quotations": {
          const q = await listEventQuotations(scope, eventId);
          setQuotations(q);
          break;
        }
        case "tasks": {
          const t = await listEventTasks(scope, eventId);
          setTasks(t);
          break;
        }
        case "schedule": {
          const s = await listEventScheduleItems(scope, eventId);
          setScheduleItems(s);
          break;
        }
        case "vendors": {
          const v = await listEventVendors(scope, eventId);
          setVendors(v);
          break;
        }
        case "payments": {
          const p = await listEventPayments(scope, eventId);
          setPayments(p);
          break;
        }
        case "changes": {
          const c = await listEventChanges(scope, eventId);
          setChanges(c);
          break;
        }
      }
    } catch (err) {
      setError(toPublicError(err).message);
    }
  }, [view, scope, eventId, canView, event, activeTab]);

  useEffect(() => {
    void loadEvent();
  }, [loadEvent]);

  useEffect(() => {
    if (event) void loadTab();
  }, [activeTab, event]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <div className="flex items-center gap-3">
        <a href="/events/list">
          <Button size="sm" variant="ghost" icon={<ArrowLeft className="size-4" aria-hidden />}>
            Back
          </Button>
        </a>
      </div>

      {view === "bootstrapping" && <LoadingBlock label="Loading your workspace…" />}

      {view === "unconfigured" && (
        <EmptyState
          icon={<CircleSlash aria-hidden />}
          title="Backend not configured"
          description="This build has no backend configured."
        />
      )}

      {view === "unauthenticated" && (
        <EmptyState
          icon={<LogIn aria-hidden />}
          title="Sign in to view event"
          description="There is no active session for this build to read a tenant from."
        />
      )}

      {view === "no_property" && (
        <EmptyState
          icon={<MapPin aria-hidden />}
          title="Choose a property first"
          description="Events belong to a property. Pick one and this screen will show its events."
        />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied capability="view events" permission="event.view" />
      )}

      {view === "scoped" && scope !== null && canView && (
        <>
          {error !== null && (
            <p role="alert" className="rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}

          {loading ? (
            <LoadingBlock label="Reading event…" />
          ) : event === null ? (
            <EmptyState
              icon={<Calendar aria-hidden />}
              title="Event not found"
              description="This event does not exist or you do not have access."
            />
          ) : (
            <>
              <EventHeader
                event={event}
                canEdit={canEdit}
                onReload={loadEvent}
                scope={scope}
              />

              <div className="flex gap-1 overflow-x-auto border-b border-line">
                {TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                      activeTab === tab.key
                        ? "border-brand-600 text-brand-700"
                        : "border-transparent text-muted hover:text-ink"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {activeTab === "overview" && <OverviewTab event={event} />}
              {activeTab === "quotations" && (
                <QuotationsTab
                  scope={scope}
                  eventId={event.id}
                  quotations={quotations}
                  canEdit={canEdit}
                  onReload={loadTab}
                />
              )}
              {activeTab === "tasks" && (
                <TasksTab
                  scope={scope}
                  eventId={event.id}
                  tasks={tasks}
                  canEdit={canEdit}
                  onReload={loadTab}
                />
              )}
              {activeTab === "schedule" && (
                <ScheduleTab
                  scope={scope}
                  eventId={event.id}
                  items={scheduleItems}
                  canEdit={canEdit}
                  onReload={loadTab}
                />
              )}
              {activeTab === "vendors" && <VendorsTab vendors={vendors} />}
              {activeTab === "payments" && (
                <PaymentsTab
                  scope={scope}
                  eventId={event.id}
                  payments={payments}
                  canEdit={canEdit}
                  onReload={loadTab}
                />
              )}
              {activeTab === "changes" && <ChangesTab changes={changes} />}
            </>
          )}
        </>
      )}
    </div>
  );
}

function EventHeader({
  event,
  canEdit,
  onReload,
}: {
  event: Event;
  canEdit: boolean;
  onReload: () => void;
  scope: EventScope;
}) {
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setActionError(null);
    try {
      await confirmEvent(event.id);
      await onReload();
    } catch (err) {
      setActionError(toPublicError(err).message);
    } finally {
      setConfirming(false);
    }
  };

  const handleCancel = async (reason: string) => {
    setActionError(null);
    try {
      await cancelEvent(event.id, reason);
      await onReload();
    } catch (err) {
      setActionError(toPublicError(err).message);
    } finally {
      setCancelling(false);
    }
  };

  const canConfirm = canEdit && !["CONFIRMED", "CANCELLED", "COMPLETED", "CLOSED"].includes(event.status);
  const canCancel = canEdit && !["CANCELLED", "COMPLETED", "CLOSED"].includes(event.status);

  return (
    <>
      <Card>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-semibold text-ink">
                {event.eventName}
                <Badge tone={statusTone(event.status)}>{event.status.replace(/_/g, " ")}</Badge>
              </h2>
              <p className="mt-1 text-sm text-muted">
                {event.eventNumber}
                {event.eventDate && ` · ${new Date(event.eventDate).toLocaleDateString()}`}
                {event.startTime && ` · ${event.startTime}`}
                {event.endTime && ` – ${event.endTime}`}
              </p>
            </div>
            <div className="flex gap-2">
              {canConfirm && (
                <Button size="sm" variant="primary" onClick={() => setConfirming(true)}>
                  Confirm
                </Button>
              )}
              {canCancel && (
                <Button size="sm" variant="ghost" onClick={() => setCancelling(true)}>
                  Cancel
                </Button>
              )}
            </div>
          </div>

          {actionError && (
            <p className="text-sm text-danger">{actionError}</p>
          )}

          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted">Type</p>
              <p className="font-medium text-ink">{event.eventType.replace(/_/g, " ")}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Guests</p>
              <p className="font-semibold tabular-nums text-ink">
                {event.expectedGuests ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">Source</p>
              <p className="font-medium text-ink">{event.source.replace(/_/g, " ")}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Venue</p>
              <p className="font-medium text-ink">{event.venueId ? "Assigned" : "—"}</p>
            </div>
          </div>

          {event.notes && (
            <div className="rounded-lg bg-surface-alt px-4 py-3 text-sm text-ink">
              {event.notes}
            </div>
          )}
        </div>
      </Card>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Confirm event"
        description="Mark this event as confirmed."
        footer={
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" onClick={handleConfirm}>
              Confirm
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted">This action will mark the event as confirmed.</p>
      </Dialog>

      <CancelDialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        onConfirm={handleCancel}
      />
    </>
  );
}

function CancelDialog({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  return (
    <Dialog
      open={open}
      onClose={() => {
        setReason("");
        onClose();
      }}
      title="Cancel event"
      description="Provide a reason for cancellation."
      footer={
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setReason("");
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={reason.trim().length === 0}
            onClick={() => {
              onConfirm(reason);
              setReason("");
            }}
          >
            Confirm cancellation
          </Button>
        </div>
      }
    >
      <TextInput
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Cancellation reason…"
      />
    </Dialog>
  );
}

function OverviewTab({ event }: { event: Event }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card title="Event details">
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Event number</span>
            <span className="font-medium text-ink">{event.eventNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Type</span>
            <span className="font-medium text-ink">{event.eventType.replace(/_/g, " ")}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Date</span>
            <span className="font-medium text-ink">
              {event.eventDate ? new Date(event.eventDate).toLocaleDateString() : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Time</span>
            <span className="font-medium text-ink">
              {event.startTime
                ? `${event.startTime}${event.endTime ? ` – ${event.endTime}` : ""}`
                : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Expected guests</span>
            <span className="font-semibold tabular-nums text-ink">
              {event.expectedGuests ?? "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Confirmed guests</span>
            <span className="font-semibold tabular-nums text-ink">
              {event.confirmedGuests ?? "—"}
            </span>
          </div>
        </div>
      </Card>

      <Card title="Status history">
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Current status</span>
            <Badge tone={statusTone(event.status)}>{event.status.replace(/_/g, " ")}</Badge>
          </div>
          {event.confirmedAt && (
            <div className="flex justify-between">
              <span className="text-muted">Confirmed</span>
              <span className="font-medium text-ink">
                {new Date(event.confirmedAt).toLocaleDateString()}
              </span>
            </div>
          )}
          {event.cancelledAt && (
            <div className="flex justify-between">
              <span className="text-muted">Cancelled</span>
              <span className="font-medium text-ink">
                {new Date(event.cancelledAt).toLocaleDateString()}
              </span>
            </div>
          )}
          {event.cancellationReason && (
            <div>
              <p className="text-xs text-muted">Cancellation reason</p>
              <p className="mt-1 text-ink">{event.cancellationReason}</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function QuotationsTab({
  scope,
  eventId,
  quotations,
  canEdit,
  onReload,
}: {
  scope: EventScope;
  eventId: string;
  quotations: EventQuotation[];
  canEdit: boolean;
  onReload: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setError(null);
    try {
      await createEventQuotation(eventId);
      await onReload();
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-ink">Quotations</h3>
        {canEdit && (
          <Button size="sm" variant="primary" icon={<Plus className="size-4" aria-hidden />} onClick={() => setCreating(true)}>
            New quotation
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {quotations.length === 0 ? (
        <EmptyState
          icon={<FileText aria-hidden />}
          title="No quotations"
          description="Create a quotation to start pricing this event."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {quotations.map((q) => (
            <QuotationCard key={q.id} quotation={q} scope={scope} />
          ))}
        </div>
      )}

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="Create quotation"
        description="Create a new quotation for this event."
        footer={
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" onClick={handleCreate}>
              Create
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted">A new quotation will be created with version 1.</p>
      </Dialog>
    </div>
  );
}

function QuotationCard({ quotation }: { quotation: EventQuotation; scope: EventScope }) {
  const [items, setItems] = useState<EventQuotationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showItems, setShowItems] = useState(false);

  useEffect(() => {
    if (showItems && items.length === 0) {
      setLoading(true);
      listQuotationItems(quotation.id)
        .then(setItems)
        .finally(() => setLoading(false));
    }
  }, [showItems, quotation.id]);

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="font-semibold text-ink">{quotation.quotationNumber}</h4>
            <p className="text-xs text-muted">
              Version {quotation.version} · Created {new Date(quotation.createdAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={quotationStatusTone(quotation.status)}>
              {quotation.status.replace(/_/g, " ")}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted">Subtotal</p>
            <p className="font-semibold tabular-nums text-ink">₹{quotation.subtotal.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Discount</p>
            <p className="font-semibold tabular-nums text-ink">₹{quotation.discount.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Tax</p>
            <p className="font-semibold tabular-nums text-ink">₹{quotation.tax.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Grand total</p>
            <p className="font-bold tabular-nums text-brand-700">₹{quotation.grandTotal.toLocaleString()}</p>
          </div>
        </div>

        {quotation.validUntil && (
          <p className="text-xs text-muted">
            Valid until {new Date(quotation.validUntil).toLocaleDateString()}
          </p>
        )}

        <button
          type="button"
          onClick={() => setShowItems(!showItems)}
          className="text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          {showItems ? "Hide items" : "Show items"}
        </button>

        {showItems && (
          <div className="mt-2">
            {loading ? (
              <p className="text-sm text-muted">Loading items…</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted">No items in this quotation.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-lg bg-surface-alt px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium text-ink">{item.description}</p>
                      <p className="text-xs text-muted">
                        {item.itemType.replace(/_/g, " ")} · Qty: {item.quantity} · Rate: ₹{item.unitRate}
                      </p>
                    </div>
                    <p className="font-semibold tabular-nums text-ink">₹{item.amount.toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function TasksTab({
  eventId,
  tasks,
  canEdit,
  onReload,
}: {
  scope: EventScope;
  eventId: string;
  tasks: EventTask[];
  canEdit: boolean;
  onReload: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<EventTaskCategory>("GENERAL");
  const [priority, setPriority] = useState<EventTaskPriority>("NORMAL");
  const [dueAt, setDueAt] = useState("");

  const handleCreate = async () => {
    if (title.trim().length === 0) return;
    setError(null);
    try {
      await createEventTask(eventId, {
        title: title.trim(),
        category,
        priority,
        dueAt: dueAt || null,
      });
      setTitle("");
      setCategory("GENERAL");
      setPriority("NORMAL");
      setDueAt("");
      setCreating(false);
      await onReload();
    } catch (err) {
      setError(toPublicError(err).message);
    }
  };

  const handleStatusChange = async (taskId: string, status: EventTaskStatus) => {
    try {
      await updateEventTask(taskId, { status });
      await onReload();
    } catch (err) {
      setError(toPublicError(err).message);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-ink">Tasks</h3>
        {canEdit && (
          <Button size="sm" variant="primary" icon={<Plus className="size-4" aria-hidden />} onClick={() => setCreating(true)}>
            New task
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {tasks.length === 0 ? (
        <EmptyState
          icon={<FileText aria-hidden />}
          title="No tasks"
          description="Create tasks to track event planning and execution."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {tasks.map((task) => (
            <Card key={task.id}>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1">
                    <h4 className="font-semibold text-ink">{task.title}</h4>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <Badge tone="muted">{task.category.replace(/_/g, " ")}</Badge>
                      <Badge tone={priorityTone(task.priority)}>{task.priority}</Badge>
                      {task.dueAt && (
                        <span className="text-muted">
                          Due {new Date(task.dueAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  {canEdit && (
                    <SelectInput
                      value={task.status}
                      onChange={(val) => handleStatusChange(task.id, val as EventTaskStatus)}
                      options={EVENT_TASK_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, " ") }))}
                    />
                  )}
                </div>
                {task.description && (
                  <p className="text-sm text-muted">{task.description}</p>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="Create task"
        description="Add a new task for this event."
        footer={
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" onClick={handleCreate} disabled={title.trim().length === 0}>
              Create
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <TextInput
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title"
          />
          <SelectInput
            value={category}
            onChange={(val) => setCategory(val as EventTaskCategory)}
            options={EVENT_TASK_CATEGORIES.map((c) => ({ value: c, label: c.replace(/_/g, " ") }))}
          />
          <SelectInput
            value={priority}
            onChange={(val) => setPriority(val as EventTaskPriority)}
            options={EVENT_TASK_PRIORITIES.map((p) => ({ value: p, label: p }))}
          />
          <TextInput
            type="date"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            placeholder="Due date"
          />
        </div>
      </Dialog>
    </div>
  );
}

function ScheduleTab({
  eventId,
  items,
  canEdit,
  onReload,
}: {
  scope: EventScope;
  eventId: string;
  items: EventScheduleItem[];
  canEdit: boolean;
  onReload: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [department, setDepartment] = useState<EventDepartment>("BANQUET");

  const handleCreate = async () => {
    if (title.trim().length === 0 || startTime.trim().length === 0) return;
    setError(null);
    try {
      await createEventScheduleItem(eventId, {
        title: title.trim(),
        startTime: startTime.trim(),
        endTime: endTime.trim() || null,
        department,
      });
      setTitle("");
      setStartTime("");
      setEndTime("");
      setDepartment("BANQUET");
      setCreating(false);
      await onReload();
    } catch (err) {
      setError(toPublicError(err).message);
    }
  };

  const handleDelete = async (itemId: string) => {
    try {
      await deleteEventScheduleItem(itemId);
      await onReload();
    } catch (err) {
      setError(toPublicError(err).message);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-ink">Schedule / Run sheet</h3>
        {canEdit && (
          <Button size="sm" variant="primary" icon={<Plus className="size-4" aria-hidden />} onClick={() => setCreating(true)}>
            Add item
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {items.length === 0 ? (
        <EmptyState
          icon={<Clock aria-hidden />}
          title="No schedule items"
          description="Add schedule items to plan the event run sheet."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <Card key={item.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1">
                  <h4 className="font-semibold text-ink">{item.title}</h4>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    <Badge tone="muted">{item.department.replace(/_/g, " ")}</Badge>
                    <span className="text-muted">
                      {item.startTime}
                      {item.endTime && ` – ${item.endTime}`}
                    </span>
                  </div>
                  {item.description && (
                    <p className="mt-2 text-sm text-muted">{item.description}</p>
                  )}
                </div>
                {canEdit && (
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(item.id)}>
                    Delete
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="Add schedule item"
        description="Add an item to the event run sheet."
        footer={
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={handleCreate}
              disabled={title.trim().length === 0 || startTime.trim().length === 0}
            >
              Add
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <TextInput
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
          />
          <TextInput
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            placeholder="Start time"
          />
          <TextInput
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            placeholder="End time (optional)"
          />
          <SelectInput
            value={department}
            onChange={(val) => setDepartment(val as EventDepartment)}
            options={EVENT_DEPARTMENTS.map((d) => ({ value: d, label: d.replace(/_/g, " ") }))}
          />
        </div>
      </Dialog>
    </div>
  );
}

function VendorsTab({ vendors }: { vendors: EventVendor[] }) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold text-ink">Vendors</h3>

      {vendors.length === 0 ? (
        <EmptyState
          icon={<Users aria-hidden />}
          title="No vendors"
          description="No vendors have been added to this event."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {vendors.map((vendor) => (
            <Card key={vendor.id}>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-ink">{vendor.serviceDescription}</h4>
                    <p className="text-xs text-muted">
                      Added {new Date(vendor.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge tone="muted">{vendor.status}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-muted">Quoted amount</p>
                    <p className="font-semibold tabular-nums text-ink">
                      {vendor.quotedAmount !== null ? `₹${vendor.quotedAmount.toLocaleString()}` : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Actual amount</p>
                    <p className="font-semibold tabular-nums text-ink">
                      {vendor.actualAmount !== null ? `₹${vendor.actualAmount.toLocaleString()}` : "—"}
                    </p>
                  </div>
                </div>
                {vendor.notes && (
                  <p className="text-sm text-muted">{vendor.notes}</p>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function PaymentsTab({
  eventId,
  payments,
  canEdit,
  onReload,
}: {
  scope: EventScope;
  eventId: string;
  payments: EventPayment[];
  canEdit: boolean;
  onReload: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentType, setPaymentType] = useState<EventPaymentType>("ADVANCE");
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");

  const totalReceived = useMemo(
    () => payments.reduce((sum, p) => sum + p.amount, 0),
    [payments],
  );

  const handleCreate = async () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0 || paymentDate.trim().length === 0) return;
    setError(null);
    try {
      await createEventPayment(eventId, {
        paymentType,
        amount: amt,
        paymentDate: paymentDate.trim(),
        paymentMethod: paymentMethod.trim() || null,
        referenceNumber: referenceNumber.trim() || null,
      });
      setAmount("");
      setPaymentDate("");
      setPaymentMethod("");
      setReferenceNumber("");
      setPaymentType("ADVANCE");
      setCreating(false);
      await onReload();
    } catch (err) {
      setError(toPublicError(err).message);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-ink">Payments</h3>
        {canEdit && (
          <Button size="sm" variant="primary" icon={<Plus className="size-4" aria-hidden />} onClick={() => setCreating(true)}>
            Record payment
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Card>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">Total received</span>
          <span className="text-2xl font-bold tabular-nums text-brand-700">
            ₹{totalReceived.toLocaleString()}
          </span>
        </div>
      </Card>

      {payments.length === 0 ? (
        <EmptyState
          icon={<FileText aria-hidden />}
          title="No payments"
          description="No payments have been recorded for this event."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {payments.map((payment) => (
            <Card key={payment.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-ink">{payment.paymentNumber}</h4>
                    <Badge tone="muted">{payment.paymentType}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {new Date(payment.paymentDate).toLocaleDateString()}
                    {payment.paymentMethod && ` · ${payment.paymentMethod}`}
                  </p>
                  {payment.referenceNumber && (
                    <p className="text-xs text-muted">Ref: {payment.referenceNumber}</p>
                  )}
                </div>
                <p className="text-xl font-bold tabular-nums text-brand-700">
                  ₹{payment.amount.toLocaleString()}
                </p>
              </div>
              {payment.notes && (
                <p className="mt-2 text-sm text-muted">{payment.notes}</p>
              )}
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="Record payment"
        description="Record a payment for this event."
        footer={
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={handleCreate}
              disabled={parseFloat(amount) <= 0 || paymentDate.trim().length === 0}
            >
              Record
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <SelectInput
            value={paymentType}
            onChange={(val) => setPaymentType(val as EventPaymentType)}
            options={EVENT_PAYMENT_TYPES.map((t) => ({ value: t, label: t }))}
          />
          <TextInput
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
          />
          <TextInput
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            placeholder="Payment date"
          />
          <TextInput
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            placeholder="Payment method (optional)"
          />
          <TextInput
            value={referenceNumber}
            onChange={(e) => setReferenceNumber(e.target.value)}
            placeholder="Reference number (optional)"
          />
        </div>
      </Dialog>
    </div>
  );
}

function ChangesTab({ changes }: { changes: EventChange[] }) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold text-ink">Change log</h3>

      {changes.length === 0 ? (
        <EmptyState
          icon={<FileText aria-hidden />}
          title="No changes"
          description="No changes have been recorded for this event."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {changes.map((change) => (
            <Card key={change.id}>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Badge tone="muted">{change.changeType}</Badge>
                    <p className="mt-2 text-sm text-ink">{change.description}</p>
                  </div>
                  <p className="text-xs text-muted">
                    {new Date(change.createdAt).toLocaleString()}
                  </p>
                </div>
                {(change.oldValue || change.newValue) && (
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-muted">Old value</p>
                      <p className="font-medium text-ink">{change.oldValue ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted">New value</p>
                      <p className="font-medium text-ink">{change.newValue ?? "—"}</p>
                    </div>
                  </div>
                )}
                {change.financialImpact !== null && (
                  <p className="text-sm">
                    <span className="text-muted">Financial impact: </span>
                    <span className="font-semibold tabular-nums text-ink">
                      ₹{change.financialImpact.toLocaleString()}
                    </span>
                  </p>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function statusTone(status: EventStatus): "success" | "warning" | "danger" | "neutral" | "muted" {
  switch (status) {
    case "CONFIRMED":
    case "COMPLETED":
      return "success";
    case "CANCELLED":
    case "LOST":
      return "danger";
    case "ENQUIRY":
    case "FOLLOW_UP":
    case "QUOTED":
    case "NEGOTIATION":
    case "TENTATIVE":
      return "warning";
    case "IN_PLANNING":
    case "READY":
    case "IN_PROGRESS":
      return "neutral";
    default:
      return "muted";
  }
}

function quotationStatusTone(status: string): "success" | "warning" | "danger" | "neutral" | "muted" {
  switch (status) {
    case "ACCEPTED":
      return "success";
    case "REJECTED":
    case "EXPIRED":
    case "CANCELLED":
      return "danger";
    case "DRAFT":
    case "SENT":
    case "VIEWED":
    case "NEGOTIATION":
      return "warning";
    default:
      return "muted";
  }
}

function priorityTone(priority: string): "danger" | "warning" | "neutral" | "muted" {
  switch (priority) {
    case "URGENT":
      return "danger";
    case "HIGH":
      return "warning";
    case "NORMAL":
      return "neutral";
    case "LOW":
      return "muted";
    default:
      return "muted";
  }
}
