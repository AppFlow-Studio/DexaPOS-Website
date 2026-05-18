CREATE OR REPLACE FUNCTION public._lazy_settlement_batch_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_existing_id uuid;
    v_business_date date;
    v_lazy_batch_id text;
    v_terminal_uuid uuid;
BEGIN
    IF NEW.settlement_batch_id IS NOT NULL THEN RETURN NEW; END IF;
    IF NEW.acquirer IS NULL OR NEW.batch_number IS NULL THEN RETURN NEW; END IF;
    IF NEW.terminal_id IS NULL THEN RETURN NEW; END IF;

    -- Only Castles/Dejavoo terminal payments get a settlement_batches row.
    -- Online (NMI/card_online), manual entry, external rails handle their
    -- own settlement off-platform and must not appear in our batches.
    IF NEW.terminal_type::text NOT IN ('castles','dejavoo') THEN
        RETURN NEW;
    END IF;

    IF NEW.terminal_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RETURN NEW;
    END IF;

    v_terminal_uuid := NEW.terminal_id::uuid;

    SELECT id INTO v_existing_id
    FROM public.settlement_batches
    WHERE payment_terminal_id = v_terminal_uuid
      AND acquirer = NEW.acquirer
      AND batch_number = NEW.batch_number
    LIMIT 1;

    IF v_existing_id IS NULL THEN
        v_business_date := (COALESCE(NEW.captured_at, now()) AT TIME ZONE 'America/New_York')::date;
        v_lazy_batch_id := 'LAZY-' || NEW.acquirer || '-' || NEW.terminal_id || '-' || NEW.batch_number;

        INSERT INTO public.settlement_batches (
            batch_id, merchant_id, location_id, payment_terminal_id,
            acquirer, batch_number,
            business_date, business_date_start, business_date_end,
            opened_at, status, retry_count
        ) VALUES (
            v_lazy_batch_id, NEW.merchant_id, NEW.location_id, v_terminal_uuid,
            NEW.acquirer, NEW.batch_number,
            v_business_date, v_business_date, v_business_date,
            COALESCE(NEW.captured_at, now()), 'open', 0
        )
        ON CONFLICT (payment_terminal_id, acquirer, batch_number)
            WHERE batch_number IS NOT NULL
        DO NOTHING
        RETURNING id INTO v_existing_id;

        IF v_existing_id IS NULL THEN
            SELECT id INTO v_existing_id
            FROM public.settlement_batches
            WHERE payment_terminal_id = v_terminal_uuid
              AND acquirer = NEW.acquirer
              AND batch_number = NEW.batch_number
            LIMIT 1;
        END IF;
    END IF;

    NEW.settlement_batch_id := v_existing_id;
    RETURN NEW;
END;
$$;

-- One-shot cleanup: close the 5 staging stale LAZY rows from Wave C.2
-- backfill that have no eligible payments. Leave audit reason.
UPDATE public.settlement_batches
SET status='closed',
    closed_at=NOW(),
    failure_reason='Auto-closed: backfill orphan with no eligible captured payments.',
    updated_at=NOW()
WHERE status='open'
  AND batch_id LIKE 'LAZY-%'
  AND NOT EXISTS (
      SELECT 1 FROM public.order_payments op
      WHERE op.settlement_batch_id = settlement_batches.id
        AND op.status = 'captured'
        AND op.is_settled = false
  );;
