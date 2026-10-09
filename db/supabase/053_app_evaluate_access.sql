-- 053 — the app-schema access guard the 028+ doors actually call.
--
-- Doors from 028 onward open with
--   perform app.evaluate_access(v_user_id, p_organization, p_property, p_outlet, 'key');
-- but evaluate_access was only ever defined as public.evaluate_access(permission,
-- organization, …) — 010, re-keyed by 050. The app-schema name was never created, so
-- once 052 restored require_session the very next statement inside every such door
-- raised `function app.evaluate_access(...) does not exist`, which PostgREST surfaces
-- to clients as HTTP 404. This is that missing function: it checks that the claimed
-- user is the live session's user, delegates to public.evaluate_access (which keeps
-- §35 denial auditing), and turns a denial into the NIVAAS_* refusal ladder.

create or replace function app.evaluate_access(
  p_user_id      uuid,
  p_organization uuid,
  p_property     uuid,
  p_outlet       uuid,
  p_permission   text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_user_id is null or p_user_id <> app.current_user_id() then
    raise exception 'NIVAAS_NO_SESSION';
  end if;

  v_result := public.evaluate_access(p_permission, p_organization, p_property, p_outlet);
  if coalesce(v_result ->> 'allowed', 'false') <> 'true' then
    raise exception 'NIVAAS_%', coalesce(v_result ->> 'reason', 'PERMISSION_DENIED');
  end if;
end;
$$;

grant execute on function app.evaluate_access(uuid, uuid, uuid, uuid, text) to anon, authenticated;
