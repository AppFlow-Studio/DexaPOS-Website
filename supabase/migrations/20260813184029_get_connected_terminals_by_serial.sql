-- ============================================================================
-- get_connected_terminals_by_serial
-- ----------------------------------------------------------------------------
-- Read model for "unique payment terminals connected, keyed by serial number".
-- Returns ONE row per physical terminal (deduplicated by serial_number) for a
-- merchant, with live connection state and the auto-settle config that the
-- scheduler / Valor webhook depend on. Terminals with no serial yet are kept
-- individually (keyed by id) so the overview is not silently empty during the
-- serial backfill rollout.
--
-- Scope: Castles + Valor terminals (the LAN-local semi-integrated fleet this
-- feature targets). Dejavoo cloud terminals are identified by register_id and
-- are out of scope here.
--
-- Auth: SECURITY DEFINER (bypasses table RLS) but guarded in-function so the
-- caller must be a merchant admin of p_merchant_id OR a Dexa HQ admin. HQ
-- server actions additionally gate with assertHQPermission('hq.merchant.view').
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_connected_terminals_by_serial(
    p_merchant_id uuid,
    p_location_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
    terminal_uuid uuid,
    serial_number text,
    terminal_name text,
    terminal_type text,
    terminal_model text,
    station_id uuid,
    station_name text,
    location_id uuid,
    location_name text,
    is_active boolean,
    is_connected boolean,
    last_connection_test_at timestamptz,
    last_connection_status text,
    connection_state text,
    last_transaction_at timestamptz,
    last_batch_at timestamptz,
    open_batch_count integer,
    consecutive_failures integer,
    auto_settle boolean,
    settle_time time without time zone,
    valor_epi text,
    duplicate_serial boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    -- Authorization: merchant admin of this merchant, or a Dexa HQ admin.
    -- COALESCE so a NULL predicate (no JWT / anon) is treated as unauthorized.
    IF NOT (COALESCE(public.is_merchant_admin(p_merchant_id), false)
            OR COALESCE(public.is_dexapos_admin(), false)) THEN
        RAISE EXCEPTION 'Not authorized to view terminals for this merchant'
            USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    WITH ranked AS (
        SELECT
            pt.id,
            pt.serial_number,
            pt.terminal_name,
            pt.terminal_type,
            pt.terminal_model,
            pt.station_id,
            st.station_name,
            pt.location_id,
            loc.name AS location_name,
            pt.is_active,
            pt.is_connected,
            pt.last_connection_test_at,
            pt.last_connection_status,
            CASE
                WHEN pt.last_connection_test_at IS NULL THEN 'unknown'
                WHEN pt.last_connection_test_at < now() - interval '10 minutes' THEN 'stale'
                WHEN pt.is_connected THEN 'online'
                ELSE 'offline'
            END AS connection_state,
            pt.last_transaction_at,
            pt.last_batch_at,
            pt.open_batch_count,
            pt.consecutive_failures,
            pt.auto_settle,
            pt.settle_time,
            pt.valor_epi,
            -- true when 2+ rows share this (non-null) serial
            (COUNT(*) FILTER (WHERE pt.serial_number IS NOT NULL)
                OVER (PARTITION BY pt.serial_number)) > 1 AS duplicate_serial,
            -- keep the connected / most-recently-tested row per serial;
            -- null-serial terminals each form their own partition (always kept)
            ROW_NUMBER() OVER (
                PARTITION BY CASE
                    WHEN pt.serial_number IS NULL THEN 'ID:' || pt.id::text
                    ELSE pt.serial_number
                END
                ORDER BY pt.is_connected DESC,
                         pt.last_connection_test_at DESC NULLS LAST,
                         pt.updated_at DESC
            ) AS rn
        FROM public.payment_terminals pt
        LEFT JOIN public.locations loc ON loc.id = pt.location_id
        LEFT JOIN public.stations st ON st.id = pt.station_id
        WHERE pt.merchant_id = p_merchant_id
          AND pt.is_active = true
          AND pt.terminal_type IN ('castles', 'valor')
          AND (p_location_id IS NULL OR pt.location_id = p_location_id)
    )
    SELECT
        ranked.id                     AS terminal_uuid,
        ranked.serial_number,
        ranked.terminal_name,
        ranked.terminal_type,
        ranked.terminal_model,
        ranked.station_id,
        ranked.station_name,
        ranked.location_id,
        ranked.location_name,
        ranked.is_active,
        ranked.is_connected,
        ranked.last_connection_test_at,
        ranked.last_connection_status,
        ranked.connection_state,
        ranked.last_transaction_at,
        ranked.last_batch_at,
        ranked.open_batch_count,
        ranked.consecutive_failures,
        ranked.auto_settle,
        ranked.settle_time,
        ranked.valor_epi,
        ranked.duplicate_serial
    FROM ranked
    WHERE ranked.rn = 1
    ORDER BY ranked.connection_state, ranked.terminal_name;
END;
$function$;

-- Least privilege: strip the implicit PUBLIC grant so only authenticated
-- sessions can reach the RPC (the in-function guard further limits to admins).
REVOKE EXECUTE ON FUNCTION public.get_connected_terminals_by_serial(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_connected_terminals_by_serial(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.get_connected_terminals_by_serial(uuid, uuid) IS
    'Unique connected payment terminals for a merchant, deduplicated by serial_number, '
    'with derived connection_state and auto-settle config. Castles + Valor only. '
    'Guarded to merchant admins or Dexa HQ admins.';
