/**
 * Supplier master data: suppliers, contacts, addresses, supplier-item links, price history.
 *
 * Reads are plain SELECTs under RLS. Writes go through doors (028).
 */

import { requireSupabase } from "@/db/client";
import { asRead, callDoor, callDoorRow, camelRows } from "@/db/rpc";
import type { EntityId } from "@/domain/identity/types";
import type {
  Supplier,
  SupplierAddress,
  SupplierContact,
  SupplierItem,
  SupplierPriceHistory,
  SupplierStatus,
  SupplierType,
} from "./types";

const SUPPLIERS = "suppliers";
const CONTACTS = "supplier_contacts";
const ADDRESSES = "supplier_addresses";
const SUPPLIER_ITEMS = "supplier_items";
const PRICE_HISTORY = "supplier_price_history";

const SUPPLIER_COLUMNS =
  "id, organization_id, supplier_code, legal_name, trade_name, supplier_type, status, " +
  "tax_id, tax_type, opening_balance, payment_terms, credit_limit, notes, version, created_at, updated_at";

const CONTACT_COLUMNS =
  "id, organization_id, supplier_id, contact_name, designation, phone, email, is_primary, created_at";

const ADDRESS_COLUMNS =
  "id, organization_id, supplier_id, address_type, address_line1, address_line2, " +
  "city, state, postal_code, country, is_default, created_at";

const SUPPLIER_ITEM_COLUMNS =
  "id, organization_id, supplier_id, item_id, purchase_unit_id, conversion_to_base, " +
  "last_purchase_rate, standard_rate, lead_time_days, minimum_order_quantity, is_preferred, " +
  "created_at, updated_at";

const PRICE_HISTORY_COLUMNS =
  "id, organization_id, supplier_id, item_id, purchase_order_id, purchase_date, " +
  "unit_rate, discount_percent, tax_rate, freight_amount, landed_rate, created_at";

// ============================================================ suppliers

export async function listSuppliers(
  organizationId: EntityId,
  opts?: { status?: SupplierStatus; type?: SupplierType }
): Promise<Supplier[]> {
  const sb = requireSupabase();
  let chain = sb.from(SUPPLIERS).select(SUPPLIER_COLUMNS).eq("organization_id", organizationId);
  if (opts?.status) chain = chain.eq("status", opts.status);
  if (opts?.type) chain = chain.eq("supplier_type", opts.type);
  return camelRows<Supplier>(asRead(chain.order("legal_name")));
}

export async function getSupplier(
  supplierId: EntityId
): Promise<Supplier | null> {
  const sb = requireSupabase();
  const chain = sb
    .from(SUPPLIERS)
    .select(SUPPLIER_COLUMNS)
    .eq("id", supplierId)
    .limit(1);
  const rows = await camelRows<Supplier>(asRead(chain));
  return rows[0] ?? null;
}

export async function createSupplier(
  organizationId: EntityId,
  input: {
    legalName: string;
    supplierType: SupplierType;
    tradeName?: string;
    taxId?: string;
    taxType?: string;
    openingBalance?: number;
    paymentTerms?: number;
    creditLimit?: number;
    notes?: string;
  }
): Promise<Supplier> {
  return callDoorRow<Supplier>("create_supplier", {
    p_organization: organizationId,
    p_legal_name: input.legalName,
    p_supplier_type: input.supplierType,
    p_trade_name: input.tradeName,
    p_tax_id: input.taxId,
    p_tax_type: input.taxType,
    p_opening_balance: input.openingBalance,
    p_payment_terms: input.paymentTerms,
    p_credit_limit: input.creditLimit,
    p_notes: input.notes,
  });
}

export async function updateSupplier(
  supplierId: EntityId,
  organizationId: EntityId,
  updates: {
    legalName?: string;
    tradeName?: string;
    supplierType?: SupplierType;
    taxId?: string;
    taxType?: string;
    paymentTerms?: number;
    creditLimit?: number;
    notes?: string;
  },
  expectedVersion: number
): Promise<Supplier> {
  return callDoorRow<Supplier>("update_supplier", {
    p_supplier: supplierId,
    p_organization: organizationId,
    p_legal_name: updates.legalName,
    p_trade_name: updates.tradeName,
    p_supplier_type: updates.supplierType,
    p_tax_id: updates.taxId,
    p_tax_type: updates.taxType,
    p_payment_terms: updates.paymentTerms,
    p_credit_limit: updates.creditLimit,
    p_notes: updates.notes,
    p_expected_version: expectedVersion,
  });
}

export async function archiveSupplier(
  supplierId: EntityId,
  organizationId: EntityId,
  expectedVersion: number
): Promise<void> {
  await callDoor("archive_supplier", {
    p_supplier: supplierId,
    p_organization: organizationId,
    p_expected_version: expectedVersion,
  });
}

export async function setSupplierStatus(
  supplierId: EntityId,
  organizationId: EntityId,
  status: SupplierStatus,
  expectedVersion: number
): Promise<Supplier> {
  return callDoorRow<Supplier>("set_supplier_status", {
    p_supplier: supplierId,
    p_organization: organizationId,
    p_status: status,
    p_expected_version: expectedVersion,
  });
}

// ============================================================ contacts

export async function listSupplierContacts(
  supplierId: EntityId
): Promise<SupplierContact[]> {
  const sb = requireSupabase();
  const chain = sb
    .from(CONTACTS)
    .select(CONTACT_COLUMNS)
    .eq("supplier_id", supplierId)
    .order("is_primary", { ascending: false })
    .order("contact_name");
  return camelRows<SupplierContact>(asRead(chain));
}

export async function createSupplierContact(
  organizationId: EntityId,
  supplierId: EntityId,
  input: {
    contactName: string;
    designation?: string;
    phone?: string;
    email?: string;
    isPrimary?: boolean;
  }
): Promise<SupplierContact> {
  return callDoorRow<SupplierContact>("create_supplier_contact", {
    p_organization: organizationId,
    p_supplier: supplierId,
    p_contact_name: input.contactName,
    p_designation: input.designation,
    p_phone: input.phone,
    p_email: input.email,
    p_is_primary: input.isPrimary ?? false,
  });
}

export async function updateSupplierContact(
  contactId: EntityId,
  input: {
    contactName?: string;
    designation?: string;
    phone?: string;
    email?: string;
    isPrimary?: boolean;
  }
): Promise<SupplierContact> {
  return callDoorRow<SupplierContact>("update_supplier_contact", {
    p_contact: contactId,
    p_contact_name: input.contactName,
    p_designation: input.designation,
    p_phone: input.phone,
    p_email: input.email,
    p_is_primary: input.isPrimary,
  });
}

export async function deleteSupplierContact(contactId: EntityId): Promise<void> {
  await callDoor("delete_supplier_contact", { p_contact: contactId });
}

// ============================================================ addresses

export async function listSupplierAddresses(
  supplierId: EntityId
): Promise<SupplierAddress[]> {
  const sb = requireSupabase();
  const chain = sb
    .from(ADDRESSES)
    .select(ADDRESS_COLUMNS)
    .eq("supplier_id", supplierId)
    .order("is_default", { ascending: false })
    .order("address_type");
  return camelRows<SupplierAddress>(asRead(chain));
}

export async function createSupplierAddress(
  organizationId: EntityId,
  supplierId: EntityId,
  input: {
    addressType: "BILLING" | "SHIPPING" | "OFFICE";
    addressLine1: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country: string;
    isDefault?: boolean;
  }
): Promise<SupplierAddress> {
  return callDoorRow<SupplierAddress>("create_supplier_address", {
    p_organization: organizationId,
    p_supplier: supplierId,
    p_address_type: input.addressType,
    p_address_line1: input.addressLine1,
    p_address_line2: input.addressLine2,
    p_city: input.city,
    p_state: input.state,
    p_postal_code: input.postalCode,
    p_country: input.country,
    p_is_default: input.isDefault ?? false,
  });
}

export async function updateSupplierAddress(
  addressId: EntityId,
  input: {
    addressType?: "BILLING" | "SHIPPING" | "OFFICE";
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    isDefault?: boolean;
  }
): Promise<SupplierAddress> {
  return callDoorRow<SupplierAddress>("update_supplier_address", {
    p_address: addressId,
    p_address_type: input.addressType,
    p_address_line1: input.addressLine1,
    p_address_line2: input.addressLine2,
    p_city: input.city,
    p_state: input.state,
    p_postal_code: input.postalCode,
    p_country: input.country,
    p_is_default: input.isDefault,
  });
}

export async function deleteSupplierAddress(addressId: EntityId): Promise<void> {
  await callDoor("delete_supplier_address", { p_address: addressId });
}

// ============================================================ supplier items

export async function listSupplierItems(
  organizationId: EntityId,
  opts?: { supplierId?: EntityId; itemId?: EntityId }
): Promise<SupplierItem[]> {
  const sb = requireSupabase();
  let chain = sb
    .from(SUPPLIER_ITEMS)
    .select(SUPPLIER_ITEM_COLUMNS)
    .eq("organization_id", organizationId);
  if (opts?.supplierId) chain = chain.eq("supplier_id", opts.supplierId);
  if (opts?.itemId) chain = chain.eq("item_id", opts.itemId);
  return camelRows<SupplierItem>(asRead(chain.order("item_id")));
}

export async function createSupplierItem(
  organizationId: EntityId,
  supplierId: EntityId,
  itemId: EntityId,
  input: {
    purchaseUnitId: EntityId;
    conversionToBase: number;
    standardRate?: number;
    leadTimeDays?: number;
    minimumOrderQuantity?: number;
    isPreferred?: boolean;
  }
): Promise<SupplierItem> {
  return callDoorRow<SupplierItem>("create_supplier_item", {
    p_organization: organizationId,
    p_supplier: supplierId,
    p_item: itemId,
    p_purchase_unit: input.purchaseUnitId,
    p_conversion_to_base: input.conversionToBase,
    p_standard_rate: input.standardRate,
    p_lead_time_days: input.leadTimeDays,
    p_minimum_order_quantity: input.minimumOrderQuantity,
    p_is_preferred: input.isPreferred ?? false,
  });
}

export async function updateSupplierItem(
  supplierItemId: EntityId,
  updates: {
    purchaseUnitId?: EntityId;
    conversionToBase?: number;
    standardRate?: number;
    leadTimeDays?: number;
    minimumOrderQuantity?: number;
    isPreferred?: boolean;
  }
): Promise<SupplierItem> {
  return callDoorRow<SupplierItem>("update_supplier_item", {
    p_supplier_item: supplierItemId,
    p_purchase_unit: updates.purchaseUnitId,
    p_conversion_to_base: updates.conversionToBase,
    p_standard_rate: updates.standardRate,
    p_lead_time_days: updates.leadTimeDays,
    p_minimum_order_quantity: updates.minimumOrderQuantity,
    p_is_preferred: updates.isPreferred,
  });
}

// ============================================================ price history

export async function listSupplierPriceHistory(
  organizationId: EntityId,
  opts: { supplierId: EntityId; itemId: EntityId }
): Promise<SupplierPriceHistory[]> {
  const sb = requireSupabase();
  const chain = sb
    .from(PRICE_HISTORY)
    .select(PRICE_HISTORY_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("supplier_id", opts.supplierId)
    .eq("item_id", opts.itemId);
  return camelRows<SupplierPriceHistory>(asRead(chain.order("purchase_date.desc")));
}
