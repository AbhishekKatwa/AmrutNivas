/**
 * Enterprise Properties — portfolio view with group management.
 *
 * Shows all properties in the organization with their group associations.
 * Supports creating/editing groups and assigning properties to groups.
 * Enterprise aggregates, never replaces operational modules.
 */

import { useEffect, useMemo, useState } from "react";
import {
  CircleSlash,
  LogIn,
  Store,
  Building2,
  Plus,
  Edit2,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { can, type ActiveContext } from "@/domain/identity/types";
import {
  listPropertyGroups,
  listPropertiesWithGroups,
  createPropertyGroup,
  type PropertyGroupScope,
  type NewPropertyGroup,
} from "@/domain/enterprise/enterprise-service";
import type { PropertyGroup, PropertyWithGroup } from "@/domain/enterprise/types";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

export type EnterprisePropertiesView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_organization"
  | "scoped";

export function pageStatusFor(
  status: ContextStatus,
  context: ActiveContext,
): EnterprisePropertiesView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null ? "scoped" : "no_organization";
  }
  return "bootstrapping";
}

const NO_BACKEND_COPY =
  "This build has no backend configured, so it cannot read property data.";

export default function EnterprisePropertiesPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const storeError = useContextStore((s) => s.error);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const scope = useMemo<PropertyGroupScope | null>(
    () =>
      context.organizationId !== null
        ? { organizationId: context.organizationId }
        : null,
    [context.organizationId],
  );

  const canView = can("enterprise.property.view", permissions);
  const canManage = can("enterprise.group.manage", permissions);

  const [properties, setProperties] = useState<PropertyWithGroup[] | null>(null);
  const [groups, setGroups] = useState<PropertyGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || scope === null || !canView) return;
    let ignore = false;
    setProperties(null);
    setGroups(null);
    setError(null);

    Promise.all([
      listPropertiesWithGroups(scope).catch(() => []),
      listPropertyGroups(scope).catch(() => []),
    ])
      .then(([props, grps]) => {
        if (ignore) return;
        setProperties(props);
        setGroups(grps);
      })
      .catch((err) => {
        if (!ignore) setError(toPublicError(err).message);
      });

    return () => {
      ignore = true;
    };
  }, [view, scope, canView]);

  const handleCreateGroup = async (input: NewPropertyGroup) => {
    try {
      await createPropertyGroup(input);
      setShowCreateGroup(false);
      if (scope) {
        const grps = await listPropertyGroups(scope);
        setGroups(grps);
      }
    } catch (err) {
      setError(toPublicError(err).message);
    }
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
            <Building2 className="size-5 shrink-0 text-brand-600" aria-hidden />
            Properties & Groups
          </h2>
          <p className="mt-1 text-sm text-muted">
            Manage property groups and view the organizational portfolio.
          </p>
        </div>
        {canManage && (
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="size-4" aria-hidden />}
            onClick={() => setShowCreateGroup(true)}
          >
            Create Group
          </Button>
        )}
      </header>

      {view === "bootstrapping" && <LoadingBlock label="Loading your workspace…" />}

      {view === "unconfigured" && (
        <EmptyState
          icon={<CircleSlash aria-hidden />}
          title="Backend not configured"
          description={storeError ?? NO_BACKEND_COPY}
        />
      )}

      {view === "unauthenticated" && (
        <EmptyState
          icon={<LogIn aria-hidden />}
          title="Sign in to view Properties"
          description="There is no active session for this build to read a tenant from."
        />
      )}

      {view === "no_organization" && (
        <EmptyState
          icon={<Store aria-hidden />}
          title="Choose an organization first"
          description="Property data belongs to an organization. Pick one and this screen will show its portfolio."
        />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied
          capability="view enterprise properties"
          permission="enterprise.property.view"
        />
      )}

      {view === "scoped" && scope !== null && canView && (
        <>
          {error !== null && (
            <p
              role="alert"
              className="rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger"
            >
              {error}
            </p>
          )}

          {showCreateGroup && scope && (
            <CreateGroupDialog
              scope={scope}
              onCreate={handleCreateGroup}
              onCancel={() => setShowCreateGroup(false)}
            />
          )}

          {properties === null || groups === null ? (
            <LoadingBlock label="Reading property data…" />
          ) : (
            <>
              <section>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
                  Property Groups ({groups.length})
                </h3>
                {groups.length === 0 ? (
                  <p className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-muted">
                    No property groups yet. Groups help organize properties by region, brand, or business unit.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {groups.map((group) => (
                      <GroupCard key={group.id} group={group} canManage={canManage} />
                    ))}
                  </div>
                )}
              </section>

              <section>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
                  All Properties ({properties.length})
                </h3>
                <div className="overflow-hidden rounded-xl border border-border bg-surface">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border bg-surface-sunken text-xs uppercase tracking-wide text-muted">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">Property</th>
                        <th className="px-4 py-2 text-left font-medium">Type</th>
                        <th className="px-4 py-2 text-left font-medium">Location</th>
                        <th className="px-4 py-2 text-left font-medium">Status</th>
                        <th className="px-4 py-2 text-left font-medium">Group</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {properties.map((property) => (
                        <tr key={property.id} className="hover:bg-surface-sunken">
                          <td className="px-4 py-3">
                            <div className="font-medium text-ink">{property.name}</div>
                            <div className="text-xs text-muted">{property.code}</div>
                          </td>
                          <td className="px-4 py-3 text-muted">{property.type}</td>
                          <td className="px-4 py-3 text-muted">
                            {property.city && property.country
                              ? `${property.city}, ${property.country}`
                              : property.country}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={property.status} />
                          </td>
                          <td className="px-4 py-3">
                            {property.propertyGroupName ? (
                              <Badge tone="brand">{property.propertyGroupName}</Badge>
                            ) : (
                              <span className="text-xs text-muted">Ungrouped</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

function GroupCard({
  group,
  canManage,
}: {
  group: PropertyGroup;
  canManage: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <h4 className="font-semibold text-ink">{group.name}</h4>
          <p className="mt-0.5 text-xs text-muted">{group.code}</p>
          {group.description && (
            <p className="mt-2 text-sm text-muted">{group.description}</p>
          )}
        </div>
        <StatusBadge status={group.status} />
      </div>
      {canManage && (
        <div className="mt-3 flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon={<Edit2 className="size-3.5" aria-hidden />}
          >
            Edit
          </Button>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "ACTIVE"
      ? "success"
      : status === "INACTIVE" || status === "SUSPENDED"
        ? "danger"
        : status === "TEMPORARILY_CLOSED" || status === "COMING_SOON"
          ? "warning"
          : "neutral";
  return <Badge tone={tone}>{status.replace(/_/g, " ")}</Badge>;
}

function CreateGroupDialog({
  scope,
  onCreate,
  onCancel,
}: {
  scope: PropertyGroupScope;
  onCreate: (input: NewPropertyGroup) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) return;
    setSubmitting(true);
    try {
      await onCreate({
        organizationId: scope.organizationId,
        name: name.trim(),
        code: code.trim(),
        description: description.trim() || null,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-raised">
        <h3 className="text-lg font-semibold text-ink">Create Property Group</h3>
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <div>
            <label className="text-sm font-medium text-ink">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium text-ink">Code</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              pattern="^[A-Z0-9][A-Z0-9-]{1,11}$"
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none"
              required
            />
            <p className="mt-1 text-xs text-muted">
              2-12 characters, uppercase letters, numbers, hyphens
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-ink">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none"
            />
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel} type="button">
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              disabled={submitting || !name.trim() || !code.trim()}
            >
              {submitting ? "Creating…" : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
