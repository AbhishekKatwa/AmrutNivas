-- 052 — the two-argument session guard the 028+ doors call.
--
-- Every door written from 028 onward opens with
--   v_user_id uuid := app.current_user_id();
--   perform app.require_session(v_user_id, null);
-- but no migration ever defined that two-argument form — only the zero-argument
-- guard from 005/008 exists. PL/pgSQL bodies bind helpers at execution time, so
-- all of those doors installed cleanly and failed only on first use with
-- 42883 "function app.require_session(uuid, unknown) does not exist", which
-- PostgREST surfaces as HTTP 404. This adds the missing overload with the same
-- refusal ladder as the zero-argument guard; the permission argument is kept
-- because every caller passes it (always null today) and dropping it would be
-- a second, silent signature decision.
--
-- The guard re-derives the live session user and refuses if the caller-passed
-- actor is not that user, so a door's captured actor can never outlive the
-- request it came from.

create or replace function app.require_session(
  p_user_id   uuid,
  p_permission text default null
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_live   uuid;
  v_status text;
begin
  v_live := app.current_user_id();
  if p_user_id is null or v_live is null or p_user_id <> v_live then
    raise exception 'NIVAAS_NO_SESSION';
  end if;

  select pr.status into v_status from public.profiles pr where pr.id = p_user_id;
  if not found then
    raise exception 'NIVAAS_PROFILE_MISSING';
  end if;
  if v_status <> 'ACTIVE' then
    raise exception 'NIVAAS_ACCOUNT_%', v_status;
  end if;

  return p_user_id;
end;
$$;

grant execute on function app.require_session(uuid, text) to anon, authenticated;
