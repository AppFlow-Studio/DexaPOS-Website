
-- get_location_payment_device_secret: same return shape, updated column reference
CREATE OR REPLACE FUNCTION public.get_location_payment_device_secret(
  p_location_id uuid,
  p_device_id uuid DEFAULT NULL::uuid
) RETURNS TABLE (device_id uuid, tpn text, decrypted_secret text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_device public.location_payment_devices%ROWTYPE;
BEGIN
  IF p_device_id IS NOT NULL THEN
    SELECT * INTO v_device
    FROM public.location_payment_devices lpd
    WHERE lpd.id = p_device_id
      AND lpd.location_id = p_location_id
      AND lpd.is_active = true
    LIMIT 1;
  ELSE
    SELECT * INTO v_device
    FROM public.location_payment_devices lpd
    WHERE lpd.location_id = p_location_id
      AND lpd.is_active = true
      AND lpd.use_for_online_ordering = true
      AND lpd.provider IN ('dejavoo', 'ipospays')
    ORDER BY lpd.updated_at DESC, lpd.created_at DESC
    LIMIT 1;
  END IF;

  IF v_device.id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT v_device.id, v_device.tpn, ds.decrypted_secret
  FROM vault.decrypted_secrets ds
  WHERE ds.id = v_device.provider_secret_id
  LIMIT 1;
END;
$$;

-- upsert_location_payment_device: same signature, updated column reference + fills in new columns
CREATE OR REPLACE FUNCTION public.upsert_location_payment_device(
  p_location_id uuid,
  p_tpn text,
  p_ftd_ecom_key text DEFAULT NULL::text,
  p_device_label text DEFAULT NULL::text,
  p_use_for_online_ordering boolean DEFAULT true
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_merchant_id uuid;
  v_carrier_id uuid;
  v_device_id uuid;
  v_existing_secret_id uuid;
  v_secret_id uuid;
  v_secret_name text;
  v_trimmed_tpn text := nullif(trim(p_tpn), '');
  v_trimmed_ftd_key text := nullif(trim(coalesce(p_ftd_ecom_key, '')), '');
BEGIN
  SELECT l.merchant_id, m.carrier_id INTO v_merchant_id, v_carrier_id
  FROM public.locations l
  JOIN public.merchants m ON m.id = l.merchant_id
  WHERE l.id = p_location_id;

  IF v_merchant_id IS NULL THEN
    RAISE EXCEPTION 'Location % not found', p_location_id USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.is_dexapos_admin()
    OR public.is_merchant_admin(v_merchant_id)
    OR v_carrier_id = public.get_my_carrier_id()
  ) THEN
    RAISE EXCEPTION 'Unauthorized: no access to location %', p_location_id
      USING ERRCODE = '42501';
  END IF;

  IF v_trimmed_tpn IS NULL THEN
    RAISE EXCEPTION 'TPN is required' USING ERRCODE = '22023';
  END IF;

  SELECT lpd.id, lpd.provider_secret_id INTO v_device_id, v_existing_secret_id
  FROM public.location_payment_devices lpd
  WHERE lpd.location_id = p_location_id AND lpd.tpn = v_trimmed_tpn
  LIMIT 1;

  v_secret_name := format('dejavoo_ftd:%s:%s', p_location_id, v_trimmed_tpn);

  IF v_existing_secret_id IS NOT NULL THEN
    v_secret_id := v_existing_secret_id;
  ELSE
    SELECT id INTO v_secret_id FROM vault.secrets WHERE name = v_secret_name LIMIT 1;
  END IF;

  IF v_secret_id IS NULL AND v_trimmed_ftd_key IS NULL THEN
    RAISE EXCEPTION 'FTD Ecom/TOP key is required for a new online-ordering payment device'
      USING ERRCODE = '22023';
  END IF;

  IF v_secret_id IS NULL THEN
    v_secret_id := vault.create_secret(
      v_trimmed_ftd_key, v_secret_name,
      'Dejavoo FTD Ecom/TOP key for location ' || p_location_id
    );
  ELSIF v_trimmed_ftd_key IS NOT NULL THEN
    PERFORM vault.update_secret(v_secret_id, v_trimmed_ftd_key);
  END IF;

  IF p_use_for_online_ordering THEN
    UPDATE public.location_payment_devices
       SET use_for_online_ordering = false, updated_at = now()
     WHERE location_id = p_location_id
       AND use_for_online_ordering = true
       AND tpn <> v_trimmed_tpn;
  END IF;

  INSERT INTO public.location_payment_devices (
    merchant_id, carrier_id, location_id, provider,
    device_label, tpn, provider_secret_id,
    last_synced_from_crm_at, is_active, use_for_online_ordering,
    status, environment
  ) VALUES (
    v_merchant_id, v_carrier_id, p_location_id, 'dejavoo',
    nullif(trim(coalesce(p_device_label, '')), ''),
    v_trimmed_tpn, v_secret_id,
    now(), true, p_use_for_online_ordering,
    'active', 'production'
  )
  ON CONFLICT (location_id, tpn) DO UPDATE
    SET provider_secret_id = excluded.provider_secret_id,
        device_label = excluded.device_label,
        last_synced_from_crm_at = now(),
        is_active = true,
        use_for_online_ordering = excluded.use_for_online_ordering,
        status = 'active',
        updated_at = now()
  RETURNING id INTO v_device_id;

  IF p_use_for_online_ordering THEN
    UPDATE public.online_store_config
       SET ipospays_tpn = v_trimmed_tpn, updated_at = now()
     WHERE location_id = p_location_id;
  END IF;

  RETURN v_device_id;
END;
$$;

-- list_location_payment_devices: DROP + CREATE since we're changing return shape
DROP FUNCTION IF EXISTS public.list_location_payment_devices(uuid);

CREATE FUNCTION public.list_location_payment_devices(p_location_id uuid)
RETURNS TABLE (
  id uuid,
  merchant_id uuid,
  location_id uuid,
  provider text,
  device_label text,
  tpn text,
  whitelist_origins text[],
  whitelist_synced_at timestamptz,
  last_synced_from_crm_at timestamptz,
  is_active boolean,
  use_for_online_ordering boolean,
  status text,
  environment text,
  provider_merchant_id text,
  provider_gateway_id text,
  provider_public_key text,
  has_provider_secret boolean,
  has_webhook_secret boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_merchant_id uuid;
  v_carrier_id uuid;
BEGIN
  SELECT l.merchant_id, m.carrier_id INTO v_merchant_id, v_carrier_id
  FROM public.locations l
  JOIN public.merchants m ON m.id = l.merchant_id
  WHERE l.id = p_location_id;

  IF v_merchant_id IS NULL THEN
    RAISE EXCEPTION 'Location % not found', p_location_id USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.is_dexapos_admin()
    OR public.is_merchant_admin(v_merchant_id)
    OR public.is_location_member(p_location_id)
    OR v_carrier_id = public.get_my_carrier_id()
  ) THEN
    RAISE EXCEPTION 'Unauthorized: no access to location %', p_location_id
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    lpd.id, lpd.merchant_id, lpd.location_id, lpd.provider,
    lpd.device_label, lpd.tpn, lpd.whitelist_origins,
    lpd.whitelist_synced_at, lpd.last_synced_from_crm_at,
    lpd.is_active, lpd.use_for_online_ordering, lpd.status, lpd.environment,
    lpd.provider_merchant_id, lpd.provider_gateway_id, lpd.provider_public_key,
    (lpd.provider_secret_id IS NOT NULL) AS has_provider_secret,
    (lpd.webhook_secret_id IS NOT NULL) AS has_webhook_secret,
    lpd.created_at, lpd.updated_at
  FROM public.location_payment_devices lpd
  WHERE lpd.location_id = p_location_id
  ORDER BY lpd.use_for_online_ordering DESC, lpd.updated_at DESC, lpd.created_at DESC;
END;
$$;
;
