-- ============================================================================
-- Auto-settle missed-settlement watchdog
-- ----------------------------------------------------------------------------
-- The scheduled settle command for Castles runs on the POS tablet (separate
-- repo); Valor auto-batches on-device and reports via the valor-webhook. Either
-- path can silently fail to produce a settlement_batches row (tablet off, EPI
-- unset, webhook not delivered). This monitor flags those gaps so ops can see
-- them — it is a MONITOR, not a settler: it never reaches a terminal, it only
-- writes a warning audit_logs row (idempotent per terminal per business day).
--
-- Resolves settle_time in each location's timezone (locations.timezone), unlike
-- the older settle RPCs which hardcode America/New_York.
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
    v_loc_now timestamp;     -- "now" in the location's local wall-clock
    v_due     timestamp;     -- today's settle moment, local
    v_today   date;
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

        -- A settlement batch already exists today (any non-open outcome) => fine.
        IF EXISTS (
            SELECT 1 FROM public.settlement_batches sb
            WHERE sb.payment_terminal_id = r.id
              AND (sb.created_at AT TIME ZONE r.tz)::date = v_today
              AND sb.status IN ('pending','settling','settled','closed','funded','needs_review','retry')
        ) THEN
            CONTINUE;
        END IF;

        -- Already flagged today => idempotent no-op.
        IF EXISTS (
            SELECT 1 FROM public.audit_logs a
            WHERE a.resource_type = 'payment_terminal'
              AND a.resource_id = r.id
              AND a.action = 'auto_settle_missed'
              AND (a.created_at AT TIME ZONE r.tz)::date = v_today
        ) THEN
            CONTINUE;
        END IF;

        INSERT INTO public.audit_logs (
            actor_user_id, actor_role, action, action_category, severity,
            resource_type, resource_id, resource_name, merchant_id, location_id, status, metadata
        ) VALUES (
            NULL, 'system', 'auto_settle_missed', 'settlement', 'warning',
            'payment_terminal', r.id, r.terminal_name, r.merchant_id, r.location_id, 'failed',
            jsonb_build_object(
                'source', 'auto_settle_watchdog',
                'terminal_type', r.terminal_type,
                'settle_time', r.settle_time,
                'location_timezone', r.tz,
                'grace_minutes', p_grace_minutes,
                'business_date', v_today
            )
        );
        v_flagged := v_flagged + 1;
    END LOOP;

    RETURN v_flagged;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.flag_missed_auto_settlements(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flag_missed_auto_settlements(integer) TO service_role;

COMMENT ON FUNCTION public.flag_missed_auto_settlements(integer) IS
    'Hourly monitor: flags auto_settle terminals (Castles/Valor) that have no settlement_batches row for today past settle_time+grace, in the location timezone. Writes a warning audit_logs row (idempotent per terminal per day). Never contacts a terminal.';

-- Schedule hourly (idempotent: drop any prior schedule of the same name).
DO $$
BEGIN
    PERFORM cron.unschedule('flag-missed-auto-settlements');
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

SELECT cron.schedule(
    'flag-missed-auto-settlements',
    '0 * * * *',
    $cron$SELECT public.flag_missed_auto_settlements()$cron$
);
