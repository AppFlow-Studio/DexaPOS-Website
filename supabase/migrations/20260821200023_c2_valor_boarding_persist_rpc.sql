-- [C2] Valor boarding persistence + app-key encryption RPCs.
--
-- PROBLEM
--   boarding.ts mints a per-EPI (appid, appkey) pair at "Generate API Keys" and
--   must persist it to merchant_processor_accounts. The app KEY is a live payment
--   credential and must never sit in a plain column — merchant_processor_accounts
--   only has `valor_appkey_encrypted`. The rest of the C2 rail (resolver.ts,
--   valor-adapter.ts) already assumes the key is decrypted by a server-only path
--   before it reaches the adapter. Nothing built that path yet.
--
-- APPROACH (mirrors the NMI precedent, 20260504123000_nmi_online_ordering_credentials)
--   The app key is stored in Supabase Vault via vault.create_secret / update_secret;
--   merchant_processor_accounts.valor_appkey_encrypted holds the vault secret UUID
--   (as text), NOT ciphertext. Two SECURITY DEFINER RPCs, both gated on
--   service_role OR is_dexapos_admin():
--
--     board_persist_valor_account(...)  — upsert one Valor online_order account for
--       a (merchant, location), vaulting the app key. This is the BoardingPersist
--       the boarding orchestration calls (through the service-role client).
--     get_valor_account_credentials(id) — return (appid, epi, decrypted_appkey) for
--       the charge path. The only way the plaintext key leaves the database.
--
--   Provisioning is deliberately NOT cutover: rows are boarded is_primary = false
--   so the resolver keeps routing to the incumbent until a separate cutover flips
--   primary. When p_is_primary is true the RPC first demotes any other active
--   primary in the same (merchant, location, online_order) scope so the
--   uq_mpa_primary_scope index can never trip.
--
-- IDEMPOTENCY
--   CREATE OR REPLACE + a stable vault secret name keyed by (merchant, location)
--   make re-boarding a clean update rather than a duplicate secret or row.

-- ============================================================================
-- PERSIST: upsert a boarded Valor online_order account, app key -> Vault
-- ============================================================================

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

  -- Vault the app key under a stable, scope-unique name so a re-board updates the
  -- same secret instead of orphaning one. 'global' stands in for a NULL location.
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

  -- Cutover guard: only one active primary may exist per (merchant, location,
  -- online_order). If this account is being made primary, demote the incumbent
  -- (e.g. the NMI row) in the same scope first.
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
    valor_appkey_encrypted,
    fee_schedule_id, disc_rate_percent, residual_bps, surcharge_percent,
    pricing_owner, is_primary, is_active
  )
  VALUES (
    p_merchant_id, p_location_id, 'valor', 'online_order',
    nullif(trim(coalesce(p_valor_merchant_id, '')), ''),
    nullif(trim(coalesce(p_valor_store_id, '')), ''),
    nullif(trim(coalesce(p_valor_epi, '')), ''),
    nullif(trim(coalesce(p_valor_appid, '')), ''),
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

-- ============================================================================
-- READ: decrypt the app key for the charge path
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_valor_account_credentials(
  p_account_id uuid
)
RETURNS TABLE (
  valor_appid       text,
  valor_epi         text,
  decrypted_appkey  text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account public.merchant_processor_accounts%rowtype;
BEGIN
  IF NOT (
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    OR public.is_dexapos_admin()
  ) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_account
  FROM public.merchant_processor_accounts a
  WHERE a.id = p_account_id
    AND a.processor = 'valor'
  LIMIT 1;

  IF v_account.id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    v_account.valor_appid,
    v_account.valor_epi,
    ds.decrypted_secret
  FROM vault.decrypted_secrets ds
  WHERE ds.id = v_account.valor_appkey_encrypted::uuid
  LIMIT 1;
END
$$;

-- ============================================================================
-- GRANTS — service role (server actions) + HQ-authenticated only
-- ============================================================================

REVOKE ALL ON FUNCTION public.board_persist_valor_account(
  uuid, uuid, text, text, text, text, text, text, numeric, integer, numeric, boolean
) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.board_persist_valor_account(
  uuid, uuid, text, text, text, text, text, text, numeric, integer, numeric, boolean
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_valor_account_credentials(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_valor_account_credentials(uuid) TO authenticated, service_role;
