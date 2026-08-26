-- ============================================================================
-- settlement_attempts — per-attempt observability for POS-driven settlements.
-- ----------------------------------------------------------------------------
-- Successful settles land in settlement_batches + audit_logs, and finalize
-- OUTCOMES are audited by trg_audit_settlement_batch_transition. But a settle
-- that fails BEFORE a batch reaches an outcome — prepare raised (no payments /
-- in-flight), or the tablet couldn't reach the terminal, or finalize was never
-- called — leaves no durable record. This table captures every attempt phase so
-- the full lifecycle is auditable in SQL (mirrors the Valor request-log idea).
--
-- Written by the POS tablet via log_settlement_attempt() at each phase. The
-- Castles/Valor settle RPCs are unchanged.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.settlement_attempts (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_terminal_id  uuid NOT NULL REFERENCES public.payment_terminals(id) ON DELETE CASCADE,
    merchant_id          uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    location_id          uuid REFERENCES public.locations(id) ON DELETE SET NULL,
    settlement_batch_id  uuid REFERENCES public.settlement_batches(id) ON DELETE SET NULL,
    processor            text,   -- 'castles' | 'valor' | 'dejavoo'
    origin               text,   -- 'pos_auto' | 'pos_manual'
    phase                text NOT NULL CHECK (phase IN ('prepare','terminal_command','finalize')),
    outcome              text NOT NULL CHECK (outcome IN ('started','success','failed','timeout','blocked')),
    detail               text,
    initiated_by         text,
    created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settlement_attempts_terminal_time
    ON public.settlement_attempts (payment_terminal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_settlement_attempts_batch
    ON public.settlement_attempts (settlement_batch_id) WHERE settlement_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_settlement_attempts_merchant_time
    ON public.settlement_attempts (merchant_id, created_at DESC);

ALTER TABLE public.settlement_attempts ENABLE ROW LEVEL SECURITY;

-- Reads: merchant admins of the row's merchant, or Dexa HQ admins. Writes go
-- through the SECURITY DEFINER RPC only (no direct INSERT policy).
DROP POLICY IF EXISTS "view settlement attempts" ON public.settlement_attempts;
CREATE POLICY "view settlement attempts" ON public.settlement_attempts
    FOR SELECT USING (
        public.is_merchant_admin(merchant_id) OR public.is_dexapos_admin()
    );

COMMENT ON TABLE public.settlement_attempts IS
    'Per-attempt log of POS-driven settlement lifecycle (prepare / terminal_command / finalize). Written via log_settlement_attempt(). Read-restricted to merchant admins + HQ.';

-- ============================================================================
-- log_settlement_attempt — the tablet calls this at each phase/outcome.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.log_settlement_attempt(
    p_terminal_id  uuid,
    p_phase        text,
    p_outcome      text,
    p_detail       text DEFAULT NULL,
    p_batch_uuid   uuid DEFAULT NULL,
    p_initiated_by text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_t  record;
    v_id uuid;
BEGIN
    SELECT merchant_id, location_id, terminal_type
    INTO v_t
    FROM public.payment_terminals
    WHERE id = p_terminal_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Terminal not found: %', p_terminal_id;
    END IF;

    INSERT INTO public.settlement_attempts (
        payment_terminal_id, merchant_id, location_id, settlement_batch_id,
        processor, origin, phase, outcome, detail, initiated_by
    ) VALUES (
        p_terminal_id, v_t.merchant_id, v_t.location_id, p_batch_uuid,
        v_t.terminal_type,
        CASE WHEN p_initiated_by IN ('pos_auto','scheduler','auto') THEN 'pos_auto' ELSE 'pos_manual' END,
        p_phase, p_outcome, p_detail, p_initiated_by
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.log_settlement_attempt(uuid, text, text, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_settlement_attempt(uuid, text, text, text, uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.log_settlement_attempt(uuid, text, text, text, uuid, text) IS
    'Records a settlement-attempt phase/outcome for a terminal (called by the POS tablet). Derives merchant/location/processor from the terminal.';
