/**
 * Room types — the categories of room a property sells (Deluxe, Suite, etc.).
 *
 * The screen reads organization + property from the context store and lists room types under
 * that pair. With no property selected it renders the deliberate "choose a property first" state.
 *
 * Room types are the template for rooms: a room points at its type, and the type carries the
 * default rate, capacity, and amenity set. Archiving a type is one-way (034 gives no restore door).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Bed, CircleSlash, LogIn, Pencil, Plus } from "lucide-react";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { ArchiveDialog } from "@/components/ui/ArchiveDialog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { LoadingBlock } from "@/components/ui/Spinner";
import { StatusPill } from "@/components/ui/StatusPill";
import { Switch } from "@/components/ui/Switch";
import { TextInput } from "@/components/ui/TextInput";
import { Textarea } from "@/components/ui/Textarea";
import { can, type ActiveContext } from "@/domain/identity/types";
import type { RoomType } from "@/domain/hotel/types";
import {
  archiveRoomType,
  createRoomType,
  listRoomTypes,
  updateRoomType,
} from "@/domain/hotel/room-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

/* --------------------------------------------------------------------- scope */

export type RoomTypesPageView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_property"
  | "scoped";

export function pageStatusFor(status: ContextStatus, context: ActiveContext): RoomTypesPageView {
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

/* --------------------------------------------------------------------- drafts */

type RoomTypeDraft = {
  code: string;
  name: string;
  description: string;
  maxOccupancy: string;
  baseOccupancy: string;
  roomSizeSqft: string;
};

function newDraft(): RoomTypeDraft {
  return { code: "", name: "", description: "", maxOccupancy: "4", baseOccupancy: "2", roomSizeSqft: "" };
}

function draftFrom(roomType: RoomType): RoomTypeDraft {
  return {
    code: roomType.code,
    name: roomType.name,
    description: roomType.description ?? "",
    maxOccupancy: String(roomType.maxOccupancy),
    baseOccupancy: String(roomType.baseOccupancy),
    roomSizeSqft: roomType.roomSizeSqft !== null ? String(roomType.roomSizeSqft) : "",
  };
}

function validateDraft(draft: RoomTypeDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (draft.code.trim() === "") errors.code = "A code is required.";
  if (draft.name.trim() === "") errors.name = "A name is required.";
  const max = Number(draft.maxOccupancy.trim());
  if (!Number.isInteger(max) || max < 1) errors.maxOccupancy = "Enter at least 1.";
  const base = Number(draft.baseOccupancy.trim());
  if (!Number.isInteger(base) || base < 1) errors.baseOccupancy = "Enter at least 1.";
  if (draft.roomSizeSqft.trim() !== "") {
    const size = Number(draft.roomSizeSqft.trim());
    if (!Number.isFinite(size) || size <= 0) errors.roomSizeSqft = "Enter a positive number.";
  }
  return errors;
}

/* --------------------------------------------------------------------- screen */

const NO_BACKEND_COPY = "This build has no backend configured, so it cannot read or save room types.";

type SheetMode = { kind: "new" } | { kind: "edit"; roomType: RoomType };

export default function RoomTypesPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const storeError = useContextStore((s) => s.error);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const scope = useMemo(() => hotelScopeFor(context), [context.organizationId, context.propertyId]);

  const canView = can("room_type.view", permissions);
  const canCreate = can("room_type.create", permissions);
  const canEdit = can("room_type.edit", permissions);
  const canArchive = can("room_type.archive", permissions);

  const [roomTypes, setRoomTypes] = useState<RoomType[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [sheet, setSheet] = useState<SheetMode | null>(null);
  const [archiving, setArchiving] = useState<RoomType | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || scope === null || !canView) return;
    let ignore = false;
    setRoomTypes(null);
    setListError(null);
    listRoomTypes(scope, showArchived ? { includeArchived: true } : {})
      .then((rows) => {
        if (ignore) return;
        setRoomTypes(rows);
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
      await archiveRoomType(scope, archiving.id, archiving.version);
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

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          <Bed className="size-5 shrink-0 text-brand-600" aria-hidden />
          Room Types
        </h2>
        <p className="mt-1 text-sm text-muted">
          Categories of room this property sells — Deluxe, Suite, Standard. Each room points at a
          type, which carries the default rate and capacity.
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
          title="Sign in to manage room types"
          description="There is no active session for this build to read a tenant from."
        />
      )}

      {view === "no_property" && (
        <EmptyState
          icon={<Bed aria-hidden />}
          title="Choose a property first"
          description="Room types live inside one property. Pick a property and this screen will show its room types."
        />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied capability="view room types" permission="room_type.view" />
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
                    New room type
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={reload}>
                  Reload
                </Button>
              </div>
            }
          >
            <p className="text-xs text-muted">
              {roomTypes === null ? "Loading…" : `${roomTypes.length} room type${roomTypes.length === 1 ? "" : "s"}`}
            </p>
          </Card>

          {roomTypes === null ? (
            <LoadingBlock label="Reading room types…" />
          ) : roomTypes.length === 0 ? (
            <EmptyState
              icon={<Bed aria-hidden />}
              title="No room types yet"
              description="This property has no room types. Add one — Deluxe, Suite, Standard — and rooms can be created under it."
              action={
                canCreate ? (
                  <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setSheet({ kind: "new" })}>
                    Add the first room type
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              {roomTypes.map((roomType) => (
                <RoomTypeCard
                  key={roomType.id}
                  roomType={roomType}
                  canEdit={canEdit}
                  canArchive={canArchive}
                  onEdit={() => setSheet({ kind: "edit", roomType })}
                  onArchive={() => setArchiving(roomType)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {sheet !== null && scope !== null && (
        <RoomTypeSheet
          mode={sheet}
          scope={scope}
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
        entityName={archiving?.name ?? ""}
        entityLabel="room type"
        consequences={[
          "The room type leaves the active list, and no new room can be created under it.",
          "Existing rooms keep pointing at it — their history is preserved.",
          "034 gives an archived type no restore door — this is permanent.",
        ]}
      />
    </div>
  );
}

/* --------------------------------------------------------------------- pieces */

type RoomTypeCardProps = {
  roomType: RoomType;
  canEdit: boolean;
  canArchive: boolean;
  onEdit: () => void;
  onArchive: () => void;
};

function RoomTypeCard({ roomType, canEdit, canArchive, onEdit, onArchive }: RoomTypeCardProps) {
  const archived = roomType.status === "ARCHIVED";

  return (
    <Card padded={false} className={archived ? "opacity-80" : undefined}>
      <div className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
              {roomType.name}
              {archived && <StatusPill status={roomType.status} />}
            </h3>
            <p className="mt-0.5 text-xs text-muted">
              <Badge tone="neutral">{roomType.code}</Badge>
              {" · "}
              {roomType.baseOccupancy}–{roomType.maxOccupancy} guest{roomType.maxOccupancy === 1 ? "" : "s"}
              {roomType.roomSizeSqft !== null && (
                <>
                  {" · "}
                  {roomType.roomSizeSqft} sq ft
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

        {roomType.description && (
          <p className="text-sm text-muted">{roomType.description}</p>
        )}
      </div>
    </Card>
  );
}

/* --------------------------------------------------------------------- sheet */

type RoomTypeSheetProps = {
  mode: SheetMode;
  scope: { organizationId: string; propertyId: string };
  onClose: () => void;
  onSaved: (message: string | null) => void;
  onFailure: (error: unknown) => void;
};

function RoomTypeSheet({ mode, scope, onClose, onSaved, onFailure }: RoomTypeSheetProps) {
  const editing = mode.kind === "edit" ? mode.roomType : null;
  const [draft, setDraft] = useState<RoomTypeDraft>(() =>
    editing === null ? newDraft() : draftFrom(editing),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const run = async (): Promise<void> => {
    const found = validateDraft(draft);
    setErrors(found);
    if (Object.keys(found).length > 0 || busy) return;
    setBusy(true);
    try {
      if (editing === null) {
        await createRoomType(scope, {
          code: draft.code.trim(),
          name: draft.name.trim(),
          description: draft.description.trim() || undefined,
          maxOccupancy: Number(draft.maxOccupancy.trim()),
          baseOccupancy: Number(draft.baseOccupancy.trim()),
          roomSizeSqft: draft.roomSizeSqft.trim() !== "" ? Number(draft.roomSizeSqft.trim()) : null,
        });
        onSaved(null);
        return;
      }
      const input: Record<string, unknown> = { expectedVersion: editing.version };
      if (draft.name.trim() !== editing.name) input.name = draft.name.trim();
      if (draft.description.trim() !== (editing.description ?? "")) {
        input.description = draft.description.trim() || null;
      }
      if (Number(draft.maxOccupancy.trim()) !== editing.maxOccupancy) {
        input.maxOccupancy = Number(draft.maxOccupancy.trim());
      }
      if (Number(draft.baseOccupancy.trim()) !== editing.baseOccupancy) {
        input.baseOccupancy = Number(draft.baseOccupancy.trim());
      }
      const newSize = draft.roomSizeSqft.trim() !== "" ? Number(draft.roomSizeSqft.trim()) : null;
      if (newSize !== editing.roomSizeSqft) {
        input.roomSizeSqft = newSize;
      }
      if (Object.keys(input).length === 1) {
        onSaved("Nothing changed, so the room type was left exactly as it was.");
        return;
      }
      await updateRoomType(scope, editing.id, input as Parameters<typeof updateRoomType>[2]);
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
      title={editing === null ? "New room type" : `Edit ${editing.name}`}
      description="A room type is a category of room — Deluxe, Suite, Standard. Rooms point at a type and inherit its default rate and capacity."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void run()} disabled={busy}>
            {busy ? "Saving…" : editing === null ? "Create room type" : "Save changes"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Code" required error={errors.code}>
          <TextInput
            value={draft.code}
            invalid={errors.code !== undefined}
            disabled={busy || editing !== null}
            onChange={(event) => setDraft({ ...draft, code: event.target.value })}
            placeholder="DLX"
          />
        </Field>

        <Field label="Name" required error={errors.name}>
          <TextInput
            value={draft.name}
            invalid={errors.name !== undefined}
            disabled={busy}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            placeholder="Deluxe Room"
          />
        </Field>

        <Field label="Description" error={errors.description}>
          <Textarea
            value={draft.description}
            disabled={busy}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            placeholder="Spacious room with city view, king bed, work desk."
          />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Max occupancy" required error={errors.maxOccupancy}>
            <TextInput
              type="number"
              inputMode="numeric"
              value={draft.maxOccupancy}
              invalid={errors.maxOccupancy !== undefined}
              disabled={busy}
              onChange={(event) => setDraft({ ...draft, maxOccupancy: event.target.value })}
            />
          </Field>
          <Field label="Base occupancy" required error={errors.baseOccupancy}>
            <TextInput
              type="number"
              inputMode="numeric"
              value={draft.baseOccupancy}
              invalid={errors.baseOccupancy !== undefined}
              disabled={busy}
              onChange={(event) => setDraft({ ...draft, baseOccupancy: event.target.value })}
            />
          </Field>
          <Field label="Size (sq ft)" error={errors.roomSizeSqft}>
            <TextInput
              type="number"
              inputMode="decimal"
              value={draft.roomSizeSqft}
              invalid={errors.roomSizeSqft !== undefined}
              disabled={busy}
              onChange={(event) => setDraft({ ...draft, roomSizeSqft: event.target.value })}
              placeholder="250"
            />
          </Field>
        </div>

        {editing !== null && (
          <p className="text-xs leading-relaxed text-muted">
            The code cannot be changed after creation. Archive this type and create a new one if the
            code needs to differ.
          </p>
        )}
      </div>
    </Dialog>
  );
}
