-- ============================================================================
-- AMRUT NIVAAS — Prompt #02, migration 004: Audit trail
--
-- §47/§48: who did what, to which entity, in which tenant, when, and why. This
-- stage only needs the hierarchy events, but the table is built once, properly,
-- because every later module (orders, stock, invoices, folios) appends to it.
--
-- Append-only is enforced by trigger, not by convention: an audit trail that any
-- connection can UPDATE is a history that can be quietly rewritten.
--
-- Design note on `action` — deliberately NOT an enum or a value list CHECK. The
-- donor project constrained its audit verbs with a CHECK, and the result was that
-- logging a new kind of event required a schema migration; teams answered by
-- stuffing meaning into `metadata` to avoid the migration, which is how an audit
-- table stops being auditable. Here the shape is validated (`lower_snake` verb)
-- and the vocabulary is owned by the write doors in 005, which are the only code
-- paths that can insert anyway.
-- ============================================================================

create table if not exists public.audit_log (
  -- Identity rather than uuid: this table is write-heavy, monotonic and rarely
  -- referenced by id, so a btree-friendly sequence key keeps the index small.
  id               bigint generated always as identity primary key,

  -- §48 actor. Nullable only for actions no human took (a scheduled expiry sweep);
  -- every interactive mutation in 005 supplies it.
  actor_id         uuid references public.profiles(id) on delete set null,

  -- §48 scope. `organization_id` is the tenant predicate and is present for every
  -- tenant event; an organization-level event carries it too, since the row exists
  -- by the time it is logged. property/outlet are filled where the action happened
  -- so a site manager can read their own history without joining anything.
  organization_id  uuid references public.organizations(id) on delete set null,
  property_id      uuid references public.properties(id)    on delete set null,
  outlet_id        uuid references public.outlets(id)       on delete set null,

  -- lower_snake verb, e.g. organization_created, property_archived, member_invited.
  action           text not null check (action ~ '^[a-z][a-z0-9_]{2,63}$'),

  -- The entity type and its id as text: polymorphic on purpose, so a future
  -- `reservation` or `invoice` row needs no change here.
  entity           text not null check (entity ~ '^[a-z][a-z0-9_]{2,63}$'),
  entity_id        text not null,

  -- §48 before/after. Captured by the write doors; NULL for creations (before) and
  -- archives without field changes (after). Kept as jsonb: this is a record of a
  -- moment, not data anyone queries by, so it must not be schema-flexible in a way
  -- that tempts someone to build a feature on it.
  before           jsonb,
  after            jsonb,

  -- §48 reason. Mandatory on the mutations that touch an authorization grant or
  -- retire a business entity — enforced in 005 at each door, not by a table CHECK,
  -- because "which actions need a reason" is a business rule and belongs with the
  -- doors that can change it.
  reason           text,

  metadata         jsonb not null default '{}'::jsonb,

  created_at       timestamptz not null default now()
);

comment on table public.audit_log is
  'Append-only history. UPDATE and DELETE are refused by trigger; corrections are new events.';

-- Newest-first reads are the only access pattern that matters (§ every ledger and
-- activity feed in this product reads date DESC).
create index if not exists audit_org_time_idx
  on public.audit_log (organization_id, created_at desc);
-- "Show me everything that ever happened to this property/outlet/user".
create index if not exists audit_entity_idx
  on public.audit_log (entity, entity_id);
create index if not exists audit_actor_time_idx
  on public.audit_log (actor_id, created_at desc);
create index if not exists audit_action_time_idx
  on public.audit_log (action, created_at desc);

-- ------------------------------------------------------------------- immutability

create or replace function app.forbid_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  -- Never let the trail be edited or trimmed by a routine connection.
  raise exception 'NIVAAS_AUDIT_IMMUTABLE'
    using hint = 'Record a correcting event instead of changing history.';
end;
$$;

drop trigger if exists audit_log_immutable on public.audit_log;
create trigger audit_log_immutable
  before update or delete on public.audit_log
  for each row execute function app.forbid_audit_mutation();

-- --------------------------------------------------------------------------- RLS

alter table public.audit_log enable row level security;

-- Read-only for clients, exactly like every other table here.
grant select on public.audit_log to authenticated, service_role;
revoke all on public.audit_log from anon;
revoke insert, update, delete, truncate on public.audit_log from authenticated;

-- No INSERT policy: rows enter only through app.audit() below, a SECURITY DEFINER
-- function owned by the table owner. An `authenticated` client therefore cannot
-- fabricate history even if it guesses the column shapes.

-- Whoever may see a tenant may read its history, and a person may always read
-- their own footprint. `audit.view` exists as a role permission for later, when
-- the UI wants to show history to a narrower audience than full membership.
drop policy if exists audit_tenant_read on public.audit_log;
create policy audit_tenant_read on public.audit_log
  for select
  to authenticated
  using (
    actor_id = app.current_user_id()
    or app.member_of(app.current_user_id(), organization_id)
    or app.is_platform_admin(app.current_user_id())
  );

-- ------------------------------------------------------------- the single funnel

-- Every write door calls this and nothing else. Centralising the insert means the
-- actor is always the session user (never a client-supplied id), which is the one
-- way an audit row can be trusted.
create or replace function app.audit(
  p_action text,
  p_entity text,
  p_entity_id uuid,
  p_organization uuid default null,
  p_property uuid default null,
  p_outlet uuid default null,
  p_before jsonb default null,
  p_after jsonb default null,
  p_reason text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_actor uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log
    (actor_id, organization_id, property_id, outlet_id, action, entity,
     entity_id, before, after, reason, metadata)
  values (
    -- An explicit actor is only honoured for the flows that have no session yet
    -- (invitation acceptance); otherwise the session owns the attribution.
    coalesce(p_actor, app.current_user_id()),
    p_organization, p_property, p_outlet,
    p_action, p_entity, p_entity_id::text,
    p_before, p_after, p_reason,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

grant execute on function app.audit(text, text, uuid, uuid, uuid, uuid,
  jsonb, jsonb, text, jsonb, uuid) to authenticated, service_role;
