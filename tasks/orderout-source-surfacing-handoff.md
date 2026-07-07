# OrderOut order-source surfacing — PR / handoff notes

Surfaces the order channel (`order_source`) and delivery marketplace (`delivery_platform`)
across the web Orders list + Order Details, fixes the ingestion bug that mis-tagged online
orders, and adds channel/platform filters + a persisted column show/hide control.

## Changes

### Data layer (migrations — NOT yet applied; see "Apply" below)
- `supabase/migrations/20260702120000_online_order_source_platform.sql` (+ rollback) —
  `CREATE OR REPLACE process_online_order`: derives `order_source` from `p_provider`
  (`orderout`→`orderout`, `website`/`app`→`online_store`, never the invalid `'online'`) and
  populates `delivery_platform` = `p_delivery_company`, `platform_order_number` =
  `p_provider_order_id`. Includes an **idempotent backfill** of existing OrderOut + first-party
  rows and a filter index `idx_orders_source_platform (merchant_id, location_id, order_source,
  delivery_platform)`.
- `supabase/migrations/20260703120000_user_ui_preferences.sql` (+ rollback) — new per-user
  `user_ui_preferences` table (RLS: own rows only) backing the column show/hide preference.

### UI / app
- `lib/orderout/platform.ts` — shared vocabulary: labels, brand colors, **logo map**
  (`doordash`/`grubhub`/`ubereats`/`foodpanda`) with an unknown fallback, slug normalization,
  and the `order_source` channel taxonomy. Online-ordering report refactored to consume it.
- `components/dashboard/orders/PlatformBadge.tsx` — logo (or brand-dot fallback) + name.
- `OrdersDataTable.tsx` — **Channel** column (logo+name for OrderOut; icon+label otherwise;
  legacy `metadata.provider` fallback) + **Columns** show/hide menu (`#ID` non-hideable).
- `OrderDetailSheet.tsx` — header platform chip + **Delivery/Channel** section (source,
  platform, platform #, external ref, delivery address+notes, est. times); hidden for POS.
- `OrderFilters.tsx` + `orders/page.tsx` + `actions/order.ts` — server-side **Channel** +
  **Platform** filters; Platform is disabled unless the OrderOut channel is selected.
- `app/dashboard/actions/user-ui-preferences.ts` + `hooks/useColumnPreferences.ts` — DB-backed
  per-user column persistence (localStorage as instant-paint cache + offline fallback).
- `types/order-management.ts` — added `order_source`, `delivery_platform`,
  `platform_order_number`, `metadata`, `delivery_address`, `estimated_delivery_time`,
  and the `orderSource`/`deliveryPlatform` filter fields.

## Implementation notes reconciled (from ticket)
- **order_source type verified (static):** plain `text` (schema.sql:2896 + remote_schema DDL),
  **not an enum** — no `CREATE TYPE order_source` exists. Backfill to `'orderout'`/`'online_store'`
  is safe. (Temur: still eyeball live before running, per playbook.)
- **Existing index:** `idx_orders_order_source_created (order_source, created_at)` already exists
  (remote_schema:38917); the new `idx_orders_source_platform` is complementary (adds
  merchant/location scope + platform), not a duplicate.
- **Reporting consistency:** reporting's "channel" IS `order.order_source`
  (order-full-history.ts:230). Fixing the column at the RPC/backfill makes list filters and
  reports read the same value — consistent by construction.
- **Logos:** map lives in `lib/orderout/platform.ts` with unknown fallback. `food-panda.png` is
  wired but the asset is not yet in `/public` — drop it in to light up (falls back to brand dot
  meanwhile). `doordash/grubhub/uber-eats` present.

## Apply (BLOCKED locally — Docker Desktop engine is 500-ing on this machine)
1. Apply both migrations to **staging** first (payment-adjacent `orders` — coordinate the
   backfill with Temur per the Database Migration Playbook).
2. `npx supabase gen types` → regenerates `database.types.ts` (adds `user_ui_preferences`,
   `orders.order_source/delivery_platform/platform_order_number`).
3. Verify `#0001` / `oo_test_order_5aea4`: `order_source='orderout'`,
   `delivery_platform='Grubhub'`, `platform_order_number` populated; re-run migration → backfill
   is a no-op (idempotent).
4. Promote staging→prod.

## Verification status
- ✅ Typecheck clean across all touched/new files (server client is untyped, so the
  not-yet-generated table compiles fine).
- ✅ Migration structure validated (function arity, 4 RLS policies, trigger).
- ⏳ Live apply + browser test blocked on Docker/staging (do the "Apply" steps above). Browser
  test under a **real single-location merchant login**, not impersonation.

## Known gap (out of scope — accepted)
- **Phone-in `order_source='phone'`**: taxonomy value is documented but **no code path creates a
  phone order** in this repo. UI renders it correctly if such a row exists; producing the row is
  upstream (POS tablet / future phone-in flow), not this web ticket. Acceptance criterion 3:
  `pos` ✅, `online_store` ✅, `phone` pending upstream.
