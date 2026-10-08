/**
 * Kitchen station management — create, edit, archive stations for the ACTIVE OUTLET.
 *
 * Stations are the physical work areas a KOT routes to (Main Kitchen, Tandoor, Bar, etc.).
 * Each menu item maps to one station; one order produces one KOT per station with lines.
 *
 * Gated on `station.manage`. The list is a direct SELECT under RLS; mutations go through
 * the three 020 doors (create, update, archive).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  LogIn,
  Plus,
  Store,
  X,
} from "lucide-react";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { LoadingBlock } from "@/components/ui/Spinner";
import { StatusPill } from "@/components/ui/StatusPill";
import { TextInput } from "@/components/ui/TextInput";
import { Textarea } from "@/components/ui/Textarea";
import { can, type ActiveContext } from "@/domain/identity/types";
import {
  archiveStation,
  createStation,
  listStations,
  updateStation,
  type CreateStation,
  type UpdateStation,
} from "@/domain/restaurant/operations-service";
import type { KitchenStation } from "@/domain/restaurant/types";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

const NO_BACKEND_COPY = "This build has no backend configured.";

export type StationsPageView = "bootstrapping" | "unconfigured" | "unauthenticated" | "no_outlet" | "scoped";

export function pageStatusFor(status: ContextStatus, context: ActiveContext): StationsPageView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.outletId !== null ? "scoped" : "no_outlet";
  }
  return "bootstrapping";
}

type StationForm = { name: string; code: string; description: string };
const EMPTY_FORM: StationForm = { name: "", code: "", description: "" };

function validateForm(form: StationForm): string | null {
  if (form.name.trim() === "") return "Name is required.";
  if (form.code.trim() === "") return "Code is required.";
  return null;
}

export default function StationsPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const storeError = useContextStore((s) => s.error);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const outletId = useMemo(() => context.outletId, [context.outletId]);
  const canManage = can("station.manage", permissions);

  const [stations, setStations] = useState<KitchenStation[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<KitchenStation | null>(null);
  const [form, setForm] = useState<StationForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const [archiveTarget, setArchiveTarget] = useState<KitchenStation | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  const load = useCallback(async () => {
    if (outletId === null) return;
    setLoading(true);
    setError(null);
    try {
      setStations(await listStations(outletId));
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setLoading(false);
    }
  }, [outletId]);

  useEffect(() => {
    if (view === "scoped" && outletId !== null) {
      void load();
    }
  }, [view, outletId, load]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setActionError(null);
    setDialogOpen(true);
  };

  const openEdit = (station: KitchenStation) => {
    setEditing(station);
    setForm({ name: station.name, code: station.code, description: station.description ?? "" });
    setActionError(null);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (busy) return;
    setDialogOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setActionError(null);
  };

  const handleSave = async () => {
    if (outletId === null || !canManage) return;
    const validationError = validateForm(form);
    if (validationError !== null) {
      setActionError(validationError);
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      if (editing !== null) {
        const payload: UpdateStation = {
          stationId: editing.id,
          name: form.name.trim(),
          code: form.code.trim(),
          description: form.description.trim() || undefined,
          expectedVersion: editing.version,
        };
        await updateStation(payload);
      } else {
        const payload: CreateStation = {
          outletId,
          name: form.name.trim(),
          code: form.code.trim(),
          description: form.description.trim() || undefined,
        };
        await createStation(payload);
      }
      setDialogOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setActionError(toPublicError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async () => {
    if (archiveTarget === null || !canManage) return;
    setArchiveBusy(true);
    setActionError(null);
    try {
      await archiveStation(archiveTarget.id);
      setArchiveTarget(null);
      await load();
    } catch (err) {
      setActionError(toPublicError(err).message);
    } finally {
      setArchiveBusy(false);
    }
  };

  const columns = useMemo<DataColumn<KitchenStation>[]>(() => [
    { key: "name", header: "Name", render: (s) => s.name },
    { key: "code", header: "Code", render: (s) => <span className="font-mono text-sm">{s.code}</span> },
    { key: "description", header: "Description", render: (s) => s.description ?? "—" },
    { key: "order", header: "Order", render: (s) => s.displayOrder, align: "right" },
    { key: "status", header: "Status", render: (s) => <StatusPill status={s.status} /> },
    {
      key: "actions",
      header: "",
      render: (s) => (
        <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>
          Edit
        </Button>
      ),
      align: "right",
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], []);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
            <Store className="size-5 shrink-0 text-brand-600" aria-hidden />
            Kitchen Stations
          </h2>
          <p className="mt-1 text-sm text-muted">
            Physical work areas that KOTs route to. Each menu item maps to one station.
          </p>
        </div>
        {view === "scoped" && canManage && (
          <Button variant="primary" onClick={openCreate}>
            <Plus className="size-4" aria-hidden />
            New station
          </Button>
        )}
      </header>

      {view === "bootstrapping" && <LoadingBlock label="Loading your workspace…" />}

      {view === "unconfigured" && (
        <EmptyState icon={<X className="size-6" aria-hidden />} title="Backend not configured" description={storeError ?? NO_BACKEND_COPY} />
      )}

      {view === "unauthenticated" && (
        <EmptyState icon={<LogIn className="size-6" aria-hidden />} title="Sign in to manage stations" description="There is no active session." />
      )}

      {view === "no_outlet" && (
        <EmptyState icon={<Store className="size-6" aria-hidden />} title="Choose an outlet first" description="Select an outlet to manage its kitchen stations." />
      )}

      {view === "scoped" && outletId !== null && (
        <>
          {!canManage && <AccessDenied capability="station.manage" />}

          {error !== null && (
            <p role="alert" className="rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}
          {actionError !== null && !dialogOpen && (
            <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger">
              <span>{actionError}</span>
              <Button size="sm" variant="ghost" onClick={() => setActionError(null)}>Dismiss</Button>
            </div>
          )}

          {loading ? (
            <LoadingBlock label="Loading stations…" rows={4} />
          ) : stations === null || stations.length === 0 ? (
            <EmptyState
              icon={<Store className="size-6" aria-hidden />}
              title="No stations yet"
              description="Create kitchen stations to route KOTs to."
              action={canManage ? <Button variant="primary" onClick={openCreate}><Plus className="size-4" aria-hidden />New station</Button> : undefined}
            />
          ) : (
            <Card>
              <DataTable<KitchenStation>
                columns={columns}
                rows={stations}
                rowKey={(s) => s.id}
              />
            </Card>
          )}
        </>
      )}

      {canManage && (
        <Dialog
          open={dialogOpen}
          onClose={closeDialog}
          title={editing !== null ? "Edit station" : "New station"}
          description={editing !== null ? "Update this station's details." : "Create a new kitchen station for this outlet."}
        >
          <div className="flex flex-col gap-4">
            {actionError !== null && (
              <p role="alert" className="rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger">
                {actionError}
              </p>
            )}
            <Field id="station-name" label="Name" required>
              <TextInput
                id="station-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Main Kitchen"
              />
            </Field>
            <Field id="station-code" label="Code" required hint="Short unique code (e.g. MAIN, TANDOOR, BAR).">
              <TextInput
                id="station-code"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="e.g. MAIN"
              />
            </Field>
            <Field id="station-desc" label="Description">
              <Textarea
                id="station-desc"
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional description of what this station handles."
              />
            </Field>
            <div className="flex items-center justify-between gap-3 pt-2">
              {editing !== null ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setDialogOpen(false);
                    setArchiveTarget(editing);
                  }}
                >
                  <Archive className="size-4" aria-hidden />
                  Archive
                </Button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={closeDialog} disabled={busy}>Cancel</Button>
                <Button variant="primary" onClick={() => void handleSave()} disabled={busy}>
                  {busy ? "Saving…" : editing !== null ? "Save changes" : "Create station"}
                </Button>
              </div>
            </div>
          </div>
        </Dialog>
      )}

      {canManage && (
        <Dialog
          open={archiveTarget !== null}
          onClose={() => !archiveBusy && setArchiveTarget(null)}
          title="Archive station"
          description={archiveTarget !== null ? `Archive "${archiveTarget.name}"? It will no longer accept new KOTs.` : ""}
        >
          {actionError !== null && (
            <p role="alert" className="mb-3 rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger">
              {actionError}
            </p>
          )}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setArchiveTarget(null)} disabled={archiveBusy}>Cancel</Button>
            <Button variant="danger" onClick={() => void handleArchive()} disabled={archiveBusy}>
              {archiveBusy ? "Archiving…" : "Archive"}
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
