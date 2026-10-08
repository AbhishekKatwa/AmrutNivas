/**
 * The permission catalogue (Prompt #03 §11, §12, §58).
 *
 * One entry per capability the database can actually grant: 54 tokens — the 25
 * distinct permissions granted by the role matrix in `006_seed_rbac.sql` (which
 * self-checks `count(*) = 25`), the two custom-role tokens `role.create` and
 * `role.edit` added in `011_custom_roles.sql`, and the 27 restaurant capabilities
 * seeded by `013_restaurant_permissions.sql`. No other migration inserts into
 * `role_permissions`. `permissions.test.ts` used to re-read all three files and diff
 * them against this list in both directions, so a seed that gained or dropped a token
 * failed the build instead of shipping a button the doors refuse, or a doc naming
 * a capability nobody can grant. The suite is deleted (2026-10-07, owner instruction),
 * so this list is hand-mirrored from those three seeds and the drift answers at the
 * door. `018`'s permission-drift self-check (its gate over every `require_permission`
 * literal against `role_permissions`) is the only mechanical proof that remains.
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
  | "inventory"
  | "item"
  | "location"
  | "stock"
  | "wastage"
  | "transfer"
  | "stocktake"
  | "recipe"
  | "consumption"
  | "procurement"
  | "supplier"
  | "purchase_request"
  | "purchase_order"
  | "goods_receipt"
  | "purchase_invoice"
  | "supplier_payment"
  | "purchase_return"
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

  // ------------------------------------------------------------------- inventory
  // Prompt #06's inventory domain (022): items, locations, stock ledger, recipes,
  // consumption, wastage, transfers, stock takes. Cost visibility is sensitive.
  {
    key: "inventory.view",
    domain: "inventory",
    verb: "view",
    description: "Open the inventory module for the locations you can reach.",
  },
  {
    key: "inventory_cost.view",
    domain: "inventory",
    verb: "view",
    description: "See unit costs, average costs and total stock values in the inventory.",
  },
  {
    key: "item.view",
    domain: "item",
    verb: "view",
    description: "See the inventory items: names, codes, categories and units.",
  },
  {
    key: "item.create",
    domain: "item",
    verb: "create",
    description: "Add a new item to the inventory catalogue.",
  },
  {
    key: "item.edit",
    domain: "item",
    verb: "edit",
    description: "Change an item's details, category, unit or reorder settings.",
  },
  {
    key: "item.archive",
    domain: "item",
    verb: "archive",
    description: "Retire an item so it can no longer be received or consumed.",
  },
  {
    key: "location.view",
    domain: "location",
    verb: "view",
    description: "See the stores, kitchens, bars and other stock locations.",
  },
  {
    key: "location.create",
    domain: "location",
    verb: "create",
    description: "Add a new stock location to a property or outlet.",
  },
  {
    key: "location.edit",
    domain: "location",
    verb: "edit",
    description: "Change a location's name, type or description.",
  },
  {
    key: "location.archive",
    domain: "location",
    verb: "archive",
    description: "Retire a location so no further stock movements target it.",
  },
  {
    key: "stock.view",
    domain: "stock",
    verb: "view",
    description: "See stock balances and the movements that built them.",
  },
  {
    key: "stock.adjust",
    domain: "stock",
    verb: "adjust",
    description: "Post a stock adjustment to correct a balance in the ledger.",
  },
  {
    key: "wastage.create",
    domain: "wastage",
    verb: "create",
    description: "Record stock wastage, reducing the balance for a recorded reason.",
  },
  {
    key: "transfer.create",
    domain: "transfer",
    verb: "create",
    description: "Move stock between two locations, posting to the ledger.",
  },
  {
    key: "stocktake.view",
    domain: "stocktake",
    verb: "view",
    description: "See stock takes and their counted versus expected quantities.",
  },
  {
    key: "stocktake.create",
    domain: "stocktake",
    verb: "create",
    description: "Start a new stock take for a location.",
  },
  {
    key: "stocktake.post",
    domain: "stocktake",
    verb: "post",
    description:
      "Post a completed stock take, writing the variances into the ledger.",
  },
  {
    key: "recipe.view",
    domain: "recipe",
    verb: "view",
    description: "See recipes and their ingredient formulas.",
  },
  {
    key: "recipe.create",
    domain: "recipe",
    verb: "create",
    description: "Create a new recipe linking a menu item to its ingredients.",
  },
  {
    key: "recipe.edit",
    domain: "recipe",
    verb: "edit",
    description: "Change a recipe's ingredients, yield or notes.",
  },
  {
    key: "recipe.activate",
    domain: "recipe",
    verb: "activate",
    description: "Activate a recipe version so it is the one consumption uses.",
  },
  {
    key: "recipe_cost.view",
    domain: "recipe",
    verb: "view",
    description: "See the calculated cost of a recipe from its ingredient formula.",
  },
  {
    key: "consumption.view",
    domain: "consumption",
    verb: "view",
    description: "See the stock an order or recipe consumed from the ledger.",
  },

  // ----------------------------------------------------------------- procurement
  // Prompt #07's procurement domain (027): suppliers, purchase requests, purchase
  // orders, goods receipt, invoices, payments and returns. Cost visibility and
  // landed-cost management are sensitive; write verbs stop at manager level.
  {
    key: "procurement.view",
    domain: "procurement",
    verb: "view",
    description: "Open the procurement module.",
  },
  {
    key: "procurement_cost.view",
    domain: "procurement",
    verb: "view",
    description: "See purchase prices, totals and cost breakdowns in procurement.",
  },
  {
    key: "procurement_landed_cost.manage",
    domain: "procurement",
    verb: "manage",
    description: "Allocate freight, duty and other landed costs onto receipts.",
  },
  {
    key: "procurement_supplier_price.view",
    domain: "procurement",
    verb: "view",
    description: "See the prices individual suppliers charge for items.",
  },
  {
    key: "supplier.view",
    domain: "supplier",
    verb: "view",
    description: "See the supplier list and their contact details.",
  },
  {
    key: "supplier.create",
    domain: "supplier",
    verb: "create",
    description: "Add a new supplier to the organization.",
  },
  {
    key: "supplier.edit",
    domain: "supplier",
    verb: "edit",
    description: "Change a supplier's details, terms or contact information.",
  },
  {
    key: "supplier.archive",
    domain: "supplier",
    verb: "archive",
    description: "Retire a supplier so no new orders target them.",
  },
  {
    key: "purchase_request.view",
    domain: "purchase_request",
    verb: "view",
    description: "See purchase requests and their approval status.",
  },
  {
    key: "purchase_request.create",
    domain: "purchase_request",
    verb: "create",
    description: "Raise a new purchase request for goods or services.",
  },
  {
    key: "purchase_request.edit",
    domain: "purchase_request",
    verb: "edit",
    description: "Change a purchase request before it is submitted.",
  },
  {
    key: "purchase_request.submit",
    domain: "purchase_request",
    verb: "submit",
    description: "Submit a purchase request for approval.",
  },
  {
    key: "purchase_request.approve",
    domain: "purchase_request",
    verb: "approve",
    description: "Approve a purchase request so it can become an order.",
  },
  {
    key: "purchase_request.reject",
    domain: "purchase_request",
    verb: "reject",
    description: "Reject a purchase request with a recorded reason.",
  },
  {
    key: "purchase_order.view",
    domain: "purchase_order",
    verb: "view",
    description: "See purchase orders and their delivery status.",
  },
  {
    key: "purchase_order.create",
    domain: "purchase_order",
    verb: "create",
    description: "Create a purchase order against an approved request.",
  },
  {
    key: "purchase_order.edit",
    domain: "purchase_order",
    verb: "edit",
    description: "Change a purchase order before it is sent to the supplier.",
  },
  {
    key: "purchase_order.submit",
    domain: "purchase_order",
    verb: "submit",
    description: "Submit a purchase order for internal approval.",
  },
  {
    key: "purchase_order.approve",
    domain: "purchase_order",
    verb: "approve",
    description: "Approve a purchase order so it may be sent.",
  },
  {
    key: "purchase_order.send",
    domain: "purchase_order",
    verb: "send",
    description: "Send an approved purchase order to the supplier.",
  },
  {
    key: "purchase_order.cancel",
    domain: "purchase_order",
    verb: "cancel",
    description: "Cancel a purchase order with a recorded reason.",
  },
  {
    key: "purchase_order.close",
    domain: "purchase_order",
    verb: "close",
    description: "Close a purchase order after all receipts are complete.",
  },
  {
    key: "goods_receipt.view",
    domain: "goods_receipt",
    verb: "view",
    description: "See goods receipts and what was received against each order.",
  },
  {
    key: "goods_receipt.create",
    domain: "goods_receipt",
    verb: "create",
    description: "Record the receipt of goods against a purchase order.",
  },
  {
    key: "goods_receipt.edit",
    domain: "goods_receipt",
    verb: "edit",
    description: "Change a goods receipt before it is posted.",
  },
  {
    key: "goods_receipt.post",
    domain: "goods_receipt",
    verb: "post",
    description: "Post a goods receipt, writing the stock into the ledger.",
  },
  {
    key: "goods_receipt.cancel",
    domain: "goods_receipt",
    verb: "cancel",
    description: "Cancel a posted goods receipt, reversing the stock movement.",
  },
  {
    key: "purchase_invoice.view",
    domain: "purchase_invoice",
    verb: "view",
    description: "See purchase invoices and their payment status.",
  },
  {
    key: "purchase_invoice.create",
    domain: "purchase_invoice",
    verb: "create",
    description: "Create a purchase invoice against a goods receipt or order.",
  },
  {
    key: "purchase_invoice.edit",
    domain: "purchase_invoice",
    verb: "edit",
    description: "Change a purchase invoice before it is posted.",
  },
  {
    key: "purchase_invoice.post",
    domain: "purchase_invoice",
    verb: "post",
    description: "Post a purchase invoice into the accounts payable ledger.",
  },
  {
    key: "purchase_invoice.cancel",
    domain: "purchase_invoice",
    verb: "cancel",
    description: "Cancel a posted purchase invoice with a recorded reason.",
  },
  {
    key: "supplier_payment.view",
    domain: "supplier_payment",
    verb: "view",
    description: "See payments made to suppliers.",
  },
  {
    key: "supplier_payment.create",
    domain: "supplier_payment",
    verb: "create",
    description: "Record a payment to a supplier against their invoices.",
  },
  {
    key: "supplier_payment.edit",
    domain: "supplier_payment",
    verb: "edit",
    description: "Change a supplier payment before it is finalised.",
  },
  {
    key: "supplier_payment.cancel",
    domain: "supplier_payment",
    verb: "cancel",
    description: "Cancel a supplier payment with a recorded reason.",
  },
  {
    key: "purchase_return.view",
    domain: "purchase_return",
    verb: "view",
    description: "See purchase returns and their status.",
  },
  {
    key: "purchase_return.create",
    domain: "purchase_return",
    verb: "create",
    description: "Create a return of goods to a supplier.",
  },
  {
    key: "purchase_return.post",
    domain: "purchase_return",
    verb: "post",
    description: "Post a purchase return, reversing the stock and payable.",
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
