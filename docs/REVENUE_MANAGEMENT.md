# Revenue Management

> Prompt #27 — Revenue Management, Pricing, Rate Plans & Yield Intelligence

## Overview

Revenue Management is the centralized pricing intelligence layer for AMRUT NIVAAS. It provides ONE pricing calculation service, ONE rate-plan architecture, and ONE promotion architecture that unify hotel, restaurant, events, and commerce pricing.

**Core principles:**
- **Deterministic, not autonomous** — every recommendation is evidence-based and labeled as "suggested review"; the owner decides
- **No ML, no competitor scraping, no dynamic pricing AI** — transparent rules, not black boxes
- **Price snapshots** — historical transactions freeze the price at booking time; never recalculate from current rules
- **Full audit trail** — every price change records source, reason, and actor

## Architecture

### ONE Pricing Engine

All pricing flows through `calculatePrice(ctx: PricingContext)`:

```
Base Price (from Supabase)
  ↓
Seasonal Multiplier (if active)
  ↓
Channel Pricing (if applicable)
  ↓
Promotions (if applicable)
  ↓
Guardrails (min/max bounds)
  ↓
Tax (placeholder — no tax module yet)
  ↓
Final Price + Audit Trail
```

**Price sources tracked:**
- `BASE` — base price from room_rates, menu_item_prices, or event_packages
- `RATE_PLAN` — rate plan override (BAR, CORPORATE, WEEKEND, etc.)
- `PROMOTION` — active promotion discount
- `MANUAL` — manually overridden by user
- `RULE` — price rule applied
- `CONTRACT` — contracted rate
- `PACKAGE` — package deal pricing
- `CHANNEL` — channel-specific pricing (OTA, direct, etc.)

### ONE Rate-Plan Architecture

Hotel rate plans are stored in `room_rates` (Supabase) with:
- Rate plan code (BAR, CORP, WEEKEND, etc.)
- Date ranges
- Room type pricing
- Minimum stay requirements
- Advance purchase restrictions

The revenue layer adds:
- **Seasonal pricing** — multipliers for peak/festive/off-peak seasons
- **Channel pricing** — different rates for OTA vs direct vs corporate
- **Occupancy-based pricing** — adjust rates based on demand signals

### ONE Promotion Architecture

Promotions are stored in-memory (revenue service) with:
- **Types:** PERCENTAGE, FIXED, FREE_ITEM, PACKAGE, RATE_OVERRIDE
- **Scope:** PROPERTY, OUTLET, PRODUCT, CUSTOMER_TYPE, CHANNEL
- **Stacking rules:** allow/deny stacking, max stack count
- **Usage tracking:** count and total discount amount

## Domain Model

### PricingContext

The full context for a pricing calculation:

```typescript
{
  organizationId, propertyId, outletId?,
  productType: "ROOM" | "MENU_ITEM" | "EVENT_PACKAGE",
  productId,
  date, time?,
  customerType?,
  channel?,
  ratePlanCode?,
  occupancy?,
  loyaltyTier?,
}
```

### PriceResult

The output of a pricing calculation:

```typescript
{
  finalPrice: string,
  basePrice: string,
  source: PriceSource,
  adjustments: PriceAdjustment[],
  priceSnapshotId: string,
  isSimulation: boolean,
}
```

### Promotion

```typescript
{
  id, organizationId, propertyId,
  name, code,
  type: "PERCENTAGE" | "FIXED" | "FREE_ITEM" | "PACKAGE" | "RATE_OVERRIDE",
  status: "ACTIVE" | "SCHEDULED" | "EXPIRED" | "DRAFT",
  discountPercentage?, discountAmount?, rateOverrideAmount?,
  startDate, endDate,
  scope: PromotionScope,
  stackingRules: { allowStacking, maxStackCount? },
  usageCount, totalDiscountAmount,
}
```

### Season

```typescript
{
  id, organizationId, propertyId,
  name,
  startDate: "MM-DD",  // recurring yearly
  endDate: "MM-DD",
  multiplier: string,  // e.g., "1.25" for 25% increase
  isActive: boolean,
}
```

### DemandSignal

```typescript
{
  id, organizationId, propertyId,
  productType, productId,
  date,
  demandLevel: "LOW" | "NORMAL" | "HIGH" | "VERY_HIGH",
  occupancy: string,
  bookingsCount: number,
  availableInventory: number,
}
```

### RevenueRecommendation

```typescript
{
  id, organizationId, propertyId,
  type: "RATE_ADJUSTMENT" | "PROMOTION" | "INVENTORY" | "CHANNEL" | "SEASONAL",
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT",
  status: "PENDING" | "APPROVED" | "REJECTED" | "APPLIED",
  title, description,
  evidence: string[],
  impact: {
    estimatedRevenueIncrease,
    estimatedRevenueIncreasePercent,
    confidence: "LOW" | "MEDIUM" | "HIGH",
  },
  actionDetails: Record<string, any>,
  reviewedBy?, reviewedAt?, reviewNotes?,
}
```

### RevenueGuardrails

```typescript
{
  id, organizationId, propertyId,
  minimumPrice: string,
  maximumDiscountPercentage: string,
  rateChangeApprovalThreshold: string,  // % change requiring approval
  promotionStackingLimit: number,
  minimumAdvancePurchase: number,  // hours
  maximumRateIncreasePercentage: string,
}
```

## Screens

### Revenue Dashboard (`/revenue`)

Main revenue intelligence screen showing:
- Revenue summary (total, room, restaurant, event)
- Current demand level indicator
- Active promotions with usage tracking
- Pending recommendations with priority
- Recent price changes

**Permission:** `revenue.view`

### Promotions (`/revenue/promotions`)

Promotions CRUD with:
- Status filter (ALL, ACTIVE, SCHEDULED, EXPIRED)
- Promotion cards showing name, status, type, discount, dates, usage
- Create/edit promotion modal

**Permission:** `revenue.promotion.view`, `revenue.promotion.create`, `revenue.promotion.edit`

### Price History (`/revenue/price-history`)

Audit trail of all price changes:
- Price, source (color-coded), reason, timestamp, user
- "Current" badge for open rows (effectiveTo === null)
- Filter by product type and date range

**Permission:** `revenue.pricing.view`

### Rate Calendar (`/hotel/revenue/rates`)

Hotel rate plan management:
- Seasonal pricing with multiplier
- Rate calendar grid (next 30 days)
- Create/edit seasons

**Permission:** `revenue.pricing.view`, `revenue.pricing.edit`

## Permissions

11 revenue-specific permissions:

```
revenue.view                    — view revenue dashboard
revenue.pricing.view            — view pricing and rate plans
revenue.pricing.edit            — edit pricing and rate plans
revenue.promotion.view          — view promotions
revenue.promotion.create        — create promotions
revenue.promotion.edit          — edit promotions
revenue.demand.view             — view demand signals
revenue.recommendation.view     — view recommendations
revenue.recommendation.review   — approve/reject recommendations
revenue.simulation.create       — create price simulations
revenue.guardrails.edit         — edit revenue guardrails
```

## Service Layer

### Pricing Service

`src/domain/revenue/pricing-service.ts`

**Main functions:**
- `calculatePrice(ctx)` — ONE pricing engine
- `createPromotion()`, `updatePromotion()`, `listPromotions()` — promotion CRUD
- `createSeason()`, `listSeasons()` — season management
- `evaluateDemand()` — calculate demand signals
- `generateRecommendations()` — deterministic recommendations
- `simulatePrice()` — what-if pricing simulation
- `setChannelPricing()`, `listChannelPricing()` — channel-specific rates
- `getRevenueDashboard()` — dashboard aggregation
- `recordPriceChange()`, `listPriceHistory()` — audit trail

**Demo data:**
- `seedRevenueDemoData(orgId, propId)` — seeds promotions, seasons, demand signals, recommendations, guardrails
- `ensureRevenueDemoSeeded(orgId, propId)` — idempotent seed on first load

## Data Flow

### Price Calculation

1. Screen calls `calculatePrice(ctx)` with full context
2. Service reads base price from Supabase (room_rates, menu_item_prices, event_packages)
3. Service applies seasonal multiplier (if active season matches date)
4. Service applies channel pricing (if channel-specific rate exists)
5. Service applies promotions (if applicable promotion found)
6. Service enforces guardrails (min/max bounds)
7. Service records price history
8. Service returns `PriceResult` with full audit trail

### Recommendation Generation

1. Screen calls `generateRecommendations(orgId, propId)`
2. Service evaluates demand signals (occupancy, bookings, inventory)
3. Service compares current rates to historical trends
4. Service generates deterministic recommendations with evidence
5. All recommendations labeled as "suggested review" — never "automatically increase"
6. User reviews and approves/rejects

### Price Snapshot

1. When a reservation/bill/order is created, `calculatePrice()` is called
2. Result includes `priceSnapshotId`
3. Snapshot is frozen on the transaction
4. Future price changes do NOT affect historical transactions
5. Audit trail shows what price was charged and why

## What-If Simulation

Simulations are clearly marked with `isSimulation: true`:

```typescript
simulatePrice(orgId, propId, scenario: SimulationScenario): PriceSimulation
```

**Scenario types:**
- `RATE_CHANGE` — what if we increase/decrease rates by X%?
- `PROMOTION` — what if we launch a Y% discount promotion?
- `SEASONAL` — what if we add a peak season with Z multiplier?
- `OCCUPANCY` — what if occupancy reaches N%?

**Output:**
- Estimated revenue impact
- Estimated occupancy impact
- Confidence level
- Clearly labeled as SIMULATION, never confused with actual prices

## Guardrails

Revenue guardrails prevent pricing errors:

- **Minimum price** — never price below ₹X
- **Maximum discount** — never discount more than Y%
- **Rate change approval threshold** — changes > Z% require approval
- **Promotion stacking limit** — max N promotions per transaction
- **Minimum advance purchase** — require N hours advance booking
- **Maximum rate increase** — never increase rates by more than X%

## Demo Data

The revenue service seeds demo data on first load:

**Promotions:**
- Summer Special (15% off, active)
- Weekend Getaway (₹3,500 rate override, active)
- Corporate Rate (20% off, active)

**Seasons:**
- Peak Season (Dec-Jan, 1.35x multiplier)
- Festive Season (Oct 15-Nov 15, 1.25x multiplier)

**Demand signals:**
- Deluxe Room: HIGH demand (82% occupancy)

**Recommendations:**
- Increase weekend rates for Deluxe Room (HIGH priority)
- Create mid-week promotion (MEDIUM priority)

**Guardrails:**
- Minimum price: ₹1,500
- Maximum discount: 40%
- Rate change approval threshold: 20%

## Future Enhancements

**Not in V1:**
- ML-based demand forecasting
- Competitor rate scraping
- Autonomous pricing (auto-apply recommendations)
- Multi-property revenue optimization
- Real-time demand-based pricing
- Integration with external revenue management systems

**Potential V2:**
- Price elasticity modeling
- Market segment optimization
- Group/corporate rate negotiation tools
- Revenue forecasting with confidence intervals
- Integration with channel managers for OTA rate parity

## References

- Prompt #27 spec — full 2480-line specification
- `src/domain/revenue/types.ts` — domain types
- `src/domain/revenue/pricing-service.ts` — pricing engine
- `src/pages/revenue/` — UI screens
- Hotel PMS — room_rates, rate plans
- Restaurant — menu_item_prices
- Events — event_packages
