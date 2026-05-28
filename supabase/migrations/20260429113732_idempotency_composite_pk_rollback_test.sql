-- ROLLBACK TEST — Wave 3.0c. Restores single-PK + prior helper bodies.
-- Will be RE-APPLIED in the next step to leave staging on the composite PK.

TRUNCATE TABLE public.idempotency_keys;
ALTER TABLE public.idempotency_keys DROP CONSTRAINT idempotency_keys_pkey;
ALTER TABLE public.idempotency_keys ADD PRIMARY KEY (key);
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
  ON CONFLICT (key) DO NOTHING;

  IF NOT FOUND THEN
    SELECT result_json, status, created_at INTO v_existing
    FROM public.idempotency_keys WHERE key = p_key;

    IF v_existing.status = 'completed' THEN
      RETURN v_existing.result_json;
    ELSIF v_existing.status = 'claimed' AND v_existing.created_at > now() - INTERVAL '60 seconds' THEN
      RAISE EXCEPTION 'idempotency_in_flight: key %', p_key
        USING ERRCODE = 'serialization_failure';
    ELSIF v_existing.status = 'claimed' THEN
      UPDATE public.idempotency_keys SET created_at = now() WHERE key = p_key;
      RETURN NULL;
    ELSE
      RETURN v_existing.result_json;
    END IF;
  END IF;
  RETURN NULL;
END;
$function$;
CREATE OR REPLACE FUNCTION public._idempotency_complete(p_key uuid, p_op text, p_result jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF octet_length(p_result::text) > 32768 THEN
    DELETE FROM public.idempotency_keys WHERE key = p_key;
    RETURN;
  END IF;
  UPDATE public.idempotency_keys
  SET result_json = p_result, status = 'completed', completed_at = now()
  WHERE key = p_key AND op = p_op;
END;
$function$;
REVOKE ALL ON FUNCTION public._idempotency_claim(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._idempotency_complete(uuid, text, jsonb) FROM PUBLIC;
COMMENT ON TABLE public.idempotency_keys IS
  'At-most-once execution ledger for Category B RPCs (bad-WiFi Phase 2). Purged daily by pg_cron after 24h.';
COMMENT ON FUNCTION public._idempotency_claim IS
  'Atomic claim-then-record helper. Returns cached result if completed, raises serialization_failure if in-flight (<60s), takes over stale claim (>60s).';
COMMENT ON FUNCTION public._idempotency_complete IS
  'Stores RPC result against a claimed key. Refuses to cache results >32KB (deletes the row instead).';
