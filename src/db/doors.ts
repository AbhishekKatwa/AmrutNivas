/**
 * The client-callable door list — the whole write API of this product, named in
 * one place.
 *
 * PostgREST exposes every function in `public`, so this is not how the surface is
 * enforced (the schema split in 005 is). It is how the *client* is kept honest:
 * `db/doors.test.ts` compared this array against the functions actually defined in
 * `db/supabase/*.sql`, in both directions, so a door added server-side without a
 * service method — or a service method calling a door that was renamed away —
 * failed a build instead of surprising the user. That test was deleted with the
 * suite (2026-10-07, owner instruction), so this list is now kept in step by hand
 * and a drift surfaces as PostgREST's "function does not exist", on screen.
 */
export const CLIENT_DOORS = [
  // hierarchy
  "create_organization",
  "update_organization",
  "set_organization_status",
  "create_property",
  "update_property",
  "set_property_status",
  "create_outlet",
  "update_outlet",
  "set_outlet_status",
  "create_department",
  "update_department",
  "set_department_status",
  // people and access
  "invite_member",
  "accept_invitation",
  "cancel_invitation",
  "set_member_status",
  "transfer_ownership",
  "assign_role",
  "revoke_role",
  "set_property_access",
  "set_outlet_access",
  // custom roles (011) — a tenant inventing authority needs its own doors, and its
  // own anti-escalation checks, which live server-side rather than in a client list
  "create_role",
  "update_role",
  "set_role_permissions",
  "set_role_status",
  // session and permission resolution
  "set_active_context",
  "resolve_active_context",
  "my_permissions",
  // security decisions and session events (010): the non-raising access check the
  // guards pre-flight with, and the login/logout footprint the auth adapter writes
  "evaluate_access",
  "record_auth_event",
  // menu (014) — Prompt #04's first domain. `menu_snapshot` and `menu_item_current_price`
  // are reads that go through a door rather than a table because a bill line must be
  // priced from the snapshot the kitchen served, not from whatever the price row is
  // today; both are SECURITY DEFINER for that reason.
  "create_menu",
  "set_menu_status",
  "create_menu_category",
  "update_menu_category",
  "archive_menu_category",
  "reorder_menu_categories",
  "create_menu_item",
  "update_menu_item",
  "archive_menu_item",
  "set_menu_item_availability",
  "set_menu_item_price",
  "menu_item_current_price",
  "create_modifier_group",
  "update_modifier_group",
  "archive_modifier_group",
  "create_modifier",
  "update_modifier",
  "archive_modifier",
  "menu_snapshot",
  // dining areas and tables (015) — Prompt #04 §18-§22's floor. One section level and the
  // covers in it. There is deliberately no read door in this group: the floor map is a plain
  // SELECT on `dining_areas` and `restaurant_tables` under their outlet policies, and
  // `set_table_service_status` is the only operational write a person gets — OCCUPIED and
  // RESERVED are derived states (016, #08) and no door here can be asked to write them.
  "create_dining_area",
  "update_dining_area",
  "archive_dining_area",
  "reorder_dining_areas",
  "create_restaurant_table",
  "update_restaurant_table",
  "reorder_restaurant_tables",
  "archive_restaurant_table",
  "set_table_service_status",
  // orders (016) — Prompt #04 §23-§31's order lifecycle. Eight doors: create_order and
  // add_order_items build a ticket; update_order_item and void_order_item edit live lines;
  // set_order_status runs the state machine; move_order_table reassigns a DINE_IN cover;
  // order_detail and open_orders are reads that go through a door because they resolve
  // snapshots and derived status in one pass.
  "create_order",
  "add_order_items",
  "update_order_item",
  "void_order_item",
  "set_order_status",
  "move_order_table",
  "order_detail",
  "open_orders",
  // bills and payments (017) — Prompt #04 §32-§50's calculation engine and money flow.
  // open_bill snapshots totals and mints a BILL number; record_payment books money against
  // a bill (CASH/CARD/UPI/etc.); close_bill marks it fully paid; cancel_bill voids an
  // unpaid bill with a reason; bill_detail is a read door that resolves lines + payments.
  "open_bill",
  "close_bill",
  "record_payment",
  "cancel_bill",
  "bill_detail",
  // kitchen order tickets (018) — Prompt #04 §25-§26's pass. send_kot fires lines and
  // mints the slip (and, per §28, drives the order into PREPARING, which is what kills
  // CANCEL); set_order_item_fire_status is the cook ringing a line up; cancel_kot retires a
  // mis-send; reprint_kot is an audited act, not a no-op; kot_detail/open_kots are the
  // kitchen's two reads.
  "send_kot",
  "set_order_item_fire_status",
  "cancel_kot",
  "reprint_kot",
  "kot_detail",
  "open_kots",
  // the outlet's trading day (019) — one read that answers "how is tonight going": covers by
  // derived status, tickets live and by business-date status, the pass's open slips, and the
  // day's billed / collected / outstanding per currency. The sums are Postgres `numeric`
  // because contract §2 allows exactly one engine for money, including a day total.
  "restaurant_day_overview",
  // development seed only (007)
  "claim_demo_organization",
] as const;

export type DoorName = (typeof CLIENT_DOORS)[number];

export function isDoorName(value: string): value is DoorName {
  return (CLIENT_DOORS as readonly string[]).includes(value);
}
