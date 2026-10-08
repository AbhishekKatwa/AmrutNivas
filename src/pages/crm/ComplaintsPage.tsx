/**
 * CRM Complaints — tracked customer issues with resolution workflow.
 *
 * Shows complaints with priority, status, assignment and resolution. Filterable
 * by status. Writes go through doors (create complaint, update status/assignment/resolution).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CircleSlash, LogIn, Plus } from "lucide-react";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { LoadingBlock } from "@/components/ui/Spinner";
import { SelectInput } from "@/components/ui/SelectInput";
import { Textarea } from "@/components/ui/Textarea";
import { can, type ActiveContext } from "@/domain/identity/types";
import type { Complaint, ComplaintPriority, ComplaintStatus, FeedbackCategory } from "@/domain/crm/types";
import { COMPLAINT_PRIORITIES, COMPLAINT_STATUSES, FEEDBACK_CATEGORIES } from "@/domain/crm/types";
import { listComplaints, createComplaint, updateComplaint, type CrmScope } from "@/domain/crm/crm-service";
import { listGuests } from "@/domain/hotel/guest-service";
import type { Guest } from "@/domain/hotel/types";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

type ComplaintsView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_organization"
  | "scoped";

function pageStatusFor(status: ContextStatus, context: ActiveContext): ComplaintsView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null ? "scoped" : "no_organization";
  }
  return "bootstrapping";
}

type ComplaintDraft = {
  customerId: string;
  category: FeedbackCategory;
  priority: ComplaintPriority;
  description: string;
};

function newDraft(): ComplaintDraft {
  return {
    customerId: "",
    category: "OTHER",
    priority: "NORMAL",
    description: "",
  };
}

export default function ComplaintsPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const scope = useMemo<CrmScope | null>(
    () => (context.organizationId !== null ? { organizationId: context.organizationId } : null),
    [context.organizationId],
  );

  const canView = can("crm.complaint.view", permissions);
  const canCreate = can("crm.complaint.create", permissions);
  const canManage = can("crm.complaint.manage", permissions);

  const [complaints, setComplaints] = useState<Complaint[] | null>(null);
  const [customers, setCustomers] = useState<Guest[]>([]);
  const [statusFilter, setStatusFilter] = useState<ComplaintStatus | "">("");
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<ComplaintDraft>(newDraft);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || scope === null || !canView) return;
    let ignore = false;
    setComplaints(null);
    setError(null);

    const opts = statusFilter ? { status: statusFilter } : {};
    Promise.all([
      listComplaints(scope, opts),
      listGuests(scope).catch(() => []),
    ])
      .then(([comps, guests]) => {
        if (ignore) return;
        setComplaints(comps);
        setCustomers(guests);
      })
      .catch((err) => {
        if (!ignore) setError(toPublicError(err).message);
      });

    return () => {
      ignore = true;
    };
  }, [view, scope, canView, statusFilter, reloadTick]);

  const customerNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of customers) {
      map.set(c.id, `${c.firstName} ${c.lastName}`);
    }
    return map;
  }, [customers]);

  const customerOptions = useMemo(
    () => [
      { value: "", label: "No customer" },
      ...customers.map((c) => ({
        value: c.id,
        label: `${c.firstName} ${c.lastName}`,
      })),
    ],
    [customers],
  );

  const categoryOptions = useMemo(
    () => FEEDBACK_CATEGORIES.map((c) => ({ value: c, label: c.charAt(0) + c.slice(1).toLowerCase() })),
    [],
  );

  const priorityOptions = useMemo(
    () => COMPLAINT_PRIORITIES.map((p) => ({ value: p, label: p.charAt(0) + p.slice(1).toLowerCase() })),
    [],
  );

  const statusOptions = useMemo(
    () => [
      { value: "", label: "All statuses" },
      ...COMPLAINT_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, " ") })),
    ],
    [],
  );

  const handleCreate = async () => {
    if (scope === null || draft.description.trim() === "") return;
    setBusy(true);
    try {
      await createComplaint(scope, {
        customerId: draft.customerId || null,
        category: draft.category,
        priority: draft.priority,
        description: draft.description.trim(),
      });
      setShowCreate(false);
      setDraft(newDraft());
      setActionError(null);
      reload();
    } catch (err) {
      setActionError(toPublicError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const handleStatusChange = async (complaintId: string, newStatus: ComplaintStatus) => {
    if (scope === null) return;
    try {
      await updateComplaint(scope, complaintId, { status: newStatus });
      setActionError(null);
      reload();
    } catch (err) {
      setActionError(toPublicError(err).message);
    }
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          <AlertTriangle className="size-5 shrink-0 text-brand-600" aria-hidden />
          Complaints
        </h2>
        <p className="mt-1 text-sm text-muted">
          Tracked customer issues with priority, assignment and resolution workflow.
        </p>
      </header>

      {view === "bootstrapping" && <LoadingBlock label="Loading your workspace…" />}

      {view === "unconfigured" && (
        <EmptyState icon={<CircleSlash aria-hidden />} title="Backend not configured" description="This build has no backend configured." />
      )}

      {view === "unauthenticated" && (
        <EmptyState icon={<LogIn aria-hidden />} title="Sign in to view complaints" description="There is no active session for this build to read a tenant from." />
      )}

      {view === "no_organization" && (
        <EmptyState icon={<AlertTriangle aria-hidden />} title="Choose an organization first" description="Complaints belong to an organization." />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied capability="view complaints" permission="crm.complaint.view" />
      )}

      {view === "scoped" && scope !== null && canView && (
        <>
          {error !== null && (
            <p role="alert" className="rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}
          {actionError !== null && (
            <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger">
              <span>{actionError}</span>
              <Button size="sm" variant="ghost" onClick={() => setActionError(null)}>Dismiss</Button>
            </div>
          )}

          <Card
            actions={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <SelectInput
                  options={statusOptions}
                  value={statusFilter}
                  onChange={(v) => setStatusFilter(v as ComplaintStatus | "")}
                />
                {canCreate && (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Plus className="size-4" aria-hidden />}
                    onClick={() => setShowCreate(true)}
                  >
                    New complaint
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={reload}>Reload</Button>
              </div>
            }
          >
            <p className="text-xs text-muted">
              {complaints === null ? "Loading…" : `${complaints.length} complaint${complaints.length === 1 ? "" : "s"}`}
            </p>
          </Card>

          {complaints === null ? (
            <LoadingBlock label="Reading complaints…" />
          ) : complaints.length === 0 ? (
            <EmptyState
              icon={<AlertTriangle aria-hidden />}
              title="No complaints"
              description="Customer complaints will appear here."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {complaints.map((c) => (
                <Card key={c.id} padded={false}>
                  <div className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:px-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">
                          {c.customerId ? customerNameMap.get(c.customerId) ?? "Unknown customer" : "Walk-in"}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          {new Date(c.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          tone={
                            c.priority === "URGENT"
                              ? "danger"
                              : c.priority === "HIGH"
                                ? "warning"
                                : "neutral"
                          }
                        >
                          {c.priority}
                        </Badge>
                        <Badge tone="brand">{c.category}</Badge>
                        <Badge
                          tone={
                            c.status === "RESOLVED" || c.status === "CLOSED"
                              ? "success"
                              : "neutral"
                          }
                        >
                          {c.status}
                        </Badge>
                      </div>
                    </div>

                    <p className="text-sm text-ink">{c.description}</p>

                    {c.resolution && (
                      <div className="rounded-lg bg-surface-sunken px-3 py-2 text-sm">
                        <p className="text-xs font-medium text-muted">Resolution</p>
                        <p className="text-ink">{c.resolution}</p>
                      </div>
                    )}

                    {canManage && c.status !== "CLOSED" && (
                      <div className="flex flex-wrap items-center gap-2">
                        {c.status === "OPEN" && (
                          <Button size="sm" variant="ghost" onClick={() => handleStatusChange(c.id, "ASSIGNED")}>
                            Assign
                          </Button>
                        )}
                        {c.status === "ASSIGNED" && (
                          <Button size="sm" variant="ghost" onClick={() => handleStatusChange(c.id, "IN_PROGRESS")}>
                            Start work
                          </Button>
                        )}
                        {(c.status === "OPEN" || c.status === "ASSIGNED" || c.status === "IN_PROGRESS") && (
                          <Button size="sm" variant="ghost" onClick={() => handleStatusChange(c.id, "RESOLVED")}>
                            Resolve
                          </Button>
                        )}
                        {c.status === "RESOLVED" && (
                          <Button size="sm" variant="ghost" onClick={() => handleStatusChange(c.id, "CLOSED")}>
                            Close
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {showCreate && scope !== null && (
        <Dialog
          open
          onClose={() => setShowCreate(false)}
          side="right"
          title="New complaint"
          description="Record a customer complaint with priority and category."
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowCreate(false)} disabled={busy}>Cancel</Button>
              <Button variant="primary" onClick={() => void handleCreate()} disabled={busy}>
                {busy ? "Saving…" : "Create complaint"}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <Field label="Customer">
              <SelectInput
                options={customerOptions}
                value={draft.customerId}
                disabled={busy}
                onChange={(v) => setDraft({ ...draft, customerId: v })}
              />
            </Field>
            <Field label="Category">
              <SelectInput
                options={categoryOptions}
                value={draft.category}
                disabled={busy}
                onChange={(v) => setDraft({ ...draft, category: v as FeedbackCategory })}
              />
            </Field>
            <Field label="Priority">
              <SelectInput
                options={priorityOptions}
                value={draft.priority}
                disabled={busy}
                onChange={(v) => setDraft({ ...draft, priority: v as ComplaintPriority })}
              />
            </Field>
            <Field label="Description" required>
              <Textarea
                value={draft.description}
                disabled={busy}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="What happened?"
                rows={4}
              />
            </Field>
          </div>
        </Dialog>
      )}
    </div>
  );
}
