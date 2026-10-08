/**
 * The sign-in surface (Prompt #03 §25/§41/§46, Prompt #31.5).
 *
 * Primary authentication is User ID + Password. The page asks for a user ID
 * (e.g. AMRUT001) and a password, then delegates to GoTrue's native password
 * path. No magic link, no email-for-login. Password recovery is separate and
 * may use email, but the login itself never does.
 *
 * The no-backend degrade follows `FoundationStatusPage`: a preview build without
 * project keys explains which variable is missing instead of showing a form whose
 * submit could only ever fail.
 */

import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Lock, User, Zap } from "lucide-react";
import { backendUnavailableReason } from "@/db/client";
import { signInWithPassword, requestPasswordReset, devBypassSignIn } from "@/domain/auth/auth-service";
import { APP_NAME, APP_TAGLINE } from "@/config/brand";
import { publicErrorMessage } from "@/lib/errors";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { TextInput } from "@/components/ui/TextInput";

type Phase = "login" | "submitting" | "forgot" | "forgot-submitting" | "forgot-sent";

export default function SignInPage() {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [phase, setPhase] = useState<Phase>("login");
  const [error, setError] = useState<string | null>(null);

  const missingBackend = backendUnavailableReason();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmedId = userId.trim();
    if (trimmedId.length === 0) {
      setError("Enter your User ID.");
      return;
    }
    if (password.length === 0) {
      setError("Enter your password.");
      return;
    }
    setError(null);
    setPhase("submitting");
    try {
      await signInWithPassword(trimmedId, password);
    } catch (caught: unknown) {
      setError(publicErrorMessage(caught));
      setPhase("login");
    }
  }

  async function submitForgot(event: FormEvent) {
    event.preventDefault();
    const trimmedId = userId.trim();
    if (trimmedId.length === 0) {
      setError("Enter your User ID.");
      return;
    }
    setError(null);
    setPhase("forgot-submitting");
    try {
      await requestPasswordReset(trimmedId);
      setPhase("forgot-sent");
    } catch (caught: unknown) {
      setError(publicErrorMessage(caught));
      setPhase("forgot");
    }
  }

  async function devSignIn() {
    const id = userId.trim() || "OWNER001";
    setError(null);
    setPhase("submitting");
    try {
      await devBypassSignIn(id);
    } catch (caught: unknown) {
      setError(publicErrorMessage(caught));
      setPhase("login");
    }
  }

  const isSubmitting = phase === "submitting" || phase === "forgot-submitting";

  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper px-4 py-8">
      <div className="w-full max-w-md">
        <header className="mb-6 text-center">
          <p className="text-lg font-semibold tracking-[-0.01em] text-brand-700">{APP_NAME}</p>
          <p className="mt-1 text-xs text-muted">{APP_TAGLINE}</p>
        </header>

        {missingBackend !== null ? (
          <Card
            title="No data plane connected"
            description="Sign-in is decided by the server, and this build has no Supabase project to ask."
          >
            <p className="text-sm leading-relaxed text-ink">{missingBackend}</p>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Set the two publishable variables (<code className="rounded-sm bg-surface-sunken px-1 py-0.5">VITE_SUPABASE_URL</code>{" "}
              and <code className="rounded-sm bg-surface-sunken px-1 py-0.5">VITE_SUPABASE_ANON_KEY</code>)
              and rebuild. This page will offer the login once there is a backend behind it.
            </p>
          </Card>
        ) : phase === "forgot-sent" ? (
          <Card
            title="Check your inbox"
            description="If that User ID has an account, a password reset link is on its way."
          >
            <div className="flex flex-col gap-4">
              <p className="text-sm leading-relaxed text-ink">
                Open the link in this browser to reset your password. The link expires on its own.
              </p>
              <Button
                variant="secondary"
                onClick={() => {
                  setPhase("login");
                  setError(null);
                  setPassword("");
                }}
              >
                Back to sign in
              </Button>
            </div>
          </Card>
        ) : phase === "forgot" || phase === "forgot-submitting" ? (
          <Card
            title="Reset your password"
            description="Enter your User ID and we will send a reset link to your email."
          >
            <form className="flex flex-col gap-4" onSubmit={(event) => void submitForgot(event)}>
              <Field
                label="User ID"
                required
                error={error ?? undefined}
              >
                <TextInput
                  type="text"
                  name="userId"
                  autoComplete="username"
                  spellCheck={false}
                  placeholder="AMRUT001"
                  leadingIcon={<User aria-hidden />}
                  value={userId}
                  disabled={isSubmitting}
                  onChange={(event) => setUserId(event.target.value)}
                />
              </Field>
              <Button type="submit" variant="primary" block disabled={isSubmitting}>
                {isSubmitting ? "Sending…" : "Send reset link"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                block
                onClick={() => {
                  setPhase("login");
                  setError(null);
                }}
              >
                Back to sign in
              </Button>
            </form>
          </Card>
        ) : (
          <Card
            title="Sign in"
            description="Enter your User ID and password to access your workspace."
            actions={<Badge tone="brand">User ID + Password</Badge>}
          >
            <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
              <Field
                label="User ID"
                required
                error={error ?? undefined}
              >
                <TextInput
                  type="text"
                  name="userId"
                  autoComplete="username"
                  spellCheck={false}
                  placeholder="AMRUT001"
                  leadingIcon={<User aria-hidden />}
                  value={userId}
                  disabled={isSubmitting}
                  onChange={(event) => setUserId(event.target.value)}
                />
              </Field>
              <Field label="Password" required>
                <TextInput
                  type={showPassword ? "text" : "password"}
                  name="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  leadingIcon={<Lock aria-hidden />}
                  trailing={
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-muted hover:text-ink"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  }
                  value={password}
                  disabled={isSubmitting}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </Field>
              <Button type="submit" variant="primary" block disabled={isSubmitting}>
                {isSubmitting ? "Signing in…" : "LOGIN"}
              </Button>
              {import.meta.env.DEV && (
                <Button
                  type="button"
                  variant="secondary"
                  block
                  disabled={isSubmitting}
                  onClick={() => void devSignIn()}
                >
                  <Zap className="mr-2 size-4" aria-hidden />
                  Dev: Sign in instantly (testing only)
                </Button>
              )}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  className="text-xs text-brand-600 hover:text-brand-700 hover:underline"
                  onClick={() => {
                    setPhase("forgot");
                    setError(null);
                    setPassword("");
                  }}
                >
                  Forgot password?
                </button>
              </div>
              <p className="text-[11px] leading-relaxed text-muted">
                Your credentials are verified securely. If you do not have a User ID,
                contact your organization administrator.
              </p>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
