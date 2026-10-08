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
import ShiftPage from "@/pages/restaurant/ShiftPage";
import StationsPage from "@/pages/restaurant/StationsPage";
import TeamPage from "@/pages/team/TeamPage";
import RolesPage from "@/pages/access/RolesPage";
import AuditPage from "@/pages/audit/AuditPage";
import OnboardingWizard from "@/pages/onboarding/OnboardingWizard";
import ItemsPage from "@/pages/inventory/ItemsPage";
import StockPage from "@/pages/inventory/StockPage";
import MovementsPage from "@/pages/inventory/MovementsPage";
import LocationsPage from "@/pages/inventory/LocationsPage";
import RecipesPage from "@/pages/inventory/RecipesPage";
import WastagePage from "@/pages/inventory/WastagePage";
import TransfersPage from "@/pages/inventory/TransfersPage";
import StockTakesPage from "@/pages/inventory/StockTakesPage";
import InventoryOverviewPage from "@/pages/inventory/InventoryOverviewPage";
import PurchasesPage from "@/pages/inventory/PurchasesPage";
import SuppliersPage from "@/pages/inventory/SuppliersPage";
import FinanceInvoicesPage from "@/pages/finance/FinanceInvoicesPage";
import FinancePaymentsPage from "@/pages/finance/FinancePaymentsPage";
import AccountingPage from "@/pages/finance/AccountingPage";
import ProfitLossPage from "@/pages/finance/ProfitLossPage";
import ReportsPage from "@/pages/analytics/ReportsPage";
import RoomTypesPage from "@/pages/hotel/RoomTypesPage";
import RoomsPage from "@/pages/hotel/RoomsPage";
import ReservationsPage from "@/pages/hotel/ReservationsPage";
import ReservationDetailPage from "@/pages/hotel/ReservationDetailPage";
import FrontDeskPage from "@/pages/hotel/FrontDeskPage";
import StayDetailPage from "@/pages/hotel/StayDetailPage";
import GuestsPage from "@/pages/hotel/GuestsPage";
import HousekeepingPage from "@/pages/hotel/HousekeepingPage";
import MaintenancePage from "@/pages/hotel/MaintenancePage";
import LostFoundPage from "@/pages/hotel/LostFoundPage";
import AssetsPage from "@/pages/hotel/AssetsPage";
import CrmOverviewPage from "@/pages/crm/CrmOverviewPage";
import CustomersPage from "@/pages/crm/CustomersPage";
import CustomerProfilePage from "@/pages/crm/CustomerProfilePage";
import FeedbackPage from "@/pages/crm/FeedbackPage";
import ComplaintsPage from "@/pages/crm/ComplaintsPage";
import LoyaltyPage from "@/pages/crm/LoyaltyPage";
import CorporateAccountsPage from "@/pages/crm/CorporateAccountsPage";
import EventsOverviewPage from "@/pages/events/EventsOverviewPage";
import EventLeadsPage from "@/pages/events/EventLeadsPage";
import EventsListPage from "@/pages/events/EventsListPage";
import EventVenuesPage from "@/pages/events/EventVenuesPage";
import EventDetailPage from "@/pages/events/EventDetailPage";
import HROverviewPage from "@/pages/hr/HROverviewPage";
import EmployeesPage from "@/pages/hr/EmployeesPage";
import EmployeeProfilePage from "@/pages/hr/EmployeeProfilePage";
import AttendancePage from "@/pages/hr/AttendancePage";
import ShiftsPage from "@/pages/hr/ShiftsPage";
import RosterPage from "@/pages/hr/RosterPage";
import LeavePage from "@/pages/hr/LeavePage";
import CommerceOverviewPage from "@/pages/commerce/CommerceOverviewPage";
import ChannelsPage from "@/pages/commerce/ChannelsPage";
import QRCodesPage from "@/pages/commerce/QRCodesPage";
import TableRequestsPage from "@/pages/commerce/TableRequestsPage";
import CommerceSettingsPage from "@/pages/commerce/CommerceSettingsPage";
import OrdersPage from "@/pages/commerce/OrdersPage";
import DirectBookingPage from "@/pages/commerce/DirectBookingPage";
import PublicPropertyPage from "@/pages/public/PublicPropertyPage";
import PublicMenuPage from "@/pages/public/PublicMenuPage";
import PublicQROrderPage from "@/pages/public/PublicQROrderPage";
import PublicBookingLookupPage from "@/pages/public/PublicBookingLookupPage";
import EnterpriseOverviewPage from "@/pages/enterprise/EnterpriseOverviewPage";
import EnterprisePropertiesPage from "@/pages/enterprise/EnterprisePropertiesPage";
import EnterpriseAttentionPage from "@/pages/enterprise/EnterpriseAttentionPage";
import EnterpriseSearchPage from "@/pages/enterprise/EnterpriseSearchPage";
import EnterpriseReportsPage from "@/pages/enterprise/EnterpriseReportsPage";
import OrgSettingsPage from "@/pages/enterprise/OrgSettingsPage";
import SubscriptionPage from "@/pages/billing/SubscriptionPage";
import InvoicesPage from "@/pages/billing/InvoicesPage";
import PaymentsPage from "@/pages/billing/PaymentsPage";
import UsagePage from "@/pages/billing/UsagePage";
import BillingAccountPage from "@/pages/billing/BillingAccountPage";
import NotificationCenter from "@/pages/notifications/NotificationCenter";
import NotificationPreferences from "@/pages/notifications/NotificationPreferences";
import CommunicationHistory from "@/pages/notifications/CommunicationHistory";
import AutomationsPage from "@/pages/notifications/AutomationsPage";
import IntegrationSettingsPage from "@/pages/integrations/IntegrationSettingsPage";
import PlatformDashboardPage from "@/pages/platform/PlatformDashboardPage";
import PlatformOrganizationsPage from "@/pages/platform/PlatformOrganizationsPage";
import PlatformSupportPage from "@/pages/platform/PlatformSupportPage";
import PlatformSecurityPage from "@/pages/platform/PlatformSecurityPage";
import PlatformHealthPage from "@/pages/platform/PlatformHealthPage";
import PlatformAnnouncementsPage from "@/pages/platform/PlatformAnnouncementsPage";
import PlatformSettingsPage from "@/pages/platform/PlatformSettingsPage";
import PlatformOnboardingPage from "@/pages/platform/PlatformOnboardingPage";
import SetupWizard from "@/pages/setup/SetupWizard";
import DocumentCenterPage from "@/pages/documents/DocumentCenterPage";
import DocumentTemplatesPage from "@/pages/documents/DocumentTemplatesPage";
import SettingsPage from "@/pages/settings/SettingsPage";
import OperationsTaskBoard from "@/pages/workflow/OperationsTaskBoard";
import MyWorkPage from "@/pages/workflow/MyWorkPage";
import ApprovalCenterPage from "@/pages/workflow/ApprovalCenterPage";
import RevenueDashboard from "@/pages/revenue/RevenueDashboard";
import PromotionsPage from "@/pages/revenue/PromotionsPage";
import PriceHistoryPage from "@/pages/revenue/PriceHistoryPage";
import RateCalendar from "@/pages/revenue/RateCalendar";
import ProcurementDashboard from "@/pages/procurement/ProcurementDashboard";
import Supplier360Page from "@/pages/procurement/Supplier360Page";
import ProcurementIntelligencePage from "@/pages/procurement/ProcurementIntelligencePage";
import ProcurementCalendarPage from "@/pages/procurement/ProcurementCalendarPage";
import ExperienceDashboard from "@/pages/experience/ExperienceDashboard";
import ExperienceFeedbackPage from "@/pages/experience/ExperienceFeedbackPage";
import ExperienceComplaintsPage from "@/pages/experience/ExperienceComplaintsPage";
import ExperienceAnalyticsPage from "@/pages/experience/ExperienceAnalyticsPage";
import HotelExperiencePage from "@/pages/experience/HotelExperiencePage";
import RestaurantExperiencePage from "@/pages/experience/RestaurantExperiencePage";
import EventExperiencePage from "@/pages/experience/EventExperiencePage";
import ServiceQualityPage from "@/pages/experience/ServiceQualityPage";
import ExperienceDetailPage from "@/pages/experience/ExperienceDetailPage";
import ComplaintDetailPage from "@/pages/experience/ComplaintDetailPage";
import FeedbackDetailPage from "@/pages/experience/FeedbackDetailPage";
import PublicFeedbackPage from "@/pages/experience/PublicFeedbackPage";
import MarketingDashboard from "@/pages/marketing/MarketingDashboard";
import CampaignListPage from "@/pages/marketing/CampaignListPage";
import CampaignDetailPage from "@/pages/marketing/CampaignDetailPage";
import AudienceListPage from "@/pages/marketing/AudienceListPage";
import OfferListPage from "@/pages/marketing/OfferListPage";
import OfferDetailPage from "@/pages/marketing/OfferDetailPage";
import MarketingAnalyticsPage from "@/pages/marketing/MarketingAnalyticsPage";
import MarketingSettingsPage from "@/pages/marketing/MarketingSettingsPage";
import GuestExperienceDashboard from "@/pages/guest-experience/GuestExperienceDashboard";
import GuestBookingsPage from "@/pages/guest-experience/GuestBookingsPage";
import GuestStayPage from "@/pages/guest-experience/GuestStayPage";
import GuestDiningPage from "@/pages/guest-experience/GuestDiningPage";
import GuestRequestsPage from "@/pages/guest-experience/GuestRequestsPage";
import GuestBillsPage from "@/pages/guest-experience/GuestBillsPage";
import GuestRewardsPage from "@/pages/guest-experience/GuestRewardsPage";
import GuestOffersPage from "@/pages/guest-experience/GuestOffersPage";
import GuestEventsPage from "@/pages/guest-experience/GuestEventsPage";
import GuestFeedbackPage from "@/pages/guest-experience/GuestFeedbackPage";
import GuestProfilePage from "@/pages/guest-experience/GuestProfilePage";
import GuestCheckInPage from "@/pages/guest-experience/GuestCheckInPage";
import GuestConciergePage from "@/pages/guest-experience/GuestConciergePage";
import GuestNotificationsPage from "@/pages/guest-experience/GuestNotificationsPage";
import GuestTimelinePage from "@/pages/guest-experience/GuestTimelinePage";
import { lazy } from "react";

const OwnerCommandCenter = lazy(() => import("@/pages/analytics/OwnerCommandCenter"));
const RestaurantAnalyticsPage = lazy(() => import("@/pages/analytics/RestaurantAnalyticsPage"));
const HotelAnalyticsPage = lazy(() => import("@/pages/analytics/HotelAnalyticsPage"));
const InventoryAnalyticsPage = lazy(() => import("@/pages/analytics/InventoryAnalyticsPage"));
const FinanceAnalyticsPage = lazy(() => import("@/pages/analytics/FinanceAnalyticsPage"));
const EventsAnalyticsPage = lazy(() => import("@/pages/analytics/EventsAnalyticsPage"));
const CrmAnalyticsPage = lazy(() => import("@/pages/analytics/CrmAnalyticsPage"));
const HrAnalyticsPage = lazy(() => import("@/pages/analytics/HrAnalyticsPage"));
const CommerceAnalyticsPage = lazy(() => import("@/pages/analytics/CommerceAnalyticsPage"));
const AICommandCenter = lazy(() => import("@/pages/ai/AICommandCenter"));

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
  { path: "/shifts", component: ShiftPage, permission: "shift.manage" },
  { path: "/stations", component: StationsPage, permission: "station.manage" },
  { path: "/restaurant", component: RestaurantDayPage, permission: "restaurant.view" },
  { path: "/team", component: TeamPage, permission: "user.view" },
  { path: "/roles", component: RolesPage, permission: "role.view" },
  { path: "/audit", component: AuditPage, permission: "audit.view" },
  { path: "/inventory", component: InventoryOverviewPage, permission: "stock.view" },
  { path: "/inventory/items", component: ItemsPage, permission: "item.view" },
  { path: "/inventory/stock", component: StockPage, permission: "stock.view" },
  { path: "/inventory/movements", component: MovementsPage, permission: "stock.view" },
  { path: "/inventory/locations", component: LocationsPage, permission: "stock.view" },
  { path: "/inventory/recipes", component: RecipesPage, permission: "recipe.view" },
  { path: "/inventory/wastage", component: WastagePage, permission: "stock.view" },
  { path: "/inventory/transfers", component: TransfersPage, permission: "stock.view" },
  { path: "/inventory/stock-takes", component: StockTakesPage, permission: "stock.view" },
  { path: "/inventory/purchases", component: PurchasesPage, permission: "purchase_order.view" },
  { path: "/inventory/suppliers", component: SuppliersPage, permission: "supplier.view" },
  { path: "/hotel/room-types", component: RoomTypesPage, permission: "room_type.view" },
  { path: "/hotel/rooms", component: RoomsPage, permission: "room.view" },
  { path: "/hotel/reservations", component: ReservationsPage, permission: "reservation.view" },
  { path: "/hotel/reservations/:reservationId", component: ReservationDetailPage, permission: "reservation.view" },
  { path: "/hotel/front-desk", component: FrontDeskPage, permission: "reservation.view" },
  { path: "/hotel/stays/:stayId", component: StayDetailPage, permission: "stay.view" },
  { path: "/hotel/guests", component: GuestsPage, permission: "guest.view" },
  { path: "/hotel/housekeeping", component: HousekeepingPage, permission: "housekeeping.view" },
  { path: "/hotel/maintenance", component: MaintenancePage, permission: "maintenance.view" },
  { path: "/hotel/lost-found", component: LostFoundPage, permission: "lost_found.view" },
  { path: "/hotel/assets", component: AssetsPage, permission: "asset.view" },
  { path: "/crm", component: CrmOverviewPage, permission: "crm.view" },
  { path: "/crm/customers", component: CustomersPage, permission: "crm.customer.view" },
  { path: "/crm/customers/:customerId", component: CustomerProfilePage, permission: "crm.customer.view" },
  { path: "/crm/feedback", component: FeedbackPage, permission: "crm.feedback.view" },
  { path: "/crm/complaints", component: ComplaintsPage, permission: "crm.complaint.view" },
  { path: "/crm/loyalty", component: LoyaltyPage, permission: "crm.loyalty.view" },
  { path: "/crm/corporate", component: CorporateAccountsPage, permission: "crm.corporate.view" },
  { path: "/events", component: EventsOverviewPage, permission: "events.view" },
  { path: "/events/leads", component: EventLeadsPage, permission: "events.lead.view" },
  { path: "/events/list", component: EventsListPage, permission: "events.event.view" },
  { path: "/events/venues", component: EventVenuesPage, permission: "events.venue.view" },
  { path: "/events/:eventId", component: EventDetailPage, permission: "events.event.view" },
  { path: "/hr", component: HROverviewPage, permission: "hr.view" },
  { path: "/hr/employees", component: EmployeesPage, permission: "hr.employee.view" },
  { path: "/hr/employees/:employeeId", component: EmployeeProfilePage, permission: "hr.employee.view" },
  { path: "/hr/attendance", component: AttendancePage, permission: "hr.attendance.view" },
  { path: "/hr/shifts", component: ShiftsPage, permission: "hr.shift.view" },
  { path: "/hr/roster", component: RosterPage, permission: "hr.roster.view" },
  { path: "/hr/leave", component: LeavePage, permission: "hr.leave.view" },
  { path: "/commerce", component: CommerceOverviewPage, permission: "commerce.view" },
  { path: "/commerce/channels", component: ChannelsPage, permission: "commerce.channel.view" },
  { path: "/commerce/qr-codes", component: QRCodesPage, permission: "commerce.qr.view" },
  { path: "/commerce/table-requests", component: TableRequestsPage, permission: "commerce.table_request.view" },
  { path: "/commerce/settings", component: CommerceSettingsPage, permission: "commerce.settings.view" },
  { path: "/commerce/orders", component: OrdersPage, permission: "commerce.order.view" },
  { path: "/commerce/direct-booking", component: DirectBookingPage, permission: "commerce.view" },
  // Finance — business accounting, invoices, payments, and P&L.
  { path: "/finance/invoices", component: FinanceInvoicesPage, permission: "analytics.finance.view" },
  { path: "/finance/payments", component: FinancePaymentsPage, permission: "analytics.finance.view" },
  { path: "/finance/accounting", component: AccountingPage, permission: "analytics.finance.view" },
  { path: "/finance/profit-loss", component: ProfitLossPage, permission: "analytics.profitability.view" },
  { path: "/enterprise", component: EnterpriseOverviewPage, permission: "enterprise.view" },
  { path: "/enterprise/properties", component: EnterprisePropertiesPage, permission: "enterprise.property.view" },
  { path: "/enterprise/attention", component: EnterpriseAttentionPage, permission: "enterprise.alerts.view" },
  { path: "/enterprise/search", component: EnterpriseSearchPage, permission: "enterprise.global_search.view" },
  { path: "/enterprise/reports", component: EnterpriseReportsPage, permission: "enterprise.reporting.view" },
  { path: "/enterprise/settings", component: OrgSettingsPage, permission: "enterprise.module_config.view" },
  // SaaS billing (046) — the platform's own subscription and invoicing layer.
  { path: "/billing/subscription", component: SubscriptionPage, permission: "billing.subscription.view" },
  { path: "/billing/invoices", component: InvoicesPage, permission: "billing.invoice.view" },
  { path: "/billing/payments", component: PaymentsPage, permission: "billing.payment.view" },
  { path: "/billing/usage", component: UsagePage, permission: "billing.usage.view" },
  { path: "/billing/account", component: BillingAccountPage, permission: "billing.account.view" },
  // Notifications & automation (047) — unified communication and automation layer.
  { path: "/notifications", component: NotificationCenter, permission: "notifications.view" },
  { path: "/notifications/preferences", component: NotificationPreferences, permission: "notifications.preference.view" },
  { path: "/notifications/communications", component: CommunicationHistory, permission: "communications.view" },
  { path: "/notifications/automations", component: AutomationsPage, permission: "automation.view" },
  // Integrations & API platform (050) — external system connections and developer API.
  { path: "/integrations", component: IntegrationSettingsPage, permission: "integrations.view" },
  // Analytics & reporting (048) — owner command center, KPIs, trends, domain analytics.
  { path: "/analytics", component: OwnerCommandCenter, permission: "analytics.dashboard.view" },
  { path: "/analytics/restaurant", component: RestaurantAnalyticsPage, permission: "analytics.restaurant.view" },
  { path: "/analytics/hotel", component: HotelAnalyticsPage, permission: "analytics.hotel.view" },
  { path: "/analytics/inventory", component: InventoryAnalyticsPage, permission: "analytics.inventory.view" },
  { path: "/analytics/finance", component: FinanceAnalyticsPage, permission: "analytics.finance.view" },
  { path: "/analytics/events", component: EventsAnalyticsPage, permission: "analytics.events.view" },
  { path: "/analytics/crm", component: CrmAnalyticsPage, permission: "analytics.crm.view" },
  { path: "/analytics/hr", component: HrAnalyticsPage, permission: "analytics.hr.view" },
  { path: "/analytics/commerce", component: CommerceAnalyticsPage, permission: "analytics.commerce.view" },
  { path: "/analytics/reports", component: ReportsPage, permission: "analytics.dashboard.view" },
  // AI Command Center (049) — natural-language business intelligence.
  { path: "/ai", component: AICommandCenter, permission: "analytics.dashboard.view" },
  // Platform Admin (048) — internal platform operations layer.
  { path: "/platform", component: PlatformDashboardPage, permission: "platform.dashboard.view" },
  { path: "/platform/organizations", component: PlatformOrganizationsPage, permission: "platform.organization.view" },
  { path: "/platform/support", component: PlatformSupportPage, permission: "platform.support.view" },
  { path: "/platform/security", component: PlatformSecurityPage, permission: "platform.security.view" },
  { path: "/platform/health", component: PlatformHealthPage, permission: "platform.health.view" },
  { path: "/platform/announcements", component: PlatformAnnouncementsPage, permission: "platform.announcement.view" },
  { path: "/platform/settings", component: PlatformSettingsPage, permission: "platform.feature_flag.view" },
  // Onboarding & activation (Prompt #23) — enhanced setup wizard and platform onboarding dashboard.
  { path: "/setup", component: SetupWizard },
  { path: "/platform/onboarding", component: PlatformOnboardingPage, permission: "platform.organization.view" },
  // Document management (Prompt #24) — unified document, template and generation layer.
  { path: "/documents", component: DocumentCenterPage, permission: "documents.view" },
  { path: "/documents/templates", component: DocumentTemplatesPage, permission: "documents.manage_templates" },
  // Business Configuration (Prompt #25) — centralized settings, policies, and operational rules.
  { path: "/settings", component: SettingsPage, permission: "settings.view" },
  // Operational workflows, tasks & approvals (Prompt #26) — canonical task overlay,
  // multi-step workflows, and the approval center.
  { path: "/operations/tasks", component: OperationsTaskBoard, permission: "task.view" },
  { path: "/my-work", component: MyWorkPage, permission: "task.view" },
  { path: "/approvals", component: ApprovalCenterPage, permission: "approval.view" },
  // Revenue management (Prompt #27) — pricing intelligence, rate plans, promotions, and yield optimization.
  { path: "/revenue", component: RevenueDashboard, permission: "revenue.view" },
  { path: "/revenue/promotions", component: PromotionsPage, permission: "revenue.promotion.view" },
  { path: "/revenue/price-history", component: PriceHistoryPage, permission: "revenue.pricing.view" },
  { path: "/hotel/revenue/rates", component: RateCalendar, permission: "revenue.pricing.view" },
  // Supply chain & procurement (Prompt #28) — supplier intelligence, cost analytics, and procurement operations.
  { path: "/procurement", component: ProcurementDashboard, permission: "supply_chain.view" },
  { path: "/procurement/intelligence", component: ProcurementIntelligencePage, permission: "supply_chain.intelligence.view" },
  { path: "/procurement/suppliers/:supplierId", component: Supplier360Page, permission: "supply_chain.supplier.view" },
  { path: "/procurement/calendar", component: ProcurementCalendarPage, permission: "supply_chain.calendar.view" },
  // Guest experience (Prompt #29) — feedback, complaints, service recovery, and experience analytics.
  { path: "/experience", component: ExperienceDashboard, permission: "experience.view" },
  { path: "/experience/feedback", component: ExperienceFeedbackPage, permission: "experience.feedback.view" },
  { path: "/experience/complaints", component: ExperienceComplaintsPage, permission: "experience.complaint.view" },
  { path: "/experience/analytics", component: ExperienceAnalyticsPage, permission: "experience.analytics.view" },
  { path: "/experience/hotel", component: HotelExperiencePage, permission: "experience.view" },
  { path: "/experience/restaurant", component: RestaurantExperiencePage, permission: "experience.view" },
  { path: "/experience/events", component: EventExperiencePage, permission: "experience.view" },
  { path: "/experience/service-quality", component: ServiceQualityPage, permission: "experience.analytics.view" },
  { path: "/experience/:id", component: ExperienceDetailPage, permission: "experience.view" },
  { path: "/experience/complaints/:id", component: ComplaintDetailPage, permission: "experience.complaint.view" },
  { path: "/experience/feedback/:id", component: FeedbackDetailPage, permission: "experience.feedback.view" },
  // Marketing, campaigns & customer engagement (Prompt #30) — campaign lifecycle,
  // audiences, offers, attribution, analytics, and consent management.
  { path: "/marketing", component: MarketingDashboard, permission: "marketing.view" },
  { path: "/marketing/campaigns", component: CampaignListPage, permission: "marketing.campaign.view" },
  { path: "/marketing/campaigns/new", component: CampaignDetailPage, permission: "marketing.campaign.create" },
  { path: "/marketing/campaigns/:campaignId", component: CampaignDetailPage, permission: "marketing.campaign.view" },
  { path: "/marketing/audiences", component: AudienceListPage, permission: "marketing.audience.view" },
  { path: "/marketing/offers", component: OfferListPage, permission: "marketing.offer.view" },
  { path: "/marketing/offers/new", component: OfferDetailPage, permission: "marketing.offer.create" },
  { path: "/marketing/offers/:offerId", component: OfferDetailPage, permission: "marketing.offer.view" },
  { path: "/marketing/analytics", component: MarketingAnalyticsPage, permission: "marketing.analytics.view" },
  { path: "/marketing/settings", component: MarketingSettingsPage, permission: "marketing.settings.manage" },
  // Digital guest journey, portal & hospitality experience hub (Prompt #31) —
  // customer-facing experience layer overlaying PMS, restaurant, events, CRM, and loyalty.
  { path: "/guest", component: GuestExperienceDashboard, permission: "guest_experience.view" },
  { path: "/guest/bookings", component: GuestBookingsPage, permission: "guest_experience.view" },
  { path: "/guest/stay", component: GuestStayPage, permission: "guest_experience.view" },
  { path: "/guest/dining", component: GuestDiningPage, permission: "guest_experience.view" },
  { path: "/guest/requests", component: GuestRequestsPage, permission: "guest_experience.request.view" },
  { path: "/guest/bills", component: GuestBillsPage, permission: "guest_experience.view" },
  { path: "/guest/rewards", component: GuestRewardsPage, permission: "guest_experience.view" },
  { path: "/guest/offers", component: GuestOffersPage, permission: "guest_experience.view" },
  { path: "/guest/events", component: GuestEventsPage, permission: "guest_experience.view" },
  { path: "/guest/feedback", component: GuestFeedbackPage, permission: "guest_experience.view" },
  { path: "/guest/profile", component: GuestProfilePage, permission: "guest_experience.view" },
  { path: "/guest/checkin", component: GuestCheckInPage, permission: "guest_experience.checkin.view" },
  { path: "/guest/concierge", component: GuestConciergePage, permission: "guest_experience.conversation.view" },
  { path: "/guest/notifications", component: GuestNotificationsPage, permission: "guest_experience.view" },
  { path: "/guest/timeline", component: GuestTimelinePage, permission: "guest_experience.view" },
];

/**
 * Public routes — mobile-first, no authentication required.
 *
 * These are customer-facing pages: property profiles, outlet menus, QR ordering,
 * and booking lookup. They render outside the shell and have no permission gates.
 */
export const PUBLIC_ROUTES: readonly AppRoute[] = [
  { path: "/stay/:propertySlug", component: PublicPropertyPage },
  { path: "/menu/:outletSlug", component: PublicMenuPage },
  { path: "/order/:qrCode", component: PublicQROrderPage },
  { path: "/booking/lookup", component: PublicBookingLookupPage },
  { path: "/feedback/:token", component: PublicFeedbackPage },
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
