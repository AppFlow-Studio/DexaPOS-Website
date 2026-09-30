-- Rollback for 20260930200000_station_kiosk_settings.sql
-- Kiosks fall back to defaults (Dine-In + Takeaway, no seat selection).
ALTER TABLE public.stations DROP CONSTRAINT IF EXISTS stations_kiosk_settings_is_object;
ALTER TABLE public.stations DROP COLUMN IF EXISTS kiosk_settings;
