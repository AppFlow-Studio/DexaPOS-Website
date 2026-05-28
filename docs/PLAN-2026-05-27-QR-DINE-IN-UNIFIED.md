# QR Dine-In Unified Plan and Status

This document merges the old Track A and Track B tickets into one live implementation board.

Scope now owned here:
- backend foundation
- edge/storefront/dashboard integration
- dashboard-side merchant controls
- POS remains part of the feature, but a POS owner can help smoke test the tablet surfaces later

This file is the current source of truth.
Historical docs remain useful context only:
- `docs/PLAN-2026-05-20-QR-DINE-IN-FOUNDATION.md`
- `docs/PLAN-2026-05-22-QR-DINE-IN-TRACK-A.md`
- `docs/HANDOFF-2026-05-24-QR-TRACK-B-CREATE-ONLINE-ORDER.md`

## What Is Actually Finished Right Now

These are the parts that are genuinely implemented in repo or already reported as applied, even if the parent ticket item is not fully closable yet.

- [x] Wave 1 schema migration authored locally: `supabase/migrations/20260522120000_qr_w1_schema.sql`
- [x] Blue default cleanup migration authored locally: `supabase/migrations/20260522120500_qr_w1_primary_color_default_blue.sql`
- [x] User reported both Wave 1 migrations were run on staging
- [x] Wave 2 status + guest-alert RPC migration authored locally: `supabase/migrations/20260522133000_qr_w2_status_and_guest_alert_rpcs.sql`
- [x] Wave 2 token/signing + shared-generate + scan-bootstrap migration authored locally: `supabase/migrations/20260527160000_qr_w2_token_helpers_generate_and_resolve.sql`
- [x] QR billing-gate service-catalog seed migration authored locally: `supabase/migrations/20260528103000_qr_service_catalog_gate.sql`
- [x] `create-online-order` was extended locally for QR-aware checkout / order binding in `supabase/functions/create-online-order/index.ts`
- [x] Merchant dashboard online-ordering settings now include QR fields locally in:
  - `app/dashboard/online-ordering/actions.ts`
  - `app/dashboard/online-ordering/hooks/useOnlineOrderingSettings.ts`
  - `app/dashboard/online-ordering/page.tsx`
- [x] Merchant dashboard QR manager actions + UI are now authored locally in:
  - `app/dashboard/online-ordering/actions.ts`
  - `app/dashboard/online-ordering/components/QrTableManager.tsx`
  - `app/dashboard/online-ordering/page.tsx`
- [x] Merchant dashboard QR manager now has local asset export scaffolding in:
  - `app/dashboard/online-ordering/components/QrTableManager.tsx`
  - `app/sites/lib/store-url.ts`
  - uses the `qrcode` package for SVG / PNG / PDF generation
- [x] Merchant dashboard QR manager now opens the exact guest preview route locally through the shared QR table URL contract in:
  - `app/dashboard/online-ordering/components/QrTableManager.tsx`
  - `app/sites/lib/store-url.ts`
- [x] Merchant dashboard QR settings and QR manager now enforce a local billing gate using:
  - merchant tier status from `get_merchant_subscription_status`
  - service-catalog metadata from `billable_services`
  - location-level HQ override through `qr_table_ordering` service assignments
- [x] Order surfaces now recognize `qr_dine_in` locally in:
  - `types/order-management.ts`
  - `components/dashboard/orders/OrderFilters.tsx`
  - `components/dashboard/orders/OrdersDataTable.tsx`
  - `components/dashboard/orders/OrderDetailSheet.tsx`
  - `components/dashboard/orders/OrderDetailFullPage.tsx`
  - `components/dashboard/orders/analytics/OrderTypeFilter.tsx`
- [x] Merchant and HQ online-store tabs now share the same storefront URL builder, including custom-domain support
- [x] Merchant and HQ analytics breakdowns now treat `qr_dine_in` as a first-class order type instead of dropping it into generic labels or `Other`
- [x] Merchant dashboard fallback branding now uses brand blue `#0C4FD1` instead of the retired teal fallback in the online-ordering surface
- [x] Local payment-domain whitelist sync path is now authored in:
  - `lib/online-store/payment-domain-whitelist.ts`
  - `supabase/functions/storefront-payment-domain-whitelist/index.ts`
  - `app/manage/actions/admin-merchant/online-ordering.ts`
  - `app/dashboard/online-ordering/actions.ts`
  - active storefront/QR payment rail is NMI-only; the live whitelist path no longer consumes a Dejavoo-named env fallback
- [x] QR funnel event tracking is now authored locally in:
  - `app/sites/funnel-actions.ts`
  - `app/sites/hooks/useQrFunnelTracking.ts`
  - `app/sites/components/StorefrontLayout.tsx`
  - `app/sites/components/templates/HeroLayout.tsx`
  - `app/sites/components/templates/MarketLayout.tsx`
  - `app/sites/components/templates/BoutiqueLayout.tsx`
  - `app/sites/components/checkout/CheckoutPage.tsx`
  - `supabase/functions/create-online-order/index.ts`
- [x] QR abandoned-session tagging is now authored locally in:
  - `supabase/functions/process-abandoned-carts/index.ts`
- [x] Server-side order-placed notification trigger is now authored locally in:
  - `app/api/internal/order-placed-notify/route.ts`
  - `supabase/functions/create-online-order/index.ts`
- [x] QR storefront session bootstrap + locked-table UX are now authored locally in:
  - `app/sites/qr-actions.ts`
  - `app/sites/[slug]/t/[token]/page.tsx`
  - `app/sites/components/QrTableBanner.tsx`
  - `app/sites/components/StorefrontLayout.tsx`
  - `app/sites/components/templates/HeroLayout.tsx`
  - `app/sites/components/templates/MarketLayout.tsx`
  - `app/sites/components/templates/BoutiqueLayout.tsx`
  - `app/sites/components/checkout/CheckoutPage.tsx`
  - `app/sites/hooks/useSession.ts`
  - `app/sites/hooks/useSessionInit.ts`
  - `app/sites/session-actions.ts`
- [x] Guest `Call your server` UI is now authored locally in:
  - `app/sites/components/CallServerCard.tsx`
  - `app/sites/components/checkout/OrderConfirmation.tsx`
  - `app/sites/components/OrderTrackingPage.tsx`
  - `app/sites/qr-actions.ts`
- [x] Merchant dashboard recent-orders summary now shows QR/table identity locally in:
  - `app/dashboard/page.tsx`
- [x] Merchant dashboard QR analytics panel is now authored locally in:
  - `app/dashboard/online-ordering/actions.ts`
  - `app/dashboard/online-ordering/components/QrAnalyticsPanel.tsx`
  - `app/dashboard/online-ordering/page.tsx`

## What Is Not Safe To Fully Check Off Yet

These are the places where work exists, but the ticket item is not yet defensibly complete.

- Wave 1 schema still needs explicit staging validation:
  - `get_advisors(security)`
  - RLS smoke check
  - anon no-direct-row-access verification
- Wave 2 migrations are authored locally but not yet confirmed applied on staging
- `create-online-order` QR patch is local code only until deployed and tested
- Merchant dashboard QR settings and QR manager are implemented locally, but QR billing gate is only local until the new seed migration is applied and smoke tested; preview and live-order integrations are still open
- Merchant dashboard QR analytics panel is implemented locally, but it still depends on live `qr_scan_events` and `qr_dine_in` order data after deploy before the analytics ticket can be closed
- Shared generate/reprint/regenerate/export/preview is available in local code, but the exact guest route still is not deployed and smoke tested, so these flows are not safe to call finished until the scan flow is verified end to end
- QR storefront route, locked-table banner, and QR checkout suppression are now implemented locally, but they still need staging deploy plus real `resolve_table_qr` and `create-online-order` verification before the related ticket items are closable
- Payment-domain whitelist sync now exists locally, but it is still only safe to call `in progress` until the edge function is deployed and the QR/custom-domain checkout origins are validated against the real payment configuration

## Unified Ticket Status

| Item | Area | Status | Why it is in this state | Next step |
| --- | --- | --- | --- | --- |
| QR-1 | Backend | `staging_applied_needs_validation` | User reported Wave 1 migrations were run on staging; validation still missing | Run security advisors + RLS smoke test |
| QR-5 | Backend | `implemented_local_not_applied` | Vault-backed HMAC signing/verification migration is authored locally | Apply `20260527160000_qr_w2_token_helpers_generate_and_resolve.sql` on staging |
| QR-2 | Backend | `implemented_local_not_applied` | `resolve_table_qr(...)` is authored locally in the same migration | Apply `20260527160000_qr_w2_token_helpers_generate_and_resolve.sql` on staging |
| QR-4 | Backend | `implemented_local_not_applied` | Wave 2 migration exists locally | Apply `20260522133000_qr_w2_status_and_guest_alert_rpcs.sql` on staging |
| QR-24 | Backend | `blocked` | Depends on scan bootstrap + channel design | Implement after QR-2 contract is live |
| QR-2b | Backend | `implemented_local_not_applied` | Wave 2 migration exists locally | Apply `20260522133000_qr_w2_status_and_guest_alert_rpcs.sql` on staging |
| QR-19 | Backend / Billing | `implemented_local_not_applied` | QR Table Ordering service-catalog seed migration is authored locally and merchant QR settings/actions now enforce tier-or-override gating in code | Apply `20260528103000_qr_service_catalog_gate.sql` on staging, then smoke test merchant gating and HQ override |
| QR-22 | Backend | `staging_applied_needs_validation` | Migration exists and was reportedly run; needs smoke check | Verify new rows default to `#0C4FD1` |
| QR-28 | Backend | `not_started` | Tables exist in migration, but retention policy is not implemented | Add retention plan + enforcement |
| QR-6 | Edge | `implemented_local_not_deployed` | QR-aware order creation is patched locally | Deploy edge function + stage test |
| QR-7 | Edge | `implemented_local_not_deployed` | Auto-accept wiring is patched locally | Deploy edge function + stage test |
| QR-9 | Edge / Analytics | `in_progress` | Local funnel recorder now exists for `menu_viewed`, `cart_started`, `checkout`, and `paid`; still needs app + edge deploy and staging verification | Deploy app/edge changes and verify one full QR session populates the funnel |
| QR-25 | Edge / Receipt | `in_progress` | `create-online-order` now triggers internal order-placed notifications server-side and no longer relies on the checkout client to fire receipts; still needs edge + app deploy and staging verification | Deploy app/edge changes and verify one paid QR order sends the receipt exactly once |
| QR-9c | Edge / Broadcast | `blocked` | Depends on QR-2b live on staging | Wire live alert emit + count fallback |
| QR-8 | Edge / Analytics | `in_progress` | Expired QR session abandonment tagging now exists locally in `process-abandoned-carts`; still needs edge deploy and staging verification | Deploy the abandoned-cart worker and verify `abandoned` is inserted once per expired QR session |
| QR-32 | Payments | `in_progress` | Shared storefront-origin builder + local device whitelist sync path now exist for HQ and merchant saves; real deployed validation still remains open | Deploy `storefront-payment-domain-whitelist`, then verify QR/custom-domain checkout origins are persisted and accepted in staging |
| QR-26 | Storefront | `in_progress` | Shared URL builder now supports custom domains across merchant/HQ surfaces, the storefront path helper no longer hardcodes `dexaposai.com`, and the dynamic `/sites/[slug]/t/[token]` route now exists locally; still needs staging verification against real QR tokens and rewritten hosts | Deploy app changes and smoke test QR scans on slug, subdomain, and custom-domain storefronts |
| QR-10 | Storefront | `in_progress` | Table-bound scan entry now seeds a QR session, renders a locked `Ordering for Table N` banner across layouts, and suppresses non-QR entry flow locally; still needs staging verification with `resolve_table_qr` live | Deploy app changes and verify scan → locked menu flow on staging |
| QR-11 | Storefront | `in_progress` | Checkout now detects QR table mode locally, forces the runner-delivery/pickup path, suppresses the standard order-type selector, and blocks cash-in-store; still needs edge deploy and one full QR checkout verification | Deploy app + edge changes and verify one paid QR checkout end to end |
| QR-12 | Storefront | `blocked` | Depends on QR-4 + QR-24 | Build live status screen |
| QR-13 | Storefront | `in_progress` | The QR route now has a friendly unavailable screen and surfaces `next_open` when returned by `resolve_table_qr`; broader closed/blocked polish still remains open | Deploy app changes and verify invalid, rotated, kill-switched, and outside-hours QR states |
| QR-33 | Storefront | `not_started` | Depends on QR-10 | Do accessibility + i18n pass |
| QR-12b | Storefront | `in_progress` | Guest `Call your server` card now exists locally on both confirmation and live order surfaces, with optional note input and client cooldown; still needs the QR guest-alert RPC migration applied and an end-to-end staging raise verification | Apply the guest-alert migration, deploy app changes, and verify one tap raises exactly one open alert |
| QR-14 | Dashboard | `in_progress` | QR settings now exist locally in merchant online-ordering page and the merchant surface respects the local QR billing gate; preview/export and broader QR manager dependencies are still open | Apply the QR gate seed migration, then smoke test locked vs entitled branches |
| QR-15 | Dashboard | `in_progress` | Merchant QR code manager UI + actions are authored locally, including guest preview through the shared table URL contract; staging validation is still open | Apply shared generate/resolve migration, then smoke test dashboard generate/regenerate/revoke/preview |
| QR-16 | Dashboard | `in_progress` | Merchant QR manager now has local SVG / PNG / PDF tent export and print scaffolding, but the exact guest route and exported assets still need end-to-end validation | Smoke test generated assets against the live QR route once `resolve_table_qr` is applied |
| QR-17 | Dashboard | `in_progress` | Orders table/detail surfaces already render QR dine-in distinctly, and the merchant dashboard recent-orders summary now carries an explicit QR/table badge plus floor-plan link; real staging QR orders still need to verify the summary and list surfaces together | Smoke test QR badges and floor-plan jump from real QR orders |
| QR-34 | Dashboard | `in_progress` | Merchant QR analytics panel is now authored locally, but it still depends on deployed funnel/order data before it is defensibly complete | Deploy app/edge changes and verify QR funnel, AOV, top-table, and top-item cards populate from live staging data |
| QR-18 | POS | `blocked` | Depends on QR-2 + QR-5 + QR-15 | POS owner can help test later |
| QR-18b | POS | `blocked` | Depends on QR-7 | POS owner can help test later |
| QR-18c | POS | `blocked` | Depends on QR-2b + QR-9c | POS owner can help test later |
| QR-30 | QA / Validation | `blocked` | Depends on real QR orders end to end | Validate pricing/tax against live QR flow |
| QR-31 | QA / Validation | `blocked` | Depends on real QR orders end to end | Validate refund path |
| QR-9b | QA / Validation | `blocked` | Depends on real QR orders end to end | Validate loyalty accrual |
| QR-21 | QA | `blocked` | Final integrated closeout only | Run 22-row matrix at the end |

## Current Dashboard-Side Progress

These are the dashboard-side changes now in repo locally.

### Merchant online-ordering settings path
- QR-specific fields added to the client settings model:
  - `acceptsDineIn`
  - `qrFulfillmentMode`
  - `qrGeofenceEnabled`
  - `qrServiceFeePct`
  - `qrKillSwitch`
- Server load/save mapping added to the existing `online_store_config` settings path
- Merchant UI now exposes a QR section in the existing `Ordering` tab
- Merchant UI now receives QR entitlement state with the normal settings payload
- Merchant save actions now reject QR-enable changes unless the branch qualifies by tier or has an HQ override assignment
- Merchant and HQ storefront save paths now attempt payment-domain whitelist sync against the active online-ordering payment device and surface a warning toast if the sync is skipped or degraded
- This reuses the existing online-ordering maintenance surface instead of inventing a parallel QR settings page

### Merchant QR code manager
- Merchant dashboard now has a QR table manager under the same online-ordering surface
- It currently supports:
  - refresh snapshot
  - generate missing QR codes
  - generate/reprint per table
  - regenerate per table
  - revoke per table
  - preview guest view per table
  - grouped table status by zone
  - lifetime and 7-day scan visibility from existing QR tables/events
- It now also supports local asset actions per generated table:
  - download SVG
  - download PNG
  - download PDF table tent
  - open print-ready PDF tent
  - DEXA vs merchant text-branding mode for exported assets
- Generate/reprint/regenerate actions now also respect the same QR billing gate server-side
- Guest preview now opens locally from the manager using the same shared QR URL contract as the exported assets. It still is not safe to claim done until the final guest QR route is smoke tested end to end on staging.
- The QR analytics period toggle and the QR manager merchant/DEXA switch now use the app primary color token instead of a separate hardcoded blue.
- The QR manager now also warns when the main online store is disabled, because QR preview/guest scans require both `is_active = true` and `accepts_dine_in = true`.

### What this dashboard slice does not solve yet
- live-orders QR badge
- fleet/HQ QR analytics roll-up
- guest scan flow itself
- guest preview route itself

### Payment-domain sync
- Shared storefront-origin computation now exists for:
  - default slug host
  - custom domain host
- HQ and merchant save flows now invoke the same sync helper after storefront changes
- The edge function currently owns:
  - origin normalization
  - merge with existing device origins
  - merge with optional generic/NMI default-allow env lists
  - persistence into `location_payment_devices.whitelist_origins`
  - update of `whitelist_synced_at`
- Active env inputs for this path are now:
  - `STOREFRONT_PAYMENT_DEFAULT_ALLOWED_ORIGINS`
  - `PAYMENT_DEFAULT_ALLOWED_ORIGINS`
  - `NMI_DEFAULT_ALLOWED_ORIGINS`
- This is still not the same thing as a production acceptance pass. It needs deploy + runtime verification before `QR-32` can be checked off.

### QR funnel analytics
- Storefront now has a shared QR funnel tracker hook so the classic, hero, market, and boutique layouts all emit the same guest stages
- The guest-facing stages now record through a server action:
  - `menu_viewed`
  - `cart_started`
  - `checkout`
- `create-online-order` now inserts the `paid` stage server-side for table-bound QR sessions after the order is successfully created
- The event path is session-token based and keeps anon users off direct `qr_scan_events` row access
- Dedupe is currently enforced in code per `online_order_session_id + stage` so repeated renders or retries do not spam the funnel
- This is still not safe to check off until the app and edge changes are deployed and one QR session is verified end to end

### Merchant QR analytics panel
- The merchant online-ordering `Ordering` tab now includes a dedicated QR analytics panel
- It currently summarizes:
  - 7-day / 30-day QR funnel counts
  - conversion and abandonment rates
  - QR revenue and QR AOV
  - server-led dine-in AOV comparison
  - repeat-phone rate
  - peak scan hours
  - top QR tables
  - top QR items
- The panel currently reads from:
  - `qr_scan_events`
  - `orders` where `order_type = 'qr_dine_in'`
  - `orders` where `order_type = 'dine_in'` for the server comparison baseline
- Scan table labels are resolved through `table_qr_codes`, not from a nonexistent `qr_scan_events.table_label` column.
- This is still not safe to check off until the app and edge changes are deployed and the panel is verified against real staging QR data

### QR abandoned-cart analytics
- `process-abandoned-carts` now separately scans for expired QR-bound sessions with cart data and no order
- It inserts `qr_scan_events(stage='abandoned')` once per `online_order_session_id`
- This does not depend on the recovery-email path, so QR abandonment still records even when the session never had an email address
- The response payload now reports `qr_abandoned_logged` for easier staging verification
- This is still not safe to check off until the worker is deployed and an expired QR session is verified in staging

### QR receipt trigger
- `create-online-order` now triggers order-placed notifications server-side through an internal route authenticated by `INTERNAL_NOTIFICATION_SECRET`
- The storefront checkout page no longer fires `notifyOrderPlaced(...)` after success, which removes the risk of duplicate receipts once the edge path is live
- This uses the existing `sendOrderPlacedNotifications(...)` infrastructure instead of inventing a separate QR-only receipt path
- This is still not safe to check off until app + edge deploy are done and a paid QR order confirms a single email/SMS send in staging

### QR storefront route and locked-table mode
- The storefront now has a dedicated QR scan entry route at:
  - `app/sites/[slug]/t/[token]/page.tsx`
- That route calls the shared `resolve_table_qr(...)` backend contract through:
  - `app/sites/qr-actions.ts`
- Successful scans now seed a client QR session before the generic anon session bootstraps, which preserves:
  - `session_token`
  - `floor_plan_object_id`
  - `table_label`
  - `table_qr_code_id`
- The menu surfaces now render a persistent locked-table banner across:
  - classic
  - hero
  - market
  - boutique
- Checkout now recognizes QR table mode and:
  - forces the pickup/runner-delivery path
  - suppresses the regular order-type selector
  - suppresses cash-in-store
  - keeps the table immutable in the guest flow
- This is still not safe to check off until the app is deployed and a real staging scan confirms the route works under middleware/subdomain/custom-domain rewriting

### Guest `Call your server` surface
- A shared guest-help card now exists at:
  - `app/sites/components/CallServerCard.tsx`
- It is currently mounted on:
  - order confirmation
  - live order tracking
- The UI uses the existing QR session token and table context, and it currently provides:
  - optional guest note
  - calm confirmation toast
  - client cooldown to discourage rapid re-fire
- The server action path now calls the Track A RPC contract:
  - `raise_qr_guest_alert(session_token, 'call_server', optional_message)`
- This is still not safe to check off until the guest-alert RPC migration is applied and the alert is verified end to end against the cashier/KDS surfaces

### Order surfaces
- Orders filter now includes `QR Dine-In`
- Orders table shows:
  - QR dine-in label
  - table number subline
  - `View on Floor Plan` action
- Order detail sheet and full page now:
  - label QR dine-in correctly
  - preserve QR table context
  - allow `View on Floor Plan` from QR orders
- Merchant and HQ analytics/reporting surfaces now:
  - include `QR Table` in order-type breakdowns
  - keep QR dine-in out of generic `Other` buckets in the net-collected source report
- Merchant dashboard home now also surfaces QR identity in `Recent Orders`:
  - blue `QR Table` badge
  - table number badge
  - direct `View on floor plan` link
- Merchant orders page overview now also surfaces QR table activity:
  - dedicated `QR Table` stat card
  - range-based QR order count
  - most active table label

## Recommended Next Order From Here

1. Apply Wave 2 migrations on staging:
   - `supabase/migrations/20260522133000_qr_w2_status_and_guest_alert_rpcs.sql`
   - `supabase/migrations/20260527160000_qr_w2_token_helpers_generate_and_resolve.sql`
2. Apply the QR gate seed migration on staging:
   - `supabase/migrations/20260528103000_qr_service_catalog_gate.sql`
3. Deploy `create-online-order`
4. Smoke test dashboard QR generation/regeneration/revoke on staging
5. Smoke test locked vs entitled merchant QR settings on staging
6. Smoke test QR-aware order creation on staging once a table-bound session can exist
7. Continue storefront/dashboard work in this order:
   - `QR-12`
   - `QR-17`
   - deeper `QR-34` refinement only after live data is flowing
   - keep `QR-32` open until deployed validation is recorded

## Immediate Commands / Actions Still Needed

### Staging DB
- Apply:
  - `supabase/migrations/20260522133000_qr_w2_status_and_guest_alert_rpcs.sql`
  - `supabase/migrations/20260527160000_qr_w2_token_helpers_generate_and_resolve.sql`
  - `supabase/migrations/20260528103000_qr_service_catalog_gate.sql`
- Run and record:
  - `select * from get_advisors('security');`
  - manual RLS smoke checks for the new QR tables

### Edge deploy
```bash
npx supabase@latest functions deploy create-online-order --project-ref dfwqakoyittmrwbqvxgw
npx supabase@latest functions deploy storefront-payment-domain-whitelist --project-ref dfwqakoyittmrwbqvxgw
npx supabase@latest functions deploy process-abandoned-carts --project-ref dfwqakoyittmrwbqvxgw
```

### HMAC / rotation follow-up
Current secret has been handed off and the migration expects:
- Vault secret name `qr_hmac_secret_current`
- Vault secret name `qr_hmac_secret_previous` for the dual-secret grace window

Still confirm operationally:
- whether previous secret should stay blank for now
- exact secret rotation procedure
- when `token_version` should be bumped on active printed codes

## Staging Test Checklist

Run these after the DB migrations, edge deploys, and app deploy are complete.

### 1. Backend security and setup
- [ ] `select * from get_advisors('security');` returns no new QR-specific issues
- [ ] `table_qr_codes` exists and RLS is enabled
- [ ] `qr_scan_events` exists and RLS is enabled
- [ ] `qr_guest_alerts` exists and RLS is enabled
- [ ] anon cannot directly read the QR tables
- [ ] `public.qr_get_vault_secret('qr_hmac_secret_current')` returns a value
- [ ] `public.qr_get_vault_secret('qr_hmac_secret_previous')` is either blank by design or present for rotation

### 2. Merchant QR settings and billing gate
- [ ] open merchant `Online Ordering -> Ordering`
- [ ] verify QR settings section renders
- [ ] verify QR manager renders
- [ ] use a non-entitled merchant/location and confirm QR enable is blocked with the gate message
- [ ] use an entitled merchant/location and confirm QR enable can be saved
- [ ] use an HQ override location and confirm QR enable can be saved even when the merchant tier alone would block it
- [ ] confirm save attempts run the storefront payment-domain whitelist sync path without Dejavoo UI references

### 3. QR manager actions
- [ ] `Generate Missing` creates codes for tables without active QR codes
- [ ] per-row `Generate` works for a not-yet-generated table
- [ ] per-row `Reprint` works for an active table
- [ ] per-row `Regenerate` rotates the token and returns a fresh QR
- [ ] per-row `Revoke` disables the active code
- [ ] `Preview guest view` opens the guest route for the selected table
- [ ] `Download SVG` works
- [ ] `Download PNG` works
- [ ] `Download PDF Tent` works
- [ ] `Print PDF Tent` opens the printable PDF

### 4. QR resolve and storefront routing
- [ ] a valid QR preview/scan loads `/sites/[slug]/t/[token]`
- [ ] the route works for slug/default host
- [ ] the route works for subdomain host if used in your environment
- [ ] the route works for a configured custom domain if available
- [ ] the guest sees the locked `Ordering for Table N` banner
- [ ] the guest cannot change the table binding
- [ ] the regular pickup/delivery selector is suppressed in QR mode

### 5. QR checkout and order creation
- [ ] QR checkout requires phone number
- [ ] QR checkout blocks cash-in-store
- [ ] paid QR checkout succeeds once
- [ ] created order has `order_type = 'qr_dine_in'`
- [ ] created order has `orders.table_number = session.table_label`
- [ ] created order has `orders.online_session_id` set
- [ ] `orders.session_id` remains `NULL`
- [ ] customer is deduped by phone instead of duplicated
- [ ] QR service fee is reflected when configured

### 6. Auto-accept and incoming-order behavior
- [ ] with `auto_accept_orders = true`, paid QR order advances through accept flow automatically
- [ ] with `auto_accept_orders = false`, paid QR order remains pending for the incoming-order path
- [ ] retrying a failed/declined QR payment does not double-create or double-fire

### 7. Receipt and notification behavior
- [ ] a paid QR order sends a receipt exactly once
- [ ] no duplicate receipt is sent from the checkout client
- [ ] notification behavior respects the current notification configuration

### 8. Guest alert flow
- [ ] `Call your server` card appears on order confirmation
- [ ] `Call your server` card appears on live order tracking
- [ ] one tap raises exactly one open alert
- [ ] repeated taps during cooldown do not create duplicates
- [ ] optional guest message is preserved
- [ ] resolution path clears the alert after the staff-side action

### 9. Analytics and funnel
- [ ] a scanned session creates `qr_scan_events(stage='scanned')`
- [ ] menu entry creates `menu_viewed`
- [ ] first meaningful cart interaction creates `cart_started`
- [ ] checkout entry creates `checkout`
- [ ] successful order creation creates `paid`
- [ ] expired unpaid QR session creates `abandoned`
- [ ] merchant QR analytics panel shows live QR data after one or more test sessions
- [ ] merchant orders overview shows QR Table counts / most active table

### 10. Order and dashboard surfaces
- [ ] merchant dashboard `Recent Orders` shows QR badge and table badge
- [ ] merchant orders table shows QR dine-in label
- [ ] order detail sheet/page shows QR table context
- [ ] `View on floor plan` appears for QR orders where expected
- [ ] HQ merchant order surfaces also label `QR Table` correctly

### 11. Failure and closed-state checks
- [ ] invalid token returns a friendly unavailable state
- [ ] revoked token returns a friendly unavailable state
- [ ] kill switch returns a friendly unavailable state
- [ ] outside-hours flow shows the closed message and `next_open` when available
- [ ] payment-domain whitelist sync failure degrades with a clear warning, not a silent save

### 12. Final integrated closeout
- [ ] repeat scan of the same table starts a fresh independent order
- [ ] multiple QR orders on the same table remain independent
- [ ] QR analytics and QR orders do not seize or flip the normal dining/table-session state
- [ ] QR/order/dashboard work is stable enough to begin the full `QR-21` matrix

## POS Smoke Tests

This section is separate on purpose.

Current state:
- backend, storefront, and dashboard scenarios above can be tested from this branch
- POS tablet scenarios below should only be run if the POS owner has the QR tablet surfaces on the device/app build being tested
- do not treat POS checks as a blocker for dashboard/storefront verification if the POS branch is not merged yet

### POS prerequisites
- [ ] the POS build being tested includes the QR table bottom-sheet actions
- [ ] the POS build being tested includes the incoming QR tray behavior
- [ ] the POS build being tested includes the guest alert bell behavior
- [ ] the same staging database and edge deploys from this document are in use

### POS table bottom-sheet checks
- [ ] open a table bottom-sheet in POS
- [ ] verify `Print QR Code` is present
- [ ] verify first-time generate works when no code exists
- [ ] verify reprint works when a code already exists
- [ ] verify `Regenerate QR` shows the destructive warning that the old printed code stops working
- [ ] verify `QR On/Off` toggles the per-table availability state correctly
- [ ] verify `Preview` opens the expected guest landing flow

### Incoming QR order behavior
- [ ] with `auto_accept_orders = false`, a paid QR order appears as an incoming QR order
- [ ] the QR order is labelled by `table_number`
- [ ] the QR order does not seize or flip the floor-plan dining/session state
- [ ] a staff-owned check at the same table remains unaffected
- [ ] multiple QR orders on the same table surface independently
- [ ] one-tap accept works from the POS incoming tray

### Guest alert bell behavior
- [ ] when there are zero open QR guest alerts, no bell is shown
- [ ] when a guest raises one alert, the bell appears with count `1`
- [ ] repeated guest raises do not create duplicate open alerts
- [ ] opening the bell/sheet shows table label, alert type, optional message, and age
- [ ] resolving the alert clears it from the POS surface
- [ ] resolving the alert is reflected in the shared state used by the other surfaces

### POS signoff rule
- [ ] only mark `QR-18`, `QR-18b`, or `QR-18c` complete after the POS owner confirms the tablet build under test actually contains those UI changes

## Notes About Checklists

If you need to literally cross out ticket checkboxes in Notion today, be strict:
- do not fully close ticket items just because code exists locally
- only close an item when its acceptance criteria are actually satisfied on staging
- for now, most items should stay open with status notes, not fake-complete
