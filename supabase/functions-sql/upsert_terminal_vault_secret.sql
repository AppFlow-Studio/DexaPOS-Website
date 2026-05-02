-- ============================================================================
-- Function: upsert_terminal_vault_secret  (A2)
-- Purpose : Write path helper — vaults a terminal auth_key and stores the
--           returned secret UUID back onto payment_terminals.auth_key_secret_id.
--           Called by TypeScript server actions after every INSERT / UPDATE
--           that changes the auth_key.
--
-- Deploy  : Run in Supabase dashboard SQL editor (staging → prod).
--           Do NOT push through supabase db push.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.upsert_terminal_vault_secret(
  p_terminal_id uuid,
  p_auth_key    text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_merchant_id uuid;
  v_secret_id   uuid;
  v_secret_name text;
BEGIN
  -- Fetch terminal ownership (also confirms it exists)
  SELECT merchant_id, auth_key_secret_id
  INTO   v_merchant_id, v_secret_id
  FROM   public.payment_terminals
  WHERE  id = p_terminal_id;

  IF v_merchant_id IS NULL THEN
    RAISE EXCEPTION 'Terminal % not found', p_terminal_id
      USING ERRCODE = '02000';
  END IF;

  -- Authorization: merchant admin or Dexa HQ only
  IF NOT (public.is_merchant_admin(v_merchant_id) OR public.is_dexapos_admin()) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  v_secret_name := format('terminal_auth_key:%s', p_terminal_id);

  -- If no pointer stored yet, check vault by name (handles edge cases / re-runs)
  IF v_secret_id IS NULL THEN
    SELECT id INTO v_secret_id
    FROM   vault.secrets
    WHERE  name = v_secret_name
    LIMIT  1;
  END IF;

  IF v_secret_id IS NULL THEN
    v_secret_id := vault.create_secret(
      p_auth_key,
      v_secret_name,
      'Dejavoo auth_key for terminal ' || p_terminal_id
    );
  ELSE
    PERFORM vault.update_secret(v_secret_id, p_auth_key);
  END IF;

  -- Write pointer back to the row
  UPDATE public.payment_terminals
  SET    auth_key_secret_id = v_secret_id
  WHERE  id = p_terminal_id;

  RETURN v_secret_id;
END;
$$;

REVOKE ALL    ON FUNCTION public.upsert_terminal_vault_secret(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.upsert_terminal_vault_secret(uuid, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.upsert_terminal_vault_secret(uuid, text) TO service_role;
