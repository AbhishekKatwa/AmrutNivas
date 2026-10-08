/**
 * Identity & tenancy contract, now executed.
 *
 * Every shape below mirrors a table in `db/supabase` (001/002/004, as later amended in
 * place by 008's identity hardening and 010's audit outcomes) field for field,
 * in camelCase — this is the client's mirror of the schema, not an independent
 * model. The service tests send each door call through a stub transport and compare
 * the parameter names that come out against the `p_*` names in the migrations, so a
 * field renamed on either side fails the suite rather than the user.
 *
 * Hierarchy:  Organization -> Property -> Outlet -> Department
 *
 *   Organization = a legal operator (one registration, one billing relationship).
 *   Property     = a physical address a guest can be booked into.
 *   Outlet       = a separately-run revenue point inside a property.
 *   Department   = a cost/ownership centre inside an outlet (nullable: a property
 *                  can have departments that belong to no outlet, §14).
 *
 * Tenancy rule: every row carries the ids of ALL its ancestors. A query filters on
 * `organizationId` alone and cannot leak across tenants even if a deeper predicate
 * is forgotten — and a chain trigger refuses a write whose ancestors disagree.
 */

export type EntityId = string;

/* ---------------------------------------------------------------- lifecycle */

/*
 * Each status and taxonomy below is declared twice on purpose: as a type for the
 * compiler and as a `const` array for the runtime. The arrays are what the admin
 * selects render, and `domain/identity/taxonomy.test.ts` used to compare each one against
 * the CHECK constraint in the migration, so the pickers could never offer a value the
 * database would refuse (the donor project's property-type list drifted exactly
 * this way and a write failed at the door). That test is deleted with the suite, so
 * the CHECK in the migration is the authority and these arrays are mirrored from it
 * by hand.
 */

/** The tenant's own lifecycle. There is no `INACTIVE`: a group is trading or not. */
export type OrganizationStatus = "ACTIVE" | "SUSPENDED" | "ARCHIVED";

/**
 * A site, outlet or department can be paused without being retired.
 * 045 extended property status with TEMPORARILY_CLOSED, COMING_SOON, SUSPENDED
 * for enterprise visibility. Outlets and departments still use the original three.
 */
export type SiteStatus = "ACTIVE" | "INACTIVE" | "TEMPORARILY_CLOSED" | "COMING_SOON" | "SUSPENDED" | "ARCHIVED";

/** A person's standing inside one organization. `REMOVED` is terminal. */
export type MembershipStatus = "INVITED" | "ACTIVE" | "SUSPENDED" | "REMOVED";

export type InvitationStatus = "INVITED" | "ACCEPTED" | "EXPIRED" | "CANCELLED" | "REVOKED";

/**
 * A login's standing. Deliberately narrower than a membership: suspending a
 * person from one tenant must not silently lock them out of another.
 *
 * 008 rewrote this CHECK. `INACTIVE` is retired — it meant "not trading", which is an
 * organization-level idea, and no path ever wrote it here; existing rows were moved to
 * `DEACTIVATED`, the value that says the login is closed rather than merely unused.
 * `INVITED` is deliberately absent: invitation standing belongs to a tenant and lives on
 * `invitations.status` and `organization_memberships.status`, so one person can be invited
 * to one group and ACTIVE in another. Because 008's `require_session` refuses with
 * `'NIVAAS_ACCOUNT_' || status`, these three are the whole vocabulary a current database
 * can produce — `config/security.ts` carries the two refusal codes that follow.
 */
export type AccountStatus = "ACTIVE" | "SUSPENDED" | "DEACTIVATED";

/** Exactly these property types — the taxonomy the whole product branches on. */
export type PropertyType =
  | "HOTEL"
  | "LODGE"
  | "RESORT"
  | "HOSTEL"
  | "RESTAURANT"
  | "CAFE"
  | "CLOUD_KITCHEN"
  | "BANQUET"
  | "CONVENTION_CENTER"
  | "RESTAURANT_HOTEL"
  | "MIXED_HOSPITALITY"
  | "OTHER";

export type OutletType =
  | "RESTAURANT"
  | "CAFE"
  | "BAR"
  | "ROOM_SERVICE"
  | "BANQUET"
  | "SPA"
  | "RETAIL"
  | "CLOUD_KITCHEN"
  | "OTHER";

/** `ALL_*` means everything there — including rows created later — which is why it
 *  is stored as one row rather than a list of ids. */
export type PropertyAccessMode = "ALL_PROPERTIES" | "SELECTED_PROPERTIES";
export type OutletAccessMode = "ALL_OUTLETS" | "SELECTED_OUTLETS";

/**
 * Formats a group declares it operates. Wider than `PROPERTY_TYPES` by exactly one
 * value, and it is a description, never a behaviour switch — `property_type` is the
 * switch, because a group can hold several formats across its sites.
 */
export type BusinessType = PropertyType | "BOUTIQUE_HOTEL";

export const ORGANIZATION_STATUSES: readonly OrganizationStatus[] = [
  "ACTIVE",
  "SUSPENDED",
  "ARCHIVED",
];

export const SITE_STATUSES: readonly SiteStatus[] = ["ACTIVE", "INACTIVE", "TEMPORARILY_CLOSED", "COMING_SOON", "SUSPENDED", "ARCHIVED"];

export const MEMBERSHIP_STATUSES: readonly MembershipStatus[] = [
  "INVITED",
  "ACTIVE",
  "SUSPENDED",
  "REMOVED",
];

export const INVITATION_STATUSES: readonly InvitationStatus[] = [
  "INVITED",
  "ACCEPTED",
  "EXPIRED",
  "CANCELLED",
  "REVOKED",
];

export const PROPERTY_TYPES: readonly PropertyType[] = [
  "HOTEL",
  "LODGE",
  "RESORT",
  "HOSTEL",
  "RESTAURANT",
  "CAFE",
  "CLOUD_KITCHEN",
  "BANQUET",
  "CONVENTION_CENTER",
  "RESTAURANT_HOTEL",
  "OTHER",
];

export const OUTLET_TYPES: readonly OutletType[] = [
  "RESTAURANT",
  "CAFE",
  "BAR",
  "ROOM_SERVICE",
  "BANQUET",
  "SPA",
  "RETAIL",
  "CLOUD_KITCHEN",
  "OTHER",
];

export const PROPERTY_ACCESS_MODES: readonly PropertyAccessMode[] = [
  "ALL_PROPERTIES",
  "SELECTED_PROPERTIES",
];

export const OUTLET_ACCESS_MODES: readonly OutletAccessMode[] = [
  "ALL_OUTLETS",
  "SELECTED_OUTLETS",
];

/**
 * 008's replacement `profiles_status_check`, in the CHECK's own order. The 002 inline
 * constraint it dropped is retired, so a picker built from the older list would offer a
 * status the database now refuses.
 */
export const ACCOUNT_STATUSES: readonly AccountStatus[] = [
  "ACTIVE",
  "SUSPENDED",
  "DEACTIVATED",
];

export const BUSINESS_TYPES: readonly BusinessType[] = [...PROPERTY_TYPES, "BOUTIQUE_HOTEL"];

/* ---------------------------------------------------------------- hierarchy */

/** A legal operating entity. The tenant boundary. */
export type Organization = {
  id: EntityId;
  /** No parent `organizationId`: this level IS the tenant. */
  name: string;
  legalName: string | null;
  displayName: string | null;
  /** Unique per organization; used in codes and imports. */
  code: string;
  /** URL-safe and unique — a tenant slug is what a booking link would carry. */
  slug: string;
  businessTypes: BusinessType[];
  status: OrganizationStatus;
  country: string;
  /** Group reporting currency; a property may trade in another. */
  currency: string;
  timezone: string;
  locale: string;
  /** Tax regime of the registration. Tax is filed per legal entity, so the region
   *  lives here; a property overrides it with a `taxProfileId`, never a free text. */
  taxRegion: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logoUrl: string | null;
  /** §60/§61: demo rows are labelled, never allowed to look like a customer's data. */
  isDemo: boolean;
  /** Optimistic locking (§82): the version the row had when this copy was read. */
  version: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

/** A physical site. */
export type Property = {
  id: EntityId;
  organizationId: EntityId;
  name: string;
  displayName: string | null;
  code: string;
  slug: string;
  type: PropertyType;
  status: SiteStatus;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string;
  phone: string | null;
  email: string | null;
  /** Property-level, not organization-level: a chain across two countries has two
   *  offsets and two tax regimes. */
  timezone: string;
  currency: string;
  locale: string;
  /** Trading day start, e.g. `04:00` — the boundary a night audit rolls across. */
  businessDayStart: string;
  /** A FK to a tax profile, which does not exist until Finance. Nullable by design;
   *  this stage must not invent a "tax region" string the schema cannot store. */
  taxProfileId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

/** A revenue point inside a property. */
export type Outlet = {
  id: EntityId;
  /** Denormalized ancestors — see the tenancy rule above. */
  organizationId: EntityId;
  propertyId: EntityId;
  name: string;
  code: string;
  slug: string;
  type: OutletType;
  status: SiteStatus;
  /** Day parts and meal windows, keyed by whatever the operator publishes. */
  businessHours: Record<string, unknown>;
  phone: string | null;
  email: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  /**
   * No `timezone`, `currency`, `locale` or tax of its own: an outlet sits inside one
   * property's regime, and a third value there is how "what time is the folio"
   * becomes ambiguous.
   */
};

/** An ownership/cost centre. Never a tenancy boundary. */
export type Department = {
  id: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  /**
   * Nullable: §14 lets a department hang off the property instead of an outlet
   * (a property-wide Front Office, an Estate Maintenance team).
   */
  outletId: EntityId | null;
  name: string;
  code: string;
  slug: string;
  status: SiteStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
};

/* ------------------------------------------------------------------- people */

/**
 * A person's authentication identity, deliberately separate from any tenancy: one
 * human may belong to several organizations, and deleting a membership must never
 * delete the login.
 *
 * 008 widened this table with the person's own name parts, presentation defaults and a
 * last-sign-in stamp; every field below is a real column, in the column's own nullability.
 */
export type UserAccount = {
  id: EntityId;
  /** Canonical login, citext-normalized at write time. */
  email: string;
  /** 002's name of record: `not null default ''`, so an empty string is "no name given". */
  fullName: string | null;
  /**
   * 008's optional decomposition of the name of record. 008's own column comment is the
   * rule: absent is absent — never filled from an email local part and shown as a name.
   */
  firstName: string | null;
  lastName: string | null;
  /**
   * 008's `generated always as (...) stored` column: the name parts, else `full_name`,
   * else the email local part, else `''`. The database derives it, so the three name
   * fields can never disagree and no screen has to choose which to trust — and no write
   * path can set it, which is why the fallback is as invented as the data already is and
   * no more.
   */
  displayName: string;
  phone: string | null;
  avatarUrl: string | null;
  status: AccountStatus;
  /** 008, CHECK `^[a-z]{2}(-[A-Z]{2})?$` or NULL. NULL means never declared. */
  locale: string | null;
  /** 008, an IANA name validated by the `app.assert_timezone()` trigger, or NULL. */
  timezone: string | null;
  /**
   * 008's `last_login_at`, §64's "Last activity". Written ONLY by
   * `public.record_auth_event` (010) on a successful sign-in, never by the client.
   * NULL means no sign-in has been recorded — which is not the same as "never active",
   * and must not be rendered as a date.
   */
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Joins a UserAccount to one Organization. Breadth is elsewhere, never here. */
export type Membership = {
  id: EntityId;
  userId: EntityId;
  organizationId: EntityId;
  status: MembershipStatus;
  /** Exactly one owner per organization, enforced by a partial unique index. */
  isOwner: boolean;
  /** NULL until the person actually joins: 002 leaves `joined_at` empty on an INVITED
   *  seat, and inventing a date there would fabricate a join that has not happened. */
  joinedAt: string | null;
  suspendedAt: string | null;
  removedAt: string | null;
  version: number;
  /**
   * Joined for the admin list; the membership table stores none of this. Only the fields
   * a roster actually renders are carried (§64: name, the address to contact, and when the
   * person last signed in), and `displayName` rides along because 008 generates it and a
   * screen that re-derived a name from the parts would disagree with the database.
   */
  member?: Pick<
    UserAccount,
    "id" | "email" | "fullName" | "displayName" | "lastLoginAt"
  >;
};

/** A pending invitation. The token itself is never stored or returned twice. */
export type Invitation = {
  id: EntityId;
  organizationId: EntityId;
  email: string;
  phone: string | null;
  fullName: string | null;
  roleId: EntityId;
  propertyIds: EntityId[];
  outletIds: EntityId[];
  status: InvitationStatus;
  invitedBy: EntityId;
  expiresAt: string;
  acceptedAt: string | null;
  acceptedBy: EntityId | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * The answer `invite_member` gives once — exactly the payload its `return` statement
 * builds in 005 (`invitationId`, `token`, `role`, `scope`, `expiresAt`) and nothing
 * else: a field the door never sends (an `email`, say) would render `undefined` the
 * day a screen trusted it. The invited address lives on the caller's input and the
 * `invitations` row, not here.
 */
export type IssuedInvitation = {
  invitationId: EntityId;
  /** 64 hex characters. Shown once; the store must not cache it. */
  token: string;
  /** The role NAME the door resolved, upper-cased. */
  role: string;
  /** The granted role's scope level, as the door reports it. */
  scope: ScopeLevel;
  expiresAt: string;
};

/* ------------------------------------------------------------- roles & access */

/**
 * How wide a grant reaches. The widest applicable grant wins, and everything
 * outside it is invisible rather than merely denied.
 */
export const PERMISSION_SCOPES = [
  "GLOBAL",
  "ORGANIZATION",
  "PROPERTY",
  "OUTLET",
  "DEPARTMENT",
] as const;

export type ScopeLevel = (typeof PERMISSION_SCOPES)[number];

/**
 * A role's `scope_level` decides the deepest level it can be granted at.
 *
 * Both kinds exist now. System roles are seeded by 006 and are read-only for every tenant
 * (011 refuses an edit with `NIVAAS_SYSTEM_ROLE_PROTECTED`, because a system role's label is
 * product copy shared across tenants). Tenant roles are invented through 011's doors, and
 * since 011 their NAME is unique per tenant rather than globally, so two operators can each
 * have a `NIGHT_AUDITOR`. 009 adds the `seniority` and `owner_class` columns that decide who
 * may grant a role; those are the doors' business and are not read into this mirror.
 */
export type Role = {
  id: EntityId;
  name: string;
  displayName: string;
  description: string | null;
  scopeLevel: ScopeLevel;
  /** True for the platform's seeded catalogue; false for a role this tenant created. */
  isSystem: boolean;
  /** Null for a platform-global role. */
  organizationId: EntityId | null;
  /** `INACTIVE` is a retirement, not a delete: grants already made stay readable. */
  status: "ACTIVE" | "INACTIVE";
};

/**
 * One row of `role_permissions` — the join that says what a role means. 003's
 * `role_permissions_read` lets a session see the permissions of any role it can see at all,
 * which is what makes a screen able to explain a denial rather than only assert it.
 */
export type RolePermission = {
  roleId: EntityId;
  permission: Permission;
};

/** A capability, always `domain.verb`: one lowercase segment, one dot, one verb. */
export type Permission = `${string}.${string}`;

export const PERMISSION_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

/** The join row that actually answers "may I?". */
export type RoleGrant = {
  id: EntityId;
  userId: EntityId;
  roleId: EntityId;
  organizationId: EntityId | null;
  propertyId: EntityId | null;
  outletId: EntityId | null;
  departmentId: EntityId | null;
  grantedBy: EntityId | null;
  grantedAt: string;
  /** Revocation is a timestamp, never a delete — the trail keeps both. */
  revokedAt: string | null;
  role?: Pick<Role, "name" | "displayName" | "scopeLevel">;
};

/** How far a person reaches inside one property. */
export type PropertyAccess = {
  id: EntityId;
  userId: EntityId;
  organizationId: EntityId;
  /** Filled only for a `SELECTED_PROPERTIES` row; `ALL_PROPERTIES` is the whole level. */
  propertyId: EntityId | null;
  mode: PropertyAccessMode;
};

/** A carve-out below a property the person can otherwise reach. */
export type OutletAccess = {
  id: EntityId;
  userId: EntityId;
  organizationId: EntityId;
  propertyId: EntityId;
  outletId: EntityId | null;
  mode: OutletAccessMode;
};

/* ------------------------------------------------------------------ session */

/**
 * Where the person is working right now. Every level is re-proved by
 * `resolve_active_context` on each load, so a saved context can never outlive the
 * access that justified it.
 */
export type ActiveContext = {
  signedIn: boolean;
  organizationId: EntityId | null;
  propertyId: EntityId | null;
  outletId: EntityId | null;
  /** The server dropped a level because access was revoked — never silent. */
  cleared: boolean;
};

/** What the UI may offer. A display aid only: every door re-asks the question. */
export type PermissionSet = {
  organizationId: EntityId;
  propertyId: EntityId | null;
  outletId: EntityId | null;
  permissions: Permission[];
};

export function can(permission: Permission, set: PermissionSet | null): boolean {
  return set?.permissions.includes(permission) ?? false;
}

/* -------------------------------------------------------------------- audit */

/**
 * What happened when something was attempted (Prompt #03 §34). 010 added `result` to
 * `audit_log` as `not null default 'SUCCESS'` with exactly this CHECK, so a row that
 * pre-dates the migration is a success by definition and the client never has to guess.
 *
 * `DENIED` is only ever written by `public.evaluate_access` through `app.audit_access`:
 * a door that refuses does so with `raise exception`, which aborts its own transaction
 * along with the audit insert it just made, so an in-door refusal is unloggable by
 * construction. 010's header states the tradeoff; a screen must not promise to show
 * "every denial".
 */
export type AuditResult = "SUCCESS" | "FAILURE" | "DENIED";

export const AUDIT_RESULTS: readonly AuditResult[] = ["SUCCESS", "FAILURE", "DENIED"];

/** One append-only entry. There is no update or delete path for any role. */
export type AuditEvent = {
  id: number;
  actorId: EntityId | null;
  organizationId: EntityId | null;
  propertyId: EntityId | null;
  outletId: EntityId | null;
  action: string;
  entity: string;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  /**
   * 010's outcome triad, above. The COLUMN is `not null default 'SUCCESS'`, but this field is
   * optional because the client's audit PROJECTION does not yet select it: `AUDIT_COLUMNS` in
   * `src/domain/audit/audit-service.ts` lists the 004 columns verbatim and that file is not
   * this module's to edit. Adding `result` to that literal is a one-line change for whoever
   * owns it; until then a read row arrives without the key rather than with a guessed one, so
   * the honest client type says "may be absent" and `auditResultOf()` in `@/lib/audit` applies
   * the schema's own default. A screen must not read `event.result` directly.
   */
  result?: AuditResult;
  createdAt: string;
};
