-- Wave E — stuck-session watchdog + paid_at-coverage metric.
--
-- Reusable views for the daily monitor. The first flags the exact failure this
-- initiative fixes: an order that is server-terminal (paid, amount_due≈0) whose
-- table_session is still active+paid past 30 minutes — a table dead on the floor.
-- The second makes Wave C's stamping fix observable (share of sessions with a
-- non-NULL paid_at should climb from ~0). Both are location-scoped so the
-- monitor can filter to Charcoal (or any pilot).

CREATE OR REPLACE VIEW public.v_stuck_paid_active_sessions AS
SELECT
  ts.location_id,
  fpo.name              AS table_name,
  ts.id                 AS session_id,
  o.id                  AS order_id,
  o.order_number,
  ts.status             AS session_status,
  o.payment_status,
  o.amount_due,
  ts.paid_at,
  o.updated_at,
  now() - o.updated_at  AS stuck_for
FROM public.table_sessions ts
JOIN public.table_session_tables tst ON tst.session_id = ts.id AND tst.is_primary
JOIN public.floor_plan_objects fpo   ON fpo.id = tst.table_id
JOIN public.orders o                 ON o.id = ts.order_id
WHERE ts.is_active
  AND ts.status = 'paid'
  AND o.payment_status = 'paid'
  AND o.amount_due <= 0.01
  AND o.updated_at < now() - interval '30 minutes';

COMMENT ON VIEW public.v_stuck_paid_active_sessions IS
  'Wave E watchdog — server-paid orders whose table_session is still active+paid '
  '>30min (the auto-clear-after-pay phantom-balance failure). Expect zero rows.';

CREATE OR REPLACE VIEW public.v_session_paid_at_coverage AS
SELECT
  location_id,
  count(*) FILTER (WHERE paid_at IS NOT NULL) AS stamped,
  count(*)                                    AS total,
  round(
    100.0 * count(*) FILTER (WHERE paid_at IS NOT NULL) / NULLIF(count(*), 0),
    1
  )                                           AS pct_stamped
FROM public.table_sessions
WHERE status IN ('paid', 'available', 'cleaning')
  AND seated_at >= now() - interval '7 days'
GROUP BY location_id;

COMMENT ON VIEW public.v_session_paid_at_coverage IS
  'Wave E metric — 7-day paid_at stamping coverage per location. Rises from ~0 '
  'once Wave C routes auto-clear through the event projector + backfill lands.';

GRANT SELECT ON public.v_stuck_paid_active_sessions TO service_role;
GRANT SELECT ON public.v_session_paid_at_coverage   TO service_role;
