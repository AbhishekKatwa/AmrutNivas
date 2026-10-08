/**
 * Rate calendar — hotel rate plan management and calendar view.
 *
 * Shows rate plans, seasonal pricing, and date-specific rates.
 * Supports viewing and editing rates by date range.
 */

import { useEffect, useState } from "react";
import { Calendar, TrendingUp, Sun, Snowflake } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { can } from "@/domain/identity/types";
import { useContextStore } from "@/state/context-store";
import { listSeasons, createSeason } from "@/domain/revenue/pricing-service";
import { toPublicError } from "@/lib/errors";
import { format, addDays } from "date-fns";
import type { Season } from "@/domain/revenue/types";
import { requireSupabase } from "@/db/client";

export default function RateCalendar() {
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const organizationId = context.organizationId;
  const propertyId = context.propertyId;

  const canView = can("revenue.pricing.view", permissions);
  const canEdit = can("revenue.pricing.edit", permissions);

  const [seasons, setSeasons] = useState<Season[]>([]);
  const [roomRates, setRoomRates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateSeason, setShowCreateSeason] = useState(false);

  useEffect(() => {
    if (!organizationId || !propertyId || !canView) return;
    loadData();
  }, [organizationId, propertyId, canView]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const seasonsList = listSeasons(organizationId!, propertyId!);
      setSeasons(seasonsList);

      // Load room rates from Supabase
      const sb = requireSupabase();
      const startDate = format(new Date(), "yyyy-MM-dd");
      const endDate = format(addDays(new Date(), 30), "yyyy-MM-dd");

      const { data: rates } = await sb
        .from("room_rates")
        .select("*")
        .eq("organization_id", organizationId!)
        .eq("property_id", propertyId!)
        .gte("rate_date", startDate)
        .lte("rate_date", endDate)
        .order("rate_date");

      setRoomRates(rates ?? []);
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setLoading(false);
    }
  };

  if (!canView) {
    return <AccessDenied capability="Rate Calendar" permission="revenue.pricing.view" />;
  }

  if (loading) {
    return <LoadingBlock label="Loading rate calendar…" />;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Rate Calendar</h1>
          <p className="mt-1 text-sm text-gray-600">
            Hotel rate plans, seasonal pricing, and date-specific rates
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowCreateSeason(true)}
            className="flex items-center gap-2 rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
          >
            <Calendar className="h-4 w-4" />
            Add Season
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-900">
          {error}
        </div>
      )}

      {/* Seasons */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Seasonal Pricing</h2>
        {seasons.length === 0 ? (
          <EmptyState
            title="No seasons configured"
            description="Add seasonal pricing to adjust rates during peak and off-peak periods."
            icon={<Sun className="h-12 w-12 text-gray-400" />}
          />
        ) : (
          <div className="space-y-3">
            {seasons.map((season) => (
              <div key={season.id} className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
                <div className="flex items-center gap-3">
                  {season.name.toLowerCase().includes("summer") || season.name.toLowerCase().includes("peak") ? (
                    <Sun className="h-5 w-5 text-orange-500" />
                  ) : (
                    <Snowflake className="h-5 w-5 text-blue-500" />
                  )}
                  <div>
                    <div className="font-medium text-gray-900">{season.name}</div>
                    <div className="text-sm text-gray-600">
                      {season.startDate} to {season.endDate}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-gray-900">
                    {Number(season.multiplier) > 1 ? "+" : ""}
                    {((Number(season.multiplier) - 1) * 100).toFixed(0)}%
                  </div>
                  <div className="text-xs text-gray-500">
                    {season.isActive ? "Active" : "Inactive"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rate Calendar Grid */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Next 30 Days</h2>
        {roomRates.length === 0 ? (
          <EmptyState
            title="No rates configured"
            description="Room rates will appear here once configured."
            icon={<TrendingUp className="h-12 w-12 text-gray-400" />}
          />
        ) : (
          <div className="grid grid-cols-7 gap-2">
            {roomRates.slice(0, 30).map((rate) => (
              <div key={rate.id} className="rounded border border-gray-200 p-2 text-center">
                <div className="text-xs text-gray-600">
                  {format(new Date(rate.rate_date), "MMM d")}
                </div>
                <div className="text-sm font-semibold text-gray-900">
                  ₹{Number(rate.base_rate).toLocaleString("en-IN")}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreateSeason && canEdit && (
        <CreateSeasonForm
          organizationId={organizationId!}
          propertyId={propertyId!}
          onClose={() => setShowCreateSeason(false)}
          onCreated={() => {
            setShowCreateSeason(false);
            loadData();
          }}
        />
      )}
    </div>
  );
}

function CreateSeasonForm({
  organizationId,
  propertyId,
  onClose,
  onCreated,
}: {
  organizationId: string;
  propertyId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("01-01");
  const [endDate, setEndDate] = useState("01-31");
  const [multiplier, setMultiplier] = useState("1.25");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      createSeason(organizationId, propertyId, {
        name,
        startDate,
        endDate,
        multiplier,
      });
      onCreated();
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Add Season</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g., Peak Season, Monsoon"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start (MM-DD)</label>
              <input
                type="text"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                placeholder="01-01"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End (MM-DD)</label>
              <input
                type="text"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
                placeholder="01-31"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Price Multiplier
            </label>
            <input
              type="number"
              value={multiplier}
              onChange={(e) => setMultiplier(e.target.value)}
              required
              step="0.01"
              min="0.5"
              max="3"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">
              1.25 = 25% higher, 0.80 = 20% lower
            </p>
          </div>
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
            >
              {saving ? "Adding…" : "Add Season"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
