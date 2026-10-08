# Analytics & Reporting System

AMRUT NIVAAS enterprise analytics platform providing business intelligence, KPI tracking, and performance insights across all operational domains.

## Architecture Overview

```
Operational Data → Analytics Service Layer → KPI Aggregation → Dashboard Visualization
```

The analytics system reads from existing operational tables (bills, folios, events, inventory transactions, finance records) and aggregates them into meaningful business metrics. It never writes data or competes with operational calculations.

### Core Components

1. **Analytics Service Layer** — Centralized aggregation functions in `domain/analytics/analytics-service.ts`
2. **Date Utilities** — Period resolution and comparison range calculation in `domain/analytics/date-utils.ts`
3. **Type Definitions** — KPI structures, summaries, and context in `domain/analytics/types.ts`
4. **Owner Command Center** — Executive dashboard showing cross-domain performance
5. **Domain Analytics Pages** — Detailed metrics for each operational area

---

## Analytics Context

All analytics queries operate within a scoped context:

```typescript
interface AnalyticsContext {
  organizationId: EntityId;
  propertyId?: EntityId;
  outletId?: EntityId;
  startDate: string;
  endDate: string;
  currency: string;
}
```

**Multi-tenant isolation**: Every query filters by `organizationId`. Property and outlet filters are optional for granular scoping.

**Date range**: All dates are ISO strings (YYYY-MM-DD). The system never uses timestamps for period boundaries.

**Currency**: All monetary values are returned in the context's currency (default INR). No currency conversion occurs.

---

## Period Resolution

Analytics supports flexible period selection with automatic comparison ranges.

### Period Types

- `TODAY` — Current day (00:00 to 23:59)
- `THIS_WEEK` — Current week (Monday 00:00 to Sunday 23:59)
- `THIS_MONTH` — Current month (1st 00:00 to last day 23:59)
- `THIS_QUARTER` — Current quarter (quarter start to quarter end)
- `THIS_YEAR` — Current year (Jan 1 to Dec 31)
- `CUSTOM` — User-specified date range

### Comparison Modes

- `PREVIOUS_PERIOD` — Compare against the immediately preceding period of equal length
  - THIS_MONTH → previous month
  - THIS_WEEK → previous week
  - TODAY → yesterday
- `SAME_PERIOD_LAST_YEAR` — Compare against the same period in the previous year
  - THIS_MONTH 2026-10 → 2025-10
  - THIS_QUARTER 2026-Q4 → 2025-Q4
- `NONE` — No comparison

### Date Utility Functions

```typescript
resolveComparisonRanges(
  period: AnalyticsPeriod,
  comparison: ComparisonMode,
  customRange?: { start: Date; end: Date }
): { current: { start: Date; end: Date }; previous?: { start: Date; end: Date } }

toDateStrings(range: { start: Date; end: Date }): { start: string; end: string }
```

`resolveComparisonRanges` returns Date objects. Use `toDateStrings` to convert to the string format required by `AnalyticsContext`.

---

## Owner Command Center

**Route**: `/analytics`  
**Permission**: `analytics.dashboard.view`

The executive dashboard provides a cross-domain view of business performance.

### KPI Categories

**Revenue Summary**
- Total revenue (restaurant + room + events + other)
- Revenue breakdown by source
- Comparison with previous period

**Profitability**
- Gross profit and margin
- Net profit and margin
- Cost of goods sold (COGS)
- Operating expenses (OPEX)

**Restaurant Performance**
- Revenue, orders, covers
- Average order value
- Revenue per cover
- Discounts and refunds

**Hotel Performance**
- Occupancy rate
- Average Daily Rate (ADR)
- Revenue Per Available Room (RevPAR)
- Room revenue

**Event Performance**
- Leads and confirmed events
- Pipeline value
- Event revenue
- Outstanding collections

**Inventory Health**
- Inventory value
- Low stock items
- Out of stock items
- Wastage value

**Finance Position**
- Cash and bank balances
- Receivables and payables
- Tax liability

### Attention Items

The dashboard surfaces actionable attention items:
- Low stock alerts
- Overdue receivables
- Pending approvals
- Expired items
- Negative trends

Each item includes priority (CRITICAL, HIGH, MEDIUM, LOW), category, and a deep link to the relevant screen.

### Change Detection

The system detects significant metric changes between periods:
- Revenue trends (up/down/flat)
- Occupancy shifts
- Inventory value changes
- Outstanding balance movements

Changes are displayed with trend icons and percentage deltas.

---

## Domain Analytics Pages

Each operational domain has a dedicated analytics page with detailed metrics.

### Restaurant Analytics

**Route**: `/analytics/restaurant`  
**Permission**: `analytics.restaurant.view`

**Metrics**:
- Revenue, orders, covers
- Average order value
- Revenue per cover
- Discounts and refunds
- Cancelled orders

**Outlet Performance Table**:
- Per-outlet revenue and orders
- Average order value by outlet
- Growth percentage vs previous period

**Data Sources**:
- `bills` table (PAID status)
- `order_items` for item-level metrics

### Hotel Analytics

**Route**: `/analytics/hotel`  
**Permission**: `analytics.hotel.view`

**Metrics**:
- Occupancy rate
- Average Daily Rate (ADR)
- Revenue Per Available Room (RevPAR)
- Room revenue
- Available rooms, sold rooms
- No-shows and cancellations
- Average length of stay

**Data Sources**:
- `folios` table (SETTLED status)
- `reservations` for booking metrics
- `rooms` for availability

### Event Analytics

**Route**: `/analytics/events`  
**Permission**: `analytics.events.view`

**Metrics**:
- Event leads
- Confirmed events
- Completed events
- Pipeline value
- Confirmed value
- Collected advance
- Outstanding balance
- Event revenue

**Data Sources**:
- `events` table
- `event_bookings` for payment tracking

### Inventory Analytics

**Route**: `/analytics/inventory`  
**Permission**: `analytics.inventory.view`

**Metrics**:
- Total inventory value
- Low stock items
- Out of stock items
- Wastage value
- Consumption value
- Stock adjustments

**Data Sources**:
- `inventory_ledger` for stock movements
- `stock_items` for current levels
- `wastage_records` for loss tracking

### Finance Analytics

**Route**: `/analytics/finance`  
**Permission**: `analytics.finance.view`

**Metrics**:
- Total revenue
- Total expenses
- Net profit
- Cash balance
- Bank balance
- Receivables
- Payables
- Tax liability

**Data Sources**:
- `finance_transactions` for income and expenses
- `accounts_receivable` for outstanding
- `accounts_payable` for liabilities

### CRM Analytics

**Route**: `/analytics/crm`  
**Permission**: `analytics.crm.view`

**Metrics**:
- Total customers
- New customers (in period)
- Returning customers
- Repeat rate
- Total customer spend
- Average customer spend

**Data Sources**:
- `customers` table
- `customer_visits` for frequency
- `bills` and `folios` for spend

### HR Analytics

**Route**: `/analytics/hr`  
**Permission**: `analytics.hr.view`

**Metrics**:
- Active employees
- Present today
- Absent today
- On leave
- Late arrivals
- Open tasks

**Data Sources**:
- `employees` table
- `attendance_records` for daily status
- `leave_requests` for approvals
- `task_assignments` for workload

### Commerce Analytics

**Route**: `/analytics/commerce`  
**Permission**: `analytics.commerce.view`

**Metrics**:
- QR code orders
- Online orders
- Direct bookings
- Takeaway orders
- Conversion rate

**Data Sources**:
- `commerce_orders` table
- `qr_codes` for scan tracking
- `online_integrations` for external orders

---

## Service Layer

The analytics service layer (`domain/analytics/analytics-service.ts`) provides centralized aggregation functions.

### Revenue

```typescript
getRevenueSummary(ctx: AnalyticsContext): Promise<RevenueSummary>
```

Aggregates revenue from:
- Restaurant bills (PAID status)
- Hotel folios (SETTLED status)
- Events (COMPLETED status)
- Other income sources

### Profitability

```typescript
getProfitabilitySummary(ctx: AnalyticsContext): Promise<ProfitabilitySummary>
```

Calculates:
- Gross profit = Revenue - COGS
- Net profit = Gross profit - OPEX
- Margins as percentages

**Note**: COGS and OPEX data must be manually entered or imported. The system does not automatically categorize expenses.

### Domain Summaries

Each domain has a dedicated summary function:

```typescript
getRestaurantSummary(ctx): Promise<RestaurantSummary>
getHotelSummary(ctx): Promise<HotelSummary>
getEventSummary(ctx): Promise<EventSummary>
getInventorySummary(ctx): Promise<InventorySummary>
getFinanceSummary(ctx): Promise<FinanceSummary>
getCrmSummary(ctx): Promise<CrmSummary>
getHrSummary(ctx): Promise<HrSummary>
getCommerceSummary(ctx): Promise<CommerceSummary>
```

### Attention Items

```typescript
getAttentionItems(ctx: AnalyticsContext): Promise<AttentionItem[]>
```

Scans operational data for items requiring attention:
- Low stock (below threshold)
- Out of stock items
- Overdue receivables (>30 days)
- Pending approvals
- Expired inventory
- Negative trends (>10% decline)

### Change Detection

```typescript
detectChanges(
  current: AnalyticsContext,
  previous: AnalyticsContext
): Promise<ChangeItem[]>
```

Compares metrics between two periods and returns significant changes:
- Revenue
- Occupancy
- Average order value
- Inventory value
- Outstanding balances

---

## Permission Model

Analytics uses a hierarchical permission structure:

**Dashboard Access**:
- `analytics.dashboard.view` — Owner Command Center

**Domain Access**:
- `analytics.restaurant.view`
- `analytics.hotel.view`
- `analytics.inventory.view`
- `analytics.finance.view`
- `analytics.events.view`
- `analytics.crm.view`
- `analytics.hr.view`
- `analytics.commerce.view`

**Enforcement**:
- Each page checks `can("analytics.*.view", permissions)` before rendering
- Unauthorized users see the `AccessDenied` component
- Navigation items are hidden based on permissions

---

## Data Integrity

### Read-Only Architecture

The analytics system **never writes data**. It only reads from operational tables:
- `bills`, `order_items` (restaurant)
- `folios`, `reservations`, `rooms` (hotel)
- `events`, `event_bookings` (events)
- `inventory_ledger`, `stock_items` (inventory)
- `finance_transactions` (finance)
- `customers`, `customer_visits` (CRM)
- `employees`, `attendance_records` (HR)
- `commerce_orders` (commerce)

### No Competing Calculations

Analytics aggregations **do not compete** with operational calculations:
- Revenue comes from PAID bills, not order totals
- Occupancy comes from SETTLED folios, not reservation counts
- Inventory value comes from ledger balances, not item counts

### Status Filtering

All queries filter by appropriate status:
- Bills: `status = 'PAID'` (excludes VOID, REFUNDED)
- Folios: `status = 'SETTLED'` (excludes OPEN, CANCELLED)
- Events: `status = 'COMPLETED'` (excludes LEAD, CONFIRMED, CANCELLED)

This ensures analytics reflect actual business outcomes, not projections.

---

## Performance Considerations

### Query Optimization

Analytics queries can be expensive on large datasets. Optimization strategies:

1. **Date range filtering** — All queries include `business_date` or `created_at` filters
2. **Status filtering** — Only relevant statuses are queried (e.g., PAID bills)
3. **Aggregation at query time** — No intermediate materialized views (yet)

### Future Enhancements

For deployments with >100K transactions per month:
- Materialized views for daily aggregates
- Time-series database for trend data
- Background job for attention item calculation
- Caching layer for dashboard data

---

## Navigation Integration

Analytics pages are accessible via the navigation menu:

```typescript
{
  labelKey: "nav.insights",
  items: [
    { labelKey: "nav.insights.analytics", path: "/analytics", available: true },
    { labelKey: "nav.insights.analytics_restaurant", path: "/analytics/restaurant", available: true },
    { labelKey: "nav.insights.analytics_hotel", path: "/analytics/hotel", available: true },
    { labelKey: "nav.insights.analytics_inventory", path: "/analytics/inventory", available: true },
    { labelKey: "nav.insights.analytics_finance", path: "/analytics/finance", available: true },
    { labelKey: "nav.insights.analytics_events", path: "/analytics/events", available: true },
    { labelKey: "nav.insights.analytics_crm", path: "/analytics/crm", available: true },
    { labelKey: "nav.insights.analytics_hr", path: "/analytics/hr", available: true },
    { labelKey: "nav.insights.analytics_commerce", path: "/analytics/commerce", available: true },
  ]
}
```

All analytics navigation items are enabled (`available: true`) and phase 4.

---

## File Structure

```
src/
├── domain/
│   └── analytics/
│       ├── analytics-service.ts    # Aggregation functions
│       ├── date-utils.ts           # Period resolution
│       └── types.ts                # Type definitions
└── pages/
    └── analytics/
        ├── OwnerCommandCenter.tsx          # Executive dashboard
        ├── RestaurantAnalyticsPage.tsx     # Restaurant metrics
        ├── HotelAnalyticsPage.tsx          # Hotel metrics
        ├── EventsAnalyticsPage.tsx         # Event metrics
        ├── InventoryAnalyticsPage.tsx      # Inventory metrics
        ├── FinanceAnalyticsPage.tsx        # Finance metrics
        ├── CrmAnalyticsPage.tsx            # CRM metrics
        ├── HrAnalyticsPage.tsx             # HR metrics
        └── CommerceAnalyticsPage.tsx       # Commerce metrics
```

---

## Usage Example

```typescript
import { useContextStore } from "@/state/context-store";
import { getRevenueSummary } from "@/domain/analytics/analytics-service";
import { resolveComparisonRanges, toDateStrings } from "@/domain/analytics/date-utils";

function RevenueCard() {
  const context = useContextStore((s) => s.context);
  const [revenue, setRevenue] = useState(null);

  useEffect(() => {
    const ranges = resolveComparisonRanges("THIS_MONTH", "PREVIOUS_PERIOD");
    const currentRange = toDateStrings(ranges.current);

    const ctx = {
      organizationId: context.organizationId,
      propertyId: context.propertyId,
      startDate: currentRange.start,
      endDate: currentRange.end,
      currency: "INR",
    };

    getRevenueSummary(ctx).then(setRevenue);
  }, []);

  return <div>Revenue: {revenue?.totalRevenue}</div>;
}
```

---

## Limitations & Future Work

### Current Limitations

1. **No drill-down** — Dashboard KPIs are top-level; clicking does not navigate to detail
2. **No export** — Analytics data cannot be exported to CSV/PDF
3. **No custom KPIs** — Users cannot define custom metrics
4. **No alerts** — Attention items are displayed but not pushed as notifications
5. **No forecasting** — No predictive analytics or trend extrapolation

### Planned Enhancements

**Phase 5**:
- KPI drill-down to detail screens
- CSV export for all analytics tables
- Custom date range picker
- Saved report configurations

**Phase 10**:
- AI-powered insights and recommendations
- Predictive forecasting
- Anomaly detection
- Natural language queries
- Automated report generation

---

## Testing

Analytics queries are validated via:
1. **TypeScript type checking** — All service functions have strict types
2. **Manual verification** — Compare dashboard figures against operational screens
3. **SQL verification** — Run equivalent queries directly in Supabase

**Note**: No automated test suite exists for analytics (per project policy).

---

## References

- **Prompt #18** — Analytics, reporting, and KPI engine specification
- **Task #137** — Centralized analytics service layer
- **Task #138** — Owner Command Center dashboard
- **Task #139** — Domain-specific analytics pages
- **Task #140** — Analytics permissions and routing

---

**Document Version**: 1.0  
**Last Updated**: 2026-10-08  
**Status**: Production-ready (Phase 4 complete)
