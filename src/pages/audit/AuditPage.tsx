/**
 * The operator's trail view (§ audit; append-only history).
 *
 * This screen only ever READS history. There is no edit, no delete, no "clear log"
 * control anywhere on it, and there must never be one: history enters `audit_log`
 * through `app.audit()` inside each write door, and a database trigger refuses
 * UPDATE/DELETE for every role, so a control that implied otherwise would be a lie
 * about how the system works. Corrections are new events, not edits — the same truth
 * the read service carries in its header comment.
 *
 * Two obligations shape the markup:
 *   - tenant isolation: the read is organization-scoped by `context.organizationId`,
 *     and every filter option is a value that actually appears in the tenant's own
 *     rows, so the page can never offer a scope the store does not hold or a free-text
 *     field that silently matches nothing;
 *   - honesty about emptiness: a tenant with no trail yet is a normal fresh install,
 *     not a failure, and never rendered as a bare "0 events".
 *
 * The filter construction and the snapshot diffing are exported pure functions beside
 * the component so they are testable directly — the render itself is a static snapshot.
 */

import { useEffect, useMemo, useState } from "react";
import { ScrollText } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { LoadingBlock } from "@/components/ui/Spinner";
import { SelectInput } from "@/components/ui/SelectInput";
import { Field } from "@/components/ui/Field";
import { TextInput } from "@/components/ui/TextInput";
import { Button } from "@/components/ui/Button";
import {
  DEFAULT_AUDIT_PAGE_SIZE,
  listAuditEvents,
  type AuditFilter,
} from "@/domain/audit/audit-service";
import type { AuditEvent, EntityId } from "@/domain/identity/types";
import { useContextStore } from "@/state/context-store";
import { publicErrorMessage } from "@/lib/errors";

/* ------------------------------------------------------------------ pure logic */

/** What the on-screen filter controls hold. Keys map onto `AuditFilter` one for one. */
export type AuditUiFilters = {
  entity?: string;
  action?: string;
  propertyId?: string;
  outletId?: string;
  /** `YYYY-MM-DD` from a native date input; expanded to an inclusive ISO bound. */
  fromDate?: string;
  toDate?: string;
  pageSize?: number;
};

/**
 * Map the UI filter state onto the real `listAuditEvents` parameter object.
 *
 * The tenant id is the one always-present key; every optional filter is emitted ONLY
 * when it carries a real value, so an empty filter set sends nothing but the tenant and
 * the service applies its own default page size. A date becomes an inclusive bound on
 * the trading day it names, never a bare calendar string.
 */
export function buildAuditFilter(
  organizationId: EntityId,
  filters: AuditUiFilters,
): AuditFilter {
  const result: AuditFilter = { organizationId };

  if (isFilled(filters.propertyId)) result.propertyId = filters.propertyId;
  if (isFilled(filters.outletId)) result.outletId = filters.outletId;
  if (isFilled(filters.action)) result.action = filters.action;
  if (isFilled(filters.entity)) result.entity = filters.entity;
  if (isFilled(filters.fromDate)) result.from = `${filters.fromDate}T00:00:00.000Z`;
  if (isFilled(filters.toDate)) result.to = `${filters.toDate}T23:59:59.999Z`;
  if (filters.pageSize !== undefined) result.limit = filters.pageSize;

  return result;
}

function isFilled(value: string | undefined): value is string {
  return value !== undefined && value !== "";
}

/** The filter option lists, each fed by values that really appear in the loaded rows. */
export type AuditFilterOption = "entity" | "action" | "propertyId" | "outletId";

/**
 * Distinct, sorted values of one field across a page of events.
 *
 * Every selectable filter value is one an operator could actually match, because it is
 * drawn from the tenant's own trail rather than typed in — the difference between a
 * filter that narrows and a free-text box that silently returns nothing.
 */
export function uniqueAuditValues(
  rows: readonly AuditEvent[],
  field: AuditFilterOption,
): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    const value = row[field];
    if (typeof value === "string" && value !== "") seen.add(value);
  }
  return [...seen].sort();
}

/** One field of a before/after pair, ready for a change-honest line. */
export type SnapshotField = {
  field: string;
  before: unknown;
  after: unknown;
  changed: boolean;
};

/**
 * A readable, non-interpretive diff of a snapshot pair.
 *
 * The union of both snapshots' keys, in the door's own spelling, each marked changed or
 * not. Nothing is renamed or summarised — the point of an audit row is that the values
 * are exactly what the door stored, including where a snapshot has no explanation and
 * `metadata` carries it (handled by the renderer, not invented here).
 */
export function snapshotDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): SnapshotField[] {
  const keys = new Set<string>([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);
  return [...keys]
    .sort()
    .map((field) => {
      const from = before?.[field];
      const to = after?.[field];
      return { field, before: from, after: to, changed: !sameValue(from, to) };
    });
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------- render */

/** `Asia/Kolkata` -> `Kolkata`-style readable clock text, but keeps the raw instant. */
function renderValue(value: unknown): string {
  if (value === undefined) return "—";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * The data-only trail body: rows newest-first with each row's honest detail.
 *
 * Extracted from `AuditPage` so the empty / loading / populated states are directly
 * renderable and assertable without a live fetch. It contains no control that could
 * change history — reading is its whole job.
 */
export function AuditTrail({
  events,
  loading,
  error,
}: {
  events: readonly AuditEvent[];
  loading: boolean;
  error: string | null;
}) {
  if (error !== null) {
    return (
      <EmptyState
        icon={<ScrollText aria-hidden />}
        title="The trail could not be loaded"
        description={`${error} This is a read failure, not a change to history — nothing has been written or removed.`}
      />
    );
  }

  if (loading) {
    return <LoadingBlock rows={5} label="Reading the trail…" />;
  }

  if (events.length === 0) {
    return (
      <EmptyState
        icon={<ScrollText aria-hidden />}
        title="No trail recorded yet"
        description="This tenant has not had any audited activity recorded. That is the normal state for a fresh
          installation rather than a problem — the first change made through a door will appear here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {events.map((event) => (
        <AuditRow key={event.id} event={event} />
      ))}
    </div>
  );
}

function AuditRow({ event }: { event: AuditEvent }) {
  const diff = snapshotDiff(event.before, event.after);
  const hasMetadata = Object.keys(event.metadata ?? {}).length > 0;
  const explanation = event.reason ?? "";

  return (
    <Card
      className="rounded-lg"
      title={<span className="font-mono text-xs">{event.action}</span>}
      description={
        <span className="tabular-nums">
          {new Date(event.createdAt).toISOString().replace("T", " ").replace(".000", "")} ·{" "}
          {event.entity}
          {event.entityId ? ` · ${event.entityId}` : ""}
        </span>
      }
    >
      <dl className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
        <Detail label="Actor">{event.actorId ?? "system"}</Detail>
        <Detail label="Scope">
          {event.outletId ?? event.propertyId ?? event.organizationId ?? "organization"}
        </Detail>
        {explanation !== "" && (
          <div className="sm:col-span-2">
            <Detail label="Reason">{explanation}</Detail>
          </div>
        )}
      </dl>

      {diff.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
            Recorded fields
          </p>
          <ul className="flex flex-col gap-1">
            {diff.map((row) => (
              <li
                key={row.field}
                className="flex flex-wrap items-baseline gap-x-2 font-mono text-[11px]"
              >
                <span className="text-muted">{row.field}</span>
                <span className={row.changed ? "text-danger" : "text-muted"}>
                  {renderValue(row.before)}
                </span>
                {row.changed && <span aria-hidden>→</span>}
                {row.changed && <span className="text-success">{renderValue(row.after)}</span>}
                {!row.changed && <span className="text-muted">(unchanged)</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* A derived row often explains itself only through metadata; show what the door
          stored rather than inventing a summary. */}
      {hasMetadata && !explanation && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
            Metadata (as recorded)
          </p>
          <pre className="overflow-x-auto rounded-md bg-surface-sunken px-3 py-2 font-mono text-[11px] leading-relaxed text-ink">
            {JSON.stringify(event.metadata, null, 2)}
          </pre>
        </div>
      )}
    </Card>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-[0.06em] text-muted">{label}</dt>
      <dd className="mt-0.5 break-words font-mono text-ink">{children}</dd>
    </div>
  );
}

/* --------------------------------------------------------------------- page */

const PAGE_SIZES = [
  { value: "25", label: "25 rows" },
  { value: "50", label: "50 rows" },
  { value: "100", label: "100 rows" },
  { value: String(DEFAULT_AUDIT_PAGE_SIZE), label: `${DEFAULT_AUDIT_PAGE_SIZE} rows` },
];

export default function AuditPage() {
  const organizationId = useContextStore((s) => s.context.organizationId);
  const organization = useContextStore((s) => s.organization);
  const can = useContextStore((s) => s.can);
  const currentScope = useContextStore((s) => s.currentScope());

  const allowed = can("audit.view");

  const [filters, setFilters] = useState<AuditUiFilters>({});
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(allowed);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const context = useContextStore.getState();
    if (context.status === "idle") void context.bootstrap();
  }, []);

  const query = useMemo(
    () => (organizationId === null ? null : buildAuditFilter(organizationId, filters)),
    [organizationId, filters],
  );

  useEffect(() => {
    if (!allowed || query === null) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    listAuditEvents(query)
      .then((rows) => {
        if (active) setEvents(rows);
      })
      .catch((err) => {
        if (active) {
          setEvents([]);
          setError(publicErrorMessage(err));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [allowed, query, nonce]);

  if (!allowed) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <PageHeader organization={organization} scope={currentScope} />
        <AccessDenied
          capability="view the audit trail"
          permission="audit.view"
          hint="The trail is append-only and read-only: this screen never edits or removes a record. Ask an administrator for audit.view if you need it."
        />
      </div>
    );
  }

  const entityOptions = uniqueAuditValues(events, "entity");
  const actionOptions = uniqueAuditValues(events, "action");
  const propertyOptions = uniqueAuditValues(events, "propertyId");
  const outletOptions = uniqueAuditValues(events, "outletId");

  return (
    <div className="mx-auto flex flex-col gap-4 sm:gap-6">
      <PageHeader organization={organization} scope={currentScope} />

      {organizationId === null ? (
        <EmptyState
          icon={<ScrollText aria-hidden />}
          title="No organization selected"
          description="Choose a tenant to view its trail. The audit read is scoped to the organization you are
            standing in, so this screen never shows another tenant's history."
        />
      ) : (
        <>
          <Card title="Filters" description="Every option is a value present in this tenant's trail.">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Entity">
                <SelectInput
                  value={filters.entity ?? ""}
                  placeholder="All entities"
                  options={entityOptions.map((v) => ({ value: v, label: v }))}
                  onChange={(value) => setFilters((f) => ({ ...f, entity: value }))}
                />
              </Field>
              <Field label="Action">
                <SelectInput
                  value={filters.action ?? ""}
                  placeholder="All actions"
                  options={actionOptions.map((v) => ({ value: v, label: v }))}
                  onChange={(value) => setFilters((f) => ({ ...f, action: value }))}
                />
              </Field>
              <Field label="Property">
                <SelectInput
                  value={filters.propertyId ?? ""}
                  placeholder="All properties"
                  options={propertyOptions.map((v) => ({ value: v, label: v }))}
                  onChange={(value) => setFilters((f) => ({ ...f, propertyId: value }))}
                />
              </Field>
              <Field label="Outlet">
                <SelectInput
                  value={filters.outletId ?? ""}
                  placeholder="All outlets"
                  options={outletOptions.map((v) => ({ value: v, label: v }))}
                  onChange={(value) => setFilters((f) => ({ ...f, outletId: value }))}
                />
              </Field>
              <Field label="From">
                <TextInput
                  type="date"
                  value={filters.fromDate ?? ""}
                  onChange={(e) => setFilters((f) => ({ ...f, fromDate: e.target.value }))}
                />
              </Field>
              <Field label="To">
                <TextInput
                  type="date"
                  value={filters.toDate ?? ""}
                  onChange={(e) => setFilters((f) => ({ ...f, toDate: e.target.value }))}
                />
              </Field>
            </div>

            <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
              <Field label="Page size" className="w-40">
                <SelectInput
                  value={filters.pageSize === undefined ? "" : String(filters.pageSize)}
                  placeholder={`${DEFAULT_AUDIT_PAGE_SIZE} (default)`}
                  options={PAGE_SIZES}
                  onChange={(value) => setFilters((f) => ({ ...f, pageSize: Number(value) }))}
                />
              </Field>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setFilters({});
                    setNonce((n) => n + 1);
                  }}
                >
                  Reset filters
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setNonce((n) => n + 1)}
                >
                  Apply
                </Button>
              </div>
            </div>
          </Card>

          <AuditTrail events={events} loading={loading} error={error} />
        </>
      )}
    </div>
  );
}

function PageHeader({
  organization,
  scope,
}: {
  organization: { name: string; isDemo: boolean } | null;
  scope: string;
}) {
  return (
    <header>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          Audit trail
        </h2>
        <Badge tone="muted">Read-only</Badge>
        {organization?.isDemo === true && <Badge tone="warning">Demo data</Badge>}
      </div>
      <p className="mt-1 text-sm text-muted">
        Newest-first history for{" "}
        <span className="font-medium text-ink">
          {organization?.name ?? "the selected organization"}
        </span>
        . Current scope: <span className="font-mono text-xs">{scope || "none"}</span>. Records are
        written only by the doors and cannot be changed from here.
      </p>
    </header>
  );
}
