-- [C2] Re-provisioning support: persist Valor's newUserId so additional stores can
-- be added to an already-boarded merchant (/createStore requires mp_id + newUserId).

ALTER TABLE public.merchant_processor_accounts
  ADD COLUMN IF NOT EXISTS valor_new_user_id text;

-- Signature changes (new param), so drop the old overload before recreating.
DROP FUNCTION IF EXISTS public.board_persist_valor_account(
  uuid, uuid, text, text, text, text, text, text, numeric, integer, numeric, boolean
);

CREATE OR REPLACE FUNCTION public.board_persist_valor_account(
  p_merchant_id       uuid,
  p_location_id       uuid,
  p_valor_merchant_id text,
  p_valor_store_id    text,
  p_valor_epi         text,
  p_valor_appid       text,
  p_valor_appkey      text,
  p_fee_schedule_id   text,
  p_disc_rate_percent numeric,
  p_residual_bps      integer,
  p_surcharge_percent numeric,
  p_valor_new_user_id text DEFAULT NULL,
  p_is_primary        boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret_name text;
  v_secret_id   uuid;
  v_account_id  uuid;
  v_appkey      text := nullif(trim(coalesce(p_valor_appkey, '')), '');
BEGIN
  IF NOT (
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    OR public.is_dexapos_admin()
  ) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_merchant_id IS NULL THEN
    RAISE EXCEPTION 'merchant_id is required' USING ERRCODE = '22023';
  END IF;
  IF v_appkey IS NULL THEN
    RAISE EXCEPTION 'Valor app key is required' USING ERRCODE = '22023';
  END IF;
  IF nullif(trim(coalesce(p_valor_appid, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Valor app id is required' USING ERRCODE = '22023';
  END IF;

  v_secret_name := format(
    'valor_appkey:%s:%s',
    p_merchant_id,
    coalesce(p_location_id::text, 'global')
  );

  SELECT s.id INTO v_secret_id
  FROM vault.secrets s
  WHERE s.name = v_secret_name
  LIMIT 1;

  IF v_secret_id IS NULL THEN
    v_secret_id := vault.create_secret(
      v_appkey,
      v_secret_name,
      'Valor app key for merchant ' || p_merchant_id ||
        ' location ' || coalesce(p_location_id::text, 'global')
    );
  ELSE
    PERFORM vault.update_secret(v_secret_id, v_appkey);
  END IF;

  IF p_is_primary THEN
    UPDATE public.merchant_processor_accounts
       SET is_primary = false,
           updated_at = now()
     WHERE merchant_id = p_merchant_id
       AND location_id IS NOT DISTINCT FROM p_location_id
       AND purpose = 'online_order'
       AND is_active
       AND is_primary
       AND processor <> 'valor';
  END IF;

  INSERT INTO public.merchant_processor_accounts (
    merchant_id, location_id, processor, purpose,
    valor_merchant_id, valor_store_id, valor_epi, valor_appid,
    valor_new_user_id, valor_appkey_encrypted,
    fee_schedule_id, disc_rate_percent, residual_bps, surcharge_percent,
    pricing_owner, is_primary, is_active
  )
  VALUES (
    p_merchant_id, p_location_id, 'valor', 'online_order',
    nullif(trim(coalesce(p_valor_merchant_id, '')), ''),
    nullif(trim(coalesce(p_valor_store_id, '')), ''),
    nullif(trim(coalesce(p_valor_epi, '')), ''),
    nullif(trim(coalesce(p_valor_appid, '')), ''),
    nullif(trim(coalesce(p_valor_new_user_id, '')), ''),
    v_secret_id::text,
    nullif(trim(coalesce(p_fee_schedule_id, '')), ''),
    p_disc_rate_percent, p_residual_bps, p_surcharge_percent,
    'dexa', coalesce(p_is_primary, false), true
  )
  ON CONFLICT (merchant_id, location_id, processor, purpose)
  DO UPDATE SET
    valor_merchant_id      = excluded.valor_merchant_id,
    valor_store_id         = excluded.valor_store_id,
    valor_epi              = excluded.valor_epi,
    valor_appid            = excluded.valor_appid,
    valor_new_user_id      = excluded.valor_new_user_id,
    valor_appkey_encrypted = excluded.valor_appkey_encrypted,
    fee_schedule_id        = excluded.fee_schedule_id,
    disc_rate_percent      = excluded.disc_rate_percent,
    residual_bps           = excluded.residual_bps,
    surcharge_percent      = excluded.surcharge_percent,
    is_primary             = excluded.is_primary,
    is_active              = true,
    updated_at             = now()
  RETURNING id INTO v_account_id;

  RETURN v_account_id;
END
$$;

REVOKE ALL ON FUNCTION public.board_persist_valor_account(
  uuid, uuid, text, text, text, text, text, text, numeric, integer, numeric, text, boolean
) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.board_persist_valor_account(
  uuid, uuid, text, text, text, text, text, text, numeric, integer, numeric, text, boolean
) TO authenticated, service_role;
