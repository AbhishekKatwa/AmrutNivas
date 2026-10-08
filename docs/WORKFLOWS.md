# Operational Workflows (Prompt #26)

ONE canonical workflow engine for multi-step operational processes.

## Architecture

Workflows are NOT Temporal, Kafka, BPMN or any external engine. They are a lightweight
in-memory step executor that:

1. Defines a sequence of steps (from a `WorkflowDefinition`)
2. Tracks execution state per instance (`WorkflowInstance` + `WorkflowStepExecution[]`)
3. Auto-advances when tasks complete (via `advanceWorkflowAfterTask()`)
4. Enforces idempotency via `(workflowType, sourceType, sourceId)` unique key

Domain safety: workflow steps never directly modify domain tables. A DOMAIN_ACTION step
records intent; the actual domain mutation happens when a domain service processes it.

## Workflow types (10 predefined)

| Type | Steps |
|------|-------|
| ROOM_TURNAROUND | Inspect → Clean → Inspect Clean → Ready |
| MAINTENANCE | Report → Assess → Repair → Verify → Close |
| PURCHASE_APPROVAL | Request → Manager Approval → Finance approval → PO |
| EVENT_EXECUTION | Setup → Registration → Service → Breakdown → Debrief |
| CUSTOMER_COMPLAINT | Acknowledge → Investigate → Resolve → Follow up |
| DOCUMENT_EXPIRY | Detect → Notify → Renew → Verify |
| EMPLOYEE_ONBOARDING | Documents → IT Setup → Orientation → Training → Probation |
| EXPENSE_APPROVAL | Submit → Manager review → Finance review → Approve/Reject |
| STOCK_TAKE | Schedule → Count → Reconcile → Adjust → Approve |
| PAYMENT_FOLLOW_UP | Detect overdue → Reminder → Escalate → Resolve |

## Entities

```
OperationalWorkflow (definition) {
  type: WorkflowType
  name, description
  steps: WorkflowStepDefinition[]
}

WorkflowStepDefinition {
  order, stepType, name, description?
  assignedRole?, assignedTeam?
  slaMinutes?, escalationMinutes?
}

WorkflowInstance {
  id, organizationId, propertyId, outletId?, departmentId?
  workflowType, sourceType, sourceId, sourceLabel?
  status: WorkflowStatus (PENDING → RUNNING → PAUSED → COMPLETED → CANCELLED → FAILED)
  currentStepOrder
  steps: WorkflowStepExecution[]
  startedBy, startedAt, completedAt?
}

WorkflowStepExecution {
  id, stepOrder, stepType, name
  status: WorkflowStepStatus (PENDING → ACTIVE → COMPLETED → SKIPPED → FAILED)
  assignedTo?, assignedTeam?
  taskId?, approvalId?
  startedAt?, completedAt?
  notes?
}
```

## Step types

| Type | Purpose |
|------|---------|
| TASK | Creates an OperationalTask; workflow waits for completion |
| APPROVAL | Creates an ApprovalRequest; workflow waits for decision |
| NOTIFICATION | Sends a notification (via notifications service) |
| WAIT | Pauses until an external event or timeout |
| CONDITION | Branches based on a predicate |
| DOMAIN_ACTION | Records intent for a domain service to execute |

## Idempotency

`startWorkflow()` checks for an existing active instance with the same
`(workflowType, sourceType, sourceId)` tuple. If found, it returns the existing instance
instead of creating a duplicate. This prevents double-firing when multiple events
trigger the same workflow.

## Service API

- `startWorkflow(input)` — idempotent; returns existing if active instance found
- `getWorkflowInstance(id)` / `listWorkflowInstances(filters)`
- `getWorkflowStepExecutions(instanceId)`
- `cancelWorkflow(id, userId, reason?)` / `pauseWorkflow(id, userId)` / `resumeWorkflow(id, userId)`
- `advanceWorkflowAfterTask(taskId)` — called by task completion to move workflow forward

## Permissions

| Key | Description |
|-----|-------------|
| workflow.view | See workflow instances |
| workflow.manage | Pause/resume/cancel workflows |
| workflow.create | Start new workflow instances |

## UI

Workflow instances are visible on the Operations Task Board (`/operations/tasks`) when
tasks are linked to a workflow. The task board shows workflow context on each task card.
