-- [C3] Storefront Valor account resolver.
--
-- The storefront charge path (process-online-payment + create-online-order edge
-- functions) must find a merchant/location's active primary Valor online_order
-- account before minting a client token or charging. online_store_config has no
-- FK to merchant_processor_accounts, so resolution is by predicate — the same one
-- lib/payments/resolver.ts:selectAccount uses: only active + primary rows are
-- eligible, and a location-specific account wins over a merchant-global one
-- (location_id IS NULL). Centralised in one RPC so both edge functions share a
-- single authoritative predicate, mirroring the NMI resolution RPCs
-- (get_storefront_payment_config / get_nmi_device_credentials).
--
-- Returns identifiers only — NEVER the app key. The charge path passes account_id
-- to get_valor_account_credentials (service_role/HQ-gated) to decrypt the key at
-- point of use. has_credentials means the row is fully provisioned (app key in
-- Vault + epi + appid), so a caller can fail closed on a half-boarded account.

CREATE OR REPLACE FUNCTION public.get_storefront_valor_account(
  p_location_id uuid,
  p_merchant_id uuid
)
RETURNS TABLE (
  account_id      uuid,
  has_credentials boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    a.id,
    (a.valor_appkey_encrypted IS NOT NULL
      AND a.valor_epi IS NOT NULL
      AND a.valor_appid IS NOT NULL) AS has_credentials
  FROM public.merchant_processor_accounts a
  WHERE a.merchant_id = p_merchant_id
    AND a.processor = 'valor'
    AND a.purpose = 'online_order'
    AND a.is_active
    AND a.is_primary
    AND (a.location_id = p_location_id OR a.location_id IS NULL)
  -- Location-specific account (TRUE) ranks above a merchant-global one (FALSE).
  ORDER BY (a.location_id IS NOT DISTINCT FROM p_location_id) DESC
  LIMIT 1;
$$;

-- Server-only concern: the sole callers are the two storefront edge functions,
-- which authenticate with the service role. No merchant/HQ/anon caller needs it.
REVOKE ALL ON FUNCTION public.get_storefront_valor_account(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_storefront_valor_account(uuid, uuid) TO service_role;
