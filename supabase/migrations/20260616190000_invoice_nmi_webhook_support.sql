BEGIN;

ALTER TABLE public.platform_billing_provider_configs
  ADD COLUMN IF NOT EXISTS webhook_secret_id uuid;

COMMENT ON COLUMN public.platform_billing_provider_configs.webhook_secret_id IS
  'Vault secret id for the Dexa Billing NMI webhook signing key.';

CREATE OR REPLACE FUNCTION public.get_platform_billing_provider_payment_secrets(
  p_provider text DEFAULT 'nmi'
)
RETURNS TABLE (
  config_id uuid,
  provider text,
  label text,
  tokenization_key text,
  decrypted_private_api_key text,
  decrypted_webhook_secret text,
  is_active boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINERa
SET search_path = ''
AS $$
DECLARE
  v_config public.platform_billing_provider_configs%ROWTYPE;
BEGIN
  IF NOT (
    COALESCE(auth.jwt()->>'role', '') = 'service_role'
    OR public.is_dexapos_admin()
  ) THEN
    RAISE EXCEPTION 'Unauthorized'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_config
  FROM public.platform_billing_provider_configs cfg
  WHERE cfg.provider = COALESCE(NULLIF(TRIM(p_provider), ''), 'nmi')
    AND cfg.is_active = true
  LIMIT 1;

  IF v_config.id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    v_config.id,
    v_config.provider,
    v_config.label,
    v_config.tokenization_key,
    api_secret.decrypted_secret,
    webhook_secret.decrypted_secret,
    v_config.is_active
  FROM vault.decrypted_secrets api_secret
  LEFT JOIN vault.decrypted_secrets webhook_secret
    ON webhook_secret.id = v_config.webhook_secret_id
  WHERE api_secret.id = v_config.private_api_key_secret_id
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_platform_billing_provider_webhook_secret(
  p_provider text DEFAULT 'nmi',
  p_webhook_secret text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_config public.platform_billing_provider_configs%ROWTYPE;
  v_secret_id uuid;
  v_provider text := COALESCE(NULLIF(TRIM(p_provider), ''), 'nmi');
  v_webhook_secret text := NULLIF(TRIM(COALESCE(p_webhook_secret, '')), '');
BEGIN
  IF NOT (
    COALESCE(auth.jwt()->>'role', '') = 'service_role'
    OR public.is_dexapos_admin()
  ) THEN
    RAISE EXCEPTION 'Unauthorized'
      USING ERRCODE = '42501';
  END IF;

  IF v_provider <> 'nmi' THEN
    RAISE EXCEPTION 'Unsupported payment provider: %', v_provider
      USING ERRCODE = '22023';
  END IF;

  IF v_webhook_secret IS NULL THEN
    RAISE EXCEPTION 'Webhook secret is required'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_config
  FROM public.platform_billing_provider_configs cfg
  WHERE cfg.provider = v_provider
  LIMIT 1;

  IF v_config.id IS NULL THEN
    RAISE EXCEPTION 'Platform billing config not found for provider %', v_provider
      USING ERRCODE = '22023';
  END IF;

  IF v_config.webhook_secret_id IS NOT NULL THEN
    PERFORM vault.update_secret(v_config.webhook_secret_id, v_webhook_secret);
    v_secret_id := v_config.webhook_secret_id;
  ELSE
    v_secret_id := vault.create_secret(
      v_webhook_secret,
      FORMAT('platform_billing_webhook_secret:%s', v_provider),
      'NMI webhook HMAC secret for Dexa platform billing rail'
    );
  END IF;

  UPDATE public.platform_billing_provider_configs
     SET webhook_secret_id = v_secret_id,
         updated_at = now()
   WHERE id = v_config.id;

  RETURN v_config.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_nmi_device_payment_secrets(
  p_device_id uuid
)
RETURNS TABLE (
  device_id uuid,
  merchant_id uuid,
  location_id uuid,
  environment text,
  provider_merchant_id text,
  provider_gateway_id text,
  provider_public_key text,
  decrypted_security_key text,
  decrypted_webhook_secret text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    lpd.id,
    lpd.merchant_id,
    lpd.location_id,
    lpd.environment,
    lpd.provider_merchant_id,
    lpd.provider_gateway_id,
    lpd.provider_public_key,
    api_secret.decrypted_secret,
    webhook_secret.decrypted_secret
  FROM public.location_payment_devices lpd
  LEFT JOIN vault.decrypted_secrets api_secret
    ON api_secret.id = lpd.provider_secret_id
  LEFT JOIN vault.decrypted_secrets webhook_secret
    ON webhook_secret.id = lpd.webhook_secret_id
  WHERE lpd.id = p_device_id
    AND lpd.provider = 'nmi'
    AND lpd.status = 'active'
  LIMIT 1;

  INSERT INTO public.payment_credential_access_log (
    device_id,
    function_name,
    actor_user_id,
    metadata
  )
  VALUES (
    p_device_id,
    'get_nmi_device_payment_secrets',
    public.current_user_id(),
    jsonb_build_object('called_at', now())
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_nmi_payment_device_webhook_secret(
  p_device_id uuid,
  p_webhook_secret text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_device public.location_payment_devices%ROWTYPE;
  v_webhook_secret_id uuid;
  v_webhook_secret text := NULLIF(TRIM(COALESCE(p_webhook_secret, '')), '');
BEGIN
  SELECT * INTO v_device
  FROM public.location_payment_devices
  WHERE id = p_device_id;

  IF v_device.id IS NULL THEN
    RAISE EXCEPTION 'Device % not found', p_device_id
      USING ERRCODE = '42501';
  END IF;

  IF v_device.provider != 'nmi' THEN
    RAISE EXCEPTION 'Device % is not an NMI device', p_device_id
      USING ERRCODE = '22023';
  END IF;

  IF NOT (
    public.is_dexapos_admin()
    OR v_device.carrier_id = public.get_my_carrier_id()
  ) THEN
    RAISE EXCEPTION 'Unauthorized: only HQ or owning carrier can update NMI webhook secrets'
      USING ERRCODE = '42501';
  END IF;

  IF v_webhook_secret IS NULL THEN
    RAISE EXCEPTION 'webhook_secret is required'
      USING ERRCODE = '22023';
  END IF;

  IF v_device.webhook_secret_id IS NOT NULL THEN
    PERFORM vault.update_secret(v_device.webhook_secret_id, v_webhook_secret);
    v_webhook_secret_id := v_device.webhook_secret_id;
  ELSE
    v_webhook_secret_id := vault.create_secret(
      v_webhook_secret,
      FORMAT('nmi_webhook_secret:%s', p_device_id),
      FORMAT('NMI webhook HMAC secret for device %s', p_device_id)
    );
  END IF;

  UPDATE public.location_payment_devices
     SET webhook_secret_id = v_webhook_secret_id,
         updated_at = now()
   WHERE id = p_device_id;

  RETURN p_device_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_platform_billing_provider_payment_secrets(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_platform_billing_provider_payment_secrets(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.set_platform_billing_provider_webhook_secret(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_platform_billing_provider_webhook_secret(text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_nmi_device_payment_secrets(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_nmi_device_payment_secrets(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.set_nmi_payment_device_webhook_secret(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_nmi_payment_device_webhook_secret(uuid, text) TO authenticated, service_role;

COMMIT;
