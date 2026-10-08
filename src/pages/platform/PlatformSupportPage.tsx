/**
 * Platform Support — manage support cases across all organizations.
 *
 * Platform support staff can view, assign, and resolve support cases.
 * Support access is time-limited, scoped, and audited.
 */

import { useEffect, useState } from "react";
import { LifeBuoy, Search, Plus } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { can } from "@/domain/identity/types";
import { useContextStore } from "@/state/context-store";
import type { SupportCase, SupportCasePriority, SupportCaseStatus } from "@/domain/platform/types";

export default function PlatformSupportPage() {
  const permissions = useContextStore((s) => s.permissions);
  const canView = can("platform.support.view", permissions);

  const [cases, setCases] = useState<SupportCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SupportCaseStatus | "ALL">("ALL");

  useEffect(() => {
    if (!canView) return;
    let ignore = false;
    setLoading(true);
    setError(null);

    // TODO: Fetch support cases from platform service
    setTimeout(() => {
      if (!ignore) {
        setCases([]);
        setLoading(false);
      }
    }, 500);

    return () => {
      ignore = true;
    };
  }, [canView]);

  if (!canView) {
    return (
      <EmptyState
        icon={<LifeBuoy aria-hidden />}
        title="Platform access required"
        description="You need platform.support.view permission to access this page."
      />
    );
  }

  if (loading) {
    return <LoadingBlock label="Loading support cases…" />;
  }

  if (error) {
    return (
      <EmptyState
        icon={<LifeBuoy aria-hidden />}
        title="Failed to load support cases"
        description={error}
      />
    );
  }

  const filtered = cases.filter((c) => {
    const matchesSearch =
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.description.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const priorityColor = (priority: SupportCasePriority) => {
    switch (priority) {
      case "CRITICAL":
        return "bg-danger/10 text-danger";
      case "URGENT":
        return "bg-orange-50 text-orange-700";
      case "HIGH":
        return "bg-amber-50 text-amber-700";
      case "NORMAL":
        return "bg-blue-50 text-blue-700";
      case "LOW":
        return "bg-muted/10 text-muted";
    }
  };

  const statusColor = (status: SupportCaseStatus) => {
    switch (status) {
      case "OPEN":
        return "bg-blue-50 text-blue-700";
      case "IN_PROGRESS":
        return "bg-amber-50 text-amber-700";
      case "RESOLVED":
        return "bg-success/10 text-success";
      case "CLOSED":
        return "bg-muted/10 text-muted";
      default:
        return "bg-muted/10 text-muted";
    }
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header className="flex items-start justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
            <LifeBuoy className="size-5 shrink-0 text-brand-600" aria-hidden />
            Support Cases
          </h2>
          <p className="mt-1 text-sm text-muted">
            Manage support requests from all organizations.
          </p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          <Plus className="size-4" />
          New Case
        </button>
      </header>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search cases…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-muted focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as SupportCaseStatus | "ALL")}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="ALL">All Status</option>
          <option value="OPEN">Open</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<LifeBuoy aria-hidden />}
          title="No support cases found"
          description={search || statusFilter !== "ALL" ? "Try adjusting your filters." : "No support cases yet."}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full">
            <thead className="border-b border-border bg-surface-alt">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                  Case
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                  Organization
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                  Priority
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                  Assigned To
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-surface-alt">
                  <td className="px-4 py-3">
                    <div>
                      <div className="font-medium text-ink">{c.title}</div>
                      <div className="text-xs text-muted">{c.category}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted">
                    {c.organizationId ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${priorityColor(c.priority)}`}>
                      {c.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(c.status)}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted">
                    {c.assignedTo ?? "Unassigned"}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted">
                    {new Date(c.createdAt).toLocaleDateString()}
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
