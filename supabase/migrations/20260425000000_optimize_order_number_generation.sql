-- =============================================================================
-- Migration: Replace advisory-lock order number generation with per-day sequences
--
-- Root cause of TC-XCC-LOAD-001 failure (P95 = 8927ms vs 500ms target):
--   pg_advisory_xact_lock() holds a transaction-level lock for all 13 steps of
--   process_online_order. All concurrent orders at the same merchant queue
--   one-at-a-time. With 200 concurrent users, order #200 waits ~20 seconds.
--
-- Fix:
--   Replace lock + MAX(LIKE scan) with nextval() on a per-merchant-per-day
--   Postgres sequence. nextval() releases its internal lock in microseconds —
--   it is NOT held for the calling transaction. Multiple transactions can
--   call nextval() simultaneously with no contention.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tracking table so we know which sequences exist for cleanup
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_number_day_sequences (
  sequence_name TEXT        PRIMARY KEY,
  merchant_id   UUID        NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  date_str      TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_num_seqs_date
  ON public.order_number_day_sequences (date_str);
-- -----------------------------------------------------------------------------
-- 2. Indexes for the idempotency checks in process_online_order STEP 0
--    These selects fire on every order — they should hit indexes, not seq scans.
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_online_orders_provider_order_id
  ON public.online_orders (provider, provider_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_external_id
  ON public.orders (external_id)
  WHERE external_id IS NOT NULL;
-- -----------------------------------------------------------------------------
-- 3. Replace generate_order_number
--    Key change: nextval() instead of advisory lock + MAX() scan.
--    nextval() lock is held for microseconds, NOT for the calling transaction.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_order_number(
  p_location_id UUID,
  p_station_id  UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_merchant_id     UUID;
  v_date_str        TEXT;
  v_sequence_number BIGINT;
  v_order_number    TEXT;
  v_station_number  INT;
  v_station_prefix  TEXT;
  v_seq_name        TEXT;
BEGIN
  SELECT merchant_id INTO v_merchant_id
  FROM public.locations
  WHERE id = p_location_id;

  IF v_merchant_id IS NULL THEN
    RAISE EXCEPTION 'Location not found: %', p_location_id;
  END IF;

  v_date_str := TO_CHAR(CURRENT_DATE, 'YYYYMMDD');

  -- Station lookup (unchanged)
  IF p_station_id IS NOT NULL THEN
    SELECT station_number INTO v_station_number
    FROM public.stations
    WHERE id = p_station_id;
  END IF;

  -- Build a safe sequence name: ord_seq_<merchant_uuid_no_dashes>_<YYYYMMDD>[_s<N>]
  IF v_station_number IS NOT NULL THEN
    v_station_prefix := 'S' || v_station_number::TEXT;
    v_seq_name := 'ord_seq_'
      || replace(v_merchant_id::text, '-', '')
      || '_' || v_date_str
      || '_s' || v_station_number::text;
  ELSE
    v_seq_name := 'ord_seq_'
      || replace(v_merchant_id::text, '-', '')
      || '_' || v_date_str;
  END IF;

  -- Guard sequence creation with a session-level advisory lock so that under
  -- high concurrency only ONE transaction runs CREATE SEQUENCE while the rest
  -- wait briefly then proceed directly to nextval.
  --
  -- Without this, all 200 concurrent callers race on pg_class (the system
  -- catalog) causing "duplicate key on pg_class_relname_nsp_index" errors.
  --
  -- The advisory lock is released IMMEDIATELY after creation — it is NOT
  -- held for the rest of this transaction. After the first order of the day,
  -- every subsequent call skips the IF block entirely and goes straight to
  -- nextval with zero lock contention.
  DECLARE
    v_create_lock BIGINT;
  BEGIN
    v_create_lock := hashtext('ordseq:' || v_seq_name)::bigint;
    PERFORM pg_advisory_lock(v_create_lock);

    IF NOT EXISTS (
      SELECT 1 FROM pg_sequences
      WHERE schemaname = 'public' AND sequencename = v_seq_name
    ) THEN
      -- Bootstrap the start value from existing orders so we never collide with
      -- order numbers already created today (e.g. by a previous run or the old
      -- MAX() path before this migration).
      DECLARE
        v_start_val BIGINT;
      BEGIN
        IF v_station_prefix IS NOT NULL THEN
          SELECT COALESCE(MAX(
            NULLIF(SPLIT_PART(order_number, '-', 4), '')::BIGINT
          ), 0) + 1
          INTO v_start_val
          FROM public.orders
          WHERE merchant_id = v_merchant_id
            AND order_number LIKE 'ORD-' || v_date_str || '-' || v_station_prefix || '-%';
        ELSE
          SELECT COALESCE(MAX(
            NULLIF(SPLIT_PART(order_number, '-', 3), '')::BIGINT
          ), 0) + 1
          INTO v_start_val
          FROM public.orders
          WHERE merchant_id = v_merchant_id
            AND order_number LIKE 'ORD-' || v_date_str || '-%'
            AND order_number NOT LIKE 'ORD-' || v_date_str || '-S%';
        END IF;

        EXECUTE format(
          'CREATE SEQUENCE IF NOT EXISTS public.%I START WITH %s INCREMENT BY 1 MINVALUE 1 NO CYCLE',
          v_seq_name, GREATEST(v_start_val, 1)
        );

        -- Track it so the cleanup function knows what to drop
        INSERT INTO public.order_number_day_sequences (sequence_name, merchant_id, date_str)
        VALUES (v_seq_name, v_merchant_id, v_date_str)
        ON CONFLICT (sequence_name) DO NOTHING;
      END;
    END IF;

    -- Release the creation lock immediately.
    -- From this point on, all 200 concurrent callers proceed to nextval in parallel.
    PERFORM pg_advisory_unlock(v_create_lock);

  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_advisory_unlock(v_create_lock);
    RAISE;
  END;

  -- nextval() is the core fix:
  --   - Atomically increments the sequence
  --   - Releases its internal lock in MICROSECONDS (not held for this transaction)
  --   - 200 concurrent calls return 200 unique values with zero queuing
  EXECUTE format('SELECT nextval(''public.%I'')', v_seq_name) INTO v_sequence_number;

  -- Format order number (same format as before)
  IF v_station_prefix IS NOT NULL THEN
    v_order_number := 'ORD-' || v_date_str || '-' || v_station_prefix || '-'
                      || LPAD(v_sequence_number::TEXT, 4, '0');
  ELSE
    v_order_number := 'ORD-' || v_date_str || '-'
                      || LPAD(v_sequence_number::TEXT, 4, '0');
  END IF;

  RETURN v_order_number;
END;
$$;
-- -----------------------------------------------------------------------------
-- 4. Replace generate_order_number_internal (used in some POS tablet paths)
--    Same change: nextval() instead of advisory lock + MAX() scan.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_order_number_internal(
  p_location_id UUID,
  p_merchant_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_date_str        TEXT;
  v_sequence_number BIGINT;
  v_order_number    TEXT;
  v_seq_name        TEXT;
BEGIN
  v_date_str := TO_CHAR(CURRENT_DATE, 'YYYYMMDD');

  v_seq_name := 'ord_seq_'
    || replace(p_merchant_id::text, '-', '')
    || '_' || v_date_str;

  DECLARE
    v_create_lock BIGINT;
    v_start_val   BIGINT;
  BEGIN
    v_create_lock := hashtext('ordseq:' || v_seq_name)::bigint;
    PERFORM pg_advisory_lock(v_create_lock);

    IF NOT EXISTS (
      SELECT 1 FROM pg_sequences
      WHERE schemaname = 'public' AND sequencename = v_seq_name
    ) THEN
      SELECT COALESCE(MAX(
        NULLIF(SPLIT_PART(order_number, '-', 3), '')::BIGINT
      ), 0) + 1
      INTO v_start_val
      FROM public.orders
      WHERE merchant_id = p_merchant_id
        AND order_number LIKE 'ORD-' || v_date_str || '-%';

      EXECUTE format(
        'CREATE SEQUENCE IF NOT EXISTS public.%I START WITH %s INCREMENT BY 1 MINVALUE 1 NO CYCLE',
        v_seq_name, GREATEST(v_start_val, 1)
      );

      INSERT INTO public.order_number_day_sequences (sequence_name, merchant_id, date_str)
      VALUES (v_seq_name, p_merchant_id, v_date_str)
      ON CONFLICT (sequence_name) DO NOTHING;
    END IF;

    PERFORM pg_advisory_unlock(v_create_lock);
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_advisory_unlock(v_create_lock);
    RAISE;
  END;

  EXECUTE format('SELECT nextval(''public.%I'')', v_seq_name) INTO v_sequence_number;

  v_order_number := 'ORD-' || v_date_str || '-' || LPAD(v_sequence_number::TEXT, 4, '0');

  RETURN v_order_number;
END;
$$;
-- -----------------------------------------------------------------------------
-- 5. Cleanup function — drop sequences older than N days
--    Call this once daily via a Supabase cron or pg_cron job.
--    Example: SELECT public.cleanup_old_order_sequences(2);
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_old_order_sequences(p_keep_days INT DEFAULT 2)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_seq     RECORD;
  v_dropped INT := 0;
  v_cutoff  TEXT;
BEGIN
  v_cutoff := TO_CHAR(CURRENT_DATE - p_keep_days, 'YYYYMMDD');

  FOR v_seq IN
    SELECT sequence_name
    FROM public.order_number_day_sequences
    WHERE date_str < v_cutoff
  LOOP
    EXECUTE format('DROP SEQUENCE IF EXISTS public.%I', v_seq.sequence_name);
    DELETE FROM public.order_number_day_sequences
    WHERE sequence_name = v_seq.sequence_name;
    v_dropped := v_dropped + 1;
  END LOOP;

  RETURN v_dropped;
END;
$$;
COMMENT ON FUNCTION public.generate_order_number IS
  'v4: replaced pg_advisory_xact_lock + MAX(LIKE) with per-day nextval() sequences. '
  'nextval lock is held for microseconds only — not for the calling transaction. '
  'Enables true concurrent order creation with zero lock contention.';
