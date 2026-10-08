/**
 * Direct Booking — the property's own booking engine.
 *
 * Phase 8 destination. Shows direct booking channel performance,
 * booking widget setup, and recent direct reservations.
 * Reads from reservations table filtering by source = DIRECT/WEBSITE.
 */

import { useEffect, useState } from "react";
import { Calendar, Globe, Link2, Copy, Check, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { useContextStore } from "@/state/context-store";
import { requireSupabase } from "@/db/client";

type DirectBooking = {
  id: string;
  number: string;
  guest: string;
  arrival: string;
  departure: string;
  status: string;
  amount: number;
};

export default function DirectBookingPage() {
  const context = useContextStore((s) => s.context);
  const organizationId = context.organizationId;

  const [bookings, setBookings] = useState<DirectBooking[]>([]);
  const [allSourceCounts, setAllSourceCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    let ignore = false;

    async function load() {
      setLoading(true);
      try {
        const sb = requireSupabase();

        const [directRes, allRes] = await Promise.all([
          sb
            .from("reservations")
            .select("id, reservation_number, source, status, arrival_date, departure_date, total_amount, primary_guest_id")
            .eq("organization_id", organizationId)
            .in("source", ["DIRECT", "WEBSITE"])
            .order("arrival_date", { ascending: false })
            .limit(30),
          sb
            .from("reservations")
            .select("source")
            .eq("organization_id", organizationId),
        ]);

        const guestIds = [...new Set((directRes.data || []).map((r) => r.primary_guest_id))];
        let guestNames = new Map<string, string>();
        if (guestIds.length > 0) {
          const { data: guests } = await sb
            .from("guests")
            .select("id, full_name")
            .in("id", guestIds);
          guestNames = new Map((guests || []).map((g) => [g.id, g.full_name]));
        }

        const directBookings: DirectBooking[] = (directRes.data || []).map((r) => ({
          id: r.id,
          number: r.reservation_number,
          guest: guestNames.get(r.primary_guest_id) || "Guest",
          arrival: r.arrival_date,
          departure: r.departure_date,
          status: r.status,
          amount: Number(r.total_amount || 0),
        }));

        const counts: Record<string, number> = {};
        (allRes.data || []).forEach((r) => {
          counts[r.source] = (counts[r.source] || 0) + 1;
        });

        if (!ignore) {
          setBookings(directBookings);
          setAllSourceCounts(counts);
          setLoading(false);
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    }

    load();
    return () => { ignore = true; };
  }, [organizationId]);

  if (loading) return <LoadingBlock label="Loading direct bookings" />;

  const directCount = bookings.length;
  const directRevenue = bookings.reduce((s, b) => s + b.amount, 0);
  const totalReservations = Object.values(allSourceCounts).reduce((s, n) => s + n, 0);
  const directShare = totalReservations > 0 ? (directCount / totalReservations) * 100 : 0;

  const widgetCode = `<!-- AMRUT NIVAAS Booking Widget -->
<div id="nivaas-booking" data-org="${organizationId || "YOUR_ORG_ID"}"></div>
<script src="https://cdn.amrutnivaas.com/booking-widget.js" async></script>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(widgetCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const confirmed = bookings.filter((b) => b.status === "CONFIRMED" || b.status === "CHECKED_IN" || b.status === "CHECKED_OUT");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Direct Booking</h1>
        <p className="mt-1 text-sm text-muted">
          Your property's own booking channel — commission-free reservations.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Direct Bookings" description="Commission-free">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50">
              <Globe className="size-5 text-brand-700" />
            </div>
            <div className="text-2xl font-semibold text-ink tabular-nums">{directCount}</div>
          </div>
        </Card>
        <Card title="Direct Revenue" description="Total value">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-success-soft">
              <TrendingUp className="size-5 text-success" />
            </div>
            <div className="text-2xl font-semibold text-ink tabular-nums">
              ₹{directRevenue.toLocaleString("en-IN")}
            </div>
          </div>
        </Card>
        <Card title="Direct Share" description="Of all bookings">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-amber-50">
              <Calendar className="size-5 text-amber-600" />
            </div>
            <div className="text-2xl font-semibold text-ink tabular-nums">
              {directShare.toFixed(1)}%
            </div>
          </div>
        </Card>
        <Card title="Confirmed" description="Active bookings">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-surface-sunken">
              <Calendar className="size-5 text-muted" />
            </div>
            <div className="text-2xl font-semibold text-ink tabular-nums">{confirmed.length}</div>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Booking Widget" description="Embed this on your website">
          <div className="space-y-3">
            <div className="rounded-lg bg-surface-sunken p-3">
              <pre className="overflow-x-auto text-xs text-ink whitespace-pre-wrap font-mono">
                {widgetCode}
              </pre>
            </div>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copied!" : "Copy embed code"}
            </button>
          </div>
        </Card>

        <Card title="Booking Sources" description="Channel breakdown">
          <div className="space-y-2">
            {Object.entries(allSourceCounts)
              .sort(([, a], [, b]) => b - a)
              .map(([source, count]) => {
                const isDirect = source === "DIRECT" || source === "WEBSITE";
                const pct = totalReservations > 0 ? (count / totalReservations) * 100 : 0;
                return (
                  <div key={source} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`size-2 rounded-full ${isDirect ? "bg-success" : "bg-muted"}`} />
                      <span className="text-sm text-ink">{source.replace(/_/g, " ")}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-sunken">
                        <div
                          className={`h-full rounded-full ${isDirect ? "bg-success" : "bg-muted"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-ink tabular-nums w-8 text-right">{count}</span>
                    </div>
                  </div>
                );
              })}
            {totalReservations === 0 && (
              <div className="py-4 text-center text-sm text-muted">No reservations yet</div>
            )}
          </div>
        </Card>
      </div>

      {bookings.length === 0 ? (
        <EmptyState
          icon={<Globe />}
          title="No direct bookings yet"
          description="Direct and website bookings will appear here. Embed the booking widget on your website to start accepting commission-free reservations."
        />
      ) : (
        <Card title="Recent Direct Bookings">
          <div className="divide-y divide-line">
            {bookings.slice(0, 15).map((booking) => (
              <div key={booking.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50">
                    <Link2 className="size-5 text-brand-700" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-ink">{booking.number}</div>
                    <div className="text-xs text-muted">
                      {booking.guest} · {booking.arrival} → {booking.departure}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-ink tabular-nums">
                    ₹{booking.amount.toLocaleString("en-IN")}
                  </div>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    booking.status === "CONFIRMED" || booking.status === "CHECKED_IN"
                      ? "bg-success-soft text-success"
                      : booking.status === "CANCELLED"
                        ? "bg-danger-soft text-danger"
                        : booking.status === "CHECKED_OUT"
                          ? "bg-surface-sunken text-muted"
                          : "bg-amber-50 text-amber-600"
                  }`}>
                    {booking.status.replace(/_/g, " ")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
