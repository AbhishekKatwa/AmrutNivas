import { useEffect, useState } from "react";
import {
  Calendar,
  Truck,
  FileText,
  CreditCard,
  AlertCircle,
  Phone,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { can } from "@/domain/identity/types";
import { useContextStore } from "@/state/context-store";
import {
  listProcurementCalendarEvents,
  ensureSupplyChainDemoSeeded,
} from "@/domain/supply-chain/supply-chain-service";
import type { ProcurementCalendarEvent, ProcurementCalendarEventType } from "@/domain/supply-chain/types";
import clsx from "clsx";

const EVENT_ICONS: Record<ProcurementCalendarEventType, React.ReactNode> = {
  EXPECTED_DELIVERY: <Truck className="h-4 w-4 text-blue-600" />,
  PO_DUE: <FileText className="h-4 w-4 text-purple-600" />,
  CONTRACT_EXPIRY: <AlertCircle className="h-4 w-4 text-amber-600" />,
  PAYMENT_DUE: <CreditCard className="h-4 w-4 text-green-600" />,
  SUPPLIER_FOLLOW_UP: <Phone className="h-4 w-4 text-orange-600" />,
};

const EVENT_COLORS: Record<ProcurementCalendarEventType, string> = {
  EXPECTED_DELIVERY: "bg-blue-50 border-blue-200",
  PO_DUE: "bg-purple-50 border-purple-200",
  CONTRACT_EXPIRY: "bg-amber-50 border-amber-200",
  PAYMENT_DUE: "bg-green-50 border-green-200",
  SUPPLIER_FOLLOW_UP: "bg-orange-50 border-orange-200",
};

export default function ProcurementCalendarPage() {
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const organizationId = context.organizationId;
  const propertyId = context.propertyId;

  const canView = can("supply_chain.calendar.view", permissions);

  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<ProcurementCalendarEvent[]>([]);
  const [filter, setFilter] = useState<ProcurementCalendarEventType | "ALL">("ALL");

  useEffect(() => {
    if (!organizationId || !propertyId || !canView) return;
    let ignore = false;
    setLoading(true);

    try {
      ensureSupplyChainDemoSeeded(organizationId, propertyId);
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const result = listProcurementCalendarEvents(organizationId, propertyId, startDate, endDate);
      if (!ignore) setEvents(result);
    } catch {
      if (!ignore) setEvents([]);
    } finally {
      if (!ignore) setLoading(false);
    }

    return () => { ignore = true; };
  }, [organizationId, propertyId, canView]);

  if (!canView) {
    return <AccessDenied capability="Procurement Calendar" permission="supply_chain.calendar.view" />;
  }

  if (loading) {
    return <LoadingBlock label="Loading procurement calendar..." />;
  }

  const filtered = filter === "ALL" ? events : events.filter((e) => e.eventType === filter);
  const grouped = groupByDate(filtered);

  const filterOptions: { key: ProcurementCalendarEventType | "ALL"; label: string }[] = [
    { key: "ALL", label: "All" },
    { key: "EXPECTED_DELIVERY", label: "Deliveries" },
    { key: "PO_DUE", label: "PO Due" },
    { key: "CONTRACT_EXPIRY", label: "Contracts" },
    { key: "PAYMENT_DUE", label: "Payments" },
    { key: "SUPPLIER_FOLLOW_UP", label: "Follow-ups" },
  ];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Procurement Calendar</h1>
        <p className="mt-1 text-sm text-gray-600">
          Expected deliveries, PO due dates, contract expiries, payment schedules, and supplier follow-ups
        </p>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {filterOptions.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setFilter(opt.key)}
            className={clsx(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              filter === opt.key
                ? "bg-green-700 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Events grouped by date */}
      {Object.keys(grouped).length === 0 ? (
        <EmptyState
          icon={<Calendar />}
          title="No upcoming events"
          description="No procurement events scheduled in this period."
        />
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, dateEvents]) => (
              <div key={date}>
                <div className="mb-2 text-sm font-medium text-gray-500">{formatDateLabel(date)}</div>
                <div className="space-y-2">
                  {dateEvents.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function EventCard({ event }: { event: ProcurementCalendarEvent }) {
  return (
    <div className={clsx(
      "flex items-center gap-3 rounded-lg border p-3",
      EVENT_COLORS[event.eventType],
    )}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white">
        {EVENT_ICONS[event.eventType]}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-gray-900">{event.title}</div>
        <div className="text-xs text-gray-500">
          {event.eventType.replace(/_/g, " ")}
          {event.amount != null && ` — ₹${event.amount.toLocaleString("en-IN")}`}
        </div>
      </div>
    </div>
  );
}

function groupByDate(events: ProcurementCalendarEvent[]): Record<string, ProcurementCalendarEvent[]> {
  const result: Record<string, ProcurementCalendarEvent[]> = {};
  for (const event of events) {
    const key = event.date;
    if (!result[key]) result[key] = [];
    result[key].push(event);
  }
  return result;
}

function formatDateLabel(dateStr: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  if (dateStr === today) return "Today";
  if (dateStr === tomorrow) return "Tomorrow";
  if (dateStr === yesterday) return "Yesterday";

  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
