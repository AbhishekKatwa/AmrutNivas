/**
 * The permission catalogue (Prompt #03 §11, §12, §58).
 *
 * One entry per capability the database can actually grant: 54 tokens — the 25
 * distinct permissions granted by the role matrix in `006_seed_rbac.sql` (which
 * self-checks `count(*) = 25`), the two custom-role tokens `role.create` and
 * `role.edit` added in `011_custom_roles.sql`, and the 27 restaurant capabilities
 * seeded by `013_restaurant_permissions.sql`. No other migration inserts into
 * `role_permissions`. `permissions.test.ts` re-reads all three files and diffs them
 * against this list in both directions, so a seed that gains or drops a token
 * fails the build instead of shipping a button the doors refuse, or a doc naming
 * a capability nobody can grant.
 *
 * This is a label-and-lookup layer, not a second permission system: 006's header
 * records the donor project's "role matrix lives twice" failure, so the answer to
 * "may I?" never comes from here — it comes from `my_permissions`/`evaluate_access`.
 * Keys are exactly what the DB stores; the 002 CHECK (`domain.verb`, mirrored as
 * `PERMISSION_PATTERN` in `./types`) is the format contract.
 */

import { PERMISSION_PATTERN, type Permission } from "@/domain/identity/types";

/** Every first segment present in the catalogue; new domains extend this list. */
export type PermissionDomain =
  | "organization"
  | "property"
  | "outlet"
  | "department"
  | "restaurant"
  | "menu"
  | "table"
  | "order"
  | "kot"
  | "bill"
  | "payment"
  | "user"
  | "role"
  | "audit"
  | "platform";

export type PermissionEntry = {
  /** The exact `domain.verb` string a `role_permissions` row stores. */
  readonly key: Permission;
  readonly domain: PermissionDomain;
  readonly verb: string;
  /** Written for an administrator choosing capabilities, not for a developer. */
  readonly description: string;
};

export const PERMISSION_CATALOGUE: readonly PermissionEntry[] = [
  // ---------------------------------------------------------------- organization
  {
    key: "organization.view",
    domain: "organization",
    verb: "view",
    description: "See the group's own profile, settings and structure.",
  },
  {
    key: "organization.edit",
    domain: "organization",
    verb: "edit",
    description: "Change the group's name, contact details and working settings.",
  },
  {
    key: "organization.archive",
    domain: "organization",
    verb: "archive",
    description: "Retire the whole group so nobody can work in it any more.",
  },

  // -------------------------------------------------------------------- property
  {
    key: "property.view",
    domain: "property",
    verb: "view",
    description: "See a property's details, status and place in the group.",
  },
  {
    key: "property.create",
    domain: "property",
    verb: "create",
    description: "Add a new property to the group.",
  },
  {
    key: "property.edit",
    domain: "property",
    verb: "edit",
    description: "Change a property's details and status.",
  },
  {
    key: "property.archive",
    domain: "property",
    verb: "archive",
    description: "Retire a property so no new work is done at that site.",
  },
  {
    key: "property.manage_access",
    domain: "property",
    verb: "manage_access",
    description: "Decide which people may reach which properties.",
  },

  // ---------------------------------------------------------------------- outlet
  {
    key: "outlet.view",
    domain: "outlet",
    verb: "view",
    description: "See an outlet's details and status.",
  },
  {
    key: "outlet.create",
    domain: "outlet",
    verb: "create",
    description: "Add a new outlet inside a property.",
  },
  {
    key: "outlet.edit",
    domain: "outlet",
    verb: "edit",
    description: "Change an outlet's details and status.",
  },
  {
    key: "outlet.archive",
    domain: "outlet",
    verb: "archive",
    description: "Retire an outlet so it stops trading.",
  },
  {
    key: "outlet.manage_access",
    domain: "outlet",
    verb: "manage_access",
    description: "Decide which people may reach which outlets inside a property.",
  },

  // ------------------------------------------------------------------ department
  {
    key: "department.view",
    domain: "department",
    verb: "view",
    description: "See the departments and teams a property or outlet runs.",
  },
  {
    key: "department.create",
    domain: "department",
    verb: "create",
    description: "Add a new department.",
  },
  {
    key: "department.edit",
    domain: "department",
    verb: "edit",
    description: "Change a department's details and status.",
  },
  {
    key: "department.archive",
    domain: "department",
    verb: "archive",
    description: "Retire a department.",
  },

  // ------------------------------------------------------------------ restaurant
  // Prompt #04's five restaurant capabilities areas share one entry-level key:
  // `restaurant.view` is what opens the module at all, and each area below then
  // answers for itself. The three reversals (`order.void`, `bill.void`,
  // `payment.refund`) are deliberately separate verbs from `cancel` — #04 §53 treats
  // a void as more sensitive than a cancellation, so a role that may cancel must be
  // granted the reversal on its own terms.
  {
    key: "restaurant.view",
    domain: "restaurant",
    verb: "view",
    description: "Open the restaurant module for the outlets you can reach.",
  },

  // ------------------------------------------------------------------------ menu
  {
    key: "menu.view",
    domain: "menu",
    verb: "view",
    description: "See the menu: categories, items, modifiers and prices.",
  },
  {
    key: "menu.create",
    domain: "menu",
    verb: "create",
    description: "Add categories, items, modifier groups and modifiers.",
  },
  {
    key: "menu.edit",
    domain: "menu",
    verb: "edit",
    description: "Change a menu item's details, availability and pricing.",
  },
  {
    key: "menu.archive",
    domain: "menu",
    verb: "archive",
    description: "Retire a category or item so it can no longer be ordered.",
  },
  {
    key: "menu.publish",
    domain: "menu",
    verb: "publish",
    description: "Put a menu or price change in front of the counter for service.",
  },

  // ----------------------------------------------------------------------- table
  {
    key: "table.view",
    domain: "table",
    verb: "view",
    description: "See the floor plan, its tables and how each one stands.",
  },
  {
    key: "table.create",
    domain: "table",
    verb: "create",
    description: "Add dining areas and tables to an outlet's floor.",
  },
  {
    key: "table.edit",
    domain: "table",
    verb: "edit",
    description: "Change a table's name, capacity, position or display order.",
  },
  {
    key: "table.archive",
    domain: "table",
    verb: "archive",
    description: "Retire a table so it stops showing on the floor.",
  },

  // ----------------------------------------------------------------------- order
  {
    key: "order.view",
    domain: "order",
    verb: "view",
    description: "See orders with their items, amounts and current status.",
  },
  {
    key: "order.create",
    domain: "order",
    verb: "create",
    description: "Open a new order and add items to it.",
  },
  {
    key: "order.edit",
    domain: "order",
    verb: "edit",
    description: "Change an order while its status still allows the change.",
  },
  {
    key: "order.cancel",
    domain: "order",
    verb: "cancel",
    description: "Cancel an order at a stage where cancellation is permitted.",
  },
  {
    key: "order.discount",
    domain: "order",
    verb: "discount",
    description: "Apply a percentage or fixed discount to an order or a line.",
  },
  {
    key: "order.void",
    domain: "order",
    verb: "void",
    description: "Void an order — a privileged reversal, taken for a recorded reason.",
  },

  // ------------------------------------------------------------------------- kot
  {
    key: "kot.view",
    domain: "kot",
    verb: "view",
    description: "See kitchen order tickets and how far each has come.",
  },
  {
    key: "kot.create",
    domain: "kot",
    verb: "create",
    description: "Send an order's items to the kitchen as a KOT.",
  },
  {
    key: "kot.reprint",
    domain: "kot",
    verb: "reprint",
    description: "Print a KOT for the kitchen again, every reprint being audited.",
  },
  {
    key: "kot.cancel",
    domain: "kot",
    verb: "cancel",
    description: "Call off a KOT or a line on it before the kitchen serves it.",
  },

  // ------------------------------------------------------------------------ bill
  {
    key: "bill.view",
    domain: "bill",
    verb: "view",
    description: "See a bill with its taxes, charges and payments.",
  },
  {
    key: "bill.create",
    domain: "bill",
    verb: "create",
    description: "Raise the bill for an order.",
  },
  {
    key: "bill.discount",
    domain: "bill",
    verb: "discount",
    description: "Adjust a bill's total before it is paid.",
  },
  {
    key: "bill.void",
    domain: "bill",
    verb: "void",
    description: "Void a bill — a privileged reversal, taken for a recorded reason.",
  },

  // --------------------------------------------------------------------- payment
  {
    key: "payment.view",
    domain: "payment",
    verb: "view",
    description: "See the payments recorded against a bill.",
  },
  {
    key: "payment.create",
    domain: "payment",
    verb: "create",
    description: "Record a payment received on a bill.",
  },
  {
    key: "payment.refund",
    domain: "payment",
    verb: "refund",
    description: "Refund a payment — a privileged money movement, for a recorded reason.",
  },

  // ------------------------------------------------------------------------ user
  {
    key: "user.view",
    domain: "user",
    verb: "view",
    description: "See the people who belong to the group and how they are standing.",
  },
  {
    key: "user.invite",
    domain: "user",
    verb: "invite",
    description: "Invite new people into the group.",
  },
  {
    key: "user.suspend",
    domain: "user",
    verb: "suspend",
    description: "Pause a person's access to the group without removing them.",
  },
  {
    key: "user.remove",
    domain: "user",
    verb: "remove",
    description: "Take a person out of the group entirely.",
  },

  // ------------------------------------------------------------------------ role
  {
    key: "role.view",
    domain: "role",
    verb: "view",
    description: "See the roles that exist and what each one lets its holder do.",
  },
  {
    key: "role.create",
    domain: "role",
    verb: "create",
    description:
      "Invent a new role for this group, granting only capabilities you already hold.",
  },
  {
    key: "role.edit",
    domain: "role",
    verb: "edit",
    description:
      "Rename, re-describe, re-permission or retire a custom role of this group.",
  },
  {
    key: "role.assign",
    domain: "role",
    verb: "assign",
    description: "Give or revoke roles for the group's people.",
  },

  // ----------------------------------------------------------------------- audit
  {
    key: "audit.view",
    domain: "audit",
    verb: "view",
    description: "Read the audit trail of who did what, when, and for what reason.",
  },

  // -------------------------------------------------------------------- platform
  {
    key: "platform.manage",
    domain: "platform",
    verb: "manage",
    description:
      "Operate the AMRUT NIVAAS platform itself, including administration of any tenant.",
  },
];

/** Stable list of every grantable key, in catalogue order. */
export const PERMISSION_KEYS: readonly Permission[] = PERMISSION_CATALOGUE.map(
  (entry) => entry.key,
);

const ENTRIES_BY_KEY = new Map<string, PermissionEntry>(
  PERMISSION_CATALOGUE.map((entry) => [entry.key, entry]),
);

/**
 * True only for a key the database can actually grant.
 *
 * `Permission` is the loose template `${string}.${string}`, so the compiler accepts
 * any dotted string — which is exactly how the donor project shipped gates on tokens
 * no role could ever hold. Format alone is not enough: an unknown but well-shaped
 * key is refused too.
 */
export function isPermissionKey(value: unknown): value is Permission {
  return (
    typeof value === "string" &&
    PERMISSION_PATTERN.test(value) &&
    ENTRIES_BY_KEY.has(value)
  );
}

/** The administrator-facing sentence for a key, or undefined if the catalogue has none. */
export function describePermission(key: Permission): string | undefined {
  return ENTRIES_BY_KEY.get(key)?.description;
}

/** Catalogue grouped by domain, for the roles screen's permission pickers (§58). */
export function permissionsByDomain(): readonly {
  readonly domain: PermissionDomain;
  readonly permissions: readonly PermissionEntry[];
}[] {
  const groups = new Map<PermissionDomain, PermissionEntry[]>();
  for (const entry of PERMISSION_CATALOGUE) {
    const group = groups.get(entry.domain);
    if (group) {
      group.push(entry);
    } else {
      groups.set(entry.domain, [entry]);
    }
  }
  return [...groups].map(([domain, permissions]) => ({ domain, permissions }));
}
