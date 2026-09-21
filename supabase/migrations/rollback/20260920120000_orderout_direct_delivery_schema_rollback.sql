-- Rollback for 20260920120000_orderout_direct_delivery_schema.sql
-- Run the outbox rollback first (it owns the triggers/functions that reference
-- these tables). Dropping the tables discards quote and dispatch history.

DROP TABLE IF EXISTS public.orderout_delivery_dispatches;
DROP TABLE IF EXISTS public.orderout_delivery_quotes;

ALTER TABLE public.orderout_restaurants
  DROP COLUMN IF EXISTS channel_store_id,
  DROP COLUMN IF EXISTS channel_connected_at;

ALTER TABLE public.online_store_config
  DROP CONSTRAINT IF EXISTS online_store_config_delivery_fulfillment_check;
ALTER TABLE public.online_store_config
  DROP COLUMN IF EXISTS delivery_fulfillment;
