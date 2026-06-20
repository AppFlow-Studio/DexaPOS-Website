-- send_order_to_kitchen_v1: collapses the 3-call send-to-kitchen chain
-- (update_order_status RPC → verify SELECT → bulk_update_order_item_status_v2)
-- into ONE transaction. Item/KDS/order-cascade behavior comes from composing
-- the existing deployed bulk_update_order_item_status_v2 — full parity.
--
-- Design notes (persona-reviewed, perf Phase 3 Wave B):
--  * Status whitelist (22023): kills enum-cast poison retries AND a
--    draft→completed payment-gating bypass from a buggy client.
--  * Not-found raises 22023 (NOT default P0001): legacy call sites treat
--    P0001 as benign "already in status"; a missing order must stay a
--    distinct, non-retryable failure.
--  * Tenant guard mirrors process_payment_v15 (free — we SELECT the row
--    anyway). Service-role calls (user_merchant_id() IS NULL) bypass the
--    guard so internal tooling/tests behave like other kitchen RPCs.
--  * p_items_idempotency_key: the inner v2 call claims under the SAME
--    (sortedItemIds,status)-derived key legacy callers use
--    (toBulkUpdateStatusKey), so a stale legacy-format queued op replaying
--    after a composite send hits v2's cache instead of re-executing —
--    otherwise it would reset fire_time mid-rollout.
--  * Lock order: orders → order_items, same as process_payment_v15.
--    Standalone v2 KDS bumps (items → orders cascade) can deadlock against
--    this (~1s 40P01); client classifies 40P01 as transient/retryable.
--  * Draft transition mirrors update_order_status's timestamp semantics
--    INCLUDING started_preparing_at for 2-step KDS mode ('preparing'
--    target) — the inner v2 call skips its cascade on an empty item array,
--    so this must not rely on it.
CREATE OR REPLACE FUNCTION public.send_order_to_kitchen_v1(
  p_order_id uuid,
  p_order_status text,
  p_order_item_ids uuid[],
  p_item_status text,
  p_staff_id uuid DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL,
  p_items_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cached jsonb;
  v_current text;
  v_caller_merchant uuid;
  v_items_result jsonb;
BEGIN
  IF p_order_status NOT IN ('sent_to_kitchen', 'preparing') THEN
    RAISE EXCEPTION 'Invalid order status for kitchen send: %', p_order_status
      USING ERRCODE = '22023';
  END IF;

  IF p_item_status NOT IN ('sent', 'preparing') THEN
    RAISE EXCEPTION 'Invalid item status for kitchen send: %', p_item_status
      USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    v_cached := public._idempotency_claim(p_idempotency_key, 'send_order_to_kitchen_v1');
    IF v_cached IS NOT NULL THEN
      RETURN v_cached;
    END IF;
  END IF;

  v_caller_merchant := public.user_merchant_id();

  SELECT status::text INTO v_current
  FROM public.orders o
  WHERE o.id = p_order_id
    AND (
      v_caller_merchant IS NULL  -- service-role / internal: no JWT context
      OR (
        o.merchant_id = v_caller_merchant
        AND o.location_id = ANY(public.user_location_ids())
      )
    )
  FOR UPDATE;

  IF v_current IS NULL THEN
    RAISE EXCEPTION 'Order not found or not accessible: %', p_order_id
      USING ERRCODE = '22023';
  END IF;

  IF v_current = 'draft' THEN
    UPDATE public.orders
    SET status = p_order_status::order_status,
        sent_to_kitchen_at = COALESCE(sent_to_kitchen_at, NOW()),
        started_preparing_at = CASE
          WHEN p_order_status = 'preparing'
            THEN COALESCE(started_preparing_at, NOW())
          ELSE started_preparing_at
        END,
        updated_at = NOW()
    WHERE id = p_order_id;
  END IF;

  -- Same-transaction item + KDS + order-cascade update via the deployed v2.
  -- Both idempotency claims commit/roll back atomically with this txn.
  -- p_expected_sync_version NULL skips v2's optimistic-concurrency gate
  -- (the composite's FOR UPDATE already serializes writers on this order).
  v_items_result := public.bulk_update_order_item_status_v2(
    p_order_item_ids,
    p_item_status,
    p_staff_id,
    p_items_idempotency_key,
    NULL
  );

  v_items_result := v_items_result || jsonb_build_object(
    'order_id', p_order_id,
    'order_was_draft', (v_current = 'draft')
  );

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public._idempotency_complete(
      p_idempotency_key, 'send_order_to_kitchen_v1', v_items_result
    );
  END IF;

  RETURN v_items_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.send_order_to_kitchen_v1(uuid, text, uuid[], text, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_order_to_kitchen_v1(uuid, text, uuid[], text, uuid, uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.send_order_to_kitchen_v1(uuid, text, uuid[], text, uuid, uuid, uuid) IS
  'Composite send-to-kitchen: transitions the order out of draft and bulk-updates item kitchen statuses (via bulk_update_order_item_status_v2) in one transaction. Idempotent via _idempotency_claim under op send_order_to_kitchen_v1; the inner v2 call claims under the legacy toBulkUpdateStatusKey for cross-path dedupe during rollout.';
