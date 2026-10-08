/**
 * Commerce Channels — manage digital sales channels for the organization.
 *
 * Channels represent the different ways customers can order or book:
 * QR menu, table QR ordering, online ordering, direct booking, website, etc.
 * Each channel can be configured per property or outlet.
 */

import { useEffect, useMemo, useState } from "react";
import { CircleSlash, LogIn, Radio, Plus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { Button } from "@/components/ui/Button";
import { can, type ActiveContext } from "@/domain/identity/types";
import {
  listCommerceChannels,
  createCommerceChannel,
  updateCommerceChannel,
  type CommerceScope,
} from "@/domain/commerce/commerce-service";
import type { CommerceChannel, CommerceChannelType, CommerceChannelStatus } from "@/domain/commerce/types";
import { COMMERCE_CHANNEL_TYPES } from "@/domain/commerce/types";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

export type ChannelsView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_organization"
  | "scoped";

export function pageStatusFor(status: ContextStatus, context: ActiveContext): ChannelsView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null ? "scoped" : "no_organization";
  }
  return "bootstrapping";
}

const NO_BACKEND_COPY = "This build has no backend configured, so it cannot read commerce channels.";

export default function ChannelsPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const storeError = useContextStore((s) => s.error);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const scope = useMemo<CommerceScope | null>(
    () => (context.organizationId !== null ? { organizationId: context.organizationId } : null),
    [context.organizationId],
  );

  const canView = can("commerce.channel.view", permissions);
  const canManage = can("commerce.channel.manage", permissions);

  const [channels, setChannels] = useState<CommerceChannel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || scope === null || !canView) return;
    void loadChannels();
  }, [view, scope, canView]);

  async function loadChannels() {
    if (scope === null) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listCommerceChannels(scope);
      setChannels(data);
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(params: { name: string; type: CommerceChannelType; propertyId?: string; outletId?: string }) {
    if (scope === null) return;
    try {
      await createCommerceChannel(scope, params);
      setShowCreateDialog(false);
      await loadChannels();
    } catch (err) {
      setError(toPublicError(err).message);
    }
  }

  async function handleToggleStatus(channel: CommerceChannel) {
    if (scope === null) return;
    const newStatus: CommerceChannelStatus = channel.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      await updateCommerceChannel(scope, channel.id, { status: newStatus });
      await loadChannels();
    } catch (err) {
      setError(toPublicError(err).message);
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
            <Radio className="size-5 shrink-0 text-brand-600" aria-hidden />
            Channels
          </h2>
          <p className="mt-1 text-sm text-muted">
            Digital sales channels for ordering and booking.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setShowCreateDialog(true)} icon={<Plus className="size-4" aria-hidden />}>
            Add Channel
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
          title="Sign in to manage channels"
          description="There is no active session for this build to read a tenant from."
        />
      )}

      {view === "no_organization" && (
        <EmptyState
          icon={<Radio aria-hidden />}
          title="Choose an organization first"
          description="Commerce channels belong to an organization. Pick one and this screen will show its channels."
        />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied capability="view commerce channels" permission="commerce.channel.view" />
      )}

      {view === "scoped" && scope !== null && canView && (
        <>
          {error !== null && (
            <p role="alert" className="rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}

          {loading ? (
            <LoadingBlock label="Loading channels…" />
          ) : channels.length === 0 ? (
            <EmptyState
              icon={<Radio aria-hidden />}
              title="No channels configured"
              description="Create your first commerce channel to enable digital ordering or booking."
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {channels.map((channel) => (
                <Card key={channel.id} className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-ink">{channel.name}</h3>
                      <p className="mt-0.5 text-xs text-muted">{formatType(channel.type)}</p>
                    </div>
                    <StatusBadge status={channel.status} />
                  </div>

                  <div className="text-xs text-muted">
                    Created {new Date(channel.createdAt).toLocaleDateString()}
                  </div>

                  {canManage && (
                    <div className="border-t border-border pt-3">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleToggleStatus(channel)}
                      >
                        {channel.status === "ACTIVE" ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {showCreateDialog && (
        <CreateChannelDialog
          onClose={() => setShowCreateDialog(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}

function formatType(type: CommerceChannelType): string {
  return type.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function StatusBadge({ status }: { status: CommerceChannelStatus }) {
  const styles = {
    ACTIVE: "bg-success-soft text-success",
    INACTIVE: "bg-muted text-ink",
  };

  return (
    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}

function CreateChannelDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (params: { name: string; type: CommerceChannelType; propertyId?: string; outletId?: string }) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<CommerceChannelType>("QR_MENU");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-md">
        <h3 className="text-lg font-semibold text-ink">Add Commerce Channel</h3>
        <p className="mt-1 text-sm text-muted">
          Create a new digital sales channel for ordering or booking.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Restaurant QR Menu"
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as CommerceChannelType)}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {COMMERCE_CHANNEL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {formatType(t)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onCreate({ name, type })} disabled={!name.trim()}>
            Create
          </Button>
        </div>
      </Card>
    </div>
  );
}
