-- ============================================================================
-- Wave i1 — settlement_batches.batch_epoch + terminal-state merge guard
-- ----------------------------------------------------------------------------
-- Fixes the "merge into a settled batch" defect independently of the
-- serial re-key (which lands in a later wave). Today _lazy_settlement_batch_link
-- only skips reuse when the existing host-key batch is 'pending'/'settling', so a
-- host that RECYCLES a batch_number after settling causes fresh sales to be
-- stamped into the already-`settled` batch → is_settled=false rows inside a
-- closed batch (observed: two $0.01 test payments in a settled batch 001).
--
-- Fix: add batch_epoch (a monotonic "generation" of a recycled host batch_number)
-- to the host uniqueness key. When the latest batch for a host key is in a
-- TERMINAL state, open a NEW epoch instead of merging. Still keyed on
-- payment_terminal_id in this wave; a later wave swaps the leading column to the
-- physical serial_number.
--
-- Business-date is deliberately NOT the discriminator: same-day / multi-settle-
-- per-day reopens share a business_date and would still merge.
-- ============================================================================

ALTER TABLE public.settlement_batches
    ADD COLUMN IF NOT EXISTS batch_epoch integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.settlement_batches.batch_epoch IS
    'Monotonic generation of a recycled host batch_number for one identity tuple. '
    'Incremented when a new batch opens under a host key whose prior batch is '
    'already in a terminal state (settled/closed/failed/...). Part of the host '
    'uniqueness key uq_settlement_batches_host_key.';

-- Replace the host-key unique index to include batch_epoch. Leading column is
-- still payment_terminal_id in this wave.
DROP INDEX IF EXISTS public.uq_settlement_batches_host_key;
CREATE UNIQUE INDEX uq_settlement_batches_host_key
    ON public.settlement_batches
       (payment_terminal_id, merchant_id, acquirer, batch_number, batch_epoch)
    WHERE batch_number IS NOT NULL;

CREATE OR REPLACE FUNCTION public._lazy_settlement_batch_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
-- CONTRACT: ON CONFLICT below depends on the unique partial index
--   uq_settlement_batches_host_key
--   ON settlement_batches (payment_terminal_id, merchant_id, acquirer, batch_number, batch_epoch)
--   WHERE batch_number IS NOT NULL
-- The wave_i1 contract DO-block below enforces this at migration time.
DECLARE
    v_existing_id     uuid;
    v_existing_status text;
    v_business_date   date;
    v_lazy_batch_id   text;
    v_terminal_uuid   uuid;
    v_epoch           integer;
BEGIN
    IF NEW.settlement_batch_id IS NOT NULL THEN RETURN NEW; END IF;
    IF NEW.acquirer IS NULL OR NEW.batch_number IS NULL THEN RETURN NEW; END IF;
    IF NEW.terminal_id IS NULL THEN RETURN NEW; END IF;
    IF NEW.terminal_type::text NOT IN ('castles','dejavoo') THEN RETURN NEW; END IF;
    IF NEW.terminal_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN RETURN NEW; END IF;

    v_terminal_uuid := NEW.terminal_id::uuid;

    -- Latest batch for this host key; highest epoch wins.
    SELECT id, status, batch_epoch
      INTO v_existing_id, v_existing_status, v_epoch
    FROM public.settlement_batches
    WHERE payment_terminal_id = v_terminal_uuid
      AND merchant_id = NEW.merchant_id
      AND acquirer   = NEW.acquirer
      AND batch_number = NEW.batch_number
    ORDER BY batch_epoch DESC
    LIMIT 1;

    -- ACTIVE occupant → reuse (normal accumulation). pending/settling are left
    -- untouched (a batch being settled must not absorb new rows mid-flight).
    IF v_existing_id IS NOT NULL
       AND v_existing_status IN ('open','pending','settling','retry') THEN
        IF v_existing_status IN ('pending','settling') THEN
            RETURN NEW;
        END IF;
        NEW.settlement_batch_id := v_existing_id;
        RETURN NEW;
    END IF;

    -- TERMINAL occupant (settled/closed/failed/...) OR no occupant → open a FRESH
    -- batch at the next epoch. This is the defect fix: the host recycled the
    -- batch_number after settling, so do NOT merge into the closed batch.
    v_epoch := COALESCE(v_epoch, 0) + 1;
    v_business_date := (COALESCE(NEW.captured_at, now()) AT TIME ZONE 'America/New_York')::date;
    v_lazy_batch_id := 'LAZY-' || NEW.acquirer || '-' || NEW.terminal_id
                    || '-' || NEW.batch_number || '-E' || v_epoch;

    INSERT INTO public.settlement_batches (
        batch_id, merchant_id, location_id, payment_terminal_id,
        acquirer, batch_number, batch_epoch,
        business_date, business_date_start, business_date_end,
        opened_at, status, retry_count
    ) VALUES (
        v_lazy_batch_id, NEW.merchant_id, NEW.location_id, v_terminal_uuid,
        NEW.acquirer, NEW.batch_number, v_epoch,
        v_business_date, v_business_date, v_business_date,
        COALESCE(NEW.captured_at, now()), 'open', 0
    )
    ON CONFLICT (payment_terminal_id, merchant_id, acquirer, batch_number, batch_epoch)
        WHERE batch_number IS NOT NULL
    DO NOTHING
    RETURNING id INTO v_existing_id;

    IF v_existing_id IS NULL THEN
        -- Lost the ON CONFLICT race: another session inserted this epoch first.
        SELECT id INTO v_existing_id
        FROM public.settlement_batches
        WHERE payment_terminal_id = v_terminal_uuid
          AND merchant_id = NEW.merchant_id
          AND acquirer   = NEW.acquirer
          AND batch_number = NEW.batch_number
          AND batch_epoch  = v_epoch
        LIMIT 1;
    END IF;

    NEW.settlement_batch_id := v_existing_id;
    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public._lazy_settlement_batch_link IS
    'BEFORE INSERT on order_payments. Find-or-creates a settlement_batches row '
    'keyed by (payment_terminal_id, merchant_id, acquirer, batch_number, batch_epoch). '
    'Reuses only ACTIVE (open/retry) occupants; a terminal-state occupant opens a '
    'fresh epoch (no merge into a settled batch). pending/settling untouched. '
    'castles/dejavoo only; UUID-regex guarded.';

-- Contract check: fail the migration if the index drifted from what the trigger's
-- ON CONFLICT depends on.
DO $$
DECLARE v_def text;
BEGIN
    SELECT indexdef INTO v_def
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'settlement_batches'
      AND indexname = 'uq_settlement_batches_host_key';

    IF v_def IS NULL THEN
        RAISE EXCEPTION 'wave_i1: missing unique index uq_settlement_batches_host_key.';
    END IF;
    IF v_def !~* 'UNIQUE INDEX' THEN
        RAISE EXCEPTION 'wave_i1: uq_settlement_batches_host_key is not UNIQUE. Def: %', v_def;
    END IF;
    IF v_def !~* '\(payment_terminal_id, merchant_id, acquirer, batch_number, batch_epoch\)' THEN
        RAISE EXCEPTION 'wave_i1: host-key column drift. Def: %', v_def;
    END IF;
    IF v_def !~* 'WHERE \(batch_number IS NOT NULL\)' THEN
        RAISE EXCEPTION 'wave_i1: host-key predicate drift. Def: %', v_def;
    END IF;
END
$$;
