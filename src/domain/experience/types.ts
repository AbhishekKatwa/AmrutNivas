/**
 * Guest Experience domain types (Prompt #29).
 *
 * Extends the existing CRM feedback/complaint entities with an operational
 * overlay: experience records, service recovery actions, feedback forms,
 * review requests, sentiment analysis, SLA tracking, and category ratings.
 *
 * No DB migrations — this is an in-memory intelligence layer on top of
 * the CRM entities that already persist through Supabase.
 */

import type { EntityId } from "@/domain/identity/types";

// ─── Feedback extensions ─────────────────────────────────────────────────────

export const EXPERIENCE_FEEDBACK_CATEGORIES = [
  "FOOD",
  "SERVICE",
  "ROOM",
  "CLEANLINESS",
  "STAFF",
  "VALUE",
  "AMBIENCE",
  "HOUSEKEEPING",
  "SPEED",
  "CHECK_IN",
  "CHECK_OUT",
  "EVENT",
  "VENUE",
  "MAINTENANCE",
  "OVERALL",
  "OTHER",
] as const;

export type ExperienceFeedbackCategory = (typeof EXPERIENCE_FEEDBACK_CATEGORIES)[number];

export const EXPERIENCE_FEEDBACK_STATUSES = [
  "OPEN",
  "IN_REVIEW",
  "ACTION_REQUIRED",
  "RESOLVED",
  "CLOSED",
] as const;

export type ExperienceFeedbackStatus = (typeof EXPERIENCE_FEEDBACK_STATUSES)[number];

export const EXPERIENCE_FEEDBACK_SOURCES = [
  "IN_APP",
  "QR",
  "PUBLIC_LINK",
  "FRONT_DESK",
  "POS",
  "STAFF_ENTERED",
  "PHONE",
  "EMAIL",
  "WHATSAPP",
  "IMPORT",
  "OTHER",
] as const;

export type ExperienceFeedbackSource = (typeof EXPERIENCE_FEEDBACK_SOURCES)[number];

// ─── Complaint extensions ────────────────────────────────────────────────────

export const EXPERIENCE_COMPLAINT_PRIORITIES = [
  "LOW",
  "NORMAL",
  "HIGH",
  "URGENT",
  "CRITICAL",
] as const;

export type ExperienceComplaintPriority = (typeof EXPERIENCE_COMPLAINT_PRIORITIES)[number];

export const EXPERIENCE_COMPLAINT_STATUSES = [
  "OPEN",
  "ACKNOWLEDGED",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING_CUSTOMER",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "CANCELLED",
] as const;

export type ExperienceComplaintStatus = (typeof EXPERIENCE_COMPLAINT_STATUSES)[number];

// ─── Sentiment ───────────────────────────────────────────────────────────────

export const SENTIMENT_LABELS = ["POSITIVE", "NEUTRAL", "NEGATIVE"] as const;
export type SentimentLabel = (typeof SENTIMENT_LABELS)[number];

export interface Sentiment {
  readonly label: SentimentLabel;
  readonly score: number; // -1.0 to 1.0
  readonly confidence: number; // 0.0 to 1.0
}

// ─── Category rating ─────────────────────────────────────────────────────────

export interface CategoryRating {
  readonly category: ExperienceFeedbackCategory;
  readonly rating: number; // 1-5
  readonly comment?: string;
}

// ─── Experience record ───────────────────────────────────────────────────────

export const EXPERIENCE_RECORD_STATUSES = [
  "OPEN",
  "IN_REVIEW",
  "ACTION_REQUIRED",
  "RESOLVED",
  "CLOSED",
] as const;

export type ExperienceRecordStatus = (typeof EXPERIENCE_RECORD_STATUSES)[number];

export const EXPERIENCE_RECORD_TYPES = [
  "FEEDBACK",
  "COMPLAINT",
  "COMPLIMENT",
  "SUGGESTION",
  "INCIDENT",
  "SERVICE_RECOVERY",
] as const;

export type ExperienceRecordType = (typeof EXPERIENCE_RECORD_TYPES)[number];

export interface ExperienceRecord {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly propertyId: EntityId;
  readonly outletId?: EntityId;
  readonly customerId?: EntityId;
  readonly guestName: string;
  readonly guestEmail?: string;
  readonly guestPhone?: string;
  readonly roomNumber?: string;
  readonly type: ExperienceRecordType;
  readonly status: ExperienceRecordStatus;
  readonly priority: ExperienceComplaintPriority;
  readonly category: ExperienceFeedbackCategory;
  readonly departmentId?: EntityId;
  readonly assignedTo?: EntityId;
  readonly assignedTeam?: string;
  readonly title: string;
  readonly description: string;
  readonly sentiment?: Sentiment;
  readonly categoryRatings: readonly CategoryRating[];
  readonly source: ExperienceFeedbackSource;
  readonly referenceType?: string;
  readonly referenceId?: EntityId;
  readonly dueAt?: string;
  readonly resolvedAt?: string;
  readonly closedAt?: string;
  readonly rootCause?: string;
  readonly resolution?: string;
  readonly followUpNeeded: boolean;
  readonly followUpCompleted: boolean;
  readonly recoveryActionId?: EntityId;
  readonly feedbackId?: EntityId;
  readonly complaintId?: EntityId;
  readonly createdBy: EntityId;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ─── Service recovery action ─────────────────────────────────────────────────

export const RECOVERY_ACTION_STATUSES = [
  "PROPOSED",
  "APPROVED",
  "IN_PROGRESS",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
] as const;

export type RecoveryActionStatus = (typeof RECOVERY_ACTION_STATUSES)[number];

export const RECOVERY_ACTION_TYPES = [
  "DISCOUNT",
  "UPGRADE",
  "COMPLIMENTARY_ITEM",
  "REFUND",
  "APOLOGY",
  "FOLLOW_UP_CALL",
  "GIFT_VOUCHER",
  "LOYALTY_POINTS",
  "OTHER",
] as const;

export type RecoveryActionType = (typeof RECOVERY_ACTION_TYPES)[number];

export interface ServiceRecoveryAction {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly experienceId: EntityId;
  readonly type: RecoveryActionType;
  readonly status: RecoveryActionStatus;
  readonly description: string;
  readonly estimatedValue?: number;
  readonly currency: string;
  readonly approvedBy?: EntityId;
  readonly approvedAt?: string;
  readonly executedBy?: EntityId;
  readonly executedAt?: string;
  readonly outcome?: string;
  readonly customerSatisfied: boolean;
  readonly createdBy: EntityId;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ─── Feedback form ───────────────────────────────────────────────────────────

export interface FeedbackQuestion {
  readonly id: string;
  readonly text: string;
  readonly type: "RATING" | "TEXT" | "MULTI_CHOICE" | "YES_NO";
  readonly required: boolean;
  readonly options?: readonly string[];
  readonly category?: ExperienceFeedbackCategory;
}

export interface FeedbackForm {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly propertyId?: EntityId;
  readonly name: string;
  readonly description: string;
  readonly questions: readonly FeedbackQuestion[];
  readonly isActive: boolean;
  readonly token: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ─── Feedback response ───────────────────────────────────────────────────────

export interface FeedbackAnswer {
  readonly questionId: string;
  readonly value: string | number | string[];
  readonly category?: ExperienceFeedbackCategory;
}

export interface FeedbackResponse {
  readonly id: EntityId;
  readonly formId: EntityId;
  readonly organizationId: EntityId;
  readonly propertyId?: EntityId;
  readonly customerId?: EntityId;
  readonly guestName?: string;
  readonly guestEmail?: string;
  readonly answers: readonly FeedbackAnswer[];
  readonly overallRating?: number;
  readonly sentiment?: Sentiment;
  readonly source: ExperienceFeedbackSource;
  readonly referenceType?: string;
  readonly referenceId?: EntityId;
  readonly submittedAt: string;
}

// ─── Review request ──────────────────────────────────────────────────────────

export const REVIEW_REQUEST_STATUSES = [
  "PENDING",
  "SENT",
  "VIEWED",
  "COMPLETED",
  "EXPIRED",
  "CANCELLED",
] as const;

export type ReviewRequestStatus = (typeof REVIEW_REQUEST_STATUSES)[number];

export interface ReviewRequest {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly propertyId: EntityId;
  readonly customerId?: EntityId;
  readonly guestName: string;
  readonly guestEmail?: string;
  readonly guestPhone?: string;
  readonly status: ReviewRequestStatus;
  readonly channel: "EMAIL" | "SMS" | "WHATSAPP" | "IN_APP";
  readonly token: string;
  readonly experienceId?: EntityId;
  readonly referenceType?: string;
  readonly referenceId?: EntityId;
  readonly sentAt?: string;
  readonly viewedAt?: string;
  readonly completedAt?: string;
  readonly expiresAt: string;
  readonly createdBy: EntityId;
  readonly createdAt: string;
}

// ─── Review response ─────────────────────────────────────────────────────────

export interface ReviewResponse {
  readonly id: EntityId;
  readonly requestId: EntityId;
  readonly organizationId: EntityId;
  readonly propertyId: EntityId;
  readonly customerId?: EntityId;
  readonly guestName: string;
  readonly overallRating: number;
  readonly categoryRatings: readonly CategoryRating[];
  readonly comment?: string;
  readonly sentiment?: Sentiment;
  readonly wouldRecommend: boolean;
  readonly wouldReturn: boolean;
  readonly submittedAt: string;
}

// ─── SLA configuration ───────────────────────────────────────────────────────

export interface SLAConfig {
  readonly priority: ExperienceComplaintPriority;
  readonly responseTimeHours: number;
  readonly resolutionTimeHours: number;
}

export const DEFAULT_SLA_CONFIG: readonly SLAConfig[] = [
  { priority: "CRITICAL", responseTimeHours: 1, resolutionTimeHours: 4 },
  { priority: "URGENT", responseTimeHours: 2, resolutionTimeHours: 8 },
  { priority: "HIGH", responseTimeHours: 4, resolutionTimeHours: 24 },
  { priority: "NORMAL", responseTimeHours: 8, resolutionTimeHours: 48 },
  { priority: "LOW", responseTimeHours: 24, resolutionTimeHours: 72 },
];

// ─── Analytics types ─────────────────────────────────────────────────────────

export interface ExperienceKPIs {
  readonly totalRecords: number;
  readonly openRecords: number;
  readonly resolvedRecords: number;
  readonly averageRating: number;
  readonly averageResponseTimeHours: number;
  readonly averageResolutionTimeHours: number;
  readonly slaCompliancePercent: number;
  readonly sentimentPositive: number;
  readonly sentimentNeutral: number;
  readonly sentimentNegative: number;
  readonly recoverySuccessRate: number;
  readonly followUpCompletionRate: number;
}

export interface ExperienceTrendPoint {
  readonly date: string;
  readonly feedbackCount: number;
  readonly complaintCount: number;
  readonly averageRating: number;
  readonly sentimentScore: number;
  readonly resolvedCount: number;
}

export interface CategoryBreakdown {
  readonly category: ExperienceFeedbackCategory;
  readonly count: number;
  readonly averageRating: number;
  readonly sentimentScore: number;
}

export interface DepartmentPerformance {
  readonly departmentId: EntityId;
  readonly departmentName: string;
  readonly totalRecords: number;
  readonly openRecords: number;
  readonly averageResolutionTimeHours: number;
  readonly slaCompliancePercent: number;
  readonly averageRating: number;
}
