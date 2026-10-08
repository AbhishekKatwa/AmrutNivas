/**
 * Hotel PMS domain types (Prompt #08, migrations 033-038).
 *
 * This module is the client's mirror of the schema's hotel tables. Each type array must match
 * the CHECK constraint in the matching migration, in both directions.
 *
 * Hierarchy: Organization → Property → (RoomType | Room | Guest | Reservation | Stay | Folio).
 *
 * Key concepts:
 *   - Guest: a person who may stay. PII protected.
 *   - RoomType: a category of room (Deluxe, Suite, etc.).
 *   - Room: a physical room with a number, status, and housekeeping state.
 *   - Reservation: a booking (future stay). Has a state machine.
 *   - Stay: actual occupancy (created at check-in).
 *   - Folio: financial record of a stay (charges and payments).
 *
 * State machines:
 *   - Reservation: INQUIRY → TENTATIVE → CONFIRMED → CHECKED_IN → CHECKED_OUT
 *                  (with CANCELLED and NO_SHOW branches)
 *   - Stay: EXPECTED → CHECKED_IN → CHECKED_OUT (with EXTENDED and EARLY_DEPARTURE)
 *   - Folio: OPEN → SETTLED → CLOSED
 */

// =================================================================== guests

export type GuestStatus = "ACTIVE" | "ARCHIVED";
export type Gender = "MALE" | "FEMALE" | "OTHER" | "PREFER_NOT_TO_SAY";
export type VipStatus = "REGULAR" | "VIP" | "VVIP";
export type GuestSource = "WALK_IN" | "WEBSITE" | "OTA" | "CORPORATE" | "REFERRAL" | "OTHER";

export const GUEST_STATUSES: readonly GuestStatus[] = ["ACTIVE", "ARCHIVED"];
export const GENDERS: readonly Gender[] = ["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"];
export const VIP_STATUSES: readonly VipStatus[] = ["REGULAR", "VIP", "VVIP"];
export const GUEST_SOURCES: readonly GuestSource[] = [
  "WALK_IN",
  "WEBSITE",
  "OTA",
  "CORPORATE",
  "REFERRAL",
  "OTHER",
];

export type DocumentType = "PASSPORT" | "DRIVING_LICENSE" | "AADHAAR" | "PAN" | "OTHER";

export const DOCUMENT_TYPES: readonly DocumentType[] = [
  "PASSPORT",
  "DRIVING_LICENSE",
  "AADHAAR",
  "PAN",
  "OTHER",
];

export type Guest = {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  dateOfBirth: string | null;
  nationality: string | null;
  gender: Gender | null;
  address: string | null;
  vipStatus: VipStatus;
  source: GuestSource | null;
  totalStays: number;
  totalNights: number;
  notes: string | null;
  status: GuestStatus;
  archivedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type GuestDocument = {
  id: string;
  organizationId: string;
  guestId: string;
  documentType: DocumentType;
  documentNumber: string;
  issuingCountry: string | null;
  expiryDate: string | null;
  verified: boolean;
  verifiedAt: string | null;
  verifiedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

// =================================================================== room types

export type RoomTypeStatus = "ACTIVE" | "ARCHIVED";

export const ROOM_TYPE_STATUSES: readonly RoomTypeStatus[] = ["ACTIVE", "ARCHIVED"];

export type RoomType = {
  id: string;
  organizationId: string;
  propertyId: string;
  code: string;
  name: string;
  description: string | null;
  maxOccupancy: number;
  baseOccupancy: number;
  bedConfiguration: Record<string, unknown> | null;
  roomSizeSqft: number | null;
  status: RoomTypeStatus;
  archivedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type Amenity = {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  category: string | null;
  icon: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RoomTypeAmenity = {
  roomTypeId: string;
  amenityId: string;
};

// =================================================================== rooms

export type OperationalStatus = "ACTIVE" | "OUT_OF_ORDER" | "OUT_OF_SERVICE" | "BLOCKED";
export type HousekeepingStatus =
  | "VACANT_CLEAN"
  | "VACANT_DIRTY"
  | "OCCUPIED_CLEAN"
  | "OCCUPIED_DIRTY"
  | "INSPECTED";

export const OPERATIONAL_STATUSES: readonly OperationalStatus[] = [
  "ACTIVE",
  "OUT_OF_ORDER",
  "OUT_OF_SERVICE",
  "BLOCKED",
];

export const HOUSEKEEPING_STATUSES: readonly HousekeepingStatus[] = [
  "VACANT_CLEAN",
  "VACANT_DIRTY",
  "OCCUPIED_CLEAN",
  "OCCUPIED_DIRTY",
  "INSPECTED",
];

export type Room = {
  id: string;
  organizationId: string;
  propertyId: string;
  roomTypeId: string;
  roomNumber: string;
  floor: string | null;
  building: string | null;
  operationalStatus: OperationalStatus;
  housekeepingStatus: HousekeepingStatus;
  notes: string | null;
  status: "ACTIVE" | "ARCHIVED";
  archivedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

// =================================================================== room blocks

export type BlockType = "MAINTENANCE" | "VIP_HOLD" | "GROUP_HOLD" | "OWNER_USE" | "RENOVATION";
export type RoomBlockStatus = "ACTIVE" | "EXPIRED" | "CANCELLED";

export const BLOCK_TYPES: readonly BlockType[] = [
  "MAINTENANCE",
  "VIP_HOLD",
  "GROUP_HOLD",
  "OWNER_USE",
  "RENOVATION",
];

export const ROOM_BLOCK_STATUSES: readonly RoomBlockStatus[] = ["ACTIVE", "EXPIRED", "CANCELLED"];

export type RoomBlock = {
  id: string;
  organizationId: string;
  propertyId: string;
  roomId: string;
  blockType: BlockType;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: RoomBlockStatus;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
};

// =================================================================== rate plans

export type MealPlan =
  | "ROOM_ONLY"
  | "BREAKFAST_INCLUDED"
  | "HALF_BOARD"
  | "FULL_BOARD"
  | "ALL_INCLUSIVE";

export const MEAL_PLANS: readonly MealPlan[] = [
  "ROOM_ONLY",
  "BREAKFAST_INCLUDED",
  "HALF_BOARD",
  "FULL_BOARD",
  "ALL_INCLUSIVE",
];

export type RatePlan = {
  id: string;
  organizationId: string;
  propertyId: string;
  code: string;
  name: string;
  description: string | null;
  mealPlan: MealPlan;
  inclusions: Record<string, unknown> | null;
  currency: string;
  status: "ACTIVE" | "ARCHIVED";
  archivedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type RoomRate = {
  id: string;
  organizationId: string;
  propertyId: string;
  ratePlanId: string;
  roomTypeId: string;
  rateDate: string;
  baseRate: number;
  extraAdultRate: number | null;
  extraChildRate: number | null;
  singleOccupancyRate: number | null;
  doubleOccupancyRate: number | null;
  minimumStay: number | null;
  maximumStay: number | null;
  closedToArrival: boolean;
  closedToDeparture: boolean;
  createdAt: string;
  updatedAt: string;
};

// =================================================================== reservations

export type ReservationSource = "WALK_IN" | "WEBSITE" | "OTA" | "PHONE" | "EMAIL" | "CORPORATE" | "OTHER";
export type ReservationStatus =
  | "INQUIRY"
  | "TENTATIVE"
  | "CONFIRMED"
  | "CHECKED_IN"
  | "CHECKED_OUT"
  | "CANCELLED"
  | "NO_SHOW";
export type DepositStatus = "NO_DEPOSIT" | "PARTIAL" | "FULL";

export const RESERVATION_SOURCES: readonly ReservationSource[] = [
  "WALK_IN",
  "WEBSITE",
  "OTA",
  "PHONE",
  "EMAIL",
  "CORPORATE",
  "OTHER",
];

export const RESERVATION_STATUSES: readonly ReservationStatus[] = [
  "INQUIRY",
  "TENTATIVE",
  "CONFIRMED",
  "CHECKED_IN",
  "CHECKED_OUT",
  "CANCELLED",
  "NO_SHOW",
];

export const DEPOSIT_STATUSES: readonly DepositStatus[] = ["NO_DEPOSIT", "PARTIAL", "FULL"];

export type Reservation = {
  id: string;
  organizationId: string;
  propertyId: string;
  reservationNumber: string;
  source: ReservationSource;
  status: ReservationStatus;
  primaryGuestId: string;
  arrivalDate: string;
  departureDate: string;
  adults: number;
  children: number;
  infants: number;
  roomTypeId: string | null;
  roomId: string | null;
  ratePlanId: string | null;
  currency: string;
  totalAmount: number;
  depositAmount: number;
  depositStatus: DepositStatus;
  specialRequests: string | null;
  notes: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  noShowAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
};

export type ReservationRateSnapshot = {
  id: string;
  organizationId: string;
  reservationId: string;
  rateDate: string;
  roomTypeId: string;
  ratePlanId: string;
  roomRate: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  createdAt: string;
};

export type ReservationRoomAssignment = {
  id: string;
  organizationId: string;
  reservationId: string;
  roomId: string;
  assignedAt: string;
  unassignedAt: string | null;
  reason: string | null;
  assignedBy: string;
};

// =================================================================== stays

export type StayStatus = "EXPECTED" | "CHECKED_IN" | "EXTENDED" | "CHECKED_OUT" | "EARLY_DEPARTURE";

export const STAY_STATUSES: readonly StayStatus[] = [
  "EXPECTED",
  "CHECKED_IN",
  "EXTENDED",
  "CHECKED_OUT",
  "EARLY_DEPARTURE",
];

export type Stay = {
  id: string;
  organizationId: string;
  propertyId: string;
  reservationId: string;
  primaryGuestId: string;
  roomId: string;
  checkInAt: string;
  expectedCheckOutAt: string;
  actualCheckOutAt: string | null;
  status: StayStatus;
  notes: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
};

export type StayGuestRole = "PRIMARY" | "ADDITIONAL" | "CHILD" | "OTHER";

export const STAY_GUEST_ROLES: readonly StayGuestRole[] = ["PRIMARY", "ADDITIONAL", "CHILD", "OTHER"];

export type StayGuest = {
  id: string;
  organizationId: string;
  stayId: string;
  guestId: string;
  role: StayGuestRole;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  createdAt: string;
};

export type RoomMoveReason = "GUEST_REQUEST" | "MAINTENANCE" | "UPGRADE" | "OPERATIONAL" | "OTHER";

export const ROOM_MOVE_REASONS: readonly RoomMoveReason[] = [
  "GUEST_REQUEST",
  "MAINTENANCE",
  "UPGRADE",
  "OPERATIONAL",
  "OTHER",
];

export type StayRoomMove = {
  id: string;
  organizationId: string;
  stayId: string;
  fromRoomId: string;
  toRoomId: string;
  movedAt: string;
  reason: RoomMoveReason;
  notes: string | null;
  movedBy: string;
};

// =================================================================== folios

export type FolioStatus = "OPEN" | "SETTLED" | "CLOSED";

export const FOLIO_STATUSES: readonly FolioStatus[] = ["OPEN", "SETTLED", "CLOSED"];

export type Folio = {
  id: string;
  organizationId: string;
  propertyId: string;
  stayId: string;
  folioNumber: string;
  status: FolioStatus;
  currency: string;
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  totalCharges: number;
  totalPayments: number;
  balance: number;
  openedAt: string;
  settledAt: string | null;
  closedAt: string | null;
  notes: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type FolioEntryType =
  | "ROOM_CHARGE"
  | "RESTAURANT_CHARGE"
  | "MINIBAR"
  | "LAUNDRY"
  | "SERVICE"
  | "TAX"
  | "DISCOUNT"
  | "PAYMENT"
  | "REFUND"
  | "ADJUSTMENT"
  | "VOID_CHARGE"
  | "VOID_PAYMENT"
  | "OTHER";

export const FOLIO_ENTRY_TYPES: readonly FolioEntryType[] = [
  "ROOM_CHARGE",
  "RESTAURANT_CHARGE",
  "MINIBAR",
  "LAUNDRY",
  "SERVICE",
  "TAX",
  "DISCOUNT",
  "PAYMENT",
  "REFUND",
  "ADJUSTMENT",
  "VOID_CHARGE",
  "VOID_PAYMENT",
  "OTHER",
];

export type FolioEntry = {
  id: string;
  organizationId: string;
  folioId: string;
  entryType: FolioEntryType;
  referenceType: string | null;
  referenceId: string | null;
  description: string;
  quantity: number;
  unitRate: number;
  amount: number;
  taxAmount: number;
  discountAmount: number;
  netAmount: number;
  businessDate: string;
  postedAt: string;
  voidedAt: string | null;
  voidReason: string | null;
  voidedBy: string | null;
  notes: string | null;
  createdAt: string;
  createdBy: string | null;
};
