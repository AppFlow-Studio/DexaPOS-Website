# BUG — POS Mark Ready/Done never reaches UberEats / DoorDash / Grubhub (no outbound status relay)

**Type:** Bug (backend / missing integration layer)
**Surface:** POS + KDS "Ready" / "Done" on delivery orders → OrderOut → UberEats / DoorDash / Grubhub. Visible to the *customer* (no "order ready" push) and to the *courier* (no pickup signal).
**Severity:** High — 100% failure rate on the affected path. Not a degradation; the outbound half of the integration was never built.
**Blast radius (prod, last 14 days):** every `provider='orderout'` order — ~10–15/day, all three channels — stuck at `online_orders.provider_status = 'confirmed'`. Zero orders have ever advanced platform-side.
**Reported by:** Charcoal Gardenia (Mahmoud) — has stopped using the POS for delivery entirely: *"It doesn't mark my order ready when I do it from pos… I do it from my tablet."*
**Owner:** Ali Awdi (backend). Companion QA ticket: **[POS-QA] OrderOut Ready-Path Audit + E2E Validation** (Ali Dika).
**Notion:** [🐛 [BE-BUG] OrderOut Outbound Status Relay](https://app.notion.com/p/BE-BUG-OrderOut-Outbound-Status-Relay-POS-Mark-Ready-Done-never-reaches-UberEats-DoorDash-Gru-3aa8280c1b1d8178b09dd7c2f859aab0) — High, In progress, started 2026-07-27.

---

## Symptom

A merchant marks a delivery order **Ready** (or **Done**) on the POS or KDS. Dexa's DB updates correctly — `orders.status`, `ready_at`/`completed_at`, `order_items.kitchen_status`, `kds_item_status`, `order_status_history` all move. Nothing is sent to OrderOut.

Consequences:
- The marketplace still shows the order as merely *confirmed*.
- The customer gets no "your order is ready" notification.
- No courier pickup signal fires.
- The merchant does the work twice — once on the POS, once on the provider tablet — and has stopped trusting the POS as the system of record for delivery.

The failure is **silent**. No error, no failed-sync toast, no DLQ row. The POS reports success because, locally, it *was* successful.

## Root cause

**Only the inbound half of the OrderOut order integration exists.** Orders flow in (`orderout-orders-webhook` → `process_online_order` → POS/KDS). There is no code path anywhere that sends a status change back out.

This is not a bug in a component — it is a **missing component** that surrounding code assumes exists:

`supabase/migrations/20260702130000_mark_online_order_ready.sql:90-91` —

```sql
-- Flip to ready. The OrderOut integration layer observes this transition and
-- relays mark-ready to the marketplace.
UPDATE public.orders
   SET status   = 'ready',
       ready_at = COALESCE(ready_at, v_now),
```

…and again in the same file's header (`:13-16`):

> *"Like accept/decline/cancel, this RPC does NOT itself call the OrderOut platform API. It sets `orders.status='ready'` (+ `ready_at`). The OrderOut integration layer relays mark-ready to the marketplace off the `orders.status='ready'` transition — the same status-transition signal it already uses."*

**That layer does not exist.** The RPC correctly delegates to a consumer that was never written, and the comment made the gap invisible to everyone downstream. `complete_online_order` (`supabase/migrations/20260702140000_complete_online_order.sql:75-77`) has the identical shape and the identical gap.

### Verified absences

| Claim | Evidence |
|---|---|
| No outbound status edge function | `supabase/functions/` contains `orderout-onboard`, `orderout-orders-webhook`, `orderout-menu-webhook`, `orderout-push-menu-webhook` — all inbound/menu/onboard. Confirmed same on staging + prod (per ticket). |
| No outbound relay trigger on `orders` | Staging trigger inventory (per ticket): `earn_loyalty_on_completion`, `enforce_order_math`, `orders_broadcast_trigger_deferred`, `track_order_status_changes`, `trg_drain_watcher_on_orders`, `trg_guard_suspension_on_orders`, `trg_kds_order_cancel`, `trg_orders_set_receipt_token`, `trigger_update_customer_metrics`, `update_orders_updated_at`, `void_loyalty_on_cancel` — none outbound. |
| `provider_status` is write-once | Only ever set at creation (`supabase/migrations/20260702120001_online_order_source_platform.sql:520`) and on inbound cancellation (`supabase/functions/orderout-orders-webhook/index.ts:382-386`). No ready/completed writer exists. |

### Already known, never actioned

`docs/features/online-ordering/orderout-integration-handoff.md:189-191` (written 2026-07-21) lists this as **known gap #1**:

> *"**No outbound accept/decline callback to OrderOut.** … (Biggest gap — needs the OrderOut accept/reject endpoint + a trigger, mirroring the inbound pattern.)"*
> *"**`online_orders.provider_status`** is only set at creation; not updated on status changes."*
> *"**No outbound retry / drift reconciliation** (inbound has a DLQ; outbound has nothing yet)."*

It was documented as a gap six days before a merchant escalated it. The handoff doc's framing was accept/decline; the ready/done path is the same missing layer and is what is actually hurting a live merchant.

## Why the fix belongs in the database, not the call sites

Multiple independent writer paths move an order to `ready`/`completed`: the online-orders RPCs (`mark_online_order_ready`, `complete_online_order`), KDS bump paths, `bulk_update_order_item_status_v2`, and expo/board actions. Patching each call site to POST to OrderOut is exactly the shape of mistake that produced this gap — one path gets wired, the rest silently don't, and the failure is invisible.

**Capture once, at the `orders` table.** A trigger + outbox queue is origin-agnostic: any writer, any client, any future path is covered for free. There is in-repo precedent — the 86/snooze propagation uses exactly this pattern (`notify_item_snooze_change*` → `pg_net` → resync), specifically so a 86 performed directly on the POS tablet still reaches OrderOut (`docs/features/online-ordering/orderout-integration-handoff.md:143`).

## Proposed fix — DB-captured outbox + relay worker

1. **Migration** — `orderout_status_relay_queue` table + `AFTER UPDATE OF status` trigger `trg_relay_orderout_status` on `orders`. Enqueues only when the new status is `ready`/`completed`, it actually changed, and a matching `online_orders` row with `provider='orderout'` exists. Unique on `(online_order_id, target_status)` so double-taps and recall→ready never double-send. Optional best-effort `pg_net` poke for latency (verify pg_net is enabled; the queue is the source of truth either way).
2. **New edge function `orderout-status-relay`** — claims a batch of ≤20 due rows via `FOR UPDATE SKIP LOCKED`, calls OrderOut's status endpoint, reusing the `orderOutRequest` client from `orderout-onboard` (`supabase/functions/orderout-onboard/index.ts:70-135` — `api-key` header, ×3 retries, 1s/2s/4s backoff, no 4xx retry except 429). Success → advance `online_orders.provider_status` + `status_updated_at`, mark row `sent`. Exhausted → `webhook_dead_letter_queue` with `source='orderout_status_relay'`, which the existing HQ replay tooling already handles (the table has `source`/`event_type`/`raw_payload` columns — `schema.sql:4513-4527` — so no schema change needed there).
3. **Fire-and-forget from the POS/KDS.** The staff action never blocks on, waits for, or errors from relay state. No synchronous HTTP inside the trigger.

Full DDL sketch, relay contract, and verification SQL live in the Notion ticket's *Deep implementation* toggle.

## Blocking dependency — Day 0 (RESOLVED 2026-07-27)

> ~~The OrderOut mark-ready / complete endpoint and payload are not documented internally.~~ **Superseded.** The endpoint *is* documented — see `orderout-docs/reference-index.md` (untracked, local-only) plus the live reference pages.

```
POST https://api.orderout.co/api/channel/order/{order_id}/mark-ready
  order_id  integer, required — "OrderOut order ID to mark ready"
  no request body
  202 Accepted (async) · 400 · 401 · 404
```

**The identifier was the real risk, and it is also resolved.** OrderOut's Accept/Reject reference (`PUT /api/pos/order/status`) states verbatim that its `order_id` is *"ID of the order you received in the `externalReferenceId` field"* — i.e. exactly `online_orders.external_reference`, which we have stored since March (populated on 42/42 staging rows, matching `raw_payload`). **No schema change, no backfill.**

**Verified end-to-end 2026-07-27.** Probed live against our own April Grubhub test order (`external_reference = 5408690874220544`) with a no-credentials control:

- no api-key → `401`
- with our existing `ORDEROUT_API_KEY` → **`202`** `{"success": true, "status": "mark_ready_dispatched", "delivery_service": "GRUBHUB"}`

So the POS key **is** authorized on `/api/channel/`, and `external_reference` **is** the identifier mark-ready expects — proven, not inferred. No separate credentials required.

> ⚠️ **A request body is mandatory despite the docs.** Mark-ready is documented as taking no body, but a POST without one returns `411 Length Required`, and `fetch()` sends no `Content-Length` when there is no body. Send `{}`. This would have failed 100% in production while passing code review.

Still to verify: `ORDEROUT_API_KEY` is present in both staging *and* prod edge function envs (currently consumed by `orderout-onboard` only).

## Open questions for implementer

1. ~~**Does OrderOut support a `completed` transition at all?**~~ **Answered: no.** POS Operations → Orders exposes exactly three operations — Cancel Marketplace Order, Mark Order Ready, Accept/Reject. There is no complete/picked-up endpoint. `completed` is excluded from the trigger filter rather than enqueued and failed forever.
2. **What exists on Abubeckr's branch?** Per the Jul 27 standup, Abubeckr stubbed partial foundation functions from the OrderOut docs earlier that day — **reported as not working**, and nothing matching is on any branch in this repo as of `4028c2bd`. Audit before assuming greenfield; reconcile against the "layer does not exist" root cause above (the stubs may encode endpoint guesses that the Day-0 confirmation will invalidate).
3. ~~**Payload identifiers.**~~ **Answered: `online_orders.external_reference`**, per OrderOut's own Accept/Reject docs. Note `provider_order_id` (the marketplace's `orderNumber`, e.g. `8SEtQhm-EfGtQ42RHRmttQ`) is *not* it — it's an opaque string, while mark-ready's path param is typed `<int:order_id>`.
4. **Backfill?** ~14 days of prod orders are stranded at `provider_status='confirmed'`, all long since physically completed. Replaying them would fire stale "order ready" notifications to customers whose food arrived days ago — **assume no backfill**, but confirm with product, and make sure the relay's first run doesn't sweep them up by scoping the trigger to new transitions only.

## Out of scope

- **POS-initiated cancellation writeback** — refund implications, separate ticket.
- **Accept/decline writeback** — the other half of handoff gap #1. Same pattern, not this ticket.
- **Non-OrderOut providers** — but keep the queue provider-agnostic in shape (`provider` column) so website/app can reuse it.

## Acceptance criteria

- [ ] `orders.status → 'ready'` on an OrderOut-linked order enqueues **exactly one** relay row; the staging mock receives one correctly-shaped call; ≤30s end-to-end via the poke path.
- [ ] `online_orders.provider_status` advances and `status_updated_at` is set; queue row → `sent`. **Note:** mark-ready answers `202 Accepted` and processes asynchronously, with no documented confirmation callback — so `provider_status` is best-known-state, not marketplace-confirmed. The queue row's `sent_at` is the honest record. Live validation (Charcoal, all three channels) is the only real proof the marketplace moved.
- [ ] OrderOut 5xx/timeout → backoff retries; after max attempts the row lands in `webhook_dead_letter_queue` (`source='orderout_status_relay'`) and is replayable via existing HQ tooling. No crash loops.
- [ ] The POS/KDS action is unaffected by relay failure — no block, no error toast, no changed latency.
- [ ] Repeat transitions (double-tap, recall → ready again) never double-send — enforced by the unique constraint, not by client discipline.
- [ ] Non-OrderOut orders (dine-in, website, QR) produce **zero** queue rows.
- [ ] No regressions in: inbound order webhook, KDS routing, provider-initiated cancellation.
- [ ] Companion ticket's staging matrix green **before** prod deploy.
- [ ] Live Charcoal Gardenia validation across all three channels; screen recording by a non-implementer.

## Verification

**Staging**, after marking a test OrderOut order ready:
```sql
SELECT state, attempts, last_error FROM orderout_status_relay_queue ORDER BY created_at DESC LIMIT 5;
SELECT provider_status, status_updated_at FROM online_orders WHERE order_id = '<id>';
-- Exclusion check: mark a dine-in order ready → expect zero queue rows
```

**Prod health post-deploy** (read-only — the shape that exposed the bug):
```sql
SELECT provider_status, count(*) FROM online_orders
WHERE provider='orderout' AND created_at > now() - interval '2 days' GROUP BY 1;
```
Pre-fix this returns a single `confirmed` bucket. Post-fix it must show `ready`/`completed` accumulating.

**Live E2E** (planned, per standup): Temur places a real ~$1 order on a delivery platform → Ali Awdi marks Done on the POS tables view → verify the platform status flips. Capture request/response logs + screen recording.

## Hard constraints

- All DDL via migration files in `supabase/migrations/`. Prod apply via SQL editor + `supabase migration repair --status applied`. **Never `db push` to prod.**
- New functions: `SECURITY DEFINER` with pinned `search_path` (project standard).
- Trigger stays cheap and non-blocking — no synchronous HTTP inside it; any `pg_net` poke is async and best-effort.
- Queue table is service-role only — no anon/authenticated RLS policies.
- No money logic touched; `NUMERIC(12,2)` convention untouched.

## Watch during E2E

Today's POS release changes the order card to show the **OrderOut platform ID** instead of the internal DB id (Abubeckr). Regression-check this while validating — it touches the same identifiers the relay payload will carry.

---

## Evidence index

| What | Where |
|---|---|
| Relay layer asserted but absent | `supabase/migrations/20260702130000_mark_online_order_ready.sql:13-16, 90-91` |
| Same gap on the Done path | `supabase/migrations/20260702140000_complete_online_order.sql:75-77` |
| `provider_status` written at creation only | `supabase/migrations/20260702120001_online_order_source_platform.sql:520` |
| `provider_status` written on inbound cancel only | `supabase/functions/orderout-orders-webhook/index.ts:382-386` |
| HTTP client to reuse | `supabase/functions/orderout-onboard/index.ts:70-135` |
| DLQ already has `source` / `event_type` | `schema.sql:4513-4527` |
| Gap documented 6 days pre-escalation | `docs/features/online-ordering/orderout-integration-handoff.md:189-191` |
| Origin-agnostic trigger precedent (86 path) | `docs/features/online-ordering/orderout-integration-handoff.md:143` |
| Prod stuck-state query + staging trigger inventory | Notion ticket, *Evidence (verified live, Jul 27 2026)* |
