/**
 * CRM Corporate Accounts — company entities linked to guest records.
 *
 * Shows corporate accounts with contact details, credit limits and payment terms.
 * Guests can be linked to a corporate account for billing and rate purposes.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, CircleSlash, LogIn, Plus } from "lucide-react";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { LoadingBlock } from "@/components/ui/Spinner";
import { Switch } from "@/components/ui/Switch";
import { TextInput } from "@/components/ui/TextInput";
import { Textarea } from "@/components/ui/Textarea";
import { can, type ActiveContext } from "@/domain/identity/types";
import type { CorporateAccount } from "@/domain/crm/types";
import { listCorporateAccounts, createCorporateAccount, type CrmScope } from "@/domain/crm/crm-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

type CorporateView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_organization"
  | "scoped";

function pageStatusFor(status: ContextStatus, context: ActiveContext): CorporateView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null ? "scoped" : "no_organization";
  }
  return "bootstrapping";
}

type CorporateDraft = {
  name: string;
  code: string;
  contactName: string;
  phone: string;
  email: string;
  billingAddress: string;
  taxId: string;
  creditLimit: string;
  paymentTerms: string;
};

function newDraft(): CorporateDraft {
  return {
    name: "",
    code: "",
    contactName: "",
    phone: "",
    email: "",
    billingAddress: "",
    taxId: "",
    creditLimit: "",
    paymentTerms: "",
  };
}

export default function CorporateAccountsPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const scope = useMemo<CrmScope | null>(
    () => (context.organizationId !== null ? { organizationId: context.organizationId } : null),
    [context.organizationId],
  );

  const canView = can("crm.corporate.view", permissions);
  const canManage = can("crm.corporate.manage", permissions);

  const [accounts, setAccounts] = useState<CorporateAccount[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<CorporateDraft>(newDraft);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || scope === null || !canView) return;
    let ignore = false;
    setAccounts(null);
    setError(null);

    listCorporateAccounts(scope, { includeArchived: showArchived })
      .then((rows) => {
        if (ignore) return;
        setAccounts(rows);
      })
      .catch((err) => {
        if (!ignore) setError(toPublicError(err).message);
      });

    return () => {
      ignore = true;
    };
  }, [view, scope, canView, showArchived, reloadTick]);

  const handleCreate = async () => {
    if (scope === null || draft.name.trim() === "") return;
    setBusy(true);
    try {
      await createCorporateAccount(scope, {
        name: draft.name.trim(),
        code: draft.code.trim() || null,
        contactName: draft.contactName.trim() || null,
        phone: draft.phone.trim() || null,
        email: draft.email.trim() || null,
        billingAddress: draft.billingAddress.trim() || null,
        taxId: draft.taxId.trim() || null,
        creditLimit: draft.creditLimit.trim() || null,
        paymentTerms: draft.paymentTerms.trim() || null,
      });
      setShowCreate(false);
      setDraft(newDraft());
      setActionError(null);
      reload();
    } catch (err) {
      setActionError(toPublicError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
          <Building2 className="size-5 shrink-0 text-brand-600" aria-hidden />
          Corporate accounts
        </h2>
        <p className="mt-1 text-sm text-muted">
          Company entities linked to guest records for billing and rate purposes.
        </p>
      </header>

      {view === "bootstrapping" && <LoadingBlock label="Loading your workspace…" />}

      {view === "unconfigured" && (
        <EmptyState icon={<CircleSlash aria-hidden />} title="Backend not configured" description="This build has no backend configured." />
      )}

      {view === "unauthenticated" && (
        <EmptyState icon={<LogIn aria-hidden />} title="Sign in to view corporate accounts" description="There is no active session for this build to read a tenant from." />
      )}

      {view === "no_organization" && (
        <EmptyState icon={<Building2 aria-hidden />} title="Choose an organization first" description="Corporate accounts belong to an organization." />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied capability="view corporate accounts" permission="crm.corporate.view" />
      )}

      {view === "scoped" && scope !== null && canView && (
        <>
          {error !== null && (
            <p role="alert" className="rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}
          {actionError !== null && (
            <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger">
              <span>{actionError}</span>
              <Button size="sm" variant="ghost" onClick={() => setActionError(null)}>Dismiss</Button>
            </div>
          )}

          <Card
            actions={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Switch checked={showArchived} onChange={setShowArchived} label="Show archived" />
                {canManage && (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Plus className="size-4" aria-hidden />}
                    onClick={() => setShowCreate(true)}
                  >
                    New account
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={reload}>Reload</Button>
              </div>
            }
          >
            <p className="text-xs text-muted">
              {accounts === null ? "Loading…" : `${accounts.length} account${accounts.length === 1 ? "" : "s"}`}
            </p>
          </Card>

          {accounts === null ? (
            <LoadingBlock label="Reading corporate accounts…" />
          ) : accounts.length === 0 ? (
            <EmptyState
              icon={<Building2 aria-hidden />}
              title="No corporate accounts"
              description="Create a corporate account to link guests to a company."
              action={
                canManage ? (
                  <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setShowCreate(true)}>
                    Create first account
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              {accounts.map((acct) => (
                <Card key={acct.id} padded={false}>
                  <div className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:px-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
                          {acct.name}
                          {acct.code && <Badge tone="muted">{acct.code}</Badge>}
                          {acct.status !== "ACTIVE" && <Badge tone="muted">{acct.status}</Badge>}
                        </h3>
                        <p className="mt-0.5 text-xs text-muted">
                          {[acct.contactName, acct.phone, acct.email]
                            .filter(Boolean)
                            .join(" · ") || "No contact details"}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                      {acct.creditLimit && (
                        <div>
                          <p className="text-xs text-muted">Credit limit</p>
                          <p className="font-medium tabular-nums text-ink">{acct.creditLimit}</p>
                        </div>
                      )}
                      {acct.paymentTerms && (
                        <div>
                          <p className="text-xs text-muted">Payment terms</p>
                          <p className="font-medium text-ink">{acct.paymentTerms}</p>
                        </div>
                      )}
                      {acct.taxId && (
                        <div>
                          <p className="text-xs text-muted">Tax ID</p>
                          <p className="font-medium text-ink">{acct.taxId}</p>
                        </div>
                      )}
                    </div>

                    {acct.billingAddress && (
                      <p className="text-sm text-muted">{acct.billingAddress}</p>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {showCreate && scope !== null && (
        <Dialog
          open
          onClose={() => setShowCreate(false)}
          side="right"
          title="New corporate account"
          description="Create a company entity that guests can be linked to."
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowCreate(false)} disabled={busy}>Cancel</Button>
              <Button variant="primary" onClick={() => void handleCreate()} disabled={busy}>
                {busy ? "Saving…" : "Create account"}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <Field label="Company name" required>
              <TextInput
                value={draft.name}
                disabled={busy}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Acme Corp"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Code">
                <TextInput
                  value={draft.code}
                  disabled={busy}
                  onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                  placeholder="ACME"
                />
              </Field>
              <Field label="Contact name">
                <TextInput
                  value={draft.contactName}
                  disabled={busy}
                  onChange={(e) => setDraft({ ...draft, contactName: e.target.value })}
                  placeholder="John Smith"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone">
                <TextInput
                  value={draft.phone}
                  disabled={busy}
                  onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                  placeholder="+91 98765 43210"
                />
              </Field>
              <Field label="Email">
                <TextInput
                  type="email"
                  value={draft.email}
                  disabled={busy}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                  placeholder="contact@acme.com"
                />
              </Field>
            </div>
            <Field label="Billing address">
              <Textarea
                value={draft.billingAddress}
                disabled={busy}
                onChange={(e) => setDraft({ ...draft, billingAddress: e.target.value })}
                placeholder="Full billing address"
                rows={2}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tax ID">
                <TextInput
                  value={draft.taxId}
                  disabled={busy}
                  onChange={(e) => setDraft({ ...draft, taxId: e.target.value })}
                  placeholder="GSTIN"
                />
              </Field>
              <Field label="Credit limit">
                <TextInput
                  value={draft.creditLimit}
                  disabled={busy}
                  onChange={(e) => setDraft({ ...draft, creditLimit: e.target.value })}
                  placeholder="500000"
                />
              </Field>
            </div>
            <Field label="Payment terms">
              <TextInput
                value={draft.paymentTerms}
                disabled={busy}
                onChange={(e) => setDraft({ ...draft, paymentTerms: e.target.value })}
                placeholder="Net 30"
              />
            </Field>
          </div>
        </Dialog>
      )}
    </div>
  );
}
