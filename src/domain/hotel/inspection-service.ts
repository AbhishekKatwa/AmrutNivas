/**
 * Inspection service (Prompt #09, migration 039).
 *
 * Two layers:
 *   1. Checklists — configurable templates with items (read-only; no doors yet).
 *   2. Room inspections — create an inspection for a room, then complete it by
 *      submitting results for each checklist item. A passing inspection on a
 *      checkout-clean task promotes the room to INSPECTED.
 */

import { requireSupabase } from "@/db/client";
import { asRead, callDoorRow, camelRows, firstCamelRow } from "@/db/rpc";
import type { EntityId } from "@/domain/identity/types";
import type {
  InspectionChecklist,
  InspectionChecklistItem,
  RoomInspection,
  RoomInspectionResult,
  InspectionResult,
} from "./types";

const CHECKLISTS = "inspection_checklists";
const CHECKLIST_ITEMS = "inspection_checklist_items";
const INSPECTIONS = "room_inspections";
const INSPECTION_RESULTS = "room_inspection_results";

const CHECKLIST_COLUMNS =
  "id, organization_id, property_id, name, description, is_active, version, " +
  "created_at, updated_at, created_by";

const CHECKLIST_ITEM_COLUMNS =
  "id, checklist_id, question, category, sort_order, is_required, created_at";

const INSPECTION_COLUMNS =
  "id, organization_id, property_id, room_id, housekeeping_task_id, checklist_id, " +
  "inspector_id, status, inspection_date, passed_at, failed_at, notes, version, " +
  "created_at, updated_at, created_by";

const INSPECTION_RESULT_COLUMNS =
  "id, inspection_id, checklist_item_id, result, note, created_at";

export type InspectionScope = {
  organizationId: EntityId;
  propertyId: EntityId;
};

/* --------------------------------------------------------------------- checklists */

/** List inspection checklists for the property. */
export async function listInspectionChecklists(
  scope: InspectionScope,
  activeOnly = true,
): Promise<InspectionChecklist[]> {
  const sb = requireSupabase();
  let chain = sb
    .from(CHECKLISTS)
    .select(CHECKLIST_COLUMNS)
    .eq("organization_id", scope.organizationId)
    .eq("property_id", scope.propertyId);

  if (activeOnly) {
    chain = chain.eq("is_active", true);
  }

  chain = chain.order("name", { ascending: true });

  return camelRows<InspectionChecklist>(asRead(chain));
}

/** Get a single checklist by ID. */
export async function getInspectionChecklist(
  scope: InspectionScope,
  checklistId: EntityId,
): Promise<InspectionChecklist | null> {
  const sb = requireSupabase();
  return firstCamelRow<InspectionChecklist>(
    asRead(
      sb
        .from(CHECKLISTS)
        .select(CHECKLIST_COLUMNS)
        .eq("id", checklistId)
        .eq("organization_id", scope.organizationId)
        .eq("property_id", scope.propertyId),
    ),
  );
}

/** List items for a checklist, ordered by sort_order. */
export async function listChecklistItems(
  checklistId: EntityId,
): Promise<InspectionChecklistItem[]> {
  const sb = requireSupabase();
  return camelRows<InspectionChecklistItem>(
    asRead(
      sb
        .from(CHECKLIST_ITEMS)
        .select(CHECKLIST_ITEM_COLUMNS)
        .eq("checklist_id", checklistId)
        .order("sort_order", { ascending: true }),
    ),
  );
}

/* --------------------------------------------------------------------- inspections */

/** List room inspections with optional filters. */
export async function listRoomInspections(
  scope: InspectionScope,
  filters: {
    roomId?: EntityId;
    status?: "PENDING" | "PASSED" | "FAILED";
    housekeepingTaskId?: EntityId;
  } = {},
): Promise<RoomInspection[]> {
  const sb = requireSupabase();
  let chain = sb
    .from(INSPECTIONS)
    .select(INSPECTION_COLUMNS)
    .eq("organization_id", scope.organizationId)
    .eq("property_id", scope.propertyId);

  if (filters.roomId) {
    chain = chain.eq("room_id", filters.roomId);
  }
  if (filters.status) {
    chain = chain.eq("status", filters.status);
  }
  if (filters.housekeepingTaskId) {
    chain = chain.eq("housekeeping_task_id", filters.housekeepingTaskId);
  }

  chain = chain.order("created_at", { ascending: false });

  return camelRows<RoomInspection>(asRead(chain));
}

/** Get a single inspection by ID. */
export async function getRoomInspection(
  scope: InspectionScope,
  inspectionId: EntityId,
): Promise<RoomInspection | null> {
  const sb = requireSupabase();
  return firstCamelRow<RoomInspection>(
    asRead(
      sb
        .from(INSPECTIONS)
        .select(INSPECTION_COLUMNS)
        .eq("id", inspectionId)
        .eq("organization_id", scope.organizationId)
        .eq("property_id", scope.propertyId),
    ),
  );
}

/** List results for an inspection. */
export async function listInspectionResults(
  inspectionId: EntityId,
): Promise<RoomInspectionResult[]> {
  const sb = requireSupabase();
  return camelRows<RoomInspectionResult>(
    asRead(
      sb
        .from(INSPECTION_RESULTS)
        .select(INSPECTION_RESULT_COLUMNS)
        .eq("inspection_id", inspectionId)
        .order("created_at", { ascending: true }),
    ),
  );
}

/** Create a new room inspection, optionally linked to a checklist and housekeeping task. */
export async function createRoomInspection(
  scope: InspectionScope,
  params: {
    roomId: EntityId;
    checklistId?: EntityId | null;
    housekeepingTaskId?: EntityId | null;
    notes?: string | null;
  },
): Promise<RoomInspection> {
  return callDoorRow<RoomInspection>("create_room_inspection", {
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_room: params.roomId,
    p_checklist_id: params.checklistId ?? null,
    p_housekeeping_task_id: params.housekeepingTaskId ?? null,
    p_notes: params.notes ?? null,
  });
}

/**
 * Complete a room inspection by submitting results for each checklist item.
 * If any required item fails, the inspection fails. A passing inspection on
 * a checkout-clean task promotes the room to INSPECTED.
 */
export async function completeRoomInspection(
  scope: InspectionScope,
  inspectionId: EntityId,
  results: Array<{
    checklistItemId: EntityId;
    result: InspectionResult;
    note?: string | null;
  }>,
  notes?: string | null,
): Promise<RoomInspection> {
  return callDoorRow<RoomInspection>("complete_room_inspection", {
    p_inspection: inspectionId,
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_results: results.map((r) => ({
      checklist_item_id: r.checklistItemId,
      result: r.result,
      note: r.note ?? null,
    })),
    p_notes: notes ?? null,
  });
}
