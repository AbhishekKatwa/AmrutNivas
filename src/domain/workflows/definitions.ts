/**
 * Predefined workflow definitions (Prompt #26).
 *
 * Each workflow defines the steps, task types, and flow for a common
 * hospitality operational process. These are lightweight and deterministic —
 * no arbitrary programming logic, just ordered steps with types.
 */

import type { OperationalWorkflow, WorkflowStepDefinition, WorkflowType } from "./types";

// =================================================================== workflow catalogue

const ROOM_TURNAROUND_STEPS: WorkflowStepDefinition[] = [
  {
    id: "rt_clean",
    name: "Clean Room",
    stepType: "TASK",
    order: 1,
    taskType: "HOUSEKEEPING",
    assignedTeam: "Housekeeping",
    isRequired: true,
    dueOffsetMinutes: 30,
  },
  {
    id: "rt_inspect",
    name: "Inspect Room",
    stepType: "TASK",
    order: 2,
    taskType: "HOUSEKEEPING",
    assignedTeam: "Housekeeping",
    isRequired: true,
    dueOffsetMinutes: 10,
  },
  {
    id: "rt_verify",
    name: "Verify Ready",
    stepType: "DOMAIN_ACTION",
    order: 3,
    domainAction: "room.mark_ready",
    isRequired: true,
  },
];

const MAINTENANCE_STEPS: WorkflowStepDefinition[] = [
  {
    id: "mt_report",
    name: "Report Issue",
    stepType: "TASK",
    order: 1,
    taskType: "MAINTENANCE",
    assignedTeam: "Maintenance",
    isRequired: true,
    dueOffsetMinutes: 15,
  },
  {
    id: "mt_repair",
    name: "Complete Repair",
    stepType: "TASK",
    order: 2,
    taskType: "MAINTENANCE",
    assignedTeam: "Maintenance",
    isRequired: true,
    dueOffsetMinutes: 120,
  },
  {
    id: "mt_verify",
    name: "Verify Repair",
    stepType: "TASK",
    order: 3,
    taskType: "MAINTENANCE",
    isRequired: true,
    dueOffsetMinutes: 15,
  },
  {
    id: "mt_handoff",
    name: "Handoff to Housekeeping",
    stepType: "NOTIFICATION",
    order: 4,
    assignedTeam: "Housekeeping",
    isRequired: false,
  },
];

const PURCHASE_APPROVAL_STEPS: WorkflowStepDefinition[] = [
  {
    id: "pa_review",
    name: "Review Purchase Request",
    stepType: "APPROVAL",
    order: 1,
    taskType: "APPROVAL",
    isRequired: true,
    dueOffsetMinutes: 480,
  },
  {
    id: "pa_approve",
    name: "Manager Approval",
    stepType: "APPROVAL",
    order: 2,
    taskType: "APPROVAL",
    isRequired: true,
    dueOffsetMinutes: 480,
  },
  {
    id: "pa_convert",
    name: "Convert to Purchase Order",
    stepType: "DOMAIN_ACTION",
    order: 3,
    domainAction: "purchase_request.convert_to_order",
    isRequired: true,
  },
];

const EVENT_EXECUTION_STEPS: WorkflowStepDefinition[] = [
  {
    id: "ev_plan",
    name: "Event Planning",
    stepType: "TASK",
    order: 1,
    taskType: "EVENT",
    assignedTeam: "Events",
    isRequired: true,
    dueOffsetMinutes: 4320,
  },
  {
    id: "ev_menu",
    name: "Menu Confirmation",
    stepType: "TASK",
    order: 2,
    taskType: "EVENT",
    assignedTeam: "Kitchen",
    isRequired: true,
    dueOffsetMinutes: 2880,
  },
  {
    id: "ev_procure",
    name: "Procurement",
    stepType: "TASK",
    order: 3,
    taskType: "PROCUREMENT",
    assignedTeam: "Store",
    isRequired: true,
    dueOffsetMinutes: 1440,
  },
  {
    id: "ev_staff",
    name: "Staff Assignment",
    stepType: "TASK",
    order: 4,
    taskType: "HR",
    assignedTeam: "HR",
    isRequired: true,
    dueOffsetMinutes: 1440,
  },
  {
    id: "ev_setup",
    name: "Venue Setup",
    stepType: "TASK",
    order: 5,
    taskType: "EVENT",
    assignedTeam: "Events",
    isRequired: true,
    dueOffsetMinutes: 240,
  },
  {
    id: "ev_execute",
    name: "Event Execution",
    stepType: "TASK",
    order: 6,
    taskType: "EVENT",
    assignedTeam: "Events",
    isRequired: true,
  },
  {
    id: "ev_billing",
    name: "Final Billing",
    stepType: "DOMAIN_ACTION",
    order: 7,
    domainAction: "event.finalize_billing",
    isRequired: true,
  },
];

const CUSTOMER_COMPLAINT_STEPS: WorkflowStepDefinition[] = [
  {
    id: "cc_assign",
    name: "Assign to Customer Service",
    stepType: "TASK",
    order: 1,
    taskType: "CUSTOMER_SERVICE",
    assignedTeam: "Front Office",
    isRequired: true,
    dueOffsetMinutes: 15,
  },
  {
    id: "cc_investigate",
    name: "Investigate Issue",
    stepType: "TASK",
    order: 2,
    taskType: "CUSTOMER_SERVICE",
    isRequired: true,
    dueOffsetMinutes: 120,
  },
  {
    id: "cc_resolve",
    name: "Resolve Issue",
    stepType: "TASK",
    order: 3,
    taskType: "CUSTOMER_SERVICE",
    isRequired: true,
    dueOffsetMinutes: 240,
  },
  {
    id: "cc_followup",
    name: "Customer Follow-up",
    stepType: "TASK",
    order: 4,
    taskType: "FOLLOW_UP",
    isRequired: true,
    dueOffsetMinutes: 60,
  },
  {
    id: "cc_close",
    name: "Close Complaint",
    stepType: "DOMAIN_ACTION",
    order: 5,
    domainAction: "complaint.close",
    isRequired: true,
  },
];

const DOCUMENT_EXPIRY_STEPS: WorkflowStepDefinition[] = [
  {
    id: "de_notify",
    name: "Notify Responsible Person",
    stepType: "NOTIFICATION",
    order: 1,
    isRequired: true,
  },
  {
    id: "de_task",
    name: "Upload Replacement",
    stepType: "TASK",
    order: 2,
    taskType: "DOCUMENT",
    isRequired: true,
    dueOffsetMinutes: 4320,
  },
  {
    id: "de_verify",
    name: "Verify Document",
    stepType: "TASK",
    order: 3,
    taskType: "DOCUMENT",
    isRequired: true,
    dueOffsetMinutes: 60,
  },
];

const EMPLOYEE_ONBOARDING_STEPS: WorkflowStepDefinition[] = [
  {
    id: "eo_docs",
    name: "Collect Documents",
    stepType: "TASK",
    order: 1,
    taskType: "HR",
    assignedTeam: "HR",
    isRequired: true,
    dueOffsetMinutes: 1440,
  },
  {
    id: "eo_dept",
    name: "Department Assignment",
    stepType: "TASK",
    order: 2,
    taskType: "HR",
    assignedTeam: "HR",
    isRequired: true,
    dueOffsetMinutes: 480,
  },
  {
    id: "eo_shift",
    name: "Shift Assignment",
    stepType: "TASK",
    order: 3,
    taskType: "HR",
    assignedTeam: "HR",
    isRequired: true,
    dueOffsetMinutes: 480,
  },
  {
    id: "eo_account",
    name: "Create User Account",
    stepType: "DOMAIN_ACTION",
    order: 4,
    domainAction: "employee.create_login",
    isRequired: false,
  },
  {
    id: "eo_orient",
    name: "Orientation",
    stepType: "TASK",
    order: 5,
    taskType: "HR",
    isRequired: true,
    dueOffsetMinutes: 240,
  },
];

const EXPENSE_APPROVAL_STEPS: WorkflowStepDefinition[] = [
  {
    id: "ea_review",
    name: "Review Expense",
    stepType: "APPROVAL",
    order: 1,
    taskType: "APPROVAL",
    isRequired: true,
    dueOffsetMinutes: 480,
  },
  {
    id: "ea_approve",
    name: "Manager Approval",
    stepType: "APPROVAL",
    order: 2,
    taskType: "APPROVAL",
    isRequired: true,
    dueOffsetMinutes: 480,
  },
  {
    id: "ea_post",
    name: "Post Expense",
    stepType: "DOMAIN_ACTION",
    order: 3,
    domainAction: "finance.post_expense",
    isRequired: true,
  },
];

const STOCK_TAKE_STEPS: WorkflowStepDefinition[] = [
  {
    id: "st_assign",
    name: "Assign Counting Staff",
    stepType: "TASK",
    order: 1,
    taskType: "INVENTORY",
    assignedTeam: "Store",
    isRequired: true,
    dueOffsetMinutes: 60,
  },
  {
    id: "st_count",
    name: "Physical Count",
    stepType: "TASK",
    order: 2,
    taskType: "INVENTORY",
    assignedTeam: "Store",
    isRequired: true,
    dueOffsetMinutes: 240,
  },
  {
    id: "st_review",
    name: "Review Variance",
    stepType: "TASK",
    order: 3,
    taskType: "INVENTORY",
    isRequired: true,
    dueOffsetMinutes: 120,
  },
  {
    id: "st_approve",
    name: "Approve Adjustment",
    stepType: "APPROVAL",
    order: 4,
    taskType: "APPROVAL",
    isRequired: true,
    dueOffsetMinutes: 480,
  },
  {
    id: "st_post",
    name: "Post Adjustment",
    stepType: "DOMAIN_ACTION",
    order: 5,
    domainAction: "inventory.post_adjustment",
    isRequired: true,
  },
];

const PAYMENT_FOLLOW_UP_STEPS: WorkflowStepDefinition[] = [
  {
    id: "pf_task",
    name: "Create Follow-up Task",
    stepType: "TASK",
    order: 1,
    taskType: "FOLLOW_UP",
    assignedTeam: "Finance",
    isRequired: true,
    dueOffsetMinutes: 60,
  },
  {
    id: "pf_contact",
    name: "Contact Customer",
    stepType: "TASK",
    order: 2,
    taskType: "FOLLOW_UP",
    isRequired: true,
    dueOffsetMinutes: 240,
  },
  {
    id: "pf_verify",
    name: "Verify Payment",
    stepType: "TASK",
    order: 3,
    taskType: "FINANCE",
    assignedTeam: "Finance",
    isRequired: true,
    dueOffsetMinutes: 1440,
  },
];

// =================================================================== workflow definitions map

const WORKFLOW_DEFINITIONS: Record<WorkflowType, OperationalWorkflow> = {
  ROOM_TURNAROUND: {
    id: "wf_room_turnaround",
    workflowType: "ROOM_TURNAROUND",
    name: "Room Turnaround",
    description: "Checkout → Clean → Inspect → Ready",
    steps: ROOM_TURNAROUND_STEPS,
    triggerEvent: "reservation.checked_out",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  MAINTENANCE: {
    id: "wf_maintenance",
    workflowType: "MAINTENANCE",
    name: "Maintenance Repair",
    description: "Report → Repair → Verify → Handoff",
    steps: MAINTENANCE_STEPS,
    triggerEvent: "maintenance.request_created",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  PURCHASE_APPROVAL: {
    id: "wf_purchase_approval",
    workflowType: "PURCHASE_APPROVAL",
    name: "Purchase Approval",
    description: "Request → Review → Approve → Convert to PO",
    steps: PURCHASE_APPROVAL_STEPS,
    triggerEvent: "purchase_request.submitted",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  EVENT_EXECUTION: {
    id: "wf_event_execution",
    workflowType: "EVENT_EXECUTION",
    name: "Event Execution",
    description: "Confirmed → Planning → Menu → Procurement → Staff → Setup → Execute → Billing",
    steps: EVENT_EXECUTION_STEPS,
    triggerEvent: "event.confirmed",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  CUSTOMER_COMPLAINT: {
    id: "wf_customer_complaint",
    workflowType: "CUSTOMER_COMPLAINT",
    name: "Customer Complaint Resolution",
    description: "Complaint → Assign → Investigate → Resolve → Follow-up → Close",
    steps: CUSTOMER_COMPLAINT_STEPS,
    triggerEvent: "complaint.created",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  DOCUMENT_EXPIRY: {
    id: "wf_document_expiry",
    workflowType: "DOCUMENT_EXPIRY",
    name: "Document Expiry Renewal",
    description: "Expiring → Notify → Upload Replacement → Verify",
    steps: DOCUMENT_EXPIRY_STEPS,
    triggerEvent: "document.expiring",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  EMPLOYEE_ONBOARDING: {
    id: "wf_employee_onboarding",
    workflowType: "EMPLOYEE_ONBOARDING",
    name: "Employee Onboarding",
    description: "New Hire → Documents → Department → Shift → Account → Orientation",
    steps: EMPLOYEE_ONBOARDING_STEPS,
    triggerEvent: "employee.created",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  EXPENSE_APPROVAL: {
    id: "wf_expense_approval",
    workflowType: "EXPENSE_APPROVAL",
    name: "Expense Approval",
    description: "Expense → Review → Approve → Post",
    steps: EXPENSE_APPROVAL_STEPS,
    triggerEvent: "expense.created",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  STOCK_TAKE: {
    id: "wf_stock_take",
    workflowType: "STOCK_TAKE",
    name: "Stock Take",
    description: "Create → Assign → Count → Review → Approve → Post",
    steps: STOCK_TAKE_STEPS,
    triggerEvent: "stock_take.created",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  PAYMENT_FOLLOW_UP: {
    id: "wf_payment_follow_up",
    workflowType: "PAYMENT_FOLLOW_UP",
    name: "Payment Follow-up",
    description: "Overdue → Task → Contact → Verify Payment",
    steps: PAYMENT_FOLLOW_UP_STEPS,
    triggerEvent: "invoice.overdue",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
};

// =================================================================== accessors

export function getWorkflowDefinition(workflowType: WorkflowType): OperationalWorkflow {
  return WORKFLOW_DEFINITIONS[workflowType];
}

export function getAllWorkflowDefinitions(): OperationalWorkflow[] {
  return Object.values(WORKFLOW_DEFINITIONS);
}

export function getWorkflowSteps(workflowType: WorkflowType): WorkflowStepDefinition[] {
  return WORKFLOW_DEFINITIONS[workflowType].steps.sort((a, b) => a.order - b.order);
}

// =================================================================== task templates

import type { TaskTemplate } from "./types";

const DEMO_ORG = "org_demo";

export const TASK_TEMPLATES: TaskTemplate[] = [
  {
    id: "tpl_checkout_clean",
    organizationId: DEMO_ORG,
    name: "Checkout Cleaning",
    taskType: "HOUSEKEEPING",
    defaultPriority: "HIGH",
    defaultDueOffsetMinutes: 30,
    checklist: [
      { label: "Strip bed linen", order: 1 },
      { label: "Clean bathroom", order: 2 },
      { label: "Replace towels", order: 3 },
      { label: "Replenish toiletries", order: 4 },
      { label: "Dust and vacuum", order: 5 },
      { label: "Check AC and TV", order: 6 },
      { label: "Final inspection", order: 7 },
    ],
    description: "Standard checkout room cleaning procedure",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "tpl_new_hire",
    organizationId: DEMO_ORG,
    name: "New Employee Onboarding",
    taskType: "HR",
    defaultPriority: "NORMAL",
    defaultDueOffsetMinutes: 1440,
    checklist: [
      { label: "Collect ID documents", order: 1 },
      { label: "Issue uniform", order: 2 },
      { label: "Department introduction", order: 3 },
      { label: "Safety training", order: 4 },
      { label: "System access setup", order: 5 },
    ],
    description: "Standard new employee onboarding checklist",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "tpl_event_setup",
    organizationId: DEMO_ORG,
    name: "Event Setup",
    taskType: "EVENT",
    defaultPriority: "HIGH",
    defaultDueOffsetMinutes: 240,
    checklist: [
      { label: "Venue arrangement", order: 1 },
      { label: "AV equipment setup", order: 2 },
      { label: "Table and chair layout", order: 3 },
      { label: "Decoration", order: 4 },
      { label: "Sound check", order: 5 },
      { label: "Final walkthrough", order: 6 },
    ],
    description: "Event venue setup before function",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "tpl_purchase_approval",
    organizationId: DEMO_ORG,
    name: "Purchase Approval",
    taskType: "APPROVAL",
    defaultPriority: "NORMAL",
    defaultDueOffsetMinutes: 480,
    description: "Manager review and approval of purchase request",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "tpl_maintenance_repair",
    organizationId: DEMO_ORG,
    name: "Maintenance Repair",
    taskType: "MAINTENANCE",
    defaultPriority: "HIGH",
    defaultDueOffsetMinutes: 120,
    description: "Standard maintenance repair workflow",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "tpl_complaint_followup",
    organizationId: DEMO_ORG,
    name: "Customer Complaint Follow-up",
    taskType: "CUSTOMER_SERVICE",
    defaultPriority: "URGENT",
    defaultDueOffsetMinutes: 240,
    checklist: [
      { label: "Acknowledge complaint", order: 1 },
      { label: "Investigate root cause", order: 2 },
      { label: "Resolve issue", order: 3 },
      { label: "Contact customer", order: 4 },
      { label: "Document resolution", order: 5 },
    ],
    description: "Customer complaint resolution and follow-up",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export function getTaskTemplate(templateId: string): TaskTemplate | undefined {
  return TASK_TEMPLATES.find((t) => t.id === templateId);
}

export function getActiveTaskTemplates(): TaskTemplate[] {
  return TASK_TEMPLATES.filter((t) => t.isActive);
}
