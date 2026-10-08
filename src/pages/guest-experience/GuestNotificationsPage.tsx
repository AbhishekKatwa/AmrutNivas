import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import type { EntityId } from "@/domain/identity/types";
import { can, type ActiveContext } from "@/domain/identity/types";
import type { GuestNotification, GuestNotificationCategory } from "@/domain/guest-experience/types";
import { listGuestNotifications, markNotificationRead, markAllNotificationsRead } from "@/domain/guest-experience/guest-experience-service";
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

function categoryLabel(cat: GuestNotificationCategory): string {
  return cat.charAt(0) + cat.slice(1).toLowerCase();
}

function categoryColor(cat: GuestNotificationCategory): "success" | "warning" | "danger" | "neutral" {
  switch (cat) {
    case "PAYMENTS": return "success";
    case "REQUESTS": return "warning";
    case "OFFERS": return "neutral";
    default: return "neutral";
  }
}

export default function GuestNotificationsPage() {
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
  const [notifications, setNotifications] = useState<GuestNotification[]>([]);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || !orgId || !canView || !customerId) return;
    setLoading(true);
    setError(null);
    try {
      setNotifications([...listGuestNotifications(orgId, { customerId })]);
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setLoading(false);
    }
  }, [view, orgId, customerId, canView]);

  function handleMarkRead(id: EntityId) {
    if (!orgId || !customerId) return;
    markNotificationRead(id);
    setNotifications([...listGuestNotifications(orgId, { customerId })]);
  }

  function handleMarkAllRead() {
    if (!orgId || !customerId) return;
    markAllNotificationsRead(orgId, customerId);
    setNotifications([...listGuestNotifications(orgId, { customerId })]);
  }

  if (view === "bootstrapping" || loading) {
    return <LoadingBlock label="Loading notifications…" />;
  }

  if (!canView) {
    return (
      <EmptyState
        icon={<Bell />}
        title="Notifications"
        description="You don't have permission to view notifications."
      />
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={<Bell />}
        title="Something went wrong"
        description={error}
      />
    );
  }

  const unreadCount = notifications.filter((n) => !n.read).length;
  const filtered = filter === "unread" ? notifications.filter((n) => !n.read) : notifications;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#17201B]">Notifications</h1>
          <p className="text-sm text-[#66706A] mt-1">
            {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="secondary" onClick={handleMarkAllRead}>
            Mark all as read
          </Button>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          variant={filter === "all" ? "primary" : "secondary"}
          onClick={() => setFilter("all")}
        >
          All
        </Button>
        <Button
          variant={filter === "unread" ? "primary" : "secondary"}
          onClick={() => setFilter("unread")}
        >
          Unread
        </Button>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <div className="p-12 text-center">
            <Bell className="w-12 h-12 mx-auto mb-4 text-[#9CA3AF]" />
            <p className="text-sm text-[#66706A]">No notifications</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((notif) => (
            <Card key={notif.id} className={!notif.read ? "border-l-4 border-l-[#1B5E3B]" : ""}>
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge tone={categoryColor(notif.category)}>{categoryLabel(notif.category)}</Badge>
                      {!notif.read && <span className="w-2 h-2 rounded-full bg-[#1B5E3B]" />}
                    </div>
                    <h3 className="text-base font-semibold text-[#17201B] mt-2">{notif.title}</h3>
                    <p className="text-sm text-[#66706A] mt-1">{notif.message}</p>
                    <p className="text-xs text-[#9CA3AF] mt-2">
                      {new Date(notif.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  {!notif.read && (
                    <Button variant="ghost" size="sm" onClick={() => handleMarkRead(notif.id)}>
                      Mark read
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
