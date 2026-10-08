/**
 * Commerce domain types (Prompt #14, migration 044).
 *
 * Digital commerce layer: QR ordering, online ordering, direct booking,
 * public profiles, table requests, delivery addresses, commerce settings.
 * All tables are org-scoped under RLS.
 * Writes go through security-definer doors; reads are plain SELECTs.
 *
 * Key concepts:
 *   - CommerceChannel: digital sales channel (QR, website, direct booking, etc.)
 *   - PropertyPublicProfile: public-facing property representation
 *   - OutletPublicProfile: public-facing outlet representation
 *   - QRCode: scannable QR for menu, table ordering, property, booking
 *   - CommerceSession: customer ordering session (QR scan, online order)
 *   - TableRequest: table-side service request (call staff, request bill, etc.)
 *   - DeliveryAddress: customer delivery address
 *   - CommerceSettings: per-property commerce feature flags
 */

import type { EntityId } from "@/domain/identity/types";

// =================================================================== channel types

export type CommerceChannelType =
  | "QR_MENU"
  | "TABLE_QR"
  | "ONLINE_ORDERING"
  | "DIRECT_BOOKING"
  | "WEBSITE"
  | "MOBILE_WEB"
  | "OTHER";

export const COMMERCE_CHANNEL_TYPES: readonly CommerceChannelType[] = [
  "QR_MENU",
  "TABLE_QR",
  "ONLINE_ORDERING",
  "DIRECT_BOOKING",
  "WEBSITE",
  "MOBILE_WEB",
  "OTHER",
];

// =================================================================== channel status

export type CommerceChannelStatus = "ACTIVE" | "INACTIVE";

export const COMMERCE_CHANNEL_STATUSES: readonly CommerceChannelStatus[] = [
  "ACTIVE",
  "INACTIVE",
];

// =================================================================== QR code types

export type QRCodeType =
  | "MENU"
  | "TABLE_ORDER"
  | "PROPERTY"
  | "OUTLET"
  | "BOOKING"
  | "EVENT"
  | "OTHER";

export const QR_CODE_TYPES: readonly QRCodeType[] = [
  "MENU",
  "TABLE_ORDER",
  "PROPERTY",
  "OUTLET",
  "BOOKING",
  "EVENT",
  "OTHER",
];

// =================================================================== QR code status

export type QRCodeStatus = "ACTIVE" | "INACTIVE" | "REVOKED";

export const QR_CODE_STATUSES: readonly QRCodeStatus[] = [
  "ACTIVE",
  "INACTIVE",
  "REVOKED",
];

// =================================================================== commerce session status

export type CommerceSessionStatus =
  | "ACTIVE"
  | "EXPIRED"
  | "COMPLETED"
  | "CANCELLED";

export const COMMERCE_SESSION_STATUSES: readonly CommerceSessionStatus[] = [
  "ACTIVE",
  "EXPIRED",
  "COMPLETED",
  "CANCELLED",
];

// =================================================================== table request types

export type TableRequestType =
  | "CALL_STAFF"
  | "REQUEST_BILL"
  | "REQUEST_WATER"
  | "REQUEST_CLEANING"
  | "REQUEST_ASSISTANCE"
  | "OTHER";

export const TABLE_REQUEST_TYPES: readonly TableRequestType[] = [
  "CALL_STAFF",
  "REQUEST_BILL",
  "REQUEST_WATER",
  "REQUEST_CLEANING",
  "REQUEST_ASSISTANCE",
  "OTHER",
];

// =================================================================== table request status

export type TableRequestStatus =
  | "OPEN"
  | "ACKNOWLEDGED"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "CANCELLED";

export const TABLE_REQUEST_STATUSES: readonly TableRequestStatus[] = [
  "OPEN",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "RESOLVED",
  "CANCELLED",
];

// =================================================================== delivery address labels

export type DeliveryAddressLabel = "HOME" | "WORK" | "OTHER";

export const DELIVERY_ADDRESS_LABELS: readonly DeliveryAddressLabel[] = [
  "HOME",
  "WORK",
  "OTHER",
];

// =================================================================== public profile status

export type PublicProfileStatus = "ACTIVE" | "INACTIVE";

export const PUBLIC_PROFILE_STATUSES: readonly PublicProfileStatus[] = [
  "ACTIVE",
  "INACTIVE",
];

// =================================================================== dietary types

export type DietaryType =
  | "VEG"
  | "NON_VEG"
  | "VEGAN"
  | "EGGETARIAN"
  | "JAIN"
  | "OTHER";

export const DIETARY_TYPES: readonly DietaryType[] = [
  "VEG",
  "NON_VEG",
  "VEGAN",
  "EGGETARIAN",
  "JAIN",
  "OTHER",
];

// =================================================================== source channels

export type SourceChannel =
  | "POS"
  | "QR"
  | "WEBSITE"
  | "DIRECT_BOOKING"
  | "PHONE"
  | "WALK_IN"
  | "OTA"
  | "WHATSAPP"
  | "OTHER";

export const SOURCE_CHANNELS: readonly SourceChannel[] = [
  "POS",
  "QR",
  "WEBSITE",
  "DIRECT_BOOKING",
  "PHONE",
  "WALK_IN",
  "OTA",
  "WHATSAPP",
  "OTHER",
];

// =================================================================== scope

export type CommerceScope = {
  organizationId: EntityId;
  propertyId?: EntityId;
  outletId?: EntityId;
};

// =================================================================== entity types

export type CommerceChannel = {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly propertyId: EntityId | null;
  readonly outletId: EntityId | null;

  readonly name: string;
  readonly type: CommerceChannelType;
  readonly status: CommerceChannelStatus;

  readonly configuration: Record<string, unknown> | null;

  readonly createdAt: string;
  readonly updatedAt: string;
};

export type PropertyPublicProfile = {
  readonly propertyId: EntityId;

  readonly publicName: string;
  readonly slug: string;

  readonly description: string | null;
  readonly shortDescription: string | null;

  readonly logo: string | null;
  readonly coverImage: string | null;

  readonly phone: string | null;
  readonly email: string | null;
  readonly website: string | null;

  readonly address: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly country: string | null;

  readonly latitude: number | null;
  readonly longitude: number | null;

  readonly checkInTime: string | null;
  readonly checkOutTime: string | null;

  readonly status: PublicProfileStatus;

  readonly createdAt: string;
  readonly updatedAt: string;
};

export type OutletPublicProfile = {
  readonly outletId: EntityId;

  readonly publicName: string;
  readonly slug: string;

  readonly description: string | null;

  readonly coverImage: string | null;

  readonly phone: string | null;
  readonly email: string | null;

  readonly address: string | null;

  readonly openingHours: Record<string, unknown> | null;

  readonly status: PublicProfileStatus;

  readonly createdAt: string;
  readonly updatedAt: string;
};

export type QRCode = {
  readonly id: EntityId;
  readonly organizationId: EntityId;

  readonly propertyId: EntityId | null;
  readonly outletId: EntityId | null;
  readonly tableId: EntityId | null;

  readonly type: QRCodeType;
  readonly code: string;
  readonly shortCode: string | null;

  readonly targetType: string | null;
  readonly targetId: EntityId | null;

  readonly status: QRCodeStatus;

  readonly createdAt: string;
  readonly updatedAt: string;
};

export type CommerceSession = {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly propertyId: EntityId;
  readonly outletId: EntityId;

  readonly channel: SourceChannel;

  readonly tableId: EntityId | null;
  readonly customerId: EntityId | null;

  readonly sessionToken: string;
  readonly status: CommerceSessionStatus;

  readonly startedAt: string;
  readonly expiresAt: string | null;

  readonly metadata: Record<string, unknown> | null;

  readonly createdAt: string;
  readonly updatedAt: string;
};

export type TableRequest = {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly propertyId: EntityId;
  readonly outletId: EntityId;
  readonly tableId: EntityId;
  readonly commerceSessionId: EntityId | null;

  readonly type: TableRequestType;
  readonly message: string | null;

  readonly status: TableRequestStatus;

  readonly createdAt: string;
  readonly updatedAt: string;
  readonly resolvedAt: string | null;
  readonly resolvedBy: EntityId | null;
};

export type DeliveryAddress = {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly customerId: EntityId | null;

  readonly name: string;
  readonly mobile: string;

  readonly addressLine1: string;
  readonly addressLine2: string | null;
  readonly landmark: string | null;
  readonly city: string;
  readonly state: string;
  readonly postalCode: string;

  readonly latitude: number | null;
  readonly longitude: number | null;

  readonly label: DeliveryAddressLabel;

  readonly createdAt: string;
  readonly updatedAt: string;
};

export type CommerceSettings = {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly propertyId: EntityId;

  readonly qrOrderingEnabled: boolean;
  readonly onlineOrderingEnabled: boolean;
  readonly takeawayEnabled: boolean;
  readonly deliveryEnabled: boolean;
  readonly directBookingEnabled: boolean;

  readonly requireCustomerMobile: boolean;
  readonly allowGuestCheckout: boolean;

  readonly minimumOrderAmount: number | null;
  readonly serviceChargeEnabled: boolean;

  readonly publicMenuEnabled: boolean;

  readonly createdAt: string;
  readonly updatedAt: string;
};

// =================================================================== public menu item (extended)

export type PublicMenuItem = {
  readonly id: EntityId;
  readonly categoryId: EntityId;

  readonly name: string;
  readonly publicDescription: string | null;
  readonly description: string | null;
  readonly publicImage: string | null;
  readonly image: string | null;

  readonly price: number;

  readonly isPublic: boolean;
  readonly dietary: DietaryType | null;
  readonly isVegetarian: boolean;
  readonly isNonVegetarian: boolean;
  readonly isVegan: boolean;
  readonly isEgg: boolean;

  readonly allergenInfo: Record<string, unknown> | null;

  readonly isAvailable: boolean;
};
