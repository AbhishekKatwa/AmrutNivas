/**
 * Guest management service (Prompt #08 §19-§24, migration 033).
 *
 * Guests are people who may stay. PII is protected: document numbers never appear in audit logs.
 * Writes go through doors; reads are plain SELECTs under RLS.
 */

import { requireSupabase } from "@/db/client";
import { asRead, callDoor, callDoorRow, camelRows, firstCamelRow } from "@/db/rpc";
import type { EntityId } from "@/domain/identity/types";
import type {
  Guest,
  GuestDocument,
  Gender,
  VipStatus,
  GuestSource,
  DocumentType,
} from "./types";

const GUESTS = "guests";
const GUEST_DOCUMENTS = "guest_documents";

const GUEST_COLUMNS =
  "id, organization_id, first_name, last_name, phone, email, date_of_birth, nationality, " +
  "gender, address, vip_status, source, total_stays, total_nights, notes, status, archived_at, " +
  "version, created_at, updated_at";

const GUEST_DOCUMENT_COLUMNS =
  "id, organization_id, guest_id, document_type, document_number, issuing_country, expiry_date, " +
  "verified, verified_at, verified_by, created_at, updated_at";

/* --------------------------------------------------------------------- scope */

export type GuestScope = {
  organizationId: EntityId;
};

export type ArchivedRead = {
  includeArchived?: boolean;
};

/* --------------------------------------------------------------------- reads */

/** List guests for the organization. */
export async function listGuests(
  scope: GuestScope,
  options: ArchivedRead = {},
): Promise<Guest[]> {
  const sb = requireSupabase();
  let chain = sb.from(GUESTS).select(GUEST_COLUMNS).eq("organization_id", scope.organizationId);

  if (!options.includeArchived) {
    chain = chain.eq("status", "ACTIVE");
  }

  chain = chain.order("last_name", { ascending: true }).order("first_name", { ascending: true });

  return camelRows<Guest>(asRead(chain));
}

/** Search guests by name or phone. */
export async function searchGuests(
  scope: GuestScope,
  searchTerm: string,
  limit = 20,
): Promise<Guest[]> {
  const sb = requireSupabase();
  const term = `%${searchTerm}%`;

  const chain = sb
    .from(GUESTS)
    .select(GUEST_COLUMNS)
    .eq("organization_id", scope.organizationId)
    .eq("status", "ACTIVE")
    .or(`first_name.ilike.${term},last_name.ilike.${term},phone.ilike.${term},email.ilike.${term}`)
    .order("last_name", { ascending: true })
    .limit(limit);

  return camelRows<Guest>(asRead(chain));
}

/** Get a single guest by ID. */
export async function getGuest(
  scope: GuestScope,
  guestId: EntityId,
): Promise<Guest | null> {
  const sb = requireSupabase();
  return firstCamelRow<Guest>(
    asRead(
      sb
        .from(GUESTS)
        .select(GUEST_COLUMNS)
        .eq("id", guestId)
        .eq("organization_id", scope.organizationId),
    ),
  );
}

/** List documents for a guest. */
export async function listGuestDocuments(
  scope: GuestScope,
  guestId: EntityId,
): Promise<GuestDocument[]> {
  const sb = requireSupabase();
  const chain = sb
    .from(GUEST_DOCUMENTS)
    .select(GUEST_DOCUMENT_COLUMNS)
    .eq("guest_id", guestId)
    .eq("organization_id", scope.organizationId)
    .order("created_at", { ascending: false });

  return camelRows<GuestDocument>(asRead(chain));
}

/* --------------------------------------------------------------------- writes */

/** Create a new guest. */
export async function createGuest(
  scope: GuestScope,
  params: {
    firstName: string;
    lastName: string;
    phone?: string | null;
    email?: string | null;
    dateOfBirth?: string | null;
    nationality?: string | null;
    gender?: Gender | null;
    address?: string | null;
    vipStatus?: VipStatus;
    source?: GuestSource | null;
    notes?: string | null;
  },
): Promise<Guest> {
  return callDoorRow<Guest>("create_guest", {
    p_organization: scope.organizationId,
    p_first_name: params.firstName,
    p_last_name: params.lastName,
    p_phone: params.phone ?? null,
    p_email: params.email ?? null,
    p_dob: params.dateOfBirth ?? null,
    p_nationality: params.nationality ?? null,
    p_gender: params.gender ?? null,
    p_address: params.address ?? null,
    p_vip_status: params.vipStatus ?? "REGULAR",
    p_source: params.source ?? null,
    p_notes: params.notes ?? null,
  });
}

/** Update a guest. */
export async function updateGuest(
  scope: GuestScope,
  guestId: EntityId,
  params: {
    firstName?: string;
    lastName?: string;
    phone?: string | null;
    email?: string | null;
    dateOfBirth?: string | null;
    nationality?: string | null;
    gender?: Gender | null;
    address?: string | null;
    vipStatus?: VipStatus;
    source?: GuestSource | null;
    notes?: string | null;
    expectedVersion: number;
  },
): Promise<Guest> {
  return callDoorRow<Guest>("update_guest", {
    p_guest: guestId,
    p_organization: scope.organizationId,
    p_expected_version: params.expectedVersion,
    p_first_name: params.firstName,
    p_last_name: params.lastName,
    p_phone: params.phone,
    p_email: params.email,
    p_dob: params.dateOfBirth,
    p_nationality: params.nationality,
    p_gender: params.gender,
    p_address: params.address,
    p_vip_status: params.vipStatus,
    p_source: params.source,
    p_notes: params.notes,
  });
}

/** Archive a guest (one-way). */
export async function archiveGuest(
  scope: GuestScope,
  guestId: EntityId,
  expectedVersion: number,
): Promise<void> {
  await callDoor("archive_guest", {
    p_guest: guestId,
    p_organization: scope.organizationId,
    p_expected_version: expectedVersion,
  });
}

/** Add a document to a guest. */
export async function createGuestDocument(
  scope: GuestScope,
  guestId: EntityId,
  params: {
    documentType: DocumentType;
    documentNumber: string;
    issuingCountry?: string | null;
    expiryDate?: string | null;
  },
): Promise<GuestDocument> {
  return callDoorRow<GuestDocument>("create_guest_document", {
    p_guest: guestId,
    p_organization: scope.organizationId,
    p_document_type: params.documentType,
    p_document_number: params.documentNumber,
    p_issuing_country: params.issuingCountry ?? null,
    p_expiry_date: params.expiryDate ?? null,
  });
}

/** Update a guest document. */
export async function updateGuestDocument(
  scope: GuestScope,
  documentId: EntityId,
  params: {
    documentType?: DocumentType;
    documentNumber?: string;
    issuingCountry?: string | null;
    expiryDate?: string | null;
    verified?: boolean;
  },
): Promise<GuestDocument> {
  return callDoorRow<GuestDocument>("update_guest_document", {
    p_document: documentId,
    p_organization: scope.organizationId,
    p_document_type: params.documentType,
    p_document_number: params.documentNumber,
    p_issuing_country: params.issuingCountry,
    p_expiry_date: params.expiryDate,
    p_verified: params.verified,
  });
}

/** Delete a guest document. */
export async function deleteGuestDocument(
  scope: GuestScope,
  documentId: EntityId,
): Promise<void> {
  await callDoor("delete_guest_document", {
    p_document: documentId,
    p_organization: scope.organizationId,
  });
}
