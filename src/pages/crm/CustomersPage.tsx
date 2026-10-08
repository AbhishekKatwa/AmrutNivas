/**
 * CRM Customers — the guest directory enriched with CRM fields.
 *
 * This is the same guest list as /hotel/guests, but scoped to CRM and showing
 * the CRM-enriched fields (customer type, company, designation). Clicking a
 * customer opens their 360° profile.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleSlash, LogIn, Search, Users } from "lucide-react";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { Switch } from "@/components/ui/Switch";
import { TextInput } from "@/components/ui/TextInput";
import { can, type ActiveContext } from "@/domain/identity/types";
import type { Guest } from "@/domain/hotel/types";
import { listGuests, searchGuests } from "@/domain/hotel/guest-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

export type CustomersPageView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_organization"
  | "scoped";

export function pageStatusFor(status: ContextStatus, context: ActiveContext): CustomersPageView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null ? "scoped" : "no_organization";
  }
  return "bootstrapping";
}

const NO_BACKEND_COPY = "This build has no backend configured, so it cannot read customers.";

export default function CustomersPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const storeError = useContextStore((s) => s.error);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const scope = useMemo(
    () => (context.organizationId !== null ? { organizationId: context.organizationId } : null),
    [context.organizationId],
  );

  const canView = can("crm.customer.view", permissions);

  const [customers, setCustomers] = useState<Guest[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [listError, setListError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const reload = useCallback(() => setReloadTick((tick) => tick + 1), []);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || scope === null || !canView) return;
    let ignore = false;
    setCustomers(null);
    setListError(null);

    const trimmed = searchTerm.trim();
    const fetcher = trimmed.length >= 2
      ? () => searchGuests(scope, trimmed)
      : () => listGuests(scope, showArchived ? { includeArchived: true } : {});

    fetcher()
      .then((rows) => {
        if (ignore) return;
        setCustomers(rows);
      })
      .catch((error) => {
        if (!ignore) setListError(toPublicError(error).message);
      });
    return () => {
      ignore = true;
    };
  }, [view, scope, canView, showArchived, searchTerm, reloadTick]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          <Users className="size-5 shrink-0 text-brand-600" aria-hidden />
          Customers
        </h2>
        <p className="mt-1 text-sm text-muted">
          One identity per person. Search by name or phone to find a customer quickly, or browse
          the full directory. Click a customer to open their 360° profile.
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
          title="Sign in to manage customers"
          description="There is no active session for this build to read a tenant from."
        />
      )}

      {view === "no_organization" && (
        <EmptyState
          icon={<Users aria-hidden />}
          title="Choose an organization first"
          description="Customers belong to an organization. Pick one and this screen will show its customers."
        />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied capability="view customers" permission="crm.customer.view" />
      )}

      {view === "scoped" && scope !== null && canView && (
        <>
          {listError !== null && (
            <p role="alert" className="rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger">
              {listError}
            </p>
          )}

          <Card
            actions={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Switch checked={showArchived} onChange={setShowArchived} label="Show archived" />
                <Button size="sm" variant="ghost" onClick={reload}>
                  Reload
                </Button>
              </div>
            }
          >
            <div className="flex flex-col gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
                <TextInput
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search by name or phone…"
                  className="pl-9"
                />
              </div>
              <p className="text-xs text-muted">
                {customers === null
                  ? "Loading…"
                  : searchTerm.trim().length >= 2
                    ? `${customers.length} result${customers.length === 1 ? "" : "s"} for "${searchTerm.trim()}"`
                    : `${customers.length} customer${customers.length === 1 ? "" : "s"}`}
              </p>
            </div>
          </Card>

          {customers === null ? (
            <LoadingBlock label="Reading customers…" />
          ) : customers.length === 0 ? (
            <EmptyState
              icon={<Users aria-hidden />}
              title={searchTerm.trim().length >= 2 ? "No customers match" : "No customers yet"}
              description={
                searchTerm.trim().length >= 2
                  ? `No active customers match "${searchTerm.trim()}". Try a different search term.`
                  : "This organization has no customers. Guests added from the Front Desk will appear here."
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              {customers.map((guest) => (
                <CustomerCard key={guest.id} guest={guest} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CustomerCard({ guest }: { guest: Guest }) {
  const archived = guest.status === "ARCHIVED";

  return (
    <a
      href={`/crm/customers/${guest.id}`}
      className={`block rounded-lg border border-line bg-surface shadow-soft transition-colors hover:border-brand-200 ${archived ? "opacity-80" : ""}`}
    >
      <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
              {guest.firstName} {guest.lastName}
              {archived && (
                <Badge tone="muted">Archived</Badge>
              )}
              {guest.vipStatus !== "REGULAR" && (
                <Badge tone={guest.vipStatus === "VVIP" ? "warning" : "neutral"}>
                  {guest.vipStatus}
                </Badge>
              )}
            </h3>
            <p className="mt-0.5 text-xs text-muted">
              {[
                guest.phone,
                guest.email,
                guest.nationality,
              ]
                .filter(Boolean)
                .join(" · ") || "No contact details"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          {guest.customerType && (
            <Badge tone="brand">{guest.customerType.replace(/_/g, " ")}</Badge>
          )}
          {guest.companyName && (
            <span>{guest.companyName}</span>
          )}
          {guest.totalStays > 0 && (
            <span>
              {guest.totalStays} stay{guest.totalStays === 1 ? "" : "s"} · {guest.totalNights} night
              {guest.totalNights === 1 ? "" : "s"}
            </span>
          )}
          {guest.source && <Badge tone="muted">{guest.source}</Badge>}
        </div>

        {guest.notes && (
          <p className="text-sm text-muted">{guest.notes}</p>
        )}
      </div>
    </a>
  );
}
