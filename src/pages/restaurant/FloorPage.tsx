/**
 * The floor — the sections of the ACTIVE OUTLET and the covers inside them (§21's map).
 *
 * The screen never chooses its own scope: it reads `organizationId` + `propertyId` +
 * `outletId` from the context store and lists the floor under exactly that triple, because an
 * outlet IS the restaurant (contract §12). With no outlet selected it renders the deliberate
 * "choose an outlet first" state rather than an empty map that reads as lost data.
 *
 * Five schema facts decide what this screen can offer:
 *
 *   - It draws FIVE statuses but writes THREE. `restaurant_table_status` (016) resolves
 *     OUT_OF_SERVICE > CLEANING > OCCUPIED > RESERVED > AVAILABLE; OCCUPIED comes from a live
 *     order and is absent from 015's CHECK, so no picker here contains it. A cover with a guest
 *     on it shows "Occupied" because the database said so, never because somebody set it.
 *   - A status change always costs a reason — including the one back to Available. That is
 *     `set_table_service_status`'s `p_reason`, so the sheet keeps its reason field open for
 *     every direction rather than only the negative ones.
 *   - Retirement is one-way. 015 ships archive doors with no restore twin, so a retired section
 *     or cover is retired for good; the archived view shows history, it does not offer a button.
 *   - Placement cannot be undone. `update_restaurant_table` coalesces `shape` and the two canvas
 *     coordinates, so an omitted key leaves the column alone and nothing clears it — the editor
 *     says so instead of offering an "unset" that would silently do nothing.
 *   - Reorder is a full permutation. The doors refuse a list that is not exactly the live set,
 *     so Up/Down sends the whole visible order of that section, never a diff.
 *
 * §22's "never colour alone" is honoured by construction: every status on the map carries an
 * icon AND a word, and the legend spells the same five pairs out.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Ban,
  Check,
  CircleSlash,
  Lock,
  LogIn,
  Pencil,
  Plus,
  Sparkles,
  Store,
  Users,
} from "lucide-react";
import type { ComponentType } from "react";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { ArchiveDialog } from "@/components/ui/ArchiveDialog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { LoadingBlock } from "@/components/ui/Spinner";
import { SelectInput, type SelectOption } from "@/components/ui/SelectInput";
import { StatusPill } from "@/components/ui/StatusPill";
import { Switch } from "@/components/ui/Switch";
import { TextInput } from "@/components/ui/TextInput";
import { Textarea } from "@/components/ui/Textarea";
import { can, type ActiveContext } from "@/domain/identity/types";
import {
  TABLE_SERVICE_STATUSES,
  TABLE_SHAPES,
  type DiningArea,
  type RestaurantTable,
  type TableDerivedStatus,
  type TableServiceStatus,
  type TableShape,
  type TableStatus,
} from "@/domain/restaurant/types";
import {
  archiveDiningArea,
  archiveRestaurantTable,
  createDiningArea,
  createRestaurantTable,
  listDiningAreas,
  listTableStatuses,
  listTables,
  reorderDiningAreas,
  reorderTables,
  setTableServiceStatus,
  updateDiningArea,
  updateRestaurantTable,
  type ArchivedRead,
  type DiningAreaUpdate,
  type FloorScope,
  type NewDiningArea,
  type NewRestaurantTable,
  type RestaurantTableUpdate,
} from "@/domain/restaurant/floor-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

/* ------------------------------------------------------------------ pure rules */

/**
 * Which surface the screen shows for the session state. `unconfigured` and
 * `unauthenticated` must read honestly — never a spinner that waits forever, never an
 * empty floor that looks like somebody removed the tables.
 */
export type FloorPageView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_outlet"
  | "scoped";

export function pageStatusFor(status: ContextStatus, context: ActiveContext): FloorPageView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null &&
      context.propertyId !== null &&
      context.outletId !== null
      ? "scoped"
      : "no_outlet";
  }
  return "bootstrapping";
}

/** All three ancestors the floor scopes on; null until the session actually has them. */
export function floorScopeFor(context: ActiveContext): FloorScope | null {
  if (
    context.organizationId === null ||
    context.propertyId === null ||
    context.outletId === null
  ) {
    return null;
  }
  return {
    organizationId: context.organizationId,
    propertyId: context.propertyId,
    outletId: context.outletId,
  };
}

/** Retired rows are excluded by default; the toggle opts them back in for the record. */
export function floorReadOptions(showArchived: boolean): ArchivedRead {
  return showArchived ? { includeArchived: true } : {};
}

/** 015's own patterns, spelled the way the door checks them. */
export const TABLE_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,23}$/;
export const AREA_NAME_MIN = 2;
export const AREA_NAME_MAX = 120;
export const TABLE_NAME_MAX = 60;
export const CAPACITY_MIN = 1;
export const CAPACITY_MAX = 100;
export const POSITION_MAX = 10000;

/** One cover with the operational truth the view resolved for it. */
export type FloorTile = {
  table: RestaurantTable;
  /** Null when the view had no row for it — an archived cover, which draws as retired. */
  status: TableStatus | null;
};

export type FloorSection = {
  area: DiningArea;
  tiles: FloorTile[];
};

/**
 * The floor's whole read in one grouping: sections in the operator's order, each holding its
 * live covers in theirs.
 *
 * A tile with no status row is kept and drawn as AVAILABLE rather than dropped: the table list
 * and the view are two reads, and a cover that is simply missing from the second must not
 * vanish from the map a manager is counting seats on.
 */
export function floorSections(
  areas: readonly DiningArea[],
  tables: readonly RestaurantTable[],
  statuses: readonly TableStatus[],
): FloorSection[] {
  const byId = new Map(statuses.map((status) => [status.tableId, status]));
  const byArea = new Map<string, FloorTile[]>();
  for (const table of tables) {
    const tiles = byArea.get(table.areaId) ?? [];
    tiles.push({ table, status: byId.get(table.id) ?? null });
    byArea.set(table.areaId, tiles);
  }
  return [...areas]
    .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name))
    .map((area) => ({
      area,
      tiles: (byArea.get(area.id) ?? []).sort(
        (a, b) => a.table.displayOrder - b.table.displayOrder || a.table.code.localeCompare(b.table.code),
      ),
    }));
}

/** Seats in a section — the number a manager actually reads off a floor map. */
export function sectionSeats(tiles: readonly FloorTile[]): number {
  return tiles
    .filter((tile) => tile.table.status === "ACTIVE")
    .reduce((sum, tile) => sum + tile.table.capacity, 0);
}

/** The five derived states in precedence order, for the legend. */
export const DERIVED_ORDER: readonly TableDerivedStatus[] = [
  "AVAILABLE",
  "OCCUPIED",
  "RESERVED",
  "CLEANING",
  "OUT_OF_SERVICE",
];

/**
 * §22: never colour alone. Each state draws an icon and a word beside the pill, and the icon
 * choice is deliberately not a traffic light — out of service is a stated fact, not an alarm.
 */
export const STATUS_ICONS: Record<TableDerivedStatus, ComponentType<{ className?: string }>> = {
  AVAILABLE: Check,
  OCCUPIED: Users,
  RESERVED: Lock,
  CLEANING: Sparkles,
  "OUT_OF_SERVICE": Ban,
};

export function derivedStatusOf(tile: FloorTile): TableDerivedStatus {
  return tile.status?.derivedStatus ?? "AVAILABLE";
}

/**
 * The picker's contents — the THREE manual states only.
 *
 * This is the client half of 015's CHECK, and it is derived from the domain array rather than
 * typed out again, so 015's CHECK stays the single authority and this file holds no
 * second copy of the rule. OCCUPIED and RESERVED never appear here because no door accepts them.
 */
export function serviceStatusOptions(): SelectOption<TableServiceStatus>[] {
  return TABLE_SERVICE_STATUSES.map((value) => ({
    value,
    label: STATUS_LABELS[value],
  }));
}

const STATUS_LABELS: Record<TableDerivedStatus, string> = {
  AVAILABLE: "Available",
  OCCUPIED: "Occupied",
  RESERVED: "Reserved",
  CLEANING: "Cleaning",
  OUT_OF_SERVICE: "Out of service",
};

export function serviceStatusLabel(status: TableServiceStatus): string {
  return STATUS_LABELS[status];
}

/** Why the cover shows what it shows, in one line the sheet can print under the picker. */
export function derivedStatusExplanation(status: TableDerivedStatus): string {
  switch (status) {
    case "OCCUPIED":
      return "A live order is open on this cover, so the floor says Occupied. Nobody sets this, and setting a service status cannot clear it.";
    case "RESERVED":
      return "A reservation holds this cover. Prompt #08 owns that source row.";
    case "CLEANING":
      return "Someone has marked the cover as being cleared.";
    case "OUT_OF_SERVICE":
      return "This cover is broken or unusable and is off the floor until it is set back.";
    case "AVAILABLE":
      return "Nothing is held on this cover.";
  }
}

export function humanizeShape(shape: TableShape): string {
  return shape.charAt(0) + shape.slice(1).toLowerCase();
}

/**
 * The shape picker's contents. The blank entry means "no silhouette" on create and "leave the
 * stored one alone" on update — 015 cannot clear a shape, so there is no "unset" here.
 */
export function shapeOptions(): SelectOption<TableShape | "">[] {
  return [
    { value: "", label: "No shape (drawn as a card)" },
    ...TABLE_SHAPES.map((shape) => ({ value: shape, label: humanizeShape(shape) })),
  ];
}

/**
 * The ring a cover is drawn with. RECTANGLE and BOOTH stretch wide, ROUND and OVAL close into
 * a circle, an unknown silhouette is a plain card — the three ways 015 says a map may be drawn.
 */
export function shapeClass(shape: TableShape | null): string {
  if (shape === "ROUND" || shape === "OVAL") return "rounded-full";
  if (shape === "RECTANGLE" || shape === "BOOTH") return "rounded-xl";
  return "rounded-lg";
}

/** Canvas coordinates are geometry, not money: plain numbers, bounded by 015's sanity CHECK. */
export type PositionParse =
  | { ok: true; value: number | undefined }
  | { ok: false; error: string };

export function parsePosition(text: string): PositionParse {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: true, value: undefined };
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0 || value > POSITION_MAX) {
    return { ok: false, error: `Enter a number between 0 and ${POSITION_MAX}.` };
  }
  return { ok: true, value };
}

/* ------------------------------------------------------------------------- drafts */

export type AreaDraft = {
  name: string;
  description: string;
};

export function newAreaDraft(): AreaDraft {
  return { name: "", description: "" };
}

export function areaDraftFrom(area: DiningArea): AreaDraft {
  return { name: area.name, description: area.description ?? "" };
}

export type TableDraft = {
  areaId: string;
  name: string;
  code: string;
  capacity: string;
  shape: TableShape | "";
  positionX: string;
  positionY: string;
};

export function newTableDraft(areaId: string): TableDraft {
  return {
    areaId,
    name: "",
    code: "",
    capacity: "2",
    shape: "",
    positionX: "",
    positionY: "",
  };
}

export function tableDraftFrom(table: RestaurantTable): TableDraft {
  return {
    areaId: table.areaId,
    name: table.name,
    code: table.code,
    capacity: String(table.capacity),
    shape: table.shape ?? "",
    positionX: table.positionX === null ? "" : String(table.positionX),
    positionY: table.positionY === null ? "" : String(table.positionY),
  };
}

/**
 * Validation mirrors the door's CHECKs so an operator is stopped in the field rather than at
 * the door: section name 2-120, cover name 1-60, the code pattern, capacity 1-100, and the two
 * coordinates inside 0-10000 when written at all.
 */
export function validateAreaDraft(draft: AreaDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = draft.name.trim();
  if (name === "") errors.name = "A name is required.";
  else if (name.length < AREA_NAME_MIN || name.length > AREA_NAME_MAX) {
    errors.name = `Use between ${AREA_NAME_MIN} and ${AREA_NAME_MAX} characters.`;
  }
  return errors;
}

export function validateTableDraft(draft: TableDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (draft.areaId === "") errors.areaId = "Choose the section this cover sits in.";
  const name = draft.name.trim();
  if (name === "") errors.name = "A name is required.";
  else if (name.length > TABLE_NAME_MAX) errors.name = `Use at most ${TABLE_NAME_MAX} characters.`;
  const code = draft.code.trim();
  if (code === "") errors.code = "A code is required — it is what the ticket prints.";
  else if (!TABLE_CODE_PATTERN.test(code)) {
    errors.code = "Start with a letter or digit, then letters, digits, dots, hyphens or underscores (max 24).";
  }
  const capacity = Number(draft.capacity.trim());
  if (!Number.isInteger(capacity) || capacity < CAPACITY_MIN || capacity > CAPACITY_MAX) {
    errors.capacity = `Enter a whole number of covers between ${CAPACITY_MIN} and ${CAPACITY_MAX}.`;
  }
  const x = parsePosition(draft.positionX);
  if (!x.ok) errors.positionX = x.error;
  const y = parsePosition(draft.positionY);
  if (!y.ok) errors.positionY = y.error;
  return errors;
}

export function areaCreateInput(draft: AreaDraft, outletId: string): NewDiningArea {
  const input: NewDiningArea = { outletId, name: draft.name.trim() };
  if (draft.description.trim() !== "") input.description = draft.description.trim();
  return input;
}

/**
 * Update mapping under this domain's convention: unchanged fields are OMITTED (the door leaves
 * the column alone), and a description cleared by the operator is sent as `""`, which
 * `app.blankable` stores as NULL — never `null`, which the door reads as "not edited".
 */
export function areaUpdateInput(area: DiningArea, draft: AreaDraft): DiningAreaUpdate {
  const input: DiningAreaUpdate = { areaId: area.id, expectedVersion: area.version };
  const name = draft.name.trim();
  if (name.length >= AREA_NAME_MIN && name !== area.name) input.name = name;
  if (draft.description.trim() !== (area.description ?? "")) {
    input.description = draft.description.trim();
  }
  return input;
}

export function tableCreateInput(draft: TableDraft, areaId: string): NewRestaurantTable {
  const input: NewRestaurantTable = {
    areaId,
    name: draft.name.trim(),
    code: draft.code.trim(),
    capacity: Number(draft.capacity.trim()),
  };
  if (draft.shape !== "") input.shape = draft.shape;
  const x = parsePosition(draft.positionX);
  if (x.ok && x.value !== undefined) input.positionX = x.value;
  const y = parsePosition(draft.positionY);
  if (y.ok && y.value !== undefined) input.positionY = y.value;
  return input;
}

/**
 * The same omit-unchanged rule, plus one field no other screen here sends: `code`. 015 lets a
 * cover's handle be restated (an outlet's code cannot be), so a re-coded table is a legal edit
 * rather than a new cover — and the door still refuses a code another live cover in the outlet
 * already holds.
 */
export function tableUpdateInput(
  table: RestaurantTable,
  draft: TableDraft,
): RestaurantTableUpdate {
  const input: RestaurantTableUpdate = {
    tableId: table.id,
    expectedVersion: table.version,
  };
  const name = draft.name.trim();
  if (name !== "" && name !== table.name) input.name = name;
  const code = draft.code.trim();
  if (code !== "" && code !== table.code) input.code = code;
  const capacity = Number(draft.capacity.trim());
  if (Number.isInteger(capacity) && capacity !== table.capacity) input.capacity = capacity;
  if (draft.shape !== "" && draft.shape !== table.shape) input.shape = draft.shape;
  if (draft.areaId !== "" && draft.areaId !== table.areaId) input.areaId = draft.areaId;
  const x = parsePosition(draft.positionX);
  if (x.ok && x.value !== undefined && x.value !== table.positionX) input.positionX = x.value;
  const y = parsePosition(draft.positionY);
  if (y.ok && y.value !== undefined && y.value !== table.positionY) input.positionY = y.value;
  return input;
}

/**
 * Nothing to send is not a save. The identity keys every update input carries (`areaId` /
 * `tableId` plus `expectedVersion`) are subtracted, so a sheet that changed no field reports
 * that instead of calling a door that would bump the row's version for nothing.
 */
export function changedFieldCount(
  input: object,
  identityKeys: readonly string[],
): number {
  return Object.keys(input).filter((key) => !identityKeys.includes(key)).length;
}

const AREA_IDENTITY_KEYS = ["areaId", "expectedVersion"] as const;
const TABLE_IDENTITY_KEYS = ["tableId", "expectedVersion"] as const;

/* --------------------------------------------------------------------- ordering */

/**
 * Swap one entry with its neighbour and hand back the WHOLE permutation, because 015's reorder
 * doors refuse a partial list. null means "no move" (unknown id, or already at the edge).
 */
export function moveInOrder(
  ids: readonly string[],
  id: string,
  delta: number,
): string[] | null {
  const from = ids.indexOf(id);
  if (from < 0) return null;
  const to = from + delta;
  if (to < 0 || to >= ids.length) return null;
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** Archived rows take no rank, so a permutation is built from the live set in display order. */
export function liveAreaIds(areas: readonly DiningArea[]): string[] {
  return areas
    .filter((area) => area.status !== "ARCHIVED")
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((area) => area.id);
}

export function liveTableIdsInSection(section: FloorSection): string[] {
  return section.tiles
    .filter((tile) => tile.table.status !== "ARCHIVED")
    .map((tile) => tile.table.id);
}

/* ---------------------------------------------------------------------- failure */

/**
 * A refusal keeps the operator's input and shows the door's own sentence.
 *
 * The hierarchy screens special-case `CONFLICT` into one "the row moved under you" line; the
 * floor must not, because 015 and 016 raise several different CONFLICTs whose fixes are
 * different acts — a code another cover already holds, a section that still contains tables, a
 * cover that is not Available. `db/door-errors.ts` already names each one, and re-overriding by
 * code there would erase exactly the distinction the operator needs.
 */
export function submitFailureMessage(error: unknown): string {
  return toPublicError(error).message;
}

/* ---------------------------------------------------------------------- the screen */

const NO_BACKEND_COPY =
  "This build has no backend configured, so it cannot read or save the floor.";

/** One retire dialog for both kinds, because both ask the same question with a reason. */
type RetireTarget =
  | { kind: "area"; id: string; name: string }
  | { kind: "table"; id: string; name: string };

const RETIRE_CONSEQUENCES: Record<RetireTarget["kind"], readonly string[]> = {
  area: [
    "The section leaves the floor map, and no new cover can be created inside it.",
    "It can only be retired while it holds no live covers.",
    "015 gives a retired section no restore door — this is permanent.",
  ],
  table: [
    "The cover leaves the floor map, and its code becomes reusable by another cover.",
    "Orders, KOTs and bills already written keep pointing at it.",
    "015 gives a retired cover no restore door — this is permanent.",
  ],
};

type AreaSheetMode = { kind: "new" } | { kind: "edit"; area: DiningArea };
type TableSheetMode = { kind: "new"; areaId: string } | { kind: "edit"; table: RestaurantTable };

export default function FloorPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const storeError = useContextStore((s) => s.error);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const scope = useMemo(
    () => floorScopeFor(context),
    // Keyed on the ids so a context object identity change that does not move the scope
    // cannot re-trigger the read.
    [context.organizationId, context.propertyId, context.outletId],
  );

  const canView = can("table.view", permissions);
  const canCreate = can("table.create", permissions);
  const canEdit = can("table.edit", permissions);
  const canArchive = can("table.archive", permissions);

  const [areas, setAreas] = useState<DiningArea[] | null>(null);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [statuses, setStatuses] = useState<TableStatus[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [areaSheet, setAreaSheet] = useState<AreaSheetMode | null>(null);
  const [tableSheet, setTableSheet] = useState<TableSheetMode | null>(null);
  const [statusTile, setStatusTile] = useState<FloorTile | null>(null);
  const [retiring, setRetiring] = useState<RetireTarget | null>(null);
  const [retireBusy, setRetireBusy] = useState(false);

  // The page is mountable before the shell's bootstrap lands; "idle" must not sit on a
  // permanent spinner waiting for someone else to act.
  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || scope === null || !canView) return;
    let ignore = false;
    setAreas(null);
    setListError(null);
    const read = floorReadOptions(showArchived);
    Promise.all([
      listDiningAreas(scope, read),
      listTables(scope, read),
      // The view only ever holds live covers (015 keeps ARCHIVED out of it), so the archived
      // toggle does not change this read — and a retired cover correctly draws with no status.
      listTableStatuses(scope),
    ])
      .then(([areaRows, tableRows, statusRows]) => {
        if (ignore) return;
        setAreas(areaRows);
        setTables(tableRows);
        setStatuses(statusRows);
      })
      .catch((error) => {
        if (!ignore) setListError(submitFailureMessage(error));
      });
    return () => {
      ignore = true;
    };
  }, [view, scope, canView, showArchived, reloadTick]);

  const reload = useCallback(() => setReloadTick((tick) => tick + 1), []);

  const report = useCallback(
    (error: unknown) => setActionError(submitFailureMessage(error)),
    [],
  );

  const sections = useMemo(
    () => floorSections(areas ?? [], tables, statuses),
    [areas, tables, statuses],
  );
  const orderedAreaIds = useMemo(() => liveAreaIds(areas ?? []), [areas]);
  /** The live sections a cover can be moved into — a retired one takes nothing. */
  const areaChoices = useMemo(
    () =>
      (areas ?? [])
        .filter((area) => area.status === "ACTIVE")
        .map((area) => ({ value: area.id, label: area.name })),
    [areas],
  );

  const moveArea = async (area: DiningArea, delta: number) => {
    const next = moveInOrder(orderedAreaIds, area.id, delta);
    if (next === null || scope === null) return;
    try {
      await reorderDiningAreas(scope.outletId, next);
      setActionError(null);
      reload();
    } catch (error) {
      report(error);
    }
  };

  const moveTable = async (section: FloorSection, table: RestaurantTable, delta: number) => {
    const next = moveInOrder(liveTableIdsInSection(section), table.id, delta);
    if (next === null) return;
    try {
      await reorderTables(section.area.id, next);
      setActionError(null);
      reload();
    } catch (error) {
      report(error);
    }
  };

  const confirmRetire = async (reason: string) => {
    if (retiring === null) return;
    setRetireBusy(true);
    try {
      if (retiring.kind === "area") {
        await archiveDiningArea({ areaId: retiring.id, reason });
      } else {
        await archiveRestaurantTable({ tableId: retiring.id, reason });
      }
      setRetiring(null);
      setActionError(null);
      reload();
    } catch (error) {
      setRetiring(null);
      report(error);
    } finally {
      setRetireBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          <Store className="size-5 shrink-0 text-brand-600" aria-hidden />
          Floor
        </h2>
        <p className="mt-1 text-sm text-muted">
          The sections of the active restaurant and the covers inside them. A cover&apos;s
          operational state is partly derived: the floor shows Occupied from a live order, and no
          person here can set that word.
        </p>
      </header>

      {view === "bootstrapping" && <LoadingBlock label="Loading your workspace…" />}

      {view === "unconfigured" && (
        <EmptyState
          icon={<CircleSlash aria-hidden />}
          title="Backend not configured"
          description={storeError ?? NO_BACKEND_COPY}
        />
      )}

      {view === "unauthenticated" && (
        <EmptyState
          icon={<LogIn aria-hidden />}
          title="Sign in to manage the floor"
          description="There is no active session for this build to read a tenant from. Sign in again to see the floor of your restaurant."
        />
      )}

      {view === "no_outlet" && (
        <EmptyState
          icon={<Store aria-hidden />}
          title="Choose an outlet first"
          description="Sections and covers live inside one restaurant, and no outlet is selected in your active context yet. This is nothing being wrong — pick an outlet and this screen will show its floor."
        />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied capability="view the floor" permission="table.view" />
      )}

      {view === "scoped" && scope !== null && canView && (
        <>
          {listError !== null && (
            <p
              role="alert"
              className="rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger"
            >
              {listError}
            </p>
          )}
          {actionError !== null && (
            <div
              role="alert"
              className="flex items-start justify-between gap-3 rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger"
            >
              <span>{actionError}</span>
              <Button size="sm" variant="ghost" onClick={() => setActionError(null)}>
                Dismiss
              </Button>
            </div>
          )}

          <Card
            actions={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Switch
                  checked={showArchived}
                  onChange={setShowArchived}
                  label="Show retired"
                />
                {canCreate && (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Plus className="size-4" aria-hidden />}
                    onClick={() => setAreaSheet({ kind: "new" })}
                  >
                    New section
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={reload}>
                  Reload
                </Button>
              </div>
            }
          >
            <FloorLegend />
          </Card>

          {areas === null ? (
            <LoadingBlock label="Reading the floor…" />
          ) : sections.length === 0 ? (
            <EmptyState
              icon={<Store aria-hidden />}
              title="No sections yet"
              description="This restaurant has no dining areas. Add one — Main Hall, Outdoor, Rooftop — and its covers can be placed inside it."
              action={
                canCreate ? (
                  <Button
                    icon={<Plus className="size-4" aria-hidden />}
                    onClick={() => setAreaSheet({ kind: "new" })}
                  >
                    Add the first section
                  </Button>
                ) : undefined
              }
            />
          ) : (
            sections.map((section, index) => (
              <SectionCard
                key={section.area.id}
                section={section}
                position={index}
                count={orderedAreaIds.length}
                canEdit={canEdit}
                canCreate={canCreate}
                canArchive={canArchive}
                onMove={(delta) => void moveArea(section.area, delta)}
                onEditArea={() => setAreaSheet({ kind: "edit", area: section.area })}
                onAddTable={() => setTableSheet({ kind: "new", areaId: section.area.id })}
                onEditTable={(table) => setTableSheet({ kind: "edit", table })}
                onStatusTile={setStatusTile}
                onRetireArea={() =>
                  setRetiring({ kind: "area", id: section.area.id, name: section.area.name })
                }
                onRetireTable={(table) =>
                  setRetiring({
                    kind: "table",
                    id: table.id,
                    name: `${table.code} — ${table.name}`,
                  })
                }
                onMoveTable={(table, delta) => void moveTable(section, table, delta)}
              />
            ))
          )}
        </>
      )}

      {areaSheet !== null && scope !== null && (
        <AreaSheet
          mode={areaSheet}
          outletId={scope.outletId}
          onClose={() => setAreaSheet(null)}
          onSaved={(message) => {
            setAreaSheet(null);
            setActionError(null);
            reload();
            if (message !== null) setActionError(message);
          }}
          onFailure={report}
        />
      )}

      {tableSheet !== null && (
        <TableSheet
          mode={tableSheet}
          areaChoices={areaChoices}
          onClose={() => setTableSheet(null)}
          onSaved={(message) => {
            setTableSheet(null);
            setActionError(null);
            reload();
            if (message !== null) setActionError(message);
          }}
          onFailure={report}
        />
      )}

      {statusTile !== null && (
        <ServiceStatusSheet
          tile={statusTile}
          onClose={() => setStatusTile(null)}
          onSaved={() => {
            setStatusTile(null);
            setActionError(null);
            reload();
          }}
          onFailure={(error) => {
            setStatusTile(null);
            report(error);
          }}
        />
      )}

      <ArchiveDialog
        open={retiring !== null}
        onClose={() => setRetiring(null)}
        onConfirm={(reason) => void confirmRetire(reason)}
        loading={retireBusy}
        entityName={retiring?.name ?? ""}
        entityLabel={retiring === null ? "record" : retiring.kind === "area" ? "section" : "cover"}
        consequences={retiring === null ? [] : RETIRE_CONSEQUENCES[retiring.kind]}
      />
    </div>
  );
}

/* ------------------------------------------------------------------------ pieces */

/** §22's guarantee in five lines: every state on the map is an icon and a word too. */
function FloorLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {DERIVED_ORDER.map((status) => {
        const Icon = STATUS_ICONS[status];
        return (
          <span key={status} className="flex items-center gap-2 text-xs text-muted">
            <Icon className="size-4 text-ink" aria-hidden />
            {STATUS_LABELS[status]}
          </span>
        );
      })}
      <span className="text-xs text-muted">
        Occupied is derived from a live order and cannot be set here.
      </span>
    </div>
  );
}

type SectionCardProps = {
  section: FloorSection;
  position: number;
  count: number;
  canEdit: boolean;
  canCreate: boolean;
  canArchive: boolean;
  onMove: (delta: number) => void;
  onEditArea: () => void;
  onAddTable: () => void;
  onEditTable: (table: RestaurantTable) => void;
  onStatusTile: (tile: FloorTile) => void;
  onRetireArea: () => void;
  onRetireTable: (table: RestaurantTable) => void;
  onMoveTable: (table: RestaurantTable, delta: number) => void;
};

function SectionCard({
  section,
  position,
  count,
  canEdit,
  canCreate,
  canArchive,
  onMove,
  onEditArea,
  onAddTable,
  onEditTable,
  onStatusTile,
  onRetireArea,
  onRetireTable,
  onMoveTable,
}: SectionCardProps) {
  const { area, tiles } = section;
  const archived = area.status === "ARCHIVED";
  const liveIds = liveTableIdsInSection(section);

  return (
    <Card
      padded={false}
      className={archived ? "opacity-80" : undefined}
    >
      <div className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
              {area.name}
              {archived && <StatusPill status={area.status} />}
            </h3>
            <p className="mt-0.5 text-xs text-muted">
              {area.description ?? "No description"} · {tiles.length} cover
              {tiles.length === 1 ? "" : "s"} · {sectionSeats(tiles)} seats
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {!archived && canEdit && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={position === 0}
                  icon={<ArrowUp className="size-4" aria-hidden />}
                  onClick={() => onMove(-1)}
                >
                  <span className="sr-only">Move section up</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={position === count - 1}
                  icon={<ArrowDown className="size-4" aria-hidden />}
                  onClick={() => onMove(1)}
                >
                  <span className="sr-only">Move section down</span>
                </Button>
              </>
            )}
            {canEdit && (
              <Button
                size="sm"
                variant="secondary"
                icon={<Pencil className="size-4" aria-hidden />}
                onClick={onEditArea}
              >
                Rename
              </Button>
            )}
            {canCreate && !archived && (
              <Button
                size="sm"
                variant="primary"
                icon={<Plus className="size-4" aria-hidden />}
                onClick={onAddTable}
              >
                Add cover
              </Button>
            )}
            {canArchive && !archived && (
              <Button
                size="sm"
                variant="ghost"
                icon={<Archive className="size-4" aria-hidden />}
                onClick={onRetireArea}
              >
                Retire
              </Button>
            )}
          </div>
        </div>
      </div>

      {tiles.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted sm:px-5">
          No covers in this section yet.
          {archived ? " A retired section holds no live covers and takes no new ones." : ""}
        </p>
      ) : (
        <ul className="flex flex-wrap gap-3 px-4 py-4 sm:px-5">
          {tiles.map((tile) => (
            <TableTile
              key={tile.table.id}
              tile={tile}
              canEdit={canEdit && !archived}
              canArchive={canArchive}
              position={liveIds.indexOf(tile.table.id)}
              count={liveIds.length}
              onMove={(delta) => onMoveTable(tile.table, delta)}
              onEdit={() => onEditTable(tile.table)}
              onStatus={() => onStatusTile(tile)}
              onRetire={() => onRetireTable(tile.table)}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

type TableTileProps = {
  tile: FloorTile;
  canEdit: boolean;
  canArchive: boolean;
  position: number;
  count: number;
  onMove: (delta: number) => void;
  onEdit: () => void;
  onStatus: () => void;
  onRetire: () => void;
};

function TableTile({
  tile,
  canEdit,
  canArchive,
  position,
  count,
  onMove,
  onEdit,
  onStatus,
  onRetire,
}: TableTileProps) {
  const { table } = tile;
  const derived = derivedStatusOf(tile);
  const Icon = STATUS_ICONS[derived];
  const retired = table.status === "ARCHIVED";
  const liveOrders = tile.status?.liveOrders ?? 0;

  // §21's picture is drawn from the two facts 015 guarantees: section rank and rank inside the
  // section, both ordered by the reorder doors. The canvas coordinates are captured on the form
  // for the day a drag map exists, and deliberately not used to place a tile here — a cover
  // positioned absolutely inside a flow list is a tile that escapes its section.
  return (
    <li
      className={`flex min-w-[13rem] flex-col gap-2 border border-line bg-surface px-3 py-3 shadow-xs ${shapeClass(table.shape)} ${retired ? "opacity-70" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{table.code}</p>
          <p className="truncate text-xs text-muted">{table.name}</p>
        </div>
        <Badge tone={table.shape === null ? "muted" : "neutral"}>
          {table.shape === null ? "Card" : humanizeShape(table.shape)}
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-ink">
          <Icon className="size-4" aria-hidden />
          {STATUS_LABELS[derived]}
        </span>
        <StatusPill status={derived} />
        {retired ? (
          <StatusPill status={table.status} />
        ) : (
          <span className="text-xs text-muted">
            {table.capacity} seats · {table.serviceStatus === derived
              ? "set here"
              : `set: ${serviceStatusLabel(table.serviceStatus)}`}
          </span>
        )}
      </div>

      {derived === "OCCUPIED" && (
        <p className="text-xs text-muted">
          {liveOrders} live order{liveOrders === 1 ? "" : "s"} on this cover.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {canEdit && (
          <>
            <Button
              size="sm"
              variant="secondary"
              icon={<CircleSlash className="size-4" aria-hidden />}
              onClick={onStatus}
            >
              Set status
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={position < 0 || position === 0}
              icon={<ArrowUp className="size-4" aria-hidden />}
              onClick={() => onMove(-1)}
            >
              <span className="sr-only">Move cover up</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={position < 0 || position >= count - 1}
              icon={<ArrowDown className="size-4" aria-hidden />}
              onClick={() => onMove(1)}
            >
              <span className="sr-only">Move cover down</span>
            </Button>
            <Button size="sm" variant="ghost" onClick={onEdit}>
              Edit
            </Button>
          </>
        )}
        {canArchive && !retired && (
          <Button
            size="sm"
            variant="ghost"
            icon={<Archive className="size-4" aria-hidden />}
            onClick={onRetire}
          >
            Retire
          </Button>
        )}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------- area sheet */

type AreaSheetProps = {
  mode: AreaSheetMode;
  outletId: string;
  onClose: () => void;
  /** A null message means a clean save; a string is what the door reported back. */
  onSaved: (message: string | null) => void;
  onFailure: (error: unknown) => void;
};

function AreaSheet({ mode, outletId, onClose, onSaved, onFailure }: AreaSheetProps) {
  const editing = mode.kind === "edit" ? mode.area : null;
  const [draft, setDraft] = useState<AreaDraft>(() =>
    editing === null ? newAreaDraft() : areaDraftFrom(editing),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const run = async (): Promise<void> => {
    const found = validateAreaDraft(draft);
    setErrors(found);
    if (Object.keys(found).length > 0 || busy) return;
    setBusy(true);
    try {
      if (editing === null) {
        await createDiningArea(areaCreateInput(draft, outletId));
        onSaved(null);
        return;
      }
      const input = areaUpdateInput(editing, draft);
      if (changedFieldCount(input, AREA_IDENTITY_KEYS) === 0) {
        // Nothing moved, so nothing is sent: a door call that changes no column would still
        // bump the row's version and make every other open sheet stale.
        onSaved("Nothing changed, so the section was left exactly as it was.");
        return;
      }
      await updateDiningArea(input);
      onSaved(null);
    } catch (error) {
      // A refusal keeps the typed input and reports through the screen's banner.
      onFailure(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      side="right"
      title={editing === null ? "New section" : `Rename ${editing.name}`}
      description="A section is one part of the restaurant floor — Main Hall, Outdoor, Rooftop. Its covers live inside it."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void run()} disabled={busy}>
            {busy ? "Saving…" : editing === null ? "Create section" : "Save changes"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name" required error={errors.name}>
          <TextInput
            value={draft.name}
            invalid={errors.name !== undefined}
            disabled={busy}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            placeholder="Main Hall"
          />
        </Field>

        <Field
          label="Description"
          hint="Optional. Clearing this field empties it; leaving it untouched keeps what is stored."
          error={errors.description}
        >
          <Textarea
            value={draft.description}
            disabled={busy}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            placeholder="Ground floor, non-smoking, 40 covers."
          />
        </Field>

        <p className="text-xs leading-relaxed text-muted">
          Section names are unique across the restaurant, and the floor map orders them through
          the arrows on each card — a rank typed by hand would collide with the section already
          holding it.
        </p>
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ table sheet */

type TableSheetProps = {
  mode: TableSheetMode;
  areaChoices: readonly { value: string; label: string }[];
  onClose: () => void;
  onSaved: (message: string | null) => void;
  onFailure: (error: unknown) => void;
};

function TableSheet({ mode, areaChoices, onClose, onSaved, onFailure }: TableSheetProps) {
  const editing = mode.kind === "edit" ? mode.table : null;
  const [draft, setDraft] = useState<TableDraft>(() =>
    editing === null
      ? newTableDraft(mode.kind === "new" ? mode.areaId : "")
      : tableDraftFrom(editing),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const run = async (): Promise<void> => {
    const found = validateTableDraft(draft);
    setErrors(found);
    if (Object.keys(found).length > 0 || busy) return;
    setBusy(true);
    try {
      if (editing === null) {
        await createRestaurantTable(tableCreateInput(draft, draft.areaId));
        onSaved(null);
        return;
      }
      const input = tableUpdateInput(editing, draft);
      if (changedFieldCount(input, TABLE_IDENTITY_KEYS) === 0) {
        onSaved("Nothing changed, so the cover was left exactly as it was.");
        return;
      }
      await updateRestaurantTable(input);
      onSaved(null);
    } catch (error) {
      onFailure(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      side="right"
      title={editing === null ? "New cover" : `Edit ${editing.code}`}
      description="A cover is a place guests sit. Its code is what the order, the kitchen slip and the bill all print."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void run()} disabled={busy}>
            {busy ? "Saving…" : editing === null ? "Create cover" : "Save changes"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Section" required error={errors.areaId}>
          <SelectInput
            options={areaChoices}
            value={draft.areaId}
            disabled={busy}
            invalid={errors.areaId !== undefined}
            onChange={(areaId) => setDraft({ ...draft, areaId })}
          />
        </Field>

        <Field label="Name" required error={errors.name}>
          <TextInput
            value={draft.name}
            invalid={errors.name !== undefined}
            disabled={busy}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            placeholder="Table 1"
          />
        </Field>

        <Field
          label="Code"
          required
          hint="Unique across the whole restaurant. It can be restated later; a cover's code is the ticket's handle."
          error={errors.code}
        >
          <TextInput
            value={draft.code}
            invalid={errors.code !== undefined}
            disabled={busy}
            onChange={(event) => setDraft({ ...draft, code: event.target.value })}
            placeholder="T01"
          />
        </Field>

        <Field label="Covers" required error={errors.capacity}>
          <TextInput
            type="number"
            inputMode="numeric"
            value={draft.capacity}
            invalid={errors.capacity !== undefined}
            disabled={busy}
            onChange={(event) => setDraft({ ...draft, capacity: event.target.value })}
          />
        </Field>

        <Field label="Shape" hint="Decides how the map draws it. 015 gives no way to clear a shape once set.">
          <SelectInput
            options={shapeOptions()}
            value={draft.shape}
            disabled={busy}
            onChange={(shape) => setDraft({ ...draft, shape })}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Map X" hint="0-10000. Blank auto-places." error={errors.positionX}>
            <TextInput
              inputMode="decimal"
              value={draft.positionX}
              invalid={errors.positionX !== undefined}
              disabled={busy}
              onChange={(event) => setDraft({ ...draft, positionX: event.target.value })}
            />
          </Field>
          <Field label="Map Y" error={errors.positionY}>
            <TextInput
              inputMode="decimal"
              value={draft.positionY}
              invalid={errors.positionY !== undefined}
              disabled={busy}
              onChange={(event) => setDraft({ ...draft, positionY: event.target.value })}
            />
          </Field>
        </div>

        <p className="text-xs leading-relaxed text-muted">
          A status is not on this form. &ldquo;Set status&rdquo; is its own action on the cover,
          because an ordinary edit must never be able to mark a table occupied, cleaning or out of
          service by accident.
        </p>
      </div>
    </Dialog>
  );
}

/* --------------------------------------------------------------- status sheet */

type ServiceStatusSheetProps = {
  tile: FloorTile;
  onClose: () => void;
  onSaved: () => void;
  onFailure: (error: unknown) => void;
};

/**
 * The one operational write (§20) — three values, a mandatory reason in every direction, and
 * the state the FLOOR currently shows printed underneath. That last line matters: when a live
 * order makes the cover Occupied, an operator setting "Available" has to be told the cover will
 * still read Occupied afterwards, instead of concluding the button did nothing.
 */
function ServiceStatusSheet({ tile, onClose, onSaved, onFailure }: ServiceStatusSheetProps) {
  const table = tile.table;
  const derived = derivedStatusOf(tile);
  const [value, setValue] = useState<TableServiceStatus>(table.serviceStatus);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const run = async (): Promise<void> => {
    const found: Record<string, string> = {};
    if (reason.trim() === "") found.reason = "A reason is required for every status change.";
    if (value === table.serviceStatus) {
      found.value = "The cover already reads this status.";
    }
    setErrors(found);
    if (Object.keys(found).length > 0 || busy) return;
    setBusy(true);
    try {
      await setTableServiceStatus({
        tableId: table.id,
        serviceStatus: value,
        reason: reason.trim(),
        expectedVersion: table.version,
      });
      onSaved();
    } catch (error) {
      onFailure(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      title={`Status of ${table.code}`}
      description={`${table.name} · ${table.capacity} covers`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void run()} disabled={busy}>
            {busy ? "Saving…" : "Set status"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Status" required error={errors.value}>
          <SelectInput
            options={serviceStatusOptions()}
            value={value}
            disabled={busy}
            invalid={errors.value !== undefined}
            onChange={setValue}
          />
        </Field>

        <ul className="flex flex-col gap-1.5 rounded-md border border-line bg-surface-sunken px-4 py-3">
          {serviceStatusOptions().map((option) => {
            const Icon = STATUS_ICONS[option.value];
            return (
              <li key={option.value} className="flex items-center gap-2 text-xs text-muted">
                <Icon className="size-4 text-ink" aria-hidden />
                {option.label}
              </li>
            );
          })}
        </ul>

        <p className="text-xs leading-relaxed text-muted">
          The floor currently shows <strong className="font-medium text-ink">{STATUS_LABELS[derived]}</strong>.{" "}
          {derivedStatusExplanation(derived)}
        </p>

        <Field
          label="Reason"
          required
          hint="Written to the audit trail with the change. Needed even on the way back to Available."
          error={errors.reason}
        >
          <Textarea
            value={reason}
            invalid={errors.reason !== undefined}
            disabled={busy}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Wheel chair removed and table re-set for six."
          />
        </Field>
      </div>
    </Dialog>
  );
}
