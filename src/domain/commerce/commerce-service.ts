/**
 * Commerce service layer (Prompt #14, migration 044).
 *
 * Covers commerce channels, public profiles (property/outlet), QR codes,
 * commerce sessions, table requests, delivery addresses, and commerce settings.
 * All writes go through SECURITY DEFINER doors; reads are plain SELECTs under RLS.
 */

import { requireSupabase } from "@/db/client";
import { asRead, callDoor, callDoorRow, camelRows, firstCamelRow } from "@/db/rpc";
import type { EntityId } from "@/domain/identity/types";
import type {
  CommerceChannel,
  CommerceChannelType,
  CommerceChannelStatus,
  PropertyPublicProfile,
  OutletPublicProfile,
  PublicProfileStatus,
  QRCode,
  QRCodeType,
  QRCodeStatus,
  CommerceSession,
  CommerceSessionStatus,
  SourceChannel,
  TableRequest,
  TableRequestType,
  TableRequestStatus,
  DeliveryAddress,
  DeliveryAddressLabel,
  CommerceSettings,
  DietaryType,
} from "./types";

const COMMERCE_CHANNELS = "commerce_channels";
const PROPERTY_PUBLIC_PROFILES = "property_public_profiles";
const OUTLET_PUBLIC_PROFILES = "outlet_public_profiles";
const QR_CODES = "qr_codes";
const COMMERCE_SESSIONS = "commerce_sessions";
const TABLE_REQUESTS = "table_requests";
const DELIVERY_ADDRESSES = "delivery_addresses";
const COMMERCE_SETTINGS = "commerce_settings";

const COMMERCE_CHANNEL_COLUMNS =
  "id, organization_id, property_id, outlet_id, name, type, status, configuration, " +
  "created_at, updated_at";

const PROPERTY_PUBLIC_PROFILE_COLUMNS =
  "property_id, public_name, slug, description, short_description, logo, cover_image, " +
  "phone, email, website, address, city, state, country, latitude, longitude, " +
  "check_in_time, check_out_time, status, created_at, updated_at";

const OUTLET_PUBLIC_PROFILE_COLUMNS =
  "outlet_id, public_name, slug, description, cover_image, phone, email, address, " +
  "opening_hours, status, created_at, updated_at";

const QR_CODE_COLUMNS =
  "id, organization_id, property_id, outlet_id, table_id, type, code, short_code, " +
  "target_type, target_id, status, created_at, updated_at";

const COMMERCE_SESSION_COLUMNS =
  "id, organization_id, property_id, outlet_id, channel, table_id, customer_id, " +
  "session_token, status, started_at, expires_at, metadata, created_at, updated_at";

const TABLE_REQUEST_COLUMNS =
  "id, organization_id, property_id, outlet_id, table_id, commerce_session_id, " +
  "type, message, status, created_at, updated_at, resolved_at, resolved_by";

const DELIVERY_ADDRESS_COLUMNS =
  "id, organization_id, customer_id, name, mobile, address_line1, address_line2, " +
  "landmark, city, state, postal_code, latitude, longitude, label, created_at, updated_at";

const COMMERCE_SETTINGS_COLUMNS =
  "id, organization_id, property_id, qr_ordering_enabled, online_ordering_enabled, " +
  "takeaway_enabled, delivery_enabled, direct_booking_enabled, require_customer_mobile, " +
  "allow_guest_checkout, minimum_order_amount, service_charge_enabled, public_menu_enabled, " +
  "created_at, updated_at";

/* --------------------------------------------------------------------- scope */

export type CommerceScope = {
  organizationId: EntityId;
  propertyId?: EntityId;
  outletId?: EntityId;
};

// =================================================================== channels

export async function listCommerceChannels(
  scope: CommerceScope,
): Promise<CommerceChannel[]> {
  const sb = requireSupabase();
  let query = sb
    .from(COMMERCE_CHANNELS)
    .select(COMMERCE_CHANNEL_COLUMNS)
    .eq("organization_id", scope.organizationId);

  if (scope.propertyId) {
    query = query.eq("property_id", scope.propertyId);
  }
  if (scope.outletId) {
    query = query.eq("outlet_id", scope.outletId);
  }

  return camelRows<CommerceChannel>(asRead(query.order("created_at", { ascending: false })));
}

export async function getCommerceChannel(
  scope: CommerceScope,
  channelId: EntityId,
): Promise<CommerceChannel | null> {
  const sb = requireSupabase();
  return firstCamelRow<CommerceChannel>(
    asRead(
      sb
        .from(COMMERCE_CHANNELS)
        .select(COMMERCE_CHANNEL_COLUMNS)
        .eq("id", channelId)
        .eq("organization_id", scope.organizationId)
        .maybeSingle(),
    ),
  );
}

export async function createCommerceChannel(
  scope: CommerceScope,
  params: {
    name: string;
    type: CommerceChannelType;
    propertyId?: EntityId;
    outletId?: EntityId;
    configuration?: Record<string, unknown>;
  },
): Promise<CommerceChannel> {
  return callDoorRow<CommerceChannel>("create_commerce_channel", {
    p_organization: scope.organizationId,
    p_property: params.propertyId ?? null,
    p_outlet: params.outletId ?? null,
    p_name: params.name,
    p_type: params.type,
    p_configuration: params.configuration ?? null,
  });
}

export async function updateCommerceChannel(
  scope: CommerceScope,
  channelId: EntityId,
  params: {
    name?: string;
    status?: CommerceChannelStatus;
    configuration?: Record<string, unknown>;
  },
): Promise<CommerceChannel> {
  return callDoorRow<CommerceChannel>("update_commerce_channel", {
    p_organization: scope.organizationId,
    p_channel: channelId,
    p_name: params.name ?? null,
    p_status: params.status ?? null,
    p_configuration: params.configuration ?? null,
  });
}

// =================================================================== public profiles

export async function getPropertyPublicProfile(
  propertyId: EntityId,
): Promise<PropertyPublicProfile | null> {
  const sb = requireSupabase();
  return firstCamelRow<PropertyPublicProfile>(
    asRead(
      sb
        .from(PROPERTY_PUBLIC_PROFILES)
        .select(PROPERTY_PUBLIC_PROFILE_COLUMNS)
        .eq("property_id", propertyId)
        .maybeSingle(),
    ),
  );
}

export async function getPropertyPublicProfileBySlug(
  slug: string,
): Promise<PropertyPublicProfile | null> {
  const sb = requireSupabase();
  return firstCamelRow<PropertyPublicProfile>(
    asRead(
      sb
        .from(PROPERTY_PUBLIC_PROFILES)
        .select(PROPERTY_PUBLIC_PROFILE_COLUMNS)
        .eq("slug", slug)
        .eq("status", "ACTIVE")
        .maybeSingle(),
    ),
  );
}

export async function upsertPropertyPublicProfile(
  scope: CommerceScope,
  propertyId: EntityId,
  params: {
    publicName: string;
    slug: string;
    description?: string | null;
    shortDescription?: string | null;
    logo?: string | null;
    coverImage?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    checkInTime?: string | null;
    checkOutTime?: string | null;
    status?: PublicProfileStatus;
  },
): Promise<PropertyPublicProfile> {
  return callDoorRow<PropertyPublicProfile>("upsert_property_public_profile", {
    p_organization: scope.organizationId,
    p_property: propertyId,
    p_public_name: params.publicName,
    p_slug: params.slug,
    p_description: params.description ?? null,
    p_short_description: params.shortDescription ?? null,
    p_logo: params.logo ?? null,
    p_cover_image: params.coverImage ?? null,
    p_phone: params.phone ?? null,
    p_email: params.email ?? null,
    p_website: params.website ?? null,
    p_address: params.address ?? null,
    p_city: params.city ?? null,
    p_state: params.state ?? null,
    p_country: params.country ?? null,
    p_latitude: params.latitude ?? null,
    p_longitude: params.longitude ?? null,
    p_check_in_time: params.checkInTime ?? null,
    p_check_out_time: params.checkOutTime ?? null,
    p_status: params.status ?? "ACTIVE",
  });
}

export async function getOutletPublicProfile(
  outletId: EntityId,
): Promise<OutletPublicProfile | null> {
  const sb = requireSupabase();
  return firstCamelRow<OutletPublicProfile>(
    asRead(
      sb
        .from(OUTLET_PUBLIC_PROFILES)
        .select(OUTLET_PUBLIC_PROFILE_COLUMNS)
        .eq("outlet_id", outletId)
        .maybeSingle(),
    ),
  );
}

export async function getOutletPublicProfileBySlug(
  slug: string,
): Promise<OutletPublicProfile | null> {
  const sb = requireSupabase();
  return firstCamelRow<OutletPublicProfile>(
    asRead(
      sb
        .from(OUTLET_PUBLIC_PROFILES)
        .select(OUTLET_PUBLIC_PROFILE_COLUMNS)
        .eq("slug", slug)
        .eq("status", "ACTIVE")
        .maybeSingle(),
    ),
  );
}

export async function upsertOutletPublicProfile(
  scope: CommerceScope,
  outletId: EntityId,
  params: {
    publicName: string;
    slug: string;
    description?: string | null;
    coverImage?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    openingHours?: Record<string, unknown> | null;
    status?: PublicProfileStatus;
  },
): Promise<OutletPublicProfile> {
  return callDoorRow<OutletPublicProfile>("upsert_outlet_public_profile", {
    p_organization: scope.organizationId,
    p_outlet: outletId,
    p_public_name: params.publicName,
    p_slug: params.slug,
    p_description: params.description ?? null,
    p_cover_image: params.coverImage ?? null,
    p_phone: params.phone ?? null,
    p_email: params.email ?? null,
    p_address: params.address ?? null,
    p_opening_hours: params.openingHours ?? null,
    p_status: params.status ?? "ACTIVE",
  });
}

// =================================================================== QR codes

export async function listQRCodes(
  scope: CommerceScope,
): Promise<QRCode[]> {
  const sb = requireSupabase();
  let query = sb
    .from(QR_CODES)
    .select(QR_CODE_COLUMNS)
    .eq("organization_id", scope.organizationId);

  if (scope.propertyId) {
    query = query.eq("property_id", scope.propertyId);
  }
  if (scope.outletId) {
    query = query.eq("outlet_id", scope.outletId);
  }

  return camelRows<QRCode>(asRead(query.order("created_at", { ascending: false })));
}

export async function getQRCodeByCode(
  code: string,
): Promise<QRCode | null> {
  const sb = requireSupabase();
  return firstCamelRow<QRCode>(
    asRead(
      sb
        .from(QR_CODES)
        .select(QR_CODE_COLUMNS)
        .eq("code", code)
        .eq("status", "ACTIVE")
        .maybeSingle(),
    ),
  );
}

export async function createQRCode(
  scope: CommerceScope,
  params: {
    type: QRCodeType;
    propertyId?: EntityId;
    outletId?: EntityId;
    tableId?: EntityId;
    targetType?: string;
    targetId?: EntityId;
    shortCode?: string;
  },
): Promise<QRCode> {
  return callDoorRow<QRCode>("create_qr_code", {
    p_organization: scope.organizationId,
    p_property: params.propertyId ?? null,
    p_outlet: params.outletId ?? null,
    p_table: params.tableId ?? null,
    p_type: params.type,
    p_target_type: params.targetType ?? null,
    p_target_id: params.targetId ?? null,
    p_short_code: params.shortCode ?? null,
  });
}

export async function updateQRCodeStatus(
  scope: CommerceScope,
  qrCodeId: EntityId,
  status: QRCodeStatus,
): Promise<QRCode> {
  return callDoorRow<QRCode>("update_qr_code_status", {
    p_organization: scope.organizationId,
    p_qr_code: qrCodeId,
    p_status: status,
  });
}

// =================================================================== commerce sessions

export async function createCommerceSession(
  scope: CommerceScope,
  params: {
    propertyId: EntityId;
    outletId: EntityId;
    channel: SourceChannel;
    tableId?: EntityId;
    customerId?: EntityId;
    metadata?: Record<string, unknown>;
  },
): Promise<CommerceSession> {
  return callDoorRow<CommerceSession>("create_commerce_session", {
    p_organization: scope.organizationId,
    p_property: params.propertyId,
    p_outlet: params.outletId,
    p_channel: params.channel,
    p_table: params.tableId ?? null,
    p_customer: params.customerId ?? null,
    p_metadata: params.metadata ?? null,
  });
}

export async function updateCommerceSessionStatus(
  scope: CommerceScope,
  sessionId: EntityId,
  status: CommerceSessionStatus,
): Promise<CommerceSession> {
  return callDoorRow<CommerceSession>("update_commerce_session_status", {
    p_organization: scope.organizationId,
    p_session: sessionId,
    p_status: status,
  });
}

export async function getCommerceSessionByToken(
  sessionToken: string,
): Promise<CommerceSession | null> {
  const sb = requireSupabase();
  return firstCamelRow<CommerceSession>(
    asRead(
      sb
        .from(COMMERCE_SESSIONS)
        .select(COMMERCE_SESSION_COLUMNS)
        .eq("session_token", sessionToken)
        .eq("status", "ACTIVE")
        .maybeSingle(),
    ),
  );
}

// =================================================================== table requests

export async function listTableRequests(
  scope: CommerceScope,
): Promise<TableRequest[]> {
  const sb = requireSupabase();
  let query = sb
    .from(TABLE_REQUESTS)
    .select(TABLE_REQUEST_COLUMNS)
    .eq("organization_id", scope.organizationId);

  if (scope.propertyId) {
    query = query.eq("property_id", scope.propertyId);
  }
  if (scope.outletId) {
    query = query.eq("outlet_id", scope.outletId);
  }

  return camelRows<TableRequest>(asRead(query.order("created_at", { ascending: false })));
}

export async function createTableRequest(
  scope: CommerceScope,
  params: {
    propertyId: EntityId;
    outletId: EntityId;
    tableId: EntityId;
    type: TableRequestType;
    commerceSessionId?: EntityId;
    message?: string | null;
  },
): Promise<TableRequest> {
  return callDoorRow<TableRequest>("create_table_request", {
    p_organization: scope.organizationId,
    p_property: params.propertyId,
    p_outlet: params.outletId,
    p_table: params.tableId,
    p_type: params.type,
    p_commerce_session: params.commerceSessionId ?? null,
    p_message: params.message ?? null,
  });
}

export async function updateTableRequestStatus(
  scope: CommerceScope,
  requestId: EntityId,
  status: TableRequestStatus,
): Promise<TableRequest> {
  return callDoorRow<TableRequest>("update_table_request_status", {
    p_organization: scope.organizationId,
    p_request: requestId,
    p_status: status,
  });
}

// =================================================================== delivery addresses

export async function listDeliveryAddresses(
  scope: CommerceScope,
  customerId?: EntityId,
): Promise<DeliveryAddress[]> {
  const sb = requireSupabase();
  let query = sb
    .from(DELIVERY_ADDRESSES)
    .select(DELIVERY_ADDRESS_COLUMNS)
    .eq("organization_id", scope.organizationId);

  if (customerId) {
    query = query.eq("customer_id", customerId);
  }

  return camelRows<DeliveryAddress>(asRead(query.order("created_at", { ascending: false })));
}

export async function addDeliveryAddress(
  scope: CommerceScope,
  params: {
    customerId?: EntityId;
    name: string;
    mobile: string;
    addressLine1: string;
    addressLine2?: string | null;
    landmark?: string | null;
    city: string;
    state: string;
    postalCode: string;
    latitude?: number | null;
    longitude?: number | null;
    label: DeliveryAddressLabel;
  },
): Promise<DeliveryAddress> {
  return callDoorRow<DeliveryAddress>("add_delivery_address", {
    p_organization: scope.organizationId,
    p_customer: params.customerId ?? null,
    p_name: params.name,
    p_mobile: params.mobile,
    p_address_line1: params.addressLine1,
    p_address_line2: params.addressLine2 ?? null,
    p_landmark: params.landmark ?? null,
    p_city: params.city,
    p_state: params.state,
    p_postal_code: params.postalCode,
    p_latitude: params.latitude ?? null,
    p_longitude: params.longitude ?? null,
    p_label: params.label,
  });
}

export async function removeDeliveryAddress(
  scope: CommerceScope,
  addressId: EntityId,
): Promise<void> {
  await callDoor("remove_delivery_address", {
    p_organization: scope.organizationId,
    p_address: addressId,
  });
}

// =================================================================== commerce settings

export async function getCommerceSettings(
  scope: CommerceScope,
  propertyId: EntityId,
): Promise<CommerceSettings | null> {
  const sb = requireSupabase();
  return firstCamelRow<CommerceSettings>(
    asRead(
      sb
        .from(COMMERCE_SETTINGS)
        .select(COMMERCE_SETTINGS_COLUMNS)
        .eq("organization_id", scope.organizationId)
        .eq("property_id", propertyId)
        .maybeSingle(),
    ),
  );
}

export async function upsertCommerceSettings(
  scope: CommerceScope,
  propertyId: EntityId,
  params: {
    qrOrderingEnabled?: boolean;
    onlineOrderingEnabled?: boolean;
    takeawayEnabled?: boolean;
    deliveryEnabled?: boolean;
    directBookingEnabled?: boolean;
    requireCustomerMobile?: boolean;
    allowGuestCheckout?: boolean;
    minimumOrderAmount?: number | null;
    serviceChargeEnabled?: boolean;
    publicMenuEnabled?: boolean;
  },
): Promise<CommerceSettings> {
  return callDoorRow<CommerceSettings>("upsert_commerce_settings", {
    p_organization: scope.organizationId,
    p_property: propertyId,
    p_qr_ordering: params.qrOrderingEnabled ?? true,
    p_online_ordering: params.onlineOrderingEnabled ?? true,
    p_takeaway: params.takeawayEnabled ?? true,
    p_delivery: params.deliveryEnabled ?? false,
    p_direct_booking: params.directBookingEnabled ?? true,
    p_require_mobile: params.requireCustomerMobile ?? false,
    p_guest_checkout: params.allowGuestCheckout ?? true,
    p_min_order: params.minimumOrderAmount ?? null,
    p_service_charge: params.serviceChargeEnabled ?? false,
    p_public_menu: params.publicMenuEnabled ?? true,
  });
}

// =================================================================== menu item public fields

export async function updateMenuItemPublicFields(
  scope: CommerceScope,
  menuItemId: EntityId,
  params: {
    isPublic?: boolean;
    publicDescription?: string | null;
    publicImage?: string | null;
    dietary?: DietaryType | null;
    allergenInfo?: Record<string, unknown> | null;
  },
): Promise<void> {
  await callDoor("update_menu_item_public_fields", {
    p_organization: scope.organizationId,
    p_menu_item: menuItemId,
    p_is_public: params.isPublic ?? null,
    p_public_description: params.publicDescription ?? null,
    p_public_image: params.publicImage ?? null,
    p_dietary: params.dietary ?? null,
    p_allergen_info: params.allergenInfo ?? null,
  });
}

// =================================================================== order source channel

export async function updateOrderSourceChannel(
  scope: CommerceScope,
  orderId: EntityId,
  sourceChannel: SourceChannel,
): Promise<void> {
  await callDoor("update_order_source_channel", {
    p_organization: scope.organizationId,
    p_order: orderId,
    p_source_channel: sourceChannel,
  });
}
