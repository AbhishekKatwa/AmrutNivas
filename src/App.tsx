import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { CircleSlash, LogOut, ShieldOff } from "lucide-react";
import { Shell } from "@/app/Shell";
import { AccessDebugPanel } from "@/app/AccessDebugPanel";
import { GuardedRoute } from "@/app/RouteGuard";
import { notImplementedLabel } from "@/app/navigation";
import { ROUTES, SIGN_IN_ROUTE } from "@/app/routes";
import { useSyncContextWithUrl } from "@/app/context-url";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { startSessionSync, useContextStore } from "@/state/context-store";

/**
 * An unknown route gets the same honest answer as a nav row that is not built
 * yet. There is no "Dashboard", no "Coming soon" landing page and no mock data
 * behind any path — a URL that is not implemented says so.
 */
function NotImplementedRoute() {
  const location = useLocation();
  return (
    <EmptyState
      icon={<CircleSlash aria-hidden />}
      title={notImplementedLabel()}
      description={`No destination is registered at "${location.pathname}". Every live path in this
        build is listed in the navigation; a URL outside that list has nothing behind it.`}
    />
  );
}

/**
 * What an unsigned browser sees (§25): the sign-in link surface at every path.
 * There is no shell to navigate, so no nav, no context switcher and no page
 * behind it calling doors that would each refuse with `NIVAAS_NO_SESSION`.
 */
function SignInOnly() {
  return (
    <Routes>
      <Route path={SIGN_IN_ROUTE.path} element={<SignInRouteElement />} />
      <Route path="*" element={<Navigate to={SIGN_IN_ROUTE.path} replace />} />
    </Routes>
  );
}

/** The sign-in surface, resolved from the route table at render time. */
function SignInRouteElement() {
  const Page = SIGN_IN_ROUTE.component;
  return <Page />;
}

/**
 * The account standing itself refuses — suspended, deactivated, no profile
 * (§27/§28). This screen explains that instead of an empty app, offers only a
 * real sign-out, and shows the store's sentence, never the door token.
 */
function AccessLostScreen() {
  const error = useContextStore((state) => state.error);
  const signOut = useContextStore((state) => state.signOut);
  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper px-4 py-8">
      <div className="w-full max-w-md">
        <EmptyState
          icon={<ShieldOff aria-hidden />}
          title="This workspace is closed to you"
          description={error ?? "Your account is not operational any more. Contact your administrator."}
          action={
            <Button
              variant="secondary"
              size="sm"
              icon={<LogOut className="size-4" aria-hidden />}
              onClick={() => {
                void signOut();
              }}
            >
              Sign out
            </Button>
          }
        />
      </div>
    </div>
  );
}

/**
 * Application-level effects, mounted inside the router.
 *
 * The context is asked for once here rather than per screen: eight screens each
 * calling `bootstrap()` would be eight loads of the same two doors, and the store's
 * generation counter would then race them against each other. The screens keep their
 * own `idle` guard for the case where they render without this component (a test, a
 * future route outside the shell).
 *
 * `startSessionSync()` is the companion effect (§25/§27): the moment a session ends —
 * signed out or refresh-failed — tenant state is dropped without a wire call, and the
 * moment one is created or refreshed the server is asked for the truth again.
 */
function Workspace() {
  const bootstrap = useContextStore((state) => state.bootstrap);
  const status = useContextStore((state) => state.status);
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);
  useEffect(() => startSessionSync(), []);
  useSyncContextWithUrl();

  if (status === "unauthenticated") return <SignInOnly />;
  if (status === "access-lost") return <AccessLostScreen />;

  return (
    <Shell>
      <Routes>
        {/* Mounted here too so a signed-in browser at /sign-in resolves: the link
            landing page works while the session is being consumed. */}
        <Route path={SIGN_IN_ROUTE.path} element={<SignInRouteElement />} />
        {ROUTES.map((route) => (
          <Route key={route.path} path={route.path} element={<GuardedRoute route={route} />} />
        ))}
        <Route path="*" element={<NotImplementedRoute />} />
      </Routes>
      {/* §67: the access inspector. Vite replaces `import.meta.env.DEV` with `false` in a
          production build, so this expression disappears and the module is never referenced. */}
      {import.meta.env.DEV && <AccessDebugPanel />}
    </Shell>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Workspace />
    </BrowserRouter>
  );
}
