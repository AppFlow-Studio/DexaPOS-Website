-- Keep support dashboard assignment metrics aligned with HQ email assignees.
-- A ticket is unassigned only when neither the legacy user assignment nor an
-- HQ developer email assignment is present.

CREATE OR REPLACE FUNCTION public.get_support_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_open_count integer;
  v_unassigned_count integer;
  v_avg_first_response numeric;
  v_avg_resolution numeric;
  v_tickets_today integer;
BEGIN
  SELECT count(*) INTO v_open_count
  FROM public.support_tickets
  WHERE status IN ('open', 'in_progress', 'waiting_on_merchant');

  SELECT count(*) INTO v_unassigned_count
  FROM public.support_tickets
  WHERE status IN ('open', 'in_progress')
    AND assigned_to IS NULL
    AND cardinality(coalesce(assigned_to_emails, '{}'::text[])) = 0;

  SELECT round(
    avg(extract(epoch FROM (first_response_at - created_at)) / 3600)::numeric,
    1
  )
  INTO v_avg_first_response
  FROM public.support_tickets
  WHERE first_response_at IS NOT NULL
    AND created_at >= now() - interval '30 days';

  SELECT round(
    avg(extract(epoch FROM (resolved_at - created_at)) / 3600)::numeric,
    1
  )
  INTO v_avg_resolution
  FROM public.support_tickets
  WHERE resolved_at IS NOT NULL
    AND created_at >= now() - interval '30 days';

  SELECT count(*) INTO v_tickets_today
  FROM public.support_tickets
  WHERE created_at >= date_trunc('day', now());

  RETURN jsonb_build_object(
    'open_count', coalesce(v_open_count, 0),
    'unassigned_count', coalesce(v_unassigned_count, 0),
    'avg_first_response_hours', coalesce(v_avg_first_response, 0),
    'avg_resolution_hours', coalesce(v_avg_resolution, 0),
    'tickets_today', coalesce(v_tickets_today, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_support_dashboard_stats()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_support_dashboard_stats()
  TO service_role;
