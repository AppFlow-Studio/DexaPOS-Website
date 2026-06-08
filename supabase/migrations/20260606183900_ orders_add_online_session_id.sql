-- Adds orders.online_session_id — the FK from a qr_dine_in (and other
-- guest-initiated online) order back to the guest's online_order_sessions
-- row. Required by broadcast_order_changes() (see migration
-- 20260530103000_qr_order_session_realtime.sql), which reads
-- orders.online_session_id to derive the per-session realtime topic
-- 'qr-session:<session_token>'. Without this column the trigger raises a
-- WARNING ("column does not exist") at runtime and silently swallows the
-- per-session broadcast, so guests never get live status updates.
--
-- ON DELETE SET NULL: if a session row is ever purged we keep the order
-- history intact and just lose the back-link.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS online_session_id uuid
  REFERENCES public.online_order_sessions(id) ON DELETE SET NULL;
-- Partial index supports both directions of the join the trigger and the
-- "orders for this guest session" lookups use. Excludes the (large) NULL
-- bucket from non-online orders.
CREATE INDEX IF NOT EXISTS idx_orders_online_session_id
  ON public.orders (online_session_id)
  WHERE online_session_id IS NOT NULL;
COMMENT ON COLUMN public.orders.online_session_id IS
  'FK to online_order_sessions.id for guest-initiated orders (qr_dine_in, online). NULL for staff-created in-store orders. Drives the qr-session:<token> realtime topic used by the guest status screen.';