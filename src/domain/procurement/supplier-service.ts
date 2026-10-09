/**
 * Supplier master data: suppliers, contacts, addresses, supplier-item links, price history.
 *
 * Reads are plain SELECTs under RLS. Writes go through doors (028).
 * supplier_items and supplier_price_history carry no organization_id — scoping
 * is through the supplier's org (RLS covers both via supplier_id).
 */

import { requireSupabase } from "@/db/client";
import { asRead, callDoor, callDoorRow, camelRows } from "@/db/rpc";
import type { EntityId } from "@/domain/identity/types";
import type {
  Supplier,
  SupplierAddress,
  SupplierAddressType,
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
  "id, organization_id, supplier_code, legal_name, display_name, supplier_type, status, " +
  "tax_identifier, gstin, pan, email, phone, website, payment_terms_days, credit_limit, " +
  "currency, notes, opening_balance, version, created_at, updated_at";

const CONTACT_COLUMNS =
  "id, supplier_id, name, designation, phone, email, is_primary, notes, created_at, updated_at";

const ADDRESS_COLUMNS =
  "id, supplier_id, address_type, address_line1, address_line2, " +
  "city, state, postal_code, country, is_primary, created_at, updated_at";

const SUPPLIER_ITEM_COLUMNS =
  "id, supplier_id, inventory_item_id, supplier_item_code, supplier_item_name, purchase_unit, " +
  "conversion_to_base, last_purchase_rate, standard_rate, minimum_order_qty, lead_time_days, " +
  "is_preferred, is_active, notes, version, created_at, updated_at";

const PRICE_HISTORY_COLUMNS =
  "id, supplier_id, inventory_item_id, purchase_order_id, goods_receipt_id, purchase_date, " +
  "quantity, purchase_unit, rate, discount, tax_amount, freight_amount, other_charges, " +
  "landed_rate, currency, created_at";

function generateSupplierCode(): string {
  return `SUP-${Date.now().toString(36).toUpperCase()}${Math.random()
    .toString(36)
    .slice(2, 5)
    .toUpperCase()}`;
}

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
    displayName?: string;
    supplierType?: SupplierType;
    taxIdentifier?: string;
    gstin?: string;
    pan?: string;
    email?: string;
    phone?: string;
    website?: string;
    paymentTermsDays?: number;
    creditLimit?: number;
    currency?: string;
    notes?: string;
    openingBalance?: number;
  }
): Promise<Supplier> {
  return callDoorRow<Supplier>("create_supplier", {
    p_organization: organizationId,
    p_supplier_code: generateSupplierCode(),
    p_legal_name: input.legalName,
    p_display_name: input.displayName,
    p_supplier_type: input.supplierType,
    p_tax_identifier: input.taxIdentifier,
    p_gstin: input.gstin,
    p_pan: input.pan,
    p_email: input.email,
    p_phone: input.phone,
    p_website: input.website,
    p_payment_terms_days: input.paymentTermsDays,
    p_credit_limit: input.creditLimit,
    p_currency: input.currency,
    p_notes: input.notes,
    p_opening_balance: input.openingBalance,
  });
}

export async function updateSupplier(
  supplierId: EntityId,
  organizationId: EntityId,
  updates: {
    legalName?: string;
    displayName?: string;
    supplierType?: SupplierType;
    taxIdentifier?: string;
    gstin?: string;
    pan?: string;
    email?: string;
    phone?: string;
    website?: string;
    paymentTermsDays?: number;
    creditLimit?: number;
    currency?: string;
    notes?: string;
  },
  expectedVersion: number
): Promise<Supplier> {
  return callDoorRow<Supplier>("update_supplier", {
    p_supplier: supplierId,
    p_organization: organizationId,
    p_expected_version: expectedVersion,
    p_legal_name: updates.legalName,
    p_display_name: updates.displayName,
    p_supplier_type: updates.supplierType,
    p_tax_identifier: updates.taxIdentifier,
    p_gstin: updates.gstin,
    p_pan: updates.pan,
    p_email: updates.email,
    p_phone: updates.phone,
    p_website: updates.website,
    p_payment_terms_days: updates.paymentTermsDays,
    p_credit_limit: updates.creditLimit,
    p_currency: updates.currency,
    p_notes: updates.notes,
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
    .order("name");
  return camelRows<SupplierContact>(asRead(chain));
}

export async function createSupplierContact(
  organizationId: EntityId,
  supplierId: EntityId,
  input: {
    name: string;
    designation?: string;
    phone?: string;
    email?: string;
    isPrimary?: boolean;
    notes?: string;
  }
): Promise<SupplierContact> {
  return callDoorRow<SupplierContact>("create_supplier_contact", {
    p_supplier: supplierId,
    p_organization: organizationId,
    p_name: input.name,
    p_designation: input.designation,
    p_phone: input.phone,
    p_email: input.email,
    p_is_primary: input.isPrimary ?? false,
    p_notes: input.notes,
  });
}

export async function updateSupplierContact(
  contactId: EntityId,
  organizationId: EntityId,
  input: {
    name?: string;
    designation?: string;
    phone?: string;
    email?: string;
    isPrimary?: boolean;
    notes?: string;
  }
): Promise<SupplierContact> {
  return callDoorRow<SupplierContact>("update_supplier_contact", {
    p_contact: contactId,
    p_organization: organizationId,
    p_name: input.name,
    p_designation: input.designation,
    p_phone: input.phone,
    p_email: input.email,
    p_is_primary: input.isPrimary,
    p_notes: input.notes,
  });
}

export async function deleteSupplierContact(
  contactId: EntityId,
  organizationId: EntityId
): Promise<void> {
  await callDoor("delete_supplier_contact", {
    p_contact: contactId,
    p_organization: organizationId,
  });
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
    .order("is_primary", { ascending: false })
    .order("address_type");
  return camelRows<SupplierAddress>(asRead(chain));
}

export async function createSupplierAddress(
  organizationId: EntityId,
  supplierId: EntityId,
  input: {
    addressType?: SupplierAddressType;
    addressLine1: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    isPrimary?: boolean;
  }
): Promise<SupplierAddress> {
  return callDoorRow<SupplierAddress>("create_supplier_address", {
    p_supplier: supplierId,
    p_organization: organizationId,
    p_address_line1: input.addressLine1,
    p_address_type: input.addressType,
    p_address_line2: input.addressLine2,
    p_city: input.city,
    p_state: input.state,
    p_postal_code: input.postalCode,
    p_country: input.country,
    p_is_primary: input.isPrimary ?? false,
  });
}

export async function updateSupplierAddress(
  addressId: EntityId,
  organizationId: EntityId,
  input: {
    addressType?: SupplierAddressType;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    isPrimary?: boolean;
  }
): Promise<SupplierAddress> {
  return callDoorRow<SupplierAddress>("update_supplier_address", {
    p_address: addressId,
    p_organization: organizationId,
    p_address_type: input.addressType,
    p_address_line1: input.addressLine1,
    p_address_line2: input.addressLine2,
    p_city: input.city,
    p_state: input.state,
    p_postal_code: input.postalCode,
    p_country: input.country,
    p_is_primary: input.isPrimary,
  });
}

export async function deleteSupplierAddress(
  addressId: EntityId,
  organizationId: EntityId
): Promise<void> {
  await callDoor("delete_supplier_address", {
    p_address: addressId,
    p_organization: organizationId,
  });
}

// ============================================================ supplier items

export async function listSupplierItems(
  opts?: { supplierId?: EntityId; inventoryItemId?: EntityId }
): Promise<SupplierItem[]> {
  const sb = requireSupabase();
  let chain = sb.from(SUPPLIER_ITEMS).select(SUPPLIER_ITEM_COLUMNS);
  if (opts?.supplierId) chain = chain.eq("supplier_id", opts.supplierId);
  if (opts?.inventoryItemId) chain = chain.eq("inventory_item_id", opts.inventoryItemId);
  return camelRows<SupplierItem>(asRead(chain.order("inventory_item_id")));
}

export async function createSupplierItem(
  organizationId: EntityId,
  supplierId: EntityId,
  inventoryItemId: EntityId,
  input: {
    purchaseUnit: EntityId;
    conversionToBase?: number;
    supplierItemCode?: string;
    supplierItemName?: string;
    lastPurchaseRate?: number;
    standardRate?: number;
    minimumOrderQty?: number;
    leadTimeDays?: number;
    isPreferred?: boolean;
    notes?: string;
  }
): Promise<SupplierItem> {
  return callDoorRow<SupplierItem>("create_supplier_item", {
    p_supplier: supplierId,
    p_organization: organizationId,
    p_inventory_item: inventoryItemId,
    p_purchase_unit: input.purchaseUnit,
    p_conversion_to_base: input.conversionToBase,
    p_supplier_item_code: input.supplierItemCode,
    p_supplier_item_name: input.supplierItemName,
    p_last_purchase_rate: input.lastPurchaseRate,
    p_standard_rate: input.standardRate,
    p_minimum_order_qty: input.minimumOrderQty,
    p_lead_time_days: input.leadTimeDays,
    p_is_preferred: input.isPreferred ?? false,
    p_notes: input.notes,
  });
}

export async function updateSupplierItem(
  supplierItemId: EntityId,
  organizationId: EntityId,
  updates: {
    purchaseUnit?: EntityId;
    conversionToBase?: number;
    supplierItemCode?: string;
    supplierItemName?: string;
    lastPurchaseRate?: number;
    standardRate?: number;
    minimumOrderQty?: number;
    leadTimeDays?: number;
    isPreferred?: boolean;
    isActive?: boolean;
    notes?: string;
    expectedVersion?: number;
  }
): Promise<SupplierItem> {
  return callDoorRow<SupplierItem>("update_supplier_item", {
    p_supplier_item: supplierItemId,
    p_organization: organizationId,
    p_purchase_unit: updates.purchaseUnit,
    p_conversion_to_base: updates.conversionToBase,
    p_supplier_item_code: updates.supplierItemCode,
    p_supplier_item_name: updates.supplierItemName,
    p_last_purchase_rate: updates.lastPurchaseRate,
    p_standard_rate: updates.standardRate,
    p_minimum_order_qty: updates.minimumOrderQty,
    p_lead_time_days: updates.leadTimeDays,
    p_is_preferred: updates.isPreferred,
    p_is_active: updates.isActive,
    p_notes: updates.notes,
    p_expected_version: updates.expectedVersion,
  });
}

// ============================================================ price history

export async function listSupplierPriceHistory(
  opts: { supplierId: EntityId; inventoryItemId: EntityId }
): Promise<SupplierPriceHistory[]> {
  const sb = requireSupabase();
  const chain = sb
    .from(PRICE_HISTORY)
    .select(PRICE_HISTORY_COLUMNS)
    .eq("supplier_id", opts.supplierId)
    .eq("inventory_item_id", opts.inventoryItemId);
  return camelRows<SupplierPriceHistory>(
    asRead(chain.order("purchase_date", { ascending: false }))
  );
}
