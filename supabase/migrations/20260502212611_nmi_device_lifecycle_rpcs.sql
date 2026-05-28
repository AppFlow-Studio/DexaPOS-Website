
-- Stage 1: Create an NMI device row at status='pending_creation'
-- Called by Carrier dashboard at start of onboarding
CREATE OR REPLACE FUNCTION public.create_nmi_payment_device(
  p_location_id uuid,
  p_device_label text DEFAULT NULL::text,
  p_environment text DEFAULT 'production'::text,
  p_use_for_online_ordering boolean DEFAULT true
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_merchant_id uuid;
  v_carrier_id uuid;
  v_device_id uuid;
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

  IF p_environment NOT IN ('sandbox', 'production') THEN
    RAISE EXCEPTION 'Invalid environment: %', p_environment USING ERRCODE = '22023';
  END IF;

  IF p_use_for_online_ordering THEN
    UPDATE public.location_payment_devices
       SET use_for_online_ordering = false, updated_at = now()
     WHERE location_id = p_location_id AND use_for_online_ordering = true;
  END IF;

  INSERT INTO public.location_payment_devices (
    merchant_id, carrier_id, location_id,
    provider, environment, status,
    device_label, use_for_online_ordering,
    supports_customer_vault, is_active
  ) VALUES (
    v_merchant_id, v_carrier_id, p_location_id,
    'nmi', p_environment, 'pending_creation',
    nullif(trim(coalesce(p_device_label, '')), ''),
    p_use_for_online_ordering,
    true, true
  ) RETURNING id INTO v_device_id;

  RETURN v_device_id;
END;
$$;

-- Stage 2: Mark merchant provisioned in NMI (after Merchant API call succeeds)
CREATE OR REPLACE FUNCTION public.set_nmi_merchant_provisioned(
  p_device_id uuid,
  p_provider_merchant_id text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_device public.location_payment_devices%ROWTYPE;
BEGIN
  SELECT * INTO v_device FROM public.location_payment_devices WHERE id = p_device_id;

  IF v_device.id IS NULL THEN
    RAISE EXCEPTION 'Device % not found', p_device_id USING ERRCODE = '42501';
  END IF;
  IF v_device.provider != 'nmi' THEN
    RAISE EXCEPTION 'Device % is not an NMI device', p_device_id USING ERRCODE = '22023';
  END IF;
  IF NOT (public.is_dexapos_admin() OR v_device.carrier_id = public.get_my_carrier_id()) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.location_payment_devices
     SET provider_merchant_id = p_provider_merchant_id,
         status = 'pending_processor_setup',
         updated_at = now()
   WHERE id = p_device_id;
END;
$$;

-- Stage 3: Activate device with public_key (Collect.js) + security_key (private API key)
-- Stores security_key in Vault, never in the table
CREATE OR REPLACE FUNCTION public.activate_nmi_payment_device(
  p_device_id uuid,
  p_provider_merchant_id text,
  p_provider_gateway_id text,
  p_public_key text,
  p_security_key text,
  p_webhook_secret text DEFAULT NULL::text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_device public.location_payment_devices%ROWTYPE;
  v_security_secret_id uuid;
  v_webhook_secret_id uuid;
BEGIN
  SELECT * INTO v_device FROM public.location_payment_devices WHERE id = p_device_id;

  IF v_device.id IS NULL THEN
    RAISE EXCEPTION 'Device % not found', p_device_id USING ERRCODE = '42501';
  END IF;
  IF v_device.provider != 'nmi' THEN
    RAISE EXCEPTION 'Device % is not an NMI device', p_device_id USING ERRCODE = '22023';
  END IF;
  IF NOT (public.is_dexapos_admin() OR v_device.carrier_id = public.get_my_carrier_id()) THEN
    RAISE EXCEPTION 'Unauthorized: only HQ or owning carrier can activate NMI devices'
      USING ERRCODE = '42501';
  END IF;
  IF nullif(trim(p_security_key), '') IS NULL THEN
    RAISE EXCEPTION 'security_key is required' USING ERRCODE = '22023';
  END IF;
  IF nullif(trim(p_public_key), '') IS NULL THEN
    RAISE EXCEPTION 'public_key is required' USING ERRCODE = '22023';
  END IF;

  IF v_device.provider_secret_id IS NOT NULL THEN
    PERFORM vault.update_secret(v_device.provider_secret_id, p_security_key);
    v_security_secret_id := v_device.provider_secret_id;
  ELSE
    v_security_secret_id := vault.create_secret(
      p_security_key,
      format('nmi_security_key:%s', p_device_id),
      format('NMI security_key for device %s', p_device_id)
    );
  END IF;

  IF nullif(trim(coalesce(p_webhook_secret, '')), '') IS NOT NULL THEN
    IF v_device.webhook_secret_id IS NOT NULL THEN
      PERFORM vault.update_secret(v_device.webhook_secret_id, p_webhook_secret);
      v_webhook_secret_id := v_device.webhook_secret_id;
    ELSE
      v_webhook_secret_id := vault.create_secret(
        p_webhook_secret,
        format('nmi_webhook_secret:%s', p_device_id),
        format('NMI webhook HMAC secret for device %s', p_device_id)
      );
    END IF;
  END IF;

  UPDATE public.location_payment_devices
     SET provider_merchant_id = p_provider_merchant_id,
         provider_gateway_id = p_provider_gateway_id,
         provider_public_key = p_public_key,
         provider_secret_id = v_security_secret_id,
         webhook_secret_id = COALESCE(v_webhook_secret_id, webhook_secret_id),
         status = 'active',
         activated_at = COALESCE(activated_at, now()),
         updated_at = now()
   WHERE id = p_device_id;

  RETURN p_device_id;
END;
$$;

-- Edge Function helper: resolve NMI credentials for service_role only
CREATE OR REPLACE FUNCTION public.get_nmi_device_credentials(
  p_device_id uuid
) RETURNS TABLE (
  device_id uuid,
  merchant_id uuid,
  location_id uuid,
  environment text,
  provider_merchant_id text,
  provider_gateway_id text,
  provider_public_key text,
  decrypted_security_key text
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    lpd.id, lpd.merchant_id, lpd.location_id, lpd.environment,
    lpd.provider_merchant_id, lpd.provider_gateway_id, lpd.provider_public_key,
    ds.decrypted_secret
  FROM public.location_payment_devices lpd
  LEFT JOIN vault.decrypted_secrets ds ON ds.id = lpd.provider_secret_id
  WHERE lpd.id = p_device_id
    AND lpd.provider = 'nmi'
    AND lpd.status = 'active'
  LIMIT 1;

  INSERT INTO public.payment_credential_access_log (device_id, function_name, actor_user_id, metadata)
  VALUES (
    p_device_id, 'get_nmi_device_credentials',
    public.current_user_id(),
    jsonb_build_object('called_at', now())
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_nmi_device_credentials(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_nmi_device_credentials(uuid) TO service_role;

-- Storefront-safe helper: returns only public fields (Collect.js key + capabilities)
-- Safe for the Next.js storefront route to call without service role
CREATE OR REPLACE FUNCTION public.get_storefront_payment_config(
  p_location_id uuid
) RETURNS TABLE (
  device_id uuid,
  provider text,
  environment text,
  provider_public_key text,
  supports_apple_pay boolean,
  supports_google_pay boolean,
  supports_customer_vault boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT lpd.id, lpd.provider, lpd.environment, lpd.provider_public_key,
         lpd.supports_apple_pay, lpd.supports_google_pay, lpd.supports_customer_vault
  FROM public.location_payment_devices lpd
  WHERE lpd.location_id = p_location_id
    AND lpd.provider = 'nmi'
    AND lpd.status = 'active'
    AND lpd.is_active = true
    AND lpd.use_for_online_ordering = true
  LIMIT 1;
$$;
;
