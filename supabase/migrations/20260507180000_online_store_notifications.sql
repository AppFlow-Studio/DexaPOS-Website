-- Storefront notification preferences + per-customer opt-in + audit trail.

-- Per-merchant configurable defaults for storefront notifications.
ALTER TABLE online_store_config
  ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT jsonb_build_object(
    'email_on_order_placed', true,
    'sms_on_order_placed',   true,
    'email_on_status', jsonb_build_array('ready', 'cancelled'),
    'sms_on_status',   jsonb_build_array('accepted', 'ready', 'cancelled'),
    'admin_test_email', null,
    'admin_test_phone', null
  );
-- Customer-level transactional opt-in flags (default true since checkout
-- already collects the contact specifically for receipt/status delivery).
ALTER TABLE online_order_sessions
  ADD COLUMN IF NOT EXISTS customer_email_opt_in BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS customer_sms_opt_in   BOOLEAN NOT NULL DEFAULT true;
-- Audit trail for every notification we attempt to send for an online order.
CREATE TABLE IF NOT EXISTS order_notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  channel     text NOT NULL CHECK (channel IN ('email', 'sms')),
  event       text NOT NULL,
  recipient   text NOT NULL,
  status      text NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  provider_id text,
  error       text,
  sent_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_notifications_order_id_idx
  ON order_notifications (order_id);
CREATE INDEX IF NOT EXISTS order_notifications_merchant_recent_idx
  ON order_notifications (merchant_id, sent_at DESC);
ALTER TABLE order_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY order_notifications_admin_read
  ON order_notifications FOR SELECT
  USING (is_merchant_admin(merchant_id));
