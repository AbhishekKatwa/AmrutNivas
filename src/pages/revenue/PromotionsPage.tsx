/**
 * Promotions management — create, edit, and track promotions.
 *
 * Shows active, scheduled, and expired promotions with usage tracking.
 * Supports percentage, fixed, free item, package, and rate override types.
 */

import { useEffect, useState } from "react";
import { Plus, Tag, Calendar, TrendingUp } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { can } from "@/domain/identity/types";
import { useContextStore } from "@/state/context-store";
import {
  listPromotions,
  createPromotion,
} from "@/domain/revenue/pricing-service";
import { toPublicError } from "@/lib/errors";
import { format } from "date-fns";
import type { Promotion, PromotionType, PromotionStatus } from "@/domain/revenue/types";
import clsx from "clsx";

export default function PromotionsPage() {
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const organizationId = context.organizationId;
  const propertyId = context.propertyId;

  const canView = can("revenue.promotion.view", permissions);
  const canCreate = can("revenue.promotion.create", permissions);

  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<PromotionStatus | "ALL">("ALL");
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    if (!organizationId || !propertyId || !canView) return;
    loadPromotions();
  }, [organizationId, propertyId, canView, statusFilter]);

  const loadPromotions = () => {
    setLoading(true);
    setError(null);
    const status = statusFilter === "ALL" ? undefined : statusFilter;
    try {
      setPromotions(listPromotions(organizationId!, propertyId!, status));
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setLoading(false);
    }
  };

  if (!canView) {
    return <AccessDenied capability="Promotions" permission="revenue.promotion.view" />;
  }

  if (loading) {
    return <LoadingBlock label="Loading promotions…" />;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Promotions</h1>
          <p className="mt-1 text-sm text-gray-600">
            Create and manage discount campaigns and special offers
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-2 rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
          >
            <Plus className="h-4 w-4" />
            Create Promotion
          </button>
        )}
      </div>

      {/* Status Filter */}
      <div className="flex gap-2">
        {(["ALL", "ACTIVE", "SCHEDULED", "EXPIRED"] as const).map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={clsx(
              "rounded-lg px-4 py-2 text-sm font-medium",
              statusFilter === status
                ? "bg-green-700 text-white"
                : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50",
            )}
          >
            {status}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-900">
          {error}
        </div>
      )}

      {promotions.length === 0 ? (
        <EmptyState
          title="No promotions"
          description={statusFilter === "ALL" ? "Create your first promotion to start offering discounts." : `No ${statusFilter.toLowerCase()} promotions.`}
          icon={<Tag className="h-12 w-12 text-gray-400" />}
        />
      ) : (
        <div className="space-y-3">
          {promotions.map((promo) => (
            <PromotionCard key={promo.id} promotion={promo} />
          ))}
        </div>
      )}

      {showCreateForm && canCreate && (
        <CreatePromotionForm
          organizationId={organizationId!}
          propertyId={propertyId!}
          onClose={() => setShowCreateForm(false)}
          onCreated={() => {
            setShowCreateForm(false);
            loadPromotions();
          }}
        />
      )}
    </div>
  );
}

function PromotionCard({ promotion }: { promotion: Promotion }) {
  const statusColors = {
    DRAFT: "bg-gray-100 text-gray-800",
    ACTIVE: "bg-green-100 text-green-800",
    SCHEDULED: "bg-blue-100 text-blue-800",
    EXPIRED: "bg-gray-100 text-gray-600",
    ARCHIVED: "bg-gray-100 text-gray-500",
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-gray-900">{promotion.name}</h3>
            <span className={clsx("rounded-full px-2 py-0.5 text-xs font-medium", statusColors[promotion.status])}>
              {promotion.status}
            </span>
          </div>
          {promotion.description && (
            <p className="mt-1 text-sm text-gray-600">{promotion.description}</p>
          )}
          <div className="mt-3 flex items-center gap-4 text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <Tag className="h-4 w-4" />
              <span>
                {promotion.type === "PERCENTAGE" && `${promotion.discountPercentage}% off`}
                {promotion.type === "FIXED" && `₹${promotion.discountAmount} off`}
                {promotion.type === "RATE_OVERRIDE" && `₹${promotion.overridePrice}`}
                {promotion.type === "FREE_ITEM" && `Free item`}
                {promotion.type === "PACKAGE" && `Package deal`}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              <span>
                {format(new Date(promotion.startDate), "MMM d")} - {format(new Date(promotion.endDate), "MMM d, yyyy")}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <TrendingUp className="h-4 w-4" />
              <span>
                {promotion.usageCount} {promotion.usageLimit ? `/ ${promotion.usageLimit}` : ""} uses
              </span>
            </div>
          </div>
        </div>
        <div className="ml-4 text-right">
          <div className="text-sm text-gray-500">Code</div>
          <div className="font-mono text-sm font-medium text-gray-900">{promotion.code}</div>
        </div>
      </div>
    </div>
  );
}

function CreatePromotionForm({
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
  const [code, setCode] = useState("");
  const [type, setType] = useState<PromotionType>("PERCENTAGE");
  const [discountPercentage, setDiscountPercentage] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await createPromotion(organizationId, {
        propertyId,
        code: code.toUpperCase(),
        name,
        type,
        scope: "ALL",
        discountPercentage: type === "PERCENTAGE" ? discountPercentage : undefined,
        discountAmount: type === "FIXED" ? discountAmount : undefined,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        createdBy: "user_admin",
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
      <div className="w-full max-w-2xl rounded-lg bg-white p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Create Promotion</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              required
              placeholder="e.g., SUMMER20"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as PromotionType)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="PERCENTAGE">Percentage Off</option>
              <option value="FIXED">Fixed Amount Off</option>
              <option value="RATE_OVERRIDE">Rate Override</option>
              <option value="FREE_ITEM">Free Item</option>
              <option value="PACKAGE">Package Deal</option>
            </select>
          </div>
          {type === "PERCENTAGE" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Discount Percentage</label>
              <input
                type="number"
                value={discountPercentage}
                onChange={(e) => setDiscountPercentage(e.target.value)}
                required
                min="1"
                max="100"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          )}
          {type === "FIXED" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Discount Amount (₹)</label>
              <input
                type="number"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
                required
                min="1"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
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
              {saving ? "Creating…" : "Create Promotion"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
