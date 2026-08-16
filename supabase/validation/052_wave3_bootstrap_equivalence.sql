-- =============================================================================
-- 052 — Wave 3 equivalence harness: get_pos_bootstrap_v1 vs get_pos_full_sync
-- =============================================================================
-- Companion to supabase/migrations/20260815140000_wave3_get_pos_bootstrap_v1.sql
-- (Notion [POS-PERF] AUD-1).
--
-- SELECT-ONLY. Nothing here writes. Safe to run against staging or prod.
--
-- WHAT IT PROVES
--   The menu tree get_pos_bootstrap_v1 composes in one pass is VALUE-IDENTICAL
--   to the tree get_pos_full_sync builds one menu at a time -- every price in
--   the five-level cascade, effective_availability, snooze state, override
--   flags, stock, the modifier subtree, and the display_order sequence.
--
--   It also proves the ONE intended difference is confined to sort-order TIES
--   (see §4) and checks the new envelope members (§5), the version contract
--   (§6) and the deduplicated modifier index (§7).
--
-- PASS CRITERIA
--   Every column whose name ends in _diffs or _mismatches must be 0, EXCEPT
--   §4's tie_position_swaps, which is informational (expect it to equal the
--   tie census from §4a). Any other non-zero value STOPS THIS WAVE.
--
-- ---------------------------------------------------------------------------
-- HOW TO RUN
-- ---------------------------------------------------------------------------
-- 1. Pick a MULTI-MENU location. Single-menu locations cannot exercise the
--    per-menu overlay (ci_menu / lmio / location-owned-menu branch) that the
--    N+1 removal had to preserve, so they prove almost nothing.
--
--    Prod census 2026-08-13, active menus per location:
--      5afc6641-e98f-4c81-8d9d-d9691b5c28dc  CHARCOAL GARDENIA        6 menus, 330 item tuples  <-- use this
--      153d066b-402c-4f85-bc12-60c84134407d  Hylan Blvf               5 menus, 130
--      94dd8b80-7a92-4ddf-981a-372d98a938d6  Saucy - 1144 Hylan Blvd  5 menus,  99
--      714c2c9d-45a2-4c87-9b0e-ba61254c8955  YALLAH HABIBI            2 menus, 114
--    Re-derive for staging; the UUIDs differ there. The literal below appears
--    once per section -- one find/replace changes them all.
--
-- 2. get_pos_bootstrap_v1 is SECURITY DEFINER behind an explicit gate
--    (service_role OR is_location_member OR user_has_location_permission).
--    A raw SQL-editor session carries no JWT, so auth.role() is NULL,
--    current_user_id() is NULL, and the function raises 42501. Impersonate
--    first -- auth.role() reads request.jwt.claims:
--
--      SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
--
--    Run that once at the top of the session, then the sections below.
--    Reset when finished:
--
--      SELECT set_config('request.jwt.claims', '', false);
--
--    Do NOT run the sections as a merchant JWT and conclude the gate is fine.
--    Gate coverage is a SEPARATE test: sign in as each real POS role (owner,
--    manager, cashier, KDS station) through the app and confirm a non-empty
--    menus array. That is the one risk this harness cannot cover, because the
--    old path was merchant-scoped via RLS and the new gate is location-scoped.
--
-- 3. IF THE HARNESS ROLE LACKS EXECUTE
--    Both RPCs currently grant EXECUTE to PUBLIC, so a normal session can call
--    them. If a future hardening pass (Wave 5) revokes that, or if you are
--    driving this through a restricted MCP/read-only role that cannot execute
--    SECURITY DEFINER functions, do NOT skip the section -- substitute the
--    inline body instead:
--      * old side: SELECT pg_get_functiondef('public.get_pos_full_sync(uuid)'::regprocedure);
--                  then paste its SELECT body in place of the `old_env` CTE.
--      * new side: copy §2f of the migration file (the WITH mod_items ... chain)
--                  in place of the `new_env` CTE.
--    Every section is written so `old_env` / `new_env` are the ONLY things that
--    need swapping; nothing downstream calls a function.
-- =============================================================================


-- =============================================================================
-- §1  SCALE SANITY — do both sides even describe the same catalog?
-- =============================================================================
-- Run this first. If the counts disagree, the deep diffs below will be noise.
WITH params AS (SELECT '5afc6641-e98f-4c81-8d9d-d9691b5c28dc'::uuid AS loc),
old_menus AS (
  SELECT (public.get_pos_full_sync(p.loc)::jsonb) -> 'menus' AS j FROM params p
),
new_menus AS (
  SELECT public.get_pos_bootstrap_v1(p.loc) -> 'menus' AS j FROM params p
)
SELECT
  (SELECT jsonb_array_length(j) FROM old_menus)                        AS old_menu_count,
  (SELECT jsonb_array_length(j) FROM new_menus)                        AS new_menu_count,
  (SELECT count(*) FROM old_menus, jsonb_array_elements(j) m,
          jsonb_array_elements(m->'categories') c)                     AS old_category_count,
  (SELECT count(*) FROM new_menus, jsonb_array_elements(j) m,
          jsonb_array_elements(m->'categories') c)                     AS new_category_count,
  (SELECT count(*) FROM old_menus, jsonb_array_elements(j) m,
          jsonb_array_elements(m->'categories') c,
          jsonb_array_elements(c->'items') i)                          AS old_item_count,
  (SELECT count(*) FROM new_menus, jsonb_array_elements(j) m,
          jsonb_array_elements(m->'categories') c,
          jsonb_array_elements(c->'items') i)                          AS new_item_count,
  (SELECT length(j::text) FROM old_menus)                              AS old_menus_bytes,
  (SELECT length(j::text) FROM new_menus)                              AS new_menus_bytes;
-- Prod 2026-08-13 for 5afc6641: 6 / 6, 59 / 59, 330 / 330, 1295053 / 1295053 bytes.


-- =============================================================================
-- §2  ITEM DEEP DIFF — the load-bearing test
-- =============================================================================
-- Flattens both trees to (menu_id, menu_category_id, category_item_id) and
-- compares. Ordering cannot mask a difference here: rows are matched by key,
-- not by position.
--
-- whole_item_diffs covers everything at once. The per-field columns exist so a
-- failure tells you WHICH part of the cascade drifted instead of just "not
-- equal". modifier_subtree_diffs is the one most likely to move, since that is
-- the subquery the wave hoisted.
WITH params AS (SELECT '5afc6641-e98f-4c81-8d9d-d9691b5c28dc'::uuid AS loc),
old_env AS (SELECT (public.get_pos_full_sync(p.loc)::jsonb) -> 'menus' AS j FROM params p),
new_env AS (SELECT public.get_pos_bootstrap_v1(p.loc)      -> 'menus' AS j FROM params p),
old_items AS (
  SELECT m->>'id' AS menu_id, c->>'id' AS mc_id, i->>'id' AS ci_id, i AS item
  FROM old_env, jsonb_array_elements(j) m,
       jsonb_array_elements(m->'categories') c,
       jsonb_array_elements(c->'items') i
),
new_items AS (
  SELECT m->>'id' AS menu_id, c->>'id' AS mc_id, i->>'id' AS ci_id, i AS item
  FROM new_env, jsonb_array_elements(j) m,
       jsonb_array_elements(m->'categories') c,
       jsonb_array_elements(c->'items') i
),
pairs AS (
  SELECT o.item AS o, n.item AS n
  FROM old_items o
  FULL JOIN new_items n
    ON n.menu_id = o.menu_id AND n.mc_id = o.mc_id AND n.ci_id = o.ci_id
)
SELECT
  count(*) FILTER (WHERE o IS NULL OR n IS NULL)                       AS key_mismatches,
  count(*) FILTER (WHERE o IS DISTINCT FROM n)                         AS whole_item_diffs,
  -- the five-level price cascade
  count(*) FILTER (WHERE o->'menu_item'->'effective_price'
                      IS DISTINCT FROM n->'menu_item'->'effective_price')          AS effective_price_diffs,
  count(*) FILTER (WHERE o->'menu_item'->'effective_cash_price'
                      IS DISTINCT FROM n->'menu_item'->'effective_cash_price')     AS effective_cash_price_diffs,
  count(*) FILTER (WHERE o->'menu_item'->'effective_delivery_price'
                      IS DISTINCT FROM n->'menu_item'->'effective_delivery_price') AS effective_delivery_price_diffs,
  count(*) FILTER (WHERE o->'menu_item'->'price_levels'
                      IS DISTINCT FROM n->'menu_item'->'price_levels')             AS price_levels_diffs,
  count(*) FILTER (WHERE o->'menu_item'->'price_source'
                      IS DISTINCT FROM n->'menu_item'->'price_source')             AS price_source_diffs,
  -- availability + 86/snooze
  count(*) FILTER (WHERE o->'menu_item'->'effective_availability'
                      IS DISTINCT FROM n->'menu_item'->'effective_availability')   AS effective_availability_diffs,
  count(*) FILTER (WHERE o->'menu_item'->'snoozed_until'
                      IS DISTINCT FROM n->'menu_item'->'snoozed_until')            AS item_snoozed_until_diffs,
  count(*) FILTER (WHERE o->'menu_item'->'snooze_reason'
                      IS DISTINCT FROM n->'menu_item'->'snooze_reason')            AS item_snooze_reason_diffs,
  -- override flags + stock
  count(*) FILTER (WHERE o->'menu_item'->'has_location_item_override'
                      IS DISTINCT FROM n->'menu_item'->'has_location_item_override'
                   OR o->'menu_item'->'has_category_override'
                      IS DISTINCT FROM n->'menu_item'->'has_category_override'
                   OR o->'menu_item'->'has_menu_category_override'
                      IS DISTINCT FROM n->'menu_item'->'has_menu_category_override'
                   OR o->'menu_item'->'has_location_category_override'
                      IS DISTINCT FROM n->'menu_item'->'has_location_category_override'
                   OR o->'menu_item'->'has_location_menu_override'
                      IS DISTINCT FROM n->'menu_item'->'has_location_menu_override')AS override_flag_diffs,
  count(*) FILTER (WHERE o->'menu_item'->'stock_tracking_mode'
                      IS DISTINCT FROM n->'menu_item'->'stock_tracking_mode'
                   OR o->'menu_item'->'current_stock'
                      IS DISTINCT FROM n->'menu_item'->'current_stock')            AS stock_diffs,
  -- the hoisted subquery
  count(*) FILTER (WHERE o->'menu_item'->'modifier_groups'
                      IS DISTINCT FROM n->'menu_item'->'modifier_groups')          AS modifier_subtree_diffs,
  -- per-item display_order (the VALUE; sequence position is §4)
  count(*) FILTER (WHERE o->'display_order' IS DISTINCT FROM n->'display_order')   AS item_display_order_diffs,
  count(*) FILTER (WHERE o->'is_featured'   IS DISTINCT FROM n->'is_featured')     AS item_is_featured_diffs,
  count(*)                                                                          AS rows_compared
FROM pairs;
-- Prod 2026-08-13 for 5afc6641: all diff columns 0, rows_compared 330.


-- =============================================================================
-- §2b  ITEM DIFF DETAIL — only run this if §2 was non-zero
-- =============================================================================
-- Prints the first 25 offending items with both sides side by side.
WITH params AS (SELECT '5afc6641-e98f-4c81-8d9d-d9691b5c28dc'::uuid AS loc),
old_env AS (SELECT (public.get_pos_full_sync(p.loc)::jsonb) -> 'menus' AS j FROM params p),
new_env AS (SELECT public.get_pos_bootstrap_v1(p.loc)      -> 'menus' AS j FROM params p),
old_items AS (
  SELECT m->>'id' AS menu_id, c->>'id' AS mc_id, i->>'id' AS ci_id, i AS item
  FROM old_env, jsonb_array_elements(j) m, jsonb_array_elements(m->'categories') c,
       jsonb_array_elements(c->'items') i),
new_items AS (
  SELECT m->>'id' AS menu_id, c->>'id' AS mc_id, i->>'id' AS ci_id, i AS item
  FROM new_env, jsonb_array_elements(j) m, jsonb_array_elements(m->'categories') c,
       jsonb_array_elements(c->'items') i)
SELECT COALESCE(o.menu_id, n.menu_id) AS menu_id,
       COALESCE(o.mc_id,   n.mc_id)   AS menu_category_id,
       COALESCE(o.ci_id,   n.ci_id)   AS category_item_id,
       o.item->'menu_item'->>'name'   AS item_name,
       o.item                          AS old_item,
       n.item                          AS new_item
FROM old_items o
FULL JOIN new_items n
  ON n.menu_id = o.menu_id AND n.mc_id = o.mc_id AND n.ci_id = o.ci_id
WHERE o.item IS DISTINCT FROM n.item
ORDER BY 1, 2, 3
LIMIT 25;


-- =============================================================================
-- §3  CATEGORY DEEP DIFF
-- =============================================================================
-- Category header minus its items: display_order, is_active, the raw category
-- snooze fields, and the nested `category` object (name cascade, image
-- cascade, both override flags).
WITH params AS (SELECT '5afc6641-e98f-4c81-8d9d-d9691b5c28dc'::uuid AS loc),
old_env AS (SELECT (public.get_pos_full_sync(p.loc)::jsonb) -> 'menus' AS j FROM params p),
new_env AS (SELECT public.get_pos_bootstrap_v1(p.loc)      -> 'menus' AS j FROM params p),
old_cats AS (
  SELECT m->>'id' AS menu_id, c->>'id' AS mc_id, (c - 'items') AS head
  FROM old_env, jsonb_array_elements(j) m, jsonb_array_elements(m->'categories') c),
new_cats AS (
  SELECT m->>'id' AS menu_id, c->>'id' AS mc_id, (c - 'items') AS head
  FROM new_env, jsonb_array_elements(j) m, jsonb_array_elements(m->'categories') c),
old_heads AS (
  SELECT m->>'id' AS menu_id, (m - 'categories' - 'schedules') AS head, m->'schedules' AS sched
  FROM old_env, jsonb_array_elements(j) m),
new_heads AS (
  SELECT m->>'id' AS menu_id, (m - 'categories' - 'schedules') AS head, m->'schedules' AS sched
  FROM new_env, jsonb_array_elements(j) m)
SELECT
  (SELECT count(*) FROM old_cats o FULL JOIN new_cats n
     ON n.menu_id = o.menu_id AND n.mc_id = o.mc_id
   WHERE o.head IS NULL OR n.head IS NULL)                             AS category_key_mismatches,
  (SELECT count(*) FROM old_cats o JOIN new_cats n
     ON n.menu_id = o.menu_id AND n.mc_id = o.mc_id
   WHERE o.head IS DISTINCT FROM n.head)                               AS category_header_diffs,
  (SELECT count(*) FROM old_cats o JOIN new_cats n
     ON n.menu_id = o.menu_id AND n.mc_id = o.mc_id
   WHERE o.head->'snoozed_until' IS DISTINCT FROM n.head->'snoozed_until'
      OR o.head->'snooze_reason' IS DISTINCT FROM n.head->'snooze_reason')
                                                                       AS category_snooze_diffs,
  (SELECT count(*) FROM old_heads o FULL JOIN new_heads n
     ON n.menu_id = o.menu_id
   WHERE o.head IS NULL OR n.head IS NULL)                             AS menu_key_mismatches,
  (SELECT count(*) FROM old_heads o JOIN new_heads n
     ON n.menu_id = o.menu_id
   WHERE o.head IS DISTINCT FROM n.head)                               AS menu_header_diffs,
  -- get_menu_with_categories aggregates schedules with NO ORDER BY, so this can
  -- legitimately differ by element order when a menu has 2+ schedules. Prod has
  -- 3 menu_schedules rows total, max 1 per menu, so today it must be 0. If it
  -- is ever non-zero, compare the SETS before calling it a regression.
  (SELECT count(*) FROM old_heads o JOIN new_heads n
     ON n.menu_id = o.menu_id
   WHERE o.sched IS DISTINCT FROM n.sched)                             AS menu_schedule_diffs;


-- =============================================================================
-- §4  DISPLAY ORDER
-- =============================================================================
-- The migration adds (name, id) tiebreaks where the live function had none.
-- This section separates "the sort key sequence changed" (a REGRESSION) from
-- "two rows with the SAME sort key swapped places" (the intended fix).
--
-- §4a  Tie census: how much freedom exists on this location at all.
WITH params AS (SELECT '5afc6641-e98f-4c81-8d9d-d9691b5c28dc'::uuid AS loc),
new_env AS (SELECT public.get_pos_bootstrap_v1(p.loc) -> 'menus' AS j FROM params p),
item_keys AS (
  SELECT m->>'id' AS menu_id, c->>'id' AS mc_id, i->'display_order' AS ord
  FROM new_env, jsonb_array_elements(j) m, jsonb_array_elements(m->'categories') c,
       jsonb_array_elements(c->'items') i),
cat_keys AS (
  SELECT m->>'id' AS menu_id, c->'display_order' AS ord
  FROM new_env, jsonb_array_elements(j) m, jsonb_array_elements(m->'categories') c)
SELECT
  (SELECT COALESCE(sum(n - 1), 0) FROM (
     SELECT count(*) AS n FROM item_keys GROUP BY menu_id, mc_id, ord HAVING count(*) > 1) x)
                                                                       AS tied_item_positions,
  (SELECT COALESCE(sum(n - 1), 0) FROM (
     SELECT count(*) AS n FROM cat_keys GROUP BY menu_id, ord HAVING count(*) > 1) x)
                                                                       AS tied_category_positions;
-- Prod 2026-08-13 for 5afc6641: 4 tied category groups, 18 tied item groups.

-- §4b  Positional comparison. sortkey_sequence_diffs MUST be 0.
--      tie_position_swaps is informational and is expected to be > 0.
WITH params AS (SELECT '5afc6641-e98f-4c81-8d9d-d9691b5c28dc'::uuid AS loc),
old_env AS (SELECT (public.get_pos_full_sync(p.loc)::jsonb) -> 'menus' AS j FROM params p),
new_env AS (SELECT public.get_pos_bootstrap_v1(p.loc)      -> 'menus' AS j FROM params p),
old_seq AS (
  SELECT m->>'id' AS menu_id, c->>'id' AS mc_id, o AS pos,
         i->>'id' AS ci_id, i->'display_order' AS ord
  FROM old_env, jsonb_array_elements(j) m, jsonb_array_elements(m->'categories') c,
       jsonb_array_elements(c->'items') WITH ORDINALITY AS t(i, o)),
new_seq AS (
  SELECT m->>'id' AS menu_id, c->>'id' AS mc_id, o AS pos,
         i->>'id' AS ci_id, i->'display_order' AS ord
  FROM new_env, jsonb_array_elements(j) m, jsonb_array_elements(m->'categories') c,
       jsonb_array_elements(c->'items') WITH ORDINALITY AS t(i, o)),
old_cseq AS (
  SELECT m->>'id' AS menu_id, o AS pos, c->>'id' AS mc_id, c->'display_order' AS ord
  FROM old_env, jsonb_array_elements(j) m,
       jsonb_array_elements(m->'categories') WITH ORDINALITY AS t(c, o)),
new_cseq AS (
  SELECT m->>'id' AS menu_id, o AS pos, c->>'id' AS mc_id, c->'display_order' AS ord
  FROM new_env, jsonb_array_elements(j) m,
       jsonb_array_elements(m->'categories') WITH ORDINALITY AS t(c, o)),
old_mseq AS (
  SELECT o AS pos, m->>'id' AS menu_id, m->'display_order' AS ord
  FROM old_env, jsonb_array_elements(j) WITH ORDINALITY AS t(m, o)),
new_mseq AS (
  SELECT o AS pos, m->>'id' AS menu_id, m->'display_order' AS ord
  FROM new_env, jsonb_array_elements(j) WITH ORDINALITY AS t(m, o))
SELECT
  -- Same sort key at every position => the ordering CONTRACT is unchanged.
  (SELECT count(*) FROM old_seq o JOIN new_seq n
     ON n.menu_id = o.menu_id AND n.mc_id = o.mc_id AND n.pos = o.pos
   WHERE o.ord IS DISTINCT FROM n.ord)                                 AS item_sortkey_sequence_diffs,
  (SELECT count(*) FROM old_cseq o JOIN new_cseq n
     ON n.menu_id = o.menu_id AND n.pos = o.pos
   WHERE o.ord IS DISTINCT FROM n.ord)                                 AS category_sortkey_sequence_diffs,
  (SELECT count(*) FROM old_mseq o JOIN new_mseq n ON n.pos = o.pos
   WHERE o.ord IS DISTINCT FROM n.ord OR o.menu_id IS DISTINCT FROM n.menu_id)
                                                                       AS menu_sequence_diffs,
  -- Informational: rows that moved WITHIN their tie group.
  (SELECT count(*) FROM old_seq o JOIN new_seq n
     ON n.menu_id = o.menu_id AND n.mc_id = o.mc_id AND n.pos = o.pos
   WHERE o.ci_id IS DISTINCT FROM n.ci_id)                             AS tie_position_swaps,
  (SELECT count(*) FROM old_cseq o JOIN new_cseq n
     ON n.menu_id = o.menu_id AND n.pos = o.pos
   WHERE o.mc_id IS DISTINCT FROM n.mc_id)                             AS category_tie_position_swaps;
-- menu_sequence_diffs must be 0 outright: menus already had a (display_order,
-- name) sort with no ties on prod, so adding id cannot move anything.

-- §4c  Determinism: the new function must return the SAME bytes twice in a row.
--      This is what makes version-based client caching safe. Must be true.
WITH params AS (SELECT '5afc6641-e98f-4c81-8d9d-d9691b5c28dc'::uuid AS loc)
SELECT (public.get_pos_bootstrap_v1(p.loc) -> 'menus')
     = (public.get_pos_bootstrap_v1(p.loc) -> 'menus')  AS menus_stable_within_txn
FROM params p;


-- =============================================================================
-- §5  THE OTHER ENVELOPE MEMBERS vs the four side queries they replace
-- =============================================================================
-- Mirrors hooks/pos/usePosSync.ts:47-82 exactly: the tax_rates PostgREST read
-- (line 68-73), get_active_snoozes (line 77), and the two recipe reads
-- (lines 60-67) including the client's own inventory_item_id filter and its
-- quantity_used -> quantity rename.
--
-- NOTE ON RLS: the side queries below run as the harness role and bypass RLS if
-- that role owns the tables, whereas the client's PostgREST reads are
-- RLS-filtered. Non-zero counts here therefore mean "the envelope disagrees
-- with the raw table", which is what we want to know; a client-visible
-- difference on top of that is a separate RLS question.
WITH params AS (SELECT '5afc6641-e98f-4c81-8d9d-d9691b5c28dc'::uuid AS loc),
env AS (SELECT public.get_pos_bootstrap_v1(p.loc) AS e, p.loc FROM params p),
env_tax AS (
  SELECT t->>'id' AS id, t AS row FROM env, jsonb_array_elements(e->'tax_rates') t),
raw_tax AS (
  SELECT tr.id::text AS id,
         jsonb_build_object('id', tr.id, 'location_id', tr.location_id, 'name', tr.name,
           'percentage', tr.percentage, 'tax_category', tr.tax_category,
           'is_active', tr.is_active, 'created_at', tr.created_at,
           'updated_at', tr.updated_at) AS row
  FROM public.tax_rates tr, params p
  WHERE tr.location_id = p.loc AND tr.is_active = true),
env_snz  AS (SELECT e->'snoozes' AS s FROM env),
rpc_snz  AS (SELECT public.get_active_snoozes(p.loc)::jsonb AS s FROM params p),
env_mir  AS (SELECT r->>'id' AS id, r AS row
             FROM env, jsonb_array_elements(e->'recipes'->'menu_items') r),
raw_mir  AS (
  SELECT r.id::text AS id,
         jsonb_build_object('id', r.id, 'menu_item_id', r.menu_item_id,
           'inventory_item_id', r.inventory_item_id,
           'quantity', COALESCE(r.quantity_used, 0)) AS row
  FROM public.menu_item_recipes r, params p
  WHERE r.merchant_id = (SELECT merchant_id FROM public.locations WHERE id = p.loc)
    AND r.inventory_item_id IS NOT NULL),
env_mgr  AS (SELECT r->>'id' AS id, r AS row
             FROM env, jsonb_array_elements(e->'recipes'->'modifier_group_items') r),
raw_mgr  AS (
  SELECT r.id::text AS id,
         jsonb_build_object('id', r.id, 'modifier_group_item_id', r.modifier_group_item_id,
           'inventory_item_id', r.inventory_item_id,
           'quantity', COALESCE(r.quantity_used, 0)) AS row
  FROM public.modifier_group_item_recipes r, params p
  WHERE r.merchant_id = (SELECT merchant_id FROM public.locations WHERE id = p.loc))
SELECT
  (SELECT count(*) FROM env_tax e FULL JOIN raw_tax r ON r.id = e.id
   WHERE e.row IS NULL OR r.row IS NULL OR e.row IS DISTINCT FROM r.row)
                                                                       AS tax_rate_diffs,
  (SELECT count(*) FROM raw_tax)                                       AS tax_rate_rows,
  -- get_active_snoozes returns json (key order preserved); casting both to
  -- jsonb normalises that. Compared as SETS, not arrays: get_active_snoozes
  -- orders items by mi.name alone while v1 adds an id tiebreak, so two items
  -- with the same name could legitimately sit in different array slots. v1 also
  -- carries modifier_group_id on modifier rows (which the client already reads),
  -- so that key is stripped before comparing.
  (SELECT count(*) FROM
     (SELECT jsonb_array_elements(s->'items') AS x FROM env_snz) a
     FULL JOIN
     (SELECT jsonb_array_elements(s->'items') AS x FROM rpc_snz) b ON a.x = b.x
   WHERE a.x IS NULL OR b.x IS NULL)                                   AS snooze_item_diffs,
  (SELECT count(*) FROM
     (SELECT jsonb_array_elements(s->'categories') AS x FROM env_snz) a
     FULL JOIN
     (SELECT jsonb_array_elements(s->'categories') AS x FROM rpc_snz) b ON a.x = b.x
   WHERE a.x IS NULL OR b.x IS NULL)                                   AS snooze_category_diffs,
  (SELECT count(*) FROM
     (SELECT jsonb_array_elements(s->'modifiers') - 'modifier_group_id' AS m FROM env_snz) a
     FULL JOIN
     (SELECT jsonb_array_elements(s->'modifiers') AS m FROM rpc_snz) b
       ON a.m = b.m
   WHERE a.m IS NULL OR b.m IS NULL)                                   AS snooze_modifier_diffs,
  (SELECT count(*) FROM env_mir e FULL JOIN raw_mir r ON r.id = e.id
   WHERE e.row IS NULL OR r.row IS NULL OR e.row IS DISTINCT FROM r.row)
                                                                       AS menu_item_recipe_diffs,
  (SELECT count(*) FROM env_mgr e FULL JOIN raw_mgr r ON r.id = e.id
   WHERE e.row IS NULL OR r.row IS NULL OR e.row IS DISTINCT FROM r.row)
                                                                       AS modifier_recipe_diffs,
  (SELECT count(*) FROM raw_mir) + (SELECT count(*) FROM raw_mgr)      AS recipe_rows;
-- Both recipe tables are EMPTY on prod (0 rows), so recipe_rows = 0 and the two
-- recipe diff columns prove only that the empty case yields []. The row SHAPE
-- is asserted from the client mapper, not observed. Re-run this section on
-- staging with seeded recipes before trusting the recipe half of the envelope.


-- =============================================================================
-- §6  VERSION CONTRACT
-- =============================================================================
-- Asserts the p_known_version short-circuit: same version echoed back,
-- unchanged flag flipped, heavy keys ABSENT (not null), light keys present.
WITH params AS (SELECT '5afc6641-e98f-4c81-8d9d-d9691b5c28dc'::uuid AS loc),
full_env AS (SELECT public.get_pos_bootstrap_v1(p.loc) AS e, p.loc FROM params p),
cached   AS (SELECT public.get_pos_bootstrap_v1(f.loc, f.e->>'version') AS e FROM full_env f),
stale    AS (SELECT public.get_pos_bootstrap_v1(f.loc, 'v1:0:deadbeefdeadbeef') AS e FROM full_env f)
SELECT
  (SELECT e->>'version' FROM full_env)                                 AS version,
  (SELECT e->>'version' FROM full_env) ~ '^v1:[0-9]+:[0-9a-f]{16}$'    AS version_well_formed,
  (SELECT (e->>'unchanged')::boolean FROM full_env) = false            AS full_flags_changed,
  (SELECT e ? 'menus' AND e ? 'modifier_groups' AND e ? 'recipes'
          AND e ? 'tax_rates' AND e ? 'snoozes' FROM full_env)         AS full_has_all_keys,
  -- cached path
  (SELECT (e->>'unchanged')::boolean FROM cached) = true               AS cached_flags_unchanged,
  (SELECT e->>'version' FROM cached)
    = (SELECT e->>'version' FROM full_env)                             AS cached_version_matches,
  (SELECT NOT (e ? 'menus') AND NOT (e ? 'modifier_groups')
          AND NOT (e ? 'recipes') FROM cached)                         AS cached_omits_heavy_keys,
  (SELECT e ? 'tax_rates' AND e ? 'snoozes' FROM cached)               AS cached_keeps_light_keys,
  -- a version the server has never issued must NOT short-circuit
  (SELECT (e->>'unchanged')::boolean FROM stale) = false               AS stale_version_forces_full,
  (SELECT e ? 'menus' FROM stale)                                      AS stale_version_returns_menus;
-- Every boolean column must be true.

-- §6b  MANUAL: the counter actually advances on a catalog write.
--      This harness is SELECT-only, so run these three steps by hand on
--      STAGING (never prod) and confirm the version string changes:
--        1. SELECT public.get_pos_bootstrap_v1('<loc>') ->> 'version';
--        2. UPDATE public.menu_items SET updated_at = now()
--             WHERE id = '<some item on that location>';   -- any no-op write
--        3. SELECT public.get_pos_bootstrap_v1('<loc>') ->> 'version';
--      The counter component must increase. Repeat for a LOCATION-scoped table
--      (e.g. location_item_overrides) and a MERCHANT-scoped one (e.g.
--      category_items) -- they take different branches of tg_bump_catalog_version.
--
-- §6c  MANUAL: snooze EXPIRY changes the version with no row write.
--        1. 86 an item with a short snooze (snoozed_until = now() + 90 seconds).
--        2. Record the version.
--        3. Wait past the expiry, touch nothing, read the version again.
--      The signature component must change even though the counter did not.
--      This is the whole reason the version is not a bare counter.


-- =============================================================================
-- §7  DEDUPLICATED MODIFIER INDEX vs the nested copies
-- =============================================================================
-- The top-level modifier_groups array is additive today, so it MUST agree with
-- what is still nested inside every menu_item. If it drifts, the future v2 that
-- drops the nested copies would silently change the modifier catalog.
-- display_order is excluded because it is a property of the item->group link,
-- not of the group -- see the migration header.
WITH params AS (SELECT '5afc6641-e98f-4c81-8d9d-d9691b5c28dc'::uuid AS loc),
env AS (SELECT public.get_pos_bootstrap_v1(p.loc) AS e FROM params p),
nested AS (
  SELECT DISTINCT (g - 'display_order') AS g
  FROM env, jsonb_array_elements(e->'menus') m,
       jsonb_array_elements(m->'categories') c,
       jsonb_array_elements(c->'items') i,
       jsonb_array_elements(i->'menu_item'->'modifier_groups') g),
idx AS (
  SELECT g FROM env, jsonb_array_elements(e->'modifier_groups') g)
SELECT
  (SELECT count(*) FROM nested)                                        AS distinct_nested_groups,
  (SELECT count(*) FROM idx)                                           AS index_groups,
  (SELECT count(*) FROM nested n LEFT JOIN idx x ON x.g->>'id' = n.g->>'id'
   WHERE x.g IS NULL)                                                  AS nested_groups_missing_from_index,
  (SELECT count(*) FROM nested n JOIN idx x ON x.g->>'id' = n.g->>'id'
   WHERE n.g IS DISTINCT FROM x.g)                                     AS index_group_value_diffs,
  -- Payload economics, for the v2 decision.
  (SELECT length((e->'menus')::text) FROM env)                         AS menus_bytes,
  (SELECT length((e->'modifier_groups')::text) FROM env)               AS index_bytes,
  (SELECT sum(length((i->'menu_item'->'modifier_groups')::text))
   FROM env, jsonb_array_elements(e->'menus') m,
        jsonb_array_elements(m->'categories') c,
        jsonb_array_elements(c->'items') i)                            AS nested_modifier_bytes;
-- nested_groups_missing_from_index and index_group_value_diffs must be 0.
-- Prod 2026-08-13 for 5afc6641: 29 groups, index 38,554 B, nested 718,394 B
-- (55.5% of the 1,295,168 B payload) -- the size of the prize for a v2.


-- =============================================================================
-- §8  COST A/B (optional, run last)
-- =============================================================================
-- Buffers is the honest metric here: wall clock on the FULL-BUILD path is
-- dominated by serialising the same ~1.3 MB either way. Run each twice and take
-- the second, so plan caching does not skew the first.
--
--   EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, COSTS OFF)
--   SELECT public.get_pos_full_sync('5afc6641-e98f-4c81-8d9d-d9691b5c28dc');
--
--   EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, COSTS OFF)
--   SELECT public.get_pos_bootstrap_v1('5afc6641-e98f-4c81-8d9d-d9691b5c28dc');
--
--   -- and the path that actually matters in production:
--   EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, COSTS OFF)
--   SELECT public.get_pos_bootstrap_v1('5afc6641-e98f-4c81-8d9d-d9691b5c28dc',
--                                      '<version from a prior call>');
--
-- Prod 2026-08-13 baseline for 5afc6641 (composed tree measured inline, before
-- it was wrapped in the function):
--   get_pos_full_sync   9,873 shared buffer hits   114.0 ms
--   composed tree       2,760 shared buffer hits   119.1 ms   (-72.0% buffers)
-- Expect get_pos_bootstrap_v1 to land slightly above the composed-tree figure:
-- it adds the version read, the snooze signature, tax_rates, recipes and the
-- 38 KB modifier index on top. The cached path should be a small fraction of
-- both -- if it is not, the short-circuit is not short-circuiting.
-- =============================================================================
