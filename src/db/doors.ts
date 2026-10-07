/**
 * The client-callable door list — the whole write API of this product, named in
 * one place.
 *
 * PostgREST exposes every function in `public`, so this is not how the surface is
 * enforced (the schema split in 005 is). It is how the *client* is kept honest:
 * `db/doors.test.ts` compares this array against the functions actually defined in
 * `db/supabase/*.sql`, in both directions, so a door added server-side without a
 * service method — or a service method calling a door that was renamed away —
 * fails the test suite instead of the user.
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
  // development seed only (007)
  "claim_demo_organization",
] as const;

export type DoorName = (typeof CLIENT_DOORS)[number];

export function isDoorName(value: string): value is DoorName {
  return (CLIENT_DOORS as readonly string[]).includes(value);
}
