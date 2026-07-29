-- =====================================================================
-- Valor semi-integration (1/5): allow 'valor' in payment_terminals.terminal_type
-- =====================================================================
-- payment_terminals.terminal_type is a TEXT column guarded by a CHECK
-- constraint (NOT the public.terminal_type enum, which other tables use).
-- Swap the CHECK to add 'valor'. Idempotent-safe via DROP CONSTRAINT IF EXISTS.
-- Targets the website PREVIEW environment; committed to the website repo.
-- =====================================================================

ALTER TABLE public.payment_terminals
  DROP CONSTRAINT IF EXISTS payment_terminals_terminal_type_check;

ALTER TABLE public.payment_terminals
  ADD CONSTRAINT payment_terminals_terminal_type_check
  CHECK (terminal_type = ANY (ARRAY['dejavoo'::text, 'castles'::text, 'valor'::text]));
