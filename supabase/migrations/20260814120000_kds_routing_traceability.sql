-- KDS routing traceability (instrumentation only).
--
-- This migration records the routing decision made for every fired order item
-- and every active KDS display. It intentionally preserves the existing KDS
-- routing outputs, including show_all_items and blast fallback behavior.

-- ---------------------------------------------------------------------------
-- Immutable routing and send-attempt ledgers
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.kds_routing_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id),
  location_id uuid NOT NULL REFERENCES public.locations(id),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  kds_display_id uuid REFERENCES public.kds_displays(id) ON DELETE SET NULL,
  kds_display_name text,
  outcome text NOT NULL,
  match_reason text NOT NULL,
  matched_rule_id uuid REFERENCES public.kds_routing_rules(id) ON DELETE SET NULL,
  matched_rule_type text,
  matched_rule_value text,
  resolved_prep_station text,
  prep_station_source text,
  item_category_id uuid,
  item_category_name text,
  order_type text,
  displays_evaluated integer NOT NULL DEFAULT 0,
  displays_matched integer NOT NULL DEFAULT 0,
  fired_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kds_routing_log_outcome_chk
    CHECK (outcome IN ('routed', 'skipped', 'dropped')),
  CONSTRAINT kds_routing_log_reason_chk
    CHECK (match_reason IN (
      'rule_prep_station',
      'rule_category_id',
      'rule_category_name',
      'rule_order_type',
      'routing_mode_all',
      'show_all_items',
      'fallback_expo',
      'fallback_blast',
      'no_rule_match',
      'no_active_display',
      'backfill_unknown'
    )),
  CONSTRAINT kds_routing_log_prep_source_chk
    CHECK (prep_station_source IS NULL OR prep_station_source IN (
      'item_override', 'category_default', 'item_column', 'none'
    ))
);

CREATE INDEX IF NOT EXISTS idx_krl_order_item
  ON public.kds_routing_log(order_item_id);
CREATE INDEX IF NOT EXISTS idx_krl_order
  ON public.kds_routing_log(order_id, fired_at DESC);
CREATE INDEX IF NOT EXISTS idx_krl_loc_time
  ON public.kds_routing_log(location_id, fired_at DESC);
CREATE INDEX IF NOT EXISTS idx_krl_dropped
  ON public.kds_routing_log(location_id, fired_at DESC)
  WHERE outcome = 'dropped';
CREATE UNIQUE INDEX IF NOT EXISTS idx_krl_item_display_fire
  ON public.kds_routing_log(order_item_id, kds_display_id, fired_at)
  NULLS NOT DISTINCT;

CREATE TABLE IF NOT EXISTS public.kds_send_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id),
  location_id uuid NOT NULL REFERENCES public.locations(id),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  requested_item_ids uuid[] NOT NULL,
  requested_count integer NOT NULL,
  actually_updated_count integer NOT NULL,
  order_item_count integer NOT NULL,
  item_status text NOT NULL,
  staff_id uuid,
  station_id uuid,
  device_id text,
  idempotency_key uuid,
  was_replay boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kds_send_attempts_requested_count_chk
    CHECK (requested_count >= 0),
  CONSTRAINT kds_send_attempts_updated_count_chk
    CHECK (actually_updated_count >= 0),
  CONSTRAINT kds_send_attempts_order_item_count_chk
    CHECK (order_item_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_ksa_order
  ON public.kds_send_attempts(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ksa_loc_time
  ON public.kds_send_attempts(location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ksa_partial
  ON public.kds_send_attempts(location_id, created_at DESC)
  WHERE actually_updated_count <> requested_count;

ALTER TABLE public.kds_routing_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kds_routing_log FORCE ROW LEVEL SECURITY;
ALTER TABLE public.kds_send_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kds_send_attempts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kds_routing_log_select_scoped
  ON public.kds_routing_log;
CREATE POLICY kds_routing_log_select_scoped
  ON public.kds_routing_log
  FOR SELECT
  TO authenticated
  USING (
    public.is_dexapos_admin()
    OR (
      merchant_id = public.user_merchant_id()
      AND location_id = ANY(public.user_location_ids())
    )
  );

DROP POLICY IF EXISTS kds_send_attempts_select_scoped
  ON public.kds_send_attempts;
CREATE POLICY kds_send_attempts_select_scoped
  ON public.kds_send_attempts
  FOR SELECT
  TO authenticated
  USING (
    public.is_dexapos_admin()
    OR (
      merchant_id = public.user_merchant_id()
      AND location_id = ANY(public.user_location_ids())
    )
  );

REVOKE ALL ON TABLE public.kds_routing_log FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.kds_send_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.kds_routing_log TO authenticated, service_role;
GRANT SELECT ON TABLE public.kds_send_attempts TO authenticated, service_role;

-- Direct mutations are forbidden. FK cascades/set-null operations and the
-- private retention function execute at nested trigger depth and remain valid.
CREATE OR REPLACE FUNCTION public.protect_kds_trace_ledger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF pg_trigger_depth() > 1
     OR current_setting('app.kds_trace_retention', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'KDS trace ledgers are append-only; % is not allowed on %',
    TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$function$;

REVOKE ALL ON FUNCTION public.protect_kds_trace_ledger() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS kds_routing_log_append_only_guard
  ON public.kds_routing_log;
CREATE TRIGGER kds_routing_log_append_only_guard
  BEFORE UPDATE OR DELETE ON public.kds_routing_log
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_kds_trace_ledger();

DROP TRIGGER IF EXISTS kds_send_attempts_append_only_guard
  ON public.kds_send_attempts;
CREATE TRIGGER kds_send_attempts_append_only_guard
  BEFORE UPDATE OR DELETE ON public.kds_send_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_kds_trace_ledger();

-- ---------------------------------------------------------------------------
-- Routing trigger: same routing result, with one set-based log write per item
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.route_items_to_kds()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_merchant_id uuid;
  v_location_id uuid;
  v_order_type text;
  v_display record;
  v_rule record;
  v_matched boolean;
  v_any_routed boolean := false;
  v_resolved_prep_station text;
  v_prep_station_source text := 'none';
  v_matched_rule_id uuid;
  v_matched_rule_type text;
  v_matched_rule_value text;
  v_match_reason text;
  v_evaluated_count integer := 0;
  v_matched_count integer := 0;
  v_specific_match_count integer := 0;
  v_show_all_match_count integer := 0;
  v_display_ids uuid[] := ARRAY[]::uuid[];
  v_display_names text[] := ARRAY[]::text[];
  v_outcomes text[] := ARRAY[]::text[];
  v_reasons text[] := ARRAY[]::text[];
  v_rule_ids uuid[] := ARRAY[]::uuid[];
  v_rule_types text[] := ARRAY[]::text[];
  v_rule_values text[] := ARRAY[]::text[];
  v_index integer;
BEGIN
  -- Preserve the existing NULL -> non-NULL fire guard.
  IF NEW.sent_to_kitchen_at IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.sent_to_kitchen_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT o.merchant_id, o.location_id, o.order_type::text
    INTO v_merchant_id, v_location_id, v_order_type
    FROM public.orders o
   WHERE o.id = NEW.order_id;

  IF v_location_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_resolved_prep_station := public.resolve_item_prep_station(
    NEW.menu_item_id,
    v_location_id,
    NEW.category_id
  );

  IF v_resolved_prep_station IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
        FROM public.location_item_overrides lio
        JOIN public.prep_stations ps ON ps.id = lio.prep_station_id
       WHERE lio.menu_item_id = NEW.menu_item_id
         AND lio.location_id = v_location_id
         AND ps.is_active = true
         AND ps.name = v_resolved_prep_station
    ) THEN
      v_prep_station_source := 'item_override';
    ELSE
      v_prep_station_source := 'category_default';
    END IF;
  ELSIF NEW.prep_station IS NOT NULL THEN
    v_resolved_prep_station := NEW.prep_station;
    v_prep_station_source := 'item_column';
  END IF;

  IF NEW.prep_station IS NULL AND v_resolved_prep_station IS NOT NULL THEN
    UPDATE public.order_items
       SET prep_station = v_resolved_prep_station
     WHERE id = NEW.id
       AND prep_station IS NULL;
  END IF;

  FOR v_display IN
    SELECT d.id, d.display_name, d.routing_mode, d.show_all_items
      FROM public.kds_displays d
     WHERE d.location_id = v_location_id
       AND d.is_active = true
  LOOP
    v_evaluated_count := v_evaluated_count + 1;
    v_matched := false;
    v_matched_rule_id := NULL;
    v_matched_rule_type := NULL;
    v_matched_rule_value := NULL;
    v_match_reason := 'no_rule_match';

    IF v_display.routing_mode = 'all' THEN
      v_matched := true;
      v_match_reason := 'routing_mode_all';
      v_specific_match_count := v_specific_match_count + 1;
    ELSE
      FOR v_rule IN
        SELECT r.id, r.rule_type, r.rule_value
          FROM public.kds_routing_rules r
         WHERE r.kds_display_id = v_display.id
      LOOP
        IF v_rule.rule_type = 'prep_station'
           AND v_resolved_prep_station = v_rule.rule_value THEN
          v_matched := true;
          v_match_reason := 'rule_prep_station';
        ELSIF v_rule.rule_type = 'category'
              AND NEW.category_id IS NOT NULL
              AND NEW.category_id::text = v_rule.rule_value THEN
          v_matched := true;
          v_match_reason := 'rule_category_id';
        ELSIF v_rule.rule_type = 'category'
              AND NEW.category_name = v_rule.rule_value THEN
          v_matched := true;
          v_match_reason := 'rule_category_name';
        ELSIF v_rule.rule_type = 'order_type'
              AND v_order_type = v_rule.rule_value THEN
          v_matched := true;
          v_match_reason := 'rule_order_type';
        END IF;

        IF v_matched THEN
          v_matched_rule_id := v_rule.id;
          v_matched_rule_type := v_rule.rule_type;
          v_matched_rule_value := v_rule.rule_value;
          v_specific_match_count := v_specific_match_count + 1;
          EXIT;
        END IF;
      END LOOP;
    END IF;

    IF NOT v_matched AND COALESCE(v_display.show_all_items, false) THEN
      v_matched := true;
      v_match_reason := 'show_all_items';
      v_show_all_match_count := v_show_all_match_count + 1;
    END IF;

    IF v_matched THEN
      INSERT INTO public.kds_item_status (
        kds_display_id, order_id, order_item_id, status
      )
      VALUES (v_display.id, NEW.order_id, NEW.id, 'pending')
      ON CONFLICT (kds_display_id, order_item_id) DO NOTHING;

      v_any_routed := true;
      v_matched_count := v_matched_count + 1;
    END IF;

    v_display_ids := array_append(v_display_ids, v_display.id);
    v_display_names := array_append(v_display_names, v_display.display_name);
    v_outcomes := array_append(
      v_outcomes,
      CASE WHEN v_matched THEN 'routed' ELSE 'skipped' END
    );
    v_reasons := array_append(v_reasons, v_match_reason);
    v_rule_ids := array_append(v_rule_ids, v_matched_rule_id);
    v_rule_types := array_append(v_rule_types, v_matched_rule_type);
    v_rule_values := array_append(v_rule_values, v_matched_rule_value);
  END LOOP;

  -- A show-all display is the expo fallback when no specific display matched.
  -- This changes only the diagnostic label, not which KDS rows are written.
  IF v_specific_match_count = 0 AND v_show_all_match_count > 0 THEN
    FOR v_index IN 1..COALESCE(array_length(v_display_ids, 1), 0) LOOP
      IF v_reasons[v_index] = 'show_all_items' THEN
        v_reasons[v_index] := 'fallback_expo';
      END IF;
    END LOOP;
  END IF;

  -- Preserve the existing last-resort blast to every active display.
  IF NOT v_any_routed AND v_evaluated_count > 0 THEN
    FOR v_index IN 1..array_length(v_display_ids, 1) LOOP
      INSERT INTO public.kds_item_status (
        kds_display_id, order_id, order_item_id, status
      )
      VALUES (v_display_ids[v_index], NEW.order_id, NEW.id, 'pending')
      ON CONFLICT (kds_display_id, order_item_id) DO NOTHING;

      v_outcomes[v_index] := 'routed';
      v_reasons[v_index] := 'fallback_blast';
      v_rule_ids[v_index] := NULL;
      v_rule_types[v_index] := NULL;
      v_rule_values[v_index] := NULL;
    END LOOP;

    v_any_routed := true;
    v_matched_count := v_evaluated_count;
  END IF;

  IF v_evaluated_count = 0 THEN
    INSERT INTO public.kds_routing_log (
      merchant_id,
      location_id,
      order_id,
      order_item_id,
      outcome,
      match_reason,
      resolved_prep_station,
      prep_station_source,
      item_category_id,
      item_category_name,
      order_type,
      displays_evaluated,
      displays_matched,
      fired_at
    )
    VALUES (
      v_merchant_id,
      v_location_id,
      NEW.order_id,
      NEW.id,
      'dropped',
      'no_active_display',
      v_resolved_prep_station,
      v_prep_station_source,
      NEW.category_id,
      NEW.category_name,
      v_order_type,
      0,
      0,
      NEW.sent_to_kitchen_at
    );
  ELSE
    INSERT INTO public.kds_routing_log (
      merchant_id,
      location_id,
      order_id,
      order_item_id,
      kds_display_id,
      kds_display_name,
      outcome,
      match_reason,
      matched_rule_id,
      matched_rule_type,
      matched_rule_value,
      resolved_prep_station,
      prep_station_source,
      item_category_id,
      item_category_name,
      order_type,
      displays_evaluated,
      displays_matched,
      fired_at
    )
    SELECT
      v_merchant_id,
      v_location_id,
      NEW.order_id,
      NEW.id,
      v_display_ids[i],
      v_display_names[i],
      v_outcomes[i],
      v_reasons[i],
      v_rule_ids[i],
      v_rule_types[i],
      v_rule_values[i],
      v_resolved_prep_station,
      v_prep_station_source,
      NEW.category_id,
      NEW.category_name,
      v_order_type,
      v_evaluated_count,
      v_matched_count,
      NEW.sent_to_kitchen_at
    FROM generate_subscripts(v_display_ids, 1) AS i
    ON CONFLICT (order_item_id, kds_display_id, fired_at) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.route_items_to_kds() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.route_items_to_kds() IS
  'Routes fired order items using the existing KDS rules/fallback behavior and atomically records every display decision in kds_routing_log.';

-- ---------------------------------------------------------------------------
-- True bulk-update counts
-- ---------------------------------------------------------------------------

-- The shared database previously had both four- and five-argument overloads.
-- Keep one optional-expected-version signature so named four-argument callers
-- remain compatible without making PostgREST function resolution ambiguous.
DROP FUNCTION IF EXISTS public.bulk_update_order_item_status_v2(
  uuid[], text, uuid, uuid
);

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

COMMENT ON FUNCTION public.bulk_update_order_item_status_v2(
  uuid[], text, uuid, uuid, integer
) IS
  'Bulk-updates order item/KDS status with idempotency and optimistic concurrency. Returns actual updated_count and requested_count so partial sends are observable.';

-- ---------------------------------------------------------------------------
-- Composite send attempt ledger. Optional client context keeps old named-arg
-- callers compatible; order.station_id/device_id remain the fallback source.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.send_order_to_kitchen_v1(
  uuid, text, uuid[], text, uuid, uuid, uuid
);

CREATE OR REPLACE FUNCTION public.send_order_to_kitchen_v1(
  p_order_id uuid,
  p_order_status text,
  p_order_item_ids uuid[],
  p_item_status text,
  p_staff_id uuid DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL,
  p_items_idempotency_key uuid DEFAULT NULL,
  p_station_id uuid DEFAULT NULL,
  p_device_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cached jsonb;
  v_current text;
  v_caller_merchant uuid;
  v_merchant_id uuid;
  v_location_id uuid;
  v_order_station_id uuid;
  v_order_device_id text;
  v_order_item_count integer := 0;
  v_requested_count integer := COALESCE(array_length(p_order_item_ids, 1), 0);
  v_items_result jsonb;
BEGIN
  v_caller_merchant := public.user_merchant_id();

  IF p_order_status NOT IN ('sent_to_kitchen', 'preparing') THEN
    RAISE EXCEPTION 'Invalid order status for kitchen send: %', p_order_status
      USING ERRCODE = '22023';
  END IF;

  IF p_item_status NOT IN ('sent', 'preparing') THEN
    RAISE EXCEPTION 'Invalid item status for kitchen send: %', p_item_status
      USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    v_cached := public._idempotency_claim(
      p_idempotency_key,
      'send_order_to_kitchen_v1'
    );
    IF v_cached IS NOT NULL THEN
      SELECT o.merchant_id, o.location_id, o.station_id, o.device_id
        INTO v_merchant_id, v_location_id, v_order_station_id, v_order_device_id
        FROM public.orders o
       WHERE o.id = p_order_id
         AND (
           v_caller_merchant IS NULL
           OR (
             o.merchant_id = v_caller_merchant
             AND o.location_id = ANY(public.user_location_ids())
           )
         );

      IF v_merchant_id IS NOT NULL THEN
        SELECT count(*)
          INTO v_order_item_count
          FROM public.order_items oi
         WHERE oi.order_id = p_order_id
           AND COALESCE(oi.is_voided, false) = false;

        INSERT INTO public.kds_send_attempts (
          merchant_id,
          location_id,
          order_id,
          requested_item_ids,
          requested_count,
          actually_updated_count,
          order_item_count,
          item_status,
          staff_id,
          station_id,
          device_id,
          idempotency_key,
          was_replay
        )
        VALUES (
          v_merchant_id,
          v_location_id,
          p_order_id,
          COALESCE(p_order_item_ids, ARRAY[]::uuid[]),
          v_requested_count,
          COALESCE((v_cached->>'updated_count')::integer, 0),
          v_order_item_count,
          p_item_status,
          p_staff_id,
          COALESCE(p_station_id, v_order_station_id),
          COALESCE(p_device_id, v_order_device_id),
          p_idempotency_key,
          true
        );
      END IF;

      RETURN v_cached || jsonb_build_object('requested_count', v_requested_count);
    END IF;
  END IF;

  SELECT
    o.status::text,
    o.merchant_id,
    o.location_id,
    o.station_id,
    o.device_id
  INTO
    v_current,
    v_merchant_id,
    v_location_id,
    v_order_station_id,
    v_order_device_id
  FROM public.orders o
  WHERE o.id = p_order_id
    AND (
      v_caller_merchant IS NULL
      OR (
        o.merchant_id = v_caller_merchant
        AND o.location_id = ANY(public.user_location_ids())
      )
    )
  FOR UPDATE;

  IF v_current IS NULL THEN
    RAISE EXCEPTION 'Order not found or not accessible: %', p_order_id
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*)
    INTO v_order_item_count
    FROM public.order_items oi
   WHERE oi.order_id = p_order_id
     AND COALESCE(oi.is_voided, false) = false;

  IF v_current = 'draft' THEN
    UPDATE public.orders
       SET status = p_order_status::public.order_status,
           sent_to_kitchen_at = COALESCE(sent_to_kitchen_at, now()),
           started_preparing_at = CASE
             WHEN p_order_status = 'preparing'
               THEN COALESCE(started_preparing_at, now())
             ELSE started_preparing_at
           END,
           updated_at = now()
     WHERE id = p_order_id;
  END IF;

  v_items_result := public.bulk_update_order_item_status_v2(
    p_order_item_ids,
    p_item_status,
    p_staff_id,
    p_items_idempotency_key,
    NULL
  );

  INSERT INTO public.kds_send_attempts (
    merchant_id,
    location_id,
    order_id,
    requested_item_ids,
    requested_count,
    actually_updated_count,
    order_item_count,
    item_status,
    staff_id,
    station_id,
    device_id,
    idempotency_key,
    was_replay
  )
  VALUES (
    v_merchant_id,
    v_location_id,
    p_order_id,
    COALESCE(p_order_item_ids, ARRAY[]::uuid[]),
    v_requested_count,
    COALESCE((v_items_result->>'updated_count')::integer, 0),
    v_order_item_count,
    p_item_status,
    p_staff_id,
    COALESCE(p_station_id, v_order_station_id),
    COALESCE(p_device_id, v_order_device_id),
    p_idempotency_key,
    false
  );

  v_items_result := v_items_result || jsonb_build_object(
    'order_id', p_order_id,
    'order_was_draft', (v_current = 'draft')
  );

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public._idempotency_complete(
      p_idempotency_key,
      'send_order_to_kitchen_v1',
      v_items_result
    );
  END IF;

  RETURN v_items_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.send_order_to_kitchen_v1(
  uuid, text, uuid[], text, uuid, uuid, uuid, uuid, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_order_to_kitchen_v1(
  uuid, text, uuid[], text, uuid, uuid, uuid, uuid, text
) TO authenticated, service_role;

COMMENT ON FUNCTION public.send_order_to_kitchen_v1(
  uuid, text, uuid[], text, uuid, uuid, uuid, uuid, text
) IS
  'Atomically sends an order to the kitchen and records requested/actual item counts plus replay and POS client context in kds_send_attempts.';

-- ---------------------------------------------------------------------------
-- Tenant-scoped order trace RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_order_routing_trace(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order public.orders%rowtype;
  v_items jsonb;
BEGIN
  SELECT o.*
    INTO v_order
    FROM public.orders o
   WHERE o.id = p_order_id
     AND (
       auth.role() = 'service_role'
       OR public.is_dexapos_admin()
       OR (
         o.merchant_id = public.user_merchant_id()
         AND o.location_id = ANY(public.user_location_ids())
       )
     );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or not accessible: %', p_order_id
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'order_item_id', item_rows.order_item_id,
        'item_name', item_rows.item_name,
        'category_id', item_rows.category_id,
        'category_name', item_rows.category_name,
        'kitchen_status', item_rows.kitchen_status,
        'resolved_prep_station', item_rows.resolved_prep_station,
        'prep_station_source', item_rows.prep_station_source,
        'routing', item_rows.routing,
        'divergence', item_rows.divergence
      )
      ORDER BY item_rows.display_order, item_rows.created_at, item_rows.order_item_id
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM (
    SELECT
      oi.id AS order_item_id,
      oi.item_name,
      oi.category_id,
      oi.category_name,
      oi.kitchen_status,
      oi.prep_station AS resolved_prep_station,
      COALESCE(trace.prep_station_source, 'none') AS prep_station_source,
      oi.display_order,
      oi.created_at,
      COALESCE(trace.routing, '[]'::jsonb) AS routing,
      CASE
        WHEN oi.sent_to_kitchen_at IS NOT NULL
             AND COALESCE(trace.log_count, 0) = 0 THEN true
        ELSE COALESCE(trace.divergence, false)
      END AS divergence
    FROM public.order_items oi
    LEFT JOIN LATERAL (
      SELECT
        count(*) AS log_count,
        (array_agg(l.prep_station_source ORDER BY l.created_at DESC))[1]
          AS prep_station_source,
        jsonb_agg(
          jsonb_build_object(
            'kds_display_id', l.kds_display_id,
            'kds_display_name', l.kds_display_name,
            'outcome', l.outcome,
            'match_reason', l.match_reason,
            'matched_rule_id', l.matched_rule_id,
            'matched_rule_type', l.matched_rule_type,
            'matched_rule_value', l.matched_rule_value,
            'current_kds_status', kis.status,
            'displays_evaluated', l.displays_evaluated,
            'displays_matched', l.displays_matched,
            'fired_at', l.fired_at,
            'created_at', l.created_at
          )
          ORDER BY l.created_at, l.kds_display_name NULLS LAST
        ) AS routing,
        bool_or(
          l.outcome = 'routed'
          AND (
            kis.id IS NULL
            OR (
              oi.kitchen_status IN ('ready', 'served')
              AND kis.status NOT IN ('completed', 'cancelled')
            )
            OR (
              COALESCE(oi.kitchen_status, '') NOT IN ('ready', 'served')
              AND kis.status = 'completed'
            )
          )
        ) AS divergence
      FROM public.kds_routing_log l
      LEFT JOIN public.kds_item_status kis
        ON kis.order_item_id = l.order_item_id
       AND kis.kds_display_id = l.kds_display_id
      WHERE l.order_item_id = oi.id
    ) trace ON true
    WHERE oi.order_id = p_order_id
  ) item_rows;

  RETURN jsonb_build_object(
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'merchant_id', v_order.merchant_id,
    'location_id', v_order.location_id,
    'order_type', v_order.order_type,
    'sent_to_kitchen_at', v_order.sent_to_kitchen_at,
    'items', v_items,
    'has_divergence', EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_items) item
      WHERE COALESCE((item->>'divergence')::boolean, false)
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_order_routing_trace(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_order_routing_trace(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_order_routing_trace(uuid) IS
  'Returns the tenant-scoped routing decision history and current KDS/item status divergence for one order.';

-- ---------------------------------------------------------------------------
-- Rolling seven-day support health view
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.v_kds_routing_health
WITH (security_invoker = true)
AS
WITH locations_seen AS (
  SELECT merchant_id, location_id
    FROM public.kds_routing_log
   WHERE fired_at >= now() - interval '7 days'
  UNION
  SELECT merchant_id, location_id
    FROM public.kds_send_attempts
   WHERE created_at >= now() - interval '7 days'
),
routing AS (
  SELECT
    merchant_id,
    location_id,
    count(DISTINCT order_item_id) AS items_fired,
    count(DISTINCT order_item_id) FILTER (
      WHERE outcome = 'dropped'
    ) AS items_dropped,
    count(DISTINCT order_item_id) FILTER (
      WHERE match_reason IN ('fallback_expo', 'fallback_blast')
    ) AS items_routed_by_fallback
  FROM public.kds_routing_log
  WHERE fired_at >= now() - interval '7 days'
  GROUP BY merchant_id, location_id
),
sends AS (
  SELECT
    merchant_id,
    location_id,
    count(*) FILTER (
      WHERE actually_updated_count <> requested_count
    ) AS partial_sends
  FROM public.kds_send_attempts
  WHERE created_at >= now() - interval '7 days'
  GROUP BY merchant_id, location_id
),
divergence AS (
  SELECT
    l.merchant_id,
    l.location_id,
    count(DISTINCT (l.order_item_id, l.kds_display_id)) AS status_divergence_count
  FROM public.kds_routing_log l
  JOIN public.order_items oi ON oi.id = l.order_item_id
  LEFT JOIN public.kds_item_status kis
    ON kis.order_item_id = l.order_item_id
   AND kis.kds_display_id = l.kds_display_id
  WHERE l.fired_at >= now() - interval '7 days'
    AND l.outcome = 'routed'
    AND (
      kis.id IS NULL
      OR (
        oi.kitchen_status IN ('ready', 'served')
        AND kis.status NOT IN ('completed', 'cancelled')
      )
      OR (
        COALESCE(oi.kitchen_status, '') NOT IN ('ready', 'served')
        AND kis.status = 'completed'
      )
    )
  GROUP BY l.merchant_id, l.location_id
)
SELECT
  ls.merchant_id,
  ls.location_id,
  COALESCE(r.items_fired, 0)::bigint AS items_fired,
  COALESCE(r.items_dropped, 0)::bigint AS items_dropped,
  COALESCE(r.items_routed_by_fallback, 0)::bigint AS items_routed_by_fallback,
  COALESCE(s.partial_sends, 0)::bigint AS partial_sends,
  COALESCE(d.status_divergence_count, 0)::bigint AS status_divergence_count,
  now() AS observed_at
FROM locations_seen ls
LEFT JOIN routing r USING (merchant_id, location_id)
LEFT JOIN sends s USING (merchant_id, location_id)
LEFT JOIN divergence d USING (merchant_id, location_id);

REVOKE ALL ON TABLE public.v_kds_routing_health FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.v_kds_routing_health TO authenticated, service_role;

COMMENT ON VIEW public.v_kds_routing_health IS
  'Tenant-scoped rolling seven-day KDS routing, partial-send, drop, fallback, and state-divergence metrics.';

-- ---------------------------------------------------------------------------
-- Honest historical backfill: only existing KDS rows are derivable. Historical
-- non-matches are not guessed and therefore are not inserted as dropped rows.
-- ---------------------------------------------------------------------------

INSERT INTO public.kds_routing_log (
  merchant_id,
  location_id,
  order_id,
  order_item_id,
  kds_display_id,
  kds_display_name,
  outcome,
  match_reason,
  resolved_prep_station,
  prep_station_source,
  item_category_id,
  item_category_name,
  order_type,
  displays_evaluated,
  displays_matched,
  fired_at,
  created_at
)
SELECT
  o.merchant_id,
  o.location_id,
  oi.order_id,
  oi.id,
  kis.kds_display_id,
  kd.display_name,
  'routed',
  'backfill_unknown',
  oi.prep_station,
  CASE WHEN oi.prep_station IS NULL THEN 'none' ELSE 'item_column' END,
  oi.category_id,
  oi.category_name,
  o.order_type::text,
  count(*) OVER (PARTITION BY oi.id),
  count(*) OVER (PARTITION BY oi.id),
  COALESCE(oi.sent_to_kitchen_at, kis.created_at),
  now()
FROM public.kds_item_status kis
JOIN public.order_items oi ON oi.id = kis.order_item_id
JOIN public.orders o ON o.id = oi.order_id
LEFT JOIN public.kds_displays kd ON kd.id = kis.kds_display_id
WHERE COALESCE(oi.sent_to_kitchen_at, kis.created_at) IS NOT NULL
ON CONFLICT (order_item_id, kds_display_id, fired_at) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Retention: normal traces/send attempts 180 days; dropped incident rows 2y.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.purge_kds_trace_ledgers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_routing_deleted integer := 0;
  v_attempts_deleted integer := 0;
BEGIN
  PERFORM set_config('app.kds_trace_retention', 'on', true);

  DELETE FROM public.kds_routing_log
   WHERE (
     outcome <> 'dropped'
     AND created_at < now() - interval '180 days'
   ) OR (
     outcome = 'dropped'
     AND created_at < now() - interval '2 years'
   );
  GET DIAGNOSTICS v_routing_deleted = ROW_COUNT;

  DELETE FROM public.kds_send_attempts
   WHERE created_at < now() - interval '180 days';
  GET DIAGNOSTICS v_attempts_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'routing_deleted', v_routing_deleted,
    'send_attempts_deleted', v_attempts_deleted
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.purge_kds_trace_ledgers()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_kds_trace_ledgers()
  TO service_role;

DO $schedule$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'kds-trace-ledger-purge') THEN
      PERFORM cron.unschedule('kds-trace-ledger-purge');
    END IF;

    PERFORM cron.schedule(
      'kds-trace-ledger-purge',
      '30 3 * * *',
      'SELECT public.purge_kds_trace_ledgers()'
    );
  END IF;
EXCEPTION
  WHEN undefined_table OR undefined_function OR insufficient_privilege THEN
    RAISE NOTICE 'KDS trace purge was not scheduled; run purge_kds_trace_ledgers() from an approved scheduler.';
END;
$schedule$;
