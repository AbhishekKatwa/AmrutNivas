/**
 * The people inside a tenant: who belongs, who is still only invited, who owns the
 * group, and what happens when any of that changes.
 *
 * Five doors and two read paths, and the reads are the interesting half. `authenticated`
 * holds SELECT on every table in 003 and INSERT/UPDATE/DELETE on none, so a roster is
 * a plain SELECT and a change is always a door call. Nothing in this file can write a
 * row directly — the transport stub in `test-helpers/transport.ts` throws if a service
 * tries, because that is the architecture's central claim rather than a style rule.
 *
 * Two asymmetries a screen must know about:
 *
 * 1. A door in this scope answers with a hand-built `jsonb_build_object` whose keys are
 *    ALREADY camelCase (`invitationId`, `token`, `membershipId`), not `to_jsonb(row)`.
 *    The funnel's mapper is a no-op on those keys, so the shapes below are typed from
 *    each door's own `return` statement — one field more or fewer is a real drift.
 * 2. `p_*` parameter names are how PostgREST binds. The friendly `organizationId` on an
 *    input object is mapped to `organization` here by hand, because `organizationId`
 *    would become `p_organization_id` and that function does not exist.
 */

import { requireSupabase } from "@/db/client";
import { callDoorRow, camelRows } from "@/db/rpc";
import type {
  EntityId,
  Invitation,
  IssuedInvitation,
  Membership,
  MembershipStatus,
} from "@/domain/identity/types";

/* ------------------------------------------------------------------ door inputs */

/** What `invite_member` accepts. A scope is optional only when the role is wider than a site. */
export type InviteMemberInput = {
  organizationId: EntityId;
  /** The invited address. `NIVAAS_INVALID_EMAIL` refuses anything the door's pattern rejects. */
  email: string;
  /** The role's NAME, not its id — the door resolves `upper(p_role)` and refuses an
   *  unknown or inactive one with `NIVAAS_ROLE_NOT_FOUND`. */
  role: string;
  fullName?: string | null;
  phone?: string | null;
  /** Required by the door when the role's scope is `PROPERTY` (`NIVAAS_EMPTY_SELECTION`). */
  propertyIds?: EntityId[];
  /** Required by the door when the role's scope is `OUTLET`. */
  outletIds?: EntityId[];
  /** Omitted means the door's own default (14 days); the door bounds it 1..90. */
  validDays?: number;
};

/**
 * The statuses this door can set. Derived from `MembershipStatus`, never re-declared:
 * `INVITED` is absent because only `invite_member` creates one and only
 * `accept_invitation` leaves it — a status door that could mint an invitation would
 * bypass §35's token proof. Anything else reaches `NIVAAS_INVALID_STATUS`.
 */
export type SettableMembershipStatus = Exclude<MembershipStatus, "INVITED">;

/** `membershipId`+`status`: exactly what `set_member_status` returns. */
export type MemberStatusResult = {
  membershipId: EntityId;
  status: SettableMembershipStatus;
};

/** `cancel_invitation`'s whole answer. */
export type CancelledInvitation = {
  invitationId: EntityId;
  status: "CANCELLED";
};

/** `accept_invitation`'s answer: which tenant the person landed in, and at what level. */
export type AcceptedInvitation = {
  organizationId: EntityId;
  role: string;
  scope: string;
};

/**
 * `transfer_ownership`'s answer. `previousOwner` is a USER id (the door reads it off the
 * old owner row) while `newMemberId` is a MEMBERSHIP id — the two halves of the same
 * event are keyed differently, so a screen must not print one as though it were the other.
 */
export type OwnershipTransfer = {
  organizationId: EntityId;
  previousOwner: EntityId | null;
  newMemberId: EntityId;
};

/* --------------------------------------------------------------------- reads */

/** The columns this service turns into a `Membership`; deliberately not `*`. */
const MEMBERSHIP_COLUMNS =
  "id, user_id, organization_id, status, is_owner, joined_at, suspended_at, removed_at, version, created_at";

/**
 * The readable face of `invitations` — every column except `token_hash`.
 *
 * One literal, never a concatenation: postgrest-js parses the SELECT list at the type
 * level, and a `+`-joined string arrives as plain `string`, whose row type is an error type
 * that the funnel's `camelRows` refuses.
 */
const INVITATION_COLUMNS = "id, organization_id, email, phone, full_name, role_id, property_ids, outlet_ids, status, invited_by, expires_at, accepted_at, accepted_by, created_at, updated_at";

/** A `profiles` row as stored. `full_name` is `not null default ''`, so it is never null here. */
type ProfileRow = {
  id: EntityId;
  email: string;
  fullName: string;
};

/** The 002 row itself plus the ordering column; `joinedAt` is NULL until a join. */
type MembershipRow = Omit<Membership, "member"> & {
  createdAt: string;
};

/**
 * The roster of one tenant, with each person's login identity joined in.
 *
 * Two reads, not one embedded select: the camel mapper is top-level only, so
 * `.select("*, profiles(*)")` would hand back a membership whose own keys are camelCase
 * and whose nested person is still `full_name`. Joining in the service is the rule this
 * layer follows everywhere.
 *
 * Newest addition first, ordered by `created_at`. `joined_at` is the friendlier-looking
 * key and is unusable for it: it is NULL for every not-yet-accepted invitation, and
 * Postgres sorts NULLs first under DESC, so the pending rows would crowd out the people
 * actually working today. `created_at` is never null, and `id` breaks a same-timestamp
 * tie so a batch import cannot shuffle between page loads.
 *
 * `organizationId` is both the query filter and the RLS predicate (003's
 * `memberships_read`); the second read is scoped by the ids the first one returned,
 * because a person row carries no tenant column at all (§16 — one human, many tenants).
 */
export async function listMembers(organizationId: EntityId): Promise<Membership[]> {
  const found = await camelRows<MembershipRow>(
    requireSupabase()
      .from("organization_memberships")
      .select(MEMBERSHIP_COLUMNS)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }),
  );
  if (found.length === 0) return [];

  const people = await camelRows<ProfileRow>(
    requireSupabase()
      .from("profiles")
      .select("id, email, full_name")
      .in("id", found.map((row) => row.userId)),
  );
  const byId = new Map(people.map((row) => [row.id, row]));

  return found.map((row) => ({
    id: row.id,
    userId: row.userId,
    organizationId: row.organizationId,
    status: row.status,
    isOwner: row.isOwner,
    // Passed through as stored: NULL means the person has not accepted yet, and
    // falling back to `created_at` would fabricate a join date for a pending seat.
    joinedAt: row.joinedAt,
    suspendedAt: row.suspendedAt,
    removedAt: row.removedAt,
    version: row.version,
    member: pickMember(byId.get(row.userId)),
  }));
}

/** `Pick<UserAccount, "id" | "email" | "fullName">`, or absent when the row was unreadable. */
function pickMember(profile: ProfileRow | undefined): Membership["member"] {
  return profile === undefined
    ? undefined
    : { id: profile.id, email: profile.email, fullName: profile.fullName };
}

/**
 * The invitations a re-invite would collide with — `NIVAAS_ALREADY_INVITED` is exactly
 * "one of these already exists". Newest first, and `token_hash` is never selected: the
 * table stores only the digest of a credential, and a listing screen has no reason to
 * carry it out of the database at all.
 */
export async function listPendingInvitations(organizationId: EntityId): Promise<Invitation[]> {
  return camelRows<Invitation>(
    requireSupabase()
      .from("invitations")
      .select(INVITATION_COLUMNS)
      .eq("organization_id", organizationId)
      .eq("status", "INVITED")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }),
  );
}

/* -------------------------------------------------------------------- writes */

/**
 * Invite a person to a tenant and get back the accept link's secret.
 *
 * THE TOKEN IS SHOWN EXACTLY ONCE. `invite_member` stores only its SHA-256 (§35/§75) and
 * puts the plaintext in this response, so it exists nowhere else afterwards: no service,
 * store, console line or query cache may keep it. Hand it to the operator's clipboard or a
 * single render, then drop it — re-fetching the invitation can never produce it again.
 *
 * The door returns `{ invitationId, token, role, scope, expiresAt }` and `IssuedInvitation`
 * is exactly that payload — keys are built in camelCase by `jsonb_build_object`, so the
 * mapper is a no-op and the row comes back unchanged. The invited address and the tenant
 * are the caller's own input (and live on the `invitations` row for
 * `listPendingInvitations`); anything else on the result would be a field the door never
 * sends.
 */
export async function inviteMember(input: InviteMemberInput): Promise<IssuedInvitation> {
  return callDoorRow<IssuedInvitation>("invite_member", {
    organization: input.organizationId,
    email: input.email,
    role: input.role,
    fullName: input.fullName,
    phone: input.phone,
    propertyIds: input.propertyIds,
    outletIds: input.outletIds,
    validDays: input.validDays,
  });
}

/**
 * Withdraw an open invitation. The door refuses one that is no longer `INVITED`
 * (`NIVAAS_INVITATION_NOT_USABLE`) and requires a reason, which lands in the audit row.
 */
export async function cancelInvitation(
  invitationId: EntityId,
  reason: string,
): Promise<CancelledInvitation> {
  return callDoorRow<CancelledInvitation>("cancel_invitation", {
    invitation: invitationId,
    reason,
  });
}

/**
 * Redeem an accept link.
 *
 * CONTRACT-ONLY until Prompt #03 ships real sign-up: the door needs a session belonging to
 * the invited address (§78's `NIVAAS_EMAIL_MISMATCH` arm), and this build has no sign-in
 * path, so the flow below has never run end to end. What IS proved by test is that the
 * plaintext token reaches `accept_invitation` as `p_token` and nothing else.
 *
 * The door answers `{ organizationId, role, scope }` — the membership, breadth rows and
 * role grants it created are its business, and it writes one audit row per grant.
 */
export async function acceptInvitation(token: string): Promise<AcceptedInvitation> {
  return callDoorRow<AcceptedInvitation>("accept_invitation", { token });
}

/**
 * Suspend, remove or restore a person inside one tenant.
 *
 * THE CONSEQUENCE THE OPERATOR MUST BE TOLD: suspending revokes every role grant that
 * person holds in this organization — the door stamps `revoked_at` on all of them — and
 * RESTORING DOES NOT PUT THEM BACK. `ACTIVE` only un-pauses the membership row; the
 * operator has to re-grant each role afterwards (`role-service.assignRole`), which is why
 * an admin screen must not present suspension as "pause and resume". Removal goes further:
 * it also deletes the property/outlet breadth rows, while a suspension keeps them so a
 * returning person is not left with rights but no sites.
 *
 * Guardrails that come from the door rather than the UI: acting on your own membership is
 * `NIVAAS_SELF_NOT_ALLOWED`, removing an owner before ownership has moved is
 * `NIVAAS_OWNER_MUST_TRANSFER`, and touching an owner row requires being the owner (or the
 * platform) — `NIVAAS_OWNER_ONLY`. `version` is bumped by the door; there is no optimistic
 * lock parameter to send.
 *
 * The door answers `{ membershipId, status }`, so the caller re-reads the roster for the
 * rest of the row.
 */
export async function setMemberStatus(
  memberId: EntityId,
  status: SettableMembershipStatus,
  reason: string,
): Promise<MemberStatusResult> {
  return callDoorRow<MemberStatusResult>("set_member_status", {
    membership: memberId,
    status,
    reason,
  });
}

/**
 * Hand the owner seat to another member (§18).
 *
 * The second argument is a MEMBERSHIP id, not a user id: `transfer_ownership` takes
 * `p_to_membership` and validates the row it points at, because ownership belongs to the
 * seat inside this tenant and one human may hold seats in several. Resolve the person's
 * membership in this organization first (the `id` on a `listMembers` row).
 *
 * Refusals to surface: `NIVAAS_MEMBER_NOT_ACTIVE` when the target membership is not
 * `ACTIVE` — the eligibility check the door applies — and `NIVAAS_NOT_FOUND` when the
 * membership does not belong to this organization at all. `NIVAAS_OWNER_ONLY` refuses
 * anyone who is not the current active owner or the platform admin.
 *
 * Two membership rows and the `ORG_OWNER` grant change in one transaction, and 002's
 * partial unique index (`memberships_one_owner_idx`) is what makes "exactly one owner" a
 * database fact rather than an application hope.
 */
export async function transferOwnership(
  organizationId: EntityId,
  toMembershipId: EntityId,
  reason: string,
): Promise<OwnershipTransfer> {
  return callDoorRow<OwnershipTransfer>("transfer_ownership", {
    organization: organizationId,
    toMembership: toMembershipId,
    reason,
  });
}
