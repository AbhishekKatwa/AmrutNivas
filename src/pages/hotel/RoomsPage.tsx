/**
 * Rooms — the physical rooms in a property, each with a number, type, and two orthogonal statuses.
 *
 * A room's operational status (ACTIVE, OUT_OF_ORDER, OUT_OF_SERVICE, BLOCKED) tells whether it
 * can be sold. Its housekeeping status (VACANT_CLEAN, VACANT_DIRTY, OCCUPIED_CLEAN,
 * OCCUPIED_DIRTY, INSPECTED) tells whether it is ready for the next guest. These are independent:
 * a room can be ACTIVE but VACANT_DIRTY, or OUT_OF_ORDER and INSPECTED.
 *
 * The screen reads organization + property from the context store. With no property selected it
 * renders the deliberate "choose a property first" state.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, BedDouble, CircleSlash, LogIn, Pencil, Plus } from "lucide-react";
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
  HOUSEKEEPING_STATUSES,
  OPERATIONAL_STATUSES,
  type HousekeepingStatus,
  type OperationalStatus,
  type Room,
  type RoomType,
} from "@/domain/hotel/types";
import {
  archiveRoom,
  createRoom,
  listRoomTypes,
  listRooms,
  setRoomHousekeepingStatus,
  setRoomOperationalStatus,
  updateRoom,
} from "@/domain/hotel/room-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

/* --------------------------------------------------------------------- scope */

export type RoomsPageView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_property"
  | "scoped";

export function pageStatusFor(status: ContextStatus, context: ActiveContext): RoomsPageView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null && context.propertyId !== null
      ? "scoped"
      : "no_property";
  }
  return "bootstrapping";
}

export function hotelScopeFor(context: ActiveContext): { organizationId: string; propertyId: string } | null {
  if (context.organizationId === null || context.propertyId === null) return null;
  return { organizationId: context.organizationId, propertyId: context.propertyId };
}

/* --------------------------------------------------------------------- helpers */

const OPERATIONAL_LABELS: Record<OperationalStatus, string> = {
  ACTIVE: "Active",
  OUT_OF_ORDER: "Out of order",
  OUT_OF_SERVICE: "Out of service",
  BLOCKED: "Blocked",
};

const HOUSEKEEPING_LABELS: Record<HousekeepingStatus, string> = {
  VACANT_CLEAN: "Vacant clean",
  VACANT_DIRTY: "Vacant dirty",
  OCCUPIED_CLEAN: "Occupied clean",
  OCCUPIED_DIRTY: "Occupied dirty",
  INSPECTED: "Inspected",
};

function operationalOptions(): SelectOption<OperationalStatus>[] {
  return OPERATIONAL_STATUSES.map((value) => ({ value, label: OPERATIONAL_LABELS[value] }));
}

function housekeepingOptions(): SelectOption<HousekeepingStatus>[] {
  return HOUSEKEEPING_STATUSES.map((value) => ({ value, label: HOUSEKEEPING_LABELS[value] }));
}

/* --------------------------------------------------------------------- drafts */

type RoomDraft = {
  roomNumber: string;
  roomTypeId: string;
  floor: string;
  building: string;
  notes: string;
};

function newDraft(): RoomDraft {
  return { roomNumber: "", roomTypeId: "", floor: "", building: "", notes: "" };
}

function draftFrom(room: Room): RoomDraft {
  return {
    roomNumber: room.roomNumber,
    roomTypeId: room.roomTypeId,
    floor: room.floor ?? "",
    building: room.building ?? "",
    notes: room.notes ?? "",
  };
}

function validateDraft(draft: RoomDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (draft.roomNumber.trim() === "") errors.roomNumber = "A room number is required.";
  if (draft.roomTypeId === "") errors.roomTypeId = "Choose a room type.";
  return errors;
}

/* --------------------------------------------------------------------- screen */

const NO_BACKEND_COPY = "This build has no backend configured, so it cannot read or save rooms.";

type SheetMode = { kind: "new" } | { kind: "edit"; room: Room };

export default function RoomsPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const storeError = useContextStore((s) => s.error);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const scope = useMemo(() => hotelScopeFor(context), [context.organizationId, context.propertyId]);

  const canView = can("room.view", permissions);
  const canCreate = can("room.create", permissions);
  const canEdit = can("room.edit", permissions);
  const canArchive = can("room.archive", permissions);
  const canChangeStatus = can("room.edit", permissions);

  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [sheet, setSheet] = useState<SheetMode | null>(null);
  const [archiving, setArchiving] = useState<Room | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || scope === null || !canView) return;
    let ignore = false;
    setRooms(null);
    setListError(null);
    Promise.all([
      listRooms(scope, showArchived ? { includeArchived: true } : {}),
      listRoomTypes(scope),
    ])
      .then(([roomsList, typesList]) => {
        if (ignore) return;
        setRooms(roomsList);
        setRoomTypes(typesList);
      })
      .catch((error) => {
        if (!ignore) setListError(toPublicError(error).message);
      });
    return () => {
      ignore = true;
    };
  }, [view, scope, canView, showArchived, reloadTick]);

  const reload = useCallback(() => setReloadTick((tick) => tick + 1), []);
  const report = useCallback((error: unknown) => setActionError(toPublicError(error).message), []);

  const confirmArchive = async (_reason: string) => {
    if (archiving === null || scope === null) return;
    setArchiveBusy(true);
    try {
      await archiveRoom(scope, archiving.id, archiving.version);
      setArchiving(null);
      setActionError(null);
      reload();
    } catch (error) {
      setArchiving(null);
      report(error);
    } finally {
      setArchiveBusy(false);
    }
  };

  const changeOperationalStatus = async (room: Room, newStatus: OperationalStatus) => {
    if (scope === null) return;
    try {
      await setRoomOperationalStatus(scope, room.id, newStatus, room.version);
      setActionError(null);
      reload();
    } catch (error) {
      report(error);
    }
  };

  const changeHousekeepingStatus = async (room: Room, newStatus: HousekeepingStatus) => {
    if (scope === null) return;
    try {
      await setRoomHousekeepingStatus(scope, room.id, newStatus, room.version);
      setActionError(null);
      reload();
    } catch (error) {
      report(error);
    }
  };

  const roomTypeById = useMemo(() => {
    const map = new Map<string, RoomType>();
    for (const rt of roomTypes) map.set(rt.id, rt);
    return map;
  }, [roomTypes]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          <BedDouble className="size-5 shrink-0 text-brand-600" aria-hidden />
          Rooms
        </h2>
        <p className="mt-1 text-sm text-muted">
          Physical rooms with numbers. Each room has an operational status (can it be sold?) and a
          housekeeping status (is it ready?).
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
          title="Sign in to manage rooms"
          description="There is no active session for this build to read a tenant from."
        />
      )}

      {view === "no_property" && (
        <EmptyState
          icon={<BedDouble aria-hidden />}
          title="Choose a property first"
          description="Rooms live inside one property. Pick a property and this screen will show its rooms."
        />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied capability="view rooms" permission="room.view" />
      )}

      {view === "scoped" && scope !== null && canView && (
        <>
          {listError !== null && (
            <p role="alert" className="rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger">
              {listError}
            </p>
          )}
          {actionError !== null && (
            <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger">
              <span>{actionError}</span>
              <Button size="sm" variant="ghost" onClick={() => setActionError(null)}>
                Dismiss
              </Button>
            </div>
          )}

          <Card
            actions={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Switch checked={showArchived} onChange={setShowArchived} label="Show archived" />
                {canCreate && (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Plus className="size-4" aria-hidden />}
                    onClick={() => setSheet({ kind: "new" })}
                  >
                    New room
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={reload}>
                  Reload
                </Button>
              </div>
            }
          >
            <p className="text-xs text-muted">
              {rooms === null ? "Loading…" : `${rooms.length} room${rooms.length === 1 ? "" : "s"}`}
            </p>
          </Card>

          {rooms === null ? (
            <LoadingBlock label="Reading rooms…" />
          ) : rooms.length === 0 ? (
            <EmptyState
              icon={<BedDouble aria-hidden />}
              title="No rooms yet"
              description="This property has no rooms. Add one — 101, 202, Suite A — and it can be sold on a reservation."
              action={
                canCreate ? (
                  <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setSheet({ kind: "new" })}>
                    Add the first room
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              {rooms.map((room) => (
                <RoomCard
                  key={room.id}
                  room={room}
                  roomType={roomTypeById.get(room.roomTypeId) ?? null}
                  canEdit={canEdit}
                  canArchive={canArchive}
                  canChangeStatus={canChangeStatus}
                  onEdit={() => setSheet({ kind: "edit", room })}
                  onArchive={() => setArchiving(room)}
                  onChangeOperationalStatus={(newStatus) => void changeOperationalStatus(room, newStatus)}
                  onChangeHousekeepingStatus={(newStatus) => void changeHousekeepingStatus(room, newStatus)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {sheet !== null && scope !== null && (
        <RoomSheet
          mode={sheet}
          scope={scope}
          roomTypes={roomTypes}
          onClose={() => setSheet(null)}
          onSaved={(message) => {
            setSheet(null);
            setActionError(null);
            reload();
            if (message !== null) setActionError(message);
          }}
          onFailure={report}
        />
      )}

      <ArchiveDialog
        open={archiving !== null}
        onClose={() => setArchiving(null)}
        onConfirm={(reason) => void confirmArchive(reason)}
        loading={archiveBusy}
        entityName={archiving !== null ? `Room ${archiving.roomNumber}` : ""}
        entityLabel="room"
        consequences={[
          "The room leaves the active list and cannot be sold on new reservations.",
          "Existing stays keep their history — the room number is preserved on past records.",
          "034 gives an archived room no restore door — this is permanent.",
        ]}
      />
    </div>
  );
}

/* --------------------------------------------------------------------- pieces */

type RoomCardProps = {
  room: Room;
  roomType: RoomType | null;
  canEdit: boolean;
  canArchive: boolean;
  canChangeStatus: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onChangeOperationalStatus: (status: OperationalStatus) => void;
  onChangeHousekeepingStatus: (status: HousekeepingStatus) => void;
};

function RoomCard({
  room,
  roomType,
  canEdit,
  canArchive,
  canChangeStatus,
  onEdit,
  onArchive,
  onChangeOperationalStatus,
  onChangeHousekeepingStatus,
}: RoomCardProps) {
  const archived = room.status === "ARCHIVED";

  return (
    <Card padded={false} className={archived ? "opacity-80" : undefined}>
      <div className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
              Room {room.roomNumber}
              {archived && <StatusPill status={room.status} />}
            </h3>
            <p className="mt-0.5 text-xs text-muted">
              {roomType !== null ? (
                <>
                  <Badge tone="neutral">{roomType.code}</Badge>
                  {" · "}
                  {roomType.name}
                </>
              ) : (
                <Badge tone="neutral">Unknown type</Badge>
              )}
              {room.floor && (
                <>
                  {" · "}
                  Floor {room.floor}
                </>
              )}
              {room.building && (
                <>
                  {" · "}
                  {room.building}
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {canEdit && (
              <Button size="sm" variant="secondary" icon={<Pencil className="size-4" aria-hidden />} onClick={onEdit}>
                Edit
              </Button>
            )}
            {canArchive && !archived && (
              <Button size="sm" variant="ghost" icon={<Archive className="size-4" aria-hidden />} onClick={onArchive}>
                Archive
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-muted">Operational status</p>
            {canChangeStatus && !archived ? (
              <SelectInput
                value={room.operationalStatus}
                options={operationalOptions()}
                onChange={(value) => onChangeOperationalStatus(value as OperationalStatus)}
                className="mt-1"
              />
            ) : (
              <p className="mt-1 text-sm text-ink">{OPERATIONAL_LABELS[room.operationalStatus]}</p>
            )}
          </div>

          <div>
            <p className="text-xs font-medium text-muted">Housekeeping status</p>
            {canChangeStatus && !archived ? (
              <SelectInput
                value={room.housekeepingStatus}
                options={housekeepingOptions()}
                onChange={(value) => onChangeHousekeepingStatus(value as HousekeepingStatus)}
                className="mt-1"
              />
            ) : (
              <p className="mt-1 text-sm text-ink">{HOUSEKEEPING_LABELS[room.housekeepingStatus]}</p>
            )}
          </div>
        </div>

        {room.notes && (
          <p className="text-sm text-muted">{room.notes}</p>
        )}
      </div>
    </Card>
  );
}

/* --------------------------------------------------------------------- sheet */

type RoomSheetProps = {
  mode: SheetMode;
  scope: { organizationId: string; propertyId: string };
  roomTypes: RoomType[];
  onClose: () => void;
  onSaved: (message: string | null) => void;
  onFailure: (error: unknown) => void;
};

function RoomSheet({ mode, scope, roomTypes, onClose, onSaved, onFailure }: RoomSheetProps) {
  const editing = mode.kind === "edit" ? mode.room : null;
  const [draft, setDraft] = useState<RoomDraft>(() =>
    editing === null ? newDraft() : draftFrom(editing),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const roomTypeOptions: SelectOption<string>[] = useMemo(
    () => roomTypes.map((rt) => ({ value: rt.id, label: `${rt.code} — ${rt.name}` })),
    [roomTypes],
  );

  const run = async (): Promise<void> => {
    const found = validateDraft(draft);
    setErrors(found);
    if (Object.keys(found).length > 0 || busy) return;
    setBusy(true);
    try {
      if (editing === null) {
        await createRoom(scope, {
          roomTypeId: draft.roomTypeId,
          roomNumber: draft.roomNumber.trim(),
          floor: draft.floor.trim() || null,
          building: draft.building.trim() || null,
          notes: draft.notes.trim() || null,
        });
        onSaved(null);
        return;
      }
      const input: Record<string, unknown> = { expectedVersion: editing.version };
      if (draft.roomNumber.trim() !== editing.roomNumber) input.roomNumber = draft.roomNumber.trim();
      if (draft.roomTypeId !== editing.roomTypeId) input.roomTypeId = draft.roomTypeId;
      if (draft.floor.trim() !== (editing.floor ?? "")) input.floor = draft.floor.trim() || null;
      if (draft.building.trim() !== (editing.building ?? "")) input.building = draft.building.trim() || null;
      if (draft.notes.trim() !== (editing.notes ?? "")) input.notes = draft.notes.trim() || null;
      if (Object.keys(input).length === 1) {
        onSaved("Nothing changed, so the room was left exactly as it was.");
        return;
      }
      await updateRoom(scope, editing.id, input as Parameters<typeof updateRoom>[2]);
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
      title={editing === null ? "New room" : `Edit Room ${editing.roomNumber}`}
      description="A physical room with a number. Each room points at a room type and has two independent statuses: operational (can it be sold?) and housekeeping (is it ready?)."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void run()} disabled={busy}>
            {busy ? "Saving…" : editing === null ? "Create room" : "Save changes"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Room number" required error={errors.roomNumber}>
          <TextInput
            value={draft.roomNumber}
            invalid={errors.roomNumber !== undefined}
            disabled={busy}
            onChange={(event) => setDraft({ ...draft, roomNumber: event.target.value })}
            placeholder="101"
          />
        </Field>

        <Field label="Room type" required error={errors.roomTypeId}>
          <SelectInput
            value={draft.roomTypeId}
            options={roomTypeOptions}
            invalid={errors.roomTypeId !== undefined}
            disabled={busy}
            onChange={(value) => setDraft({ ...draft, roomTypeId: value })}
            placeholder="Choose a room type…"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Floor" error={errors.floor}>
            <TextInput
              value={draft.floor}
              disabled={busy}
              onChange={(event) => setDraft({ ...draft, floor: event.target.value })}
              placeholder="1"
            />
          </Field>
          <Field label="Building" error={errors.building}>
            <TextInput
              value={draft.building}
              disabled={busy}
              onChange={(event) => setDraft({ ...draft, building: event.target.value })}
              placeholder="Main"
            />
          </Field>
        </div>

        <Field label="Notes" error={errors.notes}>
          <Textarea
            value={draft.notes}
            disabled={busy}
            onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
            placeholder="Connecting room, wheelchair accessible, etc."
          />
        </Field>
      </div>
    </Dialog>
  );
}
