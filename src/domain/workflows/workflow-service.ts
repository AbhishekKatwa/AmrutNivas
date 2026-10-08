/**
 * Operational Workflow service (Prompt #26).
 *
 * ONE canonical service for tasks, workflows, and approvals.
 * In-memory implementation — no DB persistence yet.
 *
 * Domain safety: workflow steps never directly modify domain tables.
 * They call domain services (or record intent for a domain service to execute).
 */

import type { EntityId } from "@/domain/identity/types";
import { getWorkflowDefinition, TASK_TEMPLATES } from "./definitions";
import type {
  ApprovalDelegation,
  ApprovalFilters,
  ApprovalRequest,
  ApprovalStatus,
  OperationalSummary,
  OperationalTask,
  OperationalWorkflow,
  TaskAuditEntry,
  TaskComment,
  TaskFilters,
  TaskHandoff,
  TaskPriority,
  TaskStatus,
  TaskTemplate,
  WorkflowInstance,
  WorkflowInstanceFilters,
  WorkflowStepExecution,
  WorkflowType,
} from "./types";

// =================================================================== in-memory stores

const tasks = new Map<EntityId, OperationalTask>();
const taskComments = new Map<EntityId, TaskComment[]>();
const taskAuditLog: TaskAuditEntry[] = [];
const taskHandoffs: TaskHandoff[] = [];
const workflowInstances = new Map<EntityId, WorkflowInstance>();
const stepExecutions = new Map<EntityId, WorkflowStepExecution[]>();
const approvals = new Map<EntityId, ApprovalRequest>();
const delegations = new Map<EntityId, ApprovalDelegation>();

let _seq = 1;
function nextId(prefix: string): EntityId {
  return `${prefix}_${String(_seq++).padStart(6, "0")}`;
}

const DEMO_ORG = "org_demo";
const DEMO_PROPERTY = "prop_demo";
const DEMO_USER = "user_admin";
const DEMO_USER_NAME = "Admin User";

// =================================================================== task due status

export function deriveTaskDueStatus(task: OperationalTask): "ON_TIME" | "DUE_SOON" | "OVERDUE" | null {
  if (!task.dueAt || task.status === "COMPLETED" || task.status === "CANCELLED") return null;
  const now = Date.now();
  const due = new Date(task.dueAt).getTime();
  if (now > due) return "OVERDUE";
  if (due - now < 2 * 60 * 60 * 1000) return "DUE_SOON";
  return "ON_TIME";
}

// =================================================================== task CRUD

export function createTask(params: {
  title: string;
  description?: string;
  taskType: OperationalTask["taskType"];
  priority?: TaskPriority;
  propertyId?: EntityId;
  outletId?: EntityId;
  departmentId?: EntityId;
  assignedToEmployeeId?: EntityId;
  assignedToUserId?: EntityId;
  assignedTeam?: string;
  sourceType?: OperationalTask["sourceType"];
  sourceId?: EntityId;
  workflowInstanceId?: EntityId;
  workflowStepId?: EntityId;
  dueAt?: string;
  targetDurationMinutes?: number;
  escalationAfterMinutes?: number;
  checklist?: { label: string; order: number }[];
  createdBy?: EntityId;
}): OperationalTask {
  const now = new Date().toISOString();
  const id = nextId("task");
  const task: OperationalTask = {
    id,
    organizationId: DEMO_ORG,
    propertyId: params.propertyId ?? DEMO_PROPERTY,
    outletId: params.outletId,
    departmentId: params.departmentId,
    title: params.title,
    description: params.description,
    taskType: params.taskType,
    priority: params.priority ?? "NORMAL",
    status: params.assignedToEmployeeId || params.assignedToUserId || params.assignedTeam ? "ASSIGNED" : "PENDING",
    assignedToEmployeeId: params.assignedToEmployeeId,
    assignedToUserId: params.assignedToUserId,
    assignedTeam: params.assignedTeam,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    workflowInstanceId: params.workflowInstanceId,
    workflowStepId: params.workflowStepId,
    dueAt: params.dueAt,
    targetDurationMinutes: params.targetDurationMinutes,
    escalationAfterMinutes: params.escalationAfterMinutes,
    checklist: params.checklist?.map((c) => ({
      id: nextId("chk"),
      taskId: id,
      label: c.label,
      completed: false,
      order: c.order,
    })),
    createdBy: params.createdBy ?? DEMO_USER,
    createdAt: now,
    updatedAt: now,
  };
  tasks.set(id, task);
  addAuditEntry(id, "CREATED", params.createdBy ?? DEMO_USER, `Task "${task.title}" created`);
  return task;
}

export function getTask(taskId: EntityId): OperationalTask | undefined {
  return tasks.get(taskId);
}

export function listTasks(filters?: TaskFilters): OperationalTask[] {
  let result = Array.from(tasks.values());

  if (filters) {
    if (filters.status?.length) result = result.filter((t) => filters.status!.includes(t.status));
    if (filters.priority?.length) result = result.filter((t) => filters.priority!.includes(t.priority));
    if (filters.taskType?.length) result = result.filter((t) => filters.taskType!.includes(t.taskType));
    if (filters.departmentId) result = result.filter((t) => t.departmentId === filters.departmentId);
    if (filters.assignedToEmployeeId) result = result.filter((t) => t.assignedToEmployeeId === filters.assignedToEmployeeId);
    if (filters.assignedToUserId) result = result.filter((t) => t.assignedToUserId === filters.assignedToUserId);
    if (filters.propertyId) result = result.filter((t) => t.propertyId === filters.propertyId);
    if (filters.sourceType) result = result.filter((t) => t.sourceType === filters.sourceType);
    if (filters.overdue) result = result.filter((t) => deriveTaskDueStatus(t) === "OVERDUE");
    if (filters.blocked) result = result.filter((t) => t.status === "BLOCKED");
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter((t) => t.title.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q));
    }
  }

  return result.sort((a, b) => {
    const priorityOrder = { CRITICAL: 0, URGENT: 1, HIGH: 2, NORMAL: 3, LOW: 4 };
    const pd = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pd !== 0) return pd;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export function assignTask(taskId: EntityId, params: {
  assignedToEmployeeId?: EntityId;
  assignedToUserId?: EntityId;
  assignedTeam?: string;
  actorId: EntityId;
}): OperationalTask | undefined {
  const task = tasks.get(taskId);
  if (!task) return undefined;
  task.assignedToEmployeeId = params.assignedToEmployeeId;
  task.assignedToUserId = params.assignedToUserId;
  task.assignedTeam = params.assignedTeam;
  task.status = "ASSIGNED";
  task.updatedAt = new Date().toISOString();
  addAuditEntry(taskId, "ASSIGNED", params.actorId, "Task assigned");
  return task;
}

export function startTask(taskId: EntityId, actorId: EntityId): OperationalTask | undefined {
  const task = tasks.get(taskId);
  if (!task || task.status === "COMPLETED" || task.status === "CANCELLED") return undefined;
  task.status = "IN_PROGRESS";
  task.startedAt = new Date().toISOString();
  task.updatedAt = new Date().toISOString();
  addAuditEntry(taskId, "STARTED", actorId, "Task started");
  return task;
}

export function completeTask(taskId: EntityId, actorId: EntityId): OperationalTask | undefined {
  const task = tasks.get(taskId);
  if (!task) return undefined;
  task.status = "COMPLETED";
  task.completedAt = new Date().toISOString();
  task.updatedAt = new Date().toISOString();
  addAuditEntry(taskId, "COMPLETED", actorId, "Task completed");
  advanceWorkflowAfterTask(task);
  return task;
}

export function blockTask(taskId: EntityId, reason: string, actorId: EntityId): OperationalTask | undefined {
  const task = tasks.get(taskId);
  if (!task) return undefined;
  task.status = "BLOCKED";
  task.blockReason = reason;
  task.updatedAt = new Date().toISOString();
  addAuditEntry(taskId, "BLOCKED", actorId, `Blocked: ${reason}`);
  return task;
}

export function unblockTask(taskId: EntityId, actorId: EntityId): OperationalTask | undefined {
  const task = tasks.get(taskId);
  if (!task || task.status !== "BLOCKED") return undefined;
  task.status = "IN_PROGRESS";
  task.blockReason = undefined;
  task.updatedAt = new Date().toISOString();
  addAuditEntry(taskId, "UNBLOCKED", actorId, "Task unblocked");
  return task;
}

export function cancelTask(taskId: EntityId, actorId: EntityId): OperationalTask | undefined {
  const task = tasks.get(taskId);
  if (!task) return undefined;
  task.status = "CANCELLED";
  task.cancelledAt = new Date().toISOString();
  task.updatedAt = new Date().toISOString();
  addAuditEntry(taskId, "CANCELLED", actorId, "Task cancelled");
  return task;
}

export function reopenTask(taskId: EntityId, actorId: EntityId): OperationalTask | undefined {
  const task = tasks.get(taskId);
  if (!task || task.status !== "COMPLETED") return undefined;
  task.status = "REOPENED";
  task.completedAt = undefined;
  task.updatedAt = new Date().toISOString();
  addAuditEntry(taskId, "REOPENED", actorId, "Task reopened");
  return task;
}

export function setTaskPriority(taskId: EntityId, priority: TaskPriority, actorId: EntityId): OperationalTask | undefined {
  const task = tasks.get(taskId);
  if (!task) return undefined;
  task.priority = priority;
  task.updatedAt = new Date().toISOString();
  addAuditEntry(taskId, "PRIORITY_CHANGED", actorId, `Priority → ${priority}`);
  return task;
}

// =================================================================== task comments

export function addTaskComment(taskId: EntityId, authorId: EntityId, authorName: string, message: string): TaskComment {
  const comment: TaskComment = {
    id: nextId("tcmt"),
    taskId,
    authorId,
    authorName,
    message,
    createdAt: new Date().toISOString(),
  };
  const existing = taskComments.get(taskId) ?? [];
  existing.push(comment);
  taskComments.set(taskId, existing);
  addAuditEntry(taskId, "COMMENT", authorId, message);
  return comment;
}

export function getTaskComments(taskId: EntityId): TaskComment[] {
  return (taskComments.get(taskId) ?? []).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

// =================================================================== task checklist

export function toggleChecklistItem(taskId: EntityId, itemId: EntityId, actorId: EntityId): boolean {
  const task = tasks.get(taskId);
  if (!task?.checklist) return false;
  const item = task.checklist.find((c) => c.id === itemId);
  if (!item) return false;
  item.completed = !item.completed;
  item.completedAt = item.completed ? new Date().toISOString() : undefined;
  item.completedBy = item.completed ? actorId : undefined;
  task.updatedAt = new Date().toISOString();
  addAuditEntry(taskId, "CHECKLIST_UPDATED", actorId, `${item.completed ? "Checked" : "Unchecked"}: ${item.label}`);
  return item.completed;
}

// =================================================================== task handoff

export function handoffTask(taskId: EntityId, params: {
  fromEmployeeId?: EntityId;
  fromDepartmentId?: EntityId;
  toEmployeeId?: EntityId;
  toDepartmentId?: EntityId;
  reason: string;
  actorId: EntityId;
}): TaskHandoff | undefined {
  const task = tasks.get(taskId);
  if (!task) return undefined;

  const handoff: TaskHandoff = {
    id: nextId("tho"),
    taskId,
    fromEmployeeId: params.fromEmployeeId,
    fromDepartmentId: params.fromDepartmentId,
    toEmployeeId: params.toEmployeeId,
    toDepartmentId: params.toDepartmentId,
    reason: params.reason,
    handedOffBy: params.actorId,
    handedOffAt: new Date().toISOString(),
  };
  taskHandoffs.push(handoff);

  if (params.toEmployeeId) task.assignedToEmployeeId = params.toEmployeeId;
  if (params.toDepartmentId) task.departmentId = params.toDepartmentId;
  task.updatedAt = new Date().toISOString();

  addAuditEntry(taskId, "HANDOFF", params.actorId, `Handoff: ${params.reason}`);
  return handoff;
}

export function getTaskHandoffs(taskId: EntityId): TaskHandoff[] {
  return taskHandoffs.filter((h) => h.taskId === taskId);
}

// =================================================================== task audit

function addAuditEntry(taskId: EntityId, action: TaskAuditEntry["action"], actorId: EntityId, details?: string) {
  taskAuditLog.push({
    id: nextId("taud"),
    taskId,
    action,
    actorId,
    actorName: actorId === DEMO_USER ? DEMO_USER_NAME : actorId,
    details,
    createdAt: new Date().toISOString(),
  });
}

export function getTaskAuditLog(taskId: EntityId): TaskAuditEntry[] {
  return taskAuditLog
    .filter((e) => e.taskId === taskId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

// =================================================================== workflow instances

export function startWorkflow(params: {
  workflowType: WorkflowType;
  sourceType: OperationalWorkflow["id"] extends string ? string : never;
  sourceId: EntityId;
  sourceLabel?: string;
  propertyId?: EntityId;
  createdBy?: EntityId;
}): WorkflowInstance {
  const def = getWorkflowDefinition(params.workflowType);
  const now = new Date().toISOString();

  const existing = findExistingInstance(params.workflowType, params.sourceType as string, params.sourceId);
  if (existing && existing.status !== "COMPLETED" && existing.status !== "CANCELLED") {
    return existing;
  }

  const instance: WorkflowInstance = {
    id: nextId("wfi"),
    workflowType: params.workflowType,
    workflowDefinitionId: def.id,
    organizationId: DEMO_ORG,
    propertyId: params.propertyId ?? DEMO_PROPERTY,
    sourceType: params.sourceType as any,
    sourceId: params.sourceId,
    sourceLabel: params.sourceLabel,
    status: "IN_PROGRESS",
    currentStepId: def.steps.sort((a, b) => a.order - b.order)[0]?.id,
    startedAt: now,
    createdBy: params.createdBy ?? DEMO_USER,
    createdAt: now,
    updatedAt: now,
  };
  workflowInstances.set(instance.id, instance);

  const executions: WorkflowStepExecution[] = def.steps.map((step) => ({
    id: nextId("wse"),
    workflowInstanceId: instance.id,
    stepDefinitionId: step.id,
    stepName: step.name,
    stepType: step.stepType,
    order: step.order,
    status: step.order === def.steps.sort((a, b) => a.order - b.order)[0]?.order ? "IN_PROGRESS" : "PENDING",
    retryCount: 0,
  }));
  stepExecutions.set(instance.id, executions);

  const firstStep = executions[0];
  if (firstStep?.stepType === "TASK") {
    const stepDef = def.steps.find((s) => s.id === firstStep.stepDefinitionId);
    const dueAt = stepDef?.dueOffsetMinutes
      ? new Date(Date.now() + stepDef.dueOffsetMinutes * 60_000).toISOString()
      : undefined;
    createTask({
      title: `${def.name}: ${stepDef?.name ?? "Step 1"}`,
      taskType: stepDef?.taskType ?? "OPERATIONS",
      priority: "NORMAL",
      assignedTeam: stepDef?.assignedTeam,
      departmentId: stepDef?.assignedDepartmentId,
      sourceType: "WORKFLOW",
      sourceId: instance.id,
      workflowInstanceId: instance.id,
      workflowStepId: firstStep.id,
      dueAt,
      createdBy: params.createdBy ?? DEMO_USER,
    });
    firstStep.taskId = tasks.size > 0 ? Array.from(tasks.keys()).pop() : undefined;
  }

  return instance;
}

function findExistingInstance(workflowType: WorkflowType, sourceType: string, sourceId: EntityId): WorkflowInstance | undefined {
  return Array.from(workflowInstances.values()).find(
    (w) => w.workflowType === workflowType && w.sourceType === sourceType && w.sourceId === sourceId,
  );
}

export function getWorkflowInstance(instanceId: EntityId): WorkflowInstance | undefined {
  return workflowInstances.get(instanceId);
}

export function listWorkflowInstances(filters?: WorkflowInstanceFilters): WorkflowInstance[] {
  let result = Array.from(workflowInstances.values());
  if (filters) {
    if (filters.workflowType?.length) result = result.filter((w) => filters.workflowType!.includes(w.workflowType));
    if (filters.status?.length) result = result.filter((w) => filters.status!.includes(w.status));
    if (filters.propertyId) result = result.filter((w) => w.propertyId === filters.propertyId);
    if (filters.sourceType) result = result.filter((w) => w.sourceType === filters.sourceType);
  }
  return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getWorkflowStepExecutions(instanceId: EntityId): WorkflowStepExecution[] {
  return (stepExecutions.get(instanceId) ?? []).sort((a, b) => a.order - b.order);
}

function advanceWorkflowAfterTask(task: OperationalTask) {
  if (!task.workflowInstanceId) return;
  const instance = workflowInstances.get(task.workflowInstanceId);
  if (!instance) return;
  const executions = stepExecutions.get(instance.id) ?? [];
  const currentExec = executions.find((e) => e.stepDefinitionId === instance.currentStepId);
  if (currentExec) {
    currentExec.status = "COMPLETED";
    currentExec.completedAt = new Date().toISOString();
  }

  const sorted = [...executions].sort((a, b) => a.order - b.order);
  const nextExec = sorted.find((e) => e.status === "PENDING");
  if (nextExec) {
    instance.currentStepId = nextExec.stepDefinitionId;
    nextExec.status = "IN_PROGRESS";
    nextExec.startedAt = new Date().toISOString();
    instance.updatedAt = new Date().toISOString();
  } else {
    instance.status = "COMPLETED";
    instance.completedAt = new Date().toISOString();
    instance.updatedAt = new Date().toISOString();
  }
}

export function cancelWorkflow(instanceId: EntityId, reason: string, actorId: EntityId): WorkflowInstance | undefined {
  const instance = workflowInstances.get(instanceId);
  if (!instance) return undefined;
  instance.status = "CANCELLED";
  instance.cancelledAt = new Date().toISOString();
  instance.cancelReason = reason;
  instance.cancelledBy = actorId;
  instance.updatedAt = new Date().toISOString();
  return instance;
}

export function pauseWorkflow(instanceId: EntityId): WorkflowInstance | undefined {
  const instance = workflowInstances.get(instanceId);
  if (!instance || instance.status !== "IN_PROGRESS") return undefined;
  instance.status = "PAUSED";
  instance.updatedAt = new Date().toISOString();
  return instance;
}

export function resumeWorkflow(instanceId: EntityId): WorkflowInstance | undefined {
  const instance = workflowInstances.get(instanceId);
  if (!instance || instance.status !== "PAUSED") return undefined;
  instance.status = "IN_PROGRESS";
  instance.updatedAt = new Date().toISOString();
  return instance;
}

// =================================================================== approvals

export function createApproval(params: {
  approvalType: ApprovalRequest["approvalType"];
  title: string;
  description?: string;
  sourceType: ApprovalRequest["sourceType"];
  sourceId: EntityId;
  sourceLabel?: string;
  amount?: number;
  currency?: string;
  assignedToUserId?: EntityId;
  assignedToUserName?: string;
  assignedToRole?: string;
  expiresAt?: string;
  workflowInstanceId?: EntityId;
  taskId?: EntityId;
  requestedBy?: EntityId;
  requestedByName?: string;
}): ApprovalRequest {
  const now = new Date().toISOString();
  const approval: ApprovalRequest = {
    id: nextId("appr"),
    organizationId: DEMO_ORG,
    propertyId: DEMO_PROPERTY,
    approvalType: params.approvalType,
    title: params.title,
    description: params.description,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    sourceLabel: params.sourceLabel,
    amount: params.amount,
    currency: params.currency ?? "INR",
    status: "PENDING",
    requestedBy: params.requestedBy ?? DEMO_USER,
    requestedByName: params.requestedByName ?? DEMO_USER_NAME,
    requestedAt: now,
    assignedToUserId: params.assignedToUserId,
    assignedToUserName: params.assignedToUserName,
    assignedToRole: params.assignedToRole,
    expiresAt: params.expiresAt,
    workflowInstanceId: params.workflowInstanceId,
    taskId: params.taskId,
    createdAt: now,
    updatedAt: now,
  };
  approvals.set(approval.id, approval);
  return approval;
}

export function getApproval(approvalId: EntityId): ApprovalRequest | undefined {
  return approvals.get(approvalId);
}

export function listApprovals(filters?: ApprovalFilters): ApprovalRequest[] {
  let result = Array.from(approvals.values());
  if (filters) {
    if (filters.status?.length) result = result.filter((a) => filters.status!.includes(a.status));
    if (filters.approvalType?.length) result = result.filter((a) => filters.approvalType!.includes(a.approvalType));
    if (filters.assignedToUserId) result = result.filter((a) => a.assignedToUserId === filters.assignedToUserId);
    if (filters.propertyId) result = result.filter((a) => a.propertyId === filters.propertyId);
  }
  return result.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
}

export function approveRequest(approvalId: EntityId, params: {
  decidedBy: EntityId;
  decidedByName: string;
  reason?: string;
}): ApprovalRequest | undefined {
  return decideApproval(approvalId, "APPROVED", params);
}

export function rejectRequest(approvalId: EntityId, params: {
  decidedBy: EntityId;
  decidedByName: string;
  reason: string;
}): ApprovalRequest | undefined {
  return decideApproval(approvalId, "REJECTED", params);
}

export function requestChanges(approvalId: EntityId, params: {
  decidedBy: EntityId;
  decidedByName: string;
  reason: string;
}): ApprovalRequest | undefined {
  return decideApproval(approvalId, "CHANGES_REQUESTED", params);
}

function decideApproval(approvalId: EntityId, status: ApprovalStatus, params: {
  decidedBy: EntityId;
  decidedByName: string;
  reason?: string;
}): ApprovalRequest | undefined {
  const approval = approvals.get(approvalId);
  if (!approval || approval.status !== "PENDING") return undefined;
  approval.status = status;
  approval.decidedBy = params.decidedBy;
  approval.decidedByName = params.decidedByName;
  approval.decidedAt = new Date().toISOString();
  approval.decisionReason = params.reason;
  approval.updatedAt = new Date().toISOString();
  return approval;
}

export function delegateApproval(approvalId: EntityId, params: {
  fromUserId: EntityId;
  toUserId: EntityId;
  toUserName: string;
}): ApprovalRequest | undefined {
  const approval = approvals.get(approvalId);
  if (!approval || approval.status !== "PENDING") return undefined;
  approval.delegatedFromUserId = params.fromUserId;
  approval.delegatedToUserId = params.toUserId;
  approval.assignedToUserId = params.toUserId;
  approval.assignedToUserName = params.toUserName;
  approval.delegatedAt = new Date().toISOString();
  approval.updatedAt = new Date().toISOString();
  return approval;
}

// =================================================================== approval delegation

export function createDelegation(params: {
  fromUserId: EntityId;
  toUserId: EntityId;
  approvalTypes: ApprovalRequest["approvalType"][];
  startsAt: string;
  expiresAt: string;
  reason: string;
}): ApprovalDelegation {
  const delegation: ApprovalDelegation = {
    id: nextId("adel"),
    organizationId: DEMO_ORG,
    fromUserId: params.fromUserId,
    toUserId: params.toUserId,
    approvalTypes: params.approvalTypes,
    startsAt: params.startsAt,
    expiresAt: params.expiresAt,
    reason: params.reason,
    createdBy: params.fromUserId,
    createdAt: new Date().toISOString(),
  };
  delegations.set(delegation.id, delegation);
  return delegation;
}

export function getActiveDelegations(userId: EntityId): ApprovalDelegation[] {
  const now = Date.now();
  return Array.from(delegations.values()).filter(
    (d) =>
      d.toUserId === userId &&
      new Date(d.startsAt).getTime() <= now &&
      new Date(d.expiresAt).getTime() > now,
  );
}

// =================================================================== operational summary

export function getOperationalSummary(): OperationalSummary {
  const allTasks = Array.from(tasks.values());
  const open = allTasks.filter((t) => t.status !== "COMPLETED" && t.status !== "CANCELLED");
  const overdue = open.filter((t) => deriveTaskDueStatus(t) === "OVERDUE");
  const blocked = allTasks.filter((t) => t.status === "BLOCKED");
  const today = new Date().toISOString().slice(0, 10);
  const completedToday = allTasks.filter(
    (t) => t.status === "COMPLETED" && t.completedAt?.slice(0, 10) === today,
  );
  const pendingApprovals = Array.from(approvals.values()).filter((a) => a.status === "PENDING");
  const activeWf = Array.from(workflowInstances.values()).filter(
    (w) => w.status === "IN_PROGRESS" || w.status === "PAUSED",
  );
  const blockedWf = Array.from(workflowInstances.values()).filter((w) => w.status === "BLOCKED");

  const tasksByPriority: Record<TaskPriority, number> = { LOW: 0, NORMAL: 0, HIGH: 0, URGENT: 0, CRITICAL: 0 };
  const tasksByType: Record<string, number> = {};
  const tasksByStatus: Record<TaskStatus, number> = { PENDING: 0, ASSIGNED: 0, IN_PROGRESS: 0, BLOCKED: 0, COMPLETED: 0, CANCELLED: 0, REOPENED: 0 };

  for (const t of allTasks) {
    tasksByPriority[t.priority]++;
    tasksByType[t.taskType] = (tasksByType[t.taskType] ?? 0) + 1;
    tasksByStatus[t.status]++;
  }

  return {
    totalOpenTasks: open.length,
    overdueTasks: overdue.length,
    blockedTasks: blocked.length,
    completedToday: completedToday.length,
    pendingApprovals: pendingApprovals.length,
    activeWorkflows: activeWf.length,
    blockedWorkflows: blockedWf.length,
    tasksByPriority,
    tasksByType: tasksByType as Record<any, number>,
    tasksByStatus,
  };
}

// =================================================================== task templates

export function getTaskTemplates(): TaskTemplate[] {
  return TASK_TEMPLATES;
}

export function createTaskFromTemplate(templateId: string, overrides: {
  title?: string;
  propertyId?: EntityId;
  departmentId?: EntityId;
  assignedToEmployeeId?: EntityId;
  assignedToUserId?: EntityId;
  sourceType?: OperationalTask["sourceType"];
  sourceId?: EntityId;
  createdBy?: EntityId;
}): OperationalTask | undefined {
  const tpl = TASK_TEMPLATES.find((t) => t.id === templateId);
  if (!tpl) return undefined;

  const dueAt = tpl.defaultDueOffsetMinutes
    ? new Date(Date.now() + tpl.defaultDueOffsetMinutes * 60_000).toISOString()
    : undefined;

  return createTask({
    title: overrides.title ?? tpl.name,
    description: tpl.description,
    taskType: tpl.taskType,
    priority: tpl.defaultPriority,
    propertyId: overrides.propertyId,
    departmentId: overrides.departmentId ?? tpl.defaultDepartmentId,
    assignedToEmployeeId: overrides.assignedToEmployeeId,
    assignedToUserId: overrides.assignedToUserId,
    sourceType: overrides.sourceType,
    sourceId: overrides.sourceId,
    dueAt,
    checklist: tpl.checklist,
    createdBy: overrides.createdBy,
  });
}

// =================================================================== seed data

export function seedDemoData() {
  if (tasks.size > 0) return;

  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 120 * 60_000).toISOString();
  const thirtyMinAgo = new Date(now.getTime() - 30 * 60_000).toISOString();

  // Room turnaround workflow
  const rtWf = startWorkflow({
    workflowType: "ROOM_TURNAROUND",
    sourceType: "ROOM" as any,
    sourceId: "room_204",
    sourceLabel: "Room 204",
  });

  const rtTasks = listTasks({ sourceType: "WORKFLOW" }).filter(
    (t) => t.workflowInstanceId === rtWf.id,
  );
  if (rtTasks[0]) {
    startTask(rtTasks[0].id, DEMO_USER);
    completeTask(rtTasks[0].id, DEMO_USER);
  }

  // Overdue maintenance task
  createTask({
    title: "Fix leaking tap — Room 112",
    description: "Guest reported dripping tap in bathroom",
    taskType: "MAINTENANCE",
    priority: "HIGH",
    assignedTeam: "Maintenance",
    sourceType: "MAINTENANCE_REQUEST",
    sourceId: "mr_001",
    dueAt: thirtyMinAgo,
    createdBy: DEMO_USER,
  });

  // Blocked purchase approval
  const paWf = startWorkflow({
    workflowType: "PURCHASE_APPROVAL",
    sourceType: "PURCHASE_REQUEST" as any,
    sourceId: "pr_042",
    sourceLabel: "PR-042: Vegetables & Dairy",
  });
  const paApprovals = listApprovals();
  if (paApprovals.length === 0) {
    createApproval({
      approvalType: "PURCHASE",
      title: "Purchase Request PR-042: Vegetables & Dairy",
      description: "Weekly vegetable and dairy supply order",
      sourceType: "PURCHASE_REQUEST",
      sourceId: "pr_042",
      sourceLabel: "PR-042",
      amount: 28500,
      assignedToUserId: "user_manager",
      assignedToUserName: "Rajesh Kumar",
      assignedToRole: "FLOOR_MANAGER",
      workflowInstanceId: paWf.id,
    });
  }

  // Customer complaint workflow
  startWorkflow({
    workflowType: "CUSTOMER_COMPLAINT",
    sourceType: "COMPLAINT" as any,
    sourceId: "cmp_007",
    sourceLabel: "Noise complaint — Room 305",
  });

  // Pending expense approval
  createApproval({
    approvalType: "EXPENSE",
    title: "AC Compressor Replacement",
    description: "Replace compressor for central AC unit — Block A",
    sourceType: "SYSTEM",
    sourceId: "exp_019",
    sourceLabel: "EXP-019",
    amount: 45000,
    assignedToUserId: "user_owner",
    assignedToUserName: "Abhishek Katwa",
    assignedToRole: "OWNER",
  });

  // Overdue follow-up task
  createTask({
    title: "Payment follow-up — Trader Sharma",
    description: "Outstanding invoice #INV-2026-0087 — ₹1,24,500",
    taskType: "FOLLOW_UP",
    priority: "URGENT",
    assignedTeam: "Finance",
    sourceType: "PAYMENT",
    sourceId: "inv_0087",
    dueAt: twoHoursAgo,
    createdBy: DEMO_USER,
  });

  // Event execution workflow
  startWorkflow({
    workflowType: "EVENT_EXECUTION",
    sourceType: "EVENT" as any,
    sourceId: "evt_015",
    sourceLabel: "Wedding Reception — Hall A",
  });

  // Sample completed task
  const completedTask = createTask({
    title: "Deep clean — Banquet Hall B",
    description: "Post-event deep cleaning",
    taskType: "HOUSEKEEPING",
    priority: "NORMAL",
    assignedTeam: "Housekeeping",
    sourceType: "EVENT",
    sourceId: "evt_014",
    createdBy: DEMO_USER,
  });
  startTask(completedTask.id, DEMO_USER);
  completeTask(completedTask.id, DEMO_USER);

  // Blocked workflow (stock take waiting for approval)
  startWorkflow({
    workflowType: "STOCK_TAKE",
    sourceType: "SYSTEM" as any,
    sourceId: "stk_003",
    sourceLabel: "Monthly Godown Stock Take",
  });
}

seedDemoData();
