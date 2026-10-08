/**
 * Platform Settings — feature flags, configuration, and maintenance mode.
 */

import { useEffect, useMemo, useState } from "react";
import {
  CircleSlash,
  LogIn,
  Store,
  Settings,
  ToggleLeft,
  ToggleRight,
  Plus,
  Search,
  Database,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { can, type ActiveContext } from "@/domain/identity/types";
import type {
  FeatureFlag,
  FeatureFlagEnvironment,
  PlatformConfiguration,
} from "@/domain/platform/types";
import {
  listFeatureFlags,
  listPlatformConfigurations,
} from "@/domain/platform/platform-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

export type SettingsView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_organization"
  | "scoped";

export function pageStatusFor(
  status: ContextStatus,
  context: ActiveContext,
): SettingsView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null ? "scoped" : "no_organization";
  }
  return "bootstrapping";
}

const NO_BACKEND_COPY =
  "This build has no backend configured, so it cannot read platform settings.";

const ENV_STYLES: Record<FeatureFlagEnvironment, string> = {
  development: "bg-blue-50 text-blue-700 border-blue-200",
  staging: "bg-amber-50 text-amber-700 border-amber-200",
  production: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export default function PlatformSettingsPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const storeError = useContextStore((s) => s.error);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const canViewFlags = can("platform.feature_flag.view", permissions);
  const canViewConfig = can("platform.configuration.view", permissions);
  const canView = canViewFlags || canViewConfig;

  const [flags, setFlags] = useState<FeatureFlag[] | null>(null);
  const [configs, setConfigs] = useState<PlatformConfiguration[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [envFilter, setEnvFilter] = useState<FeatureFlagEnvironment | "ALL">("ALL");
  const [activeTab, setActiveTab] = useState<"flags" | "config">("flags");

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || !canView) return;
    let ignore = false;
    setFlags(null);
    setConfigs(null);
    setError(null);

    Promise.all([
      canViewFlags ? listFeatureFlags({}).catch(() => [] as FeatureFlag[]) : Promise.resolve([] as FeatureFlag[]),
      canViewConfig
        ? listPlatformConfigurations().catch(() => [] as PlatformConfiguration[])
        : Promise.resolve([] as PlatformConfiguration[]),
    ])
      .then(([f, c]) => {
        if (!ignore) {
          setFlags(f);
          setConfigs(c);
        }
      })
      .catch((err) => {
        if (!ignore) setError(toPublicError(err).message);
      });

    return () => {
      ignore = true;
    };
  }, [view, canView, canViewFlags, canViewConfig]);

  const filteredFlags = useMemo(() => {
    if (!flags) return [];
    const q = search.trim().toLowerCase();
    return flags.filter((f) => {
      if (envFilter !== "ALL" && f.environment !== envFilter) return false;
      if (
        q &&
        !f.key.toLowerCase().includes(q) &&
        !f.name.toLowerCase().includes(q) &&
        !(f.description ?? "").toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [flags, search, envFilter]);

  const filteredConfigs = useMemo(() => {
    if (!configs) return [];
    const q = search.trim().toLowerCase();
    if (!q) return configs;
    return configs.filter(
      (c) =>
        c.key.toLowerCase().includes(q) ||
        (c.description ?? "").toLowerCase().includes(q),
    );
  }, [configs, search]);

  if (view === "bootstrapping") return <LoadingBlock label="Loading settings…" />;
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
        title="Sign in to view Settings"
        description="There is no active session for this build."
      />
    );
  if (view === "no_organization")
    return (
      <EmptyState
        icon={<Store aria-hidden />}
        title="Choose an organization first"
        description="Platform settings require an active organization context."
      />
    );
  if (!canView) return <AccessDenied capability="view platform settings" permission="platform.feature_flag.view" />;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          <Settings className="size-5 shrink-0 text-brand-600" aria-hidden />
          Platform Settings
        </h2>
        <p className="mt-1 text-sm text-muted">
          Feature flags, configuration and platform controls.
        </p>
      </header>

      <div className="flex items-center gap-1 border-b border-border">
        <button
          type="button"
          onClick={() => setActiveTab("flags")}
          className={`px-4 py-2 text-sm font-medium transition ${
            activeTab === "flags"
              ? "border-b-2 border-brand-600 text-brand-700"
              : "text-muted hover:text-ink"
          }`}
        >
          <span className="flex items-center gap-1.5">
            <ToggleLeft className="size-4" aria-hidden />
            Feature Flags
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("config")}
          className={`px-4 py-2 text-sm font-medium transition ${
            activeTab === "config"
              ? "border-b-2 border-brand-600 text-brand-700"
              : "text-muted hover:text-ink"
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Database className="size-4" aria-hidden />
            Configuration
          </span>
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {activeTab === "flags" && (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search flags…"
                className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-muted/60 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>
            <select
              value={envFilter}
              onChange={(e) =>
                setEnvFilter(e.target.value as FeatureFlagEnvironment | "ALL")
              }
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              <option value="ALL">All environments</option>
              <option value="development">Development</option>
              <option value="staging">Staging</option>
              <option value="production">Production</option>
            </select>
            {can("platform.feature_flag.manage", permissions) && (
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700"
              >
                <Plus className="size-4" aria-hidden />
                New Flag
              </button>
            )}
          </div>

          {flags === null ? (
            <LoadingBlock label="Loading feature flags…" />
          ) : filteredFlags.length === 0 ? (
            <EmptyState
              icon={<ToggleLeft aria-hidden />}
              title="No feature flags"
              description={
                search || envFilter !== "ALL"
                  ? "No flags match your filters."
                  : "Create your first feature flag."
              }
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-surface">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-stone-50/60 text-xs uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Flag</th>
                    <th className="px-4 py-3 font-medium">Environment</th>
                    <th className="px-4 py-3 font-medium">Target</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Toggle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredFlags.map((f) => (
                    <tr key={f.id} className="hover:bg-stone-50/40">
                      <td className="px-4 py-3">
                        <div className="font-medium text-ink">{f.name}</div>
                        <div className="mt-0.5 font-mono text-xs text-muted">{f.key}</div>
                        {f.description && (
                          <div className="mt-0.5 line-clamp-1 text-xs text-muted">
                            {f.description}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${ENV_STYLES[f.environment]}`}
                        >
                          {f.environment}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {f.targetType}
                        {f.targetReference && (
                          <span className="ml-1 text-xs">({f.targetReference})</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${
                            f.enabled
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-stone-50 text-stone-500 border-stone-200"
                          }`}
                        >
                          {f.enabled ? "Enabled" : "Disabled"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          className="inline-flex items-center text-muted transition hover:text-brand-600"
                          title={f.enabled ? "Disable" : "Enable"}
                        >
                          {f.enabled ? (
                            <ToggleRight className="size-5 text-emerald-600" />
                          ) : (
                            <ToggleLeft className="size-5" />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {activeTab === "config" && (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search configuration…"
                className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-muted/60 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>
            {can("platform.configuration.manage", permissions) && (
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700"
              >
                <Plus className="size-4" aria-hidden />
                New Config
              </button>
            )}
          </div>

          {configs === null ? (
            <LoadingBlock label="Loading configuration…" />
          ) : filteredConfigs.length === 0 ? (
            <EmptyState
              icon={<Database aria-hidden />}
              title="No configuration"
              description={
                search
                  ? "No configuration entries match your search."
                  : "No platform configuration entries yet."
              }
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-surface">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-stone-50/60 text-xs uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Key</th>
                    <th className="px-4 py-3 font-medium">Description</th>
                    <th className="px-4 py-3 font-medium">Updated</th>
                    <th className="px-4 py-3 font-medium">Updated By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredConfigs.map((c) => (
                    <tr key={c.id} className="hover:bg-stone-50/40">
                      <td className="px-4 py-3 font-mono text-sm text-ink">{c.key}</td>
                      <td className="px-4 py-3 text-muted">{c.description ?? "—"}</td>
                      <td className="px-4 py-3 text-muted">
                        {new Date(c.updatedAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-muted">{c.updatedBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
