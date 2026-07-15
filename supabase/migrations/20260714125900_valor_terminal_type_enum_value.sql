-- =====================================================================
-- Valor semi-integration (0/5): add 'valor' to the terminal_type ENUM
-- =====================================================================
-- order_payments.terminal_type is the ENUM public.terminal_type (process_payment
-- casts 'valor'::terminal_type when writing the row). payment_terminals.terminal_type
-- is a separate TEXT+CHECK column (handled in migration 1/5). Both need 'valor'.
--
-- ALTER TYPE ... ADD VALUE must run in its OWN migration/transaction and be
-- committed BEFORE any statement uses the new value (process_payment_v17).
-- =====================================================================

ALTER TYPE public.terminal_type ADD VALUE IF NOT EXISTS 'valor';
