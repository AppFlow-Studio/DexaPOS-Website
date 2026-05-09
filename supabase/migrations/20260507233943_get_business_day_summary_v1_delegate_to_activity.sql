CREATE OR REPLACE FUNCTION public.get_business_day_summary_v1(
  p_location_id   uuid,
  p_business_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.get_business_day_activity_summary_v1(p_location_id, p_business_date, NULL);
$function$;

GRANT EXECUTE ON FUNCTION public.get_business_day_summary_v1(uuid, date) TO authenticated;
