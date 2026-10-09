/**
 * Housekeeping — the task board for room cleaning and upkeep.
 *
 * Each task tracks a piece of work against a room: checkout cleans auto-created
 * when a guest depays, stayover cleans, deep cleans, inspections, turndowns and
 * special requests. Tasks move through a state machine: PENDING → ASSIGNED →
 * IN_PROGRESS → COMPLETED → VERIFIED. Completing a checkout clean updates the
 * room's housekeeping status; verifying it promotes the room to INSPECTED.
 *
 * The screen reads organization + property from the context store. With no
 * property selected it renders the deliberate "choose a property first" state.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Clock,
  LogIn,
  Plus,
  Sparkles,
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
  HOUSEKEEPING_PRIORITIES,
  HOUSEKEEPING_TASK_STATUSES,
  HOUSEKEEPING_TASK_TYPES,
  type HousekeepingPriority,
  type HousekeepingTask,
  type HousekeepingTaskStatus,
  type HousekeepingTaskType,
  type Room,
} from "@/domain/hotel/types";
import {
  assignHousekeepingTask,
  cancelHousekeepingTask,
  completeHousekeepingTask,
  createHousekeepingTask,
  listHousekeepingTasks,
  startHousekeepingTask,
  verifyHousekeepingTask,
} from "@/domain/hotel/housekeeping-service";
import { listRooms } from "@/domain/hotel/room-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

/* --------------------------------------------------------------------- scope */

export type HousekeepingPageView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_property"
  | "scoped";

export function pageStatusFor(status: ContextStatus, context: ActiveContext): HousekeepingPageView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null && context.propertyId !== null
      ? "scoped"
      : "no_property";
  }
  return "bootstrapping";
}

export function housekeepingScopeFor(context: ActiveContext): {
  organizationId: string;
  propertyId: string;
} | null {
  if (context.organizationId === null || context.propertyId === null) return null;
  return { organizationId: context.organizationId, propertyId: context.propertyId };
}

/* --------------------------------------------------------------------- helpers */

const STATUS_LABELS: Record<HousekeepingTaskStatus, string> = {
  PENDING: "Pending",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  VERIFIED: "Verified",
  CANCELLED: "Cancelled",
};

const TASK_TYPE_LABELS: Record<HousekeepingTaskType, string> = {
  CHECKOUT_CLEAN: "Checkout clean",
  STAYOVER_CLEAN: "Stayover clean",
  DEEP_CLEAN: "Deep clean",
  INSPECTION: "Inspection",
  TURNDOWN: "Turndown",
  SPECIAL_REQUEST: "Special request",
  OTHER: "Other",
};

const PRIORITY_LABELS: Record<HousekeepingPriority, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

const PRIORITY_TONE: Record<HousekeepingPriority, "neutral" | "warning" | "danger"> = {
  LOW: "neutral",
  NORMAL: "neutral",
  HIGH: "warning",
  URGENT: "danger",
};

function statusOptions(): SelectOption<HousekeepingTaskStatus | "">[] {
  return [
    { value: "", label: "All statuses" },
    ...HOUSEKEEPING_TASK_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] })),
  ];
}

function taskTypeOptions(): SelectOption<HousekeepingTaskType | "">[] {
  return [
    { value: "", label: "All types" },
    ...HOUSEKEEPING_TASK_TYPES.map((value) => ({ value, label: TASK_TYPE_LABELS[value] })),
  ];
}

function priorityOptions(): SelectOption<HousekeepingPriority>[] {
  return HOUSEKEEPING_PRIORITIES.map((value) => ({ value, label: PRIORITY_LABELS[value] }));
}

/* --------------------------------------------------------------------- drafts */

type TaskDraft = {
  roomId: string;
  taskType: HousekeepingTaskType;
  priority: HousekeepingPriority;
  notes: string;
};

function newTaskDraft(): TaskDraft {
  return { roomId: "", taskType: "CHECKOUT_CLEAN", priority: "NORMAL", notes: "" };
}

function validateTaskDraft(draft: TaskDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (draft.roomId === "") errors.roomId = "Choose a room.";
  return errors;
}

/* --------------------------------------------------------------------- screen */

const NO_BACKEND_COPY =
  "This build has no backend configured, so it cannot read or save housekeeping tasks.";

type SheetMode = { kind: "new" };

export default function HousekeepingPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const storeError = useContextStore((s) => s.error);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const scope = useMemo(
    () => housekeepingScopeFor(context),
    [context.organizationId, context.propertyId],
  );

  const canView = can("housekeeping.view", permissions);
  const canCreate = can("housekeeping.task.create", permissions);
  const canAssign = can("housekeeping.task.assign", permissions);
  const canStart = can("housekeeping.task.start", permissions);
  const canComplete = can("housekeeping.task.complete", permissions);
  const canVerify = can("housekeeping.task.verify", permissions);
  const canCancel = can("housekeeping.task.cancel", permissions);

  const [tasks, setTasks] = useState<HousekeepingTask[] | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [statusFilter, setStatusFilter] = useState<HousekeepingTaskStatus | "">("");
  const [typeFilter, setTypeFilter] = useState<HousekeepingTaskType | "">("");
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [sheet, setSheet] = useState<SheetMode | null>(null);
  const [assigning, setAssigning] = useState<HousekeepingTask | null>(null);
  const [assignUserId, setAssignUserId] = useState("");
  const [cancelling, setCancelling] = useState<HousekeepingTask | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || scope === null || !canView) return;
    let ignore = false;
    setTasks(null);
    setListError(null);
    const filters: Record<string, string> = {};
    if (statusFilter) filters.status = statusFilter;
    if (typeFilter) filters.taskType = typeFilter;
    Promise.all([
      listHousekeepingTasks(scope, filters),
      listRooms(scope, {}),
    ])
      .then(([tasksList, roomsList]) => {
        if (ignore) return;
        setTasks(tasksList);
        setRooms(roomsList);
      })
      .catch((error) => {
        if (!ignore) setListError(toPublicError(error).message);
      });
    return () => {
      ignore = true;
    };
  }, [view, scope, canView, statusFilter, typeFilter, reloadTick]);

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
    () =>
      rooms
        .filter((r) => r.archivedAt == null)
        .map((r) => ({ value: r.id, label: `Room ${r.roomNumber}` })),
    [rooms],
  );

  const doAssign = async () => {
    if (assigning === null || scope === null || assignUserId.trim() === "") return;
    try {
      await assignHousekeepingTask(scope, assigning.id, assignUserId.trim(), assigning.version);
      setAssigning(null);
      setAssignUserId("");
      setActionError(null);
      reload();
    } catch (error) {
      report(error);
    }
  };

  const doCancel = async () => {
    if (cancelling === null || scope === null) return;
    try {
      await cancelHousekeepingTask(scope, cancelling.id, cancelReason.trim() || null, cancelling.version);
      setCancelling(null);
      setCancelReason("");
      setActionError(null);
      reload();
    } catch (error) {
      report(error);
    }
  };

  const doStart = async (task: HousekeepingTask) => {
    if (scope === null) return;
    try {
      await startHousekeepingTask(scope, task.id, task.version);
      setActionError(null);
      reload();
    } catch (error) {
      report(error);
    }
  };

  const doComplete = async (task: HousekeepingTask) => {
    if (scope === null) return;
    try {
      await completeHousekeepingTask(scope, task.id, task.version);
      setActionError(null);
      reload();
    } catch (error) {
      report(error);
    }
  };

  const doVerify = async (task: HousekeepingTask) => {
    if (scope === null) return;
    try {
      await verifyHousekeepingTask(scope, task.id, task.version);
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
          <Sparkles className="size-5 shrink-0 text-brand-600" aria-hidden />
          Housekeeping
        </h2>
        <p className="mt-1 text-sm text-muted">
          Tasks for cleaning and preparing rooms. Each task moves through a workflow: pending,
          assigned, in progress, completed, verified.
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
          title="Sign in to manage housekeeping"
          description="There is no active session for this build to read a tenant from."
        />
      )}

      {view === "no_property" && (
        <EmptyState
          icon={<Sparkles aria-hidden />}
          title="Choose a property first"
          description="Housekeeping tasks live inside one property. Pick a property and this screen will show its tasks."
        />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied capability="view housekeeping tasks" permission="housekeeping.view" />
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
                    onClick={() => setSheet({ kind: "new" })}
                  >
                    New task
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
                onChange={(value) => setStatusFilter(value as HousekeepingTaskStatus | "")}
                className="w-40"
              />
              <SelectInput
                value={typeFilter}
                options={taskTypeOptions()}
                onChange={(value) => setTypeFilter(value as HousekeepingTaskType | "")}
                className="w-40"
              />
              <p className="text-xs text-muted">
                {tasks === null ? "Loading…" : `${tasks.length} task${tasks.length === 1 ? "" : "s"}`}
              </p>
            </div>
          </Card>

          {tasks === null ? (
            <LoadingBlock label="Reading tasks…" />
          ) : tasks.length === 0 ? (
            <EmptyState
              icon={<Sparkles aria-hidden />}
              title="No housekeeping tasks"
              description="Tasks appear here when rooms need cleaning or a special request comes in."
              action={
                canCreate ? (
                  <Button
                    icon={<Plus className="size-4" aria-hidden />}
                    onClick={() => setSheet({ kind: "new" })}
                  >
                    Create the first task
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              {tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  room={roomById.get(task.roomId) ?? null}
                  canAssign={canAssign}
                  canStart={canStart}
                  canComplete={canComplete}
                  canVerify={canVerify}
                  canCancel={canCancel}
                  onAssign={() => {
                    setAssigning(task);
                    setAssignUserId("");
                  }}
                  onStart={() => void doStart(task)}
                  onComplete={() => void doComplete(task)}
                  onVerify={() => void doVerify(task)}
                  onCancel={() => {
                    setCancelling(task);
                    setCancelReason("");
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {sheet !== null && scope !== null && (
        <CreateTaskSheet
          scope={scope}
          roomOptions={roomOptions}
          onClose={() => setSheet(null)}
          onSaved={() => {
            setSheet(null);
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
          title={`Assign task — Room ${roomById.get(assigning.roomId)?.roomNumber ?? "?"}`}
          description="Enter the staff member ID to assign this task to."
          footer={
            <>
              <Button variant="ghost" onClick={() => setAssigning(null)}>
                Cancel
              </Button>
              <Button onClick={() => void doAssign()} disabled={assignUserId.trim() === ""}>
                Assign
              </Button>
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

      {cancelling !== null && (
        <Dialog
          open
          onClose={() => setCancelling(null)}
          title="Cancel task"
          description="Record a reason for cancelling this housekeeping task."
          footer={
            <>
              <Button variant="ghost" onClick={() => setCancelling(null)}>
                Keep task
              </Button>
              <Button variant="danger" onClick={() => void doCancel()}>
                Cancel task
              </Button>
            </>
          }
        >
          <Field label="Reason">
            <Textarea
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder="Why is this task being cancelled?"
              rows={3}
            />
          </Field>
        </Dialog>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- pieces */

type TaskCardProps = {
  task: HousekeepingTask;
  room: Room | null;
  canAssign: boolean;
  canStart: boolean;
  canComplete: boolean;
  canVerify: boolean;
  canCancel: boolean;
  onAssign: () => void;
  onStart: () => void;
  onComplete: () => void;
  onVerify: () => void;
  onCancel: () => void;
};

function TaskCard({
  task,
  room,
  canAssign,
  canStart,
  canComplete,
  canVerify,
  canCancel,
  onAssign,
  onStart,
  onComplete,
  onVerify,
  onCancel,
}: TaskCardProps) {
  const isTerminal = task.status === "VERIFIED" || task.status === "CANCELLED";

  return (
    <Card padded={false} className={isTerminal ? "opacity-75" : undefined}>
      <div className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
              {room ? `Room ${room.roomNumber}` : "Unknown room"}
              <StatusPill status={task.status} />
            </h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
              <Badge tone="neutral">{TASK_TYPE_LABELS[task.taskType]}</Badge>
              <Badge tone={PRIORITY_TONE[task.priority]}>{PRIORITY_LABELS[task.priority]}</Badge>
              {task.assignedTo && (
                <>
                  {" · "}
                  Assigned
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {task.status === "PENDING" && canAssign && (
              <Button
                size="sm"
                variant="secondary"
                icon={<Circle className="size-4" aria-hidden />}
                onClick={onAssign}
              >
                Assign
              </Button>
            )}
            {task.status === "ASSIGNED" && canStart && (
              <Button
                size="sm"
                variant="secondary"
                icon={<Clock className="size-4" aria-hidden />}
                onClick={onStart}
              >
                Start
              </Button>
            )}
            {task.status === "IN_PROGRESS" && canComplete && (
              <Button
                size="sm"
                variant="secondary"
                icon={<CheckCircle2 className="size-4" aria-hidden />}
                onClick={onComplete}
              >
                Complete
              </Button>
            )}
            {task.status === "COMPLETED" && canVerify && (
              <Button
                size="sm"
                variant="secondary"
                icon={<CheckCircle2 className="size-4" aria-hidden />}
                onClick={onVerify}
              >
                Verify
              </Button>
            )}
            {!isTerminal && canCancel && (
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

        {task.notes && <p className="text-sm text-muted">{task.notes}</p>}

        <div className="flex flex-wrap gap-4 text-xs text-muted">
          {task.startedAt && <span>Started {new Date(task.startedAt).toLocaleString()}</span>}
          {task.completedAt && <span>Completed {new Date(task.completedAt).toLocaleString()}</span>}
          {task.verifiedAt && <span>Verified {new Date(task.verifiedAt).toLocaleString()}</span>}
        </div>
      </div>
    </Card>
  );
}

/* --------------------------------------------------------------------- sheet */

type CreateTaskSheetProps = {
  scope: { organizationId: string; propertyId: string };
  roomOptions: SelectOption<string>[];
  onClose: () => void;
  onSaved: () => void;
  onFailure: (error: unknown) => void;
};

function CreateTaskSheet({ scope, roomOptions, onClose, onSaved, onFailure }: CreateTaskSheetProps) {
  const [draft, setDraft] = useState<TaskDraft>(newTaskDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const run = async () => {
    const found = validateTaskDraft(draft);
    setErrors(found);
    if (Object.keys(found).length > 0 || busy) return;
    setBusy(true);
    try {
      await createHousekeepingTask(scope, {
        roomId: draft.roomId,
        taskType: draft.taskType,
        priority: draft.priority,
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
      title="New housekeeping task"
      description="Create a cleaning or upkeep task for a room."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void run()} disabled={busy}>
            {busy ? "Creating…" : "Create task"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Room" required error={errors.roomId}>
          <SelectInput
            value={draft.roomId}
            options={roomOptions}
            placeholder="Choose a room…"
            onChange={(value) => setDraft((d) => ({ ...d, roomId: value }))}
          />
        </Field>
        <Field label="Task type">
          <SelectInput
            value={draft.taskType}
            options={HOUSEKEEPING_TASK_TYPES.map((v) => ({ value: v, label: TASK_TYPE_LABELS[v] }))}
            onChange={(value) => setDraft((d) => ({ ...d, taskType: value as HousekeepingTaskType }))}
          />
        </Field>
        <Field label="Priority">
          <SelectInput
            value={draft.priority}
            options={priorityOptions()}
            onChange={(value) =>
              setDraft((d) => ({ ...d, priority: value as HousekeepingPriority }))
            }
          />
        </Field>
        <Field label="Notes">
          <Textarea
            value={draft.notes}
            onChange={(event) => setDraft((d) => ({ ...d, notes: event.target.value }))}
            placeholder="Any special instructions…"
            rows={3}
          />
        </Field>
      </div>
    </Dialog>
  );
}
