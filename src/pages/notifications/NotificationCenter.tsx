/**
 * Notification center — in-app notifications with filtering and actions.
 *
 * Shows recent notifications with unread count, mark as read, archive,
 * and deep linking to source entities. Filters by status, severity, and domain.
 */

import { useEffect, useState } from "react";
import { Bell, Check, CheckCheck, Archive, Filter } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { can } from "@/domain/identity/types";
import {
  listNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  archiveNotification,
  type Notification,
} from "@/domain/notifications/notifications-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore } from "@/state/context-store";
import { format, parseISO } from "date-fns";
import clsx from "clsx";

type FilterStatus = "ALL" | "UNREAD" | "ARCHIVED";
type FilterSeverity = "ALL" | "LOW" | "NORMAL" | "HIGH" | "CRITICAL";

export default function NotificationCenter() {
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const organizationId = context.organizationId;

  const canView = can("notifications.view", permissions);

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("ALL");
  const [severityFilter, setSeverityFilter] = useState<FilterSeverity>("ALL");

  useEffect(() => {
    if (!organizationId || !canView) return;
    let ignore = false;
    setLoading(true);
    setError(null);

    Promise.all([
      listNotifications(organizationId, { limit: 100 }),
      getUnreadNotificationCount(organizationId),
    ])
      .then(([notifs, count]) => {
        if (ignore) return;
        setNotifications(notifs);
        setUnreadCount(count);
      })
      .catch((err) => {
        if (ignore) return;
        setError(toPublicError(err).message);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [organizationId, canView]);

  const handleMarkRead = async (id: string) => {
    try {
      await markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, status: "READ", readAt: new Date().toISOString() } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error("Failed to mark notification read:", err);
    }
  };

  const handleMarkAllRead = async () => {
    if (!organizationId) return;
    try {
      await markAllNotificationsRead(organizationId);
      setNotifications((prev) =>
        prev.map((n) =>
          n.status === "UNREAD" ? { ...n, status: "READ", readAt: new Date().toISOString() } : n,
        ),
      );
      setUnreadCount(0);
    } catch (err) {
      console.error("Failed to mark all read:", err);
    }
  };

  const handleArchive = async (id: string) => {
    try {
      await archiveNotification(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, status: "ARCHIVED" } : n)),
      );
    } catch (err) {
      console.error("Failed to archive notification:", err);
    }
  };

  const filteredNotifications = notifications.filter((n) => {
    if (statusFilter === "UNREAD" && n.status !== "UNREAD") return false;
    if (statusFilter === "ARCHIVED" && n.status !== "ARCHIVED") return false;
    if (severityFilter !== "ALL" && n.severity !== severityFilter) return false;
    return true;
  });

  if (!canView) {
    return <AccessDenied capability="view notifications" permission="notifications.view" />;
  }

  if (loading) {
    return <LoadingBlock label="Loading notifications..." />;
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Notifications</h1>
          <p className="mt-1 text-sm text-gray-600">
            {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </button>
        )}
      </div>

      <div className="mb-4 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-500" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as FilterStatus)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          >
            <option value="ALL">All status</option>
            <option value="UNREAD">Unread</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as FilterSeverity)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        >
          <option value="ALL">All severity</option>
          <option value="LOW">Low</option>
          <option value="NORMAL">Normal</option>
          <option value="HIGH">High</option>
          <option value="CRITICAL">Critical</option>
        </select>
      </div>

      {filteredNotifications.length === 0 ? (
        <EmptyState
          icon={<Bell className="h-12 w-12" />}
          title="No notifications"
          description="You're all caught up. Notifications will appear here when something needs your attention."
        />
      ) : (
        <div className="space-y-2">
          {filteredNotifications.map((notification) => (
            <div
              key={notification.id}
              className={clsx(
                "rounded-lg border p-4 transition-colors",
                notification.status === "UNREAD"
                  ? "border-green-200 bg-green-50"
                  : "border-gray-200 bg-white",
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-gray-900">{notification.title}</h3>
                    {notification.severity === "CRITICAL" && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                        Critical
                      </span>
                    )}
                    {notification.severity === "HIGH" && (
                      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">
                        High
                      </span>
                    )}
                    {notification.status === "UNREAD" && (
                      <span className="h-2 w-2 rounded-full bg-green-600" />
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-600">{notification.message}</p>
                  <p className="mt-2 text-xs text-gray-500">
                    {format(parseISO(notification.createdAt), "MMM d, yyyy h:mm a")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {notification.status === "UNREAD" && (
                    <button
                      onClick={() => handleMarkRead(notification.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      title="Mark as read"
                    >
                      <Check className="h-3 w-3" />
                      Read
                    </button>
                  )}
                  {notification.status !== "ARCHIVED" && (
                    <button
                      onClick={() => handleArchive(notification.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      title="Archive"
                    >
                      <Archive className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
