/**
 * Table Requests — live feed of table-side service requests.
 *
 * Staff see open requests (call staff, request bill, water, cleaning, etc.)
 * and can acknowledge, start working on them, or resolve them.
 * Real-time operational view for restaurant floor management.
 */

import { useEffect, useMemo, useState } from "react";
import { CircleSlash, LogIn, Bell, CheckCircle2, Clock } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { Button } from "@/components/ui/Button";
import { can, type ActiveContext } from "@/domain/identity/types";
import {
  listTableRequests,
  updateTableRequestStatus,
  type CommerceScope,
} from "@/domain/commerce/commerce-service";
import type { TableRequest, TableRequestStatus } from "@/domain/commerce/types";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

export type TableRequestsView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_organization"
  | "scoped";

export function pageStatusFor(status: ContextStatus, context: ActiveContext): TableRequestsView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null ? "scoped" : "no_organization";
  }
  return "bootstrapping";
}

const NO_BACKEND_COPY = "This build has no backend configured, so it cannot read table requests.";

export default function TableRequestsPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const storeError = useContextStore((s) => s.error);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const scope = useMemo<CommerceScope | null>(
    () => (context.organizationId !== null ? { organizationId: context.organizationId } : null),
    [context.organizationId],
  );

  const canView = can("commerce.table_request.view", permissions);
  const canManage = can("commerce.table_request.manage", permissions);

  const [requests, setRequests] = useState<TableRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || scope === null || !canView) return;
    void loadRequests();
  }, [view, scope, canView]);

  async function loadRequests() {
    if (scope === null) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listTableRequests(scope);
      setRequests(data);
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(requestId: string, status: TableRequestStatus) {
    if (scope === null) return;
    try {
      await updateTableRequestStatus(scope, requestId, status);
      await loadRequests();
    } catch (err) {
      setError(toPublicError(err).message);
    }
  }

  const openRequests = requests.filter((r) => r.status === "OPEN" || r.status === "ACKNOWLEDGED" || r.status === "IN_PROGRESS");
  const resolvedRequests = requests.filter((r) => r.status === "RESOLVED" || r.status === "CANCELLED");

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          <Bell className="size-5 shrink-0 text-brand-600" aria-hidden />
          Table Requests
        </h2>
        <p className="mt-1 text-sm text-muted">
          Live feed of table-side service requests from customers.
        </p>
      </header>

      {view === "bootstrapping" && <LoadingBlock label="Loading your workspace…" />}

      {view === "unconfigured" && (
        <EmptyState
          icon={<CircleSlash aria-hidden />}
          title="Backend not configured"
          description={storeError ?? NO_BACKEND_COPY}
        />
      )}

      {view === "unauthenticated" && (
        <EmptyState
          icon={<LogIn aria-hidden />}
          title="Sign in to view table requests"
          description="There is no active session for this build to read a tenant from."
        />
      )}

      {view === "no_organization" && (
        <EmptyState
          icon={<Bell aria-hidden />}
          title="Choose an organization first"
          description="Table requests belong to an organization. Pick one and this screen will show its requests."
        />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied capability="view table requests" permission="commerce.table_request.view" />
      )}

      {view === "scoped" && scope !== null && canView && (
        <>
          {error !== null && (
            <p role="alert" className="rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}

          {loading ? (
            <LoadingBlock label="Loading table requests…" />
          ) : openRequests.length === 0 && resolvedRequests.length === 0 ? (
            <EmptyState
              icon={<Bell aria-hidden />}
              title="No table requests"
              description="Table requests from customers will appear here in real time."
            />
          ) : (
            <div className="space-y-6">
              {openRequests.length > 0 && (
                <section>
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                    <Clock className="size-4 text-amber-600" aria-hidden />
                    Open Requests ({openRequests.length})
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {openRequests.map((req) => (
                      <RequestCard
                        key={req.id}
                        request={req}
                        canManage={canManage}
                        onStatusChange={handleStatusChange}
                      />
                    ))}
                  </div>
                </section>
              )}

              {resolvedRequests.length > 0 && (
                <section>
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                    <CheckCircle2 className="size-4 text-success" aria-hidden />
                    Resolved ({resolvedRequests.length})
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {resolvedRequests.slice(0, 6).map((req) => (
                      <RequestCard
                        key={req.id}
                        request={req}
                        canManage={false}
                        onStatusChange={handleStatusChange}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RequestCard({
  request,
  canManage,
  onStatusChange,
}: {
  request: TableRequest;
  canManage: boolean;
  onStatusChange: (id: string, status: TableRequestStatus) => void;
}) {
  const typeLabels = {
    CALL_STAFF: "Call Staff",
    REQUEST_BILL: "Request Bill",
    REQUEST_WATER: "Request Water",
    REQUEST_CLEANING: "Request Cleaning",
    REQUEST_ASSISTANCE: "Request Assistance",
    OTHER: "Other",
  };

  const typeStyles = {
    CALL_STAFF: "bg-blue-50 text-blue-700 border-blue-200",
    REQUEST_BILL: "bg-purple-50 text-purple-700 border-purple-200",
    REQUEST_WATER: "bg-cyan-50 text-cyan-700 border-cyan-200",
    REQUEST_CLEANING: "bg-orange-50 text-orange-700 border-orange-200",
    REQUEST_ASSISTANCE: "bg-pink-50 text-pink-700 border-pink-200",
    OTHER: "bg-muted text-ink border-border",
  };

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <span className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium ${typeStyles[request.type]}`}>
          {typeLabels[request.type]}
        </span>
        <StatusBadge status={request.status} />
      </div>

      {request.message && (
        <p className="text-sm text-ink">{request.message}</p>
      )}

      <div className="text-xs text-muted">
        Table: {request.tableId.slice(0, 8)}
        <span className="mx-2">·</span>
        {new Date(request.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </div>

      {canManage && request.status === "OPEN" && (
        <div className="flex gap-2 border-t border-border pt-3">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onStatusChange(request.id, "ACKNOWLEDGED")}
          >
            Acknowledge
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onStatusChange(request.id, "IN_PROGRESS")}
          >
            Start
          </Button>
        </div>
      )}

      {canManage && request.status === "ACKNOWLEDGED" && (
        <div className="flex gap-2 border-t border-border pt-3">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onStatusChange(request.id, "IN_PROGRESS")}
          >
            Start Working
          </Button>
        </div>
      )}

      {canManage && request.status === "IN_PROGRESS" && (
        <div className="flex gap-2 border-t border-border pt-3">
          <Button
            size="sm"
            onClick={() => onStatusChange(request.id, "RESOLVED")}
          >
            Mark Resolved
          </Button>
        </div>
      )}
    </Card>
  );
}

function StatusBadge({ status }: { status: TableRequestStatus }) {
  const styles = {
    OPEN: "bg-amber-50 text-amber-700",
    ACKNOWLEDGED: "bg-blue-50 text-blue-700",
    IN_PROGRESS: "bg-purple-50 text-purple-700",
    RESOLVED: "bg-success-soft text-success",
    CANCELLED: "bg-muted text-ink",
  };

  return (
    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${styles[status]}`}>
      {status.replace("_", " ")}
    </span>
  );
}
