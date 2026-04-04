-- ============================================================================
-- Migration 047: Abandoned Cart Recovery
-- ============================================================================
-- Tracks cart abandonment notifications for recovery emails/SMS.
-- ============================================================================

CREATE TABLE public.abandoned_cart_notifications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        uuid NOT NULL REFERENCES public.online_order_sessions(id) ON DELETE CASCADE,
  store_config_id   uuid NOT NULL REFERENCES public.online_store_config(id),
  notification_type text NOT NULL CHECK (notification_type IN ('email', 'sms')),
  recipient         text NOT NULL,
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'clicked')),
  recovery_token    text NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  sent_at           timestamptz,
  clicked_at        timestamptz,
  error_message     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_abandoned_cart_session_id ON public.abandoned_cart_notifications(session_id);
CREATE INDEX idx_abandoned_cart_store_config ON public.abandoned_cart_notifications(store_config_id);
CREATE INDEX idx_abandoned_cart_recovery_token ON public.abandoned_cart_notifications(recovery_token);
CREATE INDEX idx_abandoned_cart_status ON public.abandoned_cart_notifications(status);

-- updated_at trigger
CREATE TRIGGER set_abandoned_cart_notifications_updated_at
  BEFORE UPDATE ON public.abandoned_cart_notifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE public.abandoned_cart_notifications ENABLE ROW LEVEL SECURITY;

-- Service role has full access (used by edge functions and server actions)
CREATE POLICY "Service role full access on abandoned_cart_notifications"
  ON public.abandoned_cart_notifications
  FOR ALL
  USING (true)
  WITH CHECK (true);
