CREATE OR REPLACE FUNCTION public.broadcast_order_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  payload jsonb;
  order_data jsonb;
  order_items_data jsonb;
  order_payments_data jsonb;
  order_refund_items_data jsonb;
  reversals_data jsonb;
  payment_items_data jsonb;
  v_topic text;
  v_location_id uuid;
  v_station_name text;
BEGIN
  v_location_id := COALESCE(NEW.location_id, OLD.location_id);
  IF v_location_id IS NULL THEN
    RETURN NULL;
  END IF;
  v_topic := 'location:' || v_location_id::text || ':orders';
  IF TG_OP = 'DELETE' THEN
    payload := jsonb_build_object(
      'operation', TG_OP,
      'timestamp', now(),
      'data', jsonb_build_object(
        'order', jsonb_build_object(
          'id', OLD.id,
          'order_number', OLD.order_number,
          'location_id', OLD.location_id,
          'station_id', OLD.station_id
        )
      )
    );
  ELSE
    SELECT station_name INTO v_station_name FROM public.stations WHERE id = NEW.station_id;
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', oi.id, 'menu_item_id', oi.menu_item_id, 'item_name', oi.item_name,
        'quantity', oi.quantity, 'unit_price', oi.unit_price, 'cash_price', oi.cash_price,
        'subtotal', oi.subtotal, 'cash_subtotal', oi.cash_subtotal,
        'base_card_price', oi.base_card_price, 'base_cash_price', oi.base_cash_price,
        'tax_amount', oi.tax_amount, 'cash_tax_amount', oi.cash_tax_amount,
        'discount_amount', COALESCE(oi.discount_amount, 0),
        'item_status', oi.item_status, 'kitchen_status', oi.kitchen_status,
        'paid_quantity', COALESCE(oi.paid_quantity, 0),
        'refunded_quantity', COALESCE(oi.refunded_quantity, 0),
        'refunded_amount', COALESCE(oi.refunded_amount, 0),
        'course_number', oi.course_number, 'seat_number', oi.seat_number,
        'is_voided', COALESCE(oi.is_voided, false),
        'is_open_item', COALESCE(oi.is_open_item, false),
        'open_item_name', oi.open_item_name, 'open_item_price', oi.open_item_price,
        'special_instructions', oi.special_instructions,
        'category_name', oi.category_name, 'category_id', oi.category_id,
        'prep_station', oi.prep_station, 'rush', COALESCE(oi.rush, false),
        'is_prioritized', COALESCE(oi.is_prioritized, false),
        'fire_time', oi.fire_time::timestamptz,
        'modifiers', (
          SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
              'modifier_group_id', oim.modifier_group_id,
              'modifier_item_id', oim.modifier_item_id,
              'modifier_group_name', oim.modifier_group_name,
              'modifier_name', oim.modifier_name,
              'price_modifier', oim.price_modifier,
              'quantity', oim.quantity,
              'is_no', COALESCE(oim.is_no, false)
            )
          ), '[]'::jsonb)
          FROM public.order_item_modifiers oim
          WHERE oim.order_item_id = oi.id
        )
      )
      ORDER BY oi.display_order ASC NULLS LAST, oi.created_at ASC
    ), '[]'::jsonb) INTO order_items_data
    FROM public.order_items oi
    WHERE oi.order_id = NEW.id;

    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', op.id, 'order_id', op.order_id, 'payment_method', op.payment_method,
        'amount', op.amount, 'tip_amount', COALESCE(op.tip_amount, 0),
        'total_amount', op.total_amount, 'status', op.status,
        'subtotal_portion', op.subtotal_portion, 'tax_portion', op.tax_portion,
        'discount_portion', op.discount_portion,
        'amount_tendered', op.amount_tendered, 'change_given', COALESCE(op.change_given, 0),
        'is_cash_priced', COALESCE(op.is_cash_priced, false),
        'original_amount', op.original_amount,
        'split_portion_index', op.split_portion_index, 'split_count', op.split_count,
        'covers_items', COALESCE(op.covers_items, ARRAY[]::uuid[]),
        'card_type', op.card_type, 'card_last_four', op.card_last_four,
        'transaction_id', op.transaction_id, 'terminal_type', op.terminal_type,
        'is_voided', COALESCE(op.is_voided, false), 'void_reason', op.void_reason,
        'refunded_amount', COALESCE(op.refunded_amount, 0), 'refunded_at', op.refunded_at
      ) || jsonb_build_object(
        'captured_at', op.captured_at, 'authorization_code', op.authorization_code,
        'auth_code', op.auth_code, 'rrn', op.rrn, 'batch_number', op.batch_number,
        'dejavoo_batch_number', op.dejavoo_batch_number,
        'dejavoo_invoice_number', op.dejavoo_invoice_number,
        'result_code', op.result_code,
        'entry_mode', op.processor_response->'dejavoo_transaction'->>'entryMode',
        'reference_number', op.reference_number, 'reference_id', op.reference_number,
        'created_at', op.initiated_at, 'is_returned', COALESCE(op.is_returned, false),
        'returned_at', op.returned_at, 'returned_by', op.returned_by,
        'return_amount', COALESCE(op.return_amount, 0),
        'return_rrn', op.return_rrn, 'return_auth_code', op.return_auth_code,
        'return_reference_id', op.return_reference_id,
        'return_number', op.return_number, 'return_reason', op.return_reason
      )
    ), '[]'::jsonb) INTO order_payments_data
    FROM public.order_payments op
    WHERE op.order_id = NEW.id
      AND op.status IN ('captured', 'refunded', 'partially_refunded', 'void');

    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', r.id, 'original_payment_id', r.original_payment_id,
        'original_psp_reference', r.original_psp_reference,
        'reversal_reference_id', r.reversal_reference_id,
        'reversal_psp_reference', r.reversal_psp_reference,
        'merchant_id', r.merchant_id, 'location_id', r.location_id,
        'reversal_type', r.reversal_type, 'amount', r.amount,
        'reason_code', r.reason_code, 'reason_description', r.reason_description,
        'status', r.status, 'result_code', r.result_code,
        'response_message', r.response_message,
        'initiated_by', r.initiated_by, 'approved_by', r.approved_by,
        'requested_at', r.requested_at, 'processed_at', r.processed_at,
        'completed_at', r.completed_at, 'failed_at', r.failed_at,
        'terminal_response', r.terminal_response, 'emv_data', r.emv_data
      )
    ), '[]'::jsonb) INTO reversals_data
    FROM public.reversals r
    JOIN public.order_payments op ON op.id = r.original_payment_id
    WHERE op.order_id = NEW.id;

    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', ori.id, 'reversal_id', ori.reversal_id,
        'order_item_id', ori.order_item_id,
        'order_payment_item_id', ori.order_payment_item_id,
        'quantity_refunded', ori.quantity_refunded,
        'unit_price_refunded', ori.unit_price_refunded,
        'subtotal_refunded', ori.subtotal_refunded,
        'tax_refunded', ori.tax_refunded,
        'total_refunded', ori.total_refunded,
        'refund_reason', ori.refund_reason,
        'refund_reason_detail', ori.refund_reason_detail,
        'return_to_inventory', ori.return_to_inventory,
        'inventory_updated', ori.inventory_updated,
        'created_at', ori.created_at
      )
    ), '[]'::jsonb) INTO order_refund_items_data
    FROM public.order_refund_items ori
    JOIN public.order_items oi ON oi.id = ori.order_item_id
    WHERE oi.order_id = NEW.id;

    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', opi.id, 'order_payment_id', opi.order_payment_id,
        'order_item_id', opi.order_item_id, 'quantity_paid', opi.quantity_paid,
        'unit_price_paid', opi.unit_price_paid,
        'subtotal_paid', opi.subtotal_paid, 'tax_paid', opi.tax_paid
      )
    ), '[]'::jsonb) INTO payment_items_data
    FROM public.order_payment_items opi
    JOIN public.order_payments op ON op.id = opi.order_payment_id
    WHERE op.order_id = NEW.id;

    order_data := jsonb_build_object(
      'id', NEW.id, 'order_number', NEW.order_number,
      'display_number', NEW.display_number, 'external_id', NEW.external_id,
      'merchant_id', NEW.merchant_id, 'location_id', NEW.location_id,
      'customer_id', NEW.customer_id,
      'created_by_staff_id', NEW.created_by_staff_id,
      'created_by_user_id', NEW.created_by_user_id,
      'assigned_server_id', NEW.assigned_server_id,
      'station_id', NEW.station_id, 'station_name', v_station_name,
      'order_type', NEW.order_type, 'order_source', NEW.order_source,
      'split_payment_path', NEW.split_payment_path,
      'status', NEW.status, 'table_number', NEW.table_number,
      'seat_number', NEW.seat_number, 'check_status', NEW.check_status
    );
    order_data := order_data || jsonb_build_object(
      'subtotal', NEW.subtotal, 'tax_amount', NEW.tax_amount,
      'tip_amount', NEW.tip_amount, 'discount_amount', NEW.discount_amount,
      'service_charge', NEW.service_charge, 'total_amount', NEW.total_amount,
      'card_subtotal', NEW.card_subtotal, 'card_tax_amount', NEW.card_tax_amount,
      'card_total', NEW.card_total, 'cash_subtotal', NEW.cash_subtotal,
      'cash_tax_amount', NEW.cash_tax_amount, 'cash_total', NEW.cash_total,
      'cash_discount_applied', NEW.cash_discount_applied,
      'cash_discount_amount', NEW.cash_discount_amount
    );
    order_data := order_data || jsonb_build_object(
      'effective_subtotal', NEW.effective_subtotal,
      'effective_tax_amount', NEW.effective_tax_amount,
      'effective_total', NEW.effective_total,
      'payment_pricing_mode', NEW.payment_pricing_mode,
      'payment_status', NEW.payment_status,
      'amount_paid', NEW.amount_paid, 'amount_due', NEW.amount_due,
      'cash_amount_due', NEW.cash_amount_due
    );
    order_data := order_data || jsonb_build_object(
      'created_at', NEW.created_at, 'updated_at', NEW.updated_at,
      'sent_to_kitchen_at', NEW.sent_to_kitchen_at,
      'started_preparing_at', NEW.started_preparing_at,
      'ready_at', NEW.ready_at, 'completed_at', NEW.completed_at,
      'cancelled_at', NEW.cancelled_at, 'voided_at', NEW.voided_at
    );
    order_data := order_data || jsonb_build_object(
      'voided_by', NEW.voided_by, 'void_reason', NEW.void_reason,
      'cancellation_reason', NEW.cancellation_reason,
      'sync_version', NEW.sync_version, 'is_offline', NEW.is_offline,
      'order_items', order_items_data,
      'order_payments', order_payments_data,
      'reversals', reversals_data,
      'order_refund_items', order_refund_items_data,
      'payment_items', payment_items_data
    );
    payload := jsonb_build_object(
      'operation', TG_OP, 'timestamp', now(),
      'data', jsonb_build_object('order', order_data)
    );
  END IF;
  RAISE LOG 'Broadcasting order for location %', v_topic;
  RAISE LOG 'Broadcasting order for location %', payload;
  PERFORM realtime.send(payload, TG_OP, v_topic, true);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'broadcast_order_changes failed: %', SQLERRM;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_eod_cash_summary(
  p_location_id uuid,
  p_business_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_drawers JSONB := '[]'::JSONB;
  v_grand_totals JSONB;
  v_drawer RECORD;
  v_ops RECORD;
  v_no_sale_audit JSONB;
BEGIN
  FOR v_drawer IN
    SELECT s.id AS session_id, d.id AS drawer_id, d.name AS drawer_name,
           s.opened_by, s.closed_by, s.opened_at, s.closed_at,
           s.opening_amount, s.closing_amount, s.expected_cash, s.variance, s.status
    FROM public.cash_drawer_sessions s
    JOIN public.cash_drawers d ON d.id = s.cash_drawer_id
    WHERE s.location_id = p_location_id AND s.business_date = p_business_date
    ORDER BY s.opened_at
  LOOP
    SELECT
      COALESCE(SUM(CASE WHEN operation_type = 'cash_sale' THEN amount ELSE 0 END), 0) AS cash_sales,
      COALESCE(SUM(CASE WHEN operation_type = 'cash_refund' THEN amount ELSE 0 END), 0) AS cash_refunds,
      COALESCE(SUM(CASE WHEN operation_type = 'pay_in' THEN amount ELSE 0 END), 0) AS pay_ins,
      COALESCE(SUM(CASE WHEN operation_type = 'pay_out' THEN amount ELSE 0 END), 0) AS pay_outs,
      COALESCE(SUM(CASE WHEN operation_type = 'cash_drop' THEN amount ELSE 0 END), 0) AS cash_drops,
      COALESCE(SUM(CASE WHEN operation_type = 'tip_out' THEN amount ELSE 0 END), 0) AS tip_outs,
      COUNT(CASE WHEN operation_type = 'no_sale' THEN 1 END) AS no_sale_count
    INTO v_ops
    FROM public.cash_drawer_operations
    WHERE session_id = v_drawer.session_id;
    v_drawers := v_drawers || jsonb_build_object(
      'session_id', v_drawer.session_id, 'drawer_id', v_drawer.drawer_id,
      'drawer_name', v_drawer.drawer_name,
      'opened_at', v_drawer.opened_at, 'closed_at', v_drawer.closed_at,
      'opening_amount', v_drawer.opening_amount,
      'closing_amount', v_drawer.closing_amount,
      'expected_cash', v_drawer.expected_cash,
      'variance', v_drawer.variance, 'status', v_drawer.status,
      'cash_sales', v_ops.cash_sales, 'cash_refunds', v_ops.cash_refunds,
      'pay_ins', v_ops.pay_ins, 'pay_outs', v_ops.pay_outs,
      'cash_drops', v_ops.cash_drops, 'tip_outs', v_ops.tip_outs,
      'no_sale_count', v_ops.no_sale_count
    );
  END LOOP;
  SELECT jsonb_build_object(
    'total_opening', COALESCE(SUM(s.opening_amount), 0),
    'total_closing', COALESCE(SUM(s.closing_amount), 0),
    'total_expected', COALESCE(SUM(s.expected_cash), 0),
    'total_variance', COALESCE(SUM(s.variance), 0),
    'sessions_count', COUNT(*),
    'sessions_still_open', COUNT(CASE WHEN s.status = 'open' THEN 1 END)
  ) INTO v_grand_totals
  FROM public.cash_drawer_sessions s
  WHERE s.location_id = p_location_id AND s.business_date = p_business_date;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB) INTO v_no_sale_audit
  FROM (
    SELECT o.performed_by, sp.display_name AS performed_by_name,
           COUNT(*) AS no_sale_count,
           jsonb_agg(jsonb_build_object(
             'id', o.id, 'performed_at', o.performed_at,
             'reason', o.reason, 'approved_by', o.approved_by,
             'session_id', o.session_id
           ) ORDER BY o.performed_at) AS events
    FROM public.cash_drawer_operations o
    JOIN public.cash_drawer_sessions s ON s.id = o.session_id
    LEFT JOIN public.staff_profiles sp ON sp.id = o.performed_by
    WHERE s.location_id = p_location_id
      AND s.business_date = p_business_date
      AND o.operation_type = 'no_sale'
    GROUP BY o.performed_by, sp.display_name
    ORDER BY no_sale_count DESC
  ) t;

  RETURN jsonb_build_object(
    'drawers', v_drawers,
    'grand_totals', v_grand_totals,
    'no_sale_audit', v_no_sale_audit,
    'business_date', p_business_date
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_kds_tickets_v2(
  p_location_id uuid,
  p_statuses text[] DEFAULT ARRAY['sent'::text, 'preparing'::text, 'ready'::text],
  p_kds_display_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_result JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(ticket ORDER BY ticket->>'start_time' ASC NULLS LAST), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'ticket_id', o.id::text || '_c' || COALESCE(oi_grouped.course_number, 1)::text
        || '_f' || COALESCE(EXTRACT(EPOCH FROM oi_grouped.fire_time::timestamptz)::bigint::text, '0'),
      'order_id', o.id, 'db_order_id', o.id,
      'order_number', o.order_number, 'display_number', o.display_number,
      'course_number', COALESCE(oi_grouped.course_number, 1),
      'status', CASE
        WHEN oi_grouped.all_active_ready THEN 'ready'
        WHEN oi_grouped.any_active_sent THEN 'pending'
        ELSE 'cooking'
      END,
      'order_type', o.order_type, 'order_source', o.order_source,
      'delivery_platform', COALESCE(o.delivery_platform, o.metadata->>'delivery_company'),
      'table_name', o.table_number, 'customer_name', o.customer_name,
      'order_notes', o.special_instructions,
      'start_time', COALESCE(oi_grouped.fire_time::timestamptz, o.sent_to_kitchen_at, o.created_at),
      'item_count', oi_grouped.active_item_count,
      'prioritized', oi_grouped.any_prioritized,
      'session_id', o.session_id,
      'items', oi_grouped.items_json
    ) AS ticket
    FROM public.orders o
    INNER JOIN (
      SELECT oi.order_id, COALESCE(oi.course_number, 1) AS course_number,
        bool_and(CASE WHEN NOT COALESCE(oi.is_voided, false)
              AND COALESCE(oi.refunded_quantity, 0) < oi.quantity
             THEN oi.kitchen_status = 'ready' ELSE true END) AS all_active_ready,
        bool_or(CASE WHEN NOT COALESCE(oi.is_voided, false)
              AND COALESCE(oi.refunded_quantity, 0) < oi.quantity
             THEN oi.kitchen_status = 'sent' ELSE false END) AS any_active_sent,
        SUM(CASE WHEN COALESCE(oi.is_voided, false) THEN 0
             ELSE GREATEST(oi.quantity - COALESCE(oi.refunded_quantity, 0), 0) END)::int AS active_item_count,
        oi.fire_time,
        bool_or(COALESCE(oi.is_prioritized, false)) AS any_prioritized,
        jsonb_agg(jsonb_build_object(
          'id', oi.id,
          'name', COALESCE(oi.open_item_name, oi.item_name),
          'quantity', oi.quantity, 'seat_number', oi.seat_number,
          'kitchen_status', COALESCE(oi.kitchen_status, 'sent'),
          'special_instructions', oi.special_instructions,
          'category_name', oi.category_name, 'category_id', oi.category_id,
          'menu_name', oi.menu_name, 'menu_id', oi.menu_id,
          'prep_station', oi.prep_station, 'rush', COALESCE(oi.rush, false),
          'is_prioritized', COALESCE(oi.is_prioritized, false),
          'fire_time', oi.fire_time::timestamptz,
          'is_voided', COALESCE(oi.is_voided, false),
          'is_refunded', COALESCE(oi.refunded_quantity, 0) > 0,
          'refunded_quantity', COALESCE(oi.refunded_quantity, 0),
          'modifiers', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
              'modifier_name', oim.modifier_name,
              'modifier_group_name', oim.modifier_group_name,
              'price_modifier', oim.price_modifier,
              'is_no', COALESCE(oim.is_no, false)
            )), '[]'::jsonb)
            FROM public.order_item_modifiers oim
            WHERE oim.order_item_id = oi.id
          )
        ) ORDER BY oi.id ASC) AS items_json
      FROM public.order_items oi
      LEFT JOIN public.kds_item_status kis
        ON kis.order_item_id = oi.id
        AND kis.kds_display_id = p_kds_display_id
        AND kis.status NOT IN ('cancelled', 'completed')
      WHERE oi.kitchen_status IS NOT NULL
        AND ((COALESCE(oi.is_voided, false) = false
             AND COALESCE(oi.refunded_quantity, 0) < oi.quantity
             AND oi.kitchen_status = ANY(p_statuses))
          OR COALESCE(oi.is_voided, false) = true
          OR COALESCE(oi.refunded_quantity, 0) > 0)
        AND (p_kds_display_id IS NULL OR kis.id IS NOT NULL)
      GROUP BY oi.order_id, COALESCE(oi.course_number, 1), oi.fire_time
    ) oi_grouped ON oi_grouped.order_id = o.id
    WHERE o.location_id = p_location_id
      AND o.status NOT IN ('completed', 'cancelled', 'void', 'refunded')
  ) sub;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_session_variance_analysis(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_session RECORD;
  v_timeline JSONB;
  v_no_sale_events JSONB;
  v_suspicious JSONB := '[]'::JSONB;
  v_nosale RECORD;
  v_related RECORD;
BEGIN
  SELECT s.id, s.opening_amount, s.closing_amount, s.expected_cash, s.variance,
         s.opened_at, s.closed_at, s.opened_by, s.closed_by, s.status,
         s.is_blind_count, d.name AS drawer_name
  INTO v_session
  FROM public.cash_drawer_sessions s
  JOIN public.cash_drawers d ON d.id = s.cash_drawer_id
  WHERE s.id = p_session_id;
  IF v_session IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session not found');
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.performed_at), '[]'::JSONB)
  INTO v_timeline
  FROM (
    SELECT o.id, o.operation_type, o.amount, o.balance_after,
           o.performed_by, sp.display_name AS performed_by_name,
           o.performed_at, o.reason, o.approved_by, o.order_id, o.payment_id,
           v_session.opening_amount + SUM(
             CASE WHEN o.operation_type IN ('cash_sale', 'pay_in') THEN o.amount
                  WHEN o.operation_type IN ('cash_refund', 'pay_out', 'cash_drop', 'tip_out') THEN -o.amount
                  ELSE 0 END
           ) OVER (ORDER BY o.performed_at ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
             AS running_balance
    FROM public.cash_drawer_operations o
    LEFT JOIN public.staff_profiles sp ON sp.id = o.performed_by
    WHERE o.session_id = p_session_id
    ORDER BY o.performed_at
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.performed_at), '[]'::JSONB)
  INTO v_no_sale_events
  FROM (
    SELECT o.id, o.performed_by, sp.display_name AS performed_by_name,
           o.performed_at, o.reason, o.approved_by
    FROM public.cash_drawer_operations o
    LEFT JOIN public.staff_profiles sp ON sp.id = o.performed_by
    WHERE o.session_id = p_session_id AND o.operation_type = 'no_sale'
    ORDER BY o.performed_at
  ) t;

  FOR v_nosale IN
    SELECT id, performed_at, performed_by, reason
    FROM public.cash_drawer_operations
    WHERE session_id = p_session_id AND operation_type = 'no_sale'
  LOOP
    FOR v_related IN
      SELECT id, operation_type, amount, performed_at, reason, performed_by
      FROM public.cash_drawer_operations
      WHERE session_id = p_session_id
        AND operation_type IN ('pay_out', 'cash_drop')
        AND ABS(EXTRACT(EPOCH FROM (performed_at - v_nosale.performed_at))) <= 1800
        AND (reason IS NULL OR TRIM(reason) = '')
    LOOP
      v_suspicious := v_suspicious || jsonb_build_object(
        'flag_type', 'nosale_near_unexplained_payout',
        'no_sale_op_id', v_nosale.id,
        'related_op_id', v_related.id,
        'time_gap_seconds', EXTRACT(EPOCH FROM (v_related.performed_at - v_nosale.performed_at)),
        'description', format(
          'No-sale at %s near unexplained %s of $%s at %s',
          to_char(v_nosale.performed_at, 'HH12:MIpm'),
          v_related.operation_type, v_related.amount,
          to_char(v_related.performed_at, 'HH12:MIpm')
        )
      );
    END LOOP;
  END LOOP;

  IF v_session.variance IS NOT NULL AND v_session.variance < 0 THEN
    FOR v_nosale IN
      SELECT o.id, o.performed_at, o.performed_by, sp.display_name
      FROM public.cash_drawer_operations o
      LEFT JOIN public.staff_profiles sp ON sp.id = o.performed_by
      WHERE o.session_id = p_session_id AND o.operation_type = 'no_sale'
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.cash_drawer_operations
        WHERE session_id = p_session_id
          AND operation_type IN ('pay_out', 'cash_drop')
          AND ABS(EXTRACT(EPOCH FROM (performed_at - v_nosale.performed_at))) <= 1800
      ) THEN
        v_suspicious := v_suspicious || jsonb_build_object(
          'flag_type', 'nosale_during_negative_variance',
          'no_sale_op_id', v_nosale.id,
          'related_op_id', NULL,
          'time_gap_seconds', 0,
          'description', format(
            'No-sale by %s at %s during session with $%s variance — no logged expense nearby',
            COALESCE(v_nosale.display_name, 'Unknown'),
            to_char(v_nosale.performed_at, 'HH12:MIpm'),
            ABS(v_session.variance)
          )
        );
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'session_summary', jsonb_build_object(
      'session_id', v_session.id, 'drawer_name', v_session.drawer_name,
      'opening_amount', v_session.opening_amount,
      'closing_amount', v_session.closing_amount,
      'expected_cash', v_session.expected_cash, 'variance', v_session.variance,
      'opened_at', v_session.opened_at, 'closed_at', v_session.closed_at,
      'opened_by', v_session.opened_by, 'closed_by', v_session.closed_by,
      'status', v_session.status, 'is_blind_count', v_session.is_blind_count
    ),
    'operations_timeline', v_timeline,
    'no_sale_events', v_no_sale_events,
    'suspicious_patterns', v_suspicious
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_refund_items(
  p_reversal_id uuid,
  p_items jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_item jsonb;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.order_refund_items (
      reversal_id, order_item_id, order_payment_item_id,
      quantity_refunded, unit_price_refunded, subtotal_refunded,
      tax_refunded, total_refunded, refund_reason, refund_reason_detail,
      return_to_inventory, inventory_updated
    )
    VALUES (
      p_reversal_id,
      (v_item->>'order_item_id')::uuid,
      NULLIF(v_item->>'order_payment_item_id', '')::uuid,
      COALESCE((v_item->>'quantity_refunded')::integer, 1),
      COALESCE((v_item->>'unit_price_refunded')::numeric, 0),
      COALESCE((v_item->>'subtotal_refunded')::numeric, 0),
      COALESCE((v_item->>'tax_refunded')::numeric, 0),
      COALESCE((v_item->>'total_refunded')::numeric, 0),
      (v_item->>'refund_reason')::public.refund_reason_type,
      v_item->>'refund_reason_detail',
      COALESCE((v_item->>'return_to_inventory')::boolean, false),
      COALESCE((v_item->>'inventory_updated')::boolean, false)
    );
    UPDATE public.order_items
    SET refunded_quantity = COALESCE(refunded_quantity, 0) + COALESCE((v_item->>'quantity_refunded')::integer, 0),
        refunded_amount = COALESCE(refunded_amount, 0) + COALESCE((v_item->>'total_refunded')::numeric, 0)
    WHERE id = (v_item->>'order_item_id')::uuid;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_refund_items(
  p_reversal_id uuid,
  p_items jsonb,
  p_skip_quantity_update boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_item jsonb;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.order_refund_items (
      reversal_id, order_item_id, order_payment_item_id,
      quantity_refunded, unit_price_refunded, subtotal_refunded,
      tax_refunded, total_refunded, refund_reason, refund_reason_detail,
      return_to_inventory, inventory_updated
    )
    VALUES (
      p_reversal_id,
      (v_item->>'order_item_id')::uuid,
      NULLIF(v_item->>'order_payment_item_id', '')::uuid,
      COALESCE((v_item->>'quantity_refunded')::integer, 1),
      COALESCE((v_item->>'unit_price_refunded')::numeric, 0),
      COALESCE((v_item->>'subtotal_refunded')::numeric, 0),
      COALESCE((v_item->>'tax_refunded')::numeric, 0),
      COALESCE((v_item->>'total_refunded')::numeric, 0),
      (v_item->>'refund_reason')::public.refund_reason_type,
      v_item->>'refund_reason_detail',
      COALESCE((v_item->>'return_to_inventory')::boolean, false),
      COALESCE((v_item->>'inventory_updated')::boolean, false)
    );
    IF NOT p_skip_quantity_update THEN
      UPDATE public.order_items
      SET refunded_quantity = COALESCE(refunded_quantity, 0) + COALESCE((v_item->>'quantity_refunded')::integer, 0),
          refunded_amount = COALESCE(refunded_amount, 0) + COALESCE((v_item->>'total_refunded')::numeric, 0)
      WHERE id = (v_item->>'order_item_id')::uuid;
    END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reset_category_item_to_level(
  p_menu_item_id uuid,
  p_category_id uuid DEFAULT NULL::uuid,
  p_menu_id uuid DEFAULT NULL::uuid,
  p_location_id uuid DEFAULT NULL::uuid,
  p_target_level integer DEFAULT 1
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_deleted_levels TEXT[] := '{}';
BEGIN
  IF p_target_level < 5 AND p_location_id IS NOT NULL AND p_menu_id IS NOT NULL THEN
    DELETE FROM public.location_menu_item_overrides
    WHERE location_id = p_location_id AND menu_id = p_menu_id
      AND menu_item_id = p_menu_item_id
      AND (p_category_id IS NULL OR category_id = p_category_id);
    IF FOUND THEN v_deleted_levels := array_append(v_deleted_levels, 'level_5_location_menu'); END IF;
  END IF;
  IF p_target_level < 4 AND p_menu_id IS NOT NULL AND p_location_id IS NULL AND p_category_id IS NOT NULL THEN
    DELETE FROM public.category_items
    WHERE menu_item_id = p_menu_item_id AND category_id = p_category_id AND menu_id = p_menu_id;
    IF FOUND THEN v_deleted_levels := array_append(v_deleted_levels, 'level_4_menu_category'); END IF;
  END IF;
  IF p_target_level < 3 AND p_location_id IS NOT NULL AND p_category_id IS NOT NULL THEN
    DELETE FROM public.location_category_item_overrides
    WHERE location_id = p_location_id AND category_id = p_category_id AND menu_item_id = p_menu_item_id;
    IF FOUND THEN v_deleted_levels := array_append(v_deleted_levels, 'level_4_location_category'); END IF;
  END IF;
  IF p_target_level < 2 AND p_location_id IS NULL AND p_category_id IS NOT NULL AND p_menu_id IS NULL THEN
    UPDATE public.category_items
    SET custom_price = NULL, custom_cash_price = NULL, custom_delivery_price = NULL, updated_at = NOW()
    WHERE category_id = p_category_id AND menu_item_id = p_menu_item_id AND menu_id IS NULL;
    IF FOUND THEN v_deleted_levels := array_append(v_deleted_levels, 'level_3_category'); END IF;
  END IF;
  IF p_target_level < 2 AND p_location_id IS NOT NULL THEN
    DELETE FROM public.location_item_overrides
    WHERE location_id = p_location_id AND menu_item_id = p_menu_item_id;
    IF FOUND THEN v_deleted_levels := array_append(v_deleted_levels, 'level_2_location_item'); END IF;
  END IF;
  RETURN json_build_object('success', true, 'target_level', p_target_level, 'deleted_overrides', v_deleted_levels);
END;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_category_item_override(
  p_menu_item_id uuid,
  p_category_id uuid DEFAULT NULL::uuid,
  p_menu_id uuid DEFAULT NULL::uuid,
  p_location_id uuid DEFAULT NULL::uuid,
  p_custom_price numeric DEFAULT NULL::numeric,
  p_custom_cash_price numeric DEFAULT NULL::numeric,
  p_is_available boolean DEFAULT NULL::boolean,
  p_price_modifier numeric DEFAULT NULL::numeric,
  p_price_modifier_type text DEFAULT NULL::text,
  p_display_order integer DEFAULT NULL::integer,
  p_is_featured boolean DEFAULT NULL::boolean,
  p_stock_tracking_mode text DEFAULT NULL::text,
  p_current_stock integer DEFAULT NULL::integer,
  p_custom_delivery_price numeric DEFAULT NULL::numeric
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_update_level INTEGER;
  v_update_table TEXT;
  v_is_empty BOOLEAN;
  v_menu_location_id UUID;
  v_merchant_id UUID;
BEGIN
  IF p_category_id IS NULL THEN
    IF p_location_id IS NULL THEN
      v_update_level := 1;
      v_update_table := 'menu_items';
      UPDATE public.menu_items
      SET price = COALESCE(p_custom_price, price),
          cash_price = COALESCE(p_custom_cash_price, cash_price),
          availability = COALESCE(p_is_available, availability),
          stock_tracking_mode = COALESCE(p_stock_tracking_mode, stock_tracking_mode),
          delivery_price = COALESCE(p_custom_delivery_price, delivery_price),
          updated_at = NOW()
      WHERE id = p_menu_item_id;
    ELSE
      v_update_level := 2;
      v_update_table := 'location_item_overrides';
      v_is_empty := (
        p_custom_price IS NULL AND p_custom_cash_price IS NULL AND p_custom_delivery_price IS NULL
        AND p_price_modifier IS NULL AND (p_is_available IS NULL OR p_is_available = true)
        AND p_stock_tracking_mode IS NULL AND p_current_stock IS NULL
      );
      IF v_is_empty THEN
        DELETE FROM public.location_item_overrides
        WHERE location_id = p_location_id AND menu_item_id = p_menu_item_id;
        RETURN json_build_object('success', true, 'action', 'deleted', 'level', v_update_level, 'table', v_update_table);
      ELSE
        INSERT INTO public.location_item_overrides (
          location_id, menu_item_id, custom_price, custom_cash_price, custom_delivery_price,
          price_modifier, price_modifier_type, is_available,
          stock_tracking_mode, current_stock, created_at, updated_at
        ) VALUES (
          p_location_id, p_menu_item_id, p_custom_price, p_custom_cash_price, p_custom_delivery_price,
          p_price_modifier, p_price_modifier_type, p_is_available,
          p_stock_tracking_mode, p_current_stock, NOW(), NOW()
        )
        ON CONFLICT (location_id, menu_item_id)
        DO UPDATE SET
          custom_price = COALESCE(EXCLUDED.custom_price, public.location_item_overrides.custom_price),
          custom_cash_price = COALESCE(EXCLUDED.custom_cash_price, public.location_item_overrides.custom_cash_price),
          custom_delivery_price = COALESCE(EXCLUDED.custom_delivery_price, public.location_item_overrides.custom_delivery_price),
          price_modifier = COALESCE(EXCLUDED.price_modifier, public.location_item_overrides.price_modifier),
          price_modifier_type = COALESCE(EXCLUDED.price_modifier_type, public.location_item_overrides.price_modifier_type),
          is_available = COALESCE(EXCLUDED.is_available, public.location_item_overrides.is_available),
          stock_tracking_mode = COALESCE(EXCLUDED.stock_tracking_mode, public.location_item_overrides.stock_tracking_mode),
          current_stock = COALESCE(EXCLUDED.current_stock, public.location_item_overrides.current_stock),
          updated_at = NOW();
      END IF;
    END IF;
  ELSE
    IF p_location_id IS NULL AND p_menu_id IS NULL THEN
      v_update_level := 3;
      v_update_table := 'category_items';
      UPDATE public.category_items
      SET custom_price = p_custom_price,
          custom_cash_price = p_custom_cash_price,
          custom_delivery_price = p_custom_delivery_price,
          is_available = COALESCE(p_is_available, is_available),
          display_order = COALESCE(p_display_order, display_order),
          is_featured = COALESCE(p_is_featured, is_featured),
          updated_at = NOW()
      WHERE category_id = p_category_id AND menu_item_id = p_menu_item_id AND menu_id IS NULL;
    ELSIF p_location_id IS NULL AND p_menu_id IS NOT NULL THEN
      v_update_level := 4;
      v_update_table := 'category_items';
      v_is_empty := (p_custom_price IS NULL AND p_custom_cash_price IS NULL AND p_custom_delivery_price IS NULL);
      IF v_is_empty THEN
        DELETE FROM public.category_items
        WHERE category_id = p_category_id AND menu_item_id = p_menu_item_id AND menu_id = p_menu_id;
        RETURN json_build_object('success', true, 'action', 'deleted', 'level', v_update_level, 'table', v_update_table);
      ELSE
        SELECT merchant_id INTO v_merchant_id FROM public.menu_items WHERE id = p_menu_item_id;
        INSERT INTO public.category_items (
          menu_item_id, category_id, menu_id, merchant_id,
          custom_price, custom_cash_price, custom_delivery_price,
          is_available, display_order, is_featured, created_at, updated_at
        ) VALUES (
          p_menu_item_id, p_category_id, p_menu_id, v_merchant_id,
          p_custom_price, p_custom_cash_price, p_custom_delivery_price,
          COALESCE(p_is_available, true), COALESCE(p_display_order, 0),
          COALESCE(p_is_featured, false), NOW(), NOW()
        )
        ON CONFLICT (menu_item_id, category_id, menu_id) WHERE menu_id IS NOT NULL
        DO UPDATE SET
          custom_price = EXCLUDED.custom_price,
          custom_cash_price = EXCLUDED.custom_cash_price,
          custom_delivery_price = EXCLUDED.custom_delivery_price,
          is_available = COALESCE(EXCLUDED.is_available, public.category_items.is_available),
          display_order = COALESCE(EXCLUDED.display_order, public.category_items.display_order),
          is_featured = COALESCE(EXCLUDED.is_featured, public.category_items.is_featured),
          updated_at = NOW();
      END IF;
    ELSIF p_location_id IS NOT NULL AND p_menu_id IS NULL THEN
      v_update_level := 4;
      v_update_table := 'location_category_item_overrides';
      v_is_empty := (
        p_custom_price IS NULL AND p_custom_cash_price IS NULL AND p_custom_delivery_price IS NULL
        AND (p_is_available IS NULL OR p_is_available = true)
        AND p_display_order IS NULL AND p_is_featured IS NULL
      );
      IF v_is_empty THEN
        DELETE FROM public.location_category_item_overrides
        WHERE location_id = p_location_id AND category_id = p_category_id AND menu_item_id = p_menu_item_id;
        RETURN json_build_object('success', true, 'action', 'deleted', 'level', v_update_level, 'table', v_update_table);
      ELSE
        INSERT INTO public.location_category_item_overrides (
          location_id, category_id, menu_item_id,
          custom_price, custom_cash_price, custom_delivery_price, is_available,
          display_order, is_featured, created_at, updated_at
        ) VALUES (
          p_location_id, p_category_id, p_menu_item_id,
          p_custom_price, p_custom_cash_price, p_custom_delivery_price, p_is_available,
          p_display_order, p_is_featured, NOW(), NOW()
        )
        ON CONFLICT (location_id, category_id, menu_item_id)
        DO UPDATE SET
          custom_price = EXCLUDED.custom_price,
          custom_cash_price = EXCLUDED.custom_cash_price,
          custom_delivery_price = EXCLUDED.custom_delivery_price,
          is_available = EXCLUDED.is_available,
          display_order = EXCLUDED.display_order,
          is_featured = EXCLUDED.is_featured,
          updated_at = NOW();
      END IF;
    ELSIF p_location_id IS NOT NULL AND p_menu_id IS NOT NULL THEN
      v_update_level := 5;
      v_update_table := 'location_menu_item_overrides';
      SELECT location_id INTO v_menu_location_id FROM public.menus WHERE id = p_menu_id;
      IF v_menu_location_id IS NOT NULL THEN
        RETURN json_build_object('success', false, 'error', 'Use category_items for location-owned menus');
      END IF;
      v_is_empty := (
        p_custom_price IS NULL AND p_custom_cash_price IS NULL AND p_custom_delivery_price IS NULL
        AND (p_is_available IS NULL OR p_is_available = true)
      );
      IF v_is_empty THEN
        DELETE FROM public.location_menu_item_overrides
        WHERE location_id = p_location_id AND menu_id = p_menu_id
          AND category_id = p_category_id AND menu_item_id = p_menu_item_id;
        RETURN json_build_object('success', true, 'action', 'deleted', 'level', v_update_level, 'table', v_update_table);
      ELSE
        INSERT INTO public.location_menu_item_overrides (
          location_id, menu_id, category_id, menu_item_id,
          custom_price, custom_cash_price, custom_delivery_price, is_available,
          created_at, updated_at
        ) VALUES (
          p_location_id, p_menu_id, p_category_id, p_menu_item_id,
          p_custom_price, p_custom_cash_price, p_custom_delivery_price, COALESCE(p_is_available, true),
          NOW(), NOW()
        )
        ON CONFLICT (location_id, menu_id, category_id, menu_item_id)
        DO UPDATE SET
          custom_price = EXCLUDED.custom_price,
          custom_cash_price = EXCLUDED.custom_cash_price,
          custom_delivery_price = EXCLUDED.custom_delivery_price,
          is_available = EXCLUDED.is_available,
          updated_at = NOW();
      END IF;
    END IF;
  END IF;
  RETURN json_build_object(
    'success', true, 'action', 'upserted',
    'level', v_update_level, 'table', v_update_table,
    'menu_item_id', p_menu_item_id, 'category_id', p_category_id,
    'menu_id', p_menu_id, 'location_id', p_location_id
  );
END;
$function$;

NOTIFY pgrst, 'reload schema';;
