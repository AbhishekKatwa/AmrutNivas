/**
 * Approval Center — unified approval queue.
 *
 * Tabs: Pending, Approved, Rejected, Changes requested. Each row shows the approval
 * type, amount (if any), who requested it, and the action buttons available to the
 * current approver. Actions: approve, reject (with reason), request changes.
 */

import { useCallback, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { LoadingBlock } from "@/components/ui/Spinner";
import { SelectInput, type SelectOption } from "@/components/ui/SelectInput";
import { Textarea } from "@/components/ui/Textarea";
import { can, type ActiveContext } from "@/domain/identity/types";
import {
  APPROVAL_TYPES,
  type ApprovalRequest,
  type ApprovalStatus,
  type ApprovalType,
} from "@/domain/workflows/types";
import {
  approveRequest,
  listApprovals,
  rejectRequest,
  requestChanges,
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

const TYPE_LABELS: Record<ApprovalType, string> = {
  PURCHASE: "Purchase",
  EXPENSE: "Expense",
  DISCOUNT: "Discount",
  REFUND: "Refund",
  STOCK_ADJUSTMENT: "Stock adjustment",
  EVENT_QUOTATION: "Event quotation",
  LEAVE: "Leave",
  ATTENDANCE_CORRECTION: "Attendance correction",
  BACKDATED_TRANSACTION: "Backdated transaction",
  CREDIT_NOTE: "Credit note",
  OTHER: "Other",
};

const STATUS_LABELS: Record<ApprovalStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CHANGES_REQUESTED: "Changes requested",
  DELEGATED: "Delegated",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
};

const STATUS_TONE: Record<ApprovalStatus, "neutral" | "muted" | "brand" | "warning" | "danger" | "success"> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  CHANGES_REQUESTED: "brand",
  DELEGATED: "neutral",
  EXPIRED: "muted",
  CANCELLED: "muted",
};

type TabKey = "pending" | "approved" | "rejected" | "changes" | "all";

const TAB_LABELS: Record<TabKey, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  changes: "Changes requested",
  all: "All",
};

const TAB_STATUS_MAP: Record<Exclude<TabKey, "all">, ApprovalStatus> = {
  pending: "PENDING",
  approved: "APPROVED",
  rejected: "REJECTED",
  changes: "CHANGES_REQUESTED",
};

/* --------------------------------------------------------------- action mode */

type ActionMode =
  | { kind: "approve"; approval: ApprovalRequest }
  | { kind: "reject"; approval: ApprovalRequest }
  | { kind: "changes"; approval: ApprovalRequest };

/* --------------------------------------------------------------------- screen */

const DEMO_USER = "user_admin";
const DEMO_USER_NAME = "Admin User";

export default function ApprovalCenterPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);

  const view = pageStatusFor(status, context);
  const canView = can("approval.view", permissions);
  const canDecide = can("approval.approve", permissions);

  const [tab, setTab] = useState<TabKey>("pending");
  const [typeFilter, setTypeFilter] = useState<ApprovalType | "">("");
  const [reloadTick, setReloadTick] = useState(0);
  const [actionMode, setActionMode] = useState<ActionMode | null>(null);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const approvals = useMemo(() => {
    const filters: any = {};
    if (tab !== "all") {
      filters.status = [TAB_STATUS_MAP[tab as Exclude<TabKey, "all">]];
    }
    if (typeFilter) filters.approvalType = [typeFilter];
    return listApprovals(filters);
  }, [tab, typeFilter, reloadTick]);

  const pendingCount = useMemo(
    () => listApprovals({ status: ["PENDING"] }).length,
    [reloadTick],
  );

  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  const handleAction = useCallback(() => {
    if (!actionMode) return;
    if (actionMode.kind === "approve") {
      approveRequest(actionMode.approval.id, {
        decidedBy: DEMO_USER,
        decidedByName: DEMO_USER_NAME,
        reason: reason.trim() || undefined,
      });
    } else if (actionMode.kind === "reject") {
      if (!reason.trim()) {
        setActionError("Provide a reason for rejection.");
        return;
      }
      rejectRequest(actionMode.approval.id, {
        decidedBy: DEMO_USER,
        decidedByName: DEMO_USER_NAME,
        reason: reason.trim(),
      });
    } else {
      if (!reason.trim()) {
        setActionError("Describe the changes needed.");
        return;
      }
      requestChanges(actionMode.approval.id, {
        decidedBy: DEMO_USER,
        decidedByName: DEMO_USER_NAME,
        reason: reason.trim(),
      });
    }
    setActionMode(null);
    setReason("");
    setActionError(null);
    reload();
  }, [actionMode, reason, reload]);

  /* ---- view gates ---- */

  if (view === "bootstrapping") return <LoadingBlock />;
  if (view === "unauthenticated") {
    return <AccessDenied capability="approval.view" hint="Sign in to view approvals." />;
  }
  if (view === "no_property") {
    return <AccessDenied capability="approval.view" hint="Choose a property to see approvals." />;
  }
  if (!canView) {
    return <AccessDenied capability="approval.view" permission="approval.view" hint="You need approval.view to see this screen." />;
  }

  const typeOptions: SelectOption<ApprovalType | "">[] = [
    { value: "", label: "All types" },
    ...APPROVAL_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] })),
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">Approval Center</h1>
          <p className="mt-1 text-sm text-muted">
            {pendingCount > 0
              ? `${pendingCount} approval${pendingCount === 1 ? "" : "s"} waiting for your decision.`
              : "No pending approvals."}
          </p>
        </div>
      </div>

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
            {key === "pending" && pendingCount > 0 && (
              <Badge tone="warning" className="ml-1.5 !text-[10px]">
                {pendingCount}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {/* filter */}
      <div className="flex items-center gap-2">
        <SelectInput
          value={typeFilter}
          onChange={(v) => setTypeFilter(v as ApprovalType | "")}
          options={typeOptions}
          className="!w-48"
        />
      </div>

      {actionError && (
        <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
          {actionError}
        </div>
      )}

      {/* list */}
      {approvals.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck />}
          title="No approvals"
          description={
            tab === "pending"
              ? "No pending approvals at this time."
              : `No ${TAB_LABELS[tab].toLowerCase()} approvals match the current filters.`
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {approvals.map((a) => (
            <ApprovalCard
              key={a.id}
              approval={a}
              canDecide={canDecide}
              onApprove={() => setActionMode({ kind: "approve", approval: a })}
              onReject={() => setActionMode({ kind: "reject", approval: a })}
              onChanges={() => setActionMode({ kind: "changes", approval: a })}
            />
          ))}
        </div>
      )}

      {/* action dialog */}
      {actionMode && (
        <Dialog
          open
          onClose={() => {
            setActionMode(null);
            setReason("");
            setActionError(null);
          }}
          title={
            actionMode.kind === "approve"
              ? "Approve request"
              : actionMode.kind === "reject"
                ? "Reject request"
                : "Request changes"
          }
          description={
            actionMode.kind === "approve"
              ? `Approve "${actionMode.approval.title}"?`
              : actionMode.kind === "reject"
                ? `Reject "${actionMode.approval.title}"? A reason is required.`
                : `Request changes to "${actionMode.approval.title}"? Describe what needs to change.`
          }
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setActionMode(null);
                  setReason("");
                  setActionError(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAction}
                className={
                  actionMode.kind === "reject"
                    ? "!bg-danger hover:!bg-danger/90"
                    : actionMode.kind === "changes"
                      ? "!bg-warning hover:!bg-warning/90"
                      : ""
                }
              >
                {actionMode.kind === "approve"
                  ? "Approve"
                  : actionMode.kind === "reject"
                    ? "Reject"
                    : "Request changes"}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            {actionMode.approval.amount !== undefined && (
              <div className="rounded-md bg-surface-sunken px-3 py-2 text-sm">
                <span className="text-muted">Amount: </span>
                <span className="font-semibold text-ink">
                  ₹{actionMode.approval.amount.toLocaleString("en-IN")}
                </span>
              </div>
            )}
            {(actionMode.kind === "reject" || actionMode.kind === "changes") && (
              <Field
                label={actionMode.kind === "reject" ? "Reason for rejection" : "Changes needed"}
                error={actionError}
              >
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder={
                    actionMode.kind === "reject"
                      ? "Explain why this is being rejected…"
                      : "Describe what needs to change…"
                  }
                />
              </Field>
            )}
            {actionMode.kind === "approve" && (
              <Field label="Note (optional)">
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="Add a note…"
                />
              </Field>
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- approval card */

function ApprovalCard({
  approval,
  canDecide,
  onApprove,
  onReject,
  onChanges,
}: {
  approval: ApprovalRequest;
  canDecide: boolean;
  onApprove: () => void;
  onReject: () => void;
  onChanges: () => void;
}) {
  const isPending = approval.status === "PENDING";

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={STATUS_TONE[approval.status]}>{STATUS_LABELS[approval.status]}</Badge>
            <Badge>{TYPE_LABELS[approval.approvalType]}</Badge>
            {approval.amount !== undefined && (
              <Badge tone="brand">₹{approval.amount.toLocaleString("en-IN")}</Badge>
            )}
          </div>
          <h3 className="mt-1.5 text-sm font-semibold text-ink">{approval.title}</h3>
          {approval.description && (
            <p className="mt-0.5 text-xs leading-relaxed text-muted line-clamp-2">
              {approval.description}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
            <span>Requested by: {approval.requestedByName}</span>
            <span>
              {new Date(approval.requestedAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {approval.assignedToUserName && (
              <span>Approver: {approval.assignedToUserName}</span>
            )}
            {approval.sourceLabel && <span>Ref: {approval.sourceLabel}</span>}
          </div>
          {approval.decisionReason && (
            <p className="mt-1 text-[11px] text-muted italic">
              Decision: {approval.decisionReason}
            </p>
          )}
        </div>
      </div>

      {isPending && canDecide && (
        <div className="flex flex-wrap gap-1.5 border-t border-line pt-2">
          <button
            onClick={onApprove}
            className="inline-flex items-center gap-1 rounded-md bg-success-soft px-2.5 py-1 text-xs font-medium text-success hover:brightness-95"
          >
            <CheckCircle2 className="size-3" /> Approve
          </button>
          <button
            onClick={onReject}
            className="inline-flex items-center gap-1 rounded-md bg-danger-soft px-2.5 py-1 text-xs font-medium text-danger hover:brightness-95"
          >
            <XCircle className="size-3" /> Reject
          </button>
          <button
            onClick={onChanges}
            className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100"
          >
            <Clock className="size-3" /> Request changes
          </button>
        </div>
      )}
    </div>
  );
}
