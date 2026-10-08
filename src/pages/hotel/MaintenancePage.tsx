/**
 * Maintenance — the request board for repair and upkeep work.
 *
 * Requests track issues across rooms, outlets and assets: electrical faults,
 * plumbing leaks, broken furniture, HVAC problems. Each moves through a state
 * machine: OPEN → ASSIGNED → IN_PROGRESS → RESOLVED → VERIFIED → CLOSED.
 * High-priority room-bound requests may set the room OUT_OF_ORDER; closing
 * returns it to ACTIVE.
 *
 * The screen reads organization + property from the context store.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Clock,
  LogIn,
  Pause,
  Plus,
  Wrench,
  XCircle,
} from "lucide-react";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { LoadingBlock } from "@/components/ui/Spinner";
import { SelectInput, type SelectOption } from "@/components/ui/SelectInput";
import { StatusPill } from "@/components/ui/StatusPill";
import { TextInput } from "@/components/ui/TextInput";
import { Textarea } from "@/components/ui/Textarea";
import { can, type ActiveContext } from "@/domain/identity/types";
import {
  MAINTENANCE_CATEGORIES,
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_STATUSES,
  type MaintenanceCategory,
  type MaintenancePriority,
  type MaintenanceRequest,
  type MaintenanceStatus,
  type Room,
} from "@/domain/hotel/types";
import {
  assignMaintenanceRequest,
  cancelMaintenanceRequest,
  closeMaintenanceRequest,
  createMaintenanceRequest,
  listMaintenanceRequests,
  putMaintenanceOnHold,
  resolveMaintenanceRequest,
  startMaintenanceRequest,
  verifyMaintenanceRequest,
} from "@/domain/hotel/maintenance-service";
import { listRooms } from "@/domain/hotel/room-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

/* --------------------------------------------------------------------- scope */

export type MaintenancePageView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_property"
  | "scoped";

export function pageStatusFor(status: ContextStatus, context: ActiveContext): MaintenancePageView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null && context.propertyId !== null
      ? "scoped"
      : "no_property";
  }
  return "bootstrapping";
}

export function maintenanceScopeFor(context: ActiveContext): {
  organizationId: string;
  propertyId: string;
} | null {
  if (context.organizationId === null || context.propertyId === null) return null;
  return { organizationId: context.organizationId, propertyId: context.propertyId };
}

/* --------------------------------------------------------------------- helpers */

const STATUS_LABELS: Record<MaintenanceStatus, string> = {
  OPEN: "Open",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  ON_HOLD: "On hold",
  RESOLVED: "Resolved",
  VERIFIED: "Verified",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};

const CATEGORY_LABELS: Record<MaintenanceCategory, string> = {
  ELECTRICAL: "Electrical",
  PLUMBING: "Plumbing",
  HVAC: "HVAC",
  CARPENTRY: "Carpentry",
  PAINTING: "Painting",
  APPLIANCE: "Appliance",
  IT: "IT",
  CIVIL: "Civil",
  FURNITURE: "Furniture",
  ROOM_AMENITY: "Room amenity",
  KITCHEN_EQUIPMENT: "Kitchen equipment",
  OTHER: "Other",
};

const PRIORITY_LABELS: Record<MaintenancePriority, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
  EMERGENCY: "Emergency",
};

const PRIORITY_TONE: Record<MaintenancePriority, "neutral" | "brand" | "warning" | "danger"> = {
  LOW: "neutral",
  NORMAL: "neutral",
  HIGH: "warning",
  URGENT: "danger",
  EMERGENCY: "danger",
};

function statusOptions(): SelectOption<MaintenanceStatus | "">[] {
  return [
    { value: "", label: "All statuses" },
    ...MAINTENANCE_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] })),
  ];
}

function categoryOptions(): SelectOption<MaintenanceCategory | "">[] {
  return [
    { value: "", label: "All categories" },
    ...MAINTENANCE_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] })),
  ];
}

function priorityOptions(): SelectOption<MaintenancePriority>[] {
  return MAINTENANCE_PRIORITIES.map((value) => ({ value, label: PRIORITY_LABELS[value] }));
}

/* --------------------------------------------------------------------- drafts */

type RequestDraft = {
  title: string;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  roomId: string;
  description: string;
  estimatedCost: string;
  notes: string;
};

function newRequestDraft(): RequestDraft {
  return {
    title: "",
    category: "OTHER",
    priority: "NORMAL",
    roomId: "",
    description: "",
    estimatedCost: "",
    notes: "",
  };
}

function validateRequestDraft(draft: RequestDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (draft.title.trim() === "") errors.title = "A title is required.";
  return errors;
}

/* --------------------------------------------------------------------- screen */

const NO_BACKEND_COPY =
  "This build has no backend configured, so it cannot read or save maintenance requests.";

export default function MaintenancePage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const storeError = useContextStore((s) => s.error);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const scope = useMemo(
    () => maintenanceScopeFor(context),
    [context.organizationId, context.propertyId],
  );

  const canView = can("maintenance.view", permissions);
  const canCreate = can("maintenance.create", permissions);
  const canAssign = can("maintenance.assign", permissions);
  const canStart = can("maintenance.start", permissions);
  const canResolve = can("maintenance.resolve", permissions);
  const canVerify = can("maintenance.verify", permissions);
  const canClose = can("maintenance.close", permissions);
  const canCancel = can("maintenance.cancel", permissions);

  const [requests, setRequests] = useState<MaintenanceRequest[] | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [statusFilter, setStatusFilter] = useState<MaintenanceStatus | "">("");
  const [categoryFilter, setCategoryFilter] = useState<MaintenanceCategory | "">("");
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState<MaintenanceRequest | null>(null);
  const [assignUserId, setAssignUserId] = useState("");
  const [resolving, setResolving] = useState<MaintenanceRequest | null>(null);
  const [resolution, setResolution] = useState("");
  const [actualCost, setActualCost] = useState("");
  const [verifying, setVerifying] = useState<MaintenanceRequest | null>(null);
  const [verificationNotes, setVerificationNotes] = useState("");
  const [holding, setHolding] = useState<MaintenanceRequest | null>(null);
  const [holdReason, setHoldReason] = useState("");
  const [cancelling, setCancelling] = useState<MaintenanceRequest | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || scope === null || !canView) return;
    let ignore = false;
    setRequests(null);
    setListError(null);
    const filters: Record<string, string> = {};
    if (statusFilter) filters.status = statusFilter;
    if (categoryFilter) filters.category = categoryFilter;
    Promise.all([
      listMaintenanceRequests(scope, filters),
      listRooms(scope, {}),
    ])
      .then(([requestsList, roomsList]) => {
        if (ignore) return;
        setRequests(requestsList);
        setRooms(roomsList);
      })
      .catch((error) => {
        if (!ignore) setListError(toPublicError(error).message);
      });
    return () => {
      ignore = true;
    };
  }, [view, scope, canView, statusFilter, categoryFilter, reloadTick]);

  const reload = useCallback(() => setReloadTick((tick) => tick + 1), []);
  const report = useCallback(
    (error: unknown) => setActionError(toPublicError(error).message),
    [],
  );

  const roomById = useMemo(() => {
    const map = new Map<string, Room>();
    for (const r of rooms) map.set(r.id, r);
    return map;
  }, [rooms]);

  const roomOptions = useMemo<SelectOption<string>[]>(
    () => [
      { value: "", label: "No specific room" },
      ...rooms
        .filter((r) => r.archivedAt == null)
        .map((r) => ({ value: r.id, label: `Room ${r.roomNumber}` })),
    ],
    [rooms],
  );

  const doAssign = async () => {
    if (assigning === null || scope === null) return;
    try {
      await assignMaintenanceRequest(
        scope,
        assigning.id,
        assignUserId.trim() || null,
        null,
        assigning.version,
      );
      setAssigning(null);
      setAssignUserId("");
      setActionError(null);
      reload();
    } catch (error) {
      report(error);
    }
  };

  const doResolve = async () => {
    if (resolving === null || scope === null || resolution.trim() === "") return;
    try {
      await resolveMaintenanceRequest(
        scope,
        resolving.id,
        resolution.trim(),
        actualCost.trim() ? Number(actualCost.trim()) : null,
        resolving.version,
      );
      setResolving(null);
      setResolution("");
      setActualCost("");
      setActionError(null);
      reload();
    } catch (error) {
      report(error);
    }
  };

  const doVerify = async () => {
    if (verifying === null || scope === null) return;
    try {
      await verifyMaintenanceRequest(
        scope,
        verifying.id,
        verificationNotes.trim() || null,
        verifying.version,
      );
      setVerifying(null);
      setVerificationNotes("");
      setActionError(null);
      reload();
    } catch (error) {
      report(error);
    }
  };

  const doHold = async () => {
    if (holding === null || scope === null || holdReason.trim() === "") return;
    try {
      await putMaintenanceOnHold(scope, holding.id, holdReason.trim(), holding.version);
      setHolding(null);
      setHoldReason("");
      setActionError(null);
      reload();
    } catch (error) {
      report(error);
    }
  };

  const doCancel = async () => {
    if (cancelling === null || scope === null) return;
    try {
      await cancelMaintenanceRequest(
        scope,
        cancelling.id,
        cancelReason.trim() || null,
        cancelling.version,
      );
      setCancelling(null);
      setCancelReason("");
      setActionError(null);
      reload();
    } catch (error) {
      report(error);
    }
  };

  const doStart = async (req: MaintenanceRequest) => {
    if (scope === null) return;
    try {
      await startMaintenanceRequest(scope, req.id, req.version);
      setActionError(null);
      reload();
    } catch (error) {
      report(error);
    }
  };

  const doClose = async (req: MaintenanceRequest) => {
    if (scope === null) return;
    try {
      await closeMaintenanceRequest(scope, req.id, req.version);
      setActionError(null);
      reload();
    } catch (error) {
      report(error);
    }
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          <Wrench className="size-5 shrink-0 text-brand-600" aria-hidden />
          Maintenance
        </h2>
        <p className="mt-1 text-sm text-muted">
          Repair and upkeep requests for rooms, outlets and assets. Each request moves through:
          open, assigned, in progress, resolved, verified, closed.
        </p>
      </header>

      {view === "bootstrapping" && <LoadingBlock label="Loading your workspace…" />}

      {view === "unconfigured" && (
        <EmptyState
          icon={<AlertCircle aria-hidden />}
          title="Backend not configured"
          description={storeError ?? NO_BACKEND_COPY}
        />
      )}

      {view === "unauthenticated" && (
        <EmptyState
          icon={<LogIn aria-hidden />}
          title="Sign in to manage maintenance"
          description="There is no active session for this build to read a tenant from."
        />
      )}

      {view === "no_property" && (
        <EmptyState
          icon={<Wrench aria-hidden />}
          title="Choose a property first"
          description="Maintenance requests live inside one property. Pick a property and this screen will show its requests."
        />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied capability="view maintenance requests" permission="maintenance.view" />
      )}

      {view === "scoped" && scope !== null && canView && (
        <>
          {listError !== null && (
            <p
              role="alert"
              className="rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger"
            >
              {listError}
            </p>
          )}
          {actionError !== null && (
            <div
              role="alert"
              className="flex items-start justify-between gap-3 rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger"
            >
              <span>{actionError}</span>
              <Button size="sm" variant="ghost" onClick={() => setActionError(null)}>
                Dismiss
              </Button>
            </div>
          )}

          <Card
            actions={
              <div className="flex flex-wrap items-center justify-end gap-2">
                {canCreate && (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Plus className="size-4" aria-hidden />}
                    onClick={() => setCreating(true)}
                  >
                    New request
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={reload}>
                  Reload
                </Button>
              </div>
            }
          >
            <div className="flex flex-wrap items-center gap-3">
              <SelectInput
                value={statusFilter}
                options={statusOptions()}
                onChange={(value) => setStatusFilter(value as MaintenanceStatus | "")}
                className="w-40"
              />
              <SelectInput
                value={categoryFilter}
                options={categoryOptions()}
                onChange={(value) => setCategoryFilter(value as MaintenanceCategory | "")}
                className="w-40"
              />
              <p className="text-xs text-muted">
                {requests === null
                  ? "Loading…"
                  : `${requests.length} request${requests.length === 1 ? "" : "s"}`}
              </p>
            </div>
          </Card>

          {requests === null ? (
            <LoadingBlock label="Reading requests…" />
          ) : requests.length === 0 ? (
            <EmptyState
              icon={<Wrench aria-hidden />}
              title="No maintenance requests"
              description="Requests appear here when something needs repair — a broken fixture, a leaking pipe, a faulty outlet."
              action={
                canCreate ? (
                  <Button
                    icon={<Plus className="size-4" aria-hidden />}
                    onClick={() => setCreating(true)}
                  >
                    Report an issue
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              {requests.map((req) => (
                <RequestCard
                  key={req.id}
                  request={req}
                  room={req.roomId ? roomById.get(req.roomId) ?? null : null}
                  canAssign={canAssign}
                  canStart={canStart}
                  canResolve={canResolve}
                  canVerify={canVerify}
                  canClose={canClose}
                  canCancel={canCancel}
                  onAssign={() => {
                    setAssigning(req);
                    setAssignUserId("");
                  }}
                  onStart={() => void doStart(req)}
                  onResolve={() => {
                    setResolving(req);
                    setResolution("");
                    setActualCost("");
                  }}
                  onVerify={() => {
                    setVerifying(req);
                    setVerificationNotes("");
                  }}
                  onClose={() => void doClose(req)}
                  onHold={() => {
                    setHolding(req);
                    setHoldReason("");
                  }}
                  onCancel={() => {
                    setCancelling(req);
                    setCancelReason("");
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {creating && scope !== null && (
        <CreateRequestSheet
          scope={scope}
          roomOptions={roomOptions}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            setActionError(null);
            reload();
          }}
          onFailure={report}
        />
      )}

      {assigning !== null && (
        <Dialog
          open
          onClose={() => setAssigning(null)}
          title="Assign request"
          description="Enter the technician or staff member ID."
          footer={
            <>
              <Button variant="secondary" onClick={() => setAssigning(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void doAssign()}>Assign</Button>
            </>
          }
        >
          <Field label="Staff member ID">
            <TextInput
              value={assignUserId}
              onChange={(event) => setAssignUserId(event.target.value)}
              placeholder="e.g. u_abc123"
            />
          </Field>
        </Dialog>
      )}

      {resolving !== null && (
        <Dialog
          open
          onClose={() => setResolving(null)}
          title="Resolve request"
          description="Describe what was done and the actual cost if known."
          footer={
            <>
              <Button variant="secondary" onClick={() => setResolving(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => void doResolve()}
                disabled={resolution.trim() === ""}
              >
                Mark resolved
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <Field label="Resolution">
              <Textarea
                value={resolution}
                onChange={(event) => setResolution(event.target.value)}
                placeholder="What was done to fix the issue?"
                rows={3}
              />
            </Field>
            <Field label="Actual cost (optional)">
              <TextInput
                value={actualCost}
                onChange={(event) => setActualCost(event.target.value)}
                placeholder="0.00"
                type="number"
              />
            </Field>
          </div>
        </Dialog>
      )}

      {verifying !== null && (
        <Dialog
          open
          onClose={() => setVerifying(null)}
          title="Verify resolution"
          description="Confirm the fix is satisfactory. Add notes if needed."
          footer={
            <>
              <Button variant="secondary" onClick={() => setVerifying(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void doVerify()}>Verify</Button>
            </>
          }
        >
          <Field label="Verification notes (optional)">
            <Textarea
              value={verificationNotes}
              onChange={(event) => setVerificationNotes(event.target.value)}
              placeholder="Any observations…"
              rows={3}
            />
          </Field>
        </Dialog>
      )}

      {holding !== null && (
        <Dialog
          open
          onClose={() => setHolding(null)}
          title="Put on hold"
          description="Record why this request is being paused."
          footer={
            <>
              <Button variant="secondary" onClick={() => setHolding(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => void doHold()}
                disabled={holdReason.trim() === ""}
              >
                Put on hold
              </Button>
            </>
          }
        >
          <Field label="Reason">
            <Textarea
              value={holdReason}
              onChange={(event) => setHoldReason(event.target.value)}
              placeholder="Why is this request on hold?"
              rows={3}
            />
          </Field>
        </Dialog>
      )}

      {cancelling !== null && (
        <Dialog
          open
          onClose={() => setCancelling(null)}
          title="Cancel request"
          description="Record a reason for cancelling this maintenance request."
          footer={
            <>
              <Button variant="secondary" onClick={() => setCancelling(null)}>
                Keep request
              </Button>
              <Button variant="danger" onClick={() => void doCancel()}>
                Cancel request
              </Button>
            </>
          }
        >
          <Field label="Reason">
            <Textarea
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder="Why is this request being cancelled?"
              rows={3}
            />
          </Field>
        </Dialog>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- pieces */

type RequestCardProps = {
  request: MaintenanceRequest;
  room: Room | null;
  canAssign: boolean;
  canStart: boolean;
  canResolve: boolean;
  canVerify: boolean;
  canClose: boolean;
  canCancel: boolean;
  onAssign: () => void;
  onStart: () => void;
  onResolve: () => void;
  onVerify: () => void;
  onClose: () => void;
  onHold: () => void;
  onCancel: () => void;
};

function RequestCard({
  request,
  room,
  canAssign,
  canStart,
  canResolve,
  canVerify,
  canClose,
  canCancel,
  onAssign,
  onStart,
  onResolve,
  onVerify,
  onClose,
  onHold,
  onCancel,
}: RequestCardProps) {
  const isTerminal = request.status === "CLOSED" || request.status === "CANCELLED";

  return (
    <Card padded={false} className={isTerminal ? "opacity-75" : undefined}>
      <div className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
              {request.title}
              <StatusPill status={request.status} />
            </h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
              <Badge tone="neutral">{CATEGORY_LABELS[request.category]}</Badge>
              <Badge tone={PRIORITY_TONE[request.priority]}>
                {PRIORITY_LABELS[request.priority]}
              </Badge>
              {room && (
                <>
                  {" · "}Room {room.roomNumber}
                </>
              )}
              {request.assignedTo && (
                <>
                  {" · "}Assigned
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {request.status === "OPEN" && canAssign && (
              <Button
                size="sm"
                variant="secondary"
                icon={<Circle className="size-4" aria-hidden />}
                onClick={onAssign}
              >
                Assign
              </Button>
            )}
            {request.status === "ASSIGNED" && canStart && (
              <Button
                size="sm"
                variant="secondary"
                icon={<Clock className="size-4" aria-hidden />}
                onClick={onStart}
              >
                Start
              </Button>
            )}
            {request.status === "IN_PROGRESS" && canResolve && (
              <Button
                size="sm"
                variant="secondary"
                icon={<CheckCircle2 className="size-4" aria-hidden />}
                onClick={onResolve}
              >
                Resolve
              </Button>
            )}
            {request.status === "IN_PROGRESS" && (
              <Button
                size="sm"
                variant="ghost"
                icon={<Pause className="size-4" aria-hidden />}
                onClick={onHold}
              >
                Hold
              </Button>
            )}
            {request.status === "RESOLVED" && canVerify && (
              <Button
                size="sm"
                variant="secondary"
                icon={<CheckCircle2 className="size-4" aria-hidden />}
                onClick={onVerify}
              >
                Verify
              </Button>
            )}
            {request.status === "VERIFIED" && canClose && (
              <Button
                size="sm"
                variant="secondary"
                icon={<CheckCircle2 className="size-4" aria-hidden />}
                onClick={onClose}
              >
                Close
              </Button>
            )}
            {!isTerminal && request.status !== "ON_HOLD" && canCancel && (
              <Button
                size="sm"
                variant="ghost"
                icon={<XCircle className="size-4" aria-hidden />}
                onClick={onCancel}
              >
                Cancel
              </Button>
            )}
          </div>
        </div>

        {request.description && (
          <p className="text-sm text-muted">{request.description}</p>
        )}

        {request.resolution && (
          <div className="rounded-lg bg-surface-alt px-3 py-2 text-sm">
            <p className="font-medium text-ink">Resolution</p>
            <p className="text-muted">{request.resolution}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-4 text-xs text-muted">
          {request.reportedAt && (
            <span>Reported {new Date(request.reportedAt).toLocaleString()}</span>
          )}
          {request.startedAt && (
            <span>Started {new Date(request.startedAt).toLocaleString()}</span>
          )}
          {request.resolvedAt && (
            <span>Resolved {new Date(request.resolvedAt).toLocaleString()}</span>
          )}
          {request.actualCost != null && (
            <span>Cost: ₹{request.actualCost.toLocaleString()}</span>
          )}
        </div>
      </div>
    </Card>
  );
}

/* --------------------------------------------------------------------- sheet */

type CreateRequestSheetProps = {
  scope: { organizationId: string; propertyId: string };
  roomOptions: SelectOption<string>[];
  onClose: () => void;
  onSaved: () => void;
  onFailure: (error: unknown) => void;
};

function CreateRequestSheet({
  scope,
  roomOptions,
  onClose,
  onSaved,
  onFailure,
}: CreateRequestSheetProps) {
  const [draft, setDraft] = useState<RequestDraft>(newRequestDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const run = async () => {
    const found = validateRequestDraft(draft);
    setErrors(found);
    if (Object.keys(found).length > 0 || busy) return;
    setBusy(true);
    try {
      await createMaintenanceRequest(scope, {
        title: draft.title.trim(),
        category: draft.category,
        priority: draft.priority,
        roomId: draft.roomId || null,
        description: draft.description.trim() || null,
        estimatedCost: draft.estimatedCost.trim() ? Number(draft.estimatedCost.trim()) : null,
        notes: draft.notes.trim() || null,
      });
      onSaved();
    } catch (error) {
      onFailure(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      side="right"
      title="New maintenance request"
      description="Report a repair or upkeep issue."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void run()} disabled={busy}>
            {busy ? "Creating…" : "Create request"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Title" required error={errors.title}>
          <TextInput
            value={draft.title}
            invalid={errors.title !== undefined}
            disabled={busy}
            onChange={(event) => setDraft((d) => ({ ...d, title: event.target.value }))}
            placeholder="Brief description of the issue"
          />
        </Field>
        <Field label="Category">
          <SelectInput
            value={draft.category}
            options={MAINTENANCE_CATEGORIES.map((v) => ({
              value: v,
              label: CATEGORY_LABELS[v],
            }))}
            onChange={(value) =>
              setDraft((d) => ({ ...d, category: value as MaintenanceCategory }))
            }
          />
        </Field>
        <Field label="Priority">
          <SelectInput
            value={draft.priority}
            options={priorityOptions()}
            onChange={(value) =>
              setDraft((d) => ({ ...d, priority: value as MaintenancePriority }))
            }
          />
        </Field>
        <Field label="Room (optional)">
          <SelectInput
            value={draft.roomId}
            options={roomOptions}
            onChange={(value) => setDraft((d) => ({ ...d, roomId: value }))}
          />
        </Field>
        <Field label="Description">
          <Textarea
            value={draft.description}
            onChange={(event) => setDraft((d) => ({ ...d, description: event.target.value }))}
            placeholder="Detailed description of the issue…"
            rows={3}
          />
        </Field>
        <Field label="Estimated cost (optional)">
          <TextInput
            value={draft.estimatedCost}
            onChange={(event) => setDraft((d) => ({ ...d, estimatedCost: event.target.value }))}
            placeholder="0.00"
            type="number"
          />
        </Field>
        <Field label="Notes (optional)">
          <Textarea
            value={draft.notes}
            onChange={(event) => setDraft((d) => ({ ...d, notes: event.target.value }))}
            placeholder="Internal notes…"
            rows={2}
          />
        </Field>
      </div>
    </Dialog>
  );
}
