-- ============================================================================
-- Audit POS / terminal-initiated settlement batchouts
-- ----------------------------------------------------------------------------
-- Until now, only HQ *manual* reconciliations (manualBatchout -> LogAuditEvent)
-- produced an audit_logs row. POS-initiated batchouts -- finalize_castles_settlement
-- and finalize_valor_settlement -- write settlement_batches directly with NO audit
-- trail. This trigger closes that gap: whenever a batch transitions INTO a
-- settlement OUTCOME state, it writes a 'settlement' audit_logs row. Because it is a
-- table trigger it captures ALL writers (POS Castles/Valor, terminal-direct, and any
-- future path) and cannot be bypassed by code that forgets to log.
--
-- The HQ manual path runs on the `service_role` key and already writes its own,
-- actor-attributed 'manual_mark_batch_settled' audit row, so service_role writers are
-- skipped here to avoid a duplicate. Caveat: if a future *automatic* settler is built
-- on the service_role key, give it app-level logging or relax this skip.
--
-- Best-effort by design: any failure inside the trigger is swallowed so it can never
-- block a settlement write.
-- ============================================================================

CREATE OR REPLACE FUNCTION public._audit_settlement_batch_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_jwt_role text;
    v_actor    text;
    v_action   text;
    v_severity text;
    v_status   text;
BEGIN
    -- Only meaningful settlement OUTCOME states, and only on an actual change.
    IF NEW.status NOT IN (
        'settled','closed','funded',
        'partial_failure','failed','terminal_unavailable','needs_review'
    ) THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
        RETURN NEW;
    END IF;

    -- Read the caller's JWT (safe when there are no claims, e.g. a direct DB write).
    BEGIN
        v_jwt_role := auth.jwt() ->> 'role';
        v_actor    := auth.jwt() ->> 'sub';
    EXCEPTION WHEN OTHERS THEN
        v_jwt_role := NULL;
        v_actor    := NULL;
    END;

    -- Skip the HQ manual path (service_role) -- it logs its own richer audit row.
    IF v_jwt_role = 'service_role' THEN
        RETURN NEW;
    END IF;

    -- Outcome -> action + severity + audit status.
    IF NEW.status IN ('settled','closed','funded') THEN
        v_action := 'batch_settled';                 v_severity := 'info';     v_status := 'success';
    ELSIF NEW.status = 'partial_failure' THEN
        v_action := 'batch_settlement_partial';      v_severity := 'warning';  v_status := 'failed';
    ELSIF NEW.status = 'needs_review' THEN
        v_action := 'batch_settlement_needs_review'; v_severity := 'warning';  v_status := 'failed';
    ELSE  -- failed, terminal_unavailable
        v_action := 'batch_settlement_failed';       v_severity := 'warning';  v_status := 'failed';
    END IF;

    INSERT INTO public.audit_logs (
        actor_user_id, actor_role,
        action, action_category, severity,
        resource_type, resource_id, resource_name,
        merchant_id, location_id, status, metadata
    ) VALUES (
        v_actor, 'pos',
        v_action, 'settlement', v_severity,
        'settlement_batch', NEW.id, NEW.batch_id,
        NEW.merchant_id, NEW.location_id, v_status,
        jsonb_build_object(
            'source', 'pos_terminal',
            'processor', NEW.processor,
            'acquirer', NEW.acquirer,
            'batch_status', NEW.status,
            'previous_status', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
            'batch_number', NEW.batch_number,
            'transaction_count', NEW.transaction_count,
            'gross_amount', NEW.gross_amount,
            'tip_amount', NEW.tip_amount,
            'net_deposit', NEW.net_deposit,
            'retry_count', NEW.retry_count,
            'failure_reason', NEW.failure_reason,
            'settlement_date', NEW.settlement_date,
            'payment_terminal_id', NEW.payment_terminal_id
        )
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Audit logging must never break a settlement write.
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_audit_settlement_batch_transition ON public.settlement_batches;
CREATE TRIGGER trg_audit_settlement_batch_transition
    AFTER INSERT OR UPDATE OF status ON public.settlement_batches
    FOR EACH ROW
    EXECUTE FUNCTION public._audit_settlement_batch_transition();

COMMENT ON FUNCTION public._audit_settlement_batch_transition() IS
    'Writes a settlement audit_logs row on every settlement_batches outcome transition (POS Castles/Valor, terminal-direct). Skips service_role writers (HQ manual path logs itself). Best-effort; never blocks the settlement write.';
