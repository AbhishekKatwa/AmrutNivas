/**
 * Housekeeping task service (Prompt #09, migration 039).
 *
 * State machine: PENDING → ASSIGNED → IN_PROGRESS → COMPLETED → VERIFIED.
 * Check-out auto-creates a CHECKOUT_CLEAN task; completing a task updates
 * the room's housekeeping status.
 */

import { requireSupabase } from "@/db/client";
import { asRead, callDoor, callDoorRow, camelRows, firstCamelRow } from "@/db/rpc";
import type { EntityId } from "@/domain/identity/types";
import type {
  HousekeepingTask,
  HousekeepingTaskType,
  HousekeepingPriority,
  HousekeepingTaskStatus,
} from "./types";

const HOUSEKEEPING_TASKS = "housekeeping_tasks";

const TASK_COLUMNS =
  "id, organization_id, property_id, room_id, stay_id, task_type, priority, status, " +
  "assigned_to, started_at, completed_at, verified_at, verified_by, notes, version, " +
  "created_at, updated_at, created_by";

export type HousekeepingScope = {
  organizationId: EntityId;
  propertyId: EntityId;
};

export type HousekeepingTaskFilters = {
  status?: HousekeepingTaskStatus;
  roomId?: EntityId;
  assignedTo?: EntityId | null;
  taskType?: HousekeepingTaskType;
};

/** List housekeeping tasks with optional filters. */
export async function listHousekeepingTasks(
  scope: HousekeepingScope,
  filters: HousekeepingTaskFilters = {},
): Promise<HousekeepingTask[]> {
  const sb = requireSupabase();
  let chain = sb
    .from(HOUSEKEEPING_TASKS)
    .select(TASK_COLUMNS)
    .eq("organization_id", scope.organizationId)
    .eq("property_id", scope.propertyId);

  if (filters.status) {
    chain = chain.eq("status", filters.status);
  }
  if (filters.roomId) {
    chain = chain.eq("room_id", filters.roomId);
  }
  if (filters.assignedTo !== undefined) {
    if (filters.assignedTo === null) {
      chain = chain.is("assigned_to", null);
    } else {
      chain = chain.eq("assigned_to", filters.assignedTo);
    }
  }
  if (filters.taskType) {
    chain = chain.eq("task_type", filters.taskType);
  }

  chain = chain.order("created_at", { ascending: false });

  return camelRows<HousekeepingTask>(asRead(chain));
}

/** Get a single housekeeping task by ID. */
export async function getHousekeepingTask(
  scope: HousekeepingScope,
  taskId: EntityId,
): Promise<HousekeepingTask | null> {
  const sb = requireSupabase();
  return firstCamelRow<HousekeepingTask>(
    asRead(
      sb
        .from(HOUSEKEEPING_TASKS)
        .select(TASK_COLUMNS)
        .eq("id", taskId)
        .eq("organization_id", scope.organizationId)
        .eq("property_id", scope.propertyId),
    ),
  );
}

/** Create a new housekeeping task. */
export async function createHousekeepingTask(
  scope: HousekeepingScope,
  params: {
    roomId: EntityId;
    stayId?: EntityId | null;
    taskType: HousekeepingTaskType;
    priority?: HousekeepingPriority;
    notes?: string | null;
  },
): Promise<HousekeepingTask> {
  return callDoorRow<HousekeepingTask>("create_housekeeping_task", {
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_room: params.roomId,
    p_stay_id: params.stayId ?? null,
    p_task_type: params.taskType,
    p_priority: params.priority ?? "NORMAL",
    p_notes: params.notes ?? null,
  });
}

/** Assign a task to a staff member (PENDING → ASSIGNED). */
export async function assignHousekeepingTask(
  scope: HousekeepingScope,
  taskId: EntityId,
  assignedTo: EntityId,
  expectedVersion: number,
): Promise<HousekeepingTask> {
  return callDoorRow<HousekeepingTask>("assign_housekeeping_task", {
    p_task: taskId,
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_assigned_to: assignedTo,
    p_expected_version: expectedVersion,
  });
}

/** Start working on a task (ASSIGNED → IN_PROGRESS). */
export async function startHousekeepingTask(
  scope: HousekeepingScope,
  taskId: EntityId,
  expectedVersion: number,
): Promise<HousekeepingTask> {
  return callDoorRow<HousekeepingTask>("start_housekeeping_task", {
    p_task: taskId,
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_expected_version: expectedVersion,
  });
}

/** Complete a task (IN_PROGRESS → COMPLETED). Updates room housekeeping status. */
export async function completeHousekeepingTask(
  scope: HousekeepingScope,
  taskId: EntityId,
  expectedVersion: number,
): Promise<HousekeepingTask> {
  return callDoorRow<HousekeepingTask>("complete_housekeeping_task", {
    p_task: taskId,
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_expected_version: expectedVersion,
  });
}

/** Verify a completed task (COMPLETED → VERIFIED). Sets room to INSPECTED for checkout cleans. */
export async function verifyHousekeepingTask(
  scope: HousekeepingScope,
  taskId: EntityId,
  expectedVersion: number,
): Promise<HousekeepingTask> {
  return callDoorRow<HousekeepingTask>("verify_housekeeping_task", {
    p_task: taskId,
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_expected_version: expectedVersion,
  });
}

/** Cancel a task (any non-terminal → CANCELLED). */
export async function cancelHousekeepingTask(
  scope: HousekeepingScope,
  taskId: EntityId,
  reason: string | null,
  expectedVersion: number,
): Promise<void> {
  await callDoor("cancel_housekeeping_task", {
    p_task: taskId,
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_reason: reason ?? null,
    p_expected_version: expectedVersion,
  });
}
