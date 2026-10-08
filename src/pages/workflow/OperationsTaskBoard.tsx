/**
 * Operations Task Board — the unified work view across departments.
 *
 * One canonical task architecture (Prompt #26). This screen shows tasks from every
 * domain — housekeeping, maintenance, events, finance, HR — in a single board.
 * Tabs segment by view (all, my, overdue, blocked, completed), filters narrow by
 * priority/type/department, and each card carries the actions its status allows.
 */

import { useCallback, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Filter,
  ListTodo,
  Pause,
  Play,
  Plus,
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
import { TextInput } from "@/components/ui/TextInput";
import { Textarea } from "@/components/ui/Textarea";
import { can, type ActiveContext } from "@/domain/identity/types";
import {
  TASK_PRIORITIES,
  TASK_TYPES,
  type OperationalSummary,
  type OperationalTask,
  type TaskPriority,
  type TaskStatus,
  type TaskType,
} from "@/domain/workflows/types";
import {
  completeTask,
  createTask,
  deriveTaskDueStatus,
  getOperationalSummary,
  listTasks,
  startTask,
  cancelTask,
  blockTask,
} from "@/domain/workflows/workflow-service";
import { useContextStore, type ContextStatus } from "@/state/context-store";

/* --------------------------------------------------------------------- scope */

type PageView = "bootstrapping" | "unconfigured" | "unauthenticated" | "no_property" | "scoped";

function pageStatusFor(status: ContextStatus, context: ActiveContext): PageView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null && context.propertyId !== null ? "scoped" : "no_property";
  }
  return "bootstrapping";
}

/* --------------------------------------------------------------------- labels */

const STATUS_LABELS: Record<TaskStatus, string> = {
  PENDING: "Pending",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  REOPENED: "Reopened",
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
  CRITICAL: "Critical",
};

const PRIORITY_TONE: Record<TaskPriority, "neutral" | "muted" | "brand" | "warning" | "danger" | "success"> = {
  LOW: "neutral",
  NORMAL: "neutral",
  HIGH: "warning",
  URGENT: "danger",
  CRITICAL: "danger",
};

const TYPE_LABELS: Record<TaskType, string> = {
  HOUSEKEEPING: "Housekeeping",
  MAINTENANCE: "Maintenance",
  PROCUREMENT: "Procurement",
  APPROVAL: "Approval",
  FOLLOW_UP: "Follow-up",
  EVENT: "Event",
  CUSTOMER_SERVICE: "Customer service",
  FINANCE: "Finance",
  INVENTORY: "Inventory",
  HR: "HR",
  OPERATIONS: "Operations",
  DOCUMENT: "Document",
  SUPPORT: "Support",
  OTHER: "Other",
};

type TabKey = "all" | "open" | "overdue" | "blocked" | "completed";

const TAB_LABELS: Record<TabKey, string> = {
  all: "All tasks",
  open: "Open",
  overdue: "Overdue",
  blocked: "Blocked",
  completed: "Completed",
};

/* --------------------------------------------------------------------- draft */

type TaskDraft = {
  title: string;
  description: string;
  taskType: TaskType;
  priority: TaskPriority;
  assignedTeam: string;
};

function newTaskDraft(): TaskDraft {
  return { title: "", description: "", taskType: "OPERATIONS", priority: "NORMAL", assignedTeam: "" };
}

function validateTaskDraft(d: TaskDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!d.title.trim()) errors.title = "Enter a title.";
  return errors;
}

/* --------------------------------------------------------------------- screen */

const DEMO_USER = "user_admin";

export default function OperationsTaskBoard() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);

  const view = pageStatusFor(status, context);
  const canView = can("task.view", permissions);
  const canCreate = can("task.create", permissions);

  const [tab, setTab] = useState<TabKey>("open");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "">("");
  const [typeFilter, setTypeFilter] = useState<TaskType | "">("");
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  const [sheet, setSheet] = useState<{ kind: "new" } | null>(null);
  const [draft, setDraft] = useState<TaskDraft>(newTaskDraft);
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});

  const tasks = useMemo(() => {
    const filters: any = {};
    if (priorityFilter) filters.priority = [priorityFilter];
    if (typeFilter) filters.taskType = [typeFilter];
    if (search.trim()) filters.search = search.trim();

    switch (tab) {
      case "open":
        filters.status = ["PENDING", "ASSIGNED", "IN_PROGRESS", "REOPENED"];
        break;
      case "overdue":
        filters.overdue = true;
        break;
      case "blocked":
        filters.blocked = true;
        break;
      case "completed":
        filters.status = ["COMPLETED"];
        break;
    }
    return listTasks(filters);
  }, [tab, priorityFilter, typeFilter, search, reloadTick]);

  const summary = useMemo<OperationalSummary | null>(() => {
    if (view !== "scoped") return null;
    return getOperationalSummary();
  }, [view, reloadTick]);

  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  const handleCreate = useCallback(() => {
    const errors = validateTaskDraft(draft);
    setDraftErrors(errors);
    if (Object.keys(errors).length > 0) return;
    createTask({
      title: draft.title.trim(),
      description: draft.description.trim() || undefined,
      taskType: draft.taskType,
      priority: draft.priority,
      assignedTeam: draft.assignedTeam.trim() || undefined,
      createdBy: DEMO_USER,
    });
    setSheet(null);
    setDraft(newTaskDraft());
    setDraftErrors({});
    reload();
  }, [draft, reload]);

  const handleStart = useCallback(
    (taskId: string) => {
      startTask(taskId, DEMO_USER);
      reload();
    },
    [reload],
  );

  const handleComplete = useCallback(
    (taskId: string) => {
      completeTask(taskId, DEMO_USER);
      reload();
    },
    [reload],
  );

  const handleBlock = useCallback(
    (taskId: string) => {
      const reason = prompt("Reason for blocking:");
      if (reason === null) return;
      blockTask(taskId, reason, DEMO_USER);
      reload();
    },
    [reload],
  );

  const handleCancel = useCallback(
    (taskId: string) => {
      cancelTask(taskId, DEMO_USER);
      reload();
    },
    [reload],
  );

  /* ---- view gates ---- */

  if (view === "bootstrapping") return <LoadingBlock />;
  if (view === "unauthenticated") {
    return <AccessDenied capability="view the task board" permission="task.view" />;
  }
  if (view === "no_property") {
    return (
      <AccessDenied
        capability="view the task board"
        hint="Select a property from the header to see its task board."
      />
    );
  }
  if (!canView) {
    return <AccessDenied capability="view tasks" permission="task.view" />;
  }

  /* ---- render ---- */

  const priorityOptions: SelectOption<TaskPriority | "">[] = [
    { value: "", label: "All priorities" },
    ...TASK_PRIORITIES.map((v) => ({ value: v, label: PRIORITY_LABELS[v] })),
  ];

  const typeOptions: SelectOption<TaskType | "">[] = [
    { value: "", label: "All types" },
    ...TASK_TYPES.map((v) => ({ value: v, label: TYPE_LABELS[v] })),
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">Task Board</h1>
          <p className="mt-1 text-sm text-muted">
            Unified operational tasks across every department.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setSheet({ kind: "new" })}>
            <Plus className="size-4" />
            New task
          </Button>
        )}
      </div>

      {/* summary strip */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="!shadow-none">
            <p className="text-xs text-muted">Open</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{summary.totalOpenTasks}</p>
          </Card>
          <Card className="!shadow-none">
            <p className="text-xs text-muted">Overdue</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-danger">{summary.overdueTasks}</p>
          </Card>
          <Card className="!shadow-none">
            <p className="text-xs text-muted">Blocked</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-warning">{summary.blockedTasks}</p>
          </Card>
          <Card className="!shadow-none">
            <p className="text-xs text-muted">Pending approvals</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{summary.pendingApprovals}</p>
          </Card>
        </div>
      )}

      {/* tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-line">
        {(Object.keys(TAB_LABELS) as TabKey[]).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={
              "shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors " +
              (tab === key
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-muted hover:text-ink")
            }
          >
            {TAB_LABELS[key]}
          </button>
        ))}
      </div>

      {/* filters */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setShowFilters((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs font-medium text-muted hover:text-ink"
        >
          <Filter className="size-3.5" />
          Filters
        </button>
        {showFilters && (
          <>
            <SelectInput
              value={priorityFilter}
              onChange={(v) => setPriorityFilter(v as TaskPriority | "")}
              options={priorityOptions}
              className="!w-40"
            />
            <SelectInput
              value={typeFilter}
              onChange={(v) => setTypeFilter(v as TaskType | "")}
              options={typeOptions}
              className="!w-44"
            />
            <TextInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks…"
              className="!w-52"
            />
          </>
        )}
      </div>

      {/* task list */}
      {tasks.length === 0 ? (
        <EmptyState
          icon={<ListTodo />}
          title="No tasks"
          description={
            tab === "completed"
              ? "No completed tasks match the current filters."
              : tab === "overdue"
                ? "Nothing overdue — good work."
                : "No tasks match the current filters."
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              canEdit={canCreate}
              onStart={handleStart}
              onComplete={handleComplete}
              onBlock={handleBlock}
              onCancel={handleCancel}
            />
          ))}
        </div>
      )}

      {/* create dialog */}
      {sheet?.kind === "new" && (
        <Dialog
          open
          onClose={() => {
            setSheet(null);
            setDraft(newTaskDraft());
            setDraftErrors({});
          }}
          title="New task"
          description="Create an operational task for any department."
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setSheet(null);
                  setDraft(newTaskDraft());
                  setDraftErrors({});
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleCreate}>Create task</Button>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            <Field label="Title" error={draftErrors.title}>
              <TextInput
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                placeholder="e.g. Fix leaking tap — Room 112"
              />
            </Field>
            <Field label="Description">
              <Textarea
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                rows={2}
                placeholder="Additional context…"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <SelectInput
                  value={draft.taskType}
                  onChange={(v) => setDraft((d) => ({ ...d, taskType: v as TaskType }))}
                  options={TASK_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] }))}
                />
              </Field>
              <Field label="Priority">
                <SelectInput
                  value={draft.priority}
                  onChange={(v) => setDraft((d) => ({ ...d, priority: v as TaskPriority }))}
                  options={TASK_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))}
                />
              </Field>
            </div>
            <Field label="Assign to team">
              <TextInput
                value={draft.assignedTeam}
                onChange={(e) => setDraft((d) => ({ ...d, assignedTeam: e.target.value }))}
                placeholder="e.g. Housekeeping, Maintenance"
              />
            </Field>
          </div>
        </Dialog>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- task card */

function TaskCard({
  task,
  canEdit,
  onStart,
  onComplete,
  onBlock,
  onCancel,
}: {
  task: OperationalTask;
  canEdit: boolean;
  onStart: (id: string) => void;
  onComplete: (id: string) => void;
  onBlock: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const dueStatus = deriveTaskDueStatus(task);
  const isActionable = canEdit && task.status !== "COMPLETED" && task.status !== "CANCELLED";

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={PRIORITY_TONE[task.priority]}>{PRIORITY_LABELS[task.priority]}</Badge>
            <Badge>{TYPE_LABELS[task.taskType]}</Badge>
            <StatusBadge status={task.status} />
            {dueStatus === "OVERDUE" && (
              <Badge tone="danger">
                <AlertCircle className="size-3" /> Overdue
              </Badge>
            )}
            {dueStatus === "DUE_SOON" && (
              <Badge tone="warning">
                <Clock className="size-3" /> Due soon
              </Badge>
            )}
          </div>
          <h3 className="mt-1.5 text-sm font-semibold text-ink">{task.title}</h3>
          {task.description && (
            <p className="mt-0.5 text-xs leading-relaxed text-muted line-clamp-2">{task.description}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
            {task.assignedTeam && <span>Team: {task.assignedTeam}</span>}
            {task.sourceType && <span>Source: {task.sourceType}</span>}
            {task.dueAt && (
              <span>Due: {new Date(task.dueAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            )}
            {task.checklist && task.checklist.length > 0 && (
              <span>
                Checklist: {task.checklist.filter((c) => c.completed).length}/{task.checklist.length}
              </span>
            )}
          </div>
        </div>
      </div>

      {isActionable && (
        <div className="flex flex-wrap gap-1.5 border-t border-line pt-2">
          {(task.status === "PENDING" || task.status === "ASSIGNED") && (
            <button
              onClick={() => onStart(task.id)}
              className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100"
            >
              <Play className="size-3" /> Start
            </button>
          )}
          {task.status === "IN_PROGRESS" && (
            <button
              onClick={() => onComplete(task.id)}
              className="inline-flex items-center gap-1 rounded-md bg-success-soft px-2.5 py-1 text-xs font-medium text-success hover:brightness-95"
            >
              <CheckCircle2 className="size-3" /> Complete
            </button>
          )}
          {task.status !== "BLOCKED" && task.status === "IN_PROGRESS" && (
            <button
              onClick={() => onBlock(task.id)}
              className="inline-flex items-center gap-1 rounded-md bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning hover:brightness-95"
            >
              <Pause className="size-3" /> Block
            </button>
          )}
          {task.status !== "CANCELLED" && (
            <button
              onClick={() => onCancel(task.id)}
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-muted hover:text-danger"
            >
              <XCircle className="size-3" /> Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: TaskStatus }) {
  const toneMap: Record<TaskStatus, "neutral" | "muted" | "brand" | "warning" | "danger" | "success"> = {
    PENDING: "neutral",
    ASSIGNED: "brand",
    IN_PROGRESS: "brand",
    BLOCKED: "danger",
    COMPLETED: "success",
    CANCELLED: "muted",
    REOPENED: "warning",
  };
  return <Badge tone={toneMap[status]}>{STATUS_LABELS[status]}</Badge>;
}
