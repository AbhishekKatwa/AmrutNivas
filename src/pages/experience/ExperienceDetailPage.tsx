/**
 * Experience Detail — single record with recovery actions, timeline, and status transitions.
 */

import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Heart,
  MessageSquare,
  Star,
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
  ServiceRecoveryAction,
  ExperienceRecordStatus,
} from "@/domain/experience/types";
import {
  getExperienceRecord,
  listRecoveryActions,
  updateExperienceRecord,
  resolveExperienceRecord,
  closeExperienceRecord,
  approveRecoveryAction,
  executeRecoveryAction,
  ensureExperienceDemoSeeded,
} from "@/domain/experience/experience-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

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

function recoveryStatusTone(s: string): "success" | "danger" | "warning" | "neutral" {
  if (s === "COMPLETED") return "success";
  if (s === "REJECTED" || s === "CANCELLED") return "danger";
  if (s === "IN_PROGRESS" || s === "APPROVED") return "warning";
  return "neutral";
}

export default function ExperienceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const orgId = context.organizationId as EntityId | null;
  const propId = context.propertyId as EntityId | null;

  const canManage = can("experience.feedback.manage", permissions);
  const canResolve = can("experience.complaint.resolve", permissions);
  const canRecovery = can("experience.recovery.create", permissions);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<ExperienceRecord | null>(null);
  const [actions, setActions] = useState<ServiceRecoveryAction[]>([]);
  const [resolution, setResolution] = useState("");
  const [showResolve, setShowResolve] = useState(false);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || !orgId || !id) return;
    setLoading(true);
    setError(null);
    try {
      if (propId) ensureExperienceDemoSeeded(orgId, propId);
      else ensureExperienceDemoSeeded(orgId, "prop_default" as EntityId);

      const rec = getExperienceRecord(id as EntityId);
      if (rec) {
        setRecord(rec);
        setActions(listRecoveryActions(orgId, rec.id) as ServiceRecoveryAction[]);
      }
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setLoading(false);
    }
  }, [view, orgId, propId, id]);

  const handleResolve = () => {
    if (!record || !resolution.trim()) return;
    try {
      const updated = resolveExperienceRecord(record.id, resolution.trim());
      if (updated) setRecord(updated);
      setShowResolve(false);
      setResolution("");
    } catch (err) {
      setError(toPublicError(err).message);
    }
  };

  const handleClose = () => {
    if (!record) return;
    try {
      const updated = closeExperienceRecord(record.id);
      if (updated) setRecord(updated);
    } catch (err) {
      setError(toPublicError(err).message);
    }
  };

  const handleStatusChange = (newStatus: ExperienceRecordStatus) => {
    if (!record) return;
    try {
      const updated = updateExperienceRecord(record.id, { status: newStatus });
      if (updated) setRecord(updated);
    } catch (err) {
      setError(toPublicError(err).message);
    }
  };

  if (loading) return <LoadingBlock label="Loading record…" />;
  if (error) return <EmptyState icon={<AlertTriangle />} title="Error" description={error} />;
  if (!record) {
    return (
      <EmptyState
        icon={<MessageSquare />}
        title="Record not found"
        description="This experience record does not exist."
      />
    );
  }

  const isOverdue = record.dueAt && new Date(record.dueAt) < new Date() && record.status !== "RESOLVED" && record.status !== "CLOSED";

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div className="flex items-center gap-3">
        <Link to="/experience">
          <Button variant="secondary" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-[#17201B]">{record.title}</h1>
            <Badge tone={statusTone(record.status)}>{record.status.replace(/_/g, " ")}</Badge>
            {isOverdue && <Badge tone="danger">Overdue</Badge>}
          </div>
          <p className="text-sm text-[#66706A]">
            {record.guestName}
            {record.roomNumber && ` · Room ${record.roomNumber}`}
            {" · "}{record.type.replace(/_/g, " ")}
            {" · "}{record.category.replace(/_/g, " ")}
          </p>
        </div>
        <Badge
          tone={record.priority === "CRITICAL" || record.priority === "URGENT" ? "danger" : record.priority === "HIGH" ? "warning" : "neutral"}
        >
          {record.priority}
        </Badge>
      </div>

      {/* Main info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-[#17201B] mb-2">Description</h3>
            <p className="text-sm text-[#66706A]">{record.description}</p>
          </Card>

          {/* Category Ratings */}
          {record.categoryRatings.length > 0 && (
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-[#17201B] mb-2 flex items-center gap-2">
                <Star className="w-4 h-4 text-yellow-500" /> Ratings
              </h3>
              <div className="space-y-2">
                {record.categoryRatings.map((cr) => (
                  <div key={cr.category} className="flex items-center justify-between">
                    <span className="text-sm text-[#17201B]">{cr.category.replace(/_/g, " ")}</span>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`w-4 h-4 ${star <= cr.rating ? "fill-yellow-500 text-yellow-500" : "text-gray-300"}`}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Resolution */}
          {record.resolution && (
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-[#17201B] mb-2 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" /> Resolution
              </h3>
              <p className="text-sm text-[#66706A]">{record.resolution}</p>
              {record.rootCause && (
                <p className="text-xs text-[#66706A] mt-2">Root cause: {record.rootCause}</p>
              )}
            </Card>
          )}

          {/* Recovery Actions */}
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-[#17201B] mb-3">Service Recovery Actions</h3>
            {actions.length === 0 ? (
              <p className="text-xs text-[#66706A] py-2">No recovery actions</p>
            ) : (
              <div className="space-y-2">
                {actions.map((a) => (
                  <div key={a.id} className="p-3 rounded-lg border border-[#E3E7E3]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-[#17201B]">{a.type.replace(/_/g, " ")}</span>
                      <Badge tone={recoveryStatusTone(a.status)}>{a.status.replace(/_/g, " ")}</Badge>
                    </div>
                    <p className="text-xs text-[#66706A]">{a.description}</p>
                    {a.estimatedValue && (
                      <p className="text-xs text-[#66706A] mt-1">Value: ₹{a.estimatedValue.toLocaleString()}</p>
                    )}
                    {a.status === "PROPOSED" && canRecovery && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="mt-2"
                        onClick={() => {
                          const updated = approveRecoveryAction(a.id, "user_current" as EntityId);
                          if (updated) setActions(actions.map((x) => x.id === a.id ? updated : x));
                        }}
                      >
                        Approve
                      </Button>
                    )}
                    {a.status === "APPROVED" && canRecovery && (
                      <Button
                        variant="primary"
                        size="sm"
                        className="mt-2"
                        onClick={() => {
                          const updated = executeRecoveryAction(a.id, "user_current" as EntityId, "Executed successfully");
                          if (updated) setActions(actions.map((x) => x.id === a.id ? updated : x));
                        }}
                      >
                        Execute
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Details */}
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-[#17201B] mb-3">Details</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#66706A]">Source</span>
                <span className="text-[#17201B]">{record.source.replace(/_/g, " ")}</span>
              </div>
              {record.assignedTeam && (
                <div className="flex justify-between">
                  <span className="text-[#66706A]">Team</span>
                  <span className="text-[#17201B]">{record.assignedTeam}</span>
                </div>
              )}
              {record.dueAt && (
                <div className="flex justify-between">
                  <span className="text-[#66706A]">Due</span>
                  <span className={isOverdue ? "text-red-600" : "text-[#17201B]"}>
                    {new Date(record.dueAt).toLocaleDateString()}
                  </span>
                </div>
              )}
              {record.resolvedAt && (
                <div className="flex justify-between">
                  <span className="text-[#66706A]">Resolved</span>
                  <span className="text-green-600">{new Date(record.resolvedAt).toLocaleDateString()}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-[#66706A]">Created</span>
                <span className="text-[#17201B]">{new Date(record.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </Card>

          {/* Sentiment */}
          {record.sentiment && (
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-[#17201B] mb-2 flex items-center gap-2">
                <Heart className={`w-4 h-4 ${record.sentiment.label === "POSITIVE" ? "text-green-500 fill-green-500" : record.sentiment.label === "NEGATIVE" ? "text-red-500 fill-red-500" : "text-gray-400"}`} />
                Sentiment
              </h3>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#66706A]">Label</span>
                  <Badge tone={record.sentiment.label === "POSITIVE" ? "success" : record.sentiment.label === "NEGATIVE" ? "danger" : "neutral"}>
                    {record.sentiment.label}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#66706A]">Score</span>
                  <span className="text-[#17201B]">{record.sentiment.score}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#66706A]">Confidence</span>
                  <span className="text-[#17201B]">{Math.round(record.sentiment.confidence * 100)}%</span>
                </div>
              </div>
            </Card>
          )}

          {/* Actions */}
          {(canManage || canResolve) && record.status !== "CLOSED" && (
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-[#17201B] mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#66706A]" /> Actions
              </h3>
              <div className="space-y-2">
                {record.status === "OPEN" && canManage && (
                  <Button variant="secondary" size="sm" className="w-full" onClick={() => handleStatusChange("IN_REVIEW")}>
                    Mark In Review
                  </Button>
                )}
                {record.status === "IN_REVIEW" && canManage && (
                  <Button variant="secondary" size="sm" className="w-full" onClick={() => handleStatusChange("ACTION_REQUIRED")}>
                    Mark Action Required
                  </Button>
                )}
                {(record.status === "OPEN" || record.status === "IN_REVIEW" || record.status === "ACTION_REQUIRED") && canResolve && (
                  <>
                    <Button variant="primary" size="sm" className="w-full" onClick={() => setShowResolve(true)}>
                      Resolve
                    </Button>
                  </>
                )}
                {record.status === "RESOLVED" && canManage && (
                  <Button variant="secondary" size="sm" className="w-full" onClick={handleClose}>
                    Close
                  </Button>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Resolve dialog */}
      {showResolve && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <Card className="w-full max-w-md p-6 mx-4">
            <h2 className="text-lg font-semibold text-[#17201B] mb-4">Resolve Record</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-[#66706A]">Resolution</label>
                <textarea
                  className="mt-1 w-full border border-[#E3E7E3] rounded-lg px-3 py-2 text-sm h-24 resize-none"
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  placeholder="Describe how this was resolved…"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="secondary" size="sm" onClick={() => setShowResolve(false)}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={handleResolve} disabled={!resolution.trim()}>
                Resolve
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
