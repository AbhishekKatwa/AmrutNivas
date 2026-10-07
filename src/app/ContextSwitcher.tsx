/**
 * The context switcher (§27-§30, §56).
 *
 * What this replaces is the worse pattern: every screen deciding for itself which
 * property it is showing. Here the level is chosen once, by the server-backed store,
 * and a screen that needs it reads it. The choices on offer come from the same
 * RLS-filtered reads every other screen uses, so the list a person sees is exactly
 * the set the database will honour for them — a tenant they were just removed from is
 * not in the menu, and picking a stale id by URL is narrowed by the door rather than
 * trusted.
 */

import { useEffect, useState } from "react";
import { ChevronDown, Building2, MapPin, UtensilsCrossed, X } from "lucide-react";
import clsx from "clsx";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { SelectInput, type SelectOption } from "@/components/ui/SelectInput";
import { LoadingBlock } from "@/components/ui/Spinner";
import { listOrganizations } from "@/domain/hierarchy/organization-service";
import { listProperties } from "@/domain/hierarchy/property-service";
import { listOutlets } from "@/domain/hierarchy/outlet-service";
import type { ContextSelection } from "@/domain/access/session-service";
import type {
  ActiveContext,
  Organization,
  Outlet,
  Property,
  EntityId,
} from "@/domain/identity/types";
import { publicErrorMessage } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

/** The sentinel an option carries for "this level, and nothing below it". */
export const ORG_WIDE = ":org";
export const PROPERTY_WIDE = ":property";

/**
 * Which levels a choice leaves selected. Picking a shallower level always drops the
 * deeper ones: moving to another site cannot leave an outlet of the previous property
 * in the context, because that pair names nothing.
 */
export function selectionAfter(
  level: "organization" | "property" | "outlet",
  id: EntityId | null,
  current: Pick<ActiveContext, "organizationId" | "propertyId">,
): ContextSelection {
  if (level === "organization") return { organizationId: id, propertyId: null, outletId: null };
  if (level === "property")
    return { organizationId: current.organizationId, propertyId: id, outletId: null };
  return { organizationId: current.organizationId, propertyId: current.propertyId, outletId: id };
}

/** The organization-wide option reads as a choice, not as an empty select. */
export function organizationOptions(
  organizations: readonly Organization[],
): SelectOption<string>[] {
  return organizations.map((organization) => ({
    value: organization.id,
    label:
      organization.status === "ACTIVE"
        ? organization.name
        : `${organization.name} (${organization.status.toLowerCase()})`,
    description: organization.isDemo ? "Demo data" : undefined,
  }));}

export function propertyOptions(
  properties: readonly Property[],
): SelectOption<string>[] {
  return [
    { value: ORG_WIDE, label: "All properties (organization-wide)" },
    ...properties.map((property) => ({
      value: property.id,
      label:
        property.status === "ACTIVE"
          ? `${property.name} · ${property.city ?? property.code}`
          : `${property.name} (${property.status.toLowerCase()})`,
    })),
  ];
}

export function outletOptions(outlets: readonly Outlet[]): SelectOption<string>[] {
  return [
    { value: PROPERTY_WIDE, label: "Whole property (no single outlet)" },
    ...outlets.map((outlet) => ({
      value: outlet.id,
      label: outlet.status === "ACTIVE" ? outlet.name : `${outlet.name} (paused)`,
    })),
  ];
}

/** The header reads as one line of provenance, not three bare ids. */
export function scopeSummary(
  context: Pick<ActiveContext, "signedIn" | "organizationId" | "propertyId" | "outletId">,
  names: { organization?: string; property?: string; outlet?: string },
): string {
  if (!context.signedIn) return "No session";
  if (context.organizationId === null) return "No organization selected";
  const parts = [names.organization ?? "Organization"];
  if (context.propertyId !== null) parts.push(names.property ?? "Property");
  if (context.outletId !== null) parts.push(names.outlet ?? "Outlet");
  return parts.join(" › ");
}

/**
 * The header's one-line answer to "which tenant am I in?".
 *
 * `unconfigured` gets its own wording because "No session" would blame the person: the
 * build has no project keys, so there is no data plane to hold a session in, and the
 * two states need different next steps from whoever is reading the screen.
 */
export function triggerLabel(
  status: ContextStatus,
  context: Parameters<typeof scopeSummary>[0],
  names: Parameters<typeof scopeSummary>[1],
): string {
  if (status === "unconfigured") return "No data plane";
  return scopeSummary(context, names);
}

type Options = {
  organizations: Organization[];
  properties: Property[];
  outlets: Outlet[];
};

export function ContextSwitcherPanel({
  context,
  busy,
  options,
  missing,
  onChoose,
}: {
  context: ActiveContext;
  busy: boolean;
  /** Null until the lists have arrived; the panel says so instead of showing empty selects. */
  options: Options | null;
  /** Shown when there is no backend or no session, so the control explains itself. */
  missing: string | null;
  onChoose: (level: "organization" | "property" | "outlet", id: EntityId | null) => void;
}) {
  if (missing !== null) {
    return (
      <p className="px-4 py-3 text-xs leading-relaxed text-muted" role="status">
        {missing}
      </p>
    );
  }

  if (options === null) {
    return <LoadingBlock label="Loading the tenants you belong to" className="px-4 py-3" />;
  }

  const organizations = organizationOptions(options.organizations);
  const canReachDeeper = context.organizationId !== null;
  const outletLevel =
    context.propertyId === null
      ? null
      : outletOptions(options.outlets).find((option) => option.value === context.outletId) ?? null;

  return (
    <div className="grid gap-3 p-4 sm:grid-cols-3">
      <Field label="Organization" hint="The tenant every row below belongs to.">
        <SelectInput
          options={organizations}
          value={context.organizationId ?? ""}
          placeholder="Select an organization"
          disabled={busy}
          onChange={(value) => onChoose("organization", value)}
        />
      </Field>

      <Field label="Property" hint={canReachDeeper ? undefined : "Choose an organization first."}>
        <SelectInput
          options={propertyOptions(options.properties)}
          value={context.propertyId ?? ORG_WIDE}
          disabled={busy || !canReachDeeper}
          onChange={(value) =>
            onChoose("property", value === ORG_WIDE ? null : (value as EntityId))
          }
        />
      </Field>

      <Field
        label="Outlet"
        hint={
          context.propertyId === null
            ? "Select a property to see its outlets."
            : (outletLevel?.label ?? "Whole property")
        }
      >
        <SelectInput
          options={outletOptions(options.outlets)}
          value={context.outletId ?? PROPERTY_WIDE}
          disabled={busy || context.propertyId === null}
          onChange={(value) =>
            onChoose("outlet", value === PROPERTY_WIDE ? null : (value as EntityId))
          }
        />
      </Field>
    </div>
  );
}

/**
 * The cleared-context notice (§29). It is rendered wherever the context is shown, because
 * a narrowed context that only appears in the console is precisely the silent failure this
 * build exists to prevent.
 */
export function ContextNotices() {
  const notices = useContextStore((state) => state.notices);
  const dismiss = useContextStore((state) => state.dismissNotice);
  if (notices.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 border-b border-warning/40 bg-warning-soft px-4 py-2 sm:px-6">
      {notices.map((notice) => (
        <p
          key={notice.id}
          role="status"
          className="flex items-start gap-2 text-xs leading-relaxed text-warning"
        >
          <span className="flex-1">{notice.message}</span>
          <button
            type="button"
            aria-label="Dismiss notice"
            onClick={() => dismiss(notice.id)}
            className="flex size-6 shrink-0 items-center justify-center rounded-sm text-warning hover:bg-warning/10"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </p>
      ))}
    </div>
  );
}

/**
 * Header control: one line of where you are, and the three levels that choose it.
 * Lists are read only when the panel is opened, so the boot path stays one
 * `resolve_active_context` call rather than three hierarchy reads.
 */
export function ContextSwitcher() {
  const context = useContextStore((state) => state.context);
  const status = useContextStore((state) => state.status);
  const busy = useContextStore((state) => state.status === "loading");
  const switchContext = useContextStore((state) => state.switchContext);

  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Options | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Opened, or moved a level deeper while open: the next level's list has changed.
  useEffect(() => {
    if (!open) return;
    if (context.organizationId === null) {
      void listOrganizations()
        .then((organizations) => setOptions({ organizations, properties: [], outlets: [] }))
        .catch((error: unknown) => setLoadError(publicErrorMessage(error)));
      return;
    }
    void listProperties({ organizationId: context.organizationId })
      .then((properties) =>
        setOptions((previous) => ({
          organizations: previous?.organizations ?? [],
          properties,
          outlets: [],
        })),
      )
      .catch((error: unknown) => setLoadError(publicErrorMessage(error)));
    if (context.propertyId === null) return;
    void listOutlets({
      organizationId: context.organizationId,
      propertyId: context.propertyId,
    })
      .then((outlets) =>
        setOptions((previous) =>
          previous === null ? null : { ...previous, outlets },
        ),
      )
      .catch((error: unknown) => setLoadError(publicErrorMessage(error)));
  }, [open, context.organizationId, context.propertyId]);

  const missing =
    status === "unconfigured"
      ? "This build has no backend connected, so there is no tenant to switch to."
      : status === "unauthenticated"
        ? "No session for this browser yet, so there is nothing to switch between."
        : loadError;

  const names = {
    organization: options?.organizations.find((o) => o.id === context.organizationId)?.name,
    property: options?.properties.find((p) => p.id === context.propertyId)?.name,
    outlet: options?.outlets.find((o) => o.id === context.outletId)?.name,
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((previous) => !previous)}
        className={clsx(
          "flex min-h-11 max-w-full items-center gap-2 rounded-md border px-3 py-1.5",
          "text-sm font-medium text-ink hover:border-brand-300 hover:bg-brand-50",
          open ? "border-brand-300 bg-brand-50" : "border-line bg-surface",
        )}
      >
        <Building2 className="size-4 shrink-0 text-brand-600" aria-hidden />
        <span className="truncate">{triggerLabel(status, context, names)}</span>
        <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden />
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(48rem,92vw)] rounded-xl border border-line bg-surface shadow-raised">
          <div className="flex items-center justify-between border-b border-line px-4 py-2">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              <MapPin className="size-3.5" aria-hidden />
              Active context
            </p>
            <span className="flex items-center gap-2">
              {context.outletId === null && context.propertyId !== null && (
                <Badge tone="neutral">
                  <UtensilsCrossed className="size-3" aria-hidden />
                  Property-wide
                </Badge>
              )}
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Close
              </Button>
            </span>
          </div>
          <ContextSwitcherPanel
            context={context}
            busy={busy}
            options={options}
            missing={missing}
            onChoose={(level, id) => void switchContext(selectionAfter(level, id, context))}
          />
        </div>
      )}
    </div>
  );
}
