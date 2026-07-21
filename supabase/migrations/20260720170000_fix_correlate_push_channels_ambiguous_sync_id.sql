-- [OrderOut] Fix `column reference "sync_id" is ambiguous` (42702) in
-- correlate_push_channels_callback.
--
-- The function RETURNS TABLE(sync_id uuid, ...), so `sync_id` is an OUT
-- variable that collided with orderout_menu_sync_results.sync_id in TWO spots,
-- each raising 42702 on a non-orphan push_channels callback (webhook then
-- returned "Internal correlator error" 500):
--   * step 6: unqualified `WHERE sync_id = v_sync.id` -> alias + qualify (res.sync_id).
--   * step 4: `ON CONFLICT (sync_id, delivery_service)` inference column ->
--     reference the unique constraint by name (ON CONSTRAINT uq_sync_result).
-- OUT column names are unchanged (the edge function reads row.sync_id /
-- row.final_status / ...). Everything else is verbatim from prod.
--
-- Idempotent: CREATE OR REPLACE only.

CREATE OR REPLACE FUNCTION public.correlate_push_channels_callback(
  p_oo_menu_id text,
  p_oo_restaurant_id text,
  p_delivery_service text,
  p_status text,
  p_status_code integer,
  p_error_message text,
  p_raw_response jsonb
)
RETURNS TABLE(
  sync_id uuid,
  link_id uuid,
  orderout_restaurant_id uuid,
  reported_count integer,
  expected_count integer,
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
  -- Reference the unique constraint by NAME, not (sync_id, delivery_service):
  -- an ON CONFLICT inference column named `sync_id` also collides with the
  -- RETURNS TABLE out-variable (42702), same root cause as step 6.
  ON CONFLICT ON CONSTRAINT uq_sync_result DO NOTHING;

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

  -- 6. Recompute sync status from the ledger.
  --    Alias + qualify so `sync_id` binds to the column, not the OUT variable
  --    (this WHERE was the source of the 42702 ambiguity error).
  SELECT
    COUNT(*) FILTER (WHERE true),
    COUNT(*) FILTER (WHERE res.status = 'success'),
    COUNT(*) FILTER (WHERE res.status = 'failed')
    INTO v_reported, v_success_count, v_failed_count
    FROM public.orderout_menu_sync_results res
   WHERE res.sync_id = v_sync.id;

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
