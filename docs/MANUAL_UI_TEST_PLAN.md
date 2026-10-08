# AMRUT NIVAAS — MANUAL UI TEST PLAN

Prompt #33. Screen-by-screen manual QA walkthrough. **This is manual UI QA — the owner personally
interacts with the app. Nothing here is replaced by automated tests, and no screen is reported PASS
without being exercised in the browser.**

Status of testing lives in the companion doc: **`/docs/MANUAL_UI_TEST_REPORT.md`**.

---

## 1. How to use this plan

- Every screen has a stable ID (e.g. `REST-003`, `HOTEL-002`). Report problems by ID:
  > "REST-014 is broken."
- The inventory below was built from the **actual repository** (`src/app/routes.ts` + the page
  components it mounts). Where the taxonomy in the prompt planned a screen the repository does not
  have, it is listed and marked **NOT IMPLEMENTED**. Nothing was invented.
- Screens are tested in the phase order of §16, one domain at a time, ending each domain with a
  mini end-to-end flow (§13).

---

## 2. Environment

| Item | Value |
|---|---|
| App | AMRUT NIVAAS — The Operating System for Hospitality |
| Dev server | `npm run dev` in the `amrut-nivas` repo → Vite, currently **http://localhost:5175** (port may drift; use what Vite prints) |
| Sign-in | User ID + Password only. **No magic link, no email-login, no passwordless** (Prompt #31.5 contract) |
| Demo org | "Amrut Nivaas Shirur" — org `936c73c5-c0f2-4e3f-ae14-8fa4dd974c06` |
| Demo property | `9609d7dd-ffdb-4b78-b7f5-088357838623` |
| Demo outlet | `3fcf1ea3-3310-4b85-95ed-6c80a6c0223b` |
| Owner user | OWNER001 / Owner123! — **development-only credentials** (also MANAGER001/Manager123!, STAFF001/Staff123!, HOUSEKEEPING001/House123!, FINANCE001/Finance123!) |
| Permissions seen | 312 granted to OWNER001 (Access debugging panel, bottom of every screen, DEV only) |
| Data state | The demo estate starts **empty** — no menu, tables, rooms, reservations, orders, bills. Every create-flow is exercised from scratch. This is intentional: it exercises create→verify paths. |

**Browser**: desktop Chromium (the QA harness browser) + responsive viewport passes per §14.

---

## 3. Data-persistence warnings (read before testing these modules)

The architecture audit (`/docs/FULL_SYSTEM_AUDIT.md`, finding G1) proved these domains are
**in-memory Maps** — their data resets on every full page reload and is not tenant-scoped:

| Domain | Screens affected | What to expect |
|---|---|---|
| Operations / workflows | OPS-001..003 | Tasks/approvals vanish on reload; data shared across users in one browser session |
| Marketing | MKT-001..010 | Campaigns/audiences/offers vanish on reload |
| Guest experience portal | GUEST-001..015 | Guest bookings/requests/rewards vanish on reload |
| Supply chain | SC-001..004 | Supplier intelligence rows vanish on reload |
| Guest experience (feedback hub) | GX-001..011 | Feedback/complaints vanish on reload |
| Configuration | CONFIG-001 | Settings changes are lost on reload |
| Revenue (channel pricing half) | REV-001..004 | Rate reads are real; channel pricing edits are lost on reload |
| Integrations | INT-001 | Registry is in-memory; nothing real to connect |

When a screen in these modules is otherwise functional, record **PASS WITH ISSUE** and note
"volatile in-memory data" — do not count data-loss-on-reload as a separate FAIL unless the screen
itself misbehaves.

**Known BLOCKED expectations (audit C1/C2):** *consume-through-order* (order → inventory
consumption) and *charge-to-room* (bill → folio posting) doors exist but have **no caller**. The
flows in §13 that traverse them will block at that step; record BLOCKED, not FAIL.

---

## 4. Status vocabulary

| Status | Meaning |
|---|---|
| `PASS` | Page opens + data correct + controls work + validation works + permissions work + downstream works (where applicable) |
| `PASS WITH ISSUE` | Functional, with recorded non-blocking defects |
| `FAIL` | A core checklist area is broken |
| `BLOCKED` | Cannot be tested (missing prerequisite, unwired integration, upstream failure) |
| `NOT IMPLEMENTED` | Planned by taxonomy, absent from repository |
| `NOT APPLICABLE` | Screen exists but has nothing to verify in current context |

---

## 5. Per-screen checklist (every screen, §7 of the prompt)

**A. Page Load** — route opens · no runtime crash · no console error · correct title · correct nav
state · correct org/property/outlet context.

**B. Visual Structure** — header · sidebar/nav · breadcrumb · tabs · cards · tables · forms ·
buttons · icons · empty states.

**C. Data** — loads · correct · correct organization · correct property · correct outlet · correct
permissions.

**D. Interactions** — create · edit · save · cancel · delete/archive · search · filter · sort ·
pagination · tabs · dropdowns · modals · drawers · date selectors · numeric inputs · confirmations.

**E. Validation** — required fields · invalid values · duplicates · boundaries · empty submission ·
bad format.

**F. Feedback** — loading · saving · success · error · empty · disabled states.

A screen is **not** PASS merely because the page opens (§62).

---

## 6. Screen inventory (actual repository wins)

155 shell routes + 5 public routes + sign-in + 5 shell surfaces = **166 screen surfaces**,
plus 3 auth flows. Status column is filled in the REPORT doc as testing proceeds.

### 01 Authentication — AUTH

| ID | Screen | Route | Permission | Notes |
|---|---|---|---|---|
| AUTH-001 | Sign In | `/sign-in` (SIGN_IN_PATH) | none | Login matrix: valid · wrong password · wrong user · empty fields · visibility toggle · loading · error · success. **Must NOT offer magic link/email/passwordless.** |
| AUTH-002 | Logout + protected routes | header | session | Logout → back → direct protected URL → unauthenticated lands on login |
| AUTH-003 | Session persistence | all | session | Refresh mid-app keeps session and context; navigation doesn't drop it |
| AUTH-004 | Forgot password | `/sign-in` → "Forgot password?" | none | Implemented (SignInPage phases `forgot`/`forgot-sent`): reset-link request, does not expose account existence |

### 02 Organization — ORG

| ID | Screen | Route | Permission | Notes |
|---|---|---|---|---|
| ORG-001 | Organization | `/organization` | organization.view | Profile, archive, status |
| ORG-002 | Departments | `/departments` | — | Create/edit/archive + reason |
| ORG-003 | Team (Members) | `/team` | user.view | Invitations, memberships |
| ORG-004 | Roles & Permissions | `/roles` | role.view | Role ladder, custom roles, permission matrix |
| — | Organization settings/profile as separate screens | — | — | **NOT IMPLEMENTED** (folded into ORG-001) |

### 03 Property — PROPERTY

| ID | Screen | Route | Permission | Notes |
|---|---|---|---|---|
| PROPERTY-001 | Properties | `/properties` | property.view | Create/edit/archive + reason |
| — | Property Dashboard / Details / Settings / Switcher / Access as separate screens | — | — | **NOT IMPLEMENTED** (switcher = SHELL-002; access via RLS) |

### 04 Outlet — OUTLET

| ID | Screen | Route | Permission | Notes |
|---|---|---|---|---|
| OUTLET-001 | Outlets | `/outlets` | — | Create/edit/archive + reason |
| — | Outlet Details / Settings / Access as separate screens | — | — | **NOT IMPLEMENTED** (folded into OUTLET-001) |

### 05 Dashboard — DASH

| ID | Screen | Route | Permission | Notes |
|---|---|---|---|---|
| DASH-001 | Foundation Status (landing page after sign-in) | `/` | member | Module foundation readout + navigation availability. Known issue UI-0001: stale "no data plane" copy while connected. **Not an operational dashboard** — the operational owner dashboard is ANALYTICS-001 (`/analytics`). Planned DASH-002/003 Manager/Operational dashboards: **NOT IMPLEMENTED** as distinct screens |

### 06 Restaurant — REST

| ID | Screen | Route | Permission | Notes |
|---|---|---|---|---|
| REST-001 | Menu management | `/menu` | menu.view | Menus, categories, items, prices, availability |
| REST-002 | Tables & floor | `/tables` | table.view | Floors, areas, tables, derived status |
| REST-003 | POS | `/pos` | order.view | Order entry: table → item → qty → note → place order (flow §13.1) |
| REST-004 | Bills & payments | `/billing` | bill.view | Generate bill, discounts, tax, split bill/payment, cash/UPI/card |
| REST-005 | Shifts | `/shifts` | shift.manage | Open/close shift |
| REST-006 | Stations | `/stations` | station.manage | KDS stations |
| REST-007 | Restaurant day | `/restaurant` | restaurant.view | Day overview dashboard |
| — | Order detail / Discounts / Restaurant settings as separate screens | — | — | **NOT IMPLEMENTED** (order detail opens in-place; discount is part of REST-004) |

### 07 KDS — KDS

| ID | Screen | Route | Permission | Notes |
|---|---|---|---|---|
| KDS-001 | Kitchen display | `/kitchen` | kot.view | KOT tickets: accept → start → ready → served · station selector · elapsed time (flow §13.2) |

### 08 Inventory — INV

| ID | Screen | Route | Permission | Notes |
|---|---|---|---|---|
| INV-001 | Inventory overview | `/inventory` | stock.view | |
| INV-002 | Items | `/inventory/items` | item.view | Create/edit item |
| INV-003 | Stock | `/inventory/stock` | stock.view | On-hand by location |
| INV-004 | Movements | `/inventory/movements` | stock.view | Stock ledger |
| INV-005 | Locations | `/inventory/locations` | stock.view | |
| INV-006 | Recipes | `/inventory/recipes` | recipe.view | Recipe builder |
| INV-007 | Wastage | `/inventory/wastage` | stock.view | Record wastage |
| INV-008 | Transfers | `/inventory/transfers` | stock.view | Location-to-location |
| INV-009 | Stock takes | `/inventory/stock-takes` | stock.view | Count + variance |
| — | Item detail / Recipe detail as separate screens | — | — | **NOT IMPLEMENTED** (open in-place from list screens) |

### 09 Procurement — PROC

| ID | Screen | Route | Permission | Notes |
|---|---|---|---|---|
| PROC-001 | Purchases | `/inventory/purchases` | purchase_order.view | Purchase orders, GRN receiving, supplier invoices, supplier payments in one screen |
| PROC-002 | Suppliers | `/inventory/suppliers` | supplier.view | Supplier master |
| — | Purchase requests / separate GRN screen / purchase returns / landed cost | — | — | **NOT IMPLEMENTED** as separate screens (GRN is a flow inside PROC-001) |

### 10 Hotel — HOTEL

| ID | Screen | Route | Permission | Notes |
|---|---|---|---|---|
| HOTEL-001 | Room types | `/hotel/room-types` | room_type.view | Create/edit/archive; amenities |
| HOTEL-002 | Rooms | `/hotel/rooms` | room.view | Create/edit/archive; operational + housekeeping status; room blocks. (UI-0002 fixed here — client had invented `rooms.status`) |
| HOTEL-003 | Reservations | `/hotel/reservations` | reservation.view | List + create |
| HOTEL-004 | Reservation detail | `/hotel/reservations/:reservationId` | reservation.view | Assign room, confirm, cancel |
| HOTEL-005 | Front desk | `/hotel/front-desk` | reservation.view | Arrivals/departures/in-house; check-in hand-off |
| HOTEL-006 | Stay detail | `/hotel/stays/:stayId` | stay.view | In-stay actions, folio, room move, checkout |
| HOTEL-007 | Guests | `/hotel/guests` | guest.view | Guest directory (CRM-linked) |
| HOTEL-008 | Lost & found | `/hotel/lost-found` | lost_found.view | Log/return items |
| HOTEL-009 | Assets | `/hotel/assets` | asset.view | Asset register |
| — | Room calendar / availability as separate screens | — | — | **NOT IMPLEMENTED** (availability is embedded in reservation flow + front desk) |
| — | Rate plans / room rates screens | — | — | Rate data lives under Revenue: REV-004 (`/hotel/revenue/rates`) |

### 11 Housekeeping — HK

| ID | Screen | Route | Permission | Notes |
|---|---|---|---|---|
| HK-001 | Housekeeping | `/hotel/housekeeping` | housekeeping.view | Room task board, assignments, inspections, room-status board — all on one screen |
| — | My Tasks / Room Tasks / Inspections / Room Status as separate screens | — | — | **NOT IMPLEMENTED** (folded into HK-001) |

### 12 Maintenance — MAINT

| ID | Screen | Route | Permission | Notes |
|---|---|---|---|---|
| MAINT-001 | Maintenance | `/hotel/maintenance` | maintenance.view | Requests: create → assign → resolve |
| — | Maintenance Dashboard / Request Detail / Vendors as separate screens | — | — | **NOT IMPLEMENTED** (folded into MAINT-001; asset register = HOTEL-009) |

### 13 Finance — FIN

| ID | Screen | Route | Permission | Notes |
|---|---|---|---|---|
| FIN-001 | Invoices | `/finance/invoices` | analytics.finance.view | Business invoices read-model |
| FIN-002 | Payments | `/finance/payments` | analytics.finance.view | Money in/out read-model |
| FIN-003 | Accounting | `/finance/accounting` | analytics.finance.view | Day-book summary |
| FIN-004 | P&L | `/finance/profit-loss` | analytics.profitability.view | Profit & loss read-model |
| — | Chart of Accounts · Journal · General Ledger · Trial Balance · Balance Sheet · Cash Flow · Taxes | — | — | **NOT IMPLEMENTED** — finance is a business read-model layer, not a GL chain |

### 14 CRM — CRM

| ID | Screen | Route | Permission | Notes |
|---|---|---|---|---|
| CRM-001 | CRM overview | `/crm` | crm.view | |
| CRM-002 | Customers | `/crm/customers` | crm.customer.view | Search, create |
| CRM-003 | Customer 360 | `/crm/customers/:customerId` | crm.customer.view | Profile, timeline, preferences, stays |
| CRM-004 | Feedback | `/crm/feedback` | crm.feedback.view | |
| CRM-005 | Complaints | `/crm/complaints` | crm.complaint.view | |
| CRM-006 | Loyalty | `/crm/loyalty` | crm.loyalty.view | |
| CRM-007 | Corporate accounts | `/crm/corporate` | crm.corporate.view | |
| — | Customer merge / Segments as separate screens | — | — | **NOT IMPLEMENTED** |

### 15 Events — EVENT

| ID | Screen | Route | Permission | Notes |
|---|---|---|---|---|
| EVENT-001 | Events overview | `/events` | events.view | |
| EVENT-002 | Leads | `/events/leads` | events.lead.view | Lead pipeline |
| EVENT-003 | Events list | `/events/list` | events.event.view | |
| EVENT-004 | Venues | `/events/venues` | events.venue.view | |
| EVENT-005 | Event detail | `/events/:eventId` | events.event.view | Planning, tasks, billing as applicable |
| — | Quotations / Packages / Run Sheet / Event P&L as separate screens | — | — | **NOT IMPLEMENTED** (folded into EVENT-005 where present) |

### 16 HR — HR

| ID | Screen | Route | Permission | Notes |
|---|---|---|---|---|
| HR-001 | HR overview | `/hr` | hr.view | |
| HR-002 | Employees | `/hr/employees` | hr.employee.view | |
| HR-003 | Employee profile | `/hr/employees/:employeeId` | hr.employee.view | |
| HR-004 | Attendance | `/hr/attendance` | hr.attendance.view | |
| HR-005 | Shifts | `/hr/shifts` | hr.shift.view | |
| HR-006 | Roster | `/hr/roster` | hr.roster.view | |
| HR-007 | Leave | `/hr/leave` | hr.leave.view | |
| — | Departments / Designations / Holidays / HR Documents as separate screens | — | — | **NOT IMPLEMENTED** (departments = ORG-002 at org level; documents = DOC-001) |

### 17 Commerce — COM

| ID | Screen | Route | Permission | Notes |
|---|---|---|---|---|
| COM-001 | Commerce overview | `/commerce` | commerce.view | |
| COM-002 | Channels | `/commerce/channels` | commerce.channel.view | |
| COM-003 | QR codes | `/commerce/qr-codes` | commerce.qr.view | Generate QR for outlet/table |
| COM-004 | Table requests | `/commerce/table-requests` | commerce.table_request.view | |
| COM-005 | Commerce settings | `/commerce/settings` | commerce.settings.view | |
| COM-006 | Orders | `/commerce/orders` | commerce.order.view | Incoming QR orders |
| COM-007 | Direct booking | `/commerce/direct-booking` | commerce.view | Booking configuration |
| COM-008 | Public property page | `/stay/:propertySlug` | public | Guest-facing, no auth |
| COM-009 | Public menu | `/menu/:outletSlug` | public | Guest-facing, no auth |
| COM-010 | Public QR order | `/order/:qrCode` | public | Cart → order → status |
| COM-011 | Public booking lookup | `/booking/lookup` | public | |
| COM-012 | Public feedback | `/feedback/:token` | public | |

### 18 Enterprise — ENT

| ID | Screen | Route | Permission | Notes |
|---|---|---|---|---|
| ENT-001 | Enterprise overview | `/enterprise` | enterprise.view | |
| ENT-002 | Properties | `/enterprise/properties` | enterprise.property.view | Cross-property view |
| ENT-003 | Attention | `/enterprise/attention` | enterprise.alerts.view | |
| ENT-004 | Global search | `/enterprise/search` | enterprise.global_search.view | |
| ENT-005 | Reports | `/enterprise/reports` | enterprise.reporting.view | |
| ENT-006 | Org settings | `/enterprise/settings` | enterprise.module_config.view | Module toggles |

**Enterprise leak checks:** switch property context on ENT-002 and verify operational screens only
show the active property's rows; verify no other property's data appears.

### 19 Subscription — SUB

| ID | Screen | Route | Permission | Notes |
|---|---|---|---|---|
| SUB-001 | Subscription | `/billing/subscription` | billing.subscription.view | Plans, current plan |
| SUB-002 | Invoices | `/billing/invoices` | billing.invoice.view | Platform invoices |
| SUB-003 | Payments | `/billing/payments` | billing.payment.view | |
| SUB-004 | Usage | `/billing/usage` | billing.usage.view | |
| SUB-005 | Billing account | `/billing/account` | billing.account.view | |

### 20 Notifications — NOTIF

| ID | Screen | Route | Permission | Notes |
|---|---|---|---|---|
| NOTIF-001 | Notification center | `/notifications` | notifications.view | |
| NOTIF-002 | Preferences | `/notifications/preferences` | notifications.preference.view | |
| NOTIF-003 | Communication history | `/notifications/communications` | communications.view | |
| NOTIF-004 | Automations | `/notifications/automations` | automation.view | |
| — | Templates as separate screen | — | — | **NOT IMPLEMENTED** |

### 21 Analytics — ANALYTICS

| ID | Screen | Route | Permission | Notes |
|---|---|---|---|---|
| ANALYTICS-001 | Owner command center | `/analytics` | analytics.dashboard.view | The real owner dashboard (see DASH-001 note) |
| ANALYTICS-002 | Restaurant | `/analytics/restaurant` | analytics.restaurant.view | |
| ANALYTICS-003 | Hotel | `/analytics/hotel` | analytics.hotel.view | |
| ANALYTICS-004 | Inventory | `/analytics/inventory` | analytics.inventory.view | |
| ANALYTICS-005 | Finance | `/analytics/finance` | analytics.finance.view | |
| ANALYTICS-006 | Events | `/analytics/events` | analytics.events.view | |
| ANALYTICS-007 | CRM | `/analytics/crm` | analytics.crm.view | |
| ANALYTICS-008 | HR | `/analytics/hr` | analytics.hr.view | |
| ANALYTICS-009 | Commerce | `/analytics/commerce` | analytics.commerce.view | |
| ANALYTICS-010 | Reports catalog | `/analytics/reports` | analytics.dashboard.view | |

**Analytics checks:** date filters (today/week/month/custom), property/outlet filters, drilldowns
actually navigate, empty states are honest when the estate is empty.

### 22 AI — AI

| ID | Screen | Route | Permission | Notes |
|---|---|---|---|---|
| AI-001 | AI command center | `/ai` | analytics.dashboard.view | Ask/brief/recommendations — **test with real data only**; verify answers reference actual rows; verify permission gating |

### 23 Integrations — INT

| ID | Screen | Route | Permission | Notes |
|---|---|---|---|---|
| INT-001 | Integration settings | `/integrations` | integrations.view | Registry is in-memory; **do not connect real providers** |

Planned INT-002..006 (detail/API keys/webhooks/logs/references): **NOT IMPLEMENTED** as separate
screens.

### 24 Security — SEC

| ID | Screen | Route | Permission | Notes |
|---|---|---|---|---|
| SEC-001 | Audit trail | `/audit` | audit.view | Auth + access + business audit events, result column |
| — | Security dashboard / Sessions / Security events / Data access as separate screens | — | — | **NOT IMPLEMENTED** (session behavior = AUTH-003; access = RLS + ORG-004) |

### 25 Platform Admin — PLAT

Only reachable with a platform-admin account. **Verify an Organization Owner does NOT get these.**

| ID | Screen | Route | Permission | Notes |
|---|---|---|---|---|
| PLAT-001 | Platform dashboard | `/platform` | platform.dashboard.view | |
| PLAT-002 | Organizations | `/platform/organizations` | platform.organization.view | |
| PLAT-003 | Support | `/platform/support` | platform.support.view | |
| PLAT-004 | Security | `/platform/security` | platform.security.view | |
| PLAT-005 | Health | `/platform/health` | platform.health.view | |
| PLAT-006 | Announcements | `/platform/announcements` | platform.announcement.view | |
| PLAT-007 | Settings / feature flags | `/platform/settings` | platform.feature_flag.view | |
| — | Organization detail / Subscriptions / Maintenance / Platform audit as separate screens | — | — | **NOT IMPLEMENTED** (org detail folded into PLAT-002) |

### 26 Onboarding — ONB

| ID | Screen | Route | Permission | Notes |
|---|---|---|---|---|
| ONB-001 | Onboarding wizard | `/onboarding` | member (pre-tenant) | Create first org/property/outlet from a fresh session |
| ONB-002 | Setup wizard | `/setup` | member | Business → property → outlets → modules → launch steps |
| ONB-003 | Platform onboarding dashboard | `/platform/onboarding` | platform.organization.view | |

### 27 Documents — DOC

| ID | Screen | Route | Permission | Notes |
|---|---|---|---|---|
| DOC-001 | Document center | `/documents` | documents.view | Upload/preview/download/archive |
| DOC-002 | Templates | `/documents/templates` | documents.manage_templates | Template + generation |

### 28 Configuration — CONFIG

| ID | Screen | Route | Permission | Notes |
|---|---|---|---|---|
| CONFIG-001 | Settings | `/settings` | settings.view | **Volatile** — settings are an in-memory Map (§3). Change → verify behavior → expect loss on reload; record PASS WITH ISSUE |

### 29 Operations — OPS

| ID | Screen | Route | Permission | Notes |
|---|---|---|---|---|
| OPS-001 | Task board | `/operations/tasks` | task.view | **Volatile** in-memory tasks |
| OPS-002 | My work | `/my-work` | task.view | **Volatile** |
| OPS-003 | Approvals | `/approvals` | approval.view | **Volatile** |

Test create → assign → start → complete → approve/reject within one browser session; verify reload
clears data (expected per §3) and record accordingly.

### 30 Revenue — REV

| ID | Screen | Route | Permission | Notes |
|---|---|---|---|---|
| REV-001 | Revenue dashboard | `/revenue` | revenue.view | **Volatile channel-pricing half**; rate reads real |
| REV-002 | Promotions | `/revenue/promotions` | revenue.promotion.view | Volatile |
| REV-003 | Price history | `/revenue/price-history` | revenue.pricing.view | Rate history reads real |
| REV-004 | Rate calendar | `/hotel/revenue/rates` | revenue.pricing.view | Rate calendar over room rates |

### 31 Supply Chain — SC

| ID | Screen | Route | Permission | Notes |
|---|---|---|---|---|
| SC-001 | Supply chain dashboard | `/procurement` | supply_chain.view | Volatile |
| SC-002 | Procurement intelligence | `/procurement/intelligence` | supply_chain.intelligence.view | Volatile |
| SC-003 | Supplier 360 | `/procurement/suppliers/:supplierId` | supply_chain.supplier.view | Volatile |
| SC-004 | Procurement calendar | `/procurement/calendar` | supply_chain.calendar.view | Volatile |

### 32 Guest Experience — GX

| ID | Screen | Route | Permission | Notes |
|---|---|---|---|---|
| GX-001 | Experience dashboard | `/experience` | experience.view | Volatile |
| GX-002 | Feedback | `/experience/feedback` | experience.feedback.view | Volatile |
| GX-003 | Complaints | `/experience/complaints` | experience.complaint.view | Volatile |
| GX-004 | Analytics | `/experience/analytics` | experience.analytics.view | Volatile |
| GX-005 | Hotel | `/experience/hotel` | experience.view | Volatile |
| GX-006 | Restaurant | `/experience/restaurant` | experience.view | Volatile |
| GX-007 | Events | `/experience/events` | experience.view | Volatile |
| GX-008 | Service quality | `/experience/service-quality` | experience.analytics.view | Volatile |
| GX-009 | Experience detail | `/experience/:id` | experience.view | |
| GX-010 | Complaint detail | `/experience/complaints/:id` | experience.complaint.view | |
| GX-011 | Feedback detail | `/experience/feedback/:id` | experience.feedback.view | |

Complaint recovery flow (§13.8) runs entirely on volatile data.

### 33 Marketing — MKT

| ID | Screen | Route | Permission | Notes |
|---|---|---|---|---|
| MKT-001 | Marketing dashboard | `/marketing` | marketing.view | Volatile |
| MKT-002 | Campaigns | `/marketing/campaigns` | marketing.campaign.view | Volatile |
| MKT-003 | Campaign create | `/marketing/campaigns/new` | marketing.campaign.create | Volatile |
| MKT-004 | Campaign detail | `/marketing/campaigns/:campaignId` | marketing.campaign.view | Volatile |
| MKT-005 | Audiences | `/marketing/audiences` | marketing.audience.view | Volatile |
| MKT-006 | Offers | `/marketing/offers` | marketing.offer.view | Volatile |
| MKT-007 | Offer create | `/marketing/offers/new` | marketing.offer.create | Volatile |
| MKT-008 | Offer detail | `/marketing/offers/:offerId` | marketing.offer.view | Volatile |
| MKT-009 | Marketing analytics | `/marketing/analytics` | marketing.analytics.view | Volatile |
| MKT-010 | Marketing settings | `/marketing/settings` | marketing.settings.manage | Volatile |

**Do not send real marketing messages during QA.**

### 34 Guest Portal — GUEST

| ID | Screen | Route | Permission | Notes |
|---|---|---|---|---|
| GUEST-001 | Guest home | `/guest` | guest_experience.view | Volatile |
| GUEST-002 | Bookings | `/guest/bookings` | guest_experience.view | Volatile |
| GUEST-003 | Stay | `/guest/stay` | guest_experience.view | Volatile |
| GUEST-004 | Dining | `/guest/dining` | guest_experience.view | Volatile |
| GUEST-005 | Requests | `/guest/requests` | guest_experience.request.view | Volatile |
| GUEST-006 | Bills | `/guest/bills` | guest_experience.view | Volatile |
| GUEST-007 | Rewards | `/guest/rewards` | guest_experience.view | Volatile |
| GUEST-008 | Offers | `/guest/offers` | guest_experience.view | Volatile |
| GUEST-009 | Events | `/guest/events` | guest_experience.view | Volatile |
| GUEST-010 | Feedback | `/guest/feedback` | guest_experience.view | Volatile |
| GUEST-011 | Profile | `/guest/profile` | guest_experience.view | Volatile |
| GUEST-012 | Check-in | `/guest/checkin` | guest_experience.checkin.view | Volatile |
| GUEST-013 | Concierge | `/guest/concierge` | guest_experience.conversation.view | Volatile |
| GUEST-014 | Notifications | `/guest/notifications` | guest_experience.view | Volatile |
| GUEST-015 | Timeline | `/guest/timeline` | guest_experience.view | Volatile |

**Privacy check:** the guest portal must only show guest-appropriate information — no cost bases,
no staff notes, no other guests' data.

### Shell surfaces — SHELL

| ID | Surface | Where | Notes |
|---|---|---|---|
| SHELL-001 | Navigation | left sidebar / drawer | Every nav row resolves to a real screen (the routes.ts ↔ nav cross-check) |
| SHELL-002 | Context switcher | header "Organization › Property › Outlet" | Switching context re-scopes every screen; no stale rows from the previous context |
| SHELL-003 | Global search | shell | Opens, results correct, empty state, clear |
| SHELL-004 | Access-lost screen | protected routes when access disappears | Renders instead of a crash when memberships vanish |
| SHELL-005 | Not-implemented route | unknown paths | Renders the not-implemented/404 surface, not a white screen |

---

## 7. Named end-to-end flows (§§17–29, 61 of the prompt)

Run each flow inside its domain phase. Record the step where a flow blocks (expected: C1/C2 in §3).

1. **POS flow (REST)**: open POS → select table → add item → change qty → add note → remove item → place order → verify KOT generated → KDS receives → correct items/qty/table.
2. **KDS (KDS-001)**: station selector · new KOT visible · accept → start → ready → served · cancel · priority · elapsed time · filters. Change an order in POS → verify KDS updates.
3. **Billing (REST-004)**: generate bill → discount → tax → service charge (if configured) → verify `Subtotal + Tax − Discount + Service = Grand Total` by hand → split bill → split payment → cash/UPI/card/other.
4. **Inventory flow (INV)**: create item → receive stock → view stock → view movement → create recipe → *(consume-through-order: BLOCKED, C1)* → view consumption → create wastage → transfer → stock take. **Inspect real numbers at every step.**
5. **Procurement flow (PROC)**: supplier → purchase order → GRN receive → inventory increases → supplier invoice → supplier payment. Verify each screen after every action.
6. **Hotel flow (HOTEL)**: create guest → create room type → create room → check availability via reservation → create reservation → assign room → confirm → check-in (front desk) → add folio charge → *(charge restaurant to room: BLOCKED, C2)* → payment → checkout.
7. **Housekeeping cycle (HK-001)**: checkout → room goes dirty → task created → assign → start → complete → inspect → pass → clean.
8. **Maintenance cycle (MAINT-001)**: create issue → assign → start → resolve → verify.
9. **Finance trace (FIN)**: after restaurant/hotel/procurement transactions, open FIN-001..004 and verify the numbers moved; click source references; trace dashboard → P&L → revenue → transaction.
10. **Events flow (EVENT)**: lead → event → plan → bill.
11. **Complaint recovery (GX)**: create complaint → assignment → resolution → timeline.
12. **Guest portal (GUEST)**: browse bookings/stay/dining/requests/bills — guest-appropriate data only.

---

## 8. Responsive testing (§51)

For every critical screen — POS (REST-003), KDS (KDS-001), Housekeeping (HK-001), Front Desk
(HOTEL-005), Inventory (INV-*), Tasks (OPS-*), Approvals (OPS-003), Guest Portal (GUEST-*):

| Viewport | Width |
|---|---|
| Desktop | ≥1280px |
| Tablet | ~768px |
| Mobile | ~390px |

Check: no horizontal overflow · buttons reachable · tables usable · modals fit · forms usable ·
numeric input usable.

---

## 9. Global UI checks (§52–53)

- **Search** (SHELL-003): opens, results correct, empty state, clear.
- **Filters**: open, values load, apply works, clear works.
- **Forms**: required fields, validation, save, cancel, duplicate prevention.
- **Modals**: open, close, Escape, cancel, confirm.
- **Toasts**: success, error, warning.
- **Consistency**: buttons, colors, typography, spacing, icons, status badges, tables, forms,
  dialogs, empty/loading/error states. Fix only obvious breaks — **no redesign**.

---

## 10. Testing order (§60)

| Phase | Domains | IDs |
|---|---|---|
| 1 | Auth → Org → Property → Outlet → Dashboard | AUTH, ORG, PROPERTY, OUTLET, DASH |
| 2 | Restaurant → POS → KOT → KDS → Billing | REST, KDS |
| 3 | Inventory → Recipes → Procurement → Suppliers → GRN | INV, PROC |
| 4 | Hotel → Reservations → Front Desk → Folio → Checkout → Housekeeping → Maintenance | HOTEL, HK, MAINT |
| 5 | Finance (AR/AP/cash/P&L read-models) | FIN |
| 6 | CRM → Events → HR | CRM, EVENT, HR |
| 7 | Commerce → Enterprise → Subscription | COM, ENT, SUB |
| 8 | Notifications → Analytics → AI → Integrations | NOTIF, ANALYTICS, AI, INT |
| 9 | Documents → Configuration → Operations | DOC, CONFIG, OPS |
| 10 | Revenue → Supply Chain → Guest Experience → Marketing → Guest Portal | REV, SC, GX, MKT, GUEST |
| 11 | Platform Admin → Security → Onboarding | PLAT, SEC, ONB |

Responsive + global checks ride along with each phase rather than being a separate pass at the end.

---

## 11. Issue recording (§57)

Every defect gets a `## ISSUE UI-XXXX` record in the REPORT doc:

```
## ISSUE UI-XXXX
Screen:      <ID — name>
Route:       <path>
Severity:    P0 blocker / P1 major / P2 minor / P3 cosmetic

Steps to reproduce:
Expected:
Actual:
Likely cause:
Fix:         (or "none — recorded only")
Retest:      date + result (always re-run the original steps after a fix — §64)
```

Severity policy (§55): classify and **keep walking** — do not spend an hour on a P3 while 100
screens are untested.

## 12. Screen report record (§54)

One record per tested screen in the REPORT doc: Route · Status · Load / Visual / Data /
Create-Edit / Validation / Actions / Permissions / Responsive (each PASS/FAIL/N-A) · Issues ·
Reference.

## 13. Rules of engagement

- §55 — classify, continue, batch fixes where sensible.
- §59 — **actual repository wins**; nothing is built to satisfy the taxonomy.
- §62 — PASS requires the full bar, not just "page opens".
- §63 — fixes allowed: broken buttons/routes/navigation, form bugs, permission bugs, data-binding,
  modal bugs, calculation display, responsive, runtime errors. **Not allowed**: new modules,
  workflows, AI, integrations, architecture.
- §64 — after every fix: reload → repeat the original steps → verify.
- §67 — coverage is stated exactly ("N / 166 surfaces manually tested"); never "complete" unless it is.
- §68 — **hard stop**: this phase produces findings; the next development decision is based on them.
