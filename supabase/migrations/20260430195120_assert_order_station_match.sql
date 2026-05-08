CREATE OR REPLACE FUNCTION public._assert_order_station_match(
  p_order_id uuid,
  p_station_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner_station_id uuid;
BEGIN
  IF p_station_id IS NULL THEN
    RETURN;
  END IF;

  SELECT station_id
  INTO v_owner_station_id
  FROM public.orders
  WHERE id = p_order_id;

  IF v_owner_station_id IS NOT NULL AND v_owner_station_id <> p_station_id THEN
    RAISE EXCEPTION 'ORDER_OWNED_BY_OTHER_STATION (owner=%, caller=%)',
      v_owner_station_id, p_station_id
      USING HINT = 'Call claim_order_v1 to transfer ownership before mutating.';
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public._assert_order_station_match(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public._assert_order_station_match(uuid, uuid) IS
'Lever 2 — raises ORDER_OWNED_BY_OTHER_STATION when caller''s station doesn''t own the order. Pass NULL p_station_id to bypass (backwards-compat for legacy clients). Wire into hot-path mutation RPCs in a follow-up wave.';;