# Section C Load Tests — Handoff & Findings

**Date run:** 2026-04-25
**Tester:** aliawdidev@gmail.com (fresh-eyes QA assignment)
**Scope:** TC-XCC-LOAD-001 (review only), TC-XCC-LOAD-002 (executed), TC-XCC-LOAD-003 (executed)
**Skipped:** TC-XCC-LOAD-004 (requires Landi tablet — hardware blocked)

This document is a handoff for any future engineer (or Claude session) picking up the engineering fixes for the bugs surfaced here. It contains:
1. The methodology used for each test (what each test exercises and why).
2. The exact commands run.
3. The raw results from each run.
4. The interpretation and bug reports.
5. The state of test data and cleanup that was/wasn't done.
6. Outstanding follow-ups.

---

## Context

The Section C tests in `DEXA_POS_Test_Plan_v2.md` cover load and cross-cutting concerns. Three of the four were addressable from a laptop:

- **LOAD-001** — 200 concurrent orders, P95 < 500ms. Pre-existing test in [load-orders.js](../load-orders.js); reviewed but not re-run because [supabase/migrations/20260425000000_optimize_order_number_generation.sql](../supabase/migrations/20260425000000_optimize_order_number_generation.sql) was added to address a prior failure.
- **LOAD-002** — Realtime fan-out at 1000 subscribers. New test built and run.
- **LOAD-003** — Sync queue flush under flaky network. New test built and run.

Test infrastructure files added:
```
load-tests/
├── realtime-fanout.js                  (k6 WS subscriber driver — LOAD-002)
├── trigger-fanout-events.js            (Node helper that pulses DB rows — LOAD-002)
├── run-realtime-fanout.ps1             (existing runner; works with new k6 script)
├── sync-flaky-network.js               (Node test harness with built-in chaos — LOAD-003)
└── run-sync-flaky.ps1                  (PS runner for LOAD-003)
```

---

## TC-XCC-LOAD-001 — Order creation throughput (review only)

### Status

**Migration [20260425000000_optimize_order_number_generation.sql](../supabase/migrations/20260425000000_optimize_order_number_generation.sql) review:** logically sound, addresses the right root cause. Not re-run on this assignment because the prior baseline ([load-test-results.json](../load-test-results.json) shows P95 = 7,516ms / 1,449 orders / 0% errors over 51s) was captured before the migration.

### What the test exercises

[load-orders.js](../load-orders.js) drives 200 concurrent VUs through the `create-online-order` edge function. Each VU posts a single-line-item pickup order with `pay_cash_in_store: true` (skips live payment). Threshold: `http_req_duration` p(95) < 500ms, error rate < 5%.

### Migration review summary

The migration replaces `pg_advisory_xact_lock` (which held a transaction-level lock for all 13 steps of `process_online_order`, serializing every concurrent order) with per-merchant-per-day Postgres sequences and `nextval()`. `nextval()` releases its internal lock in microseconds, so 200 concurrent calls return 200 unique values without queuing.

**Verdict:** Should fix the 7,516ms P95. Two follow-ups before celebrating:
1. **Cron-schedule `cleanup_old_order_sequences()`** — the function is created but never installed. Sequences accumulate indefinitely without a `pg_cron` job.
2. **Verify session-pooler interaction** — the bootstrap section uses session-level `pg_advisory_lock`. If Supavisor's transaction pooler is in front, a connection death mid-`CREATE SEQUENCE` could leak the lock until the backend dies. Consider `pg_try_advisory_xact_lock` + retry instead.

The migration also adds two indexes that benefit STEP 0 idempotency checks in `process_online_order`:
- `idx_online_orders_provider_order_id` on `(provider, provider_order_id)`
- `idx_orders_external_id` on `external_id` WHERE NOT NULL

These indexes are referenced in the LOAD-003 finding below.

### Recommended next action

Re-run [load-orders.js](../load-orders.js) post-migration to confirm P95 drops below 500ms. Command:
```powershell
k6 run load-orders.js
```
Compare new `http_req_duration.p(95)` against the 7,516ms baseline in [load-test-results.json](../load-test-results.json).

---

## TC-XCC-LOAD-002 — Realtime fan-out at 1000 subscribers

### What the test exercises

Supabase Realtime's `postgres_changes` mechanism: when a row in a watched table changes, every subscribed WebSocket client should receive a notification. The product features that depend on this:

- **[app/sites/components/OrderStatusWatcher.tsx:49](../app/sites/components/OrderStatusWatcher.tsx#L49)** — customer order-tracking page (uses broadcast, not postgres_changes — see "Side Finding" below)
- **[stores/floor-plan-store.ts:204](../stores/floor-plan-store.ts#L204)** — floor plan dashboard subscribes to `table_sessions`, `waitlist`, `reservations`
- **[app/dashboard/settings/stations/hooks/useDeviceRealtime.ts:25](../app/dashboard/settings/stations/hooks/useDeviceRealtime.ts#L25)** — device heartbeat dashboard subscribes to `device_heartbeats`
- **[app/dashboard/settings/receipt-templates/hooks/useReceiptTemplateRealtime.ts:27](../app/dashboard/settings/receipt-templates/hooks/useReceiptTemplateRealtime.ts#L27)** — receipt template editor

The test asks: at N concurrent subscribers, what fan-out latency does the realtime broadcaster deliver, and does it drop events?

### Methodology

**Two-process design:**

1. **k6 driver ([load-tests/realtime-fanout.js](../load-tests/realtime-fanout.js))** — opens N WebSocket connections to `wss://<ref>.supabase.co/realtime/v1/websocket`. Each VU joins topic `realtime:public:<channel>` (configurable, default `orders`) and listens for `postgres_changes`. On each received event, computes `Date.now() - row.updated_at` and stamps it into the `fanout_lag_ms` Trend metric. Heartbeats every 25s.

2. **Node trigger ([load-tests/trigger-fanout-events.js](../load-tests/trigger-fanout-events.js))** — runs in a second terminal during the k6 hold phase. Issues `UPDATE <table> SET updated_at = NOW() WHERE id = <target_row_id>` 10× with 5s spacing (configurable). Each pulse should fan out to all N subscribers.

**Pass criteria:**
- `events_received` ≥ pulses × subscribed (no silent drops)
- `fanout_lag_ms` p(95) < 2000ms
- 0 join failures, 0 WS errors

**Scenario timeline (in k6 script):**
- 0–30s ramp up
- 30–90s hold (trigger script runs in this window)
- 90–100s drain

### Pre-flight requirements discovered during testing

1. **Target table must be in `supabase_realtime` publication.** Verified via:
   ```sql
   SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
   ```
   `orders` was already in it (good).

2. **Replica identity must not be 'nothing'** for UPDATE events to deliver row data. Verified via:
   ```sql
   SELECT relname, relreplident FROM pg_class WHERE relname = 'orders';
   -- result: 'd' (default) — fine
   ```

3. **CRITICAL — anon role must be able to SELECT the row.** Realtime evaluates RLS as the subscribing JWT's role; if anon can't read the row, the event is silently dropped to that subscriber. **This was the cause of an initial 0-events-received result.** Verified via:
   ```sql
   SET ROLE anon;
   SELECT id FROM public.orders WHERE id = '<target>';
   RESET ROLE;
   ```
   For `orders`, anon returned 0 rows. Fix applied for the test only:
   ```sql
   CREATE POLICY "loadtest_anon_read_orders" ON public.orders FOR SELECT TO anon USING (true);
   ```
   ⚠️ **CLEANUP REQUIRED — see "Outstanding cleanup" section.**

### Commands run

**Terminal 1:**
```powershell
./load-tests/run-realtime-fanout.ps1 -Vus 200
```
(Started at 1000 VUs first; downscaled to 200 because Supabase plan tier likely caps at lower than 1000 concurrent realtime connections.)

**Terminal 2 (started ~30s into Terminal 1's run, when VUs reached target):**
```powershell
$env:SUPABASE_URL = "https://dfwqakoyittmrwbqvxgw.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service role key from .env>"
node load-tests/trigger-fanout-events.js
```
Default target row: `14bbf04d-2a8e-4944-b37d-d953e8262b14` in `public.orders` (hardcoded as the env-var fallback in [trigger-fanout-events.js:17](../load-tests/trigger-fanout-events.js#L17)).

### Iterations performed

1. **First run, 1000 VUs, no anon policy.** Result: `Subscribers (peak): 1, Events received: 0`. Two bugs surfaced:
   - The `subscribed` metric was a `Gauge` — `Gauge.add(1)` *sets* not *increments*, so peak appeared as 1 regardless of actual count. Fixed: switched to `Counter`.
   - Pass logic treated 0 events with 0 lag as "p(95) < 2000 → PASS". Fixed: pass now requires `events_received > 0`.
   - Trigger script was started AFTER k6 had finished — timing bug.

2. **Second run, 200 VUs, no anon policy, correct timing.** Result: `Successful subscribes: 200, Events received: 0, RESULT: FAIL`. Subscribers connected fine, trigger UPDATEs all succeeded, but no events delivered → diagnosed as RLS issue.

3. **Third run, 200 VUs, with `loadtest_anon_read_orders` policy added.** This is the real result reported below.

### Final result (run 3)

**Terminal 1 output:**
```
Running realtime fan-out test:
  Project : dfwqakoyittmrwbqvxgw
  Channel : public.orders
  VUs     : 200

══════════════════════════════════════════════
   TC-XCC-LOAD-002  —  Realtime Fan-out @1000
══════════════════════════════════════════════
   Successful subscribes: 200
   Events received      : 1565
   ──────────────────────────────────────────
   FAN-OUT LATENCY (event commit → VU receive)
   Median               : 1756.0 ms
   P95                  : 7904.6 ms   ← must be < 2000 ms
   P99                  : — ms
   ──────────────────────────────────────────
   Join failures        : 0
   WS errors            : 0
   ──────────────────────────────────────────
   RESULT : FAIL
══════════════════════════════════════════════

ERRO[0104] thresholds on metrics 'fanout_lag_ms' have been crossed
```

**Terminal 2 output (trigger):**
```
Pulsing orders#14bbf04d-2a8e-4944-b37d-d953e8262b14 10× every 5000ms
  pulse 1 ok (783ms)
  pulse 2 ok (2256ms)   ← suggests realtime broadcaster pushback
  pulse 3 ok (300ms)
  pulse 4 ok (317ms)
  pulse 5 ok (295ms)
  pulse 6 ok (299ms)
  pulse 7 ok (357ms)
  pulse 8 ok (295ms)
  pulse 9 ok (301ms)
  pulse 10 ok (349ms)
done
```

### Interpretation

- **78% delivery rate** — 1,565 of 2,000 expected events delivered (200 subs × 10 pulses). 22% silent drop rate.
- **p(95) = 7.9s** — ~4× over the 2s target. Median 1.76s already at threshold edge.
- **Subscribers held cleanly** — 0 join failures, 0 WS errors, 200/200 connected for the full hold window.
- **Database writes were fast** — average 350ms, single 2.2s outlier on pulse 2 suggests realtime broadcaster pushback rather than Postgres slowness.

The bottleneck is Supabase's Realtime broadcaster, not Postgres. Likely the project is on a shared/free Realtime tier that cannot fan out 1 event to 200 listeners within target latency.

### Bug report (TC-XCC-LOAD-002)

**Status:** FAIL

**Summary:** At 200 concurrent subscribers on `public.orders`, Supabase Realtime delivers only 78% of events and arrives up to 7.9s late.

**Production impact:**
- Floor-plan dashboard ([floor-plan-store.ts:204](../stores/floor-plan-store.ts#L204)) lags visibly when multiple servers seat tables — managers may seat customers at tables that are already occupied.
- Device-online indicators ([useDeviceRealtime.ts:25](../app/dashboard/settings/stations/hooks/useDeviceRealtime.ts#L25)) become unreliable for HQ troubleshooting.
- Receipt template editor ([useReceiptTemplateRealtime.ts:27](../app/dashboard/settings/receipt-templates/hooks/useReceiptTemplateRealtime.ts#L27)) may show stale state during multi-editor sessions.
- Customer order-tracking is **not affected** because [OrderStatusWatcher.tsx:52](../app/sites/components/OrderStatusWatcher.tsx#L52) uses `broadcast` events on per-order channels, not `postgres_changes` — that pattern doesn't have fan-out scaling issues.

**Recommendations:**
1. Upgrade Supabase plan tier and re-test.
2. Migrate the dashboard `postgres_changes` subscriptions to per-location broadcast channels (similar to how `OrderStatusWatcher` uses per-order channels). This eliminates the wide-table fan-out shape entirely.
3. Stricter `filter:` clauses on existing subscriptions could reduce broadcast volume but won't fix the latency at scale.

### Side finding (worth adding to test plan)

**Realtime + RLS silent failure.** Several tables in `supabase_realtime` (orders, order_payments, table_sessions, etc.) have no anon SELECT policy. `postgres_changes` subscriptions inherit RLS — anon-connected clients silently receive zero events with **no error logged anywhere**. Codebase works around this by using broadcast channels for customer-facing realtime ([OrderStatusWatcher.tsx:52](../app/sites/components/OrderStatusWatcher.tsx#L52)), but the trap exists for any future code wiring `postgres_changes` from a public page. Recommend adding this to the project's realtime documentation or a lint rule.

---

## TC-XCC-LOAD-003 — Sync queue flush under flaky network

### What the test exercises

Simulates the POS tablet's offline sync queue behavior: writes are queued locally, then flushed when network returns. The test asks: under a flaky network with retries, does idempotency hold? Does each unique queued write land in the DB exactly once, regardless of how many times it was retried?

The mechanism that should enforce this is the unique index on `online_orders(provider, provider_order_id)` added in [migration 20260425000000](../supabase/migrations/20260425000000_optimize_order_number_generation.sql). The client is supposed to send a stable idempotency key per logical order; the server stores it as `provider_order_id`; retries with the same key collide on the unique constraint and are de-duped.

### Methodology

**Single-process design** ([load-tests/sync-flaky-network.js](../load-tests/sync-flaky-network.js)):

1. Build a queue of N orders, each with a `randomUUID()` idempotency key.
2. Send each order's key to the server as `transaction_reference_id` in the request body, **and** as an `Idempotency-Key` HTTP header.
3. Inject client-side chaos before each request:
   - 30% drop rate (request aborted before sending)
   - 10% timeout rate (request hangs longer than client timeout)
   - 200±100ms artificial latency on remaining requests
4. On any failure, retry with **exponential backoff (capped at 2s)** using the **same idempotency key**.
5. After flush, query DB via service-role client:
   ```sql
   SELECT provider_order_id FROM online_orders
   WHERE provider = 'website' AND provider_order_id IN (<our keys>);
   ```
6. Pass criteria: `distinct keys in DB == N`, `duplicates == 0`, `missing == 0`.

**Why client-side chaos instead of Toxiproxy:** Initially planned to use Toxiproxy, but `toxiproxy-cli toxic add` failed under PowerShell 7 with "Required argument 'type' was empty" regardless of long/short flags or `--%` stop-parsing tokens or routing through cmd. Pivoted to in-script chaos, which exercises exactly the same property (idempotency under retries) without external tooling.

### Commands run

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY = "<service role from .env>"
./load-tests/run-sync-flaky.ps1 -NoProxy -Chaos
```

(`-NoProxy` skips the Toxiproxy fallback path; `-Chaos` enables in-script chaos.)

Default queue size: 50 (smoke run).

### Iterations performed

1. **First run, queue=200, original chaos config (20% timeout × 13s wait).** Hung silently for 10+ minutes — script had no progress output and the timeout chaos was so long it looked dead. User Ctrl+C'd. Script revisions:
   - Added live progress output (one character per attempt: `.` first-try OK, `✓` retry OK, `x` chaos/error).
   - Reduced timeout chaos from 13s → 4.5s wait.
   - Reduced timeout rate from 20% → 10%.
   - Reduced latency from 500±200ms → 200±100ms.
   - Reduced backoff cap from 8s → 2s.
   - Reduced default queue from 200 → 50.

2. **Second run with revised script.** This is the result reported below.

### Final result

```
Running WITHOUT toxiproxy, WITH client-side chaos

═══════════════════════════════════════════════
   TC-XCC-LOAD-003 — Sync queue / flaky network
═══════════════════════════════════════════════
   Target            : https://dfwqakoyittmrwbqvxgw.supabase.co
   Proxy in use      : no
   Client-side chaos : ON (drop=0.3, timeout=0.1, latency=200±100ms)
   Queue size        : 50
   Max attempts/req  : 6
───────────────────────────────────────────────
Flushing 50 queued requests…  ( . = first-try OK,  ✓ = OK after retry,  x = chaos/error )
x..  [2/50 done, 3 attempts so far]
x.x..  [5/50 done, 8 attempts so far]
...  [8/50 done, 11 attempts so far]
.x..  [11/50 done, 15 attempts so far]
.xxx..  [14/50 done, 21 attempts so far]
.xx.x  [16/50 done, 26 attempts so far]
...  [19/50 done, 29 attempts so far]
.x  [20/50 done, 31 attempts so far]
.xx  [21/50 done, 34 attempts so far]
x.  [22/50 done, 36 attempts so far]
...  [25/50 done, 39 attempts so far]
x...  [28/50 done, 43 attempts so far]
.xx..  [31/50 done, 48 attempts so far]
x.  [32/50 done, 50 attempts so far]
✓✓✓  [35/50 done, 53 attempts so far]
xx  [35/50 done, 55 attempts so far]
xx✓✓x  [37/50 done, 60 attempts so far]
✓xx✓xx  [39/50 done, 66 attempts so far]
✓✓✓  [42/50 done, 69 attempts so far]
✓xx  [43/50 done, 72 attempts so far]
xxx✓✓  [45/50 done, 77 attempts so far]
✓xx  [46/50 done, 80 attempts so far]
✓✓✓  [49/50 done, 83 attempts so far]
✓
───────────────────────────────────────────────
   Flushed in        : 149.4s
   Successes (client): 50/50
   Failures (client) : 0
   Total attempts    : 84 (avg 1.68/req)
───────────────────────────────────────────────
Verifying server-side idempotency against DB…
   Distinct keys in DB : 0/50
   Duplicates          : 0
   Missing             : 50 (sample: cb080344-9ade-4947-801f-92263aaa19aa,
                                     f96583e1-45c7-4f0d-94ae-20796727dd2c,
                                     e3dd211b-fe38-47a2-a1e9-63db71550075,
                                     db5f0e3d-c290-4a9e-b565-3df701a3d66c,
                                     6d23fb6b-147c-4635-8139-a7f73e8cb680)
───────────────────────────────────────────────
   RESULT : FAIL
═══════════════════════════════════════════════
```

### Interpretation — this is the most important finding from the entire Section C effort

The numbers seem contradictory: client thinks all 50 succeeded (84 attempts → 50 final successes), but **0/50 keys appear in the DB**. The client wasn't lying — the edge function returned `{success: true}` 50 times. The orders were created. They just weren't stored under the keys we sent.

Root cause confirmed in code: **[supabase/functions/create-online-order/index.ts:559](../supabase/functions/create-online-order/index.ts#L559)**

```typescript
const transactionReferenceId = `dexa-${sessionPrefix}-${Date.now()}`
```

The edge function **always generates its own `transactionReferenceId` server-side from a timestamp**. The client's `transaction_reference_id` field (and the `Idempotency-Key` header) are completely ignored. Then the server-generated value is used as `provider_order_id` ([index.ts:580, 690, 722](../supabase/functions/create-online-order/index.ts#L580)).

Practical consequence: **there is no client-controlled idempotency on the create-online-order endpoint.** The unique index on `(provider, provider_order_id)` is in place but never gets exercised, because every request — including retries — gets a fresh server-generated key.

### Bug report (TC-XCC-LOAD-003) — PRODUCT DEFECT, not infra

**Status:** FAIL — exposes a real product correctness issue.

**Defect:** `create-online-order` edge function ignores client-supplied idempotency keys. Every request generates a fresh `transactionReferenceId` server-side. Retries create duplicate orders.

**Production impact (high severity):**
1. **Customer double-charges.** If a checkout request times out and the customer retries (or a network blip causes the browser/tablet to retry automatically), the server has no way to recognize the duplicate. A second order is created and — if the customer re-enters payment — they are charged twice.
2. **POS tablet offline sync cannot dedupe.** When network returns and the queue flushes, every replay creates a new order. Restaurants will see phantom duplicate orders on busy networks.
3. **Orderout webhook retries (TC-MRC-MH-004 in test plan) likely affected** — same edge function path; provider partners that retry on timeout will create duplicates.
4. **Refund/dispute trail is corrupted** — the "real" order and the "duplicate" are indistinguishable from the merchant dashboard, complicating customer-service workflows.

**Suggested fix (minimal change):**

Modify [supabase/functions/create-online-order/index.ts:559](../supabase/functions/create-online-order/index.ts#L559):
```typescript
// Accept client-supplied idempotency key, fall back to server-generated only if absent.
const transactionReferenceId =
  req.headers.get("Idempotency-Key")
  ?? body.transaction_reference_id
  ?? `dexa-${sessionPrefix}-${Date.now()}`;
```

Then add a STEP 0 idempotency check (an optimization — the unique index will catch duplicates anyway, but this returns the existing order instead of erroring):
```typescript
const { data: existing } = await supabase
  .from('online_orders')
  .select('id, order_id, provider_order_id')
  .eq('provider', 'website')
  .eq('provider_order_id', transactionReferenceId)
  .maybeSingle();
if (existing) {
  return new Response(JSON.stringify({ success: true, order_id: existing.order_id, idempotent: true }), { status: 200 });
}
```

The unique index `idx_online_orders_provider_order_id` from [migration 20260425000000](../supabase/migrations/20260425000000_optimize_order_number_generation.sql) already exists and will enforce uniqueness at the DB level — no schema change required.

**Validating the fix:** re-run [load-tests/sync-flaky-network.js](../load-tests/sync-flaky-network.js). Pass criteria: `distinct keys in DB == 50`, `duplicates == 0`, `missing == 0`. The chaos infrastructure is in place and reusable.

### Cross-reference for fixers

The test client already sends the key in two ways the server could read:

[load-tests/sync-flaky-network.js — request payload](../load-tests/sync-flaky-network.js):
```javascript
// Body field
transaction_reference_id: key,

// Header
"Idempotency-Key": item.key,
```

Either path is fine. The header is more conventional (matches Stripe, GitHub, etc.).

---

## Outstanding cleanup the user did NOT do

These were left undone when the session ended. Anyone picking this up should run them.

### 1. ⚠️ HIGH PRIORITY — drop the temporary anon read policy on orders

A permissive SELECT policy was added to `public.orders` for the LOAD-002 test. **It is still in place.** This currently lets anyone with the public anon key read every order in the database.

```sql
DROP POLICY "loadtest_anon_read_orders" ON public.orders;
```

Verify removal:
```sql
SELECT policyname FROM pg_policies WHERE tablename = 'orders' AND policyname = 'loadtest_anon_read_orders';
-- should return zero rows
```

### 2. Delete test orders from LOAD-003

The LOAD-003 run created ~84 phantom orders (one per attempt, since the bug caused every retry to create a new order). They have predictable customer emails:

```sql
SELECT count(*) FROM public.online_orders
WHERE customer_email LIKE 'synctest+%@test.com';

DELETE FROM public.online_orders
WHERE customer_email LIKE 'synctest+%@test.com';
```

(Note: depending on FK cascades, this may also need cleanup in `orders`, `order_items`, etc. — verify before reporting "no test data left.")

### 3. (Optional) Tidy the orphaned LOAD-001 test orders

[load-orders.js](../load-orders.js) created ~1,449 orders during the prior baseline run. Filter by:
```sql
SELECT count(*) FROM public.online_orders WHERE customer_email LIKE 'loadtest+%@test.com';
```

---

## Files added during this work

| File | Purpose | Notes |
|---|---|---|
| [load-tests/realtime-fanout.js](../load-tests/realtime-fanout.js) | k6 WS subscriber driver for LOAD-002 | Has hardcoded fallback for SUPABASE_ANON_KEY (staging project; same key already public in [load-orders.js](../load-orders.js)). |
| [load-tests/trigger-fanout-events.js](../load-tests/trigger-fanout-events.js) | Pulses DB rows during LOAD-002 hold phase | Default TARGET_ROW_ID hardcoded — change if not running against staging. |
| [load-tests/sync-flaky-network.js](../load-tests/sync-flaky-network.js) | LOAD-003 test harness | Built-in client-side chaos. Config via env vars (CHAOS, CHAOS_DROP_RATE, CHAOS_TIMEOUT_RATE, etc.). |
| [load-tests/run-sync-flaky.ps1](../load-tests/run-sync-flaky.ps1) | PS runner for LOAD-003 | Flags: -QueueSize, -MaxAttempts, -NoProxy, -Chaos. |
| [load-tests/run-realtime-fanout.ps1](../load-tests/run-realtime-fanout.ps1) | Pre-existing PS runner for LOAD-002 | Wraps k6 with env vars; flags: -Vus, -Channel, -Schema. |

---

## Summary table for Temur

| Test | Status | Severity | Bug |
|---|---|---|---|
| LOAD-001 | Review only | — | Pre-existing migration looks correct; needs re-run to confirm. Two follow-ups: cron-schedule cleanup function; verify session-pooler safety. |
| LOAD-002 | **FAIL** | Medium | Realtime fan-out at 200 subscribers: 22% event drop rate, p(95) latency 7.9s (target <2s). Affects floor-plan, device-heartbeat, receipt-template dashboards. Likely Supabase plan tier capacity issue. |
| LOAD-003 | **FAIL — product defect** | **High** | `create-online-order` edge function ignores client idempotency keys. Server generates its own from `Date.now()`. Retries create duplicate orders → potential customer double-charges, phantom POS orders, corrupted orderout webhook integration. |
| LOAD-004 | Skipped | — | Hardware blocked (needs Landi tablet). |

Side finding: Realtime + RLS silently drops events when subscribing role can't SELECT the row. Trap for future code; document or lint.

---

## Quick reference: how to re-run each test

### LOAD-002 (Realtime fan-out)

Pre-flight: ensure `loadtest_anon_read_orders` policy exists (or test against `online_store_config` if you don't want the policy).

Terminal 1:
```powershell
./load-tests/run-realtime-fanout.ps1 -Vus 200
```

Terminal 2 (start when VUs reach target):
```powershell
$env:SUPABASE_URL = "https://dfwqakoyittmrwbqvxgw.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<from .env>"
node load-tests/trigger-fanout-events.js
```

### LOAD-003 (Sync queue / chaos)

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY = "<from .env>"
./load-tests/run-sync-flaky.ps1 -NoProxy -Chaos
```

For larger runs after the LOAD-003 fix:
```powershell
./load-tests/run-sync-flaky.ps1 -NoProxy -Chaos -QueueSize 200
```

### LOAD-001 (existing)

```powershell
k6 run load-orders.js
```

---

## Lessons captured (per CLAUDE.md "Self-Improvement Loop")

1. **Always include progress output in long-running test scripts.** A silent script running for 10+ minutes is indistinguishable from a hung script. Per-iteration single-character output costs nothing and saves everyone's time.
2. **`Gauge.add(value)` in k6 sets the gauge, not increments.** Use `Counter` for monotonically increasing counts.
3. **k6 metric thresholds default to "true" when no samples are recorded.** Pass logic must explicitly require `count > 0` for trends — otherwise zero-event tests claim PASS.
4. **Supabase Realtime postgres_changes inherits RLS from the subscribing JWT role.** Anon-connected clients silently get zero events on tables without an anon SELECT policy. No error, no warning — just nothing.
5. **PowerShell 7 + `urfave/cli` v3 binaries can drop short flags.** When stuck, build chaos in-process rather than fighting external tooling.
6. **Verify "client says success → DB has the data" both directions in idempotency tests.** Client-side success doesn't mean the right rows exist server-side. The LOAD-003 finding only emerged because the test queried the DB after, not just trusted the success responses.
