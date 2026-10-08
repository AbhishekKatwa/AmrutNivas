/**
 * Experience Complaints — filtered list of complaint-type experience records.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Clock,
  Filter,
  Megaphone,
  Plus,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import type { EntityId } from "@/domain/identity/types";
import { can, type ActiveContext } from "@/domain/identity/types";
import type {
  ExperienceRecord,
  ExperienceRecordStatus,
  ExperienceFeedbackCategory,
  ExperienceComplaintPriority,
} from "@/domain/experience/types";
import {
  EXPERIENCE_COMPLAINT_STATUSES,
  EXPERIENCE_COMPLAINT_PRIORITIES,
  EXPERIENCE_FEEDBACK_CATEGORIES,
} from "@/domain/experience/types";
import {
  listExperienceRecords,
  createExperienceRecord,
  analyzeSentiment,
  computeDueAt,
  ensureExperienceDemoSeeded,
} from "@/domain/experience/experience-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";
import { Link } from "react-router-dom";

type View = "bootstrapping" | "unconfigured" | "unauthenticated" | "no_organization" | "scoped";

function pageStatusFor(status: ContextStatus, context: ActiveContext): View {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") return context.organizationId !== null ? "scoped" : "no_organization";
  return "bootstrapping";
}

function statusTone(s: ExperienceRecordStatus): "success" | "danger" | "warning" | "neutral" {
  if (s === "RESOLVED" || s === "CLOSED") return "success";
  if (s === "ACTION_REQUIRED") return "danger";
  if (s === "IN_REVIEW") return "warning";
  return "neutral";
}

function priorityTone(p: ExperienceComplaintPriority): "success" | "danger" | "warning" | "neutral" {
  if (p === "CRITICAL" || p === "URGENT") return "danger";
  if (p === "HIGH") return "warning";
  return "neutral";
}

export default function ExperienceComplaintsPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const orgId = context.organizationId as EntityId | null;
  const propId = context.propertyId as EntityId | null;

  const canView = can("experience.complaint.view", permissions);
  const canCreate = can("experience.complaint.create", permissions);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<ExperienceRecord[]>([]);
  const [reloadTick, setReloadTick] = useState(0);

  const [statusFilter, setStatusFilter] = useState<ExperienceRecordStatus | "">("");
  const [priorityFilter, setPriorityFilter] = useState<ExperienceComplaintPriority | "">("");
  const [categoryFilter, setCategoryFilter] = useState<ExperienceFeedbackCategory | "">("");
  const [showCreate, setShowCreate] = useState(false);

  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || !orgId || !canView) return;
    setLoading(true);
    setError(null);
    try {
      if (propId) ensureExperienceDemoSeeded(orgId, propId);
      else ensureExperienceDemoSeeded(orgId, "prop_default" as EntityId);

      const all = listExperienceRecords(orgId);
      const complaints = all.filter((r) => {
        if (r.type !== "COMPLAINT" && r.type !== "INCIDENT") return false;
        if (statusFilter && r.status !== statusFilter) return false;
        if (priorityFilter && r.priority !== priorityFilter) return false;
        if (categoryFilter && r.category !== categoryFilter) return false;
        return true;
      });
      setRecords(complaints as ExperienceRecord[]);
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setLoading(false);
    }
  }, [view, orgId, propId, canView, statusFilter, priorityFilter, categoryFilter, reloadTick]);

  const filtered = useMemo(() => records, [records]);

  if (view === "bootstrapping" || loading) {
    return <LoadingBlock label="Loading complaints…" />;
  }

  if (!canView) {
    return (
      <EmptyState
        icon={<Megaphone />}
        title="Complaints"
        description="You don't have permission to view complaints."
      />
    );
  }

  if (error) {
    return <EmptyState icon={<AlertTriangle />} title="Error" description={error} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#17201B]">Complaints</h1>
          <p className="text-sm text-[#66706A] mt-1">
            Guest complaints and incidents requiring resolution
          </p>
        </div>
        {canCreate && (
          <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-1" /> New Complaint
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-3">
          <Filter className="w-4 h-4 text-[#66706A]" />
          <select
            className="text-sm border border-[#E3E7E3] rounded-lg px-3 py-1.5 bg-white text-[#17201B]"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ExperienceRecordStatus | "")}
          >
            <option value="">All statuses</option>
            {EXPERIENCE_COMPLAINT_STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
          <select
            className="text-sm border border-[#E3E7E3] rounded-lg px-3 py-1.5 bg-white text-[#17201B]"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as ExperienceComplaintPriority | "")}
          >
            <option value="">All priorities</option>
            {EXPERIENCE_COMPLAINT_PRIORITIES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select
            className="text-sm border border-[#E3E7E3] rounded-lg px-3 py-1.5 bg-white text-[#17201B]"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as ExperienceFeedbackCategory | "")}
          >
            <option value="">All categories</option>
            {EXPERIENCE_FEEDBACK_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
            ))}
          </select>
          {(statusFilter || priorityFilter || categoryFilter) && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setStatusFilter("");
                setPriorityFilter("");
                setCategoryFilter("");
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </Card>

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Megaphone />}
          title="No complaints"
          description="Complaints will appear here when guests report issues."
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const isOverdue = r.dueAt && new Date(r.dueAt) < new Date() && r.status !== "RESOLVED" && r.status !== "CLOSED";
            return (
              <Link key={r.id} to={`/experience/${r.id}`}>
                <Card className="p-4 hover:border-[#C9972E] transition-colors cursor-pointer">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-[#17201B] truncate">
                          {r.title}
                        </span>
                        <Badge tone={statusTone(r.status)}>
                          {r.status.replace(/_/g, " ")}
                        </Badge>
                        <Badge tone={priorityTone(r.priority)}>
                          {r.priority}
                        </Badge>
                      </div>
                      <p className="text-xs text-[#66706A] truncate">{r.description}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs text-[#66706A]">{r.guestName}</span>
                        {r.roomNumber && (
                          <span className="text-xs text-[#66706A]">Room {r.roomNumber}</span>
                        )}
                        <span className="text-xs text-[#66706A]">{r.category.replace(/_/g, " ")}</span>
                        {r.assignedTeam && (
                          <span className="text-xs text-blue-600">{r.assignedTeam}</span>
                        )}
                        {isOverdue && (
                          <span className="text-xs text-red-600 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Overdue
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateComplaintDialog
          orgId={orgId!}
          propId={propId ?? ("prop_default" as EntityId)}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

function CreateComplaintDialog({
  orgId,
  propId,
  onClose,
  onCreated,
}: {
  orgId: EntityId;
  propId: EntityId;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ExperienceFeedbackCategory>("ROOM");
  const [priority, setPriority] = useState<ExperienceComplaintPriority>("NORMAL");
  const [guestName, setGuestName] = useState("");
  const [roomNumber, setRoomNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!title.trim() || !guestName.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const sentiment = analyzeSentiment(description);
      const createdAt = new Date().toISOString();
      createExperienceRecord({
        organizationId: orgId,
        propertyId: propId,
        guestName: guestName.trim(),
        roomNumber: roomNumber.trim() || undefined,
        type: "COMPLAINT",
        status: "OPEN",
        priority,
        category,
        title: title.trim(),
        description: description.trim(),
        sentiment,
        categoryRatings: [],
        source: "FRONT_DESK",
        dueAt: computeDueAt(createdAt, priority),
        followUpNeeded: true,
        followUpCompleted: false,
        createdBy: "user_current" as EntityId,
      });
      onCreated();
    } catch (e) {
      setErr(toPublicError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <Card className="w-full max-w-lg p-6 mx-4">
        <h2 className="text-lg font-semibold text-[#17201B] mb-4">New Complaint</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-[#66706A]">Guest Name</label>
            <input
              className="mt-1 w-full border border-[#E3E7E3] rounded-lg px-3 py-2 text-sm"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[#66706A]">Room Number</label>
            <input
              className="mt-1 w-full border border-[#E3E7E3] rounded-lg px-3 py-2 text-sm"
              value={roomNumber}
              onChange={(e) => setRoomNumber(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[#66706A]">Title</label>
            <input
              className="mt-1 w-full border border-[#E3E7E3] rounded-lg px-3 py-2 text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[#66706A]">Description</label>
            <textarea
              className="mt-1 w-full border border-[#E3E7E3] rounded-lg px-3 py-2 text-sm h-20 resize-none"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-[#66706A]">Category</label>
              <select
                className="mt-1 w-full border border-[#E3E7E3] rounded-lg px-3 py-2 text-sm bg-white"
                value={category}
                onChange={(e) => setCategory(e.target.value as ExperienceFeedbackCategory)}
              >
                {EXPERIENCE_FEEDBACK_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-[#66706A]">Priority</label>
              <select
                className="mt-1 w-full border border-[#E3E7E3] rounded-lg px-3 py-2 text-sm bg-white"
                value={priority}
                onChange={(e) => setPriority(e.target.value as ExperienceComplaintPriority)}
              >
                {EXPERIENCE_COMPLAINT_PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleSubmit} disabled={busy || !title.trim() || !guestName.trim()}>
            {busy ? "Creating…" : "Create"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
