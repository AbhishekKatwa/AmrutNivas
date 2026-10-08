/**
 * Notifications, communications & automation types (Prompt #17).
 *
 * Unified communication and automation foundation. Reacts to domain events from
 * existing modules (hotel, restaurant, events, inventory, etc.) and produces
 * notifications, emails, SMS, WhatsApp messages, and tasks.
 *
 * Architecture: Domain Event → Automation Rule → Conditions → Actions → Notification/Communication
 */

import type { EntityId } from "@/domain/identity/types";

// =====================================================================
// Domain Events
// =====================================================================

/**
 * Event domains — grouped by the module that produces them.
 */
export type EventDomain =
  | "HOTEL"
  | "RESTAURANT"
  | "INVENTORY"
  | "PROCUREMENT"
  | "EVENTS"
  | "HR"
  | "CRM"
  | "FINANCE"
  | "COMMERCE"
  | "SUBSCRIPTION"
  | "SYSTEM";

/**
 * Event types — specific events within each domain.
 */
export type EventType =
  // Hotel
  | "HOTEL.RESERVATION_CREATED"
  | "HOTEL.RESERVATION_CONFIRMED"
  | "HOTEL.RESERVATION_CANCELLED"
  | "HOTEL.CHECK_IN"
  | "HOTEL.CHECK_OUT"
  | "HOTEL.ROOM_READY"
  // Restaurant
  | "RESTAURANT.ORDER_PLACED"
  | "RESTAURANT.ORDER_READY"
  | "RESTAURANT.ORDER_COMPLETED"
  // Inventory
  | "INVENTORY.LOW_STOCK"
  | "INVENTORY.STOCK_RECEIVED"
  | "INVENTORY.WASTAGE_RECORDED"
  // Procurement
  | "PROCUREMENT.PO_APPROVED"
  | "PROCUREMENT.GOODS_RECEIVED"
  | "PROCUREMENT.PAYMENT_DUE"
  // Events
  | "EVENTS.EVENT_CREATED"
  | "EVENTS.EVENT_CONFIRMED"
  | "EVENTS.EVENT_COMPLETED"
  | "EVENTS.QUOTATION_ACCEPTED"
  // HR
  | "HR.LEAVE_APPROVED"
  | "HR.LEAVE_REJECTED"
  | "HR.SHIFT_CHANGED"
  // CRM
  | "CRM.CUSTOMER_CREATED"
  | "CRM.FEEDBACK_RECEIVED"
  | "CRM.COMPLAINT_RAISED"
  // Finance
  | "FINANCE.PAYMENT_RECEIVED"
  | "FINANCE.INVOICE_GENERATED"
  | "FINANCE.INVOICE_DUE"
  | "FINANCE.INVOICE_OVERDUE"
  // Commerce
  | "COMMERCE.QR_ORDER_CREATED"
  | "COMMERCE.DIRECT_BOOKING_CREATED"
  // Subscription
  | "SUBSCRIPTION.PAYMENT_FAILED"
  | "SUBSCRIPTION.TRIAL_ENDING"
  | "SUBSCRIPTION.EXPIRING"
  | "SUBSCRIPTION.RENEWED"
  // System
  | "SYSTEM.MAINTENANCE_CREATED"
  | "SYSTEM.MAINTENANCE_RESOLVED";

/**
 * Domain event — something that happened in the system.
 *
 * Events are produced by domain modules and consumed by automation rules.
 * They are the trigger for notifications and communications.
 */
export type DomainEvent = {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly propertyId?: EntityId | null;
  readonly outletId?: EntityId | null;
  readonly eventType: EventType;
  readonly entityType: string;
  readonly entityId: EntityId;
  readonly occurredAt: string;
  readonly actorUserId?: EntityId | null;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string;
};

// =====================================================================
// Notifications
// =====================================================================

/**
 * Notification type — what kind of notification this is.
 */
export type NotificationType =
  | "INFO"
  | "SUCCESS"
  | "WARNING"
  | "ERROR"
  | "ACTION_REQUIRED";

/**
 * Notification severity — how urgent this is.
 */
export type NotificationSeverity = "LOW" | "NORMAL" | "HIGH" | "CRITICAL";

/**
 * Notification status — read/unread/archived.
 */
export type NotificationStatus = "UNREAD" | "READ" | "ARCHIVED";

/**
 * Notification — in-app notification for a user.
 */
export type Notification = {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly propertyId?: EntityId | null;
  readonly outletId?: EntityId | null;
  readonly recipientUserId: EntityId;
  readonly type: NotificationType;
  readonly title: string;
  readonly message: string;
  readonly severity: NotificationSeverity;
  readonly referenceType?: string | null;
  readonly referenceId?: EntityId | null;
  readonly status: NotificationStatus;
  readonly readAt?: string | null;
  readonly createdAt: string;
};

// =====================================================================
// Notification Preferences
// =====================================================================

/**
 * Notification frequency — how often to receive notifications.
 */
export type NotificationFrequency =
  | "IMMEDIATE"
  | "DAILY_DIGEST"
  | "WEEKLY_DIGEST"
  | "NONE";

/**
 * Notification preference — user's preference for a specific event type.
 */
export type NotificationPreference = {
  readonly userId: EntityId;
  readonly eventType: EventType;
  readonly inAppEnabled: boolean;
  readonly emailEnabled: boolean;
  readonly smsEnabled: boolean;
  readonly whatsappEnabled: boolean;
  readonly frequency: NotificationFrequency;
  readonly quietHoursEnabled: boolean;
  readonly quietHoursStart?: string | null;
  readonly quietHoursEnd?: string | null;
  readonly updatedAt: string;
};

// =====================================================================
// Notification Templates
// =====================================================================

/**
 * Communication channel — where the message is sent.
 */
export type CommunicationChannel =
  | "IN_APP"
  | "EMAIL"
  | "SMS"
  | "WHATSAPP";

/**
 * Template status — active/inactive.
 */
export type TemplateStatus = "ACTIVE" | "INACTIVE";

/**
 * Notification template — reusable message template.
 */
export type NotificationTemplate = {
  readonly id: EntityId;
  readonly organizationId?: EntityId | null;
  readonly eventType: EventType;
  readonly channel: CommunicationChannel;
  readonly name: string;
  readonly subject?: string | null;
  readonly body: string;
  readonly variables: readonly string[];
  readonly status: TemplateStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
};

// =====================================================================
// Communication Messages
// =====================================================================

/**
 * Recipient type — who the message is for.
 */
export type RecipientType = "USER" | "CUSTOMER" | "SUPPLIER";

/**
 * Communication status — message delivery status.
 */
export type CommunicationStatus =
  | "QUEUED"
  | "SENDING"
  | "SENT"
  | "DELIVERED"
  | "FAILED"
  | "CANCELLED";

/**
 * Communication message — email/SMS/WhatsApp message.
 */
export type CommunicationMessage = {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly recipientType: RecipientType;
  readonly recipientId?: EntityId | null;
  readonly channel: CommunicationChannel;
  readonly templateId?: EntityId | null;
  readonly subject?: string | null;
  readonly body: string;
  readonly status: CommunicationStatus;
  readonly provider?: string | null;
  readonly providerMessageId?: string | null;
  readonly scheduledAt?: string | null;
  readonly sentAt?: string | null;
  readonly deliveredAt?: string | null;
  readonly failedAt?: string | null;
  readonly errorMessage?: string | null;
  readonly retryCount: number;
  readonly maxRetries: number;
  readonly createdAt: string;
};

// =====================================================================
// Automation Rules
// =====================================================================

/**
 * Automation rule status — active/inactive/draft.
 */
export type AutomationRuleStatus = "ACTIVE" | "INACTIVE" | "DRAFT";

/**
 * Condition operator — comparison operators for rule conditions.
 */
export type ConditionOperator =
  | "EQUALS"
  | "NOT_EQUALS"
  | "GREATER_THAN"
  | "LESS_THAN"
  | "GREATER_THAN_OR_EQUAL"
  | "LESS_THAN_OR_EQUAL"
  | "CONTAINS"
  | "IN";

/**
 * Rule condition — a single condition in an automation rule.
 */
export type RuleCondition = {
  readonly field: string;
  readonly operator: ConditionOperator;
  readonly value: string | number | boolean | readonly string[];
};

/**
 * Action type — what the automation does.
 */
export type ActionType =
  | "CREATE_NOTIFICATION"
  | "SEND_EMAIL"
  | "SEND_SMS"
  | "SEND_WHATSAPP"
  | "CREATE_TASK";

/**
 * Rule action — a single action in an automation rule.
 */
export type RuleAction = {
  readonly actionType: ActionType;
  readonly templateId?: EntityId | null;
  readonly recipientUserId?: EntityId | null;
  readonly recipientEmail?: string | null;
  readonly recipientPhone?: string | null;
  readonly metadata?: Record<string, unknown>;
};

/**
 * Automation rule — trigger + conditions + actions.
 */
export type AutomationRule = {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly propertyId?: EntityId | null;
  readonly name: string;
  readonly description?: string | null;
  readonly eventType: EventType;
  readonly conditions: readonly RuleCondition[];
  readonly actions: readonly RuleAction[];
  readonly status: AutomationRuleStatus;
  readonly createdBy: EntityId;
  readonly createdAt: string;
  readonly updatedAt: string;
};

// =====================================================================
// Automation Execution
// =====================================================================

/**
 * Execution status — result of executing an automation rule.
 */
export type ExecutionStatus =
  | "PENDING"
  | "RUNNING"
  | "SUCCESS"
  | "FAILED"
  | "SKIPPED";

/**
 * Automation execution — log of executing an automation rule.
 *
 * Used for idempotency (prevent duplicate executions) and audit trail.
 */
export type AutomationExecution = {
  readonly id: EntityId;
  readonly ruleId: EntityId;
  readonly domainEventId: EntityId;
  readonly actionIndex: number;
  readonly status: ExecutionStatus;
  readonly executedAt?: string | null;
  readonly result?: Record<string, unknown> | null;
  readonly errorMessage?: string | null;
  readonly createdAt: string;
};

// =====================================================================
// Composite Types
// =====================================================================

/**
 * Automation rule with execution count.
 */
export type AutomationRuleWithStats = AutomationRule & {
  readonly executionCount: number;
  readonly lastExecutedAt?: string | null;
};

/**
 * Notification with actor name.
 */
export type NotificationWithActor = Notification & {
  readonly actorName?: string | null;
};

/**
 * Communication message with template name.
 */
export type CommunicationMessageWithTemplate = CommunicationMessage & {
  readonly templateName?: string | null;
};
