/**
 * Front desk — the day's operational picture.
 *
 * Three lists, all read from the reservation and stay services: today's expected arrivals
 * (CONFIRMED reservations whose arrival date is today), today's expected departures (in-house
 * stays whose expected check-out is today), and currently in-house guests (CHECKED_IN/EXTENDED
 * stays — the doors treat EXTENDED as still in-house).
 *
 * The screen is a triage board, not a detail page. Each row offers the one action the desk
 * needs most: check-in for arrivals, check-out for departures, and a link to the stay for
 * in-house guests.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, CircleSlash, Home, LogIn, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { StatusPill } from "@/components/ui/StatusPill";
import { can, type ActiveContext } from "@/domain/identity/types";
import type {
  Reservation,
  Room,
  RoomType,
  Stay,
} from "@/domain/hotel/types";
import { listReservations } from "@/domain/hotel/reservation-service";
import { listStays, checkIn as doCheckIn, checkOut as doCheckOut } from "@/domain/hotel/stay-service";
import { listRooms, listRoomTypes } from "@/domain/hotel/room-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

/* --------------------------------------------------------------------- scope */

export type FrontDeskPageView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_property"
  | "scoped";

export function pageStatusFor(status: ContextStatus, context: ActiveContext): FrontDeskPageView {
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

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

/* --------------------------------------------------------------------- screen */

const NO_BACKEND_COPY = "This build has no backend configured, so it cannot read the front desk.";

export default function FrontDeskPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const storeError = useContextStore((s) => s.error);
  const bootstrap = useContextStore((s) => s.bootstrap);
  const navigate = useNavigate();

  const view = pageStatusFor(status, context);
  const scope = useMemo(() => hotelScopeFor(context), [context.organizationId, context.propertyId]);

  const canView = can("reservation.view", permissions) || can("stay.view", permissions);
  const canCheckIn = can("frontoffice.checkin", permissions);
  const canCheckOut = can("frontoffice.checkout", permissions);

  const [arrivals, setArrivals] = useState<Reservation[] | null>(null);
  const [departures, setDepartures] = useState<Stay[] | null>(null);
  const [inHouse, setInHouse] = useState<Stay[] | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || scope === null || !canView) return;
    let ignore = false;
    setArrivals(null);
    setDepartures(null);
    setInHouse(null);
    setListError(null);

    const today = todayISO();

    Promise.all([
      listReservations(scope, { status: "CONFIRMED", arrivalDateFrom: today, arrivalDateTo: today }),
      listStays(scope, { status: ["CHECKED_IN", "EXTENDED"] }),
      listRooms(scope),
      listRoomTypes(scope),
    ])
      .then(([confirmedArrivals, activeStays, roomsList, typesList]) => {
        if (ignore) return;
        setArrivals(confirmedArrivals);

        const todayDep = activeStays.filter(
          (s) => s.expectedCheckOutAt.split("T")[0] === today,
        );
        setDepartures(todayDep);

        setInHouse(activeStays);
        setRooms(roomsList);
        setRoomTypes(typesList);
      })
      .catch((error) => {
        if (!ignore) setListError(toPublicError(error).message);
      });
    return () => {
      ignore = true;
    };
  }, [view, scope, canView, reloadTick]);

  const reload = useCallback(() => setReloadTick((tick) => tick + 1), []);
  const report = useCallback((error: unknown) => setActionError(toPublicError(error).message), []);

  const roomById = useMemo(() => {
    const map = new Map<string, Room>();
    for (const r of rooms) map.set(r.id, r);
    return map;
  }, [rooms]);

  const roomTypeById = useMemo(() => {
    const map = new Map<string, RoomType>();
    for (const rt of roomTypes) map.set(rt.id, rt);
    return map;
  }, [roomTypes]);

  const handleCheckIn = async (reservation: Reservation, roomId: string) => {
    if (scope === null) return;
    try {
      const stay = await doCheckIn(scope, reservation.id, roomId, reservation.departureDate);
      setActionError(null);
      navigate(`/hotel/stays/${stay.id}`);
    } catch (error) {
      report(error);
    }
  };

  const handleCheckOut = async (stay: Stay) => {
    if (scope === null) return;
    try {
      await doCheckOut(scope, stay.id);
      setActionError(null);
      reload();
    } catch (error) {
      report(error);
    }
  };

  const roomStats = useMemo(() => {
    const active = rooms.filter((r) => r.archivedAt == null);
    // INSPECTED is the terminal state of a verified checkout clean — a verified room is sellable.
    const available = active.filter(
      (r) =>
        r.operationalStatus === "ACTIVE" &&
        (r.housekeepingStatus === "VACANT_CLEAN" || r.housekeepingStatus === "INSPECTED"),
    );
    const occupied = active.filter((r) => r.housekeepingStatus === "OCCUPIED_CLEAN" || r.housekeepingStatus === "OCCUPIED_DIRTY");
    const dirty = active.filter((r) => r.housekeepingStatus === "VACANT_DIRTY");
    const ooo = active.filter((r) => r.operationalStatus === "OUT_OF_ORDER" || r.operationalStatus === "OUT_OF_SERVICE");
    return { total: active.length, available: available.length, occupied: occupied.length, dirty: dirty.length, ooo: ooo.length };
  }, [rooms]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          <Home className="size-5 shrink-0 text-brand-600" aria-hidden />
          Front Desk
        </h2>
        <p className="mt-1 text-sm text-muted">
          Today's operational picture — arrivals to check in, departures to check out, and
          guests currently in-house.
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
          title="Sign in to use the front desk"
          description="There is no active session for this build to read a tenant from."
        />
      )}

      {view === "no_property" && (
        <EmptyState
          icon={<Home aria-hidden />}
          title="Choose a property first"
          description="The front desk operates within one property. Pick a property and this screen will show today's activity."
        />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied capability="view the front desk" permission="reservation.view" />
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

          {/* Room stats strip */}
          {rooms.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Card>
                <p className="text-xs text-muted">Total rooms</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{roomStats.total}</p>
              </Card>
              <Card>
                <p className="text-xs text-muted">Available</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-green-700">{roomStats.available}</p>
              </Card>
              <Card>
                <p className="text-xs text-muted">Occupied</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{roomStats.occupied}</p>
              </Card>
              <Card>
                <p className="text-xs text-muted">Dirty</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-700">{roomStats.dirty}</p>
              </Card>
              <Card>
                <p className="text-xs text-muted">Out of order</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-danger">{roomStats.ooo}</p>
              </Card>
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted">{todayISO()}</p>
            <Button size="sm" variant="ghost" onClick={reload}>
              Reload
            </Button>
          </div>

          {/* Arrivals */}
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink">
              <ArrowDownCircle className="size-4 text-brand-600" aria-hidden />
              Expected arrivals
            </h3>
            {arrivals === null ? (
              <LoadingBlock label="Reading arrivals…" />
            ) : arrivals.length === 0 ? (
              <Card>
                <p className="text-sm text-muted">No confirmed arrivals for today.</p>
              </Card>
            ) : (
              <div className="flex flex-col gap-2">
                {arrivals.map((res) => (
                  <ArrivalRow
                    key={res.id}
                    reservation={res}
                    roomType={roomTypeById.get(res.roomTypeId ?? "") ?? null}
                    availableRooms={rooms.filter(
                      (r) =>
                        r.archivedAt == null &&
                        r.operationalStatus === "ACTIVE" &&
                        (r.housekeepingStatus === "VACANT_CLEAN" || r.housekeepingStatus === "INSPECTED") &&
                        (res.roomTypeId === null || r.roomTypeId === res.roomTypeId),
                    )}
                    canCheckIn={canCheckIn}
                    onCheckIn={(roomId) => void handleCheckIn(res, roomId)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Departures */}
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink">
              <ArrowUpCircle className="size-4 text-brand-600" aria-hidden />
              Expected departures
            </h3>
            {departures === null ? (
              <LoadingBlock label="Reading departures…" />
            ) : departures.length === 0 ? (
              <Card>
                <p className="text-sm text-muted">No departures expected today.</p>
              </Card>
            ) : (
              <div className="flex flex-col gap-2">
                {departures.map((stay) => (
                  <DepartureRow
                    key={stay.id}
                    stay={stay}
                    room={roomById.get(stay.roomId) ?? null}
                    canCheckOut={canCheckOut}
                    onCheckOut={() => void handleCheckOut(stay)}
                    onOpen={() => navigate(`/hotel/stays/${stay.id}`)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* In-house */}
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink">
              <Users className="size-4 text-brand-600" aria-hidden />
              In-house guests
            </h3>
            {inHouse === null ? (
              <LoadingBlock label="Reading in-house guests…" />
            ) : inHouse.length === 0 ? (
              <Card>
                <p className="text-sm text-muted">No guests currently in-house.</p>
              </Card>
            ) : (
              <div className="flex flex-col gap-2">
                {inHouse.map((stay) => (
                  <InHouseRow
                    key={stay.id}
                    stay={stay}
                    room={roomById.get(stay.roomId) ?? null}
                    onOpen={() => navigate(`/hotel/stays/${stay.id}`)}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- pieces */

type ArrivalRowProps = {
  reservation: Reservation;
  roomType: RoomType | null;
  availableRooms: Room[];
  canCheckIn: boolean;
  onCheckIn: (roomId: string) => void;
};

function ArrivalRow({ reservation, roomType, availableRooms, canCheckIn, onCheckIn }: ArrivalRowProps) {
  const [selectedRoom, setSelectedRoom] = useState(availableRooms[0]?.id ?? "");

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">
            {reservation.reservationNumber}
            {roomType && <Badge tone="neutral" className="ml-2">{roomType.code}</Badge>}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {reservation.adults} adult{reservation.adults === 1 ? "" : "s"}
            {Number(reservation.children) > 0 && `, ${reservation.children} child${reservation.children === 1 ? "" : "ren"}`}
            {" · "}
            Guest {reservation.primaryGuestId.slice(0, 8)}…
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {availableRooms.length > 0 ? (
            <select
              value={selectedRoom}
              onChange={(e) => setSelectedRoom(e.target.value)}
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink"
            >
              {availableRooms.map((r) => (
                <option key={r.id} value={r.id}>
                  Room {r.roomNumber}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-muted">No available rooms</span>
          )}
          {canCheckIn && availableRooms.length > 0 && (
            <Button size="sm" variant="secondary" onClick={() => onCheckIn(selectedRoom)}>
              Check in
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

type DepartureRowProps = {
  stay: Stay;
  room: Room | null;
  canCheckOut: boolean;
  onCheckOut: () => void;
  onOpen: () => void;
};

function DepartureRow({ stay, room, canCheckOut, onCheckOut, onOpen }: DepartureRowProps) {
  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">
            {room !== null ? `Room ${room.roomNumber}` : "Unknown room"}
            <StatusPill status={stay.status} className="ml-2" />
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Checked in {formatDate(stay.checkInAt)}
            {" · "}
            Guest {stay.primaryGuestId.slice(0, 8)}…
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={onOpen}>
            Open stay
          </Button>
          {canCheckOut && (
            <Button size="sm" variant="secondary" onClick={onCheckOut}>
              Check out
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

type InHouseRowProps = {
  stay: Stay;
  room: Room | null;
  onOpen: () => void;
};

function InHouseRow({ stay, room, onOpen }: InHouseRowProps) {
  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">
            {room !== null ? `Room ${room.roomNumber}` : "Unknown room"}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Checked in {formatDate(stay.checkInAt)}
            {" · "}
            Depart {formatDate(stay.expectedCheckOutAt)}
            {" · "}
            Guest {stay.primaryGuestId.slice(0, 8)}…
          </p>
        </div>

        <Button size="sm" variant="ghost" onClick={onOpen}>
          Open stay
        </Button>
      </div>
    </Card>
  );
}
