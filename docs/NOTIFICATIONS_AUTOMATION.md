# Notification & Automation System

AMRUT NIVAAS enterprise notification and workflow automation platform.

## Architecture Overview

```
Domain Event → Automation Rule → Conditions → Actions → Notification/Communication
```

The system processes domain events produced by application modules, evaluates them against automation rules, and executes configured actions (notifications, emails, SMS, WhatsApp, tasks).

### Core Components

1. **Domain Events** — Immutable records of significant business occurrences
2. **Automation Rules** — Conditional logic that matches events and triggers actions
3. **Notification Preferences** — Per-user channel and frequency settings
4. **Templates** — Reusable message formats with variable substitution
5. **Communication Messages** — Audit trail of all outbound communications

---

## Domain Events

Domain events represent significant business occurrences that automation rules can react to.

### Event Types

Events are grouped by domain:

**Hotel Operations**
- `reservation.created` — New reservation booked
- `reservation.modified` — Reservation details changed
- `reservation.cancelled` — Reservation cancelled
- `checkin.completed` — Guest checked in
- `checkout.completed` — Guest checked out

**Restaurant Operations**
- `order.created` — New order placed
- `order.completed` — Order fulfilled
- `table.reserved` — Table reservation made

**Inventory & Procurement**
- `purchase.created` — Purchase order created
- `purchase.received` — Goods received
- `stock.low` — Stock below threshold
- `stock.expired` — Stock expired

**Finance**
- `payment.received` — Payment collected
- `payment.made` — Payment issued
- `invoice.overdue` — Invoice past due date

**HR & Staff**
- `employee.joined` — Employee onboarded
- `employee.left` — Employee departed
- `attendance.marked` — Attendance recorded
- `payroll.processed` — Payroll run completed

**Maintenance & Assets**
- `maintenance.requested` — Maintenance ticket created
- `maintenance.completed` — Maintenance completed
- `asset.broken` — Asset reported broken

**Events & Banquets**
- `event.booked` — Event/banquet booked
- `event.completed` — Event concluded

### Recording Events

Events are recorded via the `record_domain_event` door:

```typescript
import { recordDomainEvent } from "@/domain/notifications/notifications-service";

await recordDomainEvent({
  organizationId: "org_123",
  propertyId: "prop_456",
  eventType: "reservation.created",
  entityType: "reservation",
  entityId: "res_789",
  actorUserId: "user_abc",
  metadata: {
    guestName: "John Doe",
    checkInDate: "2026-10-15",
    roomType: "Deluxe",
    amount: 15000,
  },
});
```

The `metadata` field is a JSON object containing event-specific details that can be referenced in templates and rule conditions.

---

## Automation Rules

Automation rules define conditional logic that matches domain events and triggers actions.

### Rule Structure

```typescript
{
  id: "rule_123",
  organizationId: "org_123",
  propertyId: "prop_456", // Optional: null = all properties
  name: "VIP Reservation Alert",
  description: "Notify manager for reservations over ₹50,000",
  eventType: "reservation.created",
  conditions: [
    { field: "metadata.amount", operator: "GREATER_THAN", value: 50000 }
  ],
  actions: [
    {
      actionType: "CREATE_NOTIFICATION",
      templateId: "tmpl_vip_alert",
      recipientUserId: "user_manager",
    }
  ],
  status: "ACTIVE", // ACTIVE | INACTIVE
  executionCount: 42,
  lastExecutedAt: "2026-10-08T10:30:00Z",
  createdBy: "user_admin",
  createdAt: "2026-09-15T08:00:00Z",
  updatedAt: "2026-10-01T12:00:00Z"
}
```

### Conditions

Conditions filter which events trigger the rule. Multiple conditions are ANDed together.

**Operators:**
- `EQUALS` — Exact match
- `NOT_EQUALS` — Not equal
- `GREATER_THAN` — Numeric comparison
- `LESS_THAN` — Numeric comparison
- `CONTAINS` — String/array contains
- `NOT_CONTAINS` — String/array does not contain
- `STARTS_WITH` — String prefix
- `ENDS_WITH` — String suffix
- `IN` — Value in list
- `NOT_IN` — Value not in list
- `IS_NULL` — Field is null/missing
- `IS_NOT_NULL` — Field is present

**Condition Fields:**
- `entityType` — Event entity type (e.g., "reservation")
- `entityId` — Event entity ID
- `actorUserId` — User who triggered the event
- `metadata.*` — Any field in the metadata object (dot notation)

**Example Conditions:**

```typescript
// High-value reservation
{ field: "metadata.amount", operator: "GREATER_THAN", value: 50000 }

// Specific room type
{ field: "metadata.roomType", operator: "EQUALS", value: "Suite" }

// VIP guest
{ field: "metadata.isVip", operator: "EQUALS", value: true }

// Multiple conditions (ANDed)
conditions: [
  { field: "metadata.amount", operator: "GREATER_THAN", value: 50000 },
  { field: "metadata.roomType", operator: "IN", value: ["Suite", "Deluxe"] }
]
```

### Actions

Actions define what happens when a rule matches. Multiple actions are executed in order.

**Action Types:**

**CREATE_NOTIFICATION** — In-app notification
```typescript
{
  actionType: "CREATE_NOTIFICATION",
  templateId: "tmpl_vip_alert",
  recipientUserId: "user_manager",
  metadata: { priority: "high" }
}
```

**SEND_EMAIL** — Email message
```typescript
{
  actionType: "SEND_EMAIL",
  templateId: "tmpl_reservation_confirmation",
  recipientUserId: "user_guest", // or recipientEmail
  recipientEmail: "guest@example.com",
  metadata: {}
}
```

**SEND_SMS** — SMS message
```typescript
{
  actionType: "SEND_SMS",
  templateId: "tmpl_otp",
  recipientUserId: "user_guest", // or recipientPhone
  recipientPhone: "+919876543210",
  metadata: {}
}
```

**SEND_WHATSAPP** — WhatsApp message
```typescript
{
  actionType: "SEND_WHATSAPP",
  templateId: "tmpl_booking_confirmation",
  recipientUserId: "user_guest", // or recipientPhone
  recipientPhone: "+919876543210",
  metadata: {}
}
```

**CREATE_TASK** — Task assignment
```typescript
{
  actionType: "CREATE_TASK",
  templateId: "tmpl_housekeeping_alert",
  recipientUserId: "user_housekeeper",
  metadata: { dueIn: "2h", priority: "urgent" }
}
```

### Rule Execution

When a domain event is recorded:

1. System finds all ACTIVE rules matching the event type
2. Evaluates conditions against event data
3. For matching rules, executes all actions in order
4. Logs each execution in `automation_executions` table (idempotency)
5. Updates rule's `execution_count` and `last_executed_at`

**Idempotency:** Each execution is logged with `(rule_id, domain_event_id, action_index)` unique constraint, preventing duplicate actions if the event is reprocessed.

---

## Notification System

In-app notifications delivered to users via the notification center.

### Notification Structure

```typescript
{
  id: "notif_123",
  organizationId: "org_123",
  recipientUserId: "user_456",
  actorUserId: "user_789", // Who triggered it
  eventType: "reservation.created",
  title: "New VIP Reservation",
  message: "John Doe booked a Suite for ₹75,000",
  severity: "HIGH", // LOW | NORMAL | HIGH | CRITICAL
  status: "UNREAD", // UNREAD | READ | ARCHIVED
  domain: "HOTEL", // HOTEL | RESTAURANT | INVENTORY | FINANCE | HR | EVENTS
  entityType: "reservation",
  entityId: "res_abc",
  metadata: { amount: 75000, roomType: "Suite" },
  createdAt: "2026-10-08T10:30:00Z"
}
```

### Notification Center

Users access notifications via the notification center (`/notifications`):

- View all notifications with filtering (status, severity, domain)
- Mark as read/unread
- Archive notifications
- Deep link to source entity (reservation, order, etc.)
- Unread count badge in navigation

**API:**

```typescript
import {
  listNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  archiveNotification,
} from "@/domain/notifications/notifications-service";

// List notifications
const notifications = await listNotifications(organizationId, {
  status: "UNREAD",
  limit: 50,
});

// Get unread count
const count = await getUnreadNotificationCount(organizationId);

// Mark as read
await markNotificationRead(notificationId);

// Mark all as read
await markAllNotificationsRead(organizationId);

// Archive
await archiveNotification(notificationId);
```

---

## Communication Channels

Multi-channel communication system with template-based messaging.

### Channels

**IN_APP** — In-app notification (same as notification system)

**EMAIL** — Email messages
- Requires SMTP configuration in Supabase
- Subject and body from template
- Supports HTML and plain text

**SMS** — SMS messages
- Requires SMS gateway integration (Twilio, etc.)
- Body from template (plain text, 160 char limit)

**WHATSAPP** — WhatsApp messages
- Requires WhatsApp Business API integration
- Body from template (must use approved template format)

### Communication Messages

All outbound communications are logged:

```typescript
{
  id: "msg_123",
  organizationId: "org_123",
  recipientType: "CUSTOMER", // USER | CUSTOMER | SUPPLIER
  recipientId: "cust_456",
  channel: "EMAIL",
  templateId: "tmpl_confirmation",
  subject: "Reservation Confirmation",
  body: "Dear John, your reservation is confirmed...",
  status: "SENT", // QUEUED | SENDING | SENT | DELIVERED | FAILED | CANCELLED
  sentAt: "2026-10-08T10:30:00Z",
  deliveredAt: "2026-10-08T10:30:05Z",
  failedAt: null,
  errorMessage: null,
  metadata: { reservationId: "res_789" },
  createdAt: "2026-10-08T10:30:00Z"
}
```

### Communication History

View all communications via `/communications`:

- Filter by channel, status, recipient
- View message content and delivery status
- Retry failed messages
- Audit trail of all outbound messages

**API:**

```typescript
import {
  listCommunicationMessages,
  queueCommunicationMessage,
} from "@/domain/notifications/notifications-service";

// List messages
const messages = await listCommunicationMessages(organizationId, {
  channel: "EMAIL",
  status: "SENT",
  limit: 100,
});

// Queue message (manual)
await queueCommunicationMessage({
  organizationId,
  recipientType: "CUSTOMER",
  recipientId: "cust_123",
  channel: "EMAIL",
  templateId: "tmpl_confirmation",
  subject: "Reservation Confirmation",
  body: "Dear John, your reservation is confirmed...",
  scheduledAt: "2026-10-08T12:00:00Z", // Optional: schedule for later
});
```

---

## Templates

Reusable message formats with variable substitution.

### Template Structure

```typescript
{
  id: "tmpl_123",
  organizationId: "org_123", // null = system template
  eventType: "reservation.created",
  channel: "EMAIL",
  name: "Reservation Confirmation",
  subject: "Confirmation: {{reservationNumber}}",
  body: "Dear {{customerName}},\n\nYour reservation {{reservationNumber}} is confirmed for {{checkInDate}}.\n\nAmount: ₹{{amount}}\n\nThank you!",
  variables: ["customerName", "reservationNumber", "checkInDate", "amount"],
  status: "ACTIVE", // ACTIVE | INACTIVE
  createdAt: "2026-09-15T08:00:00Z",
  updatedAt: "2026-10-01T12:00:00Z"
}
```

### Template Variables

Variables use `{{variableName}}` syntax and are substituted at render time.

**Available Variables:**

From domain event metadata:
- `{{customerName}}` — Guest/customer name
- `{{reservationNumber}}` — Reservation ID
- `{{checkInDate}}` — Check-in date
- `{{checkOutDate}}` — Check-out date
- `{{amount}}` — Monetary amount
- `{{roomType}}` — Room type
- `{{orderNumber}}` — Order ID
- `{{itemName}}` — Item name
- `{{quantity}}` — Quantity
- Any custom field in event metadata

From system context:
- `{{organizationName}}` — Organization name
- `{{propertyName}}` — Property name
- `{{actorName}}` — User who triggered the event
- `{{timestamp}}` — Event timestamp

### Creating Templates

```typescript
import { createNotificationTemplate } from "@/domain/notifications/notifications-service";

await createNotificationTemplate({
  organizationId,
  eventType: "reservation.created",
  channel: "EMAIL",
  name: "VIP Reservation Alert",
  subject: "VIP Reservation: {{customerName}}",
  body: "A VIP reservation has been booked:\n\nGuest: {{customerName}}\nAmount: ₹{{amount}}\nRoom: {{roomType}}\nCheck-in: {{checkInDate}}",
  variables: ["customerName", "amount", "roomType", "checkInDate"],
});
```

---

## Notification Preferences

Per-user settings for notification delivery.

### Preference Structure

```typescript
{
  userId: "user_123",
  eventType: "reservation.created",
  inAppEnabled: true,
  emailEnabled: false,
  smsEnabled: false,
  whatsappEnabled: false,
  frequency: "IMMEDIATE", // IMMEDIATE | DAILY_DIGEST | WEEKLY_DIGEST | NONE
  quietHoursEnabled: true,
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  updatedAt: "2026-10-08T10:30:00Z"
}
```

### Preference Settings

Users configure preferences via `/notifications/preferences`:

- **Channel toggles** — Enable/disable per channel (in-app, email, SMS, WhatsApp)
- **Frequency** — Immediate, daily digest, weekly digest, or none
- **Quiet hours** — Suppress notifications during configurable time window

**API:**

```typescript
import {
  getNotificationPreferences,
  upsertNotificationPreference,
} from "@/domain/notifications/notifications-service";

// Get all preferences for current user
const preferences = await getNotificationPreferences();

// Update preference
await upsertNotificationPreference({
  eventType: "reservation.created",
  inAppEnabled: true,
  emailEnabled: true,
  smsEnabled: false,
  whatsappEnabled: false,
  frequency: "IMMEDIATE",
  quietHoursEnabled: true,
});
```

### Preference Resolution

When an automation rule creates a notification:

1. Look up user's preference for the event type
2. If no preference exists, use defaults (in-app enabled, others disabled)
3. Check channel enabled flags
4. Check frequency (queue for digest if not immediate)
5. Check quiet hours (delay if within quiet window)
6. Deliver via enabled channels

---

## Permissions

The notification system uses granular permissions:

**Notifications**
- `notifications.view` — View own notifications
- `notifications.manage` — Mark read/archive

**Preferences**
- `notifications.preference.view` — View own preferences
- `notifications.preference.manage` — Update own preferences

**Communications**
- `communications.view` — View communication history
- `communications.manage` — Queue/send messages

**Automation**
- `automation.view` — View automation rules
- `automation.create` — Create rules
- `automation.edit` — Edit rules
- `automation.delete` — Delete rules
- `automation.enable` — Enable/disable rules
- `automation.execute` — Manually trigger rules

Assign permissions via roles in the admin console.

---

## Database Schema

### Tables

**domain_events** — Immutable event log
- `id`, `organization_id`, `property_id`, `outlet_id`
- `event_type`, `entity_type`, `entity_id`
- `actor_user_id`, `metadata` (JSONB)
- `created_at`

**automation_rules** — Conditional logic
- `id`, `organization_id`, `property_id`
- `name`, `description`, `event_type`
- `conditions` (JSONB), `actions` (JSONB)
- `status`, `execution_count`, `last_executed_at`
- `created_by`, `created_at`, `updated_at`

**automation_executions** — Execution audit log
- `id`, `rule_id`, `domain_event_id`, `action_index`
- `status` (PENDING, RUNNING, SUCCESS, FAILED, SKIPPED)
- `started_at`, `completed_at`, `error_message`
- `created_at`

**notifications** — In-app notifications
- `id`, `organization_id`, `recipient_user_id`, `actor_user_id`
- `event_type`, `title`, `message`, `severity`, `status`
- `domain`, `entity_type`, `entity_id`, `metadata` (JSONB)
- `created_at`

**notification_preferences** — Per-user settings
- `user_id`, `event_type`
- `in_app_enabled`, `email_enabled`, `sms_enabled`, `whatsapp_enabled`
- `frequency`, `quiet_hours_enabled`, `quiet_hours_start`, `quiet_hours_end`
- `updated_at`

**notification_templates** — Message formats
- `id`, `organization_id`, `event_type`, `channel`
- `name`, `subject`, `body`, `variables` (JSONB array)
- `status`, `created_at`, `updated_at`

**communication_messages** — Outbound message log
- `id`, `organization_id`, `recipient_type`, `recipient_id`
- `channel`, `template_id`, `subject`, `body`
- `status`, `sent_at`, `delivered_at`, `failed_at`, `error_message`
- `metadata` (JSONB), `created_at`

### RLS Policies

All tables have row-level security enabled:

- **Read** — Users can read notifications/communications for their organization
- **Write** — Only via security-definer RPC functions (doors)
- **Company isolation** — All queries filtered by `organization_id`

---

## Door Functions

All writes go through security-definer RPC functions:

**Domain Events**
- `record_domain_event` — Record a new event and trigger automation

**Automation Rules**
- `create_automation_rule` — Create a new rule
- `update_automation_rule` — Update rule conditions/actions
- `set_automation_rule_status` — Enable/disable rule
- `delete_automation_rule` — Delete a rule
- `process_domain_event` — Manually process an event (admin)

**Notifications**
- `create_notification` — Create a notification
- `mark_notification_read` — Mark as read
- `mark_all_notifications_read` — Mark all as read for user
- `archive_notification` — Archive a notification

**Preferences**
- `upsert_notification_preference` — Create/update preference

**Templates**
- `create_notification_template` — Create a template
- `update_notification_template` — Update a template

**Communications**
- `queue_communication_message` — Queue a message for sending

---

## Examples

### Example 1: VIP Reservation Alert

**Rule:**
```typescript
{
  name: "VIP Reservation Alert",
  eventType: "reservation.created",
  conditions: [
    { field: "metadata.amount", operator: "GREATER_THAN", value: 50000 }
  ],
  actions: [
    {
      actionType: "CREATE_NOTIFICATION",
      templateId: "tmpl_vip_alert",
      recipientUserId: "user_manager",
    }
  ]
}
```

**Template:**
```typescript
{
  name: "VIP Reservation Alert",
  subject: "VIP Reservation: {{customerName}}",
  body: "A VIP reservation has been booked:\n\nGuest: {{customerName}}\nAmount: ₹{{amount}}\nRoom: {{roomType}}\nCheck-in: {{checkInDate}}"
}
```

**Event:**
```typescript
await recordDomainEvent({
  organizationId: "org_123",
  eventType: "reservation.created",
  entityType: "reservation",
  entityId: "res_789",
  metadata: {
    customerName: "John Doe",
    amount: 75000,
    roomType: "Suite",
    checkInDate: "2026-10-15",
  },
});
```

**Result:** Manager receives in-app notification with formatted message.

### Example 2: Low Stock Alert

**Rule:**
```typescript
{
  name: "Low Stock Alert",
  eventType: "stock.low",
  conditions: [
    { field: "metadata.quantity", operator: "LESS_THAN", value: 10 }
  ],
  actions: [
    {
      actionType: "CREATE_NOTIFICATION",
      recipientUserId: "user_inventory_manager",
    },
    {
      actionType: "SEND_EMAIL",
      templateId: "tmpl_low_stock",
      recipientUserId: "user_purchase_manager",
    }
  ]
}
```

**Result:** Inventory manager gets in-app notification, purchase manager gets email.

### Example 3: Reservation Confirmation

**Rule:**
```typescript
{
  name: "Send Reservation Confirmation",
  eventType: "reservation.created",
  conditions: [], // All reservations
  actions: [
    {
      actionType: "SEND_EMAIL",
      templateId: "tmpl_reservation_confirmation",
      recipientUserId: null, // Use metadata.email
      recipientEmail: "{{metadata.email}}",
    },
    {
      actionType: "SEND_SMS",
      templateId: "tmpl_reservation_sms",
      recipientPhone: "{{metadata.phone}}",
    }
  ]
}
```

**Result:** Guest receives email and SMS confirmation.

---

## Integration Guide

### Recording Events from Modules

When a module performs a significant action, record a domain event:

```typescript
// In reservation creation flow
import { recordDomainEvent } from "@/domain/notifications/notifications-service";

async function createReservation(input: CreateReservationInput) {
  // 1. Create reservation
  const reservation = await createReservationRecord(input);

  // 2. Record domain event
  await recordDomainEvent({
    organizationId: input.organizationId,
    propertyId: input.propertyId,
    eventType: "reservation.created",
    entityType: "reservation",
    entityId: reservation.id,
    actorUserId: input.createdBy,
    metadata: {
      customerName: input.guestName,
      amount: input.totalAmount,
      roomType: input.roomType,
      checkInDate: input.checkInDate,
      checkOutDate: input.checkOutDate,
    },
  });

  return reservation;
}
```

### Creating Automation Rules

Admins create rules via the UI at `/automations`:

1. Select event type
2. Define conditions (optional)
3. Define actions (one or more)
4. Choose template for each action
5. Set recipient (user, email, phone)
6. Save and enable rule

### Custom Templates

Create custom templates via the UI or API:

```typescript
await createNotificationTemplate({
  organizationId,
  eventType: "checkout.completed",
  channel: "EMAIL",
  name: "Checkout Feedback Request",
  subject: "How was your stay, {{customerName}}?",
  body: "Dear {{customerName}},\n\nThank you for staying with us! We'd love to hear about your experience.\n\nPlease take a moment to leave a review: {{reviewLink}}\n\nBest regards,\n{{propertyName}}",
  variables: ["customerName", "reviewLink", "propertyName"],
});
```

---

## Troubleshooting

### Rule Not Triggering

1. Check rule status is ACTIVE
2. Verify event type matches
3. Check conditions (test with simpler conditions)
4. View automation executions for errors

### Notification Not Delivered

1. Check user's notification preferences
2. Verify channel is enabled
3. Check quiet hours settings
4. View communication messages for delivery status

### Email/SMS Not Sending

1. Verify SMTP/SMS gateway configuration in Supabase
2. Check communication message status (FAILED?)
3. View error message in communication_messages table
4. Test with a simple template

### Performance Issues

1. Automation executions are logged for every action — prune old logs periodically
2. Large metadata objects can slow condition evaluation — keep metadata focused
3. Use property-specific rules to reduce rule scan scope

---

## Future Enhancements

- **Digest batching** — Aggregate notifications into daily/weekly digests
- **Quiet hours enforcement** — Delay delivery during configurable quiet window
- **Retry logic** — Automatic retry for failed communications
- **Template versioning** — Track template changes over time
- **A/B testing** — Test different message templates
- **Analytics** — Delivery rates, open rates, click-through rates
- **Webhook actions** — Trigger external webhooks from automation rules
- **Scheduled rules** — Time-based automation (e.g., send reminder 24h before check-in)

---

## Migration

The notification system was introduced in migration `047_notifications_automation.sql`.

**Tables created:** 7
**Door functions created:** 13
**Permissions added:** 17

To apply the migration:

```bash
cd db/supabase
psql -h <host> -U <user> -d <database> -f 047_notifications_automation.sql
```

---

## Support

For issues or questions:
- Check automation execution logs in database
- Review communication message status
- Verify RLS policies allow the operation
- Check door function permissions

---

**Version:** 1.0
**Last Updated:** 2026-10-08
**Migration:** 047_notifications_automation.sql
