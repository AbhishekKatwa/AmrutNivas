-- 048_platform_admin.sql
-- Platform Admin, Support, Operations & System Control Center (Prompt #22)
--
-- This migration adds the internal platform operations layer required to operate
-- AMRUT NIVAAS as a SaaS product. Platform Admin manages organizations, subscriptions,
-- support, system health, security incidents, and platform configuration.
--
-- Key principles:
-- - Platform Admin is separate from Organization Owner
-- - Support access is time-limited, scoped, and audited
-- - Platform Admin must NOT automatically access customer business data
-- - All sensitive operations are audited

-- ============================================================================
-- Platform Roles
-- ============================================================================

-- Platform-level roles (separate from organization roles)
CREATE TABLE IF NOT EXISTS app.platform_roles (
    id text PRIMARY KEY DEFAULT 'pr_' || lower(hex(random_bytes(12))),
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    description text,
    is_system boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT platform_role_code_format CHECK (code ~ '^[A-Z_]+$')
);

COMMENT ON TABLE app.platform_roles IS 'Platform-level roles for AMRUT NIVAAS operations (separate from organization roles)';

-- Seed platform roles
INSERT INTO app.platform_roles (code, name, description, is_system) VALUES
    ('PLATFORM_SUPER_ADMIN', 'Platform Super Admin', 'Full platform control including configuration and security', true),
    ('PLATFORM_ADMIN', 'Platform Admin', 'Platform operations and organization management', true),
    ('PLATFORM_SUPPORT', 'Platform Support', 'Customer support with controlled access', true),
    ('PLATFORM_OPERATIONS', 'Platform Operations', 'System health, integrations, and monitoring', true),
    ('PLATFORM_FINANCE', 'Platform Finance', 'Subscription and billing oversight', true),
    ('PLATFORM_SECURITY', 'Platform Security', 'Security operations and incident management', true),
    ('PLATFORM_READ_ONLY', 'Platform Read Only', 'Read-only platform access for audits', true)
ON CONFLICT (code) DO NOTHING;

-- Platform permissions (follows domain.verb pattern)
CREATE TABLE IF NOT EXISTS app.platform_role_permissions (
    platform_role_id text NOT NULL REFERENCES app.platform_roles(id) ON DELETE CASCADE,
    permission text NOT NULL,
    granted_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (platform_role_id, permission),
    CONSTRAINT platform_permission_format CHECK (permission ~ '^platform\.[a-z_]+\.[a-z_]+$')
);

COMMENT ON TABLE app.platform_role_permissions IS 'Permissions granted to platform roles';

-- Seed platform permissions for roles
-- Platform Super Admin gets all permissions
INSERT INTO app.platform_role_permissions (platform_role_id, permission)
SELECT pr.id, p.permission
FROM app.platform_roles pr
CROSS JOIN (VALUES
    ('platform.dashboard.view'),
    ('platform.organization.view'),
    ('platform.organization.manage'),
    ('platform.organization.suspend'),
    ('platform.organization.archive'),
    ('platform.user.view'),
    ('platform.user.manage'),
    ('platform.subscription.view'),
    ('platform.subscription.manage'),
    ('platform.plan.view'),
    ('platform.plan.manage'),
    ('platform.billing.view'),
    ('platform.billing.manage'),
    ('platform.support.view'),
    ('platform.support.manage'),
    ('platform.support.impersonate'),
    ('platform.health.view'),
    ('platform.integration.view'),
    ('platform.integration.manage'),
    ('platform.webhook.view'),
    ('platform.security.view'),
    ('platform.security.manage'),
    ('platform.incident.view'),
    ('platform.incident.manage'),
    ('platform.audit.view'),
    ('platform.audit.export'),
    ('platform.announcement.view'),
    ('platform.announcement.manage'),
    ('platform.configuration.view'),
    ('platform.configuration.manage'),
    ('platform.analytics.view'),
    ('platform.analytics.export')
) AS p(permission)
WHERE pr.code = 'PLATFORM_SUPER_ADMIN'
ON CONFLICT DO NOTHING;

-- Platform Admin gets most permissions except super admin config
INSERT INTO app.platform_role_permissions (platform_role_id, permission)
SELECT pr.id, p.permission
FROM app.platform_roles pr
CROSS JOIN (VALUES
    ('platform.dashboard.view'),
    ('platform.organization.view'),
    ('platform.organization.manage'),
    ('platform.organization.suspend'),
    ('platform.user.view'),
    ('platform.subscription.view'),
    ('platform.subscription.manage'),
    ('platform.plan.view'),
    ('platform.billing.view'),
    ('platform.support.view'),
    ('platform.support.manage'),
    ('platform.health.view'),
    ('platform.integration.view'),
    ('platform.security.view'),
    ('platform.incident.view'),
    ('platform.incident.manage'),
    ('platform.audit.view'),
    ('platform.announcement.view'),
    ('platform.announcement.manage'),
    ('platform.analytics.view')
) AS p(permission)
WHERE pr.code = 'PLATFORM_ADMIN'
ON CONFLICT DO NOTHING;

-- Platform Support gets support and read permissions
INSERT INTO app.platform_role_permissions (platform_role_id, permission)
SELECT pr.id, p.permission
FROM app.platform_roles pr
CROSS JOIN (VALUES
    ('platform.dashboard.view'),
    ('platform.organization.view'),
    ('platform.user.view'),
    ('platform.subscription.view'),
    ('platform.support.view'),
    ('platform.support.manage'),
    ('platform.support.impersonate'),
    ('platform.health.view'),
    ('platform.audit.view')
) AS p(permission)
WHERE pr.code = 'PLATFORM_SUPPORT'
ON CONFLICT DO NOTHING;

-- Platform Operations gets health and integration permissions
INSERT INTO app.platform_role_permissions (platform_role_id, permission)
SELECT pr.id, p.permission
FROM app.platform_roles pr
CROSS JOIN (VALUES
    ('platform.dashboard.view'),
    ('platform.organization.view'),
    ('platform.health.view'),
    ('platform.integration.view'),
    ('platform.integration.manage'),
    ('platform.webhook.view'),
    ('platform.audit.view')
) AS p(permission)
WHERE pr.code = 'PLATFORM_OPERATIONS'
ON CONFLICT DO NOTHING;

-- Platform Security gets security and incident permissions
INSERT INTO app.platform_role_permissions (platform_role_id, permission)
SELECT pr.id, p.permission
FROM app.platform_roles pr
CROSS JOIN (VALUES
    ('platform.dashboard.view'),
    ('platform.organization.view'),
    ('platform.security.view'),
    ('platform.security.manage'),
    ('platform.incident.view'),
    ('platform.incident.manage'),
    ('platform.audit.view'),
    ('platform.audit.export')
) AS p(permission)
WHERE pr.code = 'PLATFORM_SECURITY'
ON CONFLICT DO NOTHING;

-- Platform Read Only gets view-only permissions
INSERT INTO app.platform_role_permissions (platform_role_id, permission)
SELECT pr.id, p.permission
FROM app.platform_roles pr
CROSS JOIN (VALUES
    ('platform.dashboard.view'),
    ('platform.organization.view'),
    ('platform.subscription.view'),
    ('platform.support.view'),
    ('platform.health.view'),
    ('platform.security.view'),
    ('platform.incident.view'),
    ('platform.audit.view'),
    ('platform.analytics.view')
) AS p(permission)
WHERE pr.code = 'PLATFORM_READ_ONLY'
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Platform User Assignments
-- ============================================================================

-- Assign platform roles to users (separate from organization memberships)
CREATE TABLE IF NOT EXISTS app.platform_user_roles (
    user_id text NOT NULL REFERENCES app.profiles(id) ON DELETE CASCADE,
    platform_role_id text NOT NULL REFERENCES app.platform_roles(id) ON DELETE CASCADE,
    granted_at timestamptz NOT NULL DEFAULT now(),
    granted_by text REFERENCES app.profiles(id),
    PRIMARY KEY (user_id, platform_role_id)
);

COMMENT ON TABLE app.platform_user_roles IS 'Platform role assignments to users';

-- RLS for platform tables
ALTER TABLE app.platform_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.platform_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.platform_user_roles ENABLE ROW LEVEL SECURITY;

-- Platform roles are readable by authenticated users with platform permissions
CREATE POLICY "Platform roles are readable by platform users" ON app.platform_roles
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM app.platform_user_roles pur
        WHERE pur.user_id = auth.uid()
    ));

-- Platform role permissions are readable by platform users
CREATE POLICY "Platform role permissions are readable by platform users" ON app.platform_role_permissions
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM app.platform_user_roles pur
        WHERE pur.user_id = auth.uid()
    ));

-- Platform user roles are readable by the user themselves or other platform users
CREATE POLICY "Platform user roles are readable by platform users" ON app.platform_user_roles
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM app.platform_user_roles pur
            WHERE pur.user_id = auth.uid()
            AND pur.platform_role_id IN (
                SELECT id FROM app.platform_roles
                WHERE code IN ('PLATFORM_SUPER_ADMIN', 'PLATFORM_ADMIN')
            )
        )
    );

-- Only super admins can modify platform user roles
CREATE POLICY "Only super admins can manage platform user roles" ON app.platform_user_roles
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM app.platform_user_roles pur
        JOIN app.platform_roles pr ON pr.id = pur.platform_role_id
        WHERE pur.user_id = auth.uid()
        AND pr.code = 'PLATFORM_SUPER_ADMIN'
    ));

-- ============================================================================
-- Support Cases
-- ============================================================================

CREATE TABLE IF NOT EXISTS app.support_cases (
    id text PRIMARY KEY DEFAULT 'sup_' || lower(hex(random_bytes(12))),
    organization_id text REFERENCES app.organizations(id),
    property_id text REFERENCES app.properties(id),
    outlet_id text REFERENCES app.outlets(id),
    requester_id text REFERENCES app.profiles(id),
    title text NOT NULL,
    description text NOT NULL,
    category text NOT NULL CHECK (category IN (
        'ACCOUNT', 'BILLING', 'SUBSCRIPTION', 'RESTAURANT', 'HOTEL', 'INVENTORY',
        'PROCUREMENT', 'FINANCE', 'CRM', 'EVENTS', 'HR', 'COMMERCE', 'INTEGRATION',
        'API', 'SECURITY', 'DATA', 'OTHER'
    )),
    priority text NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT', 'CRITICAL')),
    status text NOT NULL DEFAULT 'OPEN' CHECK (status IN (
        'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER',
        'WAITING_INTERNAL', 'RESOLVED', 'CLOSED'
    )),
    assigned_to text REFERENCES app.profiles(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz
);

COMMENT ON TABLE app.support_cases IS 'Customer support cases with organization scope';

CREATE INDEX IF NOT EXISTS idx_support_cases_org ON app.support_cases(organization_id);
CREATE INDEX IF NOT EXISTS idx_support_cases_status ON app.support_cases(status);
CREATE INDEX IF NOT EXISTS idx_support_cases_assigned ON app.support_cases(assigned_to);

-- Support case notes (internal and customer-visible)
CREATE TABLE IF NOT EXISTS app.support_case_notes (
    id text PRIMARY KEY DEFAULT 'note_' || lower(hex(random_bytes(12))),
    case_id text NOT NULL REFERENCES app.support_cases(id) ON DELETE CASCADE,
    author_id text NOT NULL REFERENCES app.profiles(id),
    content text NOT NULL,
    visibility text NOT NULL DEFAULT 'INTERNAL' CHECK (visibility IN ('INTERNAL', 'CUSTOMER_VISIBLE')),
    created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.support_case_notes IS 'Notes on support cases (internal or customer-visible)';

CREATE INDEX IF NOT EXISTS idx_support_case_notes_case ON app.support_case_notes(case_id);

-- RLS for support cases
ALTER TABLE app.support_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.support_case_notes ENABLE ROW LEVEL SECURITY;

-- Support cases readable by platform support staff and organization members
CREATE POLICY "Support cases readable by authorized users" ON app.support_cases
    FOR SELECT TO authenticated
    USING (
        -- Platform support can read all cases
        EXISTS (
            SELECT 1 FROM app.platform_user_roles pur
            JOIN app.platform_role_permissions prp ON prp.platform_role_id = pur.platform_role_id
            WHERE pur.user_id = auth.uid()
            AND prp.permission = 'platform.support.view'
        )
        -- Organization members can read their own cases
        OR organization_id IN (
            SELECT organization_id FROM app.memberships
            WHERE user_id = auth.uid() AND status = 'ACTIVE'
        )
    );

-- Support cases writable by platform support
CREATE POLICY "Support cases writable by platform support" ON app.support_cases
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM app.platform_user_roles pur
            JOIN app.platform_role_permissions prp ON prp.platform_role_id = pur.platform_role_id
            WHERE pur.user_id = auth.uid()
            AND prp.permission = 'platform.support.manage'
        )
    );

-- Support case notes readable by same users as cases
CREATE POLICY "Support case notes readable by authorized users" ON app.support_case_notes
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM app.support_cases sc
            WHERE sc.id = support_case_notes.case_id
            AND (
                EXISTS (
                    SELECT 1 FROM app.platform_user_roles pur
                    JOIN app.platform_role_permissions prp ON prp.platform_role_id = pur.platform_role_id
                    WHERE pur.user_id = auth.uid()
                    AND prp.permission = 'platform.support.view'
                )
                OR sc.organization_id IN (
                    SELECT organization_id FROM app.memberships
                    WHERE user_id = auth.uid() AND status = 'ACTIVE'
                )
            )
        )
    );

-- Internal notes only visible to platform support
CREATE POLICY "Internal notes only visible to platform support" ON app.support_case_notes
    FOR SELECT TO authenticated
    USING (
        visibility = 'CUSTOMER_VISIBLE'
        OR EXISTS (
            SELECT 1 FROM app.platform_user_roles pur
            JOIN app.platform_role_permissions prp ON prp.platform_role_id = pur.platform_role_id
            WHERE pur.user_id = auth.uid()
            AND prp.permission = 'platform.support.view'
        )
    );

-- Support case notes writable by platform support
CREATE POLICY "Support case notes writable by platform support" ON app.support_case_notes
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM app.platform_user_roles pur
            JOIN app.platform_role_permissions prp ON prp.platform_role_id = pur.platform_role_id
            WHERE pur.user_id = auth.uid()
            AND prp.permission = 'platform.support.manage'
        )
    );

-- ============================================================================
-- Support Access Sessions (Controlled Impersonation)
-- ============================================================================

CREATE TABLE IF NOT EXISTS app.support_access_sessions (
    id text PRIMARY KEY DEFAULT 'sas_' || lower(hex(random_bytes(12))),
    platform_admin_id text NOT NULL REFERENCES app.profiles(id),
    organization_id text NOT NULL REFERENCES app.organizations(id),
    property_id text REFERENCES app.properties(id),
    outlet_id text REFERENCES app.outlets(id),
    reason text NOT NULL,
    scope text NOT NULL DEFAULT 'READ_ONLY' CHECK (scope IN (
        'ORGANIZATION', 'PROPERTY', 'OUTLET', 'READ_ONLY', 'SPECIFIC_MODULE'
    )),
    module text, -- if scope = SPECIFIC_MODULE
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.support_access_sessions IS 'Time-limited support access sessions with audit trail';

CREATE INDEX IF NOT EXISTS idx_support_access_sessions_admin ON app.support_access_sessions(platform_admin_id);
CREATE INDEX IF NOT EXISTS idx_support_access_sessions_org ON app.support_access_sessions(organization_id);
CREATE INDEX IF NOT EXISTS idx_support_access_sessions_expires ON app.support_access_sessions(expires_at);

-- RLS for support access sessions
ALTER TABLE app.support_access_sessions ENABLE ROW LEVEL SECURITY;

-- Support access sessions readable by the admin and platform support
CREATE POLICY "Support access sessions readable by authorized users" ON app.support_access_sessions
    FOR SELECT TO authenticated
    USING (
        platform_admin_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM app.platform_user_roles pur
            JOIN app.platform_role_permissions prp ON prp.platform_role_id = pur.platform_role_id
            WHERE pur.user_id = auth.uid()
            AND prp.permission = 'platform.support.view'
        )
    );

-- Support access sessions writable by platform support with impersonate permission
CREATE POLICY "Support access sessions manageable by platform support" ON app.support_access_sessions
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM app.platform_user_roles pur
            JOIN app.platform_role_permissions prp ON prp.platform_role_id = pur.platform_role_id
            WHERE pur.user_id = auth.uid()
            AND prp.permission = 'platform.support.impersonate'
        )
    );

-- ============================================================================
-- Security Incidents
-- ============================================================================

CREATE TABLE IF NOT EXISTS app.security_incidents (
    id text PRIMARY KEY DEFAULT 'inc_' || lower(hex(random_bytes(12))),
    organization_id text REFERENCES app.organizations(id),
    severity text NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    category text NOT NULL CHECK (category IN (
        'ACCOUNT_COMPROMISE', 'UNAUTHORIZED_ACCESS', 'API_ABUSE', 'DATA_EXPOSURE',
        'PAYMENT_SECURITY', 'WEBHOOK_SECURITY', 'CREDENTIAL_LEAK', 'SUSPICIOUS_ACTIVITY', 'OTHER'
    )),
    status text NOT NULL DEFAULT 'OPEN' CHECK (status IN (
        'OPEN', 'INVESTIGATING', 'CONTAINED', 'RESOLVED', 'CLOSED'
    )),
    title text NOT NULL,
    description text,
    detected_at timestamptz NOT NULL DEFAULT now(),
    assigned_to text REFERENCES app.profiles(id),
    resolved_at timestamptz,
    resolution text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.security_incidents IS 'Security incident tracking';

CREATE INDEX IF NOT EXISTS idx_security_incidents_org ON app.security_incidents(organization_id);
CREATE INDEX IF NOT EXISTS idx_security_incidents_status ON app.security_incidents(status);
CREATE INDEX IF NOT EXISTS idx_security_incidents_severity ON app.security_incidents(severity);

-- RLS for security incidents
ALTER TABLE app.security_incidents ENABLE ROW LEVEL SECURITY;

-- Security incidents readable by platform security and affected organization
CREATE POLICY "Security incidents readable by authorized users" ON app.security_incidents
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM app.platform_user_roles pur
            JOIN app.platform_role_permissions prp ON prp.platform_role_id = pur.platform_role_id
            WHERE pur.user_id = auth.uid()
            AND prp.permission = 'platform.security.view'
        )
        OR (organization_id IS NOT NULL AND organization_id IN (
            SELECT organization_id FROM app.memberships
            WHERE user_id = auth.uid() AND status = 'ACTIVE'
        ))
    );

-- Security incidents writable by platform security
CREATE POLICY "Security incidents manageable by platform security" ON app.security_incidents
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM app.platform_user_roles pur
            JOIN app.platform_role_permissions prp ON prp.platform_role_id = pur.platform_role_id
            WHERE pur.user_id = auth.uid()
            AND prp.permission = 'platform.security.manage'
        )
    );

-- ============================================================================
-- Platform Announcements
-- ============================================================================

CREATE TABLE IF NOT EXISTS app.platform_announcements (
    id text PRIMARY KEY DEFAULT 'ann_' || lower(hex(random_bytes(12))),
    title text NOT NULL,
    message text NOT NULL,
    severity text NOT NULL DEFAULT 'INFO' CHECK (severity IN ('INFO', 'NOTICE', 'WARNING', 'CRITICAL')),
    status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),
    target_audience text NOT NULL DEFAULT 'ALL' CHECK (target_audience IN (
        'ALL', 'PLAN', 'ORGANIZATION_TYPE', 'PROPERTY_TYPE', 'SPECIFIC_ORGANIZATIONS'
    )),
    target_organizations text[], -- if target_audience = SPECIFIC_ORGANIZATIONS
    start_at timestamptz NOT NULL DEFAULT now(),
    end_at timestamptz,
    created_by text NOT NULL REFERENCES app.profiles(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.platform_announcements IS 'Platform-wide announcements and notifications';

CREATE INDEX IF NOT EXISTS idx_platform_announcements_status ON app.platform_announcements(status);
CREATE INDEX IF NOT EXISTS idx_platform_announcements_dates ON app.platform_announcements(start_at, end_at);

-- RLS for platform announcements
ALTER TABLE app.platform_announcements ENABLE ROW LEVEL SECURITY;

-- Active announcements readable by all authenticated users
CREATE POLICY "Active announcements readable by authenticated users" ON app.platform_announcements
    FOR SELECT TO authenticated
    USING (
        status = 'ACTIVE'
        AND start_at <= now()
        AND (end_at IS NULL OR end_at > now())
    );

-- All announcements readable by platform admins
CREATE POLICY "All announcements readable by platform admins" ON app.platform_announcements
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM app.platform_user_roles pur
            JOIN app.platform_role_permissions prp ON prp.platform_role_id = pur.platform_role_id
            WHERE pur.user_id = auth.uid()
            AND prp.permission = 'platform.announcement.view'
        )
    );

-- Announcements writable by platform admins
CREATE POLICY "Announcements manageable by platform admins" ON app.platform_announcements
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM app.platform_user_roles pur
            JOIN app.platform_role_permissions prp ON prp.platform_role_id = pur.platform_role_id
            WHERE pur.user_id = auth.uid()
            AND prp.permission = 'platform.announcement.manage'
        )
    );

-- ============================================================================
-- Feature Flags
-- ============================================================================

CREATE TABLE IF NOT EXISTS app.feature_flags (
    id text PRIMARY KEY DEFAULT 'ff_' || lower(hex(random_bytes(12))),
    key text NOT NULL UNIQUE,
    name text NOT NULL,
    description text,
    enabled boolean NOT NULL DEFAULT false,
    environment text NOT NULL DEFAULT 'production' CHECK (environment IN ('development', 'staging', 'production')),
    target_type text NOT NULL DEFAULT 'GLOBAL' CHECK (target_type IN (
        'GLOBAL', 'PLAN', 'ORGANIZATION', 'PROPERTY'
    )),
    target_reference text, -- organization_id, property_id, or plan_id depending on target_type
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.feature_flags IS 'Lightweight feature flag system for controlled rollouts';

CREATE INDEX IF NOT EXISTS idx_feature_flags_key ON app.feature_flags(key);
CREATE INDEX IF NOT EXISTS idx_feature_flags_enabled ON app.feature_flags(enabled);

-- RLS for feature flags
ALTER TABLE app.feature_flags ENABLE ROW LEVEL SECURITY;

-- Feature flags readable by platform admins
CREATE POLICY "Feature flags readable by platform admins" ON app.feature_flags
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM app.platform_user_roles pur
            JOIN app.platform_role_permissions prp ON prp.platform_role_id = pur.platform_role_id
            WHERE pur.user_id = auth.uid()
            AND prp.permission = 'platform.configuration.view'
        )
    );

-- Feature flags writable by platform super admins
CREATE POLICY "Feature flags manageable by platform super admins" ON app.feature_flags
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM app.platform_user_roles pur
            JOIN app.platform_roles pr ON pr.id = pur.platform_role_id
            WHERE pur.user_id = auth.uid()
            AND pr.code = 'PLATFORM_SUPER_ADMIN'
        )
    );

-- ============================================================================
-- Data Export Requests
-- ============================================================================

CREATE TABLE IF NOT EXISTS app.data_export_requests (
    id text PRIMARY KEY DEFAULT 'exp_' || lower(hex(random_bytes(12))),
    organization_id text NOT NULL REFERENCES app.organizations(id),
    requester_id text NOT NULL REFERENCES app.profiles(id),
    reason text NOT NULL,
    status text NOT NULL DEFAULT 'REQUESTED' CHECK (status IN (
        'REQUESTED', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED'
    )),
    data_scope jsonb NOT NULL, -- what data to export
    file_url text,
    expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);

COMMENT ON TABLE app.data_export_requests IS 'Controlled data export workflow';

CREATE INDEX IF NOT EXISTS idx_data_export_requests_org ON app.data_export_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_data_export_requests_status ON app.data_export_requests(status);

-- RLS for data export requests
ALTER TABLE app.data_export_requests ENABLE ROW LEVEL SECURITY;

-- Data export requests readable by requester and platform support
CREATE POLICY "Data export requests readable by authorized users" ON app.data_export_requests
    FOR SELECT TO authenticated
    USING (
        requester_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM app.platform_user_roles pur
            JOIN app.platform_role_permissions prp ON prp.platform_role_id = pur.platform_role_id
            WHERE pur.user_id = auth.uid()
            AND prp.permission = 'platform.support.view'
        )
    );

-- Data export requests writable by platform support
CREATE POLICY "Data export requests manageable by platform support" ON app.data_export_requests
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM app.platform_user_roles pur
            JOIN app.platform_role_permissions prp ON prp.platform_role_id = pur.platform_role_id
            WHERE pur.user_id = auth.uid()
            AND prp.permission = 'platform.support.manage'
        )
    );

-- ============================================================================
-- Data Deletion Requests
-- ============================================================================

CREATE TABLE IF NOT EXISTS app.data_deletion_requests (
    id text PRIMARY KEY DEFAULT 'del_' || lower(hex(random_bytes(12))),
    organization_id text NOT NULL REFERENCES app.organizations(id),
    requester_id text NOT NULL REFERENCES app.profiles(id),
    reason text NOT NULL,
    status text NOT NULL DEFAULT 'REQUESTED' CHECK (status IN (
        'REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SCHEDULED', 'COMPLETED', 'CANCELLED'
    )),
    data_scope jsonb NOT NULL, -- what data to delete
    reviewer_id text REFERENCES app.profiles(id),
    review_notes text,
    reviewed_at timestamptz,
    scheduled_for timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);

COMMENT ON TABLE app.data_deletion_requests IS 'Controlled data deletion workflow (requires approval)';

CREATE INDEX IF NOT EXISTS idx_data_deletion_requests_org ON app.data_deletion_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_data_deletion_requests_status ON app.data_deletion_requests(status);

-- RLS for data deletion requests
ALTER TABLE app.data_deletion_requests ENABLE ROW LEVEL SECURITY;

-- Data deletion requests readable by requester and platform support
CREATE POLICY "Data deletion requests readable by authorized users" ON app.data_deletion_requests
    FOR SELECT TO authenticated
    USING (
        requester_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM app.platform_user_roles pur
            JOIN app.platform_role_permissions prp ON prp.platform_role_id = pur.platform_role_id
            WHERE pur.user_id = auth.uid()
            AND prp.permission = 'platform.support.view'
        )
    );

-- Data deletion requests writable by platform support
CREATE POLICY "Data deletion requests manageable by platform support" ON app.data_deletion_requests
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM app.platform_user_roles pur
            JOIN app.platform_role_permissions prp ON prp.platform_role_id = pur.platform_role_id
            WHERE pur.user_id = auth.uid()
            AND prp.permission = 'platform.support.manage'
        )
    );

-- ============================================================================
-- Platform Configuration
-- ============================================================================

CREATE TABLE IF NOT EXISTS app.platform_configuration (
    id text PRIMARY KEY DEFAULT 'cfg_' || lower(hex(random_bytes(12))),
    key text NOT NULL UNIQUE,
    value jsonb NOT NULL,
    description text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by text NOT NULL REFERENCES app.profiles(id)
);

COMMENT ON TABLE app.platform_configuration IS 'Platform-wide configuration settings';

-- RLS for platform configuration
ALTER TABLE app.platform_configuration ENABLE ROW LEVEL SECURITY;

-- Platform configuration readable by platform admins
CREATE POLICY "Platform configuration readable by platform admins" ON app.platform_configuration
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM app.platform_user_roles pur
            JOIN app.platform_role_permissions prp ON prp.platform_role_id = pur.platform_role_id
            WHERE pur.user_id = auth.uid()
            AND prp.permission = 'platform.configuration.view'
        )
    );

-- Platform configuration writable by platform super admins
CREATE POLICY "Platform configuration manageable by platform super admins" ON app.platform_configuration
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM app.platform_user_roles pur
            JOIN app.platform_roles pr ON pr.id = pur.platform_role_id
            WHERE pur.user_id = auth.uid()
            AND pr.code = 'PLATFORM_SUPER_ADMIN'
        )
    );

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Check if user has platform permission
CREATE OR REPLACE FUNCTION app.has_platform_permission(perm text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM app.platform_user_roles pur
        JOIN app.platform_role_permissions prp ON prp.platform_role_id = pur.platform_role_id
        WHERE pur.user_id = auth.uid()
        AND prp.permission = perm
    );
$$;

-- Get user's platform roles
CREATE OR REPLACE FUNCTION app.get_user_platform_roles()
RETURNS TABLE (platform_role_id text, platform_role_code text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
    SELECT pr.id, pr.code
    FROM app.platform_user_roles pur
    JOIN app.platform_roles pr ON pr.id = pur.platform_role_id
    WHERE pur.user_id = auth.uid();
$$;

-- Check if support access session is valid
CREATE OR REPLACE FUNCTION app.is_valid_support_access(org_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM app.support_access_sessions sas
        WHERE sas.platform_admin_id = auth.uid()
        AND sas.organization_id = org_id
        AND sas.expires_at > now()
        AND sas.revoked_at IS NULL
    );
$$;

-- Self-check: verify platform roles exist
DO $$
BEGIN
    ASSERT (SELECT count(*) FROM app.platform_roles WHERE is_system = true) >= 7,
        'Platform roles not seeded correctly';
END $$;
