-- =====================================================================
-- Fix get_location_stations_with_status: terminal resolution + Valor.
-- Forks 20260714130300_get_location_stations_valor_fields.sql in-place
-- (ALL prior columns preserved: current_receipt_printer_id, kiosk_profile_id,
-- valor cancel_port/epi). Signature kept as RETURNS JSON (changing it errors).
-- =====================================================================
-- BUG: the function resolved the station's payment terminal through the
-- station_devices link table. The POS client never writes station_devices (it
-- is empty), so the join returned NULL / a stale device for every station —
-- a freshly registered Valor terminal rendered as "Dejavoo" (default) and
-- routed to the wrong health check.
--
-- FIX: resolve directly from payment_terminals.station_id + is_active (the same
-- source of truth the client uses in loadTerminals / register / switch),
-- deterministically via LEFT JOIN LATERAL ... ORDER BY updated_at LIMIT 1 so a
-- brief >1-active-row window can't flap the result.
--
-- Also: ip_address is now cast to text. valor_ip_address / local_ip_address
-- have mismatched pg types (one inet, one text) and a bare COALESCE of them
-- raises "COALESCE types text and inet cannot be matched" at runtime.
--
-- DROP + CREATE (not CREATE OR REPLACE): staging was left RETURNS jsonb by an
-- earlier hotfix while prod/baseline are RETURNS json, and CREATE OR REPLACE
-- cannot change a function's return type ("cannot change return type of
-- existing function", 42P13). DROP normalizes both back to json. DROP also
-- drops grants, so they are re-applied below (baseline granted ALL to anon /
-- authenticated / service_role).
-- =====================================================================

DROP FUNCTION IF EXISTS get_location_stations_with_status(UUID);

CREATE FUNCTION get_location_stations_with_status(
  p_location_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(station_data ORDER BY station_number, station_name), '[]'::json)
    FROM (
      SELECT
        s.id,
        s.station_name,
        s.station_type,
        s.station_number,
        s.is_active,
        ss.id IS NULL as is_available,
        CASE WHEN ss.id IS NOT NULL THEN json_build_object(
          'session_id', ss.id,
          'device_name', ss.device_name,
          'staff_name', ss.staff_name,
          'started_at', ss.started_at
        ) ELSE null END as current_session,
        s.view_scope,
        s.can_create_orders,
        s.can_process_payments,
        s.can_void_orders,
        s.can_apply_discounts,
        s.can_update_kitchen_status,
        s.is_online,
        s.last_heartbeat_at,
        s.hardware_model,
        s.device_manufacturer,
        s.device_model,
        s.network_type,
        s.battery_level,
        s.has_builtin_printer,
        s.has_builtin_cfd,
        s.has_cash_drawer_port,
        s.has_nfc,
        s.app_version,
        s.os_version,
        s.current_receipt_printer_id,
        s.kiosk_profile_id,
        CASE WHEN pt.id IS NOT NULL THEN json_build_object(
          'id', pt.id,
          'terminal_name', pt.terminal_name,
          'tpn', pt.tpn,
          'register_id', pt.register_id,
          'terminal_type', pt.terminal_type,
          'terminal_model', pt.terminal_model,
          'is_connected', pt.is_connected,
          'last_connection_status', pt.last_connection_status,
          'last_connection_test_at', pt.last_connection_test_at,
          'ip_address', COALESCE(pt.local_ip_address::text, pt.valor_ip_address::text),
          'port', COALESCE(pt.local_port, pt.valor_port),
          'cancel_port', pt.valor_cancel_port,
          'epi', pt.valor_epi,
          'connection_type', pt.connection_type
        ) ELSE null END as payment_terminal
      FROM stations s
      LEFT JOIN station_sessions ss
        ON s.id = ss.station_id
        AND ss.session_status = 'active'
      LEFT JOIN LATERAL (
        SELECT p.*
        FROM payment_terminals p
        WHERE p.station_id = s.id
          AND p.is_active = TRUE
        ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC
        LIMIT 1
      ) pt ON TRUE
      WHERE s.location_id = p_location_id
        AND s.is_active = TRUE
    ) station_data
  );
END;
$$;

-- Re-grant (DROP removed the baseline grants).
GRANT ALL ON FUNCTION get_location_stations_with_status(UUID) TO "anon";
GRANT ALL ON FUNCTION get_location_stations_with_status(UUID) TO "authenticated";
GRANT ALL ON FUNCTION get_location_stations_with_status(UUID) TO "service_role";
