-- ============================================================================
-- AMRUT NIVAAS — Prompt #05 follow-up (021)
--
-- Adds station info to open_kots so the KDS can filter and display by station.
-- ============================================================================

set local search_path = '';

-- Update open_kots to include station_id and station_name
create or replace function public.open_kots(p_outlet uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.require_session();
  v_org   uuid;
  v_prop  uuid;
  v_out   uuid;
  v_rows  jsonb;
begin
  select o.organization_id, o.property_id, o.id into v_org, v_prop, v_out
    from public.outlets o where o.id = p_outlet;
  perform app.require_valid(v_out is not null, 'NIVAAS_NOT_FOUND');
  perform app.require_tenant_visibility(v_org);
  perform app.require_permission('kot.view', v_org, v_prop, v_out);

  select coalesce(jsonb_agg(v order by v ->> 'firedAt'), '[]'::jsonb) into v_rows
    from (
      select jsonb_build_object(
        'id', k.id,
        'kotNumber', k.kot_number,
        'orderId', k.order_id,
        'orderNumber', o.order_number,
        'businessDate', k.business_date,
        'status', k.status,
        'firedAt', k.fired_at,
        'reprintCount', k.reprint_count,
        'stationId', k.station_id,
        'stationName', ks.name,
        'lineCount', (select count(*) from public.order_items oi
                       where oi.kot_id = k.id and oi.fire_status = 'FIRED')::text,
        'readyCount', (select count(*) from public.order_items oi
                        where oi.kot_id = k.id and oi.fire_status = 'READY')::text
      ) as v
        from public.kitchen_order_tickets k
        join public.orders o on o.id = k.order_id
        left join public.kitchen_stations ks on ks.id = k.station_id
       where k.outlet_id = p_outlet
         and k.status = 'OPEN'
    ) s;

  return jsonb_build_object('outletId', p_outlet, 'kots', v_rows);
end;
$$;
