/**
 * The client's one authorization question (§20).
 *
 * A control that a person can click and the server then refuses is a wasted action;
 * a control that vanishes silently teaches nobody anything. So this file is the only
 * place the UI asks "may I?", and it asks the existing ladder — `authorize()`, the pure
 * mirror of `public.evaluate_access` — with `can()` as the permission step inside it.
 * There is deliberately no second evaluation order and no rule of its own: a screen
 * that needs a verdict calls `useCan` or wraps its affordance in `<Can>`, and the
 * server stays the gate that actually decides (§19).
 */

import { type ReactNode } from "react";
import clsx from "clsx";
import { authorize, denialCopy, type AccessDecision, type AccessFacts } from "@/domain/access/authorize";
import type { AccessDenialReason } from "@/config/security";
import { can, type ActiveContext, type Permission, type PermissionSet } from "@/domain/identity/types";
import { useContextStore } from "@/state/context-store";

/** The two pieces of the session snapshot the ladder reads. */
type SessionSnapshot = {
  readonly context: ActiveContext;
  readonly permissions: PermissionSet | null;
};

/**
 * The facts as the client is allowed to know them.
 *
 * `resolve_active_context` re-proves `app.member_of` for the organization it hands back
 * and drops any property or outlet the grants no longer cover, so a level present in the
 * store IS the server's yes for those steps — that is why they can be filled from the
 * context instead of being guessed. A profile or standing refusal never reaches this
 * state at all: the store lands in `access-lost` with an empty context first, which is
 * why the ladder's first step (`signedIn`) is the one that answers for those cases here.
 *
 * The consequence of filling only what the server proved: this pre-flight can be too
 * generous (a stale grant set shows a control the door then refuses) but never too
 * strict about tenancy — which is the direction §19 requires, since the doors decide.
 */
function factsFor(session: SessionSnapshot, permission: Permission): AccessFacts {
  return {
    signedIn: session.context.signedIn,
    profileExists: true,
    accountStanding: "ACTIVE",
    membershipStatus: session.context.organizationId === null ? null : "ACTIVE",
    organizationStatus: "ACTIVE",
    propertyRequested: session.context.propertyId,
    propertyReachable: true,
    outletRequested: session.context.outletId,
    outletReachable: true,
    permissionRequested: permission,
    permissionHeld: can(permission, session.permissions),
  };
}

/** The pure half: a snapshot plus a capability, in the server's own order. */
export function decideAccess(session: SessionSnapshot, permission: Permission): AccessDecision {
  return authorize(factsFor(session, permission));
}

/**
 * The live decision for one capability, re-read on every session change.
 *
 * Subscribe first, then take the snapshot: a static (server) render only sees the hook's
 * initial snapshot, so reading through the subscription alone would freeze every control
 * as denied. The subscription is also what makes §20's requirement real — a permission
 * revoked mid-shift re-renders this control greyed-out rather than leaving it live until
 * someone clicks it and the door answers.
 */
export function useAccessDecision(permission: Permission): AccessDecision {
  useContextStore((state) => state.context);
  useContextStore((state) => state.permissions);
  const { context, permissions } = useContextStore.getState();
  return decideAccess({ context, permissions }, permission);
}

/** `true` when this session may offer the capability. Same single ladder as `<Can>`. */
export function useCan(permission: Permission): boolean {
  return useAccessDecision(permission).allowed;
}

export type CanProps = {
  readonly permission: Permission;
  readonly children: ReactNode;
  /** What to render instead when the capability is absent. Renders nothing by default. */
  readonly fallback?: ReactNode;
  /**
   * Say why instead of disappearing (§63). For an affordance a person can see and would
   * otherwise assume is broken or missing — a control that is closed for a reason should
   * name the reason in the same words the server uses, never the key behind it.
   */
  readonly reason?: boolean;
};

/** Declarative affordance gate: children only while the session holds the capability. */
export function Can({ permission, children, fallback = null, reason = false }: CanProps) {
  const decision = useAccessDecision(permission);
  if (decision.allowed) return <>{children}</>;
  if (!reason) return <>{fallback}</>;
  return <Denied reason={decision.reason} />;
}

export type DeniedProps = {
  readonly reason: AccessDenialReason;
  readonly className?: string;
};

/**
 * One refusal, in the user's words. The sentence is `DENIAL_MESSAGES`' own, so the
 * affordance-level copy and the full access-denied screen cannot drift apart, and no
 * caller can pass a permission key or a door token into what a person reads.
 */
export function Denied({ reason, className }: DeniedProps) {
  return (
    <p
      role="status"
      className={clsx(
        "max-w-prose rounded-md border border-line bg-surface-sunken px-3 py-2",
        "text-xs leading-relaxed text-muted",
        className,
      )}
    >
      {denialCopy(reason)}
    </p>
  );
}
