-- [Web] Dedup primitive for the kiosk confirmation/receipt SMS.
--
-- Background: the self-service kiosk fires exactly one customer SMS on payment
-- success — sendReceipt({ confirmation: true }) -> send-receipt (a receipt +
-- confirmation text with the hosted receipt link). Today that call is a
-- CLIENT-SIDE fire-and-forget (useKioskCheckout.ts step 7). On CodePay terminals
-- the app round-trips out to the CodePay Register app and back, and the
-- un-awaited request is dropped as checkout tears down to the success screen —
-- so the customer never gets the text (observed on prod order #S19-0001).
--
-- The fix (20260923121000) adds a SERVER-SIDE order->preparing trigger that
-- calls send-receipt, so delivery no longer depends on the device staying alive.
-- To keep the existing client fire-and-forget from DOUBLE-sending, this migration
-- adds a dedup primitive:
--
--   * is_confirmation flags a confirmation send (vs a POS "text me a receipt").
--   * A PARTIAL UNIQUE INDEX allows AT MOST ONE in-flight/sent confirmation SMS
--     per order. send-receipt inserts its receipt_sends row BEFORE calling Telnyx
--     and returns early if that insert fails, so whichever caller (trigger or
--     kiosk client) wins the index sends; the loser hits a 23505 and silently
--     skips. Race-free at the DB layer — no client-timing dependency.
--
-- Scope guarantees:
--   * Non-confirmation sends (confirmation=false, e.g. POS "text me a receipt")
--     are is_confirmation=false and NOT covered by the index -> freely resendable.
--   * A failed send flips out of ('pending','sent') -> leaves the index ->
--     a later retry can send (a transient Telnyx error never permanently blocks).
--   * Existing historical rows default is_confirmation=false, so the index build
--     never conflicts with pre-existing duplicate sms rows for an order.
--
-- Idempotent. Apply to staging first; deploy prod manually per convention.
-- Deploy ORDER matters: this migration + the send-receipt edge change (which sets
-- is_confirmation) must land BEFORE the order->preparing trigger (20260923121000),
-- otherwise there is a brief window where both senders fire undeduped.

ALTER TABLE public.receipt_sends
  ADD COLUMN IF NOT EXISTS is_confirmation boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_receipt_sends_confirmation_sms
  ON public.receipt_sends (order_id)
  WHERE delivery_method = 'sms'
    AND is_confirmation = true
    AND status IN ('pending', 'sent');
