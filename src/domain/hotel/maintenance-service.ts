/**
 * Maintenance request service (Prompt #09, migration 039).
 *
 * State machine: OPEN → ASSIGNED → IN_PROGRESS → RESOLVED → VERIFIED → CLOSED.
 * Also supports ON_HOLD and CANCELLED branches. High-priority requests may
 * set the room to OUT_OF_ORDER; closing returns it to ACTIVE.
 */

import { requireSupabase } from "@/db/client";
import { asRead, callDoor, callDoorRow, camelRows, firstCamelRow } from "@/db/rpc";
import type { EntityId } from "@/domain/identity/types";
import type {
  MaintenanceRequest,
  MaintenanceCategory,
  MaintenancePriority,
  MaintenanceStatus,
  MaintenanceSource,
} from "./types";

const MAINTENANCE_REQUESTS = "maintenance_requests";

const REQUEST_COLUMNS =
  "id, organization_id, property_id, room_id, outlet_id, asset_id, category, priority, " +
  "status, source, title, description, reported_by, assigned_to, assigned_vendor_id, " +
  "estimated_cost, actual_cost, reported_at, assigned_at, started_at, resolved_at, " +
  "resolved_by, verified_at, verified_by, verification_notes, closed_at, closed_by, " +
  "resolution, notes, version, created_at, updated_at, created_by";

export type MaintenanceScope = {
  organizationId: EntityId;
  propertyId: EntityId;
};

export type MaintenanceFilters = {
  status?: MaintenanceStatus;
  roomId?: EntityId;
  assignedTo?: EntityId | null;
  category?: MaintenanceCategory;
  priority?: MaintenancePriority;
};

/** List maintenance requests with optional filters. */
export async function listMaintenanceRequests(
  scope: MaintenanceScope,
  filters: MaintenanceFilters = {},
): Promise<MaintenanceRequest[]> {
  const sb = requireSupabase();
  let chain = sb
    .from(MAINTENANCE_REQUESTS)
    .select(REQUEST_COLUMNS)
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
  if (filters.category) {
    chain = chain.eq("category", filters.category);
  }
  if (filters.priority) {
    chain = chain.eq("priority", filters.priority);
  }

  chain = chain.order("created_at", { ascending: false });

  return camelRows<MaintenanceRequest>(asRead(chain));
}

/** Get a single maintenance request by ID. */
export async function getMaintenanceRequest(
  scope: MaintenanceScope,
  requestId: EntityId,
): Promise<MaintenanceRequest | null> {
  const sb = requireSupabase();
  return firstCamelRow<MaintenanceRequest>(
    asRead(
      sb
        .from(MAINTENANCE_REQUESTS)
        .select(REQUEST_COLUMNS)
        .eq("id", requestId)
        .eq("organization_id", scope.organizationId)
        .eq("property_id", scope.propertyId),
    ),
  );
}

/** Create a new maintenance request. High/urgent/emergency may set room OUT_OF_ORDER. */
export async function createMaintenanceRequest(
  scope: MaintenanceScope,
  params: {
    roomId?: EntityId | null;
    outletId?: EntityId | null;
    assetId?: EntityId | null;
    category: MaintenanceCategory;
    priority?: MaintenancePriority;
    source?: MaintenanceSource;
    title: string;
    description?: string | null;
    estimatedCost?: number | null;
    notes?: string | null;
  },
): Promise<MaintenanceRequest> {
  return callDoorRow<MaintenanceRequest>("create_maintenance_request", {
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_room: params.roomId ?? null,
    p_outlet: params.outletId ?? null,
    p_asset: params.assetId ?? null,
    p_category: params.category,
    p_priority: params.priority ?? "NORMAL",
    p_source: params.source ?? "OTHER",
    p_title: params.title,
    p_description: params.description ?? null,
    p_estimated_cost: params.estimatedCost ?? null,
    p_notes: params.notes ?? null,
  });
}

/** Assign a request to a technician or vendor (OPEN → ASSIGNED). */
export async function assignMaintenanceRequest(
  scope: MaintenanceScope,
  requestId: EntityId,
  assignedTo: EntityId | null,
  assignedVendorId: EntityId | null,
  expectedVersion: number,
): Promise<MaintenanceRequest> {
  return callDoorRow<MaintenanceRequest>("assign_maintenance_request", {
    p_request: requestId,
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_assigned_to: assignedTo ?? null,
    p_assigned_vendor_id: assignedVendorId ?? null,
    p_expected_version: expectedVersion,
  });
}

/** Start work on a request (ASSIGNED → IN_PROGRESS). */
export async function startMaintenanceRequest(
  scope: MaintenanceScope,
  requestId: EntityId,
  expectedVersion: number,
): Promise<MaintenanceRequest> {
  return callDoorRow<MaintenanceRequest>("start_maintenance_request", {
    p_request: requestId,
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_expected_version: expectedVersion,
  });
}

/** Resolve a request (IN_PROGRESS → RESOLVED). */
export async function resolveMaintenanceRequest(
  scope: MaintenanceScope,
  requestId: EntityId,
  resolution: string,
  actualCost: number | null,
  expectedVersion: number,
): Promise<MaintenanceRequest> {
  return callDoorRow<MaintenanceRequest>("resolve_maintenance_request", {
    p_request: requestId,
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_resolution: resolution,
    p_actual_cost: actualCost ?? null,
    p_expected_version: expectedVersion,
  });
}

/** Verify a resolved request (RESOLVED → VERIFIED). */
export async function verifyMaintenanceRequest(
  scope: MaintenanceScope,
  requestId: EntityId,
  verificationNotes: string | null,
  expectedVersion: number,
): Promise<MaintenanceRequest> {
  return callDoorRow<MaintenanceRequest>("verify_maintenance_request", {
    p_request: requestId,
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_verification_notes: verificationNotes ?? null,
    p_expected_version: expectedVersion,
  });
}

/** Close a verified request (VERIFIED → CLOSED). May release room from OUT_OF_ORDER. */
export async function closeMaintenanceRequest(
  scope: MaintenanceScope,
  requestId: EntityId,
  expectedVersion: number,
): Promise<MaintenanceRequest> {
  return callDoorRow<MaintenanceRequest>("close_maintenance_request", {
    p_request: requestId,
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_expected_version: expectedVersion,
  });
}

/** Cancel a request (non-terminal → CANCELLED). */
export async function cancelMaintenanceRequest(
  scope: MaintenanceScope,
  requestId: EntityId,
  reason: string | null,
  expectedVersion: number,
): Promise<void> {
  await callDoor("cancel_maintenance_request", {
    p_request: requestId,
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_reason: reason ?? null,
    p_expected_version: expectedVersion,
  });
}

/** Put a request on hold (IN_PROGRESS → ON_HOLD). */
export async function putMaintenanceOnHold(
  scope: MaintenanceScope,
  requestId: EntityId,
  reason: string,
  expectedVersion: number,
): Promise<MaintenanceRequest> {
  return callDoorRow<MaintenanceRequest>("put_maintenance_on_hold", {
    p_request: requestId,
    p_organization: scope.organizationId,
    p_property: scope.propertyId,
    p_reason: reason,
    p_expected_version: expectedVersion,
  });
}
