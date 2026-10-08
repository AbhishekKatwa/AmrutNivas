/**
 * My Work — personal operational view.
 *
 * Mobile-first screen showing the tasks assigned to the current user:
 * due today, overdue, in progress, waiting (blocked), and recently completed.
 * Each section is a compact list; the whole screen fits on a phone without scrolling
 * past the first two sections.
 */

import { useCallback, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ListTodo,
  Play,
  XCircle,
} from "lucide-react";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { can, type ActiveContext } from "@/domain/identity/types";
import {
  type OperationalTask,
  type TaskPriority,
  type TaskType,
} from "@/domain/workflows/types";
import {
  completeTask,
  deriveTaskDueStatus,
  listTasks,
  startTask,
  cancelTask,
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

/* --------------------------------------------------------------------- screen */

const DEMO_USER = "user_admin";

export default function MyWorkPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);

  const view = pageStatusFor(status, context);
  const canView = can("task.view", permissions);
  const [reloadTick, setReloadTick] = useState(0);

  const allTasks = useMemo(() => listTasks(), [reloadTick]);

  const overdue = useMemo(
    () => allTasks.filter((t) => deriveTaskDueStatus(t) === "OVERDUE"),
    [allTasks],
  );

  const inProgress = useMemo(
    () => allTasks.filter((t) => t.status === "IN_PROGRESS"),
    [allTasks],
  );

  const blocked = useMemo(
    () => allTasks.filter((t) => t.status === "BLOCKED"),
    [allTasks],
  );

  const dueToday = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return allTasks.filter(
      (t) => t.dueAt?.slice(0, 10) === today && deriveTaskDueStatus(t) !== "OVERDUE",
    );
  }, [allTasks]);

  const recentlyCompleted = useMemo(() => {
    return allTasks
      .filter((t) => t.status === "COMPLETED" && t.completedAt)
      .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())
      .slice(0, 5);
  }, [allTasks]);

  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  const handleStart = useCallback(
    (id: string) => {
      startTask(id, DEMO_USER);
      reload();
    },
    [reload],
  );

  const handleComplete = useCallback(
    (id: string) => {
      completeTask(id, DEMO_USER);
      reload();
    },
    [reload],
  );

  const handleCancel = useCallback(
    (id: string) => {
      cancelTask(id, DEMO_USER);
      reload();
    },
    [reload],
  );

  /* ---- view gates ---- */

  if (view === "bootstrapping") return <LoadingBlock />;
  if (view === "unauthenticated") {
    return <AccessDenied capability="task.view" hint="Sign in to see your work." />;
  }
  if (view === "no_property") {
    return <AccessDenied capability="task.view" hint="Choose a property to see your tasks." />;
  }
  if (!canView) {
    return <AccessDenied capability="task.view" permission="task.view" hint="You need task.view to see this screen." />;
  }

  const totalOpen = overdue.length + inProgress.length + dueToday.length + blocked.length;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold text-ink">My Work</h1>
        <p className="mt-1 text-sm text-muted">
          {totalOpen > 0
            ? `${totalOpen} active item${totalOpen === 1 ? "" : "s"} need your attention.`
            : "All caught up — nothing pending."}
        </p>
      </div>

      {overdue.length > 0 && (
        <Section
          icon={<AlertCircle className="size-4 text-danger" />}
          title="Overdue"
          count={overdue.length}
          tone="danger"
        >
          {overdue.map((t) => (
            <CompactTask
              key={t.id}
              task={t}
              onStart={handleStart}
              onComplete={handleComplete}
              onCancel={handleCancel}
            />
          ))}
        </Section>
      )}

      {inProgress.length > 0 && (
        <Section
          icon={<Play className="size-4 text-brand-600" />}
          title="In progress"
          count={inProgress.length}
          tone="brand"
        >
          {inProgress.map((t) => (
            <CompactTask
              key={t.id}
              task={t}
              onStart={handleStart}
              onComplete={handleComplete}
              onCancel={handleCancel}
            />
          ))}
        </Section>
      )}

      {blocked.length > 0 && (
        <Section
          icon={<XCircle className="size-4 text-warning" />}
          title="Blocked"
          count={blocked.length}
          tone="warning"
        >
          {blocked.map((t) => (
            <CompactTask
              key={t.id}
              task={t}
              onStart={handleStart}
              onComplete={handleComplete}
              onCancel={handleCancel}
            />
          ))}
        </Section>
      )}

      {dueToday.length > 0 && (
        <Section
          icon={<Clock className="size-4 text-muted" />}
          title="Due today"
          count={dueToday.length}
          tone="neutral"
        >
          {dueToday.map((t) => (
            <CompactTask
              key={t.id}
              task={t}
              onStart={handleStart}
              onComplete={handleComplete}
              onCancel={handleCancel}
            />
          ))}
        </Section>
      )}

      {recentlyCompleted.length > 0 && (
        <Section
          icon={<CheckCircle2 className="size-4 text-success" />}
          title="Recently completed"
          count={recentlyCompleted.length}
          tone="success"
        >
          {recentlyCompleted.map((t) => (
            <CompactTask
              key={t.id}
              task={t}
              onStart={handleStart}
              onComplete={handleComplete}
              onCancel={handleCancel}
            />
          ))}
        </Section>
      )}

      {totalOpen === 0 && recentlyCompleted.length === 0 && (
        <EmptyState
          icon={<ListTodo />}
          title="No tasks assigned"
          description="When tasks are assigned to you, they will appear here grouped by urgency."
        />
      )}
    </div>
  );
}

/* --------------------------------------------------------------- section */

function Section({
  icon,
  title,
  count,
  tone,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  tone: "danger" | "warning" | "brand" | "neutral" | "success";
  children: React.ReactNode;
}) {
  const borderTone: Record<string, string> = {
    danger: "border-danger/20",
    warning: "border-warning/20",
    brand: "border-brand-200",
    neutral: "border-line",
    success: "border-success/20",
  };

  return (
    <Card className={borderTone[tone]}>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <Badge>{count}</Badge>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </Card>
  );
}

/* --------------------------------------------------------------- compact task */

function CompactTask({
  task,
  onStart,
  onComplete,
  onCancel,
}: {
  task: OperationalTask;
  onStart: (id: string) => void;
  onComplete: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const isActive = task.status !== "COMPLETED" && task.status !== "CANCELLED";

  return (
    <div className="flex items-start justify-between gap-2 rounded-md border border-line bg-surface-sunken px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={PRIORITY_TONE[task.priority]} className="!text-[10px]">
            {PRIORITY_LABELS[task.priority]}
          </Badge>
          <span className="text-[10px] text-muted">{TYPE_LABELS[task.taskType]}</span>
        </div>
        <p className="mt-1 text-sm font-medium text-ink truncate">{task.title}</p>
        {task.blockReason && (
          <p className="mt-0.5 text-[11px] text-danger">Blocked: {task.blockReason}</p>
        )}
      </div>
      {isActive && (
        <div className="flex shrink-0 gap-1">
          {(task.status === "PENDING" || task.status === "ASSIGNED") && (
            <button
              onClick={() => onStart(task.id)}
              className="rounded-md bg-brand-50 px-2 py-1 text-[11px] font-medium text-brand-700 hover:bg-brand-100"
            >
              Start
            </button>
          )}
          {task.status === "IN_PROGRESS" && (
            <button
              onClick={() => onComplete(task.id)}
              className="rounded-md bg-success-soft px-2 py-1 text-[11px] font-medium text-success hover:brightness-95"
            >
              Done
            </button>
          )}
          <button
            onClick={() => onCancel(task.id)}
            className="rounded-md px-2 py-1 text-[11px] text-muted hover:text-danger"
          >
            ✕
          </button>
        </div>
      )}
      {task.status === "COMPLETED" && (
        <Badge tone="success" className="shrink-0 !text-[10px]">
          Done
        </Badge>
      )}
    </div>
  );
}
