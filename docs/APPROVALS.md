# Approval Requests (Prompt #26)

ONE canonical approval layer for every decision that needs authorization.

## Architecture

Approvals are domain-agnostic. An `ApprovalRequest` carries an `approvalType` and optional
`sourceType`/`sourceId` linking it to the domain entity. The approval itself tracks the
requester, approver, decision and audit trail — it knows nothing about purchases, expenses
or bookings.

Approvals integrate with workflows: a workflow step of type `APPROVAL` creates an
`ApprovalRequest`, and the workflow waits until the approval is resolved before advancing.

## Approval types (11 predefined)

| Type | Description |
|------|-------------|
| PURCHASE | Purchase order above threshold |
| EXPENSE | Expense claim |
| PAYMENT | Payment above threshold |
| DISCOUNT | Discount above threshold |
| VOID | Void/reversal of a document |
| REFUND | Refund processing |
| CREDIT_NOTE | Credit note issuance |
| WRITE_OFF | Stock or debt write-off |
| PRICE_CHANGE | Menu/item price change |
| ACCESS_REQUEST | Role/permission grant |
| POLICY_EXCEPTION | Exception to a configured policy |

## Entity

```
ApprovalRequest {
  id, organizationId, propertyId?, outletId?, departmentId?
  approvalType: ApprovalType
  status: ApprovalStatus
    (PENDING → APPROVED | REJECTED | CHANGES_REQUESTED | CANCELLED | ESCALATED | DELEGATED)
  title, description?
  amount?, currency?
  requestedBy, requestedAt
  assignedTo?, assignedRole?
  decidedBy?, decidedAt?, decisionReason?
  escalationLevel?: LEVEL_1 | LEVEL_2 | LEVEL_3
  sourceType?, sourceId?, sourceLabel?
  workflowInstanceId?, workflowStepExecutionId?
}
```

## Escalation

Three escalation levels:

- `LEVEL_1` — first escalation (e.g. to senior manager)
- `LEVEL_2` — second escalation (e.g. to department head)
- `LEVEL_3` — final escalation (e.g. to owner/GM)

Escalation is triggered manually via `escalateApproval()` or automatically when an
escalation timeout expires (future: timer-based).

## Delegation

`ApprovalDelegation { id, fromUser, toUser, approvalType?, startDate, endDate, createdAt }`.

When a delegation is active, new approvals of the matching type assigned to `fromUser`
are automatically redirected to `toUser`. Created via `createDelegation()`.

## Service API

- `createApproval(input)` / `getApproval(id)` / `listApprovals(filters)`
- `approveRequest(id, userId, reason?)` / `rejectRequest(id, userId, reason?)`
- `requestChanges(id, userId, reason?)` / `cancelApproval(id, userId, reason?)`
- `delegateApproval(id, toUser, userId)` — one-off delegation for a single request
- `createDelegation(input)` / `getActiveDelegations(userId)` — standing delegation

## Permissions

| Key | Description |
|-----|-------------|
| approval.view | See approval requests |
| approval.approve | Approve a request |
| approval.reject | Reject a request |
| approval.delegate | Delegate approval authority |

## UI

- `/approvals` — ApprovalCenterPage: tabbed view (Pending, Approved, Rejected, Changes requested, All)
  with action buttons for approve/reject/request changes and a reason dialog.
