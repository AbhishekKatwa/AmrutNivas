# SaaS Subscriptions & Billing (Prompt #16)

## Overview

AMRUT NIVAAS's own billing system — organizations paying for the platform. This is deliberately separate from the hospitality finance layer (folios, bills, payments), which tracks the customer's business transactions.

**What this is:** Subscription plans, recurring billing, usage tracking, entitlements, and payment collection for organizations using AMRUT NIVAAS.

**What this is not:** The restaurant/hotel finance module that handles customer bills, room charges, and business accounting.

## Architecture

### Domain Model

```
SubscriptionPlan
  ├── PlanFeature (feature flags: POS, KDS, HOTEL, CRM, etc.)
  └── PlanLimit (quantitative limits: properties, outlets, users)

Subscription
  ├── Links organization → plan
  ├── Tracks billing periods (current_period_start/end)
  ├── Status lifecycle: TRIALING → ACTIVE → PAST_DUE → CANCELLED → EXPIRED
  └── SubscriptionEvent (audit trail: created, upgraded, cancelled, etc.)

BillingAccount
  └── Contact details for invoicing (name, email, phone, address, tax ID)

SaaSInvoice
  ├── SaaSInvoiceLine (line items: plan fee, overage charges, discounts)
  └── Status: DRAFT → OPEN → PAID | VOID | OVERDUE

SaaSPayment
  └── Records payment against invoice (amount, method, transaction ref)

UsageSnapshot
  └── Point-in-time usage metrics (properties, outlets, users, revenue, transactions, rooms)
```

### Data Flow

1. **Plan selection** → Organization owner views available plans
2. **Subscription creation** → `upsert_subscription` door creates subscription record
3. **Billing period** → System tracks `current_period_start` / `current_period_end`
4. **Invoice generation** → `create_saas_invoice` door mints invoice with line items
5. **Payment collection** → `record_saas_payment` door logs payment against invoice
6. **Usage tracking** → Periodic snapshots of org's resource consumption
7. **Entitlement enforcement** → Each screen checks plan features and limits

### Security Model

All writes go through security-definer RPCs (doors):

- `upsert_subscription` — create or update subscription
- `cancel_subscription` — cancel with reason tracking
- `upsert_billing_account` — update billing contact details
- `next_saas_invoice_number` — mint sequential invoice numbers
- `create_saas_invoice` — create invoice with line items
- `record_saas_payment` — log payment against invoice

Reads use RLS-scoped Supabase queries. Every table has `organization_id` and RLS policies ensure organizations see only their own data.

### Permission Keys

13 billing permissions in the `billing` domain:

- `billing.plan.view` / `billing.plan.manage` — subscription plans
- `billing.subscription.view` / `billing.subscription.manage` — subscriptions
- `billing.account.view` / `billing.account.manage` — billing account
- `billing.invoice.view` / `billing.invoice.manage` — invoices
- `billing.payment.view` / `billing.payment.manage` — payments
- `billing.usage.view` — usage metrics
- `billing.settings.view` / `billing.settings.manage` — billing settings

## Screens

### Organization Billing (5 screens)

1. **Subscription** (`/billing/subscription`) — Current plan, billing period, trial status, plan features and limits. Shows plan comparison cards when no subscription exists.

2. **Invoices** (`/billing/invoices`) — Invoice history with number, date, period, total, status. Status badges: DRAFT, OPEN, PAID, VOID, OVERDUE.

3. **Payments** (`/billing/payments`) — Payment history with date, amount, method, status, transaction reference. Status badges: PENDING, COMPLETED, FAILED, REFUNDED.

4. **Usage** (`/billing/usage`) — Current usage vs plan limits for PROPERTIES, OUTLETS, USERS. Progress bars with color coding (green < 80%, amber 80-99%, red 100%).

5. **Billing Account** (`/billing/account`) — Edit billing contact details: name, email, phone, address, tax ID (GSTIN). This information appears on invoices.

### Platform Admin Console (Pending)

Future screens for AMRUT NIVAAS administrators:

- **Plans Management** — CRUD for subscription plans, features, limits
- **All Subscriptions** — View all organizations' subscriptions across the platform
- **All Invoices** — Platform-wide invoice ledger
- **All Payments** — Platform-wide payment ledger
- **Revenue Analytics** — MRR, ARR, churn, expansion revenue

## Subscription Lifecycle

```
TRIALING ──(trial ends)──→ ACTIVE
    │                         │
    │                         ├─(upgrade/downgrade)──→ ACTIVE (new plan)
    │                         │
    │                         ├─(payment failed)──→ PAST_DUE
    │                         │                         │
    │                         │                         ├─(payment succeeds)──→ ACTIVE
    │                         │                         │
    │                         │                         └─(grace period expires)──→ CANCELLED
    │                         │
    │                         └─(user cancels)──→ CANCELLED
    │                                               │
    │                                               └─(period ends)──→ EXPIRED
    │
    └─(trial cancelled)──→ CANCELLED
```

### Status Transitions

- **TRIALING → ACTIVE**: Trial period ends, first payment succeeds
- **ACTIVE → PAST_DUE**: Payment method fails
- **PAST_DUE → ACTIVE**: Payment succeeds within grace period
- **PAST_DUE → CANCELLED**: Grace period expires without payment
- **ACTIVE → CANCELLED**: User cancels subscription
- **CANCELLED → EXPIRED**: Current period ends

### Events

Every status transition creates a `SubscriptionEvent`:

- `subscription_created` — initial subscription
- `subscription_started` — trial → active
- `plan_changed` — upgrade or downgrade
- `payment_failed` — payment method declined
- `payment_succeeded` — payment processed
- `subscription_cancelled` — user-initiated cancellation
- `subscription_expired` — period ended without renewal
- `subscription_renewed` — auto-renewal succeeded

## Billing Intervals

- **MONTHLY** — billed every month
- **QUARTERLY** — billed every 3 months
- **ANNUAL** — billed every 12 months (typically discounted)

## Currency

- **INR** — Indian Rupee (₹)
- **USD** — US Dollar ($)

Stored as `numeric(14,2)` in the database. Never floating point.

## Plan Features (Feature Flags)

Boolean feature flags that control module access:

- `POS` — Point of Sale
- `KDS` — Kitchen Display System
- `BILLING` — Restaurant billing
- `INVENTORY` — Inventory management
- `HOTEL` — Hotel PMS
- `HOUSEKEEPING` — Housekeeping & maintenance
- `CRM` — Customer relationship management
- `EVENTS` — Event management
- `HR` — Human resources
- `COMMERCE` — Online ordering, QR codes
- `ENTERPRISE` — Multi-property management
- `REPORTS` — Advanced reporting
- `API_ACCESS` — API integrations
- `PRIORITY_SUPPORT` — Priority support tier

## Plan Limits (Quantitative)

Numeric limits on resource consumption:

- `PROPERTIES` — number of properties (hotels, restaurants)
- `OUTLETS` — number of outlets per property
- `USERS` — number of user accounts
- `ROOMS` — number of rooms (hotel)
- `TRANSACTIONS_PER_MONTH` — monthly transaction volume
- `MONTHLY_REVENUE` — monthly revenue processed

Limits can be **hard** (enforcement blocks creation) or **soft** (warning shown, overage charged).

## Usage Tracking

`UsageSnapshot` records point-in-time metrics:

- `snapshot_date` — when the snapshot was taken
- `metric` — which resource (PROPERTIES, OUTLETS, USERS, etc.)
- `current_value` — current usage
- `limit_value` — plan limit (for comparison)
- `unit` — unit of measurement (count, ₹, etc.)

Snapshots are taken daily and used to:

1. Show current usage on the Usage screen
2. Detect limit breaches for enforcement
3. Calculate overage charges for soft limits
4. Generate usage reports

## Invoice Generation

Invoices are generated:

1. **At subscription start** — first billing period
2. **At each renewal** — subsequent billing periods
3. **On plan change** — prorated for mid-period upgrades/downgrades
4. **For overages** — when soft limits are exceeded

Invoice numbering is sequential per organization, minted by `next_saas_invoice_number` door.

### Invoice Line Items

- **Plan fee** — base price for the subscription plan
- **Overage charges** — cost for exceeding soft limits
- **Discounts** — promotional or negotiated discounts
- **Tax** — GST or other applicable taxes

## Payment Recording

Payments are recorded against invoices:

- `invoice_id` — which invoice this payment is for (nullable for prepayments)
- `amount` — payment amount
- `method` — payment method (CASH, CARD, UPI, BANK_TRANSFER, etc.)
- `transaction_ref` — external transaction reference (e.g., payment gateway ID)
- `status` — PENDING, COMPLETED, FAILED, REFUNDED

## Files

### Domain

- `src/domain/billing/types.ts` — TypeScript types for all billing entities
- `src/domain/billing/billing-service.ts` — service layer for billing operations

### Pages

- `src/pages/billing/SubscriptionPage.tsx` — subscription details
- `src/pages/billing/InvoicesPage.tsx` — invoice list
- `src/pages/billing/PaymentsPage.tsx` — payment list
- `src/pages/billing/UsagePage.tsx` — usage vs limits
- `src/pages/billing/BillingAccountPage.tsx` — billing contact details

### Routes & Navigation

- `src/app/routes.ts` — 5 billing routes added
- `src/app/navigation.ts` — billing nav group added (phase 10)

### Database

- `db/migrations/046_saas_billing.sql` — schema, doors, RLS policies

## Integration Points

### Context Store

Billing screens read from `useContextStore`:

- `context.organizationId` — scoping all queries to the active organization
- `permissions` — checking billing permissions before rendering

### Permission Checks

Each screen checks permissions before rendering:

```typescript
const canView = can("billing.subscription.view", permissions);
if (!canView) {
  return <AccessDenied capability="view subscription" permission="billing.subscription.view" />;
}
```

### Service Layer

All billing operations go through the service layer:

```typescript
import { getCurrentSubscription, listInvoices } from "@/domain/billing/billing-service";

const subscription = await getCurrentSubscription(organizationId);
const invoices = await listInvoices(organizationId);
```

## Future Work

### Platform Admin Console

Screens for AMRUT NIVAAS administrators to manage the platform's billing:

- Plans management (CRUD for plans, features, limits)
- All subscriptions view (cross-organization)
- All invoices/payments (platform-wide ledger)
- Revenue analytics (MRR, ARR, churn, expansion)

### Payment Gateway Integration

Current implementation records payments manually. Future integration with payment gateways:

- Razorpay (India)
- Stripe (global)
- Automatic invoice generation on renewal
- Automatic payment collection
- Dunning management (retry failed payments)

### Usage-Based Billing

Current implementation tracks usage but doesn't bill for overages. Future enhancement:

- Per-unit pricing for overages
- Tiered pricing (volume discounts)
- Real-time usage alerts
- Budget caps and notifications

### Multi-Currency Support

Current implementation supports INR and USD but doesn't handle currency conversion. Future enhancement:

- Real-time exchange rates
- Currency-specific pricing
- Multi-currency invoicing
- FX gain/loss tracking

### Tax Automation

Current implementation stores tax IDs but doesn't calculate taxes. Future enhancement:

- Automatic tax calculation based on billing address
- Tax jurisdiction detection
- Tax reporting and filing
- Reverse charge mechanism (B2B cross-border)

## Design Decisions

### Separate from Hospitality Finance

The billing domain is deliberately separate from the hospitality finance module (folios, bills, payments). The hospitality finance tracks the customer's business transactions (restaurant bills, room charges). The billing domain tracks what organizations pay AMRUT NIVAAS for the platform.

### Security-Definer Doors

All writes go through security-definer RPCs. The client never writes directly to billing tables. This ensures:

- Consistent business logic (invoice numbering, status transitions)
- Audit trail (every change creates a subscription event)
- Security (RLS policies + door-level authorization)

### Usage Snapshots

Usage is tracked as point-in-time snapshots rather than real-time counters. This allows:

- Historical usage analysis
- Billing period reconciliation
- Dispute resolution (what was the usage on a specific date?)
- Performance (no real-time counter updates on every resource creation)

### Hard vs Soft Limits

Limits can be hard (enforcement blocks creation) or soft (warning shown, overage charged). This allows:

- Flexible pricing models (some customers pay for overages)
- Graceful degradation (soft limits don't break workflows)
- Customer choice (upgrade or pay for overages)

## Testing

TypeScript compilation passes with zero errors. All billing screens:

- Check permissions before rendering
- Handle loading states
- Handle error states
- Show empty states when no data exists
- Use the service layer for all operations
- Scope queries to the active organization

## Migration Path

For existing organizations:

1. **No subscription** — show plan comparison cards on Subscription screen
2. **Trial** — set `trial_start` and `trial_end`, status = TRIALING
3. **Active** — set `start_date`, `current_period_start`, `current_period_end`, status = ACTIVE
4. **Cancelled** — set `cancelled_at`, `cancellation_reason`, status = CANCELLED

Migration is manual for now (platform admin creates subscriptions via SQL). Future enhancement: self-service plan selection and subscription creation.
