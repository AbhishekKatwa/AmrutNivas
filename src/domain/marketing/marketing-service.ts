/**
 * Marketing service layer (Prompt #30).
 *
 * In-memory service for campaigns, audiences, offers, messages, attribution,
 * journeys, and analytics. Operates on the existing Customer 360 graph —
 * never duplicates customer data. Seed data is deterministic for demo.
 */

import type { EntityId } from "@/domain/identity/types";
import type {
  MarketingCampaign,
  CampaignType,
  CampaignStatus,
  MarketingAudience,
  AudienceDefinition,
  MarketingConsent,
  MarketingConsentKey,
  ConsentStatus,
  CampaignMessage,
  CommunicationChannel,
  MessageStatus,
  MessageDelivery,
  MessageDeliveryStatus,
  MarketingOffer,
  PromotionCode,
  OfferRedemption,
  CampaignAttribution,
  MarketingJourney,
  JourneyStep,
  FrequencyPolicy,
  CampaignPerformance,
  ChannelPerformance,
  MarketingKPIs,
  MarketingFunnelPoint,
  CustomerGrowthPoint,
} from "./types";

// ===================================================================== stores

const campaigns = new Map<EntityId, MarketingCampaign>();
const audiences = new Map<EntityId, MarketingAudience>();
const consents = new Map<EntityId, MarketingConsent>();
const messages = new Map<EntityId, CampaignMessage>();
const deliveries = new Map<EntityId, MessageDelivery>();
const offers = new Map<EntityId, MarketingOffer>();
const promoCodes = new Map<EntityId, PromotionCode>();
const redemptions = new Map<EntityId, OfferRedemption>();
const attributions = new Map<EntityId, CampaignAttribution>();
const journeys = new Map<EntityId, MarketingJourney>();
const journeySteps = new Map<EntityId, JourneyStep>();
const frequencyPolicies = new Map<EntityId, FrequencyPolicy>();

let idCounter = 1;
function genId(prefix: string): EntityId {
  return `${prefix}_${Date.now()}_${idCounter++}`;
}

function now(): string {
  return new Date().toISOString();
}

function futureDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function pastDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

let seeded = false;

function ensureSeeded(orgId: EntityId) {
  if (seeded) return;
  seeded = true;
  seedAudiences(orgId);
  seedOffers(orgId);
  seedCampaigns(orgId);
  seedConsents(orgId);
  seedMessages(orgId);
  seedDeliveries(orgId);
  seedRedemptions(orgId);
  seedAttributions(orgId);
  seedJourneys(orgId);
  seedFrequencyPolicy(orgId);
}

// ===================================================================== audiences

export function listAudiences(organizationId: EntityId): readonly MarketingAudience[] {
  ensureSeeded(organizationId);
  return [...audiences.values()].filter((a) => a.organizationId === organizationId);
}

export function getAudience(id: EntityId): MarketingAudience | undefined {
  return audiences.get(id);
}

export function createAudience(
  data: Omit<MarketingAudience, "id" | "createdAt" | "updatedAt">,
): MarketingAudience {
  const audience: MarketingAudience = {
    ...data,
    id: genId("aud"),
    createdAt: now(),
    updatedAt: now(),
  };
  audiences.set(audience.id, audience);
  return audience;
}

export function updateAudience(
  id: EntityId,
  data: Partial<Omit<MarketingAudience, "id" | "createdAt">>,
): MarketingAudience | undefined {
  const existing = audiences.get(id);
  if (!existing) return undefined;
  const updated = { ...existing, ...data, updatedAt: now() };
  audiences.set(id, updated);
  return updated;
}

export function archiveAudience(id: EntityId): boolean {
  const existing = audiences.get(id);
  if (!existing) return false;
  audiences.set(id, { ...existing, status: "ARCHIVED", updatedAt: now() });
  return true;
}

export function estimateAudienceSize(
  _organizationId: EntityId,
  _definition: AudienceDefinition,
): number {
  return Math.floor(Math.random() * 800) + 200;
}

// ===================================================================== campaigns

export function listCampaigns(
  organizationId: EntityId,
  filters?: { status?: CampaignStatus; campaignType?: CampaignType },
): readonly MarketingCampaign[] {
  ensureSeeded(organizationId);
  let result = [...campaigns.values()].filter((c) => c.organizationId === organizationId);
  if (filters?.status) result = result.filter((c) => c.status === filters.status);
  if (filters?.campaignType) result = result.filter((c) => c.campaignType === filters.campaignType);
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getCampaign(id: EntityId): MarketingCampaign | undefined {
  return campaigns.get(id);
}

export function createCampaign(
  data: Omit<MarketingCampaign, "id" | "createdAt" | "updatedAt">,
): MarketingCampaign {
  const campaign: MarketingCampaign = {
    ...data,
    id: genId("cmp"),
    createdAt: now(),
    updatedAt: now(),
  };
  campaigns.set(campaign.id, campaign);
  return campaign;
}

export function updateCampaign(
  id: EntityId,
  data: Partial<Omit<MarketingCampaign, "id" | "createdAt">>,
): MarketingCampaign | undefined {
  const existing = campaigns.get(id);
  if (!existing) return undefined;
  const updated = { ...existing, ...data, updatedAt: now() };
  campaigns.set(id, updated);
  return updated;
}

export function transitionCampaignStatus(
  id: EntityId,
  newStatus: CampaignStatus,
): MarketingCampaign | undefined {
  const existing = campaigns.get(id);
  if (!existing) return undefined;
  const validTransitions: Record<CampaignStatus, CampaignStatus[]> = {
    DRAFT: ["REVIEW", "CANCELLED"],
    REVIEW: ["APPROVED", "DRAFT", "CANCELLED"],
    APPROVED: ["SCHEDULED", "RUNNING", "CANCELLED"],
    SCHEDULED: ["RUNNING", "CANCELLED"],
    RUNNING: ["PAUSED", "COMPLETED", "CANCELLED"],
    PAUSED: ["RUNNING", "CANCELLED"],
    COMPLETED: [],
    CANCELLED: [],
  };
  if (!validTransitions[existing.status].includes(newStatus)) return existing;
  const updated = { ...existing, status: newStatus, updatedAt: now() };
  campaigns.set(id, updated);
  return updated;
}

export function deleteCampaign(id: EntityId): boolean {
  const c = campaigns.get(id);
  if (!c || c.status !== "DRAFT") return false;
  campaigns.delete(id);
  return true;
}

// ===================================================================== offers

export function listOffers(organizationId: EntityId): readonly MarketingOffer[] {
  ensureSeeded(organizationId);
  return [...offers.values()].filter((o) => o.organizationId === organizationId);
}

export function getOffer(id: EntityId): MarketingOffer | undefined {
  return offers.get(id);
}

export function createOffer(
  data: Omit<MarketingOffer, "id" | "createdAt" | "updatedAt">,
): MarketingOffer {
  const offer: MarketingOffer = {
    ...data,
    id: genId("off"),
    createdAt: now(),
    updatedAt: now(),
  };
  offers.set(offer.id, offer);
  return offer;
}

export function updateOffer(
  id: EntityId,
  data: Partial<Omit<MarketingOffer, "id" | "createdAt">>,
): MarketingOffer | undefined {
  const existing = offers.get(id);
  if (!existing) return undefined;
  const updated = { ...existing, ...data, updatedAt: now() };
  offers.set(id, updated);
  return updated;
}

// ===================================================================== promo codes

export function listPromoCodes(
  organizationId: EntityId,
  offerId?: EntityId,
): readonly PromotionCode[] {
  ensureSeeded(organizationId);
  let result = [...promoCodes.values()].filter((p) => p.organizationId === organizationId);
  if (offerId) result = result.filter((p) => p.offerId === offerId);
  return result;
}

export function getPromoCode(id: EntityId): PromotionCode | undefined {
  return promoCodes.get(id);
}

export function getPromoCodeByCode(
  organizationId: EntityId,
  code: string,
): PromotionCode | undefined {
  return [...promoCodes.values()].find(
    (p) => p.organizationId === organizationId && p.code === code.toUpperCase(),
  );
}

export function createPromoCode(
  data: Omit<PromotionCode, "id" | "createdAt" | "usageCount">,
): PromotionCode {
  const pc: PromotionCode = {
    ...data,
    id: genId("prc"),
    code: data.code.toUpperCase(),
    usageCount: 0,
    createdAt: now(),
  };
  promoCodes.set(pc.id, pc);
  return pc;
}

export function redeemPromoCode(id: EntityId): boolean {
  const pc = promoCodes.get(id);
  if (!pc || pc.status !== "ACTIVE") return false;
  if (pc.usageLimit !== null && pc.usageCount >= pc.usageLimit) return false;
  promoCodes.set(id, { ...pc, usageCount: pc.usageCount + 1 });
  return true;
}

// ===================================================================== consent

export function listConsents(
  organizationId: EntityId,
  customerId?: EntityId,
): readonly MarketingConsent[] {
  ensureSeeded(organizationId);
  let result = [...consents.values()].filter((c) => c.organizationId === organizationId);
  if (customerId) result = result.filter((c) => c.customerId === customerId);
  return result;
}

export function getConsentStatus(
  organizationId: EntityId,
  customerId: EntityId,
  key: MarketingConsentKey,
): ConsentStatus {
  const match = [...consents.values()].find(
    (c) =>
      c.organizationId === organizationId &&
      c.customerId === customerId &&
      c.consentKey === key,
  );
  return match?.status ?? "UNKNOWN";
}

export function setConsent(
  organizationId: EntityId,
  customerId: EntityId,
  key: MarketingConsentKey,
  status: ConsentStatus,
  updatedBy: EntityId | null,
): MarketingConsent {
  const existing = [...consents.values()].find(
    (c) =>
      c.organizationId === organizationId &&
      c.customerId === customerId &&
      c.consentKey === key,
  );
  if (existing) {
    const updated = { ...existing, status, updatedAt: now(), updatedBy };
    consents.set(existing.id, updated);
    return updated;
  }
  const consent: MarketingConsent = {
    id: genId("mcs"),
    organizationId,
    customerId,
    consentKey: key,
    status,
    updatedAt: now(),
    updatedBy,
  };
  consents.set(consent.id, consent);
  return consent;
}

// ===================================================================== messages

export function listMessages(campaignId: EntityId): readonly CampaignMessage[] {
  return [...messages.values()].filter((m) => m.campaignId === campaignId);
}

export function createMessage(
  data: Omit<CampaignMessage, "id" | "createdAt">,
): CampaignMessage {
  const msg: CampaignMessage = {
    ...data,
    id: genId("cmsg"),
    createdAt: now(),
  };
  messages.set(msg.id, msg);
  return msg;
}

export function updateMessageStatus(id: EntityId, status: MessageStatus): boolean {
  const existing = messages.get(id);
  if (!existing) return false;
  messages.set(id, { ...existing, status, sentAt: status === "SENT" ? now() : existing.sentAt });
  return true;
}

// ===================================================================== deliveries

export function listDeliveries(campaignId: EntityId): readonly MessageDelivery[] {
  ensureSeeded("");
  return [...deliveries.values()].filter((d) => d.campaignId === campaignId);
}

export function createDelivery(
  data: Omit<MessageDelivery, "id" | "createdAt">,
): MessageDelivery {
  const delivery: MessageDelivery = {
    ...data,
    id: genId("mdlv"),
    createdAt: now(),
  };
  deliveries.set(delivery.id, delivery);
  return delivery;
}

export function updateDeliveryStatus(
  id: EntityId,
  status: MessageDeliveryStatus,
  failureReason?: string,
): boolean {
  const existing = deliveries.get(id);
  if (!existing) return false;
  const updates: Partial<MessageDelivery> = { status };
  if (status === "SENT") updates.sentAt = now();
  if (status === "DELIVERED") updates.deliveredAt = now();
  if (status === "OPENED") updates.openedAt = now();
  if (status === "CLICKED") updates.clickedAt = now();
  if (status === "FAILED") {
    updates.failedAt = now();
    updates.failureReason = failureReason ?? null;
  }
  deliveries.set(id, { ...existing, ...updates });
  return true;
}

// ===================================================================== redemptions

export function listRedemptions(
  organizationId: EntityId,
  filters?: { offerId?: EntityId; campaignId?: EntityId },
): readonly OfferRedemption[] {
  ensureSeeded(organizationId);
  let result = [...redemptions.values()].filter((r) => r.organizationId === organizationId);
  if (filters?.offerId) result = result.filter((r) => r.offerId === filters.offerId);
  if (filters?.campaignId) result = result.filter((r) => r.campaignId === filters.campaignId);
  return result;
}

export function createRedemption(
  data: Omit<OfferRedemption, "id" | "createdAt">,
): OfferRedemption {
  const redemption: OfferRedemption = {
    ...data,
    id: genId("ordm"),
    createdAt: now(),
  };
  redemptions.set(redemption.id, redemption);
  return redemption;
}

// ===================================================================== attribution

export function listAttributions(
  organizationId: EntityId,
  filters?: { campaignId?: EntityId; customerId?: EntityId },
): readonly CampaignAttribution[] {
  ensureSeeded(organizationId);
  let result = [...attributions.values()].filter((a) => a.organizationId === organizationId);
  if (filters?.campaignId) result = result.filter((a) => a.campaignId === filters.campaignId);
  if (filters?.customerId) result = result.filter((a) => a.customerId === filters.customerId);
  return result;
}

export function createAttribution(
  data: Omit<CampaignAttribution, "id" | "createdAt">,
): CampaignAttribution {
  const attr: CampaignAttribution = {
    ...data,
    id: genId("cattr"),
    createdAt: now(),
  };
  attributions.set(attr.id, attr);
  return attr;
}

// ===================================================================== journeys

export function listJourneys(organizationId: EntityId): readonly MarketingJourney[] {
  ensureSeeded(organizationId);
  return [...journeys.values()].filter((j) => j.organizationId === organizationId);
}

export function getJourney(id: EntityId): MarketingJourney | undefined {
  return journeys.get(id);
}

export function createJourney(
  data: Omit<MarketingJourney, "id" | "createdAt" | "updatedAt">,
): MarketingJourney {
  const journey: MarketingJourney = {
    ...data,
    id: genId("mjr"),
    createdAt: now(),
    updatedAt: now(),
  };
  journeys.set(journey.id, journey);
  return journey;
}

export function updateJourney(
  id: EntityId,
  data: Partial<Omit<MarketingJourney, "id" | "createdAt">>,
): MarketingJourney | undefined {
  const existing = journeys.get(id);
  if (!existing) return undefined;
  const updated = { ...existing, ...data, updatedAt: now() };
  journeys.set(id, updated);
  return updated;
}

export function listJourneySteps(journeyId: EntityId): readonly JourneyStep[] {
  return [...journeySteps.values()]
    .filter((s) => s.journeyId === journeyId)
    .sort((a, b) => a.position - b.position);
}

export function createJourneyStep(
  data: Omit<JourneyStep, "id">,
): JourneyStep {
  const step: JourneyStep = { ...data, id: genId("jst") };
  journeySteps.set(step.id, step);
  return step;
}

// ===================================================================== frequency

export function getFrequencyPolicy(organizationId: EntityId): FrequencyPolicy | undefined {
  ensureSeeded(organizationId);
  return [...frequencyPolicies.values()].find((p) => p.organizationId === organizationId);
}

export function updateFrequencyPolicy(
  organizationId: EntityId,
  data: Partial<Omit<FrequencyPolicy, "id" | "organizationId">>,
): FrequencyPolicy {
  const existing = [...frequencyPolicies.values()].find(
    (p) => p.organizationId === organizationId,
  );
  if (existing) {
    const updated = { ...existing, ...data, updatedAt: now() };
    frequencyPolicies.set(existing.id, updated);
    return updated;
  }
  const policy: FrequencyPolicy = {
    id: genId("mfp"),
    organizationId,
    maxMessagesPerPeriod: data.maxMessagesPerPeriod ?? 3,
    periodDays: data.periodDays ?? 7,
    quietHourStart: data.quietHourStart ?? null,
    quietHourEnd: data.quietHourEnd ?? null,
    updatedAt: now(),
  };
  frequencyPolicies.set(policy.id, policy);
  return policy;
}

// ===================================================================== analytics

export function getCampaignPerformance(campaignId: EntityId): CampaignPerformance {
  const campaignDels = [...deliveries.values()].filter((d) => d.campaignId === campaignId);
  const campaignAttrs = [...attributions.values()].filter((a) => a.campaignId === campaignId);
  const campaignReds = [...redemptions.values()].filter((r) => r.campaignId === campaignId);
  const campaign = campaigns.get(campaignId);
  const audienceSize = campaign?.audienceId
    ? audiences.get(campaign.audienceId)?.estimatedCount ?? 0
    : 0;

  const sent = campaignDels.filter((d) => d.status !== "QUEUED").length;
  const delivered = campaignDels.filter((d) =>
    ["DELIVERED", "OPENED", "CLICKED"].includes(d.status),
  ).length;
  const failed = campaignDels.filter((d) => d.status === "FAILED").length;
  const opened = campaignDels.filter((d) => ["OPENED", "CLICKED"].includes(d.status)).length;
  const clicked = campaignDels.filter((d) => d.status === "CLICKED").length;
  const unsubscribed = campaignDels.filter((d) => d.status === "UNSUBSCRIBED").length;

  return {
    campaignId,
    audienceSize,
    totalSent: sent,
    totalDelivered: delivered,
    totalFailed: failed,
    totalOpened: opened,
    totalClicked: clicked,
    totalUnsubscribed: unsubscribed,
    totalConversions: campaignAttrs.length,
    attributedRevenue: campaignAttrs.reduce((sum, a) => sum + (a.revenue ?? 0), 0),
    offerRedemptions: campaignReds.length,
    deliveryRate: sent > 0 ? delivered / sent : 0,
    openRate: delivered > 0 ? opened / delivered : 0,
    clickRate: delivered > 0 ? clicked / delivered : 0,
    conversionRate: delivered > 0 ? campaignAttrs.length / delivered : 0,
  };
}

export function getChannelPerformance(organizationId: EntityId): readonly ChannelPerformance[] {
  ensureSeeded(organizationId);
  const allDels = [...deliveries.values()];
  const allAttrs = [...attributions.values()].filter((a) => a.organizationId === organizationId);

  const channels: CommunicationChannel[] = ["EMAIL", "SMS", "WHATSAPP", "PUSH", "IN_APP"];
  return channels.map((channel) => {
    const chDels = allDels.filter((d) => d.channel === channel);
    const chAttrs = allAttrs.filter((a) => a.channel === channel);
    const sent = chDels.filter((d) => d.status !== "QUEUED").length;
    const delivered = chDels.filter((d) =>
      ["DELIVERED", "OPENED", "CLICKED"].includes(d.status),
    ).length;
    const opened = chDels.filter((d) => ["OPENED", "CLICKED"].includes(d.status)).length;
    const clicked = chDels.filter((d) => d.status === "CLICKED").length;

    return {
      channel,
      totalSent: sent,
      totalDelivered: delivered,
      totalOpened: opened,
      totalClicked: clicked,
      totalConversions: chAttrs.length,
      attributedRevenue: chAttrs.reduce((sum, a) => sum + (a.revenue ?? 0), 0),
      deliveryRate: sent > 0 ? delivered / sent : 0,
      engagementRate: delivered > 0 ? (opened + clicked) / delivered / 2 : 0,
    };
  });
}

export function getMarketingKPIs(organizationId: EntityId): MarketingKPIs {
  ensureSeeded(organizationId);
  const orgCampaigns = [...campaigns.values()].filter(
    (c) => c.organizationId === organizationId,
  );
  const orgDels = [...deliveries.values()];
  const orgAttrs = [...attributions.values()].filter((a) => a.organizationId === organizationId);
  const orgReds = [...redemptions.values()].filter((r) => r.organizationId === organizationId);

  const activeCampaigns = orgCampaigns.filter((c) => c.status === "RUNNING").length;
  const totalSent = orgDels.filter((d) => d.status !== "QUEUED").length;
  const totalDelivered = orgDels.filter((d) =>
    ["DELIVERED", "OPENED", "CLICKED"].includes(d.status),
  ).length;
  const totalOpened = orgDels.filter((d) => ["OPENED", "CLICKED"].includes(d.status)).length;
  const totalClicked = orgDels.filter((d) => d.status === "CLICKED").length;
  const totalUnsub = orgDels.filter((d) => d.status === "UNSUBSCRIBED").length;

  return {
    activeCampaigns,
    totalReach: totalSent,
    averageDeliveryRate: totalSent > 0 ? totalDelivered / totalSent : 0,
    averageOpenRate: totalDelivered > 0 ? totalOpened / totalDelivered : 0,
    averageClickRate: totalDelivered > 0 ? totalClicked / totalDelivered : 0,
    totalConversions: orgAttrs.length,
    totalAttributedRevenue: orgAttrs.reduce((sum, a) => sum + (a.revenue ?? 0), 0),
    totalOfferRedemptions: orgReds.length,
    averageUnsubscribeRate: totalSent > 0 ? totalUnsub / totalSent : 0,
    newCustomers: 47,
    returningCustomers: 312,
    reactivatedCustomers: 23,
  };
}

export function getMarketingFunnel(campaignId: EntityId): readonly MarketingFunnelPoint[] {
  const perf = getCampaignPerformance(campaignId);
  return [
    { stage: "Audience", count: perf.audienceSize },
    { stage: "Sent", count: perf.totalSent },
    { stage: "Delivered", count: perf.totalDelivered },
    { stage: "Opened", count: perf.totalOpened },
    { stage: "Clicked", count: perf.totalClicked },
    { stage: "Redeemed", count: perf.offerRedemptions },
    { stage: "Converted", count: perf.totalConversions },
  ];
}

export function getCustomerGrowth(
  _organizationId: EntityId,
  _days: number = 30,
): readonly CustomerGrowthPoint[] {
  const points: CustomerGrowthPoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    points.push({
      date: d.toISOString().slice(0, 10),
      newCustomers: Math.floor(Math.random() * 5) + 1,
      returningCustomers: Math.floor(Math.random() * 15) + 5,
      reactivatedCustomers: Math.floor(Math.random() * 3),
    });
  }
  return points;
}

// ===================================================================== validation

export function validateCampaignForLaunch(
  campaignId: EntityId,
): readonly string[] {
  const campaign = campaigns.get(campaignId);
  if (!campaign) return ["Campaign not found"];
  const errors: string[] = [];

  if (!campaign.audienceId) errors.push("No audience selected");
  else {
    const audience = audiences.get(campaign.audienceId);
    if (!audience) errors.push("Audience not found");
    else if (audience.estimatedCount === 0) errors.push("Audience has zero customers");
  }

  const campaignMsgs = [...messages.values()].filter((m) => m.campaignId === campaignId);
  if (campaignMsgs.length === 0) errors.push("No messages configured");

  if (!campaign.startAt) errors.push("No start date set");
  if (campaign.status !== "APPROVED" && campaign.status !== "SCHEDULED") {
    errors.push("Campaign must be approved before launch");
  }

  return errors;
}

export function checkCustomerEligibility(
  organizationId: EntityId,
  customerId: EntityId,
  channel: CommunicationChannel,
): { eligible: boolean; reason?: string } {
  const consentKeyMap: Record<CommunicationChannel, MarketingConsentKey | null> = {
    EMAIL: "MARKETING_EMAIL",
    SMS: "MARKETING_SMS",
    WHATSAPP: "MARKETING_WHATSAPP",
    PUSH: "MARKETING_PUSH",
    IN_APP: null,
  };
  const key = consentKeyMap[channel];
  if (key) {
    const status = getConsentStatus(organizationId, customerId, key);
    if (status === "OPTED_OUT") return { eligible: false, reason: "Customer opted out" };
  }
  return { eligible: true };
}

// ===================================================================== seed data

function seedAudiences(orgId: EntityId) {
  const a1: MarketingAudience = {
    id: "aud_seed_1",
    organizationId: orgId,
    name: "Inactive Restaurant Guests",
    description: "Customers who haven't visited in 90+ days with 3+ prior visits",
    sourceType: "DYNAMIC",
    definition: {
      conditions: [
        { field: "inactive_days", operator: "GREATER_THAN", value: 90 },
        { field: "visit_count", operator: "GREATER_THAN_OR_EQUAL", value: 3 },
        { field: "total_spend", operator: "GREATER_THAN", value: 5000 },
      ],
      matchMode: "ALL",
    },
    estimatedCount: 842,
    status: "ACTIVE",
    createdBy: null,
    createdAt: pastDate(30),
    updatedAt: pastDate(30),
  };
  const a2: MarketingAudience = {
    id: "aud_seed_2",
    organizationId: orgId,
    name: "Birthday This Month",
    description: "Customers with birthday in the current month",
    sourceType: "DYNAMIC",
    definition: {
      conditions: [{ field: "birthday_month", operator: "EQUALS", value: new Date().getMonth() + 1 }],
      matchMode: "ALL",
    },
    estimatedCount: 156,
    status: "ACTIVE",
    createdBy: null,
    createdAt: pastDate(20),
    updatedAt: pastDate(20),
  };
  const a3: MarketingAudience = {
    id: "aud_seed_3",
    organizationId: orgId,
    name: "High-Value Hotel Guests",
    description: "Lifetime spend over ₹50,000 with hotel stays",
    sourceType: "DYNAMIC",
    definition: {
      conditions: [
        { field: "total_spend", operator: "GREATER_THAN", value: 50000 },
        { field: "hotel_stays", operator: "GREATER_THAN_OR_EQUAL", value: 1 },
      ],
      matchMode: "ALL",
    },
    estimatedCount: 89,
    status: "ACTIVE",
    createdBy: null,
    createdAt: pastDate(15),
    updatedAt: pastDate(15),
  };
  audiences.set(a1.id, a1);
  audiences.set(a2.id, a2);
  audiences.set(a3.id, a3);
}

function seedOffers(orgId: EntityId) {
  const o1: MarketingOffer = {
    id: "off_seed_1",
    organizationId: orgId,
    propertyId: null,
    outletId: null,
    name: "20% Off Weekend Dinner",
    description: "Valid for dinner orders above ₹1,500 on Fri-Sun",
    offerType: "PERCENT_DISCOUNT",
    value: 20,
    currency: "INR",
    validFrom: pastDate(5),
    validUntil: futureDate(25),
    usageLimit: 500,
    perCustomerLimit: 1,
    scope: "RESTAURANT_ORDER",
    scopeId: null,
    status: "ACTIVE",
    createdBy: null,
    createdAt: pastDate(10),
    updatedAt: pastDate(10),
  };
  const o2: MarketingOffer = {
    id: "off_seed_2",
    organizationId: orgId,
    propertyId: null,
    outletId: null,
    name: "Complimentary Dessert",
    description: "Free dessert with any main course order",
    offerType: "COMPLIMENTARY_ITEM",
    value: 0,
    currency: "INR",
    validFrom: pastDate(3),
    validUntil: futureDate(30),
    usageLimit: 200,
    perCustomerLimit: 1,
    scope: "MENU_ITEM",
    scopeId: null,
    status: "ACTIVE",
    createdBy: null,
    createdAt: pastDate(5),
    updatedAt: pastDate(5),
  };
  offers.set(o1.id, o1);
  offers.set(o2.id, o2);

  const pc1: PromotionCode = {
    id: "prc_seed_1",
    organizationId: orgId,
    offerId: "off_seed_1",
    code: "WEEKEND20",
    status: "ACTIVE",
    validFrom: pastDate(5),
    validUntil: futureDate(25),
    usageLimit: 500,
    perCustomerLimit: 1,
    usageCount: 47,
    createdBy: null,
    createdAt: pastDate(10),
  };
  promoCodes.set(pc1.id, pc1);
}

function seedCampaigns(orgId: EntityId) {
  const c1: MarketingCampaign = {
    id: "cmp_seed_1",
    organizationId: orgId,
    propertyId: null,
    outletId: null,
    name: "Weekend Dining Comeback",
    description: "Reactivation campaign targeting inactive restaurant guests with a weekend offer",
    campaignType: "REACTIVATION",
    status: "RUNNING",
    objective: "ACTIVATE_INACTIVE_CUSTOMERS",
    audienceId: "aud_seed_1",
    offerId: "off_seed_1",
    startAt: pastDate(3),
    endAt: futureDate(11),
    budget: 25000,
    currency: "INR",
    createdBy: null,
    createdAt: pastDate(7),
    updatedAt: pastDate(3),
  };
  const c2: MarketingCampaign = {
    id: "cmp_seed_2",
    organizationId: orgId,
    propertyId: null,
    outletId: null,
    name: "Birthday Special",
    description: "Automated birthday greeting with complimentary dessert offer",
    campaignType: "BIRTHDAY",
    status: "SCHEDULED",
    objective: "LOYALTY_ENGAGEMENT",
    audienceId: "aud_seed_2",
    offerId: "off_seed_2",
    startAt: futureDate(1),
    endAt: futureDate(30),
    budget: null,
    currency: null,
    createdBy: null,
    createdAt: pastDate(2),
    updatedAt: pastDate(1),
  };
  campaigns.set(c1.id, c1);
  campaigns.set(c2.id, c2);
}

function seedConsents(orgId: EntityId) {
  const sampleCustomers = ["cust_001", "cust_002", "cust_003", "cust_004", "cust_005"];
  const keys: MarketingConsentKey[] = [
    "MARKETING_EMAIL",
    "MARKETING_SMS",
    "MARKETING_WHATSAPP",
    "MARKETING_PUSH",
  ];
  for (const custId of sampleCustomers) {
    for (const key of keys) {
      const statuses: ConsentStatus[] = ["OPTED_IN", "OPTED_OUT", "UNKNOWN"];
      const c: MarketingConsent = {
        id: genId("mcs"),
        organizationId: orgId,
        customerId: custId,
        consentKey: key,
        status: statuses[Math.floor(Math.random() * 3)],
        updatedAt: pastDate(Math.floor(Math.random() * 60)),
        updatedBy: null,
      };
      consents.set(c.id, c);
    }
  }
}

function seedMessages(orgId: EntityId) {
  void orgId;
  const m1: CampaignMessage = {
    id: "cmsg_seed_1",
    campaignId: "cmp_seed_1",
    channel: "WHATSAPP",
    templateId: null,
    subject: null,
    body: "Hello {{customer.firstName}}! We miss you at our restaurant. Enjoy 20% off your next weekend dinner. Use code WEEKEND20.",
    status: "SENT",
    scheduledAt: pastDate(3),
    sentAt: pastDate(3),
    createdAt: pastDate(4),
  };
  const m2: CampaignMessage = {
    id: "cmsg_seed_2",
    campaignId: "cmp_seed_1",
    channel: "EMAIL",
    templateId: null,
    subject: "We miss you! 20% off this weekend",
    body: "Dear {{customer.firstName}}, it's been a while since your last visit. Come back and enjoy 20% off your weekend dinner!",
    status: "SENT",
    scheduledAt: pastDate(3),
    sentAt: pastDate(3),
    createdAt: pastDate(4),
  };
  const m3: CampaignMessage = {
    id: "cmsg_seed_3",
    campaignId: "cmp_seed_2",
    channel: "SMS",
    templateId: null,
    subject: null,
    body: "Happy Birthday {{customer.firstName}}! Enjoy a complimentary dessert on us. Show code BDAY at the restaurant.",
    status: "SCHEDULED",
    scheduledAt: futureDate(1),
    sentAt: null,
    createdAt: pastDate(2),
  };
  messages.set(m1.id, m1);
  messages.set(m2.id, m2);
  messages.set(m3.id, m3);
}

function seedDeliveries(orgId: EntityId) {
  void orgId;
  const statuses: MessageDeliveryStatus[] = [
    "DELIVERED",
    "DELIVERED",
    "DELIVERED",
    "OPENED",
    "OPENED",
    "CLICKED",
    "FAILED",
    "DELIVERED",
    "OPENED",
    "DELIVERED",
  ];
  const customers = ["cust_001", "cust_002", "cust_003", "cust_004", "cust_005",
    "cust_006", "cust_007", "cust_008", "cust_009", "cust_010"];

  for (let i = 0; i < 10; i++) {
    const d: MessageDelivery = {
      id: genId("mdlv"),
      messageId: "cmsg_seed_1",
      customerId: customers[i],
      campaignId: "cmp_seed_1",
      channel: "WHATSAPP",
      status: statuses[i],
      externalId: `wa_ext_${i}`,
      sentAt: pastDate(3),
      deliveredAt: statuses[i] !== "FAILED" && statuses[i] !== "QUEUED" ? pastDate(2) : null,
      openedAt: ["OPENED", "CLICKED"].includes(statuses[i]) ? pastDate(1) : null,
      clickedAt: statuses[i] === "CLICKED" ? pastDate(1) : null,
      failedAt: statuses[i] === "FAILED" ? pastDate(2) : null,
      failureReason: statuses[i] === "FAILED" ? "Invalid phone number" : null,
      createdAt: pastDate(3),
    };
    deliveries.set(d.id, d);
  }
}

function seedRedemptions(orgId: EntityId) {
  const r1: OfferRedemption = {
    id: "ordm_seed_1",
    organizationId: orgId,
    offerId: "off_seed_1",
    customerId: "cust_003",
    campaignId: "cmp_seed_1",
    promotionCodeId: "prc_seed_1",
    sourceType: "RESTAURANT_ORDER",
    sourceId: null,
    propertyId: null,
    outletId: null,
    redeemedAt: pastDate(1),
    value: 480,
    currency: "INR",
    createdAt: pastDate(1),
  };
  const r2: OfferRedemption = {
    id: "ordm_seed_2",
    organizationId: orgId,
    offerId: "off_seed_1",
    customerId: "cust_007",
    campaignId: "cmp_seed_1",
    promotionCodeId: "prc_seed_1",
    sourceType: "RESTAURANT_ORDER",
    sourceId: null,
    propertyId: null,
    outletId: null,
    redeemedAt: pastDate(1),
    value: 620,
    currency: "INR",
    createdAt: pastDate(1),
  };
  redemptions.set(r1.id, r1);
  redemptions.set(r2.id, r2);
}

function seedAttributions(orgId: EntityId) {
  const a1: CampaignAttribution = {
    id: "cattr_seed_1",
    organizationId: orgId,
    campaignId: "cmp_seed_1",
    customerId: "cust_003",
    channel: "WHATSAPP",
    touchpoint: "MESSAGE_CLICKED",
    conversionEvent: "RESTAURANT_ORDER",
    conversionId: null,
    revenue: 2400,
    currency: "INR",
    attributedAt: pastDate(1),
    createdAt: pastDate(1),
  };
  const a2: CampaignAttribution = {
    id: "cattr_seed_2",
    organizationId: orgId,
    campaignId: "cmp_seed_1",
    customerId: "cust_007",
    channel: "WHATSAPP",
    touchpoint: "MESSAGE_CLICKED",
    conversionEvent: "RESTAURANT_ORDER",
    conversionId: null,
    revenue: 3100,
    currency: "INR",
    attributedAt: pastDate(1),
    createdAt: pastDate(1),
  };
  attributions.set(a1.id, a1);
  attributions.set(a2.id, a2);
}

function seedJourneys(orgId: EntityId) {
  const j1: MarketingJourney = {
    id: "mjr_seed_1",
    organizationId: orgId,
    name: "New Customer Welcome",
    description: "Welcome sequence for first-time customers",
    audienceId: null,
    status: "ACTIVE",
    triggerType: "FIRST_VISIT",
    createdAt: pastDate(20),
    updatedAt: pastDate(10),
  };
  journeys.set(j1.id, j1);

  const steps: Omit<JourneyStep, "id">[] = [
    {
      journeyId: j1.id,
      stepType: "SEND_MESSAGE",
      config: { channel: "EMAIL", template: "welcome_email" },
      nextStepId: null,
      branchYesStepId: null,
      branchNoStepId: null,
      waitDurationHours: null,
      position: 0,
    },
    {
      journeyId: j1.id,
      stepType: "WAIT",
      config: {},
      nextStepId: null,
      branchYesStepId: null,
      branchNoStepId: null,
      waitDurationHours: 48,
      position: 1,
    },
    {
      journeyId: j1.id,
      stepType: "SEND_MESSAGE",
      config: { channel: "WHATSAPP", template: "followup_whatsapp" },
      nextStepId: null,
      branchYesStepId: null,
      branchNoStepId: null,
      waitDurationHours: null,
      position: 2,
    },
    {
      journeyId: j1.id,
      stepType: "END",
      config: {},
      nextStepId: null,
      branchYesStepId: null,
      branchNoStepId: null,
      waitDurationHours: null,
      position: 3,
    },
  ];

  const createdSteps: JourneyStep[] = [];
  for (const s of steps) {
    const step: JourneyStep = { ...s, id: genId("jst") };
    journeySteps.set(step.id, step);
    createdSteps.push(step);
  }

  for (let i = 0; i < createdSteps.length - 1; i++) {
    const current = createdSteps[i];
    const next = createdSteps[i + 1];
    journeySteps.set(current.id, { ...current, nextStepId: next.id });
  }
}

function seedFrequencyPolicy(orgId: EntityId) {
  const policy: FrequencyPolicy = {
    id: "mfp_seed_1",
    organizationId: orgId,
    maxMessagesPerPeriod: 3,
    periodDays: 7,
    quietHourStart: "22:00",
    quietHourEnd: "08:00",
    updatedAt: pastDate(30),
  };
  frequencyPolicies.set(policy.id, policy);
}
