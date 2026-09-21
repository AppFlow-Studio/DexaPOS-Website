# OrderOut API — docs vs. live verification (2026-09-21)

Source: `https://developers.orderout.co/llms.txt` (every page fetched as `.md`; snapshot in the session
scratchpad `oodocs/`). Live probes ran against `https://api.orderout.co` with the shared key, using only
bodies that cannot create anything (empty / incomplete). Companion to the plan §0 and handoff §6.

## A. Endpoint inventory relevant to OrderOut Direct

| Endpoint (docs) | Purpose per docs | Live result with our POS key | Used by our code |
|---|---|---|---|
| `POST /v2/delivery/quotes` | Get courier quotes (`restaurant_id`, `dropoff_*`, `pickup_minutes`) | **works** — `{}` → JSON 400 listing missing `dropoff_*`; full body → live quotes with `unit:"cent"` | `getDeliveryQuotes` ✓ |
| `POST /v2/delivery/orders` — **"Create Order"** (Delivery Dispatch guide, page updated 2026-01-12) | Book the courier directly: `merchant_id`, `quote_id`, `dropoff_*`, `customer_name/phone`, `subtotal`, `driver_tip`, `unit`, optional `oo_order_id`; returns `{id, fd_id, tracker_id, status}` | **route does not exist** — HTML "Page Not Found" from the backend router for any body and any key (real routes return JSON 401 on a bogus key). Not in `llms.txt`; only reachable via the guide's `ref:delivery-create-order` link | not used — **would have been the key-type-free path** |
| `POST /v2/delivery/orders/{order_id}/cancel` | Cancel a delivery order, body `{reason}`; 200 → `{id, fd_id, tracker_id, status}`; 404 | **exists** — unknown id → JSON 404 `{"reason":"Order not found"}` | `cancelDeliveryOrder` ✓ |
| `POST /api/channel/order/push` | Channel → OrderOut order push; body per *Order Payload Example*; `delivery.quote_id` "in case this order should automatically trigger a delivery order as well" | exists; validates `source.orderNumber` (as `order_uuid`) first, then **"Store not found: no delivery service matches the provided store ID"** for every `storeId` tried. Bogus key → *"The provided token is not valid for this endpoint. Please contact OrderOut Support to verify your Channel or Point of Sale has access to this endpoint"* | `pushChannelOrder` — **blocked (B1)** |
| `POST /api/pos/restaurant/{id}/connect_channel` | `channel_type` enum `[ONLINE_ORDERING]`, `store_id` | 200 (done 2026-09-20) | `orderout-onboard` follow-up |
| `POST /api/channel/{id}/connect_pos` | Channel-side mirror: `pos_type` enum `[CLOVER]`, `pos_uuid` | not called | — |
| `POST /api/channel/order/{id}/mark-ready` | Mark an **OrderOut order id** ready; async 202 | exists (JSON 404 on unknown id) | relay (marketplace only today) |
| `POST /api/channel/order/{id}/cancel` | Cancel **marketplace** order, `reason` enum `ITEM_UNAVAILABLE|STORE_CLOSED|TOO_BUSY|CUSTOMER_REQUEST|CANNOT_FULFILL` | exists | not for Direct (different object) |
| `POST /api/webhooks/push_order` | Register the one order webhook (`endpoint`, `method`, `authorization_header`); "register once, not per restaurant" | registered platform-wide at prod | `orderout-orders-webhook` |
| *Webhook Statuses* page | 11 delivery statuses `pending_assign … completed, cancelled` ("Can't be updated to this") | **no registration endpoint or payload documented anywhere** | `orderout_delivery_status_rank` — list matches 1:1 |
| `PUT /api/pos/order/status` | Accept/Reject with `order_id` = "ID you received in the `externalReferenceId` field" | — | confirms `externalReferenceId` is present on `received` echoes |
| `GET /api/pos/order` | List orders by `service_merchant_id` | "not found" for our restaurant id | not a status source |

## B. Claim-by-claim verification

| # | Claim I made | Docs say | Live says | Verdict |
|---|---|---|---|---|
| B1 | Push needs a CHANNEL-type key | No key-type note on Push Order; "Build a Channel integration" frames push as the channel's call; `pos_uuid` on Update Restaurant: *"Must use a POS type api-key"* → keys are typed | Bogus key: *"verify your Channel or Point of Sale has access to this endpoint"* → endpoint access is per integrator; our key passes auth but the store lookup fails | **Confirmed as a blocker; the exact fix (channel key vs. OrderOut binding the store to our POS integrator) is still OrderOut's answer** |
| NEW | — | Delivery Dispatch guide: quotes → **Create Order** (`/v2/delivery/orders`) with the quote id. This is a courier-only booking that never touches channels/stores | Route returns HTML 404 — **documented but not deployed** | **Ask OrderOut whether `/v2/delivery/orders` is coming / enabled per integrator.** If it goes live, the worker can call it instead of the channel push with ~40 lines changed (payload builder + id capture) and B1 disappears |
| D (push design) | Sending `delivery.quote_id` inside the channel push books the courier | *Order Payload Example*: `delivery: { quote_id }` "Optional, in case this order should automatically trigger a delivery order as well" | untestable (B1) | **Verified by docs** |
| B2 | No documented way to receive courier statuses | *Webhook Statuses* lists the statuses; *Configure Webhook* documents only `event: received` / `cancelled` order events; no delivery-status subscription endpoint | probes for `/api/webhooks/delivery*`, `/v2/delivery/webhooks`, `GET /v2/delivery/orders/{id}` all 404 | **Confirmed unknown** — our rank function already matches the documented 11 statuses exactly |
| F6 | Cancel 404 is ambiguous (wrong id vs. already gone) | Cancel Order documents 404 only as "not found" | any unknown id → `{"reason":"Order not found"}` | **Confirmed** — 404 must not be treated as success until the id source is proven; recommendation upgraded to "do it now" |
| — | Which id does cancel want? | Cancel path is `/v2/delivery/orders/{order_id}`; Create Order's response `id` is that delivery order id | Create Order isn't live and Push returns `{}` | **Open**: after a channel push with `quote_id`, nothing documented returns the delivery order `id`/`tracker_id`. Must ask OrderOut whether the echo (or anything) carries it |
| F8 | Quote lifetime unknown | Get Quotes documents no TTL / expiry field; response is `id, provider, price, pickup_mins_from_now, delivery_mins_from_now` | live adds `unit:"cent"` | **Confirmed unknown** — ask |
| F16 | Driver tip semantics | Push has both `staffTip` and `driverTip`; Create Order has `driver_tip` "Order driver tip" with `unit` | — | **Docs confirm `driverTip` is the courier's tip, distinct from staff tip** → storing it in `orders.tip_amount` (staff gratuity) is wrong; keep the fix on the list |
| F15 | Echo matched only on `source.orderNumber` | *Configure Webhook* `received` example: `source.orderNumber` is the marketplace's number; `cancelled` example adds `source.externalReferenceId` | — | **Still undetermined** whether OrderOut preserves a channel's `orderNumber` on the echo; the secondary match is still worth adding |
| F20 | Item `price` vs modifiers | Example item: `price 11.90`, modifier `4.20`, `total 11.90`, `subtotal 18.09` — numbers don't reconcile either way | — | **Undetermined from docs**; ask |
| — | Push `total` formula | Example: `27.84 = 18.09 subtotal + 0.59 tax + 5.67 deliveryFee + 1.50 driverTip + 1.99 ooServiceFee` | — | **Verified**: our `total = subtotal + tax + deliveryFee + driverTip` (ooServiceFee 0) matches |
| — | Quote request field `restaurant_id` | Schema: `restaurant_id` required (the example body says `merchant_id`) | `restaurant_id` works | **Verified** |
| — | `dropoff_country` required | required per schema | `{}` → listed as missing | **Verified** — `normalizeDropoff` sets `USA` |
| — | Money unit | Quotes: `unit` present live (`cent`); Create Order: `unit` enum `cent|dollar` default `cent` | — | **Verified** — `QUOTE_DEFAULT_UNIT = 'cent'` |
| — | Webhook auth shape | `authorization_header` is a header object, e.g. `{"Authorization":"Bearer your-key"}` | — | **Verified** — matches our Bearer `ORDEROUT_WEBHOOK_SECRET` check |
| — | Webhook is platform-wide | POS guide: "register once… DO NOT register for each restaurant" | — | **Verified** |
| — | `connect_channel` shape | `channel_type` enum `[ONLINE_ORDERING]`, `store_id` string | 200 | **Verified** |
| — | Push response `{}` | documented `{}` for 200 and 400 | 400 carries a JSON `message` | **Verified** (extra detail on 400) |
| — | Mark-Ready for Direct | endpoint takes an OrderOut order id; nothing says whether Direct needs it | — | **Confirmed unknown** — ask |
| — | "Integrator types POS / CHANNEL / DELIVERY" (my earlier wording) | Docs verify **POS** ("POS type api-key") and **Channel** (bogus-key message, channel guide). "DELIVERY" is implied by the Delivery Dispatch guide, not stated | — | **Corrected**: say "POS and Channel integrators; delivery-dispatch integrations exist as a guide" |

## C. Questions for OrderOut (updated)

1. `POST /v2/delivery/orders` (Create Order) is documented but returns 404 — is it enabled per integrator, or not yet live? It removes the channel dependency entirely for us.
2. Otherwise: what does `/api/channel/order/push` need so that a POS-integrator key resolves the store we registered with `connect_channel(ONLINE_ORDERING)` — a Channel key, or a binding on your side?
3. After a channel push with `delivery.quote_id`, where do we get the delivery order `id` / `tracker_id` needed for `/v2/delivery/orders/{id}/cancel`?
4. How are the *Webhook Statuses* delivered (registration endpoint + sample payload)?
5. Quote lifetime; whether Mark-Ready is required for Direct; whether item `price` should include modifier prices.
