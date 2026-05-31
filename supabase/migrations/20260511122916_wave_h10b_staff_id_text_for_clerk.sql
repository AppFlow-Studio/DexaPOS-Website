ALTER TABLE public.sync_resolution_events
    ALTER COLUMN staff_id TYPE text USING staff_id::text;

DROP FUNCTION IF EXISTS public.record_manual_sync_resolution(text, text, text, uuid, uuid, uuid, text, jsonb);

CREATE OR REPLACE FUNCTION public.record_manual_sync_resolution(
    p_op_type text,
    p_resolution text,
    p_reason text,
    p_staff_id text,
    p_order_id uuid DEFAULT NULL::uuid,
    p_payment_id uuid DEFAULT NULL::uuid,
    p_idempotency_key text DEFAULT NULL::text,
    p_metadata jsonb DEFAULT NULL::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_audit_id uuid;
    v_merchant uuid := user_merchant_id();
    v_location uuid;
BEGIN
    IF v_merchant IS NULL THEN RAISE EXCEPTION 'merchant scope required'; END IF;
    IF p_staff_id IS NULL OR length(btrim(p_staff_id)) = 0 THEN
        RAISE EXCEPTION 'staff_id required for audit';
    END IF;
    IF p_resolution NOT IN ('discarded','retried','force_resynced') THEN
        RAISE EXCEPTION 'invalid resolution: %', p_resolution;
    END IF;
    IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN
        RAISE EXCEPTION 'reason must be at least 10 characters (audit trail)';
    END IF;
    IF p_op_type IS NULL OR length(btrim(p_op_type)) = 0 THEN
        RAISE EXCEPTION 'op_type required';
    END IF;
    IF p_payment_id IS NOT NULL THEN
        SELECT location_id INTO v_location FROM public.order_payments
        WHERE id = p_payment_id AND merchant_id = v_merchant;
    END IF;
    IF v_location IS NULL AND p_order_id IS NOT NULL THEN
        SELECT location_id INTO v_location FROM public.orders
        WHERE id = p_order_id AND merchant_id = v_merchant;
    END IF;
    INSERT INTO public.sync_resolution_events (
        merchant_id, location_id, order_id, payment_id,
        op_type, resolution, reason, staff_id,
        idempotency_key, metadata
    ) VALUES (
        v_merchant, v_location, p_order_id, p_payment_id,
        p_op_type, p_resolution, p_reason, p_staff_id,
        p_idempotency_key, p_metadata
    )
    RETURNING id INTO v_audit_id;
    RETURN jsonb_build_object('ok', true, 'audit_id', v_audit_id);
END;
$function$;;
