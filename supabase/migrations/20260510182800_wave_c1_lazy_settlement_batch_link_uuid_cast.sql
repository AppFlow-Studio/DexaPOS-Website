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
BEGIN
    IF NEW.settlement_batch_id IS NOT NULL THEN
        RETURN NEW;
    END IF;
    IF NEW.acquirer IS NULL OR NEW.batch_number IS NULL THEN
        RETURN NEW;
    END IF;
    IF NEW.terminal_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT id INTO v_existing_id
    FROM public.settlement_batches
    WHERE payment_terminal_id = NEW.terminal_id::uuid
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
            v_lazy_batch_id, NEW.merchant_id, NEW.location_id, NEW.terminal_id::uuid,
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
            WHERE payment_terminal_id = NEW.terminal_id::uuid
              AND acquirer = NEW.acquirer
              AND batch_number = NEW.batch_number
            LIMIT 1;
        END IF;
    END IF;

    NEW.settlement_batch_id := v_existing_id;
    RETURN NEW;
END;
$$;;
