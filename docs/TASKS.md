# Operational Tasks (Prompt #26)

ONE canonical task overlay for every operational unit of work across the platform.

## Architecture

Tasks are domain-agnostic. A `OperationalTask` carries a `sourceType` and `sourceId` that
point back to the domain entity that spawned it (a maintenance request, a housekeeping
turnover, a guest complaint, a workflow step). The task itself knows nothing about rooms,
kitchens or events — it tracks assignment, priority, due status, checklists and audit.

Domain-specific task types (EventTask, HousekeepingTask, etc.) do NOT exist. The canonical
`OperationalTask` with its `taskType` discriminator replaces them all.

## Entity

```
OperationalTask {
  id, organizationId, propertyId, outletId?, departmentId?
  title, description?
  taskType: TaskType (14 values)
  priority: TaskPriority (LOW | NORMAL | HIGH | URGENT | CRITICAL)
  status: TaskStatus (PENDING → ASSIGNED → IN_PROGRESS → BLOCKED → COMPLETED → CANCELLED, optional REOPENED)
  assignedTo?, assignedTeam?
  dueAt?, completedAt?
  sourceType, sourceId, sourceLabel?
  workflowInstanceId?
  checklist: TaskChecklistItem[]
  dependencies: TaskDependency[]
  estimatedMinutes?, actualMinutes?
  createdBy, createdAt, updatedAt
}
```

## Lifecycle

| From | To | Action | Who |
|------|----|--------|-----|
| PENDING | ASSIGNED | assignTask | task.assign |
| ASSIGNED | IN_PROGRESS | startTask | assignee |
| IN_PROGRESS | BLOCKED | blockTask | assignee |
| BLOCKED | IN_PROGRESS | unblockTask | task.assign |
| IN_PROGRESS | COMPLETED | completeTask | assignee |
| any active | CANCELLED | cancelTask | task.cancel |
| COMPLETED | IN_PROGRESS | reopenTask | task.assign |

## Due status (derived, never stored)

- `ON_TIME` — dueAt is set and > 2 hours away
- `DUE_SOON` — dueAt is within 2 hours
- `OVERDUE` — dueAt is in the past and task is not complete/cancelled

## Checklist

Each task may carry a list of `TaskChecklistItem { id, label, completed, completedAt?, completedBy? }`.
Toggling is via `toggleChecklistItem(taskId, itemId, userId)`.

## Comments

`TaskComment { id, taskId, body, createdBy, createdAt }`. Added via `addTaskComment()`.

## Dependencies

`TaskDependency { id, taskId, dependsOnTaskId, type: "FINISH_TO_START" }`.
A task with unmet dependencies shows a blocked indicator.

## Handoffs

`TaskHandoff { id, taskId, fromUser, toUser, reason, createdAt }`.
Created when `handoffTask()` transfers ownership.

## Audit trail

Every status transition, assignment change, priority change and comment is recorded as a
`TaskAuditEntry { id, taskId, action, actorId, actorName, details?, createdAt }`.

## Task templates

Six predefined templates in `definitions.ts`:

1. Checkout Cleaning (HOUSEKEEPING)
2. New Employee Onboarding (ONBOARDING)
3. Event Setup (EVENT_SETUP)
4. Purchase Approval (PROCUREMENT)
5. Maintenance Repair (MAINTENANCE)
6. Customer Complaint Follow-up (GUEST_RECOVERY)

Create a task from a template via `createTaskFromTemplate(templateId, overrides)`.

## Service API

All operations are in `workflow-service.ts`:

- `createTask(input)` / `getTask(id)` / `listTasks(filters)`
- `assignTask(id, userId, userName?)` / `startTask(id, userId)` / `completeTask(id, userId)`
- `blockTask(id, userId, reason?)` / `unblockTask(id, userId)`
- `cancelTask(id, userId, reason?)` / `reopenTask(id, userId)`
- `setTaskPriority(id, priority, userId)`
- `addTaskComment(taskId, body, userId)` / `getTaskComments(taskId)`
- `toggleChecklistItem(taskId, itemId, userId)`
- `handoffTask(taskId, toUser, reason, userId)` / `getTaskHandoffs(taskId)`
- `getTaskAuditLog(taskId)`

## Permissions

| Key | Description |
|-----|-------------|
| task.view | See tasks |
| task.create | Create new tasks |
| task.assign | Assign/reassign tasks |
| task.start | Start an assigned task |
| task.complete | Complete a task |
| task.cancel | Cancel a task |
| task.reassign | Reassign to another person |

## UI

- `/operations/tasks` — OperationsTaskBoard: kanban-style task board with filters
- `/my-work` — MyWorkPage: personal view grouped by urgency
