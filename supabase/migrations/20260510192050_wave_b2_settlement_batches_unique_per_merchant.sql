-- Tighten the host-key uniqueness to include merchant_id. Two merchants
-- using the same physical terminal (rare but possible in shared-hardware
-- setups, plus historically in mixed staging data) must each have their
-- own settlement_batches row per host batch_number.
DROP INDEX IF EXISTS public.uq_settlement_batches_host_key;
CREATE UNIQUE INDEX uq_settlement_batches_host_key
    ON public.settlement_batches (payment_terminal_id, merchant_id, acquirer, batch_number)
    WHERE batch_number IS NOT NULL;

-- Update the lazy-link trigger lookup + ON CONFLICT target to match.
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
    IF NEW.terminal_type::text NOT IN ('castles','dejavoo') THEN RETURN NEW; END IF;
    IF NEW.terminal_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN NEW; END IF;

    v_terminal_uuid := NEW.terminal_id::uuid;

    SELECT id INTO v_existing_id
    FROM public.settlement_batches
    WHERE payment_terminal_id = v_terminal_uuid
      AND merchant_id = NEW.merchant_id
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
        ON CONFLICT (payment_terminal_id, merchant_id, acquirer, batch_number)
            WHERE batch_number IS NOT NULL
        DO NOTHING
        RETURNING id INTO v_existing_id;

        IF v_existing_id IS NULL THEN
            SELECT id INTO v_existing_id
            FROM public.settlement_batches
            WHERE payment_terminal_id = v_terminal_uuid
              AND merchant_id = NEW.merchant_id
              AND acquirer = NEW.acquirer
              AND batch_number = NEW.batch_number
            LIMIT 1;
        END IF;
    END IF;

    NEW.settlement_batch_id := v_existing_id;
    RETURN NEW;
END;
$$;

-- One-off: fix the cross-merchant orphan. Its 30 linked payments all
-- belong to merchant 2add44cb; the row was attributed to a9aca1d8 only
-- because Wave C.2's UPDATE step lacked a merchant filter. Reattribute
-- and reopen so prepare can pick it up cleanly.
UPDATE public.settlement_batches
SET merchant_id = '2add44cb-f498-4653-aca3-a8f0ca258e70',
    status = 'open',
    failure_reason = NULL,
    castles_pos_txn_id = NULL,
    updated_at = NOW()
WHERE id = 'a59f40fb-2960-4939-b019-c80d0fcf93ad'
  AND merchant_id = 'a9aca1d8-730b-4f97-98f7-2230639f64b1';
