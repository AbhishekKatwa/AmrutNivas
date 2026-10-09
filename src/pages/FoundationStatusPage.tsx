import { useMemo, useState } from "react";
import { ArrowRight, CircleSlash, Layers } from "lucide-react";
import {
  APP_BUILD_STAGE,
  APP_NAME,
  APP_TAGLINE,
  APP_VERSION,
} from "@/config/brand";
import {
  NAVIGATION,
  labelFromKey,
  navSummary,
  notImplementedLabel,
  phaseLabel,
} from "@/app/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatMoney, moneyFromRupees, splitMoney } from "@/domain/money/money";

/**
 * The only real page in this build.
 *
 * Every fact on it is derived from code that exists: brand config, the
 * navigation registry and the money module. No business numbers appear here,
 * because there is no backend to supply them — where a real product would show
 * a portfolio, this shows an explicit unavailable state instead of a zero.
 */
export function FoundationStatusPage() {
  const summary = useMemo(() => navSummary(), []);
  const [liveOnly, setLiveOnly] = useState(false);

  const groups = liveOnly
    ? NAVIGATION.map((group) => ({
        ...group,
        items: group.items.filter((item) => item.available),
      })).filter((group) => group.items.length > 0)
    : NAVIGATION;

  const moneyProof = formatMoney(1234567890n);
  const splitProof = splitMoney(moneyFromRupees("100.00").minor, 3);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 sm:gap-6">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
            {APP_NAME}
          </h2>
          <Badge tone="brand">{APP_BUILD_STAGE}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted">{APP_TAGLINE}</p>
      </header>

      <Card title="Foundation identity" description="Served from one config module, never hardcoded.">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Field label="Product" value={APP_NAME} />
          <Field label="Tagline" value={APP_TAGLINE} />
          <Field label="Version" value={APP_VERSION} mono />
          <Field label="Stage" value={APP_BUILD_STAGE} />
        </dl>
      </Card>

      <Card
        title="Money representation"
        description="Integer minor units (paise) as bigint. No float, no double, no drift."
      >
        <p className="money-figure text-2xl font-semibold text-brand-700 sm:text-3xl">
          {moneyProof}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          <code className="rounded-sm bg-surface-sunken px-1 py-0.5">formatMoney(1234567890n)</code>{" "}
          renders 1,234,567,890 paise with Indian lakh/crore grouping — the exact value shown above.
          Amounts are parsed from strings, so{" "}
          <code className="rounded-sm bg-surface-sunken px-1 py-0.5">0.1 + 0.2</code> can never
          become 0.30000000000000004 in a bill, a folio or a tax return.
        </p>
        <p className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-muted">
          Splitting ₹100.00 three ways allocates the remainder deterministically:{" "}
          <span className="money-figure text-ink">
            {splitProof.map((share) => formatMoney(share)).join(" + ")}
          </span>{" "}
          = ₹100.00. Nothing is lost and nothing is rounded twice.
        </p>
      </Card>

      <Card
        title="Foundation registry"
        description="Computed live from src/app/navigation.ts — not typed in."
        actions={
          <Button
            size="sm"
            variant={liveOnly ? "primary" : "secondary"}
            onClick={() => setLiveOnly((previous) => !previous)}
          >
            {liveOnly ? "Show all" : "Live only"}
          </Button>
        }
      >
        <dl className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Destinations" value={String(summary.total)} />
          <Stat label="Available" value={String(summary.available)} tone="success" />
          <Stat label="Not implemented" value={String(summary.notImplemented)} tone="warning" />
          <Stat label="Phase 0 pending" value={String(summary.phaseZeroPending)} />
        </dl>

        {groups.length === 0 ? (
          <EmptyState
            icon={<CircleSlash aria-hidden />}
            title="No live destinations in this filter"
            description="Every destination in this group is still a roadmap item. Switch the filter back to see the full registry."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] tracking-[0.06em] text-muted uppercase">
                  <th className="py-2 pr-3 font-semibold">Group</th>
                  <th className="py-2 pr-3 font-semibold">Destination</th>
                  <th className="py-2 pr-3 font-semibold">Phase</th>
                  <th className="py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {groups.flatMap((group) =>
                  group.items.map((item, index) => (
                    <tr
                      key={item.labelKey}
                      className="border-b border-line last:border-0 align-middle"
                    >
                      <td className="py-2 pr-3 text-muted">
                        {index === 0 ? labelFromKey(group.labelKey) : ""}
                      </td>
                      <td className="py-2 pr-3 font-medium text-ink">
                        {labelFromKey(item.labelKey)}
                        {item.path ? (
                          <span className="ml-2 text-xs text-muted">{item.path}</span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap text-xs text-muted">
                        P{item.phase} · {phaseLabel(item.phase)}
                      </td>
                      <td className="py-2">
                        {item.available ? (
                          <Badge tone="success">Available</Badge>
                        ) : (
                          <Badge tone="neutral">{notImplementedLabel()}</Badge>
                        )}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Domain hierarchy" description="The tenancy model every future module is written against.">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-ink">
          <Layers className="size-4 shrink-0 text-brand-600" aria-hidden />
          Organization
          <ArrowRight className="size-4 text-muted" aria-hidden />
          Property
          <ArrowRight className="size-4 text-muted" aria-hidden />
          Outlet
          <ArrowRight className="size-4 text-muted" aria-hidden />
          Department
        </p>
        <ul className="mt-3 space-y-1 text-xs leading-relaxed text-muted">
          <li>Organization — the legal operator and the tenant boundary.</li>
          <li>Property — a physical site: hotel, resort, restaurant, cloud kitchen.</li>
          <li>Outlet — a separately-run revenue point inside a property.</li>
          <li>Department — a cost and ownership centre inside an outlet. Never a tenant.</li>
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          The same four levels are the executed schema (<code className="rounded-sm bg-surface-sunken px-1 py-0.5">db/supabase</code>:
          tables, RLS, 24 write doors, the RBAC seed), mirrored by{" "}
          <code className="rounded-sm bg-surface-sunken px-1 py-0.5">src/domain/identity/types.ts</code> and gated by the
          scopes GLOBAL, ORGANIZATION, PROPERTY and OUTLET. A DEPARTMENT-scoped grant is refused at the door
          until the permission resolver reads that level, rather than stored and silently ignored.
        </p>
      </Card>

      <Card title="Operational data" padded={false}>
        <div className="px-4 py-4 sm:px-5">
          <EmptyState
            icon={<CircleSlash aria-hidden />}
            title="Operational totals live on each module's overview"
            description="The data plane is wired — every read and write goes through hosted Supabase
              with RLS + SECURITY DEFINER doors. This page proves the foundation modules (brand,
              money, navigation); the tenant's own operational totals — properties, outlets,
              staff, reservations, orders, stock — render on each module's overview screen, not
              here. Rather than show zeros, this surface stays out of the way."
          />
        </div>
      </Card>

      <Card>
        <p className="text-sm font-semibold text-ink">Wire status</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Authentication (#31.5 — User ID + password through <code className="rounded-sm bg-surface-sunken px-1 py-0.5">resolve_login</code>),
          the RBAC ladder, the audit trail, migrations 000–049 and the hosted Supabase data plane
          are all live. The registry still lists {summary.phaseZeroPending} Phase 0 destinations
          as road-map items; the navigation switcher hides them by default. The deployment
          configuration surface (SMTP, site URL, redirect allow-list) is the remaining server
          item tracked under task #58.
        </p>
      </Card>
    </div>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium tracking-[0.06em] text-muted uppercase">{label}</dt>
      <dd
        className={
          mono
            ? "money-figure mt-0.5 truncate text-sm font-medium text-ink"
            : "mt-0.5 truncate text-sm font-medium text-ink"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "warning";
}) {
  const valueClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : "text-ink";
  return (
    <div className="rounded-md border border-line bg-surface-sunken px-3 py-2">
      <p className="text-[11px] tracking-[0.06em] text-muted uppercase">{label}</p>
      <p className={`money-figure mt-1 text-lg font-semibold ${valueClass}`}>{value}</p>
    </div>
  );
}
