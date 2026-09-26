-- Rollback for 20260926130000_kds_device_truth_first_arrival_and_source.sql
--
-- This file is NOT applied automatically; run it manually if the forward
-- migration must be reverted.
--
-- Local:  psql "$DATABASE_URL" -f supabase/migrations/rollback/20260926130000_kds_device_truth_first_arrival_and_source_rollback.sql
-- Remote: paste into the Supabase SQL editor and execute.
--
-- Restores the PROD (hifouuofcaytijrkbvcy) state of 2026-09-26 before the
-- forward migration:
--   1. drops the monitoring view v_kds_realtime_lag (depends on the column);
--   2. restores report_kds_device_events and get_kds_device_truth_for_order to
--      the bodies captured verbatim from prod with pg_get_functiondef:
--        report_kds_device_events       md5 = b88f47819e54447f9573816f2719ac4a
--        get_kds_device_truth_for_order md5 = f30e427448c59afdc9dda0ef7b3dc330
--   3. drops kds_device_events.source (the values recorded since the forward
--      migration are lost — acceptable, the column is diagnostic only).
--
-- Client compatibility: the POS/KDS client on or after commit 432c640a sends a
-- `source` key inside each event; the restored writer reads only the keys it
-- knows, so the extra key is ignored and flushes keep succeeding. The HQ
-- website reads get_kds_device_truth_for_order and tolerates the absence of
-- first_received_at / last_reported_at / arrived_source (they are optional in
-- its type). No OTA rollback is required for a DB rollback.
--
-- Order matters: the view must go before the column it selects.

DROP VIEW IF EXISTS public.v_kds_realtime_lag;

CREATE OR REPLACE FUNCTION public.report_kds_device_events(p_kds_display_id uuid, p_events jsonb, p_device_origin_id text DEFAULT NULL::text, p_app_version text DEFAULT NULL::text, p_client_clock_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_snapshot jsonb DEFAULT NULL::jsonb, p_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_merchant uuid;
  v_merchant_id uuid;
  v_location_id uuid;
  v_now timestamptz := clock_timestamp();
  v_skew_ms integer;
  v_inserted integer := 0;
  v_snapshot_id uuid;
  v_snapshot_hash text;
  v_previous_hash text;
BEGIN
  IF p_kds_display_id IS NULL THEN
    RAISE EXCEPTION 'kds_display_id is required'
      USING ERRCODE = '22023';
  END IF;

  -- DESIGN NOTE 1: tenancy is derived from the display, never from the device.
  SELECT d.merchant_id, d.location_id
    INTO v_merchant_id, v_location_id
    FROM public.kds_displays d
   WHERE d.id = p_kds_display_id;

  IF v_merchant_id IS NULL THEN
    RAISE EXCEPTION 'Unknown KDS display %', p_kds_display_id
      USING ERRCODE = '23503';
  END IF;

  -- Anon-tolerant, same shape as send_order_to_kitchen_v1: enforce the claim
  -- only when the caller actually carries one.
  v_caller_merchant := public.user_merchant_id();
  IF v_caller_merchant IS NOT NULL AND v_caller_merchant <> v_merchant_id THEN
    RAISE EXCEPTION 'KDS display % does not belong to the calling merchant',
      p_kds_display_id
      USING ERRCODE = '42501';
  END IF;

  IF p_client_clock_at IS NOT NULL THEN
    v_skew_ms := (EXTRACT(EPOCH FROM (p_client_clock_at - v_now)) * 1000)::integer;
  END IF;

  IF p_events IS NOT NULL AND jsonb_typeof(p_events) = 'array' THEN
    INSERT INTO public.kds_device_events (
      merchant_id,
      location_id,
      kds_display_id,
      order_id,
      order_item_id,
      event_type,
      client_event_at,
      received_at,
      clock_skew_ms,
      device_origin_id,
      app_version
    )
    SELECT
      v_merchant_id,
      v_location_id,
      p_kds_display_id,
      NULLIF(e->>'order_id', '')::uuid,
      (e->>'order_item_id')::uuid,
      e->>'event_type',
      COALESCE((e->>'client_event_at')::timestamptz, v_now),
      v_now,
      v_skew_ms,
      p_device_origin_id,
      p_app_version
    FROM jsonb_array_elements(p_events) AS e
    -- Drop malformed entries rather than failing the batch: a device that
    -- cannot report is a device we learn nothing from, and one bad row must
    -- not discard the other thirty-nine.
    WHERE e->>'order_item_id' IS NOT NULL
      AND e->>'event_type' IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.order_items oi
         WHERE oi.id = (e->>'order_item_id')::uuid
      )
      -- order_id is informational (FK ON DELETE SET NULL), but a non-existent
      -- one would abort the whole batch with a foreign-key violation. Drop the
      -- row instead; the order_item_id is the correlation key that matters.
      AND (
        e->>'order_id' IS NULL
        OR e->>'order_id' = ''
        OR EXISTS (
          SELECT 1 FROM public.orders o
           WHERE o.id = (e->>'order_id')::uuid
        )
      )
    ON CONFLICT (kds_display_id, order_item_id, event_type, client_event_at)
      DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  END IF;

  IF p_snapshot IS NOT NULL AND jsonb_typeof(p_snapshot) = 'array' THEN
    v_snapshot_hash := md5(p_snapshot::text);

    SELECT s.payload_hash
      INTO v_previous_hash
      FROM public.kds_device_snapshots s
     WHERE s.kds_display_id = p_kds_display_id
     ORDER BY s.received_at DESC, s.id DESC
     LIMIT 1;

    IF v_previous_hash IS DISTINCT FROM v_snapshot_hash THEN
      INSERT INTO public.kds_device_snapshots (
        merchant_id,
        location_id,
        kds_display_id,
        payload,
        payload_hash,
        ticket_count,
        item_count,
        client_captured_at,
        received_at,
        clock_skew_ms,
        device_origin_id,
        app_version
      )
      VALUES (
        v_merchant_id,
        v_location_id,
        p_kds_display_id,
        p_snapshot,
        v_snapshot_hash,
        jsonb_array_length(p_snapshot),
        COALESCE((
          SELECT SUM(COALESCE((t->>'item_count')::int, 0))
            FROM jsonb_array_elements(p_snapshot) AS t
        ), 0),
        p_client_clock_at,
        v_now,
        v_skew_ms,
        p_device_origin_id,
        p_app_version
      )
      RETURNING id INTO v_snapshot_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'events_recorded', v_inserted,
    'snapshot_id', v_snapshot_id,
    'clock_skew_ms', v_skew_ms,
    'server_time', v_now
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_kds_device_truth_for_order(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_merchant_id uuid;
  v_location_id uuid;
  v_result jsonb;
BEGIN
  SELECT o.merchant_id, o.location_id
    INTO v_merchant_id, v_location_id
    FROM public.orders o
   WHERE o.id = p_order_id;

  IF v_merchant_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT (
    public.is_dexapos_admin()
    OR (
      v_merchant_id = public.user_merchant_id()
      AND v_location_id = ANY(public.user_location_ids())
    )
  ) THEN
    RAISE EXCEPTION 'Order % is not accessible', p_order_id
      USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'order_id', p_order_id,
    'merchant_id', v_merchant_id,
    'location_id', v_location_id,
    'has_any_device_data', EXISTS (
      SELECT 1 FROM public.kds_device_events de
       WHERE de.order_id = p_order_id
    ),
    'items', COALESCE(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.item_name), '[]'::jsonb)
  )
  INTO v_result
  FROM (
    SELECT
      krl.order_item_id,
      COALESCE(oi.open_item_name, oi.item_name)      AS item_name,
      krl.kds_display_id,
      krl.kds_display_name,
      krl.outcome                                    AS server_outcome,
      krl.fired_at                                   AS server_fired_at,
      oi.kitchen_status,
      dev.arrived_at,
      dev.ack_at,
      dev.bumped_at,
      hb.device_online_at_fire,
      CASE
        -- Nothing to compare against yet: the fleet has not shipped the
        -- emitter, or this display never has. Say so rather than implying a
        -- fault.
        WHEN NOT EXISTS (
          SELECT 1 FROM public.kds_device_events d2
           WHERE d2.kds_display_id = krl.kds_display_id
        ) THEN 'NO_DEVICE_DATA'
        WHEN krl.outcome <> 'routed' THEN 'NOT_ROUTED'
        WHEN dev.ack_at IS NOT NULL THEN 'CONFIRMED'
        WHEN dev.arrived_at IS NOT NULL THEN 'RENDER_SUSPECT'
        WHEN hb.device_online_at_fire IS FALSE THEN 'OFFLINE'
        ELSE 'NEVER_SHOWED'
      END                                            AS verdict
    FROM public.kds_routing_log krl
    JOIN public.order_items oi ON oi.id = krl.order_item_id
    LEFT JOIN LATERAL (
      SELECT
        max(de.received_at) FILTER (WHERE de.event_type = 'arrived')   AS arrived_at,
        max(de.received_at) FILTER (WHERE de.event_type = 'ack')       AS ack_at,
        max(de.received_at) FILTER (WHERE de.event_type = 'bump_done') AS bumped_at
      FROM public.kds_device_events de
      WHERE de.order_item_id = krl.order_item_id
        AND de.kds_display_id = krl.kds_display_id
    ) dev ON true
    LEFT JOIN LATERAL (
      -- Was the station's device heartbeating within 2 minutes of the fire?
      -- Distinguishes "the kitchen was offline" (expected) from "the kitchen
      -- was online and still never saw it" (the actual bug).
      SELECT EXISTS (
        SELECT 1
          FROM public.device_heartbeats dh
          JOIN public.kds_displays kd ON kd.id = krl.kds_display_id
         WHERE dh.station_id = kd.station_id
           AND dh.heartbeat_at BETWEEN krl.fired_at - interval '2 minutes'
                                   AND krl.fired_at + interval '2 minutes'
      ) AS device_online_at_fire
    ) hb ON true
    WHERE krl.order_id = p_order_id
  ) x;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_kds_device_truth_for_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_kds_device_truth_for_order(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_kds_device_truth_for_order(uuid) IS
  'Per item and display: what the server routed, what the device reported, and the resulting routed-vs-seen verdict.';

ALTER TABLE public.kds_device_events DROP COLUMN IF EXISTS source;
