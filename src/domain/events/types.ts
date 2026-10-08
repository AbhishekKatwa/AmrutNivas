/**
 * Events & Banquet domain types (Prompt #12, migration 042).
 *
 * Covers the full event lifecycle: leads/enquiries → quotations → bookings →
 * planning → execution → billing → settlement → P&L. All tables are org+property
 * scoped under RLS. Writes go through security-definer doors; reads are plain
 * SELECTs.
 *
 * Key concepts:
 *   - Event: the core entity, linked to a CRM customer and optional venue
 *   - EventLead: pre-booking enquiry, convertible to an Event
 *   - EventVenue: bookable spaces with conflict detection
 *   - EventQuotation: versioned pricing proposals with line items
 *   - EventPackage: reusable bundles (Silver/Gold/Platinum)
 *   - EventTask: planning and execution to-dos
 *   - EventScheduleItem: day-of run sheet entries
 *   - EventResource: reference-based allocation (venue, room, equipment, staff)
 *   - EventVendor: links to existing suppliers for event services
 *   - EventChange: append-only audit trail for significant changes
 *   - EventPayment: advance/partial/final/refund payments
 */

import type { EntityId } from "@/domain/identity/types";

// =================================================================== event types

export type EventType =
  | "WEDDING"
  | "RECEPTION"
  | "ENGAGEMENT"
  | "BIRTHDAY"
  | "ANNIVERSARY"
  | "CORPORATE"
  | "CONFERENCE"
  | "MEETING"
  | "SEMINAR"
  | "PRODUCT_LAUNCH"
  | "FAMILY_FUNCTION"
  | "RELIGIOUS"
  | "BANQUET"
  | "PRIVATE_DINING"
  | "CATERING"
  | "OTHER";

export const EVENT_TYPES: readonly EventType[] = [
  "WEDDING",
  "RECEPTION",
  "ENGAGEMENT",
  "BIRTHDAY",
  "ANNIVERSARY",
  "CORPORATE",
  "CONFERENCE",
  "MEETING",
  "SEMINAR",
  "PRODUCT_LAUNCH",
  "FAMILY_FUNCTION",
  "RELIGIOUS",
  "BANQUET",
  "PRIVATE_DINING",
  "CATERING",
  "OTHER",
];

// =================================================================== event statuses

export type EventStatus =
  | "ENQUIRY"
  | "FOLLOW_UP"
  | "QUOTED"
  | "NEGOTIATION"
  | "TENTATIVE"
  | "CONFIRMED"
  | "IN_PLANNING"
  | "READY"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CLOSED"
  | "CANCELLED"
  | "LOST";

export const EVENT_STATUSES: readonly EventStatus[] = [
  "ENQUIRY",
  "FOLLOW_UP",
  "QUOTED",
  "NEGOTIATION",
  "TENTATIVE",
  "CONFIRMED",
  "IN_PLANNING",
  "READY",
  "IN_PROGRESS",
  "COMPLETED",
  "CLOSED",
  "CANCELLED",
  "LOST",
];

/** Pipeline stages with probability weights for forecasting. */
export const EVENT_PIPELINE_PROBABILITY: Record<string, number> = {
  ENQUIRY: 10,
  FOLLOW_UP: 20,
  QUOTED: 40,
  NEGOTIATION: 60,
  TENTATIVE: 80,
  CONFIRMED: 100,
};

// =================================================================== event sources

export type EventSource =
  | "WALK_IN"
  | "PHONE"
  | "WEBSITE"
  | "WHATSAPP"
  | "REFERRAL"
  | "CORPORATE"
  | "SOCIAL_MEDIA"
  | "EXISTING_CUSTOMER"
  | "OTHER";

export const EVENT_SOURCES: readonly EventSource[] = [
  "WALK_IN",
  "PHONE",
  "WEBSITE",
  "WHATSAPP",
  "REFERRAL",
  "CORPORATE",
  "SOCIAL_MEDIA",
  "EXISTING_CUSTOMER",
  "OTHER",
];

// =================================================================== lead statuses

export type EventLeadStatus =
  | "NEW"
  | "CONTACTED"
  | "FOLLOW_UP"
  | "QUOTED"
  | "NEGOTIATION"
  | "CONVERTED"
  | "LOST"
  | "CANCELLED";

export const EVENT_LEAD_STATUSES: readonly EventLeadStatus[] = [
  "NEW",
  "CONTACTED",
  "FOLLOW_UP",
  "QUOTED",
  "NEGOTIATION",
  "CONVERTED",
  "LOST",
  "CANCELLED",
];

// =================================================================== venue types

export type EventVenueType =
  | "BANQUET_HALL"
  | "LAWN"
  | "ROOFTOP"
  | "RESTAURANT"
  | "PRIVATE_ROOM"
  | "CONFERENCE_ROOM"
  | "MEETING_ROOM"
  | "POOL_SIDE"
  | "OUTDOOR"
  | "OTHER";

export const EVENT_VENUE_TYPES: readonly EventVenueType[] = [
  "BANQUET_HALL",
  "LAWN",
  "ROOFTOP",
  "RESTAURANT",
  "PRIVATE_ROOM",
  "CONFERENCE_ROOM",
  "MEETING_ROOM",
  "POOL_SIDE",
  "OUTDOOR",
  "OTHER",
];

// =================================================================== venue statuses

export type EventVenueStatus = "AVAILABLE" | "BLOCKED" | "MAINTENANCE" | "INACTIVE";

export const EVENT_VENUE_STATUSES: readonly EventVenueStatus[] = [
  "AVAILABLE",
  "BLOCKED",
  "MAINTENANCE",
  "INACTIVE",
];

// =================================================================== quotation statuses

export type EventQuotationStatus =
  | "DRAFT"
  | "SENT"
  | "VIEWED"
  | "NEGOTIATION"
  | "ACCEPTED"
  | "REJECTED"
  | "EXPIRED"
  | "CANCELLED";

export const EVENT_QUOTATION_STATUSES: readonly EventQuotationStatus[] = [
  "DRAFT",
  "SENT",
  "VIEWED",
  "NEGOTIATION",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
];

// =================================================================== quotation item types

export type EventQuotationItemType =
  | "VENUE"
  | "FOOD"
  | "BEVERAGE"
  | "ROOM"
  | "DECORATION"
  | "AV"
  | "EQUIPMENT"
  | "STAFF"
  | "SERVICE"
  | "TRANSPORT"
  | "PACKAGE"
  | "OTHER";

export const EVENT_QUOTATION_ITEM_TYPES: readonly EventQuotationItemType[] = [
  "VENUE",
  "FOOD",
  "BEVERAGE",
  "ROOM",
  "DECORATION",
  "AV",
  "EQUIPMENT",
  "STAFF",
  "SERVICE",
  "TRANSPORT",
  "PACKAGE",
  "OTHER",
];

// =================================================================== pricing models

export type EventPricingModel = "PER_PERSON" | "FIXED" | "PER_HOUR" | "PER_ROOM" | "CUSTOM";

export const EVENT_PRICING_MODELS: readonly EventPricingModel[] = [
  "PER_PERSON",
  "FIXED",
  "PER_HOUR",
  "PER_ROOM",
  "CUSTOM",
];

// =================================================================== task categories

export type EventTaskCategory =
  | "SALES"
  | "VENUE"
  | "FOOD"
  | "DECORATION"
  | "AV"
  | "ROOMS"
  | "PROCUREMENT"
  | "STAFF"
  | "GUEST"
  | "FINANCE"
  | "GENERAL";

export const EVENT_TASK_CATEGORIES: readonly EventTaskCategory[] = [
  "SALES",
  "VENUE",
  "FOOD",
  "DECORATION",
  "AV",
  "ROOMS",
  "PROCUREMENT",
  "STAFF",
  "GUEST",
  "FINANCE",
  "GENERAL",
];

// =================================================================== task priorities

export type EventTaskPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export const EVENT_TASK_PRIORITIES: readonly EventTaskPriority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];

// =================================================================== task statuses

export type EventTaskStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED" | "CANCELLED";

export const EVENT_TASK_STATUSES: readonly EventTaskStatus[] = [
  "TODO",
  "IN_PROGRESS",
  "BLOCKED",
  "COMPLETED",
  "CANCELLED",
];

// =================================================================== departments

export type EventDepartment =
  | "SALES"
  | "FRONT_OFFICE"
  | "HOUSEKEEPING"
  | "KITCHEN"
  | "RESTAURANT"
  | "BANQUET"
  | "MAINTENANCE"
  | "FINANCE"
  | "OTHER";

export const EVENT_DEPARTMENTS: readonly EventDepartment[] = [
  "SALES",
  "FRONT_OFFICE",
  "HOUSEKEEPING",
  "KITCHEN",
  "RESTAURANT",
  "BANQUET",
  "MAINTENANCE",
  "FINANCE",
  "OTHER",
];

// =================================================================== loss reasons

export type EventLossReason =
  | "PRICE"
  | "VENUE_UNAVAILABLE"
  | "COMPETITOR"
  | "DATE_CONFLICT"
  | "CUSTOMER_CANCELLED"
  | "BUDGET"
  | "LOCATION"
  | "NO_RESPONSE"
  | "OTHER";

export const EVENT_LOSS_REASONS: readonly EventLossReason[] = [
  "PRICE",
  "VENUE_UNAVAILABLE",
  "COMPETITOR",
  "DATE_CONFLICT",
  "CUSTOMER_CANCELLED",
  "BUDGET",
  "LOCATION",
  "NO_RESPONSE",
  "OTHER",
];

// =================================================================== payment types

export type EventPaymentType = "ADVANCE" | "PARTIAL" | "FINAL" | "REFUND";

export const EVENT_PAYMENT_TYPES: readonly EventPaymentType[] = [
  "ADVANCE",
  "PARTIAL",
  "FINAL",
  "REFUND",
];

// =================================================================== scope

export type EventScope = {
  organizationId: EntityId;
  propertyId: EntityId;
};

// =================================================================== entities

export type EventVenue = {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;

  name: string;
  code: string | null;
  venueType: EventVenueType;
  capacity: number;
  areaSqFt: number | null;
  status: EventVenueStatus;
  description: string | null;

  createdAt: string;
  updatedAt: string;
};

export type Event = {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;

  eventNumber: string;
  leadId: EntityId | null;

  customerId: EntityId | null;
  eventType: EventType;
  eventName: string;

  eventDate: string;
  startTime: string | null;
  endTime: string | null;

  venueId: EntityId | null;

  expectedGuests: number | null;
  confirmedGuests: number | null;
  guaranteedGuests: number | null;
  actualGuests: number | null;

  status: EventStatus;
  source: EventSource;

  salesOwnerId: EntityId | null;

  confirmedAt: string | null;
  confirmedBy: EntityId | null;
  confirmationNotes: string | null;

  cancelledAt: string | null;
  cancelledBy: EntityId | null;
  cancellationReason: string | null;
  lossReason: EventLossReason | null;

  notes: string | null;

  createdAt: string;
  updatedAt: string;
};

export type EventLead = {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;

  leadNumber: string;

  customerId: EntityId | null;
  contactName: string;
  mobile: string | null;
  email: string | null;

  eventType: EventType;
  eventDate: string | null;
  expectedGuests: number | null;
  budget: number | null;
  venuePreference: string | null;

  source: EventSource;
  assignedTo: EntityId | null;

  status: EventLeadStatus;
  nextFollowUpAt: string | null;
  followUpNotes: string | null;

  convertedEventId: EntityId | null;
  lossReason: EventLossReason | null;

  notes: string | null;

  createdAt: string;
  updatedAt: string;
};

export type EventQuotation = {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;

  eventId: EntityId;
  quotationNumber: string;
  version: number;

  status: EventQuotationStatus;
  validUntil: string | null;

  subtotal: number;
  discount: number;
  tax: number;
  grandTotal: number;

  notes: string | null;
  terms: string | null;

  createdBy: EntityId | null;
  sentAt: string | null;
  acceptedAt: string | null;

  createdAt: string;
  updatedAt: string;
};

export type EventQuotationItem = {
  id: EntityId;
  quotationId: EntityId;

  itemType: EventQuotationItemType;
  description: string;

  quantity: number;
  uom: string | null;
  unitRate: number;

  discount: number;
  taxRate: number;
  amount: number;

  notes: string | null;
  sortOrder: number;

  createdAt: string;
};

export type EventPackage = {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;

  name: string;
  code: string | null;
  description: string | null;
  pricingModel: EventPricingModel;
  basePrice: number;
  status: string;

  createdAt: string;
  updatedAt: string;
};

export type EventPackageItem = {
  id: EntityId;
  packageId: EntityId;

  itemType: EventQuotationItemType;
  description: string;
  quantity: number;
  uom: string | null;
  unitRate: number;

  included: boolean;
  sortOrder: number;

  createdAt: string;
};

export type EventTask = {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  eventId: EntityId;

  title: string;
  description: string | null;
  category: EventTaskCategory;

  assignedTo: EntityId | null;
  dueAt: string | null;
  priority: EventTaskPriority;
  status: EventTaskStatus;

  completedAt: string | null;
  completedBy: EntityId | null;

  createdBy: EntityId | null;
  createdAt: string;
  updatedAt: string;
};

export type EventScheduleItem = {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  eventId: EntityId;

  startTime: string;
  endTime: string | null;
  title: string;
  description: string | null;
  department: EventDepartment;
  assignedTo: EntityId | null;
  status: string;

  sortOrder: number;
  createdAt: string;
};

export type EventResource = {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  eventId: EntityId;

  resourceType: string;
  resourceId: EntityId | null;
  quantity: number;
  startAt: string | null;
  endAt: string | null;
  status: string;
  notes: string | null;

  createdAt: string;
};

export type EventVendor = {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  eventId: EntityId;

  supplierId: EntityId;
  serviceDescription: string;
  quotedAmount: number | null;
  actualAmount: number | null;
  status: string;
  notes: string | null;

  createdAt: string;
  updatedAt: string;
};

export type EventChange = {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  eventId: EntityId;

  changeType: string;
  description: string;
  oldValue: string | null;
  newValue: string | null;
  financialImpact: number | null;

  createdBy: EntityId | null;
  createdAt: string;
};

export type EventPayment = {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  eventId: EntityId;

  paymentNumber: string;
  paymentType: EventPaymentType;

  amount: number;
  paymentMethod: string | null;
  paymentDate: string;
  referenceNumber: string | null;

  notes: string | null;

  createdBy: EntityId | null;
  createdAt: string;
};
