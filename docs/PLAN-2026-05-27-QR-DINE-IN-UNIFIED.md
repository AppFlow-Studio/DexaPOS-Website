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

## What Is Not Safe To Fully Check Off Yet

These are the places where work exists, but the ticket item is not yet defensibly complete.

- Wave 1 schema still needs explicit staging validation:
  - `get_advisors(security)`
  - RLS smoke check
  - anon no-direct-row-access verification
- Wave 2 migrations are authored locally but not yet confirmed applied on staging
- `create-online-order` QR patch is local code only until deployed and tested
- Merchant dashboard QR settings and QR manager are implemented locally, but QR billing gate is only local until the new seed migration is applied and smoke tested; preview and live-order integrations are still open
- Shared generate/reprint/regenerate/export is available in local code, but the exact guest route still is not live, so downloaded assets are not safe to call finished until the scan flow is smoke tested end to end

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
| QR-9 | Edge / Analytics | `not_started` | No funnel stage emission yet | Emit `menu_viewed`, `cart_started`, `checkout`, `paid` |
| QR-25 | Edge / Receipt | `not_started` | Receipt trigger not wired for QR order success yet | Call existing receipt infra on paid QR order |
| QR-9c | Edge / Broadcast | `blocked` | Depends on QR-2b live on staging | Wire live alert emit + count fallback |
| QR-8 | Edge / Analytics | `not_started` | Abandoned-cart QR tagging not wired | Extend abandoned-cart sweep |
| QR-32 | Payments | `not_started` | No whitelist work recorded yet | Register QR storefront origins/custom domains |
| QR-26 | Storefront | `in_progress` | Shared URL builder now supports custom domains across merchant/HQ surfaces and the storefront path helper no longer hardcodes `dexaposai.com`; the actual `/s/{slug}/t/{token}` route still remains open | Finish route + scan-entry flow once `resolve_table_qr` is live |
| QR-10 | Storefront | `blocked` | Depends on QR-2 | Build table-bound storefront mode |
| QR-11 | Storefront | `blocked` | Depends on QR-6 being deployed/tested | Build QR checkout UI |
| QR-12 | Storefront | `blocked` | Depends on QR-4 + QR-24 | Build live status screen |
| QR-13 | Storefront | `blocked` | Depends on QR-2 | Build closed/blocked/outside-hours screens |
| QR-33 | Storefront | `not_started` | Depends on QR-10 | Do accessibility + i18n pass |
| QR-12b | Storefront | `blocked` | Depends on QR-2b | Build guest `Call your server` button |
| QR-14 | Dashboard | `in_progress` | QR settings now exist locally in merchant online-ordering page and the merchant surface respects the local QR billing gate; preview/export and broader QR manager dependencies are still open | Apply the QR gate seed migration, then smoke test locked vs entitled branches |
| QR-15 | Dashboard | `in_progress` | Merchant QR code manager UI + actions are authored locally; preview/export still depends on the storefront route and template work | Apply shared generate/resolve migration, then smoke test dashboard generate/regenerate/revoke |
| QR-16 | Dashboard | `in_progress` | Merchant QR manager now has local SVG / PNG / PDF tent export and print scaffolding, but the exact guest route still needs end-to-end validation | Smoke test generated assets against the live QR route once `resolve_table_qr` is applied |
| QR-17 | Dashboard | `in_progress` | Orders table/detail surfaces now render QR dine-in distinctly and can jump to the floor plan; live kanban-specific treatment still remains open if needed | Smoke test QR badges and floor-plan jump from real QR orders |
| QR-34 | Dashboard | `blocked` | Depends on QR-9 | Build analytics dashboard from `qr_scan_events` |
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
- This reuses the existing online-ordering maintenance surface instead of inventing a parallel QR settings page

### Merchant QR code manager
- Merchant dashboard now has a QR table manager under the same online-ordering surface
- It currently supports:
  - refresh snapshot
  - generate missing QR codes
  - generate/reprint per table
  - regenerate per table
  - revoke per table
  - grouped table status by zone
  - lifetime and 7-day scan visibility from existing QR tables/events
- It now also supports local asset actions per generated table:
  - download SVG
  - download PNG
  - download PDF table tent
  - open print-ready PDF tent
  - DEXA vs merchant text-branding mode for exported assets
- Generate/reprint/regenerate actions now also respect the same QR billing gate server-side
- It still does not claim exact guest preview is done yet. The exported URLs follow the shared store-host contract, but the final guest QR route must still be smoke tested end to end.

### What this dashboard slice does not solve yet
- live-orders QR badge
- analytics dashboard
- guest scan flow itself
- guest preview route itself

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
7. Continue dashboard work in this order:
   - finish `QR-14` properly with gate awareness
   - then `QR-16`
   - then `QR-17`
   - then `QR-34`

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
```

### HMAC / rotation follow-up
Current secret has been handed off and the migration expects:
- Vault secret name `qr_hmac_secret_current`
- Vault secret name `qr_hmac_secret_previous` for the dual-secret grace window

Still confirm operationally:
- whether previous secret should stay blank for now
- exact secret rotation procedure
- when `token_version` should be bumped on active printed codes

## Notes About Checklists

If you need to literally cross out ticket checkboxes in Notion today, be strict:
- do not fully close ticket items just because code exists locally
- only close an item when its acceptance criteria are actually satisfied on staging
- for now, most items should stay open with status notes, not fake-complete
