-- ============================================================================
-- Wave i3 — re-key settlement_batches on the PHYSICAL serial_number
-- ----------------------------------------------------------------------------
-- Batch identity was keyed on payment_terminal_id (the mutable terminal-row
-- UUID). The acquirer batches per physical device, so identity should follow the
-- serial. This wave:
--   * adds settlement_batches.serial_number (denormalized — a unique index can't
--     span a JOIN) and backfills it,
--   * swaps the leading column of uq_settlement_batches_host_key from
--     payment_terminal_id -> serial_number,
--   * rewrites _lazy_settlement_batch_link to resolve + key on the serial, with a
--     'UUID:'-prefixed surrogate for the NULL-serial (discovery-window /
--     deleted-terminal) case so those rows stay in a stable, collision-free
--     namespace and can be re-stamped to a real serial later.
--
-- PREREQUISITES: Wave i1 (batch_epoch + merge guard) and i2 (history hygiene).
-- The i2 unlink must have removed any unsettled-in-settled rows first.
-- ============================================================================

-- 3a. Column + backfill. Real serial where known; else a UUID:/BATCH: surrogate.
ALTER TABLE public.settlement_batches
    ADD COLUMN IF NOT EXISTS serial_number text;

COMMENT ON COLUMN public.settlement_batches.serial_number IS
    'Physical device serial (payment_terminals.serial_number) resolved at '
    'link/create time. Leading component of uq_settlement_batches_host_key '
    '(replaces payment_terminal_id). Falls back to ''UUID:''||terminal_uuid when '
    'the terminal has no serial yet, or ''BATCH:''||id for orphaned '
    '(deleted-terminal) rows — both self-identifying and collision-free.';

UPDATE public.settlement_batches sb
SET serial_number = COALESCE(
        (SELECT pt.serial_number FROM public.payment_terminals pt WHERE pt.id = sb.payment_terminal_id),
        'UUID:' || sb.payment_terminal_id::text,
        'UUID:' || NULLIF(sb.terminal_id, ''),
        'BATCH:' || sb.id::text)
WHERE sb.serial_number IS NULL;

-- 3b. Collision pre-flight — the new key MUST be unique before we build the
-- index. Aborts loudly (leaving the column backfilled) so collisions can be
-- resolved by bumping batch_epoch on the newer row.
DO $$
DECLARE v_dups integer;
BEGIN
    SELECT count(*) INTO v_dups FROM (
        SELECT 1 FROM public.settlement_batches
        WHERE batch_number IS NOT NULL
        GROUP BY serial_number, merchant_id, acquirer, batch_number, batch_epoch
        HAVING count(*) > 1
    ) d;
    IF v_dups > 0 THEN
        RAISE EXCEPTION 'wave_i3: % duplicate tuple(s) on the new serial key. Resolve (bump batch_epoch on the newer row) before re-running.', v_dups;
    END IF;
END
$$;

-- 3c. Swap the unique index leading column to serial_number.
DROP INDEX IF EXISTS public.uq_settlement_batches_host_key;
CREATE UNIQUE INDEX uq_settlement_batches_host_key
    ON public.settlement_batches
       (serial_number, merchant_id, acquirer, batch_number, batch_epoch)
    WHERE batch_number IS NOT NULL;

-- 3d. Serial-aware trigger.
CREATE OR REPLACE FUNCTION public._lazy_settlement_batch_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
-- CONTRACT: ON CONFLICT below depends on uq_settlement_batches_host_key
--   (serial_number, merchant_id, acquirer, batch_number, batch_epoch)
--   WHERE batch_number IS NOT NULL
DECLARE
    v_existing_id     uuid;
    v_existing_status text;
    v_business_date   date;
    v_lazy_batch_id   text;
    v_terminal_uuid   uuid;
    v_serial          text;
    v_location_id     uuid;
    v_epoch           integer;
BEGIN
    IF NEW.settlement_batch_id IS NOT NULL THEN RETURN NEW; END IF;
    IF NEW.acquirer IS NULL OR NEW.batch_number IS NULL THEN RETURN NEW; END IF;
    IF NEW.terminal_id IS NULL THEN RETURN NEW; END IF;
    IF NEW.terminal_type::text NOT IN ('castles','dejavoo') THEN RETURN NEW; END IF;
    IF NEW.terminal_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN RETURN NEW; END IF;

    v_terminal_uuid := NEW.terminal_id::uuid;

    -- Resolve the physical serial; NULL-serial (discovery window) -> UUID surrogate
    -- so the row stays in a stable, upgradeable namespace.
    SELECT serial_number, location_id INTO v_serial, v_location_id
    FROM public.payment_terminals WHERE id = v_terminal_uuid;
    v_serial := COALESCE(v_serial, 'UUID:' || v_terminal_uuid::text);

    -- Latest batch for this host (serial) key; highest epoch wins.
    SELECT id, status, batch_epoch
      INTO v_existing_id, v_existing_status, v_epoch
    FROM public.settlement_batches
    WHERE serial_number = v_serial
      AND merchant_id   = NEW.merchant_id
      AND acquirer      = NEW.acquirer
      AND batch_number  = NEW.batch_number
    ORDER BY batch_epoch DESC
    LIMIT 1;

    IF v_existing_id IS NOT NULL
       AND v_existing_status IN ('open','pending','settling','retry') THEN
        IF v_existing_status IN ('pending','settling') THEN RETURN NEW; END IF;
        NEW.settlement_batch_id := v_existing_id;
        RETURN NEW;
    END IF;

    -- Terminal-state occupant OR none → open a fresh epoch (no merge into a
    -- settled batch).
    v_epoch := COALESCE(v_epoch, 0) + 1;
    v_business_date := (COALESCE(NEW.captured_at, now()) AT TIME ZONE 'America/New_York')::date;
    v_lazy_batch_id := 'LAZY-' || NEW.acquirer || '-' || v_serial
                    || '-' || NEW.batch_number || '-E' || v_epoch;

    INSERT INTO public.settlement_batches (
        batch_id, merchant_id, location_id, payment_terminal_id, serial_number,
        acquirer, batch_number, batch_epoch,
        business_date, business_date_start, business_date_end,
        opened_at, status, retry_count
    ) VALUES (
        v_lazy_batch_id, NEW.merchant_id, COALESCE(NEW.location_id, v_location_id),
        v_terminal_uuid, v_serial,
        NEW.acquirer, NEW.batch_number, v_epoch,
        v_business_date, v_business_date, v_business_date,
        COALESCE(NEW.captured_at, now()), 'open', 0
    )
    ON CONFLICT (serial_number, merchant_id, acquirer, batch_number, batch_epoch)
        WHERE batch_number IS NOT NULL
    DO NOTHING
    RETURNING id INTO v_existing_id;

    IF v_existing_id IS NULL THEN
        SELECT id INTO v_existing_id
        FROM public.settlement_batches
        WHERE serial_number = v_serial
          AND merchant_id   = NEW.merchant_id
          AND acquirer      = NEW.acquirer
          AND batch_number  = NEW.batch_number
          AND batch_epoch   = v_epoch
        LIMIT 1;
    END IF;

    NEW.settlement_batch_id := v_existing_id;
    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public._lazy_settlement_batch_link IS
    'BEFORE INSERT on order_payments. Find-or-creates a settlement_batches row '
    'keyed by (serial_number, merchant_id, acquirer, batch_number, batch_epoch). '
    'Serial resolved from payment_terminals with a UUID: surrogate fallback. '
    'Reuses only ACTIVE (open/retry) occupants; a terminal-state occupant opens a '
    'fresh epoch. pending/settling untouched. castles/dejavoo only.';

-- 3e. Contract check.
DO $$
DECLARE v_def text;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='settlement_batches' AND column_name='serial_number') THEN
        RAISE EXCEPTION 'wave_i3: settlement_batches.serial_number missing.';
    END IF;

    SELECT indexdef INTO v_def FROM pg_indexes
    WHERE schemaname='public' AND tablename='settlement_batches' AND indexname='uq_settlement_batches_host_key';

    IF v_def IS NULL THEN RAISE EXCEPTION 'wave_i3: uq_settlement_batches_host_key missing.'; END IF;
    IF v_def !~* 'UNIQUE INDEX' THEN RAISE EXCEPTION 'wave_i3: host key not UNIQUE. Def: %', v_def; END IF;
    IF v_def !~* '\(serial_number, merchant_id, acquirer, batch_number, batch_epoch\)' THEN
        RAISE EXCEPTION 'wave_i3: host-key column drift. Def: %', v_def; END IF;
    IF v_def !~* 'WHERE \(batch_number IS NOT NULL\)' THEN
        RAISE EXCEPTION 'wave_i3: host-key predicate drift. Def: %', v_def; END IF;
END
$$;
