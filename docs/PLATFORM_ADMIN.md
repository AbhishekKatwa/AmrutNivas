# Platform Administration

Platform administration layer for AMRUT NIVAAS — the internal operations interface for managing the SaaS platform itself, separate from customer organization management.

## Overview

Platform admin is a **separate identity layer** from organization ownership. A platform admin does not automatically gain access to customer data; instead, they request time-limited, scoped, audited support access sessions.

### Key Principles

1. **Separation of concerns**: Platform admin ≠ Organization Owner
2. **Explicit access**: Support access must be requested, scoped, and time-limited
3. **Audit everything**: All platform operations produce audit events
4. **Least privilege**: Platform roles have only the permissions they need
5. **Customer data protection**: Platform admins cannot access customer data without an active support session

## Platform Roles

### Role Hierarchy

```
PLATFORM_SUPER_ADMIN
  └─ Full platform control (user management, system config, security)
  
PLATFORM_ADMIN
  └─ Day-to-day platform operations (organizations, support, health)
  
PLATFORM_SUPPORT
  └─ Support case management and customer support access
  
PLATFORM_SECURITY
  └─ Security incident management and audit review
  
PLATFORM_FINANCE
  └─ Subscription and billing management
```

### Role Definitions

#### PLATFORM_SUPER_ADMIN

**Purpose**: Complete platform control for system operators.

**Permissions**:
- `platform.*` — All platform permissions
- User management (create/revoke platform admins)
- System configuration
- Security incident management
- Audit log access
- Maintenance mode control

**Use cases**:
- Initial platform setup
- Security incident response
- System configuration changes
- Emergency maintenance

#### PLATFORM_ADMIN

**Purpose**: Day-to-day platform operations.

**Permissions**:
- `platform.dashboard.view` — View platform metrics
- `platform.organization.*` — Manage organizations
- `platform.support.*` — Manage support cases
- `platform.health.view` — View system health
- `platform.announcement.*` — Manage announcements
- `platform.feature_flag.*` — Manage feature flags

**Use cases**:
- Monitor platform health
- Manage customer organizations
- Handle support escalations
- Control feature rollouts

#### PLATFORM_SUPPORT

**Purpose**: Customer support operations.

**Permissions**:
- `platform.support.*` — Manage support cases
- `platform.support_access.*` — Request and manage support access
- `platform.organization.view` — View organization details (with active support session)

**Use cases**:
- Handle support cases
- Request access to customer data for troubleshooting
- Add support notes and timeline entries

#### PLATFORM_SECURITY

**Purpose**: Security operations and audit.

**Permissions**:
- `platform.security.*` — Manage security incidents
- `platform.audit.view` — View audit logs
- `platform.organization.view` — View organization details

**Use cases**:
- Investigate security incidents
- Review audit trails
- Monitor suspicious activity

#### PLATFORM_FINANCE

**Purpose**: Subscription and billing management.

**Permissions**:
- `platform.subscription.*` — Manage subscriptions
- `platform.organization.view` — View organization details

**Use cases**:
- Manage customer subscriptions
- Handle billing issues
- Process refunds

## Platform Permissions

All platform permissions use the `platform.*` namespace.

### Permission Categories

#### Dashboard
- `platform.dashboard.view` — View platform dashboard

#### Organization Management
- `platform.organization.view` — View organizations
- `platform.organization.create` — Create organizations
- `platform.organization.update` — Update organizations
- `platform.organization.delete` — Delete organizations
- `platform.organization.suspend` — Suspend organizations
- `platform.organization.activate` — Activate organizations

#### Support
- `platform.support.view` — View support cases
- `platform.support.create` — Create support cases
- `platform.support.update` — Update support cases
- `platform.support.resolve` — Resolve support cases
- `platform.support.note.create` — Add support notes
- `platform.support.note.view` — View support notes

#### Support Access
- `platform.support_access.request` — Request support access
- `platform.support_access.revoke` — Revoke support access
- `platform.support_access.view` — View support access sessions

#### Security
- `platform.security.view` — View security incidents
- `platform.security.create` — Create security incidents
- `platform.security.update` — Update security incidents
- `platform.security.resolve` — Resolve security incidents

#### Health
- `platform.health.view` — View system health

#### Announcements
- `platform.announcement.view` — View announcements
- `platform.announcement.create` — Create announcements
- `platform.announcement.update` — Update announcements
- `platform.announcement.delete` — Delete announcements

#### Feature Flags
- `platform.feature_flag.view` — View feature flags
- `platform.feature_flag.create` — Create feature flags
- `platform.feature_flag.update` — Update feature flags
- `platform.feature_flag.delete` — Delete feature flags

#### Audit
- `platform.audit.view` — View platform audit logs

#### Configuration
- `platform.configuration.view` — View platform configuration
- `platform.configuration.update` — Update platform configuration

## Support Access Sessions

Support access sessions are **time-limited, scoped, audited** access grants that allow platform admins to access customer data for support purposes.

### Session Lifecycle

```
REQUESTED → ACTIVE → EXPIRED
                ↓
             REVOKED
```

### Session Properties

- **Requested by**: Platform admin requesting access
- **Organization**: Target organization
- **Scope**: What the admin can do (read, write, specific modules)
- **Reason**: Why access is needed (support case reference)
- **Duration**: How long access is valid (default: 1 hour)
- **Status**: REQUESTED, ACTIVE, EXPIRED, REVOKED
- **Granted at**: When access was granted
- **Expires at**: When access expires
- **Revoked at**: When access was revoked (if applicable)

### Access Control

1. **Request**: Platform admin requests access with reason and duration
2. **Grant**: System grants access (future: may require approval)
3. **Use**: Admin can access customer data within scope
4. **Expire**: Access automatically expires after duration
5. **Revoke**: Admin or system can revoke access early

### Audit Trail

All support access sessions produce audit events:
- `SUPPORT_ACCESS_REQUESTED` — Access requested
- `SUPPORT_ACCESS_GRANTED` — Access granted
- `SUPPORT_ACCESS_REVOKED` — Access revoked
- `SUPPORT_ACCESS_EXPIRED` — Access expired

### Security Guarantees

1. **Time-limited**: Access expires automatically
2. **Scoped**: Access is limited to specific operations
3. **Audited**: All access is logged
4. **Revocable**: Access can be revoked at any time
5. **Explicit**: Access must be requested; it is never implicit

## Organization Lifecycle

Organizations move through a lifecycle managed by platform admins.

### Lifecycle States

```
TRIALING → ACTIVE → PAST_DUE → SUSPENDED → CANCELLED
              ↑         ↓
              └─────────┘
```

### State Transitions

#### TRIALING → ACTIVE
**Trigger**: Subscription activated
**Action**: Organization gains full access

#### ACTIVE → PAST_DUE
**Trigger**: Payment failed
**Action**: Organization receives grace period

#### PAST_DUE → ACTIVE
**Trigger**: Payment succeeded
**Action**: Organization regains full access

#### PAST_DUE → SUSPENDED
**Trigger**: Grace period expired
**Action**: Organization loses access to most features

#### SUSPENDED → ACTIVE
**Trigger**: Payment received
**Action**: Organization regains full access

#### ACTIVE/PAST_DUE/SUSPENDED → CANCELLED
**Trigger**: Organization cancelled or deleted
**Action**: Organization loses all access

### Platform Admin Actions

Platform admins can:
- View organization details and metrics
- Suspend organizations (with reason)
- Activate suspended organizations
- Delete organizations (with confirmation)
- View organization subscription status
- View organization usage metrics

## Platform Dashboard

The platform dashboard (`/platform`) provides a high-level view of platform health and operations.

### Metrics

#### Organizations
- Total organizations
- Active organizations
- Trialing organizations
- Past due organizations
- Suspended organizations
- New this month

#### Subscriptions
- Active subscriptions
- Trialing subscriptions
- Past due subscriptions
- Cancelled subscriptions
- MRR (Monthly Recurring Revenue)
- ARR (Annual Recurring Revenue)
- ARPA (Average Revenue Per Account)

#### Users
- Total users
- Active users

#### Properties & Outlets
- Total properties
- Total outlets

#### Revenue
- MRR
- ARR

#### Support
- Open support cases
- Urgent support cases

#### Security
- Open security incidents
- Critical security incidents

#### Support Access
- Active support sessions

#### Integrations
- Failed integrations

#### Health
- API healthy
- Database healthy
- Integration failures
- Webhook failures

## Platform Audit

All platform operations produce audit events.

### Audit Event Categories

#### Organization Events
- `ORGANIZATION_CREATED`
- `ORGANIZATION_UPDATED`
- `ORGANIZATION_SUSPENDED`
- `ORGANIZATION_ACTIVATED`
- `ORGANIZATION_DELETED`

#### Support Events
- `SUPPORT_CASE_CREATED`
- `SUPPORT_CASE_UPDATED`
- `SUPPORT_CASE_RESOLVED`
- `SUPPORT_NOTE_ADDED`

#### Support Access Events
- `SUPPORT_ACCESS_REQUESTED`
- `SUPPORT_ACCESS_GRANTED`
- `SUPPORT_ACCESS_REVOKED`
- `SUPPORT_ACCESS_EXPIRED`

#### Security Events
- `SECURITY_INCIDENT_CREATED`
- `SECURITY_INCIDENT_UPDATED`
- `SECURITY_INCIDENT_RESOLVED`

#### Announcement Events
- `ANNOUNCEMENT_CREATED`
- `ANNOUNCEMENT_UPDATED`
- `ANNOUNCEMENT_ARCHIVED`

#### Feature Flag Events
- `FEATURE_FLAG_CREATED`
- `FEATURE_FLAG_UPDATED`
- `FEATURE_FLAG_DELETED`

#### Platform Role Events
- `PLATFORM_ROLE_ASSIGNED`
- `PLATFORM_ROLE_REVOKED`

### Audit Log Access

Platform admins with `platform.audit.view` permission can:
- View all platform audit events
- Filter by event type
- Filter by actor
- Filter by date range
- Export audit logs

## Security Considerations

### Platform Admin Security

1. **Separate identity**: Platform admin is separate from organization ownership
2. **Explicit access**: Support access must be requested and granted
3. **Time-limited**: Support access expires automatically
4. **Audited**: All platform operations are logged
5. **Least privilege**: Platform roles have only necessary permissions

### Customer Data Protection

1. **No implicit access**: Platform admins cannot access customer data without a support session
2. **Scoped access**: Support sessions are limited to specific operations
3. **Time-limited**: Support sessions expire automatically
4. **Audited**: All access is logged
5. **Revocable**: Support sessions can be revoked at any time

### Audit Trail

1. **Complete**: All platform operations produce audit events
2. **Immutable**: Audit events cannot be deleted or modified
3. **Searchable**: Audit events can be filtered and searched
4. **Exportable**: Audit events can be exported for compliance

## Future Enhancements

### Phase 2
- Support access approval workflow
- Support access scope refinement (module-level)
- Platform admin onboarding wizard
- Platform admin self-service password reset

### Phase 3
- Platform admin SSO integration
- Platform admin MFA enforcement
- Support access session recording
- Automated support access renewal

### Phase 4
- Platform admin role customization
- Custom platform permissions
- Platform admin activity analytics
- Support access session analytics

## Related Documentation

- [SUPPORT.md](./SUPPORT.md) — Support center operations
- [PLATFORM_OPERATIONS.md](./PLATFORM_OPERATIONS.md) — Platform operations guide
- [SECURITY.md](./SECURITY.md) — Security architecture
- [SUBSCRIPTIONS.md](./SUBSCRIPTIONS.md) — Subscription management
