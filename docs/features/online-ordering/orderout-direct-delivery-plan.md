# OrderOut Direct Delivery — Implementation Plan

> **Update 2026-09-25:** the per-job cron schedules named below (`orderout-status-relay-drain`, `orderout-delivery-dispatch-drain`, `orderout-delivery-dispatch-sweep`) are replaced by one job, `frequent-jobs`, which calls `public.run_frequent_jobs()` every minute and runs the same functions (the sweep at minutes ≡ 2 mod 5). Check it with `select jobname, schedule, active from cron.job where jobname = 'frequent-jobs';`. Migration: `supabase/migrations/20260925121000_connection_hardening.sql`.

**Ticket:** [WEB-FEAT · OrderOut Direct Delivery on the online ordering website](https://app.notion.com/p/WEB-FEAT-OrderOut-Direct-Delivery-on-the-online-ordering-website-checkout-quotes-dispatch-on-acce-3de8280c1b1d81e495c4f1451ba40990)
**Owner:** Ali Awdi · **Polish:** Haidar Saleh · **OrderOut liaison:** Temur
**Anchors verified against:** working tree at `84674561` (2026-09-19) — every `file:line` below was re-checked, not copied from the ticket
**Plan written:** 2026-09-19 · **Status:** code-complete on `feat/orderout-direct-delivery` (uncommitted, 2026-09-20); migrations verified on a scratch Postgres, NOT applied to staging; Step 0 push/status questions still open

---

## 0. What I verified before writing this

The ticket is accurate on every code anchor it cites. Facts established beyond the ticket (repo read + public OrderOut docs):

| Question | Answer | Source |
|---|---|---|
| Quote endpoint contract | `POST https://api.orderout.co/v2/delivery/quotes`, header `api-key`. Body: `restaurant_id` (int64), `dropoff_street/city/state/zip/country` (all required), `dropoff_suite`, `dropoff_instructions`, `pickup_minutes` (default 10). Returns an **array** of `{id, provider, price, unit?, pickup_mins_from_now, delivery_mins_from_now}` | [developers.orderout.co/reference/delivery-get-quotes](https://developers.orderout.co/reference/delivery-get-quotes) |
| ⚠ Doc inconsistency | Schema says `restaurant_id`; the example body says `merchant_id: 5208499903266816`. **New Step 0 question (#8).** | same page |
| `price` / `unit` | `price` integer, `unit` is `"cent"` or `"dollar"`, example omits `unit` entirely | same page — confirms ticket Q7 |
| Push endpoint | `POST /api/channel/order/push`, response documented as `{}` for both 200 and 400 | [push-order-from-channel-to-orderout](https://developers.orderout.co/reference/push-order-from-channel-to-orderout) |
| Push payload shape | `{destination:{storeId}, payload:{customer:{…}, order:{orderType:'DELIVERY', ready_by, thirdPartyManagedDelivery:true, subtotal, tax, deliveryFee, driverTip, staffTip, total, payment:{status:'PAID', mode:'CREDIT_CARD'}, delivery:{quote_id}, items:[{id, name, price, quantity, total, note, modifiers:[…]}], orderNotes}}, source:{orderNumber, placedOn, additionalInfo}}` — **money in dollars** | [order-payload-example](https://developers.orderout.co/docs/order-payload-example) |
| Cancel endpoint | `POST /v2/delivery/orders/{order_id}/cancel`, body `{reason}` required, 200 → `{id, fd_id, tracker_id, status}`, 404 on unknown | [cancel-order](https://developers.orderout.co/reference/cancel-order) |
| Delivery statuses | `pending_assign, pending_merchant, scheduled, runner_assigned, en_route_pickup, arrived_pickup, picked_up, en_route_dropoff, arrived_dropoff, completed, cancelled` — **no registration endpoint and no payload example anywhere in the public docs** | [delivery-api-webhook-statuses](https://developers.orderout.co/docs/delivery-api-webhook-statuses) — confirms ticket Q5 is a real gap |
| **`destination.storeId` origin (ticket Q3)** | Almost certainly answered: `POST /api/pos/restaurant/{restaurant_id}/connect_channel` with `{channel_type:"ONLINE_ORDERING", store_id:"<we choose>"}` registers a channel store on a restaurant. `storeId` in the push is the id **we** register. This is an onboarding prerequisite the ticket does not mention. | [connect-channel](https://developers.orderout.co/reference/connect-channel) |
| Delivery order id after push (ticket Q1) | Push returns `{}`. The echo that hits `orderout-orders-webhook` carries `source.externalReferenceId`, which is OrderOut's order id (the relay already uses it for `/channel/order/{id}/mark-ready`). Likely the same id the cancel endpoint wants — **must confirm in sandbox** | `orderout-orders-webhook/index.ts:272`, relay handover doc |
| Existing OrderOut client | Three byte-identical inline `orderOutRequest` copies, all hard-coded to `https://api.orderout.co/api` (`orderout-onboard/index.ts:8`, `orderout-menu-webhook/index.ts:8`, `orderout-status-relay/index.ts:28`). `/v2/delivery/*` needs the bare host | repo |
| Outbox precedent | `20260727121000_orderout_status_relay_queue.sql`: trigger → queue row → `poke` via `pg_net` (URL + secret from Vault) → cron floor every minute → `claim_*` (`FOR UPDATE SKIP LOCKED`, backoff baked into `next_attempt_at` at claim time, no `claimed` state) → `complete_*` (DLQ on terminal) | repo |
| Accept signal | `accept_online_order` moves `orders.status` `pending → sent_to_kitchen` and stamps `orders.accepted_at` (`20260713120006:54-59`). `accepted_at` is the universal "accepted" signal for auto and manual accept | repo |
| Cancel statuses | `order_status` enum: `cancelled`, `declined`, `void`, `refunded` are the four terminal-negative values. Writers: `cancel-online-order` edge fn (customer + system expiry → `cancelled`/`void`), `decline_online_order` RPC (`declined`), `cancel_online_order` RPC (POS, `cancelled`), `void_order` RPC (`void`), dashboard `RefundOrder` (`refunded`) | repo |
| Tip today | One tip concept: `body.tip` → `p_gratuity` → `orders.tip_amount` and Valor `tipMinor` (`create-online-order/index.ts:828,1138,1186`). No driver-tip field exists | repo |
| Delivery fee persistence | `p_delivery_charge` is only folded into `p_total`; **no `orders` column holds the delivery fee** (`20260829120000…:198-201`). The dispatch row must carry `charged_fee` — nothing else will | repo |
| Storefront request path | `CheckoutPage.tsx:519-549` calls the edge function **directly from the browser** with the anon key; `app/sites/order-actions.ts` `placeOrder` is dead code | repo |
| Storefront site config | `mapStoreConfigToSite` (`app/sites/actions.ts:63-129`) is a pure mapper over `online_store_config`; `getStorefrontData`/`getStorefrontMetaData` already load `locations` (with `merchant_id`) right after it (`:164-170`, `:224-230`) — the natural place to resolve fulfilment | repo |
| Tracking page | `getOrderTracking` (`order-actions.ts:352-448`) reads `orders` only, no `online_orders` join, no delivery fields. `OrderTrackingPage.tsx:166` has a 5-step pickup strip with no delivery branch. `OrderStatusWatcher.tsx:77-91` **drops any status not in `DECISION_MESSAGES`** — a new event name is mandatory | repo |
| Merchant bell | `app_notifications` (`20260824120000:48-66`), inserted directly with service role (`lib/notifications/app-notifications.ts:21-49`; Deno precedent `_shared/subscription-failure-notifications.ts:188`). No SQL RPC creator exists | repo |
| Entitlement | `get_subscription_entitlement(p_merchant_id, p_location_id, p_service_code)` RPC, server template `getQrBillingGateStatus` (`app/dashboard/online-ordering/actions.ts:393-435`) | repo |
| Dashboard delivery UI | `DELIVERY_TEMPORARILY_DISABLED = true` at `app/dashboard/online-ordering/page.tsx:61-67` mirrors the storefront kill switch | repo |

### Pre-existing defects on this path (must fix or this feature crashes on them)

1. **`cancel-online-order/index.ts:213,311`** references `session` outside its `if (!isSystemCall)` block (`:71-86`). System-expiry cancels of card-paid orders throw before reversal. Every Direct delivery order is card-paid, and expiry is a first-class cancel path in the AC → **fix in Phase 1**.
2. `app/dashboard/actions/order.ts:613` writes `status: "voided"` (not an enum member). Not on our path; log a separate ticket.
3. `create-online-order` has **no post-charge rollback**: if `process_online_order` fails after Valor captured, the charge stands (`:1320-1379`). Out of scope, but every delivery order raises the stakes. Log a separate ticket; do not fold in.

---

## 1. Design decisions (deviations from the ticket are marked ▲)

**D1 — Fulfilment is a per-store column, gated three ways at read time.**
`online_store_config.delivery_fulfillment text NOT NULL DEFAULT 'self' CHECK IN ('self','orderout_direct')`. The storefront computes `deliveryEnabled = accepts_delivery AND delivery_fulfillment='orderout_direct' AND orderout_restaurants.status='active' AND entitlement.entitled`. `self` never turns delivery on (AC 1). The dashboard also refuses to *save* `orderout_direct` without an active restaurant + entitlement, so the read-time gate is belt-and-braces for lapsed entitlements.

**D2 — Quote lives server-side; the browser gets an opaque id.**
`orderout-delivery-quote` stores every quote, marks the cheapest `is_selected`, returns `{quote_id (ours), fee, eta_minutes, expires_at}`. Rate limit: max 12 quote calls per session per 10 minutes (counted from the table). No provider picker.

**D3 — Dispatch is an outbox row; the trigger never does network I/O.** Copies the relay pattern exactly: `orderout_delivery_dispatches` + `poke_orderout_delivery_dispatch()` (Vault URL `orderout_delivery_dispatch_url`, shared `internal_notification_secret`) + cron `orderout-delivery-dispatch-drain` every minute + `claim_orderout_delivery_dispatch(p_limit)` / `complete_orderout_delivery_dispatch(...)`.
▲ **No `claimed` state.** The relay's visibility-timeout trick (bump `next_attempt_at` at claim time, `FOR UPDATE SKIP LOCKED`) needs no reaper. State set: `awaiting_accept, pending, dispatched, failed, cancel_pending, cancelled`.

**D4 — Push idempotency has two layers.** (a) `UNIQUE (order_id)` on the dispatch row + `ON CONFLICT DO NOTHING` on insert. (b) ▲ Before every *retry* of a push the worker checks `oo_delivery_order_id IS NOT NULL OR echo_received_at IS NOT NULL`; if the echo already linked the order (a timed-out push that actually succeeded), it marks `dispatched` instead of pushing again. This is the only defence against a network timeout creating two couriers.

**D5 — Echo guard matches on the dispatch table, not on heuristics.** ▲ We store `request_payload` on the dispatch row *before* the HTTP call, and `source.orderNumber` in the push is `orders.order_number`. In `orderout-orders-webhook`, before step 7 (`:501`): look up `orderout_delivery_dispatches WHERE oo_order_number = body.source.orderNumber`. Hit → set `online_orders.external_reference = source.externalReferenceId`, `dispatch.echo_received_at = now()`, `dispatch.oo_channel_order_id = externalReferenceId` (fallback delivery id), return 200 `linked`. Works even if the echo lands before the push response (row already exists). The webhook's `event='cancelled'` branch gets the same guard: an echo-cancel of our own order marks the dispatch `failed` with `last_error='courier_cancelled'` rather than touching `orders` again.

**D6 — Status intake is source-agnostic.** One RPC `apply_orderout_delivery_status(p_dispatch_id, p_status, p_courier jsonb, p_eta, p_tracking_url, p_raw)` enforces monotonic `delivery_status_rank`, mirrors to `online_orders.delivery_driver/delivery_tracking/estimated_delivery`, writes `order_status_history` (notes only — `orders.status` is not changed by courier events), and returns whether the rank advanced. Callers: `orderout-delivery-webhook` (if OrderOut has a webhook) **or** a poll branch inside the dispatch worker (if not). Step 0 decides which caller ships; the RPC and the storefront do not care.

**D7 — Money.** `price` normalised with `unit`; **missing `unit` is an error until Step 0 answers** (constant `ORDEROUT_QUOTE_DEFAULT_UNIT` is a single-line change later). Stored `NUMERIC(12,2)` via `TRUNC(x,2)`. All OrderOut int64 ids stored as `text`, serialised back as raw JSON integers via a `BigInt`-safe replacer.

**D8 — Tip.** Under Direct, checkout label reads **Driver tip**; the amount still flows through `body.tip → p_gratuity → orders.tip_amount` (it is charged to the card and must reconcile), and the push sends `driverTip = tip, staffTip = 0`. The dispatch row records `driver_tip` so reports can separate it later. ▲ Flag for Temur: `orders.tip_amount` on Direct orders will look like staff gratuity in today's reports.

**D9 — Re-quote at accept never re-charges.** If the selected quote expired while waiting for the merchant, the worker re-quotes with the stored dropoff; dispatches regardless; stores `requote_delta = new_price − charged_fee`; alerts the merchant (bell) when `delta > 1.00`.

**D10 — Scheduled delivery is rejected server-side.** `create-online-order` returns 422 `scheduled_delivery_not_supported` when `requested_time IS NOT NULL` under Direct. The client already always sends `null` (`CheckoutPage.tsx:490`).

**D11 — Mark Ready relay (ticket Q6).** The relay trigger's predicate is `oo.provider='orderout'` (`20260727121000:134-135`). If Step 0 says Direct needs a ready signal, extend it to `OR (oo.provider='website' AND EXISTS (dispatch dispatched))` and relay against `dispatch.oo_channel_order_id`. Built as a conditional item in Phase 4.

---

## 2. Step 0 — spike (½ day, needs sandbox + key scope from Temur)

Post results as a comment on the ticket. Nothing in Phase 2+ ships until every row is answered.

| # | Question | How to answer | Plan impact if "no"/unexpected |
|---|---|---|---|
| 1 | What does `POST /api/channel/order/push` actually return? Is there an order id in it? | Push a test order against the sandbox restaurant, capture raw body + headers | If truly `{}`: rely on D5 echo capture for the id; cancel becomes impossible until the echo arrives (usually seconds) |
| 2 | Quote lifetime | Fetch quotes, push with the same `quote_id` at +2, +5, +10, +30 min | Sets `expires_at`; default assumption 5 min until measured |
| 3 | `destination.storeId` = the `store_id` we pass to `connect_channel`? Does `connect_channel` need to be called once per restaurant? | Call `connect_channel` with `store_id = pos_uuid`, then push with `storeId = pos_uuid` | If a different id is issued, store it on `orderout_restaurants.channel_store_id` |
| 4 | Does the echo hit `orderout-orders-webhook`? Exact `source.orderNumber`, `source.externalReferenceId`, `source.ods.name`, `destination.restaurantId`, and items' `external_id` on it | Push, watch webhook logs / DLQ | Guard key changes; D5 assumes `orderNumber` round-trips verbatim |
| 5 | Delivery status delivery mechanism: webhook registration endpoint? Payload (courier name/phone, tracking URL, ETA, coordinates)? Or a status GET endpoint (`List Orders`?) | Ask OrderOut; try `GET /v2/delivery/orders/{id}` and `/api/pos/orders` | Webhook → build `orderout-delivery-webhook`. Poll endpoint → poll branch in worker. **Neither** → tracking page shows Dispatched + tracking link only, and AC "stepper moves through four states" is re-scoped with Temur |
| 6 | Is Mark Ready required for a Direct order, or is `pickup_minutes`/`ready_by` the whole contract? | Push, do not mark ready, observe whether a runner is assigned | D11 |
| 7 | Missing `unit` on a quote means cents or dollars? | Compare a quote to the same route on the OrderOut dashboard | D7 constant |
| 8 ▲ | Quote body key: `restaurant_id` (schema) or `merchant_id` (example)? Which of our ids (`oo_restaurant_id`?) | Try both | Field name in the client |
| 9 ▲ | Does OrderOut dedupe a second push with the same `source.orderNumber`? | Push twice | If no: D4(b) is the only protection — keep it strict |
| 10 ▲ | Does the cancel endpoint's `{order_id}` equal the echo's `externalReferenceId`? | Cancel using that id | If no: we need the id from Q1 or Q5 |
| 11 ▲ | Is `ORDEROUT_API_KEY` scoped for `/v2/delivery/*` and `/api/channel/*`? (relay plan already saw a 401 on `/api/order/<id>` with the same key) | 401 vs 200 on a quotes call | Temur obtains a second key → new env var `ORDEROUT_DELIVERY_API_KEY` |

### 2a. Step 0 results — 2026-09-20 (read-only half, live API + staging DB)

"Sandbox" per Temur = the live OrderOut API against the **Joes Coffee Shop** staging merchant (`2add44cb-…`). Its three `orderout_restaurants` rows are all `active`; only **Brooklyn** (`oo_restaurant_id 6487684134600704`, `pos_uuid 657a703d-…`, `oo_account_id 4598357012119552`) has a plausible address. Temur's env values are byte-identical to `.env` (verified without printing).

| # | Result | Evidence |
|---|---|---|
| 11 Key scope | **`/v2/delivery/quotes` accepts the shared key** (400 validation error, not 401). `/api/channel/*` untested (needs a push). `/api/order/{id}` still 401 — not ours. `/api/pos/restaurants` (list) is 404 HTML; `/api/pos/restaurant/{id}` (single) works | curl |
| 8 Field name | `restaurant_id` is what the API resolves: Brooklyn id → passes to the next validation; Tempe id → `404 Merchant not found`. Sending `merchant_id` behaves identically to `restaurant_id` (both hit the same next error), so the server likely accepts either; **use `restaurant_id`**. Empty body → `Missing 'dropoff_street', 'dropoff_city', 'dropoff_state', 'dropoff_zip', 'dropoff_country'` — the five dropoff fields are the only hard-required ones | curl |
| ▲ **New blocker** | Every quote attempt returns `400 {"reason": "Invalid 'phone_number'"}`. It is **not a request field** (tried `phone_number`, `dropoff_phone`, `dropoff_phone_number`, `customer_phone`, with/without `+`). It is the **restaurant's own record on OrderOut**: `GET /api/pos/restaurant/6487684134600704` shows `"phone_number": ""`. Quotes need the pickup restaurant to have a phone. Fix = `PUT /api/pos/restaurant/{id}` with `phone_number` (Update Restaurant supports it) | curl |
| ▲ Restaurant data quality | Same record has `city: "New York City", zipcode: "23123"` (a Virginia zip), `connected_delivery_services: []`, `delivery_services_status: null`, `preparation_time: 900` s. Any Direct quote from this restaurant will be geocoded to the wrong place until the address is corrected on OrderOut. **`orderout-onboard` does not send `phone_number`** to OrderOut today — real merchants will hit the same 400 unless onboarding is fixed (add to Phase 1) | curl, `orderout-onboard/index.ts:223-240` |
| 3 storeId | `connect_channel` not attempted (write). Tempe id resolving as "Merchant not found" under this key while our DB says `active` also means restaurant→key visibility must be checked per location in the quote fn (`404` → treat as `available:false`) | — |
| ▲ **Echo target is production** | `GET /api/webhooks/push_order` → exactly **one** registration, platform-wide: `https://hifouuofcaytijrkbvcy.supabase.co/functions/v1/orderout-orders-webhook` (**prod**). Same for `push_menu`. The key is shared between prod and staging, so **any order pushed from staging echoes into prod's webhook**. Consequences: (a) the echo guard cannot be exercised end-to-end on staging without a second OrderOut integrator key/registration for staging, or a temporary re-point (would break prod inbound orders); (b) a staging push whose `pos_uuid` also exists on prod could create a **real prod order**. Checking prod for id collisions was blocked by permissions — Temur/Abubeckr to confirm before any push | curl |
| 5 Status intake | No delivery-status route exists: `/api/webhooks/delivery`, `/api/webhooks/delivery_status`, `/v2/delivery/webhooks`, `/v2/webhooks`, `/v2/delivery/orders`, `/v2/delivery/orders/{id}` all 404. `List Orders` (`/api/pos/order/?service_merchant_id=`) keys on a *service* merchant id (marketplace store id), not our restaurant id → not a poll source. **Only OrderOut support can answer this** | curl |
| 1, 2, 4, 6, 7, 9, 10 | Require a push → **not run** (write to a live system; see blockers below) | — |

**Update 2026-09-20 00:37 — restaurant fixed (with user's go), quotes are live.** `PUT /api/pos/restaurant/6487684134600704 {phone_number:"3476591866", city:"Brooklyn", zipcode:"11217", state:"NY"}` → 200. Original record kept at scratchpad `spike/rest_ORIGINAL_6487684134600704.json` (`phone_number:""`, `city:"New York City"`, `zipcode:"23123"`, `state:"New York"`) for revert.

| # | Answer | Evidence |
|---|---|---|
| 7 `unit` | **Present on every quote, value `"cent"`**; `price` is an integer of cents (`519` = $5.19). Missing `unit` was a doc artefact; still guard for it (D7) but default to cents is now defensible | 4 successful quote calls |
| Quote shape | `200` → JSON **array** of `{id (int64, e.g. 4656104002945024), provider, price, unit, pickup_mins_from_now, delivery_mins_from_now}`. Providers seen: `uber`, `motoclick`, `grubhub`; error bodies also reveal `doordash`, `justeat`, `relay` are polled. Brooklyn→1 Hanson Pl: uber $5.19/75 min, motoclick $5.99/28 min, grubhub $9.49/43 min. **Cheapest ≠ fastest** (uber cheapest, motoclick 47 min faster) — D2's "cheapest" rule stands but the UI copy must show the ETA of the *selected* quote, not the best ETA | `spike/quote_ok.json` |
| No-coverage shape | **`400` with a JSON array of `{provider, message}`** — not an empty array. e.g. uber: `"outside the delivery radius … (Max Radius: 10.00 miles, Calculated Distance: 2460.42 miles)"`, doordash: `"Dropoff address not within service area"`. Garbage address → same 400 shape with geocode failures. The quote fn must map 400-with-array → `available:false` and surface a generic message (provider messages leak partner ids — never show raw) | `spike/oor.json`, `spike/bad.json` |
| Partial coverage | Manhattan (5 mi) → `200` with a **single** quote (uber $7.89, 99 min). Array length 1..n is normal | `spike/far.json` |
| `pickup_minutes` | Optional; omitting it still quotes. ETAs drift a few minutes between identical calls (67 vs 75 min) — quotes are live, not cached | `spike/nopick.json` |
| 11 Key scope | `/v2/delivery/quotes` **fully works** with the shared key. `/api/channel/order/push` and `/v2/delivery/orders/{id}/cancel` still unproven (need a push) | — |
| Quote lifetime (Q2) | Still unknown — needs a push at +N minutes | — |

**Update 2026-09-20 12:36 — push attempted with the user's explicit authorisation. No courier was booked.**

| # | Answer | Evidence |
|---|---|---|
| 3 storeId | **Confirmed:** `destination.storeId` is a channel store id, registered with `POST /api/pos/restaurant/{id}/connect_channel {channel_type:"ONLINE_ORDERING", store_id}`. Before registration the push fails `400 "Store not found: no delivery service matches the provided store ID."` After registration the restaurant shows `connected_delivery_services: ["PALOMA_ORDERING"]` (OrderOut's internal name for the online-ordering channel — expect it as `deliveryCompany.name` on the echo) and `delivery_services_status: "NOT_ACCEPTING_ORDERS"` (was `null`; no documented disconnect endpoint) | `spike/connect.json`, restaurant GET before/after |
| 11 Key scope | **Push is blocked by key type.** With `store_id = pos_uuid` registered, `/api/channel/order/push` still returns the same 400 for every `destination` shape tried (`storeId` = pos_uuid / oo_restaurant_id / pointOfSaleId / account id / "PALOMA_ORDERING"; plus `restaurantId`, `externalRestaurantId`, `channel_uuid` companions). Only `store_id` (snake) changes the error, to "destination must include a non-empty 'storeId'" — so the payload shape is right and the lookup is failing. Reading: the push resolves the store under the **channel integrator identified by the api-key**; ours is a **POS integrator** key (Update Restaurant doc: *"Must use a POS type api-key"*; Integrator Management lists types POS / CHANNEL / DELIVERY). **Dexa needs a CHANNEL-type api-key from OrderOut** (or OrderOut must bind the PALOMA_ORDERING store to our POS integrator). This is the single hard blocker for dispatch | `spike/push_test_1.log`, `push_test_2.log`, `push_variants.ts` output |
| 1, 2, 4, 6, 9, 10 | Still unanswerable until a push succeeds | — |

Code impact: none yet. `_shared/orderout.ts` already takes an `apiKey` override per call, so a channel key becomes `ORDEROUT_CHANNEL_API_KEY` read by `pushChannelOrder` only — a five-line change once it exists. (Quotes and cancel stay on the POS key unless OrderOut says otherwise.)

**Blocked, in order of dependency:**
0. **CHANNEL-type api-key for Dexa's online-ordering channel** (Temur → OrderOut). Until then `/api/channel/order/push` cannot book anything. Ask at the same time whether Direct deliveries should be pushed under the channel key and cancelled under the POS key, or both under one.
1. ~~Restaurant phone/zip~~ — done.
2. A push + immediate cancel (answers Q1, Q2, Q4, Q6, Q9, Q10) — may dispatch a real courier to 123 Main St Brooklyn and bill account `5546155819794432`; the echo will hit the **prod** `orderout-orders-webhook` (single platform-wide registration). Needs Temur's OK; ideally OrderOut confirms a test flag. Team decision 2026-09-20: this shared account *is* the staging account — no second integrator key.
3. Email to OrderOut support: delivery-status webhook registration + payload; quote lifetime.
4. `orderout-onboard` must start sending `phone_number` (and a validated zip) or every newly onboarded merchant is un-quotable — Phase 1 item.

---

## 3. Data model

```sql
-- online_store_config
ALTER TABLE public.online_store_config
  ADD COLUMN delivery_fulfillment text NOT NULL DEFAULT 'self'
  CHECK (delivery_fulfillment IN ('self','orderout_direct'));

-- orderout_restaurants (only if Step 0 Q3 says the channel id differs from pos_uuid)
ALTER TABLE public.orderout_restaurants ADD COLUMN channel_store_id text;
ALTER TABLE public.orderout_restaurants ADD COLUMN channel_connected_at timestamptz;

CREATE TABLE public.orderout_delivery_quotes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id      uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  store_config_id  uuid NOT NULL REFERENCES public.online_store_config(id) ON DELETE CASCADE,
  session_id       uuid REFERENCES public.online_order_sessions(id) ON DELETE SET NULL,
  request_key      text NOT NULL,          -- sha256(session_id + normalised dropoff): one quote batch per address
  oo_quote_id      text NOT NULL,
  provider         text NOT NULL,
  price            numeric(12,2) NOT NULL, -- dollars, TRUNC 2
  raw_price        integer NOT NULL,
  raw_unit         text,
  pickup_mins      integer,
  delivery_mins    integer,
  dropoff          jsonb NOT NULL,         -- {street, unit, city, state, zip, country, instructions}
  is_selected      boolean NOT NULL DEFAULT false,
  fetched_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  raw_response     jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_oo_quotes_session ON public.orderout_delivery_quotes (session_id, fetched_at DESC);
CREATE UNIQUE INDEX idx_oo_quotes_selected_per_batch
  ON public.orderout_delivery_quotes (request_key) WHERE is_selected;

CREATE TABLE public.orderout_delivery_dispatches (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  online_order_id       uuid REFERENCES public.online_orders(id) ON DELETE SET NULL,
  location_id           uuid NOT NULL REFERENCES public.locations(id),
  merchant_id           uuid NOT NULL REFERENCES public.merchants(id),
  quote_id              uuid NOT NULL REFERENCES public.orderout_delivery_quotes(id),
  charged_fee           numeric(12,2) NOT NULL,
  driver_tip            numeric(12,2) NOT NULL DEFAULT 0,
  requote_delta         numeric(12,2),
  oo_order_number       text NOT NULL,      -- what we send as source.orderNumber (= orders.order_number)
  oo_channel_order_id   text,               -- echo externalReferenceId
  oo_delivery_order_id  text,               -- id the cancel endpoint wants (Step 0 Q1/Q10)
  tracker_id            text,
  fd_id                 text,
  state text NOT NULL DEFAULT 'awaiting_accept'
    CHECK (state IN ('awaiting_accept','pending','dispatched','failed','cancel_pending','cancelled')),
  delivery_status       text,
  delivery_status_rank  integer NOT NULL DEFAULT 0,
  courier_name          text,
  courier_phone         text,
  tracking_url          text,
  eta                   timestamptz,
  attempts              integer NOT NULL DEFAULT 0,
  max_attempts          integer NOT NULL DEFAULT 6,
  next_attempt_at       timestamptz NOT NULL DEFAULT now(),
  last_error            text,
  last_status_code      integer,
  request_payload       jsonb,
  response_payload      jsonb,
  echo_received_at      timestamptz,
  dispatched_at         timestamptz,
  cancel_reason         text,
  cancelled_at          timestamptz,
  failed_at             timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_oo_dispatch_due ON public.orderout_delivery_dispatches (next_attempt_at)
  WHERE state IN ('pending','cancel_pending');
CREATE INDEX idx_oo_dispatch_order_number ON public.orderout_delivery_dispatches (oo_order_number);
CREATE INDEX idx_oo_dispatch_active ON public.orderout_delivery_dispatches (location_id)
  WHERE state = 'dispatched';
```

RLS: enabled on both; **no policies** (service-role only — project convention for outbox tables, relay handover §RLS). Merchant read for the dashboard goes through server actions with the service role scoped by `merchant_id`. Tracking page reads through `getOrderTracking` (service role). `update_updated_at_column()` trigger on both. Not added to the realtime publication (broadcast only).

Rank table for D6: `pending_assign 1, pending_merchant 1, scheduled 1, runner_assigned 2, en_route_pickup 3, arrived_pickup 4, picked_up 5, en_route_dropoff 6, arrived_dropoff 7, completed 8, cancelled 99 (terminal, sets state=failed unless already cancelled)`. Storefront stepper collapses to: Driver assigned (≥2) → Picked up (≥5) → On the way (≥6) → Delivered (8).

### State machine

```
insert ──► awaiting_accept ──(orders.accepted_at set)──► pending ──(push 2xx)──► dispatched ──(cancel)──► cancel_pending ──► cancelled
                 │                                        │  ├─(4xx / 429 at max)──► failed                 └─(reject e.g. picked up)──► dispatched + merchant alert
                 │                                        │  └─(5xx / timeout / network)──► push_unconfirmed ──(echo or status event)──► dispatched
                 └──(order cancelled/declined before accept)──► cancelled   (no OrderOut call)
cancelled ──(late push 2xx / echo: the cancel raced the push)──► cancel_pending
```

Revised after the 2026-09-20 adversarial review (see plan §4b): the push is **not idempotent**, so it is
never retried after an ambiguous result; every transition in `complete_*` / `link_*` / `apply_*` is
conditional on the row's current state; the claim holds a 5-minute lease separate from the backoff.

Triggers on `orders` (AFTER UPDATE, exception-guarded like the relay, nested BEGIN for the poke):
- `trg_oo_dispatch_on_accept` — `OF accepted_at WHEN (OLD.accepted_at IS NULL AND NEW.accepted_at IS NOT NULL)` → `awaiting_accept → pending`, poke.
- `trg_oo_dispatch_on_cancel` — `OF status WHEN (NEW.status IN ('cancelled','declined','void','refunded') AND OLD.status IS DISTINCT FROM NEW.status)` → `awaiting_accept|pending → cancelled` (no call); `dispatched → cancel_pending` (poke); `failed|cancelled` untouched. `cancel_reason` = COALESCE(`NEW.cancellation_reason`, `NEW.declined_reason`, `NEW.void_reason`, 'Order ' || NEW.status).

---

## 4. Build phases (checkable)

Each phase ends with its own verification. Branch: `feat/orderout-direct-delivery` off `aliawdi-dev`. Migrations numbered `20260920…` onward (latest on disk is `20260917140000`). Every migration gets a `rollback/` twin.

### Phase 0 — Spike
- [x] Sandbox restaurant + key scope confirmed (Temur) — shared key on Joes Coffee Shop; key works on `/v2/delivery/quotes`
- [ ] `connect_channel` called for the sandbox restaurant; `storeId` semantics captured (needs Temur's OK — write to OrderOut)
- [ ] Table in §2 fully answered and posted on the ticket — read-only half done (§2a); push-dependent rows open
- [ ] Decide: webhook vs poll for status intake; record in this doc under §1 D6

### Phase 1 — Foundations (no user-visible change)
- [x] Fix `cancel-online-order` `session` scoping (`:71-86` vs `:213,311`) — hoist `storeConfigId` resolution above the branch; unit-test the system-call path
- [x] `supabase/functions/_shared/orderout.ts` (+ `_shared/orderout-direct.ts` eligibility/quote persistence, `_shared/orderout-dispatch-notify.ts` bell + broadcast): `orderOutRequest(method, path, body, {key?})` taking the **host** `https://api.orderout.co`; typed `getDeliveryQuotes`, `pushChannelOrder`, `cancelDeliveryOrder`; BigInt-safe JSON; `isTerminalStatus()` identical to the relay's set (`400,401,403,404,411,422`); `try/catch + logError` on every call. Existing three copies untouched (out of scope)
- [x] Migration A (`20260920120000_orderout_direct_delivery_schema.sql`): `delivery_fulfillment` column + `orderout_restaurants.channel_store_id` (if needed) + both tables + RLS + `updated_at` triggers
- [x] Migration B (`20260920121000_orderout_direct_delivery_outbox.sql`): `poke_orderout_delivery_dispatch()`, `claim_orderout_delivery_dispatch(p_limit)`, `complete_orderout_delivery_dispatch(p_id, p_ok, p_status_code, p_error, p_terminal, p_result jsonb)`, `apply_orderout_delivery_status(...)`, accept + cancel triggers, cron `orderout-delivery-dispatch-drain`. All `SECURITY DEFINER SET search_path = public, pg_temp`; `REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO service_role`. DLQ `source='orderout_delivery_dispatch'`
- [x] Migration C: `process_online_order` **unchanged** (hard constraint) — confirm no signature drift needed; the dispatch insert is done by the edge fn after the RPC
- [ ] Vault: `orderout_delivery_dispatch_url` (deploy-time step) per env (documented in migration header, created manually **after** the function is deployed — relay handover deploy-order gotcha)
- **Verified 2026-09-20** on a scratch `supabase/postgres:15.8.1.085` container with stub tables (`scratchpad/spike/pg/`): both migrations + both rollbacks apply clean; 14-scenario behavioural script passed — CHECK/UNIQUE constraints, accept→pending, decline-before-accept→cancelled with no claim, claim backoff + visibility timeout, complete→dispatched with id capture, monotonic status intake (forward/dup/stale/bogus) + `online_orders` mirror, cancel→cancel_pending→cancelled, retry→failed at max→DLQ row, sweep recovery (idempotent, honours `accepted_at`), cancel_rejected→dispatched, courier-cancel→failed, both cron jobs registered, poke no-op without Vault. Also added: `orderout-onboard` now PUTs `phone_number` onto the OrderOut restaurant after onboarding (bug found in Step 0)

### Phase 2 — Quote (edge fn + storefront wiring)
- [x] `supabase/functions/orderout-delivery-quote/index.ts` (`verify_jwt=false`, CORS like `create-online-order`): body `{store_config_id, session_token, dropoff:{street, unit?, city, state, zip, instructions?}}` → validate store `delivery_fulfillment='orderout_direct'` + restaurant active; rate limit; `pickup_minutes = orderout_restaurants.prep_time_minutes ?? online_store_config.estimated_prep_minutes`; call quotes with `dropoff_country:'USA'`; **empty array or 4xx → 200 `{available:false, reason}`**; store all rows under one `request_key`, select cheapest (tie → shortest `delivery_mins`); return `{available:true, quote_id, fee, eta_minutes, expires_at, provider}` (provider for logging only, not rendered)
- [ ] `app/sites/actions.ts`: new `resolveDeliveryFulfillment(config, location)` called from `getStorefrontData` (`:160`) and `getStorefrontMetaData` (`:222`); `OnlineOrderingConfig` gains `deliveryFulfillment: 'self'|'orderout_direct'`; `deliveryEnabled` computed per D1 (remove the TEMP block `:84-89`)
- [x] `types/site.ts`: add `deliveryFulfillment`
- [x] `CheckoutPage.tsx`: new `deliveryQuote` state (saved addresses are quoted too; ▲ expired-at-submit does NOT auto-resubmit — the customer sees the new fee and places the order again, because the Valor token's reuse semantics are unverified) `{status:'idle'|'loading'|'ready'|'expired'|'unavailable', quoteId, fee, eta, expiresAt}`; replace the debounced `checkDeliveryZone` call (`:342-380`) with a quote call under Direct (keep zone check for `self`); `deliveryFee` (`:256-263`) reads `quote.fee` under Direct; refresh quote 30 s before `expiresAt` while on the page; `total` unchanged formula
- [x] `OrderTypeSection.tsx` (feedback extracted into `ZoneFeedback`, rendered for saved addresses too): quote line under the address (loading / `Delivery $X · ~N min` / "Delivery isn't available for this address — pickup still works" / "Quote expired, refreshing…"); Delivery tab disabled with tooltip when `unavailable`
- [x] `OrderSummarySection.tsx` (`deliveryFeePending` prop): "Delivery" row shows quote fee; "Calculated at checkout" copy in `InfoPanel.tsx:265-278` replaces the flat fee under Direct; `FloatingCartBar` free-delivery progress hidden under Direct (`[slug]/page.tsx:221-222`, `t/[token]/page.tsx:203-204`)
- [x] `TipSection.tsx` (`title` prop): heading "Add a driver tip" under Direct delivery
- [x] `StoreInfoBar.tsx`, `MarketLayout.tsx` — no change needed; they read the computed flag
- **Verify (browser, staging store flipped to `orderout_direct`) — NOT YET RUN (needs migrations applied + functions deployed):** address typed → quote line appears; invalid address → pickup still works; `self` store → Delivery absent everywhere (screenshot all four surfaces); network tab shows no `api-key`

### Phase 3 — Order creation + dispatch
- [x] `create-online-order`: body gains `delivery_quote_id?: string`. Step 5 (`:675-731`) branches on `storeConfig.delivery_fulfillment`: under Direct — skip `validateDeliveryZone`; require `delivery_quote_id`; load quote; check `store_config_id`, `session_id` (or guest session just created), `is_selected`, normalised dropoff equals `body.delivery_address`, `expires_at > now()`; 422 `delivery_quote_invalid` / `delivery_quote_expired` (with `{requote:true}`); reject `requested_time` (D10); `deliveryFeeCents = round(quote.price*100)`; **free-delivery threshold and `delivery_fee` ignored** (`:832-840` gated)
- [x] Expired-at-submit path (see ▲ above): client on `delivery_quote_expired` re-quotes; if `fee` differs → show "Delivery fee changed to $X" with a Confirm button before re-submitting; if same → auto-resubmit once
- [x] After Step 11 succeeds (Step 11.5, upsert `ignoreDuplicates`) (`:1381`), before auto-accept (`:1590`): insert dispatch row `awaiting_accept` with `charged_fee`, `driver_tip = tip`, `oo_order_number = order_number`, `ON CONFLICT (order_id) DO NOTHING`. Failure to insert is logged, not fatal — the sweep covers it
- [x] Sweep: `sweep_orderout_delivery_dispatches()` every 5 min (not in `poke`'s cron SQL) (or a separate `sweep_orderout_delivery_dispatches()` scheduled every 5 min): paid `website` delivery orders on `orderout_direct` stores created in the last 24 h with no dispatch row → insert from the session's selected quote (`online_order_sessions.delivery_address` + latest selected quote for that session)
- [x] `supabase/functions/orderout-delivery-dispatch/index.ts` (▲ `complete_*` takes an explicit `p_outcome` — dispatched | cancelled | cancel_rejected | retry | failed — instead of ok/terminal booleans) (`verify_jwt=false`, `x-internal-secret`): claim → per row:
  - `pending`: D4(b) echo check; re-quote if `quote.expires_at < now()` (D9); build payload (dollars via `toDollars`, `items[].id = menu_item_id`, `modifiers[]`, `customer` from `orders.delivery_address` + customer fields, `order.ready_by = now + pickup_mins`, `thirdPartyManagedDelivery:true`, `delivery.quote_id` as raw integer, `driverTip`, `staffTip:0`, `payment:{status:'PAID', mode:'CREDIT_CARD'}`, `source:{orderNumber, placedOn}`); **write `request_payload` before the call**; push; success → `complete(ok, result)` sets `dispatched`, ids from response if any; failure → `complete(!ok, terminal?)`; terminal or `attempts ≥ max` → `failed` + DLQ + bell notification `orderout_delivery_dispatch_failed` (`app_notifications`, href `/dashboard/orders/{id}`)
  - `cancel_pending`: id = `oo_delivery_order_id ?? oo_channel_order_id`; none yet → retry later (max 6, then `failed` + alert "cancel could not be sent"); call cancel; 200/404/`already cancelled` → `cancelled`; 4xx rejection (courier has the food) → back to `dispatched`, `last_error`, bell `orderout_delivery_cancel_rejected`
- [x] `orderout-orders-webhook`: D5 guard (`handleDirectEcho`, runs before the restaurant lookup so an echo can never fall into the DLQ path) before `:501`; cancel-event guard in `handleCancellation` (`:333`)
- [x] `supabase/config.toml`: `[functions.orderout-delivery-quote]`, `[functions.orderout-delivery-dispatch]` with `verify_jwt=false` (the relay fn is missing its block — add it too while there)
- **Verify (staging + sandbox) — NOT YET RUN (needs Temur's OK for a live push):** happy path auto-accept → 1 `orders` row, 1 dispatch `dispatched`, echo `linked` in logs, `online_orders.external_reference` set; auto-accept off → row stays `awaiting_accept` until POS accept; decline → `cancelled`, zero OrderOut calls in logs; kill the sandbox key → 6 attempts with backoff, `failed`, DLQ row, bell notification; double-POST create-online-order with same `Idempotency-Key` → one dispatch; run the four verification queries from the ticket

### Phase 4 — Status intake + tracking page
- [x] **Scaffolded ahead of Step 0 Q5:** `supabase/functions/orderout-delivery-webhook/index.ts` — tolerant field mapper (order/tracker id, status, courier, eta, tracking url under any of OrderOut's usual spellings), raw body stored, DLQ on unknown status/no match. Not registered with OrderOut until they confirm the mechanism; poll branch NOT built — Bearer `ORDEROUT_WEBHOOK_SECRET` constant-time compare (copy `orderout-orders-webhook/index.ts:177-197`), map payload → `apply_orderout_delivery_status`, DLQ on failure, always 200. **If poll:** poll branch in the dispatch worker over `state='dispatched'` rows, same RPC
- [x] `apply_orderout_delivery_status` returns `advanced boolean`; when true the caller broadcasts `delivery_status_changed {orderId, deliveryStatus, courierName, eta, trackingUrl}` on `order-update:{orderId}` (same REST broadcast helper as `create-online-order/index.ts:324-346`)
- [x] `cancelled` status from courier side → dispatch `failed`, `last_error='courier_cancelled'`, bell `orderout_delivery_courier_cancelled`; `orders.status` untouched (merchant decides)
- [x] `getOrderTracking`: select `delivery_address` and left-join the dispatch row → `delivery?: {state, status, rank, courierName, eta, trackingUrl, fee}`
- [x] `OrderTrackingPage.tsx` (6-step `DELIVERY_STEPS`, rank-driven; courier card; delay notice; "Delivering to" block; directions hidden): when `orderType==='delivery'` render `DELIVERY_STEPS = ["Placed","Accepted","Driver assigned","Picked up","On the way","Delivered"]` (rank-driven, never regresses because the RPC never regresses); courier block (name, ETA, tracking link) when present; "Delivery delayed — the restaurant has been notified" state when `dispatch.state='failed'`; pickup copy ("Pickup location", "Get directions", "Ready for pickup" toasts at `OrderStatusWatcher.tsx:36-40`) swapped for delivery copy
- [x] `OrderStatusWatcher.tsx` (also fixed the undeclared `silentStatuses` prop and untyped `channels`): subscribe to `delivery_status_changed` (`:94-108`) and call a new `onDelivery` prop; fix the undeclared `silentStatuses` prop (`:62`) while touching the interface
- [ ] D11 conditional: extend `enqueue_orderout_status_relay` predicate if Step 0 Q6 says Ready is required
- **Verified (SQL replay, scratch DB):** replay a recorded status sequence (incl. duplicate + out-of-order) against the RPC in SQL → rank monotonic; browser: stepper advances live without refresh; duplicate/out-of-order events leave the stepper unchanged

### Phase 5 — Dashboard
- [x] `app/dashboard/online-ordering/page.tsx`: delete `DELIVERY_TEMPORARILY_DISABLED` (`:61-67`); add "Delivery fulfilment" select (`None — delivery off` / `OrderOut Direct`; `self` stays selectable so a store can be switched back off Direct — picking it forces the Delivery toggle off) inside `<FeaturePaywall serviceCode="orderout">`; Delivery toggle enabled only when fulfilment is `orderout_direct`; fee/threshold/radius inputs hidden under Direct with helper text "Customers pay the live courier quote"
- [x] `useOnlineOrderingSettings.ts`: `deliveryFulfillment` field; `saveOnlineOrderingSettings` (`actions.ts:1049-1276`): server-side refusal to save `orderout_direct` without active `orderout_restaurants` row + `get_subscription_entitlement.entitled`; `LogAuditEvent` `changes.before/after` includes the field
- [x] Order detail (`app/dashboard/orders/[orderId]/page.tsx`, `DeliveryDispatchBanner`; `GetOrderDetails` reads the dispatch row with the service role): `GetOrderDetails` (`order.ts:409-521`) left-joins the dispatch row; full-width banner between `:516` and `:518` for `failed` ("Delivery not dispatched — {last_error}. Call the customer or arrange delivery.") and for `cancel_rejected`; courier block for `dispatched`
- [ ] HQ mirror: `app/manage/actions/admin-merchant/online-ordering.ts` reads/writes the new column (read-only display is enough for v1)
- **Verified (static):** targeted `tsc` clean on every touched storefront/dashboard file (pre-existing errors in `types/order-management.ts`, `address-autocomplete.tsx`, `VoidOrder` "voided" untouched); `deno check` clean on all new/edited edge functions except the same client-typing artefacts the webhook file already had; ESLint: same 9 pre-existing React-Compiler errors before/after, 0 new. **Not yet:** browser run of save-refusal toast / audit row / banner

### Phase 6 — QA, recording, hand-off
- [ ] Run the QA matrix (§5) on staging with the sandbox; record happy path, push failure, cancel; attach to the ticket's Video property
- [ ] Regression: pickup order and QR dine-in order on a `self` store — diff network calls and DB rows before/after (must be identical)
- [ ] Non-implementer sign-off (Abubeckr or Temur)
- [ ] Production: apply migrations via SQL editor + `migration repair` (never `db push` to prod); deploy 3 functions with `--no-verify-jwt`; set edge secrets; create Vault URL secret last; every store stays `self`

---

### Where it stands (2026-09-20)

| Layer | Files | State |
|---|---|---|
| Bug fixes | `cancel-online-order/index.ts`, `orderout-onboard/index.ts` (+ `app/dashboard/actions/orderout.ts` passes `restaurant_phone`) | done |
| Shared | `_shared/orderout.ts`, `_shared/orderout-direct.ts`, `_shared/orderout-dispatch-notify.ts` | done, live-tested against quotes |
| DB | 2 migrations + 2 rollbacks | done, scratch-verified, **not applied** |
| Edge fns | `orderout-delivery-quote`, `orderout-delivery-dispatch`, `orderout-delivery-webhook`, `create-online-order` (Step 5 branch + 11.5), `orderout-orders-webhook` (echo guard) | done, type-checked, **not deployed** |
| Storefront | `actions.ts`, `types/site.ts`, `CheckoutPage`, `OrderTypeSection`, `OrderSummarySection`, `TipSection`, `InfoPanel`, `[slug]/page`, `t/[token]/page`, `order-actions.ts`, `OrderTrackingPage`, `OrderStatusWatcher` | done, type-checked |
| Dashboard | `online-ordering/page.tsx`, `actions.ts`, hook, `orders/[orderId]/page.tsx`, `actions/order.ts`, `types/order-management.ts` | done, type-checked |
| Not built | poll branch for status (only if OrderOut has no webhook); D11 ready-relay extension (only if Step 0 Q6 says so); HQ mirror of the fulfilment setting (read-only display) | pending Step 0 |

**Deploy order when unblocked:** apply migration A, B on staging → `supabase functions deploy orderout-delivery-quote orderout-delivery-dispatch orderout-delivery-webhook create-online-order orderout-orders-webhook cancel-online-order orderout-onboard --no-verify-jwt` → `vault.create_secret('https://dfwqakoyittmrwbqvxgw.supabase.co/functions/v1/orderout-delivery-dispatch','orderout_delivery_dispatch_url')` → flip Joes Brooklyn to `orderout_direct` on the dashboard → browser QA.

### 4b. Adversarial review — 2026-09-20 (31 findings, all verified line-by-line)

Fixed on the branch (scratch-DB scenarios E–M added to the spike script, 26/26 pass; deno + tsc + eslint parity):

| Finding | Fix |
|---|---|
| F1 cancel-during-push overwritten | `complete_*` is state-guarded; `dispatched` on a `cancelled` row → `cancel_pending` + poke, ids kept |
| F2 30 s lease vs slow batch → double push | `claimed_until` 5-min lease separate from backoff; 15 s HTTP timeout; state re-checked by a conditional `UPDATE … WHERE state='pending'` right before the push |
| F3 non-idempotent push retried | `pushChannelOrder` has `maxRetries: 0`; 5xx/timeout/network → new state `push_unconfirmed` (parked, merchant bell, banner); resolved only by the echo (`link_orderout_delivery_echo`) or a status event; a claimed row that already has `request_payload` is parked too (worker died mid-push); 429 disarms the marker and retries |
| F4 banner never shown to merchants | dispatch lookup hoisted into `withDeliveryDispatch()` for both `GetOrderDetails` branches |
| F5 quote fn unlimited without a session | live store-bound session required (401 `session_invalid`), plus a per-store cap (300 batches / 10 min) |
| F7 / F18 / F27 own cancel reported as courier cancel; terminal states not locked | `apply_*`: rank ≥ 8 locks the row; `cancelled` on `cancel_pending`/`cancelled` closes it and returns `false` (no bell/broadcast); echo cancel path only rings when the RPC returns `true` |
| F9 notes keystrokes re-quote | `activeAddress` keyed on street/city/state/zip only; notes dropped from the quote body |
| F10 courier-cancelled shows "Delivered" | `deliveryStepIndex` returns the kitchen step for `failed` / `cancelled` |
| F11 cash + Direct delivery | 422 `delivery_cash_payment_not_supported` |
| F12 refund after delivery cancels courier | cancel trigger skips rows with `delivery_status_rank >= 8` |
| F13 silent terminal failures | `failAndNotify()` used for every terminal path |
| F14 PostgREST `.or()` interpolation | id validated `^\d{1,32}$`, two `.eq` lookups |
| F19 `is_selected` by id; dollar truncation; `raw_price integer` | selected by position; `Math.round`; `raw_price numeric(14,4)` |
| F23 expired session → re-quote loop | quote fn checks `expires_at`; checkout re-inits the session on 401 and quotes again |
| F24 sweep picks latest session quote | `delivery_quote_id` written into `online_orders.provider_metadata` atomically via the RPC; sweep prefers it and no longer needs `online_session_id` |
| F26 stray `last_error` = "cancel rejected"; retry@max flips a dispatched row | `cancel_rejected_at` column; `retry`/`failed` ignored unless state is pending/cancel_pending/push_unconfirmed |
| F28 missing indexes | partial indexes on `oo_delivery_order_id`, `oo_channel_order_id`, `tracker_id`; store-window index on quotes |
| F29 cancel with no id waits ~31 min | capped at `CANCEL_NO_ID_MAX_ATTEMPTS = 4` (~3.5 min) then `cancel_failed` bell |
| F25 wrong comment about auto-accept | corrected |

Still open — decisions, not code (see handoff §7): F8 quote TTL vs accept window / which fee to push; F6 treat cancel 404 as success; F16 driver tip in `tip_amount`; F17 public tracking exposes full address; F15 echo match only on `orderNumber`; F20 item price includes modifiers; F21 BigInt regex inside strings; F22 webhook `pick()` nested scan; F30 Mark-Ready relay; F31 pg_net 5 s poke timeout.

## 5. QA matrix

| # | Case | Expect | Where verified |
|---|---|---|---|
| 1 | Happy path, auto-accept on | 1 `orders`, 1 KDS ticket, 1 print, dispatch `dispatched`, echo `linked`, stepper advances live | staging + sandbox + KDS |
| 2 | Auto-accept off, accept after 4 min | dispatch fires on accept; if quote expired, `requote_delta` populated | |
| 3 | Auto-accept off, decline | zero OrderOut calls; Valor void/refund incl. fee; dispatch `cancelled` | edge logs, Valor sandbox |
| 4 | OrderOut 5xx on push | 6 attempts w/ backoff (30 s→16 min), `failed`, DLQ, bell | kill key / mock |
| 5 | Push times out but succeeded upstream | echo links first; retry sees `echo_received_at` → `dispatched`, no second courier | needs sandbox timing or a mock |
| 6 | Quote expired between checkout and pay | 422 → re-quote → confirm if price changed → success | |
| 7 | Customer cancels before pickup | cancel 200 → `cancelled` | |
| 8 | Cancel after courier pickup | rejection → `dispatched`, bell to merchant, order not left open silently | |
| 9 | Cancel when never dispatched | `cancelled`, no call | |
| 10 | System expiry (unaccepted 5 min) | `cancel-online-order` system path no longer throws; dispatch `cancelled` | |
| 11 | Courier cancels | dispatch `failed`, bell, customer page shows delay state | |
| 12 | Status events duplicated / out of order | rank never decreases; stepper unchanged | SQL replay |
| 13 | Address outside coverage / no quotes | Delivery disabled with message; pickup works | |
| 14 | Store on `self` | zero OrderOut calls; Delivery hidden on checkout, StoreInfoBar, InfoPanel, MarketLayout | |
| 15 | Store on `orderout_direct` but entitlement lapsed | Delivery hidden | |
| 16 | Tampered / foreign-session / foreign-store / expired `delivery_quote_id` | 422, no charge | curl |
| 17 | Client sends a fee/total | ignored; charge equals stored quote | curl |
| 18 | Scheduled delivery under Direct | 422 `scheduled_delivery_not_supported` | curl |
| 19 | Double submit (same `Idempotency-Key`) | 1 order, 1 dispatch | curl ×2 |
| 20 | Pickup + QR dine-in regression on `self` store | byte-identical rows and calls | before/after diff |

Verification SQL: the four queries in the ticket, adjusted for the fee check (`order_payments` has no delivery fee column; compare `dispatch.charged_fee` to `quote.price`, and `orders.amount_paid` to `subtotal + tax + tip + charged_fee`).

---

## 6. Hard constraints (from the ticket, restated as checks)

- [ ] `api-key` only in edge secrets; grep the client bundle for `orderout` before hand-off
- [ ] No `any` in new TypeScript; request/response types in `_shared/orderout.ts`
- [ ] `process_online_order` signature untouched
- [ ] No network I/O in triggers
- [ ] All RPCs `SECURITY DEFINER SET search_path = public, pg_temp`
- [ ] Money `NUMERIC(12,2)` + `TRUNC`; ids as `text`; no arithmetic on OrderOut ids
- [ ] No new table in `supabase_realtime`
- [ ] Every OrderOut call wrapped; terminal failures land in `webhook_dead_letter_queue`

---

## 7. Risks & open questions for Temur

1. **Status intake may not exist** (Q5). If OrderOut offers neither a webhook nor a status endpoint, v1 tracking is "Dispatched + tracking link" and the four-state stepper AC must be re-scoped. Decide before Phase 4.
2. **Key scope** (Q11). The relay work saw a 401 on `/api/order/*` with the shared key.
3. **Tip reporting** (D8): driver tips will sit in `orders.tip_amount`. Acceptable for v1?
4. **Who pays OrderOut**: the courier fee is billed to `orderout_accounts.oo_billing_account_id` (platform default `5546155819794432`) — confirm Direct deliveries bill the merchant's own OrderOut account, not Dexa's.
5. **`connect_channel` onboarding**: needs to run once per restaurant. Add to `orderout-onboard` for new restaurants and a one-off dashboard action for the 3 existing staging rows.
6. **Address quality**: the form requires only street + city (`CheckoutPage.tsx:718-722`). Quotes require state + zip. Under Direct, require all four before quoting.

## 8. Out of scope (unchanged from the ticket)
Live map, scheduled delivery, merchant-subsidised/flat fees, provider picker, migrating the three existing `orderOutRequest` copies, post-charge rollback in `create-online-order` (separate ticket), `VoidOrder` enum bug (separate ticket).
