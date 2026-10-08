import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Gift,
  Tag,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import type { EntityId } from "@/domain/identity/types";
import { can, type ActiveContext } from "@/domain/identity/types";
import type { MarketingOffer, OfferRedemption, PromotionCode } from "@/domain/marketing/types";
import {
  getOffer,
  listPromoCodes,
  listRedemptions,
} from "@/domain/marketing/marketing-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

type View = "bootstrapping" | "unconfigured" | "unauthenticated" | "no_organization" | "scoped";

function pageStatusFor(status: ContextStatus, context: ActiveContext): View {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") return context.organizationId !== null ? "scoped" : "no_organization";
  return "bootstrapping";
}

function statusTone(s: string): "success" | "warning" | "danger" | "neutral" {
  switch (s) {
    case "ACTIVE": return "success";
    case "DRAFT": return "neutral";
    case "EXPIRED": return "warning";
    case "DISABLED": return "danger";
    default: return "neutral";
  }
}

export default function OfferDetailPage() {
  const { offerId } = useParams<{ offerId: string }>();
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const orgId = context.organizationId as EntityId | null;
  const canView = can("marketing.offer.view", permissions);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offer, setOffer] = useState<MarketingOffer | null>(null);
  const [promoCodes, setPromoCodes] = useState<PromotionCode[]>([]);
  const [redemptions, setRedemptions] = useState<OfferRedemption[]>([]);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || !offerId || !canView || !orgId) return;
    setLoading(true);
    setError(null);
    try {
      const o = getOffer(offerId as EntityId);
      if (o) {
        setOffer(o);
        setPromoCodes([...listPromoCodes(orgId, o.id)]);
        setRedemptions([...listRedemptions(orgId, { offerId: o.id })]);
      }
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setLoading(false);
    }
  }, [view, offerId, orgId, canView]);

  if (view === "bootstrapping" || loading) {
    return <LoadingBlock label="Loading offer…" />;
  }

  if (!canView || !offer) {
    return (
      <EmptyState
        icon={<Gift />}
        title="Offer not found"
        description={!canView ? "You don't have permission to view this offer." : "This offer does not exist."}
      />
    );
  }

  if (error) {
    return <EmptyState icon={<AlertTriangle />} title="Error" description={error} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/marketing/offers">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-[#17201B]">{offer.name}</h1>
            <Badge tone={statusTone(offer.status)}>{offer.status}</Badge>
          </div>
          <p className="text-sm text-[#66706A] mt-1">
            {offer.offerType.replace(/_/g, " ")}{offer.scope ? ` · ${offer.scope.replace(/_/g, " ")}` : ""}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-xs text-[#66706A]">Value</p>
          <p className="text-xl font-bold text-[#17201B]">
            {offer.offerType === "PERCENT_DISCOUNT" ? `${offer.value}%` : `₹${offer.value}`}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-[#66706A]">Redemptions</p>
          <p className="text-xl font-bold text-[#17201B]">{redemptions.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-[#66706A]">Usage Limit</p>
          <p className="text-xl font-bold text-[#17201B]">{offer.usageLimit ?? "∞"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-[#66706A]">Per Customer</p>
          <p className="text-xl font-bold text-[#17201B]">{offer.perCustomerLimit ?? "∞"}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-[#17201B] mb-4">Offer Details</h3>
          <div className="space-y-3">
            {offer.description && (
              <div>
                <p className="text-xs text-[#66706A]">Description</p>
                <p className="text-sm text-[#17201B]">{offer.description}</p>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-sm text-[#66706A]">Valid From</span>
              <span className="text-sm font-medium text-[#17201B]">
                {new Date(offer.validFrom).toLocaleDateString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-[#66706A]">Valid Until</span>
              <span className="text-sm font-medium text-[#17201B]">
                {new Date(offer.validUntil).toLocaleDateString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-[#66706A]">Currency</span>
              <span className="text-sm font-medium text-[#17201B]">{offer.currency}</span>
            </div>
            {offer.scopeId && (
              <div className="flex justify-between">
                <span className="text-sm text-[#66706A]">Scope ID</span>
                <span className="text-sm font-medium text-[#17201B] truncate max-w-[150px]">{offer.scopeId}</span>
              </div>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold text-[#17201B] mb-4">Promo Codes</h3>
          {promoCodes.length === 0 ? (
            <p className="text-sm text-[#66706A]">No promo codes linked to this offer.</p>
          ) : (
            <div className="space-y-3">
              {promoCodes.map((pc) => (
                <div key={pc.id} className="flex items-center justify-between p-3 rounded-lg border border-[#E3E7E3]">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-purple-600" />
                    <span className="text-sm font-mono font-semibold text-[#17201B]">{pc.code}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[#66706A]">
                      {pc.usageCount}/{pc.usageLimit ?? "∞"}
                    </span>
                    <Badge tone={statusTone(pc.status)}>{pc.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-[#17201B] mb-4">Recent Redemptions</h3>
        {redemptions.length === 0 ? (
          <p className="text-sm text-[#66706A]">No redemptions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E3E7E3]">
                  <th className="text-left py-2 px-3 text-xs font-medium text-[#66706A]">Customer</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-[#66706A]">Source</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-[#66706A]">Source ID</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-[#66706A]">Value</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-[#66706A]">Date</th>
                </tr>
              </thead>
              <tbody>
                {redemptions.slice(0, 10).map((r) => (
                  <tr key={r.id} className="border-b border-[#E3E7E3] last:border-0">
                    <td className="py-2 px-3 text-[#17201B] truncate max-w-[150px]">{r.customerId ?? "—"}</td>
                    <td className="py-2 px-3 text-[#66706A]">{r.sourceType ?? "—"}</td>
                    <td className="py-2 px-3 text-[#66706A] truncate max-w-[120px]">{r.sourceId ?? "—"}</td>
                    <td className="py-2 px-3 text-[#17201B] font-medium">{r.currency} {r.value}</td>
                    <td className="py-2 px-3 text-[#66706A]">{new Date(r.redeemedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
