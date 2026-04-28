# TC-XCC-LOAD-001 — 200 Concurrent Orders, P95 < 500ms

**Test plan reference:** Section C of `DEXA_POS_Test_Plan_v2.md`
**Status on this assignment:** Review only — not re-run. Migration [20260425000000_optimize_order_number_generation.sql](../supabase/migrations/20260425000000_optimize_order_number_generation.sql) is the candidate fix; needs a follow-up benchmark run to confirm.

---

## What this test exercises

200 concurrent virtual users (VUs) each post a single-line-item pickup order through the `create-online-order` edge function. Each request fully exercises the order-creation pipeline:

```
session create → stock check → price recalc → process_online_order RPC → payment record
```

Threshold:
- `http_req_duration` p(95) < 500ms
- error rate < 5%

Test driver: [load-orders.js](../load-orders.js) (k6 script, pre-existing).

---

## How to run it

```powershell
k6 run load-orders.js
```

The script's config:
- Target endpoint: `${SUPABASE_URL}/functions/v1/create-online-order`
- Ramp: 0 → 200 VUs in 10s, hold 200 for 30s, ramp down 10s (~50s total)
- Each VU: posts one order with `pay_cash_in_store: true` (skips real payment), 100ms think-time between requests
- Hardcoded `STORE_CONFIG_ID` and `MENU_ITEM_ID` near the top of the file — must match a real merchant in the target Supabase project

Output drops a full `summary.json` to `load-test-results.json` in the project root.

---

## Pre-existing baseline (before migration 20260425000000)

From [load-test-results.json](../load-test-results.json) — 51-second run, 200 VUs:

| Metric | Value |
|---|---|
| Iterations completed | 1,449 |
| Throughput | 28.2 req/s |
| Error rate | **0%** (every request succeeded) |
| `http_req_duration` median | **6,029 ms** |
| `http_req_duration` p(90) | 7,208 ms |
| `http_req_duration` p(95) | **7,516 ms** |
| `http_req_duration` p(99) | (not captured) |
| `http_req_duration` max | 12,108 ms |
| `order_e2e_time` p(95) | 7,517 ms |

**Verdict from baseline:** FAIL — p(95) of 7.5s is ~15× over the 500ms target. Errors were 0%, so the system was fully functional but pathologically slow under concurrency.

---

## Diagnosis (per migration's own commit message)

The `process_online_order` RPC wraps all 13 steps of order creation in one transaction. Inside that, it called `pg_advisory_xact_lock(...)` to serialize order-number generation — but the lock is **transaction-scoped**, so it was held for the entire 13-step sequence. With 200 concurrent VUs, every order queued one-at-a-time behind the previous order's full transaction. Order #200 had to wait roughly 200 × (single-order time) ≈ 8–10 seconds, exactly matching the observed median + p95.

This was a head-of-line blocking pattern, not a Postgres or hardware throughput problem.

---

## The candidate fix — migration 20260425000000

[supabase/migrations/20260425000000_optimize_order_number_generation.sql](../supabase/migrations/20260425000000_optimize_order_number_generation.sql)

Replaces:
```sql
pg_advisory_xact_lock(hash_of_merchant_and_date)  -- held for whole txn
SELECT MAX(...) FROM orders WHERE ...             -- LIKE-scan, no index
```

With:
```sql
nextval('ord_seq_<merchantUuid>_<YYYYMMDD>[_s<N>]')  -- microsecond lock
```

Key Postgres semantics: `nextval()` releases its internal lock in microseconds; it is **not** held for the calling transaction. 200 concurrent calls return 200 unique values with zero queuing.

The migration also adds two indexes that benefit STEP 0 idempotency checks in `process_online_order`:
- `idx_online_orders_provider_order_id` on `(provider, provider_order_id)`
- `idx_orders_external_id` on `external_id WHERE external_id IS NOT NULL`

Both indexes are referenced by the LOAD-003 fix proposal — see [load-003-sync-flaky-network.md](load-003-sync-flaky-network.md).

---

## Logical review of the migration

### Correct and well-handled

1. **Bootstrap from `MAX()` on first call of the day.** `START WITH GREATEST(v_start_val, 1)` prevents collision with orders already created today before the sequence existed. Required for safe migration day.
2. **Session-level advisory lock around `CREATE SEQUENCE`.** Without it, 200 concurrent first-callers would all race `pg_class_relname_nsp_index` and trip unique-violation errors. The author thought ahead.
3. **Exception handler releases the create-lock.** `EXCEPTION WHEN OTHERS THEN PERFORM pg_advisory_unlock(...) RAISE` covers raised errors.
4. **Cleanup function exists.** `cleanup_old_order_sequences(p_keep_days)` drops sequences via the tracking table.
5. **Station-aware path preserved.** Station numbers still produce `ORD-<date>-S<N>-<seq>` format; non-station path produces `ORD-<date>-<seq>`. Format compatibility maintained.

### Concerns / follow-ups

1. **`cleanup_old_order_sequences` is created but never installed as a cron job.** Sequences accumulate indefinitely (one per merchant per day = ~365/year/merchant). Add a `pg_cron` schedule:
   ```sql
   SELECT cron.schedule('cleanup-order-sequences', '0 3 * * *',
                        $$SELECT public.cleanup_old_order_sequences(2)$$);
   ```
2. **`pg_advisory_lock` is session-scoped, not transaction-scoped.** If Supavisor's transaction pooler is in front of the DB, a connection death mid-`CREATE SEQUENCE` could leak the lock until the backend dies. Either:
   - Switch to `pg_try_advisory_xact_lock` + retry loop, or
   - Verify this code path runs against the session pooler / direct connection only.
3. **Migration only fixes the order-number-generation lock.** `process_online_order` has 12 other steps. If any of them hold row locks on hot rows (e.g., stock check, payment record), p(95) will improve dramatically but might not hit <500ms. **Re-running this benchmark is the only way to confirm.**
4. **`SECURITY DEFINER` + `EXECUTE format(...)`.** Sequence name is constructed from `replace(merchant_id::text, '-', '')` and a date — both server-controlled, no injection surface. Safe; just calling it out.
5. **`generate_order_number_internal` lacks station support.** If POS tablet paths ever pass a `station_id` through this function, ordering could collide between the two functions. Probably out of scope but worth a code comment.

---

## Result of this assignment's review

**Migration is logically correct** and addresses the actual root cause shown in the baseline. Expected p(95) post-migration: low hundreds of milliseconds (possibly under the 500ms target, **assuming no other step in `process_online_order` is also serialized**).

**Confirming the fix requires a re-run.** Not done in this session. Anyone picking this up should:

```powershell
k6 run load-orders.js
```

Compare new `http_req_duration.p(95)` against the 7,516ms baseline. Expected delta: ~10–20× improvement.

---

## Test data left in DB

The pre-migration baseline run created ~1,449 phantom orders. Email pattern: `loadtest+<n>@test.com`. Cleanup query:
```sql
SELECT count(*) FROM public.online_orders WHERE customer_email LIKE 'loadtest+%@test.com';
DELETE FROM public.online_orders WHERE customer_email LIKE 'loadtest+%@test.com';
```
(Verify FK cascades to `orders`, `order_items` first.)

---

## File references

- Test driver: [load-orders.js](../load-orders.js)
- Baseline raw data: [load-test-results.json](../load-test-results.json)
- Candidate fix: [supabase/migrations/20260425000000_optimize_order_number_generation.sql](../supabase/migrations/20260425000000_optimize_order_number_generation.sql)
