-- AMRUT NIVAAS · 012 — invitation lifecycle (Prompt #03 §7, §6, §40)
--
-- 005 already did the two hardest things: the token is only ever stored as a SHA-256 hash
-- and the raw secret leaves in exactly one response, and a spent or expired invitation
-- cannot be accepted again. What was missing is the part that only shows up under load or
-- under an attack:
--
--   1. "one pending invitation per address per tenant" was a SELECT-then-INSERT pair. Two
--      concurrent invites for the same person both pass the pre-check, because nothing at
--      the row level disagrees. §7 asks for deterministic duplicate handling, and a
--      pre-check is not deterministic — a UNIQUE index is.
--   2. An expired invitation stayed `INVITED` until someone tried to accept it. That is
--      harmless for acceptance (the door flips it and refuses), but it kept occupying the
--      pending slot: re-inviting that person answered ALREADY_INVITED for a dead link, and
--      the index above would have made that permanent. So expiry is swept on the read and
--      write paths that care, before the duplicate question is ever asked.
--   3. A suspended tenant could be joined through a link issued before the suspension, and
--      a link issued by an administrator who has since been removed could still mint a
--      member. §6 says a removed membership must not retain operational access; a pending
--      invitation is operational access in slow motion.
--   4. `cancel_invitation` answered a stranger's probe of someone else's invitation ID with
--      ACCESS_DENIED, which confirms the row exists (§40).
--   5. `REVOKED` was in the status CHECK but no door could ever write it — a vocabulary
--      word with no meaning. It now means "withdrawn by someone other than the inviter",
--      which is the distinction an audit reader actually wants.

-- ------------------------------------------------------ one pending invite per address

-- Partial, so it constrains only the live state: history (ACCEPTED, EXPIRED, CANCELLED,
-- REVOKED) stays appendable for the same person at the same tenant, which is what an
-- organisation that re-invites someone every season needs. `email` is citext, so the
-- index is case-insensitive for free and cannot be dodged by capitalisation.
create unique index if not exists invitations_one_pending_idx
  on public.invitations (organization_id, email)
  where status = 'INVITED';

-- ------------------------------------------------------------------ expiry sweeping

-- Not a client door: there is no reason for a browser to ask the database to advance a
-- clock. Time, not a person, changes these rows, so no audit entry is written for it —
-- §38's trail is about human actions, and `expires_at` on the row is the evidence.
create or replace function app.expire_stale_invitations(p_organization uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.invitations
     set status = 'EXPIRED'
   where organization_id = p_organization
     and status = 'INVITED'
     and expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- --------------------------------------------------------------------- invite_member

-- Same signature as 005. The added sweep is scoped to this address, so a re-invite after
-- expiry works on the first try instead of needing someone to click the dead link first.
create or replace function public.invite_member(
  p_organization uuid,
  p_email text,
  p_role text,
  p_full_name text default null,
  p_phone text default null,
  p_property_ids uuid[] default '{}',
  p_outlet_ids uuid[] default '{}',
  p_valid_days integer default 14
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.require_session();
  v_role  record;
  v_inv   uuid;
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash  text;
begin
  perform app.require_permission('user.invite', p_organization);
  perform app.require_active_organization(p_organization);

  select * into v_role from public.roles
   where name = upper(p_role) and status = 'ACTIVE'
     and (is_system or organization_id = p_organization);
  perform app.require_valid(v_role.id is not null, 'NIVAAS_ROLE_NOT_FOUND');

  perform app.require_valid(p_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$',
    'NIVAAS_INVALID_EMAIL');
  perform app.require_valid(p_valid_days between 1 and 90, 'NIVAAS_INVALID_EXPIRY');

  -- The scope offered cannot name another tenant's sites (§15), and an outlet-scoped
  -- role must actually be told which outlet.
  perform app.require_valid(
    not exists (select 1 from unnest(p_property_ids) pid
                 where not exists (select 1 from public.properties pr
                                    where pr.id = pid and pr.organization_id = p_organization)),
    'NIVAAS_SCOPE_MISMATCH');
  perform app.require_valid(
    not exists (select 1 from unnest(p_outlet_ids) oid
                 where not exists (select 1 from public.outlets o
                                    where o.id = oid and o.organization_id = p_organization)),
    'NIVAAS_SCOPE_MISMATCH');
  if v_role.scope_level = 'PROPERTY' then
    perform app.require_valid(p_property_ids <> '{}'::uuid[], 'NIVAAS_EMPTY_SELECTION');
  end if;
  if v_role.scope_level = 'OUTLET' then
    perform app.require_valid(p_outlet_ids <> '{}'::uuid[], 'NIVAAS_EMPTY_SELECTION');
  end if;

  -- Retire this address's dead links first, then ask the honest question.
  perform app.expire_stale_invitations(p_organization);

  perform app.require_unique(
    exists (select 1 from public.invitations i
             where i.organization_id = p_organization and i.email = p_email
               and i.status = 'INVITED'),
    'NIVAAS_ALREADY_INVITED');

  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  -- The index is the answer under concurrency; the pre-check above is only there to give
  -- the common case a readable code. Whichever fires, the client sees the same one.
  begin
    insert into public.invitations
      (organization_id, email, phone, full_name, role_id, property_ids, outlet_ids,
       token_hash, invited_by, expires_at)
    values
      (p_organization, p_email, p_phone, p_full_name, v_role.id, p_property_ids, p_outlet_ids,
       v_hash, v_actor, now() + make_interval(days => p_valid_days))
    returning id into v_inv;
  exception when unique_violation then
    if sqlerrm like '%invitations_one_pending_idx%' then
      raise exception 'NIVAAS_ALREADY_INVITED';
    end if;
    raise;
  end;

  perform app.audit('member_invited', 'invitation', v_inv,
    p_organization := p_organization,
    p_after := jsonb_build_object('email', p_email, 'role', v_role.name,
                                  'properties', to_jsonb(p_property_ids),
                                  'outlets', to_jsonb(p_outlet_ids)));

  -- The token leaves once, in this response, and exists nowhere else.
  return jsonb_build_object('invitationId', v_inv, 'token', v_token,
                            'role', v_role.name, 'scope', v_role.scope_level,
                            'expiresAt', (select i.expires_at from public.invitations i where i.id = v_inv));
end;
$$;

-- ------------------------------------------------------------------- accept_invitation

-- The three new walls sit before anything is written. Everything after them is 005's
-- proven join: membership, breadth, one grant per scope target, and the audit rows.
create or replace function public.accept_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := app.require_session();
  v_email  text;
  v_inv    record;
  v_scope  text;
  v_grant  uuid;
  v_grants uuid[];
begin
  select * into v_inv from public.invitations
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  perform app.require_valid(v_inv.id is not null, 'NIVAAS_INVITATION_NOT_FOUND');
  perform app.require_valid(v_inv.status = 'INVITED', 'NIVAAS_INVITATION_NOT_USABLE');
  if v_inv.expires_at < now() then
    update public.invitations set status = 'EXPIRED' where id = v_inv.id;
    raise exception 'NIVAAS_INVITATION_EXPIRED';
  end if;

  -- §6/§28: suspension freezes the tenant, including joins in progress. The link was
  -- issued under a different state of the world and cannot create a member now.
  perform app.require_active_organization(v_inv.organization_id);

  -- A role retired after the invite went out is not authority any more
  -- (011/005's `assign_role` already refuses to grant it), so an invitation cannot be a
  -- side door around that refusal.
  perform app.require_valid(
    exists (select 1 from public.roles r
             where r.id = v_inv.role_id and r.status = 'ACTIVE'),
    'NIVAAS_INVITATION_NOT_USABLE');

  -- And the person who issued it must still be able to. Platform administrators are the
  -- one case where an inviter legitimately holds no membership.
  perform app.require_valid(
    app.member_of(v_inv.invited_by, v_inv.organization_id)
      or app.is_platform_admin(v_inv.invited_by),
    'NIVAAS_INVITATION_NOT_USABLE');

  -- The invitation is for an address, and this session must own that address.
  select email into v_email from public.profiles where id = v_actor;
  perform app.require_valid(v_email is not null and lower(v_email) = lower(v_inv.email::text),
    'NIVAAS_EMAIL_MISMATCH');

  insert into public.organization_memberships
    (user_id, organization_id, status, joined_at)
  values (v_actor, v_inv.organization_id, 'ACTIVE', now())
  on conflict (user_id, organization_id) do update
    set status = 'ACTIVE', joined_at = now(), suspended_at = null, removed_at = null;

  select scope_level into v_scope from public.roles where id = v_inv.role_id;

  -- Breadth first: the outlet-access trigger refuses an outlet whose property the
  -- user cannot reach, so the property rows have to exist before it runs.
  if v_inv.property_ids <> '{}'::uuid[] then
    insert into public.membership_property_access (user_id, organization_id, property_id, mode)
    select v_actor, v_inv.organization_id, pid, 'SELECTED_PROPERTIES'
      from unnest(v_inv.property_ids) pid
    on conflict do nothing;
  elsif v_scope in ('ORGANIZATION','GLOBAL') then
    -- A tenant-wide role implies the whole estate, including sites created later.
    insert into public.membership_property_access (user_id, organization_id, mode)
    values (v_actor, v_inv.organization_id, 'ALL_PROPERTIES')
    on conflict do nothing;
  end if;

  if v_inv.outlet_ids <> '{}'::uuid[] then
    insert into public.membership_outlet_access
      (user_id, organization_id, property_id, outlet_id, mode)
    select v_actor, v_inv.organization_id, o.property_id, o.id, 'SELECTED_OUTLETS'
      from public.outlets o where o.id = any (v_inv.outlet_ids)
    on conflict do nothing;
  elsif v_scope = 'OUTLET' and v_inv.property_ids <> '{}'::uuid[] then
    insert into public.membership_outlet_access (user_id, organization_id, property_id, mode)
    select v_actor, v_inv.organization_id, pid, 'ALL_OUTLETS'
      from unnest(v_inv.property_ids) pid
    on conflict do nothing;
  end if;

  -- One grant per scope target. An earlier draft stored only `(property_ids)[1]`, so a
  -- person invited as a manager of three sites could administratively reach all three
  -- but held the role in one of them — the widest-applicable-grant rule would then
  -- answer "no permission" for the other two. A tenant-wide role has one grant and no
  -- target, which is its own shape (see the 002 grant trigger).
  with targets as (
    select null::uuid as property_id, null::uuid as outlet_id
      where v_scope in ('ORGANIZATION', 'GLOBAL')
    union all
    select case when v_scope = 'OUTLET' then null else t.tid end,
           case when v_scope = 'OUTLET' then t.tid else null end
      from unnest(
        case when v_scope = 'OUTLET' then v_inv.outlet_ids else v_inv.property_ids end
      ) as t(tid)
     where v_scope in ('PROPERTY', 'OUTLET')
  ), grants as (
    insert into public.user_roles
      (user_id, role_id, organization_id, property_id, outlet_id, granted_by)
    select v_actor, v_inv.role_id, v_inv.organization_id,
           targets.property_id, targets.outlet_id, v_inv.invited_by
      from targets
    returning id
  )
  select coalesce(array_agg(id), '{}'::uuid[]) into v_grants from grants;

  update public.invitations
     set status = 'ACCEPTED', accepted_at = now(), accepted_by = v_actor
   where id = v_inv.id;

  perform app.audit('member_accepted', 'invitation', v_inv.id,
    p_organization := v_inv.organization_id,
    p_after := jsonb_build_object('role', v_inv.role_id, 'scope', v_scope));

  -- One history row per grant, so a later "how did they get this?" has an answer.
  foreach v_grant in array v_grants loop
    perform app.audit('role_assigned', 'user_role', v_grant,
      p_organization := v_inv.organization_id,
      p_metadata := jsonb_build_object('via_invitation', v_inv.id));
  end loop;

  return jsonb_build_object('organizationId', v_inv.organization_id,
                            'role', (select name from public.roles where id = v_inv.role_id),
                            'scope', v_scope);
end;
$$;

-- ------------------------------------------------------------------- cancel_invitation

-- Two outcomes, one door, decided by who is asking: the inviter withdrawing their own
-- link is a cancellation; anyone else with `user.invite` killing it is a revocation. The
-- audit verb carries the difference, which is the part a reader of the trail cares about.
create or replace function public.cancel_invitation(p_invitation uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := app.require_session();
  v_before jsonb;
  v_org    uuid;
  v_status text;
  v_action text;
begin
  perform app.require_reason(p_reason);

  select to_jsonb(i) into v_before from public.invitations i where i.id = p_invitation;
  perform app.require_valid(v_before is not null, 'NIVAAS_NOT_FOUND');
  v_org := (v_before->>'organization_id')::uuid;
  -- §40: outside the tenant, that invitation ID does not exist.
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('user.invite', v_org);

  -- An expired link that nobody has clicked yet is still `INVITED`; say which one it is.
  if v_before->>'status' = 'INVITED'
     and (v_before->>'expires_at')::timestamptz < now() then
    update public.invitations set status = 'EXPIRED' where id = p_invitation;
    raise exception 'NIVAAS_INVITATION_EXPIRED';
  end if;

  perform app.require_valid(v_before->>'status' = 'INVITED', 'NIVAAS_INVITATION_NOT_USABLE');

  v_status := case when (v_before->>'invited_by')::uuid = v_actor
                   then 'CANCELLED' else 'REVOKED' end;
  v_action := case v_status when 'CANCELLED' then 'member_invitation_cancelled'
                             else 'member_invitation_revoked' end;

  update public.invitations set status = v_status where id = p_invitation;

  perform app.audit(v_action, 'invitation', p_invitation,
    p_organization := v_org, p_before := v_before,
    p_after := jsonb_build_object('status', v_status), p_reason := p_reason);
  return jsonb_build_object('invitationId', p_invitation, 'status', v_status);
end;
$$;

-- --------------------------------------------------------------------------- grants

-- Unchanged signatures, so 005's catalog grant still covers these three; restated
-- because a re-created function keeps its ACL only if the owner says so out loud.
grant execute on function app.expire_stale_invitations(uuid) to authenticated, service_role;
grant execute on function public.invite_member(uuid, text, text, text, text, uuid[], uuid[], integer)
  to authenticated, service_role;
grant execute on function public.accept_invitation(text) to authenticated, service_role;
grant execute on function public.cancel_invitation(uuid, text) to authenticated, service_role;

-- Self-check: the guarantee this file exists for must be present, or a silent failure to
-- create the index would leave the concurrency hole wide open.
do $$
begin
  perform app.require_valid(
    exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = 'invitations_one_pending_idx'),
    'NIVAAS_MIGRATION_GAP');
end;
$$;
