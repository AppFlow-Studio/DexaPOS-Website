# Handoff — OrderOut Direct Delivery (website checkout)

**Date:** 2026-09-20
**Ticket:** [WEB-FEAT · OrderOut Direct Delivery on the online ordering website](https://app.notion.com/p/WEB-FEAT-OrderOut-Direct-Delivery-on-the-online-ordering-website-checkout-quotes-dispatch-on-acce-3de8280c1b1d81e495c4f1451ba40990) — owner Ali Awdi; co-owners Haidar Saleh (UI polish), Temur (OrderOut liaison)
**Branch:** `feat/orderout-direct-delivery` off `dexaposwebsite-preview` (base `3d885f4a`) — **uncommitted working tree, 25 files changed + 11 new**
**Plan (living doc, keep updating it):** [orderout-direct-delivery-plan.md](./orderout-direct-delivery-plan.md)
**State in one line:** code-complete and statically verified; migrations verified on a scratch Postgres but **not applied**; edge functions **not deployed**; dispatch cannot be exercised end-to-end because OrderOut's channel push rejects our POS-type API key.

---

## 1. The ticket in plain terms

Delivery is switched off on every storefront (`deliveryEnabled: false` hard-coded in `app/sites/actions.ts`) because merchants have no drivers. OrderOut Direct sells couriers on demand: give it a pickup and a dropoff, it returns quotes from Uber / DoorDash Drive / Grubhub / others, you accept one, a driver comes. The ticket wires that into the website checkout:

1. Quote when the address is complete (server-side; browser only gets our own quote id + fee + ETA)
2. Charge the stored quote price — never a client number
3. Book the courier only after the merchant accepts (immediately if auto-accept is on), through an outbox + worker with retries
4. Cancel the courier from a DB trigger on `orders.status`, so every cancel path is covered
5. Catch OrderOut's echo of our own order in `orderout-orders-webhook` so it never becomes a second order / KDS ticket / print
6. Live tracking stepper on the customer's page
7. Re-enable delivery only per store, only where Direct is configured; `self` stores stay exactly as today

The ticket's two hard warnings: **the echo will duplicate orders** unless guarded, and **the card is charged before the push**, so a failed push must be loud and retried, never silent.

## 2. Timeline of the work

| When | What |
|---|---|
| 09-19 | Read the ticket via `ntn` CLI. Four parallel code maps (create-online-order, status-relay outbox pattern, storefront, dashboard/cancel paths). Pulled OrderOut's public docs (`developers.orderout.co/llms.txt`). Wrote the plan. |
| 09-20 early | Step 0 read-only spike against the live API + staging DB (§4). Found the restaurant `phone_number` blocker. |
| 09-20 | With the user's go: fixed the Brooklyn test restaurant's phone/zip on OrderOut. Live quotes worked. |
| 09-20 | User: "start the build, keep the blockers for later." Built all phases (§5). |
| 09-20 | With the user's explicit one-time authorisation: attempted a real push. Rejected by key type (§6). No courier booked. |

## 3. Decisions taken (and by whom)

| # | Decision | By | Why |
|---|---|---|---|
| D-env | The shared `ORDEROUT_API_KEY` + Joes Coffee Shop on staging **is** the test environment. Do not pursue a second OrderOut integrator key for staging isolation. | Temur via user | Team's accepted practice. Consequence accepted: any order pushed from staging echoes into **prod's** `orderout-orders-webhook` (single platform-wide registration). |
| D1 | `online_store_config.delivery_fulfillment` (`self` \| `orderout_direct`, default `self`). Storefront shows Delivery only when `accepts_delivery AND fulfilment=orderout_direct AND active orderout_restaurants row`. | me (plan) | AC 1: `self` stores never get delivery from this ticket. |
| D1b | The active `orderout_restaurants` row **is** the entitlement check — no `get_subscription_entitlement` RPC on the storefront. | me | The dashboard's OrderOut paywall already grandfathers any merchant with a restaurant row (`FeaturePaywall grandfathered={hasAccount\|\|hasRestaurant}`), so the RPC would be redundant. |
| D2 | Cheapest quote wins, tie → fastest. No provider picker. ETA shown is the **selected** quote's ETA. | ticket, refined by me | Live data showed cheapest ≠ fastest (Uber $5.19 / 75 min vs Motoclick $5.99 / 28 min). **Open for Temur** whether "cheapest" is really the rule. |
| D3 | Outbox copies `orderout_status_relay_queue` exactly (trigger → row → pg_net poke → 1-min cron → claim/complete → DLQ). **No `claimed` state**: claim bumps `next_attempt_at` as a visibility timeout. | me | Proven pattern in prod for the same vendor; no reaper needed. ▲ deviates from the ticket's schema (had `claimed`). |
| D4 | Double-courier guard: `UNIQUE(order_id)` **plus** before every push retry, skip if `oo_delivery_order_id`/`oo_channel_order_id`/`echo_received_at` is set. | me | A push that times out but succeeded upstream is otherwise the one path to two couriers. |
| D5 | Echo guard matches **exactly** on `orderout_delivery_dispatches.oo_order_number` (= `orders.order_number`, stored before the HTTP call), runs **before** the restaurant lookup, and captures `externalReferenceId` as the OrderOut order id. | me | Works even if the echo beats the push response; the echo doubles as id capture because push returns `{}`. ▲ ticket suggested matching on `ods.name`. |
| D6 | Status intake is source-agnostic: one RPC `apply_orderout_delivery_status` (monotonic rank) fed by a webhook **or** a poller. | me | OrderOut hasn't said how statuses arrive. |
| D6b | Courier status events do **not** write `order_status_history`. | me | That table has an AFTER INSERT trigger that emails customers; the dispatch row is the history. |
| D7 | Prices normalised via `unit`; default `cent` (`QUOTE_DEFAULT_UNIT`) because every live quote carried `unit:"cent"`. Ids stored as text; `rawInt()` re-emits them as bare JSON integers. | me | Verified live 2026-09-20. |
| D8 | Tip stays in `orders.tip_amount` (charged, must reconcile); pushed as `driverTip`, `staffTip: 0`; label "Add a driver tip". | ticket | **Open for Temur:** reports will show it as staff gratuity. |
| D9 | Quote expired before accept → worker re-quotes, dispatches anyway, records `requote_delta`, bell-alerts merchant if > $1. Customer never re-charged. | ticket | |
| D10 | Scheduled delivery → 422 `scheduled_delivery_not_supported` under Direct. | ticket | Client already sends `requested_time: null`. |
| D11 | Quote expired **at submit** → server 422 → client re-quotes and shows the new fee; the customer clicks Place Order again. **No auto-resubmit.** | me | Reusing a Valor Passage token is unverified. ▲ ticket implied auto-retry when the price is unchanged. |
| D12 | `complete_orderout_delivery_dispatch` takes an explicit `p_outcome` (`dispatched` \| `cancelled` \| `cancel_rejected` \| `retry` \| `failed`) instead of ok/terminal booleans. | me | Cancel-rejected (courier already has the food) must return the row to `dispatched`, which two booleans can't express. |
| D13 | `orderout-delivery-webhook` scaffolded now with a tolerant field mapper and raw-body capture, not registered with OrderOut. | me | So the day OrderOut confirms the mechanism it's a config step, and the first live event reveals the real shape. |
| D14 | Restaurant phone: `orderout-onboard` now `PUT`s `phone_number` onto the OrderOut restaurant after `/onboarding/`; server action passes `locations.phone`, falls back to manager phone. | me | Without it every merchant is un-quotable (§4). |

## 4. Findings (things not in the ticket or the docs)

**From code:**
- `cancel-online-order/index.ts` used `session` outside the `if (!isSystemCall)` block where it was declared → `ReferenceError` on **any** card reversal (customer and system). Fixed.
- `create-online-order` has no post-charge rollback (`voidSale` exists in `_shared/valor.ts`, never called). **Not fixed — separate ticket.**
- `app/dashboard/actions/order.ts` `VoidOrder` writes `status: "voided"`, not an enum member. **Not fixed — separate ticket.**
- `orders` has no delivery-fee column; `p_delivery_charge` is folded into the total. The dispatch row's `charged_fee` is the only record.
- The checkout calls `create-online-order` **directly from the browser** with the anon key; `order-actions.ts placeOrder` is dead code.
- `OrderStatusWatcher` dropped any status not in `DECISION_MESSAGES`, and had an undeclared `silentStatuses` prop. Both fixed.
- The relay trigger only fires for `oo.provider='orderout'`; a Direct order (`website`) won't relay Mark-Ready. Extension deferred until OrderOut says Ready is required.

**From OrderOut's docs:**
- Quotes doc contradicts itself (`restaurant_id` vs `merchant_id`). Live: `restaurant_id` resolves; unknown id → `404 Merchant not found`.
- Push returns `{}`. Cancel needs an int64 order id → the only source is the echo's `externalReferenceId`.
- Delivery statuses are listed; **no registration endpoint or payload exists anywhere** (probed `/api/webhooks/delivery`, `/api/webhooks/delivery_status`, `/v2/delivery/webhooks`, `/v2/webhooks`, `/v2/delivery/orders`, `/v2/delivery/orders/{id}` → all 404). `List Orders` keys on a marketplace `service_merchant_id`, not ours.
- `connect_channel` (`POST /api/pos/restaurant/{id}/connect_channel {channel_type:"ONLINE_ORDERING", store_id}`) is an undocumented-in-ticket prerequisite; `destination.storeId` on the push is the `store_id` we register.

**From the live API (Joes Coffee Shop Brooklyn, `oo_restaurant_id 6487684134600704`, `pos_uuid 657a703d-…`):**
- The shared key **works** on `/v2/delivery/quotes`. Still 401 on `/api/order/{id}` (as the relay work found).
- Quotes returned `400 {"reason":"Invalid 'phone_number'"}` — not a request field: the **restaurant record on OrderOut** had `phone_number: ""` and zip `23123` (Virginia) for a Brooklyn store. Fixed with `PUT /api/pos/restaurant/6487684134600704` (phone `3476591866`, Brooklyn NY 11217). Original record saved at scratchpad `spike/rest_ORIGINAL_6487684134600704.json`.
- Real quote (Brooklyn → 1 Hanson Pl): Uber $5.19 / 75 min, Motoclick $5.99 / 28 min, Grubhub $9.49 / 43 min. `unit:"cent"` on every quote. Quotes are live (ETAs drift between identical calls). Manhattan (5 mi) → one quote. Los Angeles / garbage address → **`400` with a JSON array of per-provider `{provider, message}`** (Uber radius 10 mi; DoorDash "not within service area"; messages leak partner ids — never show raw). Providers polled: uber, motoclick, grubhub, doordash, justeat, relay.
- `GET /api/webhooks/push_order` → exactly **one** registration, pointing at **prod** (`hifouuofcaytijrkbvcy…/orderout-orders-webhook`). Same for `push_menu`. Staging can never receive an echo on its own webhook (accepted, see D-env).
- The three staging `orderout_restaurants` rows are all `active`; Tempe ("8320 Test Street") returns `Merchant not found` for quotes under this key.

## 5. What was built

All paths repo-relative. Every file type-checks (targeted `tsc` for Next files; `deno check --no-config` for edge functions), ESLint shows the same 9 pre-existing React-Compiler errors before/after and none new, `npm run build` passes.

### Bug fixes
- `supabase/functions/cancel-online-order/index.ts` — hoisted `storeConfigId`; system path resolves it from `online_store_config` by `location_id`.
- `supabase/functions/orderout-onboard/index.ts` + `app/dashboard/actions/orderout.ts` — `api.put`, `restaurant_phone` body field, post-onboard `PUT /pos/restaurant/{id} {phone_number}` (best-effort, logged).

### Shared (Deno)
- `supabase/functions/_shared/orderout.ts` — host-level client (`https://api.orderout.co`), `parseJsonPreservingBigInts`, `rawInt`/`stringifyWithRawInts`, `isTerminalStatus` (same set as the relay), typed `getDeliveryQuotes` (normalises 200-array / 400-array / 404 / 400-reason), `quotePriceToDollars`, `pushChannelOrder`, `cancelDeliveryOrder`, `getRestaurant`. Per-call `apiKey` override. **Live-tested** against quotes.
- `supabase/functions/_shared/orderout-direct.ts` — `resolveDirectEligibility`, `normalizeDropoff`, `fetchAndStoreQuotes` (stores every quote under a batch key, marks cheapest `is_selected`), `QUOTE_TTL_MINUTES = 5` (assumption), `QUOTE_DEFAULT_UNIT = 'cent'`.
- `supabase/functions/_shared/orderout-dispatch-notify.ts` — `notifyMerchantDispatch` (inserts `app_notifications`, 5 types, href `/dashboard/orders/{id}`), `broadcastDeliveryStatus` (`delivery_status_changed` on `order-update:{orderId}`).

### Database
- `supabase/migrations/20260920120000_orderout_direct_delivery_schema.sql` — `online_store_config.delivery_fulfillment` + CHECK; `orderout_restaurants.channel_store_id/channel_connected_at`; `orderout_delivery_quotes`; `orderout_delivery_dispatches` (`UNIQUE(order_id)`, 6-state CHECK, `echo_received_at`, `requote_delta`, courier fields, retry fields); partial indexes; RLS on / no policies; `update_updated_at_column` triggers.
- `supabase/migrations/20260920121000_orderout_direct_delivery_outbox.sql` — `poke_orderout_delivery_dispatch` (Vault `orderout_delivery_dispatch_url` + `internal_notification_secret`), triggers `trg_oo_dispatch_on_accept` (AFTER UPDATE OF `accepted_at`) and `trg_oo_dispatch_on_cancel` (AFTER UPDATE OF `status` → cancelled/declined/void/refunded), `claim_orderout_delivery_dispatch` (SKIP LOCKED, backoff 30s→16m), `complete_orderout_delivery_dispatch(p_outcome…)` (DLQ `source='orderout_delivery_dispatch'`), `orderout_delivery_status_rank`, `apply_orderout_delivery_status` (monotonic, mirrors to `online_orders`, courier-cancel → `failed`), `sweep_orderout_delivery_dispatches` (rebuilds a lost row from the session's selected quote), cron `orderout-delivery-dispatch-drain` (1 min) + `-sweep` (5 min), grants to `service_role`.
- Rollback twins in `supabase/migrations/rollback/`.
- **Verified** on `supabase/postgres:15.8.1.085` (Docker) with stub tables: both migrations + rollbacks clean; 14-scenario script passed (scripts at scratchpad `spike/pg/00_stubs.sql`, `90_test.sql`). **Not applied to staging.**

### Edge functions (all `verify_jwt=false` in `supabase/config.toml`; relay fn's missing block added too)
- `orderout-delivery-quote` — POST `{store_config_id, session_token?, dropoff}`; eligibility; 12 batches / 10 min / session rate limit; `available:false` + generic message on no coverage (200); `{quote_id, fee, eta_minutes, pickup_minutes, expires_at}` on success.
- `orderout-delivery-dispatch` — `x-internal-secret` (via `_shared/internal-billing-auth.ts`); claim → `pending`: D4 guard, re-quote if expired, build channel payload (dollars, `items[].id = menu_item_id`, modifiers from `order_item_modifiers`, `ready_by = now + pickup_mins`, `driverTip`, `delivery.quote_id` as raw int, `destination.storeId = channel_store_id ?? pos_uuid`), **persist `request_payload` before the call**, push, complete; `cancel_pending`: id = `oo_delivery_order_id ?? oo_channel_order_id`, 200/404/"already cancelled" → cancelled, other 4xx → `cancel_rejected` + bell, 5xx → retry. Bell on failed/cancel-failed/requote-delta.
- `orderout-delivery-webhook` — Bearer `ORDEROUT_WEBHOOK_SECRET`; tolerant mapper; resolves dispatch by delivery id / tracker id / order number; RPC; broadcast on advance; DLQ `source='orderout_delivery_webhook'`. **Not registered with OrderOut.**
- `create-online-order` — `delivery_quote_id` body field; Step 5 Direct branch (skip zones/flat fee; validate store/session/selected/address/expiry → 422 `delivery_quote_required|invalid|expired {requote:true}`; reject `requested_time`); Step 11.5 upsert dispatch row `awaiting_accept` (`ignoreDuplicates`), before auto-accept.
- `orderout-orders-webhook` — `handleDirectEcho` before the restaurant lookup: received → `echo_received_at`, `oo_channel_order_id = externalReferenceId`, `online_orders.external_reference`; cancelled → RPC `cancelled` + bell `courier_cancelled`. Returns 200 `linked`.

### Storefront (`app/sites`)
- `actions.ts` — `resolveDeliveryFulfillment` in `getStorefrontData` and `getStorefrontMetaData`; TEMP block removed; `deliveryFulfillment` on the config. `types/site.ts` typed.
- `components/checkout/CheckoutPage.tsx` — `activeAddress` (saved or new), `requestDeliveryQuote` (fetch `orderout-delivery-quote` with anon key, sequence-guarded), debounced quote/zone effect, 30-s-before-expiry refresh, `deliveryFee` from the quote, `delivery_quote_id` in the body, `zoneBlocked` until a quote is ready, re-quote + "fee changed" message on the 422s.
- `OrderTypeSection.tsx` — feedback extracted into `ZoneFeedback`, rendered for saved addresses too. `OrderSummarySection.tsx` (`deliveryFeePending` → "Calculated at checkout"), `TipSection.tsx` (`title`), `InfoPanel.tsx` ("Calculated at checkout" row), `[slug]/page.tsx` + `t/[token]/page.tsx` (free-delivery bar off under Direct).
- `order-actions.ts` — `OrderTrackingDelivery` on `getOrderTracking` (dispatch row + dropoff). `OrderTrackingPage.tsx` — 6-step rank-driven stepper, "Arriving by", courier card + tracking link, "Delivery delayed" notice, "Delivering to" block, directions hidden. `OrderStatusWatcher.tsx` — `delivery_status_changed` subscription (rank-guarded), delivery toasts, `orderType`/`onDelivery`/`silentStatuses` props, typed `channels`.

### Dashboard
- `online-ordering/hooks/useOnlineOrderingSettings.ts` + `actions.ts` — `deliveryFulfillment` load/save; **server refuses** `orderout_direct` without an active `orderout_restaurants` row.
- `online-ordering/page.tsx` — `DELIVERY_TEMPORARILY_DISABLED` removed; fulfilment `Select` (Direct option disabled until OrderOut is active); Delivery toggle enabled only under Direct; fee/threshold/radius inputs hidden under Direct.
- `orders/[orderId]/page.tsx` + `actions/order.ts` + `types/order-management.ts` — `orderout_delivery_dispatch` on `GetOrderDetails` (service role); `DeliveryDispatchBanner` (failed / courier-cancelled / dispatched+courier / cancel-rejected / awaiting / booking).

### Not built (by design, pending OrderOut answers)
- Poll branch for delivery status (only if OrderOut has no webhook).
- Ready-relay extension for Direct orders (only if OrderOut says Mark-Ready is required).
- HQ (`/manage`) read-only display of the fulfilment setting.
- `ORDEROUT_CHANNEL_API_KEY` wiring — five lines in `orderout-delivery-dispatch` once the key exists (§6).

## 6. Blockers — current state

| # | Blocker | Owner | Detail |
|---|---|---|---|
| **B1** | **Channel push rejects our key** | Temur → OrderOut | `/api/channel/order/push` returns `400 "Store not found: no delivery service matches the provided store ID."` for every `destination` shape, even after `connect_channel` succeeded (restaurant now shows `connected_delivery_services: ["PALOMA_ORDERING"]`). The push resolves the store under the **channel integrator owning the api-key**; ours is a **POS** integrator key (OrderOut integrator types: POS / CHANNEL / DELIVERY). **Ask OrderOut for a CHANNEL-type api-key for Dexa's online-ordering channel**, and whether cancels go under the POS or channel key. Until then nothing can be dispatched. |
| **B2** | **Delivery-status mechanism unknown** | Temur → OrderOut | No webhook registration or poll endpoint exists in the docs or on the API. Ask: how are `runner_assigned … completed` delivered, and a sample payload (courier name/phone, tracking URL, ETA). Also ask quote lifetime and whether Mark-Ready is required for Direct. |
| B3 | Migrations not applied, functions not deployed, Vault secret not created | Ali (needs go) | Deploy order in the plan's "Where it stands". Safe to do now; B1 only blocks the push itself. |
| B4 | Browser QA not run | Ali | Everything short of the push is testable once B3 is done: quote line, no-coverage, pickup regression, `self` store hides delivery, dashboard save refusal, audit row, tracking page with a hand-inserted dispatch row. |

**2026-09-21 docs re-verification** (`orderout-api-docs-verification-2026-09-21.md`): the Delivery Dispatch guide documents a direct courier-booking endpoint `POST /v2/delivery/orders` (quote id in, `{id, fd_id, tracker_id}` out — no channel, no store id) but the route returns HTML 404 on the live API for any key; if OrderOut enables it, B1 goes away. Cancel with an unknown id returns JSON 404 "Order not found", so 404 cannot be treated as "already cancelled" (F6 → do it). `driverTip` is documented as the courier's tip, separate from `staffTip` (F16 → do it).

Side effects on the staging test restaurant (6487684134600704) that a future engineer should know: phone/zip corrected on OrderOut; an `ONLINE_ORDERING` channel with `store_id = pos_uuid` is registered; `delivery_services_status` went `null → NOT_ACCEPTING_ORDERS` (no disconnect endpoint found).

## 6b. Adversarial review + fixes — 2026-09-20 (after the first commit)

An Opus 5 reviewer went over commit `f0e6ebfb` and returned 31 findings; every one was re-verified
against the code before acting. Three were CRITICAL and shared one root cause: **I had treated the
OrderOut push like an idempotent outbox message and it is not** — a retried push books a second
courier. The rework (all on the branch, migrations still NOT applied):

- **State machine hardened.** `complete_orderout_delivery_dispatch` and the new
  `link_orderout_delivery_echo` are conditional on the row's *current* state; a cancel that lands
  mid-push turns the successful push into `cancel_pending` instead of being overwritten.
- **New state `push_unconfirmed`.** 5xx / timeout / network on the push, or a claimed row that
  already carries `request_payload` (worker died mid-push), is parked, the merchant gets a bell and
  an amber banner, and only OrderOut's echo or a courier status event moves it to `dispatched`.
  Nothing is ever re-pushed automatically. `pushChannelOrder` has `maxRetries: 0`; 429 is the one
  retried code (provably unprocessed).
- **Lease ≠ backoff.** `claimed_until` (5 min) stops the one-minute drain re-claiming a row whose
  push is still in flight; 15 s HTTP timeout; state re-checked by a conditional `UPDATE` right before
  the HTTP call.
- **Status intake.** rank ≥ 8 is terminal; "cancelled" confirming *our* cancel closes the row
  silently (no "courier cancelled" bell / customer toast); a status event on `push_unconfirmed`
  proves the booking.
- **Quote fn** requires a live store-bound session (401 `session_invalid`; the checkout re-inits and
  retries) and adds a per-store cap. Cash payment refused for Direct delivery. Delivery notes no
  longer trigger quotes.
- **Dashboard** banner actually renders for merchants now (the lookup was only in the HQ branch);
  `cancel_rejected_at` replaces the `last_error` heuristic.
- **Sweep** rebuilds from `online_orders.provider_metadata.delivery_quote_id` (written atomically
  by the RPC), so it recovers the exact quote the card was charged and no longer needs the session
  binding.
- Refund after delivery no longer tries to cancel the courier; cancel-with-no-id gives up after
  ~3.5 min instead of ~31; `is_selected` by position; `raw_price numeric`; lookup indexes; PostgREST
  filter injection in the status webhook closed.

Verification: 26-scenario SQL script on scratch Postgres (12 new scenarios covering each fix),
`deno check` clean on every new/edited function (pre-existing untyped-client errors unchanged in
count), targeted `tsc` clean, ESLint parity (same 9 pre-existing React Compiler errors). Full table
in the plan §4b.

## 6c. Staging rollout + browser QA — 2026-09-21

**Rollout (staging `dfwqakoyittmrwbqvxgw`):** both migrations applied by Ali via the SQL editor (cron jobs 24/25); the seven functions deployed through the Management API (`POST /v1/projects/{ref}/functions/deploy`, multipart `index.ts` + transitive `_shared` files, `verify_jwt=false`) — versions: `orderout-delivery-quote` 1, `-dispatch` 1, `-webhook` 1, `create-online-order` 234, `orderout-orders-webhook` 256, `cancel-online-order` 193, `orderout-onboard` 170; each smoke-tested on its live URL. Vault `orderout_delivery_dispatch_url` created; the next cron tick logged `POST | 200 | …/orderout-delivery-dispatch`, proving DB → pg_net → worker auth end to end. **Note:** staging runs the review-fixed code, which was not yet committed at the time.

**Store flip:** Joes Downtown Brooklyn set to fulfilment *OrderOut Direct* + Delivery on, through the real dashboard UI (Playwright, merchant login), verified after reload.

**Storefront QA (guest, `localhost:3000/sites/joes-downtown-brooklyn`, headless Chrome) — 11/11:** storefront loads; item added; **Delivery tab present** (resolveDeliveryFulfillment → `orderout_direct`); summary shows *Calculated at checkout* before an address; Brooklyn address (1 Hanson Pl) → `orderout-delivery-quote` 200 `available:true fee 5.19 eta 77` → green line **"Delivery $5.19 · about 77 min"** and summary `3.25 + 0.29 tax + 5.19 + 0.59 tip = $9.32`; typing delivery notes fires **0** extra quotes (F9 fix); Washington DC address → 200 `available:false no_coverage` → *"Delivery isn't available for this address. Pickup is still available."* and summary back to *Calculated at checkout*, Place Order disabled; Pickup tab shows no delivery/quote text. Two quote calls total.

**Not QA'd yet:** placing an order, the tracking-page courier stepper, the order-detail banner — the store's `process-online-payment` bootstrap returns **503 on staging (pre-existing, Valor/NMI not configured for this store)**, so Place Order is disabled independent of this feature. Needs a hand-inserted order + dispatch row (DB write) or a payment-configured store.

## 7. Open questions for Temur (decisions, not blockers)
1. Cheapest vs fastest courier (D2).
2. Driver tips inside `orders.tip_amount` in reports (D8) — reviewer F16: currently the same $ is
   both staff gratuity *and* `driverTip` in the push. Recommend storing it only on the dispatch row.
3. Who pays OrderOut for the courier — `orderout_accounts.oo_billing_account_id` is the platform default `5546155819794432` on every account.
4. `connect_channel` must run once per restaurant — add to `orderout-onboard` for new merchants once B1 is answered.
5. **Quote TTL vs accept window (F8).** TTL is a guessed 5 min and the default accept window is 5 min,
   so nearly every manually-accepted order re-quotes at dispatch, and the push sends the *old* fee
   with the *new* quote id. Ask OrderOut the real quote lifetime; regardless, decide whether to push
   the fresh fee (merchant absorbs the delta, already tracked in `requote_delta`).
6. **Cancel 404 = success? (F6)** Until the id the cancel endpoint wants is proven live, a 404 may
   mean "wrong id", not "already gone". Option: treat 404 as `cancel_rejected` + bell for now.
7. **Public tracking page (F17)** now returns the full drop-off address + courier name behind the
   order UUID only. Options: street + city only, or gate behind the session token.
8. Echo match is `source.orderNumber` only (F15); item `price` includes modifiers and modifiers are
   also priced (F20) — both need a live push to confirm OrderOut's behaviour; cheap to harden either way.

## 8. How to pick this up
1. Read the plan doc §2a (spike results) and "Where it stands".
2. `git checkout feat/orderout-direct-delivery`; review `git diff` (nothing committed).
3. Re-run the DB verification if in doubt: `docker run supabase/postgres:15.8.1.085 -c shared_preload_libraries=pg_cron,pg_net`, then `00_stubs.sql → 10_schema → 20_outbox → 90_test.sql` as `supabase_admin` (scripts in the scratchpad; copy them into `docs/…/qa/` if they should live in the repo).
4. Apply migrations to staging, deploy functions, create the Vault secret, flip Joes Brooklyn to `orderout_direct`, browser-QA.
5. When the channel key arrives: read `ORDEROUT_CHANNEL_API_KEY` in `orderout-delivery-dispatch` and pass `{ apiKey }` to `pushChannelOrder`; re-run `spike/push_test.ts` with that key; then the QA matrix.
