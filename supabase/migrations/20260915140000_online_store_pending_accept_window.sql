-- Per-store "window to accept orders": how long a pending online order waits
-- for the merchant to accept before the storefront tracking page auto-cancels
-- it (customer-side "No response from restaurant" timeout).
--
-- Previously hardcoded to 1 minute in app/sites/components/OrderTrackingPage.tsx.
-- Now configurable per location via Dashboard → Online Ordering. Stored in
-- whole minutes; the storefront converts to seconds. Default 5 minutes.
ALTER TABLE public.online_store_config
  ADD COLUMN IF NOT EXISTS pending_accept_window_minutes integer NOT NULL DEFAULT 5;

COMMENT ON COLUMN public.online_store_config.pending_accept_window_minutes IS
  'Minutes a pending online order waits for merchant acceptance on the storefront tracking page before the customer-side auto-cancel fires. Only applies when auto_accept_orders is false. Default 5.';
