-- Rollback for 20260930120000_handheld_station_type.sql
-- Removes 'handheld' from chk_station_type and restores set_station_capabilities()
-- to its four pre-handheld branches (body taken from production before the
-- migration). SET search_path is kept: every function sets it.
--
-- Refuses to run while any station is still a handheld: the restored CHECK
-- would reject those rows. Re-type or delete them first.

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.stations WHERE station_type = 'handheld';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Rollback blocked: % station(s) still have station_type = handheld', v_count;
  END IF;
END $$;

ALTER TABLE public.stations DROP CONSTRAINT IF EXISTS chk_station_type;
ALTER TABLE public.stations ADD CONSTRAINT chk_station_type
  CHECK (station_type = ANY (ARRAY['register', 'checkout', 'kds', 'self_service']));

CREATE OR REPLACE FUNCTION public.set_station_capabilities()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  CASE NEW.station_type
    WHEN 'register' THEN
      NEW.can_create_orders := TRUE;
      NEW.can_process_payments := TRUE;
      NEW.can_void_orders := FALSE;
      NEW.can_apply_discounts := TRUE;
      NEW.can_update_kitchen_status := FALSE;
      NEW.view_scope := 'location';
    WHEN 'checkout' THEN
      NEW.can_create_orders := TRUE;
      NEW.can_process_payments := TRUE;
      NEW.can_void_orders := TRUE;
      NEW.can_apply_discounts := TRUE;
      NEW.can_update_kitchen_status := FALSE;
      NEW.view_scope := 'location';
    WHEN 'kds' THEN
      NEW.can_create_orders := FALSE;
      NEW.can_process_payments := FALSE;
      NEW.can_void_orders := FALSE;
      NEW.can_apply_discounts := FALSE;
      NEW.can_update_kitchen_status := TRUE;
      NEW.view_scope := 'location';  -- KDS sees ALL orders
    WHEN 'self_service' THEN
      NEW.can_create_orders := TRUE;
      NEW.can_process_payments := TRUE;
      NEW.can_void_orders := FALSE;
      NEW.can_apply_discounts := FALSE;
      NEW.can_update_kitchen_status := FALSE;
      NEW.view_scope := 'own';
  END CASE;
  RETURN NEW;
END;
$function$;
