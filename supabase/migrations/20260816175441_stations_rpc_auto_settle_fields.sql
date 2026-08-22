-- =====================================================================
-- get_location_stations_with_status: project auto_settle + settle_time.
-- Forks 20260722140000_fix_station_terminal_resolution_valor.sql IN-PLACE
-- (all prior columns preserved verbatim) and adds two fields to the
-- payment_terminal object so the POS tablet can read the per-terminal
-- auto-batch config from selectedStation.payment_terminal.
-- =====================================================================
-- Why: the Castles auto-batch scheduler runs on the POS tablet (separate
-- repo). It needs payment_terminals.auto_settle + settle_time on the client.
-- Both columns already exist on payment_terminals (the auto_settle watchdog
-- reads them). The client treats an ABSENT auto_settle as OFF (fail-safe), so
-- an un-migrated environment simply never auto-settles.
--
-- Return type stays JSON (only new keys inside the existing json_build_object),
-- so CREATE OR REPLACE is safe here — no DROP, no grant churn.
-- =====================================================================

CREATE OR REPLACE FUNCTION get_location_stations_with_status(
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
          'connection_type', pt.connection_type,
          -- Auto-batch settlement config (Castles). Consumed by the POS tablet
          -- scheduler; absent → scheduler treats as OFF.
          'auto_settle', pt.auto_settle,
          'settle_time', pt.settle_time
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

GRANT ALL ON FUNCTION get_location_stations_with_status(UUID) TO "anon";
GRANT ALL ON FUNCTION get_location_stations_with_status(UUID) TO "authenticated";
GRANT ALL ON FUNCTION get_location_stations_with_status(UUID) TO "service_role";
