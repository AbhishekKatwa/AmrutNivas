import { useEffect, useState } from "react";
import {
  Calendar,
  CalendarCheck,
  Clock,
  ConciergeBell,
  Gift,
  Home,
  LogIn,
  Mail,
  MapPin,
  Phone,
  Star,
  UtensilsCrossed,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import type { EntityId } from "@/domain/identity/types";
import { can, type ActiveContext } from "@/domain/identity/types";
import type {
  GuestJourney,
  GuestJourneyStage,
  GuestServiceRequest,
  GuestNotification,
} from "@/domain/guest-experience/types";
import {
  getGuestJourney,
  listServiceRequests,
  listGuestNotifications,
} from "@/domain/guest-experience/guest-experience-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";
import { Link } from "react-router-dom";

type DashboardView = "bootstrapping" | "unconfigured" | "unauthenticated" | "no_organization" | "scoped";

const DEMO_CUSTOMER_ID = "cust_demo_1";

function pageStatusFor(status: ContextStatus, context: ActiveContext): DashboardView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") return context.organizationId !== null ? "scoped" : "no_organization";
  return "bootstrapping";
}

function stageLabel(stage: GuestJourneyStage): string {
  switch (stage) {
    case "DISCOVERY": return "Discovery";
    case "BOOKING": return "Booking Confirmed";
    case "PRE_ARRIVAL": return "Pre-Arrival";
    case "ARRIVAL": return "Arriving";
    case "IN_STAY": return "Currently Staying";
    case "CHECKOUT": return "Checkout";
    case "POST_STAY": return "Post-Stay";
    case "RE_ENGAGEMENT": return "Welcome Back";
  }
}

function stageColor(stage: GuestJourneyStage): "success" | "warning" | "danger" | "neutral" {
  switch (stage) {
    case "IN_STAY":
    case "ARRIVAL":
      return "success";
    case "PRE_ARRIVAL":
    case "BOOKING":
      return "neutral";
    case "CHECKOUT":
      return "warning";
    default:
      return "neutral";
  }
}

function journeyIcon(icon: string) {
  switch (icon) {
    case "CalendarCheck": return <CalendarCheck className="w-4 h-4" />;
    case "Mail": return <Mail className="w-4 h-4" />;
    case "LogIn": return <LogIn className="w-4 h-4" />;
    case "ConciergeBell": return <ConciergeBell className="w-4 h-4" />;
    case "UtensilsCrossed": return <UtensilsCrossed className="w-4 h-4" />;
    default: return <Calendar className="w-4 h-4" />;
  }
}

function requestStatusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "COMPLETED": return "success";
    case "IN_PROGRESS":
    case "ASSIGNED": return "warning";
    case "CANCELLED": return "danger";
    default: return "neutral";
  }
}

export default function GuestExperienceDashboard() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const orgId = context.organizationId as EntityId | null;
  const customerId = DEMO_CUSTOMER_ID;

  const canView = can("guest_experience.view", permissions);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [journey, setJourney] = useState<GuestJourney | null>(null);
  const [requests, setRequests] = useState<GuestServiceRequest[]>([]);
  const [notifications, setNotifications] = useState<GuestNotification[]>([]);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || !orgId || !canView || !customerId) return;
    setLoading(true);
    setError(null);
    try {
      setJourney(getGuestJourney(orgId, customerId));
      setRequests([...listServiceRequests(orgId, { customerId }).slice(0, 5)]);
      setNotifications([...listGuestNotifications(orgId, { customerId, unreadOnly: true }).slice(0, 5)]);
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setLoading(false);
    }
  }, [view, orgId, customerId, canView]);

  if (view === "bootstrapping" || loading) {
    return <LoadingBlock label="Loading your experience…" />;
  }

  if (!canView) {
    return (
      <EmptyState
        icon={<Home />}
        title="Guest Portal"
        description="You don't have permission to view the guest experience portal."
      />
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={<Home />}
        title="Something went wrong"
        description={error}
      />
    );
  }

  const openRequests = requests.filter((r) => r.status !== "COMPLETED" && r.status !== "CANCELLED");
  const unreadNotifications = notifications.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#17201B]">Welcome Back</h1>
          <p className="text-sm text-[#66706A] mt-1">
            Your personalized guest experience hub
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/guest/requests">
            <Button variant="secondary">
              <ConciergeBell className="w-4 h-4 mr-2" />
              New Request
            </Button>
          </Link>
          <Link to="/guest/concierge">
            <Button variant="primary">
              <ConciergeBell className="w-4 h-4 mr-2" />
              Ask Concierge
            </Button>
          </Link>
        </div>
      </div>

      {journey && (
        <Card>
          <div className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Badge tone={stageColor(journey.currentStage)}>
                    {stageLabel(journey.currentStage)}
                  </Badge>
                </div>
                <h2 className="text-lg font-semibold text-[#17201B]">
                  {journey.currentStage === "IN_STAY" && "Enjoy Your Stay"}
                  {journey.currentStage === "PRE_ARRIVAL" && "Your Stay is Coming Up"}
                  {journey.currentStage === "BOOKING" && "Booking Confirmed"}
                  {journey.currentStage === "CHECKOUT" && "Checkout Time"}
                  {journey.currentStage === "POST_STAY" && "Thank You for Staying"}
                  {journey.currentStage === "DISCOVERY" && "Plan Your Stay"}
                  {journey.currentStage === "ARRIVAL" && "Welcome!"}
                  {journey.currentStage === "RE_ENGAGEMENT" && "Welcome Back!"}
                </h2>
              </div>
              {journey.activeStayId && (
                <Link to="/guest/stay">
                  <Button variant="secondary" size="sm">
                    View Stay Details
                  </Button>
                </Link>
              )}
            </div>

            {journey.events.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-medium text-[#66706A] mb-3">Recent Activity</h3>
                <div className="space-y-3">
                  {journey.events.slice(-5).reverse().map((event) => (
                    <div key={event.id} className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#F5F6F2] flex items-center justify-center text-[#1B5E3B]">
                        {journeyIcon(event.icon)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#17201B]">{event.title}</p>
                        <p className="text-xs text-[#66706A] mt-0.5">{event.description}</p>
                        <p className="text-xs text-[#9CA3AF] mt-1">
                          {new Date(event.occurredAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-[#17201B]">Open Requests</h3>
              <Link to="/guest/requests" className="text-sm text-[#1B5E3B] hover:underline">
                View all
              </Link>
            </div>
            {openRequests.length === 0 ? (
              <p className="text-sm text-[#66706A]">No open requests</p>
            ) : (
              <div className="space-y-3">
                {openRequests.map((req) => (
                  <div key={req.id} className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#17201B]">{req.title}</p>
                      <p className="text-xs text-[#66706A] mt-0.5">{req.customerVisibleStatus}</p>
                    </div>
                    <Badge tone={requestStatusTone(req.status)}>
                      {req.customerVisibleStatus}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-[#17201B]">Notifications</h3>
              <Link to="/guest/notifications" className="text-sm text-[#1B5E3B] hover:underline">
                View all
              </Link>
            </div>
            {unreadNotifications === 0 ? (
              <p className="text-sm text-[#66706A]">No new notifications</p>
            ) : (
              <div className="space-y-3">
                {notifications.map((notif) => (
                  <div key={notif.id} className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-2 h-2 rounded-full bg-[#1B5E3B] mt-2" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#17201B]">{notif.title}</p>
                      <p className="text-xs text-[#66706A] mt-0.5">{notif.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link to="/guest/bookings">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <div className="p-4 text-center">
              <Calendar className="w-8 h-8 mx-auto mb-2 text-[#1B5E3B]" />
              <p className="text-sm font-medium text-[#17201B]">My Bookings</p>
            </div>
          </Card>
        </Link>
        <Link to="/guest/dining">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <div className="p-4 text-center">
              <UtensilsCrossed className="w-8 h-8 mx-auto mb-2 text-[#1B5E3B]" />
              <p className="text-sm font-medium text-[#17201B]">Dining</p>
            </div>
          </Card>
        </Link>
        <Link to="/guest/rewards">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <div className="p-4 text-center">
              <Star className="w-8 h-8 mx-auto mb-2 text-[#1B5E3B]" />
              <p className="text-sm font-medium text-[#17201B]">Rewards</p>
            </div>
          </Card>
        </Link>
        <Link to="/guest/offers">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <div className="p-4 text-center">
              <Gift className="w-8 h-8 mx-auto mb-2 text-[#1B5E3B]" />
              <p className="text-sm font-medium text-[#17201B]">Offers</p>
            </div>
          </Card>
        </Link>
      </div>

      <Card>
        <div className="p-6">
          <h3 className="text-base font-semibold text-[#17201B] mb-4">Quick Links</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Link to="/guest/checkin" className="flex items-center gap-3 p-3 rounded-lg hover:bg-[#F5F6F2] transition-colors">
              <LogIn className="w-5 h-5 text-[#1B5E3B]" />
              <span className="text-sm text-[#17201B]">Digital Check-in</span>
            </Link>
            <Link to="/guest/bills" className="flex items-center gap-3 p-3 rounded-lg hover:bg-[#F5F6F2] transition-colors">
              <Clock className="w-5 h-5 text-[#1B5E3B]" />
              <span className="text-sm text-[#17201B]">View Bills</span>
            </Link>
            <Link to="/guest/events" className="flex items-center gap-3 p-3 rounded-lg hover:bg-[#F5F6F2] transition-colors">
              <Calendar className="w-5 h-5 text-[#1B5E3B]" />
              <span className="text-sm text-[#17201B]">My Events</span>
            </Link>
            <Link to="/guest/feedback" className="flex items-center gap-3 p-3 rounded-lg hover:bg-[#F5F6F2] transition-colors">
              <Star className="w-5 h-5 text-[#1B5E3B]" />
              <span className="text-sm text-[#17201B]">Give Feedback</span>
            </Link>
            <Link to="/guest/profile" className="flex items-center gap-3 p-3 rounded-lg hover:bg-[#F5F6F2] transition-colors">
              <Phone className="w-5 h-5 text-[#1B5E3B]" />
              <span className="text-sm text-[#17201B]">My Profile</span>
            </Link>
            <Link to="/guest/timeline" className="flex items-center gap-3 p-3 rounded-lg hover:bg-[#F5F6F2] transition-colors">
              <MapPin className="w-5 h-5 text-[#1B5E3B]" />
              <span className="text-sm text-[#17201B]">Journey Timeline</span>
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
