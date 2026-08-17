-- Backfill: create serial-keyed settlement_batches for captured Valor payments
-- that have a host batch_number but were never placed in a batch.
--
-- Background: _lazy_settlement_batch_link (which lazily opens/links a batch when a
-- card payment is inserted) is scoped to terminal_type IN ('castles','dejavoo') —
-- Valor settlements normally arrive via the Valor webhook. When the webhook never
-- fires (or auto-settle is off), captured Valor payments accumulate with a
-- batch_number but no settlement_batch_id and no settlement_batches row, so the
-- money is invisible to the batch/reconciliation views.
--
-- This creates one batch per (terminal, batch_number) that has no existing row,
-- keyed on the physical serial (the new S/N flow), marks it needs_review (surfaced
-- for reconciliation, NOT auto-settled), seeds its totals from the linked payments,
-- and points those payments at it. Idempotent: guarded on settlement_batch_id IS NULL
-- and NOT EXISTS, so re-runs are no-ops. Only touches live captured payments.
--
-- NOTE: Castles unbatched payments are intentionally NOT handled here — on the data
-- seen so far their host batches already exist in 'settled' state with mismatched
-- totals, which is a reconciliation decision, not a mechanical backfill.

WITH grp AS (
    SELECT (op.terminal_id)::uuid AS terminal_uuid, pt.serial_number, pt.merchant_id, pt.location_id,
           op.batch_number,
           count(*) AS cnt,
           round(sum(op.total_amount)::numeric, 2) AS gross,
           round(sum(op.tip_amount)::numeric, 2)  AS tips,
           min(op.captured_at) AS first_cap
    FROM public.order_payments op
    JOIN public.payment_terminals pt ON pt.id::text = op.terminal_id
    WHERE op.settlement_batch_id IS NULL
      AND op.batch_number IS NOT NULL
      AND op.captured_at IS NOT NULL
      AND op.terminal_type = 'valor'
      AND op.status::text NOT IN ('voided','failed','refunded','declined','cancelled','reversed','error')
      AND NOT EXISTS (
          SELECT 1 FROM public.settlement_batches sb2
          WHERE sb2.payment_terminal_id = pt.id AND sb2.batch_number = op.batch_number
      )
    GROUP BY op.terminal_id, pt.serial_number, pt.merchant_id, pt.location_id, op.batch_number
),
ins AS (
    INSERT INTO public.settlement_batches (
        batch_id, merchant_id, location_id, payment_terminal_id, serial_number,
        acquirer, batch_number, batch_epoch, business_date, business_date_start, business_date_end,
        opened_at, status, transaction_count, sales_count, gross_amount, tip_amount, net_deposit,
        origin, failure_reason, retry_count
    )
    SELECT
        'BACKFILL-VALOR-' || grp.serial_number || '-' || grp.batch_number || '-E1',
        grp.merchant_id, grp.location_id, grp.terminal_uuid, grp.serial_number,
        'VALOR', grp.batch_number, 1,
        (grp.first_cap AT TIME ZONE 'America/New_York')::date,
        (grp.first_cap AT TIME ZONE 'America/New_York')::date,
        (grp.first_cap AT TIME ZONE 'America/New_York')::date,
        grp.first_cap, 'needs_review', grp.cnt, grp.cnt, grp.gross, grp.tips, grp.gross,
        NULL, 'Backfilled: captured Valor payments had no settlement batch (lazy-link excludes Valor).', 0
    FROM grp
    RETURNING id, payment_terminal_id, batch_number
)
UPDATE public.order_payments op
SET settlement_batch_id = ins.id
FROM ins
WHERE op.terminal_id = ins.payment_terminal_id::text
  AND op.batch_number = ins.batch_number
  AND op.settlement_batch_id IS NULL
  AND op.terminal_type = 'valor'
  AND op.status::text NOT IN ('voided','failed','refunded','declined','cancelled','reversed','error');
