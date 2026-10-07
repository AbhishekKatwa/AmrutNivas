/**
 * The route table, as data.
 *
 * Two things read this: `App` builds its `<Routes>` from it, and a test asserts every
 * `available` navigation row points here. That cross-check is the whole reason it is a
 * table rather than eight hand-written `<Route>` elements — a nav row that links to
 * nothing is a 404 wearing a menu item, and a route nobody can reach is dead code that
 * still shows up in the bundle.
 */

import type { ComponentType } from "react";
import { SIGN_IN_PATH } from "@/domain/auth/session-config";
import type { Permission } from "@/domain/identity/types";
import { FoundationStatusPage } from "@/pages/FoundationStatusPage";
import SignInPage from "@/pages/auth/SignInPage";
import OrganizationPage from "@/pages/organization/OrganizationPage";
import PropertiesPage from "@/pages/properties/PropertiesPage";
import OutletsPage from "@/pages/outlets/OutletsPage";
import DepartmentsPage from "@/pages/departments/DepartmentsPage";
import MenuPage from "@/pages/restaurant/MenuPage";
import FloorPage from "@/pages/restaurant/FloorPage";
import PosPage from "@/pages/restaurant/PosPage";
import BillPage from "@/pages/restaurant/BillPage";
import KitchenPage from "@/pages/restaurant/KitchenPage";
import RestaurantDayPage from "@/pages/restaurant/RestaurantDayPage";
import TeamPage from "@/pages/team/TeamPage";
import RolesPage from "@/pages/access/RolesPage";
import AuditPage from "@/pages/audit/AuditPage";
import OnboardingWizard from "@/pages/onboarding/OnboardingWizard";

export type AppRoute = {
  readonly path: string;
  readonly component: ComponentType;
  /**
   * The capability this destination needs (§21), asserted by `RouteGuard` before the page
   * mounts. Set it only where the screen's own read is already gated on that key (the
   * hierarchy and access screens) or the database enforces it on the row set (003's
   * memberships policy demands `user.view`); a route with none is open to every signed-in
   * member — the status page and the onboarding wizard have to be, or nobody could create
   * the first tenant. The gate is a pre-flight, never the authority: 005's doors and the
   * RLS policies decide (§19).
   */
  readonly permission?: Permission;
};

export const ROUTES: readonly AppRoute[] = [
  { path: "/", component: FoundationStatusPage },
  { path: "/onboarding", component: OnboardingWizard },
  { path: "/organization", component: OrganizationPage, permission: "organization.view" },
  { path: "/properties", component: PropertiesPage, permission: "property.view" },
  { path: "/outlets", component: OutletsPage },
  { path: "/departments", component: DepartmentsPage },
  { path: "/menu", component: MenuPage, permission: "menu.view" },
  { path: "/tables", component: FloorPage, permission: "table.view" },
  { path: "/pos", component: PosPage, permission: "order.view" },
  { path: "/billing", component: BillPage, permission: "bill.view" },
  { path: "/kitchen", component: KitchenPage, permission: "kot.view" },
  { path: "/restaurant", component: RestaurantDayPage, permission: "restaurant.view" },
  { path: "/team", component: TeamPage, permission: "user.view" },
  { path: "/roles", component: RolesPage, permission: "role.view" },
  { path: "/audit", component: AuditPage, permission: "audit.view" },
];

/**
 * The entry surface, registered apart from `ROUTES` on purpose.
 *
 * `ROUTES` is the shell's destination table, and the nav-vs-route gate requires every
 * row in it to have a menu row. Sign-in is not a destination — it is what renders
 * instead of the shell when there is no session — and a "Sign in" menu row inside an
 * already-signed-in navigation would be the lie that gate exists to catch. `App`
 * mounts this route for both states; the table stays honest for the other nine.
 */
export const SIGN_IN_ROUTE: AppRoute = { path: SIGN_IN_PATH, component: SignInPage };
