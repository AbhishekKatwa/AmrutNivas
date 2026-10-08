/**
 * CRM domain types (Prompt #11, migration 041).
 *
 * Extends the Guest entity into a unified customer identity. All CRM tables
 * reference guests.id as the customer FK. Financial metrics are derived, never
 * stored. Loyalty uses an append-only transaction ledger.
 *
 * Key concepts:
 *   - Customer = Guest (canonical identity, extended with CRM fields)
 *   - Preferences: communication + structured key/value per category
 *   - Tags: org-scoped labels, assigned to customers
 *   - Notes: per-customer, per-property optional
 *   - Feedback: ratings + comments, linked to references
 *   - Complaints: tracked issues with resolution workflow
 *   - Loyalty: programs → tiers → accounts → transactions (append-only)
 *   - Corporate accounts: company entities linked to guests
 *   - Relationships: customer-to-customer links (family, colleagues)
 */

import type { EntityId } from "@/domain/identity/types";

// =================================================================== customer (extended guest)

export type CustomerType =
  | "INDIVIDUAL"
  | "CORPORATE"
  | "TRAVEL_AGENT"
  | "EVENT_CUSTOMER"
  | "WALK_IN"
  | "OTHER";

export const CUSTOMER_TYPES: readonly CustomerType[] = [
  "INDIVIDUAL",
  "CORPORATE",
  "TRAVEL_AGENT",
  "EVENT_CUSTOMER",
  "WALK_IN",
  "OTHER",
];

/**
 * CRM-enriched customer view. The Guest type from hotel/types is the base;
 * these are the additional CRM fields added by migration 041.
 */
export type CustomerCrmFields = {
  customerType: CustomerType | null;
  companyName: string | null;
  designation: string | null;
  anniversaryDate: string | null;
  corporateAccountId: EntityId | null;
};

// =================================================================== preferences

export type PreferredCommunication = "PHONE" | "SMS" | "EMAIL" | "WHATSAPP" | "NONE";

export const PREFERRED_COMMUNICATIONS: readonly PreferredCommunication[] = [
  "PHONE",
  "SMS",
  "EMAIL",
  "WHATSAPP",
  "NONE",
];

export type CustomerPreference = {
  id: EntityId;
  organizationId: EntityId;
  customerId: EntityId;

  preferredLanguage: string | null;
  preferredCommunication: PreferredCommunication | null;
  marketingEmailAllowed: boolean;
  marketingSmsAllowed: boolean;
  marketingWhatsappAllowed: boolean;
  transactionalCommunicationAllowed: boolean;
  consentUpdatedAt: string | null;
  consentSource: string | null;

  category: string | null;
  prefKey: string | null;
  prefValue: string | null;
  source: string | null;
  notes: string | null;

  createdAt: string;
  updatedAt: string;
};

// =================================================================== tags

export type CustomerTagStatus = "ACTIVE" | "ARCHIVED";

export const CUSTOMER_TAG_STATUSES: readonly CustomerTagStatus[] = ["ACTIVE", "ARCHIVED"];

export type CustomerTag = {
  id: EntityId;
  organizationId: EntityId;
  name: string;
  color: string | null;
  description: string | null;
  status: CustomerTagStatus;
  createdAt: string;
  updatedAt: string;
};

export type CustomerTagAssignment = {
  id: EntityId;
  organizationId: EntityId;
  customerId: EntityId;
  tagId: EntityId;
  createdBy: EntityId | null;
  createdAt: string;
};

// =================================================================== notes

export type CustomerNoteType =
  | "GENERAL"
  | "SERVICE"
  | "PREFERENCE"
  | "COMPLAINT"
  | "FOLLOW_UP"
  | "VIP"
  | "OTHER";

export const CUSTOMER_NOTE_TYPES: readonly CustomerNoteType[] = [
  "GENERAL",
  "SERVICE",
  "PREFERENCE",
  "COMPLAINT",
  "FOLLOW_UP",
  "VIP",
  "OTHER",
];

export type CustomerNote = {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId | null;
  customerId: EntityId;
  note: string;
  noteType: CustomerNoteType;
  createdBy: EntityId | null;
  createdAt: string;
  updatedAt: string;
};

// =================================================================== feedback

export type FeedbackCategory =
  | "FOOD"
  | "SERVICE"
  | "ROOM"
  | "CLEANLINESS"
  | "STAFF"
  | "VALUE"
  | "AMBIENCE"
  | "OTHER";

export const FEEDBACK_CATEGORIES: readonly FeedbackCategory[] = [
  "FOOD",
  "SERVICE",
  "ROOM",
  "CLEANLINESS",
  "STAFF",
  "VALUE",
  "AMBIENCE",
  "OTHER",
];

export type FeedbackStatus = "OPEN" | "IN_REVIEW" | "RESOLVED" | "CLOSED";

export const FEEDBACK_STATUSES: readonly FeedbackStatus[] = [
  "OPEN",
  "IN_REVIEW",
  "RESOLVED",
  "CLOSED",
];

export type FeedbackSource = "INTERNAL" | "WEBSITE" | "QR" | "STAFF" | "OTHER";

export const FEEDBACK_SOURCES: readonly FeedbackSource[] = [
  "INTERNAL",
  "WEBSITE",
  "QR",
  "STAFF",
  "OTHER",
];

export type CustomerFeedback = {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId | null;
  outletId: EntityId | null;
  customerId: EntityId;

  source: FeedbackSource;
  rating: number | null;
  category: FeedbackCategory;
  comment: string | null;

  referenceType: string | null;
  referenceId: EntityId | null;

  status: FeedbackStatus;
  createdAt: string;
};

// =================================================================== complaints

export type ComplaintPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export const COMPLAINT_PRIORITIES: readonly ComplaintPriority[] = [
  "LOW",
  "NORMAL",
  "HIGH",
  "URGENT",
];

export type ComplaintStatus = "OPEN" | "ASSIGNED" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

export const COMPLAINT_STATUSES: readonly ComplaintStatus[] = [
  "OPEN",
  "ASSIGNED",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
];

export type Complaint = {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId | null;
  outletId: EntityId | null;
  customerId: EntityId | null;

  category: FeedbackCategory;
  priority: ComplaintPriority;
  description: string;

  referenceType: string | null;
  referenceId: EntityId | null;

  assignedTo: EntityId | null;
  status: ComplaintStatus;
  resolution: string | null;
  resolvedAt: string | null;

  createdBy: EntityId | null;
  createdAt: string;
  updatedAt: string;
};

// =================================================================== loyalty programs

export type LoyaltyProgramStatus = "ACTIVE" | "INACTIVE";

export const LOYALTY_PROGRAM_STATUSES: readonly LoyaltyProgramStatus[] = ["ACTIVE", "INACTIVE"];

export type LoyaltyProgram = {
  id: EntityId;
  organizationId: EntityId;

  name: string;
  description: string | null;

  currency: string;
  pointsName: string;

  pointsPerAmount: string | null;
  minimumSpend: string | null;
  eligibleTransactionTypes: string[] | null;

  earningEnabled: boolean;
  redemptionEnabled: boolean;

  status: LoyaltyProgramStatus;
  createdAt: string;
  updatedAt: string;
};

// =================================================================== loyalty tiers

export type LoyaltyTierStatus = "ACTIVE" | "INACTIVE";

export const LOYALTY_TIER_STATUSES: readonly LoyaltyTierStatus[] = ["ACTIVE", "INACTIVE"];

export type LoyaltyTier = {
  id: EntityId;
  organizationId: EntityId;
  programId: EntityId;

  name: string;
  rank: number;
  minimumLifetimeSpend: string | null;
  minimumVisits: number | null;
  benefitsDescription: string | null;

  status: LoyaltyTierStatus;
  createdAt: string;
};

// =================================================================== loyalty accounts

export type LoyaltyAccountStatus = "ACTIVE" | "SUSPENDED" | "CLOSED";

export const LOYALTY_ACCOUNT_STATUSES: readonly LoyaltyAccountStatus[] = [
  "ACTIVE",
  "SUSPENDED",
  "CLOSED",
];

export type LoyaltyAccount = {
  id: EntityId;
  organizationId: EntityId;
  programId: EntityId;
  customerId: EntityId;

  memberNumber: string;
  currentPoints: string;
  lifetimeEarned: string;
  lifetimeRedeemed: string;

  tierId: EntityId | null;
  status: LoyaltyAccountStatus;
  joinedAt: string;

  createdAt: string;
  updatedAt: string;
};

// =================================================================== loyalty transactions

export type LoyaltyTransactionType =
  | "EARN"
  | "REDEEM"
  | "ADJUSTMENT"
  | "EXPIRE"
  | "BONUS"
  | "REVERSAL";

export const LOYALTY_TRANSACTION_TYPES: readonly LoyaltyTransactionType[] = [
  "EARN",
  "REDEEM",
  "ADJUSTMENT",
  "EXPIRE",
  "BONUS",
  "REVERSAL",
];

export type LoyaltyTransaction = {
  id: EntityId;
  organizationId: EntityId;
  loyaltyAccountId: EntityId;
  customerId: EntityId;

  type: LoyaltyTransactionType;
  points: string;
  balanceAfter: string;

  referenceType: string | null;
  referenceId: EntityId | null;

  description: string | null;
  createdBy: EntityId | null;
  createdAt: string;
};

// =================================================================== corporate accounts

export type CorporateAccountStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";

export const CORPORATE_ACCOUNT_STATUSES: readonly CorporateAccountStatus[] = [
  "ACTIVE",
  "INACTIVE",
  "ARCHIVED",
];

export type CorporateAccount = {
  id: EntityId;
  organizationId: EntityId;

  name: string;
  code: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  billingAddress: string | null;
  taxId: string | null;
  creditLimit: string | null;
  paymentTerms: string | null;

  status: CorporateAccountStatus;
  createdAt: string;
  updatedAt: string;
};

// =================================================================== customer relationships

export type RelationshipType =
  | "SPOUSE"
  | "PARENT"
  | "CHILD"
  | "SIBLING"
  | "COLLEAGUE"
  | "ASSISTANT"
  | "OTHER";

export const RELATIONSHIP_TYPES: readonly RelationshipType[] = [
  "SPOUSE",
  "PARENT",
  "CHILD",
  "SIBLING",
  "COLLEAGUE",
  "ASSISTANT",
  "OTHER",
];

export type CustomerRelationship = {
  id: EntityId;
  organizationId: EntityId;
  customerId: EntityId;
  relatedCustomerId: EntityId;
  relationshipType: RelationshipType;
  createdAt: string;
};
