-- =============================================================================
-- HQ KDS board mirror + on-arrival board snapshots (Architecture A, P0 + P1)
-- =============================================================================
-- Source: Notion "KDS live mirror + device truth", triggered by Charcoal
-- Gardenia "orders are not sending to KDS".
--
-- WHAT THIS GIVES SUPPORT
--   1. hq_get_kds_board_mirror_v1  -- HQ reads the SAME board the tablet reads,
--      through the SAME RPC, with the SAME parameters. If the mirror shows a
--      ticket the kitchen says it never saw, the server did its job and the
--      fault is device-side. If the mirror is missing it too, it is ours.
--   2. kds_board_snapshots -- an append-only ledger of the board as it stood at
--      each arrival / ready / served event, so a complaint can be replayed
--      after the fact instead of argued about.
--
-- WHAT THIS DELIBERATELY DOES NOT GIVE YOU
--   This reconstructs what the server says the station SHOULD show. It cannot
--   see the physical screen. A tablet whose realtime socket dropped, whose app
--   crashed, or whose cache is stale will still produce a perfect mirror here.
--   Proving what was actually rendered needs device-side ack reporting
--   (Architecture B). The HQ UI states this limitation on the page itself.
--
-- ---------------------------------------------------------------------------
-- DESIGN NOTE 1 -- why arrival capture runs at COMMIT and not inside
-- route_items_to_kds()
-- ---------------------------------------------------------------------------
--   trg_route_items_to_kds is FOR EACH ROW. Capturing the board from inside it
--   would snapshot after the FIRST item of a send is routed, so every other
--   item in the same statement would be missing from its own "on arrival"
--   snapshot -- precisely the evidence the snapshot exists to preserve. It
--   would also write one board per item per display (write amplification).
--
--   The obvious alternative -- an AFTER STATEMENT trigger with transition
--   tables -- is not available here. Postgres rejects transition tables on a
--   trigger that carries a column list:
--       ERROR: 0A000: transition tables cannot be specified for triggers
--              with column lists
--   and dropping `UPDATE OF sent_to_kitchen_at` to get them would make EVERY
--   update statement on order_items -- the hottest write path in the system --
--   materialise OLD and NEW tuplestores, whether or not anything fired.
--
--   So arrival capture is a DEFERRABLE INITIALLY DEFERRED constraint trigger.
--   Its WHEN clause still filters per row at modification time (constraint
--   triggers explicitly do NOT defer WHEN evaluation, so the cheap filter stays
--   cheap), while the body runs once at COMMIT. That is strictly more accurate
--   than end-of-statement: a send spread across several statements yields one
--   complete final board instead of one partial board per statement. A
--   transaction-local GUC collapses the per-row firings down to one capture per
--   (location, display).
--
--   The UPDATE trigger's WHEN keeps the row trigger's own NULL -> NOT NULL
--   guard. That is load-bearing: bulk_update_order_item_status_v2 lists
--   sent_to_kitchen_at in its SET clause on every status change, so without it
--   a ready/served update would be mislabelled as an arrival.
--
-- ---------------------------------------------------------------------------
-- DESIGN NOTE 2 -- cost on the send hot path
-- ---------------------------------------------------------------------------
--   Each snapshot is one get_kds_tickets_v3 call. v3 is the location-scoped
--   projection from AUD-8, which eliminated 94-99% of v2's work, so this is a
--   few milliseconds per active display -- not v2's 42.75 ms platform-wide
--   figure. A two-display store pays roughly one extra digit of milliseconds
--   per send. Snapshots are additionally hash-deduped against the previous
--   snapshot for that display, so idle re-fires do not accumulate rows.
--
-- ---------------------------------------------------------------------------
-- DESIGN NOTE 3 -- why the status array is pinned
-- ---------------------------------------------------------------------------
--   stores/useKDSStore.ts (POS repo) builds `params` as p_location_id plus an
--   optional p_kds_display_id and never sends p_statuses, so the tablet runs on
--   get_kds_tickets_v3's default ARRAY['sent','preparing','ready']. The mirror
--   pins that array literally rather than inheriting the default, so a future
--   change to the default cannot silently desynchronise HQ from the kitchen.
--   The Done column is NOT a fourth status: v3 derives done tickets from
--   kitchen_status = 'served' within its one-hour done-retention window.
--
-- ---------------------------------------------------------------------------
-- DESIGN NOTE 4 -- correlate on order_item_id, never ticket_id
-- ---------------------------------------------------------------------------
--   get_kds_tickets ticket_id has documented staging/prod drift (floor-ms vs
--   seconds; see 20260815130000_wave2_get_kds_tickets_v3.sql). Snapshots store
--   whole boards verbatim, so they inherit whatever ticket_id the environment
--   produces. Anything that joins a snapshot to routing evidence must key on
--   order_item_id.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. The mirror wrapper
-- ---------------------------------------------------------------------------
-- get_kds_tickets_v3 is SECURITY DEFINER and applies NO tenancy check of its
-- own -- it will project any location it is handed. The is_dexapos_admin()
-- gate below is therefore the entire access control for this path, not a
-- convenience. The web layer additionally asserts hq.support.view.
--
-- The return value is the byte-identical v3 payload, unwrapped. No envelope,
-- no re-shaping, no re-implementation of ticket grouping: any divergence
-- between this and the tablet would defeat the point of the tool.

CREATE OR REPLACE FUNCTION public.hq_get_kds_board_mirror_v1(
  p_location_id uuid,
  p_kds_display_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_dexapos_admin() THEN
    RAISE EXCEPTION 'hq_get_kds_board_mirror_v1 requires Dexa HQ access'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_location_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Pinned params. See DESIGN NOTE 3.
  RETURN COALESCE(
    public.get_kds_tickets_v3(
      p_location_id,
      ARRAY['sent', 'preparing', 'ready']::text[],
      p_kds_display_id
    ),
    '[]'::jsonb
  );
END;
$function$;

COMMENT ON FUNCTION public.hq_get_kds_board_mirror_v1(uuid, uuid) IS
  'HQ-only mirror of a KDS station board. Pass-through to get_kds_tickets_v3 with pinned params so the output is byte-identical to what the tablet fetches.';

REVOKE ALL ON FUNCTION public.hq_get_kds_board_mirror_v1(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hq_get_kds_board_mirror_v1(uuid, uuid)
  TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 2. HQ display picker source
-- ---------------------------------------------------------------------------
-- kds_displays is RLS-scoped to the owning merchant, so HQ cannot simply
-- SELECT it for an arbitrary location. This returns the picker payload plus
-- the two configuration fields that explain most "wrong things on my screen"
-- reports (show_all_items, which floods every display, and routing_mode) plus
-- the layout config the HQ mirror needs to draw the station the way the
-- station draws itself.
--
-- LAYOUT FIELDS AND WHAT ACTUALLY USES THEM
--   columns          -- MasonryFlashList numColumns on the tablet, default 4.
--   font_scale       -- global type scale for the board.
--   show_order_notes -- gated CLIENT-side on the tablet, so the mirror has to
--                       apply it too.
--   show_server_name -- NOT needed client-side: get_kds_tickets_v3 already
--                       nulls server_name when this is false, so the mirror
--                       inherits the behaviour through the RPC. Returned here
--                       for the config readout only.
--   alert_minutes /
--   warning_minutes  -- plumbed into the POS KDSDisplayConfig but not currently
--                       consumed by any tablet rendering. Returned for the
--                       readout; the mirror must NOT invent colouring the
--                       kitchen does not actually see.
--   show_allergy_flags -- same: stored, plumbed, unused by the tablet today.

CREATE OR REPLACE FUNCTION public.hq_get_location_kds_displays_v1(
  p_location_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_dexapos_admin() THEN
    RAISE EXCEPTION 'hq_get_location_kds_displays_v1 requires Dexa HQ access'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_location_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', d.id,
        'display_name', d.display_name,
        'station_id', d.station_id,
        'merchant_id', d.merchant_id,
        'location_id', d.location_id,
        'is_active', COALESCE(d.is_active, false),
        'routing_mode', d.routing_mode,
        'show_all_items', COALESCE(d.show_all_items, false),
        'display_mode', d.display_mode,
        'display_color', d.display_color,
        -- Layout config: mirrored so HQ draws the station's own grid.
        'columns', COALESCE(d.columns, 4),
        'font_scale', COALESCE(d.font_scale, 1.0),
        'show_order_notes', COALESCE(d.show_order_notes, true),
        'show_server_name', COALESCE(d.show_server_name, true),
        'show_order_source', COALESCE(d.show_order_source, true),
        'show_allergy_flags', COALESCE(d.show_allergy_flags, true),
        'alert_minutes', d.alert_minutes,
        'warning_minutes', d.warning_minutes,
        'auto_bump_minutes', d.auto_bump_minutes,
        -- Location-level, but it decides whether the station shows a Pending
        -- tab at all ('2-step' hides it), so the mirror needs it alongside the
        -- display config rather than in a second round trip.
        'kds_workflow_mode', COALESCE(l.kds_workflow_mode, '3-step')
      )
      ORDER BY COALESCE(d.is_active, false) DESC, d.display_name ASC
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM public.kds_displays d
  JOIN public.locations l ON l.id = d.location_id
  WHERE d.location_id = p_location_id;

  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.hq_get_location_kds_displays_v1(uuid) IS
  'HQ-only list of KDS displays configured at one location, for the support mirror picker.';

REVOKE ALL ON FUNCTION public.hq_get_location_kds_displays_v1(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hq_get_location_kds_displays_v1(uuid)
  TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 3. Append-only board snapshot ledger
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.kds_board_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id),
  location_id uuid NOT NULL REFERENCES public.locations(id),
  kds_display_id uuid NOT NULL REFERENCES public.kds_displays(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  reason text NOT NULL,
  board jsonb NOT NULL,
  board_hash text NOT NULL,
  ticket_count integer NOT NULL DEFAULT 0,
  item_count integer NOT NULL DEFAULT 0,
  -- clock_timestamp(), not now(). now() is transaction start time, so every
  -- snapshot written by one transaction would share an instant and the replay
  -- scrubber would have to break ties arbitrarily. Arrival capture runs at
  -- COMMIT and ready/served capture runs mid-transaction, so those ties are
  -- real, not hypothetical.
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT kds_board_snapshots_reason_chk
    CHECK (reason IN ('item_arrived', 'item_ready', 'item_served', 'manual')),
  CONSTRAINT kds_board_snapshots_ticket_count_chk CHECK (ticket_count >= 0),
  CONSTRAINT kds_board_snapshots_item_count_chk CHECK (item_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_kbs_display_time
  ON public.kds_board_snapshots(kds_display_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_kbs_loc_time
  ON public.kds_board_snapshots(location_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_kbs_order
  ON public.kds_board_snapshots(order_id, captured_at DESC)
  WHERE order_id IS NOT NULL;

ALTER TABLE public.kds_board_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kds_board_snapshots FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kds_board_snapshots_select_scoped
  ON public.kds_board_snapshots;
CREATE POLICY kds_board_snapshots_select_scoped
  ON public.kds_board_snapshots
  FOR SELECT
  TO authenticated
  USING (
    public.is_dexapos_admin()
    OR (
      merchant_id = public.user_merchant_id()
      AND location_id = ANY(public.user_location_ids())
    )
  );

REVOKE ALL ON TABLE public.kds_board_snapshots FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.kds_board_snapshots TO authenticated, service_role;

-- Same append-only contract as the routing ledgers: the retention function and
-- FK cascades are permitted, direct mutation is not.
DROP TRIGGER IF EXISTS kds_board_snapshots_append_only_guard
  ON public.kds_board_snapshots;
CREATE TRIGGER kds_board_snapshots_append_only_guard
  BEFORE UPDATE OR DELETE ON public.kds_board_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_kds_trace_ledger();

COMMENT ON TABLE public.kds_board_snapshots IS
  'Append-only ledger of the reconstructed KDS board per display at each arrival/ready/served event. Server-side reconstruction, not device-rendered truth.';


-- ---------------------------------------------------------------------------
-- 4. Capture helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.capture_kds_board_snapshot(
  p_location_id uuid,
  p_kds_display_id uuid,
  p_reason text,
  p_order_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_merchant_id uuid;
  v_board jsonb;
  v_hash text;
  v_previous_hash text;
  v_ticket_count integer;
  v_item_count integer;
  v_snapshot_id uuid;
BEGIN
  IF p_location_id IS NULL OR p_kds_display_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT d.merchant_id
    INTO v_merchant_id
    FROM public.kds_displays d
   WHERE d.id = p_kds_display_id
     AND d.location_id = p_location_id;

  IF v_merchant_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Same RPC, same pinned params as the mirror and the tablet. See NOTE 3.
  v_board := COALESCE(
    public.get_kds_tickets_v3(
      p_location_id,
      ARRAY['sent', 'preparing', 'ready']::text[],
      p_kds_display_id
    ),
    '[]'::jsonb
  );

  v_hash := md5(v_board::text);

  -- Hash dedupe against the immediately preceding snapshot for this display.
  -- An arrival always changes the board, so this never suppresses the
  -- on-arrival evidence; it only collapses no-op re-fires.
  SELECT s.board_hash
    INTO v_previous_hash
    FROM public.kds_board_snapshots s
   WHERE s.kds_display_id = p_kds_display_id
   ORDER BY s.captured_at DESC, s.id DESC
   LIMIT 1;

  IF v_previous_hash IS NOT NULL AND v_previous_hash = v_hash THEN
    RETURN NULL;
  END IF;

  v_ticket_count := jsonb_array_length(v_board);

  SELECT COALESCE(SUM(COALESCE((t->>'item_count')::int, 0)), 0)
    INTO v_item_count
    FROM jsonb_array_elements(v_board) AS t;

  INSERT INTO public.kds_board_snapshots (
    merchant_id,
    location_id,
    kds_display_id,
    order_id,
    reason,
    board,
    board_hash,
    ticket_count,
    item_count
  )
  VALUES (
    v_merchant_id,
    p_location_id,
    p_kds_display_id,
    p_order_id,
    p_reason,
    v_board,
    v_hash,
    v_ticket_count,
    v_item_count
  )
  RETURNING id INTO v_snapshot_id;

  RETURN v_snapshot_id; 
END;
$function$;

COMMENT ON FUNCTION public.capture_kds_board_snapshot(uuid, uuid, text, uuid) IS
  'Records the current reconstructed board for one KDS display, deduped against that display''s previous snapshot by content hash.';

REVOKE ALL ON FUNCTION public.capture_kds_board_snapshot(uuid, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;


-- Fan a set of order items out to the distinct (location, display) pairs they
-- landed on and capture one board per pair. This is the batching boundary that
-- keeps the fire path from writing one board per item per display.
CREATE OR REPLACE FUNCTION public.capture_kds_board_snapshots_for_items(
  p_order_item_ids uuid[],
  p_reason text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_target record;
  v_captured integer := 0;
BEGIN
  IF p_order_item_ids IS NULL
     OR array_length(p_order_item_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_target IN
    SELECT
      o.location_id,
      kis.kds_display_id,
      -- Only attribute the snapshot to an order when the statement touched
      -- exactly one. A multi-order statement gets a NULL order_id rather than
      -- an arbitrary one.
      CASE
        WHEN count(DISTINCT o.id) = 1 THEN (array_agg(DISTINCT o.id))[1]
      END AS order_id
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    JOIN public.kds_item_status kis ON kis.order_item_id = oi.id
    WHERE oi.id = ANY(p_order_item_ids)
      AND kis.kds_display_id IS NOT NULL
    GROUP BY o.location_id, kis.kds_display_id
  LOOP
    -- This runs inside bulk_update_order_item_status_v2, on the path a cook
    -- takes to bump a ticket. Instrumentation must never be able to fail that
    -- bump: a lost snapshot is a support inconvenience, a raised exception is
    -- a kitchen outage.
    BEGIN
      IF public.capture_kds_board_snapshot(
           v_target.location_id,
           v_target.kds_display_id,
           p_reason,
           v_target.order_id
         ) IS NOT NULL THEN
        v_captured := v_captured + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'capture_kds_board_snapshots_for_items: capture failed for display % reason % (%)',
        v_target.kds_display_id, p_reason, SQLERRM;
    END;
  END LOOP;

  RETURN v_captured;
END;
$function$;

COMMENT ON FUNCTION public.capture_kds_board_snapshots_for_items(uuid[], text) IS
  'Captures one board snapshot per distinct (location, kds_display) the given order items routed to.';

REVOKE ALL ON FUNCTION public.capture_kds_board_snapshots_for_items(uuid[], text)
  FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 5. Arrival capture: once per (location, display), at COMMIT
-- ---------------------------------------------------------------------------
-- See DESIGN NOTE 1 for why this is a deferred constraint trigger rather than
-- a statement trigger with transition tables or a call inside
-- route_items_to_kds().

CREATE OR REPLACE FUNCTION public.kds_board_snapshot_at_commit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_location_id uuid;
  v_seen text;
  v_key text;
  v_display record;
BEGIN
  SELECT o.location_id
    INTO v_location_id
    FROM public.orders o
   WHERE o.id = NEW.order_id;

  IF v_location_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Transaction-local (set_config is_local = true), so it clears itself at
  -- commit or rollback and cannot leak into the next transaction on this
  -- connection. This is what collapses one firing per fired row down to one
  -- capture per (location, display).
  v_seen := COALESCE(current_setting('app.kds_snapshot_seen', true), '');

  FOR v_display IN
    SELECT DISTINCT kis.kds_display_id
      FROM public.kds_item_status kis
     WHERE kis.order_item_id = NEW.id
       AND kis.kds_display_id IS NOT NULL
  LOOP
    v_key := '|' || v_location_id::text || ':' || v_display.kds_display_id::text || '|';

    IF position(v_key IN v_seen) = 0 THEN
      -- Instrumentation must never be able to fail an order send. A failed
      -- capture costs one snapshot; an exception escaping here would abort the
      -- whole transaction AT COMMIT, which is both the worst time to fail and
      -- the hardest place to diagnose.
      BEGIN
        PERFORM public.capture_kds_board_snapshot(
          v_location_id,
          v_display.kds_display_id,
          'item_arrived',
          -- Attributed to whichever fired order reached this display first.
          -- A transaction firing several orders at once records the first;
          -- the board itself carries all of them either way.
          NEW.order_id
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'kds_board_snapshot_at_commit: capture failed for display % (%)',
          v_display.kds_display_id, SQLERRM;
      END;

      v_seen := v_seen || v_key;
      PERFORM set_config('app.kds_snapshot_seen', v_seen, true);
    END IF;
  END LOOP;

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.kds_board_snapshot_at_commit()
  FROM PUBLIC, anon, authenticated;


-- Superseded statement-level attempt; dropped so a re-run of an earlier draft
-- of this migration cannot leave both mechanisms installed.
DROP TRIGGER IF EXISTS trg_kds_board_snapshot_after_fire_insert
  ON public.order_items;
DROP TRIGGER IF EXISTS trg_kds_board_snapshot_after_fire_update
  ON public.order_items;
DROP FUNCTION IF EXISTS public.kds_board_snapshot_after_fire_insert();
DROP FUNCTION IF EXISTS public.kds_board_snapshot_after_fire_update();

DROP TRIGGER IF EXISTS trg_kds_board_snapshot_arrival_insert
  ON public.order_items;
CREATE CONSTRAINT TRIGGER trg_kds_board_snapshot_arrival_insert
  AFTER INSERT ON public.order_items
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (NEW.sent_to_kitchen_at IS NOT NULL)
  EXECUTE FUNCTION public.kds_board_snapshot_at_commit();

DROP TRIGGER IF EXISTS trg_kds_board_snapshot_arrival_update
  ON public.order_items;
CREATE CONSTRAINT TRIGGER trg_kds_board_snapshot_arrival_update
  AFTER UPDATE OF sent_to_kitchen_at ON public.order_items
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (OLD.sent_to_kitchen_at IS NULL AND NEW.sent_to_kitchen_at IS NOT NULL)
  EXECUTE FUNCTION public.kds_board_snapshot_at_commit();


-- ---------------------------------------------------------------------------
-- 6. Ready / served capture
-- ---------------------------------------------------------------------------
-- Redeclared from 20260814130000_kds_routing_traceability.sql, which is the
-- current definition (no later migration touches this function). The body is
-- copied verbatim; the ONLY change is the capture_kds_board_snapshots_for_items
-- call added after the order roll-up, so the snapshot observes the finished
-- state of the statement rather than a half-applied one.

CREATE OR REPLACE FUNCTION public.bulk_update_order_item_status_v2(
  p_order_item_ids uuid[],
  p_status text,
  p_staff_id uuid DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL,
  p_expected_sync_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cached jsonb;
  v_affected_order_ids uuid[];
  v_target_order_ids uuid[];
  v_mismatch_count integer;
  v_requested_count integer := COALESCE(array_length(p_order_item_ids, 1), 0);
  v_updated_count integer := 0;
  v_kds_updated_count integer := 0;
  v_now timestamptz := now();
  v_result jsonb;
BEGIN
  IF p_order_item_ids IS NULL OR array_length(p_order_item_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'updated_count', 0,
      'requested_count', 0,
      'kds_updated_count', 0,
      'affected_order_ids', '[]'::jsonb,
      'status', p_status
    );
  END IF;

  IF p_status NOT IN ('sent', 'preparing', 'ready', 'served') THEN
    RAISE EXCEPTION
      'Invalid kitchen status: %. Expected sent, preparing, ready, or served.',
      p_status
      USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    v_cached := public._idempotency_claim(
      p_idempotency_key,
      'bulk_update_order_item_status_v2'
    );
    IF v_cached IS NOT NULL THEN
      RETURN v_cached || jsonb_build_object('requested_count', v_requested_count);
    END IF;
  END IF;

  IF p_expected_sync_version IS NOT NULL THEN
    SELECT array_agg(DISTINCT order_id)
      INTO v_target_order_ids
      FROM public.order_items
     WHERE id = ANY(p_order_item_ids);

    IF v_target_order_ids IS NOT NULL THEN
      PERFORM 1
        FROM public.orders
       WHERE id = ANY(v_target_order_ids)
       FOR UPDATE;

      SELECT count(*)
        INTO v_mismatch_count
        FROM public.orders
       WHERE id = ANY(v_target_order_ids)
         AND COALESCE(sync_version, 0) <> p_expected_sync_version;

      IF v_mismatch_count > 0 THEN
        RAISE EXCEPTION
          'sync_version mismatch - expected %, refusing to update % order(s)',
          p_expected_sync_version,
          v_mismatch_count
          USING ERRCODE = 'P0004',
                HINT = 'Re-fetch the order, then retry with the current sync_version.';
      END IF;
    END IF;
  END IF;

  UPDATE public.order_items
     SET kitchen_status = p_status,
         updated_at = v_now,
         fire_time = CASE
           WHEN p_status = 'sent' THEN v_now
           WHEN p_status = 'preparing' THEN COALESCE(fire_time, v_now)
           ELSE fire_time
         END,
         sent_to_kitchen_at = CASE
           WHEN p_status IN ('sent', 'preparing')
             THEN COALESCE(sent_to_kitchen_at, v_now)
           ELSE sent_to_kitchen_at
         END,
         started_preparing_at = CASE
           WHEN p_status = 'sent' THEN NULL
           WHEN p_status = 'preparing'
             THEN COALESCE(started_preparing_at, v_now)
           ELSE started_preparing_at
         END,
         completed_at = CASE
           WHEN p_status = 'sent' THEN NULL
           WHEN p_status IN ('ready', 'served')
             THEN COALESCE(completed_at, v_now)
           ELSE completed_at
         END
   WHERE id = ANY(p_order_item_ids);

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF p_status = 'sent' THEN
    UPDATE public.kds_item_status
       SET status = 'pending',
           started_at = NULL,
           completed_at = NULL,
           bumped_at = NULL,
           bumped_by = NULL
     WHERE order_item_id = ANY(p_order_item_ids)
       AND status <> 'cancelled';
    GET DIAGNOSTICS v_kds_updated_count = ROW_COUNT;

  ELSIF p_status = 'preparing' THEN
    UPDATE public.kds_item_status
       SET status = 'pending',
           started_at = COALESCE(started_at, v_now),
           completed_at = NULL,
           bumped_at = NULL,
           bumped_by = NULL
     WHERE order_item_id = ANY(p_order_item_ids)
       AND status <> 'cancelled';
    GET DIAGNOSTICS v_kds_updated_count = ROW_COUNT;

  ELSIF p_status = 'ready' THEN
    UPDATE public.kds_item_status
       SET status = 'pending',
           completed_at = COALESCE(completed_at, v_now),
           bumped_at = NULL,
           bumped_by = NULL
     WHERE order_item_id = ANY(p_order_item_ids)
       AND status <> 'cancelled';
    GET DIAGNOSTICS v_kds_updated_count = ROW_COUNT;

  ELSIF p_status = 'served' THEN
    UPDATE public.kds_item_status
       SET status = 'completed',
           completed_at = COALESCE(completed_at, v_now),
           bumped_at = v_now,
           bumped_by = p_staff_id
     WHERE order_item_id = ANY(p_order_item_ids)
       AND status NOT IN ('cancelled', 'completed');
    GET DIAGNOSTICS v_kds_updated_count = ROW_COUNT;
  END IF;

  SELECT array_agg(DISTINCT order_id)
    INTO v_affected_order_ids
    FROM public.order_items
   WHERE id = ANY(p_order_item_ids);

  IF v_affected_order_ids IS NOT NULL THEN
    UPDATE public.orders o
       SET sent_to_kitchen_at = CASE
             WHEN p_status IN ('sent', 'preparing')
               THEN COALESCE(o.sent_to_kitchen_at, now())
             ELSE o.sent_to_kitchen_at
           END,
           started_preparing_at = CASE
             WHEN p_status = 'preparing'
               THEN COALESCE(o.started_preparing_at, now())
             ELSE o.started_preparing_at
           END,
           ready_at = CASE
             WHEN agg.all_ready_or_served
                  AND o.status::text IN ('sent_to_kitchen', 'preparing')
               THEN COALESCE(o.ready_at, v_now)
             WHEN NOT agg.all_ready_or_served
                  AND p_status IN ('sent', 'preparing')
               THEN NULL
             ELSE o.ready_at
           END,
           status = CASE
             WHEN p_status = 'sent'
                  AND o.status::text IN ('ready', 'preparing')
               THEN 'sent_to_kitchen'::public.order_status
             WHEN o.status::text NOT IN ('sent_to_kitchen', 'preparing', 'ready')
               THEN o.status
             WHEN agg.all_ready_or_served THEN 'ready'::public.order_status
             WHEN agg.any_beyond_sent THEN 'preparing'::public.order_status
             ELSE 'sent_to_kitchen'::public.order_status
           END,
           sync_version = COALESCE(o.sync_version, 0) + 1,
           updated_at = v_now
      FROM (
        SELECT
          oi.order_id,
          bool_and(oi.kitchen_status IN ('ready', 'served')) AS all_ready_or_served,
          bool_or(oi.kitchen_status IN ('preparing', 'ready', 'served')) AS any_beyond_sent
        FROM public.order_items oi
        WHERE oi.order_id = ANY(v_affected_order_ids)
          AND COALESCE(oi.is_voided, false) = false
          AND COALESCE(oi.refunded_quantity, 0) < oi.quantity
          AND oi.kitchen_status IS NOT NULL
        GROUP BY oi.order_id
      ) agg
     WHERE o.id = agg.order_id;
  END IF;

  -- ==== ADDED (HQ KDS mirror, P1) ==========================================
  -- Ready/served leave the KDS ticket in 'pending' on this merchant's boards
  -- (the display-side anomaly that opened this investigation), so a board
  -- snapshot at these two transitions is the only durable record of what the
  -- station was showing when the item was called. 'sent'/'preparing' are
  -- already covered by the fire-path statement triggers above.
  IF p_status IN ('ready', 'served') THEN
    PERFORM public.capture_kds_board_snapshots_for_items(
      p_order_item_ids,
      CASE WHEN p_status = 'ready' THEN 'item_ready' ELSE 'item_served' END
    );
  END IF;
  -- ==== END ADDED ==========================================================

  v_result := jsonb_build_object(
    'updated_count', v_updated_count,
    'requested_count', v_requested_count,
    'kds_updated_count', v_kds_updated_count,
    'affected_order_ids', COALESCE(to_jsonb(v_affected_order_ids), '[]'::jsonb),
    'status', p_status
  );

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public._idempotency_complete(
      p_idempotency_key,
      'bulk_update_order_item_status_v2',
      v_result
    );
  END IF;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.bulk_update_order_item_status_v2(
  uuid[], text, uuid, uuid, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_update_order_item_status_v2(
  uuid[], text, uuid, uuid, integer
) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 7. Snapshot read RPCs
-- ---------------------------------------------------------------------------
-- Split deliberately: the scrubber needs a cheap index of the window (boards
-- are whole jsonb documents and a busy hour would be megabytes), then fetches
-- one board when the operator lands on a tick.

CREATE OR REPLACE FUNCTION public.hq_get_kds_board_snapshots_v1(
  p_kds_display_id uuid,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_from timestamptz := COALESCE(p_from, now() - interval '6 hours');
  v_to timestamptz := COALESCE(p_to, now());
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000);
  v_result jsonb;
BEGIN
  IF NOT public.is_dexapos_admin() THEN
    RAISE EXCEPTION 'hq_get_kds_board_snapshots_v1 requires Dexa HQ access'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_kds_display_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Inner query takes the most RECENT v_limit ticks; the outer aggregate then
  -- re-sorts them forwards, which is the order the scrubber steps through.
  -- id is a tiebreaker only, so a window whose bounds land on identical
  -- timestamps still produces a stable, repeatable sequence.
  SELECT COALESCE(
      jsonb_agg(row_to_json(t)::jsonb ORDER BY t.captured_at ASC, t.id ASC),
      '[]'::jsonb
    )
    INTO v_result
    FROM (
      SELECT
        s.id,
        s.captured_at,
        s.reason,
        s.order_id,
        s.ticket_count,
        s.item_count,
        s.board_hash
      FROM public.kds_board_snapshots s
      WHERE s.kds_display_id = p_kds_display_id
        AND s.captured_at >= v_from
        AND s.captured_at <= v_to
      ORDER BY s.captured_at DESC, s.id DESC
      LIMIT v_limit
    ) t;

  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.hq_get_kds_board_snapshots_v1(uuid, timestamptz, timestamptz, integer) IS
  'HQ-only index of board snapshots for one KDS display in a time window (metadata only; fetch the board with hq_get_kds_board_snapshot_v1).';

REVOKE ALL ON FUNCTION public.hq_get_kds_board_snapshots_v1(uuid, timestamptz, timestamptz, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hq_get_kds_board_snapshots_v1(uuid, timestamptz, timestamptz, integer)
  TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.hq_get_kds_board_snapshot_v1(
  p_snapshot_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_dexapos_admin() THEN
    RAISE EXCEPTION 'hq_get_kds_board_snapshot_v1 requires Dexa HQ access'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_snapshot_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
      'id', s.id,
      'captured_at', s.captured_at,
      'reason', s.reason,
      'order_id', s.order_id,
      'location_id', s.location_id,
      'kds_display_id', s.kds_display_id,
      'ticket_count', s.ticket_count,
      'item_count', s.item_count,
      'board_hash', s.board_hash,
      'board', s.board
    )
    INTO v_result
    FROM public.kds_board_snapshots s
   WHERE s.id = p_snapshot_id;

  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.hq_get_kds_board_snapshot_v1(uuid) IS
  'HQ-only fetch of one full board snapshot, including the stored board payload.';

REVOKE ALL ON FUNCTION public.hq_get_kds_board_snapshot_v1(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hq_get_kds_board_snapshot_v1(uuid)
  TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 8. Retention
-- ---------------------------------------------------------------------------
-- Boards are whole jsonb documents, an order of magnitude heavier per row than
-- a routing-log entry, so these keep the short end of the agreed 7-14 day
-- range rather than the routing ledger's 180 days. Fourteen days covers the
-- usual lag between a kitchen complaint and someone opening a ticket about it.

CREATE OR REPLACE FUNCTION public.purge_kds_board_snapshots()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_deleted integer := 0;
BEGIN
  PERFORM set_config('app.kds_trace_retention', 'on', true);

  DELETE FROM public.kds_board_snapshots
   WHERE captured_at < now() - interval '14 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('board_snapshots_deleted', v_deleted);
END;
$function$;

REVOKE ALL ON FUNCTION public.purge_kds_board_snapshots()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_kds_board_snapshots()
  TO service_role;

DO $schedule$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'kds-board-snapshot-purge') THEN
      PERFORM cron.unschedule('kds-board-snapshot-purge');
    END IF;

    PERFORM cron.schedule(
      'kds-board-snapshot-purge',
      '45 3 * * *',
      'SELECT public.purge_kds_board_snapshots()'
    );
  END IF;
EXCEPTION
  WHEN undefined_table OR undefined_function OR insufficient_privilege THEN
    RAISE NOTICE 'KDS board snapshot purge was not scheduled; run purge_kds_board_snapshots() from an approved scheduler.';
END;
$schedule$;


-- =============================================================================
-- ROLLBACK
--   DROP TRIGGER IF EXISTS trg_kds_board_snapshot_arrival_insert ON public.order_items;
--   DROP TRIGGER IF EXISTS trg_kds_board_snapshot_arrival_update ON public.order_items;
--   DROP FUNCTION IF EXISTS public.kds_board_snapshot_at_commit();
--   DROP FUNCTION IF EXISTS public.capture_kds_board_snapshots_for_items(uuid[], text);
--   DROP FUNCTION IF EXISTS public.capture_kds_board_snapshot(uuid, uuid, text, uuid);
--   DROP FUNCTION IF EXISTS public.hq_get_kds_board_snapshot_v1(uuid);
--   DROP FUNCTION IF EXISTS public.hq_get_kds_board_snapshots_v1(uuid, timestamptz, timestamptz, integer);
--   DROP FUNCTION IF EXISTS public.hq_get_location_kds_displays_v1(uuid);
--   DROP FUNCTION IF EXISTS public.hq_get_kds_board_mirror_v1(uuid, uuid);
--   SELECT cron.unschedule('kds-board-snapshot-purge');
--   DROP FUNCTION IF EXISTS public.purge_kds_board_snapshots();
--   DROP TABLE IF EXISTS public.kds_board_snapshots;
--   -- and re-apply bulk_update_order_item_status_v2 from
--   -- 20260814130000_kds_routing_traceability.sql to drop the capture call.
-- =============================================================================
