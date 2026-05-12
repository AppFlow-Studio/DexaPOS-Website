CREATE OR REPLACE FUNCTION public.manual_mark_batch_settled(
    p_batch_uuid uuid,
    p_merchant_id uuid,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_batch record;
    v_payment_count integer;
BEGIN
    SELECT * INTO v_batch FROM public.settlement_batches WHERE id = p_batch_uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Settlement batch not found: %', p_batch_uuid; END IF;
    IF v_batch.merchant_id != p_merchant_id THEN
        RAISE EXCEPTION 'Access denied: batch % does not belong to merchant %', p_batch_uuid, p_merchant_id;
    END IF;
    IF v_batch.status = 'settled' THEN
        RAISE EXCEPTION 'Batch % is already settled.', p_batch_uuid;
    END IF;

    UPDATE public.settlement_batches
    SET status = 'settled',
        closed_at = COALESCE(closed_at, NOW()),
        settlement_date = COALESCE(settlement_date, CURRENT_DATE),
        last_attempt_at = NOW(),
        failure_reason = COALESCE(NULLIF(p_reason,''), 'Marked settled manually — terminal had already closed this host batch.'),
        updated_at = NOW()
    WHERE id = p_batch_uuid;

    UPDATE public.order_payments
    SET is_settled = true,
        settled_at = COALESCE(settled_at, NOW())
    WHERE settlement_batch_id = p_batch_uuid
      AND is_settled = false;

    GET DIAGNOSTICS v_payment_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'batch_id', v_batch.batch_id,
        'payments_marked_settled', v_payment_count
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.manual_mark_batch_settled(uuid, uuid, text) TO authenticated;

-- -- One-off: mark the orphan batch a59f40fb settled now, since its 30 linked
-- -- payments were already settled on the terminal in prior sessions and we
-- -- can't (and shouldn't) re-settle them.
-- SELECT public.manual_mark_batch_settled(
--     'a59f40fb-2960-4939-b019-c80d0fcf93ad'::uuid,
--     '2add44cb-f498-4653-aca3-a8f0ca258e70'::uuid,
--     'Reconciled by support: 30 historical payments already settled on terminal in prior sessions before host-keyed batching went live.'
-- );
