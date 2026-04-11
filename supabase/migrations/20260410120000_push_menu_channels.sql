-- ============================================================================
-- Push Menu to Connected Delivery Channels
-- Adds infrastructure for the "Push to Channels" fan-out flow:
--   * Expands orderout_menu_syncs.sync_direction to include 'push_channels'
--   * Adds expected_channels / triggered_by_user_id / trigger_source columns
--   * New idempotency ledger: orderout_menu_sync_results
--   * Partial index for fast webhook lookup of active push_channels syncs
--   * RPC: correlate_push_channels_callback()  — atomic webhook correlator
--   * RPC: reconcile_stuck_push_channels_syncs() — lazy stale-row reconciler
-- ============================================================================

-- 1.1 Expand sync_direction CHECK constraint to include 'push_channels'
ALTER TABLE public.orderout_menu_syncs
  DROP CONSTRAINT IF EXISTS chk_menu_syncs_direction;
ALTER TABLE public.orderout_menu_syncs
  DROP CONSTRAINT IF EXISTS orderout_menu_syncs_sync_direction_check;
ALTER TABLE public.orderout_menu_syncs
  ADD CONSTRAINT orderout_menu_syncs_sync_direction_check
  CHECK (sync_direction IN ('push', 'pull', 'push_channels'));

-- 1.2 Add columns for channel fan-out tracking
ALTER TABLE public.orderout_menu_syncs
  ADD COLUMN IF NOT EXISTS expected_channels text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS triggered_by_user_id text,
  ADD COLUMN IF NOT EXISTS trigger_source text;

COMMENT ON COLUMN public.orderout_menu_syncs.expected_channels IS
  'Channels expected to report back for a push_channels sync, snapshotted at trigger time.';
COMMENT ON COLUMN public.orderout_menu_syncs.trigger_source IS
  'Who initiated the sync: merchant | admin | auto';

-- 1.3 Idempotency ledger for per-channel callback results
CREATE TABLE IF NOT EXISTS public.orderout_menu_sync_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_id uuid NOT NULL REFERENCES public.orderout_menu_syncs(id) ON DELETE CASCADE,
  delivery_service text NOT NULL,
  status text NOT NULL,
  status_code int,
  error_message text,
  raw_response jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_sync_result UNIQUE (sync_id, delivery_service)
);

CREATE INDEX IF NOT EXISTS idx_sync_results_sync_id
  ON public.orderout_menu_sync_results(sync_id);

ALTER TABLE public.orderout_menu_sync_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "oo_sync_results_select_own" ON public.orderout_menu_sync_results;
CREATE POLICY "oo_sync_results_select_own"
  ON public.orderout_menu_sync_results FOR SELECT
  USING (EXISTS (
    SELECT 1
    FROM public.orderout_menu_syncs s
    JOIN public.orderout_restaurants r ON r.id = s.orderout_restaurant_id
    WHERE s.id = orderout_menu_sync_results.sync_id
      AND public.is_merchant_admin(r.merchant_id)
  ));
-- No INSERT/UPDATE/DELETE policies: only service-role (edge function) writes.

GRANT SELECT ON public.orderout_menu_sync_results TO authenticated;
GRANT ALL ON public.orderout_menu_sync_results TO service_role;

-- 1.4 Partial index for fast webhook correlation lookups
CREATE INDEX IF NOT EXISTS idx_oo_menu_syncs_push_channels_active
  ON public.orderout_menu_syncs(orderout_restaurant_id, menu_id, created_at DESC)
  WHERE sync_direction = 'push_channels'
    AND sync_status IN ('pending', 'syncing');

-- 1.5 Atomic correlator RPC called by the webhook
CREATE OR REPLACE FUNCTION public.correlate_push_channels_callback(
  p_oo_menu_id text,
  p_oo_restaurant_id text,
  p_delivery_service text,
  p_status text,
  p_status_code int,
  p_error_message text,
  p_raw_response jsonb
)
RETURNS TABLE (
  sync_id uuid,
  link_id uuid,
  orderout_restaurant_id uuid,
  reported_count int,
  expected_count int,
  final_status text,
  was_duplicate boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_link RECORD;
  v_sync RECORD;
  v_rows_inserted int := 0;
  v_was_duplicate boolean := false;
  v_reported int := 0;
  v_expected int := 0;
  v_success_count int := 0;
  v_failed_count int := 0;
  v_new_status text;
  v_channel_update jsonb;
  v_now timestamptz := now();
BEGIN
  -- 1. Resolve the menu link by oo_menu_id, tiebreaking on oo_restaurant_id.
  IF p_oo_restaurant_id IS NOT NULL AND p_oo_restaurant_id <> '' THEN
    SELECT l.id, l.orderout_restaurant_id, l.menu_id
      INTO v_link
      FROM public.orderout_menu_links l
      JOIN public.orderout_restaurants r ON r.id = l.orderout_restaurant_id
     WHERE l.oo_menu_id = p_oo_menu_id
       AND r.oo_restaurant_id = p_oo_restaurant_id
     LIMIT 1;
  END IF;

  IF v_link IS NULL THEN
    SELECT l.id, l.orderout_restaurant_id, l.menu_id
      INTO v_link
      FROM public.orderout_menu_links l
     WHERE l.oo_menu_id = p_oo_menu_id
     LIMIT 1;
  END IF;

  IF v_link IS NULL THEN
    RAISE EXCEPTION 'no_matching_link' USING ERRCODE = 'P0002';
  END IF;

  -- 2. Lock the latest active push_channels sync for this (restaurant, menu)
  SELECT s.*
    INTO v_sync
    FROM public.orderout_menu_syncs s
   WHERE s.orderout_restaurant_id = v_link.orderout_restaurant_id
     AND s.menu_id = v_link.menu_id
     AND s.sync_direction = 'push_channels'
     AND s.sync_status IN ('pending', 'syncing')
     AND s.created_at > v_now - interval '15 minutes'
   ORDER BY s.created_at DESC
   LIMIT 1
   FOR UPDATE;

  -- Build the JSONB update that will be merged onto links + restaurants
  v_channel_update := jsonb_build_object(
    p_delivery_service,
    jsonb_build_object(
      'status', p_status,
      'last_updated', to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'last_error', p_error_message
    )
  );

  -- 3. Orphan path: no active sync to correlate with.
  --    Still merge platform_statuses + connected_channels so the UI reflects reality.
  IF v_sync IS NULL THEN
    PERFORM public.merge_orderout_platform_statuses(v_link.id, v_channel_update);
    PERFORM public.merge_orderout_connected_channels(v_link.orderout_restaurant_id, v_channel_update);

    sync_id := NULL;
    link_id := v_link.id;
    orderout_restaurant_id := v_link.orderout_restaurant_id;
    reported_count := 0;
    expected_count := 0;
    final_status := 'orphan';
    was_duplicate := false;
    RETURN NEXT;
    RETURN;
  END IF;

  -- 4. Insert the result row; ON CONFLICT DO NOTHING makes replays idempotent.
  INSERT INTO public.orderout_menu_sync_results (
    sync_id, delivery_service, status, status_code, error_message, raw_response
  )
  VALUES (
    v_sync.id, p_delivery_service, p_status, p_status_code, p_error_message, p_raw_response
  )
  ON CONFLICT (sync_id, delivery_service) DO NOTHING;

  GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;
  v_was_duplicate := (v_rows_inserted = 0);

  -- 5. Append to pushed_to_channels (dedupe)
  IF NOT v_was_duplicate THEN
    UPDATE public.orderout_menu_syncs
       SET pushed_to_channels =
             CASE
               WHEN pushed_to_channels IS NULL THEN ARRAY[p_delivery_service]
               WHEN p_delivery_service = ANY (pushed_to_channels) THEN pushed_to_channels
               ELSE array_append(pushed_to_channels, p_delivery_service)
             END
     WHERE id = v_sync.id;
  END IF;

  -- 6. Recompute sync status from the ledger
  SELECT
    COUNT(*) FILTER (WHERE true),
    COUNT(*) FILTER (WHERE status = 'success'),
    COUNT(*) FILTER (WHERE status = 'failed')
    INTO v_reported, v_success_count, v_failed_count
    FROM public.orderout_menu_sync_results
   WHERE sync_id = v_sync.id;

  v_expected := COALESCE(array_length(v_sync.expected_channels, 1), 0);

  IF v_reported >= v_expected AND v_expected > 0 THEN
    IF v_failed_count = 0 AND v_success_count > 0 THEN
      v_new_status := 'success';
    ELSIF v_success_count > 0 AND v_failed_count > 0 THEN
      v_new_status := 'partial';
    ELSIF v_failed_count > 0 AND v_success_count = 0 THEN
      v_new_status := 'failed';
    ELSE
      v_new_status := 'syncing';
    END IF;
  ELSE
    v_new_status := 'syncing';
  END IF;

  -- 7. Update the sync row
  UPDATE public.orderout_menu_syncs
     SET sync_status = v_new_status,
         synced_at = CASE
           WHEN v_new_status IN ('success', 'failed', 'partial') THEN v_now
           ELSE synced_at
         END
   WHERE id = v_sync.id;

  -- 8. Merge JSONB state onto links + restaurants
  PERFORM public.merge_orderout_platform_statuses(v_link.id, v_channel_update);
  PERFORM public.merge_orderout_connected_channels(v_link.orderout_restaurant_id, v_channel_update);

  -- 9. Return correlator results
  sync_id := v_sync.id;
  link_id := v_link.id;
  orderout_restaurant_id := v_link.orderout_restaurant_id;
  reported_count := v_reported;
  expected_count := v_expected;
  final_status := v_new_status;
  was_duplicate := v_was_duplicate;
  RETURN NEXT;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.correlate_push_channels_callback(
  text, text, text, text, int, text, jsonb
) TO service_role;

-- 1.6 Lazy reconciler for stuck push_channels syncs
CREATE OR REPLACE FUNCTION public.reconcile_stuck_push_channels_syncs(
  p_stale_minutes int DEFAULT 5
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count int;
BEGIN
  WITH updated AS (
    UPDATE public.orderout_menu_syncs
       SET sync_status = 'failed',
           error_details = to_jsonb(
             'timeout: no callback within ' || p_stale_minutes || ' minutes'
           ),
           synced_at = now()
     WHERE sync_direction = 'push_channels'
       AND sync_status IN ('pending', 'syncing')
       AND created_at < now() - make_interval(mins => p_stale_minutes)
     RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM updated;

  RETURN COALESCE(v_count, 0);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reconcile_stuck_push_channels_syncs(int)
  TO authenticated, service_role;
