# Pricing Architecture

> ONE pricing engine, ONE rate-plan architecture, ONE promotion architecture

## Design Principles

### Unification

All pricing — hotel rooms, restaurant menu items, event packages, commerce products — flows through a single pricing calculation service. No domain has its own pricing logic. No screen calculates prices independently. No promotion engine duplicates another.

### Determinism

Every price is traceable. Every adjustment is recorded. Every recommendation is evidence-based. No black boxes. No ML. No autonomous pricing. The owner decides.

### Immutability

Historical transactions freeze the price at booking time. Price snapshots are immutable. Future price changes never affect past transactions. The audit trail shows what was charged and why.

### Transparency

Price sources are tracked. Adjustments are itemized. Guardrails are visible. Simulations are labeled as SIMULATION. Recommendations are labeled as "suggested review." Nothing is hidden.

## Pricing Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│ 1. BASE PRICE                                               │
│    - Room rates (room_rates table)                          │
│    - Menu item prices (menu_item_prices table)              │
│    - Event package prices (event_packages table)            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. SEASONAL MULTIPLIER                                      │
│    - Peak season: 1.35x                                     │
│    - Festive season: 1.25x                                  │
│    - Off-peak: 0.85x                                        │
│    - Recurring yearly (MM-DD to MM-DD)                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. CHANNEL PRICING                                          │
│    - Direct booking: base rate                              │
│    - OTA (Booking.com): base + 15% commission               │
│    - Corporate: negotiated rate                             │
│    - Walk-in: base rate                                     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. PROMOTIONS                                               │
│    - PERCENTAGE: 15% off                                    │
│    - FIXED: ₹500 off                                        │
│    - RATE_OVERRIDE: ₹3,500/night (replaces base)            │
│    - FREE_ITEM: complimentary breakfast                     │
│    - PACKAGE: room + dinner bundle                          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. GUARDRAILS                                               │
│    - Minimum price: ₹1,500                                  │
│    - Maximum discount: 40%                                  │
│    - Rate change approval threshold: 20%                    │
│    - Promotion stacking limit: 2                            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. TAX (placeholder — no tax module yet)                    │
│    - GST 18% (frozen, not calculated)                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ FINAL PRICE + AUDIT TRAIL                                   │
│    - finalPrice: "5100.00"                                  │
│    - basePrice: "4500.00"                                   │
│    - source: "PROMOTION"                                    │
│    - adjustments: [                                         │
│        { type: "SEASONAL", amount: "1125.00", ... },        │
│        { type: "PROMOTION", amount: "-675.00", ... }        │
│      ]                                                      │
│    - priceSnapshotId: "snap_123456"                         │
│    - isSimulation: false                                    │
└─────────────────────────────────────────────────────────────┘
```

## Price Sources

Every price has a source that explains where it came from:

| Source | Description | Example |
|--------|-------------|---------|
| `BASE` | Base price from pricing tables | Menu item: ₹450 |
| `RATE_PLAN` | Rate plan override | CORPORATE rate: ₹3,800/night |
| `PROMOTION` | Active promotion discount | Summer Special: 15% off |
| `MANUAL` | Manually overridden by user | Front desk: ₹4,000 (negotiated) |
| `RULE` | Price rule applied | Weekend surcharge: +₹500 |
| `CONTRACT` | Contracted rate | Corporate contract: ₹3,500/night |
| `PACKAGE` | Package deal pricing | Room + dinner: ₹6,500 |
| `CHANNEL` | Channel-specific pricing | OTA rate: ₹4,800 (includes commission) |

## Price Adjustment Types

Every adjustment in the audit trail has a type:

| Type | Description | Example |
|------|-------------|---------|
| `SEASONAL` | Seasonal multiplier | Peak season: +₹1,125 (1.35x) |
| `CHANNEL` | Channel pricing | OTA commission: +₹675 |
| `PROMOTION` | Promotion discount | Summer Special: -₹675 (15%) |
| `RULE` | Price rule | Weekend surcharge: +₹500 |
| `MANUAL` | Manual override | Negotiated: -₹500 |
| `GUARDRAIL` | Guardrail enforcement | Min price: +₹500 (floor) |
| `TAX` | Tax (placeholder) | GST 18%: +₹918 |

## Rate Plans (Hotel)

Rate plans are stored in `room_rates` (Supabase):

```typescript
{
  id: string,
  organizationId: string,
  propertyId: string,
  ratePlanCode: "BAR" | "CORP" | "WEEKEND" | "PACKAGE" | ...,
  roomTypeId: string,
  baseRate: string,
  currency: string,
  effectiveFrom: string,  // date
  effectiveTo: string | null,  // null = current
  minimumStay: number | null,
  advancePurchaseHours: number | null,
  closedToArrival: boolean,
  closedToDeparture: boolean,
}
```

**Rate plan codes:**
- `BAR` — Best Available Rate (dynamic base rate)
- `CORP` — Corporate rate (negotiated)
- `WEEKEND` — Weekend rate (Fri-Sun)
- `WEEKDAY` — Weekday rate (Mon-Thu)
- `PACKAGE` — Package rate (room + extras)
- `CONTRACT` — Contracted rate (long-term agreement)
- `PROMO` — Promotional rate

## Promotions

Promotions are stored in-memory (revenue service):

```typescript
{
  id: string,
  organizationId: string,
  propertyId: string,
  name: string,
  code: string,  // e.g., "SUMMER2026"
  type: PromotionType,
  status: PromotionStatus,
  discountPercentage?: string,
  discountAmount?: string,
  rateOverrideAmount?: string,
  startDate: string,
  endDate: string,
  scope: PromotionScope,
  stackingRules: {
    allowStacking: boolean,
    maxStackCount?: number,
  },
  usageCount: number,
  totalDiscountAmount: string,
}
```

**Promotion types:**
- `PERCENTAGE` — X% off (e.g., 15% off)
- `FIXED` — ₹X off (e.g., ₹500 off)
- `RATE_OVERRIDE` — replace base rate with ₹X (e.g., ₹3,500/night)
- `FREE_ITEM` — complimentary item (e.g., free breakfast)
- `PACKAGE` — bundle deal (e.g., room + dinner for ₹6,500)

**Promotion scope:**
- `PROPERTY` — applies to entire property
- `OUTLET` — applies to specific outlet
- `PRODUCT` — applies to specific products (room types, menu items)
- `CUSTOMER_TYPE` — applies to customer segment (CORPORATE, LOYALTY_GOLD)
- `CHANNEL` — applies to booking channel (DIRECT, OTA)

**Stacking rules:**
- `allowStacking: false` — only one promotion per transaction
- `allowStacking: true, maxStackCount: 2` — up to 2 promotions can stack

## Seasons

Seasons are recurring yearly periods with price multipliers:

```typescript
{
  id: string,
  organizationId: string,
  propertyId: string,
  name: string,
  startDate: "MM-DD",  // e.g., "12-01" for Dec 1
  endDate: "MM-DD",    // e.g., "01-31" for Jan 31
  multiplier: string,  // e.g., "1.35" for 35% increase
  isActive: boolean,
}
```

**Example seasons:**
- Peak Season: Dec 1 - Jan 31, multiplier 1.35
- Festive Season: Oct 15 - Nov 15, multiplier 1.25
- Off-Peak: Jun 1 - Aug 31, multiplier 0.85

## Channel Pricing

Channel-specific rates for different booking channels:

```typescript
{
  id: string,
  organizationId: string,
  propertyId: string,
  productId: string,
  channel: "DIRECT" | "BOOKING_COM" | "EXPEDIA" | "MAKE_MY_TRIP" | ...,
  rateType: "FIXED" | "PERCENTAGE" | "COMMISSION",
  fixedRate?: string,
  percentageAdjustment?: string,
  commissionPercentage?: string,
}
```

**Example:**
- Direct: base rate (no adjustment)
- Booking.com: base + 15% commission
- Corporate: negotiated rate (fixed)

## Demand Signals

Demand signals evaluate occupancy and booking pace:

```typescript
{
  id: string,
  organizationId: string,
  propertyId: string,
  productType: "ROOM" | "MENU_ITEM" | "EVENT_PACKAGE",
  productId: string,
  date: string,
  demandLevel: "LOW" | "NORMAL" | "HIGH" | "VERY_HIGH",
  occupancy: string,  // percentage
  bookingsCount: number,
  availableInventory: number,
}
```

**Demand thresholds (configurable):**
- LOW: occupancy < 40%
- NORMAL: 40% ≤ occupancy < 75%
- HIGH: 75% ≤ occupancy < 90%
- VERY_HIGH: occupancy ≥ 90%

## Revenue Recommendations

Deterministic, evidence-based recommendations:

```typescript
{
  id: string,
  organizationId: string,
  propertyId: string,
  type: RecommendationType,
  priority: RecommendationPriority,
  status: RecommendationStatus,
  title: string,
  description: string,
  evidence: string[],
  impact: {
    estimatedRevenueIncrease: string,
    estimatedRevenueIncreasePercent: string,
    confidence: "LOW" | "MEDIUM" | "HIGH",
  },
  actionDetails: Record<string, any>,
  reviewedBy: string | null,
  reviewedAt: string | null,
  reviewNotes: string | null,
}
```

**Recommendation types:**
- `RATE_ADJUSTMENT` — increase/decrease rates
- `PROMOTION` — launch a promotion
- `INVENTORY` — adjust inventory allocation
- `CHANNEL` — adjust channel pricing
- `SEASONAL` — add/modify season

**Priority levels:**
- `LOW` — nice to have
- `MEDIUM` — should consider
- `HIGH` — important
- `URGENT` — time-sensitive

**All recommendations are labeled as "suggested review" — never "automatically increase."**

## Price Snapshots

When a transaction is created, the price is frozen:

```typescript
{
  id: string,
  organizationId: string,
  propertyId: string,
  productType: string,
  productId: string,
  calculatedAt: string,
  basePrice: string,
  finalPrice: string,
  source: PriceSource,
  adjustments: PriceAdjustment[],
  context: PricingContext,
}
```

**Snapshot flow:**
1. User books a room / places an order / creates an event
2. `calculatePrice()` is called with full context
3. Result includes `priceSnapshotId`
4. Snapshot is saved and linked to the transaction
5. Future price changes do NOT affect this transaction
6. Audit trail shows what was charged and why

## What-If Simulations

Simulations are clearly marked as SIMULATION:

```typescript
{
  id: string,
  organizationId: string,
  propertyId: string,
  name: string,
  scenario: SimulationScenario,
  isSimulation: true,  // always true
  estimatedRevenueImpact: string,
  estimatedOccupancyImpact: string,
  confidence: "LOW" | "MEDIUM" | "HIGH",
  createdAt: string,
  createdBy: string,
}
```

**Scenario types:**
- `RATE_CHANGE` — what if we increase/decrease rates by X%?
- `PROMOTION` — what if we launch a Y% discount promotion?
- `SEASONAL` — what if we add a peak season with Z multiplier?
- `OCCUPANCY` — what if occupancy reaches N%?

**Simulations are never confused with actual prices.**

## Guardrails

Guardrails prevent pricing errors:

```typescript
{
  id: string,
  organizationId: string,
  propertyId: string,
  minimumPrice: string,
  maximumDiscountPercentage: string,
  rateChangeApprovalThreshold: string,
  promotionStackingLimit: number,
  minimumAdvancePurchase: number,
  maximumRateIncreasePercentage: string,
}
```

**Guardrail enforcement:**
- If calculated price < minimumPrice → floor to minimumPrice
- If discount > maximumDiscountPercentage → cap at maximum
- If rate change > rateChangeApprovalThreshold → flag for approval
- If promotions > promotionStackingLimit → reject excess promotions
- If advance purchase < minimumAdvancePurchase → reject booking
- If rate increase > maximumRateIncreasePercentage → flag for approval

## Price History

Every price change is recorded:

```typescript
{
  id: string,
  organizationId: string,
  propertyId: string,
  productType: string,
  productId: string,
  previousPrice: string,
  newPrice: string,
  source: PriceSource,
  reason: string,
  effectiveFrom: string,
  effectiveTo: string | null,  // null = current
  changedBy: string,
  changedAt: string,
}
```

**Price history flow:**
1. User changes a price (manual override, promotion, rate plan update)
2. Previous row's `effectiveTo` is set to now
3. New row is created with `effectiveTo: null` (current)
4. Audit trail shows who changed what, when, and why

## API Reference

### calculatePrice

```typescript
async function calculatePrice(ctx: PricingContext): Promise<PriceResult>
```

Calculate the final price for a product given the full context.

**Parameters:**
- `ctx: PricingContext` — full pricing context

**Returns:**
- `PriceResult` — final price with audit trail

**Example:**
```typescript
const result = await calculatePrice({
  organizationId: "org_123",
  propertyId: "prop_456",
  productType: "ROOM",
  productId: "room_deluxe",
  date: "2026-10-15",
  customerType: "CORPORATE",
  channel: "DIRECT",
  ratePlanCode: "CORP",
});

console.log(result.finalPrice);  // "3800.00"
console.log(result.source);      // "RATE_PLAN"
console.log(result.adjustments); // [{ type: "SEASONAL", amount: "950.00", ... }]
```

### createPromotion

```typescript
function createPromotion(promo: Omit<Promotion, "id" | "usageCount" | "totalDiscountAmount" | "createdAt">): Promotion
```

Create a new promotion.

### listPromotions

```typescript
function listPromotions(orgId: EntityId, propId: EntityId, status?: PromotionStatus): Promotion[]
```

List promotions with optional status filter.

### simulatePrice

```typescript
function simulatePrice(orgId: EntityId, propId: EntityId, scenario: SimulationScenario): PriceSimulation
```

Run a what-if pricing simulation.

### generateRecommendations

```typescript
function generateRecommendations(orgId: EntityId, propId: EntityId): RevenueRecommendation[]
```

Generate deterministic revenue recommendations.

## Migration Path

**Existing pricing tables (Supabase):**
- `room_rates` — hotel rate plans
- `menu_item_prices` — restaurant menu prices
- `event_packages` — event package prices

**New revenue layer (in-memory):**
- Promotions
- Seasons
- Demand signals
- Recommendations
- Guardrails
- Simulations
- Price history

**No migration needed** — the revenue layer reads from existing tables and adds new capabilities in-memory.

## Future Enhancements

**Not in V1:**
- Tax calculation (no tax module yet)
- Multi-currency support
- ML-based demand forecasting
- Competitor rate scraping
- Autonomous pricing
- Real-time demand-based pricing

**Potential V2:**
- Price elasticity modeling
- Market segment optimization
- Group/corporate rate negotiation
- Revenue forecasting with confidence intervals
- Integration with channel managers

## References

- `src/domain/revenue/types.ts` — domain types
- `src/domain/revenue/pricing-service.ts` — pricing engine
- `src/pages/revenue/` — UI screens
- REVENUE_MANAGEMENT.md — revenue management overview
- Hotel PMS — room_rates, rate plans
- Restaurant — menu_item_prices
- Events — event_packages
