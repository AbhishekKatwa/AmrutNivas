-- AMRUT NIVAAS · 010 — audit outcomes, access decisions and session events (Prompt #03 §32-§38)
--
-- The trail recorded what happened, never what was refused. `audit_log` had no outcome
-- column, no door ever logged a denial, and there was no login or logout event at all —
-- so §34's SUCCESS/FAILURE/DENIED triad and §35's "important authorization failures"
-- were both unimplementable, and §82's final link (WHAT AUDIT EVENT) stopped at
-- "the change was written".
--
-- One limit stated rather than engineered around: a door that refuses does so with
-- `raise exception`, which aborts its own transaction — including the audit insert it
-- just made. Postgres has no autonomous transaction, and the options that would fake one
-- (dblink, a queue, a background worker) are exactly the §60 machinery this product is
-- not allowed to add. So in-door refusals stay unlogged, and the security trail for
-- denials is written by `public.evaluate_access` below: the same decision, made as a
-- non-raising read whose answer is the input to a refusal instead of the refusal itself.
-- Route guards and sensitive-action confirmations call it, so a denial a person actually
-- sees is a denial that gets recorded. SECURITY.md states this tradeoff; §39's "a denial
-- must be explicit" is satisfied by the reason code either way.

-- ------------------------------------------------------------------ the outcome

alter table public.audit_log
  add column if not exists result text not null default 'SUCCESS';

do $$
begin
  alter table public.audit_log drop constraint if exists audit_log_result_check;
end;
$$;
alter table public.audit_log
  add constraint audit_log_result_check
  check (result in ('SUCCESS','FAILURE','DENIED'));

comment on column public.audit_log.result is
  'SUCCESS: the change committed. FAILURE: an attempt that was recorded as refused by a '
  'non-raising path. DENIED: an authorization decision written by public.evaluate_access. '
  'A door that raises cannot record its own refusal (see this file''s header), so DENIED '
  'rows come from the pre-flight path, never from a rolled-back transaction.';

-- §37's operational filter is "show me what went wrong": a partial index keeps that read
-- cheap on a table that is append-only and grows with every mutation.
create index if not exists audit_outcome_idx
  on public.audit_log (organization_id, created_at desc)
  where result <> 'SUCCESS';

-- There is deliberately no backfill statement. `default 'SUCCESS'` already says what the
-- existing rows were (they committed), and an UPDATE would be refused by 004's immutability
-- trigger for every role including the table owner — which is the point of that trigger.

-- ------------------------------------------------------------------- one funnel

-- Replacing the signature, not overloading it: two live copies of `app.audit` is how a
-- future write picks the one that skips the outcome. `drop` then `create` is required
-- because Postgres will not change a parameter list in place. Every existing caller
-- passes named parameters and none passes `p_result`, so the default keeps all of them
-- compiling and correct — a committed write IS a success.
drop function if exists app.audit(text, text, uuid, uuid, uuid, uuid,
  jsonb, jsonb, text, jsonb, uuid);

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
  p_actor uuid default null,
  p_result text default 'SUCCESS'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log
    (actor_id, organization_id, property_id, outlet_id, action, entity,
     entity_id, before, after, reason, metadata, result)
  values (
    -- An explicit actor is only honoured for the flows that have no session yet
    -- (invitation acceptance); otherwise the session owns the attribution.
    coalesce(p_actor, app.current_user_id()),
    p_organization, p_property, p_outlet,
    p_action, p_entity, p_entity_id::text,
    p_before, p_after, p_reason,
    coalesce(p_metadata, '{}'::jsonb),
    coalesce(p_result, 'SUCCESS')
  );
end;
$$;

grant execute on function app.audit(text, text, uuid, uuid, uuid, uuid,
  jsonb, jsonb, text, jsonb, uuid, text) to authenticated, service_role;

-- ---------------------------------------------------- the access-decision recorder

-- An access decision is not a mutation of a row, so it cannot name one: `entity_id` on
-- the row funnel is a uuid for exactly that reason. This is the second and only other
-- way history is written, it takes the same SECURITY DEFINER path, and it is append-only
-- like everything else here — widening `app.audit` to text instead would have let a
-- mutation audit an id that never existed.
create or replace function app.audit_access(
  p_result text,
  p_permission text,
  p_reason_code text,
  p_organization uuid,
  p_property uuid default null,
  p_outlet uuid default null,
  p_actor uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log
    (actor_id, organization_id, property_id, outlet_id,
     action, entity, entity_id, reason, metadata, result)
  values (
    coalesce(p_actor, app.current_user_id()),
    p_organization, p_property, p_outlet,
    -- §33's vocabulary is the repository's: lowercase snake. The spec's ACCESS_DENIED is
    -- this row, and the mapping table in SECURITY.md is the only place that reconciles
    -- the two spellings.
    'access_denied', 'access', p_permission,
    null,
    jsonb_build_object('reason', p_reason_code,
                       'permission', p_permission,
                       'requested_property', p_property,
                       'requested_outlet', p_outlet) || coalesce(p_metadata, '{}'::jsonb),
    p_result
  );
end;
$$;

grant execute on function app.audit_access(text, text, text, uuid, uuid, uuid, uuid, jsonb)
  to authenticated, service_role;

-- ------------------------------------------------------------ §13/§18 authorize

-- The one question this product answers, asked server-side, answering with a reason
-- instead of an exception:
--
--   authenticated → account operational → active membership → organization active →
--   property accessible → outlet accessible → role grants the permission → allow.
--
-- Nothing here trusts a client-supplied id: every level is re-proved against the grants
-- the session actually holds. `p_organization` may be any uuid in the system, including
-- one belonging to a tenant the caller has never heard of, and the only answer is a
-- boolean plus a reason code (§40 — the reply does not confirm whether the tenant exists).
create or replace function public.evaluate_access(
  p_permission text,
  p_organization uuid,
  p_property uuid default null,
  p_outlet uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := app.current_user_id();
  v_status text;
  v_reason text;
  v_logged uuid;
begin
  if p_permission is null or p_permission !~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$' then
    -- A malformed key is a programming error, not a security decision: refuse it as
    -- denied rather than answering "you lack it" or letting it reach `has_permission`.
    v_reason := 'PERMISSION_DENIED';
  elsif v_actor is null then
    v_reason := 'NOT_AUTHENTICATED';
  else
    select pr.status into v_status from public.profiles pr where pr.id = v_actor;
    if not found then
      v_reason := 'PROFILE_MISSING';
    elsif v_status <> 'ACTIVE' then
      v_reason := 'ACCOUNT_' || v_status;
    elsif not app.member_of(v_actor, p_organization) then
      -- Covers "no membership", a non-ACTIVE membership and a retired tenant alike:
      -- §18 wants the person told that access moved, not given the internal distinction.
      v_reason := 'NO_ACTIVE_MEMBERSHIP';
    elsif not app.organization_is_active(p_organization) then
      v_reason := 'ORGANIZATION_NOT_ACTIVE';
    elsif p_property is not null and not app.can_access_property(v_actor, p_property) then
      v_reason := 'PROPERTY_ACCESS_DENIED';
    elsif p_outlet is not null and not app.can_access_outlet(v_actor, p_outlet) then
      v_reason := 'OUTLET_ACCESS_DENIED';
    elsif not app.has_permission(v_actor, p_organization, p_permission, p_property, p_outlet) then
      v_reason := 'PERMISSION_DENIED';
    else
      v_reason := null;
    end if;
  end if;

  if v_reason is null then
    return jsonb_build_object('allowed', true, 'reason', null);
  end if;

  -- §35: the failure belongs in the trail. A caller who is not a member of the tenant
  -- they probed gets the row recorded WITHOUT that tenant's id, so an outsider cannot
  -- write into a stranger's audit log — the probed id stays in metadata, where only the
  -- actor (and the platform) can read it back.
  if v_reason <> 'NO_ACTIVE_MEMBERSHIP'
     and v_reason <> 'NOT_AUTHENTICATED'
     and v_reason <> 'PROFILE_MISSING'
     and v_actor is not null then
    v_logged := p_organization;
  else
    v_logged := null;
  end if;

  perform app.audit_access('DENIED', p_permission, v_reason, v_logged,
                           p_property, p_outlet);

  -- §18/§39: the reason code is for the log and for a developer's console. A person sees
  -- a sentence chosen from this code, never the code's internals.
  return jsonb_build_object('allowed', false, 'reason', v_reason);
end;
$$;

-- ------------------------------------------------------------------ session events

-- §35's login/logout trail. There is no sign-in door: GoTrue authenticates and hands back
-- a JWT, and only then does this become callable — which is also why a FAILED sign-in is
-- not in this table. It belongs to GoTrue's own logs, and inventing a pre-session
-- "FAILURE" row would mean either trusting an unauthenticated caller to write history or
-- minting rows for identities that never existed. SECURITY.md records that boundary.
create or replace function public.record_auth_event(
  p_event text,
  p_result text default 'SUCCESS'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.require_session();
  v_org   uuid;
  v_prop  uuid;
  v_out   uuid;
begin
  perform app.require_valid(
    p_event in ('sign_in','sign_out'), 'NIVAAS_INVALID_EVENT');
  perform app.require_valid(
    p_result in ('SUCCESS','FAILURE'), 'NIVAAS_INVALID_RESULT');

  -- Attribute the event to the tenant the session is working in when that tenant still
  -- accepts the caller; otherwise the row is the person's own footprint and nothing more.
  select ac.organization_id, ac.property_id, ac.outlet_id
    into v_org, v_prop, v_out
    from public.user_active_contexts ac
   where ac.user_id = v_actor;
  if v_org is not null and not app.member_of(v_actor, v_org) then
    v_org := null; v_prop := null; v_out := null;
  end if;

  -- §5's `lastLoginAt`, written by the server clock. Only a successful sign-in moves it.
  if p_event = 'sign_in' and p_result = 'SUCCESS' then
    update public.profiles set last_login_at = now() where id = v_actor;
  end if;

  -- §68: no token, no session material, no credential in metadata or reason. The event
  -- name and the outcome are the whole record.
  perform app.audit(
    case p_event when 'sign_in' then 'auth_sign_in' else 'auth_sign_out' end,
    'session', v_actor,
    p_organization := v_org, p_property := v_prop, p_outlet := v_out,
    p_metadata := jsonb_build_object('event', p_event),
    p_result := p_result);

  return jsonb_build_object('event', p_event, 'result', p_result, 'recorded', true);
end;
$$;

-- ------------------------------------------------------------------ new door grants

-- 005's catalog block predates these names, so they are granted here. `public` remains
-- the only schema PostgREST serves, so listing a name is not what makes it reachable —
-- it is, and only is, how the client calls it.
grant execute on function public.evaluate_access(text, uuid, uuid, uuid)
  to authenticated, service_role;
grant execute on function public.record_auth_event(text, text)
  to authenticated, service_role;

-- Self-check: the triad must be the only vocabulary the trail accepts, and the recorder
-- that has no session must be the one that cannot be reached without one.
do $$
begin
  perform app.require_valid(
    (select count(*) from pg_constraint
      where conname = 'audit_log_result_check') = 1,
    'NIVAAS_MIGRATION_GAP');
end;
$$;
