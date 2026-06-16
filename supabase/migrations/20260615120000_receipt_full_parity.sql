-- Extend get_public_receipt so the guest /receipts page can render the SAME
-- totals, item detail, and payment lines as the dashboard receipt (AC#3 parity).
--
-- Adds:
--   order:    dual-pricing lane columns (card_*/cash_*), amount_paid/amount_due
--             (the bare subtotal/tax/total + discount/service_charge/tip are
--             already returned). These feed getOrderBreakdown so a single-lane
--             total foots on dual / mixed-tender orders.
--   items:    per-item discount_amount/discount_name, selected_size_name,
--             special_instructions, seat_number, course_number.
--   modifiers: modifier id (for stable keys).
--   payments: is_cash_priced (lane resolution), id, card_type already present.
--
-- Also keeps template_header/template_footer/timezone from the prior migration.
-- No table changes — function body only.

CREATE OR REPLACE FUNCTION public.get_public_receipt(
  p_order_token  text,
  p_send_token   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_order_id  uuid;
  v_result    jsonb;
BEGIN
  SELECT id INTO v_order_id
    FROM public.orders
  WHERE receipt_token = p_order_token;

  IF v_order_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_send_token IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.receipt_sends
      WHERE order_id   = v_order_id
        AND send_token = p_send_token
    ) THEN
      RETURN NULL;
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'order', jsonb_build_object(
      'display_number',       o.display_number,
      'order_number',         o.order_number,
      'order_type',           o.order_type,
      'created_at',           o.created_at,
      'status',               o.status,
      'payment_status',       o.payment_status,
      'voided_at',            o.voided_at,
      'void_reason',          o.void_reason,
      'subtotal',             o.subtotal,
      'tax_amount',           o.tax_amount,
      'tip_amount',           o.tip_amount,
      'discount_amount',      o.discount_amount,
      'service_charge',       o.service_charge,
      'total_amount',         o.total_amount,
      'effective_subtotal',   o.effective_subtotal,
      'effective_tax_amount', o.effective_tax_amount,
      'effective_total',      o.effective_total,
      'payment_pricing_mode', o.payment_pricing_mode,
      'cash_total',           o.cash_total,
      'card_total',           o.card_total,
      'cash_subtotal',        o.cash_subtotal,
      'card_subtotal',        o.card_subtotal,
      'cash_tax_amount',      o.cash_tax_amount,
      'card_tax_amount',      o.card_tax_amount,
      'amount_paid',          o.amount_paid,
      'amount_due',           o.amount_due
    ),
    'location', jsonb_build_object(
      'name',          l.name,
      'address_line1', l.address_line1,
      'address_line2', l.address_line2,
      'city',          l.city,
      'state',         l.state,
      'postal_code',   l.postal_code,
      'phone',         l.phone,
      'timezone',      l.timezone
    ),
    'template_header', (
      SELECT rt.header_text FROM public.receipt_templates rt
       WHERE rt.location_id = o.location_id
         AND rt.template_type = 'sale'
         AND rt.is_active = true
       LIMIT 1
    ),
    'template_footer', (
      SELECT rt.footer_text FROM public.receipt_templates rt
       WHERE rt.location_id = o.location_id
         AND rt.template_type = 'sale'
         AND rt.is_active = true
       LIMIT 1
    ),
    'logo_url', org."imageURL",
    'items', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',                  oi.id,
          'item_name',           oi.item_name,
          'quantity',            oi.quantity,
          'unit_price',          oi.unit_price,
          'subtotal',            oi.subtotal,
          'is_voided',           oi.is_voided,
          'discount_amount',     oi.discount_amount,
          'discount_name',       oi.discount_name,
          'selected_size_name',  oi.selected_size_name,
          'special_instructions',oi.special_instructions,
          'seat_number',         oi.seat_number,
          'course_number',       oi.course_number,
          'modifiers',  COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id',                  oim.id,
                'modifier_group_name', oim.modifier_group_name,
                'modifier_name',       oim.modifier_name,
                'price_modifier',      oim.price_modifier,
                'quantity',            oim.quantity,
                'is_no',               oim.is_no
              )
            )
            FROM public.order_item_modifiers oim
          WHERE oim.order_item_id = oi.id
          ), '[]'::jsonb)
        )
        ORDER BY oi.created_at
      )
      FROM public.order_items oi
    WHERE oi.order_id = v_order_id
    ), '[]'::jsonb),
    'payments', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',                op.id,
          'payment_method',    op.payment_method,
          'amount',            op.amount,
          'tip_amount',        op.tip_amount,
          'total_amount',      op.total_amount,
          'status',            op.status,
          'is_cash_priced',    op.is_cash_priced,
          'card_type',         op.card_type,
          'card_last_four',    op.card_last_four,
          'terminal_type',     op.terminal_type,
          'authorization_code',op.authorization_code,
          'refunded_amount',   op.refunded_amount,
          'refunded_at',       op.refunded_at
        )
        ORDER BY op.id
      )
      FROM public.order_payments op
    WHERE op.order_id = v_order_id
      AND op.status IN ('captured', 'paid', 'refunded', 'partially_refunded')

    ), '[]'::jsonb)
  )
  INTO v_result
  FROM public.orders o
  JOIN public.locations l   ON l.id = o.location_id
  JOIN public.merchants m   ON m.id = o.merchant_id
  LEFT JOIN public.organizations org ON org.id = m.clerk_org_id
  WHERE o.id = v_order_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_receipt(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_receipt(text, text) TO anon, authenticated;
