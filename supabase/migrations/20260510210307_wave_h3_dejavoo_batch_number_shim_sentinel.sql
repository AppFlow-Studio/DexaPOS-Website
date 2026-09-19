DO $$
DECLARE
    v_deadline date := DATE '2026-08-10';
    v_exists boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'order_payments'
          AND column_name = 'dejavoo_batch_number'
    ) INTO v_exists;

    IF NOT v_exists THEN
        RAISE NOTICE 'wave_h3: dejavoo_batch_number already dropped — sentinel is a no-op.';
        RETURN;
    END IF;

    IF current_date >= v_deadline THEN
        RAISE EXCEPTION
          'wave_h3 tripwire: order_payments.dejavoo_batch_number is past its removal deadline (%). Drop the column or move the deadline with written justification.',
          v_deadline;
    END IF;

    RAISE NOTICE
      'wave_h3: dejavoo_batch_number shim still present; deadline % (% days remaining).',
      v_deadline, v_deadline - current_date;
END
$$;;
