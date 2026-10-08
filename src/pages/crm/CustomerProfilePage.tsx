/**
 * CRM Customer 360° Profile — the unified view of a single customer.
 *
 * Shows identity, CRM fields, preferences, tags, notes, feedback, complaints,
 * loyalty accounts and relationships. All reads are org-scoped under RLS.
 * Writes go through doors. This is a read-mostly screen; editing identity
 * fields goes through the existing guest edit flow.
 */

import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  ArrowLeft,
  CircleSlash,
  LogIn,
  Users,
} from "lucide-react";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { can, type ActiveContext } from "@/domain/identity/types";
import type { Guest } from "@/domain/hotel/types";
import type {
  CustomerNote,
  CustomerFeedback,
  Complaint,
  LoyaltyAccount,
  CustomerTagAssignment,
  CustomerTag,
  CustomerRelationship,
} from "@/domain/crm/types";
import { getGuest } from "@/domain/hotel/guest-service";
import {
  listCustomerNotes,
  listCustomerFeedback,
  listComplaints,
  listLoyaltyAccounts,
  listCustomerTagAssignments,
  listCustomerTags,
  listCustomerRelationships,
  type CrmScope,
} from "@/domain/crm/crm-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

type ProfileView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_organization"
  | "scoped";

function pageStatusFor(status: ContextStatus, context: ActiveContext): ProfileView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null ? "scoped" : "no_organization";
  }
  return "bootstrapping";
}

export default function CustomerProfilePage() {
  const { customerId } = useParams<{ customerId: string }>();
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const scope = useMemo<CrmScope | null>(
    () => (context.organizationId !== null ? { organizationId: context.organizationId } : null),
    [context.organizationId],
  );

  const canView = can("crm.customer.view", permissions);

  const [customer, setCustomer] = useState<Guest | null>(null);
  const [notes, setNotes] = useState<CustomerNote[]>([]);
  const [feedback, setFeedback] = useState<CustomerFeedback[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loyaltyAccounts, setLoyaltyAccounts] = useState<LoyaltyAccount[]>([]);
  const [tagAssignments, setTagAssignments] = useState<CustomerTagAssignment[]>([]);
  const [tags, setTags] = useState<CustomerTag[]>([]);
  const [relationships, setRelationships] = useState<CustomerRelationship[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || scope === null || !customerId || !canView) return;
    let ignore = false;
    setLoading(true);
    setError(null);

    Promise.all([
      getGuest(scope, customerId),
      listCustomerNotes(scope, customerId).catch(() => []),
      listCustomerFeedback(scope, { customerId }).catch(() => []),
      listComplaints(scope, { customerId }).catch(() => []),
      listLoyaltyAccounts(scope, customerId).catch(() => []),
      listCustomerTagAssignments(scope, customerId).catch(() => []),
      listCustomerTags(scope).catch(() => []),
      listCustomerRelationships(scope, customerId).catch(() => []),
    ])
      .then(([guest, notesRes, feedbackRes, complaintsRes, loyaltyRes, tagAssignRes, tagsRes, relRes]) => {
        if (ignore) return;
        setCustomer(guest);
        setNotes(notesRes);
        setFeedback(feedbackRes);
        setComplaints(complaintsRes);
        setLoyaltyAccounts(loyaltyRes);
        setTagAssignments(tagAssignRes);
        setTags(tagsRes);
        setRelationships(relRes);
      })
      .catch((err) => {
        if (!ignore) setError(toPublicError(err).message);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [view, scope, customerId, canView]);

  const tagNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const tag of tags) {
      map.set(tag.id, tag.name);
    }
    return map;
  }, [tags]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <div className="flex items-center gap-3">
        <a href="/crm/customers">
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
          title="Sign in to view customer"
          description="There is no active session for this build to read a tenant from."
        />
      )}

      {view === "no_organization" && (
        <EmptyState
          icon={<Users aria-hidden />}
          title="Choose an organization first"
          description="Customers belong to an organization."
        />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied capability="view customers" permission="crm.customer.view" />
      )}

      {view === "scoped" && scope !== null && canView && (
        <>
          {error !== null && (
            <p role="alert" className="rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}

          {loading ? (
            <LoadingBlock label="Reading customer profile…" />
          ) : customer === null ? (
            <EmptyState
              icon={<Users aria-hidden />}
              title="Customer not found"
              description="This customer does not exist or you do not have access."
            />
          ) : (
            <>
              <Card>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="flex items-center gap-2 text-xl font-semibold text-ink">
                        {customer.firstName} {customer.lastName}
                        {customer.vipStatus !== "REGULAR" && (
                          <Badge tone={customer.vipStatus === "VVIP" ? "warning" : "neutral"}>
                            {customer.vipStatus}
                          </Badge>
                        )}
                        {customer.archivedAt != null && <Badge tone="muted">Archived</Badge>}
                      </h2>
                      <p className="mt-1 text-sm text-muted">
                        {[customer.phone, customer.email].filter(Boolean).join(" · ") || "No contact details"}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {customer.customerType && (
                      <Badge tone="brand">{customer.customerType.replace(/_/g, " ")}</Badge>
                    )}
                    {customer.companyName && (
                      <span className="text-muted">{customer.companyName}</span>
                    )}
                    {customer.designation && (
                      <span className="text-muted">{customer.designation}</span>
                    )}
                    {customer.nationality && (
                      <Badge tone="muted">{customer.nationality}</Badge>
                    )}
                    {customer.source && (
                      <Badge tone="muted">{customer.source}</Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                    <div>
                      <p className="text-xs text-muted">Total stays</p>
                      <p className="font-semibold tabular-nums text-ink">{customer.totalStays}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted">Total nights</p>
                      <p className="font-semibold tabular-nums text-ink">{customer.totalNights}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted">Notes</p>
                      <p className="font-semibold tabular-nums text-ink">{notes.length}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted">Feedback</p>
                      <p className="font-semibold tabular-nums text-ink">{feedback.length}</p>
                    </div>
                  </div>
                </div>
              </Card>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card title="Tags">
                  {tagAssignments.length === 0 ? (
                    <p className="text-sm text-muted">No tags assigned.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {tagAssignments.map((assignment) => (
                        <Badge key={assignment.id} tone="brand">
                          {tagNameMap.get(assignment.tagId) ?? "Unknown"}
                        </Badge>
                      ))}
                    </div>
                  )}
                </Card>

                <Card title="Loyalty">
                  {loyaltyAccounts.length === 0 ? (
                    <p className="text-sm text-muted">No loyalty accounts.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {loyaltyAccounts.map((account) => (
                        <div key={account.id} className="flex items-center justify-between text-sm">
                          <span className="font-medium text-ink">{account.memberNumber}</span>
                          <span className="tabular-nums text-muted">
                            {account.currentPoints} pts
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                <Card title="Recent notes">
                  {notes.length === 0 ? (
                    <p className="text-sm text-muted">No notes.</p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {notes.slice(0, 5).map((note) => (
                        <div key={note.id} className="text-sm">
                          <div className="flex items-center gap-2">
                            <Badge tone="muted">{note.noteType}</Badge>
                            <span className="text-xs text-muted">
                              {new Date(note.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="mt-1 text-ink">{note.note}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                <Card title="Recent feedback">
                  {feedback.length === 0 ? (
                    <p className="text-sm text-muted">No feedback.</p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {feedback.slice(0, 5).map((fb) => (
                        <div key={fb.id} className="text-sm">
                          <div className="flex items-center gap-2">
                            <Badge tone={fb.status === "RESOLVED" ? "success" : "neutral"}>
                              {fb.status}
                            </Badge>
                            <Badge tone="muted">{fb.category}</Badge>
                            {fb.rating !== null && (
                              <span className="text-xs text-muted">{fb.rating}/5</span>
                            )}
                          </div>
                          {fb.comment && (
                            <p className="mt-1 text-ink">{fb.comment}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                <Card title="Complaints">
                  {complaints.length === 0 ? (
                    <p className="text-sm text-muted">No complaints.</p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {complaints.slice(0, 5).map((c) => (
                        <div key={c.id} className="text-sm">
                          <div className="flex items-center gap-2">
                            <Badge
                              tone={
                                c.status === "RESOLVED" || c.status === "CLOSED"
                                  ? "success"
                                  : c.priority === "URGENT"
                                    ? "danger"
                                    : "neutral"
                              }
                            >
                              {c.status}
                            </Badge>
                            <Badge tone="muted">{c.priority}</Badge>
                          </div>
                          <p className="mt-1 text-ink">{c.description}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                <Card title="Relationships">
                  {relationships.length === 0 ? (
                    <p className="text-sm text-muted">No relationships.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {relationships.map((rel) => (
                        <div key={rel.id} className="flex items-center justify-between text-sm">
                          <span className="text-ink">{rel.relationshipType.replace(/_/g, " ")}</span>
                          <span className="text-xs text-muted">{rel.relatedCustomerId.slice(0, 8)}…</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
