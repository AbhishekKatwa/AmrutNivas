/**
 * Shifts — shift master definitions for the property.
 *
 * Lists all shift definitions with create/edit capability.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CircleSlash,
  Clock,
  LogIn,
  Plus,
} from "lucide-react";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { LoadingBlock } from "@/components/ui/Spinner";
import { TextInput } from "@/components/ui/TextInput";
import { Textarea } from "@/components/ui/Textarea";
import { can, type ActiveContext } from "@/domain/identity/types";
import { listShifts, createShift, updateShift } from "@/domain/hr/shift-service";
import type { HRScope, Shift } from "@/domain/hr/types";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

export type ShiftsView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_organization"
  | "scoped";

export function pageStatusFor(status: ContextStatus, context: ActiveContext): ShiftsView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null && context.propertyId !== null
      ? "scoped"
      : "no_organization";
  }
  return "bootstrapping";
}

const NO_BACKEND_COPY = "This build has no backend configured, so it cannot read shifts.";

export default function ShiftsPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const storeError = useContextStore((s) => s.error);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const scope = useMemo<HRScope | null>(
    () =>
      context.organizationId !== null && context.propertyId !== null
        ? { organizationId: context.organizationId, propertyId: context.propertyId }
        : null,
    [context.organizationId, context.propertyId],
  );

  const canView = can("hr.shift.view", permissions);
  const canManage = can("hr.shift.manage", permissions);

  const [shifts, setShifts] = useState<Shift[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);

  const reload = useCallback(() => setReloadTick((tick) => tick + 1), []);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || scope === null || !canView) return;
    let ignore = false;
    setShifts(null);
    setListError(null);

    listShifts(scope)
      .then((rows) => {
        if (ignore) return;
        setShifts(rows);
      })
      .catch((error) => {
        if (!ignore) setListError(toPublicError(error).message);
      });
    return () => {
      ignore = true;
    };
  }, [view, scope, canView, reloadTick]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          <Clock className="size-5 shrink-0 text-brand-600" aria-hidden />
          Shifts
        </h2>
        <p className="mt-1 text-sm text-muted">
          Shift definitions for this property. Create and manage shift timings.
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
          title="Sign in to view shifts"
          description="There is no active session for this build to read a tenant from."
        />
      )}

      {view === "no_organization" && (
        <EmptyState
          icon={<Clock aria-hidden />}
          title="Choose an organization and property first"
          description="Shifts belong to a property. Pick one and this screen will show its shift definitions."
        />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied capability="view shifts" permission="hr.shift.view" />
      )}

      {view === "scoped" && scope !== null && canView && (
        <>
          {listError !== null && (
            <p role="alert" className="rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger">
              {listError}
            </p>
          )}

          {shifts === null ? (
            <LoadingBlock label="Reading shifts…" />
          ) : shifts.length === 0 ? (
            <EmptyState
              icon={<Clock aria-hidden />}
              title="No shifts defined"
              description="This property has no shift definitions. Create one to start scheduling."
              action={
                canManage ? (
                  <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setShowCreateDialog(true)}>
                    Create shift
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <Card
              actions={
                canManage ? (
                  <Button
                    size="sm"
                    icon={<Plus className="size-4" aria-hidden />}
                    onClick={() => setShowCreateDialog(true)}
                  >
                    New shift
                  </Button>
                ) : undefined
              }
            >
              <div className="flex flex-col gap-3">
                {shifts.map((shift) => (
                  <div key={shift.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-4">
                    <div>
                      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                        {shift.name}
                        <Badge tone={shift.isActive ? "brand" : "muted"}>
                          {shift.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </h3>
                      <p className="mt-1 text-xs text-muted">
                        {shift.startTime} – {shift.endTime}
                        {shift.breakMinutes > 0 && ` · ${shift.breakMinutes} min break`}
                        {shift.code && ` · ${shift.code}`}
                      </p>
                      {shift.description && (
                        <p className="mt-1 text-xs text-muted">{shift.description}</p>
                      )}
                    </div>
                    {canManage && (
                      <Button size="sm" variant="ghost" onClick={() => setEditingShift(shift)}>
                        Edit
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {showCreateDialog && scope !== null && (
        <ShiftDialog
          scope={scope}
          onClose={() => setShowCreateDialog(false)}
          onDone={() => {
            setShowCreateDialog(false);
            reload();
          }}
        />
      )}

      {editingShift && scope !== null && (
        <ShiftDialog
          scope={scope}
          existing={editingShift}
          onClose={() => setEditingShift(null)}
          onDone={() => {
            setEditingShift(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function ShiftDialog({
  scope,
  existing,
  onClose,
  onDone,
}: {
  scope: HRScope;
  existing?: Shift;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [code, setCode] = useState(existing?.code ?? "");
  const [startTime, setStartTime] = useState(existing?.startTime ?? "09:00");
  const [endTime, setEndTime] = useState(existing?.endTime ?? "17:00");
  const [breakMinutes, setBreakMinutes] = useState(String(existing?.breakMinutes ?? 0));
  const [description, setDescription] = useState(existing?.description ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!existing;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Shift name is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (isEdit && existing) {
        await updateShift(existing.id, {
          name: name.trim(),
          code: code.trim() || undefined,
          startTime,
          endTime,
          breakMinutes: parseInt(breakMinutes) || 0,
          description: description.trim() || undefined,
        });
      } else {
        await createShift(scope, {
          name: name.trim(),
          code: code.trim() || null,
          startTime,
          endTime,
          breakMinutes: parseInt(breakMinutes) || 0,
          description: description.trim() || null,
        });
      }
      onDone();
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={isEdit ? "Edit shift" : "New shift"}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Shift name" required>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Code">
          <TextInput value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Start time" required>
            <TextInput type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
          </Field>
          <Field label="End time" required>
            <TextInput type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
          </Field>
        </div>
        <Field label="Break (minutes)">
          <TextInput type="number" value={breakMinutes} onChange={(e) => setBreakMinutes(e.target.value)} />
        </Field>
        <Field label="Description">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </Field>
        {error && (
          <p role="alert" className="rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : isEdit ? "Save changes" : "Create shift"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
