/**
 * Communication history — list of outbound communications (email, SMS, WhatsApp).
 *
 * Shows sent messages with status, recipient, channel, and template.
 * Filters by date, channel, status, and event type.
 */

import { useEffect, useState } from "react";
import { Mail, MessageSquare, Phone } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { can } from "@/domain/identity/types";
import {
  listCommunicationMessages,
  type CommunicationMessage,
} from "@/domain/notifications/notifications-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore } from "@/state/context-store";
import { format, parseISO } from "date-fns";
import clsx from "clsx";

type FilterChannel = "ALL" | "EMAIL" | "SMS" | "WHATSAPP";
type FilterStatus = "ALL" | "QUEUED" | "SENT" | "DELIVERED" | "FAILED";

export default function CommunicationHistory() {
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const organizationId = context.organizationId;

  const canView = can("communications.view", permissions);

  const [messages, setMessages] = useState<CommunicationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<FilterChannel>("ALL");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("ALL");

  useEffect(() => {
    if (!organizationId || !canView) return;
    let ignore = false;
    setLoading(true);
    setError(null);

    listCommunicationMessages(organizationId, { limit: 100 })
      .then((data) => {
        if (ignore) return;
        setMessages(data);
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

  const filteredMessages = messages.filter((m) => {
    if (channelFilter !== "ALL" && m.channel !== channelFilter) return false;
    if (statusFilter !== "ALL" && m.status !== statusFilter) return false;
    return true;
  });

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case "EMAIL":
        return <Mail className="h-4 w-4" />;
      case "SMS":
        return <Phone className="h-4 w-4" />;
      case "WHATSAPP":
        return <MessageSquare className="h-4 w-4" />;
      default:
        return null;
    }
  };

  if (!canView) {
    return <AccessDenied capability="view communications" permission="communications.view" />;
  }

  if (loading) {
    return <LoadingBlock label="Loading communications..." />;
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
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Communication History</h1>
        <p className="mt-1 text-sm text-gray-600">
          Outbound emails, SMS, and WhatsApp messages sent to customers and users.
        </p>
      </div>

      <div className="mb-4 flex items-center gap-4">
        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value as FilterChannel)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        >
          <option value="ALL">All channels</option>
          <option value="EMAIL">Email</option>
          <option value="SMS">SMS</option>
          <option value="WHATSAPP">WhatsApp</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as FilterStatus)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        >
          <option value="ALL">All status</option>
          <option value="QUEUED">Queued</option>
          <option value="SENT">Sent</option>
          <option value="DELIVERED">Delivered</option>
          <option value="FAILED">Failed</option>
        </select>
      </div>

      {filteredMessages.length === 0 ? (
        <EmptyState
          icon={<Mail className="h-12 w-12" />}
          title="No communications"
          description="Communication history will appear here when messages are sent."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-600">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-600">
                  Channel
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-600">
                  Recipient
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-600">
                  Subject / Body
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-600">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-600">
                  Provider
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filteredMessages.map((message) => (
                <tr key={message.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                    {format(parseISO(message.createdAt), "MMM d, yyyy h:mm a")}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="flex items-center gap-2 text-sm text-gray-900">
                      {getChannelIcon(message.channel)}
                      <span className="font-medium">{message.channel}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                    {message.recipientType}
                    {message.recipientId && ` #${message.recipientId.slice(0, 8)}`}
                  </td>
                  <td className="px-6 py-4">
                    <div className="max-w-md">
                      {message.subject && (
                        <div className="truncate text-sm font-medium text-gray-900">
                          {message.subject}
                        </div>
                      )}
                      <div className="truncate text-sm text-gray-600">{message.body}</div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span
                      className={clsx(
                        "inline-flex items-center rounded-full px-2 py-1 text-xs font-medium",
                        message.status === "DELIVERED"
                          ? "bg-green-100 text-green-800"
                          : message.status === "SENT"
                            ? "bg-blue-100 text-blue-800"
                            : message.status === "FAILED"
                              ? "bg-red-100 text-red-800"
                              : message.status === "QUEUED"
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-gray-100 text-gray-800",
                      )}
                    >
                      {message.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                    {message.provider || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
