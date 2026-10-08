/**
 * Revenue Management domain types (Prompt #27).
 *
 * Unified pricing architecture: ONE pricing calculation service, ONE rate-plan
 * architecture, ONE promotion architecture. Extends existing pricing models
 * (RoomRate, MenuItemPrice, EventPackage) without duplicating them.
 *
 * Money is represented as `string` to match the restaurant/billing pattern.
 * Hotel uses `number` for historical reasons; new revenue types use `string`
 * for consistency with the more common pattern.
 */

import type { EntityId } from "@/domain/identity/types";

// =====================================================================
// PRICE SOURCE TRACKING
// =====================================================================

/**
 * Where a price came from. Every price row records its source so the audit
 * trail can answer "why is this item ₹X?" without reverse-engineering rules.
 */
export type PriceSource =
  | "BASE"           // Default list price, no rules applied
  | "RATE_PLAN"      // Hotel rate plan (BAR, CORPORATE, WEEKEND, etc.)
  | "PROMOTION"      // Active promotion or discount
  | "MANUAL"         // Human override (requires reason)
  | "RULE"           // Price rule (seasonal, occupancy-based, etc.)
  | "CONTRACT"       // Corporate contract or negotiated rate
  | "PACKAGE"        // Bundled package price
  | "CHANNEL";       // Channel-specific pricing (OTA, website, walk-in)

// =====================================================================
// PRICING CONTEXT
// =====================================================================

/**
 * The full context needed to calculate a price. Every factor that can influence
 * the final selling price is captured here so the pricing engine has one input
 * shape and the audit trail can replay any calculation.
 */
export type PricingContext = {
  organizationId: EntityId;
  propertyId: EntityId;
  outletId?: EntityId;              // Restaurant/events only
  productId: EntityId;              // roomId, menuItemId, packageId, etc.
  productType: "ROOM" | "MENU_ITEM" | "EVENT_PACKAGE" | "SERVICE";
  date: string;                     // ISO date (YYYY-MM-DD)
  time?: string;                    // ISO time (HH:MM) for time-based pricing
  customerType?: CustomerType;
  channel?: Channel;
  ratePlanId?: EntityId;            // Hotel only
  occupancy?: number;               // Hotel: guests in room
  quantity?: number;                // Restaurant: item quantity
  duration?: number;                // Hotel: nights; Events: hours
  promotionIds?: EntityId[];        // Explicit promotions to apply
  loyaltyTier?: string;             // CRM loyalty tier
  corporateAccountId?: EntityId;    // CRM corporate account
};

export type CustomerType =
  | "WALK_IN"
  | "LOYALTY"
  | "CORPORATE"
  | "GOVERNMENT"
  | "OTA"
  | "CONTRACT"
  | "MEMBER";

export type Channel =
  | "WALK_IN"
  | "WEBSITE"
  | "OTA"
  | "PHONE"
  | "EMAIL"
  | "MOBILE_APP"
  | "TRAVEL_AGENT"
  | "CORPORATE_PORTAL";

// =====================================================================
// PRICE CALCULATION RESULT
// =====================================================================

/**
 * One adjustment applied during price calculation. The audit trail stores
 * these so a price can be replayed and explained.
 */
export type PriceAdjustment = {
  type: "DISCOUNT" | "SURCHARGE" | "TAX" | "RULE" | "PROMOTION";
  label: string;
  amount: string;                   // Absolute amount (₹)
  percentage?: string;              // If percentage-based
  reason: string;                   // Human-readable explanation
  source: PriceSource;
  referenceId?: EntityId;           // Promotion ID, rule ID, etc.
};

/**
 * The result of a price calculation. Includes the base price, all adjustments,
 * the final selling price, and the full audit trail of how it was calculated.
 */
export type PriceResult = {
  productId: EntityId;
  productType: PricingContext["productType"];
  basePrice: string;                // Before any adjustments
  adjustments: PriceAdjustment[];
  finalPrice: string;               // After all adjustments
  currency: string;
  context: PricingContext;
  calculatedAt: string;             // ISO timestamp
  validUntil?: string;              // Price lock expiry (for quotes)
  source: PriceSource;              // Dominant source (highest priority adjustment)
};

// =====================================================================
// PRICE HISTORY
// =====================================================================

/**
 * One row in the price history. Every price change creates a new row with
 * effectiveFrom/effectiveTo range. The open row (effectiveTo = null) is current.
 */
export type PriceHistory = {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  outletId?: EntityId;
  productId: EntityId;
  productType: PricingContext["productType"];
  unitPrice: string;
  currency: string;
  effectiveFrom: string;            // ISO timestamp
  effectiveTo: string | null;       // null = current
  source: PriceSource;
  reason: string;                   // Why the price changed
  changedBy: EntityId;
  changedAt: string;                // ISO timestamp
  metadata?: Record<string, unknown>; // Promotion ID, rate plan ID, etc.
};

// =====================================================================
// PROMOTIONS
// =====================================================================

export type PromotionType =
  | "PERCENTAGE"      // X% off
  | "FIXED"           // ₹X off
  | "FREE_ITEM"       // Buy X get Y free
  | "PACKAGE"         // Bundled price
  | "RATE_OVERRIDE";  // Specific price (e.g., corporate rate)

export type PromotionScope =
  | "ALL"             // Everything
  | "DOMAIN"          // Hotel, Restaurant, Events
  | "PROPERTY"        // One property
  | "OUTLET"          // One outlet
  | "PRODUCT"         // Specific product (room type, menu item, package)
  | "CATEGORY";       // Product category

export type PromotionStatus = "DRAFT" | "ACTIVE" | "SCHEDULED" | "EXPIRED" | "ARCHIVED";

export type Promotion = {
  id: EntityId;
  organizationId: EntityId;
  propertyId?: EntityId;              // null = all properties
  outletId?: EntityId;                // null = all outlets
  code: string;                       // Promo code (e.g., "SUMMER20")
  name: string;
  description: string | null;
  type: PromotionType;
  scope: PromotionScope;
  scopeValue?: string;                // Product ID, category, domain, etc.
  discountPercentage?: string;        // For PERCENTAGE type
  discountAmount?: string;            // For FIXED type
  freeItemId?: EntityId;              // For FREE_ITEM type
  freeItemQuantity?: number;          // For FREE_ITEM type
  overridePrice?: string;             // For RATE_OVERRIDE type
  minimumSpend?: string;              // Minimum order value to qualify
  minimumQuantity?: number;           // Minimum items to qualify
  maximumDiscount?: string;           // Cap on discount amount
  startDate: string;                  // ISO timestamp
  endDate: string;                    // ISO timestamp
  status: PromotionStatus;
  priority: number;                   // Higher = applied first
  stackable: boolean;                 // Can combine with other promotions?
  usageLimit?: number;                // Total uses allowed
  usageCount: number;                 // How many times used
  perCustomerLimit?: number;          // Uses per customer
  autoApply: boolean;                 // Apply automatically or require code?
  createdAt: string;
  createdBy: EntityId;
  updatedAt: string;
  updatedBy: EntityId;
};

// =====================================================================
// SEASONAL PRICING
// =====================================================================

export type Season = {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  name: string;                       // "Peak Season", "Monsoon", "Holiday Season"
  startDate: string;                  // ISO date (MM-DD, recurring yearly)
  endDate: string;                    // ISO date (MM-DD, recurring yearly)
  multiplier: string;                 // Price multiplier (e.g., "1.25" = 25% higher)
  priority: number;                   // Overlap resolution
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

// =====================================================================
// DEMAND SIGNALS & YIELD INTELLIGENCE
// =====================================================================

export type DemandLevel = "LOW" | "NORMAL" | "HIGH" | "VERY_HIGH";

/**
 * Demand signal for a product/date combination. Calculated from occupancy,
 * booking pace, historical patterns. Used for yield recommendations.
 */
export type DemandSignal = {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  productId: EntityId;
  productType: PricingContext["productType"];
  date: string;
  demandLevel: DemandLevel;
  occupancyPercentage?: string;       // Hotel: room occupancy %
  bookingPace?: string;               // Bookings per day vs historical average
  leadTime?: number;                  // Days until date
  competitorOccupancy?: string;       // If available (not scraped, manual entry)
  calculatedAt: string;
  metadata?: Record<string, unknown>;
};

/**
 * Demand threshold configuration. When occupancy crosses these thresholds,
 * the demand level changes. Configurable per property.
 */
export type DemandThresholds = {
  organizationId: EntityId;
  propertyId: EntityId;
  lowThreshold: number;               // Below this = LOW (e.g., 40%)
  normalThreshold: number;            // Below this = NORMAL (e.g., 70%)
  highThreshold: number;              // Below this = HIGH (e.g., 85%)
  // Above highThreshold = VERY_HIGH
  updatedAt: string;
};

// =====================================================================
// REVENUE RECOMMENDATIONS
// =====================================================================

export type RecommendationType =
  | "INCREASE_PRICE"
  | "DECREASE_PRICE"
  | "ADD_PROMOTION"
  | "REMOVE_PROMOTION"
  | "ADJUST_OCCUPANCY_THRESHOLD"
  | "REVIEW_RATE_PLAN";

export type RecommendationPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

/**
 * A revenue recommendation. Deterministic, evidence-based, labeled as
 * "suggested review" — never "automatically increase". The owner decides.
 */
export type RevenueRecommendation = {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  productId?: EntityId;
  type: RecommendationType;
  priority: RecommendationPriority;
  title: string;
  description: string;
  rationale: string;                  // Evidence: occupancy, demand level, etc.
  suggestedAction: string;            // "Increase rate by 15%" or "Add weekend promotion"
  currentValue?: string;              // Current price/rate
  suggestedValue?: string;            // Suggested price/rate
  expectedImpact?: string;            // "Estimated +₹50,000/month revenue"
  evidence: Record<string, unknown>;  // Raw data supporting the recommendation
  createdAt: string;
  expiresAt: string;                  // Recommendations expire
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "EXPIRED";
  reviewedBy?: EntityId;
  reviewedAt?: string;
};

// =====================================================================
// PRICE GUARDRAILS
// =====================================================================

/**
 * Guardrails to prevent pricing errors. Every price calculation checks these
 * before returning a result. Violations are logged, not blocked (the human
 * can override with a reason).
 */
export type RevenueGuardrails = {
  organizationId: EntityId;
  propertyId: EntityId;
  minimumPrice?: string;              // Never sell below this (cost + margin)
  maximumDiscountPercentage?: string; // Never discount more than X%
  maximumDiscountAmount?: string;     // Never discount more than ₹X
  approvalThresholdPercentage?: string; // Discounts > X% require approval
  approvalThresholdAmount?: string;   // Discounts > ₹X require approval
  updatedAt: string;
  updatedBy: EntityId;
};

// =====================================================================
// PRICE SIMULATION (WHAT-IF)
// =====================================================================

export type SimulationScenario = {
  name: string;
  description: string;
  adjustments: {
    basePriceChange?: string;         // "+10%" or "-₹50"
    occupancyChange?: string;         // "+5%" or "-10%"
    addPromotion?: Partial<Promotion>;
    removePromotionId?: EntityId;
    seasonMultiplier?: string;
  };
};

export type PriceSimulation = {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  name: string;
  description: string;
  scenario: SimulationScenario;
  results: {
    currentRevenue: string;
    projectedRevenue: string;
    revenueChange: string;
    revenueChangePercentage: string;
    occupancyImpact?: string;
    breakdown: Record<string, string>; // Product-level breakdown
  };
  createdAt: string;
  createdBy: EntityId;
  isSimulation: true;                 // Always labeled as SIMULATION
};

// =====================================================================
// RATE PLANS (HOTEL)
// =====================================================================

/**
 * Extended rate plan with revenue management fields. Complements the existing
 * RatePlan type in hotel/types.ts by adding revenue-specific configuration.
 */
export type RatePlanRevenueConfig = {
  ratePlanId: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  channelRestrictions?: Channel[];    // Which channels can use this rate
  minimumAdvancePurchase?: number;    // Days before arrival
  maximumAdvancePurchase?: number;    // Days before arrival
  lengthOfStayRestriction?: number;   // Minimum nights
  weekendSurcharge?: string;          // Friday/Saturday surcharge %
  corporateAccountId?: EntityId;      // If CONTRACT type
  contractStartDate?: string;         // For corporate contracts
  contractEndDate?: string;
  updatedAt: string;
};

// =====================================================================
// CHANNEL PRICING
// =====================================================================

/**
 * Channel-specific pricing. Allows different prices for walk-in, website,
 * OTA, etc. Complements existing rate plans.
 */
export type ChannelPricing = {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  productId: EntityId;
  productType: "ROOM" | "MENU_ITEM" | "EVENT_PACKAGE";
  channel: Channel;
  priceOverride?: string;             // Specific price for this channel
  discountPercentage?: string;        // Or percentage off base
  commissionPercentage?: string;      // OTA commission (for cost calculation)
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

// =====================================================================
// REVENUE DASHBOARD
// =====================================================================

export type RevenueDashboardData = {
  organizationId: EntityId;
  propertyId: EntityId;
  period: {
    startDate: string;
    endDate: string;
  };
  summary: {
    totalRevenue: string;
    roomRevenue: string;
    restaurantRevenue: string;
    eventRevenue: string;
    otherRevenue: string;
    currency: string;
  };
  occupancy: {
    currentOccupancy: string;
    averageOccupancy: string;
    occupancyTrend: { date: string; occupancy: string }[];
  };
  demand: {
    currentDemandLevel: DemandLevel;
    demandDistribution: Record<DemandLevel, number>;
  };
  recommendations: {
    pending: number;
    urgent: number;
    items: RevenueRecommendation[];
  };
  activePromotions: {
    count: number;
    totalDiscount: string;
    items: Promotion[];
  };
  priceChanges: {
    count: number;
    recentChanges: PriceHistory[];
  };
};
