/**
 * Guests — people who may stay at the property.
 *
 * PII is protected: document numbers never appear in audit logs. The screen lists guests for the
 * organization (guests are org-scoped, not property-scoped). Search is the primary affordance —
 * front desk staff look up guests by name or phone, not by scrolling a long list.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, CircleSlash, LogIn, Pencil, Plus, Search, User } from "lucide-react";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { ArchiveDialog } from "@/components/ui/ArchiveDialog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { LoadingBlock } from "@/components/ui/Spinner";
import { SelectInput } from "@/components/ui/SelectInput";
import { StatusPill } from "@/components/ui/StatusPill";
import { Switch } from "@/components/ui/Switch";
import { TextInput } from "@/components/ui/TextInput";
import { Textarea } from "@/components/ui/Textarea";
import { can, type ActiveContext } from "@/domain/identity/types";
import type { Guest, Gender, VipStatus, GuestSource } from "@/domain/hotel/types";
import { GENDERS, VIP_STATUSES, GUEST_SOURCES } from "@/domain/hotel/types";
import {
  archiveGuest,
  createGuest,
  listGuests,
  searchGuests,
  updateGuest,
} from "@/domain/hotel/guest-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

/* --------------------------------------------------------------------- scope */

export type GuestsPageView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_organization"
  | "scoped";

export function pageStatusFor(status: ContextStatus, context: ActiveContext): GuestsPageView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null ? "scoped" : "no_organization";
  }
  return "bootstrapping";
}

/* --------------------------------------------------------------------- drafts */

type GuestDraft = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  nationality: string;
  gender: Gender | "";
  vipStatus: VipStatus;
  source: GuestSource | "";
  notes: string;
};

function newDraft(): GuestDraft {
  return {
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    nationality: "",
    gender: "",
    vipStatus: "REGULAR",
    source: "",
    notes: "",
  };
}

function draftFrom(guest: Guest): GuestDraft {
  return {
    firstName: guest.firstName,
    lastName: guest.lastName,
    phone: guest.phone ?? "",
    email: guest.email ?? "",
    nationality: guest.nationality ?? "",
    gender: guest.gender ?? "",
    vipStatus: guest.vipStatus,
    source: guest.source ?? "",
    notes: guest.notes ?? "",
  };
}

function validateDraft(draft: GuestDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (draft.firstName.trim() === "") errors.firstName = "First name is required.";
  if (draft.lastName.trim() === "") errors.lastName = "Last name is required.";
  return errors;
}

/* --------------------------------------------------------------------- screen */

const NO_BACKEND_COPY = "This build has no backend configured, so it cannot read or save guests.";

type SheetMode = { kind: "new" } | { kind: "edit"; guest: Guest };

export default function GuestsPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const storeError = useContextStore((s) => s.error);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const scope = useMemo(
    () => (context.organizationId !== null ? { organizationId: context.organizationId } : null),
    [context.organizationId],
  );

  const canView = can("guest.view", permissions);
  const canCreate = can("guest.create", permissions);
  const canEdit = can("guest.edit", permissions);
  const canArchive = can("guest.archive", permissions);

  const [guests, setGuests] = useState<Guest[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [sheet, setSheet] = useState<SheetMode | null>(null);
  const [archiving, setArchiving] = useState<Guest | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || scope === null || !canView) return;
    let ignore = false;
    setGuests(null);
    setListError(null);

    const trimmed = searchTerm.trim();
    const fetcher = trimmed.length >= 2
      ? () => searchGuests(scope, trimmed)
      : () => listGuests(scope, showArchived ? { includeArchived: true } : {});

    fetcher()
      .then((rows) => {
        if (ignore) return;
        setGuests(rows);
      })
      .catch((error) => {
        if (!ignore) setListError(toPublicError(error).message);
      });
    return () => {
      ignore = true;
    };
  }, [view, scope, canView, showArchived, searchTerm, reloadTick]);

  const reload = useCallback(() => setReloadTick((tick) => tick + 1), []);
  const report = useCallback((error: unknown) => setActionError(toPublicError(error).message), []);

  const confirmArchive = async (_reason: string) => {
    if (archiving === null || scope === null) return;
    setArchiveBusy(true);
    try {
      await archiveGuest(scope, archiving.id, archiving.version);
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
          <User className="size-5 shrink-0 text-brand-600" aria-hidden />
          Guests
        </h2>
        <p className="mt-1 text-sm text-muted">
          People who may stay. Search by name or phone to find a guest quickly, or browse the full
          list below.
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
          title="Sign in to manage guests"
          description="There is no active session for this build to read a tenant from."
        />
      )}

      {view === "no_organization" && (
        <EmptyState
          icon={<User aria-hidden />}
          title="Choose an organization first"
          description="Guests belong to an organization. Pick one and this screen will show its guests."
        />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied capability="view guests" permission="guest.view" />
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
                    New guest
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={reload}>
                  Reload
                </Button>
              </div>
            }
          >
            <div className="flex flex-col gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
                <TextInput
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search by name or phone…"
                  className="pl-9"
                />
              </div>
              <p className="text-xs text-muted">
                {guests === null
                  ? "Loading…"
                  : searchTerm.trim().length >= 2
                    ? `${guests.length} result${guests.length === 1 ? "" : "s"} for "${searchTerm.trim()}"`
                    : `${guests.length} guest${guests.length === 1 ? "" : "s"}`}
              </p>
            </div>
          </Card>

          {guests === null ? (
            <LoadingBlock label="Reading guests…" />
          ) : guests.length === 0 ? (
            <EmptyState
              icon={<User aria-hidden />}
              title={searchTerm.trim().length >= 2 ? "No guests match" : "No guests yet"}
              description={
                searchTerm.trim().length >= 2
                  ? `No active guests match "${searchTerm.trim()}". Try a different search term.`
                  : "This organization has no guests. Add one to start building your guest directory."
              }
              action={
                canCreate && searchTerm.trim().length < 2 ? (
                  <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setSheet({ kind: "new" })}>
                    Add the first guest
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              {guests.map((guest) => (
                <GuestCard
                  key={guest.id}
                  guest={guest}
                  canEdit={canEdit}
                  canArchive={canArchive}
                  onEdit={() => setSheet({ kind: "edit", guest })}
                  onArchive={() => setArchiving(guest)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {sheet !== null && scope !== null && (
        <GuestSheet
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
        entityName={archiving !== null ? `${archiving.firstName} ${archiving.lastName}` : ""}
        entityLabel="guest"
        consequences={[
          "The guest leaves the active directory.",
          "Past stays and reservations keep pointing at this guest record.",
          "033 gives an archived guest no restore door — this is permanent.",
        ]}
      />
    </div>
  );
}

/* --------------------------------------------------------------------- pieces */

type GuestCardProps = {
  guest: Guest;
  canEdit: boolean;
  canArchive: boolean;
  onEdit: () => void;
  onArchive: () => void;
};

function GuestCard({ guest, canEdit, canArchive, onEdit, onArchive }: GuestCardProps) {
  const archived = guest.status === "ARCHIVED";

  return (
    <Card padded={false} className={archived ? "opacity-80" : undefined}>
      <div className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
              {guest.firstName} {guest.lastName}
              {archived && <StatusPill status={guest.status} />}
              {guest.vipStatus !== "REGULAR" && (
                <Badge tone={guest.vipStatus === "VVIP" ? "warning" : "neutral"}>
                  {guest.vipStatus}
                </Badge>
              )}
            </h3>
            <p className="mt-0.5 text-xs text-muted">
              {[
                guest.phone,
                guest.email,
                guest.nationality,
              ]
                .filter(Boolean)
                .join(" · ") || "No contact details"}
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

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          {guest.totalStays > 0 && (
            <span>
              {guest.totalStays} stay{guest.totalStays === 1 ? "" : "s"} · {guest.totalNights} night
              {guest.totalNights === 1 ? "" : "s"}
            </span>
          )}
          {guest.source && <Badge tone="muted">{guest.source}</Badge>}
        </div>

        {guest.notes && (
          <p className="text-sm text-muted">{guest.notes}</p>
        )}
      </div>
    </Card>
  );
}

/* --------------------------------------------------------------------- sheet */

type GuestSheetProps = {
  mode: SheetMode;
  scope: { organizationId: string };
  onClose: () => void;
  onSaved: (message: string | null) => void;
  onFailure: (error: unknown) => void;
};

function GuestSheet({ mode, scope, onClose, onSaved, onFailure }: GuestSheetProps) {
  const editing = mode.kind === "edit" ? mode.guest : null;
  const [draft, setDraft] = useState<GuestDraft>(() =>
    editing === null ? newDraft() : draftFrom(editing),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const genderOptions = useMemo(
    () => [
      { value: "", label: "Not specified" },
      ...GENDERS.map((g) => ({ value: g, label: g.charAt(0) + g.slice(1).toLowerCase() })),
    ],
    [],
  );

  const vipOptions = useMemo(
    () => VIP_STATUSES.map((v) => ({ value: v, label: v })),
    [],
  );

  const sourceOptions = useMemo(
    () => [
      { value: "", label: "Not specified" },
      ...GUEST_SOURCES.map((s) => ({ value: s, label: s })),
    ],
    [],
  );

  const run = async (): Promise<void> => {
    const found = validateDraft(draft);
    setErrors(found);
    if (Object.keys(found).length > 0 || busy) return;
    setBusy(true);
    try {
      const params = {
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim(),
        phone: draft.phone.trim() || null,
        email: draft.email.trim() || null,
        nationality: draft.nationality.trim() || null,
        gender: (draft.gender || null) as Gender | null,
        vipStatus: draft.vipStatus,
        source: (draft.source || null) as GuestSource | null,
        notes: draft.notes.trim() || null,
      };

      if (editing === null) {
        await createGuest(scope, params);
        onSaved(null);
        return;
      }
      await updateGuest(scope, editing.id, { ...params, expectedVersion: editing.version });
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
      title={editing === null ? "New guest" : `Edit ${editing.firstName} ${editing.lastName}`}
      description="A guest is a person who may stay. PII is protected — document numbers never appear in audit logs."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void run()} disabled={busy}>
            {busy ? "Saving…" : editing === null ? "Create guest" : "Save changes"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" required error={errors.firstName}>
            <TextInput
              value={draft.firstName}
              invalid={errors.firstName !== undefined}
              disabled={busy}
              onChange={(event) => setDraft({ ...draft, firstName: event.target.value })}
              placeholder="John"
            />
          </Field>
          <Field label="Last name" required error={errors.lastName}>
            <TextInput
              value={draft.lastName}
              invalid={errors.lastName !== undefined}
              disabled={busy}
              onChange={(event) => setDraft({ ...draft, lastName: event.target.value })}
              placeholder="Smith"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone">
            <TextInput
              value={draft.phone}
              disabled={busy}
              onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
              placeholder="+91 98765 43210"
            />
          </Field>
          <Field label="Email">
            <TextInput
              type="email"
              value={draft.email}
              disabled={busy}
              onChange={(event) => setDraft({ ...draft, email: event.target.value })}
              placeholder="john@example.com"
            />
          </Field>
        </div>

        <Field label="Nationality">
          <TextInput
            value={draft.nationality}
            disabled={busy}
            onChange={(event) => setDraft({ ...draft, nationality: event.target.value })}
            placeholder="Indian"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Gender">
            <SelectInput
              options={genderOptions}
              value={draft.gender}
              disabled={busy}
              onChange={(value) => setDraft({ ...draft, gender: value as Gender | "" })}
            />
          </Field>
          <Field label="VIP status">
            <SelectInput
              options={vipOptions}
              value={draft.vipStatus}
              disabled={busy}
              onChange={(value) => setDraft({ ...draft, vipStatus: value as VipStatus })}
            />
          </Field>
        </div>

        <Field label="Source">
          <SelectInput
            options={sourceOptions}
            value={draft.source}
            disabled={busy}
            onChange={(value) => setDraft({ ...draft, source: value as GuestSource | "" })}
          />
        </Field>

        <Field label="Notes">
          <Textarea
            value={draft.notes}
            disabled={busy}
            onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
            placeholder="Prefers high floor, allergic to feathers."
          />
        </Field>
      </div>
    </Dialog>
  );
}
