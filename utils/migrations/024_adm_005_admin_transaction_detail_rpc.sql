-- ============================================================================
-- Migration 024: ADM-005 Admin Transaction Detail RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_admin_transaction_detail(
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_order_enriched jsonb;
  v_payments jsonb;
  v_order_items jsonb;
  v_order_discounts jsonb;
BEGIN
  IF p_order_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT public.is_dexapos_admin() THEN
    RETURN NULL;
  END IF;

  SELECT o.*
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_order.merchant_id NOT IN (SELECT public.get_admin_merchant_ids()) THEN
    RETURN NULL;
  END IF;

  SELECT
    to_jsonb(v_order)
    || jsonb_build_object(
      'merchant_name', m.name,
      'location_name', l.name,
      'staff_name', NULLIF(trim(concat_ws(' ', sp.first_name, sp.last_name)), '')
    )
  INTO v_order_enriched
  FROM public.merchants m
  LEFT JOIN public.locations l
    ON l.id = v_order.location_id
  LEFT JOIN public.staff_profiles sp
    ON sp.id = v_order.created_by_staff_id
  WHERE m.id = v_order.merchant_id;

  SELECT COALESCE(
    jsonb_agg(
      (
        to_jsonb(op)
        || jsonb_build_object(
          'staff_name', NULLIF(trim(concat_ws(' ', psp.first_name, psp.last_name)), ''),
          'terminal_info',
            CASE
              WHEN pt.id IS NULL THEN NULL
              ELSE jsonb_build_object(
                'terminal_id', pt.id,
                'terminal_name', pt.terminal_name,
                'terminal_model', pt.terminal_model,
                'serial_number', pt.serial_number,
                'tpn', pt.tpn,
                'connection_type', pt.connection_type,
                'api_environment', pt.api_environment
              )
            END,
          'settlement',
            CASE
              WHEN sb.id IS NULL THEN NULL
              ELSE jsonb_build_object(
                'settlement_batch_id', sb.id,
                'batch_id', sb.batch_id,
                'status', sb.status,
                'opened_at', sb.opened_at,
                'closed_at', sb.closed_at,
                'settlement_date', sb.settlement_date,
                'funded_date', sb.funded_date,
                'is_settled', COALESCE(op.is_settled, false),
                'settled_at', op.settled_at
              )
            END,
          'items_paid', COALESCE(
            (
              SELECT jsonb_agg(
                to_jsonb(opi)
                || jsonb_build_object(
                  'item', to_jsonb(oi)
                )
                ORDER BY opi.created_at
              )
              FROM public.order_payment_items opi
              JOIN public.order_items oi
                ON oi.id = opi.order_item_id
              WHERE opi.order_payment_id = op.id
            ),
            '[]'::jsonb
          ),
          'payment_events', COALESCE(
            (
              SELECT jsonb_agg(to_jsonb(pe) ORDER BY pe.event_timestamp)
              FROM public.payment_events pe
              WHERE pe.payment_id = op.id
            ),
            '[]'::jsonb
          )
        )
      )
      ORDER BY COALESCE(op.initiated_at, op.captured_at)
    ),
    '[]'::jsonb
  )
  INTO v_payments
  FROM public.order_payments op
  LEFT JOIN public.staff_profiles psp
    ON psp.id = COALESCE(op.processed_by_staff_id, op.tip_adjusted_by, op.returned_by)
  LEFT JOIN LATERAL (
    SELECT pt_inner.*
    FROM public.payment_terminals pt_inner
    WHERE pt_inner.location_id = COALESCE(op.location_id, v_order.location_id)
      AND (
        op.terminal_id IS NULL
        OR pt_inner.serial_number = op.terminal_id
        OR pt_inner.tpn = op.terminal_id
        OR pt_inner.id::text = op.terminal_id
      )
    ORDER BY
      CASE
        WHEN op.terminal_id IS NOT NULL AND pt_inner.serial_number = op.terminal_id THEN 0
        WHEN op.terminal_id IS NOT NULL AND pt_inner.tpn = op.terminal_id THEN 1
        WHEN op.terminal_id IS NOT NULL AND pt_inner.id::text = op.terminal_id THEN 2
        ELSE 3
      END,
      pt_inner.updated_at DESC
    LIMIT 1
  ) pt ON true
  LEFT JOIN LATERAL (
    SELECT sb_inner.*
    FROM public.settlement_batches sb_inner
    WHERE sb_inner.merchant_id = COALESCE(op.merchant_id, v_order.merchant_id)
      AND sb_inner.location_id = COALESCE(op.location_id, v_order.location_id)
      AND COALESCE(op.batch_number, op.dejavoo_batch_number) IS NOT NULL
      AND sb_inner.batch_id = COALESCE(op.batch_number, op.dejavoo_batch_number)
    ORDER BY sb_inner.closed_at DESC NULLS LAST, sb_inner.created_at DESC
    LIMIT 1
  ) sb ON true
  WHERE op.order_id = p_order_id;

  SELECT COALESCE(
    jsonb_agg(
      (
        to_jsonb(oi)
        || jsonb_build_object(
          'modifiers', COALESCE(
            (
              SELECT jsonb_agg(to_jsonb(oim) ORDER BY oim.created_at)
              FROM public.order_item_modifiers oim
              WHERE oim.order_item_id = oi.id
            ),
            '[]'::jsonb
          )
        )
      )
      ORDER BY oi.created_at, oi.display_order
    ),
    '[]'::jsonb
  )
  INTO v_order_items
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id;

  SELECT COALESCE(
    jsonb_agg(to_jsonb(od) ORDER BY od.applied_at, od.created_at),
    '[]'::jsonb
  )
  INTO v_order_discounts
  FROM public.order_discounts od
  WHERE od.order_id = p_order_id;

  RETURN jsonb_build_object(
    'order', v_order_enriched,
    'payments', v_payments,
    'order_items', v_order_items,
    'order_discounts', v_order_discounts
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_transaction_detail(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_admin_transaction_detail(uuid)
IS 'Returns HQ admin-scoped transaction details for one order, including payments, payment events, items paid, settlement, and full order breakdown.';
