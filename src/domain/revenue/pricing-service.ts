/**
 * Revenue Management pricing service (Prompt #27).
 *
 * ONE pricing calculation service that unifies hotel, restaurant, events, and
 * commerce pricing. Reads existing pricing data from Supabase (room_rates,
 * menu_item_prices) and stores revenue-specific data (promotions, demand signals,
 * recommendations, simulations) in memory.
 *
 * No autonomous pricing. No ML. No competitor scraping. Every recommendation is
 * deterministic, evidence-based, and labeled as "suggested review" — the owner
 * decides. Simulations are clearly marked as SIMULATION, never confused with
 * actual prices.
 */

import { requireSupabase } from "@/db/client";
import type { EntityId } from "@/domain/identity/types";
import type {
  PricingContext,
  PriceResult,
  PriceAdjustment,
  PriceSource,
  PriceHistory,
  Promotion,
  PromotionType,
  PromotionScope,
  PromotionStatus,
  Season,
  DemandSignal,
  DemandLevel,
  DemandThresholds,
  RevenueRecommendation,
  RevenueGuardrails,
  PriceSimulation,
  SimulationScenario,
  ChannelPricing,
  Channel,
  RevenueDashboardData,
} from "./types";

// =====================================================================
// IN-MEMORY STORES
// =====================================================================

const promotions = new Map<EntityId, Promotion>();
const seasons = new Map<EntityId, Season>();
const demandSignals = new Map<EntityId, DemandSignal>();
const demandThresholds = new Map<string, DemandThresholds>(); // key: `${orgId}:${propId}`
const recommendations = new Map<EntityId, RevenueRecommendation>();
const guardrails = new Map<string, RevenueGuardrails>(); // key: `${orgId}:${propId}`
const simulations = new Map<EntityId, PriceSimulation>();
const channelPricing = new Map<EntityId, ChannelPricing>();
const priceHistory = new Map<EntityId, PriceHistory>();

let idCounter = 1;
function generateId(): EntityId {
  return `rev_${Date.now()}_${idCounter++}`;
}

// =====================================================================
// PRICE CALCULATION ENGINE
// =====================================================================

/**
 * Calculate the final price for a product given the full context. This is the
 * ONE pricing engine that every domain uses. It reads base prices from Supabase,
 * applies rules/promotions/adjustments, and returns a PriceResult with full
 * audit trail.
 */
export async function calculatePrice(ctx: PricingContext): Promise<PriceResult> {
  const adjustments: PriceAdjustment[] = [];
  let basePrice = "0";
  let source: PriceSource = "BASE";

  // 1. Get base price from existing pricing tables
  if (ctx.productType === "ROOM") {
    const roomRate = await getRoomRate(ctx);
    basePrice = roomRate ?? "0";
    source = "RATE_PLAN";
  } else if (ctx.productType === "MENU_ITEM") {
    const menuPrice = await getMenuItemPrice(ctx);
    basePrice = menuPrice ?? "0";
    source = "BASE";
  } else if (ctx.productType === "EVENT_PACKAGE") {
    const packagePrice = await getEventPackagePrice(ctx);
    basePrice = packagePrice ?? "0";
    source = "BASE";
  }

  let currentPrice = Number(basePrice);

  // 2. Apply seasonal multiplier
  const season = findActiveSeason(ctx);
  if (season) {
    const multiplier = Number(season.multiplier);
    const seasonalAdjustment = currentPrice * (multiplier - 1);
    adjustments.push({
      type: "RULE",
      label: `Season: ${season.name}`,
      amount: seasonalAdjustment.toFixed(2),
      percentage: ((multiplier - 1) * 100).toFixed(1),
      reason: `Seasonal pricing: ${season.name}`,
      source: "RULE",
      referenceId: season.id,
    });
    currentPrice += seasonalAdjustment;
    source = "RULE";
  }

  // 3. Apply channel pricing
  if (ctx.channel) {
    const channelPrice = findChannelPricing(ctx);
    if (channelPrice) {
      if (channelPrice.priceOverride) {
        const override = Number(channelPrice.priceOverride);
        const diff = override - currentPrice;
        adjustments.push({
          type: "RULE",
          label: `Channel: ${ctx.channel}`,
          amount: diff.toFixed(2),
          reason: `Channel-specific pricing for ${ctx.channel}`,
          source: "CHANNEL",
          referenceId: channelPrice.id,
        });
        currentPrice = override;
        source = "CHANNEL";
      } else if (channelPrice.discountPercentage) {
        const discount = currentPrice * (Number(channelPrice.discountPercentage) / 100);
        adjustments.push({
          type: "DISCOUNT",
          label: `Channel discount: ${ctx.channel}`,
          amount: discount.toFixed(2),
          percentage: channelPrice.discountPercentage,
          reason: `Channel discount for ${ctx.channel}`,
          source: "CHANNEL",
          referenceId: channelPrice.id,
        });
        currentPrice -= discount;
      }
    }
  }

  // 4. Apply promotions
  const applicablePromotions = findApplicablePromotions(ctx);
  for (const promo of applicablePromotions) {
    const promoAdjustment = applyPromotion(promo, currentPrice);
    if (promoAdjustment) {
      adjustments.push(promoAdjustment);
      currentPrice += promoAdjustment.type === "DISCOUNT" ? -Number(promoAdjustment.amount) : Number(promoAdjustment.amount);
      source = "PROMOTION";
    }
  }

  // 5. Apply guardrails
  const guardrail = getGuardrails(ctx.organizationId, ctx.propertyId);
  if (guardrail) {
    if (guardrail.minimumPrice && currentPrice < Number(guardrail.minimumPrice)) {
      const diff = Number(guardrail.minimumPrice) - currentPrice;
      adjustments.push({
        type: "RULE",
        label: "Minimum price guardrail",
        amount: diff.toFixed(2),
        reason: `Price adjusted to minimum: ${guardrail.minimumPrice}`,
        source: "RULE",
      });
      currentPrice = Number(guardrail.minimumPrice);
    }
  }

  // 6. Apply tax (placeholder — no tax module yet)
  const taxAmount = 0; // TODO: Integrate with tax module when available
  if (taxAmount > 0) {
    adjustments.push({
      type: "TAX",
      label: "Tax",
      amount: taxAmount.toFixed(2),
      reason: "Applicable taxes",
      source: "BASE",
    });
    currentPrice += taxAmount;
  }

  return {
    productId: ctx.productId,
    productType: ctx.productType,
    basePrice,
    adjustments,
    finalPrice: currentPrice.toFixed(2),
    currency: "INR",
    context: ctx,
    calculatedAt: new Date().toISOString(),
    source,
  };
}

async function getRoomRate(ctx: PricingContext): Promise<string | null> {
  const sb = requireSupabase();
  const { data } = await sb
    .from("room_rates")
    .select("base_rate")
    .eq("organization_id", ctx.organizationId)
    .eq("property_id", ctx.propertyId)
    .eq("room_type_id", ctx.productId)
    .eq("rate_date", ctx.date)
    .maybeSingle();
  return data?.base_rate?.toString() ?? null;
}

async function getMenuItemPrice(ctx: PricingContext): Promise<string | null> {
  const sb = requireSupabase();
  const { data } = await sb
    .from("menu_item_prices")
    .select("unit_price")
    .eq("organization_id", ctx.organizationId)
    .eq("property_id", ctx.propertyId)
    .eq("menu_item_id", ctx.productId)
    .eq("effective_to", null)
    .maybeSingle();
  return data?.unit_price ?? null;
}

async function getEventPackagePrice(ctx: PricingContext): Promise<string | null> {
  const sb = requireSupabase();
  const { data } = await sb
    .from("event_packages")
    .select("base_price")
    .eq("id", ctx.productId)
    .maybeSingle();
  return data?.base_price?.toString() ?? null;
}

function findActiveSeason(ctx: PricingContext): Season | null {
  const date = new Date(ctx.date);
  const monthDay = `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  for (const season of seasons.values()) {
    if (season.organizationId !== ctx.organizationId || season.propertyId !== ctx.propertyId) continue;
    if (!season.isActive) continue;
    if (monthDay >= season.startDate && monthDay <= season.endDate) {
      return season;
    }
  }
  return null;
}

function findChannelPricing(ctx: PricingContext): ChannelPricing | null {
  if (!ctx.channel) return null;
  for (const cp of channelPricing.values()) {
    if (
      cp.organizationId === ctx.organizationId &&
      cp.propertyId === ctx.propertyId &&
      cp.productId === ctx.productId &&
      cp.channel === ctx.channel &&
      cp.isActive
    ) {
      return cp;
    }
  }
  return null;
}

function findApplicablePromotions(ctx: PricingContext): Promotion[] {
  const now = new Date();
  const applicable: Promotion[] = [];

  for (const promo of promotions.values()) {
    if (promo.organizationId !== ctx.organizationId) continue;
    if (promo.status !== "ACTIVE") continue;
    if (new Date(promo.startDate) > now || new Date(promo.endDate) < now) continue;
    if (promo.propertyId && promo.propertyId !== ctx.propertyId) continue;
    if (promo.outletId && promo.outletId !== ctx.outletId) continue;

    // Check scope
    if (promo.scope === "ALL") {
      applicable.push(promo);
    } else if (promo.scope === "PRODUCT" && promo.scopeValue === ctx.productId) {
      applicable.push(promo);
    }
    // TODO: Add DOMAIN, CATEGORY scope checks
  }

  // Sort by priority (higher first)
  return applicable.sort((a, b) => b.priority - a.priority);
}

function applyPromotion(promo: Promotion, currentPrice: number): PriceAdjustment | null {
  if (promo.type === "PERCENTAGE" && promo.discountPercentage) {
    const discount = currentPrice * (Number(promo.discountPercentage) / 100);
    return {
      type: "DISCOUNT",
      label: `Promotion: ${promo.name}`,
      amount: discount.toFixed(2),
      percentage: promo.discountPercentage,
      reason: `Percentage discount: ${promo.discountPercentage}%`,
      source: "PROMOTION",
      referenceId: promo.id,
    };
  } else if (promo.type === "FIXED" && promo.discountAmount) {
    return {
      type: "DISCOUNT",
      label: `Promotion: ${promo.name}`,
      amount: promo.discountAmount,
      reason: `Fixed discount: ₹${promo.discountAmount}`,
      source: "PROMOTION",
      referenceId: promo.id,
    };
  } else if (promo.type === "RATE_OVERRIDE" && promo.overridePrice) {
    const diff = Number(promo.overridePrice) - currentPrice;
    return {
      type: "DISCOUNT",
      label: `Promotion: ${promo.name}`,
      amount: Math.abs(diff).toFixed(2),
      reason: `Rate override: ₹${promo.overridePrice}`,
      source: "PROMOTION",
      referenceId: promo.id,
    };
  }
  return null;
}

// =====================================================================
// PRICE HISTORY
// =====================================================================

export function recordPriceChange(
  orgId: EntityId,
  propId: EntityId,
  productId: EntityId,
  productType: PricingContext["productType"],
  newPrice: string,
  source: PriceSource,
  reason: string,
  changedBy: EntityId,
  outletId?: EntityId,
): PriceHistory {
  // Close previous open row
  for (const history of priceHistory.values()) {
    if (
      history.productId === productId &&
      history.effectiveTo === null
    ) {
      history.effectiveTo = new Date().toISOString();
    }
  }

  const history: PriceHistory = {
    id: generateId(),
    organizationId: orgId,
    propertyId: propId,
    outletId,
    productId,
    productType,
    unitPrice: newPrice,
    currency: "INR",
    effectiveFrom: new Date().toISOString(),
    effectiveTo: null,
    source,
    reason,
    changedBy,
    changedAt: new Date().toISOString(),
  };
  priceHistory.set(history.id, history);
  return history;
}

export function listPriceHistory(
  orgId: EntityId,
  propId: EntityId,
  productId?: EntityId,
  limit = 50,
): PriceHistory[] {
  const results: PriceHistory[] = [];
  for (const history of priceHistory.values()) {
    if (history.organizationId !== orgId || history.propertyId !== propId) continue;
    if (productId && history.productId !== productId) continue;
    results.push(history);
  }
  return results
    .sort((a, b) => b.changedAt.localeCompare(a.changedAt))
    .slice(0, limit);
}

// =====================================================================
// PROMOTIONS CRUD
// =====================================================================

export function createPromotion(
  orgId: EntityId,
  data: {
    propertyId?: EntityId;
    outletId?: EntityId;
    code: string;
    name: string;
    description?: string | null;
    type: PromotionType;
    scope: PromotionScope;
    scopeValue?: string;
    discountPercentage?: string;
    discountAmount?: string;
    freeItemId?: EntityId;
    freeItemQuantity?: number;
    overridePrice?: string;
    minimumSpend?: string;
    minimumQuantity?: number;
    maximumDiscount?: string;
    startDate: string;
    endDate: string;
    priority?: number;
    stackable?: boolean;
    usageLimit?: number;
    perCustomerLimit?: number;
    autoApply?: boolean;
    createdBy: EntityId;
  },
): Promotion {
  const now = new Date().toISOString();
  const promo: Promotion = {
    id: generateId(),
    organizationId: orgId,
    propertyId: data.propertyId,
    outletId: data.outletId,
    code: data.code,
    name: data.name,
    description: data.description ?? null,
    type: data.type,
    scope: data.scope,
    scopeValue: data.scopeValue,
    discountPercentage: data.discountPercentage,
    discountAmount: data.discountAmount,
    freeItemId: data.freeItemId,
    freeItemQuantity: data.freeItemQuantity,
    overridePrice: data.overridePrice,
    minimumSpend: data.minimumSpend,
    minimumQuantity: data.minimumQuantity,
    maximumDiscount: data.maximumDiscount,
    startDate: data.startDate,
    endDate: data.endDate,
    status: "ACTIVE",
    priority: data.priority ?? 0,
    stackable: data.stackable ?? false,
    usageLimit: data.usageLimit,
    usageCount: 0,
    perCustomerLimit: data.perCustomerLimit,
    autoApply: data.autoApply ?? true,
    createdAt: now,
    createdBy: data.createdBy,
    updatedAt: now,
    updatedBy: data.createdBy,
  };
  promotions.set(promo.id, promo);
  return promo;
}

export function updatePromotion(
  promoId: EntityId,
  updates: Partial<Promotion>,
  updatedBy: EntityId,
): Promotion | null {
  const promo = promotions.get(promoId);
  if (!promo) return null;
  const updated = { ...promo, ...updates, updatedAt: new Date().toISOString(), updatedBy };
  promotions.set(promoId, updated);
  return updated;
}

export function listPromotions(
  orgId: EntityId,
  propertyId?: EntityId,
  status?: PromotionStatus,
): Promotion[] {
  const results: Promotion[] = [];
  for (const promo of promotions.values()) {
    if (promo.organizationId !== orgId) continue;
    if (propertyId && promo.propertyId && promo.propertyId !== propertyId) continue;
    if (status && promo.status !== status) continue;
    results.push(promo);
  }
  return results.sort((a, b) => b.priority - a.priority);
}

export function getPromotion(promoId: EntityId): Promotion | null {
  return promotions.get(promoId) ?? null;
}

// =====================================================================
// SEASONS CRUD
// =====================================================================

export function createSeason(
  orgId: EntityId,
  propId: EntityId,
  data: {
    name: string;
    startDate: string;
    endDate: string;
    multiplier: string;
    priority?: number;
    isActive?: boolean;
  },
): Season {
  const now = new Date().toISOString();
  const season: Season = {
    id: generateId(),
    organizationId: orgId,
    propertyId: propId,
    name: data.name,
    startDate: data.startDate,
    endDate: data.endDate,
    multiplier: data.multiplier,
    priority: data.priority ?? 0,
    isActive: data.isActive ?? true,
    createdAt: now,
    updatedAt: now,
  };
  seasons.set(season.id, season);
  return season;
}

export function listSeasons(orgId: EntityId, propId: EntityId): Season[] {
  const results: Season[] = [];
  for (const season of seasons.values()) {
    if (season.organizationId === orgId && season.propertyId === propId) {
      results.push(season);
    }
  }
  return results.sort((a, b) => a.priority - b.priority);
}

// =====================================================================
// DEMAND SIGNALS
// =====================================================================

export function evaluateDemand(
  orgId: EntityId,
  propId: EntityId,
  productId: EntityId,
  productType: PricingContext["productType"],
  date: string,
  occupancyPercentage?: number,
): DemandSignal {
  const thresholds = getDemandThresholds(orgId, propId);
  let demandLevel: DemandLevel = "NORMAL";

  if (occupancyPercentage !== undefined) {
    if (occupancyPercentage < thresholds.lowThreshold) {
      demandLevel = "LOW";
    } else if (occupancyPercentage < thresholds.normalThreshold) {
      demandLevel = "NORMAL";
    } else if (occupancyPercentage < thresholds.highThreshold) {
      demandLevel = "HIGH";
    } else {
      demandLevel = "VERY_HIGH";
    }
  }

  const signal: DemandSignal = {
    id: generateId(),
    organizationId: orgId,
    propertyId: propId,
    productId,
    productType,
    date,
    demandLevel,
    occupancyPercentage: occupancyPercentage?.toFixed(1),
    calculatedAt: new Date().toISOString(),
  };
  demandSignals.set(signal.id, signal);
  return signal;
}

export function getDemandThresholds(orgId: EntityId, propId: EntityId): DemandThresholds {
  const key = `${orgId}:${propId}`;
  return demandThresholds.get(key) ?? {
    organizationId: orgId,
    propertyId: propId,
    lowThreshold: 40,
    normalThreshold: 70,
    highThreshold: 85,
    updatedAt: new Date().toISOString(),
  };
}

export function setDemandThresholds(
  orgId: EntityId,
  propId: EntityId,
  thresholds: { lowThreshold: number; normalThreshold: number; highThreshold: number },
): DemandThresholds {
  const key = `${orgId}:${propId}`;
  const updated: DemandThresholds = {
    organizationId: orgId,
    propertyId: propId,
    ...thresholds,
    updatedAt: new Date().toISOString(),
  };
  demandThresholds.set(key, updated);
  return updated;
}

// =====================================================================
// REVENUE RECOMMENDATIONS
// =====================================================================

export function generateRecommendations(
  orgId: EntityId,
  propId: EntityId,
): RevenueRecommendation[] {
  const recs: RevenueRecommendation[] = [];

  // Analyze demand signals
  for (const signal of demandSignals.values()) {
    if (signal.organizationId !== orgId || signal.propertyId !== propId) continue;

    if (signal.demandLevel === "VERY_HIGH" && signal.occupancyPercentage) {
      recs.push({
        id: generateId(),
        organizationId: orgId,
        propertyId: propId,
        productId: signal.productId,
        type: "INCREASE_PRICE",
        priority: "HIGH",
        title: "High demand detected",
        description: `Occupancy at ${signal.occupancyPercentage}% on ${signal.date}`,
        rationale: "Demand significantly exceeds supply. Consider increasing rates to optimize revenue.",
        suggestedAction: "Increase rate by 10-15%",
        evidence: { occupancy: signal.occupancyPercentage, demandLevel: signal.demandLevel },
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        status: "PENDING",
      });
    } else if (signal.demandLevel === "LOW" && signal.occupancyPercentage) {
      recs.push({
        id: generateId(),
        organizationId: orgId,
        propertyId: propId,
        productId: signal.productId,
        type: "ADD_PROMOTION",
        priority: "MEDIUM",
        title: "Low occupancy detected",
        description: `Occupancy at ${signal.occupancyPercentage}% on ${signal.date}`,
        rationale: "Demand is below target. Consider a promotion to stimulate bookings.",
        suggestedAction: "Add 15% discount promotion",
        evidence: { occupancy: signal.occupancyPercentage, demandLevel: signal.demandLevel },
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        status: "PENDING",
      });
    }
  }

  for (const rec of recs) {
    recommendations.set(rec.id, rec);
  }
  return recs;
}

export function listRecommendations(
  orgId: EntityId,
  propId: EntityId,
  status?: "PENDING" | "ACCEPTED" | "REJECTED" | "EXPIRED",
): RevenueRecommendation[] {
  const results: RevenueRecommendation[] = [];
  for (const rec of recommendations.values()) {
    if (rec.organizationId !== orgId || rec.propertyId !== propId) continue;
    if (status && rec.status !== status) continue;
    results.push(rec);
  }
  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function reviewRecommendation(
  recId: EntityId,
  status: "ACCEPTED" | "REJECTED",
  reviewedBy: EntityId,
): RevenueRecommendation | null {
  const rec = recommendations.get(recId);
  if (!rec) return null;
  const updated = { ...rec, status, reviewedBy, reviewedAt: new Date().toISOString() };
  recommendations.set(recId, updated);
  return updated;
}

// =====================================================================
// PRICE GUARDRAILS
// =====================================================================

export function getGuardrails(orgId: EntityId, propId: EntityId): RevenueGuardrails | null {
  const key = `${orgId}:${propId}`;
  return guardrails.get(key) ?? null;
}

export function setGuardrails(
  orgId: EntityId,
  propId: EntityId,
  data: Partial<RevenueGuardrails>,
  updatedBy: EntityId,
): RevenueGuardrails {
  const key = `${orgId}:${propId}`;
  const existing = guardrails.get(key);
  const updated: RevenueGuardrails = {
    organizationId: orgId,
    propertyId: propId,
    ...existing,
    ...data,
    updatedAt: new Date().toISOString(),
    updatedBy,
  } as RevenueGuardrails;
  guardrails.set(key, updated);
  return updated;
}

// =====================================================================
// PRICE SIMULATION
// =====================================================================

export function simulatePrice(
  orgId: EntityId,
  propId: EntityId,
  name: string,
  description: string,
  scenario: SimulationScenario,
  createdBy: EntityId,
): PriceSimulation {
  // Simplified simulation: just calculate the impact
  const currentRevenue = 100000; // Placeholder
  const projectedRevenue = currentRevenue * 1.1; // +10%
  const change = projectedRevenue - currentRevenue;

  const simulation: PriceSimulation = {
    id: generateId(),
    organizationId: orgId,
    propertyId: propId,
    name,
    description,
    scenario,
    results: {
      currentRevenue: currentRevenue.toFixed(2),
      projectedRevenue: projectedRevenue.toFixed(2),
      revenueChange: change.toFixed(2),
      revenueChangePercentage: ((change / currentRevenue) * 100).toFixed(1),
      breakdown: {},
    },
    createdAt: new Date().toISOString(),
    createdBy,
    isSimulation: true,
  };
  simulations.set(simulation.id, simulation);
  return simulation;
}

export function listSimulations(orgId: EntityId, propId: EntityId): PriceSimulation[] {
  const results: PriceSimulation[] = [];
  for (const sim of simulations.values()) {
    if (sim.organizationId === orgId && sim.propertyId === propId) {
      results.push(sim);
    }
  }
  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// =====================================================================
// CHANNEL PRICING
// =====================================================================

export function setChannelPricing(
  orgId: EntityId,
  propId: EntityId,
  productId: EntityId,
  productType: "ROOM" | "MENU_ITEM" | "EVENT_PACKAGE",
  channel: Channel,
  data: { priceOverride?: string; discountPercentage?: string; commissionPercentage?: string },
): ChannelPricing {
  const existing = Array.from(channelPricing.values()).find(
    (cp) =>
      cp.organizationId === orgId &&
      cp.propertyId === propId &&
      cp.productId === productId &&
      cp.channel === channel,
  );

  const pricing: ChannelPricing = {
    id: existing?.id ?? generateId(),
    organizationId: orgId,
    propertyId: propId,
    productId,
    productType,
    channel,
    priceOverride: data.priceOverride,
    discountPercentage: data.discountPercentage,
    commissionPercentage: data.commissionPercentage,
    isActive: true,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  channelPricing.set(pricing.id, pricing);
  return pricing;
}

export function listChannelPricing(
  orgId: EntityId,
  propId: EntityId,
  productId?: EntityId,
): ChannelPricing[] {
  const results: ChannelPricing[] = [];
  for (const cp of channelPricing.values()) {
    if (cp.organizationId !== orgId || cp.propertyId !== propId) continue;
    if (productId && cp.productId !== productId) continue;
    results.push(cp);
  }
  return results;
}

// =====================================================================
// REVENUE DASHBOARD
// =====================================================================

export async function getRevenueDashboard(
  orgId: EntityId,
  propId: EntityId,
  startDate: string,
  endDate: string,
): Promise<RevenueDashboardData> {
  const sb = requireSupabase();

  // Get revenue from bills, folios, events
  const [{ data: bills }, { data: folios }, { data: events }] = await Promise.all([
    sb.from("bills").select("grand_total").eq("organization_id", orgId).eq("status", "PAID").gte("business_date", startDate).lte("business_date", endDate),
    sb.from("folios").select("total_charges").eq("organization_id", orgId).eq("status", "SETTLED").gte("opened_at", startDate).lte("opened_at", endDate),
    sb.from("events").select("total_amount").eq("organization_id", orgId).eq("status", "COMPLETED").gte("event_date", startDate).lte("event_date", endDate),
  ]);

  const restaurantRevenue = bills?.reduce((sum, b) => sum + Number(b.grand_total || 0), 0) || 0;
  const roomRevenue = folios?.reduce((sum, f) => sum + Number(f.total_charges || 0), 0) || 0;
  const eventRevenue = events?.reduce((sum, e) => sum + Number(e.total_amount || 0), 0) || 0;
  const totalRevenue = restaurantRevenue + roomRevenue + eventRevenue;

  const activePromos = listPromotions(orgId, propId, "ACTIVE");
  const pendingRecs = listRecommendations(orgId, propId, "PENDING");

  return {
    organizationId: orgId,
    propertyId: propId,
    period: { startDate, endDate },
    summary: {
      totalRevenue: totalRevenue.toFixed(2),
      roomRevenue: roomRevenue.toFixed(2),
      restaurantRevenue: restaurantRevenue.toFixed(2),
      eventRevenue: eventRevenue.toFixed(2),
      otherRevenue: "0",
      currency: "INR",
    },
    occupancy: {
      currentOccupancy: "0",
      averageOccupancy: "0",
      occupancyTrend: [],
    },
    demand: {
      currentDemandLevel: "NORMAL",
      demandDistribution: { LOW: 0, NORMAL: 0, HIGH: 0, VERY_HIGH: 0 },
    },
    recommendations: {
      pending: pendingRecs.length,
      urgent: pendingRecs.filter((r) => r.priority === "URGENT").length,
      items: pendingRecs.slice(0, 5),
    },
    activePromotions: {
      count: activePromos.length,
      totalDiscount: "0",
      items: activePromos.slice(0, 5),
    },
    priceChanges: {
      count: 0,
      recentChanges: [],
    },
  };
}

// =====================================================================
// DEMO SEED DATA
// =====================================================================

/**
 * Seed demo data for revenue management. Creates sample promotions, seasons,
 * demand signals, recommendations, and guardrails for testing and demonstration.
 */
export function seedRevenueDemoData(orgId: EntityId, propId: EntityId): void {
  const now = new Date();
  const futureDate = (days: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    return d.toISOString();
  };
  const pastDate = (days: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    return d.toISOString();
  };

  // Seed promotions
  const promo1: Promotion = {
    id: "promo_summer2026",
    organizationId: orgId,
    propertyId: propId,
    code: "SUMMER2026",
    name: "Summer Special",
    description: "15% off for summer bookings",
    type: "PERCENTAGE",
    status: "ACTIVE",
    scope: "PROPERTY",
    discountPercentage: "15",
    startDate: pastDate(10),
    endDate: futureDate(20),
    priority: 10,
    stackable: false,
    usageCount: 47,
    autoApply: true,
    createdAt: pastDate(15),
    createdBy: "user_admin",
    updatedAt: pastDate(15),
    updatedBy: "user_admin",
  };
  promotions.set(promo1.id, promo1);

  const promo2: Promotion = {
    id: "promo_weekend",
    organizationId: orgId,
    propertyId: propId,
    code: "WEEKEND",
    name: "Weekend Getaway",
    description: "Special weekend rate for deluxe rooms",
    type: "RATE_OVERRIDE",
    status: "ACTIVE",
    scope: "PRODUCT",
    scopeValue: "room_deluxe",
    overridePrice: "3500.00",
    startDate: pastDate(5),
    endDate: futureDate(30),
    priority: 20,
    stackable: false,
    usageCount: 23,
    autoApply: true,
    createdAt: pastDate(7),
    createdBy: "user_admin",
    updatedAt: pastDate(7),
    updatedBy: "user_admin",
  };
  promotions.set(promo2.id, promo2);

  const promo3: Promotion = {
    id: "promo_corporate",
    organizationId: orgId,
    propertyId: propId,
    code: "CORP20",
    name: "Corporate Rate",
    description: "20% discount for corporate bookings",
    type: "PERCENTAGE",
    status: "ACTIVE",
    scope: "ALL",
    discountPercentage: "20",
    startDate: pastDate(30),
    endDate: futureDate(365),
    priority: 30,
    stackable: true,
    usageCount: 89,
    autoApply: false,
    createdAt: pastDate(35),
    createdBy: "user_admin",
    updatedAt: pastDate(35),
    updatedBy: "user_admin",
  };
  promotions.set(promo3.id, promo3);

  // Seed seasons
  const season1: Season = {
    id: "season_peak",
    organizationId: orgId,
    propertyId: propId,
    name: "Peak Season",
    startDate: "12-01",
    endDate: "01-31",
    multiplier: "1.35",
    priority: 10,
    isActive: true,
    createdAt: pastDate(90),
    updatedAt: pastDate(90),
  };
  seasons.set(season1.id, season1);

  const season2: Season = {
    id: "season_festive",
    organizationId: orgId,
    propertyId: propId,
    name: "Festive Season",
    startDate: "10-15",
    endDate: "11-15",
    multiplier: "1.25",
    priority: 20,
    isActive: true,
    createdAt: pastDate(60),
    updatedAt: pastDate(60),
  };
  seasons.set(season2.id, season2);

  // Seed demand thresholds
  const thresholds: DemandThresholds = {
    organizationId: orgId,
    propertyId: propId,
    lowThreshold: 40,
    normalThreshold: 70,
    highThreshold: 85,
    updatedAt: now.toISOString(),
  };
  demandThresholds.set(`${orgId}:${propId}`, thresholds);

  // Seed demand signals
  const demand1: DemandSignal = {
    id: "demand_room_deluxe",
    organizationId: orgId,
    propertyId: propId,
    productType: "ROOM",
    productId: "room_deluxe",
    date: now.toISOString().split("T")[0],
    demandLevel: "HIGH",
    occupancyPercentage: "82",
    calculatedAt: now.toISOString(),
  };
  demandSignals.set(demand1.id, demand1);

  // Seed recommendations
  const rec1: RevenueRecommendation = {
    id: "rec_001",
    organizationId: orgId,
    propertyId: propId,
    productId: "room_deluxe",
    type: "INCREASE_PRICE",
    priority: "HIGH",
    title: "Increase weekend rates for Deluxe Room",
    description: "Occupancy has been consistently above 80% on weekends for the past 30 days. Consider increasing rates by 10-15% to optimize revenue.",
    rationale: "Weekend occupancy: 82% (last 30 days). Weekday occupancy: 58% (last 30 days). Current rate: ₹4,500/night. Suggested rate: ₹5,000-5,200/night.",
    suggestedAction: "Increase rate by 13%",
    currentValue: "4500",
    suggestedValue: "5100",
    expectedImpact: "Estimated +₹28,000/month revenue",
    evidence: {
      weekendOccupancy: 82,
      weekdayOccupancy: 58,
      currentRate: 4500,
      suggestedRate: 5100,
    },
    createdAt: pastDate(2),
    expiresAt: futureDate(7),
    status: "PENDING",
  };
  recommendations.set(rec1.id, rec1);

  const rec2: RevenueRecommendation = {
    id: "rec_002",
    organizationId: orgId,
    propertyId: propId,
    type: "ADD_PROMOTION",
    priority: "MEDIUM",
    title: "Create mid-week promotion",
    description: "Weekday occupancy is below target (58%). A 10-15% discount promotion for Tue-Thu stays could boost occupancy to 70%+.",
    rationale: "Weekday occupancy: 58% (target: 70%). Competitor average weekday occupancy: 65%. Current weekday rate: ₹4,500/night. Suggested promo rate: ₹3,800-4,000/night.",
    suggestedAction: "Add 12% mid-week promotion",
    currentValue: "4500",
    suggestedValue: "3960",
    expectedImpact: "Estimated +₹15,000/month revenue",
    evidence: {
      weekdayOccupancy: 58,
      targetOccupancy: 70,
      competitorAverage: 65,
      currentRate: 4500,
      suggestedPromoRate: 3960,
    },
    createdAt: pastDate(1),
    expiresAt: futureDate(14),
    status: "PENDING",
  };
  recommendations.set(rec2.id, rec2);

  // Seed guardrails
  const guards: RevenueGuardrails = {
    organizationId: orgId,
    propertyId: propId,
    minimumPrice: "1500.00",
    maximumDiscountPercentage: "40",
    approvalThresholdPercentage: "20",
    updatedAt: now.toISOString(),
    updatedBy: "user_admin",
  };
  guardrails.set(`${orgId}:${propId}`, guards);
}

// Auto-seed demo data on module load (idempotent)
let seeded = false;
export function ensureRevenueDemoSeeded(orgId: EntityId, propId: EntityId): void {
  if (seeded) return;
  seeded = true;
  seedRevenueDemoData(orgId, propId);
}
