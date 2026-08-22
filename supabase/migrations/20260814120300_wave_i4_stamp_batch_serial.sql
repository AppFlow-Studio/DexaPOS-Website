-- ============================================================================
-- Wave i4 — guarantee every settlement_batches row carries a serial_number
-- ----------------------------------------------------------------------------
-- After the i3 re-key, serial_number is the host identity. The lazy trigger sets
-- it, but batches are ALSO created/mutated by other paths that don't:
--   * prepare_castles_settlement  — DEXA fallback INSERT (batch_number NULL)
--   * prepare_valor_settlement    — INSERT (batch_number arrives later)
--   * finalize_valor_settlement   — stamps batch_number, moving the row INTO the
--                                   host-key index; a NULL serial there is wrong.
--
-- Rather than surgically rewrite those large, live settlement RPCs (risky), a
-- single BEFORE INSERT/UPDATE trigger resolves serial_number from the batch's
-- payment_terminal_id (with the same UUID:/BATCH: surrogate fallback as i3)
-- whenever it is NULL. Idempotent and a no-op when serial_number is already set
-- (e.g. the lazy trigger already populated it), so it never fights other writers.
--
-- Scope: fires on INSERT, and on UPDATE of the columns that determine the serial
-- or move a row into the host-key index (payment_terminal_id, terminal_id,
-- batch_number). Low-volume table; negligible overhead.
-- ============================================================================

CREATE OR REPLACE FUNCTION public._stamp_settlement_batch_serial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    IF NEW.serial_number IS NULL THEN
        NEW.serial_number := COALESCE(
            (SELECT pt.serial_number FROM public.payment_terminals pt WHERE pt.id = NEW.payment_terminal_id),
            'UUID:' || NEW.payment_terminal_id::text,
            'UUID:' || NULLIF(NEW.terminal_id, ''),
            'BATCH:' || NEW.id::text);
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public._stamp_settlement_batch_serial IS
    'BEFORE INSERT/UPDATE on settlement_batches. Backfills serial_number from '
    'payment_terminal_id (UUID:/BATCH: surrogate fallback) when NULL, so batches '
    'created by prepare_*/finalize_* settlement RPCs stay serial-consistent with '
    'the i3 re-key. No-op when serial_number is already set.';

DROP TRIGGER IF EXISTS trg_stamp_settlement_batch_serial ON public.settlement_batches;
CREATE TRIGGER trg_stamp_settlement_batch_serial
    BEFORE INSERT OR UPDATE OF payment_terminal_id, terminal_id, batch_number
    ON public.settlement_batches
    FOR EACH ROW
    EXECUTE FUNCTION public._stamp_settlement_batch_serial();

-- Backfill any existing NULL-serial rows (there should be none after i3's
-- backfill, but this makes the wave self-contained / re-runnable).
UPDATE public.settlement_batches sb
SET serial_number = COALESCE(
        (SELECT pt.serial_number FROM public.payment_terminals pt WHERE pt.id = sb.payment_terminal_id),
        'UUID:' || sb.payment_terminal_id::text,
        'UUID:' || NULLIF(sb.terminal_id, ''),
        'BATCH:' || sb.id::text)
WHERE sb.serial_number IS NULL;
