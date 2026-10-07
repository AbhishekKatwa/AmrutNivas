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
  // development seed only (007)
  "claim_demo_organization",
] as const;

export type DoorName = (typeof CLIENT_DOORS)[number];

export function isDoorName(value: string): value is DoorName {
  return (CLIENT_DOORS as readonly string[]).includes(value);
}
