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
  // restaurant operations (020) — Prompt #05's kitchen stations, discounts, splits,
  // shifts, table merges and activity timeline. Station doors manage the physical work
  // areas; send_kot now routes by station; discounts are audited events; bills split
  // three ways; shifts track cash per operator per day; merges combine orders.
  "create_kitchen_station",
  "update_kitchen_station",
  "archive_kitchen_station",
  "apply_order_discount",
  "split_bill_by_item",
  "open_restaurant_shift",
  "close_restaurant_shift",
  "merge_tables",
  "order_activity_timeline",
  // development seed only (007)
  "claim_demo_organization",
  // inventory master data (023) — units of measure, categories, items, locations.
  // All writes are doors; reads are plain SELECTs under RLS.
  "create_unit",
  "update_unit",
  "archive_unit",
  "create_unit_conversion",
  "create_inventory_category",
  "update_inventory_category",
  "archive_inventory_category",
  "create_inventory_item",
  "update_inventory_item",
  "set_inventory_item_status",
  "create_inventory_location",
  "update_inventory_location",
  "archive_inventory_location",
  // stock ledger and operations (024, 025, 026) — immutable ledger, weighted average
  // costing, recipes, wastage, adjustments, transfers, stock takes, consumption.
  "post_stock_movement",
  "reverse_stock_movement",
  "record_wastage",
  "record_adjustment",
  "record_transfer",
  "create_stock_take",
  "post_stock_take",
  "create_recipe",
  "activate_recipe_version",
  "calculate_recipe_cost",
  "set_opening_stock",
  "consume_for_order",
  // supplier master data (028) — suppliers, contacts, addresses, supplier-item links,
  // price history. All writes through doors; reads under RLS.
  "create_supplier",
  "update_supplier",
  "archive_supplier",
  "set_supplier_status",
  "create_supplier_contact",
  "update_supplier_contact",
  "delete_supplier_contact",
  "create_supplier_address",
  "update_supplier_address",
  "delete_supplier_address",
  "create_supplier_item",
  "update_supplier_item",
  "record_supplier_price",
  // purchase requests and orders (029) — requisitions, POs with state machine,
  // line items, charges (freight/transport/etc).
  "create_purchase_request",
  "add_purchase_request_items",
  "set_purchase_request_status",
  "create_purchase_order",
  "add_purchase_order_items",
  "add_purchase_charge",
  "set_purchase_order_status",
  "recalculate_purchase_order_totals",
  // goods receipt (030) — physical receipt against PO, posts RECEIPT to stock ledger.
  "create_goods_receipt",
  "add_goods_receipt_items",
  "post_goods_receipt",
  "cancel_goods_receipt",
  // purchase invoices, payments & returns (031) — supplier billing, payment allocation,
  // purchase returns (post RETURN to stock ledger).
  "create_purchase_invoice",
  "add_purchase_invoice_items",
  "set_purchase_invoice_status",
  "record_supplier_payment",
  "allocate_payment_to_invoice",
  "create_purchase_return",
  "post_purchase_return",
  // hotel guest management (033) — guests and their identity documents.
  // PII protection: document numbers never appear in audit metadata.
  "create_guest",
  "update_guest",
  "archive_guest",
  "create_guest_document",
  "update_guest_document",
  "delete_guest_document",
  // hotel room types, rooms, amenities & blocks (034) — physical inventory.
  // Two orthogonal statuses on rooms: operational_status and housekeeping_status.
  "create_room_type",
  "update_room_type",
  "archive_room_type",
  "create_amenity",
  "update_amenity",
  "create_room",
  "update_room",
  "set_room_operational_status",
  "set_room_housekeeping_status",
  "archive_room",
  "create_room_block",
  "update_room_block",
  "remove_room_block",
  // hotel reservations (036) — bookings with state machine.
  // INQUIRY → TENTATIVE → CONFIRMED → CHECKED_IN → CHECKED_OUT.
  "create_reservation",
  "update_reservation",
  "confirm_reservation",
  "cancel_reservation",
  "mark_no_show",
  "assign_room",
  // hotel stays (037) — actual occupancy, created at check-in.
  "check_in",
  "check_out",
  "extend_stay",
  "move_room",
  "add_stay_guest",
  // hotel folios & charges (038) — immutable financial ledger for stays.
  // Corrections use compensating entries, never edits.
  "open_folio",
  "post_folio_charge",
  "post_folio_payment",
  "void_folio_entry",
  "settle_folio",
  "close_folio",
  // housekeeping & maintenance (039) — room operations layer.
  "create_housekeeping_task",
  "assign_housekeeping_task",
  "start_housekeeping_task",
  "complete_housekeeping_task",
  "verify_housekeeping_task",
  "cancel_housekeeping_task",
  "create_room_inspection",
  "complete_room_inspection",
  "create_maintenance_request",
  "assign_maintenance_request",
  "start_maintenance_request",
  "resolve_maintenance_request",
  "verify_maintenance_request",
  "close_maintenance_request",
  "cancel_maintenance_request",
  "put_maintenance_on_hold",
  "create_lost_found_item",
  "return_lost_found_item",
  "create_asset",
  "update_asset",
  // CRM (041) — customer preferences, tags, notes, feedback, complaints, loyalty,
  // corporate accounts and relationships. All writes through doors; reads under RLS.
  "upsert_customer_preferences",
  "set_customer_preference_item",
  "create_customer_tag",
  "delete_customer_tag",
  "assign_customer_tag",
  "remove_customer_tag",
  "create_customer_note",
  "update_customer_note",
  "delete_customer_note",
  "create_customer_feedback",
  "update_feedback_status",
  "create_complaint",
  "update_complaint",
  "create_loyalty_program",
  "create_loyalty_account",
  "record_loyalty_transaction",
  "create_corporate_account",
  "update_corporate_account",
  "create_customer_relationship",
  "delete_customer_relationship",
  "update_guest_crm",
  // events & banquet (042) — leads, events, venues, quotations, tasks, schedule,
  // vendors, payments, packages. All writes through doors; reads under RLS.
  "create_event_venue",
  "update_event_venue",
  "check_venue_conflict",
  "create_event_lead",
  "update_event_lead",
  "convert_lead_to_event",
  "create_event",
  "update_event",
  "confirm_event",
  "cancel_event",
  "create_event_quotation",
  "update_event_quotation",
  "add_quotation_item",
  "remove_quotation_item",
  "create_event_task",
  "update_event_task",
  "create_event_schedule_item",
  "delete_event_schedule_item",
  "create_event_vendor",
  "update_event_vendor",
  "delete_event_vendor",
  "create_event_payment",
  "create_event_package",
  // HR / workforce (043) — employees, designations, assignments, attendance,
  // shifts, roster, swap requests, holidays, leave types and requests, documents.
  // All writes through doors; reads under RLS.
  "next_employee_code",
  "create_employee",
  "update_employee",
  "set_employee_status",
  "create_designation",
  "update_designation",
  "create_employee_assignment",
  "update_employee_assignment",
  "mark_attendance",
  "correct_attendance",
  "create_shift",
  "update_shift",
  "assign_shift",
  "cancel_shift_assignment",
  "request_shift_swap",
  "approve_shift_swap",
  "reject_shift_swap",
  "create_holiday",
  "create_leave_type",
  "request_leave",
  "approve_leave",
  "reject_leave",
  "add_employee_document",
  "remove_employee_document",
  // commerce (044) — digital commerce layer: channels, public profiles, QR codes,
  // sessions, table requests, delivery addresses, settings. All writes through doors;
  // reads under RLS (with public-readable policies for public profiles).
  "create_commerce_channel",
  "update_commerce_channel",
  "upsert_property_public_profile",
  "upsert_outlet_public_profile",
  "create_qr_code",
  "update_qr_code_status",
  "create_commerce_session",
  "update_commerce_session_status",
  "create_table_request",
  "update_table_request_status",
  "add_delivery_address",
  "remove_delivery_address",
  "upsert_commerce_settings",
  "update_menu_item_public_fields",
  "update_order_source_channel",
  // enterprise (045) — property groups, module configuration, enterprise aggregation.
  // All writes through doors; reads under RLS.
  "create_property_group",
  "update_property_group",
  "set_property_group",
  "set_property_module",
  // SaaS billing (046) — subscription plans, subscriptions, billing accounts,
  // invoices, payments. All writes through doors; reads under RLS.
  "upsert_subscription",
  "cancel_subscription",
  "upsert_billing_account",
  "next_saas_invoice_number",
  "create_saas_invoice",
  "record_saas_payment",
  // notifications & automation (047) — domain events, notifications, preferences,
  // templates, communications, automation rules & execution. All writes through doors;
  // reads under RLS.
  "record_domain_event",
  "create_notification",
  "mark_notification_read",
  "mark_all_notifications_read",
  "archive_notification",
  "upsert_notification_preference",
  "create_notification_template",
  "update_notification_template",
  "queue_communication_message",
  "create_automation_rule",
  "update_automation_rule",
  "set_automation_rule_status",
  "process_domain_event",
] as const;

export type DoorName = (typeof CLIENT_DOORS)[number];

export function isDoorName(value: string): value is DoorName {
  return (CLIENT_DOORS as readonly string[]).includes(value);
}
