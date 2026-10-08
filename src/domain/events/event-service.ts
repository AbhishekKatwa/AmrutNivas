/**
 * Events & Banquet service layer (Prompt #12, migration 042).
 *
 * Covers venues, events, leads, quotations, tasks, schedule items, vendors,
 * payments and packages. All writes go through SECURITY DEFINER doors; reads
 * are plain SELECTs under RLS.
 */

import { requireSupabase } from "@/db/client";
import { asRead, callDoor, camelRows, firstCamelRow } from "@/db/rpc";
import type { EntityId } from "@/domain/identity/types";
import type {
  EventScope,
  Event,
  EventLead,
  EventVenue,
  EventQuotation,
  EventQuotationItem,
  EventTask,
  EventScheduleItem,
  EventVendor,
  EventPayment,
  EventChange,
  EventPackage,
  EventPackageItem,
  EventStatus,
  EventLeadStatus,
  EventVenueStatus,
  EventQuotationStatus,
  EventTaskStatus,
  EventType,
  EventSource,
  EventLossReason,
  EventPaymentType,
  EventQuotationItemType,
  EventTaskCategory,
  EventTaskPriority,
  EventDepartment,
  EventVenueType,
  EventPricingModel,
} from "./types";

// =================================================================== table names

const EVENT_VENUES = "event_venues";
const EVENTS = "events";
const EVENT_LEADS = "event_leads";
const EVENT_QUOTATIONS = "event_quotations";
const EVENT_QUOTATION_ITEMS = "event_quotation_items";
const EVENT_TASKS = "event_tasks";
const EVENT_SCHEDULE_ITEMS = "event_schedule_items";
const EVENT_VENDORS = "event_vendors";
const EVENT_PAYMENTS = "event_payments";
const EVENT_CHANGES = "event_changes";
const EVENT_PACKAGES = "event_packages";
const EVENT_PACKAGE_ITEMS = "event_package_items";

// =================================================================== column lists

const VENUE_COLUMNS =
  "id, organization_id, property_id, name, code, venue_type, capacity, area_sq_ft, " +
  "status, description, created_at, updated_at";

const EVENT_COLUMNS =
  "id, organization_id, property_id, event_number, lead_id, customer_id, event_type, " +
  "event_name, event_date, start_time, end_time, venue_id, expected_guests, " +
  "confirmed_guests, guaranteed_guests, actual_guests, status, source, sales_owner_id, " +
  "confirmed_at, confirmed_by, confirmation_notes, cancelled_at, cancelled_by, " +
  "cancellation_reason, loss_reason, notes, created_at, updated_at";

const LEAD_COLUMNS =
  "id, organization_id, property_id, lead_number, customer_id, contact_name, mobile, " +
  "email, event_type, event_date, expected_guests, budget, venue_preference, source, " +
  "assigned_to, status, next_follow_up_at, follow_up_notes, converted_event_id, " +
  "loss_reason, notes, created_at, updated_at";

const QUOTATION_COLUMNS =
  "id, organization_id, property_id, event_id, quotation_number, version, status, " +
  "valid_until, subtotal, discount, tax, grand_total, notes, terms, created_by, " +
  "sent_at, accepted_at, created_at, updated_at";

const QUOTATION_ITEM_COLUMNS =
  "id, quotation_id, item_type, description, quantity, uom, unit_rate, discount, " +
  "tax_rate, amount, notes, sort_order, created_at";

const TASK_COLUMNS =
  "id, organization_id, property_id, event_id, title, description, category, " +
  "assigned_to, due_at, priority, status, completed_at, completed_by, created_by, " +
  "created_at, updated_at";

const SCHEDULE_ITEM_COLUMNS =
  "id, organization_id, property_id, event_id, start_time, end_time, title, " +
  "description, department, assigned_to, status, sort_order, created_at";

const VENDOR_COLUMNS =
  "id, organization_id, property_id, event_id, supplier_id, service_description, " +
  "quoted_amount, actual_amount, status, notes, created_at, updated_at";

const PAYMENT_COLUMNS =
  "id, organization_id, property_id, event_id, payment_number, payment_type, amount, " +
  "payment_method, payment_date, reference_number, notes, created_by, created_at";

const CHANGE_COLUMNS =
  "id, organization_id, property_id, event_id, change_type, description, old_value, " +
  "new_value, financial_impact, created_by, created_at";

const PACKAGE_COLUMNS =
  "id, organization_id, property_id, name, code, description, pricing_model, " +
  "base_price, status, created_at, updated_at";

const PACKAGE_ITEM_COLUMNS =
  "id, package_id, item_type, description, quantity, uom, unit_rate, included, " +
  "sort_order, created_at";

// =================================================================== filters

export type EventFilters = {
  status?: EventStatus;
  eventType?: EventType;
  venueId?: EntityId | null;
  customerId?: EntityId | null;
  eventDateFrom?: string;
  eventDateTo?: string;
};

export type LeadFilters = {
  status?: EventLeadStatus;
  eventType?: EventType;
  assignedTo?: EntityId | null;
  source?: EventSource;
};

export type VenueFilters = {
  status?: EventVenueStatus;
  venueType?: EventVenueType;
};

// =================================================================== venues

export async function listEventVenues(
  scope: EventScope,
  filters: VenueFilters = {},
): Promise<EventVenue[]> {
  const sb = requireSupabase();
  let chain = sb
    .from(EVENT_VENUES)
    .select(VENUE_COLUMNS)
    .eq("organization_id", scope.organizationId)
    .eq("property_id", scope.propertyId);

  if (filters.status) chain = chain.eq("status", filters.status);
  if (filters.venueType) chain = chain.eq("venue_type", filters.venueType);

  chain = chain.order("name");
  return camelRows<EventVenue>(asRead(chain));
}

export async function getEventVenue(
  scope: EventScope,
  venueId: EntityId,
): Promise<EventVenue | null> {
  const sb = requireSupabase();
  return firstCamelRow<EventVenue>(
    asRead(
      sb
        .from(EVENT_VENUES)
        .select(VENUE_COLUMNS)
        .eq("id", venueId)
        .eq("organization_id", scope.organizationId)
        .eq("property_id", scope.propertyId),
    ),
  );
}

export async function createEventVenue(
  scope: EventScope,
  params: {
    name: string;
    code?: string | null;
    venueType?: EventVenueType;
    capacity?: number;
    areaSqFt?: number | null;
    description?: string | null;
  },
): Promise<EntityId> {
  return callDoor<EntityId>("create_event_venue", {
    propertyId: scope.propertyId,
    name: params.name,
    code: params.code ?? null,
    venueType: params.venueType ?? "BANQUET_HALL",
    capacity: params.capacity ?? 0,
    areaSqFt: params.areaSqFt ?? null,
    description: params.description ?? null,
  });
}

export async function updateEventVenue(
  venueId: EntityId,
  params: {
    name?: string;
    code?: string;
    venueType?: EventVenueType;
    capacity?: number;
    areaSqFt?: number | null;
    status?: EventVenueStatus;
    description?: string;
  },
): Promise<void> {
  await callDoor("update_event_venue", {
    venueId,
    ...params,
  });
}

export async function checkVenueConflict(
  venueId: EntityId,
  eventDate: string,
  startTime: string,
  endTime: string,
  excludeEventId?: EntityId | null,
): Promise<boolean> {
  return callDoor<boolean>("check_venue_conflict", {
    venueId,
    eventDate,
    startTime,
    endTime,
    excludeEventId: excludeEventId ?? null,
  });
}

// =================================================================== leads

export async function listEventLeads(
  scope: EventScope,
  filters: LeadFilters = {},
): Promise<EventLead[]> {
  const sb = requireSupabase();
  let chain = sb
    .from(EVENT_LEADS)
    .select(LEAD_COLUMNS)
    .eq("organization_id", scope.organizationId)
    .eq("property_id", scope.propertyId);

  if (filters.status) chain = chain.eq("status", filters.status);
  if (filters.eventType) chain = chain.eq("event_type", filters.eventType);
  if (filters.source) chain = chain.eq("source", filters.source);
  if (filters.assignedTo !== undefined) {
    if (filters.assignedTo === null) {
      chain = chain.is("assigned_to", null);
    } else {
      chain = chain.eq("assigned_to", filters.assignedTo);
    }
  }

  chain = chain.order("created_at", { ascending: false });
  return camelRows<EventLead>(asRead(chain));
}

export async function getEventLead(
  scope: EventScope,
  leadId: EntityId,
): Promise<EventLead | null> {
  const sb = requireSupabase();
  return firstCamelRow<EventLead>(
    asRead(
      sb
        .from(EVENT_LEADS)
        .select(LEAD_COLUMNS)
        .eq("id", leadId)
        .eq("organization_id", scope.organizationId)
        .eq("property_id", scope.propertyId),
    ),
  );
}

export async function createEventLead(
  scope: EventScope,
  params: {
    contactName: string;
    mobile?: string | null;
    email?: string | null;
    customerId?: EntityId | null;
    eventType?: EventType;
    eventDate?: string | null;
    expectedGuests?: number | null;
    budget?: number | null;
    venuePreference?: string | null;
    source?: EventSource;
    assignedTo?: EntityId | null;
    notes?: string | null;
  },
): Promise<EntityId> {
  return callDoor<EntityId>("create_event_lead", {
    propertyId: scope.propertyId,
    contactName: params.contactName,
    mobile: params.mobile ?? null,
    email: params.email ?? null,
    customerId: params.customerId ?? null,
    eventType: params.eventType ?? "OTHER",
    eventDate: params.eventDate ?? null,
    expectedGuests: params.expectedGuests ?? null,
    budget: params.budget ?? null,
    venuePreference: params.venuePreference ?? null,
    source: params.source ?? "WALK_IN",
    assignedTo: params.assignedTo ?? null,
    notes: params.notes ?? null,
  });
}

export async function updateEventLead(
  leadId: EntityId,
  params: {
    contactName?: string;
    mobile?: string;
    email?: string;
    customerId?: EntityId | null;
    eventType?: EventType;
    eventDate?: string | null;
    expectedGuests?: number | null;
    budget?: number | null;
    venuePreference?: string | null;
    source?: EventSource;
    assignedTo?: EntityId | null;
    status?: EventLeadStatus;
    nextFollowUpAt?: string | null;
    followUpNotes?: string | null;
    lossReason?: EventLossReason | null;
    notes?: string;
  },
): Promise<void> {
  await callDoor("update_event_lead", {
    leadId,
    ...params,
  });
}

export async function convertLeadToEvent(
  leadId: EntityId,
  propertyId: EntityId,
): Promise<EntityId> {
  return callDoor<EntityId>("convert_lead_to_event", {
    leadId,
    propertyId,
  });
}

// =================================================================== events

export async function listEvents(
  scope: EventScope,
  filters: EventFilters = {},
): Promise<Event[]> {
  const sb = requireSupabase();
  let chain = sb
    .from(EVENTS)
    .select(EVENT_COLUMNS)
    .eq("organization_id", scope.organizationId)
    .eq("property_id", scope.propertyId);

  if (filters.status) chain = chain.eq("status", filters.status);
  if (filters.eventType) chain = chain.eq("event_type", filters.eventType);
  if (filters.customerId) chain = chain.eq("customer_id", filters.customerId);
  if (filters.venueId !== undefined) {
    if (filters.venueId === null) {
      chain = chain.is("venue_id", null);
    } else {
      chain = chain.eq("venue_id", filters.venueId);
    }
  }
  if (filters.eventDateFrom) chain = chain.gte("event_date", filters.eventDateFrom);
  if (filters.eventDateTo) chain = chain.lte("event_date", filters.eventDateTo);

  chain = chain.order("event_date", { ascending: false });
  return camelRows<Event>(asRead(chain));
}

export async function getEvent(
  scope: EventScope,
  eventId: EntityId,
): Promise<Event | null> {
  const sb = requireSupabase();
  return firstCamelRow<Event>(
    asRead(
      sb
        .from(EVENTS)
        .select(EVENT_COLUMNS)
        .eq("id", eventId)
        .eq("organization_id", scope.organizationId)
        .eq("property_id", scope.propertyId),
    ),
  );
}

export async function createEvent(
  scope: EventScope,
  params: {
    eventName: string;
    eventType?: EventType;
    eventDate?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    customerId?: EntityId | null;
    venueId?: EntityId | null;
    expectedGuests?: number | null;
    status?: EventStatus;
    source?: EventSource;
    salesOwnerId?: EntityId | null;
    leadId?: EntityId | null;
    notes?: string | null;
  },
): Promise<EntityId> {
  return callDoor<EntityId>("create_event", {
    propertyId: scope.propertyId,
    eventName: params.eventName,
    eventType: params.eventType ?? "OTHER",
    eventDate: params.eventDate ?? null,
    startTime: params.startTime ?? null,
    endTime: params.endTime ?? null,
    customerId: params.customerId ?? null,
    venueId: params.venueId ?? null,
    expectedGuests: params.expectedGuests ?? null,
    status: params.status ?? "ENQUIRY",
    source: params.source ?? "WALK_IN",
    salesOwnerId: params.salesOwnerId ?? null,
    leadId: params.leadId ?? null,
    notes: params.notes ?? null,
  });
}

export async function updateEvent(
  eventId: EntityId,
  params: {
    eventName?: string;
    eventType?: EventType;
    eventDate?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    customerId?: EntityId | null;
    venueId?: EntityId | null;
    expectedGuests?: number | null;
    confirmedGuests?: number | null;
    guaranteedGuests?: number | null;
    actualGuests?: number | null;
    status?: EventStatus;
    source?: EventSource;
    salesOwnerId?: EntityId | null;
    notes?: string;
  },
): Promise<void> {
  await callDoor("update_event", {
    eventId,
    ...params,
  });
}

export async function confirmEvent(
  eventId: EntityId,
  notes?: string | null,
): Promise<void> {
  await callDoor("confirm_event", {
    eventId,
    notes: notes ?? null,
  });
}

export async function cancelEvent(
  eventId: EntityId,
  reason: string,
  lossReason?: EventLossReason | null,
): Promise<void> {
  await callDoor("cancel_event", {
    eventId,
    reason,
    lossReason: lossReason ?? null,
  });
}

// =================================================================== quotations

export async function listEventQuotations(
  scope: EventScope,
  eventId: EntityId,
): Promise<EventQuotation[]> {
  const sb = requireSupabase();
  const chain = sb
    .from(EVENT_QUOTATIONS)
    .select(QUOTATION_COLUMNS)
    .eq("organization_id", scope.organizationId)
    .eq("property_id", scope.propertyId)
    .eq("event_id", eventId)
    .order("version", { ascending: false });

  return camelRows<EventQuotation>(asRead(chain));
}

export async function getEventQuotation(
  scope: EventScope,
  quotationId: EntityId,
): Promise<EventQuotation | null> {
  const sb = requireSupabase();
  return firstCamelRow<EventQuotation>(
    asRead(
      sb
        .from(EVENT_QUOTATIONS)
        .select(QUOTATION_COLUMNS)
        .eq("id", quotationId)
        .eq("organization_id", scope.organizationId)
        .eq("property_id", scope.propertyId),
    ),
  );
}

export async function createEventQuotation(
  eventId: EntityId,
  params?: {
    validUntil?: string | null;
    notes?: string | null;
    terms?: string | null;
  },
): Promise<EntityId> {
  return callDoor<EntityId>("create_event_quotation", {
    eventId,
    validUntil: params?.validUntil ?? null,
    notes: params?.notes ?? null,
    terms: params?.terms ?? null,
  });
}

export async function updateEventQuotation(
  quotationId: EntityId,
  params: {
    status?: EventQuotationStatus;
    validUntil?: string | null;
    notes?: string;
    terms?: string;
  },
): Promise<void> {
  await callDoor("update_event_quotation", {
    quotationId,
    ...params,
  });
}

export async function listQuotationItems(
  quotationId: EntityId,
): Promise<EventQuotationItem[]> {
  const sb = requireSupabase();
  const chain = sb
    .from(EVENT_QUOTATION_ITEMS)
    .select(QUOTATION_ITEM_COLUMNS)
    .eq("quotation_id", quotationId)
    .order("sort_order", { ascending: true });

  return camelRows<EventQuotationItem>(asRead(chain));
}

export async function addQuotationItem(
  quotationId: EntityId,
  params: {
    itemType: EventQuotationItemType;
    description: string;
    quantity?: number;
    uom?: string | null;
    unitRate?: number;
    discount?: number;
    taxRate?: number;
    notes?: string | null;
    sortOrder?: number;
  },
): Promise<EntityId> {
  return callDoor<EntityId>("add_quotation_item", {
    quotationId,
    itemType: params.itemType,
    description: params.description,
    quantity: params.quantity ?? 1,
    uom: params.uom ?? null,
    unitRate: params.unitRate ?? 0,
    discount: params.discount ?? 0,
    taxRate: params.taxRate ?? 0,
    notes: params.notes ?? null,
    sortOrder: params.sortOrder ?? 0,
  });
}

export async function removeQuotationItem(itemId: EntityId): Promise<void> {
  await callDoor("remove_quotation_item", { itemId });
}

// =================================================================== tasks

export async function listEventTasks(
  scope: EventScope,
  eventId: EntityId,
  filters?: { status?: EventTaskStatus; category?: EventTaskCategory },
): Promise<EventTask[]> {
  const sb = requireSupabase();
  let chain = sb
    .from(EVENT_TASKS)
    .select(TASK_COLUMNS)
    .eq("organization_id", scope.organizationId)
    .eq("property_id", scope.propertyId)
    .eq("event_id", eventId);

  if (filters?.status) chain = chain.eq("status", filters.status);
  if (filters?.category) chain = chain.eq("category", filters.category);

  chain = chain.order("due_at", { ascending: true });
  return camelRows<EventTask>(asRead(chain));
}

export async function createEventTask(
  eventId: EntityId,
  params: {
    title: string;
    description?: string | null;
    category?: EventTaskCategory;
    assignedTo?: EntityId | null;
    dueAt?: string | null;
    priority?: EventTaskPriority;
  },
): Promise<EntityId> {
  return callDoor<EntityId>("create_event_task", {
    eventId,
    title: params.title,
    description: params.description ?? null,
    category: params.category ?? "GENERAL",
    assignedTo: params.assignedTo ?? null,
    dueAt: params.dueAt ?? null,
    priority: params.priority ?? "NORMAL",
  });
}

export async function updateEventTask(
  taskId: EntityId,
  params: {
    title?: string;
    description?: string;
    category?: EventTaskCategory;
    assignedTo?: EntityId | null;
    dueAt?: string | null;
    priority?: EventTaskPriority;
    status?: EventTaskStatus;
  },
): Promise<void> {
  await callDoor("update_event_task", {
    taskId,
    ...params,
  });
}

// =================================================================== schedule items

export async function listEventScheduleItems(
  scope: EventScope,
  eventId: EntityId,
): Promise<EventScheduleItem[]> {
  const sb = requireSupabase();
  const chain = sb
    .from(EVENT_SCHEDULE_ITEMS)
    .select(SCHEDULE_ITEM_COLUMNS)
    .eq("organization_id", scope.organizationId)
    .eq("property_id", scope.propertyId)
    .eq("event_id", eventId)
    .order("start_time", { ascending: true });

  return camelRows<EventScheduleItem>(asRead(chain));
}

export async function createEventScheduleItem(
  eventId: EntityId,
  params: {
    startTime: string;
    title: string;
    endTime?: string | null;
    description?: string | null;
    department?: EventDepartment;
    assignedTo?: EntityId | null;
    sortOrder?: number;
  },
): Promise<EntityId> {
  return callDoor<EntityId>("create_event_schedule_item", {
    eventId,
    startTime: params.startTime,
    title: params.title,
    endTime: params.endTime ?? null,
    description: params.description ?? null,
    department: params.department ?? "OTHER",
    assignedTo: params.assignedTo ?? null,
    sortOrder: params.sortOrder ?? 0,
  });
}

export async function deleteEventScheduleItem(itemId: EntityId): Promise<void> {
  await callDoor("delete_event_schedule_item", { itemId });
}

// =================================================================== vendors

export async function listEventVendors(
  scope: EventScope,
  eventId: EntityId,
): Promise<EventVendor[]> {
  const sb = requireSupabase();
  const chain = sb
    .from(EVENT_VENDORS)
    .select(VENDOR_COLUMNS)
    .eq("organization_id", scope.organizationId)
    .eq("property_id", scope.propertyId)
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  return camelRows<EventVendor>(asRead(chain));
}

export async function createEventVendor(
  eventId: EntityId,
  params: {
    supplierId: EntityId;
    serviceDescription: string;
    quotedAmount?: number | null;
    notes?: string | null;
  },
): Promise<EntityId> {
  return callDoor<EntityId>("create_event_vendor", {
    eventId,
    supplierId: params.supplierId,
    serviceDescription: params.serviceDescription,
    quotedAmount: params.quotedAmount ?? null,
    notes: params.notes ?? null,
  });
}

export async function updateEventVendor(
  vendorId: EntityId,
  params: {
    serviceDescription?: string;
    quotedAmount?: number | null;
    actualAmount?: number | null;
    status?: string;
    notes?: string;
  },
): Promise<void> {
  await callDoor("update_event_vendor", {
    vendorId,
    ...params,
  });
}

export async function deleteEventVendor(vendorId: EntityId): Promise<void> {
  await callDoor("delete_event_vendor", { vendorId });
}

// =================================================================== payments

export async function listEventPayments(
  scope: EventScope,
  eventId: EntityId,
): Promise<EventPayment[]> {
  const sb = requireSupabase();
  const chain = sb
    .from(EVENT_PAYMENTS)
    .select(PAYMENT_COLUMNS)
    .eq("organization_id", scope.organizationId)
    .eq("property_id", scope.propertyId)
    .eq("event_id", eventId)
    .order("payment_date", { ascending: true });

  return camelRows<EventPayment>(asRead(chain));
}

export async function createEventPayment(
  eventId: EntityId,
  params: {
    paymentType: EventPaymentType;
    amount: number;
    paymentDate: string;
    paymentMethod?: string | null;
    referenceNumber?: string | null;
    notes?: string | null;
  },
): Promise<EntityId> {
  return callDoor<EntityId>("create_event_payment", {
    eventId,
    paymentType: params.paymentType,
    amount: params.amount,
    paymentDate: params.paymentDate,
    paymentMethod: params.paymentMethod ?? null,
    referenceNumber: params.referenceNumber ?? null,
    notes: params.notes ?? null,
  });
}

// =================================================================== changes

export async function listEventChanges(
  scope: EventScope,
  eventId: EntityId,
): Promise<EventChange[]> {
  const sb = requireSupabase();
  const chain = sb
    .from(EVENT_CHANGES)
    .select(CHANGE_COLUMNS)
    .eq("organization_id", scope.organizationId)
    .eq("property_id", scope.propertyId)
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  return camelRows<EventChange>(asRead(chain));
}

// =================================================================== packages

export async function listEventPackages(
  scope: EventScope,
): Promise<EventPackage[]> {
  const sb = requireSupabase();
  const chain = sb
    .from(EVENT_PACKAGES)
    .select(PACKAGE_COLUMNS)
    .eq("organization_id", scope.organizationId)
    .eq("property_id", scope.propertyId)
    .order("name");

  return camelRows<EventPackage>(asRead(chain));
}

export async function createEventPackage(
  scope: EventScope,
  params: {
    name: string;
    code?: string | null;
    description?: string | null;
    pricingModel?: EventPricingModel;
    basePrice?: number;
  },
): Promise<EntityId> {
  return callDoor<EntityId>("create_event_package", {
    propertyId: scope.propertyId,
    name: params.name,
    code: params.code ?? null,
    description: params.description ?? null,
    pricingModel: params.pricingModel ?? "PER_PERSON",
    basePrice: params.basePrice ?? 0,
  });
}

export async function listPackageItems(
  packageId: EntityId,
): Promise<EventPackageItem[]> {
  const sb = requireSupabase();
  const chain = sb
    .from(EVENT_PACKAGE_ITEMS)
    .select(PACKAGE_ITEM_COLUMNS)
    .eq("package_id", packageId)
    .order("sort_order", { ascending: true });

  return camelRows<EventPackageItem>(asRead(chain));
}
