-- Backfill: re-key orphaned settlement_batches to their physical terminal by serial.
--
-- Background: the new S/N flow keys settlement_batches on the physical serial and
-- carries payment_terminal_id → the current payment_terminals row. But historical
-- batches were created under old/duplicate terminal rows. When those duplicates were
-- removed (dedup_payment_terminals_by_serial, ON DELETE SET NULL) the batches kept
-- their stamped serial_number but lost payment_terminal_id — so they no longer surface
-- on the device detail page (which resolves by payment_terminal_id) or reconcile against
-- the live terminal, even though the serial still uniquely identifies the device.
--
-- This one-time backfill re-attaches every orphaned batch (payment_terminal_id IS NULL)
-- that carries a real device serial to the current terminal owning that
-- (merchant_id, location_id, serial_number). It is:
--   * idempotent — only touches rows still NULL;
--   * ambiguity-safe — skips any serial that resolves to more than one terminal;
--   * conservative — ignores synthetic 'BATCH:'/'UUID:' placeholder serials, which
--     never mapped to a physical device.
-- The legacy terminal_id (varchar) column is left untouched for historical fidelity;
-- payment_terminal_id is the canonical link going forward.

WITH resolved AS (
    SELECT
        sb.id AS batch_id,
        (
            SELECT pt.id
            FROM public.payment_terminals pt
            WHERE pt.merchant_id = sb.merchant_id
              AND pt.serial_number = sb.serial_number
              AND (pt.location_id = sb.location_id OR sb.location_id IS NULL)
            ORDER BY pt.is_active DESC, pt.updated_at DESC
            LIMIT 1
        ) AS terminal_id,
        (
            SELECT count(*)
            FROM public.payment_terminals pt
            WHERE pt.merchant_id = sb.merchant_id
              AND pt.serial_number = sb.serial_number
              AND (pt.location_id = sb.location_id OR sb.location_id IS NULL)
        ) AS match_count
    FROM public.settlement_batches sb
    WHERE sb.payment_terminal_id IS NULL
      AND sb.serial_number IS NOT NULL
      AND sb.serial_number !~ '^(BATCH|UUID):'
)
UPDATE public.settlement_batches sb
SET payment_terminal_id = r.terminal_id
FROM resolved r
WHERE sb.id = r.batch_id
  AND r.terminal_id IS NOT NULL
  AND r.match_count = 1;
