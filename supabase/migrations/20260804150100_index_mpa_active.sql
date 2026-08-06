-- [C1] Hot-path and FK indexes for merchant processor accounts.
--
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block. Keep this
-- migration separate and execute each statement outside an explicit BEGIN.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mpa_merchant_purpose_active
  ON public.merchant_processor_accounts (merchant_id, purpose)
  WHERE is_active;

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_mpa_primary_scope
  ON public.merchant_processor_accounts (merchant_id, location_id, purpose)
  NULLS NOT DISTINCT
  WHERE is_active AND is_primary;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_online_order_payment_intents_processor_account
  ON public.online_order_payment_intents (merchant_processor_account_id)
  WHERE merchant_processor_account_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_online_store_config_processor_account
  ON public.online_store_config (merchant_processor_account_id)
  WHERE merchant_processor_account_id IS NOT NULL;
