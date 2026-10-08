/**
 * CRM Loyalty — loyalty programs and their tier structure.
 *
 * Shows programs with earning/redemption status and their tiers. Creating a
 * program is supported; tier management and account operations are foundation-only
 * (the append-only transaction ledger is wired but UI for enrolling customers
 * is deferred to a follow-up).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleSlash, LogIn, Plus, Star } from "lucide-react";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { LoadingBlock } from "@/components/ui/Spinner";
import { TextInput } from "@/components/ui/TextInput";
import { Textarea } from "@/components/ui/Textarea";
import { can, type ActiveContext } from "@/domain/identity/types";
import type { LoyaltyProgram, LoyaltyTier } from "@/domain/crm/types";
import { listLoyaltyPrograms, listLoyaltyTiers, createLoyaltyProgram, type CrmScope } from "@/domain/crm/crm-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

type LoyaltyView =
  | "bootstrapping"
  | "unconfigured"
  | "unauthenticated"
  | "no_organization"
  | "scoped";

function pageStatusFor(status: ContextStatus, context: ActiveContext): LoyaltyView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") {
    return context.organizationId !== null ? "scoped" : "no_organization";
  }
  return "bootstrapping";
}

type ProgramDraft = {
  name: string;
  description: string;
  pointsName: string;
};

function newDraft(): ProgramDraft {
  return {
    name: "",
    description: "",
    pointsName: "Points",
  };
}

export default function LoyaltyPage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const scope = useMemo<CrmScope | null>(
    () => (context.organizationId !== null ? { organizationId: context.organizationId } : null),
    [context.organizationId],
  );

  const canView = can("crm.loyalty.view", permissions);
  const canManage = can("crm.loyalty.manage", permissions);

  const [programs, setPrograms] = useState<LoyaltyProgram[] | null>(null);
  const [tiersByProgram, setTiersByProgram] = useState<Map<string, LoyaltyTier[]>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<ProgramDraft>(newDraft);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || scope === null || !canView) return;
    let ignore = false;
    setPrograms(null);
    setError(null);

    listLoyaltyPrograms(scope)
      .then(async (progs) => {
        if (ignore) return;
        setPrograms(progs);

        const tierMap = new Map<string, LoyaltyTier[]>();
        for (const prog of progs) {
          const tiers = await listLoyaltyTiers(scope, prog.id).catch(() => []);
          tierMap.set(prog.id, tiers);
        }
        if (!ignore) setTiersByProgram(tierMap);
      })
      .catch((err) => {
        if (!ignore) setError(toPublicError(err).message);
      });

    return () => {
      ignore = true;
    };
  }, [view, scope, canView, reloadTick]);

  const handleCreate = async () => {
    if (scope === null || draft.name.trim() === "") return;
    setBusy(true);
    try {
      await createLoyaltyProgram(scope, {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        pointsName: draft.pointsName.trim() || "Points",
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
          <Star className="size-5 shrink-0 text-brand-600" aria-hidden />
          Loyalty
        </h2>
        <p className="mt-1 text-sm text-muted">
          Loyalty programs with tiered benefits. Points are tracked in an append-only ledger.
        </p>
      </header>

      {view === "bootstrapping" && <LoadingBlock label="Loading your workspace…" />}

      {view === "unconfigured" && (
        <EmptyState icon={<CircleSlash aria-hidden />} title="Backend not configured" description="This build has no backend configured." />
      )}

      {view === "unauthenticated" && (
        <EmptyState icon={<LogIn aria-hidden />} title="Sign in to view loyalty" description="There is no active session for this build to read a tenant from." />
      )}

      {view === "no_organization" && (
        <EmptyState icon={<Star aria-hidden />} title="Choose an organization first" description="Loyalty programs belong to an organization." />
      )}

      {view === "scoped" && scope !== null && !canView && (
        <AccessDenied capability="view loyalty" permission="crm.loyalty.view" />
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
                {canManage && (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Plus className="size-4" aria-hidden />}
                    onClick={() => setShowCreate(true)}
                  >
                    New program
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={reload}>Reload</Button>
              </div>
            }
          >
            <p className="text-xs text-muted">
              {programs === null ? "Loading…" : `${programs.length} program${programs.length === 1 ? "" : "s"}`}
            </p>
          </Card>

          {programs === null ? (
            <LoadingBlock label="Reading loyalty programs…" />
          ) : programs.length === 0 ? (
            <EmptyState
              icon={<Star aria-hidden />}
              title="No loyalty programs"
              description="Create a loyalty program to start rewarding customers."
              action={
                canManage ? (
                  <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setShowCreate(true)}>
                    Create first program
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="flex flex-col gap-4">
              {programs.map((prog) => {
                const tiers = tiersByProgram.get(prog.id) ?? [];
                return (
                  <Card key={prog.id}>
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-base font-semibold text-ink">{prog.name}</h3>
                          {prog.description && (
                            <p className="mt-0.5 text-sm text-muted">{prog.description}</p>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={prog.earningEnabled ? "success" : "muted"}>
                            {prog.earningEnabled ? "Earning on" : "Earning off"}
                          </Badge>
                          <Badge tone={prog.redemptionEnabled ? "success" : "muted"}>
                            {prog.redemptionEnabled ? "Redemption on" : "Redemption off"}
                          </Badge>
                          <Badge tone={prog.status === "ACTIVE" ? "brand" : "muted"}>
                            {prog.status}
                          </Badge>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                        <div>
                          <p className="text-xs text-muted">Currency</p>
                          <p className="font-medium text-ink">{prog.currency}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted">Points name</p>
                          <p className="font-medium text-ink">{prog.pointsName}</p>
                        </div>
                        {prog.pointsPerAmount && (
                          <div>
                            <p className="text-xs text-muted">Points per amount</p>
                            <p className="font-medium tabular-nums text-ink">{prog.pointsPerAmount}</p>
                          </div>
                        )}
                        {prog.minimumSpend && (
                          <div>
                            <p className="text-xs text-muted">Minimum spend</p>
                            <p className="font-medium tabular-nums text-ink">{prog.minimumSpend}</p>
                          </div>
                        )}
                      </div>

                      {tiers.length > 0 && (
                        <div>
                          <p className="mb-2 text-xs font-medium text-muted">Tiers</p>
                          <div className="flex flex-wrap gap-2">
                            {tiers.map((tier) => (
                              <div
                                key={tier.id}
                                className="rounded-lg border border-line px-3 py-2 text-sm"
                              >
                                <p className="font-medium text-ink">{tier.name}</p>
                                <p className="text-xs text-muted">Rank {tier.rank}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {showCreate && scope !== null && (
        <Dialog
          open
          onClose={() => setShowCreate(false)}
          side="right"
          title="New loyalty program"
          description="Create a loyalty program. Tiers and accounts are added afterwards."
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowCreate(false)} disabled={busy}>Cancel</Button>
              <Button variant="primary" onClick={() => void handleCreate()} disabled={busy}>
                {busy ? "Saving…" : "Create program"}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <Field label="Program name" required>
              <TextInput
                value={draft.name}
                disabled={busy}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Gold Rewards"
              />
            </Field>
            <Field label="Points name">
              <TextInput
                value={draft.pointsName}
                disabled={busy}
                onChange={(e) => setDraft({ ...draft, pointsName: e.target.value })}
                placeholder="Points"
              />
            </Field>
            <Field label="Description">
              <Textarea
                value={draft.description}
                disabled={busy}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="Describe the program"
                rows={3}
              />
            </Field>
          </div>
        </Dialog>
      )}
    </div>
  );
}
