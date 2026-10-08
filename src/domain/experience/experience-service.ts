/**
 * Guest Experience service (Prompt #29).
 *
 * Intelligence layer on top of existing CRM feedback/complaint entities.
 * Stores experience records, service recovery actions, feedback forms,
 * review requests, and analytics data in memory.
 *
 * No DB migrations — this is an overlay that reads CRM context and
 * produces experience intelligence. All data is deterministic seed data.
 */

import type { EntityId } from "@/domain/identity/types";
import type {
  ExperienceRecord,
  ExperienceRecordStatus,
  ExperienceRecordType,
  ServiceRecoveryAction,
  FeedbackForm,
  FeedbackResponse,
  ReviewRequest,
  ReviewRequestStatus,
  ReviewResponse,
  ExperienceKPIs,
  ExperienceTrendPoint,
  CategoryBreakdown,
  DepartmentPerformance,
  ExperienceComplaintPriority,
  ExperienceFeedbackCategory,
  Sentiment,
  SLAConfig,
} from "./types";
import { DEFAULT_SLA_CONFIG } from "./types";

// =====================================================================
// IN-MEMORY STORES
// =====================================================================

const experienceRecords = new Map<EntityId, ExperienceRecord>();
const recoveryActions = new Map<EntityId, ServiceRecoveryAction>();
const feedbackForms = new Map<EntityId, FeedbackForm>();
const feedbackResponses = new Map<EntityId, FeedbackResponse>();
const reviewRequests = new Map<EntityId, ReviewRequest>();
const reviewResponses = new Map<EntityId, ReviewResponse>();

let idCounter = 1;
function generateId(prefix: string): EntityId {
  return `${prefix}_${Date.now()}_${idCounter++}`;
}

function now(): string {
  return new Date().toISOString();
}

function futureDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function pastDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function pastDateStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

// =====================================================================
// EXPERIENCE RECORDS
// =====================================================================

export function listExperienceRecords(
  organizationId: EntityId,
  filters?: {
    status?: ExperienceRecordStatus;
    type?: ExperienceRecordType;
    priority?: ExperienceComplaintPriority;
    category?: ExperienceFeedbackCategory;
    propertyId?: EntityId;
  }
): readonly ExperienceRecord[] {
  const all = Array.from(experienceRecords.values()).filter(
    (r) => r.organizationId === organizationId
  );
  if (!filters) return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return all
    .filter((r) => {
      if (filters.status && r.status !== filters.status) return false;
      if (filters.type && r.type !== filters.type) return false;
      if (filters.priority && r.priority !== filters.priority) return false;
      if (filters.category && r.category !== filters.category) return false;
      if (filters.propertyId && r.propertyId !== filters.propertyId) return false;
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getExperienceRecord(id: EntityId): ExperienceRecord | undefined {
  return experienceRecords.get(id);
}

export function createExperienceRecord(
  data: Omit<ExperienceRecord, "id" | "createdAt" | "updatedAt">
): ExperienceRecord {
  const record: ExperienceRecord = {
    ...data,
    id: generateId("exp"),
    createdAt: now(),
    updatedAt: now(),
  };
  experienceRecords.set(record.id, record);
  return record;
}

export function updateExperienceRecord(
  id: EntityId,
  updates: Partial<ExperienceRecord>
): ExperienceRecord | undefined {
  const existing = experienceRecords.get(id);
  if (!existing) return undefined;
  const updated = { ...existing, ...updates, updatedAt: now() };
  experienceRecords.set(id, updated);
  return updated;
}

export function resolveExperienceRecord(
  id: EntityId,
  resolution: string,
  rootCause?: string
): ExperienceRecord | undefined {
  return updateExperienceRecord(id, {
    status: "RESOLVED",
    resolution,
    rootCause,
    resolvedAt: now(),
  });
}

export function closeExperienceRecord(id: EntityId): ExperienceRecord | undefined {
  return updateExperienceRecord(id, {
    status: "CLOSED",
    closedAt: now(),
  });
}

// =====================================================================
// SERVICE RECOVERY ACTIONS
// =====================================================================

export function listRecoveryActions(
  organizationId: EntityId,
  experienceId?: EntityId
): readonly ServiceRecoveryAction[] {
  const all = Array.from(recoveryActions.values()).filter(
    (a) => a.organizationId === organizationId
  );
  if (experienceId) return all.filter((a) => a.experienceId === experienceId);
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createRecoveryAction(
  data: Omit<ServiceRecoveryAction, "id" | "createdAt" | "updatedAt">
): ServiceRecoveryAction {
  const action: ServiceRecoveryAction = {
    ...data,
    id: generateId("rec"),
    createdAt: now(),
    updatedAt: now(),
  };
  recoveryActions.set(action.id, action);
  return action;
}

export function approveRecoveryAction(
  id: EntityId,
  approvedBy: EntityId
): ServiceRecoveryAction | undefined {
  const existing = recoveryActions.get(id);
  if (!existing) return undefined;
  const updated: ServiceRecoveryAction = {
    ...existing,
    status: "APPROVED",
    approvedBy,
    approvedAt: now(),
    updatedAt: now(),
  };
  recoveryActions.set(id, updated);
  return updated;
}

export function executeRecoveryAction(
  id: EntityId,
  executedBy: EntityId,
  outcome: string
): ServiceRecoveryAction | undefined {
  const existing = recoveryActions.get(id);
  if (!existing) return undefined;
  const updated: ServiceRecoveryAction = {
    ...existing,
    status: "COMPLETED",
    executedBy,
    executedAt: now(),
    outcome,
    customerSatisfied: true,
    updatedAt: now(),
  };
  recoveryActions.set(id, updated);
  return updated;
}

// =====================================================================
// FEEDBACK FORMS
// =====================================================================

export function listFeedbackForms(organizationId: EntityId): readonly FeedbackForm[] {
  return Array.from(feedbackForms.values())
    .filter((f) => f.organizationId === organizationId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getFeedbackForm(id: EntityId): FeedbackForm | undefined {
  return feedbackForms.get(id);
}

export function getFeedbackFormByToken(token: string): FeedbackForm | undefined {
  return Array.from(feedbackForms.values()).find((f) => f.token === token);
}

export function createFeedbackForm(
  data: Omit<FeedbackForm, "id" | "token" | "createdAt" | "updatedAt">
): FeedbackForm {
  const form: FeedbackForm = {
    ...data,
    id: generateId("ff"),
    token: generateId("tok"),
    createdAt: now(),
    updatedAt: now(),
  };
  feedbackForms.set(form.id, form);
  return form;
}

// =====================================================================
// FEEDBACK RESPONSES
// =====================================================================

export function listFeedbackResponses(
  organizationId: EntityId,
  formId?: EntityId
): readonly FeedbackResponse[] {
  const all = Array.from(feedbackResponses.values()).filter(
    (r) => r.organizationId === organizationId
  );
  if (formId) return all.filter((r) => r.formId === formId);
  return all.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

export function submitFeedbackResponse(
  data: Omit<FeedbackResponse, "id" | "submittedAt">
): FeedbackResponse {
  const response: FeedbackResponse = {
    ...data,
    id: generateId("fr"),
    submittedAt: now(),
  };
  feedbackResponses.set(response.id, response);
  return response;
}

// =====================================================================
// REVIEW REQUESTS
// =====================================================================

export function listReviewRequests(
  organizationId: EntityId,
  status?: ReviewRequestStatus
): readonly ReviewRequest[] {
  const all = Array.from(reviewRequests.values()).filter(
    (r) => r.organizationId === organizationId
  );
  if (status) return all.filter((r) => r.status === status);
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createReviewRequest(
  data: Omit<ReviewRequest, "id" | "token" | "createdAt">
): ReviewRequest {
  const request: ReviewRequest = {
    ...data,
    id: generateId("rr"),
    token: generateId("rtok"),
    createdAt: now(),
  };
  reviewRequests.set(request.id, request);
  return request;
}

export function markReviewRequestSent(id: EntityId): ReviewRequest | undefined {
  const existing = reviewRequests.get(id);
  if (!existing) return undefined;
  const updated: ReviewRequest = {
    ...existing,
    status: "SENT",
    sentAt: now(),
  };
  reviewRequests.set(id, updated);
  return updated;
}

// =====================================================================
// REVIEW RESPONSES
// =====================================================================

export function listReviewResponses(
  organizationId: EntityId
): readonly ReviewResponse[] {
  return Array.from(reviewResponses.values())
    .filter((r) => r.organizationId === organizationId)
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

export function submitReviewResponse(
  data: Omit<ReviewResponse, "id" | "submittedAt">
): ReviewResponse {
  const response: ReviewResponse = {
    ...data,
    id: generateId("rv"),
    submittedAt: now(),
  };
  reviewResponses.set(response.id, response);
  return response;
}

// =====================================================================
// ANALYTICS
// =====================================================================

export function getExperienceKPIs(organizationId: EntityId): ExperienceKPIs {
  const records = Array.from(experienceRecords.values()).filter(
    (r) => r.organizationId === organizationId
  );
  const actions = Array.from(recoveryActions.values()).filter(
    (a) => a.organizationId === organizationId
  );

  const open = records.filter((r) => r.status === "OPEN" || r.status === "IN_REVIEW" || r.status === "ACTION_REQUIRED");
  const resolved = records.filter((r) => r.status === "RESOLVED" || r.status === "CLOSED");
  const withRating = records.filter((r) => r.categoryRatings.length > 0);
  const avgRating =
    withRating.length > 0
      ? withRating.reduce((sum, r) => {
          const ratings = r.categoryRatings.map((cr) => cr.rating);
          return sum + ratings.reduce((a, b) => a + b, 0) / ratings.length;
        }, 0) / withRating.length
      : 0;

  const responseTimes = records
    .filter((r) => r.resolvedAt)
    .map((r) => {
      const created = new Date(r.createdAt).getTime();
      const resolved = new Date(r.resolvedAt!).getTime();
      return (resolved - created) / (1000 * 60 * 60);
    });
  const avgResponseTime =
    responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

  const slaCompliant = records.filter((r) => {
    if (!r.dueAt) return true;
    if (r.status === "CLOSED" || r.status === "RESOLVED") return true;
    return new Date(r.dueAt) > new Date();
  });

  const sentimentCounts = records.reduce(
    (acc, r) => {
      if (!r.sentiment) return acc;
      if (r.sentiment.label === "POSITIVE") acc.positive++;
      else if (r.sentiment.label === "NEGATIVE") acc.negative++;
      else acc.neutral++;
      return acc;
    },
    { positive: 0, neutral: 0, negative: 0 }
  );

  const completedRecoveries = actions.filter((a) => a.status === "COMPLETED" && a.customerSatisfied);
  const recoveryRate =
    actions.length > 0 ? (completedRecoveries.length / actions.length) * 100 : 0;

  const followUpNeeded = records.filter((r) => r.followUpNeeded);
  const followUpCompleted = followUpNeeded.filter((r) => r.followUpCompleted);
  const followUpRate =
    followUpNeeded.length > 0
      ? (followUpCompleted.length / followUpNeeded.length) * 100
      : 0;

  return {
    totalRecords: records.length,
    openRecords: open.length,
    resolvedRecords: resolved.length,
    averageRating: Math.round(avgRating * 10) / 10,
    averageResponseTimeHours: Math.round(avgResponseTime * 10) / 10,
    averageResolutionTimeHours: Math.round(avgResponseTime * 10) / 10,
    slaCompliancePercent: Math.round(
      records.length > 0 ? (slaCompliant.length / records.length) * 100 : 100
    ),
    sentimentPositive: sentimentCounts.positive,
    sentimentNeutral: sentimentCounts.neutral,
    sentimentNegative: sentimentCounts.negative,
    recoverySuccessRate: Math.round(recoveryRate),
    followUpCompletionRate: Math.round(followUpRate),
  };
}

export function getExperienceTrends(
  organizationId: EntityId,
  days: number = 30
): readonly ExperienceTrendPoint[] {
  const records = Array.from(experienceRecords.values()).filter(
    (r) => r.organizationId === organizationId
  );
  const points: ExperienceTrendPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = pastDateStr(i);
    const dayRecords = records.filter((r) => r.createdAt.slice(0, 10) === date);
    const feedback = dayRecords.filter((r) => r.type === "FEEDBACK");
    const complaints = dayRecords.filter((r) => r.type === "COMPLAINT");
    const resolved = dayRecords.filter(
      (r) => r.status === "RESOLVED" || r.status === "CLOSED"
    );
    const ratings = dayRecords
      .filter((r) => r.categoryRatings.length > 0)
      .flatMap((r) => r.categoryRatings.map((cr) => cr.rating));
    const avgRating =
      ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
    const sentiments = dayRecords
      .filter((r) => r.sentiment)
      .map((r) => r.sentiment!.score);
    const avgSentiment =
      sentiments.length > 0
        ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length
        : 0;

    points.push({
      date,
      feedbackCount: feedback.length,
      complaintCount: complaints.length,
      averageRating: Math.round(avgRating * 10) / 10,
      sentimentScore: Math.round(avgSentiment * 100) / 100,
      resolvedCount: resolved.length,
    });
  }
  return points;
}

export function getCategoryBreakdown(
  organizationId: EntityId
): readonly CategoryBreakdown[] {
  const records = Array.from(experienceRecords.values()).filter(
    (r) => r.organizationId === organizationId
  );
  const byCategory = new Map<ExperienceFeedbackCategory, typeof records>();
  for (const r of records) {
    const existing = byCategory.get(r.category) ?? [];
    byCategory.set(r.category, [...existing, r]);
  }
  return Array.from(byCategory.entries()).map(([category, recs]) => {
    const ratings = recs.flatMap((r) => r.categoryRatings.map((cr) => cr.rating));
    const avgRating =
      ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
    const sentiments = recs
      .filter((r) => r.sentiment)
      .map((r) => r.sentiment!.score);
    const avgSentiment =
      sentiments.length > 0
        ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length
        : 0;
    return {
      category,
      count: recs.length,
      averageRating: Math.round(avgRating * 10) / 10,
      sentimentScore: Math.round(avgSentiment * 100) / 100,
    };
  });
}

export function getDepartmentPerformance(
  organizationId: EntityId
): readonly DepartmentPerformance[] {
  const records = Array.from(experienceRecords.values()).filter(
    (r) => r.organizationId === organizationId && r.departmentId
  );
  const byDept = new Map<EntityId, typeof records>();
  for (const r of records) {
    if (!r.departmentId) continue;
    const existing = byDept.get(r.departmentId) ?? [];
    byDept.set(r.departmentId, [...existing, r]);
  }
  return Array.from(byDept.entries()).map(([deptId, recs]) => {
    const open = recs.filter(
      (r) => r.status === "OPEN" || r.status === "IN_REVIEW" || r.status === "ACTION_REQUIRED"
    );
    const resolutionTimes = recs
      .filter((r) => r.resolvedAt)
      .map((r) => {
        const created = new Date(r.createdAt).getTime();
        const resolved = new Date(r.resolvedAt!).getTime();
        return (resolved - created) / (1000 * 60 * 60);
      });
    const avgResolution =
      resolutionTimes.length > 0
        ? resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length
        : 0;
    const slaCompliant = recs.filter((r) => {
      if (!r.dueAt) return true;
      if (r.status === "CLOSED" || r.status === "RESOLVED") return true;
      return new Date(r.dueAt) > new Date();
    });
    const ratings = recs.flatMap((r) => r.categoryRatings.map((cr) => cr.rating));
    const avgRating =
      ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

    return {
      departmentId: deptId,
      departmentName: deptId.replace("dept_", "").replace(/_/g, " "),
      totalRecords: recs.length,
      openRecords: open.length,
      averageResolutionTimeHours: Math.round(avgResolution * 10) / 10,
      slaCompliancePercent: Math.round(
        recs.length > 0 ? (slaCompliant.length / recs.length) * 100 : 100
      ),
      averageRating: Math.round(avgRating * 10) / 10,
    };
  });
}

export function getOverdueRecords(organizationId: EntityId): readonly ExperienceRecord[] {
  return Array.from(experienceRecords.values())
    .filter((r) => {
      if (r.organizationId !== organizationId) return false;
      if (r.status === "CLOSED" || r.status === "RESOLVED") return false;
      if (!r.dueAt) return false;
      return new Date(r.dueAt) < new Date();
    })
    .sort((a, b) => (a.dueAt! < b.dueAt! ? -1 : 1));
}

// =====================================================================
// SLA HELPERS
// =====================================================================

export function getSLAForPriority(priority: ExperienceComplaintPriority): SLAConfig {
  return DEFAULT_SLA_CONFIG.find((s) => s.priority === priority) ?? DEFAULT_SLA_CONFIG[DEFAULT_SLA_CONFIG.length - 1];
}

export function computeDueAt(
  createdAt: string,
  priority: ExperienceComplaintPriority
): string {
  const sla = getSLAForPriority(priority);
  const d = new Date(createdAt);
  d.setHours(d.getHours() + sla.resolutionTimeHours);
  return d.toISOString();
}

// =====================================================================
// SENTIMENT ANALYSIS (deterministic mock)
// =====================================================================

export function analyzeSentiment(text: string, rating?: number): Sentiment {
  const lower = text.toLowerCase();
  const positiveWords = [
    "great", "excellent", "amazing", "wonderful", "fantastic", "love",
    "perfect", "best", "happy", "pleased", "good", "nice", "friendly",
    "clean", "comfortable", "helpful", "professional", "outstanding",
  ];
  const negativeWords = [
    "bad", "terrible", "awful", "horrible", "worst", "hate", "dirty",
    "rude", "slow", "cold", "noisy", "uncomfortable", "disappointed",
    "unacceptable", "poor", "broken", "smelly", "overpriced",
  ];

  let posCount = 0;
  let negCount = 0;
  for (const word of positiveWords) {
    if (lower.includes(word)) posCount++;
  }
  for (const word of negativeWords) {
    if (lower.includes(word)) negCount++;
  }

  let score: number;
  if (rating !== undefined) {
    score = (rating - 3) / 2;
  } else {
    const total = posCount + negCount;
    score = total > 0 ? (posCount - negCount) / total : 0;
  }

  score = Math.max(-1, Math.min(1, score));
  const label: Sentiment["label"] =
    score > 0.2 ? "POSITIVE" : score < -0.2 ? "NEGATIVE" : "NEUTRAL";
  const confidence = Math.min(1, Math.abs(score) + 0.3);

  return { label, score: Math.round(score * 100) / 100, confidence: Math.round(confidence * 100) / 100 };
}

// =====================================================================
// SEED DATA
// =====================================================================

let seeded = false;

export function ensureExperienceDemoSeeded(orgId: EntityId, propId: EntityId): void {
  if (seeded) return;
  seeded = true;
  seedExperienceDemoData(orgId, propId);
}

function seedExperienceDemoData(orgId: EntityId, propId: EntityId): void {
  // 5 experience records with required variety
  const exp1: ExperienceRecord = {
    id: "exp_demo_1",
    organizationId: orgId,
    propertyId: propId,
    outletId: undefined,
    customerId: "cust_demo_1",
    guestName: "Rajesh Kumar",
    guestEmail: "rajesh@example.com",
    guestPhone: "+91-9876543210",
    roomNumber: "201",
    type: "FEEDBACK",
    status: "OPEN",
    priority: "NORMAL",
    category: "SERVICE",
    departmentId: "dept_front_office",
    assignedTo: undefined,
    assignedTeam: "Front Office",
    title: "Check-in was slower than expected",
    description: "Had to wait 25 minutes for check-in despite having a reservation. The staff was friendly but the process was slow.",
    sentiment: { label: "NEUTRAL", score: -0.1, confidence: 0.6 },
    categoryRatings: [
      { category: "CHECK_IN", rating: 3 },
      { category: "SERVICE", rating: 3 },
    ],
    source: "FRONT_DESK",
    dueAt: futureDate(2),
    followUpNeeded: true,
    followUpCompleted: false,
    createdBy: "user_demo_mgr",
    createdAt: pastDate(1),
    updatedAt: pastDate(1),
  };
  experienceRecords.set(exp1.id, exp1);

  const exp2: ExperienceRecord = {
    id: "exp_demo_2",
    organizationId: orgId,
    propertyId: propId,
    customerId: "cust_demo_2",
    guestName: "Priya Sharma",
    guestEmail: "priya@example.com",
    roomNumber: "305",
    type: "COMPLAINT",
    status: "IN_REVIEW",
    priority: "HIGH",
    category: "ROOM",
    departmentId: "dept_housekeeping",
    assignedTo: "user_demo_hk",
    assignedTeam: "Housekeeping",
    title: "Room not cleaned properly",
    description: "Found hair in the bathroom and the bed sheets had stains. Very disappointed with the cleanliness standards.",
    sentiment: { label: "NEGATIVE", score: -0.7, confidence: 0.85 },
    categoryRatings: [
      { category: "ROOM", rating: 1 },
      { category: "CLEANLINESS", rating: 1 },
    ],
    source: "IN_APP",
    dueAt: pastDate(1),
    followUpNeeded: true,
    followUpCompleted: false,
    createdBy: "user_demo_mgr",
    createdAt: pastDate(3),
    updatedAt: pastDate(2),
  };
  experienceRecords.set(exp2.id, exp2);

  const exp3: ExperienceRecord = {
    id: "exp_demo_3",
    organizationId: orgId,
    propertyId: propId,
    customerId: "cust_demo_3",
    guestName: "Amit Patel",
    guestEmail: "amit@example.com",
    roomNumber: "102",
    type: "COMPLAINT",
    status: "ACTION_REQUIRED",
    priority: "CRITICAL",
    category: "MAINTENANCE",
    departmentId: "dept_maintenance",
    assignedTo: "user_demo_maint",
    assignedTeam: "Maintenance",
    title: "AC not working in room",
    description: "The air conditioner in room 102 has stopped working completely. Room is unbearable in this heat. Need immediate resolution.",
    sentiment: { label: "NEGATIVE", score: -0.9, confidence: 0.95 },
    categoryRatings: [
      { category: "ROOM", rating: 1 },
      { category: "MAINTENANCE", rating: 1 },
    ],
    source: "PHONE",
    dueAt: pastDate(0),
    followUpNeeded: true,
    followUpCompleted: false,
    createdBy: "user_demo_mgr",
    createdAt: pastDate(2),
    updatedAt: pastDate(1),
  };
  experienceRecords.set(exp3.id, exp3);

  const exp4: ExperienceRecord = {
    id: "exp_demo_4",
    organizationId: orgId,
    propertyId: propId,
    customerId: "cust_demo_4",
    guestName: "Sneha Reddy",
    guestEmail: "sneha@example.com",
    roomNumber: "408",
    type: "FEEDBACK",
    status: "RESOLVED",
    priority: "LOW",
    category: "FOOD",
    departmentId: "dept_food_beverage",
    assignedTo: "user_demo_fb",
    assignedTeam: "Food & Beverage",
    title: "Excellent breakfast spread",
    description: "The breakfast buffet had a wonderful variety. Loved the South Indian corner and the fresh juices. Staff were very attentive.",
    sentiment: { label: "POSITIVE", score: 0.85, confidence: 0.9 },
    categoryRatings: [
      { category: "FOOD", rating: 5 },
      { category: "SERVICE", rating: 5 },
    ],
    source: "QR",
    resolvedAt: pastDate(1),
    followUpNeeded: false,
    followUpCompleted: false,
    createdBy: "user_demo_mgr",
    createdAt: pastDate(5),
    updatedAt: pastDate(1),
  };
  experienceRecords.set(exp4.id, exp4);

  const exp5: ExperienceRecord = {
    id: "exp_demo_5",
    organizationId: orgId,
    propertyId: propId,
    customerId: "cust_demo_5",
    guestName: "Vikram Singh",
    guestEmail: "vikram@example.com",
    roomNumber: "210",
    type: "SUGGESTION",
    status: "IN_REVIEW",
    priority: "LOW",
    category: "AMBIENCE",
    departmentId: "dept_management",
    title: "Lobby music could be better",
    description: "The lobby music is nice but could have more variety. Perhaps some instrumental or jazz in the evenings would add to the ambience.",
    sentiment: { label: "NEUTRAL", score: 0.1, confidence: 0.5 },
    categoryRatings: [{ category: "AMBIENCE", rating: 3 }],
    source: "EMAIL",
    followUpNeeded: false,
    followUpCompleted: false,
    createdBy: "user_demo_mgr",
    createdAt: pastDate(7),
    updatedAt: pastDate(5),
  };
  experienceRecords.set(exp5.id, exp5);

  // Service recovery action for the critical complaint (exp3)
  const rec1: ServiceRecoveryAction = {
    id: "rec_demo_1",
    organizationId: orgId,
    experienceId: "exp_demo_3",
    type: "UPGRADE",
    status: "APPROVED",
    description: "Complimentary room upgrade to Deluxe Suite with working AC. Dinner voucher for ₹2000 included.",
    estimatedValue: 5000,
    currency: "INR",
    approvedBy: "user_demo_gm",
    approvedAt: pastDate(1),
    customerSatisfied: false,
    createdBy: "user_demo_mgr",
    createdAt: pastDate(2),
    updatedAt: pastDate(1),
  };
  recoveryActions.set(rec1.id, rec1);

  // Service recovery action for the cleanliness complaint (exp2)
  const rec2: ServiceRecoveryAction = {
    id: "rec_demo_2",
    organizationId: orgId,
    experienceId: "exp_demo_2",
    type: "DISCOUNT",
    status: "PROPOSED",
    description: "20% discount on current stay for the inconvenience caused.",
    estimatedValue: 3000,
    currency: "INR",
    customerSatisfied: false,
    createdBy: "user_demo_hk",
    createdAt: pastDate(2),
    updatedAt: pastDate(2),
  };
  recoveryActions.set(rec2.id, rec2);

  // Feedback form
  const form1: FeedbackForm = {
    id: "ff_demo_1",
    organizationId: orgId,
    propertyId: propId,
    name: "Post-Stay Feedback",
    description: "Standard feedback form sent after checkout",
    isActive: true,
    token: "feedback_token_demo_1",
    questions: [
      { id: "q1", text: "How would you rate your overall stay?", type: "RATING", required: true, category: "OVERALL" },
      { id: "q2", text: "How was the room cleanliness?", type: "RATING", required: true, category: "CLEANLINESS" },
      { id: "q3", text: "How was the food quality?", type: "RATING", required: false, category: "FOOD" },
      { id: "q4", text: "How was the staff service?", type: "RATING", required: true, category: "STAFF" },
      { id: "q5", text: "Any comments or suggestions?", type: "TEXT", required: false },
      { id: "q6", text: "Would you recommend us to others?", type: "YES_NO", required: true },
    ],
    createdAt: pastDate(30),
    updatedAt: pastDate(30),
  };
  feedbackForms.set(form1.id, form1);

  // Review request
  const rr1: ReviewRequest = {
    id: "rr_demo_1",
    organizationId: orgId,
    propertyId: propId,
    customerId: "cust_demo_4",
    guestName: "Sneha Reddy",
    guestEmail: "sneha@example.com",
    status: "SENT",
    channel: "EMAIL",
    token: "review_token_demo_1",
    experienceId: "exp_demo_4",
    referenceType: "reservation",
    referenceId: "res_demo_4",
    sentAt: pastDate(1),
    expiresAt: futureDate(6),
    createdBy: "user_demo_mgr",
    createdAt: pastDate(2),
  };
  reviewRequests.set(rr1.id, rr1);

  // Review response
  const rv1: ReviewResponse = {
    id: "rv_demo_1",
    requestId: "rr_demo_1",
    organizationId: orgId,
    propertyId: propId,
    customerId: "cust_demo_4",
    guestName: "Sneha Reddy",
    overallRating: 5,
    categoryRatings: [
      { category: "FOOD", rating: 5 },
      { category: "SERVICE", rating: 5 },
      { category: "ROOM", rating: 4 },
      { category: "CLEANLINESS", rating: 5 },
    ],
    comment: "Had a wonderful stay! The breakfast was exceptional and the staff went above and beyond.",
    sentiment: { label: "POSITIVE", score: 0.9, confidence: 0.95 },
    wouldRecommend: true,
    wouldReturn: true,
    submittedAt: pastDate(0),
  };
  reviewResponses.set(rv1.id, rv1);
}
