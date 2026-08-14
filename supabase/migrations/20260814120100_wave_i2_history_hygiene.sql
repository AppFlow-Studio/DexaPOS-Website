-- ============================================================================
-- Wave i2 — settlement history hygiene (run BEFORE the serial re-key in i3)
-- ----------------------------------------------------------------------------
-- Two clean-ups so the serial re-key backfill starts from a consistent state:
--
-- 2a. Auto-close orphan `open` host batches that have no eligible captured
--     unsettled payments (backfill orphans / drained shells). Mirrors what
--     prepare_*_settlement does when it finds nothing to settle.
--
-- 2b. Unlink unsettled payments that were wrongly stamped into a genuinely
--     `settled` batch (the merge-into-settled defect that Wave i1 stops for new
--     inserts). We intentionally scope to status = 'settled' ONLY — a SETTLED
--     batch must never contain is_settled=false rows. `needs_review`, `closed`,
--     `failed`, etc. are legitimate pending/terminal states owned by their own
--     processes and are left untouched. Unlinked rows become honest
--     "captured, not settled, no batch" and can re-acquire a fresh-epoch batch
--     (i1 trigger on the next insert) or be reconciled against the processor.
--
-- NOTE: this does NOT assert a funding outcome. It only removes the impossible
-- "unsettled row inside a settled batch" state. Whether those payments actually
-- funded is a separate processor/Luqra reconciliation.
-- ============================================================================

-- 2a. Auto-close drained/orphan open host batches.
UPDATE public.settlement_batches sb
SET status = 'closed',
    closed_at = NOW(),
    failure_reason = COALESCE(
        sb.failure_reason,
        'Wave i2: auto-closed pre-rekey — no eligible captured unsettled payments.'),
    updated_at = NOW()
WHERE sb.status = 'open'
  AND sb.batch_number IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM public.order_payments op
      WHERE op.settlement_batch_id = sb.id
        AND op.status IN ('captured','partially_refunded')
        AND op.is_settled = false
        AND NOT COALESCE(op.is_voided, false)
  );

-- 2b. Unlink unsettled payments sitting inside a SETTLED batch (the defect).
--     Preview (run first, read-only):
--   SELECT op.id, op.amount, op.settlement_batch_id, sb.batch_id
--   FROM order_payments op JOIN settlement_batches sb ON sb.id = op.settlement_batch_id
--   WHERE op.is_settled = false AND sb.status = 'settled';
-- NOTE: order_payments has no updated_at column (unlike settlement_batches),
-- so we only null out the batch link here.
UPDATE public.order_payments op
SET settlement_batch_id = NULL
FROM public.settlement_batches sb
WHERE sb.id = op.settlement_batch_id
  AND op.is_settled = false
  AND sb.status = 'settled';

-- Acceptance for this wave: no is_settled=false payment remains inside a
-- SETTLED batch. MUST return 0.
DO $$
DECLARE v_bad integer;
BEGIN
    SELECT count(*) INTO v_bad
    FROM public.order_payments op
    JOIN public.settlement_batches sb ON sb.id = op.settlement_batch_id
    WHERE op.is_settled = false AND sb.status = 'settled';

    IF v_bad > 0 THEN
        RAISE EXCEPTION 'wave_i2: % unsettled payment(s) still inside a settled batch after cleanup.', v_bad;
    END IF;
END
$$;
