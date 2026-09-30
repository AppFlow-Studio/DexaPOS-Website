-- =============================================================================
-- Migration: Location-wide order number counter (opt-in per-location toggle)
--
-- Adds a per-location setting `pos_config.ordering.orderNumberScope`:
--   'per_station'   (default) — each register keeps its own counter (#S1-0042)
--   'location_wide'           — one shared counter across the location (#0042)
--
-- Three coordinated changes:
--   1. default_pos_config_v1() — ships the new key (default per_station) so it
--      deep-merges into every existing location transparently.
--   2. generate_order_number() — sequences are now keyed by LOCATION (not
--      merchant). A location_id uniquely implies its merchant, and this is what
--      makes location-wide numbering actually per-location for multi-location
--      merchants (previously two locations of one merchant shared a counter and
--      could collide on the (merchant_id, order_number) unique key). The
--      location-wide sequence bootstraps ABOVE today's highest number across
--      ALL stations, so flipping the toggle mid-shift never reuses a number.
--   3. create_order_v4() — honors the scope for server-minted numbers and, in
--      location-wide mode, reassigns a station-partitioned client number (a
--      provisional offline mint) to the shared location counter. This is the
--      server half of the "online-authoritative + offline fallback" strategy;
--      the tablet reads the same scope from get_effective_pos_config.
--
-- Rollback: rollback/20260925120000_order_number_scope_rollback.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. default_pos_config_v1 — add ordering.orderNumberScope (default per_station)
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
-- 2. generate_order_number — location-keyed sequences + location-wide bootstrap
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

  -- Build a safe sequence name keyed by LOCATION (not merchant). A location_id
  -- uniquely implies its merchant, so this is both correct and shorter than
  -- merchant+location (stays well under Postgres' 63-char identifier limit).
  -- Keying by location is what makes location-wide numbering per-location, and
  -- station sequences per-location too (the same station_number at two
  -- locations no longer shares a counter).
  --   ord_seq_L<location_uuid_no_dashes>_<YYYYMMDD>[_s<N>]
  IF v_station_number IS NOT NULL THEN
    v_station_prefix := 'S' || v_station_number::TEXT;
    v_seq_name := 'ord_seq_L'
      || replace(p_location_id::text, '-', '')
      || '_' || v_date_str
      || '_s' || v_station_number::text;
  ELSE
    v_seq_name := 'ord_seq_L'
      || replace(p_location_id::text, '-', '')
      || '_' || v_date_str;
  END IF;

  -- Guard sequence creation with a session-level advisory lock so that under
  -- high concurrency only ONE transaction runs CREATE SEQUENCE while the rest
  -- wait briefly then proceed directly to nextval. The lock is released
  -- IMMEDIATELY after creation — it is NOT held for the rest of this
  -- transaction.
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
      -- numbers already created today (a previous run, the old merchant-keyed
      -- sequence, or — for location-wide — station-prefixed orders rung before
      -- the toggle was flipped).
      DECLARE
        v_start_val BIGINT;
      BEGIN
        IF v_station_prefix IS NOT NULL THEN
          -- Per-station sequence: bootstrap from this station's own max today,
          -- scoped to the location.
          SELECT COALESCE(MAX(
            NULLIF(SPLIT_PART(order_number, '-', 4), '')::BIGINT
          ), 0) + 1
          INTO v_start_val
          FROM public.orders
          WHERE location_id = p_location_id
            AND order_number LIKE 'ORD-' || v_date_str || '-' || v_station_prefix || '-%';
        ELSE
          -- Location-wide sequence: continue ABOVE the highest number used by
          -- ANY station at this location today, so a mid-shift switch to
          -- location-wide never reuses a number already printed as #S{n}-NNNN.
          -- Trailing counter is segment 4 for station orders
          -- (ORD-<date>-S{n}-NNNN) and segment 3 for station-less ones
          -- (ORD-<date>-NNNN).
          SELECT COALESCE(MAX(
            CASE
              WHEN SPLIT_PART(order_number, '-', 4) <> ''
                THEN NULLIF(SPLIT_PART(order_number, '-', 4), '')::BIGINT
              ELSE NULLIF(SPLIT_PART(order_number, '-', 3), '')::BIGINT
            END
          ), 0) + 1
          INTO v_start_val
          FROM public.orders
          WHERE location_id = p_location_id
            AND order_number LIKE 'ORD-' || v_date_str || '-%';
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
    PERFORM pg_advisory_unlock(v_create_lock);

  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_advisory_unlock(v_create_lock);
    RAISE;
  END;

  -- nextval(): atomic increment, microsecond-held lock, zero txn contention.
  EXECUTE format('SELECT nextval(''public.%I'')', v_seq_name) INTO v_sequence_number;

  -- Format order number (string format unchanged — location is only in the
  -- internal sequence NAME, never in the order_number itself).
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
-- 3. create_order_v4 — honor the scope + reassign provisional station numbers
--    in location-wide mode. Only the scope resolution and the two
--    generate_order_number call sites change; everything else is verbatim from
--    20260910120000_create_order_v4.sql.
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

  -- Resolve the location's order-number scope. On the tablet the equivalent
  -- value comes from the cached get_effective_pos_config; here we read it
  -- straight off the location row.
  SELECT COALESCE(pos_config #>> '{ordering,orderNumberScope}', 'per_station')
    INTO v_scope
    FROM public.locations
   WHERE id = p_location_id;
  v_scope := COALESCE(v_scope, 'per_station');

  -- -------------------------------------------------------------------
  -- (2) ORDER NUMBER.
  --
  -- The device's number is authoritative when supplied (plan Decision 0.1):
  -- a receipt or KDS ticket printed offline must never be renumbered later —
  -- EXCEPT in location-wide mode, where a single tablet cannot own the shared
  -- counter. There, a station-partitioned client number (…-S{n}-NNNN) is only
  -- a provisional offline mint and is reassigned to the location counter; a
  -- station-less client number already came from the online server-authoritative
  -- path and is kept as-is. generate_order_number stays the path for
  -- server-originated orders and as the collision fallback below.
  -- -------------------------------------------------------------------
  v_number_from_client := (p_order_number IS NOT NULL AND p_order_number <> '');

  IF v_number_from_client THEN
    v_order_number := p_order_number;

    IF v_scope = 'location_wide'
       AND SPLIT_PART(v_order_number, '-', 4) <> '' THEN
      v_order_number := public.generate_order_number(p_location_id, NULL);
      v_number_reassigned := TRUE;
    END IF;
  ELSE
    IF v_scope = 'location_wide' THEN
      v_order_number := public.generate_order_number(p_location_id, NULL);
    ELSE
      v_order_number := public.generate_order_number(p_location_id, p_station_id);
    END IF;
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

    ELSIF v_constraint = 'orders_order_number_merchant_key' THEN
      -- Recoverable: keep the client's ID (identity is sacred), reassign only
      -- the number. Honor the location scope so the replacement matches the
      -- active numbering mode. The response flags it so the device can correct
      -- what it displays — and so this stays visible in logs rather than silent.
      IF v_scope = 'location_wide' THEN
        v_order_number := public.generate_order_number(p_location_id, NULL);
      ELSE
        v_order_number := public.generate_order_number(p_location_id, p_station_id);
      END IF;
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
      'order_number_reassigned', v_number_reassigned,
      'order_number_scope', v_scope
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
  'server generation when either is NULL. Honors the location''s pos_config.ordering.orderNumberScope: '
  'in location_wide mode a station-partitioned client number is reassigned to the shared location '
  'counter. Reassigns the number, never the id, on an order_number collision.';
