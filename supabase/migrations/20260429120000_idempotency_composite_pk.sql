-- =====================================================================
-- Migration: idempotency_keys composite (key, op) PRIMARY KEY
-- =====================================================================
-- Bad-WiFi Phase 2 Wave 3.0c. Closes the latent cross-op cache pollution
-- hazard documented in __tests__/idempotencyInsertDelete.test.ts:392-467.
--
-- Before: PRIMARY KEY (key) — `_idempotency_claim`'s
--   `INSERT ... ON CONFLICT (key) DO NOTHING` means a second call with the
--   same UUID under a DIFFERENT `op` name silently receives the first
--   call's cached result. Latent today (clients namespace keys per op),
--   but a runtime invariant rather than a schema-level guarantee.
-- After: PRIMARY KEY (key, op) — same UUID under different op names
--   yields distinct cache rows; each op executes its own body.
--
-- ---------------------------------------------------------------------
-- TRUNCATE caveat for row-append RPCs
-- ---------------------------------------------------------------------
-- This migration TRUNCATEs `idempotency_keys` before swapping the PK.
-- Row-append RPCs deployed today (`add_order_item_v3`, `add_open_item_v3`)
-- can double-insert if a body completes after TRUNCATE: the claim row is
-- gone, so `_idempotency_complete`'s UPDATE matches 0 rows silently, the
-- result is uncached, and a retry inserts a duplicate row.
--
-- Mitigation: pause the offline sync queue during the apply window OR run
-- during a documented quiet window (e.g. post-midnight). Operators must
-- internalize this — see the Wave 3.0c plan's Operator Runbook.
--
-- Assignment-style RPCs (`update_order_item_quantity_v3`, etc.) are
-- unaffected; the worst case is a transient retry.
--
-- ---------------------------------------------------------------------
-- Function-level edits (surgical, deployed bodies preserved otherwise)
-- ---------------------------------------------------------------------
-- `_idempotency_claim`:
--   - INSERT ... ON CONFLICT (key) → ON CONFLICT (key, op)
--   - SELECT ... WHERE key = p_key → WHERE key = p_key AND op = p_op
--   - Stale-takeover UPDATE WHERE key = p_key → AND op = p_op
--   - NEW: empty-record guard at top of IF NOT FOUND branch (defends
--     against concurrent oversize-complete deletion between INSERT and
--     SELECT — caught by senior backend reviewer)
--
-- `_idempotency_complete`:
--   - Oversize-branch DELETE WHERE key = p_key → AND op = p_op
--
-- Function signatures unchanged. RLS unchanged. GRANT preserved by
-- CREATE OR REPLACE; we re-issue REVOKE for parity with the original
-- layer migration.
--
-- Apply target: staging (`dfwqakoyittmrwbqvxgw`) first. Production
-- (`hifouuofcaytijrkbvcy`) requires separate explicit user approval after
-- 48h staging soak. Wave 3.0a has not yet shipped to prod.
--
-- Rollback: 20260429120100_idempotency_composite_pk_rollback.sql
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. TRUNCATE to clear the table for PK swap.
--    pg_cron purges this table daily; the data window is at most 24h.
-- ---------------------------------------------------------------------
TRUNCATE TABLE public.idempotency_keys;

-- ---------------------------------------------------------------------
-- 2. Swap the PK from (key) to (key, op).
--    AccessExclusiveLock; sub-second on a TRUNCATEd table.
-- ---------------------------------------------------------------------
ALTER TABLE public.idempotency_keys DROP CONSTRAINT idempotency_keys_pkey;
ALTER TABLE public.idempotency_keys ADD PRIMARY KEY (key, op);

-- ---------------------------------------------------------------------
-- 3. Replace _idempotency_claim with composite-aware body.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._idempotency_claim(p_key uuid, p_op text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing RECORD;
BEGIN
  INSERT INTO public.idempotency_keys (key, op, result_json, status)
  VALUES (p_key, p_op, NULL, 'claimed')
  ON CONFLICT (key, op) DO NOTHING;

  IF NOT FOUND THEN
    SELECT result_json, status, created_at INTO v_existing
    FROM public.idempotency_keys WHERE key = p_key AND op = p_op;

    -- Defensive guard: a concurrent oversize _idempotency_complete may
    -- delete the (key, op) row between the INSERT above and this SELECT.
    -- If v_existing is NULL (no row found) the IF/ELSIF/ELSE chain below
    -- would fall through with NULL comparisons. Treat as "claim now".
    IF v_existing IS NULL THEN
      RETURN NULL;
    END IF;

    IF v_existing.status = 'completed' THEN
      RETURN v_existing.result_json;
    ELSIF v_existing.status = 'claimed' AND v_existing.created_at > now() - INTERVAL '60 seconds' THEN
      RAISE EXCEPTION 'idempotency_in_flight: key %', p_key
        USING ERRCODE = 'serialization_failure';
    ELSIF v_existing.status = 'claimed' THEN
      -- Stale claim (>60s, assume crashed). Refresh timestamp and let caller take over.
      UPDATE public.idempotency_keys
      SET created_at = now()
      WHERE key = p_key AND op = p_op;
      RETURN NULL;
    ELSE
      RETURN v_existing.result_json;
    END IF;
  END IF;

  RETURN NULL;
END;
$function$;

-- ---------------------------------------------------------------------
-- 4. Replace _idempotency_complete with op-scoped oversize delete.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._idempotency_complete(p_key uuid, p_op text, p_result jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Cap result at 32KB. Oversize → delete the (key, op) row to force
  -- re-execute on retry, which is safer than caching a truncated result.
  IF octet_length(p_result::text) > 32768 THEN
    DELETE FROM public.idempotency_keys WHERE key = p_key AND op = p_op;
    RETURN;
  END IF;

  UPDATE public.idempotency_keys
  SET result_json = p_result,
      status = 'completed',
      completed_at = now()
  WHERE key = p_key AND op = p_op;
END;
$function$;

-- ---------------------------------------------------------------------
-- 5. Re-issue REVOKE ALL for parity with the original layer migration.
--    CREATE OR REPLACE preserves grants, but re-REVOKE is defensive.
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public._idempotency_claim(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._idempotency_complete(uuid, text, jsonb) FROM PUBLIC;

-- ---------------------------------------------------------------------
-- 6. Refresh COMMENTs to reflect composite-key semantics.
-- ---------------------------------------------------------------------
COMMENT ON TABLE public.idempotency_keys IS
  'At-most-once execution ledger for Category B RPCs (bad-WiFi Phase 2). PRIMARY KEY (key, op) — distinct ops with the same UUID get distinct cache rows. Purged daily by pg_cron after 24h.';
COMMENT ON FUNCTION public._idempotency_claim IS
  'Atomic claim-then-record helper, scoped to (key, op). Returns cached result if completed, raises serialization_failure if in-flight (<60s) for the same (key, op), takes over stale claim (>60s).';
COMMENT ON FUNCTION public._idempotency_complete IS
  'Stores RPC result against a claimed (key, op) pair. Refuses to cache results >32KB (deletes that pair''s row instead).';

COMMIT;

-- =====================================================================
-- Smoke (run on staging after apply):
--   DO $$
--   DECLARE k uuid := gen_random_uuid(); v jsonb;
--   BEGIN
--     -- same key, same op → cached
--     PERFORM public._idempotency_claim(k, 'rpc_a');
--     PERFORM public._idempotency_complete(k, 'rpc_a', '{"src":"a"}'::jsonb);
--     v := public._idempotency_claim(k, 'rpc_a');
--     ASSERT v::text = '{"src": "a"}', 'expected cached result for rpc_a';
--
--     -- same key, DIFFERENT op → executes (THE FIX)
--     v := public._idempotency_claim(k, 'rpc_b');
--     ASSERT v IS NULL, 'expected NULL — composite PK should NOT see rpc_a row';
--     PERFORM public._idempotency_complete(k, 'rpc_b', '{"src":"b"}'::jsonb);
--     ASSERT (SELECT count(*) FROM public.idempotency_keys WHERE key = k) = 2,
--       'expected 2 distinct (key, op) rows';
--
--     DELETE FROM public.idempotency_keys WHERE key = k;
--   END $$;
-- =====================================================================
