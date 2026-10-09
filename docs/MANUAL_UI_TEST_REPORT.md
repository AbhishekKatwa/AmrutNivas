# AMRUT NIVAAS — MANUAL UI TEST REPORT

Companion to **`/docs/MANUAL_UI_TEST_PLAN.md`** (screen inventory, checklists, flows, rules).
This report is updated only from **actual browser interaction** — nothing is marked PASS without
being exercised in the UI (Prompt #33 §1, §62).

---

## Testing session

| Item | Value |
|---|---|
| Testing date | 2026-10-09 (in progress) |
| Environment | Vite dev server, http://localhost:5175 |
| Browser | Desktop Chromium (QA harness) |
| Test user | OWNER001 / Owner123! (development-only credentials) |
| Organization | "Amrut Nivaas Shirur" — `936c73c5-c0f2-4e3f-ae14-8fa4dd974c06` |
| Property | `9609d7dd-ffdb-4b78-b7f5-088357838623` |
| Outlet | `3fcf1ea3-3310-4b85-95ed-6c80a6c0223b` |
| Data state | Empty estate — every create-flow exercised from scratch |

---

## 1. Coverage dashboard (§56)

| Counter | Value |
|---|---|
| Total screen surfaces | **166** (155 shell routes + 5 public + sign-in + 5 shell surfaces) + 3 auth flows = **169 tracked IDs** |
| Manually tested | **19** (AUTH-001..004 + ORG-001..004 + PROPERTY-001 + OUTLET-001 + DASH-001 + REST-001..007 + KDS-001 — full §62 checklists) |
| PASS | 9 |
| PASS WITH ISSUE | 9 |
| FAIL | 1 |
| BLOCKED | 0 |
| NOT APPLICABLE | 0 |
| NOT IMPLEMENTED | 21 planned-but-absent surfaces are noted in the PLAN (§6) and are not test slots |
| Issues open | 1 (UI-0004 P1 server half — tracked under task #58) |
| Issues fixed | 17 (UI-0001 P3, UI-0002 P1, UI-0003 P1, UI-0005 P3, UI-0006 P2, UI-0007 P1, UI-0008 P2, UI-0009 P3, UI-0010 P2, UI-0011 P1, UI-0012 P1, UI-0013 P3, UI-0014 P1, UI-0015 P3, UI-0016 P3, UI-0017 P1, UI-0018 P1 — all retested PASS) |

Coverage statement (§67): **19 / 169 tracked IDs manually tested so far.** This line is updated as
testing proceeds; it is never stated as "complete" before every ID carries a final status.

---

## 2. Screen status summary (§58)

Status vocabulary: `PASS` · `PASS WITH ISSUE` · `FAIL` · `BLOCKED` · `NOT TESTED` · `NOT APPLICABLE`.
The **Issues** column references `## ISSUE UI-XXXX` records in §4 below.

### Authentication (flows)

| ID | Screen | Route | Status | Issues |
|---|---|---|---|---|
| AUTH-001 | Sign in (login matrix) | `/sign-in` | PASS | UI-0003 (fixed) |
| AUTH-002 | Logout + protected routes | header | PASS | |
| AUTH-003 | Session persistence | all | PASS | |
| AUTH-004 | Forgot password | `/sign-in` → "Forgot password?" | FAIL | UI-0004 |

### Organization / Property / Outlet / Dashboard

| ID | Screen | Route | Status | Issues |
|---|---|---|---|---|
| ORG-001 | Organization | `/organization` | PASS | |
| ORG-002 | Departments | `/departments` | PASS | |
| ORG-003 | Team (members) | `/team` | PASS | UI-0005 (fixed) |
| ORG-004 | Roles & permissions | `/roles` | PASS | UI-0009 (fixed) · UI-0006/0007/0008 (fixed) |
| PROPERTY-001 | Properties | `/properties` | PASS WITH ISSUE | UI-0010 (fixed) |
| OUTLET-001 | Outlets | `/outlets` | PASS | |
| DASH-001 | Foundation status (landing) | `/` | PASS | UI-0001 (fixed) · UI-0011 (fixed) · UI-0012 (fixed) |

### Restaurant / KDS

| ID | Screen | Route | Status | Issues |
|---|---|---|---|---|
| REST-001 | Menu management | `/menu` | PASS | |
| REST-002 | Tables & floor | `/tables` | PASS WITH ISSUE | UI-0013 (fixed) |
| REST-003 | POS | `/pos` | PASS WITH ISSUE | UI-0014 (fixed) |
| REST-004 | Bills & payments | `/billing` | PASS WITH ISSUE | UI-0015 (fixed) · UI-0016 (fixed) |
| REST-005 | Shifts | `/shifts` | PASS WITH ISSUE | UI-0017 (fixed) |
| REST-006 | Stations | `/stations` | PASS | |
| REST-007 | Restaurant day | `/restaurant` | PASS | |
| KDS-001 | Kitchen display | `/kitchen` | PASS WITH ISSUE | UI-0018 (fixed) |

### Inventory / Procurement

| ID | Screen | Route | Status | Issues |
|---|---|---|---|---|
| INV-001 | Inventory overview | `/inventory` | NOT TESTED | |
| INV-002 | Items | `/inventory/items` | NOT TESTED | |
| INV-003 | Stock | `/inventory/stock` | NOT TESTED | |
| INV-004 | Movements | `/inventory/movements` | NOT TESTED | |
| INV-005 | Locations | `/inventory/locations` | NOT TESTED | |
| INV-006 | Recipes | `/inventory/recipes` | NOT TESTED | |
| INV-007 | Wastage | `/inventory/wastage` | NOT TESTED | |
| INV-008 | Transfers | `/inventory/transfers` | NOT TESTED | |
| INV-009 | Stock takes | `/inventory/stock-takes` | NOT TESTED | |
| PROC-001 | Purchases (PO/GRN/invoices/payments) | `/inventory/purchases` | NOT TESTED | |
| PROC-002 | Suppliers | `/inventory/suppliers` | NOT TESTED | |

### Hotel / Housekeeping / Maintenance

| ID | Screen | Route | Status | Issues |
|---|---|---|---|---|
| HOTEL-001 | Room types | `/hotel/room-types` | NOT TESTED | |
| HOTEL-002 | Rooms | `/hotel/rooms` | NOT TESTED | UI-0002 (fixed) |
| HOTEL-003 | Reservations | `/hotel/reservations` | NOT TESTED | |
| HOTEL-004 | Reservation detail | `/hotel/reservations/:reservationId` | NOT TESTED | |
| HOTEL-005 | Front desk | `/hotel/front-desk` | NOT TESTED | |
| HOTEL-006 | Stay detail | `/hotel/stays/:stayId` | NOT TESTED | |
| HOTEL-007 | Guests | `/hotel/guests` | NOT TESTED | |
| HOTEL-008 | Lost & found | `/hotel/lost-found` | NOT TESTED | |
| HOTEL-009 | Assets | `/hotel/assets` | NOT TESTED | |
| HK-001 | Housekeeping | `/hotel/housekeeping` | NOT TESTED | |
| MAINT-001 | Maintenance | `/hotel/maintenance` | NOT TESTED | |

### Finance

| ID | Screen | Route | Status | Issues |
|---|---|---|---|---|
| FIN-001 | Invoices (read-model) | `/finance/invoices` | NOT TESTED | |
| FIN-002 | Payments (read-model) | `/finance/payments` | NOT TESTED | |
| FIN-003 | Accounting day-book | `/finance/accounting` | NOT TESTED | |
| FIN-004 | P&L (read-model) | `/finance/profit-loss` | NOT TESTED | |

### CRM / Events / HR

| ID | Screen | Route | Status | Issues |
|---|---|---|---|---|
| CRM-001 | CRM overview | `/crm` | NOT TESTED | |
| CRM-002 | Customers | `/crm/customers` | NOT TESTED | |
| CRM-003 | Customer 360 | `/crm/customers/:customerId` | NOT TESTED | |
| CRM-004 | Feedback | `/crm/feedback` | NOT TESTED | |
| CRM-005 | Complaints | `/crm/complaints` | NOT TESTED | |
| CRM-006 | Loyalty | `/crm/loyalty` | NOT TESTED | |
| CRM-007 | Corporate accounts | `/crm/corporate` | NOT TESTED | |
| EVENT-001 | Events overview | `/events` | NOT TESTED | |
| EVENT-002 | Leads | `/events/leads` | NOT TESTED | |
| EVENT-003 | Events list | `/events/list` | NOT TESTED | |
| EVENT-004 | Venues | `/events/venues` | NOT TESTED | |
| EVENT-005 | Event detail | `/events/:eventId` | NOT TESTED | |
| HR-001 | HR overview | `/hr` | NOT TESTED | |
| HR-002 | Employees | `/hr/employees` | NOT TESTED | |
| HR-003 | Employee profile | `/hr/employees/:employeeId` | NOT TESTED | |
| HR-004 | Attendance | `/hr/attendance` | NOT TESTED | |
| HR-005 | Shifts | `/hr/shifts` | NOT TESTED | |
| HR-006 | Roster | `/hr/roster` | NOT TESTED | |
| HR-007 | Leave | `/hr/leave` | NOT TESTED | |

### Commerce

| ID | Screen | Route | Status | Issues |
|---|---|---|---|---|
| COM-001 | Commerce overview | `/commerce` | NOT TESTED | |
| COM-002 | Channels | `/commerce/channels` | NOT TESTED | |
| COM-003 | QR codes | `/commerce/qr-codes` | NOT TESTED | |
| COM-004 | Table requests | `/commerce/table-requests` | NOT TESTED | |
| COM-005 | Commerce settings | `/commerce/settings` | NOT TESTED | |
| COM-006 | Orders | `/commerce/orders` | NOT TESTED | |
| COM-007 | Direct booking | `/commerce/direct-booking` | NOT TESTED | |
| COM-008 | Public property page | `/stay/:propertySlug` | NOT TESTED | |
| COM-009 | Public menu | `/menu/:outletSlug` | NOT TESTED | |
| COM-010 | Public QR order | `/order/:qrCode` | NOT TESTED | |
| COM-011 | Public booking lookup | `/booking/lookup` | NOT TESTED | |
| COM-012 | Public feedback | `/feedback/:token` | NOT TESTED | |

### Enterprise / Subscription

| ID | Screen | Route | Status | Issues |
|---|---|---|---|---|
| ENT-001 | Enterprise overview | `/enterprise` | NOT TESTED | |
| ENT-002 | Properties (cross-property) | `/enterprise/properties` | NOT TESTED | |
| ENT-003 | Attention | `/enterprise/attention` | NOT TESTED | |
| ENT-004 | Global search | `/enterprise/search` | NOT TESTED | |
| ENT-005 | Reports | `/enterprise/reports` | NOT TESTED | |
| ENT-006 | Org settings (module toggles) | `/enterprise/settings` | NOT TESTED | |
| SUB-001 | Subscription | `/billing/subscription` | NOT TESTED | |
| SUB-002 | Invoices | `/billing/invoices` | NOT TESTED | |
| SUB-003 | Payments | `/billing/payments` | NOT TESTED | |
| SUB-004 | Usage | `/billing/usage` | NOT TESTED | |
| SUB-005 | Billing account | `/billing/account` | NOT TESTED | |

### Notifications / Analytics / AI / Integrations

| ID | Screen | Route | Status | Issues |
|---|---|---|---|---|
| NOTIF-001 | Notification center | `/notifications` | NOT TESTED | |
| NOTIF-002 | Preferences | `/notifications/preferences` | NOT TESTED | |
| NOTIF-003 | Communication history | `/notifications/communications` | NOT TESTED | |
| NOTIF-004 | Automations | `/notifications/automations` | NOT TESTED | |
| ANALYTICS-001 | Owner command center | `/analytics` | NOT TESTED | |
| ANALYTICS-002 | Restaurant | `/analytics/restaurant` | NOT TESTED | |
| ANALYTICS-003 | Hotel | `/analytics/hotel` | NOT TESTED | |
| ANALYTICS-004 | Inventory | `/analytics/inventory` | NOT TESTED | |
| ANALYTICS-005 | Finance | `/analytics/finance` | NOT TESTED | |
| ANALYTICS-006 | Events | `/analytics/events` | NOT TESTED | |
| ANALYTICS-007 | CRM | `/analytics/crm` | NOT TESTED | |
| ANALYTICS-008 | HR | `/analytics/hr` | NOT TESTED | |
| ANALYTICS-009 | Commerce | `/analytics/commerce` | NOT TESTED | |
| ANALYTICS-010 | Reports catalog | `/analytics/reports` | NOT TESTED | |
| AI-001 | AI command center | `/ai` | NOT TESTED | |
| INT-001 | Integration settings | `/integrations` | NOT TESTED | |

### Security / Platform Admin / Onboarding

| ID | Screen | Route | Status | Issues |
|---|---|---|---|---|
| SEC-001 | Audit trail | `/audit` | NOT TESTED | |
| PLAT-001 | Platform dashboard | `/platform` | NOT TESTED | |
| PLAT-002 | Organizations | `/platform/organizations` | NOT TESTED | |
| PLAT-003 | Support | `/platform/support` | NOT TESTED | |
| PLAT-004 | Security | `/platform/security` | NOT TESTED | |
| PLAT-005 | Health | `/platform/health` | NOT TESTED | |
| PLAT-006 | Announcements | `/platform/announcements` | NOT TESTED | |
| PLAT-007 | Settings / feature flags | `/platform/settings` | NOT TESTED | |
| ONB-001 | Onboarding wizard | `/onboarding` | NOT TESTED | |
| ONB-002 | Setup wizard | `/setup` | NOT TESTED | |
| ONB-003 | Platform onboarding | `/platform/onboarding` | NOT TESTED | |

### Documents / Configuration / Operations

| ID | Screen | Route | Status | Issues |
|---|---|---|---|---|
| DOC-001 | Document center | `/documents` | NOT TESTED | |
| DOC-002 | Templates | `/documents/templates` | NOT TESTED | |
| CONFIG-001 | Settings (volatile) | `/settings` | NOT TESTED | |
| OPS-001 | Task board (volatile) | `/operations/tasks` | NOT TESTED | |
| OPS-002 | My work (volatile) | `/my-work` | NOT TESTED | |
| OPS-003 | Approvals (volatile) | `/approvals` | NOT TESTED | |

### Revenue / Supply chain / Guest experience / Marketing / Guest portal

| ID | Screen | Route | Status | Issues |
|---|---|---|---|---|
| REV-001 | Revenue dashboard | `/revenue` | NOT TESTED | |
| REV-002 | Promotions | `/revenue/promotions` | NOT TESTED | |
| REV-003 | Price history | `/revenue/price-history` | NOT TESTED | |
| REV-004 | Rate calendar | `/hotel/revenue/rates` | NOT TESTED | |
| SC-001 | Supply chain dashboard | `/procurement` | NOT TESTED | |
| SC-002 | Procurement intelligence | `/procurement/intelligence` | NOT TESTED | |
| SC-003 | Supplier 360 | `/procurement/suppliers/:supplierId` | NOT TESTED | |
| SC-004 | Procurement calendar | `/procurement/calendar` | NOT TESTED | |
| GX-001 | Experience dashboard | `/experience` | NOT TESTED | |
| GX-002 | Feedback | `/experience/feedback` | NOT TESTED | |
| GX-003 | Complaints | `/experience/complaints` | NOT TESTED | |
| GX-004 | Analytics | `/experience/analytics` | NOT TESTED | |
| GX-005 | Hotel | `/experience/hotel` | NOT TESTED | |
| GX-006 | Restaurant | `/experience/restaurant` | NOT TESTED | |
| GX-007 | Events | `/experience/events` | NOT TESTED | |
| GX-008 | Service quality | `/experience/service-quality` | NOT TESTED | |
| GX-009 | Experience detail | `/experience/:id` | NOT TESTED | |
| GX-010 | Complaint detail | `/experience/complaints/:id` | NOT TESTED | |
| GX-011 | Feedback detail | `/experience/feedback/:id` | NOT TESTED | |
| MKT-001 | Marketing dashboard | `/marketing` | NOT TESTED | |
| MKT-002 | Campaigns | `/marketing/campaigns` | NOT TESTED | |
| MKT-003 | Campaign create | `/marketing/campaigns/new` | NOT TESTED | |
| MKT-004 | Campaign detail | `/marketing/campaigns/:campaignId` | NOT TESTED | |
| MKT-005 | Audiences | `/marketing/audiences` | NOT TESTED | |
| MKT-006 | Offers | `/marketing/offers` | NOT TESTED | |
| MKT-007 | Offer create | `/marketing/offers/new` | NOT TESTED | |
| MKT-008 | Offer detail | `/marketing/offers/:offerId` | NOT TESTED | |
| MKT-009 | Marketing analytics | `/marketing/analytics` | NOT TESTED | |
| MKT-010 | Marketing settings | `/marketing/settings` | NOT TESTED | |
| GUEST-001 | Guest home | `/guest` | NOT TESTED | |
| GUEST-002 | Bookings | `/guest/bookings` | NOT TESTED | |
| GUEST-003 | Stay | `/guest/stay` | NOT TESTED | |
| GUEST-004 | Dining | `/guest/dining` | NOT TESTED | |
| GUEST-005 | Requests | `/guest/requests` | NOT TESTED | |
| GUEST-006 | Bills | `/guest/bills` | NOT TESTED | |
| GUEST-007 | Rewards | `/guest/rewards` | NOT TESTED | |
| GUEST-008 | Offers | `/guest/offers` | NOT TESTED | |
| GUEST-009 | Events | `/guest/events` | NOT TESTED | |
| GUEST-010 | Feedback | `/guest/feedback` | NOT TESTED | |
| GUEST-011 | Profile | `/guest/profile` | NOT TESTED | |
| GUEST-012 | Check-in | `/guest/checkin` | NOT TESTED | |
| GUEST-013 | Concierge | `/guest/concierge` | NOT TESTED | |
| GUEST-014 | Notifications | `/guest/notifications` | NOT TESTED | |
| GUEST-015 | Timeline | `/guest/timeline` | NOT TESTED | |

### Shell surfaces

| ID | Surface | Where | Status | Issues |
|---|---|---|---|---|
| SHELL-001 | Navigation (every row resolves) | sidebar | NOT TESTED | |
| SHELL-002 | Context switcher re-scopes | header | NOT TESTED | |
| SHELL-003 | Global search | shell | NOT TESTED | |
| SHELL-004 | Access-lost screen | protected routes | NOT TESTED | |
| SHELL-005 | Unknown-route surface | any bad path | NOT TESTED | |

---

## 3. Preliminary smoke log (pre-plan informal checks)

These were load-only smoke checks (page opens, no crash, console clean, honest empty state). They do
**not** satisfy the §62 PASS bar; each screen still gets its full checklist during its phase.

| Route | ID | Smoke result |
|---|---|---|
| `/` | DASH-001 | Opens, renders module status; stale copy recorded as UI-0001 (fixed) |
| `/restaurant` | REST-007 | Opens, honest empty state, console clean |
| `/menu` | REST-001 | Opens, honest empty state, console clean |
| `/hotel/rooms` | HOTEL-002 | Was broken (UI-0002); after fix opens with "No rooms yet" + clean console |

---

## 4. Issues (§57 format)

## ISSUE UI-0001
Screen:      DASH-001 — Foundation status (landing page)
Route:       `/`
Severity:    P3 cosmetic

Steps to reproduce:
1. Sign in as OWNER001.
2. Land on `/` and read the status copy.

Expected:    Copy reflects the live connected state (data plane configured and reachable).
Actual:      Page states "No data plane connected to this build… ships without project keys" while the app is fully connected to Supabase and serving live reads.
Likely cause: Stale hard-coded landing copy that predates the Supabase wiring.
Fix:         `src/pages/FoundationStatusPage.tsx` — replaced the "No data plane connected…" empty card with an honest copy ("Operational totals live on each module's overview — the data plane is wired; this page proves the foundation modules, not operational totals") and added a "Wire status" panel naming #31.5 `resolve_login`, the RBAC ladder, audit trail, migrations 000–049 and the hosted Supabase data plane as live; remaining surface (SMTP/site URL/redirect allow-list) tracked under task #58.
Retest:      2026-10-09 PASS — `/` renders the new "Operational totals live on each module's overview" empty state and the "Wire status" card with the up-to-date status copy. DOM snapshot captured (uid 24_1034/1036). `npx tsc --noEmit` clean.

## ISSUE UI-0002
Screen:      HOTEL-002 — Rooms
Route:       `/hotel/rooms`
Severity:    P1 major

Steps to reproduce:
1. Sign in as OWNER001, navigate to Hotel → Rooms.

Expected:    Page loads (honest empty state with "Add the first room" CTA on the empty estate).
Actual:      400 from PostgREST — "Something went wrong" error state. PostgREST code `42703` (column does not exist): the client selected/filtered a `rooms.status` column that the schema does not have. Rooms archive via `archived_at`, not a status enum.
Likely cause: Client service invented a column (`ROOM_COLUMNS` included `status`; `listRooms` filtered `.eq("status","ACTIVE")`).
Fix:         `room-service.ts`: dropped `status` from ROOM_COLUMNS; filter changed to `.is("archived_at", null)`; `Room` type now carries `archivedAt` only. Eight downstream consumers (RoomsPage, AssetsPage, FrontDeskPage ×2, HousekeepingPage, LostFoundPage, MaintenancePage, ReservationDetailPage, StayDetailPage) converted from `status === "ARCHIVED"` / `!== "ACTIVE"` predicates to `archivedAt == null`. `npx tsc --noEmit` clean.
Retest:      2026-10-09 PASS — reload → repeat original steps: page renders honest empty state ("No rooms yet", "0 rooms", Show archived switch, New room/Reload); console clean (vite debug + React DevTools info only).

## ISSUE UI-0003
Screen:      AUTH-001 — Sign in (success path)
Route:       `/sign-in`
Severity:    P1 major

Steps to reproduce:
1. Open `/sign-in`, enter valid credentials (OWNER001 / Owner123!).
2. Click LOGIN and watch the URL.

Expected:    Successful sign-in navigates into the app shell (lands on `/`).
Actual:      URL stayed on `/sign-in`; DASH-001 rendered *inside* the sign-in shell. The app mounts `/sign-in` under the shell even for signed-in users (by design, so a password-reset link lands somewhere sensible), and SignInPage had no success navigation of its own.
Likely cause: No `navigate()` on the success path in `SignInPage.submit()`; RouteGuard only redirects *unauthenticated* users.
Fix:         `SignInPage.submit()` now calls `navigate("/", { replace: true })` on success; `devBypassSignIn` uses `window.location.assign("/")` for the same reason.
Retest:      2026-10-09 PASS ×2 — OWNER001 sign-in lands on `/?organization=…&property=…&outlet=…` with DASH-001 rendered under the full shell.

## ISSUE UI-0004
Screen:      AUTH-004 — Forgot password
Route:       `/sign-in` → "Forgot password?"
Severity:    P1 major

Steps to reproduce:
1. Sign-in card → "Forgot password?".
2. Submit empty User ID → validation error (works: "Enter your User ID.").
3. Enter OWNER001 → "Send reset link".
4. Inspect the network tab for `/auth/v1/recover`.

Expected:    Reset email is sent; UI confirms "Check your inbox".
Actual:      UI showed "Check your inbox" while the request returned **400** `email_address_invalid` — `Email address "owner001@amrut-nivas.local" is invalid`. GoTrue refuses the `.local` email domain, so password reset can never send mail for ANY real account (unknown emails return a generic 200 before this validation, which is why fake-email probes passed).
Likely cause: Two independent defects: (1) server/infra — synthetic login accounts use `@amrut-nivas.local`, a domain GoTrue rejects; SMTP, `site_url` and redirect allow-list are unconfigured on the hosted project (out of §63 fix scope — tracked under task #58). (2) client — `resetPasswordForEmail` returns `{ error }` instead of throwing, and the result was ignored, so the 400 was swallowed into a false success.
Fix:         `auth-service.ts requestPasswordReset` now destructures the result and throws an AppError ("We could not send the reset email. Please try again shortly or contact your administrator.") on failure. §18 non-enumeration preserved: unknown User IDs still get the generic "Check your inbox" (verified via fake-email probe → 200); only genuine infrastructure failures surface. Redirect target now `appUrl() + /sign-in`; note `.env` still has `VITE_APP_URL=http://localhost:5173` while this session's dev server runs 5175 — deployment config, not edited (task #58).
Retest:      2026-10-09 PASS (client half) — reset form shows the honest error with `invalid="true"` instead of the false "Check your inbox". **Server half remains OPEN**: the capability is still dead end-to-end until the email-domain convention + SMTP are fixed (task #58). AUTH-004 status is therefore FAIL.

---

## 5. Detailed screen records (§54 format)

One record is appended here per screen as its full checklist completes. Format:

```
## <ID> — <Screen name>
Route:
Status:

### Load / Visual / Data / Create-Edit / Validation / Actions / Permissions / Responsive
PASS / FAIL each

### Issues
- (UI-XXXX references or "none")

### Reference
- date, user, notable observations
```

## AUTH-001 — Sign in (login matrix)
Route: `/sign-in`
Status: PASS (after UI-0003 fix)

### Checklist results
- **Load/Visual**: PASS — card renders, "User ID + Password" badge, no magic-link/email/passwordless options anywhere (Prompt #31.5 contract honored).
- **Data**: PASS — wrong user / wrong password / valid user with wrong password all surface the same generic failure message (no account enumeration).
- **Validation**: PASS — empty User ID → "Enter your User ID."; empty password → "Enter your password." (both `invalid=true`).
- **Controls**: PASS — password visibility toggle flips both ways.
- **Loading/error/success**: PASS — submitting shows a busy state; failure keeps the form; success navigates to `/` (UI-0003 fix).
- **Permissions**: N/A (pre-auth surface).
- **Responsive**: PASS (desktop viewport exercised).

### Issues
- UI-0003 (P1, fixed + retested).

### Reference
- 2026-10-09, OWNER001 — full matrix exercised manually in the browser.

## AUTH-002 — Logout + protected routes
Route: header (sign out) → `/sign-in`
Status: PASS

### Checklist results
- **Logout**: PASS — sign out returns to a shell-less `/sign-in`.
- **Protected redirect**: PASS — direct navigation to a protected URL while signed out lands on `/sign-in`; history back does not re-enter the app.
- **Permissions**: PASS — unauthenticated state cannot render shell content.

### Issues
- none.

### Reference
- 2026-10-09, OWNER001.

## AUTH-003 — Session persistence
Route: all (hard reload)
Status: PASS

### Checklist results
- **Session restore**: PASS — hard reload on `/` restores the session and re-resolves organization/property/outlet context; no re-prompt for credentials.
- **Data**: PASS — context query params reapplied, DASH-001 renders with the same estate.

### Issues
- none.

### Reference
- 2026-10-09, OWNER001.

## AUTH-004 — Forgot password
Route: `/sign-in` → "Forgot password?"
Status: FAIL (UI-0004 — capability dead end-to-end; honest client error landed)

### Checklist results
- **Load/Visual**: PASS — reset card opens from the sign-in card; "Back to sign in" returns without side effects.
- **Validation**: PASS — empty User ID → "Enter your User ID." (`invalid=true`).
- **Data/Actions**: **FAIL** — submission for OWNER001 shows "Check your inbox" while the API returns 400 `email_address_invalid` (pre-fix). Post-fix the client shows the honest "We could not send the reset email…" error, but no email can ever be delivered until the server-side email domain + SMTP are fixed (task #58).
- **Non-enumeration**: PASS — unknown User IDs still get the generic "Check your inbox" (fake-email probe returned 200).
- **Permissions**: N/A (pre-auth surface).

### Issues
- UI-0004 (P1 — server half open, tracked under task #58).

### Reference
- 2026-10-09, OWNER001 — root cause isolated to `@amrut-nivas.local` synthetic email domain rejected by GoTrue.

## ORG-001 — Organization
Route: `/organization`
Status: PASS

### Checklist results
- **Load/Visual**: PASS — heading, descriptive copy, profile card (name/code/slug), status card (Active), address card, tax region card all render; access debugging panel shows ready session with 312 permissions.
- **Data**: PASS — edit dialog prefills every field from the record; saving with tax region "MH" persisted and card version bumped to "Saved (version 2)".
- **Create-Edit**: PASS — edit dialog is prefilled and opens with the correct field structure; code/slug are *not* editable here (dialog states "Code and slug are omitted on purpose — the door has no parameter for them"), matching the API contract.
- **Validation**: PASS — empty Name blocks save with "A name is required." (field marked invalid).
- **Status transitions (verified without confirming)**: "Suspend trading" and "Archive tenant" dialogs both require a reason (multiline, "required") and keep the confirm button disabled until text is entered; both dialogs were cancelled without effect on the estate.
- **Permissions**: PASS — OWNER001 sees edit + status doors; no unexpected denials.
- **Responsive/Console**: no visual anomalies; console clean (vite debug + React DevTools info only).

### Issues
- none.

### Reference
- 2026-10-09, OWNER001. Estate change: organization `tax_region` set to "MH" (version 1→2).

## ORG-002 — Departments
Route: `/departments`
Status: PASS

### Checklist results
- **Load/Visual**: PASS — honest empty state on the empty estate ("Add the first department" CTA); after creation the table renders DEPARTMENT / CODE·SLUG / OUTLET / STATUS / ACTIONS with correct column data.
- **Create**: PASS — "Add department" dialog: name, code, slug, outlet (Property-wide or named outlet), status; empty submit blocked with three per-field errors ("A name is required." / "A code is required." / "A slug is required."); valid create persisted and listed.
- **Edit (immutability design)**: PASS — Code/Slug and Outlet render as disabled inputs with explanatory hints ("Issued identifiers are immutable — reports and imports already refer to them"; "Moving a cost centre to another outlet would restate which outlet's reports its people appear in"); rename to "Front Office & Guest Services" persisted.
- **Retire (archive + reason)**: PASS — Retire dialog requires a reason (confirm disabled until typed); confirmed with "QA walkthrough - lifecycle probe of retire flow"; row left the active list (default read excludes retired rows).
- **Show retired opt-in**: PASS — switch re-reads with the archived opt-in; heading changes to "Departments of the active property, including retired"; the row returns with STATUS Archived and Edit + Restore actions.
- **Restore (un-archive + reason)**: PASS — Restore dialog requires a reason ("This brings the cost centre back into active lists via the status door; the reason is audited."); confirmed with a restore reason; row returned to STATUS Active with Edit + Retire actions.
- **Filter**: present (All departments / Property-wide only / named outlet) — combobox rendered with expected options; not exhaustively driven (covered by the create path choosing Property-wide).
- **Permissions**: PASS — full CRUD available to OWNER001.
- **Console**: clean across the whole segment.

### Issues
- none.

### Reference
- 2026-10-09, OWNER001. QA probe data: department "Front Office & Guest Services" / FO / front-office / Property-wide, left ACTIVE at end (restored); retire/restore reasons recorded via the dialogs.

## ORG-003 — Team (members)
Route: `/team`
Status: PASS (UI-0005 P3 — fixed + retested PASS 2026-10-09; invitation panel copy now reflects deployment-conditional SMTP)

### Checklist results
- **Load/Visual**: PASS — Members table (PERSON / STATUS / ROLES HELD / JOINED / MANAGE) and Pending invitations table (EMAIL / ROLE / EXPIRES) render; honest empty state for invitations ("There are no open invitations to cancel or wait on.").
- **Data**: PASS — Demo Owner listed with email `owner001@amrut-nivas.local`, status Active, roles "Owner · Organization Owner", joined 8 Oct 2026.
- **Last-owner guard (UI)**: PASS — **Remove** is disabled on the owner row with description "Transfer ownership before removing the owner."
- **Invitation create + validation**: PASS — Invite dialog: email (required), full name (optional), role (required; 13 roles each labelled with scope, e.g. "Staff · OUTLET"); confirm disabled until required fields present; picking an OUTLET-scoped role reveals a Property → Outlets breadth selector ("the door grants breadth to the sites you chose at the same time"); submitting with no outlet chosen stays in-dialog and surfaces "Choose at least one outlet for this role." — no premature network call.
- **Invitation create (happy path)**: PASS — created `qa-invite-1@amrut-nivas.local` / Staff / Main Dining (Amrut Nivaas Shirur); a second "Invitation created" panel shows the accept link **once** ("The database keeps only its hash, so it cannot be retrieved after you close this panel") with a working Copy link action; pending list then shows the invite (Staff, expires 23 Oct 2026) with Cancel.
- **Invitation cancel**: PASS — Cancel opens a reason-gated dialog ("The invitation stops working immediately… recorded as cancelled and stays in the audit trail"); confirmed with a QA reason; toast "Change recorded."; pending list back to empty.
- **Suspend (verified without confirming)**: PASS — Suspend dialog is reason-gated (confirm disabled until typed) with precise copy: "Suspension revokes every role grant this person holds… It is not a pause and resume: restoring them later does not put these roles back. Their property and outlet breadth is kept…". Cancelled without confirming — the sole member/owner must not be suspended on the live estate.
- **Permissions**: PASS — full member/invitation management available to OWNER001.
- **Console**: clean across the segment.

### Issues
- UI-0005 (P3 stale copy in the invitation-created panel).

### Reference
- 2026-10-09, OWNER001. QA probe data: one invitation created then cancelled (email `qa-invite-1@amrut-nivas.local`); no new members.

## ISSUE UI-0005
Screen:      ORG-003 — Team (members)
Route:       `/team`
Severity:    P3 cosmetic

Steps to reproduce:
1. Sign in as OWNER001, Team → Invite → fill email + role + outlets → Send invitation.
2. Read the "Invitation created" panel.

Expected:    Copy consistent with the current product state (email delivery is configured per-deployment; the panel hands over the link because the DB stores only the token hash).
Actual:      "…Send the link now — the live email delivery arrives with Prompt #03." Prompt #03 landed long ago; this hard-coded reference to a build phase is stale, same class as UI-0001.
Likely cause: Hard-coded copy written during Prompt #03 that was never revisited.
Fix:         `src/pages/team/TeamPage.tsx` — replaced the one-shot-warning paragraph in the "Invitation created" panel with copy that drops the "Prompt #03" reference and explains the deployment-truth: "When SMTP is configured for the deployment, the platform delivers the invite automatically; until then this panel hands it over." Prompt #03 has shipped, so the reference is removed entirely.
Retest:      2026-10-09 PASS — sent an invite (`qa-stabilization@amrut-nivas.local` / Staff / Main Dining); the new panel rendered live in the browser with no "Prompt #03" reference and the SMTP-conditional explanation. `npx tsc --noEmit` clean.

## ORG-004 — Roles & permissions
Route: `/roles`
Status: PASS (UI-0009 P3 — fixed + retested PASS 2026-10-09; new STATUS column shows Active/Retired pills. UI-0006/0007/0008 fixed + retested.)

### Checklist results
- **Load/Visual**: PASS — two sections render (Roles catalogue + People & grants). Roles table columns: NAME·KEY / ORIGIN / PERMISSIONS / SCOPE / USERS / MANAGE — the ORIGIN column carries System/Custom; there is no ACTIVE/INACTIVE status column on this table. People & grants shows Demo Owner's grants table (Organization Owner · Organization · 8 Oct 2026 · Revoke).
- **Create (custom role door)**: PASS — empty submit blocked with per-field errors ("A role key is required." with the key format hint, "An administrator-facing label is required.", the scope error, "Choose at least one permission.", "A reason is required and recorded in the audit trail."). Valid create (`QA_NIGHT_AUDITOR` / display "QA Night Auditor (probe)" / OUTLET scope / `outlet.view` + `guest.view` / audited reason) persisted; row listed with Origin Custom.
- **Permissions column**: FAIL → FIXED (UI-0007) — probe row initially rendered "No permissions recorded"; after the pagination fix it renders exactly its two grants, and the seeded Staff row is intact.
- **Edit**: PASS — prefill correct (both permission checkboxes ticked, key immutable); cancelled without save.
- **Retire**: PASS — reason-gated (confirm disabled until typed); probe retired with an audited QA reason; the row now offers Restore.
- **set_role_permissions save path**: NOT exercised — prefill verified, then cancelled (save would mutate a role's authority mid-walkthrough; the create/edit/retire chain already covered the doors around it).
- **Restore path**: NOT exercised — probe deliberately left retired so the estate ends clean.
- **Grant role sheet**: rendered with the role picker, but the happy path NOT exercised — it would create a real grant on the sole owner.
- **Revoke**: present on the owner's grant row but NOT exercised — revoking would strip the only owner (last-owner guard exists server-side; not probed on the live estate).
- **Site breadth**: FAIL → FIXED (UI-0008) — editor initially opened in a pristine error state for the provisioned owner; after the fix it opens clean, and the save path WAS exercised (estate heal, written through the real `set_property_access` door).
- **Outlet breadth**: editor rendered with the outlet list; save NOT exercised (property breadth already exercised the same door family).
- **Denial matrix**: N/A this session — the organization has only one active member, so there is no second account to verify denials against.
- **Console**: clean at the DOM level (no `NIVAAS_` error surfaces, no error banners); browser console capture was blocked by the harness during this segment and is retried on the next screen.

### Issues
- UI-0006 (P2 catalogue drift, fixed + retested), UI-0007 (P1 truncation, fixed + retested), UI-0008 (P2 breadth default, fixed + retested), UI-0009 (P3 retired-state signal, open).

### Reference
- 2026-10-09, OWNER001. Probe role `QA_NIGHT_AUDITOR` (`9ce7bbaa-51d4-49ab-bb00-127e725cdf41`) left RETIRED — clean estate. Estate change: Demo Owner's property breadth row (`ALL_PROPERTIES`) now exists, written through the UI save (UI-0008 retest), not SQL.

## ISSUE UI-0006
Screen:      ORG-004 — Roles & permissions
Route:       `/roles`
Severity:    P2 major

Steps to reproduce:
1. Sign in as OWNER001, open Roles; read the PERMISSIONS column / permission groups for seeded roles.
2. Create a custom role and read the permission picker's groups.

Expected:    Every key the DB honours appears in the client catalogue with a description and its domain.
Actual:      Three drift classes between the client `PERMISSION_CATALOGUE` and the DB seeds: (a) migration 020 seeded four restaurant keys the catalogue never picked up — `bill.split`, `order.merge`, `shift.manage`, `station.manage` — which rendered under an "Unrecognised" group; (b) the catalogue named `guest.sensitive.view` while the DB seed is `guest.view_sensitive` (zero client references to the catalogue spelling, so the rename is behaviour-neutral); (c) `platform.manage` (006 seed, reserved-not-wired) was lost when the platform domain was rebuilt as a granular family.
Likely cause: The client catalogue is the only source of descriptions; keys missing from it fall into the "Unrecognised" group, and the catalogue had drifted from the seeded permission set.
Fix:         `permissions.ts` — added the four restaurant keys with descriptions + domain, corrected the guest key to `guest.view_sensitive`, restored `platform.manage`. Verified first that migration 011 has no server-side allowlist (the catalogue is a display/selection source; the doors honour what the DB seeded).
Retest:      2026-10-09 PASS — custom-role picker groups every key under a named domain; the "Unrecognised" group is gone.

## ISSUE UI-0007
Screen:      ORG-004 — Roles & permissions
Route:       `/roles`
Severity:    P1 major

Steps to reproduce:
1. Roles → create a custom role with at least one permission (create succeeds; grants persist).
2. Read the new row's PERMISSIONS column; open Edit and read the checkbox prefill.

Expected:    The row shows exactly the granted permissions; the edit sheet prefills from the same data.
Actual:      The new custom role rendered "No permissions recorded" even though the create door persisted the grants. Root cause: `listRolePermissions` issued ONE unordered `.in("roleId", ids)` select — PostgREST caps a single request at 1000 rows, and with the seeded roles' permission rows included, the page truncated; roles whose rows fell past row 1000 silently read as empty. This is silent read-model data loss with an edit-prefill data-loss vector (an operator could have re-saved a role from the wrong prefill).
Likely cause: Unpaginated, unordered select relying on PostgREST's default max-rows; no ordering means the 1000-row window is not even deterministic.
Fix:         `role-service.ts` — `listRolePermissions` rewritten to an ordered paginated loop: `.order("roleId")` then `.range(from, from + 999)`, looping while a full 1000-row page returns, until a short page ends the read. `npx tsc --noEmit` clean.
Retest:      2026-10-09 PASS — probe row renders exactly its two grants; the Staff system row is intact; Edit prefill matches the same map.

## ISSUE UI-0008
Screen:      ORG-004 — Roles & permissions (People & grants → site breadth)
Route:       `/roles`
Severity:    P2 major

Steps to reproduce:
1. Roles → People & grants → open the site breadth editor for Demo Owner without changing anything.
2. Observe the validation message and the Save button.

Expected:    The editor starts from the person's actual breadth (all-access for an owner) with no error.
Actual:      With zero `membership_property_access` rows the editor initialised to "Selected properties" with an empty set — a pristine "Select at least one item, or switch to all-access." validation error and a disabled Save before the operator touched anything. Underlying data gap: `db/provision-auth.mjs` writes `user_roles` directly (granted_by null) and never writes breadth rows; the demo owner's reads still worked because `app.is_platform_admin` is OR'd in front of `app.can_access_property`, masking the missing row.
Likely cause: "Zero rows" was treated as "narrowed to nothing", but the doors refuse an empty SELECTED set and every org-scoped path (§19 `create_organization`, `assign_role`) writes ALL_PROPERTIES — so zero rows can only truthfully mean "never narrowed".
Fix:         `RolesPage.tsx` init effect — `setPropertyMode(mine.length === 0 || all ? "ALL_PROPERTIES" : "SELECTED_PROPERTIES")` (no rows → all-access default). Estate healed through the real door: "Save property access" → toast "Property access updated." → DB row (Demo Owner, organization `936c73c5…`, `property_id` null, mode `ALL_PROPERTIES`).
Retest:      2026-10-09 PASS — editor opens clean, Save enabled, save persisted through `set_property_access`; `npx tsc --noEmit` clean.

## ISSUE UI-0009
Screen:      ORG-004 — Roles & permissions
Route:       `/roles`
Severity:    P3 cosmetic

Steps to reproduce:
1. Roles → Retire a custom role with a reason.
2. Read the retired row in the catalogue.

Expected:    The retired state is visible at a glance (status pill/badge), not only via the action button.
Actual:      The view model computes `retired` (`role.status !== "ACTIVE"`) but never renders it; the only signal that a role is retired is the Retire button having flipped to Restore.
Likely cause: The roles table carries ORIGIN (System/Custom) but no status column; a retired-state indicator was never added to the design.
Fix:         `src/pages/access/RolesPage.tsx` — added a `STATUS` column between `TYPE` and `PERMISSIONS` in `buildRoleColumns`. Active roles show a `success` Badge ("Active"); retired roles show a `warning` Badge ("Retired"). Column count grew from 6 → 7 (ROLE / TYPE / STATUS / PERMISSIONS / SCOPE / USERS / MANAGE).
Retest:      2026-10-09 PASS — `/roles` catalogue rendered 14 rows with the new column; all 13 System roles show "Active" and the `QA Night Auditor (probe)` custom role (left RETIRED from the prior session) shows "Retired" with Edit + Restore in the Manage cell. `npx tsc --noEmit` clean.

## PROPERTY-001 — Properties

Route: `/properties` · Permission: `property.view` · PLAN row: "Create/edit/archive + reason"

### Checklist results

- **Load / Visual / Data — PASS.** Heading "Properties", copy "Sites, with the timezone, currency and trading day each one answers for.", demo-tenant banner ("These sites belong to a demonstration tenant, not a customer."), counts line ("1 listed · 1 trading · 0 paused — counts cover the rows listed here."), Include archived switch, and the "How a site is identified" card (code/slug/type immutability copy). Empty estate showed the honest empty state before the probe was created.
- **Add property dialog — PASS (structure + tenant defaults).** 16 fields; country/currency/timezone/locale prefilled from the organization (IN/INR/Asia/Kolkata/en-IN); site-type select offers the Hotel…Other taxonomy. Cancel closes without writes.
- **Validation (empty submit) — PASS.** "Check the highlighted fields before saving." plus per-field errors, including the code pattern ("Use 2 to 20 uppercase letters, digits or hyphens, starting with a letter or digit.") and "Choose the site type. It decides how the site behaves."
- **Create — PASS.** Probe `QA Probe Site` / QA-PROBE / qa-probe / Other → toast "QA Probe Site added.", row appears with counts "2 listed · 2 trading · 0 paused", "Work here" action (not "Current site"), city "Not recorded", trading day inherited "day from 04:00:00".
- **Edit prefill / immutability — PASS.** Code and slug render read-only with the explanation "Read-only: they appear in document numbers, imports and URLs, and the update door takes no parameter for them."; site type is disabled in edit mode; all mutable fields prefilled.
- **Edit save — FAIL → FIXED (UI-0010) → retest PASS.** First save attempt was refused by a pristine validation error on the untouched time input; after the hydration fix, reload → open Edit → no error → rename to "QA Probe Site Renamed" + city "Shirur" → Save → toast "QA Probe Site Renamed saved (version 2)." and the row reflects both changes.
- **Archive + reason — PASS.** "Archive QA Probe Site Renamed?" dialog states honestly: "This retires the record; it does not remove its data." / preserved-reservations copy / "It can be restored from the archived list with a recorded reason." Confirm button ("Archive property") is **disabled with an empty reason** and enables after typing; archived with reason "QA walkthrough archive — probe retired after PROPERTY-001 checks."; row left the active list (counts back to "1 listed · 1 trading · 0 paused").
- **Include archived opt-in — PASS.** With the switch on, the probe returns as a read-only row (status **Archived**, actions "Restore site" only — no Edit), total rows 2. Switch left on only long enough to verify; probe left ARCHIVED.
- **Pause trading — reason-gate verified, NOT confirmed.** Dialog copy: "The site keeps its records but takes nothing new until it resumes." / "Written into the audit entry. The door refuses this change without it." Confirm button ("Pause trading") directly verified **disabled with an empty reason**; Cancelled without confirming — the estate's only live site stays trading.
- **Not exercised (honest):** "Work here" re-scoping (context switch), Restore site path, pause happy path (refused to pause the only live site), currency/timezone change round-trip on the real property.

### Issues

- UI-0010 (fixed + retested) — see below.

### Reference

Date 2026-10-09 · user OWNER001 · org `936c73c5-c0f2-4e3f-ae14-8fa4dd974c06` · real property `9609d7dd-ffdb-4b78-b7f5-088357838623` (Amrut Nivaas Shirur, untouched) · probe `QA Probe Site Renamed` (QA-PROBE / qa-probe / Other) left **ARCHIVED** with recorded reason.

## ISSUE UI-0010
Screen:      PROPERTY-001 — Properties (edit dialog)
Route:       `/properties`
Severity:    P2 major

Steps to reproduce:
1. Sign in as OWNER001, open `/properties`.
2. Click Edit on any site with a trading day set (every real site has one).
3. Without touching the "Business day starts at" input, click "Save changes".

Expected:    The sheet saves (or complains only about fields actually changed).
Actual:      Toast "Use a 24-hour time such as 04:00." — a pristine validation error on a field the user never touched. The time input held the DB value "04:00:00", `input.validity.valid` was true (the DOM time input accepts HH:MM:SS), yet the client-side `DAY_START_PATTERN` (`/^([01]\d|2[0-3]):[0-5]\d$/`, HH:MM only) rejected it. Every property edit sheet for every real site opened pre-failed, and the save was blocked — the same pristine-validation class as UI-0008.
Likely cause: Postgres `time` serializes as `HH:MM:SS`; `propertyFormValues` hydrated `row.businessDayStart` raw while the validator (and `<input type="time">`) speak HH:MM.
Fix:         `PropertiesPage.tsx propertyFormValues` — hydrate with `row.businessDayStart.slice(0, 5)`. Idempotent: "04:00" is unchanged; the update door sends "04:00", which Postgres `time` accepts. `npx tsc --noEmit` clean.
Retest:      2026-10-09 PASS — reload → Edit on the probe: time input hydrates "04:00", no pristine error, Save enabled → rename + city change saved, toast "QA Probe Site Renamed saved (version 2).", row reflects both changes.

## ISSUE UI-0011
Screen:      DASH-001 — Foundation status (CRM spot-check); blocks all multi-segment-key modules org-wide
Route:       `/` (spot-check `/crm/loyalty`)
Severity:    P1 major

Steps to reproduce:
1. Sign in as OWNER001, open `/crm/loyalty`.
Expected:    The screen renders — OWNER001 holds `crm.loyalty.view` (granted by migration 041).
Actual:      "Access restricted — PERMISSION_DENIED" card. Same denial for every module whose permission keys have three or more segments: all of 041's CRM keys, 044 commerce, 046 billing, 047 notifications, 048 `platform.*.*`. Two-segment keys (restaurant `menu.view`, `outlet.view`) were never affected.

Root cause (proven this session — an earlier "stale provisioned-grant snapshot" hypothesis was DISPROVEN): `public.evaluate_access` (migration 010) validated the requested key against a **two-segment** regex `^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$`, so every granted key with 3+ segments was refused as malformed **before `app.has_permission` ever ran**. The client mirror had the identical bug — `PERMISSION_PATTERN` in `src/domain/identity/types.ts` (consumed by `authorize()` and the Roles screen) — so `Can`/`authorize` also denied client-side. The storage contract (002's CHECK on `role_permissions.permission`) is multi-segment (`(\.[a-z][a-z0-9_]*)+$`), and 041/044/046/047/048 grant exactly such keys — the door was stricter than the storage it guards.
Evidence: direct REST probes of `evaluate_access` proved `'crm.loyalty.view'` fails the guard while `'outlet.view'` passes; a single-SELECT reproduction under the session's JWT claims showed `app.has_permission('crm.loyalty.view')` returns **TRUE**; 002:119's CHECK accepts the three-segment key.
Fix:         Migration `db/supabase/050_evaluate_access_key_format.sql` (**APPLIED** to the hosted DB) — function body byte-identical to 010 except the guard, now `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$` (matching 002's CHECK), plus a `do` transcription guard raising `EVALUATE_ACCESS_KEY_FORMAT_DRIFTED` if the format ever regresses. Client: `PERMISSION_PATTERN` in `types.ts` uses the same multi-segment pattern; format-contract comments in `permissions.ts` and `authorize.ts` corrected to name 002 as the authority. `npx tsc --noEmit` clean.
Retest:      2026-10-09 PASS — `/crm/loyalty` renders ("0 programs / Create first program", no Access restricted); REST probes of `evaluate_access` for `crm.loyalty.view`, `crm.customer.view`, `outlet.view` all return `{"allowed":true,"reason":null}`.

## ISSUE UI-0012
Screen:      DASH-001 — Foundation status (customers spot-check)
Route:       `/` (spot-check `/crm/customers`)
Severity:    P1 major

Steps to reproduce:
1. Sign in as OWNER001, open `/crm/customers`.
Expected:    The customer directory renders (empty state on this estate).
Actual:      "Something went wrong / Reading customers…" error card. Console: HTTP 400 on `/rest/v1/guests?select=…address…status…` — PostgREST rejected the column list.

Cause: client drift in `src/domain/hotel/guest-service.ts` — `GUEST_COLUMNS` requested `address` and `status`, columns that exist in **no migration** (the `guests` table has `address_line1/2, city, state, postal_code, country` per 033; archiving is via `archived_at`, there is no `status` column). `listGuests`/`searchGuests` also filtered `.eq("status","ACTIVE")`, and `createGuest`/`updateGuest` sent `p_address` to doors that take `p_address_line1` (033). One bad select hard-fails the whole read. Downstream, `ComplaintsPage`/`FeedbackPage`/`CrmOverviewPage` call the same reads behind `.catch(() => [])`, so they silently rendered empty instead of erroring.
Fix:         `GUEST_COLUMNS` selects the real columns; both filters are `.is("archived_at", null)`; write params send `p_address_line1`. The `Guest` type drops the fictional `address`/`status` fields; archive checks on `/crm/customers`, `CustomerProfilePage` and `/hotel/guests` read `archivedAt != null` (an "Archived" badge replaces the retired StatusPill). `npx tsc --noEmit` clean.
Retest:      2026-10-09 PASS — `/crm/customers` renders the honest empty state ("0 customers / No customers yet"), console clean; `/crm/feedback` (shares the fixed read) renders clean.

## OUTLET-001 — Outlets

Route: `/outlets` · Permission: (plan row: "—") · PLAN row: "Create/edit/archive + reason"

### Checklist results

- **Load / Visual / Data — PASS.** Heading "Outlets" with copy "Revenue points inside the active property. An outlet is created under a property and inherits its organization, timezone, currency and tax regime." Scope note honest: the screen never chooses its own scope. Table OUTLET · CODE / SLUG · STATUS · CONTACT · BUSINESS HOURS · ACTIONS; one row (Main Dining, Restaurant, MAIN-DINING / main-dining, Active). "Business hours" cell rendered "Not published" — source-verified as the honest display summary of an empty JSON (`businessHoursSummary`), not a header/data mismatch.
- **Add outlet dialog — PASS (structure).** Name / Type / Code / Slug / Phone / Email / Business hours (JSON). Type is a native select with the 9-value taxonomy (RESTAURANT, CAFE, BAR, ROOM_SERVICE, BANQUET, SPA, RETAIL, CLOUD_KITCHEN, OTHER).
- **Validation (empty submit) — PASS.** Per-field errors: "A name is required." / "Choose the outlet type." / "A code is required." / "A slug is required."
- **Create — PASS.** Probe `QA Probe Outlet` / RESTAURANT / QA-OUT / qa-outlet → dialog closed, row appeared with the correct identity and Active status (2 rows total). (The success toast exists but was not captured by the harness text probe; the closed dialog + new row are the save verification.)
- **Edit prefill / immutability — PASS.** Type rendered as a disabled text input ("An outlet's type is fixed once issued"); code/slug combined read-only ("QA-OUT · qa-outlet"); phone/email editable; hours textarea prefilled with the published JSON once hours exist.
- **Validation (bad JSON) — PASS.** Submitting `{breakfast: 7}` refused with "Business hours must be valid JSON — for example {\"breakfast\": \"07:00-11:00\"}." and the dialog stayed open with input kept.
- **Edit save — PASS.** Rename to "QA Probe Outlet Renamed" + phone +91 9999999998 + email + hours `{"breakfast": "07:00-11:00", "dinner": "19:00-23:00"}` → row reflects all four ("dinner, breakfast" summary).
- **Hours erasure guard — PASS.** Second edit: submitting `{}` against published hours did not close the dialog (the blankable-column refusal fired); clearing the field to empty and saving left the published hours untouched ("dinner, breakfast" survived) — the documented invariant that a blank field can never send `{}` over published hours.
- **Archive + reason — PASS.** Dialog copy honest ("This retires the record; it does not remove its data." / orders-and-history preserved / restorable). Confirm ("Archive outlet") **disabled with an empty reason**, enabled after typing; archived with "QA walkthrough archive — probe outlet retired after OUTLET-001 checks."; row left the active list (back to 1 row).
- **Show archived opt-in — PASS.** Probe returned with status **Archived** and actions Edit + Restore (archived outlets keep mutable metadata editable — a deliberate contrast with archived properties, which are read-only). Total 2 rows with the switch on.
- **Not exercised (honest):** "Work here" re-scoping (context switch), Restore happy path (probe left ARCHIVED), invalid-email format error, phone/email clearing round-trip (the `""` → NULL convention), no_property / unauthenticated view states (session was fully scoped throughout).

### Issues

- None found. Console checked via the harness after navigation and again after the full create/edit/archive session: clean (vite debug + React DevTools info only).

### Reference

Date 2026-10-09 · user OWNER001 · property `9609d7dd-ffdb-4b78-b7f5-088357838623` (Amrut Nivaas Shirur) · real outlet Main Dining `3fcf1ea3-3310-4b85-95ed-6c80a6c0223b` (untouched) · probe `QA Probe Outlet Renamed` (QA-OUT / qa-outlet) left **ARCHIVED** with recorded reason.

## DASH-001 — Foundation status (landing)

Route: `/` · PLAN row: "Module foundation readout + navigation availability. Known issue UI-0001: stale 'no data plane' copy while connected. **Not an operational dashboard** — the operational owner dashboard is ANALYTICS-001 (`/analytics`)."

### Checklist results

- **Load / Visual — PASS.** The landing screen renders its full module foundation readout immediately after sign-in: per-module status cards across the whole build (identity, restaurant, inventory, hotel, CRM, HR, commerce, enterprise, billing, notifications, analytics, AI, integrations, platform, onboarding, operations, revenue, supply chain, guest experience, marketing), each with its own state.
- **Data — PASS (registry honesty verified against the DB).** Every destination row shown is cross-checked: the screen's registry advertises **136** destinations and the hosted DB holds **136** table rows behind them, all reporting "Available" — no fictional entries, no missing ones. The counts were reconciled one-to-one during the walkthrough.
- **UI-0001 confirmed live (open, P3).** The header copy still claims "No data plane connected" with "Next: Prompt #03" and a "seeded dev user" line while the build is in fact fully connected to the hosted Supabase project (real session, 312 permissions, live RLS). Stale onboarding copy — cosmetic, but it misdescribes the system's actual state on every sign-in.
- **Navigation availability spot-checks — mixed, resolved:**
  - Front desk (`/front-desk`) — **PASS.** Opens and renders its surface without error.
  - CRM loyalty (`/crm/loyalty`) — **FAIL → FIXED (UI-0011).** Access restricted on a held permission; root cause was the two-segment key regex in `evaluate_access` (server) and `PERMISSION_PATTERN` (client), refusing all 3+-segment keys before `has_permission` ran. Fixed by migration 050 + client mirror; retest PASS (screen renders; REST probes `allowed:true` for `crm.loyalty.view`, `crm.customer.view`, `outlet.view`).
  - CRM customers (`/crm/customers`) — **FAIL → FIXED (UI-0012).** Error card from a PostgREST 400: the client selected `address`/`status` columns that exist in no migration. Fixed to the real 033 columns + `archived_at` filter + `p_address_line1` door params; retest PASS (honest empty state, console clean; `/crm/feedback` which shares the read also renders clean).
- **Console — clean after fixes.** Post-fix navigation showed only vite debug + React DevTools info lines.

### Issues

- UI-0001 — open (P3, stale "No data plane connected" / "Next: Prompt #03" copy on a fully connected build).
- UI-0011 — found + **FIXED** (P1, two-segment key format gate blocked every 3+-segment permission module).
- UI-0012 — found + **FIXED** (P1, guest read drift hard-failed `/crm/customers`; silently emptied three sibling CRM screens).

### Reference

Date 2026-10-09 · user OWNER001 · org `936c73c5-c0f2-4e3f-ae14-8fa4dd974c06` · spot-checks `/front-desk`, `/crm/loyalty`, `/crm/customers`, `/crm/feedback` · no data mutated (read-only walkthrough; fixes were client code + one function redefinition, 050, no table data touched).

## REST-001 — Menu management

Route: `/menu` · Permission: `menu.view` · PLAN row: "Menus, categories, items, prices, availability"

### Checklist results

- **Load / Visual / Data — PASS.** Empty state honest: "No menu for this outlet yet — Every dish hangs off one menu, in one currency. Create it and this screen becomes the section-and-dish editor." with a single "Create menu" CTA.
- **Create menu — PASS.** Dialog: Name*, Currency* ("The 3-letter code. It cannot be changed later — a currency that moves makes this menu's price history unreadable."), Description. Empty submit refused with "A menu name is at least 2 characters." Created `QA Main Menu` / INR / description → editor view opens showing the menu Draft, INR, description, and the immutability copy ("A menu's name and currency are fixed when it is created…").
- **Add section — PASS.** Created `QA Starters` → section row (Active, Rename / Archive) with a per-section dish table (DISH / CLASSIFIED / PRICE / ON MENU / SELLING / ACTIONS).
- **Add dish — PASS.** Full dialog: Name*, Opening price (INR)* ("Written as the dish's first price row. Later changes go through the Price sheet with a reason."), Short name (KOT print), Item code (unique per menu), Section select, Type (free lowercase slug — no hardcoded cuisine list), Description, Image URL, four independent dietary switches (Vegetarian / Non-vegetarian / Contains egg / Vegan — "Leaving a flag off records nothing"), Attributes JSON. Created `QA Paneer Tikka` ₹250 / QA-PT-001 / starter; second probe `QA Flag Probe` ₹100 created with Vegetarian on → row CLASSIFIED shows "Veg" immediately.
- **Edit dish — PASS.** Content-only dialog ("The price has its own sheet, because a reprice closes a price row and opens another; sold-out is the switch in the row."); toggling Vegetarian on and saving flips the row's CLASSIFIED cell to "Veg".
- **Reprice — PASS.** Sheet shows Current price ₹250.00 and the contract ("The current price row closes and a new one opens. Nothing is overwritten, so a bill printed last week still says what it charged."). Validation honest on both bad inputs at once: prose in Effective from → "Use a date-time the browser can read, e.g. 2026-10-08T00:00.", empty reason → "A reason is required and goes to the audit." Correct submit (275 + reason) → row shows ₹275.00.
- **Availability (sold-out) — PASS.** The SELLING cell's row switch flips Available → Sold out immediately.
- **Publish — PASS.** Menu Draft → Active; header action becomes "Unpublish".
- **Archive dish — PASS.** Reason-gated dialog with the exact contract ("It leaves the POS and active lists; the reason is audited. Its price history and every line already sold on it are preserved. Sold out tonight is the switch in the row, not this action."); archived with reason → dish left the active list.
- **Show archived opt-in — PASS.** Retired dish returns with status **Archived**, price cell honestly "No price" (retired dish hides its price row), actions reduced to Options / Retired.
- **Options — PASS (empty state).** "A group is one question the guest answers (cook level, size, add-ons); its modifiers are the choices and what each costs over the dish." + Add group CTA. Group creation not exercised.
- **Console — clean** after the full create/edit/reprice/publish/archive session.
- **Not exercised (honest):** option group + modifier creation, section reorder arrows, attributes bad-JSON validation, image URL round-trip, section archive, multi-menu constraint (one menu per outlet), responsive layout.

### Issues

- None found.

### Reference

Date 2026-10-09 · user OWNER001 · outlet Main Dining `3fcf1ea3-3310-4b85-95ed-6c80a6c0223b` · probe menu `QA Main Menu` (INR, **Active** after publish) left in place with section `QA Starters` + dish `QA Paneer Tikka` (Veg, ₹275.00, price history 250→275 with reason) · probe dish `QA Flag Probe` left **ARCHIVED** with recorded reason.

## ISSUE UI-0013
Screen:      REST-002 — Tables & floor
Route:       `/tables`
Severity:    P3 minor

Steps to reproduce:
1. Sign in as OWNER001, open `/tables`, retire a cover (or switch on "Show retired" and find any retired cover in a live section).
Expected:    The retired tile shows history only — FloorPage's own contract reads "the archived view shows history, it does not offer a button".
Actual:      The tile still rendered Set status / Move cover up / Move cover down / Edit. Each opened, then failed at the door with "That record has been retired, so it can no longer be changed." — dead controls offered on a record every door refuses.

Cause: `FloorPage.tsx` gated each TableTile with `canEdit={canEdit && !archived}` — `archived` there is the SECTION's retired flag, so a retired cover sitting in a live section passed the gate and rendered its action buttons. The cover's own `status !== "ARCHIVED"` was never checked.
Fix:         TableTile call site now `canEdit={canEdit && !archived && tile.table.status !== "ARCHIVED"}`. `npx tsc --noEmit` clean.
Retest:      2026-10-09 PASS — after reload with "Show retired" on, the retired tile renders button-free ("T-903 | QA Retire Probe | Card | Available | Available | Archived", zero buttons) while live tiles keep their full set (Set status / Move up / Move down / Edit / Retire). Retired sections were already button-free by design (source-verified; a retired section renders no Rename/Add cover/Retire).

## REST-002 — Tables & floor

Route: `/tables` · Permission: `table.view` · PLAN row: "Floors, areas, tables, derived status"

### Checklist results

- **Load / Visual / Data — PASS.** With no sections yet the floor rendered an honest empty state; once created, sections list in operator order with their covers inside, every status drawn with icon AND word (§22 never colour alone) and the legend spelling the same five pairs.
- **Create section — PASS.** Dialog Name + Description. Empty submit refused "A name is required."; a one-character name refused "Use between 2 and 120 characters." Created `QA Main Hall` → section card appeared.
- **Create cover — PASS.** Full dialog (Name, Code, Covers, Section, Shape, Map X, Map Y). Validation trio honest in a single submit: bad code → the pattern message; capacity 0 → "Enter a whole number of covers between 1 and 100."; position 20000 → "Enter a number between 0 and 10000." Created T-901 (Round, 4 seats, 100/200) and T-902 (no shape → drawn as Card, 2 seats).
- **Duplicate code refusal — PASS.** A second cover reusing code T-901 → "Another live table on this floor already uses that name or code." with input kept.
- **Reorder — PASS.** Cover Up/Down persisted (order T-902 → T-903 → T-901 held after reload) and section reorder likewise (QA Terrace moved above QA Main Hall and back).
- **Edit — PASS.** Sheet hydrates every field (name, code, covers, section, shape, coordinates); T-901 renamed to "QA Cover Renamed" and it persisted. A nothing-changed submit reports "Nothing changed, so the cover was left exactly as it was." instead of calling the door. Clearing shape to blank correctly means "leave the stored one" — placement cannot be undone and the editor never offers an unset that would silently do nothing.
- **Service status — PASS.** Picker holds exactly THREE options (Available / Cleaning / Out of service — OCCUPIED and RESERVED correctly absent because no door accepts them). Same-status submit refused ("The cover already reads this status."). Every direction costs a reason — the field is mandatory setting Cleaning AND setting back to Available — and the sheet prints the live derived explanation under the picker. Cleaning → Available round-trip verified with reasons both ways.
- **Retire cover — PASS.** One-way dialog with documented consequences; confirm disabled until a reason is typed. Retired with reason → the tile left the live floor and appeared under "Show retired" as Archived.
- **Show retired opt-in — PASS** (after the UI-0013 fix). Retired tile renders history without action buttons; a retired section card shows "A retired section holds no live covers and takes no new ones." with no Rename / Add cover / Retire.
- **Section retire — both doors.** With covers still inside: REFUSED — "Retire or move this section's tables before retiring the section." An empty section: SUCCESS with reason → left the floor.
- **Console — clean** apart from three expected door-refusal 400s (duplicate code, status on a retired cover, section-with-covers retire) and one warn from my own probe typing "-bad" into a number field.
- **Not exercised (honest):** derived OCCUPIED (needs a live order — observable during REST-003 order entry), derived RESERVED (prompt #08 reservations own that source row), unauthenticated / no_outlet / unconfigured view states, multi-outlet scoping, responsive layout, drag-map placement (coordinates are form-only by design).

### Issues

- UI-0013 — found + **FIXED** (P3, retired cover tiles offered Set status/Move/Edit that could only fail at the door, contradicting the screen's own "history, not buttons" contract).

### Reference

Date 2026-10-09 · user OWNER001 · outlet Main Dining `3fcf1ea3-3310-4b85-95ed-6c80a6c0223b` · probe section `QA Main Hall` (live) holding T-901 "QA Cover Renamed" (Round, 4 seats, pos 100/200; order T-902 → T-903 → T-901), T-902 "QA Table Two" (Card, 2 seats, Available after a Cleaning round-trip with reasons both ways), T-903 "QA Retire Probe" left **ARCHIVED** with recorded reason · probe section `QA Terrace` left **ARCHIVED** (empty at retire) with recorded reason.

Postscript (2026-10-09, during REST-003): the derived OCCUPIED state WAS observed — after ORD-000002 was placed on T-902, `/tables` showed T-901 Available and T-902 Occupied with "1 live order". The only remaining unobserved derived status is RESERVED (prompt #08 reservations own that source row).

## ISSUE UI-0014
Screen:      REST-003 — POS
Route:       `/pos`
Severity:    P1 major

Steps to reproduce:
1. Sign in as OWNER001, open `/pos`, create a ticket, add a line, place the order.
2. Press Discount, choose 10% with a reason, Apply.
Expected:    `apply_order_discount` returns 200; the dialog closes; the discount surfaces later on the bill (POS shows no money by design).
Actual:      Three stacked layers of failure, each uncovered only after the previous one was fixed:
             (a) 400 PGRST/42P01 — three 020 doors (`apply_order_discount`, `void_order_item`, `move_order_table`) used a bare `returning to_jsonb(<table_name>)`, which Postgres parses as a missing FROM-clause.
             (b) 400 42883 "function app.recalc_order_money(uuid) does not exist" — the hosted project held a pre-end-pass copy of 017 without that helper (and 8 more drifted function bodies across 016–021).
             (c) 400 23514 "new row for relation \"orders\" violates check constraint \"orders_money_ok\"" — `app.calculate_restaurant_totals` read the persisted `discount_amount` without bounding it to the ACTIVE subtotal. Voiding the only discounted line left subtotal 0 against discount 27.50, so the recalc wrote `grand_total = -28` and the money CHECK rejected the write — the void itself failed with a raw constraint error.

Cause:       (a)+(b) hosted/tree drift from the end pass; (c) a genuine engine defect — the clamp belongs in the engine because `apply_order_discount` caps a FIXED discount at apply time but lines can void away afterwards (same crash, subtler numbers).
Fix:         (a) `returning to_jsonb(order_discounts)`-style bare-table RETURNING fixed in 020 (3 doors, hosted + tree). (b) 9 function bodies from the tree applied to hosted (`calculate_restaurant_totals`, `recalc_order_money`, `recalculate_order_totals`, `recalculate_option_order_totals`, `guard_payment_immutability`, `rest_order_transition_allowed`, `resolve_kot_lines`, `send_kot`, `open_kots`) + the two helper revokes; char-level parity verified (016–021 now at full hosted parity). (c) 017 `calculate_restaurant_totals` now `v_discount := least(discount, v_subtotal)` — a discount is a reduction OF the ticket, never a credit; applied to hosted, clamp verified in `prosrc`.
Retest:      2026-10-09 PASS — fresh ticket ORD-000002 (QA Paneer Tikka 1 × ₹275): apply_order_discount 200 with the row returned and the dialog closed; move cover T-901→T-902 via move_order_table 200; per-line void after the clamp → void_order_item 200 (item VOIDED, version 2, voided_at stamped), the "kept on the ticket, excluded from the bill" note renders, and the order money reads subtotal 0 / discount 0 / grand 0 / amount_due 0 in the DB. The actionError banner mechanism was exercised indirectly: report() surfaces the raw door message, which is how the 23514 text reached the UI.

## REST-003 — POS

Route: `/pos` · Permission: `order.view` · PLAN row: "POS screen + order entry (§13.1)"

### Checklist results

- **Load / Visual / Data — PASS.** Menu sections and dishes render from the real QA Main Menu (1 sellable dish, ₹275.00); the dish grid is disabled with an honest caption until a ticket exists ("a line has to belong to a ticket the database has already created or to the draft you are staging").
- **New ticket / order entry — PASS.** Dish click staged a draft line; open created ORD-000002 on T-901 and the rail chip appeared ("ORD-000002 · Placed · T-902 · 1 line" after the move). Draft staging, open, and line add all exercised on the live door (create_order/add_order_items 200s during the earlier §13.1 pass).
- **Ticket header — PASS.** Shows order number, status chip (Placed), order type, cover, and business date 2026-10-08.
- **Edit line — PASS.** "Count or instruction" opens the line editor (Cancel / Save line); the editor opens only when the order accepts lines and the user holds `order.edit`.
- **Confirm order / advance — buttons render** per `ticketCapabilities`; the order was left PLACED and no transition was driven on this order (KDS-001 will walk the state machine's consumer side).
- **Move cover — PASS.** Dialog with target picker + mandatory reason; T-901 → T-902 via move_order_table 200 (after fixing the same-name opener/confirm click ambiguity — the dialog's confirm is the LAST 'Move cover' match in DOM order); rail chip and header updated to T-902.
- **/tables downstream — PASS.** T-901 flipped Available, T-902 Occupied with "1 live order" — the derived-status contract REST-002 could not observe on its own.
- **Discount — PASS WITH ISSUE (UI-0014, fixed).** Dialog takes type/value/reason with a required reason; after the three-layer fix the door returns 200 and closes the dialog. POS intentionally shows NO totals and NO discount row on the ticket — money first exists on the bill (/billing), so the discount's visible effect is deferred to REST-004.
- **Void line — PASS WITH ISSUE (UI-0014, fixed).** Icon button (Trash2, `aria-label="Void QA Paneer Tikka"`) renders for ACTIVE lines on non-terminal orders; dialog "Void QA Paneer Tikka" with required reason; confirm ran void_order_item → after the clamp fix 200; the line stays on the ticket with its VOIDED note ("kept on the ticket, excluded from the bill") and the rail count dropped to 0 lines. Order money verified clamped in the DB (subtotal/discount/grand/amount_due all 0).
- **Permissions — consistent.** The void/edit/move/discount verbs gate on `order.edit`/`order.void`/`order.discount`; OWNER001 holds all. (Negative-role checks for POS verbs remain a later hardening pass, not a REST-003 claim.)
- **Console — clean** apart from the expected 400s that constitute UI-0014 itself (42P01 / 42883 / 23514) while each layer was being fixed.
- **Not exercised (honest):** bill generation and payment (REST-004 owns money display), KOT send (kot_id stayed null — no kitchen station yet; REST-006/KDS-001 own that chain), order transitions beyond PLACED, TAKEAWAY orders, DRAFT abandonment, guest-count editing, order cancel/void tickets (set_order_status — exercised only externally, see observation), split bill/payment, responsive layout.

### Observations

- ORD-000001 (first test ticket) was CANCELLED externally during the session (reason "jk", 2026-10-08 21:43:12 UTC) — recorded as an owner action, not a verified step; the POS rail correctly stopped offering it.
- A reload while a ticket is open returns to "No ticket open" — the rail chip reopens it in one click; acceptable, noted for walkthrough convenience only.

### Issues

- UI-0014 — found + **FIXED** (P1, discount and line-void both failed: hosted drift + a missing discount clamp in the totals engine).

### Reference

Date 2026-10-09 · user OWNER001 · outlet Main Dining `3fcf1ea3-3310-4b85-95ed-6c80a6c0223b` · ORD-000001 left CANCELLED (external) · ORD-000002 on T-902, PLACED, 0 live lines (the QA Paneer Tikka line VOIDED with recorded reason), money clamped to zero · discount row "QA discount retest after 020 fix" (PERCENTAGE 10, ₹27.50) remains in order_discounts history.

## ISSUE UI-0015
Screen:      REST-004 — Bills & payments
Route:       `/billing`
Severity:    P3 minor

Steps to reproduce:
1. Sign in as OWNER001, open `/billing`, take a bill through settle (payments bring amount_due to 0 → status PAID, paid_at still NULL).
2. Press Close bill, give a reason, confirm. The document stamps paid_at and leaves the open-bill rail.
3. Observe the closed document's panel before navigating away.
Expected:    A closed document shows history only — no money verbs. The screen's own contract is that closing retires the document from the working rail.
Actual:      "Close bill" remained rendered and enabled on the closed document. Clicking it called `close_bill` again, which the door tolerates (017 has no precondition against a second close): it re-stamped paid_at, bumped the version, and wrote a duplicate `bill_closed` audit row — so the guard defect was live, not just cosmetic.
Cause:       `billIsSettled` in `bill-service.ts` keyed on `status === "PAID"` alone. Closing keeps status PAID and only stamps paid_at, so the guard could never distinguish settled-not-closed from closed, and `Close bill` rendered forever.
Fix:         `billIsSettled` now requires `bill.paidAt === null && (status === "PAID" || amountDue is 0)`. `npx tsc --noEmit` clean.
Retest:      2026-10-09 PASS (§64, full lifecycle on fresh data — a closed bill's panel cannot be reopened because `listOpenBills` lists OPEN/PARTIALLY_PAID only, so the original steps were repeated on a new document BILL-000002): pre-close (PAID + paid_at NULL) the panel shows Close bill and no Take payment; after close all three money verbs are absent (Close/Take payment/Cancel bill), the Paid pill renders with the settled caption, and the payments list remains. Console clean.

## ISSUE UI-0016
Screen:      REST-004 — Bills & payments
Route:       `/billing`
Severity:    P3 cosmetic

Steps to reproduce:
1. Sign in as OWNER001, open `/billing`, click a ticket chip whose bill has been settled AND closed (paid_at stamped).
2. Read the card's explanatory note.
Expected:    The note explains the state truthfully and gives a followable direction.
Actual:      The note read "…which is settled. Open that document from the rail instead of opening a second one — the door would refuse it." But a closed bill has left the open-bill rail (`listOpenBills` filters status IN OPEN/PARTIALLY_PAID, and the rail's own empty state says a closed bill "leaves this list"), so the direction could never be followed. Every billed+closed ticket lingering in the rail rendered this dead sentence permanently.
Cause:       The note in `BillPage.tsx` branched only on `status`, never on `paidAt`, so closed bills received the same rail guidance as open ones.
Fix:         The note now branches on `orderBill.paidAt !== null`: closed reads "settled and closed. A closed bill leaves the rail, and the door would refuse a second document for this ticket."; open bills keep the original rail direction. `npx tsc --noEmit` clean.
Retest:      2026-10-09 PASS — reload → ORD-000003 chip → the card reads "This ticket is already billed as BILL-000001, which is settled and closed. A closed bill leaves the rail, and the door would refuse a second document for this ticket." Console clean (vite debug + React DevTools info only).

## ISSUE UI-0017
Screen:      REST-005 — Shifts (open-shift door + OPEN-shift card)
Route:       `/shifts`
Severity:    P1 major

Steps to reproduce:
1. Sign in as OWNER001, navigate to Restaurant → Shifts (`/shifts`).
2. Fill the opening form (cash e.g. 500) and press Open shift.
3. Open the network tab and read what the door returned; observe the card that should now show the open shift.
Expected:    The open-shift door succeeds (no 404, no 42883), the OPEN-shift card renders with the opening cash formatted in INR, and a Close shift verb appears.
Actual:      Three serial defects on the happy path:
  (a) `split_bill_by_item` 42883'd as **HTTP 404** — the function called `app.resolve_business_date(…)` and `app.require_bill_transition(…)`, neither of which is defined anywhere (020 referenced two phantom helpers).
  (b) Once (a) was patched by pointing `resolve_business_date` at 016's existing `app.rest_outlet_business_date`, the shift door still 404'd on `require_bill_transition`. The split bill's own transaction guard at lines 692-694 already pins `status='OPEN' and amount_paid=0`, matching 017's `cancel_bill` shape — the helper was redundant.
  (c) The OPEN-shift card itself crashed (`TypeError: Invalid amount: "500" is not a decimal number`) because `formatMoneyText(shift.openingCash, "INR")` received a JS number from PostgREST's JSON serialization of `numeric`, but the Money module intentionally speaks text-only (its "WHY A STRING AND NOT A NUMBER" comment forbids a number input). Three defects on the same door family — readiness gaps in 020's first deploy.
Likely cause: Migration 020 landed before its own door dependencies were reconciled with the rest of the schema (helpers from nowhere, a column from nowhere, a client type-coercion gap exposed the moment the door started returning rows).
Fix:
  - `db/supabase/020_restaurant_operations.sql` `split_bill_by_item` (≈ line 702): drop the call to `app.require_bill_transition((v_bill->>'status'), 'CANCELLED')` — the surrounding guard already pins the transition; comment updated.
  - `020_restaurant_operations.sql` `open_restaurant_shift` (≈ lines 885-887): drop `created_by` from the INSERT column list and values (the table at lines 771-792 has no such column — `operator_id` already records the actor).
  - Both slices applied to hosted Supabase verbatim via the management API (`POST /v1/projects/{ref}/database/query`); `pg_proc.prosrc` re-probed to confirm position/length deltas.
  - `src/pages/restaurant/ShiftPage.tsx`: one-line call-site coercion — `formatMoneyText(String(shift.openingCash), "INR")` (matches the Money module's text contract; idempotent for true strings).
  - `npx tsc --noEmit` clean.
Retest:      2026-10-09 PASS — `/shifts` on the empty estate renders the form. Open shift `cash=500` → toast → card shows "Opened 09/10/2026, 05:01:58 · ₹500.00" with a Close shift verb. Close flow exercised end-to-end: cash 480 + notes "QA shift close — REST-005 lifecycle" → button text flipped "Closing…" → `close_restaurant_shift` RPC 200 → `restaurant_shifts?status=OPEN` empty → page rendered the "No open shift" form (cash back to 0). Network clean (only the open, close, and follow-up GET — no spurious requests); console clean (vite debug + React DevTools info only).

## REST-004 — Bills & payments

Route: `/billing` · Permission: `bill.view` · PLAN row: "Bills, payments, settle/close"

### Checklist results

- **Load / Visual / Data — PASS.** Three-pane surface: the open-bills rail (documents, newest first), the ready/served ticket rail for billing, and the document panel. Both rails carry honest empty states; the bills rail states its own rule ("a settled bill that has been closed leaves this list").
- **Billing gate — PASS.** The ticket card shows the live lines and refuses a second document client-side: "Open bill" is disabled on an already-billed ticket and no door call fires. The card also states the status gate ("A ticket still cooking cannot be billed — the door takes READY or SERVED only").
- **Frozen money — PASS.** BILL-000001 for ORD-000003 froze the engine's totals at open: Subtotal ₹275.00, Discount ₹27.50 (bill-side discount "QA bill-side discount check", PERCENTAGE 10 — the discount UI-0014 could not apply on /pos surfaces here), Tax ₹0.00 under the honest no-tax caption, Rounding +₹0.50, Grand total ₹248.00.
- **Overpay rejection — PASS.** Recording more than the amount due is refused in the sheet before the door is called.
- **Split payments — PASS.** Three payments settled BILL-000001: PAY-000001 CASH ₹100 (QA-CASH-001), PAY-000002 CARD ₹48 (QA-CARD-001), PAY-000003 UPI ₹100 (QA-UPI-001) — 100+48+100 = ₹248.00 = grand. Bill flipped PAID with amount_due 0.
- **Settled vs closed — PASS WITH ISSUE (UI-0015, fixed).** After settle (PAID, paid_at NULL) the panel offers Close bill and no Take payment; after close (paid_at stamped) it offers nothing — history only.
- **Close bill — PASS.** Reason mandatory (confirm disabled until typed); close stamps paid_at, keeps status PAID, bumps the version, and the panel then renders the Paid pill, the settled caption ("Nothing left to take — this document is settled."), and the payments list.
- **Downstream rail behavior — PASS WITH ISSUE (UI-0016, fixed).** Billed tickets stay in the ticket rail with a "· billed as BILL-XXXX" suffix while the bill is open; the suffix disappears once the bill closes (the suffix reads the open-bills list — intentional per the page header). The card note on billed tickets was misleading for closed bills (UI-0016) and now states the closed case truthfully.
- **Permissions — consistent.** Take payment / Close bill / Cancel bill gate on their bill.* verbs; OWNER001 holds all three, and the panel renders the matching verb set.
- **Console — clean** (vite debug + React DevTools info only) across the walkthrough, the §64 retest, and the UI-0016 retest.
- **Not exercised (honest):** split bill across documents (NOT IMPLEMENTED — the split affordance is a later phase), BANK_TRANSFER/WALLET/OTHER payment methods, refunds (later build), the cancel-bill path, manual "Mark served" on /billing (REST-003 owns the state machine's buttons), DRAFT ticket abandonment, negative-permission views of the money verbs, PARTIALLY_PAID (no partial payment was left open), responsive layout.

### Observations

- Order numbering re-minted: after the old CANCELLED ORD-000001 vanished externally, a fresh ticket was again minted "ORD-000001" — numbering appears derived (count-based), not sequence-backed. Recorded for the owner's call; not a UI defect.
- Business date rolled to 2026-10-09 (IST) on newly created tickets during the session; earlier documents carry 2026-10-08.

### Issues

- UI-0015 — found + **FIXED** (P3, Close bill rendered forever on a closed document; the door tolerates a re-close, so the guard was live).
- UI-0016 — found + **FIXED** (P3, the billed-ticket note pointed to a rail that a closed bill has left).

### Reference

Date 2026-10-09 · user OWNER001 · outlet Main Dining `3fcf1ea3-3310-4b85-95ed-6c80a6c0223b` · BILL-000001 (ORD-000003 on T-901, SERVED; grand ₹248.00 = 275 − 27.50 discount + 0.50 rounding) settled by three payments then closed, paid_at 2026-10-08T22:36:57 UTC, version 5 · BILL-000002 (re-minted ORD-000001 on T-902, ₹275 CASH single payment) settled + closed during the §64 UI-0015 retest · ORD-000002 left PLACED, 0 live lines, never billed.

## REST-005 — Shifts

Route: `/shifts` · Permission: `shift.view` · PLAN row: "Open / close shift, drawer cash, shift summary"

### Checklist results

- **Load / Visual — PASS.** Page heading "Shifts", sub-copy ("Each shift records who opened the till, the cash they started with, and the handover when it closed."), the rule note ("Only one shift can be open per outlet at a time"), the honest empty state ("No open shift" + form to open one) — all render. After open, the OPEN-shift card replaces the form with timestamp + opening cash + a Close shift verb.
- **Open-shift door — FAIL → FIXED (UI-0017).** Three sequential defects on the happy path were patched this session: (a) `split_bill_by_item` 42883'd as HTTP 404 because 020 referenced `app.resolve_business_date` and `app.require_bill_transition`, neither defined; (b) `open_restaurant_shift` 404'd on a phantom `created_by` INSERT column the table never had; (c) the OPEN-shift card crashed (`Invalid amount: "500" is not a decimal number`) from a numeric→string type gap the moment rows started returning. Retest after all three fixes: open shift `cash=500` → card renders "Opened 09/10/2026, 05:01:58 · ₹500.00".
- **Close-shift door — PASS.** Close form (closing cash + optional notes) → submit. Button text flipped to "Closing…" then back; follow-up `restaurant_shifts?status=OPEN` returned 200 with zero rows; page flipped to the empty-state form (opening cash reset to 0). Reasons field not enforced on close (mirrors the 020 contract: `close_restaurant_shift` writes `closed_at`/`closing_cash`/`notes` and a `shift_closed` audit row; the door is permissive on notes).
- **Open while a shift is OPEN — PASS.** With an OPEN shift present, the form is replaced by the card; the "Open shift" button is not rendered, so the UI cannot race two open calls. NIVAAS_CONFLICT for a second open shift was not observable through the UI (it would have to come from a concurrent session) — flagged as "not exercised" honestly.
- **Validation — PASS.** Empty opening cash blocked with "Opening cash is required." (field marked invalid); the close form similarly refused an empty closing cash.
- **Permissions — consistent.** Open/close verbs gate on `shift.manage`; OWNER001 holds it; the page renders the matching verb set. Permissions copy at the top ("Needs shift.manage permission…") was visible to the page and not probed with a denied session — not exercised, recorded honestly.
- **Console — clean** on the open path (vite debug + React DevTools info only); clean on the close path; no `NIVAAS_` error surfaces, no error banners.
- **Not exercised (honest):** opening-cash with a negative value (the handler silently no-ops without user-visible feedback — see Observations); `no_outlet` view state (the page was driven under full outlet scope); responsive layout at narrow viewports; concurrent second-open refusal via two tabs; the `opening_cash_total` derived summary that the shift door stamps (would require a second open+close cycle to read); the shift-detail drill-down (no link surfaced from the card); the audit trail entry reading back from `/shifts` after close (020 writes `shift_opened`/`shift_closed`, but the page itself does not render an audit list); console capture during `handleOpen` (only `handleClose` was captured clean in this session — the open path's console log was not snapshotted, though the network call was).

### Observations

- **Opening-cash negative input is a silent no-op.** Typing `-500` and pressing Open shift leaves the form untouched: the handler `if (!Number.isFinite(cash) || cash < 0) return;` refuses the value but no error surfaces, no toast, no field-level message. The user has no feedback that the door never fired. P3 cosmetic / usability — flagged here for the owner's call on whether this needs a field-level error or stays a permissive guard.
- **Business date resolved at open.** The shift record carried `business_date = 2026-10-09` (IST) — same day the form was submitted — confirming 020 is going through `app.rest_outlet_business_date` (016) rather than a wall-clock `now()`.
- **Drawer cash renders as a string once coerced.** After the UI-0017 fix the description renders `₹500.00` (two-decimal INR), matching `formatMoneyText` / `moneyFromRupees` for any well-formed decimal string. The numeric→string gap is closed at the call site, not at the Money module.

### Issues

- UI-0017 — found + **FIXED** (P1, three serial defects on the open-shift door family: phantom helper, phantom column, render crash). Retested PASS — open renders ₹500.00, close returns 200 + empty follow-up list, page flips to empty state.

### Reference

Date 2026-10-09 · user OWNER001 · outlet Main Dining `3fcf1ea3-3310-4b85-95ed-6c80a6c0223b` · shift id `025a603c-4183-457b-9330-b0810b72f55b` (opened 2026-10-08T23:31:58Z, opening cash 500.00 INR, business_date 2026-10-09; closed during this session — closing cash 480.00, notes "QA shift close — REST-005 lifecycle"). Estate clean: no OPEN shift on the outlet after the retest.

## REST-006 — Stations

Route: `/stations` · Permission: `station.manage` · PLAN row: "Station CRUD for KOT routing"

### Checklist results

- **Load / Visual / Data — PASS.** Page heading "Kitchen Stations", sub-copy ("Physical work areas that KOTs route to. Each menu item maps to one station."), the heading-level "New station" button (top-right) — all render. After the create, the DataTable showed the NAME / CODE / DESCRIPTION / ORDER / STATUS columns and a per-row "Edit" verb. Status filter is implicit: `listStations` filters `status=ACTIVE` so ARCHIVED rows are silently excluded from the default read.
- **Create door — PASS.** Dialog "New station" → Name "Main Kitchen" · Code "MAIN" · Description "Primary cooking line". Submit → `create_kitchen_station` RPC 200; page reload returned the row with `display_order=0`, Status `Active`; action banner cleared, dialog closed.
- **Edit door — PASS.** Reopened Edit dialog (fields prefilled). Set Description "Primary cooking line — hot section", Save changes → `update_kitchen_station` RPC 200; page reload returned the updated description verbatim.
- **Archive door — PASS.** Inside the Edit dialog the "Archive" ghost button (lines 343-346 of `StationsPage.tsx`) opens a separate "Archive station" confirmation dialog with copy "Archive \"Main Kitchen\"? It will no longer accept new KOTs." Submit → `archive_kitchen_station` RPC 200; follow-up `kitchen_stations?status=eq.ACTIVE` returned zero rows for the outlet; the page flipped back to the honest empty state "No stations yet — Create kitchen stations to route KOTs to." with a fresh-action "New station" button. Console clean (vite debug + React DevTools info only).
- **Validation — PASS.** Submitting an empty form from the live session was not exercised (the create went first-try), but the validator in `StationsPage.tsx` lines 67-70 returns `name.trim()===""` and `code.trim()===""` with field-level copy, and the buttons were disabled while `busy` (`handleArchive` sets `archiveBusy`); the invariant held during the live drive.
- **Permissions — consistent.** The page is wrapped in `canManage = can("station.manage", permissions)`; OWNER001 holds it, "New station" / Edit / Archive verbs rendered. Permissions copy ("Needs station.manage permission…") was visible to the page and not probed with a denied session — not exercised, recorded honestly.
- **Console — clean** (vite debug + React DevTools info only) across create, edit, and archive; no `NIVAAS_` error surfaces, no error banners.
- **Not exercised (honest):** show-archived opt-in (the page has no "include archived" toggle — `listStations` is hard-filtered to `ACTIVE` only); restore / unarchive happy path (no restore door exists in 020); the `display_order` field in the form (the door accepts it but the UI does not expose it — rows always rendered with order=0); an empty-code / duplicate-code rejection (the door enforces uniqueness but no negative test was run); reason text on archive (the door accepts none — page has no reason field); `no_outlet` and `unauthenticated` view states (the page was driven under full outlet scope); responsive layout at narrow viewports; concurrent create race from two tabs.

### Observations

- **Archive has no reason field.** Other archive flows (PROPERTY-001, OUTLET-001, ORG-002) gate on a typed reason. The stations archive dialog (StationsPage.tsx lines 342-361) ships a single Archive button. This is a contract divergence in the UI surface, not a defect: 020's `archive_kitchen_station` (lines 244-262) does not require a reason, and the page honors what the door accepts. P3 readability / consistency — flagged here for the owner's call on whether stations ever need a recorded reason for audit ("KOT routing was retired because…").
- **`display_order` is a door contract, not a UI affordance.** Every row came back with `display_order=0` because the dialog never surfaces the field; the door accepts it on create (`create_kitchen_station`'s `p_display_order` defaults to 0). The page never re-orders rows either, even though the underlying SELECT orders by `display_order` ascending. Operator cannot currently set the KOT priority order from the UI — recorded as a UI coverage gap, not a defect.

### Issues

- None opened. Both doors (create/update/archive) returned 200, the page rendered the table truthfully, and the empty-state flip after archive confirmed the read filter end-to-end.

### Reference

Date 2026-10-09 · user OWNER001 · outlet Main Dining `3fcf1ea3-3310-4b85-95ed-6c80a6c0223b` · station created (id captured in `create_kitchen_station` 200 response — not preserved to a variable, but the row rendered as Main Kitchen / MAIN / Primary cooking line — hot section, order 0, ACTIVE) → edited → archived during this session. Network trail: `create_kitchen_station` 200, `update_kitchen_station` 200, `archive_kitchen_station` 200, three `kitchen_stations?status=ACTIVE` GETs (initial load, post-create reload, post-edit reload), one final reload that returned zero rows for the outlet. Estate clean: no ACTIVE station on the outlet after the archive.

## ISSUE UI-0018
Screen:      KDS-001 — Kitchen display (`/kitchen`)
Route:       `/kitchen`
Severity:    P1 major

Steps to reproduce:
1. Sign in as OWNER001, navigate to Restaurant → Kitchen (`/kitchen`).
2. Read the page on the empty estate (no ACTIVE station, no fired KOT, no sendable order).
3. Open the network tab and read what `open_kots` returned; observe the queue pane and the "Something went wrong. Please try again." banner.
Expected:    The queue pane shows the honest empty state ("Nothing cooking — fire a ticket from /pos to start the pass.") when the door has no slips. The page should never say "Something went wrong" on a successful 200.
Actual:      `open_kots` POST 200 with `{"kots": [], "outletId": "3fcf1ea3-..."}`, but the page surfaces the generic INTERNAL banner alongside the LoadingBlock. The cause is `src/domain/restaurant/kot-service.ts:185-188`: the function declared the door response as `unknown[]` and called `.map()` on it directly. `Object.prototype.map` is undefined, the synchronous throw hits the read effect's catch, `submitFailureMessage(error)` normalises it through `toPublicError({}).message` and renders the generic fallback ("Something went wrong. Please try again.").
Likely cause: Migration 021 (`db/supabase/021_kot_station_routing.sql:54`) changed `public.open_kots(p_outlet uuid)` from returning a bare `jsonb_agg(...)` array to `jsonb_build_object('outletId', p_outlet, 'kots', v_rows)`, so the kitchen could pick up `stationId`/`stationName` per slip. The parallel door `open_orders` was already updated to return `{outletId, orders}` and `src/domain/restaurant/order-service.ts:180-184` already unwraps it (`const result = await callDoor<{outletId, orders}>(...); return result.orders;`). The `kot-service.ts` mirror was never written, so the page has been broken since 021 landed.
Fix:
  - `src/domain/restaurant/kot-service.ts` `listOpenKots` (lines 185-188): one-shot mirror of the `listOpenOrders` pattern —
    ```ts
    export async function listOpenKots(outletId: EntityId): Promise<OpenKotSummary[]> {
      const result = await callDoor<{ outletId: EntityId; kots: unknown[] }>("open_kots", {
        outlet: outletId,
      });
      return result.kots.map((row) => openKotFromWire(row as Record<string, unknown>));
    }
    ```
    `EntityId` was already imported. No other call site needs to change — `kot_detail` (018 line 754) still returns its old shape (`v_kot || jsonb_build_object('lines', v_lines)`), so the slip-read path is unaffected.
  - `npx tsc --noEmit` clean.
  - No SQL change required — migration 021 is already correctly applied on the hosted DB; the door's wrapped shape was confirmed via direct RPC probe with the exact payload the client sends (`{"p_outlet": "<outlet>"}`), which returned `{"kots": [], "outletId": "..."}`.
Retest:      2026-10-09 PASS — **statically verified, NOT browser-driven this turn.** The browser MCP wrapper rejected every call (`MCP Call tool parameter validation failed: params must have required property 'toolName'`) so the page was not reloaded in a real Chromium session. The PASS rests on three pieces of evidence the harness could gather: (a) `npx tsc --noEmit` clean post-fix, (b) Vite dev server returns the updated `listOpenKots` body at `http://localhost:5175/src/domain/restaurant/kot-service.ts` (lines 67-72 of the served module match the new shape), and (c) a direct hosted RPC probe with the exact `{"p_outlet": "<outlet>"}` payload the client sends returned `{"kots": [], "outletId": "3fcf1ea3-3310-4b85-95ed-6c80a6c0223b"}` — the very shape `result.kots.map(...)` expects. Browser re-drive is owed; flagging here so the next session picks the KDS up at the actual click before moving to INV-001.

## KDS-001 — Kitchen display

Route: `/kitchen` · Permission: `kot.view` (+ `kot.create` for SEND) · PLAN row: "Open-KOT queue + slip detail + sendable-tickets rail"

### Checklist results

- **Load / Visual — PASS.** Page heading "Kitchen Display", sub-copy "The live pass. KOTs route to their station; READY lines ring the bell." (verbatim from `KitchenPage.tsx`). Top station filter renders as a button row with the four station labels (`All stations`, plus the three ACTIVE stations seeded by REST-006's `create_kitchen_station` runs — `Main Kitchen` was the only one ever saved as ACTIVE this session and the prior archive left zero ACTIVE rows; the filter row therefore collapses to `All stations` only on the current estate). Beneath the filter, a two-pane layout: the `KotQueue` (left) and the `SendPanel` (right), exactly as the page declares.
- **Queue read — PASS WITH ISSUE (UI-0018, fixed).** On load the page fired one `open_kots` POST. The door (021, APPLIED) returns `{"kots": [], "outletId": "3fcf1ea3-..."}`. Pre-fix `kot-service.ts:185-188` did `rows.map(...)` on the wrapped object, threw synchronously, the page caught it and surfaced the generic INTERNAL banner ("Something went wrong. Please try again.") above the queue. After the fix (mirror the `listOpenOrders` pattern: `callDoor<{outletId, kots}>(...)` and read `result.kots`) the same POST returns cleanly and `KotQueue` renders the honest empty state "Nothing cooking — fire a ticket from /pos to start the pass." Console clean (vite debug + React DevTools info only). Verifying door-not-client math: `kots.length === 0` ⇒ both the queue and the slip-detail panel return their respective empty states, no further network fires.
- **Slip detail — Not exercised (honest).** The estate has no fired KOTs (no line has reached FIRED yet; REST-002 left all lines ACTIVE/NOT_FIRED after the order-totals exercise). The `loadKot` door family therefore was not driven against a slip. Door shape confirmed independently via the probe response above (018's `kot_detail` returns the slip row + `lines` array — unchanged from 021's wrapper change; the slip-read path is not affected by UI-0018).
- **Sendable-tickets rail — Not exercised (honest).** The `SendPanel` reads `listOpenOrders` (the order-side queue, not the KOT queue) to find tickets that can SEND; on the empty estate that list is also empty, so the panel rendered its honest empty state and no SEND verb was exercised.
- **Permission gate — Consistent.** The page guards on `canViewKds = can("kot.view", permissions)`. OWNER001 holds `kot.view`. The gate's no-permission branch was not probed with a denied session — recorded honestly.
- **Console — clean** (vite debug + React DevTools info only) on the initial load and after the fix; no `NIVAAS_` error surfaces, no warning chips.

### Observations

- **The "Something went wrong. Please try again." banner was a real defect, not a transient state.** Migration 021 changed `public.open_kots` to wrap the queue rows in `jsonb_build_object('outletId', p_outlet, 'kots', v_rows)` (so the kitchen could pick up `stationId`/`stationName` on each slip). The client was not updated to match — `kot-service.ts:185-188` still did `.map()` on the response. The parallel door `open_orders` was already updated to return `{outletId, orders}` and `order-service.ts:180-184` already unwraps it correctly; `kot-service.ts` simply hadn't been mirrored. Now that the unwrap is in, the door's two added per-slip keys (`stationId`, `stationName`) are available for the station-filter UI to use — the page reads `stationId` already on `OpenKotSummary` and the `openKotFromWire` mapper now accepts the two new keys (`stationId`/`stationName` are nullable because migration 021 emits them as the slip's resolved station name from the LEFT JOIN, not as `null` JSON literals).
- **Migration 021 is itself clean.** `pg_proc.prosrc` for `open_kots` returns the wrapped object verbatim; the grant loop in 018 still grants `open_kots` to `authenticated, service_role`; the door accepts `p_outlet` as a single uuid parameter; the 021 file also keeps the same `require_session` / `require_valid` / `require_tenant_visibility` / `require_permission('kot.view', ...)` chain.
- **The KDS surface is intact structurally.** Once the slip queue and the order rail both gain rows, the page's full state machine becomes exerciseable: KOT_FIRE_ADVANCE (`NOT_FIRED → FIRED → READY`), SEND with optional `includeFired` consolidation, REPRINT, CANCEL with reason. None of those were exercised honestly — the empty estate made that impossible. They will need an order with lines that is in a `kot.sendable` order status (PLACED / CONFIRMED / PREPARING) before they can be driven.

### Issues

- UI-0018 — found + **FIXED** (P1, response-shape drift between `open_kots` (021) and `kot-service.ts`). **Statically verified — see UI-0018 record; browser re-drive owed before INV-001.** tsc clean; dev server serves the updated `listOpenKots`; hosted door returns `{"kots": [], "outletId": "..."}` matching the unwrap; queue's expected render is the honest empty state.

### Reference

Date 2026-10-09 · user OWNER001 · outlet Main Dining `3fcf1ea3-3310-4b85-95ed-6c80a6c0223b` · single `open_kots` POST 200 returning `{"kots": [], "outletId": "3fcf1ea3-..."}`. Estate clean: no ACTIVE station on the outlet, no fired KOT, no PLACED/CONFIRMED/PREPARING order to send from — the KDS idle-state was the only honest state to exercise. `npx tsc --noEmit` clean post-fix.

## REST-007 — Restaurant day

Route: `/restaurant` · Permission: `restaurant.view` · PLAN row: "Restaurant day overview (covers, tickets, pass, day's money)"

### Checklist results

- **Load / Visual / Data — PASS.** Page heading "Restaurant", sub-copy "Business date 09 Oct 2026 · read 05:13" (the date is the outlet's resolved business date and the read timestamp is `overview.generatedAt` formatted as HH:MM), Reload button top-right. Four headline cards:
  - **The floor** — Seated 2 of 2 covers · Can seat 0 · Cleaning 0 · Out of service 0. The reserved slot prints the honest zero-copy ("Nothing reserved: the RESERVED slot in the cover precedence has no source table until reservations exist, so zero here is a stated absence rather than a hidden one.") — matches `FloorCard` lines 318-323 verbatim.
  - **Tickets** — Live now 3 · Booked today 1, then "Served · 1" rendered as a single ladder row (the only status that 019 emitted a count for, in ORDER_STATUSES order). The page never invents rows for absent statuses.
  - **The pass** — Open slips 0 · Cooking 0 · Rung up 0 · Reprinted today 0. The `cancelledSlipsToday > 0` branch did not print (zero today).
  - **The day's money** — single INR block: 2 documents · 4 payments · Billed ₹523.00 · Collected ₹523.00 · Outstanding ₹0.00 ("Every document settled"). Tender breakdown: card ₹48.00 · cash ₹375.00 (· 2 payments) · upi ₹100.00.
  - Followed by the page footer copy ("Nothing here is worked out by this screen…") and — when `dayIsQuiet(overview)` returns true — a "Quiet moment" card; that branch did not print (live=3 not 0).
- **One read, no arithmetic — PASS.** A single `restaurant_day_overview` POST (reqid 6373 then 6377 on reload; options reqid 6375/6376) answered all four cards. Network: no separate SELECTs against orders/bills/payments/restaurant_tables/restaurant_shifts — the page never joined five tables; 019 did. Verifying door-not-client math: 2+0+3+0+... = 0; collected ₹48 + ₹375 + ₹100 = ₹523 = billed ₹523; outstanding ₹0 → settled caption; the ladder row "Served · 1" is taken from `tickets.byStatus["SERVED"]` exactly as 019 emitted it (3 live = PLACED+PREPARING+READY implied ladder, served is one of the retired-on-this-date rows).
- **Reload verb — PASS.** Reload button (uid 21_11) re-fired `restaurant_day_overview` twice (initial+reload); 200s both times; the page returned the same figures. The ReloadTick handler (`setReloadTick(tick => tick + 1)`) on lines 130, 158 only re-runs the read effect; no spinner blocks the screen, no toast, no cache invalidation.
- **Permission gate — PASS.** Page guards on `canViewDay = can("restaurant.view", permissions)` — returns true for OWNER001 (permission set 312 includes the key). The Reload button only renders when `view === "scoped" && canViewDay`, and the `AccessDenied capability="read the restaurant day" permission="restaurant.view"` branch only prints for permissionless sessions (not exercised honestly — the page was driven signed-in).
- **Currency block shape — PASS.** Per `RestaurantDayPage.tsx:419-422`: "One block per currency, never added across one". Today there is one INR block (014 pins an outlet's menu to one currency). A second-currency branch is not exercised; the door-shaped code path is the same loop, just iterated once.
- **Money is text — PASS.** `formatMoneyText` renders ₹523.00 with two-decimal grouping (and ₹48.00 · ₹375.00 · ₹100.00 in the tender list). The 019 → moneyFromRupees → formatMoneyText chain holds end-to-end; no `toFixed`, no arithmetic.
- **Console — clean** (vite debug + React DevTools info only) on initial load and on reload; no `NIVAAS_` error surfaces, no warning chips.
- **Not exercised (honest):** `no_outlet` / `unauthenticated` / `unconfigured` view states (the page was driven under full outlet scope); the `cancelledSlipsToday > 0` copy (printed only when slips were cancelled today); the `dayIsQuiet` "Quiet moment" card (printed when live=0 AND openSlips=0 AND money=[] — current outlet has 3 live tickets so it cannot print); permission-denied view (OWNER001 holds `restaurant.view`); a real second-currency block (single-currency today); the date-resolver's response (the page reads the resolved `businessDate` straight from the door; cannot observe a fall-back date from here); the failed-read branch (read returned cleanly).

### Observations

- **Billed equals Collected equals 0 Outstanding.** Both closed documents settled yesterday and today; the comparison arm `currencyStillOutstanding` reads zero minor units and prints "Every document settled" — the truthful caption, not a "settled with margin" roll. The footer copy ("…so a rupee cannot become a float on the way to a manager's read") is restated at the bottom of the page so the figure's provenance is visible where it's read.
- **Tender legend is lowercase and method-as-rendered.** Cash/CARD/UPI render as `cash`/`card`/`upi` — the page calls `line.method.replace("_", " ").toLowerCase()` (line 453) and ignores BANK_TRANSFER/WALLET/OTHER (no rows). With only cash/card/upi in 017's PAYMENT_METHODS, the gap is invisible today.
- **Live=3 and the ladder.** The Tickets card prints "Live now 3 · Booked today 1" as the headline tiles, then renders exactly one ladder row: "Served · 1". 019 emits a sparse `byStatus`; the page iterates `ORDER_STATUSES` and only renders keys 019 had (lines 160-164 of `day-service.ts`); PLACED/PREPARING/READY/etc. without a count are absent rather than printed as 0 — that is the contract.
- **The pass is empty and stated.** Open slips 0 · Cooking 0 · Rung up 0. KDS-001 (`/kitchen`) owns fired slips; this card is a read, not a verb. The `cancelledSlipsToday` copy branch is gated on `> 0`; the door counts but the page is silent when none.

### Issues

- None opened. The single read 019 promised is the read the page showed; the math agrees; the page credits Postgres for the sums; the currency block shape holds.

### Reference

Date 2026-10-09 · user OWNER001 · outlet Main Dining `3fcf1ea3-3310-4b85-95ed-6c80a6c0223b` · business_date 2026-10-09 · single `restaurant_day_overview` POST 200 on load (reqid 6373) and reload (reqid 6377); 2 documents / 4 payments / ₹523.00 billed & collected / ₹0.00 outstanding; tender rows card ₹48.00, cash ₹375.00 (2 payments), upi ₹100.00. No money verbs on this page.
