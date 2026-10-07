/**
 * The restaurant floor: dining areas and tables (Prompt #04 §18-§22, migration 015).
 *
 * Types only — no service, no hook, no screen. This module is the client's mirror of two
 * tables, and it exists for one reason: every list below is a picker's contents, and a
 * picker that offers a value the database's CHECK refuses is a 500 at the door. So each
 * array is compared by `domain/identity/taxonomy.test.ts` against the CHECK constraint in
 * `db/supabase/015_restaurant_tables.sql`, in both directions, exactly as the identity
 * vocabularies are compared against 001/002.
 *
 * Hierarchy: Outlet → DiningArea → RestaurantTable.
 *
 *   DiningArea       = one section of one restaurant (Main Hall, Outdoor, Rooftop). §19 asks
 *                      for this single concept explicitly, so there is no `Floor` above it
 *                      and nothing generic about the tree: two levels, then covers.
 *   RestaurantTable  = a cover inside a section, with a capacity, an outlet-unique code and a
 *                      place on §21's floor map.
 *
 * Tenancy rule, unchanged from 001: every row carries the ids of ALL its ancestors, and 015's
 * `app.assert_dining_chain()` trigger refuses a write whose copied ancestors disagree with the
 * parent's — including a table whose own outlet does not match its area's outlet.
 */

/**
 * An area's whole lifecycle. There is no "busy" or "closed tonight" here: those are facts
 * about the tables inside an area, and 015 keeps lifecycle and operation apart for the same
 * reason 014 keeps a menu item's `status` apart from its `is_available`.
 */
export type DiningAreaStatus = "ACTIVE" | "ARCHIVED";

/** A table's archival lifecycle — the same two values, and the same deliberate absence. */
export type RestaurantTableStatus = "ACTIVE" | "ARCHIVED";

/**
 * The ONLY operational states a person may set (§20).
 *
 * `OCCUPIED` and `RESERVED` are missing on purpose, and this array is the client half of that
 * wall: the schema's CHECK excludes them, `set_table_service_status` refuses them, and a UI
 * that offered one would be a bug in three places at once. They are DERIVED — OCCUPIED from a
 * live order (016), RESERVED from a live reservation (Prompt #08) — and the resolution is
 * added by the migration that can see those rows, never by a screen writing a guess.
 */
export type TableServiceStatus = "AVAILABLE" | "CLEANING" | "OUT_OF_SERVICE";

/**
 * Silhouettes §21's floor map can draw. Nullable on the row: a table with no shape is simply
 * drawn as a card. `OTHER` exists so an unusual cover does not force a new migration, and it
 * is the whole extension story — 014 gave menu items a `jsonb attributes` bag because items
 * genuinely vary; a table's remaining facts are its capacity and its name.
 */
export type TableShape = "ROUND" | "SQUARE" | "RECTANGLE" | "OVAL" | "BOOTH" | "OTHER";

export const DINING_AREA_STATUSES: readonly DiningAreaStatus[] = ["ACTIVE", "ARCHIVED"];

export const RESTAURANT_TABLE_STATUSES: readonly RestaurantTableStatus[] = [
  "ACTIVE",
  "ARCHIVED",
];

export const TABLE_SERVICE_STATUSES: readonly TableServiceStatus[] = [
  "AVAILABLE",
  "CLEANING",
  "OUT_OF_SERVICE",
];

export const TABLE_SHAPES: readonly TableShape[] = [
  "ROUND",
  "SQUARE",
  "RECTANGLE",
  "OVAL",
  "BOOTH",
  "OTHER",
];

/**
 * A `dining_areas` row exactly as stored.
 *
 * Snake_case on purpose: 015 ships no read door, because the floor map is a plain SELECT on
 * these two tables under their outlet policies. So this is the shape `rows()` hands back
 * before any camel mapping — the columns, not a second model of them.
 */
export type DiningAreaRow = {
  id: string;
  organization_id: string;
  property_id: string;
  outlet_id: string;
  name: string;
  /** NULL when the operator left it blank; an empty string never reaches the row. */
  description: string | null;
  /** Unique per outlet among live areas. Deterministic order, not "whatever the DB returns". */
  display_order: number;
  status: DiningAreaStatus;
  archived_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

/** A `restaurant_tables` row exactly as stored. */
export type RestaurantTableRow = {
  id: string;
  organization_id: string;
  property_id: string;
  outlet_id: string;
  area_id: string;
  name: string;
  /** Unique across the OUTLET among live rows — the handle an order, KOT and bill print. */
  code: string;
  capacity: number;
  status: RestaurantTableStatus;
  service_status: TableServiceStatus;
  /** Unique per AREA among live rows. */
  display_order: number;
  /**
   * Floor-map canvas coordinates (0-10000), NOT money: 015 bounds them with a plain sanity
   * CHECK and deliberately applies no scale rule, because a scale rule is an accounting
   * statement. NULL means the map places the cover itself.
   */
  position_x: number | null;
  position_y: number | null;
  shape: TableShape | null;
  archived_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};
