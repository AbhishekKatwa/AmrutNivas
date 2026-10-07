import { type ReactNode } from "react";
import { CircleSlash, Lock } from "lucide-react";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { useContextStore, type ContextStatus } from "@/state/context-store";

export type AccessDeniedProps = {
  /** What the person was trying to do, in plain words: "create a property". */
  capability: string;
  /** The machine permission string behind the denial, e.g. "property.create". */
  permission?: string;
  /** The specific record, when the denial is about one item rather than a verb. */
  resourceName?: string;
  /** Supply to render a real "go back"; the primitive stays router-free. */
  onBack?: () => void;
  backLabel?: string;
  /** Extra guidance for the screens that can name the role to ask. */
  hint?: ReactNode;
  className?: string;
};

/**
 * Why the current session cannot do this. `can()` answers yes or no and nothing
 * else, and no has five different causes — only one of which is a role. A screen
 * rendering this state knows its own verb, never the cause, so the cause is read
 * from the session here instead of being passed in by every caller.
 */
export type AccessReason =
  | "role"
  | "no-organization"
  | "no-session"
  | "no-data-plane"
  | "resolving";

/**
 * `permissions === null` while ready means signed-in-without-a-tenant: the grant
 * set is scoped to an organization and there was none to load it for, so no
 * permission token has been evaluated against anything yet.
 */
export function accessReasonFor(
  status: ContextStatus,
  permissionsLoaded: boolean,
): AccessReason {
  if (status === "unconfigured") return "no-data-plane";
  if (status === "unauthenticated") return "no-session";
  if (status !== "ready") return "resolving";
  return permissionsLoaded ? "role" : "no-organization";
}

/**
 * Why the live session cannot do this — the one read every capability notice shares.
 *
 * Subscribe so the notice re-renders when the session resolves, then take the live
 * snapshot: a static/server render only sees the hook's initial snapshot, which would
 * make every notice claim the session is still loading. Same note on TeamPage.
 */
export function useAccessReason(): AccessReason {
  useContextStore((state) => state.status);
  useContextStore((state) => state.permissions);
  const { status, permissions } = useContextStore.getState();
  return accessReasonFor(status, permissions !== null);
}

type Wording = {
  title: string;
  /** `subject` is the capability, qualified by the record when the denial names one. */
  description: (subject: string, permission?: string) => string;
  /** The line shown when the caller has no back handler. */
  suggestion: (subject: string) => ReactNode;
};

const WORDINGS: Record<AccessReason, Wording> = {
  role: {
    title: "Access not available",
    description: (subject, permission) =>
      `You don't have permission to ${subject}. ` +
      `This access is denied by your role (${permission ?? "not granted"}), ` +
      `not by a problem with the data — ask an administrator if you need it.`,
    suggestion: (subject) => (
      <>
        Return to a screen you can reach, or request{" "}
        <span className="font-medium text-ink">{subject}</span> access.
      </>
    ),
  },
  "no-organization": {
    title: "No organization selected",
    description: (subject) =>
      `This session is signed in without an organization selected, so there is no role loaded ` +
      `to check ${subject} against. Nothing was denied and the data is intact.`,
    suggestion: () => <>Choose the organization you work in, then open this screen again.</>,
  },
  "no-session": {
    title: "Not signed in",
    description: (subject) =>
      `${subject} requires a signed-in session, and there is none to read a role from. ` +
      `This is not a problem with the data.`,
    suggestion: () => <>Sign in, or return to a screen you can reach.</>,
  },
  "no-data-plane": {
    title: "No data plane connected",
    description: (subject) =>
      `${subject} is decided by the server, and this build has no Supabase project connected ` +
      `to ask. Nothing was denied — there is no tenant, role or permission to check here.`,
    suggestion: () => <>Return to a screen you can reach in this preview build.</>,
  },
  resolving: {
    title: "Checking your access",
    description: (subject) =>
      `${subject} is checked against the role set for this session, which is still loading. ` +
      `Nothing has been denied.`,
    suggestion: () => <>Return to a screen you can reach while the session loads.</>,
  },
};

/**
 * The permission-denied state (§51) — shown when a person can see that something
 * exists but may not act on it.
 *
 * It is deliberately not the data-error state and not the empty state: the record
 * is fine and the query worked. But "your role lacks the right" is only true once a
 * role has actually been loaded and refused. Asserting that on a build with no
 * backend, or before sign-in, invents a server decision that never happened — which
 * is the one thing §51 exists to prevent. So the wording is chosen from the session:
 * the role sentence appears only for a real denial, every other cause names its own,
 * and none of them offers "try again", because none is a failure the person can
 * retry past.
 */
export function AccessDenied({
  capability,
  permission,
  resourceName,
  onBack,
  backLabel = "Go back",
  hint,
  className,
}: AccessDeniedProps) {
  const reason = useAccessReason();
  const wording = WORDINGS[reason];

  const subject = resourceName === undefined ? capability : `${capability} for “${resourceName}”`;
  const description = wording.description(subject, permission);

  const action = (
    <div className="flex flex-col gap-2">
      {onBack !== undefined ? (
        <Button variant="secondary" onClick={onBack}>
          {backLabel}
        </Button>
      ) : (
        <p className="text-xs text-muted">{wording.suggestion(subject)}</p>
      )}
      {/* Whom to ask — meaningful only when a role actually withheld the right. */}
      {hint !== undefined && reason === "role" && (
        <p className="text-xs leading-relaxed text-muted">{hint}</p>
      )}
    </div>
  );

  return (
    <EmptyState
      className={className}
      icon={reason === "role" ? <Lock aria-hidden /> : <CircleSlash aria-hidden />}
      title={wording.title}
      description={description}
      action={action}
    />
  );
}
