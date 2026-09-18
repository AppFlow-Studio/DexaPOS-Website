-- ============================================================================
-- Widen the payment_terminals.terminal_type CHECK constraint to include the
-- shipped on-terminal vendor integrations 'atom' and 'codepay'.
--
-- WHY THIS EXISTS. terminal_type is gated in TWO independent places:
--   1. the enum type public.terminal_type (used by RPC params, e.g.
--      process_payment_v17), and
--   2. a CHECK constraint on the payment_terminals.terminal_type *column*
--      (which is plain text, NOT the enum).
--
-- 20260915120000_add_codepay_terminal_type.sql added 'codepay' to the enum (1)
-- but left the column CHECK (2) untouched — it still only allowed
-- ['dejavoo','castles','valor']. So inserting a real codepay terminal row failed
-- with payment_terminals_terminal_type_check even though the enum accepted the
-- value. 'atom' had the same latent gap (in the enum, missing from the CHECK).
--
-- This migration realigns the column CHECK with the shipped vendor set. All
-- existing rows (dejavoo/castles/valor) remain valid, so the re-add validates
-- cleanly. Applied to STAGING (dfwqakoyittmrwbqvxgw) 2026-09-15; PROD is the
-- user's manual deploy.
-- ============================================================================

ALTER TABLE public.payment_terminals
  DROP CONSTRAINT IF EXISTS payment_terminals_terminal_type_check;

ALTER TABLE public.payment_terminals
  ADD CONSTRAINT payment_terminals_terminal_type_check
  CHECK (terminal_type = ANY (ARRAY['dejavoo','castles','valor','atom','codepay']::text[]));
