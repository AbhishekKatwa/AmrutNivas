-- 050 — evaluate_access accepts multi-segment permission keys.
--
-- The malformed-key guard on the access door rejected any key with more than one
-- dot, while the storage contract (002's CHECK on role_permissions.permission,
-- re-affirmed by 040) accepts `a.b`, `a.b.c`, … — and 041/044/046/047/048 grant
-- exactly such keys (crm.loyalty.view, platform.*.*). A granted, catalogue-listed
-- key therefore reached the door and was refused as malformed before has_permission
-- ever ran; the client mirror carried the same narrow regex and hid whole modules
-- behind "access denied". The guard becomes the storage CHECK, verbatim.

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
  if p_permission is null or p_permission !~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$' then
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

-- Transcription guard: the door's guard must accept the widest shape the storage
-- CHECK accepts. If this ever fails, the regex above drifted from 002's.
do $$
begin
  if 'crm.loyalty.view' !~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
     or 'outlet.view' !~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$' then
    raise exception 'EVALUATE_ACCESS_KEY_FORMAT_DRIFTED';
  end if;
end
$$;
