-- get_connected_terminals_by_serial: include CodePay (on-terminal) devices in the
-- "Unique Terminals (by serial)" panel, alongside Castles and Valor.
--
-- CodePay terminals (terminal_type='codepay') are real payment_terminals rows —
-- auto-provisioned per device on the POS, keyed on a device serial — that carry
-- settlement batches + transaction history just like Valor/Castles. The panel's
-- prior hard filter `terminal_type IN ('castles','valor')` dropped them, so they
-- never surfaced in the merchant admin. Widen the filter to include 'codepay'.
--
-- ONLY change vs the prior definition (20260816162620): the WHERE terminal_type
-- IN list now contains 'codepay'. Signature, dedup/ranking, history-visibility,
-- and ordering are byte-for-byte unchanged.

CREATE OR REPLACE FUNCTION public.get_connected_terminals_by_serial(p_merchant_id uuid, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(terminal_uuid uuid, serial_number text, terminal_name text, terminal_type text, terminal_model text, station_id uuid, station_name text, location_id uuid, location_name text, is_active boolean, is_connected boolean, last_connection_test_at timestamp with time zone, last_connection_status text, connection_state text, last_transaction_at timestamp with time zone, last_batch_at timestamp with time zone, open_batch_count integer, consecutive_failures integer, auto_settle boolean, settle_time time without time zone, valor_epi text, duplicate_serial boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF NOT (COALESCE(public.is_merchant_admin(p_merchant_id), false)
            OR COALESCE(public.is_dexapos_admin(), false)) THEN
        RAISE EXCEPTION 'Not authorized to view terminals for this merchant' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    WITH ranked AS (
        SELECT pt.id, pt.serial_number, pt.terminal_name, pt.terminal_type, pt.terminal_model,
            pt.station_id, st.station_name, pt.location_id, loc.name AS location_name,
            pt.is_active, pt.is_connected, pt.last_connection_test_at, pt.last_connection_status,
            CASE
                WHEN pt.last_connection_test_at IS NULL THEN 'unknown'
                WHEN pt.last_connection_test_at < now() - interval '10 minutes' THEN 'stale'
                WHEN pt.is_connected THEN 'online'
                ELSE 'offline'
            END AS connection_state,
            pt.last_transaction_at, pt.last_batch_at, pt.open_batch_count, pt.consecutive_failures,
            pt.auto_settle, pt.settle_time, pt.valor_epi,
            (COUNT(*) FILTER (WHERE pt.serial_number IS NOT NULL AND pt.is_active)
                OVER (PARTITION BY pt.serial_number)) > 1 AS duplicate_serial,
            ROW_NUMBER() OVER (
                PARTITION BY CASE WHEN pt.serial_number IS NULL THEN 'ID:' || pt.id::text ELSE pt.serial_number END
                ORDER BY pt.is_active DESC, pt.is_connected DESC, pt.last_connection_test_at DESC NULLS LAST, pt.updated_at DESC
            ) AS rn
        FROM public.payment_terminals pt
        LEFT JOIN public.locations loc ON loc.id = pt.location_id
        LEFT JOIN public.stations st ON st.id = pt.station_id
        WHERE pt.merchant_id = p_merchant_id
          AND pt.terminal_type IN ('castles', 'valor', 'codepay')
          AND (p_location_id IS NULL OR pt.location_id = p_location_id)
          AND (
              pt.is_active = true
              OR EXISTS (SELECT 1 FROM public.settlement_batches sb WHERE sb.payment_terminal_id = pt.id)
              OR EXISTS (SELECT 1 FROM public.order_payments op WHERE op.terminal_id = pt.id::text)
          )
    )
    SELECT ranked.id, ranked.serial_number, ranked.terminal_name, ranked.terminal_type,
        ranked.terminal_model, ranked.station_id, ranked.station_name, ranked.location_id,
        ranked.location_name, ranked.is_active, ranked.is_connected, ranked.last_connection_test_at,
        ranked.last_connection_status, ranked.connection_state, ranked.last_transaction_at,
        ranked.last_batch_at, ranked.open_batch_count, ranked.consecutive_failures,
        ranked.auto_settle, ranked.settle_time, ranked.valor_epi, ranked.duplicate_serial
    FROM ranked WHERE ranked.rn = 1
    ORDER BY ranked.is_active DESC, ranked.connection_state, ranked.terminal_name;
END;
$function$;
