-- ============================================================================
-- Function: get_payment_terminal_credentials  (A4)
-- Purpose : Read path — returns the decrypted auth_key for a terminal.
--           SECURITY DEFINER so it can read vault.decrypted_secrets.
--           REVOKE EXECUTE FROM anon for defense-in-depth.
--           Only merchant admins and Dexa HQ can call this.
--
-- Deploy  : Run in Supabase dashboard SQL editor (staging → prod).
--           Do NOT push through supabase db push.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_payment_terminal_credentials(
  p_terminal_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_merchant_id uuid;
  v_secret_id   uuid;
  v_decrypted   text;
BEGIN
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

  IF v_secret_id IS NULL THEN
    RAISE EXCEPTION 'Terminal % has no vaulted credential — run vault migration first', p_terminal_id
      USING ERRCODE = 'P0001';
  END IF;

  SELECT decrypted_secret INTO v_decrypted
  FROM   vault.decrypted_secrets
  WHERE  id = v_secret_id;

  RETURN v_decrypted;
END;
$$;

REVOKE ALL     ON FUNCTION public.get_payment_terminal_credentials(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_payment_terminal_credentials(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_payment_terminal_credentials(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_payment_terminal_credentials(uuid) TO service_role;
