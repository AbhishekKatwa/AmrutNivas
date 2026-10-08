/**
 * Notifications & automation service layer (Prompt #17).
 *
 * Reads and writes for domain events, notifications, communication messages,
 * templates, automation rules, and execution logs. All writes go through 047 doors;
 * reads use RLS-scoped Supabase queries.
 *
 * Architecture: Domain Event → Automation Rule → Conditions → Actions → Notification/Communication
 */

import { requireSupabase } from "@/db/client";
import { asRead, callDoor, callDoorRow, camelRows, firstCamelRow } from "@/db/rpc";
import { readSession } from "@/domain/auth/auth-service";
import type { EntityId } from "@/domain/identity/types";
import type {
  AutomationExecution,
  AutomationRule,
  AutomationRuleWithStats,
  CommunicationMessage,
  CommunicationMessageWithTemplate,
  DomainEvent,
  EventType,
  Notification,
  NotificationPreference,
  NotificationTemplate,
  NotificationWithActor,
} from "@/domain/notifications/types";

export type {
  AutomationExecution,
  AutomationRule,
  AutomationRuleWithStats,
  CommunicationMessage,
  CommunicationMessageWithTemplate,
  DomainEvent,
  EventType,
  Notification,
  NotificationPreference,
  NotificationTemplate,
  NotificationWithActor,
} from "@/domain/notifications/types";

const DOMAIN_EVENTS_TABLE = "domain_events";
const NOTIFICATIONS_TABLE = "notifications";
const NOTIFICATION_PREFERENCES_TABLE = "notification_preferences";
const NOTIFICATION_TEMPLATES_TABLE = "notification_templates";
const COMMUNICATION_MESSAGES_TABLE = "communication_messages";
const AUTOMATION_RULES_TABLE = "automation_rules";
const AUTOMATION_EXECUTIONS_TABLE = "automation_executions";

const DOMAIN_EVENT_COLUMNS =
  "id, organization_id, property_id, outlet_id, event_type, entity_type, entity_id, occurred_at, actor_user_id, metadata, created_at";
const NOTIFICATION_COLUMNS =
  "id, organization_id, property_id, outlet_id, recipient_user_id, type, title, message, severity, reference_type, reference_id, status, read_at, created_at";
const NOTIFICATION_PREFERENCE_COLUMNS =
  "user_id, event_type, in_app_enabled, email_enabled, sms_enabled, whatsapp_enabled, frequency, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, updated_at";
const NOTIFICATION_TEMPLATE_COLUMNS =
  "id, organization_id, event_type, channel, name, subject, body, variables, status, created_at, updated_at";
const COMMUNICATION_MESSAGE_COLUMNS =
  "id, organization_id, recipient_type, recipient_id, channel, template_id, subject, body, status, provider, provider_message_id, scheduled_at, sent_at, delivered_at, failed_at, error_message, retry_count, max_retries, created_at";
const AUTOMATION_RULE_COLUMNS =
  "id, organization_id, property_id, name, description, event_type, conditions, actions, status, created_by, created_at, updated_at";
const AUTOMATION_EXECUTION_COLUMNS =
  "id, rule_id, domain_event_id, action_index, status, executed_at, result, error_message, created_at";

// =====================================================================
// Domain Events
// =====================================================================

/** Record a domain event. */
export async function recordDomainEvent(input: {
  organizationId: EntityId;
  propertyId?: EntityId | null;
  outletId?: EntityId | null;
  eventType: EventType;
  entityType: string;
  entityId: EntityId;
  actorUserId?: EntityId | null;
  metadata?: Record<string, unknown>;
}): Promise<DomainEvent> {
  return callDoorRow<DomainEvent>("record_domain_event", {
    p_organization: input.organizationId,
    p_property: input.propertyId ?? null,
    p_outlet: input.outletId ?? null,
    p_event_type: input.eventType,
    p_entity_type: input.entityType,
    p_entity_id: input.entityId,
    p_actor_user: input.actorUserId ?? null,
    p_metadata: JSON.stringify(input.metadata ?? {}),
  });
}

/** List domain events for an organization. */
export async function listDomainEvents(
  organizationId: EntityId,
  limit = 100,
): Promise<DomainEvent[]> {
  const chain = requireSupabase()
    .from(DOMAIN_EVENTS_TABLE)
    .select(DOMAIN_EVENT_COLUMNS)
    .eq("organization_id", organizationId)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  return camelRows<DomainEvent>(asRead(chain));
}

// =====================================================================
// Notifications
// =====================================================================

/** List notifications for the current user. */
export async function listNotifications(
  organizationId: EntityId,
  options?: {
    status?: "UNREAD" | "READ" | "ARCHIVED";
    limit?: number;
  },
): Promise<NotificationWithActor[]> {
  const session = await readSession();
  if (!session) {
    return [];
  }
  const userId = session.userId;

  let chain = requireSupabase()
    .from(NOTIFICATIONS_TABLE)
    .select(NOTIFICATION_COLUMNS)
    .eq("recipient_user_id", userId)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (options?.status) {
    chain = chain.eq("status", options.status);
  }

  chain = chain.limit(options?.limit ?? 50);

  return camelRows<NotificationWithActor>(asRead(chain));
}

/** Get unread notification count for the current user. */
export async function getUnreadNotificationCount(
  organizationId: EntityId,
): Promise<number> {
  const session = await readSession();
  if (!session) {
    return 0;
  }
  const userId = session.userId;

  const { count, error } = await requireSupabase()
    .from(NOTIFICATIONS_TABLE)
    .select("*", { count: "exact", head: true })
    .eq("recipient_user_id", userId)
    .eq("organization_id", organizationId)
    .eq("status", "UNREAD");
  if (error) throw error;
  return count ?? 0;
}

/** Mark a notification as read. */
export async function markNotificationRead(
  notificationId: EntityId,
): Promise<void> {
  await callDoor("mark_notification_read", { p_notification_id: notificationId });
}

/** Mark all notifications as read for the current user. */
export async function markAllNotificationsRead(
  organizationId: EntityId,
): Promise<void> {
  const session = await readSession();
  if (!session) {
    return;
  }
  const userId = session.userId;
  await callDoor("mark_all_notifications_read", { p_user_id: userId, p_organization: organizationId });
}

/** Archive a notification. */
export async function archiveNotification(
  notificationId: EntityId,
): Promise<void> {
  await callDoor("archive_notification", { p_notification_id: notificationId });
}

/** Create a notification. */
export async function createNotification(input: {
  organizationId: EntityId;
  propertyId?: EntityId | null;
  outletId?: EntityId | null;
  recipientUserId: EntityId;
  type: "INFO" | "SUCCESS" | "WARNING" | "ERROR" | "ACTION_REQUIRED";
  title: string;
  message: string;
  severity?: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
  referenceType?: string | null;
  referenceId?: EntityId | null;
}): Promise<Notification> {
  return callDoorRow<Notification>("create_notification", {
    p_organization: input.organizationId,
    p_property: input.propertyId ?? null,
    p_outlet: input.outletId ?? null,
    p_recipient_user: input.recipientUserId,
    p_type: input.type,
    p_title: input.title,
    p_message: input.message,
    p_severity: input.severity ?? "NORMAL",
    p_reference_type: input.referenceType ?? null,
    p_reference_id: input.referenceId ?? null,
  });
}

// =====================================================================
// Notification Preferences
// =====================================================================

/** Get notification preferences for the current user. */
export async function getNotificationPreferences(): Promise<NotificationPreference[]> {
  const session = await readSession();
  if (!session) {
    return [];
  }
  const userId = session.userId;

  const chain = requireSupabase()
    .from(NOTIFICATION_PREFERENCES_TABLE)
    .select(NOTIFICATION_PREFERENCE_COLUMNS)
    .eq("user_id", userId);
  return camelRows<NotificationPreference>(asRead(chain));
}

/** Upsert a notification preference for the current user. */
export async function upsertNotificationPreference(
  input: Omit<NotificationPreference, "userId" | "updatedAt">,
): Promise<NotificationPreference> {
  const session = await readSession();
  if (!session) {
    throw new Error("Not authenticated");
  }
  const userId = session.userId;

  return callDoorRow<NotificationPreference>("upsert_notification_preference", {
    p_user_id: userId,
    p_event_type: input.eventType,
    p_in_app_enabled: input.inAppEnabled,
    p_email_enabled: input.emailEnabled,
    p_sms_enabled: input.smsEnabled,
    p_whatsapp_enabled: input.whatsappEnabled,
    p_frequency: input.frequency,
    p_quiet_hours_enabled: input.quietHoursEnabled,
    p_quiet_hours_start: input.quietHoursStart ?? null,
    p_quiet_hours_end: input.quietHoursEnd ?? null,
  });
}

// =====================================================================
// Notification Templates
// =====================================================================

/** List notification templates. */
export async function listNotificationTemplates(
  organizationId: EntityId,
  options?: {
    eventType?: EventType;
    channel?: "IN_APP" | "EMAIL" | "SMS" | "WHATSAPP";
  },
): Promise<NotificationTemplate[]> {
  let chain = requireSupabase()
    .from(NOTIFICATION_TEMPLATES_TABLE)
    .select(NOTIFICATION_TEMPLATE_COLUMNS)
    .or(`organization_id.eq.${organizationId},organization_id.is.null`)
    .order("event_type");

  if (options?.eventType) {
    chain = chain.eq("event_type", options.eventType);
  }
  if (options?.channel) {
    chain = chain.eq("channel", options.channel);
  }

  return camelRows<NotificationTemplate>(asRead(chain));
}

/** Get a notification template. */
export async function getNotificationTemplate(
  id: EntityId,
): Promise<NotificationTemplate | null> {
  const chain = requireSupabase()
    .from(NOTIFICATION_TEMPLATES_TABLE)
    .select(NOTIFICATION_TEMPLATE_COLUMNS)
    .eq("id", id)
    .limit(1);
  return firstCamelRow<NotificationTemplate>(asRead(chain));
}

/** Create a notification template. */
export async function createNotificationTemplate(input: {
  organizationId?: EntityId | null;
  eventType: EventType;
  channel: "IN_APP" | "EMAIL" | "SMS" | "WHATSAPP";
  name: string;
  subject?: string | null;
  body: string;
  variables?: readonly string[];
}): Promise<NotificationTemplate> {
  return callDoorRow<NotificationTemplate>("create_notification_template", {
    p_organization: input.organizationId ?? null,
    p_event_type: input.eventType,
    p_channel: input.channel,
    p_name: input.name,
    p_subject: input.subject ?? null,
    p_body: input.body,
    p_variables: JSON.stringify(input.variables ?? []),
  });
}

/** Update a notification template. */
export async function updateNotificationTemplate(input: {
  id: EntityId;
  name?: string;
  subject?: string | null;
  body?: string;
  status?: "ACTIVE" | "INACTIVE";
}): Promise<NotificationTemplate> {
  return callDoorRow<NotificationTemplate>("update_notification_template", {
    p_id: input.id,
    p_name: input.name ?? null,
    p_subject: input.subject ?? null,
    p_body: input.body ?? null,
    p_status: input.status ?? null,
  });
}

// =====================================================================
// Communication Messages
// =====================================================================

/** List communication messages. */
export async function listCommunicationMessages(
  organizationId: EntityId,
  options?: {
    channel?: "IN_APP" | "EMAIL" | "SMS" | "WHATSAPP";
    status?: "QUEUED" | "SENDING" | "SENT" | "DELIVERED" | "FAILED" | "CANCELLED";
    recipientId?: EntityId;
    limit?: number;
  },
): Promise<CommunicationMessageWithTemplate[]> {
  let chain = requireSupabase()
    .from(COMMUNICATION_MESSAGES_TABLE)
    .select(COMMUNICATION_MESSAGE_COLUMNS)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (options?.channel) {
    chain = chain.eq("channel", options.channel);
  }
  if (options?.status) {
    chain = chain.eq("status", options.status);
  }
  if (options?.recipientId) {
    chain = chain.eq("recipient_id", options.recipientId);
  }

  chain = chain.limit(options?.limit ?? 100);

  return camelRows<CommunicationMessageWithTemplate>(asRead(chain));
}

/** Get a communication message. */
export async function getCommunicationMessage(
  id: EntityId,
): Promise<CommunicationMessage | null> {
  const chain = requireSupabase()
    .from(COMMUNICATION_MESSAGES_TABLE)
    .select(COMMUNICATION_MESSAGE_COLUMNS)
    .eq("id", id)
    .limit(1);
  return firstCamelRow<CommunicationMessage>(asRead(chain));
}

/** Queue a communication message. */
export async function queueCommunicationMessage(input: {
  organizationId: EntityId;
  recipientType: "USER" | "CUSTOMER" | "SUPPLIER";
  recipientId?: EntityId | null;
  channel: "IN_APP" | "EMAIL" | "SMS" | "WHATSAPP";
  templateId?: EntityId | null;
  subject?: string | null;
  body: string;
  scheduledAt?: string | null;
}): Promise<CommunicationMessage> {
  return callDoorRow<CommunicationMessage>("queue_communication_message", {
    p_organization: input.organizationId,
    p_recipient_type: input.recipientType,
    p_recipient_id: input.recipientId ?? null,
    p_channel: input.channel,
    p_template_id: input.templateId ?? null,
    p_subject: input.subject ?? null,
    p_body: input.body,
    p_scheduled_at: input.scheduledAt ?? null,
  });
}

// =====================================================================
// Automation Rules
// =====================================================================

/** List automation rules. */
export async function listAutomationRules(
  organizationId: EntityId,
): Promise<AutomationRuleWithStats[]> {
  const chain = requireSupabase()
    .from(AUTOMATION_RULES_TABLE)
    .select(AUTOMATION_RULE_COLUMNS)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  return camelRows<AutomationRuleWithStats>(asRead(chain));
}

/** Get an automation rule. */
export async function getAutomationRule(
  id: EntityId,
): Promise<AutomationRule | null> {
  const chain = requireSupabase()
    .from(AUTOMATION_RULES_TABLE)
    .select(AUTOMATION_RULE_COLUMNS)
    .eq("id", id)
    .limit(1);
  return firstCamelRow<AutomationRule>(asRead(chain));
}

/** Create an automation rule. */
export async function createAutomationRule(input: {
  organizationId: EntityId;
  propertyId?: EntityId | null;
  name: string;
  description?: string | null;
  eventType: EventType;
  conditions: readonly { field: string; operator: string; value: string | number | boolean | readonly string[] }[];
  actions: readonly { actionType: string; templateId?: EntityId | null; recipientUserId?: EntityId | null; recipientEmail?: string | null; recipientPhone?: string | null; metadata?: Record<string, unknown> }[];
  createdBy: EntityId;
}): Promise<AutomationRule> {
  return callDoorRow<AutomationRule>("create_automation_rule", {
    p_organization: input.organizationId,
    p_property: input.propertyId ?? null,
    p_name: input.name,
    p_description: input.description ?? null,
    p_event_type: input.eventType,
    p_conditions: JSON.stringify(input.conditions),
    p_actions: JSON.stringify(input.actions),
    p_created_by: input.createdBy,
  });
}

/** Update an automation rule. */
export async function updateAutomationRule(input: {
  id: EntityId;
  name?: string;
  description?: string | null;
  conditions?: readonly { field: string; operator: string; value: string | number | boolean | readonly string[] }[];
  actions?: readonly { actionType: string; templateId?: EntityId | null; recipientUserId?: EntityId | null; recipientEmail?: string | null; recipientPhone?: string | null; metadata?: Record<string, unknown> }[];
}): Promise<AutomationRule> {
  return callDoorRow<AutomationRule>("update_automation_rule", {
    p_id: input.id,
    p_name: input.name ?? null,
    p_description: input.description ?? null,
    p_conditions: input.conditions ? JSON.stringify(input.conditions) : null,
    p_actions: input.actions ? JSON.stringify(input.actions) : null,
  });
}

/** Enable an automation rule. */
export async function enableAutomationRule(
  ruleId: EntityId,
): Promise<void> {
  await callDoor("set_automation_rule_status", { p_rule_id: ruleId, p_status: "ACTIVE" });
}

/** Disable an automation rule. */
export async function disableAutomationRule(
  ruleId: EntityId,
): Promise<void> {
  await callDoor("set_automation_rule_status", { p_rule_id: ruleId, p_status: "INACTIVE" });
}

// =====================================================================
// Automation Execution
// =====================================================================

/** List automation executions. */
export async function listAutomationExecutions(
  organizationId: EntityId,
  options?: {
    ruleId?: EntityId;
    status?: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "SKIPPED";
    limit?: number;
  },
): Promise<AutomationExecution[]> {
  // First get the rule IDs for this organization
  const rules = await requireSupabase()
    .from(AUTOMATION_RULES_TABLE)
    .select("id")
    .eq("organization_id", organizationId);

  const ruleIds = rules.data?.map((r) => r.id) ?? [];

  if (ruleIds.length === 0) {
    return [];
  }

  let chain = requireSupabase()
    .from(AUTOMATION_EXECUTIONS_TABLE)
    .select(AUTOMATION_EXECUTION_COLUMNS)
    .in("rule_id", ruleIds)
    .order("created_at", { ascending: false });

  if (options?.ruleId) {
    chain = chain.eq("rule_id", options.ruleId);
  }
  if (options?.status) {
    chain = chain.eq("status", options.status);
  }

  chain = chain.limit(options?.limit ?? 100);

  return camelRows<AutomationExecution>(asRead(chain));
}

/** Process a domain event (find matching rules and execute actions). */
export async function processDomainEvent(
  domainEventId: EntityId,
): Promise<void> {
  await callDoor("process_domain_event", { p_domain_event_id: domainEventId });
}
