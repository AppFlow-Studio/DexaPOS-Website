-- KDS device truth: report FIRST arrival (device clock, skew-corrected) and tag
-- the delivery path that produced each `arrived` event.
--
-- Why (2026-09-26 investigation, "KDS receives items in delayed batches"):
--   * report_kds_device_events stamps ONE clock_timestamp() as received_at for
--     every row of a heartbeat flush (60 s cadence, paused while backgrounded).
--   * The KDS screen re-emitted `arrived` for EVERY ticket on its persisted
--     board at every mount / restart / display switch; each re-emission carries
--     a new client_event_at, so the unique index inserts a NEW row.
--   * get_kds_device_truth_for_order read max(received_at) -> the HQ panel's
--     "device received" was the LAST re-emission flush, i.e. the last remount
--     or power-on, not the delivery. Staging: every mass cluster sat 0.6-1.8 s
--     after a device_login_history row, items up to 20 days old, 4-6 rows/item.
--
-- What changes (return shape of get_kds_device_truth_for_order is preserved;
-- keys are only ADDED):
--   * kds_device_events.source (nullable text, NO CHECK constraint - the RPC
--     sanitizes it so an unexpected client value can never abort a flush):
--     broadcast | poll | reconnect | resume | mount | manual | rehydrate | unknown
--   * report_kds_device_events reads e->>'source' (signature unchanged: same
--     7 args + defaults, so PostgREST overload resolution is unaffected and
--     older clients keep working).
--   * get_kds_device_truth_for_order: arrived_at / ack_at / bumped_at are now
--     the FIRST observation on the server clock,
--       min(client_event_at - clock_skew_ms)      (skew = client - server),
--     clamped to >= fired_at (a device clock step cannot report a negative lag);
--     plus first_received_at (= min(received_at), clock-immune, <= ~60 s late),
--     last_reported_at (= the old max(received_at), kept for support) and
--     arrived_source (source of that first arrived row).
--   * v_kds_realtime_lag view: per routed item, kds_realtime_lag_seconds =
--     first arrival (at/after that routing) - kds_routing_log.fired_at, tagged
--     by first_source; NULL + lag_measured=false when the first row is a
--     `rehydrate` re-emission (true first observation lost).

-- ---------------------------------------------------------------------------
-- 1. Column
-- ---------------------------------------------------------------------------
ALTER TABLE public.kds_device_events
  ADD COLUMN IF NOT EXISTS source text;

COMMENT ON COLUMN public.kds_device_events.source IS
  'Client delivery path that put the item on the board when this event was emitted (broadcast|poll|reconnect|resume|mount|manual|rehydrate|unknown). rehydrate/mount rows are re-emissions of an already-present board, not deliveries.';

-- ---------------------------------------------------------------------------
-- 2. Writer: same signature, reads e->>'source'
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_kds_device_events(
  p_kds_display_id uuid,
  p_events jsonb,
  p_device_origin_id text DEFAULT NULL,
  p_app_version text DEFAULT NULL,
  p_client_clock_at timestamptz DEFAULT NULL,
  p_snapshot jsonb DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
)
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
      app_version,
      source
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
      p_app_version,
      -- CASE, not a cast or a CHECK: one unexpected value must not abort the
      -- batch (a rejected batch is retried every heartbeat forever).
      CASE
        WHEN e->>'source' IN ('broadcast','poll','reconnect','resume','mount','manual','rehydrate','unknown')
          THEN e->>'source'
        ELSE NULL
      END
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

-- ---------------------------------------------------------------------------
-- 3. Reader: FIRST arrival on the server clock, not the last flush
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_kds_device_truth_for_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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
      -- Clamp to the fire time: a device clock step between the event and its
      -- flush can only make the corrected time wrong, never the item earlier
      -- than its own routing.
      CASE WHEN dev.first_arrived_client IS NULL THEN NULL
           ELSE GREATEST(dev.first_arrived_client, krl.fired_at) END AS arrived_at,
      CASE WHEN dev.first_ack_client IS NULL THEN NULL
           ELSE GREATEST(dev.first_ack_client, krl.fired_at) END     AS ack_at,
      CASE WHEN dev.first_bump_client IS NULL THEN NULL
           ELSE GREATEST(dev.first_bump_client, krl.fired_at) END    AS bumped_at,
      dev.first_received_at,
      dev.last_reported_at,
      dev.arrived_source,
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
        WHEN dev.first_ack_client IS NOT NULL THEN 'CONFIRMED'
        WHEN dev.first_arrived_client IS NOT NULL THEN 'RENDER_SUSPECT'
        WHEN hb.device_online_at_fire IS FALSE THEN 'OFFLINE'
        ELSE 'NEVER_SHOWED'
      END                                            AS verdict
    FROM public.kds_routing_log krl
    JOIN public.order_items oi ON oi.id = krl.order_item_id
    LEFT JOIN LATERAL (
      -- FIRST observation per event type, on the SERVER clock, counting only
      -- events at or after THIS routing event (a device cannot have received a
      -- routing that has not fired yet; 5 s tolerance for skew error):
      --   client_event_at is the device clock at first observation;
      --   clock_skew_ms = device clock - server clock at flush time.
      -- A remount re-emits board items with a NEW client_event_at, so max()
      -- reported the last remount; min() reports the delivery. When the first
      -- qualifying row is a `rehydrate` re-emission the true first observation
      -- was lost (storage wiped / killed before the flush) and arrived_at is an
      -- UPPER bound — arrived_source tells the consumer.
      SELECT
        min(c.seen_at)     FILTER (WHERE c.event_type = 'arrived')   AS first_arrived_client,
        min(c.seen_at)     FILTER (WHERE c.event_type = 'ack')       AS first_ack_client,
        min(c.seen_at)     FILTER (WHERE c.event_type = 'bump_done') AS first_bump_client,
        min(c.received_at) FILTER (WHERE c.event_type = 'arrived')   AS first_received_at,
        max(c.received_at)                                           AS last_reported_at,
        (array_agg(c.source ORDER BY c.seen_at)
          FILTER (WHERE c.event_type = 'arrived'))[1]                AS arrived_source
      FROM (
        SELECT de.event_type, de.received_at, de.source,
               de.client_event_at - make_interval(secs => COALESCE(de.clock_skew_ms, 0) / 1000.0) AS seen_at
        FROM public.kds_device_events de
        WHERE de.order_item_id = krl.order_item_id
          AND de.kds_display_id = krl.kds_display_id
      ) c
      WHERE c.seen_at >= krl.fired_at - interval '5 seconds'
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

COMMENT ON FUNCTION public.get_kds_device_truth_for_order(uuid) IS
  'Per item and display: what the server routed, when the device FIRST saw/painted it (device clock, skew-corrected, clamped to >= fired_at), first_received_at (first flush), last_reported_at (last flush, support only), arrived_source, and the routed-vs-seen verdict.';

REVOKE ALL ON FUNCTION public.get_kds_device_truth_for_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_kds_device_truth_for_order(uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Monitoring view: kds_realtime_lag_seconds per routed item
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_kds_realtime_lag;
CREATE VIEW public.v_kds_realtime_lag
WITH (security_invoker = true) AS
WITH routed AS (
  SELECT rl.merchant_id, rl.location_id, rl.kds_display_id, rl.kds_display_name,
         rl.order_id, rl.order_item_id, rl.fired_at
  FROM public.kds_routing_log rl
  WHERE rl.outcome = 'routed'
), arrivals AS (
  -- Only events at or after the routing event count (5 s skew tolerance).
  SELECT r.kds_display_id, r.order_item_id, r.fired_at,
         e.received_at, e.source,
         e.client_event_at - make_interval(secs => COALESCE(e.clock_skew_ms, 0) / 1000.0) AS seen_at
  FROM routed r
  JOIN public.kds_device_events e
    ON e.order_item_id = r.order_item_id
   AND e.kds_display_id = r.kds_display_id
   AND e.event_type = 'arrived'
  WHERE e.client_event_at - make_interval(secs => COALESCE(e.clock_skew_ms, 0) / 1000.0)
        >= r.fired_at - interval '5 seconds'
), agg AS (
  SELECT a.kds_display_id, a.order_item_id, a.fired_at,
         min(a.seen_at)                                AS first_arrived_at,
         (array_agg(a.source ORDER BY a.seen_at))[1]   AS first_source,
         min(a.received_at)                            AS first_reported_at,
         count(*)                                      AS arrived_rows
  FROM arrivals a
  GROUP BY a.kds_display_id, a.order_item_id, a.fired_at
)
SELECT r.merchant_id, r.location_id, r.kds_display_id, r.kds_display_name,
       r.order_id, r.order_item_id,
       r.fired_at                         AS routed_at,
       g.first_arrived_at,
       g.first_source,
       g.first_reported_at,
       COALESCE(g.arrived_rows, 0)        AS arrived_rows,
       -- A measurement only when the first qualifying row came from a
       -- delivery path. 'rehydrate' means the board already held the item
       -- when the emitter first saw it this session: the true first
       -- observation was lost, so the lag is unknown, not a number.
       (g.first_arrived_at IS NOT NULL AND g.first_source IS DISTINCT FROM 'rehydrate') AS lag_measured,
       CASE
         WHEN g.first_arrived_at IS NOT NULL AND g.first_source IS DISTINCT FROM 'rehydrate'
           THEN GREATEST(0, EXTRACT(EPOCH FROM (g.first_arrived_at - r.fired_at)))
         ELSE NULL
       END                                AS kds_realtime_lag_seconds
FROM routed r
LEFT JOIN agg g
  ON g.kds_display_id = r.kds_display_id
 AND g.order_item_id = r.order_item_id
 AND g.fired_at = r.fired_at;

COMMENT ON VIEW public.v_kds_realtime_lag IS
  'Per routed item: seconds from server routing (kds_routing_log.fired_at) to the device''s FIRST arrived event at/after that routing, on the server clock, clamped at 0. NULL (lag_measured=false) when the first row is a rehydrate re-emission (true first observation lost) or no device data exists. first_source = mount means the device was off when the item fired (real unavailability).';

GRANT SELECT ON public.v_kds_realtime_lag TO authenticated, service_role;
