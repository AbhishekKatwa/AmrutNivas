import { type ReactNode, useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import clsx from "clsx";
import {
  BarChart3,
  Building2,
  CheckCircle2,
  LogOut,
  Menu,
  ShoppingBag,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { ContextNotices, ContextSwitcher } from "@/app/ContextSwitcher";
import { APP_NAME, APP_TAGLINE, APP_VERSION } from "@/config/brand";
import {
  labelFromKey,
  navSummary,
  notImplementedLabel,
  phaseLabel,
  NAVIGATION,
  type NavItem,
} from "./navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useContextStore } from "@/state/context-store";

/** Group icons, keyed by label prefix. Decoration only — no behaviour lives here. */
const GROUP_ICONS: Record<string, ReactNode> = {
  "nav.operations": <Building2 />,
  "nav.commerce": <ShoppingBag />,
  "nav.inventory": <BarChart3 />,
  "nav.finance": <Wallet />,
  "nav.people": <Users />,
  "nav.insights": <BarChart3 />,
  "nav.administration": <Building2 />,
};

/**
 * An unreachable destination is rendered as a disabled row: not a link, not a
 * button, no onClick, no path, and the literal words "Not implemented" plus the
 * phase that will deliver it. Clicking it does nothing because there is nothing
 * to click.
 */
function DisabledRow({ item }: { item: NavItem }) {
  return (
    <div
      aria-disabled="true"
      title={`Phase ${item.phase} — ${phaseLabel(item.phase)}`}
      className={clsx(
        "flex min-h-11 items-center justify-between gap-2 rounded-md px-3 py-2",
        "cursor-not-allowed text-muted",
      )}
    >
      <span className="truncate text-sm">{labelFromKey(item.labelKey)}</span>
      <span className="flex shrink-0 items-center gap-1">
        <Badge tone="neutral">P{item.phase}</Badge>
        <span className="text-[11px] whitespace-nowrap">{notImplementedLabel()}</span>
      </span>
    </div>
  );
}

function EnabledRow({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.path ?? "/"}
      end
      className={({ isActive }) =>
        clsx(
          "flex min-h-11 items-center justify-between gap-2 rounded-md px-3 py-2",
          "text-sm font-medium transition-colors",
          isActive
            ? "bg-brand-50 text-brand-700"
            : "text-ink hover:bg-surface-sunken hover:text-brand-700",
        )
      }
    >
      <span className="truncate">{labelFromKey(item.labelKey)}</span>
      <Badge tone="brand">
        <CheckCircle2 className="size-3.5" aria-hidden />
        Live
      </Badge>
    </NavLink>
  );
}

function NavList() {
  return (
    <nav className="flex flex-col gap-6">
      {NAVIGATION.map((group) => (
        <div key={group.labelKey}>
          <p className="flex items-center gap-2 px-3 pb-2 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
            <span className="[&_svg]:size-3.5">{GROUP_ICONS[group.labelKey] ?? null}</span>
            {labelFromKey(group.labelKey)}
          </p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <li key={item.labelKey}>
                {item.available ? <EnabledRow item={item} /> : <DisabledRow item={item} />}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SidebarContent() {
  const summary = navSummary();
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-4 py-4">
        <p className="truncate text-sm font-semibold tracking-[0.02em] text-brand-700">{APP_NAME}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-muted">{APP_TAGLINE}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-4">
        <NavList />
      </div>
      <div className="border-t border-line px-4 py-3">
        <p className="text-[11px] text-muted">
          v{APP_VERSION} · {summary.available}/{summary.total} destinations live
        </p>
      </div>
    </div>
  );
}

/**
 * Application chrome. Spacing is on the 8px scale (gap/padding of 8, 16, 24,
 * 32px) and every interactive row is at least 44px tall, so this is usable one-
 * handed at 360px. Sidebar state is local `useState` — no store, because no
 * other module consumes it.
 */
export function Shell({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const signOut = useContextStore((state) => state.signOut);

  // Navigating away always closes the drawer; otherwise a tap on a nav row would
  // leave the overlay sitting on top of the new page.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-dvh bg-paper">
      <aside className="hidden w-72 shrink-0 border-r border-line bg-surface lg:fixed lg:inset-y-0 lg:left-0 lg:block lg:w-72">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-ink/40"
          />
          <div className="absolute inset-y-0 left-0 w-[min(20rem,88vw)] border-r border-line bg-surface shadow-raised">
            <div className="flex items-center justify-end px-2 pt-2">
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setDrawerOpen(false)}
                className="flex size-11 items-center justify-center rounded-md text-muted hover:bg-surface-sunken"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <SidebarContent />
          </div>
        </div>
      )}

      <div className="lg:pl-72">
        <ContextNotices />
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface px-4 py-3 sm:px-6">
          <button
            type="button"
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
            className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-md border border-line text-ink lg:hidden"
          >
            <Menu className="size-5" aria-hidden />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold text-ink">{APP_NAME}</h1>
            <p className="truncate text-xs text-muted">{APP_TAGLINE}</p>
          </div>
          {/* The one place a person says which tenant they are working in. */}
          <ContextSwitcher />
          {/* §26: logout is the real path — GoTrue sign-out, then every piece of
              tenant state is dropped. It never navigates anywhere; the store's
              `unauthenticated` state renders the sign-in surface instead. */}
          <Button
            variant="ghost"
            size="sm"
            icon={<LogOut className="size-4" aria-hidden />}
            onClick={() => {
              void signOut();
            }}
          >
            Sign out
          </Button>
        </header>
        <main className="px-4 py-4 sm:px-6 sm:py-6">{children}</main>
      </div>
    </div>
  );
}
