# OrderOut Integration — Developer Handoff

_Last updated: 2026-07-21. Scope: how Dexa POS integrates with OrderOut, the current state, and known gaps._

---

## 1. TL;DR

**OrderOut** is a middleware aggregator that connects one restaurant to the delivery marketplaces (**UberEats, DoorDash, Grubhub**). Instead of integrating with each marketplace directly, Dexa talks to OrderOut, and OrderOut fans out to the platforms.

There are **three flows**:

1. **Menu → out:** Dexa pushes a menu to OrderOut, which distributes it to each connected channel.
2. **Orders → in:** A customer orders on UberEats/DoorDash → OrderOut → webhook into Dexa → an order appears on the POS/KDS.
3. **Availability (86) → out:** When an item runs out, Dexa tells OrderOut to mark it "Sold Out" so it stops selling on the marketplaces.

Everything is scoped **per location**. OrderOut serves **one menu per store** (the "primary online menu").

---

## 2. Architecture at a glance

```
                        DEXA POS (this app)
                                │
     ┌──────────────────────────┼───────────────────────────┐
     │ MENU OUT                  │ ORDERS IN                  │ 86 / AVAILABILITY OUT
     ▼                           ▲                            ▼
 pushMenuToOrderOut()      orderout-orders-webhook      snooze RPC (item/modifier/category)
     │  POST/PUT /menu           ▲ (Edge Function)            │
     ▼                           │                            ▼  (DB trigger, any origin)
 pushMenuToConnectedChannels()   │                     /api/internal/orderout-resync
     │  POST /push_channels       │                            │  (or surgical PUT /item/{id}/suspension)
     ▼                           │                            ▼
 ┌───────────── OrderOut (api.orderout.co) ─────────────────────┐
 │  async fan-out          async order events        suspension │
 └───┬─────────────┬─────────────┬──────────────────────────────┘
     ▼             ▼             ▼
  UberEats      DoorDash      Grubhub
     │             │             │
     └── push results ──► orderout-push-menu-webhook (Edge Fn) ──► platform_statuses
```

Two "directions" of webhooks come **back** from OrderOut:
- **`orderout-push-menu-webhook`** — per-channel results of a menu push (UberEats ok, DoorDash failed, …).
- **`orderout-orders-webhook`** — a new/cancelled delivery order.

---

## 3. Core concepts (read these first)

| Concept | What it means |
|---|---|
| **Per-location** | All OrderOut state hangs off a `location`. One `orderout_restaurants` row per location. |
| **Primary online menu** | OrderOut serves ONE menu per store. A location can have several internal menus, but exactly one `orderout_menu_links` row is `is_primary = true`. All publishes and 86-repushes target **only** that menu. Resolved by `resolvePrimaryOnlineMenu()`. Enforced by a partial unique index. |
| **Channels / platforms** | UBEREATS / DOORDASH / GRUBHUB. Two sources of truth for "which channels exist": webhook-verified (`connected_channels`) and merchant self-attested (`channels_confirmed_by_merchant`). The push fan-out targets the **union**. |
| **Suspension (86)** | Items are kept on the menu but marked "Sold Out" via a `suspend_until` unix timestamp. Modifiers/categories have no per-entity suspend API, so they're handled by a full menu re-push. |
| **pos_uuid** | `orderout_restaurants.pos_uuid` = the location id. OrderOut routes inbound order webhooks by this — it MUST match what was sent at onboarding. |

---

## 4. Data model (the `orderout_*` tables + order bridge)

Schema in `schema.sql`; generated types in `database.types.ts`.

| Table | Purpose | Key columns |
|---|---|---|
| **orderout_accounts** | One OrderOut account per merchant | `merchant_id` (unique), `oo_account_id`, `status`, `raw_response` |
| **orderout_restaurants** | One OrderOut restaurant per location | `location_id` (unique), `oo_restaurant_id`, `pos_uuid` (unique), `status` (pending/active/paused/error), `connected_channels` (jsonb, webhook-verified), `channels_confirmed_by_merchant` (text[]), `auto_accept_orders`, `is_accepting_orders`, `prep_time_minutes`, `use_delivery_pricing`, `merchant_id` (denormalized for RLS) |
| **orderout_menu_links** | Links a Dexa menu ↔ an OrderOut menu; per-channel push status | `menu_id`, `oo_menu_id`, `is_primary` (the canonical online menu), `is_active`, `platform_statuses` (jsonb: `{UBEREATS:{success,last_updated,error}, …}`), `last_pushed_at`, `last_sync_id` |
| **orderout_menu_syncs** | Ledger of every menu push (and channel fan-out) | `menu_id`, `oo_menu_id`, `sync_direction` (push / push_channels), `sync_status` (pending/syncing/success/failed/partial), `items_synced`, `items_failed`, `error_details`, `menu_payload_snapshot` (jsonb — used for the out-of-sync diff), `expected_channels`, `synced_at` |
| **orderout_menu_sync_results** | Per-channel result ledger for a push_channels sync (idempotent) | `sync_id`, `delivery_service`, `status`, `status_code`, `error_message`, `raw_response` |
| **online_orders** | **Operative bridge** between a Dexa `orders` row and the provider order (written by `process_online_order`) | `order_id`, `provider` (enum: orderout/website/app/…), `provider_order_id` (unique per provider — idempotency key), `delivery_company`, `provider_status`, `provider_metadata`, `raw_payload` |
| **webhook_dead_letter_queue** | Failed inbound webhooks for HQ replay | payload + replay tracking |

> ⚠️ **Schema-drift note:** `schema.sql` also defines an `orderout_orders` table (with `accept_status`, `oo_order_number`, etc.). The **live inbound path writes `online_orders`** (via `process_online_order`), not `orderout_orders`. Before building on the orders side, confirm which table is authoritative in the deployed DB — treat `online_orders` as the source of truth for now.

---

## 5. Flow 1 — Onboarding & channel connection

**UI:** `app/dashboard/online-ordering/` (OrderOut tab) → `components/dashboard/orderout/OrderOutOnboardingForm.tsx`
**Action:** `onboardOrderOut()` in `app/dashboard/actions/orderout.ts`
**Edge fn:** `supabase/functions/orderout-onboard/index.ts`

1. Merchant fills the onboarding form (restaurant name, address, manager contact).
2. `onboardOrderOut()` → invokes the `orderout-onboard` edge function (service-role).
3. Edge fn calls OrderOut **`POST https://api.orderout.co/api/onboarding/`** (with Dexa's billing account + `pos_uuid = location_id`), retries on 5xx/429.
4. On success, writes `orderout_accounts` + `orderout_restaurants` and returns the OrderOut dashboard URL.

**Connecting channels (2 ways, unioned):**
- **Webhook-verified** — after a successful menu push to a platform, `orderout-push-menu-webhook` merges the result into `orderout_restaurants.connected_channels`.
- **Merchant self-attest** — `ChannelSelfConfirmCard.tsx` → `setOrderOutChannelsConfirmed()` writes `channels_confirmed_by_merchant`. This unblocks "Push to Channels" on day 1 before any webhook has fired (solves the chicken-and-egg).

Helpers: `extractConnectedPlatforms()`, `extractChannelStatuses()`, `normalizeDeliveryChannels()` in `lib/orderout/helpers.ts`.

---

## 6. Flow 2 — Menu push → channels

**Actions (all in `app/dashboard/actions/orderout.ts`):**

1. **`pushMenuToOrderOut()`** — builds the payload from `get_menu_with_categories` via `transformMenuToOrderOut()` (`lib/orderout/transform-menu.ts`), then:
   - First push: `POST {NEXT_PUBLIC_ORDEROUT_API_URL}/pos/restaurant/{oo_restaurant_id}/menu`
   - Update: `PUT …/menu/{oo_menu_id}`
   - Records an `orderout_menu_syncs` row + upserts `orderout_menu_links` (stores the returned `oo_menu_id` + `menu_payload_snapshot`).
2. **`pushMenuToConnectedChannels()`** — `POST …/menu/{oo_menu_id}/push_channels`. OrderOut queues an **async** fan-out to each expected channel and returns immediately. Throttled (30s min between pushes, 5/hr) unless `skipCooldown: true`. Records a `push_channels` sync with `expected_channels`.
3. **`publishOnlineMenu()`** — the foolproof one-click: always targets the **primary** menu (`resolvePrimaryOnlineMenu`), not whatever the caller passed.

**Async results:** `orderout-push-menu-webhook` receives per-channel callbacks → RPC `correlate_push_channels_callback()` correlates them to the pending sync, writes `orderout_menu_sync_results`, recomputes `sync_status` (success / partial / failed / syncing), and merges `platform_statuses` + `connected_channels`.

**"Out of sync" badge** (in the menu OrderOut tab):
- `getOrderOutMenuSyncStatus()` → last sync + per-platform status + history.
- `checkMenuPayloadDiff()` → transforms the current menu and compares (via `canonicalStringify`) against the last successful `menu_payload_snapshot`. `hasChanges` drives the badge.
- Hooks: `useOrderOutMenuSync`, `useMenuPayloadDiff`, and `invalidateOrderOutSync(queryClient)` — **any menu edit that affects the payload must call `invalidateOrderOutSync` or the badge goes stale.**

---

## 7. Flow 3 — Inbound delivery orders

**Edge fn:** `supabase/functions/orderout-orders-webhook/index.ts` (auth: `Authorization: Bearer {ORDEROUT_WEBHOOK_SECRET}`, constant-time compare).

1. OrderOut POSTs an order event (`received` or `cancelled`).
2. Look up `orderout_restaurants` by `pos_uuid` or `oo_restaurant_id`. (Miss → `webhook_dead_letter_queue`.)
3. Translate the payload → call RPC **`process_online_order()`** which, in one transaction:
   - Idempotency check on `online_orders(provider, provider_order_id)`.
   - Inserts `orders` (`order_source='orderout'`, `delivery_platform`, `external_id='orderout:{orderNumber}'`), `order_items` (+ modifiers), `order_payments`, `order_status_history`, and the `online_orders` bridge row.
   - **Menu-item matching:** OrderOut item `external_id` → Dexa `menu_item_id` (UUID extraction, name fallback; unmatched → open item + warning).
   - **Auto-accept + KDS mode:** if `orderout_restaurants.auto_accept_orders`, the order is born `sent_to_kitchen` (3-step KDS) or `preparing` (2-step KDS); otherwise `pending`.
4. **Cancellation** (`event='cancelled'`) → marks the order cancelled + notifies customer.

**Merchant accept/decline** (in-POS): RPCs `accept_online_order()` / `decline_online_order()` update local status + KDS. A DB trigger (`notify_order_status_change`, vault-configured) POSTs to `/api/internal/order-status-notify` for **customer email/SMS** — note this currently fires for **website** orders, not OrderOut orders.

---

## 8. Flow 4 — Availability / 86 (out-of-stock) propagation

86ing = a per-location **snooze**, deliberately orthogonal to the "hide item" (`is_available`) toggle. Stored as `snoozed_until` (`null` = live, future ts = timed, `'infinity'` = until-manual) on `location_item_overrides` / `location_modifier_item_overrides` / `location_category_overrides`. Folded into `get_menu_with_categories` → POS, storefront, and the OrderOut transform all respect it for free.

**How it reaches OrderOut:**
- **Items** — surgical `suspendOrderOutItem()`: `PUT …/menu/{oo_menu}/item/{menu_item_id}/suspension` with `{suspend_until}` (unix seconds; `0` = restore; `snoozeToSuspendUntil()` maps snooze→seconds). Falls back to a full re-push when the menu isn't live yet.
- **Modifiers & categories** — no per-entity suspend endpoint on OrderOut, so a full menu re-push (`triggerOrderOutFullResync`). Modifier options are **removed** from the payload; a snoozed category cascades "Sold Out" to its visible items.
- **Origin-agnostic backstop** — a DB trigger (`notify_item_snooze_change*` → `pg_net` → `/api/internal/orderout-resync`, vault-configured) re-pushes on **any** `snoozed_until` change, including a 86 done directly on the POS tablet.

**Recent overhaul (this branch — see §11):** optimistic UI (instant badge), non-blocking `after()` push, modifier duration parity, **batch 86** (one RPC + one resync), statement-level resync triggers, a failed-sync toast, and a "check live OrderOut menu" verify card.

---

## 9. Edge functions & internal routes

| Name | Path | Purpose |
|---|---|---|
| `orderout-onboard` | `supabase/functions/orderout-onboard/` | Register account + restaurant with OrderOut |
| `orderout-orders-webhook` | `supabase/functions/orderout-orders-webhook/` | Inbound delivery orders → `process_online_order` (`_index.ts` is a stale backup) |
| `orderout-push-menu-webhook` | `supabase/functions/orderout-push-menu-webhook/` | Per-channel push results → `correlate_push_channels_callback`, `platform_statuses`, `connected_channels` |
| `orderout-menu-webhook` | `supabase/functions/orderout-menu-webhook/` | OrderOut menu-confirmation callback (infra in place; item-suspension-back path not fully wired) |
| `/api/internal/orderout-resync` | `app/api/internal/orderout-resync/route.ts` | Called by the snooze DB trigger (pg_net). Re-pushes the primary menu + fans out. Auth: `x-internal-secret` = `INTERNAL_NOTIFICATION_SECRET` |
| `/api/internal/order-status-notify` | `app/api/internal/order-status-notify/route.ts` | Called by the order-status trigger. Sends customer email/SMS |

---

## 10. Config / env / secrets

| Var | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_ORDEROUT_API_URL` | Next (public) | OrderOut API base, e.g. `https://api.orderout.co/api` |
| `ORDEROUT_API_KEY` | Next (server) | `api-key` header for menu push / GET / suspension |
| `ORDEROUT_WEBHOOK_SECRET` | Edge fns | Bearer token to authenticate inbound OrderOut webhooks |
| `INTERNAL_NOTIFICATION_SECRET` | Next + DB | Shared secret for the internal resync / notify routes |
| Vault: `orderout_resync_url`, `internal_notification_secret` | Postgres (Supabase Vault) | Read by the snooze resync trigger. Set once via `vault.create_secret(...)` in the SQL editor. Trigger no-ops until these exist. |
| Vault: `order_status_notify_url` | Postgres | Read by the order-status trigger |

> The DB triggers read config from **Vault** (the `postgres` role can't `ALTER DATABASE … SET app.*` on Supabase). If a 86 doesn't reach delivery apps in an environment, first check these Vault secrets + `INTERNAL_NOTIFICATION_SECRET` are set there.

---

## 11. Current state — what works, what's in flight, gaps

**Working:**
- ✅ Onboarding, menu push, channel fan-out with async per-channel result tracking + out-of-sync badge.
- ✅ Inbound delivery orders → POS/KDS (auto-accept + KDS 2-step/3-step aware, idempotent, DLQ on failure).
- ✅ 86 propagation to OrderOut for items (surgical), modifiers & categories (full re-push), origin-agnostic via the DB trigger.

**Shipped on this branch (PR #244 / the 86 overhaul):**
- Optimistic 86 UI, non-blocking `after()` push, modifier snooze **durations**, **batch 86** (`set_items_snooze_batch_v1` + statement-level resync triggers), failed-sync toast, "check live OrderOut menu" verify card, and **category-level Sold Out** (PR #241).
- New migrations to apply: `20260720180000_category_86_snooze.sql`, `20260721120000_batch_snooze_and_statement_level_resync.sql`. Regenerate `database.types.ts` after applying (the `set_items_snooze_batch_v1` rpc call is untyped until then).

**Known gaps / follow-ups:**
1. **No outbound accept/decline callback to OrderOut.** When the merchant accepts/declines in the POS, Dexa updates locally but does **not** POST back to OrderOut, so the marketplace/customer isn't told. (Biggest gap — needs the OrderOut accept/reject endpoint + a trigger, mirroring the inbound pattern.)
2. **`online_orders.provider_status`** is only set at creation; not updated on status changes. Would become the "what OrderOut thinks" source of truth once outbound sync exists.
3. **No outbound retry / drift reconciliation** (inbound has a DLQ; outbound has nothing yet).
4. **OrderOut orders don't get customer notifications** via the status trigger (currently website-only).
5. **`orderout-menu-webhook`** item-suspension-back path is stubbed but not wired.
6. **Schema drift:** confirm `online_orders` vs `orderout_orders` authoritative table (see §4 note).
7. **Modifier/category 86 = full re-push** (OrderOut has no per-modifier/-category suspend API) — by design, but heavier than the item surgical path.

---

## 12. Key files quick-reference

| Area | File |
|---|---|
| All OrderOut server actions | `app/dashboard/actions/orderout.ts` |
| 86 / snooze actions | `app/dashboard/actions/item-snooze.ts`, `app/dashboard/actions/category-snooze.ts` |
| Menu → OrderOut transform | `lib/orderout/transform-menu.ts` (`snoozeToSuspendUntil`, `transformMenuToOrderOut`) |
| Channel/status helpers | `lib/orderout/helpers.ts` |
| Sync-status + diff hooks | `app/dashboard/hooks/useOrderOutMenuSync.ts` (`useOrderOutMenuSync`, `useMenuPayloadDiff`, `useOrderOutSyncAlerts`, `invalidateOrderOutSync`) |
| Online-ordering hooks | `app/dashboard/online-ordering/hooks/useOrderOutStatus.ts` |
| Snooze React-Query hooks | `lib/queries/use-snoozes.ts` |
| Verify live menu | `getOrderOutLiveMenu()` (orderout.ts) + `components/dashboard/menu/menuId/OrderOutLiveMenuCheck.tsx` |
| Edge functions | `supabase/functions/orderout-*/` |
| Internal routes | `app/api/internal/orderout-resync/`, `app/api/internal/order-status-notify/` |

---

## 13. How to test / verify

- **Menu push:** in the menu's **OrderOut tab**, publish; watch the sync badge go pending → success and per-channel statuses populate.
- **Verify a 86 landed:** OrderOut tab → **"Check live OrderOut menu"** — it GETs `…/menu/{oo_menu_id}` and shows each item's `suspend_until` (non-zero = sold out). Cross-check against `GET /reference/get-menu`.
- **Batch 86 fires one resync:** select several items → bulk "Mark out of stock" → confirm exactly **one** new `orderout_menu_syncs` row (statement-level trigger).
- **Failed sync surfaces:** `useOrderOutSyncAlerts` polls every 20s and toasts on a newly-failed sync.
- **Inbound order:** trigger a test order from OrderOut → confirm a row in `orders` (`order_source='orderout'`) + `online_orders`, and it shows on the POS/KDS.
- **DB checks:** `orderout_menu_syncs` (sync history/status), `orderout_menu_links.platform_statuses` (per-channel), `orderout_restaurants.connected_channels`.
