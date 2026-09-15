-- Dynamic Valor acquirer profiles — per-merchant (optionally per-location) MID entry.
--
-- PROBLEM
--   Boarding read the acquirer MID/TID block from ONE static env var
--   (VALOR_BOARDING_PROCESSOR_DATA). `mid1` is the TSYS merchant number that
--   identifies the settlement DDA, so every merchant boarded in production would
--   settle to the SAME bank account. We run the traditional ISO model, where each
--   merchant is underwritten with its OWN MID. The per-merchant identifiers
--   (mid1/vNumber1/storeNo1/termNo1) must therefore be captured per merchant; the
--   rest of the block (BIN/agent/agentBank/… ) is ISO-level and stays in env.
--
-- APPROACH (mirrors board_persist_valor_account, 20260821200023)
--   A `valor_acquirer_profiles` table holds one row per (merchant, location);
--   location_id NULL means "applies to all locations" (the default "same MID for
--   all" case). The two genuinely-sensitive identifiers — MID and V-Number — go to
--   Supabase Vault; the table stores the vault secret UUIDs plus last-4 for masked
--   display. store_no / term_no are not secret and are stored plain.
--
--   Two SECURITY DEFINER RPCs, both gated on service_role OR is_dexapos_admin():
--     save_valor_acquirer_profile(...)  — upsert one profile, vaulting mid + vnumber.
--     get_valor_acquirer_secrets(...)   — decrypt mid/vnumber for the boarding path,
--       falling back to the merchant-wide (NULL location) row.

-- ============================================================================
-- TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.valor_acquirer_profiles (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  merchant_id       uuid NOT NULL,
  location_id       uuid,                       -- NULL = applies to all locations
  mid_secret_id     uuid NOT NULL,              -- vault pointer (full MID)
  vnumber_secret_id uuid NOT NULL,              -- vault pointer (full V-Number)
  mid_last_four     text NOT NULL,
  vnumber_last_four text,
  store_no          text NOT NULL,
  term_no           text NOT NULL,
  status            text NOT NULL DEFAULT 'ready'
                      CHECK (status = ANY (ARRAY['draft'::text, 'ready'::text])),
  created_at        timestamp with time zone NOT NULL DEFAULT now(),
  updated_at        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT valor_acquirer_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT valor_acquirer_profiles_scope_key
    UNIQUE NULLS NOT DISTINCT (merchant_id, location_id),
  CONSTRAINT valor_acquirer_profiles_merchant_id_fkey
    FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE,
  CONSTRAINT valor_acquirer_profiles_location_id_fkey
    FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_valor_acquirer_profiles_merchant
  ON public.valor_acquirer_profiles (merchant_id);

DROP TRIGGER IF EXISTS set_valor_acquirer_profiles_updated_at
  ON public.valor_acquirer_profiles;
CREATE TRIGGER set_valor_acquirer_profiles_updated_at
  BEFORE UPDATE ON public.valor_acquirer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- RLS — HQ admin read only; writes go through the SECURITY DEFINER RPC below.
-- ============================================================================

ALTER TABLE public.valor_acquirer_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "HQ admins can read Valor acquirer profiles"
  ON public.valor_acquirer_profiles;
CREATE POLICY "HQ admins can read Valor acquirer profiles"
  ON public.valor_acquirer_profiles
  FOR SELECT
  USING (public.is_dexapos_admin());

-- ============================================================================
-- SAVE: upsert a profile, MID + V-Number -> Vault
-- ============================================================================

CREATE OR REPLACE FUNCTION public.save_valor_acquirer_profile(
  p_merchant_id uuid,
  p_location_id uuid,
  p_mid         text,
  p_vnumber     text,
  p_store_no    text,
  p_term_no     text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_mid       text := nullif(trim(coalesce(p_mid, '')), '');
  v_vnumber   text := nullif(trim(coalesce(p_vnumber, '')), '');
  v_store_no  text := nullif(trim(coalesce(p_store_no, '')), '');
  v_term_no   text := nullif(trim(coalesce(p_term_no, '')), '');
  v_scope     text := coalesce(p_location_id::text, 'global');
  v_mid_name  text;
  v_vnum_name text;
  v_mid_sid   uuid;
  v_vnum_sid  uuid;
  v_id        uuid;
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
  IF v_mid IS NULL THEN
    RAISE EXCEPTION 'MID is required' USING ERRCODE = '22023';
  END IF;
  IF v_vnumber IS NULL THEN
    RAISE EXCEPTION 'V-Number is required' USING ERRCODE = '22023';
  END IF;
  IF v_store_no IS NULL THEN
    RAISE EXCEPTION 'Store number is required' USING ERRCODE = '22023';
  END IF;
  IF v_term_no IS NULL THEN
    RAISE EXCEPTION 'Terminal number is required' USING ERRCODE = '22023';
  END IF;

  v_mid_name  := format('valor_acq_mid:%s:%s', p_merchant_id, v_scope);
  v_vnum_name := format('valor_acq_vnum:%s:%s', p_merchant_id, v_scope);

  -- MID -> vault (stable name so a re-save updates the same secret)
  SELECT s.id INTO v_mid_sid FROM vault.secrets s WHERE s.name = v_mid_name LIMIT 1;
  IF v_mid_sid IS NULL THEN
    v_mid_sid := vault.create_secret(v_mid, v_mid_name,
      'Valor MID for merchant ' || p_merchant_id || ' location ' || v_scope);
  ELSE
    PERFORM vault.update_secret(v_mid_sid, v_mid);
  END IF;

  -- V-Number -> vault
  SELECT s.id INTO v_vnum_sid FROM vault.secrets s WHERE s.name = v_vnum_name LIMIT 1;
  IF v_vnum_sid IS NULL THEN
    v_vnum_sid := vault.create_secret(v_vnumber, v_vnum_name,
      'Valor V-Number for merchant ' || p_merchant_id || ' location ' || v_scope);
  ELSE
    PERFORM vault.update_secret(v_vnum_sid, v_vnumber);
  END IF;

  INSERT INTO public.valor_acquirer_profiles (
    merchant_id, location_id, mid_secret_id, vnumber_secret_id,
    mid_last_four, vnumber_last_four, store_no, term_no, status
  )
  VALUES (
    p_merchant_id, p_location_id, v_mid_sid, v_vnum_sid,
    right(v_mid, 4), right(v_vnumber, 4), v_store_no, v_term_no, 'ready'
  )
  ON CONFLICT (merchant_id, location_id)
  DO UPDATE SET
    mid_secret_id     = excluded.mid_secret_id,
    vnumber_secret_id = excluded.vnumber_secret_id,
    mid_last_four     = excluded.mid_last_four,
    vnumber_last_four = excluded.vnumber_last_four,
    store_no          = excluded.store_no,
    term_no           = excluded.term_no,
    status            = 'ready',
    updated_at        = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END
$$;

-- ============================================================================
-- READ: decrypt MID + V-Number for the boarding path (NULL-location fallback)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_valor_acquirer_secrets(
  p_merchant_id uuid,
  p_location_id uuid
)
RETURNS TABLE (
  mid      text,
  vnumber  text,
  store_no text,
  term_no  text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.valor_acquirer_profiles%rowtype;
BEGIN
  IF NOT (
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    OR public.is_dexapos_admin()
  ) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Prefer the exact per-location row; fall back to the merchant-wide (NULL) row.
  SELECT * INTO v_row
  FROM public.valor_acquirer_profiles a
  WHERE a.merchant_id = p_merchant_id
    AND a.location_id IS NOT DISTINCT FROM p_location_id
  LIMIT 1;

  IF v_row.id IS NULL AND p_location_id IS NOT NULL THEN
    SELECT * INTO v_row
    FROM public.valor_acquirer_profiles a
    WHERE a.merchant_id = p_merchant_id
      AND a.location_id IS NULL
    LIMIT 1;
  END IF;

  IF v_row.id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    (SELECT ds.decrypted_secret FROM vault.decrypted_secrets ds WHERE ds.id = v_row.mid_secret_id LIMIT 1),
    (SELECT ds.decrypted_secret FROM vault.decrypted_secrets ds WHERE ds.id = v_row.vnumber_secret_id LIMIT 1),
    v_row.store_no,
    v_row.term_no;
END
$$;

-- ============================================================================
-- GRANTS — service role (server actions) + HQ-authenticated only
-- ============================================================================

REVOKE ALL ON FUNCTION public.save_valor_acquirer_profile(uuid, uuid, text, text, text, text)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.save_valor_acquirer_profile(uuid, uuid, text, text, text, text)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_valor_acquirer_secrets(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_valor_acquirer_secrets(uuid, uuid)
  TO authenticated, service_role;
