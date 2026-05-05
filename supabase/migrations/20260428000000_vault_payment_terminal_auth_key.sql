-- ============================================================================
-- Migration: 20260428000000_vault_payment_terminal_auth_key.sql
-- Workstream A — Credential Vault for payment_terminals.auth_key
--
-- A1: Add auth_key_secret_id uuid column (nullable, pointer to vault.secrets)
-- A3: Backfill the 3 existing rows — read plaintext → vault → write UUID back
--
-- NOTE: SQL functions (get_payment_terminal_credentials,
-- upsert_terminal_vault_secret) are deployed separately via the Supabase
-- dashboard SQL editor per project convention. See supabase/functions-sql/.
-- ============================================================================

-- A1 ── Add vault secret pointer column
ALTER TABLE public.payment_terminals
  ADD COLUMN IF NOT EXISTS auth_key_secret_id uuid;
-- A3 ── Backfill existing rows into vault (idempotent — safe to re-run)
DO $$
DECLARE
  v_terminal    record;
  v_secret_id   uuid;
  v_secret_name text;
BEGIN
  FOR v_terminal IN
    SELECT id, auth_key
    FROM public.payment_terminals
    WHERE auth_key IS NOT NULL
      AND auth_key_secret_id IS NULL
  LOOP
    v_secret_name := format('terminal_auth_key:%s', v_terminal.id);

    -- Check if secret already exists in vault (handles re-runs)
    SELECT id INTO v_secret_id
    FROM vault.secrets
    WHERE name = v_secret_name
    LIMIT 1;

    IF v_secret_id IS NULL THEN
      v_secret_id := vault.create_secret(
        v_terminal.auth_key,
        v_secret_name,
        'Dejavoo auth_key for terminal ' || v_terminal.id
      );
    ELSE
      PERFORM vault.update_secret(v_secret_id, v_terminal.auth_key);
    END IF;

    UPDATE public.payment_terminals
    SET auth_key_secret_id = v_secret_id
    WHERE id = v_terminal.id;

  END LOOP;
END $$;
