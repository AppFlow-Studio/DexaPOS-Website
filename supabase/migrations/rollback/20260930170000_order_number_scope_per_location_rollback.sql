-- =============================================================================
-- Rollback: 20260930170000_order_number_scope_per_location
-- =============================================================================
-- Restores the bodies staging ran before it:
--   default_pos_config_v1          20260630110000 (no ordering key)
--   generate_order_number(_internal) 20260927121500_order_number_xact_lock
--   create_order_v4                Dexa-POS bdf1ee9b (both merchant index names)
-- and the (merchant_id, order_number) uniqueness guards.
--
-- Run at close. Restoring the merchant key fails while two locations of one
-- merchant hold the same order_number; list them first:
--   select merchant_id, order_number, count(*) from public.orders
--    group by 1, 2 having count(*) > 1;
-- The merchant-keyed day sequences resume where they stopped, below numbers
-- the location-keyed ones minted since; create_order_v4 renumbers on the
-- collision, but it only retries once.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

DROP TRIGGER IF EXISTS trg_locations_order_number_scope_switched ON public.locations;
DROP FUNCTION IF EXISTS public._order_number_scope_switched();

ALTER TABLE public.orders
  ADD CONSTRAINT orders_order_number_merchant_key UNIQUE (merchant_id, order_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_order_number_per_merchant
  ON public.orders (merchant_id, order_number);
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_number_location_key;

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
    }
  }'::jsonb;
$$;

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
  v_date_str text;
  v_sequence_number bigint;
  v_start_value bigint;
  v_station_number integer;
  v_station_prefix text;
  v_sequence_name text;
  v_sequence regclass;
BEGIN
  SELECT l.merchant_id, l.timezone
    INTO v_merchant_id, v_location_tz
    FROM public.locations l
   WHERE l.id = p_location_id;

  IF v_merchant_id IS NULL THEN
    RAISE EXCEPTION 'Location not found: %', p_location_id;
  END IF;

  v_date_str := TO_CHAR(
    (NOW() AT TIME ZONE COALESCE(NULLIF(v_location_tz, ''), 'America/New_York'))::date,
    'YYYYMMDD'
  );

  IF p_station_id IS NOT NULL THEN
    SELECT s.station_number
      INTO v_station_number
      FROM public.stations s
     WHERE s.id = p_station_id;
  END IF;

  IF v_station_number IS NOT NULL THEN
    v_station_prefix := 'S' || v_station_number::text;
    v_sequence_name := 'ord_seq_' || REPLACE(v_merchant_id::text, '-', '_') || '_' || v_date_str || '_' || LOWER(v_station_prefix);
  ELSE
    v_sequence_name := 'ord_seq_' || REPLACE(v_merchant_id::text, '-', '_') || '_' || v_date_str;
  END IF;

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
        SELECT COALESCE(MAX(NULLIF(SPLIT_PART(o.order_number, '-', 4), '')::integer), 0) + 1
          INTO v_start_value
          FROM public.orders o
         WHERE o.merchant_id = v_merchant_id
           AND o.order_number LIKE 'ORD-' || v_date_str || '-' || v_station_prefix || '-%'
           AND SPLIT_PART(o.order_number, '-', 4) ~ '^[0-9]+$';
      ELSE
        SELECT COALESCE(MAX(NULLIF(SPLIT_PART(o.order_number, '-', 3), '')::integer), 0) + 1
          INTO v_start_value
          FROM public.orders o
         WHERE o.merchant_id = v_merchant_id
           AND o.order_number LIKE 'ORD-' || v_date_str || '-%'
           AND o.order_number NOT LIKE 'ORD-' || v_date_str || '-S%'
           AND SPLIT_PART(o.order_number, '-', 3) ~ '^[0-9]+$';
      END IF;

      EXECUTE format(
        'CREATE SEQUENCE IF NOT EXISTS %I.%I START WITH %s INCREMENT BY 1 MINVALUE 1 CACHE 1',
        'public', v_sequence_name, v_start_value
      );

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

CREATE OR REPLACE FUNCTION public.generate_order_number_internal(
  p_location_id uuid,
  p_merchant_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_location_merchant_id uuid;
  v_merchant_id uuid;
  v_location_tz text;
  v_date_str text;
  v_sequence_number bigint;
  v_start_value bigint;
  v_sequence_name text;
  v_sequence regclass;
BEGIN
  SELECT l.merchant_id, l.timezone
    INTO v_location_merchant_id, v_location_tz
    FROM public.locations l
   WHERE l.id = p_location_id;

  IF v_location_merchant_id IS NULL THEN
    RAISE EXCEPTION 'Location not found: %', p_location_id;
  END IF;

  v_merchant_id := COALESCE(p_merchant_id, v_location_merchant_id);

  v_date_str := TO_CHAR(
    (NOW() AT TIME ZONE COALESCE(NULLIF(v_location_tz, ''), 'America/New_York'))::date,
    'YYYYMMDD'
  );

  v_sequence_name := 'ord_seq_' || REPLACE(v_merchant_id::text, '-', '_') || '_' || v_date_str;

  v_sequence := to_regclass(format('%I.%I', 'public', v_sequence_name));

  IF v_sequence IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('generate_order_number:' || v_sequence_name, 0));

    SELECT c.oid::regclass
      INTO v_sequence
      FROM pg_catalog.pg_class c
     WHERE c.relnamespace = 'public'::regnamespace
       AND c.relname = v_sequence_name
       AND c.relkind = 'S';

    IF v_sequence IS NULL THEN
      SELECT COALESCE(MAX(NULLIF(SPLIT_PART(o.order_number, '-', 3), '')::integer), 0) + 1
        INTO v_start_value
        FROM public.orders o
       WHERE o.merchant_id = v_merchant_id
         AND o.order_number LIKE 'ORD-' || v_date_str || '-%'
         AND o.order_number NOT LIKE 'ORD-' || v_date_str || '-S%'
         AND SPLIT_PART(o.order_number, '-', 3) ~ '^[0-9]+$';

      EXECUTE format(
        'CREATE SEQUENCE IF NOT EXISTS %I.%I START WITH %s INCREMENT BY 1 MINVALUE 1 CACHE 1',
        'public', v_sequence_name, v_start_value
      );

      INSERT INTO public.order_number_day_sequences (sequence_name, merchant_id, date_str, created_at)
      VALUES (v_sequence_name, v_merchant_id, v_date_str, NOW())
      ON CONFLICT (sequence_name) DO NOTHING;

      v_sequence := format('%I.%I', 'public', v_sequence_name)::regclass;
    END IF;
  END IF;

  v_sequence_number := nextval(v_sequence);

  RETURN 'ORD-' || v_date_str || '-' || LPAD(v_sequence_number::text, 4, '0');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.generate_order_number(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_order_number_internal(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.generate_order_number(uuid, uuid) IS
  'Generates POS order numbers using the location local date for the daily sequence key. Locks (transaction-scoped) only when creating the day''s sequence. See 20260927121500_order_number_xact_lock.sql.';

COMMENT ON FUNCTION public.generate_order_number_internal(uuid, uuid) IS
  'Generates merchant-wide order numbers using the location local date for the daily sequence key. Locks (transaction-scoped) only when creating the day''s sequence. See 20260927121500_order_number_xact_lock.sql.';

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

  -- -------------------------------------------------------------------
  -- (2) ORDER NUMBER.
  --
  -- The device's number is authoritative when supplied (plan Decision 0.1):
  -- a receipt or KDS ticket printed offline must never be renumbered later.
  -- generate_order_number stays the path for server-originated orders and as
  -- the collision fallback below.
  -- -------------------------------------------------------------------
  v_number_from_client := (p_order_number IS NOT NULL AND p_order_number <> '');

  IF v_number_from_client THEN
    v_order_number := p_order_number;
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
  -- The EXCEPTION block opens a subtransaction: on unique_violation we roll
  -- back only to this savepoint, then call generate_order_number INSIDE the
  -- handler. Its CREATE SEQUENCE therefore happens AFTER the rollback and
  -- survives to commit — which is precisely what the 2026-06-14 path failed to
  -- do. Do not hoist that call above the BEGIN.
  --
  -- GET STACKED DIAGNOSTICS distinguishes the constraints: an order_number
  -- clash is recoverable by renumbering, a PK clash means a concurrent caller
  -- inserted the same id (a racing retry) and must be resolved by returning
  -- that row, never by minting a different id.
  -- -------------------------------------------------------------------
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

    ELSIF v_constraint IN ('orders_order_number_merchant_key',
                           'idx_unique_order_number_per_merchant') THEN
      -- Recoverable: keep the client's ID (identity is sacred), reassign only
      -- the number. The response flags it so the device can correct what it
      -- displays — and so this stays visible in logs rather than silent.
      v_order_number := public.generate_order_number(p_location_id, p_station_id);
      v_display_number := public._display_number_from_order_number(v_order_number);
      v_number_reassigned := TRUE;

      INSERT INTO public.orders (
        id, merchant_id, location_id, order_number, display_number, order_type, status,
        table_number, customer_name, customer_phone, special_instructions, device_id,
        created_by_staff_id, created_by_user_id, station_id, created_at, updated_at
      ) VALUES (
        v_order_id, p_merchant_id, p_location_id, v_order_number, v_display_number, p_order_type, 'draft',
        p_table_number, p_customer_name, p_customer_phone, p_special_instructions, p_device_id,
        v_verified_staff_id, v_user_id, p_station_id, NOW(), NOW()
      );

    ELSE
      RAISE;  -- unknown constraint — never swallow
    END IF;
  END;

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
      'order_number_reassigned', v_number_reassigned
    ),
    'success'
  );

  v_result := jsonb_build_object(
    'success', true, 'order_id', v_order_id,
    'order_number', v_order_number, 'display_number', v_display_number, 'status', 'draft',
    'already_existed', false,
    'order_number_reassigned', v_number_reassigned
  );
  -- END_VERBATIM

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public._idempotency_complete(p_idempotency_key, 'create_order_v4', v_result);
  END IF;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_order_v4(uuid, uuid, order_type, text, text, text, text, text, uuid, uuid, uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.create_order_v4 IS
  'Creates an order. v4 accepts a client-minted p_order_id and p_order_number (the Identity Gate) '
  'and is idempotent on the id, so an outbox retry can never produce a duplicate. Falls back to '
  'server generation when either is NULL. Reassigns the number, never the id, on an order_number collision.';

DROP FUNCTION IF EXISTS public._unused_order_number(uuid, uuid);
DROP FUNCTION IF EXISTS public._order_number_counter(text);
DROP FUNCTION IF EXISTS public._order_number_sequence_name(uuid, text, integer);

COMMIT;
