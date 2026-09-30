-- =============================================================================
-- Order numbers: per-location counters + location-wide numbering scope
-- =============================================================================
-- Spec: docs/features/order-number-scope/README.md
--
-- Replaces the never-shipped 20260925120000_order_number_scope (kept as
-- reference SQL in docs/features/order-number-scope/reference-sql/). That file
-- predates 20260927121500_order_number_xact_lock and the create_order_v4
-- index-name fix (Dexa-POS bdf1ee9b, 20260928120000_create_order_v4_order_
-- number_index_name.sql), and applying it would undo both. This file starts
-- from the bodies staging runs today and ports only the scope logic. It also
-- supersedes bdf1ee9b's file: do not apply that file after this one, because
-- it would drop the scope logic.
--
-- WHAT CHANGES
--   1. Uniqueness moves from (merchant_id, order_number) to
--      (location_id, order_number). Counters are per location, so two
--      locations of one merchant may both hold ORD-<date>-0001.
--      orders_order_number_merchant_key and idx_unique_order_number_per_merchant
--      are dropped; orders_order_number_location_key replaces them.
--   2. generate_order_number keys its day sequences by LOCATION
--      (ord_seq_l<location hex>_<YYYYMMDD>[_s<N>]) and honours the location's
--      pos_config.ordering.orderNumberScope: in location_wide mode it ignores
--      the station and mints ORD-<date>-NNNN from one shared counter. Lock,
--      fast path and location-timezone date are unchanged from 20260927121500.
--      Each new sequence starts above today's highest number at the location
--      for its format (for the shared counter in location_wide mode, above
--      every register's number), so the one-time rename on deploy day never
--      reuses a number.
--   3. generate_order_number_internal delegates to generate_order_number, so
--      every station-less number at a location comes from one counter.
--   4. default_pos_config_v1 ships ordering.orderNumberScope = 'per_station'.
--   5. Switching a location to location_wide mid-shift moves its shared counter
--      past today's highest register number, so after S1-0042 and S2-0037 the
--      next order is 0043 (trigger on locations.pos_config).
--   6. create_order_v4 (bdf1ee9b body):
--      - location_wide: a station-numbered client number (ORD-<date>-S{n}-NNNN,
--        a provisional device mint) is replaced from the shared counter and
--        the reply says order_number_reassigned = true. A station-less client
--        number is kept.
--      - A number collision is renumbered from a counter moved past the
--        location's highest number, retried up to 3 times. Device-minted
--        numbers never advance the server sequence, so the single retry that
--        was here could land on another taken number and fail the op forever.
--      - The reply and the audit row carry order_number_scope.
--
-- ROLLOUT
--   Staging: supabase db push. First remove the stale ledger row
--   20260925120000 (its function bodies were replaced by 20260927121500 and
--   its file no longer lives in supabase/migrations):
--     supabase migration repair --status reverted 20260925120000
--   Prod (by hand): apply 20260927121500 first. Build the new index outside
--   a transaction so the swap below takes only a brief lock:
--     CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS orders_order_number_location_key
--       ON public.orders (location_id, order_number);
--   Deploy at close: today's sequences are renamed, and each restarts once
--   from today's max.
--
-- Rollback: rollback/20260930170000_order_number_scope_per_location_rollback.sql
-- =============================================================================

BEGIN;

-- Fail fast instead of queueing POS writes behind the orders lock.
SET LOCAL lock_timeout = '5s';

-- -----------------------------------------------------------------------------
-- 1. Uniqueness per location
-- -----------------------------------------------------------------------------
-- Strictly weaker than the merchant key it replaces (a location belongs to one
-- merchant), so every existing row already satisfies it.
CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number_location_key
  ON public.orders (location_id, order_number);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_constraint
     WHERE conrelid = 'public.orders'::regclass
       AND conname = 'orders_order_number_location_key'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_order_number_location_key
      UNIQUE USING INDEX orders_order_number_location_key;
  END IF;
END $$;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_number_merchant_key;
DROP INDEX IF EXISTS public.idx_unique_order_number_per_merchant;

-- -----------------------------------------------------------------------------
-- 2. default_pos_config_v1: ordering.orderNumberScope
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.default_pos_config_v1()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = 'public', 'pg_temp'
AS $$
  SELECT '{
    "_schema": "pos_config_v1",
    "_version": 0,
    "printing": {
      "showTaxBreakdown": true,
      "showItemizedList": true,
      "showTipOptions": true,
      "footerMessage": "",
      "showGuestCount": true,
      "showCourseNumber": true
    },
    "payment": {
      "cashEnabled": true,
      "splitByItem": true,
      "splitEvenly": true,
      "splitByAmount": true
    },
    "display": {
      "uiScale": "comfortable",
      "appTheme": "system"
    },
    "notifications": {
      "soundEnabled": true,
      "volume": 70
    },
    "ordering": {
      "orderNumberScope": "per_station"
    }
  }'::jsonb;
$$;

-- -----------------------------------------------------------------------------
-- 3. Helpers
-- -----------------------------------------------------------------------------

-- Day sequence name. Lower-case 'l' keeps it unquoted in hand-written SQL and
-- outside the 20260927121500 backfill pattern (hex only).
CREATE OR REPLACE FUNCTION public._order_number_sequence_name(
  p_location_id uuid,
  p_date_str text,
  p_station_number integer
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT 'ord_seq_l' || replace(p_location_id::text, '-', '') || '_' || p_date_str
         || CASE WHEN p_station_number IS NULL THEN '' ELSE '_s' || p_station_number::text END;
$$;

-- Trailing counter of ORD-<date>-NNNN or ORD-<date>-S{n}-NNNN; NULL otherwise.
CREATE OR REPLACE FUNCTION public._order_number_counter(p_order_number text)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT (regexp_match(p_order_number, '^ORD-[0-9]{8}-(?:S[0-9]+-)?([0-9]+)$'))[1]::bigint;
$$;

-- -----------------------------------------------------------------------------
-- 4. generate_order_number: location-keyed, scope-aware
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_order_number(
  p_location_id uuid,
  p_station_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_merchant_id uuid;
  v_location_tz text;
  v_scope text;
  v_date_str text;
  v_sequence_number bigint;
  v_start_value bigint;
  v_station_number integer;
  v_station_prefix text;
  v_sequence_name text;
  v_sequence regclass;
BEGIN
  SELECT l.merchant_id, l.timezone, l.pos_config #>> '{ordering,orderNumberScope}'
    INTO v_merchant_id, v_location_tz, v_scope
    FROM public.locations l
   WHERE l.id = p_location_id;

  IF v_merchant_id IS NULL THEN
    RAISE EXCEPTION 'Location not found: %', p_location_id;
  END IF;

  v_date_str := TO_CHAR(
    (NOW() AT TIME ZONE COALESCE(NULLIF(v_location_tz, ''), 'America/New_York'))::date,
    'YYYYMMDD'
  );

  -- location_wide: one counter for every register, so the station is ignored.
  IF p_station_id IS NOT NULL AND v_scope IS DISTINCT FROM 'location_wide' THEN
    SELECT s.station_number
      INTO v_station_number
      FROM public.stations s
     WHERE s.id = p_station_id;
  END IF;

  IF v_station_number IS NOT NULL THEN
    v_station_prefix := 'S' || v_station_number::text;
  END IF;
  v_sequence_name := public._order_number_sequence_name(p_location_id, v_date_str, v_station_number);

  -- Fast path: the day's sequence already exists. No lock, no subtransaction.
  v_sequence := to_regclass(format('%I.%I', 'public', v_sequence_name));

  IF v_sequence IS NULL THEN
    -- Slow path (first order of the day for this sequence): serialize creators.
    -- Transaction-scoped, so commit, rollback and statement timeout all release it.
    PERFORM pg_advisory_xact_lock(hashtextextended('generate_order_number:' || v_sequence_name, 0));

    -- Re-check with an MVCC read of pg_class (fresh statement snapshot), not the
    -- syscache, which can still hold the negative entry from the lookup above.
    SELECT c.oid::regclass
      INTO v_sequence
      FROM pg_catalog.pg_class c
     WHERE c.relnamespace = 'public'::regnamespace
       AND c.relname = v_sequence_name
       AND c.relkind = 'S';

    IF v_sequence IS NULL THEN
      IF v_station_number IS NOT NULL THEN
        SELECT COALESCE(MAX(public._order_number_counter(o.order_number)), 0) + 1
          INTO v_start_value
          FROM public.orders o
         WHERE o.location_id = p_location_id
           AND o.order_number LIKE 'ORD-' || v_date_str || '-' || v_station_prefix || '-%';
      ELSE
        -- Re-read the scope under the lock: a switch to location_wide that
        -- committed while we waited (see _order_number_scope_switched) found
        -- no sequence to move and relies on this start value.
        SELECT l.pos_config #>> '{ordering,orderNumberScope}'
          INTO v_scope
          FROM public.locations l
         WHERE l.id = p_location_id;

        IF v_scope = 'location_wide' THEN
          -- Above every register's number today, so a mid-shift switch never
          -- hands out 0042 after S1-0042 was printed.
          SELECT COALESCE(MAX(public._order_number_counter(o.order_number)), 0) + 1
            INTO v_start_value
            FROM public.orders o
           WHERE o.location_id = p_location_id
             AND o.order_number LIKE 'ORD-' || v_date_str || '-%';
        ELSE
          SELECT COALESCE(MAX(public._order_number_counter(o.order_number)), 0) + 1
            INTO v_start_value
            FROM public.orders o
           WHERE o.location_id = p_location_id
             AND o.order_number LIKE 'ORD-' || v_date_str || '-%'
             AND o.order_number NOT LIKE 'ORD-' || v_date_str || '-S%';
        END IF;
      END IF;

      EXECUTE format(
        'CREATE SEQUENCE IF NOT EXISTS %I.%I START WITH %s INCREMENT BY 1 MINVALUE 1 CACHE 1',
        'public', v_sequence_name, v_start_value
      );

      -- cleanup_old_order_sequences drops by this registry, not by name.
      INSERT INTO public.order_number_day_sequences (sequence_name, merchant_id, date_str, created_at)
      VALUES (v_sequence_name, v_merchant_id, v_date_str, NOW())
      ON CONFLICT (sequence_name) DO NOTHING;

      v_sequence := format('%I.%I', 'public', v_sequence_name)::regclass;
    END IF;
  END IF;

  v_sequence_number := nextval(v_sequence);

  IF v_station_number IS NOT NULL THEN
    RETURN 'ORD-' || v_date_str || '-' || v_station_prefix || '-' || LPAD(v_sequence_number::text, 4, '0');
  END IF;
  RETURN 'ORD-' || v_date_str || '-' || LPAD(v_sequence_number::text, 4, '0');
END;
$function$;

-- -----------------------------------------------------------------------------
-- 5. generate_order_number_internal: same station-less counter
-- -----------------------------------------------------------------------------
-- p_merchant_id is kept for callers; the location already implies it.
CREATE OR REPLACE FUNCTION public.generate_order_number_internal(
  p_location_id uuid,
  p_merchant_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN public.generate_order_number(p_location_id, NULL);
END;
$function$;

-- -----------------------------------------------------------------------------
-- 6. _unused_order_number: a number no order at the location holds yet
-- -----------------------------------------------------------------------------
-- Device-minted numbers (Decision 0.1) never advance the server sequence, so
-- after a collision the next nextval can be another taken number. Skip the
-- counter past today's highest number with the same prefix so the replacement
-- is new on the first try. nextval never goes backwards, so skipping is safe
-- against concurrent callers where setval is not.
CREATE OR REPLACE FUNCTION public._unused_order_number(
  p_location_id uuid,
  p_station_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_candidate text;
  v_prefix text;
  v_max bigint;
BEGIN
  v_candidate := public.generate_order_number(p_location_id, p_station_id);

  IF NOT EXISTS (
    SELECT 1 FROM public.orders o
     WHERE o.location_id = p_location_id AND o.order_number = v_candidate
  ) THEN
    RETURN v_candidate;
  END IF;

  -- 'ORD-<date>-S1-' or 'ORD-<date>-'
  v_prefix := substring(v_candidate FROM '^(.*-)[0-9]+$');

  SELECT MAX(public._order_number_counter(o.order_number))
    INTO v_max
    FROM public.orders o
   WHERE o.location_id = p_location_id
     AND o.order_number LIKE v_prefix || '%'
     AND substring(o.order_number FROM length(v_prefix) + 1) ~ '^[0-9]+$';

  WHILE public._order_number_counter(v_candidate) <= COALESCE(v_max, 0) LOOP
    v_candidate := public.generate_order_number(p_location_id, p_station_id);
  END LOOP;

  RETURN v_candidate;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 7. Mid-shift switch to location_wide
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._order_number_scope_switched()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_date_str text;
  v_sequence_name text;
  v_sequence regclass;
  v_floor bigint;
  v_last bigint;
  v_is_called boolean;
BEGIN
  v_date_str := TO_CHAR(
    (NOW() AT TIME ZONE COALESCE(NULLIF(NEW.timezone, ''), 'America/New_York'))::date,
    'YYYYMMDD'
  );

  -- Highest number any register at this location used today.
  SELECT MAX(public._order_number_counter(o.order_number))
    INTO v_floor
    FROM public.orders o
   WHERE o.location_id = NEW.id
     AND o.order_number LIKE 'ORD-' || v_date_str || '-S%';

  IF v_floor IS NULL THEN
    RETURN NULL;
  END IF;

  v_sequence_name := public._order_number_sequence_name(NEW.id, v_date_str, NULL);

  -- Same lock as the creator in generate_order_number: whichever of us goes
  -- second sees the other's work.
  PERFORM pg_advisory_xact_lock(hashtextextended('generate_order_number:' || v_sequence_name, 0));

  SELECT c.oid::regclass
    INTO v_sequence
    FROM pg_catalog.pg_class c
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relname = v_sequence_name
     AND c.relkind = 'S';

  -- Not created yet today: its first call reads location_wide and starts above
  -- every register's number.
  IF v_sequence IS NULL THEN
    RETURN NULL;
  END IF;

  EXECUTE format('SELECT last_value, is_called FROM %s', v_sequence)
    INTO v_last, v_is_called;
  IF NOT v_is_called THEN
    v_last := v_last - 1;
  END IF;

  -- Burn up to the floor rather than setval, which could move the counter
  -- backwards past a concurrent nextval.
  WHILE v_last < v_floor LOOP
    v_last := nextval(v_sequence);
  END LOOP;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_locations_order_number_scope_switched ON public.locations;
CREATE TRIGGER trg_locations_order_number_scope_switched
AFTER UPDATE OF pos_config ON public.locations
FOR EACH ROW
WHEN (
  NEW.pos_config #>> '{ordering,orderNumberScope}' = 'location_wide'
  AND OLD.pos_config #>> '{ordering,orderNumberScope}' IS DISTINCT FROM 'location_wide'
)
EXECUTE FUNCTION public._order_number_scope_switched();

-- -----------------------------------------------------------------------------
-- 8. create_order_v4: scope + collision heal
--    Base: Dexa-POS bdf1ee9b (create_order_v4.sql + both index names).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_order_v4(
  p_merchant_id uuid,
  p_location_id uuid,
  p_order_type order_type,
  p_table_number text,
  p_customer_name text,
  p_customer_phone text,
  p_special_instructions text,
  p_device_id text,
  p_created_by_staff_id uuid,
  p_station_id uuid DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL,
  p_order_id uuid DEFAULT NULL,
  p_order_number text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cached JSONB;
  v_order_id UUID;
  v_order_number TEXT;
  v_display_number TEXT;
  v_user_id TEXT;
  v_result jsonb;
  v_verified_staff_id UUID;
  v_existing RECORD;
  v_number_from_client BOOLEAN;
  v_number_reassigned BOOLEAN := FALSE;
  v_constraint TEXT;
  v_scope TEXT;
  v_renumber_attempts INT := 0;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_cached := public._idempotency_claim(p_idempotency_key, 'create_order_v4');
    IF v_cached IS NOT NULL THEN
      RETURN v_cached;
    END IF;
  END IF;

  -- BEGIN_VERBATIM
  v_user_id := get_my_claim('sub');

  IF NOT (p_location_id = ANY(user_location_ids())) THEN
    RAISE EXCEPTION 'Access denied: User does not have access to location';
  END IF;

  IF p_merchant_id != user_merchant_id() THEN
    RAISE EXCEPTION 'Access denied: Invalid merchant_id';
  END IF;

  -- -------------------------------------------------------------------
  -- (1) ROW-LEVEL IDEMPOTENCY.
  --
  -- Checked BEFORE any work, and scoped to the merchant so a client cannot
  -- probe for the existence of another merchant's order id. A retry of a call
  -- whose response was lost lands here and returns the same payload it would
  -- have returned the first time.
  -- -------------------------------------------------------------------
  IF p_order_id IS NOT NULL THEN
    SELECT id, order_number, display_number, status
      INTO v_existing
      FROM public.orders
     WHERE id = p_order_id
       AND merchant_id = p_merchant_id;

    IF FOUND THEN
      v_result := jsonb_build_object(
        'success', true,
        'order_id', v_existing.id,
        'order_number', v_existing.order_number,
        'display_number', v_existing.display_number,
        'status', v_existing.status,
        'already_existed', true,
        'order_number_reassigned', false
      );

      IF p_idempotency_key IS NOT NULL THEN
        PERFORM public._idempotency_complete(p_idempotency_key, 'create_order_v4', v_result);
      END IF;

      RETURN v_result;
    END IF;
  END IF;

  v_verified_staff_id := p_created_by_staff_id;
  IF v_verified_staff_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.staff_profiles WHERE id = v_verified_staff_id) THEN
      v_verified_staff_id := NULL;
    END IF;
  END IF;

  v_order_id := COALESCE(p_order_id, gen_random_uuid());

  -- The location's numbering scope. generate_order_number applies it to every
  -- number it mints; the tablet reads the same key from get_effective_pos_config.
  SELECT COALESCE(l.pos_config #>> '{ordering,orderNumberScope}', 'per_station')
    INTO v_scope
    FROM public.locations l
   WHERE l.id = p_location_id;
  v_scope := COALESCE(v_scope, 'per_station');

  -- -------------------------------------------------------------------
  -- (2) ORDER NUMBER.
  --
  -- The device's number is authoritative when supplied (plan Decision 0.1):
  -- a receipt or KDS ticket printed offline must never be renumbered later —
  -- EXCEPT in location-wide mode, where no single tablet owns the shared
  -- counter. There, a station-numbered client number (…-S{n}-NNNN) is a
  -- provisional mint and is replaced from the location counter; a station-less
  -- client number is kept. generate_order_number stays the path for
  -- server-originated orders.
  -- -------------------------------------------------------------------
  v_number_from_client := (p_order_number IS NOT NULL AND p_order_number <> '');

  IF v_number_from_client THEN
    v_order_number := p_order_number;

    IF v_scope = 'location_wide' AND v_order_number ~ '^ORD-[0-9]{8}-S[0-9]+-' THEN
      v_order_number := public.generate_order_number(p_location_id, NULL);
      v_number_reassigned := TRUE;
    END IF;
  ELSE
    v_order_number := public.generate_order_number(p_location_id, p_station_id);
  END IF;

  v_display_number := public._display_number_from_order_number(v_order_number);

  -- -------------------------------------------------------------------
  -- (3) INSERT, WITH THE order_number COLLISION BACKSTOP.
  --
  -- INCIDENT THIS GUARDS (2026-06-14, PROD — see
  -- orders_order_number_per_merchant_unique.sql for the full write-up):
  -- a duplicate order_number raised unique_violation, which rolled back the
  -- whole transaction INCLUDING the CREATE SEQUENCE that generate_order_number
  -- had just performed. The sequence therefore never persisted, restarted at
  -- 0001 on every retry, and could never climb past the colliding value. The
  -- POS sat on "Creating order" forever, on every device, surviving restarts.
  --
  -- Letting the device mint numbers makes a collision MORE likely, not less
  -- (an MMKV wipe or a duplicated station_number resets the local counter), so
  -- this backstop is load-bearing rather than defensive.
  --
  -- Each attempt is its own EXCEPTION block, so its own subtransaction: on
  -- unique_violation we roll back only that attempt, then mint the
  -- replacement INSIDE the handler. Its CREATE SEQUENCE therefore happens
  -- AFTER the rollback and survives to commit — which is precisely what the
  -- 2026-06-14 path failed to do. Do not hoist that call above the BEGIN.
  -- The replacement comes from _unused_order_number, which skips the counter
  -- past numbers the location already holds (device mints never advance it);
  -- the loop only covers a racing insert of the same number.
  --
  -- GET STACKED DIAGNOSTICS distinguishes the constraints: an order_number
  -- clash is recoverable by renumbering, a PK clash means a concurrent caller
  -- inserted the same id (a racing retry) and must be resolved by returning
  -- that row, never by minting a different id. The merchant-level names are
  -- the guards this migration drops; they stay listed so this body is right on
  -- a database that still has them.
  -- -------------------------------------------------------------------
  <<insert_order>>
  LOOP
    BEGIN
      INSERT INTO public.orders (
        id, merchant_id, location_id, order_number, display_number, order_type, status,
        table_number, customer_name, customer_phone, special_instructions, device_id,
        created_by_staff_id, created_by_user_id, station_id, created_at, updated_at
      ) VALUES (
        v_order_id, p_merchant_id, p_location_id, v_order_number, v_display_number, p_order_type, 'draft',
        p_table_number, p_customer_name, p_customer_phone, p_special_instructions, p_device_id,
        v_verified_staff_id, v_user_id, p_station_id, NOW(), NOW()
      );
      EXIT insert_order;

    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;

      IF v_constraint = 'orders_pkey' THEN
        -- A concurrent call already inserted this exact id. Return that row:
        -- property (1), reached by the racing path instead of the pre-check.
        SELECT id, order_number, display_number, status
          INTO v_existing
          FROM public.orders
         WHERE id = v_order_id
           AND merchant_id = p_merchant_id;

        IF NOT FOUND THEN
          RAISE;  -- pkey clash on an order we cannot see: do not paper over it
        END IF;

        v_result := jsonb_build_object(
          'success', true,
          'order_id', v_existing.id,
          'order_number', v_existing.order_number,
          'display_number', v_existing.display_number,
          'status', v_existing.status,
          'already_existed', true,
          'order_number_reassigned', false
        );

        IF p_idempotency_key IS NOT NULL THEN
          PERFORM public._idempotency_complete(p_idempotency_key, 'create_order_v4', v_result);
        END IF;

        RETURN v_result;

      ELSIF v_constraint IN ('orders_order_number_location_key',
                             'orders_order_number_merchant_key',
                             'idx_unique_order_number_per_merchant') THEN
        -- Recoverable: keep the client's ID (identity is sacred), reassign only
        -- the number. The response flags it so the device can correct what it
        -- displays — and so this stays visible in logs rather than silent.
        v_renumber_attempts := v_renumber_attempts + 1;
        IF v_renumber_attempts > 3 THEN
          RAISE;
        END IF;

        v_order_number := public._unused_order_number(p_location_id, p_station_id);
        v_display_number := public._display_number_from_order_number(v_order_number);
        v_number_reassigned := TRUE;

      ELSE
        RAISE;  -- unknown constraint — never swallow
      END IF;
    END;
  END LOOP;

  INSERT INTO public.audit_logs (
    actor_user_id, organization_id, action, action_category, resource_type, resource_name, metadata, status
  ) VALUES (
    v_user_id,
    (SELECT clerk_org_id FROM public.merchants WHERE id = p_merchant_id),
    'order_created', 'order_management', 'order', v_order_number,
    jsonb_build_object(
      'order_id', v_order_id, 'order_type', p_order_type, 'table_number', p_table_number,
      'location_id', p_location_id, 'station_id', p_station_id,
      'client_minted_id', (p_order_id IS NOT NULL),
      'client_minted_number', v_number_from_client,
      'client_order_number', CASE WHEN v_number_reassigned THEN p_order_number END,
      'order_number_reassigned', v_number_reassigned,
      'order_number_scope', v_scope
    ),
    'success'
  );

  v_result := jsonb_build_object(
    'success', true, 'order_id', v_order_id,
    'order_number', v_order_number, 'display_number', v_display_number, 'status', 'draft',
    'already_existed', false,
    'order_number_reassigned', v_number_reassigned,
    'order_number_scope', v_scope
  );
  -- END_VERBATIM

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public._idempotency_complete(p_idempotency_key, 'create_order_v4', v_result);
  END IF;

  RETURN v_result;
END;
$function$;

-- -----------------------------------------------------------------------------
-- Grants and comments
-- -----------------------------------------------------------------------------
-- Internal: burns numbers, so only the SECURITY DEFINER callers above use it.
REVOKE ALL ON FUNCTION public._unused_order_number(uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.default_pos_config_v1() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_order_number(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_order_number_internal(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_v4(uuid, uuid, order_type, text, text, text, text, text, uuid, uuid, uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.generate_order_number(uuid, uuid) IS
  'Generates POS order numbers from per-location day sequences (location local date). In the location''s '
  'location_wide scope the station is ignored and one counter serves the location. Locks (transaction-scoped) '
  'only when creating the day''s sequence. See 20260930170000_order_number_scope_per_location.sql.';

COMMENT ON FUNCTION public.generate_order_number_internal(uuid, uuid) IS
  'Station-less order number for a location; same counter as generate_order_number(location, NULL). '
  'See 20260930170000_order_number_scope_per_location.sql.';

COMMENT ON FUNCTION public.create_order_v4 IS
  'Creates an order. v4 accepts a client-minted p_order_id and p_order_number (the Identity Gate) '
  'and is idempotent on the id, so an outbox retry can never produce a duplicate. Falls back to '
  'server generation when either is NULL. Honors the location''s pos_config.ordering.orderNumberScope: '
  'in location_wide mode a station-numbered client number is reassigned to the shared location '
  'counter. Reassigns the number, never the id, on an order_number collision.';

COMMIT;

-- Verify: docs/features/order-number-scope/verify-staging.sql
