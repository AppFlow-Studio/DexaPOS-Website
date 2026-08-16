-- ============================================================================
-- valor_webhook_events — durable per-request log of the Valor webhook.
-- ----------------------------------------------------------------------------
-- Supabase function logs capture every HTTP hit, and the DLQ / audit_logs /
-- settlement_batches capture outcomes — but there is no single queryable table
-- of every inbound webhook attempt (crucially, 401 invalid-signature rejects
-- are NOT in the DLQ). This table is the one-stop log the in-app Valor webhook
-- visualizer reads. Written by the edge function via log_valor_webhook_event().
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.valor_webhook_events (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    received_at          timestamptz NOT NULL DEFAULT now(),
    epi_id               text,
    batch_no             text,
    payment_terminal_id  uuid REFERENCES public.payment_terminals(id) ON DELETE SET NULL,
    merchant_id          uuid REFERENCES public.merchants(id) ON DELETE SET NULL,
    verified             boolean NOT NULL DEFAULT false,
    outcome              text NOT NULL CHECK (outcome IN (
                            'validation','ignored','invalid_signature',
                            'processed','needs_review','dead_letter','error')),
    http_status          integer,
    latency_ms           integer,
    settlement_batch_id  uuid REFERENCES public.settlement_batches(id) ON DELETE SET NULL,
    detail               text,
    raw_payload          jsonb
);

CREATE INDEX IF NOT EXISTS idx_valor_webhook_events_terminal_time
    ON public.valor_webhook_events (payment_terminal_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_valor_webhook_events_epi_time
    ON public.valor_webhook_events (epi_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_valor_webhook_events_time
    ON public.valor_webhook_events (received_at DESC);

ALTER TABLE public.valor_webhook_events ENABLE ROW LEVEL SECURITY;

-- Reads: merchant admins of the resolved merchant, or Dexa HQ admins. Unmapped
-- events (unknown EPI / validation pings — merchant_id NULL) are HQ-only.
DROP POLICY IF EXISTS "view valor webhook events" ON public.valor_webhook_events;
CREATE POLICY "view valor webhook events" ON public.valor_webhook_events
    FOR SELECT USING (
        public.is_dexapos_admin()
        OR (merchant_id IS NOT NULL AND public.is_merchant_admin(merchant_id))
    );

COMMENT ON TABLE public.valor_webhook_events IS
    'Per-request log of the Valor webhook (every inbound hit incl. validation pings and 401 invalid-signature rejects). Written by log_valor_webhook_event(). Read-restricted to merchant admins + HQ.';

-- ============================================================================
-- log_valor_webhook_event — called by the edge function at each return path.
-- Resolves the terminal/merchant from the EPI when present.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.log_valor_webhook_event(
    p_epi                 text,
    p_batch_no            text,
    p_verified            boolean,
    p_outcome             text,
    p_http_status         integer,
    p_latency_ms          integer DEFAULT NULL,
    p_detail              text DEFAULT NULL,
    p_settlement_batch_id uuid DEFAULT NULL,
    p_raw                 jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_terminal_id uuid;
    v_merchant_id uuid;
    v_id          uuid;
BEGIN
    IF p_epi IS NOT NULL AND p_epi <> '' THEN
        SELECT id, merchant_id INTO v_terminal_id, v_merchant_id
        FROM public.payment_terminals
        WHERE valor_epi = p_epi AND terminal_type = 'valor'
        ORDER BY is_active DESC
        LIMIT 1;
    END IF;

    INSERT INTO public.valor_webhook_events (
        epi_id, batch_no, payment_terminal_id, merchant_id, verified, outcome,
        http_status, latency_ms, settlement_batch_id, detail, raw_payload
    ) VALUES (
        NULLIF(p_epi, ''), NULLIF(p_batch_no, ''), v_terminal_id, v_merchant_id, COALESCE(p_verified, false), p_outcome,
        p_http_status, p_latency_ms, p_settlement_batch_id, p_detail, p_raw
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.log_valor_webhook_event(text, text, boolean, text, integer, integer, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_valor_webhook_event(text, text, boolean, text, integer, integer, text, uuid, jsonb) TO service_role;

COMMENT ON FUNCTION public.log_valor_webhook_event(text, text, boolean, text, integer, integer, text, uuid, jsonb) IS
    'Records one Valor webhook request in valor_webhook_events; resolves terminal/merchant from the EPI. Called by the valor-webhook edge function (service_role).';
