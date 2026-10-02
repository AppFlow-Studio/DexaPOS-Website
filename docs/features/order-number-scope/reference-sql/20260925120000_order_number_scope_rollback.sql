-- =============================================================================
-- Rollback: Location-wide order number counter
--
-- Restores default_pos_config_v1(), generate_order_number(), and
-- create_order_v4() to their pre-20260925120000 definitions
-- (default_pos_config_v1 from 20260630110000, generate_order_number from
-- 20260425000000, create_order_v4 from 20260910120000).
--
-- Note: existing locations that were flipped to "location_wide" keep the
-- pos_config.ordering key in their JSON, but with generate_order_number
-- reverted to merchant-keyed sequences it is simply ignored. Sequence names
-- revert to the merchant-keyed form on the next order of the day (harmless
-- re-bootstrap). No data cleanup is required.
-- =============================================================================

-- 1. default_pos_config_v1 — drop the ordering key
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

-- 2. generate_order_number — merchant-keyed sequences, merchant-scoped bootstrap
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

  IF p_station_id IS NOT NULL THEN
    SELECT station_number INTO v_station_number
    FROM public.stations
    WHERE id = p_station_id;
  END IF;

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

  DECLARE
    v_create_lock BIGINT;
  BEGIN
    v_create_lock := hashtext('ordseq:' || v_seq_name)::bigint;
    PERFORM pg_advisory_lock(v_create_lock);

    IF NOT EXISTS (
      SELECT 1 FROM pg_sequences
      WHERE schemaname = 'public' AND sequencename = v_seq_name
    ) THEN
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

        INSERT INTO public.order_number_day_sequences (sequence_name, merchant_id, date_str)
        VALUES (v_seq_name, v_merchant_id, v_date_str)
        ON CONFLICT (sequence_name) DO NOTHING;
      END;
    END IF;

    PERFORM pg_advisory_unlock(v_create_lock);

  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_advisory_unlock(v_create_lock);
    RAISE;
  END;

  EXECUTE format('SELECT nextval(''public.%I'')', v_seq_name) INTO v_sequence_number;

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

-- 3. create_order_v4 — pre-scope definition (station always passed through)
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

  v_number_from_client := (p_order_number IS NOT NULL AND p_order_number <> '');

  IF v_number_from_client THEN
    v_order_number := p_order_number;
  ELSE
    v_order_number := public.generate_order_number(p_location_id, p_station_id);
  END IF;

  v_display_number := public._display_number_from_order_number(v_order_number);

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
      SELECT id, order_number, display_number, status
        INTO v_existing
        FROM public.orders
       WHERE id = v_order_id
         AND merchant_id = p_merchant_id;

      IF NOT FOUND THEN
        RAISE;
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
      RAISE;
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
