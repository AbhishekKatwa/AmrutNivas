-- ============================================================================
-- AMRUT NIVAAS — migration 057: route-guard permission grants
--
-- The route table (src/app/routes.ts) guards 62 screens on permission keys that
-- no migration ever granted to any role — the analytics, billing, commerce,
-- enterprise, events, experience, hr, marketing, revenue, integrations,
-- documents, settings, task/approval families plus shift.manage, station.manage
-- and supplier.view. 006's header documents why a second permission vocabulary
-- is dangerous: the client catalogue and the SQL matrix drifted apart until the
-- UI offered screens the database refused. Every one of those screens returned
-- "Access restricted" for every user, including the organization owner.
--
-- This file is grant-only and idempotent: it converges the matrix to what the
-- route table already promises, without revoking anything.
--   ORG_OWNER / ORG_ADMIN — every org-reachable screen (006: the owner holds
--     every capability in the tenant).
--   PLATFORM_ADMIN — the six platform console views (§41: the platform seat is
--     not a tenant role).
--   FINANCE_MANAGER — the two finance analytics views (006: reads the group's
--     money across every site).
--   EVENT_MANAGER / HR_MANAGER — the view keys of their own domains.
-- ============================================================================

with permissions(name) as (
  values
    -- Analytics dashboards (incl. the four finance screens)
    ('analytics.commerce.view'), ('analytics.crm.view'), ('analytics.dashboard.view'),
    ('analytics.events.view'), ('analytics.finance.view'), ('analytics.hotel.view'),
    ('analytics.hr.view'), ('analytics.inventory.view'), ('analytics.profitability.view'),
    ('analytics.restaurant.view'),
    -- Billing (organization SaaS billing screens)
    ('billing.account.view'), ('billing.invoice.view'), ('billing.payment.view'),
    ('billing.subscription.view'), ('billing.usage.view'),
    -- Commerce
    ('commerce.view'), ('commerce.channel.view'), ('commerce.order.view'),
    ('commerce.qr.view'), ('commerce.settings.view'),
    -- Enterprise
    ('enterprise.view'), ('enterprise.alerts.view'), ('enterprise.property.view'),
    ('enterprise.reporting.view'),
    -- Events
    ('events.view'), ('events.lead.view'), ('events.venue.view'), ('events.event.view'),
    -- Guest experience
    ('experience.view'), ('experience.analytics.view'), ('experience.complaint.view'),
    ('experience.feedback.view'),
    -- HR
    ('hr.view'), ('hr.employee.view'), ('hr.attendance.view'), ('hr.leave.view'),
    ('hr.roster.view'), ('hr.shift.view'),
    -- Marketing
    ('marketing.view'), ('marketing.analytics.view'), ('marketing.audience.view'),
    ('marketing.campaign.view'), ('marketing.campaign.create'), ('marketing.offer.view'),
    ('marketing.offer.create'), ('marketing.settings.manage'),
    -- Revenue
    ('revenue.view'), ('revenue.pricing.view'), ('revenue.promotion.view'),
    -- Operations / settings / documents / misc
    ('approval.view'), ('task.view'), ('shift.manage'), ('station.manage'),
    ('supplier.view'), ('settings.view'), ('documents.view'), ('integrations.view')
),
grantees(name) as (
  values ('ORG_OWNER'), ('ORG_ADMIN')
)
insert into public.role_permissions (role_id, permission)
select r.id, p.name
from permissions p
cross join grantees g
join public.roles r on r.name = g.name and r.is_system
on conflict (role_id, permission) do nothing;

-- Platform console: the SaaS operator seat only, never a tenant role.
with role_permission_matrix(role_name, permission) as (
  values
    ('PLATFORM_ADMIN', 'platform.dashboard.view'),
    ('PLATFORM_ADMIN', 'platform.organization.view'),
    ('PLATFORM_ADMIN', 'platform.health.view'),
    ('PLATFORM_ADMIN', 'platform.security.view'),
    ('PLATFORM_ADMIN', 'platform.support.view'),
    ('PLATFORM_ADMIN', 'platform.announcement.view')
)
insert into public.role_permissions (role_id, permission)
select r.id, m.permission
from role_permission_matrix m
join public.roles r on r.name = m.role_name and r.is_system
on conflict (role_id, permission) do nothing;

-- Domain managers read their own domain's screens.
with role_permission_matrix(role_name, permission) as (
  values
    ('FINANCE_MANAGER', 'analytics.finance.view'),
    ('FINANCE_MANAGER', 'analytics.profitability.view'),
    ('EVENT_MANAGER', 'events.view'),
    ('EVENT_MANAGER', 'events.lead.view'),
    ('EVENT_MANAGER', 'events.venue.view'),
    ('EVENT_MANAGER', 'events.event.view'),
    ('HR_MANAGER', 'hr.view'),
    ('HR_MANAGER', 'hr.employee.view'),
    ('HR_MANAGER', 'hr.attendance.view'),
    ('HR_MANAGER', 'hr.leave.view'),
    ('HR_MANAGER', 'hr.roster.view'),
    ('HR_MANAGER', 'hr.shift.view')
)
insert into public.role_permissions (role_id, permission)
select r.id, m.permission
from role_permission_matrix m
join public.roles r on r.name = m.role_name and r.is_system
on conflict (role_id, permission) do nothing;
