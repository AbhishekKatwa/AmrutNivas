/**
 * CRM service layer (Prompt #11, migration 041).
 *
 * Covers customer preferences, tags, notes, feedback, complaints, loyalty
 * (programs/accounts/transactions), corporate accounts, and relationships.
 * All writes go through SECURITY DEFINER doors; reads are plain SELECTs under RLS.
 */

import { requireSupabase } from "@/db/client";
import { asRead, callDoor, callDoorRow, camelRows, firstCamelRow } from "@/db/rpc";
import type { EntityId } from "@/domain/identity/types";
import type {
  CustomerPreference,
  CustomerTag,
  CustomerTagAssignment,
  CustomerNote,
  CustomerNoteType,
  CustomerFeedback,
  FeedbackCategory,
  FeedbackSource,
  FeedbackStatus,
  Complaint,
  ComplaintPriority,
  ComplaintStatus,
  LoyaltyProgram,
  LoyaltyTier,
  LoyaltyAccount,
  LoyaltyTransaction,
  LoyaltyTransactionType,
  CorporateAccount,
  CorporateAccountStatus,
  CustomerRelationship,
  RelationshipType,
  PreferredCommunication,
  CustomerType,
} from "./types";

const CUSTOMER_PREFERENCES = "customer_preferences";
const CUSTOMER_TAGS = "customer_tags";
const CUSTOMER_TAG_ASSIGNMENTS = "customer_tag_assignments";
const CUSTOMER_NOTES = "customer_notes";
const CUSTOMER_FEEDBACK = "customer_feedback";
const COMPLAINTS = "complaints";
const LOYALTY_PROGRAMS = "loyalty_programs";
const LOYALTY_TIERS = "loyalty_tiers";
const LOYALTY_ACCOUNTS = "loyalty_accounts";
const LOYALTY_TRANSACTIONS = "loyalty_transactions";
const CORPORATE_ACCOUNTS = "corporate_accounts";
const CUSTOMER_RELATIONSHIPS = "customer_relationships";

const CUSTOMER_PREFERENCE_COLUMNS =
  "id, organization_id, customer_id, preferred_language, preferred_communication, " +
  "marketing_email_allowed, marketing_sms_allowed, marketing_whatsapp_allowed, " +
  "transactional_communication_allowed, consent_updated_at, consent_source, " +
  "category, pref_key, pref_value, source, notes, created_at, updated_at";

const CUSTOMER_TAG_COLUMNS =
  "id, organization_id, name, color, description, status, created_at, updated_at";

const CUSTOMER_TAG_ASSIGNMENT_COLUMNS =
  "id, organization_id, customer_id, tag_id, created_by, created_at";

const CUSTOMER_NOTE_COLUMNS =
  "id, organization_id, property_id, customer_id, note, note_type, created_by, created_at, updated_at";

const CUSTOMER_FEEDBACK_COLUMNS =
  "id, organization_id, property_id, outlet_id, customer_id, source, rating, category, " +
  "comment, reference_type, reference_id, status, created_at";

const COMPLAINT_COLUMNS =
  "id, organization_id, property_id, outlet_id, customer_id, category, priority, description, " +
  "reference_type, reference_id, assigned_to, status, resolution, resolved_at, " +
  "created_by, created_at, updated_at";

const LOYALTY_PROGRAM_COLUMNS =
  "id, organization_id, name, description, currency, points_name, points_per_amount, " +
  "minimum_spend, eligible_transaction_types, earning_enabled, redemption_enabled, " +
  "status, created_at, updated_at";

const LOYALTY_TIER_COLUMNS =
  "id, organization_id, program_id, name, rank, minimum_lifetime_spend, minimum_visits, " +
  "benefits_description, status, created_at";

const LOYALTY_ACCOUNT_COLUMNS =
  "id, organization_id, program_id, customer_id, member_number, current_points, " +
  "lifetime_earned, lifetime_redeemed, tier_id, status, joined_at, created_at, updated_at";

const LOYALTY_TRANSACTION_COLUMNS =
  "id, organization_id, loyalty_account_id, customer_id, type, points, balance_after, " +
  "reference_type, reference_id, description, created_by, created_at";

const CORPORATE_ACCOUNT_COLUMNS =
  "id, organization_id, name, code, contact_name, phone, email, billing_address, " +
  "tax_id, credit_limit, payment_terms, status, created_at, updated_at";

const CUSTOMER_RELATIONSHIP_COLUMNS =
  "id, organization_id, customer_id, related_customer_id, relationship_type, created_at";

/* --------------------------------------------------------------------- scope */

export type CrmScope = {
  organizationId: EntityId;
};

// =================================================================== preferences

export async function listCustomerPreferences(
  scope: CrmScope,
  customerId: EntityId,
): Promise<CustomerPreference[]> {
  const sb = requireSupabase();
  return camelRows<CustomerPreference>(
    asRead(
      sb
        .from(CUSTOMER_PREFERENCES)
        .select(CUSTOMER_PREFERENCE_COLUMNS)
        .eq("customer_id", customerId)
        .eq("organization_id", scope.organizationId),
    ),
  );
}

export async function upsertCustomerPreferences(
  scope: CrmScope,
  customerId: EntityId,
  params: {
    preferredLanguage?: string | null;
    preferredCommunication?: PreferredCommunication | null;
    marketingEmailAllowed?: boolean;
    marketingSmsAllowed?: boolean;
    marketingWhatsappAllowed?: boolean;
    transactionalCommunicationAllowed?: boolean;
    consentSource?: string | null;
  },
): Promise<CustomerPreference> {
  return callDoorRow<CustomerPreference>("upsert_customer_preferences", {
    p_organization: scope.organizationId,
    p_customer: customerId,
    p_preferred_language: params.preferredLanguage,
    p_preferred_communication: params.preferredCommunication,
    p_marketing_email: params.marketingEmailAllowed,
    p_marketing_sms: params.marketingSmsAllowed,
    p_marketing_whatsapp: params.marketingWhatsappAllowed,
    p_transactional: params.transactionalCommunicationAllowed,
    p_consent_source: params.consentSource,
  });
}

export async function setCustomerPreferenceItem(
  scope: CrmScope,
  customerId: EntityId,
  params: {
    category: string;
    key: string;
    value: string;
    source?: string | null;
    notes?: string | null;
  },
): Promise<CustomerPreference> {
  return callDoorRow<CustomerPreference>("set_customer_preference_item", {
    p_organization: scope.organizationId,
    p_customer: customerId,
    p_category: params.category,
    p_key: params.key,
    p_value: params.value,
    p_source: params.source,
    p_notes: params.notes,
  });
}

// =================================================================== tags

export async function listCustomerTags(
  scope: CrmScope,
  options: { includeArchived?: boolean } = {},
): Promise<CustomerTag[]> {
  const sb = requireSupabase();
  let chain = sb
    .from(CUSTOMER_TAGS)
    .select(CUSTOMER_TAG_COLUMNS)
    .eq("organization_id", scope.organizationId);

  if (!options.includeArchived) {
    chain = chain.eq("status", "ACTIVE");
  }

  chain = chain.order("name", { ascending: true });
  return camelRows<CustomerTag>(asRead(chain));
}

export async function listCustomerTagAssignments(
  scope: CrmScope,
  customerId: EntityId,
): Promise<CustomerTagAssignment[]> {
  const sb = requireSupabase();
  return camelRows<CustomerTagAssignment>(
    asRead(
      sb
        .from(CUSTOMER_TAG_ASSIGNMENTS)
        .select(CUSTOMER_TAG_ASSIGNMENT_COLUMNS)
        .eq("customer_id", customerId)
        .eq("organization_id", scope.organizationId),
    ),
  );
}

export async function createCustomerTag(
  scope: CrmScope,
  params: {
    name: string;
    color?: string | null;
    description?: string | null;
  },
): Promise<CustomerTag> {
  return callDoorRow<CustomerTag>("create_customer_tag", {
    p_organization: scope.organizationId,
    p_name: params.name,
    p_color: params.color,
    p_description: params.description,
  });
}

export async function deleteCustomerTag(
  scope: CrmScope,
  tagId: EntityId,
): Promise<void> {
  await callDoor("delete_customer_tag", {
    p_organization: scope.organizationId,
    p_tag: tagId,
  });
}

export async function assignCustomerTag(
  scope: CrmScope,
  customerId: EntityId,
  tagId: EntityId,
): Promise<CustomerTagAssignment> {
  return callDoorRow<CustomerTagAssignment>("assign_customer_tag", {
    p_organization: scope.organizationId,
    p_customer: customerId,
    p_tag: tagId,
  });
}

export async function removeCustomerTag(
  scope: CrmScope,
  customerId: EntityId,
  tagId: EntityId,
): Promise<void> {
  await callDoor("remove_customer_tag", {
    p_organization: scope.organizationId,
    p_customer: customerId,
    p_tag: tagId,
  });
}

// =================================================================== notes

export async function listCustomerNotes(
  scope: CrmScope,
  customerId: EntityId,
): Promise<CustomerNote[]> {
  const sb = requireSupabase();
  return camelRows<CustomerNote>(
    asRead(
      sb
        .from(CUSTOMER_NOTES)
        .select(CUSTOMER_NOTE_COLUMNS)
        .eq("customer_id", customerId)
        .eq("organization_id", scope.organizationId)
        .order("created_at", { ascending: false }),
    ),
  );
}

export async function createCustomerNote(
  scope: CrmScope,
  customerId: EntityId,
  params: {
    note: string;
    noteType?: CustomerNoteType;
    propertyId?: EntityId | null;
  },
): Promise<CustomerNote> {
  return callDoorRow<CustomerNote>("create_customer_note", {
    p_organization: scope.organizationId,
    p_customer: customerId,
    p_note: params.note,
    p_note_type: params.noteType ?? "GENERAL",
    p_property: params.propertyId,
  });
}

export async function updateCustomerNote(
  scope: CrmScope,
  noteId: EntityId,
  params: {
    note?: string;
    noteType?: CustomerNoteType;
  },
): Promise<CustomerNote> {
  return callDoorRow<CustomerNote>("update_customer_note", {
    p_organization: scope.organizationId,
    p_note: noteId,
    p_note_text: params.note,
    p_note_type: params.noteType,
  });
}

export async function deleteCustomerNote(
  scope: CrmScope,
  noteId: EntityId,
): Promise<void> {
  await callDoor("delete_customer_note", {
    p_organization: scope.organizationId,
    p_note: noteId,
  });
}

// =================================================================== feedback

export async function listCustomerFeedback(
  scope: CrmScope,
  options: {
    customerId?: EntityId;
    status?: FeedbackStatus;
    propertyId?: EntityId;
  } = {},
): Promise<CustomerFeedback[]> {
  const sb = requireSupabase();
  let chain = sb
    .from(CUSTOMER_FEEDBACK)
    .select(CUSTOMER_FEEDBACK_COLUMNS)
    .eq("organization_id", scope.organizationId);

  if (options.customerId) chain = chain.eq("customer_id", options.customerId);
  if (options.status) chain = chain.eq("status", options.status);
  if (options.propertyId) chain = chain.eq("property_id", options.propertyId);

  chain = chain.order("created_at", { ascending: false });
  return camelRows<CustomerFeedback>(asRead(chain));
}

export async function createCustomerFeedback(
  scope: CrmScope,
  customerId: EntityId,
  params: {
    category?: FeedbackCategory;
    rating?: number | null;
    comment?: string | null;
    source?: FeedbackSource;
    propertyId?: EntityId | null;
    outletId?: EntityId | null;
    referenceType?: string | null;
    referenceId?: EntityId | null;
  },
): Promise<CustomerFeedback> {
  return callDoorRow<CustomerFeedback>("create_customer_feedback", {
    p_organization: scope.organizationId,
    p_customer: customerId,
    p_category: params.category ?? "OTHER",
    p_rating: params.rating,
    p_comment: params.comment,
    p_source: params.source ?? "INTERNAL",
    p_property: params.propertyId,
    p_outlet: params.outletId,
    p_reference_type: params.referenceType,
    p_reference_id: params.referenceId,
  });
}

export async function updateFeedbackStatus(
  scope: CrmScope,
  feedbackId: EntityId,
  status: FeedbackStatus,
): Promise<CustomerFeedback> {
  return callDoorRow<CustomerFeedback>("update_feedback_status", {
    p_organization: scope.organizationId,
    p_feedback: feedbackId,
    p_status: status,
  });
}

// =================================================================== complaints

export async function listComplaints(
  scope: CrmScope,
  options: {
    customerId?: EntityId;
    status?: ComplaintStatus;
    propertyId?: EntityId;
  } = {},
): Promise<Complaint[]> {
  const sb = requireSupabase();
  let chain = sb
    .from(COMPLAINTS)
    .select(COMPLAINT_COLUMNS)
    .eq("organization_id", scope.organizationId);

  if (options.customerId) chain = chain.eq("customer_id", options.customerId);
  if (options.status) chain = chain.eq("status", options.status);
  if (options.propertyId) chain = chain.eq("property_id", options.propertyId);

  chain = chain.order("created_at", { ascending: false });
  return camelRows<Complaint>(asRead(chain));
}

export async function createComplaint(
  scope: CrmScope,
  params: {
    customerId?: EntityId | null;
    category?: FeedbackCategory;
    priority?: ComplaintPriority;
    description: string;
    propertyId?: EntityId | null;
    outletId?: EntityId | null;
    referenceType?: string | null;
    referenceId?: EntityId | null;
  },
): Promise<Complaint> {
  return callDoorRow<Complaint>("create_complaint", {
    p_organization: scope.organizationId,
    p_customer: params.customerId,
    p_category: params.category ?? "OTHER",
    p_priority: params.priority ?? "NORMAL",
    p_description: params.description,
    p_property: params.propertyId,
    p_outlet: params.outletId,
    p_reference_type: params.referenceType,
    p_reference_id: params.referenceId,
  });
}

export async function updateComplaint(
  scope: CrmScope,
  complaintId: EntityId,
  params: {
    status?: ComplaintStatus;
    assignedTo?: EntityId | null;
    resolution?: string | null;
  },
): Promise<Complaint> {
  return callDoorRow<Complaint>("update_complaint", {
    p_organization: scope.organizationId,
    p_complaint: complaintId,
    p_status: params.status,
    p_assigned_to: params.assignedTo,
    p_resolution: params.resolution,
  });
}

// =================================================================== loyalty programs

export async function listLoyaltyPrograms(
  scope: CrmScope,
): Promise<LoyaltyProgram[]> {
  const sb = requireSupabase();
  return camelRows<LoyaltyProgram>(
    asRead(
      sb
        .from(LOYALTY_PROGRAMS)
        .select(LOYALTY_PROGRAM_COLUMNS)
        .eq("organization_id", scope.organizationId)
        .order("name", { ascending: true }),
    ),
  );
}

export async function createLoyaltyProgram(
  scope: CrmScope,
  params: {
    name: string;
    description?: string | null;
    currency?: string;
    pointsName?: string;
    pointsPerAmount?: string | null;
    minimumSpend?: string | null;
  },
): Promise<LoyaltyProgram> {
  return callDoorRow<LoyaltyProgram>("create_loyalty_program", {
    p_organization: scope.organizationId,
    p_name: params.name,
    p_description: params.description,
    p_currency: params.currency ?? "INR",
    p_points_name: params.pointsName ?? "Points",
    p_points_per_amount: params.pointsPerAmount,
    p_minimum_spend: params.minimumSpend,
  });
}

// =================================================================== loyalty tiers

export async function listLoyaltyTiers(
  scope: CrmScope,
  programId: EntityId,
): Promise<LoyaltyTier[]> {
  const sb = requireSupabase();
  return camelRows<LoyaltyTier>(
    asRead(
      sb
        .from(LOYALTY_TIERS)
        .select(LOYALTY_TIER_COLUMNS)
        .eq("program_id", programId)
        .eq("organization_id", scope.organizationId)
        .order("rank", { ascending: true }),
    ),
  );
}

// =================================================================== loyalty accounts

export async function listLoyaltyAccounts(
  scope: CrmScope,
  customerId: EntityId,
): Promise<LoyaltyAccount[]> {
  const sb = requireSupabase();
  return camelRows<LoyaltyAccount>(
    asRead(
      sb
        .from(LOYALTY_ACCOUNTS)
        .select(LOYALTY_ACCOUNT_COLUMNS)
        .eq("customer_id", customerId)
        .eq("organization_id", scope.organizationId),
    ),
  );
}

export async function createLoyaltyAccount(
  scope: CrmScope,
  params: {
    programId: EntityId;
    customerId: EntityId;
    memberNumber: string;
  },
): Promise<LoyaltyAccount> {
  return callDoorRow<LoyaltyAccount>("create_loyalty_account", {
    p_organization: scope.organizationId,
    p_program: params.programId,
    p_customer: params.customerId,
    p_member_number: params.memberNumber,
  });
}

// =================================================================== loyalty transactions

export async function listLoyaltyTransactions(
  scope: CrmScope,
  accountId: EntityId,
): Promise<LoyaltyTransaction[]> {
  const sb = requireSupabase();
  return camelRows<LoyaltyTransaction>(
    asRead(
      sb
        .from(LOYALTY_TRANSACTIONS)
        .select(LOYALTY_TRANSACTION_COLUMNS)
        .eq("loyalty_account_id", accountId)
        .eq("organization_id", scope.organizationId)
        .order("created_at", { ascending: false }),
    ),
  );
}

export async function recordLoyaltyTransaction(
  scope: CrmScope,
  params: {
    accountId: EntityId;
    customerId: EntityId;
    type: LoyaltyTransactionType;
    points: string;
    description?: string | null;
    referenceType?: string | null;
    referenceId?: EntityId | null;
  },
): Promise<LoyaltyTransaction> {
  return callDoorRow<LoyaltyTransaction>("record_loyalty_transaction", {
    p_organization: scope.organizationId,
    p_account: params.accountId,
    p_customer: params.customerId,
    p_type: params.type,
    p_points: params.points,
    p_description: params.description,
    p_reference_type: params.referenceType,
    p_reference_id: params.referenceId,
  });
}

// =================================================================== corporate accounts

export async function listCorporateAccounts(
  scope: CrmScope,
  options: { includeArchived?: boolean } = {},
): Promise<CorporateAccount[]> {
  const sb = requireSupabase();
  let chain = sb
    .from(CORPORATE_ACCOUNTS)
    .select(CORPORATE_ACCOUNT_COLUMNS)
    .eq("organization_id", scope.organizationId);

  if (!options.includeArchived) {
    chain = chain.eq("status", "ACTIVE");
  }

  chain = chain.order("name", { ascending: true });
  return camelRows<CorporateAccount>(asRead(chain));
}

export async function getCorporateAccount(
  scope: CrmScope,
  accountId: EntityId,
): Promise<CorporateAccount | null> {
  const sb = requireSupabase();
  return firstCamelRow<CorporateAccount>(
    asRead(
      sb
        .from(CORPORATE_ACCOUNTS)
        .select(CORPORATE_ACCOUNT_COLUMNS)
        .eq("id", accountId)
        .eq("organization_id", scope.organizationId),
    ),
  );
}

export async function createCorporateAccount(
  scope: CrmScope,
  params: {
    name: string;
    code?: string | null;
    contactName?: string | null;
    phone?: string | null;
    email?: string | null;
    billingAddress?: string | null;
    taxId?: string | null;
    creditLimit?: string | null;
    paymentTerms?: string | null;
  },
): Promise<CorporateAccount> {
  return callDoorRow<CorporateAccount>("create_corporate_account", {
    p_organization: scope.organizationId,
    p_name: params.name,
    p_code: params.code,
    p_contact_name: params.contactName,
    p_phone: params.phone,
    p_email: params.email,
    p_billing_address: params.billingAddress,
    p_tax_id: params.taxId,
    p_credit_limit: params.creditLimit,
    p_payment_terms: params.paymentTerms,
  });
}

export async function updateCorporateAccount(
  scope: CrmScope,
  accountId: EntityId,
  params: {
    name?: string;
    code?: string | null;
    contactName?: string | null;
    phone?: string | null;
    email?: string | null;
    billingAddress?: string | null;
    taxId?: string | null;
    creditLimit?: string | null;
    paymentTerms?: string | null;
    status?: CorporateAccountStatus;
  },
): Promise<CorporateAccount> {
  return callDoorRow<CorporateAccount>("update_corporate_account", {
    p_organization: scope.organizationId,
    p_account: accountId,
    p_name: params.name,
    p_code: params.code,
    p_contact_name: params.contactName,
    p_phone: params.phone,
    p_email: params.email,
    p_billing_address: params.billingAddress,
    p_tax_id: params.taxId,
    p_credit_limit: params.creditLimit,
    p_payment_terms: params.paymentTerms,
    p_status: params.status,
  });
}

// =================================================================== customer relationships

export async function listCustomerRelationships(
  scope: CrmScope,
  customerId: EntityId,
): Promise<CustomerRelationship[]> {
  const sb = requireSupabase();
  return camelRows<CustomerRelationship>(
    asRead(
      sb
        .from(CUSTOMER_RELATIONSHIPS)
        .select(CUSTOMER_RELATIONSHIP_COLUMNS)
        .eq("customer_id", customerId)
        .eq("organization_id", scope.organizationId),
    ),
  );
}

export async function createCustomerRelationship(
  scope: CrmScope,
  params: {
    customerId: EntityId;
    relatedCustomerId: EntityId;
    relationshipType: RelationshipType;
  },
): Promise<CustomerRelationship> {
  return callDoorRow<CustomerRelationship>("create_customer_relationship", {
    p_organization: scope.organizationId,
    p_customer: params.customerId,
    p_related_customer: params.relatedCustomerId,
    p_relationship_type: params.relationshipType,
  });
}

export async function deleteCustomerRelationship(
  scope: CrmScope,
  relationshipId: EntityId,
): Promise<void> {
  await callDoor("delete_customer_relationship", {
    p_organization: scope.organizationId,
    p_relationship: relationshipId,
  });
}

// =================================================================== CRM guest update

export async function updateGuestCrm(
  scope: CrmScope,
  guestId: EntityId,
  expectedVersion: number,
  params: {
    customerType?: CustomerType | null;
    companyName?: string | null;
    designation?: string | null;
    anniversaryDate?: string | null;
    corporateAccountId?: EntityId | null;
  },
): Promise<void> {
  await callDoor("update_guest_crm", {
    p_guest: guestId,
    p_organization: scope.organizationId,
    p_expected_version: expectedVersion,
    p_customer_type: params.customerType,
    p_company_name: params.companyName,
    p_designation: params.designation,
    p_anniversary_date: params.anniversaryDate,
    p_corporate_account_id: params.corporateAccountId,
  });
}
