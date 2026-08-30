-- Rollback for 20260829130000_public_reservation_config.sql
--
-- Drops the config function. Safe: nothing else reads it, and the booking
-- widget falls back to the venue phone number when no bookable branch resolves
-- — the behaviour that shipped before the location picker.

DROP FUNCTION IF EXISTS public.get_public_reservation_config(uuid);
