/**
 * The sign-in surface (Prompt #03 §25/§41/§46).
 *
 * The defect this prevents: a login screen that invents credentials. This product
 * has no passwords — its whole entry path is the emailed sign-in link, the same
 * token-by-email model the invitations use — so this page asks for an address and
 * sends a link, and nothing else. No password field exists to bypass here because
 * no password flow exists anywhere behind it (§41).
 *
 * The no-backend degrade follows `FoundationStatusPage`: a preview build without
 * project keys explains which variable is missing instead of showing a form whose
 * submit could only ever fail.
 */

import { useState, type FormEvent } from "react";
import { MailCheck, ShieldCheck } from "lucide-react";
import { backendUnavailableReason } from "@/db/client";
import { sendSignInLink } from "@/domain/auth/auth-service";
import { APP_NAME, APP_TAGLINE } from "@/config/brand";
import { publicErrorMessage } from "@/lib/errors";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { TextInput } from "@/components/ui/TextInput";

/**
 * Format only — never existence. GoTrue answers the same way whether or not the
 * address has an account (§41's account-enumeration rule), and this check exists
 * to keep an obvious typo from costing an email, not to probe the user table.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Phase = "entry" | "sending" | "sent";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>("entry");
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const missingBackend = backendUnavailableReason();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const address = email.trim();
    if (!EMAIL_PATTERN.test(address)) {
      setError("Enter a valid email address.");
      return;
    }
    setError(null);
    setPhase("sending");
    try {
      await sendSignInLink(address);
      setSentTo(address);
      setPhase("sent");
    } catch (caught: unknown) {
      // One line for every failure; GoTrue's own text may name account state (§41).
      setError(publicErrorMessage(caught));
      setPhase("entry");
    }
  }

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
              and rebuild. This page will offer the sign-in link once there is a backend behind it.
            </p>
          </Card>
        ) : phase === "sent" ? (
          <Card
            title="Check your inbox"
            description={`A sign-in link is on its way to ${sentTo}.`}
          >
            <div className="flex flex-col gap-4">
              <p className="flex items-start gap-2 text-sm leading-relaxed text-ink">
                <MailCheck className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
                <span>
                  Open the link in this browser to sign in. It is the only credential this
                  product uses — there is no password to remember, and the link expires on
                  its own.
                </span>
              </p>
              <p role="status" className="text-xs leading-relaxed text-muted">
                Nothing appears here until the link is opened; if it lands somewhere else,
                check the spam folder or send a fresh link.
              </p>
              <Button
                variant="secondary"
                onClick={() => {
                  setPhase("entry");
                  setError(null);
                }}
              >
                Send to a different address
              </Button>
            </div>
          </Card>
        ) : (
          <Card
            title="Sign in"
            description="Enter your work email address and we will send you a sign-in link."
            actions={<Badge tone="brand">Email link</Badge>}
          >
            <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
              <Field
                label="Email address"
                required
                error={error ?? undefined}
                hint="The address your organization invited. The link only works in this browser."
              >
                <TextInput
                  type="email"
                  name="email"
                  autoComplete="email"
                  spellCheck={false}
                  placeholder="you@your-hotel.example"
                  leadingIcon={<ShieldCheck aria-hidden />}
                  value={email}
                  disabled={phase === "sending"}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>
              <Button type="submit" variant="primary" block disabled={phase === "sending"}>
                {phase === "sending" ? "Sending the link…" : "Send sign-in link"}
              </Button>
              <p className="text-[11px] leading-relaxed text-muted">
                AMRUT NIVAAS never asks for a password by email, and no password exists for
                your account. If this address has no invitation, the link simply will not
                open a workspace.
              </p>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
