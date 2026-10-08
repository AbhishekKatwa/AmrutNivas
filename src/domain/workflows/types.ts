/**
 * Operational Workflow domain types (Prompt #26).
 *
 * ONE canonical task architecture, ONE workflow architecture, ONE approval architecture.
 * Domain-specific tasks (HousekeepingTask, MaintenanceRequest, EventTask) continue to exist
 * but the operational layer provides a unified view and coordination across departments.
 *
 * Key concepts:
 *   - OperationalTask: universal task entity with source tracking (why it exists)
 *   - OperationalWorkflow: predefined multi-step business processes
 *   - WorkflowInstance: running instance of a workflow with step tracking
 *   - Approval: centralized approval requests across domains
 *   - TaskTemplate: reusable task blueprints
 *
 * Operational loop:
 *   EVENT → WORKFLOW → TASK → OWNER → ACTION → HANDOFF → APPROVAL → DOMAIN ACTION → AUDIT → NEXT
 */

import type { EntityId } from "@/domain/identity/types";

// =================================================================== task status

export type TaskStatus =
  | "PENDING"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "COMPLETED"
  | "CANCELLED"
  | "REOPENED";

export const TASK_STATUSES: readonly TaskStatus[] = [
  "PENDING",
  "ASSIGNED",
  "IN_PROGRESS",
  "BLOCKED",
  "COMPLETED",
  "CANCELLED",
  "REOPENED",
];

// =================================================================== task priority

export type TaskPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT" | "CRITICAL";

export const TASK_PRIORITIES: readonly TaskPriority[] = [
  "LOW",
  "NORMAL",
  "HIGH",
  "URGENT",
  "CRITICAL",
];

// =================================================================== task types

export type TaskType =
  | "HOUSEKEEPING"
  | "MAINTENANCE"
  | "PROCUREMENT"
  | "APPROVAL"
  | "FOLLOW_UP"
  | "EVENT"
  | "CUSTOMER_SERVICE"
  | "FINANCE"
  | "INVENTORY"
  | "HR"
  | "OPERATIONS"
  | "DOCUMENT"
  | "SUPPORT"
  | "OTHER";

export const TASK_TYPES: readonly TaskType[] = [
  "HOUSEKEEPING",
  "MAINTENANCE",
  "PROCUREMENT",
  "APPROVAL",
  "FOLLOW_UP",
  "EVENT",
  "CUSTOMER_SERVICE",
  "FINANCE",
  "INVENTORY",
  "HR",
  "OPERATIONS",
  "DOCUMENT",
  "SUPPORT",
  "OTHER",
];

// =================================================================== task source

export type TaskSource =
  | "RESERVATION"
  | "STAY"
  | "ROOM"
  | "MAINTENANCE_REQUEST"
  | "PURCHASE_REQUEST"
  | "PURCHASE_ORDER"
  | "EVENT"
  | "CUSTOMER"
  | "COMPLAINT"
  | "PAYMENT"
  | "DOCUMENT"
  | "EMPLOYEE"
  | "SUPPORT_CASE"
  | "WORKFLOW"
  | "SYSTEM"
  | "MANUAL";

export const TASK_SOURCES: readonly TaskSource[] = [
  "RESERVATION",
  "STAY",
  "ROOM",
  "MAINTENANCE_REQUEST",
  "PURCHASE_REQUEST",
  "PURCHASE_ORDER",
  "EVENT",
  "CUSTOMER",
  "COMPLAINT",
  "PAYMENT",
  "DOCUMENT",
  "EMPLOYEE",
  "SUPPORT_CASE",
  "WORKFLOW",
  "SYSTEM",
  "MANUAL",
];

// =================================================================== task due status (derived)

export type TaskDueStatus = "ON_TIME" | "DUE_SOON" | "OVERDUE";

// =================================================================== escalation level

export type EscalationLevel = "LEVEL_1" | "LEVEL_2" | "LEVEL_3";

// =================================================================== operational task

export interface OperationalTask {
  id: EntityId;
  organizationId: EntityId;
  propertyId?: EntityId;
  outletId?: EntityId;
  departmentId?: EntityId;

  title: string;
  description?: string;
  taskType: TaskType;
  priority: TaskPriority;
  status: TaskStatus;

  assignedToEmployeeId?: EntityId;
  assignedToUserId?: EntityId;
  assignedTeam?: string;

  sourceType?: TaskSource;
  sourceId?: EntityId;

  workflowInstanceId?: EntityId;
  workflowStepId?: EntityId;

  dueAt?: string;
  startedAt?: string;
  completedAt?: string;
  cancelledAt?: string;

  blockReason?: string;
  blockedByTaskId?: EntityId;

  targetDurationMinutes?: number;
  escalationAfterMinutes?: number;
  escalationLevel?: EscalationLevel;

  checklist?: TaskChecklistItem[];
  dependencies?: EntityId[];

  createdBy: EntityId;
  createdAt: string;
  updatedAt: string;
}

// =================================================================== task checklist item

export interface TaskChecklistItem {
  id: EntityId;
  taskId: EntityId;
  label: string;
  completed: boolean;
  completedAt?: string;
  completedBy?: EntityId;
  order: number;
}

// =================================================================== task comment

export interface TaskComment {
  id: EntityId;
  taskId: EntityId;
  authorId: EntityId;
  authorName: string;
  message: string;
  createdAt: string;
}

// =================================================================== task dependency

export interface TaskDependency {
  taskId: EntityId;
  dependsOnTaskId: EntityId;
  type: "FINISH_TO_START" | "START_TO_START";
}

// =================================================================== task handoff

export interface TaskHandoff {
  id: EntityId;
  taskId: EntityId;
  fromEmployeeId?: EntityId;
  fromDepartmentId?: EntityId;
  toEmployeeId?: EntityId;
  toDepartmentId?: EntityId;
  reason: string;
  handedOffBy: EntityId;
  handedOffAt: string;
}

// =================================================================== task audit entry

export interface TaskAuditEntry {
  id: EntityId;
  taskId: EntityId;
  action:
    | "CREATED"
    | "ASSIGNED"
    | "REASSIGNED"
    | "STARTED"
    | "BLOCKED"
    | "UNBLOCKED"
    | "COMPLETED"
    | "CANCELLED"
    | "REOPENED"
    | "ESCALATED"
    | "HANDOFF"
    | "COMMENT"
    | "CHECKLIST_UPDATED"
    | "PRIORITY_CHANGED"
    | "DUE_DATE_CHANGED";
  actorId: EntityId;
  actorName: string;
  details?: string;
  createdAt: string;
}

// =================================================================== task template

export interface TaskTemplate {
  id: EntityId;
  organizationId: EntityId;
  name: string;
  taskType: TaskType;
  defaultPriority: TaskPriority;
  defaultDepartmentId?: EntityId;
  defaultDueOffsetMinutes?: number;
  checklist?: { label: string; order: number }[];
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// =================================================================== workflow types

export type WorkflowType =
  | "ROOM_TURNAROUND"
  | "MAINTENANCE"
  | "PURCHASE_APPROVAL"
  | "EVENT_EXECUTION"
  | "CUSTOMER_COMPLAINT"
  | "DOCUMENT_EXPIRY"
  | "EMPLOYEE_ONBOARDING"
  | "EXPENSE_APPROVAL"
  | "STOCK_TAKE"
  | "PAYMENT_FOLLOW_UP";

export const WORKFLOW_TYPES: readonly WorkflowType[] = [
  "ROOM_TURNAROUND",
  "MAINTENANCE",
  "PURCHASE_APPROVAL",
  "EVENT_EXECUTION",
  "CUSTOMER_COMPLAINT",
  "DOCUMENT_EXPIRY",
  "EMPLOYEE_ONBOARDING",
  "EXPENSE_APPROVAL",
  "STOCK_TAKE",
  "PAYMENT_FOLLOW_UP",
];

// =================================================================== workflow status

export type WorkflowStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "COMPLETED"
  | "CANCELLED"
  | "PAUSED";

// =================================================================== workflow step type

export type WorkflowStepType =
  | "TASK"
  | "APPROVAL"
  | "NOTIFICATION"
  | "WAIT"
  | "CONDITION"
  | "DOMAIN_ACTION";

// =================================================================== workflow step status

export type WorkflowStepStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED"
  | "SKIPPED";

// =================================================================== operational workflow (definition)

export interface OperationalWorkflow {
  id: string;
  workflowType: WorkflowType;
  name: string;
  description?: string;
  steps: WorkflowStepDefinition[];
  triggerEvent?: string;
  isActive: boolean;
  organizationId?: EntityId;
  propertyId?: EntityId;
  createdAt: string;
  updatedAt: string;
}

// =================================================================== workflow step definition

export interface WorkflowStepDefinition {
  id: string;
  name: string;
  stepType: WorkflowStepType;
  order: number;
  taskType?: TaskType;
  assignedTeam?: string;
  assignedDepartmentId?: EntityId;
  dueOffsetMinutes?: number;
  isRequired: boolean;
  condition?: string;
  domainAction?: string;
}

// =================================================================== workflow instance

export interface WorkflowInstance {
  id: EntityId;
  workflowType: WorkflowType;
  workflowDefinitionId: string;
  organizationId: EntityId;
  propertyId?: EntityId;

  sourceType: TaskSource;
  sourceId: EntityId;
  sourceLabel?: string;

  status: WorkflowStatus;
  currentStepId?: string;

  startedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
  cancelledBy?: EntityId;

  createdBy: EntityId;
  createdAt: string;
  updatedAt: string;
}

// =================================================================== workflow step execution

export interface WorkflowStepExecution {
  id: EntityId;
  workflowInstanceId: EntityId;
  stepDefinitionId: string;
  stepName: string;
  stepType: WorkflowStepType;
  order: number;

  status: WorkflowStepStatus;
  taskId?: EntityId;
  approvalId?: EntityId;

  startedAt?: string;
  completedAt?: string;
  error?: string;
  retryCount: number;
}

// =================================================================== approval types

export type ApprovalType =
  | "PURCHASE"
  | "EXPENSE"
  | "DISCOUNT"
  | "REFUND"
  | "STOCK_ADJUSTMENT"
  | "EVENT_QUOTATION"
  | "LEAVE"
  | "ATTENDANCE_CORRECTION"
  | "BACKDATED_TRANSACTION"
  | "CREDIT_NOTE"
  | "OTHER";

export const APPROVAL_TYPES: readonly ApprovalType[] = [
  "PURCHASE",
  "EXPENSE",
  "DISCOUNT",
  "REFUND",
  "STOCK_ADJUSTMENT",
  "EVENT_QUOTATION",
  "LEAVE",
  "ATTENDANCE_CORRECTION",
  "BACKDATED_TRANSACTION",
  "CREDIT_NOTE",
  "OTHER",
];

// =================================================================== approval status

export type ApprovalStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CHANGES_REQUESTED"
  | "DELEGATED"
  | "EXPIRED"
  | "CANCELLED";

export const APPROVAL_STATUSES: readonly ApprovalStatus[] = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CHANGES_REQUESTED",
  "DELEGATED",
  "EXPIRED",
  "CANCELLED",
];

// =================================================================== approval request

export interface ApprovalRequest {
  id: EntityId;
  organizationId: EntityId;
  propertyId?: EntityId;

  approvalType: ApprovalType;
  title: string;
  description?: string;

  sourceType: TaskSource;
  sourceId: EntityId;
  sourceLabel?: string;

  amount?: number;
  currency?: string;

  status: ApprovalStatus;

  requestedBy: EntityId;
  requestedByName: string;
  requestedAt: string;

  assignedToUserId?: EntityId;
  assignedToUserName?: string;
  assignedToRole?: string;

  decidedBy?: EntityId;
  decidedByName?: string;
  decidedAt?: string;
  decisionReason?: string;

  delegatedToUserId?: EntityId;
  delegatedFromUserId?: EntityId;
  delegatedAt?: string;
  delegationExpiresAt?: string;

  expiresAt?: string;
  reminderSentAt?: string;
  escalationLevel?: EscalationLevel;

  workflowInstanceId?: EntityId;
  taskId?: EntityId;

  createdAt: string;
  updatedAt: string;
}

// =================================================================== approval delegation

export interface ApprovalDelegation {
  id: EntityId;
  organizationId: EntityId;
  fromUserId: EntityId;
  toUserId: EntityId;
  approvalTypes: ApprovalType[];
  startsAt: string;
  expiresAt: string;
  reason: string;
  createdBy: EntityId;
  createdAt: string;
}

// =================================================================== workflow trigger event

export type WorkflowTriggerEvent =
  | "reservation.checked_out"
  | "purchase_request.submitted"
  | "purchase_order.created"
  | "event.confirmed"
  | "complaint.created"
  | "document.expiring"
  | "employee.created"
  | "expense.created"
  | "stock_take.created"
  | "invoice.overdue"
  | "maintenance.request_created"
  | "room.status_changed"
  | "approval.requested";

// =================================================================== filter types

export interface TaskFilters {
  status?: TaskStatus[];
  priority?: TaskPriority[];
  taskType?: TaskType[];
  departmentId?: EntityId;
  assignedToEmployeeId?: EntityId;
  assignedToUserId?: EntityId;
  propertyId?: EntityId;
  sourceType?: TaskSource;
  overdue?: boolean;
  blocked?: boolean;
  search?: string;
}

export interface WorkflowInstanceFilters {
  workflowType?: WorkflowType[];
  status?: WorkflowStatus[];
  propertyId?: EntityId;
  sourceType?: TaskSource;
}

export interface ApprovalFilters {
  status?: ApprovalStatus[];
  approvalType?: ApprovalType[];
  assignedToUserId?: EntityId;
  propertyId?: EntityId;
}

// =================================================================== operational summary

export interface OperationalSummary {
  totalOpenTasks: number;
  overdueTasks: number;
  blockedTasks: number;
  completedToday: number;
  pendingApprovals: number;
  activeWorkflows: number;
  blockedWorkflows: number;
  tasksByPriority: Record<TaskPriority, number>;
  tasksByType: Record<TaskType, number>;
  tasksByStatus: Record<TaskStatus, number>;
}
