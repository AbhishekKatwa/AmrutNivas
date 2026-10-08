/**
 * The target navigation registry.
 *
 * This is the product's architecture expressed as data: every destination the
 * finished OS will have, with the roadmap phase that delivers it and an honest
 * `available` flag. The shell renders from here, which is what lets
 * `FoundationStatusPage` report real counts instead of prose.
 *
 * `available: true` means the route exists AND renders something true. That is the
 * shell landing plus Prompt #02's hierarchy, access, people and audit screens and the
 * onboarding wizard — each of which reads or writes real tables through a real door.
 * Nothing else qualifies: building a POS, PMS, KDS, inventory, accounting, GST,
 * HRMS, CRM, events, AI or subscription screen to fill a nav slot would be a
 * fake feature, and a disabled row is the honest answer.
 *
 * Availability is not access. This registry says a destination exists; whether *this*
 * person may use it is answered at the door, and each screen names the capability it
 * is short of instead of hiding itself — an invisible admin screen teaches nobody what
 * their role is missing.
 *
 * `labelKey` is the future i18n key. The shell renders it through
 * `labelFromKey()` because there is no translation layer yet — one function,
 * one place to delete when locales arrive.
 */

export type NavItem = {
  readonly labelKey: string;
  /** Absent until the route exists. A disabled row never has a path. */
  readonly path?: string;
  readonly phase: number;
  readonly available: boolean;
};

export type NavGroup = {
  readonly labelKey: string;
  readonly items: readonly NavItem[];
};

/**
 * Roadmap phases. Phase 0 is this stage plus Prompt #02:
 * auth, organization, property, outlet, RBAC, audit, design system, shell.
 */
export const PHASE_LABELS = {
  0: "Foundation",
  1: "Restaurant",
  2: "Inventory",
  3: "Hotel",
  4: "Finance",
  5: "CRM",
  6: "Events",
  7: "People",
  8: "Commerce",
  9: "Enterprise",
  10: "AI",
} as const satisfies Record<number, string>;

export function phaseLabel(phase: number): string {
  return PHASE_LABELS[phase as keyof typeof PHASE_LABELS] ?? `Phase ${phase}`;
}

export const NAVIGATION: readonly NavGroup[] = [
  {
    labelKey: "nav.commandCenter",
    items: [
      // The shell itself is the only thing shipped, so Command Center is the
      // single available destination.
      { labelKey: "nav.commandCenter.overview", path: "/", phase: 0, available: true },
    ],
  },
  {
    labelKey: "nav.operations",
    items: [
      // Prompt #08's hotel surface: front desk, room types, rooms, and guests.
      // Each reads real tables and writes through 034–038 doors.
      { labelKey: "nav.operations.hotel", path: "/hotel/front-desk", phase: 3, available: true },
      { labelKey: "nav.operations.room_types", path: "/hotel/room-types", phase: 3, available: true },
      { labelKey: "nav.operations.rooms", path: "/hotel/rooms", phase: 3, available: true },
      { labelKey: "nav.operations.guests", path: "/hotel/guests", phase: 3, available: true },
      // Prompt #04's first shipped surface: the menu of the active outlet, read and
      // written through 014's doors.
      { labelKey: "nav.operations.menu", path: "/menu", phase: 1, available: true },
      { labelKey: "nav.operations.floor", path: "/tables", phase: 1, available: true },
      // 016's eight doors: tickets of the active outlet, staged on the device and booked by
      // the database. Totals are deliberately absent — the bill engine (017) owns those.
      { labelKey: "nav.operations.point_of_sale", path: "/pos", phase: 1, available: true },
      // 017's five doors: the document the calculation engine froze, the money booked against it,
      // and the settlement that hands it over. The counter reads figures and works none out.
      { labelKey: "nav.operations.billing", path: "/billing", phase: 1, available: true },
      // 018's queue: slips fired to the pass, rung up line by line, reprinted and retired with a
      // reason. A slip carries quantities and instructions and no money of its own.
      { labelKey: "nav.operations.kitchen", path: "/kitchen", phase: 1, available: true },
      // 019's single door: the trading day as the database reads it — covers, tickets, the pass,
      // and money per currency. The screen sums nothing, so the day cannot disagree with the till.
      { labelKey: "nav.operations.restaurant", path: "/restaurant", phase: 1, available: true },
      { labelKey: "nav.operations.housekeeping", phase: 3, available: false },
      { labelKey: "nav.operations.events", phase: 6, available: false },
    ],
  },
  {
    labelKey: "nav.commerce",
    items: [
      // Prompt #08's reservation surface: the booking ledger as the database reads it,
      // with state transitions (confirm, cancel, no-show) and room assignment.
      { labelKey: "nav.commerce.reservations", path: "/hotel/reservations", phase: 3, available: true },
      // Tender capture exists at the till in Phase 1; the payment *ledger* is
      // Finance, so this destination is Phase 4.
      { labelKey: "nav.commerce.orders", phase: 1, available: false },
      { labelKey: "nav.commerce.direct_booking", phase: 8, available: false },
    ],
  },
  {
    labelKey: "nav.inventory",
    items: [
      // Prompt #06's inventory surface: overview, master data, stock, movements,
      // locations, recipes, wastage, transfers and stock takes. Each reads real
      // tables and writes through 023/024 doors. Purchases and suppliers remain
      // unavailable until Prompt #07's procurement domain lands.
      { labelKey: "nav.inventory.overview", path: "/inventory", phase: 2, available: true },
      { labelKey: "nav.inventory.items", path: "/inventory/items", phase: 2, available: true },
      { labelKey: "nav.inventory.stock", path: "/inventory/stock", phase: 2, available: true },
      { labelKey: "nav.inventory.movements", path: "/inventory/movements", phase: 2, available: true },
      { labelKey: "nav.inventory.locations", path: "/inventory/locations", phase: 2, available: true },
      { labelKey: "nav.inventory.recipes", path: "/inventory/recipes", phase: 2, available: true },
      { labelKey: "nav.inventory.wastage", path: "/inventory/wastage", phase: 2, available: true },
      { labelKey: "nav.inventory.transfers", path: "/inventory/transfers", phase: 2, available: true },
      { labelKey: "nav.inventory.stock_takes", path: "/inventory/stock-takes", phase: 2, available: true },
      { labelKey: "nav.inventory.purchases", phase: 2, available: false },
      { labelKey: "nav.inventory.suppliers", phase: 2, available: false },
    ],
  },
  {
    labelKey: "nav.finance",
    items: [
      { labelKey: "nav.finance.invoices", phase: 4, available: false },
      { labelKey: "nav.finance.payments", phase: 4, available: false },
      { labelKey: "nav.finance.accounting", phase: 4, available: false },
      { labelKey: "nav.finance.profit_loss", phase: 4, available: false },
    ],
  },
  {
    labelKey: "nav.people",
    items: [
      { labelKey: "nav.people.guests", phase: 5, available: false },
      { labelKey: "nav.people.employees", phase: 7, available: false },
    ],
  },
  {
    labelKey: "nav.insights",
    items: [
      { labelKey: "nav.insights.analytics", phase: 4, available: false },
      { labelKey: "nav.insights.reports", phase: 4, available: false },
      { labelKey: "nav.insights.ai", phase: 10, available: false },
    ],
  },
  {
    labelKey: "nav.administration",
    items: [
      // Prompt #02's hierarchy and access screens. Each is `available` because the route
      // renders a real read or door — enforcement of who may use it is not this registry's
      // job (see ARCHITECTURE: authorization lives in the write path, and each screen
      // answers a missing capability with the permission it needs).
      { labelKey: "nav.administration.setup", path: "/onboarding", phase: 0, available: true },
      { labelKey: "nav.administration.organization", path: "/organization", phase: 0, available: true },
      { labelKey: "nav.administration.properties", path: "/properties", phase: 0, available: true },
      { labelKey: "nav.administration.outlets", path: "/outlets", phase: 0, available: true },
      { labelKey: "nav.administration.departments", path: "/departments", phase: 0, available: true },
      { labelKey: "nav.administration.team", path: "/team", phase: 0, available: true },
      { labelKey: "nav.administration.roles", path: "/roles", phase: 0, available: true },
      { labelKey: "nav.administration.audit", path: "/audit", phase: 0, available: true },
      { labelKey: "nav.administration.settings", phase: 0, available: false },
    ],
  },
];

/** Flattened leaf items — the unit the shell renders and the status page counts. */
export function allNavItems(): readonly NavItem[] {
  return NAVIGATION.flatMap((group) => [...group.items]);
}

/** True facts about the registry, derived from the registry itself. */
export function navSummary(): {
  total: number;
  available: number;
  notImplemented: number;
  groups: number;
  /** Items still waiting on Phase 0 — i.e. the immediate next step. */
  phaseZeroPending: number;
} {
  const items = allNavItems();
  const available = items.filter((item) => item.available).length;
  return {
    total: items.length,
    available,
    notImplemented: items.length - available,
    groups: NAVIGATION.length,
    phaseZeroPending: items.filter((item) => !item.available && item.phase === 0).length,
  };
}

const NOT_IMPLEMENTED_TEXT = "Not implemented";

/** The literal label a disabled row shows. Never a fake destination name. */
export function notImplementedLabel(): string {
  return NOT_IMPLEMENTED_TEXT;
}

/**
 * `nav.direct_booking` -> "Direct Booking". Temporary stand-in for a real
 * translation layer; the key stays the source of truth so nothing else learns
 * to hardcode a label.
 */
export function labelFromKey(labelKey: string): string {
  const leaf = labelKey.split(".").at(-1) ?? labelKey;
  return leaf
    .split(/[_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
