-- =============================================================================
-- Rollback: 20260930190000_verify_staff_pin
-- =============================================================================
-- The POS treats a missing verify_staff_pin as an error and falls back to its
-- cached PIN match, so dropping it returns the per-order PIN gate to the
-- behaviour it had before the function existed.
-- =============================================================================

DROP FUNCTION IF EXISTS public.verify_staff_pin(uuid, text);
