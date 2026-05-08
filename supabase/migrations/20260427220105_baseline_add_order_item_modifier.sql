CREATE OR REPLACE FUNCTION public.add_order_item_modifier(
  p_order_item_id uuid,
  p_modifier_group_id uuid,
  p_modifier_item_id uuid,
  p_modifier_group_name text,
  p_modifier_name text,
  p_price_modifier numeric,
  p_quantity integer DEFAULT 1
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order_id UUID;
  v_item_quantity INTEGER;
  v_price_paid NUMERIC(10, 2);
  v_modifier_id UUID;
  v_new_modifier_total NUMERIC(10, 2);
  v_new_subtotal NUMERIC(10, 2);
  v_result JSON;
BEGIN
  SELECT oi.order_id, oi.quantity, oi.price_paid
  INTO v_order_id, v_item_quantity, v_price_paid
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.id = p_order_item_id
    AND oi.is_voided = FALSE
    AND o.merchant_id = user_merchant_id()
    AND o.location_id = ANY(user_location_ids())
    AND o.status NOT IN ('completed', 'cancelled', 'void');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order item not found or cannot be modified';
  END IF;

  INSERT INTO public.order_item_modifiers (
    order_item_id, modifier_group_id, modifier_item_id,
    modifier_group_name, modifier_name, price_modifier, quantity, total_price
  ) VALUES (
    p_order_item_id, p_modifier_group_id, p_modifier_item_id,
    p_modifier_group_name, p_modifier_name, p_price_modifier, p_quantity,
    p_price_modifier * p_quantity
  )
  RETURNING id INTO v_modifier_id;

  SELECT COALESCE(SUM(total_price), 0)
  INTO v_new_modifier_total
  FROM public.order_item_modifiers
  WHERE order_item_id = p_order_item_id;

  v_new_subtotal := (v_item_quantity * v_price_paid) + (v_item_quantity * v_new_modifier_total);

  UPDATE public.order_items
  SET subtotal = v_new_subtotal, updated_at = NOW()
  WHERE id = p_order_item_id;

  SELECT json_build_object(
    'success', true,
    'modifier_id', v_modifier_id,
    'order_item_id', p_order_item_id,
    'modifier_name', p_modifier_name,
    'modifier_total', v_new_modifier_total,
    'new_subtotal', v_new_subtotal
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.add_order_item_modifier(uuid, uuid, uuid, text, text, numeric, integer) TO authenticated;

COMMENT ON FUNCTION public.add_order_item_modifier IS
  'Adds a modifier to an order item and recalculates subtotal. Baselined into repo 2026-04-27 from prod.';;
