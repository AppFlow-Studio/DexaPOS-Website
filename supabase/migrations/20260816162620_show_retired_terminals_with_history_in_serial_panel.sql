-- get_connected_terminals_by_serial: surface RETIRED (is_active=false) Castles/Valor
-- terminals that still carry financial history, so a deactivated/swapped device — and
-- the settlement batches + unsettled money keyed to it — never silently disappear from
-- the "Unique Terminals (by serial)" panel.
--
-- Real-world trigger: a Valor VP350 (S/N NDC800047439) failed its last connection test
-- with an IdentityMismatch (the physically-connected unit reported a different EPI),
-- got auto-deactivated, and — because this RPC hard-filtered is_active=true — vanished
-- from the panel along with its 3 settlement batches and ~$167 of unsettled money. Only
-- the sibling Vp550 stayed visible, making it look like the two devices' batches had
-- merged. Retired devices with history must remain visible for reconciliation.
--
-- Changes vs prior definition:
--   1. WHERE no longer hard-filters is_active=true. Inactive rows are included only
--      when they have history (a settlement_batch by payment_terminal_id, or an
--      order_payment by terminal_id) — empty deactivated test rows stay hidden.
--   2. Dedup ROW_NUMBER now prefers the ACTIVE row (is_active DESC first), so a serial
--      that has both an active and a retired row still resolves to the live device.
--   3. duplicate_serial now counts only ACTIVE rows, so a retired predecessor sharing a
--      serial does not raise a false "Dup" data-integrity warning.
--   4. Outer ORDER BY lists active devices above retired ones.
-- is_active is already in the RETURNS TABLE signature and SELECT list — the client
-- ConnectedTerminalRow type already carries it, so no app-layer contract change.

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
          AND pt.terminal_type IN ('castles', 'valor')
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
