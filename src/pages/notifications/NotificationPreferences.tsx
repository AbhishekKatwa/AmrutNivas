/**
 * Notification preferences — user's delivery preferences for notifications.
 *
 * Controls which channels (in-app, email, SMS, WhatsApp) and frequency
 * (immediate, digest, none) for different event types.
 */

import { useEffect, useState } from "react";
import { Bell, Mail, MessageSquare, Phone } from "lucide-react";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { can } from "@/domain/identity/types";
import {
  getNotificationPreferences,
  upsertNotificationPreference,
  type NotificationPreference,
  type EventType,
} from "@/domain/notifications/notifications-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore } from "@/state/context-store";

type Frequency = "IMMEDIATE" | "DAILY_DIGEST" | "WEEKLY_DIGEST" | "NONE";

const EVENT_TYPE_GROUPS = [
  {
    label: "Hotel",
    types: [
      "HOTEL.RESERVATION_CREATED",
      "HOTEL.RESERVATION_CONFIRMED",
      "HOTEL.CHECK_IN",
      "HOTEL.CHECK_OUT",
    ],
  },
  {
    label: "Restaurant",
    types: ["RESTAURANT.ORDER_PLACED", "RESTAURANT.ORDER_READY", "RESTAURANT.ORDER_COMPLETED"],
  },
  {
    label: "Events",
    types: ["EVENTS.EVENT_CREATED", "EVENTS.EVENT_CONFIRMED", "EVENTS.EVENT_COMPLETED"],
  },
  {
    label: "Inventory",
    types: ["INVENTORY.LOW_STOCK", "INVENTORY.WASTAGE_RECORDED"],
  },
  {
    label: "Finance",
    types: ["FINANCE.PAYMENT_RECEIVED", "FINANCE.INVOICE_DUE"],
  },
  {
    label: "HR",
    types: ["HR.LEAVE_APPROVED", "HR.SHIFT_CHANGED"],
  },
];

export default function NotificationPreferences() {
  const permissions = useContextStore((s) => s.permissions);

  const canView = can("notifications.preference.view", permissions);
  const canManage = can("notifications.preference.manage", permissions);

  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!canView) return;
    let ignore = false;
    setLoading(true);
    setError(null);

    getNotificationPreferences()
      .then((data) => {
        if (ignore) return;
        setPreferences(data);
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
  }, [canView]);

  const getPreference = (eventType: string): NotificationPreference | undefined => {
    return preferences.find((p) => p.eventType === eventType);
  };

  const handleToggleChannel = async (
    eventType: string,
    channel: "inAppEnabled" | "emailEnabled" | "smsEnabled" | "whatsappEnabled",
  ) => {
    if (!canManage) return;

    const current = getPreference(eventType);
    const newValue = !current?.[channel];

    setSaving(eventType);
    try {
      await upsertNotificationPreference({
        eventType: eventType as EventType,
        inAppEnabled: channel === "inAppEnabled" ? newValue : current?.inAppEnabled ?? true,
        emailEnabled: channel === "emailEnabled" ? newValue : current?.emailEnabled ?? false,
        smsEnabled: channel === "smsEnabled" ? newValue : current?.smsEnabled ?? false,
        whatsappEnabled:
          channel === "whatsappEnabled" ? newValue : current?.whatsappEnabled ?? false,
        frequency: current?.frequency ?? "IMMEDIATE",
        quietHoursEnabled: current?.quietHoursEnabled ?? false,
      });

      setPreferences((prev) => {
        const existing = prev.find((p) => p.eventType === eventType);
        if (existing) {
          return prev.map((p) =>
            p.eventType === eventType ? { ...p, [channel]: newValue } : p,
          );
        } else {
          return [
            ...prev,
            {
              id: "",
              userId: "", // Will be set by the service layer from session
              eventType: eventType as EventType,
              inAppEnabled: channel === "inAppEnabled" ? newValue : true,
              emailEnabled: channel === "emailEnabled" ? newValue : false,
              smsEnabled: channel === "smsEnabled" ? newValue : false,
              whatsappEnabled: channel === "whatsappEnabled" ? newValue : false,
              frequency: "IMMEDIATE" as const,
              quietHoursEnabled: false,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ];
        }
      });
    } catch (err) {
      console.error("Failed to update preference:", err);
    } finally {
      setSaving(null);
    }
  };

  const handleFrequencyChange = async (eventType: string, frequency: Frequency) => {
    if (!canManage) return;

    const current = getPreference(eventType);

    setSaving(eventType);
    try {
      await upsertNotificationPreference({
        eventType: eventType as EventType,
        inAppEnabled: current?.inAppEnabled ?? true,
        emailEnabled: current?.emailEnabled ?? false,
        smsEnabled: current?.smsEnabled ?? false,
        whatsappEnabled: current?.whatsappEnabled ?? false,
        frequency,
        quietHoursEnabled: current?.quietHoursEnabled ?? false,
      });

      setPreferences((prev) => {
        const existing = prev.find((p) => p.eventType === eventType);
        if (existing) {
          return prev.map((p) =>
            p.eventType === eventType ? { ...p, frequency } : p,
          );
        } else {
          return [
            ...prev,
            {
              id: "",
              userId: "", // Will be set by the service layer from session
              eventType: eventType as EventType,
              inAppEnabled: true,
              emailEnabled: false,
              smsEnabled: false,
              whatsappEnabled: false,
              frequency,
              quietHoursEnabled: false,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ];
        }
      });
    } catch (err) {
      console.error("Failed to update preference:", err);
    } finally {
      setSaving(null);
    }
  };

  if (!canView) {
    return (
      <AccessDenied
        capability="view notification preferences"
        permission="notifications.preference.view"
      />
    );
  }

  if (loading) {
    return <LoadingBlock label="Loading preferences..." />;
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
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Notification Preferences</h1>
        <p className="mt-1 text-sm text-gray-600">
          Choose how you want to receive notifications for different events.
        </p>
      </div>

      <div className="space-y-6">
        {EVENT_TYPE_GROUPS.map((group) => (
          <div key={group.label} className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 bg-gray-50 px-6 py-3">
              <h2 className="font-medium text-gray-900">{group.label}</h2>
            </div>
            <div className="divide-y divide-gray-200">
              {group.types.map((eventType) => {
                const pref = getPreference(eventType);
                const isSaving = saving === eventType;

                return (
                  <div key={eventType} className="px-6 py-4">
                    <div className="mb-3">
                      <div className="text-sm font-medium text-gray-900">
                        {eventType.replace(/\./g, " — ")}
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={pref?.inAppEnabled ?? true}
                            onChange={() => handleToggleChannel(eventType, "inAppEnabled")}
                            disabled={!canManage || isSaving}
                            className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                          />
                          <Bell className="h-4 w-4 text-gray-600" />
                          <span className="text-sm text-gray-700">In-app</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={pref?.emailEnabled ?? false}
                            onChange={() => handleToggleChannel(eventType, "emailEnabled")}
                            disabled={!canManage || isSaving}
                            className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                          />
                          <Mail className="h-4 w-4 text-gray-600" />
                          <span className="text-sm text-gray-700">Email</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={pref?.smsEnabled ?? false}
                            onChange={() => handleToggleChannel(eventType, "smsEnabled")}
                            disabled={!canManage || isSaving}
                            className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                          />
                          <Phone className="h-4 w-4 text-gray-600" />
                          <span className="text-sm text-gray-700">SMS</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={pref?.whatsappEnabled ?? false}
                            onChange={() => handleToggleChannel(eventType, "whatsappEnabled")}
                            disabled={!canManage || isSaving}
                            className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                          />
                          <MessageSquare className="h-4 w-4 text-gray-600" />
                          <span className="text-sm text-gray-700">WhatsApp</span>
                        </label>
                      </div>
                      <div className="ml-auto">
                        <select
                          value={pref?.frequency ?? "IMMEDIATE"}
                          onChange={(e) =>
                            handleFrequencyChange(eventType, e.target.value as Frequency)
                          }
                          disabled={!canManage || isSaving}
                          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:opacity-50"
                        >
                          <option value="IMMEDIATE">Immediate</option>
                          <option value="DAILY_DIGEST">Daily digest</option>
                          <option value="WEEKLY_DIGEST">Weekly digest</option>
                          <option value="NONE">None</option>
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
