/**
 * Stay detail — the full record of a guest's actual occupancy.
 *
 * A stay is created at check-in from a confirmed reservation. It tracks the room, check-in/out
 * dates, and status (EXPECTED, CHECKED_IN, EXTENDED, CHECKED_OUT, EARLY_DEPARTURE). The screen
 * drives check-out, extend, and room moves, and links to the stay's folio.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, CircleSlash, DoorOpen, LogIn } from "lucide-react";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { LoadingBlock } from "@/components/ui/Spinner";
import { SelectInput, type SelectOption } from "@/components/ui/SelectInput";
import { StatusPill } from "@/components/ui/StatusPill";
import { TextInput } from "@/components/ui/TextInput";
import { Textarea } from "@/components/ui/Textarea";
import { can, type ActiveContext } from "@/domain/identity/types";
import {
  ROOM_MOVE_REASONS,
  type Guest,
  type Room,
  type RoomMoveReason,
  type RoomType,
  type Stay,
  type StayGuest,
  type StayRoomMove,
} from "@/domain/hotel/types";
import {
  checkOut,
  extendStay,
  getStay,
  getStayGuests,
  getStayRoomMoves,
  moveRoom,
} from "@/domain/hotel/stay-service";
import { getFolioByStay } from "@/domain/hotel/folio-service";
import { listRooms, listRoomTypes } from "@/domain/hotel/room-service";
import { getGuest } from "@/domain/hotel/guest-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

/* --------------------------------------------------------------------- scope */

export type StayDetailPageView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_property"
  | "not_found"
  | "scoped";

export function pageStatusFor(status: ContextStatus, context: ActiveContext): StayDetailPageView {
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

const MOVE_REASON_LABELS: Record<RoomMoveReason, string> = {
  GUEST_REQUEST: "Guest request",
  MAINTENANCE: "Maintenance",
  UPGRADE: "Upgrade",
  OPERATIONAL: "Operational",
  OTHER: "Other",
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function moveReasonOptions(): SelectOption<RoomMoveReason>[] {
  return ROOM_MOVE_REASONS.map((value) => ({ value, label: MOVE_REASON_LABELS[value] }));
}

/* --------------------------------------------------------------------- screen */

const NO_BACKEND_COPY = "This build has no backend configured, so it cannot read stays.";

export default function StayDetailPage() {
  const { stayId } = useParams<{ stayId: string }>();
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const storeError = useContextStore((s) => s.error);
  const bootstrap = useContextStore((s) => s.bootstrap);
  const navigate = useNavigate();

  const view = pageStatusFor(status, context);
  const scope = useMemo(() => hotelScopeFor(context), [context.organizationId, context.propertyId]);

  const canView = can("stay.view", permissions);
  const canCheckOut = can("stay.check_out", permissions);
  const canExtend = can("stay.edit", permissions);
  const canMoveRoom = can("stay.edit", permissions);

  const [stay, setStay] = useState<Stay | null>(null);
  const [guest, setGuest] = useState<Guest | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [roomType, setRoomType] = useState<RoomType | null>(null);
  const [stayGuests, setStayGuests] = useState<StayGuest[]>([]);
  const [roomMoves, setRoomMoves] = useState<StayRoomMove[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [hasFolio, setHasFolio] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [extending, setExtending] = useState(false);
  const [newCheckOutDate, setNewCheckOutDate] = useState("");
  const [extendBusy, setExtendBusy] = useState(false);

  const [movingRoom, setMovingRoom] = useState(false);
  const [moveToRoomId, setMoveToRoomId] = useState("");
  const [moveReason, setMoveReason] = useState<RoomMoveReason>("GUEST_REQUEST");
  const [moveNotes, setMoveNotes] = useState("");
  const [moveBusy, setMoveBusy] = useState(false);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || scope === null || !canView || !stayId) return;
    let ignore = false;
    setStay(null);
    setLoadError(null);

    getStay(scope, stayId)
      .then((s) => {
        if (ignore) return;
        if (s === null) {
          setLoadError("Stay not found.");
          return;
        }
        setStay(s);
        return Promise.all([
          getGuest({ organizationId: scope.organizationId }, s.primaryGuestId),
          loadRoom(scope, s.roomId),
          getStayGuests(scope, s.id),
          getStayRoomMoves(scope, s.id),
          listRooms(scope),
          listRoomTypes(scope),
          getFolioByStay(scope, s.id).then((f) => f !== null),
        ]);
      })
      .then((results) => {
        if (ignore || !results) return;
        const [guestData, roomData, guests, moves, roomsList, typesList, folioExists] = results;
        setGuest(guestData);
        setRoom(roomData.room);
        setRoomType(roomData.roomType);
        setStayGuests(guests);
        setRoomMoves(moves);
        setRooms(roomsList);
        setRoomTypes(typesList);
        setHasFolio(folioExists);
      })
      .catch((error) => {
        if (!ignore) setLoadError(toPublicError(error).message);
      });

    return () => {
      ignore = true;
    };
  }, [view, scope, canView, stayId, reloadTick]);

  const reload = useCallback(() => setReloadTick((tick) => tick + 1), []);
  const report = useCallback((error: unknown) => setActionError(toPublicError(error).message), []);

  const roomTypeById = useMemo(() => {
    const map = new Map<string, RoomType>();
    for (const rt of roomTypes) map.set(rt.id, rt);
    return map;
  }, [roomTypes]);

  const availableRoomsForMove = useMemo(() => {
    if (stay === null) return [];
    return rooms.filter(
      (r) =>
        r.id !== stay.roomId &&
        r.archivedAt == null &&
        r.operationalStatus === "ACTIVE" &&
        r.housekeepingStatus === "VACANT_CLEAN" &&
        (room === null || r.roomTypeId === room.roomTypeId),
    );
  }, [rooms, stay, room]);

  const moveToRoomOptions: SelectOption<string>[] = useMemo(
    () =>
      availableRoomsForMove.map((r) => {
        const rt = roomTypeById.get(r.roomTypeId);
        return { value: r.id, label: `Room ${r.roomNumber}${rt ? ` (${rt.code})` : ""}` };
      }),
    [availableRoomsForMove, roomTypeById],
  );

  const handleCheckOut = async () => {
    if (stay === null || scope === null) return;
    try {
      await checkOut(scope, stay.id);
      setActionError(null);
      reload();
    } catch (error) {
      report(error);
    }
  };

  const handleExtendOpen = () => {
    setExtending(true);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setNewCheckOutDate(tomorrow.toISOString().split("T")[0]);
  };

  const handleExtendConfirm = async () => {
    if (stay === null || scope === null || newCheckOutDate === "") return;
    setExtendBusy(true);
    try {
      await extendStay(scope, stay.id, newCheckOutDate);
      setExtending(false);
      setNewCheckOutDate("");
      setActionError(null);
      reload();
    } catch (error) {
      report(error);
    } finally {
      setExtendBusy(false);
    }
  };

  const handleMoveRoom = async () => {
    if (stay === null || scope === null || moveToRoomId === "") return;
    setMoveBusy(true);
    try {
      await moveRoom(scope, stay.id, moveToRoomId, moveReason, moveNotes.trim() || undefined);
      setMovingRoom(false);
      setMoveToRoomId("");
      setMoveNotes("");
      setActionError(null);
      reload();
    } catch (error) {
      report(error);
    } finally {
      setMoveBusy(false);
    }
  };

  const canCheckOutThis = canCheckOut && stay !== null && stay.status === "CHECKED_IN";
  const canExtendThis = canExtend && stay !== null && (stay.status === "CHECKED_IN" || stay.status === "EXTENDED");
  const canMoveThis = canMoveRoom && stay !== null && stay.status === "CHECKED_IN";

  if (view === "bootstrapping") return <LoadingBlock label="Loading your workspace…" />;

  if (view === "unconfigured") {
    return (
      <EmptyState
        icon={<CircleSlash aria-hidden />}
        title="Backend not configured"
        description={storeError ?? NO_BACKEND_COPY}
      />
    );
  }

  if (view === "unauthenticated") {
    return (
      <EmptyState
        icon={<LogIn aria-hidden />}
        title="Sign in to view stays"
        description="There is no active session for this build to read a tenant from."
      />
    );
  }

  if (view === "no_property") {
    return (
      <EmptyState
        icon={<DoorOpen aria-hidden />}
        title="Choose a property first"
        description="Stays live inside one property. Pick a property and this screen will show the stay."
      />
    );
  }

  if (view === "scoped" && scope !== null && !canView) {
    return <AccessDenied capability="view stays" permission="stay.view" />;
  }

  if (view === "scoped" && scope !== null && canView) {
    if (loadError !== null) {
      return (
        <EmptyState
          icon={<CircleSlash aria-hidden />}
          title="Cannot load stay"
          description={loadError}
          action={
            <Button variant="secondary" onClick={() => navigate(-1)}>
              Go back
            </Button>
          }
        />
      );
    }

    if (stay === null) {
      return <LoadingBlock label="Loading stay…" />;
    }

    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-4 sm:gap-6">
        <header>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="mb-2 flex items-center gap-1 text-sm text-muted hover:text-ink"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back
          </button>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
            <DoorOpen className="size-5 shrink-0 text-brand-600" aria-hidden />
            Stay
            <StatusPill status={stay.status} />
          </h2>
        </header>

        {actionError !== null && (
          <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger">
            <span>{actionError}</span>
            <Button size="sm" variant="ghost" onClick={() => setActionError(null)}>
              Dismiss
            </Button>
          </div>
        )}

        <Card>
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-xs font-medium text-muted">Guest</p>
              {guest !== null ? (
                <p className="mt-1 text-sm text-ink">
                  {guest.firstName} {guest.lastName}
                  {guest.phone && <span className="text-muted"> · {guest.phone}</span>}
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted">Guest {stay.primaryGuestId.slice(0, 8)}…</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs font-medium text-muted">Room</p>
                {room !== null ? (
                  <p className="mt-1 text-sm text-ink">
                    Room {room.roomNumber}
                    {roomType && <Badge tone="neutral" className="ml-2">{roomType.code}</Badge>}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-muted">Unknown room</p>
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-muted">Check-in</p>
                <p className="mt-1 text-sm text-ink">{formatDateTime(stay.checkInAt)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted">Expected check-out</p>
                <p className="mt-1 text-sm text-ink">{formatDate(stay.expectedCheckOutAt)}</p>
              </div>
            </div>

            {stay.actualCheckOutAt !== null && (
              <div>
                <p className="text-xs font-medium text-muted">Actual check-out</p>
                <p className="mt-1 text-sm text-ink">{formatDateTime(stay.actualCheckOutAt)}</p>
              </div>
            )}

            {stay.notes && (
              <div>
                <p className="text-xs font-medium text-muted">Notes</p>
                <p className="mt-1 text-sm text-ink">{stay.notes}</p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
              {canCheckOutThis && (
                <Button variant="secondary" onClick={() => void handleCheckOut()}>
                  Check out
                </Button>
              )}
              {canExtendThis && (
                <Button variant="ghost" onClick={handleExtendOpen}>
                  Extend stay
                </Button>
              )}
              {canMoveThis && (
                <Button variant="ghost" icon={<DoorOpen className="size-4" aria-hidden />} onClick={() => setMovingRoom(true)}>
                  Move room
                </Button>
              )}
              {hasFolio && (
                <Button variant="ghost" onClick={() => navigate(`/folios/by-stay/${stay.id}`)}>
                  View folio
                </Button>
              )}
            </div>
          </div>
        </Card>

        {stayGuests.length > 0 && (
          <Card>
            <h3 className="mb-3 text-base font-semibold text-ink">Guests on this stay</h3>
            <div className="flex flex-col gap-2">
              {stayGuests.map((sg) => (
                <div key={sg.id} className="flex items-center justify-between border-b border-line pb-2 last:border-0">
                  <span className="text-sm text-ink">
                    Guest {sg.guestId.slice(0, 8)}…
                    <Badge tone="neutral" className="ml-2">{sg.role}</Badge>
                  </span>
                  <span className="text-xs text-muted">
                    {sg.checkedInAt !== null && `In: ${formatDateTime(sg.checkedInAt)}`}
                    {sg.checkedOutAt !== null && ` · Out: ${formatDateTime(sg.checkedOutAt)}`}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {roomMoves.length > 0 && (
          <Card>
            <h3 className="mb-3 text-base font-semibold text-ink">Room moves</h3>
            <div className="flex flex-col gap-2">
              {roomMoves.map((move) => (
                <div key={move.id} className="flex items-center justify-between border-b border-line pb-2 last:border-0">
                  <span className="text-sm text-ink">
                    {MOVE_REASON_LABELS[move.reason]}
                  </span>
                  <span className="text-xs text-muted">
                    {formatDateTime(move.movedAt)}
                    {move.notes && ` · ${move.notes}`}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Extend dialog */}
        <Dialog
          open={extending}
          onClose={() => setExtending(false)}
          title="Extend stay"
          description="Set a new check-out date for this stay."
          footer={
            <>
              <Button variant="secondary" onClick={() => setExtending(false)} disabled={extendBusy}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void handleExtendConfirm()} disabled={extendBusy || newCheckOutDate === ""}>
                {extendBusy ? "Extending…" : "Extend stay"}
              </Button>
            </>
          }
        >
          <Field label="New check-out date" required>
            <TextInput
              type="date"
              value={newCheckOutDate}
              disabled={extendBusy}
              onChange={(event) => setNewCheckOutDate(event.target.value)}
            />
          </Field>
        </Dialog>

        {/* Move room dialog */}
        <Dialog
          open={movingRoom}
          onClose={() => setMovingRoom(false)}
          title="Move to another room"
          description="Move this guest to a different room. The reason is recorded."
          footer={
            <>
              <Button variant="secondary" onClick={() => setMovingRoom(false)} disabled={moveBusy}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => void handleMoveRoom()}
                disabled={moveBusy || moveToRoomId === ""}
              >
                {moveBusy ? "Moving…" : "Move room"}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <Field label="New room" required>
              <SelectInput
                value={moveToRoomId}
                options={moveToRoomOptions}
                disabled={moveBusy}
                onChange={(value) => setMoveToRoomId(value)}
                placeholder="Choose a room…"
              />
            </Field>
            <Field label="Reason" required>
              <SelectInput
                value={moveReason}
                options={moveReasonOptions()}
                disabled={moveBusy}
                onChange={(value) => setMoveReason(value as RoomMoveReason)}
              />
            </Field>
            <Field label="Notes">
              <Textarea
                value={moveNotes}
                disabled={moveBusy}
                onChange={(event) => setMoveNotes(event.target.value)}
                placeholder="Optional notes about the move…"
              />
            </Field>
          </div>
        </Dialog>
      </div>
    );
  }

  return null;
}

/* --------------------------------------------------------------------- helpers */

async function loadRoom(
  scope: { organizationId: string; propertyId: string },
  roomId: string,
): Promise<{ room: Room | null; roomType: RoomType | null }> {
  const { listRooms, listRoomTypes } = await import("@/domain/hotel/room-service");
  const [roomsList, typesList] = await Promise.all([
    listRooms(scope, { includeArchived: true }),
    listRoomTypes(scope, { includeArchived: true }),
  ]);
  const room = roomsList.find((r) => r.id === roomId) ?? null;
  const roomType = room !== null ? typesList.find((rt) => rt.id === room.roomTypeId) ?? null : null;
  return { room, roomType };
}
