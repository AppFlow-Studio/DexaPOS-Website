# DB Perf Phase 6 — Order-Broadcast Payload + Hot-RPC Profiling (post-DB Performance Pass)

> **Notion:** https://app.notion.com/p/DB-Perf-Phase-6-Order-Broadcast-Payload-Hot-RPC-Profiling-post-DB-Performance-Pass-38c8280c1b1d81ae8453f9847e82717b
> **Page ID:** `38c8280c-1b1d-81ae-8453-f9847e82717b`

> ⚡ **Predecessor — read first:** Successor to **DB Performance Pass — Eliminate WAL Pressure, Index Hot Tables, Clean Up RLS Policies** (`33b8280c1b1d817cb410f43fe14a6db6`, Status: **Done**, Apr 13). That ticket already shipped and is verified live on staging (Jun 27):
> - Realtime publication trimmed (`stations`, `locations`, `merchants`, `chargebacks`, `floor_plan_objects` dropped — still out)
> - 36 hot-path FK indexes added
> - `search_path` pinned on all 315 SECURITY DEFINER functions
> - RLS policies consolidated
> - Heartbeats throttled + `device_heartbeats` upserted
>
> **Do not redo any of it.** This ticket covers only what remains after those fixes.

- **Owner:** Ali Awdi
- **Architecture sign-off:** Temur
- **Work branch:** Supabase staging (`dfwqakoyittmrwbqvxgw`), confirm on prod
- **Priority:** High (dependency for the two responsiveness sweeps; gates the per-order-PIN feature)

---

## Why this exists

Two perf fronts were reported: **(A)** the admin dashboard is slow to fill on view-switch, and **(B)** the register backs up under busy service. Investigation against live staging (Jun 27) shows the originating brief's `pg_stat_statements` evidence is **partly stale** — its baseline predates the Apr 13 DB Performance Pass and recent RPC rewrites. Corrections that scope this ticket:

- ❌ **"56% WAL = `stations` heartbeats"** — *wrong now.* `stations` is no longer in the realtime publication (verified). The remaining WAL comes from the order-path tables that legitimately stay subscribed (`orders`, `order_items`, `order_payments`) plus the order-broadcast trigger.
- ❌ **"item change → parent-order touch → N re-broadcasts"** — *not wired.* No such trigger exists on `order_items` (the source CSV was stale); items broadcast directly via the publication.
- ❌ **"broadcast re-fetches items + modifiers (47.9B tuples)"** — *stale.* Live `broadcast_order_changes` no longer references `order_item_modifiers`.

So this ticket **re-measures first**, then targets the three verified remaining levers below.

## Scope — what ships

1. **Re-baseline on PROD.** `SELECT pg_stat_statements_reset();` during real service, then capture current top queries by total/mean exec time (app RPCs only) + `pg_stat_user_tables` for `orders`/`order_items`/`order_payments`/`kds_item_status`. The staging baseline is no longer trustworthy.
2. **Order-broadcast cost reduction.** `orders_broadcast_trigger_deferred → broadcast_order_changes` is live, ROW-level, and rebuilds + emits a payload on every `orders` write. Trim the emitted payload and remove redundant fan-out.
3. **Hot-RPC restructure (verified live).** Replace the per-item correlated modifier subquery in `get_kds_tickets_v2` (and `get_order_details`) with a single set-based pre-aggregation.
4. **Slow-RPC profiling.** `pos_staff_login_v2` (~703ms in the stale baseline; **gated by the per-order-PIN feature**) and the analytics RPC family; add a supporting composite index only if EXPLAIN confirms a scan.

### Out of scope — tracked in the existing sweeps (this ticket is their dependency)

- Dashboard result caching / TanStack key narrowing → *Admin + Merchant Dashboard Responsiveness — Full Page Sweep* (`3728280c1b1d81578578cb233b9a10c2`).
- Register refetch-on-realtime-event narrowing + the 2.15 continuation → *P1 — POS Cold-Start / Idle Lag + Startup Fetch Reduction* (`3758280c1b1d8115a3cbd52832bee9bf`).

## Acceptance criteria

- [ ] **Re-baseline captured on prod** during real service (post-reset); current hotspots documented on this ticket, replacing the stale staging numbers.
- [ ] **`get_kds_tickets_v2`** no longer issues a per-item correlated subquery on `order_item_modifiers`; modifiers are pulled via a single set-based pass. `EXPLAIN (ANALYZE, BUFFERS)` shows no per-row modifier subplan; output is byte-identical to current for a fixed location. Mean exec time ≤ **[target]**.
- [ ] **`get_order_details`** modifier fetch likewise set-based; output unchanged for a fixed order.
- [ ] **Order broadcast**: emitted payload trimmed to fields subscribers consume; any redundant `postgres_changes` subscription on `orders`/`order_items`/`order_payments` (where the broadcast payload is already authoritative) removed. Realtime/WAL share of DB exec time drops measurably vs the re-baseline.
- [ ] **`pos_staff_login_v2`** profiled with `EXPLAIN ANALYZE`; p95 ≤ **[target, e.g. 250ms]** — confirmed before the per-order-PIN feature ships.
- [ ] **Analytics RPCs** (`get_financial_kpis`, `get_sales_by_item_report`, `get_kitchen_performance_stats`, `get_staff_performance_stats`, `get_table_performance_stats`, `get_order_flow_stats`, `get_cash_flow_report`, `get_voids_report`) each ≤ **[target, e.g. 300ms p95]** for a typical date range; any new index confirmed non-duplicate.
- [ ] **No correctness regression** — analytics figures still tie out; recognized-order predicate unchanged.
- [ ] **Constraints hold** — offline reads + sync queue unaffected; RLS scoping (`user_merchant_id()`/`user_location_ids()`) intact; any changed RPC keeps `SECURITY DEFINER` + pinned `search_path`; any index built with `CREATE INDEX CONCURRENTLY` (not in a txn).

---

## Deep implementation — verified-live evidence, SQL sketches, measurement plan, constraints

### Verified live (staging `dfwqakoyittmrwbqvxgw`, Jun 27)

**Realtime publication** = `orders`, `order_items`, `order_payments`, `order_courses`, `table_sessions`, `table_session_tables`, `table_session_events`, `session_kick_notifications`, `reservations`, `waitlist`, `support_tickets`, `support_ticket_messages` (+ `realtime.messages` daily partitions). `stations`/`locations`/`merchants`/`chargebacks`/`floor_plan_objects` are **out**.

**`orders` triggers** (ROW): `orders_broadcast_trigger_deferred → broadcast_order_changes` (the broadcast), plus `enforce_order_math`, `track_order_status_changes`, loyalty/customer-metrics/suspension/receipt-token/updated_at.

**`order_items` triggers** (ROW): `route_items_to_kds`, `propagate_rush_to_kds`, `handle_kds_item_void`, `update_updated_at_column` — **none touches `orders`.**

### Lever 2 — order broadcast

`broadcast_order_changes` (ROW, fires per `orders` write; does **not** reference `order_item_modifiers`) rebuilds a payload (order + items + payments + refunds/reversals + station name) and emits it every time. Steps:

1. Read the **current** body first: `SELECT pg_get_functiondef('public.broadcast_order_changes'::regproc);`
2. Trim the emitted JSON to the fields subscribers actually read.
3. Confirm whether clients subscribe to the broadcast topic **and** `postgres_changes` on `orders`/`order_items`/`order_payments`. If the broadcast payload is authoritative for KDS/CFD/order screens, drop the redundant `postgres_changes` subscriptions to those tables to cut WAL fan-out.
4. Review `REPLICA IDENTITY` on `orders`/`order_items` (FULL ships full old rows on every `postgres_changes` UPDATE).
5. Consider coalescing rapid successive broadcasts for the same order.

### Lever 3 — hot-RPC modifier subquery (current live code)

`get_kds_tickets_v2` runs, **per item** inside the grouped item agg:

```sql
'modifiers', (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'modifier_name', oim.modifier_name,
    'modifier_group_name', oim.modifier_group_name,
    'price_modifier', oim.price_modifier,
    'is_no', COALESCE(oim.is_no, false))), '[]'::jsonb)
  FROM public.order_item_modifiers oim
  WHERE oim.order_item_id = oi.id
)
```

This RPC returns **all active items for a location** and is polled frequently → modifier subquery × every active item × every poll. (It also runs several per-item `EXISTS` subqueries on `kds_item_status` for `acknowledged`/void/refund notices — same pattern.)

**Proposed:** pre-aggregate modifiers once and `LEFT JOIN` onto `order_items` in the inner query before the `GROUP BY`:

```sql
WITH item_mods AS (
  SELECT oim.order_item_id,
         jsonb_agg(jsonb_build_object(
           'modifier_name', oim.modifier_name,
           'modifier_group_name', oim.modifier_group_name,
           'price_modifier', oim.price_modifier,
           'is_no', COALESCE(oim.is_no, false)) ORDER BY oim.id) AS modifiers
  FROM public.order_item_modifiers oim
  WHERE oim.order_item_id IN (
    SELECT oi.id FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE o.location_id = p_location_id
  )
  GROUP BY oim.order_item_id
)
-- in the item object:  'modifiers', COALESCE(im.modifiers, '[]'::jsonb)
-- via:                 LEFT JOIN item_mods im ON im.order_item_id = oi.id
```

Same approach for the `kds_item_status` per-item `EXISTS` checks (pre-aggregate acknowledged item_ids into a CTE). Keep output byte-identical — diff against current for a fixed location before/after.

`get_order_details` has the same modifier subquery but is single-order, so lower impact — apply the same fix for consistency.

### Lever 4 — slow RPCs

- **`pos_staff_login_v2`**: `EXPLAIN ANALYZE` with real params. PIN verify is a bcrypt `crypt()` compare with no user identifier → it scans every active PIN at the location, so cost scales with staff count; also profile the station-claim (`FOR UPDATE`) + session-teardown + auto-clock-in writes. **Trim before the per-order-PIN feature ships.**
- **Analytics RPCs**: `EXPLAIN (ANALYZE, BUFFERS)` each. They aggregate `orders` by `merchant_id`, `(location_id IS NULL OR =)`, `created_at BETWEEN`, `status NOT IN (...)`. If seq-scanning, add (after confirming it is not a duplicate of an existing index):

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_merchant_loc_created
  ON public.orders (merchant_id, location_id, created_at);  -- cannot run inside a txn block
```

### Measurement plan (prod caveat)

Staging `pg_stat_statements` is polluted by Supabase Studio / PostgREST introspection (`pg_get_function_def`, `table_privileges`, `pg_timezone_names`, `pg_available_extensions`) and synthetic traffic — discount those. On **prod** (`ymbmhyrhofnfdooszehx`, MCP read-restricted → SQL editor): `SELECT pg_stat_statements_reset();` then during real service capture top app RPCs by total/mean exec time + `pg_stat_user_tables` `seq_scan`/`idx_scan`/`n_tup_upd`. `EXPLAIN (ANALYZE, BUFFERS)` the named RPCs with real params.

### Hard constraints

Offline-first non-negotiable (preserve offline reads + sync queue). Realtime required for KDS/CFD/online-order/cross-device — reduce **volume**, don't drop subscriptions features need. RLS/tenant isolation must hold. Any changed RPC keeps `SECURITY DEFINER` + `SET search_path = public, pg_temp`. `CREATE INDEX CONCURRENTLY` can't run in a txn. Don't regress analytics correctness (figures must tie out).

## Implementation results (this pass — 2026-06-29, verified on staging `dfwqakoyittmrwbqvxgw`, NOT deployed)

**Shipped as migration/doc files (deployment held by owner):**
- **L3 — hot-RPC rewrite** → `supabase/migrations/20260629120000_kds_order_rpc_setbased_modifiers.sql`.
  `get_kds_tickets_v2` + `get_order_details` modifier subqueries and the 5 repeated
  `kds_item_status` checks collapsed into pre-aggregated CTEs.
  - Verified content-identical inline (old vs new) on the busiest location: KDS RPC 0 field
    differences; `get_order_details` content-identical. Only deviation = modifier element order,
    now `ORDER BY created_at, id` (was non-deterministic ctid order) — cosmetic, signed off.
  - `EXPLAIN (ANALYZE, BUFFERS)`: shared buffers **20,084 → 9,033 (−55%)**; per-item modifier
    subplan **2,361 → 1** execution.
- **L2 — broadcast no-op guard** → `supabase/migrations/20260629120001_broadcast_order_changes_skip_noop_updates.sql`.
  Skips `orders` UPDATEs whose only change is `updated_at` (kills the `propagate_rush_to_kds`
  re-broadcast). Content-bearing broadcasts unchanged. ⚠️ Confirm with RN team before deploy that
  nothing relies on a pure-`updated_at` ping.
- **L4 — `pos_staff_login_v2`** profiled: **375 ms at 5 bcrypt PINs** (369 ms pure bcrypt CPU,
  `Buffers hit=3`); cost = bcrypt-pin staff × ~70 ms (linear). Fix design (HMAC indexed lookup →
  1 bcrypt verify) in `tasks/pos-staff-login-pin-lookup-design.md`; code deferred (gated by
  per-order-PIN feature).

**Investigated, no change needed:**
- **L4 analytics:** orders aggregation is index-backed for both predicate shapes
  (`is_order_reportable` → `idx_orders_reportable`; `status NOT IN` → `idx_orders_merchant_created`),
  sub-2 ms on staging. Proposed `(merchant_id, location_id, created_at)` index is **redundant**.
- **Redundant `postgres_changes` (open Q2):** only `app/sites/components/OrderStatusWatcher.tsx`
  subscribes to order tables here, and its `postgres_changes` is **load-bearing, not redundant** —
  the per-order `status_changed` broadcast fires only on create + cancel, so kitchen-driven
  transitions (accepted/preparing/ready/completed/declined) arrive only via `postgres_changes`.
  Left as-is. Per-order scope = no fan-out.
- **`REPLICA IDENTITY`** on `orders`/`order_items` = DEFAULT (PK) — correct, FULL would be worse.

**Still owner-side / out of this repo:**
- Prod re-baseline (prod SQL editor + real service window).
- Broadcast payload-field trimming + any RN-app `postgres_changes` removal (cross-repo).
- Latency targets per surface (Temur).
- `pos_staff_login_v2` implementation (gated).

### Open questions

1. Latency targets per surface (ACs above) — set with Temur.
2. Do any clients subscribe to `postgres_changes` on `orders`/`order_items`/`order_payments` **in addition** to the broadcast topic? (Determines the Lever 2 WAL savings.)
3. Priority order: order-broadcast vs KDS-RPC restructure vs `pos_staff_login_v2`? (`pos_staff_login_v2` is gated by the per-order-PIN timeline.)
4. Who runs the prod re-baseline, and during which service window?
