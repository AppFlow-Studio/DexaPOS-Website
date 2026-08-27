-- =============================================================================
-- Staging verification for 20260827120000_hq_kds_board_mirror.sql
-- =============================================================================
-- Run top to bottom on STAGING after the migration is applied. Every check
-- prints a verdict column; nothing here mutates business data. Check 6 is the
-- only one that attempts a write, and it is expected to FAIL.
--
-- The live mirror rendering correctly proves the READ path. This script is
-- about the WRITE path -- the capture triggers -- which sits on the order send
-- and the cook's bump, and is therefore the part that can hurt.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. Objects installed, and installed as the RIGHT KIND of trigger
-- ---------------------------------------------------------------------------
-- The arrival triggers must be CONSTRAINT triggers, DEFERRABLE and INITIALLY
-- DEFERRED. If they came out as plain row triggers, capture runs mid-statement
-- and every snapshot will be missing items from its own send.

SELECT
  t.tgname,
  t.tgconstraint <> 0            AS is_constraint_trigger,
  t.tgdeferrable                 AS is_deferrable,
  t.tginitdeferred               AS is_initially_deferred,
  CASE
    WHEN t.tgconstraint <> 0 AND t.tgdeferrable AND t.tginitdeferred
      THEN 'PASS'
    ELSE 'FAIL'
  END                            AS verdict
FROM pg_trigger t
WHERE t.tgrelid = 'public.order_items'::regclass
  AND t.tgname LIKE 'trg_kds_board_snapshot%'
ORDER BY t.tgname;
-- Expect: exactly 2 rows, both PASS.


-- ---------------------------------------------------------------------------
-- 2. Are snapshots being written at all, and with honest reasons?
-- ---------------------------------------------------------------------------
SELECT
  reason,
  count(*)              AS rows,
  min(captured_at)      AS first_seen,
  max(captured_at)      AS last_seen
FROM public.kds_board_snapshots
GROUP BY reason
ORDER BY rows DESC;
-- Expect: item_arrived present after any send. item_ready / item_served
-- present after a cook bumps. If item_arrived is the ONLY reason, the
-- bulk_update_order_item_status_v2 capture is not firing -- go to check 5.


-- ---------------------------------------------------------------------------
-- 3. THE IMPORTANT ONE -- a multi-item send must produce ONE snapshot per
--    display, and that snapshot must contain EVERY item of the send.
-- ---------------------------------------------------------------------------
-- This is the regression the commit-time design exists to prevent. A row-level
-- capture would snapshot after item 1 and silently omit the rest.
WITH last_send AS (
  SELECT
    oi.order_id,
    count(*)                        AS items_fired,
    max(oi.sent_to_kitchen_at)      AS fired_at
  FROM public.order_items oi
  WHERE oi.sent_to_kitchen_at > now() - interval '24 hours'
  GROUP BY oi.order_id
  HAVING count(*) > 1
  ORDER BY max(oi.sent_to_kitchen_at) DESC
  LIMIT 1
),
fired_items AS (
  SELECT ls.order_id, ls.items_fired, oi.id AS order_item_id
  FROM last_send ls
  JOIN public.order_items oi ON oi.order_id = ls.order_id
  WHERE oi.sent_to_kitchen_at IS NOT NULL
),
snaps AS (
  SELECT s.id, s.kds_display_id, s.captured_at, s.board, s.order_id
  FROM public.kds_board_snapshots s
  JOIN last_send ls ON ls.order_id = s.order_id
  WHERE s.reason = 'item_arrived'
),
board_items AS (
  SELECT
    s.id                            AS snapshot_id,
    s.kds_display_id,
    (it->>'id')::uuid               AS order_item_id
  FROM snaps s
  CROSS JOIN LATERAL jsonb_array_elements(s.board) AS ticket
  CROSS JOIN LATERAL jsonb_array_elements(ticket->'items') AS it
)
SELECT
  s.kds_display_id,
  count(DISTINCT s.id)                                  AS snapshots_for_this_send,
  max(fi.items_fired)                                   AS items_in_send,
  count(DISTINCT bi.order_item_id) FILTER (
    WHERE bi.order_item_id IN (SELECT order_item_id FROM fired_items)
  )                                                     AS items_present_on_board,
  CASE
    WHEN count(DISTINCT s.id) = 1
     AND count(DISTINCT bi.order_item_id) FILTER (
           WHERE bi.order_item_id IN (SELECT order_item_id FROM fired_items)
         ) = max(fi.items_fired)
      THEN 'PASS'
    WHEN count(DISTINCT s.id) > 1
      THEN 'FAIL - more than one snapshot per display (batching broken)'
    ELSE 'FAIL - snapshot is missing items from its own send'
  END                                                   AS verdict
FROM snaps s
LEFT JOIN board_items bi ON bi.snapshot_id = s.id
CROSS JOIN (SELECT max(items_fired) AS items_fired FROM fired_items) fi
GROUP BY s.kds_display_id;
-- Expect: one row per active display, all PASS.
-- Empty result = no multi-item send in 24h, or no snapshots written at all.


-- ---------------------------------------------------------------------------
-- 4. Hash dedupe is actually collapsing no-op captures
-- ---------------------------------------------------------------------------
SELECT
  kds_display_id,
  count(*)                        AS snapshots,
  count(DISTINCT board_hash)      AS distinct_boards,
  CASE
    WHEN count(*) = count(DISTINCT board_hash) THEN 'PASS - no duplicate boards stored'
    ELSE 'CHECK - repeated hashes exist (fine if non-adjacent; the guard only compares against the previous row)'
  END                             AS verdict
FROM public.kds_board_snapshots
GROUP BY kds_display_id;


-- ---------------------------------------------------------------------------
-- 5. The POS contract -- bulk_update_order_item_status_v2 must be unchanged
--    apart from the added capture call.
-- ---------------------------------------------------------------------------
-- This function is on the cook's bump path. If its return shape drifted, the
-- tablet breaks. Confirm all five original keys are still built.
SELECT
  key,
  position(key IN pg_get_functiondef(
    'public.bulk_update_order_item_status_v2(uuid[],text,uuid,uuid,integer)'::regprocedure
  )) > 0 AS present
FROM unnest(ARRAY[
  '''updated_count''',
  '''requested_count''',
  '''kds_updated_count''',
  '''affected_order_ids''',
  '''status'''
]) AS key;
-- Expect: all five present = true.
-- Then bump a real ticket from the tablet and confirm it behaves normally AND
-- that check 2 now shows item_ready / item_served rows.


-- ---------------------------------------------------------------------------
-- 6. Append-only guard -- THIS ONE IS EXPECTED TO ERROR
-- ---------------------------------------------------------------------------
-- Expect: ERROR "KDS trace ledgers are append-only" (SQLSTATE 2F003 /
-- restrict_violation). If it SUCCEEDS, the ledger is mutable and the guard
-- trigger did not attach -- that is a finding.
UPDATE public.kds_board_snapshots
   SET reason = 'manual'
 WHERE id = (SELECT id FROM public.kds_board_snapshots LIMIT 1);


-- ---------------------------------------------------------------------------
-- 7. Retention is scheduled, and the purge runs
-- ---------------------------------------------------------------------------
SELECT jobname, schedule, command
FROM cron.job
WHERE jobname LIKE 'kds-%'
ORDER BY jobname;
-- Expect: kds-board-snapshot-purge at '45 3 * * *'.

SELECT public.purge_kds_board_snapshots();
-- Expect: {"board_snapshots_deleted": N}. On fresh staging N is 0 -- the point
-- is that it does not raise, which proves the retention GUC opens the guard.


-- ---------------------------------------------------------------------------
-- 8. Storage growth, to sanity-check the 14-day retention
-- ---------------------------------------------------------------------------
SELECT
  count(*)                                                   AS snapshots,
  pg_size_pretty(pg_total_relation_size('public.kds_board_snapshots')) AS total_size,
  pg_size_pretty(avg(pg_column_size(board))::bigint)         AS avg_board_size,
  pg_size_pretty(
    (avg(pg_column_size(board)) * count(*)
      / GREATEST(EXTRACT(EPOCH FROM (max(captured_at) - min(captured_at))) / 86400, 1)
      * 14)::bigint
  )                                                          AS projected_14d
FROM public.kds_board_snapshots;
-- Sanity only. If projected_14d looks alarming on a busy store, shorten the
-- interval in purge_kds_board_snapshots() to 7 days.


-- ---------------------------------------------------------------------------
-- 9. Send-path cost -- what each snapshot actually costs at COMMIT
-- ---------------------------------------------------------------------------
-- Substitute a real location and display id.
-- EXPLAIN ANALYZE SELECT public.get_kds_tickets_v3(
--   '<location_id>'::uuid,
--   ARRAY['sent','preparing','ready']::text[],
--   '<kds_display_id>'::uuid
-- );
-- Multiply by the number of ACTIVE displays at that location -- that is the
-- added latency per send transaction. Single-digit ms per display is expected
-- (v3 is location-scoped). Tens of ms per display means something regressed in
-- v3 itself and is worth chasing before this ships to prod.


-- =============================================================================
-- NOT COVERED HERE -- must be tested through the app, not SQL
-- =============================================================================
--   * Access control. Everything above runs as a privileged role, so the
--     is_dexapos_admin() gate is never exercised. Sign in as a NON-HQ user and
--     confirm /manage/support/kds-mirror is refused, and that a merchant user
--     cannot see another merchant's snapshots.
--   * The HQ-only cross-link on the order detail page renders for HQ support
--     and is absent for a merchant user.
--   * Capture-failure isolation: temporarily break capture_kds_board_snapshot
--     (e.g. point it at a non-existent column on a scratch copy) and confirm a
--     send still COMMITS with only a WARNING. Do this on staging only.
-- =============================================================================
