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
  11: "Platform",
  12: "Workflows",
  13: "Revenue",
  14: "Supply Chain",
  15: "Guest Experience",
  16: "Marketing",
  17: "Guest Portal",
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
      { labelKey: "nav.operations.housekeeping", path: "/hotel/housekeeping", phase: 3, available: true },
      { labelKey: "nav.operations.maintenance", path: "/hotel/maintenance", phase: 3, available: true },
      { labelKey: "nav.operations.lost_found", path: "/hotel/lost-found", phase: 3, available: true },
      { labelKey: "nav.operations.assets", path: "/hotel/assets", phase: 3, available: true },
      // Prompt #12's events surface: overview, leads, events list, venues, and the
      // 360° detail workspace. Each reads real tables and writes through 042 doors.
      { labelKey: "nav.operations.events", path: "/events", phase: 6, available: true },
      { labelKey: "nav.operations.event_leads", path: "/events/leads", phase: 6, available: true },
      { labelKey: "nav.operations.events_list", path: "/events/list", phase: 6, available: true },
      { labelKey: "nav.operations.event_venues", path: "/events/venues", phase: 6, available: true },
      // Prompt #26's operational workflow layer: task board, personal work view,
      // and approval center. One canonical task overlay, multi-step workflows,
      // and approval requests with delegation.
      { labelKey: "nav.operations.task_board", path: "/operations/tasks", phase: 12, available: true },
      { labelKey: "nav.operations.my_work", path: "/my-work", phase: 12, available: true },
      { labelKey: "nav.operations.approvals", path: "/approvals", phase: 12, available: true },
    ],
  },
  {
    labelKey: "nav.commerce",
    items: [
      // Prompt #14's commerce surface: overview, channels, QR codes, table requests,
      // and settings. Each reads real tables and writes through 044 doors.
      { labelKey: "nav.commerce.overview", path: "/commerce", phase: 8, available: true },
      { labelKey: "nav.commerce.channels", path: "/commerce/channels", phase: 8, available: true },
      { labelKey: "nav.commerce.qr_codes", path: "/commerce/qr-codes", phase: 8, available: true },
      { labelKey: "nav.commerce.table_requests", path: "/commerce/table-requests", phase: 8, available: true },
      { labelKey: "nav.commerce.settings", path: "/commerce/settings", phase: 8, available: true },
      // Prompt #08's reservation surface: the booking ledger as the database reads it,
      // with state transitions (confirm, cancel, no-show) and room assignment.
      { labelKey: "nav.commerce.reservations", path: "/hotel/reservations", phase: 3, available: true },
      // Tender capture exists at the till in Phase 1; the payment *ledger* is
      // Finance, so this destination is Phase 4.
      { labelKey: "nav.commerce.orders", path: "/commerce/orders", phase: 1, available: true },
      { labelKey: "nav.commerce.direct_booking", path: "/commerce/direct-booking", phase: 8, available: true },
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
      { labelKey: "nav.inventory.purchases", path: "/inventory/purchases", phase: 2, available: true },
      { labelKey: "nav.inventory.suppliers", path: "/inventory/suppliers", phase: 2, available: true },
    ],
  },
  {
    labelKey: "nav.finance",
    items: [
      { labelKey: "nav.finance.invoices", path: "/finance/invoices", phase: 4, available: true },
      { labelKey: "nav.finance.payments", path: "/finance/payments", phase: 4, available: true },
      { labelKey: "nav.finance.accounting", path: "/finance/accounting", phase: 4, available: true },
      { labelKey: "nav.finance.profit_loss", path: "/finance/profit-loss", phase: 4, available: true },
    ],
  },
  {
    labelKey: "nav.crm",
    items: [
      // Prompt #11's CRM surface: overview, customers, feedback, complaints, loyalty,
      // and corporate accounts. Each reads real tables and writes through 041 doors.
      { labelKey: "nav.crm.overview", path: "/crm", phase: 5, available: true },
      { labelKey: "nav.crm.customers", path: "/crm/customers", phase: 5, available: true },
      { labelKey: "nav.crm.feedback", path: "/crm/feedback", phase: 5, available: true },
      { labelKey: "nav.crm.complaints", path: "/crm/complaints", phase: 5, available: true },
      { labelKey: "nav.crm.loyalty", path: "/crm/loyalty", phase: 5, available: true },
      { labelKey: "nav.crm.corporate", path: "/crm/corporate", phase: 5, available: true },
    ],
  },
  {
    labelKey: "nav.people",
    items: [
      // Prompt #13's HR surface: overview, employees, attendance, shifts, roster and leave.
      // Each reads real tables and writes through 043 doors.
      { labelKey: "nav.people.overview", path: "/hr", phase: 7, available: true },
      { labelKey: "nav.people.employees", path: "/hr/employees", phase: 7, available: true },
      { labelKey: "nav.people.attendance", path: "/hr/attendance", phase: 7, available: true },
      { labelKey: "nav.people.shifts", path: "/hr/shifts", phase: 7, available: true },
      { labelKey: "nav.people.roster", path: "/hr/roster", phase: 7, available: true },
      { labelKey: "nav.people.leave", path: "/hr/leave", phase: 7, available: true },
    ],
  },
  {
    labelKey: "nav.enterprise",
    items: [
      // Prompt #15's enterprise surface: command center, properties with groups,
      // attention center, search, reports, and org settings. Each reads real tables
      // and writes through 045 doors.
      { labelKey: "nav.enterprise.overview", path: "/enterprise", phase: 9, available: true },
      { labelKey: "nav.enterprise.properties", path: "/enterprise/properties", phase: 9, available: true },
      { labelKey: "nav.enterprise.attention", path: "/enterprise/attention", phase: 9, available: true },
      { labelKey: "nav.enterprise.search", path: "/enterprise/search", phase: 9, available: true },
      { labelKey: "nav.enterprise.reports", path: "/enterprise/reports", phase: 9, available: true },
      { labelKey: "nav.enterprise.settings", path: "/enterprise/settings", phase: 9, available: true },
    ],
  },
  {
    labelKey: "nav.insights",
    items: [
      // Prompt #18's analytics surface: owner command center with KPIs, trends,
      // change detection, attention center, and domain-specific analytics.
      // Reads from existing operational tables; no competing calculations.
      { labelKey: "nav.insights.analytics", path: "/analytics", phase: 4, available: true },
      { labelKey: "nav.insights.analytics_restaurant", path: "/analytics/restaurant", phase: 4, available: true },
      { labelKey: "nav.insights.analytics_hotel", path: "/analytics/hotel", phase: 4, available: true },
      { labelKey: "nav.insights.analytics_inventory", path: "/analytics/inventory", phase: 4, available: true },
      { labelKey: "nav.insights.analytics_finance", path: "/analytics/finance", phase: 4, available: true },
      { labelKey: "nav.insights.analytics_events", path: "/analytics/events", phase: 4, available: true },
      { labelKey: "nav.insights.analytics_crm", path: "/analytics/crm", phase: 4, available: true },
      { labelKey: "nav.insights.analytics_hr", path: "/analytics/hr", phase: 4, available: true },
      { labelKey: "nav.insights.analytics_commerce", path: "/analytics/commerce", phase: 4, available: true },
      { labelKey: "nav.insights.reports", path: "/analytics/reports", phase: 4, available: true },
      // Prompt #19's AI Command Center: natural-language business intelligence.
      // Routes queries through the AI service layer with permission checks.
      { labelKey: "nav.insights.ai", path: "/ai", phase: 10, available: true },
    ],
  },
  {
    labelKey: "nav.revenue",
    items: [
      // Prompt #27's revenue management surface: dashboard, promotions, price history,
      // and rate calendar. One pricing engine, one rate-plan architecture, one promotion
      // architecture. Deterministic recommendations, never autonomous pricing.
      { labelKey: "nav.revenue.dashboard", path: "/revenue", phase: 13, available: true },
      { labelKey: "nav.revenue.promotions", path: "/revenue/promotions", phase: 13, available: true },
      { labelKey: "nav.revenue.price_history", path: "/revenue/price-history", phase: 13, available: true },
      { labelKey: "nav.revenue.rate_calendar", path: "/hotel/revenue/rates", phase: 13, available: true },
    ],
  },
  {
    labelKey: "nav.procurement",
    items: [
      // Prompt #28's supply chain & procurement surface: dashboard, intelligence,
      // supplier 360, and procurement calendar. One intelligence layer on top of
      // the existing procurement domain — no second supplier or inventory system.
      { labelKey: "nav.procurement.dashboard", path: "/procurement", phase: 14, available: true },
      { labelKey: "nav.procurement.intelligence", path: "/procurement/intelligence", phase: 14, available: true },
      { labelKey: "nav.procurement.calendar", path: "/procurement/calendar", phase: 14, available: true },
    ],
  },
  {
    labelKey: "nav.experience",
    items: [
      // Prompt #29's guest experience surface: dashboard, feedback, complaints,
      // analytics, domain-specific experience, and service quality. Extends CRM
      // entities with an operational overlay for closed-loop experience management.
      { labelKey: "nav.experience.dashboard", path: "/experience", phase: 15, available: true },
      { labelKey: "nav.experience.feedback", path: "/experience/feedback", phase: 15, available: true },
      { labelKey: "nav.experience.complaints", path: "/experience/complaints", phase: 15, available: true },
      { labelKey: "nav.experience.analytics", path: "/experience/analytics", phase: 15, available: true },
      { labelKey: "nav.experience.hotel", path: "/experience/hotel", phase: 15, available: true },
      { labelKey: "nav.experience.restaurant", path: "/experience/restaurant", phase: 15, available: true },
      { labelKey: "nav.experience.events", path: "/experience/events", phase: 15, available: true },
      { labelKey: "nav.experience.service_quality", path: "/experience/service-quality", phase: 15, available: true },
    ],
  },
  {
    labelKey: "nav.marketing",
    items: [
      // Prompt #30's marketing surface: dashboard, campaigns, audiences, offers,
      // analytics, and settings. Campaign lifecycle with dynamic/snapshot audiences,
      // multi-channel messages, offer redemption, and attribution tracking.
      { labelKey: "nav.marketing.dashboard", path: "/marketing", phase: 16, available: true },
      { labelKey: "nav.marketing.campaigns", path: "/marketing/campaigns", phase: 16, available: true },
      { labelKey: "nav.marketing.audiences", path: "/marketing/audiences", phase: 16, available: true },
      { labelKey: "nav.marketing.offers", path: "/marketing/offers", phase: 16, available: true },
      { labelKey: "nav.marketing.analytics", path: "/marketing/analytics", phase: 16, available: true },
      { labelKey: "nav.marketing.settings", path: "/marketing/settings", phase: 16, available: true },
    ],
  },
  {
    labelKey: "nav.guest_portal",
    items: [
      // Prompt #31's digital guest journey & portal: customer-facing experience layer
      // overlaying PMS, restaurant, events, CRM, and loyalty. Guest sees "My Trip,
      // My Stay, My Orders" instead of internal module names.
      { labelKey: "nav.guest_portal.dashboard", path: "/guest", phase: 17, available: true },
      { labelKey: "nav.guest_portal.bookings", path: "/guest/bookings", phase: 17, available: true },
      { labelKey: "nav.guest_portal.stay", path: "/guest/stay", phase: 17, available: true },
      { labelKey: "nav.guest_portal.dining", path: "/guest/dining", phase: 17, available: true },
      { labelKey: "nav.guest_portal.requests", path: "/guest/requests", phase: 17, available: true },
      { labelKey: "nav.guest_portal.bills", path: "/guest/bills", phase: 17, available: true },
      { labelKey: "nav.guest_portal.rewards", path: "/guest/rewards", phase: 17, available: true },
      { labelKey: "nav.guest_portal.offers", path: "/guest/offers", phase: 17, available: true },
      { labelKey: "nav.guest_portal.events", path: "/guest/events", phase: 17, available: true },
      { labelKey: "nav.guest_portal.feedback", path: "/guest/feedback", phase: 17, available: true },
      { labelKey: "nav.guest_portal.profile", path: "/guest/profile", phase: 17, available: true },
      { labelKey: "nav.guest_portal.checkin", path: "/guest/checkin", phase: 17, available: true },
      { labelKey: "nav.guest_portal.concierge", path: "/guest/concierge", phase: 17, available: true },
      { labelKey: "nav.guest_portal.notifications", path: "/guest/notifications", phase: 17, available: true },
      { labelKey: "nav.guest_portal.timeline", path: "/guest/timeline", phase: 17, available: true },
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
      { labelKey: "nav.administration.settings", path: "/settings", phase: 0, available: true },
    ],
  },
  {
    labelKey: "nav.billing",
    items: [
      // Prompt #16's SaaS billing surface: subscription, invoices, payments, usage,
      // and billing account. Each reads real tables and writes through billing doors.
      // This is the platform's own billing — what organizations pay AMRUT NIVAAS —
      // not the hospitality finance module (which is a customer's business finance).
      { labelKey: "nav.billing.subscription", path: "/billing/subscription", phase: 10, available: true },
      { labelKey: "nav.billing.invoices", path: "/billing/invoices", phase: 10, available: true },
      { labelKey: "nav.billing.payments", path: "/billing/payments", phase: 10, available: true },
      { labelKey: "nav.billing.usage", path: "/billing/usage", phase: 10, available: true },
      { labelKey: "nav.billing.account", path: "/billing/account", phase: 10, available: true },
    ],
  },
  {
    labelKey: "nav.notifications",
    items: [
      // Prompt #17's notification and automation layer: notification center,
      // preferences, communication history, and automation rules. Reacts to
      // domain events and produces notifications, emails, SMS, WhatsApp messages.
      { labelKey: "nav.notifications.center", path: "/notifications", phase: 10, available: true },
      { labelKey: "nav.notifications.preferences", path: "/notifications/preferences", phase: 10, available: true },
      { labelKey: "nav.notifications.communications", path: "/notifications/communications", phase: 10, available: true },
      { labelKey: "nav.notifications.automations", path: "/notifications/automations", phase: 10, available: true },
    ],
  },
  {
    labelKey: "nav.integrations",
    items: [
      // Prompt #20's integration and API platform layer: manage external system
      // connections (payment, messaging, booking, accounting, etc.), webhooks,
      // and API keys. Provider adapters abstract vendor-specific complexity.
      { labelKey: "nav.integrations.settings", path: "/integrations", phase: 10, available: true },
    ],
  },
  {
    labelKey: "nav.platform",
    items: [
      // Prompt #22's platform admin layer: internal operations for the AMRUT NIVAAS
      // SaaS platform itself. Dashboard, organization management, support center,
      // security incidents, system health, announcements, and feature flags.
      // Gated on platform.* permissions — separate from organization ownership.
      { labelKey: "nav.platform.dashboard", path: "/platform", phase: 11, available: true },
      { labelKey: "nav.platform.organizations", path: "/platform/organizations", phase: 11, available: true },
      { labelKey: "nav.platform.support", path: "/platform/support", phase: 11, available: true },
      { labelKey: "nav.platform.security", path: "/platform/security", phase: 11, available: true },
      { labelKey: "nav.platform.health", path: "/platform/health", phase: 11, available: true },
      { labelKey: "nav.platform.announcements", path: "/platform/announcements", phase: 11, available: true },
      { labelKey: "nav.platform.settings", path: "/platform/settings", phase: 11, available: true },
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
