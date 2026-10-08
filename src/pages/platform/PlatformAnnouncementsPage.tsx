/**
 * Platform Announcements — broadcast messages to organizations.
 */

import { useEffect, useMemo, useState } from "react";
import {
  CircleSlash,
  LogIn,
  Store,
  Megaphone,
  Plus,
  Search,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { can, type ActiveContext } from "@/domain/identity/types";
import type {
  PlatformAnnouncement,
  AnnouncementSeverity,
  AnnouncementStatus,
} from "@/domain/platform/types";
import { listAllAnnouncements } from "@/domain/platform/platform-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

export type AnnouncementsView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_organization"
  | "scoped";

export function pageStatusFor(
  status: ContextStatus,
  context: ActiveContext,
): AnnouncementsView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null ? "scoped" : "no_organization";
  }
  return "bootstrapping";
}

const NO_BACKEND_COPY =
  "This build has no backend configured, so it cannot read platform announcements.";

const SEVERITY_STYLES: Record<AnnouncementSeverity, string> = {
  INFO: "bg-blue-50 text-blue-700 border-blue-200",
  NOTICE: "bg-brand-50 text-brand-700 border-brand-200",
  WARNING: "bg-amber-50 text-amber-700 border-amber-200",
  CRITICAL: "bg-red-50 text-red-700 border-red-200",
};

const STATUS_STYLES: Record<AnnouncementStatus, string> = {
  DRAFT: "bg-stone-50 text-stone-600 border-stone-200",
  ACTIVE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  ARCHIVED: "bg-stone-50 text-stone-500 border-stone-200",
};

export default function PlatformAnnouncementsPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const storeError = useContextStore((s) => s.error);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const canView = can("platform.announcement.view", permissions);

  const [announcements, setAnnouncements] = useState<PlatformAnnouncement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AnnouncementStatus | "ALL">("ALL");

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || !canView) return;
    let ignore = false;
    setAnnouncements(null);
    setError(null);

    listAllAnnouncements({})
      .then((items) => {
        if (!ignore) setAnnouncements(items);
      })
      .catch((err) => {
        if (!ignore) setError(toPublicError(err).message);
      });

    return () => {
      ignore = true;
    };
  }, [view, canView]);

  const filtered = useMemo(() => {
    if (!announcements) return [];
    const q = search.trim().toLowerCase();
    return announcements.filter((a) => {
      if (statusFilter !== "ALL" && a.status !== statusFilter) return false;
      if (q && !a.title.toLowerCase().includes(q) && !a.message.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [announcements, search, statusFilter]);

  if (view === "bootstrapping") return <LoadingBlock label="Loading announcements…" />;
  if (view === "unconfigured")
    return (
      <EmptyState
        icon={<CircleSlash aria-hidden />}
        title="Backend not configured"
        description={storeError ?? NO_BACKEND_COPY}
      />
    );
  if (view === "unauthenticated")
    return (
      <EmptyState
        icon={<LogIn aria-hidden />}
        title="Sign in to view Announcements"
        description="There is no active session for this build."
      />
    );
  if (view === "no_organization")
    return (
      <EmptyState
        icon={<Store aria-hidden />}
        title="Choose an organization first"
        description="Platform announcements require an active organization context."
      />
    );
  if (!canView) return <AccessDenied capability="view platform announcements" permission="platform.announcement.view" />;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
            <Megaphone className="size-5 shrink-0 text-brand-600" aria-hidden />
            Platform Announcements
          </h2>
          <p className="mt-1 text-sm text-muted">
            Broadcast messages to organizations across the platform.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700"
        >
          <Plus className="size-4" aria-hidden />
          New Announcement
        </button>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search announcements…"
            className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-muted/60 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as AnnouncementStatus | "ALL")}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          <option value="ALL">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="ACTIVE">Active</option>
          <option value="ARCHIVED">Archived</option>
        </select>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {announcements === null ? (
        <LoadingBlock label="Loading announcements…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Megaphone aria-hidden />}
          title="No announcements"
          description={
            search || statusFilter !== "ALL"
              ? "No announcements match your filters."
              : "Create your first platform announcement."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-stone-50/60 text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Announcement</th>
                <th className="px-4 py-3 font-medium">Severity</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Audience</th>
                <th className="px-4 py-3 font-medium">Start</th>
                <th className="px-4 py-3 font-medium">End</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((a) => (
                <tr key={a.id} className="hover:bg-stone-50/40">
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">{a.title}</div>
                    <div className="mt-0.5 line-clamp-1 text-xs text-muted">{a.message}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLES[a.severity]}`}
                    >
                      {a.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[a.status]}`}
                    >
                      {a.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">{a.targetAudience}</td>
                  <td className="px-4 py-3 text-muted">{new Date(a.startAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-muted">
                    {a.endAt ? new Date(a.endAt).toLocaleDateString() : "—"}
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
