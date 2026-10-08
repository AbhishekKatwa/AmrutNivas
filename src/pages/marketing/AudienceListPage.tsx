import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import type { EntityId } from "@/domain/identity/types";
import { can, type ActiveContext } from "@/domain/identity/types";
import type { MarketingAudience } from "@/domain/marketing/types";
import { listAudiences } from "@/domain/marketing/marketing-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

type View = "bootstrapping" | "unconfigured" | "unauthenticated" | "no_organization" | "scoped";

function pageStatusFor(status: ContextStatus, context: ActiveContext): View {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") return context.organizationId !== null ? "scoped" : "no_organization";
  return "bootstrapping";
}

export default function AudienceListPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const orgId = context.organizationId as EntityId | null;

  const canView = can("marketing.audience.view", permissions);
  const canCreate = can("marketing.audience.create", permissions);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [audiences, setAudiences] = useState<MarketingAudience[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || !orgId || !canView) return;
    setLoading(true);
    setError(null);
    try {
      setAudiences([...listAudiences(orgId)]);
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setLoading(false);
    }
  }, [view, orgId, canView]);

  if (view === "bootstrapping" || loading) {
    return <LoadingBlock label="Loading audiences…" />;
  }

  if (!canView) {
    return (
      <EmptyState
        icon={<Users />}
        title="Audiences"
        description="You don't have permission to view audiences."
      />
    );
  }

  if (error) {
    return <EmptyState icon={<AlertTriangle />} title="Error" description={error} />;
  }

  const filtered = audiences.filter((a) =>
    !search || a.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#17201B]">Audiences</h1>
          <p className="text-sm text-[#66706A] mt-1">
            Define and manage target audience segments for campaigns
          </p>
        </div>
        {canCreate && (
          <Button variant="primary" size="sm">
            <Plus className="w-4 h-4 mr-1" /> New Audience
          </Button>
        )}
      </div>

      <Card className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#66706A]" />
          <input
            type="text"
            placeholder="Search audiences…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-[#E3E7E3] rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="No audiences found"
          description={search ? "Try adjusting your search." : "Create your first audience to target campaigns."}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-50">
                    <Users className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-[#17201B]">{a.name}</h3>
                    <p className="text-xs text-[#66706A] mt-0.5">
                      {a.sourceType === "DYNAMIC" ? "Dynamic" : "Snapshot"}
                    </p>
                  </div>
                </div>
              </div>
              {a.description && (
                <p className="text-xs text-[#66706A] mt-3 line-clamp-2">{a.description}</p>
              )}
              {a.definition?.conditions && (
                <p className="text-xs text-[#66706A] mt-2">
                  {a.definition.conditions.length} condition{a.definition.conditions.length !== 1 ? "s" : ""} · {a.definition.matchMode}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
