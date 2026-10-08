/**
 * The route gate (§21).
 *
 * A destination in this app is protected by four things in the server's order — a
 * session, a membership, an organization context and the capability the screen needs —
 * and the client can only pre-flight the ones the resolved context already answers for.
 * This gate does that pre-flight so a hand-typed URL never mounts a page that would then
 * spend its load calling doors that refuse: the page component is created as an element
 * and only rendered when the decision allows it, so on a denial nothing from the page ever
 * runs. Hiding the nav row was never the protection (§19); this is the "fail safely" half.
 *
 * The session-level states belong to `App`, which renders the sign-in surface and the
 * account-standing explanation for the whole tree. This file defers to it rather than
 * carrying a second copy of that handling.
 */

import { type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { AccessDeniedScreen } from "@/app/AccessDeniedScreen";
import { SIGN_IN_ROUTE, type AppRoute } from "@/app/routes";
import { LoadingBlock } from "@/components/ui/Spinner";
import { useAccessDecision } from "@/components/ui/Can";
import type { Permission } from "@/domain/identity/types";
import { useContextStore } from "@/state/context-store";

type GateProps = {
  readonly permission: Permission;
  /** Created by the caller, mounted only when the decision allows it. */
  readonly children: ReactNode;
};

function RouteGate({ permission, children }: GateProps) {
  // Subscribe so the gate re-renders as the session resolves, then read the live
  // snapshot: a static render only sees the hook's initial snapshot, which would freeze
  // every route at "checking access". Same two-step as `useAccessReason` and `useCan`.
  useContextStore((state) => state.status);
  const status = useContextStore.getState().status;
  const decision = useAccessDecision(permission);

  // §46: the answer is "checking access", not a flash of the denied screen while the
  // context and grant set are still in flight.
  if (status === "idle" || status === "loading") {
    return <LoadingBlock label="Checking access" className="py-10" />;
  }

  if (status === "unauthenticated") return <Navigate to={SIGN_IN_ROUTE.path} replace />;

  // A suspended, deactivated or missing profile: `App` explains it for the whole tree,
  // and the one thing that must not happen here is mounting the page underneath it.
  if (status === "access-lost") return null;

  // With no data plane there is no server answer to pre-flight against, and pretending
  // otherwise would claim a decision nobody made. The screen's own no-connection state
  // is the honest one, so the page renders.
  if (status === "unconfigured") return <>{children}</>;

  // No organization resolved yet: the page itself decides what to show (e.g. the
  // "Use the demo estate" prompt on /organization). Denying here would trap a person
  // who is signed in but has no tenant — they could never reach the page that helps.
  const organizationId = useContextStore.getState().context.organizationId;
  if (organizationId === null) return <>{children}</>;

  if (decision.allowed) return <>{children}</>;
  return <AccessDeniedScreen reason={decision.reason} />;
}

/**
 * Wraps one entry of the route table. A route with no `permission` (the status page,
 * the onboarding wizard) is a destination every signed-in person can reach, so it is
 * mounted directly — gating those would lock somebody out of creating a tenant at all.
 */
export function GuardedRoute({ route }: { readonly route: AppRoute }) {
  const Page = route.component;
  if (route.permission === undefined) return <Page />;
  return (
    <RouteGate permission={route.permission}>
      <Page />
    </RouteGate>
  );
}
