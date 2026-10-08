/**
 * Folios service (Prompt #08 §33-§38, migration 038).
 *
 * Folios are the financial record of a stay. Every charge and payment is a row in folio_entries.
 * Entries are immutable — corrections use compensating entries, never edits.
 */

import { requireSupabase } from "@/db/client";
import { asRead, callDoorRow, camelRows, firstCamelRow } from "@/db/rpc";
import type { EntityId } from "@/domain/identity/types";
import type { Folio, FolioEntry, FolioEntryType, FolioStatus } from "./types";

const FOLIOS = "folios";
const FOLIO_ENTRIES = "folio_entries";

const FOLIO_COLUMNS =
  "id, organization_id, property_id, stay_id, folio_number, status, currency, " +
  "subtotal, tax_total, discount_total, total_charges, total_payments, balance, " +
  "opened_at, settled_at, closed_at, notes, version, created_at, updated_at";

const FOLIO_ENTRY_COLUMNS =
  "id, organization_id, folio_id, entry_type, reference_type, reference_id, description, " +
  "quantity, unit_rate, amount, tax_amount, discount_amount, net_amount, business_date, " +
  "posted_at, voided_at, void_reason, voided_by, notes, created_at, created_by";

/* --------------------------------------------------------------------- scope */

export type FolioScope = {
  organizationId: EntityId;
  propertyId: EntityId;
};

/* --------------------------------------------------------------------- reads */

/** List folios for the property. */
export async function listFolios(
  scope: FolioScope,
  options?: {
    status?: FolioStatus | FolioStatus[];
  },
): Promise<Folio[]> {
  const sb = requireSupabase();
  let chain = sb
    .from(FOLIOS)
    .select(FOLIO_COLUMNS)
    .eq("organization_id", scope.organizationId)
    .eq("property_id", scope.propertyId);

  if (options?.status) {
    if (Array.isArray(options.status)) {
      chain = chain.in("status", options.status);
    } else {
      chain = chain.eq("status", options.status);
    }
  }

  chain = chain.order("opened_at", { ascending: false });

  return camelRows<Folio>(asRead(chain));
}

/** Get a single folio by ID. */
export async function getFolio(
  scope: FolioScope,
  folioId: EntityId,
): Promise<Folio | null> {
  const sb = requireSupabase();
  return firstCamelRow<Folio>(
    asRead(
      sb
        .from(FOLIOS)
        .select(FOLIO_COLUMNS)
        .eq("id", folioId)
        .eq("organization_id", scope.organizationId)
        .eq("property_id", scope.propertyId),
    ),
  );
}

/** Get folio for a stay. */
export async function getFolioByStay(
  scope: FolioScope,
  stayId: EntityId,
): Promise<Folio | null> {
  const sb = requireSupabase();
  return firstCamelRow<Folio>(
    asRead(
      sb
        .from(FOLIOS)
        .select(FOLIO_COLUMNS)
        .eq("stay_id", stayId)
        .eq("organization_id", scope.organizationId)
        .eq("property_id", scope.propertyId),
    ),
  );
}

/** List entries for a folio. */
export async function listFolioEntries(
  scope: FolioScope,
  folioId: EntityId,
): Promise<FolioEntry[]> {
  const sb = requireSupabase();
  return camelRows<FolioEntry>(
    asRead(
      sb
        .from(FOLIO_ENTRIES)
        .select(FOLIO_ENTRY_COLUMNS)
        .eq("folio_id", folioId)
        .eq("organization_id", scope.organizationId)
        .order("posted_at", { ascending: true }),
    ),
  );
}

/* --------------------------------------------------------------------- writes */

/** Open a folio for a stay. */
export async function openFolio(
  _scope: FolioScope,
  stayId: EntityId,
): Promise<Folio> {
  return callDoorRow<Folio>("open_folio", {
    p_stay: stayId,
  });
}

/** Post a charge to a folio. */
export async function postFolioCharge(
  _scope: FolioScope,
  folioId: EntityId,
  params: {
    entryType: FolioEntryType;
    description: string;
    quantity?: number;
    unitRate?: number;
    amount: number;
    taxAmount?: number;
    discountAmount?: number;
    businessDate?: string;
    referenceType?: string | null;
    referenceId?: EntityId | null;
    notes?: string | null;
  },
): Promise<FolioEntry> {
  return callDoorRow<FolioEntry>("post_folio_charge", {
    p_folio: folioId,
    p_entry_type: params.entryType,
    p_description: params.description,
    p_quantity: params.quantity ?? 1,
    p_unit_rate: params.unitRate ?? 0,
    p_amount: params.amount,
    p_tax_amount: params.taxAmount ?? 0,
    p_discount_amount: params.discountAmount ?? 0,
    p_business_date: params.businessDate ?? new Date().toISOString().split("T")[0],
    p_reference_type: params.referenceType ?? null,
    p_reference_id: params.referenceId ?? null,
    p_notes: params.notes ?? null,
  });
}

/** Post a payment to a folio. */
export async function postFolioPayment(
  _scope: FolioScope,
  folioId: EntityId,
  params: {
    amount: number;
    description: string;
    businessDate?: string;
    referenceType?: string | null;
    referenceId?: EntityId | null;
    notes?: string | null;
  },
): Promise<FolioEntry> {
  return callDoorRow<FolioEntry>("post_folio_payment", {
    p_folio: folioId,
    p_amount: params.amount,
    p_description: params.description,
    p_business_date: params.businessDate ?? new Date().toISOString().split("T")[0],
    p_reference_type: params.referenceType ?? null,
    p_reference_id: params.referenceId ?? null,
    p_notes: params.notes ?? null,
  });
}

/** Void a folio entry (posts a compensating entry). */
export async function voidFolioEntry(
  _scope: FolioScope,
  entryId: EntityId,
  reason: string,
): Promise<FolioEntry> {
  return callDoorRow<FolioEntry>("void_folio_entry", {
    p_entry: entryId,
    p_reason: reason,
  });
}

/** Settle a folio (balance must be zero). */
export async function settleFolio(
  _scope: FolioScope,
  folioId: EntityId,
): Promise<Folio> {
  return callDoorRow<Folio>("settle_folio", {
    p_folio: folioId,
  });
}

/** Close a settled folio. */
export async function closeFolio(
  _scope: FolioScope,
  folioId: EntityId,
): Promise<Folio> {
  return callDoorRow<Folio>("close_folio", {
    p_folio: folioId,
  });
}
