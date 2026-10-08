/**
 * Reservation detail — the full record of a single booking.
 *
 * Shows the reservation's guest, dates, room type, rate snapshots, room assignments, and
 * current status. Drives state transitions: confirm (INQUIRY/TENTATIVE → CONFIRMED), cancel
 * (any non-terminal → CANCELLED), mark no-show (CONFIRMED → NO_SHOW), and assign a room.
 *
 * The screen reads the reservation ID from the URL and fetches it from the reservation service.
 * With no session or no permission it renders the appropriate empty state.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Calendar, CircleSlash, LogIn, Pencil } from "lucide-react";
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
import { Textarea } from "@/components/ui/Textarea";
import { can, type ActiveContext } from "@/domain/identity/types";
import type {
  Guest,
  Reservation,
  ReservationRateSnapshot,
  ReservationRoomAssignment,
  Room,
  RoomType,
} from "@/domain/hotel/types";
import {
  assignRoom,
  cancelReservation,
  confirmReservation,
  getReservation,
  getReservationRateSnapshots,
  getReservationRoomAssignments,
  markNoShow,
} from "@/domain/hotel/reservation-service";
import { listRoomTypes, listRooms } from "@/domain/hotel/room-service";
import { getGuest } from "@/domain/hotel/guest-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

/* --------------------------------------------------------------------- scope */

export type ReservationDetailPageView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_property"
  | "not_found"
  | "scoped";

export function pageStatusFor(status: ContextStatus, context: ActiveContext): ReservationDetailPageView {
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

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/* --------------------------------------------------------------------- screen */

const NO_BACKEND_COPY = "This build has no backend configured, so it cannot read reservations.";

export default function ReservationDetailPage() {
  const { reservationId } = useParams<{ reservationId: string }>();
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const storeError = useContextStore((s) => s.error);
  const bootstrap = useContextStore((s) => s.bootstrap);
  const navigate = useNavigate();

  const view = pageStatusFor(status, context);
  const scope = useMemo(() => hotelScopeFor(context), [context.organizationId, context.propertyId]);

  const canView = can("reservation.view", permissions);
  const canConfirm = can("reservation.confirm", permissions);
  const canCancel = can("reservation.cancel", permissions);
  const canAssignRoom = can("reservation.assign_room", permissions);

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [guest, setGuest] = useState<Guest | null>(null);
  const [roomType, setRoomType] = useState<RoomType | null>(null);
  const [rateSnapshots, setRateSnapshots] = useState<ReservationRateSnapshot[]>([]);
  const [roomAssignments, setRoomAssignments] = useState<ReservationRoomAssignment[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelBusy, setCancelBusy] = useState(false);

  const [assigningRoom, setAssigningRoom] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || scope === null || !canView || !reservationId) return;
    let ignore = false;
    setReservation(null);
    setLoadError(null);

    getReservation(scope, reservationId)
      .then((res) => {
        if (ignore) return;
        if (res === null) {
          setLoadError("Reservation not found.");
          return;
        }
        setReservation(res);
        return Promise.all([
          getGuest({ organizationId: scope.organizationId }, res.primaryGuestId),
          res.roomTypeId !== null ? getRoomType(scope, res.roomTypeId) : Promise.resolve(null),
          getReservationRateSnapshots(scope, res.id),
          getReservationRoomAssignments(scope, res.id),
          listRooms(scope),
          listRoomTypes(scope),
        ]);
      })
      .then((results) => {
        if (ignore || !results) return;
        const [guestData, rtData, snapshots, assignments, roomsList, typesList] = results;
        setGuest(guestData);
        setRoomType(rtData);
        setRateSnapshots(snapshots);
        setRoomAssignments(assignments);
        setRooms(roomsList);
        setRoomTypes(typesList);
      })
      .catch((error) => {
        if (!ignore) setLoadError(toPublicError(error).message);
      });

    return () => {
      ignore = true;
    };
  }, [view, scope, canView, reservationId, reloadTick]);

  const reload = useCallback(() => setReloadTick((tick) => tick + 1), []);
  const report = useCallback((error: unknown) => setActionError(toPublicError(error).message), []);

  const handleConfirm = async () => {
    if (reservation === null || scope === null) return;
    try {
      await confirmReservation(scope, reservation.id, reservation.version);
      setActionError(null);
      reload();
    } catch (error) {
      report(error);
    }
  };

  const handleCancelOpen = () => {
    setCancelling(true);
    setCancelReason("");
  };

  const handleCancelConfirm = async () => {
    if (reservation === null || scope === null) return;
    if (cancelReason.trim() === "") return;
    setCancelBusy(true);
    try {
      await cancelReservation(scope, reservation.id, cancelReason.trim(), reservation.version);
      setCancelling(false);
      setCancelReason("");
      setActionError(null);
      reload();
    } catch (error) {
      report(error);
    } finally {
      setCancelBusy(false);
    }
  };

  const handleNoShow = async () => {
    if (reservation === null || scope === null) return;
    try {
      await markNoShow(scope, reservation.id, reservation.version);
      setActionError(null);
      reload();
    } catch (error) {
      report(error);
    }
  };

  const handleAssignRoom = async () => {
    if (reservation === null || scope === null || selectedRoomId === "") return;
    setAssignBusy(true);
    try {
      await assignRoom(scope, reservation.id, selectedRoomId);
      setAssigningRoom(false);
      setSelectedRoomId("");
      setActionError(null);
      reload();
    } catch (error) {
      report(error);
    } finally {
      setAssignBusy(false);
    }
  };

  const roomTypeById = useMemo(() => {
    const map = new Map<string, RoomType>();
    for (const rt of roomTypes) map.set(rt.id, rt);
    return map;
  }, [roomTypes]);

  const roomById = useMemo(() => {
    const map = new Map<string, Room>();
    for (const r of rooms) map.set(r.id, r);
    return map;
  }, [rooms]);

  const availableRoomsForAssignment = useMemo(() => {
    if (reservation === null) return [];
    return rooms.filter(
      (r) =>
        r.archivedAt == null &&
        r.operationalStatus === "ACTIVE" &&
        (reservation.roomTypeId === null || r.roomTypeId === reservation.roomTypeId),
    );
  }, [rooms, reservation]);

  const roomAssignmentOptions: SelectOption<string>[] = useMemo(
    () =>
      availableRoomsForAssignment.map((r) => {
        const rt = roomTypeById.get(r.roomTypeId);
        return { value: r.id, label: `Room ${r.roomNumber}${rt ? ` (${rt.code})` : ""}` };
      }),
    [availableRoomsForAssignment, roomTypeById],
  );

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
        title="Sign in to view reservations"
        description="There is no active session for this build to read a tenant from."
      />
    );
  }

  if (view === "no_property") {
    return (
      <EmptyState
        icon={<Calendar aria-hidden />}
        title="Choose a property first"
        description="Reservations live inside one property. Pick a property and this screen will show the booking."
      />
    );
  }

  if (view === "scoped" && scope !== null && !canView) {
    return <AccessDenied capability="view reservations" permission="reservation.view" />;
  }

  if (view === "scoped" && scope !== null && canView) {
    if (loadError !== null) {
      return (
        <EmptyState
          icon={<CircleSlash aria-hidden />}
          title="Cannot load reservation"
          description={loadError}
          action={
            <Button variant="secondary" onClick={() => navigate("/reservations")}>
              Back to reservations
            </Button>
          }
        />
      );
    }

    if (reservation === null) {
      return <LoadingBlock label="Loading reservation…" />;
    }

    const canConfirmThis = canConfirm && (reservation.status === "INQUIRY" || reservation.status === "TENTATIVE");
    const canCancelThis = canCancel && !["CHECKED_OUT", "CANCELLED", "NO_SHOW"].includes(reservation.status);
    const canNoShowThis = canCancel && reservation.status === "CONFIRMED";
    const canAssignThis = canAssignRoom && reservation.status === "CONFIRMED";

    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-4 sm:gap-6">
        <header>
          <button
            type="button"
            onClick={() => navigate("/reservations")}
            className="mb-2 flex items-center gap-1 text-sm text-muted hover:text-ink"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to reservations
          </button>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
            <Calendar className="size-5 shrink-0 text-brand-600" aria-hidden />
            {reservation.reservationNumber}
            <StatusPill status={reservation.status} />
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
                  {guest.email && <span className="text-muted"> · {guest.email}</span>}
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted">Guest {reservation.primaryGuestId.slice(0, 8)}…</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs font-medium text-muted">Arrival</p>
                <p className="mt-1 text-sm text-ink">{formatDate(reservation.arrivalDate)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted">Departure</p>
                <p className="mt-1 text-sm text-ink">{formatDate(reservation.departureDate)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted">Adults</p>
                <p className="mt-1 text-sm text-ink">{reservation.adults}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted">Children</p>
                <p className="mt-1 text-sm text-ink">{reservation.children}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs font-medium text-muted">Room type</p>
                {roomType !== null ? (
                  <p className="mt-1 text-sm text-ink">
                    <Badge tone="neutral">{roomType.code}</Badge> {roomType.name}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-muted">No preference</p>
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-muted">Source</p>
                <p className="mt-1 text-sm text-ink">{reservation.source}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted">Currency</p>
                <p className="mt-1 text-sm text-ink">{reservation.currency}</p>
              </div>
            </div>

            {reservation.specialRequests && (
              <div>
                <p className="text-xs font-medium text-muted">Special requests</p>
                <p className="mt-1 text-sm text-ink">{reservation.specialRequests}</p>
              </div>
            )}

            {reservation.notes && (
              <div>
                <p className="text-xs font-medium text-muted">Notes</p>
                <p className="mt-1 text-sm text-ink">{reservation.notes}</p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
              {canConfirmThis && (
                <Button variant="secondary" onClick={() => void handleConfirm()}>
                  Confirm reservation
                </Button>
              )}
              {canNoShowThis && (
                <Button variant="ghost" onClick={() => void handleNoShow()}>
                  Mark no-show
                </Button>
              )}
              {canCancelThis && (
                <Button variant="ghost" onClick={handleCancelOpen}>
                  Cancel reservation
                </Button>
              )}
              {canAssignThis && (
                <Button variant="ghost" icon={<Pencil className="size-4" aria-hidden />} onClick={() => setAssigningRoom(true)}>
                  Assign room
                </Button>
              )}
            </div>
          </div>
        </Card>

        {rateSnapshots.length > 0 && (
          <Card>
            <h3 className="mb-3 text-base font-semibold text-ink">Rate snapshots</h3>
            <div className="flex flex-col gap-2">
              {rateSnapshots.map((snap) => (
                <div key={snap.id} className="flex items-center justify-between border-b border-line pb-2 last:border-0">
                  <span className="text-sm text-ink">{formatDate(snap.rateDate)}</span>
                  <span className="text-sm tabular-nums text-ink">
                    {snap.roomRate.toFixed(2)} + {snap.taxAmount.toFixed(2)} tax = {snap.totalAmount.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {roomAssignments.length > 0 && (
          <Card>
            <h3 className="mb-3 text-base font-semibold text-ink">Room assignments</h3>
            <div className="flex flex-col gap-2">
              {roomAssignments.map((assignment) => {
                const room = roomById.get(assignment.roomId);
                return (
                  <div key={assignment.id} className="flex items-center justify-between border-b border-line pb-2 last:border-0">
                    <span className="text-sm text-ink">
                      {room !== null && room !== undefined ? `Room ${room.roomNumber}` : "Unknown room"}
                    </span>
                    <span className="text-xs text-muted">
                      Assigned {formatDateTime(assignment.assignedAt)}
                      {assignment.unassignedAt !== null && ` · Unassigned ${formatDateTime(assignment.unassignedAt)}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {cancelling && (
          <Dialog
            open
            onClose={() => setCancelling(false)}
            title="Cancel reservation"
            description="Cancelling this reservation will mark it as CANCELLED. This action can be undone only by creating a new reservation."
            footer={
              <>
                <Button variant="secondary" onClick={() => setCancelling(false)} disabled={cancelBusy}>
                  Keep reservation
                </Button>
                <Button variant="danger" onClick={() => void handleCancelConfirm()} disabled={cancelBusy}>
                  {cancelBusy ? "Cancelling…" : "Cancel reservation"}
                </Button>
              </>
            }
          >
            <Field label="Reason for cancellation" required>
              <Textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Guest cancelled due to travel plans change…"
                rows={3}
              />
            </Field>
          </Dialog>
        )}

        {assigningRoom && (
          <Dialog
            open
            onClose={() => setAssigningRoom(false)}
            title="Assign room"
            description="Select an available room for this reservation. The room must match the requested room type (if any) and be operationally active."
            footer={
              <>
                <Button variant="secondary" onClick={() => setAssigningRoom(false)} disabled={assignBusy}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={() => void handleAssignRoom()}
                  disabled={assignBusy || selectedRoomId === ""}
                >
                  {assignBusy ? "Assigning…" : "Assign room"}
                </Button>
              </>
            }
          >
            <Field label="Available rooms" required>
              <SelectInput
                value={selectedRoomId}
                onChange={setSelectedRoomId}
                options={roomAssignmentOptions}
                placeholder="Select a room…"
              />
            </Field>
          </Dialog>
        )}
      </div>
    );
  }

  return null;
}

/* --------------------------------------------------------------------- helpers */

async function getRoomType(
  scope: { organizationId: string; propertyId: string },
  roomTypeId: string,
): Promise<RoomType | null> {
  const { listRoomTypes } = await import("@/domain/hotel/room-service");
  const types = await listRoomTypes(scope, { includeArchived: true });
  return types.find((rt) => rt.id === roomTypeId) ?? null;
}
