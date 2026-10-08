/**
 * Assets — the property's physical assets: ACs, TVs, furniture, equipment.
 *
 * Each asset has a code, name, category, location and status. Assets can be
 * linked to a room or outlet. The screen supports creating new assets and
 * updating mutable fields (name, category, room, location, status, notes).
 *
 * The screen reads organization + property from the context store.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, LogIn, Package, Pencil, Plus } from "lucide-react";
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
  ASSET_CATEGORIES,
  ASSET_STATUSES,
  type Asset,
  type AssetCategory,
  type AssetStatus,
} from "@/domain/hotel/types";
import {
  createAsset,
  listAssets,
  updateAsset,
} from "@/domain/hotel/asset-service";
import { listRooms } from "@/domain/hotel/room-service";
import { type Room } from "@/domain/hotel/types";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

/* --------------------------------------------------------------------- scope */

export type AssetsPageView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_property"
  | "scoped";

export function pageStatusFor(status: ContextStatus, context: ActiveContext): AssetsPageView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null && context.propertyId !== null
      ? "scoped"
      : "no_property";
  }
  return "bootstrapping";
}

export function assetsScopeFor(context: ActiveContext): {
  organizationId: string;
  propertyId: string;
} | null {
  if (context.organizationId === null || context.propertyId === null) return null;
  return { organizationId: context.organizationId, propertyId: context.propertyId };
}

/* --------------------------------------------------------------------- helpers */

const CATEGORY_LABELS: Record<AssetCategory, string> = {
  AC: "AC",
  TV: "TV",
  REFRIGERATOR: "Refrigerator",
  WASHING_MACHINE: "Washing machine",
  ELEVATOR: "Elevator",
  BOILER: "Boiler",
  GENERATOR: "Generator",
  KITCHEN_EQUIPMENT: "Kitchen equipment",
  FURNITURE: "Furniture",
  IT_EQUIPMENT: "IT equipment",
  OTHER: "Other",
};

const STATUS_LABELS: Record<AssetStatus, string> = {
  ACTIVE: "Active",
  MAINTENANCE: "Maintenance",
  RETIRED: "Retired",
  SOLD: "Sold",
};

function categoryOptions(): SelectOption<AssetCategory | "">[] {
  return [
    { value: "", label: "All categories" },
    ...ASSET_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] })),
  ];
}

function statusOptions(): SelectOption<AssetStatus | "">[] {
  return [
    { value: "", label: "All statuses" },
    ...ASSET_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] })),
  ];
}

/* --------------------------------------------------------------------- drafts */

type AssetDraft = {
  assetCode: string;
  name: string;
  category: AssetCategory;
  roomId: string;
  locationDescription: string;
  serialNumber: string;
  manufacturer: string;
  modelNumber: string;
  purchaseDate: string;
  purchaseCost: string;
  warrantyEndDate: string;
  notes: string;
};

function newAssetDraft(): AssetDraft {
  return {
    assetCode: "",
    name: "",
    category: "OTHER",
    roomId: "",
    locationDescription: "",
    serialNumber: "",
    manufacturer: "",
    modelNumber: "",
    purchaseDate: "",
    purchaseCost: "",
    warrantyEndDate: "",
    notes: "",
  };
}

function draftFromAsset(asset: Asset): AssetDraft {
  return {
    assetCode: asset.assetCode,
    name: asset.name,
    category: asset.category,
    roomId: asset.roomId ?? "",
    locationDescription: asset.locationDescription ?? "",
    serialNumber: asset.serialNumber ?? "",
    manufacturer: asset.manufacturer ?? "",
    modelNumber: asset.modelNumber ?? "",
    purchaseDate: asset.purchaseDate ? asset.purchaseDate.slice(0, 10) : "",
    purchaseCost: asset.purchaseCost != null ? String(asset.purchaseCost) : "",
    warrantyEndDate: asset.warrantyEndDate ? asset.warrantyEndDate.slice(0, 10) : "",
    notes: asset.notes ?? "",
  };
}

function validateAssetDraft(draft: AssetDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (draft.assetCode.trim() === "") errors.assetCode = "An asset code is required.";
  if (draft.name.trim() === "") errors.name = "A name is required.";
  return errors;
}

/* --------------------------------------------------------------------- screen */

const NO_BACKEND_COPY =
  "This build has no backend configured, so it cannot read or save assets.";

type SheetMode = { kind: "new" } | { kind: "edit"; asset: Asset };

export default function AssetsPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const storeError = useContextStore((s) => s.error);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const scope = useMemo(
    () => assetsScopeFor(context),
    [context.organizationId, context.propertyId],
  );

  const canView = can("asset.view", permissions);
  const canCreate = can("asset.create", permissions);
  const canEdit = can("asset.edit", permissions);

  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<AssetCategory | "">("");
  const [statusFilter, setStatusFilter] = useState<AssetStatus | "">("");
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [sheet, setSheet] = useState<SheetMode | null>(null);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || scope === null || !canView) return;
    let ignore = false;
    setAssets(null);
    setListError(null);
    const filters: Record<string, string> = {};
    if (categoryFilter) filters.category = categoryFilter;
    if (statusFilter) filters.status = statusFilter;
    Promise.all([
      listAssets(scope, filters),
      listRooms(scope, {}),
    ])
      .then(([assetsList, roomsList]) => {
        if (ignore) return;
        setAssets(assetsList);
        setRooms(roomsList);
      })
      .catch((error) => {
        if (!ignore) setListError(toPublicError(error).message);
      });
    return () => {
      ignore = true;
    };
  }, [view, scope, canView, categoryFilter, statusFilter, reloadTick]);

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
        .filter((r) => r.status !== "ARCHIVED")
        .map((r) => ({ value: r.id, label: `Room ${r.roomNumber}` })),
    ],
    [rooms],
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          <Package className="size-5 shrink-0 text-brand-600" aria-hidden />
          Assets
        </h2>
        <p className="mt-1 text-sm text-muted">
          Physical assets across the property: ACs, TVs, furniture, kitchen equipment and more.
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
          title="Sign in to manage assets"
          description="There is no active session for this build to read a tenant from."
        />
      )}

      {view === "no_property" && (
        <EmptyState
          icon={<Package aria-hidden />}
          title="Choose a property first"
          description="Assets live inside one property. Pick a property and this screen will show its assets."
        />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied capability="view assets" permission="asset.view" />
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
                    onClick={() => setSheet({ kind: "new" })}
                  >
                    New asset
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
                value={categoryFilter}
                options={categoryOptions()}
                onChange={(value) => setCategoryFilter(value as AssetCategory | "")}
                className="w-40"
              />
              <SelectInput
                value={statusFilter}
                options={statusOptions()}
                onChange={(value) => setStatusFilter(value as AssetStatus | "")}
                className="w-40"
              />
              <p className="text-xs text-muted">
                {assets === null
                  ? "Loading…"
                  : `${assets.length} asset${assets.length === 1 ? "" : "s"}`}
              </p>
            </div>
          </Card>

          {assets === null ? (
            <LoadingBlock label="Reading assets…" />
          ) : assets.length === 0 ? (
            <EmptyState
              icon={<Package aria-hidden />}
              title="No assets yet"
              description="Register the property's physical assets — ACs, TVs, furniture, equipment."
              action={
                canCreate ? (
                  <Button
                    icon={<Plus className="size-4" aria-hidden />}
                    onClick={() => setSheet({ kind: "new" })}
                  >
                    Add the first asset
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              {assets.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  room={asset.roomId ? roomById.get(asset.roomId) ?? null : null}
                  canEdit={canEdit}
                  onEdit={() => setSheet({ kind: "edit", asset })}
                />
              ))}
            </div>
          )}
        </>
      )}

      {sheet !== null && scope !== null && (
        <AssetSheet
          mode={sheet}
          scope={scope}
          roomOptions={roomOptions}
          onClose={() => setSheet(null)}
          onSaved={() => {
            setSheet(null);
            setActionError(null);
            reload();
          }}
          onFailure={report}
        />
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- pieces */

type AssetCardProps = {
  asset: Asset;
  room: Room | null;
  canEdit: boolean;
  onEdit: () => void;
};

function AssetCard({ asset, room, canEdit, onEdit }: AssetCardProps) {
  return (
    <Card padded={false}>
      <div className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
              {asset.name}
              <StatusPill status={asset.status} />
            </h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
              <Badge tone="neutral">{asset.assetCode}</Badge>
              <Badge tone="neutral">{CATEGORY_LABELS[asset.category]}</Badge>
              {room && (
                <>
                  {" · "}Room {room.roomNumber}
                </>
              )}
              {asset.locationDescription && (
                <>
                  {" · "}{asset.locationDescription}
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {canEdit && (
              <Button
                size="sm"
                variant="secondary"
                icon={<Pencil className="size-4" aria-hidden />}
                onClick={onEdit}
              >
                Edit
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-4 text-xs text-muted">
          {asset.manufacturer && <span>{asset.manufacturer}</span>}
          {asset.modelNumber && <span>Model: {asset.modelNumber}</span>}
          {asset.serialNumber && <span>S/N: {asset.serialNumber}</span>}
          {asset.warrantyEndDate && (
            <span>Warranty until {new Date(asset.warrantyEndDate).toLocaleDateString()}</span>
          )}
        </div>

        {asset.notes && <p className="text-sm text-muted">{asset.notes}</p>}
      </div>
    </Card>
  );
}

/* --------------------------------------------------------------------- sheet */

type AssetSheetProps = {
  mode: SheetMode;
  scope: { organizationId: string; propertyId: string };
  roomOptions: SelectOption<string>[];
  onClose: () => void;
  onSaved: () => void;
  onFailure: (error: unknown) => void;
};

function AssetSheet({ mode, scope, roomOptions, onClose, onSaved, onFailure }: AssetSheetProps) {
  const editing = mode.kind === "edit" ? mode.asset : null;
  const [draft, setDraft] = useState<AssetDraft>(() =>
    editing === null ? newAssetDraft() : draftFromAsset(editing),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const run = async () => {
    const found = validateAssetDraft(draft);
    setErrors(found);
    if (Object.keys(found).length > 0 || busy) return;
    setBusy(true);
    try {
      if (editing === null) {
        await createAsset(scope, {
          assetCode: draft.assetCode.trim(),
          name: draft.name.trim(),
          category: draft.category,
          roomId: draft.roomId || null,
          locationDescription: draft.locationDescription.trim() || null,
          serialNumber: draft.serialNumber.trim() || null,
          manufacturer: draft.manufacturer.trim() || null,
          modelNumber: draft.modelNumber.trim() || null,
          purchaseDate: draft.purchaseDate || null,
          purchaseCost: draft.purchaseCost.trim() ? Number(draft.purchaseCost.trim()) : null,
          warrantyEndDate: draft.warrantyEndDate || null,
          notes: draft.notes.trim() || null,
        });
      } else {
        const input: Record<string, unknown> = { expectedVersion: editing.version };
        if (draft.name.trim() !== editing.name) input.name = draft.name.trim();
        if (draft.category !== editing.category) input.category = draft.category;
        if ((draft.roomId || null) !== (editing.roomId ?? "")) input.roomId = draft.roomId || null;
        if (draft.locationDescription.trim() !== (editing.locationDescription ?? ""))
          input.locationDescription = draft.locationDescription.trim() || null;
        if (draft.notes.trim() !== (editing.notes ?? ""))
          input.notes = draft.notes.trim() || null;
        if (Object.keys(input).length === 1) {
          onSaved();
          return;
        }
        await updateAsset(scope, editing.id, input as Parameters<typeof updateAsset>[2]);
      }
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
      title={editing === null ? "New asset" : `Edit ${editing.name}`}
      description={editing === null ? "Register a new physical asset." : "Update asset details."}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void run()} disabled={busy}>
            {busy ? "Saving…" : editing === null ? "Create asset" : "Save changes"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Asset code" required error={errors.assetCode}>
          <TextInput
            value={draft.assetCode}
            onChange={(event) => setDraft((d) => ({ ...d, assetCode: event.target.value }))}
            placeholder="e.g. AC-101, TV-203"
            disabled={editing !== null}
          />
        </Field>
        <Field label="Name" required error={errors.name}>
          <TextInput
            value={draft.name}
            onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value }))}
            placeholder="e.g. Split AC 1.5 ton"
          />
        </Field>
        <Field label="Category">
          <SelectInput
            value={draft.category}
            options={ASSET_CATEGORIES.map((v) => ({ value: v, label: CATEGORY_LABELS[v] }))}
            onChange={(value) => setDraft((d) => ({ ...d, category: value as AssetCategory }))}
          />
        </Field>
        <Field label="Room (optional)">
          <SelectInput
            value={draft.roomId}
            options={roomOptions}
            onChange={(value) => setDraft((d) => ({ ...d, roomId: value }))}
          />
        </Field>
        <Field label="Location description">
          <TextInput
            value={draft.locationDescription}
            onChange={(event) => setDraft((d) => ({ ...d, locationDescription: event.target.value }))}
            placeholder="e.g. Second floor corridor, Main lobby"
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Serial number">
            <TextInput
              value={draft.serialNumber}
              onChange={(event) => setDraft((d) => ({ ...d, serialNumber: event.target.value }))}
            />
          </Field>
          <Field label="Manufacturer">
            <TextInput
              value={draft.manufacturer}
              onChange={(event) => setDraft((d) => ({ ...d, manufacturer: event.target.value }))}
            />
          </Field>
        </div>
        <Field label="Model number">
          <TextInput
            value={draft.modelNumber}
            onChange={(event) => setDraft((d) => ({ ...d, modelNumber: event.target.value }))}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Purchase date">
            <TextInput
              value={draft.purchaseDate}
              onChange={(event) => setDraft((d) => ({ ...d, purchaseDate: event.target.value }))}
              type="date"
            />
          </Field>
          <Field label="Purchase cost">
            <TextInput
              value={draft.purchaseCost}
              onChange={(event) => setDraft((d) => ({ ...d, purchaseCost: event.target.value }))}
              placeholder="0.00"
              type="number"
            />
          </Field>
        </div>
        <Field label="Warranty end date">
          <TextInput
            value={draft.warrantyEndDate}
            onChange={(event) => setDraft((d) => ({ ...d, warrantyEndDate: event.target.value }))}
            type="date"
          />
        </Field>
        <Field label="Notes">
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
