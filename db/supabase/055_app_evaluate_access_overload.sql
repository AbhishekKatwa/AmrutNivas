-- 055 — the three-argument app.evaluate_access overload the 031 doors call.
--
-- 053 created app.evaluate_access in its five-argument form
-- (user, organization, property, outlet, permission) because that is what the 028+
-- doors use. The seven 031 doors — purchase invoice create/add-items/set-status,
-- supplier payment record/allocate and purchase return create/post — were written
-- against a three-argument form (user, organization, permission) that never existed,
-- so the first statement inside each raised
--   function app.evaluate_access(uuid, uuid, unknown) does not exist
-- which PostgREST surfaces to clients as HTTP 404. This overload repairs those doors:
-- it delegates to the five-argument guard with null property and outlet — the
-- organization-scoped check the 3-arg call sites were written for — and inherits the
-- 053 session check and NIVAAS_* refusal ladder unchanged.

create or replace function app.evaluate_access(
  p_user_id      uuid,
  p_organization uuid,
  p_permission   text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform app.evaluate_access(p_user_id, p_organization, null, null, p_permission);
end;
$$;

grant execute on function app.evaluate_access(uuid, uuid, text) to anon, authenticated;
