/**
 * CRM Feedback — customer feedback list for the organization.
 *
 * Shows ratings and comments with status, category and source. Filterable by
 * status. Writes go through doors (create feedback, update status).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleSlash, Heart, LogIn, Plus } from "lucide-react";
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
import type { CustomerFeedback, FeedbackCategory, FeedbackSource, FeedbackStatus } from "@/domain/crm/types";
import { FEEDBACK_CATEGORIES, FEEDBACK_SOURCES, FEEDBACK_STATUSES } from "@/domain/crm/types";
import { listCustomerFeedback, createCustomerFeedback, updateFeedbackStatus, type CrmScope } from "@/domain/crm/crm-service";
import { listGuests } from "@/domain/hotel/guest-service";
import type { Guest } from "@/domain/hotel/types";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

type FeedbackView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_organization"
  | "scoped";

function pageStatusFor(status: ContextStatus, context: ActiveContext): FeedbackView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null ? "scoped" : "no_organization";
  }
  return "bootstrapping";
}

type FeedbackDraft = {
  customerId: string;
  category: FeedbackCategory;
  rating: string;
  comment: string;
  source: FeedbackSource;
};

function newDraft(): FeedbackDraft {
  return {
    customerId: "",
    category: "OTHER",
    rating: "",
    comment: "",
    source: "INTERNAL",
  };
}

export default function FeedbackPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const scope = useMemo<CrmScope | null>(
    () => (context.organizationId !== null ? { organizationId: context.organizationId } : null),
    [context.organizationId],
  );

  const canView = can("crm.feedback.view", permissions);
  const canCreate = can("crm.feedback.create", permissions);
  const canManage = can("crm.feedback.manage", permissions);

  const [feedback, setFeedback] = useState<CustomerFeedback[] | null>(null);
  const [customers, setCustomers] = useState<Guest[]>([]);
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | "">("");
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<FeedbackDraft>(newDraft);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || scope === null || !canView) return;
    let ignore = false;
    setFeedback(null);
    setError(null);

    const opts = statusFilter ? { status: statusFilter } : {};
    Promise.all([
      listCustomerFeedback(scope, opts),
      listGuests(scope).catch(() => []),
    ])
      .then(([fb, guests]) => {
        if (ignore) return;
        setFeedback(fb);
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
    () =>
      customers.map((c) => ({
        value: c.id,
        label: `${c.firstName} ${c.lastName}`,
      })),
    [customers],
  );

  const categoryOptions = useMemo(
    () => FEEDBACK_CATEGORIES.map((c) => ({ value: c, label: c.charAt(0) + c.slice(1).toLowerCase() })),
    [],
  );

  const sourceOptions = useMemo(
    () => FEEDBACK_SOURCES.map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() })),
    [],
  );

  const statusOptions = useMemo(
    () => [
      { value: "", label: "All statuses" },
      ...FEEDBACK_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, " ") })),
    ],
    [],
  );

  const handleCreate = async () => {
    if (scope === null || draft.customerId === "") return;
    setBusy(true);
    try {
      await createCustomerFeedback(scope, draft.customerId, {
        category: draft.category,
        rating: draft.rating ? Number(draft.rating) : null,
        comment: draft.comment.trim() || null,
        source: draft.source,
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

  const handleStatusChange = async (feedbackId: string, newStatus: FeedbackStatus) => {
    if (scope === null) return;
    try {
      await updateFeedbackStatus(scope, feedbackId, newStatus);
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
          <Heart className="size-5 shrink-0 text-brand-600" aria-hidden />
          Feedback
        </h2>
        <p className="mt-1 text-sm text-muted">
          Customer ratings and comments. Track feedback to resolution.
        </p>
      </header>

      {view === "bootstrapping" && <LoadingBlock label="Loading your workspace…" />}

      {view === "unconfigured" && (
        <EmptyState icon={<CircleSlash aria-hidden />} title="Backend not configured" description="This build has no backend configured." />
      )}

      {view === "unauthenticated" && (
        <EmptyState icon={<LogIn aria-hidden />} title="Sign in to view feedback" description="There is no active session for this build to read a tenant from." />
      )}

      {view === "no_organization" && (
        <EmptyState icon={<Heart aria-hidden />} title="Choose an organization first" description="Feedback belongs to an organization." />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied capability="view feedback" permission="crm.feedback.view" />
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
                  onChange={(v) => setStatusFilter(v as FeedbackStatus | "")}
                />
                {canCreate && (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Plus className="size-4" aria-hidden />}
                    onClick={() => setShowCreate(true)}
                  >
                    New feedback
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={reload}>Reload</Button>
              </div>
            }
          >
            <p className="text-xs text-muted">
              {feedback === null ? "Loading…" : `${feedback.length} feedback item${feedback.length === 1 ? "" : "s"}`}
            </p>
          </Card>

          {feedback === null ? (
            <LoadingBlock label="Reading feedback…" />
          ) : feedback.length === 0 ? (
            <EmptyState
              icon={<Heart aria-hidden />}
              title="No feedback yet"
              description="Customer feedback will appear here."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {feedback.map((fb) => (
                <Card key={fb.id} padded={false}>
                  <div className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:px-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">
                          {customerNameMap.get(fb.customerId) ?? "Unknown customer"}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          {new Date(fb.createdAt).toLocaleDateString()} · {fb.source}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="brand">{fb.category}</Badge>
                        <Badge
                          tone={
                            fb.status === "RESOLVED"
                              ? "success"
                              : fb.status === "CLOSED"
                                ? "muted"
                                : "neutral"
                          }
                        >
                          {fb.status}
                        </Badge>
                        {fb.rating !== null && (
                          <span className="text-sm font-medium tabular-nums text-ink">
                            {fb.rating}/5
                          </span>
                        )}
                      </div>
                    </div>

                    {fb.comment && <p className="text-sm text-ink">{fb.comment}</p>}

                    {canManage && fb.status !== "CLOSED" && (
                      <div className="flex flex-wrap items-center gap-2">
                        {fb.status === "OPEN" && (
                          <Button size="sm" variant="ghost" onClick={() => handleStatusChange(fb.id, "IN_REVIEW")}>
                            Mark in review
                          </Button>
                        )}
                        {(fb.status === "OPEN" || fb.status === "IN_REVIEW") && (
                          <Button size="sm" variant="ghost" onClick={() => handleStatusChange(fb.id, "RESOLVED")}>
                            Resolve
                          </Button>
                        )}
                        {fb.status === "RESOLVED" && (
                          <Button size="sm" variant="ghost" onClick={() => handleStatusChange(fb.id, "CLOSED")}>
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
          title="New feedback"
          description="Record customer feedback with an optional rating."
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowCreate(false)} disabled={busy}>Cancel</Button>
              <Button variant="primary" onClick={() => void handleCreate()} disabled={busy}>
                {busy ? "Saving…" : "Create feedback"}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <Field label="Customer" required>
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
            <Field label="Rating (1-5)">
              <TextInput
                type="number"
                value={draft.rating}
                disabled={busy}
                onChange={(e) => setDraft({ ...draft, rating: e.target.value })}
                placeholder="5"
              />
            </Field>
            <Field label="Source">
              <SelectInput
                options={sourceOptions}
                value={draft.source}
                disabled={busy}
                onChange={(v) => setDraft({ ...draft, source: v as FeedbackSource })}
              />
            </Field>
            <Field label="Comment">
              <Textarea
                value={draft.comment}
                disabled={busy}
                onChange={(e) => setDraft({ ...draft, comment: e.target.value })}
                placeholder="What did the customer say?"
                rows={3}
              />
            </Field>
          </div>
        </Dialog>
      )}
    </div>
  );
}
