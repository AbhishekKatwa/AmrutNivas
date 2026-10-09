import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  CircleSlash,
  KeyRound,
  Plus,
  ShieldCheck,
  Users,
} from "lucide-react";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { archiveActionState, ArchiveDialog } from "@/components/ui/ArchiveDialog";
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
import { Textarea } from "@/components/ui/Textarea";
import { TextInput } from "@/components/ui/TextInput";
import { useContextStore } from "@/state/context-store";
import {
  listPropertyAccess,
  listRoles,
  listGrants,
  listRolePermissions,
  listTenantRoles,
  assignRole,
  revokeRole,
  setOutletAccess,
  setPropertyAccess,
} from "@/domain/access/role-service";
import {
  CREATABLE_SCOPE_LEVELS,
  createRole,
  grantablePermissions,
  roleIsEditable,
  roleNameIsValid,
  setRolePermissions,
  setRoleStatus,
  updateRole,
  type CreateRoleInput,
} from "@/domain/access/custom-role-service";
import { listMembers } from "@/domain/access/people-service";
import { listProperties } from "@/domain/hierarchy/property-service";
import { listOutlets } from "@/domain/hierarchy/outlet-service";
import {
  describePermission,
  permissionsByDomain,
} from "@/domain/identity/permissions";
import {
  OUTLET_ACCESS_MODES,
  PROPERTY_ACCESS_MODES,
  type EntityId,
  type Membership,
  type OutletAccessMode,
  type Permission,
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

/* --------------------------------------------------------------- §65 role views */

/**
 * What kind of role this is, from the column 011 introduced rather than from a name.
 *
 * `is_system` is the database's own distinction between the platform's catalogue and a
 * tenant's authoring. A name check is not equivalent: 011 made role NAMES unique per tenant,
 * so two organizations can each own a `NIGHT_AUDITOR`, and the platform's seeded set changes
 * with a migration while this rule must not.
 */
export function roleKind(role: Pick<Role, "isSystem">): "System" | "Custom" {
  return role.isSystem ? "System" : "Custom";
}

/**
 * Which §65 columns a role row needs, and which actions it may offer.
 *
 * Everything here derives from stored facts. `mutate` is deliberately TWO conditions and not
 * one: 011 gates its three editing doors on `role.edit` but `create_role` on `role.create`,
 * so a tenant could hold one and not the other, and a screen that conflated them would render
 * a button whose door is guaranteed to refuse it.
 */
export type RoleRowView = {
  kind: "System" | "Custom";
  /** Retired by `set_role_status`; still holds grants, which is why §53 keeps it listed. */
  retired: boolean;
  /** What it means, as permission keys grouped by domain. Never a checkbox grid. */
  groups: readonly PermissionGroup[];
  /** Distinct people holding a live grant of this role in this tenant. */
  users: number;
  canEdit: boolean;
  canRetire: boolean;
};

export function roleRowView(
  role: Role,
  permissions: readonly Permission[],
  users: number,
  capabilities: { canCreate: boolean; canEdit: boolean },
): RoleRowView {
  const editable = roleIsEditable(role);
  return {
    kind: roleKind(role),
    retired: role.status !== "ACTIVE",
    groups: groupPermissionKeys(permissions),
    users,
    canEdit: editable && capabilities.canEdit,
    canRetire: editable && capabilities.canEdit,
  };
}

/** A run of permission keys under the domain the catalogue already groups them by. */
export type PermissionGroup = {
  domain: string;
  keys: readonly Permission[];
};

/**
 * The role's permissions as a plain grouped list — §65's explicit "avoid a massive
 * enterprise permission matrix at this stage".
 *
 * Order comes from `permissionsByDomain()`, the catalogue's own grouping, so two screens show
 * the same role identically. A key the catalogue does not know (seeded by a migration this
 * build has not caught up with) is not dropped: it lands in an `Unrecognised` group, because
 * silently hiding an authority the database has granted is the one way a permissions screen
 * can mislead a reviewer into believing a role is smaller than it is.
 */
export function groupPermissionKeys(permissions: readonly Permission[]): PermissionGroup[] {
  const remaining = new Set(permissions);
  const groups: PermissionGroup[] = [];
  for (const domain of permissionsByDomain()) {
    const keys = domain.permissions
      .map((entry) => entry.key)
      .filter((key) => remaining.delete(key));
    if (keys.length > 0) groups.push({ domain: domain.domain, keys });
  }
  if (remaining.size > 0) {
    groups.push({ domain: "unrecognised", keys: [...remaining].sort() });
  }
  return groups;
}

/** The label for a group heading: `stock_adjust` reads as "Stock adjust". */
export function permissionDomainLabel(domain: string): string {
  if (domain === "unrecognised") return "Unrecognised";
  return domain
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/* ---------------------------------------------------------- create / edit a role */

/** The raw create sheet, before it becomes a `create_role` call. */
export type CreateRoleFormValues = {
  organizationId: EntityId;
  name: string;
  displayName: string;
  description: string;
  scopeLevel: CreateRoleInput["scopeLevel"];
  permissions: readonly Permission[];
  reason: string;
};

export type CreateRoleFieldErrors = {
  name?: string;
  displayName?: string;
  scopeLevel?: string;
  permissions?: string;
  reason?: string;
};

export type CreateRoleDoorResult =
  | { ok: true; input: CreateRoleInput }
  | { ok: false; errors: CreateRoleFieldErrors };

/**
 * The sheet as it opens: nothing chosen, scope unset.
 *
 * `organizationId` is a placeholder because a module constant cannot know the tenant; the
 * submit path reads the live context and the store's guard (`organizationId === null`) runs
 * before the door is ever called.
 */
const EMPTY_CREATE_FORM: CreateRoleFormValues = {
  organizationId: "",
  name: "",
  displayName: "",
  description: "",
  scopeLevel: "ORGANIZATION",
  permissions: [],
  reason: "",
};

/**
 * Turn the create sheet into exactly what `create_role` accepts, or the field errors that
 * prove it is not ready.
 *
 * The door collapses two different mistakes into one token (`NIVAAS_INVALID_NAME` covers a bad
 * pattern AND a blank display name), so a form that only posts and waits cannot tell the
 * operator which half they got wrong. Splitting them here is the whole reason this function
 * exists; the door's check remains the one that counts.
 *
 * Note what is NOT validated: whether a chosen permission is one the actor may grant. That is
 * `app.ungrantable_permission`'s job against the live session, and a client-side answer would
 * be a guess about a ceiling the browser cannot see.
 */
export function buildCreateRoleDoorInput(
  values: Pick<
    CreateRoleFormValues,
    "organizationId" | "name" | "displayName" | "description" | "scopeLevel" | "permissions" | "reason"
  >,
): CreateRoleDoorResult {
  const errors: CreateRoleFieldErrors = {};

  const name = values.name.trim().toUpperCase();
  if (name === "") errors.name = "A role key is required.";
  else if (!roleNameIsValid(name)) {
    errors.name =
      "Use 3–40 characters: a capital letter, then capitals, digits or underscores.";
  }

  if (values.displayName.trim() === "") {
    errors.displayName = "An administrator-facing label is required.";
  }

  if (!CREATABLE_SCOPE_LEVELS.includes(values.scopeLevel)) {
    errors.scopeLevel = "A tenant role can reach an organization, a property or an outlet.";
  }

  if (values.permissions.length === 0) {
    errors.permissions = "Choose at least one permission.";
  }

  if (values.reason.trim() === "") {
    errors.reason = "A reason is required and recorded in the audit trail.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    input: {
      organizationId: values.organizationId,
      name,
      displayName: values.displayName.trim(),
      description: values.description.trim() === "" ? null : values.description.trim(),
      scopeLevel: values.scopeLevel,
      permissions: [...values.permissions].sort(),
      reason: values.reason.trim(),
    },
  };
}

/**
 * The permission keys a create/edit sheet may offer.
 *
 * The catalogue, narrowed to what the session actually holds — so an operator never ticks a
 * box the door will refuse. It is an aid, never a control: 011 re-derives the ceiling from the
 * session on every call, and this list is computed from a `my_permissions` read that may be
 * moments old.
 */
export function selectablePermissions(held: readonly Permission[]): Permission[] {
  return grantablePermissions(held, [...allCatalogueKeys()]);
}

/** Catalogue keys, cached: the list is a module constant, so it cannot go stale per render. */
let catalogueKeysCache: readonly Permission[] | null = null;
function allCatalogueKeys(): readonly Permission[] {
  if (catalogueKeysCache === null) {
    catalogueKeysCache = permissionsByDomain().flatMap((group) =>
      group.permissions.map((entry) => entry.key),
    );
  }
  return catalogueKeysCache;
}

/** Number of people holding a live grant of each role. Revoked grants are not counted. */
export function usersByRole(grants: readonly RoleGrant[]): Map<EntityId, number> {
  const holders = new Map<EntityId, Set<EntityId>>();
  for (const grant of grants) {
    if (grant.revokedAt !== null) continue;
    const set = holders.get(grant.roleId) ?? new Set<EntityId>();
    set.add(grant.userId);
    holders.set(grant.roleId, set);
  }
  return new Map([...holders].map(([roleId, set]) => [roleId, set.size]));
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
  const { status, context, permissions, can } = useContextStore.getState();
  const organizationId = context.organizationId;

  const mayView = can("role.view");
  const mayAssign = can("role.assign");
  const mayManageProperty = can("property.manage_access");
  const mayManageOutlet = can("outlet.manage_access");
  // 011's two custom-role capabilities, read as capabilities and never as role names: a
  // tenant's `NIGHT_AUDITOR` is not a signal about who may create one.
  const mayCreateRole = can("role.create");
  const mayEditRole = can("role.edit");

  const [roles, setRoles] = useState<Role[]>([]);
  const [tenantRoles, setTenantRoles] = useState<Role[]>([]);
  // Named apart from the imported `setRolePermissions` door so the two never collide: the
  // state setter holds the role→permission read, the service call writes to it.
  const [rolePermissions, setRolePermissionsById] = useState<Map<EntityId, Permission[]>>(new Map());
  const [allGrants, setAllGrants] = useState<RoleGrant[]>([]);
  const [members, setMembers] = useState<Membership[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<PublicError | null>(null);

  const [selectedUserId, setSelectedUserId] = useState<EntityId>("");
  const [grants, setGrants] = useState<RoleGrant[]>([]);
  const [loadingGrants, setLoadingGrants] = useState(false);

  const [properties, setProperties] = useState<{ id: EntityId; name: string }[]>([]);

  const [revokeTarget, setRevokeTarget] = useState<RoleGrant | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
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

  // ---- §65 custom-role sheet. One dialog, three doors: `update_role` for the label,
  // `set_role_permissions` for the grants, `set_role_status` for retiring. They are separate
  // because 011 separates them — a rename must not be able to smuggle in a widening.
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateRoleFormValues>(EMPTY_CREATE_FORM);
  const [createErrors, setCreateErrors] = useState<CreateRoleFieldErrors>({});

  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPermissions, setEditPermissions] = useState<Permission[]>([]);
  const [editReason, setEditReason] = useState("");
  const [retireTarget, setRetireTarget] = useState<Role | null>(null);

  // Re-reads the reference data that gates the whole screen. Runs once on load AND after
  // every §65 write (create / setRolePermissions / setRoleStatus / revoke) so a rename, a
  // widened role, or a fresh grant cannot leave a stale row on the operator's screen.
  const refreshRoles = useCallback(async () => {
    if (organizationId === null) return;
    try {
      const [roleRows, tenantRoleRows, grantRows] = await Promise.all([
        listRoles(),
        listTenantRoles(organizationId),
        listGrants({ organizationId }),
      ]);
      setRoles(roleRows);
      setTenantRoles(tenantRoleRows);
      setAllGrants(grantRows);

      // §65's Permissions column, from `role_permissions` — 003's `role_permissions_read`
      // is "whoever may see a role may see what it grants", so this is a plain SELECT with
      // no door behind it. It is a SECOND round trip on purpose: a nested select would
      // arrive half-mapped, and a role's authority is the last thing to guess at.
      const every = [...roleRows, ...tenantRoleRows];
      const permissionRows = await listRolePermissions(every.map((role) => role.id));
      const grouped = new Map<EntityId, Permission[]>();
      for (const row of permissionRows) {
        const bucket = grouped.get(row.roleId) ?? [];
        bucket.push(row.permission);
        grouped.set(row.roleId, bucket);
      }
      setRolePermissionsById(grouped);
    } catch (error) {
      setLoadError(toPublicError(error));
    }
  }, [organizationId]);

  // The initial read also fetches the people + property list; both live alongside the roles
  // but do not need to be re-read after every role write.
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
        const [memberRows, propertyRows] = await Promise.all([
          listMembers(organizationId),
          listProperties({ organizationId }),
        ]);
        if (cancelled) return;
        setMembers(memberRows);
        setProperties(propertyRows.map((p) => ({ id: p.id, name: p.name })));
        await refreshRoles();
      } catch (error) {
        if (!cancelled) setLoadError(toPublicError(error));
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, organizationId, mayView, refreshRoles]);

  /** §65's one table: the platform's catalogue and this tenant's own authoring, side by side. */
  const everyRole = useMemo(
    () => [...roles, ...tenantRoles].sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [roles, tenantRoles],
  );

  const grantCounts = useMemo(() => usersByRole(allGrants), [allGrants]);

  /** What the session holds, straight from the store's `my_permissions` read. */
  const heldPermissions = useMemo<Permission[]>(
    () => [...(permissions?.permissions ?? [])],
    [permissions],
  );

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
          // No breadth rows means the person was never narrowed: every org-scoped path
          // (create_organization §19, assign_role) writes ALL_PROPERTIES, and the doors
          // refuse an empty SELECTED set — so "zero rows" can never truthfully mean
          // "narrowed to nothing". Defaulting to SELECTED+empty rendered a pristine
          // validation error and a dead Save for provisioned owners.
          setPropertyMode(mine.length === 0 || all ? "ALL_PROPERTIES" : "SELECTED_PROPERTIES");
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

  // The revoke-grant confirmation. Named after its subject so `archiveActionState` (the same
  // reason-gate the retire flow uses) can require both a subject and a reason before the
  // door is ever called. `revokeRole` maps 1:1 to `revoke_role(grant, reason)`.
  const revokeEntityName =
    revokeTarget === null
      ? ""
      : `${revokeTarget.role?.displayName ?? "grant"} — ${
          selectedMember?.member?.fullName ??
          selectedMember?.member?.email ??
          "this person"
        }`;
  const revokeConfirm = archiveActionState(revokeReason, revokeEntityName);

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

  const roleColumns = buildRoleColumns({
    permissionsFor: (role) => rolePermissions.get(role.id) ?? [],
    usersFor: (role) => grantCounts.get(role.id) ?? 0,
    canCreate: mayCreateRole,
    canEdit: mayEditRole,
    onEdit: (role) => {
      setEditingRole(role);
      setEditDisplayName(role.displayName);
      setEditDescription(role.description ?? "");
      setEditPermissions([...(rolePermissions.get(role.id) ?? [])].sort());
      setEditReason("");
      setActionError(null);
    },
    onRetire: (role) => {
      setRetireTarget(role);
      setActionError(null);
    },
  });

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
            setRevokeReason("");
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
        title="Roles"
        description={
          "The platform's catalogue and this organization's own roles. Scope is the deepest level a role can be granted at."
        }
        padded={false}
        actions={
          mayCreateRole ? (
            <Button
              size="sm"
              variant="primary"
              icon={<Plus className="size-4" aria-hidden />}
              onClick={() => {
                setCreateForm({ ...EMPTY_CREATE_FORM, organizationId: organizationId });
                setCreateErrors({});
                setShowCreate(true);
              }}
            >
              New role
            </Button>
          ) : (
            <Badge tone="neutral">Catalogue only</Badge>
          )
        }
      >
        {loadingData ? (
          <div className="px-4 py-4">
            <LoadingBlock rows={4} />
          </div>
        ) : (
          <DataTable
            columns={roleColumns}
            rows={everyRole}
            rowKey={(role) => role.id}
            empty={
              <EmptyState
                icon={<ShieldCheck aria-hidden />}
                title="No roles to show"
                description="No active system roles have been seeded, and this organization has not created
                  any of its own."
              />
            }
          />
        )}
        <p className="px-4 py-3 text-xs leading-relaxed text-muted sm:px-5">
          A System role is read-only: 011 refuses to change the platform's catalogue from a screen, and the
          door says so rather than this page trusting a button. A Custom role is this organization's own, and
          its permissions are the live rows in <code className="rounded-sm bg-surface-sunken px-1 py-0.5">role_permissions</code> —
          read, not re-typed here, so this list cannot drift from the database that enforces it.
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

      {/* ---- §65: create a custom role. Gated on `role.create`, never on a role's name. */}
      <Dialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        side="right"
        title="Create a role"
        description="A role can only ever hold permissions you hold yourself; the database enforces that, and a wider role is refused rather than corrected later."
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={async () => {
                if (organizationId === null) return;
                const built = buildCreateRoleDoorInput({ ...createForm, organizationId });
                if (!built.ok) {
                  setCreateErrors(built.errors);
                  return;
                }
                setCreateErrors({});
                const ok = await runWrite(
                  () => createRole(built.input),
                  `${built.input.displayName} created.`,
                );
                if (ok) {
                  setShowCreate(false);
                  void refreshRoles();
                }
              }}
            >
              {busy ? "Creating…" : "Create role"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Key" required error={createErrors.name} hint="Upper-case, e.g. NIGHT_AUDITOR.">
            <TextInput
              value={createForm.name}
              onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
              invalid={createErrors.name !== undefined}
              placeholder="NIGHT_AUDITOR"
            />
          </Field>
          <Field
            label="Name shown to administrators"
            required
            error={createErrors.displayName}
            hint="What appears on a grant, a roster and an audit row."
          >
            <TextInput
              value={createForm.displayName}
              onChange={(e) => setCreateForm((f) => ({ ...f, displayName: e.target.value }))}
              invalid={createErrors.displayName !== undefined}
            />
          </Field>
          <Field label="Description" hint="Optional. What this role is for, in one line.">
            <TextInput
              value={createForm.description}
              onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
            />
          </Field>
          <Field label="Scope" required error={createErrors.scopeLevel}>
            <SelectInput
              value={createForm.scopeLevel}
              onChange={(v) => setCreateForm((f) => ({ ...f, scopeLevel: v }))}
              options={CREATABLE_SCOPE_LEVELS.map((scope) => ({
                value: scope,
                label: scopeLabel(scope),
              }))}
            />
          </Field>
          <PermissionPicker
            held={heldPermissions}
            selected={createForm.permissions}
            errors={createErrors.permissions}
            onChange={(permissions) => setCreateForm((f) => ({ ...f, permissions }))}
          />
          <Field
            label="Reason"
            required
            error={createErrors.reason}
            hint="Recorded on the audit row with the whole permission list."
          >
            <Textarea
              value={createForm.reason}
              onChange={(e) => setCreateForm((f) => ({ ...f, reason: e.target.value }))}
              disabled={busy}
            />
          </Field>
        </div>
      </Dialog>

      {/* ---- §65: edit one custom role. Three doors, one panel, so an operator cannot
             tell apart the write that renames from the write that widens. */}
      <Dialog
        open={editingRole !== null}
        onClose={() => setEditingRole(null)}
        side="right"
        title={editingRole ? `Edit ${editingRole.displayName}` : "Edit role"}
        description="Renaming, re-granting and retiring are three separate writes. Only the parts you change are sent."
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditingRole(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={
                busy ||
                editingRole === null ||
                !archiveActionState(editReason, editingRole?.displayName ?? "").canConfirm
              }
              onClick={async () => {
                if (editingRole === null || organizationId === null) return;
                const reason = editReason.trim();
                const current = rolePermissions.get(editingRole.id) ?? [];
                const samePermissions =
                  current.length === editPermissions.length &&
                  current.every((key) => editPermissions.includes(key));

                // One reason, three doors: each write is refused on its own terms, and a
                // rename must never be able to smuggle in a widening of authority.
                const ok = await runWrite(async () => {
                  if (
                    editingRole.displayName !== editDisplayName.trim() ||
                    (editingRole.description ?? "") !== editDescription.trim()
                  ) {
                    await updateRole({
                      roleId: editingRole.id,
                      displayName: editDisplayName.trim(),
                      description: editDescription.trim(),
                      reason,
                    });
                  }
                  if (!samePermissions) {
                    await setRolePermissions({
                      roleId: editingRole.id,
                      permissions: editPermissions,
                      reason,
                    });
                  }
                }, "Role updated.");
                if (ok) {
                  setEditingRole(null);
                  void refreshRoles();
                }
              }}
            >
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </>
        }
      >
        {editingRole !== null && (
          <div className="flex flex-col gap-4">
            <Field label="Name shown to administrators" required>
              <TextInput
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
              />
            </Field>
            <Field label="Description">
              <TextInput
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </Field>
            <PermissionPicker
              held={heldPermissions}
              selected={editPermissions}
              onChange={setEditPermissions}
            />
            <Field
              label="Reason"
              required
              hint="Recorded on the audit row. Both doors need it, and the door refuses without one."
            >
              <Textarea value={editReason} onChange={(e) => setEditReason(e.target.value)} disabled={busy} />
            </Field>
            <p className="text-xs leading-relaxed text-muted">
              The role key <code className="text-ink">{editingRole.name}</code> and its scope cannot be
              changed: existing grants point at that key, and a rename of an identity is a different role.
            </p>
          </div>
        )}
      </Dialog>

      {/* ---- Revoke one grant. The door stamps `revoked_at` and keeps the row (§53), so
             the confirmation names the subject and asks for a reason; both conditions are
             enforced by `archiveActionState` before `revoke_role` is ever reached. */}
      <Dialog
        open={revokeTarget !== null}
        onClose={() => setRevokeTarget(null)}
        title="Revoke this grant"
        description="The grant is marked revoked with today's timestamp; the row itself is kept so the history stays answerable."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRevokeTarget(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={busy || !revokeConfirm.canConfirm}
              onClick={async () => {
                if (revokeTarget === null) return;
                const ok = await runWrite(
                  () => revokeRole(revokeTarget.id, revokeConfirm.normalizedReason),
                  "Grant revoked.",
                );
                if (ok) {
                  setRevokeTarget(null);
                  void reloadGrants();
                  void refreshRoles();
                }
              }}
            >
              {busy ? "Revoking…" : "Revoke grant"}
            </Button>
          </>
        }
      >
        {revokeTarget !== null && (
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-ink">
              You are about to revoke{" "}
              <span className="font-semibold">
                {revokeTarget.role?.displayName ?? "this grant"}
              </span>{" "}
              from{" "}
              <span className="font-semibold">
                {selectedMember?.member?.fullName ??
                  selectedMember?.member?.email ??
                  "this person"}
              </span>
              .
            </p>
            <ul className="flex flex-col gap-1.5 rounded-md border border-line bg-surface-sunken px-4 py-3">
              <li className="text-xs leading-relaxed text-muted">
                Whatever this role's permissions gave them at this scope stops immediately.
              </li>
              <li className="text-xs leading-relaxed text-muted">
                Their property and outlet breadth is untouched; narrow it here as a separate action
                if the seat should also lose sight of the site.
              </li>
              <li className="text-xs leading-relaxed text-muted">
                The row is not deleted. Revocation stamps <span className="font-medium text-ink">revoked_at</span>,
                and a later re-grant makes a fresh row rather than resurrecting this one.
              </li>
            </ul>
            <Field label="Reason" required hint="Recorded on the audit trail; the door refuses without one.">
              <Textarea
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                disabled={busy}
              />
            </Field>
            {!revokeConfirm.canConfirm && revokeReason.length > 0 && (
              <p role="status" className="text-xs text-muted">
                A reason is still required.
              </p>
            )}
          </div>
        )}
      </Dialog>

      <ArchiveDialog
        open={retireTarget !== null}
        onClose={() => setRetireTarget(null)}
        entityName={retireTarget?.displayName ?? "role"}
        entityLabel="role"
        consequences={
          retireTarget !== null && retireTarget.status !== "ACTIVE"
            ? [
                "The role becomes grantable again.",
                "Grants made while it was retired are untouched — this does not re-issue them.",
              ]
            : [
                "Retiring stops future grants; it does not delete the role or the people holding it.",
                "Existing grants stay in the trail and readable, which is what §53 asks for.",
                "A retired custom role can be restored from this same screen.",
              ]
        }
        loading={busy}
        onConfirm={async (reason) => {
          if (retireTarget === null) return;
          const ok = await runWrite(
            () =>
              setRoleStatus({
                roleId: retireTarget.id,
                status: retireTarget.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                reason,
              }),
            retireTarget.status === "ACTIVE" ? "Role retired." : "Role restored.",
          );
          if (ok) {
            setRetireTarget(null);
            void refreshRoles();
          }
        }}
      />
    </div>
  );
}

/**
 * The permission list a create/edit sheet offers, grouped by domain.
 *
 * Only keys the session holds are selectable, and the ones it does not are listed rather than
 * removed — an operator who cannot see a capability concludes the product lacks it, whereas an
 * operator who can see it greyed understands the ceiling is theirs. The door still re-decides
 * every one of these on submit; this is an aid, never a control.
 */
function PermissionPicker({
  held,
  selected,
  onChange,
  errors,
}: {
  held: readonly Permission[];
  selected: readonly Permission[];
  onChange: (next: Permission[]) => void;
  errors?: string;
}) {
  const selectable = new Set(selectablePermissions(held));
  const chosen = new Set(selected);
  return (
    <Field label="Permissions" required error={errors}>
      <div className="flex flex-col gap-3">
        {permissionsByDomain().map((group) => {
          const inGroup = group.permissions.filter((entry) => selectable.has(entry.key));
          if (inGroup.length === 0) return null;
          return (
            <div key={group.domain} className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold text-ink">{permissionDomainLabel(group.domain)}</p>
              {inGroup.map((entry) => (
                <Checkbox
                  key={entry.key}
                  label={entry.key}
                  description={entry.description}
                  checked={chosen.has(entry.key)}
                  onChange={(checked) =>
                    onChange(
                      checked
                        ? [...selected, entry.key].sort()
                        : selected.filter((key) => key !== entry.key),
                    )
                  }
                />
              ))}
            </div>
          );
        })}
        {selectable.size === 0 && (
          <p className="text-xs text-muted">
            Your own role grants no permissions that can be handed to a custom role, so there is nothing to
            offer. A role cannot be wider than the person who creates it.
          </p>
        )}
      </div>
    </Field>
  );
}

/* -------------------------------------------------------------- role catalogue */

/**
 * §65's five columns: Role, Type, Permissions, Scope, Users.
 *
 * Built as a pure function rather than inline JSX so the column set is testable without a DOM
 * (this suite renders with `renderToStaticMarkup` and no effects) and so the table cannot
 * quietly gain a sixth column that contradicts the row view beside it.
 */
export function buildRoleColumns(handlers: {
  permissionsFor: (role: Role) => readonly Permission[];
  usersFor: (role: Role) => number;
  canCreate: boolean;
  canEdit: boolean;
  onEdit: (role: Role) => void;
  onRetire: (role: Role) => void;
}): DataColumn<Role>[] {
  return [
    {
      key: "name",
      header: "Role",
      render: (role) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{role.displayName}</p>
          <code className="text-xs text-muted">{role.name}</code>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (role) => (
        <Badge tone={roleKind(role) === "System" ? "brand" : "neutral"}>{roleKind(role)}</Badge>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (role) =>
        role.status === "ACTIVE" ? (
          <Badge tone="success">Active</Badge>
        ) : (
          <Badge tone="warning">Retired</Badge>
        ),
    },
    {
      key: "permissions",
      header: "Permissions",
      render: (role) => {
        const view = roleRowView(role, handlers.permissionsFor(role), 0, {
          canCreate: handlers.canCreate,
          canEdit: handlers.canEdit,
        });
        if (view.groups.length === 0) {
          return <span className="text-muted">No permissions recorded</span>;
        }
        // A grouped list, not a matrix: §65 asks for correctness at this stage, and a
        // role→permission grid of 55 cells per row is neither readable nor a control.
        return (
          <div className="flex flex-col gap-1">
            {view.groups.map((group) => (
              <p key={group.domain} className="text-xs leading-relaxed text-muted">
                <span className="font-medium text-ink">{permissionDomainLabel(group.domain)}: </span>
                {group.keys.map((key) => describePermission(key) ?? key).join(", ")}
              </p>
            ))}
          </div>
        );
      },
    },
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
      key: "users",
      header: "Users",
      render: (role) => {
        const count = handlers.usersFor(role);
        return (
          <span className={count === 0 ? "text-muted" : "text-ink"}>
            {count === 0 ? "Nobody" : `${count}`}
          </span>
        );
      },
    },
    {
      key: "manage",
      header: "Manage",
      align: "right",
      render: (role) => {
        // System rows get a statement, not a disabled button: 011 refuses the write in the
        // door, and a greyed control invites a click whose reason the screen cannot explain.
        if (!roleIsEditable(role)) {
          return <span className="text-xs text-muted">Managed by the platform</span>;
        }
        if (!handlers.canEdit) {
          return <span className="text-xs text-muted">View only</span>;
        }
        return (
          <span className="inline-flex flex-wrap justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={() => handlers.onEdit(role)}>
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handlers.onRetire(role)}
              title={role.status === "ACTIVE" ? "Retire this role" : "Restore this role"}
            >
              {role.status === "ACTIVE" ? "Retire" : "Restore"}
            </Button>
          </span>
        );
      },
    },
  ];
}

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
