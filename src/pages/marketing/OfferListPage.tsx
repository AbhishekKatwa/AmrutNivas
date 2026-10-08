import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  Gift,
  Plus,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import type { EntityId } from "@/domain/identity/types";
import { can, type ActiveContext } from "@/domain/identity/types";
import type { MarketingOffer, OfferStatus } from "@/domain/marketing/types";
import { OFFER_STATUSES } from "@/domain/marketing/types";
import { listOffers } from "@/domain/marketing/marketing-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";
import { Link } from "react-router-dom";

type View = "bootstrapping" | "unconfigured" | "unauthenticated" | "no_organization" | "scoped";

function pageStatusFor(status: ContextStatus, context: ActiveContext): View {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") return context.organizationId !== null ? "scoped" : "no_organization";
  return "bootstrapping";
}

function statusTone(s: OfferStatus): "success" | "warning" | "danger" | "neutral" {
  switch (s) {
    case "ACTIVE": return "success";
    case "DRAFT": return "neutral";
    case "EXPIRED": return "warning";
    case "DISABLED": return "danger";
  }
}

export default function OfferListPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const orgId = context.organizationId as EntityId | null;

  const canView = can("marketing.offer.view", permissions);
  const canCreate = can("marketing.offer.create", permissions);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offers, setOffers] = useState<MarketingOffer[]>([]);
  const [statusFilter, setStatusFilter] = useState<OfferStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || !orgId || !canView) return;
    setLoading(true);
    setError(null);
    try {
      setOffers([...listOffers(orgId)]);
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setLoading(false);
    }
  }, [view, orgId, canView]);

  if (view === "bootstrapping" || loading) {
    return <LoadingBlock label="Loading offers…" />;
  }

  if (!canView) {
    return (
      <EmptyState
        icon={<Gift />}
        title="Offers"
        description="You don't have permission to view offers."
      />
    );
  }

  if (error) {
    return <EmptyState icon={<AlertTriangle />} title="Error" description={error} />;
  }

  const filtered = offers.filter((o) => {
    if (statusFilter !== "ALL" && o.status !== statusFilter) return false;
    if (search && !o.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#17201B]">Offers & Promotions</h1>
          <p className="text-sm text-[#66706A] mt-1">
            Create and manage offers, promo codes, and promotional campaigns
          </p>
        </div>
        {canCreate && (
          <Link to="/marketing/offers/new">
            <Button variant="primary" size="sm">
              <Plus className="w-4 h-4 mr-1" /> New Offer
            </Button>
          </Link>
        )}
      </div>

      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#66706A]" />
            <input
              type="text"
              placeholder="Search offers…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-[#E3E7E3] rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as OfferStatus | "ALL")}
            className="px-3 py-2 text-sm border border-[#E3E7E3] rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="ALL">All Statuses</option>
            {OFFER_STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Gift />}
          title="No offers found"
          description={search || statusFilter !== "ALL" ? "Try adjusting your filters." : "Create your first offer to drive engagement."}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((o) => (
            <Link key={o.id} to={`/marketing/offers/${o.id}`} className="block">
              <Card className="p-4 hover:border-purple-200 transition-colors cursor-pointer">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-purple-50 mt-0.5">
                      <Gift className="w-5 h-5 text-purple-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-[#17201B] truncate">{o.name}</h3>
                        <Badge tone={statusTone(o.status)}>{o.status}</Badge>
                      </div>
                      <p className="text-xs text-[#66706A] mt-1">
                        {o.offerType.replace(/_/g, " ")}{o.scope ? ` · ${o.scope.replace(/_/g, " ")}` : ""}
                      </p>
                      {o.description && (
                        <p className="text-xs text-[#66706A] mt-1 line-clamp-1">{o.description}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-[#66706A]">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(o.validFrom).toLocaleDateString()}
                          {` → ${new Date(o.validUntil).toLocaleDateString()}`}
                        </span>
                        {o.usageLimit != null && (
                          <span>{o.usageLimit} limit</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold text-purple-600">
                      {o.offerType === "PERCENT_DISCOUNT" ? `${o.value}%` : `${o.currency} ${o.value}`}
                    </p>
                    <p className="text-xs text-[#66706A]">{o.offerType.replace(/_/g, " ").toLowerCase()}</p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
