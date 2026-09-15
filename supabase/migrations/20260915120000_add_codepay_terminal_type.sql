-- Add 'codepay' to the terminal_type enum for on-terminal CodePay Register
-- (Android Intent) terminals. Must be applied (and committed) BEFORE
-- process_payment_v17's codepay branch can insert terminal_type = 'codepay'
-- (Postgres forbids using a newly-added enum value in the same transaction).
-- ADD VALUE is idempotent via IF NOT EXISTS. Mirrors 20260723183221 (atom).
ALTER TYPE public.terminal_type ADD VALUE IF NOT EXISTS 'codepay';
