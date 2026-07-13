ALTER TABLE public.order_payments
  ADD COLUMN IF NOT EXISTS service_charge numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.order_payments
  ADD COLUMN IF NOT EXISTS service_charge_refunded numeric(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.order_payments.service_charge IS
  'Snapshot of this payment''s share of orders.service_charge captured at process_payment_v13 insert time. Proportional to v_payment_total / orders.card_total; last split-portion snaps to gross so SUM across payments equals orders.service_charge. Basis for proportional SC reversal in apply_refund_to_payment_v4.';

COMMENT ON COLUMN public.order_payments.service_charge_refunded IS
  'Cumulative SC portion refunded across all reversals on this payment. Mirrors refunded_dual_pricing_fee. LEAST-clamped on partial refunds and snapped to gross on full void / final refund — invariant: service_charge_refunded ≤ service_charge.';;
