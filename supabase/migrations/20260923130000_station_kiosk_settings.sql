-- [Web + POS] Per-station kiosk ordering settings.
--
-- Two merchant-facing kiosk controls, edited on the station detail page
-- (/dashboard/settings/stations/[stationId] → Kiosk tab) and read by the POS
-- kiosk (hooks/kiosk/useKioskProfile.ts) alongside the kiosk profile:
--
--   order_types               'both' | 'dine_in_only' | 'takeout_only'
--   dine_in_only_skip_prompt  Dine-In only: start as Dine-In without asking
--   seat_selection_enabled    ask dine-in customers where they are sitting
--   seat_options              [{ id, label }] merchant-defined seat labels
--
-- The chosen seat label is written to orders.table_number by the kiosk, which
-- every staff surface (KDS, kitchen/receipt prints, order details) already
-- renders — no RPC or broadcast change needed.
--
-- Why a station column and not kiosk_profiles: a profile is shared by many
-- stations, and kiosks in different areas (patio vs bar) need different seat
-- lists. Why not pos_config_overrides: set_station_pos_config_overrides_v1
-- whitelists only display/notifications.
--
-- Shape is validated in the web server action (zod) and normalised tolerantly
-- on the device; the DB only guarantees it is a JSON object so a malformed
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
  'Self-service kiosk ordering settings: order_types, dine_in_only_skip_prompt, seat_selection_enabled, seat_options[{id,label}]. Seat label is written to orders.table_number.';
