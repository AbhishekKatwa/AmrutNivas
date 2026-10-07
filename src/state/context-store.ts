/**
 * Active-context store (§57/§58/§59).
 *
 * The consequence this prevents: a multi-tenant screen that decides its own context
 * shows data the server never agreed to honour, and a tenant switch that leaves the old
 * scope's rows reachable looks like a bug rather than a leak. The client therefore NEVER
 * picks its own context — it asks `resolve_active_context` (which re-proves every level
 * against the current grants on each load) and adopts whatever the server returns, and it
 * owns the tenant cache lifecycle so leaving a scope actually invalidates it.
 *
 * Two rules the store enforces beyond just holding data:
 *   - A switch commits atomically. Two overlapping `switchContext` calls must not
 *     interleave their writes: each takes a generation when it starts, and only the
 *     highest-issued one is allowed to land. The earlier request's result is discarded,
 *     so the screen never ends up half on tenant A and half on tenant B.
 *   - The switch is not persisted here and the URL is not read here. Where the person
 *     navigates to after a switch is a different work item; this store has no router or
 *     localStorage knowledge.
 *
 * Prompt #03 added the session lifecycle on top of those rules (§25/§26/§27):
 *   - Bootstrap is session-aware. With no GoTrue session the store lands in
 *     `unauthenticated` WITHOUT calling a door — the doors would each refuse with
 *     `NIVAAS_NO_SESSION`, which is true but is a network storm saying nothing new.
 *   - `startSessionSync()` bridges the auth events: a sign-out (and a failed token
 *     refresh, which GoTrue also reports as one) clears every piece of tenant state;
 *     a new or refreshed session re-asks the server for the truth.
 *   - `signOut()` invalidates the session server-side first (§26), and account-level
 *     refusals (suspended, deactivated, missing profile) surface as the explainable
 *     `access-lost` state rather than a blank screen.
 */

import { create } from "zustand";
import {
  claimDemoEstate,
  loadPermissions,
  resolveActiveContext,
  setActiveContext,
  type ContextSelection,
} from "@/domain/access/session-service";
import { denialCopy } from "@/domain/access/authorize";
import {
  observeAuthSession,
  readSession,
  signOutSession,
} from "@/domain/auth/auth-service";
import { accessLostReason, isRevalidateEvent, isSignOutEvent } from "@/domain/auth/session-config";
import {
  can as canWithSet,
  type ActiveContext,
  type Organization,
  type Permission,
  type PermissionSet,
} from "@/domain/identity/types";
import { AppError, toPublicError } from "@/lib/errors";
import { getSupabase, backendUnavailableReason } from "@/db/client";
import { tokenOf } from "@/db/door-errors";
import {
  activateScope,
  clearAll,
  invalidateScope,
  resetForTests as resetTenantCache,
  scopeFor,
} from "@/state/tenant-cache";

export type ContextStatus =
  | "idle"
  | "loading"
  | "ready"
  | "unauthenticated"
  /**
   * Signed in, but the account standing itself refuses: suspended, deactivated,
   * or no profile (§27/§28). Not a sign-in problem to retry and not a permission
   * to ask for — the app renders an explanation and offers only a real sign-out.
   */
  | "access-lost"
  | "unconfigured";

export type ContextNotice = {
  readonly id: string;
  readonly kind: "context-cleared";
  readonly message: string;
};

export type ContextState = {
  status: ContextStatus;
  context: ActiveContext;
  permissions: PermissionSet | null;
  /** Only what `claim_demo_organization` returns; null until the demo estate is claimed. */
  organization: Organization | null;
  notices: ContextNotice[];
  error: string | null;

  bootstrap(): Promise<void>;
  switchContext(selection: ContextSelection): Promise<void>;
  claimDemo(): Promise<void>;
  /** §26: invalidates the GoTrue session, then clears every piece of tenant state. */
  signOut(): Promise<void>;
  /** The person acknowledged a notice. Only ever removes a message, never access. */
  dismissNotice(id: string): void;

  /** Display aid only — every door re-checks the same predicate on write. */
  can(permission: Permission): boolean;
  currentScope(): string;
};

const EMPTY_CONTEXT: ActiveContext = {
  signedIn: false,
  organizationId: null,
  propertyId: null,
  outletId: null,
  cleared: false,
};

/** The data fields a reset restores. Functions are re-attached after setState. */
const initialData = {
  status: "idle" as ContextStatus,
  context: EMPTY_CONTEXT,
  permissions: null as PermissionSet | null,
  organization: null as Organization | null,
  notices: [] as ContextNotice[],
  error: null as string | null,
};

const CLEARED_NOTICE_ID = "context-cleared";

/**
 * When the server drops a level we had saved (§29's revocation-during-offline case),
 * that must be a visible notice, not a silently smaller context. One notice per cleared
 * answer; a later non-cleared answer does not clear it (the person dismisses elsewhere).
 */
function noticeForCleared(notices: ContextNotice[], cleared: boolean): ContextNotice[] {
  if (!cleared) return notices;
  if (notices.some((notice) => notice.id === CLEARED_NOTICE_ID)) return notices;
  return [
    ...notices,
    {
      id: CLEARED_NOTICE_ID,
      kind: "context-cleared",
      message:
        "Your access changed: a property or outlet you had open is no longer available, so the view was narrowed.",
    },
  ];
}

/**
 * A single monotonic counter shared by every state-changing action. Each action takes
 * one at the start and only commits if no later action has taken one since. This is what
 * makes the switch atomic under overlap: the loser of a race returns without touching
 * state or the cache, so the two never interleave their writes.
 */
let commitSequence = 0;

/**
 * Drop every piece of tenant state after the session is gone (§26).
 *
 * `commitSequence` is bumped so any in-flight bootstrap or switch discards itself at
 * its next checkpoint instead of repopulating what we just cleared; the cache loses
 * its active scope so a late fetch cannot commit into it either. No wire call: this
 * is the aftermath of a sign-out GoTrue already performed, not a new request.
 */
function applySignedOut(failure: string | null = null): void {
  commitSequence += 1;
  clearAll();
  useContextStore.setState({ ...initialData, status: "unauthenticated", error: failure });
}

export const useContextStore = create<ContextState>()((set, get) => {
  /** Take a slot; the holder may commit only while `mine === commitSequence`. */
  const claim = (): number => (commitSequence += 1);
  const stillCurrent = (mine: number): boolean => mine === commitSequence;

  /** Map a thrown value to a code + display line, never a raw internal string. */
  const surfaceError = (error: unknown): void => {
    const publicError = toPublicError(error);
    const unauthenticated =
      error instanceof AppError && error.code === "AUTH_REQUIRED";

    // §27/§28: a suspended or deactivated profile, or a missing one, is not a
    // permission problem and not a sign-in problem — it is the account standing.
    // The store recognises the exact door token and lands in an explainable state;
    // the sentence comes from `DENIAL_MESSAGES`, never from the token (§39/§63).
    const lost = accessLostReason(tokenOf(error));
    if (lost !== null) {
      clearAll();
      set({
        status: "access-lost",
        context: EMPTY_CONTEXT,
        permissions: null,
        organization: get().organization,
        error: denialCopy(lost),
      });
      return;
    }

    set({
      status: unauthenticated ? "unauthenticated" : "idle",
      permissions: unauthenticated ? null : get().permissions,
      error: publicError.message,
    });
  };

  return {
    ...initialData,

    can(permission) {
      return canWithSet(permission, get().permissions);
    },

    currentScope() {
      return scopeFor(get().context);
    },

    async bootstrap() {
      const mine = claim();

      // No data plane: this is the "preview build ships without a project" path. We must
      // return WITHOUT touching a door. `getSupabase()` is the authoritative signal in
      // test and at runtime; `backendUnavailableReason()` alone reads env only, so a stub
      // client injected for a test would still look unconfigured to it. Reaching the wire
      // would then either throw or (with a permissive stub) fabricate a session.
      if (getSupabase() === null) {
        set({
          status: "unconfigured",
          error:
            backendUnavailableReason() ??
            "This build has no backend configured, so it cannot read or save data.",
        });
        return;
      }

      set({ status: "loading", error: null });
      try {
        // §25: ask the session before the doors. A door call under no session is a
        // round trip for `NIVAAS_NO_SESSION` the answer was already local, and a
        // screen per boot making it is the network storm this gate exists to stop.
        const session = await readSession();
        if (!stillCurrent(mine)) return;

        if (session === null) {
          activateScope(null);
          set({ status: "unauthenticated", context: EMPTY_CONTEXT, permissions: null });
          return;
        }

        const context = await resolveActiveContext();
        if (!stillCurrent(mine)) return;

        activateScope(scopeFor(context));
        const notices = noticeForCleared(get().notices, context.cleared);

        if (!context.signedIn) {
          set({ status: "unauthenticated", context, permissions: null, notices });
          return;
        }

        let permissions: PermissionSet | null = null;
        if (context.organizationId !== null) {
          permissions = await loadPermissions(
            context.organizationId,
            context.propertyId,
            context.outletId,
          );
        }
        if (!stillCurrent(mine)) return;

        set({ status: "ready", context, permissions, notices });
      } catch (error) {
        if (!stillCurrent(mine)) return;
        surfaceError(error);
      }
    },

    async switchContext(selection) {
      const mine = claim();
      // Capture the scope we are leaving BEFORE any await, so an overlapping switch that
      // is discarded cannot be mistaken for the previous context.
      const previousScope = scopeFor(get().context);
      set({ status: "loading", error: null });
      try {
        const next = await setActiveContext(selection);
        if (!stillCurrent(mine)) return;

        let permissions: PermissionSet | null = null;
        if (next.signedIn && next.organizationId !== null) {
          // Reload for the NEW scope only — the server's narrowed answer, never the one
          // we asked for, so a dropped level cannot leave its old grants cached.
          permissions = await loadPermissions(
            next.organizationId,
            next.propertyId,
            next.outletId,
          );
        }
        if (!stillCurrent(mine)) return;

        const nextScope = scopeFor(next);
        // Order matters: activate first (this gates reads to the new scope AND bumps the
        // cache generation, so any fetch still in flight from the old tenant is refused on
        // commit), THEN physically reclaim the old scope. The old scope is only invalidated
        // when the new one does not sit inside it — drilling deeper into the SAME tenant
        // keeps that tenant's rows warm, since they cannot leak across a tenant boundary.
        activateScope(nextScope);
        if (!nextScope.startsWith(previousScope)) invalidateScope(previousScope);

        set({
          status: "ready",
          context: next,
          permissions,
          notices: noticeForCleared(get().notices, next.cleared),
        });
      } catch (error) {
        if (!stillCurrent(mine)) return;
        surfaceError(error);
      }
    },

    async claimDemo() {
      const mine = claim();
      set({ status: "loading", error: null });
      try {
        const organization = await claimDemoEstate();
        if (!stillCurrent(mine)) return;

        // The claim door points the session at the demo estate server-side; we mirror the
        // organization it returned and re-resolve the context so the levels shown are the
        // server's, not our assumption.
        set({ organization });
        const context = await resolveActiveContext();
        if (!stillCurrent(mine)) return;

        activateScope(scopeFor(context));
        const notices = noticeForCleared(get().notices, context.cleared);

        let permissions: PermissionSet | null = null;
        if (context.signedIn && context.organizationId !== null) {
          permissions = await loadPermissions(
            context.organizationId,
            context.propertyId,
            context.outletId,
          );
        }
        if (!stillCurrent(mine)) return;

        set({
          status: context.signedIn ? "ready" : "unauthenticated",
          context,
          permissions,
          notices,
        });
      } catch (error) {
        if (!stillCurrent(mine)) return;
        surfaceError(error);
      }
    },

    async signOut() {
      // §26: the session is invalidated server-side first, then every piece of state
      // derived from it goes. If the GoTrue call fails the device still gives up the
      // tenant — that is the half of logout a person can always complete — and the
      // typed failure is carried into the fresh state instead of swallowed.
      let failure: string | null = null;
      try {
        await signOutSession();
      } catch (error) {
        failure = toPublicError(error).message;
      }
      applySignedOut(failure);
    },

    dismissNotice(id) {
      // Removes the message, never an access decision. If the server still reports a
      // dropped level on the next load, §29 puts the notice back — the acknowledgement is
      // for this screen, not a standing instruction to stay quiet about revoked access.
      set({ notices: get().notices.filter((notice) => notice.id !== id) });
    },
  };
});

/**
 * Bridge the GoTrue session lifecycle to this store (§25/§27). The app mounts it
 * once, next to its bootstrap effect, and keeps the returned detach function.
 *
 * A sign-out — including a failed token refresh, which GoTrue also reports as a
 * sign-out — clears state without touching the wire: §27's revoked membership must
 * not survive until the next browser reload, and neither must any other session end.
 * A new or refreshed session re-runs `bootstrap`, so the server re-proves the
 * context and grants before anything is shown. `INITIAL_SESSION` is deliberately not
 * revalidated here — the app's own bootstrap effect already runs against it.
 */
export function startSessionSync(): () => void {
  return observeAuthSession((change) => {
    if (isSignOutEvent(change.event)) {
      applySignedOut();
      return;
    }
    if (change.hasSession && isRevalidateEvent(change.event)) {
      void useContextStore.getState().bootstrap();
    }
  });
}

/**
 * Put the store back to a pristine state so no test depends on another's order.
 *
 * `setState` with a partial shallow-merges, so passing only the data fields resets them
 * while the action/selector functions stay attached. The tenant cache is reset too, since
 * the store owns its lifecycle and a test asserting cache state must start from empty.
 */
export function resetForTests(): void {
  commitSequence = 0;
  useContextStore.setState({ ...initialData });
  resetTenantCache();
}
