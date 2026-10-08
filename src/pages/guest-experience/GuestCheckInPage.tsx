import { useEffect, useState } from "react";
import { CheckCircle2, LogIn } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import type { EntityId } from "@/domain/identity/types";
import { can, type ActiveContext } from "@/domain/identity/types";
import type { PreCheckIn } from "@/domain/guest-experience/types";
import { listPreCheckIns, submitPreCheckIn } from "@/domain/guest-experience/guest-experience-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

const DEMO_CUSTOMER_ID = "cust_demo_1";

type PageView = "bootstrapping" | "unconfigured" | "unauthenticated" | "no_organization" | "scoped";

function pageStatusFor(status: ContextStatus, context: ActiveContext): PageView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") return context.organizationId !== null ? "scoped" : "no_organization";
  return "bootstrapping";
}

function statusLabel(status: string): string {
  switch (status) {
    case "NOT_STARTED": return "Not Started";
    case "IN_PROGRESS": return "In Progress";
    case "SUBMITTED": return "Submitted";
    case "REVIEW_REQUIRED": return "Review Required";
    case "COMPLETED": return "Completed";
    case "CANCELLED": return "Cancelled";
    default: return status;
  }
}

function statusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "COMPLETED": return "success";
    case "SUBMITTED":
    case "REVIEW_REQUIRED": return "warning";
    case "CANCELLED": return "danger";
    default: return "neutral";
  }
}

export default function GuestCheckInPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const orgId = context.organizationId as EntityId | null;
  const customerId = DEMO_CUSTOMER_ID;

  const canView = can("guest_experience.checkin.view", permissions);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkIns, setCheckIns] = useState<PreCheckIn[]>([]);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || !orgId || !canView || !customerId) return;
    setLoading(true);
    setError(null);
    try {
      setCheckIns([...listPreCheckIns(orgId, { customerId })]);
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setLoading(false);
    }
  }, [view, orgId, customerId, canView]);

  function handleSubmit(id: EntityId) {
    if (!orgId || !customerId) return;
    try {
      submitPreCheckIn(id);
      setCheckIns([...listPreCheckIns(orgId, { customerId })]);
    } catch (err) {
      setError(toPublicError(err).message);
    }
  }

  if (view === "bootstrapping" || loading) {
    return <LoadingBlock label="Loading check-in…" />;
  }

  if (!canView) {
    return (
      <EmptyState
        icon={<LogIn />}
        title="Digital Check-in"
        description="You don't have permission to view check-in."
      />
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={<LogIn />}
        title="Something went wrong"
        description={error}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#17201B]">Digital Check-in</h1>
        <p className="text-sm text-[#66706A] mt-1">
          Complete your check-in before arrival
        </p>
      </div>

      {checkIns.length === 0 ? (
        <Card>
          <div className="p-12 text-center">
            <LogIn className="w-12 h-12 mx-auto mb-4 text-[#9CA3AF]" />
            <p className="text-sm text-[#66706A]">No upcoming reservations to check in</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {checkIns.map((pci) => (
            <Card key={pci.id}>
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge tone={statusTone(pci.status)}>{statusLabel(pci.status)}</Badge>
                    </div>
                    <h3 className="text-lg font-semibold text-[#17201B]">
                      Reservation {pci.reservationId}
                    </h3>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-xs text-[#66706A]">Guest Name</p>
                    <p className="text-sm font-medium text-[#17201B]">{pci.guestName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#66706A]">Guests</p>
                    <p className="text-sm font-medium text-[#17201B]">
                      {pci.adults} Adults{pci.children > 0 ? `, ${pci.children} Children` : ""}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[#66706A]">Phone</p>
                    <p className="text-sm font-medium text-[#17201B]">{pci.guestPhone}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#66706A]">Email</p>
                    <p className="text-sm font-medium text-[#17201B]">{pci.guestEmail}</p>
                  </div>
                  {pci.estimatedArrival && (
                    <div>
                      <p className="text-xs text-[#66706A]">Estimated Arrival</p>
                      <p className="text-sm font-medium text-[#17201B]">
                        {new Date(pci.estimatedArrival).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-[#66706A]">Document Status</p>
                    <p className="text-sm font-medium text-[#17201B]">{pci.documentStatus}</p>
                  </div>
                </div>

                {pci.specialRequests && (
                  <div className="mb-4">
                    <p className="text-xs text-[#66706A] mb-1">Special Requests</p>
                    <p className="text-sm text-[#17201B]">{pci.specialRequests}</p>
                  </div>
                )}

                {pci.preferences && (
                  <div className="mb-4">
                    <p className="text-xs text-[#66706A] mb-1">Preferences</p>
                    <p className="text-sm text-[#17201B]">{pci.preferences}</p>
                  </div>
                )}

                {pci.status === "NOT_STARTED" || pci.status === "IN_PROGRESS" ? (
                  <Button variant="primary" onClick={() => handleSubmit(pci.id)}>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Submit Check-in
                  </Button>
                ) : pci.status === "COMPLETED" ? (
                  <div className="flex items-center gap-2 text-[#1B5E3B]">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="text-sm font-medium">Check-in completed</span>
                  </div>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
