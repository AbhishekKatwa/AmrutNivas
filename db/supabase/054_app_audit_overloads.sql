-- 054 — the audit shapes the second generation of doors actually call.
--
-- Doors written from 028 onward call app.audit(...) in three shapes the canonical
-- funnel (004, twelve parameters; rebuilt by 010 with `result`) never offered: the
-- seven-argument positional call carrying before/after row images, 031's
-- named-argument call with its own parameter names, and 023's six-argument call that
-- passes actor and organization positionally. `create or replace` installs a body
-- whose missing helper only bites on first execution, so none of this failed at apply
-- time — every one of those doors died at its audit line instead (42883, surfaced by
-- PostgREST as a 404), after doing its real work, and the INSERT went down with it.
--
-- Three overloads, all funneling into public.audit_log under the canonical door's
-- discipline: SECURITY DEFINER (audit_log has no INSERT policy), the session as the
-- default actor, and the action/entity casing translated to what the audit_log CHECK
-- accepts — lower-case snake, so 031's 'PURCHASE_INVOICE.CREATE' is stored as
-- purchase_invoice_create.
--
-- One corpus finding stated rather than hidden: the new-generation callers are not
-- consistent with each other about slot six. 028-030 pass a text reason there (or
-- null); 041's note doors and the hotel files pass a property uuid. One parameter
-- type must win, because two overloads differing only in that slot would make every
-- untyped `null` call ambiguous. Text wins — it serves the purchase chain this phase
-- exercises — so create/update/delete_customer_note (041) and any hotel door passing
-- p_property in that slot remain unresolved, exactly as they are today, and stay on
-- their phases' defect lists. A null entity_id (041's remove_customer_tag) still
-- fails audit_log's NOT NULL: that is the door's own defect, not the funnel's.
--
-- The seven-argument shape carries no organization parameter; it is read back out of
-- the row image the door already passed (after for creates/updates, before for
-- archives and deletes). A door whose row images carry no organization_id records a
-- row with a null organization — recorded, but invisible to tenant reads.

-- --------------------------------------------------------------- the row-image shape

drop function if exists app.audit(text, text, uuid, jsonb, jsonb, text, jsonb);
create or replace function app.audit(
  p_action    text,
  p_entity    text,
  p_entity_id uuid,
  p_before    jsonb default null,
  p_after     jsonb default null,
  p_reason    text default null,
  p_metadata  jsonb default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if p_after is not null and p_after ? 'organization_id' then
    v_org := (p_after ->> 'organization_id')::uuid;
  elsif p_before is not null and p_before ? 'organization_id' then
    v_org := (p_before ->> 'organization_id')::uuid;
  end if;

  insert into public.audit_log
    (actor_id, organization_id, action, entity, entity_id,
     before, after, reason, metadata, result)
  values (
    app.current_user_id(),
    v_org,
    replace(lower(p_action), '.', '_'),
    lower(p_entity),
    p_entity_id::text,
    p_before, p_after, p_reason,
    coalesce(p_metadata, '{}'::jsonb),
    'SUCCESS'
  );
end;
$$;

-- ----------------------------------------------------- the 031 named-argument shape

drop function if exists app.audit(uuid, uuid, text, text, uuid, text, jsonb);
create or replace function app.audit(
  p_organization_id uuid,
  p_actor_id        uuid,
  p_action          text,
  p_entity_type     text,
  p_entity_id       uuid,
  p_result          text default 'SUCCESS',
  p_details         jsonb default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log
    (actor_id, organization_id, action, entity, entity_id, metadata, result)
  values (
    coalesce(p_actor_id, app.current_user_id()),
    p_organization_id,
    replace(lower(p_action), '.', '_'),
    lower(p_entity_type),
    p_entity_id::text,
    coalesce(p_details, '{}'::jsonb),
    coalesce(p_result, 'SUCCESS')
  );
end;
$$;

-- --------------------------------------------------------- the 023 positional shape

drop function if exists app.audit(text, uuid, uuid, uuid, jsonb, jsonb);
create or replace function app.audit(
  p_action       text,
  p_entity_id    uuid,
  p_actor        uuid,
  p_organization uuid,
  p_details      jsonb default null,
  p_before       jsonb default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  -- The shape omits the entity type: derive it from the action's trailing verb
  -- (INVENTORY_ITEM_CREATED -> inventory_item, LOCATION_ARCHIVED -> location).
  insert into public.audit_log
    (actor_id, organization_id, action, entity, entity_id, before, metadata, result)
  values (
    coalesce(p_actor, app.current_user_id()),
    p_organization,
    replace(lower(p_action), '.', '_'),
    regexp_replace(lower(p_action), '_?(created|updated|archived|deleted|restored|posted|converted|status_changed)$', ''),
    p_entity_id::text,
    p_before,
    coalesce(p_details, '{}'::jsonb),
    'SUCCESS'
  );
end;
$$;

grant execute on function app.audit(text, text, uuid, jsonb, jsonb, text, jsonb)
  to authenticated, service_role;
grant execute on function app.audit(uuid, uuid, text, text, uuid, text, jsonb)
  to authenticated, service_role;
grant execute on function app.audit(text, uuid, uuid, uuid, jsonb, jsonb)
  to authenticated, service_role;

-- Transcription guard: the three shapes must exist beside the canonical twelve. If
-- this ever fails, a signature above drifted from the call sites in 023/028-031.
do $$
begin
  if (select count(*) from pg_proc
       where pronamespace = 'app'::regnamespace
         and proname = 'audit'
         and proargtypes::text in (
           '25 25 2950 3802 3802 25 3802',  -- the row-image shape
           '2950 2950 25 25 2950 25 3802',  -- 031's named shape
           '25 2950 2950 2950 3802 3802'    -- 023's positional shape
         )) < 3 then
    raise exception 'AUDIT_OVERLOADS_MISSING';
  end if;
end
$$;
