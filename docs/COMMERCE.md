# Commerce Module — Digital Hospitality Layer

**Prompt #14** · Migration 044 · Phase 8

---

## Overview

The Commerce module is the digital customer-facing layer that sits on top of the existing hospitality engine. It enables:

- **QR code ordering** — guests scan a table QR code to browse the menu and order
- **Online ordering** — customers order for pickup or delivery via the website
- **Direct booking** — guests book rooms directly through the property's public page
- **Public property pages** — mobile-first, no-auth pages showcasing the property
- **Public outlet menus** — menu pages accessible via slug or QR code
- **Table service requests** — guests request waiter, bill, or other assistance
- **Commerce analytics** — overview of channels, QR codes, and active requests

The module is designed to be **mobile-first** and **customer-facing**, with public pages that require no authentication.

---

## Architecture

### Database Schema (Migration 044)

Eight new tables support the commerce domain:

| Table | Purpose |
|-------|---------|
| `commerce_channels` | Digital sales channels (QR_MENU, TABLE_QR, ONLINE_ORDERING, etc.) |
| `property_public_profiles` | Public-facing property information (slug, description, contact, hours) |
| `outlet_public_profiles` | Public-facing outlet information (slug, menu, hours) |
| `qr_codes` | QR code registry with type, target, and status |
| `commerce_sessions` | Customer sessions (cart, table, channel context) |
| `table_requests` | Table-side service requests (waiter, bill, etc.) |
| `delivery_addresses` | Customer delivery addresses |
| `commerce_settings` | Per-property feature flags (QR ordering, online ordering, etc.) |

All tables are company-scoped with RLS policies matching the existing matrix.

### Doors (Security-Definer RPCs)

Fifteen doors provide the write API:

- `upsert_commerce_channel` — create or update a sales channel
- `upsert_property_public_profile` — create or update property public page
- `upsert_outlet_public_profile` — create or update outlet public page
- `upsert_qr_code` — create or update a QR code
- `create_commerce_session` — start a customer session
- `update_commerce_session` — update session state
- `create_table_request` — submit a table service request
- `update_table_request_status` — acknowledge/resolve a request
- `upsert_delivery_address` — save a delivery address
- `upsert_commerce_settings` — configure property feature flags

All doors are SECURITY DEFINER and enforce organization scoping.

### Permissions

Seventeen new permission keys:

```
commerce.view
commerce.channel.view
commerce.channel.manage
commerce.qr.view
commerce.qr.manage
commerce.table_request.view
commerce.table_request.manage
commerce.settings.view
commerce.settings.manage
commerce.public_profile.view
commerce.public_profile.manage
commerce.session.view
commerce.session.manage
commerce.delivery.view
commerce.delivery.manage
commerce.analytics.view
commerce.analytics.manage
```

---

## Client Architecture

### Domain Types

`src/domain/commerce/types.ts` — TypeScript types mirroring the SQL schema:

- `CommerceChannel`, `CommerceChannelType`, `CommerceChannelStatus`
- `PropertyPublicProfile`, `OutletPublicProfile`, `PublicProfileStatus`
- `QRCode`, `QRCodeType`, `QRCodeStatus`
- `CommerceSession`, `CommerceSessionStatus`, `SourceChannel`
- `TableRequest`, `TableRequestType`, `TableRequestStatus`
- `DeliveryAddress`, `DeliveryAddressLabel`
- `CommerceSettings`
- `PublicMenuItem`, `DietaryType`

### Service Layer

`src/domain/commerce/commerce-service.ts` — full CRUD API:

- Channel management: `listCommerceChannels`, `createCommerceChannel`, `updateCommerceChannel`
- Public profiles: `getPropertyPublicProfile`, `getPropertyPublicProfileBySlug`, `upsertPropertyPublicProfile`
- QR codes: `listQRCodes`, `createQRCode`, `updateQRCode`
- Sessions: `createCommerceSession`, `updateCommerceSession`
- Table requests: `listTableRequests`, `createTableRequest`, `updateTableRequestStatus`
- Delivery: `listDeliveryAddresses`, `upsertDeliveryAddress`
- Settings: `getCommerceSettings`, `upsertCommerceSettings`

All reads use `asRead()` for plain SELECTs under RLS; all writes use `callDoor()` or `callDoorRow()`.

### Admin UI Pages

Five admin pages for managing the commerce module:

1. **CommerceOverviewPage** (`/commerce`) — KPIs: active channels, active QR codes, open table requests
2. **ChannelsPage** (`/commerce/channels`) — manage digital sales channels
3. **QRCodesPage** (`/commerce/qr-codes`) — generate and manage QR codes
4. **TableRequestsPage** (`/commerce/table-requests`) — live feed of table service requests
5. **CommerceSettingsPage** (`/commerce/settings`) — per-property feature flags

All pages follow the standard view-state machine: `bootstrapping → unconfigured → unauthenticated → no_organization → scoped`.

### Public-Facing Pages

Four mobile-first, no-auth pages for customers:

1. **PublicPropertyPage** (`/stay/:propertySlug`) — property public page with cover image, description, contact, address, check-in/out times
2. **PublicMenuPage** (`/menu/:outletSlug`) — outlet menu page with cover image, description, contact, opening hours
3. **PublicQROrderPage** (`/order/:qrCode`) — table ordering page with menu and service request buttons
4. **PublicBookingLookupPage** (`/booking/lookup`) — booking lookup by confirmation number or email

Public pages are mounted outside the shell and bypass authentication. They render in a minimal layout optimized for mobile.

### Route Wiring

Admin routes are added to the `ROUTES` array in `src/app/routes.ts`:

```typescript
{ path: "/commerce", component: CommerceOverviewPage, permission: "commerce.view" },
{ path: "/commerce/channels", component: ChannelsPage, permission: "commerce.channel.view" },
{ path: "/commerce/qr-codes", component: QRCodesPage, permission: "commerce.qr.view" },
{ path: "/commerce/table-requests", component: TableRequestsPage, permission: "commerce.table_request.view" },
{ path: "/commerce/settings", component: CommerceSettingsPage, permission: "commerce.settings.view" },
```

Public routes are in a separate `PUBLIC_ROUTES` array and mounted at the top level in `App.tsx`:

```typescript
export const PUBLIC_ROUTES: readonly AppRoute[] = [
  { path: "/stay/:propertySlug", component: PublicPropertyPage },
  { path: "/menu/:outletSlug", component: PublicMenuPage },
  { path: "/order/:qrCode", component: PublicQROrderPage },
  { path: "/booking/lookup", component: PublicBookingLookupPage },
];
```

### Navigation

The `nav.commerce` group in `src/app/navigation.ts` includes all commerce destinations:

```typescript
{ labelKey: "nav.commerce.overview", path: "/commerce", phase: 8, available: true },
{ labelKey: "nav.commerce.channels", path: "/commerce/channels", phase: 8, available: true },
{ labelKey: "nav.commerce.qr_codes", path: "/commerce/qr-codes", phase: 8, available: true },
{ labelKey: "nav.commerce.table_requests", path: "/commerce/table-requests", phase: 8, available: true },
{ labelKey: "nav.commerce.settings", path: "/commerce/settings", phase: 8, available: true },
{ labelKey: "nav.commerce.reservations", path: "/hotel/reservations", phase: 3, available: true },
```

---

## Integration Points

### Existing Modules

The commerce module integrates with:

- **Menu** — public menu pages read from the existing menu domain
- **Hotel PMS** — direct booking integrates with reservations
- **CRM** — customer sessions can link to CRM customer records
- **Inventory** — online ordering draws from inventory stock

### Future Work

The following are stubbed but not yet implemented:

- **Online Orders page** — integrates with existing order domain
- **Direct Bookings page** — integrates with reservation domain
- **Menu item CRUD** — public menu pages currently show placeholder
- **QR code resolution** — `/order/:qrCode` needs to resolve QR code to table/outlet
- **Booking lookup** — `/booking/lookup` needs to query reservations
- **Commerce analytics** — detailed analytics dashboard

---

## Security Model

- All admin pages are permission-gated via `GuardedRoute`
- All writes go through SECURITY DEFINER doors
- All reads are under RLS (company-scoped)
- Public pages have no authentication requirement but are read-only
- Public profiles must have `status = 'ACTIVE'` to be accessible via slug
- QR codes must have `status = 'ACTIVE'` to be scannable

---

## Testing

Typecheck passes:

```bash
npx tsc --noEmit
```

No automated test suite exists in this repository (see agents.md §17).

---

## Files Changed

- `db/migrations/044_commerce_foundation.sql` — schema + doors + RLS
- `src/db/doors.ts` — 15 new doors
- `src/domain/identity/permissions.ts` — 17 new permission keys
- `src/domain/commerce/types.ts` — domain types
- `src/domain/commerce/commerce-service.ts` — service layer
- `src/pages/commerce/CommerceOverviewPage.tsx` — overview page
- `src/pages/commerce/ChannelsPage.tsx` — channels management
- `src/pages/commerce/QRCodesPage.tsx` — QR code management
- `src/pages/commerce/TableRequestsPage.tsx` — table requests feed
- `src/pages/commerce/CommerceSettingsPage.tsx` — settings page
- `src/pages/public/PublicPropertyPage.tsx` — public property page
- `src/pages/public/PublicMenuPage.tsx` — public menu page
- `src/pages/public/PublicQROrderPage.tsx` — public QR ordering page
- `src/pages/public/PublicBookingLookupPage.tsx` — public booking lookup
- `src/app/routes.ts` — admin + public route wiring
- `src/app/navigation.ts` — navigation registry
- `src/App.tsx` — public route mounting

---

## Status

**Prompt #14 is complete.** The commerce foundation is in place: schema, doors, permissions, admin UI, and public pages. The next phase is to integrate with existing order/reservation domains and implement the stubbed features.
