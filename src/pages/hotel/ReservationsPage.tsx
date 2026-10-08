/**
 * Reservations — bookings for future stays.
 *
 * A reservation moves through a state machine: INQUIRY → TENTATIVE → CONFIRMED → CHECKED_IN →
 * CHECKED_OUT, with CANCELLED and NO_SHOW as terminal branches. The screen lists reservations
 * for the property, lets the user create new ones, and drives state transitions (confirm, cancel,
 * mark no-show).
 *
 * The screen reads organization + property from the context store. With no property selected it
 * renders the deliberate "choose a property first" state.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar, CircleSlash, LogIn, Pencil, Plus, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
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
  RESERVATION_SOURCES,
  RESERVATION_STATUSES,
  type Guest,
  type Reservation,
  type ReservationSource,
  type ReservationStatus,
  type RoomType,
} from "@/domain/hotel/types";
import {
  cancelReservation,
  confirmReservation,
  createReservation,
  listReservations,
  markNoShow,
} from "@/domain/hotel/reservation-service";
import { listRoomTypes } from "@/domain/hotel/room-service";
import { searchGuests } from "@/domain/hotel/guest-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

/* --------------------------------------------------------------------- scope */

export type ReservationsPageView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_property"
  | "scoped";

export function pageStatusFor(status: ContextStatus, context: ActiveContext): ReservationsPageView {
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

const STATUS_LABELS: Record<ReservationStatus, string> = {
  INQUIRY: "Inquiry",
  TENTATIVE: "Tentative",
  CONFIRMED: "Confirmed",
  CHECKED_IN: "Checked in",
  CHECKED_OUT: "Checked out",
  CANCELLED: "Cancelled",
  NO_SHOW: "No show",
};

const SOURCE_LABELS: Record<ReservationSource, string> = {
  WALK_IN: "Walk-in",
  WEBSITE: "Website",
  OTA: "OTA",
  PHONE: "Phone",
  EMAIL: "Email",
  CORPORATE: "Corporate",
  OTHER: "Other",
};

function statusOptions(): SelectOption<ReservationStatus | "">[] {
  return [
    { value: "", label: "All statuses" },
    ...RESERVATION_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] })),
  ];
}

function sourceOptions(): SelectOption<ReservationSource>[] {
  return RESERVATION_SOURCES.map((value) => ({ value, label: SOURCE_LABELS[value] }));
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

/* --------------------------------------------------------------------- drafts */

type ReservationDraft = {
  source: ReservationSource;
  primaryGuestId: string;
  arrivalDate: string;
  departureDate: string;
  adults: string;
  children: string;
  infants: string;
  roomTypeId: string;
  specialRequests: string;
  notes: string;
};

function newDraft(): ReservationDraft {
  return {
    source: "WALK_IN",
    primaryGuestId: "",
    arrivalDate: todayISO(),
    departureDate: tomorrowISO(),
    adults: "1",
    children: "0",
    infants: "0",
    roomTypeId: "",
    specialRequests: "",
    notes: "",
  };
}

function validateDraft(draft: ReservationDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (draft.primaryGuestId === "") errors.primaryGuestId = "Choose a guest.";
  if (draft.arrivalDate === "") errors.arrivalDate = "An arrival date is required.";
  if (draft.departureDate === "") errors.departureDate = "A departure date is required.";
  if (draft.arrivalDate !== "" && draft.departureDate !== "" && draft.departureDate <= draft.arrivalDate) {
    errors.departureDate = "Departure must be after arrival.";
  }
  const adults = Number(draft.adults.trim());
  if (!Number.isInteger(adults) || adults < 1) errors.adults = "At least 1 adult.";
  const children = Number(draft.children.trim());
  if (!Number.isInteger(children) || children < 0) errors.children = "Enter 0 or more.";
  const infants = Number(draft.infants.trim());
  if (!Number.isInteger(infants) || infants < 0) errors.infants = "Enter 0 or more.";
  return errors;
}

/* --------------------------------------------------------------------- screen */

const NO_BACKEND_COPY = "This build has no backend configured, so it cannot read or save reservations.";

export default function ReservationsPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const storeError = useContextStore((s) => s.error);
  const bootstrap = useContextStore((s) => s.bootstrap);
  const navigate = useNavigate();

  const view = pageStatusFor(status, context);
  const scope = useMemo(() => hotelScopeFor(context), [context.organizationId, context.propertyId]);

  const canView = can("reservation.view", permissions);
  const canCreate = can("reservation.create", permissions);
  const canConfirm = can("reservation.confirm", permissions);
  const canCancel = can("reservation.cancel", permissions);

  const [reservations, setReservations] = useState<Reservation[] | null>(null);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [statusFilter, setStatusFilter] = useState<ReservationStatus | "">("");
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [cancelling, setCancelling] = useState<Reservation | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelBusy, setCancelBusy] = useState(false);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || scope === null || !canView) return;
    let ignore = false;
    setReservations(null);
    setListError(null);
    const options = statusFilter !== "" ? { status: statusFilter } : undefined;
    Promise.all([
      listReservations(scope, options),
      listRoomTypes(scope),
    ])
      .then(([list, types]) => {
        if (ignore) return;
        setReservations(list);
        setRoomTypes(types);
      })
      .catch((error) => {
        if (!ignore) setListError(toPublicError(error).message);
      });
    return () => {
      ignore = true;
    };
  }, [view, scope, canView, statusFilter, reloadTick]);

  const reload = useCallback(() => setReloadTick((tick) => tick + 1), []);
  const report = useCallback((error: unknown) => setActionError(toPublicError(error).message), []);

  const roomTypeById = useMemo(() => {
    const map = new Map<string, RoomType>();
    for (const rt of roomTypes) map.set(rt.id, rt);
    return map;
  }, [roomTypes]);

  const handleConfirm = async (reservation: Reservation) => {
    if (scope === null) return;
    try {
      await confirmReservation(scope, reservation.id, reservation.version);
      setActionError(null);
      reload();
    } catch (error) {
      report(error);
    }
  };

  const handleCancelOpen = (reservation: Reservation) => {
    setCancelling(reservation);
    setCancelReason("");
  };

  const handleCancelConfirm = async () => {
    if (cancelling === null || scope === null) return;
    if (cancelReason.trim() === "") return;
    setCancelBusy(true);
    try {
      await cancelReservation(scope, cancelling.id, cancelReason.trim(), cancelling.version);
      setCancelling(null);
      setCancelReason("");
      setActionError(null);
      reload();
    } catch (error) {
      report(error);
    } finally {
      setCancelBusy(false);
    }
  };

  const handleNoShow = async (reservation: Reservation) => {
    if (scope === null) return;
    try {
      await markNoShow(scope, reservation.id, reservation.version);
      setActionError(null);
      reload();
    } catch (error) {
      report(error);
    }
  };

  const searchForGuests = useCallback(
    async (term: string) => {
      if (scope === null || term.trim().length < 2) {
        setGuests([]);
        return;
      }
      try {
        const results = await searchGuests({ organizationId: scope.organizationId }, term.trim(), 20);
        setGuests(results);
      } catch {
        setGuests([]);
      }
    },
    [scope],
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          <Calendar className="size-5 shrink-0 text-brand-600" aria-hidden />
          Reservations
        </h2>
        <p className="mt-1 text-sm text-muted">
          Bookings for future stays. A reservation moves through states — Inquiry, Tentative,
          Confirmed, Checked in, Checked out — with Cancelled and No-show as terminal branches.
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
          title="Sign in to manage reservations"
          description="There is no active session for this build to read a tenant from."
        />
      )}

      {view === "no_property" && (
        <EmptyState
          icon={<Calendar aria-hidden />}
          title="Choose a property first"
          description="Reservations live inside one property. Pick a property and this screen will show its bookings."
        />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied capability="view reservations" permission="reservation.view" />
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
                <SelectInput
                  value={statusFilter}
                  options={statusOptions()}
                  onChange={(value) => setStatusFilter(value as ReservationStatus | "")}
                  className="w-40"
                />
                {canCreate && (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Plus className="size-4" aria-hidden />}
                    onClick={() => setSheetOpen(true)}
                  >
                    New reservation
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={reload}>
                  Reload
                </Button>
              </div>
            }
          >
            <p className="text-xs text-muted">
              {reservations === null ? "Loading…" : `${reservations.length} reservation${reservations.length === 1 ? "" : "s"}`}
            </p>
          </Card>

          {reservations === null ? (
            <LoadingBlock label="Reading reservations…" />
          ) : reservations.length === 0 ? (
            <EmptyState
              icon={<Calendar aria-hidden />}
              title={statusFilter !== "" ? "No matching reservations" : "No reservations yet"}
              description={
                statusFilter !== ""
                  ? `No reservations with status "${STATUS_LABELS[statusFilter as ReservationStatus]}".`
                  : "This property has no reservations. Create one to book a guest's stay."
              }
              action={
                canCreate && statusFilter === "" ? (
                  <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setSheetOpen(true)}>
                    Create the first reservation
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              {reservations.map((reservation) => (
                <ReservationCard
                  key={reservation.id}
                  reservation={reservation}
                  roomType={roomTypeById.get(reservation.roomTypeId ?? "") ?? null}
                  canConfirm={canConfirm}
                  canCancel={canCancel}
                  onConfirm={() => void handleConfirm(reservation)}
                  onCancel={() => handleCancelOpen(reservation)}
                  onNoShow={() => void handleNoShow(reservation)}
                  onOpen={() => navigate(`/reservations/${reservation.id}`)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {sheetOpen && scope !== null && (
        <ReservationSheet
          scope={scope}
          roomTypes={roomTypes}
          onClose={() => setSheetOpen(false)}
          onSaved={() => {
            setSheetOpen(false);
            setActionError(null);
            reload();
          }}
          onFailure={report}
          onSearchGuests={searchForGuests}
          guests={guests}
        />
      )}

      <Dialog
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        title="Cancel reservation"
        description={`Cancel reservation ${cancelling?.reservationNumber ?? ""}? A reason is required.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelling(null)} disabled={cancelBusy}>
              Keep it
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleCancelConfirm()}
              disabled={cancelBusy || cancelReason.trim() === ""}
            >
              {cancelBusy ? "Cancelling…" : "Cancel reservation"}
            </Button>
          </>
        }
      >
        <Field label="Cancellation reason" required>
          <Textarea
            value={cancelReason}
            disabled={cancelBusy}
            onChange={(event) => setCancelReason(event.target.value)}
            placeholder="Guest cancelled due to travel change…"
          />
        </Field>
      </Dialog>
    </div>
  );
}

/* --------------------------------------------------------------------- pieces */

type ReservationCardProps = {
  reservation: Reservation;
  roomType: RoomType | null;
  canConfirm: boolean;
  canCancel: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onNoShow: () => void;
  onOpen: () => void;
};

function ReservationCard({
  reservation,
  roomType,
  canConfirm,
  canCancel,
  onConfirm,
  onCancel,
  onNoShow,
  onOpen,
}: ReservationCardProps) {
  const canConfirmThis = canConfirm && (reservation.status === "INQUIRY" || reservation.status === "TENTATIVE");
  const canCancelThis = canCancel && !["CHECKED_OUT", "CANCELLED", "NO_SHOW"].includes(reservation.status);
  const canNoShowThis = canCancel && reservation.status === "CONFIRMED";

  return (
    <Card padded={false}>
      <div className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
              <button type="button" onClick={onOpen} className="hover:underline">
                {reservation.reservationNumber}
              </button>
              <StatusPill status={reservation.status} />
            </h3>
            <p className="mt-0.5 text-xs text-muted">
              <Badge tone="neutral">{SOURCE_LABELS[reservation.source]}</Badge>
              {" · "}
              {formatDate(reservation.arrivalDate)} → {formatDate(reservation.departureDate)}
              {" · "}
              {reservation.adults} adult{reservation.adults === 1 ? "" : "s"}
              {Number(reservation.children) > 0 && `, ${reservation.children} child${reservation.children === 1 ? "" : "ren"}`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {canConfirmThis && (
              <Button size="sm" variant="secondary" onClick={onConfirm}>
                Confirm
              </Button>
            )}
            {canNoShowThis && (
              <Button size="sm" variant="ghost" onClick={onNoShow}>
                No-show
              </Button>
            )}
            {canCancelThis && (
              <Button size="sm" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button size="sm" variant="ghost" icon={<Pencil className="size-4" aria-hidden />} onClick={onOpen}>
              Open
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          {roomType !== null && (
            <span>
              <Badge tone="neutral">{roomType.code}</Badge> {roomType.name}
            </span>
          )}
          <span>Guest {reservation.primaryGuestId.slice(0, 8)}…</span>
          <span>Currency: {reservation.currency}</span>
          {reservation.totalAmount > 0 && <span>Total: {reservation.totalAmount.toFixed(2)}</span>}
        </div>

        {reservation.specialRequests && (
          <p className="text-sm text-muted">
            <span className="font-medium">Requests:</span> {reservation.specialRequests}
          </p>
        )}
      </div>
    </Card>
  );
}

/* --------------------------------------------------------------------- sheet */

type ReservationSheetProps = {
  scope: { organizationId: string; propertyId: string };
  roomTypes: RoomType[];
  onClose: () => void;
  onSaved: () => void;
  onFailure: (error: unknown) => void;
  onSearchGuests: (term: string) => void;
  guests: Guest[];
};

function ReservationSheet({
  scope,
  roomTypes,
  onClose,
  onSaved,
  onFailure,
  onSearchGuests,
  guests,
}: ReservationSheetProps) {
  const [draft, setDraft] = useState<ReservationDraft>(newDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [guestSearch, setGuestSearch] = useState("");

  const roomTypeOptions: SelectOption<string>[] = useMemo(
    () => [
      { value: "", label: "No preference" },
      ...roomTypes.map((rt) => ({ value: rt.id, label: `${rt.code} — ${rt.name}` })),
    ],
    [roomTypes],
  );

  const guestOptions: SelectOption<string>[] = useMemo(
    () =>
      guests.map((g) => ({
        value: g.id,
        label: `${g.firstName} ${g.lastName}${g.phone ? ` (${g.phone})` : ""}`,
      })),
    [guests],
  );

  const handleGuestSearch = (term: string) => {
    setGuestSearch(term);
    onSearchGuests(term);
  };

  const run = async (): Promise<void> => {
    const found = validateDraft(draft);
    setErrors(found);
    if (Object.keys(found).length > 0 || busy) return;
    setBusy(true);
    try {
      await createReservation(scope, {
        source: draft.source,
        primaryGuestId: draft.primaryGuestId,
        arrivalDate: draft.arrivalDate,
        departureDate: draft.departureDate,
        adults: Number(draft.adults.trim()),
        children: Number(draft.children.trim()),
        infants: Number(draft.infants.trim()),
        roomTypeId: draft.roomTypeId !== "" ? draft.roomTypeId : null,
        specialRequests: draft.specialRequests.trim() || null,
        notes: draft.notes.trim() || null,
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
      side="right"
      title="New reservation"
      description="Book a guest's stay. Choose the guest, dates, room type, and number of guests. The reservation starts in Inquiry status."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void run()} disabled={busy}>
            {busy ? "Creating…" : "Create reservation"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Source" required>
          <SelectInput
            value={draft.source}
            options={sourceOptions()}
            disabled={busy}
            onChange={(value) => setDraft({ ...draft, source: value as ReservationSource })}
          />
        </Field>

        <div>
          <Field label="Guest" required error={errors.primaryGuestId}>
            <div className="flex flex-col gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
                <TextInput
                  value={guestSearch}
                  disabled={busy}
                  onChange={(event) => handleGuestSearch(event.target.value)}
                  placeholder="Search by name or phone…"
                  className="pl-9"
                />
              </div>
              <SelectInput
                value={draft.primaryGuestId}
                options={guestOptions}
                invalid={errors.primaryGuestId !== undefined}
                disabled={busy}
                onChange={(value) => setDraft({ ...draft, primaryGuestId: value })}
                placeholder="Choose a guest…"
              />
            </div>
          </Field>
          <p className="mt-1 text-xs text-muted">
            Search for the guest first, then select them from the dropdown.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Arrival date" required error={errors.arrivalDate}>
            <TextInput
              type="date"
              value={draft.arrivalDate}
              invalid={errors.arrivalDate !== undefined}
              disabled={busy}
              onChange={(event) => setDraft({ ...draft, arrivalDate: event.target.value })}
            />
          </Field>
          <Field label="Departure date" required error={errors.departureDate}>
            <TextInput
              type="date"
              value={draft.departureDate}
              invalid={errors.departureDate !== undefined}
              disabled={busy}
              onChange={(event) => setDraft({ ...draft, departureDate: event.target.value })}
            />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Adults" required error={errors.adults}>
            <TextInput
              type="number"
              inputMode="numeric"
              value={draft.adults}
              invalid={errors.adults !== undefined}
              disabled={busy}
              onChange={(event) => setDraft({ ...draft, adults: event.target.value })}
            />
          </Field>
          <Field label="Children" required error={errors.children}>
            <TextInput
              type="number"
              inputMode="numeric"
              value={draft.children}
              invalid={errors.children !== undefined}
              disabled={busy}
              onChange={(event) => setDraft({ ...draft, children: event.target.value })}
            />
          </Field>
          <Field label="Infants" required error={errors.infants}>
            <TextInput
              type="number"
              inputMode="numeric"
              value={draft.infants}
              invalid={errors.infants !== undefined}
              disabled={busy}
              onChange={(event) => setDraft({ ...draft, infants: event.target.value })}
            />
          </Field>
        </div>

        <Field label="Room type">
          <SelectInput
            value={draft.roomTypeId}
            options={roomTypeOptions}
            disabled={busy}
            onChange={(value) => setDraft({ ...draft, roomTypeId: value })}
          />
        </Field>

        <Field label="Special requests">
          <Textarea
            value={draft.specialRequests}
            disabled={busy}
            onChange={(event) => setDraft({ ...draft, specialRequests: event.target.value })}
            placeholder="Late check-in, extra pillows, etc."
          />
        </Field>

        <Field label="Notes">
          <Textarea
            value={draft.notes}
            disabled={busy}
            onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
            placeholder="Internal notes about this booking…"
          />
        </Field>
      </div>
    </Dialog>
  );
}
