/**
 * Lost & found — items found on the property, tracked until returned.
 *
 * Each item records what was found, where, when, and by whom. Items move
 * through statuses: FOUND → STORED → CLAIMED → RETURNED (or DISPOSED).
 *
 * The screen reads organization + property from the context store.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, LogIn, Package, Plus, RotateCcw } from "lucide-react";
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
  LOST_FOUND_CATEGORIES,
  LOST_FOUND_STATUSES,
  type LostFoundCategory,
  type LostFoundItem,
  type LostFoundStatus,
  type Room,
} from "@/domain/hotel/types";
import {
  createLostFoundItem,
  listLostFoundItems,
  returnLostFoundItem,
} from "@/domain/hotel/lost-found-service";
import { listRooms } from "@/domain/hotel/room-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

/* --------------------------------------------------------------------- scope */

export type LostFoundPageView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_property"
  | "scoped";

export function pageStatusFor(status: ContextStatus, context: ActiveContext): LostFoundPageView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null && context.propertyId !== null
      ? "scoped"
      : "no_property";
  }
  return "bootstrapping";
}

export function lostFoundScopeFor(context: ActiveContext): {
  organizationId: string;
  propertyId: string;
} | null {
  if (context.organizationId === null || context.propertyId === null) return null;
  return { organizationId: context.organizationId, propertyId: context.propertyId };
}

/* --------------------------------------------------------------------- helpers */

const STATUS_LABELS: Record<LostFoundStatus, string> = {
  FOUND: "Found",
  STORED: "Stored",
  CLAIMED: "Claimed",
  RETURNED: "Returned",
  DISPOSED: "Disposed",
};

const CATEGORY_LABELS: Record<LostFoundCategory, string> = {
  ELECTRONICS: "Electronics",
  JEWELRY: "Jewelry",
  CLOTHING: "Clothing",
  DOCUMENTS: "Documents",
  KEYS: "Keys",
  MEDICATION: "Medication",
  OTHER: "Other",
};

function statusOptions(): SelectOption<LostFoundStatus | "">[] {
  return [
    { value: "", label: "All statuses" },
    ...LOST_FOUND_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] })),
  ];
}

function categoryOptions(): SelectOption<LostFoundCategory | "">[] {
  return [
    { value: "", label: "All categories" },
    ...LOST_FOUND_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] })),
  ];
}

/* --------------------------------------------------------------------- drafts */

type ItemDraft = {
  description: string;
  category: LostFoundCategory;
  roomId: string;
  storageLocation: string;
  notes: string;
};

function newItemDraft(): ItemDraft {
  return { description: "", category: "OTHER", roomId: "", storageLocation: "", notes: "" };
}

function validateItemDraft(draft: ItemDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (draft.description.trim() === "") errors.description = "A description is required.";
  return errors;
}

/* --------------------------------------------------------------------- screen */

const NO_BACKEND_COPY =
  "This build has no backend configured, so it cannot read or save lost and found items.";

export default function LostFoundPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const storeError = useContextStore((s) => s.error);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const scope = useMemo(
    () => lostFoundScopeFor(context),
    [context.organizationId, context.propertyId],
  );

  const canView = can("lost_found.view", permissions);
  const canCreate = can("lost_found.create", permissions);
  const canReturn = can("lost_found.return", permissions);

  const [items, setItems] = useState<LostFoundItem[] | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [statusFilter, setStatusFilter] = useState<LostFoundStatus | "">("");
  const [categoryFilter, setCategoryFilter] = useState<LostFoundCategory | "">("");
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [creating, setCreating] = useState(false);
  const [returning, setReturning] = useState<LostFoundItem | null>(null);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || scope === null || !canView) return;
    let ignore = false;
    setItems(null);
    setListError(null);
    const filters: Record<string, string> = {};
    if (statusFilter) filters.status = statusFilter;
    if (categoryFilter) filters.category = categoryFilter;
    Promise.all([
      listLostFoundItems(scope, filters),
      listRooms(scope, {}),
    ])
      .then(([itemsList, roomsList]) => {
        if (ignore) return;
        setItems(itemsList);
        setRooms(roomsList);
      })
      .catch((error) => {
        if (!ignore) setListError(toPublicError(error).message);
      });
    return () => {
      ignore = true;
    };
  }, [view, scope, canView, statusFilter, categoryFilter, reloadTick]);

  const reload = useCallback(() => setReloadTick((tick) => tick + 1), []);
  const report = useCallback(
    (error: unknown) => setActionError(toPublicError(error).message),
    [],
  );

  const roomById = useMemo(() => {
    const map = new Map<string, Room>();
    for (const r of rooms) map.set(r.id, r);
    return map;
  }, [rooms]);

  const roomOptions = useMemo<SelectOption<string>[]>(
    () => [
      { value: "", label: "No specific room" },
      ...rooms
        .filter((r) => r.archivedAt == null)
        .map((r) => ({ value: r.id, label: `Room ${r.roomNumber}` })),
    ],
    [rooms],
  );

  const doReturn = async () => {
    if (returning === null || scope === null) return;
    try {
      await returnLostFoundItem(scope, returning.id, returning.version);
      setReturning(null);
      setActionError(null);
      reload();
    } catch (error) {
      report(error);
    }
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          <Package className="size-5 shrink-0 text-brand-600" aria-hidden />
          Lost & Found
        </h2>
        <p className="mt-1 text-sm text-muted">
          Items found on the property, tracked until they are returned to their owner.
        </p>
      </header>

      {view === "bootstrapping" && <LoadingBlock label="Loading your workspace…" />}

      {view === "unconfigured" && (
        <EmptyState
          icon={<AlertCircle aria-hidden />}
          title="Backend not configured"
          description={storeError ?? NO_BACKEND_COPY}
        />
      )}

      {view === "unauthenticated" && (
        <EmptyState
          icon={<LogIn aria-hidden />}
          title="Sign in to manage lost & found"
          description="There is no active session for this build to read a tenant from."
        />
      )}

      {view === "no_property" && (
        <EmptyState
          icon={<Package aria-hidden />}
          title="Choose a property first"
          description="Lost and found items live inside one property. Pick a property and this screen will show its items."
        />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied capability="view lost and found items" permission="lost_found.view" />
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
                {canCreate && (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Plus className="size-4" aria-hidden />}
                    onClick={() => setCreating(true)}
                  >
                    Log item
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={reload}>
                  Reload
                </Button>
              </div>
            }
          >
            <div className="flex flex-wrap items-center gap-3">
              <SelectInput
                value={statusFilter}
                options={statusOptions()}
                onChange={(value) => setStatusFilter(value as LostFoundStatus | "")}
                className="w-40"
              />
              <SelectInput
                value={categoryFilter}
                options={categoryOptions()}
                onChange={(value) => setCategoryFilter(value as LostFoundCategory | "")}
                className="w-40"
              />
              <p className="text-xs text-muted">
                {items === null ? "Loading…" : `${items.length} item${items.length === 1 ? "" : "s"}`}
              </p>
            </div>
          </Card>

          {items === null ? (
            <LoadingBlock label="Reading items…" />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Package aria-hidden />}
              title="No lost and found items"
              description="Items found on the property are logged here until returned to their owner."
              action={
                canCreate ? (
                  <Button
                    icon={<Plus className="size-4" aria-hidden />}
                    onClick={() => setCreating(true)}
                  >
                    Log an item
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              {items.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  room={item.roomId ? roomById.get(item.roomId) ?? null : null}
                  canReturn={canReturn}
                  onReturn={() => setReturning(item)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {creating && scope !== null && (
        <CreateItemSheet
          scope={scope}
          roomOptions={roomOptions}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            setActionError(null);
            reload();
          }}
          onFailure={report}
        />
      )}

      {returning !== null && (
        <Dialog
          open
          onClose={() => setReturning(null)}
          title="Return item"
          description="Mark this item as returned to its owner."
          footer={
            <>
              <Button variant="ghost" onClick={() => setReturning(null)}>
                Cancel
              </Button>
              <Button onClick={() => void doReturn()}>Confirm return</Button>
            </>
          }
        >
          <p className="text-sm text-muted">
            {returning.description}
          </p>
        </Dialog>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- pieces */

type ItemCardProps = {
  item: LostFoundItem;
  room: Room | null;
  canReturn: boolean;
  onReturn: () => void;
};

function ItemCard({ item, room, canReturn, onReturn }: ItemCardProps) {
  const isTerminal = item.status === "RETURNED" || item.status === "DISPOSED";

  return (
    <Card padded={false} className={isTerminal ? "opacity-75" : undefined}>
      <div className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
              {item.description}
              <StatusPill status={item.status} />
            </h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
              <Badge tone="neutral">{CATEGORY_LABELS[item.category]}</Badge>
              {room && (
                <>
                  {" · "}Found in Room {room.roomNumber}
                </>
              )}
              {item.storageLocation && (
                <>
                  {" · "}Stored at: {item.storageLocation}
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {!isTerminal && canReturn && (
              <Button
                size="sm"
                variant="secondary"
                icon={<RotateCcw className="size-4" aria-hidden />}
                onClick={onReturn}
              >
                Return
              </Button>
            )}
          </div>
        </div>

        {item.notes && <p className="text-sm text-muted">{item.notes}</p>}

        <div className="flex flex-wrap gap-4 text-xs text-muted">
          <span>Found {new Date(item.foundAt).toLocaleString()}</span>
          {item.returnedAt && (
            <span>Returned {new Date(item.returnedAt).toLocaleString()}</span>
          )}
          {item.returnedTo && <span>Returned to: {item.returnedTo}</span>}
        </div>
      </div>
    </Card>
  );
}

/* --------------------------------------------------------------------- sheet */

type CreateItemSheetProps = {
  scope: { organizationId: string; propertyId: string };
  roomOptions: SelectOption<string>[];
  onClose: () => void;
  onSaved: () => void;
  onFailure: (error: unknown) => void;
};

function CreateItemSheet({ scope, roomOptions, onClose, onSaved, onFailure }: CreateItemSheetProps) {
  const [draft, setDraft] = useState<ItemDraft>(newItemDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const run = async () => {
    const found = validateItemDraft(draft);
    setErrors(found);
    if (Object.keys(found).length > 0 || busy) return;
    setBusy(true);
    try {
      await createLostFoundItem(scope, {
        description: draft.description.trim(),
        category: draft.category,
        roomId: draft.roomId || null,
        storageLocation: draft.storageLocation.trim() || null,
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
      title="Log found item"
      description="Record an item that was found on the property."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void run()} disabled={busy}>
            {busy ? "Logging…" : "Log item"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Description" error={errors.description} required>
          <Textarea
            value={draft.description}
            onChange={(event) => setDraft((d) => ({ ...d, description: event.target.value }))}
            placeholder="Describe the item found…"
            rows={3}
          />
        </Field>
        <Field label="Category">
          <SelectInput
            value={draft.category}
            options={LOST_FOUND_CATEGORIES.map((v) => ({
              value: v,
              label: CATEGORY_LABELS[v],
            }))}
            onChange={(value) =>
              setDraft((d) => ({ ...d, category: value as LostFoundCategory }))
            }
          />
        </Field>
        <Field label="Room found in (optional)">
          <SelectInput
            value={draft.roomId}
            options={roomOptions}
            onChange={(value) => setDraft((d) => ({ ...d, roomId: value }))}
          />
        </Field>
        <Field label="Storage location">
          <TextInput
            value={draft.storageLocation}
            onChange={(event) => setDraft((d) => ({ ...d, storageLocation: event.target.value }))}
            placeholder="e.g. Front desk safe, Manager's office"
          />
        </Field>
        <Field label="Notes (optional)">
          <Textarea
            value={draft.notes}
            onChange={(event) => setDraft((d) => ({ ...d, notes: event.target.value }))}
            placeholder="Any additional details…"
            rows={2}
          />
        </Field>
      </div>
    </Dialog>
  );
}
