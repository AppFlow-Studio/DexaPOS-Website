-- =============================================================================
-- KDS device truth capture (Architecture B, server side)
-- =============================================================================
-- Companion to 20260827120000_hq_kds_board_mirror.sql.
--
-- The mirror reconstructs what the SERVER says a station should show. It
-- cannot see the screen: a tablet whose socket dropped, whose app crashed, or
-- whose cache went stale still produces a perfect mirror while the kitchen
-- sees nothing. This migration is the other half -- the tablet reports what it
-- actually received and painted, and HQ diffs that against kds_routing_log.
--
-- THE CLASSIFICATION THIS EXISTS TO PRODUCE
--   server routed + device ack                      -> CONFIRMED
--   server routed + device arrived, no ack           -> RENDER_SUSPECT
--   server routed + nothing, item active, dev online -> NEVER_SHOWED  <-- the bug
--   server routed + nothing, device offline at fire  -> OFFLINE (expected)
--   no routing log + device event exists             -> GHOST (stale cache)
--
-- THIS MIGRATION IS INERT ON DEPLOY.
--   Nothing calls report_kds_device_events until the POS fleet ships the
--   emitter. Until then kds_device_events stays empty and every diff reports
--   NO_DEVICE_DATA, which is honest: absence of device evidence is not
--   evidence of a device fault.
--
-- ---------------------------------------------------------------------------
-- DESIGN NOTE 1 -- tenancy is derived, never accepted
-- ---------------------------------------------------------------------------
--   The device sends kds_display_id and nothing else identifying. merchant_id
--   and location_id are looked up FROM that display. A device that claims a
--   merchant is ignored, because a KDS tablet is a physically accessible
--   device in a kitchen and its payload is not a trust boundary.
--
--   The RPC is anon-tolerant in the same shape as send_order_to_kitchen_v1: if
--   the caller carries a merchant claim it must match the display's merchant;
--   if the caller has no claim (the device auth gap) the derived tenancy
--   stands alone. Closing that gap needs a real device JWT and is B P2.
--
-- ---------------------------------------------------------------------------
-- DESIGN NOTE 2 -- clocks
-- ---------------------------------------------------------------------------
--   Kitchen tablets drift, sleep, and come back with wrong clocks. Every event
--   carries the device's own timestamp AND the server's receipt time, and the
--   RPC records clock_skew_ms once per call from the device's declared
--   client_clock_at. Ordering and retention use received_at (server time);
--   client_event_at is evidence, not an index. A diff that trusted device
--   clocks would mis-order the very timeline it exists to prove.
--
-- ---------------------------------------------------------------------------
-- DESIGN NOTE 3 -- acknowledged_* is NOT reused
-- ---------------------------------------------------------------------------
--   kds_item_status.acknowledged_at already means "the void notice was
--   acknowledged" (20260606040300). It has nothing to do with paint. Reusing
--   it would corrupt the void flow and make both signals unreadable.
--
-- ---------------------------------------------------------------------------
-- DESIGN NOTE 4 -- volume
-- ---------------------------------------------------------------------------
--   Two events per item per display. A busy store firing ~1,500 items/day
--   across 2 displays is ~6,000 rows/day, ~12,000 with the full event set.
--   Retention is 30 days for events (long enough to investigate a complaint
--   that took a fortnight to reach support) and 7 days for snapshots, which
--   are far heavier.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. Ledgers
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.kds_device_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id),
  location_id uuid NOT NULL REFERENCES public.locations(id),
  kds_display_id uuid NOT NULL REFERENCES public.kds_displays(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  -- Device's own clock. Evidence, not an ordering key. See DESIGN NOTE 2.
  client_event_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  clock_skew_ms integer,
  device_origin_id text,
  app_version text,
  CONSTRAINT kds_device_events_type_chk
    CHECK (event_type IN (
      'arrived',          -- payload reached the device
      'ack',              -- device painted it (the 80/20 signal)
      'start_preparing',
      'mark_ready',
      'bump_done',
      'recalled',
      'void_shown',
      'void_cleared'
    ))
);

-- Idempotency: a device retrying an offline buffer must not double-report.
-- Keyed on the device's own event time deliberately -- two genuinely distinct
-- paints of the same item cannot share a client timestamp, but a replayed
-- buffer always will.
CREATE UNIQUE INDEX IF NOT EXISTS idx_kde_idempotent
  ON public.kds_device_events(
    kds_display_id, order_item_id, event_type, client_event_at
  );

CREATE INDEX IF NOT EXISTS idx_kde_item
  ON public.kds_device_events(order_item_id, event_type);
CREATE INDEX IF NOT EXISTS idx_kde_order
  ON public.kds_device_events(order_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_kde_display_time
  ON public.kds_device_events(kds_display_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_kde_loc_time
  ON public.kds_device_events(location_id, received_at DESC);


CREATE TABLE IF NOT EXISTS public.kds_device_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id),
  location_id uuid NOT NULL REFERENCES public.locations(id),
  kds_display_id uuid NOT NULL REFERENCES public.kds_displays(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  payload_hash text NOT NULL,
  ticket_count integer NOT NULL DEFAULT 0,
  item_count integer NOT NULL DEFAULT 0,
  client_captured_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  clock_skew_ms integer,
  device_origin_id text,
  app_version text,
  CONSTRAINT kds_device_snapshots_ticket_count_chk CHECK (ticket_count >= 0),
  CONSTRAINT kds_device_snapshots_item_count_chk CHECK (item_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_kds_display_time
  ON public.kds_device_snapshots(kds_display_id, received_at DESC);


-- ---------------------------------------------------------------------------
-- 2. RLS + append-only guard (cloned from the routing ledgers)
-- ---------------------------------------------------------------------------

ALTER TABLE public.kds_device_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kds_device_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.kds_device_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kds_device_snapshots FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kds_device_events_select_scoped ON public.kds_device_events;
CREATE POLICY kds_device_events_select_scoped
  ON public.kds_device_events
  FOR SELECT
  TO authenticated
  USING (
    public.is_dexapos_admin()
    OR (
      merchant_id = public.user_merchant_id()
      AND location_id = ANY(public.user_location_ids())
    )
  );

DROP POLICY IF EXISTS kds_device_snapshots_select_scoped ON public.kds_device_snapshots;
CREATE POLICY kds_device_snapshots_select_scoped
  ON public.kds_device_snapshots
  FOR SELECT
  TO authenticated
  USING (
    public.is_dexapos_admin()
    OR (
      merchant_id = public.user_merchant_id()
      AND location_id = ANY(public.user_location_ids())
    )
  );

-- No direct write grant for anyone. Devices write only through the RPC, which
-- is SECURITY DEFINER, so a compromised tablet cannot forge arbitrary rows or
-- rewrite history.
REVOKE ALL ON TABLE public.kds_device_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.kds_device_snapshots FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.kds_device_events TO authenticated, service_role;
GRANT SELECT ON TABLE public.kds_device_snapshots TO authenticated, service_role;

DROP TRIGGER IF EXISTS kds_device_events_append_only_guard
  ON public.kds_device_events;
CREATE TRIGGER kds_device_events_append_only_guard
  BEFORE UPDATE OR DELETE ON public.kds_device_events
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_kds_trace_ledger();

DROP TRIGGER IF EXISTS kds_device_snapshots_append_only_guard
  ON public.kds_device_snapshots;
CREATE TRIGGER kds_device_snapshots_append_only_guard
  BEFORE UPDATE OR DELETE ON public.kds_device_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_kds_trace_ledger();

COMMENT ON TABLE public.kds_device_events IS
  'Append-only ledger of what a KDS device reports it received and rendered. Device-attested, not server-derived.';


-- ---------------------------------------------------------------------------
-- 3. The device -> server contract
-- ---------------------------------------------------------------------------
-- p_events is a jsonb array of:
--   { "order_item_id": uuid, "order_id": uuid|null,
--     "event_type": text, "client_event_at": timestamptz }
--
-- The whole batch inserts in ONE set-based statement. A KDS reporting 40 items
-- after a reconnect must not become 40 round trips on a kitchen's WiFi.

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

COMMENT ON FUNCTION public.report_kds_device_events(uuid, jsonb, text, text, timestamptz, jsonb, uuid) IS
  'KDS device reports what it received and rendered. Tenancy is derived from kds_display_id; device-claimed tenancy is never trusted.';

REVOKE ALL ON FUNCTION public.report_kds_device_events(uuid, jsonb, text, text, timestamptz, jsonb, uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_kds_device_events(uuid, jsonb, text, text, timestamptz, jsonb, uuid)
  TO anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 4. The diff -- routed vs seen
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

COMMENT ON FUNCTION public.get_kds_device_truth_for_order(uuid) IS
  'Per item and display: what the server routed, what the device reported, and the resulting routed-vs-seen verdict.';

REVOKE ALL ON FUNCTION public.get_kds_device_truth_for_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_kds_device_truth_for_order(uuid)
  TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 4b. Display truth window -- routed vs seen over time
-- ---------------------------------------------------------------------------
-- The order-scoped RPC answers "this ticket"; this one answers "this display,
-- this window". It FULL OUTER JOINs the server's routing log against the
-- device's events so BOTH sides of the story are visible:
--
--   server routed + device ack                      -> CONFIRMED
--   server routed + device arrived, no ack           -> RENDER_SUSPECT
--   server routed + nothing, item active, dev online -> NEVER_SHOWED  <-- the bug
--   server routed + nothing, device offline at fire  -> OFFLINE (expected)
--   no routing log + device event exists             -> GHOST (stale cache)
--
-- Also returns the raw device-event timeline and the snapshot metadata for the
-- window, so support can draw the device lane without a second round trip.

CREATE OR REPLACE FUNCTION public.get_kds_display_truth_window(
  p_kds_display_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
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
  -- DESIGN NOTE 1: tenancy is derived from the display, never from the caller.
  SELECT d.merchant_id, d.location_id
    INTO v_merchant_id, v_location_id
    FROM public.kds_displays d
   WHERE d.id = p_kds_display_id;

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
    RAISE EXCEPTION 'KDS display % is not accessible', p_kds_display_id
      USING ERRCODE = '42501';
  END IF;

  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RAISE EXCEPTION 'p_from and p_to are required and p_from must not exceed p_to'
      USING ERRCODE = '22023';
  END IF;

  WITH server_rows AS (
    SELECT krl.order_item_id,
           krl.order_id,
           krl.outcome      AS server_outcome,
           krl.fired_at     AS server_fired_at
      FROM public.kds_routing_log krl
     WHERE krl.kds_display_id = p_kds_display_id
       AND krl.fired_at >= p_from
       AND krl.fired_at <= p_to
  ),
  device_rows AS (
    SELECT de.order_item_id,
           de.order_id,
           bool_or(de.event_type = 'arrived') AS arrived,
           bool_or(de.event_type = 'ack')     AS acked,
           count(*)                           AS device_event_count
      FROM public.kds_device_events de
     WHERE de.kds_display_id = p_kds_display_id
       AND de.received_at >= p_from
       AND de.received_at <= p_to
     GROUP BY de.order_item_id, de.order_id
  ),
  combined AS (
    SELECT COALESCE(s.order_item_id, d.order_item_id) AS order_item_id,
           COALESCE(s.order_id, d.order_id)           AS order_id,
           s.server_outcome,
           s.server_fired_at,
           COALESCE(d.arrived, false)                AS arrived,
           COALESCE(d.acked, false)                  AS acked,
           COALESCE(d.device_event_count, 0)         AS device_event_count
      FROM server_rows s
      FULL OUTER JOIN device_rows d
        ON d.order_item_id = s.order_item_id
  ),
  item_truth AS (
    SELECT
      c.order_item_id,
      c.order_id,
      o.order_number,
      COALESCE(oi.open_item_name, oi.item_name) AS item_name,
      oi.kitchen_status,
      c.server_outcome,
      c.server_fired_at,
      c.arrived,
      c.acked,
      c.device_event_count,
      hb.device_online_at_fire,
      anydata.has_any_device_data,
      CASE
        WHEN NOT anydata.has_any_device_data THEN 'NO_DEVICE_DATA'
        WHEN c.server_outcome IS NULL          THEN 'GHOST'
        WHEN c.server_outcome <> 'routed'      THEN 'NOT_ROUTED'
        WHEN c.acked                           THEN 'CONFIRMED'
        WHEN c.arrived                         THEN 'RENDER_SUSPECT'
        WHEN hb.device_online_at_fire IS FALSE THEN 'OFFLINE'
        ELSE 'NEVER_SHOWED'
      END AS verdict
    FROM combined c
    JOIN public.order_items oi ON oi.id = c.order_item_id
    LEFT JOIN public.orders o ON o.id = c.order_id
    CROSS JOIN (
      -- Same per-display "has the fleet shipped the emitter" gate as the
      -- order RPC: absence of device evidence is not evidence of a fault.
      SELECT EXISTS (
        SELECT 1 FROM public.kds_device_events d2
         WHERE d2.kds_display_id = p_kds_display_id
      ) AS has_any_device_data
    ) anydata
    LEFT JOIN LATERAL (
      -- Was the station's device heartbeating within 2 minutes of the fire?
      SELECT EXISTS (
        SELECT 1
          FROM public.device_heartbeats dh
          JOIN public.kds_displays kd ON kd.id = p_kds_display_id
         WHERE dh.station_id = kd.station_id
           AND dh.heartbeat_at BETWEEN c.server_fired_at - interval '2 minutes'
                                   AND c.server_fired_at + interval '2 minutes'
      ) AS device_online_at_fire
    ) hb ON true
  )
  SELECT jsonb_build_object(
    'kds_display_id', p_kds_display_id,
    'merchant_id', v_merchant_id,
    'location_id', v_location_id,
    'window_from', p_from,
    'window_to', p_to,
    'has_any_device_data', EXISTS (
      SELECT 1 FROM public.kds_device_events de
       WHERE de.kds_display_id = p_kds_display_id
    ),
    'summary', COALESCE((
      SELECT jsonb_object_agg(it.verdict, it.cnt)
        FROM (
          SELECT verdict, count(*) AS cnt
            FROM item_truth
           GROUP BY verdict
        ) it
    ), '{}'::jsonb),
    'items', COALESCE((
      SELECT jsonb_agg(row_to_json(x)::jsonb
                       ORDER BY x.server_fired_at DESC NULLS LAST, x.order_item_id)
        FROM item_truth x
    ), '[]'::jsonb),
    'device_events', COALESCE((
      SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.received_at)
        FROM (
          SELECT de.order_item_id,
                 de.order_id,
                 de.event_type,
                 de.client_event_at,
                 de.received_at,
                 de.clock_skew_ms,
                 de.app_version
            FROM public.kds_device_events de
           WHERE de.kds_display_id = p_kds_display_id
             AND de.received_at >= p_from
             AND de.received_at <= p_to
        ) x
    ), '[]'::jsonb),
    'snapshots', COALESCE((
      SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.received_at DESC)
        FROM (
          SELECT s.id,
                 s.received_at,
                 s.client_captured_at,
                 s.ticket_count,
                 s.item_count,
                 s.payload_hash,
                 s.clock_skew_ms,
                 s.app_version
            FROM public.kds_device_snapshots s
           WHERE s.kds_display_id = p_kds_display_id
             AND s.received_at >= p_from
             AND s.received_at <= p_to
        ) x
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.get_kds_display_truth_window(uuid, timestamptz, timestamptz) IS
  'Per display and time window: server-routed vs device-reported items with verdicts, plus the raw device-event and snapshot timeline.';

REVOKE ALL ON FUNCTION public.get_kds_display_truth_window(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_kds_display_truth_window(uuid, timestamptz, timestamptz)
  TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 5. Fleet health
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.v_kds_device_truth_health
WITH (security_invoker = true)
AS
WITH routed AS (
  SELECT
    krl.merchant_id,
    krl.location_id,
    krl.kds_display_id,
    count(*) FILTER (WHERE krl.outcome = 'routed')      AS routed_items,
    count(*) FILTER (
      WHERE krl.outcome = 'routed'
        AND EXISTS (
          SELECT 1 FROM public.kds_device_events de
           WHERE de.order_item_id = krl.order_item_id
             AND de.kds_display_id = krl.kds_display_id
             AND de.event_type = 'ack'
        )
    )                                                   AS acked_items,
    count(*) FILTER (
      WHERE krl.outcome = 'routed'
        AND EXISTS (
          SELECT 1 FROM public.kds_device_events de
           WHERE de.order_item_id = krl.order_item_id
             AND de.kds_display_id = krl.kds_display_id
             AND de.event_type = 'arrived'
        )
    )                                                   AS arrived_items
  FROM public.kds_routing_log krl
  WHERE krl.fired_at >= now() - interval '7 days'
    AND krl.kds_display_id IS NOT NULL
  GROUP BY krl.merchant_id, krl.location_id, krl.kds_display_id
)
SELECT
  r.merchant_id,
  r.location_id,
  r.kds_display_id,
  d.display_name,
  r.routed_items,
  r.arrived_items,
  r.acked_items,
  r.arrived_items - r.acked_items                       AS render_suspect_items,
  r.routed_items - r.arrived_items                      AS unreported_items,
  CASE
    WHEN r.arrived_items = 0 THEN NULL
    ELSE round(100.0 * r.acked_items / r.arrived_items, 1)
  END                                                   AS ack_rate_pct,
  EXISTS (
    SELECT 1 FROM public.kds_device_events de
     WHERE de.kds_display_id = r.kds_display_id
  )                                                     AS device_reporting,
  now()                                                 AS observed_at
FROM routed r
LEFT JOIN public.kds_displays d ON d.id = r.kds_display_id;

REVOKE ALL ON TABLE public.v_kds_device_truth_health FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.v_kds_device_truth_health TO authenticated, service_role;

COMMENT ON VIEW public.v_kds_device_truth_health IS
  'Rolling seven-day per-display routed/arrived/acked counts. device_reporting=false means the display has never reported, so the other columns are not evidence of a fault.';


-- ---------------------------------------------------------------------------
-- 6. Retention
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.purge_kds_device_truth()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_events_deleted integer := 0;
  v_snapshots_deleted integer := 0;
BEGIN
  PERFORM set_config('app.kds_trace_retention', 'on', true);

  DELETE FROM public.kds_device_events
   WHERE received_at < now() - interval '30 days';
  GET DIAGNOSTICS v_events_deleted = ROW_COUNT;

  DELETE FROM public.kds_device_snapshots
   WHERE received_at < now() - interval '7 days';
  GET DIAGNOSTICS v_snapshots_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'device_events_deleted', v_events_deleted,
    'device_snapshots_deleted', v_snapshots_deleted
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.purge_kds_device_truth()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_kds_device_truth() TO service_role;

DO $schedule$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'kds-device-truth-purge') THEN
      PERFORM cron.unschedule('kds-device-truth-purge');
    END IF;

    PERFORM cron.schedule(
      'kds-device-truth-purge',
      '50 3 * * *',
      'SELECT public.purge_kds_device_truth()'
    );
  END IF;
EXCEPTION
  WHEN undefined_table OR undefined_function OR insufficient_privilege THEN
    RAISE NOTICE 'KDS device truth purge was not scheduled; run purge_kds_device_truth() from an approved scheduler.';
END;
$schedule$;


-- =============================================================================
-- SYNTHETIC DEVICE CHECK (run on staging before the RN cutover)
--   SELECT public.report_kds_device_events(
--     '<kds_display_id>'::uuid,
--     jsonb_build_array(jsonb_build_object(
--       'order_item_id', '<order_item_id>',
--       'order_id',      '<order_id>',
--       'event_type',    'arrived',
--       'client_event_at', now()
--     )),
--     'synthetic-device', '0.0.0-test', now()
--   );
--   -- then: SELECT public.get_kds_device_truth_for_order('<order_id>');
--   -- expect that item's verdict to move NO_DEVICE_DATA -> RENDER_SUSPECT,
--   -- and -> CONFIRMED once an 'ack' is reported for the same item.
--
-- ROLLBACK
--   SELECT cron.unschedule('kds-device-truth-purge');
--   DROP VIEW IF EXISTS public.v_kds_device_truth_health;
--   DROP FUNCTION IF EXISTS public.get_kds_device_truth_for_order(uuid);
--   DROP FUNCTION IF EXISTS public.get_kds_display_truth_window(uuid, timestamptz, timestamptz);
--   DROP FUNCTION IF EXISTS public.report_kds_device_events(uuid, jsonb, text, text, timestamptz, jsonb, uuid);
--   DROP FUNCTION IF EXISTS public.purge_kds_device_truth();
--   DROP TABLE IF EXISTS public.kds_device_snapshots;
--   DROP TABLE IF EXISTS public.kds_device_events;
-- =============================================================================
