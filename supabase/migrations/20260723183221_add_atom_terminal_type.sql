-- Add 'atom' to the terminal_type enum for LandiGlobal ATOM on-device terminals.
-- Must be applied (and committed) BEFORE process_payment_v17's atom branch can
-- insert terminal_type = 'atom'. ADD VALUE is idempotent via IF NOT EXISTS.
ALTER TYPE public.terminal_type ADD VALUE IF NOT EXISTS 'atom';
