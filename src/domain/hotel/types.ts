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
  vipStatus: VipStatus;
  source: GuestSource | null;
  totalStays: number;
  totalNights: number;
  notes: string | null;
  archivedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  // CRM fields (migration 041)
  customerType: string | null;
  companyName: string | null;
  designation: string | null;
  anniversaryDate: string | null;
  corporateAccountId: string | null;
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
  stayId: string;
  fromRoomId: string;
  toRoomId: string;
  movedAt: string;
  reason: RoomMoveReason;
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

// =================================================================== housekeeping tasks

export type HousekeepingTaskType =
  | "CHECKOUT_CLEAN"
  | "STAYOVER_CLEAN"
  | "DEEP_CLEAN"
  | "INSPECTION"
  | "TURNDOWN"
  | "SPECIAL_REQUEST"
  | "OTHER";

export const HOUSEKEEPING_TASK_TYPES: readonly HousekeepingTaskType[] = [
  "CHECKOUT_CLEAN",
  "STAYOVER_CLEAN",
  "DEEP_CLEAN",
  "INSPECTION",
  "TURNDOWN",
  "SPECIAL_REQUEST",
  "OTHER",
];

export type HousekeepingPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export const HOUSEKEEPING_PRIORITIES: readonly HousekeepingPriority[] = [
  "LOW",
  "NORMAL",
  "HIGH",
  "URGENT",
];

export type HousekeepingTaskStatus =
  | "PENDING"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "VERIFIED"
  | "CANCELLED";

export const HOUSEKEEPING_TASK_STATUSES: readonly HousekeepingTaskStatus[] = [
  "PENDING",
  "ASSIGNED",
  "IN_PROGRESS",
  "COMPLETED",
  "VERIFIED",
  "CANCELLED",
];

export type HousekeepingTask = {
  id: string;
  organizationId: string;
  propertyId: string;
  roomId: string;
  stayId: string | null;
  taskType: HousekeepingTaskType;
  priority: HousekeepingPriority;
  status: HousekeepingTaskStatus;
  assignedTo: string | null;
  startedAt: string | null;
  completedAt: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  notes: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
};

// =================================================================== inspection checklists

export type InspectionChecklist = {
  id: string;
  organizationId: string;
  propertyId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
};

export type ChecklistCategory =
  | "BEDDING"
  | "BATHROOM"
  | "AMENITIES"
  | "ELECTRICAL"
  | "HVAC"
  | "CLEANLINESS"
  | "SAFETY"
  | "GENERAL";

export const CHECKLIST_CATEGORIES: readonly ChecklistCategory[] = [
  "BEDDING",
  "BATHROOM",
  "AMENITIES",
  "ELECTRICAL",
  "HVAC",
  "CLEANLINESS",
  "SAFETY",
  "GENERAL",
];

export type InspectionChecklistItem = {
  id: string;
  checklistId: string;
  question: string;
  category: ChecklistCategory;
  sortOrder: number;
  isRequired: boolean;
  createdAt: string;
};

// =================================================================== room inspections

export type InspectionStatus = "PENDING" | "PASSED" | "FAILED";

export const INSPECTION_STATUSES: readonly InspectionStatus[] = [
  "PENDING",
  "PASSED",
  "FAILED",
];

export type RoomInspection = {
  id: string;
  organizationId: string;
  propertyId: string;
  roomId: string;
  housekeepingTaskId: string | null;
  checklistId: string | null;
  inspectorId: string | null;
  status: InspectionStatus;
  inspectionDate: string;
  passedAt: string | null;
  failedAt: string | null;
  notes: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
};

export type InspectionResult = "PASS" | "FAIL" | "NOT_APPLICABLE";

export const INSPECTION_RESULTS: readonly InspectionResult[] = [
  "PASS",
  "FAIL",
  "NOT_APPLICABLE",
];

export type RoomInspectionResult = {
  id: string;
  inspectionId: string;
  checklistItemId: string;
  result: InspectionResult;
  note: string | null;
  createdAt: string;
};

// =================================================================== maintenance requests

export type MaintenanceCategory =
  | "ELECTRICAL"
  | "PLUMBING"
  | "HVAC"
  | "CARPENTRY"
  | "PAINTING"
  | "APPLIANCE"
  | "IT"
  | "CIVIL"
  | "FURNITURE"
  | "ROOM_AMENITY"
  | "KITCHEN_EQUIPMENT"
  | "OTHER";

export const MAINTENANCE_CATEGORIES: readonly MaintenanceCategory[] = [
  "ELECTRICAL",
  "PLUMBING",
  "HVAC",
  "CARPENTRY",
  "PAINTING",
  "APPLIANCE",
  "IT",
  "CIVIL",
  "FURNITURE",
  "ROOM_AMENITY",
  "KITCHEN_EQUIPMENT",
  "OTHER",
];

export type MaintenancePriority = "LOW" | "NORMAL" | "HIGH" | "URGENT" | "EMERGENCY";

export const MAINTENANCE_PRIORITIES: readonly MaintenancePriority[] = [
  "LOW",
  "NORMAL",
  "HIGH",
  "URGENT",
  "EMERGENCY",
];

export type MaintenanceStatus =
  | "OPEN"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "ON_HOLD"
  | "RESOLVED"
  | "VERIFIED"
  | "CLOSED"
  | "CANCELLED";

export const MAINTENANCE_STATUSES: readonly MaintenanceStatus[] = [
  "OPEN",
  "ASSIGNED",
  "IN_PROGRESS",
  "ON_HOLD",
  "RESOLVED",
  "VERIFIED",
  "CLOSED",
  "CANCELLED",
];

export type MaintenanceSource =
  | "HOUSEKEEPING"
  | "FRONT_DESK"
  | "MANAGER"
  | "INSPECTION"
  | "SYSTEM"
  | "EMPLOYEE"
  | "GUEST"
  | "OTHER";

export const MAINTENANCE_SOURCES: readonly MaintenanceSource[] = [
  "HOUSEKEEPING",
  "FRONT_DESK",
  "MANAGER",
  "INSPECTION",
  "SYSTEM",
  "EMPLOYEE",
  "GUEST",
  "OTHER",
];

export type MaintenanceRequest = {
  id: string;
  organizationId: string;
  propertyId: string;
  roomId: string | null;
  outletId: string | null;
  assetId: string | null;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  source: MaintenanceSource;
  title: string;
  description: string | null;
  reportedBy: string | null;
  assignedTo: string | null;
  assignedVendorId: string | null;
  estimatedCost: number | null;
  actualCost: number | null;
  reportedAt: string;
  assignedAt: string | null;
  startedAt: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  verificationNotes: string | null;
  closedAt: string | null;
  closedBy: string | null;
  resolution: string | null;
  notes: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
};

// =================================================================== lost & found

export type LostFoundCategory =
  | "ELECTRONICS"
  | "JEWELRY"
  | "CLOTHING"
  | "DOCUMENTS"
  | "KEYS"
  | "MEDICATION"
  | "OTHER";

export const LOST_FOUND_CATEGORIES: readonly LostFoundCategory[] = [
  "ELECTRONICS",
  "JEWELRY",
  "CLOTHING",
  "DOCUMENTS",
  "KEYS",
  "MEDICATION",
  "OTHER",
];

export type LostFoundStatus = "FOUND" | "STORED" | "CLAIMED" | "RETURNED" | "DISPOSED";

export const LOST_FOUND_STATUSES: readonly LostFoundStatus[] = [
  "FOUND",
  "STORED",
  "CLAIMED",
  "RETURNED",
  "DISPOSED",
];

export type LostFoundItem = {
  id: string;
  organizationId: string;
  propertyId: string;
  roomId: string | null;
  foundBy: string | null;
  foundAt: string;
  description: string;
  category: LostFoundCategory;
  status: LostFoundStatus;
  storageLocation: string | null;
  guestId: string | null;
  returnedAt: string | null;
  returnedTo: string | null;
  notes: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
};

// =================================================================== assets

export type AssetCategory =
  | "AC"
  | "TV"
  | "REFRIGERATOR"
  | "WASHING_MACHINE"
  | "ELEVATOR"
  | "BOILER"
  | "GENERATOR"
  | "KITCHEN_EQUIPMENT"
  | "FURNITURE"
  | "IT_EQUIPMENT"
  | "OTHER";

export const ASSET_CATEGORIES: readonly AssetCategory[] = [
  "AC",
  "TV",
  "REFRIGERATOR",
  "WASHING_MACHINE",
  "ELEVATOR",
  "BOILER",
  "GENERATOR",
  "KITCHEN_EQUIPMENT",
  "FURNITURE",
  "IT_EQUIPMENT",
  "OTHER",
];

export type AssetStatus = "ACTIVE" | "MAINTENANCE" | "RETIRED" | "SOLD";

export const ASSET_STATUSES: readonly AssetStatus[] = [
  "ACTIVE",
  "MAINTENANCE",
  "RETIRED",
  "SOLD",
];

export type Asset = {
  id: string;
  organizationId: string;
  propertyId: string;
  roomId: string | null;
  outletId: string | null;
  assetCode: string;
  name: string;
  category: AssetCategory;
  locationDescription: string | null;
  status: AssetStatus;
  serialNumber: string | null;
  manufacturer: string | null;
  modelNumber: string | null;
  purchaseDate: string | null;
  purchaseCost: number | null;
  warrantyEndDate: string | null;
  notes: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
};
