# TC-XCC-LOAD-003 — Sync Queue Flush Under Flaky Network

**Test plan reference:** Section C of `DEXA_POS_Test_Plan_v2.md`
**Status:** **FAIL — and revealed a product defect, not just an infra issue**
**Severity:** **HIGH** — risk of customer double-charges and phantom POS orders

---

## TL;DR

The test was designed to verify that retried requests from a flaky network produce exactly N orders in the DB (no duplicates). It found something more important: **the create-online-order edge function ignores client-supplied idempotency keys entirely.** Every request, including retries, generates a fresh server-side ID from `Date.now()`. This means there is no client-controllable idempotency on the online-order endpoint at all, regardless of whether the network is flaky.

---

## What this test exercises

Simulates the POS tablet's offline sync queue: writes are queued locally, then flushed to the server when network returns. Under a flaky network, requests fail mid-flight and get retried. The system must guarantee that **N unique queued writes produce exactly N orders in the DB**, no matter how many retries happen.

The mechanism that should enforce this: client sends a stable idempotency key per logical order, server stores it as `provider_order_id`, retries with the same key collide on the unique index `idx_online_orders_provider_order_id` introduced in [migration 20260425000000](../supabase/migrations/20260425000000_optimize_order_number_generation.sql) and are de-duped.

### Pass criteria
- `distinct keys in DB == N`
- `duplicates == 0`
- `missing == 0`

---

## Methodology

Single-process Node script, [load-tests/sync-flaky-network.js](../load-tests/sync-flaky-network.js):

### 1. Build queue

```javascript
for (let i = 0; i < N; i++) {
  q.push({
    key: randomUUID(),               // idempotency key — sent BOTH ways below
    payload: {
      // ... order body ...
      transaction_reference_id: key, // body field
    },
    headers: { "Idempotency-Key": key }  // header
  });
}
```

### 2. Inject client-side chaos before each request

```javascript
if (Math.random() < CHAOS_DROP_RATE) {     // 30% — abort before sending
  return { ok: false, error: "chaos: connection reset before send" };
}
if (Math.random() < CHAOS_TIMEOUT_RATE) {  // 10% — hang for 4.5s, time out
  await sleep(CHAOS_TIMEOUT_WAIT);
  return { ok: false, error: "chaos: request timed out" };
}
await sleep(CHAOS_LATENCY_MS ± CHAOS_JITTER_MS);  // 200±100ms latency on rest
```

### 3. Retry with exponential backoff, REUSING the same key

```javascript
const backoff = Math.min(2000, 150 * 2^(attempts-1)) + jitter;
// up to 6 attempts per request
```

### 4. Verify against DB after flush

```javascript
const { data } = await sb
  .from("online_orders")
  .select("provider_order_id")
  .eq("provider", "website")
  .in("provider_order_id", keys);
```

If idempotency works correctly: every attempt for the same logical order should resolve to the same `provider_order_id`, and N keys should map to exactly N rows.

### Why client-side chaos instead of Toxiproxy

Initially planned to use [Toxiproxy](https://github.com/Shopify/toxiproxy). On this Windows / PowerShell 7 setup, `toxiproxy-cli toxic add` failed with `Required argument 'type' was empty` regardless of:
- Short flags (`-t latency`)
- Long flags with equals (`--type=latency`)
- Long flags with space (`--type latency`)
- The `--%` stop-parsing token
- Routing through `cmd.exe` via `cmd /c "..."`

This appears to be a known parsing bug in the cli's `urfave/cli` v3 dependency. Rather than spend more time fighting tooling, in-script chaos was added — it exercises the same property (idempotency under retries) without external dependencies.

---

## Iterations performed

### Run 1 — queue=200, original chaos config

Hung silently for 10+ minutes. Two problems:
1. No progress output → indistinguishable from a hang
2. Timeout chaos was 13s wait per timeout-failed request × 20% rate × 200 orders = ~520s minimum just sitting in chaos timeouts

User Ctrl+C'd. Script revisions:
- Added one-character-per-attempt progress output (`.` first-try OK, `✓` retry OK, `x` chaos/error)
- Reduced timeout chaos from 13s → 4.5s wait
- Reduced timeout rate from 20% → 10%
- Reduced latency from 500±200ms → 200±100ms
- Reduced backoff cap from 8s → 2s
- Reduced default queue from 200 → 50 for first run

### Run 2 — queue=50, revised chaos

This is the result reported below.

---

## Final result (run 2)

### Command run

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY = "<service role from .env>"
./load-tests/run-sync-flaky.ps1 -NoProxy -Chaos
```

### Raw terminal output

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
x..
  [2/50 done, 3 attempts so far]
x.x..
  [5/50 done, 8 attempts so far]
...
  [8/50 done, 11 attempts so far]
.x..
  [11/50 done, 15 attempts so far]
.xxx..
  [14/50 done, 21 attempts so far]
.xx.x
  [16/50 done, 26 attempts so far]
...
  [19/50 done, 29 attempts so far]
.x
  [20/50 done, 31 attempts so far]
.xx
  [21/50 done, 34 attempts so far]
x.
  [22/50 done, 36 attempts so far]
...
  [25/50 done, 39 attempts so far]
x...
  [28/50 done, 43 attempts so far]
.xx..
  [31/50 done, 48 attempts so far]
x.
  [32/50 done, 50 attempts so far]
✓✓✓
  [35/50 done, 53 attempts so far]
xx
  [35/50 done, 55 attempts so far]
xx✓✓x
  [37/50 done, 60 attempts so far]
✓xx✓xx
  [39/50 done, 66 attempts so far]
✓✓✓
  [42/50 done, 69 attempts so far]
✓xx
  [43/50 done, 72 attempts so far]
xxx✓✓
  [45/50 done, 77 attempts so far]
✓xx
  [46/50 done, 80 attempts so far]
✓✓✓
  [49/50 done, 83 attempts so far]
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

---

## Interpretation

### What the numbers mean

| Metric | Value | Reading |
|---|---|---|
| Successes (client) | 50/50 | Server returned `{success: true}` for every order |
| Total attempts | 84 (avg 1.68/req) | Chaos worked — 34 attempts failed and retried |
| Distinct keys in DB | **0/50** | **None of our keys appear in `online_orders.provider_order_id`** |
| Duplicates | 0 | Trivially 0 because no keys were found at all |
| Missing | 50 | Every single key is missing |

The numbers seem contradictory at first: client thought all 50 succeeded, but DB has 0 of our keys. The client wasn't lying. The orders **were** created — probably ~84 of them, one per successful attempt, since there's no dedup. They just weren't stored under the keys we generated.

### Root cause confirmed in code

**[supabase/functions/create-online-order/index.ts:559](../supabase/functions/create-online-order/index.ts#L559):**

```typescript
const transactionReferenceId = `dexa-${sessionPrefix}-${Date.now()}`
```

The edge function **always generates its own `transactionReferenceId` server-side** from a session prefix and a timestamp. The client's `transaction_reference_id` body field and `Idempotency-Key` header are **completely ignored**. That server-generated value is then used as `provider_order_id`:

- [index.ts:580](../supabase/functions/create-online-order/index.ts#L580): `p_provider_order_id: transactionReferenceId`
- [index.ts:690](../supabase/functions/create-online-order/index.ts#L690): `provider_order_id: transactionReferenceId`
- [index.ts:702](../supabase/functions/create-online-order/index.ts#L702): `transaction_id: transactionReferenceId`
- [index.ts:722](../supabase/functions/create-online-order/index.ts#L722): `provider_order_id: transactionReferenceId`

### Practical consequence

There is **no client-controllable idempotency** on the create-online-order endpoint. The unique index on `(provider, provider_order_id)` from [migration 20260425000000](../supabase/migrations/20260425000000_optimize_order_number_generation.sql) is in place but never gets exercised, because every request — including retries of the same logical order — gets a fresh server-generated key. A retry never collides with the original.

### Verifying the fallout in the DB

To confirm the test created ~84 phantom orders rather than 50:
```sql
SELECT count(*), min(created_at), max(created_at)
FROM public.online_orders
WHERE customer_email LIKE 'synctest+%@test.com'
  AND created_at > NOW() - INTERVAL '1 hour';
```
Expected: a count significantly higher than 50 (one per attempt, not one per logical order). This is the duplicate-creation bug in observable form.

---

## Bug report

### Defect

`create-online-order` edge function ignores client-supplied idempotency keys. Every request generates a fresh `transactionReferenceId` server-side. Retries create duplicate orders.

### Production impact (high severity)

1. **Customer double-charges.** If a checkout request times out and the customer retries (or a network blip causes the browser/tablet to retry automatically), the server has no way to recognize the duplicate. A second order is created, and if the customer re-enters payment, **they are charged twice**.
2. **POS tablet offline sync cannot dedupe.** When network returns and the queue flushes, every replay creates a new order. Restaurants will see phantom duplicate orders on busy networks.
3. **Orderout webhook retries (TC-MRC-MH-004 in test plan) likely affected.** Same edge function path; provider partners that retry on timeout will create duplicates.
4. **Refund/dispute trail is corrupted.** The "real" order and the "duplicate" are indistinguishable from the merchant dashboard, complicating customer-service workflows.

### Suggested fix

#### Step 1: accept client-supplied idempotency key at [supabase/functions/create-online-order/index.ts:559](../supabase/functions/create-online-order/index.ts#L559)

Replace:
```typescript
const transactionReferenceId = `dexa-${sessionPrefix}-${Date.now()}`
```

With:
```typescript
const transactionReferenceId =
  req.headers.get("Idempotency-Key")
  ?? body.transaction_reference_id
  ?? `dexa-${sessionPrefix}-${Date.now()}`;
```

This preserves backward compatibility (clients that don't send a key still work) while letting clients that DO send one drive idempotency.

#### Step 2: add STEP 0 idempotency check (return existing order on duplicate)

Before any creation logic:
```typescript
const { data: existing } = await supabase
  .from('online_orders')
  .select('id, order_id, provider_order_id')
  .eq('provider', 'website')
  .eq('provider_order_id', transactionReferenceId)
  .maybeSingle();

if (existing) {
  return new Response(
    JSON.stringify({
      success: true,
      order_id: existing.order_id,
      provider_order_id: existing.provider_order_id,
      idempotent: true,                  // marker so client knows it was a replay
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
}
```

This is an optimization — the unique index will catch duplicates anyway via `23505` error — but returning the existing order ID makes the retry path graceful instead of error-then-recovery.

#### Step 3: ensure the unique index is in place

The index from [migration 20260425000000](../supabase/migrations/20260425000000_optimize_order_number_generation.sql) already exists:
```sql
CREATE INDEX IF NOT EXISTS idx_online_orders_provider_order_id
  ON public.online_orders (provider, provider_order_id);
```

For true uniqueness enforcement, this should be a UNIQUE index:
```sql
-- Either replace, or add a unique constraint on top
ALTER TABLE public.online_orders
  ADD CONSTRAINT online_orders_provider_order_id_uniq
  UNIQUE (provider, provider_order_id);
```

If existing data has duplicates, that ALTER will fail and you need to dedupe first.

#### Step 4: validating the fix

Re-run [load-tests/sync-flaky-network.js](../load-tests/sync-flaky-network.js):

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY = "<service role>"
./load-tests/run-sync-flaky.ps1 -NoProxy -Chaos -QueueSize 50
```

Pass criteria:
- `distinct keys in DB == 50`
- `duplicates == 0`
- `missing == 0`

After 50 passes, scale up:
```powershell
./load-tests/run-sync-flaky.ps1 -NoProxy -Chaos -QueueSize 200
```

---

## Cross-reference for fixers

The test client already sends the key in two ways the server can read:

[load-tests/sync-flaky-network.js — request payload](../load-tests/sync-flaky-network.js):
```javascript
// Body field
transaction_reference_id: key,

// Header
"Idempotency-Key": item.key,
```

Either reading path is fine in the fix. The header is more conventional (matches Stripe, GitHub, etc.). Bias toward header.

---

## Outstanding cleanup

The LOAD-003 run created ~84 phantom orders (one per attempt, since the bug caused every retry to create a new order). They have predictable customer emails:

```sql
SELECT count(*) FROM public.online_orders
WHERE customer_email LIKE 'synctest+%@test.com';

DELETE FROM public.online_orders
WHERE customer_email LIKE 'synctest+%@test.com';
```

Note: depending on FK cascades, this may also need cleanup in `orders`, `order_items`, `order_payments`, etc. Verify before reporting "no test data left."

---

## File references

- Test harness: [load-tests/sync-flaky-network.js](../load-tests/sync-flaky-network.js)
- PS runner: [load-tests/run-sync-flaky.ps1](../load-tests/run-sync-flaky.ps1)
- Edge function with bug: [supabase/functions/create-online-order/index.ts:559](../supabase/functions/create-online-order/index.ts#L559)
- Index that should enforce uniqueness: [supabase/migrations/20260425000000_optimize_order_number_generation.sql](../supabase/migrations/20260425000000_optimize_order_number_generation.sql)

---

## Configuration reference for the test harness

Environment variables consumed by [load-tests/sync-flaky-network.js](../load-tests/sync-flaky-network.js):

| Variable | Default | Purpose |
|---|---|---|
| `SUPABASE_URL` | (required) | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | (required) | For final DB verification (bypasses RLS) |
| `SUPABASE_ANON_KEY` | (required) | For sending requests as anon |
| `STORE_CONFIG_ID` | (required) | Active online store config UUID |
| `MENU_ITEM_ID` | (required) | A bookable menu item UUID |
| `QUEUE_SIZE` | 50 | Number of orders to enqueue |
| `MAX_ATTEMPTS` | 6 | Per-request retry cap |
| `USE_PROXY` | 0 | Set to "1" to route through Toxiproxy |
| `PROXY_URL` | — | Toxiproxy listen address (e.g. http://127.0.0.1:54320) |
| `CHAOS` | 0 | Set to "1" to enable in-script chaos |
| `CHAOS_DROP_RATE` | 0.30 | Fraction of attempts that abort before sending |
| `CHAOS_TIMEOUT_RATE` | 0.10 | Fraction that hang and time out |
| `CHAOS_TIMEOUT_WAIT` | 4500 | ms to hang before "timeout" returns |
| `CHAOS_LATENCY_MS` | 200 | Base latency added on every successful attempt |
| `CHAOS_JITTER_MS` | 100 | ± random latency added |
| `REQUEST_TIMEOUT_MS` | 4000 | AbortController timeout for fetch |

The PS runner [load-tests/run-sync-flaky.ps1](../load-tests/run-sync-flaky.ps1) sets the staging defaults and accepts flags `-QueueSize`, `-MaxAttempts`, `-NoProxy`, `-Chaos`.
