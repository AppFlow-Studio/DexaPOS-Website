CREATE OR REPLACE FUNCTION public.get_business_day_summary_v1(
  p_location_id uuid,
  p_business_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_bounds RECORD;
  v_batches jsonb;
  v_totals jsonb;
BEGIN
  IF NOT (p_location_id = ANY(user_location_ids())) THEN
    RAISE EXCEPTION 'Access denied: location not in user scope';
  END IF;

  SELECT * INTO v_bounds FROM get_business_day_bounds(p_location_id, p_business_date);

  SELECT COALESCE(jsonb_agg(get_batch_summary_v1(b.id) ORDER BY b.created_at), '[]'::jsonb)
    INTO v_batches
    FROM settlement_batches b
   WHERE b.location_id = p_location_id
     AND b.created_at >= v_bounds.start_ts
     AND b.created_at <  v_bounds.end_ts;

  SELECT jsonb_build_object(
    'batch_count',  jsonb_array_length(v_batches),
    'gross',        COALESCE(SUM((b->'sales'->>'gross')::numeric), 0),
    'refunds',      COALESCE(SUM((b->'refunds'->>'amount')::numeric), 0),
    'net_deposit',  COALESCE(SUM((b->'net'->>'net_deposit')::numeric), 0),
    'tip_total',    COALESCE(SUM((b->'adjustments'->>'tip_total')::numeric), 0),
    'voids_count',  COALESCE(SUM((b->'counts'->>'voids')::int), 0),
    'approvals',    COALESCE(SUM((b->'counts'->>'approvals')::int), 0),
    'refunds_count',COALESCE(SUM((b->'counts'->>'refunds')::int), 0)
  )
    INTO v_totals
    FROM jsonb_array_elements(v_batches) b;

  RETURN jsonb_build_object(
    'business_day', jsonb_build_object(
      'location_id',   p_location_id,
      'business_date', COALESCE(p_business_date, (v_bounds.start_ts AT TIME ZONE 'UTC')::date),
      'start_ts',      v_bounds.start_ts,
      'end_ts',        v_bounds.end_ts
    ),
    'batches', v_batches,
    'totals',  v_totals
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_business_day_summary_v1(uuid, date) TO authenticated;

COMMENT ON FUNCTION public.get_business_day_summary_v1 IS
  'Business-day rollup of all settlement batches for a location. Wraps get_batch_summary_v1 per row plus daily totals. Uses get_business_day_bounds for the time window.';
