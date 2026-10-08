/**
 * Marketing domain types (Prompt #30).
 *
 * Activates the existing Customer 360 graph for targeted campaigns, offers,
 * and engagement tracking. Operates on CRM customers, loyalty accounts,
 * preferences, and communication infrastructure — never duplicates them.
 *
 * Key concepts:
 *   - Campaign: lifecycle-managed marketing initiative with audience + message + offer
 *   - Audience: dynamic or snapshot customer set built from deterministic conditions
 *   - Offer: discount/complementary with validity, limits, and scope
 *   - PromotionCode: redeemable code linked to an offer
 *   - CampaignMessage: per-channel message tied to a campaign
 *   - OfferRedemption: tracks when/where an offer was used
 *   - CampaignAttribution: links customer actions back to campaign touchpoints
 *   - MarketingJourney: multi-step automated engagement flow
 *   - Consent: extends CustomerPreference with marketing channel opt-in/out
 */

import type { EntityId } from "@/domain/identity/types";

// =================================================================== campaign types

export type CampaignType =
  | "PROMOTION"
  | "REACTIVATION"
  | "LOYALTY"
  | "BIRTHDAY"
  | "ANNIVERSARY"
  | "DIRECT_BOOKING"
  | "RESTAURANT"
  | "HOTEL"
  | "EVENT"
  | "TAKEAWAY"
  | "NEW_CUSTOMER"
  | "REPEAT_CUSTOMER"
  | "SEASONAL"
  | "FESTIVAL"
  | "CORPORATE"
  | "FEEDBACK_FOLLOWUP"
  | "OTHER";

export const CAMPAIGN_TYPES: readonly CampaignType[] = [
  "PROMOTION",
  "REACTIVATION",
  "LOYALTY",
  "BIRTHDAY",
  "ANNIVERSARY",
  "DIRECT_BOOKING",
  "RESTAURANT",
  "HOTEL",
  "EVENT",
  "TAKEAWAY",
  "NEW_CUSTOMER",
  "REPEAT_CUSTOMER",
  "SEASONAL",
  "FESTIVAL",
  "CORPORATE",
  "FEEDBACK_FOLLOWUP",
  "OTHER",
];

export type CampaignStatus =
  | "DRAFT"
  | "REVIEW"
  | "APPROVED"
  | "SCHEDULED"
  | "RUNNING"
  | "PAUSED"
  | "COMPLETED"
  | "CANCELLED";

export const CAMPAIGN_STATUSES: readonly CampaignStatus[] = [
  "DRAFT",
  "REVIEW",
  "APPROVED",
  "SCHEDULED",
  "RUNNING",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
];

export type CampaignObjective =
  | "INCREASE_VISITS"
  | "INCREASE_BOOKINGS"
  | "INCREASE_RESTAURANT_SALES"
  | "INCREASE_DIRECT_BOOKINGS"
  | "INCREASE_EVENT_LEADS"
  | "INCREASE_REPEAT_VISITS"
  | "ACTIVATE_INACTIVE_CUSTOMERS"
  | "LOYALTY_ENGAGEMENT"
  | "PROMOTE_NEW_OFFER"
  | "CUSTOMER_RETENTION"
  | "CUSTOMER_FEEDBACK";

export const CAMPAIGN_OBJECTIVES: readonly CampaignObjective[] = [
  "INCREASE_VISITS",
  "INCREASE_BOOKINGS",
  "INCREASE_RESTAURANT_SALES",
  "INCREASE_DIRECT_BOOKINGS",
  "INCREASE_EVENT_LEADS",
  "INCREASE_REPEAT_VISITS",
  "ACTIVATE_INACTIVE_CUSTOMERS",
  "LOYALTY_ENGAGEMENT",
  "PROMOTE_NEW_OFFER",
  "CUSTOMER_RETENTION",
  "CUSTOMER_FEEDBACK",
];

export type MarketingCampaign = {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId | null;
  outletId: EntityId | null;
  name: string;
  description: string | null;
  campaignType: CampaignType;
  status: CampaignStatus;
  objective: CampaignObjective;
  audienceId: EntityId | null;
  offerId: EntityId | null;
  startAt: string | null;
  endAt: string | null;
  budget: number | null;
  currency: string | null;
  createdBy: EntityId | null;
  createdAt: string;
  updatedAt: string;
};

// =================================================================== audience

export type AudienceSourceType = "DYNAMIC" | "SNAPSHOT";

export const AUDIENCE_SOURCE_TYPES: readonly AudienceSourceType[] = ["DYNAMIC", "SNAPSHOT"];

export type AudienceConditionField =
  | "customer_type"
  | "customer_source"
  | "property"
  | "outlet"
  | "last_visit"
  | "first_visit"
  | "visit_count"
  | "hotel_stays"
  | "restaurant_orders"
  | "event_bookings"
  | "total_spend"
  | "average_spend"
  | "last_spend"
  | "loyalty_tier"
  | "loyalty_points"
  | "customer_tag"
  | "language"
  | "birthday_month"
  | "anniversary_month"
  | "feedback_rating"
  | "complaint_status"
  | "inactive_days"
  | "booking_source";

export const AUDIENCE_CONDITION_FIELDS: readonly AudienceConditionField[] = [
  "customer_type",
  "customer_source",
  "property",
  "outlet",
  "last_visit",
  "first_visit",
  "visit_count",
  "hotel_stays",
  "restaurant_orders",
  "event_bookings",
  "total_spend",
  "average_spend",
  "last_spend",
  "loyalty_tier",
  "loyalty_points",
  "customer_tag",
  "language",
  "birthday_month",
  "anniversary_month",
  "feedback_rating",
  "complaint_status",
  "inactive_days",
  "booking_source",
];

export type AudienceConditionOperator =
  | "EQUALS"
  | "NOT_EQUALS"
  | "GREATER_THAN"
  | "GREATER_THAN_OR_EQUAL"
  | "LESS_THAN"
  | "LESS_THAN_OR_EQUAL"
  | "CONTAINS"
  | "NOT_CONTAINS"
  | "IN"
  | "NOT_IN"
  | "BETWEEN"
  | "BEFORE"
  | "AFTER"
  | "IS_EMPTY"
  | "IS_NOT_EMPTY";

export const AUDIENCE_CONDITION_OPERATORS: readonly AudienceConditionOperator[] = [
  "EQUALS",
  "NOT_EQUALS",
  "GREATER_THAN",
  "GREATER_THAN_OR_EQUAL",
  "LESS_THAN",
  "LESS_THAN_OR_EQUAL",
  "CONTAINS",
  "NOT_CONTAINS",
  "IN",
  "NOT_IN",
  "BETWEEN",
  "BEFORE",
  "AFTER",
  "IS_EMPTY",
  "IS_NOT_EMPTY",
];

export type AudienceCondition = {
  field: AudienceConditionField;
  operator: AudienceConditionOperator;
  value: string | number | string[] | null;
  valueTo?: string | number | null;
};

export type AudienceDefinition = {
  conditions: readonly AudienceCondition[];
  matchMode: "ALL" | "ANY";
};

export type MarketingAudience = {
  id: EntityId;
  organizationId: EntityId;
  name: string;
  description: string | null;
  sourceType: AudienceSourceType;
  definition: AudienceDefinition;
  estimatedCount: number;
  status: "ACTIVE" | "ARCHIVED";
  createdBy: EntityId | null;
  createdAt: string;
  updatedAt: string;
};

export type AudienceSnapshot = {
  id: EntityId;
  audienceId: EntityId;
  campaignId: EntityId;
  customerId: EntityId;
  snapshotAt: string;
};

// =================================================================== communication channel

export type CommunicationChannel = "EMAIL" | "SMS" | "WHATSAPP" | "PUSH" | "IN_APP";

export const COMMUNICATION_CHANNELS: readonly CommunicationChannel[] = [
  "EMAIL",
  "SMS",
  "WHATSAPP",
  "PUSH",
  "IN_APP",
];

// =================================================================== marketing consent

export type MarketingConsentKey =
  | "MARKETING_EMAIL"
  | "MARKETING_SMS"
  | "MARKETING_WHATSAPP"
  | "MARKETING_PUSH";

export const MARKETING_CONSENT_KEYS: readonly MarketingConsentKey[] = [
  "MARKETING_EMAIL",
  "MARKETING_SMS",
  "MARKETING_WHATSAPP",
  "MARKETING_PUSH",
];

export type ConsentStatus = "OPTED_IN" | "OPTED_OUT" | "UNKNOWN";

export const CONSENT_STATUSES: readonly ConsentStatus[] = [
  "OPTED_IN",
  "OPTED_OUT",
  "UNKNOWN",
];

export type MarketingConsent = {
  id: EntityId;
  organizationId: EntityId;
  customerId: EntityId;
  consentKey: MarketingConsentKey;
  status: ConsentStatus;
  updatedAt: string;
  updatedBy: EntityId | null;
};

// =================================================================== campaign message

export type MessageStatus = "DRAFT" | "SCHEDULED" | "SENT" | "DELIVERED" | "FAILED" | "NOT_SUPPORTED";

export const MESSAGE_STATUSES: readonly MessageStatus[] = [
  "DRAFT",
  "SCHEDULED",
  "SENT",
  "DELIVERED",
  "FAILED",
  "NOT_SUPPORTED",
];

export type CampaignMessage = {
  id: EntityId;
  campaignId: EntityId;
  channel: CommunicationChannel;
  templateId: EntityId | null;
  subject: string | null;
  body: string;
  status: MessageStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
};

export type MessageDeliveryStatus =
  | "QUEUED"
  | "SENT"
  | "DELIVERED"
  | "FAILED"
  | "OPENED"
  | "CLICKED"
  | "UNSUBSCRIBED"
  | "NOT_SUPPORTED";

export const MESSAGE_DELIVERY_STATUSES: readonly MessageDeliveryStatus[] = [
  "QUEUED",
  "SENT",
  "DELIVERED",
  "FAILED",
  "OPENED",
  "CLICKED",
  "UNSUBSCRIBED",
  "NOT_SUPPORTED",
];

export type MessageDelivery = {
  id: EntityId;
  messageId: EntityId;
  customerId: EntityId;
  campaignId: EntityId;
  channel: CommunicationChannel;
  status: MessageDeliveryStatus;
  externalId: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  createdAt: string;
};

// =================================================================== offers

export type OfferType =
  | "PERCENT_DISCOUNT"
  | "FIXED_DISCOUNT"
  | "COMPLIMENTARY_ITEM"
  | "UPGRADE"
  | "LOYALTY_BONUS"
  | "PACKAGE"
  | "SPECIAL_RATE"
  | "OTHER";

export const OFFER_TYPES: readonly OfferType[] = [
  "PERCENT_DISCOUNT",
  "FIXED_DISCOUNT",
  "COMPLIMENTARY_ITEM",
  "UPGRADE",
  "LOYALTY_BONUS",
  "PACKAGE",
  "SPECIAL_RATE",
  "OTHER",
];

export type OfferScope =
  | "MENU_ITEM"
  | "MENU_CATEGORY"
  | "RESTAURANT_ORDER"
  | "ROOM"
  | "ROOM_TYPE"
  | "RATE_PLAN"
  | "EVENT_PACKAGE"
  | "EVENT"
  | "PROPERTY"
  | "OUTLET"
  | "CUSTOMER_SEGMENT";

export const OFFER_SCOPES: readonly OfferScope[] = [
  "MENU_ITEM",
  "MENU_CATEGORY",
  "RESTAURANT_ORDER",
  "ROOM",
  "ROOM_TYPE",
  "RATE_PLAN",
  "EVENT_PACKAGE",
  "EVENT",
  "PROPERTY",
  "OUTLET",
  "CUSTOMER_SEGMENT",
];

export type OfferStatus = "DRAFT" | "ACTIVE" | "EXPIRED" | "DISABLED";

export const OFFER_STATUSES: readonly OfferStatus[] = ["DRAFT", "ACTIVE", "EXPIRED", "DISABLED"];

export type MarketingOffer = {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId | null;
  outletId: EntityId | null;
  name: string;
  description: string | null;
  offerType: OfferType;
  value: number;
  currency: string;
  validFrom: string;
  validUntil: string;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  scope: OfferScope | null;
  scopeId: EntityId | null;
  status: OfferStatus;
  createdBy: EntityId | null;
  createdAt: string;
  updatedAt: string;
};

// =================================================================== promotion codes

export type PromotionCodeStatus = "ACTIVE" | "EXPIRED" | "EXHAUSTED" | "DISABLED";

export const PROMOTION_CODE_STATUSES: readonly PromotionCodeStatus[] = [
  "ACTIVE",
  "EXPIRED",
  "EXHAUSTED",
  "DISABLED",
];

export type PromotionCode = {
  id: EntityId;
  organizationId: EntityId;
  offerId: EntityId;
  code: string;
  status: PromotionCodeStatus;
  validFrom: string;
  validUntil: string;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  usageCount: number;
  createdBy: EntityId | null;
  createdAt: string;
};

// =================================================================== offer redemption

export type OfferRedemption = {
  id: EntityId;
  organizationId: EntityId;
  offerId: EntityId;
  customerId: EntityId | null;
  campaignId: EntityId | null;
  promotionCodeId: EntityId | null;
  sourceType: string | null;
  sourceId: EntityId | null;
  propertyId: EntityId | null;
  outletId: EntityId | null;
  redeemedAt: string;
  value: number;
  currency: string;
  createdAt: string;
};

// =================================================================== attribution

export type ConversionEventType =
  | "RESTAURANT_ORDER"
  | "HOTEL_BOOKING"
  | "EVENT_LEAD"
  | "EVENT_BOOKING"
  | "DIRECT_BOOKING"
  | "LOYALTY_REDEMPTION"
  | "TAKEAWAY_ORDER";

export const CONVERSION_EVENT_TYPES: readonly ConversionEventType[] = [
  "RESTAURANT_ORDER",
  "HOTEL_BOOKING",
  "EVENT_LEAD",
  "EVENT_BOOKING",
  "DIRECT_BOOKING",
  "LOYALTY_REDEMPTION",
  "TAKEAWAY_ORDER",
];

export type CampaignAttribution = {
  id: EntityId;
  organizationId: EntityId;
  campaignId: EntityId;
  customerId: EntityId;
  channel: CommunicationChannel;
  touchpoint: string;
  conversionEvent: ConversionEventType;
  conversionId: EntityId | null;
  revenue: number | null;
  currency: string | null;
  attributedAt: string;
  createdAt: string;
};

// =================================================================== journey

export type JourneyStepType =
  | "SEND_MESSAGE"
  | "WAIT"
  | "CONDITION"
  | "CONVERSION_CHECK"
  | "END";

export const JOURNEY_STEP_TYPES: readonly JourneyStepType[] = [
  "SEND_MESSAGE",
  "WAIT",
  "CONDITION",
  "CONVERSION_CHECK",
  "END",
];

export type JourneyStep = {
  id: EntityId;
  journeyId: EntityId;
  stepType: JourneyStepType;
  config: Record<string, string | number | boolean | null>;
  nextStepId: EntityId | null;
  branchYesStepId: EntityId | null;
  branchNoStepId: EntityId | null;
  waitDurationHours: number | null;
  position: number;
};

export type JourneyStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";

export const JOURNEY_STATUSES: readonly JourneyStatus[] = [
  "DRAFT",
  "ACTIVE",
  "PAUSED",
  "ARCHIVED",
];

export type MarketingJourney = {
  id: EntityId;
  organizationId: EntityId;
  name: string;
  description: string | null;
  audienceId: EntityId | null;
  status: JourneyStatus;
  triggerType: string | null;
  createdAt: string;
  updatedAt: string;
};

// =================================================================== frequency control

export type FrequencyPolicy = {
  id: EntityId;
  organizationId: EntityId;
  maxMessagesPerPeriod: number;
  periodDays: number;
  quietHourStart: string | null;
  quietHourEnd: string | null;
  updatedAt: string;
};

// =================================================================== analytics

export type CampaignPerformance = {
  campaignId: EntityId;
  audienceSize: number;
  totalSent: number;
  totalDelivered: number;
  totalFailed: number;
  totalOpened: number;
  totalClicked: number;
  totalUnsubscribed: number;
  totalConversions: number;
  attributedRevenue: number;
  offerRedemptions: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  conversionRate: number;
};

export type ChannelPerformance = {
  channel: CommunicationChannel;
  totalSent: number;
  totalDelivered: number;
  totalOpened: number;
  totalClicked: number;
  totalConversions: number;
  attributedRevenue: number;
  deliveryRate: number;
  engagementRate: number;
};

export type MarketingKPIs = {
  activeCampaigns: number;
  totalReach: number;
  averageDeliveryRate: number;
  averageOpenRate: number;
  averageClickRate: number;
  totalConversions: number;
  totalAttributedRevenue: number;
  totalOfferRedemptions: number;
  averageUnsubscribeRate: number;
  newCustomers: number;
  returningCustomers: number;
  reactivatedCustomers: number;
};

export type MarketingFunnelPoint = {
  stage: string;
  count: number;
};

export type CustomerGrowthPoint = {
  date: string;
  newCustomers: number;
  returningCustomers: number;
  reactivatedCustomers: number;
};
