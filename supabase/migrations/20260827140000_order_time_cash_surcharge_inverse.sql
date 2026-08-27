-- Align POS order-time cash derivation with the reverted dual-pricing model.
--
-- 20260827120000 reverted dual pricing to cash-as-base (surcharge): card = cash
-- × (1 + pct/100), inverse cash = card / (1 + pct/100). The order-time RPCs
-- add_open_item_v3 / update_order_item_v2 / update_order_item_v3 already use the
-- inverse (20260706130000), but these still derive cash with the OLD discount
-- fallback `card * (1 - rate)`:
--   • add_order_item_v2                 (3rd-fallback when no explicit/stored cash)
--   • add_order_item_v3  (both overloads)
--   • add_open_item_v2                  (legacy; primary derivation)
--   • calculate_order_dual_totals       (fallback when order_items.cash_price NULL)
-- (add_order_item_v4 / add_open_item_v4 delegate to v3, so they inherit the fix.)
--
-- Fix = flip that one expression per function to ROUND(card / (1 + rate), 2),
-- matching the already-fixed sibling RPCs. POS-only surfaces; the web repo never
-- calls these (storefront online orders are card-only). NO historical backfill —
-- order_items rows are immutable financial records; only new orders are affected.
--
-- Implemented as an in-place rewrite of the live bodies (rather than restating 5
-- large functions) so it is minimal, self-verifying, and robust to the known
-- staging/prod body drift — it edits whatever CREATE OR REPLACE body is live.

DO $mig$
DECLARE
  r        record;
  v_def    text;
  v_count  int;
BEGIN
  FOR r IN
    SELECT p.oid,
           p.oid::regprocedure::text AS sig,
           CASE WHEN p.proname = 'calculate_order_dual_totals'
                THEN 'oi.unit_price * (1 - v_cash_discount_rate)'
                ELSE 'p_unit_price * (1 - v_cash_discount_rate)' END AS old_expr,
           CASE WHEN p.proname = 'calculate_order_dual_totals'
                THEN 'ROUND(oi.unit_price / (1 + v_cash_discount_rate), 2)'
                ELSE 'ROUND(p_unit_price / (1 + v_cash_discount_rate), 2)' END AS new_expr
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('add_order_item_v2','add_order_item_v3',
                        'add_open_item_v2','calculate_order_dual_totals')
  LOOP
    v_def   := pg_get_functiondef(r.oid);
    v_count := (length(v_def) - length(replace(v_def, r.old_expr, ''))) / length(r.old_expr);

    IF v_count = 1 THEN
      -- CREATE OR REPLACE preserves grants/owner/settings.
      EXECUTE replace(v_def, r.old_expr, r.new_expr);
      RAISE NOTICE 'patched % (discount -> surcharge inverse)', r.sig;
    ELSIF v_count = 0 THEN
      RAISE NOTICE 'skipped % (no discount expr; already inverse?)', r.sig;
    ELSE
      RAISE EXCEPTION 'refusing to patch %: expected 1 discount expr, found %', r.sig, v_count;
    END IF;
  END LOOP;
END
$mig$;

-- Guard: no live target may still carry the discount expression.
DO $verify$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ')
    INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('add_order_item_v2','add_order_item_v3',
                       'add_open_item_v2','calculate_order_dual_totals')
     AND pg_get_functiondef(p.oid) LIKE '%* (1 - v_cash_discount_rate)%';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'order-time cash still on discount model in: %', v_bad;
  END IF;
END
$verify$;
