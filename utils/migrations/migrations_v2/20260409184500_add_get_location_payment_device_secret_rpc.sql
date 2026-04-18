create or replace function public.get_location_payment_device_secret(
  p_location_id uuid,
  p_device_id uuid default null
)
returns table (
  device_id uuid,
  tpn text,
  decrypted_secret text
)
language plpgsql
security definer
set search_path = public, vault
as $function$
declare
  v_device public.location_payment_devices%rowtype;
begin
  if p_device_id is not null then
    select *
    into v_device
    from public.location_payment_devices lpd
    where lpd.id = p_device_id
      and lpd.location_id = p_location_id
      and lpd.is_active = true
    limit 1;
  else
    select *
    into v_device
    from public.location_payment_devices lpd
    where lpd.location_id = p_location_id
      and lpd.is_active = true
      and lpd.use_for_online_ordering = true
    order by lpd.updated_at desc, lpd.created_at desc
    limit 1;
  end if;

  if v_device.id is null then
    return;
  end if;

  return query
  select
    v_device.id,
    v_device.tpn,
    ds.decrypted_secret
  from vault.decrypted_secrets ds
  where ds.id = v_device.ftd_ecom_key_secret_id
  limit 1;
end;
$function$;

revoke all on function public.get_location_payment_device_secret(uuid, uuid) from public;
grant execute on function public.get_location_payment_device_secret(uuid, uuid) to service_role;
