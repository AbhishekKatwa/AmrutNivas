/**
 * The permission catalogue (Prompt #03 §11, §12, §58).
 *
 * One entry per capability the database can actually grant: 155 tokens — the 25
 * distinct permissions granted by the role matrix in `006_seed_rbac.sql`, the two
 * custom-role tokens `role.create` and `role.edit` from `011_custom_roles.sql`,
 * the 27 restaurant capabilities from `013_restaurant_permissions.sql`, the 46
 * hotel PMS tokens from `032_hotel_permissions.sql`, the 28 housekeeping,
 * maintenance and room operations tokens from `040_housekeeping_maintenance_permissions.sql`,
 * and the 27 CRM tokens from `041_crm_foundation.sql`.
 * No other migration inserts into `role_permissions`. The suite that used to diff
 * this list against the seeds is deleted (2026-10-07, owner instruction), so this
 * list is hand-mirrored and the drift answers at the door. `018`'s permission-drift
 * self-check is the only mechanical proof that remains.
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
  | "platform"
  | "hotel"
  | "room_type"
  | "room"
  | "reservation"
  | "frontoffice"
  | "stay"
  | "folio"
  | "hotel_payment"
  | "guest"
  | "room_availability"
  | "housekeeping_status"
  | "housekeeping"
  | "maintenance"
  | "lost_found"
  | "asset"
  | "room_operation"
  | "crm"
  | "customer"
  | "customer_note"
  | "customer_preference"
  | "customer_tag"
  | "feedback"
  | "complaint"
  | "loyalty"
  | "segment"
  | "corporate"
  | "events"
  | "event_lead"
  | "event_venue"
  | "event_quotation"
  | "event_payment"
  | "event_plan"
  | "event_task"
  | "event_vendor"
  | "event_schedule"
  | "event_pnl"
  | "event_document"
  | "hr"
  | "commerce"
  | "enterprise"
  | "billing"
  | "notifications"
  | "communications"
  | "automation"
  | "analytics"
  | "integrations"
  | "documents"
  | "settings"
  | "task"
  | "approval"
  | "workflow"
  | "revenue"
  | "supply_chain"
  | "experience"
  | "marketing"
  | "guest_experience";

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
  // Prompt #22's platform admin layer (048): platform roles, permissions, support
  // cases, security incidents, announcements, feature flags, data export/deletion.
  // Platform permissions are separate from organization permissions — a platform
  // admin operates the SaaS platform, not a customer's business data.
  {
    key: "platform.dashboard.view",
    domain: "platform",
    verb: "dashboard.view",
    description: "See the platform admin dashboard with operational metrics.",
  },
  {
    key: "platform.organization.view",
    domain: "platform",
    verb: "organization.view",
    description: "See all organizations on the platform.",
  },
  {
    key: "platform.organization.manage",
    domain: "platform",
    verb: "organization.manage",
    description: "Manage organization details and settings.",
  },
  {
    key: "platform.organization.suspend",
    domain: "platform",
    verb: "organization.suspend",
    description: "Suspend an organization's access to the platform.",
  },
  {
    key: "platform.organization.archive",
    domain: "platform",
    verb: "organization.archive",
    description: "Archive an organization.",
  },
  {
    key: "platform.user.view",
    domain: "platform",
    verb: "user.view",
    description: "See users across all organizations.",
  },
  {
    key: "platform.user.manage",
    domain: "platform",
    verb: "user.manage",
    description: "Manage platform users and their platform roles.",
  },
  {
    key: "platform.subscription.view",
    domain: "platform",
    verb: "subscription.view",
    description: "See subscriptions across all organizations.",
  },
  {
    key: "platform.subscription.manage",
    domain: "platform",
    verb: "subscription.manage",
    description: "Manage organization subscriptions.",
  },
  {
    key: "platform.plan.view",
    domain: "platform",
    verb: "plan.view",
    description: "See the subscription plans the platform offers.",
  },
  {
    key: "platform.plan.manage",
    domain: "platform",
    verb: "plan.manage",
    description: "Create, edit and archive subscription plans.",
  },
  {
    key: "platform.billing.view",
    domain: "platform",
    verb: "billing.view",
    description: "See platform billing and revenue metrics.",
  },
  {
    key: "platform.billing.manage",
    domain: "platform",
    verb: "billing.manage",
    description: "Manage platform billing settings.",
  },
  {
    key: "platform.support.view",
    domain: "platform",
    verb: "support.view",
    description: "See support cases across all organizations.",
  },
  {
    key: "platform.support.manage",
    domain: "platform",
    verb: "support.manage",
    description: "Manage support cases and assign them to staff.",
  },
  {
    key: "platform.support.impersonate",
    domain: "platform",
    verb: "support.impersonate",
    description: "Access an organization in support mode with time-limited, scoped access.",
  },
  {
    key: "platform.health.view",
    domain: "platform",
    verb: "health.view",
    description: "See system health and operational status.",
  },
  {
    key: "platform.integration.view",
    domain: "platform",
    verb: "integration.view",
    description: "See integration health across all organizations.",
  },
  {
    key: "platform.integration.manage",
    domain: "platform",
    verb: "integration.manage",
    description: "Manage platform-level integration settings.",
  },
  {
    key: "platform.webhook.view",
    domain: "platform",
    verb: "webhook.view",
    description: "See webhook delivery status across all organizations.",
  },
  {
    key: "platform.security.view",
    domain: "platform",
    verb: "security.view",
    description: "See security events and incidents.",
  },
  {
    key: "platform.security.manage",
    domain: "platform",
    verb: "security.manage",
    description: "Manage security incidents and responses.",
  },
  {
    key: "platform.incident.view",
    domain: "platform",
    verb: "incident.view",
    description: "See security incidents.",
  },
  {
    key: "platform.incident.manage",
    domain: "platform",
    verb: "incident.manage",
    description: "Create, update and resolve security incidents.",
  },
  {
    key: "platform.audit.view",
    domain: "platform",
    verb: "audit.view",
    description: "See platform audit logs.",
  },
  {
    key: "platform.audit.export",
    domain: "platform",
    verb: "audit.export",
    description: "Export platform audit logs.",
  },
  {
    key: "platform.announcement.view",
    domain: "platform",
    verb: "announcement.view",
    description: "See platform announcements.",
  },
  {
    key: "platform.announcement.manage",
    domain: "platform",
    verb: "announcement.manage",
    description: "Create and manage platform-wide announcements.",
  },
  {
    key: "platform.configuration.view",
    domain: "platform",
    verb: "configuration.view",
    description: "See platform configuration settings.",
  },
  {
    key: "platform.configuration.manage",
    domain: "platform",
    verb: "configuration.manage",
    description: "Manage platform configuration settings.",
  },
  {
    key: "platform.feature_flag.view",
    domain: "platform",
    verb: "feature_flag.view",
    description: "See feature flags and their status.",
  },
  {
    key: "platform.feature_flag.manage",
    domain: "platform",
    verb: "feature_flag.manage",
    description: "Create, enable and disable feature flags.",
  },
  {
    key: "platform.analytics.view",
    domain: "platform",
    verb: "analytics.view",
    description: "See platform-wide analytics and metrics.",
  },
  {
    key: "platform.analytics.export",
    domain: "platform",
    verb: "analytics.export",
    description: "Export platform analytics.",
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

  // ------------------------------------------------------------------------ hotel
  // Prompt #08's hotel PMS domain (032): room types, rooms, reservations, front office,
  // stays, folios, payments, guests, availability, housekeeping status foundation.
  {
    key: "hotel.view",
    domain: "hotel",
    verb: "view",
    description: "Open the hotel PMS module for the properties you can reach.",
  },
  {
    key: "room_type.view",
    domain: "room_type",
    verb: "view",
    description: "See the room types and their configurations.",
  },
  {
    key: "room_type.create",
    domain: "room_type",
    verb: "create",
    description: "Add a new room type to the property.",
  },
  {
    key: "room_type.edit",
    domain: "room_type",
    verb: "edit",
    description: "Change a room type's details, occupancy or configuration.",
  },
  {
    key: "room_type.archive",
    domain: "room_type",
    verb: "archive",
    description: "Retire a room type so no new rooms use it.",
  },
  {
    key: "room.view",
    domain: "room",
    verb: "view",
    description: "See the rooms, their types and current status.",
  },
  {
    key: "room.create",
    domain: "room",
    verb: "create",
    description: "Add a new room to the property.",
  },
  {
    key: "room.edit",
    domain: "room",
    verb: "edit",
    description: "Change a room's type, number, floor or notes.",
  },
  {
    key: "room.archive",
    domain: "room",
    verb: "archive",
    description: "Retire a room so it no longer appears in the inventory.",
  },
  {
    key: "room.block",
    domain: "room",
    verb: "block",
    description: "Block a room for a date range, preventing reservations.",
  },
  {
    key: "reservation.view",
    domain: "reservation",
    verb: "view",
    description: "See reservations and their status.",
  },
  {
    key: "reservation.create",
    domain: "reservation",
    verb: "create",
    description: "Create a new reservation for a guest.",
  },
  {
    key: "reservation.edit",
    domain: "reservation",
    verb: "edit",
    description: "Change a reservation's dates, room type or guest details.",
  },
  {
    key: "reservation.confirm",
    domain: "reservation",
    verb: "confirm",
    description: "Confirm a pending reservation.",
  },
  {
    key: "reservation.cancel",
    domain: "reservation",
    verb: "cancel",
    description: "Cancel a reservation with a recorded reason.",
  },
  {
    key: "reservation.no_show",
    domain: "reservation",
    verb: "no_show",
    description: "Mark a reservation as a no-show.",
  },
  {
    key: "reservation.modify_rate",
    domain: "reservation",
    verb: "modify_rate",
    description: "Override the rate on a reservation.",
  },
  {
    key: "reservation.assign_room",
    domain: "reservation",
    verb: "assign_room",
    description: "Assign a specific room to a reservation.",
  },
  {
    key: "frontoffice.view",
    domain: "frontoffice",
    verb: "view",
    description: "See the front office dashboard and today's arrivals/departures.",
  },
  {
    key: "frontoffice.checkin",
    domain: "frontoffice",
    verb: "checkin",
    description: "Check a guest into their room.",
  },
  {
    key: "frontoffice.checkout",
    domain: "frontoffice",
    verb: "checkout",
    description: "Check a guest out of their room.",
  },
  {
    key: "frontoffice.room_move",
    domain: "frontoffice",
    verb: "room_move",
    description: "Move a guest to a different room during their stay.",
  },
  {
    key: "stay.view",
    domain: "stay",
    verb: "view",
    description: "See active and past guest stays.",
  },
  {
    key: "stay.create",
    domain: "stay",
    verb: "create",
    description: "Create a stay record for a walk-in guest.",
  },
  {
    key: "stay.modify",
    domain: "stay",
    verb: "modify",
    description: "Modify an active stay's dates or room.",
  },
  {
    key: "folio.view",
    domain: "folio",
    verb: "view",
    description: "See a guest's folio with charges and payments.",
  },
  {
    key: "folio.charge",
    domain: "folio",
    verb: "charge",
    description: "Post a charge to a guest's folio.",
  },
  {
    key: "folio.adjust",
    domain: "folio",
    verb: "adjust",
    description: "Adjust a charge on a folio with a recorded reason.",
  },
  {
    key: "folio.discount",
    domain: "folio",
    verb: "discount",
    description: "Apply a discount to a folio charge.",
  },
  {
    key: "folio.settle",
    domain: "folio",
    verb: "settle",
    description: "Settle a folio by recording payment.",
  },
  {
    key: "hotel_payment.view",
    domain: "hotel_payment",
    verb: "view",
    description: "See payments recorded against folios.",
  },
  {
    key: "hotel_payment.create",
    domain: "hotel_payment",
    verb: "create",
    description: "Record a payment against a folio.",
  },
  {
    key: "hotel_payment.refund",
    domain: "hotel_payment",
    verb: "refund",
    description: "Refund a hotel payment with a recorded reason.",
  },
  {
    key: "guest.view",
    domain: "guest",
    verb: "view",
    description: "See guest profiles and contact details.",
  },
  {
    key: "guest.create",
    domain: "guest",
    verb: "create",
    description: "Add a new guest profile.",
  },
  {
    key: "guest.edit",
    domain: "guest",
    verb: "edit",
    description: "Change a guest's profile details.",
  },
  {
    key: "guest.sensitive.view",
    domain: "guest",
    verb: "sensitive.view",
    description: "See sensitive guest information such as ID documents.",
  },
  {
    key: "room_availability.view",
    domain: "room_availability",
    verb: "view",
    description: "See room availability for dates.",
  },
  {
    key: "room_availability.override",
    domain: "room_availability",
    verb: "override",
    description: "Override room availability for a date range.",
  },
  {
    key: "housekeeping_status.view",
    domain: "housekeeping_status",
    verb: "view",
    description: "See the housekeeping status of rooms.",
  },
  {
    key: "housekeeping_status.update",
    domain: "housekeeping_status",
    verb: "update",
    description: "Update a room's housekeeping status.",
  },

  // --------------------------------------------------------------- housekeeping
  // Prompt #09's housekeeping domain (039): tasks, inspections, checklists.
  {
    key: "housekeeping.view",
    domain: "housekeeping",
    verb: "view",
    description: "Open the housekeeping module and see tasks.",
  },
  {
    key: "housekeeping.task.create",
    domain: "housekeeping",
    verb: "task.create",
    description: "Create a new housekeeping task for a room.",
  },
  {
    key: "housekeeping.task.assign",
    domain: "housekeeping",
    verb: "task.assign",
    description: "Assign a housekeeping task to a staff member.",
  },
  {
    key: "housekeeping.task.start",
    domain: "housekeeping",
    verb: "task.start",
    description: "Start working on an assigned housekeeping task.",
  },
  {
    key: "housekeeping.task.complete",
    domain: "housekeeping",
    verb: "task.complete",
    description: "Mark a housekeeping task as completed.",
  },
  {
    key: "housekeeping.task.verify",
    domain: "housekeeping",
    verb: "task.verify",
    description: "Verify a completed housekeeping task.",
  },
  {
    key: "housekeeping.task.cancel",
    domain: "housekeeping",
    verb: "task.cancel",
    description: "Cancel a housekeeping task with a recorded reason.",
  },
  {
    key: "housekeeping.inspection.create",
    domain: "housekeeping",
    verb: "inspection.create",
    description: "Create a room inspection record.",
  },
  {
    key: "housekeeping.inspection.complete",
    domain: "housekeeping",
    verb: "inspection.complete",
    description: "Complete a room inspection with pass/fail results.",
  },

  // --------------------------------------------------------------- maintenance
  // Prompt #09's maintenance domain (039): requests, assignments, resolutions.
  {
    key: "maintenance.view",
    domain: "maintenance",
    verb: "view",
    description: "Open the maintenance module and see requests.",
  },
  {
    key: "maintenance.create",
    domain: "maintenance",
    verb: "create",
    description: "Create a new maintenance request.",
  },
  {
    key: "maintenance.assign",
    domain: "maintenance",
    verb: "assign",
    description: "Assign a maintenance request to a technician.",
  },
  {
    key: "maintenance.start",
    domain: "maintenance",
    verb: "start",
    description: "Start working on an assigned maintenance request.",
  },
  {
    key: "maintenance.resolve",
    domain: "maintenance",
    verb: "resolve",
    description: "Mark a maintenance request as resolved.",
  },
  {
    key: "maintenance.verify",
    domain: "maintenance",
    verb: "verify",
    description: "Verify a resolved maintenance request.",
  },
  {
    key: "maintenance.close",
    domain: "maintenance",
    verb: "close",
    description: "Close a verified maintenance request.",
  },
  {
    key: "maintenance.cancel",
    domain: "maintenance",
    verb: "cancel",
    description: "Cancel a maintenance request with a recorded reason.",
  },
  {
    key: "maintenance.cost.view",
    domain: "maintenance",
    verb: "cost.view",
    description: "See maintenance costs and parts consumption.",
  },
  {
    key: "maintenance.parts.consume",
    domain: "maintenance",
    verb: "parts.consume",
    description: "Record parts consumption against a maintenance request.",
  },

  // --------------------------------------------------------------- room operations
  // Prompt #09's room operations (039): operational status management.
  {
    key: "room_operation.view",
    domain: "room_operation",
    verb: "view",
    description: "See the room operations board with status management.",
  },
  {
    key: "room_operation.manage",
    domain: "room_operation",
    verb: "manage",
    description: "Manage room operational status and blocks.",
  },
  {
    key: "room.release",
    domain: "room",
    verb: "release",
    description: "Release a room block.",
  },

  // --------------------------------------------------------------- lost & found
  // Prompt #09's lost & found foundation (039).
  {
    key: "lost_found.view",
    domain: "lost_found",
    verb: "view",
    description: "See lost and found items.",
  },
  {
    key: "lost_found.create",
    domain: "lost_found",
    verb: "create",
    description: "Log a new lost or found item.",
  },
  {
    key: "lost_found.return",
    domain: "lost_found",
    verb: "return",
    description: "Return a found item to its owner.",
  },

  // ------------------------------------------------------------------------ asset
  // Prompt #09's asset foundation (039).
  {
    key: "asset.view",
    domain: "asset",
    verb: "view",
    description: "See assets and their maintenance history.",
  },
  {
    key: "asset.create",
    domain: "asset",
    verb: "create",
    description: "Add a new asset to the property.",
  },
  {
    key: "asset.edit",
    domain: "asset",
    verb: "edit",
    description: "Change an asset's details or location.",
  },

  // -------------------------------------------------------------------------- crm
  // Prompt #11's CRM foundation (041). Extends guests into customer identity,
  // adds preferences, tags, notes, feedback, complaints, loyalty, corporate
  // accounts, relationships, and segmentation.
  {
    key: "crm.view",
    domain: "crm",
    verb: "view",
    description: "Open the CRM module.",
  },
  {
    key: "crm.customer.view",
    domain: "customer",
    verb: "view",
    description: "See customer profiles and their activity history.",
  },
  {
    key: "crm.customer.create",
    domain: "customer",
    verb: "create",
    description: "Add a new customer to the organization.",
  },
  {
    key: "crm.customer.edit",
    domain: "customer",
    verb: "edit",
    description: "Change a customer's details, preferences and CRM fields.",
  },
  {
    key: "crm.customer.archive",
    domain: "customer",
    verb: "archive",
    description: "Retire a customer profile so it stops appearing in active lists.",
  },
  {
    key: "crm.customer.merge",
    domain: "customer",
    verb: "merge",
    description: "Merge duplicate customer profiles into one canonical identity.",
  },
  {
    key: "crm.customer.note.view",
    domain: "customer_note",
    verb: "view",
    description: "See notes attached to a customer profile.",
  },
  {
    key: "crm.customer.note.create",
    domain: "customer_note",
    verb: "create",
    description: "Add a new note to a customer profile.",
  },
  {
    key: "crm.customer.note.edit",
    domain: "customer_note",
    verb: "edit",
    description: "Change the text of a customer note.",
  },
  {
    key: "crm.customer.note.delete",
    domain: "customer_note",
    verb: "delete",
    description: "Remove a note from a customer profile.",
  },
  {
    key: "crm.customer.preference.view",
    domain: "customer_preference",
    verb: "view",
    description: "See a customer's communication and structured preferences.",
  },
  {
    key: "crm.customer.preference.manage",
    domain: "customer_preference",
    verb: "manage",
    description: "Change a customer's communication consent and preference entries.",
  },
  {
    key: "crm.customer.tag.view",
    domain: "customer_tag",
    verb: "view",
    description: "See customer tags and their assignments.",
  },
  {
    key: "crm.customer.tag.manage",
    domain: "customer_tag",
    verb: "manage",
    description: "Create, edit and assign tags to customers.",
  },
  {
    key: "crm.feedback.view",
    domain: "feedback",
    verb: "view",
    description: "See customer feedback entries and their ratings.",
  },
  {
    key: "crm.feedback.create",
    domain: "feedback",
    verb: "create",
    description: "Record new customer feedback.",
  },
  {
    key: "crm.feedback.manage",
    domain: "feedback",
    verb: "manage",
    description: "Update feedback status and resolution.",
  },
  {
    key: "crm.complaint.view",
    domain: "complaint",
    verb: "view",
    description: "See complaints and their resolution status.",
  },
  {
    key: "crm.complaint.create",
    domain: "complaint",
    verb: "create",
    description: "Log a new customer complaint.",
  },
  {
    key: "crm.complaint.manage",
    domain: "complaint",
    verb: "manage",
    description: "Assign, resolve and close complaints.",
  },
  {
    key: "crm.loyalty.view",
    domain: "loyalty",
    verb: "view",
    description: "See loyalty programs, accounts and transaction history.",
  },
  {
    key: "crm.loyalty.manage",
    domain: "loyalty",
    verb: "manage",
    description: "Create loyalty programs, enrol customers and manage tiers.",
  },
  {
    key: "crm.loyalty.adjust",
    domain: "loyalty",
    verb: "adjust",
    description: "Post manual loyalty point adjustments.",
  },
  {
    key: "crm.segment.view",
    domain: "segment",
    verb: "view",
    description: "See customer segments derived from activity data.",
  },
  {
    key: "crm.segment.manage",
    domain: "segment",
    verb: "manage",
    description: "Create and edit customer segmentation rules.",
  },
  {
    key: "crm.corporate.view",
    domain: "corporate",
    verb: "view",
    description: "See corporate accounts and their linked customers.",
  },
  {
    key: "crm.corporate.manage",
    domain: "corporate",
    verb: "manage",
    description: "Create and edit corporate accounts.",
  },
  // events & banquet (042) — 36 tokens covering the full event lifecycle
  {
    key: "events.view",
    domain: "events",
    verb: "view",
    description: "See the events overview and dashboard.",
  },
  {
    key: "events.lead.view",
    domain: "event_lead",
    verb: "view",
    description: "See event leads and enquiries.",
  },
  {
    key: "events.lead.create",
    domain: "event_lead",
    verb: "create",
    description: "Create new event leads.",
  },
  {
    key: "events.lead.edit",
    domain: "event_lead",
    verb: "edit",
    description: "Edit event lead details.",
  },
  {
    key: "events.lead.convert",
    domain: "event_lead",
    verb: "convert",
    description: "Convert a lead into an event.",
  },
  {
    key: "events.lead.assign",
    domain: "event_lead",
    verb: "assign",
    description: "Assign leads to sales team members.",
  },
  {
    key: "events.lead.close",
    domain: "event_lead",
    verb: "close",
    description: "Close a lead as lost or cancelled.",
  },
  {
    key: "events.event.view",
    domain: "events",
    verb: "event.view",
    description: "See event details.",
  },
  {
    key: "events.event.create",
    domain: "events",
    verb: "event.create",
    description: "Create new events.",
  },
  {
    key: "events.event.edit",
    domain: "events",
    verb: "event.edit",
    description: "Edit event details.",
  },
  {
    key: "events.event.confirm",
    domain: "events",
    verb: "event.confirm",
    description: "Confirm an event booking.",
  },
  {
    key: "events.event.cancel",
    domain: "events",
    verb: "event.cancel",
    description: "Cancel an event.",
  },
  {
    key: "events.event.complete",
    domain: "events",
    verb: "event.complete",
    description: "Mark an event as completed.",
  },
  {
    key: "events.venue.view",
    domain: "event_venue",
    verb: "view",
    description: "See event venues and availability.",
  },
  {
    key: "events.venue.manage",
    domain: "event_venue",
    verb: "manage",
    description: "Create and edit event venues.",
  },
  {
    key: "events.quotation.view",
    domain: "event_quotation",
    verb: "view",
    description: "See event quotations.",
  },
  {
    key: "events.quotation.create",
    domain: "event_quotation",
    verb: "create",
    description: "Create event quotations.",
  },
  {
    key: "events.quotation.edit",
    domain: "event_quotation",
    verb: "edit",
    description: "Edit event quotation details and items.",
  },
  {
    key: "events.quotation.send",
    domain: "event_quotation",
    verb: "send",
    description: "Send a quotation to the customer.",
  },
  {
    key: "events.quotation.accept",
    domain: "event_quotation",
    verb: "accept",
    description: "Accept a quotation and confirm the event.",
  },
  {
    key: "events.quotation.cancel",
    domain: "event_quotation",
    verb: "cancel",
    description: "Cancel an event quotation.",
  },
  {
    key: "events.payment.view",
    domain: "event_payment",
    verb: "view",
    description: "See event payments and financials.",
  },
  {
    key: "events.payment.create",
    domain: "event_payment",
    verb: "create",
    description: "Record event payments (advance, partial, final).",
  },
  {
    key: "events.payment.refund",
    domain: "event_payment",
    verb: "refund",
    description: "Record event refunds.",
  },
  {
    key: "events.plan.view",
    domain: "event_plan",
    verb: "view",
    description: "See event plans and resource allocations.",
  },
  {
    key: "events.plan.manage",
    domain: "event_plan",
    verb: "manage",
    description: "Create and edit event plans.",
  },
  {
    key: "events.task.view",
    domain: "event_task",
    verb: "view",
    description: "See event tasks.",
  },
  {
    key: "events.task.create",
    domain: "event_task",
    verb: "create",
    description: "Create event tasks.",
  },
  {
    key: "events.task.manage",
    domain: "event_task",
    verb: "manage",
    description: "Edit and complete event tasks.",
  },
  {
    key: "events.vendor.view",
    domain: "event_vendor",
    verb: "view",
    description: "See event vendors and their services.",
  },
  {
    key: "events.vendor.manage",
    domain: "event_vendor",
    verb: "manage",
    description: "Add and edit event vendors.",
  },
  {
    key: "events.schedule.view",
    domain: "event_schedule",
    verb: "view",
    description: "See event day run sheets.",
  },
  {
    key: "events.schedule.manage",
    domain: "event_schedule",
    verb: "manage",
    description: "Create and edit schedule items.",
  },
  {
    key: "events.pnl.view",
    domain: "event_pnl",
    verb: "view",
    description: "See event profit and loss.",
  },
  {
    key: "events.documents.view",
    domain: "event_document",
    verb: "view",
    description: "See event documents.",
  },
  {
    key: "events.documents.manage",
    domain: "event_document",
    verb: "manage",
    description: "Upload and manage event documents.",
  },
  // -------------------------------------------------------------------------- hr
  // Prompt #13's HR / workforce domain (043): employees, designations, attendance,
  // shifts, roster, leave, holidays and documents. All writes through security-
  // definer doors; reads under RLS.
  {
    key: "hr.view",
    domain: "hr",
    verb: "view",
    description: "Open the HR module for the properties you can reach.",
  },
  {
    key: "hr.employee.view",
    domain: "hr",
    verb: "view",
    description: "See employee records, their details and employment status.",
  },
  {
    key: "hr.employee.create",
    domain: "hr",
    verb: "create",
    description: "Add a new employee to the organization.",
  },
  {
    key: "hr.employee.edit",
    domain: "hr",
    verb: "edit",
    description: "Change an employee's details, designation or assignment.",
  },
  {
    key: "hr.employee.archive",
    domain: "hr",
    verb: "archive",
    description: "Retire an employee record so they no longer appear as active.",
  },
  {
    key: "hr.designation.view",
    domain: "hr",
    verb: "view",
    description: "See the job titles and levels that exist in the organization.",
  },
  {
    key: "hr.designation.manage",
    domain: "hr",
    verb: "manage",
    description: "Create and change designations (job titles and levels).",
  },
  {
    key: "hr.attendance.view",
    domain: "hr",
    verb: "view",
    description: "See attendance records and daily presence for employees.",
  },
  {
    key: "hr.attendance.mark",
    domain: "hr",
    verb: "mark",
    description: "Record an employee's attendance for a day.",
  },
  {
    key: "hr.attendance.correct",
    domain: "hr",
    verb: "correct",
    description: "Correct a previously recorded attendance entry with a reason.",
  },
  {
    key: "hr.shift.view",
    domain: "hr",
    verb: "view",
    description: "See shift definitions and their timings.",
  },
  {
    key: "hr.shift.manage",
    domain: "hr",
    verb: "manage",
    description: "Create and change shift definitions (start, end, break).",
  },
  {
    key: "hr.roster.view",
    domain: "hr",
    verb: "view",
    description: "See the roster: which employee works which shift on which date.",
  },
  {
    key: "hr.roster.manage",
    domain: "hr",
    verb: "manage",
    description: "Assign employees to shifts and manage the roster.",
  },
  {
    key: "hr.leave.view",
    domain: "hr",
    verb: "view",
    description: "See leave requests and their approval status.",
  },
  {
    key: "hr.leave.request",
    domain: "hr",
    verb: "request",
    description: "Apply for leave on behalf of an employee.",
  },
  {
    key: "hr.leave.approve",
    domain: "hr",
    verb: "approve",
    description: "Approve a leave request so it is recorded as granted.",
  },
  {
    key: "hr.leave.reject",
    domain: "hr",
    verb: "reject",
    description: "Reject a leave request with a recorded reason.",
  },
  {
    key: "hr.holiday.view",
    domain: "hr",
    verb: "view",
    description: "See the holiday calendar for a property.",
  },
  {
    key: "hr.holiday.manage",
    domain: "hr",
    verb: "manage",
    description: "Create and manage holidays on the property calendar.",
  },
  {
    key: "hr.document.view",
    domain: "hr",
    verb: "view",
    description: "See employee document metadata and expiry dates.",
  },
  {
    key: "hr.document.manage",
    domain: "hr",
    verb: "manage",
    description: "Upload and remove employee document records.",
  },
  {
    key: "hr.report.view",
    domain: "hr",
    verb: "view",
    description: "See workforce reports: headcount, attendance summaries and leave balances.",
  },
  // ---------------------------------------------------------------------- commerce
  // Prompt #14's commerce domain (044): digital channels, public profiles, QR codes,
  // online ordering, direct booking, table requests, commerce settings.
  {
    key: "commerce.view",
    domain: "commerce",
    verb: "view",
    description: "Open the commerce module and see digital channel overview.",
  },
  {
    key: "commerce.channel.view",
    domain: "commerce",
    verb: "view",
    description: "See commerce channels and their configuration.",
  },
  {
    key: "commerce.channel.manage",
    domain: "commerce",
    verb: "manage",
    description: "Create and edit commerce channels.",
  },
  {
    key: "commerce.public_profile.view",
    domain: "commerce",
    verb: "view",
    description: "See public property and outlet profiles.",
  },
  {
    key: "commerce.public_profile.manage",
    domain: "commerce",
    verb: "manage",
    description: "Create and edit public profiles for properties and outlets.",
  },
  {
    key: "commerce.qr.view",
    domain: "commerce",
    verb: "view",
    description: "See QR codes and their status.",
  },
  {
    key: "commerce.qr.create",
    domain: "commerce",
    verb: "create",
    description: "Generate new QR codes for menus, tables, properties.",
  },
  {
    key: "commerce.qr.manage",
    domain: "commerce",
    verb: "manage",
    description: "Activate, deactivate and regenerate QR codes.",
  },
  {
    key: "commerce.order.view",
    domain: "commerce",
    verb: "view",
    description: "See digital orders from QR and online channels.",
  },
  {
    key: "commerce.order.manage",
    domain: "commerce",
    verb: "manage",
    description: "Manage digital orders and their status.",
  },
  {
    key: "commerce.booking.view",
    domain: "commerce",
    verb: "view",
    description: "See direct hotel bookings.",
  },
  {
    key: "commerce.booking.manage",
    domain: "commerce",
    verb: "manage",
    description: "Manage direct hotel bookings.",
  },
  {
    key: "commerce.table_request.view",
    domain: "commerce",
    verb: "view",
    description: "See table-side service requests.",
  },
  {
    key: "commerce.table_request.manage",
    domain: "commerce",
    verb: "manage",
    description: "Acknowledge and resolve table requests.",
  },
  {
    key: "commerce.settings.view",
    domain: "commerce",
    verb: "view",
    description: "See commerce feature settings for a property.",
  },
  {
    key: "commerce.settings.manage",
    domain: "commerce",
    verb: "manage",
    description: "Configure commerce feature flags and settings.",
  },
  {
    key: "commerce.analytics.view",
    domain: "commerce",
    verb: "view",
    description: "See commerce analytics and channel performance.",
  },

  // -------------------------------------------------------------------- enterprise
  {
    key: "enterprise.view",
    domain: "enterprise",
    verb: "view",
    description: "Access the enterprise multi-property layer.",
  },
  {
    key: "enterprise.dashboard.view",
    domain: "enterprise",
    verb: "view",
    description: "See the enterprise command center with consolidated metrics.",
  },
  {
    key: "enterprise.reporting.view",
    domain: "enterprise",
    verb: "view",
    description: "View enterprise-level reports across properties.",
  },
  {
    key: "enterprise.reporting.export",
    domain: "enterprise",
    verb: "export",
    description: "Export enterprise reports.",
  },
  {
    key: "enterprise.property.view",
    domain: "enterprise",
    verb: "view",
    description: "See all properties in the organization from the enterprise view.",
  },
  {
    key: "enterprise.property.manage",
    domain: "enterprise",
    verb: "manage",
    description: "Assign properties to groups and manage property-level settings.",
  },
  {
    key: "enterprise.group.view",
    domain: "enterprise",
    verb: "view",
    description: "See property groups and their membership.",
  },
  {
    key: "enterprise.group.manage",
    domain: "enterprise",
    verb: "manage",
    description: "Create, edit and archive property groups.",
  },
  {
    key: "enterprise.alerts.view",
    domain: "enterprise",
    verb: "view",
    description: "See the attention center with aggregated alerts across properties.",
  },
  {
    key: "enterprise.global_search.view",
    domain: "enterprise",
    verb: "view",
    description: "Use enterprise-wide search across all properties.",
  },
  {
    key: "enterprise.master.view",
    domain: "enterprise",
    verb: "view",
    description: "See organization-level master data templates.",
  },
  {
    key: "enterprise.master.manage",
    domain: "enterprise",
    verb: "manage",
    description: "Create and manage organization-level master data templates.",
  },
  {
    key: "enterprise.module_config.view",
    domain: "enterprise",
    verb: "view",
    description: "See which modules are enabled for each property.",
  },
  {
    key: "enterprise.module_config.manage",
    domain: "enterprise",
    verb: "manage",
    description: "Enable or disable modules for individual properties.",
  },

  // ---------------------------------------------------------------------- billing
  // SaaS subscription billing (046): the platform's own revenue layer, separate
  // from the hospitality finance (folios, bills) which tracks the customer's
  // business transactions. Plan management is platform-only; subscriptions,
  // billing accounts, invoices and payments are org-scoped.
  {
    key: "billing.plan.view",
    domain: "billing",
    verb: "view",
    description: "See the subscription plans the platform offers.",
  },
  {
    key: "billing.plan.manage",
    domain: "billing",
    verb: "manage",
    description: "Create, edit and archive subscription plans (platform admin).",
  },
  {
    key: "billing.subscription.view",
    domain: "billing",
    verb: "view",
    description: "See the organization's subscription, status and billing period.",
  },
  {
    key: "billing.subscription.manage",
    domain: "billing",
    verb: "manage",
    description: "Start, change, upgrade, downgrade or cancel the subscription.",
  },
  {
    key: "billing.account.view",
    domain: "billing",
    verb: "view",
    description: "See the billing account: contact details, address, tax ID.",
  },
  {
    key: "billing.account.manage",
    domain: "billing",
    verb: "manage",
    description: "Edit the billing account details for invoices.",
  },
  {
    key: "billing.invoice.view",
    domain: "billing",
    verb: "view",
    description: "See the organization's SaaS invoices and their lines.",
  },
  {
    key: "billing.invoice.manage",
    domain: "billing",
    verb: "manage",
    description: "Create and void SaaS invoices.",
  },
  {
    key: "billing.payment.view",
    domain: "billing",
    verb: "view",
    description: "See the payments recorded against SaaS invoices.",
  },
  {
    key: "billing.payment.manage",
    domain: "billing",
    verb: "manage",
    description: "Record a payment against a SaaS invoice.",
  },
  {
    key: "billing.usage.view",
    domain: "billing",
    verb: "view",
    description: "See the organization's usage against plan limits.",
  },
  {
    key: "billing.settings.view",
    domain: "billing",
    verb: "view",
    description: "See the platform's billing settings (grace period, due days).",
  },
  {
    key: "billing.settings.manage",
    domain: "billing",
    verb: "manage",
    description: "Edit the platform's billing settings (platform admin).",
  },

  // -------------------------------------------------------------- notifications
  {
    key: "notifications.view",
    domain: "notifications",
    verb: "view",
    description: "See notifications for your organization.",
  },
  {
    key: "notifications.manage",
    domain: "notifications",
    verb: "manage",
    description: "Create, mark read, and archive notifications.",
  },
  {
    key: "notifications.preference.view",
    domain: "notifications",
    verb: "view",
    description: "See your notification delivery preferences.",
  },
  {
    key: "notifications.preference.manage",
    domain: "notifications",
    verb: "manage",
    description: "Change your notification delivery preferences.",
  },

  // ------------------------------------------------------------- communications
  {
    key: "communications.view",
    domain: "communications",
    verb: "view",
    description: "See communication messages (email, SMS, WhatsApp) for your organization.",
  },
  {
    key: "communications.manage",
    domain: "communications",
    verb: "manage",
    description: "Queue and manage outbound communications.",
  },
  {
    key: "communications.template.view",
    domain: "communications",
    verb: "view",
    description: "See notification and communication templates.",
  },
  {
    key: "communications.template.manage",
    domain: "communications",
    verb: "manage",
    description: "Create and edit notification/communication templates.",
  },

  // ----------------------------------------------------------------- automation
  {
    key: "automation.view",
    domain: "automation",
    verb: "view",
    description: "See automation rules for your organization.",
  },
  {
    key: "automation.create",
    domain: "automation",
    verb: "create",
    description: "Create new automation rules.",
  },
  {
    key: "automation.edit",
    domain: "automation",
    verb: "edit",
    description: "Edit automation rule conditions and actions.",
  },
  {
    key: "automation.enable",
    domain: "automation",
    verb: "enable",
    description: "Activate automation rules.",
  },
  {
    key: "automation.disable",
    domain: "automation",
    verb: "disable",
    description: "Deactivate automation rules.",
  },
  {
    key: "automation.history.view",
    domain: "automation",
    verb: "view",
    description: "See automation execution history and logs.",
  },

  // --------------------------------------------------------------------- analytics
  // Prompt #18's analytics and reporting engine: KPIs, trends, change detection,
  // attention center, and domain-specific analytics pages. Reads from existing
  // operational tables; no competing calculations.
  {
    key: "analytics.view",
    domain: "analytics",
    verb: "view",
    description: "Open the analytics module and see the owner command center.",
  },
  {
    key: "analytics.dashboard.view",
    domain: "analytics",
    verb: "view",
    description: "See the owner command center with KPIs, trends and attention items.",
  },
  {
    key: "analytics.kpi.view",
    domain: "analytics",
    verb: "view",
    description: "See key performance indicators and their trends.",
  },
  {
    key: "analytics.revenue.view",
    domain: "analytics",
    verb: "view",
    description: "See revenue analytics and breakdowns by category.",
  },
  {
    key: "analytics.profitability.view",
    domain: "analytics",
    verb: "view",
    description: "See profitability, margins and cost analytics.",
  },
  {
    key: "analytics.restaurant.view",
    domain: "analytics",
    verb: "view",
    description: "See restaurant-specific analytics: covers, ticket size, outlet performance.",
  },
  {
    key: "analytics.hotel.view",
    domain: "analytics",
    verb: "view",
    description: "See hotel-specific analytics: occupancy, ADR, RevPAR.",
  },
  {
    key: "analytics.events.view",
    domain: "analytics",
    verb: "view",
    description: "See events analytics: bookings, revenue, venue utilization.",
  },
  {
    key: "analytics.inventory.view",
    domain: "analytics",
    verb: "view",
    description: "See inventory analytics: stock levels, consumption, wastage.",
  },
  {
    key: "analytics.procurement.view",
    domain: "analytics",
    verb: "view",
    description: "See procurement analytics: spend, supplier performance, lead times.",
  },
  {
    key: "analytics.finance.view",
    domain: "analytics",
    verb: "view",
    description: "See finance analytics: cash flow, receivables, payables.",
  },
  {
    key: "analytics.crm.view",
    domain: "analytics",
    verb: "view",
    description: "See CRM analytics: customer acquisition, retention, segments.",
  },
  {
    key: "analytics.hr.view",
    domain: "analytics",
    verb: "view",
    description: "See HR analytics: headcount, attendance, labor costs.",
  },
  {
    key: "analytics.commerce.view",
    domain: "analytics",
    verb: "view",
    description: "See commerce analytics: channel performance, digital orders.",
  },
  {
    key: "analytics.enterprise.view",
    domain: "analytics",
    verb: "view",
    description: "See enterprise-wide analytics comparing properties.",
  },
  {
    key: "analytics.export",
    domain: "analytics",
    verb: "export",
    description: "Export analytics reports and data.",
  },
  // integrations & API platform (050) — 15 tokens for managing external connections
  {
    key: "integrations.view",
    domain: "integrations",
    verb: "view",
    description: "See configured integrations and their status.",
  },
  {
    key: "integrations.manage",
    domain: "integrations",
    verb: "manage",
    description: "Create, configure and manage integrations.",
  },
  {
    key: "integrations.connect",
    domain: "integrations",
    verb: "connect",
    description: "Connect new integrations to external systems.",
  },
  {
    key: "integrations.disconnect",
    domain: "integrations",
    verb: "disconnect",
    description: "Disconnect integrations from external systems.",
  },
  {
    key: "integrations.test",
    domain: "integrations",
    verb: "test",
    description: "Test integration connections.",
  },
  {
    key: "integrations.logs.view",
    domain: "integrations",
    verb: "view",
    description: "View integration operation logs.",
  },
  {
    key: "integrations.webhook.view",
    domain: "integrations",
    verb: "view",
    description: "See webhook endpoints and delivery status.",
  },
  {
    key: "integrations.webhook.manage",
    domain: "integrations",
    verb: "manage",
    description: "Create and manage webhook endpoints.",
  },
  {
    key: "integrations.mapping.view",
    domain: "integrations",
    verb: "view",
    description: "See external entity mappings.",
  },
  {
    key: "integrations.mapping.manage",
    domain: "integrations",
    verb: "manage",
    description: "Create and manage external entity mappings.",
  },
  {
    key: "api_keys.view",
    domain: "integrations",
    verb: "view",
    description: "See API keys and their status.",
  },
  {
    key: "api_keys.create",
    domain: "integrations",
    verb: "create",
    description: "Create new API keys.",
  },
  {
    key: "api_keys.revoke",
    domain: "integrations",
    verb: "revoke",
    description: "Revoke API keys.",
  },
  {
    key: "api_keys.rotate",
    domain: "integrations",
    verb: "rotate",
    description: "Rotate API keys.",
  },
  {
    key: "api.access",
    domain: "integrations",
    verb: "access",
    description: "Access the public API.",
  },
  // ---------------------------------------------------------------- documents
  {
    key: "documents.view",
    domain: "documents",
    verb: "view",
    description: "View documents and document center.",
  },
  {
    key: "documents.upload",
    domain: "documents",
    verb: "upload",
    description: "Upload new documents.",
  },
  {
    key: "documents.create",
    domain: "documents",
    verb: "create",
    description: "Create document records.",
  },
  {
    key: "documents.edit",
    domain: "documents",
    verb: "edit",
    description: "Edit document metadata.",
  },
  {
    key: "documents.archive",
    domain: "documents",
    verb: "archive",
    description: "Archive documents.",
  },
  {
    key: "documents.delete",
    domain: "documents",
    verb: "delete",
    description: "Delete documents.",
  },
  {
    key: "documents.download",
    domain: "documents",
    verb: "download",
    description: "Download documents.",
  },
  {
    key: "documents.share",
    domain: "documents",
    verb: "share",
    description: "Share documents with external parties.",
  },
  {
    key: "documents.manage_templates",
    domain: "documents",
    verb: "manage",
    description: "Create and manage document templates.",
  },
  {
    key: "documents.generate",
    domain: "documents",
    verb: "generate",
    description: "Generate documents from templates.",
  },
  {
    key: "documents.export",
    domain: "documents",
    verb: "export",
    description: "Export documents.",
  },
  // -------------------------------------------------------------------- workflow
  // Prompt #26's operational workflow, task and approval layer. One canonical task
  // overlay wraps domain-specific tasks; workflows orchestrate multi-step processes;
  // approvals gate sensitive decisions. All in-memory for now.
  {
    key: "task.view",
    domain: "task",
    verb: "view",
    description: "See operational tasks on the task board and personal work view.",
  },
  {
    key: "task.create",
    domain: "task",
    verb: "create",
    description: "Create a new operational task.",
  },
  {
    key: "task.assign",
    domain: "task",
    verb: "assign",
    description: "Assign a task to a team or person.",
  },
  {
    key: "task.start",
    domain: "task",
    verb: "start",
    description: "Start working on an assigned task.",
  },
  {
    key: "task.complete",
    domain: "task",
    verb: "complete",
    description: "Mark a task as completed.",
  },
  {
    key: "task.cancel",
    domain: "task",
    verb: "cancel",
    description: "Cancel a task with a recorded reason.",
  },
  {
    key: "task.reassign",
    domain: "task",
    verb: "reassign",
    description: "Reassign a task to a different team or person.",
  },
  {
    key: "approval.view",
    domain: "approval",
    verb: "view",
    description: "See approval requests in the approval center.",
  },
  {
    key: "approval.approve",
    domain: "approval",
    verb: "approve",
    description: "Approve a pending approval request.",
  },
  {
    key: "approval.reject",
    domain: "approval",
    verb: "reject",
    description: "Reject an approval request with a reason.",
  },
  {
    key: "approval.delegate",
    domain: "approval",
    verb: "delegate",
    description: "Delegate an approval to another person.",
  },
  {
    key: "workflow.view",
    domain: "workflow",
    verb: "view",
    description: "See workflow instances and their step progress.",
  },
  {
    key: "workflow.manage",
    domain: "workflow",
    verb: "manage",
    description: "Start, pause, resume and cancel workflow instances.",
  },
  {
    key: "workflow.create",
    domain: "workflow",
    verb: "create",
    description: "Trigger a new workflow instance.",
  },
  // ---------------------------------------------------------------- settings
  {
    key: "settings.view",
    domain: "settings",
    verb: "view",
    description: "View business configuration and settings.",
  },
  {
    key: "settings.edit",
    domain: "settings",
    verb: "edit",
    description: "Edit business configuration settings.",
  },
  {
    key: "settings.edit_sensitive",
    domain: "settings",
    verb: "edit",
    description: "Edit sensitive settings (discounts, approvals, finance).",
  },
  {
    key: "settings.edit_critical",
    domain: "settings",
    verb: "edit",
    description: "Edit critical settings (security, backdated transactions).",
  },
  {
    key: "settings.view_audit",
    domain: "settings",
    verb: "view",
    description: "View configuration change history.",
  },
  {
    key: "settings.rollback",
    domain: "settings",
    verb: "edit",
    description: "Rollback settings to previous values.",
  },

  // ---------------------------------------------------------------------- revenue
  // Prompt #27's revenue management layer: pricing, rate plans, promotions,
  // demand signals, yield recommendations, price history, and what-if simulations.
  // No autonomous pricing — every recommendation is "suggested review", the owner decides.
  {
    key: "revenue.view",
    domain: "revenue",
    verb: "view",
    description: "See the revenue management dashboard with pricing insights.",
  },
  {
    key: "revenue.pricing.view",
    domain: "revenue",
    verb: "view",
    description: "See price calculations, history, and rate plans.",
  },
  {
    key: "revenue.pricing.edit",
    domain: "revenue",
    verb: "edit",
    description: "Update base prices, rate plans, and channel pricing.",
  },
  {
    key: "revenue.promotion.view",
    domain: "revenue",
    verb: "view",
    description: "See promotions and their usage.",
  },
  {
    key: "revenue.promotion.create",
    domain: "revenue",
    verb: "create",
    description: "Create new promotions and discount campaigns.",
  },
  {
    key: "revenue.promotion.edit",
    domain: "revenue",
    verb: "edit",
    description: "Edit active promotions and their terms.",
  },
  {
    key: "revenue.demand.view",
    domain: "revenue",
    verb: "view",
    description: "See demand signals and occupancy analysis.",
  },
  {
    key: "revenue.recommendation.view",
    domain: "revenue",
    verb: "view",
    description: "See revenue recommendations and yield intelligence.",
  },
  {
    key: "revenue.recommendation.review",
    domain: "revenue",
    verb: "review",
    description: "Accept or reject revenue recommendations.",
  },
  {
    key: "revenue.simulation.create",
    domain: "revenue",
    verb: "create",
    description: "Run what-if pricing simulations.",
  },
  {
    key: "revenue.guardrails.edit",
    domain: "revenue",
    verb: "edit",
    description: "Configure pricing guardrails and approval thresholds.",
  },
  // Supply chain intelligence (Prompt #28) — procurement intelligence, supplier management, cost analytics.
  {
    key: "supply_chain.view",
    domain: "supply_chain",
    verb: "view",
    description: "View the procurement dashboard and supply chain intelligence.",
  },
  {
    key: "supply_chain.intelligence.view",
    domain: "supply_chain",
    verb: "view",
    description: "View procurement cost intelligence and spend analytics.",
  },
  {
    key: "supply_chain.supplier.view",
    domain: "supply_chain",
    verb: "view",
    description: "View supplier 360 profiles and performance scorecards.",
  },
  {
    key: "supply_chain.issue.view",
    domain: "supply_chain",
    verb: "view",
    description: "View supplier issues and quality tracking.",
  },
  {
    key: "supply_chain.issue.create",
    domain: "supply_chain",
    verb: "create",
    description: "Create supplier issue reports.",
  },
  {
    key: "supply_chain.issue.resolve",
    domain: "supply_chain",
    verb: "resolve",
    description: "Resolve or close supplier issues.",
  },
  {
    key: "supply_chain.contract.view",
    domain: "supply_chain",
    verb: "view",
    description: "View supplier contracts and terms.",
  },
  {
    key: "supply_chain.contract.create",
    domain: "supply_chain",
    verb: "create",
    description: "Create supplier contracts.",
  },
  {
    key: "supply_chain.plan.view",
    domain: "supply_chain",
    verb: "view",
    description: "View purchase plans and reorder suggestions.",
  },
  {
    key: "supply_chain.plan.create",
    domain: "supply_chain",
    verb: "create",
    description: "Create purchase plans.",
  },
  {
    key: "supply_chain.plan.approve",
    domain: "supply_chain",
    verb: "approve",
    description: "Approve purchase plans for conversion to purchase requests.",
  },
  {
    key: "supply_chain.calendar.view",
    domain: "supply_chain",
    verb: "view",
    description: "View the procurement calendar with deliveries, payments and contract expiries.",
  },
  {
    key: "supply_chain.anomaly.view",
    domain: "supply_chain",
    verb: "view",
    description: "View cost anomalies and procurement risk alerts.",
  },

  // --------------------------------------------------------------- experience
  // Prompt #29's guest experience layer: feedback, complaints, service recovery,
  // review management, and experience analytics. Extends CRM entities with an
  // operational overlay for closed-loop guest experience management.
  {
    key: "experience.view",
    domain: "experience",
    verb: "view",
    description: "Open the guest experience module.",
  },
  {
    key: "experience.feedback.view",
    domain: "experience",
    verb: "feedback.view",
    description: "See guest feedback records and responses.",
  },
  {
    key: "experience.feedback.create",
    domain: "experience",
    verb: "feedback.create",
    description: "Record new guest feedback.",
  },
  {
    key: "experience.feedback.edit",
    domain: "experience",
    verb: "feedback.edit",
    description: "Edit feedback records and update their status.",
  },
  {
    key: "experience.feedback.manage",
    domain: "experience",
    verb: "feedback.manage",
    description: "Manage feedback lifecycle including resolution and closure.",
  },
  {
    key: "experience.complaint.view",
    domain: "experience",
    verb: "complaint.view",
    description: "See guest complaints and their current status.",
  },
  {
    key: "experience.complaint.create",
    domain: "experience",
    verb: "complaint.create",
    description: "Log a new guest complaint.",
  },
  {
    key: "experience.complaint.assign",
    domain: "experience",
    verb: "complaint.assign",
    description: "Assign complaints to team members or departments.",
  },
  {
    key: "experience.complaint.manage",
    domain: "experience",
    verb: "complaint.manage",
    description: "Manage complaint lifecycle and status transitions.",
  },
  {
    key: "experience.complaint.resolve",
    domain: "experience",
    verb: "complaint.resolve",
    description: "Mark complaints as resolved with resolution details.",
  },
  {
    key: "experience.complaint.close",
    domain: "experience",
    verb: "complaint.close",
    description: "Close resolved complaints after follow-up.",
  },
  {
    key: "experience.recovery.view",
    domain: "experience",
    verb: "recovery.view",
    description: "See service recovery actions and their status.",
  },
  {
    key: "experience.recovery.create",
    domain: "experience",
    verb: "recovery.create",
    description: "Propose service recovery actions for guest issues.",
  },
  {
    key: "experience.recovery.approve",
    domain: "experience",
    verb: "recovery.approve",
    description: "Approve proposed service recovery actions.",
  },
  {
    key: "experience.recovery.execute",
    domain: "experience",
    verb: "recovery.execute",
    description: "Execute approved service recovery actions.",
  },
  {
    key: "experience.analytics.view",
    domain: "experience",
    verb: "analytics.view",
    description: "See experience analytics dashboards and KPIs.",
  },
  {
    key: "experience.review.view",
    domain: "experience",
    verb: "review.view",
    description: "See review requests and responses.",
  },
  {
    key: "experience.review.manage",
    domain: "experience",
    verb: "review.manage",
    description: "Manage review request lifecycle.",
  },
  {
    key: "experience.review.approve",
    domain: "experience",
    verb: "review.approve",
    description: "Approve guest reviews for publication.",
  },
  {
    key: "experience.review.publish",
    domain: "experience",
    verb: "review.publish",
    description: "Publish approved guest reviews.",
  },
  // ─── Marketing, campaigns & customer engagement (Prompt #30) ─────────
  {
    key: "marketing.view",
    domain: "marketing",
    verb: "view",
    description: "See the marketing dashboard and module overview.",
  },
  {
    key: "marketing.audience.view",
    domain: "marketing",
    verb: "audience.view",
    description: "View marketing audiences and segment definitions.",
  },
  {
    key: "marketing.audience.create",
    domain: "marketing",
    verb: "audience.create",
    description: "Create new marketing audiences and conditions.",
  },
  {
    key: "marketing.audience.edit",
    domain: "marketing",
    verb: "audience.edit",
    description: "Edit audience definitions and conditions.",
  },
  {
    key: "marketing.audience.delete",
    domain: "marketing",
    verb: "audience.delete",
    description: "Delete marketing audiences.",
  },
  {
    key: "marketing.campaign.view",
    domain: "marketing",
    verb: "campaign.view",
    description: "View marketing campaigns and their details.",
  },
  {
    key: "marketing.campaign.create",
    domain: "marketing",
    verb: "campaign.create",
    description: "Create new marketing campaigns.",
  },
  {
    key: "marketing.campaign.edit",
    domain: "marketing",
    verb: "campaign.edit",
    description: "Edit draft or paused campaigns.",
  },
  {
    key: "marketing.campaign.delete",
    domain: "marketing",
    verb: "campaign.delete",
    description: "Delete draft campaigns.",
  },
  {
    key: "marketing.campaign.launch",
    domain: "marketing",
    verb: "campaign.launch",
    description: "Launch or activate marketing campaigns.",
  },
  {
    key: "marketing.campaign.approve",
    domain: "marketing",
    verb: "campaign.approve",
    description: "Approve campaigns pending review before launch.",
  },
  {
    key: "marketing.offer.view",
    domain: "marketing",
    verb: "offer.view",
    description: "View marketing offers and promo codes.",
  },
  {
    key: "marketing.offer.create",
    domain: "marketing",
    verb: "offer.create",
    description: "Create new offers and promotion codes.",
  },
  {
    key: "marketing.offer.edit",
    domain: "marketing",
    verb: "offer.edit",
    description: "Edit active or draft offers.",
  },
  {
    key: "marketing.message.view",
    domain: "marketing",
    verb: "message.view",
    description: "View campaign messages and delivery records.",
  },
  {
    key: "marketing.message.send",
    domain: "marketing",
    verb: "message.send",
    description: "Send or schedule campaign messages.",
  },
  {
    key: "marketing.analytics.view",
    domain: "marketing",
    verb: "analytics.view",
    description: "See marketing performance analytics and KPIs.",
  },
  {
    key: "marketing.automation.view",
    domain: "marketing",
    verb: "automation.view",
    description: "View marketing automation journeys and rules.",
  },
  {
    key: "marketing.automation.create",
    domain: "marketing",
    verb: "automation.create",
    description: "Create new marketing automation journeys.",
  },
  {
    key: "marketing.automation.edit",
    domain: "marketing",
    verb: "automation.edit",
    description: "Edit automation journey steps and triggers.",
  },
  {
    key: "marketing.consent.view",
    domain: "marketing",
    verb: "consent.view",
    description: "View customer marketing consent records.",
  },
  {
    key: "marketing.consent.edit",
    domain: "marketing",
    verb: "consent.edit",
    description: "Update customer marketing consent preferences.",
  },
  {
    key: "marketing.review.approve",
    domain: "marketing",
    verb: "review.approve",
    description: "Approve marketing content for publication.",
  },
  {
    key: "marketing.settings.manage",
    domain: "marketing",
    verb: "settings.manage",
    description: "Manage marketing module settings and frequency policies.",
  },
  // ── Guest Experience (Prompt #31) ──────────────────────────────────────
  {
    key: "guest_experience.view",
    domain: "guest_experience",
    verb: "view",
    description: "View the guest experience hub and portal overview.",
  },
  {
    key: "guest_experience.request.view",
    domain: "guest_experience",
    verb: "request.view",
    description: "View guest service requests and their status.",
  },
  {
    key: "guest_experience.request.create",
    domain: "guest_experience",
    verb: "request.create",
    description: "Create new guest service requests on behalf of guests.",
  },
  {
    key: "guest_experience.request.manage",
    domain: "guest_experience",
    verb: "request.manage",
    description: "Acknowledge, assign, and complete guest service requests.",
  },
  {
    key: "guest_experience.checkin.view",
    domain: "guest_experience",
    verb: "checkin.view",
    description: "View digital pre-check-in records and guest details.",
  },
  {
    key: "guest_experience.checkin.manage",
    domain: "guest_experience",
    verb: "checkin.manage",
    description: "Process and complete digital pre-check-in submissions.",
  },
  {
    key: "guest_experience.document.view",
    domain: "guest_experience",
    verb: "document.view",
    description: "View guest identity documents and verification status.",
  },
  {
    key: "guest_experience.document.manage",
    domain: "guest_experience",
    verb: "document.manage",
    description: "Verify or reject guest identity documents.",
  },
  {
    key: "guest_experience.conversation.view",
    domain: "guest_experience",
    verb: "conversation.view",
    description: "View guest conversations and AI concierge chats.",
  },
  {
    key: "guest_experience.conversation.manage",
    domain: "guest_experience",
    verb: "conversation.manage",
    description: "Respond to guest conversations and perform human handoff.",
  },
  {
    key: "guest_experience.analytics.view",
    domain: "guest_experience",
    verb: "analytics.view",
    description: "View guest experience KPIs and digital engagement metrics.",
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
