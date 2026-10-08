/**
 * Organization Settings — module configuration and templates.
 *
 * Configure which modules are enabled/disabled per property, set organization-wide
 * defaults, and manage master data templates. This screen answers "how is the
 * organization configured?" at the enterprise level.
 */

import { useEffect, useMemo, useState } from "react";
import {
  CircleSlash,
  LogIn,
  Store,
  Settings,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { Badge } from "@/components/ui/Badge";
import { can, type ActiveContext } from "@/domain/identity/types";
import {
  listPropertiesWithGroups,
  listPropertyModuleConfig,
  isModuleEnabled,
  type PropertyGroupScope,
} from "@/domain/enterprise/enterprise-service";
import type {
  PropertyWithGroup,
  PropertyModuleConfig,
} from "@/domain/enterprise/types";
import { MODULE_NAMES } from "@/domain/enterprise/types";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

export type OrgSettingsView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_organization"
  | "scoped";

export function pageStatusFor(
  status: ContextStatus,
  context: ActiveContext,
): OrgSettingsView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null ? "scoped" : "no_organization";
  }
  return "bootstrapping";
}

const NO_BACKEND_COPY =
  "This build has no backend configured, so it cannot read settings.";

export default function OrgSettingsPage() {
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

  const canView = can("enterprise.module_config.view", permissions);

  const [properties, setProperties] = useState<PropertyWithGroup[] | null>(null);
  const [moduleConfigs, setModuleConfigs] = useState<Map<string, PropertyModuleConfig[]>>(new Map());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || scope === null || !canView) return;
    let ignore = false;
    setProperties(null);
    setModuleConfigs(new Map());
    setError(null);

    listPropertiesWithGroups(scope)
      .then(async (props) => {
        if (ignore) return;
        setProperties(props);

        const configs = new Map<string, PropertyModuleConfig[]>();
        for (const prop of props) {
          try {
            const config = await listPropertyModuleConfig(prop.id, scope);
            configs.set(prop.id, config);
          } catch {
            configs.set(prop.id, []);
          }
        }
        if (!ignore) setModuleConfigs(configs);
      })
      .catch((err) => {
        if (!ignore) setError(toPublicError(err).message);
      });

    return () => {
      ignore = true;
    };
  }, [view, scope, canView]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          <Settings className="size-5 shrink-0 text-brand-600" aria-hidden />
          Organization Settings
        </h2>
        <p className="mt-1 text-sm text-muted">
          Configure modules, templates, and defaults for all properties.
        </p>
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
          title="Sign in to view Settings"
          description="There is no active session for this build to read a tenant from."
        />
      )}

      {view === "no_organization" && (
        <EmptyState
          icon={<Store aria-hidden />}
          title="Choose an organization first"
          description="Settings belong to an organization. Pick one and this screen will show its configuration."
        />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied
          capability="view organization settings"
          permission="enterprise.module_config.view"
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

          {properties === null ? (
            <LoadingBlock label="Reading settings…" />
          ) : (
            <section>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
                Module Configuration by Property
              </h3>
              <div className="overflow-hidden rounded-xl border border-border bg-surface">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-surface-sunken text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Property</th>
                      {MODULE_NAMES.map((module) => (
                        <th key={module} className="px-2 py-2 text-center font-medium">
                          {module}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {properties.map((property) => {
                      const config = moduleConfigs.get(property.id) ?? [];
                      return (
                        <tr key={property.id} className="hover:bg-surface-sunken">
                          <td className="px-4 py-3">
                            <div className="font-medium text-ink">{property.name}</div>
                            <div className="text-xs text-muted">{property.code}</div>
                          </td>
                          {MODULE_NAMES.map((module) => (
                            <td key={module} className="px-2 py-3 text-center">
                              {isModuleEnabled(config, module) ? (
                                <Badge tone="success">Enabled</Badge>
                              ) : (
                                <Badge tone="neutral">Disabled</Badge>
                              )}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-muted">
                Module configuration controls visibility. Disabling a module hides it from the UI but never deletes data.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
