import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  CircleSlash,
  KeyRound,
  ShieldCheck,
  Users,
} from "lucide-react";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { ArchiveDialog } from "@/components/ui/ArchiveDialog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { LoadingBlock } from "@/components/ui/Spinner";
import { SelectInput } from "@/components/ui/SelectInput";
import { StatusPill } from "@/components/ui/StatusPill";
import { useContextStore } from "@/state/context-store";
import {
  listPropertyAccess,
  listRoles,
  listGrants,
  assignRole,
  revokeRole,
  setOutletAccess,
  setPropertyAccess,
} from "@/domain/access/role-service";
import { listMembers } from "@/domain/access/people-service";
import { listProperties } from "@/domain/hierarchy/property-service";
import { listOutlets } from "@/domain/hierarchy/outlet-service";
import {
  OUTLET_ACCESS_MODES,
  PROPERTY_ACCESS_MODES,
  type EntityId,
  type Membership,
  type OutletAccessMode,
  type PropertyAccessMode,
  type Role,
  type RoleGrant,
  type ScopeLevel,
} from "@/domain/identity/types";
import { toPublicError, type PublicError } from "@/lib/errors";

/* ------------------------------------------------------------------ pure rules */

/**
 * Can this role be handed to a person at all?
 *
 * `assign_role` refuses a DEPARTMENT-scope role with `NIVAAS_DEPARTMENT_GRANTS_UNSUPPORTED`
 * because `my_permissions` resolves grants at organization, property and outlet level
 * only: a department grant would be stored yet silently confer nothing. A picker that
 * offered it would let the operator submit something the door will refuse, so the rule
 * is asserted here, outside the JSX, and reused by the invitation picker on the team
 * screen — an invited DEPARTMENT role suffers the exact same dead grant at accept time.
 */
export function roleGrantability(role: Role): { grantable: boolean; reason: string } {
  if (role.scopeLevel === "DEPARTMENT") {
    return {
      grantable: false,
      reason:
        "Department-scoped roles cannot be granted yet. Permission resolution stops at outlet level, so a department grant would be stored but confer nothing.",
    };
  }
  return { grantable: true, reason: "" };
}

/**
 * The door also insists the grant names the one site its scope points at: a PROPERTY role
 * without a property, or an OUTLET role without an outlet, is refused with
 * `NIVAAS_SCOPE_MISMATCH`. Returning the message here — rather than only after the write
 * fails — keeps the form from offering a submission the door will reject.
 */
export function grantScopeError(
  role: Role,
  target: { propertyId?: EntityId | null; outletId?: EntityId | null },
): string | null {
  const grantable = roleGrantability(role);
  if (!grantable.grantable) return grantable.reason;
  if (role.scopeLevel === "PROPERTY" && !target.propertyId) {
    return "Choose the property this role applies to.";
  }
  if (role.scopeLevel === "OUTLET" && !target.outletId) {
    return "Choose the outlet this role applies to.";
  }
  return null;
}

/**
 * Breadth replaces the whole set, and `set_property_access` / `set_outlet_access` refuse
 * a `SELECTED_*` mode with an empty list (`NIVAAS_EMPTY_SELECTION`). One rule covers both
 * levels because the mode strings share the `SELECTED_` prefix.
 */
export function breadthError(
  mode: PropertyAccessMode | OutletAccessMode,
  ids: readonly EntityId[],
): string | null {
  if (mode.startsWith("SELECTED") && ids.length === 0) {
    return "Select at least one item, or switch to all-access.";
  }
  return null;
}

/* ------------------------------------------------------------------ view helpers */

function formatDate(value: string | null): string {
  if (value === null) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : format(date, "d MMM yyyy");
}

const SCOPE_LABELS: Record<ScopeLevel, string> = {
  GLOBAL: "Global",
  ORGANIZATION: "Organization",
  PROPERTY: "Property",
  OUTLET: "Outlet",
  DEPARTMENT: "Department",
};

function scopeLabel(scope: ScopeLevel): string {
  return SCOPE_LABELS[scope];
}

/* ----------------------------------------------------------------------- screen */

/**
 * Roles & Access: what a person may be, and how far it reaches.
 *
 * Three sections on one route — the system roles, one person's grants, and one person's
 * site breadth — because breadth (which sites a person can see at all) and capability
 * (what they may do inside them) are two different questions the schema keeps separate.
 * A scoped grant narrows breadth automatically, so this screen reflects that rather than
 * duplicating a control that would only confuse.
 *
 * The permission matrix is deliberately not re-typed here. `listRoles` exposes the roles
 * and their scope; the role→permission catalogue lives in `006_seed_rbac.sql`, and the
 * only live answer to "may this person do X" is `my_permissions`, which the client reads
 * through the store. Rendering a second copy of the matrix in TypeScript is the exact
 * drift that made a donor UI offer buttons the database refused.
 */
export default function RolesPage() {
  // Subscribe so the screen re-renders when the context or permissions change; read the
  // live snapshot for values, because a static/server render only sees the hook's initial
  // snapshot. See the same note on TeamPage.
  useContextStore((s) => s);
  const { status, context, can } = useContextStore.getState();
  const organizationId = context.organizationId;

  const mayView = can("role.view");
  const mayAssign = can("role.assign");
  const mayManageProperty = can("property.manage_access");
  const mayManageOutlet = can("outlet.manage_access");

  const [roles, setRoles] = useState<Role[]>([]);
  const [members, setMembers] = useState<Membership[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<PublicError | null>(null);

  const [selectedUserId, setSelectedUserId] = useState<EntityId>("");
  const [grants, setGrants] = useState<RoleGrant[]>([]);
  const [loadingGrants, setLoadingGrants] = useState(false);

  const [properties, setProperties] = useState<{ id: EntityId; name: string }[]>([]);

  const [revokeTarget, setRevokeTarget] = useState<RoleGrant | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<PublicError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [showGrant, setShowGrant] = useState(false);
  const [grantRoleName, setGrantRoleName] = useState("");
  const [grantPropertyId, setGrantPropertyId] = useState<EntityId>("");
  const [grantOutletId, setGrantOutletId] = useState<EntityId>("");
  const [grantOutlets, setGrantOutlets] = useState<{ id: EntityId; name: string }[]>([]);

  const [propertyMode, setPropertyMode] = useState<PropertyAccessMode>("ALL_PROPERTIES");
  const [propertySelection, setPropertySelection] = useState<EntityId[]>([]);
  const [outletPropertyId, setOutletPropertyId] = useState<EntityId>("");
  const [outletMode, setOutletMode] = useState<OutletAccessMode>("ALL_OUTLETS");
  const [outletSelection, setOutletSelection] = useState<EntityId[]>([]);
  const [breadthOutlets, setBreadthOutlets] = useState<{ id: EntityId; name: string }[]>([]);

  // The reference reads that gate the whole screen. They run only once the server has
  // agreed to a tenant, and any failure surfaces inline rather than as a spinner forever.
  useEffect(() => {
    if (status !== "ready" || organizationId === null || !mayView) {
      setLoadingData(false);
      return;
    }
    let cancelled = false;
    setLoadingData(true);
    setLoadError(null);
    (async () => {
      try {
        const [roleRows, memberRows, propertyRows] = await Promise.all([
          listRoles(),
          listMembers(organizationId),
          listProperties({ organizationId }),
        ]);
        if (cancelled) return;
        setRoles(roleRows);
        setMembers(memberRows);
        setProperties(propertyRows.map((p) => ({ id: p.id, name: p.name })));
      } catch (error) {
        if (!cancelled) setLoadError(toPublicError(error));
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, organizationId, mayView]);

  const activeMembers = useMemo(
    () =>
      members
        .filter((m) => m.status === "ACTIVE")
        .map((m) => ({ id: m.userId, label: m.member?.fullName || m.member?.email || m.userId }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [members],
  );

  const selectedMember = useMemo(
    () => members.find((m) => m.userId === selectedUserId) ?? null,
    [members, selectedUserId],
  );

  const reloadGrants = useCallback(async () => {
    if (organizationId === null || selectedUserId === "") {
      setGrants([]);
      return;
    }
    setLoadingGrants(true);
    try {
      const rows = await listGrants({ organizationId, userId: selectedUserId });
      setGrants(rows);
    } catch (error) {
      setActionError(toPublicError(error));
    } finally {
      setLoadingGrants(false);
    }
  }, [organizationId, selectedUserId]);

  useEffect(() => {
    if (status === "ready" && organizationId !== null && selectedUserId !== "") {
      void reloadGrants();
      // Load the person's existing property breadth so the editor starts from truth.
      (async () => {
        try {
          const access = await listPropertyAccess(organizationId);
          const mine = access.filter((row) => row.userId === selectedUserId);
          const all = mine.some((row) => row.mode === "ALL_PROPERTIES");
          setPropertyMode(all ? "ALL_PROPERTIES" : "SELECTED_PROPERTIES");
          setPropertySelection(mine.map((row) => row.propertyId).filter((id): id is EntityId => id !== null));
        } catch {
          /* breadth is optional context; the editor still lets the operator set it */
        }
      })();
    } else {
      setGrants([]);
    }
  }, [status, organizationId, selectedUserId, reloadGrants]);

  // Outlet lists live one level below a property; when the target property changes, fetch
  // its outlets for both the grant sheet and the outlet breadth editor.
  useEffect(() => {
    if (organizationId === null) return;
    const wanted = outletPropertyId || grantPropertyId;
    if (wanted === "") {
      if (outletPropertyId === "") setBreadthOutlets([]);
      if (grantPropertyId === "") setGrantOutlets([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await listOutlets({ organizationId, propertyId: wanted });
        const shaped = rows.map((o) => ({ id: o.id, name: o.name }));
        if (cancelled) return;
        if (wanted === outletPropertyId) setBreadthOutlets(shaped);
        if (wanted === grantPropertyId) setGrantOutlets(shaped);
      } catch {
        /* the property may have no readable outlets; leave the picker empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, outletPropertyId, grantPropertyId]);

  async function runWrite(action: () => Promise<unknown>, successMessage: string): Promise<boolean> {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      setNotice(successMessage);
      return true;
    } catch (error) {
      setActionError(toPublicError(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const grantRole = roles.find((r) => r.name === grantRoleName) ?? null;
  const grantError =
    grantRole === null ? "Choose a role to grant." : grantScopeError(grantRole, {
      propertyId: grantPropertyId || null,
      outletId: grantOutletId || null,
    });

  const propertyBreadthError = breadthError(propertyMode, propertySelection);
  const outletBreadthError = breadthError(outletMode, outletSelection);

  /* --------------------------------------------------------------- honest states */

  if (status === "unconfigured") {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <PageHeader />
        <Card title="No backend configured" padded={false}>
          <div className="px-4 py-5 sm:px-5">
            <EmptyState
              icon={<CircleSlash aria-hidden />}
              title="Roles cannot be listed"
              description="This build has no backend configured, so there are no roles, grants or access
                settings to show. Connect a Supabase project to bring this screen to life."
            />
          </div>
        </Card>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <PageHeader />
        <Card title="Sign in required" padded={false}>
          <div className="px-4 py-5 sm:px-5">
            <EmptyState
              icon={<Users aria-hidden />}
              title="No active session"
              description="Roles and access belong to a signed-in tenant. Sign in to manage who can reach
                what — there is nothing to list until a session is resolved."
            />
          </div>
        </Card>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <PageHeader />
        <Card>
          <LoadingBlock label="Confirming your access to roles…" />
        </Card>
      </div>
    );
  }

  if (organizationId === null) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <PageHeader />
        <Card title="No organization selected" padded={false}>
          <div className="px-4 py-5 sm:px-5">
            <EmptyState
              icon={<CircleSlash aria-hidden />}
              title="Choose a tenant first"
              description="Roles are managed inside one organization. Select an active organization to see
                and change access."
            />
          </div>
        </Card>
      </div>
    );
  }

  if (!mayView) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <PageHeader />
        <AccessDenied capability="view roles and access" permission="role.view" />
      </div>
    );
  }

  const grantColumns: DataColumn<RoleGrant>[] = [
    {
      key: "role",
      header: "Role",
      render: (grant) => (
        <span className="font-medium text-ink">{grant.role?.displayName ?? "Role not shown"}</span>
      ),
    },
    {
      key: "scope",
      header: "Scope",
      render: (grant) => (
        <Badge tone="neutral">{grant.role ? scopeLabel(grant.role.scopeLevel) : "—"}</Badge>
      ),
    },
    {
      key: "granted",
      header: "Granted",
      render: (grant) => <span className="text-muted">{formatDate(grant.grantedAt)}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (grant) => (
        <Button
          size="sm"
          variant="ghost"
          disabled={!mayAssign || busy}
          title={mayAssign ? "Revoke this grant" : "Requires role.assign"}
          onClick={() => {
            setRevokeTarget(grant);
            setActionError(null);
          }}
        >
          Revoke
        </Button>
      ),
    },
  ];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:gap-6">
      <PageHeader />

      {loadError !== null && (
        <InlineError error={loadError} onRetry={() => setSelectedUserId((v) => v)} />
      )}
      {actionError !== null && (
        <InlineError error={actionError} onRetry={() => setActionError(null)} />
      )}
      {notice !== null && (
        <p role="status" className="rounded-md border border-[#cfe4d6] bg-success-soft px-3 py-2 text-xs text-success">
          {notice}
        </p>
      )}

      <Card
        title="System roles"
        description="The catalogue the database seeds. Scope is the deepest level a role can be granted at."
        padded={false}
      >
        {loadingData ? (
          <div className="px-4 py-4">
            <LoadingBlock rows={4} />
          </div>
        ) : (
          <DataTable
            columns={roleColumns}
            rows={roles}
            rowKey={(role) => role.id}
            empty={
              <EmptyState
                icon={<ShieldCheck aria-hidden />}
                title="No system roles"
                description="No active system roles have been seeded in this database."
              />
            }
          />
        )}
        <p className="px-4 py-3 text-xs leading-relaxed text-muted sm:px-5">
          The role→permission matrix is defined once in{" "}
          <code className="rounded-sm bg-surface-sunken px-1 py-0.5">db/supabase/006_seed_rbac.sql</code>.
          The client reads live capabilities through{" "}
          <code className="rounded-sm bg-surface-sunken px-1 py-0.5">my_permissions</code>, so this screen
          never keeps a second copy that could drift from the door.
        </p>
      </Card>

      <Card title="People & grants" description="Pick a person to see what they hold and what they can reach.">
        <Field label="Person" hint="Only active members can hold a role grant or an access setting.">
          <SelectInput
            value={selectedUserId}
            onChange={setSelectedUserId}
            placeholder="Select a person…"
            options={activeMembers.map((m) => ({ value: m.id, label: m.label }))}
          />
        </Field>

        {selectedUserId === "" ? (
          <p className="mt-4 text-xs text-muted">Select a person to load their grants.</p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-ink">Role grants</h4>
              <Button
                size="sm"
                variant="primary"
                icon={<KeyRound className="size-4" aria-hidden />}
                disabled={!mayAssign}
                title={mayAssign ? "Grant a role" : "Requires role.assign"}
                onClick={() => {
                  setShowGrant(true);
                  setGrantRoleName("");
                  setGrantPropertyId("");
                  setGrantOutletId("");
                  setActionError(null);
                }}
              >
                Grant role
              </Button>
            </div>

            <div className="mt-3">
              {loadingGrants ? (
                <LoadingBlock rows={3} />
              ) : (
                <DataTable
                  columns={grantColumns}
                  rows={grants}
                  rowKey={(grant) => grant.id}
                  empty={
                    <EmptyState
                      icon={<ShieldCheck aria-hidden />}
                      title="No active grants"
                      description="This person holds no role grants in the current organization. Revoked
                        grants stay in the trail and are not shown here."
                    />
                  }
                />
              )}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Revoking a grant stamps a <span className="font-medium text-ink">revoked_at</span> timestamp;
              it never deletes the row, so the history remains answerable.
            </p>
          </>
        )}
      </Card>

      {selectedUserId !== "" && (
        <Card
          title="Site breadth"
          description="Which sites this person can see at all — separate from what they may do inside them."
        >
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-ink">Properties</h4>
                <Button
                  size="sm"
                  disabled={!mayManageProperty || busy || propertyBreadthError !== null}
                  title={mayManageProperty ? "Update property access" : "Requires property.manage_access"}
                  onClick={() => {
                    if (organizationId === null || propertyBreadthError !== null) return;
                    void runWrite(
                      () =>
                        setPropertyAccess({
                          userId: selectedUserId,
                          organizationId,
                          mode: propertyMode,
                          propertyIds: propertyMode === "SELECTED_PROPERTIES" ? propertySelection : [],
                          reason: "Updated from the access screen.",
                        }),
                      "Property access updated.",
                    ).then((ok) => ok && void reloadGrants());
                  }}
                >
                  Save property access
                </Button>
              </div>
              <p className="text-xs leading-relaxed text-muted">
                Granting a PROPERTY or OUTLET role narrows breadth to that site automatically — you do not
                need to add it twice here.
              </p>
              <SelectInput
                value={propertyMode}
                onChange={(v) => setPropertyMode(v)}
                options={PROPERTY_ACCESS_MODES.map((mode) => ({
                  value: mode,
                  label: mode === "ALL_PROPERTIES" ? "All properties (including future ones)" : "Selected properties",
                }))}
              />
              {propertyMode === "SELECTED_PROPERTIES" && (
                <div className="flex flex-col gap-1.5">
                  {properties.map((property) => (
                    <Checkbox
                      key={property.id}
                      label={property.name}
                      checked={propertySelection.includes(property.id)}
                      onChange={(checked) =>
                        setPropertySelection((prev) =>
                          checked ? [...prev, property.id] : prev.filter((id) => id !== property.id),
                        )
                      }
                    />
                  ))}
                  {propertyBreadthError !== null && (
                    <p className="text-xs text-danger">{propertyBreadthError}</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 border-t border-line pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-ink">Outlets (within one property)</h4>
                <Button
                  size="sm"
                  disabled={
                    !mayManageOutlet ||
                    busy ||
                    outletPropertyId === "" ||
                    outletBreadthError !== null
                  }
                  title={mayManageOutlet ? "Update outlet access" : "Requires outlet.manage_access"}
                  onClick={() => {
                    if (outletPropertyId === "" || outletBreadthError !== null) return;
                    void runWrite(
                      () =>
                        setOutletAccess({
                          userId: selectedUserId,
                          propertyId: outletPropertyId,
                          mode: outletMode,
                          outletIds: outletMode === "SELECTED_OUTLETS" ? outletSelection : [],
                          reason: "Updated from the access screen.",
                        }),
                      "Outlet access updated.",
                    );
                  }}
                >
                  Save outlet access
                </Button>
              </div>
              <SelectInput
                value={outletPropertyId}
                onChange={setOutletPropertyId}
                placeholder="Choose a property…"
                options={properties.map((p) => ({ value: p.id, label: p.name }))}
              />
              {outletPropertyId !== "" && (
                <SelectInput
                  value={outletMode}
                  onChange={(v) => setOutletMode(v)}
                  options={OUTLET_ACCESS_MODES.map((mode) => ({
                    value: mode,
                    label: mode === "ALL_OUTLETS" ? "All outlets in this property" : "Selected outlets",
                  }))}
                />
              )}
              {outletPropertyId !== "" && outletMode === "SELECTED_OUTLETS" && (
                <div className="flex flex-col gap-1.5">
                  {breadthOutlets.map((outlet) => (
                    <Checkbox
                      key={outlet.id}
                      label={outlet.name}
                      checked={outletSelection.includes(outlet.id)}
                      onChange={(checked) =>
                        setOutletSelection((prev) =>
                          checked ? [...prev, outlet.id] : prev.filter((id) => id !== outlet.id),
                        )
                      }
                    />
                  ))}
                  {outletBreadthError !== null && (
                    <p className="text-xs text-danger">{outletBreadthError}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      <Dialog
        open={showGrant}
        onClose={() => setShowGrant(false)}
        side="right"
        title="Grant a role"
        description={`For ${selectedMember?.member?.fullName ?? selectedMember?.member?.email ?? "this person"}.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowGrant(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!mayAssign || busy || grantError !== null}
              onClick={async () => {
                if (organizationId === null || grantRole === null || grantError !== null) return;
                const ok = await runWrite(
                  () =>
                    assignRole({
                      userId: selectedUserId,
                      role: grantRole.name,
                      organizationId,
                      propertyId: grantRole.scopeLevel === "PROPERTY" ? grantPropertyId || null : null,
                      outletId: grantRole.scopeLevel === "OUTLET" ? grantOutletId || null : null,
                      reason: "Granted from the roles screen.",
                    }),
                  `${grantRole.displayName} granted.`,
                );
                if (ok) {
                  setShowGrant(false);
                  void reloadGrants();
                }
              }}
            >
              {busy ? "Granting…" : "Grant role"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Role" hint="Department-scope roles cannot be granted yet and are not offered.">
            <SelectInput
              value={grantRoleName}
              onChange={setGrantRoleName}
              placeholder="Choose a role…"
              options={roles
                .filter((role) => roleGrantability(role).grantable)
                .map((role) => ({
                  value: role.name,
                  label: `${role.displayName} · ${scopeLabel(role.scopeLevel)}`,
                }))}
            />
          </Field>

          {grantRole?.scopeLevel === "PROPERTY" && (
            <Field label="Property" required>
              <SelectInput
                value={grantPropertyId}
                onChange={(v) => {
                  setGrantPropertyId(v);
                  setGrantOutletId("");
                }}
                placeholder="Choose a property…"
                options={properties.map((p) => ({ value: p.id, label: p.name }))}
              />
            </Field>
          )}

          {grantRole?.scopeLevel === "OUTLET" && (
            <>
              <Field label="Property" required>
                <SelectInput
                  value={grantPropertyId}
                  onChange={(v) => {
                    setGrantPropertyId(v);
                    setGrantOutletId("");
                  }}
                  placeholder="Choose a property…"
                  options={properties.map((p) => ({ value: p.id, label: p.name }))}
                />
              </Field>
              <Field label="Outlet" required>
                <SelectInput
                  value={grantOutletId}
                  onChange={setGrantOutletId}
                  placeholder="Choose an outlet…"
                  options={grantOutlets.map((o) => ({ value: o.id, label: o.name }))}
                />
              </Field>
            </>
          )}

          <p className="text-xs leading-relaxed text-muted">
            Granting a scoped role also makes that site reachable: the door writes the matching property /
            outlet breadth alongside the grant, so a manager seat is never stranded behind an invisible site.
          </p>
          {grantError !== null && grantRoleName !== "" && (
            <p className="text-xs text-danger">{grantError}</p>
          )}
        </div>
      </Dialog>

      <ArchiveDialog
        open={revokeTarget !== null}
        onClose={() => setRevokeTarget(null)}
        entityName={revokeTarget?.role?.displayName ?? "grant"}
        entityLabel="grant"
        consequences={[
          "The person loses what this role lets them do.",
          "The grant is stamped revoked, not deleted — the trail is kept.",
          "Breadth already granted to that site stays until you narrow it above.",
        ]}
        loading={busy}
        onConfirm={async (reason) => {
          if (revokeTarget === null) return;
          const ok = await runWrite(
            () => revokeRole(revokeTarget.id, reason),
            "Grant revoked.",
          );
          if (ok) {
            setRevokeTarget(null);
            void reloadGrants();
          }
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------- role catalogue */

const roleColumns: DataColumn<Role>[] = [
  { key: "name", header: "Name", render: (role) => <span className="font-medium text-ink">{role.displayName}</span> },
  { key: "code", header: "Key", render: (role) => <code className="text-xs text-muted">{role.name}</code> },
  {
    key: "scope",
    header: "Scope",
    render: (role) => (
      <Badge tone={role.scopeLevel === "DEPARTMENT" ? "warning" : "neutral"}>
        {scopeLabel(role.scopeLevel)}
      </Badge>
    ),
  },
  {
    key: "status",
    header: "Availability",
    render: (role) =>
      roleGrantability(role).grantable ? (
        <StatusPill status={role.status} />
      ) : (
        <Badge tone="warning">Not grantable</Badge>
      ),
  },
];

/* ------------------------------------------------------------------- primitives */

function PageHeader() {
  return (
    <header>
      <h2 className="text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">Roles &amp; Access</h2>
      <p className="mt-1 text-sm text-muted">
        Who may be what, and how far their access reaches across the estate.
      </p>
    </header>
  );
}

function InlineError({ error, onRetry }: { error: PublicError; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#f2d4d1] bg-danger-soft px-3 py-2 text-xs text-danger"
    >
      <span>{error.message}</span>
      <Button size="sm" variant="secondary" onClick={onRetry}>
        Dismiss
      </Button>
    </div>
  );
}
