import { useEffect, useState } from "react";
import { ConciergeBell, Plus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import type { EntityId } from "@/domain/identity/types";
import { can, type ActiveContext } from "@/domain/identity/types";
import type { GuestServiceRequest, ServiceRequestStatus } from "@/domain/guest-experience/types";
import { listServiceRequests, createServiceRequest } from "@/domain/guest-experience/guest-experience-service";
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

function statusTone(status: ServiceRequestStatus): "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "COMPLETED": return "success";
    case "IN_PROGRESS":
    case "ASSIGNED": return "warning";
    case "CANCELLED": return "danger";
    default: return "neutral";
  }
}

function categoryLabel(category: string): string {
  return category.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function GuestRequestsPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const orgId = context.organizationId as EntityId | null;
  const customerId = DEMO_CUSTOMER_ID;

  const canView = can("guest_experience.request.view", permissions);
  const canCreate = can("guest_experience.request.create", permissions);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requests, setRequests] = useState<GuestServiceRequest[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formCategory, setFormCategory] = useState("EXTRA_TOWELS");
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || !orgId || !canView || !customerId) return;
    setLoading(true);
    setError(null);
    try {
      setRequests([...listServiceRequests(orgId, { customerId })]);
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setLoading(false);
    }
  }, [view, orgId, customerId, canView]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !customerId) return;
    try {
      createServiceRequest({
        organizationId: orgId,
        propertyId: "prop_demo_1",
        customerId,
        reservationId: null,
        stayId: null,
        roomId: null,
        category: formCategory as any,
        title: formTitle,
        description: formDescription,
        priority: "NORMAL",
        status: "SUBMITTED",
      });
      setRequests([...listServiceRequests(orgId, { customerId })]);
      setShowForm(false);
      setFormTitle("");
      setFormDescription("");
    } catch (err) {
      setError(toPublicError(err).message);
    }
  }

  if (view === "bootstrapping" || loading) {
    return <LoadingBlock label="Loading requests…" />;
  }

  if (!canView) {
    return (
      <EmptyState
        icon={<ConciergeBell />}
        title="Service Requests"
        description="You don't have permission to view service requests."
      />
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={<ConciergeBell />}
        title="Something went wrong"
        description={error}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#17201B]">Service Requests</h1>
          <p className="text-sm text-[#66706A] mt-1">
            Track and manage your service requests
          </p>
        </div>
        {canCreate && (
          <Button variant="primary" onClick={() => setShowForm(!showForm)}>
            <Plus className="w-4 h-4 mr-2" />
            New Request
          </Button>
        )}
      </div>

      {showForm && (
        <Card>
          <div className="p-6">
            <h3 className="text-base font-semibold text-[#17201B] mb-4">New Service Request</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#17201B] mb-2">Category</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-[#E3E7E3] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]"
                >
                  <option value="EXTRA_TOWELS">Extra Towels</option>
                  <option value="EXTRA_PILLOW">Extra Pillow</option>
                  <option value="WATER">Water</option>
                  <option value="HOUSEKEEPING">Housekeeping</option>
                  <option value="ROOM_CLEANING">Room Cleaning</option>
                  <option value="LAUNDRY">Laundry</option>
                  <option value="MAINTENANCE">Maintenance</option>
                  <option value="ROOM_SERVICE">Room Service</option>
                  <option value="AC">AC</option>
                  <option value="TV">TV</option>
                  <option value="PLUMBING">Plumbing</option>
                  <option value="WIFI">Wi-Fi</option>
                  <option value="FURNITURE">Furniture</option>
                  <option value="LIGHTING">Lighting</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#17201B] mb-2">Title</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-[#E3E7E3] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]"
                  placeholder="Brief description"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#17201B] mb-2">Details</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  required
                  rows={3}
                  className="w-full px-3 py-2 border border-[#E3E7E3] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]"
                  placeholder="Additional details..."
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" variant="primary">Submit Request</Button>
                <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </form>
          </div>
        </Card>
      )}

      {requests.length === 0 ? (
        <Card>
          <div className="p-12 text-center">
            <ConciergeBell className="w-12 h-12 mx-auto mb-4 text-[#9CA3AF]" />
            <p className="text-sm text-[#66706A]">No service requests yet</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <Card key={req.id}>
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge tone="neutral">{categoryLabel(req.category)}</Badge>
                      <Badge tone={statusTone(req.status)}>{req.customerVisibleStatus}</Badge>
                    </div>
                    <h3 className="text-base font-semibold text-[#17201B] mt-2">{req.title}</h3>
                    <p className="text-sm text-[#66706A] mt-1">{req.description}</p>
                    <p className="text-xs text-[#9CA3AF] mt-2">
                      {new Date(req.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
