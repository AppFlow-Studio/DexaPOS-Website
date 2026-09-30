-- [Web + POS] Per-station kiosk ordering settings.
--
-- (Written 2026-09-23 as 20260923130000; re-stamped 2026-09-30 so it sorts
-- after main's latest migration, which the release guard requires. Staging
-- already ran it under the old stamp; the SQL is idempotent.)
--
-- Kiosk ordering controls, edited on the station detail page
-- (/dashboard/settings/stations/[stationId] → Kiosk tab) and read by the POS
-- kiosk (hooks/kiosk/useKioskProfile.ts) alongside the kiosk profile:
--
--   order_types               'both' | 'dine_in_only' | 'takeout_only'
--   dine_in_only_skip_prompt  Dine-In only: start as Dine-In without asking
--   table_label               fixed table for every dine-in order, or null
--   seat_mode                 'off' | 'ask' | 'fixed'
--   fixed_seat_label          this kiosk's seat when seat_mode = 'fixed'
--   seat_options              [{ id, label }] seats the guest picks from ('ask')
--   seat_selection_enabled    legacy: written as seat_mode = 'ask' for older
--                             kiosk builds
--
-- The kiosk writes the resulting label ("Table 1, Seat 3", "Table 1",
-- "Seat 3") to orders.table_number, which every staff surface (KDS,
-- kitchen/receipt prints, order details) already renders — no RPC or
-- broadcast change needed.
--
-- Why a station column and not kiosk_profiles: a profile is shared by many
-- stations, and kiosks in different areas (patio vs bar) need different seat
-- lists. Why not pos_config_overrides: set_station_pos_config_overrides_v1
-- whitelists only display/notifications.
--
-- Shape is normalised in the web server action (normalizeStationKioskSettings)
-- and again, tolerantly, on the device; the DB only guarantees it is a JSON object so a malformed
-- write can never crash the kiosk's parser. Older POS builds ignore the column.

ALTER TABLE public.stations
  ADD COLUMN IF NOT EXISTS kiosk_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stations_kiosk_settings_is_object'
  ) THEN
    ALTER TABLE public.stations
      ADD CONSTRAINT stations_kiosk_settings_is_object
      CHECK (jsonb_typeof(kiosk_settings) = 'object');
  END IF;
END $$;

COMMENT ON COLUMN public.stations.kiosk_settings IS
  'Self-service kiosk ordering settings: order_types, dine_in_only_skip_prompt, table_label, seat_mode (off/ask/fixed), fixed_seat_label, seat_options[{id,label}], legacy seat_selection_enabled. The table/seat label is written to orders.table_number.';
