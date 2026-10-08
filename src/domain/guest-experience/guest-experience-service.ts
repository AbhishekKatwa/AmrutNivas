/**
 * Guest Experience service layer (Prompt #31).
 *
 * In-memory service for service requests, pre-check-in, guest documents,
 * conversations, secure tokens, notifications, and journey derivation.
 * Reuses existing CRM, Reservation, Stay, Order, Event, Loyalty, Task,
 * Notification, and Document infrastructure — never duplicates them.
 */

import type { EntityId } from "@/domain/identity/types";
import type {
  GuestJourney,
  GuestJourneyStage,
  GuestJourneyEvent,
  GuestServiceRequest,
  ServiceRequestStatus,
  ServiceRequestCategory,
  PreCheckIn,
  GuestDocument,
  GuestConversation,
  GuestMessage,
  MessageSender,
  SecureGuestToken,
  GuestNotification,
  GuestNotificationCategory,
  GuestExperienceKPIs,
  GuestExperienceTimelinePoint,
} from "./types";

// ===================================================================== stores

const serviceRequests = new Map<EntityId, GuestServiceRequest>();
const preCheckIns = new Map<EntityId, PreCheckIn>();
const guestDocuments = new Map<EntityId, GuestDocument>();
const conversations = new Map<EntityId, GuestConversation>();
const tokens = new Map<EntityId, SecureGuestToken>();
const guestNotifications = new Map<EntityId, GuestNotification>();
const journeyEvents = new Map<EntityId, GuestJourneyEvent>();

let idCounter = 1;
function genId(prefix: string): EntityId {
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

function customerVisibleStatus(status: ServiceRequestStatus): "Received" | "Being handled" | "Completed" {
  switch (status) {
    case "SUBMITTED":
    case "ACKNOWLEDGED":
      return "Received";
    case "ASSIGNED":
    case "IN_PROGRESS":
      return "Being handled";
    case "COMPLETED":
    case "CANCELLED":
      return "Completed";
  }
}

let seeded = false;

function ensureSeeded(orgId: EntityId) {
  if (seeded) return;
  seeded = true;
  seedServiceRequests(orgId);
  seedPreCheckIns(orgId);
  seedGuestDocuments(orgId);
  seedConversations(orgId);
  seedTokens(orgId);
  seedNotifications(orgId);
  seedJourneyEvents(orgId);
}

// ============================================================= service requests

export function listServiceRequests(
  organizationId: EntityId,
  filters?: { customerId?: EntityId; status?: ServiceRequestStatus; category?: ServiceRequestCategory },
): readonly GuestServiceRequest[] {
  ensureSeeded(organizationId);
  let result = [...serviceRequests.values()].filter((r) => r.organizationId === organizationId);
  if (filters?.customerId) result = result.filter((r) => r.customerId === filters.customerId);
  if (filters?.status) result = result.filter((r) => r.status === filters.status);
  if (filters?.category) result = result.filter((r) => r.category === filters.category);
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getServiceRequest(id: EntityId): GuestServiceRequest | undefined {
  return serviceRequests.get(id);
}

export function createServiceRequest(
  data: Omit<GuestServiceRequest, "id" | "createdAt" | "customerVisibleStatus" | "acknowledgedAt" | "completedAt" | "cancelledAt" | "taskId" | "assignedTo">,
): GuestServiceRequest {
  const request: GuestServiceRequest = {
    ...data,
    id: genId("gsr"),
    taskId: null,
    assignedTo: null,
    acknowledgedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: now(),
    customerVisibleStatus: "Received",
  };
  serviceRequests.set(request.id, request);
  return request;
}

export function transitionServiceRequest(
  id: EntityId,
  newStatus: ServiceRequestStatus,
): GuestServiceRequest | undefined {
  const existing = serviceRequests.get(id);
  if (!existing) return undefined;
  let updated = { ...existing, status: newStatus };
  if (newStatus === "ACKNOWLEDGED") updated = { ...updated, acknowledgedAt: now() };
  if (newStatus === "COMPLETED") updated = { ...updated, completedAt: now() };
  if (newStatus === "CANCELLED") updated = { ...updated, cancelledAt: now() };
  const withVisibility: GuestServiceRequest = {
    ...updated,
    customerVisibleStatus: customerVisibleStatus(newStatus),
  };
  serviceRequests.set(id, withVisibility);
  return withVisibility;
}

// ================================================================ pre check-in

export function listPreCheckIns(
  organizationId: EntityId,
  filters?: { customerId?: EntityId; reservationId?: EntityId },
): readonly PreCheckIn[] {
  ensureSeeded(organizationId);
  let result = [...preCheckIns.values()].filter((p) => p.organizationId === organizationId);
  if (filters?.customerId) result = result.filter((p) => p.customerId === filters.customerId);
  if (filters?.reservationId) result = result.filter((p) => p.reservationId === filters.reservationId);
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getPreCheckIn(id: EntityId): PreCheckIn | undefined {
  return preCheckIns.get(id);
}

export function getPreCheckInByReservation(reservationId: EntityId): PreCheckIn | undefined {
  return [...preCheckIns.values()].find((p) => p.reservationId === reservationId);
}

export function createPreCheckIn(
  data: Omit<PreCheckIn, "id" | "createdAt" | "submittedAt" | "completedAt">,
): PreCheckIn {
  const checkIn: PreCheckIn = {
    ...data,
    id: genId("pci"),
    submittedAt: null,
    completedAt: null,
    createdAt: now(),
  };
  preCheckIns.set(checkIn.id, checkIn);
  return checkIn;
}

export function updatePreCheckIn(
  id: EntityId,
  data: Partial<Omit<PreCheckIn, "id" | "createdAt">>,
): PreCheckIn | undefined {
  const existing = preCheckIns.get(id);
  if (!existing) return undefined;
  const updated = { ...existing, ...data };
  preCheckIns.set(id, updated);
  return updated;
}

export function submitPreCheckIn(id: EntityId): PreCheckIn | undefined {
  const existing = preCheckIns.get(id);
  if (!existing) return undefined;
  const updated: PreCheckIn = {
    ...existing,
    status: "SUBMITTED",
    submittedAt: now(),
  };
  preCheckIns.set(id, updated);
  return updated;
}

export function completePreCheckIn(id: EntityId): PreCheckIn | undefined {
  const existing = preCheckIns.get(id);
  if (!existing) return undefined;
  const updated: PreCheckIn = {
    ...existing,
    status: "COMPLETED",
    completedAt: now(),
  };
  preCheckIns.set(id, updated);
  return updated;
}

// ============================================================= guest documents

export function listGuestDocuments(
  organizationId: EntityId,
  filters?: { customerId?: EntityId; reservationId?: EntityId },
): readonly GuestDocument[] {
  ensureSeeded(organizationId);
  let result = [...guestDocuments.values()].filter((d) => d.organizationId === organizationId);
  if (filters?.customerId) result = result.filter((d) => d.customerId === filters.customerId);
  if (filters?.reservationId) result = result.filter((d) => d.reservationId === filters.reservationId);
  return result.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

export function uploadGuestDocument(
  data: Omit<GuestDocument, "id" | "uploadedAt" | "verifiedAt" | "verifiedBy" | "rejectionReason">,
): GuestDocument {
  const doc: GuestDocument = {
    ...data,
    id: genId("gdoc"),
    uploadedAt: now(),
    verifiedAt: null,
    verifiedBy: null,
    rejectionReason: null,
  };
  guestDocuments.set(doc.id, doc);
  return doc;
}

export function verifyGuestDocument(id: EntityId, verifiedBy: EntityId): GuestDocument | undefined {
  const existing = guestDocuments.get(id);
  if (!existing) return undefined;
  const updated: GuestDocument = { ...existing, status: "VERIFIED", verifiedAt: now(), verifiedBy };
  guestDocuments.set(id, updated);
  return updated;
}

export function rejectGuestDocument(id: EntityId, reason: string): GuestDocument | undefined {
  const existing = guestDocuments.get(id);
  if (!existing) return undefined;
  const updated: GuestDocument = { ...existing, status: "REJECTED", rejectionReason: reason };
  guestDocuments.set(id, updated);
  return updated;
}

// ============================================================= conversations

export function listConversations(
  organizationId: EntityId,
  filters?: { customerId?: EntityId },
): readonly GuestConversation[] {
  ensureSeeded(organizationId);
  let result = [...conversations.values()].filter((c) => c.organizationId === organizationId);
  if (filters?.customerId) result = result.filter((c) => c.customerId === filters.customerId);
  return result.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
}

export function getConversation(id: EntityId): GuestConversation | undefined {
  return conversations.get(id);
}

export function createConversation(
  data: Omit<GuestConversation, "id" | "createdAt" | "lastMessageAt" | "messages">,
): GuestConversation {
  const ts = now();
  const conv: GuestConversation = {
    ...data,
    id: genId("gconv"),
    createdAt: ts,
    lastMessageAt: ts,
    messages: [],
  };
  conversations.set(conv.id, conv);
  return conv;
}

export function sendMessage(
  conversationId: EntityId,
  sender: MessageSender,
  content: string,
  senderId: EntityId | null = null,
): GuestMessage | undefined {
  const conv = conversations.get(conversationId);
  if (!conv) return undefined;
  const msg: GuestMessage = {
    id: genId("gmsg"),
    conversationId,
    sender,
    senderId,
    content,
    suggestedAction: null,
    createdAt: now(),
  };
  const updated: GuestConversation = {
    ...conv,
    lastMessageAt: msg.createdAt,
    messages: [...conv.messages, msg],
  };
  conversations.set(conversationId, updated);
  return msg;
}

export function handoffConversation(conversationId: EntityId, department: string): GuestConversation | undefined {
  const conv = conversations.get(conversationId);
  if (!conv) return undefined;
  const updated: GuestConversation = { ...conv, status: "HANDOFF", handoffDepartment: department };
  conversations.set(conversationId, updated);
  return updated;
}

// =============================================================== secure tokens

export function listTokens(
  organizationId: EntityId,
  filters?: { customerId?: EntityId },
): readonly SecureGuestToken[] {
  ensureSeeded(organizationId);
  let result = [...tokens.values()].filter((t) => t.organizationId === organizationId);
  if (filters?.customerId) result = result.filter((t) => t.customerId === filters.customerId);
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createGuestToken(
  data: Omit<SecureGuestToken, "id" | "token" | "createdAt" | "revokedAt">,
): SecureGuestToken {
  const raw = genId("gtok");
  const token: SecureGuestToken = {
    ...data,
    id: genId("gtok"),
    token: `gst_${raw}_${Math.random().toString(36).slice(2, 10)}`,
    createdAt: now(),
    revokedAt: null,
  };
  tokens.set(token.id, token);
  return token;
}

export function revokeGuestToken(id: EntityId): boolean {
  const existing = tokens.get(id);
  if (!existing) return false;
  tokens.set(id, { ...existing, revokedAt: now() });
  return true;
}

export function validateGuestToken(tokenValue: string): SecureGuestToken | undefined {
  const found = [...tokens.values()].find((t) => t.token === tokenValue && !t.revokedAt);
  if (!found) return undefined;
  if (new Date(found.expiresAt) < new Date()) return undefined;
  return found;
}

// ============================================================ notifications

export function listGuestNotifications(
  organizationId: EntityId,
  filters?: { customerId?: EntityId; category?: GuestNotificationCategory; unreadOnly?: boolean },
): readonly GuestNotification[] {
  ensureSeeded(organizationId);
  let result = [...guestNotifications.values()].filter((n) => n.organizationId === organizationId);
  if (filters?.customerId) result = result.filter((n) => n.customerId === filters.customerId);
  if (filters?.category) result = result.filter((n) => n.category === filters.category);
  if (filters?.unreadOnly) result = result.filter((n) => !n.read);
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function markNotificationRead(id: EntityId): boolean {
  const existing = guestNotifications.get(id);
  if (!existing) return false;
  guestNotifications.set(id, { ...existing, read: true });
  return true;
}

export function markAllNotificationsRead(organizationId: EntityId, customerId: EntityId): void {
  for (const [id, n] of guestNotifications) {
    if (n.organizationId === organizationId && n.customerId === customerId && !n.read) {
      guestNotifications.set(id, { ...n, read: true });
    }
  }
}

export function createGuestNotification(
  data: Omit<GuestNotification, "id" | "createdAt" | "read">,
): GuestNotification {
  const notification: GuestNotification = {
    ...data,
    id: genId("gnot"),
    read: false,
    createdAt: now(),
  };
  guestNotifications.set(notification.id, notification);
  return notification;
}

// ============================================================ journey

export function getGuestJourney(
  organizationId: EntityId,
  customerId: EntityId,
): GuestJourney {
  ensureSeeded(organizationId);
  const events = [...journeyEvents.values()]
    .filter((e) => e.organizationId === organizationId && e.customerId === customerId)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  const currentStage = deriveCurrentStage(events);
  const activeReservation = events.find((e) => e.sourceType === "reservation" && e.stage === "BOOKING");
  const activeStay = events.find((e) => e.sourceType === "stay" && (e.stage === "IN_STAY" || e.stage === "ARRIVAL"));

  return {
    customerId,
    organizationId,
    currentStage,
    events,
    activeReservationId: activeReservation?.sourceId ?? null,
    activeStayId: activeStay?.sourceId ?? null,
  };
}

function deriveCurrentStage(events: readonly GuestJourneyEvent[]): GuestJourneyStage {
  if (events.length === 0) return "DISCOVERY";
  const latest = events[events.length - 1];
  return latest.stage;
}

// ============================================================== analytics

export function getGuestExperienceKPIs(organizationId: EntityId): GuestExperienceKPIs {
  ensureSeeded(organizationId);
  const requests = [...serviceRequests.values()].filter((r) => r.organizationId === organizationId);
  const completed = requests.filter((r) => r.status === "COMPLETED");
  const checkIns = [...preCheckIns.values()].filter((p) => p.organizationId === organizationId && p.status === "COMPLETED");

  return {
    portalUsers: 48,
    digitalCheckIns: checkIns.length,
    digitalRequests: requests.length,
    requestCompletionRate: requests.length > 0 ? Math.round((completed.length / requests.length) * 100) : 0,
    roomServiceOrders: 12,
    guestPayments: 8,
    guestFeedbackCount: 6,
    digitalEngagementRate: 67,
    digitalCheckInRate: 42,
    qrOrderRate: 23,
    portalUsageRate: 58,
    digitalRequestRate: 35,
  };
}

export function getGuestExperienceTimeline(
  organizationId: EntityId,
  _days: number = 30,
): readonly GuestExperienceTimelinePoint[] {
  ensureSeeded(organizationId);
  const points: GuestExperienceTimelinePoint[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    points.push({
      date: d.toISOString().slice(0, 10),
      portalVisits: Math.floor(Math.random() * 30) + 10,
      serviceRequests: Math.floor(Math.random() * 8) + 1,
      digitalCheckIns: Math.floor(Math.random() * 5),
      roomServiceOrders: Math.floor(Math.random() * 6),
    });
  }
  return points;
}

// =============================================================== seed data

function seedServiceRequests(orgId: EntityId) {
  const propId: EntityId = "prop_demo_1";
  const custId: EntityId = "cust_demo_1";

  const sr1: GuestServiceRequest = {
    id: "gsr_demo_1",
    organizationId: orgId,
    propertyId: propId,
    customerId: custId,
    reservationId: "res_demo_1",
    stayId: "stay_demo_1",
    roomId: "room_204",
    category: "EXTRA_TOWELS",
    title: "Extra towels",
    description: "Need 2 extra bath towels for room 204",
    priority: "NORMAL",
    status: "COMPLETED",
    taskId: "task_demo_1",
    assignedTo: "user_demo_hk",
    createdAt: pastDate(1),
    acknowledgedAt: pastDate(1),
    completedAt: pastDate(0),
    cancelledAt: null,
    customerVisibleStatus: "Completed",
  };

  const sr2: GuestServiceRequest = {
    id: "gsr_demo_2",
    organizationId: orgId,
    propertyId: propId,
    customerId: custId,
    reservationId: "res_demo_1",
    stayId: "stay_demo_1",
    roomId: "room_204",
    category: "ROOM_SERVICE",
    title: "Room service order",
    description: "Would like to order dinner from the menu",
    priority: "NORMAL",
    status: "IN_PROGRESS",
    taskId: "task_demo_2",
    assignedTo: "user_demo_fb",
    createdAt: pastDate(0),
    acknowledgedAt: pastDate(0),
    completedAt: null,
    cancelledAt: null,
    customerVisibleStatus: "Being handled",
  };

  const sr3: GuestServiceRequest = {
    id: "gsr_demo_3",
    organizationId: orgId,
    propertyId: propId,
    customerId: custId,
    reservationId: "res_demo_1",
    stayId: "stay_demo_1",
    roomId: "room_204",
    category: "WIFI",
    title: "Wi-Fi connectivity issue",
    description: "Wi-Fi not working in room 204",
    priority: "NORMAL",
    status: "SUBMITTED",
    taskId: null,
    assignedTo: null,
    createdAt: now(),
    acknowledgedAt: null,
    completedAt: null,
    cancelledAt: null,
    customerVisibleStatus: "Received",
  };

  serviceRequests.set(sr1.id, sr1);
  serviceRequests.set(sr2.id, sr2);
  serviceRequests.set(sr3.id, sr3);
}

function seedPreCheckIns(orgId: EntityId) {
  const propId: EntityId = "prop_demo_1";
  const custId: EntityId = "cust_demo_1";

  const pci1: PreCheckIn = {
    id: "pci_demo_1",
    organizationId: orgId,
    propertyId: propId,
    reservationId: "res_demo_2",
    customerId: custId,
    guestName: "Abhishek Katwa",
    guestPhone: "+91 9876543210",
    guestEmail: "abhishek@example.com",
    guestAddress: "123 Main Street, Pune",
    adults: 2,
    children: 0,
    estimatedArrival: futureDate(3),
    specialRequests: "Early check-in if possible, high floor preferred",
    preferences: "Extra pillows, quiet room",
    documentStatus: "NOT_UPLOADED",
    consentGiven: false,
    status: "NOT_STARTED",
    submittedAt: null,
    completedAt: null,
    createdAt: pastDate(2),
  };

  const pci2: PreCheckIn = {
    id: "pci_demo_2",
    organizationId: orgId,
    propertyId: propId,
    reservationId: "res_demo_1",
    customerId: custId,
    guestName: "Abhishek Katwa",
    guestPhone: "+91 9876543210",
    guestEmail: "abhishek@example.com",
    guestAddress: "123 Main Street, Pune",
    adults: 2,
    children: 0,
    estimatedArrival: pastDate(1),
    specialRequests: "",
    preferences: "",
    documentStatus: "VERIFIED",
    consentGiven: true,
    status: "COMPLETED",
    submittedAt: pastDate(2),
    completedAt: pastDate(1),
    createdAt: pastDate(3),
  };

  preCheckIns.set(pci1.id, pci1);
  preCheckIns.set(pci2.id, pci2);
}

function seedGuestDocuments(orgId: EntityId) {
  const propId: EntityId = "prop_demo_1";
  const custId: EntityId = "cust_demo_1";

  const doc1: GuestDocument = {
    id: "gdoc_demo_1",
    organizationId: orgId,
    propertyId: propId,
    customerId: custId,
    reservationId: "res_demo_1",
    documentType: "AADHAAR",
    documentNumber: "****5678",
    documentName: "Aadhaar Card",
    status: "VERIFIED",
    documentId: "doc_demo_1",
    uploadedAt: pastDate(3),
    verifiedAt: pastDate(2),
    verifiedBy: "user_demo_mgr",
    rejectionReason: null,
  };

  guestDocuments.set(doc1.id, doc1);
}

function seedConversations(orgId: EntityId) {
  const propId: EntityId = "prop_demo_1";
  const custId: EntityId = "cust_demo_1";

  const msg1: GuestMessage = {
    id: "gmsg_demo_1",
    conversationId: "gconv_demo_1",
    sender: "GUEST",
    senderId: custId,
    content: "What time is breakfast served?",
    suggestedAction: null,
    createdAt: pastDate(0),
  };

  const msg2: GuestMessage = {
    id: "gmsg_demo_2",
    conversationId: "gconv_demo_1",
    sender: "AI",
    senderId: null,
    content: "Breakfast is served from 7:00 AM to 10:30 AM at our main restaurant on the ground floor. Would you like me to reserve a table for you?",
    suggestedAction: {
      label: "Reserve a table",
      actionType: "view_booking",
      payload: { outletId: "outlet_demo_1" },
    },
    createdAt: pastDate(0),
  };

  const conv1: GuestConversation = {
    id: "gconv_demo_1",
    organizationId: orgId,
    propertyId: propId,
    customerId: custId,
    type: "DINING",
    subject: "Breakfast timing inquiry",
    status: "OPEN",
    handoffDepartment: null,
    createdAt: pastDate(0),
    lastMessageAt: msg2.createdAt,
    messages: [msg1, msg2],
  };

  conversations.set(conv1.id, conv1);
}

function seedTokens(orgId: EntityId) {
  const propId: EntityId = "prop_demo_1";
  const custId: EntityId = "cust_demo_1";

  const tok1: SecureGuestToken = {
    id: "gtok_demo_1",
    organizationId: orgId,
    propertyId: propId,
    customerId: custId,
    tokenType: "STAY",
    sourceId: "stay_demo_1",
    token: "gst_stay_demo_1_x7k9m2p4",
    expiresAt: futureDate(7),
    revokedAt: null,
    createdAt: pastDate(1),
  };

  const tok2: SecureGuestToken = {
    id: "gtok_demo_2",
    organizationId: orgId,
    propertyId: propId,
    customerId: custId,
    tokenType: "RESERVATION",
    sourceId: "res_demo_2",
    token: "gst_res_demo_2_q3w8n5j1",
    expiresAt: futureDate(14),
    revokedAt: null,
    createdAt: pastDate(2),
  };

  tokens.set(tok1.id, tok1);
  tokens.set(tok2.id, tok2);
}

function seedNotifications(orgId: EntityId) {
  const propId: EntityId = "prop_demo_1";
  const custId: EntityId = "cust_demo_1";

  const notifications: GuestNotification[] = [
    {
      id: "gnot_demo_1",
      organizationId: orgId,
      propertyId: propId,
      customerId: custId,
      category: "REQUESTS",
      title: "Request completed",
      message: "Your extra towels request has been completed.",
      actionLabel: "View Request",
      actionUrl: "/guest/requests/gsr_demo_1",
      referenceType: "service_request",
      referenceId: "gsr_demo_1",
      read: true,
      createdAt: pastDate(0),
    },
    {
      id: "gnot_demo_2",
      organizationId: orgId,
      propertyId: propId,
      customerId: custId,
      category: "STAY",
      title: "Checkout reminder",
      message: "Your checkout is tomorrow at 11:00 AM.",
      actionLabel: "View Stay",
      actionUrl: "/guest/stay",
      referenceType: "stay",
      referenceId: "stay_demo_1",
      read: false,
      createdAt: pastDate(0),
    },
    {
      id: "gnot_demo_3",
      organizationId: orgId,
      propertyId: propId,
      customerId: custId,
      category: "REWARDS",
      title: "Points earned",
      message: "You earned 120 points from your recent stay.",
      actionLabel: "View Rewards",
      actionUrl: "/guest/rewards",
      referenceType: "loyalty",
      referenceId: "loy_demo_1",
      read: false,
      createdAt: pastDate(1),
    },
    {
      id: "gnot_demo_4",
      organizationId: orgId,
      propertyId: propId,
      customerId: custId,
      category: "OFFERS",
      title: "Special offer for you",
      message: "Enjoy 20% off your next dining experience.",
      actionLabel: "View Offer",
      actionUrl: "/guest/offers",
      referenceType: "offer",
      referenceId: "off_seed_1",
      read: false,
      createdAt: pastDate(1),
    },
    {
      id: "gnot_demo_5",
      organizationId: orgId,
      propertyId: propId,
      customerId: custId,
      category: "PAYMENTS",
      title: "Payment received",
      message: "Your payment of ₹4,500 has been received.",
      actionLabel: "View Bill",
      actionUrl: "/guest/bills",
      referenceType: "payment",
      referenceId: "pay_demo_1",
      read: true,
      createdAt: pastDate(2),
    },
  ];

  for (const n of notifications) {
    guestNotifications.set(n.id, n);
  }
}

function seedJourneyEvents(orgId: EntityId) {
  const propId: EntityId = "prop_demo_1";
  const custId: EntityId = "cust_demo_1";

  const events: GuestJourneyEvent[] = [
    {
      id: "gje_demo_1",
      organizationId: orgId,
      propertyId: propId,
      customerId: custId,
      stage: "BOOKING",
      title: "Booking confirmed",
      description: "Deluxe Room reservation confirmed for 3 nights",
      occurredAt: pastDate(10),
      sourceType: "reservation",
      sourceId: "res_demo_1",
      icon: "CalendarCheck",
    },
    {
      id: "gje_demo_2",
      organizationId: orgId,
      propertyId: propId,
      customerId: custId,
      stage: "PRE_ARRIVAL",
      title: "Pre-arrival information sent",
      description: "Check-in details and property information shared",
      occurredAt: pastDate(2),
      sourceType: "reservation",
      sourceId: "res_demo_1",
      icon: "Mail",
    },
    {
      id: "gje_demo_3",
      organizationId: orgId,
      propertyId: propId,
      customerId: custId,
      stage: "ARRIVAL",
      title: "Checked in",
      description: "Welcome to Room 204",
      occurredAt: pastDate(1),
      sourceType: "stay",
      sourceId: "stay_demo_1",
      icon: "LogIn",
    },
    {
      id: "gje_demo_4",
      organizationId: orgId,
      propertyId: propId,
      customerId: custId,
      stage: "IN_STAY",
      title: "Service request",
      description: "Extra towels requested",
      occurredAt: pastDate(1),
      sourceType: "request",
      sourceId: "gsr_demo_1",
      icon: "ConciergeBell",
    },
    {
      id: "gje_demo_5",
      organizationId: orgId,
      propertyId: propId,
      customerId: custId,
      stage: "IN_STAY",
      title: "Restaurant order",
      description: "Dinner ordered from main restaurant",
      occurredAt: pastDate(0),
      sourceType: "order",
      sourceId: "ord_demo_1",
      icon: "UtensilsCrossed",
    },
  ];

  for (const e of events) {
    journeyEvents.set(e.id, e);
  }
}
