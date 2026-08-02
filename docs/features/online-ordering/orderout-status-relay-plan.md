# OrderOut Outbound Status Relay — Implementation Plan

**Ticket:** [🐛 [BE-BUG] OrderOut Outbound Status Relay](https://app.notion.com/p/BE-BUG-OrderOut-Outbound-Status-Relay-POS-Mark-Ready-Done-never-reaches-UberEats-DoorDash-Gru-3aa8280c1b1d8178b09dd7c2f859aab0) · High · In progress
**Problem doc:** [BUG-orderout-outbound-status-relay.md](./BUG-orderout-outbound-status-relay.md)
**Owner:** Ali Awdi · **Companion QA:** Ali Dika
**Branch:** `feat/orderout-status-relay` off `aliawdi-dev`
**Plan written:** 2026-07-27

---

## 0. What changed since the ticket was written

The ticket's Day-0 blocker ("endpoint + payload not documented, build behind a mock, do not guess") is **mostly resolved**. Established by reading `orderout-docs/` (untracked, local-only) plus live read-only API calls:

| Question | Answer | How |
|---|---|---|
| Mark-ready endpoint | `POST https://api.orderout.co/api/channel/order/{order_id}/mark-ready` — no body, `202` async, `400/401/404` | Live doc page |
| Which identifier? | **`online_orders.external_reference`** | Accept/Reject doc states verbatim: *"ID of the order you received in the `externalReferenceId` field"* |
| Do we already store it? | **Yes** — populated on 42/42 staging rows, matches `raw_payload` exactly, present on real orders back to March | DB |
| Does OrderOut support `completed`? | **No such endpoint.** POS Ops → Orders = Cancel, Mark Ready, Accept/Reject only | Reference index |
| Is our API key valid? | Valid on `/api/pos/*` (200s). **Unverified on `/api/channel/*`** — `/api/order/<id>` returned 401 with the same key | Live calls |
| pg_net / pg_cron | Both installed (`0.20.0` / `1.6.4`) | DB |
| Vault trigger pattern | Established — `orderout_resync_url`, `internal_notification_secret` | DB + migration `20260718130000` |

**Net effect on scope:** no schema change to capture a new identifier, no backfill of existing rows, and `completed` drops out of the design entirely. One unknown remains (Phase 0).

**Undocumented endpoints discovered** via a 404 error body: `/api/order/<int:order_id>` and `/api/pos/order/status` (the latter is Accept/Reject; `OPTIONS` confirms `allow: PUT, OPTIONS`).

---

## 1. Design decisions

### D1 — Capture at the DB, not the call sites
Multiple writers move an order to `ready`: `mark_online_order_ready` (POS — confirmed: `orderService.markOnlineOrderReady` → `client.rpc("mark_online_order_ready")` → `UPDATE orders SET status='ready'`), KDS bump, `bulk_update_order_item_status_v2`, expo. Patching call sites is how this gap shipped. A trigger on `orders` is origin-agnostic and mirrors the existing 86/snooze precedent (`notify_item_snooze_change` → pg_net → resync).

### D2 — Relay `ready` only
There is no OrderOut complete/picked-up endpoint. `completed` is excluded from the trigger filter rather than enqueued-and-failed. `target_status` stays a column so accept/decline and future providers reuse the table.

### D3 — 202 is "accepted", not "confirmed"
Mark-ready is async and there is **no documented confirmation webhook** (only `push_order` and `push_menu`). Advancing `online_orders.provider_status = 'ready'` on a 202 is therefore *optimistic*. We record `sent_at` on the queue row as the honest signal and treat `provider_status` as best-known-state. **This adjusts ticket AC #2** — do not claim the marketplace confirmed anything.

### D4 — Snapshot the identifier at enqueue
The queue row stores `oo_order_id` (a copy of `external_reference`) rather than re-joining at drain time. Auditable, and the relay can't silently pick up a mutated value.

### D5 — Visibility-timeout claiming
`claim` increments `attempts` **and** pushes `next_attempt_at` forward. A worker that dies mid-flight leaves rows that become due again on their own — no stuck `claimed` state, no reaper.

### D6 — Edge function, not a Next route
Ticket specifies it, `ORDEROUT_API_KEY` is already wired into edge env for `orderout-onboard`, and the drain wants to be callable by both pg_net and pg_cron. Auth via `x-internal-secret` (reusing the existing vault secret) + deploy `--no-verify-jwt`, matching `/api/internal/*` conventions.

### D7 — Trigger cost on a hot table
`orders` status updates are POS-wide and frequent. Cost is controlled by a `WHEN` clause (no function call at all unless `status` actually became `ready`) plus an index lookup — `idx_online_orders_order_id` already exists. Dine-in orders cost one index probe and exit.

---

## Phase 0 — Close the last blocker ✅ RESOLVED 2026-07-27

Probed live against `external_reference = 5408690874220544` (our own April Grubhub test order), with a no-credentials control:

| Request | Response |
|---|---|
| POST mark-ready, **no** api-key | `401` unauthorized |
| POST mark-ready, **with** our POS api-key | `202` `{"success": true, "status": "mark_ready_dispatched", "delivery_service": "GRUBHUB"}` |

- [x] **Our existing `ORDEROUT_API_KEY` is authorized on `/api/channel/`.** No separate channel credentials needed. Nothing to escalate to Temur.
- [x] **`external_reference` is confirmed as the correct identifier** — OrderOut resolved it to a real order and identified the channel unprompted. This is now proven end-to-end, not inferred from docs.
- [x] **A request body is mandatory.** The docs say mark-ready takes none, but a POST without one answers `411 Length Required`, and `fetch()` omits `Content-Length` when there is no body. The worker sends `{}`. Without this the relay would have failed 100% in production while looking correct in review.
- [x] Response shape recorded: `{ success, status: "mark_ready_dispatched", delivery_service }`.

Still open, but **not blocking**:
- [ ] Verify `ORDEROUT_API_KEY` is set in **staging and prod** edge function envs (currently consumed by `orderout-onboard` only).
- [ ] Ask Abubeckr which branch/repo his stubs are on and what they returned. Given the key works, a missing request body (411) is now the likeliest explanation for "not working" — worth confirming so the same trap isn't re-set elsewhere.

---

## Phase 1 — Migration: queue + trigger

**File:** `supabase/migrations/20260727120000_orderout_status_relay_queue.sql`

- [ ] **Queue table**

```sql
CREATE TABLE public.orderout_status_relay_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  online_order_id uuid NOT NULL REFERENCES public.online_orders(id) ON DELETE CASCADE,
  provider        text NOT NULL DEFAULT 'orderout',
  target_status   text NOT NULL CHECK (target_status IN ('ready')),
  oo_order_id     text NOT NULL,                    -- D4: snapshot of external_reference
  state           text NOT NULL DEFAULT 'pending'
                    CHECK (state IN ('pending','sent','failed')),
  attempts        int  NOT NULL DEFAULT 0,
  max_attempts    int  NOT NULL DEFAULT 5,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error      text,
  last_status_code int,
  created_at      timestamptz NOT NULL DEFAULT now(),
  claimed_at      timestamptz,
  sent_at         timestamptz,
  UNIQUE (online_order_id, target_status)           -- AC: never double-send
);

CREATE INDEX idx_oo_relay_due
  ON public.orderout_status_relay_queue (next_attempt_at)
  WHERE state = 'pending';

ALTER TABLE public.orderout_status_relay_queue ENABLE ROW LEVEL SECURITY;
-- No policies: service-role only (project standard for queue tables).
```

- [ ] **Trigger function** — `SECURITY DEFINER`, pinned `search_path`, no synchronous HTTP.

```sql
CREATE OR REPLACE FUNCTION public.enqueue_orderout_status_relay()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE v_oo RECORD; v_new_id uuid;
BEGIN
  SELECT id, external_reference INTO v_oo
  FROM public.online_orders
  WHERE order_id = NEW.id AND provider = 'orderout'
  LIMIT 1;

  -- Not an OrderOut order, or we never captured the identifier -> no-op.
  IF NOT FOUND OR v_oo.external_reference IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.orderout_status_relay_queue
    (order_id, online_order_id, oo_order_id, target_status)
  VALUES (NEW.id, v_oo.id, v_oo.external_reference, 'ready')
  ON CONFLICT (online_order_id, target_status) DO NOTHING
  RETURNING id INTO v_new_id;

  -- Already enqueued (recall -> ready again, double-tap): do not re-poke.
  IF v_new_id IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM public.poke_orderout_status_relay();   -- best-effort, see Phase 3
  RETURN NULL;
END $$;

CREATE TRIGGER trg_relay_orderout_status
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'ready')
EXECUTE FUNCTION public.enqueue_orderout_status_relay();
```

- [ ] **Claim RPC** (D5)

```sql
CREATE OR REPLACE FUNCTION public.claim_orderout_status_relay(p_limit int DEFAULT 20)
RETURNS SETOF public.orderout_status_relay_queue
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.orderout_status_relay_queue q
     SET attempts        = q.attempts + 1,
         claimed_at      = now(),
         -- visibility timeout doubles as the backoff schedule
         next_attempt_at = now() + (interval '30 seconds' * power(2, q.attempts))
   WHERE q.id IN (
     SELECT id FROM public.orderout_status_relay_queue
      WHERE state = 'pending' AND next_attempt_at <= now()
      ORDER BY next_attempt_at
      FOR UPDATE SKIP LOCKED
      LIMIT p_limit
   )
  RETURNING q.*;
$$;
```

- [ ] **Completion RPC** — one transaction so the queue row, `online_orders`, and the DLQ can't diverge.

```sql
CREATE OR REPLACE FUNCTION public.complete_orderout_status_relay(
  p_id uuid, p_ok boolean, p_status_code int DEFAULT NULL,
  p_error text DEFAULT NULL, p_terminal boolean DEFAULT false
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.orderout_status_relay_queue;
BEGIN
  SELECT * INTO v_row FROM public.orderout_status_relay_queue WHERE id = p_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF p_ok THEN
    UPDATE public.orderout_status_relay_queue
       SET state='sent', sent_at=now(), last_status_code=p_status_code, last_error=NULL
     WHERE id=p_id;
    -- D3: optimistic. 202 means accepted, not confirmed by the marketplace.
    UPDATE public.online_orders
       SET provider_status='ready', status_updated_at=now()
     WHERE id = v_row.online_order_id;
    RETURN;
  END IF;

  IF p_terminal OR v_row.attempts >= v_row.max_attempts THEN
    UPDATE public.orderout_status_relay_queue
       SET state='failed', last_error=p_error, last_status_code=p_status_code
     WHERE id=p_id;
    INSERT INTO public.webhook_dead_letter_queue (source, event_type, raw_payload, error_message)
    VALUES ('orderout_status_relay', v_row.target_status,
            to_jsonb(v_row), p_error);
  ELSE
    UPDATE public.orderout_status_relay_queue
       SET last_error=p_error, last_status_code=p_status_code
     WHERE id=p_id;   -- stays pending; next_attempt_at already backed off on claim
  END IF;
END $$;
```

- [ ] `REVOKE ALL ... FROM anon, authenticated` on all three functions.

---

## Phase 2 — Edge function `orderout-status-relay`

**File:** `supabase/functions/orderout-status-relay/index.ts`
Template: copy `orderout-onboard/index.ts` verbatim for `orderOutRequest`, `logEvent`, response helpers, and the `MAX_RETRIES=3` / `BASE_DELAY_MS=1000` constants.

- [ ] Auth: reject unless `x-internal-secret` matches `INTERNAL_NOTIFICATION_SECRET` (constant-time compare, as `orderout-orders-webhook` does).
- [ ] Claim: `supabase.rpc('claim_orderout_status_relay', { p_limit: 20 })`.
- [ ] Per row: `POST /channel/order/${row.oo_order_id}/mark-ready`, no body.
- [ ] Outcome mapping:

  | Result | Call |
  |---|---|
  | `202` / any 2xx | `complete(..., p_ok := true, p_status_code)` |
  | `400`, `404`, `422` | `complete(..., p_ok := false, p_terminal := true)` → DLQ immediately (retrying a malformed/unknown order never succeeds) |
  | `401` / `403` | `p_terminal := true` + loud `logError` — this is a config failure, not a data failure |
  | `429`, 5xx, network | `p_ok := false`, non-terminal → stays pending, backs off |

- [ ] Return a summary body (`claimed`, `sent`, `failed`, `retrying`) for cron log readability.
- [ ] Note: `orderOutRequest` already retries 3× internally for transient errors; the queue handles longer outages. Two layers is intentional — don't remove the inner one.

---

## Phase 3 — Poke + cron drain

**File:** `supabase/migrations/20260727120100_orderout_status_relay_dispatch.sql`

- [ ] `public.poke_orderout_status_relay()` — reads `orderout_status_relay_url` + `internal_notification_secret` from `vault.decrypted_secrets`, **no-ops when either is unset** (so the migration is safe to apply before the secrets exist — exactly the pattern in `20260718130000_snooze_orderout_resync_vault.sql`), then `PERFORM net.http_post(...)` with the `x-internal-secret` header.
- [ ] Cron safety net, mirroring `restore-expired-item-snoozes`:

```sql
SELECT cron.schedule('orderout-status-relay-drain', '* * * * *',
                     $$SELECT public.poke_orderout_status_relay()$$);
```

- [ ] One-time setup (SQL editor, `postgres` role), staging then prod:

```sql
select vault.create_secret('https://<project>.supabase.co/functions/v1/orderout-status-relay',
                           'orderout_status_relay_url');
-- internal_notification_secret already exists
```

> The queue is the source of truth. If pg_net is blocked or the poke fails, cron still drains within 60s — the poke only buys the ≤30s target in AC #1.

---

## Phase 4 — Observability

- [ ] DLQ replay works for free: existing HQ tooling keys off `source`, and `orderout_status_relay` rows carry the full queue row in `raw_payload`.
- [ ] Health query (add to the ticket + runbook):

```sql
SELECT state, count(*), max(attempts) AS worst_attempts, max(last_error) AS sample_error
FROM orderout_status_relay_queue
WHERE created_at > now() - interval '24 hours'
GROUP BY 1;
```

- [ ] No new merchant-facing UI. Staff UX stays fire-and-forget (D1/ticket §3) — the POS must never surface relay state.

---

## Phase 5 — Staging validation

> ⚠️ **Staging has no usable OrderOut data.** 42 orders total, newest `2026-07-12`, nearly all `TEST-*`. Worse, `orderout_restaurants.oo_restaurant_id = 6503286073065472` **no longer exists on OrderOut's side** — the live restaurant list returns only `5677900649070592`, `6487684134600704`, `5608314721402880`. Seed/repoint before any E2E, and tell Ali Dika now — the companion ticket's "staging matrix" cannot run as-is.

- [ ] Repoint a staging location at a real OrderOut restaurant, or seed `online_orders` rows with valid `external_reference` values.
- [ ] AC1 — mark an OrderOut order ready → **exactly one** queue row; endpoint receives one call; ≤30s via poke.
- [ ] AC2 — `provider_status='ready'`, `status_updated_at` set, row `sent`.
- [ ] AC3 — force 5xx (mock) → backoff → after `max_attempts` lands in DLQ, replayable. No crash loop.
- [ ] AC4 — double-tap + recall→ready → still exactly one row, one call.
- [ ] AC5 — dine-in / website / QR order → **zero** queue rows.
- [ ] AC6 — regression: inbound webhook, KDS routing, provider-initiated cancellation.
- [ ] Trigger cost: confirm a dine-in `ready` does not measurably slow the POS action.
- [ ] Logic tests via `npx tsx` — **not vitest** (broken locally: corrupt win32 rolldown binding). DB behaviour asserted with SQL, not unit tests.

---

## Phase 6 — Prod rollout

- [ ] Companion ticket's staging matrix green first (ticket AC #7).
- [ ] Apply migrations via SQL editor + `supabase migration repair --status applied`. **Never `db push` to prod.**
- [ ] Set `orderout_status_relay_url` in prod vault; confirm `ORDEROUT_API_KEY` in prod edge env.
- [ ] Deploy the edge function; confirm cron job registered.
- [ ] **No backfill.** ~14 days of prod orders sit at `confirmed` and are long since physically complete — replaying them would fire "order ready" notifications for food that arrived days ago. The trigger only fires on new transitions, so historical rows are naturally excluded; do not add a reconciler that sweeps them.
- [ ] Live validation: Temur places a real ~$1 order → Ali Awdi marks Done on POS → platform status flips. Capture request/response logs + screen recording **by a non-implementer** (DoD).
- [ ] Regression-check the order card's OrderOut platform ID change (Abubeckr, shipped today) during E2E.
- [ ] Paste verification SQL output into the Notion ticket.

---

## Files

**New**
- `supabase/migrations/20260727120000_orderout_status_relay_queue.sql`
- `supabase/migrations/20260727120100_orderout_status_relay_dispatch.sql`
- `supabase/functions/orderout-status-relay/index.ts`

**Modified**
- `database.types.ts` — regenerate after applying (new table + 3 RPCs)
- `docs/features/online-ordering/BUG-orderout-outbound-status-relay.md` — correct the now-wrong "endpoint unknown" claims
- `.gitignore` / commit `orderout-docs/` — currently untracked and local-only; it is the best OrderOut reference we have

**Not touched:** any POS/KDS client code, any money logic, `mark_online_order_ready` / `complete_online_order` (the trigger observes them; their misleading comments can stay accurate once the layer exists).

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| ~~POS key rejected on `/api/channel/*`~~ | **Retired** — verified `202` with our key | — |
| ~~`external_reference` ≠ mark-ready's `order_id`~~ | **Retired** — OrderOut resolved it live and named the channel | — |
| Missing request body → `411` | **Hit during Phase 0** | Worker sends `{}`; `411` classified terminal so a regression fails loudly instead of retrying |
| 202 doesn't mean the marketplace updated | High (by design) | D3 — `sent_at` is the honest signal; live validation in Phase 6 is the real proof |
| Trigger slows POS ready on a hot table | Low | `WHEN` clause + existing `idx_online_orders_order_id`; measure in Phase 5 |
| pg_net blocked in an env | Low | Cron drain is independent; queue is source of truth |
| Abubeckr's stubs conflict | Unknown — not found in either repo | Audit before branching (Phase 0) |

## Rollback

`DROP TRIGGER trg_relay_orderout_status ON public.orders;` — stops all enqueueing instantly, leaves the queue and every processed row intact for inspection. Full teardown: unschedule cron, drop the three functions, drop the table. No other subsystem reads it.

## Open questions

1. Does OrderOut confirm mark-ready asynchronously via any webhook, or is 202 the end of our visibility? (Affects whether `provider_status='ready'` is ever more than optimistic.)
2. Does mark-ready require the order to have been accepted first? Docs say *"marks a **confirmed** order as ready"* — all our prod rows are `confirmed`, so likely fine.
3. Should accept/decline writeback (`PUT /api/pos/order/status`, **key already verified working**) be folded in as a fast-follow? Same table, same worker, `target_status` already supports it — and it closes handoff gap #1 completely.
