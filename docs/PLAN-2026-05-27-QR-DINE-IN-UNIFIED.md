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
- [x] `create-online-order` was extended locally for QR-aware checkout / order binding in `supabase/functions/create-online-order/index.ts`
- [x] Merchant dashboard online-ordering settings now include QR fields locally in:
  - `app/dashboard/online-ordering/actions.ts`
  - `app/dashboard/online-ordering/hooks/useOnlineOrderingSettings.ts`
  - `app/dashboard/online-ordering/page.tsx`
- [x] Merchant dashboard QR manager actions + UI are now authored locally in:
  - `app/dashboard/online-ordering/actions.ts`
  - `app/dashboard/online-ordering/components/QrTableManager.tsx`
  - `app/dashboard/online-ordering/page.tsx`
- [x] Merchant dashboard fallback branding now uses brand blue `#0C4FD1` instead of the retired teal fallback in the online-ordering surface

## What Is Not Safe To Fully Check Off Yet

These are the places where work exists, but the ticket item is not yet defensibly complete.

- Wave 1 schema still needs explicit staging validation:
  - `get_advisors(security)`
  - RLS smoke check
  - anon no-direct-row-access verification
- Wave 2 migrations are authored locally but not yet confirmed applied on staging
- `create-online-order` QR patch is local code only until deployed and tested
- Merchant dashboard QR settings and QR manager are implemented locally, but QR billing gate, preview, export, and live-order integrations are still open
- Shared generate/reprint/regenerate is available in local code, but merchant preview/export still remains open

## Unified Ticket Status

| Item | Area | Status | Why it is in this state | Next step |
| --- | --- | --- | --- | --- |
| QR-1 | Backend | `staging_applied_needs_validation` | User reported Wave 1 migrations were run on staging; validation still missing | Run security advisors + RLS smoke test |
| QR-5 | Backend | `implemented_local_not_applied` | Vault-backed HMAC signing/verification migration is authored locally | Apply `20260527160000_qr_w2_token_helpers_generate_and_resolve.sql` on staging |
| QR-2 | Backend | `implemented_local_not_applied` | `resolve_table_qr(...)` is authored locally in the same migration | Apply `20260527160000_qr_w2_token_helpers_generate_and_resolve.sql` on staging |
| QR-4 | Backend | `implemented_local_not_applied` | Wave 2 migration exists locally | Apply `20260522133000_qr_w2_status_and_guest_alert_rpcs.sql` on staging |
| QR-24 | Backend | `blocked` | Depends on scan bootstrap + channel design | Implement after QR-2 contract is live |
| QR-2b | Backend | `implemented_local_not_applied` | Wave 2 migration exists locally | Apply `20260522133000_qr_w2_status_and_guest_alert_rpcs.sql` on staging |
| QR-19 | Backend / Billing | `not_started` | No QR service-catalog entry / gate rule implemented yet | Decide service code + enforce gate |
| QR-22 | Backend | `staging_applied_needs_validation` | Migration exists and was reportedly run; needs smoke check | Verify new rows default to `#0C4FD1` |
| QR-28 | Backend | `not_started` | Tables exist in migration, but retention policy is not implemented | Add retention plan + enforcement |
| QR-6 | Edge | `implemented_local_not_deployed` | QR-aware order creation is patched locally | Deploy edge function + stage test |
| QR-7 | Edge | `implemented_local_not_deployed` | Auto-accept wiring is patched locally | Deploy edge function + stage test |
| QR-9 | Edge / Analytics | `not_started` | No funnel stage emission yet | Emit `menu_viewed`, `cart_started`, `checkout`, `paid` |
| QR-25 | Edge / Receipt | `not_started` | Receipt trigger not wired for QR order success yet | Call existing receipt infra on paid QR order |
| QR-9c | Edge / Broadcast | `blocked` | Depends on QR-2b live on staging | Wire live alert emit + count fallback |
| QR-8 | Edge / Analytics | `not_started` | Abandoned-cart QR tagging not wired | Extend abandoned-cart sweep |
| QR-32 | Payments | `not_started` | No whitelist work recorded yet | Register QR storefront origins/custom domains |
| QR-26 | Storefront | `not_started` | Host/domain helper still hardcodes root-domain assumption | Fix `getStoreUrl()` + add QR route |
| QR-10 | Storefront | `blocked` | Depends on QR-2 | Build table-bound storefront mode |
| QR-11 | Storefront | `blocked` | Depends on QR-6 being deployed/tested | Build QR checkout UI |
| QR-12 | Storefront | `blocked` | Depends on QR-4 + QR-24 | Build live status screen |
| QR-13 | Storefront | `blocked` | Depends on QR-2 | Build closed/blocked/outside-hours screens |
| QR-33 | Storefront | `not_started` | Depends on QR-10 | Do accessibility + i18n pass |
| QR-12b | Storefront | `blocked` | Depends on QR-2b | Build guest `Call your server` button |
| QR-14 | Dashboard | `in_progress` | QR settings now exist locally in merchant online-ordering page, but tier gate and broader QR manager dependencies are still open | Ship/test current settings path, then add real gating |
| QR-15 | Dashboard | `in_progress` | Merchant QR code manager UI + actions are authored locally; preview/export still depends on the storefront route and template work | Apply shared generate/resolve migration, then smoke test dashboard generate/regenerate/revoke |
| QR-16 | Dashboard | `blocked` | Depends on QR-15 | Build print/download templates |
| QR-17 | Dashboard | `blocked` | Depends on QR-6 deployed/tested | Show QR badge in live orders |
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
- It intentionally does not claim preview/export is done yet. Those remain separate work items.

### What this dashboard slice does not solve yet
- billing/tier gate enforcement
- print/export templates
- live-orders QR badge
- analytics dashboard
- guest scan flow itself
- guest preview route itself

## Recommended Next Order From Here

1. Apply Wave 2 migrations on staging:
   - `supabase/migrations/20260522133000_qr_w2_status_and_guest_alert_rpcs.sql`
   - `supabase/migrations/20260527160000_qr_w2_token_helpers_generate_and_resolve.sql`
2. Deploy `create-online-order`
3. Smoke test dashboard QR generation/regeneration/revoke on staging
4. Smoke test QR-aware order creation on staging once a table-bound session can exist
5. Continue dashboard work in this order:
   - finish `QR-14` properly with gate awareness
   - then `QR-16`
   - then `QR-17`
   - then `QR-34`

## Immediate Commands / Actions Still Needed

### Staging DB
- Apply:
  - `supabase/migrations/20260522133000_qr_w2_status_and_guest_alert_rpcs.sql`
  - `supabase/migrations/20260527160000_qr_w2_token_helpers_generate_and_resolve.sql`
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
