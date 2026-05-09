-- Rollback for 20260509120000_bulk_adjust_menu_item_prices.sql
--
-- Drops the bulk price adjustment RPC. This file is NOT applied automatically;
-- run it manually if the forward migration must be reverted.
--
-- Local: psql "$DATABASE_URL" -f supabase/migrations/rollback/20260509120000_bulk_adjust_menu_item_prices_rollback.sql
-- Remote: paste into Supabase SQL editor and execute.
--
-- NOTE: This rolls back only the function definition. Any price changes already
-- written by callers of the RPC (UPDATEs to menu_items.price /
-- location_item_overrides.custom_price) are NOT undone — those are normal data
-- writes captured in audit_logs (action='bulk_price_adjust'). To reverse them,
-- replay the per-item before/after pairs from the audit log.

DROP FUNCTION IF EXISTS public.bulk_adjust_menu_item_prices(
  uuid,        -- p_merchant_id
  uuid,        -- p_location_id
  uuid[],      -- p_item_ids
  text,        -- p_operation
  numeric,     -- p_value
  text,        -- p_rounding
  text         -- p_actor_user_id
);
