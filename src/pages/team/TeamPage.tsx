import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  CircleSlash,
  Crown,
  Mail,
  ShieldQuestion,
  UserPlus,
  Users,
} from "lucide-react";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { archiveActionState } from "@/components/ui/ArchiveDialog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { LoadingBlock } from "@/components/ui/Spinner";
import { SelectInput } from "@/components/ui/SelectInput";
import { StatusPill } from "@/components/ui/StatusPill";
import { Textarea } from "@/components/ui/Textarea";
import { TextInput } from "@/components/ui/TextInput";
import { useContextStore } from "@/state/context-store";
import {
  cancelInvitation,
  inviteMember,
  listMembers,
  listPendingInvitations,
  setMemberStatus,
  transferOwnership,
  type InviteMemberInput,
} from "@/domain/access/people-service";
import { listGrants, listRoles } from "@/domain/access/role-service";
import { listProperties } from "@/domain/hierarchy/property-service";
import { listOutlets } from "@/domain/hierarchy/outlet-service";
import { roleGrantability } from "@/pages/access/RolesPage";
import type {
  EntityId,
  Invitation,
  IssuedInvitation,
  Membership,
  MembershipStatus,
  Role,
  RoleGrant,
} from "@/domain/identity/types";
import { toPublicError, type PublicError } from "@/lib/errors";

/* ------------------------------------------------------------------ pure rules */

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** The raw invite sheet, before it becomes a door call. */
export type InviteFormValues = {
  organizationId: EntityId;
  email: string;
  fullName: string;
  /** The selected role's NAME, or "" while nothing is chosen. */
  role: string;
  propertyIds: EntityId[];
  outletIds: EntityId[];
};

export type InviteFieldErrors = {
  email?: string;
  role?: string;
  propertyIds?: string;
  outletIds?: string;
};

export type InviteDoorResult =
  | { ok: true; input: InviteMemberInput }
  | { ok: false; errors: InviteFieldErrors };

/**
 * Turn the invite sheet into exactly what `invite_member` accepts — or the field errors
 * that prove it is not ready.
 *
 * This mirrors the door so the operator never submits a form the database will refuse:
 * an address must look like one (`NIVAAS_INVALID_EMAIL`), a role must be chosen and
 * grantable, a PROPERTY role demands at least one property and an OUTLET role demands at
 * least one outlet (`NIVAAS_EMPTY_SELECTION`). The returned input is the request payload:
 * it carries NO token, because `inviteMember` only ever puts the secret in the RESPONSE.
 * An input that could hold a `token` key would be a bug waiting to leak one, so this
 * function is the seam that proves the request side never carries it.
 */
export function buildInviteDoorInput(
  values: InviteFormValues,
  role: Role | null,
): InviteDoorResult {
  const errors: InviteFieldErrors = {};

  const email = values.email.trim();
  if (email === "") errors.email = "An email address is required.";
  else if (!EMAIL_PATTERN.test(email)) errors.email = "Enter a valid email address.";

  if (role === null) {
    errors.role = "Choose a role to invite them to.";
  } else {
    const grantable = roleGrantability(role);
    if (!grantable.grantable) {
      errors.role = grantable.reason;
    } else if (role.scopeLevel === "PROPERTY" && values.propertyIds.length === 0) {
      errors.propertyIds = "Choose at least one property for this role.";
    } else if (role.scopeLevel === "OUTLET" && values.outletIds.length === 0) {
      errors.outletIds = "Choose at least one outlet for this role.";
    }
  }

  // The role guard repeats here so TypeScript narrows `role` for the payload below; it is
  // never a second user-facing reason — `role === null` already set `errors.role`.
  if (Object.keys(errors).length > 0 || role === null) {
    return { ok: false, errors };
  }

  const input: InviteMemberInput = {
    organizationId: values.organizationId,
    email,
    role: role.name,
  };
  const fullName = values.fullName.trim();
  if (fullName !== "") input.fullName = fullName;
  if (values.propertyIds.length > 0) input.propertyIds = values.propertyIds;
  if (values.outletIds.length > 0) input.outletIds = values.outletIds;
  return { ok: true, input };
}

/**
 * The accept link an operator copies and sends by hand.
 *
 * The live email/GoTrue accept flow is Prompt #03, so today the honest path is a
 * copy-your-link panel: this is the only place the token is turned into a URL, it is
 * rendered in that one panel, and the app never routes to it or stores it.
 */
export function invitationAcceptLink(token: string, origin: string): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}/accept?token=${encodeURIComponent(token)}`;
}

export type MemberActionView = {
  status: MembershipStatus;
  isOwner: boolean;
  /** The acting person is the same human as this member. */
  isSelf: boolean;
  /** The acting person holds the owner seat (or is the platform). */
  actorIsOwner: boolean;
  canSuspend: boolean;
  canRemove: boolean;
};

export type Decision = { enabled: boolean; reason: string };

export type MemberActionState = {
  suspend: Decision;
  reinstate: Decision;
  remove: Decision;
  /** Offered as a candidate to receive ownership. */
  transfer: Decision;
};

function decide(enabled: boolean, reason = ""): Decision {
  return { enabled, reason: enabled ? "" : reason };
}

/**
 * Which membership transitions are valid, and why the others are not.
 *
 * These are the rules the `set_member_status` and `transfer_ownership` doors enforce,
 * surfaced before submission so a button is greyed with a reason rather than failing:
 *   - suspend acts on an ACTIVE member; reinstate acts on a SUSPENDED one; REMOVED is
 *     terminal (`NIVAAS_INVALID_STATUS`);
 *   - you cannot act on yourself (`NIVAAS_SELF_NOT_ALLOWED`);
 *   - the owner seat cannot be removed before ownership moves
 *     (`NIVAAS_OWNER_MUST_TRANSFER`), and acting on it requires the owner
 *     (`NIVAAS_OWNER_ONLY`);
 *   - reinstating needs the same authority the door gates the ACTIVE transition on
 *     (`user.remove`), and transfer only ever targets an ACTIVE, non-owner member
 *     (`NIVAAS_MEMBER_NOT_ACTIVE`).
 */
export function memberActionState(view: MemberActionView): MemberActionState {
  const { status, isOwner, isSelf, actorIsOwner, canSuspend, canRemove } = view;

  const ownerSeatBlocked = isOwner && !actorIsOwner;

  const suspend = isSelf
    ? decide(false, "You cannot change your own access.")
    : status !== "ACTIVE"
      ? decide(false, "Only an active member can be suspended.")
      : ownerSeatBlocked
        ? decide(false, "Only the organization owner can act on the owner seat.")
        : !canSuspend
          ? decide(false, "Your role cannot suspend members.")
          : decide(true);

  // The door gates restoring to ACTIVE on `user.remove` — suspend is user.suspend, every
  // other status it can set is user.remove.
  const reinstate = isSelf
    ? decide(false, "You cannot change your own access.")
    : status !== "SUSPENDED"
      ? decide(false, "Only a suspended member can be restored.")
      : ownerSeatBlocked
        ? decide(false, "Only the organization owner can act on the owner seat.")
        : !canRemove
          ? decide(false, "Your role cannot restore members.")
          : decide(true);

  const remove = isSelf
    ? decide(false, "You cannot change your own access.")
    : status === "REMOVED"
      ? decide(false, "This member has already been removed.")
      : isOwner
        ? decide(false, "Transfer ownership before removing the owner.")
        : !canRemove
          ? decide(false, "Your role cannot remove members.")
          : decide(true);

  const transfer = isOwner
    ? decide(false, "This person is already the owner.")
    : status !== "ACTIVE"
      ? decide(false, "Ownership can only move to an active member.")
      : !actorIsOwner
        ? decide(false, "Only the current owner can transfer ownership.")
        : decide(true);

  return { suspend, reinstate, remove, transfer };
}

/* ------------------------------------------------------------------ view helper */

function formatDate(value: string | null): string {
  if (value === null) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : format(date, "d MMM yyyy");
}

type PendingKind = "suspend" | "reinstate" | "remove" | "transfer" | "cancel";

type Pending = {
  kind: PendingKind;
  entityName: string;
  membershipId?: EntityId;
  invitationId?: EntityId;
};

const CONSEQUENCES: Record<PendingKind, readonly string[]> = {
  suspend: [
    "Suspension revokes every role grant this person holds in this organization, right now.",
    "It is not a pause and resume: restoring them later does not put these roles back.",
    "Their property and outlet breadth is kept, so a returning person is not left with rights but no sites.",
  ],
  reinstate: [
    "Restoring the membership makes the person active again — it does NOT return their role grants.",
    "You must re-grant each role explicitly on the Roles & Access screen after restoring.",
  ],
  remove: [
    "Removal is terminal for this seat inside the organization.",
    "It also withdraws their property and outlet breadth.",
    "Their login account itself is untouched — one person can belong to several organizations.",
  ],
  transfer: [
    "You will no longer be the sole owner of this organization.",
    "Ownership — and the ORG_OWNER grant that travels with it — moves to this active member.",
  ],
  cancel: [
    "The invitation stops working immediately.",
    "It is recorded as cancelled and stays in the audit trail.",
    "You can invite the person again later if needed.",
  ],
};

const CONFIRM_LABEL: Record<PendingKind, string> = {
  suspend: "Suspend member",
  reinstate: "Restore member",
  remove: "Remove member",
  transfer: "Transfer ownership",
  cancel: "Cancel invitation",
};

/* ----------------------------------------------------------------------- screen */

/**
 * The people of one tenant: who belongs, who is only invited, who owns the group, and
 * what authority moves between them.
 *
 * Three facts this screen states instead of hiding, because the database proves each:
 * an invitation token is shown exactly once (only the operator's clipboard keeps it),
 * suspension is a revocation rather than a pause (restoring grants nothing back), and
 * there is exactly one owner (transfer names a new one and strips the old).
 */
export default function TeamPage() {
  // Subscribe to the whole store so the screen re-renders whenever the server re-proves
  // the context or the permission set changes; read the live snapshot for the values. The
  // subscription value is not used for rendering — a server render (and this suite's
  // static render) sees only the initial snapshot through the hook, so the honest-state
  // decisions read `getState()` to reflect whatever the store currently holds.
  useContextStore((s) => s);
  const { status, context, organization, can } = useContextStore.getState();
  const organizationId = context.organizationId;

  const mayView = can("user.view");
  const mayInvite = can("user.invite");
  const maySuspend = can("user.suspend");
  const mayRemove = can("user.remove");
  // The store's permission set never carries the actor's own user id, so sole ownership is
  // approximated by `organization.archive` — only ORG_OWNER and the platform hold it. The
  // doors re-check the true owner on every write, so this only decides what is offered.
  const actorIsOwner = can("organization.archive");

  const [members, setMembers] = useState<Membership[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [grants, setGrants] = useState<RoleGrant[]>([]);
  const [properties, setProperties] = useState<{ id: EntityId; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<PublicError | null>(null);

  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [inviteRoleName, setInviteRoleName] = useState("");
  const [invitePropertyIds, setInvitePropertyIds] = useState<EntityId[]>([]);
  const [inviteOutletPropertyId, setInviteOutletPropertyId] = useState<EntityId>("");
  const [inviteOutletIds, setInviteOutletIds] = useState<EntityId[]>([]);
  const [outletOptions, setOutletOptions] = useState<{ id: EntityId; name: string }[]>([]);
  const [inviteErrors, setInviteErrors] = useState<InviteFieldErrors>({});
  const [issued, setIssued] = useState<IssuedInvitation | null>(null);

  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<PublicError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (organizationId === null) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [memberRows, invitationRows, roleRows, grantRows, propertyRows] = await Promise.all([
        listMembers(organizationId),
        listPendingInvitations(organizationId),
        listRoles(),
        listGrants({ organizationId }),
        listProperties({ organizationId }),
      ]);
      setMembers(memberRows);
      setInvitations(invitationRows);
      setRoles(roleRows);
      setGrants(grantRows);
      setProperties(propertyRows.map((p) => ({ id: p.id, name: p.name })));
    } catch (error) {
      setLoadError(toPublicError(error));
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (status === "ready" && organizationId !== null && mayView) {
      void refresh();
    } else {
      setLoading(false);
    }
  }, [status, organizationId, mayView, refresh]);

  // Outlets live below a property; the invite sheet only needs them for an OUTLET role.
  useEffect(() => {
    if (status !== "ready" || organizationId === null || inviteOutletPropertyId === "") {
      setOutletOptions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await listOutlets({ organizationId, propertyId: inviteOutletPropertyId });
        if (!cancelled) setOutletOptions(rows.map((o) => ({ id: o.id, name: o.name })));
      } catch {
        if (!cancelled) setOutletOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, organizationId, inviteOutletPropertyId]);

  const roleById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);

  const rolesByUser = useMemo(() => {
    const map = new Map<EntityId, string[]>();
    for (const grant of grants) {
      const label = grant.role?.displayName ?? null;
      if (label === null) continue;
      const list = map.get(grant.userId) ?? [];
      list.push(label);
      map.set(grant.userId, list);
    }
    return map;
  }, [grants]);

  const selectedInviteRole = roles.find((r) => r.name === inviteRoleName) ?? null;
  const unavailableRoles = roles.filter((r) => !roleGrantability(r).grantable);

  function openPending(next: Pending) {
    setPending(next);
    setReason("");
    setActionError(null);
    setNotice(null);
  }

  async function confirmPending() {
    if (pending === null || organizationId === null) return;
    const normalized = archiveActionState(reason, pending.entityName);
    if (!normalized.canConfirm) return;
    setBusy(true);
    setActionError(null);
    try {
      if (pending.kind === "cancel" && pending.invitationId) {
        await cancelInvitation(pending.invitationId, normalized.normalizedReason);
      } else if (pending.kind === "transfer" && pending.membershipId) {
        await transferOwnership(organizationId, pending.membershipId, normalized.normalizedReason);
      } else if (pending.membershipId) {
        const nextStatus: Exclude<MembershipStatus, "INVITED"> =
          pending.kind === "suspend" ? "SUSPENDED" : pending.kind === "reinstate" ? "ACTIVE" : "REMOVED";
        await setMemberStatus(pending.membershipId, nextStatus, normalized.normalizedReason);
      }
      setPending(null);
      setNotice("Change recorded.");
      await refresh();
    } catch (error) {
      setActionError(toPublicError(error));
    } finally {
      setBusy(false);
    }
  }

  function resetInviteSheet() {
    setEmail("");
    setFullName("");
    setInviteRoleName("");
    setInvitePropertyIds([]);
    setInviteOutletPropertyId("");
    setInviteOutletIds([]);
    setInviteErrors({});
  }

  async function submitInvite() {
    if (organizationId === null) return;
    const result = buildInviteDoorInput(
      {
        organizationId,
        email,
        fullName,
        role: inviteRoleName,
        propertyIds: invitePropertyIds,
        outletIds: inviteOutletIds,
      },
      selectedInviteRole,
    );
    if (!result.ok) {
      setInviteErrors(result.errors);
      return;
    }
    setInviteErrors({});
    setBusy(true);
    setActionError(null);
    try {
      // The token exists only on this response. It is held in ephemeral component state
      // for the single copy panel and dropped when the sheet closes — never persisted.
      const invitation = await inviteMember(result.input);
      setIssued(invitation);
    } catch (error) {
      setActionError(toPublicError(error));
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------------------------------------------- honest states */

  if (status === "unconfigured") {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <PageHeader isDemo={false} showDemo={false} />
        <Card title="No backend configured" padded={false}>
          <div className="px-4 py-5 sm:px-5">
            <EmptyState
              icon={<CircleSlash aria-hidden />}
              title="The team cannot be listed"
              description="This build has no backend configured, so there are no members or invitations to
                show. Connect a Supabase project to bring this screen to life."
            />
          </div>
        </Card>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <PageHeader isDemo={false} showDemo={false} />
        <Card title="Sign in required" padded={false}>
          <div className="px-4 py-5 sm:px-5">
            <EmptyState
              icon={<Users aria-hidden />}
              title="No active session"
              description="A team belongs to a signed-in organization. Sign in to see who works here — there
                is nothing to list until a session is resolved."
            />
          </div>
        </Card>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <PageHeader isDemo={false} showDemo={false} />
        <Card>
          <LoadingBlock label="Confirming your access to the team…" />
        </Card>
      </div>
    );
  }

  if (organizationId === null) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <PageHeader isDemo={false} showDemo={false} />
        <Card title="No organization selected" padded={false}>
          <div className="px-4 py-5 sm:px-5">
            <EmptyState
              icon={<CircleSlash aria-hidden />}
              title="Choose a tenant first"
              description="The team is scoped to one organization. Select an active organization to manage its
                people."
            />
          </div>
        </Card>
      </div>
    );
  }

  if (!mayView) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <PageHeader isDemo={!!organization?.isDemo} showDemo={organization !== null} />
        <AccessDenied capability="view the team" permission="user.view" />
      </div>
    );
  }

  const memberColumns: DataColumn<Membership>[] = [
    {
      key: "person",
      header: "Person",
      render: (m) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{m.member?.fullName || "Unnamed member"}</p>
          <p className="truncate text-xs text-muted">{m.member?.email ?? "—"}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (m) => (
        <span className="inline-flex items-center gap-2">
          <StatusPill status={m.status} />
          {m.isOwner && (
            <Badge tone="brand">
              <Crown className="size-3" aria-hidden />
              Owner
            </Badge>
          )}
        </span>
      ),
    },
    {
      key: "roles",
      header: "Roles held",
      render: (m) => {
        const held = rolesByUser.get(m.userId) ?? [];
        return held.length === 0 ? (
          <span className="text-muted">None</span>
        ) : (
          <span className="inline-flex flex-wrap gap-1">
            {held.map((label) => (
              <Badge key={label} tone="neutral">
                {label}
              </Badge>
            ))}
          </span>
        );
      },
    },
    {
      key: "joined",
      header: "Joined",
      render: (m) => <span className="text-muted">{formatDate(m.joinedAt)}</span>,
    },
    {
      key: "actions",
      header: "Manage",
      align: "right",
      render: (m) => <MemberRowActions member={m} view={viewFor(m)} onOpen={openPending} />,
    },
  ];

  const invitationColumns: DataColumn<Invitation>[] = [
    { key: "email", header: "Email", render: (i) => <span className="text-ink">{i.email}</span> },
    {
      key: "role",
      header: "Role",
      render: (i) => <span className="text-muted">{roleById.get(i.roleId)?.displayName ?? "—"}</span>,
    },
    {
      key: "expires",
      header: "Expires",
      render: (i) => <span className="text-muted">{formatDate(i.expiresAt)}</span>,
    },
    {
      key: "cancel",
      header: "",
      align: "right",
      render: (i) => (
        <Button
          size="sm"
          variant="ghost"
          disabled={!mayInvite || busy}
          title={mayInvite ? "Cancel this invitation" : "Requires user.invite"}
          onClick={() =>
            openPending({ kind: "cancel", entityName: i.email, invitationId: i.id })
          }
        >
          Cancel
        </Button>
      ),
    },
  ];

  const pendingState = archiveActionState(reason, pending?.entityName ?? "");

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:gap-6">
      <PageHeader
        isDemo={!!organization?.isDemo}
        showDemo={organization !== null}
        actions={
          mayInvite ? (
            <Button
              variant="primary"
              icon={<UserPlus className="size-4" aria-hidden />}
              onClick={() => {
                resetInviteSheet();
                setIssued(null);
                setShowInvite(true);
                setActionError(null);
              }}
            >
              Invite
            </Button>
          ) : (
            <Badge tone="neutral">View only</Badge>
          )
        }
      />

      {actionError !== null && (
        <InlineError error={actionError} onDismiss={() => setActionError(null)} />
      )}
      {loadError !== null && <InlineError error={loadError} onDismiss={() => setLoadError(null)} />}
      {notice !== null && (
        <p
          role="status"
          className="rounded-md border border-[#cfe4d6] bg-success-soft px-3 py-2 text-xs text-success"
        >
          {notice}
        </p>
      )}

      <Card title="Members" description="Everyone with a seat in this organization." padded={false}>
        <DataTable
          columns={memberColumns}
          rows={members}
          rowKey={(m) => m.id}
          loading={loading}
          empty={
            <EmptyState
              icon={<Users aria-hidden />}
              title="No members yet"
              description="Nobody has joined this organization. Invite the first person to get started."
            />
          }
        />
      </Card>

      <Card
        title="Pending invitations"
        description="Invitations that have not been accepted. Newest first."
        padded={false}
      >
        <DataTable
          columns={invitationColumns}
          rows={invitations}
          rowKey={(i) => i.id}
          loading={loading}
          empty={
            <EmptyState
              icon={<Mail aria-hidden />}
              title="No pending invitations"
              description="There are no open invitations to cancel or wait on."
            />
          }
        />
      </Card>

      {/* Invite sheet, opened in place. */}
      <Dialog
        open={showInvite}
        onClose={() => {
          setShowInvite(false);
          // The one-time token is dropped when the sheet closes; it can never be shown again.
          setIssued(null);
        }}
        side="right"
        title={issued ? "Invitation created" : "Invite a person"}
        description={
          issued
            ? "Copy the link below and send it to the person."
            : "They receive an accept link. The token works exactly once and cannot be reissued later."
        }
        footer={
          issued ? (
            <Button
              variant="primary"
              onClick={() => {
                setShowInvite(false);
                setIssued(null);
                resetInviteSheet();
                void refresh();
              }}
            >
              Done
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setShowInvite(false)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={busy || selectedInviteRole === null}
                onClick={() => void submitInvite()}
              >
                {busy ? "Sending…" : "Send invitation"}
              </Button>
            </>
          )
        }
      >
        {issued ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3 rounded-md border border-[#eddcb4] bg-warning-soft px-4 py-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <p className="text-xs leading-relaxed text-ink">
                This token is shown <span className="font-semibold">once</span>. The database keeps only its
                hash, so it cannot be retrieved after you close this panel. Send the link now — the live
                email delivery arrives with Prompt #03.
              </p>
            </div>
            <Field label="Accept link" hint="Copy and send this to the invited address.">
              <TextInput readOnly value={acceptHref(issued.token)} />
            </Field>
            <Button
              variant="secondary"
              onClick={() => {
                // Clipboard only; nothing here is written to a store, URL bar or log.
                if (typeof navigator !== "undefined" && navigator.clipboard) {
                  void navigator.clipboard.writeText(acceptHref(issued.token));
                }
              }}
            >
              Copy link
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Field
              label="Email"
              required
              error={inviteErrors.email}
              hint="The address the invitation is issued to."
            >
              <TextInput
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="person@example.com"
                invalid={inviteErrors.email !== undefined}
              />
            </Field>

            <Field label="Full name" hint="Optional — shown on their profile once they join.">
              <TextInput value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Optional" />
            </Field>

            <Field label="Role" required error={inviteErrors.role}>
              <SelectInput
                value={inviteRoleName}
                onChange={setInviteRoleName}
                placeholder="Choose a role…"
                invalid={inviteErrors.role !== undefined}
                options={roles
                  .filter((r) => roleGrantability(r).grantable)
                  .map((r) => ({ value: r.name, label: `${r.displayName} · ${r.scopeLevel}` }))}
              />
            </Field>

            {selectedInviteRole?.scopeLevel === "PROPERTY" && (
              <Field label="Properties" required error={inviteErrors.propertyIds}>
                <div className="flex flex-col gap-1.5">
                  {properties.map((p) => (
                    <Checkbox
                      key={p.id}
                      label={p.name}
                      checked={invitePropertyIds.includes(p.id)}
                      onChange={(checked) =>
                        setInvitePropertyIds((prev) =>
                          checked ? [...prev, p.id] : prev.filter((id) => id !== p.id),
                        )
                      }
                    />
                  ))}
                </div>
              </Field>
            )}

            {selectedInviteRole?.scopeLevel === "OUTLET" && (
              <>
                <Field label="Property" hint="Pick the property, then the outlets inside it.">
                  <SelectInput
                    value={inviteOutletPropertyId}
                    onChange={setInviteOutletPropertyId}
                    placeholder="Choose a property…"
                    options={properties.map((p) => ({ value: p.id, label: p.name }))}
                  />
                </Field>
                <Field label="Outlets" required error={inviteErrors.outletIds}>
                  <div className="flex flex-col gap-1.5">
                    {outletOptions.map((o) => (
                      <Checkbox
                        key={o.id}
                        label={o.name}
                        checked={inviteOutletIds.includes(o.id)}
                        onChange={(checked) =>
                          setInviteOutletIds((prev) =>
                            checked ? [...prev, o.id] : prev.filter((id) => id !== o.id),
                          )
                        }
                      />
                    ))}
                  </div>
                </Field>
              </>
            )}

            {unavailableRoles.length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-md border border-line bg-surface-sunken px-4 py-3">
                <p className="text-xs font-semibold text-ink">Not offered</p>
                {unavailableRoles.map((r) => (
                  <p key={r.id} className="flex items-start gap-2 text-xs leading-relaxed text-muted">
                    <ShieldQuestion className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    {r.displayName}: {roleGrantability(r).reason}
                  </p>
                ))}
              </div>
            )}

            <p className="text-xs leading-relaxed text-muted">
              Inviting makes a person a member with this role once they accept; the door grants breadth to
              the sites you chose at the same time.
            </p>
          </div>
        )}
      </Dialog>

      {/* One reason-gated confirmation reused for every membership transition, cancellation and transfer. */}
      <Dialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title={pending ? `${CONFIRM_LABEL[pending.kind]} — ${pending.entityName}` : ""}
        description="A reason is required and recorded in the audit trail."
        footer={
          <>
            <Button variant="secondary" onClick={() => setPending(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant={pending?.kind === "cancel" ? "secondary" : "danger"}
              disabled={!pendingState.canConfirm || busy}
              onClick={() => void confirmPending()}
            >
              {busy ? "Working…" : pending ? CONFIRM_LABEL[pending.kind] : ""}
            </Button>
          </>
        }
      >
        {pending && (
          <div className="flex flex-col gap-4">
            <ul className="flex flex-col gap-1.5 rounded-md border border-line bg-surface-sunken px-4 py-3">
              {CONSEQUENCES[pending.kind].map((line) => (
                <li key={line} className="text-xs leading-relaxed text-muted">
                  {line}
                </li>
              ))}
            </ul>
            <Field label="Reason" required hint="Recorded on the audit row; required before you can continue.">
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} />
            </Field>
            {!pendingState.canConfirm && reason.length > 0 && (
              <p role="status" className="text-xs text-muted">
                A reason is still required.
              </p>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );

  function viewFor(member: Membership): MemberActionView {
    return {
      status: member.status,
      isOwner: member.isOwner,
      isSelf: false,
      actorIsOwner,
      canSuspend: maySuspend,
      canRemove: mayRemove,
    };
  }

  function acceptHref(token: string): string {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return invitationAcceptLink(token, origin);
  }
}

/* ------------------------------------------------------------- member row actions */

function MemberRowActions({
  member,
  view,
  onOpen,
}: {
  member: Membership;
  view: MemberActionView;
  onOpen: (next: Pending) => void;
}) {
  const actions = memberActionState(view);
  const name = member.member?.fullName || member.member?.email || "this member";

  const open = (kind: PendingKind) => () =>
    onOpen({ kind, entityName: name, membershipId: member.id });

  return (
    <span className="inline-flex flex-wrap justify-end gap-1">
      {actions.suspend.enabled || member.status === "ACTIVE" ? (
        <Button size="sm" variant="ghost" disabled={!actions.suspend.enabled} title={actions.suspend.reason} onClick={open("suspend")}>
          Suspend
        </Button>
      ) : null}

      {member.status === "SUSPENDED" ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={!actions.reinstate.enabled}
          title={actions.reinstate.reason}
          onClick={open("reinstate")}
        >
          Restore
        </Button>
      ) : null}

      {member.status !== "REMOVED" ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={!actions.remove.enabled}
          title={actions.remove.reason}
          onClick={open("remove")}
        >
          Remove
        </Button>
      ) : null}

      {view.actorIsOwner && !member.isOwner ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={!actions.transfer.enabled}
          title={actions.transfer.reason}
          onClick={open("transfer")}
        >
          Make owner
        </Button>
      ) : null}
    </span>
  );
}

/* ------------------------------------------------------------------- primitives */

function PageHeader({
  isDemo,
  showDemo,
  actions,
}: {
  isDemo: boolean;
  showDemo: boolean;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">Team</h2>
          {showDemo && isDemo && <Badge tone="brand">Demo tenant</Badge>}
        </div>
        <p className="mt-1 text-sm text-muted">Members, invitations, and the authority that moves between them.</p>
      </div>
      {actions !== undefined && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

function InlineError({ error, onDismiss }: { error: PublicError; onDismiss: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-[#f2d4d1] bg-danger-soft px-4 py-3">
      <p className="text-xs leading-relaxed text-danger">{error.message}</p>
      <button type="button" onClick={onDismiss} className="text-xs font-medium text-danger underline">
        Dismiss
      </button>
    </div>
  );
}
