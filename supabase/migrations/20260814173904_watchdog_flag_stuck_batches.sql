-- ============================================================================
-- Watchdog v2 — also flag STUCK settlement batches, not just missing ones.
-- ----------------------------------------------------------------------------
-- v1 (20260813220449) skipped a terminal if ANY batch existed today, so a
-- prepare_*_settlement that pinned a 'pending' batch but never finalized (the
-- tablet reached the terminal, then died / the terminal timed out) looked
-- "handled" and was never surfaced. v2 distinguishes:
--   * real outcome today (settled/closed/funded/needs_review) -> fine, skip
--   * batch stuck in pending/settling past settle_time+grace  -> 'auto_settle_stuck'
--   * nothing / only failed|retry                             -> 'auto_settle_missed'
-- Still a MONITOR (writes a warning audit row, idempotent per terminal/action/day);
-- never contacts a terminal. Resolves settle_time in the location timezone.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.flag_missed_auto_settlements(p_grace_minutes integer DEFAULT 60)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_flagged integer := 0;
    r         record;
    v_loc_now timestamp;
    v_due     timestamp;
    v_today   date;
    v_has_success boolean;
    v_has_review  boolean;
    v_has_stuck   boolean;
    v_action  text;
    v_reason  text;
BEGIN
    FOR r IN
        SELECT pt.id, pt.merchant_id, pt.location_id, pt.terminal_name,
               pt.terminal_type, pt.settle_time,
               COALESCE(loc.timezone, 'America/New_York') AS tz
        FROM public.payment_terminals pt
        JOIN public.locations loc ON loc.id = pt.location_id
        WHERE pt.auto_settle = true
          AND pt.is_active = true
          AND pt.settle_time IS NOT NULL
          AND pt.terminal_type IN ('castles', 'valor')
    LOOP
        v_loc_now := (now() AT TIME ZONE r.tz);
        v_today   := v_loc_now::date;
        v_due     := (v_today + r.settle_time);

        -- Not yet past settle_time + grace in the location's timezone.
        IF v_loc_now < v_due + make_interval(mins => p_grace_minutes) THEN
            CONTINUE;
        END IF;

        SELECT
            bool_or(sb.status IN ('settled','closed','funded')) AS has_success,
            bool_or(sb.status = 'needs_review')                 AS has_review,
            bool_or(sb.status IN ('pending','settling'))        AS has_stuck
        INTO v_has_success, v_has_review, v_has_stuck
        FROM public.settlement_batches sb
        WHERE sb.payment_terminal_id = r.id
          AND (sb.created_at AT TIME ZONE r.tz)::date = v_today;

        -- A real outcome already exists today (settled, or already flagged for review) => fine.
        IF COALESCE(v_has_success, false) OR COALESCE(v_has_review, false) THEN
            CONTINUE;
        END IF;

        IF COALESCE(v_has_stuck, false) THEN
            v_action := 'auto_settle_stuck';
            v_reason := 'A settlement batch is stuck in pending/settling past settle time — a settle was prepared but never finalized (terminal timeout or tablet died mid-settle).';
        ELSE
            v_action := 'auto_settle_missed';
            v_reason := 'No successful settlement batch for this terminal today past its settle time (tablet off, or every attempt failed).';
        END IF;

        -- Idempotent per terminal/action/day.
        IF EXISTS (
            SELECT 1 FROM public.audit_logs a
            WHERE a.resource_type = 'payment_terminal'
              AND a.resource_id = r.id
              AND a.action = v_action
              AND (a.created_at AT TIME ZONE r.tz)::date = v_today
        ) THEN
            CONTINUE;
        END IF;

        INSERT INTO public.audit_logs (
            actor_user_id, actor_role, action, action_category, severity,
            resource_type, resource_id, resource_name, merchant_id, location_id, status, metadata
        ) VALUES (
            NULL, 'system', v_action, 'settlement', 'warning',
            'payment_terminal', r.id, r.terminal_name, r.merchant_id, r.location_id, 'failed',
            jsonb_build_object(
                'source', 'auto_settle_watchdog',
                'terminal_type', r.terminal_type,
                'settle_time', r.settle_time,
                'location_timezone', r.tz,
                'grace_minutes', p_grace_minutes,
                'business_date', v_today,
                'reason', v_reason
            )
        );
        v_flagged := v_flagged + 1;
    END LOOP;

    RETURN v_flagged;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.flag_missed_auto_settlements(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flag_missed_auto_settlements(integer) TO service_role;
