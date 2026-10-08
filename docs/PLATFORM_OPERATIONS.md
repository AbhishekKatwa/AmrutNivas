# Platform Operations

Platform operations guide for AMRUT NIVAAS — day-to-day operations, health monitoring, announcements, feature flags, and system configuration.

## Overview

Platform operations covers the ongoing management of the AMRUT NIVAAS SaaS platform:
- Monitor platform health and performance
- Manage feature flags and controlled rollouts
- Create and manage platform announcements
- Configure platform settings
- Track security incidents
- Review audit logs

## Platform Dashboard

The platform dashboard (`/platform`) provides a high-level view of platform health and operations.

### Dashboard Sections

#### Organizations
**Metrics**:
- Total organizations
- Active organizations
- Trialing organizations
- Past due organizations
- Suspended organizations
- New this month

**Actions**:
- Click to view organization list
- Filter by status
- Search by name

#### Subscriptions
**Metrics**:
- Active subscriptions
- Trialing subscriptions
- Past due subscriptions
- Cancelled subscriptions
- MRR (Monthly Recurring Revenue)
- ARR (Annual Recurring Revenue)
- ARPA (Average Revenue Per Account)

**Actions**:
- Click to view subscription details
- Filter by status
- Export subscription report

#### Users
**Metrics**:
- Total users
- Active users

**Actions**:
- Click to view user list
- Filter by status
- Search by name or email

#### Properties & Outlets
**Metrics**:
- Total properties
- Total outlets

**Actions**:
- Click to view property list
- Filter by organization
- Search by name

#### Revenue
**Metrics**:
- MRR (Monthly Recurring Revenue)
- ARR (Annual Recurring Revenue)

**Context**:
- MRR = sum of all active subscription MRR
- ARR = MRR × 12

#### Support
**Metrics**:
- Open support cases
- Urgent support cases

**Actions**:
- Click to view support center
- Filter by priority
- Assign cases

#### Security
**Metrics**:
- Open security incidents
- Critical security incidents

**Actions**:
- Click to view security incidents
- Filter by severity
- Assign incidents

#### Support Access
**Metrics**:
- Active support sessions

**Actions**:
- Click to view support access sessions
- Revoke sessions if needed

#### Integrations
**Metrics**:
- Failed integrations

**Actions**:
- Click to view integration settings
- Check integration health
- Retry failed integrations

#### Health
**Metrics**:
- API healthy (yes/no)
- Database healthy (yes/no)
- Integration failures (count)
- Webhook failures (count)

**Actions**:
- Click to view system health
- Check subsystem status
- View recent errors

## Organization Management

### Organization List

The organization list (`/platform/organizations`) shows all customer organizations.

**Columns**:
- Organization name
- Status (ACTIVE, TRIALING, PAST_DUE, SUSPENDED, CANCELLED)
- Subscription plan
- Properties count
- Users count
- Created date
- Actions

**Actions**:
- View organization details
- Suspend organization
- Activate organization
- Delete organization

### Organization Details

Organization details page shows:
- Organization profile (name, contact, address)
- Subscription details (plan, status, MRR, renewal date)
- Properties and outlets
- Users and roles
- Support cases
- Audit log

### Organization Lifecycle Management

#### Suspend Organization

**When to suspend**:
- Payment overdue (grace period expired)
- Terms of service violation
- Security incident
- Customer request

**How to suspend**:
1. Open organization details
2. Click "Suspend"
3. Select reason
4. Add notes (optional)
5. Confirm suspension

**Effects of suspension**:
- Organization loses access to most features
- Users cannot log in
- Data is preserved
- Subscription is paused

#### Activate Organization

**When to activate**:
- Payment received (after suspension)
- Issue resolved (after suspension)
- Customer request (after suspension)

**How to activate**:
1. Open organization details
2. Click "Activate"
3. Add notes (optional)
4. Confirm activation

**Effects of activation**:
- Organization regains full access
- Users can log in
- Subscription resumes

#### Delete Organization

**When to delete**:
- Customer request (account deletion)
- Fraudulent account
- Test account cleanup

**How to delete**:
1. Open organization details
2. Click "Delete"
3. Confirm deletion (requires confirmation)
4. Enter deletion reason

**Effects of deletion**:
- Organization loses all access
- All data is marked for deletion (30-day retention)
- Subscription is cancelled
- Users cannot log in

**Data retention**:
- Organization data is retained for 30 days
- After 30 days, data is permanently deleted
- During retention period, organization can be restored

## System Health

### Health Monitoring

The system health page (`/platform/health`) shows the health of all platform subsystems.

**Subsystems**:
- API (application servers)
- Database (PostgreSQL)
- Cache (Redis)
- Storage (file storage)
- Email service
- SMS service
- Payment gateway
- Webhook delivery

**Health statuses**:
- HEALTHY — Subsystem is operating normally
- DEGRADED — Subsystem is experiencing issues but still operational
- DOWN — Subsystem is not operational
- UNKNOWN — Health status cannot be determined

**Health checks**:
- Automated health checks run every 30 seconds
- Health status is updated in real-time
- Alerts are sent when status changes to DEGRADED or DOWN

### Health Check Details

#### API Health
**Check**: HTTP GET /health
**Expected**: 200 OK with `{ "status": "healthy" }`
**Timeout**: 5 seconds

#### Database Health
**Check**: SQL query `SELECT 1`
**Expected**: Successful query execution
**Timeout**: 5 seconds

#### Cache Health
**Check**: Redis PING command
**Expected**: PONG response
**Timeout**: 2 seconds

#### Storage Health
**Check**: List files in storage bucket
**Expected**: Successful listing
**Timeout**: 5 seconds

#### Email Service Health
**Check**: Send test email
**Expected**: Email sent successfully
**Timeout**: 10 seconds

#### SMS Service Health
**Check**: Send test SMS
**Expected**: SMS sent successfully
**Timeout**: 10 seconds

#### Payment Gateway Health
**Check**: Verify payment gateway API
**Expected**: API accessible
**Timeout**: 5 seconds

#### Webhook Delivery Health
**Check**: Count failed webhook deliveries in last hour
**Expected**: < 10 failures
**Threshold**: 10 failures = DEGRADED, 50 failures = DOWN

### Health Alerts

Health alerts are sent when:
- Subsystem status changes to DEGRADED
- Subsystem status changes to DOWN
- Subsystem status remains DEGRADED for > 5 minutes
- Subsystem status remains DOWN for > 2 minutes

**Alert channels**:
- Email (platform admins)
- Slack (platform operations channel)
- SMS (on-call platform admin)

### Incident Response

#### Severity Levels

**SEV-1 (Critical)**:
- System completely down
- Data loss in progress
- Security breach in progress
- Response time: 15 minutes
- Resolution time: 4 hours

**SEV-2 (High)**:
- Major subsystem down
- Significant performance degradation
- Data inconsistency detected
- Response time: 1 hour
- Resolution time: 1 business day

**SEV-3 (Medium)**:
- Minor subsystem issues
- Performance degradation
- Non-critical bugs
- Response time: 4 hours
- Resolution time: 2 business days

**SEV-4 (Low)**:
- Cosmetic issues
- Minor bugs
- Feature requests
- Response time: 2 business days
- Resolution time: 5 business days

#### Incident Response Process

1. **Detect**: Automated alert or manual report
2. **Acknowledge**: Platform admin acknowledges incident
3. **Investigate**: Determine root cause
4. **Mitigate**: Implement temporary fix (if possible)
5. **Resolve**: Implement permanent fix
6. **Verify**: Verify fix resolves issue
7. **Communicate**: Notify affected customers
8. **Document**: Create post-incident report

## Announcements

### Announcement Types

#### INFO
**Purpose**: General information, feature updates, tips.
**Audience**: All users or specific organizations.
**Duration**: 7 days (default).

**Examples**:
- New feature announcements
- Product updates
- Tips and best practices
- Upcoming maintenance (non-critical)

#### NOTICE
**Purpose**: Important notices, required actions.
**Audience**: All users or specific organizations.
**Duration**: 14 days (default).

**Examples**:
- Terms of service updates
- Privacy policy updates
- Required action by specific date
- Important system changes

#### WARNING
**Purpose**: Warnings about upcoming issues, maintenance.
**Audience**: All users or specific organizations.
**Duration**: 7 days (default).

**Examples**:
- Scheduled maintenance
- Service degradation expected
- Upcoming deadline
- Known issues

#### CRITICAL
**Purpose**: Critical alerts, immediate action required.
**Audience**: All users or specific organizations.
**Duration**: Until manually archived.

**Examples**:
- Emergency maintenance
- Security incident
- Service outage
- Data loss risk

### Announcement Structure

**Properties**:
- `id` — Unique announcement identifier
- `title` — Announcement title
- `message` — Announcement message (markdown supported)
- `severity` — INFO, NOTICE, WARNING, CRITICAL
- `status` — DRAFT, ACTIVE, ARCHIVED
- `targetAudience` — ALL_ORGS, SPECIFIC_ORGS, TRIALING, ACTIVE
- `targetOrganizations` — List of organization IDs (if SPECIFIC_ORGS)
- `startAt` — When announcement becomes active
- `endAt` — When announcement is archived (optional)
- `createdBy` — Platform admin who created announcement
- `createdAt` — When announcement was created
- `updatedAt` — When announcement was last updated

### Announcement Lifecycle

```
DRAFT → ACTIVE → ARCHIVED
```

#### DRAFT
**Meaning**: Announcement created but not yet active.
**Actions**: Edit, delete, activate.

#### ACTIVE
**Meaning**: Announcement is visible to target audience.
**Actions**: Edit, archive.

#### ARCHIVED
**Meaning**: Announcement is no longer visible.
**Actions**: None (archived announcements are read-only).

### Creating Announcements

1. Navigate to `/platform/announcements`
2. Click "Create Announcement"
3. Fill in announcement details:
   - Title
   - Message (markdown supported)
   - Severity (INFO, NOTICE, WARNING, CRITICAL)
   - Target audience (ALL_ORGS, SPECIFIC_ORGS, TRIALING, ACTIVE)
   - Target organizations (if SPECIFIC_ORGS)
   - Start date/time
   - End date/time (optional)
4. Save as draft or activate immediately

### Announcement Visibility

Announcements are visible to:
- Target audience (ALL_ORGS, SPECIFIC_ORGS, TRIALING, ACTIVE)
- Users with active sessions
- Users who haven't dismissed the announcement

Announcements are displayed:
- In the notification center
- As a banner at the top of the screen (CRITICAL only)
- In the announcements list

### Announcement Dismissal

Users can dismiss announcements:
- Dismissed announcements are hidden from that user
- Dismissal is per-user (other users still see it)
- CRITICAL announcements cannot be dismissed (must be archived)

## Feature Flags

### Feature Flag Types

#### Global Flags
**Scope**: Entire platform.
**Use case**: Platform-wide features, experimental features.

**Examples**:
- New UI design
- AI features
- Beta features

#### Organization Flags
**Scope**: Specific organizations.
**Use case**: Organization-specific features, beta testing.

**Examples**:
- Premium features for specific plans
- Beta features for specific customers
- Custom features for enterprise customers

#### Property Flags
**Scope**: Specific properties.
**Use case**: Property-specific features, pilot programs.

**Examples**:
- New features for specific properties
- Pilot programs
- A/B testing

### Feature Flag Structure

**Properties**:
- `id` — Unique feature flag identifier
- `key` — Unique flag key (e.g., `new_ui_design`)
- `name` — Human-readable name
- `description` — Flag description
- `enabled` — Whether flag is enabled
- `environment` — DEVELOPMENT, STAGING, PRODUCTION
- `targetType` — GLOBAL, ORGANIZATION, PROPERTY
- `targetReference` — List of organization/property IDs (if not GLOBAL)
- `createdAt` — When flag was created
- `updatedAt` — When flag was last updated

### Feature Flag Lifecycle

```
CREATED → ENABLED → DISABLED → DELETED
```

#### CREATED
**Meaning**: Flag created but not yet enabled.
**Actions**: Enable, edit, delete.

#### ENABLED
**Meaning**: Flag is active for target scope.
**Actions**: Disable, edit.

#### DISABLED
**Meaning**: Flag is inactive.
**Actions**: Enable, edit, delete.

#### DELETED
**Meaning**: Flag is permanently deleted.
**Actions**: None (deleted flags cannot be restored).

### Creating Feature Flags

1. Navigate to `/platform/settings`
2. Click "Feature Flags" tab
3. Click "Create Feature Flag"
4. Fill in flag details:
   - Key (unique identifier)
   - Name
   - Description
   - Environment (DEVELOPMENT, STAGING, PRODUCTION)
   - Target type (GLOBAL, ORGANIZATION, PROPERTY)
   - Target reference (if ORGANIZATION or PROPERTY)
   - Enabled (yes/no)
5. Save flag

### Feature Flag Targeting

#### Global Targeting
Flag applies to entire platform.

**Example**:
```
Key: new_ui_design
Target: GLOBAL
Enabled: true
```

All users see the new UI design.

#### Organization Targeting
Flag applies to specific organizations.

**Example**:
```
Key: premium_features
Target: ORGANIZATION
Target Reference: [org_123, org_456]
Enabled: true
```

Only users in org_123 and org_456 see premium features.

#### Property Targeting
Flag applies to specific properties.

**Example**:
```
Key: pilot_program
Target: PROPERTY
Target Reference: [prop_789]
Enabled: true
```

Only users in prop_789 see pilot program features.

### Feature Flag Evaluation

Feature flags are evaluated at runtime:

1. Check if flag exists
2. Check if flag is enabled
3. Check if flag environment matches current environment
4. Check if flag target matches current context
5. Return flag value (true/false)

**Evaluation order**:
- Global flags (if target is GLOBAL)
- Organization flags (if target is ORGANIZATION and context has organizationId)
- Property flags (if target is PROPERTY and context has propertyId)

**Fallback**: If flag doesn't exist or is disabled, return false.

### Feature Flag Best Practices

1. **Use descriptive keys**: `new_ui_design` not `flag_123`
2. **Add descriptions**: Explain what the flag controls
3. **Start with DEVELOPMENT**: Test in DEVELOPMENT before PRODUCTION
4. **Use targeting**: Roll out gradually (organization → property → global)
5. **Monitor impact**: Check metrics after enabling flag
6. **Clean up flags**: Delete flags after feature is fully rolled out
7. **Document flags**: Keep a list of active flags and their purpose

### Feature Flag Rollout Strategy

#### Phase 1: Development
- Create flag in DEVELOPMENT environment
- Test feature with flag enabled
- Verify feature works as expected

#### Phase 2: Staging
- Enable flag in STAGING environment
- Test feature with real data
- Verify performance and scalability

#### Phase 3: Production (Pilot)
- Enable flag in PRODUCTION environment
- Target specific organizations (beta testers)
- Monitor metrics and feedback

#### Phase 4: Production (Partial)
- Expand target to more organizations
- Monitor metrics and feedback
- Adjust targeting as needed

#### Phase 5: Production (Global)
- Change target to GLOBAL
- Enable flag for all users
- Monitor metrics and feedback

#### Phase 6: Cleanup
- Verify feature is stable
- Remove flag from code
- Delete flag from database

## Security Incidents

### Incident Types

#### DATA_BREACH
**Definition**: Unauthorized access to customer data.
**Severity**: CRITICAL.
**Response time**: 15 minutes.

**Examples**:
- SQL injection attack
- Credential theft
- Unauthorized API access

#### UNAUTHORIZED_ACCESS
**Definition**: Unauthorized access to platform or customer data.
**Severity**: HIGH.
**Response time**: 1 hour.

**Examples**:
- Brute force attack
- Account takeover
- Privilege escalation

#### SUSPICIOUS_ACTIVITY
**Definition**: Unusual activity that may indicate security issue.
**Severity**: MEDIUM.
**Response time**: 4 hours.

**Examples**:
- Unusual login patterns
- Unusual API usage
- Unusual data access patterns

#### VULNERABILITY
**Definition**: Security vulnerability discovered in platform.
**Severity**: HIGH.
**Response time**: 1 hour.

**Examples**:
- XSS vulnerability
- CSRF vulnerability
- Insecure direct object reference

#### OTHER
**Definition**: Other security incidents.
**Severity**: Varies.
**Response time**: Varies.

### Incident Structure

**Properties**:
- `id` — Unique incident identifier
- `title` — Incident title
- `description` — Incident description
- `type` — DATA_BREACH, UNAUTHORIZED_ACCESS, SUSPICIOUS_ACTIVITY, VULNERABILITY, OTHER
- `severity` — LOW, MEDIUM, HIGH, CRITICAL
- `status` — OPEN, INVESTIGATING, MITIGATING, RESOLVED, CLOSED
- `affectedOrganizationId` — Affected organization (if applicable)
- `affectedUserId` — Affected user (if applicable)
- `assignedTo` — Platform admin assigned to incident
- `resolution` — Resolution details
- `createdAt` — When incident was created
- `updatedAt` — When incident was last updated
- `resolvedAt` — When incident was resolved

### Incident Lifecycle

```
OPEN → INVESTIGATING → MITIGATING → RESOLVED → CLOSED
```

#### OPEN
**Meaning**: Incident reported, not yet investigated.
**Next action**: Assign to platform admin, begin investigation.

#### INVESTIGATING
**Meaning**: Platform admin is investigating incident.
**Next action**: Determine root cause, assess impact.

#### MITIGATING
**Meaning**: Root cause identified, implementing fix.
**Next action**: Implement fix, verify resolution.

#### RESOLVED
**Meaning**: Incident resolved, waiting for confirmation.
**Next action**: Verify resolution, communicate to affected parties.

#### CLOSED
**Meaning**: Incident resolved and confirmed.
**Next action**: Create post-incident report.

### Creating Security Incidents

1. Navigate to `/platform/security`
2. Click "Create Incident"
3. Fill in incident details:
   - Title
   - Description
   - Type (DATA_BREACH, UNAUTHORIZED_ACCESS, etc.)
   - Severity (LOW, MEDIUM, HIGH, CRITICAL)
   - Affected organization (if applicable)
   - Affected user (if applicable)
4. Save incident

### Incident Response

#### CRITICAL Incidents
1. Acknowledge incident immediately
2. Assemble incident response team
3. Assess impact and scope
4. Implement immediate mitigation
5. Communicate to affected customers
6. Investigate root cause
7. Implement permanent fix
8. Verify resolution
9. Create post-incident report
10. Conduct post-incident review

#### HIGH Incidents
1. Acknowledge incident within 1 hour
2. Assign to platform admin
3. Investigate root cause
4. Implement fix
5. Verify resolution
6. Communicate to affected customers (if needed)
7. Create post-incident report

#### MEDIUM Incidents
1. Acknowledge incident within 4 hours
2. Assign to platform admin
3. Investigate root cause
4. Implement fix
5. Verify resolution
6. Create post-incident report

#### LOW Incidents
1. Acknowledge incident within 2 business days
2. Assign to platform admin
3. Investigate root cause
4. Implement fix
5. Verify resolution

### Post-Incident Report

**Sections**:
1. **Summary**: Brief description of incident
2. **Impact**: Who was affected, what was the impact
3. **Timeline**: Chronological list of events
4. **Root cause**: What caused the incident
5. **Resolution**: How the incident was resolved
6. **Lessons learned**: What can be improved
7. **Action items**: Follow-up tasks to prevent recurrence

## Platform Configuration

### Configuration Types

#### System Configuration
**Scope**: Platform-wide settings.
**Examples**:
- Maximum file upload size
- Session timeout
- Password policy
- Two-factor authentication requirements

#### Integration Configuration
**Scope**: Integration settings.
**Examples**:
- Email service credentials
- SMS service credentials
- Payment gateway credentials
- Webhook endpoints

#### Feature Configuration
**Scope**: Feature-specific settings.
**Examples**:
- AI model selection
- AI rate limits
- Analytics retention period
- Backup frequency

### Configuration Structure

**Properties**:
- `id` — Unique configuration identifier
- `key` — Configuration key (e.g., `max_file_upload_size`)
- `value` — Configuration value
- `description` — Configuration description
- `environment` — DEVELOPMENT, STAGING, PRODUCTION
- `createdAt` — When configuration was created
- `updatedAt` — When configuration was last updated

### Managing Configuration

1. Navigate to `/platform/settings`
2. Click "Configuration" tab
3. Search for configuration by key
4. Edit configuration value
5. Save changes

### Configuration Best Practices

1. **Use descriptive keys**: `max_file_upload_size` not `config_123`
2. **Add descriptions**: Explain what the configuration controls
3. **Use environment-specific values**: Different values for DEVELOPMENT, STAGING, PRODUCTION
4. **Validate values**: Ensure values are valid before saving
5. **Document changes**: Keep a log of configuration changes
6. **Test changes**: Test configuration changes in DEVELOPMENT before PRODUCTION

## Platform Audit

### Audit Log Access

Platform admins with `platform.audit.view` permission can access the audit log.

**Audit log features**:
- View all platform audit events
- Filter by event type
- Filter by actor
- Filter by date range
- Search by keyword
- Export audit logs

### Audit Event Types

See [PLATFORM_ADMIN.md](./PLATFORM_ADMIN.md) for a complete list of audit event types.

### Audit Log Retention

**Retention policy**:
- Audit logs are retained for 7 years
- After 7 years, logs are archived
- Archived logs can be accessed on request

### Audit Log Export

Audit logs can be exported in CSV format:
1. Navigate to `/platform/audit`
2. Apply filters (event type, actor, date range)
3. Click "Export"
4. Select export format (CSV)
5. Download export

## Best Practices

### Platform Operations

1. **Monitor health**: Check platform health daily.
2. **Respond to alerts**: Acknowledge and respond to alerts promptly.
3. **Review metrics**: Review platform metrics weekly.
4. **Manage features**: Use feature flags for controlled rollouts.
5. **Communicate changes**: Use announcements to communicate changes.
6. **Document incidents**: Create post-incident reports for all incidents.
7. **Review audit logs**: Review audit logs regularly for suspicious activity.
8. **Backup configuration**: Backup platform configuration regularly.
9. **Test disaster recovery**: Test disaster recovery procedures regularly.
10. **Stay updated**: Keep platform dependencies up to date.

### Security

1. **Follow least privilege**: Grant only necessary permissions.
2. **Audit access**: Review access logs regularly.
3. **Rotate credentials**: Rotate credentials regularly.
4. **Monitor suspicious activity**: Monitor for suspicious activity.
5. **Respond to incidents**: Respond to security incidents promptly.
6. **Document incidents**: Create post-incident reports.
7. **Learn from incidents**: Implement lessons learned.
8. **Stay informed**: Stay informed about security vulnerabilities.
9. **Patch promptly**: Apply security patches promptly.
10. **Test security**: Test security controls regularly.

## Future Enhancements

### Phase 2
- Automated health checks with self-healing
- Advanced analytics dashboard
- Custom alert rules
- Incident management integration (PagerDuty, Opsgenie)
- Configuration versioning

### Phase 3
- A/B testing framework
- Feature flag dependencies
- Automated rollout strategies
- Real-time collaboration for incident response
- Advanced audit analytics

### Phase 4
- AI-assisted incident detection
- Predictive health monitoring
- Automated incident response
- Configuration drift detection
- Compliance reporting

## Related Documentation

- [PLATFORM_ADMIN.md](./PLATFORM_ADMIN.md) — Platform administration overview
- [SUPPORT.md](./SUPPORT.md) — Support center operations
- [SECURITY.md](./SECURITY.md) — Security architecture
