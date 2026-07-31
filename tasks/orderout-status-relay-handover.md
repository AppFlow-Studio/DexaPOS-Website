# OrderOut Outbound Status Relay — Implementation & Handover

_Written 2026-07-27. Covers what was built, every Supabase object involved, how to deploy it to a new environment, and the traps that cost time the first time._

**Ticket:** [🐛 [BE-BUG] OrderOut Outbound Status Relay](https://app.notion.com/p/BE-BUG-OrderOut-Outbound-Status-Relay-POS-Mark-Ready-Done-never-reaches-UberEats-DoorDash-Gru-3aa8280c1b1d8178b09dd7c2f859aab0)
**Branch:** `feat/orderout-status-relay`
**Related:** [BUG-orderout-outbound-status-relay.md](./BUG-orderout-outbound-status-relay.md) (problem analysis) · [orderout-status-relay-plan.md](./orderout-status-relay-plan.md) (build plan) · [orderout-integration-handoff.md](./orderout-integration-handoff.md) (the wider OrderOut integration)

---

## 1. What this fixes

Marking a delivery order **Ready** on the POS or KDS used to update Dexa's database only. Nothing was sent back to OrderOut, so UberEats / DoorDash / Grubhub never advanced the order — no "your order is ready" push to the customer, no pickup signal to the courier. Every `provider='orderout'` order in production sat at `provider_status='confirmed'` forever.

Only the **inbound** half of the integration had ever been built. `mark_online_order_ready()` even documents the missing piece — *"The OrderOut integration layer observes this transition and relays mark-ready to the marketplace"* — but that layer did not exist. This is that layer.

## 2. How it works

```
POS / KDS "Ready"
      │
      ▼
UPDATE orders SET status='ready'          ← any writer: POS RPC, KDS bump, bulk advance, expo
      │
      ▼  trigger trg_relay_orderout_status  (AFTER UPDATE OF status)
      │
      ├─► INSERT INTO orderout_status_relay_queue   ← durable. one row per (order, status)
      │
      └─► poke_orderout_status_relay()  ─ pg_net ─►  edge fn   (best effort, for latency)
                                                        ▲
      cron 'orderout-status-relay-drain' (every minute) ─┘      (the floor — always runs)
                                                        │
                                                        ▼
                                          claim_orderout_status_relay(20)
                                                        │
                                          POST api.orderout.co/api/channel/order/{id}/mark-ready
                                                        │
                                    ┌───────────────────┴───────────────────┐
                                 2xx│                                       │4xx/5xx
                                    ▼                                       ▼
                    complete_...(p_ok := true)                  complete_...(p_ok := false)
                    → queue row 'sent'                          → retry w/ backoff, or
                    → online_orders.provider_status='ready'      → webhook_dead_letter_queue
```

### Three design decisions worth understanding

**Capture at the database, not the call sites.** At least four code paths move an order to `ready` (POS `mark_online_order_ready`, KDS bump, `bulk_update_order_item_status_v2`, expo). Wiring the HTTP call into each one is precisely how the original gap shipped — one path gets it, the rest silently don't. A trigger on `orders` is origin-agnostic and covers code that doesn't exist yet. Same precedent as the 86/snooze path (`notify_item_snooze_change` → pg_net → resync).

**A queue, because a trigger cannot do network I/O safely.** Calling OrderOut inside the transaction would make the merchant's tap wait on OrderOut's servers, and an OrderOut outage would become a POS outage — the order would fail to mark ready at all. Worse, a transaction gets one attempt; it cannot wait 30 seconds and retry. So the trigger does the cheapest durable thing (one INSERT) and the worker owns everything slow and fallible.

**`ready` only.** OrderOut exposes exactly three POS order operations — Cancel, Mark Ready, Accept/Reject. There is **no** complete/picked-up endpoint, so `completed` is excluded from the trigger rather than enqueued and failed forever. `target_status` remains a column so accept/decline and other providers can reuse the table.

## 3. The OrderOut API contract

Base URL `https://api.orderout.co/api`, auth header `api-key: <ORDEROUT_API_KEY>`.

```
POST /channel/order/{order_id}/mark-ready
  order_id : integer, path param
  body     : {}                      ← REQUIRED. see gotcha #2
  → 202 {"success":true,"status":"mark_ready_dispatched","delivery_service":"GRUBHUB"}
  → 400 / 401 / 404 / 411
```

**`order_id` is `online_orders.external_reference`.** Not `provider_order_id`. OrderOut's Accept/Reject reference states it verbatim: *"ID of the order you received in the `externalReferenceId` field"*. `external_reference` is a 16-digit numeric string we have stored since March, so **no schema change and no backfill were needed**. `provider_order_id` is the marketplace's own opaque code (e.g. `8SEtQhm-EfGtQ42RHRmttQ`) and will 404.

**202 means "accepted", not "the marketplace updated."** Processing is asynchronous and OrderOut documents no confirmation callback. So `online_orders.provider_status='ready'` is *best-known-state*; the queue row's `sent_at` is the honest record of what we did. Only a live end-to-end order proves the marketplace actually moved.

---

## 4. Supabase objects

### 4.1 Migrations

| File | Creates |
|---|---|
| `supabase/migrations/20260727120000_orderout_status_relay_queue.sql` | table, index, RLS, 4 functions, 1 trigger, grants |
| `supabase/migrations/20260727120100_orderout_status_relay_dispatch.sql` | the pg_cron job |

### 4.2 Table `public.orderout_status_relay_queue`

The outbox. **Source of truth** — the poke and the cron are only two different alarm clocks; losing both costs latency, never an order.

| Column | Notes |
|---|---|
| `order_id`, `online_order_id` | FKs, `ON DELETE CASCADE` |
| `provider` | `'orderout'` default; kept generic for future providers |
| `target_status` | `CHECK IN ('ready')` |
| `oo_order_id` | **Snapshot** of `external_reference` at enqueue. The worker never re-joins, so a later mutation of the source row cannot redirect an in-flight relay |
| `state` | `pending` / `sent` / `failed` |
| `attempts`, `max_attempts` | default max 5 |
| `next_attempt_at` | backoff + visibility timeout |
| `last_error`, `last_status_code` | diagnostics |
| `UNIQUE (online_order_id, target_status)` | **the anti-double-send guarantee** — double-tap and recall→ready are no-ops |

`ENABLE ROW LEVEL SECURITY` with **zero policies** — service-role only, project convention for outbox tables. Partial index `idx_oo_relay_due ON (next_attempt_at) WHERE state='pending'` serves the drain.

### 4.3 Functions

| Function | Purpose |
|---|---|
| `enqueue_orderout_status_relay()` | trigger fn. Looks up `online_orders` by `order_id` + `provider='orderout'` (uses existing `idx_online_orders_order_id`), inserts one queue row, then pokes |
| `poke_orderout_status_relay()` | reads config from Vault, `net.http_post` to the edge function. **No-ops when unconfigured** |
| `claim_orderout_status_relay(p_limit)` | `FOR UPDATE SKIP LOCKED` batch claim |
| `complete_orderout_status_relay(...)` | settles one row: queue state + `online_orders` + DLQ, in one transaction |

All `SECURITY DEFINER` with pinned `search_path`, `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE TO service_role`.

**Two subtleties in the trigger function that are easy to break:**

1. **The whole body is exception-guarded.** The hard constraint is that the staff action never fails because of relay state. A relay problem degrades to a `WARNING` in the logs; it never rolls back the order update.
2. **The poke sits in its own nested `BEGIN…EXCEPTION` block.** plpgsql exception handlers roll the enclosing block back to its start — so a failed network poke inside the outer handler would also undo the `INSERT` and silently drop the relay. That is the exact class of silent-loss bug this ticket exists to fix. **Do not flatten these blocks.**

### 4.4 Trigger

```sql
CREATE TRIGGER trg_relay_orderout_status
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'ready')
  EXECUTE FUNCTION public.enqueue_orderout_status_relay();
```

`orders` is a hot table. The `WHEN` clause means the function isn't called at all unless status actually became `ready`; a dine-in order then costs one index probe and exits.

### 4.5 Cron

```sql
SELECT cron.schedule('orderout-status-relay-drain', '* * * * *',
                     $cron$SELECT public.poke_orderout_status_relay()$cron$);
```

### 4.6 Vault secrets

Config lives in Vault because on Supabase the `postgres` role cannot `ALTER DATABASE … SET app.*`, so GUCs aren't settable from the SQL editor. Mirrors `20260718130000_snooze_orderout_resync_vault.sql`.

| Name | Value | Status |
|---|---|---|
| `orderout_status_relay_url` | `https://<project-ref>.supabase.co/functions/v1/orderout-status-relay` | **new — must be created per environment** |
| `internal_notification_secret` | already exists; shared with 86/snooze resync + order-status notify | reused as-is |

### 4.7 Edge function `orderout-status-relay`

`supabase/functions/orderout-status-relay/index.ts`. Deployed with **`verify_jwt = false`** — pg_net calls it with no user token; the `x-internal-secret` header is the auth (constant-time compare).

Env vars it needs: `ORDEROUT_API_KEY`, `INTERNAL_NOTIFICATION_SECRET`. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform — do not set them.

Behaviour: claim ≤20 due rows → POST mark-ready sequentially (small batches in practice; serialising avoids 429s) → settle each.

**Outcome classification:**

| Status | Treatment |
|---|---|
| 2xx | `sent`, advance `provider_status` |
| 400, 401, 403, 404, 411, 422 | **terminal** → straight to DLQ, no retries burned |
| 429, 5xx, network | retry with queue backoff (30s → 60s → 2m → 4m → 8m), DLQ after 5 attempts |

Non-numeric `oo_order_id` is rejected before the call — OrderOut's path param is `<int:order_id>`, so it could only ever 404.

---

## 5. Deploying to a new environment (prod)

Order matters. **Do not set the vault URL until the function is deployed and its secrets are set** — otherwise queued rows burn attempts against a 404.

### Step 1 — Apply the migrations

Prod: SQL editor, then `supabase migration repair --status applied` for both timestamps. **Never `db push` to prod.**

Verify:

```sql
SELECT tablename FROM pg_tables WHERE tablename='orderout_status_relay_queue';
SELECT tgname FROM pg_trigger WHERE tgname='trg_relay_orderout_status';
SELECT jobname, schedule, active FROM cron.job WHERE jobname='orderout-status-relay-drain';
SELECT proname FROM pg_proc WHERE proname LIKE '%orderout_status_relay%';
```

Expect the table, the trigger, an active `* * * * *` job, and 4 functions.

### Step 2 — Deploy the edge function

```bash
npx supabase functions deploy orderout-status-relay \
  --project-ref <PROJECT_REF> --no-verify-jwt
```

Then confirm the **slug** — see gotcha #1:

```sql
-- or via dashboard / MCP list
```

### Step 3 — Set the edge secrets

Dashboard → Project Settings → Edge Functions → Secrets:

- `ORDEROUT_API_KEY` — same value used by `orderout-onboard`
- `INTERNAL_NOTIFICATION_SECRET` — **must byte-match** the Vault value:

```sql
select decrypted_secret from vault.decrypted_secrets
where name = 'internal_notification_secret';
```

Verify without firing anything:

```bash
curl.exe -s -X POST https://<PROJECT_REF>.supabase.co/functions/v1/orderout-status-relay
```

| Response | Meaning |
|---|---|
| `INTERNAL_NOTIFICATION_SECRET not configured` | secret missing / misspelled |
| `Missing x-internal-secret header` | ✅ secret is set, function is live and running our code |

This is a safe probe — it can't relay anything.

### Step 4 — Turn it on

```sql
select vault.create_secret(
  'https://<PROJECT_REF>.supabase.co/functions/v1/orderout-status-relay',
  'orderout_status_relay_url'
);
```

Already exists? Update instead:

```sql
select vault.update_secret(id, 'https://<PROJECT_REF>.supabase.co/functions/v1/orderout-status-relay')
from vault.secrets where name = 'orderout_status_relay_url';
```

### Step 5 — Do NOT backfill

Historical orders sit at `provider_status='confirmed'` and are long since physically complete. Replaying them would fire "order ready" notifications for food that arrived days ago. The trigger only fires on new transitions, so history is naturally excluded — just don't add a reconciler that sweeps it.

---

## 6. Gotchas (all of these actually happened)

**1. The dashboard editor assigns the wrong slug.** Deploying via the browser editor names the function correctly but sets `slug = "dynamic-action"`. The URL is built from the **slug**, so the vault URL 404s and rows sit `pending` with no obvious cause. Always verify:

```sql
-- the slug must equal 'orderout-status-relay', not just the display name
```

Fix by redeploying under the correct slug (CLI is safer) and deleting the stray function.

**2. `mark-ready` requires a request body even though the docs say it takes none.** A POST with no body returns `411 Length Required`, and `fetch()` omits `Content-Length` when there is no body. The worker sends `{}`. **Removing that `{}` breaks the relay 100% while looking correct in review** — which is why `411` is classified terminal, so a regression fails loudly on attempt 1.

**3. `INTERNAL_NOTIFICATION_SECRET` must match Vault byte-for-byte.** A trailing newline from copying a SQL result cell is the usual culprit and produces a permanent, silent 401.

**4. Edge secrets are a separate store from Next.js env.** Having `ORDEROUT_API_KEY` in `.env` or Vercel does nothing for the function.

**5. A read-only DB role cannot decrypt Vault.** `select decrypted_secret …` fails with `permission denied for function _crypto_aead_det_decrypt`. Use a normal SQL-editor session.

**6. `internal_notification_secret` is shared.** It's also used by the 86/snooze resync trigger and the order-status notify route (which check it against `INTERNAL_NOTIFICATION_SECRET` in Vercel). Rotating it means updating **three** places: Vault, edge secrets, Vercel.

**7. PowerShell:** use `curl.exe`, never `curl` (alias), and no `\` line continuations.

---

## 7. Verifying / troubleshooting

**Health:**

```sql
SELECT state, count(*), max(attempts) AS worst, max(last_error) AS sample
FROM orderout_status_relay_queue
WHERE created_at > now() - interval '24 hours'
GROUP BY 1;
```

**A specific order:**

```sql
SELECT q.oo_order_id, q.state, q.attempts, q.last_status_code, q.last_error, q.sent_at,
       oo.provider_status, oo.status_updated_at
FROM orderout_status_relay_queue q
JOIN online_orders oo ON oo.id = q.online_order_id
WHERE q.order_id = '<order-uuid>';
```

**Prod health post-deploy** — the query shape that exposed the original bug. Pre-fix it returns one `confirmed` bucket; post-fix `ready` must accumulate:

```sql
SELECT provider_status, count(*) FROM online_orders
WHERE provider='orderout' AND created_at > now() - interval '2 days' GROUP BY 1;
```

**Symptom table:**

| Symptom | Cause |
|---|---|
| Rows stay `pending`, `attempts=0`, forever | Vault URL unset, or wrong slug. Cron is firing but `poke` no-ops or 404s |
| `last_status_code=401` on everything | `ORDEROUT_API_KEY` missing/wrong in the **edge** env |
| `last_status_code=411` | the `{}` body was removed |
| `last_status_code=404` on one order | OrderOut doesn't know that `external_reference` — usually a seeded/synthetic test row, not a real OrderOut order |
| Function returns `Invalid internal secret` | edge secret ≠ Vault value |
| No queue row at all after marking ready | order isn't `provider='orderout'`, or `external_reference` is NULL (check for a `WARNING` in Postgres logs) |

**Rollback:** `DROP TRIGGER trg_relay_orderout_status ON public.orders;` stops all enqueueing instantly and leaves every row intact for inspection. Full teardown: unschedule the cron, drop the four functions, drop the table. Nothing else reads it.

---

## 8. State at handover (staging `dfwqakoyittmrwbqvxgw`)

**Done and verified:**

- ✅ Both migrations applied. Table, trigger, 4 functions, cron job all present and correct
- ✅ Edge function deployed, slug correct, `verify_jwt=false`, both secrets set
- ✅ **Trigger proven**: one OrderOut order → exactly 1 queue row; a `website` order → 0 rows; recall→ready → still 1 row *(ticket AC1, AC4, AC5)*
- ✅ **Failure path proven end to end**: a relay attempt returned `404`, was correctly classified terminal (`attempts=1`, not 5), landed in `webhook_dead_letter_queue` with `source='orderout_status_relay'`, and `provider_status` was **not** advanced *(ticket AC3)*
- ✅ **Endpoint + auth proven** by direct probe: our existing POS `ORDEROUT_API_KEY` returns `202` on `/api/channel/`, no separate credentials needed

**Not yet done:**

- ⬜ `orderout_status_relay_url` is **not set** in staging Vault. The only successful invocation so far was a manual `curl`; **the cron → pg_net → function path has never actually run**. This is the next thing to prove
- ⬜ Success path not yet observed through the worker (`state='sent'` + `provider_status='ready'`). Blocked on staging data — see below
- ⬜ `ORDEROUT_API_KEY` presence in the **prod** edge env unverified
- ⬜ Nothing deployed to prod
- ⬜ Live validation with Charcoal Gardenia (Temur places a real ~$1 order, non-implementer records) — the only real proof the marketplace moves

**⚠️ Staging data is not usable as-is.** 42 OrderOut orders total, newest `2026-07-12`, and nearly all are synthetic `TEST-*` rows OrderOut has never heard of — they return 404. `orderout_restaurants.oo_restaurant_id = 6503286073065472` no longer exists on OrderOut's side either (their live list returns `5677900649070592`, `6487684134600704`, `5608314721402880` — the last being Charcoal Gardenia).

The **one** staging order confirmed to exist on OrderOut's side is `external_reference = 5408690874220544` (order `c16407ad-278d-40b1-bd82-bf0398134499`, Grubhub) — it returned `202` to a direct probe. Use it for the success-path test, noting it has already been marked ready once, so it may now answer `400`.

Anyone continuing this should seed staging against a real OrderOut restaurant before running the full matrix — and tell **Ali Dika**, whose companion QA ticket depends on it.
