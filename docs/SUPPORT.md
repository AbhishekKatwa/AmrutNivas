# Support Center

Support center for AMRUT NIVAAS — manage support cases, track issues, and provide customer support with time-limited, scoped, audited access to customer data.

## Overview

The support center enables platform support staff to:
- Create and manage support cases
- Track case progress and resolution
- Request time-limited access to customer data
- Add internal and customer-visible notes
- Monitor support metrics and SLAs

## Support Cases

### Case Structure

A support case represents a customer issue or request.

**Properties**:
- `id` — Unique case identifier
- `organizationId` — Customer organization (optional for platform-level issues)
- `propertyId` — Specific property (optional)
- `outletId` — Specific outlet (optional)
- `requesterId` — User who reported the issue (optional)
- `title` — Brief description of the issue
- `description` — Detailed description
- `category` — Issue category (BUG, FEATURE_REQUEST, QUESTION, ACCESS_ISSUE, BILLING, OTHER)
- `priority` — Issue priority (LOW, NORMAL, HIGH, URGENT, CRITICAL)
- `status` — Case status (OPEN, IN_PROGRESS, WAITING_CUSTOMER, RESOLVED, CLOSED)
- `assignedTo` — Platform admin assigned to the case
- `createdAt` — When the case was created
- `updatedAt` — When the case was last updated
- `resolvedAt` — When the case was resolved

### Case Categories

#### BUG
**Purpose**: Software defects or unexpected behavior.

**Examples**:
- Feature not working as expected
- Error messages or crashes
- Data inconsistencies
- Performance issues

**Resolution**: Fix deployed, workaround provided, or accepted as known limitation.

#### FEATURE_REQUEST
**Purpose**: Requests for new functionality or enhancements.

**Examples**:
- New feature requests
- UI/UX improvements
- Workflow enhancements
- Integration requests

**Resolution**: Added to roadmap, implemented, or declined with explanation.

#### QUESTION
**Purpose**: General questions about how to use the system.

**Examples**:
- How-to questions
- Best practices
- Feature usage
- Configuration guidance

**Resolution**: Answer provided, documentation linked, or training scheduled.

#### ACCESS_ISSUE
**Purpose**: Problems with user access or permissions.

**Examples**:
- Cannot log in
- Missing permissions
- Account locked
- Password reset issues

**Resolution**: Access restored, permissions corrected, or account unlocked.

#### BILLING
**Purpose**: Subscription and billing issues.

**Examples**:
- Payment failures
- Invoice questions
- Subscription changes
- Refund requests

**Resolution**: Payment processed, invoice corrected, subscription updated, or refund issued.

#### OTHER
**Purpose**: Issues that don't fit other categories.

**Examples**:
- General inquiries
- Partnership requests
- Legal inquiries
- Other miscellaneous issues

**Resolution**: Routed to appropriate team or resolved directly.

### Case Priorities

#### LOW
**Impact**: Minor issue, no business impact.
**Response time**: 5 business days.
**Resolution time**: 10 business days.

**Examples**:
- Cosmetic UI issues
- Minor feature requests
- Documentation updates

#### NORMAL
**Impact**: Moderate issue, some business impact.
**Response time**: 2 business days.
**Resolution time**: 5 business days.

**Examples**:
- Feature not working but workaround exists
- General questions
- Non-critical bugs

#### HIGH
**Impact**: Significant issue, major business impact.
**Response time**: 4 hours.
**Resolution time**: 2 business days.

**Examples**:
- Feature broken, no workaround
- Data inconsistency affecting operations
- Performance degradation

#### URGENT
**Impact**: Critical issue, severe business impact.
**Response time**: 1 hour.
**Resolution time**: 1 business day.

**Examples**:
- System partially down
- Data loss risk
- Security vulnerability (non-critical)

#### CRITICAL
**Impact**: System down, complete business stoppage.
**Response time**: 15 minutes.
**Resolution time**: 4 hours.

**Examples**:
- System completely down
- Data breach in progress
- Critical security vulnerability

### Case Statuses

#### OPEN
**Meaning**: Case created, not yet assigned or worked on.
**Next action**: Assign to platform admin.

#### IN_PROGRESS
**Meaning**: Platform admin is actively working on the case.
**Next action**: Investigate, request support access if needed, resolve.

#### WAITING_CUSTOMER
**Meaning**: Waiting for customer to provide information or confirm resolution.
**Next action**: Follow up with customer.

#### RESOLVED
**Meaning**: Issue resolved, waiting for customer confirmation.
**Next action**: Customer confirms resolution or reopens case.

#### CLOSED
**Meaning**: Case resolved and confirmed, or duplicate/invalid.
**Next action**: None, case is complete.

### Case Lifecycle

```
OPEN → IN_PROGRESS → RESOLVED → CLOSED
         ↓              ↓
    WAITING_CUSTOMER    ↓
         ↓              ↓
         └──────────────┘
```

### Case Assignment

Cases can be assigned to platform admins with appropriate permissions:
- `platform.support.update` — Assign cases
- `platform.support.view` — View assigned cases

Assignment considerations:
- Admin expertise (category match)
- Admin availability (current workload)
- Case priority (urgent cases first)
- Organization relationship (existing support sessions)

## Support Notes

Support notes are timestamped entries added to a case.

### Note Types

#### INTERNAL
**Visibility**: Only visible to platform admins.
**Purpose**: Internal discussion, investigation notes, technical details.

**Examples**:
- Investigation findings
- Technical analysis
- Internal discussion
- Workaround details

#### CUSTOMER_VISIBLE
**Visibility**: Visible to customer (requester).
**Purpose**: Communication with customer, status updates, resolution details.

**Examples**:
- Status updates
- Questions for customer
- Resolution instructions
- Follow-up requests

### Note Structure

**Properties**:
- `id` — Unique note identifier
- `caseId` — Associated support case
- `authorId` — Platform admin who wrote the note
- `content` — Note content (markdown supported)
- `visibility` — INTERNAL or CUSTOMER_VISIBLE
- `createdAt` — When the note was created

### Note Permissions

- `platform.support.note.create` — Add notes to cases
- `platform.support.note.view` — View notes on cases

All platform admins can view INTERNAL notes. Customer-visible notes are sent to the customer (requester).

## Support Access Sessions

Support access sessions allow platform admins to access customer data for troubleshooting.

### Session Request

To request support access:
1. Open a support case
2. Click "Request Access"
3. Select organization (pre-filled from case)
4. Specify scope (read, write, specific modules)
5. Provide reason (linked to case)
6. Set duration (default: 1 hour)
7. Submit request

### Session Grant

Support access is granted automatically (future: may require approval).

**Grant criteria**:
- Valid support case exists
- Platform admin has `platform.support_access.request` permission
- Reason is provided
- Duration is reasonable (≤ 24 hours)

### Session Usage

While a support session is active:
- Platform admin can access customer data within scope
- All actions are logged in audit trail
- Session countdown is visible
- Session can be revoked at any time

### Session Expiration

Support sessions expire automatically:
- Default duration: 1 hour
- Maximum duration: 24 hours
- Expiration is immediate (no grace period)
- Expired sessions cannot be renewed (must request new session)

### Session Revocation

Support sessions can be revoked:
- By the requesting admin (no longer needed)
- By another platform admin (security concern)
- Automatically (suspicious activity detected)

Revocation is immediate and logged.

### Session Scope

Support sessions can be scoped to specific operations:

#### READ
**Access**: View customer data (organizations, properties, outlets, users, etc.)
**Use case**: Investigate issues, verify data, troubleshoot problems.

#### WRITE
**Access**: Modify customer data (with audit trail)
**Use case**: Fix data issues, correct configurations, restore data.

#### MODULE-SPECIFIC
**Access**: View/modify specific modules (e.g., menu, inventory, billing)
**Use case**: Focused troubleshooting, limited-scope fixes.

### Session Audit

All support access sessions produce audit events:
- `SUPPORT_ACCESS_REQUESTED` — Access requested with reason and duration
- `SUPPORT_ACCESS_GRANTED` — Access granted
- `SUPPORT_ACCESS_REVOKED` — Access revoked with reason
- `SUPPORT_ACCESS_EXPIRED` — Access expired

All actions taken during a support session are logged with:
- Session ID
- Action type
- Resource accessed
- Timestamp
- Actor (platform admin)

## Support Metrics

### Case Metrics

#### Open Cases
**Definition**: Cases with status OPEN or IN_PROGRESS.
**Target**: < 50 open cases per support admin.

#### Resolution Time
**Definition**: Time from case creation to resolution.
**Target**: Varies by priority (see SLA below).

#### First Response Time
**Definition**: Time from case creation to first note (internal or customer-visible).
**Target**: < 1 hour for CRITICAL, < 4 hours for URGENT, < 1 day for HIGH.

#### Customer Satisfaction
**Definition**: Customer rating of support experience (future).
**Target**: > 90% satisfied.

### SLA (Service Level Agreement)

| Priority | Response Time | Resolution Time |
|----------|---------------|-----------------|
| CRITICAL | 15 minutes    | 4 hours         |
| URGENT   | 1 hour        | 1 business day  |
| HIGH     | 4 hours       | 2 business days |
| NORMAL   | 2 business days | 5 business days |
| LOW      | 5 business days | 10 business days |

### Support Admin Metrics

#### Cases Handled
**Definition**: Number of cases assigned to admin.
**Target**: 10-20 cases per day per admin.

#### Average Resolution Time
**Definition**: Average time to resolve cases.
**Target**: < 2 business days.

#### Customer Satisfaction
**Definition**: Average customer rating (future).
**Target**: > 4.5 / 5.

## Support Workflows

### Workflow 1: Bug Report

1. Customer reports bug via support case (category: BUG)
2. Support admin assigned (priority: NORMAL)
3. Admin requests support access (scope: READ, duration: 1 hour)
4. Admin investigates issue
5. Admin adds internal note with findings
6. Admin adds customer-visible note with workaround
7. Admin escalates to engineering (if fix required)
8. Engineering deploys fix
9. Admin adds customer-visible note confirming fix
10. Customer confirms resolution
11. Case marked RESOLVED
12. Case marked CLOSED after 48 hours (if no reopen)

### Workflow 2: Access Issue

1. Customer reports access issue (category: ACCESS_ISSUE)
2. Support admin assigned (priority: HIGH)
3. Admin requests support access (scope: WRITE, duration: 30 minutes)
4. Admin investigates access issue
5. Admin fixes access (reset password, correct permissions, unlock account)
6. Admin adds customer-visible note with instructions
7. Customer confirms access restored
8. Case marked RESOLVED
9. Case marked CLOSED after 24 hours (if no reopen)

### Workflow 3: Billing Question

1. Customer asks billing question (category: BILLING)
2. Support admin assigned (priority: NORMAL)
3. Admin reviews billing data (no support access needed)
4. Admin adds customer-visible note with answer
5. Customer confirms answer
6. Case marked RESOLVED
7. Case marked CLOSED after 24 hours (if no reopen)

### Workflow 4: Feature Request

1. Customer requests feature (category: FEATURE_REQUEST)
2. Support admin assigned (priority: LOW)
3. Admin reviews request
4. Admin adds internal note with feasibility assessment
5. Admin adds customer-visible note acknowledging request
6. Admin adds feature to roadmap (if approved)
7. Admin adds customer-visible note with timeline (if available)
8. Case marked RESOLVED
9. Case marked CLOSED after 7 days (if no reopen)

## Support Best Practices

### For Support Admins

1. **Respond quickly**: Acknowledge cases within SLA.
2. **Be clear**: Use clear, concise language in notes.
3. **Be empathetic**: Understand customer frustration.
4. **Be thorough**: Investigate fully before resolving.
5. **Be proactive**: Anticipate follow-up questions.
6. **Document everything**: Add notes for all actions.
7. **Use internal notes**: Keep technical details internal.
8. **Request access judiciously**: Only request when needed.
9. **Revoke access when done**: Don't leave sessions active.
10. **Follow up**: Check in with customers before closing.

### For Customers

1. **Be specific**: Provide detailed descriptions.
2. **Include steps**: List steps to reproduce issues.
3. **Attach screenshots**: Visual evidence helps.
4. **Respond promptly**: Answer support questions quickly.
5. **Test fixes**: Confirm resolution before closing.
6. **Reopen if needed**: Don't hesitate to reopen if issue persists.

## Support Escalation

### Escalation Levels

#### Level 1: Support Admin
**Scope**: General support, access issues, billing questions.
**Resolution time**: < 2 business days.

#### Level 2: Senior Support
**Scope**: Complex issues, escalations from Level 1.
**Resolution time**: < 1 business day.

#### Level 3: Engineering
**Scope**: Bugs, technical issues, data problems.
**Resolution time**: Varies by severity.

#### Level 4: Management
**Scope**: Critical issues, customer complaints, SLA breaches.
**Resolution time**: Immediate.

### Escalation Triggers

- SLA breach (response or resolution time)
- Customer request
- Issue complexity
- Data loss risk
- Security incident
- Revenue impact

## Security Considerations

### Support Access Security

1. **Time-limited**: Access expires automatically.
2. **Scoped**: Access is limited to specific operations.
3. **Audited**: All access is logged.
4. **Revocable**: Access can be revoked at any time.
5. **Explicit**: Access must be requested; never implicit.

### Data Protection

1. **Minimal access**: Request only necessary access.
2. **Customer data**: Treat customer data as confidential.
3. **No copying**: Don't copy customer data outside system.
4. **No sharing**: Don't share customer data with unauthorized parties.
5. **Secure notes**: Don't include sensitive data in notes.

### Audit Trail

1. **Complete**: All support actions are logged.
2. **Immutable**: Audit logs cannot be modified.
3. **Searchable**: Audit logs can be filtered and searched.
4. **Exportable**: Audit logs can be exported for compliance.

## Future Enhancements

### Phase 2
- Support access approval workflow
- Customer portal for support cases
- Email notifications for case updates
- Support case templates
- Knowledge base integration

### Phase 3
- Live chat support
- Screen sharing for support sessions
- Customer satisfaction surveys
- Support analytics dashboard
- Automated case routing

### Phase 4
- AI-assisted support (suggested responses, auto-categorization)
- Self-service knowledge base
- Community forum
- Support case priority adjustment by customer
- Multi-language support

## Related Documentation

- [PLATFORM_ADMIN.md](./PLATFORM_ADMIN.md) — Platform administration overview
- [PLATFORM_OPERATIONS.md](./PLATFORM_OPERATIONS.md) — Platform operations guide
- [SECURITY.md](./SECURITY.md) — Security architecture
