/**
 * Platform Organizations — manage all organizations on the AMRUT NIVAAS platform.
 *
 * Platform admin can search, view, suspend, reactivate and archive organizations.
 * This is platform-level management, not organization-internal operations.
 */

import { useEffect, useState } from "react";
import { Search, Building2, MoreVertical } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { can } from "@/domain/identity/types";
import { toPublicError } from "@/lib/errors";
import { useContextStore } from "@/state/context-store";

type Organization = {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  propertiesCount: number;
  usersCount: number;
  createdAt: string;
};

export default function PlatformOrganizationsPage() {
  const permissions = useContextStore((s) => s.permissions);
  const canView = can("platform.organization.view", permissions);

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!canView) return;
    let ignore = false;
    setLoading(true);
    setError(null);

    // TODO: Fetch organizations from platform service
    setTimeout(() => {
      if (!ignore) {
        setOrganizations([]);
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
        icon={<Building2 aria-hidden />}
        title="Platform access required"
        description="You need platform.organization.view permission to access this page."
      />
    );
  }

  if (loading) {
    return <LoadingBlock label="Loading organizations…" />;
  }

  if (error) {
    return (
      <EmptyState
        icon={<Building2 aria-hidden />}
        title="Failed to load organizations"
        description={error}
      />
    );
  }

  const filtered = organizations.filter(
    (org) =>
      org.name.toLowerCase().includes(search.toLowerCase()) ||
      org.slug.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          <Building2 className="size-5 shrink-0 text-brand-600" aria-hidden />
          Organizations
        </h2>
        <p className="mt-1 text-sm text-muted">
          Manage all organizations on the AMRUT NIVAAS platform.
        </p>
      </header>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search organizations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-muted focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Building2 aria-hidden />}
          title="No organizations found"
          description={search ? "Try a different search term." : "No organizations on the platform yet."}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full">
            <thead className="border-b border-border bg-surface-alt">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                  Organization
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                  Plan
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                  Properties
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                  Users
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                  Created
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((org) => (
                <tr key={org.id} className="hover:bg-surface-alt">
                  <td className="px-4 py-3">
                    <div>
                      <div className="font-medium text-ink">{org.name}</div>
                      <div className="text-xs text-muted">{org.slug}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-ink">{org.plan}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        org.status === "ACTIVE"
                          ? "bg-success/10 text-success"
                          : org.status === "TRIALING"
                            ? "bg-blue-50 text-blue-700"
                            : org.status === "SUSPENDED"
                              ? "bg-danger/10 text-danger"
                              : "bg-muted/10 text-muted"
                      }`}
                    >
                      {org.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-ink">{org.propertiesCount}</td>
                  <td className="px-4 py-3 text-sm text-ink">{org.usersCount}</td>
                  <td className="px-4 py-3 text-sm text-muted">
                    {new Date(org.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button className="rounded p-1 text-muted hover:bg-surface-alt hover:text-ink">
                      <MoreVertical className="size-4" />
                    </button>
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
