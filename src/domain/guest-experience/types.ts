/**
 * Guest Experience domain types (Prompt #31).
 *
 * Customer-facing experience layer on top of existing AMRUT NIVAAS operations.
 * The guest sees: My Trip, My Stay, My Orders, My Events, My Requests,
 * My Bills, My Rewards, My Feedback, My Offers — not internal modules.
 *
 * Key concepts:
 *   - GuestJourney: derived lifecycle stages from actual reservation/stay/order records
 *   - GuestServiceRequest: customer-initiated request that flows into Task/Workflow
 *   - PreCheckIn: digital check-in foundation linked to Reservation
 *   - GuestDocument: ID document linked to existing Document infrastructure
 *   - GuestConversation/GuestMessage: lightweight AI concierge chat
 *   - SecureGuestToken: unpredictable, scoped, expiring access token
 */

import type { EntityId } from "@/domain/identity/types";

// ================================================================ journey types

export type GuestJourneyStage =
  | "DISCOVERY"
  | "BOOKING"
  | "PRE_ARRIVAL"
  | "ARRIVAL"
  | "IN_STAY"
  | "CHECKOUT"
  | "POST_STAY"
  | "RE_ENGAGEMENT";

export const GUEST_JOURNEY_STAGES: readonly GuestJourneyStage[] = [
  "DISCOVERY",
  "BOOKING",
  "PRE_ARRIVAL",
  "ARRIVAL",
  "IN_STAY",
  "CHECKOUT",
  "POST_STAY",
  "RE_ENGAGEMENT",
];

export type GuestJourneyEvent = {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly propertyId: EntityId;
  readonly customerId: EntityId;
  readonly stage: GuestJourneyStage;
  readonly title: string;
  readonly description: string;
  readonly occurredAt: string;
  readonly sourceType: "reservation" | "stay" | "order" | "event" | "request" | "payment" | "feedback" | "loyalty";
  readonly sourceId: EntityId;
  readonly icon: string;
};

export type GuestJourney = {
  readonly customerId: EntityId;
  readonly organizationId: EntityId;
  readonly currentStage: GuestJourneyStage;
  readonly events: readonly GuestJourneyEvent[];
  readonly activeReservationId: EntityId | null;
  readonly activeStayId: EntityId | null;
};

// ======================================================== service request types

export type ServiceRequestCategory =
  | "EXTRA_TOWELS"
  | "EXTRA_PILLOW"
  | "WATER"
  | "HOUSEKEEPING"
  | "ROOM_CLEANING"
  | "LAUNDRY"
  | "MAINTENANCE"
  | "ROOM_SERVICE"
  | "AC"
  | "TV"
  | "PLUMBING"
  | "WIFI"
  | "FURNITURE"
  | "LIGHTING"
  | "OTHER";

export const SERVICE_REQUEST_CATEGORIES: readonly ServiceRequestCategory[] = [
  "EXTRA_TOWELS",
  "EXTRA_PILLOW",
  "WATER",
  "HOUSEKEEPING",
  "ROOM_CLEANING",
  "LAUNDRY",
  "MAINTENANCE",
  "ROOM_SERVICE",
  "AC",
  "TV",
  "PLUMBING",
  "WIFI",
  "FURNITURE",
  "LIGHTING",
  "OTHER",
];

export type ServiceRequestStatus =
  | "SUBMITTED"
  | "ACKNOWLEDGED"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export const SERVICE_REQUEST_STATUSES: readonly ServiceRequestStatus[] = [
  "SUBMITTED",
  "ACKNOWLEDGED",
  "ASSIGNED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
];

export type ServiceRequestPriority = "NORMAL" | "ELEVATED" | "URGENT";

export type GuestServiceRequest = {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly propertyId: EntityId;
  readonly customerId: EntityId;
  readonly reservationId: EntityId | null;
  readonly stayId: EntityId | null;
  readonly roomId: EntityId | null;
  readonly category: ServiceRequestCategory;
  readonly title: string;
  readonly description: string;
  readonly priority: ServiceRequestPriority;
  readonly status: ServiceRequestStatus;
  readonly taskId: EntityId | null;
  readonly assignedTo: EntityId | null;
  readonly createdAt: string;
  readonly acknowledgedAt: string | null;
  readonly completedAt: string | null;
  readonly cancelledAt: string | null;
  readonly customerVisibleStatus: "Received" | "Being handled" | "Completed";
};

// =========================================================== pre check-in types

export type PreCheckInStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "REVIEW_REQUIRED"
  | "COMPLETED"
  | "CANCELLED";

export const PRE_CHECKIN_STATUSES: readonly PreCheckInStatus[] = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "SUBMITTED",
  "REVIEW_REQUIRED",
  "COMPLETED",
  "CANCELLED",
];

export type PreCheckIn = {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly propertyId: EntityId;
  readonly reservationId: EntityId;
  readonly customerId: EntityId;
  readonly guestName: string;
  readonly guestPhone: string;
  readonly guestEmail: string;
  readonly guestAddress: string;
  readonly adults: number;
  readonly children: number;
  readonly estimatedArrival: string | null;
  readonly specialRequests: string;
  readonly preferences: string;
  readonly documentStatus: "NOT_UPLOADED" | "UPLOADED" | "VERIFIED" | "REJECTED";
  readonly consentGiven: boolean;
  readonly status: PreCheckInStatus;
  readonly submittedAt: string | null;
  readonly completedAt: string | null;
  readonly createdAt: string;
};

// ========================================================= guest document types

export type GuestDocumentType =
  | "AADHAAR"
  | "PAN_CARD"
  | "PASSPORT"
  | "DRIVING_LICENSE"
  | "VOTER_ID"
  | "OTHER_GOVT_ID";

export const GUEST_DOCUMENT_TYPES: readonly GuestDocumentType[] = [
  "AADHAAR",
  "PAN_CARD",
  "PASSPORT",
  "DRIVING_LICENSE",
  "VOTER_ID",
  "OTHER_GOVT_ID",
];

export type GuestDocumentStatus = "UPLOADED" | "VERIFIED" | "REJECTED" | "EXPIRED";

export type GuestDocument = {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly propertyId: EntityId;
  readonly customerId: EntityId;
  readonly reservationId: EntityId | null;
  readonly documentType: GuestDocumentType;
  readonly documentNumber: string;
  readonly documentName: string;
  readonly status: GuestDocumentStatus;
  readonly documentId: EntityId | null;
  readonly uploadedAt: string;
  readonly verifiedAt: string | null;
  readonly verifiedBy: EntityId | null;
  readonly rejectionReason: string | null;
};

// ==================================================== guest conversation types

export type ConversationType =
  | "GENERAL"
  | "RESERVATION"
  | "STAY"
  | "DINING"
  | "EVENT"
  | "SERVICE_REQUEST"
  | "BILLING"
  | "OTHER";

export const CONVERSATION_TYPES: readonly ConversationType[] = [
  "GENERAL",
  "RESERVATION",
  "STAY",
  "DINING",
  "EVENT",
  "SERVICE_REQUEST",
  "BILLING",
  "OTHER",
];

export type GuestConversation = {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly propertyId: EntityId;
  readonly customerId: EntityId;
  readonly type: ConversationType;
  readonly subject: string;
  readonly status: "OPEN" | "CLOSED" | "HANDOFF";
  readonly handoffDepartment: string | null;
  readonly createdAt: string;
  readonly lastMessageAt: string;
  readonly messages: readonly GuestMessage[];
};

export type MessageSender = "GUEST" | "AI" | "HUMAN";

export type GuestMessage = {
  readonly id: EntityId;
  readonly conversationId: EntityId;
  readonly sender: MessageSender;
  readonly senderId: EntityId | null;
  readonly content: string;
  readonly suggestedAction: GuestSuggestedAction | null;
  readonly createdAt: string;
};

export type GuestSuggestedAction = {
  readonly label: string;
  readonly actionType: "service_request" | "view_booking" | "view_bill" | "contact_property" | "feedback";
  readonly payload: Record<string, string>;
};

// ======================================================== secure guest token types

export type SecureGuestTokenType = "RESERVATION" | "STAY" | "ORDER" | "EVENT";

export type SecureGuestToken = {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly propertyId: EntityId;
  readonly customerId: EntityId;
  readonly tokenType: SecureGuestTokenType;
  readonly sourceId: EntityId;
  readonly token: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
  readonly createdAt: string;
};

// ==================================================== guest notification types

export type GuestNotificationCategory =
  | "BOOKINGS"
  | "STAY"
  | "DINING"
  | "REQUESTS"
  | "EVENTS"
  | "PAYMENTS"
  | "REWARDS"
  | "OFFERS";

export type GuestNotification = {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly propertyId: EntityId;
  readonly customerId: EntityId;
  readonly category: GuestNotificationCategory;
  readonly title: string;
  readonly message: string;
  readonly actionLabel: string | null;
  readonly actionUrl: string | null;
  readonly referenceType: string | null;
  readonly referenceId: EntityId | null;
  readonly read: boolean;
  readonly createdAt: string;
};

// ============================================== guest experience analytics types

export type GuestExperienceKPIs = {
  readonly portalUsers: number;
  readonly digitalCheckIns: number;
  readonly digitalRequests: number;
  readonly requestCompletionRate: number;
  readonly roomServiceOrders: number;
  readonly guestPayments: number;
  readonly guestFeedbackCount: number;
  readonly digitalEngagementRate: number;
  readonly digitalCheckInRate: number;
  readonly qrOrderRate: number;
  readonly portalUsageRate: number;
  readonly digitalRequestRate: number;
};

export type GuestExperienceTimelinePoint = {
  readonly date: string;
  readonly portalVisits: number;
  readonly serviceRequests: number;
  readonly digitalCheckIns: number;
  readonly roomServiceOrders: number;
};
