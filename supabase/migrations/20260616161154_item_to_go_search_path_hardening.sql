CREATE OR REPLACE FUNCTION toggle_to_go_order_items(
  p_order_item_ids UUID[],
  p_is_to_go BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_order_id UUID;
BEGIN
  UPDATE order_items
  SET is_to_go = p_is_to_go,
      updated_at = NOW()
  WHERE id = ANY(p_order_item_ids);

  FOR v_order_id IN
    SELECT DISTINCT order_id
    FROM order_items
    WHERE id = ANY(p_order_item_ids)
  LOOP
    UPDATE orders
    SET updated_at = NOW(),
        sync_version = COALESCE(sync_version, 0) + 1
    WHERE id = v_order_id;
  END LOOP;
END;
$$;
