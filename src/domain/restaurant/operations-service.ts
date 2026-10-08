/**
 * Restaurant operations — stations, discounts, splits, shifts, merges, activity (020).
 *
 * This service wraps the nine doors added by migration 020:
 *   - Station CRUD: create_kitchen_station, update_kitchen_station, archive_kitchen_station
 *   - Discount: apply_order_discount
 *   - Split: split_bill_by_item
 *   - Shift: open_restaurant_shift, close_restaurant_shift
 *   - Merge: merge_tables
 *   - Activity: order_activity_timeline
 */

import { callDoor, rows, asRead } from "@/db/rpc";
import { toCamelCase, toCamelRows } from "@/db/case";
import { moneyRow } from "@/db/money-read";
import { requireSupabase } from "@/db/client";
import type { EntityId } from "@/domain/identity/types";
import type {
  KitchenStation,
  OrderDiscount,
  RestaurantShift,
  OrderActivityEvent,
  DiscountType,
  Bill,
} from "./types";

/* ---------------------------------------------------------------------- mapping */

const STATIONS = "kitchen_stations";
const DISCOUNT_MONEY = ["discountValue", "discountAmount"] as const;
const SHIFT_MONEY = ["openingCash", "closingCash"] as const;

function stationFromWire(raw: Record<string, unknown>): KitchenStation {
  return toCamelCase<KitchenStation>(raw);
}

function discountFromWire(raw: Record<string, unknown>): OrderDiscount {
  return moneyRow<OrderDiscount>(raw, DISCOUNT_MONEY);
}

function shiftFromWire(raw: Record<string, unknown>): RestaurantShift {
  return moneyRow<RestaurantShift>(raw, SHIFT_MONEY);
}

function activityFromWire(raw: Record<string, unknown>): OrderActivityEvent {
  return toCamelCase<OrderActivityEvent>(raw);
}

function billFromWire(raw: Record<string, unknown>): Bill {
  return toCamelCase<Bill>(raw);
}

/* ---------------------------------------------------------------------- stations */

export type CreateStation = {
  outletId: EntityId;
  name: string;
  code: string;
  description?: string;
  displayOrder?: number;
};

export type UpdateStation = {
  stationId: EntityId;
  name?: string;
  code?: string;
  description?: string;
  displayOrder?: number;
  expectedVersion?: number;
};

export async function listStations(outletId: EntityId): Promise<KitchenStation[]> {
  return toCamelRows<KitchenStation>(
    await rows(asRead(
      requireSupabase()
        .from(STATIONS)
        .select("*")
        .eq("outlet_id", outletId)
        .eq("status", "ACTIVE")
        .order("display_order", { ascending: true })
    ))
  );
}

export async function createStation(input: CreateStation): Promise<KitchenStation> {
  const raw = await callDoor<Record<string, unknown>>("create_kitchen_station", {
    outlet: input.outletId,
    name: input.name,
    code: input.code,
    description: input.description,
    displayOrder: input.displayOrder ?? 0,
  });
  return stationFromWire(raw);
}

export async function updateStation(input: UpdateStation): Promise<KitchenStation> {
  const raw = await callDoor<Record<string, unknown>>("update_kitchen_station", {
    station: input.stationId,
    name: input.name,
    code: input.code,
    description: input.description,
    displayOrder: input.displayOrder,
    expectedVersion: input.expectedVersion,
  });
  return stationFromWire(raw);
}

export async function archiveStation(stationId: EntityId): Promise<KitchenStation> {
  const raw = await callDoor<Record<string, unknown>>("archive_kitchen_station", {
    station: stationId,
  });
  return stationFromWire(raw);
}

/* -------------------------------------------------------------------- discounts */

export type ApplyDiscount = {
  orderId: EntityId;
  discountType: DiscountType;
  discountValue: number;
  reason: string;
  /** NULL for order-level; set for item-level. */
  itemId?: EntityId;
};

export async function applyDiscount(input: ApplyDiscount): Promise<OrderDiscount> {
  const raw = await callDoor<Record<string, unknown>>("apply_order_discount", {
    order: input.orderId,
    discountType: input.discountType,
    discountValue: input.discountValue,
    reason: input.reason,
    itemId: input.itemId,
  });
  return discountFromWire(raw);
}

/* ----------------------------------------------------------------- split bills */

export type SplitBillGroup = {
  lineIds: EntityId[];
};

export async function splitBillByItem(
  billId: EntityId,
  groups: SplitBillGroup[],
  expectedVersion?: number,
): Promise<Bill[]> {
  const rows = await callDoor<unknown[]>("split_bill_by_item", {
    bill: billId,
    splits: groups.map((g) => ({ lineIds: g.lineIds })),
    expectedVersion,
  });
  return rows.map((r) => billFromWire(r as Record<string, unknown>));
}

/* ---------------------------------------------------------------------- shifts */

export type OpenShift = {
  outletId: EntityId;
  openingCash?: number;
  businessDate?: string;
};

export type CloseShift = {
  shiftId: EntityId;
  closingCash: number;
  notes?: string;
  expectedVersion?: number;
};

export async function openShift(input: OpenShift): Promise<RestaurantShift> {
  const raw = await callDoor<Record<string, unknown>>("open_restaurant_shift", {
    outlet: input.outletId,
    openingCash: input.openingCash ?? 0,
    businessDate: input.businessDate,
  });
  return shiftFromWire(raw);
}

export async function closeShift(input: CloseShift): Promise<RestaurantShift> {
  const raw = await callDoor<Record<string, unknown>>("close_restaurant_shift", {
    shift: input.shiftId,
    closingCash: input.closingCash,
    notes: input.notes,
    expectedVersion: input.expectedVersion,
  });
  return shiftFromWire(raw);
}

/* ---------------------------------------------------------------------- merges */

export async function mergeTables(
  targetOrderId: EntityId,
  sourceOrderId: EntityId,
  reason?: string,
): Promise<Record<string, unknown>> {
  return callDoor<Record<string, unknown>>("merge_tables", {
    targetOrder: targetOrderId,
    sourceOrder: sourceOrderId,
    reason,
  });
}

/* -------------------------------------------------------------------- activity */

export async function loadOrderActivity(orderId: EntityId): Promise<OrderActivityEvent[]> {
  const rows = await callDoor<unknown[]>("order_activity_timeline", { order: orderId });
  return rows.map((r) => activityFromWire(r as Record<string, unknown>));
}
