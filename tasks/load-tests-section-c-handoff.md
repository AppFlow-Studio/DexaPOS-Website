# Section C Load Tests — Index & Summary

**Date run:** 2026-04-25
**Tester:** aliawdidev@gmail.com (fresh-eyes QA assignment)
**Scope:** TC-XCC-LOAD-001, LOAD-002, LOAD-003 from `DEXA_POS_Test_Plan_v2.md`
**Skipped:** TC-XCC-LOAD-004 (requires Landi tablet — hardware blocked)

This is the index. Each test has its own detailed file linked below. Read those for methodology, raw results, interpretation, and fix proposals.

---

## Per-test files

| Test | File | Status | Severity |
|---|---|---|---|
| LOAD-001 | [load-001-order-throughput.md](load-001-order-throughput.md) | Review only — needs re-run post-migration | Pre-existing fix likely correct; needs validation |
| LOAD-002 | [load-002-realtime-fanout.md](load-002-realtime-fanout.md) | **FAIL** at 200 VUs | Medium — affects internal dashboards |
| LOAD-003 | [load-003-sync-flaky-network.md](load-003-sync-flaky-network.md) | **FAIL — exposes product defect** | **HIGH — risk of customer double-charges** |

---

## Bugs found, in priority order

### 1. HIGH — `create-online-order` edge function ignores idempotency keys

**File:** [load-003-sync-flaky-network.md](load-003-sync-flaky-network.md)
**Code:** [supabase/functions/create-online-order/index.ts:559](../supabase/functions/create-online-order/index.ts#L559)

Server generates its own `transactionReferenceId` from `Date.now()`, ignoring client-supplied keys. Retries (network blips, customer "retry" clicks, POS offline sync flushes, Orderout webhook redelivery) create duplicate orders. Risk: customer double-charges.

**Suggested fix:** read `Idempotency-Key` header (or `body.transaction_reference_id`) before falling back to server-generated. Add STEP 0 check that returns existing order on duplicate key. Detail in the LOAD-003 doc.

### 2. MEDIUM — Realtime fan-out drops 22% of events at 200 subscribers

**File:** [load-002-realtime-fanout.md](load-002-realtime-fanout.md)

200 concurrent subscribers on `public.orders`: 1,565/2,000 events delivered, p(95) latency 7.9s (target <2s). Affects floor-plan dashboard, device-heartbeat dashboard, receipt-template editor. Customer-facing order tracker is unaffected (uses broadcast, not postgres_changes).

**Likely cause:** Supabase Realtime tier capacity. Short-term fix: upgrade plan. Long-term fix: migrate dashboards to per-location broadcast channels (the pattern OrderStatusWatcher already uses).

### 3. SIDE FINDING — Realtime + RLS silently drops events

**File:** [load-002-realtime-fanout.md](load-002-realtime-fanout.md)

`postgres_changes` subscriptions inherit RLS as the subscribing JWT's role. If anon can't SELECT the row, events are silently filtered out — no error, no log. Several tables in `supabase_realtime` (orders, order_payments, etc.) have no anon SELECT policy. Trap for any future code wiring postgres_changes from a public page. Recommend documenting or lint-rule-ing.

### 4. LOAD-001 follow-ups (low) — migration is correct but has loose ends

**File:** [load-001-order-throughput.md](load-001-order-throughput.md)

The `nextval()`-based fix in [migration 20260425000000](../supabase/migrations/20260425000000_optimize_order_number_generation.sql) is logically sound. Two follow-ups:
1. `cleanup_old_order_sequences()` is created but never installed as a `pg_cron` job. Sequences accumulate.
2. Session-scoped `pg_advisory_lock` could leak under transaction-pooler connection death. Consider `pg_try_advisory_xact_lock` + retry.

---

## Outstanding cleanup the user did NOT do

These were left undone when the session ended.

### ⚠️ HIGH PRIORITY — drop the temporary anon read policy on orders

A permissive SELECT policy was added to `public.orders` for the LOAD-002 test. **It is still in place.** This currently lets anyone with the public anon key read every order in the database.

```sql
DROP POLICY "loadtest_anon_read_orders" ON public.orders;
```

Verify removal:
```sql
SELECT policyname FROM pg_policies WHERE tablename = 'orders' AND policyname = 'loadtest_anon_read_orders';
-- should return zero rows
```

### Delete test orders from LOAD-003

The LOAD-003 run created ~84 phantom orders due to the idempotency bug (one per attempt). Predictable email pattern:
```sql
DELETE FROM public.online_orders
WHERE customer_email LIKE 'synctest+%@test.com';
```

### Optional — tidy the LOAD-001 baseline run's orphaned orders

`loadtest+%@test.com` pattern, ~1,449 rows.

---

## Files added during this work

| File | Purpose |
|---|---|
| [load-tests/realtime-fanout.js](../load-tests/realtime-fanout.js) | k6 WS subscriber driver for LOAD-002 |
| [load-tests/trigger-fanout-events.js](../load-tests/trigger-fanout-events.js) | Pulses DB rows during LOAD-002 hold phase |
| [load-tests/sync-flaky-network.js](../load-tests/sync-flaky-network.js) | LOAD-003 test harness with built-in chaos |
| [load-tests/run-sync-flaky.ps1](../load-tests/run-sync-flaky.ps1) | PS runner for LOAD-003 |
| [load-tests/run-realtime-fanout.ps1](../load-tests/run-realtime-fanout.ps1) | (pre-existing) PS runner for LOAD-002 |

---

## Quick reference: how to re-run each test after a fix lands

### LOAD-001 — order throughput
```powershell
k6 run load-orders.js
```

### LOAD-002 — realtime fan-out
Pre-flight: ensure `loadtest_anon_read_orders` policy exists (or test against a different table the anon role can SELECT).

Terminal 1:
```powershell
./load-tests/run-realtime-fanout.ps1 -Vus 200
```

Terminal 2 (after VUs reach target):
```powershell
$env:SUPABASE_URL = "https://dfwqakoyittmrwbqvxgw.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service role>"
node load-tests/trigger-fanout-events.js
```

### LOAD-003 — sync queue / chaos
```powershell
$env:SUPABASE_SERVICE_ROLE_KEY = "<service role>"
./load-tests/run-sync-flaky.ps1 -NoProxy -Chaos
```

For larger runs after the LOAD-003 fix:
```powershell
./load-tests/run-sync-flaky.ps1 -NoProxy -Chaos -QueueSize 200
```

---

## Lessons captured (per CLAUDE.md self-improvement loop)

1. **Always include progress output in long-running test scripts.** A silent script running for 10+ minutes is indistinguishable from a hung script.
2. **`Gauge.add(value)` in k6 sets, doesn't increment.** Use `Counter` for monotonic counts.
3. **k6 metric thresholds default to passing when no samples are recorded.** Pass logic must explicitly require `count > 0`.
4. **Supabase Realtime postgres_changes inherits RLS from the subscribing JWT role.** Anon-connected clients silently get zero events on tables without an anon SELECT policy.
5. **PowerShell 7 + urfave/cli v3 binaries can drop short flags.** When stuck, build chaos in-process rather than fighting external tooling.
6. **Verify "client says success → DB has the data" both directions in idempotency tests.** The LOAD-003 finding only emerged because the test queried the DB after, not just trusted the success responses.
