-- Lane G1 + G3: orphan-order diagnostics and cleanup.
--
-- Run order:
--   1. Section A (read-only) — sample paid-but-zero-payment-rows for Sentry trace.
--   2. Section B (read-only) — quantify the cleanup scope per env.
--   3. Section C (writes)    — cleanup queries. RUN ONLY ON STAGING.
--                              Wrap in BEGIN/COMMIT and verify counts before COMMIT.
--   4. After Section C succeeds on staging, deploy:
--        20260501000006_lane_g_enforce_order_math.sql
--      so future orders cannot drift back into these states.
--
-- Numbers in the original ticket: 128 paid orders with zero payment rows,
-- 3 orders stuck on 'paid' after all payments voided (covered by G2 fix in
-- 20260501000005), and 25 amount_due-positive 'paid' rows.

-- =============================================================================
-- Section A. G1 — sample 5 paid-orders-with-zero-payment-rows for trace
-- =============================================================================

select
  o.id,
  o.order_number,
  o.merchant_id,
  o.location_id,
  o.payment_status,
  o.amount_paid,
  o.amount_due,
  o.card_total,
  o.cash_total,
  o.created_at,
  o.updated_at
from public.orders o
where o.payment_status = 'paid'
  and not exists (
    select 1
    from public.order_payments op
    where op.order_id = o.id
      and op.status = 'captured'
      and coalesce(op.is_voided, false) = false
  )
order by o.updated_at desc
limit 5;

-- For each id above, query Sentry / server logs for:
--   - process_payment_v8 calls returning success
--   - void_payment calls
--   - apply_refund_to_payment / complete_reversal calls
-- Tag the order_id in the search to scope the trace.

-- =============================================================================
-- Section B. Cleanup scope — quantify before any write
-- =============================================================================

-- Group 1: payment_status='paid' with no captured non-voided payments.
select count(*) as truly_orphaned_paid_count
from public.orders o
where o.payment_status = 'paid'
  and not exists (
    select 1
    from public.order_payments op
    where op.order_id = o.id
      and op.status = 'captured'
      and coalesce(op.is_voided, false) = false
  );

-- Group 2: payment_status='paid' but amount_due > 0.01 (math drift).
select count(*) as paid_with_amount_due_count,
       sum(amount_due) as drift_total
from public.orders o
where o.payment_status = 'paid'
  and coalesce(o.amount_due, 0) > 0.01;

-- Group 3: payment_status='paid' but amount_paid <= 0.01 (the G2 bug class).
select count(*) as paid_with_zero_amount_paid_count
from public.orders o
where o.payment_status = 'paid'
  and coalesce(o.amount_paid, 0) <= 0.01;

-- =============================================================================
-- Section C. Cleanup writes — STAGING ONLY. Review counts in Section B first.
-- =============================================================================
-- BEGIN;
--
-- -- C1. Orphans (no captured payments) → reset to pending.
-- with affected as (
--   select o.id
--     from public.orders o
--    where o.payment_status = 'paid'
--      and not exists (
--        select 1 from public.order_payments op
--         where op.order_id = o.id
--           and op.status = 'captured'
--           and coalesce(op.is_voided, false) = false
--      )
-- )
-- update public.orders o
--    set payment_status = 'pending',
--        updated_at     = now()
--   from affected a
--  where o.id = a.id;
--
-- -- C2. Math drift (paid + amount_due > 0) → recompute via existing helper.
-- -- update_order_payment_status_after_refund is the canonical recomputer; it
-- -- recomputes payment_status from current payments + refunds.
-- do $$
-- declare
--   r record;
-- begin
--   for r in
--     select id from public.orders
--      where payment_status = 'paid'
--        and coalesce(amount_due, 0) > 0.01
--   loop
--     perform public.update_order_payment_status_after_refund(r.id);
--   end loop;
-- end $$;
--
-- -- Verify before commit:
-- select count(*) from public.orders
--  where payment_status = 'paid'
--    and not exists (select 1 from public.order_payments op
--                     where op.order_id = orders.id
--                       and op.status = 'captured'
--                       and coalesce(op.is_voided, false) = false);
-- select count(*) from public.orders
--  where payment_status = 'paid'
--    and coalesce(amount_due, 0) > 0.01;
--
-- -- Both should be 0. If yes:
-- COMMIT;
-- -- Otherwise: ROLLBACK; investigate; re-run.

-- =============================================================================
-- Section D. Post-cleanup verification (run after Section C COMMIT)
-- =============================================================================

-- Should return 0 rows.
select 'truly_orphaned_paid' as bucket, count(*) as cnt
  from public.orders o
 where o.payment_status = 'paid'
   and not exists (
     select 1 from public.order_payments op
      where op.order_id = o.id
        and op.status = 'captured'
        and coalesce(op.is_voided, false) = false
   )
union all
select 'paid_with_amount_due', count(*)
  from public.orders
 where payment_status = 'paid'
   and coalesce(amount_due, 0) > 0.01
union all
select 'paid_with_zero_amount_paid', count(*)
  from public.orders
 where payment_status = 'paid'
   and coalesce(amount_paid, 0) <= 0.01;
