-- KDS routing fail-safe: a filtered display with ZERO rules is unconfigured, so
-- treat it as catch-all (show everything) instead of silently showing nothing.
--
-- Problem: a kds_display with routing_mode != 'all', no kds_routing_rules, and
-- show_all_items = false matches no item on its own. At a location where another
-- display claims items by rule, the rule-less display therefore receives nothing
-- (the last-resort blast only fires for items that matched NO display anywhere).
-- Operators read this as "the KDS shows nothing unless I turn on show-all".
--
-- Fix: inside route_items_to_kds(), if a non-'all' display has no rules at all,
-- match every item (new match_reason 'no_rules_catch_all'). The moment a rule is
-- added the display filters normally again. Show-all and blast fallbacks, the
-- NULL->non-NULL fire guard, prep-station resolution, and the routing log are all
-- preserved unchanged.

-- ---------------------------------------------------------------------------
-- 1. Allow the new diagnostic reason in the routing log CHECK constraint
-- ---------------------------------------------------------------------------
ALTER TABLE public.kds_routing_log
  DROP CONSTRAINT IF EXISTS kds_routing_log_reason_chk;

ALTER TABLE public.kds_routing_log
  ADD CONSTRAINT kds_routing_log_reason_chk
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
    'backfill_unknown',
    'no_rules_catch_all'
  ));

-- ---------------------------------------------------------------------------
-- 2. Harden route_items_to_kds() with the no-rules fail-safe
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
  v_has_rules boolean := false;
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
    v_has_rules := false;
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
        v_has_rules := true;

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

      -- Fail-safe: a non-'all' display with NO rules at all is unconfigured;
      -- treat it as catch-all (show everything) instead of showing nothing.
      -- As soon as any rule exists this branch is skipped and normal filtering
      -- resumes. Counts as a specific match so a peer show_all display is not
      -- relabelled as the expo fallback below.
      IF NOT v_matched AND NOT v_has_rules THEN
        v_matched := true;
        v_match_reason := 'no_rules_catch_all';
        v_specific_match_count := v_specific_match_count + 1;
      END IF;
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

COMMENT ON FUNCTION public.route_items_to_kds() IS
'Routes order items to KDS displays on sent_to_kitchen_at. Matches by routing_mode=all, prep_station/category/order_type rules, or show_all_items. A non-all display with zero rules is treated as catch-all (no_rules_catch_all) so an unconfigured station shows everything rather than nothing. Last-resort blast still covers items that match no display.';
